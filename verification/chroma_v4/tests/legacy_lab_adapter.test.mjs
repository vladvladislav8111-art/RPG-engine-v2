import test from 'node:test';
import assert from 'node:assert/strict';
import {stageChromaV4,toV4Player,applyV4Defeat,applyV4Recovery,applyV4GodStatus}
 from '../../../src/rpg_lab_v1/legacy_lab_adapter.ts';
const stats={strength:26,stamina:26,agility:32,perception:26,intelligence:22};
const falna={blessed:true,godId:'npc.loki',divineLevel:1,lastUpdatedRef:'god.init',
 status:{strength:47,endurance:31,dexterity:81,agility:96,magic:0},skills:[]};
const base=()=>({systemLevel:8,xp:820,gold:1020,stats:{...stats},
 freeStatPoints:0,hp:3219,mp:245,fatigue:3,appliedRewardRefs:['old.reward'],
 defeatedTargetRefs:['old.ant'],falna:structuredClone(falna),storyFlags:['chroma_falna_v2','title.wolf_slayer'],
 inventory:{kasaka_fang:1,steel_dagger:1},mysteryCampaignData:{relations:{loki:4}}});
const proof={battleProofRef:'source.defeat.ant.1',participationProofRef:'source.participation.ant.1',
 defeatConfirmedByJournal:true,participationConfirmedByJournal:true};
const host={getRecordedRoll:()=>0.99,verifyJournalProof:()=>true,
 getRestoredResources:p=>({hp:Math.max(p.hp,100),mp:Math.max(p.mp,30)})};
