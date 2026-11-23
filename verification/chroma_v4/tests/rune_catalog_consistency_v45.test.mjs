import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';
import {RUNE_SKILLS} from '../../../src/rpg_lab_v1/rune_abilities_v45.ts';
import {CATALOG_RUNE_SKILL_IDS,catalogSummary,resolveMonsterFromCatalog}
 from '../../../src/rpg_lab_v1/verified_bestiary_gateway.ts';
import {v4RuneReceipt} from '../../../src/rpg_lab_v1/v4_rune_drop.ts';
const full=JSON.parse(fs.readFileSync(new URL('../../../src/data/bestiary_v2.json',import.meta.url),'utf8'));
const combat=JSON.parse(fs.readFileSync(new URL('../../../src/data/monster_adapter_v4.json',import.meta.url),'utf8'));
test('Removed Iguasú runestone from every live candidate data source while retaining the monster',()=>{
 const iguazu=combat.monsters.find(x=>x.id==='iguazu');assert.ok(iguazu);
 assert.equal(iguazu.rune,null);
 assert.equal(full.runes.some(x=>x.monster_id==='iguazu'),false);
 assert.equal(full.cards.find(x=>x.id==='iguazu')['руна_навыка'],null);
 assert.equal(Object.hasOwn(CATALOG_RUNE_SKILL_IDS,'iguazu'),false);
 assert.equal(v4RuneReceipt({monsterId:'iguazu',sourceRef:'proof.1',targetRef:'iguazu.1'}),null);
});
test('Exactly 13 rune sources and their learned skills have concrete execution contracts',()=>{
 assert.equal(full.runes.length,13);
 assert.equal(combat.monsters.filter(x=>x.rune).length,13);
 assert.equal(catalogSummary().runeSources,13);
 for(const c of combat.monsters.filter(x=>x.rune)){
  const skill=CATALOG_RUNE_SKILL_IDS[c.id];assert.ok(skill,c.id);
  assert.ok(RUNE_SKILLS[skill],`missing runtime effect: ${skill}`);
  assert.equal(RUNE_SKILLS[skill].source,c.id);
  assert.ok(c.rune.percent>=.4||c.rune.percent===100,c.id);
 }
 assert.equal(RUNE_SKILLS.rulers_authority.source,'evolution');
});
test('Igris grants initial Touch, not final Authority, through unique instance gate',()=>{
 const c=combat.monsters.find(x=>x.id==='sl_igris');
 assert.equal(CATALOG_RUNE_SKILL_IDS.sl_igris,'rulers_touch');
 assert.equal(c.rune.percent,100);
 assert.throws(()=>resolveMonsterFromCatalog({monsterId:'sl_igris',systemLevel:c.systemLevelMin,
  spawnMode:'natural',floor:1}),/NATURAL_SPAWN_FORBIDDEN/);
});
