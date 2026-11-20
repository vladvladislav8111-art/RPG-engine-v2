import test from "node:test";
import assert from "node:assert/strict";
import {RPG_LAB_UI_V1} from "../src/rpg_lab_v1/ui.ts";
import {ORARIO_ANCHOR_POLICY} from "../src/rpg_lab_v1/orario_player_anchors.ts";
test("RPG Lab presents live anchor controls without a new session being automatically created",()=>{
 assert.match(RPG_LAB_UI_V1,/id="orarioInstallWorld"/);
 assert.match(RPG_LAB_UI_V1,/id="orarioLaunch"/);
 assert.match(RPG_LAB_UI_V1,/id="orarioReloadAnchors"/);
 assert.match(RPG_LAB_UI_V1,/id="orarioAnchorsDisplay"/);
 assert.match(RPG_LAB_UI_V1,/CREATE_NEW_ORARIO_PLAYER/);
 assert.match(RPG_LAB_UI_V1,/INSTALL_NEW_DANMACHI_WORLD/);
 assert.match(RPG_LAB_UI_V1,/player-hud/);
 assert.match(RPG_LAB_UI_V1,/orarioBar\("HP"/);
 assert.match(RPG_LAB_UI_V1,/orarioBar\("MP"/);
 assert.match(RPG_LAB_UI_V1,/orarioBar\("Выносливость"/);
 assert.doesNotMatch(RPG_LAB_UI_V1,/localStorage|sessionStorage/);
});
test("embedded RPG Lab UI script is syntactically valid and inserts dynamic data safely",()=>{
 const script=RPG_LAB_UI_V1.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script&&script.length>200);
 assert.doesNotThrow(()=>new Function(script));
 assert.match(script,/textContent=lines\.join/);
 assert.doesNotMatch(script,/innerHTML\s*=\s*lines/);
});
test("safe and private HUD anchors explicitly separate their visibility",()=>{
 assert.equal(ORARIO_ANCHOR_POLICY.noNPCPrivateData,true);
 assert.equal(ORARIO_ANCHOR_POLICY.metaDiscussionAdvancesTime,false);
 assert.equal(ORARIO_ANCHOR_POLICY.everyThirdGameTurnCheckpoint,true);
 assert.ok(ORARIO_ANCHOR_POLICY.gmOnlyNeverShow.some(x=>x.includes("подозрений")));
 assert.ok(ORARIO_ANCHOR_POLICY.onBattleStartAndExchange.includes("HP"));
});
