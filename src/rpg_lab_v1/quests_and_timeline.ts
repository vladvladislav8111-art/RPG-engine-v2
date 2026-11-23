/**
 * Side-effect-free proof-of-concept for System quest & Orario NPC plot triggers.
 * Triggers advance off-screen; character decisions may interrupt their schedule.
 * NOT integrated with live OrarioPlayerAction yet.
 */
export type HiveQuest = {
 id:string; floor:number; startedMinute:number; lastProcessedMinute:number; expiresAtMinute:number;
 killedAnts:string[]; queenDefeatedRef:string|null; verifiedNestDestroyed:boolean; signalCount:number;
 claimedMilestones:number[]; status:'active'|'completed'|'failed';
};
export function startHiveQuest(id:string, floor:number, minute:number, durationMinutes:number):HiveQuest{
 if(durationMinutes<360||durationMinutes>720||!Number.isSafeInteger(durationMinutes))
  throw Error('HIVE_QUEST_DURATION_OUT_OF_RANGE');
 if(!Number.isSafeInteger(floor)||floor<1||!Number.isSafeInteger(minute)||minute<0)
  throw Error('HIVE_QUEST_LOCATION_TIME_INVALID');
 if(!/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(id))throw Error('HIVE_QUEST_ID_INVALID');
 return {id,floor,startedMinute:minute,lastProcessedMinute:minute,expiresAtMinute:minute+durationMinutes,
  killedAnts:[],queenDefeatedRef:null,verifiedNestDestroyed:false,signalCount:0,claimedMilestones:[],status:'active'};
}
export type HiveAction =
 | {kind:'ant_defeated';monsterRef:string;alarmConfirmed:boolean;floor:number;minute:number}
 | {kind:'nest_destroyed';floor:number;minute:number;proofRef:string}
 | {kind:'queen_defeated';floor:number;minute:number;queenRef:string;proofRef:string}
 | {kind:'leave_floor';floor:number;minute:number}
 | {kind:'time_tick';floor:number;minute:number};
export function applyHiveAction(quest:HiveQuest,a:HiveAction):{quest:HiveQuest;attributePointsGranted:number;reinforcementAlarm:boolean}{
 const q=structuredClone(quest);
 if(q.status!=='active')return {quest:q,attributePointsGranted:0,reinforcementAlarm:false};
 if(!Number.isSafeInteger(a.minute)||a.minute<q.lastProcessedMinute)throw Error('HIVE_QUEST_TIME_BACKWARD');
 q.lastProcessedMinute=a.minute;
 if(a.minute>q.expiresAtMinute){q.status='failed';return {quest:q,attributePointsGranted:0,reinforcementAlarm:false};}
 if(a.kind==='leave_floor'||a.floor!==q.floor){
  q.status='failed';return {quest:q,attributePointsGranted:0,reinforcementAlarm:false};
 }
 let reinforcementAlarm=false;
 if(a.kind==='ant_defeated'){
  if(!/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(a.monsterRef))throw Error('HIVE_MONSTER_REF_INVALID');
  if(!q.killedAnts.includes(a.monsterRef)){
   q.killedAnts.push(a.monsterRef);
   // Hive communication calls nearby ants; does NOT spawn creatures from nothing.
   reinforcementAlarm=a.alarmConfirmed;
   if(reinforcementAlarm)q.signalCount++;
  }
 }
 if(a.kind==='queen_defeated'){
  if(!/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(a.queenRef)||!a.proofRef)
   throw Error('HIVE_QUEEN_EVIDENCE_REQUIRED');
  if(q.queenDefeatedRef!==null&&q.queenDefeatedRef!==a.queenRef)
   throw Error('HIVE_QUEEN_CONTRADICTORY_EVENT');
  q.queenDefeatedRef=a.queenRef;
 }
 if(a.kind==='nest_destroyed'){
  if(!a.proofRef)throw Error('HIVE_NEST_EVIDENCE_REQUIRED');
  q.verifiedNestDestroyed=true;
 }
 let newlyEarned=0;
 for(const threshold of [10,20,30]){
  if(q.killedAnts.length>=threshold&&!q.claimedMilestones.includes(threshold)){
   q.claimedMilestones.push(threshold);newlyEarned++;
  }
 }
 if(q.killedAnts.length>=30&&q.verifiedNestDestroyed&&q.queenDefeatedRef)q.status='completed';
 return {quest:q,attributePointsGranted:newlyEarned,reinforcementAlarm};
}

