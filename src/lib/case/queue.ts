import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { aiAnalyses, applications } from "@/db/schema";
import { priority, type Band } from "@/lib/priority";
import type { Locale } from "@/lib/types";

export interface QueueItem {
  id: number;
  refNo: string;
  type: "patta" | "grievance";
  name: string;
  village: string;
  band: Band;
  daysLeft: number;
  /** One line: the most important finding from the stored review, or null if nothing is wrong. */
  headline: string | null;
}

/**
 * The officer's queue, most urgent first. Priority is recomputed on every request from stored
 * facts (deadline, age, issues, grievance urgency) — no background job, so it is always current.
 */
export async function getQueue(locale: Locale): Promise<QueueItem[]> {
  const apps = await db.select().from(applications).where(eq(applications.status, "pending"));
  if (!apps.length) return [];
  const reviews = await db
    .select({ applicationId: aiAnalyses.applicationId, findings: aiAnalyses.findings })
    .from(aiAnalyses)
    .where(and(inArray(aiAnalyses.applicationId, apps.map((a) => a.id)), eq(aiAnalyses.locale, locale)))
    .orderBy(desc(aiAnalyses.id));
  const latest = new Map<number, (typeof reviews)[number]["findings"]>();
  for (const r of reviews) if (!latest.has(r.applicationId)) latest.set(r.applicationId, r.findings);

  return apps
    .map((a) => {
      const p = priority(a);
      const top = latest.get(a.id)?.find((f) => f.severity === "blocker") ?? latest.get(a.id)?.find((f) => f.severity === "warning");
      const issues = a.blockers + a.warnings;
      // Never claim "no issues" without evidence: fall back to the stored issue count if there is no review yet.
      const fallback = issues ? (locale === "ta" ? `${issues} குறை(கள்)` : `${issues} issue(s)`) : null;
      return {
        id: a.id, refNo: a.refNo, type: a.type, band: p.band, daysLeft: p.daysLeft, score: p.score,
        name: locale === "ta" ? a.applicantNameTa : a.applicantName,
        village: locale === "ta" ? a.villageTa : a.village,
        headline: top ? (locale === "ta" ? top.ta : top.en) : fallback,
      };
    })
    .sort((x, y) => y.score - x.score);
}
