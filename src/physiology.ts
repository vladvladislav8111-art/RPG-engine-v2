import { intBetween } from "./rng.ts";

export type ActionIntensity = "CALM" | "ACTIVE" | "HEAVY";
export type ActionUnit = "per hour" | "per minute" | "per shot" | "per 10 sec" | "per throw" | "per exchange";

export type ActionProfile = {
  id: string;
  intensity: ActionIntensity;
  currentCost: number;
  unit: ActionUnit;
  ceilingCost: number;
  regenFactor: number;
  competenceId?: string;
  specialization?: string;
  skillReductionCap: number;
  ceilingSkillCap: number;
};

export const ACTION_PROFILES: Record<string, ActionProfile> = {
  "action.calm.read": { id:"action.calm.read", intensity:"CALM", currentCost:0, unit:"per hour", ceilingCost:0, regenFactor:0.50, competenceId:"competence.knowledge.research", specialization:"Records/systematization", skillReductionCap:0.20, ceilingSkillCap:0.10 },
  "action.calm.write": { id:"action.calm.write", intensity:"CALM", currentCost:0, unit:"per hour", ceilingCost:0, regenFactor:0.45, competenceId:"competence.knowledge.research", specialization:"Records/systematization", skillReductionCap:0.20, ceilingSkillCap:0.10 },
  "action.calm.talk": { id:"action.calm.talk", intensity:"CALM", currentCost:0, unit:"per hour", ceilingCost:0, regenFactor:0.50, competenceId:"competence.society.communication", skillReductionCap:0.10, ceilingSkillCap:0.05 },
  "action.calm.eat": { id:"action.calm.eat", intensity:"CALM", currentCost:0, unit:"per hour", ceilingCost:0, regenFactor:0.60, skillReductionCap:0, ceilingSkillCap:0 },
  "action.stand": { id:"action.stand", intensity:"CALM", currentCost:0.25, unit:"per hour", ceilingCost:0, regenFactor:0.25, competenceId:"competence.body.physical_conditioning", specialization:"Endurance use", skillReductionCap:0.15, ceilingSkillCap:0.05 },
  "action.work.light": { id:"action.work.light", intensity:"ACTIVE", currentCost:1.0, unit:"per hour", ceilingCost:0.10, regenFactor:0, competenceId:"competence.crafting.practical_creation", specialization:"Manual work", skillReductionCap:0.30, ceilingSkillCap:0.15 },
  "action.carry.moderate": { id:"action.carry.moderate", intensity:"ACTIVE", currentCost:2.5, unit:"per hour", ceilingCost:0.25, regenFactor:0, competenceId:"competence.body.physical_conditioning", specialization:"Movement", skillReductionCap:0.30, ceilingSkillCap:0.15 },
  "action.work.dig_chop": { id:"action.work.dig_chop", intensity:"HEAVY", currentCost:6.0, unit:"per hour", ceilingCost:0.80, regenFactor:0, competenceId:"competence.crafting.practical_creation", specialization:"Manual work", skillReductionCap:0.35, ceilingSkillCap:0.18 },
  "action.stairs": { id:"action.stairs", intensity:"ACTIVE", currentCost:0.12, unit:"per minute", ceilingCost:0.01, regenFactor:0, competenceId:"competence.body.physical_conditioning", specialization:"Movement", skillReductionCap:0.30, ceilingSkillCap:0.15 },
  "action.row.normal": { id:"action.row.normal", intensity:"ACTIVE", currentCost:0.25, unit:"per minute", ceilingCost:0.025, regenFactor:0, competenceId:"competence.body.physical_conditioning", specialization:"Endurance use", skillReductionCap:0.30, ceilingSkillCap:0.15 },
  "action.crawl": { id:"action.crawl", intensity:"ACTIVE", currentCost:0.35, unit:"per minute", ceilingCost:0.03, regenFactor:0, competenceId:"competence.body.physical_conditioning", specialization:"Coordination", skillReductionCap:0.30, ceilingSkillCap:0.15 },
  "action.jump": { id:"action.jump", intensity:"ACTIVE", currentCost:0.35, unit:"per exchange", ceilingCost:0.01, regenFactor:0, competenceId:"competence.body.physical_conditioning", specialization:"Coordination", skillReductionCap:0.30, ceilingSkillCap:0.15 },
  "action.combat.dodge": { id:"action.combat.dodge", intensity:"HEAVY", currentCost:0.45, unit:"per exchange", ceilingCost:0.015, regenFactor:0, competenceId:"competence.body.physical_conditioning", specialization:"Coordination", skillReductionCap:0.30, ceilingSkillCap:0.15 },
  "action.combat.parry": { id:"action.combat.parry", intensity:"ACTIVE", currentCost:0.25, unit:"per exchange", ceilingCost:0.005, regenFactor:0, competenceId:"competence.combat.melee", skillReductionCap:0.30, ceilingSkillCap:0.15 },
  "action.combat.heavy_swing": { id:"action.combat.heavy_swing", intensity:"HEAVY", currentCost:0.40, unit:"per exchange", ceilingCost:0.01, regenFactor:0, competenceId:"competence.combat.melee", skillReductionCap:0.30, ceilingSkillCap:0.15 },
  "action.walk.normal": { id:"action.walk.normal", intensity:"ACTIVE", currentCost:1.5, unit:"per hour", ceilingCost:0.10, regenFactor:0, competenceId:"competence.body.physical_conditioning", specialization:"Movement", skillReductionCap:0.30, ceilingSkillCap:0.15 },
  "action.walk.loaded": { id:"action.walk.loaded", intensity:"ACTIVE", currentCost:3.0, unit:"per hour", ceilingCost:0.35, regenFactor:0, competenceId:"competence.body.physical_conditioning", specialization:"Movement", skillReductionCap:0.30, ceilingSkillCap:0.15 },
  "action.work.heavy": { id:"action.work.heavy", intensity:"HEAVY", currentCost:7.5, unit:"per hour", ceilingCost:1.0, regenFactor:0, competenceId:"competence.crafting.practical_creation", specialization:"Manual work", skillReductionCap:0.35, ceilingSkillCap:0.18 },
  "action.work.very_heavy": { id:"action.work.very_heavy", intensity:"HEAVY", currentCost:12.0, unit:"per hour", ceilingCost:2.0, regenFactor:0, competenceId:"competence.body.physical_conditioning", specialization:"Endurance use", skillReductionCap:0.35, ceilingSkillCap:0.18 },
  "action.run.jog": { id:"action.run.jog", intensity:"ACTIVE", currentCost:0.40, unit:"per minute", ceilingCost:0.03, regenFactor:0, competenceId:"competence.body.physical_conditioning", specialization:"Movement", skillReductionCap:0.35, ceilingSkillCap:0.18 },
  "action.run.fast": { id:"action.run.fast", intensity:"HEAVY", currentCost:0.80, unit:"per minute", ceilingCost:0.06, regenFactor:0, competenceId:"competence.body.physical_conditioning", specialization:"Movement", skillReductionCap:0.35, ceilingSkillCap:0.18 },
  "action.run.sprint": { id:"action.run.sprint", intensity:"HEAVY", currentCost:1.50, unit:"per minute", ceilingCost:0.15, regenFactor:0, competenceId:"competence.body.physical_conditioning", specialization:"Movement", skillReductionCap:0.35, ceilingSkillCap:0.18 },
  "action.climb.active": { id:"action.climb.active", intensity:"HEAVY", currentCost:0.50, unit:"per minute", ceilingCost:0.05, regenFactor:0, competenceId:"competence.body.physical_conditioning", specialization:"Coordination", skillReductionCap:0.30, ceilingSkillCap:0.15 },
  "action.swim.normal": { id:"action.swim.normal", intensity:"ACTIVE", currentCost:0.30, unit:"per minute", ceilingCost:0.035, regenFactor:0, competenceId:"competence.body.physical_conditioning", specialization:"Endurance use", skillReductionCap:0.30, ceilingSkillCap:0.15 },
  "action.bow.shot": { id:"action.bow.shot", intensity:"ACTIVE", currentCost:0.35, unit:"per shot", ceilingCost:0.005, regenFactor:0, competenceId:"competence.combat.melee", specialization:"Bow", skillReductionCap:0.35, ceilingSkillCap:0.18 },
  "action.bow.hold10": { id:"action.bow.hold10", intensity:"HEAVY", currentCost:0.15, unit:"per 10 sec", ceilingCost:0.005, regenFactor:0, competenceId:"competence.combat.melee", specialization:"Bow", skillReductionCap:0.35, ceilingSkillCap:0.18 },
  "action.spear.throw": { id:"action.spear.throw", intensity:"ACTIVE", currentCost:0.50, unit:"per throw", ceilingCost:0.02, regenFactor:0, competenceId:"competence.combat.melee", specialization:"Thrown weapon", skillReductionCap:0.30, ceilingSkillCap:0.15 },
  "action.melee.exchange": { id:"action.melee.exchange", intensity:"HEAVY", currentCost:1.00, unit:"per exchange", ceilingCost:0.04, regenFactor:0, competenceId:"competence.combat.melee", skillReductionCap:0.30, ceilingSkillCap:0.15 },
};

