import { Sidebar } from "@/components/desk/Sidebar";
import { requireOfficer } from "@/lib/auth";
import { getQueue } from "@/lib/case/queue";
import { getT } from "@/lib/i18n";

export default async function Desk() {
  const officer = await requireOfficer();
  const { t, locale } = await getT();
  const items = await getQueue(locale);
  const count = (b: string) => items.filter((i) => i.band === b).length;
  const late = items.filter((i) => i.daysLeft < 0).length;

  return (
    <>
      {/* Phones: the queue is the home screen. */}
      <div className="h-dvh lg:hidden">
        <Sidebar officer={officer} />
      </div>
      {/* Desktop: quiet overview until a case is chosen. */}
      <div className="hidden h-full flex-col items-center justify-center gap-10 px-8 lg:flex">
        <div className="grid grid-cols-4 gap-10 text-center">
          {[
            { n: items.length, l: t("desk.pending"), c: "text-fg" },
            { n: count("urgent"), l: t("desk.urgent"), c: "text-red" },
            { n: count("attention"), l: t("desk.attention"), c: "text-amber" },
            { n: late, l: t("desk.overdue"), c: "text-red" },
          ].map((s) => (
            <div key={s.l}>
              <div className={`text-5xl font-semibold tabular-nums tracking-tight ${s.c}`}>{s.n}</div>
              <div className="mt-1 text-sm text-muted">{s.l}</div>
            </div>
          ))}
        </div>
        <p className="text-muted">{t("desk.select")}</p>
      </div>
    </>
  );
}
