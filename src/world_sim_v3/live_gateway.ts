/**
 * LIVE ACCESS TO SOURCE SAVE-ID ONLY; all game simulation remains read-only.
 * Single bounded CONTROL read for a batch of up to 12 independent calculations.
 */
import {config} from '../config.ts';
import {sheetsBatchGet} from '../google.ts';
import {dispatchWorldV3Batch,type WorldV3BatchRequest} from './runtime_facade.ts';
export async function simulateWorldV3BatchLive(req:WorldV3BatchRequest){
 const source=await sheetsBatchGet(config.files.TEMP_RUNTIME,['CONTROL!B2']);
 const actual=source['CONTROL!B2']?.[0]?.[0];
 if(typeof actual!=='string'||!actual.trim())throw Error('WORLD_V3_SOURCE_SAVE_MISSING');
 return dispatchWorldV3Batch(req,actual);
}
