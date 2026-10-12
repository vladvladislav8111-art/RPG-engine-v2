import {assert,assertEquals,assertRejects} from "jsr:@std/assert";
import {withKvWriterLease, type LeaseKv} from "../src/writer_kv_lease.ts";
Deno.test("actual local Deno KV: CAS lease denies simultaneous writes and releases after success/failure",async()=>{
  // Real Deno KV atomic primitives, entirely local to this process.
  const raw=await Deno.openKv(":memory:");
  const kv=raw as unknown as LeaseKv;
  const sheet="TEST-ONLY-NO-PRODUCTION";
  let unblock:()=>void=()=>{};
  let entered:()=>void=()=>{};
  const wait=new Promise<void>(resolve=>{unblock=resolve;});
  const didEnter=new Promise<void>(resolve=>{entered=resolve;});
  let writes=0;
  try{
    const first=withKvWriterLease({kv,workbookId:sheet,txId:"TEST-TX-A",
      action:async()=>{entered();await wait;writes++;return "first";}});
    await didEnter;
    await assertRejects(()=>withKvWriterLease({kv,workbookId:sheet,txId:"TEST-TX-B",
      action:async()=>{writes++;return "bad";}}),Error,"WRITER_LEASE_BUSY_RETRY_LATER");
    assertEquals(writes,0);
    unblock();
    assertEquals(await first,"first");
    assertEquals(writes,1);
    const second=await withKvWriterLease({kv,workbookId:sheet,txId:"TEST-TX-B",
      action:async()=>{writes++;return "second";}});
    assertEquals(second,"second");assertEquals(writes,2);
    await assertRejects(()=>withKvWriterLease({kv,workbookId:sheet,txId:"TEST-TX-C",
      action:async()=>{throw Error("TEST_WRITER_FAIL");}}),Error,"TEST_WRITER_FAIL");
    assertEquals(await withKvWriterLease({kv,workbookId:sheet,txId:"TEST-TX-D",
      action:async()=>true}),true);
  }finally{unblock();raw.close();}
});
Deno.test("KV lock is scoped by workbook and refuses invalid lease configurations",async()=>{
  const raw=await Deno.openKv(":memory:"),kv=raw as unknown as LeaseKv;
  try{
    await assertRejects(()=>withKvWriterLease({kv,workbookId:"ci-placeholder",txId:"X",action:async()=>1}),
      Error,"WRITER_LEASE_INVALID_TARGET");
    await assertRejects(()=>withKvWriterLease({kv,workbookId:"TEST",txId:"X",
      leaseMs:100,action:async()=>1}),Error,"WRITER_LEASE_TTL_UNSAFE_WITHOUT_GOOGLE_FENCING");
    const result=await Promise.all([
      withKvWriterLease({kv,workbookId:"TEST-A",txId:"TEST-1",action:async()=>1}),
      withKvWriterLease({kv,workbookId:"TEST-B",txId:"TEST-2",action:async()=>2}),
    ]);
    assertEquals(result,[1,2]);
  }finally{raw.close();}
});

Deno.test("writer lock has no time expiry; orphan owners fail closed pending manual recovery",async()=>{
  const raw=await Deno.openKv(":memory:");
  const workbook="TEST-ORPHAN-LOCK-ONLY";
  const lockKey=["rpg-v2","semantic-writer-lock",workbook] as const;
  try{
    // Model an earlier worker whose Google write outcome is still unknown.
    await raw.set(lockKey,{ownerToken:"stale-worker-must-not-be-overridden",txId:"TEST-OLD"});
    await assertRejects(
      ()=>withKvWriterLease({kv:raw as unknown as LeaseKv,workbookId:workbook,txId:"TEST-NEW",action:async()=>1}),
      Error,"WRITER_LEASE_BUSY_RETRY_LATER",
    );
    const held=await raw.get<{ownerToken:string}>(lockKey);
    assertEquals(held.value?.ownerToken,"stale-worker-must-not-be-overridden");
    await assertRejects(
      ()=>withKvWriterLease({kv:raw as unknown as LeaseKv,workbookId:"TEST-TTL-REJECT",txId:"TEST-TTL",
        leaseMs:600_000,action:async()=>1}),
      Error,"WRITER_LEASE_TTL_UNSAFE_WITHOUT_GOOGLE_FENCING",
    );
  }finally{raw.close();}
});

Deno.test("ambiguous writer failure leaves durable KV lock and blocks next instance",async()=>{
  const raw=await Deno.openKv(":memory:");
  const workbook="TEST-AMBIGUOUS-WRITE-NO-PRODUCTION";
  const key=["rpg-v2","semantic-writer-lock",workbook] as const;
  try{
    await assertRejects(()=>withKvWriterLease({kv:raw as unknown as LeaseKv,
      workbookId:workbook,txId:"TEST-MAYBE-COMMITTED",releaseOnError:false,
      action:async()=>{throw Error("TEST_GOOGLE_TIMEOUT_RESULT_UNKNOWN");}}),
      Error,"TEST_GOOGLE_TIMEOUT_RESULT_UNKNOWN");
    const current=await raw.get<{txId:string}>(key);
    assertEquals(current.value?.txId,"TEST-MAYBE-COMMITTED");
    await assertRejects(()=>withKvWriterLease({kv:raw as unknown as LeaseKv,
      workbookId:workbook,txId:"TEST-NEW-TX",releaseOnError:false,
      action:async()=>{throw Error("MUST_NOT_ENTER");}}),
      Error,"WRITER_LEASE_BUSY_RETRY_LATER");
    // No lease cleanup: this models the fail-closed recovery-required state.
  }finally{raw.close();}
});

Deno.test("KV lock namespaces two isolated workbooks with identical TX IDs",async()=>{
  const raw=await Deno.openKv(":memory:");
  try{
    const kv=raw as unknown as LeaseKv;
    let release:()=>void=()=>{};
    let entered:()=>void=()=>{};
    const hold=new Promise<void>(r=>{release=r;});
    const began=new Promise<void>(r=>{entered=r;});
    const first=withKvWriterLease({kv,workbookId:"TEST-WORKBOOK-1",txId:"TEST-SAME-TX",
      action:async()=>{entered();await hold;return "one";}});
    await began;
    try{
      assertEquals(await withKvWriterLease({kv,workbookId:"TEST-WORKBOOK-2",txId:"TEST-SAME-TX",
        action:async()=> "two"}),"two");
    }finally{release();}
    assertEquals(await first,"one");
  }finally{raw.close();}
});
