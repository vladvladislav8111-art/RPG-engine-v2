import { buildWorldActionDocket } from "../src/world_scheduler.ts";
import { worldClocksFromSparseRanges } from "../src/world_continuity.ts";

Deno.test("world actions are scheduled independently of player's scene and time", () => {
  const clocks = [
    {"Process ID":"process.selarin.forged_seal_investigation_0343",State:"ACTIVE",
     "Location":"loc.ilyrian.selarin", "Current activity":"inspect disputed source records",
     "Next milestone/window":"review after next caravan", "Last advanced":"Day63 18:21:00"},
    {"Process ID":"process.system.achievement_watch_01",State:"ACTIVE",
     "Current activity":"event based only", "Last advanced":"Day32 11:28:00"},
    {"Process ID":"process.selarin.herna_shura_prepaid_matched_flax_two_control_cords_day63_0715",
     State:"ACTIVE / PAID", "Last advanced":"Day63 17:49:00",
     "Next milestone/window":"After 4 STAFFED workdays Day64,65,66,67: nominal readiness late Day67"},
  ];
  const a = buildWorldActionDocket({worldDay:63,worldTime:"18:21",clocks});
  if(a.dueCount !== 0 || a.nextDailyReview !== "Day64 18:21") {
    throw new Error("agenda needs exact future civic review while respecting staffed order");
  }
  if(!a.items.some(x=>x.reviewStatus==="EVENT_ONLY") ||
     !a.items.some(x=>x.reviewStatus==="AWAIT_STAFFED_WORK")) {
    throw new Error("event-only and staffed process must never auto-complete");
  }
  const b=buildWorldActionDocket({worldDay:64,worldTime:"18:22",clocks,
    factionSeeds:[{"Seed ID":"seed.faction.selarin.forged_seals",
      "Status":"ACTIVE_AS_WORLD_CLOCK",
      "Activation trigger":"existing process.selarin.forged_seal_investigation_0343",
      "Owner faction/org":"faction.ilyrian.selarin.civic_authority",
      "Baseline pressure":"Contain substituted merchant marks",
      "Possible outputs":"inspection queues; merchant requests; public notices"}]});
  if(b.dueCount !== 1 || b.items[0].processId!=="process.selarin.forged_seal_investigation_0343" ||
    b.items[0].possibleActions.length !== 3) {
    throw new Error("faction-driven clock not prioritized or options missing");
  }
});

Deno.test("sparse world clock loader preserves exactly aligned cells",()=>{
  const world = worldClocksFromSparseRanges({
    "WORLD_CLOCKS!A1:C500":[
      ["Process ID","Name","State"],
      ["process.a","A","ACTIVE"],
      ["process.b","B","CLOSED"],
    ],
    "WORLD_CLOCKS!D1:G500":[
      ["Location","Current activity","Next milestone/window","Visibility"],
      ["loc.ilyrian.selarin", "Actual inspection", "after caravan", "public notices only"],
      ["loc.other", "already resolved", "none", "none"],
    ],
    "WORLD_CLOCKS!H1:H500":[
      ["Last advanced"],["Day63 16:00"],["Day60 14:00"],
    ],
  });
  if(world.length!==2 || world[0]["Current activity"]!=="Actual inspection" ||
     world[0]["Last advanced"]!=="Day63 16:00") throw new Error("misaligned sparse clock packet");
});
