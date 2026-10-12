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
      leaseMs:100,action:async()=>1}),Error,"WRITER_LEASE_INVALID_TTL");
    const result=await Promise.all([
      withKvWriterLease({kv,workbookId:"TEST-A",txId:"TEST-1",action:async()=>1}),
      withKvWriterLease({kv,workbookId:"TEST-B",txId:"TEST-2",action:async()=>2}),
    ]);
    assertEquals(result,[1,2]);
  }finally{raw.close();}
});
