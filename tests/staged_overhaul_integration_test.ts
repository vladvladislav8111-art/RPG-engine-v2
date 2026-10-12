import assert from "node:assert/strict";
import {buildTurnBrief,contactActorIdsForRequest} from "../src/turn_dispatcher.ts";
import {buildTurnTriage} from "../src/turn_triage.ts";
import {shouldLoadSceneActors} from "../src/context_hotpath_budget.ts";
import {reviewNpcRoutineCadence} from "../src/npc_cadence_review.ts";
import {buildSystemNotificationCenter} from "../src/system_notification_center.ts";
import {planNpcInitiativeV4} from "../src/npc_initiative_v4.ts";
Deno.test("System Inbox routes only consented active contacts, never auto-replies",()=>{
 const contacts=[
 {"Contact ID":"contact.shura.max","Owner Actor ID":"player.shura","Peer Actor ID":"npc.max.earth","Status":"ACTIVE","Consent":"TRUE"},
 {"Contact ID":"contact.shura.fake","Owner Actor ID":"player.shura","Peer Actor ID":"npc.fake","Status":"PENDING","Consent":"FALSE"}];
 assert.deepEqual(contactActorIdsForRequest(["CONTACTS"],contacts),["npc.max.earth"]);
 const brief=buildTurnBrief({turnClass:"MICRO",tags:["CONTACTS"],contacts,pendingChoices:[]});
 assert.equal(brief.commitAuthorized,false);
 assert.equal(brief.systemInbox.contacts[0].replyGuaranteed,false);
});
Deno.test("MICRO optimization never truncates an ambiguous or gameplay scene",()=>{
 assert.equal(shouldLoadSceneActors({turnClass:"MICRO",tags:["STATUS"]}).loadSceneActors,false);
 assert.equal(shouldLoadSceneActors({turnClass:"MICRO",tags:[]}).loadSceneActors,true);
 assert.equal(shouldLoadSceneActors({turnClass:"MICRO",tags:["STATUS","NPC"]}).loadSceneActors,true);
 assert.equal(shouldLoadSceneActors({turnClass:"NORMAL",tags:["STATUS"]}).loadSceneActors,true);
});
Deno.test("KEY cadence triggers review but not an invented event",()=>{
 const sparse={
 "NPC_CURRENT!A1:D500":[["NPC ID","Name","Role","Importance"],["npc.vesha","","","KEY"]],
 "NPC_ACTIVITY_RULES!A1:C200":[["NPC ID","Name","State"],["npc.vesha","","ACTIVE"]],
 "NPC_ACTIVITY_RULES!G1:G200":[["Minimum elapsed"],["30 in-world minutes"]],
 "NPC_ACTIVITY_RULES!K1:K200":[["Last activity tick"],["Day67 17:21:00"]]};
 const due=reviewNpcRoutineCadence({worldDay:67,worldTime:"17:21:00",elapsedSeconds:1800,sparse});
 assert.equal(due.eligibleCount,1);assert.equal(due.committed,false);
 const triage=buildTurnTriage({turnClass:"NORMAL",tags:["NPC_LIFE"],
 memory:{depth:"TARGETED_DEEP",missingSources:[]},worldPlan:null,
 npcRoutineCadence:due,actorContextRequired:false,actorContextReady:true,pendingChoices:[]});
 assert(triage.taskCodes.includes("REVIEW_ROUTINE_KEY_NPC_INITIATIVE"));
 assert.equal(triage.gameplayCommitted,false);
});
Deno.test("System Inbox never creates rewards or durable ACK",()=>{
 const center=buildSystemNotificationCenter({pendingChoices:[{
 "Choice ID":"choice.pending","Status":"PENDING_GENERATION","Options JSON":"[]"}],ackSourceReady:false});
 assert.equal(center.notices[0]?.kind,"PENDING_CHOICE");
 assert.equal(center.notices[0]?.playerActionRequired,false);
 assert.equal(center.ackDurabilityReady,false);
 assert.equal(center.committed,false);
});
Deno.test("NPC initiative cannot act by itself",()=>{
 const r=planNpcInitiativeV4({actorId:"npc.vesha",current:null,activityRule:null,
 knowledge:[],observedStimuli:[],socialMemories:[],openThreads:[],relationshipToShura:null,
 elapsedSeconds:0,verifiedCoPresenceWithShura:false,verifiedLiveCommunicationChannel:false,
 discretionaryWindowConfirmed:false});
 assert.equal(r.committed,false);
});
