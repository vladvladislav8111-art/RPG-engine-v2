import {V48_SOURCE} from "./chroma_runes_v48.ts";
/** Server event-derived, fixed catalog rune roll for a confirmed monster kill.
 * Only immutable combat event refs are accepted. No user-provided probability.
 * Rolls are persisted in ChromaV4Meta by the event adapter for audit.
 */
import {getV4MonsterCard} from './live_monster_profile.ts';
import {CATALOG_RUNE_SKILL_IDS} from './verified_bestiary_gateway.ts';
export type RuneReceipt={monsterId:string;targetRef:string;sourceRef:string;
 rollTenThousand:number;success:boolean;runeSkillId:string|null;chanceBasisPoints:number};
const valid=(x:string)=>/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(x);
export function v4RuneReceipt(e:{monsterId:string;targetRef:string;sourceRef:string;rulesV48?:boolean}):RuneReceipt|null{
 const monster=getV4MonsterCard(e.monsterId);
 if(!monster)throw Error('V4_RUNE_MONSTER_NOT_REGISTERED');
 if(!valid(e.sourceRef)||!valid(e.targetRef))throw Error('V4_RUNE_PROOF_REF_INVALID');
 // Make each encounter's fixed roll independent of attacker-supplied numbers.
 let h=2166136261>>>0;
 const seed=`chroma.v4.rune|${e.monsterId}|${e.targetRef}|${e.sourceRef}`;
 for(const char of seed){h^=char.charCodeAt(0);h=Math.imul(h,16777619);}
 const roll=(h>>>0)%10000;
 if(e.rulesV48&&["light_quartz","deformis_spider"].includes(e.monsterId))return null;
 const newRune=e.rulesV48&&Object.hasOwn(V48_SOURCE,e.monsterId)?V48_SOURCE[e.monsterId]:null;
 const spec=newRune??(monster as typeof monster&{rune?:{name:string;percent:number}|null}).rune;
 if(!spec)return null;
 const skill=newRune?.id??CATALOG_RUNE_SKILL_IDS[e.monsterId];
 if(!skill||!Number.isFinite(spec.percent)||spec.percent<0||spec.percent>100)
  throw Error('V4_RUNE_CATALOG_INVALID');
 const chance=Math.round(spec.percent*100);
 return {monsterId:e.monsterId,targetRef:e.targetRef,sourceRef:e.sourceRef,
  rollTenThousand:roll,chanceBasisPoints:chance,
  success:roll<chance,runeSkillId:roll<chance?skill:null};
}
