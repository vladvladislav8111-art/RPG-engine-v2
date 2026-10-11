import { buildWorldActionDocket } from "../src/world_scheduler.ts";

const mk = (suffix: string, last: string, state="ACTIVE") => ({
  "Process ID": "process.selarin.independent_market_" + suffix,
  "Name": "Independent city process " + suffix,
  "State": state,
  "Last advanced": last,
  "Current activity": "Separate sourced market event",
  "Next milestone/window": "daily only after actual preceding work",
  "Location": "loc.ilyrian.selarin.central_market",
});

Deno.test("bounded GM docket exposes all due processes, not silently hides backlog",()=>{
  const clocks=Array.from({length:32},(_,i)=>mk(
    String(i).padStart(2,"0"),"Day"+(i<2?50:i<10?60:62)+" 10:00",
  ));
  const docket=buildWorldActionDocket({
    worldDay:63,worldTime:"18:21",clocks,maxItems:6,
  });
  if(docket.items.length!==6 || docket.activeCount!==32 ||
      docket.dueCount!==32 || docket.hiddenDueCount!==26 ||
      !docket.requiresIndependentResolution) {
    throw new Error("Unseen urban process backlog failed to signal true scope");
  }
  // Older world deadlines take priority even when the older process ID
  // sorts later lexicographically than newer entries.
  if(docket.items[0].processId!=="process.selarin.independent_market_00" ||
      docket.items[1].processId!=="process.selarin.independent_market_01") {
    throw new Error("Due world affairs not prioritized by overdue age");
  }
});

Deno.test("most overdue processes win before alphabetical process IDs",()=>{
  const docket=buildWorldActionDocket({worldDay:63,worldTime:"18:21",
    maxItems:1,
    clocks:[
      mk("a_recent","Day62 20:00"),
      mk("z_old","Day49 07:00"),
    ],
  });
  if(docket.items[0].processId!=="process.selarin.independent_market_z_old" ||
    docket.dueCount!==1 || docket.hiddenDueCount!==0){
    // The recently advanced process is not yet one day overdue.
    throw new Error("Old urgent process incorrectly outranked by label");
  }
});

Deno.test("nearer future deadlines outrank far ones without triggering extra reviews",()=>{
  const docket=buildWorldActionDocket({worldDay:63,worldTime:"18:21",
    maxItems:2,
    clocks:[
      mk("a_later","Day63 18:10"),
      mk("z_earlier","Day63 11:00"),
      mk("b_closed","Day10 00:00","CLOSED"),
    ],
  });
  if(docket.dueCount!==0 || docket.hiddenDueCount!==0 ||
      docket.activeCount!==2 ||
      docket.items[0].processId!=="process.selarin.independent_market_z_earlier" ||
      docket.nextDailyReview!=="Day64 11:00") {
    throw new Error("Bounded docket lost chronological future deadlines");
  }
});

Deno.test("event-triggered watchers do not become phantom daily work",()=>{
  const docket=buildWorldActionDocket({
    worldDay:63,worldTime:"18:21",maxItems:3,
    clocks:[
      mk("fresh","Day63 18:00"),
      {"Process ID":"process.system.achievement_watch_01",
       "State":"ACTIVE","Last advanced":"Day15 00:00"},
    ],
  });
  if(docket.dueCount!==0 || docket.hiddenDueCount!==0 ||
      docket.activeCount!==2 ||
      docket.items.some(x=>x.processId==="process.system.achievement_watch_01"&&x.reviewStatus!=="EVENT_ONLY")) {
    throw new Error("Event-only world process manufactured a daily GM task");
  }
});
