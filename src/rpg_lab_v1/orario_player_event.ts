import {castV48,evolveV48,v48Known,ownsV48,practiceV48,v48Hazard,v48World,readV48,v48EndBattle,v48Strength} from "./chroma_runes_v48.ts";
import {usesSharpnessRules,SHARPNESS_RULE_FLAG} from "./chroma_sharpness_v48.ts";
import {previewOwnedEquipmentEncounter as v48EquipPreview} from "./danmachi_player_equipment.ts";
import {requireMigrationReceipt,type MigrationBackupReceipt} from "./migration_receipt.ts";
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
import {quoteChromaLinosMagicStone} from "./chroma_guild_economy.ts";
import {quoteChromaV4Stone} from "./chroma_v4_stone_prices.ts";
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
import {stageChromaV4} from "./legacy_lab_adapter.ts";
import {previewResourceRebase} from "./resource_rebase.ts";
import {applyV4RuneStudy} from "./legacy_lab_adapter.ts";
import {childRuneVictoryRef} from "./reward_child_refs_v46.ts";
import {currentActionProofRef,confirmCurrentPlayerAction,confirmHistoricProof}
 from "./v47_action_proofs.ts";
import {scopedVitalProofRef} from "./v47_vital_hit_proof.ts";
import {isSystemEncounterId} from "./orario_system_encounters.ts";
import {monsterForPlayer,commitBalancedMonsterDefeat} from "./danmachi_player_balance.ts";
import {applyVerifiedV46RuneCast,applyVerifiedV46EquipTitle,
 applyVerifiedV46TitleGrant,applyVerifiedV46RuneChallenge,
 applyVerifiedV46RulerEvolution,advanceVerifiedV46RuneTime,
 type LiveV46Save,type RuneTitleEventHost} from "./rune_title_actions_v46.ts";
