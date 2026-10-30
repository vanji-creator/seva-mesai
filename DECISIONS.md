# Decision log

Each entry: what, why, what I gave up. Written to be defended in an interview.

## Problem selection
Chose **data silos** (officers manually cross-verifying documents across departments) over
payroll-server congestion (an infrastructure problem, not an officer-tool problem) and
workflow-hierarchy fatigue (used as a *design constraint*, not the product). The brief's
"inconsistencies" requirement maps directly to cross-department verification.
Grievances added as a second service type to show the desk generalises: same queue, same AI panel,
different verifier.

## Why a deterministic verifier before the LLM
Government decisions must be explainable and reproducible. A name/extent mismatch is a fact, not an
opinion. Code finds facts (`lib/verify`), tested with 17 unit tests; the LLM is given those facts and
only narrates and recommends. Cost: more code than a single prompt. Benefit: no hallucinated
"inconsistencies", works offline, auditable.

## LLM provider and output contract
**Provider-neutral OpenAI-compatible call, Sarvam AI by default.** Chosen for cost (signup credits, low
per-token price versus frontier APIs) and Indic-language focus, which matters for Tamil officer-facing text.
Plain `fetch` instead of a vendor SDK: no lock-in, and `LLM_BASE_URL`/`LLM_MODEL` swap the provider.
Tamil copy of the *deterministic* findings is hand-written; the model only adds summary, reasons and a
draft citizen reply. Live-tested with `sarvam-105b` on the seeded cases: valid JSON, Tamil output,
suggestions consistent with the rules, about 1 s per call.

Output contract: `response_format: json_object` plus the exact shape in the system prompt (portable across
providers, unlike tool-calling or strict JSON-schema), then tolerant extraction (`extractJson` strips
`<think>` blocks and code fences) and zod validation. The model authors only
`summary / suggestion / reasons / draftReply`; findings are never LLM-authored. Any parse/HTTP/timeout error
falls back to the rule-based analysis. Applicant free text is passed as data inside `<case>` tags and the
system prompt says to treat it as data (prompt-injection posture for citizen-written text).

What live testing changed:
- **Reasoning off (`reasoning_effort: null`).** Sarvam thinks by default; even at "low" it spent ~1,260 of
  1,500 tokens on hidden reasoning, so on real prompts the JSON answer was cut off and every call fell back
  to rules. The checking already happens in code and the model only writes, so reasoning adds cost and
  latency (7–10 s → ~1 s) for nothing here.
- **Urgency is a warning, not a blocker.** With "urgent" marked as a blocker, the model suggested *reject*
  for an urgent water complaint (blockers forbid approve). Urgency is a priority signal, not a defect, and the
  queue already ranks on it. The prompt now also defines approve/return/reject for grievances.
- **Draft replies:** the model first told a citizen officials "have been ordered" to act, and leaked internal
  codes. The prompt now forbids codes and any claim that something was approved, ordered or fixed; the
  officer reviews the draft before it goes anywhere.

## Fixes from end-to-end testing
- **Duplicate grievances are accepted, not returned.** The first rule turned POSSIBLE_DUPLICATE into
  "return", and the model then told the citizen their details were incomplete — false. A duplicate is a
  valid complaint to handle together with the earlier one; the prompt now says so.
- **Analyses are per language.** Switching to English showed the Tamil analysis; the page now shows the
  analysis for the current language and generates one if missing.
- **A wrong upload doesn't count as the deed being attached.**
- **Phone width:** the comparison table scrolls inside its own box (a grid column needed `min-w-0`).

## Guardrails
- `reconcile()`: model may be stricter than rules, never more lenient; when it is overridden its narrative is replaced by the rule-based summary so text and verdict never disagree.
- AI never writes `applications.status`. `decideAction` does, after auth, and only if still `pending`
  (the `WHERE status='pending'` update also prevents double decisions).
- Reason required for reject/return, enforced server-side.
- `decisions.followed_ai` records agreement, giving a supervisor an audit signal.