export type ScheduledPlot = {
 id:string;
 phase:'not_started'|'prepared'|'delivered'|'interrupted';
 prerequisites:string[];
 preparedAtMinute:number|null;
 deliveredAtMinute:number|null;
 logs:string[];
};
/** Offscreen preparation is allowed only when named actor prerequisites are met. */
export function preparePlot(p:ScheduledPlot, nowMinute:number, facts:string[]):ScheduledPlot{
 if(!Number.isSafeInteger(nowMinute)||nowMinute<0)throw Error('PLOT_TIME_INVALID');
 if(p.phase!=='not_started')return structuredClone(p);
 if(!p.prerequisites.every(f=>facts.includes(f)))return structuredClone(p);
 return {...structuredClone(p),phase:'prepared',preparedAtMinute:nowMinute,
  logs:[...p.logs,`prepared@${nowMinute}`]};
}
/** Delivery can be delayed by divergent storyline; never retroactively gift NPC items. */
export function deliverPlot(p:ScheduledPlot, nowMinute:number, facts:string[]):ScheduledPlot{
 if(!Number.isSafeInteger(nowMinute)||nowMinute<0)throw Error('PLOT_TIME_INVALID');
 if(p.preparedAtMinute!==null&&nowMinute<p.preparedAtMinute)throw Error('PLOT_TIME_BEFORE_PREPARATION');
 if(p.phase==='delivered')return structuredClone(p);
 if(p.phase!=='prepared'||!facts.includes(`scene.delivery_allowed.${p.id}`))return structuredClone(p);
 return {...structuredClone(p),phase:'delivered',deliveredAtMinute:nowMinute,
  logs:[...p.logs,`delivered@${nowMinute}`]};
}
export function interruptPlot(p:ScheduledPlot,eventRef:string):ScheduledPlot{
 if(p.phase==='delivered')return structuredClone(p);
 if(!eventRef)throw Error('PLOT_INTERRUPT_PROOF_REQUIRED');
 return {...structuredClone(p),phase:'interrupted',logs:[...p.logs,`interrupt:${eventRef}`]};
}
export function skillScale(base:number,level:number,ratePercent:number){
 if(!Number.isSafeInteger(level)||level<1||!Number.isFinite(base)||base<0||
   !Number.isFinite(ratePercent)||ratePercent<10||ratePercent>20)
   throw Error('SKILL_SCALE_INVALID');
 return base*Math.pow(1+ratePercent/100,level-1);
}

/** Authoritative wrapper: no imaginary ant kills, nest or queen from caller text. */
export function applyVerifiedHiveAction(quest:HiveQuest,a:HiveAction,host:{
 verifyAntDefeat:(monsterRef:string,minute:number,floor:number)=>boolean;
 verifyQueenDefeat:(queenRef:string,proofRef:string,floor:number)=>boolean;
 verifyNestDestroyed:(proofRef:string,floor:number)=>boolean;
}){
 if(a.kind==='ant_defeated'&&!host.verifyAntDefeat(a.monsterRef,a.minute,a.floor))
  throw Error('HIVE_ANT_NOT_CONFIRMED');
 if(a.kind==='queen_defeated'&&!host.verifyQueenDefeat(a.queenRef,a.proofRef,a.floor))
  throw Error('HIVE_QUEEN_NOT_CONFIRMED');
 if(a.kind==='nest_destroyed'&&!host.verifyNestDestroyed(a.proofRef,a.floor))
  throw Error('HIVE_NEST_NOT_CONFIRMED');
 return applyHiveAction(quest,a);
}
