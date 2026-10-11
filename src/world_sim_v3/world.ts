import {deny,pass,type SimOutcome,type Evidence,type WorldMinute} from './types.ts';
import {dueProcesses,type Interval,type ScheduledProcess} from './time.ts';
export type OpportunityState={id:string;issuerId:string;locationId:string;opensAt:WorldMinute;closesAt:WorldMinute;remainingSlots:number;sourceRef:string;status:'open'|'closed';};
export type WorldReview={dueProcessIds:string[];expiredOpportunities:string[];stillOpen:string[];nextReviewHint:WorldMinute|null;hasAutonomousDecisions:false;};
/** Materialized world processes only: never chooses winners or creates jobs. */
export function planWorldReview(input:{window:Interval;processes:readonly ScheduledProcess[];opportunities:readonly OpportunityState[];evidenceIds:ReadonlySet<string>;pageLimit?:number}):SimOutcome<WorldReview>{
 const due=dueProcesses({window:input.window,processes:input.processes,evidenceIds:input.evidenceIds,limit:input.pageLimit??32});if(!due.ok)return due;
 if(input.opportunities.length>64)return deny('OPPORTUNITY_PAGE_REQUIRED','Bounded opportunities page needed');
 const expired:string[]=[],opened:string[]=[];for(const o of input.opportunities){if(!o.sourceRef||o.closesAt<o.opensAt)return deny('INVALID_OPPORTUNITY','Missing independent opportunity and finite period');if(o.status==='closed'||o.remainingSlots<=0||o.closesAt<=input.window.end)expired.push(o.id);else if(o.opensAt<=input.window.end)opened.push(o.id);}
 const upcoming=input.processes.filter(p=>p.active&&p.nextDue!==null&&p.nextDue>input.window.end).map(p=>p.nextDue!);
 return pass({dueProcessIds:due.value.map(d=>d.id),expiredOpportunities:expired,stillOpen:opened,nextReviewHint:upcoming.length?Math.min(...upcoming):null,hasAutonomousDecisions:false});
}
/** Meaningful objective is an evidence-backed GM resolution, not random assignment. */
export function validateWorldResolution(input:{processId:string;cause:Evidence;actorCanReach:boolean;requiredKnowledgeRefs:ReadonlySet<string>;actualKnowledgeRefs:readonly string[];elapsedMinutes:number}):SimOutcome<{processId:string;causeId:string}> {
 if(!input.cause.independentlyVerified||!input.actorCanReach||input.elapsedMinutes<0||!input.actualKnowledgeRefs.every(x=>input.requiredKnowledgeRefs.has(x)))return deny('UNSUPPORTED_WORLD_EVENT','Resolution would use GM-only information or impossible travel');
 return pass({processId:input.processId,causeId:input.cause.id});
}
