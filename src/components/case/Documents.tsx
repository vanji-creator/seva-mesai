"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import clsx from "clsx";
import { rereadDocAction, uploadDocAction } from "@/app/actions";

export interface DocView {
  id: number;
  label: string;
  fileName: string;
  href: string;
  preview: string | null;
  isPdf: boolean;
  byOfficer: boolean;
  /** unclear = Sarvam could not read it confidently (e.g. a blurry photo): the officer checks it by eye. */
  state: "read" | "notRead" | "unrelated" | "unclear";
  /** A newer file of the same kind was added (e.g. a fresh receipt); kept for the record. */
  replaced: boolean;
  docTypeLabel: string | null;
  confidence: number | null;
  fields: { label: string; value: string }[];
  entries: { date: string; nature: string; docNo: string; parties: string; detail: string }[];
  text: string | null;
  textEn: string | null;
}

type L = Record<
  "title" | "add" | "reading" | "read" | "notRead" | "reread" | "open" | "whatRead" | "confidence" | "officer" | "citizen" |
  "unrelated" | "unclear" | "replaced" | "missing" | "hint" | "samples" | "choose" | "error" | "size" | "type" | "close" | "entries" | "typeLabel" | "translation",
  string
>;

export function Documents({
  applicationId, docs, missing, samples, canEdit, labels,
}: {
  applicationId: number;
  docs: DocView[];
  missing: string[];
  samples: { id: string; label: string }[];
  canEdit: boolean;
  labels: L;
}) {
  const [open, setOpen] = useState<DocView | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  // Keep the open viewer in sync after a re-read refreshes the page data.
  useEffect(() => {
    if (open) setOpen(docs.find((d) => d.id === open.id) ?? null);
  }, [docs]); // eslint-disable-line react-hooks/exhaustive-deps

  function send(form: FormData) {
    setError(null);
    start(async () => {
      const r = await uploadDocAction(applicationId, form);
      if (r && "error" in r) setError(r.error === "size" ? labels.size : r.error === "type" ? labels.type : labels.error);
      else setAdding(false);
    });
  }

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[17px] font-semibold">{labels.title} <span className="font-normal text-faint">{docs.length}</span></h2>
        {canEdit && (
          <button onClick={() => setAdding((v) => !v)} className="text-[14px] font-medium text-accent">{labels.add}</button>
        )}
      </div>

      {adding && (
        <div className="mb-4 rounded-2xl bg-side p-4">
          {pending ? (
            <p role="status" className="animate-pulse text-[15px] font-medium">{labels.reading}</p>
          ) : (
            <>
              <p className="text-[13px] text-muted">{labels.hint}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const fd = new FormData();
                    fd.set("file", f);
                    send(fd);
                  }}
                />
                <button onClick={() => fileRef.current?.click()} className="rounded-full bg-fg px-4 py-2 text-[14px] font-medium text-white">{labels.choose}</button>
                {samples.length > 0 && <span className="ml-2 text-[13px] text-muted">{labels.samples}:</span>}
                {samples.map((s) => (
                  <button key={s.id} onClick={() => { const fd = new FormData(); fd.set("sample", s.id); send(fd); }} className="rounded-full border border-line-strong bg-white px-3 py-1.5 text-[13px] hover:bg-black/[0.03]">
                    {s.label}
                  </button>
                ))}
              </div>
            </>
          )}
          {error && <p role="alert" className="mt-2 text-[14px] text-red">{error}</p>}
        </div>
      )}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {docs.map((d) => (
          <li key={d.id} className={clsx(d.replaced && "opacity-50")}>
            <button onClick={() => setOpen(d)} className="group block w-full text-left">
              <div className={clsx("aspect-[3/4] overflow-hidden rounded-xl border bg-side transition group-hover:shadow-md", d.state === "unrelated" ? "border-red/40" : d.state === "unclear" && !d.replaced ? "border-amber/60" : "border-line")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {d.preview ? <img src={d.preview} alt="" className="h-full w-full object-cover object-top" /> : <div className="grid h-full place-items-center text-sm text-faint">PDF</div>}
              </div>
              <div className="mt-1.5 truncate text-[14px] font-medium">{d.label}</div>
              <div className={clsx("text-[12px]", d.replaced ? "text-faint" : d.state === "unrelated" ? "text-red" : d.state === "notRead" || d.state === "unclear" ? "text-amber" : "text-faint")}>
                {d.replaced ? labels.replaced : d.state === "unrelated" ? labels.unrelated : d.state === "notRead" ? labels.notRead : d.state === "unclear" ? labels.unclear : `${labels.read}${d.confidence !== null ? ` · ${Math.round(d.confidence * 100)}%` : ""}`}
                {d.byOfficer && ` · ${labels.officer}`}
              </div>
            </button>
          </li>
        ))}
        {missing.map((m) => (
          <li key={m}>
            <div className="grid aspect-[3/4] place-items-center rounded-xl border border-dashed border-red/50 text-center text-[13px] text-red">{labels.missing}</div>
            <div className="mt-1.5 truncate text-[14px] font-medium text-red">{m}</div>
          </li>
        ))}
      </ul>

      {open && <Viewer doc={open} onClose={() => setOpen(null)} labels={labels} canEdit={canEdit} />}
    </section>
  );
}

