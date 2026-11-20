/** Optional, source-bound survival rules for the new Orario Player.
 * Healing, injuries, daily training, and usable shop inventory are kept
 * inside the same Player snapshot. A plan never fabricates a victory.
 * Exact physiological values are crossover house rules, not canon claims.
 */
import {
 completeJinwooDaily,effectiveJinwooMaxHp,effectiveJinwooMaxMp,
 JINWOO_STORE,shopAvailable,type JinwooState
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
 const n=copy(s);n.hp=Math.max(0,n.hp-e.damage);
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
 choice:"random_box"|"recovery";
}):JinwooState{
 source(s,e.sourceRef);
 if(!e.playerClaimed||!s.dailyTraining||s.dailyTraining.day!==e.day||
   s.dailyTraining.status!=="active"||
   Object.entries(DAILY_TARGETS).some(([k,v])=>
    s.dailyTraining!.exercises[k as PlayerDailyExercise]<v))
  throw Error("PLAYER_DAILY_NOT_FINISHED");
 // Underlying canonical reward is +3 points ONCE, plus an adaptation choice.
 const n=completeJinwooDaily(s,{day:e.day,sourceRef:e.sourceRef,
  proofConfirmed:true});
 n.dailyTraining!.status="claimed";n.dailyTraining!.rewardRef=e.sourceRef;
 if(e.choice==="recovery"){
  n.hp=effectiveJinwooMaxHp(n);n.mp=effectiveJinwooMaxMp(n);n.fatigue=0;
  // A recovery selection stabilizes injuries, not instantly reconstructs bone.
  for(const i of n.injuries??[])if(i.active)i.treated=true;
 }else if(e.choice==="random_box"){
  n.inventory.system_daily_box=(n.inventory.system_daily_box??0)+1;
 }else throw Error("PLAYER_DAILY_REWARD_CHOICE_INVALID");
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
export const ORARIO_RARE_REWARD_POOL=[
 {id:"wound_dressing",weight:25},{id:"potion_hp_small",weight:22},
 {id:"potion_mp_small",weight:18},{id:"ointment_burn",weight:10},
 {id:"potion_fatigue",weight:10},{id:"rune_perception",weight:5},
 {id:"system_instant_dungeon_key",weight:10}
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
   reward="wound_dressing";
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
