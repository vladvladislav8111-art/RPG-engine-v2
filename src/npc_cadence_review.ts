/** Source-only eligibility for routine independent KEY-NPC life review.
 * Unlike a forced world-clock event, eligibility does NOT mean action happened.
 * Designed for sparse `CONTINUITY_SPARSE_RANGES` already read for the turn.
 */
export type SparseRows=Record<string,unknown[][]>;
function minuteFromInworld(x:unknown):number|null {
 const m=String(x??'').trim().match(/^Day\s*(\d+)\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/i);
 if(!m)return null;
 const day=Number(m[1]),h=Number(m[2]),min=Number(m[3]),sec=Number(m[4]??0);
 if(!Number.isSafeInteger(day)||day<1||h>23||min>59||sec>59)return null;
 return day*1440+h*60+min+sec/60;
}
export function parseNpcMinimumElapsedMinutes(s:unknown):number|null {
 const txt=String(s??'');
 const m=txt.match(/(?:>=\s*)?(\d+(?:[.,]\d+)?)\s*(?:in-world\s*)?minutes?\b/i)
  ??txt.match(/>=\s*(\d+(?:[.,]\d+)?)\s*m\b/i);
 if(!m)return null;
 const n=Number(m[1].replace(',','.'));
 return Number.isFinite(n)&&n>0?n:null;
}
export function reviewNpcRoutineCadence(input:{
 worldDay:number; worldTime:string;elapsedSeconds:number;sparse:SparseRows;maxActors?:number;
}) {
 if(!Number.isSafeInteger(input.worldDay)||input.worldDay<1||
  !Number.isSafeInteger(input.elapsedSeconds)||input.elapsedSeconds<0||input.elapsedSeconds>7*86400)
  throw Error('NPC_CADENCE_TIME_BOUNDS');
 const now=minuteFromInworld(`Day${input.worldDay} ${input.worldTime}`);
 if(now===null)throw Error('NPC_CADENCE_CLOCK_INVALID');
 const future=now+input.elapsedSeconds/60;
 const npcs=input.sparse['NPC_CURRENT!A1:D500']??[];
 const rules=input.sparse['NPC_ACTIVITY_RULES!A1:C200']??[];
 const minimums=input.sparse['NPC_ACTIVITY_RULES!G1:G200']??[];
 const ticks=input.sparse['NPC_ACTIVITY_RULES!K1:K200']??[];
 const rulesByActor=new Map<string,{minimum:number|null;last:number|null}>();
 for(let i=1;i<rules.length;i++){
  const actorId=String(rules[i]?.[0]??'');
  if(!actorId||String(rules[i]?.[2]??'').toUpperCase()!=='ACTIVE')continue;
  rulesByActor.set(actorId,{minimum:parseNpcMinimumElapsedMinutes(minimums[i]?.[0]),
   last:minuteFromInworld(ticks[i]?.[0])});
 }
 const due:Array<{actorId:string;ageMinutes:number;minimumMinutes:number;review:string}>=[];
 const blocked:Array<{actorId:string;reason:string}>=[];
 for(let i=1;i<npcs.length;i++){
  const id=String(npcs[i]?.[0]??'');
  if(!id||String(npcs[i]?.[3]??'').toUpperCase()!=='KEY')continue;
  const rule=rulesByActor.get(id);
  if(!rule){blocked.push({actorId:id,reason:'ACTIVE_RULE_MISSING'});continue;}
  if(rule.minimum==null||rule.last==null){blocked.push({actorId:id,reason:'SOURCE_CADENCE_OR_TICK_UNKNOWN'});continue;}
  const age=future-rule.last;
  if(age>=rule.minimum)due.push({actorId:id,ageMinutes:Math.floor(age),minimumMinutes:rule.minimum,
   review:'LIFEV4_ROUTINE_CANDIDATE_NOT_COMMITTED'});
 }
 const max=Math.max(1,Math.min(24,Math.floor(input.maxActors??12)));
 return {schema:'NPC_ROUTINE_LIFEV4_CADENCE_V1' as const,mode:'READ_ONLY_REVIEW_ELIGIBILITY' as const,
  eligible:due.slice(0,max),eligibleCount:due.length,
  sourceIncomplete:blocked.slice(0,max),sourceIncompleteCount:blocked.length,
  truncated:due.length>max||blocked.length>max,committed:false as const,
  consequencesGuaranteed:false as const,
  instructions:[
   'Recheck owner goals, duties and knowledge before GM/V3 decision',
   'Do not automatically create messages, meetings, affection, paid work or contact',
   'Actual offscene action requires elapsed time, possible route, world event and semantic commit',
   'Due for review is not evidence that any action or feeling occurred',
  ]};
}
