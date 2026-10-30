import { describe, expect, it } from "vitest";
import { DEMO_KITS, PATTA_CASES } from "@/db/cases";
import { truthInput } from "@/lib/case/truth";
import { checkPattaCase } from "@/lib/verify/caseCheck";

const byRef = (ref: string) => PATTA_CASES.find((c) => c.ref === ref)!;
const run = (ref: string) => checkPattaCase(truthInput(byRef(ref)));
const codes = (ref: string) => run(ref).findings.map((f) => f.code).sort();

describe("each case shows exactly its problem (perfect readings)", () => {
  it("PT-0201 clean -> approve", () => {
    expect(codes("PT-2026-0201")).toEqual(["ALL_CLEAR"]);
    expect(run("PT-2026-0201").suggestion).toBe("approve");
  });
  it("PT-0202 extent typed wrong -> return", () => {
    expect(codes("PT-2026-0202")).toEqual(["APP_EXTENT_MISMATCH"]);
    expect(run("PT-2026-0202").suggestion).toBe("return");
  });
  it("PT-0203 buyer name typed differently from deed and ID -> return", () => {
    expect(codes("PT-2026-0203")).toEqual(["APP_BUYER_MISMATCH"]);
    expect(run("PT-2026-0203").suggestion).toBe("return");
  });
  it("PT-0204 tax dues -> return", () => {
    expect(codes("PT-2026-0204")).toEqual(["TAX_DUES"]);
  });
  it("PT-0205 un-released mortgage in the EC -> return", () => {
    expect(codes("PT-2026-0205")).toEqual(["ENCUMBRANCE_MORTGAGE"]);
  });
  it("PT-0206 seller is not the patta holder -> reject", () => {
    expect(codes("PT-2026-0206")).toContain("SELLER_NOT_OWNER");
    expect(run("PT-2026-0206").suggestion).toBe("reject");
  });
  it("PT-0207 EC not attached -> return", () => {
    expect(codes("PT-2026-0207")).toEqual(["DOC_MISSING_EC"]);
  });
  it("PT-0208 deed copy differs from the registered deed -> flagged on both application and copy", () => {
    expect(codes("PT-2026-0208")).toEqual(["APP_EXTENT_MISMATCH", "DOC_RECORD_MISMATCH"]);
    const row = run("PT-2026-0208").rows.find((r) => r.fact === "extent")!;
    expect(row.cells.find((c) => c.source === "sale_deed")).toMatchObject({ value: "120", status: "bad" });
    expect(row.cells.find((c) => c.source === "patta")).toMatchObject({ status: "ok" });
  });
});

describe("fact table", () => {
  it("has one row per fact, with the government record as reference", () => {
    const r = run("PT-2026-0201");
    expect(r.rows.map((x) => x.fact)).toEqual(["deedNo", "seller", "buyer", "surveyNo", "extent", "owner", "tax", "encumbrance"]);
    expect(r.rows.every((x) => x.status === "ok")).toBe(true);
  });
  it("marks a missing document's cells as absent, not wrong", () => {
    const enc = run("PT-2026-0207").rows.find((x) => x.fact === "encumbrance")!;
    expect(enc.cells.find((c) => c.source === "ec")?.status).toBe("absent");
  });
  it("converts patta hectare-ares back to cents", () => {
    const ext = run("PT-2026-0202").rows.find((x) => x.fact === "extent")!;
    expect(ext.cells.find((c) => c.source === "patta")).toMatchObject({ value: "62", status: "ok" });
  });
});

import { REQUIRED } from "@/lib/verify/caseCheck";

describe("documents", () => {
  it("an attached but unread document is reported once as 'not read yet', not as missing or low confidence", () => {
    const input = truthInput(byRef("PT-2026-0201"));
    input.docs.patta = { docType: "patta", classifyConfidence: null, reviewRequired: true, values: null, minConfidence: null, engine: "pending", readAt: "" };
    const codes = checkPattaCase(input).findings.map((f) => f.code);
    expect(codes).toContain("DOC_NOT_READ");
    expect(codes.some((c) => c.startsWith("DOC_MISSING") || c.startsWith("DOC_LOW_CONFIDENCE"))).toBe(false);
  });
  it("a file that turned out to be something else is flagged, without sending the file back", () => {
    const input = truthInput(byRef("PT-2026-0201"));
    input.unrelated = [{ docType: "ration_card", fileName: "ration_card.png" }];
    const r = checkPattaCase(input);
    expect(r.findings.map((f) => f.code)).toEqual(["DOC_UNRELATED"]);
    expect(r.findings[0].en).toContain("ration card");
    expect(r.suggestion).toBe("approve");
  });
  it("requires all six documents", () => {
    expect(REQUIRED).toHaveLength(6);
  });
});

describe("demo kits (citizen applies online)", () => {
  const online = (id: string, tax?: "later") => {
    const k = DEMO_KITS.find((x) => x.id === id)!;
    const c = tax && k.taxLater ? { ...k, tax: k.taxLater } : k;
    const input = truthInput(c);
    input.application = { ...input.application, channel: "online" };
    return checkPattaCase(input);
  };
  it("an online application needs no application-form document", () => {
    expect(online("kit-a").findings.map((f) => f.code)).toEqual(["ALL_CLEAR"]);
    expect(online("kit-a").suggestion).toBe("approve");
  });
  it("kit B: old receipt with dues -> return; receipt after paying -> approve", () => {
    expect(online("kit-b").findings.map((f) => f.code)).toEqual(["TAX_DUES"]);
    expect(online("kit-b", "later").suggestion).toBe("approve");
  });
});
