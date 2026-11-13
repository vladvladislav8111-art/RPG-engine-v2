/**
 * NPC Life V4 add-on: language/pragmatics boundary and candidate conversation responses.
 * This module NEVER infers canonical feelings, grants shared knowledge, writes game state,
 * or generates the NPC's actual line. The GM models meaning, the engine checks provenance.
 */
export type PragmaticReadingKind =
  | 'LITERAL' | 'IRONY' | 'SARCASM' | 'TEASING' | 'FLIRT'
  | 'DOUBLE_MEANING' | 'CULTURAL_REFERENCE' | 'HUMOROUS_TONE'
  | 'IMPLIED_REQUEST' | 'AMBIGUOUS';
export type PragmaticReading = {
  id: string;
  kind: PragmaticReadingKind;
  evidenceRef: string;
  requiresSharedKnowledge: boolean;
  verifiedNpcKnowledgeRef?: string;
  requiresLexicalComprehension: boolean;
};
export type NpcPragmaticsRequest = {
  actorId: string;
  speakerId: string;
  utteranceRef: string;
  perceivedByNpc: boolean;
  languageComprehension: 'UNDERSTOOD' | 'PARTIAL' | 'NOT_UNDERSTOOD' | 'UNKNOWN';
  contextSourceRefs: string[];
  candidateReadings: PragmaticReading[];
};
export type ReadingAssessment = {
  id: string;
  kind: PragmaticReadingKind;
  evidenceRef: string;
  status: 'CANDIDATE_FOR_GM' | 'BLOCKED';
  reason: string;
};
export type NpcPragmaticsResult = {
  ok: true;
  schema: 'NPC_PRAGMATICS_V1_PROPOSAL';
  actorId: string;
  sourceAttested: false;
  committed: false;
  npcUnderstoodJoke: false;
  speechChosen: false;
  emotionalChangeRecorded: false;
  candidateReadings: ReadingAssessment[];
  candidateResponses: string[];
  constraints: string[];
};
export type NpcPragmaticsError = {ok: false; code: string; reason: string};
const id = (x: unknown) => typeof x === 'string' && /^[A-Za-z0-9_.:-]{3,180}$/.test(x);
const distinct = (xs: readonly string[]) => new Set(xs).size === xs.length;
const kinds = new Set<PragmaticReadingKind>([
  'LITERAL','IRONY','SARCASM','TEASING','FLIRT','DOUBLE_MEANING',
  'CULTURAL_REFERENCE','HUMOROUS_TONE','IMPLIED_REQUEST','AMBIGUOUS',
]);
const invalid = (code: string, reason: string): NpcPragmaticsError => ({ok:false,code,reason});
export function reviewNpcPragmaticsV1(x: NpcPragmaticsRequest): NpcPragmaticsResult | NpcPragmaticsError {
  if (!x || !id(x.actorId) || !id(x.speakerId) || x.actorId === x.speakerId ||
      !id(x.utteranceRef) || typeof x.perceivedByNpc !== 'boolean' ||
      !['UNDERSTOOD','PARTIAL','NOT_UNDERSTOOD','UNKNOWN'].includes(x.languageComprehension))
    return invalid('NPC_PRAGMATICS_BAD_ACTORS', 'Verified speaker, addressee, perception and language status required');
  if (!Array.isArray(x.contextSourceRefs) || !x.contextSourceRefs.length ||
      x.contextSourceRefs.length > 16 || !x.contextSourceRefs.every(id) ||
      !distinct(x.contextSourceRefs) || !Array.isArray(x.candidateReadings) ||
      x.candidateReadings.length > 12 || !distinct(x.candidateReadings.map(r => r.id)))
    return invalid('NPC_PRAGMATICS_BAD_CONTEXT', 'Bounded distinct source references and readings required');
  for (const r of x.candidateReadings) {
    if (!r || !id(r.id) || !kinds.has(r.kind) || !id(r.evidenceRef) ||
        typeof r.requiresSharedKnowledge !== 'boolean' ||
        typeof r.requiresLexicalComprehension !== 'boolean' ||
        (r.verifiedNpcKnowledgeRef !== undefined && !id(r.verifiedNpcKnowledgeRef)))
      return invalid('NPC_PRAGMATICS_BAD_READING', 'Readings need a kind, provenance, and knowledge/language gates');
  }
  const candidateReadings = x.candidateReadings.map(r => {
    let reason = 'Possible interpretation: GM must choose based on canonical personality and actual scene';
    let status: ReadingAssessment['status'] = 'CANDIDATE_FOR_GM';
    if (!x.perceivedByNpc) {status = 'BLOCKED'; reason = 'NPC did not perceive the utterance';}
    else if (r.requiresLexicalComprehension &&
      (x.languageComprehension === 'NOT_UNDERSTOOD' || x.languageComprehension === 'UNKNOWN')) {
      status = 'BLOCKED'; reason = 'NPC lexical comprehension not established';
    } else if (r.requiresSharedKnowledge && !r.verifiedNpcKnowledgeRef) {
      status = 'BLOCKED'; reason = 'Shared cultural/factual knowledge not evidenced';
    } else if (x.languageComprehension === 'PARTIAL' && r.requiresLexicalComprehension) {
      reason = 'PARTIAL language: candidate only, verify actually understood fragments';
    }
    return {id:r.id,kind:r.kind,evidenceRef:r.evidenceRef,status,reason};
  });
  const eligible = candidateReadings.filter(r => r.status === 'CANDIDATE_FOR_GM');
  const candidateResponses = !x.perceivedByNpc ? ['NO_RESPONSE_NO_PERCEPTION'] : [
    'NO_REPLY_OR_CONTINUE_OWN_ACTIVITY', 'ASK_CLARIFICATION', 'ANSWER_LITERAL_LEVEL',
    ...(eligible.length ? ['PLAY_ALONG_IF_CHARACTER_FITS','COUNTER_JOKE_IF_CHARACTER_FITS','DEFLECT_OR_IGNORE_SUBTEXT'] : []),
    'ASSERT_BOUNDARY_IF_MOTIVATED',
  ];
  return {
    ok:true,schema:'NPC_PRAGMATICS_V1_PROPOSAL',actorId:x.actorId,
    sourceAttested:false,committed:false,npcUnderstoodJoke:false,speechChosen:false,
    emotionalChangeRecorded:false,candidateReadings,candidateResponses,
    constraints:[
      'SourceRef and verifiedNpcKnowledgeRef are caller claims until checked against committed canon',
      'Cultural reference knowledge cannot transfer across worlds automatically',
      'Recognizing humorous tone is not recognizing the words or reference',
      'No fixed personality scores, scripted lines, forced jokes or mandatory responses',
      'Use Life V4 actor goals, relationship direction, fatigue and current availability',
      'NPC actions and enduring changes need independent GM resolution and semantic commit',
    ],
  };
}
