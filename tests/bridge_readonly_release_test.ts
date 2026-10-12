import { assert, assertEquals, assertThrows } from "jsr:@std/assert";
import { BRIDGE_FLOW_VERSION, bridgeFeatureStatus, bridgeTurnIntegrationPlan } from "../src/bridge_integration.ts";
import { chooseMemoryRoute } from "../src/context_memory_router.ts";
import { planIndependentWorldTick } from "../src/world_tick_dispatcher.ts";
import { buildNpcAutonomyPlan } from "../src/npc_autonomy_planner.ts";

Deno.test("Bridge preserves phase-one contracts and truthfully advertises staged additions",()=>{
 const x=bridgeFeatureStatus();
 assertEquals(x.schema,BRIDGE_FLOW_VERSION);
 assertEquals(x.releaseStage,"SOURCE_GATED_PHASE_2");
 assertEquals(x.gated.ec06LedgerAndPaidOffers,"BLOCKED_UNTIL_VERIFIED_ATOMIC_SOURCE_WRITER");
 assertEquals(x.gated.automatedGameplayCommit,"NOT_AUTHORIZED");
 assertEquals(x.available.fullTurnDispatcher,false);
 assertEquals(x.available.systemNotificationCenter,"SOURCE_DERIVED_READ_ONLY");
 assertEquals(x.available.precommitFastAudit,true);
 assertEquals(x.available.worldTickPlan,"READ_ONLY_PROPOSALS");
});
Deno.test("Memory router escalates only on target-specific needs",()=>{
 const fast=chooseMemoryRoute({turnClass:"MICRO",tags:[]});
 assertEquals(fast.depth,"FAST");
 const npc=chooseMemoryRoute({turnClass:"NORMAL",tags:["NPC"],actorIds:["npc.irina.earth"]});
 assertEquals(npc.depth,"TARGETED_DEEP");
 assert(npc.reasons.some(x=>x.id==="NPC_CONTEXT"));
 const logs=chooseMemoryRoute({turnClass:"NORMAL",tags:["LOGS"]});
 assert(logs.missingSources.some(x=>x.includes("log/canon")));
});
const sparse={
 "NPC_CURRENT!A1:D500":[["NPC ID","Name","x","Importance"],["npc.example.key","person","","KEY"]],
 "NPC_CURRENT!M1:M500":[["Last updated"],["Day67 09:00"]],
 "NPC_ACTIVITY_RULES!A1:C200":[["NPC ID","x","State"],["npc.example.key","","ACTIVE"]],
 "NPC_ACTIVITY_RULES!G1:G200":[["Minimum elapsed"],[">= 30m"]],
 "NPC_ACTIVITY_RULES!K1:K200":[["Last activity tick"],["Day67 09:00"]],
 "WORLD_CLOCKS!A1:C500":[["Process ID","Name","State"],["process.example","Example","ACTIVE"]],
 "WORLD_CLOCKS!D1:G500":[["Location","Current activity","Next milestone/window","Visibility"],["loc.example","Work","Review","private"]],
 "WORLD_CLOCKS!H1:H500":[["Last advanced"],["Day66 09:00"]],
};
Deno.test("Prospective time and NPC planning never advance save or complete craft",()=>{
 const plan=planIndependentWorldTick({saveId:"V2-S0795",worldDay:67,worldTime:"17:21:00",
 elapsedSeconds:1800,sparse});
 assertEquals(plan.proposedEnd,{day:67,time:"17:51:00"});
 assertEquals(plan.timeCommitted,false);
 assert(plan.keyNpcDueCount>=1);
 assertEquals(plan.worldProcessReviews[0].completionGuaranteed,false);
 assertThrows(()=>planIndependentWorldTick({saveId:"V2-S0795",worldDay:67,worldTime:"17:21:00",elapsedSeconds:-1,sparse}),Error);
});
Deno.test("Autonomous NPC plan lists only known tasks and relationships",()=>{
 const plan=buildNpcAutonomyPlan({actorId:"npc.irina.earth",worldDay:67,worldTime:"13:00:00",
 current:{"Importance":"KEY","Identity anchors":"Established personality","Current goal/activity":"Independent study"},
 activityRule:{"State":"ACTIVE"},
 knownFacts:[],directedRelationships:[{"Actor ID":"npc.irina.earth","Toward ID":"npc.max.earth"}],
 socialMemory:[],openThreads:[{"Thread ID":"thread.example","Status":"OPEN",
 "Waiting on":"npc.irina.earth","Topic":"Known deadline","Trigger/due":"Day67 12:30:00"}],
 activeWorldClocks:[]});
 assertEquals(plan.reviewMode,"DETAILED_LIFEV4");
 assertEquals(plan.dueOpenThreadIds,["thread.example"]);
 assert(plan.distinctKnownPeers.includes("npc.max.earth"));
 assertEquals(plan.guaranteedReply,false);
 assertEquals(plan.committed,false);
});
Deno.test("Read-only turn route never auto-commits",()=>{
 const p=bridgeTurnIntegrationPlan({saveId:"V2-S0795",turnClass:"NORMAL",
 memoryDepth:"TARGETED_DEEP",missingSources:["need exact log"],plannedElapsedSeconds:3600,
 keyNpcDue:1,worldProcessDue:2,npcContextReady:false});
 assert(p.sequence.includes("SIMULATE_WORLD_V3"));
 assert(p.blockers.includes("NPC_CONTEXT_GATE_NOT_READY"));
 assertEquals(p.autoCommit,false);
});
