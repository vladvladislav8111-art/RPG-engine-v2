/**
 * Chroma x Orario RPG Lab v4 release candidate: isolated, dependency-free rules.
 * Crossover math is explicitly a house rule, not numeric anime/manga canon.
 * NO production state writes, deployment, or campaign migration here.
 */

export const SYSTEM_STAT_KEYS = ["strength", "stamina", "agility", "perception", "intelligence"] as const;
export const FALNA_STAT_KEYS = ["strength", "endurance", "dexterity", "agility", "magic"] as const;
export type SystemStatKey = typeof SYSTEM_STAT_KEYS[number];
export type FalnaStatKey = typeof FALNA_STAT_KEYS[number];
export type FiveStats = Record<SystemStatKey, number>;
export type FalnaStats = Record<FalnaStatKey, number>;
export type FalnaLayer = { level: number; earned: FalnaStats; sealed: true; featRef: string };
export type FalnaStateV4 = {
  divineLevel: number;
  current: FalnaStats;
  sealedLayers: FalnaLayer[];
};
export type CombatStatTotals = { system: FiveStats; falna: FiveStats; combined: FiveStats };
export type SystemPlayer = {
  systemLevel: number;
  xp: number;
  gold: number;
  stats: FiveStats;
  freeStatPoints: number;
  hp: number;
  mp: number;
  fatigue: number;
  confirmedDefeats: string[];
  confirmedRewardRefs: string[];
  titleIds: string[];
  activeTitle: string | null;
  runeStones: Record<string,number>;
  learnedSkills: string[];
};
export type MonsterRewardCard = {
  id: string;
  systemLevel: number;
  baseXp: number;
  systemGold: number;
  dungeonStoneValis: number | null;
  magicStonePossible: boolean;
  runeId?: string;
  runeChancePercent?: number;
  allowedToSpawn: boolean;
};

function requireSafeInt(v: number, label: string, min = 0) {
  if (!Number.isSafeInteger(v) || v < min) throw Error(`${label}_INVALID`);
}
function copy<T>(v: T): T { return structuredClone(v); }
function roundReward(n: number, label: string): number {
  if (!Number.isFinite(n) || n > Number.MAX_SAFE_INTEGER) throw Error(`${label}_OVERFLOW`);
  return Math.max(1, Math.round(n));
}
export const XP_CURVE_VERSION = "chroma_crossover_v4_100_level_pow_1.75_candidate";
export function xpToNextLevel(level: number): number {
  requireSafeInt(level, "SYSTEM_LEVEL", 1);
  if (level > 10000) throw Error("SYSTEM_LEVEL_LIMIT");
  return roundReward(100 * level ** 1.75, "SYSTEM_LEVEL_COST");
}
export function xpForDefeat(baseXp: number, monsterLevel: number, playerLevel: number): number {
  requireSafeInt(baseXp, "BASE_XP", 1);
  requireSafeInt(monsterLevel, "MONSTER_LEVEL", 1);
  requireSafeInt(playerLevel, "SYSTEM_LEVEL", 1);
  const difference = monsterLevel - playerLevel;
  if (difference <= -20) return 1;
  // Intentionally uncapped for a truly exceptional, confirmed victory.
  return roundReward(baseXp * 1.1 ** difference, "MONSTER_XP");
}
export function nextSystemLevel(
  player: SystemPlayer,
  experience: number,
  restoreResources: (next: SystemPlayer) => { hp: number; mp: number },
): { player: SystemPlayer; levelsGained: number } {
  requireSafeInt(experience, "AWARD_XP");
  const next = copy(player);
  requireSafeInt(next.xp, "EXISTING_XP");
  next.xp += experience;
  if (!Number.isSafeInteger(next.xp)) throw Error("PLAYER_XP_OVERFLOW");
  let count = 0;
  while (next.xp >= xpToNextLevel(next.systemLevel)) {
    if (count++ > 10000) throw Error("SYSTEM_LEVEL_BATCH_TOO_LARGE");
    next.xp -= xpToNextLevel(next.systemLevel);
    next.systemLevel++;
    for (const k of SYSTEM_STAT_KEYS) next.stats[k]++;
    next.freeStatPoints += 5;
    const max = restoreResources(next);
    requireSafeInt(max.hp, "RESTORED_HP");
    requireSafeInt(max.mp, "RESTORED_MP");
    next.hp = max.hp;
    next.mp = max.mp;
    next.fatigue = 0;
  }
  return {player: next, levelsGained: count};
}

