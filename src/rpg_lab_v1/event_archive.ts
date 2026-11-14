import type {LabSession} from "./session.ts";
const BLOCK=8;
/** Keep active narrative snapshots bounded, preserving the prior event rows
 * in immutable segments committed atomically with the new session revision.
 * This function is PURE; storage is the caller's responsibility. */
export function planLabEventArchive(session:LabSession){
 const count=session.archivedEventCount??0;
 if(!Number.isSafeInteger(count)||count<0||count%BLOCK!==0)
  throw Error("LAB_EVENT_ARCHIVE_COUNT_INVALID");
 if(session.events.length<240)
  return {working:session,archive:null as null|{index:number;events:LabSession["events"]}};
 const events=session.events.slice(0,BLOCK);
 const working={...session,events:session.events.slice(BLOCK),
  archivedEventCount:count+BLOCK};
 return {working,archive:{index:count/BLOCK,events}};
}
