/**
 * Growth Achievement System — 成就稱號定義 + 自動檢查邏輯
 * 連動重訓/有氧/營養/Checklist/照片數據
 */

import { getDailyState, getStreakDays } from './checklistManager';
import { startOfWeek as weekStartMon } from './localDate';
import { readJSON } from './safeStorage';
import { getPhotos } from './bodyPhotoManager';
import { uStorage } from './userStorage';
import { getFollowing, getSquadMembership, getSquadAchievementStats, getSquadMissionCounts, CLUB_CHALLENGES } from './socialDataConnector';
import { getCurrentLeague } from './leagueStore';
import { REGISTRY_ACHIEVEMENTS, tierForCount, nextTierForCount } from './challengeRegistry';

// ────────────────────────────────────────
// Achievement Categories
// ────────────────────────────────────────
export const ACHIEVEMENT_CATEGORIES = [
    { id: 'all', label: '全部', emoji: '🏆' },
    { id: 'strength', label: '重訓', emoji: '💪' },
    { id: 'cardio', label: '有氧', emoji: '🏃' },
    { id: 'nutrition', label: '營養', emoji: '🥗' },
    { id: 'community', label: '社群', emoji: '🌐' },
    { id: 'intimacy', label: '親密', emoji: '🤝' },
    { id: 'squad', label: '社團', emoji: '🏺' },
    { id: 'permanent', label: '常駐挑戰', emoji: '🎯' },
    { id: 'quarterly', label: '季度限定', emoji: '🍂' },
];

// ────────────────────────────────────────
// Achievement Definitions (30+)
// ────────────────────────────────────────
/* ══════════════════════════════════════════════════════════════════════════
 * 🏺 社團徽章 —— 一筆任務一枚，靠累積次數升階
 * ══════════════════════════════════════════════════════════════════════════
 * 舊版是四枚通用徽章（任務達成／併肩訓練／社團常客／社團支柱），
 * 跟社團實際的玩法對不起來：社團每個月自動掛上固定挑戰，
 * 同一筆完成越多個月階級越高 —— 一個「完成 1 個社團任務」的總計數字
 * 看不出你是哪一筆做得久，做滿一年也還是那一枚銅牌。
 *
 * 現在直接由 CLUB_CHALLENGES 的 27 筆題庫生成，每筆一枚：
 *     完成 1 個月 → 銅   3 個月 → 銀   6 個月 → 金   12 個月 → 鉑金
 * 門檻與社團展示櫃（ClubBadgeCabinet.COUNT_TIERS）是同一組數字。
 *
 * ⚠️ tier 是動態的 —— 同一枚徽章會隨次數變色，所以不能寫死在定義裡。
 *    靜態欄位只放預設值，實際階級由 checkAllAchievements 每次重算時覆蓋
 *    （見那邊的 dynamicTier）。
 */
import {clubMissionBadgeImage} from './clubMissionBadgeAssets.js';
const MISSION_CATALOG = [...(CLUB_CHALLENGES.run || []), ...(CLUB_CHALLENGES.strength || [])];

export const SQUAD_MISSION_ACHIEVEMENTS = MISSION_CATALOG.map((m) => {
    const countOf = (d) => Number(d?.squadMissionCounts?.[m.id]) || 0;
    return {
        id: `mission_${m.id}`,
        missionId: m.id,
        /* 名字就用任務本身的標題。
           題庫裡另有一個 badge 欄位（點名之光、半程弧線…），但那個欄位從頭到尾
           只有社團展示櫃在讀，其他畫面一律顯示 title —— 同一件事兩個名字，
           使用者在成就頁看到「半程弧線」根本不知道是社團那筆半馬挑戰。
           月份前綴由 ensureMonthlyChallenges 動態加上（九月／十月…），
           成就是跨月累積的，所以這裡用不帶月份的原始標題。 */
        name: m.title,                       // 半程馬拉松挑戰 / 全員進場挑戰 …
        condition: m.goal,                   // 每人累積里程 21.1 公里
        description: `${m.desc} 每完成一個月累積一次：1／3／6／12 次 → 銅／銀／金／鉑金。`,
        emoji: '🏺',
        category: 'squad',
        tier: 'bronze',                      // 預設值；實際由 dynamicTier 覆蓋
        target: 1,
        unit: '次',
        /* 圖檔還沒生（見 DRVN_社團挑戰徽章.txt）。
           生好之後把下一行改成 image: `/images/badges/mission/mission_${m.id}.png`
           就會從階級色方塊換成徽章插畫，其餘不用動。 */
        image: clubMissionBadgeImage(m.id),
        check: (d) => countOf(d) >= 1,
        progress: (d) => {
            const n = countOf(d);
            const next = nextTierForCount(n);
            if (!next) return 100;                       // 已滿階
            const prev = n >= 6 ? 6 : n >= 3 ? 3 : n >= 1 ? 1 : 0;
            return Math.max(0, Math.min(100, ((n - prev) / (next.need - prev)) * 100));
        },
        dynamicTier: (d) => tierForCount(countOf(d)),
    };
});

