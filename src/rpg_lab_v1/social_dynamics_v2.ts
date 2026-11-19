/** Persistent directed NPC social state for RPG Lab.
 * No canonical personality rewrite, no automatic NPC friendship, and
 * social dynamics never grant knowledge of another actor's secrets.
 */
export type LabSocialVector={
 towardNpcId:string;trust:number;affinity:number;tension:number;
 encounters:number;lastSourceRef:string;lastMinute:number;
};
export type LabSocialSignal={
 npcId:string;towardNpcId:string;
 trustDelta:number;affinityDelta:number;tensionDelta:number;
 evidenceRefs:string[];
};
const id=/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/;
export const validSocialId=(v:unknown):v is string=>
 typeof v==="string"&&id.test(v)&&
 !["constructor","prototype","__proto__"].includes(v);
const bounded=(x:unknown,lo:number,hi:number)=>
 Number.isSafeInteger(x)&&Number(x)>=lo&&Number(x)<=hi;
export function validateLabSocialVector(targetId:string,v:LabSocialVector){
 if(!validSocialId(targetId)||!v||v.towardNpcId!==targetId||
   !bounded(v.trust,-10,10)||!bounded(v.affinity,-10,10)||
   !bounded(v.tension,0,10)||!bounded(v.encounters,1,10000)||
   !validSocialId(v.lastSourceRef)||!bounded(v.lastMinute,0,1e9))
   throw Error("LAB_SOCIAL_VECTOR_INVALID");
 return v;
}
export function applyLabSocialSignal(
 prior:LabSocialVector|undefined,signal:LabSocialSignal,
 sourceRef:string,minute:number
):LabSocialVector{
 if(!signal||!validSocialId(signal.npcId)||!validSocialId(signal.towardNpcId)||
  signal.npcId===signal.towardNpcId||
  !validSocialId(sourceRef)||!bounded(minute,0,1e9)||
  !bounded(signal.trustDelta,-4,4)||!bounded(signal.affinityDelta,-4,4)||
  !bounded(signal.tensionDelta,-4,4)||
  !Array.isArray(signal.evidenceRefs)||signal.evidenceRefs.length<1||
  signal.evidenceRefs.length>12||!signal.evidenceRefs.every(validSocialId)||
  new Set(signal.evidenceRefs).size!==signal.evidenceRefs.length)
  throw Error("LAB_SOCIAL_SIGNAL_INVALID");
 if(prior)validateLabSocialVector(signal.towardNpcId,prior);
 const clamp=(n:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,n));
 return validateLabSocialVector(signal.towardNpcId,{
  towardNpcId:signal.towardNpcId,
  trust:clamp((prior?.trust??0)+signal.trustDelta,-10,10),
  affinity:clamp((prior?.affinity??0)+signal.affinityDelta,-10,10),
  tension:clamp((prior?.tension??0)+signal.tensionDelta,0,10),
  encounters:(prior?.encounters??0)+1,
  lastSourceRef:sourceRef,lastMinute:minute,
 });
}
