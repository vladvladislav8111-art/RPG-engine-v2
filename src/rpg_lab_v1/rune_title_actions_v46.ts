/** Authoritative Chroma v4.6 event bridge. All state updates are pure and
 * must be written by RPG Lab's existing revision-checked session CAS writer.
 * Callers cannot supply monster stats, player max HP/MP, hit rolls or XP.
 * This stage intentionally supports SELF and the ONE persisted active enemy;
 * ally/object interactions must wait for journal-backed world target storage.
 */
import {toV4Player,type LegacyChromaSave} from './legacy_lab_adapter.ts';
import {
 executeRuneCast,tickRuneEffects,evolveRulersTouch,RUNE_SKILLS,type RuneEncounter,type RuneEffect,
 type RuneMastery,type RuneSkillId,type RuneCast,type RuneTarget,
} from './rune_abilities_v45.ts';
import {
 TITLE_DEFS,grantVerifiedTitle,equipVerifiedTitle,
 type TitleId,type TitleCombatLedger,
} from './title_rules_v45.ts';
import {grantVerifiedChallengeRune,type RuneChallengeId} from './rune_challenges_v45.ts';

const REF=/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/;
export type RuntimeRuneLedger={
 nowSecond:number;encounterRef:string|null;
 mastery:Partial<Record<RuneSkillId,RuneMastery>>;
 cooldownReadyAt:Partial<Record<RuneSkillId,number>>;
 effects:RuneEffect[];usedRefs:string[];usedProofRefs:string[];
};
export type LiveV46Save=LegacyChromaSave&{
 activeEncounter?:{enemyRef:string;monsterId:string;floor:number;
  enemyHp:number;round:number;startedRef:string};
 chromaV4Meta?:NonNullable<LegacyChromaSave['chromaV4Meta']>&{
  runeRuntime?:RuntimeRuneLedger;titleBattleLedger?:TitleCombatLedger;
 };
};
export type VerifiedMonsterStats={maxHp:number;armor:number;strength:number;
 magicResistancePct:number;size:'small'|'medium'|'large'|'giant';poisonImmune:boolean};
export type RuneTitleEventHost={
 /** Only an already persisted, source-backed event can authorize an action. */
 verifyAction:(kind:'rune_cast'|'rune_evolve'|'equip_title'|'title_grant'|'rune_challenge',
  sourceRef:string,proofRef:string)=>boolean;
 /** Server state, not caller input. */
 getMaxHp:(save:LiveV46Save)=>number;
 getMaxMp:(save:LiveV46Save)=>number;
 getEffectiveIntelligence:(save:LiveV46Save)=>number;
 getEnemyStats:(save:LiveV46Save)=>VerifiedMonsterStats;
 /** A hit result from the authoritative GM/combat journal, never caller input. */
 confirmRuneHit:(sourceRef:string,proofRef:string,enemyRef:string)=>boolean;
 verifyTitleClear:(titleId:TitleId,proofRef:string)=>boolean;
 verifyChallengeClear:(id:RuneChallengeId,proofRef:string,criteria:string[])=>boolean;
 verifyEvolutionFeat:(proofRef:string)=>boolean;
};
export type CastAction={sourceRef:string;proofRef:string;skillId:RuneSkillId;
 target:'self'|'enemy';serverSecond:number;confirmedPlayerChoice:true;
 durationSeconds?:number;channelSeconds?:number;preparedSeconds?:number;
 hitLocation?:string;};
const copy=<T>(x:T):T=>structuredClone(x);
const valid=(x:unknown):x is string=>typeof x==='string'&&REF.test(x);
const positive=(x:number)=>Number.isSafeInteger(x)&&x>0;
const emptyRuneRuntime=():RuntimeRuneLedger=>({nowSecond:0,encounterRef:null,
 mastery:{},cooldownReadyAt:{},effects:[],usedRefs:[],usedProofRefs:[]});
