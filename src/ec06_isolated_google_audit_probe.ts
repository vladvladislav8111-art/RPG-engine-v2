/**
 * EC-06 real Google API read-only post-write verifier for dedicated sandbox.
 * This module cannot mutate Google, Deno KV, game saves or NPC resources.
 * Deliberately bounded to 3 source rows, 2 receipt slots, 2 archive deltas.
 * It is an isolated one-shot operations probe, NOT the production worker.
 */
export type GoogleSandboxGet=(url:string)=>Promise<unknown>;
export type SandboxProbePlan={
  spreadsheetId:string;documentId:string;scopeId:string;
  txIds:readonly [string,string];
};
const runScope=/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/i;
const id=(s:unknown)=>typeof s==="string"&&runScope.test(s)&&s.length<=180;
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const asObject=(v:unknown):Record<string,unknown>=>{
  if(!v||typeof v!=="object"||Array.isArray(v))
    throw Error("Isolated Google staging value is not an object");
  return v as Record<string,unknown>;
};
function parseJson(s:unknown):unknown{
  if(typeof s!=="string"||s.length>25000)throw Error("Missing or oversized sandbox JSON cell");
  return JSON.parse(s) as unknown;
}
function flatten(elements:unknown):string{
  if(!Array.isArray(elements))return "";
  let text="";
  for(const item of elements){
    const p=(item as {paragraph?:{elements?:Array<{textRun?:{content?:string}}>}}).paragraph;
    for(const e of p?.elements??[])text+=e.textRun?.content??"";
  }
  return text;
}
function parseGoogleRange(raw:unknown,expectedSize:number):Map<string,unknown>{
  const rows=(asObject(raw).values as unknown[]);
  if(!Array.isArray(rows)||rows.length!==expectedSize)
    throw Error("Bounded Google sandbox range does not match approved row count");
  const map=new Map<string,unknown>();
  for(const entry of rows){
    if(!Array.isArray(entry)||entry.length!==2||typeof entry[0]!=="string"||
       !entry[0]||map.has(entry[0]))
      throw Error("Unpinned or duplicate Google sandbox row");
    map.set(entry[0],parseJson(entry[1]));
  }
  return map;
}
function totalCopper(rows:Map<string,unknown>):number{
  let copper=0,accounts=0;
  for(const [k,v] of rows){
    if(!k.startsWith("account/"))continue;
    const r=asObject(v);
    if(r.accountId!==k.slice("account/".length)||
      !Number.isSafeInteger(r.availableCopper)||!Number.isSafeInteger(r.heldCopper)||
      (r.availableCopper as number)<0||(r.heldCopper as number)<0)
      throw Error("Sandbox source account is not a finite, nonnegative cash row");
    copper+=(r.availableCopper as number)+(r.heldCopper as number);
    accounts++;
  }
  if(accounts!==2||!Number.isSafeInteger(copper))
    throw Error("Sandbox cash aggregate cannot be verified");
  return copper;
}
export async function auditIsolatedGoogleSandbox(
  plan:SandboxProbePlan,httpGet:GoogleSandboxGet,
):Promise<{scopeId:string;transactionCount:2;
  initialCopper:number;finalCopper:number;archiveConsistent:true;
  receiptsConsistent:true;documentRevisionPresent:true}> {
  if(!id(plan.scopeId)||plan.spreadsheetId===plan.documentId||
     !plan.spreadsheetId||!plan.documentId||
     plan.txIds.length!==2||!plan.txIds.every(id)||
     plan.txIds[0]===plan.txIds[1])
    throw Error("Invalid explicitly isolated EC06 audit scope");
  const sheetRoot="https://sheets.googleapis.com/v4/spreadsheets/"+
    encodeURIComponent(plan.spreadsheetId)+"/values/";
  const googleRange=(a1:string)=>sheetRoot+
    encodeURIComponent(a1)+"?valueRenderOption=UNFORMATTED_VALUE";
  const docsUrl="https://docs.googleapis.com/v1/documents/"+
    encodeURIComponent(plan.documentId)+"?includeTabsContent=true";
  const [rawRows,rawReceipts,rawDoc]=await Promise.all([
    httpGet(googleRange("EC06_IDX_ROWS!A2:B4")),
    httpGet(googleRange("EC06_IDX_RECEIPTS!A2:B3")),
    httpGet(docsUrl),
  ]);
  const sheetRows=parseGoogleRange(rawRows,3);
  const receipts=parseGoogleRange(rawReceipts,2);
  if(!plan.txIds.every(x=>receipts.has(x)))
    throw Error("Google receipt slots don't match the two allowed synthetic transactions");
  const doc=asObject(rawDoc);
  if(typeof doc.revisionId!=="string"||!doc.revisionId)
    throw Error("Google Docs revision unavailable");
  const tabs=doc.tabs as Array<{documentTab?:{body?:{content?:unknown}}}>|undefined;
  const body=tabs?.[0]?.documentTab?.body?.content ??
    (doc.body as {content?:unknown}|undefined)?.content;
  const lines=flatten(body).split("\n").map(s=>s.trim()).filter(Boolean);
  const genesis=lines.filter(s=>s.startsWith("EC06_INDEX_DOC_GENESIS_V1 "));
  const deltas=lines.filter(s=>s.startsWith("EC06_INDEX_DOC_DELTA_V1 "));
  if(genesis.length!==1||deltas.length!==2)
    throw Error("Isolated archive genesis or delta count is inconsistent");
  const initial=asObject(parseJson(genesis[0].slice("EC06_INDEX_DOC_GENESIS_V1 ".length)));
  if(initial.schema!=="EC06_INDEX_DOC_GENESIS_V1"||
     initial.scopeId!==plan.scopeId)
    throw Error("Google archived genesis belongs to a different source");
  const rawSource=asObject(initial.rows);
  const state=new Map<string,unknown>(Object.entries(rawSource));
  const initialCopper=totalCopper(state);
  if(state.size!==3)throw Error("Unexpected mutable row in isolated test source");
  for(let i=0;i<2;i++){
    const l=asObject(parseJson(deltas[i].slice("EC06_INDEX_DOC_DELTA_V1 ".length)));
    const tx=plan.txIds[i];
    if(l.schema!=="EC06_INDEX_DOC_DELTA_V1"||l.scopeId!==plan.scopeId||
       l.txId!==tx||typeof l.journalHash!=="string"||
       !/^[0-9a-f]{64}$/.test(l.journalHash))
      throw Error("Isolated delta identity or SHA-256 reference differs");
    const mut=l.mutations as Array<Record<string,unknown>>;
    if(!Array.isArray(mut)||mut.length<1||mut.length>16)
      throw Error("Invalid bounded immutable Google delta");
    const ids:string[]=[];
    for(const m of mut){
      if(!["account","escrow","lot"].includes(String(m.kind))||!id(m.id))
        throw Error("Invalid transaction row identity");
      const k=m.kind+"/"+m.id;
      if(ids.includes(k)||!state.has(k)||!same(state.get(k),m.before)||
         same(m.before,m.after))
        throw Error("Wrong causal BEFORE state or duplicate mutation");
      ids.push(k);
      state.set(k,m.after);
    }
    const docReceipt=asObject(l.receipt);
    const sheetReceipt=asObject(receipts.get(tx));
    for(const [target,r] of [["LIVE_TRANSACTION_ARCHIVE",docReceipt],
      ["TEMP_RUNTIME",sheetReceipt]] as const){
      if(r.schema!=="EC06_INDEXED_TARGET_RECEIPT_V1"||
         r.target!==target||r.scopeId!==plan.scopeId||
         r.txId!==tx||r.journalHash!==l.journalHash||
         !same(r.rowIds,ids))
        throw Error("Real Google projection receipts disagree");
    }
  }
  if(sheetRows.size!==state.size)
    throw Error("Sandbox materialized source row count diverged");
  for(const [key,value] of state)
    if(!sheetRows.has(key)||!same(sheetRows.get(key),value))
      throw Error("Google Sheet materialized balances don't replay from Doc history");
  const finalCopper=totalCopper(sheetRows);
  if(initialCopper!==finalCopper)
    throw Error("Money was created or destroyed across Google targets");
  return {
    scopeId:plan.scopeId,transactionCount:2,initialCopper,finalCopper,
    archiveConsistent:true,receiptsConsistent:true,documentRevisionPresent:true,
  };
}
