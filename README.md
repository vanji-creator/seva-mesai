# சேவை மேசை · Seva Mesai

A **Tamil-first desk for revenue officers** (Revenue Inspector / Tahsildar) to process
**patta name-transfer applications** and **citizen grievances** with AI assistance —
where the officer always makes the final call.

> All data is fictional. No real citizen data is used.

**Live demo:** https://seva-mesai.vercel.app
— sign in as `ri.ponneri` (Revenue Inspector) or `tahsildar` (supervisor, also sees Audit), password `Demo@1234`.
Tamil by default; the **English** button is top right.

## The problem

Officers verify land and civil applications across **disconnected department systems**
(Registration, Revenue, Tax). A Revenue Inspector reviewing a patta transfer must ask the
citizen for paper copies of the sale deed, tax receipt and encumbrance certificate, then
compare names, survey numbers and extents by eye. Files stall; older officers fatigue on
dense, English-heavy, dropdown-heavy portals; citizens make repeat trips.

**Who it affects:** officers (slow, error-prone cross-checking, no sense of what is urgent)
and citizens (delays, returned files with unclear reasons).

## What the app does

| Officer need | How it is met |
|---|---|
| See what needs attention first | Priority queue ranked by SLA breach, age, issues found and grievance urgency; urgent / attention / normal bands |
| Stop chasing paper | Evidence is fetched automatically from (mock) Registration, Revenue and Tax records and shown side by side with the application; mismatches highlighted |
| Read the citizen's deed for them | Upload the sale deed (PDF / photo / scan): Sarvam **Classify** rejects wrong documents, **Extract** reads the fields, and a **three-way check** compares *application ↔ uploaded deed ↔ registered deed* |
| AI assistance on each file | Summary, missing documents, inconsistencies, a suggested decision with reasons (and a draft citizen reply for grievances) |
| Decide | Approve / Return / Reject. Reject and Return require a written reason. Every decision is logged with whether it followed the AI |
| Local language | Tamil by default, English toggle; large type, plain words, few clicks |

Two services share one desk: **Patta name transfer** and **Grievances** (category and
department routing, urgency, duplicate detection, repeat-complaint flag).

## Demo

Login (fictional accounts): `ri.ponneri` (officer) or `tahsildar` (supervisor, also sees **Audit**),
password `Demo@1234`.

Seeded cases to try: a clean file, a missing document, a spelling difference, extent mismatch,
tax dues, mortgage in the encumbrance record, seller who is not the patta holder, pending
litigation, a deed that does not exist, an urgent water grievance, duplicate sanitation
complaints and a vague complaint.

**Document reading:** PT-2026-0104 (phone photo of the deed) and PT-2026-0103 (handwritten form)
come pre-read — see the third "On the deed" column. On PT-2026-0101 and PT-2026-0107, pick a sample
document (typed PDF, phone photo, handwriting, photocopy, stamp paper…) and press *Read this* to run
the live pipeline (needs a Sarvam key with credit). **Evals** in the top bar shows how each pipeline
performs on each kind of document.

## Run locally

```bash
npm install
cp .env.example .env.local      # optional: add LLM_API_KEY (Sarvam) for the LLM layer
npm run seed                    # creates schema + fictional data (embedded Postgres, no setup)
npm run dev                     # http://localhost:3000
npm test                        # unit tests
```

Without `LLM_API_KEY` everything works using the rule-based layer and shows an
"AI offline" banner. With `DATABASE_URL` set (e.g. Neon) the same commands target that database.

Re-running the document eval (optional; results are committed in `eval/results.json`):

```bash
npm run eval:render   # renders fictional deeds into 7 document forms (needs Google Chrome + macOS sips)
npm run eval          # runs every form through every pipeline; API results cached in eval/cache
```

## Document pipeline and eval

One document (the sale deed), many ways it reaches the office. Four fictional deeds with known
answers were rendered as: **correct values typed directly (ceiling)**, typed PDF, clean scan, phone
photo (skew, shadow, blur), printed form with handwritten fill-ins, poor photocopy, names in English
letters, and stamp paper with seals over the text. Each was run through five pipelines and scored on
**field accuracy** (7 fields) and **decision accuracy** — would the officer see the same suggestion
and the same issues as with the correct values. Full table: [eval/RESULTS.md](eval/RESULTS.md).

| Document form | Sarvam Extract | Extract + transliteration | + sound-alike names | Parse → sarvam-105b | Parse → regex (no AI) |
|---|---|---|---|---|---|
| Correct values (ceiling) | 100% | — | — | — | — |
| Typed PDF / clean scan / phone photo / handwriting / photocopy / stamp paper | **100%** | 100% | 100% | **100%** | 100% (fields 93%) |
| Names in English letters | 0% | 25% | **50%** | 0% | 0% |
| Time · cost per page | 5.8 s · ₹1 | | | 3.9 s · ₹0.52 | 3.1 s · ₹0.50 |

