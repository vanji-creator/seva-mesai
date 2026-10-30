import { describe, expect, it } from "vitest";
import { priority } from "@/lib/priority";
import { classifyGrievance } from "@/lib/verify/grievance";

const now = new Date("2026-10-29T00:00:00Z");
const d = (n: number) => new Date(now.getTime() + n * 86_400_000);

describe("priority", () => {
  it("puts SLA-breached files in the urgent band", () => {
    const r = priority({ slaDueAt: d(-2), submittedAt: d(-20), blockers: 0, warnings: 0, urgency: 1, now });
    expect(r.band).toBe("urgent");
    expect(r.daysLeft).toBe(-2);
  });
  it("ranks a breached file above a fresh one", () => {
    const a = priority({ slaDueAt: d(-1), submittedAt: d(-10), blockers: 0, warnings: 0, urgency: 1, now });
    const b = priority({ slaDueAt: d(20), submittedAt: d(-1), blockers: 0, warnings: 0, urgency: 1, now });
    expect(a.score).toBeGreaterThan(b.score);
    expect(b.band).toBe("normal");
  });
  it("lets urgency and flags break ties", () => {
    const base = { slaDueAt: d(5), submittedAt: d(-3), now };
    const a = priority({ ...base, blockers: 2, warnings: 1, urgency: 3 });
    const b = priority({ ...base, blockers: 0, warnings: 0, urgency: 1 });
    expect(a.score).toBeGreaterThan(b.score);
  });
});

describe("classifyGrievance", () => {
  it("routes water complaints and detects urgency", () => {
    const c = classifyGrievance({ text: "குடிநீர் மூன்று நாட்களாக வரவில்லை", repeatCount: 1 });
    expect(c.category).toBe("water");
    expect(c.urgency).toBe(3);
  });
  it("bumps urgency on repeat complaints", () => {
    expect(classifyGrievance({ text: "சாலையில் குழி", repeatCount: 3 }).urgency).toBe(2);
  });
  it("falls back to other", () => {
    expect(classifyGrievance({ text: "வணக்கம்", repeatCount: 1 }).category).toBe("other");
  });
});

import { reconcile, LlmAnalysis } from "@/lib/ai/schema";

describe("AI guardrails", () => {
  it("never lets the model approve over rule-based problems", () => {
    expect(reconcile("return", "approve")).toEqual({ suggestion: "return", overridden: true });
    expect(reconcile("reject", "approve").suggestion).toBe("reject");
  });
  it("allows the model to be stricter", () => {
    expect(reconcile("approve", "return")).toEqual({ suggestion: "return", overridden: false });
  });
  it("rejects malformed model output", () => {
    expect(LlmAnalysis.safeParse({ summary: "ok", suggestion: "delete", reasons: [] }).success).toBe(false);
  });
});

import { extractJson } from "@/lib/ai/schema";

describe("extractJson", () => {
  it("parses plain, fenced and reasoning-wrapped output", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJson('<think>hmm {not json}</think>\nHere: {"a":3}')).toEqual({ a: 3 });
  });
  it("throws when there is no object", () => {
    expect(() => extractJson("sorry")).toThrow();
  });
});

import { verifyGrievance } from "@/lib/verify/grievance";

describe("verifyGrievance", () => {
  it("treats urgency as a warning and still suggests accepting a clear complaint", () => {
    const r = verifyGrievance({ text: "குடிநீர் மூன்று நாட்களாக வரவில்லை", textEn: "", location: "காந்தி தெரு", repeatCount: 1 });
    expect(r.findings.find((f) => f.code === "URGENT")?.severity).toBe("warning");
    expect(r.blockers).toBe(0);
    expect(r.suggestion).toBe("approve");
  });
});
