import Link from "next/link";
import { Suspense } from "react";
import { logoutAction } from "@/app/actions";
import { LangToggle } from "@/components/LangToggle";
import { getQueue } from "@/lib/case/queue";
import { getT } from "@/lib/i18n";
import type { Officer } from "@/lib/auth";
import { QueueList } from "./QueueList";

/** The left pane: the queue, always visible on desktop, plus quiet account controls. */
export async function Sidebar({ officer }: { officer: Officer }) {
  const { t, locale } = await getT();
  const items = await getQueue(locale);
  return (
    <aside className="flex h-full w-full flex-col bg-side lg:w-[360px] lg:border-r lg:border-line">
      <header className="flex items-center justify-between px-5 pb-3 pt-5">
        <Link href="/" className="leading-tight">
          <div className="text-[17px] font-semibold">{t("app.name")}</div>
          <div className="text-xs text-muted">{t("app.office")}</div>
        </Link>
        <LangToggle locale={locale} label={t("lang.switch")} />
      </header>
      <h2 className="px-5 pb-2 text-[22px] font-semibold tracking-tight">
        {t("desk.pending")} <span className="text-faint">{items.length}</span>
      </h2>
      <Suspense>
        <QueueList
          items={items}
          labels={{
            urgent: t("desk.urgent"), attention: t("desk.attention"), normal: t("desk.normal"), empty: t("desk.empty"),
            allClear: t("desk.allClear"), all: t("desk.all"), patta: t("desk.patta"), grievance: t("desk.grievance"),
            overdue: t("due.overdue"), left: t("due.left"), today: t("due.today"),
          }}
        />
      </Suspense>
      <footer className="flex items-center gap-4 border-t border-line px-5 py-3 text-[13px] text-muted">
        <span className="min-w-0 flex-1 truncate">{locale === "ta" ? officer.nameTa : officer.name}</span>
        <Link href="/audit" className="hover:text-fg">{t("nav.audit")}</Link>
        <Link href="/evals" className="hover:text-fg">{t("nav.evals")}</Link>
        <form action={logoutAction}><button className="hover:text-fg">{t("nav.logout")}</button></form>
      </footer>
    </aside>
  );
}
