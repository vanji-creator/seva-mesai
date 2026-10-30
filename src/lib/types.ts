export type Locale = "ta" | "en";
export type AppType = "patta" | "grievance";
export type Suggestion = "approve" | "reject" | "return";
export type Severity = "blocker" | "warning" | "ok";

/** One deterministic check result. `ta`/`en` are officer-facing sentences. */
export interface Finding {
  code: string;
  severity: Severity;
  ta: string;
  en: string;
  /** Where the evidence came from, e.g. "பதிவுத்துறை" */
  source?: string;
  /** Documents / records that show this (document kinds, "application" or "registry"), for linking in the UI. */
  refs?: string[];
}

export interface PattaPayload {
  seller: string;
  buyer: string;
  surveyNo: string;
  extentCents: number;
  saleDeedNo: string;
  taxReceiptNo: string;
}

export interface GrievancePayload {
  text: string;
  textEn: string;
  category?: string;
  location: string;
  repeatCount: number;
}

export const PATTA_REQUIRED_DOCS = [
  "application_form",
  "sale_deed",
  "tax_receipt",
  "ec",
  "id_proof",
] as const;
