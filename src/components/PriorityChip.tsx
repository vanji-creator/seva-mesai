import clsx from "clsx";
import type { Band } from "@/lib/priority";

const STYLE: Record<Band, string> = {
  urgent: "bg-red-50 text-urgent border-red-200",
  attention: "bg-amber-50 text-attention border-amber-200",
  normal: "bg-emerald-50 text-ok border-emerald-200",
};
const DOT: Record<Band, string> = { urgent: "●●●", attention: "●●○", normal: "●○○" };

/** Colour + dots + text: never colour alone. */
export function PriorityChip({ band, label }: { band: Band; label: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-sm font-semibold", STYLE[band])}>
      <span aria-hidden className="text-[10px] tracking-tighter">{DOT[band]}</span>
      {label}
    </span>
  );
}
