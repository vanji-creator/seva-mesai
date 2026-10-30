import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { aiAnalyses, applications, decisions, officers } from "@/db/schema";
import { SLA_DAYS, aresToCents, type DocKind } from "@/db/cases";
import { DecisionBar } from "@/components/DecisionBar";
import { Documents, type DocView } from "@/components/case/Documents";
import { FactTable } from "@/components/case/FactTable";
import { Findings } from "@/components/case/Findings";
import { ReviewCard } from "@/components/case/ReviewCard";
import { CATEGORY, EC_NATURE, byFieldOrder, fieldLabel } from "@/lib/case/labels";
import { docsByKind, evaluateApp, loadDocs, type DocRow } from "@/lib/case/load";
import { samplesFor } from "@/lib/docs/samples";
import { formatDate, formatDateTime, getT, type MessageKey, type T } from "@/lib/i18n";
import { priority } from "@/lib/priority";
import { REQUIRED } from "@/lib/verify/caseCheck";
import type { GrievancePayload, Locale } from "@/lib/types";

// Reading a new document (Classify + Extract) and re-reviewing can take ~20–40 s; server actions share this limit.
export const maxDuration = 60;

const KNOWN = new Set(["application_form", "sale_deed", "patta", "ec", "tax_receipt", "id_proof", "petition", "ration_card"]);

