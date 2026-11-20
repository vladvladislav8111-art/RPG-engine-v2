import test from "node:test";
import assert from "node:assert/strict";
import {buildFreshDanmachiLabPack} from "../src/rpg_lab_v1/danmachi_starter.ts";
import {newOrarioPlayerAwakening,activateOrarioPlayerSystem} from
 "../src/rpg_lab_v1/shadow_monarch_rules.ts";
import {newOrarioHeroProfile,originalHeroVisibleFeatures,
 validateOrarioHeroProfile} from "../src/rpg_lab_v1/orario_player_hero.ts";
import {readOrarioPlayerAnchors,readOrarioGmAnchors,
 ORARIO_ANCHOR_POLICY} from "../src/rpg_lab_v1/orario_player_anchors.ts";
import {readOrarioPlayerHud} from "../src/rpg_lab_v1/orario_player_event.ts";
import {readLabPlayerFog,readLabRoleplayScene} from
 "../src/rpg_lab_v1/roleplay_adapter.ts";
import {validateLabSession,type LabSession} from "../src/rpg_lab_v1/session.ts";
const pack=buildFreshDanmachiLabPack("orario_kai_anchor_test");
const build=():LabSession=>({
 schema:"RPG_LAB_SESSION_V1",projectId:pack.projectId,
 sessionId:"kai_day0",gameClock:"D0 09:00",roleplayGuard:"strict",
 player:{resources:{},stats:{},inventory:{},
  locationId:"orario.medical_ward",
  jinwoo:newOrarioPlayerAwakening(),
  hero:newOrarioHeroProfile(),
  visibleFeatures:originalHeroVisibleFeatures()},
 discovered:["orario.medical_ward"],npcs:{},events:[],worldEvents:[]
});
test("new original human Player identity and readable features are isolated and valid",()=>{
 const s=build();assert.equal(validateLabSession(s,pack),s);
 assert.equal(s.player.hero?.name,"Кай Арден");
 assert.equal(s.player.hero?.age,20);
 assert.equal(s.player.hero?.playerControlsPersonality,true);
 assert.equal(s.player.hero?.immutableCanonIdentity,false);
 assert.equal(s.player.jinwoo?.awaitingActivation,true);
 assert.equal(s.player.jinwoo?.falna.blessed,false);
 assert.equal(s.player.jinwoo?.shadowRoster.length,0);
 assert.equal(Object.keys(s.player.visibleFeatures??{}).length,3);
 const bad=structuredClone(s);bad.player.hero!.age=5;
 assert.throws(()=>validateLabSession(bad,pack),/HERO_PROFILE_INVALID/);
});
test("player interface before first awakening hides System levels, exact HP and monster statistics",()=>{
 const s=build();
 const a=readOrarioPlayerAnchors(s,pack);
 assert.equal(a.available,true);
 assert.equal(a.hero.name,"Кай Арден");
 assert.equal(a.scene.location,"Лазарет Орарио");
 assert.equal(a.systemActivated,false);
 assert.equal(a.system,null);
 assert.equal(a.vitals.hp,null);
 assert.equal(a.vitals.mp,null);
 assert.equal(a.vitals.stamina,null);
 assert.deepEqual(a.openKeys,[]);
 const hud=readOrarioPlayerHud(s);
 assert.equal(hud.available,true);
 assert.equal(hud.awaitingActivation,true);
 assert.equal("systemLevel" in hud,false);
 assert.equal("shadowCount" in hud,false);
});
test("after login status bars show only Player HP MP and derived stamina, not NPC secrets",()=>{
 const s=build();s.player.jinwoo=activateOrarioPlayerSystem(
  s.player.jinwoo!,{sourceRef:"evt.kai.first.login",confirmedAwakening:true});
 s.player.jinwoo.fatigue=29;
 s.player.jinwoo.gold=104;s.player.jinwoo.valis=87;
 s.player.jinwoo.activeEncounter={enemyRef:"enemy.hidden.1",
  monsterId:"goblin",floor:1,enemyHp:80,round:0,
  startedRef:"evt.kai.battle.start"};
 s.npcs["npc.freya"]={knownFacts:[],memories:[],
  suspicion:{score:71,clues:[{sourceRef:"evt.rumor.1",
    tag:"mystery",delta:20,context:"Только Фрейя слышала слух"}]}};
 const a=readOrarioPlayerAnchors(s,pack);
 assert.equal(a.vitals.hp?.current,s.player.jinwoo.hp);
 assert.equal(a.vitals.mp?.max,140);
 assert.equal(a.vitals.stamina?.current,71);
 assert.equal(a.currencies?.systemGold,104);
 assert.equal(a.currencies?.valis,87);
 assert.equal(a.combat?.enemyHpHidden,true);
 assert.equal(a.combat?.showFullPlayerResourceBars,true);
 assert.equal("enemyHp" in (a.combat??{}),false);
 assert.equal("monsterId" in (a.combat??{}),false);
 assert.equal(JSON.stringify(a).includes("Фрейя"),false);
 assert.equal(JSON.stringify(a).includes("71"),true);// stamina only
 const hud=readOrarioPlayerHud(s);
 assert.equal("enemyHp" in (hud.encounter??{}),false);
 assert.equal("monsterId" in (hud.encounter??{}),false);
 assert.equal(ORARIO_ANCHOR_POLICY.everyThirdGameTurnCheckpoint,true);
 const gm=readOrarioGmAnchors(s,["npc.freya"]);
 assert.equal(gm.privateNpcAnchors[0].suspicion,71);
 assert.equal(gm.audience,"GM_ONLY");
});
test("NPC suspicion remains private even when scene context returns useful Player anchors",async()=>{
 const s=build();
 s.player.jinwoo=activateOrarioPlayerSystem(
  s.player.jinwoo!,{sourceRef:"evt.activate.kai",confirmedAwakening:true});
 s.npcs["npc.eina"]={knownFacts:[],memories:[],
  suspicion:{score:31,clues:[{sourceRef:"evt.private.1",
   tag:"odd",delta:12,context:"Сомневается"}]}};
 const load=async()=>({pack,packRevision:1,session:s,sessionRevision:6});
 const publicInfo=await readLabPlayerFog(load,pack.projectId,s.sessionId);
 assert.equal(publicInfo.orarioPlayerAnchors!.hero.name,"Кай Арден");
 assert.equal(JSON.stringify(publicInfo).includes("Сомневается"),false);
 assert.equal(JSON.stringify(publicInfo).includes("privateNpcAnchors"),false);
 const scene=await readLabRoleplayScene(load,{projectId:pack.projectId,
  sessionId:s.sessionId,npcIds:["npc.eina"],dialogueText:"Эйна"});
 assert.equal(scene.orarioPrivateSceneAnchors!.privateNpcAnchors[0].suspicion,31);
 assert.equal(scene.orarioPlayerAnchors!.hero.name,"Кай Арден");
 assert.equal(scene.playerOnlySystemMenus,true);
});
test("unrelated campaign gets no Player anchor or hero profile",()=>{
 const s=build();delete s.player.jinwoo;delete s.player.hero;
 s.player.visibleFeatures={};validateLabSession(s,pack);
 assert.equal(readOrarioPlayerAnchors(s,pack).available,false);
});
