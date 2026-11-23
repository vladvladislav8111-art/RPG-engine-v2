import test from 'node:test';
import assert from 'node:assert/strict';
import {currentActionProofRef,confirmCurrentPlayerAction,confirmHistoricProof} from '../../../src/rpg_lab_v1/v47_action_proofs.ts';
const active={projectId:'chroma_orario_main_20261120',sessionId:'chroma_day0_20261120',
 heroId:'hero.chroma',actionKind:'rune_cast',requestedKind:'rune_cast',
 sourceRef:'rune.action.1',playerApproved:true};
test('ordinary rune cast is authorized by its own CAS event, no prior synthetic proof',()=>{
 const proofRef=currentActionProofRef(active.sourceRef,'rune_cast');
 assert.equal(confirmCurrentPlayerAction({...active,proofRef}),true);
});
test('title equipment can be independently authorized as a player choice',()=>{
 const proofRef=currentActionProofRef(active.sourceRef,'equip_title');
 assert.equal(confirmCurrentPlayerAction({...active,proofRef,actionKind:'equip_title',requestedKind:'equip_title'}),true);
});
test('a 80-character legal action ID generates a short bounded proof reference',()=>{
 const ref='x'.repeat(80);const proof=currentActionProofRef(ref,'rune_cast');
 assert.match(proof,/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/);
 assert.equal(confirmCurrentPlayerAction({...active,sourceRef:ref,proofRef:proof}),true);
});
test('proof cannot be reused for a different action, player or campaign',()=>{
 const proofRef=currentActionProofRef(active.sourceRef,'rune_cast');
 assert.equal(confirmCurrentPlayerAction({...active,proofRef,requestedKind:'equip_title'}),false);
 assert.equal(confirmCurrentPlayerAction({...active,proofRef,playerApproved:false}),false);
 assert.equal(confirmCurrentPlayerAction({...active,proofRef,sessionId:'shura'}),false);
 assert.equal(confirmCurrentPlayerAction({...active,proofRef,heroId:'hero.other'}),false);
 assert.equal(confirmCurrentPlayerAction({...active,proofRef,sourceRef:'rune.action.2'}),false);
});
test('forged client proof override is invalid',()=>{
 assert.equal(confirmCurrentPlayerAction({...active,proofRef:'journal.forced.001'}),false);
 assert.throws(()=>currentActionProofRef('bad/id','rune_cast'),/EVENT_INVALID/);
});
test('historical feat proof must be a prior same-kind event, not future',()=>{
 const historical={proofRef:'feat.earned.001',sourceRef:'title.grant.002',
 proofKind:'title_grant_proof.unbroken',expectedKind:'title_grant_proof.unbroken',
 proofTime:'D4 13:42',actionTime:'D4 13:44'};
 assert.equal(confirmHistoricProof(historical),true);
 assert.equal(confirmHistoricProof({...historical,proofTime:'D4 13:45'}),false);
 assert.equal(confirmHistoricProof({...historical,proofKind:'title_grant_proof.giant_feller'}),false);
 assert.equal(confirmHistoricProof({...historical,proofRef:historical.sourceRef}),false);
 assert.equal(confirmHistoricProof({...historical,proofTime:'D4 invalid'}),false);
});
test('nonexistent prior proof does not become valid via current action token',()=>{
 const current=currentActionProofRef('rune.action.1','rune_cast');
 assert.equal(confirmHistoricProof({proofRef:current,sourceRef:'title.grant.002',
 proofKind:'rune_cast',expectedKind:'title_grant_proof.unbroken',
 proofTime:'D4 13:42',actionTime:'D4 13:44'}),false);
});
