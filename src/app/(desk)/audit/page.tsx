import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { applications, decisions, officers } from "@/db/schema";
import { requireOfficer } from "@/lib/auth";
import { getT } from "@/lib/i18n";

export default async function AuditPage() {
  const me = await requireOfficer();
  const { t, locale } = await getT();
  if (me.role !== "supervisor") return <p className="rounded-xl border border-line bg-card p-8">{t("audit.forbidden")}</p>;

  const rows = await db
    .select({ d: decisions, o: officers, a: applications })
    .from(decisions)
    .innerJoin(officers, eq(decisions.officerId, officers.id))
    .innerJoin(applications, eq(decisions.applicationId, applications.id))
    .orderBy(desc(decisions.id));
  const withAi = rows.filter((r) => r.d.followedAi !== null);
  const followed = withAi.length ? Math.round((withAi.filter((r) => r.d.followedAi).length / withAi.length) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t("audit.title")}</h1>
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="rounded-xl border border-line bg-card p-4"><div className="text-4xl font-bold">{rows.length}</div><div className="text-muted">{t("audit.total")}</div></div>
        <div className="rounded-xl border border-line bg-card p-4"><div className="text-4xl font-bold text-brand">{followed}%</div><div className="text-muted">{t("audit.followed")}</div></div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-card">
        <table className="w-full text-left">
          <thead className="bg-bg text-sm text-muted">
            <tr>{(["audit.when", "col.ref", "audit.officer", "audit.action", "audit.ai", "audit.reason"] as const).map((k) => <th key={k} className="px-4 py-2">{t(k)}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(({ d, o, a }) => (
              <tr key={d.id} className="border-t border-line">
                <td className="px-4 py-2 whitespace-nowrap">{d.createdAt.toLocaleString(locale === "ta" ? "ta-IN" : "en-IN")}</td>
                <td className="px-4 py-2 font-mono text-sm">{a.refNo}</td>
                <td className="px-4 py-2">{locale === "ta" ? o.nameTa : o.name}</td>
                <td className="px-4 py-2">{t(`status.${d.action}`)}</td>
                <td className="px-4 py-2">{d.aiSuggestion ? t(`sug.${d.aiSuggestion}`) : "—"}{d.followedAi === false && " ≠"}</td>
                <td className="px-4 py-2 text-muted">{d.reason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
