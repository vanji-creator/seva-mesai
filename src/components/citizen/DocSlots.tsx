"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { resubmitAction, submitApplicationAction, uploadSlotAction } from "@/app/citizen-actions";
import type { DocKind } from "@/db/cases";

type Slot = { kind: DocKind; label: string; file: { id: number; name: string; when: string } | null };

/** One row per required document: upload, see it's there, replace it. Nothing about how it is read. */
export function DocSlots({
  applicationId, editable, slots, labels,
}: {
  applicationId: number;
  editable: boolean;
  slots: Slot[];
  labels: Record<"title" | "hint" | "upload" | "replace" | "uploading" | "uploaded" | "none" | "view" | "size" | "type" | "error", string>;
}) {
  return (
    <section className="rounded-2xl border border-line bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pb-2 pt-5 sm:px-6">
        <h2 className="text-[17px] font-semibold">{labels.title}</h2>
        {editable && <span className="text-xs text-faint">{labels.hint}</span>}
      </div>
      <ul className="divide-y divide-line">
        {slots.map((s) => <SlotRow key={s.kind} applicationId={applicationId} slot={s} editable={editable} labels={labels} />)}
      </ul>
    </section>
  );
}

function SlotRow({ applicationId, slot, editable, labels }: { applicationId: number; slot: Slot; editable: boolean; labels: Record<string, string> }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const upload = (file: File) => {
    setError(null);
    const form = new FormData();
    form.set("file", file);
    start(async () => {
      const r = await uploadSlotAction(applicationId, slot.kind, form);
      if (r && "error" in r) setError(r.error === "size" ? labels.size : r.error === "type" ? labels.type : labels.error);
    });
  };

  return (
    <li className="flex items-center gap-4 px-5 py-3.5 sm:px-6">
      <span className={clsx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px]", slot.file ? "bg-green text-white" : "border border-line-strong text-transparent")} aria-hidden>
        ✓
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{slot.label}</div>
        <div className="truncate text-[13px] text-muted">
          {pending ? labels.uploading : slot.file ? (
            <>
              {labels.uploaded} · <a href={`/files/${slot.file.id}`} target="_blank" rel="noreferrer" className="text-accent hover:underline">{slot.file.name}</a> · {slot.file.when}
            </>
          ) : labels.none}
        </div>
        {error && <p role="alert" className="text-[13px] text-red">{error}</p>}
      </div>
      {editable && (
        <>
          <input ref={input} type="file" accept="application/pdf,image/png,image/jpeg" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
          <button
            type="button"
            disabled={pending}
            onClick={() => input.current?.click()}
            className={clsx(
              "shrink-0 rounded-full px-4 py-1.5 text-[14px] font-medium transition active:scale-[0.97] disabled:opacity-50",
              slot.file ? "bg-black/[0.05] hover:bg-black/[0.09] active:bg-black/[0.13]" : "bg-accent-soft text-accent hover:bg-accent/15 active:bg-accent/25",
            )}
          >
            {pending ? "…" : slot.file ? labels.replace : labels.upload}
          </button>
        </>
      )}
    </li>
  );
}

/** Submit (first time) or resubmit (after a return, with an optional note to the officer). */
export function SubmitBar({
  applicationId, mode, ready, labels,
}: {
  applicationId: number;
  mode: "submit" | "resubmit";
  ready: boolean;
  labels: Record<"submit" | "resubmit" | "submitting" | "needAll" | "note" | "error", string>;
}) {
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const send = () =>
    start(async () => {
      setError(null);
      const r = mode === "submit" ? await submitApplicationAction(applicationId) : await resubmitAction(applicationId, note);
      if (r && "error" in r) setError(r.error === "missing" ? labels.needAll : labels.error);
      else router.refresh();
    });

  return (
    <div className="fixed inset-x-0 bottom-0 border-t border-line bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[760px] flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
        {mode === "resubmit" && (
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={labels.note}
            className="min-w-0 flex-1 rounded-xl border border-line-strong bg-white px-3.5 py-2.5 text-[15px] outline-none focus:border-accent" />
        )}
        {mode === "submit" && <span className="flex-1 text-[13px] text-muted">{ready ? "" : labels.needAll}</span>}
        {error && <span role="alert" className="text-[13px] text-red">{error}</span>}
        <button
          disabled={!ready || pending}
          onClick={send}
          className="rounded-full bg-accent px-6 py-3 text-[16px] font-medium text-white transition hover:bg-accent/90 active:scale-[0.98] disabled:opacity-40"
        >
          {pending ? labels.submitting : mode === "submit" ? labels.submit : labels.resubmit}
        </button>
      </div>
    </div>
  );
}
