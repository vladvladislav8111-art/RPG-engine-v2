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
  actorRefs?: string[];
  recentChatLimit?: number;
  requireNpcContextGate?: boolean;
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
export type AdaptationBand = "trace" | "useful" | "substantial" | "major" | "exceptional";
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

export type SemanticExertionEvent = {
  actionId: string;
  durationMinutes?: number;
  count?: number;
  loadMultiplier?: number;
  environmentMultiplier?: number;
  conditionMultiplier?: number;
  recoveryMultiplier?: number;
  explicitEfficiencyMultiplier?: number;
  explicitCeilingMultiplier?: number;
  allowForcedExertion?: boolean;
  reason?: string;
};

export type SemanticRestEvent = {
  restId: "rest.break" | "rest.short" | "rest.full";
  durationMinutes: number;
  recoveryMultiplier?: number;
  usefulSleep?: boolean;
  reason?: string;
};

export type SemanticInjuryEvent = {
  injuryId?: string;
  targetEntityId?: string;
  seed: string;
  weaponForce: "light" | "solid" | "heavy" | "extreme";
  hitQuality: "glancing" | "ordinary" | "direct" | "exceptional";
  location: "head_face" | "neck" | "torso_chest" | "torso_abdomen" | "arm" | "hand" | "leg" | "foot";
  armorMitigation?: number;
  tags?: string[];
  toxin?: {
    class: "weak" | "medium" | "strong" | "extreme";
    doseModifier?: number;
    deliveryModifier?: number;
    specificImmunity?: number;
    protection?: number;
  };
  simulationOnly?: boolean;
  reason?: string;
};

export type SemanticAdaptationEvent = {
  characteristic: string;
  band: AdaptationBand;
  secondary?: boolean;
  exactUnitsOverride?: number;
  reason: string;
  evidence?: string;
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

export type SemanticInventoryEvent = {
  itemId: string;
  qtyDelta?: number;
  qtySet?: number;
  templateId?: string;
  item?: string;
  unit?: string;
  location?: string;
  custodian?: string;
  conditionNotes?: string;
  tags?: string;
  lastUpdated?: string;
  massKgOverride?: number | null;
  volumeLOverride?: number | null;
  reason?: string;
};

export type SemanticRelationshipEvent = {
  operation?: "UPSERT" | "RETIRE";
  relationshipId: string;
  actorId: string;
  towardId: string;
  trust?: string;
  respect?: string;
  warmth?: string;
  fear?: string;
  tension?: string;
  obligationDebt?: string;
  economicInterest?: string;
  valueCompatibility?: string;
  currentStance?: string;
  evidenceRefs?: string[];
  lastChanged?: string;
  lastEvaluated?: string;
  status?: "ACTIVE" | "DORMANT";
  notes?: string;
};

export type SemanticSocialMemoryEvent = {
  operation?: "UPSERT" | "TOUCH" | "RETIRE";
  memoryId: string;
  participants?: string[];
  originEvent?: string;
  meaning?: string;
  whoUnderstands?: string[];
  emotionalTone?: string;
  recurrenceDelta?: number;
  lastUsed?: string;
  importance?: "ROUTINE" | "IMPORTANT" | "ANCHOR";
  source?: string;
  tags?: string[];
  notes?: string;
};

export type SemanticThreadEvent = {
  operation: "OPEN" | "UPDATE" | "RESOLVE" | "EXPIRE";
  threadId: string;
  participants?: string[];
  topic?: string;
  summary?: string;
  openedAt?: string;
  lastTouched?: string;
  waitingOn?: string;
  triggerDue?: string;
  importance?: "ROUTINE" | "IMPORTANT";
  promoteTarget?: "NONE" | "SOCIAL_MEMORY" | "NPC_KNOWLEDGE" | "CANON";
  promoteRef?: string;
  source?: string;
  tags?: string[];
  notes?: string;
};

export type SemanticChatEvent = {
  messageId: string;
  channelId: string;
  timestamp?: string;
  senderId: string;
  receiverId: string;
  direction: "IN" | "OUT";
  text: string;
  delivery?: "QUEUED" | "SENT" | "DELIVERED" | "FAILED";
  readStatus?: "UNREAD" | "READ";
  notes?: string;
};

export type SemanticConditionSet = {
  conditionId: string;
  value: string;
  unit?: string;
  notes?: string;
  updatedAt?: string;
};

export type SemanticSurvivalActivity = "sleep" | "rest" | "normal" | "travel" | "work" | "heavy";

export type SemanticSurvivalSegment = {
  durationMinutes: number;
  activity: SemanticSurvivalActivity;
  satietyMultiplier?: number;
  hydrationMultiplier?: number;
};

export type SemanticFoodIntake = {
  foodId:
    | "food.bread_loaf"
    | "food.light_snack"
    | "food.ordinary_meal"
    | "food.substantial_meal"
    | "food.field_ration"
    | "food.fruit_portion";
  count?: number;
  satietyOverride?: number;
  hydrationOverride?: number;
};

export type SemanticSurvival = {
  segments?: SemanticSurvivalSegment[];
  defaultActivity?: SemanticSurvivalActivity;
  foodIntakes?: SemanticFoodIntake[];
  waterLiters?: number;
  heatMultiplier?: number;
};

export type StructuredRuntimeTable =
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
  | "WEATHER_CURRENT"
  | "BODY_INJURIES_CURRENT"
  | "DIVINE_ATTENTION_CURRENT"
  | "ACTIVE_CONTEXT";

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

export type SemanticRowDelete = {
  table: StructuredRuntimeTable;
  key: string;
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
  inventoryEvents?: SemanticInventoryEvent[];
  survival?: SemanticSurvival;
  choiceResolutions?: SemanticChoiceResolution[];
  exertionEvents?: SemanticExertionEvent[];
  restEvents?: SemanticRestEvent[];
  injuryEvents?: SemanticInjuryEvent[];
  generalXpEvents?: SemanticGeneralXpEvent[];
  learningEvents?: SemanticLearningEvent[];
  adaptationEvents?: SemanticAdaptationEvent[];
  relationshipEvents?: SemanticRelationshipEvent[];
  socialMemoryEvents?: SemanticSocialMemoryEvent[];
  threadEvents?: SemanticThreadEvent[];
  chatEvents?: SemanticChatEvent[];
  rowUpserts?: SemanticRowUpsert[];
  rowUpdates?: SemanticRowUpdate[];
  rowDeletes?: SemanticRowDelete[];
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
