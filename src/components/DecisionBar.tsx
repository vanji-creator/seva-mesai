"use client";
import { useState, useTransition } from "react";
import clsx from "clsx";
import { decideAction } from "@/app/actions";
import type { Suggestion } from "@/lib/types";

type Action = "approved" | "rejected" | "returned";
const SUG: Record<Action, Suggestion> = { approved: "approve", returned: "return", rejected: "reject" };

/** The officer's decision. The AI's suggestion is labelled, never pre-selected. */
export function DecisionBar({
  applicationId, suggested, labels,
}: {
  applicationId: number;
  suggested: Suggestion | null;
  labels: Record<"yours" | "approve" | "return" | "reject" | "reason" | "required" | "confirm" | "cancel" | "suggested", string>;
}) {
  const [chosen, setChosen] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const options: { action: Action; label: string }[] = [
    { action: "approved", label: labels.approve },
    { action: "returned", label: labels.return },
    { action: "rejected", label: labels.reject },
  ];

  function submit() {
    if (!chosen) return;
    if (chosen !== "approved" && reason.trim().length < 3) return setError(labels.required);
    setError(null);
    start(async () => {
      const r = await decideAction(applicationId, chosen, reason);
      if (r && "error" in r) setError(r.error === "reason" ? labels.required : "—");
    });
  }

  return (
    <div className="sticky bottom-0 border-t border-line bg-white/90 px-6 py-4 backdrop-blur-xl lg:px-10">
      <div className="mx-auto flex max-w-[980px] flex-wrap items-center gap-3">
        <span className="mr-2 text-[13px] text-muted">{labels.yours}</span>
        {options.map((o) => (
          <button
            key={o.action}
            onClick={() => { setChosen(o.action); setError(null); }}
            className={clsx(
              "relative rounded-full px-5 py-2.5 text-[15px] font-medium transition",
              chosen === o.action ? "bg-fg text-white" : "border border-line-strong hover:bg-black/[0.03]",
            )}
          >
            {o.label}
            {suggested === SUG[o.action] && (
              <span className={clsx("ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", chosen === o.action ? "bg-white/20" : "bg-accent-soft text-accent")}>
                AI
              </span>
            )}
          </button>
        ))}
        {chosen && (
          <div className="flex w-full flex-col gap-2 pt-2 sm:flex-row sm:items-start">
            <textarea
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={labels.reason}
              rows={2}
              className="min-w-0 flex-1 rounded-xl border border-line-strong bg-white px-3 py-2 text-[15px] outline-none focus:border-accent"
            />
            <div className="flex gap-2">
              <button disabled={pending} onClick={submit} className="rounded-full bg-accent px-5 py-2.5 text-[15px] font-medium text-white disabled:opacity-50">{labels.confirm}</button>
              <button onClick={() => { setChosen(null); setError(null); }} className="rounded-full px-4 py-2.5 text-[15px] text-muted hover:text-fg">{labels.cancel}</button>
            </div>
          </div>
        )}
        {error && <p role="alert" className="w-full text-[14px] text-red">{error}</p>}
      </div>
    </div>
  );
}
