/**
 * EC-06 bounded single-Google-Doc projection window — STAGING ONLY.
 *
 * Historic financial/physical journals remain IMMUTABLE in primary Deno KV.
 * This Google Doc is a bounded materialized mirror, NOT the sole archive after
 * an authorized checkpoint. A checkpoint is only trustworthy if its matching
 * archived segment manifest is independently CAS-confirmed in that KV.
 *
 * Maximum 16 currently readable deltas per physical Doc. This is not yet a
 * city-scale partitioning solution; the number of distinct materialized rows
 * also needs a strict scope bound. No new Google documents are created here.
 */
import type {KvKey} from "./economic_kv_atomic.ts";
import type {IndexedDeltaIntent,IndexedTargetReceipt} from "./economic_indexed_delta_projection.ts";

export const MAX_EC06_DOC_TAIL=16;
const MAX_SCOPED_ROWS=128;
const MAX_DOC_TEXT=240000;
const GENESIS="EC06_INDEX_DOC_GENESIS_V1 ";
const DELTA="EC06_INDEX_DOC_DELTA_V1 ";
const CHECKPOINT="EC06_INDEX_DOC_CHECKPOINT_V1 ";
const SHA=/^[0-9a-f]{64}$/;
const id=(x:unknown):x is string=>typeof x==="string"&&
  x.length<=180&&/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/i.test(x);
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const own=(o:Record<string,unknown>,k:string)=>Object.prototype.hasOwnProperty.call(o,k);
export const ZERO_EC06_SEGMENT_HASH="0".repeat(64);
export type Ec06DocCheckpoint={
  schema:"EC06_INDEX_DOC_CHECKPOINT_V1";scopeId:string;
  segmentNumber:number;compactedTransactions:number;
  segmentHash:string;rowsHash:string;
  rows:Record<string,unknown>;
};
export type Ec06DocDelta={
  schema:"EC06_INDEX_DOC_DELTA_V1";scopeId:string;txId:string;
  journalHash:string;mutations:IndexedDeltaIntent["mutations"];
  receipt:IndexedTargetReceipt;
};
export type Ec06DocWindow={
  baseRows:Record<string,unknown>;
  rows:Map<string,unknown>;
  receipts:Map<string,IndexedTargetReceipt>;
  deltas:readonly Ec06DocDelta[];
  checkpoint:Ec06DocCheckpoint|null;
};
export type Ec06DocSegmentManifest={
  schema:"EC06_DOC_SEGMENT_MANIFEST_V1";
  scopeId:string;physicalDocId:string;segmentNumber:number;
  previousHash:string;segmentHash:string;rowsHash:string;
  compactedTransactions:number;
  source:readonly {txId:string;journalHash:string}[];
  state:"PREPARED"|"APPLIED";
};
export const ec06SegmentKey=(scopeId:string,docId:string,n:number):KvKey=>
  ["rpg-v2","ec06","indexed","doc-segment",scopeId,docId,n];
const hex=(bytes:ArrayBuffer)=>[...new Uint8Array(bytes)].map(b=>
  b.toString(16).padStart(2,"0")).join("");
