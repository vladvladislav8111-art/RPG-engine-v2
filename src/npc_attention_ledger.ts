import { planNpcContextHeat, type CommittedNpcAttentionEvent } from "./npc_attention_ladder.ts";
import type { SemanticCommitPlan } from "./types.ts";

/** Engine-authored receipts are journalled inside the existing semantic SESSION_LOG row.
 * The caller must pass only the NPC IDs from committed NPC_CURRENT; not a proposal roster.
 */
export function deriveNpcAttentionReceipts(input:{
  txId:string;day:number;time:string;sceneId:string;
  semantic:SemanticCommitPlan;knownNpcIds:readonly string[];
}):CommittedNpcAttentionEvent[] {
  const known=new Set(input.knownNpcIds.filter(id=>/^npc\.[a-z0-9_.-]+$/i.test(id)));
  const receipts:CommittedNpcAttentionEvent[]=[];
  const seen=new Set<string>();
  function record(actorId:string,kind:CommittedNpcAttentionEvent["kind"],
    ref:string,peers:string[]=[],evidence?:string) {
    if(!known.has(actorId)||!ref||!input.txId||!input.sceneId)return;
    const id=[input.txId,actorId,kind,ref].join("|");
    if(seen.has(id))return;
    seen.add(id);
    receipts.push({eventId:id,actorId,kind,txId:input.txId,
      sourceRef:ref,sceneId:input.sceneId,day:input.day,time:input.time,committed:true,
      counterpartIds:peers.filter(x=>x!==actorId),...(evidence?{meaningfulEvidence:evidence}:{})});
  }
  for(const id of input.semantic.sceneActorIds??[])
    record(id,"SCENE_PRESENCE","scene:"+input.sceneId);
  for(const m of input.semantic.socialMemoryEvents??[]) {
    if(m.operation==="TOUCH"||m.operation==="RETIRE"||!m.memoryId||
      !(m.participants?.length)||!m.originEvent||!m.meaning?.trim())continue;
    const aware=new Set(m.whoUnderstands?.length?m.whoUnderstands:m.participants);
    const important=(m.importance==="IMPORTANT"||m.importance==="ANCHOR")&&m.meaning.trim().length>=24;
    for(const id of m.participants)if(aware.has(id))
      record(id,important?"MEANINGFUL_RELATIONSHIP_EVENT":"SUBSTANTIVE_EXCHANGE",
        "memory:"+m.memoryId,m.participants.filter(p=>p!==id),important?m.meaning:undefined);
  }
  for(const r of input.semantic.relationshipEvents??[]) {
    if(r.operation==="RETIRE"||!r.relationshipId||!r.evidenceRefs?.length||
      !r.currentStance||r.currentStance.trim().length<24)continue;
    record(r.actorId,"MEANINGFUL_RELATIONSHIP_EVENT","relation:"+r.relationshipId,
      [r.towardId],r.currentStance);
  }
  if(receipts.length>48)throw Error("NPC_HEAT_TURN_RECEIPT_LIMIT");
  return receipts;
}

export function journalNpcAttentionReceipts(rows:unknown[][]):CommittedNpcAttentionEvent[] {
  if(!rows.length)return[];
  const names=rows[0].map(String);
  const txCol=names.indexOf("TX ID"),advCol=names.indexOf("World advances JSON");
  if(txCol<0||advCol<0)return[];
  const byEvent=new Map<string,CommittedNpcAttentionEvent>();
  const bySource=new Set<string>();
  for(const row of rows.slice(1)) {
    const txId=String(row[txCol]??"");
    if(!txId)continue;
    let data:Record<string,unknown>;
    try {data=JSON.parse(String(row[advCol]??"{}"));} catch {continue;}
    const events=data.engineNpcAttentionReceipts;
    if(!Array.isArray(events))continue;
    for(const unknownEvent of events) {
      if(!unknownEvent||typeof unknownEvent!=="object")throw Error("NPC_HEAT_RECEIPT_MALFORMED");
      const e=unknownEvent as CommittedNpcAttentionEvent;
      if(e.txId!==txId||!e.eventId||!e.actorId||!e.sourceRef||e.committed!==true||
        !/^npc\.[a-z0-9_.-]+$/i.test(e.actorId))throw Error("NPC_HEAT_RECEIPT_MISMATCH");
      const old=byEvent.get(e.eventId);
      if(old) {if(JSON.stringify(old)!==JSON.stringify(e))throw Error("NPC_HEAT_RECEIPT_COLLISION");continue;}
      // A replayed memory/relationship SOURCE is not a second meaningful day.
      const sourceKey=[e.actorId,e.kind,e.sourceRef,
        e.kind==="SCENE_PRESENCE"?e.day:""].join("|");
      if(bySource.has(sourceKey))continue;
      bySource.add(sourceKey);byEvent.set(e.eventId,e);
    }
  }
  return [...byEvent.values()];
}

