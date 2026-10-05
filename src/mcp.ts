import { createMcpHandler, McpServer } from "npm:@modelcontextprotocol/server@2.3.0";
import * as z from "npm:zod@4.6.5/v4";

import { commitTurn, prepareCommit } from "./commit.ts";
import { config } from "./config.ts";
import { getTurnContext } from "./context.ts";
import { sheetsBatchGet } from "./google.ts";
import { intBetween } from "./rng.ts";
import { RULESET_VERSION } from "./rules.ts";

const docKeySchema = z.enum([
  "LIVE_CANON_INDEX",
  "LIVE_PLAYER_INVENTORY",
  "LIVE_JOURNAL_LANGUAGE_DISCOVERIES",
  "LIVE_NPCS_KNOWLEDGE_SOCIAL",
  "LIVE_MAPS_LOCATIONS_STATE",
  "LIVE_WORLD_OPPORTUNITIES",
  "LIVE_PROJECTS_LONGFORM",
  "LIVE_SESSION_LOG",
  "LIVE_TRANSACTION_ARCHIVE",
]);

const scalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const turnContextSchema = z.object({
  turnId: z.string().min(1),
  turnClass: z.enum(["MICRO", "NORMAL", "COMPLEX", "HIGH_STAKES"]),
  tags: z.array(z.string()).optional(),
  actorIds: z.array(z.string()).optional(),
  lookups: z.array(z.object({
    source: z.enum(["TEMP_RUNTIME", "GM_PREGEN"]),
    sheet: z.string().min(1),
    range: z.string().min(1),
    query: z.string().optional(),
  })).optional(),
  docQueries: z.array(z.object({
    documentKey: docKeySchema,
    query: z.string(),
    maxMatches: z.number().int().min(1).max(50).optional(),
  })).optional(),
  languageConcepts: z.array(z.string().min(1)).max(30).optional(),
  includeWorldLanguage: z.boolean().optional(),
});

const structuredTableSchema = z.enum([
  "INVENTORY_CURRENT",
  "OPPORTUNITIES_CURRENT",
  "PROJECTS_CURRENT",
  "NPC_CURRENT",
  "NPC_KNOWLEDGE",
  "PLAYER_LANGUAGE",
  "PLAYER_LEXICON",
  "PLAYER_GRAMMAR",
  "SERVICES_CURRENT",
  "MAP_KNOWLEDGE_CURRENT",
  "ENTITY_INDEX",
  "MILESTONES",
  "WORLD_CLOCKS",
  "WEATHER_CURRENT",
]);

const learningModifiersSchema = z.object({
  novelty: z.number().positive().optional(),
  feedback: z.number().positive().optional(),
  difficulty: z.number().positive().optional(),
  repetition: z.number().positive().optional(),
  fatigue: z.number().positive().optional(),
});

const semanticSchema = z.object({
  turnToken: z.string().optional(),
  elapsedSeconds: z.number().nonnegative().optional(),
  control: z.object({
    worldDay: z.number().int().min(1).optional(),
    worldTime: z.string().optional(),
    locationId: z.string().optional(),
    locationDisplay: z.string().optional(),
    sceneId: z.string().optional(),
    explorationPace: z.string().optional(),
    explorationStance: z.string().optional(),
  }).optional(),
  resourceDeltas: z.array(z.object({ resource: z.string(), delta: z.number() })).optional(),
  resourceSets: z.array(z.object({ resource: z.string(), value: z.number() })).optional(),
  conditions: z.array(z.object({
    conditionId: z.string(),
    value: z.string(),
    unit: z.string().optional(),
    notes: z.string().optional(),
    updatedAt: z.string().optional(),
  })).optional(),
  choiceResolutions: z.array(z.object({
    choiceId: z.string().min(1),
    selectedOption: z.string().min(1),
    notes: z.string().optional(),
  })).optional(),
  generalXpEvents: z.array(z.object({
    sourceType: z.enum(["combat", "objective", "discovery", "survival", "breakthrough", "other"]),
    reason: z.string(),
    sourceRef: z.string().optional(),
    exactXpOverride: z.number().nonnegative().optional(),
    effectiveThreatRating: z.number().optional(),
    contribution: z.number().min(0).max(1).optional(),
    complexityBonus: z.number().min(0).max(0.5).optional(),
    thresholdFraction: z.number().min(0).max(0.25).optional(),
  })).optional(),
  learningEvents: z.array(z.object({
    competenceId: z.string(),
    specialization: z.string().optional(),
    band: z.enum(["tiny", "useful", "substantial", "breakthrough", "exceptional"]),
    productiveMinutes: z.number().nonnegative(),
    modifiers: learningModifiersSchema.optional(),
    exactXpOverride: z.number().nonnegative().optional(),
    specializationQuality: z.enum(["trace", "useful", "substantial", "expert", "breakthrough"]).optional(),
    exactSpecializationProgressOverride: z.number().nonnegative().optional(),
    reason: z.string().optional(),
  })).optional(),
  rowUpserts: z.array(z.object({
    table: structuredTableSchema,
    key: z.string(),
    values: z.record(z.string(), scalarSchema),
  })).optional(),
  rowUpdates: z.array(z.object({
    table: structuredTableSchema,
    key: z.string(),
    patch: z.record(z.string(), scalarSchema),
  })).optional(),
  session: z.object({
    inworldStart: z.string(),
    inworldEnd: z.string().optional(),
    sceneId: z.string().optional(),
    actionSummary: z.string(),
    deltas: z.unknown().optional(),
    newCanon: z.unknown().optional(),
    worldAdvances: z.unknown().optional(),
    notes: z.string().optional(),
    source: z.string().optional(),
  }),
});

