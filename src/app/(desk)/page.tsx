import Link from "next/link";
import clsx from "clsx";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { applications } from "@/db/schema";
import { PriorityChip } from "@/components/PriorityChip";
import { getT, type T } from "@/lib/i18n";
import { priority, type Band } from "@/lib/priority";

function due(daysLeft: number, t: T) {
  if (daysLeft < 0) return { text: t("due.overdue", { n: -daysLeft }), cls: "text-urgent font-semibold" };
  if (daysLeft === 0) return { text: t("due.today"), cls: "text-attention font-semibold" };
  return { text: t("due.left", { n: daysLeft }), cls: daysLeft <= 3 ? "text-attention" : "text-muted" };
}

export default async function Desk({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const { t, locale } = await getT();
  const rows = await db.select().from(applications).where(eq(applications.status, "pending"));

  const ranked = rows
    .map((a) => ({ a, p: priority(a) }))
    .sort((x, y) => y.p.score - x.p.score);
  const count = (b: Band) => ranked.filter((r) => r.p.band === b).length;
  const shown = ranked.filter((r) => !type || r.a.type === type);
  const breached = ranked.filter((r) => r.p.daysLeft < 0).length;

  const stats: { band: Band; n: number; label: string; cls: string }[] = [
    { band: "urgent", n: count("urgent"), label: t("desk.urgent"), cls: "text-urgent" },
    { band: "attention", n: count("attention"), label: t("desk.attention"), cls: "text-attention" },
    { band: "normal", n: count("normal"), label: t("desk.normal"), cls: "text-ok" },
  ];
  const tabs = [
    { key: undefined, label: t("desk.filter.all"), href: "/" },
    { key: "patta", label: t("desk.filter.patta"), href: "/?type=patta" },
    { key: "grievance", label: t("desk.filter.grievance"), href: "/?type=grievance" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t("desk.title")}</h1>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label={t("desk.pending")}>
        {stats.map((s) => (
          <div key={s.band} className="rounded-xl border border-line bg-card p-4">
            <div className={clsx("text-4xl font-bold", s.cls)}>{s.n}</div>
            <div className="text-muted">{s.label}</div>
          </div>
        ))}
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="text-4xl font-bold text-urgent">{breached}</div>
          <div className="text-urgent">{t("desk.breached")}</div>
        </div>
      </section>

      <nav className="flex flex-wrap gap-2" aria-label="filter">
        {tabs.map((tab) => (
          <Link
            key={tab.label}
            href={tab.href}
            className={clsx("rounded-full border px-4 py-1.5", tab.key === type ? "border-brand bg-brand text-white" : "border-line bg-card hover:bg-bg")}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-line bg-card p-8 text-center text-muted">{t("desk.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map(({ a, p }) => {
            const d = due(p.daysLeft, t);
            return (
              <li key={a.id}>
                <Link
                  href={`/applications/${a.id}`}
                  className={clsx(
                    "grid items-center gap-x-4 gap-y-1 rounded-xl border bg-card p-4 transition hover:shadow-md sm:grid-cols-[9rem_1fr_9rem_9rem_8rem]",
                    p.band === "urgent" ? "border-l-8 border-l-urgent border-line" : p.band === "attention" ? "border-l-8 border-l-attention border-line" : "border-line",
                  )}
                >
                  <span className="font-mono text-sm text-muted">{a.refNo}</span>
                  <span>
                    <span className="block font-semibold">{locale === "ta" ? a.applicantNameTa : a.applicantName}</span>
                    <span className="text-sm text-muted">{t(`type.${a.type}`)} · {locale === "ta" ? a.villageTa : a.village}</span>
                  </span>
                  <span className={d.cls}>{d.text}</span>
                  <span className="text-sm">
                    {a.blockers + a.warnings > 0 ? `${a.blockers} ${t("sev.blocker")} · ${a.warnings} ${t("sev.warning")}` : <span className="text-ok">{t("sev.ok")}</span>}
                  </span>
                  <span><PriorityChip band={p.band} label={t(`desk.${p.band}`)} /></span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
