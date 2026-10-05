// The reference illustrations cover these specific missions; other missions keep their fallback.
export const CLUB_MISSION_ART = {
 rc1:['','heart','partners','#24b4d3','#ed7245'],rc2:['5K','rounded','road','#e7b357','#3d8888'],rc10:['3','round','track','#314d78','#d4caa3'],rc13:['2','rounded','dots','#1da6ae','#f3eee0'],rc14:['30','watch','dial','#18b6ba','#f4eee1'],
 sc1:['','heart','partners','#f47835','#20aac1'],sc2:['1','rounded','plates','#ff813b','#323435'],sc12:['2','rounded','dots','#18b3bd','#f3e9d2'],sc13:['1','triangle','bigthree','#125185','#ec782e'],
 rc3:['30','round','track','#ffda16','#ed762c'],rc4:['21K','rounded','road','#1da6ae','#f3eee0'],rc5:['42K','triangle','mountain','#1352ab','#f6eee0'],
 rc6:['100','hex','road','#afcf36','#175d46'],rc7:['12','rounded','dots','#ed4259','#ff9056'],rc8:['300','watch','dial','#18b6ba','#f4eee1'],
 rc9:['PB','bolt','bolt','#ef354f','#ff893d'],rc11:['500','hex','mountain','#6f9b38','#185339'],rc12:['','heart','partners','#24b4d3','#ed7245'],
 sc3:['5','round','bar','#f4c51d','#08737b'],sc4:['10','rounded','plates','#ff813b','#323435'],sc5:['100','hex','plates','#f5eedb','#078579'],
 sc6:['12','rounded','dots','#18b3bd','#f3e9d2'],sc7:['600','watch','dial','#10aebc','#f4eddf'],sc8:['1RM','bolt','bar','#f74445','#fff2d5'],
 sc9:['','triangle','bigthree','#125185','#ec782e'],sc10:['','heart','partners','#f47835','#20aac1'],sc11:['20','hex','dots','#5b9b32','#138574'],
};
export function clubMissionBadgeId(id,tier='bronze'){
 const raw=String(id||'').replace(/^mission_/,'').replace(/^sys_\d+_/,'');
 const match=raw.match(/^(r[c]|s[c])\d+(?:_(bronze|silver|gold|platinum))?$/),key=raw.replace(/_(bronze|silver|gold|platinum)$/,'');if(!CLUB_MISSION_ART[key])return null;
 if(match?.[2])tier=match[2];
 const level=['bronze','silver','gold','platinum'].includes(tier)?tier:'bronze';
 return `mission_${key}_${level}`;
}
export function clubMissionBadgeImage(id,tier='bronze'){const key=clubMissionBadgeId(id,tier);return key?`/images/badges/3d/${key}.png`:null;}
export const CLUB_MISSION_MODELS=Object.fromEntries(Object.entries(CLUB_MISSION_ART).flatMap(([mission,art])=>['bronze','silver','gold','platinum'].map((tier,index)=>{const id=`mission_${mission}_${tier}`;return [id,{asset:id,name:`${mission.startsWith('rc')?'跑步':'健身'}社團 ${art[0]||'團練'} · ${['銅','銀','金','鑽石'][index]}`,family:'club-mission',index,mission,art,tier}];})));
