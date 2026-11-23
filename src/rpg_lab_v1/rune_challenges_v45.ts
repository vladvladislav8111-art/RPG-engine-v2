/** One-time, evidenced alternative paths to important rune skills.
 * Never turns a low-probability drop into a guaranteed random drop.
 * This is a candidate scenario registry; challenge clear must exist in save.
 */
import type {SystemPlayer} from './crossover_core.ts';
export const RUNE_CHALLENGES={
 papilio_rescue_trial:{title:'Полевой лекарь',rune:'minor_healing',
  criteria:['A confirmed injured ally was protected','At least three distinct hostile waves defeated',
   'Field treatment using an actual Papilio material was recorded']},
 carbuncle_guardian_trial:{title:'Хранитель барьера',rune:'mana_barrier',
  criteria:['A confirmed group defense objective was completed',
   'Three distinct damaging monster attacks were endured',
   'All escorted NPCs survived and the rare Carbuncle encounter was resolved']},
} as const;
export type RuneChallengeId=keyof typeof RUNE_CHALLENGES;
const valid=(v:string)=>/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(v);
export function grantVerifiedChallengeRune(player:SystemPlayer,
 e:{sourceRef:string;proofRef:string;challengeId:RuneChallengeId},
 host:{challengeComplete:(challenge:RuneChallengeId,proofRef:string,required:string[])=>boolean}){
 const c=RUNE_CHALLENGES[e.challengeId];
 if(!c||!valid(e.sourceRef)||!valid(e.proofRef)||e.sourceRef===e.proofRef||
    player.confirmedRewardRefs.includes(e.sourceRef)||
    player.confirmedRewardRefs.includes(`rune.challenge.${e.challengeId}`)||
    !host.challengeComplete(e.challengeId,e.proofRef,[...c.criteria]))
  throw Error('RUNE_CHALLENGE_NOT_EARNED');
 // Already studied: do not silently give duplicate obsolete stone; it would
 // undermine the point of rare skills. Alternative reward needs player choice.
 if(player.learnedSkills.includes(c.rune))throw Error('RUNE_CHALLENGE_SKILL_ALREADY_LEARNED');
 const n=structuredClone(player);
 n.runeStones[c.rune]=(n.runeStones[c.rune]??0)+1;
 n.confirmedRewardRefs.push(e.sourceRef,`rune.challenge.${e.challengeId}`);
 return {player:n,runeSkillId:c.rune,challengeId:e.challengeId};
}