export const GROWTH_ACHIEVEMENTS = [
    // 🏋️ Strength — 主項槓鈴重量突破徽章（真實抓取 trainingRecords 每組重量）
    {
        id: 'squat_60', name: '深蹲 60 公斤', condition: '單組深蹲重量達到 60 公斤', description: '深蹲力量里程碑：在任一組深蹲中舉起 60 公斤。', emoji: '🦵', image: '/images/badges/squat_60.png', category: 'strength', tier: 'bronze',
        check: (d) => d.maxSquat >= 60, progress: (d) => Math.min(100, (d.maxSquat / 60) * 100), target: 60, unit: 'kg'
    },
    {
        id: 'squat_100', name: '深蹲 100 公斤', condition: '單組深蹲重量達到 100 公斤', description: '深蹲力量里程碑：在任一組深蹲中舉起 100 公斤。', emoji: '🦵', image: '/images/badges/squat_100.png', category: 'strength', tier: 'silver',
        check: (d) => d.maxSquat >= 100, progress: (d) => Math.min(100, (d.maxSquat / 100) * 100), target: 100, unit: 'kg'
    },
    {
        id: 'squat_140', name: '深蹲 140 公斤', condition: '單組深蹲重量達到 140 公斤', description: '深蹲力量里程碑：在任一組深蹲中舉起 140 公斤。', emoji: '🦵', image: '/images/badges/squat_140.png', category: 'strength', tier: 'gold',
        check: (d) => d.maxSquat >= 140, progress: (d) => Math.min(100, (d.maxSquat / 140) * 100), target: 140, unit: 'kg'
    },
    {
        id: 'squat_180', name: '深蹲 180 公斤', condition: '單組深蹲重量達到 180 公斤', description: '深蹲力量里程碑：在任一組深蹲中舉起 180 公斤。', emoji: '🦵', image: '/images/badges/squat_180.png', category: 'strength', tier: 'platinum',
        check: (d) => d.maxSquat >= 180, progress: (d) => Math.min(100, (d.maxSquat / 180) * 100), target: 180, unit: 'kg'
    },
    {
        id: 'bench_40', name: '臥推 40 公斤', condition: '單組臥推重量達到 40 公斤', description: '臥推力量里程碑：在任一組臥推中舉起 40 公斤。', emoji: '🏋️', image: '/images/badges/bench_40.png', category: 'strength', tier: 'bronze',
        check: (d) => d.maxBench >= 40, progress: (d) => Math.min(100, (d.maxBench / 40) * 100), target: 40, unit: 'kg'
    },
    {
        id: 'bench_60', name: '臥推 60 公斤', condition: '單組臥推重量達到 60 公斤', description: '臥推力量里程碑：在任一組臥推中舉起 60 公斤。', emoji: '🏋️', image: '/images/badges/bench_60.png', category: 'strength', tier: 'silver',
        check: (d) => d.maxBench >= 60, progress: (d) => Math.min(100, (d.maxBench / 60) * 100), target: 60, unit: 'kg'
    },
    {
        id: 'bench_90', name: '臥推 90 公斤', condition: '單組臥推重量達到 90 公斤', description: '臥推力量里程碑：在任一組臥推中舉起 90 公斤。', emoji: '🏋️', image: '/images/badges/bench_90.png', category: 'strength', tier: 'gold',
        check: (d) => d.maxBench >= 90, progress: (d) => Math.min(100, (d.maxBench / 90) * 100), target: 90, unit: 'kg'
    },
    {
        id: 'bench_120', name: '臥推 120 公斤', condition: '單組臥推重量達到 120 公斤', description: '臥推力量里程碑：在任一組臥推中舉起 120 公斤。', emoji: '🏋️', image: '/images/badges/bench_120.png', category: 'strength', tier: 'platinum',
        check: (d) => d.maxBench >= 120, progress: (d) => Math.min(100, (d.maxBench / 120) * 100), target: 120, unit: 'kg'
    },
    {
        id: 'dead_80', name: '硬舉 80 公斤', condition: '單組硬舉重量達到 80 公斤', description: '硬舉力量里程碑：在任一組硬舉中舉起 80 公斤。', emoji: '🪨', image: '/images/badges/dead_80.png', category: 'strength', tier: 'bronze',
        check: (d) => d.maxDeadlift >= 80, progress: (d) => Math.min(100, (d.maxDeadlift / 80) * 100), target: 80, unit: 'kg'
    },
    {
        id: 'dead_120', name: '硬舉 120 公斤', condition: '單組硬舉重量達到 120 公斤', description: '硬舉力量里程碑：在任一組硬舉中舉起 120 公斤。', emoji: '🪨', image: '/images/badges/dead_120.png', category: 'strength', tier: 'silver',
        check: (d) => d.maxDeadlift >= 120, progress: (d) => Math.min(100, (d.maxDeadlift / 120) * 100), target: 120, unit: 'kg'
    },
    {
        id: 'dead_170', name: '硬舉 170 公斤', condition: '單組硬舉重量達到 170 公斤', description: '硬舉力量里程碑：在任一組硬舉中舉起 170 公斤。', emoji: '🪨', image: '/images/badges/dead_170.png', category: 'strength', tier: 'gold',
        check: (d) => d.maxDeadlift >= 170, progress: (d) => Math.min(100, (d.maxDeadlift / 170) * 100), target: 170, unit: 'kg'
    },
    {
        id: 'dead_220', name: '硬舉 220 公斤', condition: '單組硬舉重量達到 220 公斤', description: '硬舉力量里程碑：在任一組硬舉中舉起 220 公斤。', emoji: '🪨', image: '/images/badges/dead_220.png', category: 'strength', tier: 'platinum',
        check: (d) => d.maxDeadlift >= 220, progress: (d) => Math.min(100, (d.maxDeadlift / 220) * 100), target: 220, unit: 'kg'
    },
    {
        id: 'row_40', name: '槓鈴划船 80 公斤', condition: '單組槓鈴划船重量達到 80 公斤', description: '槓鈴划船力量里程碑：在任一組槓鈴划船中舉起 80 公斤。', emoji: '🚣', image: '/images/badges/row_80.png', category: 'strength', tier: 'bronze',
        check: (d) => d.maxRow >= 80, progress: (d) => Math.min(100, (d.maxRow / 80) * 100), target: 80, unit: 'kg'
    },
    {
        id: 'row_60', name: '槓鈴划船 120 公斤', condition: '單組槓鈴划船重量達到 120 公斤', description: '槓鈴划船力量里程碑：在任一組槓鈴划船中舉起 120 公斤。', emoji: '🚣', image: '/images/badges/row_120.png', category: 'strength', tier: 'silver',
        check: (d) => d.maxRow >= 120, progress: (d) => Math.min(100, (d.maxRow / 120) * 100), target: 120, unit: 'kg'
    },
    {
        id: 'row_80', name: '槓鈴划船 170 公斤', condition: '單組槓鈴划船重量達到 170 公斤', description: '槓鈴划船力量里程碑：在任一組槓鈴划船中舉起 170 公斤。', emoji: '🚣', image: '/images/badges/row_170.png', category: 'strength', tier: 'gold',
        check: (d) => d.maxRow >= 170, progress: (d) => Math.min(100, (d.maxRow / 170) * 100), target: 170, unit: 'kg'
    },
    {
        id: 'row_100', name: '槓鈴划船 220 公斤', condition: '單組槓鈴划船重量達到 220 公斤', description: '槓鈴划船力量里程碑：在任一組槓鈴划船中舉起 220 公斤。', emoji: '🚣', image: '/images/badges/row_220.png', category: 'strength', tier: 'platinum',
        check: (d) => d.maxRow >= 220, progress: (d) => Math.min(100, (d.maxRow / 220) * 100), target: 220, unit: 'kg'
    },

    // 🏃 Cardio — 真實跑步數據（cardio_sessions：里程/單次最長/配速/次數）
    {
        id: 'km_total_50', name: '累積跑量 50 公里', condition: '累積跑步里程達 50 公里', description: '里程的積累：把每一次踏出的距離存進你的跑步銀行。', emoji: '🏃', category: 'cardio', tier: 'bronze',
        check: (d) => d.totalKm >= 50, progress: (d) => Math.min(100, (d.totalKm / 50) * 100), target: 50, unit: 'km'
    },
    {
        id: 'km_total_200', name: '累積跑量 200 公里', condition: '累積跑步里程達 200 公里', description: '里程的積累：把每一次踏出的距離存進你的跑步銀行。', emoji: '🏃', category: 'cardio', tier: 'silver',
        check: (d) => d.totalKm >= 200, progress: (d) => Math.min(100, (d.totalKm / 200) * 100), target: 200, unit: 'km'
    },
    {
        id: 'km_total_500', name: '累積跑量 500 公里', condition: '累積跑步里程達 500 公里', description: '里程的積累：把每一次踏出的距離存進你的跑步銀行。', emoji: '🏃', category: 'cardio', tier: 'gold',
        check: (d) => d.totalKm >= 500, progress: (d) => Math.min(100, (d.totalKm / 500) * 100), target: 500, unit: 'km'
    },
    {
        id: 'km_total_1000', name: '累積跑量 1000 公里', condition: '累積跑步里程達 1000 公里', description: '里程的積累：把每一次踏出的距離存進你的跑步銀行。', emoji: '🏃', category: 'cardio', tier: 'platinum',
        check: (d) => d.totalKm >= 1000, progress: (d) => Math.min(100, (d.totalKm / 1000) * 100), target: 1000, unit: 'km'
    },
    {
        id: 'km_total_5000', name: '累積跑量 5,000 公里', condition: '累積跑步里程達 5,000 公里', description: '每次出發都算數，累積屬於自己的長程旅途。', emoji: '🏃', category: 'cardio', tier: 'platinum',
        check: (d) => d.totalKm >= 5000, progress: (d) => Math.min(100, (d.totalKm / 5000) * 100), target: 5000, unit: 'km'
    },
    {
        id: 'km_total_10000', name: '累積跑量 10,000 公里', condition: '累積跑步里程達 10,000 公里', description: '每次出發都算數，累積屬於自己的長程旅途。', emoji: '🏃', category: 'cardio', tier: 'platinum',
        check: (d) => d.totalKm >= 10000, progress: (d) => Math.min(100, (d.totalKm / 10000) * 100), target: 10000, unit: 'km'
    },
    {
        id: 'km_total_40075', name: '累積跑量 40,075 公里', condition: '累積跑步里程達 40,075 公里', description: '每次出發都算數，累積屬於自己的長程旅途。', emoji: '🏃', category: 'cardio', tier: 'platinum',
        check: (d) => d.totalKm >= 40075, progress: (d) => Math.min(100, (d.totalKm / 40075) * 100), target: 40075, unit: 'km'
    },
    {
        id: 'km_single_5', name: '單次跑 5 公里', condition: '單次跑步距離達 5 公里', description: '一次到位：在單一場跑步中完成這個距離。', emoji: '🏁', category: 'cardio', tier: 'bronze',
        check: (d) => d.longestRunDistance >= 5, progress: (d) => Math.min(100, (d.longestRunDistance / 5) * 100), target: 5, unit: 'km'
    },
    {
        id: 'km_single_10', name: '單次跑 10 公里', condition: '單次跑步距離達 10 公里', description: '一次到位：在單一場跑步中完成這個距離。', emoji: '🏁', category: 'cardio', tier: 'silver',
        check: (d) => d.longestRunDistance >= 10, progress: (d) => Math.min(100, (d.longestRunDistance / 10) * 100), target: 10, unit: 'km'
    },
    {
        id: 'km_single_21_1', name: '單次跑 21.0975 公里', condition: '單次跑步距離達 21.0975 公里', description: '一次到位：在單一場跑步中完成這個距離。', emoji: '🏁', category: 'cardio', tier: 'gold',
        check: (d) => d.longestRunDistance >= 21.0975, progress: (d) => Math.min(100, (d.longestRunDistance / 21.0975) * 100), target: 21.0975, unit: 'km'
    },
    {
        id: 'km_single_42_195', name: '單次跑 42.195 公里', condition: '單次跑步距離達 42.195 公里', description: '一次到位：在單一場跑步中完成這個距離。', emoji: '🏁', category: 'cardio', tier: 'platinum',
        check: (d) => d.longestRunDistance >= 42.195, progress: (d) => Math.min(100, (d.longestRunDistance / 42.195) * 100), target: 42.195, unit: 'km'
    },
    {
        id: 'km_single_50', name: '單次跑 50 公里', condition: '單次跑步距離達 50 公里', description: '單次長距離里程碑。', emoji: '🏁', category: 'cardio', tier: 'platinum',
        check: (d) => d.longestRunDistance >= 50, progress: (d) => Math.min(100, (d.longestRunDistance / 50) * 100), target: 50, unit: 'km'
    },
    {
        id: 'km_single_100', name: '單次跑 100 公里', condition: '單次跑步距離達 100 公里', description: '單次長距離里程碑。', emoji: '🏁', category: 'cardio', tier: 'platinum',
        check: (d) => d.longestRunDistance >= 100, progress: (d) => Math.min(100, (d.longestRunDistance / 100) * 100), target: 100, unit: 'km'
    },
    {
        id: 'pace_7', name: '配速 7:00 / 公里', condition: '單次最佳配速達到 7:00 / 公里', description: '找到節奏，持續進步。', emoji: '⚡', category: 'cardio', tier: 'bronze',
        check: (d) => d.bestPace > 0 && d.bestPace <= 7, progress: (d) => d.bestPace > 0 ? Math.min(100, (7 / d.bestPace) * 100) : 0, target: 7, unit: 'min/km'
    },
    {
        id: 'pace_5_5', name: '配速 5:30 / 公里', condition: '單次最佳配速達到 5:30 / 公里', description: '速度的證明：把你的最佳配速壓進這個門檻。', emoji: '⚡', category: 'cardio', tier: 'silver',
        check: (d) => d.bestPace > 0 && d.bestPace <= 5.5, progress: (d) => d.bestPace > 0 ? Math.min(100, (5.5 / d.bestPace) * 100) : 0, target: 5.5, unit: 'min/km'
    },
    {
        id: 'pace_4_5', name: '配速 4:30 / 公里', condition: '單次最佳配速達到 4:30 / 公里', description: '速度的證明：把你的最佳配速壓進這個門檻。', emoji: '⚡', category: 'cardio', tier: 'gold',
        check: (d) => d.bestPace > 0 && d.bestPace <= 4.5, progress: (d) => d.bestPace > 0 ? Math.min(100, (4.5 / d.bestPace) * 100) : 0, target: 4.5, unit: 'min/km'
    },
    {
        id: 'pace_3_50', name: '配速 3:50 / 公里', condition: '單次最佳配速達到 3:50 / 公里', description: '找到節奏，持續進步。', emoji: '⚡', category: 'cardio', tier: 'platinum',
        check: (d) => d.bestPace > 0 && d.bestPace <= (3 + 50 / 60), progress: (d) => d.bestPace > 0 ? Math.min(100, ((3 + 50 / 60) / d.bestPace) * 100) : 0, target: (3 + 50 / 60), unit: 'min/km'
    },
    {
        id: 'run_count_5', name: '完成 5 次跑步', condition: '累積完成 5 次跑步', description: '規律是引擎：一次一次把跑步次數疊上去。', emoji: '👟', category: 'cardio', tier: 'bronze',
        check: (d) => d.totalRuns >= 5, progress: (d) => Math.min(100, (d.totalRuns / 5) * 100), target: 5, unit: '次'
    },
    {
        id: 'run_count_25', name: '完成 25 次跑步', condition: '累積完成 25 次跑步', description: '規律是引擎：一次一次把跑步次數疊上去。', emoji: '👟', category: 'cardio', tier: 'silver',
        check: (d) => d.totalRuns >= 25, progress: (d) => Math.min(100, (d.totalRuns / 25) * 100), target: 25, unit: '次'
    },
    {
        id: 'run_count_75', name: '完成 75 次跑步', condition: '累積完成 75 次跑步', description: '規律是引擎：一次一次把跑步次數疊上去。', emoji: '👟', category: 'cardio', tier: 'gold',
        check: (d) => d.totalRuns >= 75, progress: (d) => Math.min(100, (d.totalRuns / 75) * 100), target: 75, unit: '次'
    },
    {
        id: 'run_count_150', name: '完成 150 次跑步', condition: '累積完成 150 次跑步', description: '規律是引擎：一次一次把跑步次數疊上去。', emoji: '👟', category: 'cardio', tier: 'platinum',
        check: (d) => d.totalRuns >= 150, progress: (d) => Math.min(100, (d.totalRuns / 150) * 100), target: 150, unit: '次'
    },

    // 🥗 Nutrition — 真實連續打卡天數（checklistStreak）
    {
        id: 'streak_7', name: '連續打卡 7 天', condition: '每日紀錄連續達標 7 天', description: '日復一日：讓紀錄成為不間斷的習慣。', emoji: '🥗', image: '/images/badges/streak_7.png', category: 'nutrition', tier: 'bronze',
        check: (d) => d.checklistStreak >= 7, progress: (d) => Math.min(100, (d.checklistStreak / 7) * 100), target: 7, unit: '天'
    },
    {
        id: 'streak_30', name: '連續打卡 30 天', condition: '每日紀錄連續達標 30 天', description: '日復一日：讓紀錄成為不間斷的習慣。', emoji: '🥗', image: '/images/badges/streak_30.png', category: 'nutrition', tier: 'silver',
        check: (d) => d.checklistStreak >= 30, progress: (d) => Math.min(100, (d.checklistStreak / 30) * 100), target: 30, unit: '天'
    },
    {
        id: 'streak_90', name: '連續打卡 90 天', condition: '每日紀錄連續達標 90 天', description: '日復一日：讓紀錄成為不間斷的習慣。', emoji: '🥗', image: '/images/badges/streak_90.png', category: 'nutrition', tier: 'gold',
        check: (d) => d.checklistStreak >= 90, progress: (d) => Math.min(100, (d.checklistStreak / 90) * 100), target: 90, unit: '天'
    },
    {
        id: 'streak_180', name: '連續打卡 180 天', condition: '每日紀錄連續達標 180 天', description: '日復一日：讓紀錄成為不間斷的習慣。', emoji: '🥗', image: '/images/badges/streak_180.png', category: 'nutrition', tier: 'platinum',
        check: (d) => d.checklistStreak >= 180, progress: (d) => Math.min(100, (d.checklistStreak / 180) * 100), target: 180, unit: '天'
    },
    // 🛡️ P7：一年成就線 — 補上 Month 7-12 的內容缺口
    {
        id: 'streak_270', name: '連續打卡 270 天', condition: '每日紀錄連續達標 270 天', description: '四分之三年：紀律已經長成你的一部分。', emoji: '🥗', category: 'nutrition', tier: 'platinum',
        check: (d) => d.checklistStreak >= 270, progress: (d) => Math.min(100, (d.checklistStreak / 270) * 100), target: 270, unit: '天'
    },
    {
        id: 'streak_365', name: '連續打卡 365 天', condition: '每日紀錄連續達標 365 天', description: '完整的一年：這不是習慣，是生活方式。', emoji: '🏆', category: 'nutrition', tier: 'platinum',
        check: (d) => d.checklistStreak >= 365, progress: (d) => Math.min(100, (d.checklistStreak / 365) * 100), target: 365, unit: '天'
    },

    // 🌐 Community — 真實分享照片數（getPhotos）
    {
        id: 'photo_1', name: '分享 1 張運動照片', condition: '累積分享 1 張運動照片', description: '留下軌跡：把你的訓練瞬間分享出去。', emoji: '📸', category: 'community', tier: 'bronze',
        check: (d) => d.photoCount >= 1, progress: (d) => Math.min(100, (d.photoCount / 1) * 100), target: 1, unit: '張'
    },
    {
        id: 'photo_10', name: '分享 10 張運動照片', condition: '累積分享 10 張運動照片', description: '留下軌跡：把你的訓練瞬間分享出去。', emoji: '📸', category: 'community', tier: 'silver',
        check: (d) => d.photoCount >= 10, progress: (d) => Math.min(100, (d.photoCount / 10) * 100), target: 10, unit: '張'
    },
    {
        id: 'photo_30', name: '分享 30 張運動照片', condition: '累積分享 30 張運動照片', description: '留下軌跡：把你的訓練瞬間分享出去。', emoji: '📸', category: 'community', tier: 'gold',
        check: (d) => d.photoCount >= 30, progress: (d) => Math.min(100, (d.photoCount / 30) * 100), target: 30, unit: '張'
    },
    {
        id: 'photo_100', name: '分享 100 張運動照片', condition: '累積分享 100 張運動照片', description: '留下軌跡：把你的訓練瞬間分享出去。', emoji: '📸', category: 'community', tier: 'platinum',
        check: (d) => d.photoCount >= 100, progress: (d) => Math.min(100, (d.photoCount / 100) * 100), target: 100, unit: '張'
    },

    // 🤝 Intimacy — COLLAB 協作系統：真實追蹤夥伴數（following）
    {
        id: 'partner_1', name: '訓練夥伴 1 位', condition: '在 COLLAB 追蹤 1 位訓練夥伴', description: '一起更遠：把同頻的人加進你的訓練網絡。', emoji: '🤝', category: 'intimacy', tier: 'bronze',
        check: (d) => d.followingCount >= 1, progress: (d) => Math.min(100, (d.followingCount / 1) * 100), target: 1, unit: '位'
    },
    {
        id: 'partner_5', name: '訓練夥伴 5 位', condition: '在 COLLAB 追蹤 5 位訓練夥伴', description: '一起更遠：把同頻的人加進你的訓練網絡。', emoji: '🤝', category: 'intimacy', tier: 'silver',
        check: (d) => d.followingCount >= 5, progress: (d) => Math.min(100, (d.followingCount / 5) * 100), target: 5, unit: '位'
    },
    {
        id: 'partner_15', name: '訓練夥伴 15 位', condition: '在 COLLAB 追蹤 15 位訓練夥伴', description: '一起更遠：把同頻的人加進你的訓練網絡。', emoji: '🤝', category: 'intimacy', tier: 'gold',
        check: (d) => d.followingCount >= 15, progress: (d) => Math.min(100, (d.followingCount / 15) * 100), target: 15, unit: '位'
    },
    {
        id: 'partner_30', name: '訓練夥伴 30 位', condition: '在 COLLAB 追蹤 30 位訓練夥伴', description: '一起更遠：把同頻的人加進你的訓練網絡。', emoji: '🤝', category: 'intimacy', tier: 'platinum',
        check: (d) => d.followingCount >= 30, progress: (d) => Math.min(100, (d.followingCount / 30) * 100), target: 30, unit: '位'
    },

    // 🥗 Nutrition — 體重紀錄（真實 inbody_local）
    {
        id: 'weigh_1', name: '記錄體重 1 次', condition: '累積記錄 1 次體重', description: '看見變化：把每一次量測都記下來。', emoji: '⚖️', category: 'nutrition', tier: 'bronze',
        check: (d) => d.inbodyCount >= 1, progress: (d) => Math.min(100, (d.inbodyCount / 1) * 100), target: 1, unit: '次'
    },
    {
        id: 'weigh_10', name: '記錄體重 10 次', condition: '累積記錄 10 次體重', description: '看見變化：把每一次量測都記下來。', emoji: '⚖️', category: 'nutrition', tier: 'silver',
        check: (d) => d.inbodyCount >= 10, progress: (d) => Math.min(100, (d.inbodyCount / 10) * 100), target: 10, unit: '次'
    },
    {
        id: 'weigh_30', name: '記錄體重 30 次', condition: '累積記錄 30 次體重', description: '看見變化：把每一次量測都記下來。', emoji: '⚖️', category: 'nutrition', tier: 'gold',
        check: (d) => d.inbodyCount >= 30, progress: (d) => Math.min(100, (d.inbodyCount / 30) * 100), target: 30, unit: '次'
    },

    {
        id: 'weigh_60', name: '記錄體重 60 次', condition: '累積記錄 60 次體重', description: '穩定量測，觀察自己的變化。', emoji: '⚖️', category: 'nutrition', tier: 'platinum',
        check: (d) => d.inbodyCount >= 60, progress: (d) => Math.min(100, (d.inbodyCount / 60) * 100), target: 60, unit: '次'
    },
    {
        id: 'weigh_100', name: '記錄體重 100 次', condition: '累積記錄 100 次體重', description: '穩定量測，觀察自己的變化。', emoji: '⚖️', category: 'nutrition', tier: 'platinum',
        check: (d) => d.inbodyCount >= 100, progress: (d) => Math.min(100, (d.inbodyCount / 100) * 100), target: 100, unit: '次'
    },

    /* 🏺 社團 / 🎯 常駐挑戰 / 🍂 季度限定
       —— 三區都改由 challengeRegistry 供應，不再在這裡各寫一份。

       以前這三區是手寫的，而且跟社群頁、後端各自漂移：同一個「破風配速」
       在社群頁是負分割、在這裡是 5:00 配速；「週週重訓」在社群頁是
       每週 3 次×4 週、在這裡是累積 12 次。名字一樣、條件不同、進度兩份。

       現在門檻與達成條件只定義在 utils/challengeRegistry.js。
       ⚠️ 登錄表裡標了 home 的階級（例如 km_total_50 的家在「有氧」）
          不會在這裡重複定義 —— 它們只是被「常駐挑戰」這個視圖收錄，
          分頁篩選改用 registry.inCategory()，不是比對 category。 */
    ...REGISTRY_ACHIEVEMENTS,
    ...SQUAD_MISSION_ACHIEVEMENTS,

];

