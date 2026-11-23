/** Small, manually transcribed read-only subset of the Chroma D4 13:44
 * authoritative audit, revision 788. NOT a full KV snapshot or backup.
 * No live writes occur in this test. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {previewResourceRebase} from '../../../src/rpg_lab_v1/resource_rebase.ts';
import {stageChromaV4} from '../../../src/rpg_lab_v1/legacy_lab_adapter.ts';
const audit={revision:788,gameClock:'D4 13:44',systemLevel:8,xp:820,gold:1020,
 valis:82920,hp:3219,mp:245,fatigue:2.9999999999999996,freeStatPoints:0,
 stats:{strength:26,stamina:26,agility:32,perception:26,intelligence:22},
 falna:{blessed:true,godId:'npc.loki',divineLevel:1,
  lastUpdatedRef:'chroma.d3_loki_falna_update_and_signed_papers_deal.666',
  status:{strength:47,endurance:31,dexterity:81,agility:96,magic:0},skills:[]},
 inventory:{potion_mp_small:2,daily_status_recovery_charge:2,
  chocolate_cake_whole:1,ointment_burn:1,kasaka_fang:1,steel_dagger:1,
  system_daily_handkerchief:1,jagamarkun_potato_ball:7}};
const partialSave=()=>({...structuredClone(audit),storyFlags:[],
 unlockedSkills:['sprint','quicksilver','dagger_mastery','combat_evasion'],
 appliedRewardRefs:['confirmed.mock.001'],defeatedTargetRefs:['defeated.mock.001']});
test('live v3.6 subset: D4 Lv8 Falna 1 preserves inventory and all currency through staging',()=>{
 const s=partialSave(),before=structuredClone(s),next=stageChromaV4(s);
 assert.equal(next.valis,82920);assert.equal(next.gold,1020);
 assert.equal(next.systemLevel,8);assert.equal(next.xp,820);
 assert.deepEqual(next.inventory,s.inventory);
 assert.deepEqual(next.appliedRewardRefs,s.appliedRewardRefs);
 assert.deepEqual(next.defeatedTargetRefs,s.defeatedTargetRefs);
 assert.deepEqual(next.falna,s.falna);
 assert.deepEqual(s,before);
});
test('live v3.6 subset: resource migration uses server formula and never fabricates HP',()=>{
 const s=partialSave(); const staged=stageChromaV4(s);
 // V3.6 effectiveJinwooMaxMp(current) = 306 from the checked-in source.
 // This is NOT a HUD-confirmed max; the real migration must recalculate it.
 const r=previewResourceRebase({systemLevel:s.systemLevel,systemStats:s.stats,
  falna:staged.layeredFalnaV4,oldHp:s.hp,oldMaxHp:3219,
  oldMp:s.mp,oldMaxMp:306});
 assert.deepEqual(r.proposed,{hp:2119,maxHp:2119,mp:149,maxMp:186});
 assert.equal(r.noFreeHealing,true);
});
test('the previous 274 MP maximum is not assumed for actual live migration',()=>{
 const actual=partialSave();
 const p=previewResourceRebase({systemLevel:actual.systemLevel,systemStats:actual.stats,
  falna:stageChromaV4(actual).layeredFalnaV4,
  oldHp:actual.hp,oldMaxHp:3219,oldMp:actual.mp,oldMaxMp:306});
 const stale=previewResourceRebase({systemLevel:actual.systemLevel,systemStats:actual.stats,
  falna:stageChromaV4(actual).layeredFalnaV4,
  oldHp:actual.hp,oldMaxHp:3219,oldMp:actual.mp,oldMaxMp:274});
 assert.notEqual(p.proposed.mp,stale.proposed.mp);
});
