import type {MigrationBackupReceipt} from "./migration_receipt.ts";
/** Atomic roleplay turn gate for opt-in / newly created strict RPG Lab sessions.
 *
 * The narration plan is structured GM metadata, never player-facing prose.
 * It is validated against the *candidate after-state* before CAS persists.
 * No LLM call occurs here: natural-language tone/character remains GM duty.
 */
import type {LabPack} from "./engine.ts";
import {applyConfirmedLabEvent,narrativeMinute,type LabConfirmedEvent} from "./events.ts";
import {requiredLabWorldCycleActors} from "./living_world_cycle_v2.ts";
import type {LabSession} from "./session.ts";
import {reviewLabNarration,type LabNarrativeBeat} from "./narrative_guard.ts";
export type LabWorldCycleReview={
 fromMinute:number;toMinute:number;
 actorReviews:{npcId:string;status:"acted"|"blocked"|"no_change";
   reason:string;sourceRefs?:string[]}[];
};
export type LabTurnNarrationPlan={
 npcIds:string[];beats:LabNarrativeBeat[];
};
export type LabTurnWithPlan=LabConfirmedEvent&{
 narrationPlan?:LabTurnNarrationPlan;
 worldCycleReview?:LabWorldCycleReview;
};
const ID=/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/;
const good=(s:unknown)=>typeof s==="string"&&ID.test(s)&&
 !["constructor","prototype","__proto__"].includes(s);
const sortedUnique=(xs:string[])=>[...new Set(xs)].sort();

