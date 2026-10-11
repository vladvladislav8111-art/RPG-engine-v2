/** O(n) precommit audit of already-loaded rows. No extra Google/API reads. */
type Rows=unknown[][];
type AuditInput={
 txId:string;oldDay:number;oldTime:string;newDay:number;newTime:string;
 elapsedSeconds:number;sessionStart:string;sessionEnd:string;
 resources:Rows;pendingChoices:Rows;
 inventory?:Rows;inventoryChanged:boolean;
 requiredProcessIds?:readonly string[];resolvedProcessIds?:readonly string[];
 requiredNpcIds?:readonly string[];resolvedNpcIds?:readonly string[];
};
const str=(x:unknown)=>String(x??"").trim();
function asStamp(x:string):number|null{
 const m=x.match(/^Day\s*(\d+)\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/i);
 if(!m)return null;
 const [day,h,min,sec]=m.slice(1).map(Number);
 if(day<1||h>23||min>59||sec>59)return null;
 return day*86400+h*3600+min*60+sec;
}
function records(rows:Rows):Record<string,unknown>[]{
 if(!rows?.[0])return[];
 return rows.slice(1).filter(row=>row.some(x=>str(x)!=="")).map(row=>
  Object.fromEntries(rows[0].map((k,i)=>[str(k),row[i]??""])));
}
export function auditPreparedTurn(input:AuditInput){
 const fail=(reason:string)=>{throw Error("TURN_INTEGRITY_AUDIT:"+reason)};
 if(!input.txId)fail("TX_ID_MISSING");
 if(!Number.isSafeInteger(input.elapsedSeconds)||input.elapsedSeconds<0)fail("INVALID_DURATION");
 const before=asStamp("Day"+input.oldDay+" "+input.oldTime);
 const after=asStamp("Day"+input.newDay+" "+input.newTime);
 if(before===null||after===null||after-before!==input.elapsedSeconds)
   fail("WORLD_CLOCK_ADVANCE_MISMATCH");
 const sessionBefore=asStamp(input.sessionStart),sessionAfter=asStamp(input.sessionEnd);
 // A committed session cannot disguise time or jump to another day.
 if(sessionBefore!==null&&sessionBefore!==before)fail("SESSION_START_MISMATCH");
 if(sessionAfter!==null&&sessionAfter!==after)fail("SESSION_END_MISMATCH");
 const allResources=records(input.resources);
 const used=new Set<string>();
 for(const r of allResources){
  const key=str(r["Resource"]);if(!key)continue;
  if(used.has(key))fail("DUPLICATED_PLAYER_RESOURCE:"+key);
  used.add(key);
  const value=Number(r["Current"]);
  if(!Number.isFinite(value))fail("NONFINITE_PLAYER_RESOURCE:"+key);
  if(["HP","Stamina","Mana","General XP","Satiety","Hydration","Money copper","SUP"].includes(key)&&value<0)
    fail("NEGATIVE_PLAYER_RESOURCE:"+key);
 }
 const choices=new Set<string>();
 for(const r of records(input.pendingChoices)){
  const id=str(r["Choice ID"]);if(!id)continue;
  if(choices.has(id))fail("DUPLICATE_MILESTONE_CHOICE:"+id);
  choices.add(id);
  if(str(r["Status"])==="AWAITING_CHOICE"){
    let json:unknown;try{json=JSON.parse(str(r["Options JSON"]))}catch{fail("INVALID_MILESTONE_JSON:"+id)}
    if(!Array.isArray(json)||json.length<2)fail("EMPTY_MILESTONE_OPTIONS:"+id);
  }
 }
 let inventoryChecked=false;
 if(input.inventoryChanged){
  if(!input.inventory?.[0])fail("INVENTORY_SOURCE_MISSING");
  const owned=new Set<string>();
  for(const r of records(input.inventory??[])){
    const id=str(r["Item ID"]);if(!id)continue;
    if(owned.has(id))fail("DUPLICATE_ITEM_INSTANCE:"+id);
    owned.add(id);
    const qty=Number(r["Qty"]);
    if(!Number.isFinite(qty)||qty<0)fail("INVALID_ITEM_QUANTITY:"+id);
    if(qty>0&&(!str(r["Custodian"])||!str(r["Location/container"])))
      fail("ITEM_CUSTODY_UNSPECIFIED:"+id);
  }
  inventoryChecked=true;
 }
 const haveProcesses=new Set(input.resolvedProcessIds??[]);
 for(const id of input.requiredProcessIds??[])if(!haveProcesses.has(id))
   fail("UNRESOLVED_WORLD_PROCESS:"+id);
 const haveNpcs=new Set(input.resolvedNpcIds??[]);
 for(const id of input.requiredNpcIds??[])if(!haveNpcs.has(id))
   fail("UNRESOLVED_KEY_NPC:"+id);
 return {schema:"PRECOMMIT_FAST_INTEGRITY_AUDIT_V1",ok:true,
  reusedLoadedRows:true,extraSourceRequests:0,txId:input.txId,
  checks:["time_corresponds_to_elapsed","session_clock_consistent","resource_uniqueness",
   "resource_nonnegative","milestone_choice_uniqueness","clock_process_coverage",
   "key_npc_coverage",...(inventoryChecked?["item_instance_unique_custody"]:[])],
  itemRowsChecked:inventoryChecked,
  limitations:["No claim of full EC-06 NPC balance proof or durable KV atomicity",
   "Physical item authenticity, XP source novelty and NPC causal decisions still require source checks"],
 };
}