const emptyTitles=():TitleCombatLedger=>({battleId:'',spentAbilityKeys:[],activeUntil:{},appliedSourceRefs:[]});
function verified(s:LiveV46Save,host:RuneTitleEventHost,kind:Parameters<RuneTitleEventHost['verifyAction']>[0],
 sourceRef:string,proofRef:string){
 if(!s.chromaV4Meta||!s.storyFlags.includes('chroma_crossover_v4')||
  !valid(sourceRef)||!valid(proofRef)||sourceRef===proofRef||
  s.appliedRewardRefs.includes(sourceRef)||!host.verifyAction(kind,sourceRef,proofRef))
  throw Error('V46_ACTION_NOT_JOURNAL_VERIFIED_OR_DUPLICATE');
}
function readLedger(s:LiveV46Save){return copy(s.chromaV4Meta!.runeRuntime??emptyRuneRuntime());}
function baseTarget(id:string,kind:RuneTarget['kind'],hp:number,maxHp:number):RuneTarget{
 return {id,kind,hp,maxHp,armor:0,strength:0,magicResistancePct:0,
  size:'medium',poisonImmune:false,wounds:[]};
}
function reconstruct(s:LiveV46Save,host:RuneTitleEventHost):RuneEncounter{
 const ledger=readLedger(s);
 const player=toV4Player(s),maxHp=host.getMaxHp(s),maxMp=host.getMaxMp(s);
 const intelligence=host.getEffectiveIntelligence(s);
 if(!positive(maxHp)||!positive(maxMp)||!Number.isSafeInteger(s.hp)||s.hp>maxHp||
  !Number.isSafeInteger(s.mp)||s.mp>maxMp||
  !Number.isSafeInteger(intelligence)||intelligence<0)
  throw Error('V46_TRUSTED_PLAYER_RESOURCE_INVALID');
 const playerTarget=baseTarget('hero.chroma','player',s.hp,maxHp);
 const targets:Record<string,RuneTarget>={'hero.chroma':playerTarget};
 const enemy=s.activeEncounter;
 if(enemy){
  if(!valid(enemy.enemyRef))throw Error('V46_ENEMY_REF_INVALID');
  const c=host.getEnemyStats(s);
  if(!positive(c.maxHp)||!Number.isSafeInteger(enemy.enemyHp)||enemy.enemyHp<0||enemy.enemyHp>c.maxHp||
     !Number.isFinite(c.armor)||c.armor<0||!Number.isFinite(c.strength)||c.strength<0||
     !Number.isFinite(c.magicResistancePct)||c.magicResistancePct<0||c.magicResistancePct>100)
   throw Error('V46_TRUSTED_MONSTER_STATS_INVALID');
  targets[enemy.enemyRef]={...baseTarget(enemy.enemyRef,'monster',enemy.enemyHp,c.maxHp),
   armor:c.armor,strength:c.strength,magicResistancePct:c.magicResistancePct,
   size:c.size,poisonImmune:c.poisonImmune};
 }
 const currentEncounter=enemy?.enemyRef??null;
 // Discard effects targeting a prior enemy; do not resurrect an old target.
 const effects=ledger.effects.filter(x=>x.targetId==='hero.chroma'||
  (currentEncounter!==null&&x.targetId===currentEncounter));
 const state:RuneEncounter={nowSecond:ledger.nowSecond,casterId:'hero.chroma',
  mp:s.mp,maxMp,intelligence,
  learnedSkills:[...new Set([...player.learnedSkills,...(s.unlockedSkills??[])])],
  mastery:ledger.mastery,cooldownReadyAt:ledger.cooldownReadyAt,
  targets,effects,usedRefs:ledger.usedRefs};
 return state;
}
function writeBack(s:LiveV46Save,state:RuneEncounter,sourceRef?:string):LiveV46Save{
 const n=copy(s);
 if(!n.chromaV4Meta)throw Error('V46_META_MISSING');
 n.hp=state.targets['hero.chroma'].hp;n.mp=state.mp;
 if(n.activeEncounter){
  const target=state.targets[n.activeEncounter.enemyRef];
  if(!target)throw Error('V46_ENEMY_TARGET_LOST');
  n.activeEncounter.enemyHp=target.hp;
 }
 n.chromaV4Meta.runeRuntime={nowSecond:state.nowSecond,
  encounterRef:n.activeEncounter?.enemyRef??null,
  mastery:copy(state.mastery),cooldownReadyAt:copy(state.cooldownReadyAt),
  effects:copy(state.effects),usedRefs:[...state.usedRefs.slice(-255)],
  usedProofRefs:[...(n.chromaV4Meta.runeRuntime?.usedProofRefs??[])]};
 if(sourceRef)n.appliedRewardRefs.push(sourceRef);
 return n;
}
/** Returns a defeated enemy marker but NOT xp: the existing authoritative
 * battle reward transaction must commit the victory in the same CAS event. */
