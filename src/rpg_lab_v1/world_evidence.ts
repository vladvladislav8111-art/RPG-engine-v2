/** Typed event evidence in the isolated RPG Lab world.
 * Objective ledger records bounded GM-confirmed tests/observations, not
 * omniscience in NPC minds. Unverified rumors never become measured fact.
 */
export type LabWorldEvidenceKind="observed"|"measured"|"reported"|"hypothesis";
export type LabWorldEvidenceLevel="established"|"provisional"|"unverified";
export type LabWorldEvidence={
 factId:string;sourceRef:string;statement:string;scope:string;
 kind:LabWorldEvidenceKind;level:LabWorldEvidenceLevel;
 significance:"routine"|"notable"|"transformative";
 method?:string;locationId?:string;observedBy:string[];
 supersedesFactId?:string;
};
export type LabWorldEvidenceInput=Omit<LabWorldEvidence,"sourceRef">;
const ID=/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/;
const okId=(v:unknown):v is string=>typeof v==="string"&&ID.test(v)&&
 !["__proto__","prototype","constructor"].includes(v);
const phrase=(x:unknown,n:number)=>typeof x==="string"&&x.trim().length>0&&x.length<=n;
const levels=["established","provisional","unverified"];
const kinds=["observed","measured","reported","hypothesis"];
export function validateLabWorldEvidence(f:LabWorldEvidence):LabWorldEvidence{
 if(!f||!okId(f.factId)||!okId(f.sourceRef)||
   !phrase(f.statement,400)||!phrase(f.scope,280)||
   !kinds.includes(f.kind)||!levels.includes(f.level)||
   !["routine","notable","transformative"].includes(f.significance)||
   (f.method!==undefined&&!phrase(f.method,260))||
   (f.locationId!==undefined&&!okId(f.locationId))||
   !Array.isArray(f.observedBy)||f.observedBy.length>24||
   !f.observedBy.every(okId)||new Set(f.observedBy).size!==f.observedBy.length||
   (f.supersedesFactId!==undefined&&!okId(f.supersedesFactId)))
   throw Error("LAB_WORLD_EVIDENCE_INVALID");
 if(["reported","hypothesis"].includes(f.kind)&&f.level==="established")
   throw Error("LAB_WORLD_EVIDENCE_UNVERIFIED_UPGRADE");
 if(f.kind==="measured"&&!phrase(f.method,260))
   throw Error("LAB_WORLD_EVIDENCE_MEASUREMENT_METHOD_REQUIRED");
 if(["observed","measured"].includes(f.kind)&&f.observedBy.length===0)
   throw Error("LAB_WORLD_EVIDENCE_DIRECT_WITNESS_REQUIRED");
 return f;
}
/** A claim can be described as reported; confirming a claim requires a NEW
 * independently source-backed test/observation and a supersession record.
 */
export function permittedLabEvidenceClaim(
 f:LabWorldEvidence,assertion:"established"|"tentative"|"reported"){
 return assertion==="reported"||
  assertion==="tentative"&&f.level!=="unverified"||
  assertion==="established"&&f.level==="established"&&
    ["observed","measured"].includes(f.kind);
}
