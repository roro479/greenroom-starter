# Greenroom AI Settlement Worksheet — Implementation Plan

## What was built

An end-to-end AI Settlement Worksheet replacing the "deal type not supported" empty state for `vs`, `percentage_of_net`, and `door` deals. The flow is three stages:

1. **AI extraction** — Claude reads `dealNotesFreetext` and returns structured JSON with confidence scores and source quotes per field.
2. **Human confirmation** — Mariana reviews an editable form, resolves any ambiguous terms (including the Coastal Spell recoup pattern), and explicitly confirms before math runs.
3. **Deterministic worksheet** — Server-side math generates a step-by-step breakdown, persisted to `settlements.worksheetJson`. A shareable link, PDF export, and GM approval flow complete the loop.

## Key files

| File | Purpose |
|------|---------|
| `lib/extraction.ts` | Anthropic API call, typed `ExtractionResult`, `ConfirmedTerms`, `ConfirmationLogEntry` types |
| `lib/dealMath.ts` | Extended with `calculateVsDeal()`, `calculatePercentageOfNet()`, `calculateDoorDeal()`, `WorksheetStep` type |
| `lib/dealMath.test.ts` | 9 unit tests covering 6 required deal structures |
| `lib/queries.ts` | Extended with `dealExtractions` join in `getShowById`, `getExtractionByDealId()` |
| `db/schema.ts` | Added `dealExtractions` table; added `worksheetJson`, `gmApprovedAt`, `gmApprovedByUserId` to `settlements` |
| `db/migrations/0001_tan_puma.sql` | Auto-generated migration from `npx drizzle-kit generate` |
| `app/shows/[id]/settle/actions.ts` | `extractTermsAction`, `confirmTermsAction`, `approveSettlementAction` server actions |
| `app/shows/[id]/settle/ExtractionFlow.tsx` | `"use client"` 3-stage component |
| `app/shows/[id]/settle/GmApproveButton.tsx` | `"use client"` GM approval button |
| `app/shows/[id]/settle/page.tsx` | Modified to route vs/net/door deals through the AI flow |
| `app/shows/[id]/settle/share/page.tsx` | Read-only shareable link (no auth, mobile-responsive) |
| `app/shows/[id]/settle/pdf/route.ts` | PDF generation via `@react-pdf/renderer` (Node.js runtime) |

## Extraction prompt structure

The system prompt in `lib/extraction.ts` uses the schema defined in the master prompt:

- **Temperature 0** — deterministic parsing, no creative hallucination
- **max_tokens 1000** — sufficient for JSON output without runaway generation
- **Industry shorthand glossary** — `g'tee`, `vs`, `ratchets to X%`, `walkout pot`, etc.
- **Confidence scoring** — 0.0–1.0 per field; fields set to 0.4 or below if ambiguous
- **Source quotes** — exact substrings from input, not paraphrases (auditable)

**Error handling** (per Correction 2):
- API failure → structured error, "Try again" button, never broken spinner
- JSON parse failure → partial extraction: populate what returned, mark missing at confidence 0
- `fallbackToManual` flag → all-blank form for fully manual entry when LLM cannot parse

## Math engine edge cases

### Ratchet tiers
`resolveRatchetPct()` evaluates `ticketsSold / venueCapacity` against each tier's `fromTicketPct`, sorts descending, picks the first matching tier. If no tier matches, falls back to the base (lowest) tier. Tested in TC3 (triggers) and TC4 (does not trigger).

### Walkout pot
Evaluated after the vs comparison. `(basisAmount - threshold) × artistPct` is added on top of the vs base only if `basisAmount > threshold`. The basis can be gross or net per the deal terms. Tested in TC5.

### Ambiguous recoups (the Coastal Spell pattern)
- `isInsideExpenseCap = true` → counted within the expense cap (reduces cap headroom; excess absorbed by venue)
- `isInsideExpenseCap = false` → deducted from gross before net is computed

TC6a/TC6b prove these yield materially different payouts when total pass-through expenses + recoup exceed the cap. The confirmation UI blocks the submit button until every null `isInsideExpenseCap` has an explicit selection.

### `worksheetJson` persistence timing
Written during `confirmTermsAction` — math runs and the result is persisted in a single server action. The share page and settle page both read this persisted JSON, guaranteeing identical numbers across views.

## What was intentionally omitted

- Pre-show risk flagging (Phase 3 — requires this infrastructure as a prerequisite)
- Deal intake or `dealNotesFreetext` editing (leave deal creation exactly as-is per spec)
- Authentication for the share link (tour managers don't have Greenroom accounts)
- Re-running math on every page render (persisted `worksheetJson` prevents drift)
- Automatic resolution of ambiguous terms (surfaces as explicit choices instead)
- Renegotiation of the extraction prompt on every load (one-time parse, Mariana can re-parse if needed)

## Known limitations

- **LLM accuracy** — tested against synthetic data patterns; real-world deal notes may use shorthand not in the glossary. The confidence scoring and manual fallback are the mitigation.
- **User ID** — hardcoded to `user_mariana` / `user_marcus` (prototype — no session management).
- **Race conditions** — no optimistic locking on the `deal_extractions` upsert (single-user prototype).
- **Ratchet tier editing** — ratchet tiers and walkout pots are displayed read-only in the confirmation form; editing requires re-parsing. Production would add inline editing.
- **PDF rendering** — `@react-pdf/renderer` uses a subset of CSS; complex layouts can drift. Tested basic rendering; not tested at all breakpoints.
