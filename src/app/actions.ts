"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { aiAnalyses, applications, decisions, documents } from "@/db/schema";
import { login, logout, requireOfficer } from "@/lib/auth";
import { getLocale } from "@/lib/i18n";
import { analyze, pattaChecks } from "@/lib/ai/analyze";
import { readDeed, type DeedReading } from "@/lib/docs/deed";
import { loadSample } from "@/lib/docs/samples";
import { fetchEvidence } from "@/lib/registry/client";
import type { DocFile } from "@/lib/sarvam/client";
import type { PattaPayload, Suggestion } from "@/lib/types";

export async function loginAction(_: unknown, form: FormData) {
  const ok = await login(String(form.get("username") ?? ""), String(form.get("password") ?? ""));
  if (!ok) return { error: true };
  redirect("/");
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}

export async function setLocaleAction(locale: "ta" | "en") {
  (await cookies()).set("locale", locale, { path: "/", maxAge: 365 * 86400 });
  revalidatePath("/", "layout");
}

export async function runAnalysisAction(applicationId: number) {
  await requireOfficer();
  const [app] = await db.select().from(applications).where(eq(applications.id, applicationId));
  if (app?.type === "patta") {
    // Keep the queue's issue counts in step with the checks the officer is looking at.
    const checks = await pattaChecks(app);
    await db.update(applications).set({ blockers: checks.blockers, warnings: checks.warnings }).where(eq(applications.id, applicationId));
  }
  await saveAnalysis(applicationId);
  revalidatePath("/");
  revalidatePath(`/applications/${applicationId}`);
}

async function saveAnalysis(applicationId: number) {
  const locale = await getLocale();
  const [app] = await db.select().from(applications).where(eq(applications.id, applicationId));
  if (!app) return;
  const a = await analyze(app, locale);
  await db.insert(aiAnalyses).values({
    applicationId,
    locale,
    summary: a.summary,
    findings: a.findings,
    suggestion: a.suggestion,
    reasons: a.reasons,
    draftReply: a.draftReply,
    source: a.source,
    model: a.model,
  });
}

const MAX_UPLOAD = 4 * 1024 * 1024; // Vercel function request bodies are capped at ~4.5 MB
const ALLOWED = new Set(["application/pdf", "image/png", "image/jpeg"]);

/**
 * Officer uploads (or picks a sample of) the sale deed. Classify -> Extract via Sarvam,
 * store only the reading (not the file), refresh the intake counts and the AI analysis.
 */
export async function readDeedAction(applicationId: number, form: FormData) {
  await requireOfficer();
  const [app] = await db.select().from(applications).where(eq(applications.id, applicationId));
  if (!app || app.type !== "patta" || app.status !== "pending") return { error: "closed" as const };

  let file: DocFile | null = null;
  const sample = form.get("sample");
  const upload = form.get("file");
  if (typeof sample === "string" && sample) {
    file = loadSample(app.refNo, sample);
  } else if (upload instanceof File && upload.size > 0) {
    if (upload.size > MAX_UPLOAD) return { error: "size" as const };
    if (!ALLOWED.has(upload.type)) return { error: "type" as const };
    file = { name: upload.name, mime: upload.type, data: new Uint8Array(await upload.arrayBuffer()) };
  }
  if (!file) return { error: "type" as const };

  const payload = app.payload as unknown as PattaPayload;
  const evidence = await fetchEvidence(payload);
  let reading: DeedReading;
  try {
    reading = await readDeed(file, [payload.seller, payload.buyer, evidence.deed?.seller ?? "", evidence.deed?.buyer ?? ""]);
  } catch (e) {
    console.error("deed reading failed", e);
    return { error: "read" as const };
  }

  await db
    .update(documents)
    // A wrong document doesn't count as the deed being attached; a real deed does.
    .set(reading.docType === "sale_deed" ? { reading, present: true } : { reading })
    .where(and(eq(documents.applicationId, applicationId), eq(documents.kind, "sale_deed")));
  const checks = await pattaChecks(app);
  await db.update(applications).set({ blockers: checks.blockers, warnings: checks.warnings }).where(eq(applications.id, applicationId));
  await saveAnalysis(applicationId);
  revalidatePath("/");
  revalidatePath(`/applications/${applicationId}`);
  return { ok: true as const };
}

const TO_SUGGESTION = { approved: "approve", rejected: "reject", returned: "return" } as const;

export async function decideAction(applicationId: number, action: "approved" | "rejected" | "returned", reason: string) {
  const officer = await requireOfficer();
  const text = reason.trim();
  // Server-side rule, not just UI: rejecting or returning needs a written reason.
  if (action !== "approved" && text.length < 3) return { error: "reason" as const };

  const [latest] = await db
    .select()
    .from(aiAnalyses)
    .where(eq(aiAnalyses.applicationId, applicationId))
    .orderBy(desc(aiAnalyses.id))
    .limit(1);
  const ai: Suggestion | null = latest?.suggestion ?? null;

  const updated = await db
    .update(applications)
    .set({ status: action })
    .where(and(eq(applications.id, applicationId), eq(applications.status, "pending")))
    .returning({ id: applications.id });
  if (!updated.length) return { error: "closed" as const };

  await db.insert(decisions).values({
    applicationId,
    officerId: officer.id,
    action,
    reason: text || null,
    aiSuggestion: ai,
    followedAi: ai ? ai === TO_SUGGESTION[action] : null,
  });
  revalidatePath("/");
  revalidatePath(`/applications/${applicationId}`);
  return { ok: true as const };
}
