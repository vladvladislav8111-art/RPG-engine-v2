/** Optional, source-bound survival rules for the new Orario Player.
 * Healing, injuries, daily training, and usable shop inventory are kept
 * inside the same Player snapshot. A plan never fabricates a victory.
 * Exact physiological values are crossover house rules, not canon claims.
 */
import {
 completeJinwooDaily,effectiveJinwooMaxHp,effectiveJinwooMaxMp,
 JINWOO_STORE,shopAvailable,KANDIARU_BLESSING_FLAG,type JinwooState
} from "./shadow_monarch_rules.ts";
export type InjuryLocation="head"|"torso"|"left_arm"|"right_arm"|"left_leg"|"right_leg";
export type InjuryKind="bruise"|"bleeding"|"fracture"|"burn"|"poison";
export type PlayerInjury={id:string;location:InjuryLocation;kind:InjuryKind;
 severity:1|2|3;createdRef:string;treated:boolean;active:boolean};
export type PlayerDailyExercise="pushups"|"squats"|"situps"|"runMeters";
export type DailyTraining={
 day:number;issuedRef:string;deadlineMinute:number;
 exercises:Record<PlayerDailyExercise,number>;status:"active"|"claimed"|"failed";
 rewardRef?:string;
};
export const DAILY_TARGETS:Readonly<Record<PlayerDailyExercise,number>>={
 pushups:100,squats:100,situps:100,runMeters:10000
};
const valid=(s:string)=>/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(s);
const copy=(s:JinwooState)=>structuredClone(s);
const source=(s:JinwooState,ref:string)=>{
 if(!valid(ref)||s.appliedRewardRefs.includes(ref))
  throw Error("PLAYER_SURVIVAL_SOURCE_DUPLICATE");
 if(s.awaitingActivation)throw Error("PLAYER_SURVIVAL_SYSTEM_NOT_ACTIVE");
};
export function previewInjuryPenalties(s:JinwooState){
 const injuries=(s.injuries??[]).filter(i=>i.active);
 let attackPenalty=0,defensePenalty=0,speedPenalty=0,focusPenalty=0;
 for(const wound of injuries){
  const scale=wound.treated?Math.max(1,wound.severity-1):wound.severity;
  if(wound.kind==="bleeding"||wound.kind==="fracture"||wound.kind==="burn")
   attackPenalty+=scale*2;
  if(["left_leg","right_leg"].includes(wound.location))speedPenalty+=scale*5;
  if(["left_arm","right_arm"].includes(wound.location))attackPenalty+=scale*5;
  if(wound.location==="torso")defensePenalty+=scale*4;
  if(wound.location==="head")focusPenalty+=scale*6;
 }
 return {injuries,attackPenalty,defensePenalty,speedPenalty,focusPenalty,
  requiresTreatment:injuries.some(x=>!x.treated),readOnly:true};
}
export function applyConfirmedInjury(s:JinwooState,e:{
 sourceRef:string;injuryId:string;location:InjuryLocation;kind:InjuryKind;
 severity:1|2|3;damage:number;confirmedCause:true;
}):JinwooState{
 source(s,e.sourceRef);
 if(!e.confirmedCause||!valid(e.injuryId)||
  !["head","torso","left_arm","right_arm","left_leg","right_leg"].includes(e.location)||
  !["bruise","bleeding","fracture","burn","poison"].includes(e.kind)||
  ![1,2,3].includes(e.severity)||
  !Number.isInteger(e.damage)||e.damage<0||e.damage>100000||
  (s.injuries??[]).some(x=>x.id===e.injuryId)||
  (s.injuries??[]).length>=64)
  throw Error("PLAYER_INJURY_CAUSE_UNCONFIRMED");
 // Kandiaru's blessing, awarded with Player awakening, provides
 // poison immunity from day one. Poison-only damage/status is purged;
 // physical bite damage must be reported separately as physical injury.
 if(e.kind==="poison"&&s.storyFlags.includes(KANDIARU_BLESSING_FLAG)){
  const immune=copy(s);
  immune.appliedRewardRefs.push(e.sourceRef);
  return immune;
 }
 const n=copy(s);
 n.hp=Math.max(0,n.hp-e.damage);
 n.injuries=[...(n.injuries??[]),{
  id:e.injuryId,location:e.location,kind:e.kind,
  severity:e.severity,createdRef:e.sourceRef,active:true,treated:false
 }];
 n.appliedRewardRefs.push(e.sourceRef);
 return n;
}
export function applyConfirmedCombatDamage(s:JinwooState,e:{
 sourceRef:string;damage:number;confirmedHit:true;
}):JinwooState{
 source(s,e.sourceRef);
 if(!e.confirmedHit||!Number.isSafeInteger(e.damage)||e.damage<0||
  e.damage>100000)throw Error("PLAYER_COMBAT_DAMAGE_NOT_CONFIRMED");
 const n=copy(s);
 const actual=s.storyFlags.includes("status.kasaka_armor_scales_20")?
  Math.max(0,Math.round(e.damage*.8)):e.damage;
 n.hp=Math.max(0,n.hp-actual);
 n.appliedRewardRefs.push(e.sourceRef);return n;
}
/** Physical rest is slower than daily quest Recovery and does not heal
 * severe wounds. Passage of world time is verified by the event adapter.
 */
