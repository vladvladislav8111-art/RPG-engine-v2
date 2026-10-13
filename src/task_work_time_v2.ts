/**
 * Universal Work Time V2 — bounded, conditional calendar scheduler.
 * Computes labor, interruptions, shared-tool occupation and natural waits.
 * Actor calendars, resource access, source references and workloads are GM claims,
 * never independently attested by this pure calculation.
 */
export type WorkWindow={startMinute:number;endMinute:number};
export type WorkCalendar={
 id:string;sourceRef:string;available:WorkWindow[];busy?:WorkWindow[];
};
export type WorkTimeModelV2={
 horizonMinutes:number;
 actorCalendars:WorkCalendar[];
 resourceCalendars?:WorkCalendar[];
};
export type CalendarStage={
 id:string;actorId:string;kind:"active"|"verification"|"passive";
 durationMinutes:number;dependsOn:readonly string[];
 notBeforeMinute?:number;mustFinishByMinute?:number;
 resourceIds?:readonly string[];workloadSourceRef?:string;
};
export type ScheduledStage={
 id:string;startsAtMinute:number;finishesAtMinute:number;
 activeIntervals:WorkWindow[];
 calendarIdleMinutes:number;preStartDelayMinutes:number;
};
export type WorkCalendarProjection={
 mode:"CONDITIONAL_CALENDAR_V2";horizonMinutes:number;
 scheduledEndMinute:number;unconstrainedLowerBoundMinutes:number;
 totalLaborMinutes:number;shuraActiveMinutes:number;shuraEngagementSpanMinutes:number;
 stages:ScheduledStage[];
 actorAvailabilityAttested:false;resourceAvailabilityAttested:false;
 workloadAttested:false;commitAuthorized:false;
 notes:readonly string[];
};
const sid=(x:unknown)=>typeof x==="string"&&/^[a-zA-Z0-9._:-]{3,180}$/.test(x);
const integer=(x:unknown,lo:number,hi:number)=>typeof x==="number"&&Number.isSafeInteger(x)&&x>=lo&&x<=hi;
function fail(code:string):never{throw Error("WORK_TIME_V2_"+code);}
function windows(xs:unknown,horizon:number,label:string):WorkWindow[]{
 if(!Array.isArray(xs)||xs.length>64)fail("BAD_"+label+"_WINDOWS");
 let end=0;
 const out:WorkWindow[]=[];
 for(const x of xs){
   if(!x||typeof x!=="object"||!integer(x.startMinute,0,horizon)||
      !integer(x.endMinute,1,horizon)||x.startMinute>=x.endMinute||x.startMinute<end)
      fail("BAD_"+label+"_WINDOW");
   end=x.endMinute;out.push({startMinute:x.startMinute,endMinute:x.endMinute});
 }
 return out;
}
type ParsedCalendar={available:Uint8Array;busy:Uint8Array};
function parseCalendars(rows:WorkCalendar[]|undefined,horizon:number,label:string){
 if(!Array.isArray(rows)||rows.length>40)fail("BAD_"+label+"_CALENDARS");
 const map=new Map<string,ParsedCalendar>();
 for(const row of rows){
   if(!row||!sid(row.id)||map.has(row.id)||!sid(row.sourceRef)||row.sourceRef.length<8)
     fail("BAD_"+label+"_SOURCE");
   const available=windows(row.available,horizon,label+"_AVAILABLE"),
     busy=windows(row.busy??[],horizon,label+"_BUSY");
   const allow=new Uint8Array(horizon),block=new Uint8Array(horizon);
   for(const w of available)allow.fill(1,w.startMinute,w.endMinute);
   for(const w of busy)block.fill(1,w.startMinute,w.endMinute);
   map.set(row.id,{available:allow,busy:block});
 }
 return map;
}
function appendInterval(out:WorkWindow[],minute:number){
 const last=out[out.length-1];
 if(last&&last.endMinute===minute)last.endMinute++;
 else out.push({startMinute:minute,endMinute:minute+1});
}
/**
 * Stage order is supplied by the GM (topological). No algorithm decides work
 * order, NPC cooperation or Shura's actions. Active stages may pause between
 * staffed availability windows; passive stages must occupy one continuous
 * natural interval and do not spend actor labor.
 */
