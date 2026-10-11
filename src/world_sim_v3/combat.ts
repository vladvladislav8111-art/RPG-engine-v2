import {deny,finite,pass,type SimOutcome} from './types.ts';
export type AttackFrame={distanceCm:number;reachCm:number;lineOfEffect:boolean;staminaNow:number;staminaCost:number;attackForce:number;armorAbsorption:number;targetExposed:boolean;uncertain:boolean;uncertaintySeed?:string};
export type CombatAdjudication={physicallyPossible:boolean;staminaRequired:number;residualForceScore:number;requiresUncertaintyResolution:boolean;injuryResolved:false;};
/** Physical feasibility check; only GM+existing injury engine determine hit/injury. */
export function adjudicateAttack(frame:AttackFrame):SimOutcome<CombatAdjudication>{
 for(const k of ['distanceCm','reachCm','staminaNow','staminaCost','attackForce','armorAbsorption'] as const)finite(frame[k],k);
 if(frame.distanceCm>frame.reachCm)return deny('OUT_OF_REACH','A high RNG roll cannot extend physical reach');
 if(!frame.lineOfEffect||!frame.targetExposed)return deny('BLOCKED','No physical strike path');
 if(frame.staminaCost>frame.staminaNow)return deny('EXHAUSTED','Action lacks required energy');
 return pass({physicallyPossible:true,staminaRequired:frame.staminaCost,residualForceScore:Math.max(0,frame.attackForce-frame.armorAbsorption),requiresUncertaintyResolution:frame.uncertain,injuryResolved:false});
}
