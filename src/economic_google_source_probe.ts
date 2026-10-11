/**
 * EC-06 live Google source probe — READ ONLY, pre-migration evidence capture.
 *
 * Reads source CURRENT money/custody twice and refuses a drifting save or
 * concurrent edit. It NEVER creates NPC balances, authorizes sale, seeds KV,
 * or freezes the original writers. A stable result is only an observation,
 * not an approved cutover or externally authenticated bank statement.
 */
import type { SourceMoney, SourceItem } from "./economic_cutover_audit.ts";

export type EconomicGoogleReadBatch = (
  spreadsheetId:string,ranges:readonly string[],
) => Promise<Record<string,unknown[][]>>;

const RANGES=[
  "CONTROL!B2",
  "PLAYER_RESOURCES!A1:D100",
  "INVENTORY_CURRENT!A1:M500",
] as const;

export type LiveEconomicSourceObservation = {
  state:"OBSERVED_NOT_MIGRATED";
  spreadsheetId:string;
  committedSaveId:string;
  observationFingerprint:string;
  money:readonly SourceMoney[];
  items:readonly SourceItem[];
  unknownNpcMoneyCount:"NOT_OBSERVABLE_FROM_THIS_SCHEMA";
  originalSheetsWritersFrozen:false;
  sourceAuthority:"GOOGLE_SHEETS_CURRENT_READ_ONLY";
  observationsAreIndependentProof:false;
};

const str=(v:unknown)=>String(v??"").trim();
function column(rows:unknown[][],name:string):number{
  const index=(rows[0]??[]).map(str).indexOf(name);
  if(index<0)throw Error("Source Google schema changed or missing field: "+name);
  return index;
}
function moneyAmount(value:unknown):number {
  const raw=str(value).replace(/\s/g,"");
  if(!/^(0|[1-9]\d*)$/.test(raw))throw Error("Cash source must be nonnegative integer copper");
  const n=Number(raw);
  if(!Number.isSafeInteger(n))throw Error("Source money exceeds safe integer range");
  return n;
}
function positiveQty(value:unknown):number {
  const raw=str(value).replace(",",".");
  const n=Number(raw);
  if(!raw||!Number.isFinite(n)||n<=0)throw Error("Invalid physical source quantity");
  return n;
}
async function sha256(s:string):Promise<string>{
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));
  return Array.from(new Uint8Array(bytes)).map(x=>x.toString(16).padStart(2,"0")).join("");
}
export async function probeCurrentEconomicGoogleSources(input:{
  spreadsheetId:string;
  expectedCommittedSaveId:string;
  readBatch:EconomicGoogleReadBatch;
}):Promise<LiveEconomicSourceObservation>{
  const {spreadsheetId,expectedCommittedSaveId,readBatch}=input;
  if(!spreadsheetId||!expectedCommittedSaveId)
    throw Error("Explicit pinned source spreadsheet and committed save required");
  const first=await readBatch(spreadsheetId,RANGES);
  // Duplicate full read is deliberate: a stable save ID alone does NOT catch
  // an external user edit to money/custody without a semantic game turn.
  const second=await readBatch(spreadsheetId,RANGES);
  if(RANGES.some(r=>!first[r]||!second[r]||
    JSON.stringify(first[r])!==JSON.stringify(second[r]))){
    throw Error("CURRENT economic source changed during read: retry at stable save");
  }
  const actual=str(first["CONTROL!B2"]?.[0]?.[0]);
  if(actual!==expectedCommittedSaveId)
    throw Error("Committed save diverged; source probe will not guess a new save");
  const resourceRows=first["PLAYER_RESOURCES!A1:D100"];
  const inventoryRows=first["INVENTORY_CURRENT!A1:M500"];
  if(!resourceRows?.length||!inventoryRows?.length)
    throw Error("Source CURRENT tables missing");
  const resourceId=column(resourceRows,"Entity ID");
  const resourceType=column(resourceRows,"Resource");
  const resourceValue=column(resourceRows,"Current");
  const physicalId=column(inventoryRows,"Item ID");
  const physicalTemplate=column(inventoryRows,"Template ID");
  const physicalQty=column(inventoryRows,"Qty");
  const physicalCustodian=column(inventoryRows,"Custodian");
  const physicalLocation=column(inventoryRows,"Location/container");
  const physicalVersion=column(inventoryRows,"Version");

  const money:SourceMoney[]=[];
  const seenMoney=new Set<string>();
  for(let i=1;i<resourceRows.length;i++){
    const row=resourceRows[i];
    if(!row||row.every(v=>str(v)===""))continue;
    if(str(row[resourceType])!=="Money")continue;
    const entity=str(row[resourceId]);
    if(!entity||seenMoney.has(entity))throw Error("Duplicate or unidentified money source");
    seenMoney.add(entity);
    money.push({
      sourceEntityId:entity,sourceResource:"Money",
      currentCopper:moneyAmount(row[resourceValue]),
      sourceRowRef:"sheets."+spreadsheetId+".PLAYER_RESOURCES.row_"+(i+1),
    });
  }
  // Shura's actual Money is a known CURRENT source; merchant funds remain
  // UNKNOWN unless another *existing* source Money record actually proves it.
  if(!money.some(r=>r.sourceEntityId==="player.shura"))
    throw Error("Current Shura Money missing; migration audit must halt");
  const items:SourceItem[]=[];
  const seenItems=new Set<string>();
  for(let i=1;i<inventoryRows.length;i++){
    const row=inventoryRows[i];
    if(!row||row.every(v=>str(v)===""))continue;
    const itemId=str(row[physicalId]);
    if(!itemId)continue;
    if(seenItems.has(itemId))throw Error("Duplicate unique physical Item ID: "+itemId);
    seenItems.add(itemId);
    const version=Number(str(row[physicalVersion]));
    if(!Number.isSafeInteger(version)||version<1)
      throw Error("Current physical instance missing a positive version: "+itemId);
    const templateId=str(row[physicalTemplate]);
    const custodian=str(row[physicalCustodian]);
    const location=str(row[physicalLocation]);
    if(!templateId||!custodian||!location)
      throw Error("Missing physical template/custodian/location: "+itemId);
    items.push({
      itemId,templateId,qty:positiveQty(row[physicalQty]),
      custodian,location,sourceVersion:version,
      sourceRowRef:"sheets."+spreadsheetId+".INVENTORY_CURRENT.row_"+(i+1),
    });
  }
  return {
    state:"OBSERVED_NOT_MIGRATED",spreadsheetId,
    committedSaveId:actual,
    observationFingerprint:await sha256(JSON.stringify({
      saveId:actual,money,items,
    })),
    money,items,
    unknownNpcMoneyCount:"NOT_OBSERVABLE_FROM_THIS_SCHEMA",
    originalSheetsWritersFrozen:false,
    sourceAuthority:"GOOGLE_SHEETS_CURRENT_READ_ONLY",
    observationsAreIndependentProof:false,
  };
}
