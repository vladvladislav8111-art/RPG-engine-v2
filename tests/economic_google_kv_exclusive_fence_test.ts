import { acquireGoogleProjectionFence } from "../src/economic_google_kv_exclusive_fence.ts";
import { wrapDenoAtomicEconomyKv } from "../src/economic_deno_kv_adapter.ts";

const scopeId="scope.fixture.google_staging_market";
const target="TEMP_RUNTIME" as const;
async function reject(fn:()=>Promise<unknown>,label:string){
  let rejected=false;try{await fn()}catch{rejected=true}
  if(!rejected)throw Error("Unprotected Google projection writer accepted: "+label);
}
Deno.test("KV CAS selects only one concurrent Google projection writer",async()=>{
  const db=await Deno.openKv(":memory:");
  try {
    const kv=wrapDenoAtomicEconomyKv(db);
    const [a,b]=await Promise.allSettled([
      acquireGoogleProjectionFence({kv,scopeId,target}),
      acquireGoogleProjectionFence({kv,scopeId,target}),
    ]);
    const winners=[a,b].filter(x=>x.status==="fulfilled");
    if(winners.length!==1)throw Error("Multiple Google writers claimed the same scope");
    const owner=winners[0] as PromiseFulfilledResult<
      Awaited<ReturnType<typeof acquireGoogleProjectionFence>>
    >;
    await owner.value.fence.assertExclusiveWriter(target,scopeId);
    await reject(()=>acquireGoogleProjectionFence({kv,scopeId,target}),
      "second worker while primary lock held");
    await owner.value.releaseAfterIndependentVerification(
      async()=> "proof.fixture.readback_confirmed");
    const after=await acquireGoogleProjectionFence({kv,scopeId,target});
    if(after.token===owner.value.token)throw Error("New owner reused old lock token");
    await after.fence.assertExclusiveWriter(target,scopeId);
  }finally{db.close()}
});
Deno.test("lock never expires automatically after ambiguous Google response",async()=>{
  const db=await Deno.openKv(":memory:");
  try{
    const kv=wrapDenoAtomicEconomyKv(db);
    const lease=await acquireGoogleProjectionFence({kv,scopeId,target});
    await reject(()=>lease.releaseAfterIndependentVerification(async()=>{
      throw Error("Google wrote something but readback disconnected");
    }),"lost proof");
    await reject(()=>acquireGoogleProjectionFence({kv,scopeId,target}),
      "unverified lock taken over after failure");
    await lease.fence.assertExclusiveWriter(target,scopeId);
    await reject(()=>lease.releaseAfterIndependentVerification(async()=>""),
      "fake blank proof");
    await lease.releaseAfterIndependentVerification(
      async()=> "proof.fixture.readback_confirmed_after_retry");
    const later=await acquireGoogleProjectionFence({kv,scopeId,target});
    await later.fence.assertExclusiveWriter(target,scopeId);
    await reject(()=>lease.fence.assertExclusiveWriter(target,scopeId),
      "old owner retained write permission after new owner");
  }finally{db.close()}
});
Deno.test("locks for physically distinct Google staging targets do not interfere",async()=>{
  const db=await Deno.openKv(":memory:");
  try {
    const kv=wrapDenoAtomicEconomyKv(db);
    const first=await acquireGoogleProjectionFence({kv,scopeId,target});
    const second=await acquireGoogleProjectionFence({
      kv,scopeId,target:"LIVE_TRANSACTION_ARCHIVE",
    });
    await first.fence.assertExclusiveWriter(target,scopeId);
    await second.fence.assertExclusiveWriter("LIVE_TRANSACTION_ARCHIVE",scopeId);
    await reject(()=>first.fence.assertExclusiveWriter("LIVE_TRANSACTION_ARCHIVE",scopeId),
      "first-target writer attempts archive");
  }finally{db.close()}
});
