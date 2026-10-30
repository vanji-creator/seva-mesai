import { verifyGrievance } from "@/lib/verify/grievance";
import { checkPattaCase, type CaseInput } from "@/lib/verify/caseCheck";
import type { Finding, GrievancePayload, Suggestion } from "@/lib/types";

/**
 * Deterministic evaluation of a case — pure, so the same code runs at intake (precompute),
 * in tests, and when the officer presses "re-check".
 */

export interface Evaluation {
  findings: Finding[];
  suggestion: Suggestion;
  blockers: number;
  warnings: number;
  /** What the AI is allowed to see about the case (facts only). */
  facts: unknown;
}

export function evaluatePatta(input: CaseInput) {
  const r = checkPattaCase(input);
  const docsRead = Object.fromEntries(Object.entries(input.docs).map(([k, d]) => [k, d?.values ?? null]));
  return {
    ...r,
    facts: { type: "patta_name_transfer", application: input.application, documentsRead: docsRead, governmentRecords: input.registry },
  };
}

export interface OtherGrievance { refNo: string; village: string; payload: GrievancePayload }

/** Another pending complaint about the same place and problem = handle together. */
export function duplicateFindings(village: string, p: GrievancePayload, others: OtherGrievance[]): Finding[] {
  const dup = others.find((o) => o.village === village && o.payload.category === p.category && !!p.location && o.payload.location === p.location);
  return dup
    ? [{ code: "POSSIBLE_DUPLICATE", severity: "warning", ta: `இதே இடம் / பிரச்சனைக்கு மற்றொரு புகார் நிலுவையில் உள்ளது (${dup.refNo}) — இணைத்துக் கையாளலாம்`, en: `Another pending complaint about the same place and problem (${dup.refNo}) — handle together`, refs: [dup.refNo] }]
    : [];
}

export function evaluateGrievance(village: string, p: GrievancePayload, others: OtherGrievance[]): Evaluation & { cls: ReturnType<typeof verifyGrievance>["cls"] } {
  const v = verifyGrievance(p);
  const dups = duplicateFindings(village, p, others);
  const findings = [...v.findings.filter((f) => f.code !== "ALL_CLEAR" || !dups.length), ...dups];
  return {
    findings,
    // A duplicate is still a valid complaint: accept it and handle it with the earlier one.
    suggestion: v.suggestion,
    blockers: findings.filter((f) => f.severity === "blocker").length,
    warnings: findings.filter((f) => f.severity === "warning").length,
    cls: v.cls,
    facts: { type: "grievance", complaintTamil: p.text, complaintEnglish: p.textEn, location: p.location || null, category: v.cls.category, department: v.cls.department.en, repeatCount: p.repeatCount },
  };
}
