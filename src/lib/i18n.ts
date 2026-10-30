import { cookies } from "next/headers";
import ta from "../../messages/ta.json";
import en from "../../messages/en.json";
import type { Locale } from "./types";

const dict = { ta, en } as const;
export type MessageKey = keyof typeof ta;

/** Tamil is the default; the choice is a cookie so URLs stay clean and shareable. */
export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get("locale")?.value;
  return v === "en" ? "en" : "ta";
}

export function makeT(locale: Locale) {
  return (key: MessageKey, vars?: Record<string, string | number>) => {
    let s: string = dict[locale][key] ?? dict.ta[key] ?? key;
    for (const [k, v] of Object.entries(vars ?? {})) s = s.replace(`{${k}}`, String(v));
    return s;
  };
}
export type T = ReturnType<typeof makeT>;

export async function getT() {
  const locale = await getLocale();
  return { locale, t: makeT(locale) };
}

/** Officers are in Tamil Nadu: always show IST, whatever region the server runs in. */
export function formatDateTime(d: Date | string, locale: Locale): string {
  return new Date(d).toLocaleString(locale === "ta" ? "ta-IN" : "en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
}

export function formatDate(d: Date | string, locale: Locale): string {
  return new Date(d).toLocaleDateString(locale === "ta" ? "ta-IN" : "en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
}