test('migration preserves every old stat, quest, inventory, flag and proof',()=>{
 const before=base(),after=stageChromaV4(before);
 for(const key of ['systemLevel','xp','gold','freeStatPoints','hp','mp','fatigue'])
  assert.equal(after[key],before[key]);
 for(const key of ['stats','inventory','mysteryCampaignData','defeatedTargetRefs','appliedRewardRefs'])
  assert.deepEqual(after[key],before[key]);
 assert.deepEqual(before.storyFlags,['chroma_falna_v2','title.wolf_slayer']);
 assert.equal(after.layeredFalnaV4.current.agility,96);
 assert.equal(toV4Player(after).activeTitle,'wolf_slayer');
 assert.throws(()=>stageChromaV4(after),/ALREADY_STAGED/);
});
test('non-migrated save rejects reward writes',()=>{
 assert.throws(()=>toV4Player(base()),/NOT_ACTIVATED/);
});
test('verified defeat awards system, preserves original legacy fields, not stones',()=>{
 const s=stageChromaV4(base());
 const out=applyV4Defeat(s,{sourceRef:'reward.ant.1',targetRef:'new.ant.1',monsterId:'killer_ant',
  systemLevel:8,spawnMode:'natural',floor:8,evidence:proof},host);
 assert.ok(out.receipt.system.xp>0);
 assert.equal(out.next.defeatEvidence['new.ant.1'].monsterId,'killer_ant');
 assert.deepEqual(out.next.inventory,s.inventory);
 assert.equal(out.next.chromaV4Meta.recoveredStones.length,0);
 assert.ok(out.next.defeatedTargetRefs.includes('new.ant.1'));
 assert.throws(()=>applyV4Defeat(out.next,{sourceRef:'reward.ant.2',targetRef:'new.ant.1',
  monsterId:'killer_ant',systemLevel:8,spawnMode:'natural',floor:8,evidence:proof},host),/DUPLICATE/);
});
test('physical loot requires separate verified action; no extra gold',()=>{
 const s=stageChromaV4(base());
 const out=applyV4Defeat(s,{sourceRef:'reward.ant.1',targetRef:'new.ant.1',
  monsterId:'killer_ant',systemLevel:8,spawnMode:'natural',floor:8,evidence:proof},host);
 const a=applyV4Recovery(out.next,{sourceRef:'search.ant.1',targetRef:'new.ant.1',
  monsterId:'killer_ant',stoneSurvived:true,searchProofRef:'proof.search.1'},
  {isConfirmedDefeat:()=>true,verifySearchProof:()=>true,getRecordedMaterialRoll:()=>.99});
 assert.equal(a.next.gold,out.next.gold);
 assert.ok(a.potentialValis>0);
 assert.equal(a.next.chromaV4Meta.recoveredStones.length,1);
 assert.throws(()=>applyV4Recovery(a.next,{sourceRef:'search.ant.2',targetRef:'new.ant.1',
  monsterId:'killer_ant',stoneSurvived:true,searchProofRef:'proof.search.2'},
  {isConfirmedDefeat:()=>true,verifySearchProof:()=>true,getRecordedMaterialRoll:()=>.99}),/ALREADY_PROCESSED/);
});
test('Falna progress does not amplify older levels; rank-up seals a layer',()=>{
 let s=stageChromaV4(base());
 const upgraded={strength:500,endurance:500,dexterity:500,agility:990,magic:0};
 s=applyV4GodStatus(s,{sourceRef:'god.update.2',godId:'npc.loki',godConfirmed:true,
  newStatus:upgraded},()=>true);
 assert.equal(s.falna.status.agility,990);
 s=applyV4GodStatus(s,{sourceRef:'god.rank.2',godId:'npc.loki',godConfirmed:true,
  newStatus:upgraded,levelUpFeatRef:'feat.first_breakthrough'},()=>true);
 assert.equal(s.falna.divineLevel,2);
 assert.equal(s.falna.status.agility,0);
 assert.equal(s.layeredFalnaV4.sealedLayers[0].earned.agility,990);
 s=applyV4GodStatus(s,{sourceRef:'god.level2.progress',godId:'npc.loki',godConfirmed:true,
  newStatus:{strength:60,endurance:30,dexterity:40,agility:400,magic:0}},()=>true);
 assert.throws(()=>applyV4GodStatus(s,{sourceRef:'god.bad',godId:'npc.loki',
  godConfirmed:true,newStatus:{strength:60,endurance:30,dexterity:40,agility:390,magic:0}},()=>true),/CANNOT_DECREASE/);
});
test('Falna rank-up rejects fake feat, keeps old state intact',()=>{
 const s=stageChromaV4(base());
 assert.throws(()=>applyV4GodStatus(s,{sourceRef:'god.rank.fake',godId:'npc.loki',
  godConfirmed:true,newStatus:{strength:900,endurance:900,dexterity:900,agility:900,magic:0},
  levelUpFeatRef:'feat.fake'},()=>false),/FEAT_UNVERIFIED/);
 assert.equal(s.falna.divineLevel,1);
});
test('old reward reference and lost evidence cannot be reused',()=>{
 const s=stageChromaV4(base());
 assert.throws(()=>applyV4Defeat(s,{sourceRef:'old.reward',targetRef:'new.ant.3',
  monsterId:'killer_ant',systemLevel:8,spawnMode:'natural',floor:8,evidence:proof},host),/DUPLICATE/);
 assert.throws(()=>applyV4Defeat(s,{sourceRef:'reward.bad.1',targetRef:'new.ant.3',
  monsterId:'killer_ant',systemLevel:8,spawnMode:'natural',floor:8,evidence:proof},
  {...host,verifyJournalProof:()=>false}),/NOT_CONFIRMED/);
});
const {applyV4RuneStudy}=await import('../../../src/rpg_lab_v1/legacy_lab_adapter.ts');
test('A proven System rune is learned once by a distinct confirmed action',()=>{
 const s=stageChromaV4(base());
 s.chromaV4Meta.runeStones.stealth=1;
 const studied=applyV4RuneStudy(s,{sourceRef:'rune.study.1',skillId:'stealth',playerConfirmed:true});
 assert.deepEqual(studied.chromaV4Meta.runeStones,{});
 assert.ok(studied.unlockedSkills.includes('stealth'));
 assert.ok(studied.chromaV4Meta.learnedSkills.includes('stealth'));
 assert.equal(s.chromaV4Meta.runeStones.stealth,1);
 assert.throws(()=>applyV4RuneStudy(studied,{sourceRef:'rune.study.2',skillId:'stealth',playerConfirmed:true}),/NOT_AUTHORIZED/);
});
test('Cannot consume arbitrary or unowned skill rune',()=>{
 const s=stageChromaV4(base());
 assert.throws(()=>applyV4RuneStudy(s,{sourceRef:'rune.bad.1',skillId:'tiny_backflip_bonus',playerConfirmed:true}),/NOT_AUTHORIZED/);
 assert.throws(()=>applyV4RuneStudy(s,{sourceRef:'rune.bad.2',skillId:'mana_barrier',playerConfirmed:true}),/NOT_OWNED/);
});
