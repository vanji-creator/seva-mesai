/* Fictional data only. Run: npm run seed (resets the demo dataset). */
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "./client";
import * as s from "./schema";
import { fetchEvidence } from "@/lib/registry/client";
import { summarise, verifyPatta } from "@/lib/verify/patta";
import { verifyDeedDocument } from "@/lib/verify/deedDoc";
import type { DeedReading } from "@/lib/docs/deed";
import readingsJson from "./seed-readings.json";

/** Deed readings captured from real Sarvam runs during the eval (eval/export-readings.ts) — no API calls at seed time. */
const READINGS = readingsJson as unknown as Record<string, DeedReading>;
import { classifyGrievance, verifyGrievance } from "@/lib/verify/grievance";
import { PATTA_REQUIRED_DOCS, type GrievancePayload, type PattaPayload } from "@/lib/types";

const DAY = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * DAY);
const ahead = (d: number) => new Date(Date.now() + d * DAY);
const YEAR = new Date().getFullYear();

interface PattaCase {
  ref: string;
  applicant: [string, string]; // [en, ta]
  village: [string, string];
  seller: string;
  buyer: string;
  survey: string;
  extent: number;
  submittedDaysAgo: number;
  slaDaysLeft: number;
  /** registry truth differs from the application in these ways */
  reg?: Partial<{
    deedBuyer: string;
    deedSeller: string;
    deedSurvey: string;
    deedExtent: number;
    owner: string;
    taxPaidUpTo: number;
    taxDues: number;
    noDeed: boolean;
    enc: { kind: "mortgage" | "litigation"; detail: string };
  }>;
  missingDocs?: string[];
}

const PATTA: PattaCase[] = [
  { ref: "PT-2026-0101", applicant: ["Selvam K", "செல்வம் க"], village: ["Ponneri", "பொன்னேரி"], seller: "முருகன்", buyer: "செல்வம்", survey: "123/4", extent: 50, submittedDaysAgo: 4, slaDaysLeft: 26 },
  { ref: "PT-2026-0102", applicant: ["Lakshmi R", "லட்சுமி ரா"], village: ["Minjur", "மீஞ்சூர்"], seller: "ராமசாமி", buyer: "லட்சுமி", survey: "88/2A", extent: 30, submittedDaysAgo: 12, slaDaysLeft: 18, missingDocs: ["ec"] },
  { ref: "PT-2026-0103", applicant: ["Karthikeyan S", "கார்த்திகேயன் சு"], village: ["Gummidipoondi", "கும்மிடிப்பூண்டி"], seller: "அண்ணாமலை", buyer: "கார்த்திகேயன்", survey: "45/1", extent: 120, submittedDaysAgo: 9, slaDaysLeft: 21, reg: { deedBuyer: "கார்த்திக்கேயன்" } },
  { ref: "PT-2026-0104", applicant: ["Meena P", "மீனா பா"], village: ["Ponneri", "பொன்னேரி"], seller: "கோவிந்தன்", buyer: "மீனா", survey: "201/7", extent: 80, submittedDaysAgo: 18, slaDaysLeft: 12, reg: { deedExtent: 62 } },
  { ref: "PT-2026-0105", applicant: ["Dhanapal V", "தனபால் வே"], village: ["Avadi", "ஆவடி"], seller: "சுப்பிரமணி", buyer: "தனபால்", survey: "310/5", extent: 40, submittedDaysAgo: 22, slaDaysLeft: 8, reg: { taxPaidUpTo: YEAR - 3, taxDues: 3450 } },
  { ref: "PT-2026-0106", applicant: ["Fathima B", "பாத்திமா பீ"], village: ["Minjur", "மீஞ்சூர்"], seller: "அப்துல்", buyer: "பாத்திமா", survey: "17/9", extent: 25, submittedDaysAgo: 14, slaDaysLeft: 16, reg: { enc: { kind: "mortgage", detail: "இந்தியன் வங்கி, மீஞ்சூர் – ₹4,50,000" } } },
  { ref: "PT-2026-0107", applicant: ["Rajesh T", "ராஜேஷ் தெ"], village: ["Gummidipoondi", "கும்மிடிப்பூண்டி"], seller: "வேலு", buyer: "ராஜேஷ்", survey: "66/3", extent: 60, submittedDaysAgo: 27, slaDaysLeft: 3, reg: { owner: "பழனிசாமி" } },
  { ref: "PT-2026-0108", applicant: ["Kavitha M", "கவிதா மு"], village: ["Ponneri", "பொன்னேரி"], seller: "சின்னசாமி", buyer: "கவிதா", survey: "142/1", extent: 90, submittedDaysAgo: 33, slaDaysLeft: -3, reg: { enc: { kind: "litigation", detail: "OS 214/2025 – சார்பு நீதிமன்றம், பொன்னேரி" } } },
  { ref: "PT-2026-0109", applicant: ["Anand G", "ஆனந்த் கோ"], village: ["Avadi", "ஆவடி"], seller: "மணி", buyer: "ஆனந்த்", survey: "9/12", extent: 35, submittedDaysAgo: 8, slaDaysLeft: 22, reg: { noDeed: true } },
  { ref: "PT-2026-0110", applicant: ["Revathi N", "ரேவதி நா"], village: ["Minjur", "மீஞ்சூர்"], seller: "கந்தசாமி", buyer: "ரேவதி", survey: "72/6", extent: 55, submittedDaysAgo: 31, slaDaysLeft: -1 },
];

