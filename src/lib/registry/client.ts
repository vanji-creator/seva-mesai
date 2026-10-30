import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { regEncumbrances, regLandRecords, regSaleDeeds, regTaxReceipts } from "@/db/schema";
import type { PattaPayload } from "@/lib/types";
import type { RegistryEvidence } from "@/lib/verify/types";

/**
 * Single seam for "other departments' data". Today it reads mock tables;
 * in production each query becomes an authenticated API call (Registration,
 * Revenue, Tax) behind this same return shape.
 */
export async function fetchEvidence(p: PattaPayload): Promise<RegistryEvidence> {
  const [deed] = await db.select().from(regSaleDeeds).where(eq(regSaleDeeds.deedNo, p.saleDeedNo));
  const [land] = await db.select().from(regLandRecords).where(eq(regLandRecords.surveyNo, p.surveyNo));
  const [tax] = await db.select().from(regTaxReceipts).where(eq(regTaxReceipts.receiptNo, p.taxReceiptNo));
  const enc = await db.select().from(regEncumbrances).where(eq(regEncumbrances.surveyNo, p.surveyNo));
  return {
    deed: deed ?? null,
    land: land ?? null,
    tax: tax ?? null,
    encumbrances: enc.filter((e) => e.kind !== "none"),
  };
}
