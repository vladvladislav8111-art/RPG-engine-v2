/** One independent pre-funded demand => at most one finite V3 work offer.
 * STAGING ONLY: EC-06 must authenticate receipt and source demand in primary ledger.
 */
import {generateOffer,type MaterializedDemand,type GeneratedOffer} from "./world_sim_v3/opportunities.ts";

export type SourceFundedJob={
  demand:MaterializedDemand;
  sourceProcessId:string;
  sourceProcessActive:boolean;
  actorPresent:boolean;
  demandEvidenceRef:string;
  employerBudgetReceipt:{
    receiptId:string;escrowId:string;ownerId:string;
    amountCopper:number;sourceRevision:string;held:boolean;verified:boolean;
  };
};
export function proposeSourceFundedJobs(input:{
  expectedSaveId:string;saveId:string;revision:string;nowMinute:number;
  seed:string;jobs:readonly SourceFundedJob[];
  existingDemandIds:ReadonlySet<string>;
  usedFundingReceipts:ReadonlySet<string>;
  maxOffers?:number;
}) {
  const fail=(code:string)=>({ok:false as const,code,committed:false as const});
  if(!input.expectedSaveId||input.expectedSaveId!==input.saveId||!input.revision||
    !Number.isSafeInteger(input.nowMinute)||input.nowMinute<0)return fail("STALE_OR_UNKNOWN_WORLD");
  const limit=input.maxOffers??8;
  if(!Number.isSafeInteger(limit)||limit<1||limit>12||input.jobs.length>limit||!input.seed)
    return fail("BOUNDED_BATCH_REQUIRED");
  const offered:GeneratedOffer[]=[];
  const demandIds=new Set<string>(),receipts=new Set<string>(),escrows=new Set<string>();
  for(const job of input.jobs) {
    const d=job.demand,r=job.employerBudgetReceipt;
    if(!job.sourceProcessId||!job.sourceProcessActive||!job.actorPresent||
      !job.demandEvidenceRef||!d.sourceRef||d.sourceRef!==job.demandEvidenceRef||
      !d.physicalSources?.length||!d.physicalSources.every(s=>typeof s==="string"&&!!s.trim()))
      return fail("NO_REAL_TASK_OR_EMPLOYER");
    if(!d.id||demandIds.has(d.id)||input.existingDemandIds.has(d.id))
      return fail("DUPLICATED_DEMAND");
    if(d.kind==="system_objective")return fail("OBJECTIVE_REQUIRES_DISTINCT_CANON_AUTHORITY");
    if(!r.verified||!r.held||!r.sourceRevision||
      r.sourceRevision!==input.revision||r.ownerId!==d.issuerId||!r.receiptId||
      r.escrowId!==d.escrowId||r.amountCopper<d.fundedCopper||
      !Number.isSafeInteger(r.amountCopper)||r.amountCopper<=0)
      return fail("UNPROVEN_ESCROW");
    if(input.usedFundingReceipts.has(r.receiptId)||receipts.has(r.receiptId)||
      escrows.has(r.escrowId))return fail("ESCROW_REPLAY");
    const offer=generateOffer({demand:d,seed:input.seed+":"+d.id,now:input.nowMinute});
    if(!offer.ok) return fail("V3_REJECTED_"+offer.code);
    demandIds.add(d.id);receipts.add(r.receiptId);escrows.add(r.escrowId);
    offered.push(offer.value);
  }
  return {ok:true as const,proposals:offered,
    status:"READ_ONLY_SOURCE_ATTESTATION_PENDING" as const,
    committed:false as const,employerFundsMoved:false as const,
    shuraAccepted:false as const,
    note:"Caller-provided funds are NOT authoritative until authenticated by EC-06; never materialize jobs or pay here."};
}
