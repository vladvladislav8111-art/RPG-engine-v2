/**
 * Future TEST-only signed NPC history-chain verifier (never a promotion gate).
 *
 * Source index and epoch-start provenance must be independently attested.
 * The caller provides candidate input only; this function cannot establish
 * that older rows were not omitted before the provided first row.
 *
 * An exact, HMAC-authenticated predecessor chain makes edits/reordering/gaps
 * evident WITHIN the supplied contiguous segment. It does not authorize KEY
 * promotion, earn Heat or validate social memory truth.
 */
import {
  verifyNpcHeatOriginV3, type NpcHeatOriginFrame,
} from "./npc_heat_origin_v3.ts";

export type SignedEpochRow = {
  frame: NpcHeatOriginFrame;
  stateHash: string;
};
export type SignedEpochAuditInput = {
  epochId: string;
  sourceSaveId: string;
  snapshotStable: boolean;
  indexTxIds: readonly string[];
  rows: readonly SignedEpochRow[];
  keyId: string;
  secret: string;
};
const MAX_ROWS = 256;
const EPOCH = /^TEST-[A-Za-z0-9._-]{1,90}$/;
const ACTOR = /^npc\.[a-z0-9_.-]+$/i;
const TS = /^Day\s*(\d+)\s+(\d{1,2}):(\d{2}):(\d{2})$/;
type ChainMarker = { epochId:string; sequence:number; previousDigest:string };
function parseMoment(m:string):number|null {
  const x=TS.exec(m);
  if(!x)return null;
  const d=Number(x[1]),h=Number(x[2]),min=Number(x[3]),sec=Number(x[4]);
  return Number.isSafeInteger(d)&&d>=1&&h<24&&min<60&&sec<60 ?
    d*86400+h*3600+min*60+sec : null;
}
function hex(buffer:ArrayBuffer):string {
  return [...new Uint8Array(buffer)].map(v=>v.toString(16).padStart(2,"0")).join("");
}
export async function signedEpochRecordDigest(row:SignedEpochRow):Promise<string>{
  const text=JSON.stringify([
    "NPC_HEAT_TEST_SIGNED_CHAIN_V1",row.frame.txId,row.stateHash,
    row.frame.worldAdvancesJson,
  ]);
  const data=new TextEncoder().encode(text);
  const out=new ArrayBuffer(data.byteLength);
  new Uint8Array(out).set(data);
  return "sha256:"+hex(await crypto.subtle.digest("SHA-256",out));
}
function result(code:string,signedRows=0,meaningfulDayCount=0,
  meaningfulSocialDayCount=0) {
  return {
    schema:"NPC_HEAT_TEST_SIGNED_CHAIN_AUDIT_V1" as const,
    mode:"READ_ONLY_CANDIDATE_SEGMENT" as const,
    status:code,signedRows,meaningfulDayCount,meaningfulSocialDayCount,
    sourceIndexIndependentlyAnchored:false as const,
    epochGenesisIndependentlyAnchored:false as const,
    completeActorHistoryVerified:false as const,
    canonicalNpcMemoryCorroborated:false as const,
    historyAuthenticatedForPromotion:false as const,
    automaticHeatPromotion:false as const,
    automaticKeyPromotion:false as const,
    automaticXpOrSupAward:false as const,
    committedWrites:0 as const,
  };
}
export async function auditSignedNpcEpoch(input:SignedEpochAuditInput){
  if(!input.snapshotStable)return result("UNSTABLE_SOURCE_SNAPSHOT");
  if(!EPOCH.test(input.epochId)||!EPOCH.test(input.sourceSaveId))
    return result("INVALID_TEST_EPOCH_SCOPE");
  if(input.indexTxIds.length===0||input.indexTxIds.length>MAX_ROWS||
    input.rows.length!==input.indexTxIds.length)
    return result("MISSING_OR_TRUNCATED_TX_INDEX");
  if(new Set(input.indexTxIds).size!==input.indexTxIds.length ||
    input.indexTxIds.some(id=>!id || id.length>160))
    return result("DUPLICATE_OR_INVALID_TX_INDEX");
  if(!input.secret || !input.keyId)
    return result("SIGNING_KEY_UNAVAILABLE");
  const days=new Set<number>(),socialDays=new Set<number>();
  let prev:SignedEpochRow|null=null, previousMoment:number|null=null;
  for(let i=0;i<input.rows.length;i++){
    const row=input.rows[i], frame=row?.frame;
    if(!frame || frame.txId!==input.indexTxIds[i] ||
       frame.source!=="ENGINE_FASTPATH" ||
       !EPOCH.test(frame.saveTo) || !frame.sceneId)
      return result("TX_INDEX_SOURCE_OR_SCOPE_MISMATCH");
    const start=parseMoment(frame.inworldStart),end=parseMoment(frame.inworldEnd);
    if(start===null||end===null||end<start ||
       (previousMoment!==null && start<previousMoment))
      return result("NONMONOTONIC_SIGNED_CLOCK");
    let payload:Record<string,unknown>;
    try{
      const parsed:unknown=JSON.parse(frame.worldAdvancesJson);
      if(!parsed||Array.isArray(parsed)||typeof parsed!=="object")
        return result("INVALID_SIGNED_CHAIN_PAYLOAD");
      payload=parsed as Record<string,unknown>;
    }catch{return result("INVALID_SIGNED_CHAIN_PAYLOAD");}
    const mark=payload.engineNpcReceiptChain as ChainMarker|undefined;
    if(payload.engineNpcReceiptEpoch!=="TEST_ONLY_V3" ||
       !mark||typeof mark!=="object"||
       mark.epochId!==input.epochId || mark.sequence!==i)
      return result("EPOCH_GENESIS_OR_SEQUENCE_MISMATCH");
    const previousDigest=prev?await signedEpochRecordDigest(prev):"GENESIS";
    if(mark.previousDigest!==previousDigest)
      return result("BROKEN_PREDECESSOR_PROOF");
    let sigOk=false;
    try{
      sigOk=await verifyNpcHeatOriginV3(
        frame,row.stateHash,input.keyId,input.secret);
    }catch{return result("SIGNED_ORIGIN_KEY_OR_SCOPE_INVALID");}
    if(!sigOk)return result("INVALID_HMAC_OR_TAMPERED_ROW");
    const receipts=payload.engineNpcAttentionReceipts;
    if(!Array.isArray(receipts)||receipts.length>48)
      return result("INVALID_NPC_RECEIPTS");
    for(const rec of receipts){
      if(!rec||Array.isArray(rec)||typeof rec!=="object")
        return result("INVALID_NPC_RECEIPT");
      const e=rec as Record<string,unknown>;
      const actor=String(e.actorId??""),kind=String(e.kind??""),
        sourceRef=String(e.sourceRef??"");
      const sameMoment=Number(e.day)===Math.floor(end/86400) &&
        parseMoment("Day"+String(e.day)+" "+String(e.time))===end;
      const kindOk=(kind==="SCENE_PRESENCE"&&
         sourceRef==="scene:"+frame.sceneId) ||
        (kind==="SUBSTANTIVE_EXCHANGE"&&sourceRef.startsWith("memory:")) ||
        (kind==="MEANINGFUL_RELATIONSHIP_EVENT"&&
          (sourceRef.startsWith("memory:")||sourceRef.startsWith("relation:")));
      if(!ACTOR.test(actor)||!kindOk||!sourceRef||sourceRef.length>512||
         e.committed!==true||e.txId!==frame.txId||
         e.sceneId!==frame.sceneId||!sameMoment||
         e.eventId!==[frame.txId,actor,kind,sourceRef].join("|"))
        return result("MALFORMED_SIGNED_NPC_RECEIPT");
      if((kind==="MEANINGFUL_RELATIONSHIP_EVENT"||
          kind==="SUBSTANTIVE_EXCHANGE") &&
         typeof e.meaningfulEvidence==="string" &&
         e.meaningfulEvidence.trim().length>=24){
        days.add(Number(e.day));
        if(kind==="MEANINGFUL_RELATIONSHIP_EVENT" &&
          Array.isArray(e.counterpartIds) &&
          e.counterpartIds.includes("player.shura"))
          socialDays.add(Number(e.day));
      }
    }
    previousMoment=end;prev=row;
  }
  if(input.rows[input.rows.length-1].frame.saveTo!==input.sourceSaveId)
    return result("TAIL_CONTROL_SAVE_MISMATCH");
  // The index and genesis are caller supplied and not externally rooted.
  // Even six signed meaningful days are NOT authorization for Heat/KEY.
  return result("SIGNED_SEGMENT_VALID_EXTERNAL_GENESIS_AND_CANON_REQUIRED",
    input.rows.length,days.size,socialDays.size);
}
