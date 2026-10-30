import Link from "next/link";
import { DEMO_KITS, VILLAGES } from "@/db/cases";
import { NewApplicationForm } from "@/components/citizen/NewApplicationForm";
import { KitDownloads } from "@/components/citizen/Kits";
import { requireCitizen } from "@/lib/auth";
import { getT } from "@/lib/i18n";

export default async function NewApplication() {
  const citizen = await requireCitizen();
  const { t, locale } = await getT();
  // Demo helper: the land details printed on each kit's deed, so the presenter needn't retype them.
  const kits = DEMO_KITS.map((k) => ({
    id: k.id, label: `${t("cz.fill")} · ${k.id === "kit-a" ? "A" : "B"}`,
    values: { village: k.village.en, seller: k.seller.name, buyer: k.buyer.name, survey: k.surveyNo, extent: String(k.deed.extentCents), deed: k.deed.no },
  }));

  return (
    <div className="space-y-6">
      <Link href="/my" className="text-[15px] text-accent">‹ {t("cz.back")}</Link>
      <h1 className="text-[28px] font-semibold tracking-tight">{t("cz.new")}</h1>
      <KitDownloads labels={{ kits: t("cz.kits"), hint: t("cz.kitsHint"), kitA: t("cz.kitA"), kitB: t("cz.kitB"), kitBPaid: t("cz.kitBPaid"), download: t("cz.download") }} />
      <NewApplicationForm
        villages={Object.entries(VILLAGES).map(([en, ta]) => ({ value: en, label: locale === "ta" ? ta : en }))}
        defaultVillage={citizen.village}
        defaultBuyer={citizen.nameTa.split(" ")[0]}
        kits={kits}
        labels={{
          details: t("cz.details"), village: t("cz.village"), seller: t("cz.seller"), buyer: t("cz.buyer"), survey: t("cz.survey"),
          extent: t("cz.extent"), deed: t("cz.deed"), submit: t("cz.continue"), error: t("act.required"),
        }}
      />
    </div>
  );
}
