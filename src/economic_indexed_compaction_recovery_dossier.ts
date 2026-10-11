/**
 * EC-06 read-only physical Docs HELD-lock recovery dossier — STAGING ONLY.
 *
 * Read the SAME primary Deno KV as the economic journals and one approved
 * Google Docs archive through a read-only caller-owned Google reader.
 * This is triage, NOT proof that an in-flight HTTP request has ended.
 *
 * Critically this module has NO KV set/delete/atomic.commit, Google mutations,
 * incident-token issuance, worker unlock, TTL, scheduler or HTTP route.
 * The returned classification NEVER authorizes lock release. An independent
 * host/request quiescence + physical external-writer exclusion proof is still
 * mandatory before changing any HELD lock, even if all receipts match.
 */
import {indexedEc06Keys} from "./economic_indexed_wholesale_kv.ts";
import {makeIndexedQueueRegistration} from "./economic_indexed_outbox_queue.ts";
import {
  makeIndexedDeltaIntent,type IndexedJournal,type IndexedDeltaOutbox,
} from "./economic_indexed_delta_projection.ts";
import type {GoogleProjectionLock} from "./economic_google_kv_exclusive_fence.ts";
import {
  ec06SegmentKey,ec06Sha256,parseBoundedIndexedDocWindow,
  buildEc06DocCheckpointPlan,MAX_EC06_DOC_TAIL,
  type Ec06DocSegmentManifest,
} from "./economic_indexed_doc_checkpoint_staging.ts";

type ClassifiedIncident=
  |"PREPARED_DOC_STILL_OLD"
  |"DOC_WRITTEN_KV_ACK_PENDING"
  |"KV_APPLIED_LOCK_HELD"
  |"QUARANTINE_UNKNOWN_OR_DIVERGENT";
export type CompactionRecoveryDossier={
  kind:"EC06_COMPACTION_HELD_LOCK_READONLY_V1";
  scopeId:string;physicalDocId:string;segmentNumber:number;
  classification:ClassifiedIncident;
  revisionId:string|null;
  checkedSourceTxCount:number;
  /** Never infer that the prior HTTP writer or other Google editors stopped. */
  quiescenceProven:false;externalWritersExcluded:false;
  lockReleaseAuthorized:false;financialWrites:0;
};
export type ReadonlyGoogleDocEvidence={
  revisionId:string;bodyText:string;
};
export type ReadonlyDocEvidenceProvider={
  /** Must fetch the actual Docs body+revision, NEVER caller text or a cached receipt. */
  getLiveDocEvidence(docId:string):Promise<ReadonlyGoogleDocEvidence>;
};
const lockKey=(id:string)=>[
  "rpg-v2","ec06","google-unique-writer","LIVE_TRANSACTION_ARCHIVE",id,
] as const;
const keyMatch=(v:unknown,s:string):boolean=>v===s;
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
async function attestArchivedKvSources(input:{
  db:Deno.Kv;scopeId:string;manifest:Ec06DocSegmentManifest;
}):Promise<number>{
  const {db,scopeId,manifest}=input;
  if(manifest.source.length!==MAX_EC06_DOC_TAIL||
     new Set(manifest.source.map(s=>s.txId)).size!==MAX_EC06_DOC_TAIL)
    throw Error("Wrong number of old immutable archive events");
  let seen=0;
  for(const source of manifest.source){
    const reg=makeIndexedQueueRegistration(
      scopeId,source.txId,indexedEc06Keys.journal(source.txId));
    const [tx,journal,outbox,queue]=await Promise.all([
      db.get<{schema:string;txId:string;scopeId:string}>(
        indexedEc06Keys.tx(source.txId) as Deno.KvKey),
      db.get<IndexedJournal>(indexedEc06Keys.journal(source.txId) as Deno.KvKey),
      db.get<IndexedDeltaOutbox>(indexedEc06Keys.outbox(source.txId) as Deno.KvKey),
      db.get(reg.key as Deno.KvKey),
    ]);
    if(!tx.value||!["EC06_INDEX_SALE_RECEIPT_V1","EC06_INDEX_WAGE_TX_V1"].includes(tx.value.schema)||
       tx.value.txId!==source.txId||tx.value.scopeId!==scopeId||
       !journal.value||journal.value.txId!==source.txId||
       journal.value.scopeId!==scopeId||
       !outbox.value||outbox.value.schema!=="EC06_INDEX_OUTBOX_V1"||
       outbox.value.scopeId!==scopeId||outbox.value.txId!==source.txId||
       outbox.value.state!=="PROJECTED_INDEXED"||queue.value!==null)
      throw Error("Source TX, permanent journal, ACK or discovery pointer mismatch");
    const derived=await makeIndexedDeltaIntent(journal.value);
    if(derived.journalHash!==source.journalHash||
       outbox.value.proofRef!=="proof.ec06.indexed."+
         source.txId+"."+derived.journalHash)
      throw Error("Source journal SHA or original dual-target projection ACK differs");
    seen++;
  }
  return seen;
}
/**
 * Select a specific PREPARED/APPLIED manifest: never use a citywide list.
 * The app's KV attachment is not itself source funding or quiescence proof.
 */
