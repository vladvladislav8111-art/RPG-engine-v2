import {strict as assert} from "node:assert";
import {readAuthoritativeRatings,evaluateCapability} from "../src/proficiency.ts";
import {CRAFT_V4_REFERENCES,previewCraftV4,summarizeCraftReference} from "../src/crafting_v4.ts";
import {dispatchWorldV3Batch} from "../src/world_sim_v3/runtime_facade.ts";
import {attachAuthoritativeWorldSources} from "../src/world_sim_v3/source_bridge.ts";

const competence="competence.crafting.practical_creation";
const rows={
 competences:[["Competence ID","Level"],[competence,3]],
 specializations:[["Competence ID","Specialization","Stars"],[competence,"Резьба по дереву",5],[competence,"Изготовление шнуров",5]],
 characteristics:[["Characteristic","Value"],["Dexterity",5],["Intelligence",5]],
};
const rating=readAuthoritativeRatings(rows);
const spoon=evaluateCapability("wood_carving",rating,20);
const cord=evaluateCapability("cordage",rating,20);
const spoonRecipe="calibration.spoon.dry_blank";
const cordRecipe="calibration.cord.prepared_yarn_1_1m";
const input=(recipeId:string,stageId:string,capability=spoon)=>({
 recipeId,stageId,quantity:1,capability,availableStaffedMinutes:60,priorStageProgressMinutes:0
});
Deno.test("real fantasy speed: 5-star specialist with ordinary characteristics exceeds routine throughput",()=>{
 assert.equal(spoon.specializationStars,5);
 assert.equal(spoon.efficiencyFactor,1.378);
 const untrained=evaluateCapability("wood_carving",{...rating,stars:new Map()},20);
 assert.ok(untrained.efficiencyFactor<0.75);
 const ten=evaluateCapability("wood_carving",{...rating,stars:new Map([[competence+"::Резьба по дереву",10]])},20);
 assert.ok(ten.efficiencyFactor>2.9);
});
Deno.test("reference norms separate hand work from the delivery queue; prepared cord is not 4 days labor",()=>{
 const s=summarizeCraftReference(spoonRecipe),c=summarizeCraftReference(cordRecipe);
 assert.equal(s.activeNormativeMinutes,60);
 assert.equal(c.activeNormativeMinutes,55);
 assert.equal(c.mandatoryPassiveMinutes,0);
 assert.ok(CRAFT_V4_REFERENCES.every(r=>r.referenceOnly));
 assert.equal(summarizeCraftReference(spoonRecipe,2).activeNormativeMinutes,115); // one 5-minute setup shared
});
Deno.test("progress uses skill, tools and familiarity but does not invent goods",()=>{
 const first=previewCraftV4({...input(spoonRecipe,"carve"),availableStaffedMinutes:10});
 const repeat=previewCraftV4({...input(spoonRecipe,"carve"),availableStaffedMinutes:10,
   completedRecipeReceiptRefs:["craft.verified.0001","craft.verified.0002"]});
 assert.equal(first.effectiveSpeed,1.378);
 assert.equal(first.effectiveWorkMinutes,13);
 assert.ok(repeat.effectiveSpeed>first.effectiveSpeed);
 assert.ok(repeat.effectiveWorkMinutes>=first.effectiveWorkMinutes);
 assert.equal(repeat.familiaritySourceAttested,false);
 assert.equal(repeat.committed,false);
 assert.equal(first.qualityPotentialStars,4);
 assert.equal(first.nextStageId,"carve");
});
Deno.test("natural processes never accelerate, even for 10-star master with exceptional tools",()=>{
 const master=evaluateCapability("wood_carving",{...rating,stars:new Map([[competence+"::Резьба по дереву",10]])},10);
 const cure=previewCraftV4({...input("calibration.wood_handle.glued","cure",master),
   availableStaffedMinutes:1000,elapsedNaturalMinutes:30,toolFactor:1.5,
   completedRecipeReceiptRefs:["receipt.repeated.1"]});
 assert.equal(cure.kind,"passive");
 assert.equal(cure.effectiveWorkMinutes,30);
 assert.equal(cure.newStageProgressMinutes,30);
 assert.equal(cure.actualStaffedMinutesUsed,0);
 assert.equal(cure.qualityPotentialStars,null);
 assert.equal(cure.readyForNextStage,false);
 const done=previewCraftV4({...input("calibration.wood_handle.glued","cure",master),
   availableStaffedMinutes:0,elapsedNaturalMinutes:180});
 assert.equal(done.readyForNextStage,true);
 assert.equal(done.nextStageId,"inspect");
});
Deno.test("inspection stage must finish before independent quality check; prediction is not awarded quality",()=>{
 const a=previewCraftV4({...input(cordRecipe,"finish",cord),availableStaffedMinutes:30});
 assert.equal(a.readyForNextStage,true);
 assert.equal(a.nextStageId,"inspect");
 assert.equal(a.requiresInspection,false);
 const q=previewCraftV4({...input(cordRecipe,"inspect",cord),availableStaffedMinutes:10});
 assert.equal(q.readyForNextStage,true);
 assert.equal(q.requiresInspection,true);
 assert.equal(q.nextStageId,null);
 assert.ok(q.qualityPotentialStars!==null);
 assert.equal(q.committed,false);
});
Deno.test("higher difficulty lowers projected quality/risk without changing physical impossibility",()=>{
 const easy=previewCraftV4({...input(spoonRecipe,"finish",spoon)});
 const hard=previewCraftV4({...input(spoonRecipe,"finish",evaluateCapability("wood_carving",rating,95))});
 assert.ok((easy.qualityModifier??-100)>(hard.qualityModifier??100));
 assert.equal(hard.errorRisk,"HIGH");
 assert.equal(hard.referenceOnly,true);
});
Deno.test("tampered reference, stage, claimed familiarity, tool or progress fail closed",()=>{
 assert.throws(()=>previewCraftV4({...input("fictional.recipe","carve")}),/RECIPE_NOT_IN/);
 assert.throws(()=>previewCraftV4({...input(spoonRecipe,"fake")}),/UNKNOWN_STAGE/);
 assert.throws(()=>previewCraftV4({...input(spoonRecipe,"carve"),capability:cord}),/TASK_SKILL_REQUIRED/);
 assert.throws(()=>previewCraftV4({...input(spoonRecipe,"carve"),priorStageProgressMinutes:900}),/PRIOR_PROGRESS/);
 assert.throws(()=>previewCraftV4({...input(spoonRecipe,"carve"),toolFactor:999}),/TOOL_FACTOR/);
 assert.throws(()=>previewCraftV4({...input(spoonRecipe,"carve"),completedRecipeReceiptRefs:["receipt.repeat.1","receipt.repeat.1"]}),/FAMILIARITY_RECEIPTS/);
 assert.throws(()=>previewCraftV4({...input(spoonRecipe,"carve"),completedRecipeReceiptRefs:["fake"]}),/FAMILIARITY_RECEIPTS/);
});
Deno.test("live source facade exposes stage projection, never automatically mints/commits",()=>{
 const save="V2-S0991",clock={saveId:save,day:70,time:"08:00:00",sceneId:"scene.test",locationId:"loc.test"};
 const req={expectedSaveId:save,jobs:[{id:"preview",operation:"capability_check" as const,payload:{
  taskKind:"cordage",difficulty:20,craftV4:{
   recipeId:cordRecipe,stageId:"twist",quantity:1,availableStaffedMinutes:15,
   priorStageProgressMinutes:0,
  }
 }}]};
 const raw=dispatchWorldV3Batch(req,save),v=attachAuthoritativeWorldSources({request:req,result:raw,clock,skillRows:rows});
 const result=v.results[0].result;
 assert.equal(result.ok,true);
 if(result.ok){
  const c=result.value as {craftingV4:{committed:boolean;effectiveWorkMinutes:number}};
  assert.equal(c.craftingV4.committed,false);
  assert.ok(c.craftingV4.effectiveWorkMinutes>15);
 }
 assert.equal(v.committed,false);
});
Deno.test("staged craft progress must exactly match original order; stage completion is not finished goods",()=>{
 const save="V2-S0991",clock={saveId:save,day:70,time:"08:00:00",sceneId:"scene.test",locationId:"loc.test"};
 const order={id:"order.abc",makerId:"actor.shura",buyerId:"npc.buyer",recipeId:cordRecipe,
  paidReceiptId:"paid.abc",status:"working",progressMinutes:0,requiredMinutes:25,
  materials:[],resultTemplateId:"item.cord",resultQuantity:1,deliveryCustodianId:"actor.shura"};
 const common={taskKind:"cordage",difficulty:20,order,interval:{start:0,end:60},
  makerSchedule:[{weekday:0,startMinute:0,endMinute:1440}],holidays:[],
  makerAvailable:true,lots:[],maxStaffedMinutes:60,weekdayAnchor:0};
 const cfg={recipeId:cordRecipe,stageId:"twist",quantity:1,priorStageProgressMinutes:0};
 const req={expectedSaveId:save,jobs:[{id:"stage",operation:"craft_advance" as const,payload:{...common,craftV4:cfg}}]};
 const ok=attachAuthoritativeWorldSources({request:req,result:dispatchWorldV3Batch(req,save),clock,skillRows:rows}).results[0].result;
 assert.equal(ok.ok,true);
 if(ok.ok){const out=ok.value as {stageComplete:boolean;nextStatus:string;craftV4:{requiresInspection:boolean}};
   assert.equal(out.stageComplete,true);assert.equal(out.nextStatus,"working");assert.equal(out.craftV4.requiresInspection,false);}
 const wrong={...req,jobs:[{id:"stage",operation:"craft_advance" as const,payload:{
   ...common,order:{...order,requiredMinutes:1000},craftV4:cfg,
 }}]};
 const denied=attachAuthoritativeWorldSources({request:wrong,result:dispatchWorldV3Batch(wrong,save),clock,skillRows:rows}).results[0].result;
 assert.equal(denied.ok,false);
});
Deno.test("NPC orders never inherit Shura ratings, regardless of caller claimed familiarity",()=>{
 const save="V2-S0991",clock={saveId:save,day:70,time:"08:00:00",sceneId:"scene.test",locationId:"loc.test"};
 const payload={taskKind:"cordage",difficulty:20,
  order:{id:"npc.ord",makerId:"npc.heren",buyerId:"actor.shura",recipeId:cordRecipe,paidReceiptId:"paid.abc",status:"working",progressMinutes:0,requiredMinutes:25,materials:[],resultTemplateId:"cord",resultQuantity:1,deliveryCustodianId:"actor.shura"},
  interval:{start:0,end:60},makerSchedule:[{weekday:0,startMinute:0,endMinute:1440}],holidays:[],makerAvailable:true,lots:[],maxStaffedMinutes:60,weekdayAnchor:0,
  craftV4:{recipeId:cordRecipe,stageId:"twist",quantity:1,completedRecipeReceiptRefs:["receipt.fake0001"]}
 };
 const req={expectedSaveId:save,jobs:[{id:"npc.1",operation:"craft_advance" as const,payload}]};
 const out=attachAuthoritativeWorldSources({request:req,result:dispatchWorldV3Batch(req,save),clock,skillRows:rows}).results[0].result;
 assert.equal(out.ok,false);
 if(!out.ok)assert.equal(out.code,"NONPLAYER_SKILL_NOT_VERIFIED");
});
