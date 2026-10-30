import { extractJson } from "./schema";

// Any OpenAI-compatible chat endpoint works (Sarvam, Groq, OpenRouter, Gemini's compat API...).
const BASE_URL = (process.env.LLM_BASE_URL ?? "https://api.sarvam.ai/v1").replace(/\/$/, "");
export const LLM_MODEL = process.env.LLM_MODEL ?? "sarvam-105b";
const isSarvam = BASE_URL.includes("sarvam.ai");

export function llmConfigured(): boolean {
  return !!(process.env.LLM_API_KEY ?? process.env.SARVAM_API_KEY);
}

/** One JSON-mode chat call; returns the parsed object (caller validates with zod). */
export async function chatJson(system: string, user: string, maxTokens = 1500): Promise<unknown> {
  const key = process.env.LLM_API_KEY ?? process.env.SARVAM_API_KEY;
  if (!key) throw new Error("LLM key missing");
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      model: LLM_MODEL,
      temperature: 0.2,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      // Sarvam "thinks" by default and even at low effort spent ~1.2k hidden tokens, starving the
      // JSON answer. Checking is done in code; the model only writes, so turn it off.
      ...(isSarvam ? { reasoning_effort: null } : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string | null }; finish_reason?: string }[] };
  const choice = data.choices?.[0];
  if (!choice?.message?.content) throw new Error(`empty model output (finish_reason=${choice?.finish_reason})`);
  return extractJson(choice.message.content);
}