## Document reading: measure first, then choose
**Why one document type, many input forms.** Officers don't receive "a deed"; they receive a typed PDF,
a phone photo, a photocopy of a handwritten form. So the eval keeps the document fixed and varies how it
arrives, with **correct values typed directly** as the ceiling: any drop from that row is the cost of
reading the document, nothing else.

**Why decision accuracy is the headline metric.** Field accuracy can mislead: the regex baseline lost the
sale amount on most documents (93% fields) but never changed a decision, because the checks use five
fields. What matters to an officer is "would I have been told the same thing".

**Pipelines compared** (all cached, so adding one never re-pays for API calls): Sarvam Extract with a
JSON schema; Extract + transliteration; Extract + sound-alike name keys; Parse (OCR) → `sarvam-105b`;
Parse → regex (the no-AI baseline that shows what the AI step buys).

**Chosen: Classify → Extract.** Classify first, so a wrong upload (ration card instead of a deed) stops
before the paid extraction. Extract over Parse → LLM even though the latter matched accuracy at half the
price and ~2 s faster: Extract returns per-field source locations, one call instead of two, and no
prompt to maintain. It's a judgement call I'd revisit at volume, and the harness makes that a re-run.

**Store the reading with the document.** v1 kept only extracted values; v2 keeps the file too (see
Version 2), because an officer must be able to open the paper the AI read.

**Seeded readings come from real runs.** `scripts/precompute-readings.ts` caches every Sarvam result and
writes `src/db/fixtures/readings.json`, so a fresh install shows real readings without spending credits.

What the eval found and what changed:
- **Script mismatch is the real failure mode.** Tamil writes k/g, t/d, p/b with one letter each, so
  transliterated "Kovindan" ≠ deed "Govindan". Added `romanKey()` (sound-alike key) for cross-script
  comparison only: decision accuracy on English-letter deeds went 0% → 25% (transliteration) → 50%.
  Remaining misses: a Sarvam transliteration error ("செல்வம்" → "Sevalam") and romanising erasing a real
  spelling difference (கார்த்திகேயன் / கார்த்திக்கேயன் → both "Karthikeyan"). Not solvable by matching
  alone, so the **policy** follows the measurement: a cross-script name difference is a "confirm by eye"
  warning (`DOC_*_SCRIPT_CHECK`), never a blocker, and it is kept out of the registry-mismatch check.
  Live test: an English-letter deed for செல்வம் ("Selvam") went from two false blockers to one warning.
- **Never transliterate Roman → Tamil**: it leaked Malayalam letters ("கார்த்திகேയൻ").
- **Extract's confidence isn't trustworthy for reformatted fields**: correct dates scored 0.13 because
  DD-MM-YYYY was rewritten as YYYY-MM-DD. The low-confidence warning uses only the fields checks rely on.
- **Polling bug**: treating "not pending/running" as finished caused a 409 on results; now waits for
  documented terminal states and retries 409 briefly.
- Limits of the eval: 4 deeds per cell, synthetic degradation (real photos are worse), one document type.
  The photocopy variant was not hard enough to break anything — a sign the next round needs real-world
  quality samples (with consent, anonymised) or stronger degradation.

## Priority
Additive score (SLA state dominates; age, blockers, warnings and grievance urgency break ties) in
`lib/priority.ts`. Chosen over ML ranking because an officer can see why a file is on top, and it is
trivially testable. Weights are illustrative and would be tuned with real SLA data.

## Database
Postgres via Drizzle. Vercel functions have no persistent disk, so SQLite is unsuitable in production.
Locally PGlite (embedded Postgres) removes setup friction for reviewers. Trade-off: two drivers behind
one `Db` type, and `db` is lazy (Proxy) so builds don't open the local database.

