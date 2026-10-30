import clsx from "clsx";
import { FACT_LABEL, SOURCE_LABEL, type FactRow, type Source } from "@/lib/verify/caseCheck";
import type { Locale } from "@/lib/types";

// The government record is the reference, so it comes first; then what the citizen typed, then their documents.
const ORDER: Source[] = ["registry", "application", "sale_deed", "patta", "ec", "tax_receipt", "id_proof"];

// Encumbrance cells are written in Tamil by the check; translate the few fixed words for English.
const ENC_EN: [string, string][] = [["நீதிமன்ற ஜப்தி", "Court attachment"], ["அடமானம்", "Mortgage"], ["வழக்கு", "Court case"], ["இல்லை", "None"]];
const encEn = (v: string) => ENC_EN.reduce((s, [ta, en]) => s.replace(ta, en), v);

/**
 * Every fact across every place it appears. Only columns that have at least one value are shown,
 * and agreement is shown by quiet text, disagreement by colour — so the eye lands on problems.
 */
export function FactTable({ rows, locale, title, note }: { rows: FactRow[]; locale: Locale; title: string; note: string }) {
  const cols = ORDER.filter((s) => rows.some((r) => r.cells.some((c) => c.source === s && c.value !== null)));
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[17px] font-semibold">{title}</h2>
        <span className="text-xs text-faint">{note}</span>
      </div>
      <div className="pane overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[640px] text-left text-[14px]">
          <thead>
            <tr className="text-[12px] text-faint">
              <th className="w-[120px] px-4 py-2.5 font-normal" />
              {cols.map((s) => (
                <th key={s} className={clsx("px-3 py-2.5 font-normal", s === "registry" && "bg-side/70")}>{SOURCE_LABEL[s][locale]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.fact} className={clsx("border-t border-line", r.status === "bad" && "bg-red-soft/60", r.status === "near" && "bg-amber-soft/60")}>
                <td className="px-4 py-2.5 text-muted">{FACT_LABEL[r.fact][locale]}</td>
                {cols.map((s) => {
                  const c = r.cells.find((x) => x.source === s);
                  return (
                    <td key={s} className={clsx("px-3 py-2.5", s === "registry" && "bg-side/70")}>
                      {!c || c.value === null ? (
                        <span className="text-line-strong">—</span>
                      ) : (
                        <span className={clsx(c.status === "bad" && "font-semibold text-red", c.status === "near" && "font-medium text-amber", c.status === "ok" && "text-fg")}>
                          {r.fact === "extent" ? `${c.value} ${locale === "ta" ? "சென்ட்" : "cents"}` : r.fact === "encumbrance" && locale === "en" ? encEn(c.value) : c.value}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
