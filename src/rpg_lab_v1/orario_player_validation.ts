/** Validates active Player state on every Lab session replay.
 * The original campaign state is stored separately and remains untouched.
 * Optional recent features maintain compatibility with older Player snapshots.
 */
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
    !Number.isSafeInteger(progress.level)||progress.level<1||progress.level>5||
    !nat(progress.xp)||progress.xp>progress.level*60||
    !nat(progress.uses)||progress.uses>10000000||
    !id(progress.lastPracticeRef)||!Array.isArray(progress.trainedEnemyRefs)||
    progress.trainedEnemyRefs.length>127||
    progress.trainedEnemyRefs.some(x=>!id(x))||
    new Set(progress.trainedEnemyRefs).size!==progress.trainedEnemyRefs.length)
    throw Error("ORARIO_SKILL_MASTERY_INVALID");
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
   !["held","entered","cleared"].includes(v.state))
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
