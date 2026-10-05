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
  languageConcepts?: string[];
  includeWorldLanguage?: boolean;
};

export type Scalar = string | number | boolean | null;

export type SheetWrite = {
  range: string;
  values: Scalar[][];
};

export type Precondition = {
  range: string;
  equals: Scalar;
};

export type DocAppend = {
  documentKey: DocKey;
  text: string;
};

export type LearningBand = "tiny" | "useful" | "substantial" | "breakthrough" | "exceptional";
export type SpecializationQuality = "trace" | "useful" | "substantial" | "expert" | "breakthrough";

export type LearningModifiers = {
  novelty?: number;
  feedback?: number;
  difficulty?: number;
  repetition?: number;
  fatigue?: number;
};

export type SemanticGeneralXpEvent = {
  sourceType: "combat" | "objective" | "discovery" | "survival" | "breakthrough" | "other";
  reason: string;
  sourceRef?: string;
  exactXpOverride?: number;
  effectiveThreatRating?: number;
  contribution?: number;
  complexityBonus?: number;
  thresholdFraction?: number;
};

export type SemanticChoiceResolution = {
  choiceId: string;
  selectedOption: string;
  notes?: string;
};

export type SemanticLearningEvent = {
  competenceId: string;
  specialization?: string;
  band: LearningBand;
  productiveMinutes: number;
  modifiers?: LearningModifiers;
  exactXpOverride?: number;
  specializationQuality?: SpecializationQuality;
  exactSpecializationProgressOverride?: number;
  reason?: string;
};

export type SemanticControl = {
  worldDay?: number;
  worldTime?: string;
  locationId?: string;
  locationDisplay?: string;
  sceneId?: string;
  explorationPace?: string;
  explorationStance?: string;
};

export type SemanticResourceDelta = {
  resource: string;
  delta: number;
};

export type SemanticResourceSet = {
  resource: string;
  value: number;
};

export type SemanticConditionSet = {
  conditionId: string;
  value: string;
  unit?: string;
  notes?: string;
  updatedAt?: string;
};

export type StructuredRuntimeTable =
  | "INVENTORY_CURRENT"
  | "OPPORTUNITIES_CURRENT"
  | "PROJECTS_CURRENT"
  | "NPC_CURRENT"
  | "NPC_KNOWLEDGE"
  | "PLAYER_LANGUAGE"
  | "PLAYER_LEXICON"
  | "PLAYER_GRAMMAR"
  | "SERVICES_CURRENT"
  | "MAP_KNOWLEDGE_CURRENT"
  | "ENTITY_INDEX"
  | "MILESTONES"
  | "WORLD_CLOCKS"
  | "WEATHER_CURRENT";

export type SemanticRowUpsert = {
  table: StructuredRuntimeTable;
  key: string;
  values: Record<string, Scalar>;
};

export type SemanticRowUpdate = {
  table: StructuredRuntimeTable;
  key: string;
  patch: Record<string, Scalar>;
};

export type SemanticSessionRecord = {
  inworldStart: string;
  inworldEnd?: string;
  sceneId?: string;
  actionSummary: string;
  deltas?: unknown;
  newCanon?: unknown;
  worldAdvances?: unknown;
  notes?: string;
  source?: string;
};

export type SemanticCommitPlan = {
  turnToken?: string;
  elapsedSeconds?: number;
  control?: SemanticControl;
  resourceDeltas?: SemanticResourceDelta[];
  resourceSets?: SemanticResourceSet[];
  conditions?: SemanticConditionSet[];
  choiceResolutions?: SemanticChoiceResolution[];
  generalXpEvents?: SemanticGeneralXpEvent[];
  learningEvents?: SemanticLearningEvent[];
  rowUpserts?: SemanticRowUpsert[];
  rowUpdates?: SemanticRowUpdate[];
  session: SemanticSessionRecord;
};

export type CommitRequest = {
  turnId: string;
  txId: string;
  expectedSaveId: string;
  saveTo: string;
  preconditions?: Precondition[];
  sheetWrites?: SheetWrite[];
  docAppends?: DocAppend[];
  semantic?: SemanticCommitPlan;
  dryRun?: boolean;
};
