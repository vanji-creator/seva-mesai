import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { LangToggle } from "@/components/LangToggle";
import { requireCitizen } from "@/lib/auth";
import { getT } from "@/lib/i18n";

/** The citizen's side: a plain single column — their applications, nothing about how they are checked. */
export default async function CitizenLayout({ children }: { children: React.ReactNode }) {
  const citizen = await requireCitizen();
  const { t, locale } = await getT();
  return (
    <div className="min-h-dvh bg-side">
      <header className="border-b border-line bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[760px] items-center gap-4 px-5 py-3">
          <Link href="/my" className="min-w-0 flex-1 leading-tight">
            <div className="text-[17px] font-semibold">{t("app.name")}</div>
            <div className="text-xs text-muted">{t("cz.portal")}</div>
          </Link>
          <span className="hidden truncate text-[13px] text-muted sm:block">{locale === "ta" ? citizen.nameTa : citizen.name}</span>
          <LangToggle locale={locale} label={t("lang.switch")} />
          <form action={logoutAction}><button className="text-[13px] text-muted transition hover:text-fg">{t("nav.logout")}</button></form>
        </div>
      </header>
      <main className="mx-auto max-w-[760px] px-5 py-8">{children}</main>
    </div>
  );
}
