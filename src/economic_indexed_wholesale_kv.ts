/**
 * EC-06 indexed primary KV wholesale settlement (STAGING, NOT LIVE).
 *
 * Precisely scoped row-level CAS: two accounts, one physical source lot,
 * optional one new lot, globally unique invoice / delivered receipt, and
 * a durable per-TX projection outbox + immutable mutation journal.
 *
 * This is NOT a migration or a production endpoint. Only an authorized
 * backend may construct canonical authorities after confirming actual legal
 * title, buyer assent, physical receipt and CURRENT pre-migrated wealth.
 * No historical money is re-created; no cross-scope settlements.
 */
import type { EconomicAccount, MarketLot } from "./economic_atomic_plan.ts";
import type { AtomicKvStore, KvKey, KvEntry } from "./economic_kv_atomic.ts";
import type { NpcWholesaleOrder } from "./npc_wholesale_clearing.ts";
import {makeIndexedQueueRegistration} from "./economic_indexed_outbox_queue.ts";

export type IndexedSaleLot = MarketLot & { legalOwnerAccountId:string };
export type IndexedHome = {
  schema:"EC06_INDEX_HOME_V1"; kind:"account"|"item";
  entityId:string; scopeId:string; sourceProofRef:string;
};
export type IndexedSeal = {
  schema:"EC06_INDEX_MIGRATION_V1";
  scopeId:string; state:"STAGING_INDEXED_ONLY";
  originalSaveId:string;
  independentlyVerifiedMigrationRef:string;
  originalSourceFingerprint:string;
};
export type IndexedSaleJournal = {
  schema:"EC06_INDEX_SALE_JOURNAL_V1";
  txId:string; scopeId:string; sourceOrderId:string;
  deliveredReceiptRef:string;
  accountDeltas:readonly {
    id:string; before:EconomicAccount; after:EconomicAccount;
  }[];
  lotDeltas:readonly {
    id:string; before:IndexedSaleLot|null; after:IndexedSaleLot|null;
  }[];
  grossCopper:number; units:number;
  /** Hashes/receipts for future projection must derive from THIS journal. */
};
export type IndexedSaleReceipt = {
  schema:"EC06_INDEX_SALE_RECEIPT_V1";
  txId:string; scopeId:string; orderId:string;
  intentFingerprint:string; grossCopper:number; units:number;
  sourceReceiptRef:string;
};
export type IndexedOutbox = {
  schema:"EC06_INDEX_OUTBOX_V1"; txId:string; scopeId:string;
  state:"PENDING_INDEXED_PROJECTION";
  journalKey:KvKey;
};
export type IndexedSaleAuthority = {
  nowGameMinute:number;
  verifiedMigrationProofRefs:ReadonlySet<string>;
  confirmedOrdersById:ReadonlyMap<string,NpcWholesaleOrder>;
  verifiedSourceProcessIds:ReadonlySet<string>;
  independentlyVerifiedEvidenceRefs:ReadonlySet<string>;
  verifiedLocationIds:ReadonlySet<string>;
};
export type IndexedSaleResult = {
  kind:"INDEXED_COMMITTED_STAGING"|"IDEMPOTENT_REPLAY";
  receipt:IndexedSaleReceipt;
  outbox:IndexedOutbox;
};
const kroot=["rpg-v2","ec06","indexed"] as const;
export const indexedEc06Keys={
  seal:(scope:string):KvKey=>[...kroot,"seal",scope],
  account:(scope:string,id:string):KvKey=>[...kroot,"account",scope,id],
  lot:(scope:string,id:string):KvKey=>[...kroot,"lot",scope,id],
  home:(kind:"account"|"item",id:string):KvKey=>[...kroot,"home",kind,id],
  tx:(id:string):KvKey=>[...kroot,"tx",id],
  delivery:(id:string):KvKey=>[...kroot,"delivery",id],
  journal:(id:string):KvKey=>[...kroot,"journal",id],
  outbox:(id:string):KvKey=>[...kroot,"outbox",id],
};
const validId=(x:unknown):x is string=>typeof x==="string"&&
  /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/i.test(x)&&x.length<=180;
const validMoney=(x:unknown):x is number=>typeof x==="number"&&
  Number.isSafeInteger(x)&&x>=0;