## i18n
Own tiny dictionary + cookie locale instead of next-intl URL routing: two locales, no SEO need, fewer
moving parts in a 6-hour build. Typed keys (`MessageKey`) catch missing strings at compile time.
Cost: no pluralisation/ICU. Revisit if a third language is added.

## Version 2: real documents, intake, one screen
Feedback on v1: a case said "5 documents attached" but nothing could be opened; the AI only ran when a
case was opened; the UI looked like a school project. What changed and why:

- **One case per problem type, every document real.** `src/db/cases.ts` is the single source: it drives
  the rendered documents, the simulated department records and the seed, so the three can never
  disagree by accident. Problems come from where they do in real life — what the citizen typed (0202,
  0203), what a document reveals (0204 tax, 0205 mortgage, 0206 owner), a missing document (0207), or a
  doctored copy (0208).
- **Fact-by-source comparison** (`caseCheck.ts`) replaced separate registry and deed checks. Each fact
  is compared across the application, every document and the government record, with the record as
  reference. One table for the officer instead of overlapping finding lists, and the distinction that
  matters: *application differs* = typing error, *document differs* = suspicious copy.
- **Work at intake, not on click.** Reading (`npm run precompute:read`) and review (`precompute:review`)
  run once and are stored (fixtures → seed). Opening a case is instant and costs nothing; "Re-check",
  "Read again" and "Add document" run the same code live.
- **Petitions:** OCR (Parse) → strip the demo footer → Sarvam Translate. Grievance category, urgency and
  duplicates are computed from the text read from the petition, not from typed data.
- **Duplicates are directional:** only an earlier complaint is "the original"; otherwise both would flag
  each other on re-check.
- **Never claim what wasn't checked:** an unread document is "not read yet", never "low confidence"; the
  queue never says "no issues" without a review; petition text is shown only if actually read.
- **Sarvam latency:** Doc AI jobs went from ~5 s to several minutes under load (status "running" with a
  10-minute budget). Intake waits up to 10 minutes, keeps 8 documents in flight (submissions still paced
  under ~10/min), and — when the citizen labelled the attachment — runs Classify and Extract in parallel,
  discarding the extraction if Classify disagrees.
- **Uploads are stored in the database row** (bytea, ≤ 4 MB): no extra blob store for a demo; seeded
  files stay static. Production would use object storage with virus scanning.

What end-to-end testing of v2 changed:
- **An unrelated extra paper never sends a file back.** A ration card added to a complete case first
  flipped the suggestion to "return" — making the citizen travel for nothing. It is still flagged
  ("can be set aside"), but `DOC_UNRELATED` no longer drives the suggestion.
- **Findings name only the sources that actually agree.** On the doctored-copy case the message said
  "documents and record say 80" while the deed copy said 120; it now says "patta and record".
- **The model re-spelt a name** (முருகேசன் → முருகன்) in one live re-check. The prompt now says to copy
  names, numbers and extents exactly; regenerated reviews were checked against the records.
  Not solvable by prompt alone at scale — a post-check that every name in the summary appears in the
  facts would be the next step.
- **Finding codes stay in the stored review** (so reasons can be traced to checks) but are hidden on screen.
- **English mode had Tamil leaking** from what was read off the EC; the English line is now rebuilt from
  the structured parts (amount, document number, date).

## UI
Inbox split view (queue left, case right), chosen over a step-by-step portal layout after comparing two
mockups, then made deliberately minimal: system font stack with Noto Sans Tamil, white surfaces, one
blue accent, colour only for disagreement and urgency. The AI suggestion is labelled on the decision
buttons, never pre-selected. Documents open in a viewer with "what was read" beside the image, so every
value can be checked by eye. Phones: the queue is the home screen, a case is full screen.

## Auth
One seeded account (`tahsildar`, supervisor: desk and audit). bcrypt, signed httpOnly JWT cookie (jose).
Demo-grade by design.

## Not done (time budget)
Real department APIs, notification to the citizen, bulk actions, e2e browser tests, screen-reader audit,
officer-editable draft replies, object storage for uploads.
