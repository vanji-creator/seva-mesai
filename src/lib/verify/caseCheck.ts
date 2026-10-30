import { aresToCents, type DocKind } from "@/db/cases";
import { isTamil } from "@/lib/docs/deed";
import type { DocReading } from "@/lib/docs/read";
import type { Finding, PattaPayload } from "@/lib/types";
import { romanKey, similarity } from "./fuzzy";
import { summarise } from "./patta";

/**
 * Every fact of a patta transfer, compared across every place it appears:
 * what the citizen typed, each document they attached, and the government record.
 * The government record is the reference; anything that disagrees with it is a finding.
 */

export type Source = "application" | Exclude<DocKind, "application_form" | "petition"> | "registry";
export type CellStatus = "ok" | "near" | "bad" | "absent";
export type FactKey = "deedNo" | "seller" | "buyer" | "surveyNo" | "extent" | "owner" | "tax" | "encumbrance";

export interface Cell { source: Source; value: string | null; status: CellStatus }
export interface FactRow { fact: FactKey; cells: Cell[]; status: "ok" | "near" | "bad" }

export interface RegistryRecord {
  deed: { deedNo: string; seller: string; buyer: string; surveyNo: string; extentCents: number } | null;
  land: { currentOwner: string; extentCents: number; pattaNo?: string | null } | null;
  tax: { paidUpToYear: number; duesAmount: number } | null;
  encumbrances: { kind: "mortgage" | "litigation" | "none"; detail: string }[];
}

export interface CaseInput {
  application: PattaPayload;
  /** Latest reading per document kind attached to the case. */
  docs: Partial<Record<DocKind, DocReading>>;
  /** Files that turned out not to belong (e.g. a ration card). */
  unrelated: { docType: string | null; fileName: string }[];
  registry: RegistryRecord;
  /** Start year of the current financial year (2026 for 2026-27). */
  fyStart: number;
}

export const REQUIRED: DocKind[] = ["application_form", "sale_deed", "patta", "ec", "tax_receipt", "id_proof"];

export const FACT_LABEL: Record<FactKey, { ta: string; en: string }> = {
  deedNo: { ta: "பத்திர எண்", en: "Deed no." },
  seller: { ta: "விற்பவர்", en: "Seller" },
  buyer: { ta: "வாங்குபவர்", en: "Buyer" },
  surveyNo: { ta: "சர்வே எண்", en: "Survey no." },
  extent: { ta: "பரப்பு", en: "Extent" },
  owner: { ta: "பட்டாதாரர்", en: "Patta holder" },
  tax: { ta: "வரி நிலுவை", en: "Tax dues" },
  encumbrance: { ta: "வில்லங்கம்", en: "Encumbrance" },
};

export const SOURCE_LABEL: Record<Source, { ta: string; en: string }> = {
  application: { ta: "விண்ணப்பம்", en: "Application" },
  sale_deed: { ta: "கிரையப் பத்திரம்", en: "Sale deed" },
  patta: { ta: "பட்டா", en: "Patta" },
  ec: { ta: "வில்லங்கச் சான்று", en: "EC" },
  tax_receipt: { ta: "வரி ரசீது", en: "Tax receipt" },
  id_proof: { ta: "அடையாள அட்டை", en: "ID card" },
  registry: { ta: "அரசுப் பதிவு", en: "Govt. record" },
};

const DOC_TA: Record<DocKind, string> = {
  application_form: "விண்ணப்பப் படிவம்", sale_deed: "கிரையப் பத்திரம்", patta: "பட்டா / சிட்டா", ec: "வில்லங்கச் சான்றிதழ்",
  tax_receipt: "சொத்து வரி ரசீது", id_proof: "அடையாள அட்டை", petition: "மனு",
};
const DOC_EN: Record<DocKind, string> = {
  application_form: "application form", sale_deed: "sale deed", patta: "patta", ec: "encumbrance certificate",
  tax_receipt: "tax receipt", id_proof: "ID card", petition: "petition",
};

