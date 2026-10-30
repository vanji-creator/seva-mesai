import { classifyDocument, extractFields, parseToMarkdown, toRoman, translate, type DocFile } from "@/lib/sarvam/client";
import type { DocKind } from "@/db/cases";
import { DEED_SCHEMA, checkedConfidences, isTamil } from "./deed";

/**
 * One reading pipeline for every document an officer can receive:
 *   Classify (what is this?) -> Extract with that type's field list, or OCR + translate for petitions.
 * The result is stored on the document row; checks and the AI work from it, never from the raw file.
 */

export type ReadKind = DocKind | "ration_card" | "other";

export interface DocReading {
  docType: ReadKind | null;
  classifyConfidence: number | null;
  reviewRequired: boolean;
  /** Extracted fields, normalised (numbers as numbers, survey numbers without spaces). */
  values: Record<string, unknown> | null;
  /** Lowest per-field confidence on the fields the checks use (null if not given). */
  minConfidence: number | null;
  /** Petitions: OCR text and its English translation. */
  text?: string;
  textEn?: string;
  /** Tamil name -> Roman letters, only when a document's names are in Roman letters. */
  roman?: Record<string, string>;
  engine: string;
  readAt: string;
}

const s = (description: string) => ({ type: "string", description });
const n = (description: string) => ({ type: "number", description });

/** Field lists = the extraction "prompt" per document type. Each field needs a description (API rule). */
export const SCHEMAS: Partial<Record<DocKind, object>> = {
  sale_deed: DEED_SCHEMA,
  application_form: {
    type: "object",
    properties: {
      application_no: s("Application number, e.g. PT-2026-0201"),
      seller: s("Seller name exactly as written"),
      buyer: s("Buyer / applicant name exactly as written, without father's name"),
      survey_no: s("Survey number, e.g. 112/3"),
      extent_cents: n("Extent in cents, number only"),
      deed_no: s("Sale deed number, e.g. 3812/2026"),
      tax_receipt_no: s("Property tax receipt number"),
    },
  },
  patta: {
    type: "object",
    properties: {
      patta_no: s("Patta number"),
      owner: s("Owner name exactly as written, without father's name"),
      survey_no: s("Survey number / subdivision, e.g. 112/3"),
      extent_hectare_ares: s("Extent as printed in hectare - ares, e.g. 0 - 19.42"),
      village: s("Village name"),
    },
  },
  ec: {
    type: "object",
    properties: {
      survey_no: s("Survey number of the property in the certificate"),
      period_to: s("End date of the search period as YYYY-MM-DD"),
      entries: {
        type: "array",
        description: "Every transaction row in the certificate table",
        items: {
          type: "object",
          properties: {
            date: s("Transaction date as YYYY-MM-DD"),
            nature: { type: "string", description: "Nature of the transaction", enum: ["sale", "mortgage", "release", "court_attachment", "other"] },
            doc_no: s("Document number"),
            parties: s("Executant and claimant as written"),
            detail: s("Amount or remarks as written"),
          },
        },
      },
    },
  },
  tax_receipt: {
    type: "object",
    properties: {
      receipt_no: s("Receipt number"),
      survey_no: s("Survey number"),
      payer: s("Name of the person who paid"),
      paid_up_to: s("Financial year paid up to, e.g. 2026-27"),
      paid_amount: n("Amount paid in rupees, number only"),
      dues_amount: n("Outstanding dues in rupees, number only; 0 if none"),
    },
  },
  id_proof: {
    type: "object",
    properties: {
      name: s("Card holder name exactly as written"),
      id_number: s("ID number as printed (may be masked)"),
      dob: s("Date of birth as YYYY-MM-DD"),
    },
  },
};

export const CATEGORIES = [
  { type: "application_form", description: "Online patta transfer application form (பட்டா பெயர் மாற்ற விண்ணப்பம்) listing applicant, survey number and attached documents" },
  { type: "sale_deed", description: "Sale deed (கிரையப் பத்திரம்) transferring land from a seller to a buyer, with deed number, survey number and extent" },
  { type: "patta", description: "Patta / chitta land ownership record (நில உரிமை விவரங்கள்) with patta number, owner and extent in hectare-ares" },
  { type: "ec", description: "Encumbrance certificate (வில்லங்கச் சான்றிதழ், Form 16) with a table of registered transactions" },
  { type: "tax_receipt", description: "Property tax receipt (சொத்து வரி ரசீது) from a panchayat with amount paid and dues" },
  { type: "id_proof", description: "Personal identity card with name, date of birth and ID number" },
  { type: "petition", description: "A letter or petition from a citizen to an officer describing a complaint (மனு)" },
  { type: "ration_card", description: "Family ration card (குடும்ப அட்டை)" },
];

const num = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(x) ? x : null;
};
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const survey = (v: unknown) => str(v)?.replace(/\s+/g, "") ?? null;

/**
 * Extract was given an English enum for the transaction type but returned the Tamil word
 * printed on the certificate ("அடமானம்"), so map both.
 */
export function ecNature(v: unknown): "sale" | "mortgage" | "release" | "court_attachment" | "other" {
  const t = String(v ?? "").toLowerCase();
  if (/release|விடுவிப்பு|ரசீது/.test(t)) return "release";
  if (/mortgage|அடமான/.test(t)) return "mortgage";
  if (/court|attach|ஜப்தி|நீதிமன்ற/.test(t)) return "court_attachment";
  if (/sale|கிரைய|விற்பனை/.test(t)) return "sale";
  return "other";
}

