/**
 * EC-06 actual Google HTTP transport for NONPRODUCTION isolated projection
 * assets. It is not wired to main.ts / semantic commits or current Sheets.
 *
 * Docs requiredRevisionId provides compare-and-swap semantics per document.
 * Sheets values.update has NO server-side compare-and-swap precondition.
 * Therefore a trusted EXCLUSIVE WRITER fence is mandatory and any ambiguous
 * or concurrent external writer is a fail-closed incident. This transport
 * cannot claim full production ACID or automated multi-writer recovery.
 */
import { getGoogleAccessToken } from "./auth.ts";
import { config } from "./config.ts";
import type {
  AuthoritativeGoogleProjectionTransport,
  GoogleEconomicProjectionImage,
} from "./economic_google_projection_packets.ts";

type Target="TEMP_RUNTIME"|"LIVE_TRANSACTION_ARCHIVE";
export type GoogleHttpJson = (url:string,init?:RequestInit)=>Promise<unknown>;
export type ExclusiveProjectionWriterFence = {
  /** Must be enforced by a privileged internal owner; never user-supplied. */
  assertExclusiveWriter(target:Target,scopeId:string):Promise<void>;
};
const STAGING_RANGE="EC06_STAGE!A1";
const DOC_LINE="EC06_DOC_IMAGE_V1 ";
const clone=<T>(v:T):T=>structuredClone(v);
function bodyElements(elements:unknown):string{
  if(!Array.isArray(elements))return "";
  let out="";
  for(const node of elements){
    const n=node as Record<string,unknown>;
    const para=n.paragraph as {elements?:Array<{textRun?:{content?:string}}>}|undefined;
    for(const e of para?.elements??[])out+=e.textRun?.content??"";
    const table=n.table as {tableRows?:Array<{tableCells?:Array<{content?:unknown}>}>}|undefined;
    for(const row of table?.tableRows??[])
      for(const cell of row.tableCells??[])out+=bodyElements(cell.content);
  }
  return out;
}
function parseImage(raw:unknown,target:Target,scope:string):GoogleEconomicProjectionImage {
  if(typeof raw!=="string"||raw.length<30||raw.length>1_500_000)
    throw Error("Google EC06 staging image missing or over size bound");
  const x=JSON.parse(raw) as GoogleEconomicProjectionImage;
  if(x.schema!=="EC06_VERIFIED_PROJECTION_V1"||
     x.scopeId!==scope||x.target!==target||typeof x.revision!=="string"||
     !x.revision||typeof x.lastTxId!=="string"||
     !x.accounts||!x.escrows||!x.lots||!x.receipts||
     Array.isArray(x.accounts)||Array.isArray(x.escrows)||Array.isArray(x.lots)){
    throw Error("Google staging target is not the expected scoped current image");
  }
  return x;
}
function googleDocumentSnapshot(doc:unknown,target:Target,scope:string){
  if(!doc||typeof doc!=="object")throw Error("Missing Google document response");
  const obj=doc as Record<string,unknown>;
  const tabs=obj.tabs as Array<{tabProperties?:{tabId?:string};documentTab?:{body?:{content?:unknown}}}>|undefined;
  const tab=tabs?.[0];
  const content=tab
    ? bodyElements(tab.documentTab?.body?.content)
    : bodyElements((obj.body as {content?:unknown}|undefined)?.content);
  const serialized=content.split("\n").map(s=>s.trim())
    .filter(line=>line.startsWith(DOC_LINE)).at(-1)?.slice(DOC_LINE.length);
  if(!serialized)throw Error("Isolated Google archive has no initial EC06 image");
  const revisionId=obj.revisionId;
  if(typeof revisionId!=="string"||!revisionId)
    throw Error("Google Docs revision CAS is unavailable");
  return {
    image:parseImage(serialized,target,scope),
    revisionId,
    tabId:tab?.tabProperties?.tabId,
  };
}
export async function authenticatedEconomicGoogleJson(
  url:string,init?:RequestInit,
):Promise<unknown>{
  if(!url.startsWith("https://sheets.googleapis.com/v4/") &&
     !url.startsWith("https://docs.googleapis.com/v1/")){
    throw Error("EC06 transport may access only official Google Sheets/Docs APIs");
  }
  const response=await fetch(url,{
    ...init,headers:{
      authorization:"Bearer "+(await getGoogleAccessToken()),
      "content-type":"application/json",
      ...(init?.headers??{}),
    },
  });
  if(!response.ok){
    throw Error("EC06 Google staging HTTP "+response.status+": "+
      (await response.text()).slice(0,250));
  }
  return await response.json() as unknown;
}
/**
 * Caller must provision SEPARATE isolated test Sheet with EC06_STAGE!A1 JSON
 * and separate test Doc with one EC06_DOC_IMAGE_V1 <json> line.
 * Live game spreadsheet and LIVE_TRANSACTION_ARCHIVE doc are ALWAYS refused.
 *
 * Exclusive writer assertion must be true for entire request and all other
 * economic projection writers must be disabled. Sheets alone cannot CAS.
 */
