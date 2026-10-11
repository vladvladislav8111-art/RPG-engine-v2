import {assertEquals,assert} from "jsr:@std/assert";
import {buildTurnBrief,contactActorIdsForRequest} from "../src/turn_dispatcher.ts";
import {proposeSystemLevelEvents} from "../src/system_notifications.ts";
Deno.test("System contacts survive offscene and stale cache cannot erase actual messages",()=>{
 const contacts=[{"Contact ID":"contact.shura.max","Owner Actor ID":"player.shura","Peer Actor ID":"npc.max.earth","Peer display":"Макс","Status":"ACTIVE","Consent":"TRUE","Last message at":"Day34 18:09:00"}];
 assertEquals(contactActorIdsForRequest(["CONTACTS"],contacts),["npc.max.earth"]);
 assertEquals(contactActorIdsForRequest(["CRAFT"],contacts),[]);
 const without=buildTurnBrief({turnClass:"MICRO",tags:[],contacts,pendingChoices:[]});
 assertEquals(without.systemInbox.contacts[0].historyLoaded,false);
 assertEquals(without.systemInbox.contacts[0].cacheMayBeStale,false);
 const withChat=buildTurnBrief({turnClass:"MICRO",tags:["CHAT"],contacts,pendingChoices:[],
  actorIdsLoaded:["npc.max.earth"],recentChatByActor:{"npc.max.earth":[
   {"Timestamp":"Day48 14:27:10","Message ID":"msg.real.1","Sender ID":"player.shura","Receiver ID":"npc.max.earth"}
  ]}});
 assertEquals(withChat.systemInbox.contacts[0].lastLoggedMessageAt,"Day48 14:27:10");
 assertEquals(withChat.systemInbox.contacts[0].cacheMayBeStale,true);
});
Deno.test("Pending milestone is an always-visible reminder but never an automatic selection",()=>{
 const brief=buildTurnBrief({turnClass:"MICRO",tags:[],contacts:[],pendingChoices:[{
 "Choice ID":"choice.competence.crafting.practical_creation.lv3","Parent ID":"competence.crafting.practical_creation",
 "Status":"PENDING_GENERATION","Options JSON":"[]"}]});
 assertEquals(brief.reminders[0].status,"NEEDS_CANONICAL_OPTIONS");
 assertEquals(brief.systemInbox.pendingChoices[0].requiresPlayerChoice,true);
 assertEquals(brief.commitAuthorized,false);
 assertEquals(brief.autoExecutedOperations,[]);
});
Deno.test("Notification proposals only report real level crossings",()=>{
 const r=proposeSystemLevelEvents({txId:"tx.example",generalXp:[{oldLevel:2,newLevel:3,crossedLevels:[3]}],
 learning:[{oldLevel:2,newLevel:3,competenceId:"competence.crafting.practical_creation",
 crossedLevels:[3],specialization:{specialization:"Observation",oldStars:2,stars:3}}]});
 assertEquals(r.map(x=>x.kind),["GENERAL_LEVEL_UP","COMPETENCE_LEVEL_UP","SPECIALIZATION_STAR_UP"]);
 assert(r.every(x=>x.requiresCommittedWriter===true&&x.sourceTx==="tx.example"));
 const n=proposeSystemLevelEvents({txId:"tx.no_level",generalXp:[{oldLevel:2,newLevel:2,crossedLevels:[]}],learning:[]});
 assertEquals(n.length,0);
});

Deno.test("Deferred-XP choice level-ups have stable System event receipts",()=>{
 const receipts=proposeSystemLevelEvents({txId:"tx.release.1",generalXp:[],learning:[],releasedChoices:[
  {choiceId:"choice.competence.crafting.practical_creation.lv3",progression:{oldLevel:3,newLevel:4,crossedLevels:[4]}}
 ]});
 assertEquals(receipts.map(x=>x.kind),["COMPETENCE_LEVEL_UP"]);
 assertEquals(receipts[0].level,4);
 assertEquals(receipts[0].sourceTx,"tx.release.1");
});
