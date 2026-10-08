import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { commitTurn, prepareCommit } from "./commit.ts";
import { config } from "./config.ts";
import { getTurnContext } from "./context.ts";
import { sheetsBatchGet } from "./google.ts";
import { getHudSnapshot, HUD_HTML, HUD_RESOURCE_URI, HUD_UI_VERSION } from "./hud.ts";
import {
  ACTION_PROFILES,
  deriveStaminaBaseMax,
  resolveExertion,
  resolveInjurySimulation,
  resolveRest,
} from "./physiology.ts";
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

const hudSnapshotSchema = z.object({
  uiVersion: z.string(),
  saveId: z.string(),
  name: z.string(),
  level: z.number(),
  day: z.number(),
  time: z.string(),
  location: z.string(),
  resources: z.object({
    hp: z.object({ current: z.number(), max: z.number() }),
    stamina: z.object({ current: z.number(), max: z.number(), baseMax: z.number() }),
    mana: z.object({ current: z.number(), max: z.number() }),
    satiety: z.object({ current: z.number(), max: z.number() }),
    hydration: z.object({ current: z.number(), max: z.number() }),
    money: z.number(),
    generalXp: z.object({ current: z.number(), max: z.number() }),
    sup: z.number(),
  }),
  statuses: z.array(z.object({
    label: z.string(),
    severity: z.enum(["good", "warn", "danger", "neutral"]),
  })),
  water: z.union([
    z.object({ value: z.string(), unit: z.string(), notes: z.string(), display: z.string() }),
    z.null(),
  ]),
});

