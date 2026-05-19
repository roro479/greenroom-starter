/**
 * Shareable settlement worksheet — read-only, no authentication required.
 *
 * Designed for the tour manager to open on their phone while loading out.
 * Shows only settlement-relevant data — no internal notes, no audit logs,
 * no confirmation metadata. Mobile-responsive at 375px.
 *
 * Data exposed: gross, fees, net, expense amounts/categories, math steps,
 * recoups, final total, GM approval status.
 * Data excluded: internalNotes, confirmationLogJson, user IDs.
 */

import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { getShowById } from "@/lib/queries";
import { formatMoney, formatShowDateFull } from "@/lib/format";
import { Logomark } from "@/components/brand/logo";
import type { WorksheetStep } from "@/lib/dealMath";
import type { Recoup } from "@/db/schema";

export default async function SharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getShowById(id);
  if (!data) notFound();

  const { show, artist, deal, settlement, extraction, recoups } = data;

  // Must have a confirmed worksheet
  const worksheetJson = settlement?.worksheetJson;
  const confirmedTermsJson = extraction?.confirmedTermsJson;

  if (!worksheetJson || !confirmedTermsJson) {
    return (
      <div className="min-h-screen bg-canvas px-6 py-12 max-w-lg mx-auto">
        <div className="text-center">
          <Logomark size={36} className="mx-auto mb-6" />
          <h1 className="font-display text-[24px] font-medium text-ink-900 mb-3" style={{ letterSpacing: "-0.02em" }}>
            Settlement not ready
          </h1>
          <p className="text-[13px] text-ink-500">
            The settlement worksheet for this show hasn&apos;t been completed yet. Check back after the show.
          </p>
        </div>
      </div>
    );
  }

  let steps: WorksheetStep[] = [];
  try {
    steps = JSON.parse(worksheetJson) as WorksheetStep[];
  } catch {
    notFound();
  }

  const total = steps[steps.length - 1]?.value ?? 0;
  const gross = settlement?.grossBoxOffice ?? 0;
  const net = settlement?.netBoxOffice ?? 0;

  const gmApprovedAt = settlement?.gmApprovedAt;

  const RECOUP_LABELS: Record<Recoup["category"], string> = {
    marketing: "Marketing",
    hospitality_overage: "Hospitality overage",
    production_overage: "Production overage",
    prior_advance: "Prior advance",
    damages: "Damages",
    other: "Other",
  };

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-lg mx-auto px-5 py-8">

        {/* Header */}
        <div className="mb-8">
          <Logomark size={28} className="mb-5" />
          <div className="text-[10px] text-ink-400 uppercase tracking-widest mb-2">
            Settlement statement
          </div>
          <h1
            className="font-display text-[32px] font-medium text-ink-900 leading-tight mb-1"
            style={{ letterSpacing: "-0.02em" }}
          >
            {artist?.name}
          </h1>
          <div className="text-[13px] text-ink-500">
            {formatShowDateFull(show.date)} · The Crescent, Nashville
          </div>
          {deal?.dealType && (
            <div className="mt-2 inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium bg-ink-100/60 text-ink-600 capitalize">
              {deal.dealType.replace(/_/g, " ")} deal
            </div>
          )}
        </div>

        {/* Hero total */}
        <div className="bg-brand-700 rounded-2xl px-6 py-8 mb-6 text-white">
          <div className="text-[11px] uppercase tracking-widest text-brand-200 mb-2">
            Total to artist
          </div>
          <div
            className="text-[56px] font-mono tabular font-bold leading-none"
            style={{ letterSpacing: "-0.03em" }}
          >
            {formatMoney(total)}
          </div>
          {gmApprovedAt && (
            <div className="mt-3 flex items-center gap-1.5 text-[11.5px] text-brand-200">
              <CheckCircle2 className="h-3.5 w-3.5" />
              GM approved{" "}
              {new Date(gmApprovedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </div>
          )}
          {settlement?.status === "paid" && (
            <div className="mt-2 text-[11px] text-brand-200 font-medium">Paid</div>
          )}
        </div>

        {/* Worksheet table */}
        <div className="bg-white rounded-xl ring-1 ring-ink-200/60 mb-6 overflow-hidden">
          <div className="px-5 py-4 border-b border-ink-100">
            <div className="text-[11px] font-semibold text-ink-900 uppercase tracking-wider">
              Settlement breakdown
            </div>
          </div>
          <div className="divide-y divide-ink-100/80 px-5">
            {steps.slice(0, -1).map((step, i) => {
              const isNeg = step.value < 0;
              return (
                <div key={i} className="py-3.5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-[13px] text-ink-700 leading-snug">
                        {step.label}
                      </div>
                      {step.formula && (
                        <div className="text-[11px] text-ink-400 mt-0.5 leading-snug">
                          {step.formula}
                        </div>
                      )}
                    </div>
                    <div
                      className={`text-[13px] font-mono tabular shrink-0 ${
                        isNeg ? "text-rose-700" : "text-ink-900"
                      }`}
                    >
                      {isNeg
                        ? `(${formatMoney(Math.abs(step.value))})`
                        : formatMoney(step.value)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-5 py-4 border-t border-ink-200/60 bg-ink-50/40">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-semibold text-ink-900">Total to artist</span>
              <span className="text-[18px] font-mono tabular font-semibold text-ink-900">
                {formatMoney(total)}
              </span>
            </div>
          </div>
        </div>

        {/* Recoups (if any) */}
        {recoups.length > 0 && (
          <div className="bg-white rounded-xl ring-1 ring-ink-200/60 mb-6 overflow-hidden">
            <div className="px-5 py-4 border-b border-ink-100">
              <div className="text-[11px] font-semibold text-ink-900 uppercase tracking-wider">
                Recoups
              </div>
            </div>
            <div className="divide-y divide-ink-100/80 px-5">
              {recoups.map((r) => (
                <div key={r.id} className="py-3.5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[13px] text-ink-700 leading-snug">{r.label}</div>
                    <div className="text-[11px] text-ink-400 mt-0.5">
                      {RECOUP_LABELS[r.category]} ·{" "}
                      <span
                        className={
                          r.status === "disputed"
                            ? "text-rose-600 font-medium"
                            : r.status === "withdrawn"
                              ? "text-ink-400"
                              : "text-brand-700"
                        }
                      >
                        {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                      </span>
                    </div>
                  </div>
                  <div className="text-[13px] font-mono tabular text-ink-900 shrink-0">
                    {formatMoney(r.amount)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary numbers */}
        <div className="bg-white rounded-xl ring-1 ring-ink-200/60 mb-8">
          <div className="divide-y divide-ink-100/80 px-5">
            <SummaryRow label="Gross box office" value={gross} />
            <SummaryRow label="Net box office" value={net} />
            <SummaryRow label="Total to artist" value={total} bold />
          </div>
        </div>

        {/* Footer */}
        <div className="pt-6 border-t border-ink-200/40 text-center">
          <div className="text-[11px] text-ink-400 mb-1">Generated by Greenroom</div>
          <div className="text-[10.5px] text-ink-300">
            This statement was generated from confirmed deal terms. For questions, contact the venue.
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: number;
  bold?: boolean;
}) {
  return (
    <div className="py-3 flex items-baseline justify-between px-0">
      <span className={`text-[13px] ${bold ? "font-semibold text-ink-900" : "text-ink-600"}`}>
        {label}
      </span>
      <span className={`text-[13.5px] font-mono tabular ${bold ? "font-semibold text-ink-900" : "text-ink-700"}`}>
        {formatMoney(value)}
      </span>
    </div>
  );
}
