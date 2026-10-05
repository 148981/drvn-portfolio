/**
 * stickerUnlock.js — 限定貼紙解鎖系統
 * ──────────────────────────────────────────────────────────
 * 規則（使用者定義）：
 *   貼紙 = 有「達到」就給（里程碑 / 一次性 / 身份標記）
 *
 * 三大原則：透明、獲取資訊明確、無負擔。
 *   - 每張貼紙都明寫解鎖條件（unlockText）
 *   - 未解鎖時顯示「目前 / 目標」進度（progress）
 *   - 解鎖只看「是否達到」，不跟別人比、不綁排名競爭
 *
 * 貼紙兩大來源：
 *   1. 段位俱樂部貼紙 — 到該段位「自動」獲得（純身份標記）
 *   2. 里程碑貼紙     — 完成訓練成就即解鎖（來源 = 訓練本身）
 *
 * 注意：功能貼紙（Workouts Pro / Running Pulse）不在此檔，維持自由使用。
 */

import { aggregateUserData } from './growthAchievements';
import { getCurrentLeague, LEAGUES } from './leagueStore';
import { uGet, uSet } from './userStorage';

const UNLOCKED_KEY = 'unlockedStickers';      // string[] 已解鎖貼紙 id
const SEEN_ANIM_KEY = 'seenStickerAnimations'; // string[] 已播過獲取動畫的 id

// ════════════════════════════════════════
// 1. 段位俱樂部貼紙（到段位自動給）
// ════════════════════════════════════════
// 對應現有 LEAGUES：bronze / silver / gold / black（無鑽石）
export const LEAGUE_CLUB_STICKERS = LEAGUES.map((lg) => ({
    id: `club_${lg.id}`,
    name: `${lg.displayLabel} 俱樂部`,
    kind: 'league_club',
    leagueId: lg.id,
    leagueRank: lg.rank,
    emoji: lg.id === 'black' ? '🖤' : lg.id === 'gold' ? '🥇' : lg.id === 'silver' ? '🥈' : '🥉',
    unlockText: `晉升到 ${lg.displayLabel} 段位即自動獲得`,
    // 到達或超過該段位即解鎖（身份標記，達到就給）
    check: (ctx) => ctx.leagueRank >= lg.rank,
    progress: (ctx) => (ctx.leagueRank >= lg.rank ? 100 : 0),
}));

// ════════════════════════════════════════
// 2. 里程碑貼紙（訓練成就達到就給）
// ════════════════════════════════════════
export const MILESTONE_STICKERS = [
    {
        id: 'milestone_first_workout',
        name: '首次訓練',
        kind: 'milestone',
        emoji: '🎯',
        unlockText: '完成第 1 次訓練',
        target: 1, unit: '次',
        check: (ctx) => (ctx.data.totalWorkouts || 0) >= 1,
        progress: (ctx) => Math.min(100, ((ctx.data.totalWorkouts || 0) / 1) * 100),
        current: (ctx) => ctx.data.totalWorkouts || 0,
    },
    {
        id: 'milestone_first_marathon',
        name: '首馬',
        kind: 'milestone',
        emoji: '🏅',
        unlockText: '完成一次 42km 跑步',
        target: 42, unit: 'km',
        check: (ctx) => (ctx.data.longestRunDistance || 0) >= 42,
        progress: (ctx) => Math.min(100, ((ctx.data.longestRunDistance || 0) / 42) * 100),
        current: (ctx) => ctx.data.longestRunDistance || 0,
    },
    {
        id: 'milestone_first_pr',
        name: '破 PR',
        kind: 'milestone',
        emoji: '⚡',
        unlockText: '第一次突破 1RM',
        target: 1, unit: '次',
        check: (ctx) => (ctx.data.broke1RM || 0) >= 1,
        progress: (ctx) => Math.min(100, ((ctx.data.broke1RM || 0) / 1) * 100),
        current: (ctx) => ctx.data.broke1RM || 0,
    },
    {
        id: 'milestone_early_bird',
        name: '早鳥',
        kind: 'milestone',
        emoji: '🌅',
        unlockText: '完成 10 次早晨訓練',
        target: 10, unit: '次',
        check: (ctx) => (ctx.data.earlyMorningStreak || 0) >= 10,
        progress: (ctx) => Math.min(100, ((ctx.data.earlyMorningStreak || 0) / 10) * 100),
        current: (ctx) => ctx.data.earlyMorningStreak || 0,
    },
    {
        id: 'milestone_full_month',
        name: '滿月堅持',
        kind: 'milestone',
        emoji: '🗓️',
        unlockText: '連續 30 天有訓練',
        target: 30, unit: '天',
        check: (ctx) => (ctx.data.trainingStreak || 0) >= 30,
        progress: (ctx) => Math.min(100, ((ctx.data.trainingStreak || 0) / 30) * 100),
        current: (ctx) => ctx.data.trainingStreak || 0,
    },
    {
        id: 'milestone_first_collab',
        name: '同心協作',
        kind: 'milestone',
        emoji: '🤝',
        unlockText: '完成 1 次好友協作',
        target: 1, unit: '次',
        check: (ctx) => (ctx.collabCount || 0) >= 1,
        progress: (ctx) => Math.min(100, ((ctx.collabCount || 0) / 1) * 100),
        current: (ctx) => ctx.collabCount || 0,
    },
];

