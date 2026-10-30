import { readFile } from "node:fs/promises";
import path from "node:path";
import clsx from "clsx";
import { formatDateTime, getT, type MessageKey } from "@/lib/i18n";

interface Summary {
  variant: string;
  pipeline: string;
  n: number;
  fieldAcc: number;
  decisionAcc: number;
  perField: Record<string, number>;
  latencyMs: number;
  costInr: number;
  errors: number;
}
interface Results {
  generatedAt: string;
  variants: { id: string; label: string; labelTa: string; file: string | null }[];
  summary: Summary[];
  classify: { file: string; expected: string; got: string | null; confidence: number | null; correct: boolean }[];
}

const PIPELINES = ["extract", "extract_translit", "extract_phonetic", "parse_llm", "parse_regex"] as const;
const FIELDS = ["deedNo", "seller", "buyer", "surveyNo", "extentCents", "registrationDate", "saleAmount"] as const;
const FIELD_LABEL: Record<(typeof FIELDS)[number], MessageKey> = {
  deedNo: "field.deedNo", seller: "field.seller2", buyer: "field.buyer2", surveyNo: "field.surveyNo",
  extentCents: "field.extentCents", registrationDate: "field.registrationDate", saleAmount: "field.saleAmount",
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const tone = (x: number) => (x >= 0.99 ? "bg-emerald-50 text-ok border-emerald-200" : x >= 0.5 ? "bg-amber-50 text-attention border-amber-200" : "bg-red-50 text-urgent border-red-200");

async function load(): Promise<Results | null> {
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "eval/results.json"), "utf8"));
  } catch {
    return null;
  }
}

export default async function EvalsPage() {
  const { t, locale } = await getT();
  const r = await load();
  if (!r) return <p className="rounded-xl border border-line bg-card p-8">{t("evals.none")}</p>;
  const cell = (variant: string, pipeline: string) => r.summary.find((s) => s.variant === variant && s.pipeline === pipeline);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{t("evals.title")}</h1>
        <p className="max-w-3xl text-muted">{t("evals.intro")}</p>
        <p className="text-sm text-muted">{t("evals.decision")}: {t("evals.decisionHelp")}. {t("evals.sample")}</p>
      </header>

      <section className="overflow-x-auto rounded-xl border border-line bg-card">
        <table className="w-full min-w-[820px] text-left">
          <thead className="bg-bg text-sm text-muted">
            <tr>
              <th className="px-4 py-3">{t("evals.variant")}</th>
              {PIPELINES.map((p) => <th key={p} className="px-3 py-3">{t(`pipe.${p}`)}</th>)}
            </tr>
          </thead>
          <tbody>
            {r.variants.map((v) => {
              const ceiling = cell(v.id, "none");
              return (
                <tr key={v.id} className="border-t border-line align-top">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {v.file && v.file !== "pdf" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <a href={`/eval-samples/${v.id}.${v.file}`} target="_blank"><img src={`/eval-samples/${v.id}.${v.file}`} alt="" className="h-16 w-12 rounded border border-line object-cover object-top" /></a>
                      ) : (
                        <span className="flex h-16 w-12 items-center justify-center rounded border border-line text-xs text-muted">
                          {v.file === "pdf" ? <a href="/eval-samples/pdf_typed.pdf" target="_blank">PDF</a> : "⌨"}
                        </span>
                      )}
                      <span className="font-medium">{locale === "ta" ? v.labelTa : v.label}</span>
                    </div>
                  </td>
                  {ceiling ? (
                    <td colSpan={PIPELINES.length} className="px-3 py-3">
                      <span className={clsx("inline-block rounded-lg border px-3 py-1 font-bold", tone(ceiling.decisionAcc))}>
                        {pct(ceiling.decisionAcc)} · {t("evals.ceiling")}
                      </span>
                      <span className="ml-3 text-sm text-muted">{t("pipe.none")}</span>
                    </td>
                  ) : (
                    PIPELINES.map((p) => {
                      const s = cell(v.id, p);
                      if (!s) return <td key={p} className="px-3 py-3 text-muted">—</td>;
                      return (
                        <td key={p} className="px-3 py-3">
                          <div className={clsx("rounded-lg border px-3 py-1.5", tone(s.decisionAcc))}>
                            <div className="text-lg font-bold">{pct(s.decisionAcc)}</div>
                            <div className="text-xs">{t("evals.field")} {pct(s.fieldAcc)}</div>
                          </div>
                          <div className="mt-1 text-xs text-muted">
                            {(s.latencyMs / 1000).toFixed(1)}s · ₹{s.costInr}{s.errors ? ` · ${s.errors} err` : ""}
                          </div>
                        </td>
                      );
                    })
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-bold">{t("evals.perField")}</h2>
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-bg text-muted">
              <tr>
                <th className="px-4 py-2">{t("evals.variant")}</th>
                {FIELDS.map((f) => <th key={f} className="px-3 py-2">{t(FIELD_LABEL[f])}</th>)}
              </tr>
            </thead>
            <tbody>
              {r.variants.filter((v) => v.file).map((v) => {
                const s = cell(v.id, "extract");
                return (
                  <tr key={v.id} className="border-t border-line">
                    <td className="px-4 py-2">{locale === "ta" ? v.labelTa : v.label}</td>
                    {FIELDS.map((f) => (
                      <td key={f} className="px-3 py-2">
                        {s ? <span className={clsx("rounded px-2 py-0.5", tone(s.perField[f]))}>{pct(s.perField[f])}</span> : "—"}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-bold">{t("evals.classify")}</h2>
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-bg text-muted">
              <tr>
                <th className="px-4 py-2">{t("evals.variant")}</th>
                <th className="px-3 py-2">{t("evals.expected")}</th>
                <th className="px-3 py-2">{t("evals.got")}</th>
                <th className="px-3 py-2">{t("evals.confidence")}</th>
              </tr>
            </thead>
            <tbody>
              {r.classify.map((c) => (
                <tr key={c.file} className="border-t border-line">
                  <td className="px-4 py-2 font-mono text-xs">{c.file}</td>
                  <td className="px-3 py-2">{c.expected}</td>
                  <td className={clsx("px-3 py-2 font-semibold", c.correct ? "text-ok" : "text-urgent")}>{c.correct ? "✓ " : "✕ "}{c.got ?? "—"}</td>
                  <td className="px-3 py-2">{c.confidence ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-muted">{formatDateTime(r.generatedAt, locale)}</p>
    </div>
  );
}
