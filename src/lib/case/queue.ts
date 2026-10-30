import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { aiAnalyses, applications, decisions } from "@/db/schema";
import { priority, type Band } from "@/lib/priority";
import type { Locale } from "@/lib/types";

/** Pending = never decided; reopened = decided, then sent back to the desk; completed = decided. */
export type Stage = "pending" | "reopened" | "completed";

export interface QueueItem {
  id: number;
  refNo: string;
  type: "patta" | "grievance";
  name: string;
  village: string;
  stage: Stage;
  status: "pending" | "approved" | "rejected" | "returned";
  band: Band;
  daysLeft: number;
  /** When the last decision was made (completed cases), for ordering and display. */
  decidedAt: Date | null;
  /** One line: the most important finding from the stored review, or null if nothing is wrong. */
  headline: string | null;
}

/**
 * Every case, split into the officer's three lists. Open cases are ordered most urgent first; priority
 * is recomputed on every request from stored facts (deadline, age, issues, grievance urgency) — no
 * background job, so it is always current. Completed cases are ordered most recently decided first.
 */
export async function getQueue(locale: Locale): Promise<QueueItem[]> {
  const apps = await db.select().from(applications);
  if (!apps.length) return [];
  const ids = apps.map((a) => a.id);
  const reviews = await db
    .select({ applicationId: aiAnalyses.applicationId, findings: aiAnalyses.findings })
    .from(aiAnalyses)
    .where(and(inArray(aiAnalyses.applicationId, ids), eq(aiAnalyses.locale, locale)))
    .orderBy(desc(aiAnalyses.id));
  const latest = new Map<number, (typeof reviews)[number]["findings"]>();
  for (const r of reviews) if (!latest.has(r.applicationId)) latest.set(r.applicationId, r.findings);
  const acts = await db
    .select({ applicationId: decisions.applicationId, createdAt: decisions.createdAt })
    .from(decisions)
    .where(inArray(decisions.applicationId, ids))
    .orderBy(desc(decisions.id));
  const lastAct = new Map<number, Date>();
  for (const d of acts) if (!lastAct.has(d.applicationId)) lastAct.set(d.applicationId, d.createdAt);

  return apps
    .map((a) => {
      const p = priority(a);
      const top = latest.get(a.id)?.find((f) => f.severity === "blocker") ?? latest.get(a.id)?.find((f) => f.severity === "warning");
      const issues = a.blockers + a.warnings;
      // Never claim "no issues" without evidence: fall back to the stored issue count if there is no review yet.
      const fallback = issues ? (locale === "ta" ? `${issues} குறை(கள்)` : `${issues} issue(s)`) : null;
      const stage: Stage = a.status !== "pending" ? "completed" : lastAct.has(a.id) ? "reopened" : "pending";
      return {
        id: a.id, refNo: a.refNo, type: a.type, stage, status: a.status, band: p.band, daysLeft: p.daysLeft, score: p.score,
        decidedAt: stage === "completed" ? (lastAct.get(a.id) ?? null) : null,
        name: locale === "ta" ? a.applicantNameTa : a.applicantName,
        village: locale === "ta" ? a.villageTa : a.village,
        headline: top ? (locale === "ta" ? top.ta : top.en) : fallback,
      };
    })
    .sort((x, y) =>
      x.stage === "completed" && y.stage === "completed"
        ? (y.decidedAt?.getTime() ?? 0) - (x.decidedAt?.getTime() ?? 0)
        : y.score - x.score,
    );
}
