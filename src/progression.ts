export type LearningBand = "tiny" | "useful" | "substantial" | "breakthrough" | "exceptional";
export type SpecializationQuality = "trace" | "useful" | "substantial" | "expert" | "breakthrough";

export type LearningModifiers = {
  novelty?: number;
  feedback?: number;
  difficulty?: number;
  repetition?: number;
  fatigue?: number;
};

export type ParsedProgressionRules = {
  competenceThresholds: Map<number, number>;
  bands: Record<LearningBand, { min: number; max: number | null; base: number }>;
  milestoneLevels: number[];
  specializationThresholds: Record<number, number>;
};

const DEFAULTS: ParsedProgressionRules = {
  competenceThresholds: new Map([
    [1, 300], [2, 600], [3, 1200], [4, 2000], [5, 3200], [6, 4800],
    [7, 6800], [8, 9200], [9, 12000], [10, 15400], [11, 19400], [12, 24000],
  ]),
  bands: {
    tiny: { min: 1, max: 5, base: 3 },
    useful: { min: 5, max: 20, base: 10 },
    substantial: { min: 20, max: 80, base: 40 },
    breakthrough: { min: 80, max: 300, base: 150 },
    exceptional: { min: 300, max: null, base: 360 },
  },
  milestoneLevels: [1, 3, 5, 7, 9, 11, 13],
  specializationThresholds: {
    0: 20, 1: 35, 2: 55, 3: 80, 4: 115, 5: 160, 6: 220, 7: 300, 8: 400, 9: 520,
  },
};

function n(value: unknown): number | null {
  const x = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(x) ? x : null;
}

export function parseProgressionRules(rows: unknown[][]): ParsedProgressionRules {
  const out: ParsedProgressionRules = {
    competenceThresholds: new Map(DEFAULTS.competenceThresholds),
    bands: structuredClone(DEFAULTS.bands),
    milestoneLevels: [...DEFAULTS.milestoneLevels],
    specializationThresholds: { ...DEFAULTS.specializationThresholds },
  };
  if (!rows.length) return out;
  const h = rows[0].map((x) => String(x ?? ""));
  const ix = (name: string) => h.indexOf(name);
  for (const row of rows.slice(1)) {
    const id = String(row[ix("Rule ID")] ?? "");
    const value = String(row[ix("Value")] ?? "");
    const logic = String(row[ix("Formula/logic")] ?? "");
    const mThreshold = id.match(/^xp\.competence\.threshold\.(\d+)$/);
    if (mThreshold) {
      const v = n(value);
      if (v != null) out.competenceThresholds.set(Number(mThreshold[1]), v);
      continue;
    }
    const mBand = id.match(/^xp\.competence\.band\.(tiny|useful|substantial|breakthrough|exceptional)$/);
    if (mBand) {
      const band = mBand[1] as LearningBand;
      const nums = value.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
      const base = Number(logic.match(/base\s+(\d+(?:\.\d+)?)/i)?.[1] ?? out.bands[band].base);
      out.bands[band] = {
        min: nums[0] ?? out.bands[band].min,
        max: value.includes("+") ? null : (nums[1] ?? nums[0] ?? out.bands[band].max),
        base,
      };
      continue;
    }
    if (id === "milestone.levels") {
      const levels = value.split(",").map((x) => Number(x.trim())).filter(Number.isFinite);
      if (levels.length) out.milestoneLevels = levels;
      continue;
    }
    if (id === "specialization.progress") {
      const block = logic.match(/thresholds to next star \{([^}]+)\}/i)?.[1];
      if (block) {
        for (const pair of block.split(",")) {
          const [k, v] = pair.split(":").map((x) => Number(x.trim()));
          if (Number.isFinite(k) && Number.isFinite(v)) out.specializationThresholds[k] = v;
        }
      }
    }
  }
  return out;
}

export function competenceThreshold(level: number, rules: ParsedProgressionRules): number {
  const exact = rules.competenceThresholds.get(level);
  if (exact != null) return exact;
  const last = [...rules.competenceThresholds.entries()].sort((a, b) => a[0] - b[0]).at(-1);
  if (!last) return 300;
  const [lastLevel, lastValue] = last;
  const d = Math.max(0, level - lastLevel);
  return Math.round(lastValue + d * (lastValue * 0.22 + 500));
}

export function computeLearningXp(
  band: LearningBand,
  productiveMinutes: number,
  modifiers: LearningModifiers,
  rules: ParsedProgressionRules,
): number {
  const cfg = rules.bands[band];
  const minutes = Math.max(5, Math.min(240, productiveMinutes || 5));
  const factor =
    Math.sqrt(minutes / 60) *
    (modifiers.novelty ?? 1) *
    (modifiers.feedback ?? 1) *
    (modifiers.difficulty ?? 1) *
    (modifiers.repetition ?? 1) *
    (modifiers.fatigue ?? 1);
  let value = Math.round(cfg.base * factor);
  value = Math.max(cfg.min, value);
  if (cfg.max != null) value = Math.min(cfg.max, value);
  return value;
}

export function resolveCompetenceXp(
  level: number,
  carriedXp: number,
  delta: number,
  rules: ParsedProgressionRules,
): { level: number; carriedXp: number; nextThreshold: number; crossedLevels: number[] } {
  let lv = Math.max(1, Math.floor(level));
  let xp = Math.max(0, Math.floor(carriedXp)) + Math.max(0, Math.floor(delta));
  const crossedLevels: number[] = [];
  let guard = 0;
  while (guard++ < 50) {
    const threshold = competenceThreshold(lv, rules);
    if (xp < threshold) return { level: lv, carriedXp: xp, nextThreshold: threshold, crossedLevels };
    xp -= threshold;
    lv += 1;
    crossedLevels.push(lv);
  }
  throw new Error("competence progression guard exceeded");
}

export function specializationThreshold(stars: number, rules: ParsedProgressionRules): number {
  const s = Math.max(0, Math.min(9, Math.floor(stars)));
  return rules.specializationThresholds[s] ?? 520;
}

export function computeSpecializationProgress(
  quality: SpecializationQuality,
  productiveMinutes: number,
  repetition = 1,
): number {
  const base: Record<SpecializationQuality, number> = {
    trace: 1,
    useful: 3,
    substantial: 7,
    expert: 12,
    breakthrough: 20,
  };
  const minutes = Math.max(5, Math.min(240, productiveMinutes || 5));
  return Math.max(1, Math.round(base[quality] * Math.sqrt(minutes / 30) * repetition));
}

export function resolveSpecializationProgress(
  stars: number,
  internalProgress: number,
  delta: number,
  rules: ParsedProgressionRules,
): { stars: number; internalProgress: number; nextThreshold: number; gainedStars: number } {
  let s = Math.max(0, Math.min(10, Math.floor(stars)));
  let p = Math.max(0, Math.floor(internalProgress)) + Math.max(0, Math.floor(delta));
  const old = s;
  while (s < 10) {
    const threshold = specializationThreshold(s, rules);
    if (p < threshold) return { stars: s, internalProgress: p, nextThreshold: threshold, gainedStars: s - old };
    p -= threshold;
    s += 1;
  }
  return { stars: 10, internalProgress: 0, nextThreshold: 0, gainedStars: 10 - old };
}

export function specializationVisibleBand(stars: number): string {
  if (stars <= 2) return "familiarity";
  if (stars <= 4) return "practical use";
  if (stars <= 6) return "confident command";
  if (stars <= 8) return "expert";
  return "mastery";
}

export function generalXpThreshold(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return 10 * l * (l + 9);
}
