import {
  actorSnapshotFreshness,
  evaluateNpcContextGate,
  filterByParticipants,
  filterRelationships,
  recentActorChat,
  resolveActorRefs,
  validateChatEventShape,
  validateRelationshipEventShape,
  selectNpcCurrentRows,
} from "../src/social_context.ts";

Deno.test("explicit remote NPC bypasses player-location filtering", () => {
  const rows = [
    {
      "NPC ID": "npc.max.earth",
      "Display": "Макс",
      "Current/last-known location": "loc.arderan.west_market",
    },
    {
      "NPC ID": "npc.local.guard",
      "Display": "Страж",
      "Current/last-known location": "loc.lorren.temple_town",
    },
  ];

  const explicit = selectNpcCurrentRows(
    rows,
    "loc.lorren.temple_town",
    ["npc.max.earth"],
    true,
  );
  if (explicit.length !== 1 || explicit[0]["NPC ID"] !== "npc.max.earth") {
    throw new Error("explicit actor was incorrectly removed by location filter");
  }

  const local = selectNpcCurrentRows(rows, "loc.lorren.temple_town", [], false);
  if (local.length !== 1 || local[0]["NPC ID"] !== "npc.local.guard") {
    throw new Error("local discovery did not retain location filtering");
  }
});

Deno.test("actor display name resolves to stable NPC id", () => {
  const result = resolveActorRefs([
    { "NPC ID": "npc.max.earth", "Display": "Макс" },
    { "NPC ID": "npc.irina.earth", "Display": "Ирина" },
  ], ["Макс"]);

  if (result[0]?.status !== "RESOLVED" || result[0]?.actorIds[0] !== "npc.max.earth") {
    throw new Error("display name did not resolve to stable actor id");
  }
});

Deno.test("recent actor chat is bounded and actor-specific", () => {
  const rows = [
    { "Message ID": "1", "Sender ID": "npc.max.earth", "Receiver ID": "player.shura", "Text": "one" },
    { "Message ID": "2", "Sender ID": "npc.irina.earth", "Receiver ID": "player.shura", "Text": "other" },
    { "Message ID": "3", "Sender ID": "player.shura", "Receiver ID": "npc.max.earth", "Text": "two" },
    { "Message ID": "4", "Sender ID": "npc.max.earth", "Receiver ID": "player.shura", "Text": "three" },
  ];
  const chat = recentActorChat(rows, ["npc.max.earth"], 2)["npc.max.earth"];
  if (chat.length !== 2 || chat[0]["Message ID"] !== "3" || chat[1]["Message ID"] !== "4") {
    throw new Error("recent chat selection is not bounded to the requested actor");
  }
});


Deno.test("social memory and threads filter by selected actor", () => {
  const rows = [
    { "Memory ID": "m1", "Participants": "player.shura;npc.max.earth" },
    { "Memory ID": "m2", "Participants": "player.shura;npc.irina.earth" },
    { "Memory ID": "m3", "Participants": "npc.max.earth|npc.kirill.earth" },
  ];
  const selected = filterByParticipants(rows, ["npc.max.earth"]);
  if (selected.length !== 2 || selected[0]["Memory ID"] !== "m1" || selected[1]["Memory ID"] !== "m3") {
    throw new Error("participant filtering failed for selected actor");
  }
});


Deno.test("NPC context gate passes with all selected-actor surfaces loaded", () => {
  const result = evaluateNpcContextGate({
    actorId: "npc.max.earth",
    current: {
      "NPC ID": "npc.max.earth",
      "Importance": "KEY",
      "Identity anchors": "sarcastic; competitive",
      "Competence anchors": "physical work/logistics",
      "Current goal/activity": "working a warehouse shift",
    },
    knowledgeLoaded: true,
    relationshipsLoaded: true,
    socialMemoryLoaded: true,
    openThreadsLoaded: true,
    recentChatLoaded: true,
    recentChatLimit: 8,
    activityRuleLoaded: true,
    activityRule: { "NPC ID": "npc.max.earth" },
    eligibleForOffscreenAdvance: false,
    requiresOffscreenAdvance: false,
  });
  if (!result.ready || result.blockers.length) {
    throw new Error(`complete selected-NPC context should pass gate: ${result.blockers.join(",")}`);
  }
});

Deno.test("NPC context gate blocks missing current state instead of improvising", () => {
  const result = evaluateNpcContextGate({
    actorId: "npc.max.earth",
    current: null,
    knowledgeLoaded: true,
    relationshipsLoaded: true,
    socialMemoryLoaded: true,
    openThreadsLoaded: true,
    recentChatLoaded: true,
    recentChatLimit: 8,
  });
  if (result.ready || !result.blockers.includes("npc_current_missing")) {
    throw new Error("missing NPC_CURRENT must block substantive reply");
  }
});

