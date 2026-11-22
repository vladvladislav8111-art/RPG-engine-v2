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
 skillId:"sprint";enemyRef:string;sourceRef:string;
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
 while(level<5&&xp>=level*60){xp-=level*60;level++;}
 next.skillMastery={...(next.skillMastery??{}),[e.skillId]:{
  level,xp:level>=5?0:xp,uses:old.uses+1,
  trainedEnemyRefs:[...old.trainedEnemyRefs.slice(-126),e.enemyRef],
  lastPracticeRef:e.sourceRef}};
 return next;
}
export type ActivePlayerSkill={
 id:"stealth"|"sprint"|"quicksilver"|"monarch_domain";
 startedRef:string;expiresMinute:number;
 agilityBonus:number;positionBonus:number;mpSpent:number;
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
 let mpCost=0,agilityBonus=0,positionBonus=0;
 switch(e.skillId){
  case "sprint":
   if(e.durationMinutes>10)throw Error("PLAYER_SKILL_DURATION_INVALID");
   mpCost=5+e.durationMinutes; // Activation 5 MP; 1 MP/min sustain.
   agilityBonus=Math.round(projectJinwooFalna(s).total.agility*
     Math.min(.70,.30+.10*(skillMasteryLevel(s,"sprint")-1)));
   break;
  case "stealth":
   if(e.durationMinutes>5)throw Error("PLAYER_SKILL_DURATION_INVALID");
   mpCost=6*e.durationMinutes;positionBonus=14;break;
  case "quicksilver":
   if(e.durationMinutes>3)throw Error("PLAYER_SKILL_DURATION_INVALID");
   mpCost=9*e.durationMinutes;agilityBonus=12;break;
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
  mpSpent:mpCost}];
 n.appliedRewardRefs.push(e.sourceRef);return n;
}
export function getPlayerSkillBattleModifiers(s:JinwooState,minute:number){
 const effects=(s.activeSkills??[]).filter(x=>x.expiresMinute>minute);
 return {agilityBonus:effects.reduce((a,x)=>a+x.agilityBonus,0),
  positionBonus:effects.reduce((a,x)=>a+x.positionBonus,0),
  domainBonus:effects.some(x=>x.id==="monarch_domain")?1.5:1,
  speedMultiplier:effects.some(x=>x.id==="sprint")?
   Math.min(1.70,1.30+.10*(skillMasteryLevel(s,"sprint")-1)):1,
  currentlyActive:effects.map(x=>x.id),readOnly:true};
}
