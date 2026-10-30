import { PATTA_REQUIRED_DOCS, type Finding } from "@/lib/types";
import { similarity } from "./fuzzy";
import type { PattaInput, VerifyResult } from "./types";

const DOC_LABEL: Record<string, { ta: string; en: string }> = {
  application_form: { ta: "விண்ணப்பப் படிவம்", en: "application form" },
  sale_deed: { ta: "கிரையப் பத்திரம்", en: "sale deed" },
  tax_receipt: { ta: "சொத்து வரி ரசீது", en: "tax receipt" },
  ec: { ta: "வில்லங்கச் சான்று", en: "encumbrance certificate" },
  id_proof: { ta: "அடையாளச் சான்று", en: "ID proof" },
};

/** Codes where the law, not paperwork, blocks the transfer -> suggest reject. */
const REJECT_CODES = new Set(["DEED_NOT_FOUND", "SELLER_NOT_OWNER", "ENCUMBRANCE_LITIGATION"]);

const SAME = 0.9; // >= : same name, ignore
const SPELLING = 0.65; // >= : probably same person, spelling differs
const EXTENT_TOLERANCE = 0.02; // 2% rounding tolerance

export function verifyPatta({ payload, presentDocs, evidence, currentYear }: PattaInput): VerifyResult {
  const f: Finding[] = [];
  const add = (x: Finding) => f.push(x);

  for (const kind of PATTA_REQUIRED_DOCS) {
    if (!presentDocs.includes(kind)) {
      const l = DOC_LABEL[kind];
      add({
        code: `DOC_MISSING_${kind.toUpperCase()}`,
        severity: "blocker",
        ta: `${l.ta} இணைக்கப்படவில்லை`,
        en: `${l.en} is not attached`,
      });
    }
  }

  const { deed, land, tax, encumbrances } = evidence;

  if (!deed) {
    add({
      code: "DEED_NOT_FOUND",
      severity: "blocker",
      ta: `பத்திர எண் ${payload.saleDeedNo} பதிவுத்துறையில் இல்லை`,
      en: `Deed ${payload.saleDeedNo} not found in Registration records`,
      source: "பதிவுத்துறை",
    });
  } else {
    if (deed.surveyNo !== payload.surveyNo) {
      add({
        code: "DEED_SURVEY_MISMATCH",
        severity: "blocker",
        ta: `பத்திரத்தில் சர்வே எண் ${deed.surveyNo}; விண்ணப்பத்தில் ${payload.surveyNo}`,
        en: `Deed survey no. ${deed.surveyNo} differs from application ${payload.surveyNo}`,
        source: "பதிவுத்துறை",
      });
    }
    for (const [role, applied, registered] of [
      ["buyer", payload.buyer, deed.buyer],
      ["seller", payload.seller, deed.seller],
    ] as const) {
      const s = similarity(applied, registered);
      const roleTa = role === "buyer" ? "வாங்குபவர்" : "விற்பவர்";
      if (s < SPELLING) {
        add({
          code: `${role.toUpperCase()}_NAME_MISMATCH`,
          severity: "blocker",
          ta: `${roleTa} பெயர் வேறுபடுகிறது: விண்ணப்பம் "${applied}", பத்திரம் "${registered}"`,
          en: `${role} name differs: application "${applied}" vs deed "${registered}"`,
          source: "பதிவுத்துறை",
        });
      } else if (s < SAME) {
        add({
          code: `${role.toUpperCase()}_NAME_SPELLING`,
          severity: "warning",
          ta: `${roleTa} பெயர் எழுத்துப்பிழை இருக்கலாம்: "${applied}" / "${registered}"`,
          en: `${role} name spelling differs: "${applied}" / "${registered}"`,
          source: "பதிவுத்துறை",
        });
      }
    }
    const diff = Math.abs(deed.extentCents - payload.extentCents) / deed.extentCents;
    if (diff > EXTENT_TOLERANCE) {
      add({
        code: "EXTENT_MISMATCH",
        severity: diff > 0.1 ? "blocker" : "warning",
        ta: `பரப்பளவு வேறுபாடு: பத்திரம் ${deed.extentCents} சென்ட், விண்ணப்பம் ${payload.extentCents} சென்ட்`,
        en: `Extent differs: deed ${deed.extentCents} cents vs application ${payload.extentCents} cents`,
        source: "பதிவுத்துறை",
      });
    }
  }

  if (!land) {
    add({
      code: "LAND_RECORD_NOT_FOUND",
      severity: "blocker",
      ta: `சர்வே எண் ${payload.surveyNo} நில ஆவணத்தில் இல்லை`,
      en: `Survey ${payload.surveyNo} not found in land records`,
      source: "வருவாய்த்துறை",
    });
  } else if (similarity(land.currentOwner, payload.seller) < SPELLING) {
    add({
      code: "SELLER_NOT_OWNER",
      severity: "blocker",
      ta: `தற்போதைய பட்டாதாரர் "${land.currentOwner}"; விற்பவர் "${payload.seller}"`,
      en: `Current patta holder is "${land.currentOwner}", not seller "${payload.seller}"`,
      source: "வருவாய்த்துறை",
    });
  }

  if (!tax) {
    add({
      code: "TAX_NOT_FOUND",
      severity: "warning",
      ta: `ரசீது ${payload.taxReceiptNo} வரித்துறையில் கிடைக்கவில்லை`,
      en: `Receipt ${payload.taxReceiptNo} not found in tax records`,
      source: "வரித்துறை",
    });
  } else if (tax.duesAmount > 0 || tax.paidUpToYear < currentYear - 1) {
    add({
      code: "TAX_DUES",
      severity: "blocker",
      ta: `வரி நிலுவை ₹${tax.duesAmount}; ${tax.paidUpToYear} வரை மட்டுமே செலுத்தப்பட்டுள்ளது`,
      en: `Tax dues ₹${tax.duesAmount}; paid only up to ${tax.paidUpToYear}`,
      source: "வரித்துறை",
    });
  }

  for (const e of encumbrances) {
    if (e.kind === "mortgage") {
      add({
        code: "ENCUMBRANCE_MORTGAGE",
        severity: "blocker",
        ta: `வில்லங்கம்: அடமானம் – ${e.detail}`,
        en: `Encumbrance: mortgage – ${e.detail}`,
        source: "பதிவுத்துறை",
      });
    } else if (e.kind === "litigation") {
      add({
        code: "ENCUMBRANCE_LITIGATION",
        severity: "blocker",
        ta: `வில்லங்கம்: வழக்கு நிலுவை – ${e.detail}`,
        en: `Encumbrance: pending litigation – ${e.detail}`,
        source: "பதிவுத்துறை",
      });
    }
  }

  if (!f.length) {
    add({
      code: "ALL_CLEAR",
      severity: "ok",
      ta: "அனைத்து சரிபார்ப்புகளும் சரியாக உள்ளன",
      en: "All cross-checks passed",
    });
  }

  return summarise(f);
}

/** One rule for turning findings into a suggestion, shared by registry and uploaded-document checks. */
export function summarise(findings: Finding[]): VerifyResult {
  const real = findings.some((x) => x.severity !== "ok") ? findings.filter((x) => x.severity !== "ok") : findings;
  const blockers = real.filter((x) => x.severity === "blocker");
  const warnings = real.filter((x) => x.severity === "warning");
  const reasonCodes = [...blockers, ...warnings].map((x) => x.code);
  const suggestion = blockers.some((b) => REJECT_CODES.has(b.code))
    ? "reject"
    : blockers.length || warnings.length
      ? "return"
      : "approve";

  return { findings: real, blockers: blockers.length, warnings: warnings.length, suggestion, reasonCodes };
}
