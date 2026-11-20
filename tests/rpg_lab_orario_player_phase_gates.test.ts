import test from "node:test";
import assert from "node:assert/strict";
import {newJinwooPreparation} from "../src/rpg_lab_v1/shadow_monarch_rules.ts";
import {applyOrarioPlayerAction} from "../src/rpg_lab_v1/orario_player_event.ts";
import type {LabSession} from "../src/rpg_lab_v1/session.ts";

const makeSession=(level=40):LabSession=>{
 const p=newJinwooPreparation();
 p.systemLevel=level;p.storyFlags.push("quest.job_trial.complete");
 return {schema:"RPG_LAB_SESSION_V1",projectId:"orario_phase_test",
  sessionId:"phase_test",gameClock:"D0 09:00",roleplayGuard:"strict",
  player:{resources:{},stats:{},inventory:{},
   locationId:"orario.medical_ward",jinwoo:p},
  discovered:["orario.medical_ward"],npcs:{},events:[]};
};
test("Player cannot unlock shadow extraction or elevate class from mere story claims",()=>{
 let session=makeSession();
 assert.throws(()=>applyOrarioPlayerAction(session,{
  kind:"unlock",playerApproved:true,args:{type:"skill",
   confirmed:true,id:"shadow_extraction"}
 },"evt.early.unlock","D0 09:00"),/SKILL_PHASE_UNAVAILABLE/);
 assert.throws(()=>applyOrarioPlayerAction(session,{
  kind:"change_class",playerApproved:true,args:{
   to:"shadow_class",confirmed:true,
   qualifyingStoryRef:"quest.job_trial.complete"}
 },"evt.fake.promote","D0 09:00"),/JOB_TRIAL_NOT_CLEARED/);
 assert.equal(session.player.jinwoo!.phase,"player_system");
 session.player.jinwoo!.dungeonKeys["job.change"]={
  id:"job.change",issuedRef:"evt.earned.job.key",state:"cleared"};
 session.player.jinwoo!.defeatEvidence={
  "mob.igris.won":{monsterId:"system.igris",
   sourceRef:"evt.igris.actual.victory",floor:1}
 };
 const promoted=applyOrarioPlayerAction(session,{
  kind:"change_class",playerApproved:true,args:{
   to:"shadow_class",confirmed:true,
   qualifyingStoryRef:"quest.job_trial.complete"}
 },"evt.class.allowed","D0 09:01");
 assert.equal(promoted.phase,"shadow_class");
 assert.equal(session.player.jinwoo!.phase,"player_system");
 const classSession=makeSession();
 classSession.player.jinwoo=promoted;
 const unlocked=applyOrarioPlayerAction(classSession,{
  kind:"unlock",playerApproved:true,args:{type:"skill",
   confirmed:true,id:"shadow_extraction"}
 },"evt.skill.class.reward","D0 09:02");
 assert.ok(unlocked.unlockedSkills.includes("shadow_extraction"));
});
test("true Monarch cannot be granted from quest flag without Architect trial",()=>{
 const session=makeSession(75);
 session.player.jinwoo!.phase="shadow_class";
 session.player.jinwoo!.storyFlags.push("quest.ashborn.complete");
 assert.throws(()=>applyOrarioPlayerAction(session,{
  kind:"change_class",playerApproved:true,
  args:{to:"true_monarch",confirmed:true,
   qualifyingStoryRef:"quest.ashborn.complete"}
 },"evt.early.monarch","D0 09:05"),/SUCCESSION_NOT_CLEARED/);
 session.player.jinwoo!.dungeonKeys["temple.return"]={
  id:"temple.return",issuedRef:"evt.earned.temple.key",state:"cleared"};
 session.player.jinwoo!.defeatEvidence={
  "mob.architect.won":{monsterId:"system.architect_trial",
   sourceRef:"evt.architect.actual.victory",floor:1}
 };
 const final=applyOrarioPlayerAction(session,{
  kind:"change_class",playerApproved:true,
  args:{to:"true_monarch",confirmed:true,
   qualifyingStoryRef:"quest.ashborn.complete"}
 },"evt.actual.monarch","D0 09:06");
 assert.equal(final.phase,"true_monarch");
});
