import { validateWorkDemand } from "../src/work_demand.ts";
import { validateRumorTransmission, parseNetworkLatencyHours } from "../src/world_information.ts";

const template = {
  "Template ID": "jobtpl.selarin.freight_doc_check",
  "Pay min c": "10", "Pay max c": "24", "Pay unit": "packet",
  "Duration min min": "45", "Duration max min": "150",
  "Hazard": "professional",
};
const employer = { "NPC ID": "npc.selarin.ovar_0390", "Current/last-known location": "loc.ilyrian.selarin.west_freight_ring" };
const investigation = { "Process ID": "process.selarin.forged_seal_investigation_0343", State: "ACTIVE" };
const demand = {
  offerId: "offer.selarin.ovar.test_1000",
  templateId: "jobtpl.selarin.freight_doc_check",
  employerId: "npc.selarin.ovar_0390",
  sourceProcessId: "process.selarin.forged_seal_investigation_0343",
  materializedDemand: "The merchant has six arriving receipt sheets with a disputed seal in one marked lot, and two clerks already occupied with a caravan check.",
  taskScope: "Compare six source receipts with original marked lots and flag conflicting seal/custody entries without legal closure.",
  payC: 18, durationMinutes: 90, slots: 1,
  locationId: "loc.ilyrian.selarin.west_freight_clerk_row",
  availableDay: 63, availableTime: "18:00",
  expiresDay: 64, expiresTime: "10:00",
  accessCondition: "Only applicants with demonstrated receipt matching and written error notes may ask the senior clerk.",
};
Deno.test("market work requires live finite source and real employer", () => {
  const x = validateWorkDemand(demand,[template],[investigation],[employer],[],63,"18:21");
  if (x["Slots Remaining"] !== 1 || x["Lifecycle State"] !== "AVAILABLE" ||
      !String(x["Why available to Shura"]).includes("NOT accepted")) {
    throw new Error("offer did not preserve finite slots and Shura agency");
  }
});

Deno.test("work template alone cannot make a job", () => {
  for (const source of [[], [{...investigation,State:"CLOSED"}]]) {
    let rejected = false;
    try { validateWorkDemand(demand,[template],source,[employer],[],63,"18:21"); }
    catch { rejected = true; }
    if (!rejected) throw new Error("job spawned without a real active demand source");
  }
});
Deno.test("work pay, time and duplicate ID cannot be rerolled beyond source", () => {
  const bad: Array<[typeof demand, Array<Record<string, unknown>>, string]> = [
    [{...demand,payC:250},[], "pay"],
    [{...demand,durationMinutes:5},[],"duration"],
    [demand,[{"Offer ID":demand.offerId}], "duplicate"],
  ];
  for (const [event, existing] of bad) {
    let rejected = false;
    try { validateWorkDemand(event,[template],[investigation],[employer],existing,63,"18:21"); }
    catch { rejected = true; }
    if (!rejected) throw new Error("impossible market offer passed validation");
  }
});

const channels=[{
  "Channel ID":"rumor.selarin.freight_clerks",
  "Status":"ACTIVE","Typical latency":"1–4h",
}];
const npcs=[{"NPC ID":"npc.selarin.ovar_0390","Current/last-known location":"loc.ilyrian.selarin.west_freight_ring"},{"NPC ID":"npc.selarin.pool_2003","Current/last-known location":"loc.ilyrian.selarin.copy_market"}];
const facts=[{
  "NPC ID":"npc.selarin.ovar_0390",
  "Fact ID":"fact.ovar.public_queue_source",
  "Knowledge/belief":"Saw extra document verification queues at the west freight desks",
  "Confidence/status":"direct observation",
  "Active":"TRUE",
}];
const rumor={
  factId:"fact.vesha.heard.queue_day63_test",
  sourceFactId:"fact.ovar.public_queue_source",
  sourceProcessId:"process.selarin.forged_seal_investigation_0343",
  channelId:"rumor.selarin.freight_clerks",
  senderNpcId:"npc.selarin.ovar_0390",
  receiverNpcId:"npc.selarin.pool_2003",
  claim:"Clerks are still checking disputed cargo receipt seals at the western yards.",
  relayStart:"Day63 13:00",
  relayEnd:"Day63 15:30",
  accessEvidence:"At the known shared records desk, the sender passed the public queue observation to the receiver as both waited for paper allocation.",
};
Deno.test("rumor obeys network latency, claims remain unverified", () => {
  const latency=parseNetworkLatencyHours("0.5–3h");
  if(latency.min!==0.5||latency.max!==3) throw new Error("latency parsing wrong");
  const r=validateRumorTransmission({
    event:rumor,channels,npcKnowledge:facts,npcCurrent:npcs,
    worldClocks:[investigation],currentDay:63,currentTime:"18:21",
  });
  if (r["NPC ID"]!==rumor.receiverNpcId ||
      !String(r["Confidence/status"]).includes("UNVERIFIED")) {
    throw new Error("rumor was promoted to omniscient knowledge");
  }
});
Deno.test("rumor cannot appear without speaker knowledge or elapsed carrier time", () => {
  const cases=[
    {npcKnowledge:[],event:rumor},
    {npcKnowledge:facts,event:{...rumor,relayStart:"Day63 15:00",relayEnd:"Day63 15:15"}},
    {npcKnowledge:facts,event:{...rumor,relayEnd:"Day64 15:30"}},
  ];
  for (const c of cases) {
    let rejected=false;
    try {validateRumorTransmission({
      event:c.event, channels,npcKnowledge:c.npcKnowledge,npcCurrent:npcs,
      worldClocks:[investigation],currentDay:63,currentTime:"18:21",
    });} catch {rejected=true;}
    if(!rejected)throw new Error("unearned rumor knowledge passed");
  }
});