const validQty=(x:unknown):x is number=>typeof x==="number"&&
  Number.isFinite(x)&&x>0;
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function acceptedOrderEqual(a:NpcWholesaleOrder,b:NpcWholesaleOrder):boolean {
  const fields:(keyof NpcWholesaleOrder)[]=[
    "orderId","sellerAccountId","buyerAccountId","itemId","sourceProcessId",
    "handoffLocationId","quantity","totalPriceCopper","splitItemId",
    "dueGameMinute","sellerRightRef","buyerAcceptanceRef","deliveredReceiptRef",
  ];
  return fields.every(key=>a[key]===b[key]);
}
function requireHome(x:KvEntry<IndexedHome>,kind:"account"|"item",
  id:string,scope:string):void {
  const v=x.value;
  if(!v||v.schema!=="EC06_INDEX_HOME_V1"||!x.versionstamp||
     v.kind!==kind||v.entityId!==id||v.scopeId!==scope||
     !validId(v.sourceProofRef))throw Error("No unique approved home scope for account/item: "+id);
}
/**
 * CAS over actual participating records, rather than one global city or
 * district snapshot. Different merchants need not contend with unrelated
 * trades; contention on the same payer or physical lot remains fatal.
 */
export async function commitIndexedNpcWholesaleStaging(
  kv:AtomicKvStore,input:{
    scopeId:string;
    order:NpcWholesaleOrder;
    authority:IndexedSaleAuthority;
  },
):Promise<IndexedSaleResult> {
  const {scopeId,order:o,authority:a}=input;
  if(!validId(scopeId)||!validId(o.orderId)||!validId(o.itemId)||
     !validId(o.deliveredReceiptRef)||!validId(o.sellerAccountId)||
     !validId(o.buyerAccountId)||!validId(o.sourceProcessId)||
     !validId(o.buyerAcceptanceRef)||!validId(o.sellerRightRef)||
     !validId(o.handoffLocationId)||!Number.isSafeInteger(a.nowGameMinute)||
     a.nowGameMinute<0||!Number.isSafeInteger(o.dueGameMinute)||
     o.dueGameMinute<0||o.dueGameMinute>a.nowGameMinute||
     !Number.isSafeInteger(o.totalPriceCopper)||o.totalPriceCopper<=0||
     !validQty(o.quantity)||o.sellerAccountId===o.buyerAccountId||
     !a.verifiedSourceProcessIds.has(o.sourceProcessId)||
     !a.verifiedLocationIds.has(o.handoffLocationId)||
     ![o.deliveredReceiptRef,o.buyerAcceptanceRef,o.sellerRightRef]
       .every(ref=>a.independentlyVerifiedEvidenceRefs.has(ref))||
     !a.confirmedOrdersById.has(o.orderId)||
     !acceptedOrderEqual(o,a.confirmedOrdersById.get(o.orderId)!)){
    throw Error("Actual due wholesale order/physical receipt/consent is not independently verified");
  }
  const intentFingerprint=JSON.stringify([
    scopeId,o.orderId,o.sellerAccountId,o.buyerAccountId,o.itemId,
    o.sourceProcessId,o.handoffLocationId,o.quantity,o.totalPriceCopper,
    o.splitItemId??null,o.dueGameMinute,o.sellerRightRef,
    o.buyerAcceptanceRef,o.deliveredReceiptRef,
  ]);
  const previous=await kv.get<IndexedSaleReceipt>(indexedEc06Keys.tx(o.orderId));
  if(previous.value){
    if(previous.value.schema!=="EC06_INDEX_SALE_RECEIPT_V1"||
       previous.value.intentFingerprint!==intentFingerprint||
       previous.value.scopeId!==scopeId)throw Error("Invoice ID reused for different trade");
    const old=await kv.get<IndexedOutbox>(indexedEc06Keys.outbox(o.orderId));
    const journal=await kv.get<IndexedSaleJournal>(indexedEc06Keys.journal(o.orderId));
    if(!old.value||old.value.txId!==o.orderId||!journal.value||
       journal.value.txId!==o.orderId)throw Error("Incomplete committed indexed transaction");
    return {kind:"IDEMPOTENT_REPLAY",receipt:previous.value,outbox:old.value};
  }

  const seal=await kv.get<IndexedSeal>(indexedEc06Keys.seal(scopeId));
  if(!seal.value||seal.value.schema!=="EC06_INDEX_MIGRATION_V1"||
     seal.value.state!=="STAGING_INDEXED_ONLY"||
     seal.value.scopeId!==scopeId||!seal.versionstamp||
     !validId(seal.value.originalSaveId)||
     !validId(seal.value.originalSourceFingerprint)||
     !a.verifiedMigrationProofRefs.has(seal.value.independentlyVerifiedMigrationRef)){
    throw Error("No independently verified single-owner indexed KV migration");
  }
  const [seller,buyer,lot,hs,hb,hl,receipt]=await Promise.all([
    kv.get<EconomicAccount>(indexedEc06Keys.account(scopeId,o.sellerAccountId)),
    kv.get<EconomicAccount>(indexedEc06Keys.account(scopeId,o.buyerAccountId)),
    kv.get<IndexedSaleLot>(indexedEc06Keys.lot(scopeId,o.itemId)),
    kv.get<IndexedHome>(indexedEc06Keys.home("account",o.sellerAccountId)),
    kv.get<IndexedHome>(indexedEc06Keys.home("account",o.buyerAccountId)),
    kv.get<IndexedHome>(indexedEc06Keys.home("item",o.itemId)),
    kv.get<{orderId:string}>(indexedEc06Keys.delivery(o.deliveredReceiptRef)),
  ]);
  requireHome(hs,"account",o.sellerAccountId,scopeId);
  requireHome(hb,"account",o.buyerAccountId,scopeId);
  requireHome(hl,"item",o.itemId,scopeId);
  if(receipt.value)throw Error("Physical delivery receipt already consumed by another invoice");
  if(!seller.value||!buyer.value||!lot.value||
     !seller.versionstamp||!buyer.versionstamp||!lot.versionstamp||
     seller.value.accountId!==o.sellerAccountId||
     buyer.value.accountId!==o.buyerAccountId||
     ![seller.value,buyer.value].every(v=>
       validMoney(v.availableCopper)&&validMoney(v.heldCopper))||
     !validQty(lot.value.quantity)||!validId(lot.value.templateId)||
     lot.value.itemId!==o.itemId||
     lot.value.custodianAccountId!==o.sellerAccountId||
     lot.value.legalOwnerAccountId!==o.sellerAccountId||
     !["AUTHORIZED_WHOLESALE","AUTHORIZED_RETAIL"].includes(lot.value.sellingRight)||
     lot.value.physicalLocationId!==o.handoffLocationId||
     lot.value.quantity<o.quantity||
     buyer.value.availableCopper<o.totalPriceCopper||
     !validMoney(seller.value.availableCopper+o.totalPriceCopper)){
    throw Error("Indexed invoice lacks finite liquid cash, legal seller title, or existing source lot");
  }
  const sellerAfter={...seller.value,
    availableCopper:seller.value.availableCopper+o.totalPriceCopper};
  const buyerAfter={...buyer.value,
    availableCopper:buyer.value.availableCopper-o.totalPriceCopper};
  const sourceBefore=structuredClone(lot.value);
  const srcAfter:IndexedSaleLot={...lot.value};
  let dst:IndexedSaleLot|null=null;
  let splitEntry:KvEntry<IndexedSaleLot>|null=null;
  let splitHome:KvEntry<IndexedHome>|null=null;
  if(o.quantity===lot.value.quantity){
    if(o.splitItemId)throw Error("Whole-item transfer cannot create duplicate item ID");
    srcAfter.custodianAccountId=o.buyerAccountId;
    srcAfter.legalOwnerAccountId=o.buyerAccountId;
    srcAfter.sellingRight="PRIVATE";
  }else{
    if(!validId(o.splitItemId)||o.splitItemId===o.itemId)
      throw Error("Partial order requires one never-before-used unique split item ID");
    [splitEntry,splitHome]=await Promise.all([
      kv.get<IndexedSaleLot>(indexedEc06Keys.lot(scopeId,o.splitItemId)),
      kv.get<IndexedHome>(indexedEc06Keys.home("item",o.splitItemId)),
    ]);
    if(splitEntry.value||splitHome.value)
      throw Error("Sale would duplicate an existing physical item instance");
    srcAfter.quantity-=o.quantity;
    dst={...srcAfter,itemId:o.splitItemId,quantity:o.quantity,
      custodianAccountId:o.buyerAccountId,
      legalOwnerAccountId:o.buyerAccountId,sellingRight:"PRIVATE"};
  }
  const beforeTotal=seller.value.availableCopper+buyer.value.availableCopper+
    seller.value.heldCopper+buyer.value.heldCopper;
  const afterTotal=sellerAfter.availableCopper+buyerAfter.availableCopper+
    sellerAfter.heldCopper+buyerAfter.heldCopper;
  if(!Number.isSafeInteger(beforeTotal)||beforeTotal!==afterTotal||
     !validQty(srcAfter.quantity)||!validQty(o.quantity)||
     (dst && srcAfter.quantity+dst.quantity!==sourceBefore.quantity)){
    throw Error("Copper or physically held quantity not conserved");
  }
  const journal:IndexedSaleJournal={
    schema:"EC06_INDEX_SALE_JOURNAL_V1",txId:o.orderId,
    scopeId,sourceOrderId:o.orderId,deliveredReceiptRef:o.deliveredReceiptRef,
    accountDeltas:[
      {id:o.sellerAccountId,before:structuredClone(seller.value),after:sellerAfter},
      {id:o.buyerAccountId,before:structuredClone(buyer.value),after:buyerAfter},
    ],
    lotDeltas:[
      {id:o.itemId,before:sourceBefore,after:srcAfter},
      ...(dst?[{id:dst.itemId,before:null,after:dst}]:[]),
    ],
    grossCopper:o.totalPriceCopper,units:o.quantity,
  };
  const tx:IndexedSaleReceipt={
    schema:"EC06_INDEX_SALE_RECEIPT_V1",txId:o.orderId,
    scopeId,orderId:o.orderId,intentFingerprint,
    grossCopper:o.totalPriceCopper,units:o.quantity,
    sourceReceiptRef:o.deliveredReceiptRef,
  };
  const outbox:IndexedOutbox={
    schema:"EC06_INDEX_OUTBOX_V1",txId:o.orderId,scopeId,
    state:"PENDING_INDEXED_PROJECTION",
    journalKey:indexedEc06Keys.journal(o.orderId),
  };
  const queue=makeIndexedQueueRegistration(scopeId,o.orderId,indexedEc06Keys.journal(o.orderId));
  let op=kv.atomic()
    .check({key:queue.key,versionstamp:null})
    .check({key:indexedEc06Keys.seal(scopeId),versionstamp:seal.versionstamp})
    .check({key:hs.key,versionstamp:hs.versionstamp})
    .check({key:hb.key,versionstamp:hb.versionstamp})
    .check({key:hl.key,versionstamp:hl.versionstamp})
    .check({key:seller.key,versionstamp:seller.versionstamp})
    .check({key:buyer.key,versionstamp:buyer.versionstamp})
    .check({key:lot.key,versionstamp:lot.versionstamp})
    .check({key:indexedEc06Keys.tx(o.orderId),versionstamp:null})
    .check({key:indexedEc06Keys.delivery(o.deliveredReceiptRef),versionstamp:null})
    .check({key:indexedEc06Keys.journal(o.orderId),versionstamp:null})
    .check({key:indexedEc06Keys.outbox(o.orderId),versionstamp:null})
    .set(seller.key,sellerAfter)
    .set(buyer.key,buyerAfter)
    .set(lot.key,srcAfter)
    .set(indexedEc06Keys.tx(o.orderId),tx)
    .set(indexedEc06Keys.delivery(o.deliveredReceiptRef),{orderId:o.orderId})
    .set(indexedEc06Keys.journal(o.orderId),journal)
    .set(indexedEc06Keys.outbox(o.orderId),outbox)
    .set(queue.key,queue.value);
  if(dst && splitEntry && splitHome){
    op=op.check({key:splitEntry.key,versionstamp:null})
      .check({key:splitHome.key,versionstamp:null})
      .set(splitEntry.key,dst)
      .set(splitHome.key,{
        schema:"EC06_INDEX_HOME_V1",kind:"item",
        entityId:dst.itemId,scopeId,
        sourceProofRef:o.deliveredReceiptRef,
      } satisfies IndexedHome);
  }
  const result=await op.commit();
  if(!result.ok)throw Error("Indexed transaction conflict: reload actual KV source, do NOT assume sale");
  return {kind:"INDEXED_COMMITTED_STAGING",receipt:tx,outbox};
}
