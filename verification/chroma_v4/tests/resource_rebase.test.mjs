import test from 'node:test';
import assert from 'node:assert/strict';
import {previewResourceRebase,chromaMaxResources} from '../../../src/rpg_lab_v1/resource_rebase.ts';
const falna={divineLevel:1,current:{strength:47,endurance:31,dexterity:81,agility:96,magic:0},sealedLayers:[]};
const stats={strength:26,stamina:26,agility:32,perception:26,intelligence:22};
test('new resources cannot exceed max: Chroma Lv8 full HP and partial MP',()=>{
 const r=previewResourceRebase({systemLevel:8,systemStats:stats,falna,
  oldHp:3219,oldMaxHp:3219,oldMp:245,oldMaxMp:274});
 assert.equal(r.proposed.maxHp,2119);
 assert.equal(r.proposed.hp,2119);
 assert.equal(r.proposed.maxMp,186);
 assert.equal(r.proposed.mp,166);
 assert.ok(r.noFreeHealing && r.requiresAtomicMigration);
});
test('wounded players retain damage percentage, not get free heal on migration',()=>{
 const r=previewResourceRebase({systemLevel:8,systemStats:stats,falna,
  oldHp:1600,oldMaxHp:3200,oldMp:50,oldMaxMp:100});
 assert.equal(r.proposed.hp,1060);
 assert.equal(r.proposed.mp,93);
 assert.equal(r.ratios.hp,.5);
});
test('bad legacy resource ratios cannot produce impossible state',()=>{
 assert.throws(()=>previewResourceRebase({systemLevel:8,systemStats:stats,falna,
  oldHp:300,oldMaxHp:200,oldMp:30,oldMaxMp:50}),/BOUNDS/);
 assert.throws(()=>chromaMaxResources(0,stats),/LEVEL_INVALID/);
});
