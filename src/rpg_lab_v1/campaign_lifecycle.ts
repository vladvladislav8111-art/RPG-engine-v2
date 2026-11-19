/** RPG Lab campaign lifecycle. No destructive deletes.
 * Archive markers live in the isolated RPG Lab KV prefix. Legacy Shura keys,
 * project templates, source-event archives and NPC memories are untouched.
 */
export type LabArchiveTarget={projectId:string;sessionId:string;expectedRevision:number};
export type LabArchiveMarker={
 projectId:string;sessionId:string;revision:number;
 archivedAt:string;reason:string;mode:"reversible_archive";
};
const ID=/^[A-Za-z0-9_-]{3,64}$/;
export function validateLabArchiveRequest(
 targets:LabArchiveTarget[],reason:string){
 if(!Array.isArray(targets)||targets.length<1||targets.length>4||
  typeof reason!=="string"||reason.trim().length<8||reason.length>300||
  targets.some(t=>!t||!ID.test(t.projectId)||!ID.test(t.sessionId)||
    !Number.isSafeInteger(t.expectedRevision)||t.expectedRevision<1)||
  new Set(targets.map(t=>t.projectId+"/"+t.sessionId)).size!==targets.length)
  throw Error("LAB_ARCHIVE_TARGETS_INVALID");
 return targets;
}
export function archivedLabKey(projectId:string,sessionId:string){
 if(!ID.test(projectId)||!ID.test(sessionId))throw Error("LAB_ARCHIVE_KEY_INVALID");
 return ["rpg-lab-v1","archived_sessions",projectId,sessionId] as const;
}
export function validateLabArchiveMarker(m:LabArchiveMarker){
 if(!m||!ID.test(m.projectId)||!ID.test(m.sessionId)||
   !Number.isSafeInteger(m.revision)||m.revision<1||
   typeof m.archivedAt!=="string"||!m.archivedAt||
   typeof m.reason!=="string"||m.reason.length<8||
   m.mode!=="reversible_archive")
  throw Error("LAB_ARCHIVE_MARKER_INVALID");
 return m;
}