export async function inspectHeldDocCompactionReadOnly(input:{
  db:Deno.Kv;provider:ReadonlyDocEvidenceProvider;
  scopeId:string;physicalDocId:string;segmentNumber:number;
}):Promise<CompactionRecoveryDossier>{
  const {db,provider,scopeId,physicalDocId:docId,segmentNumber}=input;
  if(!/^scope\.fixture\.[a-z0-9._-]+$/i.test(scopeId)||
     !docId||docId.length>256||
     !Number.isSafeInteger(segmentNumber)||segmentNumber<1)
    throw Error("Only the explicitly isolated staging scope and exact segment allowed");
  let revisionId:string|null=null,checkedSourceTxCount=0;
  let classification:ClassifiedIncident="QUARANTINE_UNKNOWN_OR_DIVERGENT";
  const report=()=>({
    kind:"EC06_COMPACTION_HELD_LOCK_READONLY_V1" as const,
    scopeId,physicalDocId:docId,segmentNumber,revisionId,
    checkedSourceTxCount,classification,
    quiescenceProven:false as const,externalWritersExcluded:false as const,
    lockReleaseAuthorized:false as const,financialWrites:0 as const,
  });
  try {
    const lock=await db.get<GoogleProjectionLock>(lockKey(docId) as Deno.KvKey);
    if(!lock.versionstamp||lock.value?.schema!=="EC06_GOOGLE_LOCK_V1"||
       lock.value.state!=="HELD"||
       lock.value.target!=="LIVE_TRANSACTION_ARCHIVE"||
       lock.value.scopeId!==scopeId||lock.value.resourceId!==docId||
       lock.value.pendingIndexedTxId!==undefined||
       !lock.value.token||!Number.isSafeInteger(lock.value.epoch)||
       lock.value.epoch<1)
      return report();
    const manifestKey=ec06SegmentKey(scopeId,docId,segmentNumber) as Deno.KvKey;
    const record=await db.get<Ec06DocSegmentManifest>(manifestKey);
    const m=record.value;
    if(!m||!record.versionstamp||
       m.schema!=="EC06_DOC_SEGMENT_MANIFEST_V1"||
       m.scopeId!==scopeId||m.physicalDocId!==docId||
       m.segmentNumber!==segmentNumber||
       !["PREPARED","APPLIED"].includes(m.state)||
       !/^[a-f0-9]{64}$/.test(m.rowsHash)||
       !/^[a-f0-9]{64}$/.test(m.segmentHash)||
       !/^[a-f0-9]{64}$/.test(m.previousHash)||
       !Number.isSafeInteger(m.compactedTransactions)||
       m.compactedTransactions!==segmentNumber*MAX_EC06_DOC_TAIL||
       !Array.isArray(m.source))
      return report();
    const sourceHash=await ec06Sha256({
      schema:"EC06_DOC_SEGMENT_V1",scopeId,physicalDocId:docId,
      segmentNumber,previousHash:m.previousHash,source:m.source,
      rowsHash:m.rowsHash,
    });
    if(sourceHash!==m.segmentHash)return report();
    if(segmentNumber>1){
      const previous=await db.get<Ec06DocSegmentManifest>(
        ec06SegmentKey(scopeId,docId,segmentNumber-1) as Deno.KvKey);
      if(previous.value?.state!=="APPLIED"||
         previous.value.segmentHash!==m.previousHash)return report();
    }else if(m.previousHash!=="0".repeat(64))return report();
    checkedSourceTxCount=await attestArchivedKvSources({
      db,scopeId,manifest:m,
    });
    const snap=await provider.getLiveDocEvidence(docId);
    if(!snap.revisionId||!snap.bodyText||snap.bodyText.length>240000)
      return report();
    revisionId=snap.revisionId;
    const doc=parseBoundedIndexedDocWindow(snap.bodyText,scopeId);
    if(doc.checkpoint?.segmentNumber===segmentNumber&&
       doc.deltas.length===0&&
       doc.checkpoint.segmentHash===m.segmentHash&&
       doc.checkpoint.rowsHash===m.rowsHash&&
       doc.checkpoint.compactedTransactions===m.compactedTransactions&&
       await ec06Sha256(doc.checkpoint.rows)===m.rowsHash){
      classification=m.state==="PREPARED"?
        "DOC_WRITTEN_KV_ACK_PENDING":"KV_APPLIED_LOCK_HELD";
    }else if(m.state==="PREPARED"&&
      doc.deltas.length===MAX_EC06_DOC_TAIL){
      const plan=await buildEc06DocCheckpointPlan({
        scopeId,physicalDocId:docId,window:doc,
      });
      if(same(plan.manifest,m)&&
         await ec06Sha256(Object.fromEntries(doc.rows))===m.rowsHash)
        classification="PREPARED_DOC_STILL_OLD";
    }
    // Compare AFTER the read-only Google request. A concurrent change
    // invalidates even the non-authorizing classification.
    const [nowLock,nowManifest]=await Promise.all([
      db.get<GoogleProjectionLock>(lockKey(docId) as Deno.KvKey),
      db.get<Ec06DocSegmentManifest>(manifestKey),
    ]);
    if(nowLock.versionstamp!==lock.versionstamp||
       nowManifest.versionstamp!==record.versionstamp)
      classification="QUARANTINE_UNKNOWN_OR_DIVERGENT";
  }catch{
    // Never leak private Google body, KV values, secrets or operator evidence.
    classification="QUARANTINE_UNKNOWN_OR_DIVERGENT";
  }
  return report();
}
