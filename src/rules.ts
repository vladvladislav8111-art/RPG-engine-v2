export const RULESET_VERSION = "2.2-fastpath-2026-10-05";

export type LearningBand = "tiny" | "useful" | "substantial" | "breakthrough" | "exceptional";

const COMPETENCE_THRESHOLDS: Record<number, number> = {
  1: 300, 2: 600, 3: 1200, 4: 2000, 5: 3200, 6: 4800,
  7: 6800, 8: 9200, 9: 12000, 10: 15400, 11: 19400, 12: 24000,
};

const BAND: Record<LearningBand, { base: number; min: number; max: number }> = {
  tiny: { base: 3, min: 1, max: 5 },
  useful: { base: 10, min: 5, max: 20 },
  substantial: { base: 40, min: 20, max: 80 },
  breakthrough: { base: 150, min: 80, max: 300 },
  exceptional: { base: 360, min: 300, max: 5000 },
};

const STAR_THRESHOLDS: Record<number, number> = {
  0: 20, 1: 35, 2: 55, 3: 80, 4: 115,
  5: 160, 6: 220, 7: 300, 8: 400, 9: 520,
};

const STAR_QUALITY: Record<string, number> = {
  trace: 1,
  useful: 3,
  substantial: 7,
  expert: 12,
  breakthrough: 20,
};

export const MILESTONE_LEVELS = new Set([1, 3, 5, 7, 9, 11, 13]);

export function competenceThreshold(level: number): number | null {
  return COMPETENCE_THRESHOLDS[level] ?? null;
}

export function generalXpThreshold(level: number): number {
  return 10 * level * (level + 9);
}

export type LearningModifiers = {
  novelty?: number;
  feedback?: number;
  difficulty?: number;
  repetition?: number;
  fatigue?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function computeCompetenceAward(input: {
  band: LearningBand;
  productiveMinutes: number;
  modifiers?: LearningModifiers;
  exactOverride?: number;
}): number {
  const spec = BAND[input.band];
  if (input.exactOverride != null) {
    if (!Number.isFinite(input.exactOverride) || input.exactOverride < 0) {
      throw new Error("exactOverride must be a finite non-negative number");
    }
    return Math.round(input.exactOverride);
  }

  const minutes = clamp(input.productiveMinutes, 5, 240);
  const timeFactor = Math.sqrt(minutes / 60);
  const m = input.modifiers ?? {};
  const multiplier =
    (m.novelty ?? 1) *
    (m.feedback ?? 1) *
    (m.difficulty ?? 1) *
    (m.repetition ?? 1) *
    (m.fatigue ?? 1);

  const raw = spec.base * timeFactor * multiplier;
  return Math.round(clamp(raw, spec.min, spec.max));
}

export function nextStarThreshold(stars: number): number | null {
  return STAR_THRESHOLDS[stars] ?? null;
}

export function computeSpecializationProgress(input: {
  quality?: "trace" | "useful" | "substantial" | "expert" | "breakthrough";
  productiveMinutes: number;
  repetition?: number;
  exactOverride?: number;
}): number {
  if (input.exactOverride != null) {
    if (!Number.isFinite(input.exactOverride) || input.exactOverride < 0) {
      throw new Error("specialization exactOverride must be a finite non-negative number");
    }
    return Math.round(input.exactOverride);
  }
  const quality = input.quality ?? "useful";
  const base = STAR_QUALITY[quality] ?? STAR_QUALITY.useful;
  const minutes = clamp(input.productiveMinutes, 5, 240);
  const repetition = input.repetition ?? 1;
  return Math.max(0, Math.round(base * Math.sqrt(minutes / 30) * repetition));
}

export function advanceCompetence(level: number, carriedXp: number, delta: number) {
  let nextLevel = level;
  let xp = carriedXp + delta;
  const crossed: number[] = [];

  while (nextLevel < 13) {
    const threshold = competenceThreshold(nextLevel);
    if (threshold == null || xp < threshold) break;
    xp -= threshold;
    nextLevel += 1;
    crossed.push(nextLevel);
  }

  return {
    oldLevel: level,
    newLevel: nextLevel,
    oldXp: carriedXp,
    newXp: xp,
    delta,
    nextThreshold: competenceThreshold(nextLevel),
    crossedLevels: crossed,
    milestoneLevels: crossed.filter((l) => MILESTONE_LEVELS.has(l)),
  };
}

export function advanceClock(day: number, hhmmss: string, seconds: number) {
  const m = hhmmss.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) throw new Error(`Invalid world time: ${hhmmss}`);
  const base = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  let total = base + Math.round(seconds);
  let nextDay = day;
  while (total >= 86400) { total -= 86400; nextDay += 1; }
  while (total < 0) { total += 86400; nextDay -= 1; }
  const h = Math.floor(total / 3600);
  const min = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = (v: number) => String(v).padStart(2, "0");
  return { day: nextDay, time: `${pad(h)}:${pad(min)}:${pad(sec)}` };
}
