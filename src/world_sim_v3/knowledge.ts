import {deny,pass,unique,type Evidence,type Fact,type SimOutcome,type WorldMinute} from './types.ts';
export type Communication={eventId:string;fromId:string;toId:string;at:WorldMinute;factId:string;channel:'speech'|'letter'|'notice'|'witness';contactVerified:boolean;languageComprehension:'full'|'partial'|'none';};
/** Propagates ONLY knowledge already owned by speaker at the actual contact time. */
export function relayKnowledge(input:{facts:readonly Fact[];message:Communication;provenance:ReadonlyMap<string,Evidence>}):SimOutcome<Fact[]> {
 const {facts,message,provenance}=input;if(!message.contactVerified||message.languageComprehension==='none')return deny('NO_CONTACT','Cannot transmit facts without established contact and comprehension');
 if(message.fromId===message.toId)return deny('SELF_RELAY','No information gained');
 const fact=facts.find(f=>f.id===message.factId);if(!fact)return deny('UNKNOWN_FACT','Fact not materialized');
 if(!fact.knownBy.includes(message.fromId)||fact.learnedAt>message.at)return deny('EPISTEMIC_LEAK','Sender could not know this at contact');
 const evidence=provenance.get(message.eventId);if(!evidence?.independentlyVerified||evidence.worldMinute!==message.at||evidence.actorId!==message.fromId)return deny('UNVERIFIED_RELAY','No independently verified transmission event');
 if(message.languageComprehension==='partial')return deny('PARTIAL_MEANING','Partial comprehension requires GM-selected understood fragment, not full fact');
 return pass(facts.map(f=>f.id!==fact.id?f:{...f,knownBy:unique([...f.knownBy,message.toId])?[...f.knownBy,...(f.knownBy.includes(message.toId)?[]:[message.toId])]:f.knownBy}));
}
export function mayKnow(fact:Fact,npcId:string,at:WorldMinute):boolean{return fact.learnedAt<=at&&fact.knownBy.includes(npcId);}
