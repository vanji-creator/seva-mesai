/*
 * Demo dataset: one case per problem type (src/db/cases.ts), with every document present as a real
 * file in public/case-docs/, already read by Sarvam (fixtures/readings.json) and already analysed by
 * the AI (fixtures/analyses.json) — like an intake queue that ran before the officer opened the case.
 * No API calls here. Run: npm run seed
 */
import bcrypt from "bcryptjs";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "./client";
import * as s from "./schema";
import {
  DEMO_KITS, GRIEVANCE_CASES, PATTA_CASES, SLA_DAYS, applicationValues, docUrl, lookExt, previewUrl,
  type DocKind, type GrievanceCase,
} from "./cases";
import { registryFor } from "@/lib/case/truth";
import { evaluateGrievance, evaluatePatta, type OtherGrievance } from "@/lib/case/evaluate";
import { fyStart } from "@/lib/case/fy";
import type { DocReading } from "@/lib/docs/read";
import type { Analysis } from "@/lib/ai/analyze";
import { classifyGrievance } from "@/lib/verify/grievance";
import type { GrievancePayload } from "@/lib/types";

const DAY = 86_400_000;
const MIME: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg" };
const fixture = <T>(name: string): T => {
  const p = path.resolve(__dirname, "fixtures", name);
  return (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {}) as T;
};
const READINGS = fixture<Record<string, Partial<Record<DocKind, DocReading>>>>("readings.json");
const ANALYSES = fixture<Record<string, { ta?: Analysis; en?: Analysis }>>("analyses.json");

/** Submitted at 10:30 IST on the given date. */
const submitted = (date: string) => new Date(`${date}T10:30:00+05:30`);

/** Grievance payload: the complaint text is what OCR read from the petition (falls back to the case text if not read yet). */
export function grievancePayload(g: GrievanceCase): GrievancePayload {
  const r = READINGS[g.ref]?.petition;
  const text = r?.text ?? g.petition.text;
  const cls = classifyGrievance({ text, repeatCount: g.repeatCount });
  return { text, textEn: r?.textEn ?? "", location: g.petition.location ?? "", repeatCount: g.repeatCount, category: cls.category };
}

