import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { LangToggle } from "@/components/LangToggle";
import { requireOfficer } from "@/lib/auth";
import { getT } from "@/lib/i18n";

export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  const officer = await requireOfficer();
  const { t, locale } = await getT();
  return (
    <>
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="text-xl font-bold text-brand">{t("app.name")}</Link>
          <nav className="flex gap-4 text-base">
            <Link href="/" className="hover:underline">{t("nav.desk")}</Link>
            {officer.role === "supervisor" && <Link href="/audit" className="hover:underline">{t("nav.audit")}</Link>}
            <Link href="/evals" className="hover:underline">{t("nav.evals")}</Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-muted sm:inline">
              {locale === "ta" ? officer.nameTa : officer.name} · {locale === "ta" ? officer.officeTa : officer.office}
            </span>
            <LangToggle locale={locale} label={t("lang.switch")} />
            <form action={logoutAction}><button className="rounded-full border border-line px-4 py-1.5 text-sm hover:bg-bg">{t("nav.logout")}</button></form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </>
  );
}
