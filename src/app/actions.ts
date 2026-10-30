"use server";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { aiAnalyses, applications, decisions, documents } from "@/db/schema";
import type { DocKind } from "@/db/cases";
import { login, logout, requireOfficer } from "@/lib/auth";
import { recheck } from "@/lib/case/intake";
import { loadDocs } from "@/lib/case/load";
import { readDocument } from "@/lib/docs/read";
import { loadSample } from "@/lib/docs/samples";
import { REQUIRED } from "@/lib/verify/caseCheck";
import type { DocFile } from "@/lib/sarvam/client";
import type { GrievancePayload, PattaPayload, Suggestion } from "@/lib/types";

export async function loginAction(_: unknown, form: FormData) {
  const role = await login(String(form.get("username") ?? ""), String(form.get("password") ?? ""));
  if (!role) return { error: true };
  redirect(role === "citizen" ? "/my" : "/");
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}

export async function setLocaleAction(locale: "ta" | "en") {
  (await cookies()).set("locale", locale, { path: "/", maxAge: 365 * 86400 });
  revalidatePath("/", "layout");
}

export async function recheckAction(applicationId: number) {
  await requireOfficer();
  await recheck(applicationId);
  revalidatePath("/", "layout");
}

const MAX_UPLOAD = 4 * 1024 * 1024; // Vercel function request bodies are capped at ~4.5 MB
const ALLOWED = new Set(["application/pdf", "image/png", "image/jpeg"]);

/** Names the reader may need to romanise for comparison (only used if a document is in English letters). */
function namesFor(app: typeof applications.$inferSelect): string[] {
  if (app.type !== "patta") return [];
  const p = app.payload as unknown as PattaPayload;
  return [p.seller, p.buyer];
}

/**
 * Officer adds a document (upload, or one of the demo samples). Sarvam classifies it — wrong documents
 * are kept but marked as not belonging — reads it, then the case is re-checked and re-reviewed.
 */
export async function uploadDocAction(applicationId: number, form: FormData) {
  await requireOfficer();
  const [app] = await db.select().from(applications).where(eq(applications.id, applicationId));
  if (!app || app.status !== "pending") return { error: "closed" as const };

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

  let reading;
  try {
    reading = await readDocument(file, namesFor(app));
  } catch (e) {
    console.error("document reading failed", e);
    return { error: "read" as const };
  }
  const t = reading.docType;
  const belongs = app.type === "patta" ? REQUIRED.includes(t as DocKind) : t === "petition";
  await db.insert(documents).values({
    applicationId, kind: belongs ? (t as string) : "other", fileName: file.name, mime: file.mime,
    data: Buffer.from(file.data), source: "officer", reading,
  });
  await recheck(applicationId);
  revalidatePath("/", "layout");
  return { ok: true as const, kind: belongs ? t : "other" };
}

/** Read one stored document again (e.g. after a reading problem), then re-check. */
export async function rereadDocAction(docId: number) {
  await requireOfficer();
  const [d] = await db.select().from(documents).where(eq(documents.id, docId));
  if (!d) return { error: "missing" as const };
  const [app] = await db.select().from(applications).where(eq(applications.id, d.applicationId));
  const data = d.data ?? (d.url ? await readFile(path.join(process.cwd(), "public", d.url)) : null);
  if (!data || !app) return { error: "missing" as const };
  try {
    const reading = await readDocument({ name: d.fileName, mime: d.mime, data: new Uint8Array(data) }, namesFor(app));
    await db.update(documents).set({ reading }).where(eq(documents.id, docId));
    if (app.type === "grievance" && reading.text) {
      const p = app.payload as unknown as GrievancePayload;
      await db.update(applications).set({ payload: { ...p, text: reading.text, textEn: reading.textEn ?? p.textEn } as unknown as Record<string, unknown> }).where(eq(applications.id, app.id));
    }
  } catch (e) {
    console.error("document re-read failed", e);
    return { error: "read" as const };
  }
  await recheck(d.applicationId);
  revalidatePath("/", "layout");
  return { ok: true as const };
}

const TO_SUGGESTION = { approved: "approve", rejected: "reject", returned: "return" } as const;

export async function decideAction(applicationId: number, action: "approved" | "rejected" | "returned", reason: string) {
  const officer = await requireOfficer();
  const text = reason.trim();
  // Server-side rule, not just UI: rejecting or returning needs a written reason.
  if (action !== "approved" && text.length < 3) return { error: "reason" as const };

  const [latest] = await db.select().from(aiAnalyses).where(eq(aiAnalyses.applicationId, applicationId)).orderBy(desc(aiAnalyses.id)).limit(1);
  const ai: Suggestion | null = latest?.suggestion ?? null;

  const updated = await db
    .update(applications)
    .set({ status: action })
    .where(and(eq(applications.id, applicationId), eq(applications.status, "pending")))
    .returning({ id: applications.id });
  if (!updated.length) return { error: "closed" as const };

  await db.insert(decisions).values({
    applicationId, officerId: officer.id, action, reason: text || null, aiSuggestion: ai,
    followedAi: ai ? ai === TO_SUGGESTION[action] : null,
  });
  revalidatePath("/", "layout");
  return { ok: true as const };
}

/** Sends a decided case back to the desk. A reason is required, and it is kept in the history. */
export async function reopenAction(applicationId: number, reason: string) {
  const officer = await requireOfficer();
  const text = reason.trim();
  if (text.length < 3) return { error: "reason" as const };
  const updated = await db
    .update(applications)
    .set({ status: "pending" })
    .where(and(eq(applications.id, applicationId), ne(applications.status, "pending")))
    .returning({ id: applications.id });
  if (!updated.length) return { error: "open" as const };
  await db.insert(decisions).values({ applicationId, officerId: officer.id, action: "reopened", reason: text });
  revalidatePath("/", "layout");
  return { ok: true as const };
}

export async function docsFor(applicationId: number) {
  await requireOfficer();
  return loadDocs(applicationId);
}