export function applyVerifiedV46RuneCast(s:LiveV46Save,a:CastAction,host:RuneTitleEventHost){
 verified(s,host,'rune_cast',a.sourceRef,a.proofRef);
 if((s.chromaV4Meta?.runeRuntime?.usedProofRefs??[]).includes(a.proofRef))
  throw Error('V46_RUNE_PROOF_ALREADY_CONSUMED');
 if((s.chromaV4Meta?.runeRuntime?.usedProofRefs??[]).length>=10000)
  throw Error('V46_RUNE_PROOF_LEDGER_FULL');
 const allowed=new Set(['sourceRef','proofRef','skillId','target','serverSecond',
  'confirmedPlayerChoice','durationSeconds','channelSeconds','preparedSeconds','hitLocation']);
 if(Object.keys(a).some(k=>!allowed.has(k)))throw Error('V46_UNTRUSTED_CAST_FIELDS');
 if(!a.confirmedPlayerChoice||!Object.hasOwn(RUNE_SKILLS,a.skillId)||
  !Number.isSafeInteger(a.serverSecond)||a.serverSecond<0||
  !s.chromaV4Meta!.learnedSkills.includes(a.skillId)||
  !s.unlockedSkills?.includes(a.skillId))
  throw Error('V46_RUNE_NOT_LEARNED_OR_TIME_INVALID');
 if(a.target==='enemy'&&!s.activeEncounter)throw Error('V46_NO_ACTIVE_ENEMY');
 if(s.activeEncounter?.enemyHp===0)throw Error('V46_ENEMY_ALREADY_DEFEATED');
 if(!['self','enemy'].includes(a.target))throw Error('V46_TARGET_NOT_SUPPORTED');
 if(['rulers_touch','rulers_authority'].includes(a.skillId))
  throw Error('V46_TELEKINESIS_REQUIRES_WORLD_OBJECT_LEDGER');
 const runtime=reconstruct(s,host);
 const target=a.target==='self'?'hero.chroma':s.activeEncounter!.enemyRef;
 const now=Math.max(a.serverSecond,runtime.nowSecond+1);
 const cast:RuneCast={sourceRef:a.sourceRef,proofRef:a.proofRef,
  encounterRef:s.activeEncounter?.startedRef??a.proofRef,
  nowSecond:now,skillId:a.skillId,targetIds:[target],
  confirmedHit:a.target==='self'||host.confirmRuneHit(a.sourceRef,a.proofRef,target),
  ...(a.durationSeconds!==undefined?{durationSeconds:a.durationSeconds}:{}),
  ...(a.channelSeconds!==undefined?{channelSeconds:a.channelSeconds}:{}),
  ...(a.preparedSeconds!==undefined?{preparedSeconds:a.preparedSeconds}:{}),
  ...(a.hitLocation!==undefined?{hitLocation:a.hitLocation}:{})};
 const result=executeRuneCast(runtime,cast,{verifySavedAction:()=>true});
 const next=writeBack(s,result.state,a.sourceRef);
 next.chromaV4Meta!.runeRuntime!.usedProofRefs.push(a.proofRef);
 return {next,receipt:result.receipt,enemyDefeated:!!s.activeEncounter&&s.activeEncounter.enemyHp>0&&next.activeEncounter!.enemyHp===0,
  defeatTargetRef:s.activeEncounter?.enemyRef??null};
}
export function applyVerifiedV46EquipTitle(s:LiveV46Save,e:{sourceRef:string;proofRef:string;
 titleId:TitleId|null;confirmedPlayerChoice:true},host:RuneTitleEventHost):LiveV46Save{
 verified(s,host,'equip_title',e.sourceRef,e.proofRef);
 if(!e.confirmedPlayerChoice)throw Error('V46_TITLE_PLAYER_CHOICE_REQUIRED');
 const result=equipVerifiedTitle(toV4Player(s),e.titleId);
 const n=copy(s);n.chromaV4Meta!.activeTitle=result.activeTitle;
 n.appliedRewardRefs.push(e.sourceRef);return n;
}
export function applyVerifiedV46TitleGrant(s:LiveV46Save,e:{sourceRef:string;proofRef:string;
 titleId:TitleId},host:RuneTitleEventHost):LiveV46Save{
 verified(s,host,'title_grant',e.sourceRef,e.proofRef);
 const result=grantVerifiedTitle(toV4Player(s),e,{verifyTitleClear:host.verifyTitleClear});
 const n=copy(s);n.chromaV4Meta!.titleIds=[...result.titleIds];
 n.appliedRewardRefs.push(e.sourceRef);return n;
}
export function applyVerifiedV46RuneChallenge(s:LiveV46Save,e:{sourceRef:string;proofRef:string;
 challengeId:RuneChallengeId},host:RuneTitleEventHost):LiveV46Save{
 verified(s,host,'rune_challenge',e.sourceRef,e.proofRef);
 const result=grantVerifiedChallengeRune(toV4Player(s),e,{challengeComplete:host.verifyChallengeClear});
 const n=copy(s);n.chromaV4Meta!.runeStones={...result.player.runeStones};
 n.appliedRewardRefs.push(e.sourceRef,`rune.challenge.${e.challengeId}`);
 return n;
}
/** Read-only rendering of a known title/rune; no gameplay side effect. */
export function readV46AbilityStatus(s:LiveV46Save){
 if(!s.chromaV4Meta)throw Error('V46_META_MISSING');
 const runtime=s.chromaV4Meta.runeRuntime??emptyRuneRuntime();
 return {runesLearned:[...s.chromaV4Meta.learnedSkills],runesHeld:{...s.chromaV4Meta.runeStones},
  mastery:copy(runtime.mastery),titles:[...s.chromaV4Meta.titleIds],
  activeTitle:s.chromaV4Meta.activeTitle,
  availableTitles:Object.entries(TITLE_DEFS).map(([id,d])=>({id,name:d.name}))};
}