function docView(d: DocRow, t: T, locale: Locale): DocView {
  const r = d.reading;
  const type = r?.docType ?? null;
  const v = (r?.values ?? {}) as Record<string, unknown>;
  const fields = Object.entries(v)
    .filter(([k, x]) => k !== "entries" && x !== null && x !== "")
    .sort(([a], [b]) => byFieldOrder(a, b))
    .map(([k, x]) => ({
      label: fieldLabel(k, locale),
      value: k === "extentAres" ? `${x} (≈ ${aresToCents(Number(x))} ${locale === "ta" ? "சென்ட்" : "cents"})` : typeof x === "number" ? x.toLocaleString("en-IN") : String(x),
    }));
  const entries = Array.isArray(v.entries)
    ? (v.entries as Record<string, string | null>[]).map((e) => ({
        date: e.date ?? "", nature: EC_NATURE[e.nature ?? "other"]?.[locale] ?? e.nature ?? "", docNo: e.docNo ?? "", parties: e.parties ?? "", detail: e.detail ?? "",
      }))
    : [];
  const href = d.url ?? `/files/${d.id}`;
  return {
    id: d.id,
    label: d.kind === "other" ? t((type && KNOWN.has(type) ? `doc.${type}` : "doc.other") as MessageKey) : t(`doc.${d.kind}` as MessageKey),
    fileName: d.fileName,
    href,
    preview: d.previewUrl ?? (d.mime.startsWith("image/") ? href : null),
    isPdf: d.mime === "application/pdf",
    byOfficer: d.source === "officer",
    state: d.kind === "other" ? "unrelated" : r && r.engine !== "pending" ? "read" : "notRead",
    docTypeLabel: type ? t((KNOWN.has(type) ? `doc.${type}` : "doc.other") as MessageKey) : null,
    confidence: r?.classifyConfidence ?? null,
    fields,
    entries,
    text: r?.text ?? null,
    textEn: r?.textEn ?? null,
  };
}

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const { t, locale } = await getT();

  const [app] = await db.select().from(applications).where(eq(applications.id, id));
  if (!app) notFound();
  const rows = await loadDocs(id);
  const ev = await evaluateApp(app, rows);
  const [review] = await db.select().from(aiAnalyses).where(and(eq(aiAnalyses.applicationId, id), eq(aiAnalyses.locale, locale))).orderBy(desc(aiAnalyses.id)).limit(1);
  const history = await db
    .select({ d: decisions, o: officers })
    .from(decisions)
    .innerJoin(officers, eq(decisions.officerId, officers.id))
    .where(eq(decisions.applicationId, id))
    .orderBy(desc(decisions.id));

  const pending = app.status === "pending";
  const isPatta = app.type === "patta";
  const p = priority(app);
  const sla = isPatta ? SLA_DAYS.patta : Math.round((app.slaDueAt.getTime() - app.submittedAt.getTime()) / 86_400_000);
  const dueText = p.daysLeft < 0 ? t("due.overdue", { n: -p.daysLeft }) : p.daysLeft === 0 ? t("due.today") : t("due.leftLong", { n: p.daysLeft });
  const { byKind } = docsByKind(rows);
  const missing = isPatta ? REQUIRED.filter((k) => !byKind[k]).map((k) => t(`doc.${k}` as MessageKey)) : [];
  const samples = samplesFor(app.refNo)
    .filter((s) => !(s.id.startsWith("later:") && byKind[s.id.slice(6) as DocKind]))
    .map((s) => ({ id: s.id, label: locale === "ta" ? s.labelTa : s.label }));
  const g = !isPatta ? (app.payload as unknown as GrievancePayload) : null;
  // Only show complaint text that was actually read from the petition (never a stand-in).
  const petitionRead = rows.some((d) => d.kind === "petition" && d.reading?.text);
  const sugLabel = (s: string) => t((s === "approve" && !isPatta ? "sug.approve.grievance" : `sug.${s}`) as MessageKey);

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto w-full max-w-[980px] flex-1 space-y-10 px-6 py-8 lg:px-10">
        <header>
          <Link href="/" className="mb-4 inline-block text-[15px] text-accent lg:hidden">‹ {t("case.back")}</Link>
          <div className="text-[13px] text-muted">{app.refNo} · {t(`type.${app.type}`)}</div>
          <h1 className="mt-1 text-[32px] font-semibold tracking-tight">{locale === "ta" ? app.applicantNameTa : app.applicantName}</h1>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[15px] text-muted">
            <span>{locale === "ta" ? app.villageTa : app.village}</span>
            <span>{t("case.submitted")} {formatDate(app.submittedAt, locale)}</span>
            {pending ? (
              <span className={p.daysLeft < 0 ? "font-medium text-red" : p.daysLeft <= 3 ? "text-amber" : ""}>
                {t("case.due")} {formatDate(app.slaDueAt, locale)} · {dueText}
              </span>
            ) : (
              <span className="font-medium text-fg">{t(`status.${app.status}`)}</span>
            )}
            <span className="text-faint">{t("case.sla", { n: sla })}</span>
          </div>
        </header>

        <ReviewCard
          applicationId={id}
          review={review ? {
            summary: review.summary, suggestion: review.suggestion, suggestionLabel: sugLabel(review.suggestion), reasons: review.reasons,
            draftReply: review.draftReply, source: review.source, when: formatDateTime(review.createdAt, locale), model: review.model,
          } : null}
          labels={{
            title: t("review.title"), note: t("review.note"), recheck: t("review.recheck"), rechecking: t("review.rechecking"), ran: t("review.ran"),
            offline: t("review.offline"), notRun: t("review.notRun"), run: t("review.run"), reasons: t("review.reasons"), draft: t("review.draft"),
          }}
        />

        <Findings findings={ev.findings} locale={locale} title={t("checks.title")} passedLabel={t("checks.passed")} />

        {ev.kind === "patta" && <FactTable rows={ev.rows} locale={locale} title={t("facts.title")} note={t("facts.note")} />}

        {g && ev.kind === "grievance" && (
          <section className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-2 text-[13px] text-muted">{t("grv.text")}</div>
              <p className="whitespace-pre-line rounded-2xl bg-side p-4 text-[15.5px] leading-relaxed">{petitionRead ? g.text : <span className="text-amber">{t("docs.notRead")}</span>}</p>
            </div>
            <div>
              <div className="mb-2 text-[13px] text-muted">{t("grv.translation")}</div>
              <p className="whitespace-pre-line rounded-2xl bg-side p-4 text-[15.5px] leading-relaxed">{petitionRead && g.textEn ? g.textEn : "—"}</p>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[15px] sm:col-span-2 sm:grid-cols-4">
              {[
                [t("grv.category"), CATEGORY[ev.cls.category]?.[locale] ?? ev.cls.category],
                [t("grv.department"), ev.cls.department[locale]],
                [t("grv.urgency"), t(`grv.u${ev.cls.urgency}` as MessageKey)],
                [t("grv.location"), g.location || t("grv.noLocation")],
              ].map(([k, val]) => (
                <div key={k}>
                  <dt className="text-[13px] text-muted">{k}</dt>
                  <dd className="font-medium">{val}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <Documents
          applicationId={id}
          docs={rows.map((d) => docView(d, t, locale))}
          missing={missing}
          samples={samples}
          canEdit={pending}
          labels={{
            title: t("docs.title"), add: t("docs.add"), reading: t("docs.reading"), read: t("docs.read"), notRead: t("docs.notRead"),
            reread: t("docs.reread"), open: t("docs.open"), whatRead: t("docs.whatRead"), confidence: t("docs.confidence"),
            officer: t("docs.officer"), citizen: t("docs.citizen"), unrelated: t("docs.unrelated"), missing: t("docs.missing"),
            hint: t("docs.hint"), samples: t("docs.samples"), choose: t("docs.choose"), error: t("docs.error"), size: t("docs.size"),
            type: t("docs.type"), close: t("docs.close"), entries: t("docs.entries"), typeLabel: t("docs.type.label"), translation: t("grv.translation"),
          }}
        />

        {history.length > 0 && (
          <section>
            <h2 className="mb-3 text-[17px] font-semibold">{t("history.title")}</h2>
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {history.map(({ d, o }) => (
                <li key={d.id} className="px-4 py-3 text-[15px]">
                  <span className="font-medium">{t(`status.${d.action}`)}</span>
                  <span className="text-muted"> · {locale === "ta" ? o.nameTa : o.name} · {formatDateTime(d.createdAt, locale)}</span>
                  {d.reason && <p className="mt-1 text-muted">{d.reason}</p>}
                  {d.followedAi !== null && <p className="mt-1 text-[13px] text-faint">{d.followedAi ? t("act.followed") : t("act.differed")}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {pending && (
        <DecisionBar
          applicationId={id}
          suggested={review?.suggestion ?? null}
          labels={{
            yours: t("act.yours"), approve: isPatta ? t("act.approve") : t("act.approve.grievance"), return: t("act.return"), reject: t("act.reject"),
            reason: t("act.reason"), required: t("act.required"), confirm: t("act.confirm"), cancel: t("act.cancel"), suggested: t("act.suggested"),
          }}
        />
      )}
    </div>
  );
}
