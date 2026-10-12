import { assert, assertEquals, assertThrows } from "jsr:@std/assert";
import { auditPreparedTurn } from "../src/turn_fast_integrity_audit.ts";
import { validateTurnCoverage } from "../src/turn_progression_coverage.ts";
import { buildTurnTriage } from "../src/turn_triage.ts";

const base = () => ({
 txId:"tx.audit",oldDay:67,oldTime:"12:00:00",newDay:67,newTime:"12:01:00",
 elapsedSeconds:60,sessionStart:"Day67 12:00:00",sessionEnd:"Day67 12:01:00",
 resources:[["Resource","Current"],["HP",56],["Stamina",37],["Money copper",10]],
 pendingChoices:[["Choice ID","Status","Options JSON"],["choice.legacy","AWAITING_CHOICE","[]"]],
 inventoryChanged:false,
});
Deno.test("Historical bad milestone is diagnostic, not unrelated-turn veto",()=>{
 const result=auditPreparedTurn(base());
 assertEquals(result.ok,true);
 assert(result.legacyDiagnosticsOnly.some(x=>x.includes("choice.legacy")));
});
Deno.test("Touched choice remains fail closed and strict 2..4 options",()=>{
 assertThrows(()=>auditPreparedTurn({...base(),modifiedChoiceIds:["choice.legacy"]}),Error,"INVALID_TOUCHED_MILESTONE_OPTIONS");
 const b=base(); b.pendingChoices[1][2]='[{"id":"a"},{"id":"b"}]';
 assertEquals(auditPreparedTurn({...b,modifiedChoiceIds:["choice.legacy"]}).ok,true);
});
Deno.test("No invalid clock, phantom resource, duplicated custody or missed key NPC",()=>{
 assertThrows(()=>auditPreparedTurn({...base(),newTime:"12:02:00"}),Error,"WORLD_CLOCK_ADVANCE_MISMATCH");
 assertThrows(()=>auditPreparedTurn({...base(),resources:[["Resource","Current"],["HP",""]]}),Error,"NONFINITE_CORE_RESOURCE");
 assertThrows(()=>auditPreparedTurn({...base(),requiredNpcIds:["npc.key"]}),Error,"UNRESOLVED_KEY_NPC");
 assertThrows(()=>auditPreparedTurn({...base(),inventoryChanged:true,
  inventory:[["Item ID","Qty","Custodian","Location/container"],["x",1,"shura","bag"],["x",1,"npc","store"]]}),Error,"DUPLICATE_ITEM_INSTANCE");
});
Deno.test("Meta requires no XP; gameplay requires source-backed award or explicit zero",()=>{
 assertEquals(validateTurnCoverage({elapsedSeconds:0,generalEvents:[],learningEvents:[],adaptationEvents:[],strict:true}).status,"META_NO_TIME");
 assertThrows(()=>validateTurnCoverage({elapsedSeconds:60,generalEvents:[],learningEvents:[],adaptationEvents:[],strict:true}),Error,"MISSING_REVIEW");
 assertEquals(validateTurnCoverage({elapsedSeconds:60,generalEvents:[],learningEvents:[],adaptationEvents:[],strict:true,
 review:{outcome:"SOURCE_BASED_ZERO",reason:"No novel source-grounded learning was observed"}}).status,"EXPLICIT_ZERO");
});
Deno.test("GM triage is read-only and player options require active canon",()=>{
 const first=buildTurnTriage({turnClass:"NORMAL",tags:["CRAFT"],memory:{depth:"TARGETED_DEEP",missingSources:["history"]},
 worldPlan:{elapsedSeconds:120,keyNpcDueCount:1,processDueCount:1,truncated:false},
 actorContextRequired:true,actorContextReady:false,
 pendingChoices:[{"Choice ID":"choice.old",Status:"AWAITING_CHOICE","Options JSON":"[]"}]});
 assertEquals(first.timeAdvancedSeconds,0);
 assertEquals(first.gameplayCommitted,false);
 assert(first.blockers.includes("NPC_CONTEXT_GATE_BLOCKED"));
 assertEquals(first.pendingChoices[0].state,"NEEDS_CANONICAL_OPTIONS");
 assert(first.taskCodes.includes("RESOLVE_WORLD_PROCESSES"));
});

Deno.test("Milestone resolution deletes its hot choice row, and auditor requires absence",()=>{
 const result=auditPreparedTurn({...base(),pendingChoices:[["Choice ID","Status","Options JSON"]],
 resolvedChoiceIds:["choice.resolved"]});
 assert(result.checks.includes("resolved_milestone_hot_row_removed"));
 assertThrows(()=>auditPreparedTurn({...base(),resolvedChoiceIds:["choice.legacy"]}),Error,
 "RESOLVED_MILESTONE_STILL_PENDING");
});
Deno.test("Shura must not see duplicated or incomplete active choice options",()=>{
 const option=(id:string)=>({id,name:"Official technique",type:"ACTIVE",trigger:"Specific trigger",effect:"Source-backed effect",limits:"Explicit constraints",scalingState:"v1",sourceRef:"canon.registry.1",canonStatus:"CANON_ACTIVE"});
 const output=buildTurnTriage({turnClass:"NORMAL",tags:[],memory:{depth:"FAST",missingSources:[]},
 worldPlan:null,actorContextRequired:false,actorContextReady:true,
 pendingChoices:[{"Choice ID":"choice.x",Status:"AWAITING_CHOICE",
 "Options JSON":JSON.stringify([option("milestone.same"),option("milestone.same")])}]});
 assertEquals(output.pendingChoices[0].state,"NEEDS_CANONICAL_OPTIONS");
});
