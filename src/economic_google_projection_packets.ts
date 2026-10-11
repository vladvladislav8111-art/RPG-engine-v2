/**
 * EC-06 — readback-verified Google projection packet core (STAGING ONLY).
 *
 * The real Sheets/Docs transport and exclusive writer fencing must be
 * implemented only after approved migration. This file does not call Google
 * APIs, mutate TEMP_RUNTIME, or create another economic authority. It
 * formalizes how a Google projection can be verified against its immutable
 * KV primary transaction journal.
 */
import type {
  EconomicAccount, WageEscrow, MarketLot,
} from "./economic_atomic_plan.ts";
import type {
  ImmutableEconomicTxJournal,
  EconomicRecordMutation,
  ProjectionCheckpoint,
  ProjectionVerification,
} from "./economic_projection_journal.ts";
import type {
  VerifiedEconomicProjectionAdapter,
} from "./economic_projection_recovery.ts";

type Target = "TEMP_RUNTIME" | "LIVE_TRANSACTION_ARCHIVE";
type ProjectionMap<T> = Record<string,T>;

export type GoogleEconomicProjectionImage = {
  schema:"EC06_VERIFIED_PROJECTION_V1";
  target:Target;
  scopeId:string;
  revision:string;
  lastTxId:string;
  /** Read-only materialized copy, KV remains sole future current authority. */
  accounts:ProjectionMap<EconomicAccount>;
  escrows:ProjectionMap<WageEscrow>;
  lots:ProjectionMap<MarketLot>;
  /** Durable receipts written atomically WITH their target's data changes. */
  receipts:Record<string,ProjectionVerification>;
};

/**
 * Implementers MUST provide an authorized single-writer fence and one
 * indivisible per-target state+receipt update. Vanilla separate Sheets writes
 * and Docs append do NOT satisfy this contract.
 */
export interface AuthoritativeGoogleProjectionTransport {
  readVerifiedImage(target:Target,scopeId:string):Promise<GoogleEconomicProjectionImage>;
  replaceImageAtExactRevision(input:{
    target:Target;
    scopeId:string;
    expectedRevision:string;
    image:GoogleEconomicProjectionImage;
  }):Promise<void>;
}

function equal(a:unknown,b:unknown):boolean{
  return JSON.stringify(a)===JSON.stringify(b);
}
async function journalDigest(j:ImmutableEconomicTxJournal):Promise<string>{
  const bytes=new TextEncoder().encode(JSON.stringify(j));
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function expectedEvidence(j:ImmutableEconomicTxJournal,target:Target):Promise<string>{
  return "proof.ec06."+target.toLowerCase()+"."+j.txId+"."+(await journalDigest(j));
}
function requireImage(x:GoogleEconomicProjectionImage,scope:string,target:Target){
  if(x.schema!=="EC06_VERIFIED_PROJECTION_V1"||x.scopeId!==scope||x.target!==target||
     !x.revision||!x.accounts||!x.escrows||!x.lots||!x.receipts){
    throw Error("Missing/unsupported independent Google projection image");
  }
}
function applyMutations<T>(
  previous:ProjectionMap<T>,
  changes:readonly EconomicRecordMutation<T>[],
):ProjectionMap<T>{
  const next:ProjectionMap<T>={...structuredClone(previous)};
  const touched=new Set<string>();
  for(const e of changes){
    if(touched.has(e.id))throw Error("Repeated item or account projection mutation");
    touched.add(e.id);
    const actual=Object.hasOwn(next,e.id)?next[e.id]:null;
    if(!equal(actual,e.before))throw Error("Target projection values diverged from primary KV history: "+e.id);
    if(e.after===null)delete next[e.id];
    else next[e.id]=structuredClone(e.after);
  }
  return next;
}
function matchesCurrentApplied(j:ImmutableEconomicTxJournal,i:GoogleEconomicProjectionImage):boolean{
  const all=[
    [i.accounts,j.accounts],
    [i.escrows,j.escrows],
    [i.lots,j.lots],
  ] as const;
  for(const [map,changes] of all){
    for(const change of changes){
      const present=Object.hasOwn(map,change.id)?map[change.id]:null;
      if(!equal(present,change.after))return false;
    }
  }
  return true;
}

export function makeVerifiedGoogleProjectionAdapter(
  transport:AuthoritativeGoogleProjectionTransport,
):VerifiedEconomicProjectionAdapter {
  return {
    async readCheckpoint(target,scopeId):Promise<ProjectionCheckpoint>{
      const image=await transport.readVerifiedImage(target,scopeId);
      requireImage(image,scopeId,target);
      return {
        target,scopeId,
        lastAppliedRevision:image.revision,
        lastAppliedTxId:image.lastTxId,
      };
    },
    async applyJournal(target,journal):Promise<void>{
      const image=await transport.readVerifiedImage(target,journal.scopeId);
      requireImage(image,journal.scopeId,target);
      if(image.revision!==journal.beforeRevision){
        throw Error("Projection fence rejected stale economic transaction");
      }
      if(image.receipts[journal.txId])throw Error("Projection receipt already exists for this TX");
      const receipt:ProjectionVerification={
        target,scopeId:journal.scopeId,
        txId:journal.txId,
        afterRevision:journal.afterRevision,
        journalEvidenceRef:await expectedEvidence(journal,target),
      };
      const next:GoogleEconomicProjectionImage={
        ...image,
        revision:journal.afterRevision,
        lastTxId:journal.txId,
        accounts:applyMutations(image.accounts,journal.accounts),
        escrows:applyMutations(image.escrows,journal.escrows),
        lots:applyMutations(image.lots,journal.lots),
        receipts:{...image.receipts,[journal.txId]:receipt},
      };
      await transport.replaceImageAtExactRevision({
        target,scopeId:journal.scopeId,
        expectedRevision:journal.beforeRevision,
        image:next,
      });
    },
    async readReceipt(target,scopeId,txId):Promise<ProjectionVerification|null>{
      const image=await transport.readVerifiedImage(target,scopeId);
      requireImage(image,scopeId,target);
      return image.receipts[txId]??null;
    },
    async isIndependentVerifiedReceipt(receipt,journal):Promise<boolean>{
      if(!journal||receipt.scopeId!==journal.scopeId||
         receipt.txId!==journal.txId||
         receipt.afterRevision!==journal.afterRevision||
         receipt.journalEvidenceRef!==await expectedEvidence(journal,receipt.target))return false;
      const image=await transport.readVerifiedImage(receipt.target,journal.scopeId);
      requireImage(image,journal.scopeId,receipt.target);
      if(!equal(image.receipts[journal.txId]??null,receipt))return false;
      // If this is the latest projected transaction, also compare the
      // exact changed materialized values. For older TXs, durable per-TX
      // receipts retain their immutable digest while later changes proceed.
      if(image.revision===journal.afterRevision && !matchesCurrentApplied(journal,image))
        return false;
      return true;
    },
  };
}
