import { redirect } from "next/navigation";
import { homeFor } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { LoginForm } from "./LoginForm";
import { LangToggle } from "@/components/LangToggle";

export default async function LoginPage() {
  const home = await homeFor();
  if (home) redirect(home);
  const { t, locale } = await getT();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-side px-4">
      <div className="absolute right-4 top-4"><LangToggle locale={locale} label={t("lang.switch")} /></div>
      <div className="w-full max-w-[380px]">
        <div className="mb-8 text-center">
          <h1 className="text-[34px] font-semibold tracking-tight">{t("app.name")}</h1>
          <p className="mt-1 text-muted">{t("app.office")}</p>
        </div>
        <LoginForm labels={{ title: t("login.title"), user: t("login.username"), pass: t("login.password"), submit: t("login.submit"), error: t("login.error") }} />
        <p className="mt-6 text-center text-[13px] text-muted">{t("login.demo")}</p>
      </div>
    </main>
  );
}
