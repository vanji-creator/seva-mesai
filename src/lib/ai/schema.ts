import { z } from "zod";
import type { Suggestion } from "@/lib/types";

/** The only thing the LLM is allowed to author. Findings stay deterministic. */
export const LlmAnalysis = z.object({
  summary: z.string().min(10).max(600),
  suggestion: z.enum(["approve", "reject", "return"]),
  reasons: z.array(z.string().min(3).max(300)).min(1).max(5),
  draftReply: z.string().max(600).optional(),
});
export type LlmAnalysis = z.infer<typeof LlmAnalysis>;

/** Shape described to the model in the prompt (providers differ on tool/JSON-schema support). */
export const OUTPUT_SHAPE = `{"summary": string (2-3 sentences), "suggestion": "approve" | "reject" | "return", "reasons": string[] (1-5 short items, cite finding codes like TAX_DUES), "draftReply": string (optional, polite reply to the citizen)}`;

/**
 * Models sometimes wrap JSON in prose, code fences or <think> blocks.
 * Take the outermost {...} after stripping reasoning tags.
 */
export function extractJson(text: string): unknown {
  const clean = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in model output");
  return JSON.parse(clean.slice(start, end + 1));
}

/**
 * Guardrail: the model may be *stricter* than the rules, never more lenient.
 * If deterministic checks found problems, an "approve" is overridden.
 */
export function reconcile(rules: Suggestion, llm: Suggestion): { suggestion: Suggestion; overridden: boolean } {
  if (rules !== "approve" && llm === "approve") return { suggestion: rules, overridden: true };
  return { suggestion: llm, overridden: false };
}
