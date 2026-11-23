/** Versioned, deterministic child sourceRefs for an already-verified rune kill.
 * The source event is separately recorded in the immutable CAS journal.
 * Event reference limit in RPG Lab: 80 ASCII characters.
 */
const VALID_REF=/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/;
export type RuneVictoryCause='direct'|'dot';
export function childRuneVictoryRef(sourceRef:string,cause:RuneVictoryCause):string{
 if(!VALID_REF.test(sourceRef)||!['direct','dot'].includes(cause))
  throw Error('V46_VICTORY_PARENT_REF_INVALID');
 let h=0xcbf29ce484222325n;
 const evidence=`${cause}|${sourceRef}`;
 for(let i=0;i<evidence.length;i++){
  h=BigInt.asUintN(64,(h^BigInt(evidence.charCodeAt(i)))*0x100000001b3n);
 }
 const digest=h.toString(16).padStart(16,'0');
 const ref=`v46.${cause}.${sourceRef.slice(0,28)}.${digest}`;
 if(!VALID_REF.test(ref))throw Error('V46_DERIVED_REF_INVALID');
 return ref;
}
