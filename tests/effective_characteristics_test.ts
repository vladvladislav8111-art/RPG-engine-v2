import {assert,assertEquals,assertThrows} from "jsr:@std/assert";
import {buildEffectiveCharacteristicFrame,masterOrderTimeReductionPercent,
 proposedHpMax,canonicalStaminaMax,canonicalManaMax,TEN_CHARACTERISTICS} from "../src/effective_characteristics.ts";
import {evaluateCapability,readAuthoritativeRatings,TASK_PROFILES} from "../src/proficiency.ts";

const characteristics=TEN_CHARACTERISTICS.map((n,i)=>({Characteristic:n,
 Value:[7,7,7,7,7,5,8,7,6,5][i]}));
const competences=[
 {"Competence ID":"competence.crafting.practical_creation",Level:3},
 {"Competence ID":"competence.knowledge.research",Level:3},
 {"Competence ID":"competence.combat.melee",Level:2},
 {"Competence ID":"competence.body.physical_conditioning",Level:2},
 {"Competence ID":"competence.society.communication",Level:2},
 {"Competence ID":"competence.survival.general",Level:2},
 {"Competence ID":"competence.magic.perception",Level:2},
];
const specs=[{"Competence ID":"competence.knowledge.research",Specialization:"Records/systematization",Stars:5}];
const milestones=[
 {"Milestone ID":"milestone.crafting.master_order.lv3",Type:"PASSIVE",Status:"ACTIVE",Name:"Порядок мастера",
  Trigger:"familiar repeat setup",Effect:"10% active setup time",Limits:"No automatic accelerated curing", "Last TX":"tx.master"},
 {"Milestone ID":"milestone.survival.eye_pioneer",Type:"PASSIVE",Status:"ACTIVE",Name:"Глаз первопроходца",
  Trigger:"deliberate survey",Effect:"notices source-observable terrain features",Limits:"no hidden routes","Last TX":"tx.eye"},
 {"Milestone ID":"milestone.fake.unearned",Type:"PASSIVE",Status:"DESIGN_CANDIDATE",Name:"Future power"},
];
const frame=(tags:string[]=["CRAFT"])=>buildEffectiveCharacteristicFrame({characteristics,competences,
 specializations:specs,milestones,level:2,tags,committedMax:{HP:56,Stamina:56,Mana:80}});
Deno.test("10 live characteristic attributes and levels, never example-character grants",()=>{
 const f=frame();assertEquals(f.ready,true);
 if(!f.ready)throw Error("missing live frame");
 assertEquals(Object.keys(f.values).length,10);
 assertEquals(f.values.Strength,7);assertEquals(f.values.Will,6);
 assertEquals(f.specializationStars["competence.knowledge.research::Records/systematization"],5);
 assertEquals(f.competenceLevels["competence.crafting.practical_creation"],3);
 assert(!f.activeMilestones.some(m=>m.id==="milestone.fake.unearned"));
 assertEquals(f.masterOrder.timeReductionPercent,10);
 assertEquals(f.derivedResourceComparison.hpCandidate,57);
 assertEquals(f.derivedResourceComparison.hpIsActive,false);
 assertEquals(f.derivedResourceComparison.staminaCanonical,56);
 assertEquals(f.derivedResourceComparison.manaCanonical,80);
 assertEquals(f.derivedResourceComparison.requiresExplicitCanonicalMigration,true);
});
Deno.test("incomplete or duplicate stat sources fail closed",()=>{
 const f=buildEffectiveCharacteristicFrame({characteristics:characteristics.slice(1),
  competences,specializations:specs,milestones,level:2,tags:[]});
 assertEquals(f.ready,false);
 assertThrows(()=>buildEffectiveCharacteristicFrame({characteristics:[...characteristics,characteristics[0]],
  competences,specializations:specs,milestones,level:2,tags:[]}),Error,"EFFECTIVE_CHARACTERISTIC_DUPLICATE");
});
Deno.test("pasives require active source, topical trigger; not magical detection",()=>{
 const t=frame(["SURVIVAL"]);if(!t.ready)throw Error("not ready");
 assertEquals(t.eligiblePassiveEffects.map(m=>m.milestoneId),["milestone.survival.eye_pioneer"]);
 assertEquals(t.eligiblePassiveEffects[0].applicability,"CONDITIONAL_EVIDENCE_REQUIRED");
 const a=frame(["FISH"]);if(!a.ready)throw Error("not ready");assertEquals(a.eligiblePassiveEffects.length,0);
});
Deno.test("master order scales exactly per committed milestone and is bounded",()=>{
 const f=(c:number,i:number,k:number,a=true)=>masterOrderTimeReductionPercent({
  craftingLevel:c,intelligence:i,coordination:k,milestoneActive:a});
 assertEquals(f(3,8,7),10);assertEquals(f(5,10,9),15);
 assertEquals(f(3,6,5),8);assertEquals(f(1,8,7),0);
 assertEquals(f(13,40,40),25);assertEquals(f(3,8,7,false),0);
});
Deno.test("resource formulas do not turn Will or Wisdom into new resources",()=>{
 assertEquals(proposedHpMax(2,7,7),57);
 assertEquals(canonicalStaminaMax(2,7),56);
 assertEquals(canonicalManaMax(8),80);
});
Deno.test("each of ten attributes affects at least one registered task check",()=>{
 const rows={
  competences:[["Competence ID","Level"],...competences.map(x=>[x["Competence ID"],x.Level])],
  specializations:[["Competence ID","Specialization","Stars"],...specs.map(x=>[x["Competence ID"],x.Specialization,x.Stars])],
  characteristics:[["Characteristic","Value"],...characteristics.map(x=>[x.Characteristic,x.Value])],
 };
 const ratings=readAuthoritativeRatings(rows);
 for(const stat of TEN_CHARACTERISTICS){
  const task=Object.entries(TASK_PROFILES).find(([,profile])=>profile.characteristic===stat
    ||profile.secondaryCharacteristic===stat);
  assert(task!==undefined,"No canonical task uses "+stat);
  const [kind]=task!;
  const base=evaluateCapability(kind as keyof typeof TASK_PROFILES,ratings,30);
  const attributes=new Map(ratings.characteristics);
  attributes.set(stat,(attributes.get(stat)??5)+2);
  const improved=evaluateCapability(kind as keyof typeof TASK_PROFILES,{...ratings,characteristics:attributes},30);
  assert(improved.score>base.score,stat+" should improve capability score");
  assertEquals(base.committed,false);
 }
});
Deno.test("supporting characteristics cannot be counted twice if equal to primary",()=>{
 const rows={
  competences:[["Competence ID","Level"],["competence.body.physical_conditioning",2]],
  specializations:[["Competence ID","Specialization","Stars"]],
  characteristics:[["Characteristic","Value"],["Strength",7],["Endurance",7]],
 };
 const cap=evaluateCapability("heavy_lifting",readAuthoritativeRatings(rows),30);
 assertEquals(cap.primaryCharacteristic,"Strength");
 assertEquals(cap.secondaryCharacteristic,"Endurance");
 assert(cap.secondaryCharacteristicBonus>0);
});

