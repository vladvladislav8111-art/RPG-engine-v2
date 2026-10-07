import { handleHttpRequest } from "../src/http.ts";

async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const route = url.searchParams.get("__rpg_route") ?? undefined;
  return await handleHttpRequest(request, route);
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE, handler as HEAD, handler as OPTIONS };
