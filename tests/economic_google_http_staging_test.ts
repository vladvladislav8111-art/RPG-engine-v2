import {
  makeIsolatedGoogleEconomicHttpTransport,
  type GoogleHttpJson,
} from "../src/economic_google_http_staging.ts";
import type {
  GoogleEconomicProjectionImage,
} from "../src/economic_google_projection_packets.ts";
import { config } from "../src/config.ts";

type Target="TEMP_RUNTIME"|"LIVE_TRANSACTION_ARCHIVE";
const scope="scope.fixture.projection";
const spreadsheet="staging.fixture.explicitly_not_runtime";
const document="staging.fixture.explicitly_not_archive";
const sheet= "EC06_STAGE!A1";
const newImage=(target:Target):GoogleEconomicProjectionImage=>({
  schema:"EC06_VERIFIED_PROJECTION_V1",target,scopeId:scope,
  revision:"revision.fixture.start",lastTxId:"tx.fixture.migrated",
  accounts:{"account.fixture.one":{
    accountId:"account.fixture.one",availableCopper:75,heldCopper:0,
  }},
  escrows:{},lots:{},receipts:{},
});
class FakeStagingGoogleApi{
  sheetImage=newImage("TEMP_RUNTIME");
  docsImage=newImage("LIVE_TRANSACTION_ARCHIVE");
  docRevision=1;
  docBody="EC06_DOC_IMAGE_V1 "+JSON.stringify(this.docsImage)+"\n";
  sheetWrites=0;
  docWrites=0;
  refuseDocWrite=false;
  async json(url:string,init?:RequestInit):Promise<unknown>{
    const method=init?.method??"GET";
    if(url.includes("/spreadsheets/")){
      if(!url.includes(encodeURIComponent(spreadsheet)))
        throw Error("Client accidentally addressed real spreadsheet");
      if(method==="GET")return {values:[[JSON.stringify(this.sheetImage)]]};
      if(method==="PUT"){
        const body=JSON.parse(String(init?.body)) as {
          range:string;majorDimension:string;values:string[][];
        };
        if(body.range!==sheet||body.majorDimension!=="ROWS"||
           body.values.length!==1||body.values[0].length!==1)
          throw Error("Non-atomic projection fanout to multiple Sheet cells");
        this.sheetImage=JSON.parse(body.values[0][0]) as GoogleEconomicProjectionImage;
        this.sheetWrites++;
        return {updatedCells:1};
      }
    }
    if(url.includes("/documents/")){
      if(!url.includes(encodeURIComponent(document)))
        throw Error("Client accidentally addressed real archive");
      if(method==="GET"){
        return {revisionId:"rev."+this.docRevision,
          body:{content:[{paragraph:{elements:[{textRun:{content:this.docBody}}]}}]}};
      }
      if(method==="POST"&&url.endsWith(":batchUpdate")){
        if(this.refuseDocWrite)throw Error("synthetic temporary Google Docs outage");
        const body=JSON.parse(String(init?.body)) as {
          writeControl:{requiredRevisionId:string};
          requests:Array<{insertText:{text:string}}>;
        };
        if(body.writeControl.requiredRevisionId!=="rev."+this.docRevision)
          throw Error("Docs native revision CAS conflict");
        this.docBody+=body.requests[0].insertText.text;
        this.docRevision++;
        this.docWrites++;
        return {replies:[{}],writeControl:{requiredRevisionId:"rev."+this.docRevision}};
      }
    }
    throw Error("Unexpected Google staging request: "+method+" "+url);
  }
}
function make(api:FakeStagingGoogleApi,opts?:{locked?:boolean}){
  let assertions=0;
  const writerFence={
    async assertExclusiveWriter(_target:Target,s:string) {
      assertions++;
      if(opts?.locked===false||s!==scope)throw Error("No exclusive staged writer permit");
    },
  };
  return {transport:makeIsolatedGoogleEconomicHttpTransport({
    stagingSpreadsheetId:spreadsheet,stagingDocumentId:document,
    scopeId:scope,writerFence,
    httpJson:api.json.bind(api) as GoogleHttpJson,
  }),assertions:()=>assertions};
}
async function rejected(run:()=>Promise<unknown>,name:string){
  let fail=false;try{await run()}catch{fail=true}
  if(!fail)throw Error("Unsafe Google staging allowed: "+name);
}
Deno.test("real-shaped Sheets one-cell HTTP write and Docs revision CAS with readback",async()=>{
  const api=new FakeStagingGoogleApi();
  const {transport,assertions}=make(api);
  const original=await transport.readVerifiedImage("TEMP_RUNTIME",scope);
  const sheetNext={...original,revision:"revision.fixture.tx_1",lastTxId:"tx.fixture.tx_1"};
  await transport.replaceImageAtExactRevision({
    target:"TEMP_RUNTIME",scopeId:scope,
    expectedRevision:original.revision,image:sheetNext,
  });
  const docOriginal=await transport.readVerifiedImage("LIVE_TRANSACTION_ARCHIVE",scope);
  const docNext={...docOriginal,revision:"revision.fixture.tx_1",lastTxId:"tx.fixture.tx_1"};
  await transport.replaceImageAtExactRevision({
    target:"LIVE_TRANSACTION_ARCHIVE",scopeId:scope,
    expectedRevision:docOriginal.revision,image:docNext,
  });
  if(api.sheetWrites!==1||api.docWrites!==1||assertions()<4)
    throw Error("Actual Google HTTP request shape not exercised");
  if((await transport.readVerifiedImage("TEMP_RUNTIME",scope)).revision!==sheetNext.revision||
     (await transport.readVerifiedImage("LIVE_TRANSACTION_ARCHIVE",scope)).revision!==docNext.revision)
    throw Error("Google readback wrong after staged write");
});
Deno.test("staging transport cannot be pointed at production economy files",()=>{
  const api=new FakeStagingGoogleApi(),writerFence={
    async assertExclusiveWriter(){},
  };
  let failed=false;
  try {
    makeIsolatedGoogleEconomicHttpTransport({
      stagingSpreadsheetId:config.files.TEMP_RUNTIME,
      stagingDocumentId:document,scopeId:scope,writerFence,
      httpJson:api.json.bind(api),
    });
  }catch{failed=true}
  if(!failed)throw Error("Production TEMP_RUNTIME accidentally writable from staging");
  failed=false;
  try{
    makeIsolatedGoogleEconomicHttpTransport({
      stagingSpreadsheetId:spreadsheet,
      stagingDocumentId:config.files.LIVE_TRANSACTION_ARCHIVE,
      scopeId:scope,writerFence,
      httpJson:api.json.bind(api),
    });
  }catch{failed=true}
  if(!failed)throw Error("Production archive accidentally writable from staging");
});
Deno.test("writer fence or stale staged target revision blocks write",async()=>{
  const api=new FakeStagingGoogleApi();
  const locked=make(api,{locked:false}).transport;
  await rejected(()=>locked.replaceImageAtExactRevision({
    target:"TEMP_RUNTIME",scopeId:scope,expectedRevision:"revision.fixture.start",
    image:{...api.sheetImage,revision:"revision.fixture.changed"},
  }),"staging writer lock missing");
  if(api.sheetWrites!==0)throw Error("Missing lock still changed Sheets");
  const {transport}=make(api);
  await rejected(()=>transport.replaceImageAtExactRevision({
    target:"TEMP_RUNTIME",scopeId:scope,expectedRevision:"revision.fixture.old",
    image:{...api.sheetImage,revision:"revision.fixture.changed"},
  }),"stale sheet checkpoint");
  await rejected(()=>transport.replaceImageAtExactRevision({
    target:"LIVE_TRANSACTION_ARCHIVE",scopeId:scope,expectedRevision:"revision.fixture.old",
    image:{...api.docsImage,revision:"revision.fixture.changed"},
  }),"stale Docs checkpoint");
  if(api.sheetWrites!==0||api.docWrites!==0)
    throw Error("Stale write produced target mutation");
});
Deno.test("Google Docs outage does not partially append state, retry remains possible",async()=>{
  const api=new FakeStagingGoogleApi();
  const {transport}=make(api);
  const docNext={...api.docsImage,revision:"revision.fixture.tx_1"};
  api.refuseDocWrite=true;
  await rejected(()=>transport.replaceImageAtExactRevision({
    target:"LIVE_TRANSACTION_ARCHIVE",scopeId:scope,
    expectedRevision:"revision.fixture.start",image:docNext,
  }),"Google Docs offline");
  if(api.docWrites!==0)throw Error("Docs failed but partial content written");
  api.refuseDocWrite=false;
  await transport.replaceImageAtExactRevision({
    target:"LIVE_TRANSACTION_ARCHIVE",scopeId:scope,
    expectedRevision:"revision.fixture.start",image:docNext,
  });
  if(api.docWrites!==1)throw Error("Docs retry did not append exactly once");
});
