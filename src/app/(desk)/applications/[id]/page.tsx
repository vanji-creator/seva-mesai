import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { aiAnalyses, applications, decisions, documents, officers } from "@/db/schema";
import { AiPanel, type AiView } from "@/components/AiPanel";
import { Compare, type CompareRow } from "@/components/Compare";
import { DecisionBar } from "@/components/DecisionBar";
import { DeedUpload } from "@/components/DeedUpload";
import { samplesFor } from "@/lib/docs/samples";
import { PriorityChip } from "@/components/PriorityChip";
import { fetchEvidence } from "@/lib/registry/client";
import { getT, type MessageKey } from "@/lib/i18n";
import { priority } from "@/lib/priority";
import { romanKey, similarity } from "@/lib/verify/fuzzy";
import { isTamil } from "@/lib/docs/deed";
import type { GrievancePayload, PattaPayload } from "@/lib/types";

const DOC_TYPE_KEY: Record<string, MessageKey> = { sale_deed: "doc.sale_deed", tax_receipt: "doc.tax_receipt", ration_card: "doc.ration_card" };

// Reading a deed (Classify + Extract + AI) takes ~15–25 s; the server actions on this page share its limit.
export const maxDuration = 60;

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const { t, locale } = await getT();

  const [app] = await db.select().from(applications).where(eq(applications.id, id));
  if (!app) notFound();
  const docs = await db.select().from(documents).where(eq(documents.applicationId, id));
  // Analyses are written in one language; show the one for the current language (the panel runs one if missing).
  const [latest] = await db
    .select()
    .from(aiAnalyses)
    .where(and(eq(aiAnalyses.applicationId, id), eq(aiAnalyses.locale, locale)))
    .orderBy(desc(aiAnalyses.id))
    .limit(1);
  const history = await db
    .select({ d: decisions, o: officers })
    .from(decisions)
    .innerJoin(officers, eq(decisions.officerId, officers.id))
    .where(eq(decisions.applicationId, id))
    .orderBy(desc(decisions.id));

  const p = priority(app);
  const isPatta = app.type === "patta";
  let rows: CompareRow[] = [];
  const reading = docs.find((d) => d.kind === "sale_deed")?.reading ?? null;
  const dv = reading?.values ?? null;
  if (isPatta) {
    const pl = app.payload as unknown as PattaPayload;
    const ev = await fetchEvidence(pl);
    const roman = reading?.roman ?? {};
    // Same rule as verifyDeedDocument: Roman-letter deed names are compared via sound-alike keys,
    // everything else as written (the registry column is Tamil vs Tamil).
    const diff = (a: string, b?: string | null) =>
      !!b && (roman[a] && !isTamil(b) ? similarity(romanKey(roman[a]), romanKey(b)) : similarity(a, b)) < 0.9;
    rows = [
      { label: t("field.deed"), applied: pl.saleDeedNo, registry: ev.deed ? pl.saleDeedNo : null, bad: !ev.deed, doc: dv?.deedNo, docBad: !!dv?.deedNo && dv.deedNo !== pl.saleDeedNo },
      { label: t("field.seller"), applied: pl.seller, registry: ev.deed?.seller ?? null, bad: diff(pl.seller, ev.deed?.seller), doc: dv?.seller, docBad: diff(pl.seller, dv?.seller) },
      { label: t("field.buyer"), applied: pl.buyer, registry: ev.deed?.buyer ?? null, bad: diff(pl.buyer, ev.deed?.buyer), doc: dv?.buyer, docBad: diff(pl.buyer, dv?.buyer) },
      { label: t("field.survey"), applied: pl.surveyNo, registry: ev.deed?.surveyNo ?? null, bad: !!ev.deed && ev.deed.surveyNo !== pl.surveyNo, doc: dv?.surveyNo, docBad: !!dv?.surveyNo && dv.surveyNo !== pl.surveyNo },
      { label: t("field.extent"), applied: pl.extentCents, registry: ev.deed?.extentCents ?? null, bad: !!ev.deed && Math.abs(ev.deed.extentCents - pl.extentCents) / ev.deed.extentCents > 0.02, doc: dv?.extentCents, docBad: dv?.extentCents != null && dv.extentCents !== pl.extentCents },
      { label: t("field.owner"), applied: pl.seller, registry: ev.land?.currentOwner ?? null, bad: !ev.land || diff(pl.seller, ev.land.currentOwner) },
      { label: t("field.tax"), applied: 0, registry: ev.tax ? ev.tax.duesAmount : null, bad: !!ev.tax && ev.tax.duesAmount > 0 },
    ];
  }
  const samples = isPatta ? samplesFor(app.refNo).map((s) => ({ id: s.id, label: locale === "ta" ? s.labelTa : s.label })) : [];
  const uploadLabels = {
    title: t("detail.uploadDeed"), hint: t("detail.uploadHint"), upload: t("detail.upload"), reading: t("detail.reading"),
    useSample: t("detail.useSample"), useSampleBtn: t("detail.useSampleBtn"), error: t("detail.uploadError"),
    size: t("detail.fileTooBig"), type: t("detail.badType"),
  };
  const g = !isPatta ? (app.payload as unknown as GrievancePayload) : null;

  const decisionLabels = {
    approve: t("act.approve"), reject: t("act.reject"), return: t("act.return"), reason: t("act.reason"),
    required: t("act.reason.required"), confirm: t("act.confirm"), cancel: t("act.cancel"),
  };
  const view: AiView | null = latest
    ? { summary: latest.summary, findings: latest.findings, suggestion: latest.suggestion, reasons: latest.reasons, draftReply: latest.draftReply, source: latest.source }
    : null;
  const pending = app.status === "pending";

  return (
    <div className="flex flex-col gap-6">
      <Link href="/" className="text-brand hover:underline">{t("detail.back")}</Link>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{locale === "ta" ? app.applicantNameTa : app.applicantName}</h1>
        <span className="font-mono text-muted">{app.refNo}</span>
        <span className="rounded-full bg-bg px-3 py-0.5 text-sm">{t(`type.${app.type}`)}</span>
        {pending ? <PriorityChip band={p.band} label={t(`desk.${p.band}`)} /> : <span className="rounded-full bg-bg px-3 py-0.5 text-sm font-semibold">{t(`status.${app.status}`)}</span>}
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        {/* min-w-0: let the column shrink so wide tables scroll inside their box on phones */}
        <div className="flex min-w-0 flex-col gap-6">
          {isPatta ? (
            <>
              <section>
                <h2 className="mb-2 text-lg font-bold">{t("detail.evidence")}</h2>
                <Compare rows={rows} applied={t("detail.applied")} registry={t("detail.registry")} doc={dv ? t("detail.onDocument") : undefined} />
                {reading && (
                  <p className="mt-2 text-sm text-muted">
                    {t("detail.docRead")}: {reading.fileName} · {t("detail.docType")}:{" "}
                    {reading.docType ? (DOC_TYPE_KEY[reading.docType] ? t(DOC_TYPE_KEY[reading.docType]) : reading.docType) : "—"}
                    {reading.classifyConfidence !== null && ` (${Math.round(reading.classifyConfidence * 100)}%)`}
                    {(reading.reviewRequired || (reading.minConfidence ?? 1) < 0.8) && <span className="ml-2 font-semibold text-attention">⚠ {t("detail.lowConf")}</span>}
                  </p>
                )}
              </section>
              {pending && <DeedUpload applicationId={id} samples={samples} labels={uploadLabels} />}
              <section>
                <h2 className="mb-2 text-lg font-bold">{t("detail.documents")}</h2>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {docs.map((d) => (
                    <li key={d.id} className={`flex justify-between rounded-lg border px-4 py-2 ${d.present ? "border-line bg-card" : "border-red-200 bg-red-50 text-urgent"}`}>
                      <span>{t(`doc.${d.kind}` as MessageKey)}</span>
                      <span className="font-semibold">{d.present ? `✓ ${t("detail.present")}` : `✕ ${t("detail.missing")}`}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          ) : (
            g && (
              <section className="rounded-2xl border border-line bg-card p-5">
                <h2 className="mb-2 text-lg font-bold">{t("detail.complaint")}</h2>
                <p className="text-lg">{locale === "ta" ? g.text : g.textEn}</p>
                <p className="mt-3 text-muted">{t("detail.location")}: {g.location || "—"}</p>
              </section>
            )
          )}

          {history.length > 0 && (
            <section>
              <h2 className="mb-2 text-lg font-bold">{t("detail.history")}</h2>
              <ul className="flex flex-col gap-2">
                {history.map(({ d, o }) => (
                  <li key={d.id} className="rounded-lg border border-line bg-card p-3">
                    <span className="font-semibold">{t(`status.${d.action}`)}</span> · {locale === "ta" ? o.nameTa : o.name} · {d.createdAt.toLocaleString(locale === "ta" ? "ta-IN" : "en-IN")}
                    {d.reason && <p className="text-muted">{d.reason}</p>}
                    {d.followedAi !== null && <p className="text-sm text-muted">{d.followedAi ? t("act.followed") : t("act.differed")}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <AiPanel applicationId={id} analysis={view} locale={locale} canRun={pending} labels={aiLabels(t)} />
      </div>

      {pending && <DecisionBar applicationId={id} labels={decisionLabels} approveLabel={isPatta ? t("act.approve") : t("act.approve.grievance")} />}
    </div>
  );
}

function aiLabels(t: (k: MessageKey) => string) {
  return {
    title: t("ai.title"), note: t("ai.note"), run: t("ai.run"), rerun: t("ai.rerun"), summary: t("ai.summary"),
    findings: t("ai.findings"), suggestion: t("ai.suggestion"), draft: t("ai.draft"), offline: t("ai.offline"),
    "ai.source.llm": t("ai.source.llm"), "ai.source.rules": t("ai.source.rules"),
    "sev.blocker": t("sev.blocker"), "sev.warning": t("sev.warning"), "sev.ok": t("sev.ok"),
    "sug.approve": t("sug.approve"), "sug.reject": t("sug.reject"), "sug.return": t("sug.return"),
  };
}
