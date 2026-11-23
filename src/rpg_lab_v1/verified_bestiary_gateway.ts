/**
 * Authoritative monster catalog adapter for Chroma release candidate v4.
 * A narration/GM event supplies evidence IDs, not user-set XP, gold or rune odds.
 * Runtime must verify evidence IDs against the saved event journal before calling.
 * No storage access or live campaign mutation occurs in this module.
 */
import catalogData from '../data/monster_adapter_v4.json' with { type: 'json' };
import {
  confirmTwoWorldKill, type SystemPlayer, type MonsterRewardCard,
} from './crossover_core.ts';

export type SpawnMode = 'natural' | 'scripted' | 'system_instance';
type RuneCatalogSpec = { name: string; percent: number } | null;
type Card = {
  id: string; name: string; systemLevelMin: number; systemLevelMax: number;
  baseXp: number; baseGold: number; priceMagicStoneValis: number | null;
  canSpawnNaturally: boolean; requiresStoryTrigger: boolean;
  kind: string; floorMin: number | null; floorRanges: [number, number][]; origin: string;
  material: { name: string; percent: number } | null;
  rune: RuneCatalogSpec;
};
const cards = (catalogData.monsters as Card[]);
const index = new Map(cards.map((c) => [c.id,c]));
if (cards.length!==index.size) throw Error('CATALOG_DUPLICATE_MONSTER_ID');
const identifier = (s:string) => /^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(s);
export const CATALOG_RUNE_SKILL_IDS:Readonly<Record<string,string>> = {
  war_shadow:'stealth',
  blue_papilio:'minor_healing',
  hellhound:'flame_breath',
  firebird:'fire_projectile',
  siren:'sonic_pulse',
  light_quartz:'focused_light',
  carbuncle:'mana_barrier',
  basilisk:'paralyzing_toxin',
  peluda:'toxic_quills',
  deformis_spider:'binding_web',
  thunder_snake:'electric_pulse',
  arachne:'acid_spit',
  sl_igris:'rulers_touch',
};
const isSystemOrigin=(c:Card)=>c.origin==='Solo Leveling';
export function catalogSummary(){
 return {entries:index.size,storyOnly:catalogData.storyOnly.length,
  natural:cards.filter(c=>c.canSpawnNaturally).length,
  runeSources:cards.filter(c=>!!c.rune).length};
}
export function resolveMonsterFromCatalog(args:{
 monsterId:string; systemLevel:number; spawnMode:SpawnMode; floor:number|null;
 storyTriggerProofRef?:string;
}): {card:MonsterRewardCard; material:Card['material']; source:Card} {
 const c=index.get(args.monsterId);
 if (!c) throw Error('CATALOG_MONSTER_UNKNOWN_OR_STORY_ONLY');
 if(!Number.isSafeInteger(args.systemLevel)||args.systemLevel<c.systemLevelMin||args.systemLevel>c.systemLevelMax)
  throw Error('CATALOG_MONSTER_LEVEL_OUT_OF_RANGE');
 if(args.spawnMode==='natural'){
  if(!c.canSpawnNaturally || isSystemOrigin(c) || c.requiresStoryTrigger)
   throw Error('CATALOG_NATURAL_SPAWN_FORBIDDEN');
  if(!Number.isSafeInteger(args.floor)||args.floor!<1||
     !c.floorRanges.some(([lo,hi])=>args.floor!>=lo&&args.floor!<=hi))
   throw Error('CATALOG_NATURAL_FLOOR_INVALID');
 }else if(args.spawnMode==='system_instance'){
  if(!isSystemOrigin(c))throw Error('CATALOG_NOT_A_SYSTEM_INSTANCE');
  if(!identifier(args.storyTriggerProofRef??''))throw Error('CATALOG_INSTANCE_PROOF_REQUIRED');
 }else if(args.spawnMode==='scripted'){
  if(isSystemOrigin(c))throw Error('CATALOG_SYSTEM_MONSTER_WRONG_MODE');
  if(!identifier(args.storyTriggerProofRef??''))throw Error('CATALOG_SCRIPTED_PROOF_REQUIRED');
  if(args.floor!==null && (!Number.isSafeInteger(args.floor)||args.floor<1))
   throw Error('CATALOG_FLOOR_INVALID');
 }else throw Error('CATALOG_SPAWN_MODE_INVALID');
 const runeId = c.rune ? CATALOG_RUNE_SKILL_IDS[c.id] : undefined;
 if(c.rune && !runeId)throw Error('CATALOG_RUNE_NOT_REGISTERED');
 const card:MonsterRewardCard={
  id:c.id,systemLevel:args.systemLevel,baseXp:c.baseXp,systemGold:c.baseGold,
  dungeonStoneValis:c.priceMagicStoneValis,
  magicStonePossible:!isSystemOrigin(c)&&c.priceMagicStoneValis!==null,
  allowedToSpawn:args.spawnMode==='natural'&&c.canSpawnNaturally,
  ...(runeId ? {runeId,runeChancePercent:c.rune!.percent} : {}),
 };
 return {card,material:c.material,source:c};
}
export type VerifiedCombatEvidence={
 battleProofRef:string; participationProofRef:string;
 /** Must be derived from confirmed source event records by the host. */
 defeatConfirmedByJournal:boolean;
 participationConfirmedByJournal:boolean;
};
export type GatewayResult = ReturnType<typeof confirmTwoWorldKill> & {
  rewardAudit:{monsterId:string;monsterLevel:number;spawnMode:SpawnMode;
   battleProofRef:string;participationProofRef:string;materialName:string|null;
   materialChancePercent:number};
};
export function awardCatalogVerifiedDefeat(
 player:SystemPlayer,
 e:{sourceRef:string;targetRef:string;monsterId:string;
  systemLevel:number;spawnMode:SpawnMode;floor:number|null;
  storyTriggerProofRef?:string;evidence:VerifiedCombatEvidence},
 host:{
  /** Host injects a recorded server-side roll, never player-controlled input. */
  getRecordedRoll:(sourceRef:string,category:'rune')=>number;
  verifyJournalProof:(ref:string,kind:'battle_defeat'|'contribution'|'story_trigger',targetRef:string)=>boolean;
  getRestoredResources:(next:SystemPlayer)=>{hp:number;mp:number};
 },
):GatewayResult{
 if(!identifier(e.sourceRef)||!identifier(e.targetRef)||
    !identifier(e.evidence.battleProofRef)||!identifier(e.evidence.participationProofRef))
  throw Error('CATALOG_EVIDENCE_REF_INVALID');
 // Hard rule: a self-assertion cannot attest its own defeat or contribution.
 if(e.evidence.battleProofRef===e.sourceRef||e.evidence.participationProofRef===e.sourceRef)
  throw Error('CATALOG_SELF_ATTESTATION_REJECTED');
 if(!host.verifyJournalProof(e.evidence.battleProofRef,'battle_defeat',e.targetRef)||
    !host.verifyJournalProof(e.evidence.participationProofRef,'contribution',e.targetRef))
  throw Error('CATALOG_SOURCE_EVIDENCE_NOT_CONFIRMED');
 const {card,material}=resolveMonsterFromCatalog(e);
 if(e.spawnMode!=='natural'&&
   !host.verifyJournalProof(e.storyTriggerProofRef!,'story_trigger',e.targetRef))
  throw Error('CATALOG_STORY_TRIGGER_UNVERIFIED');
 const roll=host.getRecordedRoll(e.sourceRef,'rune');
 const result=confirmTwoWorldKill(player,{
  sourceRef:e.sourceRef,targetRef:e.targetRef,
  defeated:true,playerContributionConfirmed:true,
  monster:card,randomRuneRoll:roll,
  resources:host.getRestoredResources,
 });
 return {...result,rewardAudit:{monsterId:card.id,monsterLevel:card.systemLevel,
   spawnMode:e.spawnMode,battleProofRef:e.evidence.battleProofRef,
   participationProofRef:e.evidence.participationProofRef,
   materialName:material?.name??null,materialChancePercent:material?.percent??0}};
}

