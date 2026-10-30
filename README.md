# சேவை மேசை · Seva Mesai

A **Tamil-first desk for a Tahsildar's office** to process **patta name-transfer applications** and
**citizen grievances**. Every document the citizen attached is really there to open; Sarvam AI has
already read it and cross-checked it against the government records before the officer opens the
case; the officer makes the final call.

> All people, land and documents are fictional and marked "மாதிரி / SAMPLE". No real citizen data.

**Live demo:** https://seva-mesai.vercel.app — sign in as `tahsildar`, password `Demo@1234`.
Tamil by default; **English** is in the top bar.

## The problem

Officers verify applications across **disconnected department systems** — Registration (deeds, EC),
Revenue (patta), the panchayat (property tax). For one patta transfer an officer reads five or six
paper documents, compares names, survey numbers and extents by eye, and asks the citizen for copies of
records the government already holds. Files stall; officers fatigue on dense, English-heavy portals;
citizens make repeat trips.

**Who it affects:** officers (slow, error-prone cross-checking, no view of what is urgent) and
citizens (delays, returned files with unclear reasons).

## What an officer sees

**One login, one screen.** Queue on the left (most urgent first), the open case on the right.

For each case, already done before it is opened:

1. **Every document read.** Application form, sale deed, patta / chitta, encumbrance certificate (EC),
   tax receipt and ID card — each a real file you can open full size, with exactly what was read from it
   beside it (Sarvam **Classify** → **Extract**). Petitions are OCR'd and translated to English.
2. **One comparison table.** Each fact (deed no., seller, buyer, survey no., extent, patta holder, tax,
   encumbrance) across the application, every document, and the government record. Disagreements are
   the only thing coloured.
3. **Plain-language checks**, problems first.
4. **An AI review** (Sarvam `sarvam-105b`): summary, suggested decision with reasons, and a draft reply
   to the citizen — in Tamil and English.

The officer can **add a document** (upload, or a demo sample), **read a document again**, or
**re-check** — each re-runs the reading, checks and review. **Approve / Return / Reject** takes
remarks (required to return or reject; the AI's draft reply can be used with one click and edited) and
is logged with whether it followed the AI. The queue has three lists — **Pending**, **Reopened**,
**Completed** — and a decided case can be **reopened** with a reason.

## The demo cases — one per problem type

| Case | Problem | What the documents show | AI suggests |
|---|---|---|---|
| PT-2026-0201 | None | Everything matches | Approve |
| PT-2026-0202 | Extent typed wrong | Application 80 cents; deed, patta (0 - 25.09 ha-ares) and record 62 | Return |
| PT-2026-0203 | Name mismatch | Application "ராஜேஸ்வரி"; deed and ID card "ராஜலட்சுமி" | Return |
| PT-2026-0204 | Tax dues | Receipt paid only to 2024-25, ₹3,450 due | Return |
| PT-2026-0205 | Mortgage | EC shows an Indian Bank mortgage (2024) never released | Return |
| PT-2026-0206 | Seller is not the owner | Patta is in பழனிசாமி's name, seller is வேலு | Reject |
| PT-2026-0207 | Missing document | No EC attached — add the "EC (brought later)" sample to clear it | Return |
| PT-2026-0208 | Doctored deed copy | Deed copy says 120 cents; registered deed and patta say 80 | Return |
| GR-2026-0301 | Urgent water | Handwritten petition: no water 3 days, children with fever, repeat | Accept & forward |
| GR-2026-0302 | Duplicate | Same street, same problem as GR-0301 | Accept, handle together |
| GR-2026-0303 | Unclear | "I need help" — no problem or place given | Return |

**Deadlines** are the submission date plus the service's time limit (patta 30 days; grievances 2–15
days by category), so they move with real time. **Priority** is recalculated on every page load from
the deadline, age, issues found and grievance urgency.

## Run locally

```bash
npm install
cp .env.example .env.local   # add LLM_API_KEY (Sarvam) for live reading / re-checks
npm run seed                 # schema + demo data (embedded Postgres, no setup); no API calls
npm run dev                  # http://localhost:3000  ·  tahsildar / Demo@1234
npm test
```

The seed loads documents that were already read and reviewed at "intake"
(`src/db/fixtures/*.json`). To redo intake from scratch:

```bash
npm run render:cases   # draw every case document (Chrome + macOS sips)
npm run intake         # Sarvam reads every document, then the AI reviews every case (cached)
npm run seed
```

