export type SurvivalActivity = "sleep" | "rest" | "normal" | "travel" | "work" | "heavy";

export type SurvivalSegment = {
  durationMinutes: number;
  activity: SurvivalActivity;
  satietyMultiplier?: number;
  hydrationMultiplier?: number;
};

export type FoodIntake = {
  foodId: keyof typeof FOOD_PROFILES;
  count?: number;
  satietyOverride?: number;
  hydrationOverride?: number;
};

export const FOOD_PROFILES = {
  "food.bread_loaf": { satiety: 25, hydration: 0 },
  "food.light_snack": { satiety: 12, hydration: 0 },
  "food.ordinary_meal": { satiety: 55, hydration: 5 },
  "food.substantial_meal": { satiety: 70, hydration: 8 },
  "food.field_ration": { satiety: 40, hydration: 0 },
  "food.fruit_portion": { satiety: 15, hydration: 6 },
} as const;

export const SURVIVAL_DRAIN_PER_HOUR: Record<
  SurvivalActivity,
  { satiety: number; hydration: number }
> = {
  sleep: { satiety: 2.5, hydration: 2.0 },
  rest: { satiety: 3.0, hydration: 3.0 },
  normal: { satiety: 4.0, hydration: 4.0 },
  travel: { satiety: 4.5, hydration: 5.0 },
  work: { satiety: 5.0, hydration: 5.5 },
  heavy: { satiety: 6.0, hydration: 7.0 },
};

export const HYDRATION_PER_LITER = 40;

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function oneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

export function survivalBand(value: number): "full" | "good" | "mild" | "low" | "severe" | "critical" {
  if (value >= 90) return "full";
  if (value >= 70) return "good";
  if (value >= 50) return "mild";
  if (value >= 25) return "low";
  if (value >= 10) return "severe";
  return "critical";
}

export function computeSurvivalChange(input: {
  satiety: number;
  hydration: number;
  elapsedSeconds?: number;
  segments?: SurvivalSegment[];
  defaultActivity?: SurvivalActivity;
  foodIntakes?: FoodIntake[];
  waterLiters?: number;
  heatMultiplier?: number;
}) {
  const elapsedMinutes = Math.max(0, Number(input.elapsedSeconds ?? 0) / 60);
  const segments = input.segments?.length
    ? input.segments
    : elapsedMinutes > 0
    ? [{ durationMinutes: elapsedMinutes, activity: input.defaultActivity ?? "normal" as SurvivalActivity }]
    : [];

  const segmentMinutes = segments.reduce((sum, s) => sum + Math.max(0, s.durationMinutes), 0);
  if (input.segments?.length && Math.abs(segmentMinutes - elapsedMinutes) > 0.11) {
    throw new Error(
      `survival segment duration mismatch: segments=${segmentMinutes}m elapsed=${elapsedMinutes}m`,
    );
  }

  const heat = Math.max(0, input.heatMultiplier ?? 1);
  let satietyDrain = 0;
  let hydrationDrain = 0;
  for (const segment of segments) {
    const profile = SURVIVAL_DRAIN_PER_HOUR[segment.activity];
    if (!profile) throw new Error(`unknown survival activity: ${segment.activity}`);
    const hours = Math.max(0, segment.durationMinutes) / 60;
    satietyDrain += profile.satiety * hours * Math.max(0, segment.satietyMultiplier ?? 1);
    hydrationDrain +=
      profile.hydration * hours * Math.max(0, segment.hydrationMultiplier ?? 1) * heat;
  }

  let satietyGain = 0;
  let hydrationGain = Math.max(0, input.waterLiters ?? 0) * HYDRATION_PER_LITER;
  const intakeOutcomes: Array<{
    foodId: string;
    count: number;
    satiety: number;
    hydration: number;
  }> = [];

  for (const intake of input.foodIntakes ?? []) {
    const profile = FOOD_PROFILES[intake.foodId];
    if (!profile) throw new Error(`unknown food profile: ${intake.foodId}`);
    const count = Math.max(0, intake.count ?? 1);
    const satiety = Math.max(0, intake.satietyOverride ?? profile.satiety) * count;
    const hydration = Math.max(0, intake.hydrationOverride ?? profile.hydration) * count;
    satietyGain += satiety;
    hydrationGain += hydration;
    intakeOutcomes.push({ foodId: intake.foodId, count, satiety, hydration });
  }

  const oldSatiety = clamp(input.satiety);
  const oldHydration = clamp(input.hydration);
  const newSatiety = oneDecimal(clamp(oldSatiety - satietyDrain + satietyGain));
  const newHydration = oneDecimal(clamp(oldHydration - hydrationDrain + hydrationGain));

  return {
    oldSatiety,
    oldHydration,
    satietyDrain: oneDecimal(satietyDrain),
    hydrationDrain: oneDecimal(hydrationDrain),
    satietyGain: oneDecimal(satietyGain),
    hydrationGain: oneDecimal(hydrationGain),
    newSatiety,
    newHydration,
    satietyBand: survivalBand(newSatiety),
    hydrationBand: survivalBand(newHydration),
    waterLiters: Math.max(0, input.waterLiters ?? 0),
    foodIntakes: intakeOutcomes,
  };
}
