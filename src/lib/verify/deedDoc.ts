import { isTamil, type DeedReading } from "@/lib/docs/deed";
import type { Finding, PattaPayload } from "@/lib/types";
import { romanKey, similarity } from "./fuzzy";
import type { RegistryEvidence } from "./types";

const SAME = 0.9;
const SPELLING = 0.65;
const LOW_CONFIDENCE = 0.8;
const SRC = "பதிவேற்றிய பத்திரம்";
const DOC_TYPE_LABEL: Record<string, { ta: string; en: string }> = {
  ration_card: { ta: "குடும்ப அட்டை", en: "ration card" },
  tax_receipt: { ta: "சொத்து வரி ரசீது", en: "property tax receipt" },
  other: { ta: "வேறு ஆவணம்", en: "different document" },
};

/**
 * Three-way check on the uploaded deed:
 *   uploaded document  vs  what the citizen typed (application)
 *   uploaded document  vs  the registered deed (Registration department)
 * Pure: the reading was done earlier (Sarvam Classify + Extract) and stored.
 */
export function verifyDeedDocument(reading: DeedReading, payload: PattaPayload, registry: RegistryEvidence["deed"]): Finding[] {
  const f: Finding[] = [];

  if (reading.docType !== "sale_deed") {
    const label = DOC_TYPE_LABEL[reading.docType ?? ""] ?? { ta: "அறிய முடியவில்லை", en: reading.docType ?? "unknown" };
    return [{
      code: "DOC_WRONG_TYPE",
      severity: "blocker",
      ta: `பதிவேற்றிய கோப்பு கிரையப் பத்திரம் அல்ல — இது ${label.ta}`,
      en: `Uploaded file is not a sale deed — it looks like a ${label.en}`,
      source: SRC,
    }];
  }
  const v = reading.values!;
  const roman = reading.roman ?? {};
  // Across scripts, compare sound-alike Roman keys (Tamil க = k/g, த = t/d ...): eval showed plain
  // Roman comparison flagged "Govindan" vs transliterated "Kovindan" as a different person.
  const nameSim = (tamilSide: string, onDoc: string | null) => {
    if (!onDoc) return 0;
    if (roman[tamilSide] && !isTamil(onDoc)) return similarity(romanKey(roman[tamilSide]), romanKey(onDoc));
    return similarity(tamilSide, onDoc);
  };

  if (reading.reviewRequired || (reading.minConfidence !== null && reading.minConfidence < LOW_CONFIDENCE)) {
    f.push({
      code: "DOC_LOW_CONFIDENCE",
      severity: "warning",
      ta: "ஆவணம் தெளிவாகப் படிக்கப்படவில்லை — மூல ஆவணத்துடன் சரிபார்க்கவும்",
      en: "The document could not be read confidently — check against the original",
      source: SRC,
    });
  }

  // A Roman-letter name on the deed vs a Tamil name on file: matching is unreliable (eval: 50% decision
  // accuracy even with sound-alike keys; Sarvam transliterates "செல்வம்" as "Sevalam"). So a cross-script
  // difference is never a blocker — it asks the officer to confirm by eye.
  const crossScript = (tamilSide: string, onDoc: string | null) => !!onDoc && isTamil(tamilSide) && !isTamil(onDoc);

  // Document vs application
  for (const [role, applied, onDoc] of [
    ["SELLER", payload.seller, v.seller],
    ["BUYER", payload.buyer, v.buyer],
  ] as const) {
    const s = nameSim(applied, onDoc);
    const roleTa = role === "BUYER" ? "வாங்குபவர்" : "விற்பவர்";
    if (s < SAME && crossScript(applied, onDoc)) {
      f.push({ code: `DOC_${role}_SCRIPT_CHECK`, severity: "warning", ta: `பத்திரத்தில் ${roleTa} பெயர் ஆங்கில எழுத்தில்: "${onDoc}" — விண்ணப்பத்தின் "${applied}" உடன் நேரில் ஒப்பிடவும்`, en: `Deed has the ${role.toLowerCase()} name in English letters ("${onDoc}") — confirm by eye against "${applied}"`, source: SRC });
    } else if (s < SPELLING) {
      f.push({ code: `DOC_${role}_MISMATCH`, severity: "blocker", ta: `பத்திரத்தில் ${roleTa} "${onDoc ?? "—"}"; விண்ணப்பத்தில் "${applied}"`, en: `Deed shows ${role.toLowerCase()} "${onDoc ?? "—"}", application says "${applied}"`, source: SRC });
    } else if (s < SAME) {
      f.push({ code: `DOC_${role}_SPELLING`, severity: "warning", ta: `பத்திரத்தில் ${roleTa} பெயர் எழுத்து வேறுபடுகிறது: "${onDoc}" / "${applied}"`, en: `${role.toLowerCase()} spelled differently: deed "${onDoc}" / application "${applied}"`, source: SRC });
    }
  }
  if (v.surveyNo && v.surveyNo !== payload.surveyNo) {
    f.push({ code: "DOC_SURVEY_MISMATCH", severity: "blocker", ta: `பத்திரத்தில் சர்வே எண் ${v.surveyNo}; விண்ணப்பத்தில் ${payload.surveyNo}`, en: `Deed survey ${v.surveyNo}, application ${payload.surveyNo}`, source: SRC });
  }
  if (v.extentCents !== null && v.extentCents !== payload.extentCents) {
    const big = Math.abs(v.extentCents - payload.extentCents) / v.extentCents > 0.1;
    f.push({ code: "DOC_EXTENT_MISMATCH", severity: big ? "blocker" : "warning", ta: `பத்திரத்தில் ${v.extentCents} சென்ட்; விண்ணப்பத்தில் ${payload.extentCents} சென்ட்`, en: `Deed says ${v.extentCents} cents, application ${payload.extentCents}`, source: SRC });
  }

  // Document vs registered deed: a mismatch here means the paper doesn't match the official record.
  if (registry) {
    const diffs: string[] = [];
    if (v.surveyNo && v.surveyNo !== registry.surveyNo) diffs.push("survey");
    if (v.extentCents !== null && v.extentCents !== registry.extentCents) diffs.push("extent");
    // Cross-script names are already raised as a "confirm by eye" warning above.
    if (v.seller && !crossScript(registry.seller, v.seller) && nameSim(registry.seller, v.seller) < SPELLING) diffs.push("seller");
    if (v.buyer && !crossScript(registry.buyer, v.buyer) && nameSim(registry.buyer, v.buyer) < SPELLING) diffs.push("buyer");
    if (diffs.length) {
      f.push({ code: "DOC_REGISTRY_MISMATCH", severity: "blocker", ta: `பதிவேற்றிய பத்திரம் பதிவுத்துறை பதிவுடன் ஒத்துப்போகவில்லை (${diffs.join(", ")})`, en: `Uploaded deed does not match the registered deed (${diffs.join(", ")})`, source: SRC });
    }
  }
  if (payload.saleDeedNo && v.deedNo && v.deedNo.replace(/\s+/g, "") !== payload.saleDeedNo) {
    f.push({ code: "DOC_DEEDNO_MISMATCH", severity: "warning", ta: `பத்திர எண் வேறுபடுகிறது: ${v.deedNo} / ${payload.saleDeedNo}`, en: `Deed number differs: ${v.deedNo} / ${payload.saleDeedNo}`, source: SRC });
  }

  if (!f.length) {
    f.push({ code: "DOC_VERIFIED", severity: "ok", ta: "பதிவேற்றிய பத்திரம் விண்ணப்பம் மற்றும் பதிவுத்துறை பதிவுடன் பொருந்துகிறது", en: "Uploaded deed matches the application and the registered record", source: SRC });
  }
  return f;
}