// Document types Classify can return that don't belong in a patta file.
const OTHER_DOC: Record<string, { ta: string; en: string }> = {
  ...Object.fromEntries((Object.keys(DOC_TA) as DocKind[]).map((k) => [k, { ta: DOC_TA[k], en: DOC_EN[k] }])),
  ration_card: { ta: "குடும்ப அட்டை", en: "ration card" },
};

const SAME = 0.9;
const SPELLING = 0.65;
const LOW_CONFIDENCE = 0.8;

type V = Record<string, unknown>;
const val = (r: DocReading | undefined): V | null => (r?.values as V) ?? null;
const str = (x: unknown) => (typeof x === "string" && x ? x : null);
const numOrNull = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);

/** Name comparison, script-aware: Roman vs Tamil goes through sound-alike keys (eval-driven). */
function nameStatus(reference: string, other: string | null, roman: Record<string, string>): CellStatus {
  if (!other) return "absent";
  const cross = isTamil(reference) !== isTamil(other);
  const s = cross
    ? similarity(romanKey(isTamil(reference) ? roman[reference] ?? reference : reference), romanKey(isTamil(other) ? roman[other] ?? other : other))
    : similarity(reference, other);
  // Cross-script matching is unreliable (eval: 50%), so it can only ever ask for a look, never fail.
  if (cross) return s >= 0.85 ? "ok" : "near";
  return s >= SAME ? "ok" : s >= SPELLING ? "near" : "bad";
}
const codeEq = (a: string | null, b: string | null) => !!a && !!b && a.replace(/\s+/g, "").toUpperCase() === b.replace(/\s+/g, "").toUpperCase();
function extentStatus(reference: number, other: number | null): CellStatus {
  if (other === null) return "absent";
  const diff = Math.abs(other - reference) / reference;
  return diff <= 0.02 ? "ok" : diff <= 0.1 ? "near" : "bad";
}
const worst = (cells: Cell[]): FactRow["status"] =>
  cells.some((c) => c.status === "bad") ? "bad" : cells.some((c) => c.status === "near") ? "near" : "ok";

