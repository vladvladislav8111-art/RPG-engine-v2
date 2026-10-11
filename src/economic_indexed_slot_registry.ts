/**
 * EC-06 indexed projection slot registry — STAGING ONLY.
 *
 * Registry points to ALREADY provisioned, independently verified Google
 * rows. It NEVER creates Google rows, NPC accounts, goods, TXs or money.
 *
 * Each row and logical (scope, target, kind, entityId) has one immutable
 * KV pointer, atomically CAS protected. A fixed, source-attested page
 * declaration allows O(touched rows) lookup without city-wide scanning or
 * one global counter / scope-version contention.
 */
import type {AtomicKvStore,KvKey} from "./economic_kv_atomic.ts";
import type {DeltaKind,DeltaTarget} from "./economic_indexed_delta_projection.ts";
import type {IndexedGoogleSlotPlan} from "./economic_indexed_google_http_staging.ts";
export type IndexedSlotKind=DeltaKind|"receipt";
export type StagingSlotPage={
  schema:"EC06_SLOT_PAGE_V1";target:DeltaTarget;scopeId:string;
  physicalResourceId:string;sheetId:number;
  pageId:string;kind:"EC06_IDX_ROWS"|"EC06_IDX_RECEIPTS";
  firstRow:number;lastRow:number;sourceProofRef:string;
};
export type IndexedSlotRecord={
  schema:"EC06_PINNED_SLOT_V1";scopeId:string;target:DeltaTarget;
  physicalResourceId:string;sheetId:number;tab:string;
  pageId:string;kind:IndexedSlotKind;id:string;row:number;
  sourceProofRef:string;
};
export type RequestedSlot={
  kind:IndexedSlotKind;id:string;row:number;pageId:string;
  sourceProofRef:string;
};
const valid=(x:unknown):x is string=>typeof x==="string"&&
  /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/i.test(x)&&x.length<=180;
const pageKey=(target:DeltaTarget,scopeId:string,pageId:string):KvKey=>
  ["rpg-v2","ec06","projection-slot-page",target,scopeId,pageId];
const idKey=(target:DeltaTarget,scopeId:string,kind:IndexedSlotKind,id:string):KvKey=>
  ["rpg-v2","ec06","projection-slot-id",target,scopeId,kind,id];
const occupancyKey=(target:DeltaTarget,physicalResourceId:string,tab:string,row:number):KvKey=>
  ["rpg-v2","ec06","projection-slot-occupancy",target,physicalResourceId,tab,row];
function validPage(p:StagingSlotPage):boolean{
  return p.schema==="EC06_SLOT_PAGE_V1"&&valid(p.scopeId)&&
    valid(p.pageId)&&valid(p.sourceProofRef)&&
    typeof p.physicalResourceId==="string"&&p.physicalResourceId.length>0&&
    Number.isSafeInteger(p.sheetId)&&p.sheetId>=0&&
    Number.isSafeInteger(p.firstRow)&&p.firstRow>=2&&
    Number.isSafeInteger(p.lastRow)&&p.lastRow>=p.firstRow&&
    p.lastRow-p.firstRow<1024&&p.lastRow<=100000 &&
    ["TEMP_RUNTIME","LIVE_TRANSACTION_ARCHIVE"].includes(p.target)&&
    ["EC06_IDX_ROWS","EC06_IDX_RECEIPTS"].includes(p.kind);
}
/**
 * Provisioning here means recording ALREADY physically present Google tabs,
 * ranges and independently evidenced admin allocation. The source-fence
 * / manifest actual file metadata must be verified OUTSIDE this code.
 */
