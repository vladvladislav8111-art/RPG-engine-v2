import { assert,assertEquals,assertThrows } from "jsr:@std/assert";
import {buildSystemNotificationCenter,validateNotificationAck} from "../src/system_notification_center.ts";

Deno.test("System inbox reconstructs only committed level-ups, earned achievements and actual delivered inbox",()=>{
 const center=buildSystemNotificationCenter({
 currentDay:67,
 pendingChoices:[{"Choice ID":"choice.craft.lv3","Status":"PENDING_GENERATION","Options JSON":"[]","Created at":"Day58 06:30"}],
 progressEvents:[
 {"TX ID":"tx.real#general1","Inworld time":"Day67 12:00","Event type":"general_xp:objective","Old level":"2","New level":"3"},
 {"TX ID":"tx.same#learn1","Inworld time":"Day67 13:00","Event type":"learning","Competence ID":"craft","Old level":"3","New level":"3"},
 ],
 achievements:[{"Actor ID":"player.shura","Achievement ID":"ach.known","Earned at":"Day67 10:00","Status":"EARNED"},
   {"Actor ID":"player.shura","Achievement ID":"ach.draft","Earned at":"Day67 09:00","Status":"DESIGN_CANDIDATE"}],
 contacts:[{"Contact ID":"contact.shura.max","Owner Actor ID":"player.shura","Peer Actor ID":"npc.max.earth",
 "Peer display":"Макс","Status":"ACTIVE","Consent":"TRUE"}],
 chatEvents:[
 {"Message ID":"msg.verified","Channel ID":"contact.shura.max","Sender ID":"npc.max.earth","Receiver ID":"player.shura","Direction":"IN",
 "Text":"Связь есть","Delivery":"DELIVERED","Read status":"UNREAD","Timestamp":"Day67 12:02"},
 {"Message ID":"msg.forged","Channel ID":"contact.shura.max","Sender ID":"npc.fake.earth","Receiver ID":"player.shura","Direction":"IN",
 "Text":"Подделка","Delivery":"DELIVERED","Read status":"UNREAD","Timestamp":"Day67 12:03"},
 {"Message ID":"msg.out","Channel ID":"contact.shura.max","Sender ID":"player.shura","Receiver ID":"npc.max.earth","Direction":"OUT",
 "Text":"Привет","Delivery":"DELIVERED","Read status":"UNREAD","Timestamp":"Day67 12:03"}],
 worldAgenda:[{processId:"process.selarin.shura_prepaid_order",reviewStatus:"OVERDUE",nextReviewAt:"Day67 12:00"},
 {processId:"process.selarin.secret_faction",reviewStatus:"OVERDUE",nextReviewAt:"Day67 12:00"}],
 });
 assertEquals(center.total,5);
 assert(center.notices.some(n=>n.kind==="GENERAL_LEVEL"&&n.sourceRef==="tx.real#general1"));
 assert(center.notices.some(n=>n.kind==="ACHIEVEMENT"&&n.sourceRef==="ach.known"));
 assert(center.notices.some(n=>n.kind==="CONTACT_MESSAGE"&&n.sourceRef==="msg.verified"));
 assert(!center.notices.some(n=>n.detail.includes("Подделка")));
 assert(!center.notices.some(n=>n.sourceRef.includes("secret_faction")));
});
Deno.test("ACK receipt is durable without erasing a pending milestone",()=>{
 const pending={"Choice ID":"choice.craft.lv3","Status":"PENDING","Options JSON":"[{\"id\":\"a\"}]"};
 const original=buildSystemNotificationCenter({pendingChoices:[pending]});
 const notice=original.notices[0];
 assert(notice.playerActionRequired);
 assertThrows(()=>validateNotificationAck({notificationId:notice.id,actorId:"player.shura",sourceRef:notice.sourceRef,
   status:"DISMISSED",issued:original.notices}),Error,"PLAYER_CHOICE_CANNOT_BE_DISMISSED");
 assertThrows(()=>validateNotificationAck({notificationId:notice.id,actorId:"npc.max.earth",sourceRef:notice.sourceRef,
   status:"SEEN",issued:original.notices}),Error,"ACK_NOT_PLAYER");
 const receipt={"Notification ID":notice.id,"Actor ID":"player.shura","Source Ref":notice.sourceRef,"Status":"SEEN"};
 const restored=buildSystemNotificationCenter({pendingChoices:[pending],ackReceipts:[receipt],ackSourceReady:true});
 assertEquals(restored.notices[0].read,true);
 assertEquals(restored.pendingChoiceCount,1);
 assertEquals(restored.ackDurabilityReady,true);
});
Deno.test("Missing migrated ACK sheet is not falsely described as durable",()=>{
 const result=buildSystemNotificationCenter({pendingChoices:[],ackReceipts:[],ackSourceReady:false});
 assertEquals(result.ackDurabilityReady,false);
 assertEquals(result.unreadCount,0);
});
Deno.test("A forged or duplicate ACK cannot silently override source",()=>{
 const pending=[{"Choice ID":"choice.craft.lv3","Status":"PENDING","Options JSON":"[]"}];
 const source=buildSystemNotificationCenter({pendingChoices:pending});
 assertThrows(()=>validateNotificationAck({notificationId:source.notices[0].id,actorId:"player.shura",
 sourceRef:"choice.other",status:"SEEN",issued:source.notices}),Error,"ACK_SOURCE_NOT_CONFIRMED");
 assertThrows(()=>buildSystemNotificationCenter({ackReceipts:[
 {"Notification ID":"notify.message.same"},{"Notification ID":"notify.message.same"}
 ]}),Error,"DUPLICATED_NOTIFICATION_ACK");
});
