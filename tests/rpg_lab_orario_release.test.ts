import test from "node:test";
import assert from "node:assert/strict";
import {ORARIO_PLAYER_RELEASE} from "../src/rpg_lab_v1/orario_release.ts";

test("DanMachi Player release marker advertises code without claiming a campaign",()=>{
 assert.equal(ORARIO_PLAYER_RELEASE.version,
  "danmachi-solo-player-lab-v1-2026-11-20");
 assert.equal(ORARIO_PLAYER_RELEASE.noAutomaticCampaignCreation,true);
 assert.ok(ORARIO_PLAYER_RELEASE.features.includes("player_system"));
 assert.ok(ORARIO_PLAYER_RELEASE.features.includes("cas_save"));
});
