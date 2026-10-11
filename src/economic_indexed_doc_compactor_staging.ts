/**
 * EC-06 manual Google Docs checkpoint publisher — STAGING ONLY.
 *
 * Exact single pre-approved physical Doc, no new file and NO production API.
 * Seal 16 already projected, dual-receipt-verified and queue-pruned TXs into
 * one bounded Doc snapshot under an exclusive writer fence and native Google
 * Docs requiredRevisionId CAS. The old immutable journals stay in Deno KV.
 *
 * The KV manifest is PREPARED before Google write and APPLIED only after
 * independent Google readback. Lost response/crash leaves Google fence HELD;
 * no TTL/force unlock, no automatic retry and no forged caller attestations.
 * This changes the *Doc mirror* from immutable whole history into a bounded
 * checkpoint: do not use until this new archive policy is explicitly approved.
 */
import {config} from "./config.ts";
import {authenticatedEconomicGoogleJson,type GoogleHttpJson} from "./economic_google_http_staging.ts";
import {acquireGoogleProjectionFence} from "./economic_google_kv_exclusive_fence.ts";
import {wrapDenoAtomicEconomyKv} from "./economic_deno_kv_adapter.ts";
import {indexedEc06Keys} from "./economic_indexed_wholesale_kv.ts";
import {makeIndexedQueueRegistration} from "./economic_indexed_outbox_queue.ts";
import {makeIndexedDeltaIntent,type IndexedJournal,
  type IndexedDeltaOutbox,type IndexedDeltaTargetAdapter,
  type IndexedTargetReceipt} from "./economic_indexed_delta_projection.ts";
import {buildEc06DocCheckpointPlan,parseBoundedIndexedDocWindow,
  ec06SegmentKey,ec06Sha256,MAX_EC06_DOC_TAIL,
  type Ec06DocWindow,type Ec06DocSegmentManifest,
} from "./economic_indexed_doc_checkpoint_staging.ts";

