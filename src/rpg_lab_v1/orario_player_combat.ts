import {v48BattleBonus,v48StrikePractice,v48Fatigue,v48PhysicalShield,v48PainStore,v48PainRelease,v48Fear,v48EndBattle} from "./chroma_runes_v48.ts";
import {effectiveJinwooStaminaReserve} from "./shadow_monarch_rules.ts";
import {usesSharpnessRules} from "./chroma_sharpness_v48.ts";
import {criticalMultiplier,criticalChain,criticalProfile,timedMutilationChain,type MutilationReceipt} from "./chroma_critical_v48.ts";
import {boundedChildRef} from "./event_child_refs.ts";
/** Event-sourced freeform skirmish integration.
 * One confirmed exchange can represent a short narration sequence, but all
 * mechanical outcomes remain deterministic and derived from a saved action.
 * No free NPC-kills, player actions, missing enemies, loot or ad hoc damage.
 */
import type {JinwooState,PlayerCombatEncounter} from "./shadow_monarch_rules.ts";
import {
  monsterForPlayer,previewCombatExchange,commitBalancedMonsterDefeat,
 type CombatMove
} from "./danmachi_player_balance.ts";
import {previewOwnedEquipmentEncounter,type Loadout} from
 "./danmachi_player_equipment.ts";
import {previewInjuryPenalties,applyConfirmedInjury} from
 "./orario_player_survival.ts";
import {getPlayerSkillBattleModifiers,recordConfirmedSkillPractice,
 recordConfirmedCombatTechnique,previewDaggerTechnique} from "./orario_player_skills.ts";
import {effectiveJinwooMaxHp,xpToNextLevel} from "./shadow_monarch_rules.ts";
import {activeTitleImpact} from "./title_rules_v45.ts";
import {validScopedVitalProof} from "./v47_vital_hit_proof.ts";
import {projectJinwooFalna} from "./shadow_monarch_rules.ts";
import {toV4Player} from "./legacy_lab_adapter.ts";
import {applyV46UnbrokenDefense,type LiveV46Save} from "./rune_title_actions_v46.ts";
import {readCombatCondition,applyConfirmedImpacts,advanceEnemyStatuses,
 paralysisCounterPenalty,type ConfirmedImpact} from "./chroma_live_combat_status.ts";
