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
 assert.ok(lili.responsePatterns?.reconciled?.[0].emotion.includes("язвит"));
 assert.ok(lili.voice?.verbalTics.some(s=>/идиот/.test(s)));
 assert.ok(lili.voice?.avoidCaricature.some(s=>/не превращать разоблачение/.test(s)));
 assert.ok(raw.includes("третьим лицом"));
 assert.ok(bell.responsePatterns?.betrayal_exposed?.[0].emotion.includes("обижен"));
 assert.ok(bell.responsePatterns?.rescued_after_betrayal?.[0].emotion.includes("неуклюжую"));
 assert.ok(bell.responsePatterns?.rescued_after_betrayal?.[0].motive.includes("именно Лили"));
});

test("after the rescue Lili distinguishes Ais jealousy, ordinary glance and private thoughts",()=>{
 const cast=buildDanmachiCanonCast();
 const lili=cast["npc.lili"];
 const patterns=lili.responsePatterns!;
 const ais=patterns.bell_ais_blush[0];
 const stranger=patterns.bell_beautiful_stranger[0];
 const privateThought=patterns.bell_private_thought[0];
 assert.match(ais.emotion,/ревнует/);
 assert.match(ais.motive,/Айз/);
 assert.match(ais.condition!,/видела его смущение/);
 assert.match(stranger.emotion,/насмешливо/);
 assert.match(stranger.condition!,/действительно заметила/);
 assert.match(privateThought.emotion,/не знает о мыслях/);
 assert.match(privateThought.condition!,/думает об Айз молча/);
 assert.notEqual(ais.emotion,stranger.emotion);
 assert.ok(lili.voice?.sampleLines.some(x=>x.includes("хватит таращиться")));
});