/** Integrate the one-use Unbroken protection without a synthetic title-cast
 * event. The incoming damage must already have been calculated by the live
 * combat exchange, and the combat exchange itself is the audit sourceRef. */
export function applyV46UnbrokenDefense(s:LiveV46Save,e:{sourceRef:string;
 incomingPhysicalDamage:number;maxHp:number}):{next:LiveV46Save;damage:number;prevented:number}{
 if(!valid(e.sourceRef)||!Number.isSafeInteger(e.incomingPhysicalDamage)||
    e.incomingPhysicalDamage<0||!positive(e.maxHp))
  throw Error('V46_TITLE_DAMAGE_INPUT_INVALID');
 const m=s.chromaV4Meta;
 if(!m||!s.storyFlags.includes('chroma_crossover_v4')||
    !s.activeEncounter||s.appliedRewardRefs.includes(e.sourceRef))
  return {next:s,damage:e.incomingPhysicalDamage,prevented:0};
 const battleId=s.activeEncounter.startedRef;
 const ledger=copy(m.titleBattleLedger??emptyTitles());
 if(ledger.battleId!==battleId){ledger.battleId=battleId;
  ledger.spentAbilityKeys=[];ledger.activeUntil={};ledger.appliedSourceRefs=[];}
 let damage=e.incomingPhysicalDamage,prevented=0;
 if(m.activeTitle==='unbroken'&&m.titleIds.includes('unbroken')&&
    s.hp/e.maxHp<.2&&!ledger.spentAbilityKeys.includes('tenacity_critical_hp')&&damage>0){
  prevented=Math.round(damage*.35);damage-=prevented;
  ledger.spentAbilityKeys.push('tenacity_critical_hp');
  ledger.appliedSourceRefs.push(e.sourceRef);
 }
 const n=copy(s);n.chromaV4Meta!.titleBattleLedger=ledger;
 return {next:n,damage,prevented};
}


