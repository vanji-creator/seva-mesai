import { describe, expect, it } from "vitest";
import { verifyPatta } from "@/lib/verify/patta";
import type { PattaInput, RegistryEvidence } from "@/lib/verify/types";

const evidence: RegistryEvidence = {
  deed: { seller: "முருகன்", buyer: "செல்வம்", surveyNo: "123/4", extentCents: 50 },
  land: { currentOwner: "முருகன்", extentCents: 50 },
  tax: { surveyNo: "123/4", paidUpToYear: 2026, duesAmount: 0 },
  encumbrances: [],
};
const base: PattaInput = {
  payload: { seller: "முருகன்", buyer: "செல்வம்", surveyNo: "123/4", extentCents: 50, saleDeedNo: "D1", taxReceiptNo: "T1" },
  presentDocs: ["application_form", "sale_deed", "tax_receipt", "ec", "id_proof"],
  evidence,
  currentYear: 2026,
};
const codes = (i: PattaInput) => verifyPatta(i).findings.map((f) => f.code);

describe("verifyPatta", () => {
  it("passes a clean file and suggests approve", () => {
    const r = verifyPatta(base);
    expect(r.suggestion).toBe("approve");
    expect(codes(base)).toEqual(["ALL_CLEAR"]);
  });

  it("flags a missing document as a blocker -> return", () => {
    const i = { ...base, presentDocs: ["application_form", "sale_deed", "tax_receipt", "id_proof"] };
    const r = verifyPatta(i);
    expect(codes(i)).toContain("DOC_MISSING_EC");
    expect(r.suggestion).toBe("return");
  });

  it("tolerates small spelling drift but warns", () => {
    const i = { ...base, payload: { ...base.payload, buyer: "செல்வமணி" } };
    expect(codes(i)).toContain("BUYER_NAME_SPELLING");
    expect(verifyPatta(i).suggestion).toBe("return");
  });

  it("blocks a different buyer entirely", () => {
    const i = { ...base, payload: { ...base.payload, buyer: "கண்ணன்" } };
    expect(codes(i)).toContain("BUYER_NAME_MISMATCH");
  });

  it("flags extent mismatch, blocker above 10%", () => {
    const i = { ...base, payload: { ...base.payload, extentCents: 40 } };
    const f = verifyPatta(i).findings.find((x) => x.code === "EXTENT_MISMATCH");
    expect(f?.severity).toBe("blocker");
  });

  it("rejects when seller is not the current owner", () => {
    const i = { ...base, evidence: { ...evidence, land: { currentOwner: "ராமசாமி", extentCents: 50 } } };
    expect(verifyPatta(i).suggestion).toBe("reject");
  });

  it("blocks on tax dues and mortgage, rejects on litigation", () => {
    const dues = { ...base, evidence: { ...evidence, tax: { surveyNo: "123/4", paidUpToYear: 2024, duesAmount: 1800 } } };
    expect(codes(dues)).toContain("TAX_DUES");
    const mort = { ...base, evidence: { ...evidence, encumbrances: [{ kind: "mortgage" as const, detail: "வங்கி" }] } };
    expect(verifyPatta(mort).suggestion).toBe("return");
    const lit = { ...base, evidence: { ...evidence, encumbrances: [{ kind: "litigation" as const, detail: "OS 12/2025" }] } };
    expect(verifyPatta(lit).suggestion).toBe("reject");
  });

  it("flags a deed that does not exist", () => {
    const i = { ...base, evidence: { ...evidence, deed: null } };
    expect(verifyPatta(i).suggestion).toBe("reject");
  });
});