export function completeConfirmedRest(s:JinwooState,e:{
 sourceRef:string;minutes:number;safeRestLocation:boolean;
 playerConfirmed:boolean;
}):JinwooState{
 source(s,e.sourceRef);
 if(!e.playerConfirmed||!e.safeRestLocation||s.activeEncounter||
  s.hp<=0||!Number.isSafeInteger(e.minutes)||
  e.minutes<60||e.minutes>2880)
  throw Error("PLAYER_REST_NOT_AVAILABLE");
 const n=copy(s);
 n.hp=Math.min(effectiveJinwooMaxHp(n),n.hp+
  Math.floor(effectiveJinwooMaxHp(n)*e.minutes/7200));
 n.mp=Math.min(effectiveJinwooMaxMp(n),n.mp+
  Math.floor(effectiveJinwooMaxMp(n)*e.minutes/960));
 n.fatigue=Math.max(0,n.fatigue-Math.floor(e.minutes/8));
 for(const wound of n.injuries??[]){
  if(wound.active&&wound.treated&&wound.kind==="bruise"&&
   wound.severity===1&&e.minutes>=480)wound.active=false;
 }
 n.appliedRewardRefs.push(e.sourceRef);return n;
}
/** A witnessed rescue/clinic visit ends unconscious combat only if medical
 * help and arrival at the ward were attested by the actual Lab event.
 * Severe injuries persist for later follow-up.
 */