export async function registerProvisionedPageStaging(input:{
  kv:AtomicKvStore;page:StagingSlotPage;
  trustedProvisionedPageProofRefs:ReadonlySet<string>;
}):Promise<void>{
  const {kv,page,trustedProvisionedPageProofRefs:proofs}=input;
  if(!validPage(page)||!proofs.has(page.sourceProofRef))
    throw Error("Unproven or malformed actual Google staging page");
  const key=pageKey(page.target,page.scopeId,page.pageId);
  const old=await kv.get<StagingSlotPage>(key);
  if(old.value)throw Error("Google slot page ID already provisioned; never overwrite");
  const x=await kv.atomic().check({key,versionstamp:null}).set(key,page).commit();
  if(!x.ok)throw Error("Concurrent Google staging page registration lost CAS");
}
/** Each registration changes ONLY its own slot and physical row marker. */
export async function registerProjectionSlotsStaging(input:{
  kv:AtomicKvStore;target:DeltaTarget;scopeId:string;
  records:readonly RequestedSlot[];
  independentlyVerifiedRowProofRefs:ReadonlySet<string>;
}):Promise<readonly IndexedSlotRecord[]>{
  const {kv,target,scopeId,records,independentlyVerifiedRowProofRefs:proofs}=input;
  if(!valid(scopeId)||records.length<1||records.length>8)
    throw Error("Registered slot CAS batch must be bounded (1..8)");
  const pageIds=[...new Set(records.map(r=>r.pageId))];
  const pageEntries=await Promise.all(pageIds.map(id=>kv.get<StagingSlotPage>(
    pageKey(target,scopeId,id))));
  const pages=new Map(pageIds.map((id,i)=>[id,pageEntries[i]]));
  const usedId=new Set<string>(),usedRow=new Set<string>();
  const prepared:IndexedSlotRecord[]=[];
  for(const r of records){
    const page=pages.get(r.pageId)?.value;
    if(!page||!validPage(page)||page.target!==target||page.scopeId!==scopeId||
      !valid(r.id)||!valid(r.sourceProofRef)||!proofs.has(r.sourceProofRef)||
      !Number.isSafeInteger(r.row)||r.row<page.firstRow||r.row>page.lastRow||
      ((r.kind==="receipt")!==(page.kind==="EC06_IDX_RECEIPTS"))){
      throw Error("Google indexed slot has no physical source row and page proof");
    }
    const name=r.kind+"/"+r.id,position=page.physicalResourceId+"/"+page.kind+"/"+r.row;
    if(usedId.has(name)||usedRow.has(position))
      throw Error("Same exact indexed item or physical Google row allocated twice");
    usedId.add(name);usedRow.add(position);
    prepared.push({
      schema:"EC06_PINNED_SLOT_V1",scopeId,target,
      physicalResourceId:page.physicalResourceId,sheetId:page.sheetId,
      tab:page.kind,pageId:r.pageId,
      kind:r.kind,id:r.id,row:r.row,sourceProofRef:r.sourceProofRef,
    });
  }
  let writer=kv.atomic();
  for(const p of pageEntries)
    writer=writer.check({key:p.key,versionstamp:p.versionstamp});
  for(const p of prepared) {
    const identity=idKey(target,scopeId,p.kind,p.id);
    const physical=occupancyKey(target,p.physicalResourceId,p.tab,p.row);
    writer=writer.check({key:identity,versionstamp:null})
      .check({key:physical,versionstamp:null})
      .set(identity,p).set(physical,{
        scopeId,target,kind:p.kind,id:p.id,pageId:p.pageId,
      });
  }
  const ok=await writer.commit();
  if(!ok.ok)throw Error("Projection row/key collision: no partial slots allocated");
  return prepared;
}
/**
 * Exact primary-KV indexed ID -> slot lookups; no full Google sheet scan,
 * no arbitrary next-row allocation, no global city version modification.
 * Call separately for Sheets and archive or additional approved scopes.
 */
export async function resolveIndexedSlotsStaging(input:{
  kv:AtomicKvStore;target:DeltaTarget;scopeId:string;
  physicalResourceId:string;requested:readonly {
    kind:IndexedSlotKind;id:string;
  }[];
}):Promise<IndexedGoogleSlotPlan>{
  const {kv,target,scopeId,physicalResourceId,requested}=input;
  if(!valid(scopeId)||!physicalResourceId||!requested.length||
     requested.length>64)throw Error("Invalid bounded Google slot query");
  const unique=new Set<string>(),rows:IndexedGoogleSlotPlan["rows"][number][]=[],
    receiptSlots:IndexedGoogleSlotPlan["receiptSlots"][number][]=[];
  for(const need of requested){
    if(!valid(need.id)||!["receipt","account","lot","escrow"].includes(need.kind)||
       unique.has(need.kind+"/"+need.id))throw Error("Invalid or duplicated lookup ID");
    unique.add(need.kind+"/"+need.id);
    const r=await kv.get<IndexedSlotRecord>(
      idKey(target,scopeId,need.kind,need.id));
    const p=r.value;
    if(!p||p.schema!=="EC06_PINNED_SLOT_V1"||
       p.physicalResourceId!==physicalResourceId||p.scopeId!==scopeId||
       p.target!==target||p.kind!==need.kind||p.id!==need.id)
      throw Error("No exact pre-provisioned physical Google slot for indexed delta");
    const page=await kv.get<StagingSlotPage>(pageKey(target,scopeId,p.pageId));
    if(!page.value||!validPage(page.value)||page.value.kind!==p.tab||
       page.value.physicalResourceId!==physicalResourceId||
       p.row<page.value.firstRow||p.row>page.value.lastRow)
      throw Error("Physical Google projection page revoked or divergent");
    if(need.kind==="receipt")receiptSlots.push({txId:need.id,row:p.row});
    else rows.push({kind:need.kind,id:need.id,row:p.row});
  }
  return {rows,receiptSlots};
}
