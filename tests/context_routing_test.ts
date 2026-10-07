import {
  evaluateNpcContextGate,
  filterByParticipants,
  recentActorChat,
  resolveActorRefs,
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
    socialMemoryLoaded: true,
    openThreadsLoaded: true,
    recentChatLoaded: true,
    recentChatLimit: 8,
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
