import { actorSnapshotFreshness } from "./social_context.ts";
import { reviewWorldProcesses, type WorldProcessDue } from "./world_process.ts";

export type ContinuityRow = Record<string, unknown>;

export type KeyNpcDue = {
  actorId: string;
  ageMinutes: number | null;
  lastUpdated: string | null;
  lastActivityTick: string | null;
  reason: "OFFSCREEN_ADVANCE_DUE" | "ACTIVITY_RULE_MISSING" | "TIMESTAMP_UNKNOWN";
};

export type ActiveClockDue = WorldProcessDue;

export function worldContinuityReview(input: {
  worldDay: unknown;
  worldTime: unknown;
  npcCurrent: ContinuityRow[];
  activityRules: ContinuityRow[];
  worldClocks: ContinuityRow[];
  worldClockReviewMinutes?: number;
}) {
  const rulesByActor = new Map<string, ContinuityRow>(
    input.activityRules
      .filter((r) => String(r["NPC ID"] ?? "").trim())
      .map((r): [string, ContinuityRow] => [String(r["NPC ID"]), r]),
  );
  const keyNpcDue: KeyNpcDue[] = [];
  for (const npc of input.npcCurrent) {
    if (String(npc["Importance"] ?? "").toUpperCase() !== "KEY") continue;
    const actorId = String(npc["NPC ID"] ?? "").trim();
    if (!actorId) continue;
    const rule = rulesByActor.get(actorId) ?? null;
    if (rule && String(rule["State"] ?? "").toUpperCase() !== "ACTIVE") continue;
    if (!rule) {
      keyNpcDue.push({
        actorId,
        ageMinutes: null,
        lastUpdated: String(npc["Last updated"] ?? "") || null,
        lastActivityTick: null,
        reason: "ACTIVITY_RULE_MISSING",
      });
      continue;
    }
    const freshness = actorSnapshotFreshness({
      worldDay: input.worldDay,
      worldTime: input.worldTime,
      current: npc,
      activityRule: rule,
    });
    if (freshness.requiresOffscreenAdvance || freshness.ageMinutes == null) {
      keyNpcDue.push({
        actorId,
        ageMinutes: freshness.ageMinutes,
        lastUpdated: String(npc["Last updated"] ?? "") || null,
        lastActivityTick: String(rule["Last activity tick"] ?? "") || null,
        reason: freshness.ageMinutes == null ? "TIMESTAMP_UNKNOWN" : "OFFSCREEN_ADVANCE_DUE",
      });
    }
  }
  const processReview = reviewWorldProcesses({
    worldDay: input.worldDay,
    worldTime: input.worldTime,
    rows: input.worldClocks,
    defaultReviewMinutes: input.worldClockReviewMinutes,
  });
  const activeClocksOverdue = processReview.activeClocksOverdue;
  keyNpcDue.sort((a, b) => (b.ageMinutes ?? Infinity) - (a.ageMinutes ?? Infinity));
  activeClocksOverdue.sort((a, b) => (b.ageMinutes ?? Infinity) - (a.ageMinutes ?? Infinity));
  return {
    keyNpcDue,
    activeClocksOverdue,
    eventTriggeredActive: processReview.eventTriggeredActive,
    staffedPending: processReview.staffedPending,
    requiresKeyNpcReview: keyNpcDue.length > 0,
    note: "Clock entries are review prompts, not automatic events. Never invent jobs, earnings, crime or messages to clear a warning.",
  };
}

export function worldClocksFromSparseRanges(data: Record<string, unknown[][]>): ContinuityRow[] {
  const clockCore = data["WORLD_CLOCKS!A1:C500"] ?? [];
  const clockDates = data["WORLD_CLOCKS!H1:H500"] ?? [];
  const attributes = data["WORLD_CLOCKS!D1:G500"] ?? [];
  return clockCore.slice(1).map((r, i) => ({
    "Process ID": r[0],
    "Name": r[1],
    State: r[2],
    Location: attributes[i + 1]?.[0],
    "Current activity": attributes[i + 1]?.[1],
    "Next milestone/window": attributes[i + 1]?.[2],
    Visibility: attributes[i + 1]?.[3],
    "Last advanced": clockDates[i + 1]?.[0],
  }));
}

export function continuityFromSparseRanges(
  data: Record<string, unknown[][]>,
  worldDay: unknown,
  worldTime: unknown,
) {
  const range = (key: string) => data[key] ?? [];
  const npcCore = range("NPC_CURRENT!A1:D500");
  const npcDates = range("NPC_CURRENT!M1:M500");
  const ruleCore = range("NPC_ACTIVITY_RULES!A1:C200");
  const ruleMinimum = range("NPC_ACTIVITY_RULES!G1:G200");
  const ruleDates = range("NPC_ACTIVITY_RULES!K1:K200");
  const npcCurrent = npcCore.slice(1).map((r, i) => ({
    "NPC ID": r[0],
    Importance: r[3],
    "Last updated": npcDates[i + 1]?.[0],
  }));
  const activityRules = ruleCore.slice(1).map((r, i) => ({
    "NPC ID": r[0],
    State: r[2],
    "Minimum elapsed": ruleMinimum[i + 1]?.[0],
    "Last activity tick": ruleDates[i + 1]?.[0],
  }));
  const worldClocks = worldClocksFromSparseRanges(data);
  return worldContinuityReview({
    worldDay,
    worldTime,
    npcCurrent,
    activityRules,
    worldClocks,
  });
}

export const CONTINUITY_SPARSE_RANGES = [
  "NPC_CURRENT!A1:D500",
  "NPC_CURRENT!M1:M500",
  "NPC_ACTIVITY_RULES!A1:C200",
  "NPC_ACTIVITY_RULES!G1:G200",
  "NPC_ACTIVITY_RULES!K1:K200",
  "WORLD_CLOCKS!A1:C500",
  "WORLD_CLOCKS!H1:H500",
  "WORLD_CLOCKS!D1:G500",
];