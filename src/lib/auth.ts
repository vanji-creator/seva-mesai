import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { officers } from "@/db/schema";

const COOKIE = "session";
const key = () => new TextEncoder().encode(process.env.SESSION_SECRET ?? "dev-only-secret-change-me");

export type Officer = typeof officers.$inferSelect;

export async function login(username: string, password: string): Promise<boolean> {
  const [o] = await db.select().from(officers).where(eq(officers.username, username.trim()));
  if (!o || !(await bcrypt.compare(password, o.passwordHash))) return false;
  const token = await new SignJWT({ sub: String(o.id) })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("8h")
    .sign(key());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 8 * 3600 });
  return true;
}

export async function logout() {
  (await cookies()).delete(COOKIE);
}

export async function currentOfficer(): Promise<Officer | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    const [o] = await db.select().from(officers).where(eq(officers.id, Number(payload.sub)));
    return o ?? null;
  } catch {
    return null;
  }
}

export async function requireOfficer(): Promise<Officer> {
  const o = await currentOfficer();
  if (!o) redirect("/login");
  return o;
}
