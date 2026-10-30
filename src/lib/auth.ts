import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { citizens, officers } from "@/db/schema";

const COOKIE = "session";
const key = () => new TextEncoder().encode(process.env.SESSION_SECRET ?? "dev-only-secret-change-me");

export type Officer = typeof officers.$inferSelect;
export type Citizen = typeof citizens.$inferSelect;
type Role = "officer" | "citizen";

/** One sign-in form for both: officers land on the desk, citizens on their applications. */
export async function login(username: string, password: string): Promise<Role | null> {
  const u = username.trim();
  const [o] = await db.select().from(officers).where(eq(officers.username, u));
  const [c] = o ? [] : await db.select().from(citizens).where(eq(citizens.username, u));
  const who = o ? { role: "officer" as const, id: o.id, hash: o.passwordHash } : c ? { role: "citizen" as const, id: c.id, hash: c.passwordHash } : null;
  if (!who || !(await bcrypt.compare(password, who.hash))) return null;
  const token = await new SignJWT({ sub: String(who.id), role: who.role })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("8h")
    .sign(key());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 8 * 3600 });
  return who.role;
}

export async function logout() {
  (await cookies()).delete(COOKIE);
}

async function session(): Promise<{ role: Role; id: number } | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    // Tokens from before citizens existed carry no role: they were officers.
    return { role: payload.role === "citizen" ? "citizen" : "officer", id: Number(payload.sub) };
  } catch {
    return null;
  }
}

export async function currentOfficer(): Promise<Officer | null> {
  const s = await session();
  if (s?.role !== "officer") return null;
  const [o] = await db.select().from(officers).where(eq(officers.id, s.id));
  return o ?? null;
}

export async function currentCitizen(): Promise<Citizen | null> {
  const s = await session();
  if (s?.role !== "citizen") return null;
  const [c] = await db.select().from(citizens).where(eq(citizens.id, s.id));
  return c ?? null;
}

/** Where a signed-in user belongs, or null if nobody is signed in. */
export async function homeFor(): Promise<string | null> {
  if (await currentOfficer()) return "/";
  if (await currentCitizen()) return "/my";
  return null;
}

export async function requireOfficer(): Promise<Officer> {
  const o = await currentOfficer();
  if (!o) redirect((await currentCitizen()) ? "/my" : "/login");
  return o;
}

export async function requireCitizen(): Promise<Citizen> {
  const c = await currentCitizen();
  if (!c) redirect((await currentOfficer()) ? "/" : "/login");
  return c;
}
