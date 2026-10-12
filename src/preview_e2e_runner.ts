import { config } from "./config.ts";
import { commitTurn, prepareCommit } from "./commit.ts";
import { requireWriterKv } from "./cache.ts";
import { docsGet, sheetsBatchGet } from "./google.ts";
import { PREVIEW_TEST_SAVE_ID } from "./preview_fixture.ts";
import { withKvWriterLease } from "./writer_kv_lease.ts";
import type { CommitRequest } from "./types.ts";

export const PREVIEW_E2E_TX = "TEST-PREVIEW-REAL-WRITER-20261012-001";
const PREVIEW_E2E_TURN = "TEST-PREVIEW-REAL-WRITER-TURN-001";
const NEXT_TEST_SAVE = "TEST-S2";
const TEST_DOC = "LIVE_TRANSACTION_ARCHIVE";

const TEST_REQUEST: CommitRequest = {
  turnId: PREVIEW_E2E_TURN,
  txId: PREVIEW_E2E_TX,
  expectedSaveId: PREVIEW_TEST_SAVE_ID,
  saveTo: NEXT_TEST_SAVE,
  docAppends: [{
    documentKey: TEST_DOC,
    text: "SYNTHETIC PREVIEW WRITER TEST ONLY. No Shura state or gameplay.",
  }],
  semantic: {
    elapsedSeconds: 0,
    session: {
      inworldStart: "Day67 17:21:00",
      sceneId: "scene.test_only",
      actionSummary: "Synthetic fixed E2E transaction; no gameplay time or rewards",
      source: "SYNTHETIC_PREVIEW_E2E",
    },
  },
};

function testOnlyPreconditions(): void {
  if (!config.previewFixture) throw Error("PREVIEW_E2E_NOT_TEST_FIXTURE");
  if (!config.allowWrites) throw Error("PREVIEW_E2E_WRITES_DISABLED");
  if (config.allowRawCommits) throw Error("PREVIEW_E2E_RAW_WRITES_MUST_BE_DISABLED");
  if (config.kvWriterLeaseEnabled) throw Error("PREVIEW_E2E_LOCK_FLAG_ALREADY_ENABLED");
}

async function readEvidence() {
  const r = await sheetsBatchGet(config.files.TEMP_RUNTIME, [
    "CONTROL!B2", "SESSION_LOG!A1:P5000",
  ]);
  const saveId = String(r["CONTROL!B2"]?.[0]?.[0] ?? "");
  const rows = r["SESSION_LOG!A1:P5000"] ?? [];
  const header = rows[0] ?? [];
  const txIndex = header.indexOf("TX ID");
  const saveIndex = header.indexOf("Save ID");
  if (txIndex < 0 || saveIndex < 0) throw Error("PREVIEW_E2E_LOG_SCHEMA_MISMATCH");
  const receipts = rows.slice(1).filter(row => String(row[txIndex] ?? "") === PREVIEW_E2E_TX);
  const doc = await docsGet(config.files[TEST_DOC]);
  const marker = `[TX:${PREVIEW_E2E_TX}]`;
  return {
    saveId,
    receiptCount: receipts.length,
    receiptSave: String(receipts[0]?.[saveIndex] ?? ""),
    docMarkerCount: doc.text.split(marker).length - 1,
  };
}

/**
 * A single fixed test-only POST, called with the existing runtime Bearer auth.
 * No input is accepted from the HTTP caller. All Google targets are pinned by
 * the isolated fixture; general gameplay commits remain separately protected.
 *
 * The outer CAS lock exercises actual deployed KV and prevents two E2E POSTs
 * racing. This test runner uses an explicit local catch/release so its test
 * lock can be safely retried after a test-fixture failure; production writer
 * error semantics remain fail-closed.
 */