Without a key the app still runs on the stored readings and rule-based checks; live actions show an
"AI unavailable" note.

## Architecture

```
Browser ── Next.js App Router (server components + server actions), split-view shell
  src/db/cases.ts          the dataset: one case per problem type (single source for docs, records, seed)
  scripts/render-cases.ts  draws every document (PDF, scan, phone photo, photocopy, stamp paper, handwriting)
  lib/sarvam/client.ts     Doc AI jobs (classify / extract / parse), translate, transliterate
  lib/docs/read.ts         readDocument(): Classify → per-type Extract schema, or OCR + translate
  lib/verify/caseCheck.ts  fact-by-source comparison → findings  (pure, unit-tested)
  lib/case/*               load from DB · evaluate (pure) · queue · labels
  lib/ai/analyze.ts        aiReview(): narrate findings + suggest, zod-validated, guardrailed
  db                       Drizzle → Postgres (Neon in prod, PGlite locally)
  eval/                    extraction eval: one deed × 8 input forms × 5 pipelines
```

**Key decisions** (details and trade-offs in [DECISIONS.md](DECISIONS.md)):

1. **Code finds facts, the AI explains them.** Mismatches come from a deterministic comparison of
   what was read; the LLM only writes the summary, reasons and draft reply.
2. **The government record is the reference.** If the application differs, the citizen typed it
   wrong (return). If a citizen's *document* differs, the copy doesn't match the original (PT-0208).
3. **Work happens at intake, not on click.** Reading and review run when documents arrive; opening a
   case reads stored results. "Re-check" is there when the officer wants it.
4. **Classify gates everything.** A wrong file (ration card) is kept but marked as not belonging,
   before any paid extraction — and an extra wrong paper never sends a complete file back.
5. **The model can be stricter than the rules, never more lenient** (`reconcile`, unit-tested), and
   never changes a status — only the officer does.
6. **Cross-script names never block.** Measured: matching Tamil names against English letters is
   unreliable, so it asks for a look instead.
7. **Store what was read, keep files small.** Officer uploads are stored in the database row
   (fictional, ≤ 4 MB); seeded files are static.

## Document reading eval

Before choosing the pipeline, one document (the sale deed) was rendered in 8 forms — **correct values
typed directly (ceiling)**, typed PDF, clean scan, phone photo, handwritten fill-ins, poor photocopy,
names in English letters, stamp paper with seals — and run through 5 pipelines, scored on **field
accuracy** and **decision accuracy** (would the officer be told the same thing as with the correct
values). Full table: [eval/RESULTS.md](eval/RESULTS.md); in the app: **Evals**.

| Document form | Sarvam Extract | + transliteration | + sound-alike names | Parse → sarvam-105b | Parse → regex |
|---|---|---|---|---|---|
| Correct values (ceiling) | 100% | — | — | — | — |
| PDF / scan / phone photo / handwriting / photocopy / stamp paper | **100%** | 100% | 100% | **100%** | 100% (fields 93%) |
| Names in English letters | 0% | 25% | **50%** | 0% | 0% |
| Time · cost per page | 5.8 s · ₹1 | | | 3.9 s · ₹0.52 | 3.1 s · ₹0.50 |

Classify: 30 / 30 (28 deeds + ration card + tax receipt). What changed because of it: sound-alike name
keys, cross-script names as warnings only, confidence counted only on fields the checks use, Extract
chosen over Parse → LLM for per-field provenance (Parse → LLM is the cost optimisation at scale).
Caveats: 4 deeds per cell, synthetic degradation, one document type.

## Tests

`npm test` (43 tests): every demo case produces exactly its intended findings from perfect readings;
the fact table; unread / unrelated / missing documents; name matching across scripts; priority;
grievance classification; the AI guardrail; the eval scorer.

## Known limitations

- Department records are simulated tables behind one seam (`fetchRegistry`); auth is a single demo
  account with a signed cookie.
- Sarvam Doc AI latency varies a lot (5 s to several minutes per job was observed); intake waits up to
  10 minutes per job, a live upload up to ~50 s before reporting it could not read.
- Grievance categories are keyword rules plus the LLM; no trained classifier.
- Translation renders "வட்டாட்சியர்" as "Circle Officer" (should be Tahsildar).
- The Tamil copy has not been reviewed by a native editor.
