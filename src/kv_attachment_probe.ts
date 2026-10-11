/**
 * Isolated Deno KV attachment/persistence diagnostic.
 *
 * This module never scans the game namespace, financial journals, player
 * resources or NPC assets. One fixed key under rpg-v2/diag is used solely
 * for a manually authorized ONE-TIME persistence canary.
 *
 * Do NOT interpret successful Deno.openKv() as proof of a particular remote
 * database identity: local Deno can open a local KV too. Deployment identity
 * and a cross-revision readback are independent requirements.
 */
export const RPG_KV_CANARY_KEY: Deno.KvKey =
  ["rpg-v2", "diag", "attachment-persistence-canary", "v1"];

export type RpgKvCanary = {
  schema: "RPG_V2_KV_ATTACHMENT_CANARY_V1";
  marker: string;
};

const MARKER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function checkedCanary(value: unknown): RpgKvCanary | null {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw Error("Unexpected diagnostic KV value; do not overwrite");
  }
  const object = value as Partial<RpgKvCanary>;
  if (object.schema !== "RPG_V2_KV_ATTACHMENT_CANARY_V1" ||
      typeof object.marker !== "string" || !MARKER.test(object.marker)) {
    throw Error("Diagnostic key occupied by unrecognized data; do not overwrite");
  }
  return { schema: object.schema, marker: object.marker };
}

/** Exactly one KV read. Never falls back to the per-process in-memory cache. */
export async function readRpgKvAttachmentCanary(
  db: Deno.Kv,
): Promise<{ present: boolean; marker: string | null }> {
  const entry = await db.get<RpgKvCanary>(RPG_KV_CANARY_KEY);
  const value = checkedCanary(entry.value);
  return { present: value !== null, marker: value?.marker ?? null };
}

/**
 * An explicitly authorized administrative call creates at most one small
 * permanent diagnostic KV row, atomically. No TTL, repeated writes, money
 * operations or auto-migration. The same marker must survive a new revision.
 */
export async function createRpgKvAttachmentCanaryOnce(
  db: Deno.Kv,
): Promise<{ created: boolean; marker: string }> {
  const existing = await readRpgKvAttachmentCanary(db);
  if (existing.present) return { created: false, marker: existing.marker! };
  const next: RpgKvCanary = {
    schema: "RPG_V2_KV_ATTACHMENT_CANARY_V1",
    marker: crypto.randomUUID(),
  };
  const result = await db.atomic()
    .check({ key: RPG_KV_CANARY_KEY, versionstamp: null })
    .set(RPG_KV_CANARY_KEY, next)
    .commit();
  if (result.ok) return { created: true, marker: next.marker };

  // Another diagnostic call may have created the same fixed key. Never
  // overwrite on conflict or attempt an unrestricted second write.
  const winner = await readRpgKvAttachmentCanary(db);
  if (!winner.present) throw Error("Diagnostic KV CAS failed without known winner");
  return { created: false, marker: winner.marker! };
}