export async function runIsolatedPreviewWriteE2E() {
  testOnlyPreconditions();
  const kv = await requireWriterKv();
  const before = await readEvidence();
  if (before.saveId !== PREVIEW_TEST_SAVE_ID && before.saveId !== NEXT_TEST_SAVE) {
    throw Error("PREVIEW_E2E_UNEXPECTED_TEST_SAVE_ID");
  }
  const priorCompleted = before.saveId === NEXT_TEST_SAVE &&
    before.receiptCount === 1 && before.docMarkerCount === 1;
  if (before.saveId === NEXT_TEST_SAVE && !priorCompleted && before.receiptCount !== 1) {
    throw Error("PREVIEW_E2E_PARTIAL_STATE_REQUIRES_REVIEW");
  }

  // Validate true deployed Deno KV CAS independently of the Google writer.
  const kvProbeWorkbook = "TEST-PREVIEW-E2E-KV-REMOTE-CAS";
  let releaseProbe: () => void = () => {};
  let markAcquired: () => void = () => {};
  const waitForRelease = new Promise<void>(r => { releaseProbe = r; });
  const acquiredSignal = new Promise<void>(r => { markAcquired = r; });
  const first = withKvWriterLease({
    kv, workbookId: kvProbeWorkbook, txId: "TEST-KV-HOLDER",
    action: async () => { markAcquired(); await waitForRelease; return "held"; },
  });
  let secondRejected = false;
  try {
    await acquiredSignal;
    try {
      await withKvWriterLease({kv, workbookId: kvProbeWorkbook, txId: "TEST-KV-CONTENDER",
        action: async () => "SHOULD_NOT_RUN"});
    } catch (error) {
      secondRejected = String(error).includes("WRITER_LEASE_BUSY_RETRY_LATER");
      if (!secondRejected) throw error;
    }
  } finally {
    releaseProbe();
    await first;
  }
  if (!secondRejected) throw Error("PREVIEW_E2E_KV_CAS_DID_NOT_EXCLUDE");

  return await withKvWriterLease({
    kv, workbookId: config.files.TEMP_RUNTIME, txId: PREVIEW_E2E_TX,
    action: async () => {
      // A real semantic dry-run before any writes.
      const prepared = await prepareCommit({...TEST_REQUEST, dryRun: true});
      if (prepared.alreadyCommitted !== true &&
          !prepared.validation?.every((v: {pass:boolean}) => v.pass)) {
        throw Error("PREVIEW_E2E_SEMANTIC_PREPARE_REJECTED");
      }
      const firstResult = await commitTurn(TEST_REQUEST);
      const secondResult = await commitTurn(TEST_REQUEST);
      const after = await readEvidence();
      if(after.saveId !== NEXT_TEST_SAVE || after.receiptCount !== 1 ||
        after.receiptSave !== NEXT_TEST_SAVE || after.docMarkerCount !== 1 ||
        secondResult.idempotentReplay !== true) {
        throw Error("PREVIEW_E2E_EXACTLY_ONCE_VERIFICATION_FAILED");
      }
      return {
        ok: true,
        testOnly: true,
        startingSaveId: before.saveId,
        saveId: after.saveId,
        txId: PREVIEW_E2E_TX,
        semanticDryRunPassed: true,
        commitSucceeded: firstResult.committed === true,
        replayWasIdempotent: secondResult.idempotentReplay === true,
        sessionLogReceiptCount: after.receiptCount,
        documentMarkerCount: after.docMarkerCount,
        kvCasContestDenied: secondRejected,
        remoteKvUsed: true,
        productionTouched: false,
      };
    },
  });
}

export function previewE2EHtml(): string {
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>RPG V2: Preview E2E</title>
<style>body{font:16px system-ui;background:#111827;color:#e5e7eb;max-width:650px;margin:3rem auto;padding:1rem}input,button{padding:12px;font:inherit;width:100%;box-sizing:border-box;border-radius:8px}input{background:#1f2937;color:#fff;border:1px solid #6b7280}button{margin-top:16px;background:#2563eb;color:white;border:0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#1f2937;padding:16px;border-radius:8px}</style>
</head><body><h1>Изолированный E2E-тест RPG</h1>
<p>Только TEST-S1 / TEST-S2. Транзакция фиксирована; произвольные команды не принимаются.</p>
<p>Запись должна быть разрешена <b>только для Preview</b>. Введите существующий RUNTIME_API_KEY локально; его не нужно присылать в чат.</p>
<label>Bearer-ключ <input id="key" type="password" autocomplete="off"></label>
<button id="go" type="button">Запустить тестовую транзакцию</button>
<pre id="status">Тест ещё не выполнялся.</pre>
<script>
const button=document.querySelector("#go");
button.addEventListener("click",async()=>{
 button.disabled=true;document.querySelector("#status").textContent="Проверка выполняется...";
 const key=document.querySelector("#key").value.trim();
 document.querySelector("#key").value="";
 try{
   const response=await fetch("/preview/e2e/run",{method:"POST",headers:{"authorization":"Bearer "+key}});
   const text=await response.text();
   try{document.querySelector("#status").textContent=JSON.stringify(JSON.parse(text),null,2);}
   catch{document.querySelector("#status").textContent="HTTP "+response.status+": "+text;}
 }catch(e){document.querySelector("#status").textContent=String(e);}
 finally{button.disabled=false;}
});
</script>
</body></html>`;
}
