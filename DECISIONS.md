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
opinion. Code finds facts (`lib/verify`), unit-tested (45 tests today); the LLM is given those facts and
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
moving parts for a small app. Typed keys (`MessageKey`) catch missing strings at compile time.
Cost: no pluralisation/ICU. Revisit if a third language is added.

## Version 2: real documents, intake, one screen
What I found reviewing v1 (checkpoint 7 below): a case said "5 documents attached" but nothing could
be opened; the AI only ran when a case was opened; the UI was cluttered and did not look like a real
tool. What changed and why:

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

**Three lists: pending, reopened, completed.** Kept separate so the counts add up and a reopened file
(someone came back, a decision was wrong) is visibly different from new work. Reopening needs a written
reason and is a row in `decisions` (`action = "reopened"`), so the history and audit show who reopened
what and why; it is excluded from the "followed AI" rate. Cases are listed by reference number with the
applicant in brackets — officers search and speak by file number.

**Remarks, and the AI draft as an offer.** The decision box is "reason / remarks": optional to approve,
required to return or reject (enforced on the server too). The AI's draft reply is offered above it with
one click to use, then editable; it is offered only when the chosen decision matches the AI's
suggestion, because a draft written for "return" would be wrong under "approve".

Decision buttons are tinted green / amber / red at rest, deepen on hover and press, and turn solid once
chosen, so every click visibly registers.

## Citizen side (live demo flow)
**A real round trip instead of only pre-seeded cases:** a citizen applies online, the tahsildar returns
it, the citizen fixes it and resubmits, the tahsildar approves.

- **No AI on the citizen side.** The citizen fills a form, uploads, submits and sees the decision with
  the officer's remarks. Showing AI findings to citizens before submission is possible (it would cut
  returns) but changes who is accountable for the check; kept out deliberately.
- **Reading happens after the response** (`after()` in Next.js): each upload is stored, then Sarvam
  reads it in the background, so the citizen never waits on Doc AI latency. Submitting triggers the
  checks and the AI review the same way, after waiting briefly for files still being read. A late read
  re-checks the case. Each upload is its own request, so one slow document can't time out the others.
- **Upload slots say what a file is meant to be.** Classify still runs: a file Classify can't place (a
  blurry photo) counts as the slot's document and is flagged "check by eye"; a confidently different
  document (ration card) is kept but marked as not belonging. A blurry ID is not a wrong document.
- **An online application is the application form**, so it is not asked for as a document.
- **The tax receipt number is read from the receipt**, not typed, and the panchayat record is looked up
  by it — so a fresh receipt after paying is verified against the panchayat's own record of that payment.
- **Resubmission** is a history event done by the citizen (`decisions.action = "resubmitted"`, no
  officer), and the case returns to the officer's **Reopened** list. Older copies of a replaced
  document stay in the file, marked *replaced*.
- **Demo kits** (`public/demo-kits/`, `npm run render:cases -- --kits`) are ordinary files the presenter
  downloads and uploads; "Fill details" only types the land details from the kit's deed.

## Auth
Two seeded accounts: `tahsildar` (supervisor: desk and audit) and `citizen` (their own applications
only). One sign-in form; the role in the signed cookie decides where you land, and every page and file
route checks it. bcrypt, signed httpOnly JWT cookie (jose).
Demo-grade by design.

## Checkpoints, surprises and dropped ideas
Everything above is the "what and why". This part is the story: the steps I went through, what went
wrong on the way, and the ideas I tried and dropped. One item per point.

### Checkpoints in order

**1. Stack: Next.js 15 (App Router, server actions), Tailwind, Drizzle.**
- Why: one deployable app, no separate API server. Server actions keep the AI key and the database on
  the server. One deploy gives the live link the brief asks for.
- Considered: a separate backend (Express/FastAPI) + React app — two things to deploy and secure for no
  gain at this size. shadcn/ui was in the first plan; dropped because a few plain Tailwind components
  were enough and kept the look under my control.