export function checkPattaCase(input: CaseInput) {
  const { application: a, docs, registry: reg } = input;
  const roman: Record<string, string> = Object.assign({}, ...Object.values(docs).map((d) => d?.roman ?? {}));
  const deed = val(docs.sale_deed), patta = val(docs.patta), ec = val(docs.ec), tax = val(docs.tax_receipt), id = val(docs.id_proof);
  const ecEntries = (ec?.entries as { date: string | null; nature: string; docNo: string | null; detail: string | null }[] | undefined) ?? [];
  const rows: FactRow[] = [];
  const f: Finding[] = [];
  const add = (x: Finding) => f.push(x);

  // ---- documents present / readable / belonging
  for (const k of REQUIRED) {
    if (!docs[k]) add({ code: `DOC_MISSING_${k.toUpperCase()}`, severity: "blocker", ta: `${DOC_TA[k]} இணைக்கப்படவில்லை`, en: `${DOC_EN[k][0].toUpperCase()}${DOC_EN[k].slice(1)} is not attached` });
  }
  const unread = (Object.entries(docs) as [DocKind, DocReading][]).filter(([, r]) => r.engine === "pending").map(([k]) => k);
  if (unread.length) {
    add({ code: "DOC_NOT_READ", severity: "warning", ta: `இன்னும் படிக்கப்படவில்லை: ${unread.map((k) => DOC_TA[k]).join(", ")}`, en: `Not read yet: ${unread.map((k) => DOC_EN[k]).join(", ")}`, refs: unread });
  }
  for (const [k, r] of Object.entries(docs) as [DocKind, DocReading][]) {
    if (r.engine === "pending") continue;
    if (r.reviewRequired || (r.minConfidence !== null && r.minConfidence < LOW_CONFIDENCE)) {
      add({ code: `DOC_LOW_CONFIDENCE_${k.toUpperCase()}`, severity: "warning", ta: `${DOC_TA[k]} தெளிவாகப் படிக்கப்படவில்லை — மூல ஆவணத்துடன் சரிபார்க்கவும்`, en: `The ${DOC_EN[k]} could not be read confidently — check the original`, refs: [k] });
    }
  }
  for (const u of input.unrelated) {
    const kind = u.docType ? OTHER_DOC[u.docType] : undefined;
    add({ code: "DOC_UNRELATED", severity: "warning", ta: `"${u.fileName}" இந்த விண்ணப்பத்துக்குரிய ஆவணம் அல்ல (${kind?.ta ?? "வகை அறிய முடியவில்லை"}) — ஒதுக்கி வைக்கலாம்`, en: `"${u.fileName}" does not belong to this application (${kind?.en ?? "type unknown"}) — it can be set aside` });
  }

  // ---- deed number
  const regDeed = reg.deed;
  if (!regDeed) {
    add({ code: "DEED_NOT_FOUND", severity: "blocker", ta: `பத்திர எண் ${a.saleDeedNo} பதிவுத்துறையில் இல்லை`, en: `Deed ${a.saleDeedNo} is not in the Registration records`, source: "பதிவுத்துறை", refs: ["registry"] });
  }
  const refDeedNo = regDeed?.deedNo ?? a.saleDeedNo;
  const ecSale = ecEntries.find((e) => e.nature === "sale" && codeEq(e.docNo, refDeedNo));
  rows.push(row("deedNo", [
    cell("application", a.saleDeedNo, codeEq(a.saleDeedNo, refDeedNo) ? "ok" : "bad"),
    docCell("sale_deed", docs, str(deed?.deedNo), (v) => (codeEq(v, refDeedNo) ? "ok" : "bad")),
    docCell("ec", docs, ecSale?.docNo ?? (ec ? "—" : null), () => (ecSale ? "ok" : "near")),
    cell("registry", regDeed?.deedNo ?? null, regDeed ? "ok" : "bad"),
  ]));

  // ---- parties
  for (const role of ["seller", "buyer"] as const) {
    const ref = regDeed?.[role] ?? str(deed?.[role]) ?? a[role];
    const cells = [
      cell("application", a[role], nameStatus(ref, a[role], roman)),
      docCell("sale_deed", docs, str(deed?.[role]), (v) => nameStatus(ref, v, roman)),
      ...(role === "buyer" ? [docCell("id_proof", docs, str(id?.name), (v) => nameStatus(ref, v, roman))] : []),
      cell("registry", regDeed?.[role] ?? null, regDeed ? "ok" : "absent"),
    ];
    rows.push(row(role, cells));
    const ta = role === "seller" ? "விற்பவர்" : "வாங்குபவர்";
    nameFindings(cells, role, ta, ref, add);
  }

  // ---- survey number
  const refSurvey = regDeed?.surveyNo ?? a.surveyNo;
  const surveyCells = [
    cell("application", a.surveyNo, codeEq(a.surveyNo, refSurvey) ? "ok" : "bad"),
    docCell("sale_deed", docs, str(deed?.surveyNo), (v) => (codeEq(v, refSurvey) ? "ok" : "bad")),
    docCell("patta", docs, str(patta?.surveyNo), (v) => (codeEq(v, refSurvey) ? "ok" : "bad")),
    docCell("ec", docs, str(ec?.surveyNo), (v) => (codeEq(v, refSurvey) ? "ok" : "bad")),
    docCell("tax_receipt", docs, str(tax?.surveyNo), (v) => (codeEq(v, refSurvey) ? "ok" : "bad")),
    cell("registry", regDeed?.surveyNo ?? null, regDeed ? "ok" : "absent"),
  ];
  rows.push(row("surveyNo", surveyCells));
  mismatchFindings(surveyCells, "SURVEY", "சர்வே எண்", "survey no.", refSurvey, add);

  // ---- extent (cents; patta is printed in hectare-ares)
  const refExtent = regDeed?.extentCents ?? numOrNull(deed?.extentCents) ?? a.extentCents;
  const pattaCents = numOrNull(patta?.extentAres) !== null ? aresToCents(patta!.extentAres as number) : null;
  const extentCells = [
    cell("application", `${a.extentCents}`, extentStatus(refExtent, a.extentCents)),
    docCell("sale_deed", docs, numOrNull(deed?.extentCents)?.toString() ?? null, (v) => extentStatus(refExtent, Number(v))),
    docCell("patta", docs, pattaCents?.toString() ?? null, (v) => extentStatus(refExtent, Number(v))),
    cell("registry", regDeed ? `${regDeed.extentCents}` : null, regDeed ? "ok" : "absent"),
  ];
  rows.push(row("extent", extentCells));
  mismatchFindings(extentCells, "EXTENT", "பரப்பு", "extent", `${refExtent}`, add, " சென்ட்", " cents");

  // ---- current patta holder must be the seller
  const owner = reg.land?.currentOwner ?? str(patta?.owner);
  const ownerCells = [
    docCell("patta", docs, str(patta?.owner), (v) => (owner ? nameStatus(owner, v, roman) : "absent")),
    cell("registry", reg.land?.currentOwner ?? null, reg.land ? "ok" : "absent"),
  ];
  if (owner && nameStatus(owner, a.seller, roman) === "bad") {
    ownerCells.forEach((c) => { if (c.value) c.status = "bad"; });
    add({ code: "SELLER_NOT_OWNER", severity: "blocker", ta: `தற்போதைய பட்டாதாரர் "${owner}"; விற்பவர் "${a.seller}" அல்ல`, en: `Current patta holder is "${owner}", not the seller "${a.seller}"`, source: "வருவாய்த்துறை", refs: ["patta", "registry"] });
  }
  rows.push(row("owner", ownerCells));
  mismatchFindings(ownerCells, "OWNER", "பட்டாதாரர்", "patta holder", owner ?? "", add);

  // ---- tax
  const dues = Math.max(numOrNull(tax?.dues) ?? 0, reg.tax?.duesAmount ?? 0);
  const paidUpTo = str(tax?.paidUpTo);
  const paidFy = paidUpTo ? Number(paidUpTo.slice(0, 4)) : reg.tax?.paidUpToYear ?? null;
  const taxCells = [
    docCell("tax_receipt", docs, tax ? `₹${numOrNull(tax.dues) ?? 0}${paidUpTo ? ` · ${paidUpTo}` : ""}` : null, () => ((numOrNull(tax?.dues) ?? 0) > 0 ? "bad" : "ok")),
    cell("registry", reg.tax ? `₹${reg.tax.duesAmount}` : null, reg.tax ? (reg.tax.duesAmount > 0 ? "bad" : "ok") : "absent"),
  ];
  rows.push(row("tax", taxCells));
  if (dues > 0) {
    add({ code: "TAX_DUES", severity: "blocker", ta: `சொத்து வரி நிலுவை ₹${dues.toLocaleString("en-IN")}${paidUpTo ? `; ${paidUpTo} வரை மட்டுமே செலுத்தப்பட்டுள்ளது` : ""}`, en: `Property tax due ₹${dues.toLocaleString("en-IN")}${paidUpTo ? `; paid only up to ${paidUpTo}` : ""}`, source: "வரித்துறை", refs: ["tax_receipt", "registry"] });
  } else if (paidFy !== null && paidFy < input.fyStart - 1) {
    add({ code: "TAX_OUTDATED", severity: "warning", ta: `வரி ரசீது பழையது (${paidUpTo})`, en: `Tax receipt is old (${paidUpTo})`, refs: ["tax_receipt"] });
  }

  // ---- encumbrance: an un-released mortgage or a court attachment blocks transfer
  const mortgages = ecEntries.filter((e) => e.nature === "mortgage");
  const released = ecEntries.filter((e) => e.nature === "release").length;
  const openMortgage = mortgages.length > released ? mortgages[mortgages.length - 1] : null;
  const ecCourt = ecEntries.find((e) => e.nature === "court_attachment");
  const regMortgage = reg.encumbrances.find((e) => e.kind === "mortgage");
  const regCourt = reg.encumbrances.find((e) => e.kind === "litigation");
  const encCells = [
    docCell("ec", docs, ec ? (openMortgage ? `அடமானம் ${openMortgage.docNo ?? ""}` : ecCourt ? "நீதிமன்ற ஜப்தி" : "இல்லை") : null, () => (openMortgage || ecCourt ? "bad" : "ok")),
    cell("registry", regMortgage ? "அடமானம்" : regCourt ? "வழக்கு" : "இல்லை", regMortgage || regCourt ? "bad" : "ok"),
  ];
  rows.push(row("encumbrance", encCells));
  if (ecCourt || regCourt) {
    add({ code: "ENCUMBRANCE_LITIGATION", severity: "blocker", ta: `நீதிமன்ற வழக்கு / ஜப்தி நிலுவையில் — ${regCourt?.detail ?? ecCourt?.detail ?? ""}`, en: `Court case / attachment pending — ${regCourt?.detail ?? ecCourt?.detail ?? ""}`, source: "பதிவுத்துறை", refs: ["ec", "registry"] });
  } else if (openMortgage || regMortgage) {
    // The EC is read in Tamil; the English line is rebuilt from the structured parts (amount, document no., date).
    const amount = (openMortgage?.detail ?? regMortgage?.detail ?? "").match(/₹\s?[\d,]+/)?.[0];
    const ta = openMortgage ? `${openMortgage.detail ?? ""} (ஆவண எண் ${openMortgage.docNo ?? "—"}, ${openMortgage.date ?? ""})` : regMortgage!.detail;
    const en = openMortgage ? `${amount ? `${amount}, ` : ""}document ${openMortgage.docNo ?? "—"}, ${openMortgage.date ?? ""}` : (amount ?? "see EC");
    add({ code: "ENCUMBRANCE_MORTGAGE", severity: "blocker", ta: `அடமானம் விடுவிக்கப்படவில்லை — ${ta}`, en: `Mortgage not released — ${en}`, source: "பதிவுத்துறை", refs: ["ec", "registry"] });
  }

  if (!f.length) add({ code: "ALL_CLEAR", severity: "ok", ta: "அனைத்து ஆவணங்களும் அரசுப் பதிவுகளும் விண்ணப்பத்துடன் பொருந்துகின்றன", en: "All documents and government records match the application" });
  return { rows, ...summarise(f) };
}