export type ExertionInput = {
  actionId: string;
  durationMinutes?: number;
  count?: number;
  current: number;
  ceiling: number;
  baseMax: number;
  endurance: number;
  competenceLevel?: number;
  specializationStars?: number;
  loadMultiplier?: number;
  environmentMultiplier?: number;
  conditionMultiplier?: number;
  recoveryMultiplier?: number;
  explicitEfficiencyMultiplier?: number;
  explicitCeilingMultiplier?: number;
};

export type ExertionResult = {
  actionId: string;
  quantity: number;
  currentCost: number;
  ceilingLoss: number;
  passiveRegen: number;
  oldCurrent: number;
  oldCeiling: number;
  newCurrent: number;
  newCeiling: number;
  overexertionDeficit: number;
  multipliers: Record<string, number>;
};

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function deriveStaminaBaseMax(level: number, endurance: number): number {
  return 26 + 4 * endurance + 2 * Math.max(0, level - 1);
}

export function staminaRegenPerMinute(endurance: number, regenFactor = 1, recoveryMultiplier = 1): number {
  return Math.max(0, 0.1 * endurance * regenFactor * recoveryMultiplier);
}

export function staminaEnduranceMultiplier(endurance: number): number {
  return clamp(10 / (endurance + 3), 0.55, 1.50);
}

