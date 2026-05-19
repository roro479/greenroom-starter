/**
 * Deal calculation logic for the in-app settlement tool.
 *
 * IMPORTANT — DELIBERATELY INCOMPLETE.
 *
 * This is the existing Greenroom settlement engine. It was built early in
 * the company's life, when most deals were flat guarantees. It currently
 * handles two deal types end-to-end:
 *
 *   1. flat                 — $X guaranteed, optional sellout bonus
 *   2. percentage_of_gross  — X% of gross, no expense deductions, optional sellout bonus
 *
 * For both, it reads `bonusesJson` and applies bonuses where it can — but
 * only the structured ones. Bonuses that exist only in `dealNotesFreetext`
 * are invisible to this engine.
 *
 * It does NOT handle:
 *
 *   - vs deals (guarantee vs % of net, whichever greater)
 *   - percentage_of_net deals (with expense deductions)
 *   - door deals
 *   - recoups (those flow separately through the settlement record)
 *   - tier ratchets (would need vs-deal support first)
 *   - comps that count toward gross
 *
 * For unsupported deals, the tool returns { supported: false } and the UI
 * shows the "this deal type isn't yet supported" empty state. About 82% of
 * Greenroom's customers default to spreadsheets because of this.
 */

import type { Deal, Expense, TicketSale, Bonus } from "@/db/schema";
import type {
  ConfirmedTerms,
  ConfirmedRecoup,
  RatchetTier,
  WalkoutPot,
} from "@/lib/extraction";

export type SettlementCalculation =
  | {
      supported: true;
      grossBoxOffice: number;
      netBoxOffice: number;
      totalExpenses: number;
      totalToArtist: number;
      steps: { label: string; value: number; note?: string }[];
      finalFormula: string;
      // Bonuses that were applied. Empty array if no bonuses on the deal,
      // or if no bonuses triggered.
      bonusesApplied: { label: string; amount: number; reason: string }[];
      // Bonuses that exist on the deal but didn't trigger (helpful context).
      bonusesNotTriggered: { label: string; amount: number; reason: string }[];
    }
  | {
      supported: false;
      reason: string;
      dealType: Deal["dealType"];
    };

interface CalcInput {
  deal: Deal;
  ticketSales: TicketSale[];
  expenses: Expense[];
  // Capacity is needed to evaluate sellout bonuses. Optional — if omitted,
  // sellout bonuses are reported as "can't determine".
  venueCapacity?: number;
  ticketsSold?: number;
}