/** Apply actual burning/poison damage after a confirmed combat exchange.
 * Enemies and HP are reloaded from the saved battle; no client-supplied targets.
 * A DOT kill is only evidence for the caller's existing victory commit path. */
export function advanceVerifiedV46RuneTime(s:LiveV46Save,e:{serverSecond:number},
 host:RuneTitleEventHost):{next:LiveV46Save;enemyDefeated:boolean}{
 const runtime=s.chromaV4Meta?.runeRuntime;
 if(!runtime)return {next:s,enemyDefeated:false};
 if(!Number.isSafeInteger(e.serverSecond)||e.serverSecond<runtime.nowSecond)
  throw Error('V46_RUNE_CLOCK_BACKWARDS');
 const state=reconstruct(s,host);
 if(e.serverSecond===state.nowSecond)return {next:s,enemyDefeated:false};
 // All actual effects have finite life. Avoid iterating over every second of
 // a multi-day timeskip after they are gone.
 const lastExpiry=state.effects.reduce((m,x)=>Math.max(m,x.expiresSecond),state.nowSecond);
 const effectiveUntil=Math.min(e.serverSecond,lastExpiry);
 let ticked=effectiveUntil>state.nowSecond?
  tickRuneEffects(state,effectiveUntil):state;
 ticked={...ticked,nowSecond:e.serverSecond,
  effects:ticked.effects.filter(x=>x.expiresSecond>e.serverSecond)};
 const n=writeBack(s,ticked);
 return {next:n,enemyDefeated:!!n.activeEncounter&&n.activeEncounter.enemyHp===0};
}


/** Canonical two-stage ruler skill. A feat and mastery 6 are both required;
 * there is no second random drop and the initial skill is replaced. */
export function applyVerifiedV46RulerEvolution(s:LiveV46Save,e:{sourceRef:string;
 proofRef:string;confirmedPlayerChoice:true},host:RuneTitleEventHost):LiveV46Save{
 verified(s,host,'rune_evolve',e.sourceRef,e.proofRef);
 if(!e.confirmedPlayerChoice||!host.verifyEvolutionFeat(e.proofRef))
  throw Error('V46_RULER_EVOLUTION_FEAT_REQUIRED');
 const state=reconstruct(s,host);
 const after=evolveRulersTouch(state,{sourceRef:e.sourceRef,proofRef:e.proofRef,
  confirmedFeat:true},{verifyEvolutionFeat:host.verifyEvolutionFeat});
 const n=writeBack(s,after,e.sourceRef);
 n.chromaV4Meta!.learnedSkills=after.learnedSkills.filter(x=>
  Object.hasOwn(RUNE_SKILLS,x));
 n.unlockedSkills=[...(n.unlockedSkills??[]).filter(x=>x!=='rulers_touch'),
  'rulers_authority'];
 return n;
}
