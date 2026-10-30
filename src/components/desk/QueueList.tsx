"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import clsx from "clsx";
import type { QueueItem } from "@/lib/case/queue";
import type { Band } from "@/lib/priority";

const DOT: Record<Band, string> = { urgent: "bg-red", attention: "bg-amber", normal: "bg-line-strong" };

export function QueueList({
  items, labels,
}: {
  items: QueueItem[];
  labels: { urgent: string; attention: string; normal: string; empty: string; allClear: string; all: string; patta: string; grievance: string; overdue: string; left: string; today: string };
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const filter = params.get("type");
  const active = Number(pathname.match(/\/applications\/(\d+)/)?.[1]);
  const shown = items.filter((i) => !filter || i.type === filter);
  const groups: Band[] = ["urgent", "attention", "normal"];
  const due = (d: number) => (d < 0 ? labels.overdue.replace("{n}", String(-d)) : d === 0 ? labels.today : labels.left.replace("{n}", String(d)));
  const tabs = [
    { key: null, label: labels.all, n: items.length },
    { key: "patta", label: labels.patta, n: items.filter((i) => i.type === "patta").length },
    { key: "grievance", label: labels.grievance, n: items.filter((i) => i.type === "grievance").length },
  ];
  const keep = (t: string | null) => (t ? `?type=${t}` : "");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex gap-1 px-4 pb-3">
        {tabs.map((t) => (
          <Link
            key={t.label}
            href={`${pathname}${keep(t.key)}`}
            className={clsx("rounded-full px-3 py-1 text-[13px] transition", filter === t.key ? "bg-fg text-white" : "text-muted hover:bg-black/5")}
          >
            {t.label} <span className="opacity-60">{t.n}</span>
          </Link>
        ))}
      </div>
      <div className="pane min-h-0 flex-1 overflow-y-auto pb-6">
        {shown.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted">{labels.empty}</p>}
        {groups.map((g) => {
          const list = shown.filter((i) => i.band === g);
          if (!list.length) return null;
          return (
            <section key={g} className="mt-1">
              <h3 className="px-5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-faint">{labels[g]}</h3>
              <ul className="px-2">
                {list.map((i) => (
                  <li key={i.id}>
                    <Link
                      href={`/applications/${i.id}${keep(filter)}`}
                      className={clsx("block rounded-xl px-3 py-2.5 transition", active === i.id ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "hover:bg-black/[0.03]")}
                    >
                      <div className="flex items-baseline gap-2">
                        <span className={clsx("mt-1.5 h-2 w-2 shrink-0 self-start rounded-full", DOT[i.band])} aria-hidden />
                        <span className="min-w-0 flex-1 truncate font-medium">{i.name}</span>
                        <span className={clsx("shrink-0 text-xs tabular-nums", i.daysLeft < 0 ? "font-medium text-red" : "text-faint")}>{due(i.daysLeft)}</span>
                      </div>
                      <div className="ml-4 truncate text-[13px] text-muted">
                        {i.headline ?? <span className="text-green">{labels.allClear}</span>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
