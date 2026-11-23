/** Validates active Player state on every Lab session replay.
 * The original campaign state is stored separately and remains untouched.
 * Optional recent features maintain compatibility with older Player snapshots.
 */
import {projectFalna as projectFalnaV4} from "./crossover_core.ts";
import {JINWOO_STATS,JINWOO_STORE,playerMaxHp,playerMaxMp,
 type JinwooState} from "./shadow_monarch_rules.ts";
const id=(x:unknown)=>typeof x==="string"&&
 /^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(x);
const finite=(x:unknown)=>typeof x==="number"&&
 Number.isFinite(x)&&x>=0&&x<=1e10;
const nat=(x:unknown)=>finite(x)&&Number.isSafeInteger(x);
const record=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const keys=(x:unknown,limit:number)=>record(x)&&Object.keys(x).length<=limit;
const phase=["player_system","shadow_class","true_monarch"];
export function validateOrarioPlayerState(s:JinwooState):JinwooState{
 if(!s||s.schema!=="DANMACHI_JINWOO_PREP_V1"||
  !phase.includes(s.phase)||!Number.isSafeInteger(s.systemLevel)||
  s.systemLevel<1||s.systemLevel>10000||!nat(s.xp)||
  !nat(s.freeStatPoints)||s.freeStatPoints>100000||
  !record(s.stats)||!JINWOO_STATS.every(k=>nat(s.stats[k])&&s.stats[k]<=1e7)||
  !finite(s.hp)||!finite(s.mp)||!finite(s.fatigue)||s.fatigue>100||
  !nat(s.gold)||!nat(s.valis)||!keys(s.inventory,500)||
  !keys(s.magicStones,500)||!keys(s.dungeonKeys,20)||
  !Array.isArray(s.shadowRoster)||s.shadowRoster.length>100000||
  !keys(s.extractionAttempts,10000)||!Array.isArray(s.appliedRewardRefs)||
  s.appliedRewardRefs.length>20000||
  !Array.isArray(s.defeatedTargetRefs)||s.defeatedTargetRefs.length>10000||
  !Array.isArray(s.unlockedSkills)||s.unlockedSkills.length>100||
  !Array.isArray(s.unlockedShopItems)||s.unlockedShopItems.length>100||
  !Array.isArray(s.storyFlags)||s.storyFlags.length>500||
  !Array.isArray(s.completedDailyDays)||s.completedDailyDays.length>10000||
  !s.falna||typeof s.falna.blessed!=="boolean")
  throw Error("ORARIO_PLAYER_STATE_INVALID");
  const unique=(arr:string[])=>arr.every(id)&&new Set(arr).size===arr.length;
  if(s.storyFlags.includes("chroma_crossover_v4")){
   if(s.crossoverSchema!=="chroma_v4_staged"||
      s.chromaV4Meta?.schema!=="CHROMA_V4_META_1"||
      (s.falna.blessed&&!s.layeredFalnaV4))
    throw Error("CHROMA_V4_SCHEMA_OR_LAYERS_MISSING");
   if(s.layeredFalnaV4){
    if(!s.falna.blessed||s.layeredFalnaV4.divineLevel!==s.falna.divineLevel||
       JSON.stringify(s.layeredFalnaV4.current)!==JSON.stringify(s.falna.status))
     throw Error("CHROMA_V4_FALNA_MISMATCH");
    projectFalnaV4(s.layeredFalnaV4,s.stats);
   }
   const meta=s.chromaV4Meta!;
   if(meta.runeRuntime!==undefined){
    const rt=meta.runeRuntime;
    if(!nat(rt.nowSecond)||!Array.isArray(rt.effects)||
       rt.effects.length>256||!Array.isArray(rt.usedRefs)||!Array.isArray(rt.usedProofRefs)||
       rt.usedRefs.length>256||rt.usedProofRefs.length>10000||
       !unique(rt.usedRefs)||!unique(rt.usedProofRefs)||
       !keys(rt.mastery,32)||!keys(rt.cooldownReadyAt,32)||
       (rt.encounterRef!==null&&!id(rt.encounterRef)))
     throw Error("ORARIO_V46_RUNE_RUNTIME_INVALID");
    for(const fx of rt.effects)if(!id(fx.id)||!id(fx.sourceRef)||
       !id(fx.targetId)||!nat(fx.expiresSecond)||
       !Number.isFinite(fx.power)||fx.power<0)
     throw Error("ORARIO_V46_RUNE_EFFECT_INVALID");
   }
   if(meta.titleBattleLedger!==undefined){
    const tl=meta.titleBattleLedger;
    if(typeof tl.battleId!=="string"||!Array.isArray(tl.spentAbilityKeys)||
       !Array.isArray(tl.appliedSourceRefs)||!keys(tl.activeUntil,16))
     throw Error("ORARIO_V46_TITLE_LEDGER_INVALID");
   }
   if(meta.runeAwards!==undefined){
    if(!keys(meta.runeAwards,10000))throw Error("ORARIO_V4_RUNE_AUDIT_INVALID");
    for(const [target,award] of Object.entries(meta.runeAwards)){
     if(!id(target)||!id(award.sourceRef)||!id(award.monsterId)||
        !nat(award.rollTenThousand)||award.rollTenThousand>=10000||
        !nat(award.chanceBasisPoints)||award.chanceBasisPoints>10000||
        (award.runeSkillId!==null&&!id(award.runeSkillId)))
      throw Error("ORARIO_V4_RUNE_AUDIT_INVALID");
    }
   }
   if(!Array.isArray(meta.titleIds)||
      !meta.titleIds.every(id)||new Set(meta.titleIds).size!==meta.titleIds.length||
      (meta.activeTitle!==null&&!meta.titleIds.includes(meta.activeTitle))||
      !Array.isArray(meta.learnedSkills)||!meta.learnedSkills.every(id)||
      !meta.runeStones||Object.entries(meta.runeStones).some(([k,v])=>
        !id(k)||!nat(v)))
    throw Error("CHROMA_V4_META_INVALID");
  }

 if(!unique(s.appliedRewardRefs)||!unique(s.defeatedTargetRefs)||
  !unique(s.unlockedSkills)||!unique(s.unlockedShopItems)||
  !unique(s.storyFlags)||s.completedDailyDays.some(x=>typeof x!=="string"))
  throw Error("ORARIO_PLAYER_STATE_IDENTIFIERS_INVALID");
 for(const [k,v] of Object.entries(s.inventory))
  if(!id(k)||!nat(v))throw Error("ORARIO_PLAYER_INVENTORY_INVALID");
 for(const [id0,st] of Object.entries(s.magicStones)){
  if(!id(id0)||!st||st.id!==id0||!id(st.monsterRef)||
   !["held","sold","consumed_by_shadow"].includes(st.state)||
   !nat(st.guildValueValis)||!nat(st.powerRating))
   throw Error("ORARIO_PLAYER_MAGIC_STONE_INVALID");
 }
 if(s.skillMastery!==undefined){
  if(!keys(s.skillMastery,32))throw Error("ORARIO_SKILL_MASTERY_MAP_INVALID");
  for(const [skillId,progress] of Object.entries(s.skillMastery)){
   if(!id(skillId)||!s.unlockedSkills.includes(skillId)||!progress||
    !Number.isSafeInteger(progress.level)||progress.level<1||progress.level>10||
    !nat(progress.xp)||progress.xp>progress.level*60||
    !nat(progress.uses)||progress.uses>10000000||
    !id(progress.lastPracticeRef)||!Array.isArray(progress.trainedEnemyRefs)||
    progress.trainedEnemyRefs.length>127||
    progress.trainedEnemyRefs.some(x=>!id(x))||
    new Set(progress.trainedEnemyRefs).size!==progress.trainedEnemyRefs.length)
    throw Error("ORARIO_SKILL_MASTERY_INVALID");
  }
 }
 if(s.combatTraining!==undefined){
  if(!keys(s.combatTraining,8))throw Error("ORARIO_COMBAT_TRAINING_MAP_INVALID");
  for(const [kind,p] of Object.entries(s.combatTraining)){
   if(!["dagger","weakpoint","evasion","throw","survival"].includes(kind)||!p||
      !nat(p.uses)||p.uses>10000000||!id(p.lastPracticeRef)||
      !Array.isArray(p.enemyRefs)||p.enemyRefs.length>127||
      p.enemyRefs.some(x=>!id(x))||new Set(p.enemyRefs).size!==p.enemyRefs.length)
    throw Error("ORARIO_COMBAT_TRAINING_INVALID");
  }
 }
 if(s.ammoRemaining!==undefined){
  if(!keys(s.ammoRemaining,2))
   throw Error("ORARIO_PLAYER_AMMO_INVALID");
  for(const [kind,count] of Object.entries(s.ammoRemaining)){
   const maximum=kind==="arrow_bundle"?20:
    kind==="daggers_throwing"?5:-1;
   if(maximum<0||!nat(count)||count>maximum)
    throw Error("ORARIO_PLAYER_AMMO_INVALID");
  }
 }
 if(s.defeatEvidence!==undefined){
  if(!keys(s.defeatEvidence,10000))
   throw Error("ORARIO_PLAYER_DEFEAT_EVIDENCE_INVALID");
  for(const [ref,e] of Object.entries(s.defeatEvidence)){
   if(!id(ref)||!id(e.monsterId)||!id(e.sourceRef)||
      !nat(e.floor)||e.floor<1||e.floor>100||
      !s.defeatedTargetRefs.includes(ref)||
      !s.appliedRewardRefs.includes(e.sourceRef))
    throw Error("ORARIO_PLAYER_DEFEAT_EVIDENCE_INVALID");
  }
 }
 const shadowIds=new Set<string>();
 for(const sh of s.shadowRoster){
  if(!id(sh.id)||shadowIds.has(sh.id)||
   !id(sh.originRef)||!["common","elite","knight","commander","marshal"].includes(sh.powerTier)||
   !nat(sh.defeatedCount)||typeof sh.stored!=="boolean"||
   sh.name.trim().length<1||sh.name.length>150||
   (sh.victories!==undefined&&!nat(sh.victories))||
   (sh.victoryRefs!==undefined&&(!Array.isArray(sh.victoryRefs)||
    !unique(sh.victoryRefs))))
   throw Error("ORARIO_PLAYER_SHADOW_INVALID");
  shadowIds.add(sh.id);
 }
 for(const [k,v] of Object.entries(s.extractionAttempts))
  if(!id(k)||!nat(v)||v>1)throw Error("ORARIO_PLAYER_ATTEMPT_INVALID");
 for(const [k,v] of Object.entries(s.dungeonKeys)){
  if(!id(k)||v.id!==k||!id(v.issuedRef)||
   !["held","entered","cleared","retreated"].includes(v.state))
   throw Error("ORARIO_PLAYER_DUNGEON_KEY_INVALID");
 }
 const basicFalna=["strength","endurance","dexterity","agility","magic"] as const;
 if(!nat(s.falna.divineLevel)||s.falna.divineLevel>10||
  (s.falna.blessed&&(!id(s.falna.godId)||
    s.falna.divineLevel<1))||
  !basicFalna.every(k=>nat(s.falna.status[k])&&s.falna.status[k]<=1999)||
  !Array.isArray(s.falna.skills)||s.falna.skills.length>24)
  throw Error("ORARIO_PLAYER_FALNA_INVALID");
 if(s.injuries!==undefined){
  if(!Array.isArray(s.injuries)||s.injuries.length>64)
   throw Error("ORARIO_PLAYER_INJURY_INVALID");
  for(const wound of s.injuries)
   if(!id(wound.id)||!id(wound.createdRef)||
    ![1,2,3].includes(wound.severity)||
    typeof wound.active!=="boolean"||typeof wound.treated!=="boolean")
    throw Error("ORARIO_PLAYER_INJURY_INVALID");
 }
 if(s.dailyTraining!==undefined){
  const d=s.dailyTraining;
  if(!nat(d.day)||!nat(d.deadlineMinute)||!id(d.issuedRef)||
   !["active","claimed","failed"].includes(d.status)||
   !["pushups","squats","situps","runMeters"].every(k=>
    nat(d.exercises[k as keyof typeof d.exercises])))
   throw Error("ORARIO_PLAYER_DAILY_INVALID");
 }
 if(s.systemDropRefs!==undefined&&(!Array.isArray(s.systemDropRefs)||
  s.systemDropRefs.length>10000||
  !unique(s.systemDropRefs)))
  throw Error("ORARIO_PLAYER_DROP_CLAIMS_INVALID");
 if(s.dailyHistory!==undefined&&(!Array.isArray(s.dailyHistory)||
  s.dailyHistory.length>500||s.dailyHistory.some(v=>!nat(v))))
  throw Error("ORARIO_PLAYER_DAILY_HISTORY_INVALID");
  if(s.activeEncounter?.bleedingWounds!==undefined){
   const wounds=s.activeEncounter.bleedingWounds;
   if(!Array.isArray(wounds)||wounds.length>256||wounds.some(w=>
      !Number.isFinite(w.damageFractionPerSecond)||
      w.damageFractionPerSecond<=0||w.damageFractionPerSecond>0.1||
      !nat(w.secondsRemaining)||w.secondsRemaining>3600))
    throw Error("ORARIO_V4_ENEMY_BLEED_INVALID");
  }
  if(s.activeEncounter?.paralyzedLocations!==undefined){
   const limbs=s.activeEncounter.paralyzedLocations;
   if(!Array.isArray(limbs)||limbs.length>256||limbs.some(p=>
      !id(p.location)||!nat(p.secondsRemaining)||p.secondsRemaining>3600))
    throw Error("ORARIO_V4_ENEMY_PARALYSIS_INVALID");
  }
  if(s.activeEncounter!==undefined){
  const e=s.activeEncounter;
  if(!id(e.enemyRef)||!id(e.monsterId)||!id(e.startedRef)||
   !nat(e.floor)||!nat(e.enemyHp)||!nat(e.round)||e.floor>100||
   e.round>10000||
   (e.blindedUntilRound!==undefined&&(!nat(e.blindedUntilRound)||
    e.blindedUntilRound>10000)))throw Error("ORARIO_PLAYER_ENCOUNTER_INVALID");
 }
 if(s.hp>playerMaxHp({
  strength:s.stats.strength,stamina:s.stats.stamina+1e5,
  agility:s.stats.agility,perception:s.stats.perception,
  intelligence:s.stats.intelligence})||
  s.mp>playerMaxMp({...s.stats,intelligence:s.stats.intelligence+1e5}))
  throw Error("ORARIO_PLAYER_HP_MP_INVALID");
 return s;
}
