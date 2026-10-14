import {strict as assert} from "node:assert";
import {auditGmTurn} from "../src/gm_ops_v1.ts";
import {auditCashFlow,auditStageTimeline,estimateDocumentSeconds,reconcileCount} from "../src/gm_operational_math_v1.ts";
import {marketDemandReview,reviewRumorChannels} from "../src/market_reputation_v1.ts";
import {mandatoryGmPacket,summarizeBridgeTiming} from "../src/gm_turn_policy_v1.ts";
import {assertNewWorkPayments} from "../src/work_payment_proof_v1.ts";
Deno.test("30 actual vs 31 on document: conflict not automatically theft or player error",()=>{
 const v=reconcileCount({id:"count.day73",originalRef:"staff.actual.30",comparisonRef:"ledger.copy.31",
  original:30,compared:31,units:"boxes"});
 assert.equal(v.documentDelta,1);assert.equal(v.inferMissingGoods,false);
 assert.throws(()=>reconcileCount({id:"count.day73",originalRef:"same.reference",comparisonRef:"same.reference",original:30,compared:31,units:"boxes"}));
});
Deno.test("conditional fast calculator method does not force an hour of mental addition",()=>{
 const r=estimateDocumentSeconds({id:"method.shura.proven",sourceRef:"session.T0831",
  originalPages:2,originalRows:90,numericOperations:12,observedRowsPerMinute:90,
  measuredPageSeconds:25,verifiedCalculatorOpsPerSecond:5,exceptionChecks:1,exceptionSeconds:20,actualDocumentsAvailable:true});
 assert.equal(r.seconds.handling,50);assert.equal(r.seconds.comparison,60);
 assert.equal(r.seconds.arithmetic,3);assert.equal(r.seconds.total,133);
 assert.throws(()=>estimateDocumentSeconds({id:"method.shura.proven",sourceRef:"session.T0831",
  originalPages:1,originalRows:1,numericOperations:1,observedRowsPerMinute:90,
  measuredPageSeconds:25,verifiedCalculatorOpsPerSecond:5,exceptionChecks:0,exceptionSeconds:20,actualDocumentsAvailable:false}));
});
Deno.test("NPC may QC while player works elsewhere, Shura cannot work twice",()=>{
 const stages=[
 {id:"shura.job.one",actorId:"actor.shura",startSecond:0,endSecond:600,role:"shura_work" as const,evidenceRef:"job.first.ref"},
 {id:"owner.qc.one",actorId:"npc.owner1",startSecond:600,endSecond:1000,role:"npc_review" as const,evidenceRef:"qc.owner1"},
 {id:"shura.job.two",actorId:"actor.shura",startSecond:600,endSecond:1100,role:"shura_work" as const,evidenceRef:"job.second.ref"}];
 const r=auditStageTimeline(stages,1200);assert.equal(r.ok,true);assert.equal(r.shuraProductiveSeconds,1100);
 assert.equal(auditStageTimeline([...stages,{...stages[2],id:"shura.job.three",startSecond:700}],1200).ok,false);
});
Deno.test("salary requires real money source and one receipt per genuine physical original",()=>{
 const r={offerId:"offer.day73.dye",employerId:"npc.dye.factor",originalRef:"source.dye.73",
  acceptanceRef:"qc.dye.73",methodRef:"work.shura.73",amountC:37,reservedBudgetC:37,
  originalOwnership:"employer" as const,employerAccepted:true};
 assert.equal(auditCashFlow({receipts:[r],expensesC:7,expectedNetC:30}).ok,true);
 assert.equal(auditCashFlow({receipts:[r,r],expensesC:0,expectedNetC:74}).ok,false);
 assert.equal(auditCashFlow({receipts:[{...r,reservedBudgetC:10}],expensesC:0,expectedNetC:37}).ok,false);
});
Deno.test("market demand never mints posts from city population and uses known reputation only",()=>{
 const d={id:"demand.day73",employerId:"npc.central.merchant",workSourceRef:"new.cargo.73",
  employerOwnBudgetRef:"cash.owner.73",activeIndependentSourceCount:4,unfilledAcceptedSlots:5,
  employerAvailableC:75,independentRequiredWorkCount:6,staffAlreadyHandling:2,minPriceC:30};
 const cold=marketDemandReview([d],[]);assert.equal(cold.maximumPotentialSlots,2);
 assert.equal(cold.entries[0].trustEvidence,"NO_CONFIRMED_AWARENESS");
 const warm=marketDemandReview([d],[{employerId:d.employerId,observingActorId:d.employerId,
  evidenceRef:"receipt.day69",kind:"direct_accepted_work",verifiedContact:true,relevantToWork:true,successes:5}]);
 assert.equal(warm.maximumPotentialSlots,2);assert.equal(warm.entries[0].trustEvidence,"DIRECT_EMPLOYER_HISTORY");
 assert(warm.entries[0].priorityScore>cold.entries[0].priorityScore);
});
Deno.test("no autonomous gossip without contact, channel time and sender knowledge",()=>{
 const a={factId:"fact.shura.fast",fromId:"npc.factor.a",toId:"npc.factor.b",
  channelId:"rumor.market.a",senderAlreadyKnows:true,verifiedEncounterRef:"scene.day70.1700",
  contactAtMinute:300,nowMinute:420,minChannelMinutes:60};
 assert.equal(reviewRumorChannels([a])[0].plausible,true);
 assert.equal(reviewRumorChannels([{...a,nowMinute:310}])[0].plausible,false);
 assert.equal(reviewRumorChannels([{...a,senderAlreadyKnows:false}])[0].plausible,false);
});
Deno.test("new PAID job cannot be credited without prior materialized demand, review and unique funding",()=>{
 const closed={offerId:"offer.day73.dye",employerId:"npc.central.factor",state:"COMPLETED / PAID",pay:"37c"};
 const proof={offerId:closed.offerId,employerId:closed.employerId,originalSourceRef:"source.dye.day73",
   acceptedSourceRef:"owner.review.day73",methodSourceRef:"workplan.day73",
   amountC:37,reservedFromEmployerC:37,acceptanceMinute:900};
 assert.throws(()=>assertNewWorkPayments({closes:[closed],proofs:[proof],openedOfferIds:[],authorizedSameTurnOfferIds:[],moneyNetC:37,expensesC:0}),/NOT_MATERIALIZED/);
 assert.equal(assertNewWorkPayments({closes:[closed],proofs:[proof],openedOfferIds:[closed.offerId],authorizedSameTurnOfferIds:[],moneyNetC:37,expensesC:0}).totalC,37);
 assert.throws(()=>assertNewWorkPayments({closes:[closed],proofs:[{...proof,reservedFromEmployerC:2}],openedOfferIds:[closed.offerId],authorizedSameTurnOfferIds:[],moneyNetC:37,expensesC:0}),/UNPROVEN/);
});
Deno.test("mandatory protocol and phase profiler are source-only and cannot claim model response time",()=>{
 const g=mandatoryGmPacket(["WORK","NPC"],4200);
 assert(g.requiredChecks.includes("AUTHORITATIVE_SKILL_TASK_PLAN"));
 assert(g.requiredChecks.includes("REVIEW_DIRECT_REPUTATION_AND_ACTUAL_GOSSIP"));
 assert.equal(g.commitPermitted,false);
 const p=summarizeBridgeTiming([{phase:"routing_sheets",elapsedMs:55},{phase:"bulk_source_fanout",elapsedMs:800}],920);
 assert.equal(p.slowestPhases[0].phase,"bulk_source_fanout");
 assert(p.unmeasured.some(x=>x.includes("ChatGPT")));
});
Deno.test("GM packet flags missing timed work, funding and opportunity materialization",()=>{
 const v=auditGmTurn({tags:["MARKET"],elapsedSeconds:3600});
 assert(v.blockers.includes("MISSING_MEASURED_WORK_METHOD"));
 assert(v.blockers.includes("NO_MATERIALIZED_DEMAND"));
 assert.equal(v.readyForSemanticCommit,false);
});
