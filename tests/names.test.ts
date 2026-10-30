import { describe, expect, it } from "vitest";
import { romanKey } from "@/lib/verify/fuzzy";
import { summarise } from "@/lib/verify/patta";

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
});

describe("summarise", () => {
  it("drops 'all clear' notes once a real issue exists", () => {
    const s = summarise([
      { code: "ALL_CLEAR", severity: "ok", ta: "", en: "" },
      { code: "TAX_DUES", severity: "blocker", ta: "", en: "" },
    ]);
    expect(s.findings.map((f) => f.code)).toEqual(["TAX_DUES"]);
    expect(s.suggestion).toBe("return");
  });
  it("rejects on legal blockers", () => {
    expect(summarise([{ code: "SELLER_NOT_OWNER", severity: "blocker", ta: "", en: "" }]).suggestion).toBe("reject");
  });
});
