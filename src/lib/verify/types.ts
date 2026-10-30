import type { Finding, PattaPayload, Suggestion } from "@/lib/types";

/** What the other departments say about this application (fetched by RegistryClient). */
export interface RegistryEvidence {
  deed: { seller: string; buyer: string; surveyNo: string; extentCents: number } | null;
  land: { currentOwner: string; extentCents: number } | null;
  tax: { surveyNo: string; paidUpToYear: number; duesAmount: number } | null;
  encumbrances: { kind: "mortgage" | "litigation" | "none"; detail: string }[];
}

export interface PattaInput {
  payload: PattaPayload;
  presentDocs: string[];
  evidence: RegistryEvidence;
  /** Injected so tests are deterministic. */
  currentYear: number;
}

export interface VerifyResult {
  findings: Finding[];
  blockers: number;
  warnings: number;
  /** Rule-based suggestion. The LLM may refine it, never the officer's decision. */
  suggestion: Suggestion;
  reasonCodes: string[];
}
