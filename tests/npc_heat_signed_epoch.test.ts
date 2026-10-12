import assert from "node:assert/strict";
import {
  auditSignedNpcEpoch,signedEpochRecordDigest,
  type SignedEpochRow,type SignedEpochAuditInput,
} from "../src/npc_heat_signed_epoch.ts";
import {signNpcHeatOriginV3} from "../src/npc_heat_origin_v3.ts";

const keyId="test-2026-epoch-key";
const secret="TEST_ONLY_EPOCH_SIGNING_SECRET_2026_0123456789";
const epochId="TEST-EPOCH-A";
async function createRows(count:number,kind:
  "SCENE_PRESENCE"|"MEANINGFUL_RELATIONSHIP_EVENT"=
  "MEANINGFUL_RELATIONSHIP_EVENT",
):Promise<SignedEpochRow[]>{
  const rows:SignedEpochRow[]=[];
  for(let i=0;i<count;i++){
    const txId="TEST-EPOCH-TX-"+i;
    const day=50+i;
    const at="Day"+day+" 12:00:00";
    const sceneId="scene.test";
    const sourceRef=kind==="SCENE_PRESENCE"?
      "scene:"+sceneId:"memory:day-"+day;
    const actorId="npc.synthetic";
    const receipt={
      eventId:[txId,actorId,kind,sourceRef].join("|"),
      txId,actorId,kind,sourceRef,sceneId,day,time:"12:00:00",
      committed:true,
      counterpartIds:["player.shura"],
      meaningfulEvidence:"A documented, important two-way discussion about a shared commitment.",
    };
    const previousDigest=rows.length?
      await signedEpochRecordDigest(rows[rows.length-1]):"GENESIS";
    const frame={
      saveTo:"TEST-S"+(10+i),turnId:"TEST-TURN-"+i,txId,
      inworldStart:at,inworldEnd:at,sceneId,source:"ENGINE_FASTPATH",
      worldAdvancesJson:JSON.stringify({
        engineNpcReceiptEpoch:"TEST_ONLY_V3",
        engineNpcReceiptChain:{epochId,sequence:i,previousDigest},
        engineNpcAttentionReceipts:[receipt],
      }),
    };
    rows.push({frame,stateHash:await signNpcHeatOriginV3(frame,keyId,secret)});
  }
  return rows;
}
function packet(rows:SignedEpochRow[]):SignedEpochAuditInput{
  return {
    epochId,sourceSaveId:rows.at(-1)?.frame.saveTo??"TEST-S0",
    snapshotStable:true,indexTxIds:rows.map(r=>r.frame.txId),
    rows,keyId,secret,
  };
}
Deno.test("valid HMAC chain is a bounded candidate, never historical/KEY proof",async()=>{
  const rows=await createRows(6);
  const x=await auditSignedNpcEpoch(packet(rows));
  assert.equal(x.status,"SIGNED_SEGMENT_VALID_EXTERNAL_GENESIS_AND_CANON_REQUIRED");
  assert.equal(x.signedRows,6);
  assert.equal(x.meaningfulDayCount,6);
  assert.equal(x.meaningfulSocialDayCount,6);
  assert.equal(x.epochGenesisIndependentlyAnchored,false);
  assert.equal(x.sourceIndexIndependentlyAnchored,false);
  assert.equal(x.completeActorHistoryVerified,false);
  assert.equal(x.historyAuthenticatedForPromotion,false);
  assert.equal(x.automaticHeatPromotion,false);
  assert.equal(x.automaticKeyPromotion,false);
  assert.equal(x.automaticXpOrSupAward,false);
  assert.equal(x.committedWrites,0);
});
Deno.test("middle row dropped, reordered or duplicated fails closed",async()=>{
  const rows=await createRows(3);
  const p=packet(rows);
  assert.equal((await auditSignedNpcEpoch({
    ...p,rows:[rows[0],rows[2]],indexTxIds:[rows[0].frame.txId,rows[2].frame.txId],
  })).status,"EPOCH_GENESIS_OR_SEQUENCE_MISMATCH");
  assert.equal((await auditSignedNpcEpoch({
    ...p,rows:[rows[1],rows[0],rows[2]],
    indexTxIds:[rows[1].frame.txId,rows[0].frame.txId,rows[2].frame.txId],
  })).status,"EPOCH_GENESIS_OR_SEQUENCE_MISMATCH");
  assert.equal((await auditSignedNpcEpoch({
    ...p,indexTxIds:[rows[0].frame.txId,rows[0].frame.txId,rows[2].frame.txId],
  })).status,"DUPLICATE_OR_INVALID_TX_INDEX");
  assert.equal((await auditSignedNpcEpoch({
    ...p,indexTxIds:[rows[0].frame.txId],
  })).status,"MISSING_OR_TRUNCATED_TX_INDEX");
});
Deno.test("changing signed memory text, TX or scene fails HMAC/chain",async()=>{
  const rows=await createRows(2);
  const p=packet(rows),bad={...rows[1],
    frame:{...rows[1].frame,worldAdvancesJson:rows[1].frame.worldAdvancesJson+" "}};
  assert.equal((await auditSignedNpcEpoch({
    ...p,rows:[rows[0],bad],
  })).status,"INVALID_HMAC_OR_TAMPERED_ROW");
  const forged={...rows[1],frame:{...rows[1].frame,txId:"TEST-OTHER"}};
  assert.equal((await auditSignedNpcEpoch({
    ...p,rows:[rows[0],forged],indexTxIds:[rows[0].frame.txId,"TEST-OTHER"],
  })).status,"INVALID_HMAC_OR_TAMPERED_ROW");
  const wrongPrev=JSON.parse(rows[1].frame.worldAdvancesJson);
  wrongPrev.engineNpcReceiptChain.previousDigest="sha256:"+"a".repeat(64);
  const rewired={...rows[1],frame:{...rows[1].frame,
    worldAdvancesJson:JSON.stringify(wrongPrev)}};
  rewired.stateHash=await signNpcHeatOriginV3(rewired.frame,keyId,secret);
  assert.equal((await auditSignedNpcEpoch({...p,rows:[rows[0],rewired]})).status,
    "BROKEN_PREDECESSOR_PROOF");
});
Deno.test("stable read, signed scope, source index and signing key mandatory",async()=>{
  const rows=await createRows(1),p=packet(rows);
  assert.equal((await auditSignedNpcEpoch({...p,snapshotStable:false})).status,
    "UNSTABLE_SOURCE_SNAPSHOT");
  assert.equal((await auditSignedNpcEpoch({...p,secret:""})).status,
    "SIGNING_KEY_UNAVAILABLE");
  assert.equal((await auditSignedNpcEpoch({...p,sourceSaveId:"V2-S0795"})).status,
    "INVALID_TEST_EPOCH_SCOPE");
  assert.equal((await auditSignedNpcEpoch({...p,sourceSaveId:"TEST-S99"})).status,
    "TAIL_CONTROL_SAVE_MISMATCH");
  assert.equal((await auditSignedNpcEpoch({
    ...p,indexTxIds:Array(257).fill("TEST-EXCESS"),
  })).status,"MISSING_OR_TRUNCATED_TX_INDEX");
});
Deno.test("mere scene presence on six days does not become meaningful history",async()=>{
  const rows=await createRows(6,"SCENE_PRESENCE");
  const result=await auditSignedNpcEpoch(packet(rows));
  assert.equal(result.signedRows,6);
  assert.equal(result.meaningfulDayCount,0);
  assert.equal(result.meaningfulSocialDayCount,0);
  assert.equal(result.automaticKeyPromotion,false);
});
