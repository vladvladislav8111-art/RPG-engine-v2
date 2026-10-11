/**
 * EC-06 real Google HTTP transport for indexed, bounded STAGING projections.
 *
 * It is NOT imported by production routes and cannot target CURRENT files.
 * Sheets: one structural spreadsheets.batchUpdate updates ONLY pre-allocated
 * row values and TX receipt, then authentic server-side readback.
 * Docs: one requiredRevisionId conditional append of an immutable delta +
 * receipt; readRows reconstructs solely from the isolated genesis and logs.
 *
 * No true Sheets server-side CAS exists. A physical-file KV exclusive writer
 * fence is acquired prior to reread and held through verified readback.
 * An ambiguous response deliberately leaves the lock held (manual recovery).
 * External Google editors bypass KV: never promote this to live economy
 * until old CURRENT writers and human/third-party edits are excluded.
 */
import {config} from "./config.ts";
import {authenticatedEconomicGoogleJson,type GoogleHttpJson} from "./economic_google_http_staging.ts";
import {acquireGoogleProjectionFence} from "./economic_google_kv_exclusive_fence.ts";
import {
  parseBoundedIndexedDocWindow,ec06SegmentKey,MAX_EC06_DOC_TAIL,
  type Ec06DocSegmentManifest,
} from "./economic_indexed_doc_checkpoint_staging.ts";
import type {AtomicKvStore} from "./economic_kv_atomic.ts";
import type {
  IndexedDeltaTargetAdapter,IndexedDeltaIntent,IndexedTargetReceipt,
  DeltaTarget,DeltaKind,
} from "./economic_indexed_delta_projection.ts";

