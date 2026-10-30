import { redirect } from "next/navigation";
import { currentOfficer } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { LoginForm } from "./LoginForm";
import { LangToggle } from "@/components/LangToggle";

export default async function LoginPage() {
  if (await currentOfficer()) redirect("/");
  const { t, locale } = await getT();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4">
      <div className="flex justify-end"><LangToggle locale={locale} label={t("lang.switch")} /></div>
      <div>
        <h1 className="text-3xl font-bold text-brand">{t("app.name")}</h1>
        <p className="text-muted">{t("app.tagline")}</p>
      </div>
      <LoginForm labels={{ title: t("login.title"), user: t("login.username"), pass: t("login.password"), submit: t("login.submit"), error: t("login.error") }} />
      <p className="rounded-lg border border-line bg-card p-3 text-sm text-muted">{t("login.demo")}</p>
    </main>
  );
}