export function receiveConfirmedMedicalCare(s:JinwooState,e:{
 sourceRef:string;confirmedHealer:boolean;atOrarioWard:boolean;
 minutes:number;confirmedRescue?:boolean;costValis:number;
}):JinwooState{
 source(s,e.sourceRef);
 if(!e.confirmedHealer||!e.atOrarioWard||
  !Number.isSafeInteger(e.minutes)||e.minutes<30||
  e.minutes>10080||!Number.isSafeInteger(e.costValis)||
  e.costValis<0||e.costValis>1e7||e.costValis>s.valis||
  (s.hp<=0&&e.confirmedRescue!==true)||
  (s.activeEncounter&&s.hp>0))
  throw Error("PLAYER_MEDICAL_CARE_NOT_VERIFIED");
 const n=copy(s);
 n.activeEncounter=undefined;
 n.valis-=e.costValis;
 n.hp=Math.max(n.hp,Math.ceil(effectiveJinwooMaxHp(n)*.12));
 for(const wound of n.injuries??[]){
  if(!wound.active)continue;
  wound.treated=true;
  if(wound.severity===1&&e.minutes>=60)wound.active=false;
  if(wound.severity===2&&e.minutes>=2880)wound.active=false;
  if(wound.severity===3&&e.minutes>=7200)wound.active=false;
 }
 n.appliedRewardRefs.push(e.sourceRef);return n;
}
const restorative:Readonly<Record<string,{hp?:number;mp?:number;fatigue?:number;
 heal?:InjuryKind;stabilize?:boolean}>>={
 potion_hp_small:{hp:.2},potion_hp_medium:{hp:.45},
 potion_hp_large:{hp:.7},potion_hp_supreme:{hp:.95},
 potion_mp_small:{mp:.2},potion_mp_medium:{mp:.45},
 potion_mp_large:{mp:.7},potion_mp_supreme:{mp:.95},
 potion_fatigue:{fatigue:35},potion_detox:{heal:"poison"},
 potion_antidote_greater:{heal:"poison"},
 wound_dressing:{stabilize:true},ointment_burn:{heal:"burn"},
};
export function consumeConfirmedSystemItem(s:JinwooState,e:{
 sourceRef:string;itemId:string;confirmedUse:true;
}):JinwooState{
 source(s,e.sourceRef);
 // Kasaka's Venom keeps its permanent physical-defense boon.
 // Kandiaru's *already existing* blessing neutralizes the toxic
 // -35 Strength side effect. It is not newly learned Detoxification.
 if(e.itemId==="kasaka_venom"){
  const bossProof=Object.entries(s.defeatEvidence??{}).some(([ref,v])=>
   v.monsterId==="system.kasaka"&&(s.systemDropRefs??[]).includes(ref));
  if(!e.confirmedUse||!bossProof||(s.inventory.kasaka_venom??0)!==1||
     s.storyFlags.includes("status.kasaka_armor_scales_20")||
     s.hp<=0)throw Error("KASAKA_VENOM_NOT_OWNED_OR_ALREADY_USED");
  const n=copy(s);
  delete n.inventory.kasaka_venom;
  n.storyFlags.push("status.kasaka_armor_scales_20");
  if(!n.storyFlags.includes(KANDIARU_BLESSING_FLAG)&&
     !n.unlockedSkills.includes("detoxification"))
   n.storyFlags.push("status.kasaka_weakened_muscles_35");
  n.appliedRewardRefs.push(e.sourceRef);
  return n;
 }
 // Full status recovery awarded by a daily quest is an independent,
 // player-triggered single-use item, not a choice that replaces the random box.
 if(e.itemId==="daily_status_recovery_charge"){
  if(!e.confirmedUse||s.hp<=0||
     (s.inventory.daily_status_recovery_charge??0)<=0)
   throw Error("PLAYER_DAILY_RECOVERY_NOT_OWNED");
  const n=copy(s);
  n.inventory.daily_status_recovery_charge--;
  if(n.inventory.daily_status_recovery_charge===0)
   delete n.inventory.daily_status_recovery_charge;
  n.hp=effectiveJinwooMaxHp(n);
  n.mp=effectiveJinwooMaxMp(n);
  n.fatigue=0;
  for(const wound of n.injuries??[])
   if(wound.active){wound.treated=true;
    if(wound.severity===1)wound.active=false;}
  n.appliedRewardRefs.push(e.sourceRef);
  return n;
 }
 const ability=restorative[e.itemId];
 if(s.hp<=0)throw Error("PLAYER_UNCONSCIOUS_CANNOT_SELF_MEDICATE");
 if(!ability||(s.inventory[e.itemId]??0)<=0||!e.confirmedUse)
  throw Error("PLAYER_CONSUMABLE_NOT_OWNED");
 const n=copy(s);
 n.inventory[e.itemId]--;
 if(n.inventory[e.itemId]===0)delete n.inventory[e.itemId];
 if(ability.hp)n.hp=Math.min(effectiveJinwooMaxHp(n),
  n.hp+Math.ceil(effectiveJinwooMaxHp(n)*ability.hp));
 if(ability.mp)n.mp=Math.min(effectiveJinwooMaxMp(n),
  n.mp+Math.ceil(effectiveJinwooMaxMp(n)*ability.mp));
 if(ability.fatigue)n.fatigue=Math.max(0,n.fatigue-ability.fatigue);
 if(ability.heal)for(const wound of n.injuries??[]){
  if(wound.kind===ability.heal&&wound.active){wound.treated=true;
   if(wound.severity===1)wound.active=false;}
 }
 if(ability.stabilize)for(const wound of n.injuries??[]){
  if(wound.kind==="bleeding"&&wound.active)wound.treated=true;
 }
 n.appliedRewardRefs.push(e.sourceRef);
 return n;
}
export function startConfirmedDailyTraining(s:JinwooState,e:{
 sourceRef:string;day:number;confirmedOffer:true;
}):JinwooState{
 source(s,e.sourceRef);
 if(!e.confirmedOffer||!Number.isSafeInteger(e.day)||e.day<0||
  (s.dailyTraining?.status==="active")||
  (s.dailyHistory??[]).includes(e.day)||
  (s.dailyHistory??[]).length>=500)
  throw Error("PLAYER_DAILY_QUEST_ALREADY_OFFERED");
 const n=copy(s);
 n.dailyTraining={
  day:e.day,issuedRef:e.sourceRef,deadlineMinute:(e.day+1)*1440,
  exercises:{pushups:0,squats:0,situps:0,runMeters:0},status:"active"
 };
 n.dailyHistory=[...(n.dailyHistory??[]),e.day];
 n.appliedRewardRefs.push(e.sourceRef);return n;
}
export function recordConfirmedTraining(s:JinwooState,e:{
 sourceRef:string;day:number;exercise:PlayerDailyExercise;
 count:number;playerConfirmed:true;
}):JinwooState{
 source(s,e.sourceRef);
 if(!e.playerConfirmed||!s.dailyTraining||
  s.dailyTraining.day!==e.day||s.dailyTraining.status!=="active"||
  !Object.hasOwn(DAILY_TARGETS,e.exercise)||
  !Number.isSafeInteger(e.count)||e.count<1||e.count>10000)
  throw Error("PLAYER_DAILY_PROGRESS_INVALID");
 const n=copy(s);
 n.dailyTraining!.exercises[e.exercise]=Math.min(DAILY_TARGETS[e.exercise],
  n.dailyTraining!.exercises[e.exercise]+e.count);
 n.appliedRewardRefs.push(e.sourceRef);return n;
}
export function claimConfirmedDailyTraining(s:JinwooState,e:{
 sourceRef:string;day:number;playerClaimed:true;
 /** Obsolete UI field accepted for backward compatibility; no choice is required. */
 choice?:"random_box"|"recovery";
}):JinwooState{
 source(s,e.sourceRef);
 if(!e.playerClaimed||!s.dailyTraining||s.dailyTraining.day!==e.day||
    s.dailyTraining.status!=="active"||
    Object.entries(DAILY_TARGETS).some(([k,v])=>
      s.dailyTraining!.exercises[k as PlayerDailyExercise]<v))
  throw Error("PLAYER_DAILY_NOT_FINISHED");
 // Ordinary Solo Leveling daily rewards are ADDITIVE, not mutually exclusive:
 // +3 points, one stored full-recovery charge, and one random box.
 const n=completeJinwooDaily(s,{day:e.day,sourceRef:e.sourceRef,
  proofConfirmed:true});
 n.dailyTraining!.status="claimed";n.dailyTraining!.rewardRef=e.sourceRef;
 n.inventory.daily_status_recovery_charge=
  (n.inventory.daily_status_recovery_charge??0)+1;
 n.inventory.system_daily_box=(n.inventory.system_daily_box??0)+1;
 return n;
}
export function failConfirmedDailyTraining(s:JinwooState,e:{
 sourceRef:string;day:number;currentMinute:number;confirmedDeadline:true;
}):JinwooState{
 source(s,e.sourceRef);
 if(!s.dailyTraining||s.dailyTraining.day!==e.day||
  s.dailyTraining.status!=="active"||!e.confirmedDeadline||
  !Number.isSafeInteger(e.currentMinute)||
  e.currentMinute<s.dailyTraining.deadlineMinute)
  throw Error("PLAYER_DAILY_PENALTY_PREMATURE");
 const n=copy(s);n.dailyTraining!.status="failed";
 n.storyFlags.push("quest.penalty.pending."+e.day);
 n.appliedRewardRefs.push(e.sourceRef);return n;
}
/** Canonical-style ordinary daily boxes: mostly mundane situational objects.
 * Shop-only healing consumables and ointments are deliberately excluded.
 * Blessed/Cursed Random Boxes are separate special-quest rewards.
 * The first instant-dungeon key is rare and never duplicated for the same instance.
 */
