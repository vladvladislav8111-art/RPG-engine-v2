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
 recruitFirstKnightFromClassTrial,JINWOO_SKILL_GRAPH,
 CHROMA_BALANCE_FLAG,projectJinwooFalna,effectiveJinwooMaxHp,
 effectiveJinwooMaxMp,effectiveJinwooStaminaReserve,type JinwooState
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
 sellConfirmedMagicStoneBatch,extractShadowFromMagicStone
} from "./shadow_monarch_stones.ts";
import {
 issueSystemDungeonKey,enterSystemDungeon,completeSystemDungeon,
 useConfirmedInstantReturnCrystal
} from "./system_dungeon_keys.ts";
import {grantDanmachiPlotKey} from "./danmachi_plot_keys.ts";
import {
 setShadowDeployment,recordShadowVerifiedVictory,
 recoverShadowWithBalancedMana
} from "./danmachi_shadow_balance.ts";
import {recordConfirmedMonsterDrop} from "./orario_player_loot.ts";
import {verifySystemDungeonBossEvidence} from "./orario_system_encounters.ts";
import {activateConfirmedPlayerSkill,evolveConfirmedSprint,
 previewDaggerTechnique} from "./orario_player_skills.ts";
import {reconcileChromaD3ThroughWolf02} from "./chroma_campaign_reconcile.ts";
import {narrativeMinute} from "./events.ts";
import type {LabSession} from "./session.ts";
const playable=new Set([
 "init","activate","start_battle","combat_exchange","activate_skill",
 "daily_start","daily_progress","daily_claim","daily_fail",
 "purchase","use_item","spend_points","falna_bless","falna_update",
 "stone_collect","stone_sell","stone_sell_batch","stone_extract","monster_drop",
 "chroma_swap_kasaka_fang",
 "unlock","change_class","plot_key","dungeon_key","dungeon_enter",
 "dungeon_clear","instant_return","first_knight","shadow_deploy","shadow_victory",
 "shadow_revive","daily_box","injury","rest","medical_care",
 "reconcile_chroma_d1","reconcile_chroma_starting_valis",
 "reconcile_chroma_d3_xp","reconcile_chroma_d3_full",
 "reconcile_chroma_razan_xp","evolve_skill",
 "local_purchase"
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
   !["orario.medical_ward","orario.gate"].includes(s.player.locationId??""))
   throw Error("ORARIO_PLAYER_INIT_WRONG_CAMPAIGN");
  return newOrarioPlayerAwakening();
 }
 const current=s.player.jinwoo;
 if(!current)throw Error("ORARIO_PLAYER_NOT_INITIALIZED");
 const q={...a.args,sourceRef} as Record<string,unknown>;
 switch(a.kind){
  case "reconcile_chroma_d1":{
   // One-time, player-approved recovery of the already-played first Orario day.
   // Evidence is in this very RPG Lab session, never another campaign.
   const required=[
    "chroma.d1.final_goblin_dagger_dance_without_locked_sprint.237",
    "chroma.d1.return_babel_guild_exchange_fourteen_stones.239",
    "chroma.rules.falna_stronger_conversion_npc_source_chroma.243",
    "chroma.rules.stamina_mp_recovery_and_npc_auto_memory_audit.247"
   ];
   if(s.projectId!=="chroma_orario_main_20261120"||
      s.sessionId!=="chroma_day0_20261120"||
      s.player.hero?.id!=="hero.chroma"||
      sourceRef!=="chroma.repair.d1_authoritative_player_snapshot.261"||
      eventTime!=="D1 17:02"||a.playerApproved!==true||
      q.confirmSourceCheck!==true||
      required.some(ref=>!s.events.some(ev=>ev.sourceRef===ref))||
      !current.falna.blessed||current.falna.godId!=="npc.loki"||
      current.systemLevel!==1||current.xp!==0||
      current.storyFlags.includes(CHROMA_BALANCE_FLAG))
    throw Error("CHROMA_RECONCILE_EVIDENCE_OR_STATE_INVALID");
   const n=structuredClone(current);
   n.awaitingActivation=false;
   n.systemLevel=2;n.xp=75;n.freeStatPoints=0;
   n.stats={strength:13,stamina:13,agility:15,perception:11,intelligence:11};
   n.storyFlags=[...n.storyFlags,CHROMA_BALANCE_FLAG];
   n.unlockedSkills=n.unlockedSkills.includes("sprint")?
    n.unlockedSkills:[...n.unlockedSkills,"sprint"];
   n.completedDailyDays=n.completedDailyDays.includes("1")?
    n.completedDailyDays:[...n.completedDailyDays,"1"];
   // The 14 stones were sold in the witnessed Guild visit; do not recreate loot.
   n.valis+=1030;
   n.inventory.potion_mp_small=(n.inventory.potion_mp_small??0)+1;
   n.inventory.daily_status_recovery_charge=
    (n.inventory.daily_status_recovery_charge??0)+1;
   n.hp=effectiveJinwooMaxHp(n);
   n.mp=effectiveJinwooMaxMp(n);
   n.fatigue=22; // 78% current stamina fraction, after the first descent.
   n.appliedRewardRefs=[...n.appliedRewardRefs,sourceRef];
   return n;
  }
  case "reconcile_chroma_starting_valis":{
   // User-confirmed starting purse was omitted from the initial Orario snapshot.
   // The existing 1,030 valis are Guild income, not the entire wallet.
   const correctionRef="chroma.repair.d1_starting_valis_30000_user_confirmed.317";
   if(s.projectId!=="chroma_orario_main_20261120"||
      s.sessionId!=="chroma_day0_20261120"||
      s.player.hero?.id!=="hero.chroma"||
      sourceRef!=="chroma.repair.d1_starting_valis_30000_applied.318"||
      eventTime!=="D1 18:16"||a.playerApproved!==true||
      q.confirmStartingPurseValis!==30000||
      q.correctionEvidenceRef!==correctionRef||
      !s.events.some(ev=>ev.sourceRef===correctionRef)||
      current.valis!==1030||
      current.appliedRewardRefs.includes(sourceRef))
    throw Error("CHROMA_STARTING_VALIS_RECONCILE_INVALID");
   const n=structuredClone(current);
   n.valis+=30000;
   n.appliedRewardRefs=[...n.appliedRewardRefs,sourceRef];
   return n;
  }
  case "reconcile_chroma_d3_xp":{
   // Source-attested one-off XP repair of six ALREADY committed victories.
   // This never rerolls or reissues monster stones, System gold or a kill.
   const proof="chroma.d3_f5_shadow06_stone_collect.489";
   if(s.projectId!=="chroma_orario_main_20261120"||
      s.sessionId!=="chroma_day0_20261120"||
      s.player.hero?.id!=="hero.chroma"||
      sourceRef!=="chroma.repair.d3_xp_rebalance_490"||
      eventTime!=="D3 10:37"||a.playerApproved!==true||
      q.confirmReviewedBase199!==true||
      !s.events.some(ev=>ev.sourceRef===proof)||
      current.systemLevel!==2||current.xp!==150||
      current.appliedRewardRefs.includes(sourceRef))
     throw Error("CHROMA_D3_XP_RECONCILE_EVIDENCE_OR_STATE_INVALID");
   const n=structuredClone(current);
   n.xp+=124; // 199 total for six kills instead of the previous 75.
   n.appliedRewardRefs.push(sourceRef);
   return n;
  }
  case "reconcile_chroma_razan_xp":{
   // One-time, narrowly source-verified correction after the campaign
   // upgraded Razan's reward from 55 XP to 83 XP (not extra kill XP).
   // Only the existing Chroma save with both confirmed kills qualifies.
   const razanRef="chroma.d3_b2_razan_quicksilver_combo_6.554";
   const brigaRef="chroma.d3_b2_briga_close_combo_7.563";
   if(s.projectId!=="chroma_orario_main_20261120"||
      s.sessionId!=="chroma_day0_20261120"||
      s.player.hero?.id!=="hero.chroma"||
      sourceRef!=="chroma.repair.d3_razan_reward_28xp.584"||
      eventTime!=="D3 18:24"||a.playerApproved!==true||
      q.confirmRazanRewardReview!==true||
      current.appliedRewardRefs.includes(sourceRef)||
      !s.events.some(ev=>ev.sourceRef===razanRef)||
      !s.events.some(ev=>ev.sourceRef===brigaRef)||
      current.defeatEvidence?.["chroma.instant.razan.01"]?.sourceRef!==razanRef||
      current.defeatEvidence?.["chroma.instant.briga.01"]?.sourceRef!==brigaRef||
      current.systemLevel!==7||current.xp!==1459)
    throw Error("CHROMA_RAZAN_REWARD_CORRECTION_NOT_PROVEN");
   const n=structuredClone(current);
   n.xp+=28; // 83 newly balanced XP - 55 previously earned XP.
   n.appliedRewardRefs.push(sourceRef);
   return n;
  }
  case "reconcile_chroma_d3_full":
   return reconcileChromaD3ThroughWolf02(s,{
    sourceRef,eventTime,playerApproved:a.playerApproved===true,
    confirmLedgerThrough510:q.confirmLedgerThrough510===true
   });
  case "evolve_skill":
   return evolveConfirmedSprint(current,{
    sourceRef,confirmedEvolution:q.confirmedEvolution===true,
    playerApproved:a.playerApproved===true
   });
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
  case "local_purchase":{
   // Confirmed real-world Orario goods use valis, never System shop gold.
   // Itemized purchases are CAS-protected, source-unique and Player-approved.
   const itemId=q.itemId,quantity=q.quantity,unitPriceValis=q.unitPriceValis;
   const total=Number(quantity)*Number(unitPriceValis);
   if(a.playerApproved!==true||q.confirmedMerchantTransaction!==true||
      typeof itemId!=="string"||
      !/^[a-z][a-z0-9_]{2,70}$/.test(itemId)||
      !Number.isSafeInteger(quantity)||Number(quantity)<1||Number(quantity)>25||
      !Number.isSafeInteger(unitPriceValis)||Number(unitPriceValis)<1||
      Number(unitPriceValis)>10000000||
      !Number.isSafeInteger(total)||total>current.valis||
      current.appliedRewardRefs.includes(sourceRef)||
      s.player.locationId?.startsWith("orario.dungeon"))
     throw Error("ORARIO_LOCAL_PURCHASE_NOT_CONFIRMED");
   const n=structuredClone(current);
   n.valis-=total;
   n.inventory[itemId]=(n.inventory[itemId]??0)+Number(quantity);
   n.appliedRewardRefs.push(sourceRef);
   return n;
  }
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
  case "stone_sell_batch":
   return sellConfirmedMagicStoneBatch(current,{
    sourceRef,
    confirmedGuildExchange:q.confirmedGuildExchange===true,
    expectedHeldCount:Number(q.expectedHeldCount)
   });
  case "chroma_swap_kasaka_fang":{
   // One recorded pre-existing steel dagger moves from hand to inventory.
   // The owned Kasaka Fang replaces it in the right-hand combat loadout.
   if(s.projectId!=="chroma_orario_main_20261120"||
      s.sessionId!=="chroma_day0_20261120"||
      s.player.hero?.id!=="hero.chroma"||
      !current.storyFlags.includes("chroma.dual_daggers.verified")||
      !current.defeatedTargetRefs.includes("chroma.instant.kasaka.01")||
      !(current.systemDropRefs??[]).includes("chroma.instant.kasaka.01")||
      (current.inventory.kasaka_fang??0)<1||
      current.storyFlags.includes("chroma.equipment.kasaka_fang_right"))
    throw Error("CHROMA_DAGGER_EXCHANGE_NOT_VERIFIED");
   const n=structuredClone(current);
   n.inventory.steel_dagger=(n.inventory.steel_dagger??0)+1;
   n.storyFlags.push("chroma.equipment.kasaka_fang_right");
   n.appliedRewardRefs.push(sourceRef);
   return n;
  }
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
  case "instant_return":
   return useConfirmedInstantReturnCrystal(current,{
    sourceRef,confirmedUse:q.confirmedUse===true,
    playerApproved:a.playerApproved===true
   });
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
  privateSystemNumbersHidden:true,encounter:null,readOnly:true};
 return {available:true,systemLevel:p.systemLevel,xp:p.xp,
  freeStatPoints:p.freeStatPoints,stats:{...p.stats},
  hp:p.hp,hpMax:effectiveJinwooMaxHp(p),
  mp:p.mp,mpMax:effectiveJinwooMaxMp(p),
  fatigue:p.fatigue,stamina:effectiveJinwooStaminaReserve(p),
  effectiveStats:projectJinwooFalna(p).total,
  phase:p.phase,awaitingActivation:p.awaitingActivation??false,
  gold:p.gold,valis:p.valis,
  inventory:{...p.inventory},
  dailyTraining:p.dailyTraining?structuredClone(p.dailyTraining):null,
  skillMastery:structuredClone(p.skillMastery??{}),
  unlockedSkills:[...p.unlockedSkills],
  daggerTechnique:previewDaggerTechnique(p),
  combatTraining:structuredClone(p.combatTraining??{}),
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