async function main() {
  await db.execute(sql`TRUNCATE ${s.decisions}, ${s.aiAnalyses}, ${s.documents}, ${s.applications}, ${s.citizens}, ${s.officers}, ${s.regSaleDeeds}, ${s.regLandRecords}, ${s.regTaxReceipts}, ${s.regEncumbrances} RESTART IDENTITY CASCADE`);

  await db.insert(s.officers).values({
    username: "tahsildar", passwordHash: await bcrypt.hash("Demo@1234", 10),
    name: "S. Arumugam", nameTa: "சு. ஆறுமுகம்", role: "supervisor", office: "Tahsildar, Ponneri", officeTa: "வட்டாட்சியர், பொன்னேரி",
  });

  // The citizen who applies online in the live demo (kits in public/demo-kits/).
  await db.insert(s.citizens).values({
    username: "citizen", passwordHash: await bcrypt.hash("Demo@1234", 10),
    name: "Selvi G", nameTa: "செல்வி க", village: "Ponneri", villageTa: "பொன்னேரி",
  });

  // Simulated department records (genuine values), for the seeded cases and the demo kits.
  for (const c of [...PATTA_CASES, ...DEMO_KITS]) {
    const r = registryFor(c);
    await db.insert(s.regSaleDeeds).values({ deedNo: c.deed.no, seller: c.seller.name, buyer: c.buyer.name, surveyNo: c.surveyNo, extentCents: c.deed.extentCents, registeredOn: submitted(c.deed.date) });
    await db.insert(s.regLandRecords).values({ surveyNo: c.surveyNo, pattaNo: c.patta.no, currentOwner: c.patta.owner, extentCents: c.deed.extentCents, landClass: "நஞ்சை" });
    await db.insert(s.regTaxReceipts).values({ receiptNo: c.tax.receiptNo, surveyNo: c.surveyNo, paidUpToYear: r.tax!.paidUpToYear, duesAmount: c.tax.dues });
    for (const e of r.encumbrances) await db.insert(s.regEncumbrances).values({ surveyNo: c.surveyNo, kind: e.kind, detail: e.detail });
  }
  // Kit B: the panchayat also holds the receipt for the dues the citizen pays after the file is returned.
  for (const k of DEMO_KITS) {
    if (k.taxLater) await db.insert(s.regTaxReceipts).values({ receiptNo: k.taxLater.receiptNo, surveyNo: k.surveyNo, paidUpToYear: Number(k.taxLater.paidUpTo.slice(0, 4)), duesAmount: k.taxLater.dues });
  }

  const analyses: { applicationId: number; ref: string }[] = [];

  for (const c of PATTA_CASES) {
    const readings = READINGS[c.ref] ?? {};
    const docs = Object.fromEntries((Object.keys(c.docs) as DocKind[]).map((k) => [k, readings[k] ?? pendingReading(k)]));
    const ev = evaluatePatta({ application: applicationValues(c), docs, unrelated: [], registry: registryFor(c), fyStart: fyStart() });
    const at = submitted(c.submittedOn);
    const [row] = await db.insert(s.applications).values({
      refNo: c.ref, type: "patta", applicantName: c.applicant.en, applicantNameTa: c.applicant.ta,
      village: c.village.en, villageTa: c.village.ta, submittedAt: at, slaDueAt: new Date(at.getTime() + SLA_DAYS.patta * DAY),
      payload: applicationValues(c) as unknown as Record<string, unknown>, blockers: ev.blockers, warnings: ev.warnings,
    }).returning({ id: s.applications.id });
    for (const [kind, look] of Object.entries(c.docs) as [DocKind, NonNullable<(typeof c.docs)[keyof typeof c.docs]>][]) {
      await db.insert(s.documents).values({
        applicationId: row.id, kind, fileName: `${kind}.${lookExt(look)}`, mime: MIME[lookExt(look)],
        url: docUrl(c.ref, kind, look), previewUrl: previewUrl(c.ref, kind, look), source: "citizen", uploadedAt: at, reading: readings[kind] ?? null,
      });
    }
    analyses.push({ applicationId: row.id, ref: c.ref });
  }

  const others: OtherGrievance[] = [];
  for (const g of GRIEVANCE_CASES) {
    const p = grievancePayload(g);
    const ev = evaluateGrievance(g.village.en, p, others);
    const at = submitted(g.submittedOn);
    const sla = SLA_DAYS.grievance[ev.cls.category];
    const [row] = await db.insert(s.applications).values({
      refNo: g.ref, type: "grievance", applicantName: g.applicant.en, applicantNameTa: g.applicant.ta,
      village: g.village.en, villageTa: g.village.ta, submittedAt: at, slaDueAt: new Date(at.getTime() + sla * DAY),
      payload: p as unknown as Record<string, unknown>, blockers: ev.blockers, warnings: ev.warnings, urgency: ev.cls.urgency,
    }).returning({ id: s.applications.id });
    const look = g.petition.look;
    await db.insert(s.documents).values({
      applicationId: row.id, kind: "petition", fileName: `petition.${lookExt(look)}`, mime: MIME[lookExt(look)],
      url: docUrl(g.ref, "petition", look), previewUrl: previewUrl(g.ref, "petition", look), source: "citizen", uploadedAt: at, reading: READINGS[g.ref]?.petition ?? null,
    });
    others.push({ refNo: g.ref, village: g.village.en, payload: p });
    analyses.push({ applicationId: row.id, ref: g.ref });
  }

  // AI reviews captured at intake (both languages), so nothing runs when the officer opens a case.
  let n = 0;
  for (const { applicationId, ref } of analyses) {
    for (const locale of ["ta", "en"] as const) {
      const a = ANALYSES[ref]?.[locale];
      if (!a) continue;
      await db.insert(s.aiAnalyses).values({ applicationId, locale, summary: a.summary, findings: a.findings, suggestion: a.suggestion, reasons: a.reasons, draftReply: a.draftReply, source: a.source, model: a.model });
      n++;
    }
  }
  console.log(`Seeded ${PATTA_CASES.length} patta + ${GRIEVANCE_CASES.length} grievances, ${Object.keys(READINGS).length} cases with readings, ${n} AI reviews. Logins: tahsildar / Demo@1234, citizen / Demo@1234`);
}

function pendingReading(kind: DocKind): DocReading {
  return { docType: kind, classifyConfidence: null, reviewRequired: true, values: null, minConfidence: null, engine: "pending", readAt: "" };
}

if (require.main === module) main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
