import { describe, expect, it } from "vitest";
import { CASES } from "../eval/cases";
import { regexFields } from "../eval/pipelines";
import { decide, fieldCorrect, nameMatches, normDate, truthAsExtracted } from "../eval/score";

describe("eval scoring", () => {
  it("normalises dates in either order", () => {
    expect(normDate("12-09-2026")).toBe("2026-09-12");
    expect(normDate("2026/9/12")).toBe("2026-09-12");
    expect(normDate("Sept 12")).toBeNull();
  });
  it("tolerates commas and units in numbers", () => {
    const c = CASES[2];
    expect(fieldCorrect("saleAmount", c.deed, { saleAmount: "18,60,000" })).toBe(true);
    expect(fieldCorrect("extentCents", c.deed, { extentCents: "62 சென்ட்" })).toBe(true);
  });
  it("compares names across scripts only with a Roman map", () => {
    const roman = new Map([["கோவிந்தன்", "Govindan"]]);
    expect(nameMatches("கோவிந்தன்", "Govindan")).toBe(false);
    expect(nameMatches("கோவிந்தன்", "Govindan", roman)).toBe(true);
  });
  it("ground truth reproduces each case's intended decision", () => {
    expect(CASES.map((c) => decide(c, truthAsExtracted(c.deed)).suggestion)).toEqual(["approve", "return", "return", "reject"]);
    expect(decide(CASES[1], truthAsExtracted(CASES[1].deed)).codes).toEqual(["BUYER_NAME_SPELLING"]);
    expect(decide(CASES[2], truthAsExtracted(CASES[2].deed)).codes).toEqual(["EXTENT_MISMATCH"]);
  });
  it("regex baseline reads the clean OCR text of the smoke-test deed", () => {
    const md = `பத்திர எண்: SD/0104/2026 · பதிவு நாள்: 12-09-2026\nகிராமத்தைச் சேர்ந்த கோவிந்தன் (த/பெ. ராமசாமி), மற்றும் மீனா (த/பெ. பாலு)\nரூ. 18,60,000/-\n<td>சர்வே எண்</td><td>201/7</td><td>பரப்பு</td><td>62 சென்ட்</td>`;
    const f = regexFields(md);
    expect(f).toMatchObject({ deedNo: "SD/0104/2026", seller: "கோவிந்தன்", buyer: "மீனா", surveyNo: "201/7", extentCents: "62", registrationDate: "12-09-2026" });
    expect(fieldCorrect("saleAmount", CASES[2].deed, f)).toBe(true);
  });
});
