"use client";
import { useState, useTransition } from "react";
import clsx from "clsx";
import { decideAction, reopenAction } from "@/app/actions";
import type { Suggestion } from "@/lib/types";

type Action = "approved" | "rejected" | "returned";
const SUG: Record<Action, Suggestion> = { approved: "approve", returned: "return", rejected: "reject" };

// Light tint at rest, deeper on hover, deeper still while pressed; solid once chosen — so every click is visible.
const TONE: Record<Action, { idle: string; chosen: string; tag: string }> = {
  approved: { idle: "bg-green-soft text-green hover:bg-green/15 active:bg-green/25", chosen: "bg-green text-white", tag: "bg-green/15" },
  returned: { idle: "bg-amber-soft text-amber hover:bg-amber/15 active:bg-amber/25", chosen: "bg-amber text-white", tag: "bg-amber/15" },
  rejected: { idle: "bg-red-soft text-red hover:bg-red/15 active:bg-red/25", chosen: "bg-red text-white", tag: "bg-red/15" },
};

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="sticky bottom-0 border-t border-line bg-white/90 px-6 py-4 backdrop-blur-xl lg:px-10">
    <div className="mx-auto flex max-w-[980px] flex-wrap items-center gap-3">{children}</div>
  </div>
);

/**
 * The officer's decision. The AI's suggestion is labelled, never pre-selected. Remarks are optional to
 * approve and required to return or reject; the AI's draft reply can be dropped in with one click and edited.
 */
export function DecisionBar({
  applicationId, suggested, draftReply, labels,
}: {
  applicationId: number;
  suggested: Suggestion | null;
  draftReply: string | null;
  labels: Record<"yours" | "approve" | "return" | "reject" | "remarksOptional" | "remarksRequired" | "required" | "confirm" | "cancel" | "aiDraft" | "useDraft" | "ownWords", string>;
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
  const needsReason = chosen !== null && chosen !== "approved";
  // The draft was written for the AI's suggestion; offering it under a different decision would mislead.
  const offerDraft = chosen && draftReply && suggested === SUG[chosen] && reason.trim() !== draftReply.trim();

  function submit() {
    if (!chosen) return;
    if (needsReason && reason.trim().length < 3) return setError(labels.required);
    setError(null);
    start(async () => {
      const r = await decideAction(applicationId, chosen, reason);
      if (r && "error" in r) setError(r.error === "reason" ? labels.required : "—");
    });
  }

  return (
    <Shell>
      <span className="mr-2 text-[13px] text-muted">{labels.yours}</span>
      {options.map((o) => (
        <button
          key={o.action}
          onClick={() => { setChosen(o.action); setError(null); }}
          aria-pressed={chosen === o.action}
          className={clsx(
            "relative rounded-full px-5 py-2.5 text-[15px] font-medium transition active:scale-[0.97]",
            chosen === o.action ? TONE[o.action].chosen : TONE[o.action].idle,
          )}
        >
          {o.label}
          {suggested === SUG[o.action] && (
            <span className={clsx("ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", chosen === o.action ? "bg-white/25" : TONE[o.action].tag)}>
              AI
            </span>
          )}
        </button>
      ))}
      {chosen && (
        <div className="w-full space-y-2 pt-2">
          {offerDraft && (
            <div className="flex items-start gap-3 rounded-xl bg-accent-soft/70 px-3 py-2.5 text-[14px]">
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-medium text-accent">{labels.aiDraft}</div>
                <p className="line-clamp-2 text-fg/80">{draftReply}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <button onClick={() => { setReason(draftReply!); setError(null); }} className="rounded-full bg-accent px-3 py-1 text-[13px] font-medium text-white transition hover:bg-accent/90 active:scale-[0.97]">
                  {labels.useDraft}
                </button>
                <span className="text-[11px] text-muted">{labels.ownWords}</span>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <textarea
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={needsReason ? labels.remarksRequired : labels.remarksOptional}
              rows={reason.length > 120 ? 4 : 2}
              className="min-w-0 flex-1 rounded-xl border border-line-strong bg-white px-3 py-2 text-[15px] outline-none focus:border-accent"
            />
            <div className="flex gap-2">
              <button disabled={pending} onClick={submit} className="rounded-full bg-accent px-5 py-2.5 text-[15px] font-medium text-white transition hover:bg-accent/90 active:scale-[0.97] disabled:opacity-50">{labels.confirm}</button>
              <button onClick={() => { setChosen(null); setError(null); }} className="rounded-full px-4 py-2.5 text-[15px] text-muted transition hover:bg-black/[0.04] hover:text-fg">{labels.cancel}</button>
            </div>
          </div>
        </div>
      )}
      {error && <p role="alert" className="w-full text-[14px] text-red">{error}</p>}
    </Shell>
  );
}

/** For a decided case: send it back to the desk, with a reason that goes into the history. */
export function ReopenBar({
  applicationId, labels,
}: {
  applicationId: number;
  labels: Record<"closed" | "reopen" | "reason" | "required" | "confirm" | "cancel", string>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    if (reason.trim().length < 3) return setError(labels.required);
    setError(null);
    start(async () => {
      const r = await reopenAction(applicationId, reason);
      if (r && "error" in r) setError(r.error === "reason" ? labels.required : "—");
    });
  }

  return (
    <Shell>
      <span className="mr-2 text-[13px] text-muted">{labels.closed}</span>
      {!open && (
        <button onClick={() => setOpen(true)} className="rounded-full bg-black/[0.05] px-5 py-2.5 text-[15px] font-medium transition hover:bg-black/[0.09] active:scale-[0.97] active:bg-black/[0.13]">
          {labels.reopen}
        </button>
      )}
      {open && (
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-start">
          <textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder={labels.reason} rows={2}
            className="min-w-0 flex-1 rounded-xl border border-line-strong bg-white px-3 py-2 text-[15px] outline-none focus:border-accent" />
          <div className="flex gap-2">
            <button disabled={pending} onClick={submit} className="rounded-full bg-accent px-5 py-2.5 text-[15px] font-medium text-white transition hover:bg-accent/90 active:scale-[0.97] disabled:opacity-50">{labels.confirm}</button>
            <button onClick={() => { setOpen(false); setError(null); }} className="rounded-full px-4 py-2.5 text-[15px] text-muted transition hover:bg-black/[0.04] hover:text-fg">{labels.cancel}</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="w-full text-[14px] text-red">{error}</p>}
    </Shell>
  );
}
