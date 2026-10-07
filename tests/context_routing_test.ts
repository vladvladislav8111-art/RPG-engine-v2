import {
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