// ---------------- helpers ----------------

function cell(source: Source, value: string | null, status: CellStatus): Cell {
  return { source, value, status: value === null ? "absent" : status };
}
function docCell(source: Source, docs: CaseInput["docs"], value: string | null, judge: (v: string) => CellStatus): Cell {
  if (!docs[source as DocKind]) return { source, value: null, status: "absent" };
  return value === null ? { source, value: null, status: "absent" } : { source, value, status: judge(value) };
}
function row(fact: FactKey, cells: Cell[]): FactRow {
  return { fact, cells, status: worst(cells) };
}

/**
 * One finding per kind of disagreement:
 *  - the application differs from the record -> the citizen typed it wrong (return to correct)
 *  - a citizen document differs from the record -> the copy doesn't match the official record
 */
function mismatchFindings(cells: Cell[], code: string, ta: string, en: string, ref: string, add: (f: Finding) => void, unitTa = "", unitEn = "") {
  const app = cells.find((c) => c.source === "application");
  if (app && (app.status === "bad" || app.status === "near")) {
    // Name only the places that actually agree with the record: a doctored copy may agree with the application.
    const agree = cells.filter((c) => c.status === "ok" && c.source !== "application" && c.source !== "registry").map((c) => c.source);
    const allDocs = !cells.some((c) => c.source !== "application" && c.source !== "registry" && c.status === "bad");
    const whoTa = allDocs ? "ஆவணங்களிலும் அரசுப் பதிவிலும்" : [...agree.map((s) => `${SOURCE_LABEL[s].ta}-இலும்`), "அரசுப் பதிவிலும்"].join(" ");
    const whoEn = allDocs ? "documents and government record say" : `${[...agree.map((s) => SOURCE_LABEL[s].en.replace(/^[A-Z](?=[a-z])/, (x) => x.toLowerCase())), "government record"].join(", ").replace(/, ([^,]*)$/, " and $1")} say`;
    add({
      code: `APP_${code}_MISMATCH`, severity: app.status === "bad" ? "blocker" : "warning",
      ta: `விண்ணப்பத்தில் ${ta} ${app.value}${unitTa}; ${whoTa} ${ref}${unitTa}`,
      en: `Application says ${en} ${app.value}${unitEn}; ${whoEn} ${ref}${unitEn}`,
      refs: ["application", ...agree, "registry"],
    });
  }
  for (const c of cells.filter((c) => c.source !== "application" && c.source !== "registry" && c.status === "bad")) {
    add({
      code: "DOC_RECORD_MISMATCH", severity: "blocker",
      ta: `${SOURCE_LABEL[c.source].ta}-இல் ${ta} ${c.value}${unitTa}; அரசுப் பதிவில் ${ref}${unitTa} — நகல் அசலுடன் பொருந்தவில்லை`,
      en: `${SOURCE_LABEL[c.source].en} shows ${en} ${c.value}${unitEn}, government record ${ref}${unitEn} — the copy doesn't match the original`,
      refs: [c.source, "registry"],
    });
  }
}