export function staminaCeilingEnduranceMultiplier(endurance: number): number {
  return clamp(Math.sqrt(staminaEnduranceMultiplier(endurance)), 0.70, 1.30);
}

export function staminaSkillMultiplier(level: number, stars: number, cap: number): number {
  const reduction = Math.min(cap, Math.max(0, 0.015 * level + 0.0125 * stars));
  return 1 - reduction;
}

export function staminaCeilingSkillMultiplier(level: number, stars: number, cap: number): number {
  const reduction = Math.min(cap, Math.max(0, 0.0075 * level + 0.00625 * stars));
  return 1 - reduction;
}

function quantityFor(profile: ActionProfile, durationMinutes?: number, count?: number): number {
  switch (profile.unit) {
    case "per hour": return Math.max(0, durationMinutes ?? 0) / 60;
    case "per minute": return Math.max(0, durationMinutes ?? 0);
    case "per 10 sec": return Math.max(0, durationMinutes ?? 0) * 6;
    case "per shot":
    case "per throw":
    case "per exchange":
      return Math.max(0, count ?? 0);
  }
}

export function resolveExertion(input: ExertionInput): ExertionResult {
  const profile = ACTION_PROFILES[input.actionId];
  if (!profile) throw new Error(`unknown stamina action profile: ${input.actionId}`);
  const quantity = quantityFor(profile, input.durationMinutes, input.count);
  if (!(quantity > 0) && !(profile.currentCost === 0 && (input.durationMinutes ?? 0) > 0)) {
    throw new Error(`action ${input.actionId} requires positive duration/count`);
  }

  const enduranceMult = staminaEnduranceMultiplier(input.endurance);
  const ceilingEnduranceMult = staminaCeilingEnduranceMultiplier(input.endurance);
  const skillMult = staminaSkillMultiplier(input.competenceLevel ?? 0, input.specializationStars ?? 0, profile.skillReductionCap);
  const ceilingSkillMult = staminaCeilingSkillMultiplier(input.competenceLevel ?? 0, input.specializationStars ?? 0, profile.ceilingSkillCap);
  const load = Math.max(0, input.loadMultiplier ?? 1);
  const environment = Math.max(0, input.environmentMultiplier ?? 1);
  const condition = Math.max(0, input.conditionMultiplier ?? 1);
  const explicit = Math.max(0, input.explicitEfficiencyMultiplier ?? 1);
  const explicitCeiling = Math.max(0, input.explicitCeilingMultiplier ?? 1);

  const currentCost = profile.currentCost * quantity * load * environment * condition * enduranceMult * skillMult * explicit;
  const ceilingLoss = profile.ceilingCost * quantity * load * environment * condition * ceilingEnduranceMult * ceilingSkillMult * explicitCeiling;
  const duration = Math.max(0, input.durationMinutes ?? 0);
  const passiveRegen = staminaRegenPerMinute(input.endurance, profile.regenFactor, input.recoveryMultiplier ?? 1) * duration;

  const oldCeiling = clamp(input.ceiling, 0, input.baseMax);
  const newCeiling = clamp(oldCeiling - ceilingLoss, 0, input.baseMax);
  const rawCurrent = input.current - currentCost + passiveRegen;
  const overexertionDeficit = Math.max(0, -rawCurrent);
  const newCurrent = clamp(rawCurrent, 0, newCeiling);

  return {
    actionId: input.actionId,
    quantity: round2(quantity),
    currentCost: round2(currentCost),
    ceilingLoss: round2(ceilingLoss),
    passiveRegen: round2(passiveRegen),
    oldCurrent: round2(input.current),
    oldCeiling: round2(oldCeiling),
    newCurrent: round2(newCurrent),
    newCeiling: round2(newCeiling),
    overexertionDeficit: round2(overexertionDeficit),
    multipliers: {
      endurance: round2(enduranceMult),
      ceilingEndurance: round2(ceilingEnduranceMult),
      skill: round2(skillMult),
      ceilingSkill: round2(ceilingSkillMult),
      load: round2(load),
      environment: round2(environment),
      condition: round2(condition),
      explicit: round2(explicit),
      explicitCeiling: round2(explicitCeiling),
    },
  };
}

