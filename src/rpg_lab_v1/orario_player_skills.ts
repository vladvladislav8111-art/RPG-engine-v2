import {usesSharpnessRules} from "./chroma_sharpness_v48.ts";
import {criticalProfile} from "./chroma_critical_v48.ts";
/** Active System skills in the early Orario crossover.
 * A System stat alone does not imply possession of the Skill.
 * Combat effects require explicit activation and can expire without reward.
 * Numerical mana costs and buff strengths are house rules.
 */
import {projectJinwooFalna,type JinwooState,type JinwooStats} from "./shadow_monarch_rules.ts";
import {previewMonarchDomain} from "./danmachi_shadow_balance.ts";
/** Per-skill source-backed growth: one award per effective encounter. */
export type SkillMasteryProgress={
 level:number;xp:number;uses:number;trainedEnemyRefs:string[];lastPracticeRef:string;
};
export function skillMasteryLevel(s:JinwooState,skillId:string):number{
 return s.skillMastery?.[skillId]?.level??1;
}
export function recordConfirmedSkillPractice(s:JinwooState,e:{
 skillId:"sprint"|"quicksilver"|"critical_attack"|"mutilation";enemyRef:string;sourceRef:string;
 threatLevel:number;confirmedEffective:true;
}):JinwooState{
 if(!e.confirmedEffective||!valid(e.enemyRef)||!valid(e.sourceRef)||
  !s.unlockedSkills.includes(e.skillId)||!Number.isSafeInteger(e.threatLevel)||
  e.threatLevel<1||e.threatLevel>10000)
  throw Error("SKILL_PRACTICE_EVIDENCE_INVALID");
 const old=s.skillMastery?.[e.skillId]??{
  level:1,xp:0,uses:0,trainedEnemyRefs:[],lastPracticeRef:e.sourceRef};
 if(old.trainedEnemyRefs.includes(e.enemyRef))return s;
 const next=structuredClone(s);
 const gain=Math.min(36,8+e.threatLevel*3);
 let level=old.level,xp=old.xp+gain;
 const maxLevel=e.skillId==="quicksilver"||e.skillId==="mutilation"?10:5;
 while(level<maxLevel&&xp>=level*60){xp-=level*60;level++;}
 next.skillMastery={...(next.skillMastery??{}),[e.skillId]:{
  level,xp:level>=maxLevel?0:xp,uses:old.uses+1,
  trainedEnemyRefs:[...old.trainedEnemyRefs.slice(-126),e.enemyRef],
  lastPracticeRef:e.sourceRef}};
 return next;
}
export type ActivePlayerSkill={
 id:"stealth"|"sprint"|"quicksilver"|"monarch_domain"|
  "critical_attack"|"mutilation"|"dagger_throw"|"dagger_rush";
 startedRef:string;expiresMinute:number;
 agilityBonus:number;positionBonus:number;mpSpent:number;
 /** Snapshot at activation; gaining mastery mid-buff cannot reprice or reboost it. */
 speedMultiplier?:number;
 reactionMultiplier?:number;
 criticalMultiplier?:number;criticalStrikes?:number;criticalSeriesDurationMs?:number;
};
const valid=(s:string)=>/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(s);
export function activateConfirmedPlayerSkill(s:JinwooState,e:{
 sourceRef:string;skillId:ActivePlayerSkill["id"];
 startMinute:number;durationMinutes:number;playerConfirmed:true;
}):JinwooState{
 if(s.awaitingActivation||!e.playerConfirmed||
  !valid(e.sourceRef)||s.appliedRewardRefs.includes(e.sourceRef)||
  !Number.isSafeInteger(e.startMinute)||e.startMinute<0||
  !Number.isSafeInteger(e.durationMinutes)||e.durationMinutes<1||
  !s.unlockedSkills.includes(e.skillId))
  throw Error("PLAYER_SKILL_NOT_UNLOCKED_OR_CONFIRMED");
 const now=(s.activeSkills??[]).filter(x=>x.expiresMinute>e.startMinute);
 if(now.some(x=>x.id===e.skillId))throw Error("PLAYER_SKILL_ALREADY_ACTIVE");
 if(["critical_attack","mutilation"].includes(e.skillId)&&
    now.some(x=>["critical_attack","mutilation"].includes(x.id)))
  throw Error("PLAYER_CRITICAL_ATTACKS_CANNOT_STACK");
 if(["dagger_throw","dagger_rush"].includes(e.skillId)&&
    now.some(x=>["dagger_throw","dagger_rush"].includes(x.id)))
  throw Error("PLAYER_DAGGER_THROW_SKILLS_CANNOT_STACK");
 if(["sprint","quicksilver"].includes(e.skillId)&&
    now.some(x=>["sprint","quicksilver"].includes(x.id)))
  throw Error("PLAYER_SPEED_SKILLS_CANNOT_STACK");
 let mpCost=0,agilityBonus=0,positionBonus=0,speedMultiplier=1,reactionMultiplier=1;
 let critical:ReturnType<typeof criticalProfile>|undefined;
 switch(e.skillId){
  case "sprint":
   if(s.unlockedSkills.includes("quicksilver"))
    throw Error("SPRINT_EVOLVED_TO_QUICKSILVER");
   if(e.durationMinutes>10)throw Error("PLAYER_SKILL_DURATION_INVALID");
   mpCost=5+e.durationMinutes; // Activation 5 MP; 1 MP/min sustain.
   speedMultiplier=Number(Math.min(1.70,1.30+
     .10*(skillMasteryLevel(s,"sprint")-1)).toFixed(2));
    agilityBonus=Math.round(projectJinwooFalna(s).total.agility*
     (speedMultiplier-1));
   break;
  case "stealth":
   if(e.durationMinutes>5)throw Error("PLAYER_SKILL_DURATION_INVALID");
   mpCost=6*e.durationMinutes;positionBonus=14;break;
  case "quicksilver":
   if(e.durationMinutes>3)throw Error("PLAYER_SKILL_DURATION_INVALID");
   // 7 MP at activation plus 2 for each additional full minute;
   // prepaid because the engine does not have a periodic mana tick.
   mpCost=7+2*(e.durationMinutes-1);
   speedMultiplier=Number(Math.min(2.15,1.70+
    .05*(skillMasteryLevel(s,"quicksilver")-1)).toFixed(2));
   reactionMultiplier=Number(Math.min(1.47,1.20+
    .03*(skillMasteryLevel(s,"quicksilver")-1)).toFixed(2));
   agilityBonus=Math.round(projectJinwooFalna(s).total.agility*
    (speedMultiplier-1));break;
  case "critical_attack":
   if(e.durationMinutes!==1)throw Error("PLAYER_SKILL_DURATION_INVALID");
   if(usesSharpnessRules(s.storyFlags))critical=criticalProfile("critical_attack",skillMasteryLevel(s,"critical_attack"));
   mpCost=critical?.mp??12;break;
  case "mutilation":
   if(e.durationMinutes!==1)throw Error("PLAYER_SKILL_DURATION_INVALID");
   if(usesSharpnessRules(s.storyFlags))critical=criticalProfile("mutilation",skillMasteryLevel(s,"mutilation"));
   mpCost=critical?.mp??24;break;
  case "dagger_throw":
   if(e.durationMinutes!==1)throw Error("PLAYER_SKILL_DURATION_INVALID");
   mpCost=8;break;
  case "dagger_rush":
   if(e.durationMinutes!==1||!s.unlockedSkills.includes("rulers_authority"))
    throw Error("PLAYER_DAGGER_RUSH_REQUIRES_AUTHORITY");
   mpCost=16;break;
  case "monarch_domain":{
   const domain=previewMonarchDomain(s,{confirmedActive:true,
    durationMinutes:e.durationMinutes});
   mpCost=domain.mpCost;break;
  }
 }
 if(s.mp<mpCost)throw Error("PLAYER_SKILL_MANA_INSUFFICIENT");
 const n=structuredClone(s);n.mp-=mpCost;
 n.activeSkills=[...now,{id:e.skillId,startedRef:e.sourceRef,
  expiresMinute:e.startMinute+e.durationMinutes,agilityBonus,positionBonus,
  mpSpent:mpCost,speedMultiplier,reactionMultiplier,
  ...(critical?{criticalMultiplier:critical.multiplier,criticalStrikes:critical.strikes,
   ...(critical.seriesDurationMs!==undefined?{criticalSeriesDurationMs:critical.seriesDurationMs}:{})}:{})}];
 n.appliedRewardRefs.push(e.sourceRef);return n;
}
export function getPlayerSkillBattleModifiers(s:JinwooState,minute:number){
 const effects=(s.activeSkills??[]).filter(x=>x.expiresMinute>minute);
 return {agilityBonus:effects.reduce((a,x)=>a+x.agilityBonus,0),
  positionBonus:effects.reduce((a,x)=>a+x.positionBonus,0),
  domainBonus:effects.some(x=>x.id==="monarch_domain")?1.5:1,
  speedMultiplier:effects.find(x=>x.id==="quicksilver")?.speedMultiplier??
   effects.find(x=>x.id==="sprint")?.speedMultiplier??
   (effects.some(x=>x.id==="sprint")?1.30:1),
  reactionMultiplier:effects.find(x=>x.id==="quicksilver")?.reactionMultiplier??1,
  currentlyActive:effects.map(x=>x.id),readOnly:true};
}

