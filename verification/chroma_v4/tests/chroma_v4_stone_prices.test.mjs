import {test} from 'node:test';
import assert from 'node:assert/strict';
import {quoteChromaV4Stone} from '../../../src/rpg_lab_v1/chroma_v4_stone_prices.ts';

test('Chroma v4 prices are read from approved catalog, not old Linos defaults',()=>{
 const c=quoteChromaV4Stone({monsterId:'orc',sizePct:100,saturationPct:100,integrityPct:100});
 assert.equal(c.baseValis,5450);
 assert.equal(c.valis,5450);
 assert.equal(c.pricingModel,'chroma_bestiary_v2');
});
test('high level priced stone can exceed legacy 10m ceiling',()=>{
 const c=quoteChromaV4Stone({monsterId:'balor',sizePct:100,saturationPct:100,integrityPct:100});
 assert.equal(c.valis,10530000);
});
test('quality and damaged stone retained, no random price backfill',()=>{
 const c=quoteChromaV4Stone({monsterId:'goblin',sizePct:200,saturationPct:140,integrityPct:25});
 assert.equal(c.valis,Math.floor(180*2*1.4*(.25**1.25)));
 const destroyed=quoteChromaV4Stone({monsterId:'goblin',sizePct:100,saturationPct:100,integrityPct:0});
 assert.equal(destroyed.valis,0);
});
test('system enemies have no local DanMachi stone price',()=>{
 assert.throws(()=>quoteChromaV4Stone({monsterId:'sl_igris',sizePct:100,saturationPct:100,integrityPct:100}),/NO_DANMACHI/);
});
test('no arbitrary new price or quality outside verified range',()=>{
 assert.throws(()=>quoteChromaV4Stone({monsterId:'orc',sizePct:201,saturationPct:100,integrityPct:100}),/QUALITY/);
 assert.throws(()=>quoteChromaV4Stone({monsterId:'unknown_god',sizePct:100,saturationPct:100,integrityPct:100}),/BASE_VALUE/);
});
