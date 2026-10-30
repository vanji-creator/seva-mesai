"use client";
import { useActionState } from "react";
import { loginAction } from "@/app/actions";

export function LoginForm({ labels }: { labels: Record<"title" | "user" | "pass" | "submit" | "error", string> }) {
  const [state, action, pending] = useActionState(loginAction, null);
  const input = "w-full rounded-lg border border-line bg-white px-4 py-3 text-lg";
  return (
    <form action={action} className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-6 shadow-sm">
      <h2 className="text-xl font-semibold">{labels.title}</h2>
      <label className="flex flex-col gap-1">{labels.user}
        <input name="username" autoComplete="username" required className={input} />
      </label>
      <label className="flex flex-col gap-1">{labels.pass}
        <input name="password" type="password" autoComplete="current-password" required className={input} />
      </label>
      {state?.error && <p role="alert" className="text-urgent">{labels.error}</p>}
      <button disabled={pending} className="rounded-lg bg-brand px-4 py-3 text-lg font-semibold text-white disabled:opacity-60">{labels.submit}</button>
    </form>
  );
}
