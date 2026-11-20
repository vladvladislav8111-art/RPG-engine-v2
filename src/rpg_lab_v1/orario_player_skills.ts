/** Active System skills in the early Orario crossover.
 * A System stat alone does not imply possession of the Skill.
 * Combat effects require explicit activation and can expire without reward.
 * Numerical mana costs and buff strengths are house rules.
 */
import type {JinwooState,JinwooStats} from "./shadow_monarch_rules.ts";
import {previewMonarchDomain} from "./danmachi_shadow_balance.ts";
export type ActivePlayerSkill={
 id:"stealth"|"quicksilver"|"monarch_domain";
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
  currentlyActive:effects.map(x=>x.id),readOnly:true};
}
