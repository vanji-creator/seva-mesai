import clsx from "clsx";

export interface CompareRow {
  label: string;
  applied: string | number;
  registry: string | number | null;
  /** true -> highlight as mismatch. Set by the page from the verifier's evidence, not by guess. */
  bad: boolean;
  /** Value read from the uploaded deed (third column), if one was read. */
  doc?: string | number | null;
  docBad?: boolean;
}

/** The "silo fix" made visible: what the citizen wrote vs. what other departments hold (vs. the uploaded deed). */
export function Compare({ rows, applied, registry, doc }: { rows: CompareRow[]; applied: string; registry: string; doc?: string }) {
  const cols = doc ? "grid-cols-[1fr_1fr_1fr_1fr]" : "grid-cols-[1fr_1fr_1fr]";
  return (
    // On phones the table scrolls sideways inside its own box; the page itself never scrolls horizontally.
    <div className="overflow-x-auto rounded-xl border border-line">
      <div className={clsx(doc ? "min-w-[560px]" : "min-w-[420px]")}>
      <div className={clsx("grid gap-2 bg-bg px-4 py-2 text-sm font-semibold text-muted", cols)}>
        <span />
        <span>{applied}</span>
        {doc && <span>{doc}</span>}
        <span>{registry}</span>
      </div>
      {rows.map((r) => (
        <div key={r.label} className={clsx("grid gap-2 border-t border-line px-4 py-2", cols, (r.bad || r.docBad) && "bg-red-50")}>
          <span className="text-muted">{r.label}</span>
          <span>{r.applied}</span>
          {doc && <span className={clsx(r.docBad && "font-semibold text-urgent")}>{r.doc ?? "—"}{r.docBad && " ⚠"}</span>}
          <span className={clsx(r.bad && "font-semibold text-urgent")}>{r.registry ?? "—"}{r.bad && " ⚠"}</span>
        </div>
      ))}
      </div>
    </div>
  );
}
