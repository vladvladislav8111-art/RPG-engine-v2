import {deny,pass,type SimOutcome,type WorldMinute} from './types.ts';
import type {Interval} from './time.ts';
export type NpcAvailability='available'|'busy'|'absent'|'unknown';
export type NpcShift={npcId:string;locationId:string;start:WorldMinute;end:WorldMinute;kind:'work'|'travel'|'sleep'|'appointment'};
export type NpcCommitment={id:string;npcId:string;start:WorldMinute;end:WorldMinute;locationId:string;status:'active'|'cancelled'};
export type NpcPresence={npcId:string;availability:NpcAvailability;locationId:string|null;reason:string};
/** Knows only physical schedule; DOES NOT decide what an NPC wants/says. */
export function evaluateNpcPresence(input:{npcId:string;at:WorldMinute;shifts:readonly NpcShift[];commitments:readonly NpcCommitment[];lastKnownLocationId?:string}):SimOutcome<NpcPresence>{
 const {npcId,at}=input;const shifts=input.shifts.filter(s=>s.npcId===npcId&&s.start<=at&&s.end>at);const commitments=input.commitments.filter(s=>s.npcId===npcId&&s.status==='active'&&s.start<=at&&s.end>at);
 if(shifts.some(x=>x.end<=x.start)||commitments.some(x=>x.end<=x.start))return deny('BAD_SCHEDULE','Invalid overlapping interval');
 const places=new Set([...shifts.map(x=>x.locationId),...commitments.map(x=>x.locationId)]);
 if(places.size>1)return deny('CONFLICTED_PRESENCE','NPC cannot exist at two physical locations');
 if(commitments.length>1)return deny('COMPETING_COMMITMENTS','Conflicting active NPC obligations');
 const actual=commitments[0];if(actual)return pass({npcId,availability:'busy',locationId:actual.locationId,reason:'committed engagement'});
 const s=shifts[0];if(s)return pass({npcId,availability:s.kind==='work'?'available':'busy',locationId:s.locationId,reason:s.kind});
 return pass({npcId,availability:'unknown',locationId:input.lastKnownLocationId??null,reason:'no confirmed current schedule'});
}
export type NpcWorldDecision={npcId:string;opportunityId:string;decision:'accept'|'decline'|'postpone';causalRef:string;origin:'GM_RESOLVED'|'CANON_SCHEDULE'};
export function validateNpcIndependentDecision(decision:NpcWorldDecision,knownOpportunityIds:ReadonlySet<string>):SimOutcome<NpcWorldDecision>{
 if(!knownOpportunityIds.has(decision.opportunityId)||!decision.causalRef)return deny('UNSUPPORTED_NPC_DECISION','NPC action requires materialized opportunity and cause');
 if(decision.origin!=='GM_RESOLVED'&&decision.origin!=='CANON_SCHEDULE')return deny('AGENCY_REQUIRED','Never resolve motives by random choice');return pass(decision);
}