function zeroSystemStats(): FiveStats {
  return { strength: 0, stamina: 0, agility: 0, perception: 0, intelligence: 0 };
}
function validateFalnaStats(stats: FalnaStats) {
  for (const key of FALNA_STAT_KEYS) {
    requireSafeInt(stats[key], `FALNA_${key.toUpperCase()}`);
    if (stats[key] > 1999) throw Error("FALNA_STAT_CAP");
  }
}
function scoreFromFalna(raw: FalnaStats, multiplier: number): FiveStats {
  return {
    strength: Math.floor(raw.strength / 10) * multiplier,
    stamina: Math.floor(raw.endurance / 10) * multiplier,
    agility: Math.floor(raw.agility / 10) * multiplier,
    perception: Math.floor(raw.dexterity / 10) * multiplier,
    intelligence: Math.floor(raw.magic / 10) * multiplier,
  };
}
/** Existing Falna values keep the multiplier of their ORIGINAL rank forever. */
export function projectFalna(falna: FalnaStateV4, system: FiveStats): CombatStatTotals {
  requireSafeInt(falna.divineLevel, "FALNA_LEVEL", 1);
  if (falna.divineLevel > 20) throw Error("FALNA_LEVEL_LIMIT");
  validateFalnaStats(falna.current);
  if (falna.sealedLayers.length !== falna.divineLevel - 1) throw Error("FALNA_LAYER_COUNT_MISMATCH");
  const bonus = zeroSystemStats();
  const layers = [...falna.sealedLayers.map(x => {
    if (!x.sealed || !x.featRef || x.level < 1) throw Error("FALNA_SEALED_LAYER_INVALID");
    validateFalnaStats(x.earned);
    return x;
  }), { level: falna.divineLevel, earned: falna.current }];
  const seen = new Set<number>();
  for (const layer of layers) {
    if (seen.has(layer.level) || layer.level < 1 || layer.level > falna.divineLevel) {
      throw Error("FALNA_LAYER_SEQUENCE_INVALID");
    }
    seen.add(layer.level);
    const points = scoreFromFalna(layer.earned, 2 ** (layer.level - 1));
    for (const key of SYSTEM_STAT_KEYS) bonus[key] += points[key];
  }
  for (const key of SYSTEM_STAT_KEYS) requireSafeInt(system[key], `SYSTEM_${key.toUpperCase()}`);
  const total = copy(system);
  for (const key of SYSTEM_STAT_KEYS) total[key] += bonus[key];
  return { system: copy(system), falna: bonus, combined: total };
}
export function updateFalnaStatus(falna: FalnaStateV4, next: FalnaStats): FalnaStateV4 {
  validateFalnaStats(next);
  for (const key of FALNA_STAT_KEYS)
    if (next[key] < falna.current[key]) throw Error("FALNA_CURRENT_RANK_CANNOT_DECREASE");
  return { ...copy(falna), current: copy(next) };
}
export function rankUpFalna(falna: FalnaStateV4, featRef: string): FalnaStateV4 {
  if (!/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(featRef)) throw Error("FALNA_FEAT_REQUIRED");
  if (!FALNA_STAT_KEYS.some(k => falna.current[k] >= 500)) throw Error("FALNA_D500_REQUIRED");
  projectFalna(falna, zeroSystemStats()); // verify sealed layers before snapshot
  return {
    divineLevel: falna.divineLevel + 1,
    current: { strength: 0, endurance: 0, dexterity: 0, agility: 0, magic: 0 },
    sealedLayers: [...copy(falna.sealedLayers), {
      level: falna.divineLevel, earned: copy(falna.current), sealed: true, featRef,
    }],
  };
}