import type {RuneSkillId} from "./rune_abilities_v45.ts";
import type {TitleId} from "./title_rules_v45.ts";
import type {RuneChallengeId} from "./rune_challenges_v45.ts";
import {runChromaHuntBatch} from "./hunt_batch.ts";
const playable=new Set([
 "init","activate","chroma_v4_migrate","rune_study","rune_cast","rune_evolve","equip_title","title_grant","rune_challenge","start_battle","combat_exchange","activate_skill",
 "daily_start","daily_progress","daily_claim","daily_fail",
 "purchase","use_item","spend_points","falna_bless","falna_update",
 "stone_collect","stone_sell","stone_sell_batch","stone_extract","monster_drop",
 "chroma_swap_kasaka_fang","reconcile_chroma_f9_rabbit_vital",
 "unlock","change_class","plot_key","dungeon_key","dungeon_enter",
 "dungeon_clear","instant_return","first_knight","shadow_deploy","shadow_victory",
 "shadow_revive","daily_box","injury","rest","medical_care",
 "reconcile_chroma_d1","reconcile_chroma_starting_valis",
 "reconcile_chroma_d3_xp","reconcile_chroma_d3_full",
 "reconcile_chroma_razan_xp","reconcile_chroma_kandiaru_blessing",
 "reconcile_chroma_d3_linos_47_stones","reconcile_chroma_d4_daily_triple","evolve_skill",
 "local_purchase","hunt_batch","rune_practice_v48"
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
 sourceRef:string,eventTime:string,historicProof?:LabSession["events"][number],backupReceipt?:MigrationBackupReceipt):JinwooState{
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
  case "hunt_batch":{
   const batch=runChromaHuntBatch(s,sourceRef,a.args,applyOrarioPlayerAction);
   if(eventTime!==batch.receipt.endClock)throw Error("HUNT_END_CLOCK_MISMATCH:"+batch.receipt.endClock);
   return batch.next;
  }
  case "reconcile_chroma_d4_daily_triple":{
   // One-time correction for the D4 claim which was committed by the older
   // choice-based code. That claim already awarded +3 unallocated points.
   // Only supply its two missing independent, unspent rewards.
   const rewardRef="chroma.d4_daily_claim_recovery_plus_three_points.690";
   const flag="quest.repair.chroma.d4.triple_daily_rewards";
   if(s.projectId!=="chroma_orario_main_20261120"||
      s.sessionId!=="chroma_day0_20261120"||
      s.player.hero?.id!=="hero.chroma"||
      !s.events.some(e=>e.sourceRef===rewardRef)||
      current.dailyTraining?.day!==4||
      current.dailyTraining.status!=="claimed"||
      current.dailyTraining.rewardRef!==rewardRef||
      !current.completedDailyDays.includes("4")||
      current.storyFlags.includes(flag)||
      q.confirmedHistory!==true)
    throw Error("CHROMA_D4_TRIPLE_REWARD_REPAIR_NOT_VERIFIED");
   const n=structuredClone(current);
   n.inventory.daily_status_recovery_charge=
    (n.inventory.daily_status_recovery_charge??0)+1;
   n.inventory.system_daily_box=(n.inventory.system_daily_box??0)+1;
   n.storyFlags.push(flag);
   n.appliedRewardRefs.push(sourceRef);
   return n;
  }
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
  case "reconcile_chroma_d3_linos_47_stones":{
   // PLAYER AUTHORISED: one-time correction of ONLY the 47 stones already
   // sold on D3, never the earlier batch of fourteen stones on D1.
   // Actual size/saturation/integrity of the D3 stones were never recorded.
   // We deliberately price each as one ordinary standard intact specimen
   // (100/100/100); do NOT retrospectively generate rare qualities or loot.
   const originalSaleRef="chroma.d3_guild_eina_sell_47_stones.650";
   const verifiedSpeciesRef="chroma.repair.d3_guild_47_stones_species_detail.652";
   const approvedEconomyRef="chroma.rules.linos_guild_economy_docs_transfer.660";
   const knownKinds=[
    {monsterId:"killer_ant",count:22},
    {monsterId:"war_shadow",count:20},
    {monsterId:"goblin",count:2},
    {monsterId:"kobold",count:2},
    {monsterId:"dungeon_lizard",count:1}
   ] as const;
   const repairedTotal=knownKinds.reduce((v,k)=>v+
    quoteChromaLinosMagicStone({
     monsterId:k.monsterId,sizePct:100,saturationPct:100,integrityPct:100
    }).valis*k.count,0);
   const originalValis=5040;
   const sold=Object.values(current.magicStones).filter(x=>x.state==="sold");
   const recordedSaleValis=sold.reduce((v,x)=>v+x.guildValueValis,0);
   if(s.projectId!=="chroma_orario_main_20261120"||
      s.sessionId!=="chroma_day0_20261120"||
      s.player.hero?.id!=="hero.chroma"||
      sourceRef!=="chroma.repair.d3_linos_47_stones_reprice.661"||
      eventTime!=="D3 19:44"||a.playerApproved!==true||
      q.confirmStandardQualityForHistorical47!==true||
      q.excludeFirst14!==true||
      !s.events.some(ev=>ev.sourceRef===originalSaleRef)||
      !s.events.some(ev=>ev.sourceRef===verifiedSpeciesRef)||
      !s.events.some(ev=>ev.sourceRef===approvedEconomyRef)||
      sold.length!==47||
      recordedSaleValis!==originalValis||
      repairedTotal!==54550||
      current.valis!==33870||
      current.appliedRewardRefs.includes(sourceRef))
    throw Error("CHROMA_LINOS_D3_47_STONE_REPAIR_EVIDENCE_MISMATCH");
   const n=structuredClone(current);
   n.valis+=repairedTotal-originalValis; // +49,510; expected 83,380.
   n.appliedRewardRefs.push(sourceRef);
   // Do not re-mark stones as sold, mutate the old Guild receipt,
   // award more XP or System Gold, or manufacture stone qualities.
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
  case "reconcile_chroma_kandiaru_blessing":{
   // The original Double Dungeon awakening already conferred Kandiaru's
   // poison protection. Chroma's v3.5 venom consumption mistakenly treated
   // this as a later learned skill. Correct status only, not inventory,
   // resources, wins, Guild money or System XP.
   const drinkRef="chroma.d3_kasaka_venom_drunk_on_way_guild.641";
   if(s.projectId!=="chroma_orario_main_20261120"||
      s.sessionId!=="chroma_day0_20261120"||
      s.player.hero?.id!=="hero.chroma"||
      sourceRef!=="chroma.repair.d3_kandiaru_blessing.647"||
      eventTime!=="D3 19:21"||
      a.playerApproved!==true||
      q.confirmPreexistingKandiaruBlessing!==true||
      current.appliedRewardRefs.includes(sourceRef)||
      !s.events.some(ev=>ev.sourceRef===drinkRef)||
      !current.appliedRewardRefs.includes(drinkRef)||
      !current.storyFlags.includes("status.kasaka_armor_scales_20")||
      !current.storyFlags.includes("status.kasaka_weakened_muscles_35")||
      current.storyFlags.includes("blessing.kandiaru_poison_immunity")||
      current.systemLevel!==8||
      (current.inventory.kasaka_venom??0)!==0)
    throw Error("CHROMA_KANDIARU_SOURCE_CORRECTION_UNVERIFIED");
   const n=structuredClone(current);
   n.storyFlags=n.storyFlags.filter(x=>x!=="status.kasaka_weakened_muscles_35");
   n.storyFlags.push("blessing.kandiaru_poison_immunity");
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
  case "chroma_v4_migrate":{
   requireMigrationReceipt(backupReceipt,s.projectId,s.sessionId);
   if(s.projectId!=="chroma_orario_main_20261120"||
      s.sessionId!=="chroma_day0_20261120"||
      s.player.hero?.id!=="hero.chroma"||a.playerApproved!==true||
      current.activeEncounter||q.confirmedBackup!==true)
    throw Error("CHROMA_V4_MIGRATION_GATES_NOT_MET");
   if(q.enableV48===true){
    if(!current.storyFlags.includes("chroma_crossover_v4")||usesSharpnessRules(current.storyFlags)||current.appliedRewardRefs.includes(sourceRef))throw Error("V48_MIGRATION_GATES_NOT_MET");
    const n=structuredClone(current);n.storyFlags.push(SHARPNESS_RULE_FLAG);n.chromaV4Meta!.v48Runtime={mastery:{}};
    n.activeSkills=(n.activeSkills??[]).filter(x=>x.id!=="critical_attack"&&x.id!=="mutilation");
    if(n.chromaV4Meta!.runeRuntime)n.chromaV4Meta!.runeRuntime.effects=n.chromaV4Meta!.runeRuntime.effects.filter(x=>x.type!=="barrier");
    n.appliedRewardRefs.push(sourceRef);return n;
   }
   const staged=stageChromaV4(current as unknown as LiveV46Save) as unknown as JinwooState;
   const rebase=previewResourceRebase({
    systemLevel:current.systemLevel,systemStats:current.stats,
    falna:staged.layeredFalnaV4??null,
    oldHp:current.hp,oldMaxHp:effectiveJinwooMaxHp(current),
    oldMp:current.mp,oldMaxMp:effectiveJinwooMaxMp(current)});
   staged.hp=rebase.proposed.hp;staged.mp=rebase.proposed.mp;
   staged.appliedRewardRefs.push(sourceRef);
   return staged;
  }
  case "rune_practice_v48":{
   const skillId=String(q.skillId??""),proofRef=String(q.proofRef??"");
   const proof=historicProof?.sourceRef===proofRef?historicProof:s.events.find(x=>x.sourceRef===proofRef);
   if(s.player.hero?.id!=="hero.chroma"||!ownsV48(current,skillId)||!proof||current.appliedRewardRefs.includes(sourceRef)||current.appliedRewardRefs.includes(proofRef)||!confirmHistoricProof({proofKind:proof.kind??"",expectedKind:"rune_practice_proof."+skillId,proofTime:proof.time,actionTime:eventTime,proofRef,sourceRef}))throw Error("V48_PRACTICE_PROOF_INVALID");
   const n=structuredClone(current);practiceV48(n,skillId,proofRef);n.appliedRewardRefs.push(sourceRef,proofRef);return n;
  }
  case "rune_cast":case "rune_evolve":case "equip_title":case "title_grant":case "rune_challenge":{
   // Sources and outcomes are read from the authenticated Lab session;
   // no player-submitted HP, hit roll, monster power or proof is trusted.
   if(s.projectId!=="chroma_orario_main_20261120"||
      s.sessionId!=="chroma_day0_20261120"||
      s.player.hero?.id!=="hero.chroma"||
      !current.storyFlags.includes("chroma_crossover_v4"))
    throw Error("CHROMA_V46_WRONG_CAMPAIGN_OR_NOT_MIGRATED");
   // Ordinary casts and title equips are already authenticated CAS actions.
   const currentProof=a.kind==="rune_cast"||a.kind==="equip_title";
   const proofRef=currentProof?
    currentActionProofRef(sourceRef,a.kind as "rune_cast"|"equip_title"):
    String(q.proofRef??"");
   if(currentProof&&q.proofRef!==undefined&&q.proofRef!==proofRef)
    throw Error("V47_CLIENT_PROOF_OVERRIDE_REJECTED");
   const proof=currentProof?undefined:
    (historicProof?.sourceRef===proofRef?historicProof:s.events.find(x=>x.sourceRef===proofRef));
   const verifiedKind=(kind:string)=>{
    if(kind==="rune_cast"||kind==="equip_title")
     return confirmCurrentPlayerAction({projectId:s.projectId,
      sessionId:s.sessionId,heroId:s.player.hero?.id,
      actionKind:a.kind,requestedKind:kind,sourceRef,proofRef,
      playerApproved:a.playerApproved===true});
    if(!proof)return false;
    const expectedKind=kind+"_proof."+String(
     kind==="rune_evolve"?"rulers_touch":
     kind==="title_grant"?q.titleId:q.challengeId);
    return confirmHistoricProof({proofKind:proof.kind??"",expectedKind,
     proofTime:proof.time,actionTime:eventTime,proofRef,sourceRef});
   };
   const enemyCard=()=>{
    const en=current.activeEncounter;
    if(!en)throw Error("V46_NO_SAVED_ENCOUNTER");
    return monsterForPlayer(current,en.monsterId,{floor:en.floor,
     monsterRef:en.enemyRef,irregularRef:en.irregularRef});
   };
   const host:RuneTitleEventHost={
    verifyAction:(kind,src,ref)=>src===sourceRef&&ref===proofRef&&verifiedKind(kind),
    getMaxHp:x=>effectiveJinwooMaxHp(x as unknown as JinwooState),
    getMaxMp:x=>effectiveJinwooMaxMp(x as unknown as JinwooState),
    getEffectiveIntelligence:x=>projectJinwooFalna(x as unknown as JinwooState).total.intelligence,
    getEnemyStats:()=>{
     const m=enemyCard();return {maxHp:m.hp,armor:m.armor,
      strength:m.combat.strength,magicResistancePct:0,
      size:m.kind==="monster_rex"?"giant":m.hp>=1000?"large":"medium",
      poisonImmune:false};
    },
    confirmRuneHit:(src,proofId,enemyRef)=>{
     // Deterministic server roll; the client cannot submit confirmedHit.
     let h=2166136261>>>0;
     for(const c of `rune.hit|${src}|${proofId}|${enemyRef}`){
      h^=c.charCodeAt(0);h=Math.imul(h,16777619);
     }
     const m=enemyCard();
     const iq=projectJinwooFalna(current).total.intelligence;
     const chance=Math.max(8,Math.min(97,Math.round(70+
      .6*(iq-m.combat.perception))));
     return (h>>>0)%100<chance;
    },
    verifyTitleClear:(id,ref)=>ref===proofRef&&proof?.kind==="title_grant_proof."+id&&
     current.storyFlags.includes(`title.v46.${id}.earned`),
    verifyChallengeClear:(id,ref)=>ref===proofRef&&
     proof?.kind==="rune_challenge_proof."+id&&
     current.storyFlags.includes(`rune.challenge.${id}.cleared`),
    verifyEvolutionFeat:ref=>ref===proofRef&&
     proof?.kind==="rune_evolve_proof.rulers_touch"&&
     current.storyFlags.includes("rune.evolution.rulers_touch.earned"),
   };
   const v46=current as unknown as LiveV46Save;
   if(usesSharpnessRules(current.storyFlags)&&v48Known(String(q.skillId??""))){
    const skillId=String(q.skillId);
    if(a.kind==="rune_evolve")return evolveV48(current,{sourceRef,proofRef,skillId,verifiedFeat:!!proof&&confirmHistoricProof({proofKind:proof.kind??"",expectedKind:"rune_evolve_proof."+skillId,proofTime:proof.time,actionTime:eventTime,proofRef,sourceRef})&&current.storyFlags.includes("rune.evolution."+skillId+".earned")});
    if(a.kind!=="rune_cast"||!verifiedKind("rune_cast"))throw Error("V48_CAST_PROOF_INVALID");
    const minute=narrativeMinute(eventTime),previous=narrativeMinute(s.gameClock);if(minute===null||previous===null)throw Error("V48_CAST_CLOCK_INVALID");
    const en=current.activeEncounter,mob=en?enemyCard():undefined;let damage:number|undefined,hit:boolean|undefined;
    if(skillId==="cleaving_blade"){
     if(!en||q.target!=="enemy"||typeof q.weaponId!=="string"||["shortbow","daggers_throwing"].includes(q.weaponId))throw Error("V48_CLEAVE_REQUIRES_EDGE");
     const p=v48EquipPreview(current,{monsterId:en.monsterId,floor:en.floor,loadout:{weaponId:q.weaponId},move:"strike",attackStyle:"slash",...(en.irregularRef?{confirmedIrregularRef:en.irregularRef}:{})});
     if(p.gear.sharpness===null)throw Error("V48_CLEAVE_REQUIRES_EDGE");damage=p.exchange.damageIfHit;hit=host.confirmRuneHit(sourceRef,proofRef,en.enemyRef);
    }
    const n=castV48(current,{sourceRef,skillId,minute,maxHp:effectiveJinwooMaxHp(current),elapsedMinutes:minute-previous,
     ...(typeof q.hpPercent==="number"?{hpPercent:q.hpPercent}:{}),...(typeof q.count==="number"?{count:q.count}:{}),...(typeof q.durationSeconds==="number"?{durationSeconds:q.durationSeconds}:{}),...(en?{enemyRef:en.enemyRef,enemyLevel:mob!.systemThreatLevel}:{}),...(damage!==undefined?{damage,hit}:{})});
    if(en&&n.activeEncounter?.enemyHp===0){n.activeEncounter=undefined;v48EndBattle(n);return commitBalancedMonsterDefeat(n,{sourceRef:childRuneVictoryRef(sourceRef,"direct"),monsterId:en.monsterId,floor:en.floor,monsterRef:en.enemyRef,confirmedDefeat:true,killer:"player",...(en.irregularRef?{confirmedIrregularRef:en.irregularRef}:{})});}
    return n;
   }
   if(a.kind==="rune_cast"){
    const minute=narrativeMinute(eventTime);
    if(minute===null)throw Error("V46_RUNE_EVENT_CLOCK_INVALID");
    const r=applyVerifiedV46RuneCast(v46,{sourceRef,proofRef,
     skillId:String(q.skillId??"") as RuneSkillId,
     target:String(q.target??"") as "self"|"enemy",
     serverSecond:minute*60,confirmedPlayerChoice:true,
     ...(q.durationSeconds!==undefined?{durationSeconds:q.durationSeconds as number}:{}),
     ...(q.channelSeconds!==undefined?{channelSeconds:q.channelSeconds as number}:{}),
     ...(q.preparedSeconds!==undefined?{preparedSeconds:q.preparedSeconds as number}:{})
    },host);
    if(r.enemyDefeated){
     const en=current.activeEncounter!;
     const defeated=structuredClone(r.next) as unknown as JinwooState;
     defeated.activeEncounter=undefined;
     return commitBalancedMonsterDefeat(defeated,{
      sourceRef:childRuneVictoryRef(sourceRef,"direct"),monsterId:en.monsterId,
      floor:en.floor,monsterRef:en.enemyRef,confirmedDefeat:true,killer:"player",
      ...(en.irregularRef?{confirmedIrregularRef:en.irregularRef}:{})
     });
    }
    return r.next as unknown as JinwooState;
   }
   if(a.kind==="rune_evolve")return applyVerifiedV46RulerEvolution(v46,{
    sourceRef,proofRef,confirmedPlayerChoice:true},host) as unknown as JinwooState;
   if(a.kind==="equip_title")return applyVerifiedV46EquipTitle(v46,{
    sourceRef,proofRef,titleId:q.titleId===null?null:String(q.titleId??"") as TitleId,
    confirmedPlayerChoice:true},host) as unknown as JinwooState;
   if(a.kind==="title_grant")return applyVerifiedV46TitleGrant(v46,{
    sourceRef,proofRef,titleId:String(q.titleId??"") as TitleId},host) as unknown as JinwooState;
   return applyVerifiedV46RuneChallenge(v46,{sourceRef,proofRef,
    challengeId:String(q.challengeId??"") as RuneChallengeId},host) as unknown as JinwooState;
  }
  case "rune_study":
   return applyV4RuneStudy(current as unknown as LiveV46Save,{sourceRef,skillId:String(q.skillId??""),
    playerConfirmed:true}) as unknown as JinwooState;
  case "reconcile_chroma_f9_rabbit_vital":{
   // One-time, source-bound adjudication of the already executed penetrating
   // head thrust. No new attack, roll, skill use, fatigue, MP or stone collection.
   const first="chroma.d4_f9_rabbit_head_combo.792";
   const second="chroma.d4_f9_rabbit_head_thrust.793";
   const enemy="chroma.d4.f9.needle_rabbit.790";
   const battle=current.activeEncounter;
   if(s.projectId!=="chroma_orario_main_20261120"||
      s.sessionId!=="chroma_day0_20261120"||s.player.hero?.id!=="hero.chroma"||
      sourceRef!=="chroma.repair.d4_f9_rabbit_vital.794"||
      eventTime!==s.gameClock||eventTime!=="D4 13:47"||
      q.confirmExistingBrainPenetration!==true||
      !current.storyFlags.includes("chroma_crossover_v4")||
      ![first,second].every(ref=>s.events.some(e=>e.sourceRef===ref)&&
        current.appliedRewardRefs.includes(ref))||
      current.appliedRewardRefs.includes(sourceRef)||
      current.defeatedTargetRefs.includes(enemy)||current.defeatEvidence?.[enemy]||
      !battle||battle.enemyRef!==enemy||battle.monsterId!=="needle_rabbit"||
      battle.floor!==9||battle.round!==2||battle.lastCombatRef!==second||
      battle.startedRef!=="chroma.d4_f9_search_needle_rabbit.790"||
      (battle.bleedingWounds?.length??0)<2||
      !battle.paralyzedLocations?.some(x=>x.location==="whole_body"&&x.secondsRemaining>0))
    throw Error("CHROMA_F9_RABBIT_VITAL_REPAIR_NOT_PROVEN");
   const corrected=structuredClone(current);
   corrected.activeEncounter=undefined;
   return commitBalancedMonsterDefeat(corrected,{sourceRef,monsterId:battle.monsterId,
    floor:battle.floor,monsterRef:enemy,confirmedDefeat:true,killer:"player"});
  }
  case "start_battle":
   if(!s.player.locationId?.startsWith("orario.dungeon")&&
     !Object.values(current.dungeonKeys).some(k=>k.state==="entered"))
    throw Error("ORARIO_PLAYER_BATTLE_LOCATION_NOT_VERIFIED");
   return startConfirmedOrarioBattle(current,{
    ...q,sourceRef,playerCommitted:a.playerApproved===true,
    confirmedHostile:q.confirmedHostile===true
   } as Parameters<typeof startConfirmedOrarioBattle>[1]);
  case "combat_exchange":{
   // The current authenticated event binds an intended vital strike to
   // the precise encounter. The client cannot choose a proof ref.
   if(q.vitalProofRef!==undefined)
    throw Error("V47_CLIENT_VITAL_PROOF_NOT_ALLOWED");
   const vitalEnemy=current.activeEncounter;
   const vitalProof=q.vitalTarget===undefined?undefined:
    scopedVitalProofRef({sourceRef,
     encounterStartedRef:vitalEnemy?.startedRef??"",
     enemyRef:vitalEnemy?.enemyRef??"",
     monsterId:vitalEnemy?.monsterId??"",
     targetLocation:String(q.targetLocation??""),
     vitalTarget:q.vitalTarget as "brain"|"heart"|"magic_stone",
     hasMagicStone:!!vitalEnemy&&!isSystemEncounterId(vitalEnemy.monsterId)});
   const result=resolveConfirmedOrarioExchange(current,{
    ...q,sourceRef,playerCommitted:a.playerApproved===true,
    currentMinute:narrativeMinute(eventTime)??-1,
    ...(vitalProof?{vitalProofRef:vitalProof}:{})
   } as Parameters<typeof resolveConfirmedOrarioExchange>[1]);
   if(!current.storyFlags.includes("chroma_crossover_v4")||
      !result.next.activeEncounter||!result.next.chromaV4Meta?.runeRuntime)
    return result.next;
   const minute=narrativeMinute(eventTime);
   if(minute===null)throw Error("V46_RUNE_EXCHANGE_CLOCK_REQUIRED");
   const nextState=result.next,en=nextState.activeEncounter!;
   const card=monsterForPlayer(nextState,en.monsterId,{floor:en.floor,
    monsterRef:en.enemyRef,irregularRef:en.irregularRef});
   const host:RuneTitleEventHost={
    verifyAction:()=>false,verifyTitleClear:()=>false,
    verifyChallengeClear:()=>false,verifyEvolutionFeat:()=>false,confirmRuneHit:()=>false,
    getMaxHp:x=>effectiveJinwooMaxHp(x as unknown as JinwooState),
    getMaxMp:x=>effectiveJinwooMaxMp(x as unknown as JinwooState),
    getEffectiveIntelligence:x=>projectJinwooFalna(x as unknown as JinwooState).total.intelligence,
    getEnemyStats:()=>({maxHp:card.hp,armor:card.armor,
     strength:card.combat.strength,magicResistancePct:0,
     size:card.kind==="monster_rex"?"giant":card.hp>=1000?"large":"medium",
     poisonImmune:false})};
   const before=nextState.chromaV4Meta!.runeRuntime!.nowSecond;
   const ticked=advanceVerifiedV46RuneTime(nextState as unknown as LiveV46Save,{
    serverSecond:Math.max(minute*60,before+1)},host);
   if(ticked.enemyDefeated){
    const outcome=structuredClone(ticked.next) as unknown as JinwooState;
    outcome.activeEncounter=undefined;
    return commitBalancedMonsterDefeat(outcome,{
     sourceRef:childRuneVictoryRef(sourceRef,"dot"),monsterId:en.monsterId,
     floor:en.floor,monsterRef:en.enemyRef,
     confirmedDefeat:true,killer:"player",
     ...(en.irregularRef?{confirmedIrregularRef:en.irregularRef}:{})});
   }
   return ticked.next as unknown as JinwooState;
  }
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
  case "stone_collect":{
   // Only Chroma's new stone acquisitions use the approved Linos valuation.
   // No auto-default quality and no retroactive revaluation of sold stones.
   if(s.projectId==="chroma_orario_main_20261120"&&
      s.sessionId==="chroma_day0_20261120"&&
      s.player.hero?.id==="hero.chroma"){
    const targetRef=String(q.monsterRef??"");
    const proof=current.defeatEvidence?.[targetRef];
    const monsterId=q.monsterId??proof?.monsterId;
    if(typeof monsterId!=="string"||
       ((q.acquisition??"own_kill")==="own_kill"&&
         proof?.monsterId!==monsterId)||
       a.playerApproved!==true)
     throw Error("CHROMA_STONE_SPECIES_OR_PROOF_REQUIRED");
    const quote=current.storyFlags.includes("chroma_crossover_v4")?
     quoteChromaV4Stone({monsterId,sizePct:q.sizePct as number,
      saturationPct:q.saturationPct as number,
      integrityPct:q.integrityPct as number}):
     quoteChromaLinosMagicStone({monsterId,sizePct:q.sizePct as number,
      saturationPct:q.saturationPct as number,
      integrityPct:q.integrityPct as number});
    if(quote.valis<1||
       (q.guildValueValis!==undefined&&q.guildValueValis!==quote.valis))
     throw Error("CHROMA_STONE_PRICE_NOT_CONFIRMED");
    return addConfirmedMagicStone(current,{
     ...q,sourceRef,confirmedLoot:q.confirmedLoot===true,
     guildValueValis:quote.valis,
     sizePct:quote.sizePct,saturationPct:quote.saturationPct,
     integrityPct:quote.integrityPct,pricingModel:current.storyFlags.includes("chroma_crossover_v4")?
      "chroma_bestiary_v2":"chroma_linos_v1"
    } as Parameters<typeof addConfirmedMagicStone>[1]);
   }
   return addConfirmedMagicStone(current,{
    ...q,sourceRef,confirmedLoot:q.confirmedLoot===true
   } as Parameters<typeof addConfirmedMagicStone>[1]);
  }
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
  case "injury":{
   if(usesSharpnessRules(current.storyFlags)&&["fall","heat","magic"].includes(String(q.damageKind))&&q.confirmedCause===true){
    const minute=narrativeMinute(eventTime);if(minute===null||typeof q.damage!=="number")throw Error("V48_HAZARD_INVALID");
    const n=structuredClone(current),damage=v48Hazard(n,q.damage,q.damageKind as "fall"|"heat"|"magic",minute,sourceRef);
    if(!damage){if(n.appliedRewardRefs.includes(sourceRef))throw Error("V48_HAZARD_DUPLICATE");n.appliedRewardRefs.push(sourceRef);return n;}
    return applyConfirmedInjury(n,{...q,damage,sourceRef,confirmedCause:true} as Parameters<typeof applyConfirmedInjury>[1]);
   }
   return applyConfirmedInjury(current,{
    ...q,sourceRef,confirmedCause:q.confirmedCause===true
   } as Parameters<typeof applyConfirmedInjury>[1]);
  }
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
  ...(usesSharpnessRules(p.storyFlags)?{runeV48:{mastery:readV48(p).mastery,world:v48World(p,narrativeMinute(s.gameClock)??0),strengthBonusPct:v48Strength(p),lastAction:readV48(p).lastAction}}:{}),
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