// Tier metadata for visual styling
export const TIER_META = {
    bronze: { label: '銅牌', glow: 'rgba(205,127,50,0.4)', border: '#CD7F32', bg: 'rgba(205,127,50,0.08)', text: '#CD7F32' },
    silver: { label: '銀牌', glow: 'rgba(192,192,192,0.4)', border: '#C0C0C0', bg: 'rgba(192,192,192,0.08)', text: '#C0C0C0' },
    gold: { label: '金牌', glow: 'rgba(255,215,0,0.4)', border: '#FFD700', bg: 'rgba(255,215,0,0.08)', text: '#FFD700' },
    platinum: { label: '鉑金', glow: 'rgba(200,200,255,0.5)', border: '#E5E4E2', bg: 'rgba(200,200,255,0.08)', text: '#E5E4E2' },
};

// XP per tier
export const TIER_XP = { bronze: 50, silver: 100, gold: 200, platinum: 500 };

// ────────────────────────────────────────
// Title / Rank Level System
// ────────────────────────────────────────
// 稱號＝「業界真實舞台」，一路往上爬、越打越大場，有趣且有邏輯（不再中二）。
//   健身：健身房新手 → 規律訓練者 → 健身房常客 → 備賽選手 → 業餘賽選手 → IFBB Pro → Olympia。
//   （「中階玩家」「進階好手」聽起來像遊戲等級、不像真實舞台 → 換成健身房常客、備賽選手）
//   跑步：parkrun → 路跑戰隊 → 分齡菁英 → 六大馬 → 鑽石聯賽 → 世錦賽 → 奧運。
//   title = 健身稱號；runTitle = 跑步稱號。使用者可在成就頁點稱號切換、per-user 記住。
//   混合：週末戰士 → 體能挑戰者 → Spartan 斯巴達 → HYROX 完賽 → 標鐵三項 → IRONMAN 超鐵 → Kona 世錦賽。
export const TITLE_LEVELS = [
    { minXP: 0, title: '健身房新手', runTitle: 'Parkrun Regular', hybridTitle: 'Weekend Warrior', emoji: '🌱', avatar: '/download/-12.jpg', bgPosition: 'center', color: '#9DB868', glow: 'rgba(157,184,104,0.3)' },
    { minXP: 100, title: '規律訓練者', runTitle: '路跑戰隊', hybridTitle: '體能挑戰者', emoji: '⚡', avatar: '/download/-7.jpg', bgPosition: 'center', color: '#64B5F6', glow: 'rgba(100,181,246,0.3)' },
    { minXP: 300, title: '健身房常客', runTitle: '分齡菁英', hybridTitle: 'Spartan', emoji: '🔥', avatar: '/download/-8.jpg', bgPosition: 'center', color: '#FF8A65', glow: 'rgba(255,138,101,0.4)' },
    { minXP: 600, title: '備賽選手', runTitle: 'Marathoner', hybridTitle: 'HYROX Finisher', emoji: '💪', avatar: '/download/-10.jpg', bgPosition: 'center', color: '#CE93D8', glow: 'rgba(206,147,216,0.4)' },
    { minXP: 1100, title: '業餘賽選手', runTitle: 'Diamond League', hybridTitle: '標鐵三項', emoji: '⚔️', avatar: '/download/Elegant drapery background for photo banks Instagram theme covers.jpg', bgPosition: 'center', color: '#EF5350', glow: 'rgba(239,83,80,0.4)' },
    { minXP: 1800, title: 'IFBB Pro', runTitle: 'World Class', hybridTitle: 'IRONMAN', emoji: '👑', avatar: '/download/-11.jpg', bgPosition: 'center 70%', color: '#FFD700', glow: 'rgba(255,215,0,0.5)' },
    { minXP: 3000, title: 'Olympia', runTitle: 'Olympian', hybridTitle: 'Kona', emoji: '🌌', avatar: '/download/© Wallpaper ®™.jpg', bgPosition: 'center', color: '#F8BBD9', glow: 'rgba(248,187,217,0.6)' },
];

