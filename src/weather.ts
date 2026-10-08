export type WeatherRecord = Record<string, unknown>;

function str(v: unknown): string { return String(v ?? "").trim(); }
function num(v: unknown, fallback = 0): number {
  const n = Number(str(v).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}
function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function minutes(time: string): number {
  const m = time.match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}
function absMinute(day: number, time: string): number { return day * 1440 + minutes(time); }
function fromAbs(total: number): { day: number; time: string } {
  const day = Math.floor(total / 1440);
  const m = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60), min = m % 60;
  return { day, time: String(h).padStart(2,"0")+":"+String(min).padStart(2,"0")+":00" };
}
function phase(time: string): string {
  const m = minutes(time);
  if (m >= 300 && m < 480) return "DAWN";
  if (m >= 480 && m < 660) return "MORNING";
  if (m >= 660 && m < 840) return "MIDDAY";
  if (m >= 840 && m < 1080) return "AFTERNOON";
  if (m >= 1080 && m < 1320) return "EVENING";
  return "NIGHT";
}
function weighted<T extends WeatherRecord>(rows: T[], seed: string, weightField = "Weight"): T {
  if (!rows.length) throw new Error("weather front table is empty");
  const total = rows.reduce((s,r)=>s+Math.max(0,num(r[weightField],1)),0);
  if (!(total > 0)) return rows[0];
  let pick=(hash32(seed)%1000000)/1000000*total;
  for(const row of rows){ pick-=Math.max(0,num(row[weightField],1)); if(pick<=0) return row; }
  return rows[rows.length-1];
}
function parseNext(value: unknown, all: WeatherRecord[]): Array<WeatherRecord & { Weight: number }> {
  const map=new Map(all.map(r=>[str(r["Front ID"]),r]));
  const out:Array<WeatherRecord & {Weight:number}>=[];
  for(const part of str(value).split(";").map(x=>x.trim()).filter(Boolean)){
    const [id,w]=part.split(":").map(x=>x.trim());
    const row=map.get(id);
    if(row) out.push({...row,Weight:num(w,1)});
  }
  return out.length ? out : all.map(r=>({...r,Weight:num(r["Weight"],1)}));
}
function durationMinutes(front: WeatherRecord, seed: string): number {
  const minH=Math.max(1,Math.round(num(front["Min hours"],6)));
  const maxH=Math.max(minH,Math.round(num(front["Max hours"],minH)));
  const h=minH+(hash32(seed)%(maxH-minH+1));
  return h*60;
}
function tempBase(profile: WeatherRecord,time:string): number {
  const p=phase(time);
  return num(profile[p+" °C"],12);
}

export function sheetObjects(rows: unknown[][]): WeatherRecord[] {
  if(!rows.length) return [];
  const h=rows[0].map(v=>str(v));
  return rows.slice(1).filter(r=>r.some(v=>str(v)!=="")).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??null])));
}

export function resolveSelarinWeatherRecords(input:{
  profileRows: WeatherRecord[];
  frontRows: WeatherRecord[];
  currentRows?: WeatherRecord[];
  targetDay: number;
  targetTime: string;
  zoneId?: string;
}){
  const profile=input.profileRows.find(r=>str(r["Status"]).toUpperCase()==="ACTIVE") ?? input.profileRows[0];
  if(!profile) throw new Error("Selarin weather profile missing");
  const fronts=input.frontRows.filter(r=>str(r["Status"]).toUpperCase()==="ACTIVE");
  if(!fronts.length) throw new Error("Selarin weather fronts missing");
  const zoneId=input.zoneId ?? (str(profile["Zone ID"]) || "weatherzone.selarin");
  const targetAbs=absMinute(input.targetDay,input.targetTime);
  let cur=(input.currentRows??[]).find(r=>str(r["Weather ID"])==="weather.selarin.current");
  let front:WeatherRecord;
  let lastDay:number,lastTime:string,nextDay:number,nextTime:string;
  let initialized=false, transitions=0;
  if(cur && str(cur["Front ID"])){
    front=fronts.find(r=>str(r["Front ID"])===str(cur!["Front ID"])) ?? fronts[0];
    lastDay=Math.round(num(cur["Last transition Day"],input.targetDay));
    lastTime=str(cur["Last transition Time"]) || input.targetTime;
    nextDay=Math.round(num(cur["Next transition Day"],input.targetDay));
    nextTime=str(cur["Next transition Time"]) || input.targetTime;
  }else{
    initialized=true;
    const bucketMinutes=Math.max(60,Math.round(num(profile["Transition bucket min"],180)));
    const anchorAbs=Math.floor(targetAbs/bucketMinutes)*bucketMinutes;
    const anchor=fromAbs(anchorAbs);
    front=weighted(fronts,zoneId+"|init|"+Math.floor(targetAbs/bucketMinutes));
    lastDay=anchor.day; lastTime=anchor.time;
    const n=fromAbs(anchorAbs+durationMinutes(front,zoneId+"|duration|"+Math.floor(anchorAbs/bucketMinutes)+"|"+str(front["Front ID"])));
    nextDay=n.day; nextTime=n.time;
  }
  for(let guard=0; guard<64 && targetAbs>=absMinute(nextDay,nextTime); guard++){
    const atDay=nextDay, atTime=nextTime;
    const choices=parseNext(front["Allowed next weighted"],fronts);
    front=weighted(choices,zoneId+"|next|"+atDay+"|"+atTime+"|"+str(front["Front ID"]));
    lastDay=atDay; lastTime=atTime;
    const n=fromAbs(absMinute(atDay,atTime)+durationMinutes(front,zoneId+"|duration|"+atDay+"|"+atTime+"|"+str(front["Front ID"])));
    nextDay=n.day; nextTime=n.time; transitions++;
  }
  const variance=Math.max(0,Math.round(num(profile["Temperature variance"],0)));
  const jitter=variance ? (hash32(zoneId+"|temp|"+input.targetDay+"|"+Math.floor(minutes(input.targetTime)/180))%(variance*2+1))-variance : 0;
  const air=Math.round((tempBase(profile,input.targetTime)+num(front["Temp offset °C"],0)+jitter)*10)/10;
  return {
    initialized, transitions,
    record:{
      "Weather ID":"weather.selarin.current",
      "Time":`Day${input.targetDay} ${input.targetTime}`,
      "Zone":zoneId,
      "Air °C":air,
      "Sky":front["Sky"],
      "Wind":front["Wind"],
      "Precipitation overnight":front["Precipitation"],
      "Ground":front["Ground"],
      "Visibility/light":front["Visibility/light"],
      "Exposure note":front["Exposure note"],
      "Front ID":front["Front ID"],
      "Last transition Day":lastDay,
      "Last transition Time":lastTime,
      "Next transition Day":nextDay,
      "Next transition Time":nextTime,
      "Status":"ACTIVE",
      "Version":"2.10.0",
    } as WeatherRecord,
  };
}
