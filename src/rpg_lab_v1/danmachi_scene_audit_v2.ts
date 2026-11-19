/** Structured early-era DanMachi narration audit.
 * This checks claims WITH tags; unannotated literary prose cannot be proven.
 * No automatic canon spoilers, cross-character memory transfer or outcomes.
 */
import type {LabPack} from "./engine.ts";
import type {LabSession} from "./session.ts";
import {actorHasEraFact,DANMACHI_ERA_FACT_BY_ID} from "./danmachi_era_cores_v2.ts";
export type DanmachiCanonClaim={
 factId:string;assertion:"certain"|"reported"|"hypothesis";
 /** Source of THIS actor's personal observation/report, if applicable. */
 sourceRef?:string;
};
export type DanmachiNarrativeBeat={
 actorId:string;claims?:DanmachiCanonClaim[];
 /** Visible action actually described; requires recorded confirmation if claimed already done. */
 outcome?:{sourceRef:string;status:"completed"|"proposed"};
 /** Stable repetitive reaction signature, e.g. allen_shouts or hedin_adjusts_glove. */
 mannerismTag?:string;
 /** Identity claimed aloud in front of others. */
 publicIdentityClaim?:string;
 /** Intentional sudden trust / forgiveness shift. */
 newTrustWithoutEvent?:boolean;
};
export type DanmachiAuditProblem={
 beat:number;actorId:string;code:string;detail:string;
};
const personallyKnown=(s:LabSession,actorId:string,ref:string)=>
 (s.npcs[actorId]?.memories??[]).some(m=>
  m.sourceRef===ref||m.relayedSourceRef===ref);
const evidenceConfirmed=(s:LabSession,actorId:string,ref:string)=>{
 const ev=s.worldEvidence?.[ref];
 return !!ev&&ev.observedBy.includes(actorId)&&
  ev.status==="confirmed";
};
export function auditDanmachiEraScene(pack:LabPack,session:LabSession,
 beats:DanmachiNarrativeBeat[]){
 if(pack.worldId!=="danmachi.orario")
  return {readyToRender:true,failures:[],readOnly:true,metadataOnly:true};
 if(!Array.isArray(beats)||beats.length>64)throw Error("DANMACHI_AUDIT_BEATS_INVALID");
 const failures:DanmachiAuditProblem[]=[];
 const fail=(i:number,actorId:string,code:string,detail:string)=>
  failures.push({beat:i,actorId,code,detail});
 const counts=new Map<string,number>();
 for(let i=0;i<beats.length;i++){
  const b=beats[i];
  if(!b||!pack.npcProfiles[b.actorId])
   throw Error("DANMACHI_AUDIT_ACTOR_UNKNOWN");
  if(b.newTrustWithoutEvent)
   fail(i,b.actorId,"UNSUPPORTED_RELATIONSHIP_FLIP","Trust/forgiveness needs committed cause");
  if(b.publicIdentityClaim==="npc.freya"&&b.actorId==="npc.horn"){
   // Identity impersonation is plausible, but revelation must not be accidental.
   const knows=actorHasEraFact(session,"npc.horn","freya.horn.syr_secret");
   if(!knows)fail(i,b.actorId,"DISGUISE_SECRET_UNKNOWN","Missing own disguise knowledge");
  }
  if(b.publicIdentityClaim==="reveal_syr_secret"){
   const fact="freya.horn.syr_secret";
   if(!actorHasEraFact(session,b.actorId,fact))
    fail(i,b.actorId,"SECRET_OUTSIDE_ACTOR_KNOWLEDGE",fact);
   if(!personallyKnown(session,b.actorId,"freya.identity.revealed"))
    fail(i,b.actorId,"PREMATURE_SECRET_REVEAL","Reveal requires confirmed story event");
  }
  if(b.mannerismTag){
   const key=b.actorId+"|"+b.mannerismTag;
   const n=(counts.get(key)??0)+1;counts.set(key,n);
   if(n>=3)fail(i,b.actorId,"REPETITIVE_REACTION_PATTERN",key);
  }
  if(b.outcome?.status==="completed"&&
   !session.events.some(e=>e.sourceRef===b.outcome!.sourceRef))
   fail(i,b.actorId,"UNCOMMITTED_OUTCOME",b.outcome.sourceRef);
  for(const c of b.claims??[]){
   const f=DANMACHI_ERA_FACT_BY_ID[c.factId];
   if(!f){fail(i,b.actorId,"UNKNOWN_CANON_REFERENCE",c.factId);continue;}
   if(c.assertion==="hypothesis")continue;
   if(c.sourceRef!==undefined&&!personallyKnown(session,b.actorId,c.sourceRef))
    fail(i,b.actorId,"SOURCE_NOT_PERSONALLY_KNOWN",c.sourceRef);
   const own=actorHasEraFact(session,b.actorId,c.factId);
   if(!own){
    fail(i,b.actorId,f.status==="future_event"?
     "FUTURE_CANON_LEAK":"OTHER_ACTOR_KNOWLEDGE_LEAK",c.factId);
    continue;
   }
   if(c.assertion==="certain"&&f.status==="future_event"&&
      !evidenceConfirmed(session,b.actorId,c.factId))
    fail(i,b.actorId,"UNVERIFIED_CLAIM_AS_TRUTH",c.factId);
   if(c.factId==="freya.horn.syr_secret"&&
       b.publicIdentityClaim==="reveal_syr_secret"&&
       !personallyKnown(session,b.actorId,"freya.identity.revealed"))
    fail(i,b.actorId,"PREMATURE_SECRET_REVEAL",c.factId);
  }
 }
 return {schema:"DANMACHI_ERA_SCENE_AUDIT_V2",
  readyToRender:failures.length===0,failures,readOnly:true,metadataOnly:true,
  noAutomaticNarration:true,
  notes:"Structured-source audit only. GM must still assess canon voice and moral choices."};
}