export type RestId = "rest.break" | "rest.short" | "rest.full";
export type RestInput = {
  restId: RestId;
  durationMinutes: number;
  current: number;
  ceiling: number;
  baseMax: number;
  endurance: number;
  recoveryMultiplier?: number;
  usefulSleep?: boolean;
};

export function resolveRest(input: RestInput) {
  const duration = Math.max(0, input.durationMinutes);
  const recoveryMultiplier = clamp(input.recoveryMultiplier ?? 1, 0, 1.5);
  const oldCeiling = clamp(input.ceiling, 0, input.baseMax);
  const oldCurrent = clamp(input.current, 0, oldCeiling);
  if (input.restId === "rest.break" && duration < 5) throw new Error("ordinary break requires at least 5 minutes");
  if (input.restId === "rest.short" && duration < 20) throw new Error("short rest requires at least 20 minutes");
  if (input.restId === "rest.full" && (duration < 450 || input.usefulSleep !== true)) {
    throw new Error("full recovery requires at least 450 minutes of useful sleep");
  }

  let newCeiling = oldCeiling;
  if (input.restId === "rest.short") {
    newCeiling = oldCeiling + (input.baseMax - oldCeiling) * 0.5 * clamp(recoveryMultiplier, 0, 1);
  } else if (input.restId === "rest.full") {
    newCeiling = oldCeiling + (input.baseMax - oldCeiling) * clamp(recoveryMultiplier, 0, 1);
  }
  newCeiling = clamp(newCeiling, 0, input.baseMax);

  let newCurrent: number;
  let recoveredCurrent: number;
  if (input.restId === "rest.full" && recoveryMultiplier >= 1) {
    newCurrent = newCeiling;
    recoveredCurrent = newCurrent - oldCurrent;
  } else {
    const regen = staminaRegenPerMinute(input.endurance, 1, recoveryMultiplier) * duration;
    newCurrent = clamp(oldCurrent + regen, 0, newCeiling);
    recoveredCurrent = newCurrent - oldCurrent;
  }

  return {
    restId: input.restId,
    durationMinutes: duration,
    oldCurrent: round2(oldCurrent),
    oldCeiling: round2(oldCeiling),
    newCurrent: round2(newCurrent),
    newCeiling: round2(newCeiling),
    recoveredCurrent: round2(recoveredCurrent),
    recoveredCeiling: round2(newCeiling - oldCeiling),
  };
}

