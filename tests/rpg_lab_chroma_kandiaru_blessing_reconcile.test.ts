import test from "node:test";
import assert from "node:assert/strict";
import {newJinwooPreparation,projectJinwooFalna} from
 "../src/rpg_lab_v1/shadow_monarch_rules.ts";
import {applyOrarioPlayerAction} from
 "../src/rpg_lab_v1/orario_player_event.ts";
import type {LabSession} from "../src/rpg_lab_v1/session.ts";
const src="chroma.repair.d3_kandiaru_blessing.647";
const prior="chroma.d3_kasaka_venom_drunk_on_way_guild.641";
function makeSession(proof=true):LabSession{
 const p=newJinwooPreparation();
 p.awaitingActivation=false;p.systemLevel=8;p.xp=588;
 p.stats.strength=26;p.stats.stamina=26;p.stats.agility=28;
 p.stats.perception=22;p.stats.intelligence=22;
 p.falna.blessed=true;p.falna.divineLevel=1;p.falna.godId="npc.loki";
 p.storyFlags.push("chroma_falna_v2","status.kasaka_armor_scales_20",
    "status.kasaka_weakened_muscles_35");
 p.appliedRewardRefs.push(prior);
 return {schema:"RPG_LAB_SESSION_V1",
  projectId:"chroma_orario_main_20261120",
  sessionId:"chroma_day0_20261120",gameClock:"D3 19:21",
  player:{hero:{id:"hero.chroma"},jinwoo:p,locationId:"orario.dungeon.upper"},
  events:[{sourceRef:proof?prior:"wrong.drink.event"}]
 } as unknown as LabSession;
}
test("one-off proof-backed correction recognizes Kandiaru protection earned with awakening",()=>{
 const s=makeSession();
 assert.equal(projectJinwooFalna(s.player.jinwoo!).total.strength,3);
 const n=applyOrarioPlayerAction(s,{
  kind:"reconcile_chroma_kandiaru_blessing",playerApproved:true,
  args:{confirmPreexistingKandiaruBlessing:true}},src,"D3 19:21");
 assert.equal(projectJinwooFalna(n).total.strength,38);
 assert.equal(n.stats.strength,26);
 assert.equal(n.storyFlags.includes("status.kasaka_weakened_muscles_35"),false);
 assert.ok(n.storyFlags.includes("status.kasaka_armor_scales_20"));
 assert.ok(n.storyFlags.includes("blessing.kandiaru_poison_immunity"));
 assert.equal(n.xp,s.player.jinwoo!.xp);
 assert.equal(n.gold,s.player.jinwoo!.gold);
 assert.equal(n.hp,s.player.jinwoo!.hp);
 assert.equal(n.mp,s.player.jinwoo!.mp);
 assert.deepEqual(n.inventory,s.player.jinwoo!.inventory);
 s.player.jinwoo=n;
 assert.throws(()=>applyOrarioPlayerAction(s,{
  kind:"reconcile_chroma_kandiaru_blessing",playerApproved:true,
  args:{confirmPreexistingKandiaruBlessing:true}},src,"D3 19:21"),
  /CORRECTION_UNVERIFIED/);
});
test("unproved or other-campaign attempts cannot claim blessing repair",()=>{
 const bad=makeSession(false);
 assert.throws(()=>applyOrarioPlayerAction(bad,{
  kind:"reconcile_chroma_kandiaru_blessing",playerApproved:true,
  args:{confirmPreexistingKandiaruBlessing:true}},src,"D3 19:21"),
  /CORRECTION_UNVERIFIED/);
 const other=makeSession();other.projectId="unrelated_campaign";
 assert.throws(()=>applyOrarioPlayerAction(other,{
  kind:"reconcile_chroma_kandiaru_blessing",playerApproved:true,
  args:{confirmPreexistingKandiaruBlessing:true}},src,"D3 19:21"),
  /CORRECTION_UNVERIFIED/);
});
