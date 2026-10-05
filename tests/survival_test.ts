import { assertEquals, assertThrows } from "jsr:@std/assert";
import {
  computeSurvivalChange,
  FOOD_PROFILES,
  HYDRATION_PER_LITER,
  survivalBand,
  survivalStaminaModifiers,
} from "../src/survival.ts";

Deno.test("bread and ordinary meal have fixed satiety values", () => {
  assertEquals(FOOD_PROFILES["food.bread_loaf"].satiety, 25);
  assertEquals(FOOD_PROFILES["food.ordinary_meal"].satiety, 55);
});

Deno.test("one liter of water restores 40 hydration", () => {
  assertEquals(HYDRATION_PER_LITER, 40);
});

Deno.test("normal activity drains four points per hour", () => {
  const r = computeSurvivalChange({
    satiety: 100,
    hydration: 100,
    elapsedSeconds: 3600,
    defaultActivity: "normal",
  });
  assertEquals(r.newSatiety, 96);
  assertEquals(r.newHydration, 96);
});

Deno.test("travel drains hydration faster than satiety", () => {
  const r = computeSurvivalChange({
    satiety: 100,
    hydration: 100,
    elapsedSeconds: 7200,
    defaultActivity: "travel",
  });
  assertEquals(r.newSatiety, 91);
  assertEquals(r.newHydration, 90);
});

Deno.test("food and water refill but never exceed 100", () => {
  const r = computeSurvivalChange({
    satiety: 80,
    hydration: 75,
    elapsedSeconds: 0,
    foodIntakes: [{ foodId: "food.ordinary_meal" }],
    waterLiters: 1,
  });
  assertEquals(r.newSatiety, 100);
  assertEquals(r.newHydration, 100);
});

Deno.test("explicit survival segments must cover elapsed time", () => {
  assertThrows(() =>
    computeSurvivalChange({
      satiety: 100,
      hydration: 100,
      elapsedSeconds: 3600,
      segments: [{ durationMinutes: 30, activity: "normal" }],
    })
  );
});

Deno.test("survival bands are stable", () => {
  assertEquals(survivalBand(100), "full");
  assertEquals(survivalBand(75), "good");
  assertEquals(survivalBand(55), "mild");
  assertEquals(survivalBand(30), "low");
  assertEquals(survivalBand(15), "severe");
  assertEquals(survivalBand(5), "critical");
});


Deno.test("low satiety and hydration penalize stamina economy deterministically", () => {
  assertEquals(survivalStaminaModifiers(80, 80), {
    exertionCost: 1,
    recovery: 1,
    ceilingLoss: 1,
  });
  assertEquals(survivalStaminaModifiers(20, 20), {
    exertionCost: 1.3,
    recovery: 0.6,
    ceilingLoss: 1.3,
  });
});
