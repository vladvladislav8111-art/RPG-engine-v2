/** A deterministic, grounded world agenda for review, not unearned offscreen facts.
 * An NPC's goals can generate private intentions while they remain off-screen;
 * outcomes only become world history through an explicit confirmed turn event.
 */
import type {LabPack} from "./engine.ts";
const ID=/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/;
const hash=(s:string)=>{
 let n=2166136261>>>0;
 for(let i=0;i<s.length;i++){n^=s.charCodeAt(i);n=Math.imul(n,16777619);}
 return n>>>0;
};
export function proposeIndependentWorldAgenda(
 pack:LabPack,
 fromMinute:number,toMinute:number,npcIds:unknown,sessionId="preview"
){
 if(!Number.isInteger(fromMinute)||!Number.isInteger(toMinute)||fromMinute<0||
  toMinute<fromMinute||toMinute-fromMinute>10080)
  throw Error("LAB_AGENDA_WINDOW_INVALID");
 if(!Array.isArray(npcIds)||npcIds.length>16||
  npcIds.some(x=>typeof x!=="string"||!ID.test(x)||!pack.npcProfiles[x])||
  new Set(npcIds).size!==npcIds.length)
  throw Error("LAB_AGENDA_NPCS_INVALID");
 if(typeof sessionId!=="string"||!ID.test(sessionId))throw Error("LAB_AGENDA_SESSION_INVALID");
 const days=Math.floor((toMinute-1)/1440)-Math.floor(fromMinute/1440)+1;
 const intents:{npcId:string;name:string;day:number;minute:number;goal:string;proposedKind:string;
  privateUntilWitnessed:boolean;alreadyOccurred:false;needsCommit:true}[]=[];
 if(toMinute===fromMinute)return {fromMinute,toMinute,intents,eventsCommitted:false};
 for(const npcId of npcIds as string[]){
  const profile=pack.npcProfiles[npcId],goals=profile.goals;
  if(!goals.length)continue;
  for(let day=Math.floor(fromMinute/1440);day<=Math.floor((toMinute-1)/1440);day++){
   if(intents.length>=48)break;
   const h=hash(pack.projectId+"|"+sessionId+"|"+npcId+"|"+day);
   const within=480+(h%720),minute=day*1440+within;
   if(minute<=fromMinute||minute>toMinute)continue;
   intents.push({npcId,name:profile.name,day,minute,
    goal:goals[(h>>>8)%goals.length],proposedKind:"pursue_canonical_goal",
    privateUntilWitnessed:true,alreadyOccurred:false,needsCommit:true});
  }
 }
 return {fromMinute,toMinute,intents,
  eventsCommitted:false,worldTimeAdvanced:false,requiresGmWorldResolution:true,
  noFreeNpcKnowledge:true,noGuaranteedEncounter:true,
  note:"Canonical goals inform off-screen choices; final acts and outcomes require a confirmed scene, not a random assertion."};
}
