import {strict as assert} from "node:assert";
import {evaluateCapability,readAuthoritativeRatings} from "../src/proficiency.ts";
import {planWorkV1,sampleCargoReceivingWork,type WorkPlanInput} from "../src/task_work_v1.ts";
import {dispatchWorldV3Batch,WORLD_V3_OPERATIONS} from "../src/world_sim_v3/runtime_facade.ts";
import {attachAuthoritativeWorldSources} from "../src/world_sim_v3/source_bridge.ts";
const rows={competences:[["Competence ID","Level"],["competence.knowledge.research",4]],
  specializations:[["Competence ID","Specialization","Stars"],["competence.knowledge.research","Records/systematization",7]],
  characteristics:[["Characteristic","Value"],["Intelligence",8]]};
const cap=evaluateCapability("document_audit",readAuthoritativeRatings(rows),25);
const cargo=sampleCargoReceivingWork();
const verified=new Map([["manifest",cap],["reconcile",cap]]);
Deno.test("cargo stage attribution counts only Shura work, not 2h of loading",()=>{
 const p=planWorkV1(cargo,verified);
 assert.equal(p.baselineSequentialMinutes,120);
 assert.equal(p.shuraActiveMinutes,12);
 assert.equal(p.otherActorMinutes["npc.porters"],70);
 assert.equal(p.projectedLowerBoundMinutes,82);
 assert.equal(p.stages[1].durationMinutes,8);
 assert.equal(p.stages[1].effectiveSpeed,1); // do not double count replaced steps
 assert.equal(p.stages[2].durationMinutes,4);
 assert.equal(p.stages[2].effectiveSpeed,1);
 assert.equal(p.claimedMethodsAttested,false);
 assert.equal(p.requiresIndependentMethodValidation,true);
 assert.equal(p.committed,false);
 assert.equal(p.requiresActualScheduling,true);
});
Deno.test("without approved shortcut the worker must do the real baseline verification effort",()=>{
 const normal:WorkPlanInput={...cargo,stages:cargo.stages.map(s=>({...s,method:undefined}))};
 const p=planWorkV1(normal,verified);
 assert.ok(p.shuraActiveMinutes>=12);
 assert.ok(p.projectedLowerBoundMinutes>=82);
 assert.equal(p.methodEvidenceRefs.length,0);
 assert.equal(p.requiresIndependentMethodValidation,false);
});
Deno.test("sequential versus independent work: single actor cannot work two things at once",()=>{
 const plan:WorkPlanInput={planId:"plan.test.independent",stages:[
  {id:"stage.a",label:"A",actorId:"actor.shura",kind:"active",dependsOn:[],fixedMinutes:0,variableMinutes:10,physicalMinimumMinutes:0},
  {id:"stage.b",label:"B",actorId:"actor.shura",kind:"active",dependsOn:[],fixedMinutes:0,variableMinutes:10,physicalMinimumMinutes:0},
  {id:"stage.c",label:"C",actorId:"npc.worker",kind:"active",dependsOn:[],fixedMinutes:0,variableMinutes:20,physicalMinimumMinutes:0},
 ]};
 const r=planWorkV1(plan);
 assert.equal(r.projectedLowerBoundMinutes,20);
 assert.equal(r.shuraActiveMinutes,20);
 assert.equal(r.stages[0].startsAtMinute,0);
 assert.equal(r.stages[1].startsAtMinute,10);
 assert.equal(r.stages[2].startsAtMinute,0);
});
Deno.test("passive natural process is not accelerated and gives no player work or XP",()=>{
 const plan:WorkPlanInput={planId:"plan.test.natural",stages:[
  {id:"prep",label:"prepare",actorId:"actor.shura",kind:"active",dependsOn:[],fixedMinutes:5,variableMinutes:0,physicalMinimumMinutes:2},
  {id:"cure",label:"cure",actorId:"world.process",kind:"passive",dependsOn:["prep"],fixedMinutes:120,variableMinutes:0,physicalMinimumMinutes:0},
 ]};
 const p=planWorkV1(plan);
 assert.equal(p.projectedLowerBoundMinutes,125);
 assert.equal(p.shuraActiveMinutes,5);
 assert.equal(p.actorMinutes["world.process"],undefined);
 assert.equal(p.stages[1].effectiveSpeed,1);
});
Deno.test("cannot skip physically required time or full legal coverage with unverified selectivity",()=>{
 const p:WorkPlanInput={planId:"plan.test.floor",stages:[
  {id:"stage.a",label:"Physical",actorId:"actor.shura",kind:"verification",dependsOn:[],
   fixedMinutes:5,variableMinutes:55,physicalMinimumMinutes:25,mandatoryFullCoverage:true,
   method:{kind:"selective",methodId:"method.test.selection",sourceRef:"test.method.reference1",checkedFraction:.1,coveragePreserved:false}},
 ]};
 assert.throws(()=>planWorkV1(p),/MANDATORY_COVERAGE/);
 const q={...p,stages:[{...p.stages[0],mandatoryFullCoverage:false}]};
 assert.throws(()=>planWorkV1(q),/PHYSICAL_LIMIT/);
});
Deno.test("malformed shortcuts and dangling dependencies rejected instead of silently clearing stages",()=>{
 const broken={...cargo,stages:cargo.stages.map((s,i)=>i===0?{...s,dependsOn:["not.existing"]}:s)};
 assert.throws(()=>planWorkV1(broken,verified),/DEPENDENCIES/);
 const bad={...cargo,stages:cargo.stages.map((s,i)=>i===1?{
   ...s,method:{kind:"replacement" as const,methodId:"method.test",sourceRef:"forged",replacementMinutes:0,coveragePreserved:true}}:s)};
 assert.throws(()=>planWorkV1(bad,verified),/INVALID_METHOD_SOURCE_REF|PHYSICAL_LIMIT/);
});
Deno.test("new operation and old workshop alias require the authoritative ratings bridge",()=>{
 const save="V2-S0991";
 const req={expectedSaveId:save,jobs:[{id:"task",operation:"task_plan" as const,payload:{plan:cargo}},
   {id:"legacy",operation:"workshop_capacity" as const,payload:{taskPlanV1:cargo}}]};
 const raw=dispatchWorldV3Batch(req,save);
 assert.equal(raw.results[0].result.ok,false);
 assert.equal(raw.results[1].result.ok,false);
 const clock={saveId:save,day:70,time:"08:00:00",sceneId:"scene.test",locationId:"loc.test"};
 const verifiedOutput=attachAuthoritativeWorldSources({request:req,result:raw,clock,skillRows:rows});
 for(const item of verifiedOutput.results){
   assert.equal(item.result.ok,true);
   if(item.result.ok){
    const p=item.result.value as {shuraActiveMinutes:number;claimedMethodsAttested:boolean;committed:boolean};
    assert.equal(p.shuraActiveMinutes,12);
    assert.equal(p.committed,false);
    assert.equal(p.claimedMethodsAttested,false);
   }
 }
 assert.equal(verifiedOutput.committed,false);
 assert.equal(verifiedOutput.sourceAttested,false);
 assert.equal(WORLD_V3_OPERATIONS.includes("task_plan"),true);
});
Deno.test("missing TEMP_RUNTIME skill source refuses work, no fabricated player ability",()=>{
 const save="V2-S0991",clock={saveId:save,day:70,time:"08:00:00",sceneId:"scene.test",locationId:"loc.test"};
 const req={expectedSaveId:save,jobs:[{id:"task",operation:"task_plan" as const,payload:{plan:cargo}}]};
 const raw=dispatchWorldV3Batch(req,save);
 const a=attachAuthoritativeWorldSources({request:req,result:raw,clock});
 assert.equal(a.results[0].result.ok,false);
});
Deno.test("NPC skills do not take Shura's specialization, even if NPC uses same job",()=>{
 const plan:WorkPlanInput={planId:"plan.npc.same_job",stages:[
  {id:"someone",label:"NPC auditing",actorId:"npc.worker",kind:"verification",dependsOn:[],
   fixedMinutes:0,variableMinutes:60,physicalMinimumMinutes:0},
 ]};
 const p=planWorkV1(plan,verified);
 assert.equal(p.projectedLowerBoundMinutes,60);
 assert.equal(p.shuraActiveMinutes,0);
});
