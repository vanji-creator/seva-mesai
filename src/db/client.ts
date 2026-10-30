import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { mkdirSync } from "node:fs";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Production / Vercel: DATABASE_URL points at Neon Postgres.
 * Local with no DATABASE_URL: an embedded Postgres (PGlite) in .data/ so that
 * `npm run seed && npm run dev` works with zero external setup.
 */
function create(): Db {
  if (process.env.DATABASE_URL) {
    return drizzleNeon(neon(process.env.DATABASE_URL), { schema }) as unknown as Db;
  }
  mkdirSync("./.data", { recursive: true });
  return drizzlePglite(new PGlite("./.data/pglite"), { schema }) as unknown as Db;
}

const g = globalThis as unknown as { __db?: Db };
/** Lazy: nothing connects until the first query (keeps `next build` from opening the local DB). */
export const db: Db = new Proxy({} as Db, {
  get: (_, prop) => Reflect.get((g.__db ??= create()), prop),
});
