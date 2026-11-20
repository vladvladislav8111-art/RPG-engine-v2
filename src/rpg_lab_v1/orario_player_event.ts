/** One event-stream adapter for the new Orario Player.
 * Every write is derived from an already confirmed Lab event sourceRef,
 * persisted through Lab's existing CAS revision and immutable event ledger.
 * GM may adjudicate facts, but player chooses actions and allocation.
 * The type discriminant is validated before calling any RPG mechanics.
 */
import {
 newOrarioPlayerAwakening,activateOrarioPlayerSystem,
 allocateJinwooPoints,purchaseJinwooItem,grantJinwooFalna,
 updateJinwooFalna,grantJinwooStoryUnlock,changeJinwooPhase,
 recruitFirstKnightFromClassTrial,JINWOO_SKILL_GRAPH,type JinwooState
} from "./shadow_monarch_rules.ts";
import {
 startConfirmedDailyTraining,recordConfirmedTraining,
 claimConfirmedDailyTraining,failConfirmedDailyTraining,
 consumeConfirmedSystemItem,openConfirmedDailyBox,
 applyConfirmedInjury,completeConfirmedRest,receiveConfirmedMedicalCare
} from "./orario_player_survival.ts";
import {
 startConfirmedOrarioBattle,resolveConfirmedOrarioExchange
} from "./orario_player_combat.ts";
import {
 addConfirmedMagicStone,sellConfirmedMagicStone,
 extractShadowFromMagicStone
} from "./shadow_monarch_stones.ts";
import {
 issueSystemDungeonKey,enterSystemDungeon,completeSystemDungeon
} from "./system_dungeon_keys.ts";
import {grantDanmachiPlotKey} from "./danmachi_plot_keys.ts";
import {
 setShadowDeployment,recordShadowVerifiedVictory,
 recoverShadowWithBalancedMana
} from "./danmachi_shadow_balance.ts";
import {recordConfirmedMonsterDrop} from "./orario_player_loot.ts";
import {verifySystemDungeonBossEvidence} from "./orario_system_encounters.ts";
import {activateConfirmedPlayerSkill} from "./orario_player_skills.ts";
import {narrativeMinute} from "./events.ts";
import type {LabSession} from "./session.ts";
const playable=new Set([
 "init","activate","start_battle","combat_exchange","activate_skill",
 "daily_start","daily_progress","daily_claim","daily_fail",
 "purchase","use_item","spend_points","falna_bless","falna_update",
 "stone_collect","stone_sell","stone_extract","monster_drop",
 "unlock","change_class","plot_key","dungeon_key","dungeon_enter",
 "dungeon_clear","first_knight","shadow_deploy","shadow_victory",
 "shadow_revive","daily_box","injury","rest","medical_care"
]);
export type OrarioPlayerAction={
 kind:string;
 /** Must be explicit on decisions. Damage/penalties can be GM adjudicated. */
 playerApproved?:boolean;
 args:Record<string,unknown>;
};
const obj=(x:unknown):x is Record<string,unknown>=>!!x&&
 typeof x==="object"&&!Array.isArray(x);
