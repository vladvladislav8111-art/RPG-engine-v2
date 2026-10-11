/** RPG V2 World Simulation V3. All functions are pure GM-assistance, never live commits. */
export type EntityId = string;
export type WorldMinute = number;
export type Domain = 'trade'|'craft'|'travel'|'combat'|'knowledge'|'social'|'survival'|'exploration'|'system';
export type Evidence = {id:string; kind:string; actorId:string; worldMinute:WorldMinute; sourceRef:string; independentlyVerified:boolean; domain:Domain;significance?:'routine'|'meaningful'|'major'|'landmark';noveltyVerified?:boolean};
export type Fact = {id:string; value:string; sourceRef:string; learnedAt:WorldMinute; confidence:'verified'|'reported'|'suspected'; knownBy:string[]};
export type SimOutcome<T> = {ok:true; value:T} | {ok:false; code:string; reason:string};
export function pass<T>(value:T):SimOutcome<T>{return {ok:true,value};}
export function deny<T=never>(code:string,reason:string):SimOutcome<T>{return {ok:false,code,reason};}
export function finite(value:number,name:string):void {if(!Number.isSafeInteger(value)||value<0)throw Error(`${name} must be a nonnegative safe integer`);}
export function positive(value:number,name:string):void {finite(value,name); if(value===0)throw Error(`${name} must be positive`);}
export function canonicalId(id:string):boolean {return typeof id==='string'&&id.length>=4&&id.length<=180&&/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/i.test(id);}
export function unique<T>(values:readonly T[]):boolean{return new Set(values).size===values.length;}
/** Single stable 32-bit PRNG, for genuinely unresolved uncertainty; NO authority creation. */
export function seed32(value:string):number {let h=2166136261>>>0;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
export function deterministicDraw(seed:string,min:number,max:number):number{finite(min,'min');finite(max,'max');if(max<min)throw Error('invalid RNG bounds');const range=max-min+1;if(range>0x100000000)throw Error('range too large');return min+(seed32(seed)%range);}
