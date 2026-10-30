"use client";
import { useState, useTransition } from "react";
import { readDeedAction } from "@/app/actions";

export function DeedUpload({
  applicationId, samples, labels,
}: {
  applicationId: number;
  samples: { id: string; label: string }[];
  labels: Record<"title" | "hint" | "upload" | "reading" | "useSample" | "useSampleBtn" | "error" | "size" | "type", string>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sample, setSample] = useState(samples[0]?.id ?? "");

  function send(form: FormData) {
    setError(null);
    start(async () => {
      const r = await readDeedAction(applicationId, form);
      if (r && "error" in r) setError(r.error === "size" ? labels.size : r.error === "type" ? labels.type : labels.error);
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-brand/40 bg-brand/5 p-4">
      <div>
        <div className="font-semibold text-brand">{labels.title}</div>
        <div className="text-sm text-muted">{labels.hint}</div>
      </div>
      {pending ? (
        <p role="status" className="animate-pulse font-medium text-brand">{labels.reading}</p>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <form action={send} className="flex flex-wrap items-center gap-2">
            <input name="file" type="file" accept="application/pdf,image/png,image/jpeg" required className="max-w-56 text-sm file:mr-2 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-white" />
            <button className="rounded-lg border border-brand px-3 py-1.5 text-sm font-semibold text-brand">{labels.upload}</button>
          </form>
          {samples.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-muted" htmlFor="sample">{labels.useSample}</label>
              <select id="sample" value={sample} onChange={(e) => setSample(e.target.value)} className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm">
                {samples.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <button
                onClick={() => { const f = new FormData(); f.set("sample", sample); send(f); }}
                className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white"
              >
                {labels.useSampleBtn}
              </button>
            </div>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-urgent">{error}</p>}
    </div>
  );
}
