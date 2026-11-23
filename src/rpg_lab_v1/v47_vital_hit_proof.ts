/** A vital strike must be scoped to this one confirmed CAS combat event,
 * this active encounter and this opponent. The ref is a correlation token,
 * NOT a signature; the existing authenticated GM/event writer supplies trust.
 * Vital damage is never applied if the server hit roll misses.
 */
const REF=/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/;
export type VitalOrgan='brain'|'heart'|'magic_stone';
export type ScopedVitalAttempt={
 sourceRef:string;encounterStartedRef:string;enemyRef:string;
 monsterId:string;targetLocation:string;vitalTarget:VitalOrgan;
 hasMagicStone:boolean;
};
const possible:Record<VitalOrgan,readonly string[]>={
 brain:['head','eye','left_eye','right_eye','skull'],
 heart:['chest','torso','heart'],
 magic_stone:['core','magic_core','stone_chamber'],
};
function id(x:unknown):x is string{return typeof x==='string'&&REF.test(x);}
export function validateVitalAttempt(a:ScopedVitalAttempt):void{
 if(!a||![a.sourceRef,a.encounterStartedRef,a.enemyRef,a.monsterId].every(id)||
  !Object.hasOwn(possible,a.vitalTarget)||
  typeof a.targetLocation!=='string'||
  !possible[a.vitalTarget].includes(a.targetLocation)||
  (a.vitalTarget==='magic_stone'&&!a.hasMagicStone))
  throw Error('V47_VITAL_HIT_EVIDENCE_INVALID');
}
export function scopedVitalProofRef(a:ScopedVitalAttempt):string{
 validateVitalAttempt(a);
 let h1=2166136261>>>0,h2=2166136261>>>0;
 const key=`v47.vital|${a.sourceRef}|${a.encounterStartedRef}|${a.enemyRef}|${a.monsterId}|${a.targetLocation}|${a.vitalTarget}|${a.hasMagicStone}`;
 for(let i=0;i<key.length;i++){
  const code=key.charCodeAt(i);
  h1=Math.imul(h1^code,16777619);h2=Math.imul(h2^(code+i),16777619);
 }
 return `v47.vital.${(h1>>>0).toString(16).padStart(8,'0')}${(h2>>>0).toString(16).padStart(8,'0')}`;
}
export function validScopedVitalProof(proofRef:string|undefined,a:ScopedVitalAttempt):boolean{
 if(!id(proofRef))return false;
 try{return proofRef===scopedVitalProofRef(a);}catch{return false;}
}