function Viewer({ doc, onClose, labels, canEdit }: { doc: DocView; onClose: () => void; labels: L; canEdit: boolean }) {
  const [pending, start] = useTransition();
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label={doc.label} className="fixed inset-0 z-50 flex bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="m-auto flex h-[92dvh] w-[min(1200px,96vw)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl lg:flex-row" onClick={(e) => e.stopPropagation()}>
        <div className="pane min-h-0 flex-1 overflow-auto bg-side">
          {doc.isPdf ? (
            <iframe src={doc.href} title={doc.label} className="h-full min-h-[60vh] w-full" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={doc.href} alt={doc.label} className="mx-auto max-w-full" />
          )}
        </div>
        <aside className="pane flex w-full shrink-0 flex-col overflow-y-auto border-t border-line lg:w-[380px] lg:border-l lg:border-t-0">
          <div className="flex items-start justify-between gap-3 p-5">
            <div className="min-w-0">
              <h3 className="text-[19px] font-semibold">{doc.label}</h3>
              <div className="truncate text-[13px] text-muted">{doc.fileName} · {doc.byOfficer ? labels.officer : labels.citizen}</div>
            </div>
            <button onClick={onClose} className="rounded-full px-2 text-2xl leading-none text-muted hover:text-fg" aria-label={labels.close}>×</button>
          </div>
          <div className="flex-1 px-5 pb-5">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-faint">{labels.whatRead}</div>
            {doc.state === "notRead" && <p className="mt-2 text-amber">{labels.notRead}</p>}
            {doc.state === "unclear" && <p className="mt-2 text-amber">{labels.unclear}</p>}
            {doc.replaced && <p className="mt-2 text-muted">{labels.replaced}</p>}
            {doc.docTypeLabel && (
              <div className={clsx("mt-2 flex justify-between border-b border-line py-2 text-[14px]", doc.state === "unrelated" && "text-red")}>
                <span className="text-muted">{labels.typeLabel}</span>
                <span className="font-medium">{doc.docTypeLabel}{doc.confidence !== null && <span className="ml-1 text-faint">{Math.round(doc.confidence * 100)}%</span>}</span>
              </div>
            )}
            <dl className="text-[14px]">
              {doc.fields.map((f) => (
                <div key={f.label} className="flex justify-between gap-4 border-b border-line py-2">
                  <dt className="text-muted">{f.label}</dt>
                  <dd className="text-right font-medium">{f.value}</dd>
                </div>
              ))}
            </dl>
            {doc.entries.length > 0 && (
              <div className="mt-4">
                <div className="mb-1 text-[13px] text-muted">{labels.entries}</div>
                <ul className="space-y-2 text-[14px]">
                  {doc.entries.map((e, i) => (
                    <li key={i} className="rounded-xl bg-side px-3 py-2">
                      <div className="flex justify-between"><span className="font-medium">{e.nature}</span><span className="text-faint">{e.date}</span></div>
                      <div className="text-muted">{e.parties}</div>
                      <div className="text-[13px] text-faint">{e.docNo} · {e.detail}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {doc.text && <p className="mt-3 whitespace-pre-line rounded-xl bg-side p-3 text-[14px] leading-relaxed">{doc.text}</p>}
            {doc.textEn && (
              <>
                <div className="mt-4 text-[13px] text-muted">{labels.translation}</div>
                <p className="mt-1 whitespace-pre-line rounded-xl bg-side p-3 text-[14px] leading-relaxed">{doc.textEn}</p>
              </>
            )}
          </div>
          <div className="flex gap-2 border-t border-line p-4">
            <a href={doc.href} target="_blank" rel="noreferrer" className="flex-1 rounded-full border border-line-strong py-2 text-center text-[14px] font-medium hover:bg-black/[0.03]">{labels.open}</a>
            {canEdit && (
              <button disabled={pending} onClick={() => start(async () => { await rereadDocAction(doc.id); })} className="flex-1 rounded-full bg-fg py-2 text-[14px] font-medium text-white disabled:opacity-50">
                {pending ? labels.reading : labels.reread}
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
