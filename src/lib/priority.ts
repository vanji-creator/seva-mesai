export type Band = "urgent" | "attention" | "normal";

export interface PriorityInput {
  slaDueAt: Date;
  submittedAt: Date;
  blockers: number;
  warnings: number;
  urgency: number;
  now?: Date;
}

const DAY = 86_400_000;

/**
 * Transparent additive score so an officer (and a reviewer) can see *why* a
 * file is on top. SLA dominates; flags and urgency break ties.
 */
export function priority(i: PriorityInput): { score: number; band: Band; daysLeft: number } {
  const now = i.now ?? new Date();
  const daysLeft = Math.ceil((i.slaDueAt.getTime() - now.getTime()) / DAY);
  const ageDays = Math.max(0, (now.getTime() - i.submittedAt.getTime()) / DAY);

  let score = 0;
  if (daysLeft < 0) score += 60 + Math.min(30, -daysLeft * 5);
  else if (daysLeft <= 3) score += 40;
  else if (daysLeft <= 7) score += 20;
  score += Math.min(15, Math.floor(ageDays));
  score += i.blockers * 6 + i.warnings * 2;
  score += (i.urgency - 1) * 15;

  const band: Band = score >= 60 ? "urgent" : score >= 30 ? "attention" : "normal";
  return { score, band, daysLeft };
}
