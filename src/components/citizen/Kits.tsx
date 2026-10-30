export const STATUS_TONE = { draft: "text-muted", pending: "text-accent", approved: "text-green", returned: "text-amber", rejected: "text-red" } as const;

/**
 * Demo only: where the presenter gets files to upload as the citizen. Plain downloads — the files then go
 * through the same upload as anything from the citizen's own phone or computer.
 */
export function KitDownloads({ labels, showPaid }: { labels: Record<"kits" | "hint" | "kitA" | "kitB" | "kitBPaid" | "download", string>; showPaid?: boolean }) {
  const items = showPaid
    ? [{ href: "/demo-kits/kit-b-tax-receipt-paid.png", label: labels.kitBPaid }]
    : [{ href: "/demo-kits/kit-a.zip", label: labels.kitA }, { href: "/demo-kits/kit-b.zip", label: labels.kitB }];
  return (
    <aside className="rounded-2xl border border-dashed border-line-strong bg-white/60 px-5 py-4 text-[14px]">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="font-medium">{labels.kits}</span>
        <span className="text-xs text-faint">{labels.hint}</span>
      </div>
      <ul className="space-y-1.5">
        {items.map((i) => (
          <li key={i.href} className="flex items-center justify-between gap-3">
            <span className="min-w-0 text-muted">{i.label}</span>
            <a href={i.href} download className="shrink-0 rounded-full bg-black/[0.05] px-3 py-1 text-[13px] font-medium transition hover:bg-black/[0.09] active:bg-black/[0.13]">
              {labels.download}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