export const ALL_LIMITED_STICKERS = [...LEAGUE_CLUB_STICKERS, ...MILESTONE_STICKERS];

// ════════════════════════════════════════
// 解鎖狀態計算
// ════════════════════════════════════════

const COLLAB_COUNT_KEY = 'completedCollabCount'; // 完成協作次數

/** 建立判斷用 context（聚合訓練資料 + 當前段位 + 協作次數） */
function buildContext(userId) {
    const data = aggregateUserData(userId) || {};
    const league = getCurrentLeague() || LEAGUES[0];
    const collabCount = uGet(userId, COLLAB_COUNT_KEY, 0) || 0;
    return { data, leagueRank: league.rank, leagueId: league.id, collabCount };
}

/**
 * 記錄一次「協作完成」。+1 完成次數，回傳更新後的次數。
 * 呼叫後可接著呼叫 syncUnlockedStickers 觸發貼紙解鎖。
 */
export function recordCollabCompletion(userId) {
    const cur = uGet(userId, COLLAB_COUNT_KEY, 0) || 0;
    const next = cur + 1;
    uSet(userId, COLLAB_COUNT_KEY, next);
    return next;
}

/**
 * 回傳所有限定貼紙的當前狀態（含鎖定/進度/條件文字），供 UI 透明顯示。
 * @returns {Array<{id,name,emoji,kind,unlocked,progress,unlockText,current,target,unit}>}
 */
export function getStickerStates(userId) {
    const ctx = buildContext(userId);
    return ALL_LIMITED_STICKERS.map((s) => {
        const unlocked = !!s.check(ctx);
        return {
            id: s.id,
            name: s.name,
            emoji: s.emoji,
            kind: s.kind,
            unlocked,
            progress: Math.round(s.progress ? s.progress(ctx) : (unlocked ? 100 : 0)),
            unlockText: s.unlockText,
            current: s.current ? s.current(ctx) : undefined,
            target: s.target,
            unit: s.unit,
        };
    });
}

/**
 * 同步「已達成」的貼紙到持久化清單，並回傳「這次新解鎖」的貼紙（用於觸發獲取動畫）。
 * 在訓練完成 / 段位變動後呼叫。
 * @returns {Array} 本次新解鎖的貼紙狀態（可能為空）
 */
export function syncUnlockedStickers(userId) {
    const states = getStickerStates(userId);
    const prev = uGet(userId, UNLOCKED_KEY, []) || [];
    const nowUnlocked = states.filter((s) => s.unlocked).map((s) => s.id);

    const merged = Array.from(new Set([...prev, ...nowUnlocked]));
    uSet(userId, UNLOCKED_KEY, merged);

    // 新解鎖 = 現在解鎖了、但之前不在清單裡
    const newlyIds = nowUnlocked.filter((id) => !prev.includes(id));
    return states.filter((s) => newlyIds.includes(s.id));
}

/** 取得已解鎖貼紙 id 清單 */
export function getUnlockedStickerIds(userId) {
    return uGet(userId, UNLOCKED_KEY, []) || [];
}

/** 標記某貼紙的獲取動畫已播放過（避免重複播） */
export function markStickerAnimationSeen(userId, stickerId) {
    const seen = uGet(userId, SEEN_ANIM_KEY, []) || [];
    if (!seen.includes(stickerId)) uSet(userId, SEEN_ANIM_KEY, [...seen, stickerId]);
}

/** 是否已播過該貼紙的獲取動畫 */
export function hasSeenStickerAnimation(userId, stickerId) {
    return (uGet(userId, SEEN_ANIM_KEY, []) || []).includes(stickerId);
}

export default {
    LEAGUE_CLUB_STICKERS,
    MILESTONE_STICKERS,
    ALL_LIMITED_STICKERS,
    getStickerStates,
    syncUnlockedStickers,
    getUnlockedStickerIds,
    markStickerAnimationSeen,
    hasSeenStickerAnimation,
    recordCollabCompletion,
};
