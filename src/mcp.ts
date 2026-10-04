import { createMcpHandler, McpServer } from "npm:@modelcontextprotocol/server@2.3.0";
import * as z from "npm:zod@4.6.5/v4";

import { commitTurn, prepareCommit } from "./commit.ts";
import { config } from "./config.ts";
import { getTurnContext } from "./context.ts";
import { sheetsBatchGet } from "./google.ts";
import { intBetween } from "./rng.ts";

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
      version: "1.0.0",
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
        "Load one compact authoritative context packet for an RPG turn. Select the turn class, tags, actor ids, exact sheet lookups, and targeted canonical document queries needed for this turn.",
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
        "Validate the expected save id and exact preconditions and build a commit manifest without writing anything. Use before every authoritative commit.",
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
        "Write a validated RPG turn to authoritative Google runtime state and verify the resulting save id. This is a write action and is blocked while ALLOW_WRITES=false.",
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