Deno.test("NPC context gate distinguishes empty loaded chat from disabled chat loading", () => {
  const base = {
    actorId: "npc.local",
    current: { "NPC ID": "npc.local", "Importance": "MINOR" },
    knowledgeLoaded: true,
    relationshipsLoaded: true,
    socialMemoryLoaded: true,
    openThreadsLoaded: true,
    recentChatLoaded: true,
  };
  const loaded = evaluateNpcContextGate({ ...base, recentChatLimit: 8 });
  const disabled = evaluateNpcContextGate({ ...base, recentChatLimit: 0 });
  if (!loaded.ready || disabled.ready || !disabled.blockers.includes("recent_chat_surface_not_loaded")) {
    throw new Error("gate must accept an empty loaded chat slice but reject disabled chat loading");
  }
});


Deno.test("dormant stable NPC resolves without inventing a new actor", () => {
  const result = resolveActorRefs(
    [],
    ["Ирина"],
    [{ "NPC ID": "npc.irina.earth", "Display": "Ира", "Aliases": "Ирина" }],
  );
  if (result[0]?.status !== "RESOLVED" || result[0]?.actorIds[0] !== "npc.irina.earth" || result[0]?.materialization !== "DORMANT") {
    throw new Error("dormant identity must resolve to the stable actor and require rematerialization");
  }
});

Deno.test("KEY NPC freshness separates eligible from forced off-screen advance", () => {
  const current = { "NPC ID": "npc.max.earth", "Last updated": "Day39 15:28" };
  const rule = {
    "Minimum elapsed": "30 in-world minutes; any jump >=90m forces one off-screen advance",
    "Last activity tick": "T0360 / Day39 15:00",
  };
  const early = actorSnapshotFreshness({ worldDay: 39, worldTime: "16:10:00", current, activityRule: rule });
  const late = actorSnapshotFreshness({ worldDay: 39, worldTime: "17:05:00", current, activityRule: rule });
  if (!early.eligibleForOffscreenAdvance || early.requiresOffscreenAdvance) throw new Error("early freshness classification wrong");
  if (!late.requiresOffscreenAdvance) throw new Error("forced freshness threshold should require off-screen advance");
});

Deno.test("chat validator rejects directionally impossible rows", () => {
  let failed = false;
  try {
    validateChatEventShape({
      messageId: "bad",
      channelId: "contact.shura.max",
      senderId: "npc.max.earth",
      receiverId: "player.shura",
      direction: "OUT",
      text: "hello",
    });
  } catch {
    failed = true;
  }
  if (!failed) throw new Error("OUT message not sent by Shura must be rejected");
});

Deno.test("KEY NPC gate blocks forced stale snapshot", () => {
  const result = evaluateNpcContextGate({
    actorId: "npc.max.earth",
    current: {
      "NPC ID": "npc.max.earth",
      "Importance": "KEY",
      "Identity anchors": "sarcastic",
      "Competence anchors": "logistics",
      "Current goal/activity": "working",
    },
    knowledgeLoaded: true,
    relationshipsLoaded: true,
    socialMemoryLoaded: true,
    openThreadsLoaded: true,
    recentChatLoaded: true,
    recentChatLimit: 8,
    activityRuleLoaded: true,
    activityRule: { "NPC ID": "npc.max.earth" },
    eligibleForOffscreenAdvance: true,
    requiresOffscreenAdvance: true,
  });
  if (result.ready || !result.blockers.includes("key_offscreen_advance_required")) {
    throw new Error("forced stale KEY snapshot must block substantive dialogue");
  }
});


Deno.test("selected actor relationship context includes both directed sides", () => {
  const rows = [
    { "Relationship ID": "r1", "Actor ID": "npc.max.earth", "Toward ID": "player.shura" },
    { "Relationship ID": "r2", "Actor ID": "npc.irina.earth", "Toward ID": "npc.max.earth" },
    { "Relationship ID": "r3", "Actor ID": "npc.irina.earth", "Toward ID": "player.shura" },
  ];
  const selected = filterRelationships(rows, ["npc.max.earth"]);
  if (selected.length !== 2 || selected[0]["Relationship ID"] !== "r1" || selected[1]["Relationship ID"] !== "r2") {
    throw new Error("relationship filtering must include Actor and Toward sides");
  }
});

Deno.test("relationship validator protects player agency", () => {
  let playerRejected = false;
  try {
    validateRelationshipEventShape({ relationshipId: "bad.player", actorId: "player.shura", towardId: "npc.max.earth" });
  } catch {
    playerRejected = true;
  }
  if (!playerRejected) throw new Error("player.shura must not be stored as relationship Actor");
});

Deno.test("NPC context gate blocks a missing relationship surface", () => {
  const result = evaluateNpcContextGate({
    actorId: "npc.local",
    current: { "NPC ID": "npc.local", "Importance": "MINOR" },
    knowledgeLoaded: true,
    relationshipsLoaded: false,
    socialMemoryLoaded: true,
    openThreadsLoaded: true,
    recentChatLoaded: true,
    recentChatLimit: 8,
  });
  if (result.ready || !result.blockers.includes("npc_relationship_surface_not_loaded")) {
    throw new Error("missing relationship surface must block substantive reply");
  }
});
