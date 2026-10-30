"use client";
import { useActionState } from "react";
import { loginAction } from "@/app/actions";

export function LoginForm({ labels }: { labels: Record<"title" | "user" | "pass" | "submit" | "error", string> }) {
  const [state, action, pending] = useActionState(loginAction, null);
  const input = "w-full bg-transparent px-4 py-3 text-[16px] outline-none placeholder:text-faint";
  return (
    <form action={action} className="space-y-4">
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line-strong bg-white">
        <input name="username" autoComplete="username" required placeholder={labels.user} aria-label={labels.user} className={input} />
        <input name="password" type="password" autoComplete="current-password" required placeholder={labels.pass} aria-label={labels.pass} className={input} />
      </div>
      {state?.error && <p role="alert" className="text-center text-[14px] text-red">{labels.error}</p>}
      <button disabled={pending} className="w-full rounded-2xl bg-accent py-3 text-[16px] font-medium text-white disabled:opacity-60">{labels.submit}</button>
    </form>
  );
}