interface GrvCase {
  ref: string;
  applicant: [string, string];
  village: [string, string];
  text: string;
  textEn: string;
  location: string;
  repeatCount: number;
  submittedDaysAgo: number;
}

const GRV: GrvCase[] = [
  { ref: "GR-2026-0201", applicant: ["Sundari A", "சுந்தரி அ"], village: ["Ponneri", "பொன்னேரி"], text: "எங்கள் தெருவில் குடிநீர் மூன்று நாட்களாக வரவில்லை. குழந்தைகளுக்கு காய்ச்சல் உள்ளது.", textEn: "No drinking water in our street for three days; children have fever.", location: "காந்தி தெரு, பொன்னேரி", repeatCount: 2, submittedDaysAgo: 2 },
  { ref: "GR-2026-0202", applicant: ["Bala S", "பாலா சு"], village: ["Avadi", "ஆவடி"], text: "பேருந்து நிலையம் அருகே சாலையில் பெரிய குழி உள்ளது.", textEn: "Large pothole on the road near the bus stand.", location: "பேருந்து நிலையம், ஆவடி", repeatCount: 1, submittedDaysAgo: 5 },
  { ref: "GR-2026-0203", applicant: ["Ilango D", "இளங்கோ தெ"], village: ["Minjur", "மீஞ்சூர்"], text: "பள்ளி வாசல் முன் குப்பை குவிந்து கொசு தொல்லை.", textEn: "Garbage piled before the school gate; mosquito nuisance.", location: "அரசு பள்ளி, மீஞ்சூர்", repeatCount: 1, submittedDaysAgo: 6 },
  { ref: "GR-2026-0204", applicant: ["Parvathi K", "பார்வதி க"], village: ["Minjur", "மீஞ்சூர்"], text: "பள்ளி அருகில் குப்பை அகற்றப்படவில்லை, கொசு அதிகம்.", textEn: "Garbage near school not cleared; many mosquitoes.", location: "அரசு பள்ளி, மீஞ்சூர்", repeatCount: 1, submittedDaysAgo: 4 },
  { ref: "GR-2026-0205", applicant: ["Mohan R", "மோகன் ரா"], village: ["Gummidipoondi", "கும்மிடிப்பூண்டி"], text: "வணக்கம், எனக்கு உதவி வேண்டும்.", textEn: "Hello, I need help.", location: "", repeatCount: 1, submittedDaysAgo: 1 },
];

