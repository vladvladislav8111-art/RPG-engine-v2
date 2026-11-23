import test from "node:test";
import assert from "node:assert/strict";
import {newJinwooPreparation} from "../src/rpg_lab_v1/shadow_monarch_rules.ts";
import {FIRST_INSTANT_CANON_ROUTE,FIRST_INSTANT_CANON_RULES,
 SYSTEM_ENCOUNTER_DEFS,verifySystemDungeonBossEvidence} from
 "../src/rpg_lab_v1/orario_system_encounters.ts";
import {ORARIO_MONSTER_BY_ID,commitBalancedMonsterDefeat,
 comparePlayerToOrarioMonster} from "../src/rpg_lab_v1/danmachi_player_balance.ts";
import {startConfirmedOrarioBattle} from "../src/rpg_lab_v1/orario_player_combat.ts";
import {SYSTEM_MONSTER_DROPS} from "../src/rpg_lab_v1/orario_player_loot.ts";
import {useConfirmedInstantReturnCrystal} from
 "../src/rpg_lab_v1/system_dungeon_keys.ts";
import {validateOrarioPlayerState} from "../src/rpg_lab_v1/orario_player_validation.ts";

const entered=()=>{
 const s=newJinwooPreparation();
 s.dungeonKeys["instant.first"]={id:"instant.first",
  issuedRef:"test.instant.key.001",state:"entered",
  entryLocationRef:"test.instant.entry.001"};
 return s;
};

test("Hapjeong has documented wolf, Briga/Razan, and Kasaka stages, not direct leap to boss",()=>{
 assert.deepEqual(FIRST_INSTANT_CANON_ROUTE.map(z=>z.stage),[1,2,3]);
 assert.deepEqual(FIRST_INSTANT_CANON_ROUTE.map(z=>z.monsters),[
  ["system.dungeon_wolf"],["system.razan","system.briga"],["system.kasaka"]]);
 assert.equal(SYSTEM_ENCOUNTER_DEFS["system.razan"].stage,2);
 assert.equal(SYSTEM_ENCOUNTER_DEFS["system.briga"].stage,2);
 assert.equal(SYSTEM_ENCOUNTER_DEFS["system.kasaka"].stage,3);
 assert.equal(ORARIO_MONSTER_BY_ID["system.razan"].magicStoneValis,0);
 assert.equal(ORARIO_MONSTER_BY_ID["system.briga"].magicStoneValis,0);
 assert.ok(ORARIO_MONSTER_BY_ID["system.briga"].features.includes("атака с потолка"));
 assert.ok(ORARIO_MONSTER_BY_ID["system.razan"].features.includes("нападение с земли"));
});

test("second level foes can be fought only within the first earned instance",()=>{
 const locked=newJinwooPreparation();
 for(const monsterId of ["system.briga","system.razan"])
  assert.throws(()=>startConfirmedOrarioBattle(locked,{
   sourceRef:"test.denied."+monsterId,monsterId,
   monsterRef:"test.enemy."+monsterId,floor:7,
   playerCommitted:true,confirmedHostile:true
  }),/SYSTEM_INSTANCE_NOT_ENTERED/);
 const inside=entered();
 const b=startConfirmedOrarioBattle(inside,{
  sourceRef:"test.enter.briga",monsterId:"system.briga",
  monsterRef:"test.briga.001",floor:7,
  playerCommitted:true,confirmedHostile:true});
 assert.equal(b.activeEncounter?.enemyHp,ORARIO_MONSTER_BY_ID["system.briga"].hp);
 assert.equal(inside.activeEncounter,undefined);
});