/** A speed skill evolves only after repeated source-backed effective fights. */
export function evolveConfirmedSprint(s:JinwooState,e:{
 sourceRef:string;confirmedEvolution:boolean;playerApproved:boolean;
}):JinwooState{
 if(!e.playerApproved||!e.confirmedEvolution||!valid(e.sourceRef)||
    s.appliedRewardRefs.includes(e.sourceRef)||
    !s.unlockedSkills.includes("sprint")||
    s.unlockedSkills.includes("quicksilver")||
    (s.skillMastery?.sprint?.level??0)<5||
    (s.skillMastery?.sprint?.uses??0)<18)
  throw Error("PLAYER_SPEED_EVOLUTION_NOT_EARNED");
 const n=structuredClone(s);
 n.unlockedSkills.push("quicksilver");
 n.skillMastery={...(n.skillMastery??{}),
  quicksilver:{level:1,xp:0,uses:0,trainedEnemyRefs:[],
   lastPracticeRef:e.sourceRef}};
 n.appliedRewardRefs.push(e.sourceRef);
 return n;
}
export type CombatKind="dagger"|"weakpoint"|"evasion"|"throw"|"survival";
const combatThreshold:Record<CombatKind,{count:number;skill:string}>={
 dagger:{count:12,skill:"dagger_mastery"},
 weakpoint:{count:15,skill:"critical_attack"},
 evasion:{count:12,skill:"combat_evasion"},
 throw:{count:8,skill:"dagger_throw"},
 survival:{count:4,skill:"tenacity"}
};
/** Count independent proven encounters, not repeated attacks on one enemy. */
export function recordConfirmedCombatTechnique(s:JinwooState,e:{
 kind:CombatKind;enemyRef:string;sourceRef:string;confirmedEffective:true;
}):JinwooState{
 if(!e.confirmedEffective||!valid(e.enemyRef)||!valid(e.sourceRef)||
    !Object.hasOwn(combatThreshold,e.kind))
  throw Error("PLAYER_COMBAT_TECHNIQUE_EVIDENCE_INVALID");
 const previous=s.combatTraining?.[e.kind]??{
  uses:0,enemyRefs:[],lastPracticeRef:e.sourceRef};
 if(previous.enemyRefs.includes(e.enemyRef))return s;
 const next=structuredClone(s);
 const uses=previous.uses+1;
 next.combatTraining={...(next.combatTraining??{}),
  [e.kind]:{uses,enemyRefs:[...previous.enemyRefs.slice(-126),e.enemyRef],
   lastPracticeRef:e.sourceRef}};
 const award=combatThreshold[e.kind];
 if(uses>=award.count&&!next.unlockedSkills.includes(award.skill))
  next.unlockedSkills.push(award.skill);
 // Evolved skills require a separate high-volume training threshold.
 if(e.kind==="dagger"&&uses>=180&&
    !next.unlockedSkills.includes("master_of_shortsword"))
  next.unlockedSkills.push("master_of_shortsword");
 if(e.kind==="weakpoint"&&uses>=45&&
    (!usesSharpnessRules(next.storyFlags)||skillMasteryLevel(next,"critical_attack")>=5)&&
    !next.unlockedSkills.includes("mutilation"))
  next.unlockedSkills.push("mutilation");
 if(e.kind==="throw"&&uses>=35&&
    next.unlockedSkills.includes("rulers_authority")&&
    !next.unlockedSkills.includes("dagger_rush"))
  next.unlockedSkills.push("dagger_rush");
 return next;
}