export const NPC_HEAT_INDEX_COLUMNS=[
  "NPC ID","Earned Tier","Profile Tier","Last Relevant Day","Last Relevant Time",
  "Distinct Meaningful Days","Meaningful Social Days","Last Evidence TX",
  "Source Save ID","Last Stimulus JSON","Version",
] as const;

export function projectNpcHeatIndex(input:{
  actorId:string;importance:string;day:number;time:string;
  saveId:string;newReceipts:readonly CommittedNpcAttentionEvent[];
  allReceipts:readonly CommittedNpcAttentionEvent[];
}){
  const filtered=input.allReceipts.filter(e=>e.actorId===input.actorId);
  const plan=planNpcContextHeat({actorId:input.actorId,importance:input.importance,
    nowDay:input.day,nowTime:input.time,events:filtered,
    // Completeness is relative to ENGINE receipt epoch, not all older NPC history.
    historyComplete:true,durableIdentityAvailable:false,independentLifeRuleAvailable:false});
  const latest=filtered.slice().sort((a,b)=>a.day-b.day||a.time.localeCompare(b.time)).at(-1);
  const fresh=input.newReceipts.filter(e=>e.actorId===input.actorId&&
    (e.kind==="SUBSTANTIVE_EXCHANGE"||e.kind==="MEANINGFUL_RELATIONSHIP_EVENT")).at(-1);
  const lastStimulus=fresh?{sourceRef:fresh.sourceRef,sourceTxId:fresh.txId,
    day:fresh.day,time:fresh.time,kind:"NEW_INFORMATION",
    targetActorId:fresh.counterpartIds?.length===1?fresh.counterpartIds[0]:null}:null;
  return {actorId:input.actorId,earnedTier:plan.earnedTier,profileTier:plan.profileTier,
    lastDay:latest?.day??0,lastTime:latest?.time??"",
    meaningfulDays:plan.distinctMeaningfulDays,socialDays:plan.distinctMeaningfulSocialDays,
    lastTx:latest?.txId??"",saveId:input.saveId,lastStimulus,version:1};
}

function minute(day:unknown,time:unknown):number|null {
  const m=/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(time??""));
  const d=Number(day);
  if(!m||!Number.isSafeInteger(d)||d<1)return null;
  const h=Number(m[1]),n=Number(m[2]),s=Number(m[3]??0);
  return h<24&&n<60&&s<60?d*1440+h*60+n+s/60:null;
}
export function readNpcHeatIndex(row:Record<string,unknown>|undefined,
  nowDay:number,nowTime:string,importance:string,liveSaveId:string){
  if(!row||!String(row["NPC ID"]??"").startsWith("npc."))return null;
  const last=minute(row["Last Relevant Day"],row["Last Relevant Time"]);
  const now=minute(nowDay,nowTime);
  const recent=last!=null&&now!=null&&now>=last&&now-last<1440;
  const key=importance.toUpperCase()==="KEY";
  const profile=Math.max(0,Math.min(4,Math.floor(Number(row["Profile Tier"]??0)||0)));
  const indexSaveId=String(row["Source Save ID"]??"");
  // Only the row written against this exact committed save may supply an
  // event stimulus. A stale index is NEVER proof the NPC witnessed new news.
  const sourceCurrent=!!liveSaveId&&indexSaveId===liveSaveId;
  let lastStimulus:null|Record<string,unknown>=null;
  if(sourceCurrent&&recent&&now!=null&&last!=null&&now-last<=60){
    try{
      const parsed=JSON.parse(String(row["Last Stimulus JSON"]??"null"));
      if(parsed&&parsed.kind==="NEW_INFORMATION"&&parsed.sourceRef&&parsed.sourceTxId&&
        minute(parsed.day,parsed.time)!=null&&
        now-minute(parsed.day,parsed.time)!<=60)lastStimulus=parsed;
    }catch{/* Invalid optional hint is never an attested stimulus. */}
  }
  // An old row can still describe a KEY identity, but never fresh knowledge.
  return {schema:"NPC_HEAT_RUNTIME_INDEX_V1" as const,actorId:row["NPC ID"],
    profileTier:key?5:profile,activeTier:key?5:sourceCurrent&&recent?profile:0,
    sourceSaveId:indexSaveId,sourceCurrent,sourceTxId:row["Last Evidence TX"],recent,
    lastStimulus,derivedFrom:"COMMITTED_RUNTIME_SHEET_AND_SESSION_RECEIPTS" as const,
    affectionInferred:false as const,keyPromotionAutomatic:false as const};
}
