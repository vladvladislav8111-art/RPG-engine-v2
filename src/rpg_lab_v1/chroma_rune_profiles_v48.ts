/** Executable profile math for the agreed rune lines. Does not grant skills.
 * World effects remain proof-gated; the profile alone cannot report a target.
 */
import design from "../data/chroma_v48_rune_design.json" with {type:"json"};
const lerp=(a:number,b:number,l:number)=>a+(b-a)*(l-1)/9;
export const V48_RUNE_LINES=design.runes;
export function runeProfile(id:string,l:number){
 if(!Number.isSafeInteger(l)||l<1||l>10)throw Error("V48_RUNE_LEVEL_INVALID");
 switch(id){
 case "minotaur_strength":return {strengthPct:lerp(5,15,l)};
 case "titan_might":return {strengthPct:lerp(15,30,l)};
 case "body_reserve":return {reservePct:lerp(10,30,l),spCostReductionPct:lerp(5,15,l)};
 case "overload":return {reservePct:30,spCostReductionPct:15,spPerMp:lerp(3,5,l)};
 case "dragon_blood":return {heatResistancePct:lerp(10,50,l)};
 case "blood_burning":return {heatResistancePct:50,boostPerMaxHpPct:lerp(1.5,2,l),maxCostPct:20,minRemainingHpPct:10,durationSeconds:60};
 case "regeneration":return {naturalHealMultiplier:lerp(1,2,l)};
 case "living_core":return {naturalHealMultiplier:2,healMaxHpPct:lerp(1,3,l),mp:Math.round(lerp(20,30,l)),durationSeconds:10};
 case "second_breath":return {breathMultiplier:lerp(2,10,l)};
 case "autonomous_breathing":return {breathMultiplier:10,mpPerMinute:Math.ceil(lerp(5,1,l))};
 case "echolocation":return {radius:lerp(10,100,l),mp:20,images:false};
 case "spatial_perception":return {radius:100,mp:25,images:true};
 case "sixth_sense":return {radius:lerp(5,30,l),leadSeconds:lerp(.3,2,l),direction:false};
 case "danger_harbinger":return {radius:30,leadSeconds:2,direction:true};
 case "soft_landing":return {fallReductionPct:lerp(10,50,l)};
 case "air_support":return {fallReductionPct:50,platforms:Math.floor(lerp(1,5,l)),mpPerPlatform:Math.ceil(lerp(10,5,l))};
 case "flexibility":return {mobilityPct:lerp(10,50,l),stage:Math.ceil(l/2)};
 case "anomalous_flexibility":return {mobilityPct:50,stage:5,anomalous:true};
 case "physical_shield":return {damageKind:"physical",maxHpPct:lerp(5,15,l),damagePerMp:lerp(5,10,l),layers:1};
 case "layered_shield":return {damageKind:"physical",maxHpPct:15,damagePerMp:10,layers:Math.floor(lerp(2,3,l))};
 case "pain_storage":return {storePct:lerp(10,30,l),capMaxHpPct:10};
 case "retribution":return {storePct:lerp(30,50,l),capMaxHpPct:15};
 case "immovability":return {knockbackResistancePct:lerp(20,60,l)};
 case "steadfast_fortress":return {knockbackResistancePct:60,activeResistancePct:lerp(60,85,l),mp:20};
 case "muscle_acceleration":return {powerPct:lerp(25,70,l),mp:Math.ceil(lerp(12,20,l)),moves:1};
 case "chain_power":return {powerPct:lerp(70,90,l),mp:Math.ceil(lerp(20,12,l)),moves:Math.floor(lerp(2,5,l))};
 case "edge_sharpness":return {sharpnessPct:lerp(10,40,l)};
 case "cleaving_blade":return {sharpnessPct:40,range:lerp(5,25,l),mp:20};
 case "piercing":return {piercing:Math.round(lerp(2,11,l))};
 case "breakthrough":return {piercing:11,activePiercing:Math.round(lerp(11,25,l)),mp:20};
 case "dragon_presence":return {fearPct:lerp(10,25,l),mp:20};
 case "dragon_authority":return {fearPct:lerp(25,40,l),mp:35};
 default:throw Error("V48_RUNE_UNKNOWN");
 }
}
export function runeBloodCost(maxHp:number,hp:number,level:number,percent:number){
 if(!Number.isSafeInteger(maxHp)||maxHp<1||!Number.isSafeInteger(hp)||hp>maxHp||hp<1||!Number.isSafeInteger(percent)||percent<5||percent>20)throw Error("V48_BLOOD_INVALID");
 const loss=Math.ceil(maxHp*percent/100);
 if(hp-loss<Math.ceil(maxHp*.1))throw Error("V48_BLOOD_HP_FLOOR");
 return {loss,bonusPct:percent*lerp(1.5,2,level),durationSeconds:60};
}
export function storeHostilePain(previous:number,actualHpLoss:number,maxHp:number,level:number,evolved:boolean){
 if(![previous,actualHpLoss,maxHp].every(n=>Number.isSafeInteger(n)&&n>=0)||maxHp<1||!Number.isSafeInteger(level)||level<1||level>10)throw Error("V48_PAIN_INVALID");
 return Math.min(Math.floor(maxHp*(evolved?.15:.1)),previous+Math.floor(actualHpLoss*lerp(evolved?30:10,evolved?50:30,level)/100));
}
