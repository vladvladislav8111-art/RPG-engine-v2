/**
 * EC-06 isolated Google projection writer fence using primary Deno KV CAS.
 *
 * Fail-closed EXCLUSIVE lock. It has NO TTL. A crash leaves it HELD; it
 * deliberately cannot be stolen until verified external readback/manual
 * recovery policy is implemented. This protects cooperation among OUR KV
 * workers, not arbitrary Google editors. Do not wire it into production.
 */
import type { AtomicKvStore, KvKey } from "./economic_kv_atomic.ts";
import type { ExclusiveProjectionWriterFence } from "./economic_google_http_staging.ts";
type Target="TEMP_RUNTIME"|"LIVE_TRANSACTION_ARCHIVE";
export type GoogleProjectionLock = {
  schema:"EC06_GOOGLE_LOCK_V1";
  scopeId:string;
  target:Target;
  resourceId:string;
  token:string;
  state:"HELD"|"RELEASED";
  epoch:number;
  lastVerifiedProjectionRef?:string;
  /** Only indexed staging commits supply an immutable in-flight source. */
  pendingIndexedTxId?:string;
  pendingIndexedJournalHash?:string;
};
function lockKey(target:Target,resourceId:string):KvKey {
  return ["rpg-v2","ec06","google-unique-writer",target,resourceId];
}
export async function acquireGoogleProjectionFence(input:{
  kv:AtomicKvStore;scopeId:string;target:Target;resourceId:string;
  indexedIntent?:{txId:string;journalHash:string};
}):Promise<{
  fence:ExclusiveProjectionWriterFence;
  token:string;
  releaseAfterIndependentVerification:(verify:()=>Promise<string>)=>Promise<void>;
}> {
  const {kv,scopeId,target,resourceId,indexedIntent}=input;
  if(indexedIntent&&(!/^[a-z][a-z0-9._-]{2,179}$/i.test(indexedIntent.txId)||
    !/^[0-9a-f]{64}$/i.test(indexedIntent.journalHash)))
    throw Error("Only exact indexed primary journal hash can bind a held lock");
  if(!/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/i.test(scopeId))
    throw Error("Google projection scope must be an exact canonical namespace");
  if(!resourceId||resourceId.length>256)
    throw Error("Exact Google physical target ID required");
  const key=lockKey(target,resourceId);
  const prev=await kv.get<GoogleProjectionLock>(key);
  if(prev.value && (prev.value.schema!=="EC06_GOOGLE_LOCK_V1"||
     prev.value.scopeId!==scopeId||prev.value.target!==target||
     prev.value.state!=="RELEASED")){
    throw Error("Projection writer held by another worker; stop on uncertain outcome");
  }
  const token=crypto.randomUUID();
  const next:GoogleProjectionLock={
    schema:"EC06_GOOGLE_LOCK_V1",scopeId,target,resourceId,token,
    state:"HELD",epoch:(prev.value?.epoch??0)+1,
    ...(indexedIntent?{
      pendingIndexedTxId:indexedIntent.txId,
      pendingIndexedJournalHash:indexedIntent.journalHash,
    }:{}),
  };
  const claimed=await kv.atomic()
    .check({key,versionstamp:prev.versionstamp})
    .set(key,next).commit();
  if(!claimed.ok)throw Error("Concurrent projection lock acquisition lost CAS");
  const fence:ExclusiveProjectionWriterFence={
    async assertExclusiveWriter(t,s,physicalResourceId){
      if(t!==target||s!==scopeId||physicalResourceId!==resourceId)
        throw Error("Wrong logical scope or physical Google file for acquired writer");
      const current=await kv.get<GoogleProjectionLock>(key);
      if(current.value?.schema!=="EC06_GOOGLE_LOCK_V1"||
         current.value?.resourceId!==resourceId||
         current.value?.token!==token||current.value.state!=="HELD"||
         current.value.epoch!==next.epoch){
        throw Error("Google projection lock revoked: halt all external writes");
      }
    },
  };
  return {
    fence,token,
    async releaseAfterIndependentVerification(verify){
      await fence.assertExclusiveWriter(target,scopeId,resourceId);
      // Proof MUST be checked against real independently read Google target,
      // not a caller-submitted receipt string or a fake success response.
      const verifiedProofRef=await verify();
      if(typeof verifiedProofRef!=="string" ||
         !/^proof[._-][a-z0-9._-]+$/i.test(verifiedProofRef)){
        throw Error("Cannot release ambiguous Google projection without verified receipt");
      }
      const latest=await kv.get<GoogleProjectionLock>(key);
      if(!latest.versionstamp||latest.value?.token!==token||
         latest.value.state!=="HELD"||
         latest.value.epoch!==next.epoch){
        throw Error("Google lock ownership changed during receipt verification");
      }
      const released:GoogleProjectionLock={
        ...latest.value,state:"RELEASED",
        lastVerifiedProjectionRef:verifiedProofRef,
      };
      const commit=await kv.atomic()
        .check({key,versionstamp:latest.versionstamp})
        .set(key,released).commit();
      if(!commit.ok)throw Error("Lock release conflicted: still refuse new writer");
    },
  };
}
