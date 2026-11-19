/** Verified one-shot background-to-full NPC promotion.
 * Both the shared project profile and this session's new NPC memory commit
 * in the same Deno KV CAS transaction. No game-clock change or legacy writes.
 */
import {validateLabPack,type LabNpc} from "./engine.ts";
import {validateLabSession,type LabSession} from "./session.ts";
import {decodeLabPack,encodeLabPack,type LabStored} from "./storage_codec.ts";
import {decodeLabSessionFromKv,prepareLabSessionHead} from "./session_kv.ts";
import {encodeLabSession,type LabSessionStored} from "./session_storage.ts";
import {archivedLabKey} from "./campaign_lifecycle.ts";
import {previewOriginalNpcPromotion,type LabOriginalNpcSeed} from "./original_npc_promotion.ts";
import type {LabConfirmedEvent} from "./events.ts";

const ROOT="rpg-lab-v1";
const KEY=/^[A-Za-z0-9_-]{3,64}$/;
export type LabPromoteOriginalNpcArgs={
 confirm:"PROMOTE_CONFIRMED_ORIGINAL_NPC";
 projectId:string;sessionId:string;
 expectedPackRevision:number;expectedSessionRevision:number;
 seed:LabOriginalNpcSeed;profile:LabNpc;
};
type EventReceipt={revision:number;event:LabConfirmedEvent};
const eventProjection=(ev:LabConfirmedEvent):LabSession["events"][number]=>({
 sourceRef:ev.sourceRef,summary:ev.summary,time:ev.time,knownBy:ev.knownBy,
 ...(ev.kind?{kind:ev.kind}:{}),
 ...(ev.locationId?{locationId:ev.locationId}:{}),
});
/** Inject a KV handle for tests. A failed gate or CAS leaves both heads intact.
 * Archived evidence is recovered ONLY from immutable, confirmed event receipts.
 */
export async function promoteOriginalNpcInKv(kv:Deno.Kv,args:LabPromoteOriginalNpcArgs){
 if(!args||args.confirm!=="PROMOTE_CONFIRMED_ORIGINAL_NPC"||
   !KEY.test(args.projectId)||!KEY.test(args.sessionId)||
   !Number.isSafeInteger(args.expectedPackRevision)||args.expectedPackRevision<1||
   !Number.isSafeInteger(args.expectedSessionRevision)||args.expectedSessionRevision<1)
  throw Error("LAB_ORIGINAL_PROMOTION_REQUEST_INVALID");
 const {projectId,sessionId,seed,profile}=args;
 const projectKey=[ROOT,"projects",projectId],sessionKey=[ROOT,"sessions",projectId,sessionId];
 const archiveKey=archivedLabKey(projectId,sessionId);
 const bindingKey=[ROOT,"google_bindings",projectId];
 const [savedPack,savedSession,archive,binding]=await Promise.all([
  kv.get<LabStored>(projectKey),kv.get<LabSessionStored>(sessionKey),
  kv.get(archiveKey),kv.get(bindingKey)
 ]);
 if(!savedPack.value)throw Error("LAB_PROJECT_NOT_FOUND");
 if(!savedSession.value)throw Error("LAB_SESSION_NOT_FOUND");
 if(archive.value)throw Error("LAB_CAMPAIGN_ARCHIVED");
 if(binding.value)throw Error("LAB_ORIGINAL_PROMOTION_DRIVE_CONTROLLED");
 if(savedPack.value.revision!==args.expectedPackRevision||
    savedSession.value.revision!==args.expectedSessionRevision)
  throw Error("LAB_ORIGINAL_PROMOTION_REVISION_CONFLICT");
 const pack=validateLabPack(await decodeLabPack(savedPack.value));
 const session=validateLabSession(
  await decodeLabSessionFromKv(kv,projectId,sessionId,savedSession.value,pack),pack);
 if(pack.projectId!==projectId||session.sessionId!==sessionId)
  throw Error("LAB_ORIGINAL_PROMOTION_ID_MISMATCH");
 if(!seed||typeof seed.firstEncounterRef!=="string"||
    typeof seed.independentChoiceRef!=="string")
  throw Error("LAB_ORIGINAL_PROMOTION_SEED_INVALID");
 const historical:LabSession["events"]=[];
 for(const sourceRef of [seed.firstEncounterRef,seed.independentChoiceRef]){
  if(session.events.some(ev=>ev.sourceRef===sourceRef))continue;
  const saved=await kv.get<EventReceipt>([
   ROOT,"event_refs",projectId,sessionId,sourceRef
  ]);
  const ev=saved.value?.event;
  if(!saved.value||!Number.isSafeInteger(saved.value.revision)||
     saved.value.revision<1||saved.value.revision>args.expectedSessionRevision||
     !ev||ev.sourceRef!==sourceRef||ev.gmConfirmed!==true)
   throw Error("LAB_ORIGINAL_PROMOTION_ARCHIVED_EVIDENCE_MISSING");
  historical.push(eventProjection(ev));
 }
 const preview=previewOriginalNpcPromotion(pack,session,seed,profile,historical);
 const nextPack=await encodeLabPack(preview.proposedPack,args.expectedPackRevision+1);
 const nextSession=await encodeLabSession(
  preview.proposedSession,preview.proposedPack,args.expectedSessionRevision+1);
 const sessionHead=await prepareLabSessionHead(kv,projectId,sessionId,nextSession);
 const done=await kv.atomic()
  .check({key:projectKey,versionstamp:savedPack.versionstamp})
  .check({key:sessionKey,versionstamp:savedSession.versionstamp})
  .check({key:archiveKey,versionstamp:archive.versionstamp})
  .check({key:bindingKey,versionstamp:binding.versionstamp})
  .set(projectKey,nextPack)
  .set(sessionKey,sessionHead)
  .commit();
 if(!done.ok)throw Error("LAB_ORIGINAL_PROMOTION_REVISION_CONFLICT");
 return {
  ok:true as const,schema:"RPG_LAB_ORIGINAL_NPC_PROMOTION_V1" as const,
  projectId,sessionId,npcId:seed.npcId,name:profile.name,
  packRevision:nextPack.revision,sessionRevision:nextSession.revision,
  evidenceRefs:preview.sourceRefs,committed:true as const,
  gameClock:session.gameClock,noClockAdvance:true as const,
  noAutomaticTrust:true as const,privateCoreGmOnly:true as const,
  otherSessionsChanged:false as const,legacySaveTouched:false as const,
 };
}
