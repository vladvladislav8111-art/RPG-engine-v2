import test from "node:test";
import assert from "node:assert/strict";
import {buildFreshDanmachiLabPack} from "../src/rpg_lab_v1/danmachi_starter.ts";
import {DANMACHI_STARTING_NPC_COUNT} from "../src/rpg_lab_v1/danmachi_cast.ts";
import {DANMACHI_CANON_ARC_COUNT} from "../src/rpg_lab_v1/danmachi_story_arcs.ts";
import {applyConfirmedLabEvent,type LabConfirmedEvent} from "../src/rpg_lab_v1/events.ts";
import {readLabPublicFog} from "../src/rpg_lab_v1/fog_of_war.ts";
import {previewLabStoryPaths} from "../src/rpg_lab_v1/story_consequences.ts";
import {readLabRoleplayScene} from "../src/rpg_lab_v1/roleplay_adapter.ts";
import {archiveLabCampaignsInKv} from "../src/rpg_lab_v1/http.ts";
import {archivedLabKey} from "../src/rpg_lab_v1/campaign_lifecycle.ts";
import type {LabSession} from "../src/rpg_lab_v1/session.ts";

const pack=buildFreshDanmachiLabPack("new_orario_2026");
const fresh=():LabSession=>({
 schema:"RPG_LAB_SESSION_V1",projectId:pack.projectId,sessionId:"fresh_danmachi",
 gameClock:"D0 08:00",roleplayGuard:"strict",
 player:{resources:{},stats:{},inventory:{}},npcs:{},events:[],discovered:[]
});
const evt=(id:string,t:string,more:Partial<LabConfirmedEvent>={}):LabConfirmedEvent=>({
 sourceRef:id,kind:"player_turn",time:t,summary:id,knownBy:[],gmConfirmed:true,...more
});
test("fresh DanMachi pack includes all anchor families, distinctive speech and conditional anime plot",()=>{
 assert.ok(DANMACHI_STARTING_NPC_COUNT>=60);
 assert.ok(DANMACHI_CANON_ARC_COUNT>=10);
 for(const id of ["loki","finn","riveria","gareth","ais","tiona","tione","bete",
  "lefiya","raul","hephaestus","tsubaki","ganesha","shakti","bell",
  "hestia","freya","ottar","hermes","asfi","ryuu","syr",
  "wiene","filvis","horn","hedin","eina","aisha","cassandra"]){
  const npc=pack.npcProfiles["npc."+id];
  assert.ok(npc,"Missing character "+id);
  assert.ok(npc.voice?.sampleLines.length,"Missing original speech example "+id);
  assert.ok(npc.voice?.verbalTics.length,"Missing personal speech tic "+id);
  assert.ok(npc.habitualLogic?.defaultInference.length,"Missing reasoning habit "+id);
  assert.ok(npc.habitualLogic?.conflictTriggers.length,"Missing conflict trigger "+id);
 }
 assert.notDeepEqual(pack.npcProfiles["npc.bete"].voice?.sampleLines,
  pack.npcProfiles["npc.loki"].voice?.sampleLines);
 assert.equal(pack.npcProfiles["npc.freya"].entryArc,"start");
 assert.ok(pack.storyArcs?.silverback.beats.some(b=>b.beatId==="bell_training"));
 assert.ok(pack.storyArcs?.["freya.goddess"]);
 assert.ok(pack.storyArcs?.["sword.oratoria"]);
 const empty=fresh();
 assert.equal(empty.events.length,0);
 assert.equal(empty.player.linos,undefined);
 assert.equal(empty.playerFog,undefined);
 assert.equal(empty.storyState,undefined);
});
test("fog: secret NPC/world facts remain undiscovered; direct player observation only",()=>{
 let session=fresh();
 session=applyConfirmedLabEvent(session,pack,evt("evt.fels_secret","D0 08:10",{
  knownBy:["npc.fels"],observations:[{
   npcId:"npc.fels",channel:"seen",
   perceivedFact:"Fels knows a hidden underground passage",
   learnedAt:"D0 08:10",confidence:"certain",salience:"important",privacy:"private"
  }]
 }));
 const before=readLabPublicFog(session);
 assert.equal(before.known.length,0);
 assert.equal(JSON.stringify(before).includes("underground passage"),false);
 session=applyConfirmedLabEvent(session,pack,evt("evt.city_view","D0 08:20",{
  kind:"player_turn",playerWitnessed:true,playerLocationId:"orario.plaza",
  discovered:["orario.plaza"],
  playerFogChanges:[{key:"landmark.guild",expectedRevision:0,
   label:"Здание Гильдии",summary:"Большое административное здание на площади",
   kind:"place",certainty:"observed",channel:"direct",
   relatedLocationId:"orario.guild"}],
  playerAreaChanges:[{locationId:"orario.plaza",expectedRevision:0,level:"visited"}]
 }));
 assert.equal(readLabPublicFog(session).known.length,1);
 assert.equal(readLabPublicFog(session).locations[0].level,"visited");
 assert.throws(()=>applyConfirmedLabEvent(session,pack,evt("evt.magic_omniscience","D0 08:30",{
  playerFogChanges:[{key:"secret.knossos",expectedRevision:0,
   label:"Секрет",summary:"Скрытая комната под городом",kind:"fact",
   certainty:"verified",channel:"direct"}]
 })),/LAB_FOG_DIRECT_WITNESS_MISSING/);
 assert.throws(()=>applyConfirmedLabEvent(session,pack,evt("evt.reveal_secret","D0 08:30",{
  kind:"dialogue",
  playerFogChanges:[{key:"secret.fels",expectedRevision:0,
   label:"Фелс",summary:"Тайна, о которой Фелс никогда не говорил игроку",
   kind:"story",certainty:"rumor",channel:"report",
   sourceNpcId:"npc.fels",sourceMemoryRef:"evt.unknown"}]
 })),/LAB_FOG_UNVERIFIED_RELAY/);
 assert.equal(JSON.stringify(readLabPublicFog(session)).includes("secret.fels"),false);
});
test("reliable hearsay remains a reported belief, not a verified player-known secret",()=>{
 let session=fresh();
 session=applyConfirmedLabEvent(session,pack,evt("evt.eina_fact","D0 08:10",{
  knownBy:["npc.eina"],observations:[{
   npcId:"npc.eina",channel:"seen",perceivedFact:"A private guide mentions hidden ruins",
   learnedAt:"D0 08:10",confidence:"certain",salience:"important",privacy:"private"
  }]
 }));
 session=applyConfirmedLabEvent(session,pack,evt("evt.eina_tells","D0 09:00",{
  kind:"dialogue",playerFogChanges:[{key:"ruins.mention",expectedRevision:0,
   label:"Слух о руинах",summary:"Эйна сообщила, что слышала о старых руинах",
   kind:"place",certainty:"rumor",channel:"report",
   sourceNpcId:"npc.eina",sourceMemoryRef:"evt.eina_fact"}]
 }));
 assert.equal(readLabPublicFog(session).known[0].certainty,"rumor");
 assert.equal(readLabPublicFog(session).known[0].channel,"report");
});
test("alternative Bell rescue unlocks possibilities without silverback Falna gain",()=>{
 let session=fresh();
 session=applyConfirmedLabEvent(session,pack,evt("evt.monster","D0 09:00",{
  storyFlagChanges:[
   {flagId:"monsterphilia.started",expectedRevision:0,value:true,evidenceRefs:["evt.monster"]},
   {flagId:"silverback.saved_by_player",expectedRevision:0,value:true,evidenceRefs:["evt.monster"]},
   {flagId:"ganesha.noticed_bell",expectedRevision:0,value:true,evidenceRefs:["evt.monster"]},
  ],
 }));
 const view=previewLabStoryPaths(pack,session);
 assert.ok(view.candidateBeats.some(x=>x.arcId==="silverback"&&x.beatId==="rescued"));
 assert.ok(view.candidateBeats.some(x=>x.arcId==="silverback"&&x.beatId==="ganesha_offer"));
 assert.equal(view.candidateBeats.some(x=>x.arcId==="silverback"&&x.beatId==="bell_win"),false);
 assert.equal(view.techniques.length,0);
 assert.equal(session.player.stats.excelia,undefined);
 session=applyConfirmedLabEvent(session,pack,evt("evt.ganesha_offer","D0 10:00",{
  storyFlagChanges:[
   {flagId:"ganesha.training_offered",expectedRevision:0,value:true,
    evidenceRefs:["evt.ganesha_offer"]},
   {flagId:"bell.training_accepted",expectedRevision:0,value:true,
    evidenceRefs:["evt.ganesha_offer"]},
  ]
 }));
 const next=previewLabStoryPaths(pack,session);
 assert.ok(next.candidateBeats.some(x=>x.beatId==="bell_training"));
 assert.equal(next.noAutoXP,true);
 const premature=next.blockedBeats.find(x=>x.beatId==="trained_branch");
 assert.equal(premature?.missingTechnique?.minGrade,"basic");
 for(let i=0;i<4;i++){
  const id="evt.lesson."+i;
  const clockMinutes=11*60+30+i*90;
  const time="D0 "+String(Math.floor(clockMinutes/60)).padStart(2,"0")+":"+String(clockMinutes%60).padStart(2,"0");
  session=applyConfirmedLabEvent(session,pack,evt(id,time,{
   kind:"training",
   npcInteractions:[{
    initiatorNpcId:"npc.shakti",recipientNpcId:"npc.bell",
    action:"Teaching evasion, balance and footwork",
    outcome:"Bell completes practical drills with corrections",
    salience:"ordinary",privacy:"small_group"
   }],
   npcTechniqueTraining:[{
    trainingId:"bell.ganesha.footwork",traineeNpcId:"npc.bell",
    mentorNpcId:"npc.shakti",discipline:"Уклонения, стойка и работа ног",
    expectedRevision:i,sessionMinutes:90,passedDrill:true
   }]
  }));
 }
 assert.equal(session.storyState?.techniques["bell.ganesha.footwork"].technique,"trained");
 assert.equal(session.storyState?.techniques["bell.ganesha.footwork"].totalMinutes,360);
 assert.equal(session.player.stats.excelia,undefined);
 const end=previewLabStoryPaths(pack,session);
 assert.equal(end.techniques.find(x=>x.id==="bell.ganesha.footwork")?.notFalnaExp,true);
 session=applyConfirmedLabEvent(session,pack,evt("evt.approach","D0 16:05",{
  storyFlagChanges:[{flagId:"bell.minotaur_approach",expectedRevision:0,value:true,
   evidenceRefs:["evt.approach"]}]
 }));
 assert.ok(previewLabStoryPaths(pack,session).candidateBeats.some(x=>
  x.arcId==="bell.minotaur"&&x.beatId==="trained_branch"));
 assert.throws(()=>applyConfirmedLabEvent(session,pack,evt("evt.fake_minutes","D0 16:10",{
  kind:"training",npcInteractions:[{initiatorNpcId:"npc.shakti",recipientNpcId:"npc.bell",
   action:"Short correction",outcome:"A five-minute rehearsal",
   salience:"ordinary",privacy:"small_group"}],
  npcTechniqueTraining:[{trainingId:"bell.ganesha.footwork",
   traineeNpcId:"npc.bell",mentorNpcId:"npc.shakti",
   discipline:"Уклонения, стойка и работа ног",
   expectedRevision:4,sessionMinutes:120,passedDrill:true}]
 })),/LAB_STORY_TRAINING_TIME_INSUFFICIENT/);
 assert.throws(()=>applyConfirmedLabEvent(session,pack,evt("evt.free_master","D0 17:00",{
  npcTechniqueTraining:[{trainingId:"bell.ganesha.footwork",
   traineeNpcId:"npc.bell",mentorNpcId:"npc.shakti",
   discipline:"Уклонения, стойка и работа ног",
   expectedRevision:4,sessionMinutes:120,passedDrill:true}]
 })),/LAB_STORY_TRAINING_EVENT_KIND/);
});
test("GM sees the causal plot and voice, player fog never reveals future arcs",async()=>{
 const session=fresh();
 const loader=async()=>({pack,session,packRevision:1,sessionRevision:1});
 const gm=await readLabRoleplayScene(loader,{
  projectId:pack.projectId,sessionId:session.sessionId,npcIds:["npc.loki","npc.bell"]});
 assert.equal(gm.actors.length,2);
 assert.ok(gm.actors[0].voiceIdentity?.sampleLines.length);
 assert.ok(gm.actors[1].habitualLogic?.priorities.length);
 assert.equal(gm.storyRoutes?.gmOnly,true);
 assert.equal(JSON.stringify(readLabPublicFog(session)).includes("Freya"),false);
});
test("reversible RPG Lab-only archive is CAS bounded, leaves all payloads intact",async()=>{
 const kv=await Deno.openKv(":memory:");
 try{
  const sessionKey=["rpg-lab-v1","sessions","old_world","old_session"];
  const legacyKey=["legacy","shura","save"];
  await kv.set(sessionKey,{revision:3,gameClock:"D9 09:00",contents:"historic"});
  await kv.set(legacyKey,{protected:true});
  await assert.rejects(()=>archiveLabCampaignsInKv(kv,[{
   projectId:"old_world",sessionId:"old_session",expectedRevision:2
  }],"New clean campaign preparation"),/LAB_ARCHIVE_REVISION_CONFLICT/);
  const saved=await archiveLabCampaignsInKv(kv,[{
   projectId:"old_world",sessionId:"old_session",expectedRevision:3
  }],"New clean campaign preparation");
  assert.equal(saved.ok,true);
  assert.equal(saved.deleted,false);
  const manifest=await kv.get(archivedLabKey("old_world","old_session"));
  assert.equal((manifest.value as any).revision,3);
  assert.equal((manifest.value as any).mode,"reversible_archive");
  assert.equal((await kv.get(sessionKey)).value!==null,true);
  assert.deepEqual((await kv.get(legacyKey)).value,{protected:true});
  await assert.rejects(()=>archiveLabCampaignsInKv(kv,[{
   projectId:"old_world",sessionId:"old_session",expectedRevision:3
  }],"New clean campaign preparation"),/LAB_CAMPAIGN_ALREADY_ARCHIVED/);
 }finally{kv.close();}
});