// 三種稱號模式（健身 / 跑步 / 混合）— 使用者在成就頁點稱號跳面板選，per-user 記住。
export const TITLE_MODES = [
    { id: 'strength', label: '健身', hint: '健身房新手 → IFBB Pro → Olympia' },
    { id: 'run', label: '跑步', hint: 'Parkrun → Diamond League → Olympian' },
    { id: 'hybrid', label: '混合', hint: 'Spartan → HYROX → IRONMAN' },
];
const _VALID_MODES = ['strength', 'run', 'hybrid'];
export const getTitleMode = (userId) => {
    try { const m = uStorage(userId).get('title_mode', 'strength'); return _VALID_MODES.includes(m) ? m : 'strength'; } catch { return 'strength'; }
};
export const setTitleMode = (userId, mode) => {
    try { uStorage(userId).set('title_mode', _VALID_MODES.includes(mode) ? mode : 'strength'); } catch { /* */ }
};
// 依模式取顯示稱號（保留 prestige 的羅馬數字後綴）。
export const titleByMode = (level, mode) => {
    if (!level) return '';
    if (mode === 'run' || mode === 'hybrid') {
        const m = /\s([IVX]+)$/.exec(level.title || '');    // prestige 後綴（如 " II"）只掛在 title 上
        const base = (mode === 'run' ? level.runTitle : level.hybridTitle) || level.title;
        return base + (m ? ` ${m[1]}` : '');
    }
    return level.title; // 健身（已含 prestige 後綴）
};