type StagingGoogleSnapshot={
  revisionId:string;tabId:string;
  text:string;bodyEndIndex:number;window:Ec06DocWindow;
};
function readSnapshot(raw:unknown,scopeId:string):StagingGoogleSnapshot{
  const doc=raw as {
    revisionId?:string;tabs?:Array<{
      tabProperties?:{tabId?:string};
      documentTab?:{body?:{content?:Array<{
        startIndex?:number;endIndex?:number;
        paragraph?:{elements?:Array<{textRun?:{content?:string}}>};
      }>}}>;
    }>;
  }|null;
  if(!doc?.revisionId||doc.tabs?.length!==1)
    throw Error("Compaction needs one exact native Google Doc tab and revision");
  const tab=doc.tabs[0],elements=tab.documentTab?.body?.content;
  if(!tab.tabProperties?.tabId||!Array.isArray(elements)||!elements.length)
    throw Error("Compaction has no source-controlled Google body indices");
  let text="";
  for(const p of elements){
    if(!p.paragraph||!Array.isArray(p.paragraph.elements)||
       p.paragraph.elements.some(e=>typeof e.textRun?.content!=="string"))
      throw Error("Compaction cannot overwrite foreign Google tables or objects");
    for(const e of p.paragraph.elements)text+=e.textRun!.content;
  }
  const last=elements.at(-1)?.endIndex;
  if(!Number.isSafeInteger(last)||last!<=2||
     elements[0]?.startIndex!==1)
    throw Error("Native Google Doc index range is missing/invalid");
  return {revisionId:doc.revisionId,tabId:tab.tabProperties.tabId,
    text,bodyEndIndex:last!,window:parseBoundedIndexedDocWindow(text,scopeId)};
}
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
async function validateImmutableSource(input:{
  db:Deno.Kv;adapter:IndexedDeltaTargetAdapter;
  scopeId:string;docId:string;window:Ec06DocWindow;
}):Promise<void>{
  const {db,adapter,scopeId,docId,window}=input;
  if(window.deltas.length!==MAX_EC06_DOC_TAIL)
    throw Error("Only a complete 16-operation Doc segment can be checkpointed");
  const cp=window.checkpoint;
  if(cp){
    const previous=await db.get<Ec06DocSegmentManifest>(
      ec06SegmentKey(scopeId,docId,cp.segmentNumber) as Deno.KvKey);
    if(previous.value?.state!=="APPLIED"||
       previous.value.segmentHash!==cp.segmentHash||
       previous.value.rowsHash!==cp.rowsHash||
       previous.value.compactedTransactions!==cp.compactedTransactions||
       cp.rowsHash!==await ec06Sha256(cp.rows))
      throw Error("Previous Doc checkpoint is not anchored to primary KV");
  }
  for(const change of window.deltas){
    const [tx,journal,outbox,queue]=await Promise.all([
      db.get<{schema:string;scopeId:string;txId:string}>(
        indexedEc06Keys.tx(change.txId) as Deno.KvKey),
      db.get<IndexedJournal>(indexedEc06Keys.journal(change.txId) as Deno.KvKey),
      db.get<IndexedDeltaOutbox>(indexedEc06Keys.outbox(change.txId) as Deno.KvKey),
      db.get(makeIndexedQueueRegistration(scopeId,change.txId,
        indexedEc06Keys.journal(change.txId)).key as Deno.KvKey),
    ]);
    if(!tx.value||!["EC06_INDEX_SALE_RECEIPT_V1","EC06_INDEX_WAGE_TX_V1"].includes(tx.value.schema)||
       tx.value.txId!==change.txId||tx.value.scopeId!==scopeId||
       !journal.value||journal.value.txId!==change.txId||
       journal.value.scopeId!==scopeId||
       !outbox.value||outbox.value.state!=="PROJECTED_INDEXED"||
       outbox.value.txId!==change.txId||outbox.value.scopeId!==scopeId||
       queue.value!==null)
      throw Error("Doc segment contains uncommitted, pending or queued source event");
    const intent=await makeIndexedDeltaIntent(journal.value);
    if(intent.journalHash!==change.journalHash||
       !equal(intent.mutations,change.mutations)||
       outbox.value.proofRef!=="proof.ec06.indexed."+
         change.txId+"."+intent.journalHash)
      throw Error("Doc segment diverges from immutable financial source journal");
    const expected:IndexedTargetReceipt={
      schema:"EC06_INDEXED_TARGET_RECEIPT_V1",
      target:"TEMP_RUNTIME",txId:change.txId,scopeId,
      journalHash:intent.journalHash,
      rowIds:intent.mutations.map(m=>m.kind+"/"+m.id),
    };
    const real=await adapter.readReceipt("TEMP_RUNTIME",scopeId,change.txId);
    if(!equal(real,expected)||
       !(await adapter.verifyDurableReceipt("TEMP_RUNTIME",intent,expected)))
      throw Error("Old Google Sheet receipt missing: cannot discard Doc delta");
  }
}
export async function compactOneIndexedDocWindowStaging(input:{
  db:Deno.Kv;adapter:IndexedDeltaTargetAdapter;
  scopeId:string;physicalDocId:string;httpJson?:GoogleHttpJson;
}):Promise<{segmentNumber:number;compactedTransactions:number;
  segmentHash:string;googleReadbackConfirmed:true}>{
  const {db,adapter,scopeId,physicalDocId:docId}=input;
  if(!scopeId.startsWith("scope.fixture.")||!docId||
     new Set(Object.values(config.files)).has(docId))
    throw Error("Only pre-approved isolated Google Docs staging scope accepted");
  const http=input.httpJson??authenticatedEconomicGoogleJson;
  const url="https://docs.googleapis.com/v1/documents/"+encodeURIComponent(docId);
  const get=async()=>readSnapshot(await http(url+"?includeTabsContent=true"),scopeId);
  // Pure preflight first; do not leave a held lock merely for a partial window.
  const first=await get();
  if(first.window.deltas.length!==MAX_EC06_DOC_TAIL)
    throw Error("Doc checkpoint requested before the bounded window is full");
  const kv=wrapDenoAtomicEconomyKv(db);
  const lock=await acquireGoogleProjectionFence({
    kv,scopeId,target:"LIVE_TRANSACTION_ARCHIVE",resourceId:docId,
  });
  // NO finally release: any ambiguous/partial external result MUST HALT.
  await lock.fence.assertExclusiveWriter("LIVE_TRANSACTION_ARCHIVE",scopeId,docId);
  const source=await get();
  if(source.revisionId!==first.revisionId||
     source.text!==first.text||
     source.tabId!==first.tabId)
    throw Error("Physical Google Doc moved under checkpoint exclusive fence");
  await validateImmutableSource({db,adapter,scopeId,docId,window:source.window});
  const plan=await buildEc06DocCheckpointPlan({
    scopeId,physicalDocId:docId,window:source.window,
  });
  const manifestKey=ec06SegmentKey(scopeId,docId,plan.manifest.segmentNumber);
  const created=await db.atomic()
    .check({key:manifestKey as Deno.KvKey,versionstamp:null})
    .set(manifestKey as Deno.KvKey,plan.manifest)
    .commit();
  if(!created.ok)throw Error("Doc checkpoint manifest already exists; manual inspection");
  await lock.fence.assertExclusiveWriter("LIVE_TRANSACTION_ARCHIVE",scopeId,docId);
  const result=await http(url+":batchUpdate",{
    method:"POST",body:JSON.stringify({
      requests:[
        {deleteContentRange:{range:{startIndex:1,
          endIndex:source.bodyEndIndex-1,tabId:source.tabId}}},
        {insertText:{location:{index:1,tabId:source.tabId},
          text:plan.compactedText}},
      ],
      writeControl:{requiredRevisionId:source.revisionId},
    }),
  }) as {replies?:unknown[]};
  if(result.replies?.length!==2)
    throw Error("Native Google Docs revision-guarded checkpoint not confirmed");
  await lock.fence.assertExclusiveWriter("LIVE_TRANSACTION_ARCHIVE",scopeId,docId);
  const persisted=await get();
  if(persisted.window.deltas.length!==0||
     !equal(persisted.window.checkpoint,plan.checkpoint))
    throw Error("Google Doc checkpoint did not survive authenticated readback");
  const pending=await db.get<Ec06DocSegmentManifest>(manifestKey as Deno.KvKey);
  if(pending.value?.state!=="PREPARED"||
     !equal(pending.value,plan.manifest)||!pending.versionstamp)
    throw Error("Immutable checkpoint manifest was replaced mid-flight");
  const acknowledged=await db.atomic()
    .check({key:pending.key,versionstamp:pending.versionstamp})
    .set(pending.key,{...pending.value,state:"APPLIED"} satisfies Ec06DocSegmentManifest)
    .commit();
  if(!acknowledged.ok)throw Error("Checkpoint manifest ACK conflicted; quarantine");
  await lock.releaseAfterIndependentVerification(async()=>{
    const check=await get();
    const durable=await db.get<Ec06DocSegmentManifest>(manifestKey as Deno.KvKey);
    if(check.window.deltas.length!==0||
       !equal(check.window.checkpoint,plan.checkpoint)||
       durable.value?.state!=="APPLIED"||
       durable.value.segmentHash!==plan.checkpoint.segmentHash)
      throw Error("Docs/KV source checkpoint split-brain; refuse writer release");
    return "proof.ec06.docsegment."+scopeId+"."+plan.manifest.segmentHash;
  });
  return {segmentNumber:plan.manifest.segmentNumber,
    compactedTransactions:plan.checkpoint.compactedTransactions,
    segmentHash:plan.manifest.segmentHash,googleReadbackConfirmed:true};
}
