/**
 * Source-backed effective-characteristic frame for RPG V2.
 * Never stores a parallel Shura build or rewrites the committed resource ledger.
 * Existing permanent milestone rules, not a generated buff catalog, provide effects.
 */
export const TEN_CHARACTERISTICS = [
 "Strength","Endurance","Dexterity","Coordination","Perception",
 "Flexibility","Intelligence","Wisdom","Will","Charisma",
] as const;
export type CharacteristicName = typeof TEN_CHARACTERISTICS[number];
type Row=Record<string,unknown>;
const text=(v:unknown)=>String(v??"").trim();
const parse=(x:unknown):number|null=>{
 const s=text(x);if(!s)return null;
 const n=Number(s.replace(",","."));
 return Number.isFinite(n)?n:null;
};
const asNum=(r:Row,name:string)=>parse(r[name]);
const bound=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));

/** HP was agreed as a *candidate* formula; it cannot silently change the live max. */
export function proposedHpMax(level:number,strength:number,endurance:number):number{
 if(!Number.isSafeInteger(level)||level<1||![strength,endurance].every(x=>Number.isFinite(x)&&x>=0))throw Error("EFFECTIVE_HP_INPUT");
 return 20+3*strength+2*endurance+2*(level-1);
}
/** Existing active engine formulas. Will contributes NO extra energy; Wisdom NO mana. */
export function canonicalStaminaMax(level:number,endurance:number):number{
 if(!Number.isSafeInteger(level)||level<1||!Number.isFinite(endurance)||endurance<0)throw Error("EFFECTIVE_STAMINA_INPUT");
 return 26+4*endurance+2*(level-1);
}
export function canonicalManaMax(intelligence:number):number{
 if(!Number.isFinite(intelligence)||intelligence<0)throw Error("EFFECTIVE_MANA_INPUT");
 return 10*intelligence;
}

/** Exact scaling from the already committed "Порядок мастера" passive. */
export function masterOrderTimeReductionPercent(input:{
 craftingLevel:number;intelligence:number;coordination:number;milestoneActive:boolean;
}):number{
 if(!input.milestoneActive)return 0;
 const {craftingLevel:c,intelligence:i,coordination:k}=input;
 if(![c,i,k].every(x=>Number.isSafeInteger(x)&&x>=0))throw Error("MASTER_ORDER_SOURCE");
 if(c<3)return 0;
 const up=(v:number,origin:number)=>Math.floor(Math.max(0,v-origin)/2);
 const down=(v:number,origin:number)=>Math.floor(Math.max(0,origin-v)/2);
 return bound(10+3*up(c,3)+up(i,8)+up(k,7)-down(i,8)-down(k,7),0,25);
}

