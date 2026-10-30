/**
 * Eval: one document type (sale deed) x input variants x extraction pipelines.
 *   npm run eval        (needs LLM_API_KEY in .env.local; results cached in eval/cache)
 * Writes eval/results.json (read by the in-app Evals page) and eval/RESULTS.md.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CASES, VARIANTS, WRONG_DOCS, type VariantId } from "./cases";
import { isCached } from "./cache";
import { romanMap, runClassify, runExtract, runParseLlm, runParseRegex, translitCost, type PipelineOut } from "./pipelines";
import { FIELDS, decide, fieldCorrect, sameDecision, truthAsExtracted, type Field } from "./score";

const DOCS = path.resolve(__dirname, "docs");
const GAP_MS = 6500; // Doc AI ~10 req/min; paced here so measured latency excludes queueing
let last = 0;
async function pace(keys: string[]) {
  if (keys.every(isCached)) return;
  const wait = last + GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
}

const MIME: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg" };
function load(rel: string) {
  const data = readFileSync(path.join(DOCS, rel));
  const ext = rel.split(".").pop()!;
  return { file: { name: path.basename(rel), mime: MIME[ext], data: new Uint8Array(data) }, hash: createHash("sha1").update(data).digest("hex").slice(0, 16) };
}

type PipelineId = "none" | "extract" | "extract_translit" | "extract_phonetic" | "parse_llm" | "parse_regex";
interface Row {
  caseId: string;
  variant: VariantId;
  pipeline: PipelineId;
  fields: Record<Field, boolean>;
  fieldAcc: number;
  decisionCorrect: boolean;
  expected: string;
  got: string;
  latencyMs: number;
  costInr: number;
  confidence?: number;
  error?: string;
  extracted: Record<string, unknown>;
}

async function main() {
  const rows: Row[] = [];
  const classify: { file: string; expected: string; got: string | null; confidence: number | null; review: boolean; correct: boolean; latencyMs: number }[] = [];

  for (const c of CASES) {
    const truthDecision = decide(c, truthAsExtracted(c.deed));
    const expected = `${truthDecision.suggestion} ${truthDecision.codes.join(",") || "—"}`;
    const allNames = [c.deed.seller, c.deed.buyer, c.application.seller, c.application.buyer, c.landOwner];

    for (const v of VARIANTS) {
      if (!v.file) {
        rows.push({
          caseId: c.id, variant: v.id, pipeline: "none",
          fields: Object.fromEntries(FIELDS.map((f) => [f, true])) as Record<Field, boolean>,
          fieldAcc: 1, decisionCorrect: true, expected, got: expected, latencyMs: 0, costInr: 0, extracted: { ...c.deed },
        });
        continue;
      }
      const { file, hash } = load(`${c.id}/${v.id}.${v.file}`);
      process.stdout.write(`${c.id} ${v.id} `);

      await pace([`${hash}.extract`]);
      const ex = await runExtract(file, hash);
      await pace([`${hash}.parse`]);
      const pl = await runParseLlm(file, hash);
      const pr = await runParseRegex(file, hash);
      await pace([`${hash}.classify`]);
      try {
        const cl = await runClassify(file, hash);
        classify.push({ file: `${c.id}/${v.id}`, expected: "sale_deed", got: cl.type, confidence: cl.confidence, review: cl.review_required, correct: cl.type === "sale_deed", latencyMs: cl.latencyMs });
      } catch (e) {
        classify.push({ file: `${c.id}/${v.id}`, expected: "sale_deed", got: `error: ${String(e).slice(0, 80)}`, confidence: null, review: true, correct: false, latencyMs: 0 });
      }

      // Script-aware transliteration on top of Extract (names compared in Roman only when scripts differ).
      const extractedNames = [ex.fields.seller, ex.fields.buyer].filter((n): n is string => typeof n === "string");
      const { map, chars } = await romanMap([...allNames, ...extractedNames]);

      const score = (pipeline: PipelineId, out: PipelineOut, roman?: Map<string, string>, extraCost = 0, phonetic = false) => {
        const fields = Object.fromEntries(FIELDS.map((f) => [f, fieldCorrect(f, c.deed, out.fields, roman, phonetic)])) as Record<Field, boolean>;
        const d = decide(c, out.fields, roman, phonetic);
        rows.push({
          caseId: c.id, variant: v.id, pipeline, fields,
          fieldAcc: Object.values(fields).filter(Boolean).length / FIELDS.length,
          decisionCorrect: !out.error && sameDecision(d, truthDecision),
          expected, got: out.error ? "error" : `${d.suggestion} ${d.codes.join(",") || "—"}`,
          latencyMs: out.latencyMs, costInr: out.costInr + extraCost, confidence: out.confidence, error: out.error,
          extracted: out.fields,
        });
      };
      score("extract", ex);
      score("extract_translit", ex, map, translitCost(chars));
      score("extract_phonetic", ex, map, translitCost(chars), true);
      score("parse_llm", pl);
      score("parse_regex", pr);
      const last4 = rows.slice(-5);
      console.log(last4.map((r) => `${r.pipeline}:${Math.round(r.fieldAcc * 100)}%${r.decisionCorrect ? "✓" : "✗"}`).join(" "));
    }
  }

  for (const w of WRONG_DOCS) {
    const { file, hash } = load(`_wrong/${w.id}.png`);
    await pace([`${hash}.classify`]);
    try {
      const cl = await runClassify(file, hash);
      classify.push({ file: w.id, expected: w.expectedType, got: cl.type, confidence: cl.confidence, review: cl.review_required, correct: cl.type === w.expectedType, latencyMs: cl.latencyMs });
      console.log(w.id, "->", cl.type);
    } catch (e) {
      // Not cached and the call failed (e.g. out of credits): record it, keep the rest of the results.
      classify.push({ file: w.id, expected: w.expectedType, got: `not run: ${String(e).slice(0, 60)}`, confidence: null, review: true, correct: false, latencyMs: 0 });
      console.log(w.id, "-> failed:", String(e).slice(0, 80));
    }
  }

  // Aggregate per variant x pipeline.
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = `${r.variant}|${r.pipeline}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const summary = [...groups.entries()].map(([k, rs]) => {
    const [variant, pipeline] = k.split("|");
    return {
      variant, pipeline, n: rs.length,
      fieldAcc: mean(rs.map((r) => r.fieldAcc)),
      decisionAcc: mean(rs.map((r) => (r.decisionCorrect ? 1 : 0))),
      perField: Object.fromEntries(FIELDS.map((f) => [f, mean(rs.map((r) => (r.fields[f] ? 1 : 0)))])),
      latencyMs: Math.round(mean(rs.map((r) => r.latencyMs))),
      costInr: Math.round(mean(rs.map((r) => r.costInr)) * 100) / 100,
      errors: rs.filter((r) => r.error).length,
    };
  });

  const out = { generatedAt: new Date().toISOString(), cases: CASES.map((c) => ({ id: c.id, note: c.note })), variants: VARIANTS, summary, classify, rows };
  writeFileSync(path.resolve(__dirname, "results.json"), JSON.stringify(out, null, 1));
  writeFileSync(path.resolve(__dirname, "RESULTS.md"), markdown(out.summary, classify));
  console.log("\nwrote eval/results.json and eval/RESULTS.md");
}

function markdown(summary: { variant: string; pipeline: string; fieldAcc: number; decisionAcc: number; latencyMs: number; costInr: number; errors: number }[], classify: { file: string; expected: string; got: string | null; confidence: number | null; correct: boolean }[]) {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const lines = [
    "# Eval results – sale deed extraction",
    "",
    "Field accuracy = share of 7 fields correct. Decision accuracy = the officer would see the same suggestion and the same findings as with the correct values.",
    "",
    "| Variant | Pipeline | Field acc | Decision acc | Latency | ₹ / doc | Errors |",
    "|---|---|---|---|---|---|---|",
    ...summary.map((s) => `| ${s.variant} | ${s.pipeline} | ${pct(s.fieldAcc)} | ${pct(s.decisionAcc)} | ${(s.latencyMs / 1000).toFixed(1)} s | ${s.costInr} | ${s.errors} |`),
    "",
    "## Classify gate",
    "",
    "| File | Expected | Got | Confidence | ✓ |",
    "|---|---|---|---|---|",
    ...classify.map((c) => `| ${c.file} | ${c.expected} | ${c.got} | ${c.confidence ?? "—"} | ${c.correct ? "✓" : "✗"} |`),
  ];
  return lines.join("\n") + "\n";
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
