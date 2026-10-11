import {
  RPG_KV_CANARY_KEY,
  readRpgKvAttachmentCanary,
  createRpgKvAttachmentCanaryOnce,
} from "../src/kv_attachment_probe.ts";
import {handleHttpRequest} from "../src/http.ts";
import {config} from "../src/config.ts";

Deno.test("KV diagnostic: one atomic canary, stable reread and no duplicate write", async()=>{
  const db=await Deno.openKv(":memory:");
  try {
    const empty=await readRpgKvAttachmentCanary(db);
    if(empty.present||empty.marker!==null)throw Error("Fresh KV unexpectedly contains canary");
    const first=await createRpgKvAttachmentCanaryOnce(db);
    if(!first.created||!first.marker)throw Error("First canary CAS was not committed");
    const entry=await db.get(RPG_KV_CANARY_KEY);
    if(!entry.versionstamp)throw Error("No durable KV versionstamp after canary");
    const later=await readRpgKvAttachmentCanary(db);
    const second=await createRpgKvAttachmentCanaryOnce(db);
    const version=(await db.get(RPG_KV_CANARY_KEY)).versionstamp;
    if(!later.present||later.marker!==first.marker||
       second.created||second.marker!==first.marker||
       version!==entry.versionstamp)
      throw Error("Idempotent canary altered original storage value");
    const keys=[];
    for await (const item of db.list({prefix:["rpg-v2"]}))keys.push(item.key);
    if(keys.length!==1||JSON.stringify(keys[0])!==JSON.stringify(RPG_KV_CANARY_KEY))
      throw Error("KV diagnostic leaked into the economic/character namespace");
  } finally {db.close()}
});

Deno.test("KV diagnostic: concurrent CAS calls must conserve a single marker",async()=>{
  const db=await Deno.openKv(":memory:");
  try {
    const [a,b,c]=await Promise.all([
      createRpgKvAttachmentCanaryOnce(db),
      createRpgKvAttachmentCanaryOnce(db),
      createRpgKvAttachmentCanaryOnce(db),
    ]);
    const durable=await readRpgKvAttachmentCanary(db);
    if(!durable.present||[a,b,c].filter(v=>v.created).length!==1||
       [a,b,c].some(v=>v.marker!==durable.marker))
      throw Error("Concurrent attachment probes wrote conflicting canaries");
  } finally {db.close()}
});

Deno.test("KV diagnostic: occupied key is never overwritten or interpreted as valid",async()=>{
  const db=await Deno.openKv(":memory:");
  try {
    const existing={schema:"RPG_OTHER_DATA",moneyCopper:123};
    await db.set(RPG_KV_CANARY_KEY,existing);
    const before=await db.get(RPG_KV_CANARY_KEY);
    let refused=false;
    try{await createRpgKvAttachmentCanaryOnce(db)}catch{refused=true}
    const after=await db.get(RPG_KV_CANARY_KEY);
    if(!refused||before.versionstamp!==after.versionstamp||
       JSON.stringify(before.value)!==JSON.stringify(after.value))
      throw Error("Malformed or unexpected KV identity was overwritten");
  } finally {db.close()}
});

Deno.test("KV diagnostic HTTP: existing bearer guard and write opt-in are fail-closed",async()=>{
  const url="https://fixture.invalid/diag/kv";
  const unauth=await handleHttpRequest(new Request(url));
  if(unauth.status!==401)throw Error("Public KV status disclosed without runtime key");
  const authorized=await handleHttpRequest(new Request(url,{
    headers:{authorization:"Bearer "+config.apiKey},
  }));
  const result=await authorized.json();
  if(!config.enableKv &&
    (authorized.status!==503||result?.reason!=="kv_disabled"))
    throw Error("Disabled KV falsely reported as healthy");
  if(Deno.env.get("RPG_KV_DIAG_ALLOW_WRITE")==="true")
    throw Error("CI must never enable a production KV canary writer");
  const write=await handleHttpRequest(new Request(url+"/canary",{
    method:"POST",headers:{authorization:"Bearer "+config.apiKey},
  }));
  if(write.status!==403)
    throw Error("KV canary write was enabled without explicit operator gate");
});
