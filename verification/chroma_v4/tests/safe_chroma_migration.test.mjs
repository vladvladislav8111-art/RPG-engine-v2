import test from 'node:test';
import assert from 'node:assert/strict';
import {previewChromaMigration} from '../../../src/rpg_lab_v1/safe_chroma_migration.ts';
const stats={strength:26,stamina:26,agility:32,perception:26,intelligence:22};
const falna={strength:47,endurance:31,dexterity:81,agility:96,magic:0};
const base=()=>({systemLevel:8,xp:820,gold:1020,freeStatPoints:12,stats:{...stats},hp:3219,mp:245,fatigue:3,
 appliedRewardRefs:['earned.1'],defeatedTargetRefs:['killer.ant.1'],
 falna:{blessed:true,godId:'npc.loki',divineLevel:1,status:{...falna},skills:[],lastUpdatedRef:'loki.update.1'},
 inventory:{steel_dagger:1,kasaka_fang:1},storyFlags:['blessing.kandiaru_poison_immunity']});
test('Lv1 migration never fabricates historic Falna layers',()=>{
 const source=base();const result=previewChromaMigration(source);
 assert.equal(result.safeToCommit,false);
 assert.equal(result.candidate.layeredFalnaV4.sealedLayers.length,0);
 assert.deepEqual(result.falnaBonus,{strength:4,stamina:3,agility:9,perception:8,intelligence:0});
 assert.equal(result.candidate.hp,3219);
 assert.equal(result.candidate.mp,245);
 assert.deepEqual(result.candidate.defeatedTargetRefs,['killer.ant.1']);
 assert.deepEqual(result.candidate.inventory,{steel_dagger:1,kasaka_fang:1});
 assert.equal(source.layeredFalnaV4,undefined);
});
test('Prior Falna levels require verified earned status; cannot invent layer values',()=>{
 const s=base();s.falna.divineLevel=2;
 assert.throws(()=>previewChromaMigration(s),/HISTORICAL_FALNA/);
 const earned={strength:990,endurance:500,dexterity:0,agility:0,magic:0};
 const history=[{level:1,earned,sealed:true,featRef:'feat.loki.lv2'}];
 const migrated=previewChromaMigration(s,history);
 assert.equal(migrated.falnaBonus.strength,99+8);
 assert.equal(migrated.falnaBonus.stamina,50+6);
});
test('Malformed saves and repeated migrations fail closed',()=>{
 assert.throws(()=>previewChromaMigration({...base(),xp:-1}),/NUMERIC_STATE/);
 const m=previewChromaMigration(base());
 assert.throws(()=>previewChromaMigration(m.candidate),/ALREADY_MIGRATED/);
});
