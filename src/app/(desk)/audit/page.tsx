import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { applications, decisions, officers } from "@/db/schema";
import { requireOfficer } from "@/lib/auth";
import { formatDateTime, getT, type MessageKey } from "@/lib/i18n";

/** Every decision, who made it, and whether it followed the AI — for the supervisor. */
export default async function AuditPage() {
  await requireOfficer();
  const { t, locale } = await getT();
  const rows = await db
    .select({ d: decisions, o: officers, a: applications })
    .from(decisions)
    .innerJoin(officers, eq(decisions.officerId, officers.id))
    .innerJoin(applications, eq(decisions.applicationId, applications.id))
    .orderBy(desc(decisions.id));
  const decided = rows.filter((r) => r.d.action !== "reopened");
  const withAi = decided.filter((r) => r.d.followedAi !== null);
  const followed = withAi.length ? Math.round((withAi.filter((r) => r.d.followedAi).length / withAi.length) * 100) : null;

  return (
    <div className="mx-auto w-full max-w-[980px] space-y-8 px-6 py-8 lg:px-10">
      <Link href="/" className="text-[15px] text-accent lg:hidden">‹ {t("case.back")}</Link>
      <h1 className="text-[32px] font-semibold tracking-tight">{t("audit.title")}</h1>
      <div className="flex gap-12">
        <div><div className="text-4xl font-semibold tabular-nums">{decided.length}</div><div className="text-sm text-muted">{t("audit.total")}</div></div>
        <div><div className="text-4xl font-semibold tabular-nums text-accent">{followed === null ? "—" : `${followed}%`}</div><div className="text-sm text-muted">{t("audit.followed")}</div></div>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted">—</p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {rows.map(({ d, o, a }) => (
            <li key={d.id} className="grid gap-1 px-4 py-3 text-[15px] sm:grid-cols-[1fr_auto]">
              <div>
                <Link href={`/applications/${a.id}`} className="font-medium tabular-nums hover:text-accent">{a.refNo}</Link>
                <span className="text-muted"> ({locale === "ta" ? a.applicantNameTa : a.applicantName}) · {t(`status.${d.action}`)}</span>
                {d.reason && <p className="text-muted">{d.reason}</p>}
              </div>
              <div className="text-right text-[13px] text-faint">
                {formatDateTime(d.createdAt, locale)} · {locale === "ta" ? o.nameTa : o.name}
                <div className={d.followedAi === false ? "text-amber" : ""}>
                  {d.aiSuggestion ? `${t("act.suggested")}: ${t(`sug.${d.aiSuggestion}` as MessageKey)}` : "—"}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
