/**
 * Synthetic/operator-assisted lock recovery preflight. There is intentionally
 * NO KV mutator here: merely asserting workers are drained is not proof that
 * a paused Deno worker cannot later resume.
 */
export type HeatLockRecoveryEvidence = {
  lockWorkbookId: string;
  expectedIsolatedWorkbookId: string;
  txId: string;
  lockOwnerTxId: string;
  expectedSaveTo: string;
  liveControlSaveId: string;
  countCommittedTxRows: number;
  txRowSaveTo: string | null;
  requiredDocs: readonly string[];
  docsWithTxMarker: readonly string[];
  operatorVerifiedAllWorkersStopped: boolean;
  sourceSnapshotStable: boolean;
};
export function planHeatLockRecovery(e: HeatLockRecoveryEvidence) {
  const reasons: string[] = [];
  if (!e.lockWorkbookId || e.lockWorkbookId !== e.expectedIsolatedWorkbookId ||
      !e.txId.startsWith("TEST-") || !e.expectedSaveTo.startsWith("TEST-"))
    reasons.push("ISOLATED_TEST_SCOPE_REQUIRED");
  if (e.lockOwnerTxId !== e.txId) reasons.push("LOCK_OWNER_TX_MISMATCH");
  if (!e.operatorVerifiedAllWorkersStopped) reasons.push("ALL_WORKERS_NOT_VERIFIABLY_DRAINED");
  if (!e.sourceSnapshotStable) reasons.push("CONTROL_SOURCE_CHANGED");
  if (!Number.isInteger(e.countCommittedTxRows) ||
      e.countCommittedTxRows < 0 || e.countCommittedTxRows > 1)
    reasons.push("TX_RECEIPT_MISSING_OR_COLLIDING");
  if (e.countCommittedTxRows === 0)
    reasons.push("UNCONFIRMED_SHEETS_OUTCOME");
  if (e.countCommittedTxRows === 1 && (e.txRowSaveTo !== e.expectedSaveTo ||
      e.liveControlSaveId !== e.expectedSaveTo))
    reasons.push("COMMITTED_SAVE_MISMATCH");
  const markers = new Set(e.docsWithTxMarker);
  const missing = [...new Set(e.requiredDocs)].filter(x => !markers.has(x));
  if (missing.length) reasons.push("DOC_TX_MARKERS_MISSING");
  return {
    schema: "NPC_HEAT_TEST_WRITER_RECOVERY_REVIEW_V1" as const,
    status: reasons.length ? "BLOCKED" as const : "MANUAL_OPERATOR_REVIEW_ONLY" as const,
    reasons,
    missingDocumentMarkerCount: missing.length,
    programmaticUnlockAllowed: false as const,
    automaticLeaseExpirationAllowed: false as const,
    previousWriterProvenStopped: false as const,
    note: "No automatic unlock. Even clean source snapshots do not prove a suspended instance is gone.",
  };
}