- Surprises while scaffolding: the starter `src/app/page.tsx` sat on `/` and hid the desk (deleted it);
  PGlite needed its folder created first; running `next build` while the dev server was open corrupted
  the PGlite files (made `db` lazy so builds never open it, and recreated `.data`); an `@types/node`
  version clash (pinned to v24).

**2. Use Sarvam for everything except speech.**
- Why: after reading Sarvam's docs I used Chat, Doc AI (Classify, Extract, Parse), Translate,
  Transliterate and language detection. Speech-to-text was left out: "citizen speaks the complaint" is a
  nice demo but does not help an officer decide.
- Surprise: the eval and all early tests cost about ₹1.78 in total — reading is cheap; the real limits
  were credits running out and Doc AI speed, not price.

**3. API keys and credits.**
- Keys live only in `.env.local` (git-ignored); `.env.example` has empty values.
- Credits ran out twice (HTTP 402 "No credits available"): once during the eval, once while reading the
  three petitions. Each time I stopped, topped up the key, and resumed. Because every Sarvam result is
  cached by file hash, resuming never paid twice for the 47 documents already read.

**4. Sarvam API surprises (beyond the ones above).**
- Classify returned HTTP 400 when the categories were sent in a `config` field; it wants a `request`
  field holding `{config: …}`. Found by reading the error body, fixed in `classifyDocument`.
- Parse returns a ZIP with Markdown inside, not text — unzipped with `fflate`.
- Doc AI allows about 10 requests a minute, so submissions are spaced (`SARVAM_SUBMIT_GAP_MS`).

**5. First deploy (v1).**
- Region `sin1` (Singapore) to sit next to the Neon database (also Singapore) and close to Tamil Nadu.
- `maxDuration = 60` on the case page: reading a document (Classify + Extract) and re-reviewing can take
  20–40 s, and server actions share the page's time limit.
- Files read with `fs` at runtime (eval results, case documents) were missing on Vercel, because the
  bundler only ships files it sees imported. Fixed with `outputFileTracingIncludes`.
- Times showed in UTC on the live site. Fixed by storing timestamps with time zone and always formatting
  in `Asia/Kolkata`.

**6. Nothing goes live untested.**
- After v1 went live, I kept all v2 work on a separate branch (`feat/redesign`): no push to `main`, no
  deploy and no live re-seed until v2 was finished and tested. The live site stayed on v1 until then.

**7. Why v2 happened.**
- I walked through one case end to end (PT-2026-0110) as an officer would. The page claimed
  "5 documents attached" with nothing to open, and the AI only ran when the case was opened. That
  walk-through is what led to the v2 rebuild described above.
- It also raised: where do deadlines come from, and how often is urgency computed? The design: the
  deadline is the submission date + the service's legal time limit, and priority is recomputed on every
  page load. No scheduled job — nothing to forget to run, and it is always current.

**8. How the demo documents are made.**
- Each document is an HTML page printed by headless Chrome (PDF or screenshot), then `sips` makes phone
  photos and photocopies as JPEGs.
- Why: Tamil text must be shaped correctly, and Chrome does that perfectly; I also needed control over
  the look (scan, phone photo, photocopy, stamp paper, handwriting) to exercise the reader.
- Considered: a PDF library (weak Tamil shaping) and real scanned documents (privacy, and I could not
  make the exact problems I needed).
- Surprise: re-rendering changes a PDF's bytes even when the content is the same. The reading cache is
  keyed by file hash, so a full re-render would throw away every paid reading. So extra files are rendered
  on their own (`--extras-only`, `--kits`) and the seeded case files are never re-rendered.

**9. Intake run.**
- Doc AI jobs sat in "running" for minutes under load. The batch run waits up to 10 minutes per job and
  keeps 8 documents in flight. 47 of 50 documents were read; the three petitions failed on credits and
  were read later from the same cache.

**10. One login (v2), then a second for the citizen.**
- v2 kept a single officer account — the tahsildar, who has the most power — to keep the demo simple.
  A separate supervisor account was dropped.
