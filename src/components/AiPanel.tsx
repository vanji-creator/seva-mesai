"use client";
import { useEffect, useRef, useTransition } from "react";
import clsx from "clsx";
import { runAnalysisAction } from "@/app/actions";
import type { Finding, Locale, Suggestion } from "@/lib/types";

export interface AiView {
  summary: string;
  findings: Finding[];
  suggestion: Suggestion;
  reasons: string[];
  draftReply: string | null;
  source: "llm" | "rules";
}

const SEV = {
  blocker: "border-red-200 bg-red-50 text-urgent",
  warning: "border-amber-200 bg-amber-50 text-attention",
  ok: "border-emerald-200 bg-emerald-50 text-ok",
} as const;
const ICON = { blocker: "✕", warning: "!", ok: "✓" } as const;
/** Finding sources are stored in Tamil (the primary language); English labels for the toggle. */
const SOURCE_EN: Record<string, string> = {
  "பதிவுத்துறை": "Registration dept.",
  "வருவாய்த்துறை": "Revenue dept.",
  "வரித்துறை": "Tax dept.",
  "பதிவேற்றிய பத்திரம்": "Uploaded deed",
};

export function AiPanel({
  applicationId, analysis, locale, canRun, labels,
}: {
  applicationId: number;
  analysis: AiView | null;
  locale: Locale;
  canRun: boolean;
  labels: Record<string, string>;
}) {
  const [pending, start] = useTransition();
  const auto = useRef(false);

  // Fewer clicks: analyse on first open instead of asking the officer to find a button.
  useEffect(() => {
    if (!analysis && canRun && !auto.current) {
      auto.current = true;
      start(() => runAnalysisAction(applicationId));
    }
  }, [analysis, canRun, applicationId]);

  return (
    <section aria-live="polite" className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-brand">✦ {labels.title}</h2>
          <p className="text-sm text-muted">{labels.note}</p>
        </div>
        {canRun && (
          <button disabled={pending} onClick={() => start(() => runAnalysisAction(applicationId))} className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-bg disabled:opacity-60">
            {pending ? "…" : analysis ? labels.rerun : labels.run}
          </button>
        )}
      </div>

      {!analysis ? (
        <p className="text-muted">{pending ? "…" : ""}</p>
      ) : (
        <>
          {analysis.source === "rules" && <p className="rounded-lg bg-amber-50 p-3 text-sm text-attention">{labels.offline}</p>}
          <div>
            <h3 className="font-semibold">{labels.summary}</h3>
            <p>{analysis.summary}</p>
          </div>
          <div>
            <h3 className="mb-2 font-semibold">{labels.findings}</h3>
            <ul className="flex flex-col gap-2">
              {analysis.findings.map((f) => (
                <li key={f.code} className={clsx("flex gap-3 rounded-lg border p-3", SEV[f.severity])}>
                  <span aria-hidden className="font-bold">{ICON[f.severity]}</span>
                  <span>
                    <span className="sr-only">{labels[`sev.${f.severity}`]}: </span>
                    <span className="text-fg">{locale === "ta" ? f.ta : f.en}</span>
                    {f.source && <span className="ml-2 text-xs text-muted">({locale === "en" ? SOURCE_EN[f.source] ?? f.source : f.source})</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border-2 border-brand/30 bg-brand/5 p-4">
            <div className="text-sm text-muted">{labels.suggestion}</div>
            <div className="text-xl font-bold text-brand">{labels[`sug.${analysis.suggestion}`]}</div>
            <ul className="mt-2 list-disc pl-5">
              {analysis.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
            <div className="mt-2 text-xs text-muted">{labels[`ai.source.${analysis.source}`]}</div>
          </div>
          {analysis.draftReply && (
            <div>
              <h3 className="font-semibold">{labels.draft}</h3>
              <p className="rounded-lg bg-bg p-3">{analysis.draftReply}</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
