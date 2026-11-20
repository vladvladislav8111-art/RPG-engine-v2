/** Event-sourced freeform skirmish integration.
 * One confirmed exchange can represent a short narration sequence, but all
 * mechanical outcomes remain deterministic and derived from a saved action.
 * No free NPC-kills, player actions, missing enemies, loot or ad hoc damage.
 */
import type {JinwooState,PlayerCombatEncounter} from "./shadow_monarch_rules.ts";
import {
 ORARIO_MONSTER_BY_ID,previewCombatExchange,commitBalancedMonsterDefeat,
 type CombatMove
} from "./danmachi_player_balance.ts";
import {previewOwnedEquipmentEncounter,type Loadout} from
 "./danmachi_player_equipment.ts";
import {previewInjuryPenalties,applyConfirmedInjury} from
 "./orario_player_survival.ts";
import {getPlayerSkillBattleModifiers} from "./orario_player_skills.ts";
import {isSystemEncounterId,systemEncounterEntryAllowed} from "./orario_system_encounters.ts";
const safeRef=(x:string)=>/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(x);
function hash(ref:string,salt:string):number{
 let h=2166136261;for(const c of ref+"|"+salt){
  h^=c.charCodeAt(0);h=Math.imul(h,16777619);
 }return (h>>>0)%100+1;
}
export type BattleResolution={
 next:JinwooState;rolls:{player:number;enemy:number};
 dealt:number;taken:number;injuryRef?:string;
 outcome:"ongoing"|"victory"|"retreat"|"unconscious";
 xpGranted:number;systemGoldGranted:number;
};
export function startConfirmedOrarioBattle(s:JinwooState,e:{
 sourceRef:string;monsterId:string;monsterRef:string;floor:number;
 playerCommitted:true;confirmedHostile:true;irregularRef?:string;
}):JinwooState{
 if(s.awaitingActivation||s.hp<=0||s.activeEncounter||
  !e.confirmedHostile||!e.playerCommitted||!safeRef(e.sourceRef)||
  !safeRef(e.monsterRef)||s.appliedRewardRefs.includes(e.sourceRef)||
  s.defeatedTargetRefs.includes(e.monsterRef))
  throw Error("PLAYER_BATTLE_NOT_AUTHORIZED");
 const mob=ORARIO_MONSTER_BY_ID[e.monsterId];
 if(!mob)throw Error("PLAYER_BATTLE_ENEMY_UNKNOWN");
 if(isSystemEncounterId(e.monsterId)&&
  !systemEncounterEntryAllowed(s,e.monsterId))
  throw Error("PLAYER_BATTLE_SYSTEM_INSTANCE_NOT_ENTERED");
 if(!Number.isSafeInteger(e.floor)||e.floor<1||e.floor>100)
  throw Error("PLAYER_BATTLE_FLOOR_INVALID");
 if((e.floor<mob.floorMin||e.floor>mob.floorMax)&&
  !safeRef(e.irregularRef??""))throw Error("PLAYER_BATTLE_IRREGULAR_SOURCE_REQUIRED");
 const n=structuredClone(s);
 n.activeEncounter={enemyRef:e.monsterRef,monsterId:e.monsterId,
  floor:e.floor,enemyHp:mob.hp,round:0,startedRef:e.sourceRef,
  ...(e.irregularRef?{irregularRef:e.irregularRef}:{})};
 n.appliedRewardRefs.push(e.sourceRef);
 return n;
}
export function resolveConfirmedOrarioExchange(s:JinwooState,e:{
 sourceRef:string;playerCommitted:true;
 move:CombatMove|"retreat";loadout:Loadout;
 proficiencyBonus?:number;positionBonus?:number;spellMpCost?:number;
 currentMinute?:number;
}):BattleResolution{
 const battle=s.activeEncounter,mob=battle&&ORARIO_MONSTER_BY_ID[battle.monsterId];
 if(!battle||!mob||!e.playerCommitted||!safeRef(e.sourceRef)||
  s.appliedRewardRefs.includes(e.sourceRef)||s.hp<=0||s.awaitingActivation)
  throw Error("PLAYER_EXCHANGE_NOT_AUTHORIZED");
 const rolls={player:hash(e.sourceRef,"player"),enemy:hash(e.sourceRef,"enemy")};
 const next=structuredClone(s);
 const active=next.activeEncounter!;
 const injury=previewInjuryPenalties(next);
 const minute=e.currentMinute??-1;
 if(e.currentMinute!==undefined&&
  (!Number.isSafeInteger(e.currentMinute)||e.currentMinute<0))
  throw Error("PLAYER_BATTLE_TIME_INVALID");
 // Expired System skills never affect combat, and their modifier snapshot
 // cannot mutate base System attributes or permanently award levels.
 const modifiers=getPlayerSkillBattleModifiers(next,minute);
 const battleStats={...next,stats:{...next.stats,
  agility:next.stats.agility+modifiers.agilityBonus}};
 const wear=previewOwnedEquipmentEncounter(battleStats,{
  monsterId:battle.monsterId,floor:battle.floor,
  loadout:e.loadout,move:e.move==="retreat"?"guard":e.move,
  ...(e.proficiencyBonus!==undefined?{proficiencyBonus:e.proficiencyBonus}:{}),
  positionBonus:(e.positionBonus??0)+modifiers.positionBonus-injury.speedPenalty,
  ...(e.spellMpCost!==undefined?{spellMpCost:e.spellMpCost}:{}),
  ...(battle.irregularRef?{confirmedIrregularRef:battle.irregularRef}:{})
 });
 const chance=wear.exchange.hitChancePercent;
 let dealt=0,taken=0,injuryRef:undefined|string;
 if(e.move==="retreat"){
  const evade=Math.max(10,Math.min(92,Math.round(45+
   (battleStats.stats.agility-mob.combat.agility)*.6-injury.speedPenalty+
   (e.positionBonus??0)+modifiers.positionBonus)));
  if(rolls.player<=evade){
   active.round++;
   next.activeEncounter=undefined;
   next.appliedRewardRefs.push(e.sourceRef);
   return {next,rolls,dealt,taken,outcome:"retreat",
    xpGranted:0,systemGoldGranted:0};
  }
 }else if(e.move!=="guard"&&rolls.player<=chance){
  dealt=Math.max(1,wear.exchange.damageIfHit-injury.attackPenalty);
  active.enemyHp=Math.max(0,active.enemyHp-dealt);
 }
 const cost=wear.exchange.attackerResourceCost;
 if(cost.mp>next.mp)throw Error("PLAYER_BATTLE_MP_INSUFFICIENT");
 next.mp-=cost.mp;next.fatigue=Math.min(100,next.fatigue+cost.fatigue);
 active.round++;
 active.lastCombatRef=e.sourceRef;
 if(active.enemyHp<=0){
  // No automatic loot. A separate confirmed recovery event may collect
  // the intact magic stone. XP & gold committed on the same battle event.
  const oldLevel=next.systemLevel,oldGold=next.gold,oldXp=next.xp;
  next.activeEncounter=undefined;
  const raised=commitBalancedMonsterDefeat(next,{
   sourceRef:e.sourceRef,monsterId:mob.id,floor:battle.floor,
   monsterRef:battle.enemyRef,confirmedDefeat:true,killer:"player",
   ...(battle.irregularRef?{confirmedIrregularRef:battle.irregularRef}:{})
  });
  return {next:raised,rolls,dealt,taken,outcome:"victory",
   xpGranted:raised.systemLevel===oldLevel?raised.xp-oldXp:
    // Level-up consumed prior XP: report awarded total via one preview.
    0,
   systemGoldGranted:raised.gold-oldGold};
 }
 if(rolls.enemy<=wear.exchange.counterHitChancePercent){
  taken=Math.max(0,wear.exchange.counterDamageIfHit+
    injury.defensePenalty);
  next.hp=Math.max(0,next.hp-taken);
  const maxHp=100+next.stats.stamina*20;
  // Severe strikes, not every scratch, can create a lasting injury.
  if(taken>=Math.ceil(maxHp*.16)&&next.hp>0){
   const place=["torso","left_arm","right_arm","left_leg","right_leg","head"] as const;
   const location=place[hash(e.sourceRef,"part")%place.length];
   const severity=taken>=maxHp*.35?3:taken>=maxHp*.23?2:1;
   injuryRef=e.sourceRef+".wound";
   const h=applyConfirmedInjury({...next,hp:next.hp+taken},{
    sourceRef:injuryRef,injuryId:"wound."+e.sourceRef,location,
    kind:location==="torso"?"bruise":"bleeding",
    severity:severity as 1|2|3,damage:taken,confirmedCause:true
   });
   // Keep battle state and rewards of base exchange; only wound is added.
   next.hp=h.hp;next.injuries=h.injuries;
   next.appliedRewardRefs=h.appliedRewardRefs;
  }
 }
 next.appliedRewardRefs.push(e.sourceRef);
 return {next,rolls,dealt,taken,injuryRef,
  outcome:next.hp<=0?"unconscious":"ongoing",
  xpGranted:0,systemGoldGranted:0};
}
export function readCurrentPlayerBattle(s:JinwooState){
 if(!s.activeEncounter)return {active:false,readOnly:true};
 const mob=ORARIO_MONSTER_BY_ID[s.activeEncounter.monsterId];
 return {active:true,enemyRef:s.activeEncounter.enemyRef,
  enemyType:mob?.name??"неизвестно",
  enemyHp:s.activeEncounter.enemyHp,enemyMaxHp:mob?.hp,
  round:s.activeEncounter.round,playerHp:s.hp,
  playerMp:s.mp,fatigue:s.fatigue,
  injuries:previewInjuryPenalties(s),
  playerChoiceRequired:true,readOnly:true};
}
