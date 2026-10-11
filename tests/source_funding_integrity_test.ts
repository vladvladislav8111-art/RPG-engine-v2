import {assert,assertEquals} from "jsr:@std/assert";
import {preflightFinancialCustody} from "../src/turn_integrity_preflight.ts";
import {proposeSourceFundedJobs} from "../src/source_funded_quests.ts";
import type {MaterializedDemand} from "../src/world_sim_v3/opportunities.ts";

Deno.test("Finite cash and one-custody preflight conserves copper, never mutates the original",()=>{
 const balances=[{actorId:"npc.payer",availableCopper:40,sourceRef:"ledger.payer",revision:"r1",verified:true},
 {actorId:"player.shura",availableCopper:2,sourceRef:"ledger.player",revision:"r1",verified:true}];
 const stock=[{itemId:"item.unique",custodianId:"npc.payer",locationId:"loc.a",quantity:2,sourceRef:"inventory.1"}];
 const transfers=[{receiptId:"receipt.1",sourceDemandId:"d.1",fromActorId:"npc.payer",
 toActorId:"player.shura",amountCopper:20,fundingReceiptId:"hold.1",authorizationRef:"contract.1"}];
 const args={expectedRevision:"r1",balances,stock,transfers,custodyMoves:[{
 transferId:"move.1",itemId:"item.unique",fromCustodianId:"npc.payer",
 toCustodianId:"player.shura",sourceLocationId:"loc.a",
 destinationLocationId:"loc.b",quantity:1,receiptId:"physical.1"}],
 existingReceiptIds:new Set<string>(),existingFundingReceiptIds:new Set<string>()};
 const plan=preflightFinancialCustody(args);
 assertEquals(plan.ok,true);
 if(!plan.ok)throw Error("preflight should pass");
 assert(plan.moneyConserved);
 assertEquals(plan.projectedAccounts.find(x=>x.actorId==="npc.payer")?.after,20);
 assertEquals(plan.projectedAccounts.find(x=>x.actorId==="player.shura")?.after,22);
 assertEquals(balances[0].availableCopper,40);
 assertEquals(stock[0].quantity,2);
 const tooMuch=preflightFinancialCustody({...args,transfers:[{...transfers[0],amountCopper:50}]});
 assertEquals(tooMuch.ok,false);
 const replay=preflightFinancialCustody({...args,existingReceiptIds:new Set(["receipt.1"])});
 assertEquals(replay.ok,false);
 const lastLot=preflightFinancialCustody({...args,custodyMoves:[...args.custodyMoves,{
 ...args.custodyMoves[0],receiptId:"physical.2",transferId:"move.2",quantity:2}]});
 assertEquals(lastLot.ok,false);
});
Deno.test("Quest generator requires current funded demand, distinct money and real task evidence",()=>{
 const demand:MaterializedDemand={
 id:"d.finite_1",issuerId:"npc.payer",locationId:"loc.ilyrian.selarin.office",
 locationTag:"office",kind:"paid_order",templateIds:["offer.records.reconcile"],
 postedAt:600,deadline:900,remainingSlots:1,fundedCopper:30,escrowId:"escrow.1",
 physicalSources:["doc.packet.1"],sourceRef:"process.real.docs",systemRewardAuthorized:false
 };
 const job={demand,sourceProcessId:"process.1",sourceProcessActive:true,actorPresent:true,
 demandEvidenceRef:"process.real.docs",employerBudgetReceipt:{
 receiptId:"receipt.escrow.1",escrowId:"escrow.1",ownerId:"npc.payer",amountCopper:30,
 sourceRevision:"r2",held:true,verified:true}};
 const base={expectedSaveId:"V2-S1",saveId:"V2-S1",revision:"r2",nowMinute:700,
 seed:"audit-fixture",jobs:[job],existingDemandIds:new Set<string>(),
 usedFundingReceipts:new Set<string>()};
 const plan=proposeSourceFundedJobs(base);
 assertEquals(plan.ok,true);
 if(!plan.ok)throw Error("expected a proposal");
 assertEquals(plan.committed,false);
 assertEquals(plan.shuraAccepted,false);
 assertEquals(plan.proposals.length,1);
 assert(plan.proposals[0].patronPayoutCopper<=30);
 assertEquals(proposeSourceFundedJobs({...base,existingDemandIds:new Set(["d.finite_1"])}).ok,false);
 assertEquals(proposeSourceFundedJobs({...base,usedFundingReceipts:new Set(["receipt.escrow.1"])}).ok,false);
 assertEquals(proposeSourceFundedJobs({...base,jobs:[{...job,employerBudgetReceipt:{
 ...job.employerBudgetReceipt,verified:false}}]}).ok,false);
 assertEquals(proposeSourceFundedJobs({...base,jobs:[{...job,demand:{...demand,
 physicalSources:[]}}]}).ok,false);
});
