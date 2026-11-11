import { validateWorkDemand, type MaterializeWorkDemand } from "../src/work_demand.ts";

function refused(f: () => unknown, reason: string) {
  let failed = false;
  try { f(); } catch { failed = true; }
  if (!failed) throw new Error("Duplicate materialized labor admitted: " + reason);
}

// All data below is an isolated synthetic fixture, NOT an actual hiring
// opportunity, merchant, payout or additional Selarin world fact.
const employer = "npc.selarin.fixture_employer";
const sourceProcessId = "process.selarin.fixture_goods_check";
const base: MaterializeWorkDemand = {
  offerId:"offer.selarin.fixture_001",
  templateId:"jobtpl.selarin.freight_count",
  employerId:employer,
  sourceProcessId,
  materializedDemand:"Physical inbound shipment 8B was checked against a signed manifest with a concrete discrepancy in 27 counted sacks.",
  taskScope:"Count and report all 27 sacks and preserve original receiving source notes without legal signoff.",
  payC:10,
  durationMinutes:60,
  slots:2,
  locationId:"loc.ilyrian.selarin.west_freight_ring",
  availableDay:63,
  availableTime:"18:21",
  expiresDay:64,
  expiresTime:"18:21",
  accessCondition:"Verified numerical competence and current permitted access.",
};
const template={
  "Template ID":base.templateId,
  "Pay min c":"5",
  "Pay max c":"14",
  "Pay unit":"packet",
  "Duration min min":"30",
  "Duration max min":"120",
  "Hazard":"low",
};
const process={
  "Process ID":sourceProcessId,
  "State":"ACTIVE",
};
const actor={
  "NPC ID":employer,
  "Current/last-known location":"loc.ilyrian.selarin.west_freight_ring",
};
function make(event:MaterializeWorkDemand=base,offers:Record<string,unknown>[]=[],
  currentDay=63,currentTime="18:21") {
  return validateWorkDemand(event,[template],[process],[actor],offers,currentDay,currentTime);
}

Deno.test("first causal demand can be offered but never auto-accepted or paid",()=>{
  const accepted=make();
  if(accepted["Offer ID"]!==base.offerId ||
     accepted["Slots Total"]!==2 ||
     accepted["Lifecycle State"]!=="AVAILABLE" ||
     !String(accepted["State"]).includes("NO CONTRACT SIGNED")) {
    throw new Error("Actual offer materialization shape regressed");
  }
});

Deno.test("reposted identical unfinished shipment rejected despite different offer ID",()=>{
  const existing=make();
  refused(()=>make({...base,offerId:"offer.selarin.fixture_002"},[existing]),
    "one physical shipment duplicated by fresh ID");
  refused(()=>make({...base,offerId:"offer.selarin.fixture_003",
      materializedDemand:base.materializedDemand.toUpperCase()},[existing]),
    "case-insensitive repeated proof");
  refused(()=>make({...base,offerId:"offer.selarin.fixture_004",
      materializedDemand:base.materializedDemand.replace("shipment 8B","shipment   8B")},[existing]),
    "formatting changes cannot reset a work source");
  refused(()=>make(base,[existing]),"same exact ID");
});

Deno.test("independent genuinely different packet is not an identical demand",()=>{
  const existing=make();
  const distinct=make({...base,
    offerId:"offer.selarin.fixture_005",
    materializedDemand:base.materializedDemand.replace("shipment 8B","shipment 9C"),
  },[existing]);
  if(distinct["Offer ID"]!=="offer.selarin.fixture_005"){
    throw new Error("Independent employer demand was falsely blocked");
  }
});

Deno.test("completed, filled and expired offers do not permanently reserve future jobs",()=>{
  const old=make();
  const name="offer.selarin.fixture_006";
  const again={...base,offerId:name};
  if(make(again,[{...old,"Lifecycle State":"RESOLVED","State":"COMPLETED / PAID"}])
       ["Offer ID"]!==name)throw new Error("Closed demand never expires");
  if(make(again,[{...old,"Lifecycle State":"FILLED","State":"FILLED"}])
       ["Offer ID"]!==name)throw new Error("Filled offer never resets");
  if(make({...again,availableDay:65,expiresDay:66},[old],65,"08:00")["Offer ID"]!==name){
    throw new Error("Expired demand without processed clock row was permanently blocked");
  }
});

Deno.test("legacy historical opportunities are not misread as semantic materialized demand",()=>{
  const legacy={
    "Offer ID":"opportunity.shura.selarin.paid_past",
    "Employer":employer,
    "Source/opportunity":"Shura spoke to the owner in an old market scene",
    "State":"COMPLETED / 24c PAID",
  };
  if(make({...base,offerId:"offer.selarin.fixture_007"},[legacy])["Offer ID"]!==
      "offer.selarin.fixture_007")throw new Error("Legacy evidence became a false job reservation");
});
