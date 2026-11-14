/** Persistent, per-NPC and per-feature familiarity.
 * Witnessed features never become shared knowledge merely because another NPC
 * sees the subject. Emotional interpretations remain subjective.
 */
export type Familiarity="unfamiliar"|"recognizes"|"accustomed"|"adapted";
export type NpcFeatureMemory={
 featureId:string;firstSeenRef?:string;lastSeenRef?:string;
 notices:number;exposureWeight:number;familiarity:Familiarity;
 lastInterpretation?:string;lastReaction?:string;lastHeardRef?:string;
 heardFrom?:string;heardCount:number;privacy:"public"|"small_group"|"private";
};
export type NpcFeatureObservation={
 npcId:string;featureId:string;
 channel:"seen"|"report";significance?:"routine"|"notable"|"transformative";
 interpretation?:string;reaction?:string;
 privacy:"public"|"small_group"|"private";
 sourceActor?:string;relayedSourceRef?:string;
};
const validId=(x:unknown):x is string=>typeof x==="string"&&
 /^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(x)&&
 !["constructor","prototype","__proto__"].includes(x);
const weight={routine:1,notable:2,transformative:3} as const;
export function familiarityFor(weight:number):Familiarity{
 return weight>=7?"adapted":weight>=3?"accustomed":weight>=1?"recognizes":"unfamiliar";
}
export function validateFeatureMemory(x:NpcFeatureMemory){
 if(!x||!validId(x.featureId)||!Number.isInteger(x.notices)||x.notices<0||x.notices>128||
   !Number.isInteger(x.heardCount)||x.heardCount<0||x.heardCount>128||
   !Number.isInteger(x.exposureWeight)||x.exposureWeight<0||x.exposureWeight>384||
   x.familiarity!==familiarityFor(x.exposureWeight)||
   !["public","small_group","private"].includes(x.privacy)||
   (x.notices===0&&(x.firstSeenRef!==undefined||x.lastSeenRef!==undefined))||
   (x.notices>0&&(!validId(x.firstSeenRef)||!validId(x.lastSeenRef))))
  throw Error("LAB_FEATURE_STATE_INVALID");
 for(const field of ["lastInterpretation","lastReaction"] as const)
  if(x[field]!==undefined&&(typeof x[field]!=="string"||x[field]!.length>300))
   throw Error("LAB_FEATURE_STATE_TEXT_INVALID");
 for(const field of ["lastHeardRef","heardFrom"] as const)
  if(x[field]!==undefined&&!validId(x[field]))throw Error("LAB_FEATURE_STATE_SOURCE_INVALID");
 return x;
}
export function noteNpcFeature(
 existing:NpcFeatureMemory|undefined,observation:NpcFeatureObservation,
 sourceRef:string,knownBy:readonly string[],
 evidence:{hasSourceObserved:(actor:string,featureId:string,ref:string)=>boolean}
):NpcFeatureMemory{
 if(!validId(sourceRef)||!validId(observation.npcId)||!validId(observation.featureId)||
  !["seen","report"].includes(observation.channel)||
  !["public","small_group","private"].includes(observation.privacy))
  throw Error("LAB_FEATURE_OBSERVATION_INVALID");
 for(const field of ["reaction","interpretation"] as const)
  if(observation[field]!==undefined&&(typeof observation[field]!=="string"||
      observation[field]!.length>300))throw Error("LAB_FEATURE_OBSERVATION_TEXT_INVALID");
 const old=existing??{featureId:observation.featureId,notices:0,exposureWeight:0,
    familiarity:"unfamiliar" as const,heardCount:0,privacy:observation.privacy};
 validateFeatureMemory(old);
 if(old.featureId!==observation.featureId)throw Error("LAB_FEATURE_ID_MISMATCH");
 if(observation.channel==="seen"){
  if(!knownBy.includes(observation.npcId))throw Error("LAB_FEATURE_NOT_WITNESSED");
  const importance=observation.significance??"routine";
  if(!(importance in weight))throw Error("LAB_FEATURE_SIGNIFICANCE");
  if(old.notices>=128)throw Error("LAB_FEATURE_EXPOSURE_LIMIT");
  const exposure=old.exposureWeight+weight[importance];
  return validateFeatureMemory({...old,notices:old.notices+1,
   exposureWeight:exposure,familiarity:familiarityFor(exposure),
   firstSeenRef:old.firstSeenRef??sourceRef,lastSeenRef:sourceRef,
   ...(observation.interpretation?{lastInterpretation:observation.interpretation}:{}),
   ...(observation.reaction?{lastReaction:observation.reaction}:{}),
   privacy:observation.privacy});
 }
 if(!validId(observation.sourceActor)||observation.sourceActor===observation.npcId||
    !validId(observation.relayedSourceRef)||
    !evidence.hasSourceObserved(observation.sourceActor,observation.featureId,observation.relayedSourceRef))
  throw Error("LAB_FEATURE_UNVERIFIED_RELAY");
 if(old.heardCount>=128)throw Error("LAB_FEATURE_HEARSAY_LIMIT");
 return validateFeatureMemory({...old,heardCount:old.heardCount+1,
  lastHeardRef:sourceRef,heardFrom:observation.sourceActor,
  ...(observation.interpretation?{lastInterpretation:observation.interpretation}:{}),
  ...(observation.reaction?{lastReaction:observation.reaction}:{}),
  privacy:observation.privacy});
}
export function featureReview(perceptions:Record<string,NpcFeatureMemory>|undefined,includePrivate=false){
 return Object.values(perceptions??{}).filter(f=>includePrivate||f.privacy==="public")
  .map(f=>({featureId:f.featureId,notices:f.notices,
   heardCount:f.heardCount,familiarity:f.familiarity,
   firstSeenRef:f.firstSeenRef??null,lastSeenRef:f.lastSeenRef??null,
   sourceOnlyReported:f.notices===0&&f.heardCount>0,
   lastInterpretation:f.lastInterpretation??null,lastReaction:f.lastReaction??null,
   privacy:f.privacy,automaticEmotion:false,subjective:true}));
}