const turnContextSchema = z.object({
  turnId: z.string().min(1),
  turnClass: z.enum(["MICRO", "NORMAL", "COMPLEX", "HIGH_STAKES"]),
  tags: z.array(z.string()).optional(),
  actorIds: z.array(z.string()).max(20).optional(),
  actorRefs: z.array(z.string().min(1)).max(20).optional(),
  recentChatLimit: z.number().int().min(0).max(20).optional(),
  requireNpcContextGate: z.boolean().optional(),
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
  "BODY_INJURIES_CURRENT",
  "ACTIVE_CONTEXT",
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
  inventoryEvents: z.array(z.object({
    itemId: z.string().min(1),
    qtyDelta: z.number().optional(),
    qtySet: z.number().nonnegative().optional(),
    templateId: z.string().min(1).optional(),
    item: z.string().min(1).optional(),
    unit: z.string().min(1).optional(),
    location: z.string().min(1).optional(),
    custodian: z.string().min(1).optional(),
    conditionNotes: z.string().optional(),
    tags: z.string().optional(),
    lastUpdated: z.string().optional(),
    massKgOverride: z.number().nonnegative().nullable().optional(),
    volumeLOverride: z.number().nonnegative().nullable().optional(),
    reason: z.string().optional(),
  })).optional(),
  conditions: z.array(z.object({
    conditionId: z.string(),
    value: z.string(),
    unit: z.string().optional(),
    notes: z.string().optional(),
    updatedAt: z.string().optional(),
  })).optional(),
  survival: z.object({
    segments: z.array(z.object({
      durationMinutes: z.number().nonnegative(),
      activity: z.enum(["sleep", "rest", "normal", "travel", "work", "heavy"]),
      satietyMultiplier: z.number().nonnegative().optional(),
      hydrationMultiplier: z.number().nonnegative().optional(),
    })).optional(),
    defaultActivity: z.enum(["sleep", "rest", "normal", "travel", "work", "heavy"]).optional(),
    foodIntakes: z.array(z.object({
      foodId: z.enum([
        "food.bread_loaf",
        "food.light_snack",
        "food.ordinary_meal",
        "food.substantial_meal",
        "food.field_ration",
        "food.fruit_portion",
      ]),
      count: z.number().nonnegative().optional(),
      satietyOverride: z.number().nonnegative().optional(),
      hydrationOverride: z.number().nonnegative().optional(),
    })).optional(),
    waterLiters: z.number().nonnegative().optional(),
    heatMultiplier: z.number().nonnegative().optional(),
  }).optional(),
  choiceResolutions: z.array(z.object({
    choiceId: z.string().min(1),
    selectedOption: z.string().min(1),
    notes: z.string().optional(),
  })).optional(),
  exertionEvents: z.array(z.object({
    actionId: z.string().min(1),
    durationMinutes: z.number().nonnegative().optional(),
    count: z.number().nonnegative().optional(),
    loadMultiplier: z.number().nonnegative().optional(),
    environmentMultiplier: z.number().nonnegative().optional(),
    conditionMultiplier: z.number().nonnegative().optional(),
    recoveryMultiplier: z.number().nonnegative().optional(),
    explicitEfficiencyMultiplier: z.number().nonnegative().optional(),
    explicitCeilingMultiplier: z.number().nonnegative().optional(),
    allowForcedExertion: z.boolean().optional(),
    reason: z.string().optional(),
  })).optional(),
  restEvents: z.array(z.object({
    restId: z.enum(["rest.break", "rest.short", "rest.full"]),
    durationMinutes: z.number().nonnegative(),
    recoveryMultiplier: z.number().nonnegative().optional(),
    usefulSleep: z.boolean().optional(),
    reason: z.string().optional(),
  })).optional(),
  injuryEvents: z.array(z.object({
    injuryId: z.string().optional(),
    targetEntityId: z.string().optional(),
    seed: z.string().min(1),
    weaponForce: z.enum(["light", "solid", "heavy", "extreme"]),
    hitQuality: z.enum(["glancing", "ordinary", "direct", "exceptional"]),
    location: z.enum(["head_face", "neck", "torso_chest", "torso_abdomen", "arm", "hand", "leg", "foot"]),
    armorMitigation: z.number().nonnegative().optional(),
    tags: z.array(z.string()).optional(),
    toxin: z.object({
      class: z.enum(["weak", "medium", "strong", "extreme"]),
      doseModifier: z.number().optional(),
      deliveryModifier: z.number().optional(),
      specificImmunity: z.number().nonnegative().optional(),
      protection: z.number().nonnegative().optional(),
    }).optional(),
    simulationOnly: z.boolean().optional(),
    reason: z.string().optional(),
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
  adaptationEvents: z.array(z.object({
    characteristic: z.string().min(1),
    band: z.enum(["trace", "useful", "substantial", "major", "exceptional"]),
    secondary: z.boolean().optional(),
    exactUnitsOverride: z.number().int().nonnegative().optional(),
    reason: z.string().min(1),
    evidence: z.string().optional(),
  })).optional(),
  relationshipEvents: z.array(z.object({
    operation: z.enum(["UPSERT", "RETIRE"]).optional(),
    relationshipId: z.string().min(1),
    actorId: z.string().min(1),
    towardId: z.string().min(1),
    trust: z.string().optional(),
    respect: z.string().optional(),
    warmth: z.string().optional(),
    fear: z.string().optional(),
    tension: z.string().optional(),
    obligationDebt: z.string().optional(),
    economicInterest: z.string().optional(),
    valueCompatibility: z.string().optional(),
    currentStance: z.string().optional(),
    evidenceRefs: z.array(z.string().min(1)).max(50).optional(),
    lastChanged: z.string().optional(),
    lastEvaluated: z.string().optional(),
    status: z.enum(["ACTIVE", "DORMANT"]).optional(),
    notes: z.string().optional(),
  })).optional(),
  socialMemoryEvents: z.array(z.object({
    operation: z.enum(["UPSERT", "TOUCH", "RETIRE"]).optional(),
    memoryId: z.string().min(1),
    participants: z.array(z.string().min(1)).min(1).max(20).optional(),
    originEvent: z.string().optional(),
    meaning: z.string().optional(),
    whoUnderstands: z.array(z.string().min(1)).max(20).optional(),
    emotionalTone: z.string().optional(),
    recurrenceDelta: z.number().int().min(0).max(1000).optional(),
    lastUsed: z.string().optional(),
    importance: z.enum(["ROUTINE", "IMPORTANT", "ANCHOR"]).optional(),
    source: z.string().optional(),
    tags: z.array(z.string()).optional(),
    notes: z.string().optional(),
  })).optional(),
  threadEvents: z.array(z.object({
    operation: z.enum(["OPEN", "UPDATE", "RESOLVE", "EXPIRE"]),
    threadId: z.string().min(1),
    participants: z.array(z.string().min(1)).min(1).max(20).optional(),
    topic: z.string().optional(),
    summary: z.string().optional(),
    openedAt: z.string().optional(),
    lastTouched: z.string().optional(),
    waitingOn: z.string().optional(),
    triggerDue: z.string().optional(),
    importance: z.enum(["ROUTINE", "IMPORTANT"]).optional(),
    promoteTarget: z.enum(["NONE", "SOCIAL_MEMORY", "NPC_KNOWLEDGE", "CANON"]).optional(),
    promoteRef: z.string().min(1).optional(),
    source: z.string().optional(),
    tags: z.array(z.string()).optional(),
    notes: z.string().optional(),
  })).optional(),
  chatEvents: z.array(z.object({
    messageId: z.string().min(1),
    channelId: z.string().min(1),
    timestamp: z.string().optional(),
    senderId: z.string().min(1),
    receiverId: z.string().min(1),
    direction: z.enum(["IN", "OUT"]),
    text: z.string(),
    delivery: z.enum(["QUEUED", "SENT", "DELIVERED", "FAILED"]).optional(),
    readStatus: z.enum(["UNREAD", "READ"]).optional(),
    notes: z.string().optional(),
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
  rowDeletes: z.array(z.object({
    table: structuredTableSchema,
    key: z.string(),
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
      version: "2.8.1",
    },
    { capabilities: { tools: {}, resources: {} } },
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
        architectureVersion: "fast-storage-v3.1",
        hudUiVersion: HUD_UI_VERSION,
        writesEnabled: config.allowWrites,
        rawCommitsEnabled: config.allowRawCommits,
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
        "Load one compact authoritative context packet for an RPG turn. For a substantive NPC reply, pass actorRefs or actorIds and requireNpcContextGate=true (the gate also defaults on for explicit actors). Explicit actors bypass player-location filtering and receive live state, durable identity resolution, knowledge, social memory, open threads, bounded recent System chat, KEY-NPC activity rules and actor-linked clocks. The returned actorContext.contextGate.readyForSubstantiveReply must be true before rendering a substantive NPC reply. Stable identities that are not currently materialized are reported as dormant/rematerialization-required instead of being recreated, and stale KEY-NPC snapshots can require off-screen causal advancement before dialogue.",
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
          "Commit an RPG turn. Ordinary gameplay must use one semantic fast-path payload; raw sheet commits are disabled by default and reserved for deliberate migration/repair. Prefer one semantic fast-path payload: route meaningful social context through socialMemoryEvents/threadEvents/chatEvents, update only affected live-state rows, append reusable permanent knowledge to the appropriate LIVE document via docAppends, write the valid SESSION_LOG transaction, then verify current state. Chat direction/participants are validated. Resolving or expiring a thread with a non-NONE promoteTarget requires same-transaction destination evidence via promoteRef. Fleeting dialogue should not be persisted merely because it occurred.",
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


  server.registerResource(
    "rpg-hud-v2",
    HUD_RESOURCE_URI,
    {},
    async () => ({
      contents: [
        {
          uri: HUD_RESOURCE_URI,
          mimeType: "text/html;profile=mcp-app",
          text: HUD_HTML,
          _meta: {
            ui: {
              prefersBorder: false,
            },
            "openai/ui": {
              availableDisplayModes: ["inline"],
            },
          },
        },
      ],
    }),
  );

  server.registerTool(
    "render_hud",
    {
      title: "Render RPG HUD",
      description:
        "Render the compact player-facing System HUD from the latest committed authoritative state. Use after a committed gameplay turn when a visual status card improves the response; never use it as a source of hidden GM information.",
      inputSchema: z.object({}),
      outputSchema: hudSnapshotSchema,
      _meta: {
        ui: { resourceUri: HUD_RESOURCE_URI },
        "openai/outputTemplate": HUD_RESOURCE_URI,
        "openai/toolInvocation/invoking": "Обновляю HUD…",
        "openai/toolInvocation/invoked": "HUD обновлён.",
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const snapshot = await getHudSnapshot();
      return {
        structuredContent: snapshot,
        content: [{
          type: "text" as const,
          text:
            `HUD: ${snapshot.name}, уровень ${snapshot.level}, день ${snapshot.day}, ${snapshot.time}; HP ${snapshot.resources.hp.current}/${snapshot.resources.hp.max}, выносливость ${snapshot.resources.stamina.current}/${snapshot.resources.stamina.max}, мана ${snapshot.resources.mana.current}/${snapshot.resources.mana.max}; сытость ${snapshot.resources.satiety.current}/${snapshot.resources.satiety.max}, гидратация ${snapshot.resources.hydration.current}/${snapshot.resources.hydration.max}; деньги ${snapshot.resources.money}c; XP ${snapshot.resources.generalXp.current}/${snapshot.resources.generalXp.max}.`,
        }],
      };
    },
  );


  server.registerTool(
    "render_current_hud",
    {
      title: "Render current RPG HUD",
      description:
        "Display the current authoritative player-visible HUD. Reads authoritative runtime state server-side and does not advance time or modify state.",
      inputSchema: z.object({}),
      outputSchema: hudSnapshotSchema,
      _meta: {
        ui: { resourceUri: HUD_RESOURCE_URI },
        "openai/outputTemplate": HUD_RESOURCE_URI,
        "openai/toolInvocation/invoking": "Обновляю HUD…",
        "openai/toolInvocation/invoked": "HUD обновлён.",
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const snapshot = await getHudSnapshot();
      return {
        structuredContent: snapshot,
        content: [{
          type: "text" as const,
          text:
            `HUD: ${snapshot.name}, уровень ${snapshot.level}, день ${snapshot.day}, ${snapshot.time}; HP ${snapshot.resources.hp.current}/${snapshot.resources.hp.max}, выносливость ${snapshot.resources.stamina.current}/${snapshot.resources.stamina.max}, мана ${snapshot.resources.mana.current}/${snapshot.resources.mana.max}; сытость ${snapshot.resources.satiety.current}/${snapshot.resources.satiety.max}, гидратация ${snapshot.resources.hydration.current}/${snapshot.resources.hydration.max}; деньги ${snapshot.resources.money}c; XP ${snapshot.resources.generalXp.current}/${snapshot.resources.generalXp.max}.`,
        }],
      };
    },
  );


  server.registerTool(
    "simulate_exertion",
    {
      title: "Simulate stamina exertion",
      description:
        "Read-only deterministic calculator for Current Stamina and Stamina Ceiling costs. It never changes campaign state.",
      inputSchema: z.object({
        actionId: z.string().min(1),
        durationMinutes: z.number().nonnegative().optional(),
        count: z.number().nonnegative().optional(),
        current: z.number().nonnegative(),
        ceiling: z.number().nonnegative(),
        baseMax: z.number().positive(),
        endurance: z.number().positive(),
        competenceLevel: z.number().nonnegative().optional(),
        specializationStars: z.number().nonnegative().optional(),
        loadMultiplier: z.number().nonnegative().optional(),
        environmentMultiplier: z.number().nonnegative().optional(),
        conditionMultiplier: z.number().nonnegative().optional(),
        recoveryMultiplier: z.number().nonnegative().optional(),
        explicitEfficiencyMultiplier: z.number().nonnegative().optional(),
        explicitCeilingMultiplier: z.number().nonnegative().optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (input) => toolJson(resolveExertion(input)),
  );

  server.registerTool(
    "simulate_rest",
    {
      title: "Simulate stamina recovery",
      description:
        "Read-only deterministic calculator for ordinary break, short rest, or full useful sleep. It never changes campaign state.",
      inputSchema: z.object({
        restId: z.enum(["rest.break", "rest.short", "rest.full"]),
        durationMinutes: z.number().nonnegative(),
        current: z.number().nonnegative(),
        ceiling: z.number().nonnegative(),
        baseMax: z.number().positive(),
        endurance: z.number().positive(),
        recoveryMultiplier: z.number().nonnegative().optional(),
        usefulSleep: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (input) => toolJson(resolveRest(input)),
  );

  server.registerTool(
    "simulate_injury",
    {
      title: "Simulate physical injury",
      description:
        "Read-only deterministic physical injury/toxin simulation. The physically plausible severity range is established first; seeded randomness then selects within it. It never changes campaign state.",
      inputSchema: z.object({
        seed: z.string().min(1),
        weaponForce: z.enum(["light", "solid", "heavy", "extreme"]),
        hitQuality: z.enum(["glancing", "ordinary", "direct", "exceptional"]),
        location: z.enum(["head_face", "neck", "torso_chest", "torso_abdomen", "arm", "hand", "leg", "foot"]),
        armorMitigation: z.number().nonnegative().optional(),
        endurance: z.number().positive(),
        tags: z.array(z.string()).optional(),
        toxin: z.object({
          class: z.enum(["weak", "medium", "strong", "extreme"]),
          doseModifier: z.number().optional(),
          deliveryModifier: z.number().optional(),
          specificImmunity: z.number().nonnegative().optional(),
          protection: z.number().nonnegative().optional(),
        }).optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (input) => toolJson(resolveInjurySimulation(input)),
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

const mcpHandler = createMcpHandler(() => buildServer());

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
        clientInfo: { name: "rpg-runtime-diag", version: "2.8.1" },
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
    resourcesCapability: Boolean(data?.result?.capabilities?.resources),
  };
}
