import assert from "node:assert/strict";
import {reviewNpcHeatHistoryReadiness,type HistoryReadinessClaim} from "../src/npc_heat_history_readiness.ts";
const base:HistoryReadinessClaim={
 actorId:"npc.test.only",worldDay:67,signedEpochId:"TEST-EPOCH-001",
 genesisSigned:true,tailSigned:true,completeTxIndex:true,
 allEpochRowsSigned:true,chainContinuous:true,
 keyRotationContinuity:true,actorHistoryComplete:true,
 canonicalMemoryCorroborated:true,npcKnowledgeCorroborated:true,
 runtimeSnapshotStable:true,noOrphanWriter:true,
 meaningfulDays:[10,11,12,13,14,15].map(day=>({
  actorId:"npc.test.only",day,kind:"SUBSTANTIVE_EXCHANGE" as const,
  sourceRef:"memory:tx."+day,canonicalMemoryRef:"memory:tx."+day,
  meaningfulEvidence:"A distinct documented substantive interaction.",
  signedOriginVerified:true,
 })),
};
Deno.test("all claimed proof flags still require independent GM review, never automatic Heat or KEY",()=>{
 const x=reviewNpcHeatHistoryReadiness(base);
 assert.equal(x.status,"PENDING_INDEPENDENT_GM_REVIEW");
 assert.equal(x.meaningfulDayCount,6);
 assert.equal(x.automaticHeatPromotion,false);
 assert.equal(x.automaticKeyPromotion,false);
 assert.equal(x.automaticXpOrSupAward,false);
 assert.equal(x.memoryPruningAuthorized,false);
 assert.equal(x.historyAuthenticatedForPromotion,false);
});
Deno.test("scene presence never counts toward meaningful days, nor six same-day repetitions",()=>{
 const scene=base.meaningfulDays.map(e=>({...e,kind:"SCENE_PRESENCE" as const}));
 const x=reviewNpcHeatHistoryReadiness({...base,meaningfulDays:scene});
 assert.equal(x.meaningfulDayCount,0);
 assert.equal(x.status,"NOT_READY");
 const repeat=base.meaningfulDays.map((e,i)=>({
  ...e,day:12,sourceRef:"memory:event."+i,
  canonicalMemoryRef:"memory:event."+i,
 }));
 const y=reviewNpcHeatHistoryReadiness({...base,meaningfulDays:repeat});
 assert.equal(y.meaningfulDayCount,1);
});
Deno.test("unsigned, other actor, fake canonical refs, future day and trivial chat cannot count",()=>{
 const faulty=base.meaningfulDays.map((e,i)=>i===0?{...e,signedOriginVerified:false}:
  i===1?{...e,actorId:"npc.another"}:
  i===2?{...e,canonicalMemoryRef:null}:
  i===3?{...e,day:999}:
  i===4?{...e,meaningfulEvidence:"hi"}:
  {...e,sourceRef:"scene:untrusted"});
 const x=reviewNpcHeatHistoryReadiness({...base,meaningfulDays:faulty});
 assert.equal(x.meaningfulDayCount,0);
 assert.equal(x.rejectedClaims,6);
 assert.equal(x.status,"NOT_READY");
});
Deno.test("every historical gap and locked writer independently blocks readiness",()=>{
 const required=[
  "genesisSigned","tailSigned","completeTxIndex","allEpochRowsSigned",
  "chainContinuous","keyRotationContinuity","actorHistoryComplete",
  "canonicalMemoryCorroborated","npcKnowledgeCorroborated",
  "runtimeSnapshotStable","noOrphanWriter",
 ] as const;
 for(const k of required){
  const x=reviewNpcHeatHistoryReadiness({...base,[k]:false});
  assert.equal(x.status,"NOT_READY",k);
  assert.equal(x.automaticHeatPromotion,false);
 }
});
Deno.test("existing V1/V2 TEST rows cannot become an invented signed V3 epoch",()=>{
 const x=reviewNpcHeatHistoryReadiness({
  ...base,signedEpochId:null,genesisSigned:false,
  allEpochRowsSigned:false,meaningfulDays:[],
 });
 assert.equal(x.status,"NOT_READY");
 assert.ok(x.blockers.includes("NO_SIGNED_V3_EPOCH_GENESIS"));
 assert.equal(x.committedWrites,0);
});
