/**
 * Unit tests for the AI settlement math engine.
 *
 * Test values are drawn from real deal note patterns in greenroom.db:
 *   - The Coastal Spell vs deal ($5k vs 80% net, expenses capped $2,500)
 *   - Standard vs deals from the seed generator
 *   - Ratchet tier, walkout pot, and recoup edge cases
 *
 * Run: npx vitest run lib/dealMath.test.ts
 */

import { describe, it, expect } from "vitest";
import { calculateVsDeal, calculatePercentageOfNet, calculateDoorDeal } from "./dealMath";
import type { ConfirmedTerms } from "./extraction";
import type { TicketSale, Expense } from "@/db/schema";

// -------- Helpers --------

function makeSales(gross: number, fees: number, qty = 0): TicketSale[] {
  return [
    {
      id: "ts_test",
      showId: "show_test",
      qty,
      gross,
      fees,
      capturedAt: new Date(),
    },
  ];
}

function makeExpenses(
  items: Array<{ amount: number; absorbed?: boolean }>,
): Expense[] {
  return items.map((e, i) => ({
    id: `exp_${i}`,
    showId: "show_test",
    category: "production" as const,
    amount: e.amount,
    description: null,
    approved: true,
    absorbedByVenue: e.absorbed ?? false,
    enteredByUserId: null,
    enteredAt: new Date(),
  }));
}

const VENUE_CAPACITY = 650;

// -------- Test Case 1: Vs deal where guarantee WINS --------
// Coastal Spell scenario: $5,000 vs 80% net, expenses capped $2,500
// Gross: $8,000, fees: $800, expenses: $2,200 → net after exp: $5,000
// 80% × $5,000 = $4,000 < $5,000 guarantee → guarantee wins

