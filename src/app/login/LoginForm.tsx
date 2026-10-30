"use client";
import { useActionState, useState } from "react";
import { loginAction } from "@/app/actions";

type Labels = Record<"title" | "user" | "pass" | "submit" | "error" | "demo" | "samePass", string>;
export interface DemoAccount { username: string; title: string; hint: string }

const DEMO_PASSWORD = "Demo@1234";

/** Sign-in form, with the two demo accounts as cards: tapping one fills in its username and password. */
export function LoginForm({ labels, accounts }: { labels: Labels; accounts: DemoAccount[] }) {
  const [state, action, pending] = useActionState(loginAction, null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const input = "w-full bg-transparent px-4 py-3 text-[16px] outline-none placeholder:text-faint";
  return (
    <>
      <form action={action} className="space-y-4">
        <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line-strong bg-white">
          <input name="username" autoComplete="username" required placeholder={labels.user} aria-label={labels.user} value={username} onChange={(e) => setUsername(e.target.value)} className={input} />
          <input name="password" type="password" autoComplete="current-password" required placeholder={labels.pass} aria-label={labels.pass} value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
        </div>
        {state?.error && <p role="alert" className="text-center text-[14px] text-red">{labels.error}</p>}
        <button disabled={pending} className="w-full rounded-2xl bg-accent py-3 text-[16px] font-medium text-white disabled:opacity-60">{labels.submit}</button>
      </form>

      <div className="mt-8">
        <p className="mb-3 text-center text-[13px] text-muted">{labels.demo}</p>
        <div className="grid grid-cols-2 gap-3">
          {accounts.map((a) => {
            const chosen = username === a.username;
            return (
              <button
                key={a.username}
                type="button"
                onClick={() => { setUsername(a.username); setPassword(DEMO_PASSWORD); }}
                aria-pressed={chosen}
                className={`rounded-2xl border p-3 text-left transition-colors ${chosen ? "border-accent bg-accent-soft" : "border-line-strong bg-white hover:border-accent"}`}
              >
                <div className="text-[15px] font-semibold">{a.title}</div>
                <div className="mt-0.5 text-[12px] leading-snug text-muted">{a.hint}</div>
                <div className="mt-2 font-mono text-[13px] text-accent">{a.username}</div>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-center text-[13px] text-muted">{labels.samePass}</p>
      </div>
    </>
  );
}