/**
 * Physical recovery is an independent, evidenced event, NEVER automatic on kill.
 * Returned value is a collectible quote, not an inventory or Valis credit.
 */
export type PhysicalRecoveryLedger = { recoveredTargetRefs:string[]; recoveryRefs:string[] };
export function recoverPhysicalLoot(
 ledger:PhysicalRecoveryLedger,
 e:{sourceRef:string;targetRef:string;monsterId:string;
   stoneSurvived:boolean;searchProofRef:string},
 host:{isConfirmedDefeat:(targetRef:string,monsterId:string)=>boolean;
   verifySearchProof:(proofRef:string,targetRef:string)=>boolean;
   getRecordedMaterialRoll:(ref:string)=>number},
):{ledger:PhysicalRecoveryLedger;potentialMagicStoneValis:number|null;
 materialRecovered:string|null} {
 if(!identifier(e.sourceRef)||!identifier(e.targetRef)||!identifier(e.searchProofRef))
  throw Error('RECOVERY_REF_INVALID');
 if(e.sourceRef===e.searchProofRef)throw Error('RECOVERY_SELF_ATTESTATION_REJECTED');
 if(ledger.recoveryRefs.includes(e.sourceRef)||ledger.recoveredTargetRefs.includes(e.targetRef))
  throw Error('RECOVERY_ALREADY_PROCESSED');
 if(!host.isConfirmedDefeat(e.targetRef,e.monsterId)||
    !host.verifySearchProof(e.searchProofRef,e.targetRef))
  throw Error('RECOVERY_DEFEAT_OR_SEARCH_UNVERIFIED');
 const c=index.get(e.monsterId);
 if(!c||isSystemOrigin(c))throw Error('RECOVERY_NOT_DANMACHI_MONSTER');
 const roll=host.getRecordedMaterialRoll(e.sourceRef);
 if(!(roll>=0&&roll<1))throw Error('RECOVERY_ROLL_INVALID');
 const n=structuredClone(ledger);
 n.recoveredTargetRefs.push(e.targetRef);n.recoveryRefs.push(e.sourceRef);
 return {ledger:n,
  potentialMagicStoneValis:e.stoneSurvived?c.priceMagicStoneValis:null,
  materialRecovered:c.material&&roll<c.material.percent/100?c.material.name:null,
 };
}
