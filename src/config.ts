import type { DocKey } from "./types.ts";
import { resolveTestDoc } from "./preview_test_storage.ts";

function rawEnv(name: string): string | undefined {
  const g = globalThis as unknown as {
    Deno?: { env?: { get?: (key: string) => string | undefined } };
    process?: { env?: Record<string, string | undefined> };
  };
  return g.Deno?.env?.get?.(name) ?? g.process?.env?.[name];
}

function env(name: string, required = true): string {
  const value = rawEnv(name);
  if (required && !value) throw new Error(`Missing environment variable: ${name}`);
  return value ?? "";
}

const runtime = (globalThis as unknown as { Deno?: unknown }).Deno ? "deno" : "node";

export const config = {
  runtime,
  port: Number(rawEnv("PORT") ?? "8000"),
  apiKey: env("RUNTIME_API_KEY"),
  allowWrites: (rawEnv("ALLOW_WRITES") ?? "false").toLowerCase() === "true",
  allowRawCommits: (rawEnv("ALLOW_RAW_COMMITS") ?? "false").toLowerCase() === "true",
  // Synthetic Preview only; hard-guarded to a separate TEST workbook & TEST save IDs.
  npcHeatTestWriterEnabled: (rawEnv("RPG_NPC_HEAT_TEST_WRITER_ENABLED") ?? "false").toLowerCase() === "true",
  npcHeatTestWorkbookId: rawEnv("RPG_NPC_HEAT_TEST_WORKBOOK_ID") ?? "",
  // Optional, TEST-only HMAC V3 proof. Absent by default; never reuse Bearer or Google private key.
  npcHeatTestHmacKey: rawEnv("RPG_NPC_HEAT_TEST_HMAC_KEY") ?? "",
  npcHeatTestHmacKeyId: rawEnv("RPG_NPC_HEAT_TEST_HMAC_KEY_ID") ?? "",
  // Does not enable gameplay writing. Requires exact synthetic Preview workbook.
  previewKvRaceEnabled: (rawEnv("RPG_PREVIEW_KV_RACE_ENABLED") ?? "false").toLowerCase() === "true",
  enableKv: (rawEnv("ENABLE_KV") ?? (runtime === "deno" ? "true" : "false")).toLowerCase() === "true",
  worldSimV3Enabled: (rawEnv("WORLD_SIM_V3_ENABLED") ?? "true").toLowerCase() === "true",
  google: {
    email: env("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    privateKey: env("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n"),
  },
  files: {
    TEMP_RUNTIME: env("TEMP_RUNTIME_ID"),
    GM_PREGEN: env("GM_PREGEN_ID"),
    LIVE_CANON_INDEX: resolveTestDoc(rawEnv("DENO_TIMELINE") ?? "",env("TEMP_RUNTIME_ID"),"LIVE_CANON_INDEX",env("LIVE_CANON_INDEX_ID")),
    LIVE_PLAYER_INVENTORY: resolveTestDoc(rawEnv("DENO_TIMELINE") ?? "",env("TEMP_RUNTIME_ID"),"LIVE_PLAYER_INVENTORY",env("LIVE_PLAYER_INVENTORY_ID")),
    LIVE_JOURNAL_LANGUAGE_DISCOVERIES: resolveTestDoc(rawEnv("DENO_TIMELINE") ?? "",env("TEMP_RUNTIME_ID"),"LIVE_JOURNAL_LANGUAGE_DISCOVERIES",env("LIVE_JOURNAL_LANGUAGE_DISCOVERIES_ID")),
    LIVE_NPCS_KNOWLEDGE_SOCIAL: resolveTestDoc(rawEnv("DENO_TIMELINE") ?? "",env("TEMP_RUNTIME_ID"),"LIVE_NPCS_KNOWLEDGE_SOCIAL",env("LIVE_NPCS_KNOWLEDGE_SOCIAL_ID")),
    LIVE_MAPS_LOCATIONS_STATE: resolveTestDoc(rawEnv("DENO_TIMELINE") ?? "",env("TEMP_RUNTIME_ID"),"LIVE_MAPS_LOCATIONS_STATE",env("LIVE_MAPS_LOCATIONS_STATE_ID")),
    LIVE_WORLD_OPPORTUNITIES: resolveTestDoc(rawEnv("DENO_TIMELINE") ?? "",env("TEMP_RUNTIME_ID"),"LIVE_WORLD_OPPORTUNITIES",env("LIVE_WORLD_OPPORTUNITIES_ID")),
    LIVE_PROJECTS_LONGFORM: resolveTestDoc(rawEnv("DENO_TIMELINE") ?? "",env("TEMP_RUNTIME_ID"),"LIVE_PROJECTS_LONGFORM",env("LIVE_PROJECTS_LONGFORM_ID")),
    LIVE_SESSION_LOG: resolveTestDoc(rawEnv("DENO_TIMELINE") ?? "",env("TEMP_RUNTIME_ID"),"LIVE_SESSION_LOG",env("LIVE_SESSION_LOG_ID")),
    LIVE_TRANSACTION_ARCHIVE: resolveTestDoc(rawEnv("DENO_TIMELINE") ?? "",env("TEMP_RUNTIME_ID"),"LIVE_TRANSACTION_ARCHIVE",env("LIVE_TRANSACTION_ARCHIVE_ID")),
  } satisfies Record<DocKey | "TEMP_RUNTIME" | "GM_PREGEN", string>,
};