/** Never auto-recover physical loot from a Dungeon mob. */
export function confirmTwoWorldKill(player: SystemPlayer, event: {
  sourceRef: string;
  targetRef: string;
  defeated: boolean;
  playerContributionConfirmed: boolean;
  monster: MonsterRewardCard;
  randomRuneRoll: number; // caller's recorded deterministic [0,1) source
  resources: (player: SystemPlayer) => { hp: number; mp: number };
}): { player: SystemPlayer; system: {
  xp: number; gold: number; levelsGained: number; runeStone?: string;
}; danmachi: { exceliaEventRequired: true; magicStoneRecoverable: boolean;
  potentialStoneValis: number | null }; } {
  if (!event.defeated || !event.playerContributionConfirmed)
    throw Error("REWARD_UNCONFIRMED_KILL_OR_CONTRIBUTION");
  if (!/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(event.sourceRef) ||
      !/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(event.targetRef))
    throw Error("REWARD_SOURCE_INVALID");
  if (player.confirmedRewardRefs.includes(event.sourceRef) ||
      player.confirmedDefeats.includes(event.targetRef)) throw Error("REWARD_DUPLICATE");
  const c = event.monster;
  if (!(event.randomRuneRoll >= 0 && event.randomRuneRoll < 1)) throw Error("RUNE_ROLL_INVALID");
  requireSafeInt(c.systemGold, "SYSTEM_GOLD");
  const exp = xpForDefeat(c.baseXp, c.systemLevel, player.systemLevel);
  const result = nextSystemLevel(player, exp, event.resources);
  const n = result.player;
  n.gold += c.systemGold;
  if (!Number.isSafeInteger(n.gold)) throw Error("SYSTEM_GOLD_OVERFLOW");
  n.confirmedRewardRefs.push(event.sourceRef);
  n.confirmedDefeats.push(event.targetRef);
  let runeStone: string | undefined;
  if (c.runeId && c.runeChancePercent !== undefined) {
    const prob = c.runeChancePercent;
    if (!(prob >= 0 && prob <= 100)) throw Error("RUNE_PROBABILITY_INVALID");
    if (event.randomRuneRoll < prob / 100) {
      runeStone = c.runeId;
      n.runeStones[runeStone] = (n.runeStones[runeStone] ?? 0) + 1;
    }
  }
  return {player: n,
    system: { xp: exp, gold: c.systemGold, levelsGained: result.levelsGained, ...(runeStone ? {runeStone}: {}) },
    danmachi: {exceliaEventRequired: true,
      magicStoneRecoverable: c.magicStonePossible,
      potentialStoneValis: c.magicStonePossible ? c.dungeonStoneValis : null},
  };
}

