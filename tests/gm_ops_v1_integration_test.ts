import {strict as assert} from "node:assert";
import {dispatchWorldV3Batch,WORLD_V3_OPERATIONS} from "../src/world_sim_v3/runtime_facade.ts";
Deno.test("GM turn audit uses the same 12-job V3 gateway, no new endpoint or commit",()=>{
 const r=dispatchWorldV3Batch({expectedSaveId:"V2-S0852",jobs:[
 {id:"market.review",operation:"gm_turn_audit",payload:{
   tags:["MARKET","WORK","RUMOR"],elapsedSeconds:0,
   counts:[{id:"count.boxes.one",originalRef:"source.merchant.original",comparisonRef:"source.worker.count",
     original:30,compared:31,units:"boxes"}],
   demands:[],reputation:[],rumorOpportunities:[]}}]},"V2-S0852");
 assert.equal(r.results.length,1);assert(r.results[0].result.ok);
 if(r.results[0].result.ok){
  const packet=r.results[0].result.value as {sourceAttested:boolean;blockers:string[];counts:{documentDelta:number}[];readyForSemanticCommit:boolean};
  assert.equal(packet.sourceAttested,false);
  assert.equal(packet.readyForSemanticCommit,false);
  assert.equal(packet.counts[0].documentDelta,1);
  assert(packet.blockers.includes("NO_MATERIALIZED_DEMAND"));
 }
 assert(WORLD_V3_OPERATIONS.includes("gm_turn_audit"));
 assert.equal(r.committed,false);
});
Deno.test("GM work audit does not bypass live skill capability proof",()=>{
 const batch=dispatchWorldV3Batch({expectedSaveId:"V2-S0852",jobs:[
  {id:"unsafe.skill.claim",operation:"capability_check",payload:{taskKind:"document_audit",difficulty:20,efficiencyFactor:100}},
  {id:"unsafe.work.claim",operation:"task_plan",payload:{planId:"fake.contract",stages:[]}}
 ]},"V2-S0852");
 assert(batch.results.every(x=>!x.result.ok));
});
