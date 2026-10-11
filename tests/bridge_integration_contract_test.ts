import {assert,assertEquals} from "jsr:@std/assert";
import {BRIDGE_FLOW_VERSION,bridgeFeatureStatus,bridgeTurnIntegrationPlan} from "../src/bridge_integration.ts";

Deno.test("Bridge handshake is additive and explicitly blocks EC-06 and unattended writes",()=>{
 const state=bridgeFeatureStatus();
 assertEquals(state.schema,BRIDGE_FLOW_VERSION);
 assertEquals(state.existingSiteAndAuth,"REUSE_EXISTING");
 assertEquals(state.existingMcpToolIdentity,"UNCHANGED");
 assertEquals(state.gated.ec06LedgerAndPaidOffers,"BLOCKED_UNTIL_VERIFIED_ATOMIC_SOURCE_WRITER");
 assertEquals(state.gated.automatedGameplayCommit,"NOT_AUTHORIZED");
 assertEquals(state.available.precommitFastAudit,true);
});
Deno.test("Bridge orchestration only suggests source-bound tools and never commits",()=>{
 const simple=bridgeTurnIntegrationPlan({
 saveId:"V2-S0795",turnClass:"MICRO",memoryDepth:"FAST",missingSources:[],
 plannedElapsedSeconds:0,keyNpcDue:0,worldProcessDue:0,npcContextReady:true,
 });
 assertEquals(simple.gameTimeAdvanced,false);
 assertEquals(simple.planOnly,true);
 assert(!simple.order.includes("SIMULATE_WORLD_V3"));
 assert(!simple.order.includes("PREPARE_TURN"));
 assert(simple.order.indexOf("COMMIT_TURN")<simple.order.indexOf("RENDER_COMMITTED_EVENTS"));
 const due=bridgeTurnIntegrationPlan({
 saveId:"V2-S0795",turnClass:"NORMAL",memoryDepth:"TARGETED_DEEP",
 missingSources:["Specific history source is needed"],plannedElapsedSeconds:3600,
 keyNpcDue:2,worldProcessDue:3,npcContextReady:false,
 });
 assert(due.order.includes("SIMULATE_WORLD_V3"));
 assert(due.order.includes("PREPARE_TURN"));
 assert(due.blockers.includes("TARGETED_SOURCE_LOOKUPS_REQUIRED"));
 assert(due.blockers.includes("NPC_CONTEXT_GATE_NOT_READY"));
 assert(due.blockers.includes("WORLD_PROCESS_CAUSAL_RESOLUTION_REQUIRED"));
 assertEquals(due.autoCommit,false);
});
