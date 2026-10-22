import { assert, assertEquals } from "jsr:@std/assert";
import { ACTION_PROFILES, resolveExertion } from "../src/physiology.ts";

Deno.test("V2.1 movement, swimming, climbing and rider baseline catalogue", () => {
  const baselines: Record<string, number> = {
    "action.stand": 0.2,
    "action.walk.slow": 1, "action.walk.normal": 1.5,
    "action.walk.fast": 2.5, "action.walk.loaded": 3,
    "action.walk.heavy_loaded": 5,
    "action.run.jog": 0.5, "action.run.fast": 0.8,
    "action.run.sprint": 1.5,
    "action.swim.calm": 0.5, "action.swim.normal": 1,
    "action.swim.fast": 2,
    "action.climb.active": 1, "action.climb.difficult": 2.5,
    "action.ride.walk": 1, "action.ride.trot": 2,
    "action.ride.gallop": 4,
  };
  for (const [id, cost] of Object.entries(baselines)) {
    assertEquals(ACTION_PROFILES[id].currentCost, cost, id);
  }
});

Deno.test("V2.1 manual work baseline catalogue", () => {
  const baselines: Record<string, number> = {
    "action.work.light": 1, "action.work.medium": 3,
    "action.work.heavy": 7.5, "action.work.very_heavy": 12,
    "action.work.dig": 8, "action.work.chop": 9,
    "action.work.smith": 7, "action.work.stone": 10,
    "action.work.carry_heavy": 6, "action.work.push_pull": 8,
    "action.work.dig_chop": 6,
  };
  for (const [id, cost] of Object.entries(baselines)) {
    assertEquals(ACTION_PROFILES[id].currentCost, cost, id);
  }
});

Deno.test("V2.1 combat baseline catalogue", () => {
  const baselines: Record<string, number> = {
    "action.melee.light_exchange": 0.8,
    "action.melee.exchange": 1,
    "action.melee.heavy_exchange": 1.5,
    "action.melee.polearm_exchange": 1,
    "action.combat.dodge": 0.5, "action.combat.block": 0.7,
    "action.combat.parry": 0.6, "action.combat.dash": 0.8,
    "action.combat.heavy_swing": 1.5,
    "action.bow.shot": 0.35, "action.bow.hold10": 0.15,
    "action.crossbow.shot": 0.15, "action.crossbow.reload": 0.65,
    "action.throw.light": 0.4, "action.spear.throw": 0.5,
  };
  for (const [id, cost] of Object.entries(baselines)) {
    assertEquals(ACTION_PROFILES[id].currentCost, cost, id);
  }
});

Deno.test("V2.1 registered profiles have coherent IDs, units and ceiling loss", () => {
  const units = new Set(["per hour", "per minute", "per shot", "per 10 sec", "per throw", "per exchange"]);
  for (const [id, profile] of Object.entries(ACTION_PROFILES)) {
    assertEquals(profile.id, id);
    assert(units.has(profile.unit));
    assert(profile.currentCost >= 0 && Number.isFinite(profile.currentCost));
    assert(profile.ceilingCost >= 0 && Number.isFinite(profile.ceilingCost));
    assert(profile.regenFactor >= 0 && Number.isFinite(profile.regenFactor));
  }
});

Deno.test("V2.1 swimming charges real time and lowers accessible ceiling independently", () => {
  for (const [actionId, expected] of [
    ["action.swim.calm", 5], ["action.swim.normal", 10],
    ["action.swim.fast", 20],
  ] as const) {
    const r = resolveExertion({ actionId, durationMinutes: 10, current: 56,
      ceiling: 56, baseMax: 56, endurance: 7 });
    assertEquals(r.currentCost, expected);
    assert(r.ceilingLoss > 0);
    assert(r.newCurrent <= r.newCeiling);
  }
});

Deno.test("V2.1 terrain/load modifiers affect the selected action once", () => {
  const common = { current: 56, ceiling: 56, baseMax: 56, endurance: 7 };
  assertEquals(resolveExertion({ ...common, actionId:"action.run.jog",
    durationMinutes: 1, loadMultiplier: 1.5 }).currentCost, 0.75);
  assertEquals(resolveExertion({ ...common, actionId:"action.walk.normal",
    durationMinutes: 60, environmentMultiplier: 1.5 }).currentCost, 2.25);
  assertEquals(resolveExertion({ ...common, actionId:"action.walk.normal",
    durationMinutes: 60, environmentMultiplier: 1.2 }).currentCost, 1.8);
});
