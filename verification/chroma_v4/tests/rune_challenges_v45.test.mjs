import test from 'node:test';import assert from 'node:assert/strict';
import {RUNE_CHALLENGES,grantVerifiedChallengeRune} from '../../../src/rpg_lab_v1/rune_challenges_v45.ts';
import {studyRuneStone} from '../../../src/rpg_lab_v1/crossover_core.ts';
const player=()=>({systemLevel:8,xp:0,gold:0,stats:{strength:20,stamina:20,agility:20,perception:20,intelligence:20},
 freeStatPoints:0,hp:1000,mp:200,fatigue:0,confirmedDefeats:[],confirmedRewardRefs:[],
 titleIds:[],activeTitle:null,runeStones:{},learnedSkills:[]});
test('Only specific challenges reward important rare skills without 200 identical kills',()=>{
 assert.equal(Object.keys(RUNE_CHALLENGES).length,2);
 assert.equal(RUNE_CHALLENGES.papilio_rescue_trial.rune,'minor_healing');
 assert.equal(RUNE_CHALLENGES.carbuncle_guardian_trial.rune,'mana_barrier');
});
test('Challenge rune requires a saved verified completion and is not autolearned',()=>{
 const e={sourceRef:'reward.trial.1',proofRef:'proof.trial.1',challengeId:'papilio_rescue_trial'};
 const denied={challengeComplete:()=>false};
 assert.throws(()=>grantVerifiedChallengeRune(player(),e,denied),/NOT_EARNED/);
 const r=grantVerifiedChallengeRune(player(),e,{challengeComplete:()=>true});
 assert.equal(r.player.runeStones.minor_healing,1);
 assert.deepEqual(r.player.learnedSkills,[]);
 const learned=studyRuneStone(r.player,'minor_healing');
 assert.deepEqual(learned.learnedSkills,['minor_healing']);
 assert.equal(player().runeStones.minor_healing,undefined);
});
test('Each challenge is claimable once, even with a different sourceRef',()=>{
 const e={sourceRef:'claim.1',proofRef:'proof.1',challengeId:'carbuncle_guardian_trial'};
 const first=grantVerifiedChallengeRune(player(),e,{challengeComplete:()=>true});
 assert.throws(()=>grantVerifiedChallengeRune(first.player,{...e,sourceRef:'claim.2'},
  {challengeComplete:()=>true}),/NOT_EARNED/);
});
