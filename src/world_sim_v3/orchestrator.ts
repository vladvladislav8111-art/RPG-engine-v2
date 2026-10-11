import {deny,finite,pass,type Evidence,type SimOutcome} from './types.ts';
import {elapsedInterval} from './time.ts';
import {planWorldReview,type OpportunityState} from './world.ts';
import type {ScheduledProcess} from './time.ts';
export type SemanticSimulationProposal={schema:'RPG_V3_WORLD_SIM_PROPOSAL_V1';expectedSaveId:string;startMinute:number;endMinute:number;actorId:string;actionKind:string;worldProcessIds:readonly string[];opportunityExpiryIds:readonly string[];evidenceIds:readonly string[];playerChoiceRequired:true;committed:false;};
/** One turn: pure proposal ONLY. Runtime Bridge must perform semantic prepare/commit. */
export function proposeWorldTurn(input:{expectedSaveId:string;actorId:string;actionKind:string;now:number;elapsedMinutes:number;activeProcesses:readonly ScheduledProcess[];opportunities:readonly OpportunityState[];evidence:readonly Evidence[];maxProcesses?:number}):SimOutcome<SemanticSimulationProposal>{
 const {expectedSaveId,actorId,actionKind,now,elapsedMinutes}=input;if(!expectedSaveId||!actorId||!actionKind)return deny('INCOMPLETE_TURN','No authoritative save, actor or action');finite(now,'now');finite(elapsedMinutes,'elapsedMinutes');
 if(elapsedMinutes>10080)return deny('BULK_ADVANCE','Large time jump needs explicit segment-by-segment review');
 const window=elapsedInterval(now,elapsedMinutes);const due=planWorldReview({window,processes:input.activeProcesses,opportunities:input.opportunities,evidenceIds:new Set(input.evidence.filter(e=>e.independentlyVerified).map(e=>e.id)),pageLimit:input.maxProcesses??32});if(!due.ok)return due;
 return pass({schema:'RPG_V3_WORLD_SIM_PROPOSAL_V1',expectedSaveId,actorId,actionKind,startMinute:now,endMinute:window.end,worldProcessIds:due.value.dueProcessIds,opportunityExpiryIds:due.value.expiredOpportunities,evidenceIds:input.evidence.filter(e=>e.independentlyVerified).map(e=>e.id),playerChoiceRequired:true,committed:false});
}
