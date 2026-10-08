import { cacheGet, cacheSet } from "./cache.ts";
import { config } from "./config.ts";
import { docsAppendIdempotent, sheetsBatchGet, sheetsBatchUpdate } from "./google.ts";
import { prepareSemanticCommit } from "./semantic.ts";
import type { CommitRequest } from "./types.ts";

function firstCell(values: Record<string, unknown[][]>, range: string): unknown {
  return values[range]?.[0]?.[0] ?? null;
}

function same(a: unknown, b: unknown): boolean {
  if (a == null) return b == null || b === "";
  return String(a) === String(b);
}

async function appendDocsIdempotent(input: CommitRequest) {
  return await Promise.all((input.docAppends ?? []).map(async (item) => {
    const documentId = config.files[item.documentKey];
    return { documentKey: item.documentKey, ...(await docsAppendIdempotent(documentId, input.txId, item.text)) };
  }));
}

export async function prepareCommit(input: CommitRequest) {
  if (input.semantic) return await prepareSemanticCommit(input as CommitRequest & { semantic: NonNullable<CommitRequest["semantic"]> });

  const started = performance.now();
  const preconditions = input.preconditions ?? [];
  const ranges = Array.from(new Set(["CONTROL!B2", ...preconditions.map((p) => p.range)]));
  const current = await sheetsBatchGet(config.files.TEMP_RUNTIME, ranges);
  const actualSave = String(firstCell(current, "CONTROL!B2") ?? "");
  if (actualSave !== input.expectedSaveId) throw new Error(`save precondition failed: expected ${input.expectedSaveId}, got ${actualSave}`);
  const validation = preconditions.map((p) => ({
    range: p.range,
    expected: p.equals,
    actual: firstCell(current, p.range),
    pass: same(firstCell(current, p.range), p.equals),
  }));
  const failed = validation.filter((v) => !v.pass);
  if (failed.length) throw new Error(`preconditions failed: ${JSON.stringify(failed)}`);

  const sheetWrites = (input.sheetWrites ?? []).filter((w) => w.range !== "CONTROL!B2");
  sheetWrites.push({ range: "CONTROL!B2", values: [[input.saveTo]] });
  return {
    turnId: input.turnId,
    txId: input.txId,
    dryRun: input.dryRun ?? false,
    semantic: false,
    elapsedMs: Math.round(performance.now() - started),
    validation,
    manifest: {
      spreadsheetId: config.files.TEMP_RUNTIME,
      sheetWrites,
      docAppends: (input.docAppends ?? []).map((d) => ({ ...d, txMarker: `[TX:${input.txId}]` })),
    },
  };
}

export async function commitTurn(input: CommitRequest) {
  if (!config.allowWrites) throw new Error("Writes are disabled. Set ALLOW_WRITES=true only after dry-run validation.");
  if (!input.semantic && !input.dryRun && !config.allowRawCommits) {
    throw new Error("Raw commits are disabled. Ordinary gameplay must use semantic commits; set ALLOW_RAW_COMMITS=true only for deliberate migration/repair.");
  }

  const started = performance.now();
  const prepared: any = await prepareCommit(input);
  if (input.dryRun) return { ...prepared, committed: false };

  // Semantic SESSION_LOG is the durable idempotency anchor across serverless cold starts.
  // If Sheets committed but a later permanent-canon append failed, retry the requested
  // doc appends by TX marker before reporting the replay as complete.
  if (prepared.alreadyCommitted) {
    const docs = await appendDocsIdempotent(input);
    return {
      ...prepared,
      committed: true,
      idempotentReplay: true,
      docs,
      elapsedMs: Math.round(performance.now() - started),
    };
  }

  const txKey = ["tx", input.txId] as const;
  const prior = await cacheGet<{ state: string }>(txKey);
  if (prior?.state === "COMMITTED") {
    const docs = await appendDocsIdempotent(input);
    return {
      ...prepared,
      committed: true,
      idempotentReplay: true,
      docs,
      elapsedMs: Math.round(performance.now() - started),
    };
  }

  await cacheSet(txKey, { state: "COMMITTING", saveTo: input.saveTo, startedAt: new Date().toISOString() });
  try {
    const sheetResult = await sheetsBatchUpdate(config.files.TEMP_RUNTIME, prepared.manifest.sheetWrites);
    await cacheSet(txKey, { state: "SHEET_COMMITTED_DOCS_PENDING", saveTo: input.saveTo });

    const docs = await appendDocsIdempotent(input);

    const verify = await sheetsBatchGet(config.files.TEMP_RUNTIME, ["CONTROL!B2", "CONTROL!B5", "CONTROL!B6", "CONTROL!B8"]);
    const save = String(firstCell(verify, "CONTROL!B2") ?? "");
    if (save !== input.saveTo) throw new Error(`commit verification failed: expected ${input.saveTo}, got ${save}`);

    await cacheSet(txKey, { state: "COMMITTED", saveTo: input.saveTo, committedAt: new Date().toISOString() });
    return {
      ...prepared,
      committed: true,
      totalUpdatedCells: sheetResult.totalUpdatedCells ?? null,
      docs,
      verifiedState: {
        saveId: save,
        worldTime: firstCell(verify, "CONTROL!B5"),
        locationId: firstCell(verify, "CONTROL!B6"),
        sceneId: firstCell(verify, "CONTROL!B8"),
      },
      elapsedMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    await cacheSet(txKey, { state: "RECOVERY_REQUIRED", saveTo: input.saveTo, error: String(error) });
    throw error;
  }
}
