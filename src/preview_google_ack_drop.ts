/**
 * A single **fixed TEST-only** post-Google-success fault.
 * Called only AFTER Sheets API returns success. We intentionally discard the
 * writer's ACK before Docs and verification. No transport spoofing: this
 * simulates lost confirmation at the writer boundary, not an actual network
 * failure. The permanent KV lock MUST stay held.
 */
import { PREVIEW_TEST_TEMP_RUNTIME_ID, testPreviewTimeline } from "./preview_test_storage.ts";

export const TEST_ACK_DROP_TX = "TEST-NPC-HEAT-V2-ACK-DROP-20261012-001";
export const TEST_ACK_DROP_TURN = "TEST-NPC-HEAT-V2-ACK-DROP-TURN-001";
export const TEST_ACK_DROP_SAVE_FROM = "TEST-S3";
export const TEST_ACK_DROP_SAVE_TO = "TEST-S4";
export const TEST_ACK_DROP_ERROR = "TEST_POST_SHEETS_SUCCESS_ACK_INTENTIONALLY_LOST";

export type FaultContext = {
  enabled:boolean;timeline:string;allowWrites:boolean;allowRawCommits:boolean;
  testWriterEnabled:boolean;enableKv:boolean;
  workbookId:string;isolatedWorkbookId:string;
  txId:string;turnId:string;expectedSaveId:string;saveTo:string;
  isSemantic:boolean;source?:string;
};

export function shouldInjectTestAckDrop(c:FaultContext):boolean {
  return c.enabled===true && testPreviewTimeline(c.timeline) &&
    c.allowWrites===true && c.allowRawCommits===false &&
    c.testWriterEnabled===true && c.enableKv===true &&
    c.workbookId===PREVIEW_TEST_TEMP_RUNTIME_ID &&
    c.isolatedWorkbookId===PREVIEW_TEST_TEMP_RUNTIME_ID &&
    c.txId===TEST_ACK_DROP_TX && c.turnId===TEST_ACK_DROP_TURN &&
    c.expectedSaveId===TEST_ACK_DROP_SAVE_FROM &&
    c.saveTo===TEST_ACK_DROP_SAVE_TO && c.isSemantic===true &&
    c.source==="ENGINE_FASTPATH";
}
export function throwAfterConfirmedTestSheetsWrite(c:FaultContext):void {
  if(shouldInjectTestAckDrop(c))throw new Error(TEST_ACK_DROP_ERROR);
}
