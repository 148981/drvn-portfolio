import {SPORT_BADGES} from './sportBadgeAssets.js';
import {SEASONAL_BADGES} from './seasonalBadgeAssets.js';
import {clubMissionBadgeImage,clubMissionBadgeId,CLUB_MISSION_MODELS} from './clubMissionBadgeAssets.js';
import {EXTRA_BADGES} from './extraBadgeAssets.js';
export const BENCH_BADGE_WEIGHTS = [40, 60, 90, 120];
export const isBenchBadge = id => BENCH_BADGE_WEIGHTS.some(weight => id === `bench_${weight}`);
export const STRENGTH_BADGES = Object.fromEntries([
    ['bench','臥推',[40,60,90,120],[40,60,90,120]],
    ['squat','深蹲',[60,100,140,180],[60,100,140,180]],
    ['dead','硬舉',[80,120,170,220],[80,120,170,220]],
    ['row','槓鈴划船',[80,120,170,220],[40,60,80,100]],
].flatMap(([family,label,weights,ids])=>weights.map((weight,index)=>[
    `${family}_${ids[index]}`,
    {family,weight,index,asset:`${family}_${weight}`,name:`${label} ${weight} 公斤`},
])));
export const isStrengthBadge = id => Object.hasOwn(STRENGTH_BADGES,id);
export const ALL_3D_BADGES={...STRENGTH_BADGES,...EXTRA_BADGES,...SPORT_BADGES,...CLUB_MISSION_MODELS,...SEASONAL_BADGES};
export const is3DBadge=id=>Object.hasOwn(ALL_3D_BADGES,id)||!!clubMissionBadgeId(id);
export const badgeImage = achievement => clubMissionBadgeImage(achievement.id,achievement.tier) || (is3DBadge(achievement.id)
    ? `/images/badges/3d/${ALL_3D_BADGES[achievement.id].asset}.png` : achievement.image);