function activeNpcRoles(event:LabConfirmedEvent){
 const participants:string[]=[];
 const require=(x:string)=>participants.push(x);
 for(const x of event.npcInteractions??[]){
  require(x.initiatorNpcId);require(x.recipientNpcId);
 }
 for(const x of event.npcPositions??[])require(x.npcId);
 for(const x of event.socialDynamics??[])require(x.npcId);
 for(const x of event.rumorRelays??[]){
  require(x.speakerNpcId);require(x.listenerNpcId);
 }
 for(const x of event.npcDecisionChanges??[])require(x.npcId);
 for(const x of event.npcSocial??[])require(x.npcId);
 for(const x of event.moodChanges??[])require(x.npcId);
 for(const x of event.worldProjectChanges??[])require(x.record.ownerNpcId);
 for(const x of event.worldActions??[])require(x.npcId);
 for(const x of event.features??[]){
  if(x.channel==="seen"&&x.significance!=="routine")require(x.npcId);
 }
 for(const x of event.observations??[]){
  if(["important","life_defining"].includes(x.salience) &&
   ["seen","heard","experienced"].includes(x.channel))require(x.npcId);
 }
 for(const x of event.worldEvidence??[]){
  if(x.significance==="transformative")for(const observer of x.observedBy)require(observer);
 }
 return sortedUnique(participants);
}
export function applyGuardedLabEvent(session:LabSession,pack:LabPack,
 event:LabTurnWithPlan,expectedRevision:number,historicProof?:LabSession["events"][number],backupReceipt?:MigrationBackupReceipt){
 const changed=applyConfirmedLabEvent(session,pack,event,historicProof,backupReceipt);
 if(session.roleplayGuard!=="strict")
  return {next:changed,guardRequired:false,guardVerified:false,checkedActorIds:[]};
 let cycleVerified=false;
 const prior=narrativeMinute(session.gameClock);
 const after=narrativeMinute(event.time);
 if(prior!==null&&after!==null&&after-prior>=720){
  const cover=requiredLabWorldCycleActors(session,after);
  if(cover.length>0){
   const check=event.worldCycleReview;
   if(!check||check.fromMinute!==prior||check.toMinute!==after||
      !Array.isArray(check.actorReviews)||check.actorReviews.length>16||
      new Set(check.actorReviews.map(x=>x.npcId)).size!==check.actorReviews.length)
    throw Error("LAB_STRICT_WORLD_CYCLE_REVIEW_REQUIRED");
   const reviewed=new Set(check.actorReviews.map(x=>x.npcId));
   if(cover.some(x=>!reviewed.has(x)))
    throw Error("LAB_STRICT_WORLD_CYCLE_ACTORS_MISSING:"+
     cover.filter(x=>!reviewed.has(x)).join(","));
   cycleVerified=true;
   for(const item of check.actorReviews){
    if(!good(item.npcId)||!pack.npcProfiles[item.npcId]||
       !["acted","blocked","no_change"].includes(item.status)||
       typeof item.reason!=="string"||item.reason.trim().length<12||
       item.reason.length>320||
       (item.sourceRefs!==undefined&&
        (!Array.isArray(item.sourceRefs)||item.sourceRefs.length>12||
         item.sourceRefs.some(x=>!good(x)))))
     throw Error("LAB_STRICT_WORLD_CYCLE_REVIEW_INVALID");
    const didAct=(event.worldActions??[]).some(x=>x.npcId===item.npcId)||
     (event.npcInteractions??[]).some(x=>
      x.initiatorNpcId===item.npcId||x.recipientNpcId===item.npcId)||
     (event.npcDecisionChanges??[]).some(x=>x.npcId===item.npcId)||
     (event.worldProjectChanges??[]).some(x=>x.record.ownerNpcId===item.npcId)||
     (event.rumorRelays??[]).some(x=>x.speakerNpcId===item.npcId);
    if(item.status==="acted"&&!didAct)
     throw Error("LAB_STRICT_WORLD_CYCLE_CLAIMED_ACTION_MISSING:"+item.npcId);
    if(item.sourceRefs?.some(ref=>!session.npcs[item.npcId]?.memories.some(m=>
       m.sourceRef===ref||m.relayedSourceRef===ref)&&
      !Object.values(session.worldProjects??{}).some(p=>
       p.ownerNpcId===item.npcId&&(p.originRef===ref||p.latestEvidenceRef===ref))))
      throw Error("LAB_STRICT_WORLD_CYCLE_SOURCE_UNKNOWN:"+item.npcId);
   }
  }
 }
 const required=activeNpcRoles(event);
 if(required.length===0)
  return {next:changed,guardRequired:cycleVerified,guardVerified:cycleVerified,checkedActorIds:[]};
 const plan=event.narrationPlan;
 if(!plan||!Array.isArray(plan.npcIds)||!Array.isArray(plan.beats))
  throw Error("LAB_STRICT_NARRATION_PLAN_REQUIRED");
 if(required.length>8||plan.npcIds.length>8)
  throw Error("LAB_STRICT_TURN_ACTOR_LIMIT");
 if(plan.npcIds.length!==new Set(plan.npcIds).size||
    !plan.npcIds.every((x:unknown)=>good(x)&&Boolean(pack.npcProfiles[x as string])))
  throw Error("LAB_STRICT_TURN_ACTORS_INVALID");
 const included=new Set(plan.npcIds);
 if(required.some(x=>!included.has(x)))
  throw Error("LAB_STRICT_REQUIRED_ACTORS_MISSING:"+required.filter(x=>!included.has(x)).join(","));
 // The entire set of significant actors must have some structured beat.
 if(required.some(actor=>!plan.beats.some(b=>b.actorId===actor)))
  throw Error("LAB_STRICT_ACTOR_BEAT_MISSING");
 for(const act of event.npcInteractions??[]){
  if(!plan.beats.some(b=>b.actorId===act.initiatorNpcId&&
        ["speech","action"].includes(b.kind))||
     !plan.beats.some(b=>b.actorId===act.recipientNpcId))
    throw Error("LAB_STRICT_NPC_INTERACTION_NOT_NARRATED");
 }
 for(const decision of event.npcDecisionChanges??[]){
  if(!plan.beats.some(b=>b.actorId===decision.npcId&&
    b.decision?.subjectId===decision.subjectId&&
    b.decision.stance===decision.stance))
    throw Error("LAB_STRICT_NPC_DECISION_NOT_NARRATED");
 }
 for(const change of event.worldProjectChanges??[]){
  if(!plan.beats.some(b=>b.actorId===change.record.ownerNpcId&&
     b.projectId===change.projectId))
    throw Error("LAB_STRICT_WORLD_WORK_OMITTED");
 }
 const review=reviewLabNarration(pack,changed,{
  npcIds:plan.npcIds,expectedSessionRevision:expectedRevision+1,
  beats:plan.beats,contextEventRef:event.sourceRef,
 },expectedRevision+1);
 if(!review.readyToRender)
  throw Error("LAB_STRICT_NARRATION_REJECTED:"+review.failures
   .map(x=>x.code+":"+x.actorId+":"+x.detail).slice(0,8).join(",")+
   (review.overdueProjects.length?
    ":OVERDUE:"+review.overdueProjects.join(","):""));
 return {next:changed,guardRequired:true,guardVerified:true,
  checkedActorIds:required};
}