/** Normalise raw Extract output so checks compare like with like. */
export function normalise(kind: DocKind, r: Record<string, unknown>): Record<string, unknown> {
  switch (kind) {
    case "sale_deed":
      return { deedNo: str(r.deed_no), seller: str(r.seller), buyer: str(r.buyer), surveyNo: survey(r.survey_no), extentCents: num(r.extent_cents), registrationDate: str(r.registration_date), saleAmount: num(r.sale_amount_inr) };
    case "application_form":
      return { applicationNo: str(r.application_no), seller: str(r.seller), buyer: str(r.buyer), surveyNo: survey(r.survey_no), extentCents: num(r.extent_cents), deedNo: str(r.deed_no), taxReceiptNo: str(r.tax_receipt_no) };
    case "patta": {
      const m = String(r.extent_hectare_ares ?? "").match(/(\d+)\s*[-–.]\s*(\d+(?:\.\d+)?)/);
      const ares = m ? Number(m[1]) * 100 + Number(m[2]) : null;
      return { pattaNo: str(r.patta_no), owner: str(r.owner), surveyNo: survey(r.survey_no), extentAres: ares, village: str(r.village) };
    }
    case "ec": {
      const entries = Array.isArray(r.entries) ? (r.entries as Record<string, unknown>[]) : [];
      return {
        surveyNo: survey(r.survey_no),
        periodTo: str(r.period_to),
        entries: entries.map((e) => ({ date: str(e.date), nature: ecNature(e.nature), docNo: str(e.doc_no), parties: str(e.parties), detail: str(e.detail) })),
      };
    }
    case "tax_receipt":
      return { receiptNo: str(r.receipt_no), surveyNo: survey(r.survey_no), payer: str(r.payer), paidUpTo: str(r.paid_up_to), paidAmount: num(r.paid_amount), dues: num(r.dues_amount) ?? 0 };
    case "id_proof":
      return { name: str(r.name), idNumber: str(r.id_number), dob: str(r.dob) };
    default:
      return r;
  }
}

/** Names that may need Roman comparison, per kind. */
const NAME_FIELDS: Partial<Record<DocKind, string[]>> = {
  sale_deed: ["seller", "buyer"], application_form: ["seller", "buyer"], patta: ["owner"], tax_receipt: ["payer"], id_proof: ["name"],
};

/**
 * Read one file. Without a hint, Classify runs first and wrong documents stop there (cheaper:
 * a ration card uploaded as "the deed" never reaches extraction). With `expected` (intake, where
 * the citizen labelled each attachment), Classify and the reading run in parallel to halve
 * latency — and Classify still decides: if it disagrees, the reading is discarded.
 */
export async function readDocument(file: DocFile, tamilNames: string[] = [], expected?: DocKind): Promise<DocReading> {
  if (expected) {
    const [cls, early] = await Promise.all([
      classifyDocument(file, CATEGORIES),
      expected === "petition" ? parseToMarkdown(file).then((md) => ({ md })) : SCHEMAS[expected] ? extractFields(file, SCHEMAS[expected]!).then((ex) => ({ ex })) : Promise.resolve({}),
    ]);
    return finish(file, cls, tamilNames, cls.type === expected ? early : {});
  }
  return finish(file, await classifyDocument(file, CATEGORIES), tamilNames, {});
}

async function finish(
  file: DocFile,
  cls: Awaited<ReturnType<typeof classifyDocument>>,
  tamilNames: string[],
  early: { md?: string; ex?: Awaited<ReturnType<typeof extractFields>> },
): Promise<DocReading> {
  const docType = (cls.type ?? null) as ReadKind | null;
  const base: DocReading = {
    docType,
    classifyConfidence: cls.confidence,
    reviewRequired: cls.review_required,
    values: null,
    minConfidence: null,
    engine: "sarvam-vision",
    readAt: new Date().toISOString(),
  };

  if (docType === "petition") {
    const md = early.md ?? (await parseToMarkdown(file));
    const text = md
      .replace(/<[^>]+>/g, " ")
      .replace(/[#*_>]/g, "")
      .replace(/\s+\n/g, "\n")
      // Drop the demo's own "fictional document" footer so it isn't treated as part of the complaint.
      .split("\n").filter((l) => !/கற்பனையான மாதிரி|உண்மையான நபர்கள்|சொத்துகளுடன் தொடர்பில்லை/.test(l)).join("\n")
      .trim();
    const textEn = await translate(text.slice(0, 990), "ta-IN", "en-IN");
    return { ...base, text, textEn };
  }

  const schema = docType ? SCHEMAS[docType as DocKind] : undefined;
  if (!schema) return base;

  const ex = early.ex ?? (await extractFields(file, schema));
  const values = normalise(docType as DocKind, ex.result);
  const conf = checkedConfidences(ex.annotations, Object.keys((schema as { properties: object }).properties).filter((k) => k !== "registration_date"));

  // Script-aware names: only when a document's names are in Roman letters do we romanise the Tamil side.
  let roman: Record<string, string> | undefined;
  const names = (NAME_FIELDS[docType as DocKind] ?? []).map((k) => values[k]).filter((x): x is string => typeof x === "string");
  if (names.some((x) => !isTamil(x))) {
    roman = {};
    for (const t of new Set(tamilNames.filter(isTamil))) roman[t] = await toRoman(t);
  }
  return { ...base, values, minConfidence: conf.length ? Math.min(...conf) : null, roman };
}
