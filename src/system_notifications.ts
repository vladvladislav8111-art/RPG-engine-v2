/** Presentation-only level events reconstructed from a single semantic transaction.
 * Emit ONLY after the successful writer commit; dry-run drafts are not achievements.
 * The underlying XP rows and txId remain the durable replay evidence.
 */
type LevelOutcome = {
  oldLevel: number;
  newLevel: number;
  crossedLevels?: number[];
  competenceId?: string;
  specialization?: {specialization?:string;oldStars?:number;stars?:number}|null;
};
export function proposeSystemLevelEvents(input: {
  txId:string;
  generalXp:readonly LevelOutcome[];
  learning:readonly LevelOutcome[];
}) {
  const result: Array<{
    id:string;kind:string;sourceTx:string;level:number;subject:string;
    message:string;requiresCommittedWriter:true;
  }> = [];
  input.generalXp.forEach((outcome,index) => {
    for (const level of outcome.crossedLevels ?? []) {
      if (level <= outcome.oldLevel || level > outcome.newLevel) continue;
      result.push({id:`system.event.${input.txId}.general.${index+1}.lv${level}`,
        kind:"GENERAL_LEVEL_UP",sourceTx:input.txId,level,
        subject:"player.shura",message:`Общий уровень повышен до ${level}`,
        requiresCommittedWriter:true});
    }
  });
  input.learning.forEach((outcome,index) => {
    for (const level of outcome.crossedLevels ?? []) {
      if (level <= outcome.oldLevel || level > outcome.newLevel) continue;
      result.push({id:`system.event.${input.txId}.competence.${index+1}.lv${level}`,
        kind:"COMPETENCE_LEVEL_UP",sourceTx:input.txId,level,
        subject:outcome.competenceId ?? "unknown",
        message:`Компетенция ${outcome.competenceId ?? ""}: уровень ${level}`,
        requiresCommittedWriter:true});
    }
    const spec=outcome.specialization;
    if (spec && typeof spec.stars === "number" && typeof spec.oldStars === "number") {
      for (let star=spec.oldStars+1;star<=spec.stars;star++) {
        result.push({id:`system.event.${input.txId}.specialization.${index+1}.star${star}`,
          kind:"SPECIALIZATION_STAR_UP",sourceTx:input.txId,level:star,
          subject:spec.specialization??"unknown",
          message:`Специализация ${spec.specialization??""}: ${star}★`,
          requiresCommittedWriter:true});
      }
    }
  });
  return result;
}
