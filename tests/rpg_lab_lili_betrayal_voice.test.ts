import test from "node:test";
import assert from "node:assert/strict";
import {buildDanmachiCanonCast} from "../src/rpg_lab_v1/danmachi_cast.ts";

test("Lili's betrayal reveal is aggressively defensive, not a polite confession",()=>{
 const cast=buildDanmachiCanonCast();
 const lili=cast["npc.lili"],bell=cast["npc.bell"];
 const raw=JSON.stringify(lili);
 assert.ok(lili.traits.some(t=>/резк|язвител|злопамят/.test(t)));
 assert.ok(lili.responsePatterns?.betrayal_exposed?.[0].emotion.includes("злость и стыд"));
 assert.ok(lili.responsePatterns?.rescued_after_betrayal?.[0].emotion.includes("оскорбляет"));
 assert.ok(lili.responsePatterns?.reconciled?.[0].emotion.includes("язвительная"));
 assert.ok(lili.voice?.verbalTics.some(s=>/идиот/.test(s)));
 assert.ok(lili.voice?.avoidCaricature.some(s=>/не превращать разоблачение/.test(s)));
 assert.ok(raw.includes("третьим лицом"));
 assert.ok(bell.responsePatterns?.betrayal_exposed?.[0].emotion.includes("обижен"));
 assert.ok(bell.responsePatterns?.rescued_after_betrayal?.[0].emotion.includes("неуклюжую"));
 assert.ok(bell.responsePatterns?.rescued_after_betrayal?.[0].motive.includes("именно Лили"));
});