// ────────────────────────────────────────
// 稱號的「真實門檻」
// ────────────────────────────────────────
// XP 只決定「最多能爬到第幾階」。後面幾階的名字是真實舞台（IFBB Pro、Olympia、
// Marathoner、Diamond League、IRONMAN、Kona…），光靠累積點數就掛上去等於說謊，
// 所以每一階另外要求真的做到的事 —— 資料全部來自 aggregateUserData 的真實欄位
// （重訓次數、三大項最大重量、跑步總里程、最長一次、最快配速、鉑金成就數），
// 不用那些由次數推估出來的代理值。
// 規則：一階一階往上，前一階沒過，後面就算 XP 夠也停在這裡（像真的比賽，要先拿到資格）。
const kg = (n) => `${Math.round(n)} kg`;
const km = (n) => `${Math.round(n * 10) / 10} km`;
const paceTxt = (p) => { const m = Math.floor(p); const s = Math.round((p - m) * 60); return `${m}:${String(s).padStart(2, '0')}`; };
const big3 = (d) => (d.maxSquat || 0) + (d.maxBench || 0) + (d.maxDeadlift || 0);
const paceOK = (d, lim) => d.bestPace > 0 && d.bestPace <= lim;

/* 每一條：test(d) 通過才算；need(d) 回傳還差什麼（給使用者看的一句）。
   索引對應 TITLE_LEVELS；沒寫的那一階只看 XP。 */
export const TITLE_GATES = {
    strength: {
        4: [ // 業餘賽選手
            { test: (d) => d.totalWorkouts >= 60, need: (d) => `重訓 ${d.totalWorkouts}/60 次` },
            { test: (d) => big3(d) >= 300, need: (d) => `三大項合計 ${kg(big3(d))}/300 kg` },
        ],
        5: [ // IFBB Pro
            { test: (d) => d.totalWorkouts >= 120, need: (d) => `重訓 ${d.totalWorkouts}/120 次` },
            { test: (d) => big3(d) >= 400, need: (d) => `三大項合計 ${kg(big3(d))}/400 kg` },
        ],
        6: [ // Olympia
            { test: (d) => d.totalWorkouts >= 200, need: (d) => `重訓 ${d.totalWorkouts}/200 次` },
            { test: (d) => big3(d) >= 500, need: (d) => `三大項合計 ${kg(big3(d))}/500 kg` },
            { test: (d) => (d.platinumCount || 0) >= 1, need: () => '拿到 1 面鉑金成就' },
        ],
    },
    run: {
        3: [ // Marathoner：真的跑過一次全馬距離
            { test: (d) => d.longestRunDistance >= 42.0, need: (d) => `最長一次 ${km(d.longestRunDistance)}/42.2 km` },
        ],
        4: [ // Diamond League
            { test: (d) => d.totalKm >= 500, need: (d) => `總里程 ${km(d.totalKm)}/500 km` },
            { test: (d) => paceOK(d, 4.5), need: (d) => `最快配速 ${d.bestPace ? paceTxt(d.bestPace) : '—'}，要 4:30 內` },
        ],
        5: [ // World Class
            { test: (d) => d.totalKm >= 1000, need: (d) => `總里程 ${km(d.totalKm)}/1000 km` },
            { test: (d) => paceOK(d, 4.0), need: (d) => `最快配速 ${d.bestPace ? paceTxt(d.bestPace) : '—'}，要 4:00 內` },
        ],
        6: [ // Olympian
            { test: (d) => d.totalKm >= 2000, need: (d) => `總里程 ${km(d.totalKm)}/2000 km` },
            { test: (d) => paceOK(d, 3.75), need: (d) => `最快配速 ${d.bestPace ? paceTxt(d.bestPace) : '—'}，要 3:45 內` },
        ],
    },
    hybrid: {
        2: [ // Spartan
            { test: (d) => d.totalWorkouts >= 20, need: (d) => `重訓 ${d.totalWorkouts}/20 次` },
            { test: (d) => d.totalRuns >= 10, need: (d) => `跑步 ${d.totalRuns}/10 次` },
        ],
        3: [ // HYROX Finisher
            { test: (d) => d.totalWorkouts >= 40, need: (d) => `重訓 ${d.totalWorkouts}/40 次` },
            { test: (d) => d.longestRunDistance >= 8, need: (d) => `最長一次 ${km(d.longestRunDistance)}/8 km` },
        ],
        4: [ // 標鐵三項
            { test: (d) => d.totalWorkouts >= 60, need: (d) => `重訓 ${d.totalWorkouts}/60 次` },
            { test: (d) => d.longestRunDistance >= 10, need: (d) => `最長一次 ${km(d.longestRunDistance)}/10 km` },
        ],
        5: [ // IRONMAN
            { test: (d) => d.totalWorkouts >= 100, need: (d) => `重訓 ${d.totalWorkouts}/100 次` },
            { test: (d) => d.longestRunDistance >= 21.1, need: (d) => `最長一次 ${km(d.longestRunDistance)}/21.1 km` },
            { test: (d) => d.totalKm >= 800, need: (d) => `總里程 ${km(d.totalKm)}/800 km` },
        ],
        6: [ // Kona
            { test: (d) => d.totalWorkouts >= 150, need: (d) => `重訓 ${d.totalWorkouts}/150 次` },
            { test: (d) => d.longestRunDistance >= 42.0, need: (d) => `最長一次 ${km(d.longestRunDistance)}/42.2 km` },
            { test: (d) => d.totalKm >= 1500, need: (d) => `總里程 ${km(d.totalKm)}/1500 km` },
        ],
    },
};

/** 某一階在某個模式下的真實門檻：{ ok, needs: [一句話…] } */
export const titleGate = (levelIndex, mode, data) => {
    const rules = (TITLE_GATES[mode] || {})[levelIndex] || [];
    const needs = [];
    rules.forEach((r) => { try { if (!r.test(data)) needs.push(r.need(data)); } catch { needs.push('資料不足'); } });
    return { ok: needs.length === 0, needs };
};

/** 依 XP 能到的階數 xpIdx，往上一階一階檢查門檻，回傳這個模式實際站在第幾階。 */
export const gatedLevelIndex = (xpIdx, mode, data) => {
    let idx = 0;
    for (let i = 1; i <= xpIdx; i++) {
        if (!titleGate(i, mode, data).ok) break;
        idx = i;
    }
    return idx;
};

// 門檻用的資料：aggregateUserData ＋ 鉑金成就數。60 秒 memo（同 XP）。
const _gateMemo = {};
export const titleGateData = (userId) => {
    const m = _gateMemo[userId];
    if (m && Date.now() - m.ts < 60 * 1000) return m.val;
    let d = {};
    try { d = aggregateUserData(userId) || {}; } catch { d = {}; }
    let platinumCount = 0;
    try {
        const ids = getUnlockedIds(userId);
        platinumCount = ids.filter((id) => GROWTH_ACHIEVEMENTS.find((a) => a.id === id)?.tier === 'platinum').length;
    } catch { /* ignore */ }
    const val = {
        totalWorkouts: Number(d.totalWorkouts) || 0,
        totalRuns: Number(d.totalRuns) || 0,
        totalKm: Number(d.totalKm) || 0,
        longestRunDistance: Number(d.longestRunDistance) || 0,
        bestPace: Number(d.bestPace) || 0,
        maxSquat: Number(d.maxSquat) || 0,
        maxBench: Number(d.maxBench) || 0,
        maxDeadlift: Number(d.maxDeadlift) || 0,
        platinumCount,
    };
    _gateMemo[userId] = { ts: Date.now(), val };
    return val;
};

/** 這個使用者在某個模式下「真的」掛得上的稱號（含 prestige 後綴）。 */
export const titleForMode = (xpData, mode) => {
    if (!xpData) return '';
    const idx = xpData.levelIndexByMode?.[mode];
    if (idx == null) return titleByMode(xpData.currentLevel, mode);
    const top = TITLE_LEVELS.length - 1;
    // 到頂而且門檻也過了 → 保留 prestige 後綴
    if (idx === top && xpData.xpLevelIndex === top) return titleByMode(xpData.prestigeLevel || TITLE_LEVELS[top], mode);
    return titleByMode(TITLE_LEVELS[idx], mode);
};

// ── 遊戲化收斂（照《遊戲化收斂藍圖_XP主軸》落地）─────────────────
// XP = 唯一總進度貨幣。四個來源全部餵進來：
//   成就 TIER_XP（原有）＋ 訓練 SESSION_XP（重訓+30/次）
//   ＋ 有氧每 km +5 ＋ 段位 LEAGUE_XP（每階 +300）
export const SESSION_XP = 30;      // 每次重訓 session
export const CARDIO_KM_XP = 5;     // 有氧每公里
export const LEAGUE_XP = 300;      // 段位每階
export const TROPHY_XP = 80;       // 社團展示庫每枚獎盃

// 60 秒 memo：getUserXPAndTitle 會在多個畫面 render 時被叫，避免重複掃描紀錄
const _xpMemo = {};

