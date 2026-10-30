import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { applications, decisions, documents } from "@/db/schema";
import { DocSlots, SubmitBar } from "@/components/citizen/DocSlots";
import { KitDownloads, STATUS_TONE } from "@/components/citizen/Kits";
import { requireCitizen } from "@/lib/auth";
import { formatDate, formatDateTime, getT, type MessageKey } from "@/lib/i18n";
import { ONLINE_REQUIRED } from "@/lib/verify/caseCheck";
import type { PattaPayload } from "@/lib/types";

// Uploads are read and submitted applications checked in the background (after the response), within this limit.
export const maxDuration = 60;

export default async function MyApplication({ params }: { params: Promise<{ id: string }> }) {
  const citizen = await requireCitizen();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const { t, locale } = await getT();
  const [app] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.citizenId, citizen.id)));
  if (!app) notFound();
  const p = app.payload as unknown as PattaPayload;
  const docs = await db
    .select({ id: documents.id, slot: documents.slot, fileName: documents.fileName, uploadedAt: documents.uploadedAt })
    .from(documents).where(eq(documents.applicationId, id)).orderBy(desc(documents.uploadedAt));
  const history = await db.select().from(decisions).where(eq(decisions.applicationId, id)).orderBy(desc(decisions.id));
  // The officer's latest word on it (the reopen/resubmit steps aren't a decision).
  const lastDecision = history.find((d) => d.action === "approved" || d.action === "returned" || d.action === "rejected");
  const editable = app.status === "draft" || app.status === "returned";
  const latest = Object.fromEntries(ONLINE_REQUIRED.map((k) => [k, docs.find((d) => d.slot === k) ?? null]));

  return (
    <div className="space-y-6 pb-28">
      <Link href="/my" className="text-[15px] text-accent">‹ {t("cz.back")}</Link>
      <header>
        <div className="text-[13px] text-muted">{t("type.patta")}</div>
        <h1 className="mt-1 text-[28px] font-semibold tabular-nums tracking-tight">{app.refNo}</h1>
        <div className={clsx("mt-1 text-[17px] font-medium", STATUS_TONE[app.status])}>{t(`cz.st.${app.status}` as MessageKey)}</div>
        <div className="mt-1 flex flex-wrap gap-x-4 text-[14px] text-muted">
          {app.status === "draft" ? (
            <span>{t("cz.started", { d: formatDate(app.submittedAt, locale) })}</span>
          ) : (
            <>
              <span>{t("cz.submittedOn", { d: formatDate(app.submittedAt, locale) })}</span>
              {app.status === "pending" && <span>{t("cz.dueBy", { d: formatDate(app.slaDueAt, locale) })}</span>}
            </>
          )}
        </div>
      </header>

      {lastDecision && app.status !== "pending" && (
        <section className={clsx("rounded-2xl px-5 py-4", app.status === "approved" ? "bg-green-soft" : app.status === "returned" ? "bg-amber-soft" : "bg-red-soft")}>
          <div className="text-[13px] text-muted">{t("cz.remarks")} · {formatDateTime(lastDecision.createdAt, locale)}</div>
          <p className="mt-1 whitespace-pre-line text-[16px] leading-relaxed">{lastDecision.reason || "—"}</p>
          {app.status === "returned" && <p className="mt-2 text-[14px] text-muted">{t("cz.fixHint")}</p>}
        </section>
      )}

      <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
        <h2 className="mb-3 text-[17px] font-semibold">{t("cz.details")}</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[15px] sm:grid-cols-3">
          {[
            [t("cz.village"), locale === "ta" ? app.villageTa : app.village],
            [t("cz.deed"), p.saleDeedNo],
            [t("cz.survey"), p.surveyNo],
            [t("cz.seller"), p.seller],
            [t("cz.buyer"), p.buyer],
            [t("cz.extent"), String(p.extentCents)],
          ].map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-[13px] text-muted">{k}</dt>
              <dd className="truncate font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {editable && (
        <KitDownloads
          showPaid={app.status === "returned"}
          labels={{ kits: t("cz.kits"), hint: t("cz.kitsHint"), kitA: t("cz.kitA"), kitB: t("cz.kitB"), kitBPaid: t("cz.kitBPaid"), download: t("cz.download") }}
        />
      )}

      <DocSlots
        applicationId={id}
        editable={editable}
        slots={ONLINE_REQUIRED.map((k) => {
          const d = latest[k];
          return { kind: k, label: t(`doc.${k}` as MessageKey), file: d ? { id: d.id, name: d.fileName, when: formatDateTime(d.uploadedAt, locale) } : null };
        })}
        labels={{
          title: t("cz.docs"), hint: t("cz.docsHint"), upload: t("cz.upload"), replace: t("cz.replace"), uploading: t("cz.uploading"),
          uploaded: t("cz.uploaded"), none: t("cz.notUploaded"), view: t("cz.view"), size: t("docs.size"), type: t("docs.type"), error: t("docs.error"),
        }}
      />

      {editable && (
        <SubmitBar
          applicationId={id}
          mode={app.status === "draft" ? "submit" : "resubmit"}
          ready={ONLINE_REQUIRED.every((k) => latest[k])}
          labels={{ submit: t("cz.submit"), resubmit: t("cz.resubmit"), submitting: t("cz.submitting"), needAll: t("cz.needAll"), note: t("cz.note"), error: t("docs.error") }}
        />
      )}
    </div>
  );
}
