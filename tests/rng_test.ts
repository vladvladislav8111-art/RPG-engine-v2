import { assertEquals } from "jsr:@std/assert";
import { hash32, intBetween, seededRandom } from "../src/rng.ts";

Deno.test("hash is stable", () => {
  assertEquals(hash32("V2-S0273|test"), hash32("V2-S0273|test"));
});

Deno.test("seeded RNG is deterministic", () => {
  const a = seededRandom("same-seed");
  const b = seededRandom("same-seed");
  assertEquals([a(), a(), a()], [b(), b(), b()]);
});

Deno.test("integer stays within bounds", () => {
  const value = intBetween("bounds", 3, 7);
  if (value < 3 || value > 7) throw new Error(`out of bounds: ${value}`);
});
