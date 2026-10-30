import Link from "next/link";
import clsx from "clsx";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { applications } from "@/db/schema";
import { requireCitizen } from "@/lib/auth";
import { formatDate, getT, type MessageKey } from "@/lib/i18n";
import type { PattaPayload } from "@/lib/types";
import { STATUS_TONE } from "@/components/citizen/Kits";

export default async function MyApplications() {
  const citizen = await requireCitizen();
  const { t, locale } = await getT();
  const apps = await db.select().from(applications).where(eq(applications.citizenId, citizen.id)).orderBy(desc(applications.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[28px] font-semibold tracking-tight">{t("cz.title")}</h1>
        <Link href="/my/new" className="rounded-full bg-accent px-5 py-2.5 text-[15px] font-medium text-white transition hover:bg-accent/90 active:scale-[0.97]">
          + {t("cz.new")}
        </Link>
      </div>
      {apps.length === 0 ? (
        <p className="rounded-2xl border border-line bg-white px-5 py-10 text-center text-muted">{t("cz.none")}</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
          {apps.map((a) => {
            const p = a.payload as unknown as PattaPayload;
            return (
              <li key={a.id}>
                <Link href={`/my/${a.id}`} className="flex items-center gap-4 px-5 py-4 transition hover:bg-black/[0.02]">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium tabular-nums">{a.refNo}</div>
                    <div className="truncate text-[14px] text-muted">
                      {t("type.patta")} · {t("cz.survey")} {p.surveyNo} · {locale === "ta" ? a.villageTa : a.village}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={clsx("text-[14px] font-medium", STATUS_TONE[a.status])}>{t(`cz.st.${a.status}` as MessageKey)}</div>
                    <div className="text-xs text-faint">{formatDate(a.submittedAt, locale)}</div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
