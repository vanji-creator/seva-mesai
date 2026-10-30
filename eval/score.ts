import { romanKey, similarity } from "@/lib/verify/fuzzy";
import { verifyPatta } from "@/lib/verify/patta";
import type { PattaPayload, Suggestion } from "@/lib/types";
import type { DeedFields, EvalCase } from "./cases";

export const FIELDS = ["deedNo", "seller", "buyer", "surveyNo", "extentCents", "registrationDate", "saleAmount"] as const;
export type Field = (typeof FIELDS)[number];
export type Extracted = Partial<Record<Field, string | number | null>>;

const TAMIL = /[஀-௿]/;
export const isTamil = (s: string) => TAMIL.test(s);

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const code = (v: unknown) => String(v ?? "").replace(/\s+/g, "").toUpperCase();

/** Accepts YYYY-MM-DD or DD-MM-YYYY (and / or . separators). */
export function normDate(v: unknown): string | null {
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/**
 * Name compare. `roman` maps a Tamil name to Roman (only used when scripts differ);
 * `phonetic` additionally compares sound-alike keys (k/g, t/d, p/b, doubled letters).
 */
export function nameMatches(truth: string, got: unknown, roman?: Map<string, string>, phonetic = false): boolean {
  const g = String(got ?? "").trim();
  if (!g) return false;
  if (roman && isTamil(truth) !== isTamil(g)) {
    const key = phonetic ? romanKey : (s: string) => s;
    const a = key(isTamil(truth) ? roman.get(truth) ?? truth : truth);
    const b = key(isTamil(g) ? roman.get(g) ?? g : g);
    return similarity(a, b) >= 0.85;
  }
  return similarity(truth, g) >= 0.9;
}

export function fieldCorrect(f: Field, truth: DeedFields, got: Extracted, roman?: Map<string, string>, phonetic = false): boolean {
  const v = got[f];
  switch (f) {
    case "deedNo":
    case "surveyNo":
      return code(v) === code(truth[f]);
    case "extentCents":
    case "saleAmount":
      return num(v) === truth[f];
    case "registrationDate":
      return normDate(v) === truth.registrationDate;
    case "seller":
    case "buyer":
      return nameMatches(truth[f], v, roman, phonetic);
  }
}

export interface Decision {
  suggestion: Suggestion;
  codes: string[];
}

/**
 * What the officer would be told if this extraction were the deed evidence.
 * Script-aware: if the deed names came back in Roman letters, compare in Roman.
 */
export function decide(c: EvalCase, deed: Extracted, roman?: Map<string, string>, phonetic = false): Decision {
  const latinDeed = roman && [deed.seller, deed.buyer].some((n) => typeof n === "string" && n && !isTamil(n));
  const key = latinDeed && phonetic ? romanKey : (s: string) => s;
  const r = (s: string) => key(roman?.get(s) ?? s);
  const payload: PattaPayload = latinDeed
    ? { ...c.application, seller: r(c.application.seller), buyer: r(c.application.buyer) }
    : c.application;
  const v = verifyPatta({
    payload,
    presentDocs: ["application_form", "sale_deed", "tax_receipt", "ec", "id_proof"],
    evidence: {
      deed: {
        seller: key(String(deed.seller ?? "")),
        buyer: key(String(deed.buyer ?? "")),
        surveyNo: String(deed.surveyNo ?? "").replace(/\s+/g, ""),
        extentCents: num(deed.extentCents) ?? 0,
      },
      land: { currentOwner: latinDeed ? r(c.landOwner) : c.landOwner, extentCents: c.deed.extentCents },
      tax: { surveyNo: c.deed.surveyNo, paidUpToYear: 2026, duesAmount: 0 },
      encumbrances: [],
    },
    currentYear: 2026,
  });
  return { suggestion: v.suggestion, codes: v.reasonCodes.slice().sort() };
}

export const truthAsExtracted = (d: DeedFields): Extracted => ({ ...d });

export const sameDecision = (a: Decision, b: Decision) =>
  a.suggestion === b.suggestion && a.codes.join() === b.codes.join();