/** Combat uses physical weak-point confirmation; no arbitrary boss immunity. */
export type TargetCondition = { maxHp: number; hp: number; armorPenetrated: boolean;
  physiology: "ordinary" | "large" | "stone_core";
  hasMagicStone?: boolean;
  poisonedLocations: string[];
  bleedingWounds: { damageFractionPerSecond: number; secondsRemaining: number }[];
  paralyzedLocations: { location: string; secondsRemaining: number }[];
};
export function confirmKasakaHit(target: TargetCondition, e: {
  hit: boolean;
  weakPoint: "none" | "brain" | "heart" | "magic_stone";
  physicalDamage: number;
  penetrated: boolean;
  bleedingSeconds: number;
  paralysisSeconds: number;
  hitLocation: string;
  poisonImmune?: boolean;
}): {target: TargetCondition; instantKill: boolean} {
  requireSafeInt(e.physicalDamage, "ATTACK_DAMAGE");
  requireSafeInt(e.bleedingSeconds, "BLEED_DURATION");
  requireSafeInt(e.paralysisSeconds, "PARALYSIS_DURATION");
  const n=copy(target);
  if(!e.hit || !e.penetrated || !n.armorPenetrated) return {target:n,instantKill:false};
  const fatal = (e.weakPoint === "magic_stone" && (n.hasMagicStone===true || n.physiology === "stone_core")) ||
   (e.weakPoint === "brain" && n.physiology !== "stone_core") ||
   (e.weakPoint === "heart" && n.physiology === "ordinary");
  n.hp = fatal ? 0 : Math.max(0,n.hp - e.physicalDamage);
  // A genuine penetrating blow can bleed even a boss; separately recorded wounds stack.
  if(n.hp > 0 && e.bleedingSeconds > 0)
    n.bleedingWounds.push({damageFractionPerSecond: .01,secondsRemaining:e.bleedingSeconds});
  if(n.hp > 0 && !e.poisonImmune && e.paralysisSeconds > 0) {
    const location = n.physiology === "ordinary" ? "whole_body" : e.hitLocation;
    n.paralyzedLocations.push({location,secondsRemaining:e.paralysisSeconds});
  }
  return {target:n,instantKill:fatal};
}
export function tickBleeding(target: TargetCondition, seconds=1): TargetCondition {
  requireSafeInt(seconds, "BLEED_TICK_SECONDS",1);
  const next=copy(target);
  for(let n=0;n<seconds;n++){
    if(next.hp===0) break;
    const active=next.bleedingWounds.filter(w=>w.secondsRemaining>0);
    const sum=active.reduce((acc,w)=>acc+w.damageFractionPerSecond,0);
    next.hp=Math.max(0, next.hp - next.maxHp*sum);
    next.bleedingWounds=active.map(w=>({...w,secondsRemaining:w.secondsRemaining-1}))
      .filter(w=>w.secondsRemaining>0);
    next.paralyzedLocations=next.paralyzedLocations.map(x=>({...x,secondsRemaining:x.secondsRemaining-1}))
      .filter(x=>x.secondsRemaining>0);
  }
  return next;
}

/** A single active title; different kinds of bonuses are handled by their own explicit contracts. */
export function chooseTitle(player:SystemPlayer,titleId:string):SystemPlayer{
  if(!player.titleIds.includes(titleId))throw Error("TITLE_NOT_OWNED");
  const next=copy(player);next.activeTitle=titleId;return next;
}

/** A confirmed exchange may contain a right-hand and a left-hand strike. */
export type VerifiedWeaponStrike = {
  hand: "left"|"right";
  weaponId: string;
  confirmedHit: boolean;
  penetrated: boolean;
  directDamage: number;
  weakPoint: "none"|"brain"|"heart"|"magic_stone";
  hitLocation: string;
  bleedSeconds: number;
  paralysisSeconds: number;
  appliesKasakaPoison: boolean;
};
export function resolveConfirmedDualWield(
  initial: TargetCondition,
  right: VerifiedWeaponStrike,
  left: VerifiedWeaponStrike,
): { target:TargetCondition; damagedBy: string[]; fatalStrike: string|null } {
  if (right.hand!=="right" || left.hand!=="left") throw Error("TWO_WEAPON_HANDS_INVALID");
  let target=copy(initial);
  const damagedBy:string[]=[];
  let fatalStrike:null|string=null;
  for(const s of [right,left]){
    requireSafeInt(s.directDamage,"STRIKE_DIRECT_DAMAGE");
    if(target.hp===0)break;
    if(!s.confirmedHit || !s.penetrated)continue;
    if(s.appliesKasakaPoison){
      const r=confirmKasakaHit(target,{
        hit:true, penetrated:true, physicalDamage:s.directDamage,
        weakPoint:s.weakPoint, hitLocation:s.hitLocation,
        bleedingSeconds:s.bleedSeconds,paralysisSeconds:s.paralysisSeconds,
      });
      target=r.target;
      if(r.instantKill) fatalStrike=s.hand;
    }else{
      const r=confirmKasakaHit(target,{
        hit:true, penetrated:true, physicalDamage:s.directDamage,
        weakPoint:s.weakPoint, hitLocation:s.hitLocation,
        bleedingSeconds:0,paralysisSeconds:0,
      });
      target=r.target;
      if(r.instantKill) fatalStrike=s.hand;
    }
    damagedBy.push(s.hand);
  }
  return {target,damagedBy,fatalStrike};
}
/**
 * Project-only damage mitigation candidate. Armor and END strengthen the body;
 * consumed Kasaka venom protects against physical damage by another 20%.
 * This is explicitly NOT a canon formula.
 */
