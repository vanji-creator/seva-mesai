import { and, desc, eq, lt, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { applications, documents, regEncumbrances, regLandRecords, regSaleDeeds, regTaxReceipts } from "@/db/schema";
import type { DocKind } from "@/db/cases";
import type { CaseInput, RegistryRecord } from "@/lib/verify/caseCheck";
import type { GrievancePayload, PattaPayload } from "@/lib/types";
import { evaluateGrievance, evaluatePatta, type OtherGrievance } from "./evaluate";

type App = typeof applications.$inferSelect;
export type DocRow = typeof documents.$inferSelect;

export { fyStart } from "./fy";
import { fyStart } from "./fy";

/**
 * The single seam for "other departments' data". Today: simulated tables. In production each
 * lookup is an authenticated call to Registration / Revenue / Tax, behind this same shape.
 */
export async function fetchRegistry(p: PattaPayload): Promise<RegistryRecord> {
  const [deed] = await db.select().from(regSaleDeeds).where(eq(regSaleDeeds.deedNo, p.saleDeedNo));
  const [land] = await db.select().from(regLandRecords).where(eq(regLandRecords.surveyNo, p.surveyNo));
  const [tax] = await db.select().from(regTaxReceipts).where(eq(regTaxReceipts.receiptNo, p.taxReceiptNo));
  const enc = await db.select().from(regEncumbrances).where(eq(regEncumbrances.surveyNo, p.surveyNo));
  return {
    deed: deed ? { deedNo: deed.deedNo, seller: deed.seller, buyer: deed.buyer, surveyNo: deed.surveyNo, extentCents: deed.extentCents } : null,
    land: land ? { currentOwner: land.currentOwner, extentCents: land.extentCents, pattaNo: land.pattaNo } : null,
    tax: tax ? { paidUpToYear: tax.paidUpToYear, duesAmount: tax.duesAmount } : null,
    encumbrances: enc.filter((e) => e.kind !== "none").map((e) => ({ kind: e.kind, detail: e.detail })),
  };
}

/** Latest readable document per kind; files that turned out to be something else are "unrelated". */
export function docsByKind(rows: DocRow[]) {
  const byKind: Partial<Record<DocKind, DocRow>> = {};
  const unrelated: { docType: string | null; fileName: string }[] = [];
  for (const d of [...rows].sort((a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime())) {
    if (d.kind === "other") unrelated.push({ docType: d.reading?.docType ?? null, fileName: d.fileName });
    else byKind[d.kind as DocKind] = d;
  }
  return { byKind, unrelated };
}

export async function loadDocs(appId: number) {
  return db.select().from(documents).where(eq(documents.applicationId, appId)).orderBy(desc(documents.uploadedAt));
}

export async function pattaInput(app: App, rows?: DocRow[]): Promise<CaseInput> {
  const payload = app.payload as unknown as PattaPayload;
  const { byKind, unrelated } = docsByKind(rows ?? (await loadDocs(app.id)));
  const docs = Object.fromEntries(Object.entries(byKind).filter(([, d]) => d?.reading).map(([k, d]) => [k, d!.reading!]));
  // A document that's attached but not yet read still counts as attached (no "missing" finding).
  for (const [k, d] of Object.entries(byKind)) {
    if (d && !d.reading) (docs as Record<string, unknown>)[k] = { docType: k, classifyConfidence: null, reviewRequired: true, values: null, minConfidence: null, engine: "pending", readAt: "" };
  }
  return { application: payload, docs, unrelated, registry: await fetchRegistry(payload), fyStart: fyStart() };
}

async function otherGrievances(app: App): Promise<OtherGrievance[]> {
  const rows = await db
    .select()
    .from(applications)
    // Only an earlier complaint can be "the original" — otherwise both would be flagged as duplicates of each other.
    .where(and(eq(applications.type, "grievance"), eq(applications.status, "pending"), ne(applications.id, app.id), lt(applications.submittedAt, app.submittedAt)));
  return rows.map((r) => ({ refNo: r.refNo, village: r.village, payload: r.payload as unknown as GrievancePayload }));
}

/** Full deterministic evaluation of any case, from the database. */
export async function evaluateApp(app: App, rows?: DocRow[]) {
  if (app.type === "patta") {
    const input = await pattaInput(app, rows);
    return { kind: "patta" as const, input, ...evaluatePatta(input) };
  }
  const p = app.payload as unknown as GrievancePayload;
  return { kind: "grievance" as const, ...evaluateGrievance(app.village, p, await otherGrievances(app)) };
}