/** Canon-inspired dagger proficiency: original advanced technique adds damage
 * and later becomes Master of Shortsword. Attack-speed scaling is a documented
 * crossover adaptation, not a sixth System stat or a free extra action.
 *
 * Unlocks at 12 distinct effective enemies; level depends on the same
 * evidence-backed unique-enemy progress, not System level or raw strike count.
 */
export function previewDaggerTechnique(s:JinwooState){
 const uses=s.combatTraining?.dagger?.uses??0;
 const owned=s.unlockedSkills.includes("dagger_mastery")||
  s.unlockedSkills.includes("master_of_shortsword");
 const mastered=owned&&uses>=180&&
  s.unlockedSkills.includes("master_of_shortsword");
 const level=!owned?0:uses>=140?5:uses>=96?4:
  uses>=64?3:uses>=32?2:1;
 const bonusDamage=mastered?33:level<=0?0:4+level*4;
 const bonusAttackSpeed=mastered?20:level<=0?0:2+level*3;
 return {
  unlocked:owned,level,evolved:mastered,
  id:mastered?"master_of_shortsword":"dagger_mastery",
  name:mastered?"Мастер короткого клинка":"Владение кинжалами",
  practicedEnemies:uses,nextMilestone:mastered?null:
   !owned?12:uses<32?32:uses<64?64:uses<96?96:uses<140?140:180,
  damageBonusPercent:bonusDamage,
  attackSpeedBonusPercent:bonusAttackSpeed,
  damageMultiplier:1+bonusDamage/100,
  attackSpeedMultiplier:1+bonusAttackSpeed/100,
  consumesMana:false,readOnly:true
 };
}
