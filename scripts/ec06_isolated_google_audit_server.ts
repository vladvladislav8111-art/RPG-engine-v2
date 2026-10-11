/**
 * Deploy as a SEPARATE Deno service for a single NONPRODUCTION Google readback.
 * The physical IDs below were verified from brand-new COPIES of prior staging
 * assets. These are NOT game runtime IDs. No POST/PUT/PATCH/DELETE endpoints.
 * Requires short-lived, restricted Google OAuth token with read scopes.
 * Never reuse live-game deployment identity, KV or credentials for this probe.
 *
 * Example command (ONLY on isolated service / local dev):
 *   deno run --allow-net=sheets.googleapis.com,docs.googleapis.com,0.0.0.0:8001 \\
 *     --allow-env=EC06_PROBE_API_KEY,EC06_GOOGLE_ACCESS_TOKEN,PORT,EC06_SANDBOX_READONLY \\
 *     scripts/ec06_isolated_google_audit_server.ts
 */
import {auditIsolatedGoogleSandbox} from "../src/ec06_isolated_google_audit_probe.ts";

const SHEET="1SKcf0KDACaL9RJu2ZfGy61NVZwYpiRdZ9t1K6L9S2Ks";
const DOC="13yQS3aLzOtHSLSnUoM2Cn_fmS1b0z4L-J-NYpzLwNhk";
const SCOPE="scope.fixture.isolated_one_shot_20261011";
const TX_IDS=["tx.fixture.smoke_reserve_001","tx.fixture.smoke_pay_002"] as const;
if(Deno.env.get("EC06_SANDBOX_READONLY")!=="true")
  throw Error("This fixed-sandbox probe must be explicitly armed READONLY");
const apiKey=Deno.env.get("EC06_PROBE_API_KEY");
const googleAccessToken=Deno.env.get("EC06_GOOGLE_ACCESS_TOKEN");
if(!apiKey||apiKey.length<24||!googleAccessToken||googleAccessToken.length<30)
  throw Error("Independent probe authentication and short-lived Google token required");
const port=Number(Deno.env.get("PORT")??"8001");
if(!Number.isInteger(port)||port<1||port>65535)throw Error("Invalid probe PORT");
function json(data:unknown,status=200):Response{
  return new Response(JSON.stringify(data),{status,headers:{
    "content-type":"application/json; charset=utf-8","cache-control":"no-store",
    "x-content-type-options":"nosniff",
  }});
}
Deno.serve({port,hostname:"0.0.0.0"},async req=>{
  if(req.headers.get("authorization")!=="Bearer "+apiKey)
    return json({ok:false,error:"unauthorized"},401);
  const path=new URL(req.url).pathname;
  if(req.method!=="GET")return json({ok:false,error:"read-only service"},405);
  if(path==="/health")return json({ok:true,mode:"ISOLATED_READ_ONLY",
    scope:SCOPE,target:"fixed Google sandbox copies"});
  if(path!=="/audit")return json({ok:false,error:"not found"},404);
  try{
    const result=await auditIsolatedGoogleSandbox({
      spreadsheetId:SHEET,documentId:DOC,scopeId:SCOPE,txIds:TX_IDS,
    },async url=>{
      if(!url.startsWith("https://sheets.googleapis.com/v4/spreadsheets/"+SHEET+"/")&&
         !url.startsWith("https://docs.googleapis.com/v1/documents/"+DOC+"?"))
        throw Error("Attempted out-of-scope Google read");
      const response=await fetch(url,{method:"GET",redirect:"error",
        headers:{authorization:"Bearer "+googleAccessToken},
      });
      if(!response.ok)throw Error("Google probe fetch failed");
      return await response.json() as unknown;
    });
    return json({ok:true,...result});
  }catch{
    // Never log or reflect bearer, Google document contents or private data.
    return json({ok:false,error:"audit refused / source mismatch"},409);
  }
});
