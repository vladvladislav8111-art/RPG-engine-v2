/**
 * Source-derived RPG System notification centre. Read-only; zero game time.
 * Durable source events are NEVER replaced by a separate mutable notification list.
 * Optional notification ACK receipts suppress repeat presentation, not world truth.
 */
export type NoticeRow = Record<string, unknown>;
export type NoticeKind = "GENERAL_LEVEL" | "COMPETENCE_LEVEL" | "ACHIEVEMENT" |
  "CONTACT_MESSAGE" | "PENDING_CHOICE" | "WORLD_ORDER_REVIEW";
export type Notice = {
  id: string; kind: NoticeKind; title: string; detail: string; sourceRef: string;
  inworldAt: string | null; read: boolean; playerActionRequired: boolean;
  visibility: "PLAYER_SYSTEM"; persistent: boolean;
};
const v = (r: NoticeRow, key: string) => String(r[key] ?? "").trim();
const num = (r: NoticeRow, key: string) => Number(v(r,key).replace(",","."));
export function worldMoment(value: string): number | null {
  const m=value.match(/^Day\s*(\d+)(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/i);
  if (!m) return null;
  const day=Number(m[1]),h=Number(m[2]??0),min=Number(m[3]??0),sec=Number(m[4]??0);
  if (!Number.isSafeInteger(day)||day<1||h>23||min>59||sec>59) return null;
  return day*86400+h*3600+min*60+sec;
}
export function validateNotificationAck(input: {
  notificationId:string; actorId:string; sourceRef:string; status:"SEEN"|"DISMISSED";
  issued:readonly Notice[];
}): Notice {
  if(input.actorId!=="player.shura") throw Error("ACK_NOT_PLAYER");
  const target=input.issued.find(n=>n.id===input.notificationId&&n.sourceRef===input.sourceRef);
  if(!target)throw Error("ACK_SOURCE_NOT_CONFIRMED");
  if(input.status==="DISMISSED" && (target.playerActionRequired || target.persistent))
    throw Error("PLAYER_CHOICE_CANNOT_BE_DISMISSED");
  return target;
}
export function buildSystemNotificationCenter(input: {
  pendingChoices?:readonly NoticeRow[];
  progressEvents?:readonly NoticeRow[];
  achievements?:readonly NoticeRow[];
  contacts?:readonly NoticeRow[];
  chatEvents?:readonly NoticeRow[];
  worldAgenda?:readonly {processId?:string;reviewStatus?:string;nextReviewAt?:string|null}[];
  ackReceipts?:readonly NoticeRow[];
  ackSourceReady?:boolean;
  currentDay?:number;
  maxItems?:number;
}) {
  const notices:Notice[]=[];
  const max=Math.min(60,Math.max(1,Math.floor(input.maxItems??25)));
  const contactById=new Map((input.contacts??[]).filter(r=>v(r,"Status")==="ACTIVE"&&
    v(r,"Owner Actor ID")==="player.shura"&&v(r,"Consent").toUpperCase()==="TRUE")
    .map(r=>[v(r,"Contact ID"),r]));
  const receiptById=new Map<string,NoticeRow>();
  for(const a of input.ackReceipts??[]) {
    const id=v(a,"Notification ID");
    if(!id)continue;
    if(receiptById.has(id))throw Error("DUPLICATED_NOTIFICATION_ACK");
    receiptById.set(id,a);
  }
  const add=(n:Omit<Notice,"read">,nativeRead=false)=>{
    if(!n.id||!n.sourceRef) return;
    const ack=receiptById.get(n.id);
    const validAck=ack && v(ack,"Actor ID")==="player.shura" &&
      v(ack,"Source Ref")===n.sourceRef && ["SEEN","DISMISSED"].includes(v(ack,"Status"));
    notices.push({...n,read:nativeRead||!!validAck});
  };
  for(const p of input.pendingChoices??[]){
    const status=v(p,"Status").toUpperCase();
    if(!(status.startsWith("PENDING")||status==="OPEN"))continue;
    const id=v(p,"Choice ID");
    if(!id)continue;
    let options=false;try{
      const parsed=JSON.parse(v(p,"Options JSON")||"[]");
      options=Array.isArray(parsed)&&parsed.length>0;
    }catch{/* Invalid source options cannot be shown as selectable */}
    add({id:"notify.choice."+id,kind:"PENDING_CHOICE",
      title:options?"Доступен выбор развития":"Варианты развития ещё не подготовлены",
      detail:id,sourceRef:id,inworldAt:v(p,"Created at")||null,
      playerActionRequired:options,visibility:"PLAYER_SYSTEM",persistent:true});
  }
  for(const p of input.progressEvents??[]){
    const ref=v(p,"TX ID"),old=num(p,"Old level"),next=num(p,"New level");
    const kind=v(p,"Event type"),competence=v(p,"Competence ID");
    if(!ref||!Number.isInteger(old)||!Number.isInteger(next)||next<=old)continue;
    if(!kind.startsWith("general_xp:")&&kind!=="learning"&&kind!=="deferred_xp_release")continue;
    for(let level=old+1;level<=Math.min(next,old+25);level++){
      const general=kind.startsWith("general_xp:");
      add({id:"notify.progress."+ref+".lv"+level,kind:general?"GENERAL_LEVEL":"COMPETENCE_LEVEL",
        title:general?"Повышен общий уровень":"Новый уровень компетенции",
        detail:general?String(level):competence+" → "+level,
        sourceRef:ref,inworldAt:v(p,"Inworld time")||null,
        playerActionRequired:false,visibility:"PLAYER_SYSTEM",persistent:false});
    }
  }
  for(const a of input.achievements??[]){
    if(v(a,"Actor ID")!=="player.shura"||v(a,"Status")!=="EARNED")continue;
    const id=v(a,"Achievement ID");if(!id)continue;
    const time=v(a,"Earned at"),earnedDay=worldMoment(time);
    const historical=input.currentDay!=null&&earnedDay!=null&&
      Math.floor(earnedDay/86400)<input.currentDay-2;
    add({id:"notify.achievement."+id,kind:"ACHIEVEMENT",
      title:"Достижение получено",detail:id,
      sourceRef:id,inworldAt:time||null,playerActionRequired:false,
      visibility:"PLAYER_SYSTEM",persistent:false},historical);
  }
  for(const m of input.chatEvents??[]){
    const messageId=v(m,"Message ID"),contactId=v(m,"Channel ID");
    if(!messageId||v(m,"Receiver ID")!=="player.shura"||v(m,"Direction")!=="IN")continue;
    if(v(m,"Delivery")!=="DELIVERED"||!contactById.has(contactId))continue;
    const contact=contactById.get(contactId)!;
    if(v(m,"Sender ID")!==v(contact,"Peer Actor ID"))continue;
    add({id:"notify.message."+messageId,kind:"CONTACT_MESSAGE",
      title:"Сообщение: "+v(contact,"Peer display"),
      detail:v(m,"Text").slice(0,180),sourceRef:messageId,
      inworldAt:v(m,"Timestamp")||null,playerActionRequired:false,
      visibility:"PLAYER_SYSTEM",persistent:false},v(m,"Read status")==="READ");
  }
  for(const w of input.worldAgenda??[]){
    const id=String(w.processId??"");
    // Never expose hidden GM clocks. Only already-established player-owned orders.
    if(!id||!/(?:^|[._])shura(?:[._]|$)/i.test(id))continue;
    if(!["DUE","OVERDUE"].includes(String(w.reviewStatus??"").toUpperCase()))continue;
    add({id:"notify.order."+id+"."+(w.nextReviewAt??"due"),
      kind:"WORLD_ORDER_REVIEW",title:"Проверить состояние заказа",
      detail:"Срок проверки наступил; готовность вещи не подтверждена",
      sourceRef:id,inworldAt:w.nextReviewAt??null,playerActionRequired:false,
      visibility:"PLAYER_SYSTEM",persistent:true});
  }
  const byId=new Map<string,Notice>();
  for(const n of notices) {
    const found=byId.get(n.id);
    if(found && found.sourceRef!==n.sourceRef) throw Error("NOTIFICATION_SOURCE_COLLISION");
    if(!found)byId.set(n.id,n);
  }
  const ordered=[...byId.values()].sort((a,b)=>{
    const atA=worldMoment(a.inworldAt??"")??0,atB=worldMoment(b.inworldAt??"")??0;
    return Number(a.read)-Number(b.read) || Number(b.persistent)-Number(a.persistent) ||
      atB-atA || a.id.localeCompare(b.id);
  });
  return {
    schema:"SYSTEM_NOTIFICATION_CENTER_V1" as const,
    readOnly:true as const,committed:false as const,
    ackDurabilityReady:input.ackSourceReady===true,
    unreadCount:ordered.filter(x=>!x.read).length,
    pendingChoiceCount:ordered.filter(x=>x.kind==="PENDING_CHOICE").length,
    notices:ordered.slice(0,max),
    total:ordered.length,
    truncated:ordered.length>max,
    limitations:[
      "Only actual committed progression, earned achievements, delivered messages and player-known pending decisions are surfaced.",
      "Read receipts require independently migrated ACK source; until then UI cannot promise durable marking as seen.",
      "No NPC message or craft completion is invented by a reminder.",
    ],
  };
}
