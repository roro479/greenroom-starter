/**
 * AI deal term extraction via the Anthropic Claude API.
 *
 * Sends the deal's dealNotesFreetext to Claude and gets back structured JSON
 * with extracted deal parameters, confidence scores, and source quotes.
 *
 * The extraction is intentionally conservative: when ambiguous, it returns
 * low confidence or null rather than guessing. Mariana reviews every field
 * before it feeds into settlement math.
 */

import Anthropic from "@anthropic-ai/sdk";

// -------- Types --------

export interface RatchetTier {
  fromTicketPct: number;
  toTicketPct: number | null;
  percentage: number;
}

export interface WalkoutPot {
  threshold: number;
  basis: "gross" | "net";
  artistPct: number;
}

export interface ExtractedRecoup {
  label: string;
  amount: number;
  isInsideExpenseCap: boolean | null;
}

export interface ExtractionResult {
  guarantee: number | null;
  percentage: number | null;
  percentageBasis: "gross" | "net" | null;
  expenseCap: number | null;
  hospitalityCap: number | null;
  walkout: WalkoutPot | null;
  ratchetTiers: RatchetTier[] | null;
  recoups: ExtractedRecoup[] | null;
  confidence: Record<string, number>;
  sourceQuotes: Record<string, string>;
}

export type ExtractionResponse =
  | { ok: true; result: ExtractionResult; fallbackToManual: false }
  | { ok: true; result: ExtractionResult; fallbackToManual: true }
  | { ok: false; error: string; fallbackToManual: true };

// -------- System prompt --------

const SYSTEM_PROMPT = `You are a music venue settlement assistant. Extract structured deal terms from a booking deal note written by a venue booker. The note is informal prose and may use industry shorthand.

Return ONLY valid JSON. No preamble. No explanation. No markdown fences.

Schema:
{
  "guarantee": number | null,
  "percentage": number | null,
  "percentageBasis": "gross" | "net" | null,
  "expenseCap": number | null,
  "hospitalityCap": number | null,
  "walkout": {
    "threshold": number,
    "basis": "gross" | "net",
    "artistPct": number
  } | null,
  "ratchetTiers": [
    {
      "fromTicketPct": number,
      "toTicketPct": number | null,
      "percentage": number
    }
  ] | null,
  "recoups": [
    {
      "label": string,
      "amount": number,
      "isInsideExpenseCap": boolean | null
    }
  ] | null,
  "confidence": { "<fieldName>": number },
  "sourceQuotes": { "<fieldName>": "<exact substring from input>" }
}

Notes on the schema:
- "percentage" is a decimal: 0.85 means 85% to the artist
- "confidence" is 0.0–1.0 per field. Set to 0.4 or lower if the field is ambiguous.
- "sourceQuotes" must be an exact substring from the input text, not a paraphrase
- If "isInsideExpenseCap" for a recoup is unclear from the text, set it to null — do not guess

Industry shorthand glossary:
- "vs" = guarantee vs percentage, whichever is greater
- "85/15" or "80/20" = artist gets the first number (85% or 80% of net or gross)
- "g'tee" or "gtee" = guarantee
- "net" = gross box office minus ticket platform fees and allowable expenses
- "gross" = gross box office before any deductions
- "walkout pot" = all gross above a threshold goes 100% to the artist
- "ratchets to X% over Y% capacity" = if tickets sold ÷ venue capacity >= Y%, use X% instead of the base percentage
- "expenses to $X" or "expenses capped $X" or "exp cap $X" = expenseCap is $X
- "hosp $X" or "hospitality cap $X" or "hosp cap $X" = hospitalityCap is $X
- "recoup" = a specific cost deducted from the settlement, may or may not be inside the expense cap`;

// -------- Core extraction function --------

export async function extractDealTerms(
  dealNotesFreetext: string,
): Promise<ExtractionResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error:
        "ANTHROPIC_API_KEY is not configured. Add it to your .env.local file.",
      fallbackToManual: true,
    };
  }

  const client = new Anthropic({ apiKey });

  let rawText: string;
  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: dealNotesFreetext }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return {
        ok: false,
        error: "The AI returned an unexpected response format. Try again.",
        fallbackToManual: true,
      };
    }
    rawText = textBlock.text.trim();
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Network error connecting to AI service.";
    return { ok: false, error: message, fallbackToManual: true };
  }

  // Parse the JSON — handle partial results gracefully
  let parsed: Partial<ExtractionResult>;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    // Total parse failure — fall through to manual
    return {
      ok: false,
      error:
        "The AI returned a response that couldn't be parsed. You can enter the deal terms manually.",
      fallbackToManual: true,
    };
  }

  // Build a complete result — fill missing fields with null / empty
  const result: ExtractionResult = {
    guarantee: parsed.guarantee ?? null,
    percentage: parsed.percentage ?? null,
    percentageBasis: parsed.percentageBasis ?? null,
    expenseCap: parsed.expenseCap ?? null,
    hospitalityCap: parsed.hospitalityCap ?? null,
    walkout: parsed.walkout ?? null,
    ratchetTiers: parsed.ratchetTiers ?? null,
    recoups: parsed.recoups ?? null,
    confidence: parsed.confidence ?? {},
    sourceQuotes: parsed.sourceQuotes ?? {},
  };

  // Determine if this is a partial extraction (some required fields missing)
  const coreFields = ["guarantee", "percentage", "percentageBasis"];
  const missingCore = coreFields.filter(
    (f) => result[f as keyof ExtractionResult] === null && !result.confidence[f],
  );

  // Fill in zero confidence for any field that was returned null
  for (const field of coreFields) {
    if (result[field as keyof ExtractionResult] === null && !(field in result.confidence)) {
      result.confidence[field] = 0;
    }
  }

  const fallbackToManual = missingCore.length >= 2;

  return { ok: true, result, fallbackToManual };
}

// -------- Confirmed terms type (post-Mariana-review) --------

export interface ConfirmedRecoup {
  label: string;
  amount: number;
  isInsideExpenseCap: boolean; // never null after confirmation
}

export interface ConfirmedTerms {
  guarantee: number | null;
  percentage: number | null;
  percentageBasis: "gross" | "net" | null;
  expenseCap: number | null;
  hospitalityCap: number | null;
  walkout: WalkoutPot | null;
  ratchetTiers: RatchetTier[] | null;
  recoups: ConfirmedRecoup[] | null;
}

export interface ConfirmationLogEntry {
  field: string;
  originalValue: unknown;
  confirmedValue: unknown;
  wasEdited: boolean;
  timestamp: string;
  userId: string;
}
