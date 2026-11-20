import test from "node:test";
import assert from "node:assert/strict";
import {newOrarioPlayerAwakening,activateOrarioPlayerSystem,
 completeJinwooDaily,newJinwooPreparation,changeJinwooPhase} from
 "../src/rpg_lab_v1/shadow_monarch_rules.ts";
import {SYSTEM_DUNGEON_DEFINITIONS,previewSystemDungeonKeyOffers,
 issueSystemDungeonKey,enterSystemDungeon,completeSystemDungeon} from
 "../src/rpg_lab_v1/system_dungeon_keys.ts";

test("original Player's first dungeon key is never handed out before awakening and reward",()=>{
 const before=newOrarioPlayerAwakening();
 assert.equal(previewSystemDungeonKeyOffers(before).candidates.length,0);
 const awakened=activateOrarioPlayerSystem(before,{sourceRef:"evt.wakeup.first",confirmedAwakening:true});
 assert.deepEqual(previewSystemDungeonKeyOffers(awakened).candidates,[]);
 assert.throws(()=>issueSystemDungeonKey(awakened,{
  sourceRef:"key.cheat",dungeonId:"instant.first",confirmedReward:true
 }),/NOT_EARNED/);
 const daily=completeJinwooDaily(awakened,{
  day:0,sourceRef:"evt.daily.0",proofConfirmed:true});
 assert.deepEqual(previewSystemDungeonKeyOffers(daily).candidates,[]);
 const gifted=structuredClone(daily);
 gifted.storyFlags.push("quest.reward.instant_key_from_box");
 gifted.inventory.system_instant_dungeon_key=1;
 assert.ok(previewSystemDungeonKeyOffers(gifted).candidates.some(x=>x.id==="instant.first"));
 const issued=issueSystemDungeonKey(gifted,{
  sourceRef:"evt.random_box.grant.key",dungeonId:"instant.first",confirmedReward:true});
 assert.equal(issued.dungeonKeys["instant.first"].state,"held");
 assert.equal(issued.systemLevel,1);
 assert.equal(issued.inventory["knight_killer"]??0,0);
});
test("key is one-time item with required scene entrance and confirmed clear",()=>{
 let s=newJinwooPreparation();
 s.completedDailyDays.push("0");
 s.storyFlags.push("quest.reward.instant_key_from_box");
 s.inventory.system_instant_dungeon_key=1;
 s=issueSystemDungeonKey(s,{sourceRef:"evt.key.1",
  dungeonId:"instant.first",confirmedReward:true});
 assert.throws(()=>completeSystemDungeon(s,{sourceRef:"evt.finish.cheat",
  dungeonId:"instant.first",confirmedClear:true}),/CLEAR_UNVERIFIED/);
 const entered=enterSystemDungeon(s,{
  sourceRef:"evt.enter.first",dungeonId:"instant.first",
  entranceLocationRef:"orario.unnamed_door",confirmedEntry:true});
 assert.equal(entered.dungeonKeys["instant.first"].state,"entered");
 assert.equal(entered.dungeonKeys["instant.first"].entryLocationRef,"orario.unnamed_door");
 assert.throws(()=>enterSystemDungeon(entered,{
  sourceRef:"evt.enter.second",dungeonId:"instant.first",
  entranceLocationRef:"orario.other_door",confirmedEntry:true}),/ENTRY_NOT_VERIFIED/);
 const cleared=completeSystemDungeon(entered,{sourceRef:"evt.clear",
  dungeonId:"instant.first",confirmedClear:true});
 assert.equal(cleared.dungeonKeys["instant.first"].state,"cleared");
 assert.equal(cleared.gold,s.gold,"Dungeons do not automatically pay out without actual victories");
 assert.equal(cleared.xp,s.xp);
 assert.throws(()=>issueSystemDungeonKey(cleared,{
  sourceRef:"evt.obtain.again",dungeonId:"instant.first",confirmedReward:true
 }),/NOT_EARNED/);
});
test("class change key needs a real System level 40 and disappears after promotion",()=>{
 const s=newJinwooPreparation();
 s.systemLevel=39;
 assert.equal(previewSystemDungeonKeyOffers(s).candidates.some(x=>x.id==="job.change"),false);
 s.systemLevel=40;
 assert.ok(previewSystemDungeonKeyOffers(s).candidates.some(x=>x.id==="job.change"));
 const key=issueSystemDungeonKey(s,{sourceRef:"evt.class.key",
  dungeonId:"job.change",confirmedReward:true});
 assert.ok(key.dungeonKeys["job.change"]);
 key.storyFlags.push("quest.job_trial.complete");
 const changed=changeJinwooPhase(key,{sourceRef:"evt.class.complete",
  confirmed:true,to:"shadow_class",qualifyingStoryRef:"quest.job_trial.complete"});
 assert.equal(previewSystemDungeonKeyOffers(changed).candidates.some(x=>x.id==="job.change"),false);
});
test("demon castle key is a secret daily milestone, not a day-1 automatic reward",()=>{
 const s=newJinwooPreparation();
 assert.equal(previewSystemDungeonKeyOffers(s).candidates.some(x=>x.id==="demon.castle"),false);
 s.storyFlags.push("quest.secret_daily.overachievement");
 assert.ok(previewSystemDungeonKeyOffers(s).candidates.some(x=>x.id==="demon.castle"));
 const key=issueSystemDungeonKey(s,{sourceRef:"evt.castle.key",
  confirmedReward:true,dungeonId:"demon.castle"});
 assert.equal(key.dungeonKeys["demon.castle"].state,"held");
 assert.equal(SYSTEM_DUNGEON_DEFINITIONS.find(x=>x.id==="demon.castle")?.difficulty,"s_rank");
});
test("late return temple is withheld until genuine System story trigger",()=>{
 const s=newJinwooPreparation();
 s.systemLevel=40;
 s.storyFlags.push("quest.job_trial.complete");
 const classed=changeJinwooPhase(s,{
  sourceRef:"evt.class",confirmed:true,
  to:"shadow_class",qualifyingStoryRef:"quest.job_trial.complete"});
 assert.equal(previewSystemDungeonKeyOffers(classed).candidates.some(x=>x.id==="temple.return"),false);
 classed.storyFlags.push("quest.system_architect.call");
 assert.ok(previewSystemDungeonKeyOffers(classed).candidates.some(x=>x.id==="temple.return"));
});
