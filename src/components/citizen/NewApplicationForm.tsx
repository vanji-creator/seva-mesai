"use client";
import { useActionState, useRef } from "react";
import { startApplicationAction } from "@/app/citizen-actions";

type Field = "village" | "seller" | "buyer" | "survey" | "extent" | "deed";

/** Step 1 of an online application: the land details, as on the citizen's sale deed. */
export function NewApplicationForm({
  villages, defaultVillage, defaultBuyer, kits, labels,
}: {
  villages: { value: string; label: string }[];
  defaultVillage: string;
  defaultBuyer: string;
  kits: { id: string; label: string; values: Record<Field, string> }[];
  labels: Record<"details" | "village" | "seller" | "buyer" | "survey" | "extent" | "deed" | "submit" | "error", string>;
}) {
  const [state, action, pending] = useActionState(startApplicationAction, null);
  const form = useRef<HTMLFormElement>(null);
  const fill = (v: Record<Field, string>) => {
    for (const [k, x] of Object.entries(v)) {
      const el = form.current?.elements.namedItem(k) as HTMLInputElement | HTMLSelectElement | null;
      if (el) el.value = x;
    }
  };
  const input = "w-full rounded-xl border border-line-strong bg-white px-3.5 py-2.5 text-[16px] outline-none transition focus:border-accent";
  const field = (name: Field, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className="mb-1.5 block text-[13px] text-muted">{label}</span>
      <input name={name} required className={input} {...extra} />
    </label>
  );

  return (
    <form ref={form} action={action} className="space-y-5 rounded-2xl border border-line bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[17px] font-semibold">{labels.details}</h2>
        <div className="flex gap-1.5">
          {kits.map((k) => (
            <button key={k.id} type="button" onClick={() => fill(k.values)} className="rounded-full bg-black/[0.05] px-3 py-1 text-[12px] text-muted transition hover:bg-black/[0.09] hover:text-fg active:bg-black/[0.13]">
              {k.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-[13px] text-muted">{labels.village}</span>
          <select name="village" defaultValue={defaultVillage} className={input}>
            {villages.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </label>
        {field("deed", labels.deed, { placeholder: "4630/2026" })}
        {field("seller", labels.seller)}
        {field("buyer", labels.buyer, { defaultValue: defaultBuyer })}
        {field("survey", labels.survey, { placeholder: "58/2" })}
        {field("extent", labels.extent, { type: "number", min: 1, step: 1, inputMode: "numeric" })}
      </div>
      {state?.error && <p role="alert" className="text-[14px] text-red">{labels.error}</p>}
      <button disabled={pending} className="w-full rounded-full bg-accent py-3 text-[16px] font-medium text-white transition hover:bg-accent/90 active:scale-[0.99] disabled:opacity-60 sm:w-auto sm:px-8">
        {labels.submit}
      </button>
    </form>
  );
}
