import { eq, isNull, and } from "drizzle-orm";
import { db } from "@/db/client";
import { aiAnalyses, applications, documents } from "@/db/schema";
import type { DocKind } from "@/db/cases";
import { aiReview } from "@/lib/ai/analyze";
import { readDocument, type DocReading } from "@/lib/docs/read";
import { REQUIRED } from "@/lib/verify/caseCheck";
import type { PattaPayload } from "@/lib/types";
import { evaluateApp } from "./load";

/**
 * Intake work that happens behind the citizen's back, so it is done before an officer opens the case:
 * reading each uploaded file, then the checks and the AI review once the application is submitted.
 * The citizen never sees any of it.
 */

/** Re-run the deterministic checks and the AI review (both languages) from what is stored. */
export async function recheck(applicationId: number) {
  const [app] = await db.select().from(applications).where(eq(applications.id, applicationId));
  if (!app) return;
  const ev = await evaluateApp(app);
  await db.update(applications).set({ blockers: ev.blockers, warnings: ev.warnings }).where(eq(applications.id, applicationId));
  const reviews = await Promise.all((["ta", "en"] as const).map(async (locale) => ({ locale, a: await aiReview(ev, locale) })));
  for (const { locale, a } of reviews) {
    await db.insert(aiAnalyses).values({ applicationId, locale, summary: a.summary, findings: a.findings, suggestion: a.suggestion, reasons: a.reasons, draftReply: a.draftReply, source: a.source, model: a.model });
  }
}

/**
 * Read one file a citizen uploaded into a slot. The slot is what the citizen says the file is:
 *  - Classify agrees, or can't tell (a blurry photo)  -> it counts as that document;
 *    an unreadable one is flagged for the officer to check by eye, never treated as a wrong document;
 *  - Classify is sure it is another required document -> it counts as that one;
 *  - anything else (a ration card)                     -> kept, marked as not belonging.
 */
export async function readCitizenDoc(docId: number) {
  const [d] = await db.select().from(documents).where(eq(documents.id, docId));
  if (!d?.data || !d.slot) return;
  const [app] = await db.select().from(applications).where(eq(applications.id, d.applicationId));
  if (!app) return;
  const p = app.payload as unknown as PattaPayload;
  const slot = d.slot as DocKind;

  let reading: DocReading;
  try {
    reading = await readDocument({ name: d.fileName, mime: d.mime, data: new Uint8Array(d.data) }, [p.seller, p.buyer], slot);
  } catch (e) {
    console.error("citizen document reading failed", e);
    reading = { docType: slot, classifyConfidence: null, reviewRequired: true, values: null, minConfidence: null, engine: "unreadable", readAt: new Date().toISOString() };
  }
  const t = reading.docType as string | null;
  const known = !!t && REQUIRED.includes(t as DocKind);
  const kind = !t || t === "other" || t === slot ? slot : known ? t : "other";
  if (kind === slot && t !== slot) reading = { ...reading, docType: slot, reviewRequired: true };

  await db.update(documents).set({ kind, reading }).where(eq(documents.id, docId));
  // The receipt number is read from the receipt, so the panchayat record is looked up by what was actually paid.
  const receiptNo = kind === "tax_receipt" ? reading.values?.receiptNo : null;
  if (typeof receiptNo === "string" && receiptNo && receiptNo !== p.taxReceiptNo) {
    await db.update(applications).set({ payload: { ...p, taxReceiptNo: receiptNo } as unknown as Record<string, unknown> }).where(eq(applications.id, app.id));
  }
  // Already with the officer (a late read after submitting): refresh the checks and review.
  const [now] = await db.select({ status: applications.status }).from(applications).where(eq(applications.id, app.id));
  if (now?.status === "pending") await recheck(app.id);
}

/** After submit / resubmit: wait briefly for files still being read, then check and review. */
export async function finishIntake(applicationId: number, waitMs = 45_000) {
  const until = Date.now() + waitMs;
  while (Date.now() < until) {
    const unread = await db.select({ id: documents.id }).from(documents).where(and(eq(documents.applicationId, applicationId), isNull(documents.reading)));
    if (!unread.length) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  await recheck(applicationId);
}