export type InjurySeverity = "SUPERFICIAL" | "LIGHT" | "SERIOUS" | "SEVERE" | "CRITICAL";
export type HitLocation =
  | "head_face" | "neck" | "torso_chest" | "torso_abdomen"
  | "arm" | "hand" | "leg" | "foot";
export type WeaponForce = "light" | "solid" | "heavy" | "extreme";
export type HitQuality = "glancing" | "ordinary" | "direct" | "exceptional";
export type ToxinClass = "weak" | "medium" | "strong" | "extreme";

const HP_BANDS: Record<InjurySeverity, [number, number]> = {
  SUPERFICIAL: [1, 4],
  LIGHT: [3, 8],
  SERIOUS: [7, 16],
  SEVERE: [15, 30],
  CRITICAL: [25, 45],
};
const STRUCTURE_BONUS: Record<InjurySeverity, number> = {
  SUPERFICIAL: 0, LIGHT: 0, SERIOUS: 10, SEVERE: 25, CRITICAL: 45,
};
const LOCATION: Record<HitLocation, { score: number; criticalBase: number; bleeding: number }> = {
  head_face: { score:1, criticalBase:30, bleeding:1.10 },
  neck: { score:2, criticalBase:45, bleeding:1.25 },
  torso_chest: { score:1, criticalBase:30, bleeding:1.15 },
  torso_abdomen: { score:1, criticalBase:25, bleeding:1.10 },
  arm: { score:0, criticalBase:5, bleeding:1.00 },
  hand: { score:0, criticalBase:3, bleeding:0.90 },
  leg: { score:0, criticalBase:8, bleeding:1.05 },
  foot: { score:-1, criticalBase:2, bleeding:0.90 },
};
const FORCE: Record<WeaponForce, number> = { light:1, solid:2, heavy:3, extreme:4 };
const QUALITY: Record<HitQuality, number> = { glancing:-1, ordinary:0, direct:2, exceptional:3 };
const TOXIN: Record<ToxinClass, { potency: number; cap: string }> = {
  weak: { potency:35, cap:"MODERATE" },
  medium: { potency:55, cap:"SERIOUS" },
  strong: { potency:75, cap:"SEVERE" },
  extreme: { potency:95, cap:"CRITICAL" },
};
const DELIVERY_BY_SEVERITY: Record<InjurySeverity, number> = {
  SUPERFICIAL:-15, LIGHT:-5, SERIOUS:10, SEVERE:20, CRITICAL:25,
};

function severityFrom(score: number, roll: number): InjurySeverity {
  if (score <= 0) return roll <= 80 ? "SUPERFICIAL" : "LIGHT";
  if (score === 1) return roll <= 50 ? "SUPERFICIAL" : "LIGHT";
  if (score === 2) return roll <= 70 ? "LIGHT" : "SERIOUS";
  if (score === 3) return roll <= 35 ? "LIGHT" : "SERIOUS";
  if (score === 4) return roll <= 70 ? "SERIOUS" : "SEVERE";
  if (score === 5) return roll <= 40 ? "SERIOUS" : roll <= 95 ? "SEVERE" : "CRITICAL";
  if (score === 6) return roll <= 25 ? "SERIOUS" : roll <= 75 ? "SEVERE" : "CRITICAL";
  if (score === 7) return roll <= 55 ? "SEVERE" : "CRITICAL";
  return roll <= 25 ? "SEVERE" : "CRITICAL";
}

function structureFor(location: HitLocation, roll: number): string {
  if (location === "torso_abdomen") {
    if (roll <= 40) return "hollow_viscus";
    if (roll <= 75) return "solid_organ";
    if (roll <= 90) return "kidney_or_retroperitoneal_structure";
    return "major_vessel";
  }
  if (location === "torso_chest") {
    if (roll <= 45) return "lung";
    if (roll <= 65) return "major_vessel";
    if (roll <= 80) return "heart";
    return "rib_intercostal_deep_structure";
  }
  if (location === "neck") {
    if (roll <= 40) return "major_vessel";
    if (roll <= 65) return "airway";
    if (roll <= 85) return "spinal_or_major_nerve_structure";
    return "deep_neck_structure";
  }
  if (location === "head_face") {
    if (roll <= 60) return "brain_or_intracranial_structure";
    if (roll <= 80) return "eye_or_orbit";
    return "airway_jaw_deep_face_structure";
  }
  if (location === "arm" || location === "leg") {
    if (roll <= 35) return "major_vessel";
    if (roll <= 65) return "bone";
    if (roll <= 85) return "major_nerve";
    return "joint_or_tendon";
  }
  return roll <= 45 ? "joint_or_tendon" : roll <= 75 ? "bone" : "major_nerve_or_vessel";
}

