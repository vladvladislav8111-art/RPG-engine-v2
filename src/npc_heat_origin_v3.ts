/**
 * TEST-only V3 proof of key possession for exact committed NPC-receipt bytes.
 *
 * Distinct from V2 SHA-256, this HMAC resists forged Sheets edits by parties
 * without the server-side secret. It does NOT prove that the underlying
 * semantic action occurred, that history is complete, or that Google writes
 * are fenced. No Heat tier/KEY promotion is authorized by this module.
 */
export type NpcHeatOriginFrame = {
  saveTo:string;turnId:string;txId:string;inworldStart:string;
  inworldEnd:string;sceneId:string;source:string;worldAdvancesJson:string;
};
const KEY_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/i;
const encoder = new TextEncoder();
function validate(frame:NpcHeatOriginFrame,keyId:string,secret:string) {
  if(!KEY_ID.test(keyId) || encoder.encode(secret).length<32)
    throw Error("TEST_V3_HMAC_KEY_MISSING_OR_INVALID");
  if(!/^TEST-[a-z0-9._-]+$/i.test(frame.saveTo) ||
     frame.source!=="ENGINE_FASTPATH" ||
     !frame.turnId || !frame.txId || !frame.sceneId ||
     !frame.inworldStart || !frame.inworldEnd ||
     frame.worldAdvancesJson.length>262144)
    throw Error("TEST_V3_PROVENANCE_SOURCE_INVALID");
  let json:unknown;
  try {json=JSON.parse(frame.worldAdvancesJson);} catch {
    throw Error("TEST_V3_PROVENANCE_JSON_INVALID");
  }
  if(!json || typeof json!=="object" || Array.isArray(json) ||
    (json as Record<string,unknown>).engineNpcReceiptEpoch!=="TEST_ONLY_V3")
    throw Error("TEST_V3_PROVENANCE_EPOCH_INVALID");
}
function bytes(frame:NpcHeatOriginFrame,keyId:string):ArrayBuffer {
  const encoded=encoder.encode(JSON.stringify([
    "NPC_HEAT_ORIGIN_V3_HMAC_SHA256",keyId,frame.saveTo,frame.turnId,
    frame.txId,frame.inworldStart,frame.inworldEnd,frame.sceneId,
    frame.source,frame.worldAdvancesJson,
  ]));
  // WebCrypto's strict BufferSource requires a non-shared ArrayBuffer.
  const out=new ArrayBuffer(encoded.byteLength);
  new Uint8Array(out).set(encoded);
  return out;
}
async function hmacKey(secret:string,usage:KeyUsage) {
  return await crypto.subtle.importKey(
    "raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},
    false,[usage],
  );
}
export async function signNpcHeatOriginV3(
  frame:NpcHeatOriginFrame,keyId:string,secret:string,
):Promise<string> {
  validate(frame,keyId,secret);
  const sig=await crypto.subtle.sign("HMAC",await hmacKey(secret,"sign"),bytes(frame,keyId));
  return "hmac-sha256:"+keyId+":"+
    [...new Uint8Array(sig)].map(v=>v.toString(16).padStart(2,"0")).join("");
}
export async function verifyNpcHeatOriginV3(
  frame:NpcHeatOriginFrame,signature:string,keyId:string,secret:string,
):Promise<boolean> {
  validate(frame,keyId,secret);
  const match=/^hmac-sha256:([a-z0-9][a-z0-9._-]{2,63}):([a-f0-9]{64})$/i.exec(signature);
  if(!match||match[1]!==keyId)return false;
  const hex=match[2];
  const sig=Uint8Array.from({length:32},(_,i)=>parseInt(hex.slice(i*2,i*2+2),16));
  return await crypto.subtle.verify("HMAC",await hmacKey(secret,"verify"),sig,bytes(frame,keyId));
}