type RowKey={kind:DeltaKind;id:string};
export type IndexedGoogleSlotPlan={
  rows:readonly (RowKey&{row:number})[];
  receiptSlots:readonly {txId:string;row:number}[];
};
export type IndexedDocGenesis={
  schema:"EC06_INDEX_DOC_GENESIS_V1";
  scopeId:string;rows:Record<string,unknown>;
};
type IndexedDocLog={
  schema:"EC06_INDEX_DOC_DELTA_V1";
  scopeId:string;txId:string;journalHash:string;
  mutations:IndexedDeltaIntent["mutations"];
  receipt:IndexedTargetReceipt;
};
const prefixDelta="EC06_INDEX_DOC_DELTA_V1 ";
const ID=/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/i;
const key=(r:RowKey)=>r.kind+"/"+r.id;
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function assertRowId(value:string){if(!ID.test(value)||value.length>180)throw Error("Invalid indexed staging row ID");}
function receiptFor(target:DeltaTarget,intent:IndexedDeltaIntent):IndexedTargetReceipt {
  return {
    schema:"EC06_INDEXED_TARGET_RECEIPT_V1",
    target,txId:intent.txId,scopeId:intent.scopeId,
    journalHash:intent.journalHash,
    rowIds:intent.mutations.map(m=>key(m)),
  };
}
function assertReceipt(target:DeltaTarget,intent:IndexedDeltaIntent,r:IndexedTargetReceipt){
  if(!equal(receiptFor(target,intent),r))
    throw Error("Indexed Google receipt does not match exact primary immutable transaction");
}
function flattenDoc(content:unknown):string{
  if(!Array.isArray(content))return "";
  let text="";
  for(const item of content){
    const node=item as {
      paragraph?:{elements?:Array<{textRun?:{content?:string}}>};
      table?:{tableRows?:Array<{tableCells?:Array<{content?:unknown}>}>};
    };
    for(const e of node.paragraph?.elements??[])text+=e.textRun?.content??"";
    for(const row of node.table?.tableRows??[])
      for(const cell of row.tableCells??[])text+=flattenDoc(cell.content);
  }
  return text;
}
function parseDoc(raw:unknown,scopeId:string):{
  revisionId:string;tabId?:string;
  rows:Map<string,unknown>;receipts:Map<string,IndexedTargetReceipt>;
  tailCount:number;checkpoint:import("./economic_indexed_doc_checkpoint_staging.ts").Ec06DocCheckpoint|null;
}{
  if(!raw||typeof raw!=="object")throw Error("Google Doc staging response missing");
  const doc=raw as {
    revisionId?:string;body?:{content?:unknown};
    tabs?:Array<{tabProperties?:{tabId?:string};
      documentTab?:{body?:{content?:unknown}}}>;
  };
  if(!doc.revisionId)throw Error("Native Google Docs revision guard unavailable");
  if(doc.tabs&&doc.tabs.length!==1)
    throw Error("Indexed single-Doc checkpoint cannot inspect other tabs");
  const tab=doc.tabs?.[0];
  const body=tab?flattenDoc(tab.documentTab?.body?.content):flattenDoc(doc.body?.content);
  const window=parseBoundedIndexedDocWindow(body,scopeId);
  return {revisionId:doc.revisionId,tabId:tab?.tabProperties?.tabId,
    rows:window.rows,receipts:window.receipts,
    tailCount:window.deltas.length,checkpoint:window.checkpoint};
}
function parseCells(raw:unknown,label:string,keyRequired:string):unknown{
  const value=(raw as {values?:unknown[][]}|null)?.values?.[0]??[];
  if(String(value[0]??"")!==keyRequired)throw Error("Pinned Google slot identity changed: "+label);
  if(typeof value[1]!=="string")throw Error("Missing canonical JSON row at "+label);
  return JSON.parse(value[1]);
}
/** No implicit row allocator: every legal Item ID, account and TX must be pre-registered. */
export function makeIsolatedIndexedGoogleHttpAdapter(input:{
  stagingSpreadsheetId:string;
  stagingDocumentId:string;
  rowsSheetId:number;
  receiptsSheetId:number;
  scopeId:string;
  slots:IndexedGoogleSlotPlan;
  kv:AtomicKvStore;
  httpJson?:GoogleHttpJson;
}):IndexedDeltaTargetAdapter{
  const {stagingSpreadsheetId:sheetId,stagingDocumentId:docId,
    rowsSheetId,receiptsSheetId,scopeId,slots,kv}=input;
  const http=input.httpJson??authenticatedEconomicGoogleJson;
  // Reject EVERY configured canonical/current asset, not just the two
  // obvious economy targets: a mistaken file ID must never alter GM PREGEN,
  // NPC canon, maps, inventory or a different live document.
  const protectedFiles=new Set(Object.values(config.files));
  if(!sheetId||!docId||!scopeId||sheetId===docId||
     protectedFiles.has(sheetId)||protectedFiles.has(docId)||
     !Number.isSafeInteger(rowsSheetId)||rowsSheetId<0||
     !Number.isSafeInteger(receiptsSheetId)||receiptsSheetId<0||
     rowsSheetId===receiptsSheetId)
    throw Error("Explicit separate Google indexed staging files and sheet IDs required");
  const rowMap=new Map<string,number>();
  const receiptMap=new Map<string,number>();
  const usedRows=new Set<number>(),usedReceiptRows=new Set<number>();
  for(const r of slots.rows){
    assertRowId(r.id);const k=key(r);
    if(rowMap.has(k)||!Number.isSafeInteger(r.row)||r.row<2||r.row>20000||
       usedRows.has(r.row))throw Error("Overlapping/noncanonical pinned indexed source row");
    rowMap.set(k,r.row);usedRows.add(r.row);
  }
  for(const r of slots.receiptSlots){
    assertRowId(r.txId);
    if(receiptMap.has(r.txId)||!Number.isSafeInteger(r.row)||
       r.row<2||r.row>20000||usedReceiptRows.has(r.row))
      throw Error("Duplicate/unbounded committed receipt projection slot");
    receiptMap.set(r.txId,r.row);usedReceiptRows.add(r.row);
  }
  const sheetsRoot="https://sheets.googleapis.com/v4/spreadsheets/"+
    encodeURIComponent(sheetId);
  const docsRoot="https://docs.googleapis.com/v1/documents/"+encodeURIComponent(docId);
  function assertScope(id:string){if(id!==scopeId)throw Error("Unknown indexed Google scope");}
  function assertRows(intent:IndexedDeltaIntent){
    assertScope(intent.scopeId);
    if(!receiptMap.has(intent.txId)||intent.mutations.length<1||
       intent.mutations.length>16||!intent.mutations.every(m=>rowMap.has(key(m))))
      throw Error("Indexed TX/item/escrow lacks approved Google staging slot");
  }
  async function readSheetCell(tab:"EC06_IDX_ROWS"|"EC06_IDX_RECEIPTS",
    row:number,k:string):Promise<unknown>{
    const label=tab+"!A"+row+":B"+row;
    const url=sheetsRoot+"/values/"+encodeURIComponent(label)+"?valueRenderOption=UNFORMATTED_VALUE";
    return parseCells(await http(url),label,k);
  }
  async function sheetRows(keys:readonly RowKey[]):Promise<unknown[]>{
    return await Promise.all(keys.map(k=>{
      const row=rowMap.get(key(k));
      if(!row)throw Error("Indexed source row not registered");
      return readSheetCell("EC06_IDX_ROWS",row,key(k));
    }));
  }
  async function sheetReceipt(txId:string):Promise<IndexedTargetReceipt|null>{
    const row=receiptMap.get(txId);
    if(!row)throw Error("Unknown pinned indexed TX receipt slot");
    const receipt=await readSheetCell("EC06_IDX_RECEIPTS",row,txId);
    return receipt===null?null:receipt as IndexedTargetReceipt;
  }
  async function readDoc(){
    const raw=await http(docsRoot+"?includeTabsContent=true");
    const document=parseDoc(raw,scopeId);
    if(document.checkpoint){
      const cp=document.checkpoint;
      const record=await kv.get<Ec06DocSegmentManifest>(
        ec06SegmentKey(scopeId,docId,cp.segmentNumber));
      if(record.value?.schema!=="EC06_DOC_SEGMENT_MANIFEST_V1"||
         record.value.state!=="APPLIED"||
         record.value.scopeId!==scopeId||
         record.value.physicalDocId!==docId||
         record.value.segmentNumber!==cp.segmentNumber||
         record.value.segmentHash!==cp.segmentHash||
         record.value.rowsHash!==cp.rowsHash||
         record.value.compactedTransactions!==cp.compactedTransactions)
        throw Error("Google checkpoint lacks independently APPLIED primary KV proof");
    }
    return document;
  }
  async function receipts(target:DeltaTarget,txId:string):Promise<IndexedTargetReceipt|null>{
    return target==="TEMP_RUNTIME"?
      await sheetReceipt(txId):
      (await readDoc()).receipts.get(txId)??null;
  }
  async function rows(target:DeltaTarget,keys:readonly RowKey[]){
    if(target==="TEMP_RUNTIME"){
      const values=await sheetRows(keys);
      return keys.map((k,i)=>({...k,value:values[i]}));
    }
    const doc=await readDoc();
    return keys.map(k=>{
      const value=doc.rows.get(key(k));
      if(value===undefined&&!doc.rows.has(key(k)))
        throw Error("Docs indexed genesis missing pre-approved row "+key(k));
      return {...k,value};
    });
  }
  return {
    async readReceipt(target,scope,txId){
      assertScope(scope);
      if(!receiptMap.has(txId))throw Error("Indexed receipt not in approved slot plan");
      return await receipts(target,txId);
    },
    async readRows(target,scope,requested){
      assertScope(scope);
      for(const k of requested)if(!rowMap.has(key(k)))
        throw Error("No approved indexed Google row for "+key(k));
      return await rows(target,requested);
    },
    async applyRowsAndReceiptAtomically(target,intent,receipt){
      assertRows(intent);assertReceipt(target,intent,receipt);
      // Check capacity BEFORE touching Sheets or acquiring a Google writer lock.
      // A full Doc may only advance after independent KV-backed checkpointing.
      if(target==="LIVE_TRANSACTION_ARCHIVE"&&
         (await readDoc()).tailCount>=MAX_EC06_DOC_TAIL)
        throw Error("Google Doc bounded tail full: manual verified checkpoint required");
      const physicalId=target==="TEMP_RUNTIME"?sheetId:docId;
      const lock=await acquireGoogleProjectionFence({
        kv,scopeId,target,resourceId:physicalId,
        indexedIntent:{txId:intent.txId,journalHash:intent.journalHash},
      });
      // NO finally release: ambiguous failure must block another writer
      // until a separately authorized receipt-based incident resolution.
      await lock.fence.assertExclusiveWriter(target,scopeId,physicalId);
      const existing=await receipts(target,intent.txId);
      if(existing)throw Error("Source target already projected invoice under writer fence");
      const current=await rows(target,intent.mutations.map(m=>({kind:m.kind,id:m.id})));
      for(let i=0;i<intent.mutations.length;i++)
        if(!equal(current[i].value,intent.mutations[i].before))
          throw Error("Google indexed row changed before actual fenced apply");
      if(target==="TEMP_RUNTIME"){
        const requests=intent.mutations.map(m=>({
          updateCells:{
            start:{sheetId:rowsSheetId,rowIndex:rowMap.get(key(m))!-1,columnIndex:1},
            rows:[{values:[{userEnteredValue:{stringValue:JSON.stringify(m.after)}}]}],
            fields:"userEnteredValue",
          },
        }));
        requests.push({
          updateCells:{
            start:{sheetId:receiptsSheetId,rowIndex:receiptMap.get(intent.txId)!-1,
              columnIndex:1},
            rows:[{values:[{userEnteredValue:{stringValue:JSON.stringify(receipt)}}]}],
            fields:"userEnteredValue",
          },
        });
        // Sheets spreadsheets.batchUpdate applies these structural requests
        // atomically inside ONE spreadsheet, but has no compare-before CAS.
        const result=await http(sheetsRoot+":batchUpdate",{
          method:"POST",body:JSON.stringify({requests}),
        }) as {replies?:unknown[]};
        if(result.replies?.length!==requests.length)
          throw Error("Google indexed batch update did not confirm all row+receipt requests");
      }else{
        const source=await readDoc();
        if(source.tailCount>=MAX_EC06_DOC_TAIL)
          throw Error("Google Doc archive reached safe tail boundary under fence");
        if(source.receipts.has(intent.txId))throw Error("Docs projected same invoice twice");
        const log:IndexedDocLog={
          schema:"EC06_INDEX_DOC_DELTA_V1",
          scopeId,txId:intent.txId,journalHash:intent.journalHash,
          mutations:intent.mutations,receipt,
        };
        const end=source.tabId?{tabId:source.tabId}:{};
        await http(docsRoot+":batchUpdate",{
          method:"POST",
          body:JSON.stringify({
            requests:[{insertText:{
              endOfSegmentLocation:end,
              text:"\n"+prefixDelta+JSON.stringify(log)+"\n",
            }}],
            writeControl:{requiredRevisionId:source.revisionId},
          }),
        });
      }
      await lock.fence.assertExclusiveWriter(target,scopeId,physicalId);
      // Independently re-read actual server state and receipt.
      const persisted=await receipts(target,intent.txId);
      if(!equal(persisted,receipt))throw Error("Google target durable receipt mismatch");
      const after=await rows(target,intent.mutations.map(m=>({kind:m.kind,id:m.id})));
      if(after.some((r,i)=>!equal(r.value,intent.mutations[i].after)))
        throw Error("Google target post-write financial/custody mismatch");
      await lock.releaseAfterIndependentVerification(async()=>{
        const check=await receipts(target,intent.txId);
        if(!equal(check,receipt))throw Error("Receipt vanished before KV fence release");
        return "proof.ec06.indexed."+intent.txId+"."+intent.journalHash;
      });
    },
    async verifyDurableReceipt(target,intent,receipt){
      assertRows(intent);
      if(!equal(receipt,receiptFor(target,intent)))return false;
      const actual=await receipts(target,intent.txId);
      return equal(actual,receipt);
    },
  };
}
