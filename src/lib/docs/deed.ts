import { classifyDocument, extractFields, toRoman, type DocFile } from "@/lib/sarvam/client";

/** Field descriptions are the extraction "prompt" for Sarvam Extract (the API requires one per field). */
export const DEED_SCHEMA = {
  type: "object",
  properties: {
    deed_no: { type: "string", description: "Sale deed number exactly as printed, e.g. SD/0104/2026" },
    seller: { type: "string", description: "Seller (விற்பவர்) name exactly as written, in the script used in the document, without father's name" },
    buyer: { type: "string", description: "Buyer (வாங்குபவர்) name exactly as written, in the script used in the document, without father's name" },
    survey_no: { type: "string", description: "Survey number (சர்வே எண்), e.g. 201/7" },
    extent_cents: { type: "number", description: "Land extent (பரப்பு) in cents, number only" },
    registration_date: { type: "string", description: "Registration date (பதிவு நாள்) as YYYY-MM-DD" },
    sale_amount_inr: { type: "number", description: "Sale consideration (கிரையத் தொகை) in rupees, number only" },
  },
};

export const DOC_CATEGORIES = [
  { type: "sale_deed", description: "Tamil sale deed (கிரையப் பத்திரம்) transferring land from a seller to a buyer, with survey number and extent" },
  { type: "ration_card", description: "Family ration card (குடும்ப அட்டை) listing household members" },
  { type: "tax_receipt", description: "Property tax payment receipt with amount paid and year" },
];

export interface DeedValues {
  deedNo: string | null;
  seller: string | null;
  buyer: string | null;
  surveyNo: string | null;
  extentCents: number | null;
  registrationDate: string | null;
  saleAmount: number | null;
}

/** What we store on the `documents` row after reading an uploaded deed. */
export interface DeedReading {
  docType: string | null;
  classifyConfidence: number | null;
  reviewRequired: boolean;
  values: DeedValues | null;
  /** Lowest per-field confidence Extract reported (null if not given). */
  minConfidence: number | null;
  /** Tamil name -> Roman, filled only when the deed names are in Roman letters. */
  roman?: Record<string, string>;
  fileName: string;
  readAt: string;
}

const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
  return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n;
};
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
export const isTamil = (s: string) => /[஀-௿]/.test(s);

/**
 * Confidence only of the fields the checks use. Excludes the date: Extract scored correct dates
 * ~0.13 on 12 of 20 eval docs because it reformats DD-MM-YYYY to YYYY-MM-DD, so that score is noise.
 */
const CHECKED = ["deed_no", "seller", "buyer", "survey_no", "extent_cents"];
export function checkedConfidences(annotations?: Record<string, { confidence: number | null }>): number[] {
  return CHECKED.map((k) => annotations?.[k]?.confidence).filter((x): x is number => typeof x === "number");
}

/**
 * Classify first (wrong uploads stop here, saving the extraction call), then Extract.
 * Pipeline choice comes from the eval (eval/RESULTS.md).
 */
export async function readDeed(file: DocFile, applicationNames: string[]): Promise<DeedReading> {
  const cls = await classifyDocument(file, DOC_CATEGORIES);
  const base = {
    docType: cls.type,
    classifyConfidence: cls.confidence,
    reviewRequired: cls.review_required,
    fileName: file.name,
    readAt: new Date().toISOString(),
  };
  if (cls.type !== "sale_deed") return { ...base, values: null, minConfidence: null };

  const ex = await extractFields(file, DEED_SCHEMA);
  const r = ex.result;
  const values: DeedValues = {
    deedNo: str(r.deed_no),
    seller: str(r.seller),
    buyer: str(r.buyer),
    surveyNo: str(r.survey_no)?.replace(/\s+/g, "") ?? null,
    extentCents: num(r.extent_cents),
    registrationDate: str(r.registration_date),
    saleAmount: num(r.sale_amount_inr),
  };
  const conf = checkedConfidences(ex.annotations);

  // Script-aware names: only when the deed is in Roman letters do we romanise the Tamil side.
  // Never Roman -> Tamil: in testing it leaked Malayalam glyphs.
  let roman: Record<string, string> | undefined;
  if ([values.seller, values.buyer].some((n) => n && !isTamil(n))) {
    roman = {};
    for (const n of new Set(applicationNames.filter(isTamil))) roman[n] = await toRoman(n);
  }
  return { ...base, values, minConfidence: conf.length ? Math.min(...conf) : null, roman };
}
