/** Chroma-only Orario Guild economy, transferred from the approved Linos RPG Lab model.
 * Source: DanMachi RPG Lab — Экономика, магические камни и редкий дроп v1.0,
 * 13 November 2026 (Google Doc 1SGYMI1cROpjCmtYXbTDIOZ2metRUHw23EGssNVok4iE).
 * These are campaign house prices, NOT canonical per-monster DanMachi rates.
 * Past confirmed sales remain immutable; no back-filled random stone qualities.
 */
export const CHROMA_LINOS_STONE_BASE_VALIS:Readonly<Record<string,number>>=Object.freeze({
 goblin:180,kobold:220,dungeon_lizard:350,frog_shooter:625,
 war_shadow:1350,killer_ant:1200,purple_moth:675,needle_rabbit:1000,
 blue_papilio:500,imp:1750,bad_bat:1300,orc:5500,silverback:8500,
 hard_armored:10000,infant_dragon:105000,hellhound:7000,
 crystal_mantis:20000,minotaur:35000,enhanced_minotaur:50000,goliath_17:1000000
});
export const CHROMA_LINOS_STONE_SIZE_DISTRIBUTION=[
 {from:50,to:79,weight:10},{from:80,to:119,weight:65},
 {from:120,to:159,weight:20},{from:160,to:200,weight:5}
] as const;
export const CHROMA_LINOS_STONE_SATURATION_DISTRIBUTION=[
 {from:50,to:74,weight:10},{from:75,to:109,weight:70},
 {from:110,to:129,weight:16},{from:130,to:140,weight:4}
] as const;
/** Rare drops require their own verified loot event; these rates alone award nothing. */
export const CHROMA_LINOS_RARE_DROP_REFERENCE={
 goblin:{item:"goblin_fang",chancePercent:6,baseValis:420},
 kobold:{item:"kobold_claw",chancePercent:6,baseValis:600},
 war_shadow:{item:"war_shadow_finger_blade",chancePercent:5,baseValis:5500},
 purple_moth:{item:"purple_moth_wing",chancePercent:6,baseValis:3500},
 needle_rabbit:{item:"needle_rabbit_tusk",chancePercent:7,baseValis:2000},
 blue_papilio:{item:"blue_papilio_healing_wing",chancePercent:15,baseValis:40000},
 orc:{item:"orc_hide",chancePercent:7,baseValis:8000},
 crystal_mantis:{item:"crystal_mantis_wing",chancePercent:4,baseValis:40000},
 minotaur:{item:"minotaur_horn",chancePercent:5,baseValis:60000},
 goliath_17:{item:"goliath_tooth",chancePercent:8,baseValis:300000}
} as const;
export type ChromaStoneQuality={sizePct:number;saturationPct:number;integrityPct:number};
export type ChromaStoneQuote=ChromaStoneQuality&{
 monsterId:string;baseValis:number;qualityScore:number;integrityFactor:number;
 valis:number;qualityCategory:"low"|"ordinary"|"rich"|"rare"|"exceptional";
};
export function quoteChromaLinosMagicStone(
 e:ChromaStoneQuality&{monsterId:string}
):ChromaStoneQuote{
 const base=CHROMA_LINOS_STONE_BASE_VALIS[e.monsterId];
 if(!Number.isSafeInteger(base)||base<1)
  throw Error("CHROMA_STONE_MONSTER_BASE_PRICE_UNKNOWN");
 // Quality must be an individually confirmed observation/roll, not an
 // invented retrospective value or generic species-only default.
 if(!Number.isSafeInteger(e.sizePct)||e.sizePct<50||e.sizePct>200||
    !Number.isSafeInteger(e.saturationPct)||e.saturationPct<50||
    e.saturationPct>140||!Number.isSafeInteger(e.integrityPct)||
    e.integrityPct<0||e.integrityPct>100)
  throw Error("CHROMA_STONE_QUALITY_EVIDENCE_REQUIRED");
 const qualityScore=(e.sizePct/100)*(e.saturationPct/100);
 const integrityFactor=Math.pow(e.integrityPct/100,1.25);
 const valis=Math.floor(base*qualityScore*integrityFactor);
 const qualityCategory=qualityScore<.75?"low":
  qualityScore<1.25?"ordinary":qualityScore<1.75?"rich":
  qualityScore<2.25?"rare":"exceptional";
 return {...e,baseValis:base,qualityScore,integrityFactor,valis,qualityCategory};
}