export function scheduleWorkTimeV2(model:WorkTimeModelV2,stages:readonly CalendarStage[],
 unconstrainedLowerBoundMinutes:number):WorkCalendarProjection{
 if(!model||!integer(model.horizonMinutes,1,10080)||!Array.isArray(stages)||stages.length<1||stages.length>32)
   fail("BOUNDS");
 const horizon=model.horizonMinutes;
 const actorCal=parseCalendars(model.actorCalendars,horizon,"ACTOR");
 const resourceCal=parseCalendars(model.resourceCalendars??[],horizon,"RESOURCE");
 const reservedResources=new Map<string,Uint8Array>();
 const actorEnds=new Map<string,number>();
 const done=new Map<string,ScheduledStage>();
 let labor=0,shuraLabor=0,shuraFirst=Number.POSITIVE_INFINITY,shuraLast=0;
 for(const stage of stages){
   if(!stage||!sid(stage.id)||done.has(stage.id)||!sid(stage.actorId)||
     !integer(stage.durationMinutes,1,horizon)||!Array.isArray(stage.dependsOn)||
     new Set(stage.dependsOn).size!==stage.dependsOn.length||stage.dependsOn.some((x:string)=>!sid(x)||!done.has(x)))
       fail("INVALID_STAGE");
   const passive=stage.kind==="passive";
   if(!["active","verification","passive"].includes(stage.kind))fail("STAGE_KIND");
   if(!sid(stage.workloadSourceRef)||stage.workloadSourceRef!.length<8)fail("WORKLOAD_EVIDENCE_REQUIRED");
   const resources=stage.resourceIds??[];
   if(!Array.isArray(resources)||resources.length>8||new Set(resources).size!==resources.length||
      resources.some(id=>!sid(id)||!resourceCal.has(id)))fail("RESOURCE_SOURCE_REQUIRED");
   if(!passive&&!actorCal.has(stage.actorId))fail("ACTOR_SOURCE_REQUIRED");
   if(stage.notBeforeMinute!==undefined&&!integer(stage.notBeforeMinute,0,horizon))fail("BAD_NOT_BEFORE");
   if(stage.mustFinishByMinute!==undefined&&!integer(stage.mustFinishByMinute,1,horizon))fail("BAD_DEADLINE");
   const dependencyEnd=Math.max(0,...stage.dependsOn.map((x:string)=>done.get(x)!.finishesAtMinute));
   const ready=Math.max(dependencyEnd,stage.notBeforeMinute??0,passive?0:actorEnds.get(stage.actorId)??0);
   const actor=actorCal.get(stage.actorId);
   const validMinute=(t:number)=>{
     if(t>=horizon)return false;
     if(!passive&&(!actor||!actor.available[t]||actor.busy[t]))return false;
     return resources.every(id=>{
       const cal=resourceCal.get(id)!;
       return cal.available[t]&&!cal.busy[t]&&!reservedResources.get(id)?.[t];
     });
   };
   const segments:WorkWindow[]=[];
   let finished=0;
   if(passive){
     for(let start=ready;start+stage.durationMinutes<=horizon;start++){
       let continuous=true;
       for(let t=start;t<start+stage.durationMinutes;t++){
         if(!validMinute(t)){continuous=false;start=t;break;}
       }
       if(continuous){
         segments.push({startMinute:start,endMinute:start+stage.durationMinutes});
         finished=start+stage.durationMinutes;
         break;
       }
     }
   }else{
     for(let t=ready;t<horizon;t++){
       if(!validMinute(t))continue;
       appendInterval(segments,t);
       labor++;
       if(stage.actorId==="actor.shura")shuraLabor++;
       if(segments.reduce((s,w)=>s+w.endMinute-w.startMinute,0)===stage.durationMinutes){
         finished=t+1;break;
       }
     }
   }
   if(!finished||!segments.length)fail("NOT_SCHEDULABLE_WITHIN_HORIZON");
   if(stage.mustFinishByMinute!==undefined&&finished>stage.mustFinishByMinute)fail("DEADLINE_UNREACHABLE");
   // Reserve only after the entire stage fits: partial failed proposals cannot affect later stages.
   for(const id of resources){
     let booked=reservedResources.get(id);
     if(!booked){booked=new Uint8Array(horizon);reservedResources.set(id,booked);}
     for(const seg of segments)booked.fill(1,seg.startMinute,seg.endMinute);
   }
   if(!passive)actorEnds.set(stage.actorId,finished);
   const first=segments[0].startMinute;
   const activeDuration=stage.durationMinutes;
   const out:ScheduledStage={id:stage.id,startsAtMinute:first,finishesAtMinute:finished,
     activeIntervals:segments,
     calendarIdleMinutes:finished-first-activeDuration,
     preStartDelayMinutes:first-ready};
   done.set(stage.id,out);
   if(!passive&&stage.actorId==="actor.shura"){
     shuraFirst=Math.min(shuraFirst,first);shuraLast=Math.max(shuraLast,finished);
   }
 }
 const result=[...done.values()];
 const scheduledEnd=Math.max(...result.map(x=>x.finishesAtMinute));
 return {
  mode:"CONDITIONAL_CALENDAR_V2",horizonMinutes:horizon,
  scheduledEndMinute:scheduledEnd,unconstrainedLowerBoundMinutes,
  totalLaborMinutes:labor,shuraActiveMinutes:shuraLabor,
  shuraEngagementSpanMinutes:Number.isFinite(shuraFirst)?shuraLast-shuraFirst:0,
  stages:result,
  actorAvailabilityAttested:false,resourceAvailabilityAttested:false,
  workloadAttested:false,commitAuthorized:false,
  notes:[
   "Windows, busy periods, workload and optional deadlines are GM-provided assertions requiring authoritative source checks.",
   "Active labor pauses for shifts, reservations or unavailable shared equipment. Natural waits continue as elapsed time without labor.",
   "Computed schedule is a conditional estimate, NOT a confirmed arrival/completion time, wage, job or player decision.",
   "No game clock, stamina, survival, XP, money, materials or NPC state is changed.",
  ],
 };
}
