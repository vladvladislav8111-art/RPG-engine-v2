import { assertEquals } from "jsr:@std/assert";
import {
  advanceClock,
  advanceCompetence,
  advanceGeneralXp,
  combatThreatMultiplier,
  computeCompetenceAward,
  computeGeneralXpAward,
  generalXpThreshold,
} from "../src/rules.ts";

Deno.test("general XP threshold matches current level-2 runtime", () => {
  assertEquals(generalXpThreshold(2), 220);
});

Deno.test("equal-threat combat uses 2.5 percent threshold base", () => {
  assertEquals(computeGeneralXpAward({ level: 2, effectiveThreatRating: 2, contribution: 1 }), 6);
});

Deno.test("general XP carries overflow and grants points", () => {
  const r = advanceGeneralXp(2, 215, 20);
  assertEquals(r.newLevel, 3);
  assertEquals(r.newXp, 15);
  assertEquals(r.characteristicPointsGranted, 1);
  assertEquals(r.skillPointsGranted, 1);
  assertEquals(r.classPointsGranted, 0);
});

Deno.test("combat threat multiplier bands are stable", () => {
  assertEquals(combatThreatMultiplier(-8), 0.05);
  assertEquals(combatThreatMultiplier(0), 1);
  assertEquals(combatThreatMultiplier(9), 3);
});

Deno.test("competence learning formula is deterministic", () => {
  assertEquals(computeCompetenceAward({ band: "useful", productiveMinutes: 60 }), 10);
});

Deno.test("clock rollover is exact", () => {
  assertEquals(advanceClock(31, "23:59:30", 90), { day: 32, time: "00:01:00" });
});

Deno.test("competence milestone locks overflow into deferred XP", () => {
  const r = advanceCompetence(2, 590, 50);
  assertEquals(r.newLevel, 3);
  assertEquals(r.newXp, 0);
  assertEquals(r.deferredXp, 40);
  assertEquals(r.milestoneLevels, [3]);
});