const expectedKinds=new Set(["injury","daily_fail","medical_care"]);
export function applyOrarioPlayerAction(s:LabSession,a:OrarioPlayerAction,
 sourceRef:string,eventTime:string):JinwooState{
 if(!a||!playable.has(a.kind)||!obj(a.args))
  throw Error("ORARIO_PLAYER_ACTION_UNKNOWN");
 if(!expectedKinds.has(a.kind)&&a.playerApproved!==true)
  throw Error("ORARIO_PLAYER_ACTION_NOT_PLAYER_APPROVED");
 if(a.kind==="init"){
  if(s.player.jinwoo||s.player.linos||
   s.player.locationId!=="orario.medical_ward")
   throw Error("ORARIO_PLAYER_INIT_WRONG_CAMPAIGN");
  return newOrarioPlayerAwakening();
 }
 const current=s.player.jinwoo;
 if(!current)throw Error("ORARIO_PLAYER_NOT_INITIALIZED");
 const q={...a.args,sourceRef} as Record<string,unknown>;
 switch(a.kind){
  case "activate":
   return activateOrarioPlayerSystem(current,{
    sourceRef,confirmedAwakening:q.confirmedAwakening===true
   });
  case "start_battle":
   if(!s.player.locationId?.startsWith("orario.dungeon")&&
     !Object.values(current.dungeonKeys).some(k=>k.state==="entered"))
    throw Error("ORARIO_PLAYER_BATTLE_LOCATION_NOT_VERIFIED");
   return startConfirmedOrarioBattle(current,{
    ...q,sourceRef,playerCommitted:a.playerApproved===true,
    confirmedHostile:q.confirmedHostile===true
   } as Parameters<typeof startConfirmedOrarioBattle>[1]);
  case "combat_exchange":
   return resolveConfirmedOrarioExchange(current,{
    ...q,sourceRef,playerCommitted:a.playerApproved===true,
    currentMinute:narrativeMinute(eventTime)??-1
   } as Parameters<typeof resolveConfirmedOrarioExchange>[1]).next;
  case "activate_skill":
   return activateConfirmedPlayerSkill(current,{
    ...q,sourceRef,startMinute:narrativeMinute(eventTime)??-1,
    playerConfirmed:a.playerApproved===true
   } as Parameters<typeof activateConfirmedPlayerSkill>[1]);
  case "daily_start":
   if(narrativeMinute(eventTime)===null||
     Math.floor(narrativeMinute(eventTime)!/1440)!==q.day)
    throw Error("ORARIO_PLAYER_DAILY_WRONG_DAY");
   return startConfirmedDailyTraining(current,{
    ...q,sourceRef,confirmedOffer:q.confirmedOffer===true
   } as Parameters<typeof startConfirmedDailyTraining>[1]);
  case "daily_progress":
   if(narrativeMinute(eventTime)===null||
     narrativeMinute(eventTime)!>=current.dailyTraining?.deadlineMinute!)
    throw Error("ORARIO_PLAYER_DAILY_DEADLINE_REACHED");
   return recordConfirmedTraining(current,{
    ...q,sourceRef,playerConfirmed:a.playerApproved===true
   } as Parameters<typeof recordConfirmedTraining>[1]);
  case "daily_claim":
   if(narrativeMinute(eventTime)===null||
     narrativeMinute(eventTime)!>=current.dailyTraining?.deadlineMinute!)
    throw Error("ORARIO_PLAYER_DAILY_DEADLINE_REACHED");
   return claimConfirmedDailyTraining(current,{
    ...q,sourceRef,playerClaimed:a.playerApproved===true
   } as Parameters<typeof claimConfirmedDailyTraining>[1]);
  case "daily_fail":
   return failConfirmedDailyTraining(current,{
    ...q,sourceRef,currentMinute:narrativeMinute(eventTime)??-1,
    confirmedDeadline:q.confirmedDeadline===true
   } as Parameters<typeof failConfirmedDailyTraining>[1]);
  case "purchase":
   return purchaseJinwooItem(current,{
    ...q,sourceRef
   } as Parameters<typeof purchaseJinwooItem>[1]);
  case "use_item":
   return consumeConfirmedSystemItem(current,{
    ...q,sourceRef,confirmedUse:a.playerApproved===true
   } as Parameters<typeof consumeConfirmedSystemItem>[1]);
  case "spend_points":
   return allocateJinwooPoints(current,q.alloc as
    Parameters<typeof allocateJinwooPoints>[1]);
  case "falna_bless":
   return grantJinwooFalna(current,{
    ...q,sourceRef,godConfirmed:q.godConfirmed===true
   } as Parameters<typeof grantJinwooFalna>[1]);
  case "falna_update":
   return updateJinwooFalna(current,{
    ...q,sourceRef,godConfirmed:q.godConfirmed===true
   } as Parameters<typeof updateJinwooFalna>[1]);
  case "monster_drop":
   return recordConfirmedMonsterDrop(current,{
    ...q,sourceRef,confirmedDefeat:q.confirmedDefeat===true,
    confirmedSearch:a.playerApproved===true
   } as Parameters<typeof recordConfirmedMonsterDrop>[1]).next;
  case "stone_collect":
   return addConfirmedMagicStone(current,{
    ...q,sourceRef,confirmedLoot:q.confirmedLoot===true
   } as Parameters<typeof addConfirmedMagicStone>[1]);
  case "stone_sell":
   return sellConfirmedMagicStone(current,{
    ...q,sourceRef,confirmedGuildExchange:q.confirmedGuildExchange===true
   } as Parameters<typeof sellConfirmedMagicStone>[1]);
  case "stone_extract":
   return extractShadowFromMagicStone(current,{
    ...q,sourceRef,confirmedShadowCommand:a.playerApproved===true
   } as Parameters<typeof extractShadowFromMagicStone>[1]).next;
  case "unlock":{
   if(q.type==="skill"){
    const skill=JINWOO_SKILL_GRAPH.find(x=>x.id===q.id);
    if(!skill||(skill.phase==="shadow_class"&&
       current.phase==="player_system")||
      (skill.phase==="true_monarch"&&
       current.phase!=="true_monarch"))
     throw Error("ORARIO_PLAYER_SKILL_PHASE_UNAVAILABLE");
   }
   return grantJinwooStoryUnlock(current,{
    ...q,sourceRef,confirmed:q.confirmed===true
   } as Parameters<typeof grantJinwooStoryUnlock>[1]);
  }
  case "change_class":
   if(q.to==="shadow_class"&&
      (current.dungeonKeys["job.change"]?.state!=="cleared"||
       !verifySystemDungeonBossEvidence(current,"job.change")))
    throw Error("ORARIO_PLAYER_JOB_TRIAL_NOT_CLEARED");
   if(q.to==="true_monarch"&&
      (current.dungeonKeys["temple.return"]?.state!=="cleared"||
       !verifySystemDungeonBossEvidence(current,"temple.return")))
    throw Error("ORARIO_PLAYER_MONARCH_SUCCESSION_NOT_CLEARED");
   return changeJinwooPhase(current,{
    ...q,sourceRef,confirmed:q.confirmed===true
   } as Parameters<typeof changeJinwooPhase>[1]);
  case "plot_key":
   return grantDanmachiPlotKey(current,{
    ...q,sourceRef,gmConfirmed:q.gmConfirmed===true
   } as Parameters<typeof grantDanmachiPlotKey>[1]);
  case "dungeon_key":
   return issueSystemDungeonKey(current,{
    ...q,sourceRef,confirmedReward:q.confirmedReward===true
   } as Parameters<typeof issueSystemDungeonKey>[1]);
  case "dungeon_enter":
   return enterSystemDungeon(current,{
    ...q,sourceRef,confirmedEntry:q.confirmedEntry===true
   } as Parameters<typeof enterSystemDungeon>[1]);
  case "dungeon_clear":
   if(typeof q.dungeonId!=="string"||
      !verifySystemDungeonBossEvidence(current,q.dungeonId))
    throw Error("ORARIO_SYSTEM_DUNGEON_BOSS_NOT_DEFEATED");
   return completeSystemDungeon(current,{
    ...q,sourceRef,confirmedClear:q.confirmedClear===true
   } as Parameters<typeof completeSystemDungeon>[1]);
  case "first_knight":
   return recruitFirstKnightFromClassTrial(current,{
    ...q,sourceRef,playerAccepted:a.playerApproved===true,
    confirmedClassTrialClear:q.confirmedClassTrialClear===true
   } as Parameters<typeof recruitFirstKnightFromClassTrial>[1]);
  case "shadow_deploy":
   return setShadowDeployment(current,{
    ...q,sourceRef,confirmedPlayerOrder:a.playerApproved===true
   } as Parameters<typeof setShadowDeployment>[1]);
  case "shadow_victory":
   return recordShadowVerifiedVictory(current,{
    ...q,sourceRef,
    contributedToConfirmedKill:q.contributedToConfirmedKill===true,
    confirmedChallengeWorthXp:q.confirmedChallengeWorthXp===true
   } as Parameters<typeof recordShadowVerifiedVictory>[1]);
  case "shadow_revive":
   return recoverShadowWithBalancedMana(current,{
    ...q,sourceRef,confirmedBodyDestroyed:q.confirmedBodyDestroyed===true
   } as Parameters<typeof recoverShadowWithBalancedMana>[1]);
  case "daily_box":
   return openConfirmedDailyBox(current,{
    ...q,sourceRef,confirmedOpen:a.playerApproved===true,
    playerApproved:a.playerApproved===true
   } as Parameters<typeof openConfirmedDailyBox>[1]).next;
  case "rest":{
   const previous=narrativeMinute(s.gameClock),next=narrativeMinute(eventTime);
   if(previous===null||next===null||next<previous)
    throw Error("ORARIO_PLAYER_REST_TIME_INVALID");
   return completeConfirmedRest(current,{
    sourceRef,minutes:next-previous,
    safeRestLocation:q.safeRestLocation===true,
    playerConfirmed:a.playerApproved===true
   });
  }
  case "medical_care":{
   const previous=narrativeMinute(s.gameClock),next=narrativeMinute(eventTime);
   if(previous===null||next===null||next<previous||
    (current.hp>0&&a.playerApproved!==true))
    throw Error("ORARIO_PLAYER_MEDICAL_EVENT_INVALID");
   return receiveConfirmedMedicalCare(current,{
    sourceRef,minutes:next-previous,
    confirmedHealer:q.confirmedHealer===true,
    atOrarioWard:q.atOrarioWard===true,
    confirmedRescue:q.confirmedRescue===true,
    costValis:q.costValis as number
   });
  }
  case "injury":
   return applyConfirmedInjury(current,{
    ...q,sourceRef,confirmedCause:q.confirmedCause===true
   } as Parameters<typeof applyConfirmedInjury>[1]);
  default:throw Error("ORARIO_PLAYER_ACTION_UNKNOWN");
 }
}
/** Stateless reader for a player-safe status sheet. Avoid GM-only NPC facts. */
export function readOrarioPlayerHud(s:LabSession){
 const p=s.player.jinwoo;
 if(!p)return {available:false,readOnly:true};
 if(p.awaitingActivation)return {available:true,awaitingActivation:true,
  privateSystemNumbersHidden:true,readOnly:true};
 return {available:true,systemLevel:p.systemLevel,xp:p.xp,
  freeStatPoints:p.freeStatPoints,stats:{...p.stats},
  hp:p.hp,mp:p.mp,fatigue:p.fatigue,
  phase:p.phase,awaitingActivation:p.awaitingActivation??false,
  gold:p.gold,valis:p.valis,
  inventory:{...p.inventory},
  dailyTraining:p.dailyTraining?structuredClone(p.dailyTraining):null,
  injuries:structuredClone(p.injuries??[]),
  shadowCount:p.shadowRoster.length,
  availableMagicStones:Object.values(p.magicStones).filter(x=>x.state==="held").length,
  falna:{blessed:p.falna.blessed,divineLevel:p.falna.blessed?
   p.falna.divineLevel:null},
  encounter:p.activeEncounter?{
   active:true,enemyLabel:"Противник",
   round:p.activeEncounter.round,
   enemyStatisticsHidden:true
  }:null,readOnly:true};
}
