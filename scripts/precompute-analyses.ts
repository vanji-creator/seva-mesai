/**
 * Intake step 2: with every document read (fixtures/readings.json), run the deterministic checks
 * and the AI review for each case, in Tamil and English. Cached by input, written to
 * src/db/fixtures/analyses.json, which the seed loads — so the review is already there when an
 * officer opens a case.
 *
 *   npm run precompute:review
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { GRIEVANCE_CASES, PATTA_CASES, applicationValues, type DocKind } from "../src/db/cases";
import { grievancePayload } from "../src/db/seed";
import { evaluateGrievance, evaluatePatta, type OtherGrievance } from "../src/lib/case/evaluate";
import { fyStart } from "../src/lib/case/fy";
import { registryFor } from "../src/lib/case/truth";
import { aiReview, type Analysis } from "../src/lib/ai/analyze";
import type { DocReading } from "../src/lib/docs/read";
import { cached } from "../eval/cache";

const FIX = path.resolve(__dirname, "../src/db/fixtures");
const readings: Record<string, Partial<Record<DocKind, DocReading>>> = JSON.parse(readFileSync(path.join(FIX, "readings.json"), "utf8"));
const OUT = path.join(FIX, "analyses.json");

async function review(ref: string, ev: Parameters<typeof aiReview>[0]) {
  const out: { ta?: Analysis; en?: Analysis } = {};
  for (const locale of ["ta", "en"] as const) {
    const key = createHash("sha1").update(JSON.stringify({ ev, locale, v: 2 })).digest("hex").slice(0, 16);
    const { value, hit } = await cached(`review.${key}`, () => aiReview(ev, locale));
    if (value.source !== "llm") console.warn(`  ${ref} ${locale}: AI unavailable, rule-based text`);
    out[locale] = value;
    console.log(`${ref} ${locale} ${value.suggestion} ${hit ? "(cached)" : ""} ${value.summary.slice(0, 80)}`);
  }
  return out;
}

async function main() {
  const all: Record<string, { ta?: Analysis; en?: Analysis }> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
  for (const c of PATTA_CASES) {
    const docs = readings[c.ref] ?? {};
    const missingReads = (Object.keys(c.docs) as DocKind[]).filter((k) => !docs[k]);
    if (missingReads.length) { console.warn(`${c.ref}: not all documents read yet (${missingReads.join(", ")}) — skipped`); continue; }
    const ev = evaluatePatta({ application: applicationValues(c), docs, unrelated: [], registry: registryFor(c), fyStart: fyStart() });
    all[c.ref] = await review(c.ref, { findings: ev.findings, suggestion: ev.suggestion, facts: ev.facts });
  }
  const others: OtherGrievance[] = [];
  for (const g of GRIEVANCE_CASES) {
    if (!readings[g.ref]?.petition) { console.warn(`${g.ref}: petition not read yet — skipped`); continue; }
    const p = grievancePayload(g);
    const ev = evaluateGrievance(g.village.en, p, others);
    all[g.ref] = await review(g.ref, ev);
    others.push({ refNo: g.ref, village: g.village.en, payload: p });
  }
  writeFileSync(OUT, JSON.stringify(all, null, 1) + "\n");
  console.log(`wrote ${Object.keys(all).length} reviews`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