export function parseBonuses(deal: Deal): Bonus[] {
  if (!deal.bonusesJson) return [];
  try {
    const parsed = JSON.parse(deal.bonusesJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function calculateSettlement(input: CalcInput): SettlementCalculation {
  const { deal, ticketSales, expenses, venueCapacity, ticketsSold } = input;

  const grossBoxOffice = ticketSales.reduce((sum, t) => sum + t.gross, 0);
  const totalFees = ticketSales.reduce((sum, t) => sum + t.fees, 0);
  const netBoxOffice = grossBoxOffice - totalFees;
  const totalExpenses = expenses
    .filter((e) => !e.absorbedByVenue)
    .reduce((sum, e) => sum + e.amount, 0);

  const tickets =
    ticketsSold ?? ticketSales.reduce((sum, t) => sum + (t.qty ?? 0), 0);

  // ---------- flat guarantee ----------
  if (deal.dealType === "flat") {
    if (deal.guaranteeAmount == null) {
      return {
        supported: false,
        reason: "Flat deal is missing a guarantee amount.",
        dealType: deal.dealType,
      };
    }
    const bonusResult = applyBonuses(parseBonuses(deal), {
      gross: grossBoxOffice,
      tickets,
      capacity: venueCapacity,
    });

    return {
      supported: true,
      grossBoxOffice,
      netBoxOffice,
      totalExpenses,
      totalToArtist: deal.guaranteeAmount + bonusResult.totalApplied,
      steps: [
        {
          label: "Flat guarantee",
          value: deal.guaranteeAmount,
          note: "No expense deductions. The guarantee is the floor.",
        },
        ...bonusResult.applied.map((b) => ({
          label: b.label,
          value: b.amount,
          note: b.reason,
        })),
      ],
      finalFormula: bonusResult.applied.length
        ? `flat ${deal.guaranteeAmount} + bonuses ${bonusResult.totalApplied} = ${(deal.guaranteeAmount + bonusResult.totalApplied).toFixed(2)}`
        : `flat guarantee = ${deal.guaranteeAmount}`,
      bonusesApplied: bonusResult.applied,
      bonusesNotTriggered: bonusResult.notTriggered,
    };
  }

  // ---------- percentage of gross ----------
  if (deal.dealType === "percentage_of_gross") {
    if (deal.percentage == null) {
      return {
        supported: false,
        reason: "Percentage-of-gross deal is missing a percentage.",
        dealType: deal.dealType,
      };
    }
    const payout = grossBoxOffice * deal.percentage;
    const bonusResult = applyBonuses(parseBonuses(deal), {
      gross: grossBoxOffice,
      tickets,
      capacity: venueCapacity,
    });

    return {
      supported: true,
      grossBoxOffice,
      netBoxOffice,
      totalExpenses,
      totalToArtist: payout + bonusResult.totalApplied,
      steps: [
        { label: "Gross box office", value: grossBoxOffice },
        {
          label: `× ${(deal.percentage * 100).toFixed(0)}%`,
          value: payout,
          note: "Percentage of gross — no expense deductions.",
        },
        ...bonusResult.applied.map((b) => ({
          label: b.label,
          value: b.amount,
          note: b.reason,
        })),
      ],
      finalFormula: bonusResult.applied.length
        ? `gross × ${deal.percentage} + bonuses = ${(payout + bonusResult.totalApplied).toFixed(2)}`
        : `gross × ${deal.percentage} = ${payout.toFixed(2)}`,
      bonusesApplied: bonusResult.applied,
      bonusesNotTriggered: bonusResult.notTriggered,
    };
  }

  // ---------- everything else: not supported ----------
  const friendlyName: Record<Deal["dealType"], string> = {
    flat: "Flat guarantee",
    percentage_of_gross: "Percentage of gross",
    percentage_of_net: "Percentage of net",
    vs: "Vs deal (guarantee vs %)",
    door: "Door deal",
  };

  return {
    supported: false,
    dealType: deal.dealType,
    reason:
      `${friendlyName[deal.dealType]} deals aren't supported in the in-app tool yet. ` +
      `Power users at venues like The Crescent default to spreadsheets for these.`,
  };
}

// ============================================================
// NEW: AI-assisted deal type calculations (vs, % of net, door)
// ============================================================

/**
 * Extended step type for AI-assisted worksheet — each step carries a formula
 * string and a sourceRef so every number is traceable back to a deal term.
 */
export type WorksheetStep = {
  label: string;
  value: number;
  formula: string;
  sourceRef: string;
};

export type WorksheetCalculation =
  | {
      supported: true;
      grossBoxOffice: number;
      platformFees: number;
      netBoxOffice: number;
      cappedExpenses: number;
      totalToArtist: number;
      guaranteeSide: number | null;
      percentageSide: number | null;
      activePercentage: number | null;
      winSide: "guarantee" | "percentage" | null;
      steps: WorksheetStep[];
    }
  | { supported: false; reason: string };

interface AiCalcInput {
  confirmedTerms: ConfirmedTerms;
  ticketSales: TicketSale[];
  expenses: Expense[];
  venueCapacity: number;
}

function sumGross(sales: TicketSale[]) {
  return sales.reduce((s, t) => s + t.gross, 0);
}
function sumFees(sales: TicketSale[]) {
  return sales.reduce((s, t) => s + t.fees, 0);
}
function sumPassThru(exps: Expense[]) {
  return exps.filter((e) => !e.absorbedByVenue).reduce((s, e) => s + e.amount, 0);
}
function ticketsSold(sales: TicketSale[]) {
  return sales.reduce((s, t) => s + (t.qty ?? 0), 0);
}

/**
 * Find the active percentage for a ratchet deal.
 * Ratchets are evaluated against tickets sold / venue capacity.
 */
function resolveRatchetPct(
  tiers: RatchetTier[],
  sold: number,
  capacity: number,
): { pct: number; tierLabel: string } {
  const fillRate = capacity > 0 ? sold / capacity : 0;
  const sorted = [...tiers].sort((a, b) => b.fromTicketPct - a.fromTicketPct);
  for (const tier of sorted) {
    if (fillRate >= tier.fromTicketPct) {
      const pctLabel = `${(tier.percentage * 100).toFixed(0)}%`;
      const fillLabel = `${(fillRate * 100).toFixed(0)}% sold ≥ ${(tier.fromTicketPct * 100).toFixed(0)}% threshold`;
      return { pct: tier.percentage, tierLabel: `${pctLabel} (${fillLabel})` };
    }
  }
  const base = sorted[sorted.length - 1];
  return {
    pct: base?.percentage ?? 0,
    tierLabel: `${((base?.percentage ?? 0) * 100).toFixed(0)}% (base tier)`,
  };
}

/**
 * Calculate a vs deal (guarantee vs % of net/gross, whichever greater).
 * Supports ratchet tiers, walkout pots, and recoups inside/outside the cap.
 */
export function calculateVsDeal(input: AiCalcInput): WorksheetCalculation {
  const { confirmedTerms: t, ticketSales, expenses, venueCapacity } = input;

  if (t.guarantee === null || t.percentage === null) {
    return {
      supported: false,
      reason: "Vs deal requires both a guarantee amount and a percentage.",
    };
  }

  const steps: WorksheetStep[] = [];

  const gross = sumGross(ticketSales);
  const fees = sumFees(ticketSales);
  const passThru = sumPassThru(expenses);
  const sold = ticketsSold(ticketSales);

  steps.push({
    label: "Gross box office",
    value: gross,
    formula: "Sum of ticket sales",
    sourceRef: "POS / ticket platform",
  });
  steps.push({
    label: "Ticket platform fees",
    value: -fees,
    formula: "Sum of platform fees (10% of gross)",
    sourceRef: "Ticket platform",
  });

  // Recoups outside cap come off gross before net is computed
  const recoupsOutside = (t.recoups ?? []).filter((r) => !r.isInsideExpenseCap);
  const recoupsInside = (t.recoups ?? []).filter((r) => r.isInsideExpenseCap);

  let preNetDeductions = 0;
  for (const r of recoupsOutside) {
    preNetDeductions += r.amount;
    steps.push({
      label: `Recoup (outside cap): ${r.label}`,
      value: -r.amount,
      formula: `Deducted from gross before net — outside expense cap`,
      sourceRef: "Deal notes (recoup)",
    });
  }

  const net = gross - fees - preNetDeductions;
  steps.push({
    label: "Net box office",
    value: net,
    formula:
      recoupsOutside.length > 0
        ? `Gross − platform fees − outside-cap recoups`
        : `Gross − platform fees`,
    sourceRef: "Calculated",
  });

  // Expenses: pass-through, capped. Recoups inside cap count toward cap usage.
  const insideCapRecoupTotal = recoupsInside.reduce((s, r) => s + r.amount, 0);
  const effectiveCap = t.expenseCap ?? Infinity;
  const cappedExpenses = Math.min(passThru + insideCapRecoupTotal, effectiveCap);

  // Show individual expense line and inside-cap recoups
  steps.push({
    label: "Pass-through expenses",
    value: -passThru,
    formula: "Sum of non-absorbed expense line items",
    sourceRef: "Expense records",
  });
  for (const r of recoupsInside) {
    steps.push({
      label: `Recoup (inside cap): ${r.label}`,
      value: -r.amount,
      formula: "Counted within expense cap",
      sourceRef: "Deal notes (recoup)",
    });
  }
  if (t.expenseCap !== null) {
    const overage = Math.max(0, passThru + insideCapRecoupTotal - t.expenseCap);
    steps.push({
      label: `Expense cap applied ($${t.expenseCap.toLocaleString()})`,
      value: overage > 0 ? overage : 0,
      formula: `Cap = $${t.expenseCap.toLocaleString()}; excess $${overage.toLocaleString()} absorbed by venue`,
      sourceRef: "Deal notes (expense cap)",
    });
  }

  const netAfterExpenses = Math.max(0, net - cappedExpenses);
  steps.push({
    label: "Net after expenses",
    value: netAfterExpenses,
    formula: t.percentageBasis === "gross"
      ? "Gross (% of gross deal — expenses don't apply to percentage)"
      : `Net − capped expenses`,
    sourceRef: "Calculated",
  });

  // Determine active percentage (ratchet or flat)
  let activePct = t.percentage;
  let pctSource = `Deal notes (${(t.percentage * 100).toFixed(0)}% of ${t.percentageBasis ?? "net"})`;
  if (t.ratchetTiers && t.ratchetTiers.length > 0) {
    const { pct, tierLabel } = resolveRatchetPct(t.ratchetTiers, sold, venueCapacity);
    activePct = pct;
    pctSource = `Ratchet tier: ${tierLabel}`;
    steps.push({
      label: "Ratchet tier evaluation",
      value: sold,
      formula: `${sold} tickets sold / ${venueCapacity} capacity = ${((sold / venueCapacity) * 100).toFixed(1)}% fill rate`,
      sourceRef: "Ticket sales",
    });
  }

  // Percentage payout basis
  const pctBasis = t.percentageBasis === "gross" ? gross : netAfterExpenses;
  const percentagePayout = pctBasis * activePct;
  steps.push({
    label: `Artist percentage (${(activePct * 100).toFixed(0)}% of ${t.percentageBasis ?? "net"})`,
    value: percentagePayout,
    formula: `${(activePct * 100).toFixed(0)}% × ${t.percentageBasis === "gross" ? "gross" : "net after expenses"} ($${pctBasis.toLocaleString("en-US", { maximumFractionDigits: 2 })})`,
    sourceRef: pctSource,
  });

  // Vs comparison
  const guarantee = t.guarantee;
  const winSide: "guarantee" | "percentage" = percentagePayout >= guarantee ? "percentage" : "guarantee";
  const vsBase = Math.max(guarantee, percentagePayout);
  steps.push({
    label: `Guarantee vs percentage`,
    value: vsBase,
    formula: `max($${guarantee.toLocaleString()} guarantee, $${percentagePayout.toFixed(2)} percentage) → ${winSide} wins`,
    sourceRef: "Deal notes (vs deal)",
  });

  // Walkout pot (all gross above threshold goes 100% to artist)
  let walkoutBonus = 0;
  if (t.walkout) {
    const { threshold, basis, artistPct } = t.walkout;
    const basisAmount = basis === "gross" ? gross : net;
    if (basisAmount > threshold) {
      walkoutBonus = (basisAmount - threshold) * artistPct;
      steps.push({
        label: `Walkout pot (${(artistPct * 100).toFixed(0)}% above $${threshold.toLocaleString()})`,
        value: walkoutBonus,
        formula: `(${basis === "gross" ? "gross" : "net"} $${basisAmount.toLocaleString()} − threshold $${threshold.toLocaleString()}) × ${(artistPct * 100).toFixed(0)}%`,
        sourceRef: "Deal notes (walkout pot)",
      });
    } else {
      steps.push({
        label: `Walkout pot (not triggered)`,
        value: 0,
        formula: `${basis === "gross" ? "gross" : "net"} $${basisAmount.toLocaleString()} ≤ threshold $${threshold.toLocaleString()}`,
        sourceRef: "Deal notes (walkout pot)",
      });
    }
  }

  const totalToArtist = vsBase + walkoutBonus;

  steps.push({
    label: "Total to artist",
    value: totalToArtist,
    formula:
      walkoutBonus > 0
        ? `Vs base $${vsBase.toFixed(2)} + walkout $${walkoutBonus.toFixed(2)}`
        : `Vs base = $${vsBase.toFixed(2)}`,
    sourceRef: "Calculated",
  });

  return {
    supported: true,
    grossBoxOffice: gross,
    platformFees: fees,
    netBoxOffice: net,
    cappedExpenses,
    totalToArtist,
    guaranteeSide: guarantee,
    percentageSide: percentagePayout,
    activePercentage: activePct,
    winSide,
    steps,
  };
}

/**
 * Calculate a percentage-of-net deal (no guarantee floor).
 */
export function calculatePercentageOfNet(input: AiCalcInput): WorksheetCalculation {
  const { confirmedTerms: t, ticketSales, expenses } = input;

  if (t.percentage === null) {
    return { supported: false, reason: "Percentage of net deal requires a percentage." };
  }

  const steps: WorksheetStep[] = [];

  const gross = sumGross(ticketSales);
  const fees = sumFees(ticketSales);
  const passThru = sumPassThru(expenses);

  steps.push({
    label: "Gross box office",
    value: gross,
    formula: "Sum of ticket sales",
    sourceRef: "POS / ticket platform",
  });
  steps.push({
    label: "Ticket platform fees",
    value: -fees,
    formula: "Sum of platform fees",
    sourceRef: "Ticket platform",
  });

  const net = gross - fees;
  steps.push({
    label: "Net box office",
    value: net,
    formula: "Gross − platform fees",
    sourceRef: "Calculated",
  });

  const effectiveCap = t.expenseCap ?? Infinity;
  const cappedExpenses = Math.min(passThru, effectiveCap);
  steps.push({
    label: `Expenses (capped at $${t.expenseCap?.toLocaleString() ?? "∞"})`,
    value: -cappedExpenses,
    formula: t.expenseCap
      ? `min($${passThru.toFixed(2)} pass-through, $${t.expenseCap.toLocaleString()} cap)`
      : `$${passThru.toFixed(2)} (no cap)`,
    sourceRef: "Expense records + deal notes",
  });

  const netAfterExpenses = Math.max(0, net - cappedExpenses);
  steps.push({
    label: "Net after expenses",
    value: netAfterExpenses,
    formula: "Net − capped expenses",
    sourceRef: "Calculated",
  });

  const payout = netAfterExpenses * t.percentage;
  steps.push({
    label: `Artist percentage (${(t.percentage * 100).toFixed(0)}% of net)`,
    value: payout,
    formula: `${(t.percentage * 100).toFixed(0)}% × $${netAfterExpenses.toFixed(2)}`,
    sourceRef: "Deal notes",
  });

  steps.push({
    label: "Total to artist",
    value: payout,
    formula: "Percentage of net (no guarantee floor)",
    sourceRef: "Calculated",
  });

  return {
    supported: true,
    grossBoxOffice: gross,
    platformFees: fees,
    netBoxOffice: net,
    cappedExpenses,
    totalToArtist: payout,
    guaranteeSide: null,
    percentageSide: payout,
    activePercentage: t.percentage,
    winSide: null,
    steps,
  };
}

/**
 * Calculate a door deal (artist gets ticket revenue minus capped expenses).
 */
export function calculateDoorDeal(input: AiCalcInput): WorksheetCalculation {
  const { confirmedTerms: t, ticketSales, expenses } = input;

  const steps: WorksheetStep[] = [];

  const gross = sumGross(ticketSales);
  const fees = sumFees(ticketSales);
  const passThru = sumPassThru(expenses);

  steps.push({
    label: "Gross box office",
    value: gross,
    formula: "Sum of ticket sales (door revenue)",
    sourceRef: "POS / ticket platform",
  });
  steps.push({
    label: "Ticket platform fees",
    value: -fees,
    formula: "Sum of platform fees",
    sourceRef: "Ticket platform",
  });

  const net = gross - fees;
  steps.push({
    label: "Net box office",
    value: net,
    formula: "Gross − fees",
    sourceRef: "Calculated",
  });

  const effectiveCap = t.expenseCap ?? Infinity;
  const cappedExpenses = Math.min(passThru, effectiveCap);
  steps.push({
    label: `Expenses (capped at $${t.expenseCap?.toLocaleString() ?? "∞"})`,
    value: -cappedExpenses,
    formula: t.expenseCap
      ? `min($${passThru.toFixed(2)}, $${t.expenseCap.toLocaleString()} cap)`
      : `$${passThru.toFixed(2)} (no cap)`,
    sourceRef: "Expense records + deal notes",
  });

  const payout = Math.max(0, net - cappedExpenses);
  steps.push({
    label: "Total to artist",
    value: payout,
    formula: "Net − expenses (door deal: artist takes net revenue)",
    sourceRef: "Deal notes",
  });

  return {
    supported: true,
    grossBoxOffice: gross,
    platformFees: fees,
    netBoxOffice: net,
    cappedExpenses,
    totalToArtist: payout,
    guaranteeSide: null,
    percentageSide: null,
    activePercentage: null,
    winSide: null,
    steps,
  };
}

/** Evaluate a list of bonuses against the show's actual numbers. */
function applyBonuses(
  bonuses: Bonus[],
  ctx: { gross: number; tickets: number; capacity?: number },
) {
  const applied: { label: string; amount: number; reason: string }[] = [];
  const notTriggered: { label: string; amount: number; reason: string }[] = [];

  for (const b of bonuses) {
    if (b.type === "gross_threshold") {
      if (ctx.gross >= b.threshold) {
        applied.push({
          label: b.label,
          amount: b.amount,
          reason: `Gross ${ctx.gross.toLocaleString()} ≥ ${b.threshold.toLocaleString()}`,
        });
      } else {
        notTriggered.push({
          label: b.label,
          amount: b.amount,
          reason: `Gross ${ctx.gross.toLocaleString()} < ${b.threshold.toLocaleString()}`,
        });
      }
    } else if (b.type === "sellout") {
      if (ctx.capacity != null && ctx.tickets >= ctx.capacity * 0.95) {
        applied.push({
          label: b.label,
          amount: b.amount,
          reason: `${ctx.tickets} of ${ctx.capacity} sold`,
        });
      } else {
        notTriggered.push({
          label: b.label,
          amount: b.amount,
          reason:
            ctx.capacity != null
              ? `${ctx.tickets} of ${ctx.capacity} sold (sellout = ≥95%)`
              : `Capacity unknown — can't evaluate`,
        });
      }
    } else if (b.type === "attendance_threshold") {
      if (ctx.tickets >= b.threshold) {
        applied.push({
          label: b.label,
          amount: b.amount,
          reason: `${ctx.tickets} ≥ ${b.threshold}`,
        });
      } else {
        notTriggered.push({
          label: b.label,
          amount: b.amount,
          reason: `${ctx.tickets} < ${b.threshold}`,
        });
      }
    } else if (b.type === "tier_ratchet") {
      // Tier ratchets fundamentally change the percentage structure. The
      // current engine only supports flat % of gross — we can't apply a
      // ratcheting structure on top of it without knowing which deal type
      // it's modifying. Report as not-applicable.
      notTriggered.push({
        label: b.label,
        amount: 0,
        reason: "Tier ratchets need vs-deal or % of net support — not yet handled",
      });
    }
  }

  return {
    applied,
    notTriggered,
    totalApplied: applied.reduce((s, b) => s + b.amount, 0),
  };
}
