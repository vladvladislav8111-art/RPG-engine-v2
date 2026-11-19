/** Laboratory preview: original NPC promotion, never a KV write. */
import {validateLabPack,type LabPack,type LabNpc} from "./engine.ts";
import {validateLabSession,type LabSession,type LabNpcState} from "./session.ts";
export type LabOriginalNpcCore={
 role:string;homeLocationId:string;publicAppearance:string;normalSchedule:string;
 personalGoal:string;privateHistory:string;internalConflict:string;fear:string;
 values:string[];priorConnections:string[];autonomousActions:string[];
 relationshipGates:string[];boundaries:string[];departureConditions:string[];
};
export type LabOriginalNpcSeed={
 npcId:string;publicName:string;workplaceId:string;observedAppearance:string;
 firstEncounterRef:string;independentChoiceRef:string;witnessNpcId:string;
};
const ID=/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/;
const validId=(s:unknown):s is string=>typeof s==="string"&&ID.test(s)&&
 !["constructor","prototype","__proto__"].includes(s);
/** Requires a recorded encounter and a recorded *independent* decision.
 * Never promotes for repeated shopping, generosity or GM preference.
 */
export function previewOriginalNpcPromotion(pack:LabPack,session:LabSession,
 seed:LabOriginalNpcSeed,profile:LabNpc,
 historicalEvents:LabSession["events"]=[]){
 validateLabPack(pack);validateLabSession(session,pack);
 if(!seed||!profile||!validId(seed.npcId)||!seed.npcId.startsWith("npc.original.")||
 !validId(seed.firstEncounterRef)||!validId(seed.independentChoiceRef)||
 seed.firstEncounterRef===seed.independentChoiceRef||
 !validId(seed.witnessNpcId)||!pack.npcProfiles[seed.witnessNpcId]||
 !validId(seed.workplaceId)||!pack.locations[seed.workplaceId])
  throw Error("LAB_ORIGINAL_PROMOTION_SEED_INVALID");
 if(pack.npcProfiles[seed.npcId]||session.npcs[seed.npcId])
  throw Error("LAB_ORIGINAL_PROMOTION_ALREADY_REGISTERED");
 if(!profile.originalCore||profile.name!==seed.publicName||
 profile.originalCore.homeLocationId!==seed.workplaceId||
 profile.originalCore.publicAppearance!==seed.observedAppearance||
 profile.canonRef!=="original."+seed.npcId.slice("npc.original.".length)||
 profile.knownFacts.length!==0||!profile.voice?.sampleLines.length||
 !profile.habitualLogic?.limits.length||!profile.responsePatterns?.work_request||
 !profile.responsePatterns?.boundary_violation||!profile.responsePatterns?.disengagement)
  throw Error("LAB_ORIGINAL_PROMOTION_PROFILE_INCOMPLETE");
 const first=session.events.find(e=>e.sourceRef===seed.firstEncounterRef)??
  historicalEvents.find(e=>e.sourceRef===seed.firstEncounterRef);
 const choice=session.events.find(e=>e.sourceRef===seed.independentChoiceRef)??
  historicalEvents.find(e=>e.sourceRef===seed.independentChoiceRef);
 if(!first||!choice||first.kind!=="npc_background_contact"||
 choice.kind!=="npc_independent_choice"||
 first.locationId!==seed.workplaceId||choice.locationId!==seed.workplaceId||
 !first.summary.includes(seed.publicName)||!choice.summary.includes(seed.publicName)||
 !first.knownBy.includes(seed.witnessNpcId)||
 !choice.knownBy.includes(seed.witnessNpcId))
  throw Error("LAB_ORIGINAL_PROMOTION_NO_CONFIRMED_IDENTITY_OR_CHOICE");
 const witnesses=session.npcs[seed.witnessNpcId]?.memories??[];
 if(![first,choice].every(e=>witnesses.some(m=>m.sourceRef===e.sourceRef&&
 ["seen","heard","experienced"].includes(m.channel??""))))
  throw Error("LAB_ORIGINAL_PROMOTION_UNVERIFIED_WITNESS");
 const proposedPack=structuredClone(pack);
 proposedPack.npcProfiles[seed.npcId]=structuredClone(profile);
 validateLabPack(proposedPack);
 const memories=[first,choice].map((e,i)=>({
  sourceRef:e.sourceRef,summary:e.summary,perceivedFact:e.summary,learnedAt:e.time,
  eventTime:e.time,locationId:seed.workplaceId,knownBy:[seed.npcId],
  channel:"experienced",confidence:"certain",privacy:"private",
  salience:i===0?"ordinary":"important"
 }));
 const state:LabNpcState={knownFacts:[],memories,locationId:seed.workplaceId,
  locationSourceRef:choice.sourceRef,currentGoal:profile.originalCore.personalGoal};
 const proposedSession=structuredClone(session);
 proposedSession.npcs[seed.npcId]=state;
 validateLabSession(proposedSession,proposedPack);
 return {schema:"LAB_ORIGINAL_NPC_PROMOTION_PREVIEW_V1" as const,
  npcId:seed.npcId,name:profile.name,from:"background",to:"full_core",
  sourceRefs:[first.sourceRef,choice.sourceRef],
  proposedPack,proposedSession,
  committed:false as const,previewOnly:true as const,
  needsAtomicPackAndSessionWrite:true as const,
  authoredPrivateHistoryNotPlayerKnowledge:true as const,
  noAutomaticTrust:true as const};
}
