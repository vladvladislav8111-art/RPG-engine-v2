import {advanceClock} from "./rules.ts";
import {continuityFromSparseRanges} from "./world_continuity.ts";
import {parseInworldMoment} from "./social_context.ts";

/** Prospective world advance based only on sparse authoritative data; no writes. */
export function planIndependentWorldTick(input:{
 saveId:string;worldDay:number;worldTime:string;elapsedSeconds:number;
 sparse:Record<string,unknown[][]>;
}){
 if(!input.saveId||!Number.isSafeInteger(input.worldDay)||input.worldDay<1||
 !Number.isSafeInteger(input.elapsedSeconds)||input.elapsedSeconds<0||
 input.elapsedSeconds>7*86400)throw Error("WORLD_TICK_BOUNDS");
 const end=advanceClock(input.worldDay,input.worldTime,input.elapsedSeconds);
 const old=continuityFromSparseRanges(input.sparse,input.worldDay,input.worldTime);
 const upcoming=continuityFromSparseRanges(input.sparse,end.day,end.time);
 const oldClocks=new Set(old.activeClocksOverdue.map(x=>x.processId));
 const oldNpcs=new Set(old.keyNpcDue.map(x=>x.actorId));
 const keyNpcs=upcoming.keyNpcDue.map(x=>({
  actorId:x.actorId,reason:x.reason,wasDue:oldNpcs.has(x.actorId),
  operation:"npc_decision.lifeV4",requires:"semantic.offscreenNpcEvents",
  mustResolve:x.reason!=="ACTIVITY_RULE_MISSING",
 }));
 const rules=input.sparse["NPC_ACTIVITY_RULES!A1:C200"]??[];
 const ticks=input.sparse["NPC_ACTIVITY_RULES!K1:K200"]??[];
 const indexed=new Map<string,{status:string;last:string}>();
 for(let i=1;i<rules.length;i++)if(rules[i][0])indexed.set(String(rules[i][0]),{
  status:String(rules[i][2]??""),last:String(ticks[i]?.[0]??"")});
 const npcRows=input.sparse["NPC_CURRENT!A1:D500"]??[];
 const endMinute=parseInworldMoment("Day"+end.day+" "+end.time);
 const recurring:string[]=[];
 if(endMinute!=null)for(let i=1;i<npcRows.length;i++){
  if(String(npcRows[i][3]??"").toUpperCase()!=="RECURRING")continue;
  const id=String(npcRows[i][0]??""),r=indexed.get(id);
  const last=parseInworldMoment(r?.last??"");
  if(r?.status==="ACTIVE"&&last!=null&&endMinute-last>=1440)recurring.push(id);
 }
 const due=upcoming.activeClocksOverdue.map(x=>({
  processId:x.processId,reason:x.reason,wasDue:oldClocks.has(x.processId),
  requires:"semantic.worldProcessEvents",completionGuaranteed:false,
 }));
 return {schema:"WORLD_TICK_PLAN_V1",sourceSaveId:input.saveId,
  mode:"READ_ONLY_PROPOSALS",timeCommitted:false,
  start:{day:input.worldDay,time:input.worldTime},
  proposedEnd:end,elapsedSeconds:input.elapsedSeconds,
  keyNpcReviews:keyNpcs.slice(0,24),recurringNpcIds:recurring.slice(0,24),
  worldProcessReviews:due.slice(0,24),
  keyNpcDueCount:keyNpcs.filter(x=>x.mustResolve).length,
  processDueCount:due.length,truncated:keyNpcs.length>24||recurring.length>24||due.length>24,
  nextStep:due.length||keyNpcs.some(x=>x.mustResolve)
    ?"RESOLVE_NPC_LIFEV4_AND_WORLD_PROCESSES_WITH_SOURCES"
    :"CONTINUE_CAUSAL_TURN_PREPARATION",
  constraints:["Do not invent completed orders, NPC replies, paid offers or secret player knowledge",
  "12-job V3 limit; read-only proposals require independent semantic commit",
  "RECURRING actors are reviews, not mandatory fictional encounters"],
 };
}