describe("calculateVsDeal", () => {
  it("TC1: guarantee wins when percentage payout is below guarantee", () => {
    const confirmedTerms: ConfirmedTerms = {
      guarantee: 5000,
      percentage: 0.80,
      percentageBasis: "net",
      expenseCap: 2500,
      hospitalityCap: 500,
      walkout: null,
      ratchetTiers: null,
      recoups: null,
    };

    // Low turnout: 250 tickets at $32 = $8,000 gross, $800 fees
    const result = calculateVsDeal({
      confirmedTerms,
      ticketSales: makeSales(8000, 800, 250),
      expenses: makeExpenses([{ amount: 2200 }]),
      venueCapacity: VENUE_CAPACITY,
    });

    expect(result.supported).toBe(true);
    if (!result.supported) return;

    // Net = 8000 - 800 = 7200; capped expenses = min(2200, 2500) = 2200
    // Net after exp = 7200 - 2200 = 5000
    // 80% × 5000 = 4000 < guarantee 5000 → guarantee wins
    expect(result.totalToArtist).toBeCloseTo(5000, 2);
    expect(result.winSide).toBe("guarantee");
    expect(result.guaranteeSide).toBeCloseTo(5000, 2);
    expect(result.percentageSide).toBeCloseTo(4000, 2);
  });

  // -------- Test Case 2: Vs deal where PERCENTAGE WINS --------
  // Coastal Spell actual numbers: gross $19,840, fees $1,984, expenses $1,600 (capped $2,500)
  // 80% × (19,840 - 1,984 - 1,600) = 80% × 16,256 = $13,004.80 > $5,000 guarantee → % wins

  it("TC2: percentage wins when payout exceeds guarantee (Coastal Spell numbers)", () => {
    const confirmedTerms: ConfirmedTerms = {
      guarantee: 5000,
      percentage: 0.80,
      percentageBasis: "net",
      expenseCap: 2500,
      hospitalityCap: 500,
      walkout: null,
      ratchetTiers: null,
      recoups: null,
    };

    const result = calculateVsDeal({
      confirmedTerms,
      ticketSales: makeSales(19840, 1984, 620),
      expenses: makeExpenses([
        { amount: 400 },  // sound
        { amount: 220 },  // lights
        { amount: 280 },  // production
        { amount: 480 },  // hospitality
        { amount: 220 },  // backline
      ]),
      venueCapacity: VENUE_CAPACITY,
    });

    expect(result.supported).toBe(true);
    if (!result.supported) return;

    // passThru = 400+220+280+480+220 = 1600; capped = min(1600, 2500) = 1600
    // net = 19840 - 1984 = 17856; netAfterExp = 17856 - 1600 = 16256
    // 80% × 16256 = 13004.8 > 5000 → percentage wins
    expect(result.winSide).toBe("percentage");
    expect(result.totalToArtist).toBeCloseTo(13004.8, 1);
    expect(result.grossBoxOffice).toBe(19840);
  });

  // -------- Test Case 3: Ratchet tier TRIGGERS --------
  // $4,500 vs base 80% net, ratchets to 90% over 80% capacity
  // Venue cap 650; sell 540 tickets = 83% fill → ratchet triggers

  it("TC3: ratchet tier triggers when fill rate exceeds threshold", () => {
    const confirmedTerms: ConfirmedTerms = {
      guarantee: 4500,
      percentage: 0.80,
      percentageBasis: "net",
      expenseCap: 2250,
      hospitalityCap: 500,
      walkout: null,
      ratchetTiers: [
        { fromTicketPct: 0, toTicketPct: 0.80, percentage: 0.80 },
        { fromTicketPct: 0.80, toTicketPct: null, percentage: 0.90 },
      ],
      recoups: null,
    };

    // 540 tickets = 83% fill → ratchet tier (90%) triggers
    const result = calculateVsDeal({
      confirmedTerms,
      ticketSales: makeSales(17280, 1728, 540),  // 540 × $32 = $17,280
      expenses: makeExpenses([{ amount: 2000 }]),
      venueCapacity: VENUE_CAPACITY,
    });

    expect(result.supported).toBe(true);
    if (!result.supported) return;

    // fill = 540/650 = 0.831 → uses 90% tier
    expect(result.activePercentage).toBeCloseTo(0.90, 2);
    // net = 17280 - 1728 = 15552; capped exp = 2000; netAfterExp = 13552
    // 90% × 13552 = 12196.8 > 4500 → % wins
    expect(result.winSide).toBe("percentage");
    expect(result.totalToArtist).toBeCloseTo(12196.8, 1);
  });

  // -------- Test Case 4: Ratchet tier does NOT trigger --------
  // Same deal but only 480 tickets sold = 73.8% fill → stays at 80% base

  it("TC4: ratchet tier does not trigger when fill rate is below threshold", () => {
    const confirmedTerms: ConfirmedTerms = {
      guarantee: 4500,
      percentage: 0.80,
      percentageBasis: "net",
      expenseCap: 2250,
      hospitalityCap: 500,
      walkout: null,
      ratchetTiers: [
        { fromTicketPct: 0, toTicketPct: 0.80, percentage: 0.80 },
        { fromTicketPct: 0.80, toTicketPct: null, percentage: 0.90 },
      ],
      recoups: null,
    };

    // 480 tickets = 73.8% fill → stays at 80% base
    const result = calculateVsDeal({
      confirmedTerms,
      ticketSales: makeSales(15360, 1536, 480),  // 480 × $32 = $15,360
      expenses: makeExpenses([{ amount: 2000 }]),
      venueCapacity: VENUE_CAPACITY,
    });

    expect(result.supported).toBe(true);
    if (!result.supported) return;

    // fill = 480/650 = 0.738 → uses 80% base tier
    expect(result.activePercentage).toBeCloseTo(0.80, 2);
    // net = 15360 - 1536 = 13824; exp = 2000; netAfterExp = 11824
    // 80% × 11824 = 9459.2 > 4500 → % wins
    expect(result.activePercentage).not.toBeCloseTo(0.90, 2);
    expect(result.totalToArtist).toBeCloseTo(9459.2, 1);
  });

  // -------- Test Case 5: Walkout pot triggers --------
  // $3,500 vs 80% net + walkout: 100% of gross above $14,000 to artist
  // Gross: $19,840, fees: $1,984, expenses: $1,600
  // Walkout basis gross = $19,840 > $14,000 → walkout pays (19840 - 14000) × 1.0 = $5,840

  it("TC5: walkout pot triggers and adds to vs base", () => {
    const confirmedTerms: ConfirmedTerms = {
      guarantee: 3500,
      percentage: 0.80,
      percentageBasis: "net",
      expenseCap: 1750,
      hospitalityCap: 400,
      walkout: { threshold: 14000, basis: "gross", artistPct: 1.0 },
      ratchetTiers: null,
      recoups: null,
    };

    const result = calculateVsDeal({
      confirmedTerms,
      ticketSales: makeSales(19840, 1984, 620),
      expenses: makeExpenses([{ amount: 1600 }]),
      venueCapacity: VENUE_CAPACITY,
    });

    expect(result.supported).toBe(true);
    if (!result.supported) return;

    // net = 19840 - 1984 = 17856; exp capped = 1600; netAfterExp = 16256
    // 80% × 16256 = 13004.8 > 3500 → percentage wins, vsBase = 13004.8
    // Walkout: gross 19840 > 14000 → (19840 - 14000) × 1.0 = 5840
    // Total = 13004.8 + 5840 = 18844.8
    expect(result.totalToArtist).toBeCloseTo(18844.8, 1);
  });

  // -------- Test Case 6a: Recoup INSIDE cap --------
  // $5,000 vs 80% net, expense cap $2,500
  // $900 marketing recoup inside cap: reduces cap headroom
  // passThru = $1,600; inside-cap recoup = $900 → total cap usage = $2,500 (exactly at cap)

  it("TC6a: recoup inside cap — counted toward expense cap, reduces net after expenses", () => {
    const confirmedTerms: ConfirmedTerms = {
      guarantee: 5000,
      percentage: 0.80,
      percentageBasis: "net",
      expenseCap: 2500,
      hospitalityCap: 500,
      walkout: null,
      ratchetTiers: null,
      recoups: [{ label: "Marketing recoup", amount: 900, isInsideExpenseCap: true }],
    };

    const result = calculateVsDeal({
      confirmedTerms,
      ticketSales: makeSales(19840, 1984, 620),
      expenses: makeExpenses([
        { amount: 400 }, { amount: 220 }, { amount: 280 }, { amount: 480 }, { amount: 220 },
      ]),  // passThru = 1600
      venueCapacity: VENUE_CAPACITY,
    });

    expect(result.supported).toBe(true);
    if (!result.supported) return;

    // inside-cap recoup $900 + expenses $1600 = $2500 (exactly at cap)
    // net = 17856; cappedExpenses = min(1600+900=2500, 2500) = 2500
    // netAfterExp = 17856 - 2500 = 15356
    // 80% × 15356 = 12284.8 > 5000 → % wins
    // Agent's correct interpretation from the Coastal Spell case: $12,285
    expect(result.totalToArtist).toBeCloseTo(12284.8, 0);
  });

  // -------- Test Case 6b: Recoup OUTSIDE cap --------
  // Same scenario but recoup is outside cap: deducted from gross before net
  // Math: net = (19840 - 1984 - 900) = 16956; expenses $1600; netAfterExp = 15356
  // Wait — actually outside cap means off gross. net = gross - fees - outside_recoups
  // net = 19840 - 1984 - 900 = 16956; exp capped = 1600; netAfterExp = 16956 - 1600 = 15356
  // 80% × 15356 = $12,284.8 — same! The difference is only visible at $2,500 cap when exp < cap.

  it("TC6b: recoup outside cap — deducted from gross before net, yields different result than inside cap when expenses are below cap", () => {
    // Use lower expenses so the inside vs outside cap distinction matters
    // passThru = $1,000; cap = $2,500
    // INSIDE: total cap usage = 1000 + 900 = 1900, capped at 1900; net = 17856 - 1900 = 15956; 80% = 12764.8
    // OUTSIDE: net = 19840 - 1984 - 900 = 16956; expenses = 1000; netAfterExp = 15956; 80% = 12764.8
    // Hmm — these are actually the same when passThru + recoup < cap!
    //
    // The real difference: when passThru + inside_recoup EXCEEDS cap, some gets absorbed.
    // Use passThru $2,000 + inside $900 = $2,900 → capped at $2,500 → $400 absorbed (venue pays)
    // Outside: $900 off gross; expenses $2,000 capped $2,000; net after = 17856 - 2000 = 15856; 80% = 12684.8
    // Inside: net = 17856; cap = min(2000+900=2900, 2500) = 2500; netAfter = 15356; 80% = 12284.8
    // Inside < Outside when total exceeds cap (venue absorbs less under outside interpretation)

    const outsideTerms: ConfirmedTerms = {
      guarantee: 5000,
      percentage: 0.80,
      percentageBasis: "net",
      expenseCap: 2500,
      hospitalityCap: 500,
      walkout: null,
      ratchetTiers: null,
      recoups: [{ label: "Marketing recoup", amount: 900, isInsideExpenseCap: false }],
    };

    const insideTerms: ConfirmedTerms = {
      ...outsideTerms,
      recoups: [{ label: "Marketing recoup", amount: 900, isInsideExpenseCap: true }],
    };

    const salesData = makeSales(19840, 1984, 620);
    // $2,000 expenses + $900 recoup = $2,900 total (exceeds $2,500 cap when inside)
    const expData = makeExpenses([{ amount: 2000 }]);

    const outsideResult = calculateVsDeal({
      confirmedTerms: outsideTerms,
      ticketSales: salesData,
      expenses: expData,
      venueCapacity: VENUE_CAPACITY,
    });

    const insideResult = calculateVsDeal({
      confirmedTerms: insideTerms,
      ticketSales: salesData,
      expenses: expData,
      venueCapacity: VENUE_CAPACITY,
    });

    expect(outsideResult.supported).toBe(true);
    expect(insideResult.supported).toBe(true);
    if (!outsideResult.supported || !insideResult.supported) return;

    // Outside: net = 19840-1984-900=16956; expenses=2000; netAfterExp=14956; 80%=11964.8
    // Inside: cappedExpenses=min(2000+900=2900,2500)=2500; netAfterExp=17856-2500=15356; 80%=12284.8
    // Inside yields HIGHER payout to artist when total exceeds cap (some expense cost absorbed by venue)
    expect(insideResult.totalToArtist).toBeGreaterThan(outsideResult.totalToArtist);

    // Verify the specific numbers
    expect(outsideResult.totalToArtist).toBeCloseTo(11964.8, 0);
    expect(insideResult.totalToArtist).toBeCloseTo(12284.8, 0);
  });
});

