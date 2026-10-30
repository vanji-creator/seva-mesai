/**
 * Intake step, run once: every case document goes through Sarvam (Classify -> Extract, or
 * OCR + translate for petitions). Results are cached (eval/cache) and written to
 * src/db/fixtures/readings.json, which the seed loads — so a fresh install has every
 * document already read without spending credits, exactly like a real intake queue.
 *
 *   npm run precompute:read            (all cases)
 *   npm run precompute:read -- PT-2026-0205 GR-2026-0301   (only these)
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { GRIEVANCE_CASES, PATTA_CASES, applicationValues, lookExt, type DocKind } from "../src/db/cases";
import { readDocument, type DocReading } from "../src/lib/docs/read";
import { cached } from "../eval/cache";

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "src/db/fixtures/readings.json");
const MIME: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg" };
const VERSION = "read.v1"; // bump when schemas change, so cached readings are redone

async function main() {
  const only = process.argv.slice(2);
  const out: Record<string, Partial<Record<DocKind, DocReading>>> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
  const jobs: { ref: string; kind: DocKind; file: string; names: string[] }[] = [];

  for (const c of PATTA_CASES) {
    const a = applicationValues(c);
    const names = [a.seller, a.buyer, c.patta.owner, c.idProof.name];
    for (const [kind, look] of Object.entries(c.docs)) {
      jobs.push({ ref: c.ref, kind: kind as DocKind, file: `public/case-docs/${c.ref}/${kind}.${lookExt(look!)}`, names });
    }
  }
  for (const g of GRIEVANCE_CASES) {
    jobs.push({ ref: g.ref, kind: "petition", file: `public/case-docs/${g.ref}/petition.${lookExt(g.petition.look)}`, names: [] });
  }

  // 8 documents in flight; the client's shared throttle keeps submissions under Sarvam's ~10/min.
  const queue = jobs.filter((x) => !only.length || only.includes(x.ref));
  await Promise.all(Array.from({ length: 8 }, async () => {
    for (let j = queue.shift(); j; j = queue.shift()) await one(j);
  }));

  async function one(j: (typeof jobs)[number]) {
    const data = readFileSync(path.join(ROOT, j.file));
    const hash = createHash("sha1").update(data).digest("hex").slice(0, 16);
    const ext = j.file.split(".").pop()!;
    const t = Date.now();
    try {
      const { value, hit } = await cached(`${hash}.${VERSION}`, () =>
        readDocument({ name: path.basename(j.file), mime: MIME[ext], data: new Uint8Array(data) }, j.names, j.kind),
      );
      (out[j.ref] ??= {})[j.kind] = value;
      const summary = value.text ? `text ${value.text.length} chars` : JSON.stringify(value.values).slice(0, 110);
      console.log(`${j.ref} ${j.kind.padEnd(16)} ${value.docType ?? "?"} ${hit ? "(cached)" : `${Date.now() - t}ms`} ${summary}`);
    } catch (e) {
      console.log(`${j.ref} ${j.kind} FAILED ${String(e).slice(0, 160)}`);
    }
    mkdirSync(path.dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
