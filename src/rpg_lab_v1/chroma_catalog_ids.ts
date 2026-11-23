/** Only established identity matches; no invented scenarios for new bosses. */
const aliases:Readonly<Record<string,string>>={
 "system.dungeon_wolf":"sl_wolf","system.razan":"sl_razan",
 "system.briga":"sl_briga","system.kasaka":"sl_kasaka",
 "system.igris":"sl_igris","system.demon_king":"sl_baran",
};
export const chromaCatalogId=(id:string)=>aliases[id]??id;
