import { commitTurn, prepareCommit } from "./src/commit.ts";
import { config } from "./src/config.ts";
import { getTurnContext } from "./src/context.ts";
import { sheetsBatchGet } from "./src/google.ts";
import { intBetween } from "./src/rng.ts";
import { diagnoseMcp, handleMcp } from "./src/mcp.ts";
import type { CommitRequest, TurnContextRequest } from "./src/types.ts";

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

Deno.serve({ port: config.port }, async (req) => {
  const url = new URL(req.url);
  try {
    if (url.pathname === "/" && req.method === "GET") {
      let googleConnected = false;
      try {
        await sheetsBatchGet(config.files.TEMP_RUNTIME, ["CONTROL!B2"]);
        googleConnected = true;
      } catch {
        googleConnected = false;
      }
      return json({
        service: "RPG V2 Deno Runtime Gateway",
        status: "ready",
        writesEnabled: config.allowWrites,
        googleConnected,
      });
    }
    if (url.pathname === "/diag/context" && req.method === "GET") {
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

    if (url.pathname === "/diag/prepare" && req.method === "GET") {
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
        validationPass: prepared.validation.every((v) => v.pass),
        sheetWritesInManifest: prepared.manifest.sheetWrites.length,
        docAppendsInManifest: prepared.manifest.docAppends.length,
      });
    }

    if (url.pathname === "/diag/docs" && req.method === "GET") {
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

    if (url.pathname === "/diag/semantic" && req.method === "GET") {
      const ctx = await getTurnContext({
        turnId: "diag-semantic-ctx",
        turnClass: "MICRO",
        tags: ["SKILL"],
        actorIds: [],
        lookups: [],
        docQueries: [],
      });
      const prepared = await prepareCommit({
        turnId: "diag-semantic",
        txId: "diag-semantic-no-write",
        expectedSaveId: ctx.packet.saveId,
        saveTo: ctx.packet.saveId,
        dryRun: true,
        semantic: {
          turnToken: ctx.packet.turnToken,
          elapsedSeconds: 0,
          session: {
            inworldStart: `Day${ctx.packet.worldDay} ${ctx.packet.worldTime}`,
            actionSummary: "semantic dry-run diagnostic",
            deltas: {},
            newCanon: {},
            worldAdvances: {},
            source: "DIAG",
          },
        },
      });
      return json({
        ok: true,
        semanticPrepared: true,
        elapsedMs: prepared.elapsedMs,
        writes: prepared.manifest.sheetWrites.length,
        alreadyCommitted: prepared.alreadyCommitted ?? false,
      });
    }

    if (url.pathname === "/diag/mcp" && req.method === "GET") {
      return json(await diagnoseMcp());
    }

    if (url.pathname === "/mcp") {
      if (!authorized(req)) {
        return json({ error: "unauthorized" }, 401);
      }
      return await handleMcp(req);
    }

    if (!authorized(req)) return json({ error: "unauthorized" }, 401);

    if (url.pathname === "/health" && req.method === "GET") {
      const state = await sheetsBatchGet(config.files.TEMP_RUNTIME, ["CONTROL!B2", "CONTROL!B5", "CONTROL!B6", "CONTROL!B8"]);
      return json({
        ok: true,
        writesEnabled: config.allowWrites,
        saveId: state["CONTROL!B2"]?.[0]?.[0] ?? null,
        worldTime: state["CONTROL!B5"]?.[0]?.[0] ?? null,
        locationId: state["CONTROL!B6"]?.[0]?.[0] ?? null,
        sceneId: state["CONTROL!B8"]?.[0]?.[0] ?? null,
      });
    }

    if (url.pathname === "/context" && req.method === "POST") {
      return json(await getTurnContext(await body<TurnContextRequest>(req)));
    }

    if (url.pathname === "/prepare-commit" && req.method === "POST") {
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

    if (url.pathname === "/commit" && req.method === "POST") {
      return json(await commitTurn(await body<CommitRequest>(req)));
    }

    if (url.pathname === "/rng/int" && req.method === "POST") {
      const input = await body<{ seed: string; min: number; max: number }>(req);
      return json({ value: intBetween(input.seed, input.min, input.max) });
    }

    return json({ error: "not_found" }, 404);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
