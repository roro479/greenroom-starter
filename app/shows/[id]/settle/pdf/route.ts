/**
 * PDF export route for the AI Settlement Worksheet.
 *
 * Generates a clean, printable settlement statement from the persisted
 * worksheetJson. Uses @react-pdf/renderer.
 *
 * IMPORTANT: Must use Node.js runtime — @react-pdf/renderer does not run
 * in the Next.js Edge Runtime.
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import { getShowById } from "@/lib/queries";
import { formatMoney, formatShowDateFull } from "@/lib/format";
import type { WorksheetStep } from "@/lib/dealMath";
import type { Recoup } from "@/db/schema";

// -------- Styles --------

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1a1a1a",
    padding: 48,
    backgroundColor: "#ffffff",
  },
  header: {
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
  },
  brand: {
    fontSize: 7,
    letterSpacing: 2,
    color: "#6b7280",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  title: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 10,
    color: "#6b7280",
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#6b7280",
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f3f4f6",
  },
  rowLabel: {
    color: "#374151",
    flex: 1,
    paddingRight: 12,
  },
  rowFormula: {
    color: "#9ca3af",
    fontSize: 8,
    marginTop: 1,
  },
  rowValue: {
    fontFamily: "Helvetica",
    color: "#111827",
    textAlign: "right",
    minWidth: 80,
  },
  rowValueNeg: {
    color: "#dc2626",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingTop: 10,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
  },
  totalValue: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
  },
  heroBox: {
    backgroundColor: "#1b5e3b",
    borderRadius: 8,
    padding: 20,
    marginBottom: 24,
  },
  heroLabel: {
    fontSize: 8,
    color: "#a7f3d0",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  heroValue: {
    fontSize: 32,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
  },
  heroSub: {
    fontSize: 9,
    color: "#a7f3d0",
    marginTop: 6,
  },
  footer: {
    position: "absolute",
    bottom: 36,
    left: 48,
    right: 48,
    borderTopWidth: 0.5,
    borderTopColor: "#e5e5e5",
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 7,
    color: "#9ca3af",
  },
  recoupRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f3f4f6",
  },
  recoupLabel: {
    color: "#374151",
    flex: 1,
  },
  recoupCategory: {
    color: "#9ca3af",
    fontSize: 8,
    marginTop: 1,
  },
  recoupStatus: {
    fontSize: 8,
  },
  recoupValue: {
    color: "#111827",
    minWidth: 80,
    textAlign: "right",
  },
  gmBadge: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  gmText: {
    fontSize: 9,
    color: "#a7f3d0",
  },
});

const RECOUP_LABELS: Record<Recoup["category"], string> = {
  marketing: "Marketing",
  hospitality_overage: "Hospitality overage",
  production_overage: "Production overage",
  prior_advance: "Prior advance",
  damages: "Damages",
  other: "Other",
};

// -------- PDF Document --------

function SettlementPDF({
  artistName,
  showDate,
  dealType,
  steps,
  recoups,
  total,
  gross,
  net,
  gmApprovedAt,
}: {
  artistName: string;
  showDate: string;
  dealType: string;
  steps: WorksheetStep[];
  recoups: Recoup[];
  total: number;
  gross: number;
  net: number;
  gmApprovedAt: Date | null;
}) {
  const generatedAt = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return React.createElement(
    Document,
    {},
    React.createElement(
      Page,
      { size: "LETTER", style: styles.page },

      // Header
      React.createElement(
        View,
        { style: styles.header },
        React.createElement(Text, { style: styles.brand }, "Greenroom · Settlement Statement"),
        React.createElement(Text, { style: styles.title }, artistName),
        React.createElement(
          Text,
          { style: styles.subtitle },
          `${formatShowDateFull(showDate)} · The Crescent, Nashville · ${dealType.replace(/_/g, " ")} deal`,
        ),
      ),

      // Hero total
      React.createElement(
        View,
        { style: styles.heroBox },
        React.createElement(Text, { style: styles.heroLabel }, "Total to artist"),
        React.createElement(Text, { style: styles.heroValue }, formatMoney(total)),
        gmApprovedAt &&
          React.createElement(
            Text,
            { style: styles.heroSub },
            `GM approved ${gmApprovedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
          ),
      ),

      // Worksheet
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, "Settlement breakdown"),
        ...steps.slice(0, -1).map((step, i) => {
          const isNeg = step.value < 0;
          return React.createElement(
            View,
            { key: i, style: styles.row },
            React.createElement(
              View,
              { style: { flex: 1, paddingRight: 12 } },
              React.createElement(Text, { style: styles.rowLabel }, step.label),
              step.formula &&
                React.createElement(Text, { style: styles.rowFormula }, step.formula),
            ),
            React.createElement(
              Text,
              { style: [styles.rowValue, isNeg ? styles.rowValueNeg : {}] },
              isNeg
                ? `(${formatMoney(Math.abs(step.value))})`
                : formatMoney(step.value),
            ),
          );
        }),
        React.createElement(
          View,
          { style: styles.totalRow },
          React.createElement(Text, { style: styles.totalLabel }, "Total to artist"),
          React.createElement(Text, { style: styles.totalValue }, formatMoney(total)),
        ),
      ),

      // Recoups
      recoups.length > 0 &&
        React.createElement(
          View,
          { style: styles.section },
          React.createElement(Text, { style: styles.sectionTitle }, "Recoups"),
          ...recoups.map((r, i) =>
            React.createElement(
              View,
              { key: i, style: styles.recoupRow },
              React.createElement(
                View,
                { style: { flex: 1, paddingRight: 12 } },
                React.createElement(Text, { style: styles.recoupLabel }, r.label),
                React.createElement(
                  Text,
                  { style: styles.recoupCategory },
                  `${RECOUP_LABELS[r.category]} · ${r.status}`,
                ),
              ),
              React.createElement(
                Text,
                { style: styles.recoupValue },
                formatMoney(r.amount),
              ),
            ),
          ),
        ),

      // Summary
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, "Summary"),
        React.createElement(
          View,
          { style: styles.row },
          React.createElement(Text, { style: styles.rowLabel }, "Gross box office"),
          React.createElement(Text, { style: styles.rowValue }, formatMoney(gross)),
        ),
        React.createElement(
          View,
          { style: styles.row },
          React.createElement(Text, { style: styles.rowLabel }, "Net box office"),
          React.createElement(Text, { style: styles.rowValue }, formatMoney(net)),
        ),
        React.createElement(
          View,
          { style: styles.totalRow },
          React.createElement(Text, { style: styles.totalLabel }, "Total to artist"),
          React.createElement(Text, { style: styles.totalValue }, formatMoney(total)),
        ),
      ),

      // Footer
      React.createElement(
        View,
        { style: styles.footer, fixed: true },
        React.createElement(
          Text,
          { style: styles.footerText },
          `Generated by Greenroom · ${generatedAt}`,
        ),
        React.createElement(
          Text,
          { style: styles.footerText },
          "AI-assisted settlement — terms confirmed by booker",
        ),
      ),
    ),
  );
}

// -------- Route handler --------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const data = await getShowById(id);

  if (!data) {
    return new NextResponse("Show not found", { status: 404 });
  }

  const { show, artist, settlement, extraction, recoups, deal } = data;

  const worksheetJson = settlement?.worksheetJson;
  const confirmedTermsJson = extraction?.confirmedTermsJson;

  if (!worksheetJson || !confirmedTermsJson) {
    return new NextResponse("Settlement worksheet not available yet", { status: 404 });
  }

  let steps: WorksheetStep[];
  try {
    steps = JSON.parse(worksheetJson) as WorksheetStep[];
  } catch {
    return new NextResponse("Invalid worksheet data", { status: 500 });
  }

  const total = steps[steps.length - 1]?.value ?? 0;
  const gross = settlement?.grossBoxOffice ?? 0;
  const net = settlement?.netBoxOffice ?? 0;
  const gmApprovedAt = settlement?.gmApprovedAt ?? null;

  const pdfElement = SettlementPDF({
    artistName: artist?.name ?? "Unknown Artist",
    showDate: show.date,
    dealType: deal?.dealType ?? "vs",
    steps,
    recoups,
    total,
    gross,
    net,
    gmApprovedAt,
  }) as React.ReactElement<DocumentProps>;

  const pdfBuffer = await renderToBuffer(pdfElement);

  const artistSlug = (artist?.name ?? "settlement")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  const dateSlug = show.date.replace(/-/g, "");

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="settlement-${artistSlug}-${dateSlug}.pdf"`,
    },
  });
}