export function makeIsolatedGoogleEconomicHttpTransport(input:{
  stagingSpreadsheetId:string;
  stagingDocumentId:string;
  scopeId:string;
  writerFence:ExclusiveProjectionWriterFence;
  httpJson?:GoogleHttpJson;
}):AuthoritativeGoogleProjectionTransport {
  const {stagingSpreadsheetId,stagingDocumentId,scopeId,writerFence}=input;
  const http=input.httpJson??authenticatedEconomicGoogleJson;
  if(!stagingSpreadsheetId||!stagingDocumentId||!scopeId||!writerFence ||
     stagingSpreadsheetId===config.files.TEMP_RUNTIME||
     stagingDocumentId===config.files.LIVE_TRANSACTION_ARCHIVE||
     stagingSpreadsheetId===stagingDocumentId){
    throw Error("EC06 projection requires separate isolated target files, never live assets");
  }
  const sheetUrl="https://sheets.googleapis.com/v4/spreadsheets/"+
    encodeURIComponent(stagingSpreadsheetId)+"/values/"+
    encodeURIComponent(STAGING_RANGE);
  const docUrl="https://docs.googleapis.com/v1/documents/"+
    encodeURIComponent(stagingDocumentId);
  async function readSheet():Promise<GoogleEconomicProjectionImage>{
    const raw=await http(sheetUrl+"?valueRenderOption=UNFORMATTED_VALUE");
    const response=raw as {values?:unknown[][]};
    return parseImage(response.values?.[0]?.[0],"TEMP_RUNTIME",scopeId);
  }
  async function readDocs(){
    const data=await http(docUrl+"?includeTabsContent=true");
    return googleDocumentSnapshot(data,"LIVE_TRANSACTION_ARCHIVE",scopeId);
  }
  return {
    async readVerifiedImage(target,scope){
      if(scope!==scopeId)throw Error("Unapproved Google economic projection scope");
      return clone(target==="TEMP_RUNTIME"
        ? await readSheet():(await readDocs()).image);
    },
    async replaceImageAtExactRevision({target,scopeId:scope,expectedRevision,image}){
      if(scope!==scopeId||image.scopeId!==scopeId||
         image.target!==target||image.schema!=="EC06_VERIFIED_PROJECTION_V1"||
         image.revision===expectedRevision){
        throw Error("Invalid EC06 Google staged replacement intent");
      }
      await writerFence.assertExclusiveWriter(target,scopeId);
      if(target==="TEMP_RUNTIME"){
        const before=await readSheet();
        if(before.revision!==expectedRevision)
          throw Error("Sheets staged before-revision drift: conflict");
        // Sheets values.update changes ONE full JSON cell: the target values,
        // watermark and receipt are indivisible inside that cell. The API
        // still has no server-side revision comparison and can be overwritten
        // by rogue editors or other writers; exclusive fencing is mandatory.
        const updated=await http(sheetUrl+"?valueInputOption=RAW",{
          method:"PUT",
          body:JSON.stringify({range:STAGING_RANGE,majorDimension:"ROWS",
            values:[[JSON.stringify(image)]]}),
        }) as {updatedCells?:number};
        if(updated.updatedCells!==1)
          throw Error("Google Sheets staged image update not confirmed");
        await writerFence.assertExclusiveWriter(target,scopeId);
        const after=await readSheet();
        if(JSON.stringify(after)!==JSON.stringify(image))
          throw Error("Sheets staged readback diverged, do not ACK projection");
      }else{
        const before=await readDocs();
        if(before.image.revision!==expectedRevision)
          throw Error("Docs staged before-revision drift: conflict");
        const endOfSegmentLocation=before.tabId?{tabId:before.tabId}:{};
        const append="\n"+DOC_LINE+JSON.stringify(image)+"\n";
        await http(docUrl+":batchUpdate",{
          method:"POST",
          body:JSON.stringify({
            requests:[{insertText:{endOfSegmentLocation,text:append}}],
            writeControl:{requiredRevisionId:before.revisionId},
          }),
        });
        await writerFence.assertExclusiveWriter(target,scopeId);
        const after=await readDocs();
        if(JSON.stringify(after.image)!==JSON.stringify(image))
          throw Error("Docs staged readback diverged, do not ACK projection");
      }
    },
  };
}
