import { config } from "./config.ts";

const memory = new Map<string, unknown>();
let kvPromise: Promise<Deno.Kv> | null = null;

async function getKv(): Promise<Deno.Kv | null> {
  if (!config.enableKv) return null;
  kvPromise ??= Deno.openKv();
  return await kvPromise;
}

function keyString(key: readonly unknown[]): string {
  return JSON.stringify(key);
}

export async function cacheGet<T>(key: readonly Deno.KvKeyPart[]): Promise<T | null> {
  const kv = await getKv();
  if (kv) return (await kv.get<T>(key)).value ?? null;
  return (memory.get(keyString(key)) as T | undefined) ?? null;
}

export async function cacheSet<T>(key: readonly Deno.KvKeyPart[], value: T): Promise<void> {
  const kv = await getKv();
  if (kv) {
    await kv.set(key, value);
    return;
  }
  memory.set(keyString(key), value);
}
