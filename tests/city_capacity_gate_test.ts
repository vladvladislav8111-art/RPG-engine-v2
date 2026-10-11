import {
  type CandidateHousehold, type CityAuthority, type DailyFiniteSupply,
  type DailyDemand, type ExistingServiceProcess, type ServiceReviewAuthority,
  previewDueCityProcess, validateCandidateCityCensus,
} from "../src/city_capacity_gate.ts";

function denied(fn:()=>unknown,label:string) {
  let failed=false;try{fn()}catch{failed=true}if(!failed)throw Error("Unsafe city input accepted: "+label);
}
const people = ["npc.selarin.pool_2001","npc.selarin.pool_2002"];
const district="loc.ilyrian.selarin.copy_market";
const owner="npc.selarin.pool_2003";
const needs: DailyDemand={
  litersPotableWaterPerPerson:3,
  kcalFoodPerPerson:2400,
  sanitationCapacityUnitsPerPerson:1,
  canonicalStandardEvidenceRef:"canon.example.household_daily_needs",
};
const authority:CityAuthority={
  canonicalDistrictIds:new Set([district]),
  canonicalPersonIds:new Set(people),
  canonicalDwellingIds:new Set(["loc.example.room_1","loc.example.room_2"]),
  canonicalCustodianIds:new Set([owner]),
  canonicalSupplySiteIds:new Set(["loc.example.well","loc.example.granary","loc.example.drainage"]),
  verifiedEvidenceRefs:new Set([
    needs.canonicalStandardEvidenceRef,
    "survey.example.water","canon.example.water_access",
    "survey.example.food","canon.example.food_access",
    "survey.example.sanitation","canon.example.sanitation_access",
    "canon.example.residence_1","canon.example.residence_2",
    "canon.example.lease_1","canon.example.lease_2",
  ]),
};
const supplies:DailyFiniteSupply[]=[
  {supplyId:"supply.example.water",canonicalSiteId:"loc.example.well",
   unit:"WATER_LITERS",verifiedDailyCapacity:8,protectedReserve:2,
   availableDistrictIds:[district],capacityEvidenceRef:"survey.example.water",
   accessEvidenceRef:"canon.example.water_access"},
  {supplyId:"supply.example.food",canonicalSiteId:"loc.example.granary",
   unit:"FOOD_KCAL",verifiedDailyCapacity:5000,protectedReserve:200,
   availableDistrictIds:[district],capacityEvidenceRef:"survey.example.food",
   accessEvidenceRef:"canon.example.food_access"},
  {supplyId:"supply.example.sanitation",canonicalSiteId:"loc.example.drainage",
   unit:"SANITATION_UNITS",verifiedDailyCapacity:2,protectedReserve:0,
   availableDistrictIds:[district],capacityEvidenceRef:"survey.example.sanitation",
   accessEvidenceRef:"canon.example.sanitation_access"},
];
const home = (number:1|2):CandidateHousehold=>({
  proposedHouseholdId:"household.draft.example."+number,
  dwellingCanonicalId:"loc.example.room_"+number,
  status:"DESIGN_CANDIDATE",
  districtId:district,
  responsibleCustodianId:owner,
  residentPersonIds:[people[number-1]],
  verifiedBedSpaces:1,
  occupancyEvidenceRef:"canon.example.residence_"+number,
  lawfulResidenceEvidenceRef:"canon.example.lease_"+number,
  allocations:[
    {supplyId:"supply.example.water",consumedDaily:3},
    {supplyId:"supply.example.food",consumedDaily:2400},
    {supplyId:"supply.example.sanitation",consumedDaily:1},
  ],
});
const households = [home(1),home(2)];
const audit=(hs:CandidateHousehold[]=households,source:DailyFiniteSupply[]=supplies,
  demand:DailyDemand=needs,refs:CityAuthority=authority) =>
  validateCandidateCityCensus({householdCandidates:hs,dailySupplies:source,needs:demand,authority:refs});

