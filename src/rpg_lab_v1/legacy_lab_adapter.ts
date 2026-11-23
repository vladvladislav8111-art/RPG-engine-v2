/**
 * Integration boundary between legacy RPG Lab's persisted JinwooState and
 * the isolated DanMachi × Solo Leveling v4 engine. This does NOT write KV.
 * Production must use the existing session CAS writer and a server-only host.
 */
import {type LegacyChromaCore,previewChromaMigration} from './safe_chroma_migration.ts';
import {
 type FalnaStateV4,type FalnaStats,type SystemPlayer,
 projectFalna,rankUpFalna,updateFalnaStatus,studyRuneStone,
} from './crossover_core.ts';
import {
 awardCatalogVerifiedDefeat,recoverPhysicalLoot,
 type SpawnMode,type VerifiedCombatEvidence,
 type PhysicalRecoveryLedger,
} from './verified_bestiary_gateway.ts';
import {CATALOG_RUNE_SKILL_IDS} from './verified_bestiary_gateway.ts';
import type {RuntimeRuneLedger} from './rune_title_actions_v46.ts';
import type {TitleCombatLedger} from './title_rules_v45.ts';

export const CHROMA_V4_FLAG='chroma_crossover_v4';
const id=(s:string)=>/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(s);
export type ChromaV4Meta={
 schema:'CHROMA_V4_META_1';
 titleIds:string[];activeTitle:string|null;
 runeStones:Record<string,number>;learnedSkills:string[];
 physicalLoot:PhysicalRecoveryLedger;
 recoveredStones:{targetRef:string;monsterId:string;potentialValis:number;sourceRef:string}[];
 recoveredMaterials:{targetRef:string;monsterId:string;itemId:string;sourceRef:string}[];
 /** Immutable rune draw audit after journal-confirmed kills. */
 runeAwards?:Record<string,{monsterId:string;sourceRef:string;rollTenThousand:number;
  chanceBasisPoints:number;runeSkillId:string|null}>;
 runeRuntime?:RuntimeRuneLedger;titleBattleLedger?:TitleCombatLedger;
};
export type LegacyChromaSave=LegacyChromaCore&{
 storyFlags:string[];unlockedSkills?:string[];
 layeredFalnaV4?:FalnaStateV4|null;
 crossoverSchema?:'chroma_v4_staged';
 chromaV4Meta?:ChromaV4Meta;
};
const clone=<T>(s:T):T=>structuredClone(s);
function assertValidV4(save:LegacyChromaSave){
 if(!save.storyFlags.includes(CHROMA_V4_FLAG)||
   save.crossoverSchema!=='chroma_v4_staged'||
   save.chromaV4Meta?.schema!=='CHROMA_V4_META_1')
  throw Error('CHROMA_V4_NOT_ACTIVATED');
 if(save.falna.blessed){
  if(!save.layeredFalnaV4||
     save.falna.divineLevel!==save.layeredFalnaV4.divineLevel||
     JSON.stringify(save.falna.status)!==JSON.stringify(save.layeredFalnaV4.current))
   throw Error('CHROMA_V4_FALNA_OUT_OF_SYNC');
  projectFalna(save.layeredFalnaV4,save.stats);
 }
}
export function stageChromaV4(original:LegacyChromaSave):LegacyChromaSave{
 if(original.storyFlags.includes(CHROMA_V4_FLAG)||original.chromaV4Meta)
  throw Error('CHROMA_V4_ALREADY_STAGED');
 const preview=previewChromaMigration(original);
 const titles=original.storyFlags.filter(x=>x==='title.wolf_slayer').map(_=>'wolf_slayer');
 const candidate:LegacyChromaSave={...preview.candidate,
  storyFlags:[...original.storyFlags,CHROMA_V4_FLAG],
  chromaV4Meta:{schema:'CHROMA_V4_META_1',titleIds:titles,
   activeTitle:titles.length===1?titles[0]:null,
   runeStones:{},learnedSkills:[],runeAwards:{},
   physicalLoot:{recoveredTargetRefs:[],recoveryRefs:[]},
   recoveredStones:[],recoveredMaterials:[]},
 };
 assertValidV4(candidate);
 return candidate;
}
export function toV4Player(s:LegacyChromaSave):SystemPlayer{
 assertValidV4(s);
 return {systemLevel:s.systemLevel,xp:s.xp,gold:s.gold,stats:clone(s.stats),
  freeStatPoints:s.freeStatPoints,hp:s.hp,mp:s.mp,fatigue:s.fatigue,
  confirmedDefeats:[...s.defeatedTargetRefs],confirmedRewardRefs:[...s.appliedRewardRefs],
  titleIds:[...s.chromaV4Meta!.titleIds],activeTitle:s.chromaV4Meta!.activeTitle,
  runeStones:{...s.chromaV4Meta!.runeStones},learnedSkills:[...s.chromaV4Meta!.learnedSkills]};
}
function applyV4Player(s:LegacyChromaSave,player:SystemPlayer):LegacyChromaSave{
 const n=clone(s);
 n.systemLevel=player.systemLevel;n.xp=player.xp;n.gold=player.gold;
 n.stats=clone(player.stats);n.freeStatPoints=player.freeStatPoints;
 n.hp=player.hp;n.mp=player.mp;n.fatigue=player.fatigue;
 n.defeatedTargetRefs=[...player.confirmedDefeats];
 n.appliedRewardRefs=[...player.confirmedRewardRefs];
 n.chromaV4Meta!.titleIds=[...player.titleIds];
 n.chromaV4Meta!.activeTitle=player.activeTitle;
 n.chromaV4Meta!.runeStones={...player.runeStones};
 n.chromaV4Meta!.learnedSkills=[...player.learnedSkills];
 return n;
}
/** Confirmed killing is single event: never award a Dungeon physical item here. */
export function applyV4Defeat(s:LegacyChromaSave,e:{
 sourceRef:string;targetRef:string;monsterId:string;systemLevel:number;
 spawnMode:SpawnMode;floor:number|null;storyTriggerProofRef?:string;
 evidence:VerifiedCombatEvidence;
},host:Parameters<typeof awardCatalogVerifiedDefeat>[2]){
 const player=toV4Player(s);
 const receipt=awardCatalogVerifiedDefeat(player,e,host);
 const n=applyV4Player(s,receipt.player);
 // Persist immutable evidence for a later, separately authorized loot search.
 const existing=(n.defeatEvidence as Record<string,unknown>|undefined)??{};
 n.defeatEvidence={...existing,[e.targetRef]:{
  monsterId:e.monsterId,sourceRef:e.sourceRef,floor:e.floor,
 }};
 return {next:n,receipt:{system:receipt.system,danmachi:receipt.danmachi,
  rewardAudit:receipt.rewardAudit}};
}
/** Recovery is independent from defeat, and credits no Valis automatically. */
export function applyV4Recovery(s:LegacyChromaSave,e:{
 sourceRef:string;targetRef:string;monsterId:string;
 stoneSurvived:boolean;searchProofRef:string;
},host:Parameters<typeof recoverPhysicalLoot>[2]){
 assertValidV4(s);
 const meta=s.chromaV4Meta!;
 const result=recoverPhysicalLoot(meta.physicalLoot,e,host);
 const n=clone(s),m=n.chromaV4Meta!;
 m.physicalLoot=result.ledger;
 if(result.potentialMagicStoneValis!==null)m.recoveredStones.push({
  targetRef:e.targetRef,monsterId:e.monsterId,sourceRef:e.sourceRef,
  potentialValis:result.potentialMagicStoneValis});
 if(result.materialRecovered)m.recoveredMaterials.push({
  targetRef:e.targetRef,monsterId:e.monsterId,sourceRef:e.sourceRef,
  itemId:result.materialRecovered});
 n.appliedRewardRefs.push(e.sourceRef);
 return {next:n,potentialValis:result.potentialMagicStoneValis,
  materialRecovered:result.materialRecovered};
}
/**
 * Falna update can be authored only after existing god-confirmed event checks.
 * For a rank-up, the supplied newStatus is the final status BEFORE reset.
 */