const computeSourceXP = (userId) => {
    let sessionXP = 0, cardioXP = 0, leagueXP = 0;
    try {
        const records = uStorage(userId).get('trainingRecords', {}) || {};
        sessionXP = Object.keys(records).length * SESSION_XP;
    } catch { /* ignore */ }
    try {
        const hist = uStorage(userId).get('workout_history', []) || [];
        const km = hist.reduce((s, h) => {
            const d = parseFloat(h?.distance ?? h?.distance_km ?? h?.metrics?.distance ?? 0);
            return s + (isFinite(d) && d > 0 && d < 300 ? d : 0);
        }, 0);
        cardioXP = Math.round(km * CARDIO_KM_XP);
    } catch { /* ignore */ }
    try {
        const rank = getCurrentLeague()?.rank || 0;
        leagueXP = rank * LEAGUE_XP;
    } catch { /* ignore */ }
    // 🏅 獎盃 XP：社團展示庫每枚 +80（真實達標領取的才算 — DEMO 已移除）
    let trophyXP = 0;
    try {
        const clubs = JSON.parse(localStorage.getItem('strava_clubs')) || [];
        const count = clubs.reduce((s, c) => s + (c?.trophyCabinet || [])
            .reduce((s2, t) => s2 + (t?.count || 1), 0), 0);
        trophyXP = count * TROPHY_XP;
    } catch { /* ignore */ }
    return sessionXP + cardioXP + leagueXP + trophyXP;
};

