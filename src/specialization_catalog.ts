export type CanonicalSpecialization = {
  assetId: string;
  competenceId: string;
  runtimeName: string;
  observerRequired: boolean;
  state: string;
};

export function parseCanonicalSpecializations(rows: unknown[][]): CanonicalSpecialization[] {
  const h = rows[0]?.map(x=>String(x??""))??[];
  const col=(key:string)=>{const i=h.indexOf(key); if(i<0)throw new Error("Missing "+key); return i;};
  const iId=col("Canonical asset ID"), iComp=col("Competence ID"), iName=col("Runtime name");
  const iObs=col("Observer required"), iState=col("Catalog state");
  const found=new Set<string>();
  return rows.slice(1).filter(r=>r[iId]).map(r=>{
    const assetId=String(r[iId]),competenceId=String(r[iComp]),runtimeName=String(r[iName]);
    const key=competenceId+"::"+runtimeName;
    if(found.has(key))throw new Error("Duplicate specialization "+key);
    found.add(key);
    return {assetId,competenceId,runtimeName,observerRequired:String(r[iObs]).toUpperCase()==="YES",state:String(r[iState])};
  });
}

export type UnlockProposal = {
  catalogId: string;
  playerIntent: string;
  trainingEvidence: string;
  evidenceRef: string;
  observerNpcId?: string;
};

export type LearningProof = {
  competenceId: string;
  specialization?: string;
  productiveMinutes: number;
  reason?: string;
  exactSpecializationProgressOverride?: number;
};

export function validateSpecializationAcquisition(input: {
  catalog: CanonicalSpecialization[];
  proposal: UnlockProposal;
  learningEvents: LearningProof[];
  elapsedSeconds: number;
  presentObserverNpcIds: string[];
  existingSpecializations: Array<{ competenceId: string; runtimeName: string }>;
}): CanonicalSpecialization {
  const entry = input.catalog.find(x=>x.assetId===input.proposal.catalogId);
  if (!entry || entry.state!=="UNLOCKABLE_CANON") {
    throw new Error("Unknown or inactive canonical specialization");
  }
  const p=input.proposal;
  if (p.playerIntent.trim().length<5 || p.trainingEvidence.trim().length<24 ||
    p.evidenceRef.trim().length<8) {
    throw new Error("Acquisition requires player-directed practice and real evidence");
  }
  if (input.existingSpecializations.some(x=>
    x.competenceId===entry.competenceId && x.runtimeName===entry.runtimeName)) {
    throw new Error("Specialization already acquired");
  }
  if (entry.observerRequired && (!p.observerNpcId ||
    !input.presentObserverNpcIds.includes(p.observerNpcId))) {
    throw new Error("Sleight-of-hand requires a present real observer");
  }
  const matches=input.learningEvents.filter(x=>
    x.competenceId===entry.competenceId && x.specialization===entry.runtimeName);
  if (matches.length!==1) throw new Error("Exactly one matched current learning event is required");
  const learning=matches[0];
  if (!Number.isFinite(learning.productiveMinutes) || learning.productiveMinutes<5 ||
    !Number.isFinite(input.elapsedSeconds) ||
    input.elapsedSeconds<learning.productiveMinutes*60) {
    throw new Error("Current actual elapsed time must cover the learning attempt");
  }
  if ((learning.reason??"").trim().length<20) throw new Error("Learning evidence is too vague");
  if (learning.exactSpecializationProgressOverride!==undefined &&
    (!Number.isFinite(learning.exactSpecializationProgressOverride) ||
      learning.exactSpecializationProgressOverride<=0)) {
    throw new Error("Initial progress cannot be nonpositive");
  }
  return entry;
}
