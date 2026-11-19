/** Per-campaign player fog-of-war. This is the ONLY public knowledge index.
 * Hidden narrative world facts and NPC thoughts never enter it automatically.
 * A reported fact is a belief, NOT world truth. Player can be misled.
 */
import type {LabPack} from "./engine.ts";
import type {LabSession} from "./session.ts";
import type {LabConfirmedEvent} from "./events.ts";
export type LabFogCertainty="rumor"|"suspected"|"observed"|"verified"|"disproved";
export type LabFogChannel="direct"|"report"|"inference"|"document";
export type LabPlayerFogEntry={
 label:string;summary:string;kind:"place"|"person"|"fact"|"faction"|"story";
 certainty:LabFogCertainty;channel:LabFogChannel;
 sourceRef:string;updatedAt:string;revision:number;
 relatedLocationId?:string;sourceNpcId?:string;
};
export type LabFogArea={
 level:"heard"|"located"|"visited"|"mapped"|"explored";
 sourceRef:string;revision:number;
};
export type LabPlayerFog={
 entries:Record<string,LabPlayerFogEntry>;
 areas:Record<string,LabFogArea>;
};
export type LabFogFactChange={
 key:string;expectedRevision:number;label:string;summary:string;
 kind:LabPlayerFogEntry["kind"];certainty:LabFogCertainty;
 channel:LabFogChannel;sourceNpcId?:string;sourceMemoryRef?:string;
 inferenceRefs?:string[];relatedLocationId?:string;
};
export type LabFogAreaChange={
 locationId:string;expectedRevision:number;level:LabFogArea["level"];
};
const ID=/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/;
const safe=(s:unknown):s is string=>typeof s==="string"&&ID.test(s)&&
 !["__proto__","constructor","prototype"].includes(s);
