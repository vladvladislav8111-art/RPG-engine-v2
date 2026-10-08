import { handleHttpRequest } from "../../src/http.ts";

export default async (req: Request): Promise<Response> => {
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
