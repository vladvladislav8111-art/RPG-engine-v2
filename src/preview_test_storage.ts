import type { DocKey } from "./types.ts";

/**
 * Test-only fixture routing. An exact synthetic TEMP_RUNTIME_ID is the sole
 * selector: no Deno Preview env-variable duplication or production fallback.
 * Values below are non-secret IDs for isolated files owned by the project.
 */
export const PREVIEW_TEST_TEMP_RUNTIME_ID = "1nUFbBxJy5dbkGmhaNqyOwPMIrso5_PBqJ_BmQ_-Y2T8";

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


const fixtureTargets = new Set<string>([PREVIEW_TEST_TEMP_RUNTIME_ID, ...Object.values(PREVIEW_TEST_DOC_IDS)]);
export const testPreviewTimeline=(s:string)=>s.startsWith("preview/")||s.startsWith("git-branch/");
export const testPreviewStorage=(timeline:string,tempId:string)=>
  testPreviewTimeline(timeline) && tempId===PREVIEW_TEST_TEMP_RUNTIME_ID;
export function resolveTestDoc(timeline:string,tempId:string,key:DocKey,defaultId:string):string {
  return testPreviewStorage(timeline,tempId)?PREVIEW_TEST_DOC_IDS[key]:defaultId;
}
/** Fail closed for synthetic workbook irrespective of timeline and caller. */
export function assertTestGoogleTarget(tempId:string,targetId:string,intent:"read"|"write",gmPregenId:string){
  if(tempId!==PREVIEW_TEST_TEMP_RUNTIME_ID)return;
  if(fixtureTargets.has(targetId))return;
  if(intent==="read" && targetId===gmPregenId)return;
  throw Error("TEST_PREVIEW_GOOGLE_SCOPE_VIOLATION");
}
export function testDocsPinned(files:Record<DocKey,string>):boolean{
  return (Object.keys(PREVIEW_TEST_DOC_IDS) as DocKey[])
    .every(k=>files[k]===PREVIEW_TEST_DOC_IDS[k]);
}
