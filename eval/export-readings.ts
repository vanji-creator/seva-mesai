/**
 * Turns cached eval results into ready-made deed readings for the seed, so a fresh
 * install shows the three-way check without spending API calls.
 *   npx tsx eval/export-readings.ts
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { checkedConfidences, type DeedReading } from "@/lib/docs/deed";

// Which rendered variant each seeded application "received" from the citizen.
const PICK: Record<string, string> = { "PT-2026-0104": "phone_photo.jpg", "PT-2026-0103": "handwritten_form.png" };

const out: Record<string, DeedReading> = {};
for (const [ref, file] of Object.entries(PICK)) {
  const data = readFileSync(path.resolve(__dirname, "docs", ref, file));
  const hash = createHash("sha1").update(data).digest("hex").slice(0, 16);
  const ex = path.resolve(__dirname, "cache", `${hash}.extract.json`);
  const cl = path.resolve(__dirname, "cache", `${hash}.classify.json`);
  if (!existsSync(ex) || !existsSync(cl)) {
    console.warn("no cached run for", ref, file, "- run npm run eval first");
    continue;
  }
  const e = JSON.parse(readFileSync(ex, "utf8")).value;
  const c = JSON.parse(readFileSync(cl, "utf8")).value;
  const r = e.result;
  const conf = checkedConfidences(e.annotations);
  const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(String(v).replace(/[^\d.]/g, "")));
  out[ref] = {
    docType: c.type,
    classifyConfidence: c.confidence,
    reviewRequired: c.review_required,
    values: {
      deedNo: r.deed_no ?? null,
      seller: r.seller ?? null,
      buyer: r.buyer ?? null,
      surveyNo: r.survey_no ? String(r.survey_no).replace(/\s+/g, "") : null,
      extentCents: num(r.extent_cents),
      registrationDate: r.registration_date ?? null,
      saleAmount: num(r.sale_amount_inr),
    },
    minConfidence: conf.length ? Math.min(...conf) : null,
    fileName: `${ref}_${file}`,
    readAt: new Date().toISOString(),
  };
}
writeFileSync(path.resolve(__dirname, "../src/db/seed-readings.json"), JSON.stringify(out, null, 2) + "\n");
console.log("wrote readings for", Object.keys(out).join(", ") || "none");
