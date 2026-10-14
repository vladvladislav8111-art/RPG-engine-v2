import {strict as assert} from "node:assert";
import {planWorkV1,type WorkPlanInput} from "../src/task_work_v1.ts";
import type {WorkTimeModelV2} from "../src/task_work_time_v2.ts";
import {dispatchWorldV3Batch} from "../src/world_sim_v3/runtime_facade.ts";
import {attachAuthoritativeWorldSources} from "../src/world_sim_v3/source_bridge.ts";
const win=(startMinute:number,endMinute:number)=>({startMinute,endMinute});
const src="source.calendar.day73";
const stage=(id:string,actorId:string,minutes:number,dependsOn:string[]=[],more:Record<string,unknown>={})=>({
 id,label:id,actorId,kind:"active" as const,dependsOn,fixedMinutes:0,
 variableMinutes:minutes,physicalMinimumMinutes:0,workloadSourceRef:"source.task."+id,...more,
});
const calendar=(horizonMinutes=200):WorkTimeModelV2=>({
 horizonMinutes,
 actorCalendars:[
  {id:"actor.shura",sourceRef:src,available:[win(0,30),win(60,150)]},
  {id:"npc.helper",sourceRef:src,available:[win(0,150)]},
 ],
 resourceCalendars:[
  {id:"tool.press",sourceRef:"source.tool.press",available:[win(0,150)]},
 ],
});
Deno.test("time V2: two shifts preserve actual labor but extend elapsed time",()=>{
 const plan:WorkPlanInput={planId:"work.shift",stages:[stage("research","actor.shura",40)],timeModelV2:calendar()};
 const r=planWorkV1(plan);
 assert.equal(r.shuraActiveMinutes,40);
 assert.equal(r.projectedLowerBoundMinutes,70);
 assert.equal(r.timeModelV2?.unconstrainedLowerBoundMinutes,40);
 assert.equal(r.timeModelV2?.shuraEngagementSpanMinutes,70);
 assert.deepEqual(r.stages[0].activeIntervals,[win(0,30),win(60,70)]);
 assert.equal(r.stages[0].calendarIdleMinutes,30);
 assert.equal(r.timeModelV2?.commitAuthorized,false);
});
Deno.test("time V2: NPC can work in parallel while Shura pauses; no NPC labor credited to Shura",()=>{
 const plan:WorkPlanInput={planId:"work.parallel",stages:[
   stage("stage.a","actor.shura",40),
   stage("stage.b","npc.helper",50),
   stage("stage.c","actor.shura",10,["stage.b"])
 ],timeModelV2:calendar()};
 const r=planWorkV1(plan);
 assert.equal(r.shuraActiveMinutes,50);
 assert.equal(r.otherActorMinutes["npc.helper"],50);
 assert.equal(r.stages[1].startsAtMinute,0);
 assert.equal(r.stages[2].startsAtMinute,70);
 assert.equal(r.projectedLowerBoundMinutes,80);
});
Deno.test("time V2: shared tool cannot be used simultaneously by two actors",()=>{
 const plan:WorkPlanInput={planId:"work.shared",stages:[
   stage("stage.a","actor.shura",20,[],{resourceIds:["tool.press"]}),
   stage("stage.b","npc.helper",20,[],{resourceIds:["tool.press"]}),
 ],timeModelV2:calendar()};
 const r=planWorkV1(plan);
 assert.equal(r.stages[0].startsAtMinute,0);
 assert.equal(r.stages[1].startsAtMinute,20);
 assert.equal(r.projectedLowerBoundMinutes,40);
});
Deno.test("time V2: unavailable actor reservations delay work and passive waits don't spend labor",()=>{
 const m=calendar();
 m.actorCalendars[0]={...m.actorCalendars[0],busy:[win(0,20)]};
 const plan:WorkPlanInput={planId:"work.natural",stages:[
  stage("shura","actor.shura",10),
  {id:"dry",label:"Natural drying",actorId:"world.process",kind:"passive",dependsOn:["shura"],
   fixedMinutes:40,variableMinutes:0,physicalMinimumMinutes:0,workloadSourceRef:"source.drying.window"},
  stage("npc","npc.helper",10,["shura"]),
 ],timeModelV2:m};
 const r=planWorkV1(plan);
 assert.equal(r.stages[0].startsAtMinute,20);
 assert.equal(r.stages[0].preStartDelayMinutes,20);
 assert.equal(r.stages[1].finishesAtMinute,70);
 assert.equal(r.stages[2].startsAtMinute,30);
 assert.equal(r.shuraActiveMinutes,10);
 assert.equal(r.otherActorMinutes["npc.helper"],10);
});
Deno.test("time V2: passive resource occupies a rack continuously, pauses cannot accelerate it",()=>{
 const m=calendar();
 m.resourceCalendars![0]={...m.resourceCalendars![0],busy:[win(25,35)]};
 const plan:WorkPlanInput={planId:"work.rack",stages:[
  {id:"dry",label:"Dry",actorId:"world.process",kind:"passive",dependsOn:[],
    fixedMinutes:20,variableMinutes:0,physicalMinimumMinutes:0,resourceIds:["tool.press"],workloadSourceRef:"source.rack.real"},
  stage("npc","npc.helper",15,[],{resourceIds:["tool.press"]}),
 ],timeModelV2:m};
 const r=planWorkV1(plan);
 assert.deepEqual(r.stages[0].activeIntervals,[win(0,20)]);
 assert.equal(r.stages[1].startsAtMinute,20);
 assert.deepEqual(r.stages[1].activeIntervals,[win(20,25),win(35,45)]);
 assert.equal(r.stages[1].finishesAtMinute,45);
});
Deno.test("time V2: failures are closed for missing source, unavailable time, deadlines and overlapping windows",()=>{
 const good:WorkPlanInput={planId:"work.refusal",stages:[stage("stage.a","actor.shura",40)],timeModelV2:calendar()};
 assert.throws(()=>planWorkV1({...good,stages:[{...good.stages[0],workloadSourceRef:undefined}]}),/WORKLOAD_EVIDENCE_REQUIRED/);
 assert.throws(()=>planWorkV1({...good,timeModelV2:{...calendar(),actorCalendars:[]}}),/ACTOR_SOURCE_REQUIRED/);
 assert.throws(()=>planWorkV1({...good,stages:[{...good.stages[0],mustFinishByMinute:50}]}),/DEADLINE_UNREACHABLE/);
 assert.throws(()=>planWorkV1({...good,timeModelV2:{...calendar(),horizonMinutes:35}}),/BAD_ACTOR_AVAILABLE_WINDOW|NOT_SCHEDULABLE/);
 assert.throws(()=>planWorkV1({...good,timeModelV2:{...calendar(),actorCalendars:[{id:"actor.shura",sourceRef:src,available:[win(0,60),win(30,90)]}]}}),/BAD_ACTOR_AVAILABLE_WINDOW/);
});
Deno.test("time V2: travel and household plans without verified workload cannot masquerade as authoritative",()=>{
 const plan:WorkPlanInput={planId:"work.generic",stages:[stage("wash","actor.shura",15)],timeModelV2:calendar()};
 const save="V2-S0852";
 const req={expectedSaveId:save,jobs:[{id:"time",operation:"task_plan" as const,payload:{plan}}]};
 const raw=dispatchWorldV3Batch(req,save);
 const clock={saveId:save,day:73,time:"17:59:00",sceneId:"scene.check",locationId:"loc.check"};
 const skills={competences:[["Competence ID","Level"]],specializations:[["Competence ID","Specialization","Stars"]],characteristics:[["Characteristic","Value"]]};
 const result=attachAuthoritativeWorldSources({request:req,result:raw,clock,skillRows:skills});
 assert.equal(result.results[0].result.ok,true);
 if(result.results[0].result.ok){
  const r=result.results[0].result.value as ReturnType<typeof planWorkV1>;
  assert.equal(r.timeModelV2?.actorAvailabilityAttested,false);
  assert.equal(r.shuraActiveMinutes,15);
  assert.equal(r.committed,false);
 }
});
