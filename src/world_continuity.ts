import { actorSnapshotFreshness, parseInworldMoment } from "./social_context.ts";

export type ContinuityRow = Record<string, unknown>;

export type KeyNpcDue = {
  actorId: string;
  ageMinutes: number | null;
  lastUpdated: string | null;
  lastActivityTick: string | null;
  reason: "OFFSCREEN_ADVANCE_DUE" | "ACTIVITY_RULE_MISSING" | "TIMESTAMP_UNKNOWN";
};

export type ActiveClockDue = {
  processId: string;
  ageMinutes: number | null;
  lastAdvanced: string | null;
  reason: "REVIEW_OVERDUE" | "TIMESTAMP_UNKNOWN";
};

export function worldContinuityReview(input: {
  worldDay: unknown;
  worldTime: unknown;
  npcCurrent: ContinuityRow[];
  activityRules: ContinuityRow[];
  worldClocks: ContinuityRow[];
  worldClockReviewMinutes?: number;
}) {
  const rulesByActor = new Map(
    input.activityRules
      .filter((r) => String(r["NPC ID"] ?? "").trim())
      .map((r) => [String(r["NPC ID"]), r]),
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
  const now = parseInworldMoment(`Day${String(input.worldDay ?? "")} ${String(input.worldTime ?? "")}`);
  const reviewMinutes = input.worldClockReviewMinutes ?? 720;
  const activeClocksOverdue: ActiveClockDue[] = [];
  for (const clock of input.worldClocks) {
    const state = String(clock["State"] ?? "").toUpperCase();
    if (!state.startsWith("ACTIVE")) continue;
    const processId = String(clock["Process ID"] ?? "").trim();
    if (!processId) continue;
    const lastAdvanced = String(clock["Last advanced"] ?? "").trim();
    const parsed = parseInworldMoment(lastAdvanced);
    const ageMinutes = now == null || parsed == null ? null : Math.max(0, now - parsed);
    if (ageMinutes == null || ageMinutes >= reviewMinutes) {
      activeClocksOverdue.push({
        processId,
        ageMinutes,
        lastAdvanced: lastAdvanced || null,
        reason: ageMinutes == null ? "TIMESTAMP_UNKNOWN" : "REVIEW_OVERDUE",
      });
    }
  }
  keyNpcDue.sort((a, b) => (b.ageMinutes ?? Infinity) - (a.ageMinutes ?? Infinity));
  activeClocksOverdue.sort((a, b) => (b.ageMinutes ?? Infinity) - (a.ageMinutes ?? Infinity));
  return {
    keyNpcDue,
    activeClocksOverdue,
    requiresKeyNpcReview: keyNpcDue.length > 0,
    note: "Clock entries are review prompts, not automatic events. Never invent jobs, earnings, crime or messages to clear a warning.",
  };
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
  const clockCore = range("WORLD_CLOCKS!A1:C500");
  const clockDates = range("WORLD_CLOCKS!H1:H500");
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
  const worldClocks = clockCore.slice(1).map((r, i) => ({
    "Process ID": r[0],
    State: r[2],
    "Last advanced": clockDates[i + 1]?.[0],
  }));
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
];