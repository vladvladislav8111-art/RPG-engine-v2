import test from 'node:test';
import assert from 'node:assert/strict';
import {childRuneVictoryRef} from '../../../src/rpg_lab_v1/reward_child_refs_v46.ts';
const REF=/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/;
test('rune victory refs stay legal at maximum parent length',()=>{
 const p='a'.repeat(80);
 for(const mode of ['direct','dot']){
  const c=childRuneVictoryRef(p,mode);
  assert.ok(REF.test(c));assert.ok(c.length<=80);
  assert.equal(c,childRuneVictoryRef(p,mode));
 }
});
test('two modes and changed parents cannot reuse same reward key',()=>{
 const p='chroma.test.'.padEnd(80,'a');
 const q=p.slice(0,79)+'b';
 assert.notEqual(childRuneVictoryRef(p,'direct'),childRuneVictoryRef(p,'dot'));
 assert.notEqual(childRuneVictoryRef(p,'direct'),childRuneVictoryRef(q,'direct'));
});
test('invalid parent refs fail closed',()=>{
 assert.throws(()=>childRuneVictoryRef(' bad','direct'),/V46_VICTORY_PARENT_REF_INVALID/);
 assert.throws(()=>childRuneVictoryRef('a'.repeat(81),'dot'),/V46_VICTORY_PARENT_REF_INVALID/);
});
