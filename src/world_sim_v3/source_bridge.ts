/** Source-grounded V3 planning aids; NEVER a commit, authority token, or payout. */
import {deny,pass,type SimOutcome} from './types.ts';
import type {SemanticSimulationProposal} from './orchestrator.ts';
import {evaluateCapability,readAuthoritativeRatings,TASK_PROFILES,type TaskKind,type SkillRows} from '../proficiency.ts';
import {previewCraftV4,type CraftV4PreviewInput} from "../crafting_v4.ts";

export type RuntimeClock={saveId:string;day:number;time:string;locationId:string;sceneId:string};
export type PreparedTurnHint={
 schema:'RPG_V3_SEMANTIC_DRAFT_V1';expectedSaveId:string;sourceClockVerified:true;
 requiresPlayerApproval:true;requiresGmCausalResolution:true;committed:false;
 semantic:{elapsedSeconds:number;session:{inworldStart:string;inworldEnd:string;sceneId:string;actionSummary:string;source:'WORLD_V3_DRAFT_REQUIRES_GM_REVIEW'}};
 omissions:readonly string[];
};
function isRecord(x:unknown):x is Record<string,unknown>{return x!==null&&typeof x==='object'&&!Array.isArray(x);}
export function parseLiveClock(controlRows:unknown[][]):RuntimeClock{
 if(controlRows.length<6||controlRows.length>100||!Array.isArray(controlRows[0]))throw Error('CONTROL_SOURCE_MISSING');
 const fields=controlRows[0].map(String),k=fields.indexOf('Key'),v=fields.indexOf('Value');
 if(k<0||v<0)throw Error('CONTROL_COLUMNS_MISSING');
 const entries=new Map<string,unknown>();for(const row of controlRows.slice(1)){if(!Array.isArray(row))throw Error('CONTROL_SOURCE_MALFORMED');const id=String(row[k]??'');if(id&&entries.has(id))throw Error('CONTROL_DUPLICATE_KEY');entries.set(id,row[v]);}
 const saveId=String(entries.get('save_id')??''),time=String(entries.get('world_time')??'');
 const day=Number(entries.get('world_day'));
 const locationId=String(entries.get('current_location_id')??''),sceneId=String(entries.get('current_scene_id')??'');
 if(!/^V2-S[0-9]+(?:-[A-Z0-9]+)*$/.test(saveId)||!Number.isSafeInteger(day)||day<1||!/^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(time)||!locationId||!sceneId)throw Error('CONTROL_INVALID_CLOCK');
 return {saveId,day,time,locationId,sceneId};
}
export function clockMinute(c:RuntimeClock):number{const [h,m]=c.time.split(':').map(Number);return c.day*1440+h*60+m;}
function moment(total:number):string{const day=Math.floor(total/1440),remaining=total%1440;const h=Math.floor(remaining/60),m=remaining%60;return `Day${day} ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;}
/** Derive only clock and session fields. GM must resolve NPC processes/survival/XP separately. */
export function boundedTurnSemanticHint(input:{clock:RuntimeClock;proposal:SemanticSimulationProposal;playerActionReference?:unknown;playerActionSummary?:unknown}):SimOutcome<PreparedTurnHint>{
 const {clock,proposal:p}=input;
 if(!isRecord(p)||p.actorId!=='actor.shura'||p.expectedSaveId!==clock.saveId||p.startMinute!==clockMinute(clock)||p.endMinute<p.startMinute||p.endMinute-p.startMinute>10080||!Number.isSafeInteger(p.endMinute)||!Number.isSafeInteger(p.startMinute))return deny('WORLD_V3_CLOCK_MISMATCH','Preview not rooted in actual saved world clock');
 // Player intent must be confirmed by GM from actual chat, NOT inferred from generic inputs.
 if(typeof input.playerActionReference!=='string'||!/^[a-zA-Z0-9._:-]{8,180}$/.test(input.playerActionReference)||typeof input.playerActionSummary!=='string'||input.playerActionSummary.trim().length<8||input.playerActionSummary.length>350)return deny('PLAYER_ACTION_NOT_ATTESTED','No separately documented player choice; cannot draft their action');
 const start=moment(p.startMinute),end=moment(p.endMinute);
 return pass({schema:'RPG_V3_SEMANTIC_DRAFT_V1',expectedSaveId:clock.saveId,sourceClockVerified:true,requiresPlayerApproval:true,requiresGmCausalResolution:true,committed:false,
  semantic:{elapsedSeconds:(p.endMinute-p.startMinute)*60,session:{inworldStart:start,inworldEnd:end,sceneId:clock.sceneId,actionSummary:input.playerActionSummary.trim(),source:'WORLD_V3_DRAFT_REQUIRES_GM_REVIEW'}},
  omissions:['No authoritative causal NPC decision','No completed craft/order without quality evidence','No player money, SUP, XP, titles or inventory writes','No automatic consent or path choice','No automatic semantic prepare/commit']});
}
export type CurrentOpportunity={offerId:string;issuerId:string;locationId:string;description:string;priceLabel:string;slotsRemaining:number;sourceRef:string;expiresAt:string|null;gmVisibilityOnly:true;playerAccepted:false;moneyVerified:false;};
function int(x:unknown){const n=Number(x);return Number.isSafeInteger(n)&&n>=0?n:null;}
/** Read-only discovery. LIVE posts are not proof of cash/escrow and NEVER auto-payout. */
export function availableCurrentOpportunities(input:{clock:RuntimeClock;rows:unknown[][];maxResults?:number}):SimOutcome<{source:'OPPORTUNITIES_CURRENT';listed:CurrentOpportunity[];excluded:number;authoritativeFunding:false;committed:false}>{
 const {clock,rows}=input;
 if(!Array.isArray(rows)||!Array.isArray(rows[0])||rows.length>501)return deny('OFFER_SOURCE_UNAVAILABLE','No bounded authoritative opportunity source');
 const cols=rows[0].map(x=>String(x??''));const required=['Offer ID','Employer','Location/start','Task','State','Available Day','Available Time','Expires Day','Expires Time','Slots Remaining','Lifecycle State','Source/opportunity'];
 if(required.some(k=>!cols.includes(k)))return deny('OFFER_SCHEMA_UNKNOWN','Current opportunity schema does not match');
 const read=(row:unknown[],key:string)=>String(row[cols.indexOf(key)]??'').trim();
 const limit=input.maxResults??12;if(!Number.isSafeInteger(limit)||limit<1||limit>24)return deny('OFFER_PAGE_BOUNDS','Page capped at 24');
 const indexed:CurrentOpportunity[]=[];let excluded=0;const seen=new Set<string>();const now=clockMinute(clock);
 for(const row of rows.slice(1)){
  if(!Array.isArray(row)){excluded++;continue;}const id=read(row,'Offer ID');if(!id)continue;
  const lifecycle=read(row,'Lifecycle State').toUpperCase(),state=read(row,'State').toUpperCase();
  const slots=int(read(row,'Slots Remaining'));const employer=read(row,'Employer'),location=read(row,'Location/start'),task=read(row,'Task'),source=read(row,'Source/opportunity');
  if(seen.has(id)){return deny('OFFER_ID_DUPLICATED','Duplicate source offer ID; refuse discovery board');}seen.add(id);
  if(!['AVAILABLE','OPEN'].includes(lifecycle)||!(state==='AVAILABLE'||state==='OPEN'||state.startsWith('AVAILABLE /')||state.startsWith('OPEN /'))||slots===null||slots<1||!employer||!location||!task||!source){excluded++;continue;}
  const ad=int(read(row,'Available Day')),ed=int(read(row,'Expires Day'));
  const at=read(row,'Available Time'),et=read(row,'Expires Time');
  const parse=(d:number|null,t:string):number|null=>{if(d==null||!/^([01][0-9]|2[0-3]):[0-5][0-9]/.test(t))return null;return d*1440+Number(t.slice(0,2))*60+Number(t.slice(3,5));};
  const available=parse(ad,at),expires=parse(ed,et);
  if(available===null||expires===null||now<available||now>=expires||expires<=available){excluded++;continue;}
  indexed.push({offerId:id,issuerId:employer,locationId:location,description:task,priceLabel:read(row,'Pay'),slotsRemaining:slots,sourceRef:source,expiresAt:`Day${ed} ${et}`,gmVisibilityOnly:true,playerAccepted:false,moneyVerified:false});
 }
 indexed.sort((a,b)=>a.offerId.localeCompare(b.offerId));return pass({source:'OPPORTUNITIES_CURRENT',listed:indexed.slice(0,limit),excluded:excluded+Math.max(0,indexed.length-limit),authoritativeFunding:false,committed:false});
}

import type {WorldV3BatchRequest,WorldV3BatchResult} from './runtime_facade.ts';
/** Source enrichment is kept pure and testable; caller performs the actual bounded live Sheet read. */
export function attachAuthoritativeWorldSources(input:{
 request:WorldV3BatchRequest;result:WorldV3BatchResult;clock:RuntimeClock;
 opportunityRows?:unknown[][];
 skillRows?:SkillRows;
}):WorldV3BatchResult&{sourceBridge:{clockVerified:true;clock:{day:number;time:string};financialAuthority:false}}{
 const {request,result,clock}=input;
 if(request.expectedSaveId!==clock.saveId||result.expectedSaveId!==clock.saveId)throw Error('WORLD_V3_STALE_SAVE');
 const out:WorldV3BatchResult={...result,results:result.results.map((item)=>({id:item.id,operation:item.operation,result:item.result}))};
 for(const item of out.results){const job=request.jobs.find(j=>j.id===item.id)!;
  if(job.operation==='turn'){
    if(job.payload.now!==clockMinute(clock)){
      item.result=deny('WORLD_V3_LIVE_CLOCK_MISMATCH','Model/GM supplied clock differs from current committed source');
      continue;
    }
    if(!item.result.ok)continue;
    const hint=boundedTurnSemanticHint({clock,proposal:item.result.value as SemanticSimulationProposal,playerActionReference:job.payload.playerActionReference,playerActionSummary:job.payload.playerActionSummary});
    item.result=pass({proposal:item.result.value,semanticAssistance:hint,sourceClockVerified:true,committed:false});
  }
  if(job.operation==='capability_check'||(job.operation==='craft_advance'&&job.payload.taskKind!==undefined)){
    const kind=job.payload.taskKind;
    if(!input.skillRows){item.result=deny('SKILL_SOURCE_MISSING','No verified live skill rows');continue;}
    if(typeof kind!=='string'||!Object.prototype.hasOwnProperty.call(TASK_PROFILES,kind)){
      item.result=deny('UNKNOWN_CRAFT_TASK','Unregistered task kind');continue;
    }
    try{
      const capability=evaluateCapability(kind as TaskKind,readAuthoritativeRatings(input.skillRows),job.payload.difficulty as number);
      const config=job.payload.craftV4 as Partial<CraftV4PreviewInput>|undefined;
      if(config!==undefined&&(typeof config!=='object'||config===null||Array.isArray(config))){
        item.result=deny('CRAFT_V4_INVALID_PLAN','Structured craftV4 configuration required');continue;
      }
      if(job.operation==='capability_check'){
        item.result=pass(config?{...capability,craftingV4:previewCraftV4({
          ...config,capability,availableStaffedMinutes:config.availableStaffedMinutes??0,
          priorStageProgressMinutes:config.priorStageProgressMinutes??0,
        } as CraftV4PreviewInput)}:capability);
      }else{
        const order=job.payload.order as {makerId?:string;recipeId?:string;progressMinutes:number;requiredMinutes:number}|undefined;
        if(!order||order.makerId!=='actor.shura'){item.result=deny('NONPLAYER_SKILL_NOT_VERIFIED','Shura ratings cannot be used for NPC orders');continue;}
        if(!item.result.ok)continue;
        const current=item.result.value as {additionalWorkMinutes:number;newProgressMinutes:number};
        if(config){
          // Staged V4 is opt-in. A legacy aggregate order cannot silently change scope.
          const preview=previewCraftV4({...config,capability,
            availableStaffedMinutes:current.additionalWorkMinutes,
            priorStageProgressMinutes:order.progressMinutes} as CraftV4PreviewInput);
          if(order.recipeId!==preview.recipeId||order.requiredMinutes!==preview.normativeMinutes||
             (config.priorStageProgressMinutes!==undefined&&config.priorStageProgressMinutes!==order.progressMinutes)){
            item.result=deny('CRAFT_V4_ORDER_STAGE_MISMATCH','Stage progress and source order must describe identical work');continue;
          }
          const stageDone=preview.readyForNextStage;
          item.result=pass({...current,newProgressMinutes:preview.newStageProgressMinutes,
            nextStatus:stageDone&&preview.requiresInspection?'quality_check':'working',
            requiresIndependentQualityCheck:stageDone&&preview.requiresInspection,
            actualStaffedMinutes:preview.actualStaffedMinutesUsed,
            workEquivalentMinutes:preview.effectiveWorkMinutes,
            craftV4:preview,stageComplete:stageDone,
            sourceVerifiedSkillOnly:true,requiresGmCausalResolution:true,
            notACommit:true});
        }else{
          const remaining=Math.max(0,order.requiredMinutes-order.progressMinutes);
          const effective=Math.min(remaining,Math.floor(current.additionalWorkMinutes*capability.efficiencyFactor));
          const complete=order.progressMinutes+effective>=order.requiredMinutes;
          const actual=effective===0?0:Math.min(current.additionalWorkMinutes,Math.ceil(effective/capability.efficiencyFactor));
          item.result=pass({...current,newProgressMinutes:order.progressMinutes+effective,
            nextStatus:complete?'quality_check':'working',requiresIndependentQualityCheck:complete,
            workEquivalentMinutes:effective,actualStaffedMinutes:actual,
            capability,sourceVerifiedSkillOnly:true,requiresGmCausalResolution:true});
        }
      }
    }catch(err){item.result=deny('SKILL_EVALUATION_REJECTED',err instanceof Error?err.message:'Invalid source');}
  }
  if(job.operation==='offer_board'&&job.payload.boardMode==='CURRENT_SOURCE_ONLY'){
    item.result=input.opportunityRows
      ?availableCurrentOpportunities({clock,rows:input.opportunityRows,maxResults:job.payload.maxOffers as number|undefined})
      :deny('OFFER_SOURCE_UNAVAILABLE','Authoritative live opportunity data not loaded');
  }
 }
 return {...out,sourceBridge:{clockVerified:true,clock:{day:clock.day,time:clock.time},financialAuthority:false}};
}