- The citizen account came later for the live round-trip demo (see Citizen side).

**11. UI polishing after reviewing v2.**
- Decision buttons got colours and press feedback; the Next.js dev badge was hidden (it sat over the
  queue).
- Cases are shown as `PT-2026-0208 (கவிதா மு)`. I first planned curly braces, then used round brackets
  because `{ }` looks like code to an officer.
- The list tabs went through two rounds: first made full-width and much bigger (two lines: label, then
  count), then made slimmer (one line) because they no longer lined up with the rest of the side panel.
- The Tamil label "மீண்டும் திறந்தவை" was cut off in its tab, so it became "மறுதிறப்பு".

**12. Citizen flow — what testing found.**
- The first blurry ID card was so blurred that a person could not read it either. That defeats the point
  ("the officer checks by eye"), so the blur was reduced and the card made bigger: a person can make out
  the name and date, but OCR struggles.
- Result in testing: Sarvam read the blurry card but with low confidence, and misread the ID number
  (5307 → 5387). A good demo of why a person checks.
- The document tile said "Read · 100%" for that card while the check said "could not be read
  confidently". The 100% was Classify's confidence (it knew it was an ID card), not the field reading.
  The tile now also looks at the field confidence, so tile and check agree.
- The AI summary once said the buyer bought the land "from herself and the seller". Fixed with a prompt
  rule: the applicant is the buyer, who bought from the seller. The next review said it correctly.
- After resubmitting, the officer saw two tax receipts with nothing to tell them apart. Older copies are
  now marked "replaced", greyed out and listed last.
- How to make "pay the dues and resubmit" honest: the government record had to agree with the new
  receipt. Considered: changing the record when the citizen uploads (that is cheating — the record would
  just believe the citizen) or leaving it fixed (the dues would never clear). Chosen: look the panchayat
  record up by the receipt number read from the receipt. Both receipts exist in the panchayat's record,
  so the new one is verified against the panchayat's own data.
- Draft applications are hidden from officers; reference numbers continue from PT-2026-0209.

**13. Going live with v2.**
- Order mattered: the database was reset first, then the code was pushed, so the new code never ran
  against the old tables.
- The live site still had an old Sarvam key without credits; I updated it in Vercel.
- Local scripts read secrets with `node --env-file=.env.local` instead of `source .env.local`: the Neon
  address contains an `&`, which the shell treats as a command separator.

### Ideas I tried or planned, then dropped
- **Four different documents in the eval** — changed to one document in many forms, because what varies
  in real life is how the *same* document arrives; typed correct values are the ceiling.
- **Parse → LLM as the live reading pipeline** — matched accuracy at half the price, kept in the eval
  only; Extract won for per-field provenance (see above).
- **Transliterating Roman → Tamil** — produced Malayalam letters.
- **shadcn/ui** — not needed.
- **v1's separate checks and panels** (`verifyDeedDoc`, registry client, AiPanel, Compare, DeedUpload)
  — replaced by one fact-by-source table.
- **Cases that only claimed documents** ("5 attached" with nothing to open) — every document is now a
  real file.
- **AI running when the officer opens a case** — moved to intake.
- **Several officer accounts / a supervisor login** — one tahsildar account is enough for the demo.
- **Step-by-step portal layout (mockup B)** — the inbox split view was chosen.
- **A public form with a tracking link for citizens** — chose a citizen login instead.
- **Showing citizens what the AI read, live, as each file uploads** — first plan for the citizen flow;
  dropped to keep AI off the citizen side (see Citizen side).
- **Very blurry demo ID**, **curly braces**, **tall two-line tabs**, **the long Tamil "reopened" label**
  — all replaced (see checkpoints 11 and 12).
- **Changing the government record when a citizen uploads a new receipt** — rejected (see 12).

## Not done (time budget)
Real department APIs, notification to the citizen, citizens filing grievances online, bulk actions, e2e
browser tests, screen-reader audit, object storage for uploads, a post-check that every name in an AI
summary appears in the facts.
