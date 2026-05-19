"use server";

/**
 * Server actions for the AI Settlement Worksheet.
 *
 * Three actions:
 *   extractTermsAction  — calls Claude, saves raw extraction to deal_extractions
 *   confirmTermsAction  — saves confirmed terms, runs math, persists worksheetJson
 *   approveSettlementAction — logs GM approval on the settlement record
 */

import { db } from "@/db";
import { dealExtractions, settlements, deals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { extractDealTerms } from "@/lib/extraction";
import {
  calculateVsDeal,
  calculatePercentageOfNet,
  calculateDoorDeal,
} from "@/lib/dealMath";
import type {
  ConfirmedTerms,
  ConfirmationLogEntry,
  ExtractionResult,
} from "@/lib/extraction";
import type { WorksheetStep } from "@/lib/dealMath";
import { getShowById } from "@/lib/queries";
import { revalidatePath } from "next/cache";

// -------- extractTermsAction --------

export type ExtractResult =
  | {
      ok: true;
      extractionId: string;
      result: ExtractionResult;
      fallbackToManual: boolean;
    }
  | { ok: false; error: string; fallbackToManual: true };

export async function extractTermsAction(
  showId: string,
): Promise<ExtractResult> {
  const data = await getShowById(showId);
  if (!data?.deal) {
    return {
      ok: false,
      error: "No deal found for this show.",
      fallbackToManual: true,
    };
  }

  const { deal } = data;
  const notes = deal.dealNotesFreetext;

  if (!notes) {
    return {
      ok: true,
      extractionId: "",
      result: emptyExtractionResult(),
      fallbackToManual: true,
    };
  }

  const response = await extractDealTerms(notes);

  if (!response.ok) {
    return {
      ok: false,
      error: response.error,
      fallbackToManual: true,
    };
  }

  // Upsert: one extraction per deal
  const existing = await db
    .select()
    .from(dealExtractions)
    .where(eq(dealExtractions.dealId, deal.id))
    .limit(1);

  let extractionId: string;

  if (existing.length > 0) {
    extractionId = existing[0].id;
    await db
      .update(dealExtractions)
      .set({
        extractionJson: JSON.stringify(response.result),
        confirmedTermsJson: null,
        confirmationLogJson: null,
        confirmedAt: null,
        confirmedByUserId: null,
        createdAt: new Date(),
      })
      .where(eq(dealExtractions.id, extractionId));
  } else {
    extractionId = `ext_${deal.id}_${Date.now()}`;
    await db.insert(dealExtractions).values({
      id: extractionId,
      dealId: deal.id,
      showId,
      extractionJson: JSON.stringify(response.result),
      createdAt: new Date(),
    });
  }

  revalidatePath(`/shows/${showId}/settle`);

  return {
    ok: true,
    extractionId,
    result: response.result,
    fallbackToManual: response.fallbackToManual,
  };
}

// -------- confirmTermsAction --------

export type ConfirmResult =
  | { ok: true; worksheetJson: string }
  | { ok: false; error: string };

export async function confirmTermsAction(
  showId: string,
  extractionId: string,
  confirmedTerms: ConfirmedTerms,
  editLog: ConfirmationLogEntry[],
): Promise<ConfirmResult> {
  const data = await getShowById(showId);
  if (!data) {
    return { ok: false, error: "Show not found." };
  }

  const { ticketSales, expenses, venue } = data;
  const venueCapacity = venue?.capacity ?? 650;

  // Run the math engine based on deal type
  let worksheetSteps: WorksheetStep[] = [];
  let totalToArtist = 0;
  let gross = 0;
  let netBoxOffice = 0;

  const deal = data.deal;
  if (!deal) {
    return { ok: false, error: "No deal found for this show." };
  }

  const dealType = deal.dealType;

  const calcInput = { confirmedTerms, ticketSales, expenses, venueCapacity };

  let result;
  if (dealType === "vs") {
    result = calculateVsDeal(calcInput);
  } else if (dealType === "percentage_of_net") {
    result = calculatePercentageOfNet(calcInput);
  } else if (dealType === "door") {
    result = calculateDoorDeal(calcInput);
  } else {
    return { ok: false, error: `Deal type ${dealType} is not supported by the AI worksheet.` };
  }

  if (!result.supported) {
    return { ok: false, error: result.reason };
  }

  worksheetSteps = result.steps;
  totalToArtist = result.totalToArtist;
  gross = result.grossBoxOffice;
  netBoxOffice = result.netBoxOffice;

  const worksheetJson = JSON.stringify(worksheetSteps);

  // Save confirmed terms to deal_extractions
  await db
    .update(dealExtractions)
    .set({
      confirmedTermsJson: JSON.stringify(confirmedTerms),
      confirmationLogJson: JSON.stringify(editLog),
      confirmedAt: new Date(),
      confirmedByUserId: "user_mariana",
    })
    .where(eq(dealExtractions.id, extractionId));

  // Persist worksheetJson to settlement record
  const existingSettlement = await db
    .select()
    .from(settlements)
    .where(eq(settlements.showId, showId))
    .limit(1);

  if (existingSettlement.length > 0) {
    await db
      .update(settlements)
      .set({
        worksheetJson,
        grossBoxOffice: gross,
        netBoxOffice,
        totalToArtist,
      })
      .where(eq(settlements.showId, showId));
  } else {
    await db.insert(settlements).values({
      id: `stl_${showId}_ai`,
      showId,
      status: "draft",
      worksheetJson,
      grossBoxOffice: gross,
      netBoxOffice,
      totalToArtist,
      draftedAt: new Date(),
    });
  }

  revalidatePath(`/shows/${showId}/settle`);
  revalidatePath(`/shows/${showId}/settle/share`);

  return { ok: true, worksheetJson };
}

// -------- approveSettlementAction --------

export type ApproveResult =
  | { ok: true }
  | { ok: false; error: string };

export async function approveSettlementAction(
  showId: string,
): Promise<ApproveResult> {
  const existing = await db
    .select()
    .from(settlements)
    .where(eq(settlements.showId, showId))
    .limit(1);

  if (existing.length === 0) {
    return { ok: false, error: "No settlement record found." };
  }

  await db
    .update(settlements)
    .set({
      gmApprovedAt: new Date(),
      gmApprovedByUserId: "user_marcus",
    })
    .where(eq(settlements.showId, showId));

  revalidatePath(`/shows/${showId}/settle`);
  revalidatePath(`/shows/${showId}/settle/share`);

  return { ok: true };
}

// -------- Helpers --------

function emptyExtractionResult(): ExtractionResult {
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