test("title Wolf Slayer is earned from distinct confirmed wolf deaths only",()=>{
 let s=entered();
 const original=structuredClone(s);
 assert.equal(FIRST_INSTANT_CANON_RULES.wolfSlayerEarnedAtUniqueWolves,10);
 for(let i=0;i<9;i++){
  s=commitBalancedMonsterDefeat(s,{
   sourceRef:"wolf.reward."+i,monsterId:"system.dungeon_wolf",
   monsterRef:"wolf.target."+i,floor:7,killer:"player",confirmedDefeat:true});
  assert.equal(s.storyFlags.includes("title.wolf_slayer"),false);
 }
 assert.equal(original.defeatedTargetRefs.length,0);
 s=commitBalancedMonsterDefeat(s,{
  sourceRef:"wolf.reward.9",monsterId:"system.dungeon_wolf",
  monsterRef:"wolf.target.9",floor:7,killer:"player",confirmedDefeat:true});
 assert.equal(s.storyFlags.filter(x=>x==="title.wolf_slayer").length,1);
 assert.equal(Object.keys(s.defeatEvidence??{}).length,10);
 const unowned=structuredClone(s);
 unowned.storyFlags=unowned.storyFlags.filter(x=>x!=="title.wolf_slayer");
 const withTitle=comparePlayerToOrarioMonster(s,{monsterId:"system.kasaka",
  floor:7}).player;
 const without=comparePlayerToOrarioMonster(unowned,{monsterId:"system.kasaka",
  floor:7}).player;
 assert.equal(withTitle.strength,Math.round(without.strength*1.4));
 assert.equal(withTitle.agility,Math.round(without.agility*1.4));
 assert.deepEqual(comparePlayerToOrarioMonster(s,{
  monsterId:"goblin",floor:1}).player,
  comparePlayerToOrarioMonster(unowned,{monsterId:"goblin",floor:1}).player);
 assert.deepEqual(s.stats,unowned.stats,"title never changes permanent System points");
 assert.throws(()=>commitBalancedMonsterDefeat(s,{
  sourceRef:"wolf.reward.10",monsterId:"system.dungeon_wolf",
  monsterRef:"wolf.target.9",floor:7,killer:"player",confirmedDefeat:true}));
 validateOrarioPlayerState(s);
});

test("non-boss defeats never clear first dungeon, and return crystal not fabricated",()=>{
 let s=entered();
 s=commitBalancedMonsterDefeat(s,{
  sourceRef:"mob.ra.001",monsterId:"system.razan",
  monsterRef:"enemy.ra.001",floor:7,confirmedDefeat:true,killer:"player"});
 s=commitBalancedMonsterDefeat(s,{
  sourceRef:"mob.br.001",monsterId:"system.briga",
  monsterRef:"enemy.br.001",floor:7,confirmedDefeat:true,killer:"player"});
 assert.equal(verifySystemDungeonBossEvidence(s,"instant.first"),false);
 assert.equal(s.inventory.instant_return_crystal??0,0);
 assert.ok(SYSTEM_MONSTER_DROPS["system.dungeon_wolf"]
  .some(x=>x.id==="instant_return_crystal"));
 assert.throws(()=>useConfirmedInstantReturnCrystal(s,{
  sourceRef:"return.cheat",confirmedUse:true,playerApproved:true
 }),/INSTANT_RETURN_CRYSTAL_NOT_AVAILABLE/);
 s.inventory.instant_return_crystal=1; // separately recovered confirmed drop
 const returned=useConfirmedInstantReturnCrystal(s,{
  sourceRef:"return.authorized",confirmedUse:true,playerApproved:true});
 assert.equal(returned.dungeonKeys["instant.first"].state,"retreated");
 assert.equal(returned.inventory.instant_return_crystal??0,0);
 assert.equal(returned.dungeonKeys["instant.first"].completionRef,
  "return.authorized");
 assert.equal(verifySystemDungeonBossEvidence(returned,"instant.first"),false);
 validateOrarioPlayerState(returned);
 assert.throws(()=>startConfirmedOrarioBattle(returned,{
  sourceRef:"return.no.reentry",monsterId:"system.briga",
  monsterRef:"return.no.reentry.enemy",floor:7,
  playerCommitted:true,confirmedHostile:true
 }),/SYSTEM_INSTANCE_NOT_ENTERED/);
 assert.equal(s.dungeonKeys["instant.first"].state,"entered",
  "return must be immutable and authorized");
});
