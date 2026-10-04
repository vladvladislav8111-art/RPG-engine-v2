export type TurnClass = "MICRO" | "NORMAL" | "COMPLEX" | "HIGH_STAKES";

export type SheetLookup = {
  source: "TEMP_RUNTIME" | "GM_PREGEN";
  sheet: string;
  range: string;
  query?: string;
};

export type DocKey =
  | "LIVE_CANON_INDEX"
  | "LIVE_PLAYER_INVENTORY"
  | "LIVE_JOURNAL_LANGUAGE_DISCOVERIES"
  | "LIVE_NPCS_KNOWLEDGE_SOCIAL"
  | "LIVE_MAPS_LOCATIONS_STATE"
  | "LIVE_WORLD_OPPORTUNITIES"
  | "LIVE_PROJECTS_LONGFORM"
  | "LIVE_SESSION_LOG"
  | "LIVE_TRANSACTION_ARCHIVE";

export type DocQuery = {
  documentKey: DocKey;
  query: string;
  maxMatches?: number;
};

export type TurnContextRequest = {
  turnId: string;
  turnClass: TurnClass;
  tags?: string[];
  actorIds?: string[];
  lookups?: SheetLookup[];
  docQueries?: DocQuery[];
};

export type SheetWrite = {
  range: string;
  values: Array<Array<string | number | boolean | null>>;
};

export type Precondition = {
  range: string;
  equals: string | number | boolean | null;
};

export type DocAppend = {
  documentKey: DocKey;
  text: string;
};

export type CommitRequest = {
  turnId: string;
  txId: string;
  expectedSaveId: string;
  saveTo: string;
  preconditions?: Precondition[];
  sheetWrites?: SheetWrite[];
  docAppends?: DocAppend[];
  dryRun?: boolean;
};