import {isSystemEncounterId,systemEncounterEntryAllowed} from "./orario_system_encounters.ts";
const safeRef=(x:string)=>/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(x);
function hash(ref:string,salt:string):number{
 let h=2166136261;for(const c of ref+"|"+salt){
  h^=c.charCodeAt(0);h=Math.imul(h,16777619);
 }return (h>>>0)%100+1;
}
/** Explicit animal identities plus previously supported beast families. */
export function isWolfSlayerBeast(monsterId:string):boolean{
 return /wolf|kobold|silverback|beast/.test(monsterId)||
  new Set(["needle_rabbit","metal_rabbit","almiraj","dungeon_lizard",
   "jack_bird","frog_shooter","bad_bat","hellhound","ligerfang","battle_boar",
   "mammoth_fool","sword_stag","skull_sheep","old_bison","black_rhinos",
   "loup_garou","loup_garou_surface","gryphon","hippogriff","unicorn",
   "system.razan","system.briga","system.kasaka","infant_dragon","minotaur",
   "desert_lizard","firebird","aqua_serpent","thunder_snake"]).has(monsterId);
}
export type BattleResolution={
 next:JinwooState;rolls:{player:number;enemy:number};
 dealt:number;taken:number;injuryRef?:string;
 daggerComboBonusDamage?:number;
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
 const mob=monsterForPlayer(s,e.monsterId,{
  floor:e.floor,monsterRef:e.monsterRef,irregularRef:e.irregularRef});
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
 spellId?:string;currentMinute?:number;
 tacticalApproach?:"standard"|"paint_blind"|"hit_and_run";
 confirmedPaintAvailable?:boolean;
 confirmedWeakPointHit?:boolean;
 attackStyle?:"slash"|"thrust"|"blunt";painReleasePercent?:number;
 /** Explicitly described multi-cut sequence, not a free automatic strike. */
  confirmedComboAttack?:boolean;
  targetLocation?:string;
  /** Requires a preexisting immutable GM/journal proof flag, not this declaration. */
  vitalProofRef?:string;
  vitalTarget?:"brain"|"heart"|"magic_stone";
}):BattleResolution{
 const battle=s.activeEncounter,mob=battle&&monsterForPlayer(s,battle.monsterId,{
  floor:battle.floor,monsterRef:battle.enemyRef,irregularRef:battle.irregularRef});
 if(!battle||!mob||!e.playerCommitted||!safeRef(e.sourceRef)||
  s.appliedRewardRefs.includes(e.sourceRef)||s.hp<=0||s.awaitingActivation)
  throw Error("PLAYER_EXCHANGE_NOT_AUTHORIZED");
 if(e.tacticalApproach!==undefined&&
   !["standard","paint_blind","hit_and_run"].includes(e.tacticalApproach))
  throw Error("PLAYER_TACTIC_INVALID");
 if(e.confirmedComboAttack===true&&e.move!=="strike")
  throw Error("PLAYER_DAGGER_COMBO_REQUIRES_STRIKE");
 if(e.tacticalApproach==="paint_blind"&&e.confirmedPaintAvailable!==true)
  throw Error("PLAYER_PAINT_NOT_CONFIRMED");
  const v4=s.storyFlags.includes("chroma_crossover_v4");
  if(e.loadout.offhandWeaponId&&(!v4||e.move!=="strike"||
     e.loadout.offhandWeaponId===e.loadout.weaponId))
   throw Error("ORARIO_V4_OFFHAND_NOT_AUTHORIZED");
  const vitalScoped=e.vitalTarget!==undefined&&battle!==undefined&&
   validScopedVitalProof(e.vitalProofRef,{
    sourceRef:e.sourceRef,encounterStartedRef:battle.startedRef,
    enemyRef:battle.enemyRef,monsterId:battle.monsterId,
    targetLocation:e.targetLocation??"",vitalTarget:e.vitalTarget,
    hasMagicStone:!isSystemEncounterId(battle.monsterId)});
  if(e.vitalTarget!==undefined&&(!v4||!vitalScoped||
     e.confirmedWeakPointHit!==true))
   throw Error("ORARIO_V47_VITAL_HIT_UNVERIFIED");
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
 const beastForTitle=isWolfSlayerBeast(mob.id);
 const wolfTitleBoost=v4&&beastForTitle&&
  next.chromaV4Meta?.activeTitle==="wolf_slayer"&&
  next.chromaV4Meta.titleIds.includes("wolf_slayer")?1.4:1;
 const rawTotal=wolfTitleBoost>1?projectJinwooFalna(next):null;
 const boost=(key:keyof JinwooState["stats"])=>(rawTotal?
  Math.max(0,Math.round(rawTotal.total[key]*wolfTitleBoost)-rawTotal.bonus[key]):
  next.stats[key]);
 const runeBonus=v48BattleBonus(next,minute,projectJinwooFalna(next).total,e.move==="strike");
 const battleStats={...next,stats:{...next.stats,
  strength:boost("strength")+runeBonus.strength,stamina:boost("stamina"),
  agility:boost("agility")+modifiers.agilityBonus+runeBonus.agility,
  perception:boost("perception")+runeBonus.perception,intelligence:boost("intelligence")}};
 const daggerFighting=e.move==="strike"&&(
  e.loadout.weaponId?.includes("dagger")===true||
  e.loadout.weaponId==="kasaka_fang"||
  (usesSharpnessRules(next.storyFlags)&&e.loadout.weaponId==="knight_killer")||
  (!e.loadout.weaponId&&next.storyFlags.includes("chroma.dual_daggers.verified")));
 if(e.confirmedComboAttack===true&&!daggerFighting)
  throw Error("PLAYER_DAGGER_COMBO_REQUIRES_DAGGERS");
 const daggerTechnique=previewDaggerTechnique(next);
 const v48=usesSharpnessRules(next.storyFlags);
 if(e.attackStyle!==undefined&&!['slash','thrust','blunt'].includes(e.attackStyle))throw Error('V48_ATTACK_STYLE_INVALID');
 const forced=v48&&daggerFighting&&e.loadout.weaponId!=="daggers_throwing"?(next.activeSkills??[]).find(x=>x.expiresMinute>minute&&x.criticalMultiplier!==undefined):undefined;
 if(forced)next.activeSkills=(next.activeSkills??[]).filter(x=>x.startedRef!==forced.startedRef);
 let series:number[]=[];
 // Recover the original level of an old in-flight activation from its snapshot.
 const mutilationProfile=forced?.id==="mutilation"?{
  strikes:forced.criticalStrikes??3,
  seriesDurationMs:forced.criticalSeriesDurationMs??criticalProfile("mutilation",
   Math.max(1,Math.min(10,1+Math.round(((forced.criticalMultiplier??3)-3)*9)))).seriesDurationMs!
 }:null;
 let mutilationReceipt:MutilationReceipt|undefined;
 const resolveMutilation=(firstHit:boolean,damage:number,hp:number)=>{
  const {impacts,...timing}=timedMutilationChain(mutilationProfile!,firstHit,damage,hp,
   i=>hash(e.sourceRef,"critical_series_"+i)<=wear.exchange.hitChancePercent);
  mutilationReceipt={sourceRef:e.sourceRef,enemyRef:active.enemyRef,...timing};
  return impacts;
 };
 // Dagger skill multiplies damage and attack tempo, never a new stat.
 const learnedBonus=0;
 const wear=previewOwnedEquipmentEncounter(battleStats,{
  monsterId:battle.monsterId,floor:battle.floor,
  loadout:e.loadout,move:e.move==="retreat"?"guard":e.move,attackStyle:e.attackStyle,currentMinute:minute,
  ...(e.proficiencyBonus!==undefined||learnedBonus>0?
   {proficiencyBonus:Math.min(20,(e.proficiencyBonus??0)+learnedBonus)}:{}),
  positionBonus:(e.positionBonus??0)+modifiers.positionBonus-injury.speedPenalty,
  ...(e.spellMpCost!==undefined?{spellMpCost:e.spellMpCost}:{}),
  ...(e.spellId!==undefined?{spellId:e.spellId}:{}),
  ...(battle.irregularRef?{confirmedIrregularRef:battle.irregularRef}:{})
 });
 // Fired projectiles are consumed on each attack, even when they miss.
 // A purchased arrow bundle holds 20 arrows; a throwing set holds 5 knives.
 if(e.move==="strike"){
  const ammoId=e.loadout.weaponId==="shortbow"?"arrow_bundle":
   e.loadout.weaponId==="daggers_throwing"?"daggers_throwing":null;
  if(ammoId){
   let remaining=next.ammoRemaining?.[ammoId]??0;
   if(remaining===0){
    if((next.inventory[ammoId]??0)<1)
     throw Error("PLAYER_BATTLE_OUT_OF_AMMUNITION");
    next.inventory[ammoId]--;
    if(next.inventory[ammoId]===0)delete next.inventory[ammoId];
    remaining=ammoId==="arrow_bundle"?20:5;
   }
   next.ammoRemaining={...(next.ammoRemaining??{}),
    [ammoId]:remaining-1};
  }
 }
  const chance=wear.exchange.hitChancePercent;
  const enemyHpBeforeV4=active.enemyHp;
 let dealt=0,taken=0,daggerComboBonusDamage=0,injuryRef:undefined|string;
 if(e.move==="retreat"){
  const evade=Math.max(10,Math.min(92,Math.round(45+
   (battleStats.stats.agility-mob.combat.agility)*.6-injury.speedPenalty+
   (e.positionBonus??0)+modifiers.positionBonus+
   Math.round((modifiers.reactionMultiplier-1)*50))));
  if(rolls.player<=evade){
   active.round++;
   next.activeEncounter=undefined;v48EndBattle(next);
   next.appliedRewardRefs.push(e.sourceRef);
   return {next,rolls,dealt,taken,outcome:"retreat",
    xpGranted:0,systemGoldGranted:0};
  }
 }else if(e.move!=="guard"&&rolls.player<=chance){
  dealt=Math.max(1,wear.exchange.damageIfHit-injury.attackPenalty);
  if(daggerFighting&&daggerTechnique.unlocked){
   dealt=Math.max(1,Math.round(dealt*daggerTechnique.damageMultiplier));
   const activeNow=modifiers.currentlyActive;
   if(!v48&&e.confirmedWeakPointHit===true&&
      activeNow.some(x=>x==="critical_attack"||x==="mutilation"))
    dealt=Math.round(dealt*(activeNow.includes("mutilation")?1.85:1.50));
   if(e.loadout.weaponId==="daggers_throwing"&&
      activeNow.some(x=>x==="dagger_throw"||x==="dagger_rush"))
    dealt=Math.round(dealt*(activeNow.includes("dagger_rush")?1.45:1.20));
   // Faster extra cut only if player actually ordered multiple strikes.
   if(!forced&&e.confirmedComboAttack===true&&
      e.loadout.weaponId!=="daggers_throwing"&&
      hash(e.sourceRef,"dagger_combo_speed")<=
       daggerTechnique.attackSpeedBonusPercent){
    daggerComboBonusDamage=Math.max(1,Math.round(dealt*.45));
    dealt+=daggerComboBonusDamage;
   }
  }
  if(s.storyFlags.includes("chroma_crossover_v4")&&s.chromaV4Meta){
   const tags:string[]=[];
   if(isWolfSlayerBeast(mob.id))tags.push("beast");
   if(/ant|spider|mantis|arachne/.test(mob.id))tags.push("chitin");
   if(/goliath|giant|udaius|titan/.test(mob.id))tags.push("giant");
   if(mob.armor>=10)tags.push("armor");
   const title=activeTitleImpact(toV4Player(next as unknown as LiveV46Save),{
    tags,weakPointConfirmed:e.confirmedWeakPointHit===true&&
     vitalScoped,
    jointStrikeConfirmed:e.confirmedWeakPointHit===true,
    physicalAttack:e.move==="strike"});
   dealt=Math.max(1,Math.round(dealt*title.physicalDamageMultiplier));
   dealt+=Math.round(mob.armor*1.6*title.armorIgnoreFraction);
  }
  if(v48&&e.move==="strike"){
   dealt=Math.round(dealt*criticalMultiplier(e.confirmedWeakPointHit===true,forced?.criticalMultiplier));
   if(mutilationProfile)series=resolveMutilation(true,dealt,enemyHpBeforeV4);
   else if(forced)series=criticalChain({strikes:forced.criticalStrikes??1},true,dealt,enemyHpBeforeV4,i=>hash(e.sourceRef,"critical_series_"+i)<=chance);
   dealt+=v48PainRelease(next,battle.enemyRef,e.painReleasePercent??100);
  }
  active.enemyHp=Math.max(0,active.enemyHp-dealt-series.slice(1).reduce((a,b)=>a+b,0));
 }
  if(mutilationProfile&&!mutilationReceipt)resolveMutilation(false,0,enemyHpBeforeV4);
  if(mutilationReceipt)next.lastMutilation=mutilationReceipt;
  // V4 only: independently validate the second held blade, calculate its
  // own hit roll and damage, then advance persisted bleed and paralysis.
  let v4ParalysisPenalty=0,v4DirectLanded=false;
  if(v4&&e.move!=="retreat"){
   const impacts:ConfirmedImpact[]=[];
   const loc=e.targetLocation??"torso";
   const confirmedVital=e.vitalTarget!==undefined&&
     e.vitalProofRef!==undefined&&vitalScoped;
   if(dealt>0&&e.move==="strike")impacts.push({
    weaponId:e.loadout.weaponId??"unarmed",attackLanded:true,penetrated:true,
    physicalDamage:dealt,location:loc,
    ...(confirmedVital?{confirmedVitalEvidence:true,weakPoint:e.vitalTarget}:{}),
   });
   for(const damage of series.slice(1))impacts.push({weaponId:e.loadout.weaponId??"unarmed",attackLanded:true,penetrated:true,physicalDamage:damage,location:loc});
   if(e.move==="strike"&&e.loadout.offhandWeaponId&&active.enemyHp>0&&!mutilationProfile){
    const off=previewOwnedEquipmentEncounter(battleStats,{
     monsterId:battle.monsterId,floor:battle.floor,
     loadout:{weaponId:e.loadout.offhandWeaponId},move:"strike",attackStyle:e.attackStyle,currentMinute:minute,
     positionBonus:(e.positionBonus??0)+modifiers.positionBonus-injury.speedPenalty,
     ...(e.proficiencyBonus!==undefined?{proficiencyBonus:e.proficiencyBonus}:{}),
     ...(battle.irregularRef?{confirmedIrregularRef:battle.irregularRef}:{})
    });
    if(hash(e.sourceRef,"offhand_hit")<=off.exchange.hitChancePercent){
     const offDamage=Math.max(1,off.exchange.damageIfHit-injury.attackPenalty);
     impacts.push({weaponId:e.loadout.offhandWeaponId,attackLanded:true,
      penetrated:true,physicalDamage:offDamage,location:loc});
     v48Fatigue(next,off.exchange.attackerResourceCost.fatigue,effectiveJinwooStaminaReserve(next).max,battle.enemyRef);
    }
   }
   const initial=readCombatCondition({enemyHp:enemyHpBeforeV4,
    enemyMaxHp:mob.hp,physiology:mob.kind==="monster_rex"?"large":"ordinary",
    hasMagicStone:!isSystemEncounterId(battle.monsterId),
    status:{bleedingWounds:active.bleedingWounds,
     paralyzedLocations:active.paralyzedLocations}});
   v4DirectLanded=impacts.length>0;
   const inflicted=applyConfirmedImpacts(initial,impacts,v48&&!!forced?11:2);
   // The existing one-second status tick represents the surrounding exchange,
   // not the fixed subsecond duration of the Mutilation strike sequence.
   const advanced=advanceEnemyStatuses(inflicted.target,1);
   active.enemyHp=e.move==="magic"&&v48?Math.max(0,advanced.hp-dealt):advanced.hp;
   active.bleedingWounds=advanced.bleedingWounds;
   active.paralyzedLocations=advanced.paralyzedLocations;
   v4ParalysisPenalty=paralysisCounterPenalty(advanced);
   dealt=enemyHpBeforeV4-active.enemyHp;
  }
  const cost=wear.exchange.attackerResourceCost;
 if(cost.mp>next.mp)throw Error("PLAYER_BATTLE_MP_INSUFFICIENT");
 next.mp-=cost.mp;v48Fatigue(next,cost.fatigue*Math.max(1,series.length),effectiveJinwooStaminaReserve(next).max,battle.enemyRef);
 if(v48&&e.move==="strike")v48StrikePractice(next,minute,battle.enemyRef,dealt>0,e.attackStyle==="thrust"&&wear.gear.sharpness!==null,wear.gear.sharpness!==null&&e.attackStyle!=="blunt",mob.armor);
 if(v48&&series.length&&forced&&(forced.id==="critical_attack"||forced.id==="mutilation")){
  const trained=recordConfirmedSkillPractice(next,{skillId:forced.id,enemyRef:battle.enemyRef,sourceRef:e.sourceRef,threatLevel:mob.systemThreatLevel,confirmedEffective:true});
  next.skillMastery=trained.skillMastery;
  if(forced.id==="critical_attack"&&(next.skillMastery?.critical_attack?.level??0)>=5&&(next.combatTraining?.weakpoint?.uses??0)>=45&&!next.unlockedSkills.includes("mutilation"))next.unlockedSkills.push("mutilation");
 }
 active.round++;
 active.lastCombatRef=e.sourceRef;
 // Credit one source-attested success per enemy, not every hit or activation.
 if(dealt>0&&e.move==="strike"&&(!v4||v4DirectLanded)){
  const speedSkill=modifiers.currentlyActive.includes("quicksilver")?"quicksilver":
   modifiers.currentlyActive.includes("sprint")?"sprint":null;
  if(speedSkill)next.skillMastery=recordConfirmedSkillPractice(next,{
   skillId:speedSkill,enemyRef:battle.enemyRef,sourceRef:e.sourceRef,
   threatLevel:mob.systemThreatLevel,confirmedEffective:true}).skillMastery;
  if(daggerFighting){
   const trained=recordConfirmedCombatTechnique(next,{kind:"dagger",
    enemyRef:battle.enemyRef,sourceRef:e.sourceRef,confirmedEffective:true});
   next.combatTraining=trained.combatTraining;
   next.unlockedSkills=trained.unlockedSkills;
  }
  if(e.confirmedWeakPointHit===true&&daggerFighting){
   const trained=recordConfirmedCombatTechnique(next,{kind:"weakpoint",
    enemyRef:battle.enemyRef,sourceRef:e.sourceRef,confirmedEffective:true});
   next.combatTraining=trained.combatTraining;
   next.unlockedSkills=trained.unlockedSkills;
  }
  if(e.loadout.weaponId==="daggers_throwing"){
   const trained=recordConfirmedCombatTechnique(next,{kind:"throw",
    enemyRef:battle.enemyRef,sourceRef:e.sourceRef,confirmedEffective:true});
   next.combatTraining=trained.combatTraining;
   next.unlockedSkills=trained.unlockedSkills;
  }
 }
 // Physical pigment is an attempt, not a guaranteed blind: separate roll.
 if(e.tacticalApproach==="paint_blind"&&e.move==="strike"&&
    hash(e.sourceRef,"paint")<=Math.min(90,Math.max(12,
      chance-10-Math.floor(mob.combat.perception/4))))
  active.blindedUntilRound=active.round+2;
 if(active.enemyHp<=0){
  // No automatic loot. A separate confirmed recovery event may collect
  // the intact magic stone. XP & gold committed on the same battle event.
  const oldLevel=next.systemLevel,oldGold=next.gold,oldXp=next.xp;
  next.activeEncounter=undefined;v48EndBattle(next);
  const raised=commitBalancedMonsterDefeat(next,{
   sourceRef:e.sourceRef,monsterId:mob.id,floor:battle.floor,
   monsterRef:battle.enemyRef,confirmedDefeat:true,killer:"player",
   ...(battle.irregularRef?{confirmedIrregularRef:battle.irregularRef}:{})
  });
  return {next:raised,rolls,dealt,taken,outcome:"victory",
   daggerComboBonusDamage,
   xpGranted:raised.systemLevel===oldLevel?raised.xp-oldXp:
    // Reconstruct total awarded XP across all crossed levels.
    Array.from({length:raised.systemLevel-oldLevel},(_,i)=>oldLevel+i)
      .reduce((sum,l)=>sum+xpToNextLevel(l,raised.storyFlags.includes("chroma_crossover_v4")),0)
      +raised.xp-oldXp,
   systemGoldGranted:raised.gold-oldGold};
 }
 // Real distance and visibility decide whether a counterattack is possible.
 const outOfReach=e.tacticalApproach==="hit_and_run"&&dealt>0&&
  battleStats.stats.agility>=mob.combat.agility*1.2;
 const blinded=active.blindedUntilRound!==undefined&&
  active.round<=active.blindedUntilRound;
  let counterChance=outOfReach?0:Math.max(0,
  wear.exchange.counterHitChancePercent-(blinded?45:0)-
  Math.round((modifiers.reactionMultiplier-1)*50)-
  (next.unlockedSkills.includes("combat_evasion")?4:0)-
   (daggerFighting?Math.round(daggerTechnique.attackSpeedBonusPercent/4):0)-
   v4ParalysisPenalty-v48Fear(next,battle.enemyRef,minute));
  if(v4&&next.chromaV4Meta?.runeRuntime){
   const runes=next.chromaV4Meta.runeRuntime;
   const active=runes.effects.filter(x=>x.targetId===battle.enemyRef&&
    x.expiresSecond>runes.nowSecond);
   if(active.some(x=>x.type==="stagger"||x.type==="webbed"||
    (x.type==="paralyzed"&&x.location==="whole_body")))counterChance=0;
   else counterChance=Math.max(0,counterChance-active.reduce((n,x)=>n+
    (x.type==="paralyzed"?20:0),0));
  }
  if(rolls.enemy>counterChance&&counterChance>0&&
    !outOfReach&&e.move==="strike"){
  const trained=recordConfirmedCombatTechnique(next,{kind:"evasion",
   enemyRef:battle.enemyRef,sourceRef:e.sourceRef,confirmedEffective:true});
  next.combatTraining=trained.combatTraining;
  next.unlockedSkills=trained.unlockedSkills;
 }
 if(rolls.enemy<=counterChance){
  taken=Math.max(0,wear.exchange.counterDamageIfHit+
    injury.defensePenalty);
  // Canon Kasaka Armored Scales: permanent -20% to PHYSICAL harm only.
  // Combat exchanges are physical unless a separately proven magic
  // interaction says otherwise. Apply once before HP/injury severity.
  if(next.storyFlags.includes("status.kasaka_armor_scales_20"))
   taken=Math.max(0,Math.round(taken*.8));
  const maxHp=effectiveJinwooMaxHp(next);
  if(next.unlockedSkills.includes("tenacity")&&next.hp<=maxHp*.30)
   taken=Math.max(1,Math.round(taken*.80));
   if(v4&&next.chromaV4Meta){
    const protectedHit=applyV46UnbrokenDefense(next as unknown as LiveV46Save,{
     sourceRef:e.sourceRef,incomingPhysicalDamage:taken,maxHp});
    next.chromaV4Meta=protectedHit.next.chromaV4Meta;
    taken=protectedHit.damage;
   }
   if(v4&&next.chromaV4Meta?.runeRuntime){
    const ledger=next.chromaV4Meta.runeRuntime;
    const barriers=ledger.effects.filter(x=>x.targetId==="hero.chroma"&&
     x.type==="barrier"&&!v48&&x.expiresSecond>ledger.nowSecond);
    for(const barrier of barriers){
     if(taken<=0)break;
     const absorbed=Math.min(taken,Math.floor(barrier.power));
     barrier.power-=absorbed;taken-=absorbed;
    }
    ledger.effects=ledger.effects.filter(x=>x.type!=="barrier"||x.power>0);
   }
   if(v48){taken=v48PhysicalShield(next,taken,minute,battle.enemyRef);v48PainStore(next,Math.min(next.hp,taken),maxHp,battle.enemyRef);}
   next.hp=Math.max(0,next.hp-taken);
  if(next.hp>0&&next.hp<=maxHp*.30){
   const trained=recordConfirmedCombatTechnique(next,{kind:"survival",
    enemyRef:battle.enemyRef,sourceRef:e.sourceRef,confirmedEffective:true});
   next.combatTraining=trained.combatTraining;
   next.unlockedSkills=trained.unlockedSkills;
  }
  // Severe strikes, not every scratch, can create a lasting injury.
  if(taken>=Math.ceil(maxHp*.16)&&next.hp>0){
   const place=["torso","left_arm","right_arm","left_leg","right_leg","head"] as const;
   const location=place[hash(e.sourceRef,"part")%place.length];
   const severity=taken>=maxHp*.35?3:taken>=maxHp*.23?2:1;
   injuryRef=boundedChildRef(e.sourceRef,"",".wound");
   const h=applyConfirmedInjury({...next,hp:next.hp+taken},{
    sourceRef:injuryRef,injuryId:boundedChildRef(e.sourceRef,"wound.",""),location,
    kind:location==="torso"?"bruise":"bleeding",
    severity:severity as 1|2|3,damage:taken,confirmedCause:true
   });
   // Keep battle state and rewards of base exchange; only wound is added.
   next.hp=h.hp;next.injuries=h.injuries;
   next.appliedRewardRefs=h.appliedRewardRefs;
  }
 }
 next.appliedRewardRefs.push(e.sourceRef);
 return {next,rolls,dealt,taken,injuryRef,daggerComboBonusDamage,
  outcome:next.hp<=0?"unconscious":"ongoing",
  xpGranted:0,systemGoldGranted:0};
}
export function readCurrentPlayerBattle(s:JinwooState){
 if(!s.activeEncounter)return {active:false,readOnly:true};
 const mob=monsterForPlayer(s,s.activeEncounter.monsterId,{
  floor:s.activeEncounter.floor,monsterRef:s.activeEncounter.enemyRef,
  irregularRef:s.activeEncounter.irregularRef});
 return {active:true,enemyRef:s.activeEncounter.enemyRef,
  enemyType:mob?.name??"неизвестно",
  enemyHp:s.activeEncounter.enemyHp,enemyMaxHp:mob?.hp,
  round:s.activeEncounter.round,playerHp:s.hp,
  playerMp:s.mp,fatigue:s.fatigue,
  injuries:previewInjuryPenalties(s),
  playerChoiceRequired:true,readOnly:true};
}
