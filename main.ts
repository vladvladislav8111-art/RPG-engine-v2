import { commitTurn, prepareCommit } from "./src/commit.ts";
import { config } from "./src/config.ts";
import { getTurnContext } from "./src/context.ts";
import { sheetsBatchGet } from "./src/google.ts";
import { intBetween } from "./src/rng.ts";
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
      return json(await prepareCommit(await body<CommitRequest>(req)));
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
