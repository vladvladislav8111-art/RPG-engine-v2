import {deny,finite,pass,positive,type SimOutcome,type WorldMinute} from './types.ts';
export type Interval={start:WorldMinute;end:WorldMinute};
export type ScheduledProcess={id:string;lastAdvanced:WorldMinute;nextDue:WorldMinute|null;kind:'event'|'daily'|'staffed'|'milestone';active:boolean;requiresEvidence?:string};
export type DueProcess={id:string;from:WorldMinute;to:WorldMinute;reason:'DUE'|'EVENT';};
export function elapsedInterval(start:WorldMinute,minutes:number):Interval {finite(start,'start');finite(minutes,'minutes');const end=start+minutes;if(!Number.isSafeInteger(end))throw Error('clock overflow');return {start,end};}
export function dueProcesses(input:{window:Interval;processes:readonly ScheduledProcess[];evidenceIds:ReadonlySet<string>;limit?:number}):SimOutcome<DueProcess[]> {
 const {window,processes,evidenceIds}=input;finite(window.start,'window.start');finite(window.end,'window.end');if(window.end<window.start)return deny('TIME_BACKWARDS','Cannot reverse world time');const limit=input.limit??32;positive(limit,'limit');if(limit>128)return deny('UNBOUNDED','Max 128 reviewed processes per turn');
 if(processes.length>limit)return deny('PAGE_REQUIRED','Load only bounded active process page');
 const seen=new Set<string>(),due:DueProcess[]=[];
 for(const p of processes){if(seen.has(p.id))return deny('DUPLICATE_PROCESS',p.id);seen.add(p.id);finite(p.lastAdvanced,'lastAdvanced');if(p.lastAdvanced>window.start)return deny('FUTURE_PROCESS',p.id);if(p.nextDue!==null)finite(p.nextDue,'nextDue');if(!p.active)continue;
  if(p.kind==='event') {if(p.requiresEvidence && evidenceIds.has(p.requiresEvidence))due.push({id:p.id,from:p.lastAdvanced,to:window.end,reason:'EVENT'});}
  else if(p.nextDue!==null&&p.nextDue<=window.end&&p.lastAdvanced<p.nextDue)due.push({id:p.id,from:p.lastAdvanced,to:window.end,reason:'DUE'});
 }
 return pass(due);
}
export function staffedMinutes(input:{window:Interval;dailyWindows:readonly {weekday:number;startMinute:number;endMinute:number}[];holidays:ReadonlySet<number>;weekdayAnchor:number}):number {
 const {window,dailyWindows,holidays}=input;finite(input.weekdayAnchor,'weekdayAnchor');if(input.weekdayAnchor>6)throw Error('Invalid calendar weekday anchor');const seenPeriods=new Set<string>();for(const period of dailyWindows){if(period.weekday>6||period.startMinute>=period.endMinute||period.endMinute>1440)throw Error('Invalid staffed period');const key=String(period.weekday)+':'+String(period.startMinute)+':'+String(period.endMinute);if(seenPeriods.has(key))throw Error('Duplicate staff period');seenPeriods.add(key);for(const other of dailyWindows){if(other!==period&&other.weekday===period.weekday&&Math.max(other.startMinute,period.startMinute)<Math.min(other.endMinute,period.endMinute))throw Error('Overlapping staff shifts double-count hours');}}finite(window.start,'start');finite(window.end,'end');if(window.end<window.start)throw Error('backwards window');if(window.end-window.start>365*1440)throw Error('unbounded calendar');let sum=0;
 const dayStart=Math.floor(window.start/1440),dayEnd=Math.floor((Math.max(window.start,window.end-1))/1440);
 for(let day=dayStart;day<=dayEnd;day++){if(holidays.has(day))continue;const weekday=(day+input.weekdayAnchor)%7;for(const period of dailyWindows){finite(period.weekday,'weekday');finite(period.startMinute,'startMinute');finite(period.endMinute,'endMinute');if(period.weekday>6||period.startMinute>=period.endMinute||period.endMinute>1440)throw Error('invalid staffed period');if(period.weekday!==weekday)continue;sum+=Math.max(0,Math.min(window.end,day*1440+period.endMinute)-Math.max(window.start,day*1440+period.startMinute));}}
 return sum;
}
