import {assert,assertEquals,assertThrows} from "jsr:@std/assert";
import {chooseMemoryRoute} from "../src/context_memory_router.ts";
import {planIndependentWorldTick} from "../src/world_tick_dispatcher.ts";
import {auditPreparedTurn} from "../src/turn_fast_integrity_audit.ts";
import {validateTurnCoverage} from "../src/turn_progression_coverage.ts";
import {planWorkCompetition} from "../src/source_work_competition.ts";
import {buildNpcAutonomyPlan} from "../src/npc_autonomy_planner.ts";

Deno.test("Memory router signals fast vs targeted actor/log/canon reads",()=>{
 const fast=chooseMemoryRoute({turnClass:"MICRO",tags:[]});
 assertEquals(fast.depth,"FAST");assertEquals(fast.deepRequired,false);
 const npc=chooseMemoryRoute({turnClass:"NORMAL",tags:["NPC"],actorIds:["npc.irina.earth"]});
 assertEquals(npc.depth,"TARGETED_DEEP");assert(npc.reasons.some(x=>x.id==="NPC_CONTEXT"));
 assert(!npc.missingSources.some(x=>x.includes("actor IDs")));
 const history=chooseMemoryRoute({turnClass:"NORMAL",tags:["LOGS"]});
 assert(history.reasons.some(x=>x.id==="HISTORY_TRACE"));
 assert(history.missingSources.some(x=>x.includes("log/canon")));
 const finance=chooseMemoryRoute({turnClass:"COMPLEX",tags:["PAYMENT"]});
 assert(finance.missingSources.some(x=>x.includes("EC-06")));
});
const sparse={
 "NPC_CURRENT!A1:D500":[["NPC ID","Name","x","Importance"],["npc.test.key","Имя","","KEY"],["npc.test.recurring","Имя","","RECURRING"]],
 "NPC_CURRENT!M1:M500":[["Last updated"],["Day67 12:00"],["Day66 12:00"]],
 "NPC_ACTIVITY_RULES!A1:C200":[["NPC ID","x","State"],["npc.test.key","","ACTIVE"],["npc.test.recurring","","ACTIVE"]],
 "NPC_ACTIVITY_RULES!G1:G200":[["Minimum elapsed"],["60"],["1440"]],
 "NPC_ACTIVITY_RULES!K1:K200":[["Last activity tick"],["Day67 12:00"],["Day66 12:00"]],
 "WORLD_CLOCKS!A1:C500":[["Process ID","Name","State"],["process.test.workshop","Work","ACTIVE"]],
 "WORLD_CLOCKS!D1:G500":[["Location","Current activity","Next milestone/window","Visibility"],["loc.test","Still requires QC","Review next day","private"]],
 "WORLD_CLOCKS!H1:H500":[["Last advanced"],["Day66 12:00"]],
};
Deno.test("Time plan includes independent actor and order work, never commits",()=>{
 const plan=planIndependentWorldTick({saveId:"V2-S123",worldDay:67,worldTime:"12:00:00",
 elapsedSeconds:3600,sparse});
 assertEquals(plan.proposedEnd,{day:67,time:"13:00:00"});
 assertEquals(plan.timeCommitted,false);
 assertEquals(plan.worldProcessReviews[0].processId,"process.test.workshop");
 assertEquals(plan.worldProcessReviews[0].completionGuaranteed,false);
 assert(plan.recurringNpcIds.includes("npc.test.recurring"));
 assertThrows(()=>planIndependentWorldTick({saveId:"V2-S123",worldDay:67,worldTime:"12:00:00",
 elapsedSeconds:8*86400,sparse}),Error,"WORLD_TICK_BOUNDS");
});
const baseAudit={
 txId:"tx.audit",oldDay:67,oldTime:"12:00:00",newDay:67,newTime:"12:01:00",
 elapsedSeconds:60,sessionStart:"Day67 12:00:00",sessionEnd:"Day67 12:01:00",
 resources:[["Resource","Current","Max/Threshold"],["HP",56,75],["Stamina",37,75],["Money copper",10,""]],
 pendingChoices:[["Choice ID","Status","Options JSON"],["choice.example","PENDING_GENERATION","[]"]],
 inventory:[["Item ID","Qty","Location/container","Custodian"],["item.verified",1,"System Storage","player.shura"]],
 inventoryChanged:true,
 requiredProcessIds:["process.example"],resolvedProcessIds:["process.example"],
 requiredNpcIds:["npc.test.key"],resolvedNpcIds:["npc.test.key"],
};
Deno.test("Fast audit reuses post-state and detects time, double ownership and unresolved NPC",()=>{
 const checked=auditPreparedTurn(baseAudit);
 assertEquals(checked.extraSourceRequests,0);
 assert(checked.checks.includes("item_instance_unique_custody"));
 assertThrows(()=>auditPreparedTurn({...baseAudit,newTime:"12:02:00"}),Error,"WORLD_CLOCK_ADVANCE_MISMATCH");
 assertThrows(()=>auditPreparedTurn({...baseAudit,inventory:[...baseAudit.inventory,["item.verified",1,"Other","npc.1"]]}),Error,"DUPLICATE_ITEM_INSTANCE");
 assertThrows(()=>auditPreparedTurn({...baseAudit,resolvedNpcIds:[]}),Error,"UNRESOLVED_KEY_NPC");
});
Deno.test("Gameplay progression must consider zero or source-grounded awards",()=>{
 assertEquals(validateTurnCoverage({elapsedSeconds:0,generalEvents:[],learningEvents:[],
 adaptationEvents:[],strict:true}).status,"META_NO_TIME");
 assertThrows(()=>validateTurnCoverage({elapsedSeconds:60,generalEvents:[],learningEvents:[],
 adaptationEvents:[],strict:true}),Error,"MISSING_REVIEW");
 assertEquals(validateTurnCoverage({elapsedSeconds:60,generalEvents:[],learningEvents:[],
 adaptationEvents:[],review:{outcome:"SOURCE_BASED_ZERO",reason:"Repeated task did not evidence fresh learning"},strict:true}).status,"EXPLICIT_ZERO");
 assertThrows(()=>validateTurnCoverage({elapsedSeconds:60,generalEvents:[{}],learningEvents:[],
 adaptationEvents:[],review:{outcome:"SOURCE_BASED_ZERO",reason:"An inconsistent award was supplied by the GM"},strict:true}),Error,"ZERO_CONTRADICTS");
});
Deno.test("Competing worker cannot consume phantom or duplicate offer slots",()=>{
 const offer={offerId:"offer.real",sourceProcessId:"process.real",employerId:"npc.merchant",
 slotsTotal:1,slotsRemaining:1,expiresAtMinute:97000,sourceRevision:"r1",status:"AVAILABLE" as const};
 const claim={claimId:"claim.one",offerId:"offer.real",applicantId:"npc.worker",
 acceptedByEmployer:true,acceptedAtMinute:96000,employerDecisionRef:"tx.accepted",sourceRevision:"r1"};
 const base={revision:"r1",nowMinute:96010,offers:[offer],attestedClaims:[claim],
 existingClaimIds:new Set<string>()};
 const plan=planWorkCompetition(base);
 assertEquals(plan.ok,true);
 if(!plan.ok)throw Error("expected valid planning result");
 assertEquals(plan.offers[0].possibleRemainingSlots,0);
 assertEquals(plan.committed,false);
 assertEquals(planWorkCompetition({...base,attestedClaims:[claim,{...claim,claimId:"claim.two"}]}).ok,false);
 assertEquals(planWorkCompetition({...base,existingClaimIds:new Set(["claim.one"])}).ok,false);
});

