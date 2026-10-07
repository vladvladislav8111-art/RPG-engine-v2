import { config } from "./config.ts";

type CacheKeyPart = string | number | bigint | boolean | Uint8Array;
type KvLike = {
  get<T>(key: readonly CacheKeyPart[]): Promise<{ value: T | null }>;
  set<T>(key: readonly CacheKeyPart[], value: T): Promise<unknown>;
};

const g = globalThis as unknown as { __rpgRuntimeMemoryCache?: Map<string, unknown> };
const memory = g.__rpgRuntimeMemoryCache ??= new Map<string, unknown>();
let kvPromise: Promise<KvLike> | null = null;

async function getKv(): Promise<KvLike | null> {
  if (!config.enableKv) return null;
  const deno = (globalThis as unknown as { Deno?: { openKv?: () => Promise<KvLike> } }).Deno;
  if (!deno?.openKv) return null;
  kvPromise ??= deno.openKv();
  return await kvPromise;
}

function keyString(key: readonly unknown[]): string {
  return JSON.stringify(key);
}

export async function cacheGet<T>(key: readonly CacheKeyPart[]): Promise<T | null> {
  const kv = await getKv();
  if (kv) return (await kv.get<T>(key)).value ?? null;
  return (memory.get(keyString(key)) as T | undefined) ?? null;
}

export async function cacheSet<T>(key: readonly CacheKeyPart[], value: T): Promise<void> {
  const kv = await getKv();
  if (kv) {
    await kv.set(key, value);
    return;
  }
  memory.set(keyString(key), value);
}
