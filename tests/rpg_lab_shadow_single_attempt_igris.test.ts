import test from "node:test";
import assert from "node:assert/strict";
import {
 newJinwooPreparation,changeJinwooPhase,grantJinwooStoryUnlock,
 recruitFirstKnightFromClassTrial,attemptJinwooShadowExtraction
} from "../src/rpg_lab_v1/shadow_monarch_rules.ts";
import {
 issueSystemDungeonKey,enterSystemDungeon,completeSystemDungeon
} from "../src/rpg_lab_v1/system_dungeon_keys.ts";

const prepare=()=>{
 const s=newJinwooPreparation();s.systemLevel=40;
 const issued=issueSystemDungeonKey(s,{
  sourceRef:"evt.job.key.issued",dungeonId:"job.change",confirmedReward:true});
 const entered=enterSystemDungeon(issued,{
  sourceRef:"evt.job.entered",dungeonId:"job.change",
  confirmedEntry:true,entranceLocationRef:"system.instance.job"});
 return completeSystemDungeon(entered,{
  sourceRef:"evt.job.cleared",dungeonId:"job.change",confirmedClear:true});
};
test("first knight is a voluntary, deterministic class-quest recruit, not an automatic import",()=>{
 const cleared=prepare();
 assert.equal(cleared.shadowRoster.length,0);
 assert.throws(()=>recruitFirstKnightFromClassTrial(cleared,{
  sourceRef:"evt.knight.cheat",confirmedClassTrialClear:true,playerAccepted:true
 }),/NOT_EARNED/);
 cleared.storyFlags.push("quest.job_trial.complete");
 const classed=changeJinwooPhase(cleared,{
  sourceRef:"evt.class.reward",confirmed:true,
  to:"shadow_class",qualifyingStoryRef:"quest.job_trial.complete"});
 const skilled=grantJinwooStoryUnlock(classed,{
  sourceRef:"evt.extraction.skill",confirmed:true,
  type:"skill",id:"shadow_extraction"});
 assert.deepEqual(skilled.shadowRoster,[]);
 assert.throws(()=>recruitFirstKnightFromClassTrial(skilled,{
  sourceRef:"evt.knight.unwanted",confirmedClassTrialClear:true,playerAccepted:false
 }),/NOT_EARNED/);
 const joined=recruitFirstKnightFromClassTrial(skilled,{
  sourceRef:"evt.knight.accepted",confirmedClassTrialClear:true,playerAccepted:true});
 assert.equal(joined.shadowRoster.length,1);
 assert.equal(joined.shadowRoster[0].name,"Игрис");
 assert.equal(joined.shadowRoster[0].id,"system.knight.igris");
 assert.equal(joined.shadowRoster[0].originalKind,"other");
 assert.equal(joined.extractionAttempts["system.knight.igris"],undefined);
 assert.throws(()=>recruitFirstKnightFromClassTrial(joined,{
  sourceRef:"evt.knight.again",confirmedClassTrialClear:true,playerAccepted:true
 }),/NOT_EARNED/);
 assert.equal(joined.shadowRoster.some(x=>["Беру","Беллион","Железо"].includes(x.name)),false);
});
test("generic extraction is one-time even if new roll, but new distinct targets can be raised",()=>{
 const cleared=prepare();cleared.storyFlags.push("quest.job_trial.complete");
 const c=changeJinwooPhase(cleared,{
  sourceRef:"evt.class.2",confirmed:true,to:"shadow_class",
  qualifyingStoryRef:"quest.job_trial.complete"});
 const s=grantJinwooStoryUnlock(c,{sourceRef:"evt.skill.2",
  confirmed:true,type:"skill",id:"shadow_extraction"});
 const input={sourceRef:"evt.first.roll",targetRef:"enemy.failed.01",
  confirmedDeath:true as const,originalKind:"monster" as const,
  name:"Серый орк",powerTier:"elite" as const,
  targetPower:"stronger" as const,corpsePresent:true,
  magicStoneIntact:true,residualImprint:false,
  corruptedMana:false,minutesSinceDeath:0,roll:99};
 const fail=attemptJinwooShadowExtraction(s,input);
 assert.equal(fail.success,false);
 assert.equal(fail.next.extractionAttempts["enemy.failed.01"],1);
 const second=attemptJinwooShadowExtraction(fail.next,{
  ...input,sourceRef:"evt.second.roll",roll:1});
 assert.equal(second.reason,"attempts_exhausted");
 assert.equal(second.next,fail.next);
 const other=attemptJinwooShadowExtraction(fail.next,{
  ...input,targetRef:"enemy.new.02",name:"Другой орк",
  targetPower:"weaker",sourceRef:"evt.new.enemy.roll",roll:1});
 assert.equal(other.success,true);
 assert.equal(other.next.shadowRoster.length,1);
});