function toxinEffectGrade(toxinClass: ToxinClass, chance: number, roll: number): string {
  if (roll > chance || chance <= 0) return "NONE";
  const strongActivation = roll <= Math.max(1, Math.floor(chance * 0.25));
  if (toxinClass === "weak") return strongActivation ? "MODERATE" : "MILD";
  if (toxinClass === "medium") return strongActivation ? "SERIOUS" : "MODERATE";
  if (toxinClass === "strong") return strongActivation ? "SEVERE" : "SERIOUS";
  return strongActivation ? "CRITICAL" : "SEVERE";
}

export type InjurySimulationInput = {
  seed: string;
  weaponForce: WeaponForce;
  hitQuality: HitQuality;
  location: HitLocation;
  armorMitigation?: number;
  endurance: number;
  tags?: string[];
  toxin?: {
    class: ToxinClass;
    doseModifier?: number;
    deliveryModifier?: number;
    specificImmunity?: number;
    protection?: number;
  };
};

export function resolveInjurySimulation(input: InjurySimulationInput) {
  const armor = Math.max(0, input.armorMitigation ?? 0);
  const traumaScore = Math.round(FORCE[input.weaponForce] + QUALITY[input.hitQuality] + LOCATION[input.location].score - armor);
  const severityRoll = intBetween(`${input.seed}|severity`, 1, 100);
  const severity = severityFrom(traumaScore, severityRoll);
  const [hpMin, hpMax] = HP_BANDS[severity];
  const hpLoss = intBetween(`${input.seed}|hp`, hpMin, hpMax);

  const criticalStructureChance = clamp(LOCATION[input.location].criticalBase + STRUCTURE_BONUS[severity], 0, 95);
  const criticalStructureRoll = intBetween(`${input.seed}|structure`, 1, 100);
  const criticalStructureHit = criticalStructureRoll <= criticalStructureChance;
  const structureRoll = intBetween(`${input.seed}|structure-type`, 1, 100);
  const criticalStructure = criticalStructureHit ? structureFor(input.location, structureRoll) : null;

  let toxinResult: unknown = null;
  if (input.toxin) {
    const profile = TOXIN[input.toxin.class];
    const resistance = clamp(3 * (input.endurance - 5), -15, 30);
    const delivery = DELIVERY_BY_SEVERITY[severity] + (input.toxin.deliveryModifier ?? 0);
    const chance = clamp(
      profile.potency + delivery + (input.toxin.doseModifier ?? 0) - resistance -
      (input.toxin.specificImmunity ?? 0) - (input.toxin.protection ?? 0),
      0,
      100,
    );
    const roll = intBetween(`${input.seed}|toxin`, 1, 100);
    toxinResult = {
      class: input.toxin.class,
      basePotency: profile.potency,
      deliveryModifier: delivery,
      enduranceResistance: resistance,
      specificImmunity: input.toxin.specificImmunity ?? 0,
      protection: input.toxin.protection ?? 0,
      chance,
      roll,
      activated: roll <= chance,
      effectGrade: toxinEffectGrade(input.toxin.class, chance, roll),
      effectCap: profile.cap,
      symptoms: "UNDEFINED_FOR_GENERIC_TOXIN",
    };
  }

  const bleeding = severity === "SUPERFICIAL" ? "none/minor"
    : severity === "LIGHT" ? "minor"
    : severity === "SERIOUS" ? "moderate"
    : severity === "SEVERE" ? "serious"
    : "dangerous";

  return {
    seed: input.seed,
    traumaScore,
    severityRoll,
    severity,
    hpRange: [hpMin, hpMax],
    hpLoss,
    location: input.location,
    bleeding,
    bleedingLocationMultiplier: LOCATION[input.location].bleeding,
    criticalStructureChance,
    criticalStructureRoll,
    criticalStructureHit,
    criticalStructure,
    urgent: severity === "SEVERE" || severity === "CRITICAL" || criticalStructureHit,
    tags: input.tags ?? [],
    toxin: toxinResult,
  };
}
