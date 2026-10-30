"use client";
import { setLocaleAction } from "@/app/actions";
import type { Locale } from "@/lib/types";

export function LangToggle({ locale, label }: { locale: Locale; label: string }) {
  return (
    <button
      onClick={() => setLocaleAction(locale === "ta" ? "en" : "ta")}
      className="rounded-full px-3 py-1 text-[13px] font-medium text-accent hover:bg-accent-soft"
    >
      {label}
    </button>
  );
}
