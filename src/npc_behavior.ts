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
  const memoryAnchors = input.memories
    .filter((r) => String(r["Participants"] ?? "").split(";").includes(actorId))
    .sort((a,b) => {
      const rank = (r: NpcRecord) => ({ANCHOR:3,IMPORTANT:2,ROUTINE:1}[str(r["Importance"]).toUpperCase()] ?? 0);
      return rank(b)-rank(a);
    })
    .slice(0, 12)
    .map((r) => ({
      memoryId:r["Memory ID"],meaning:r["Meaning"],
      emotionalTone:r["Emotional tone"],originEvent:r["Origin event"],
      whoUnderstands:r["Who understands"],lastUsed:r["Last used"],
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
    commitments,
    knownFacts,
    lastContact,
    workPressures,
    deliberationRules: [
      "NPC decides independently from their own goal, time, priorities and character; player cannot compel agreement.",
      "NPC learns ONLY from knownFacts, directly observed events and source-backed hearsay; do not reveal GM private truth.",
      "Distinguish trust, warmth and obligations; affection alone does not grant consent, employment, secrets or physical access.",
      "Recent chat, known memories and open threads may shape speech, but no guaranteed conversation or automatic response.",
      "NPC may disagree, delay, be unavailable, challenge contradictions or leave to pursue their own commitments.",
    ],
  };
}
