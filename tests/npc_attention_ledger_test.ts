import { assert, assertEquals, assertThrows } from "jsr:@std/assert";
import { deriveNpcAttentionReceipts, journalNpcAttentionReceipts,
 projectNpcHeatIndex, readNpcHeatIndex, NPC_HEAT_INDEX_COLUMNS } from "../src/npc_attention_ledger.ts";
Deno.test("NPC heat journals only grounded actor events, deduplicates replay, and ages without erasing depth",()=>{
  const make=(tx:string)=>deriveNpcAttentionReceipts({txId:tx,day:67,time:"17:23:00",
    sceneId:"scene.copy",knownNpcIds:["npc.test"],
    semantic:{session:{inworldStart:"Day67 17:20:00",actionSummary:"test"},
      sceneActorIds:["npc.test","npc.fake"],socialMemoryEvents:[{
        memoryId:"memory.1",participants:["npc.test","player.shura"],originEvent:"T1",
        meaning:"A documented significant mutual conversation from the committed event.",
        importance:"IMPORTANT",source:"test source",
      }] }});
  const receipts=make("TEST-T1");
  assertEquals(receipts.length,2);
  assertEquals(receipts.some(x=>x.actorId==="npc.fake"),false);
  const rows=[["TX ID","World advances JSON"],["TEST-T1",JSON.stringify({engineNpcAttentionReceipts:receipts})]];
  const saved=journalNpcAttentionReceipts(rows);
  assertEquals(saved.length,2);
  assertEquals(journalNpcAttentionReceipts([...rows,rows[1]]).length,2);
  const profile=projectNpcHeatIndex({actorId:"npc.test",importance:"RECURRING",
    day:67,time:"17:23:00",saveId:"TEST-S1",newReceipts:receipts,allReceipts:saved});
  assertEquals(profile.lastTx,"TEST-T1");
  assertEquals(profile.profileTier,1); // Same-scene contacts cannot farm a higher tier.
  const row=Object.fromEntries(NPC_HEAT_INDEX_COLUMNS.map(k=>[k,""])) as Record<string,unknown>;
  Object.assign(row,{"NPC ID":"npc.test","Profile Tier":profile.profileTier,
    "Last Relevant Day":67,"Last Relevant Time":"17:23:00",
    "Last Evidence TX":"TEST-T1","Last Stimulus JSON":JSON.stringify(profile.lastStimulus)});
  assertEquals(readNpcHeatIndex(row,67,"17:30:00","RECURRING","TEST-S1")?.activeTier,1);
  assertEquals(readNpcHeatIndex(row,68,"17:23:00","RECURRING","TEST-S2")?.activeTier,0);
  assertEquals(readNpcHeatIndex(row,68,"17:23:00","KEY","TEST-S2")?.activeTier,5);
  const collision=[...rows,["TEST-T1",JSON.stringify({engineNpcAttentionReceipts:
    [{...receipts[0],meaningfulEvidence:"changed"}]})]];
  assertThrows(()=>journalNpcAttentionReceipts(collision),Error,"NPC_HEAT_RECEIPT_COLLISION");
});
