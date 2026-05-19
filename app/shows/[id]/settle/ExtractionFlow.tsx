"use client";

/**
 * ExtractionFlow — 3-stage AI Settlement Worksheet client component.
 *
 * Stage 1: "Parse Deal" button + spinner
 * Stage 2: Editable confirmation form with source quotes, confidence warnings,
 *          and blocking for null isInsideExpenseCap
 * Stage 3: Redirect via router.refresh() to server-rendered worksheet
 *
 * Replaces the UnsupportedDeal empty state for vs, percentage_of_net, door deals.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Sparkles,
  Loader2,
  CheckCircle2,
  Edit3,
  FileWarning,
  RotateCcw,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import {
  extractTermsAction,
  confirmTermsAction,
} from "./actions";
import type { ExtractionResult, ConfirmedTerms, ConfirmationLogEntry } from "@/lib/extraction";

// -------- Types --------

interface Props {
  showId: string;
  dealId: string;
  extractionId: string | null;
  extractionJson: string | null;
  confirmedTermsJson: string | null;
  dealNotesFreetext: string | null;
  existingGuarantee: number | null;
  existingPercentage: number | null;
  existingExpenseCap: number | null;
  existingHospitalityCap: number | null;
  existingBonusesJson: string | null;
  dealType: string;
}

type Stage = "idle" | "extracting" | "error" | "confirming" | "saving";

// -------- Component --------

export default function ExtractionFlow({
  showId,
  dealId,
  extractionId: initialExtractionId,
  extractionJson: initialExtractionJson,
  confirmedTermsJson,
  dealNotesFreetext,
  existingGuarantee,
  existingPercentage,
  existingExpenseCap,
  existingHospitalityCap,
  existingBonusesJson,
  dealType,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // If already confirmed — the server page handles the worksheet render
  // This component shouldn't be shown, but just in case:
  if (confirmedTermsJson) return null;

  const [stage, setStage] = useState<Stage>(
    initialExtractionJson ? "confirming" : "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [extractionId, setExtractionId] = useState<string | null>(
    initialExtractionId,
  );
  const [extraction, setExtraction] = useState<ExtractionResult | null>(
    initialExtractionJson ? tryParse<ExtractionResult>(initialExtractionJson) : null,
  );
  const [fallbackToManual, setFallbackToManual] = useState(false);

  // ---- Stage 1: Parse Deal ----

  async function handleParse() {
    setStage("extracting");
    setError(null);

    const result = await extractTermsAction(showId);

    if (!result.ok) {
      setError(result.error);
      setFallbackToManual(true);
      setStage("error");
      return;
    }

    setExtractionId(result.extractionId);
    setExtraction(result.result);
    setFallbackToManual(result.fallbackToManual);
    setStage("confirming");
  }

  function handleRetry() {
    setStage("idle");
    setError(null);
    setExtraction(null);
  }

  function handleFallback() {
    setExtraction(emptyExtraction());
    setFallbackToManual(true);
    setStage("confirming");
  }

  if (stage === "idle" || stage === "extracting") {
    return (
      <Card accent="amber">
        <CardContent className="py-12 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 ring-1 ring-amber-200/80 mb-5">
            {stage === "extracting" ? (
              <Loader2 className="h-5 w-5 text-amber-700 animate-spin" />
            ) : (
              <Sparkles className="h-5 w-5 text-amber-700" />
            )}
          </div>
          <h2
            className="font-display text-[22px] font-medium text-ink-900 mb-2"
            style={{ letterSpacing: "-0.02em" }}
          >
            {stage === "extracting"
              ? "Reading your deal notes…"
              : "Let AI read the deal notes for you"}
          </h2>
          <p className="text-[13px] text-ink-500 max-w-md mx-auto leading-relaxed mb-6">
            {stage === "extracting"
              ? "Extracting deal terms from the free-text. This takes a few seconds."
              : `The deal notes for this ${dealType} deal contain the terms needed for settlement. Claude will extract them so you can confirm before running the math.`}
          </p>

          {dealNotesFreetext && (
            <div className="text-left max-w-lg mx-auto mb-6">
              <div className="text-[10px] text-ink-400 uppercase tracking-widest mb-2">
                Deal notes
              </div>
              <div className="text-[12.5px] text-ink-800 bg-canvas-soft rounded-lg p-4 ring-1 ring-ink-200/60 leading-relaxed">
                {dealNotesFreetext}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={handleParse}
              disabled={stage === "extracting"}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-700 text-white text-[13px] font-medium hover:bg-brand-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {stage === "extracting" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Parsing…
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Parse Deal
                </>
              )}
            </button>
            <button
              onClick={handleFallback}
              disabled={stage === "extracting"}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white text-ink-700 text-[13px] font-medium ring-1 ring-ink-200/80 hover:bg-canvas-soft disabled:opacity-60 transition-colors"
            >
              Enter manually
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (stage === "error") {
    return (
      <Card accent="rose">
        <CardContent className="py-12 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 ring-1 ring-rose-200/80 mb-5">
            <FileWarning className="h-5 w-5 text-rose-700" />
          </div>
          <h2 className="font-display text-[22px] font-medium text-ink-900 mb-2" style={{ letterSpacing: "-0.02em" }}>
            Couldn't parse the deal notes
          </h2>
          <p className="text-[13px] text-ink-500 max-w-md mx-auto leading-relaxed mb-2">
            {error}
          </p>
          <p className="text-[12px] text-ink-400 max-w-md mx-auto leading-relaxed mb-6">
            You can try again, or enter the deal terms manually.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={handleRetry}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white text-ink-700 text-[13px] font-medium ring-1 ring-ink-200/80 hover:bg-canvas-soft transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Try again
            </button>
            <button
              onClick={handleFallback}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-700 text-white text-[13px] font-medium hover:bg-brand-800 transition-colors"
            >
              Enter manually
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Stage: confirming
  return (
    <ConfirmationForm
      showId={showId}
      extractionId={extractionId ?? ""}
      extraction={extraction ?? emptyExtraction()}
      fallbackToManual={fallbackToManual}
      dealNotesFreetext={dealNotesFreetext}
      existingGuarantee={existingGuarantee}
      existingPercentage={existingPercentage}
      existingExpenseCap={existingExpenseCap}
      existingHospitalityCap={existingHospitalityCap}
      existingBonusesJson={existingBonusesJson}
      isSaving={stage === "saving"}
      onSaving={() => setStage("saving")}
      onReset={handleRetry}
      onDone={() => {
        startTransition(() => {
          router.refresh();
        });
      }}
    />
  );
}

// -------- Confirmation form --------

interface ConfirmationFormProps {
  showId: string;
  extractionId: string;
  extraction: ExtractionResult;
  fallbackToManual: boolean;
  dealNotesFreetext: string | null;
  existingGuarantee: number | null;
  existingPercentage: number | null;
  existingExpenseCap: number | null;
  existingHospitalityCap: number | null;
  existingBonusesJson: string | null;
  isSaving: boolean;
  onSaving: () => void;
  onReset: () => void;
  onDone: () => void;
}

function ConfirmationForm({
  showId,
  extractionId,
  extraction,
  fallbackToManual,
  dealNotesFreetext,
  existingGuarantee,
  existingPercentage,
  existingExpenseCap,
  existingHospitalityCap,
  existingBonusesJson,
  isSaving,
  onSaving,
  onReset,
  onDone,
}: ConfirmationFormProps) {
  const [guarantee, setGuarantee] = useState(
    String(extraction.guarantee ?? ""),
  );
  const [percentage, setPercentage] = useState(
    extraction.percentage != null
      ? String((extraction.percentage * 100).toFixed(0))
      : "",
  );
  const [percentageBasis, setPercentageBasis] = useState<"gross" | "net">(
    extraction.percentageBasis ?? "net",
  );
  const [expenseCap, setExpenseCap] = useState(
    String(extraction.expenseCap ?? ""),
  );
  const [hospitalityCap, setHospitalityCap] = useState(
    String(extraction.hospitalityCap ?? ""),
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  // Recoups with editable isInsideExpenseCap
  const [recoups, setRecoups] = useState<
    Array<{ label: string; amount: number; isInsideExpenseCap: boolean | null }>
  >(
    (extraction.recoups ?? []).map((r) => ({
      label: r.label,
      amount: r.amount,
      isInsideExpenseCap: r.isInsideExpenseCap,
    })),
  );

  // Contradiction checks
  const contradictions = detectContradictions(extraction, {
    guarantee: existingGuarantee,
    percentage: existingPercentage,
    expenseCap: existingExpenseCap,
    hospitalityCap: existingHospitalityCap,
    bonusesJson: existingBonusesJson,
  });

  // Block confirm if any recoup has null isInsideExpenseCap
  const hasAmbiguousRecoups = recoups.some((r) => r.isInsideExpenseCap === null);

  async function handleConfirm() {
    if (hasAmbiguousRecoups) return;

    onSaving();
    setSaveError(null);

    const confirmedTerms: ConfirmedTerms = {
      guarantee: guarantee ? parseFloat(guarantee) : null,
      percentage: percentage ? parseFloat(percentage) / 100 : null,
      percentageBasis,
      expenseCap: expenseCap ? parseFloat(expenseCap) : null,
      hospitalityCap: hospitalityCap ? parseFloat(hospitalityCap) : null,
      walkout: extraction.walkout,
      ratchetTiers: extraction.ratchetTiers,
      recoups: recoups.map((r) => ({
        label: r.label,
        amount: r.amount,
        isInsideExpenseCap: r.isInsideExpenseCap ?? false,
      })),
    };

    const editLog: ConfirmationLogEntry[] = buildEditLog(
      extraction,
      confirmedTerms,
      "user_mariana",
    );

    const result = await confirmTermsAction(
      showId,
      extractionId,
      confirmedTerms,
      editLog,
    );

    if (!result.ok) {
      setSaveError(result.error);
      return;
    }

    onDone();
  }

  const conf = extraction.confidence;
  const quotes = extraction.sourceQuotes;

  return (
    <div className="space-y-5">
      {/* Header */}
      <Card accent="brand">
        <CardHeader>
          <div>
            <CardTitle>
              {fallbackToManual ? "Enter deal terms" : "Confirm extracted deal terms"}
            </CardTitle>
            <CardDescription>
              {fallbackToManual
                ? "AI couldn't fully parse the deal notes. Enter the terms below — all fields are required before running settlement."
                : "Review each field. Source quotes show exactly where each value came from. Edit anything that looks wrong, then confirm to run the settlement math."}
            </CardDescription>
          </div>
          {!fallbackToManual && (
            <button
              onClick={onReset}
              className="shrink-0 inline-flex items-center gap-1.5 text-[11.5px] text-ink-400 hover:text-ink-900 transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              Re-parse
            </button>
          )}
        </CardHeader>

        {!fallbackToManual && dealNotesFreetext && (
          <CardContent className="pt-0 pb-5">
            <div className="text-[10px] text-ink-400 uppercase tracking-widest mb-2">
              Deal notes (source)
            </div>
            <div className="text-[12px] text-ink-700 bg-amber-50/60 rounded-lg p-3.5 ring-1 ring-amber-200/60 leading-relaxed">
              {dealNotesFreetext}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Contradiction warnings */}
      {contradictions.length > 0 && (
        <div className="rounded-lg border border-amber-200/60 bg-amber-50/40 p-4">
          <div className="flex gap-2.5 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
            <div className="text-[12.5px] font-semibold text-amber-800">
              {contradictions.length} discrepanc{contradictions.length === 1 ? "y" : "ies"} between deal notes and structured fields
            </div>
          </div>
          <div className="space-y-1.5 ml-6">
            {contradictions.map((c, i) => (
              <div key={i} className="text-[11.5px] text-ink-600">
                <span className="font-medium">{c.field}:</span>{" "}
                structured = <span className="font-mono">{c.structuredValue}</span>,{" "}
                extracted = <span className="font-mono">{c.extractedValue}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Core deal fields */}
      <Card>
        <CardHeader>
          <CardTitle>Core deal terms</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Guarantee */}
          <ExtractionField
            label="Guarantee ($)"
            value={guarantee}
            onChange={setGuarantee}
            confidence={conf.guarantee}
            sourceQuote={quotes.guarantee}
            inputMode="decimal"
            placeholder="e.g. 5000"
          />

          {/* Percentage */}
          <ExtractionField
            label="Artist percentage (%)"
            value={percentage}
            onChange={setPercentage}
            confidence={conf.percentage}
            sourceQuote={quotes.percentage}
            inputMode="decimal"
            placeholder="e.g. 80"
          />

          {/* Percentage basis */}
          <div>
            <div className="text-[11.5px] font-medium text-ink-700 mb-1.5">
              Percentage basis
            </div>
            <div className="flex gap-3">
              {(["net", "gross"] as const).map((b) => (
                <label key={b} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="percentageBasis"
                    value={b}
                    checked={percentageBasis === b}
                    onChange={() => setPercentageBasis(b)}
                    className="accent-brand-700"
                  />
                  <span className="text-[13px] text-ink-800 capitalize">{b}</span>
                </label>
              ))}
            </div>
            {quotes.percentageBasis && (
              <SourceQuote quote={quotes.percentageBasis} />
            )}
          </div>

          {/* Expense cap */}
          <ExtractionField
            label="Expense cap ($)"
            value={expenseCap}
            onChange={setExpenseCap}
            confidence={conf.expenseCap}
            sourceQuote={quotes.expenseCap}
            inputMode="decimal"
            placeholder="e.g. 2500"
          />

          {/* Hospitality cap */}
          <ExtractionField
            label="Hospitality cap ($)"
            value={hospitalityCap}
            onChange={setHospitalityCap}
            confidence={conf.hospitalityCap}
            sourceQuote={quotes.hospitalityCap}
            inputMode="decimal"
            placeholder="e.g. 500"
          />
        </CardContent>
      </Card>

      {/* Ratchet tiers (read-only display — extracted but not editable in v1) */}
      {extraction.ratchetTiers && extraction.ratchetTiers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Ratchet tiers (extracted)</CardTitle>
            <CardDescription>
              Percentage escalates based on ticket sell-through. Confirm the tiers are correct.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-ink-100/80">
            {extraction.ratchetTiers.map((tier, i) => (
              <div key={i} className="py-3 flex items-baseline justify-between gap-4">
                <div className="text-[13px] text-ink-600">
                  {(tier.fromTicketPct * 100).toFixed(0)}%
                  {tier.toTicketPct
                    ? `–${(tier.toTicketPct * 100).toFixed(0)}%`
                    : "+"}{" "}
                  capacity sold
                </div>
                <div className="text-[13.5px] font-mono tabular text-ink-900">
                  {(tier.percentage * 100).toFixed(0)}% to artist
                </div>
              </div>
            ))}
            {quotes.ratchetTiers && <SourceQuote quote={quotes.ratchetTiers} />}
          </CardContent>
        </Card>
      )}

      {/* Walkout pot */}
      {extraction.walkout && (
        <Card>
          <CardHeader>
            <CardTitle>Walkout pot (extracted)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-[13px] text-ink-700">
              {(extraction.walkout.artistPct * 100).toFixed(0)}% of{" "}
              {extraction.walkout.basis} above $
              {extraction.walkout.threshold.toLocaleString()}
            </div>
            {quotes.walkout && <SourceQuote quote={quotes.walkout} />}
          </CardContent>
        </Card>
      )}

      {/* Recoups — blocking if isInsideExpenseCap is null */}
      {recoups.length > 0 && (
        <Card accent={hasAmbiguousRecoups ? "rose" : undefined}>
          <CardHeader>
            <CardTitle>Recoups</CardTitle>
            <CardDescription>
              {hasAmbiguousRecoups ? (
                <span className="text-rose-700 font-medium">
                  You must specify whether each recoup is inside or outside the expense cap before confirming. This determines the settlement math.
                </span>
              ) : (
                "Confirm whether each recoup is counted inside the expense cap or deducted separately from gross."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-ink-100/80">
            {recoups.map((recoup, i) => (
              <div key={i} className="py-4">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <div className="text-[13px] font-medium text-ink-900">
                      {recoup.label}
                    </div>
                    <div className="text-[12px] text-ink-500 font-mono mt-0.5">
                      {formatMoney(recoup.amount)}
                    </div>
                  </div>
                  {recoup.isInsideExpenseCap === null && (
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-rose-700 shrink-0">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Required
                    </div>
                  )}
                </div>
                <div className="text-[11.5px] text-ink-500 mb-2">
                  Is this recoup inside or outside the expense cap?
                </div>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={`recoup_cap_${i}`}
                      checked={recoup.isInsideExpenseCap === true}
                      onChange={() =>
                        setRecoups((prev) =>
                          prev.map((r, j) =>
                            j === i ? { ...r, isInsideExpenseCap: true } : r,
                          ),
                        )
                      }
                      className="accent-brand-700"
                    />
                    <span className="text-[12.5px] text-ink-800">
                      Inside cap — counted within the $
                      {existingExpenseCap?.toLocaleString() ?? "cap"} limit
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={`recoup_cap_${i}`}
                      checked={recoup.isInsideExpenseCap === false}
                      onChange={() =>
                        setRecoups((prev) =>
                          prev.map((r, j) =>
                            j === i ? { ...r, isInsideExpenseCap: false } : r,
                          ),
                        )
                      }
                      className="accent-brand-700"
                    />
                    <span className="text-[12.5px] text-ink-800">
                      Outside cap — deducted from gross before net
                    </span>
                  </label>
                </div>
                {extraction.recoups?.[i]?.isInsideExpenseCap === null && (
                  <div className="mt-2 text-[11px] text-rose-600">
                    The deal notes were ambiguous on this recoup. You must make an explicit choice — the math differs significantly.
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {saveError && (
        <div className="rounded-lg border border-rose-200/60 bg-rose-50/40 p-4 text-[12.5px] text-rose-700">
          {saveError}
        </div>
      )}

      {/* Confirm button */}
      <div className="flex justify-end pt-2">
        <button
          onClick={handleConfirm}
          disabled={hasAmbiguousRecoups || isSaving}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-brand-700 text-white text-[13px] font-medium hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Running settlement…
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Confirm & Run Settlement
            </>
          )}
        </button>
      </div>
      {hasAmbiguousRecoups && (
        <p className="text-[11.5px] text-rose-600 text-right">
          Resolve all ambiguous recoups before confirming.
        </p>
      )}
    </div>
  );
}

// -------- Sub-components --------

function ExtractionField({
  label,
  value,
  onChange,
  confidence,
  sourceQuote,
  inputMode,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  confidence?: number;
  sourceQuote?: string;
  inputMode?: "decimal" | "text";
  placeholder?: string;
}) {
  const isLowConfidence = confidence !== undefined && confidence < 0.8;

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <label className="text-[11.5px] font-medium text-ink-700">{label}</label>
        {isLowConfidence && (
          <div className="flex items-center gap-1 text-[10.5px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md ring-1 ring-amber-200/60">
            <AlertTriangle className="h-2.5 w-2.5" />
            Low confidence
          </div>
        )}
        {value !== "" && !isLowConfidence && confidence !== undefined && confidence >= 0.8 && (
          <div className="flex items-center gap-1 text-[10.5px] text-brand-700">
            <Edit3 className="h-2.5 w-2.5" />
            Extracted
          </div>
        )}
      </div>
      <input
        type={inputMode === "decimal" ? "number" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-3 py-2 text-[13px] rounded-lg ring-1 bg-white text-ink-900 font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 transition-shadow ${
          isLowConfidence
            ? "ring-amber-300/80 focus:ring-amber-500"
            : "ring-ink-200/80"
        }`}
      />
      {sourceQuote && <SourceQuote quote={sourceQuote} />}
    </div>
  );
}

function SourceQuote({ quote }: { quote: string }) {
  return (
    <div className="mt-1.5 text-[11px] text-amber-700 bg-amber-50/60 rounded px-2.5 py-1.5 ring-1 ring-amber-200/40 leading-snug">
      <span className="font-medium">From notes:</span> &ldquo;{quote}&rdquo;
    </div>
  );
}

// -------- Contradiction detection --------

interface StructuredFields {
  guarantee: number | null;
  percentage: number | null;
  expenseCap: number | null;
  hospitalityCap: number | null;
  bonusesJson: string | null;
}

interface Contradiction {
  field: string;
  structuredValue: string;
  extractedValue: string;
}

function detectContradictions(
  extraction: ExtractionResult,
  structured: StructuredFields,
): Contradiction[] {
  const results: Contradiction[] = [];
  const TOLERANCE = 0.01;

  if (
    structured.guarantee !== null &&
    extraction.guarantee !== null &&
    Math.abs(structured.guarantee - extraction.guarantee) > TOLERANCE
  ) {
    results.push({
      field: "Guarantee",
      structuredValue: formatMoney(structured.guarantee),
      extractedValue: formatMoney(extraction.guarantee),
    });
  }

  if (
    structured.percentage !== null &&
    extraction.percentage !== null &&
    Math.abs(structured.percentage - extraction.percentage) > TOLERANCE
  ) {
    results.push({
      field: "Artist percentage",
      structuredValue: `${(structured.percentage * 100).toFixed(0)}%`,
      extractedValue: `${(extraction.percentage * 100).toFixed(0)}%`,
    });
  }

  if (
    structured.expenseCap !== null &&
    extraction.expenseCap !== null &&
    Math.abs(structured.expenseCap - extraction.expenseCap) > TOLERANCE
  ) {
    results.push({
      field: "Expense cap",
      structuredValue: formatMoney(structured.expenseCap),
      extractedValue: formatMoney(extraction.expenseCap),
    });
  }

  if (
    structured.hospitalityCap !== null &&
    extraction.hospitalityCap !== null &&
    Math.abs(structured.hospitalityCap - extraction.hospitalityCap) > TOLERANCE
  ) {
    results.push({
      field: "Hospitality cap",
      structuredValue: formatMoney(structured.hospitalityCap),
      extractedValue: formatMoney(extraction.hospitalityCap),
    });
  }

  // Bonus mismatch
  const structuredBonuses = tryParse<unknown[]>(structured.bonusesJson ?? "") ?? [];
  const hasStructuredBonuses = structuredBonuses.length > 0;
  const hasExtractedRatchets =
    extraction.ratchetTiers && extraction.ratchetTiers.length > 0;
  const hasExtractedWalkout = extraction.walkout != null;
  const hasExtractedBonuses = hasExtractedRatchets || hasExtractedWalkout;

  if (hasStructuredBonuses && !hasExtractedBonuses) {
    results.push({
      field: "Bonuses",
      structuredValue: `${structuredBonuses.length} structured bonus(es)`,
      extractedValue: "None found in deal notes",
    });
  } else if (!hasStructuredBonuses && hasExtractedBonuses) {
    results.push({
      field: "Bonuses",
      structuredValue: "None in structured fields",
      extractedValue: "Found ratchet/walkout in deal notes",
    });
  }

  return results;
}

// -------- Build edit log --------

function buildEditLog(
  extraction: ExtractionResult,
  confirmed: ConfirmedTerms,
  userId: string,
): ConfirmationLogEntry[] {
  const timestamp = new Date().toISOString();
  const log: ConfirmationLogEntry[] = [];

  const checks: Array<[string, unknown, unknown]> = [
    ["guarantee", extraction.guarantee, confirmed.guarantee],
    [
      "percentage",
      extraction.percentage,
      confirmed.percentage,
    ],
    ["percentageBasis", extraction.percentageBasis, confirmed.percentageBasis],
    ["expenseCap", extraction.expenseCap, confirmed.expenseCap],
    ["hospitalityCap", extraction.hospitalityCap, confirmed.hospitalityCap],
  ];

  for (const [field, original, final] of checks) {
    log.push({
      field,
      originalValue: original,
      confirmedValue: final,
      wasEdited: String(original) !== String(final),
      timestamp,
      userId,
    });
  }

  return log;
}

// -------- Helpers --------

function tryParse<T>(json: string | null | undefined): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function emptyExtraction(): ExtractionResult {
  return {
    guarantee: null,
    percentage: null,
    percentageBasis: null,
    expenseCap: null,
    hospitalityCap: null,
    walkout: null,
    ratchetTiers: null,
    recoups: null,
    confidence: {},
    sourceQuotes: {},
  };
}
