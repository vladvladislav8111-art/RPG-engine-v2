/** Single V3 GM work/world audit. Inputs are claims, not independent source verification. */
import {auditCashFlow,auditStageTimeline,estimateDocumentSeconds,reconcileCount,
 type CashFlow,type StageSpan,type DocumentMethod,type CountSource} from "./gm_operational_math_v1.ts";
import {marketDemandReview,reviewRumorChannels,
 type DemandWitness,type ReputationWitness,type RumorOpportunity} from "./market_reputation_v1.ts";
import {mandatoryGmPacket} from "./gm_turn_policy_v1.ts";
export type GmOpsInput={
 tags:string[]; elapsedSeconds:number;
 counts?:CountSource[];methods?:DocumentMethod[];
 stages?:StageSpan[]; cash?:CashFlow;
 demands?:DemandWitness[];reputation?:ReputationWitness[];rumorOpportunities?:RumorOpportunity[];
};
export function auditGmTurn(input:GmOpsInput){
 if(!input||!Array.isArray(input.tags)||input.tags.length>32||
  !input.tags.every(x=>typeof x==="string"&&x.length<=60)||
  !Number.isSafeInteger(input.elapsedSeconds)||input.elapsedSeconds<0||
  input.elapsedSeconds>604800)throw Error("GM_AUDIT_BOUNDS");
 const policy=mandatoryGmPacket(input.tags,input.elapsedSeconds);
 const counts=(input.counts??[]).map(reconcileCount);
 const methods=(input.methods??[]).map(estimateDocumentSeconds);
 const timeline=auditStageTimeline(input.stages??[],input.elapsedSeconds);
 const cash=input.cash?auditCashFlow(input.cash):null;
 const market=marketDemandReview(input.demands??[],input.reputation??[]);
 const rumors=reviewRumorChannels(input.rumorOpportunities??[]);
 const missing:string[]=[...timeline.blockers];
 if(cash&&!cash.ok)missing.push(...cash.blockers);
 const work=policy.requiredChecks.includes("AUTHORITATIVE_SKILL_TASK_PLAN");
 if(work&&(input.methods?.length??0)===0)missing.push("MISSING_MEASURED_WORK_METHOD");
 if(work&&(input.stages?.length??0)===0)missing.push("MISSING_WORK_TIMELINE");
 if(work&&(input.demands?.length??0)===0)missing.push("NO_MATERIALIZED_DEMAND");
 if(work&&!cash)missing.push("UNPROVEN_WORK_FINANCING");
 return {schema:"GM_OPS_V1_READ_ONLY_PROPOSAL" as const,
  policy,counts,methods,timeline,cash,market,rumors,
  blockers:[...new Set(missing)],readyForGmReview:missing.length===0,
  readyForSemanticCommit:false as const,sourceAttested:false as const,
  actualNpcContactCommitted:false as const,actualMoneyPaid:false as const,
  earnedXp:0 as const,committed:false as const};
}
