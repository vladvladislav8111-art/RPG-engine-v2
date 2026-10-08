import { config } from "./src/config.ts";
import { handleHttpRequest } from "./src/http.ts";

Deno.serve({ port: config.port }, handleHttpRequest);