// -------- Percentage of net --------

describe("calculatePercentageOfNet", () => {
  it("returns correct net payout with expense cap", () => {
    const confirmedTerms: ConfirmedTerms = {
      guarantee: null,
      percentage: 0.85,
      percentageBasis: "net",
      expenseCap: 2000,
      hospitalityCap: 400,
      walkout: null,
      ratchetTiers: null,
      recoups: null,
    };

    // Gross $15,000, fees $1,500, expenses $2,500 (but capped at $2,000)
    const result = calculatePercentageOfNet({
      confirmedTerms,
      ticketSales: makeSales(15000, 1500),
      expenses: makeExpenses([{ amount: 2500 }]),
      venueCapacity: VENUE_CAPACITY,
    });

    expect(result.supported).toBe(true);
    if (!result.supported) return;

    // net = 15000-1500 = 13500; cappedExp = min(2500,2000) = 2000
    // netAfterExp = 13500-2000 = 11500; 85% × 11500 = 9775
    expect(result.totalToArtist).toBeCloseTo(9775, 1);
    expect(result.winSide).toBeNull(); // no guarantee comparison
  });
});

// -------- Door deal --------

describe("calculateDoorDeal", () => {
  it("artist gets gross minus capped expenses", () => {
    const confirmedTerms: ConfirmedTerms = {
      guarantee: null,
      percentage: null,
      percentageBasis: null,
      expenseCap: 600,
      hospitalityCap: 200,
      walkout: null,
      ratchetTiers: null,
      recoups: null,
    };

    // Gross $3,000, fees $300, expenses $800 (capped at $600)
    const result = calculateDoorDeal({
      confirmedTerms,
      ticketSales: makeSales(3000, 300),
      expenses: makeExpenses([{ amount: 800 }]),
      venueCapacity: VENUE_CAPACITY,
    });

    expect(result.supported).toBe(true);
    if (!result.supported) return;

    // net = 3000-300 = 2700; cappedExp = min(800,600) = 600; payout = 2700-600 = 2100
    expect(result.totalToArtist).toBeCloseTo(2100, 1);
  });
});
