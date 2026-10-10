export type CanonicalSpecialization = {
  assetId: string;
  competenceId: string;
  runtimeName: string;
  observerRequired: boolean;
  state: string;
};

export function parseCanonicalSpecializations(rows: unknown[][]): CanonicalSpecialization[] {
  const h = rows[0]?.map(x=>String(x??""))??[];
  const col=(key:string)=>{const i=h.indexOf(key); if(i<0)throw new Error("Missing "+key); return i;};
  const iId=col("Canonical asset ID"), iComp=col("Competence ID"), iName=col("Runtime name");
  const iObs=col("Observer required"), iState=col("Catalog state");
  const found=new Set<string>();
  return rows.slice(1).filter(r=>r[iId]).map(r=>{
    const assetId=String(r[iId]),competenceId=String(r[iComp]),runtimeName=String(r[iName]);
    const key=competenceId+"::"+runtimeName;
    if(found.has(key))throw new Error("Duplicate specialization "+key);
    found.add(key);
    return {assetId,competenceId,runtimeName,observerRequired:String(r[iObs]).toUpperCase()==="YES",state:String(r[iState])};
  });
}
