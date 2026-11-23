import test from "node:test";
import assert from "node:assert/strict";
import {newJinwooPreparation} from "../src/rpg_lab_v1/shadow_monarch_rules.ts";
import {previewBalancedMonsterReward,ORARIO_MONSTER_BY_ID} from
 "../src/rpg_lab_v1/danmachi_player_balance.ts";
import {applyOrarioPlayerAction} from "../src/rpg_lab_v1/orario_player_event.ts";
import type {LabSession} from "../src/rpg_lab_v1/session.ts";

const razanKill="chroma.d3_b2_razan_quicksilver_combo_6.554";
const brigaKill="chroma.d3_b2_briga_close_combo_7.563";
const source="chroma.repair.d3_razan_reward_28xp.584";
function session(valid=true):LabSession{
 const p=newJinwooPreparation();
 p.systemLevel=7;p.xp=1459;
 p.defeatedTargetRefs=["chroma.instant.razan.01","chroma.instant.briga.01"];
 p.defeatEvidence={
  "chroma.instant.razan.01":{monsterId:"system.razan",
   sourceRef:razanKill,floor:7},
  "chroma.instant.briga.01":{monsterId:"system.briga",
   sourceRef:brigaKill,floor:7}
 };
 return {
  schema:"RPG_LAB_SESSION_V1",
  projectId:"chroma_orario_main_20261120",
  sessionId:"chroma_day0_20261120",
  gameClock:"D3 18:24",
  player:{resources:{},stats:{},inventory:{},jinwoo:p,
   hero:{id:"hero.chroma"},locationId:"orario.dungeon.upper"},
  discovered:[],npcs:{},
  events:[{sourceRef:razanKill},{sourceRef:valid?brigaKill:"not.proof"}]
 } as unknown as LabSession;
}

test("Razan awards strictly more XP than Briga at Chroma's level",()=>{
 const s=session().player.jinwoo!;
 const a=previewBalancedMonsterReward(s,{monsterId:"system.razan",
  floor:7,monsterRef:"test.razan.001"});
 const b=previewBalancedMonsterReward(s,{monsterId:"system.briga",
  floor:7,monsterRef:"test.briga.001"});
 assert.equal(a.xp,83);assert.equal(b.xp,65);assert.ok(a.xp>b.xp);
 assert.ok(ORARIO_MONSTER_BY_ID["system.razan"].hp>
  ORARIO_MONSTER_BY_ID["system.briga"].hp);
 assert.ok(ORARIO_MONSTER_BY_ID["system.razan"].systemThreatLevel>
  ORARIO_MONSTER_BY_ID["system.briga"].systemThreatLevel);
});

test("prior confirmed Razan kill obtains exactly 28 historical XP difference once",()=>{
 const s=session();
 const r=applyOrarioPlayerAction(s,{kind:"reconcile_chroma_razan_xp",
  playerApproved:true,args:{confirmRazanRewardReview:true}},
  source,"D3 18:24");
 assert.equal(r.xp,1487);
 assert.equal(r.gold,s.player.jinwoo!.gold);
 assert.equal(r.hp,s.player.jinwoo!.hp);
 assert.equal(r.mp,s.player.jinwoo!.mp);
 assert.deepEqual(r.defeatedTargetRefs,s.player.jinwoo!.defeatedTargetRefs);
 assert.ok(r.appliedRewardRefs.includes(source));
 s.player.jinwoo=r;
 assert.throws(()=>applyOrarioPlayerAction(s,{
  kind:"reconcile_chroma_razan_xp",playerApproved:true,
  args:{confirmRazanRewardReview:true}},source,"D3 18:24"),
  /CORRECTION_NOT_PROVEN/);
});
test("unproven or wrong campaign cannot steal Razan compensation",()=>{
 const bad=session(false);
 assert.throws(()=>applyOrarioPlayerAction(bad,{
  kind:"reconcile_chroma_razan_xp",playerApproved:true,
  args:{confirmRazanRewardReview:true}},source,"D3 18:24"),
  /CORRECTION_NOT_PROVEN/);
 const wrong=session();
 wrong.projectId="not_chroma_campaign";
 assert.throws(()=>applyOrarioPlayerAction(wrong,{
  kind:"reconcile_chroma_razan_xp",playerApproved:true,
  args:{confirmRazanRewardReview:true}},source,"D3 18:24"),
  /CORRECTION_NOT_PROVEN/);
});