const TRIGGER_TAGS:Record<string,readonly string[]>={
 "milestone.survival.eye_pioneer":["SURVIVAL","EXPLORATION","OBSERVE","LOOK","TRACK","TRAVEL","FOREST"],
 "milestone.crafting.design_thinking":["CRAFT","BUILD","REPAIR","ENGINEERING","BOWYER","WORK","INSPECT"],
 "milestone.magic.presence_sense":["MAGIC","MANA","SPELL","DIVINE"],
 "milestone.combat.repeatable_shot_cycle":["COMBAT","BOW","ARCHERY","SHOOT"],
 "milestone.research.distinguishability_threshold":["RESEARCH","STUDY","ANALYSIS","MEASURE","EXPERIMENT","ENGINEERING"],
 "milestone.crafting.master_order.lv3":["CRAFT","BUILD","REPAIR","ASSEMBLY","ENGINEERING","WORK"],
};
/** Unrecognized milestones have no invented mechanical effects. */
export function buildEffectiveCharacteristicFrame(input:{
 characteristics:readonly Row[];competences:readonly Row[];specializations:readonly Row[];
 milestones:readonly Row[];level:number;tags:readonly string[];
 committedMax?:{HP?:number|null;Stamina?:number|null;Mana?:number|null};
}) {
 const map=new Map<CharacteristicName,number>(),seen=new Set<string>();
 for(const row of input.characteristics){
  const name=text(row["Characteristic"]);
  if(!TEN_CHARACTERISTICS.includes(name as CharacteristicName))continue;
  if(seen.has(name))throw Error("EFFECTIVE_CHARACTERISTIC_DUPLICATE");
  seen.add(name);
  const n=asNum(row,"Value");
  if(n===null||!Number.isSafeInteger(n)||n<0||n>100)throw Error("EFFECTIVE_CHARACTERISTIC_INVALID");
  map.set(name as CharacteristicName,n);
 }
 const missing=TEN_CHARACTERISTICS.filter(x=>!map.has(x));
 if(missing.length||!Number.isSafeInteger(input.level)||input.level<1){
  return {schema:"RPG_V2_EFFECTIVE_CHARACTERISTICS_V1" as const,ready:false as const,
   sourceOnly:true as const,committed:false as const,missing,reason:"LIVE_CHARACTERISTICS_INCOMPLETE",
   activeMilestones:[],eligiblePassiveEffects:[],derivedResourceComparison:null,
   noAutomaticStatGrant:true as const};
 }
 const attrs=Object.fromEntries(TEN_CHARACTERISTICS.map(k=>[k,map.get(k)!])) as Record<CharacteristicName,number>;
 const levels=new Map<string,number>();
 for(const c of input.competences){
  const id=text(c["Competence ID"]),level=asNum(c,"Level");
  if(!id)continue;
  if(level===null||!Number.isSafeInteger(level)||level<0||level>13||levels.has(id))throw Error("EFFECTIVE_COMPETENCE_INVALID");
  levels.set(id,level);
 }
 const stars=new Map<string,number>();
 for(const row of input.specializations){
  const id=text(row["Competence ID"]),name=text(row["Specialization"]),value=asNum(row,"Stars");
  if(!id||!name)continue;
  if(value===null||!Number.isSafeInteger(value)||value<0||value>10||stars.has(id+"::"+name) || !levels.has(id))throw Error("EFFECTIVE_SPECIALIZATION_INVALID");
  stars.set(id+"::"+name,value);
 }
 const active=input.milestones.filter(m=>text(m["Status"]).toUpperCase()==="ACTIVE");
 const validIds=new Set<string>();
 for(const row of active){const id=text(row["Milestone ID"]);if(!id||validIds.has(id))throw Error("EFFECTIVE_MILESTONE_ID");validIds.add(id);}
 const tags=new Set(input.tags.map(x=>x.toUpperCase()));
 const passive=active.filter(m=>text(m["Type"]).toUpperCase()==="PASSIVE");
 const eligible=passive.filter(m=>(TRIGGER_TAGS[text(m["Milestone ID"])]??[]).some(t=>tags.has(t)))
 .map(m=>({milestoneId:text(m["Milestone ID"]),name:text(m["Name"]),trigger:text(m["Trigger"]),
  effect:text(m["Effect"]),limits:text(m["Limits"]),source:text(m["Last TX"]),
  applicability:"CONDITIONAL_EVIDENCE_REQUIRED" as const}));
 const master=masterOrderTimeReductionPercent({
  craftingLevel:levels.get("competence.crafting.practical_creation")??0,
  intelligence:attrs.Intelligence,coordination:attrs.Coordination,
  milestoneActive:validIds.has("milestone.crafting.master_order.lv3"),
 });
 const hp=proposedHpMax(input.level,attrs.Strength,attrs.Endurance);
 const stamina=canonicalStaminaMax(input.level,attrs.Endurance);
 const mana=canonicalManaMax(attrs.Intelligence);
 return {schema:"RPG_V2_EFFECTIVE_CHARACTERISTICS_V1" as const,ready:true as const,
  sourceOnly:true as const,committed:false as const,actorId:"player.shura" as const,
  values:attrs,competenceLevels:Object.fromEntries(levels),specializationStars:Object.fromEntries(stars),
  activeMilestones:passive.map(m=>({id:text(m["Milestone ID"]),name:text(m["Name"]),effect:text(m["Effect"])})),
  eligiblePassiveEffects:eligible,
  masterOrder:{milestoneActive:validIds.has("milestone.crafting.master_order.lv3"),
   timeReductionPercent:master,eligibleOnlyFor:"familiar preparation and repeated simple assembly; never curing, inspection, travel or new construction",notAppliedWithoutVerifiedTask:true},
  derivedResourceComparison:{
   hpCandidate:hp,hpIsActive:false as const,
   staminaCanonical:stamina,manaCanonical:mana,
   currentCommittedMax:input.committedMax??null,
   requiresExplicitCanonicalMigration: input.committedMax?.HP!==undefined&&input.committedMax.HP!==null&&input.committedMax.HP!==hp,
   noSilentLedgerChanges:true as const,
  },
  noAutomaticStatGrant:true as const,
  rules:[
   "All bonuses originate in current committed rows, never from example characters",
   "A milestone's trigger/limits AND real observation must hold; it cannot reveal hidden facts or choose Shura's action",
   "Derived HP candidate is NOT the saved HP maximum; no future grant, retroactive heal or balance migration here",
   "Active stamina and mana maxima remain 26+4*Endurance+2*(Level-1) and 10*Intelligence",
   "Will governs disciplined effort, not a new Stamina pool",
   "Specialization and competence values are read from the same live source, never awarded from this frame",
  ]};
}
