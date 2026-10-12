import { commitTurn, prepareCommit } from "./commit.ts";
import { config } from "./config.ts";
import { bridgeFeatureStatus } from "./bridge_integration.ts";
import { getTurnContext } from "./context.ts";
import { docsGet, sheetsBatchGet } from "./google.ts";
import { requireWriterKv } from "./cache.ts";
import { PREVIEW_TEST_DOC_IDS, PREVIEW_TEST_SAVE_ID, PREVIEW_TEST_TEMP_RUNTIME_ID } from "./preview_fixture.ts";
import { HUD_UI_VERSION } from "./hud.ts";
import { diagnoseMcp, handleMcp } from "./mcp.ts";
import { intBetween } from "./rng.ts";
import { simulateWorldV3BatchLive } from "./world_sim_v3/live_gateway.ts";
import type { WorldV3BatchRequest } from "./world_sim_v3/runtime_facade.ts";
import { RULESET_VERSION } from "./rules.ts";
import type { CommitRequest, TurnContextRequest } from "./types.ts";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function authorized(req: Request): boolean {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const direct = req.headers.get("x-runtime-key");
  return bearer === config.apiKey || direct === config.apiKey;
}

async function body<T>(req: Request): Promise<T> {
  return await req.json() as T;
}

export async function handleHttpRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;
  try {
    if (pathname === "/" && req.method === "GET") {
      let googleConnected = false;
      let fixtureSaveId: string | null = null;
      try {
        const values = await sheetsBatchGet(config.files.TEMP_RUNTIME, ["CONTROL!B2"]);
        fixtureSaveId = String(values["CONTROL!B2"]?.[0]?.[0] ?? "");
        googleConnected = true;
      } catch {
        googleConnected = false;
      }
      return json({
        service: "RPG V2 Runtime Gateway",
        runtime: config.runtime,
        status: "ready",
        engineVersion: RULESET_VERSION,
        bridgeIntegration:bridgeFeatureStatus(),
        hudUiVersion: HUD_UI_VERSION,
        writesEnabled: config.allowWrites,
        rawCommitsEnabled: config.allowRawCommits,
        googleConnected,
        ...(config.previewFixture ? {
          previewFixture: {
            storageScope: "TEST_ONLY",
            fixtureSaveId,
            fixtureSaveVerified: fixtureSaveId === PREVIEW_TEST_SAVE_ID,
            docTargetsPinned: true,
            inheritedLiveDocIdsIgnored: true,
          },
        } : {}),
      });
    }

    // Public READ-ONLY test diagnostics; never exposed on production runtime.
    if (pathname === "/preview/readiness" && req.method === "GET") {
      if (!config.previewFixture) return json({ error: "not_found" }, 404);
      const values = await sheetsBatchGet(config.files.TEMP_RUNTIME, ["CONTROL!B2", "CONTROL!B5"]);
      const saveId = String(values["CONTROL!B2"]?.[0]?.[0] ?? "");
      const worldTime = values["CONTROL!B5"]?.[0]?.[0] ?? null;
      // This is a real deployed Deno KV read, not a JS-memory-cache fallback.
      // No records are written to KV or Google by the readiness route.
      let kvReadable = false;
      try {
        const kv = await requireWriterKv();
        await kv.get(["rpg-v2", "preview-readiness", PREVIEW_TEST_TEMP_RUNTIME_ID]);
        kvReadable = true;
      } catch {
        kvReadable = false;
      }
      let prepareDryRunPassed = false;
      try {
        const prepared = await prepareCommit({
          turnId: "preview-test-only-dry-run",
          txId: "preview-test-only-dry-run",
          expectedSaveId: PREVIEW_TEST_SAVE_ID,
          saveTo: PREVIEW_TEST_SAVE_ID,
          dryRun: true,
          preconditions: [{ range: "CONTROL!B5", equals: worldTime as string | number | boolean | null }],
          sheetWrites: [],
          docAppends: [],
        });
        prepareDryRunPassed = prepared.validation.every((step: { pass: boolean }) => step.pass);
      } catch {
        prepareDryRunPassed = false;
      }
      const checks = await Promise.all(
        Object.keys(PREVIEW_TEST_DOC_IDS).map(async (key) => {
          const docKey = key as keyof typeof PREVIEW_TEST_DOC_IDS;
          try {
            await docsGet(config.files[docKey]);
            return { key, readable: true };
          } catch {
            return { key, readable: false };
          }
        }),
      );
      const ok = saveId === PREVIEW_TEST_SAVE_ID &&
        checks.every((item) => item.readable) && !config.allowWrites;
      return json({
        ok,
        mode: "TEST_ONLY_READINESS",
        saveId,
        expectedSaveId: PREVIEW_TEST_SAVE_ID,
        writesEnabled: config.allowWrites,
        docTargetsPinned: true,
        kvReadable,
        prepareDryRunPassed,
        testDocs: checks,
      }, ok ? 200 : 503);
    }

    if (pathname.startsWith("/diag/") && !authorized(req)) {
      return json({ error: "unauthorized" }, 401);
    }

    if (pathname === "/diag/context" && req.method === "GET") {
      const ctx = await getTurnContext({
        turnId: "diag",
        turnClass: "NORMAL",
        tags: [],
        actorIds: [],
        lookups: [],
        docQueries: [],
      });
      return json({
        ok: true,
        contextLoaded: true,
        elapsedMs: ctx.elapsedMs,
        savePresent: Boolean(ctx.packet.saveId),
        resourcesLoaded: Object.keys(ctx.packet.resources ?? {}).length,
        conditionsRows: Array.isArray(ctx.packet.conditions) ? ctx.packet.conditions.length : 0,
        competencesRows: Array.isArray(ctx.packet.competences) ? ctx.packet.competences.length : 0,
      });
    }

    if (pathname === "/diag/prepare" && req.method === "GET") {
      const probe = await sheetsBatchGet(config.files.TEMP_RUNTIME, ["CONTROL!B2", "CONTROL!B5"]);
      const currentSave = String(probe["CONTROL!B2"]?.[0]?.[0] ?? "");
      const currentWorldTime = probe["CONTROL!B5"]?.[0]?.[0] ?? null;
      const prepared = await prepareCommit({
        turnId: "diag-prepare",
        txId: "diag-prepare-no-write",
        expectedSaveId: currentSave,
        saveTo: currentSave,
        preconditions: [{ range: "CONTROL!B5", equals: currentWorldTime as string | number | boolean | null }],
        sheetWrites: [],
        docAppends: [],
        dryRun: true,
      });
      return json({
        ok: true,
        prepared: true,
        dryRun: true,
        writesEnabled: config.allowWrites,
        elapsedMs: prepared.elapsedMs,
        validationPass: prepared.validation?.every((v: { pass: boolean }) => v.pass) ?? false,
        sheetWritesInManifest: prepared.manifest.sheetWrites.length,
        docAppendsInManifest: prepared.manifest.docAppends.length,
      });
    }

    if (pathname === "/diag/docs" && req.method === "GET") {
      const ctx = await getTurnContext({
        turnId: "diag-docs",
        turnClass: "MICRO",
        tags: [],
        actorIds: [],
        lookups: [],
        docQueries: [{
          documentKey: "LIVE_CANON_INDEX",
          query: "V2",
          maxMatches: 3,
        }],
      });
      const doc = ctx.packet.docs[0];
      return json({
        ok: true,
        docsLoaded: Boolean(doc),
        elapsedMs: ctx.elapsedMs,
        cache: doc?.cache ?? null,
        revisionPresent: Boolean(doc?.revision),
        matchCount: Array.isArray(doc?.matches) ? doc.matches.length : 0,
      });
    }

    if (pathname === "/diag/mcp" && req.method === "GET") {
      return json(await diagnoseMcp());
    }

    if (pathname === "/mcp") {
      if (!authorized(req)) return json({ error: "unauthorized" }, 401);
      return await handleMcp(req);
    }

    if (!authorized(req)) return json({ error: "unauthorized" }, 401);

    if (pathname === "/simulate/world-v3" && req.method === "POST") {
      if (!config.worldSimV3Enabled) return json({ ok: false, error: "world_sim_v3_disabled" }, 503);
      const size = Number(req.headers.get("content-length") ?? "0");
      if (Number.isFinite(size) && size > 64000) return json({ ok: false, error: "world_sim_v3_request_too_large" }, 413);
      return json(await simulateWorldV3BatchLive(await body<WorldV3BatchRequest>(req)));
    }

    if (pathname === "/health" && req.method === "GET") {
      const state = await sheetsBatchGet(config.files.TEMP_RUNTIME, [
        "CONTROL!B2",
        "CONTROL!B5",
        "CONTROL!B6",
        "CONTROL!B8",
      ]);
      return json({
        ok: true,
        engineVersion: RULESET_VERSION,
        runtime: config.runtime,
        hudUiVersion: HUD_UI_VERSION,
        writesEnabled: config.allowWrites,
        rawCommitsEnabled: config.allowRawCommits,
        worldSimulationV3: config.worldSimV3Enabled ? "READ_ONLY_PROPOSALS" : "DISABLED",
        saveId: state["CONTROL!B2"]?.[0]?.[0] ?? null,
        worldTime: state["CONTROL!B5"]?.[0]?.[0] ?? null,
        locationId: state["CONTROL!B6"]?.[0]?.[0] ?? null,
        sceneId: state["CONTROL!B8"]?.[0]?.[0] ?? null,
      });
    }

    if (pathname === "/context" && req.method === "POST") {
      return json(await getTurnContext(await body<TurnContextRequest>(req)));
    }

    if (pathname === "/prepare-commit" && req.method === "POST") {
      const input = await body<CommitRequest>(req);
      try {
        return json(await prepareCommit({ ...input, dryRun: true }));
      } catch (error) {
        return json({
          ok: false,
          prepareError: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (pathname === "/commit" && req.method === "POST") {
      return json(await commitTurn(await body<CommitRequest>(req)));
    }

    if (pathname === "/rng/int" && req.method === "POST") {
      const input = await body<{ seed: string; min: number; max: number }>(req);
      return json({ value: intBetween(input.seed, input.min, input.max) });
    }

    return json({ error: "not_found" }, 404);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
}
