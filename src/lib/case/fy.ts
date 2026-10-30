/** Financial year starts in April (2026-27 -> 2026). */
export function fyStart(now = new Date()) {
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}
