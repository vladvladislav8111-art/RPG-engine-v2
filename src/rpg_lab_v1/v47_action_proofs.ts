/** RPG Lab v4.7: bind ordinary player actions to the current CAS journal event.
 * A confirmed combat spell or equipped title is itself an authorized event;
 * it must not require a SECOND uncommitted/synthetic proof event.
 * Earned titles, challenges and special feats still require independent evidence.
 * No KV writes here. The existing Lab commit is responsible for atomicity.
 */
export type CurrentActionKind='rune_cast'|'equip_title';
const REF=/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/;
const PROJECT='chroma_orario_main_20261120';
const SESSION='chroma_day0_20261120';
const HERO='hero.chroma';
function valid(s:unknown):s is string{return typeof s==='string'&&REF.test(s);}

/** Identical across replay; bounded to a short sourceRef for 80-char saves.
 * This is a correlation token, NOT a cryptographic signature or authority. */
export function currentActionProofRef(sourceRef:string,kind:CurrentActionKind):string{
 if(!valid(sourceRef)||!['rune_cast','equip_title'].includes(kind))
  throw Error('V47_PROOF_EVENT_INVALID');
 let a=2166136261>>>0,b=2166136261>>>0;
 const input=`v47|${kind}|${sourceRef}`;
 for(let i=0;i<input.length;i++){
  const c=input.charCodeAt(i);a=Math.imul(a^c,16777619);
  b=Math.imul(b^(c+i),16777619);
 }
 return `v47.proof.${kind}.${(a>>>0).toString(16).padStart(8,'0')}${(b>>>0).toString(16).padStart(8,'0')}`;
}

/** The only authority is the trusted caller: existing CAS event processor.
 * The action, player identity, and sourceRef must all agree with that event.
 * A caller-controlled proofRef never authorizes a different action. */
export function confirmCurrentPlayerAction(args:{
 projectId:string;sessionId:string;heroId:string|undefined;
 actionKind:string;requestedKind:string;sourceRef:string;
 proofRef:string;playerApproved:boolean;
}):boolean{
 if(args.projectId!==PROJECT||args.sessionId!==SESSION||args.heroId!==HERO||
  args.playerApproved!==true||!valid(args.sourceRef)||!valid(args.proofRef)||
  !['rune_cast','equip_title'].includes(args.actionKind)||
  args.requestedKind!==args.actionKind)return false;
 return args.proofRef===currentActionProofRef(args.sourceRef,args.actionKind as CurrentActionKind);
}

/** Grants and feats require a DIFFERENT prior event in the same campaign,
 * within a comparable narrative clock, not a claim about a future event.
 * Note: rolling journal entries may be archived; do not auto-bypass on misses. */
export function confirmHistoricProof(args:{
 proofKind:string;expectedKind:string;proofTime:string;
 actionTime:string;proofRef:string;sourceRef:string;
}):boolean{
 if(!valid(args.proofRef)||!valid(args.sourceRef)||
  args.proofRef===args.sourceRef||args.proofKind!==args.expectedKind)return false;
 const m=/^(?:D\s*|Day\s+|День\s+)(\d+)\s*,?\s+(\d\d):(\d\d)$/iu;
 const p=m.exec(args.proofTime),a=m.exec(args.actionTime);
 if(!p||!a)return false;
 const minute=(x:RegExpExecArray)=>{
  const day=Number(x[1]),h=Number(x[2]),min=Number(x[3]);
  return Number.isSafeInteger(day)&&day>=0&&day<=100000&&h<=23&&min<=59?
   day*1440+h*60+min:null;
 };
 const pp=minute(p),aa=minute(a);
 return pp!==null&&aa!==null&&pp<=aa;
}
