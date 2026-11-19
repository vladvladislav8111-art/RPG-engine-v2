/** Source-bounded, location-specific background gossip.
 * A rumor is a reported claim, never a proved world fact or player knowledge.
 */
import type {LabPack} from "./engine.ts";
import type {LabSession} from "./session.ts";
import type {LabConfirmedEvent} from "./events.ts";
export type LabAmbientRumor={
 rumorId:string;topic:string;claim:string;locationId:string;
 originRef:string;lastRef:string;recordedAt:string;
 sourceKind:"public_event"|"local_repetition"|"witness_relay";
 parentRumorId?:string;sourceNpcId?:string;
 status:"unverified"|"disputed";
};
export type LabAmbientRumorChange={
 rumorId:string;topic:string;claim:string;locationId:string;
 sourceKind:LabAmbientRumor["sourceKind"];
 parentRumorId?:string;sourceNpcId?:string;status?:LabAmbientRumor["status"];
};
const re=/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/;
const id=(v:unknown):v is string=>typeof v==="string"&&re.test(v)&&
 !["constructor","prototype","__proto__"].includes(v);
const txt=(v:unknown,max:number)=>typeof v==="string"&&v.trim().length>0&&v.length<=max;
export function validateLabAmbientRumor(r:LabAmbientRumor,pack:LabPack){
 if(!r||!id(r.rumorId)||!txt(r.topic,100)||!txt(r.claim,500)||
 !id(r.locationId)||!pack.locations[r.locationId]||
 !id(r.originRef)||!id(r.lastRef)||!txt(r.recordedAt,100)||
 !["public_event","local_repetition","witness_relay"].includes(r.sourceKind)||
 !["unverified","disputed"].includes(r.status)||
 (r.parentRumorId!==undefined&&!id(r.parentRumorId))||
 (r.sourceNpcId!==undefined&&(!id(r.sourceNpcId)||!pack.npcProfiles[r.sourceNpcId]))||
 (r.sourceKind==="public_event"&&r.parentRumorId!==undefined)||
 (r.sourceKind!=="public_event"&&!r.parentRumorId)||
 (r.sourceKind==="witness_relay"&&!r.sourceNpcId))
 throw Error("LAB_AMBIENT_RUMOR_INVALID");
 return r;
}
export function applyLabAmbientRumorChanges(session:LabSession,pack:LabPack,event:LabConfirmedEvent){
 const changes=event.ambientRumorChanges??[];
 if(!Array.isArray(changes)||changes.length>8||
 new Set(changes.map(x=>x.rumorId)).size!==changes.length)
 throw Error("LAB_AMBIENT_RUMOR_BATCH_INVALID");
 if(changes.length===0)return session.ambientRumors;
 const next={...(session.ambientRumors??{})};
 for(const change of changes){
  if(!change||!id(change.rumorId)||next[change.rumorId]||
  !id(change.locationId)||!pack.locations[change.locationId]||
  !txt(change.topic,100)||!txt(change.claim,500)||
  event.locationId!==change.locationId||
  !["public_event","local_repetition","witness_relay"].includes(change.sourceKind)||
  (change.status!==undefined&&!["unverified","disputed"].includes(change.status)))
   throw Error("LAB_AMBIENT_RUMOR_CHANGE_INVALID");
  const parent=change.parentRumorId?session.ambientRumors?.[change.parentRumorId]:undefined;
  if(change.sourceKind==="public_event"){
   if(change.parentRumorId||change.sourceNpcId)
    throw Error("LAB_AMBIENT_RUMOR_ORIGIN_INVALID");
   const publicWitness=event.playerWitnessed===true&&event.playerLocationId===change.locationId;
   const publicAction=event.worldActions?.some(a=>a.locationId===change.locationId&&a.privacy==="public");
   const publicConversation=event.npcInteractions?.some(a=>a.privacy==="public");
   const directWitness=event.observations?.some(o=>
    event.knownBy.includes(o.npcId)&&["seen","heard","experienced"].includes(o.channel));
   if(!publicWitness&&!publicAction&&!publicConversation&&!directWitness)
    throw Error("LAB_AMBIENT_RUMOR_WITNESS_REQUIRED");
  }else{
   if(!parent)throw Error("LAB_AMBIENT_RUMOR_PARENT_UNKNOWN");
   if(change.sourceKind==="local_repetition"){
    if(parent.locationId!==change.locationId||change.sourceNpcId)
     throw Error("LAB_AMBIENT_RUMOR_NOT_LOCAL");
    if(!event.npcInteractions?.some(x=>x.privacy==="public")&&
       !event.worldActions?.some(x=>x.privacy==="public"&&x.locationId===change.locationId))
     throw Error("LAB_AMBIENT_RUMOR_NO_PUBLIC_REPETITION");
   }else{
    const npc=change.sourceNpcId;
    if(!npc||!pack.npcProfiles[npc])throw Error("LAB_AMBIENT_RUMOR_SOURCE_NPC_INVALID");
    const knows=session.npcs[npc]?.memories.some(m=>
     m.sourceRef===parent.originRef||m.sourceRef===parent.lastRef);
    const publicRelay=event.worldActions?.some(a=>
     a.npcId===npc&&a.locationId===change.locationId&&a.privacy==="public");
    if(!knows||!publicRelay)throw Error("LAB_AMBIENT_RUMOR_UNVERIFIED_RELAY");
    if(parent.locationId!==change.locationId){
     const from=pack.locations[parent.locationId],to=pack.locations[change.locationId];
     if(from.neighbors[change.locationId]===undefined&&
        to.neighbors[parent.locationId]===undefined)
      throw Error("LAB_AMBIENT_RUMOR_ROUTE_UNVERIFIED");
    }
   }
  }
  const rumor=validateLabAmbientRumor({
   rumorId:change.rumorId,topic:change.topic,claim:change.claim,locationId:change.locationId,
   originRef:parent?.originRef??event.sourceRef,lastRef:event.sourceRef,recordedAt:event.time,
   sourceKind:change.sourceKind,
   ...(parent?{parentRumorId:parent.rumorId}:{}),
   ...(change.sourceNpcId?{sourceNpcId:change.sourceNpcId}:{}),
   status:change.status??"unverified"
  },pack);
  next[rumor.rumorId]=rumor;
  if(Object.keys(next).length>128)throw Error("LAB_AMBIENT_RUMOR_CAPACITY");
 }
 return next;
}
export function readLabAmbientRumors(session:LabSession,locationId:string,max=12){
 if(!id(locationId)||!Number.isInteger(max)||max<1||max>24)
  throw Error("LAB_AMBIENT_RUMOR_QUERY_INVALID");
 return Object.values(session.ambientRumors??{})
  .filter(r=>r.locationId===locationId).slice(-max)
  .map(r=>({...r,unverifiedStatement:true,notPlayerKnown:true}));
}
