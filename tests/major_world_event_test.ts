import { validateMajorWorldEvent } from "../src/world_events.ts";

const template = {
  "Event ID": "major.selarin.forged_seal_hearing",
  Name: "Public hearing",
  Status: "ACTIVE",
  "Required process prefix": "process.selarin.forged_seal_investigation",
  "Duration min h": "2",
  "Duration max h": "5",
  "Public visibility": "public procedural meeting, sealed testimony remains restricted",
  Guard: "Do not reveal culprits or private inquiry files.",
};
const clock = {
  "Process ID": "process.selarin.forged_seal_investigation_0343",
  State: "ACTIVE",
};
const actor = { "NPC ID": "npc.selarin.ovar_0390" };
const event = {
  processId: "process.event.selarin.public_hearing_foo",
  templateId: "major.selarin.forged_seal_hearing",
  sourceProcessId: "process.selarin.forged_seal_investigation_0343",
  locationId: "loc.ilyrian.selarin.concord_forum",
  participatingNpcIds: ["npc.selarin.ovar_0390"],
  causalTrigger: "A court clerk publicly posted a procedural meeting notice following independently corroborated disputed cargo documents and a confirmed calendar slot.",
  concreteEffects: "Forum clerks must schedule a public document-handling discussion, with access and queues constrained by seats.",
  nextReview: "Review after the opened civic procedural hearing is actually observed and recorded.",
  startDay: 63,
  startTime: "17:00",
  durationHours: 3,
};
Deno.test("major event is materialized only from active source and known actors", () => {
  const actual = validateMajorWorldEvent({
    event, templates:[template],clocks:[clock],npcs:[actor],worldDay:63,worldTime:"18:21",
  });
  if(actual["State"]!=="ACTIVE"||actual["Process ID"]!==event.processId) {
    throw new Error("causal major event did not materialize");
  }
});
Deno.test("template alone cannot invent public hearings or crime", () => {
  const cases = [
    {clocks:[],npcs:[actor],event},
    {clocks:[clock],npcs:[],event},
    {clocks:[clock],npcs:[actor],event:{...event,sourceProcessId:"process.other.unrelated"}},
    {clocks:[clock],npcs:[actor],event:{...event,causalTrigger:"maybe"}},
    {clocks:[clock],npcs:[actor],event:{...event,durationHours:55}},
  ];
  for(const c of cases){
    let refused = false;
    try{validateMajorWorldEvent({
      event:c.event,templates:[template],clocks:c.clocks,npcs:c.npcs,
      worldDay:63,worldTime:"18:21",
    });} catch {refused=true;}
    if(!refused)throw new Error("major event passed despite missing material cause");
  }
});
