/**
 * Opt-in, bounded review of engine-authored NPC Heat receipt candidates in
 * authoritative SESSION_LOG. This is NOT cryptographic attestation: the legacy
 * State hash does not cover World advances JSON.
 *
 * Never use this output to increase earned Heat, promote KEY or prune context.
 */
import { hash32 } from "./rng.ts";

type Receipt = {
  eventId: string; actorId: string; txId: string; sourceRef: string;
  sceneId: string; day: number; time: string; kind: string; committed: true;
};
const REQUIRED = ["Save ID","Turn ID","TX ID","Inworld start","Inworld end",
  "Scene ID","World advances JSON","State hash","Source","Version"];
const LIMIT_ROWS = 128;
const LIMIT_ACTORS = 12;
const LIMIT_EVENTS_PER_TX = 48;
const value = (x: unknown) => String(x ?? "").trim();
const validActor = (x: string) => /^npc\.[a-z0-9_.-]+$/i.test(x);
function moment(s: string): number | null {
  const m = /^Day\s*(\d+)\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m) return null;
  const [day,h,min,sec] = [Number(m[1]),Number(m[2]),Number(m[3]),Number(m[4]??0)];
  return Number.isSafeInteger(day)&&day>=1&&h<24&&min<60&&sec<60
    ? day*86400+h*3600+min*60+sec : null;
}
/** C is the TX ID column in the verified 16-column SESSION_LOG schema. */
export function planNpcHeatJournalWindow(index: readonly (readonly unknown[])[]) {
  if (value(index[0]?.[0]) !== "TX ID") throw Error("NPC_HEAT_JOURNAL_TX_HEADER_MISMATCH");
  if (index.length > 5000) throw Error("NPC_HEAT_JOURNAL_INDEX_OVERFLOW");
  let endRow = 1;
  for (let i=1; i<index.length; i++) if(value(index[i]?.[0])) endRow=i+1;
  if (endRow===1) return {startRow:0,endRow:0,truncated:false,maxRows:LIMIT_ROWS};
  const startRow=Math.max(2,endRow-LIMIT_ROWS+1);
  return {startRow,endRow,truncated:startRow>2,maxRows:LIMIT_ROWS};
}
export type JournalAuditRequest = {
  sourceSaveId:string; worldDay:number; worldTime:string;
  stableAfterRead:boolean;
  requestedActorIds:readonly string[];
  index:readonly (readonly unknown[])[];
  header:readonly unknown[];
  rowStart:number;
  rows:readonly (readonly unknown[])[];
};
export function auditNpcHeatJournal(input:JournalAuditRequest) {
  const result=(code:string,events:Receipt[]=[],
    checkedRows=0,sourceRows=0,found=0) => ({
    schema:"NPC_HEAT_JOURNAL_AUDIT_V1" as const,
    mode:"READ_ONLY_UNAUTHENTICATED_CANDIDATES" as const,
    sourceSaveId:input.sourceSaveId,
    status:code, verifiedForTierPromotion:false as const,
    historyComplete:false as const,
    contentHashAuthenticated:false as const,
    semanticWrites:0 as const, automaticPromotion:false as const,
    fullNpcContextRequired:true as const,
    checkedRows,sourceRows,candidateCount:found,
    receipts:events,
    notes:[
      "SESSION_LOG State hash binds save/time/scene/TX envelope, not World advances JSON.",
      "Internally consistent receipts are candidates, not independently authenticated history.",
      "Never infer 6 meaningful days, change KEY or prune NPC memory from this audit.",
    ],
  });
  if(!input.stableAfterRead) return result("CONTROL_SNAPSHOT_CHANGED");
  if(!input.sourceSaveId||!Number.isSafeInteger(input.worldDay)||input.worldDay<1||
     moment("Day"+input.worldDay+" "+input.worldTime)===null)
    return result("INVALID_SAVE_CLOCK");
  if(input.requestedActorIds.length>LIMIT_ACTORS||
     !input.requestedActorIds.length||
     input.requestedActorIds.some(id=>!validActor(id)))
    return result("ACTOR_SCOPE_REQUIRED_OR_EXCEEDED");
  let window:ReturnType<typeof planNpcHeatJournalWindow>;
  try {window=planNpcHeatJournalWindow(input.index);}catch{return result("INVALID_TX_INDEX");}
  if(window.endRow===0) return result("NO_COMMITTED_TX_ROWS");
  if(input.rowStart!==window.startRow||input.rows.length>LIMIT_ROWS||
    input.rows.length!==window.endRow-window.startRow+1)
    return result("INCOMPLETE_OR_SHIFTED_WINDOW");
  const h=input.header.map(value);
  if(h.length<16||REQUIRED.some(k=>!h.includes(k))||
     h[0]!=="Save ID"||h[1]!=="Turn ID"||h[2]!=="TX ID"||
     h[9]!=="World advances JSON"||h[13]!=="State hash")
    return result("INVALID_JOURNAL_SCHEMA");
  const col=(name:string)=>h.indexOf(name);
  const indexCounts=new Map<string,number>();
  for (const [i,row] of input.index.entries()) if(i>0) {
    const tx=value(row?.[0]); if(tx)indexCounts.set(tx,(indexCounts.get(tx)??0)+1);
  }
  const actors=new Set(input.requestedActorIds);
  const events:Receipt[]=[];
  const eventIds=new Set<string>();
  let sourced=0,checked=0,found=0;
  for(let i=0;i<input.rows.length;i++) {
    const r=input.rows[i],rowNo=input.rowStart+i;
    const tx=value(r[col("TX ID")]);
    if(tx!==value(input.index[rowNo-1]?.[0]))
      return result("TX_INDEX_WINDOW_RACE");
    if(!tx)continue;
    checked++;
    const raw=value(r[col("World advances JSON")]);
    if(!raw)continue;
    let world:Record<string,unknown>;
    try {
      const parsed:unknown=JSON.parse(raw);
      if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))continue;
      world=parsed as Record<string,unknown>;
    }catch {continue;}
    if(!Object.hasOwn(world,"engineNpcAttentionReceipts"))continue;
    sourced++;
    if(!Array.isArray(world.engineNpcAttentionReceipts)||
      world.engineNpcAttentionReceipts.length>LIMIT_EVENTS_PER_TX)
      return result("INVALID_ENGINE_RECEIPT_BATCH");
    const save=value(r[col("Save ID")]),turn=value(r[col("Turn ID")]);
    const end=value(r[col("Inworld end")]),start=value(r[col("Inworld start")]);
    const scene=value(r[col("Scene ID")]);
    const hash=value(r[col("State hash")]).toLowerCase();
    const source=value(r[col("Source")]),version=value(r[col("Version")]);
    const endAt=moment(end),startAt=moment(start);
    const now=moment("Day"+input.worldDay+" "+input.worldTime)!;
    if(!save||!turn||!scene||!tx||endAt===null||startAt===null||
      endAt<startAt||endAt>now||source!=="ENGINE_FASTPATH"||version!=="1"||
      hash!==hash32([save,end,scene,tx].join("|")).toString(16)||
      indexCounts.get(tx)!==1)
      return result("UNATTESTED_ENGINE_TX_ENVELOPE");
    const match=/^Day\s*(\d+)\s+(\d{1,2}:\d{2}(?::\d{2})?)$/.exec(end)!;
    for(const e of world.engineNpcAttentionReceipts) {
      if(!e||typeof e!=="object"||Array.isArray(e))
        return result("MALFORMED_RECEIPT");
      const v=e as Record<string,unknown>;
      const actor=value(v.actorId),kind=value(v.kind),ref=value(v.sourceRef);
      const expectedId=[tx,actor,kind,ref].join("|");
      const kindOk=(kind==="SCENE_PRESENCE"&&ref==="scene:"+scene)||
        (kind==="SUBSTANTIVE_EXCHANGE"&&ref.startsWith("memory:"))||
        (kind==="MEANINGFUL_RELATIONSHIP_EVENT"&&(ref.startsWith("memory:")||ref.startsWith("relation:")));
      if(!validActor(actor)||v.committed!==true||!ref||ref.length>512||
        !kindOk||value(v.eventId)!==expectedId||value(v.txId)!==tx||
        value(v.sceneId)!==scene||v.day!==Number(match[1])||
        moment("Day"+String(v.day)+" "+value(v.time))!==endAt||
        (kind==="MEANINGFUL_RELATIONSHIP_EVENT"&&value(v.meaningfulEvidence).length<24)||
        (v.counterpartIds!==undefined&&
          (!Array.isArray(v.counterpartIds)||v.counterpartIds.some(
            p=>typeof p!=="string"||(!validActor(p)&&p!=="player.shura")))))
        return result("MALFORMED_OR_CROSS_TX_RECEIPT");
      if(eventIds.has(expectedId))return result("DUPLICATED_RECEIPT_EVENT_ID");
      eventIds.add(expectedId);
      found++;
      if(actors.has(actor))events.push(v as Receipt);
    }
  }
  return result(window.truncated?"PARTIAL_JOURNAL_WINDOW":"COMPLETE_WINDOW_NOT_FULL_HISTORY",
    events,checked,sourced,found);
}
