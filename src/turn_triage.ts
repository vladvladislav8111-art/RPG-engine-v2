/** Compact, read-only GM to-do list from sources already loaded by get_turn_context.
 * Does not choose for Shura, expose secrets, call the engine or authorize commits.
 */
type Choice = Record<string, unknown>;
const str = (x: unknown) => String(x ?? "").trim();
/** A runtime row may refer to canonical options, but malformed/repeated IDs
 * must never be presented as if Shura can safely select one. This is shape
 * validation, not independent proof that the referenced canon is ACTIVE. */
function choiceOptionsLookReady(value: unknown): boolean {
  if (!Array.isArray(value) || value.length < 2 || value.length > 4) return false;
  const ids = new Set<string>();
  for (const v of value) {
    if (!v || typeof v !== "object") return false;
    const o = v as Record<string, unknown>;
    const id = str(o.id);
    if (!/^milestone\.[a-z0-9_.-]+$/i.test(id) || ids.has(id)) return false;
    ids.add(id);
    if (o.canonStatus !== "CANON_ACTIVE" ||
        (o.type !== "ACTIVE" && o.type !== "PASSIVE") ||
        str(o.name).length < 3 || str(o.trigger).length < 10 ||
        str(o.effect).length < 10 || str(o.limits).length < 10 ||
        str(o.scalingState).length < 2 || str(o.sourceRef).length < 8) return false;
  }
  return true;
}
export function buildTurnTriage(input: {
  turnClass: string;
  tags: readonly string[];
  memory: { depth: "FAST" | "TARGETED_DEEP"; missingSources: readonly string[] };
  worldPlan: { elapsedSeconds: number; keyNpcDueCount: number; processDueCount: number;
    truncated: boolean } | null;
  npcRoutineCadence?: { eligibleCount: number; truncated: boolean } | null;
  actorContextRequired: boolean;
  actorContextReady: boolean;
  pendingChoices: readonly Choice[];
}) {
  const blockers: string[] = [];
  const tasks: Array<{ code: string; kind: "GM_ONLY" | "PLAYER_CHOICE"; note: string }> = [];
  const add = (code: string, kind: "GM_ONLY" | "PLAYER_CHOICE", note: string) =>
    tasks.push({ code, kind, note });
  if (input.memory.missingSources.length) {
    blockers.push("TARGETED_SOURCE_LOOKUP_REQUIRED");
    add("LOOKUP_NARROW_SOURCES", "GM_ONLY", "Load only the relevant active source; do not pull entire archives");
  }
  if (input.actorContextRequired && !input.actorContextReady) {
    blockers.push("NPC_CONTEXT_GATE_BLOCKED");
    add("LOAD_NPC_KNOWLEDGE", "GM_ONLY", "No substantive NPC reply until source and knowledge gate is ready");
  }
  const world = input.worldPlan;
  if (world?.truncated) {
    blockers.push("WORLD_PLAN_TRUNCATED");
    add("EXPAND_RELEVANT_WORLD_READ", "GM_ONLY", "Do not claim complete NPC/process handling from a truncated plan");
  }
  if (world?.elapsedSeconds && world.elapsedSeconds > 0) {
    if (world.keyNpcDueCount > 0) {
      add("RESOLVE_KEY_NPC_LIFEV4", "GM_ONLY", "Review required independent decisions via source-backed V3, not automatic dialogue");
    }
    if (world.processDueCount > 0) {
      add("RESOLVE_WORLD_PROCESSES", "GM_ONLY", "Due review is not completed production or an earned payout");
    }
    add("VERIFY_CLOCK_AND_RESOURCES", "GM_ONLY", "Engine calculates elapsed time and survival; never duplicate a delta");
  }
  if ((input.npcRoutineCadence?.eligibleCount ?? 0) > 0) {
    add("REVIEW_ROUTINE_KEY_NPC_INITIATIVE", "GM_ONLY",
      "Independent KEY actor is eligible for routine Life V4 review; choose causally, not guaranteed contact");
  }
  if (input.npcRoutineCadence?.truncated) {
    blockers.push("NPC_ROUTINE_REVIEW_TRUNCATED");
    add("LOAD_TARGETED_KEY_NPC_BATCH", "GM_ONLY", "Break pending LifeV4 review into evidence-backed batches <=12");
  }
  const waiting: Array<{ choiceId: string; state: "READY_FOR_PLAYER" | "NEEDS_CANONICAL_OPTIONS" }> = [];
  const activeChoices = input.pendingChoices.filter(choice => {
    const status = str(choice["Status"]).toUpperCase();
    return status.startsWith("PENDING") || status === "OPEN" || status === "AWAITING_CHOICE";
  });
  const occurrences = new Map<string, number>();
  for (const choice of activeChoices) {
    const id = str(choice["Choice ID"]);
    if (id) occurrences.set(id, (occurrences.get(id) ?? 0) + 1);
  }
  const seenChoices = new Set<string>();
  for (const choice of activeChoices) {
    const id = str(choice["Choice ID"]); if (!id || seenChoices.has(id)) continue;
    seenChoices.add(id);
    const duplicate = (occurrences.get(id) ?? 0) > 1;
    if (duplicate && !blockers.includes("DUPLICATE_LIVE_MILESTONE_CHOICES"))
      blockers.push("DUPLICATE_LIVE_MILESTONE_CHOICES");
    let options: unknown = null;
    try { options = JSON.parse(str(choice["Options JSON"])); } catch { /* source diagnostic */ }
    const ready = !duplicate && str(choice["Status"]).toUpperCase() === "AWAITING_CHOICE" &&
      choiceOptionsLookReady(options);
    waiting.push({ choiceId: id, state: ready ? "READY_FOR_PLAYER" : "NEEDS_CANONICAL_OPTIONS" });
    add(ready ? "ASK_PLAYER_CHOICE" : "LOAD_CANONICAL_CHOICES",
      ready ? "PLAYER_CHOICE" : "GM_ONLY",
      ready ? "Present stored, verified option shapes; do not choose for Shura" :
        "Resolve duplicate/invalid hot choices and verify canonical options before asking Shura");
  }
  // One actionable instruction per category even if multiple choices are pending.
  // Each choice remains individually available through pendingChoices.
  const uniqueTasks = [...new Map(tasks.map(t => [t.code, t])).values()];
  const unique = uniqueTasks.map(t => t.code);
  const requiresHighStakesPrep = input.turnClass === "COMPLEX" || input.turnClass === "HIGH_STAKES";
  const dueIndependentActorsOrProcesses = (world?.elapsedSeconds ?? 0) > 0 &&
    ((world?.keyNpcDueCount ?? 0) > 0 || (world?.processDueCount ?? 0) > 0);
  return {
    schema: "GM_TURN_TRIAGE_V1", readOnly: true, gameplayCommitted: false,
    timeAdvancedSeconds: 0, extraGoogleReads: 0,
    memoryDepth: input.memory.depth, missingSourceCount: input.memory.missingSources.length,
    blockers, tasks: uniqueTasks.slice(0, 20), truncated: uniqueTasks.length > 20 || waiting.length > 20,
    taskCodes: unique, pendingChoices: waiting.slice(0, 20),
    sourceOnly: true, suggestPrepare: requiresHighStakesPrep || dueIndependentActorsOrProcesses ||
      world?.truncated === true || blockers.length > 0,
    strictXpReviewSuggested: input.tags.some(t => ["WORK", "CRAFT", "TRAINING", "COMBAT", "RESEARCH", "STUDY"].includes(t.toUpperCase())),
    finalCommitRule: "Never narrate changes, pay money, grant XP or render System events before successful semantic commit",
  };
}
