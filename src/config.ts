import type { DocKey } from "./types.ts";

function env(name: string, required = true): string {
  const value = Deno.env.get(name);
  if (required && !value) throw new Error(`Missing environment variable: ${name}`);
  return value ?? "";
}

export const config = {
  port: Number(Deno.env.get("PORT") ?? "8000"),
  apiKey: env("RUNTIME_API_KEY"),
  allowWrites: (Deno.env.get("ALLOW_WRITES") ?? "false").toLowerCase() === "true",
  enableKv: (Deno.env.get("ENABLE_KV") ?? "true").toLowerCase() === "true",
  google: {
    email: env("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    privateKey: env("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n"),
  },
  files: {
    TEMP_RUNTIME: env("TEMP_RUNTIME_ID"),
    GM_PREGEN: env("GM_PREGEN_ID"),
    LIVE_CANON_INDEX: env("LIVE_CANON_INDEX_ID"),
    LIVE_PLAYER_INVENTORY: env("LIVE_PLAYER_INVENTORY_ID"),
    LIVE_JOURNAL_LANGUAGE_DISCOVERIES: env("LIVE_JOURNAL_LANGUAGE_DISCOVERIES_ID"),
    LIVE_NPCS_KNOWLEDGE_SOCIAL: env("LIVE_NPCS_KNOWLEDGE_SOCIAL_ID"),
    LIVE_MAPS_LOCATIONS_STATE: env("LIVE_MAPS_LOCATIONS_STATE_ID"),
    LIVE_WORLD_OPPORTUNITIES: env("LIVE_WORLD_OPPORTUNITIES_ID"),
    LIVE_PROJECTS_LONGFORM: env("LIVE_PROJECTS_LONGFORM_ID"),
    LIVE_SESSION_LOG: env("LIVE_SESSION_LOG_ID"),
    LIVE_TRANSACTION_ARCHIVE: env("LIVE_TRANSACTION_ARCHIVE_ID"),
  } satisfies Record<DocKey | "TEMP_RUNTIME" | "GM_PREGEN", string>,
};
