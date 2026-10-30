"use client";
import { setLocaleAction } from "@/app/actions";
import type { Locale } from "@/lib/types";

export function LangToggle({ locale, label }: { locale: Locale; label: string }) {
  return (
    <button
      onClick={() => setLocaleAction(locale === "ta" ? "en" : "ta")}
      className="rounded-full border border-line bg-card px-4 py-1.5 text-sm font-medium hover:bg-bg"
    >
      {label}
    </button>
  );
}
