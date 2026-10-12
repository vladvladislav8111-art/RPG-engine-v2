import assert from "node:assert/strict";
import {withKvWriterLease,type LeaseKv} from "../src/writer_kv_lease.ts";
import {planHeatLockRecovery} from "../src/npc_heat_lock_recovery.ts";
const workbook="TEST-ORPHAN-FAULT-MATRIX";
Deno.test("all simulated Google fault stages hold a permanent CAS lock until operator review",async()=>{
 for(const stage of ["SHEETS_PERSISTED_LOST_ACK","DOCS_CONFLICT","VERIFY_TIMEOUT"]){
  const kv=await Deno.openKv(":memory:");
  try {
   let visits=0;
   await assert.rejects(()=>withKvWriterLease({
    kv:kv as unknown as LeaseKv,workbookId:workbook,txId:"TEST-TX",
    releaseOnError:false,action:async()=>{visits++;throw Error(stage);},
   }),new RegExp(stage));
   await assert.rejects(()=>withKvWriterLease({
    kv:kv as unknown as LeaseKv,workbookId:workbook,txId:"TEST-RIVAL",
    releaseOnError:false,action:async()=>{visits++;return true;},
   }),/WRITER_LEASE_BUSY_RETRY_LATER/);
   assert.equal(visits,1);
   assert.equal((await kv.get<{txId:string}>([
    "rpg-v2","semantic-writer-lock",workbook])).value?.txId,"TEST-TX");
  }finally{kv.close();}
 }
});
Deno.test("operator recovery never authorizes automatic unlock, even on clean evidence",()=>{
 const good={lockWorkbookId:workbook,expectedIsolatedWorkbookId:workbook,
  txId:"TEST-TX",lockOwnerTxId:"TEST-TX",expectedSaveTo:"TEST-S5",
  liveControlSaveId:"TEST-S5",countCommittedTxRows:1,
  txRowSaveTo:"TEST-S5",requiredDocs:["TEST-DOC"],
  docsWithTxMarker:["TEST-DOC"],sourceSnapshotStable:true,
  operatorVerifiedAllWorkersStopped:true};
 const fine=planHeatLockRecovery(good);
 assert.equal(fine.status,"MANUAL_OPERATOR_REVIEW_ONLY");
 assert.equal(fine.programmaticUnlockAllowed,false);
 assert.equal(fine.previousWriterProvenStopped,false);
 for(const wrong of [
  {countCommittedTxRows:0,txRowSaveTo:null},
  {countCommittedTxRows:2},
  {docsWithTxMarker:[]},{lockOwnerTxId:"TEST-WRONG"},
  {operatorVerifiedAllWorkersStopped:false},
  {sourceSnapshotStable:false},{liveControlSaveId:"TEST-S4"},
 ]){
  const result=planHeatLockRecovery({...good,...wrong});
  assert.equal(result.status,"BLOCKED");
  assert.equal(result.programmaticUnlockAllowed,false);
 }
});