Deno.test("KEY NPC life plan respects known obligations and does not invent dialogue",()=>{
 const plan=buildNpcAutonomyPlan({actorId:"npc.irina.earth",worldDay:67,worldTime:"13:00:00",
 current:{"Importance":"KEY","Identity anchors":"Real established personality",
 "Current goal/activity":"Independent practical study","Current/last-known location":"loc.known"},
 activityRule:{"State":"ACTIVE","Last activity tick":"Day67 12:00"},
 knownFacts:[{"Fact ID":"knowledge.1"}],directedRelationships:[
 {"Actor ID":"npc.irina.earth","Toward ID":"npc.max.earth","Trust":"uncertain"}],
 socialMemory:[],openThreads:[
 {"Thread ID":"thread.commitment","Status":"OPEN","Waiting on":"npc.irina.earth",
 "Topic":"Existing commitment","Trigger/due":"Day67 12:30:00"}],
 activeWorldClocks:[{"Process ID":"process.existing","State":"ACTIVE"}],
 });
 assertEquals(plan.reviewMode,"DETAILED_LIFEV4");
 assertEquals(plan.dueOpenThreadIds,["thread.commitment"]);
 assertEquals(plan.guaranteedReply,false);
 assertEquals(plan.committed,false);
 assert(plan.readyForAutonomousProposal);
 assert(plan.distinctKnownPeers.includes("npc.max.earth"));
});
