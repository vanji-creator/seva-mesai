import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DIR = path.resolve(__dirname, "cache");

/**
 * Every paid API result is written to eval/cache/<key>.json with its first-run latency,
 * so re-running the eval (or adding a pipeline) never pays for the same call twice.
 */
export async function cached<T>(key: string, fn: () => Promise<T>): Promise<{ value: T; ms: number; hit: boolean }> {
  mkdirSync(DIR, { recursive: true });
  const file = path.join(DIR, `${key.replace(/[^\w.-]/g, "_")}.json`);
  if (existsSync(file)) {
    const { value, ms } = JSON.parse(readFileSync(file, "utf8"));
    return { value, ms, hit: true };
  }
  const t = Date.now();
  const value = await fn();
  const ms = Date.now() - t;
  writeFileSync(file, JSON.stringify({ value, ms }, null, 1));
  return { value, ms, hit: false };
}

export function isCached(key: string): boolean {
  return existsSync(path.join(DIR, `${key.replace(/[^\w.-]/g, "_")}.json`));
}