export const ORARIO_RARE_REWARD_POOL=[
 {id:"system_daily_pen",weight:35},
 {id:"system_daily_handkerchief",weight:35},
 {id:"system_daily_umbrella",weight:25},
 {id:"system_instant_dungeon_key",weight:5}
] as const;
function deterministicRoll(ref:string){let h=2166136261;
 for(const x of ref){h^=x.charCodeAt(0);h=Math.imul(h,16777619);}
 return (h>>>0)%100+1;
}
export function openConfirmedDailyBox(s:JinwooState,e:{
 sourceRef:string;confirmedOpen:true;playerApproved:true;
}):{next:JinwooState;reward:string}{
 source(s,e.sourceRef);
 if(!e.confirmedOpen||!e.playerApproved||
  (s.inventory.system_daily_box??0)<=0)
  throw Error("PLAYER_DAILY_BOX_NOT_OWNED");
 const n=copy(s);n.inventory.system_daily_box--;
 if(n.inventory.system_daily_box===0)delete n.inventory.system_daily_box;
 let roll=deterministicRoll(e.sourceRef);
 let reward=ORARIO_RARE_REWARD_POOL[0].id as string;
 for(const item of ORARIO_RARE_REWARD_POOL){roll-=item.weight;
  if(roll<=0){reward=item.id;break;}}
 if(reward==="system_instant_dungeon_key"){
  // The first key can be found for real. Duplicates are replaced with
  // mundane recovery supplies instead of spawning another instance.
  if(n.storyFlags.includes("quest.reward.instant_key_from_box")){
   reward="system_daily_handkerchief";
  }else{
   n.storyFlags.push("quest.reward.instant_key_from_box");
  }
 }
 n.inventory[reward]=(n.inventory[reward]??0)+1;
 n.appliedRewardRefs.push(e.sourceRef);
 return {next:n,reward};
}
export const ORARIO_SHOP_CONSUMABLES=JINWOO_STORE.filter(e=>
 e.kind==="consumable").map(e=>e.id);