export function previewIncomingPhysicalDamage(input: {
  rawDamage:number; effectiveEndurance:number;armorSoak:number;
  kasakaConsumedVenomMitigation:boolean;
}):number{
  requireSafeInt(input.rawDamage,'DAMAGE',0);
  requireSafeInt(input.effectiveEndurance,'ENDURANCE',0);
  requireSafeInt(input.armorSoak,'ARMOR_SOAK',0);
  const bodySoak=Math.floor(Math.sqrt(input.effectiveEndurance)*2);
  const afterSoak=Math.max(0,input.rawDamage-input.armorSoak-bodySoak);
  return Math.max(0,Math.round(afterSoak*(input.kasakaConsumedVenomMitigation?.8:1)));
}
/**
 * Multipliers on actual movement and reaction; do not award permanent agility points.
 * All behavior inputs are attested current skill effects rather than arbitrary caps.
 */
export function projectBurstMotion(input:{
  speedBase:number; perceptionBase:number;
  quicksilverMultiplier:number;reactionsMultiplier:number;
}):{physicalSpeed:number;perceivedReaction:number}{
  for(const v of Object.values(input))
    if(!Number.isFinite(v)||v<0)throw Error('BURST_MOTION_VALUE_INVALID');
  return {physicalSpeed:input.speedBase*input.quicksilverMultiplier,
   perceivedReaction:input.perceptionBase*input.reactionsMultiplier};
}

/** Rune drop is a physical System item. A skill is not learned until consumed. */
export function studyRuneStone(player:SystemPlayer,skillId:string):SystemPlayer{
  const q=copy(player);
  const owned=q.runeStones[skillId]??0;
  if(!Number.isSafeInteger(owned)||owned<1)throw Error('RUNE_STONE_NOT_OWNED');
  if(q.learnedSkills.includes(skillId))throw Error('RUNE_SKILL_ALREADY_LEARNED');
  q.runeStones[skillId]--;
  if(q.runeStones[skillId]===0)delete q.runeStones[skillId];
  q.learnedSkills.push(skillId);
  return q;
}
export type ActiveTitleEffect={
 titleId:string;
 bonusAgainst: string|null;
 combatStatMultiplier:number;
 temporaryTitleSkill:string|null;
};
/** Canon-inspired: exactly one equipped title's power applies. */
export function getActiveTitleEffect(player:SystemPlayer):ActiveTitleEffect|null{
 if(!player.activeTitle)return null;
 if(!player.titleIds.includes(player.activeTitle))throw Error('ACTIVE_TITLE_NOT_OWNED');
 const effects:Record<string,Omit<ActiveTitleEffect,'titleId'>>={
  wolf_slayer:{bonusAgainst:'beast',combatStatMultiplier:1.4,temporaryTitleSkill:null},
  nest_breaker:{bonusAgainst:'chitin_joints',combatStatMultiplier:1.3,temporaryTitleSkill:'hive_signal_detection'},
  unbroken:{bonusAgainst:null,combatStatMultiplier:1,temporaryTitleSkill:'tenacity_critical_hp'},
  silent_path:{bonusAgainst:null,combatStatMultiplier:1,temporaryTitleSkill:'silent_steps'},
  giant_feller:{bonusAgainst:'giant_weakpoints',combatStatMultiplier:1.35,temporaryTitleSkill:null},
  counterhunter:{bonusAgainst:null,combatStatMultiplier:1,temporaryTitleSkill:'ambush_warning'},
  shellbreaker:{bonusAgainst:'armor_joint',combatStatMultiplier:1.3,temporaryTitleSkill:null},
  dungeon_survivor:{bonusAgainst:null,combatStatMultiplier:1,temporaryTitleSkill:'combat_composure'},
  floor_breaker:{bonusAgainst:null,combatStatMultiplier:1,temporaryTitleSkill:null},
 };
 const e=effects[player.activeTitle];
 if(!e)throw Error('UNKNOWN_TITLE_EFFECT');
 return {titleId:player.activeTitle,...e};
}
