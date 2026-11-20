import test from "node:test";
import assert from "node:assert/strict";
import {newJinwooPreparation} from "../src/rpg_lab_v1/shadow_monarch_rules.ts";
import {recordConfirmedMonsterDrop,SYSTEM_MONSTER_DROPS} from
 "../src/rpg_lab_v1/orario_player_loot.ts";
import {ORARIO_MONSTER_BALANCE} from "../src/rpg_lab_v1/danmachi_player_balance.ts";
import {SYSTEM_ENCOUNTER_MOBS} from "../src/rpg_lab_v1/orario_system_encounters.ts";
test("bonus tables cover each supported local monster without guaranteed S-rank keys",()=>{
 const monsters=[...ORARIO_MONSTER_BALANCE,...SYSTEM_ENCOUNTER_MOBS].map(m=>m.id);
 assert.deepEqual(monsters.sort(),Object.keys(SYSTEM_MONSTER_DROPS).sort());
 for(const table of Object.values(SYSTEM_MONSTER_DROPS)){
  assert.ok(table.reduce((sum,x)=>sum+x.weight,0)<=100);
  assert.ok(table.every(x=>x.weight>0&&!x.id.includes("dungeon_key")));
 }
});
test("rare drop is deterministic, non-guaranteed and independently earned from magic stones",()=>{
 const s=newJinwooPreparation();
 s.defeatedTargetRefs.push("mob.goblin.claimed");
 const a=recordConfirmedMonsterDrop(s,{
  sourceRef:"evt.search.goblin.1",monsterId:"goblin",
  monsterRef:"mob.goblin.claimed",confirmedDefeat:true,confirmedSearch:true});
 const b=recordConfirmedMonsterDrop(s,{
  sourceRef:"evt.search.goblin.2",monsterId:"goblin",
  monsterRef:"mob.goblin.claimed",confirmedDefeat:true,confirmedSearch:true});
 assert.equal(a.roll,b.roll);
 assert.equal(a.itemId,b.itemId);
 assert.equal(a.next.systemDropRefs?.length,1);
 assert.equal(Object.keys(a.next.magicStones).length,0);
 assert.throws(()=>recordConfirmedMonsterDrop(a.next,{
  sourceRef:"evt.search.goblin.again",monsterId:"goblin",
  monsterRef:"mob.goblin.claimed",confirmedDefeat:true,confirmedSearch:true
 }),/DROP_NOT_EARNED/);
 assert.equal(s.systemDropRefs,undefined);
});
test("cannot claim loot from a defeated enemy who only exists in narration",()=>{
 const s=newJinwooPreparation();
 assert.throws(()=>recordConfirmedMonsterDrop(s,{
  sourceRef:"evt.made.up",monsterId:"goliath_17",
  monsterRef:"monster.not.defeated",confirmedDefeat:true,confirmedSearch:true
 }),/DROP_NOT_EARNED/);
});
