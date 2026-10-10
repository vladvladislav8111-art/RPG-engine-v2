import {
  continuityFromSparseRanges,
  worldContinuityReview,
} from "../src/world_continuity.ts";
import { actorSnapshotFreshness } from "../src/social_context.ts";

Deno.test("KEY NPC stalled for fifteen days is mandatory offscreen review", () => {
  const npc = {
    "NPC ID": "npc.max.earth",
    Importance: "KEY",
    "Last updated": "Day48 14:33:00",
  };
  const rule = {
    "NPC ID": "npc.max.earth",
    State: "ACTIVE",
    "Minimum elapsed": "30 in-world minutes; any jump >=90m forces one off-screen advance",
    "Last activity tick": "META / Day39 15:28",
  };
  const review = worldContinuityReview({
    worldDay: 63,
    worldTime: "18:21:00",
    npcCurrent: [npc],
    activityRules: [rule],
    worldClocks: [
      {
        "Process ID": "process.selarin.forged_seal_investigation_0343",
        State: "ACTIVE",
        "Last advanced": "Day40 14:34:00",
      },
    ],
  });
  if (review.keyNpcDue.length !== 1 ||
      review.keyNpcDue[0]?.reason !== "OFFSCREEN_ADVANCE_DUE") {
    throw new Error("overdue Max must be included without explicit actorIds");
  }
  if (review.activeClocksOverdue.length !== 1) {
    throw new Error("stale active city process was not reported");
  }
});

Deno.test("conversation activity does not reset independent NPC life clock", () => {
  const result = actorSnapshotFreshness({
    worldDay: 63,
    worldTime: "18:21:00",
    current: {
      "Last updated": "Day63 18:20",
    },
    activityRule: {
      "Minimum elapsed": "30 in-world minutes; any jump >=90m forces one off-screen advance",
      "Last activity tick": "Day48 14:33",
    },
  });
  if (!result.requiresOffscreenAdvance) {
    throw new Error("new NPC dialogue must not mask fifteen days of inactivity");
  }
});

Deno.test("completed offscreen activity tick prevents duplicate advance", () => {
  const result = actorSnapshotFreshness({
    worldDay: 63,
    worldTime: "18:21:00",
    current: {
      "Last updated": "Day63 18:21:00",
    },
    activityRule: {
      "Minimum elapsed": "30 in-world minutes; any jump >=90m forces one off-screen advance",
      "Last activity tick": "Day63 18:21:00",
    },
  });
  if (result.requiresOffscreenAdvance || result.eligibleForOffscreenAdvance) {
    throw new Error("a committed NPC tick should satisfy the next context gate");
  }
});

Deno.test("sparse indices preserve NPC and world-clock row alignment", () => {
  const review = continuityFromSparseRanges({
    "NPC_CURRENT!A1:D500": [
      ["NPC ID", "Display", "Age", "Importance"],
      ["npc.max.earth", "Макс", 22, "KEY"],
      ["npc.other", "Другой", 33, "ROUTINE"],
    ],
    "NPC_CURRENT!M1:M500": [
      ["Last updated"],
      ["Day48 14:33:00"],
      ["Day63 18:21:00"],
    ],
    "NPC_ACTIVITY_RULES!A1:C200": [
      ["NPC ID", "Display", "State"],
      ["npc.max.earth", "Макс", "ACTIVE"],
    ],
    "NPC_ACTIVITY_RULES!G1:G200": [
      ["Minimum elapsed"],
      ["30 in-world minutes; any jump >=90m forces one off-screen advance"],
    ],
    "NPC_ACTIVITY_RULES!K1:K200": [
      ["Last activity tick"],
      ["Day48 14:33:00"],
    ],
    "WORLD_CLOCKS!A1:C500": [
      ["Process ID", "Name", "State"],
      ["process.a", "Some process", "ACTIVE"],
      ["process.b", "Closed", "CLOSED"],
    ],
    "WORLD_CLOCKS!H1:H500": [
      ["Last advanced"],
      ["Day48 12:00:00"],
      ["Day40 11:00:00"],
    ],
  }, 63, "18:21:00");
  if (review.keyNpcDue.length !== 1 || review.keyNpcDue[0]?.actorId !== "npc.max.earth") {
    throw new Error("sparse NPC lookup failed");
  }
  if (review.activeClocksOverdue.length !== 1 ||
      review.activeClocksOverdue[0]?.processId !== "process.a") {
    throw new Error("closed process must not be treated as active");
  }
});
