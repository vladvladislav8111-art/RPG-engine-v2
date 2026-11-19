/** Slowly acquired non-core tendencies. No canonical anchor is rewritten.
 * Rules resolve confirmed observations, not passive time or narrator prose.
 */
import type {LabNpc} from "./engine.ts";
import type {LabNpcState} from "./session.ts";
export type LabNpcAdaptiveAxis={
 axisId:string;aspect:"opinion"|"habit"|"method"|"interaction";
 label:string;lowerPole:string;upperPole:string;coreGuard:string;
};
export type LabNpcAdaptationStep={sourceRef:string;minute:number;delta:-1|1;interpretation:string};
export type LabNpcAdaptationState={
 axisId:string;score:number;revision:number;
 lastSourceRef:string;lastMinute:number;interpretation:string;
 evidenceRefs:string[];recentSteps:LabNpcAdaptationStep[];
};
export type LabNpcAdaptationChange={
 npcId:string;axisId:string;delta:-1|1;interpretation:string;evidenceRefs:string[];
};
const RE=/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/;
const id=(s:unknown):s is string=>
 typeof s==="string"&&RE.test(s)&&!["constructor","prototype","__proto__"].includes(s);
const txt=(s:unknown,max:number):s is string=>
 typeof s==="string"&&s.trim().length>0&&s.length<=max;
const num=(n:unknown,min:number,max:number)=>
 Number.isSafeInteger(n)&&Number(n)>=min&&Number(n)<=max;
export function validateLabNpcAdaptiveAxes(axes:LabNpcAdaptiveAxis[]){
 if(!Array.isArray(axes)||axes.length>8||
    new Set(axes.map(a=>a.axisId)).size!==axes.length)
  throw Error("LAB_ADAPTIVE_AXES_INVALID");
 for(const a of axes)
  if(!a||!id(a.axisId)||!["opinion","habit","method","interaction"].includes(a.aspect)||
     !txt(a.label,120)||!txt(a.lowerPole,240)||!txt(a.upperPole,240)||!txt(a.coreGuard,240))
   throw Error("LAB_ADAPTIVE_AXIS_INVALID");
 return axes;
}
export function validateLabNpcAdaptation(axisId:string,v:LabNpcAdaptationState){
 if(!id(axisId)||!v||v.axisId!==axisId||!num(v.score,-3,3)||
    !num(v.revision,1,10000)||!id(v.lastSourceRef)||!num(v.lastMinute,0,1e9)||
    !txt(v.interpretation,280)||!Array.isArray(v.evidenceRefs)||
    v.evidenceRefs.length<2||v.evidenceRefs.length>6||
    v.evidenceRefs.some(r=>!id(r))||
    new Set(v.evidenceRefs).size!==v.evidenceRefs.length||
    !v.evidenceRefs.includes(v.lastSourceRef)||
    !Array.isArray(v.recentSteps)||v.recentSteps.length<1||v.recentSteps.length>24)
  throw Error("LAB_ADAPTATION_INVALID");
 let last=-1;
 for(const step of v.recentSteps){
  if(!step||!id(step.sourceRef)||!num(step.minute,0,1e9)||
     ![-1,1].includes(step.delta)||!txt(step.interpretation,280)||
     step.minute<last)
   throw Error("LAB_ADAPTATION_HISTORY_INVALID");
  last=step.minute;
 }
 if(v.recentSteps.at(-1)?.sourceRef!==v.lastSourceRef||
    v.recentSteps.at(-1)?.minute!==v.lastMinute||
    new Set(v.recentSteps.map(s=>s.sourceRef)).size!==v.recentSteps.length)
  throw Error("LAB_ADAPTATION_HISTORY_MISMATCH");
 return v;
}
/** An approved one-step interpretation of this NPC's own observations.
 * Require direct new evidence PLUS independent earlier direct evidence.
 * Inertia prevents repeated changes on the same afternoon.
 */
export function evolveLabNpcAdaptation(profile:LabNpc,prior:LabNpcState,
 observed:LabNpcState,change:LabNpcAdaptationChange,sourceRef:string,minute:number
):LabNpcAdaptationState{
 if(!change||!id(change.npcId)||!id(change.axisId)||!id(sourceRef)||
    !num(minute,0,1e9)||![-1,1].includes(change.delta)||
    !txt(change.interpretation,280)||!Array.isArray(change.evidenceRefs)||
    change.evidenceRefs.length<2||change.evidenceRefs.length>6||
    change.evidenceRefs.some(r=>!id(r))||
    !change.evidenceRefs.includes(sourceRef)||
    new Set(change.evidenceRefs).size!==change.evidenceRefs.length)
  throw Error("LAB_ADAPTATION_CHANGE_INVALID");
 if(!profile.adaptiveAxes?.some(a=>a.axisId===change.axisId))
  throw Error("LAB_ADAPTATION_AXIS_NOT_ALLOWED");
 const prev=prior.adaptations?.[change.axisId];
 if(prev)validateLabNpcAdaptation(change.axisId,prev);
 if(prev&&minute-prev.lastMinute<120)throw Error("LAB_ADAPTATION_TOO_RAPID");
 // A new impression must develop from the most recently accepted firsthand
 // evidence for this axis. Old unrelated memories cannot be recycled forever.
 if(prev&&!change.evidenceRefs.includes(prev.lastSourceRef))
  throw Error("LAB_ADAPTATION_CAUSAL_CHAIN_BROKEN");
 const oldProof=change.evidenceRefs.some(ref=>ref!==sourceRef&&prior.memories.some(m=>
   m.sourceRef===ref&&["seen","heard","experienced"].includes(m.channel??"")&&
   m.salience!=="fleeting"));
 const newProof=observed.memories.some(m=>m.sourceRef===sourceRef&&
   ["seen","heard","experienced"].includes(m.channel??"")&&m.salience!=="fleeting");
 if(!oldProof||!newProof||!change.evidenceRefs.every(ref=>
   observed.memories.some(m=>m.sourceRef===ref)))
  throw Error("LAB_ADAPTATION_EVIDENCE_NOT_PERSONAL");
 const score=(prev?.score??0)+change.delta;
 if(score>3||score< -3)throw Error("LAB_ADAPTATION_MAX_SHIFT");
 const step={sourceRef,minute,delta:change.delta,interpretation:change.interpretation};
 return validateLabNpcAdaptation(change.axisId,{
  axisId:change.axisId,score,revision:(prev?.revision??0)+1,
  lastSourceRef:sourceRef,lastMinute:minute,interpretation:change.interpretation,
  evidenceRefs:[...change.evidenceRefs],
  recentSteps:[...(prev?.recentSteps??[]),step].slice(-24)
 });
}
