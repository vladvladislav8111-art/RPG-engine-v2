import assert from "node:assert/strict";
import {hash32} from "../src/rng.ts";
import {auditNpcHeatJournal,planNpcHeatJournalWindow} from "../src/npc_heat_journal_audit.ts";
const h=["Save ID","Turn ID","TX ID","Inworld start","Inworld end",
"Scene ID","Action summary","Deltas JSON","New canon JSON","World advances JSON",
"Notes","Committed at","Ruleset version","State hash","Source","Version"];
const s="scene.test",tx="tx.test",save="V2-S1234",end="Day67 17:30:00";
const event={eventId:"tx.test|npc.vesha|MEANINGFUL_RELATIONSHIP_EVENT|memory:m1",
 actorId:"npc.vesha",txId:tx,sourceRef:"memory:m1",sceneId:s,day:67,
 time:"17:30:00",kind:"MEANINGFUL_RELATIONSHIP_EVENT",committed:true,
 counterpartIds:["player.shura"],meaningfulEvidence:"Documented meaningful interaction with Shura."};
function row(receipts:unknown[]=[event]) {
 const r=Array(16).fill("");
 r[0]=save;r[1]="T1";r[2]=tx;r[3]="Day67 17:21:00";r[4]=end;r[5]=s;
 r[9]=JSON.stringify({engineNpcAttentionReceipts:receipts});
 r[13]=hash32([save,end,s,tx].join("|")).toString(16);
 r[14]="ENGINE_FASTPATH";r[15]=1;return r;
}
function audit(r:unknown[]=row(),options:Record<string,unknown>={}) {
 return auditNpcHeatJournal({sourceSaveId:save,worldDay:67,worldTime:"17:31:00",
 stableAfterRead:true,requestedActorIds:["npc.vesha"],
 index:[["TX ID"],[tx]],header:h,rowStart:2,rows:[r],...options});
}
Deno.test("bounded TX-only index never scans more than 128 full-width journal rows",()=>{
 const idx=[["TX ID"],...Array.from({length:440},(_,i)=>["tx."+i])];
 const w=planNpcHeatJournalWindow(idx);
 assert.equal(w.startRow,314);assert.equal(w.endRow,441);
 assert.equal(w.truncated,true);
 assert.throws(()=>planNpcHeatJournalWindow([["wrong"],[tx]]),/HEADER/);
});
Deno.test("envelope-consistent candidate is reported without promotion or false authentication",()=>{
 const r=audit();
 assert.equal(r.status,"COMPLETE_WINDOW_NOT_FULL_HISTORY");
 assert.equal(r.receipts.length,1);assert.equal(r.candidateCount,1);
 assert.equal(r.verifiedForTierPromotion,false);assert.equal(r.historyComplete,false);
 assert.equal(r.contentHashAuthenticated,false);assert.equal(r.semanticWrites,0);
});
Deno.test("altering scene, day, actor or TX source rejects entire receipt candidate batch",()=>{
 const tests=[{...event,sceneId:"scene.false"},
 {...event,day:66},{...event,actorId:"npc.fake"},
 {...event,txId:"tx.other"},{...event,sourceRef:"memory:fake"}];
 for(const e of tests) assert.equal(audit(row([e])).status,"MALFORMED_OR_CROSS_TX_RECEIPT");
});
Deno.test("hash mismatch, forged source, duplicate TX or unstable CONTROL fails closed",()=>{
 const badHash=row();badHash[13]="abcdef";
 assert.equal(audit(badHash).status,"UNATTESTED_ENGINE_TX_ENVELOPE");
 const badSource=row();badSource[14]="META";
 assert.equal(audit(badSource).status,"UNATTESTED_ENGINE_TX_ENVELOPE");
 assert.equal(audit(row(),{index:[["TX ID"],[tx],[tx]]}).status,"INCOMPLETE_OR_SHIFTED_WINDOW");
 assert.equal(audit(row(),{stableAfterRead:false}).status,"CONTROL_SNAPSHOT_CHANGED");
});
Deno.test("duplicates, oversized receipt batch, malformed schema fail without partial evidence",()=>{
 assert.equal(audit(row([event,event])).status,"DUPLICATED_RECEIPT_EVENT_ID");
 assert.equal(audit(row(Array(49).fill(event))).status,"INVALID_ENGINE_RECEIPT_BATCH");
 assert.equal(audit(row(),{header:h.map(x=>x==="TX ID"?"wrong":x)}).status,"INVALID_JOURNAL_SCHEMA");
});
Deno.test("ordinary old semantic turns without Engine Heat receipts do not fabricate interactions",()=>{
 const r=row();r[9]=JSON.stringify({engineContinuity:[],npcLife:"mentioned"});
 const a=audit(r);assert.equal(a.candidateCount,0);assert.equal(a.receipts.length,0);
});
Deno.test("actor-scoped audit never accepts full crowds or unspecified actors",()=>{
 assert.equal(audit(row(),{requestedActorIds:[]}).status,"ACTOR_SCOPE_REQUIRED_OR_EXCEEDED");
 assert.equal(audit(row(),{requestedActorIds:Array(13).fill("npc.vesha")}).status,"ACTOR_SCOPE_REQUIRED_OR_EXCEEDED");
});