export async function ec06Sha256(value:unknown):Promise<string>{
  return hex(await crypto.subtle.digest("SHA-256",
    new TextEncoder().encode(JSON.stringify(value))));
}
function rowsValid(rows:unknown):rows is Record<string,unknown>{
  if(!rows||typeof rows!=="object"||Array.isArray(rows))return false;
  const names=Object.keys(rows);
  return names.length>0&&names.length<=MAX_SCOPED_ROWS&&
    names.every(k=>/^(account|lot|escrow)\//.test(k)&&id(k.split("/")[1])&&
      k.split("/").length===2);
}
function decode<T>(line:string,prefix:string):T{
  const value=JSON.parse(line.slice(prefix.length)) as T;
  if(!value||typeof value!=="object")throw Error("Invalid indexed Doc record");
  return value;
}
export function parseBoundedIndexedDocWindow(raw:string,scopeId:string):Ec06DocWindow{
  if(!id(scopeId)||typeof raw!=="string"||raw.length>MAX_DOC_TEXT)
    throw Error("Indexed Doc exceeds bounded source window");
  const lines=raw.split("\n").map(s=>s.trim()).filter(Boolean);
  if(lines.some(x=>!x.startsWith(GENESIS)&&!x.startsWith(CHECKPOINT)&&
      !x.startsWith(DELTA)))
    throw Error("Unknown document content cannot be compacted or silently skipped");
  const bases=lines.filter(l=>l.startsWith(GENESIS)||l.startsWith(CHECKPOINT));
  if(bases.length!==1)throw Error("Exactly one genesis or checkpoint is required");
  const isCp=bases[0].startsWith(CHECKPOINT);
  const anchor=decode<Record<string,unknown>>(bases[0],isCp?CHECKPOINT:GENESIS);
  if(anchor.scopeId!==scopeId||!rowsValid(anchor.rows)||
     anchor.schema!==(isCp?"EC06_INDEX_DOC_CHECKPOINT_V1":
       "EC06_INDEX_DOC_GENESIS_V1"))
    throw Error("Unapproved indexed Doc genesis/checkpoint");
  let checkpoint:Ec06DocCheckpoint|null=null;
  if(isCp){
    const p=anchor as unknown as Ec06DocCheckpoint;
    if(!Number.isSafeInteger(p.segmentNumber)||p.segmentNumber<1||
       !Number.isSafeInteger(p.compactedTransactions)||
       p.compactedTransactions<p.segmentNumber||
       !SHA.test(p.segmentHash)||!SHA.test(p.rowsHash))
      throw Error("Indexed Doc checkpoint has forged/invalid lineage");
    checkpoint=p;
  }
  const baseRows=structuredClone(anchor.rows as Record<string,unknown>);
  const rows=new Map<string,unknown>(Object.entries(baseRows));
  const receipts=new Map<string,IndexedTargetReceipt>();
  const rawDeltas=lines.filter(l=>l.startsWith(DELTA));
  if(rawDeltas.length>MAX_EC06_DOC_TAIL)
    throw Error("Indexed Doc is beyond 16 immutable tail deltas; HALT for compaction");
  const deltas:Ec06DocDelta[]=[];
  for(const rawDelta of rawDeltas){
    const e=decode<Ec06DocDelta>(rawDelta,DELTA);
    if(e.schema!=="EC06_INDEX_DOC_DELTA_V1"||e.scopeId!==scopeId||
       !id(e.txId)||!SHA.test(e.journalHash)||receipts.has(e.txId)||
       !Array.isArray(e.mutations)||e.mutations.length<1||
       e.mutations.length>16)
      throw Error("Malformed or repeated indexed Doc financial operation");
    const requiredIds:string[]=[];
    for(const m of e.mutations){
      if(!m||!["account","lot","escrow"].includes(m.kind)||!id(m.id))
        throw Error("Unidentified indexed Doc row mutation");
      const key=m.kind+"/"+m.id;
      if(requiredIds.includes(key)||!rows.has(key)||
         !same(rows.get(key),m.before)||same(m.before,m.after))
        throw Error("Indexed Doc has out-of-order, missing or duplicate row change");
      requiredIds.push(key);
      rows.set(key,structuredClone(m.after));
    }
    const receipt=e.receipt;
    if(!receipt||receipt.schema!=="EC06_INDEXED_TARGET_RECEIPT_V1"||
       receipt.target!=="LIVE_TRANSACTION_ARCHIVE"||
       receipt.scopeId!==scopeId||receipt.txId!==e.txId||
       receipt.journalHash!==e.journalHash||
       !same(receipt.rowIds,requiredIds))
      throw Error("Indexed Doc archive receipt does not match immutable delta");
    receipts.set(e.txId,receipt);
    deltas.push(e);
  }
  return {baseRows,rows,receipts,deltas,checkpoint};
}
export function encodeEc06DocCheckpoint(p:Ec06DocCheckpoint):string{
  return CHECKPOINT+JSON.stringify(p)+"\n";
}
/** Refuse any unbounded row cardinality rather than silently lose history. */
export async function buildEc06DocCheckpointPlan(input:{
  scopeId:string;physicalDocId:string;window:Ec06DocWindow;
}):Promise<{checkpoint:Ec06DocCheckpoint;manifest:Ec06DocSegmentManifest;
  compactedText:string}>{
  const {scopeId,physicalDocId,window}=input;
  if(!id(scopeId)||!physicalDocId||physicalDocId.length>256||
     window.deltas.length!==MAX_EC06_DOC_TAIL)
    throw Error("Compaction must seal exactly one complete bounded delta window");
  const cp=window.checkpoint;
  const segmentNumber=(cp?.segmentNumber??0)+1;
  const previousHash=cp?.segmentHash??ZERO_EC06_SEGMENT_HASH;
  const previousCount=cp?.compactedTransactions??0;
  const source=window.deltas.map(d=>({txId:d.txId,journalHash:d.journalHash}));
  const rows=Object.fromEntries(window.rows);
  if(!rowsValid(rows))throw Error("Checkpoint would exceed physical row scope");
  const rowsHash=await ec06Sha256(rows);
  const segmentHash=await ec06Sha256({
    schema:"EC06_DOC_SEGMENT_V1",scopeId,physicalDocId,
    segmentNumber,previousHash,source,rowsHash,
  });
  const checkpoint:Ec06DocCheckpoint={
    schema:"EC06_INDEX_DOC_CHECKPOINT_V1",scopeId,segmentNumber,
    compactedTransactions:previousCount+source.length,
    segmentHash,rowsHash,rows,
  };
  const manifest:Ec06DocSegmentManifest={
    schema:"EC06_DOC_SEGMENT_MANIFEST_V1",scopeId,physicalDocId,
    segmentNumber,previousHash,segmentHash,rowsHash,
    compactedTransactions:checkpoint.compactedTransactions,
    source,state:"PREPARED",
  };
  return {checkpoint,manifest,compactedText:encodeEc06DocCheckpoint(checkpoint)};
}
