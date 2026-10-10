import { classifyWorldProcess, reviewWorldProcesses } from "../src/world_process.ts";
import { continuityFromSparseRanges } from "../src/world_continuity.ts";

Deno.test("System achievement watch is event-triggered, not a daily frozen clock", () => {
  const r = reviewWorldProcesses({
    worldDay: 63, worldTime: "18:21:00",
    rows: [{
      "Process ID": "process.system.achievement_watch_01",
      State: "ACTIVE",
      "Last advanced": "Day32 11:28:00",
      "Next milestone/window": "check after relevant commit",
    }],
  });
  if (r.activeClocksOverdue.length !== 0 ||
      r.eventTriggeredActive[0] !== "process.system.achievement_watch_01") {
    throw new Error("achievement watch incorrectly triggers routine world update");
  }
});

Deno.test("Active civic and merchant processes become due after one world day", () => {
  const rows = [
    { "Process ID": "process.selarin.forged_seal_investigation_0343", State: "ACTIVE", "Last advanced": "Day40 14:34:00", "Next milestone/window": "civic checking" },
    { "Process ID": "process.selarin.merchant_verification_response_0389", State: "ACTIVE", "Last advanced": "Day41 09:05:00", "Next milestone/window": "merchant staff reallocation" },
    { "Process ID": "process.selarin.finished", State: "CLOSED", "Last advanced": "Day40 10:00" },
  ];
  const due = reviewWorldProcesses({ worldDay: 63, worldTime: "18:21:00", rows }).activeClocksOverdue;
  if (due.length !== 2 || !due.every((a) => a.cadence === "DAILY_REVIEW")) {
    throw new Error("stale background processes not correctly detected");
  }
  const fresh = reviewWorldProcesses({
    worldDay: 63, worldTime: "19:00:00",
    rows: [ { ...rows[0], "Last advanced": "Day63 18:21:00" } ],
  });
  if (fresh.activeClocksOverdue.length !== 0) throw new Error("recently resolved process was treated as stale");
});

Deno.test("Herna's four STAFFED days cannot pass solely from ordinary time", () => {
  const row = {
    "Process ID": "process.selarin.herna_shura_prepaid_matched_flax_two_control_cords_day63_0715",
    State: "ACTIVE / CUSTOMER FULLY PAID 220c DAY63 / FINITE RAW STOCK RESERVED / WORK PENDING",
    "Last advanced": "Day63 17:49:00",
    "Next milestone/window": "After 4 STAFFED workdays Day64,65,66,67: nominal readiness late Day67 if actually completed/tested",
  };
  const policy = classifyWorldProcess(row);
  if (policy.cadence !== "STAFFED_MILESTONE" || policy.targetDay !== 67 ||
      policy.targetMinute !== 17*60) throw new Error("staffed milestone not recognized");
  for (const day of [63,64,65,66]) {
    const r = reviewWorldProcesses({worldDay:day,worldTime:"20:00:00",rows:[row]});
    if (r.activeClocksOverdue.length) throw new Error("Herna commission review forced too early");
  }
  const morning = reviewWorldProcesses({worldDay:67,worldTime:"10:00:00",rows:[row]});
  if (morning.activeClocksOverdue.length) throw new Error("morning pre-QC commission is not due");
  const late = reviewWorldProcesses({worldDay:67,worldTime:"18:00:00",rows:[row]});
  if (late.activeClocksOverdue[0]?.reason !== "MILESTONE_REVIEW_DUE") throw new Error("late Day67 review not scheduled");
});

Deno.test("Sparse context report includes next-milestone policy, not only last date", () => {
  const r = continuityFromSparseRanges({
    "WORLD_CLOCKS!A1:C500": [["Process ID","Name","State"],["process.system.achievement_watch_01","watch","ACTIVE"],["process.a","investigation","ACTIVE"]],
    "WORLD_CLOCKS!H1:H500": [["Last advanced"],["Day32 11:28"],["Day40 14:34"]],
    "WORLD_CLOCKS!F1:F500": [["Next milestone/window"],["check after relevant commit"],["civic checking"]],
  }, 63, "18:21:00");
  if (r.activeClocksOverdue.length !== 1 || r.activeClocksOverdue[0].processId !== "process.a" ||
      !r.eventTriggeredActive.includes("process.system.achievement_watch_01")) {
    throw new Error("context world clock classification malformed");
  }
});
