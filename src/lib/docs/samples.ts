import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { VARIANTS } from "../../../eval/cases";

const DOCS = path.join(process.cwd(), "eval/docs");
const MIME: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg" };

/** Wrong uploads anyone can try, to see the Classify gate stop them before extraction. */
const WRONG = [
  { id: "wrong_ration_card", label: "Wrong document: ration card", labelTa: "தவறான ஆவணம்: குடும்ப அட்டை" },
  { id: "wrong_tax_receipt", label: "Wrong document: tax receipt", labelTa: "தவறான ஆவணம்: வரி ரசீது" },
];

/** Fictional eval documents for this application (lets reviewers try the reader without their own files). */
export function samplesFor(refNo: string) {
  const own = VARIANTS.filter((v) => v.file && existsSync(path.join(DOCS, refNo, `${v.id}.${v.file}`))).map((v) => ({
    id: v.id,
    label: v.label,
    labelTa: v.labelTa,
  }));
  return [...own, ...WRONG.filter((w) => existsSync(path.join(DOCS, "_wrong", `${w.id}.png`)))];
}

export function loadSample(refNo: string, sampleId: string) {
  if (!/^[A-Z]{2}-\d{4}-\d{4}$/.test(refNo)) return null;
  const wrong = WRONG.find((w) => w.id === sampleId);
  const v = VARIANTS.find((x) => x.id === sampleId && x.file);
  const file = wrong ? path.join(DOCS, "_wrong", `${wrong.id}.png`) : v ? path.join(DOCS, refNo, `${v.id}.${v.file}`) : null;
  if (!file || !existsSync(file)) return null;
  const ext = path.extname(file).slice(1);
  return { name: `${refNo}_${sampleId}.${ext}`, mime: MIME[ext], data: new Uint8Array(readFileSync(file)) };
}
