import assert from "node:assert/strict";
import {withKvWriterLease,type LeaseKv} from "../src/writer_kv_lease.ts";

const workbook="TEST-STAGE-GUARD-ONLY";
const lock=["rpg-v2","semantic-writer-lock",workbook] as const;

Deno.test("owner switch while Sheets awaited stops subsequent Docs stage",async()=>{
 const kv=await Deno.openKv(":memory:");
 let sheet=0,docs=0;
 try {
  await assert.rejects(()=>withKvWriterLease({
   kv:kv as unknown as LeaseKv,workbookId:workbook,txId:"TEST-OWNER",
   releaseOnError:false,
   action:async({assertOwner})=>{
    await assertOwner();
    sheet++; // simulated Sheets stage only, NO external network
    await kv.set(lock,{ownerToken:"OTHER-OWNER",txId:"TEST-OTHER"});
    await assertOwner(); // mandatory post-Sheets checkpoint
    docs++;
    return "unexpected";
   },
  }),/WRITER_LEASE_LOST_BEFORE_GOOGLE_STAGE/);
  assert.equal(sheet,1);
  assert.equal(docs,0);
  assert.equal((await kv.get<{txId:string}>(lock)).value?.txId,"TEST-OTHER");
 }finally{kv.close();}
});
Deno.test("ABA replacement with identical ownerToken but new KV versionstamp is rejected",async()=>{
 const kv=await Deno.openKv(":memory:");
 let after=0;
 try {
  await assert.rejects(()=>withKvWriterLease({
   kv:kv as unknown as LeaseKv,workbookId:workbook,txId:"TEST-OWNER",
   releaseOnError:false,
   action:async({assertOwner})=>{
    await assertOwner();
    const current=await kv.get<{ownerToken:string;txId:string}>(lock);
    assert.ok(current.value);
    await kv.delete(lock);
    await kv.set(lock,current.value);
    await assertOwner();
    after++;
    return "unexpected";
   },
  }),/WRITER_LEASE_LOST_BEFORE_GOOGLE_STAGE/);
  assert.equal(after,0);
  assert.equal((await kv.get(lock)).value!==null,true);
 }finally{kv.close();}
});
Deno.test("ABA replacement after action cannot be reported as released success",async()=>{
 const kv=await Deno.openKv(":memory:");
 try {
  await assert.rejects(()=>withKvWriterLease({
   kv:kv as unknown as LeaseKv,workbookId:workbook,txId:"TEST-OWNER",
   releaseOnError:false,
   action:async({assertOwner})=>{
    await assertOwner();
    const current=await kv.get<{ownerToken:string;txId:string}>(lock);
    assert.ok(current.value);
    await kv.delete(lock);
    await kv.set(lock,current.value);
    return "not-safe";
   },
  }),/WRITER_LEASE_LOST_AFTER_ACTION/);
  assert.equal((await kv.get(lock)).value!==null,true);
 }finally{kv.close();}
});
Deno.test("unmodified lock passes all read-only checkpoints then releases exactly once",async()=>{
 const kv=await Deno.openKv(":memory:");
 let checkpoints=0;
 try {
  const completed=await withKvWriterLease({
   kv:kv as unknown as LeaseKv,workbookId:workbook,txId:"TEST-OWNER",
   releaseOnError:false,
   action:async({assertOwner})=>{
    for(let i=0;i<4;i++){await assertOwner();checkpoints++;}
    return "synthetic-success";
   },
  });
  assert.equal(completed,"synthetic-success");
  assert.equal(checkpoints,4);
  assert.equal((await kv.get(lock)).value,null);
 }finally{kv.close();}
});
