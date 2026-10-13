import {strict as assert} from "node:assert";
import {simulateMarketPulse,type MarketPulseInput} from "../src/market_opportunity_pulse.ts";
import {dispatchWorldV3Batch} from "../src/world_sim_v3/runtime_facade.ts";
import {attachAuthoritativeWorldSources} from "../src/world_sim_v3/source_bridge.ts";
const input:MarketPulseInput={marketId:"loc.ilyrian.selarin.central_market",day:73,
 minuteOfDay:720,merchantCount:200,countBasis:"ESTIMATE",
 countSourceRef:"design.c06.market.cohort",maxLeads:24};
function ok(p:MarketPulseInput){
 const x=simulateMarketPulse(p);assert.equal(x.ok,true);
 if(!x.ok)throw Error("MARKET_PULSE_TEST_FAILED");return x.value;
}
Deno.test("all merchant roles are exclusive; needs/public/direct candidates are finite",()=>{
 const x=ok(input);
 assert.equal(x.categories.privateScribe+x.categories.selfAccounts+x.categories.externalAccounts,200);
 assert.ok(x.work.needsHelp<=x.categories.selfAccounts+x.categories.externalAccounts);
 assert.ok(x.work.willingToAdvertise<=x.work.needsHelp);
 assert.equal(x.work.publicProspects+x.work.directProspects,x.work.willingToAdvertise);
 assert.equal(x.board.open+x.board.taken+x.board.future,x.work.publicProspects);
 assert.equal(x.direct.open+x.direct.taken+x.direct.future,x.work.directProspects);
 assert.equal(x.actualPosts,0);assert.equal(x.actualAcceptedClaims,0);
});
Deno.test("same day cannot reroll by rereading; candidate IDs remain stable",()=>{
 assert.deepEqual(ok(input),ok({...input}));
 const a=ok({...input,minuteOfDay:720});
 const b=ok({...input,minuteOfDay:721});
 assert.deepEqual(a.categories,b.categories);
 assert.deepEqual(a.work,b.work);
 assert.equal(new Set(a.leads.map(x=>x.id)).size,a.leads.length);
});
Deno.test("time-of-day candidates appear and cease, never resurrect estimates",()=>{
 const p=[360,480,720,960,1200].map(minuteOfDay=>ok({...input,minuteOfDay}));
 assert.equal(p[0].leads.length,0);
 for(let n=1;n<p.length;n++){
  assert.ok(p[n].board.future<=p[n-1].board.future);
  assert.ok(p[n].board.taken>=p[n-1].board.taken);
  assert.ok(p[n].direct.future<=p[n-1].direct.future);
  assert.ok(p[n].direct.taken>=p[n-1].direct.taken);
 }
 assert.equal(p.at(-1)!.board.future,0);
});
Deno.test("scenario results never invent employers, escrow, worker receipts or game-time events",()=>{
 const r=ok(input);
 assert.equal(r.sourceAttested,false);assert.equal(r.scenarioOnly,true);assert.equal(r.committed,false);
 assert.equal(r.gameTimeSeconds,0);assert.equal(r.moneyTransferred,0);
 for(const lead of r.leads){
  assert.equal(lead.employerId,null);assert.equal(lead.fundsVerified,false);
  assert.equal(lead.actualPost,false);assert.equal(lead.committed,false);
 }
});
Deno.test("zero attendance does not guarantee jobs; malformed snapshots fail closed",()=>{
 assert.equal(ok({...input,merchantCount:0}).work.needsHelp,0);
 for(const x of [
 {...input,merchantCount:501},{...input,merchantCount:-1},{...input,day:0},
 {...input,minuteOfDay:1440},{...input,countSourceRef:""},
 {...input,marketId:"loc.ilyrian.selarin.copy_market"},
 ]){
  assert.equal(simulateMarketPulse(x).ok,false);
 }
});
Deno.test("market pulse uses existing offer_board via live save day/minute",()=>{
 const save="V2-S0852";
 const clock={saveId:save,day:73,time:"12:00:00",
  locationId:"loc.ilyrian.selarin.central_market",sceneId:"scene.test"};
 const request={expectedSaveId:save,jobs:[{
  id:"pulse",operation:"offer_board" as const,payload:{marketPulseV1:input},
 }]};
 const raw=dispatchWorldV3Batch(request,save);
 assert.equal(raw.results[0].result.ok,false);
 const r=attachAuthoritativeWorldSources({request,result:raw,clock});
 assert.equal(r.results[0].result.ok,true);
 if(r.results[0].result.ok){
  const result=r.results[0].result.value as ReturnType<typeof ok>;
  assert.equal(result.sourceAttested,false);
 }
 const stale={...request,jobs:[{...request.jobs[0],payload:{marketPulseV1:{...input,day:72}}}]};
 const rejected=attachAuthoritativeWorldSources({
  request:stale,result:dispatchWorldV3Batch(stale,save),clock});
 assert.equal(rejected.results[0].result.ok,false);
});
Deno.test("old source-only market board is not overridden by the pulse",()=>{
 const save="V2-S0900";
 const request={expectedSaveId:save,jobs:[{
  id:"current",operation:"offer_board" as const,payload:{boardMode:"CURRENT_SOURCE_ONLY"},
 }]};
 const r=attachAuthoritativeWorldSources({
  request,result:dispatchWorldV3Batch(request,save),
  clock:{saveId:save,day:74,time:"09:00:00",locationId:input.marketId,sceneId:"scene.test"},
 });
 assert.equal(r.results[0].result.ok,false);
});
