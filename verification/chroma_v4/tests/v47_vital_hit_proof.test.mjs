import test from 'node:test';
import assert from 'node:assert/strict';
import {scopedVitalProofRef,validScopedVitalProof} from '../../../src/rpg_lab_v1/v47_vital_hit_proof.ts';
const target={sourceRef:'combat.exchange.1',encounterStartedRef:'battle.f9.ant1',
 enemyRef:'monster.ant.01',monsterId:'killer_ant',targetLocation:'head',
 vitalTarget:'brain',hasMagicStone:true};
test('real attack and enemy produce replay-stable bounded vital evidence',()=>{
 const proof=scopedVitalProofRef(target);
 assert.match(proof,/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/);
 assert.equal(validScopedVitalProof(proof,target),true);
});
test('same token cannot be reused for another monster, battle or attack',()=>{
 const proof=scopedVitalProofRef(target);
 assert.equal(validScopedVitalProof(proof,{...target,enemyRef:'monster.ant.02'}),false);
 assert.equal(validScopedVitalProof(proof,{...target,encounterStartedRef:'battle.f9.ant2'}),false);
 assert.equal(validScopedVitalProof(proof,{...target,sourceRef:'combat.exchange.2'}),false);
});
test('a proof for the head does not authorize heart, location or magic core',()=>{
 const proof=scopedVitalProofRef(target);
 assert.equal(validScopedVitalProof(proof,{...target,vitalTarget:'heart',targetLocation:'chest'}),false);
 assert.equal(validScopedVitalProof(proof,{...target,targetLocation:'torso'}),false);
 assert.equal(validScopedVitalProof(proof,{...target,vitalTarget:'magic_stone',targetLocation:'core'}),false);
});
test('nonexistent System magic stones cannot be used for lethal strike',()=>{
 assert.throws(()=>scopedVitalProofRef({...target,monsterId:'system.kasaka',
  vitalTarget:'magic_stone',targetLocation:'core',hasMagicStone:false}),/EVIDENCE_INVALID/);
});
test('synthetic target locations and bad proof ids reject',()=>{
 assert.throws(()=>scopedVitalProofRef({...target,targetLocation:'indefinite_organ'}),/EVIDENCE_INVALID/);
 assert.equal(validScopedVitalProof('fake.proof',target),false);
});
