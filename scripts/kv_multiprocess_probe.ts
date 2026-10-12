/**
 * CI-only cross-process Deno SQLite KV CAS test.
 * Two independently scheduled OS child processes share ONE persistent local
 * KV database. NO --allow-net and NO Google secrets or production state.
 * This does NOT prove shared remote Deno Deploy KV or isolated Deploy nodes.
 */
import { withKvWriterLease } from "../src/writer_kv_lease.ts";
import { assert, assertEquals } from "jsr:@std/assert";
const dir = await Deno.makeTempDir({ prefix: "rpg-kv-process-proof-" });
const database = dir + "/shared.db";
const signal = dir + "/lock-signal";
const workerFile = new URL("./kv_multiprocess_worker.ts", import.meta.url).pathname;
const key = ["rpg-v2","semantic-writer-lock","TEST-LOCAL-OS-PROCESS-KV-EXCLUSION"] as const;
const pause = (ms:number) => new Promise<void>(resolve => setTimeout(resolve,ms));
const start = (role:string) => new Deno.Command(Deno.execPath(),{
  args:["run","--unstable-kv","--allow-read","--allow-write",
    workerFile,database,role,signal],
  stdout:"piped",stderr:"piped",
});
async function result(role:string) {
  const outcome=await start(role).output();
  const out=new TextDecoder().decode(outcome.stdout).trim();
  const err=new TextDecoder().decode(outcome.stderr).trim();
  assertEquals(outcome.code,0,role+" stderr="+err);
  return out;
}
async function awaitFile(path:string) {
  for(let i=0;i<200;i++){
    try {await Deno.stat(path);return;}catch(e){
      if (!(e instanceof Deno.errors.NotFound)) throw e;
    }
    await pause(50);
  }
  throw Error("PROCESS_LOCK_MARKER_TIMEOUT");
}
let owner:Deno.ChildProcess | null=null;
try {
  owner=start("hold").spawn();
  await awaitFile(signal+".held");
  assertEquals(await result("contend"),"CONTENDER_DENIED");
  await Deno.writeTextFile(signal+".release","safe");
  const status=await owner.status;
  const out=new TextDecoder().decode(await new Response(owner.stdout).arrayBuffer());
  const err=new TextDecoder().decode(await new Response(owner.stderr).arrayBuffer());
  assertEquals(status.code,0,"owner stderr="+err);
  assert(out.includes("OWNER_RELEASED"));
  owner=null;
  const kv=await Deno.openKv(database);
  try {assertEquals((await kv.get(key)).value,null);}finally{kv.close();}
  assertEquals(await result("ambiguous"),"AMBIGUOUS_LOCK_HELD");
  assertEquals(await result("contend"),"CONTENDER_DENIED");
  const after=await Deno.openKv(database);
  try {
    const held=await after.get<{txId:string}>(key);
    assertEquals(held.value?.txId,"TEST-UNKNOWN");
    await assert(
      !(await Deno.stat(signal+".unexpected-entry").then(()=>true).catch(()=>false)),
      "contender entered while lock held",
    );
  } finally { after.close(); }
  console.log("PASS: distinct OS processes share CAS exclusion; ambiguous lock persists; no network used.");
} finally {
  if(owner) {try {owner.kill();}catch{} await owner.status.catch(()=>{});}
  await Deno.remove(dir,{recursive:true});
}