const phrase=(x:unknown,n:number)=>typeof x==="string"&&x.trim().length>0&&x.length<=n;
const certainty=["rumor","suspected","observed","verified","disproved"];
const channel=["direct","report","inference","document"];
const areas=["heard","located","visited","mapped","explored"];
const number=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<10000;
export function validateLabPlayerFog(s:LabPlayerFog,pack:LabPack){
 if(!s||!s.entries||!s.areas||typeof s.entries!=="object"||
  typeof s.areas!=="object"||Object.keys(s.entries).length>500||
  Object.keys(s.areas).length>500)
   throw Error("LAB_FOG_INVALID");
 for(const [key,e] of Object.entries(s.entries)){
  if(!safe(key)||!e||!phrase(e.label,100)||!phrase(e.summary,500)||
    !["place","person","fact","faction","story"].includes(e.kind)||
    !certainty.includes(e.certainty)||!channel.includes(e.channel)||
    !safe(e.sourceRef)||!phrase(e.updatedAt,100)||!number(e.revision)||e.revision<1||
    (e.relatedLocationId!==undefined&&!pack.locations[e.relatedLocationId])||
    (e.sourceNpcId!==undefined&&!pack.npcProfiles[e.sourceNpcId]))
   throw Error("LAB_FOG_ENTRY_INVALID:"+key);
 }
 for(const [key,a] of Object.entries(s.areas)){
  if(!safe(key)||!pack.locations[key]||!a||!areas.includes(a.level)||
   !safe(a.sourceRef)||!number(a.revision)||a.revision<1)
   throw Error("LAB_FOG_AREA_INVALID:"+key);
 }
 return s;
}
const rank:Record<LabFogArea["level"],number>={
 heard:1,located:2,visited:3,mapped:4,explored:5
};
export function applyLabFogChanges(
 session:LabSession,pack:LabPack,event:LabConfirmedEvent
):LabPlayerFog|undefined{
 const changed=event.playerFogChanges??[],locationChanges=event.playerAreaChanges??[];
 if(!changed.length&&!locationChanges.length)return session.playerFog;
 if(!Array.isArray(changed)||changed.length>24||!Array.isArray(locationChanges)||
  locationChanges.length>24)throw Error("LAB_FOG_BATCH_INVALID");
 const fog:LabPlayerFog=structuredClone(session.playerFog??{entries:{},areas:{}});
 if(new Set(changed.map(x=>x.key)).size!==changed.length||
   new Set(locationChanges.map(x=>x.locationId)).size!==locationChanges.length)
  throw Error("LAB_FOG_DUPLICATE_CHANGE");
 for(const change of changed){
  if(!change||!safe(change.key)||!number(change.expectedRevision)||
   !phrase(change.label,100)||!phrase(change.summary,500)||
   !["place","person","fact","faction","story"].includes(change.kind)||
   !certainty.includes(change.certainty)||!channel.includes(change.channel)||
   (change.relatedLocationId!==undefined&&!pack.locations[change.relatedLocationId]))
   throw Error("LAB_FOG_CHANGE_INVALID");
  const prev=fog.entries[change.key];
  if((prev?.revision??0)!==change.expectedRevision)
   throw Error("LAB_FOG_REVISION_CONFLICT");
  if(change.channel==="direct"){
   if(event.playerWitnessed!==true||!["observed","verified","disproved"].includes(change.certainty))
    throw Error("LAB_FOG_DIRECT_WITNESS_MISSING");
  }else if(change.channel==="report"){
   const actor=change.sourceNpcId,sref=change.sourceMemoryRef;
   if(!actor||!pack.npcProfiles[actor]||!safe(sref)||
      !session.npcs[actor]?.memories.some(m=>m.sourceRef===sref||
        m.relayedSourceRef===sref)||
      !["dialogue","player_turn","report"].includes(event.kind)||
      !["rumor","suspected"].includes(change.certainty))
    throw Error("LAB_FOG_UNVERIFIED_RELAY");
  }else if(change.channel==="inference"){
   const refs=change.inferenceRefs??[];
   if(!Array.isArray(refs)||!refs.length||refs.length>12||
      !refs.every(x=>safe(x)&&Boolean(fog.entries[x]))||
      !["rumor","suspected"].includes(change.certainty))
    throw Error("LAB_FOG_INFERENCE_REQUIRES_KNOWN_FACTS");
  }else if(change.channel==="document"){
   if(!event.playerWitnessed||!["rumor","suspected","observed"].includes(change.certainty))
    throw Error("LAB_FOG_DOCUMENT_REQUIRES_READ");
  }
  fog.entries[change.key]={
   label:change.label,summary:change.summary,kind:change.kind,
   certainty:change.certainty,channel:change.channel,
   sourceRef:event.sourceRef,updatedAt:event.time,
   revision:change.expectedRevision+1,
   ...(change.relatedLocationId?{relatedLocationId:change.relatedLocationId}:{}),
   ...(change.sourceNpcId?{sourceNpcId:change.sourceNpcId}:{})
  };
 }
 for(const change of locationChanges){
  if(!change||!safe(change.locationId)||!pack.locations[change.locationId]||
    !number(change.expectedRevision)||!areas.includes(change.level))
   throw Error("LAB_FOG_AREA_CHANGE_INVALID");
  const prev=fog.areas[change.locationId];
  if((prev?.revision??0)!==change.expectedRevision)throw Error("LAB_FOG_AREA_REVISION_CONFLICT");
  if(prev&&rank[change.level]<rank[prev.level])
   throw Error("LAB_FOG_AREA_CANNOT_UNEXPLORE");
  if(["visited","mapped","explored"].includes(change.level)&&
    (!event.playerWitnessed||session.player.locationId!==change.locationId&&
      event.playerLocationId!==change.locationId))
   throw Error("LAB_FOG_AREA_NO_PLAYER_PRESENCE");
  fog.areas[change.locationId]={
   level:change.level,sourceRef:event.sourceRef,revision:change.expectedRevision+1
  };
 }
 return validateLabPlayerFog(fog,pack);
}
export function readLabPublicFog(session:LabSession){
 const fog=session.playerFog??{entries:{},areas:{}};
 return {schema:"RPG_LAB_PLAYER_FOG_V1",projectId:session.projectId,
  sessionId:session.sessionId,gameClock:session.gameClock,
  known: Object.entries(fog.entries).map(([key,v])=>({
   key,label:v.label,summary:v.summary,kind:v.kind,
   certainty:v.certainty,channel:v.channel,updatedAt:v.updatedAt
  })),
  locations:Object.entries(fog.areas).map(([locationId,v])=>({
   locationId,level:v.level
  })),
  gmPrivateDataExcluded:true,readOnly:true,committed:false};
}