async function main() {
  await db.execute(sql`TRUNCATE ${s.decisions}, ${s.aiAnalyses}, ${s.documents}, ${s.applications}, ${s.officers}, ${s.regSaleDeeds}, ${s.regLandRecords}, ${s.regTaxReceipts}, ${s.regEncumbrances} RESTART IDENTITY CASCADE`);

  const pw = await bcrypt.hash("Demo@1234", 10);
  await db.insert(s.officers).values([
    { username: "ri.ponneri", passwordHash: pw, name: "R. Kalaivani", nameTa: "இரா. கலைவாணி", role: "officer", office: "Revenue Inspector, Ponneri", officeTa: "வருவாய் ஆய்வாளர், பொன்னேரி" },
    { username: "tahsildar", passwordHash: pw, name: "S. Arumugam", nameTa: "சு. ஆறுமுகம்", role: "supervisor", office: "Tahsildar, Ponneri", officeTa: "வட்டாட்சியர், பொன்னேரி" },
  ]);

  for (const c of PATTA) {
    const r = c.reg ?? {};
    if (!r.noDeed) {
      await db.insert(s.regSaleDeeds).values({
        deedNo: `SD/${c.ref.slice(-4)}/2026`,
        seller: r.deedSeller ?? c.seller,
        buyer: r.deedBuyer ?? c.buyer,
        surveyNo: r.deedSurvey ?? c.survey,
        extentCents: r.deedExtent ?? c.extent,
        registeredOn: ago(c.submittedDaysAgo + 20),
      });
    }
    await db.insert(s.regLandRecords).values({ surveyNo: c.survey, currentOwner: r.owner ?? c.seller, extentCents: c.extent, landClass: "நஞ்சை" });
    await db.insert(s.regTaxReceipts).values({
      receiptNo: `TX/${c.ref.slice(-4)}`,
      surveyNo: c.survey,
      paidUpToYear: r.taxPaidUpTo ?? YEAR,
      duesAmount: r.taxDues ?? 0,
    });
    if (r.enc) await db.insert(s.regEncumbrances).values({ surveyNo: c.survey, ...r.enc });
  }

  for (const c of PATTA) {
    const payload: PattaPayload = {
      seller: c.seller,
      buyer: c.buyer,
      surveyNo: c.survey,
      extentCents: c.extent,
      saleDeedNo: `SD/${c.ref.slice(-4)}/2026`,
      taxReceiptNo: `TX/${c.ref.slice(-4)}`,
    };
    const present = PATTA_REQUIRED_DOCS.filter((d) => !(c.missingDocs ?? []).includes(d));
    const evidence = await fetchEvidence(payload);
    const reading = READINGS[c.ref] ?? null;
    const v = summarise([
      ...verifyPatta({ payload, presentDocs: [...present], evidence, currentYear: YEAR }).findings,
      ...(reading ? verifyDeedDocument(reading, payload, evidence.deed) : []),
    ]);
    const [row] = await db
      .insert(s.applications)
      .values({
        refNo: c.ref,
        type: "patta",
        applicantName: c.applicant[0],
        applicantNameTa: c.applicant[1],
        village: c.village[0],
        villageTa: c.village[1],
        submittedAt: ago(c.submittedDaysAgo),
        slaDueAt: ahead(c.slaDaysLeft),
        payload: payload as unknown as Record<string, unknown>,
        blockers: v.blockers,
        warnings: v.warnings,
      })
      .returning({ id: s.applications.id });
    await db.insert(s.documents).values(
      PATTA_REQUIRED_DOCS.map((kind) => ({ applicationId: row.id, kind, present: present.includes(kind), reading: kind === "sale_deed" ? reading : null })),
    );
  }

  for (const c of GRV) {
    const payload: GrievancePayload = { text: c.text, textEn: c.textEn, location: c.location, repeatCount: c.repeatCount };
    const v = verifyGrievance(payload);
    const cls = classifyGrievance(payload);
    await db.insert(s.applications).values({
      refNo: c.ref,
      type: "grievance",
      applicantName: c.applicant[0],
      applicantNameTa: c.applicant[1],
      village: c.village[0],
      villageTa: c.village[1],
      submittedAt: ago(c.submittedDaysAgo),
      slaDueAt: new Date(ago(c.submittedDaysAgo).getTime() + cls.slaDays * DAY),
      payload: { ...payload, category: cls.category } as unknown as Record<string, unknown>,
      blockers: v.blockers,
      warnings: v.warnings,
      urgency: cls.urgency,
    });
  }

  console.log(`Seeded ${PATTA.length} patta + ${GRV.length} grievances. Login: ri.ponneri / tahsildar, password Demo@1234`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
