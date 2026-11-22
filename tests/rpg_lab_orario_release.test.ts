import test from "node:test";
import assert from "node:assert/strict";
import {ORARIO_PLAYER_RELEASE} from "../src/rpg_lab_v1/orario_release.ts";

test("DanMachi Player release marker advertises code without claiming a campaign",()=>{
 assert.equal(ORARIO_PLAYER_RELEASE.version,
  "danmachi-solo-chroma-rpg-lab-v2-2026-11-23");
 assert.equal(ORARIO_PLAYER_RELEASE.noAutomaticCampaignCreation,true);
 assert.ok(ORARIO_PLAYER_RELEASE.features.includes("player_system"));
 assert.ok(ORARIO_PLAYER_RELEASE.features.includes("cas_save"));
 assert.ok(ORARIO_PLAYER_RELEASE.features.includes("chroma_palette_persistence"));
 assert.ok(ORARIO_PLAYER_RELEASE.features.includes("danmachi_deep_cores_70"));
});
