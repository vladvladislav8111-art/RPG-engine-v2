import { commitTurn, prepareCommit } from "./commit.ts";
import { config } from "./config.ts";
import { fixedWriterE2EGate,runFixedWriterE2E } from "./preview_writer_e2e.ts";
import { PREVIEW_WRITER_E2E_HTML } from "./preview_writer_e2e_ui.ts";
import { previewWriterReadiness, previewWriterReadinessGate,
  PREVIEW_WRITER_READINESS_PAGE } from "./preview_writer_readiness.ts";
import { testPreviewStorage } from "./preview_test_storage.ts";
import { bridgeFeatureStatus } from "./bridge_integration.ts";
import { getTurnContext } from "./context.ts";
import { sheetsBatchGet } from "./google.ts";
import { HUD_UI_VERSION } from "./hud.ts";
import { diagnoseMcp, handleMcp } from "./mcp.ts";
import { intBetween } from "./rng.ts";
import {fixedRecoveryGate,readFixedRecovery} from "./preview_google_recovery.ts";
import {PREVIEW_GOOGLE_RECOVERY_PAGE} from "./preview_google_recovery_ui.ts";
import { crossRevisionGate, runCrossRevisionProbe, CROSS_REVISION_PAGE } from "./preview_kv_cross_revision.ts";
import {
  previewKvGate, previewKvSession, previewKvStatus, previewKvHold,
  previewKvContend, PREVIEW_KV_PAGE,
  PREVIEW_KV_SETUP_PAGE, isPreviewTimeline, previewKvGateChecks,
} from "./preview_kv_probe.ts";
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
      try {
        await sheetsBatchGet(config.files.TEMP_RUNTIME, ["CONTROL!B2"]);
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
      });
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

    // Authenticated synthetic KV-only probe. Never reaches Google writer.
    const timeline=(globalThis as unknown as {
      Deno?: {env?: {get?: (name:string)=>string|undefined}};
    }).Deno?.env?.get?.("DENO_TIMELINE") ?? "";
    const previewKvInput={
      timeline,enabled:config.previewKvRaceEnabled,
      writesEnabled:config.allowWrites,rawWritesEnabled:config.allowRawCommits,
      npcHeatWriterEnabled:config.npcHeatTestWriterEnabled,
      kvEnabled:config.enableKv,configuredWorkbookId:config.files.TEMP_RUNTIME,
      isolatedWorkbookId:config.npcHeatTestWorkbookId,
    };
    const previewKvAllowed=previewKvGate(previewKvInput);
    if (pathname==="/preview/kv-race/setup" && req.method==="GET") {
      if(!isPreviewTimeline(timeline)) return json({error:"not_found"},404);
      return new Response(PREVIEW_KV_SETUP_PAGE,{headers:{
        "content-type":"text/html; charset=utf-8",
        "cache-control":"no-store",
        "referrer-policy":"no-referrer",
        "content-security-policy":"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      }});
    }
    if (pathname==="/preview/kv-race/diagnostics" && req.method==="GET") {
      if(!isPreviewTimeline(timeline)) return json({error:"not_found"},404);
      if(!authorized(req)) return json({error:"unauthorized"},401);
      const checks=previewKvGateChecks(previewKvInput);
      return json({testOnly:true,ready:previewKvAllowed,
        checks,failedChecks:Object.entries(checks).filter(([,pass])=>!pass).map(([key])=>key),
        googleCallsPerformed:0,kvWritesPerformed:0,
      });
    }
    if (pathname==="/preview/kv-cross-revision" &&
        req.method==="GET") {
      if(!crossRevisionGate(previewKvInput))
        return json({error:"not_found"},404);
      return new Response(CROSS_REVISION_PAGE,{headers:{
        "content-type":"text/html; charset=utf-8",
        "cache-control":"no-store",
        "referrer-policy":"no-referrer",
        "content-security-policy":"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      }});
    }
    if (pathname==="/preview/kv-cross-revision/run" &&
        req.method==="POST") {
      if(!crossRevisionGate(previewKvInput))
        return json({error:"not_found"},404);
      if(!authorized(req))return json({error:"unauthorized"},401);
      if(Number(req.headers.get("content-length")??"0")>0)
        return json({error:"no_request_body_allowed"},400);
      return json(await runCrossRevisionProbe());
    }
    if(pathname==="/preview/google-recovery" &&
        req.method==="GET"){
      if(!fixedRecoveryGate({
        timeline,tempId:config.files.TEMP_RUNTIME,
        testWorkbookId:config.npcHeatTestWorkbookId,
        docs:config.files,allowWrites:config.allowWrites,
        rawWrites:config.allowRawCommits,
        writerEnabled:config.npcHeatTestWriterEnabled,
        kvEnabled:config.enableKv,
      }))return json({error:"not_found"},404);
      return new Response(PREVIEW_GOOGLE_RECOVERY_PAGE,{headers:{
        "content-type":"text/html; charset=utf-8",
        "cache-control":"no-store",
        "referrer-policy":"no-referrer",
        "content-security-policy":"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      }});
    }
    if(pathname==="/preview/google-recovery/report" && req.method==="GET"){
      if(!fixedRecoveryGate({
        timeline,tempId:config.files.TEMP_RUNTIME,
        testWorkbookId:config.npcHeatTestWorkbookId,
        docs:config.files,allowWrites:config.allowWrites,
        rawWrites:config.allowRawCommits,
        writerEnabled:config.npcHeatTestWriterEnabled,
        kvEnabled:config.enableKv,
      }))return json({error:"not_found"},404);
      if(!authorized(req))return json({error:"unauthorized"},401);
      return json(await readFixedRecovery());
    }
    if (pathname.startsWith("/preview/kv-race")) {
      if (!previewKvAllowed) return json({error:"not_found"},404);
      if (pathname==="/preview/kv-race" && req.method==="GET") {
        return new Response(PREVIEW_KV_PAGE,{headers:{
          "content-type":"text/html; charset=utf-8",
          "cache-control":"no-store",
          "referrer-policy":"no-referrer",
          "content-security-policy":"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        }});
      }
      if (!authorized(req))return json({error:"unauthorized"},401);
      if (pathname==="/preview/kv-race/status" && req.method==="GET")
        return json(await previewKvStatus(previewKvSession(url.searchParams.get("session"))));
      if (req.method==="POST" &&
          (pathname==="/preview/kv-race/hold"||pathname==="/preview/kv-race/contend")) {
        if(Number(req.headers.get("content-length")??"0")>2048)
          return json({error:"request_too_large"},413);
        const session=previewKvSession((await body<{sessionId?:unknown}>(req)).sessionId);
        return json(pathname.endsWith("/hold")
          ? await previewKvHold(session) : await previewKvContend(session));
      }
      return json({error:"not_found"},404);
    }



    if(pathname==="/preview/writer-e2e" && req.method==="GET"){
      const timeline=(globalThis as unknown as {
        Deno?:{env?:{get?:(n:string)=>string|undefined}}
      }).Deno?.env?.get?.("DENO_TIMELINE")??"";
      // The setup page itself is static; it cannot read or write Google.
      if(!testPreviewStorage(timeline,config.files.TEMP_RUNTIME))
        return json({error:"not_found"},404);
      return new Response(PREVIEW_WRITER_E2E_HTML,{headers:{
        "content-type":"text/html; charset=utf-8",
        "cache-control":"no-store",
        "referrer-policy":"no-referrer",
        "content-security-policy":"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      }});
    }
    if(pathname==="/preview/writer-e2e/run" && req.method==="POST"){
      const timeline=(globalThis as unknown as {
        Deno?:{env?:{get?:(n:string)=>string|undefined}}
      }).Deno?.env?.get?.("DENO_TIMELINE")??"";
      if(!fixedWriterE2EGate({timeline,workbookId:config.files.TEMP_RUNTIME,
        isolatedWorkbookId:config.npcHeatTestWorkbookId,docs:config.files,
        allowWrites:config.allowWrites,allowRawCommits:config.allowRawCommits,
        testWriterEnabled:config.npcHeatTestWriterEnabled,kvEnabled:config.enableKv}))
        return json({error:"not_found"},404);
      if(!authorized(req))return json({error:"unauthorized"},401);
      if(Number(req.headers.get("content-length")??"0")>0)
        return json({error:"no_caller_payload_permitted"},400);
      return json(await runFixedWriterE2E());
    }
    if(pathname==="/preview/writer-setup" && req.method==="GET"){
      const timeline=(globalThis as unknown as {
        Deno?:{env?:{get?:(n:string)=>string|undefined}}
      }).Deno?.env?.get?.("DENO_TIMELINE")??"";
      if(!testPreviewStorage(timeline,config.files.TEMP_RUNTIME))
        return json({error:"not_found"},404);
      return new Response(PREVIEW_WRITER_READINESS_PAGE,{headers:{
        "content-type":"text/html; charset=utf-8",
        "cache-control":"no-store",
        "referrer-policy":"no-referrer",
        "content-security-policy":"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      }});
    }
    if(pathname==="/preview/writer-readiness" && req.method==="GET"){
      const timeline=(globalThis as unknown as {
        Deno?:{env?:{get?:(n:string)=>string|undefined}}
      }).Deno?.env?.get?.("DENO_TIMELINE")??"";
      if(!previewWriterReadinessGate({
        timeline,tempId:config.files.TEMP_RUNTIME,
        docs:config.files,allowWrites:config.allowWrites,
        rawWrites:config.allowRawCommits,
        heatWriter:config.npcHeatTestWriterEnabled,kvEnabled:config.enableKv,
      }))return json({error:"not_found"},404);
      if(!authorized(req))return json({error:"unauthorized"},401);
      return json(await previewWriterReadiness());
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
