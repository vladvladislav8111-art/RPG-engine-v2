import type { DocKey } from "./types.ts";
import { isIsolatedPreviewFixture, resolveDocIdForRuntime } from "./preview_fixture.ts";

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
const tempRuntimeId = env("TEMP_RUNTIME_ID");
const previewFixture = isIsolatedPreviewFixture(tempRuntimeId);
const docId = (key: DocKey, variableName: string) =>
  resolveDocIdForRuntime(tempRuntimeId, key, () => env(variableName));

export const config = {
  runtime,
  previewFixture,
  port: Number(rawEnv("PORT") ?? "8000"),
  apiKey: env("RUNTIME_API_KEY"),
  allowWrites: (rawEnv("ALLOW_WRITES") ?? "false").toLowerCase() === "true",
  allowRawCommits: (rawEnv("ALLOW_RAW_COMMITS") ?? "false").toLowerCase() === "true",
  enableKv: (rawEnv("ENABLE_KV") ?? (runtime === "deno" ? "true" : "false")).toLowerCase() === "true",
  worldSimV3Enabled: (rawEnv("WORLD_SIM_V3_ENABLED") ?? "true").toLowerCase() === "true",
  // Requires an owner-created NPC_ATTENTION_CURRENT tab and isolated writer E2E before activation.
  npcAttentionIndexEnabled: (rawEnv("RPG_NPC_ATTENTION_INDEX_ENABLED") ?? "false").toLowerCase() === "true",
  // An optional distributed commit lease. Disabled pending real Google/KV fencing E2E.
  kvWriterLeaseEnabled: (rawEnv("RPG_KV_WRITER_LEASE_ENABLED") ?? "false").toLowerCase() === "true",
  // Off until the owner-approved ACK tab exists in the one authoritative TEMP workbook.
  systemNotificationAckEnabled: (rawEnv("RPG_SYSTEM_NOTIFICATION_ACK_ENABLED") ?? "false").toLowerCase() === "true",
  // Enable after the existing Bridge is updated to supply source-backed zero/award reviews.
  turnProgressionReviewStrict: (rawEnv("RPG_TURN_PROGRESSION_REVIEW_STRICT") ?? "false").toLowerCase() === "true",
  // An EC-06 funded writer is NOT active merely because V3 can propose an offer.
  ec06FundedOffersWriterReady: (rawEnv("RPG_EC06_FUNDED_OFFERS_WRITER_READY") ?? "false").toLowerCase() === "true",
  google: {
    email: env("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    privateKey: env("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n"),
  },
  files: {
    TEMP_RUNTIME: tempRuntimeId,
    GM_PREGEN: env("GM_PREGEN_ID"),
    LIVE_CANON_INDEX: docId("LIVE_CANON_INDEX", "LIVE_CANON_INDEX_ID"),
    LIVE_PLAYER_INVENTORY: docId("LIVE_PLAYER_INVENTORY", "LIVE_PLAYER_INVENTORY_ID"),
    LIVE_JOURNAL_LANGUAGE_DISCOVERIES: docId("LIVE_JOURNAL_LANGUAGE_DISCOVERIES", "LIVE_JOURNAL_LANGUAGE_DISCOVERIES_ID"),
    LIVE_NPCS_KNOWLEDGE_SOCIAL: docId("LIVE_NPCS_KNOWLEDGE_SOCIAL", "LIVE_NPCS_KNOWLEDGE_SOCIAL_ID"),
    LIVE_MAPS_LOCATIONS_STATE: docId("LIVE_MAPS_LOCATIONS_STATE", "LIVE_MAPS_LOCATIONS_STATE_ID"),
    LIVE_WORLD_OPPORTUNITIES: docId("LIVE_WORLD_OPPORTUNITIES", "LIVE_WORLD_OPPORTUNITIES_ID"),
    LIVE_PROJECTS_LONGFORM: docId("LIVE_PROJECTS_LONGFORM", "LIVE_PROJECTS_LONGFORM_ID"),
    LIVE_SESSION_LOG: docId("LIVE_SESSION_LOG", "LIVE_SESSION_LOG_ID"),
    LIVE_TRANSACTION_ARCHIVE: docId("LIVE_TRANSACTION_ARCHIVE", "LIVE_TRANSACTION_ARCHIVE_ID"),
  } satisfies Record<DocKey | "TEMP_RUNTIME" | "GM_PREGEN", string>,
};