Deno.test("two verified unique residents consume one shared finite source budget",()=>{
  const r=audit();
  if(r.state!=="VALIDATED_DESIGN_ONLY"||r.householdCount!==2||
     r.distinctResidentCount!==2||
     r.dailyUseBySupply["supply.example.water"]!==6||
     r.dailyUseBySupply["supply.example.food"]!==4800){
    throw Error("City food/water allocation was double-counted");
  }
});
Deno.test("resident identity and household uniqueness are invariant",()=>{
  denied(()=>audit([home(1),{...home(2),residentPersonIds:[people[0]]}]),"same person lives twice");
  denied(()=>audit([home(1),{...home(2),dwellingCanonicalId:"loc.example.room_1"}]),"same apartment used twice");
  denied(()=>audit([home(1),{...home(2),proposedHouseholdId:home(1).proposedHouseholdId}]),"duplicate household identity");
  denied(()=>audit([home(1),{...home(2),residentPersonIds:["npc.selarin.imaginary"]}]),"unknown resident");
  denied(()=>audit([home(1),{...home(2),verifiedBedSpaces:0}]),"no physical bed");
  denied(()=>audit([home(1),{...home(2),dwellingCanonicalId:"loc.example.imaginary"}]),"invented apartment");
  denied(()=>audit([home(1),{...home(2),lawfulResidenceEvidenceRef:"canon.fake.lease"}]),"no tenancy evidence");
});
Deno.test("food, water, sanitation and shared daily reserves cannot be invented",()=>{
  denied(()=>audit(households,[{...supplies[0],verifiedDailyCapacity:7},...supplies.slice(1)]),"protected water reserve lost");
  denied(()=>audit(households,[supplies[0],{...supplies[1],verifiedDailyCapacity:4999},supplies[2]]),"food after reserve insufficient");
  denied(()=>audit(households,[supplies[0],supplies[1],{...supplies[2],verifiedDailyCapacity:1}]),"sanitation overload");
  denied(()=>audit([{...home(1),allocations:home(1).allocations.slice(1)}]),"no potable water");
  denied(()=>audit([{...home(1),allocations:home(1).allocations.filter(x=>x.supplyId!=="supply.example.food")}]),"no food");
  denied(()=>audit(households,supplies,{...needs,canonicalStandardEvidenceRef:"canon.fake.needs"}),"invented physiological standards");
  denied(()=>audit(households,[{...supplies[0],capacityEvidenceRef:"survey.fake.water"},...supplies.slice(1)]),"imaginary well");
  denied(()=>audit(households,[{...supplies[0],availableDistrictIds:[]},...supplies.slice(1)]),"unreachable water");
  denied(()=>audit(households,[{...supplies[0],verifiedDailyCapacity:Infinity},...supplies.slice(1)]),"unlimited well");
});
const active:ExistingServiceProcess={
  processId:"process.selarin.merchant_verification_response_0389",
  status:"ACTIVE",
  canonicalOperatorId:people[0],
  currentDistrictId:district,
  actualNextReviewGameMinute:100,
  observedInputs:["document.example.packet"],
  confirmedSourceEvidenceRefs:["event.example.arrived"],
  caseReference:"case.example.real_work",
  permittedActionId:"action.example.source_check",
};
const clockAuth:ServiceReviewAuthority={
  knownOperatorIds:new Set([people[0]]),
  knownDistrictIds:new Set([district]),
  availableEvidenceRefs:new Set(["event.example.arrived","case.example.real_work"]),
  verifiedPhysicalOrDocumentInputs:new Set(["document.example.packet"]),
  existingAuthorizedActionIds:new Set(["action.example.source_check"]),
  activeProcessIds:new Set([active.processId]),
};
const clock = (p:ExistingServiceProcess=active,a:ServiceReviewAuthority=clockAuth,
  from=90,now=100,elapsed=10,genuineGameplayAction=true) =>
  previewDueCityProcess({process:p,authority:a,lastCommittedGameMinute:from,
    currentGameMinute:now,elapsedGameMinutes:elapsed,genuineGameplayAction});

Deno.test("an active due clock only previews effects after actual gameplay time",()=>{
  const r=clock();
  if(r.mode!=="PREVIEW_ONLY"||r.actionProfileId!==active.permittedActionId||
     r.noAutomaticReward!==true)throw Error("City process preview contract broken");
  denied(()=>clock(active,clockAuth,100,100,0,false),"meta talk is not a turn");
  denied(()=>clock(active,clockAuth,90,99,9,true),"not yet due");
  denied(()=>clock(active,clockAuth,90,100,11,true),"elapsed mismatch");
  denied(()=>clock({...active,status:"CLOSED" as "ACTIVE"}),"closed clock");
  denied(()=>clock(active,{...clockAuth,activeProcessIds:new Set()}),"not current clock");
  denied(()=>clock({...active,canonicalOperatorId:"npc.selarin.fake"}),"unknown actor");
  denied(()=>clock({...active,observedInputs:["item.fake.lot"]}),"nonexistent inventory");
  denied(()=>clock({...active,caseReference:"case.fake.no_case"}),"false legal case");
  denied(()=>clock({...active,permittedActionId:"action.fake.free_xp"}),"free labor reward");
  denied(()=>clock({...active,confirmedSourceEvidenceRefs:[]}),"no actual cause");
});
