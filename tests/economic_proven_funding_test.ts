import {
  auditProvenNpcLiquidity,
  type FundingBalanceProof,
} from "../src/economic_proven_funding.ts";
const save="V2-FIXTURE-33";
const shura="player.shura",merchant="npc.fixture.merchant";
const evidence=new Set(["sheets.fixture.money_shura","sheets.fixture.money_merchant","log.fixture.past_wage"]);
const balances:FundingBalanceProof[]=[
  {ownerId:shura,accountId:"account.fixture.shura",copper:677,
   saveId:save,sourceRowRef:"sheets.fixture.money_shura",
   sourceRevision:"revision.fixture.current_1"},
];
const input:Parameters<typeof auditProvenNpcLiquidity>[0]={
  currentSaveId:save,
  ownerIds:[shura,merchant],
  balances,
  completedFlows:[],
  historicalOnly:[{
    ownerId:merchant,kind:"HISTORICAL_PAYMENT" as const,
    sourceRef:"log.fixture.past_wage",description:"Confirmed wages paid on old day, remaining cash unknown",
  }],
  independentlyVerifiedSourceRefs:evidence,
  committedEventIds:new Set(["event.fixture.old_wage"]),
};
const run=(changes:Partial<typeof input>={})=>auditProvenNpcLiquidity({...input,...changes});
Deno.test("current verified Shura cash can be observed, missing NPC money remains UNKNOWN",()=>{
  const out=run();
  if(out.state!=="EVIDENCE_ONLY_NO_MIGRATION"||
     out.totalProvenCopper!==677 || out.noWritesPerformed!==true||
     out.historicalOnlyObservations!==1 ||
     out.clearances[0].kind!=="PROVEN_LIQUIDITY"||
     out.clearances[0].availableCopper!==677||
     out.clearances[1].kind!=="UNKNOWN_FUNDS"||
     out.clearances[1].availableCopper!==undefined){
    throw Error("Current money evidence created fictional merchant cash");
  }
});
Deno.test("old paid NPC job must NOT be credited again on top of current balance",()=>{
  const out=run({completedFlows:[{
    eventId:"event.fixture.old_wage",
    fromAccountId:"account.fixture.shura",
    toAccountId:"account.fixture.merchant",
    copper:10,completedSaveId:save,sourceRef:"log.fixture.past_wage",sequence:1,
  }]});
  if(out.rejectedEvidence.indexOf("CANNOT_REAPPLY_FLOWS_TO_CURRENT_SNAPSHOT")===-1 ||
     out.clearances.some(x=>x.kind==="PROVEN_LIQUIDITY") ||
     out.totalProvenCopper!==0)
    throw Error("Replaying logged old sale generated an extra merchant balance");
});
Deno.test("duplicate current bank ID and unverified evidence block all spendable snapshots",()=>{
  const bad:FundingBalanceProof={
    ownerId:merchant,accountId:"account.fixture.shura",copper:500,
    saveId:save,sourceRowRef:"sheets.fixture.money_merchant",
    sourceRevision:"revision.fixture.current_1",
  };
  const out=run({balances:[...balances,bad]});
  if(!out.rejectedEvidence.some(x=>x.startsWith("UNPROVEN_OR_DUPLICATE_CURRENT_BALANCE"))||
     out.clearances.some(x=>x.kind==="PROVEN_LIQUIDITY"))
    throw Error("Same money account reused by another NPC");
});
Deno.test("unobserved money and invalid amounts are not spendable",()=>{
  const a=run({balances:[{...balances[0],copper:-7}]});
  if(a.clearances.some(x=>x.kind==="PROVEN_LIQUIDITY"))throw Error("Negative balance created");
  const b=run({balances:[{...balances[0],sourceRowRef:"sheets.fixture.untrusted"}]});
  if(b.clearances.some(x=>x.kind==="PROVEN_LIQUIDITY"))throw Error("Forged money observation accepted");
  const c=run({balances:[{...balances[0],saveId:"V2-FIXTURE-OLD"}]});
  if(c.clearances.some(x=>x.kind==="PROVEN_LIQUIDITY"))throw Error("Stale source cash accepted");
});
