"use client";
import { useState, useTransition } from "react";
import clsx from "clsx";
import { decideAction } from "@/app/actions";

type Action = "approved" | "rejected" | "returned";

export function DecisionBar({
  applicationId, labels, approveLabel,
}: {
  applicationId: number;
  labels: Record<string, string>;
  approveLabel: string;
}) {
  const [chosen, setChosen] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const buttons: { action: Action; label: string; cls: string }[] = [
    { action: "approved", label: approveLabel, cls: "bg-ok text-white" },
    { action: "returned", label: labels.return, cls: "bg-attention text-white" },
    { action: "rejected", label: labels.reject, cls: "bg-urgent text-white" },
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
    <div className="sticky bottom-0 -mx-4 border-t border-line bg-card/95 px-4 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-3">
        {chosen && (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-sm">
              {labels.reason}
              <textarea
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="rounded-lg border border-line bg-white p-3 text-base"
              />
            </label>
            {error && <p role="alert" className="text-urgent">{error}</p>}
            <div className="flex gap-3">
              <button disabled={pending} onClick={submit} className="rounded-lg bg-brand px-5 py-2.5 font-semibold text-white disabled:opacity-60">{labels.confirm}</button>
              <button onClick={() => { setChosen(null); setError(null); }} className="rounded-lg border border-line px-5 py-2.5">{labels.cancel}</button>
            </div>
          </div>
        )}
        {!chosen && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {buttons.map((b) => (
              <button key={b.action} onClick={() => setChosen(b.action)} className={clsx("rounded-xl px-5 py-3.5 text-lg font-bold", b.cls)}>
                {b.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
