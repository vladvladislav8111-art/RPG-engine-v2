# Vercel migration notes

Target runtime: official Vercel Node.js 24 Function with Fluid Compute.

Do not use the community Deno runtime for the primary deployment. The goal is to keep the RPG core independent from hosting-specific APIs.

Required production Secrets / Config:

- RUNTIME_API_KEY — Secret
- GOOGLE_SERVICE_ACCOUNT_EMAIL — Secret
- GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY — Secret
- ALLOW_WRITES — Config; false during preview validation, true only for the promoted production deployment after dry-run checks
- ENABLE_KV — Config; false on Vercel
- TEMP_RUNTIME_ID — Secret or Config depending on account policy
- GM_PREGEN_ID
- LIVE_CANON_INDEX_ID
- LIVE_PLAYER_INVENTORY_ID
- LIVE_JOURNAL_LANGUAGE_DISCOVERIES_ID
- LIVE_NPCS_KNOWLEDGE_SOCIAL_ID
- LIVE_MAPS_LOCATIONS_STATE_ID
- LIVE_WORLD_OPPORTUNITIES_ID
- LIVE_PROJECTS_LONGFORM_ID
- LIVE_SESSION_LOG_ID
- LIVE_TRANSACTION_ARCHIVE_ID

Recommended deployment sequence:

1. Import GitHub repository into a personal Hobby project.
2. Use Node.js 24 and verify Fluid Compute is enabled.
3. Add Preview secrets with ALLOW_WRITES=false.
4. Protect Preview deployments with Vercel Authentication.
5. Run /health, /diag/context, /diag/mcp, dormant-NPC and Max context tests.
6. Verify write manifest with /prepare-commit only.
7. Add/verify Production secrets; keep ALLOW_WRITES=false for first production health check.
8. Enable production writes only after read-only verification and redeploy.
9. Move the ChatGPT RPG Runtime Bridge base URL to the Vercel production domain.
10. Keep the old Deno endpoint disconnected/frozen as rollback reference until the first successful committed Vercel turn.

Operational rules:

- Hobby is for personal/non-commercial use.
- Treat the Vercel cache and warm instance memory as disposable.
- Do not depend on local filesystem state; only /tmp is writable and temporary.
- Avoid one Git push per file. One feature package -> one preview -> promote/merge once.
- Watch Active CPU, Provisioned Memory and Function Invocations. I/O wait to Google APIs does not count as Active CPU, but memory remains provisioned while the request runs.
- Keep request and response payloads well below 4.5 MB.


## Vercel-specific decisions confirmed during review

- Use the official Node.js runtime, not the community Deno runtime. The target is Node.js 24.
- Keep one gateway Function but preserve the original public endpoint through an explicit __rpg_route rewrite parameter; do not rely on the internal rewritten pathname.
- Hobby + Fluid Compute currently gives a 300-second maximum Function duration and Standard 1 vCPU / 2 GB function instances.
- Function request and response bodies must stay below 4.5 MB.
- Hobby included Fluid usage is finite: monitor Active CPU, Provisioned Memory, and Function Invocations. If Hobby limits are exceeded, the project can be paused rather than continuing with automatic paid overage.
- Vercel Authentication can protect preview deployments; current Vercel also supports production deployment protection on every plan, but the RPG /mcp endpoint must ultimately be reachable by ChatGPT, so platform-level auth must not accidentally block the production MCP client. The runtime Bearer key remains the application authorization layer.
- Environment secrets must be entered directly into Vercel; do not paste service-account private keys into chat or commit them to Git.
- The migration initially preserves the production-proven MCP SDK handler. After the first stable Vercel cutover, mcp-handler 2.x can be evaluated as a separate optimization because it provides stateless current-spec MCP plus compatibility for 2025 Streamable HTTP without Redis.
