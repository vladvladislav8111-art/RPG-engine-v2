/** Original crossover protagonist. A configurable player-owned identity,
 * not Sung Jin-Woo, an imported Linos save or a canon NPC.
 * Protagonist speech, beliefs, goals and decisions remain entirely player-led.
 */
export type OrarioHeroProfile={
 id:string;name:string;age:number|null;race:string;sex:string;
 heightCm:number;appearance:string;
 knownHistory:string;practicalKnowledge:string[];
 backgroundMystery:string;
 playerControlsPersonality:true;
 immutableCanonIdentity:false;
};
export const ORARIO_START_HERO:Readonly<OrarioHeroProfile>={
 id:"hero.kai.arden",name:"Кай Арден",age:20,
 race:"человек",sex:"мужчина",heightCm:180,
 appearance:"Худощавый юноша с тёмно-каштановыми волосами, серо-зелёными глазами и небольшим старым шрамом у правой брови. Не носит доспехов.",
 knownHistory:"Недавно приехал в Орарио, прежде помогал торговым обозам: переписывал ведомости и зарисовывал маршруты. После происшествия с грузом у Гильдии очнулся в лазарете.",
 practicalKnowledge:["основы счёта и чтения","простые дорожные карты","учёт грузов"],
 backgroundMystery:"Достоверная причина появления Системы неизвестна; это не доказательство тайного наследия.",
 playerControlsPersonality:true,immutableCanonIdentity:false
};
export function newOrarioHeroProfile():OrarioHeroProfile{
 return structuredClone(ORARIO_START_HERO);
}
const validId=(x:string)=>/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(x);
export function validateOrarioHeroProfile(x:OrarioHeroProfile):OrarioHeroProfile{
 if(!x||!validId(x.id)||typeof x.name!=="string"||
  x.name.length<2||x.name.length>80||
  !(x.age===null||(typeof x.age==="number"&&Number.isInteger(x.age)&&x.age>=15&&x.age<=120))||
  !["человек","эльф","полуэльф","зверочеловек","дварф","амазонка","ирид","другой"].includes(x.race)||
  typeof x.sex!=="string"||x.sex.length>30||
  !Number.isInteger(x.heightCm)||x.heightCm<100||x.heightCm>260||
  typeof x.appearance!=="string"||x.appearance.length>450||
  typeof x.knownHistory!=="string"||x.knownHistory.length>650||
  typeof x.backgroundMystery!=="string"||x.backgroundMystery.length>450||
  !Array.isArray(x.practicalKnowledge)||x.practicalKnowledge.length>8||
  x.practicalKnowledge.some(v=>typeof v!=="string"||v.length>130)||
  x.playerControlsPersonality!==true||x.immutableCanonIdentity!==false)
  throw Error("ORARIO_HERO_PROFILE_INVALID");
 return x;
}
export function originalHeroVisibleFeatures(){
 return {
  "appearance.hair_eyes":{
   description:"Тёмно-каштановые волосы, серо-зелёные глаза",
   significance:"routine" as const,visibility:"obvious" as const,
   revision:1,lastUpdatedRef:"genesis.kai.appearance"
  },
  "appearance.build":{
   description:"Высокий худощавый человек без заметной боевой экипировки",
   significance:"routine" as const,visibility:"obvious" as const,
   revision:1,lastUpdatedRef:"genesis.kai.build"
  },
  "appearance.brow_scar":{
   description:"Небольшой старый шрам у правой брови",
   significance:"routine" as const,visibility:"conditional" as const,
   revision:1,lastUpdatedRef:"genesis.kai.scar"
  }
 };
}