**Classify** got 30 / 30: all 28 deeds, plus the fake ration card and tax receipt rejected as wrong documents.

What we learned, and what changed because of it:
- On Tamil-script documents both Sarvam pipelines were perfect, even on degraded images; the regex
  baseline lost fields (amount) but not decisions, because the checks only use five fields.
- **Names in English letters are the real risk.** Tamil writes k/g, t/d, p/b with one letter, so
  "கோவிந்தன்" transliterates to "Kovindan" while the deed says "Govindan". Comparing *sound-alike keys*
  (`romanKey`) doubled accuracy; the rest are a transliteration error ("செல்வம்" → "Sevalam") and a case
  where romanising erased a genuine spelling difference. So in the app a cross-script name difference is
  **never a blocker**: it becomes a "confirm by eye" warning showing both spellings.
- Extract's per-field confidence is not reliable for reformatted fields (correct dates scored 0.13), so
  only the fields the checks use count toward the "low confidence" warning.
- **Chosen pipeline: Classify → Extract.** Parse → LLM was as accurate, cheaper and faster here; Extract
  was kept for per-field source locations (auditability) and one call instead of two. With more volume,
  Parse → LLM is the obvious cost optimisation and the eval harness is ready to re-check it.

Caveats: 4 deeds per cell, synthetic degradations (real phone photos are messier), one document type.

## Architecture

```
Browser ── Next.js App Router (server components + server actions)
              ├─ lib/verify    deterministic cross-checks (patta, grievance)  ← facts
              ├─ lib/registry  RegistryClient: mock tables today, department APIs tomorrow
              ├─ lib/ai        OpenAI-compatible LLM (Sarvam default), JSON output zod-validated ← narration + recommendation
              ├─ lib/sarvam    Sarvam client: Doc AI jobs (classify / extract / parse), translate, transliterate
              ├─ lib/docs      readDeed(): Classify → Extract → stored reading (file itself not kept)
              ├─ lib/priority  transparent additive score for the queue
              └─ db            Drizzle ORM → Postgres (Neon in prod, PGlite locally)
eval/                          cases (ground truth) · render (Chrome) · pipelines · score · cached runner
```

**Key technical decisions** (details and trade-offs in [DECISIONS.md](DECISIONS.md)):

1. **Deterministic verifier + LLM, not LLM alone.** Mismatches and missing documents are found
   by code (testable, reproducible). The LLM only writes the summary, reasons and a
   recommendation from those findings.
2. **The model can be stricter than the rules, never more lenient.** If checks found problems,
   an "approve" from the model is overridden (and its narrative replaced by the rule-based one) (`reconcile` in `lib/ai/schema.ts`, unit-tested).
3. **Human in the loop enforced in code.** AI never changes a status. Only an authenticated
   officer's action does, and reasons for reject/return are validated server-side.
4. **Provider-neutral, India-friendly LLM.** One plain `fetch` to an OpenAI-compatible endpoint. Default is Sarvam AI (`sarvam-105b`, built for Indic languages, low cost with signup credits); set `LLM_BASE_URL`/`LLM_MODEL` to swap in Groq, OpenRouter, Gemini etc. No vendor SDK.
5. **Graceful degradation.** API key missing or call failing → rule-based analysis, clearly labelled.
6. **Silo boundary is explicit** (`RegistryClient`) so real department APIs can replace the mock tables.
7. **Zero-setup local run** via embedded Postgres; production uses Neon (Vercel has no persistent disk).
8. **Tamil first**, cookie-based locale, Noto Sans Tamil, 18px base type, status shown by text+icon, never colour alone.

## Tests

`npm test` (35 tests) covers the verifier (clean, missing docs, spelling drift, extent, ownership, tax,
mortgage, litigation, missing deed), the three-way deed-document check, sound-alike name keys, the
priority score, grievance classification, the AI guardrail and the eval scorer itself.

## Known limitations (honest list)

- Mock registries and demo-grade auth (seeded users, signed cookie). Real use needs SSO, RBAC, rate limiting.
- Name matching is edit-distance on Tamil script (sound-alike keys across scripts); real systems need Aadhaar-linked identity.
- Grievance category rules are keyword-based; the LLM refines, but there is no trained classifier.
- Only the sale deed is read; other documents (EC, tax receipt) are still present/absent. The uploaded
  file is not stored, only what was read from it. Uploads are capped at 4 MB (Vercel request limit).
- Timing and SLA values are illustrative, not official.
- LLM output is live-tested on the seeded cases with `sarvam-105b`, not evaluated at scale. Draft replies can
  still drift (e.g. "has been forwarded" in past tense), which is why they are drafts for the officer to edit.
- The Tamil wording has not been reviewed by a native editor.