Deno.test("V3 capability check reads real stats and flags committed passive conditionally",async()=>{
 const {dispatchWorldV3Batch}=await import("../src/world_sim_v3/runtime_facade.ts");
 const {attachAuthoritativeWorldSources}=await import("../src/world_sim_v3/source_bridge.ts");
 const ratings={
  competences:[["Competence ID","Level"],...competences.map(x=>[x["Competence ID"],x.Level])],
  specializations:[["Competence ID","Specialization","Stars"],...specs.map(x=>[x["Competence ID"],x.Specialization,x.Stars])],
  characteristics:[["Characteristic","Value"],...characteristics.map(x=>[x.Characteristic,x.Value])],
  milestones:[["Milestone ID","Status"],["milestone.crafting.master_order.lv3","ACTIVE"]],
 };
 const id="V2-S9001",clock={saveId:id,day:73,time:"18:00:00",sceneId:"scene.test",locationId:"loc.test"};
 const req={expectedSaveId:id,jobs:[{id:"kit",operation:"capability_check" as const,
  payload:{taskKind:"kit_assembly",difficulty:27}}]};
 const raw=dispatchWorldV3Batch(req,id);
 const safe=attachAuthoritativeWorldSources({request:req,result:raw,clock,skillRows:ratings}).results[0].result;
 assertEquals(safe.ok,true);
 if(!safe.ok)throw Error("capability failed");
 const v=safe.value as {conditionalPassive:{timeReductionPercent:number;automaticallyCharged:boolean;taskFamiliarityAttested:boolean}};
 assertEquals(v.conditionalPassive.timeReductionPercent,10);
 assertEquals(v.conditionalPassive.automaticallyCharged,false);
 assertEquals(v.conditionalPassive.taskFamiliarityAttested,false);
 const denied=attachAuthoritativeWorldSources({request:req,result:raw,clock}).results[0].result;
 assertEquals(denied.ok,false);
 const disabled=attachAuthoritativeWorldSources({request:req,result:raw,clock,skillRows:{
  ...ratings,milestones:[["Milestone ID","Status"],["milestone.crafting.master_order.lv3","DESIGN_CANDIDATE"]]
 }}).results[0].result;
 assertEquals(disabled.ok,true);
 if(!disabled.ok)throw Error("expected no automatic milestone");
 assertEquals((disabled.value as {conditionalPassive:null}).conditionalPassive,null);
});