function nameFindings(cells: Cell[], role: "seller" | "buyer", ta: string, ref: string, add: (f: Finding) => void) {
  const R = role.toUpperCase();
  for (const c of cells) {
    if (c.source === "registry" || c.status === "ok" || c.status === "absent" || !c.value) continue;
    const cross = isTamil(ref) !== isTamil(c.value);
    if (cross) {
      add({ code: `${R}_SCRIPT_CHECK`, severity: "warning", ta: `${SOURCE_LABEL[c.source].ta}-இல் ${ta} பெயர் ஆங்கில எழுத்தில் "${c.value}" — "${ref}" உடன் நேரில் ஒப்பிடவும்`, en: `${SOURCE_LABEL[c.source].en} has the ${role} name in English letters ("${c.value}") — confirm by eye against "${ref}"`, refs: [c.source] });
    } else if (c.source === "application") {
      add({ code: `APP_${R}_${c.status === "bad" ? "MISMATCH" : "SPELLING"}`, severity: c.status === "bad" ? "blocker" : "warning", ta: `விண்ணப்பத்தில் ${ta} "${c.value}"; ஆவணங்களிலும் அரசுப் பதிவிலும் "${ref}"`, en: `Application says ${role} "${c.value}"; documents and government record say "${ref}"`, refs: ["application", "sale_deed", ...(role === "buyer" ? ["id_proof"] : []), "registry"] });
    } else {
      add({ code: c.status === "bad" ? "DOC_RECORD_MISMATCH" : `${R}_SPELLING`, severity: c.status === "bad" ? "blocker" : "warning", ta: `${SOURCE_LABEL[c.source].ta}-இல் ${ta} "${c.value}"; அரசுப் பதிவில் "${ref}"`, en: `${SOURCE_LABEL[c.source].en} shows ${role} "${c.value}", government record "${ref}"`, refs: [c.source, "registry"] });
    }
  }
}
