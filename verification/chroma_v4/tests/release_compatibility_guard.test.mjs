import test from 'node:test';
import assert from 'node:assert/strict';
import {auditLegacyMonsters,readProjectedMonsterReward,checkCampaignIdentity}
 from '../../../src/rpg_lab_v1/release_compatibility_guard.ts';
const ant={id:'killer_ant',systemThreatLevel:8,baseXp:116,baseSystemGold:84,
 magicStoneValis:130,hp:260,armor:9,floorMin:5};
test('legacy reward base is recognized but outdated stone quote blocks integration',()=>{
 const report=auditLegacyMonsters([ant]);
 assert.equal(report.compatible,false);
 assert.ok(report.conflicts.some(x=>x.reason==='stone_value'));
});
test('dangerous monsters cannot be migrated by simply increasing their XP',()=>{
 const goliath={id:'goliath_17',systemThreatLevel:32,baseXp:2450,
 baseSystemGold:2100,magicStoneValis:7500,hp:15000,armor:40,floorMin:17};
 const report=auditLegacyMonsters([goliath]);
 assert.ok(report.conflicts.some(x=>x.reason==='threat_level_range'));
 assert.ok(report.conflicts.some(x=>x.reason==='stone_value'));
});
test('high-threat XP from catalog has no artificial maximum',()=>{
 const result=readProjectedMonsterReward('goliath_17',50,8);
 assert.ok(result.xp>100_000);
 assert.ok(result.potentialStoneValis>1_000_000);
});
test('only an explicit Chroma session can use the bridge',()=>{
 const valid={projectId:'orario_chroma',sessionId:'chroma_run_1',
  packProjectId:'orario_chroma',sessionProjectId:'orario_chroma',heroId:'hero.chroma'};
 assert.equal(checkCampaignIdentity(valid),true);
 for(const changes of [{packProjectId:'shura_legacy'},
  {heroId:'hero.shura'},{sessionProjectId:'different'},{projectId:'../../shura'}])
  assert.throws(()=>checkCampaignIdentity({...valid,...changes}),/WRONG_CAMPAIGN/);
});
