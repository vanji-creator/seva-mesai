"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, like } from "drizzle-orm";
import { db } from "@/db/client";
import { applications, decisions, documents } from "@/db/schema";
import { SLA_DAYS, VILLAGES, type DocKind } from "@/db/cases";
import { requireCitizen } from "@/lib/auth";
import { finishIntake, readCitizenDoc } from "@/lib/case/intake";
import { ONLINE_REQUIRED } from "@/lib/verify/caseCheck";
import type { PattaPayload } from "@/lib/types";

const DAY = 86_400_000;
const MAX_UPLOAD = 4 * 1024 * 1024; // Vercel function request bodies are capped at ~4.5 MB
const ALLOWED = new Set(["application/pdf", "image/png", "image/jpeg"]);

async function ownApplication(id: number) {
  const citizen = await requireCitizen();
  const [app] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.citizenId, citizen.id)));
  return app ?? null;
}

/** Next reference number of the form PT-2026-0209. */
async function nextRef() {
  const year = new Date().getFullYear();
  const rows = await db.select({ refNo: applications.refNo }).from(applications).where(like(applications.refNo, `PT-${year}-%`));
  const n = Math.max(200, ...rows.map((r) => Number(r.refNo.slice(-4)) || 0)) + 1;
  return `PT-${year}-${String(n).padStart(4, "0")}`;
}

/** Step 1: the land details. Creates a draft only the citizen sees, then on to the documents. */
export async function startApplicationAction(_: unknown, form: FormData) {
  const citizen = await requireCitizen();
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const village = get("village") as keyof typeof VILLAGES;
  const extent = Number(get("extent"));
  const payload: PattaPayload = {
    seller: get("seller"), buyer: get("buyer"), surveyNo: get("survey").replace(/\s+/g, ""),
    extentCents: extent, saleDeedNo: get("deed").replace(/\s+/g, ""), taxReceiptNo: "", channel: "online",
  };
  if (!VILLAGES[village] || !payload.seller || !payload.buyer || !payload.surveyNo || !payload.saleDeedNo || !(extent > 0)) return { error: true };

  const now = new Date();
  const [row] = await db.insert(applications).values({
    refNo: await nextRef(), type: "patta", status: "draft", citizenId: citizen.id,
    applicantName: citizen.name, applicantNameTa: citizen.nameTa, village, villageTa: VILLAGES[village],
    // Replaced on submit; a draft has no deadline yet.
    submittedAt: now, slaDueAt: new Date(now.getTime() + SLA_DAYS.patta * DAY),
    payload: payload as unknown as Record<string, unknown>,
  }).returning({ id: applications.id });
  redirect(`/my/${row.id}`);
}

/**
 * Step 2: one file per slot. Stored straight away; Sarvam reads it after the response is sent, so the
 * citizen only ever sees "uploaded". A new file in the same slot replaces the old one.
 */
export async function uploadSlotAction(applicationId: number, slot: DocKind, form: FormData) {
  const app = await ownApplication(applicationId);
  if (!app || (app.status !== "draft" && app.status !== "returned")) return { error: "closed" as const };
  if (!ONLINE_REQUIRED.includes(slot)) return { error: "type" as const };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "type" as const };
  if (file.size > MAX_UPLOAD) return { error: "size" as const };
  if (!ALLOWED.has(file.type)) return { error: "type" as const };

  const [doc] = await db.insert(documents).values({
    applicationId, kind: slot, slot, fileName: file.name, mime: file.type,
    data: Buffer.from(await file.arrayBuffer()), source: "citizen", reading: null,
  }).returning({ id: documents.id });
  after(() => readCitizenDoc(doc.id));
  revalidatePath(`/my/${applicationId}`);
  return { ok: true as const };
}

async function slotsFilled(applicationId: number) {
  const rows = await db.select({ slot: documents.slot }).from(documents).where(and(eq(documents.applicationId, applicationId), inArray(documents.slot, ONLINE_REQUIRED)));
  return ONLINE_REQUIRED.every((k) => rows.some((r) => r.slot === k));
}

/** Step 3: send it to the Tahsildar. Checks and the AI review run in the background before anyone opens it. */
export async function submitApplicationAction(applicationId: number) {
  const app = await ownApplication(applicationId);
  if (!app || app.status !== "draft") return { error: "closed" as const };
  if (!(await slotsFilled(applicationId))) return { error: "missing" as const };
  const now = new Date();
  await db.update(applications)
    .set({ status: "pending", submittedAt: now, slaDueAt: new Date(now.getTime() + SLA_DAYS.patta * DAY) })
    .where(and(eq(applications.id, applicationId), eq(applications.status, "draft")));
  after(() => finishIntake(applicationId));
  revalidatePath("/", "layout");
  return { ok: true as const };
}

/** After a return: the citizen replaced what was asked for and sends it back. It reaches the officer as "reopened". */
export async function resubmitAction(applicationId: number, note: string) {
  const app = await ownApplication(applicationId);
  if (!app || app.status !== "returned") return { error: "closed" as const };
  const updated = await db.update(applications).set({ status: "pending" })
    .where(and(eq(applications.id, applicationId), eq(applications.status, "returned")))
    .returning({ id: applications.id });
  if (!updated.length) return { error: "closed" as const };
  await db.insert(decisions).values({ applicationId, officerId: null, action: "resubmitted", reason: note.trim() || null });
  after(() => finishIntake(applicationId));
  revalidatePath("/", "layout");
  return { ok: true as const };
}
