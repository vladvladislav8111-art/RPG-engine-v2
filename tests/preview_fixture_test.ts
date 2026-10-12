import { assertEquals, assertThrows } from "jsr:@std/assert";
import {
  assertFixtureGoogleTarget,
  isIsolatedPreviewFixture,
  PREVIEW_TEST_DOC_IDS,
  PREVIEW_TEST_SAVE_ID,
  PREVIEW_TEST_TEMP_RUNTIME_ID,
  resolveDocIdForRuntime,
} from "../src/preview_fixture.ts";

Deno.test("synthetic test workbook selects pinned test Docs without consulting inherited All", () => {
  assertEquals(PREVIEW_TEST_SAVE_ID, "TEST-S1");
  assertEquals(isIsolatedPreviewFixture(PREVIEW_TEST_TEMP_RUNTIME_ID), true);
  assertEquals(Object.keys(PREVIEW_TEST_DOC_IDS).length, 9);
  for (const [key, id] of Object.entries(PREVIEW_TEST_DOC_IDS)) {
    let called = false;
    const selected = resolveDocIdForRuntime(
      PREVIEW_TEST_TEMP_RUNTIME_ID,
      key as keyof typeof PREVIEW_TEST_DOC_IDS,
      () => { called = true; return "PRODUCTION_SECRET_DOC_ID"; },
    );
    assertEquals(selected, id);
    assertEquals(called, false);
    assertFixtureGoogleTarget(PREVIEW_TEST_TEMP_RUNTIME_ID, id, "read", "PREGEN_READ_ONLY");
    assertFixtureGoogleTarget(PREVIEW_TEST_TEMP_RUNTIME_ID, id, "write", "PREGEN_READ_ONLY");
  }
  assertFixtureGoogleTarget(PREVIEW_TEST_TEMP_RUNTIME_ID, PREVIEW_TEST_TEMP_RUNTIME_ID, "write", "PREGEN_READ_ONLY");
});

Deno.test("test runtime fails closed on any production file write or unrelated reads", () => {
  for (const intent of ["read", "write"] as const) {
    assertThrows(
      () => assertFixtureGoogleTarget(PREVIEW_TEST_TEMP_RUNTIME_ID, "PRODUCTION_SHEET_ID", intent, "PREGEN_READ_ONLY"),
      Error, "PREVIEW_FIXTURE_STORAGE_SCOPE_VIOLATION",
    );
  }
  // GM PREGEN is a read-only source: may be used for rules, never for writes.
  assertFixtureGoogleTarget(PREVIEW_TEST_TEMP_RUNTIME_ID, "PREGEN_READ_ONLY", "read", "PREGEN_READ_ONLY");
  assertThrows(
    () => assertFixtureGoogleTarget(PREVIEW_TEST_TEMP_RUNTIME_ID, "PREGEN_READ_ONLY", "write", "PREGEN_READ_ONLY"),
    Error, "PREVIEW_FIXTURE_STORAGE_SCOPE_VIOLATION",
  );
});

Deno.test("production retains actual env Docs IDs and existing routing without fixture interference", () => {
  const productionRuntime = "REAL_PRODUCTION_SHEET_ID";
  assertEquals(isIsolatedPreviewFixture(productionRuntime), false);
  assertEquals(
    resolveDocIdForRuntime(productionRuntime, "LIVE_SESSION_LOG", () => "LIVE_LOG_ID"),
    "LIVE_LOG_ID",
  );
  assertFixtureGoogleTarget(productionRuntime, "LIVE_LOG_ID", "write", "GM_PREGEN_ID");
});
