import { commitTurn, prepareCommit } from "./commit.ts";
import { config } from "./config.ts";
import { getTurnContext } from "./context.ts";
import { sheetsBatchGet } from "./google.ts";
import { HUD_UI_VERSION } from "./hud.ts";
import { diagnoseMcp, handleMcp } from "./mcp.ts";
import { intBetween } from "./rng.ts";
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

export async function handleHttpRequest(
  req: Request,
  routeOverride?: string,
): Promise<Response> {
  const url = new URL(req.url);
  const pathname = routeOverride ?? url.pathname;
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
        validationPass: prepared.validation.every((v: { pass: boolean }) => v.pass),
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
