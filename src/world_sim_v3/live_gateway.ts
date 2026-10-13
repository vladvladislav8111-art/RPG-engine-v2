/** One authoritative CONTROL read per batch; optional bounded live offer read. */
import {config} from '../config.ts';
import {sheetsBatchGet} from '../google.ts';
import {dispatchWorldV3Batch,type WorldV3BatchRequest} from './runtime_facade.ts';
import {attachAuthoritativeWorldSources,parseLiveClock} from './source_bridge.ts';
export async function simulateWorldV3BatchLive(req:WorldV3BatchRequest){
 const liveBoard=Array.isArray(req.jobs)&&req.jobs.some(j=>j.operation==='offer_board'&&j.payload?.boardMode==='CURRENT_SOURCE_ONLY');
 const liveSkills=Array.isArray(req.jobs)&&req.jobs.some(j=>j.operation==='capability_check'||(j.operation==='craft_advance'&&j.payload?.taskKind!==undefined)||j.operation==='task_plan'||(j.operation==='workshop_capacity'&&j.payload?.taskPlanV1!==undefined));
 const ranges=['CONTROL!A1:D15',...(liveBoard?['OPPORTUNITIES_CURRENT!A1:W500']:[]),...(liveSkills?['COMPETENCES!A1:L100','SPECIALIZATIONS!A1:I200','CHARACTERISTICS!A1:H100','MILESTONES!A1:L200']:[])];
 const source=await sheetsBatchGet(config.files.TEMP_RUNTIME,ranges);
 const clock=parseLiveClock(source['CONTROL!A1:D15']??[]);
 const result=dispatchWorldV3Batch(req,clock.saveId);
 return attachAuthoritativeWorldSources({request:req,result,clock,
   opportunityRows:liveBoard?source['OPPORTUNITIES_CURRENT!A1:W500']??[]:undefined,
   skillRows:liveSkills?{competences:source['COMPETENCES!A1:L100']??[],specializations:source['SPECIALIZATIONS!A1:I200']??[],characteristics:source['CHARACTERISTICS!A1:H100']??[],milestones:source['MILESTONES!A1:L200']??[]}:undefined});
}
