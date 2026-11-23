/** Bound derived identifiers without changing established short legacy refs. */
export function boundedChildRef(parent:string,prefix:string,suffix:string):string{
 const valid=/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/;
 if(!valid.test(parent)||!/^[A-Za-z_.:-]*$/.test(prefix+suffix))
  throw Error("LAB_CHILD_REF_INVALID");
 const original=prefix+parent+suffix;
 if(valid.test(original))return original;
 let h=0xcbf29ce484222325n;
 for(const c of original)h=BigInt.asUintN(64,(h^BigInt(c.charCodeAt(0)))*0x100000001b3n);
 return "child."+h.toString(16).padStart(16,"0")+"."+parent.slice(0,40);
}
