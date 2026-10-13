import { assert, assertEquals, assertThrows } from "jsr:@std/assert";
import { npcKnowsMemory, recallNpcMemories, validateNewNpcSocialMemory } from "../src/npc_life_v4/memory.ts";
import { buildNpcBehavioralContext } from "../src/npc_behavior.ts";
import { planNpcInitiativeV4 } from "../src/npc_initiative_v4.ts";

const vesha = "npc.selarin.pool_2003";
const shura = "player.shura";
const memory = (id: string, meaning: string, tags: string, importance = "IMPORTANT") => ({
  "Memory ID": id, "Status": "ACTIVE", "Importance": importance,
  "Participants": vesha + ";" + shura, "Who understands": vesha,
  "Origin event": "T.verified." + id, "Meaning": meaning,
  "Tags": tags, "Source": "Day44 actual shared encounter",
});
const known = memory("memory.promise", "Shura promised a book reference by the agreed day", "promise;book;reference");
const unknown = { ...memory("memory.secret", "Private talk Shura did not reveal to Vesha", "secret"),
  "Who understands": shura };
const query = () => ({ actorId: vesha, memories: [unknown, known],
  currentGoal: "Check promised book reference", contextTags: ["BOOK"] });

Deno.test("memory: only aware actor can retrieve committed live memory", () => {
  assert(npcKnowsMemory(known, vesha));
  assertEquals(npcKnowsMemory(unknown, vesha), false);
  assertEquals(recallNpcMemories(query()).selected.map((x) => x.memoryId), ["memory.promise"]);
  assertEquals(recallNpcMemories(query()).notKnownOrIncompleteCount, 1);
});
Deno.test("memory: mere participant status does not create knowledge", () => {
  assertEquals(npcKnowsMemory({ ...known, "Who understands": "" }, vesha), false);
  assertEquals(npcKnowsMemory({ ...known, "Status": "RETIRED" }, vesha), false);
  assertEquals(npcKnowsMemory({ ...known, "Origin event": "" }, vesha), false);
  assertEquals(npcKnowsMemory({ ...known, "Meaning": "" }, vesha), false);
});
Deno.test("memory: promised item wins relevance over unrelated older important events", () => {
  const pool = Array.from({ length: 24 }, (_, i) => memory(
    "memory.general." + i, "Friendly encounter in the market", "market;friend", "IMPORTANT"));
  const result = recallNpcMemories({ actorId: vesha, memories: [...pool, known],
    currentGoal: "Obtain promised book reference", openThreads: [{
      "Participants": vesha + ";" + shura, "Topic": "Promised book reference",
      "Summary": "Shura promised a book reference", "Status": "OPEN",
    }], limit: 5 });
  assertEquals(result.selected[0].memoryId, "memory.promise");
  assertEquals(result.deferredKnownCount, 20);
  assertEquals(result.needsTargetedReview, true);
});
Deno.test("memory: no random drift, insertion-order changes or silent edits", () => {
  const x = [known, memory("memory.another", "An old professional meeting", "trade")];
  const a = recallNpcMemories({ actorId: vesha, memories: x });
  const b = recallNpcMemories({ actorId: vesha, memories: [...x].reverse() });
  assertEquals(a.selected, b.selected);
  assertEquals(x[0]["Who understands"], vesha);
  assertEquals(a.committed, false);
});
Deno.test("memory: unread chat does not act as NPC knowledge", () => {
  const memories = [memory("memory.fox", "Fox fur trade agreement", "fox;fur"),
    memory("memory.bird", "Bird cage repair", "bird;cage")];
  const result = recallNpcMemories({ actorId: vesha, memories,
    recentChat: [{ "Receiver ID": vesha, "Sender ID": shura, "Delivery": "DELIVERED",
      "Read status": "UNREAD", "Text": "fox fox fox fur" }] });
  assertEquals(result.selected[0].memoryId, "memory.bird");
});
Deno.test("memory: no made-up memory when source history is absent", () => {
  const r = recallNpcMemories({ actorId: vesha, memories: [], contextTags: ["PROMISE"] });
  assertEquals(r.knownMemoryCount, 0);
  assertEquals(r.selected, []);
  assertEquals(r.noNewFactsOrEmotions, true);
});
Deno.test("memory writer: explicit understanders required, not inferred from participants", () => {
  const base = { memoryId:"memory.new", participants:[vesha,shura],
    originEvent:"T0861", meaning:"Vesha heard a specific genuine promise" };
  assertThrows(() => validateNewNpcSocialMemory(base), Error, "NPC_MEMORY_EXPLICIT_KNOWERS_REQUIRED");
  assertThrows(() => validateNewNpcSocialMemory({ ...base, whoUnderstands:["npc.unrelated"] }),
    Error, "NPC_MEMORY_EXPLICIT_KNOWERS_REQUIRED");
  validateNewNpcSocialMemory({ ...base, whoUnderstands:[vesha] });
  assertThrows(() => validateNewNpcSocialMemory({ ...base, whoUnderstands:[vesha,vesha] }),
    Error, "NPC_MEMORY_EXPLICIT_KNOWERS_REQUIRED");
});
Deno.test("behavioral frame: no hidden memory, relevant memory anchors and intact agency", () => {
  const b = buildNpcBehavioralContext({ actorId: vesha,
    current: { "NPC ID": vesha, "Importance":"KEY", "Identity anchors":"curious",
      "Competence anchors":"book seller", "Current goal/activity":"Find promised reference" },
    memories:[unknown,known], knowledge:[], relationships:[],
    openThreads:[], recentChat:[], activeWorldClocks:[] });
  assertEquals(b.ready, true);
  if (!b.ready) throw Error("unexpected unavailable NPC");
  assertEquals(b.memoryAnchors!.length, 1);
  assertEquals(b.memoryAnchors![0].memoryId, "memory.promise");
  assertEquals(b.npcMemoryRecall!.noNewFactsOrEmotions, true);
});
Deno.test("initiative: cannot cite unknown NPC social memory as evidence", () => {
  const x = planNpcInitiativeV4({ actorId:vesha, elapsedSeconds:60,
    current:{"NPC ID":vesha,"Importance":"RECURRING","Current goal/activity":"Keep bookstall open",
      "Identity anchors":"independent bookseller"},
    relationshipToShura:null, socialMemories:[unknown], openThreads:[],
    verifiedCoPresenceWithShura:true });
  assertEquals(x.citedPersonalHistoryCount,0);
});