export function applyV4GodStatus(s:LegacyChromaSave,e:{
 sourceRef:string;godId:string;godConfirmed:boolean;
 newStatus:FalnaStats;levelUpFeatRef?:string;
},verifyFeat:(featRef:string)=>boolean):LegacyChromaSave{
 assertValidV4(s);
 if(!id(e.sourceRef)||s.appliedRewardRefs.includes(e.sourceRef)||
   !s.falna.blessed||!e.godConfirmed||e.godId!==s.falna.godId)
  throw Error('CHROMA_V4_FALNA_GOD_CONFIRMATION_REQUIRED');
 let layer=updateFalnaStatus(s.layeredFalnaV4!,e.newStatus);
 if(e.levelUpFeatRef){
  if(!id(e.levelUpFeatRef)||!verifyFeat(e.levelUpFeatRef))
   throw Error('CHROMA_V4_FALNA_FEAT_UNVERIFIED');
  layer=rankUpFalna(layer,e.levelUpFeatRef);
 }
 const n=clone(s);
 n.layeredFalnaV4=layer;
 n.falna.status={...layer.current};
 n.falna.divineLevel=layer.divineLevel;
 n.falna.lastUpdatedRef=e.sourceRef;
 n.appliedRewardRefs.push(e.sourceRef);
 assertValidV4(n);
 return n;
}

/** Studying a rune is a separate, player-approved CAS event; no auto-learn. */
export function applyV4RuneStudy(s:LegacyChromaSave,e:{
 sourceRef:string;skillId:string;playerConfirmed:true;
}):LegacyChromaSave{
 assertValidV4(s);
 if(!e.playerConfirmed||!id(e.sourceRef)||s.appliedRewardRefs.includes(e.sourceRef)||
    !Object.values(CATALOG_RUNE_SKILL_IDS).includes(e.skillId)||
    (s.unlockedSkills??[]).includes(e.skillId))
  throw Error('CHROMA_V4_RUNE_STUDY_NOT_AUTHORIZED');
 const player=studyRuneStone(toV4Player(s),e.skillId);
 const n=clone(s);
 n.chromaV4Meta!.runeStones=player.runeStones;
 n.chromaV4Meta!.learnedSkills=player.learnedSkills;
 n.unlockedSkills=[...(n.unlockedSkills??[]),e.skillId];
 n.appliedRewardRefs.push(e.sourceRef);
 return n;
}
