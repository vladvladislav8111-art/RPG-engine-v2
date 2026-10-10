import { resolveSceneActorIds } from "../src/scene_routing.ts";

const control = [
  ["Key", "Value"],
  ["current_scene_id", "scene.v2.selarin.vesha"],
  ["current_location_id", "loc.ilyrian.selarin.copy_market"],
];

Deno.test("current scene actors are resolved by exact stable IDs", () => {
  const active = [
    ["Slot", "Pointer"],
    ["scene", "scene.v2.selarin.vesha"],
    ["location", "loc.ilyrian.selarin.copy_market"],
    ["participating_npc", "npc.selarin.pool_2003;npc.other_a;npc.selarin.pool_2003"],
  ];
  const result = resolveSceneActorIds(control, active);
  if (result.length !== 2 || result[0] !== "npc.selarin.pool_2003" ||
      result[1] !== "npc.other_a") {
    throw new Error("live scene participant routing failed");
  }
});

Deno.test("old scene cache cannot override current scene", () => {
  const active = [
    ["Slot", "Pointer"],
    ["scene", "scene.v2.arderan.old"],
    ["location", "loc.ilyrian.selarin.copy_market"],
    ["participating_npc", "npc.arderan.west_factor_0301"],
  ];
  if (resolveSceneActorIds(control, active).length !== 0) {
    throw new Error("stale scene actor leaked into current context");
  }
});

Deno.test("old location cache cannot override current location", () => {
  const active = [
    ["Slot", "Pointer"],
    ["scene", "scene.v2.selarin.vesha"],
    ["location", "loc.arderan.west_market"],
    ["participating_npc", "npc.arderan.west_factor_0301"],
  ];
  if (resolveSceneActorIds(control, active).length !== 0) {
    throw new Error("stale location actor leaked into current context");
  }
});

Deno.test("invalid actor fragments and blank pointers are ignored", () => {
  const active = [
    ["Slot", "Pointer"],
    ["scene", "scene.v2.selarin.vesha"],
    ["location", "loc.ilyrian.selarin.copy_market"],
    ["participating_npc", "npc.selarin.pool_2003;player.shura;.;..;"],
  ];
  const result = resolveSceneActorIds(control, active);
  if (result.length !== 1 || result[0] !== "npc.selarin.pool_2003") {
    throw new Error("non-NPC or malformed participant ID leaked");
  }
});
