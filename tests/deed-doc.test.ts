import { describe, expect, it } from "vitest";
import type { DeedReading } from "@/lib/docs/deed";
import { verifyDeedDocument } from "@/lib/verify/deedDoc";
import { summarise } from "@/lib/verify/patta";
import type { PattaPayload } from "@/lib/types";

const payload: PattaPayload = { seller: "கோவிந்தன்", buyer: "மீனா", surveyNo: "201/7", extentCents: 80, saleDeedNo: "SD/0104/2026", taxReceiptNo: "TX/0104" };
const registry = { seller: "கோவிந்தன்", buyer: "மீனா", surveyNo: "201/7", extentCents: 62 };
const reading = (over: Partial<DeedReading["values"] & object> = {}, meta: Partial<DeedReading> = {}): DeedReading => ({
  docType: "sale_deed", classifyConfidence: 1, reviewRequired: false, minConfidence: 1, fileName: "x.pdf", readAt: "",
  values: { deedNo: "SD/0104/2026", seller: "கோவிந்தன்", buyer: "மீனா", surveyNo: "201/7", extentCents: 62, registrationDate: "2026-09-12", saleAmount: 1860000, ...over },
  ...meta,
});
const codes = (r: DeedReading, p = payload) => verifyDeedDocument(r, p, registry).map((f) => f.code);

describe("verifyDeedDocument (three-way check)", () => {
  it("catches the application's extent claim against the uploaded deed", () => {
    expect(codes(reading())).toEqual(["DOC_EXTENT_MISMATCH"]);
  });
  it("passes when the deed matches the application and the registry", () => {
    expect(codes(reading(), { ...payload, extentCents: 62 })).toEqual(["DOC_VERIFIED"]);
  });
  it("blocks a wrong document type and stops there", () => {
    const r = verifyDeedDocument(reading({}, { docType: "ration_card", values: null }), payload, registry);
    expect(r.map((f) => f.code)).toEqual(["DOC_WRONG_TYPE"]);
    expect(summarise(r).suggestion).toBe("return");
  });
  it("flags a paper deed that disagrees with the registered record", () => {
    expect(codes(reading({ buyer: "கண்ணன்" }), { ...payload, buyer: "கண்ணன்", extentCents: 62 })).toEqual(["DOC_REGISTRY_MISMATCH"]);
  });
  it("warns on low reading confidence", () => {
    expect(codes(reading({}, { minConfidence: 0.4 }), { ...payload, extentCents: 62 })).toEqual(["DOC_LOW_CONFIDENCE"]);
  });
  it("compares Roman-letter deeds using the stored Roman map", () => {
    const r = reading({ seller: "Govindan", buyer: "Meena" }, { roman: { "கோவிந்தன்": "Govindan", "மீனா": "Meena" } });
    expect(codes(r, { ...payload, extentCents: 62 })).toEqual(["DOC_VERIFIED"]);
  });
});

describe("summarise", () => {
  it("drops 'all clear' notes once a real issue exists", () => {
    const s = summarise([
      { code: "ALL_CLEAR", severity: "ok", ta: "", en: "" },
      { code: "DOC_EXTENT_MISMATCH", severity: "blocker", ta: "", en: "" },
    ]);
    expect(s.findings.map((f) => f.code)).toEqual(["DOC_EXTENT_MISMATCH"]);
    expect(s.suggestion).toBe("return");
  });
});

import { romanKey } from "@/lib/verify/fuzzy";

describe("romanKey (cross-script names)", () => {
  it("treats Tamil's single k/g, t/d, p/b letters and doubled letters as the same sound", () => {
    expect(romanKey("Govindan")).toBe(romanKey("Kovindan"));
    expect(romanKey("Karthikkeyan")).toBe(romanKey("Karthikeyan"));
    expect(romanKey("Meenaa")).toBe(romanKey("Mina"));
  });
  it("still separates genuinely different names", () => {
    expect(romanKey("Selvam")).not.toBe(romanKey("Sevalam"));
    expect(romanKey("Velu")).not.toBe(romanKey("Rajesh"));
  });
  it("lets a Roman deed match the transliterated Tamil application", () => {
    const r = reading({ seller: "Govindan", buyer: "Meena" }, { roman: { "கோவிந்தன்": "Kovindan", "மீனா": "Meena" } });
    expect(codes(r, { ...payload, extentCents: 62 })).toEqual(["DOC_VERIFIED"]);
  });
});

describe("cross-script policy", () => {
  it("never blocks on a Roman-letter name that fails to match; asks the officer to confirm", () => {
    // Real Sarvam output: "செல்வம்" transliterates to "Sevalam", so "Selvam" on the deed doesn't match.
    const p: PattaPayload = { ...payload, buyer: "செல்வம்", extentCents: 62 };
    const r = reading({ buyer: "Selvam" }, { roman: { "செல்வம்": "Sevalam", "கோவிந்தன்": "Kovindan" } });
    const out = verifyDeedDocument(r, p, { ...registry, buyer: "செல்வம்" });
    expect(out.map((f) => f.code)).toEqual(["DOC_BUYER_SCRIPT_CHECK"]);
    expect(out[0].severity).toBe("warning");
  });
});