export const getUserXPAndTitle = (userId) => {
    const memo = _xpMemo[userId];
    if (memo && Date.now() - memo.ts < 60 * 1000) return memo.val;

    const unlocked = getUnlockedIds(userId);
    const achievementXP = unlocked.reduce((sum, id) => {
        const ach = GROWTH_ACHIEVEMENTS.find(a => a.id === id);
        return sum + (ach ? TIER_XP[ach.tier] || 0 : 0);
    }, 0);
    const totalXP = achievementXP + computeSourceXP(userId);

    // Find current and next level
    let currentLevel = TITLE_LEVELS[0];
    let nextLevel = TITLE_LEVELS[1];
    for (let i = TITLE_LEVELS.length - 1; i >= 0; i--) {
        if (totalXP >= TITLE_LEVELS[i].minXP) {
            currentLevel = TITLE_LEVELS[i];
            nextLevel = TITLE_LEVELS[i + 1] || null;
            break;
        }
    }

    // ♾️ 無上限等級（長期使用者永遠有下一關）：
    // 超過最終稱號(3000)後，每 1500 XP 進一個「神話境界 N」段，
    // 回傳形狀不變（title 帶羅馬數字），既有 UI 不需任何修改。
    if (!nextLevel && totalXP >= TITLE_LEVELS[TITLE_LEVELS.length - 1].minXP) {
        const base = TITLE_LEVELS[TITLE_LEVELS.length - 1];
        const PRESTIGE_STEP = 1500;
        const over = totalXP - base.minXP;
        const stage = Math.floor(over / PRESTIGE_STEP);           // 0 = 神話境界本身
        if (stage >= 1) {
            const roman = ['', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
            const suffix = roman[Math.min(stage, 9)] || `${stage + 1}`;
            currentLevel = { ...base, title: `${base.title} ${suffix}`, minXP: base.minXP + stage * PRESTIGE_STEP };
        }
        nextLevel = { ...base, title: `${base.title} ${['II','III','IV','V','VI','VII','VIII','IX','X'][Math.min(stage,8)] || stage + 2}`, minXP: base.minXP + (stage + 1) * PRESTIGE_STEP };
    }

    // 🔒 真實門檻：XP 到了，還要真的做到那一階代表的事（見 TITLE_GATES）
    let xpLevelIndex = 0;
    for (let i = TITLE_LEVELS.length - 1; i >= 0; i--) { if (totalXP >= TITLE_LEVELS[i].minXP) { xpLevelIndex = i; break; } }
    const gateData = titleGateData(userId);
    const levelIndexByMode = {};
    const gateNeeds = {};
    ['strength', 'run', 'hybrid'].forEach((mode) => {
        const idx = gatedLevelIndex(xpLevelIndex, mode, gateData);
        levelIndexByMode[mode] = idx;
        // 下一階差什麼：XP 已經夠、卡在門檻 → 講門檻；否則講 XP（由 UI 顯示）
        const nxt = idx + 1;
        gateNeeds[mode] = nxt < TITLE_LEVELS.length && totalXP >= TITLE_LEVELS[nxt].minXP
            ? titleGate(nxt, mode, gateData).needs : [];
    });
    const prestigeLevel = currentLevel;
    // 預設（健身）稱號以門檻為準；XP 超過但門檻沒過 → 停在過得了的那一階
    if (levelIndexByMode.strength < xpLevelIndex) {
        currentLevel = TITLE_LEVELS[levelIndexByMode.strength];
        nextLevel = TITLE_LEVELS[levelIndexByMode.strength + 1] || null;
    }

    const xpInCurrentLevel = totalXP - currentLevel.minXP;
    const xpNeededForNext = nextLevel ? nextLevel.minXP - currentLevel.minXP : 1;
    const levelProgress = nextLevel ? Math.min(100, Math.round((xpInCurrentLevel / xpNeededForNext) * 100)) : 100;

    const val = { totalXP, currentLevel, nextLevel, levelProgress, xpInCurrentLevel, xpNeededForNext,
        xpLevelIndex, levelIndexByMode, gateNeeds, prestigeLevel };
    _xpMemo[userId] = { ts: Date.now(), val };
    return val;
};

// ────────────────────────────────────────
// Data Aggregator — reads from localStorage
// ────────────────────────────────────────
export const aggregateUserData = (userId) => {
    const data = {
        // Strength
        totalWorkouts: 0, totalVolume: 0, maxRPE: 0,
        // 主項槓鈴最大單組重量（真實抓取 trainingRecords）
        maxSquat: 0, maxBench: 0, maxDeadlift: 0, maxRow: 0,
        // 四大項取最大 —— 「百公斤俱樂部」用它，不要在 check() 裡臨時 Math.max
        maxLift: 0,
        /* 連續幾週做到「每週 ≥3 次重訓」。
           ⚠️ 這個欄位存在的理由：舊版「週週重訓不缺席」是拿 totalWorkouts >= 12 判定，
              也就是一個人一週練 12 次也算「連續四週」——條件跟名字根本是兩回事。 */
        strengthWeekStreak: 0,
        // 社交真實數據：追蹤夥伴數、加入社團數
        followingCount: 0, squadCount: 0,
        squadStreakWeeks: 0, squadMissions: 0, squadTogether: 0,
        // 每一筆社團固定挑戰各自完成幾次 —— 社團徽章的分階依據
        squadMissionCounts: {},
        // 常駐挑戰 / 季度限定 / 體重 真實數據
        monthKm: 0, quarterKm: 0, quarterWorkouts: 0, quarterVolume: 0, inbodyCount: 0, weightChange: 0,
        // Cardio
        totalRuns: 0, totalKm: 0, highZoneMinutes: 0, bestPace: 0,
        // Nutrition
        nutritionStreak: 0, proteinDaysThisWeek: 0,
        // Checklist
        checklistPerfectDays: 0, checklistStreak: 0,
        // Streak
        trainingStreak: 0, consistentWeeks: 0,
        // Photo
        photoCount: 0,
        // Special
        hasStrengthThisWeek: false, hasCardioThisWeek: false, hasNutritionThisWeek: false,
        earlyWorkouts: 0, lateWorkouts: 0, maxCalories: 0,

        // Running Squad Custom Metrics
        exploredRoutes: 0, longestRunDistance: 0, consecutivePBs: 0,
        best5kPace: 0, midnightRuns: 0, negativeSplits: 0,
        totalElevationGain: 0, stablePaceRuns: 0, zone2CruiseSessions: 0,
        syncRunsWithFriend: 0, draftingKm: 0, steepSlopeKm: 0,
        officialPopupRuns: 0, earlyMorningStreak: 0, sunsetWaterfrontRuns: 0,

        // Strength Squad Custom Metrics
        plankMinutes: 0, sbdTotal: 0, compoundReps: 0, broke1RM: 0,
        eccentric5sSets: 0, pause85pctSets: 0, heavyCarryMaxTime: 0,
        symmetricMonths: 0, perfectCycleWeeks: 0, partnerSpotWorkouts: 0,
        antagonistSupersets: 0, iceBathRecoveries: 0, hiitStrength170Bpm: 0,
        failureLastSetsSessions: 0,

        // Nutrition, Community, Intimacy Custom Metrics
        waterStreakDays: 0, perfectMacroStreakDays: 0, wholeFoodChallengeDays: 0, fasting168Count: 0,
        maxPostInteractions: 0, kudosGiven: 0, organizedGroupWorkouts: 0, completedGlobalChallenges: 0,
        workoutsWithSameFriend: 0, jointWeeklyGoalsReached: 0, nudgeAlertsSentReceived: 0, friendshipBondDays: 0
    };

    try {
        // 主項槓鈴最大單組重量 — 真實抓取 trainingRecords（每組 {weight,reps}）
        try {
            const records = uStorage(userId).get('trainingRecords', {}) || {};
            let recVol = 0, recDays = 0;
            Object.values(records).forEach(day => {
                if (!day || !Array.isArray(day.exercises)) return;
                recDays++;
                if (day.volume) recVol += Number(day.volume) || 0;
                day.exercises.forEach(ex => {
                    const nm = String(ex?.name || '').toLowerCase();
                    let m = 0;
                    // 舊格式 sets 可能是組數（數字）→ 先確認是陣列；重量用 plausibleKg 擋手滑值
                    (Array.isArray(ex?.sets) ? ex.sets : []).forEach(set => {
                        if (set && set.weight != null && set.completed !== false) m = Math.max(m, plausibleKg(set.weight));
                    });
                    if (/squat|深蹲/.test(nm)) data.maxSquat = Math.max(data.maxSquat, m);
                    else if (/bench|臥推/.test(nm)) data.maxBench = Math.max(data.maxBench, m);
                    else if (/deadlift|硬舉/.test(nm)) data.maxDeadlift = Math.max(data.maxDeadlift, m);
                    else if (/row|划船/.test(nm)) data.maxRow = Math.max(data.maxRow, m);
                });
            });
            // trainingRecords 是主要真實來源，補進總量/次數
            if (recVol > data.totalVolume) data.totalVolume = recVol;
            if (recDays > data.totalWorkouts) data.totalWorkouts = recDays;
        } catch { /* ignore */ }

        // 社交真實數據
        try { data.followingCount = (getFollowing(userId) || []).length; } catch { /* ignore */ }
        /* 🩹 squadCount 原本只讀 K.membership，但社團頁加入時寫的是 K.clubsUser，
           兩個 store 對不起來 → 明明已加入社團卻顯示 0%。改走同時看兩邊的統計。 */
        try {
            const sq = getSquadAchievementStats(userId) || {};
            data.squadCount = sq.joinedClubs || 0;
            data.squadStreakWeeks = sq.streakWeeks || 0;
            data.squadMissions = sq.missionsDone || 0;
            try { data.squadMissionCounts = getSquadMissionCounts(userId) || {}; } catch { data.squadMissionCounts = {}; }
            data.squadTogether = sq.togetherSessions || 0;
        } catch {
            try { data.squadCount = (getSquadMembership(userId) || []).length; } catch { /* ignore */ }
        }

        // 常駐挑戰 / 季度限定：本月、本季的真實里程與訓練數
        try {
            const now2 = new Date();
            const monthStart = new Date(now2.getFullYear(), now2.getMonth(), 1);
            const qStart = new Date(now2.getFullYear(), Math.floor(now2.getMonth() / 3) * 3, 1);
            const cardio2 = uStorage(userId).get('cardio_sessions', []) || []; // 🔴 Fix(A1)：統一走 per-user 命名空間
            cardio2.forEach(sx => {
                let dist = 0;
                if (sx.distance) dist = sx.distance / 1000; else if (sx.distanceKm) dist = sx.distanceKm;
                const dt = new Date(sx.date || sx.startTime || sx.timestamp || 0);
                if (dt >= monthStart) data.monthKm += dist;
                if (dt >= qStart) { data.quarterKm += dist; data.quarterWorkouts++; }
            });
            const recs2 = uStorage(userId).get('trainingRecords', {}) || {};
            Object.entries(recs2).forEach(([k, day]) => {
                if (!day || !Array.isArray(day.exercises)) return;
                const dt = new Date(k);
                if (dt < qStart) return;
                data.quarterWorkouts++;
                day.exercises.forEach((ex) => {
                    (ex?.sets || ex?.completedSets || []).forEach((st) => {
                        const v = (parseFloat(st?.reps) || 0) * (parseFloat(st?.weight) || 0);
                        if (v > 0) data.quarterVolume += v;
                    });
                });
            });
            data.quarterVolume = Math.round(data.quarterVolume);
        } catch { /* ignore */ }

        // 體重真實數據（InBody 紀錄）
        try {
            const inbody = JSON.parse(localStorage.getItem(`inbody_local_${userId}`) || '[]')
                .filter(r => r && r.weight_kg > 0)
                .sort((a, b) => new Date(a.measurement_date || a.date || 0) - new Date(b.measurement_date || b.date || 0));
            data.inbodyCount = inbody.length;
            if (inbody.length >= 2) data.weightChange = Math.abs(parseFloat(inbody[inbody.length - 1].weight_kg) - parseFloat(inbody[0].weight_kg));
        } catch { /* ignore */ }

        // Training log data
        const trainingLog = readJSON(`trainingLog_${userId}`, []);
        data.totalWorkouts = trainingLog.length;
        trainingLog.forEach(session => {
            if (session.totalVolume) data.totalVolume += session.totalVolume;
            if (session.rpe && session.rpe > data.maxRPE) data.maxRPE = session.rpe;
            if (session.calories && session.calories > data.maxCalories) data.maxCalories = session.calories;
            const hour = session.startTime ? new Date(session.startTime).getHours() : -1;
            if (hour >= 0 && hour < 6) data.earlyWorkouts++;
            if (hour >= 22) data.lateWorkouts++;
        });

        // 四大項取最大（單組重量）
        data.maxLift = Math.max(data.maxSquat, data.maxBench, data.maxDeadlift, data.maxRow) || 0;

        /* 連續幾週「每週至少 3 次重訓」—— 從本週往回數，斷掉就停。
           以實際 session 日期分週（週一為界，沿用 weekStartMon），不用推估。 */
        try {
            const weekKey = (dt) => {
                const w = weekStartMon(new Date(dt));
                return `${w.getFullYear()}-${String(w.getMonth() + 1).padStart(2, '0')}-${String(w.getDate()).padStart(2, '0')}`;
            };
            const perWeek = {};
            trainingLog.forEach((sn) => {
                const dt = sn.startTime || sn.date || sn.completedAt;
                if (!dt) return;
                const k = weekKey(dt);
                perWeek[k] = (perWeek[k] || 0) + 1;
            });
            let cursor = weekStartMon(new Date());
            let streak = 0;
            // 本週還沒練滿不算斷線，所以本週未達標時從上一週開始數
            const thisKey = weekKey(cursor);
            if ((perWeek[thisKey] || 0) < 3) cursor = new Date(cursor.getTime() - 7 * 86400000);
            for (let i = 0; i < 260; i++) {          // 最多回溯五年，避免髒資料無限迴圈
                const k = weekKey(cursor);
                if ((perWeek[k] || 0) >= 3) { streak++; cursor = new Date(cursor.getTime() - 7 * 86400000); }
                else break;
            }
            data.strengthWeekStreak = streak;
        } catch { /* 髒資料當作 0，不猜 */ }

        // Also check workout_history format
        const workoutHistory = readJSON(`workout_history_${userId}`, []);
        if (workoutHistory.length > data.totalWorkouts) {
            data.totalWorkouts = workoutHistory.length;
            workoutHistory.forEach(w => {
                if (w.totalVolume) data.totalVolume += w.totalVolume;
            });
        }

        // Cardio sessions — 🔴 Fix(A1)：統一走 per-user 命名空間
        const cardioSessions = uStorage(userId).get('cardio_sessions', []) || [];
        data.totalRuns = cardioSessions.length;
        cardioSessions.forEach(s => {
            let dist = 0;
            if (s.distance) dist = s.distance / 1000;
            else if (s.distanceKm) dist = s.distanceKm;
            data.totalKm += dist;

            if (dist > data.longestRunDistance) data.longestRunDistance = dist;
            if (s.paceMinKm && (data.bestPace === 0 || s.paceMinKm < data.bestPace)) data.bestPace = s.paceMinKm;

            const hour = s.date || s.startTime ? new Date(s.date || s.startTime).getHours() : -1;
            if (hour >= 0 && hour <= 4) data.midnightRuns++;
        });

        // Checklist streak
        data.checklistStreak = getStreakDays(userId);
        if (data.checklistStreak >= 1) data.checklistPerfectDays = data.checklistStreak;

        // Photo count
        data.photoCount = getPhotos(userId).length;

        // Weekly checks
        const now = new Date();
        // 統一週一為始，否則週日的成就進度會跟課表對不上
        const startOfWeekDate = weekStartMon(now);

        trainingLog.forEach(s => {
            const d = new Date(s.date || s.startTime);
            if (d >= startOfWeekDate) data.hasStrengthThisWeek = true;
        });
        cardioSessions.forEach(s => {
            const d = new Date(s.date || s.startTime);
            if (d >= startOfWeekDate) data.hasCardioThisWeek = true;
        });

        // Nutrition (check if logged this week)
        const nutritionLog = readJSON(`nutrition_log_${userId}`, []);
        nutritionLog.forEach(n => {
            const d = new Date(n.date);
            if (d >= startOfWeekDate) data.hasNutritionThisWeek = true;
        });

        // Training streak
        data.trainingStreak = Math.max(data.checklistStreak, 1);

        // Derive/Calculate proxies based on actual workouts and runs to populate progress naturally
        data.exploredRoutes = Math.round(data.totalKm * 0.1) || 0;
        data.consecutivePBs = Math.min(5, Math.floor(data.totalRuns / 3));
        data.best5kPace = data.bestPace || 0;
        data.negativeSplits = Math.floor(data.totalRuns / 4);
        data.totalElevationGain = Math.round(data.totalKm * 15);
        data.stablePaceRuns = Math.floor(data.totalRuns / 5);
        data.zone2CruiseSessions = Math.floor(data.totalRuns / 6);
        data.syncRunsWithFriend = Math.floor(data.totalRuns / 8);
        data.draftingKm = Math.round(data.totalKm * 0.15);
        data.steepSlopeKm = Math.round(data.totalKm * 0.08);
        data.officialPopupRuns = Math.floor(data.totalRuns / 12);
        data.earlyMorningStreak = Math.min(10, data.trainingStreak);
        data.sunsetWaterfrontRuns = Math.floor(data.totalRuns / 5);

        data.plankMinutes = Math.round(data.totalWorkouts * 15);
        data.sbdTotal = Math.min(500, 200 + Math.floor(data.totalWorkouts * 5));
        data.compoundReps = Math.round(data.totalVolume / 15);
        data.broke1RM = Math.floor(data.totalWorkouts / 8);
        data.eccentric5sSets = Math.floor(data.totalWorkouts * 1.5);
        data.pause85pctSets = Math.floor(data.totalWorkouts / 10);
        data.heavyCarryMaxTime = Math.min(180, 30 + data.totalWorkouts * 2);
        data.symmetricMonths = Math.floor(data.totalWorkouts / 25);
        data.perfectCycleWeeks = Math.floor(data.totalWorkouts / 12);
        data.partnerSpotWorkouts = Math.floor(data.totalWorkouts / 6);
        data.antagonistSupersets = Math.floor(data.totalWorkouts / 4);
        data.iceBathRecoveries = Math.min(15, Math.floor(data.totalWorkouts / 7));
        data.hiitStrength170Bpm = Math.floor(data.totalWorkouts / 15);
        data.failureLastSetsSessions = Math.floor(data.totalWorkouts / 3);

        // Nutrition, Community, Intimacy proxy variables
        data.waterStreakDays = Math.min(30, data.checklistStreak + 5);
        data.perfectMacroStreakDays = Math.min(14, Math.floor(data.nutritionStreak * 0.4));
        data.wholeFoodChallengeDays = Math.min(30, data.checklistStreak * 2);
        data.fasting168Count = Math.floor(data.totalWorkouts / 2);
        
        data.maxPostInteractions = Math.round(data.totalWorkouts * 15 + data.totalKm * 5);
        data.kudosGiven = Math.round(data.totalWorkouts * 35);
        data.organizedGroupWorkouts = Math.floor(data.totalWorkouts / 8);
        data.completedGlobalChallenges = Math.floor(data.totalRuns / 5);

        data.workoutsWithSameFriend = Math.floor(data.totalWorkouts / 4);
        data.jointWeeklyGoalsReached = Math.floor(data.totalRuns / 12);
        data.nudgeAlertsSentReceived = Math.floor(data.totalWorkouts / 3);
        data.friendshipBondDays = Math.min(365, data.totalWorkouts * 12 + 10);

    } catch (e) {
        console.warn('Achievement data aggregation error:', e);
    }

    return data;
};

// ────────────────────────────────────────
// Check all achievements
// ────────────────────────────────────────
const UNLOCKED_KEY = (userId) => `achievements_unlocked_${userId}`;

export const getUnlockedIds = (userId) => {
    try {
        return JSON.parse(localStorage.getItem(UNLOCKED_KEY(userId)) || '[]');
    } catch { return []; }
};

const saveUnlockedIds = (userId, ids) => {
    localStorage.setItem(UNLOCKED_KEY(userId), JSON.stringify(ids));
};

// 🔴 PR／徽章合理性：單組重量超過 500kg 必是手滑（1000、10000…），不能拿來永久解鎖徽章
const plausibleKg = (w) => { const n = parseFloat(w); return Number.isFinite(n) && n > 0 && n <= 500 ? n : 0; };

// 🌐 徽章追蹤補洞：本機彙總（aggregateUserData 只看 localStorage）在
// 換裝置/清快取後會歸零，造成「有練卻 0% 進度」。這裡從後端把
// 重訓歷史＋有氧 sessions 撈回來，算出各追蹤指標的「後端版」，
// 與本機值取較大者（配速類取較小者）— 徽章進度永遠反映真實紀錄。
export async function fetchBackendAchievementData(userId) {
    const out = {};
    try {
        const { getWorkoutHistory } = await import('../api/client');
        const w = await getWorkoutHistory(userId, 300).catch(() => null);
        const hist = w?.history || (Array.isArray(w) ? w : []);
        if (hist.length) {
            out.totalWorkouts = hist.length;
            out.totalVolume = hist.reduce((s, r) => s + (Number(r.total_volume ?? r.volume) || 0), 0);
            let sq = 0, be = 0, dl = 0, ro = 0, prCount = 0;
            hist.forEach((r) => {
                let pr = r.pr_alerts;
                if (typeof pr === 'string') { try { pr = JSON.parse(pr); } catch { pr = []; } }
                if (Array.isArray(pr)) prCount += pr.length;
                (r.exercises || []).forEach((ex) => {
                    const nm = String(ex?.name || ex?.exercise_name || '').toLowerCase();
                    let m = 0;
                    const sets = Array.isArray(ex?.sets) && ex.sets.length && typeof ex.sets[0] === 'object'
                        ? ex.sets : (ex?.detailedSets || []);
                    sets.forEach((st) => { if (st && st.completed !== false) m = Math.max(m, plausibleKg(st.weight)); });
                    if (/squat|深蹲/.test(nm)) sq = Math.max(sq, m);
                    else if (/bench|臥推/.test(nm)) be = Math.max(be, m);
                    else if (/deadlift|硬舉/.test(nm)) dl = Math.max(dl, m);
                    else if (/row|划船/.test(nm)) ro = Math.max(ro, m);
                });
            });
            out.maxSquat = sq; out.maxBench = be; out.maxDeadlift = dl; out.maxRow = ro;
            out.broke1RM = prCount;
        }
    } catch { /* 後端不可用 → 保持本機值 */ }
    try {
        const { default: apiClient } = await import('../api/client');
        const r = await apiClient.get(`/api/cardio/sessions/${userId}?limit=300`).catch(() => null);
        const ss = r?.data?.sessions || [];
        if (ss.length) {
            // GPS 漂移的單筆超長距離（≥300km）不算，免得一筆壞資料直接解鎖「首馬」類徽章（解鎖是永久的）
            const km = (x) => { const d = Number(x?.metrics?.distance ?? x?.metrics?.distance_km ?? 0) || 0; return d > 0 && d < 300 ? d : 0; };
            const when = (x) => new Date(x?.created_at || x?.date || 0);
            const runs = ss.filter((x) => km(x) > 0.2);
            if (runs.length) {
                out.totalRuns = runs.length;
                out.totalKm = runs.reduce((s, x) => s + km(x), 0);
                out.longestRunDistance = Math.max(0, ...runs.map(km));
                const now = new Date();
                const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
                const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
                out.monthKm = runs.filter((x) => when(x) >= mStart).reduce((s, x) => s + km(x), 0);
                out.quarterKm = runs.filter((x) => when(x) >= qStart).reduce((s, x) => s + km(x), 0);
            }
        }
    } catch { /* 同上 */ }
    return out;
}

// 配速/時間類指標「越小越好」，合併時取較小的非零值
const LOWER_BETTER_KEYS = new Set(['bestPace', 'best5kPace']);

export const checkAllAchievements = (userId, override = null) => {
    const data = aggregateUserData(userId);
    // 🌐 後端數據合併（fetchBackendAchievementData 的結果）：數值取大、配速取小、布林取 OR
    if (override && typeof override === 'object') {
        Object.entries(override).forEach(([k, v]) => {
            if (typeof v === 'number' && isFinite(v)) {
                const cur = Number(data[k]) || 0;
                data[k] = LOWER_BETTER_KEYS.has(k)
                    ? (cur > 0 && v > 0 ? Math.min(cur, v) : (v || cur))
                    : Math.max(cur, v);
            } else if (typeof v === 'boolean') {
                data[k] = data[k] || v;
            }
        });
    }
    const unlockedIds = getUnlockedIds(userId);
    const newlyUnlocked = [];

    GROWTH_ACHIEVEMENTS.forEach(ach => {
        if (!unlockedIds.includes(ach.id) && ach.check(data)) {
            unlockedIds.push(ach.id);
            newlyUnlocked.push(ach);
        }
    });

    if (newlyUnlocked.length > 0) {
        saveUnlockedIds(userId, unlockedIds);
        delete _xpMemo[userId];   // 🩹 新解鎖 → XP memo 立即失效，總 XP 馬上反映真實狀態
    }

    // Build results with progress
    /* 動態階級：社團任務徽章會隨完成次數變色（1／3／6／12 → 銅銀金鉑），
       所以 tier 不能用定義裡的靜態值，每次重算時覆蓋掉。 */
    const results = GROWTH_ACHIEVEMENTS.map(ach => {
        const tier = ach.dynamicTier ? (ach.dynamicTier(data) || ach.tier) : ach.tier;
        return {
            ...ach,
            tier,
            image: ach.missionId ? (clubMissionBadgeImage(ach.missionId,tier) || ach.image) : ach.image,
            unlocked: unlockedIds.includes(ach.id),
            progressPct: ach.progress(data),
        };
    });

    return { achievements: results, newlyUnlocked, data };
};
