/** GM operational arithmetic: no new money, jobs, knowledge, or game time. */
export type CountSource = {id:string; originalRef:string; comparisonRef:string; original:number; compared:number; units:string};
export type DocumentMethod = {
 id:string; sourceRef:string; originalPages:number; originalRows:number; numericOperations:number;
 observedRowsPerMinute:number; measuredPageSeconds:number; verifiedCalculatorOpsPerSecond:number;
 exceptionChecks:number; exceptionSeconds:number; actualDocumentsAvailable:boolean;
};
export type StageSpan = {id:string; actorId:string; startSecond:number; endSecond:number; role:"shura_work"|"npc_review"|"waiting"|"travel"|"other"; evidenceRef:string};
export type PaidReceipt = {
 offerId:string; employerId:string; originalRef:string; acceptanceRef:string; methodRef:string;
 amountC:number; reservedBudgetC:number; originalOwnership:"employer"; employerAccepted:boolean;
};
export type CashFlow = {receipts:PaidReceipt[]; expensesC:number; expectedNetC:number};
const valid=(v:unknown)=>typeof v==="string" && /^[a-z0-9_.:-]{8,180}$/i.test(v);
const nonnegative=(n:number)=>Number.isSafeInteger(n)&&n>=0&&n<=100000000;
export function reconcileCount(s:CountSource){
 if(!valid(s.id)||!valid(s.originalRef)||!valid(s.comparisonRef)||s.originalRef===s.comparisonRef||!s.units||!nonnegative(s.original)||!nonnegative(s.compared))
  throw Error("COUNT_REQUIRES_TWO_REAL_SOURCES");
 const difference=s.compared-s.original;
 return {id:s.id,documentDelta:difference,absoluteDelta:Math.abs(difference),
  status:difference===0?"MATCH":"SOURCE_CONFLICT",inferMissingGoods:false,
  inferFraud:false,requiresOriginalSourceCheck:difference!==0,committed:false as const};
}
/** Conditional observed-method estimate, not proof that a document or method exists. */
export function estimateDocumentSeconds(d:DocumentMethod){
 if(!valid(d.id)||!valid(d.sourceRef)||![d.originalPages,d.originalRows,d.numericOperations,d.observedRowsPerMinute,
 d.measuredPageSeconds,d.verifiedCalculatorOpsPerSecond,d.exceptionChecks,d.exceptionSeconds].every(nonnegative)
 ||d.originalPages<1||d.observedRowsPerMinute<1||d.measuredPageSeconds<1
 ||d.verifiedCalculatorOpsPerSecond<1||d.exceptionSeconds<1||d.originalRows>20000)
  throw Error("DOCUMENT_METHOD_REQUIRES_MEASURED_INPUTS");
 if(!d.actualDocumentsAvailable)throw Error("DOCUMENT_ORIGINAL_NOT_AVAILABLE");
 const handling=Math.ceil(d.originalPages*d.measuredPageSeconds);
 const comparison=Math.ceil(d.originalRows*60/d.observedRowsPerMinute);
 const arithmetic=Math.ceil(d.numericOperations/d.verifiedCalculatorOpsPerSecond);
 const exceptions=Math.ceil(d.exceptionChecks*d.exceptionSeconds);
 const total=handling+comparison+arithmetic+exceptions;
 return {methodId:d.id,sourceRef:d.sourceRef,seconds:{handling,comparison,arithmetic,exceptions,total},
  minutes:Math.ceil(total/60),requiresDocumentAndMethodReview:true as const,
  cannotInferAccuracy:true as const,committed:false as const};
}
export function auditStageTimeline(spans:StageSpan[],elapsedSeconds:number){
 if(!nonnegative(elapsedSeconds)||elapsedSeconds>604800||spans.length>96)throw Error("TIMELINE_BOUNDS");
 const seen=new Set<string>(),errors:string[]=[];
 for(const s of spans){
  if(!valid(s.id)||!valid(s.actorId)||!valid(s.evidenceRef)||seen.has(s.id)||
   !nonnegative(s.startSecond)||!nonnegative(s.endSecond)||s.endSecond<s.startSecond||s.endSecond>elapsedSeconds)
   errors.push("INVALID_STAGE:"+s.id);
  seen.add(s.id);
 }
 const productive=spans.filter(s=>s.role==="shura_work");
 const checked=[...spans].filter(s=>s.role==="shura_work"||s.role==="npc_review"||s.role==="travel");
 for(let i=0;i<checked.length;i++)for(let j=i+1;j<checked.length;j++){
  const a=checked[i],b=checked[j];
  if(a.actorId===b.actorId && a.startSecond<b.endSecond && b.startSecond<a.endSecond)
   errors.push("DOUBLE_BOOKED_ACTOR:"+a.actorId+":"+a.id+":"+b.id);
 }
 const personalSeconds=productive.filter(s=>s.actorId==="actor.shura").reduce((n,s)=>n+s.endSecond-s.startSecond,0);
 return {ok:errors.length===0,blockers:errors,elapsedSeconds,shuraProductiveSeconds:personalSeconds,
  independentNpcReviewSeconds:checked.filter(s=>s.role==="npc_review").reduce((n,s)=>n+s.endSecond-s.startSecond,0),
  unusedIsNotPaidWork:true,committed:false as const};
}
export function auditCashFlow(v:CashFlow){
 if(!nonnegative(v.expensesC)||!Number.isSafeInteger(v.expectedNetC)||Math.abs(v.expectedNetC)>100000000||
 v.receipts.length>32)throw Error("CASHFLOW_BOUNDS");
 const ids=new Set<string>(),originals=new Set<string>(),blockers:string[]=[];
 let gross=0;
 for(const r of v.receipts){
  if(!valid(r.offerId)||!valid(r.employerId)||!valid(r.originalRef)||!valid(r.acceptanceRef)||!valid(r.methodRef)||
    !nonnegative(r.amountC)||r.amountC===0||!nonnegative(r.reservedBudgetC)||
    r.originalOwnership!=="employer"||!r.employerAccepted)
   blockers.push("UNPROVEN_EMPLOYER_ACCEPTANCE:"+r.offerId);
  if(ids.has(r.offerId))blockers.push("DUPLICATE_OFFER:"+r.offerId);
  if(originals.has(r.originalRef))blockers.push("REUSED_ORIGINAL:"+r.originalRef);
  if(r.amountC>r.reservedBudgetC)blockers.push("UNFUNDED_PAYMENT:"+r.offerId);
  ids.add(r.offerId);originals.add(r.originalRef);gross+=r.amountC;
 }
 if(!Number.isSafeInteger(gross)||gross-v.expensesC!==v.expectedNetC)blockers.push("MONEY_LEDGER_MISMATCH");
 return {ok:blockers.length===0,blockers,grossC:gross,expensesC:v.expensesC,
  netC:gross-v.expensesC,sourceAttested:false as const,committed:false as const};
}
