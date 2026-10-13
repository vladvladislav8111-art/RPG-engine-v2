import { summarizeNpcLifeContext } from "./npc_life_v4/context.ts";
import { recallNpcMemories } from "./npc_life_v4/memory.ts";

type NpcRecord = Record<string, unknown>;

const str = (x: unknown) => String(x ?? "").trim();
const relevant = (r: NpcRecord, id: string) =>
  String(r["Actor ID"] ?? "") === id || String(r["Toward ID"] ?? "") === id;

/** Source-grounded NPC response frame: actor agency, goals and epistemic bounds. */
export function buildNpcBehavioralContext(input: {
  actorId: string;
  current: NpcRecord | null;
  knowledge: NpcRecord[];
  relationships: NpcRecord[];
  memories: NpcRecord[];
  openThreads: NpcRecord[];
  recentChat: NpcRecord[];
  activeWorldClocks: NpcRecord[];
  activityRule?: NpcRecord | null;
  contextTags?: readonly string[];
}) {
  const { actorId, current } = input;
  if (!current || str(current["NPC ID"]) !== actorId) {
    return { ready: false, missing: ["npc_current"] };
  }
  const knownFacts = input.knowledge.filter((r) => {
    const active = str(r["Active"]).toUpperCase();
    return str(r["NPC ID"]) === actorId && active !== "FALSE";
  }).map((r) => ({
    factId: r["Fact ID"],
    belief: r["Knowledge/belief"],
    epistemicStatus: r["Confidence/status"],
    acquiredFrom: r["Source"],
    learnedAt: r["Learned/updated"],
  }));
  const npcMemoryRecall = recallNpcMemories({
    actorId, memories: input.memories, currentGoal: str(current["Current goal/activity"]),
    openThreads: input.openThreads, recentChat: input.recentChat,
    contextTags: input.contextTags, limit: 12,
  });
  const memoryAnchors = npcMemoryRecall.selected.map((memory) => ({
    memoryId: memory.memoryId, meaning: memory.meaning,
    emotionalTone: memory.emotionalTone, originEvent: memory.originEvent,
    source: memory.source, whoUnderstands: memory.whoUnderstands.join(";"),
    lastUsed: memory.lastUsed, relevanceReasons: memory.reasons,
  }));
  const commitments = input.openThreads
    .filter((r) => String(r["Participants"] ?? "").split(";").includes(actorId))
    .map((r) => ({
      threadId: r["Thread ID"],
      topic: r["Topic"],summary:r["Summary"],
      waitingOn:r["Waiting on"],triggerDue:r["Trigger/due"],
      importance:r["Importance"],
    }));
  const directedRelations = input.relationships.filter((r) => relevant(r, actorId))
    .map((r) => ({
      actorId:r["Actor ID"],towardId:r["Toward ID"],stance:r["Current stance"],
      warmth:r["Warmth"],trust:r["Trust"],tension:r["Tension"],
      obligation:r["Obligation/debt"],
    }));
  const lastContact = input.recentChat.slice(-8).map((r) => ({
    time:r["Timestamp"],senderId:r["Sender ID"],
    receiverId:r["Receiver ID"],text:r["Text"],readStatus:r["Read status"],
  }));
  const workPressures = input.activeWorldClocks.slice(0,5).map((r) => ({
    processId:r["Process ID"],currentActivity:r["Current activity"],
    nextMilestone:r["Next milestone/window"],
  }));
  return {
    ready: true,
    actorId,
    stableTraits: str(current["Identity anchors"]),
    capabilities: str(current["Competence anchors"]),
    independentGoal: current["Current goal/activity"],
    currentLocation: current["Current/last-known location"],
    socialBoundaries: current["Notes"] ?? null,
    directedRelations,
    memoryAnchors,
    npcMemoryRecall,
    commitments,
    knownFacts,
    lastContact,
    workPressures,
    npcLifeV4: summarizeNpcLifeContext({
      actorId,
      importance: current["Importance"],
      currentGoal: current["Current goal/activity"],
      identityAnchors: current["Identity anchors"],
      competenceAnchors: current["Competence anchors"],
      currentLocation: current["Current/last-known location"],
      lastUpdated: current["Last updated"],
      linkedClocks: input.activeWorldClocks.length,
      knownFacts: knownFacts.length,
      socialMemories: memoryAnchors.length,
      openThreads: commitments.length,
      relationshipRows: directedRelations.length,
      activityRulePresent: input.activityRule != null,
      activeProjectCount: input.activeWorldClocks.filter((r) =>
        String(r["State"] ?? "").toUpperCase().startsWith("ACTIVE")
      ).length,
    }),
    deliberationRules: [
      "NPC decides independently from their own goal, time, priorities and character; player cannot compel agreement.",
      "NPC learns ONLY from knownFacts, directly observed events and source-backed hearsay; do not reveal GM private truth.",
      "Distinguish trust, warmth and obligations; affection alone does not grant consent, employment, secrets or physical access.",
      "Source-known memory selection may shape speech; no new event or guaranteed NPC reply.",
      "NPC may disagree, delay, be unavailable, challenge contradictions or leave to pursue their own commitments.",
    ],
  };
}
