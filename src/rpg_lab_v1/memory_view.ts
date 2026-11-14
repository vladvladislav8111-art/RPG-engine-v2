/** Privacy-aware, read-only memory retrieval from an authoritative RPG Lab session.
 * Subjective memories are not canon facts; readers see only the NPCs selected.
 */
import {validateLabSession,type LabSession,type LabMemory} from "./session.ts";
import type {LabPack} from "./engine.ts";
import {featureReview} from "./npc_perception.ts";
const ID=/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/;
const rank=(s?:string)=>s==="life_defining"?4:s==="important"?3:s==="ordinary"?2:1;
export type LabMemoryViewRequest={
 npcIds?:string[];maxPerNpc?:number;includePrivate?:boolean;query?:string;
};
export function reviewLabSessionMemory(pack:LabPack,session:LabSession,req:LabMemoryViewRequest={}){
 validateLabSession(session,pack);
 if(!req||typeof req!=="object"||Array.isArray(req))throw Error("LAB_MEMORY_QUERY_INVALID");
 const npcIds=req.npcIds??Object.keys(session.npcs).slice(0,12);
 if(!Array.isArray(npcIds)||npcIds.length>24||
    npcIds.some(x=>typeof x!=="string"||!ID.test(x)||!pack.npcProfiles[x])||
    new Set(npcIds).size!==npcIds.length)throw Error("LAB_MEMORY_NPC_IDS_INVALID");
 const maxPerNpc=req.maxPerNpc??8;
 if(!Number.isInteger(maxPerNpc)||maxPerNpc<1||maxPerNpc>24)throw Error("LAB_MEMORY_LIMIT_INVALID");
 const includePrivate=req.includePrivate??false;
 if(typeof includePrivate!=="boolean")throw Error("LAB_MEMORY_PRIVACY_INVALID");
 const query=req.query??"";
 if(typeof query!=="string"||query.length>120)throw Error("LAB_MEMORY_QUERY_INVALID");
 const needle=query.trim().toLowerCase();
 const report=npcIds.map(npcId=>{
  const state=session.npcs[npcId];
  const memories=(state?.memories??[]).filter(m=>
    (includePrivate||m.privacy==="public")&&
    (!needle||[m.summary,m.sourceRef,m.sourceActor??"",m.locationId??""]
       .some(t=>t.toLowerCase().includes(needle))));
  // Chronology is retained by learnedAt, which may be a narrative clock; never
  // fabricate real timestamps. Within equal salience, preserve save order.
  const selected=memories.map((m,i)=>({m,i})).sort((a,b)=>rank(b.m.salience)-rank(a.m.salience)||b.i-a.i)
   .slice(0,maxPerNpc).map(({m})=>({
    sourceRef:m.sourceRef,learnedAt:m.learnedAt,eventTime:m.eventTime??null,
    locationId:m.locationId??null,perceivedFact:m.perceivedFact??m.summary,
    channel:m.channel??"unspecified",sourceActor:m.sourceActor??null,
    relayedSourceRef:m.relayedSourceRef??null,confidence:m.confidence??"unspecified",
    salience:m.salience??"unspecified",privacy:m.privacy??"unspecified",
    sourceAttestedBySave:true,objectiveTruthGuaranteed:false,
   }));
  return {npcId,name:pack.npcProfiles[npcId].name,
    currentGoal:includePrivate?(state?.currentGoal??null):null,
    relationships:includePrivate?(state?.relationships??{}):{},
    memories:selected,
    featureFamiliarity:featureReview(state?.perceptions,includePrivate)
      .filter(p=>!needle||p.featureId.toLowerCase().includes(needle)||
       (p.lastInterpretation??"").toLowerCase().includes(needle))
      .slice(0,maxPerNpc),
    matchingMemoryCount:memories.length,
    hiddenOrUnselectedCount:(state?.memories.length??0)-selected.length,
    canonicalPersonalityChanged:false};
 });
 return {schema:"RPG_LAB_MEMORY_VIEW_V1",projectId:session.projectId,
  sessionId:session.sessionId,gameClock:session.gameClock,readOnly:true,
  sourceAttestedBySave:true,committed:false,includePrivate,
  npcSummaries:report,
  independentWorldEvents:(session.worldEvents??[]).filter(x=>
   (includePrivate||x.privacy==="public")&&
   npcIds.includes(x.npcId)&&(!needle||x.action.toLowerCase().includes(needle)||
    x.outcome.toLowerCase().includes(needle))).slice(-32),
  notes:"Subjective perceptions, hearsay and goal proposals are not objective canon. Features require direct sightings to increase habituation."};
}
