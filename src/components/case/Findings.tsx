import clsx from "clsx";
import type { Finding, Locale } from "@/lib/types";

/** Problems first, in plain sentences. Passed checks collapse into one quiet line. */
export function Findings({ findings, locale, title, passedLabel }: { findings: Finding[]; locale: Locale; title: string; passedLabel: string }) {
  const issues = findings.filter((f) => f.severity !== "ok");
  return (
    <section>
      <h2 className="mb-3 text-[17px] font-semibold">{title}</h2>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
        {issues.map((f, i) => (
          <li key={i} className="flex gap-3 px-4 py-3 text-[15px]">
            <span className={clsx("mt-[7px] h-2 w-2 shrink-0 rounded-full", f.severity === "blocker" ? "bg-red" : "bg-amber")} />
            <span>{locale === "ta" ? f.ta : f.en}</span>
          </li>
        ))}
        <li className="flex gap-3 px-4 py-3 text-[15px] text-muted">
          <span className="mt-[7px] h-2 w-2 shrink-0 rounded-full bg-green" />
          {issues.length ? passedLabel : locale === "ta" ? findings[0]?.ta : findings[0]?.en}
        </li>
      </ul>
    </section>
  );
}
