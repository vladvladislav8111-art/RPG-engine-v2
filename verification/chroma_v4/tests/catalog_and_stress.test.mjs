import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {xpForDefeat,xpToNextLevel,nextSystemLevel} from '../../../src/rpg_lab_v1/crossover_core.ts';
const data=JSON.parse(fs.readFileSync(new URL('../../../src/data/monster_adapter_v4.json',import.meta.url),'utf8'));
const raw=JSON.parse(fs.readFileSync(new URL('../../../src/data/bestiary_v2.json',import.meta.url),'utf8'));
test('Catalog: all 156 entries represented and every combat card structurally usable',()=>{
 assert.equal(data.monsters.length+data.storyOnly.length,156);
 assert.equal(data.monsters.length,135);
 assert.equal(new Set(data.monsters.map(x=>x.id)).size,data.monsters.length);
 for (const c of data.monsters) {
  assert.ok(c.systemLevelMin>0&&c.systemLevelMax>=c.systemLevelMin,c.id);
  assert.ok(c.baseXp>0&&c.baseGold>=0,c.id);
  assert.ok(c.priceMagicStoneValis===null || c.priceMagicStoneValis>0,c.id);
  if(c.rune)assert.ok(c.rune.percent>0&&c.rune.percent<=100,c.id);
 }
});
test('Natural spawning never uses story-only records or boss without trigger',()=>{
 for(const c of data.storyOnly)assert.ok(!data.monsters.some(x=>x.id===c));
 for(const c of data.monsters.filter(x=>x.canSpawnNaturally)){
  assert.ok(!['босс','легенда'].includes(c.kind),c.id);
 }
});
test('All 135 cards × 101 player levels have finite XP and do not break invariants',()=>{
 let n=0;
 for(const c of data.monsters){
  for(let l=1;l<=101;l++){
   const e=xpForDefeat(c.baseXp,Math.floor((c.systemLevelMin+c.systemLevelMax)/2),l);
   assert.ok(Number.isSafeInteger(e) && e>=1,`${c.id}@${l}`);
   if(Math.floor((c.systemLevelMin+c.systemLevelMax)/2)-l<=-20)assert.equal(e,1);
   n++;
  }
 }
 assert.equal(n,135*101);
});
test('One or two weak Goblins do not award unrealistic many levels',()=>{
 const p={systemLevel:8,xp:0,gold:0,stats:{strength:20,stamina:20,agility:20,perception:20,intelligence:20},freeStatPoints:0,hp:500,mp:100,fatigue:0,confirmedDefeats:[],confirmedRewardRefs:[],titleIds:[],activeTitle:null,runeIds:[]};
 const goblin=data.monsters.find(c=>c.id==='goblin');
 const e=xpForDefeat(goblin.baseXp,goblin.systemLevelMax,8);
 const r=nextSystemLevel(p,e*2,()=>({hp:500,mp:100}));
 assert.equal(r.player.systemLevel,8);
});
test('XP cost monotonic from level 1 through level 1000',()=>{
 let prev=0;
 for(let n=1;n<=1000;n++){const cur=xpToNextLevel(n);assert.ok(cur>prev);prev=cur;}
});
test('Only listed runes may appear on cards, never invent broad skill chance',()=>{
 const allowed=new Set(raw.runes.map(x=>x.monster_id));
 for(const c of data.monsters){
  if(c.rune)assert.ok(allowed.has(c.id));
 }
});