const commitSchema = z.object({
  turnId: z.string().min(1),
  txId: z.string().min(1),
  expectedSaveId: z.string(),
  saveTo: z.string(),
  preconditions: z.array(z.object({
    range: z.string().min(1),
    equals: scalarSchema,
  })).optional(),
  sheetWrites: z.array(z.object({
    range: z.string().min(1),
    values: z.array(z.array(scalarSchema)),
  })).optional(),
  docAppends: z.array(z.object({
    documentKey: docKeySchema,
    text: z.string(),
  })).optional(),
  semantic: semanticSchema.optional(),
});

function toolJson(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
  };
}

function buildServer() {
  const server = new McpServer(
    {
      name: "rpg-v2-runtime",
      title: "RPG V2 Runtime",
      version: "2.2.0",
    },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    "runtime_health",
    {
      title: "Runtime health",
      description:
        "Read the authoritative RPG V2 save id, world time, location, scene, Google connectivity state, and whether writes are currently enabled.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const state = await sheetsBatchGet(config.files.TEMP_RUNTIME, [
        "CONTROL!B2",
        "CONTROL!B5",
        "CONTROL!B6",
        "CONTROL!B8",
      ]);
      return toolJson({
        ok: true,
        engineVersion: RULESET_VERSION,
        writesEnabled: config.allowWrites,
        saveId: state["CONTROL!B2"]?.[0]?.[0] ?? null,
        worldTime: state["CONTROL!B5"]?.[0]?.[0] ?? null,
        locationId: state["CONTROL!B6"]?.[0]?.[0] ?? null,
        sceneId: state["CONTROL!B8"]?.[0]?.[0] ?? null,
      });
    },
  );

  server.registerTool(
    "get_turn_context",
    {
      title: "Get RPG turn context",
      description:
        "Load one compact authoritative context packet for an RPG turn. Structured current-state tables and pregenerated district/language packs are loaded automatically from tags; legacy lookups/doc queries are optional.",
      inputSchema: turnContextSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => toolJson(await getTurnContext(input)),
  );

  server.registerTool(
    "prepare_turn",
    {
      title: "Prepare RPG commit",
      description:
        "Validate a turn and build its manifest without writing. Semantic fast-path commits resolve XP, specialization progress, row addressing and structured session logging inside the engine.",
      inputSchema: commitSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => toolJson(await prepareCommit({ ...input, dryRun: true })),
  );

  server.registerTool(
    "commit_turn",
    {
      title: "Commit RPG turn",
      description:
        "Commit an RPG turn. Prefer semantic fast-path payloads: the engine resolves XP/formulas, row addressing, current-state upserts, durable SESSION_LOG idempotency and final verification.",
      inputSchema: commitSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => toolJson(await commitTurn({ ...input, dryRun: false })),
  );

  server.registerTool(
    "rng_int",
    {
      title: "Deterministic RPG random integer",
      description:
        "Resolve bounded RPG randomness deterministically from an explicit seed. Use only after the physically possible outcome range has already been established.",
      inputSchema: z.object({
        seed: z.string().min(1),
        min: z.number().int(),
        max: z.number().int(),
      }).refine((v) => v.max >= v.min, { message: "max must be >= min" }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ seed, min, max }) => toolJson({ value: intBetween(seed, min, max) }),
  );

  return server;
}

const mcpHandler = createMcpHandler(buildServer);

export async function handleMcp(request: Request): Promise<Response> {
  return await mcpHandler.fetch(request);
}

export async function diagnoseMcp(): Promise<{
  ok: boolean;
  httpStatus: number;
  protocolVersion: string | null;
  serverName: string | null;
}> {
  const req = new Request("https://diag.local/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept": "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "rpg-deno-diag", version: "1.0.0" },
      },
    }),
  });

  const response = await mcpHandler.fetch(req);
  const text = await response.text();
  let data: any = null;

  try {
    data = JSON.parse(text);
  } catch {
    // Streamable HTTP may frame the JSON-RPC response as SSE:
    // event: message
    // data: { ...json... }
    const dataLine = text
      .split(/\r?\n/)
      .find((line) => line.startsWith("data:"));
    if (dataLine) {
      try {
        data = JSON.parse(dataLine.slice(5).trim());
      } catch {
        data = null;
      }
    }
  }

  return {
    ok: response.ok && Boolean(data?.result),
    httpStatus: response.status,
    contentType: response.headers.get("content-type"),
    protocolVersion: data?.result?.protocolVersion ?? null,
    serverName: data?.result?.serverInfo?.name ?? null,
    serverVersion: data?.result?.serverInfo?.version ?? null,
    toolsCapability: Boolean(data?.result?.capabilities?.tools),
  };
}
