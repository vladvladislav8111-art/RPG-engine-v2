import test from "node:test";
import assert from "node:assert/strict";
import {newJinwooPreparation} from "../src/rpg_lab_v1/shadow_monarch_rules.ts";
import {openConfirmedDailyBox} from "../src/rpg_lab_v1/orario_player_survival.ts";
import {issueSystemDungeonKey,previewSystemDungeonKeyOffers} from
 "../src/rpg_lab_v1/system_dungeon_keys.ts";

test("first instant dungeon is actually earnable from the daily randomized reward pool",()=>{
 const s=newJinwooPreparation();
 s.completedDailyDays.push("0");
 s.inventory.system_daily_box=1;
 const first=openConfirmedDailyBox(s,{
  sourceRef:"evt.box.key.8",playerApproved:true,confirmedOpen:true});
 assert.equal(first.reward,"system_instant_dungeon_key");
 assert.equal(first.next.inventory.system_instant_dungeon_key,1);
 assert.ok(first.next.storyFlags.includes("quest.reward.instant_key_from_box"));
 assert.equal(first.next.inventory.system_daily_box??0,0);
 assert.ok(previewSystemDungeonKeyOffers(first.next).candidates.some(x=>x.id==="instant.first"));
 const issued=issueSystemDungeonKey(first.next,{
  sourceRef:"evt.key.register.first",dungeonId:"instant.first",confirmedReward:true});
 assert.equal(issued.dungeonKeys["instant.first"].state,"held");
 assert.equal(issued.inventory.system_instant_dungeon_key??0,0);
 assert.equal(previewSystemDungeonKeyOffers(issued).candidates.some(x=>x.id==="instant.first"),false);
 assert.throws(()=>issueSystemDungeonKey(issued,{
  sourceRef:"evt.key.register.cheat",dungeonId:"instant.first",confirmedReward:true
 }),/NOT_EARNED/);
});
test("a narrative story flag alone cannot create a phantom key or duplicate reward",()=>{
 const s=newJinwooPreparation();s.completedDailyDays.push("0");
 s.storyFlags.push("quest.reward.instant_key_from_box");
 assert.equal(previewSystemDungeonKeyOffers(s).candidates.length,0);
 assert.throws(()=>issueSystemDungeonKey(s,{
  sourceRef:"evt.false.key",dungeonId:"instant.first",confirmedReward:true
 }),/NOT_EARNED/);
 s.inventory.system_daily_box=1;
 const repeated=openConfirmedDailyBox(s,{
  sourceRef:"evt.box.key.8",playerApproved:true,confirmedOpen:true});
 assert.equal(repeated.reward,"wound_dressing");
 assert.equal(repeated.next.inventory.system_instant_dungeon_key??0,0);
 assert.equal(repeated.next.inventory.wound_dressing,1);
});
