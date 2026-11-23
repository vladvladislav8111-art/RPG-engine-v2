/** Authoritative Chroma v4 Guild quote, independent of legacy Linos prices.
 * Historical stone sales are NEVER repriced; this is only for fresh pickups.
 */
import {getV4MonsterCard} from './live_monster_profile.ts';

export type V4StoneQuality={sizePct:number;saturationPct:number;integrityPct:number};
export type V4StoneQuote=V4StoneQuality & {
 monsterId:string;baseValis:number;qualityScore:number;integrityFactor:number;
 valis:number;qualityCategory:'low'|'ordinary'|'rich'|'rare'|'exceptional';
 pricingModel:'chroma_bestiary_v2';
};
const properInt=(v:number,min:number,max:number)=>
 Number.isSafeInteger(v)&&v>=min&&v<=max;
/** Values depend on user-approved catalog and source-observed stone quality. */
export function quoteChromaV4Stone(e:V4StoneQuality&{monsterId:string}):V4StoneQuote{
 const card=getV4MonsterCard(e.monsterId);
 if(!card||card.origin!=='DanMachi'||!properInt(card.priceMagicStoneValis??-1,1,250_000_000))
  throw Error('CHROMA_V4_STONE_NO_DANMACHI_BASE_VALUE');
 if(!properInt(e.sizePct,50,200)||!properInt(e.saturationPct,50,140)||
    !properInt(e.integrityPct,0,100))
  throw Error('CHROMA_V4_STONE_QUALITY_EVIDENCE_REQUIRED');
 const qualityScore=(e.sizePct/100)*(e.saturationPct/100);
 const integrityFactor=(e.integrityPct/100)**1.25;
 const valis=Math.floor(card.priceMagicStoneValis!*qualityScore*integrityFactor);
 if(!properInt(valis,0,250_000_000))
  throw Error('CHROMA_V4_STONE_QUOTE_OVERFLOW');
 const qualityCategory=qualityScore<.75?'low':qualityScore<1.25?'ordinary':
  qualityScore<1.75?'rich':qualityScore<2.25?'rare':'exceptional';
 return {...e,monsterId:e.monsterId,baseValis:card.priceMagicStoneValis!,qualityScore,
  integrityFactor,valis,qualityCategory,pricingModel:'chroma_bestiary_v2'};
}
