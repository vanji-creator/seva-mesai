import { unzipSync, strFromU8 } from "fflate";

/**
 * Thin client for the Sarvam APIs this app uses. Plain fetch, no SDK:
 * the JS SDK drops `output_format` on Parse (documented), and we want full
 * control over polling, throttling and errors.
 */
const API = "https://api.sarvam.ai";
const DOC = `${API}/doc-ai/v1/job`;

export function sarvamKey(): string | undefined {
  return process.env.SARVAM_API_KEY ?? process.env.LLM_API_KEY;
}
function headers(json = false): Record<string, string> {
  const key = sarvamKey();
  if (!key) throw new Error("Sarvam key missing (LLM_API_KEY / SARVAM_API_KEY)");
  return { "api-subscription-key": key, ...(json ? { "content-type": "application/json" } : {}) };
}

export class SarvamError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

// ---------- Document Intelligence (async jobs) ----------

export type DocJobKind = "extract" | "parse" | "classify";
export interface DocFile {
  name: string;
  mime: string;
  data: Uint8Array;
}
export type JobStatus = "pending" | "running" | "completed" | "partially_completed" | "failed" | "rejected";

// Doc AI allows ~10 requests/minute; space submissions so batch runs never hit 429.
const MIN_SUBMIT_GAP_MS = Number(process.env.SARVAM_SUBMIT_GAP_MS ?? 6500);
let lastSubmit = 0;
let queue: Promise<void> = Promise.resolve();
function throttle(): Promise<void> {
  queue = queue.then(async () => {
    const wait = lastSubmit + MIN_SUBMIT_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastSubmit = Date.now();
  });
  return queue;
}

export async function submitDocJob(kind: DocJobKind, file: DocFile, fields: Record<string, string>): Promise<string> {
  await throttle();
  const fd = new FormData();
  fd.append("file", new Blob([file.data as BlobPart], { type: file.mime }), file.name);
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const res = await fetch(`${DOC}/${kind}`, { method: "POST", headers: headers(), body: fd });
  const body = await res.text();
  if (!res.ok) throw new SarvamError(`${kind} submit HTTP ${res.status}: ${body.slice(0, 300)}`, res.status);
  return (JSON.parse(body) as { job_id: string }).job_id;
}

export async function waitForJob(id: string, timeoutMs = 120_000, everyMs = 2500): Promise<JobStatus> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${DOC}/${id}/status`, { headers: headers() });
    if (!res.ok) throw new SarvamError(`status HTTP ${res.status}`, res.status);
    const { status } = (await res.json()) as { status: JobStatus };
    // Only the documented terminal states end the wait; anything else (incl. undocumented
    // intermediate states) keeps polling. Treating "not pending/running" as done caused a 409.
    if (TERMINAL.has(status)) return status;
    await new Promise((r) => setTimeout(r, everyMs));
  }
  throw new SarvamError(`job ${id} timed out`);
}
const TERMINAL = new Set<JobStatus>(["completed", "partially_completed", "failed", "rejected"]);

async function results<T>(id: string): Promise<T> {
  // 409 = results asked for before the job is terminal; seen once right after "completed". Retry briefly.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${DOC}/${id}/results`, { headers: headers() });
    if (res.ok) return (await res.json()) as T;
    if (res.status !== 409 || attempt >= 4) throw new SarvamError(`results HTTP ${res.status}`, res.status);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function runJob(kind: DocJobKind, file: DocFile, fields: Record<string, string>) {
  const id = await submitDocJob(kind, file, fields);
  const status = await waitForJob(id);
  if (status === "failed" || status === "rejected") throw new SarvamError(`${kind} job ${status}`);
  return id;
}

export interface FieldAnnotation {
  confidence: number | null;
}
export interface ExtractResult {
  result: Record<string, unknown>;
  annotations?: Record<string, FieldAnnotation>;
}

/** JSON-schema field extraction. Each field must carry a description (API rule). */
export async function extractFields(file: DocFile, schema: object, language = "ta-IN"): Promise<ExtractResult> {
  const id = await runJob("extract", file, { schema: JSON.stringify(schema), language, output_format: "json" });
  return results<ExtractResult>(id);
}

/** Full OCR to Markdown (tables kept as HTML). Output arrives as a ZIP. */
export async function parseToMarkdown(file: DocFile, language = "ta-IN"): Promise<string> {
  const id = await runJob("parse", file, { language, output_format: "md" });
  const res = await fetch(`${DOC}/${id}/download-url`, { headers: headers() });
  if (!res.ok) throw new SarvamError(`download-url HTTP ${res.status}`, res.status);
  const { url } = (await res.json()) as { url: string };
  const zip = unzipSync(new Uint8Array(await (await fetch(url)).arrayBuffer()));
  const md = Object.entries(zip).find(([name]) => name.endsWith(".md"));
  if (!md) throw new SarvamError("parse output had no markdown file");
  return strFromU8(md[1]);
}

export interface ClassifyResult {
  type: string | null;
  classification_status: "matched" | "unknown" | "mixed";
  confidence: number | null;
  review_required: boolean;
  review_reasons: string[];
}

export async function classifyDocument(
  file: DocFile,
  categories: { type: string; description: string }[],
  language = "ta-IN",
): Promise<ClassifyResult> {
  // Settings go in a JSON `request` field (a `config` field is rejected with 400).
  const request = { config: { categories, unmatched_behavior: "other" } };
  const id = await runJob("classify", file, { request: JSON.stringify(request), language });
  return (await results<{ result: ClassifyResult }>(id)).result;
}

// ---------- Text APIs (sync) ----------

async function post<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${API}${path}`, { method: "POST", headers: headers(true), body: JSON.stringify(body) });
  if (!res.ok) throw new SarvamError(`${path} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status);
  return (await res.json()) as T;
}

/** mayura:v1 chosen after testing: more literal than sarvam-translate (which dropped "drinking" water). */
export async function translate(input: string, source: string, target: string, model = "mayura:v1"): Promise<string> {
  const r = await post<{ translated_text: string }>("/translate", {
    input: input.slice(0, 990),
    source_language_code: source,
    target_language_code: target,
    model,
    mode: "formal",
  });
  return r.translated_text;
}

/**
 * Only use towards Roman script: Roman->Tamil leaked Malayalam glyphs in testing
 * ("கார்த்திகேയൻ"), so names are compared in Roman, never in Tamil.
 */
export async function toRoman(input: string, source = "ta-IN"): Promise<string> {
  const r = await post<{ transliterated_text: string }>("/transliterate", {
    input,
    source_language_code: source,
    target_language_code: "en-IN",
  });
  return r.transliterated_text;
}

export async function detectLanguage(input: string): Promise<{ language: string | null; script: string | null }> {
  const r = await post<{ language_code: string | null; script_code: string | null }>("/text-lid", { input: input.slice(0, 990) });
  return { language: r.language_code, script: r.script_code };
}
