import { assertEquals, assert } from "jsr:@std/assert";
import {
  deriveStaminaBaseMax,
  resolveExertion,
  resolveInjurySimulation,
  resolveRest,
} from "../src/physiology.ts";

Deno.test("heavy labor four hours reproduces 56 -> 26/52 baseline example", () => {
  const r = resolveExertion({
    actionId: "action.work.heavy",
    durationMinutes: 240,
    current: 56,
    ceiling: 56,
    baseMax: 56,
    endurance: 7,
    competenceLevel: 0,
    specializationStars: 0,
  });
  assertEquals(r.currentCost, 30);
  assertEquals(r.ceilingLoss, 4);
  assertEquals(r.newCurrent, 26);
  assertEquals(r.newCeiling, 52);
});

Deno.test("short rest restores current and half missing ceiling", () => {
  const r = resolveRest({
    restId: "rest.short",
    durationMinutes: 30,
    current: 26,
    ceiling: 52,
    baseMax: 56,
    endurance: 7,
  });
  assertEquals(r.newCeiling, 54);
  assertEquals(r.newCurrent, 47);
});

Deno.test("full useful sleep restores ordinary exertion ceiling and current", () => {
  const r = resolveRest({
    restId: "rest.full",
    durationMinutes: 480,
    current: 18,
    ceiling: 45,
    baseMax: 56,
    endurance: 7,
    usefulSleep: true,
  });
  assertEquals(r.newCeiling, 56);
  assertEquals(r.newCurrent, 56);
});

Deno.test("weak toxin superficial scratch can fall to low proc chance with immunity", () => {
  const r = resolveInjurySimulation({
    seed: "test-scratch",
    weaponForce: "light",
    hitQuality: "glancing",
    location: "arm",
    endurance: 7,
    tags: ["cut", "poison"],
    toxin: { class: "weak", specificImmunity: 10 },
  });
  assert(r.toxin && typeof r.toxin === "object");
  const toxin = r.toxin as any;
  if (r.severity === "SUPERFICIAL") assertEquals(toxin.chance, 4);
});

Deno.test("heavy direct unarmored abdominal blade cannot resolve as superficial in score 6 band", () => {
  const r = resolveInjurySimulation({
    seed: "heavy-abdomen-demo",
    weaponForce: "heavy",
    hitQuality: "direct",
    location: "torso_abdomen",
    armorMitigation: 0,
    endurance: 7,
    tags: ["cut", "puncture", "poison"],
    toxin: { class: "weak" },
  });
  assertEquals(r.traumaScore, 6);
  assert(["SERIOUS", "SEVERE", "CRITICAL"].includes(r.severity));
  assert(r.hpLoss >= r.hpRange[0] && r.hpLoss <= r.hpRange[1]);
});

Deno.test("Shura current level/endurance baseline is 56", () => {
  assertEquals(deriveStaminaBaseMax(2, 7), 56);
});
