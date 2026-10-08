import { handleHttpRequest } from "../../src/http.ts";

type NetlifyRequestContext = {
  deploy?: {
    context?: string;
    published?: boolean;
  };
};

export default async (req: Request, context?: NetlifyRequestContext): Promise<Response> => {
  const pathname = new URL(req.url).pathname;
  const deployContext = context?.deploy?.context ?? "unknown";

  // Production write surfaces are never reachable from Deploy Previews,
  // branch deploys or unknown Netlify contexts, even if an environment
  // variable was accidentally scoped too broadly in the Netlify UI.
  if (deployContext !== "production" && (pathname === "/commit" || pathname === "/mcp")) {
    return new Response(JSON.stringify({
      error: "writes_not_available_in_this_deploy_context",
      deployContext,
    }), {
      status: 403,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  return await handleHttpRequest(req);
};

export const config = {
  path: [
    "/",
    "/health",
    "/context",
    "/prepare-commit",
    "/commit",
    "/rng/int",
    "/mcp",
    "/diag/context",
    "/diag/prepare",
    "/diag/docs",
    "/diag/mcp"
  ]
};
