/**
 * Pure precheck for NPC Life V4 signed-history readiness.
 * It never grants Heat/KEY/XP, even with every claimed source flag true.
 */
export type MeaningfulDayClaim={
 actorId:string;day:number;
 kind:"SCENE_PRESENCE"|"SUBSTANTIVE_EXCHANGE"|"MEANINGFUL_RELATIONSHIP_EVENT";
 sourceRef:string;canonicalMemoryRef:string|null;
 meaningfulEvidence:string;signedOriginVerified:boolean;
};
export type HistoryReadinessClaim={
 actorId:string;worldDay:number;signedEpochId:string|null;
 genesisSigned:boolean;tailSigned:boolean;completeTxIndex:boolean;
 allEpochRowsSigned:boolean;chainContinuous:boolean;
 keyRotationContinuity:boolean;actorHistoryComplete:boolean;
 canonicalMemoryCorroborated:boolean;npcKnowledgeCorroborated:boolean;
 runtimeSnapshotStable:boolean;noOrphanWriter:boolean;
 meaningfulDays:readonly MeaningfulDayClaim[];
};
const actorId=/^npc\.[a-z0-9_.-]+$/i;
function isMeaningful(e:MeaningfulDayClaim):boolean {
 return (e.kind==="SUBSTANTIVE_EXCHANGE"&&e.sourceRef.startsWith("memory:"))||
 (e.kind==="MEANINGFUL_RELATIONSHIP_EVENT"&&
 (e.sourceRef.startsWith("memory:")||e.sourceRef.startsWith("relation:")));
}
export function reviewNpcHeatHistoryReadiness(c:HistoryReadinessClaim){
 const reasons:string[]=[];
 if(!actorId.test(c.actorId)||!Number.isSafeInteger(c.worldDay)||c.worldDay<1)
  reasons.push("INVALID_ACTOR_OR_DAY");
 if(!c.signedEpochId||!/^TEST-[a-z0-9._-]+$/i.test(c.signedEpochId))
  reasons.push("NO_SIGNED_V3_EPOCH_GENESIS");
 const required:ReadonlyArray<readonly [string,boolean]>=[
  ["EPOCH_GENESIS_NOT_AUTHENTICATED",c.genesisSigned],
  ["EPOCH_TAIL_NOT_AUTHENTICATED",c.tailSigned],
  ["FULL_TX_INDEX_NOT_VERIFIED",c.completeTxIndex],
  ["UNSIGNED_EPOCH_ROWS",c.allEpochRowsSigned],
  ["BROKEN_TX_HASH_CHAIN",c.chainContinuous],
  ["UNVERIFIED_KEY_ROTATION",c.keyRotationContinuity],
  ["INCOMPLETE_ACTOR_HISTORY",c.actorHistoryComplete],
  ["UNCORROBORATED_CANONICAL_MEMORY",c.canonicalMemoryCorroborated],
  ["UNCORROBORATED_NPC_KNOWLEDGE",c.npcKnowledgeCorroborated],
  ["UNSTABLE_RUNTIME_SNAPSHOT",c.runtimeSnapshotStable],
  ["WRITER_LOCK_OR_RECOVERY_PENDING",c.noOrphanWriter],
 ];
 for(const [reason,passed] of required)if(!passed)reasons.push(reason);
 const days=new Set<number>(),unique=new Set<string>();
 let rejected=0;
 for(const e of c.meaningfulDays.slice(0,256)){
  const verified=e.actorId===c.actorId&&Number.isSafeInteger(e.day)&&
   e.day>=1&&e.day<=c.worldDay&&e.signedOriginVerified&&isMeaningful(e)&&
   e.canonicalMemoryRef===e.sourceRef&&e.meaningfulEvidence.trim().length>=24;
  const id=[e.actorId,e.day,e.kind,e.sourceRef].join("|");
  if(!verified||unique.has(id)){rejected++;continue;}
  unique.add(id);days.add(e.day);
 }
 if(c.meaningfulDays.length>256)reasons.push("AUDIT_WINDOW_OVERFLOW");
 if(rejected)reasons.push("INVALID_OR_DUPLICATE_MEANINGFUL_CLAIMS");
 if(days.size<6)reasons.push("SIX_DISTINCT_MEANINGFUL_DAYS_NOT_PROVEN");
 return {
  schema:"NPC_HEAT_V4_HISTORY_READINESS_PRECHECK_V1" as const,
  mode:"READ_ONLY_UNATTESTED_SOURCE_CLAIMS" as const,
  actorId:c.actorId,meaningfulDayCount:days.size,rejectedClaims:rejected,
  status:reasons.length?"NOT_READY" as const:
   "PENDING_INDEPENDENT_GM_REVIEW" as const,
  blockers:reasons,
  historyAuthenticatedForPromotion:false as const,
  automaticHeatPromotion:false as const,
  automaticKeyPromotion:false as const,
  automaticXpOrSupAward:false as const,
  memoryPruningAuthorized:false as const,
  committedWrites:0 as const,
 };
}
