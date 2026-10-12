/**
 * Pure TEST-only, future-oriented offline witness for a prospective NPC epoch.
 *
 * The out-of-band pinned digest and independent operator key are NOT fetched
 * here. Caller assertions cannot establish that either came from an authentic
 * independent source. This never alters or "signs" historical V1/V2 rows and
 * NEVER authorizes earned Heat, KEY, XP or SUP.
 */
import {
  auditSignedNpcEpoch,
  type SignedEpochAuditInput,
} from "./npc_heat_signed_epoch.ts";

export type ProspectiveEpochGenesis = {
  epochId:string;
  workbookId:string;
  priorCommittedSaveId:string;
  firstSaveTo:string;
  firstTxId:string;
  firstTurnId:string;
  firstInworldStart:string;
  signingKeyId:string;
  baselineControlDigest:string;
  baselineNpcMemoryDigest:string;
  keyRotationPolicy:"NO_ROTATION";
};
export type SignedEpochGenesis = {
  schema:"NPC_TEST_EPOCH_EXTERNAL_GENESIS_V1";
  operatorKeyId:string;
  fields:ProspectiveEpochGenesis;
  signature:string;
};
const TEST_SAVE=/^TEST-[a-z0-9._-]+$/i;
const EPOCH=/^TEST-[a-z0-9._-]{1,90}$/i;
const HEX=/^sha256:[a-f0-9]{64}$/;
const KID=/^[a-z0-9][a-z0-9._-]{2,63}$/i;
const encoder=new TextEncoder();
function asBuffer(text:string):ArrayBuffer {
  const a=encoder.encode(text);
  const buf=new ArrayBuffer(a.length);
  new Uint8Array(buf).set(a);
  return buf;
}
function hasFields(f:ProspectiveEpochGenesis):boolean {
  return EPOCH.test(f.epochId)&&!!f.workbookId&&f.workbookId.length<=160 &&
    TEST_SAVE.test(f.priorCommittedSaveId)&&TEST_SAVE.test(f.firstSaveTo)&&
    f.firstSaveTo!==f.priorCommittedSaveId &&
    f.firstTxId.startsWith("TEST-")&&f.firstTxId.length<=160 &&
    f.firstTurnId.startsWith("TEST-")&&f.firstTurnId.length<=160 &&
    /^Day\d+ (?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(f.firstInworldStart) &&
    KID.test(f.signingKeyId)&&HEX.test(f.baselineControlDigest)&&
    HEX.test(f.baselineNpcMemoryDigest)&&f.keyRotationPolicy==="NO_ROTATION";
}
function body(fields:ProspectiveEpochGenesis,operatorKeyId:string):ArrayBuffer {
  return asBuffer(JSON.stringify([
    "NPC_TEST_EPOCH_GENESIS_OPERATOR_HMAC_SHA256_V1",operatorKeyId,
    fields.epochId,fields.workbookId,fields.priorCommittedSaveId,
    fields.firstSaveTo,fields.firstTxId,fields.firstTurnId,
    fields.firstInworldStart,fields.signingKeyId,
    fields.baselineControlDigest,fields.baselineNpcMemoryDigest,
    fields.keyRotationPolicy,
  ]));
}
async function key(secret:string,usage:KeyUsage):Promise<CryptoKey>{
  return await crypto.subtle.importKey("raw",encoder.encode(secret),
    {name:"HMAC",hash:"SHA-256"},false,[usage]);
}
function hex(a:ArrayBuffer):string {
  return Array.from(new Uint8Array(a)).map(x=>x.toString(16).padStart(2,"0")).join("");
}
export async function signProspectiveTestGenesis(
  fields:ProspectiveEpochGenesis,operatorKeyId:string,operatorSecret:string,
):Promise<SignedEpochGenesis> {
  if(!hasFields(fields)||!KID.test(operatorKeyId)||
     operatorKeyId===fields.signingKeyId||encoder.encode(operatorSecret).length<32)
    throw Error("TEST_EPOCH_GENESIS_INVALID_OR_NOT_INDEPENDENT");
  const signature=hex(await crypto.subtle.sign("HMAC",
    await key(operatorSecret,"sign"),body(fields,operatorKeyId)));
  return {
    schema:"NPC_TEST_EPOCH_EXTERNAL_GENESIS_V1",
    operatorKeyId,fields:{...fields},signature:"hmac-sha256:"+signature,
  };
}
export async function prospectiveGenesisPin(
  anchor:SignedEpochGenesis,
):Promise<string> {
  return "sha256:"+hex(await crypto.subtle.digest("SHA-256",
    asBuffer(JSON.stringify([
      "NPC_TEST_EPOCH_OUT_OF_BAND_PIN_V1",anchor.schema,anchor.operatorKeyId,
      Array.from(new Uint8Array(body(anchor.fields,anchor.operatorKeyId))),
      anchor.signature,
    ]))));
}
export async function verifyProspectiveTestGenesis(input:{
  anchor:SignedEpochGenesis;
  externallyPinnedDigest:string;
  operatorSecret:string;
  expectedTestWorkbookId:string;
  expectedEpochId:string;
  rowSigningSecret:string;
  segment:SignedEpochAuditInput;
}){
  const fail=(status:string)=>({
    schema:"NPC_TEST_EPOCH_GENESIS_AUDIT_V1" as const,
    mode:"READ_ONLY_OFFLINE_WITNESS_REVIEW" as const,status,
    segmentSignedRows:0,
    externallyAuthenticatedOrigin:false as const,
    completePastHistoryAuthenticated:false as const,
    canonicalMemoryIndependentlyCorroborated:false as const,
    allowedAutomaticHeatPromotion:false as const,
    allowedAutomaticKeyPromotion:false as const,
    allowedAutoUnlock:false as const,
    committedWrites:0 as const,
  });
  const {anchor:a,segment:s}=input;
  if(a?.schema!=="NPC_TEST_EPOCH_EXTERNAL_GENESIS_V1" ||
     !hasFields(a.fields)||!KID.test(a.operatorKeyId) ||
     a.operatorKeyId===a.fields.signingKeyId ||
     !HEX.test(input.externallyPinnedDigest))
    return fail("INVALID_WITNESS_FRAME");
  if(!input.expectedTestWorkbookId||
     a.fields.workbookId!==input.expectedTestWorkbookId||
     a.fields.epochId!==input.expectedEpochId||
     s.epochId!==a.fields.epochId||
     s.keyId!==a.fields.signingKeyId||
     s.secret!==input.rowSigningSecret)
    return fail("WRONG_TEST_SCOPE_OR_SIGNING_KEY_ID");
  if(input.operatorSecret===input.rowSigningSecret ||
     encoder.encode(input.operatorSecret).length<32||
     encoder.encode(input.rowSigningSecret).length<32)
    return fail("INDEPENDENT_OPERATOR_KEY_REQUIRED");
  if(!/^hmac-sha256:[a-f0-9]{64}$/.test(a.signature))
    return fail("INVALID_WITNESS_SIGNATURE");
  if(await prospectiveGenesisPin(a)!==input.externallyPinnedDigest)
    return fail("OUT_OF_BAND_PIN_MISMATCH");
  let match=false;
  try {
    const sig=Uint8Array.from({length:32},(_,i)=>
      parseInt(a.signature.slice(12+i*2,14+i*2),16));
    match=await crypto.subtle.verify("HMAC",
      await key(input.operatorSecret,"verify"),sig,
      body(a.fields,a.operatorKeyId));
  }catch{return fail("WITNESS_KEY_INVALID");}
  if(!match)return fail("WITNESS_HMAC_MISMATCH");
  const first=s.rows[0]?.frame;
  if(!first||first.saveTo!==a.fields.firstSaveTo ||
     first.txId!==a.fields.firstTxId||
     first.turnId!==a.fields.firstTurnId ||
     first.inworldStart!==a.fields.firstInworldStart ||
     s.indexTxIds[0]!==first.txId)
    return fail("FIRST_TX_NOT_ANCHORED");
  const segmentResult=await auditSignedNpcEpoch(s);
  if(segmentResult.status!=="SIGNED_SEGMENT_VALID_EXTERNAL_GENESIS_AND_CANON_REQUIRED")
    return fail("SEGMENT_REJECTED_"+segmentResult.status);
  // A caller can supply both the pin and keys. Authentic independent
  // provenance of that pin + memory + TX index remains unverified here.
  return {
    ...fail("WITNESSED_CANDIDATE_REQUIRES_EXTERNAL_SOURCE_VERIFICATION"),
    segmentSignedRows:segmentResult.signedRows,
  };
}
