import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import { config } from "../src/config.ts";
import { commitTurn } from "../src/commit.ts";
import { NPC_HEAT_INDEX_COLUMNS } from "../src/npc_attention_ledger.ts";
import type { CommitRequest } from "../src/types.ts";

/**
 * Fault injection happens AFTER the mock Sheets backend persists its batch.
 * Its HTTP response is dropped (503). Only the *authored* synthetic test
 * workbook exists in this process, and CI deliberately has NO --allow-net.
 * The recovered instance cannot rely on its predecessor's memory cache.
 */
Deno.test("Sheets commit succeeds but HTTP response is lost: fresh instance replays TX without second XP/money/docs", async () => {
  const originalFetch = globalThis.fetch;
  const saved = { ...config, google: { ...config.google }, files: { ...config.files } };
  const keys = await crypto.subtle.generateKey({
    name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256",
  }, true, ["sign", "verify"]);
  const bytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keys.privateKey));
  config.google.privateKey = "-----BEGIN PRIVATE KEY-----\n" +
    btoa(String.fromCharCode(...bytes)) + "\n-----END PRIVATE KEY-----";
  config.allowWrites = true;
  config.allowRawCommits = false;
  config.enableKv = false;
  config.kvWriterLeaseEnabled = false;
  config.npcAttentionIndexEnabled = true;
  config.turnProgressionReviewStrict = false;
  config.files.TEMP_RUNTIME = "synthetic-uncertain-http-response";
  config.files.LIVE_SESSION_LOG = "synthetic-recovery-document";

  const data: Record<string, unknown[][]> = {
    CONTROL: [["Key", "Value"], ["save_id", "TEST-CHAOS-S0"],
      ["state", "ACTIVE_COMMITTED"], ["world_day", 1], ["world_time", "12:00:00"],
      ["current_location_id", "loc.test"], ["current_location_display", "Test"],
      ["current_scene_id", "scene.test"]],
    PLAYER_RESOURCES: [["Resource", "Current", "Max/Threshold"],
      ["HP", 50, 50], ["Stamina", 50, 50], ["General Level", 1, 100],
      ["General XP", 0, 100], ["Money copper", 10, 0]],
    SESSION_LOG: [["Turn ID", "TX ID", "Save ID", "Inworld start", "Inworld end",
      "Scene ID", "Action summary", "Deltas JSON", "New canon JSON",
      "World advances JSON", "Notes", "Committed at", "Ruleset version",
      "State hash", "Source", "Version"]],
    PROGRESSION_EVENTS: [["TX ID", "Inworld time", "Event type", "Modifiers JSON",
      "Old XP", "Delta", "New XP", "Old level", "New level", "Notes"]],
    PENDING_CHOICES: [["Choice ID", "Status", "Options JSON"]],
    NPC_CURRENT: [["NPC ID", "Display", "Age", "Importance", "Role",
      "Current/last-known location", "Current goal/activity", "Identity anchors"],
      ["npc.synthetic", "Synthetic", "", "RECURRING", "test",
        "loc.test", "test work", "tested NPC"]],
    NPC_ATTENTION_CURRENT: [Array.from(NPC_HEAT_INDEX_COLUMNS)],
  };

  let sheetsBatches = 0, googleDocumentInserts = 0;
  let docsText = "";
  let discardFirstSheetsResponse = true;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const json = (value: unknown) => Response.json(value);
    if (url.href === "https://oauth2.googleapis.com/token") {
      return json({ access_token: "synthetic-test-token", expires_in: 3600 });
    }
    if (url.hostname === "sheets.googleapis.com" &&
      url.pathname.includes("/synthetic-uncertain-http-response/values:batchGet")) {
      const ranges = url.searchParams.getAll("ranges");
      return json({ valueRanges: ranges.map((range) => {
        const [table, a1] = range.split("!");
        const cell = /^([A-Z])(\d+)$/.exec(a1);
        return {
          range,
          values: cell
            ? [[data[table]?.[Number(cell[2]) - 1]?.[cell[1].charCodeAt(0) - 65] ?? ""]]
            : structuredClone(data[table] ?? []),
        };
      }) });
    }
    if (url.hostname === "sheets.googleapis.com" &&
      url.pathname.includes("/synthetic-uncertain-http-response/values:batchUpdate")) {
      sheetsBatches++;
      for (const item of JSON.parse(String(init?.body)).data) {
        const [table, a1] = String(item.range).split("!");
        const oneBased = Number(/^A(\d+)/.exec(a1)?.[1]);
        if (!oneBased) throw Error("INVALID_SYNTHETIC_SHEETS_WRITE");
        data[table] ??= [];
        (item.values as unknown[][]).forEach((row, i) => {
          data[table][oneBased - 1 + i] = row;
        });
      }
      if (discardFirstSheetsResponse) {
        discardFirstSheetsResponse = false;
        return new Response("TEST ONLY — response lost after durable Sheets write", { status: 503 });
      }
      return json({ totalUpdatedCells: 1 });
    }
    if (url.hostname === "docs.googleapis.com" &&
      url.pathname === "/v1/documents/synthetic-recovery-document") {
      return json({ body: { content: [{ paragraph: {
        elements: [{ textRun: { content: docsText } }],
      } }] }, revisionId: "synthetic-revision" });
    }
    if (url.hostname === "docs.googleapis.com" &&
      url.pathname === "/v1/documents/synthetic-recovery-document:batchUpdate") {
      googleDocumentInserts++;
      docsText += JSON.parse(String(init?.body)).requests[0].insertText.text;
      return json({});
    }
    throw Error("UNEXPECTED_EXTERNAL_TEST_REQUEST " + url.href);
  }) as typeof fetch;

  const txId = "TEST-CHAOS-LOSS-AFTER-SHEETS";
  const turn: CommitRequest = {
    turnId: "test-chaos-turn", txId, expectedSaveId: "TEST-CHAOS-S0",
    saveTo: "TEST-CHAOS-S1",
    docAppends: [{ documentKey: "LIVE_SESSION_LOG", text: "Synthetic recovery fact" }],
    semantic: {
      elapsedSeconds: 0,
      sceneActorIds: ["npc.synthetic"],
      resourceDeltas: [{ resource: "Money copper", delta: 3 }],
      generalXpEvents: [{ sourceType: "discovery", reason: "Synthetic source-backed discovery",
        sourceRef: "test.chaos.evidence", exactXpOverride: 5 }],
      session: { inworldStart: "Day1 12:00:00", actionSummary: "Synthetic error injection" },
    },
  };
  try {
    await assertRejects(() => commitTurn(turn), Error,
      "response lost after durable Sheets write");
    assertEquals(sheetsBatches, 1);
    assertEquals(googleDocumentInserts, 0);
    assertEquals(data.CONTROL[1][1], "TEST-CHAOS-S1");
    assertEquals(data.PLAYER_RESOURCES[4][1], 5);
    assertEquals(data.PLAYER_RESOURCES[5][1], 13);
    assertEquals(data.SESSION_LOG.length, 2);

    // A new cold worker does not have the predecessor's process-local cache.
    (globalThis as unknown as { __rpgRuntimeMemoryCache: Map<string, unknown> })
      .__rpgRuntimeMemoryCache.clear();
    // A new deployment may have stricter rules: an existing TX must still replay.
    config.turnProgressionReviewStrict = true;
    config.npcAttentionIndexEnabled = false;

    const retry = await commitTurn(turn);
    assertEquals(retry.committed, true);
    assertEquals(retry.idempotentReplay, true);
    assertEquals(sheetsBatches, 1);
    assertEquals(googleDocumentInserts, 1);
    assertEquals(data.PLAYER_RESOURCES[4][1], 5);
    assertEquals(data.PLAYER_RESOURCES[5][1], 13);
    const txCol = data.SESSION_LOG[0].indexOf("TX ID");
    assertEquals(data.SESSION_LOG.slice(1).filter(row => row[txCol] === txId).length, 1);
    assertEquals(docsText.split("[TX:" + txId + "]").length - 1, 1);

    await commitTurn(turn);
    assertEquals(sheetsBatches, 1);
    assertEquals(googleDocumentInserts, 1);
    await assertRejects(() => commitTurn({ ...turn, saveTo: "TEST-TX-COLLISION" }),
      Error, "tx id collision");
    assert(docsText.includes("Synthetic recovery fact"));
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(config, saved);
  }
});
