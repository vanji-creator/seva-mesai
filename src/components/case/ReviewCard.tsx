"use client";
import { useState, useTransition } from "react";
import clsx from "clsx";
import { recheckAction } from "@/app/actions";
import type { Suggestion } from "@/lib/types";

const TONE: Record<Suggestion, string> = {
  approve: "text-green",
  return: "text-amber",
  reject: "text-red",
};

// The model cites finding codes so its reasons can be checked against the findings; the officer doesn't need them.
const withoutCodes = (s: string) => s.replace(/\s*\((?:[A-Z][A-Z0-9_]{2,}(?:,\s*)?)+\)/g, "").trim();

/**
 * The AI's review, already run at intake. The officer reads it; "Re-check" re-runs the
 * checks and the review (both languages) only when they want it.
 */
export function ReviewCard({
  applicationId, review, labels,
}: {
  applicationId: number;
  review: { summary: string; suggestion: Suggestion; suggestionLabel: string; reasons: string[]; draftReply: string | null; source: "llm" | "rules"; when: string; model: string | null } | null;
  labels: Record<"title" | "note" | "recheck" | "rechecking" | "ran" | "offline" | "notRun" | "run" | "reasons" | "draft", string>;
}) {
  const [pending, start] = useTransition();
  const [showDraft, setShowDraft] = useState(false);
  const recheck = () => start(() => recheckAction(applicationId));

  return (
    <section className="rounded-2xl border border-line p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[13px] text-muted">{labels.title}</div>
          {review ? (
            <div className={clsx("mt-1 text-[28px] font-semibold tracking-tight", TONE[review.suggestion])}>{review.suggestionLabel}</div>
          ) : (
            <div className="mt-1 text-xl font-semibold text-muted">{labels.notRun}</div>
          )}
        </div>
        <button
          onClick={recheck}
          disabled={pending}
          className="shrink-0 rounded-full border border-line-strong px-3.5 py-1.5 text-[13px] font-medium transition hover:bg-black/[0.03] disabled:opacity-50"
        >
          {pending ? labels.rechecking : review ? labels.recheck : labels.run}
        </button>
      </div>

      {review && (
        <>
          <p className="mt-3 max-w-[70ch] text-[15.5px] leading-relaxed">{review.summary}</p>
          {review.reasons.length > 0 && (
            <ul className="mt-4 space-y-1.5 text-[15px]">
              {review.reasons.map((r, i) => (
                <li key={i} className="flex gap-2.5"><span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-faint" />{withoutCodes(r)}</li>
              ))}
            </ul>
          )}
          {review.draftReply && (
            <div className="mt-4">
              <button onClick={() => setShowDraft((v) => !v)} className="text-[13px] font-medium text-accent">
                {labels.draft} {showDraft ? "−" : "+"}
              </button>
              {showDraft && <p className="mt-2 rounded-xl bg-side p-4 text-[15px] leading-relaxed">{review.draftReply}</p>}
            </div>
          )}
          <div className="mt-4 text-xs text-faint">
            {labels.note} · {review.source === "rules" ? labels.offline : `${labels.ran.replace("{when}", review.when)} · ${review.model ?? ""} · Sarvam Vision`}
          </div>
        </>
      )}
    </section>
  );
}
