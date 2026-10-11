/** Heavy, ON-DEMAND nomination audit; never scan full SESSION_LOG on ordinary turns. */
import {isId,reject,unique,type VerifiedContact} from './types.ts';
export type CommittedSessionReceipt={txId:string;turnId:string;inworldEnd:string;source:string;stateHash:string;isCommitted:boolean};
export function crossCheckContactReceipts(input:{actorId:string;claimed:readonly VerifiedContact[];receipts:readonly CommittedSessionReceipt[]}):{ok:true;code:'NPC_CONTACT_PROOFS_V4';verified:VerifiedContact[];unverifiedEventIds:string[];noAutomaticNomination:true}|{ok:false;code:string;reason:string}{
 if(!isId(input.actorId)||input.claimed.length>256||input.receipts.length>512)return reject('PROOF_PAGE_REQUIRED','Use exact bounded committed receipt pages for this actor');
 if(!unique(input.claimed.map(x=>x.eventId))||!unique(input.receipts.map(x=>x.txId)))return reject('DUPLICATE_SOURCE_RECEIPT','A committed turn can only be used once in one proof set');
 const map=new Map(input.receipts.map(r=>[r.txId,r]));
 const verified:VerifiedContact[]=[],unverifiedEventIds:string[]=[];
 for(const c of input.claimed){
  if(c.actorId!==input.actorId||!isId(c.eventId)||!isId(c.sourceRef))return reject('INVALID_CONTACT_PROOF','Actor and exact committed TX reference required');
  const receipt=map.get(c.sourceRef);
  const d=/^Day(\d+)\s+(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(receipt?.inworldEnd??'');
  const day=d?Number(d[1]):null;
  const match=!!receipt&&receipt.isCommitted&&receipt.source!=='META'&&!!receipt.stateHash&&day===c.day;
  if(match)verified.push({...c,committed:true});else unverifiedEventIds.push(c.eventId);
 }
 return {ok:true,code:'NPC_CONTACT_PROOFS_V4',verified,unverifiedEventIds,noAutomaticNomination:true};
}
