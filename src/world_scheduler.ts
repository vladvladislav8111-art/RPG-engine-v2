import { parseInworldMoment } from "./social_context.ts";
import { classifyWorldProcess, reviewWorldProcesses, type WorldProcessRow } from "./world_process.ts";

export type FactionSeed = Record<string, unknown>;
export type WorldAgendaItem = {
  processId: string;
  nextReviewAt: string | null;
  reviewStatus: "DUE" | "SCHEDULED" | "EVENT_ONLY" | "AWAIT_STAFFED_WORK";
  factionId: string | null;
  factionGoal: string | null;
  possibleActions: string[];
  causalRequirements: string[];
  currentActivity: string;
  nextMilestone: string;
  location: string;
  lastAdvanced: string;
  visibility: string;
};

/**
 * Bounded autonomous-world agenda. Returns GM work, NOT fabricated facts:
 * a faction can choose an initiative without Shura, but only causal semantic
 * worldProcessEvents can turn it into durable state.
 */
export function buildWorldActionDocket(input: {
  worldDay: number;
  worldTime: string;
  clocks: WorldProcessRow[];
  factionSeeds?: FactionSeed[];
  maxItems?: number;
}): {items: WorldAgendaItem[]; dueCount: number; hiddenDueCount: number; activeCount: number; nextDailyReview: string | null; requiresIndependentResolution: boolean} {
  const review = reviewWorldProcesses({
    worldDay: input.worldDay, worldTime: input.worldTime, rows: input.clocks,
  });
  const dueAge = new Map(review.activeClocksOverdue.map((p) => [p.processId, p.ageMinutes]));
  const due = new Set(dueAge.keys());
  const now = parseInworldMoment("Day" + input.worldDay + " " + input.worldTime);
  const seeds = input.factionSeeds ?? [];
  const items: WorldAgendaItem[] = [];
  const nextByProcess = new Map<string, number>();
  let nextMinute: number | null = null;
  for (const row of input.clocks) {
    const state = String(row["State"] ?? "").toUpperCase();
    if (!state.startsWith("ACTIVE")) continue;
    const id = String(row["Process ID"] ?? "").trim();
    if (!id) continue;
    const policy = classifyWorldProcess(row);
    const last = String(row["Last advanced"] ?? "").trim();
    const lastAt = parseInworldMoment(last);
    const nextAt = policy.cadence === "DAILY_REVIEW" && lastAt != null ? lastAt + 1440 :
      policy.cadence === "STAFFED_MILESTONE" && policy.targetDay != null ?
        policy.targetDay * 1440 + (policy.targetMinute ?? 0) : null;
    if (nextAt != null && now != null && nextAt > now) {
      nextByProcess.set(id, nextAt);
      if (nextMinute == null || nextAt < nextMinute) nextMinute = nextAt;
    }
    const seed = seeds.find((s) =>
      String(s["Status"] ?? "").startsWith("ACTIVE") &&
      (String(s["Activation trigger"] ?? "").includes(id) ||
        (id.includes("merchant_verification") && String(s["Seed ID"] ?? "").includes("merchant_verification"))));
    const outputs = seed
      ? String(seed["Possible outputs"] ?? "").split(";").map((x) => x.trim()).filter(Boolean)
      : [];
    const reviewStatus = policy.cadence === "EVENT_TRIGGERED" ? "EVENT_ONLY" :
      policy.cadence === "STAFFED_MILESTONE" && !due.has(id) ? "AWAIT_STAFFED_WORK" :
      due.has(id) ? "DUE" : "SCHEDULED";
    items.push({
      processId:id,
      nextReviewAt: nextAt == null ? null : "Day" + Math.floor(nextAt / 1440) + " " +
        String(Math.floor((nextAt % 1440) / 60)).padStart(2,"0") + ":" +
        String(nextAt % 60).padStart(2,"0"),
      reviewStatus,
      factionId: seed ? String(seed["Owner faction/org"] ?? "") : null,
      factionGoal: seed ? String(seed["Baseline pressure"] ?? "") : null,
      possibleActions: outputs,
      causalRequirements: [
        "Resolve NPC/faction initiative independently of Shura, within finite staff, resources and geographic reach.",
        "Use existing documentary evidence, live actor knowledge and ongoing process before asserting a new crime, job or court result.",
        "Record worldProcessEvents, rumorRelayEvents and any finite opportunity only for genuinely caused outcomes.",
        "Public knowledge of effects must follow observed contact, legitimate notices or an actual rumor route.",
      ],
      currentActivity: String(row["Current activity"] ?? ""),
      nextMilestone: String(row["Next milestone/window"] ?? ""),
      location: String(row["Location"] ?? ""),
      lastAdvanced: last,
      visibility: String(row["Visibility"] ?? ""),
    });
  }
  const weight = (status: WorldAgendaItem["reviewStatus"]) =>
    status === "DUE" ? 0 : status === "SCHEDULED" ? 1 : status === "AWAIT_STAFFED_WORK" ? 2 : 3;
  // When a large city has more due processes than a bounded GM packet,
  // oldest unresolved world work should not disappear behind lexicographic
  // process IDs. Among scheduled processes show nearest next-review first.
  // Event-only watchers stay low priority without being dropped from counts.
  items.sort((a,b)=>{
    const priority = weight(a.reviewStatus)-weight(b.reviewStatus);
    if (priority) return priority;
    if (a.reviewStatus === "DUE" && b.reviewStatus === "DUE") {
      const overdue = (dueAge.get(b.processId) ?? 0) - (dueAge.get(a.processId) ?? 0);
      if (overdue) return overdue;
    }
    if (a.reviewStatus === "SCHEDULED" && b.reviewStatus === "SCHEDULED") {
      const nextA = nextByProcess.get(a.processId) ?? Number.POSITIVE_INFINITY;
      const nextB = nextByProcess.get(b.processId) ?? Number.POSITIVE_INFINITY;
      if (nextA !== nextB) return nextA-nextB;
    }
    return a.processId.localeCompare(b.processId);
  });
  const maxItems = Number.isFinite(input.maxItems) ?
    Math.max(1, Math.min(25, Math.floor(input.maxItems!))) : 10;
  const dueCount = items.filter((i)=>i.reviewStatus==="DUE").length;
  const selected = items.slice(0, maxItems);
  return {
    items: selected,
    dueCount,
    hiddenDueCount: Math.max(0, dueCount-selected.filter(i=>i.reviewStatus==="DUE").length),
    activeCount: items.length,
    nextDailyReview: nextMinute == null ? null : "Day" + Math.floor(nextMinute/1440) + " " +
      String(Math.floor((nextMinute%1440)/60)).padStart(2,"0") + ":" +
      String(nextMinute%60).padStart(2,"0"),
    requiresIndependentResolution: dueCount > 0,
  };
}
