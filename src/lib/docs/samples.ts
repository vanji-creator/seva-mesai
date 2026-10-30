import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "public/case-docs");
const MIME: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg" };

/**
 * Demo files an officer can "receive" without having their own: the document a citizen brought
 * later for a case (public/case-docs/<ref>/_later/), and a wrong document anyone might hand in.
 */
interface Sample { id: string; label: string; labelTa: string; file: string }

const WRONG: Sample = { id: "ration_card", label: "Wrong document: ration card", labelTa: "தவறான ஆவணம்: குடும்ப அட்டை", file: "_samples/ration_card.png" };
const LATER: Record<string, { label: string; labelTa: string }> = {
  ec: { label: "Encumbrance certificate (brought later)", labelTa: "வில்லங்கச் சான்றிதழ் (பின்னர் கொண்டுவந்தது)" },
};

export function samplesFor(refNo: string): Omit<Sample, "file">[] {
  const later = Object.entries(LATER)
    .map(([kind, l]) => ({ id: `later:${kind}`, ...l, file: `${refNo}/_later/${kind}.pdf` }))
    .filter((s) => existsSync(path.join(ROOT, s.file)));
  return [...later, WRONG].filter((s) => existsSync(path.join(ROOT, s.file))).map(({ id, label, labelTa }) => ({ id, label, labelTa }));
}

export function loadSample(refNo: string, sampleId: string) {
  if (!/^[A-Z]{2}-\d{4}-\d{4}$/.test(refNo)) return null;
  const rel = sampleId === WRONG.id ? WRONG.file : sampleId.startsWith("later:") && LATER[sampleId.slice(6)] ? `${refNo}/_later/${sampleId.slice(6)}.pdf` : null;
  if (!rel || !existsSync(path.join(ROOT, rel))) return null;
  const ext = path.extname(rel).slice(1);
  return { name: path.basename(rel), mime: MIME[ext], data: new Uint8Array(readFileSync(path.join(ROOT, rel))) };
}
