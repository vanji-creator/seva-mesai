"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import clsx from "clsx";
import type { QueueItem, Stage } from "@/lib/case/queue";
import type { Band } from "@/lib/priority";

const DOT: Record<Band, string> = { urgent: "bg-red", attention: "bg-amber", normal: "bg-line-strong" };
const STATUS_TONE = { approved: "text-green", returned: "text-amber", rejected: "text-red", pending: "text-faint" } as const;
const STAGES: Stage[] = ["pending", "reopened", "completed"];

type Item = QueueItem & { decidedOn: string | null };

export function QueueList({
  items, labels,
}: {
  items: Item[];
  labels: Record<
    | "urgent" | "attention" | "normal" | "allClear" | "all" | "patta" | "grievance" | "overdue" | "left" | "today"
    | "pending" | "reopened" | "completed" | "emptyPending" | "emptyReopened" | "emptyCompleted" | "approved" | "returned" | "rejected",
    string
  >;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const filter = params.get("type");
  const active = Number(pathname.match(/\/applications\/(\d+)/)?.[1]);
  // With no list chosen, show the one that holds the open case, so it stays highlighted.
  const asked = params.get("view") as Stage | null;
  const view: Stage = asked && STAGES.includes(asked) ? asked : (items.find((i) => i.id === active)?.stage ?? "pending");

  const inView = items.filter((i) => i.stage === view);
  const shown = inView.filter((i) => !filter || i.type === filter);
  const due = (d: number) => (d < 0 ? labels.overdue.replace("{n}", String(-d)) : d === 0 ? labels.today : labels.left.replace("{n}", String(d)));
  const query = (v: Stage, t: string | null) => {
    const q = new URLSearchParams();
    q.set("view", v);
    if (t) q.set("type", t);
    const s = q.toString();
    return s ? `?${s}` : "";
  };
  const types = [
    { key: null, label: labels.all, n: inView.length },
    { key: "patta", label: labels.patta, n: inView.filter((i) => i.type === "patta").length },
    { key: "grievance", label: labels.grievance, n: inView.filter((i) => i.type === "grievance").length },
  ];
  const empty = { pending: labels.emptyPending, reopened: labels.emptyReopened, completed: labels.emptyCompleted }[view];

  const row = (i: Item) => (
    <li key={i.id}>
      <Link
        href={`/applications/${i.id}${query(view, filter)}`}
        className={clsx("block rounded-xl px-3 py-2.5 transition", active === i.id ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "hover:bg-black/[0.03]")}
      >
        <div className="flex items-baseline gap-2">
          {i.stage !== "completed" && <span className={clsx("mt-1.5 h-2 w-2 shrink-0 self-start rounded-full", DOT[i.band])} aria-hidden />}
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium tabular-nums">{i.refNo}</span> <span className="text-muted">({i.name})</span>
          </span>
          {i.stage === "completed" ? (
            <span className={clsx("shrink-0 text-xs font-medium", STATUS_TONE[i.status])}>{labels[i.status as "approved" | "returned" | "rejected"]}</span>
          ) : (
            <span className={clsx("shrink-0 text-xs tabular-nums", i.daysLeft < 0 ? "font-medium text-red" : "text-faint")}>{due(i.daysLeft)}</span>
          )}
        </div>
        <div className={clsx("truncate text-[13px] text-muted", i.stage !== "completed" && "ml-4")}>
          {i.stage === "completed" ? i.decidedOn : (i.headline ?? <span className="text-green">{labels.allClear}</span>)}
        </div>
      </Link>
    </li>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Which list: pending, reopened, completed. */}
      {/* Full-width tab strip, edge to edge: the main switch between lists. */}
      <div className="mb-3 grid grid-cols-3 divide-x divide-line border-y border-line bg-black/[0.03] text-[14px]">
        {STAGES.map((s) => (
          <Link
            key={s}
            href={`${pathname}${query(s, filter)}`}
            aria-current={view === s ? "page" : undefined}
            className={clsx(
              "flex items-center justify-center gap-1.5 px-2 py-2 text-center transition active:bg-black/[0.08]",
              view === s ? "bg-white font-semibold text-fg shadow-[inset_0_-2px_0_var(--accent)]" : "text-muted hover:bg-black/[0.04] hover:text-fg",
            )}
          >
            <span className="min-w-0 truncate">{labels[s]}</span>
            <span className={clsx("shrink-0 text-[13px] tabular-nums", view === s ? "text-accent" : "opacity-60")}>{items.filter((i) => i.stage === s).length}</span>
          </Link>
        ))}
      </div>
      <div className="flex gap-1 px-4 pb-2">
        {types.map((t) => (
          <Link
            key={t.label}
            href={`${pathname}${query(view, t.key)}`}
            className={clsx("rounded-full px-3 py-1 text-[13px] transition", filter === t.key ? "bg-fg text-white" : "text-muted hover:bg-black/5")}
          >
            {t.label} <span className="opacity-60">{t.n}</span>
          </Link>
        ))}
      </div>
      <div className="pane min-h-0 flex-1 overflow-y-auto pb-6">
        {shown.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted">{empty}</p>}
        {view === "completed" ? (
          <ul className="px-2 pt-2">{shown.map(row)}</ul>
        ) : (
          (["urgent", "attention", "normal"] as Band[]).map((g) => {
            const list = shown.filter((i) => i.band === g);
            if (!list.length) return null;
            return (
              <section key={g} className="mt-1">
                <h3 className="px-5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-faint">{labels[g]}</h3>
                <ul className="px-2">{list.map(row)}</ul>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
