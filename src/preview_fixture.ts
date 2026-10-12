import type { DocKey } from "./types.ts";

/**
 * Test-only fixture routing. An exact synthetic TEMP_RUNTIME_ID is the sole
 * selector: no Deno Preview env-variable duplication or production fallback.
 * Values below are non-secret IDs for isolated files owned by the project.
 */
export const PREVIEW_TEST_TEMP_RUNTIME_ID = "1nUFbBxJy5dbkGmhaNqyOwPMIrso5_PBqJ_BmQ_-Y2T8";
export const PREVIEW_TEST_SAVE_ID = "TEST-S1";

export const PREVIEW_TEST_DOC_IDS: Readonly<Record<DocKey, string>> = Object.freeze({
  LIVE_CANON_INDEX: "1pioMqAJHSTkXDyoiiiQxNWeF3m0loY_ICYYa-C_v7ZQ",
  LIVE_PLAYER_INVENTORY: "1PmgMEQy71s406NHwZXF13KdXx2LLU3hSOGvRlmU9jYA",
  LIVE_JOURNAL_LANGUAGE_DISCOVERIES: "1GqDjr2soEmrEIIWFd0XUZovgI_VNlUxJeptQ8-OVmkg",
  LIVE_NPCS_KNOWLEDGE_SOCIAL: "1DlNErF3fnCpAGsrfvqvrQFIwfhegLRhp1VVbIpuXmGQ",
  LIVE_MAPS_LOCATIONS_STATE: "1xt8buW6qBCL8XdZLxEyheQWNTG7WYVHHq6XH7wXIXUU",
  LIVE_WORLD_OPPORTUNITIES: "14T2cN46jpMbJerQcT0kvmXIXSt03RKVw0bfNWcdvf6o",
  LIVE_PROJECTS_LONGFORM: "1P8q4NCdvVdrukNaYiS3Ezu8dbd4M8P3Rrn7mg45CrO8",
  LIVE_SESSION_LOG: "12_vCO3B2HLeC1u7l6P6iKEmUZPTOXXn4MPLHQeaOgKc",
  LIVE_TRANSACTION_ARCHIVE: "1nyLt8HXNKIkr50cDCabBz774AgWZbvXg2saHQvpPOGo",
});

const previewWriteTargets = new Set<string>([
  PREVIEW_TEST_TEMP_RUNTIME_ID,
  ...Object.values(PREVIEW_TEST_DOC_IDS),
]);

export function isIsolatedPreviewFixture(tempRuntimeId: string): boolean {
  return tempRuntimeId === PREVIEW_TEST_TEMP_RUNTIME_ID;
}

/** No inherited "All" LIVE_* env value may ever override a synthetic test target. */
export function resolveDocIdForRuntime(
  tempRuntimeId: string,
  key: DocKey,
  nonFixtureDocId: () => string,
): string {
  return isIsolatedPreviewFixture(tempRuntimeId)
    ? PREVIEW_TEST_DOC_IDS[key]
    : nonFixtureDocId();
}

/**
 * Defense in depth: even accidental raw writer calls cannot use the live
 * production spreadsheet or Docs IDs from a test-fixture runtime.
 * GM PREGEN is intentionally allowed for read-only canonical templates.
 */
export function assertFixtureGoogleTarget(
  tempRuntimeId: string,
  fileId: string,
  intent: "read" | "write",
  gmPregenId: string,
): void {
  if (!isIsolatedPreviewFixture(tempRuntimeId)) return;
  const approved = previewWriteTargets.has(fileId);
  if (approved || (intent === "read" && fileId === gmPregenId)) return;
  throw new Error("PREVIEW_FIXTURE_STORAGE_SCOPE_VIOLATION");
}
