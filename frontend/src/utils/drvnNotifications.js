// ════════════════════════════════════════════════════════════════════════
//  drvnNotifications.js — 全 App 通知的單一出口
//  ─────────────────────────────────────────────────────────────────────
//  設計決策（2026-08）：
//    全部的系統提示一律走「滿版時刻」（SwissMoment），不再各頁各做各的
//    小卡、小 toast、小紅點。理由：
//      · 風格統一 —— 使用者一看就知道「這是 DRVN 在跟我說話」
//      · 份量統一 —— 值得打斷你的事情才會滿版，不值得的就不該出現
//      · 維護統一 —— 要調節奏、調頻率，只改這一個檔案
//
//  文案規範（沿用 momentEngine）：
//    一句話、一個 accent 關鍵詞、不塞報表數據。儀式感不是儀表板。
//
//  節流原則：
//    · 同一件事一天最多一次（dayOnce）
//    · 一次性的里程碑永久蓋章（once）
//    · 需要決定的（計劃結束、下週調整）帶 CTA 且不自動關
// ════════════════════════════════════════════════════════════════════════

import { fireMoment, recordPR, recordAppOpen } from './momentEngine';
import { uGet, uSet } from './userStorage';
import { toLocalDateKey } from './localDate';

/* ── 去重工具 ────────────────────────────────────────────── */
const seenKey = 'drvnNotifySeen';

const once = (userId, key) => {
    try {
        const st = uGet(userId, seenKey, {}) || {};
        if (st[key]) return false;
        uSet(userId, seenKey, { ...st, [key]: new Date().toISOString() });
        return true;
    } catch { return true; }
};

const dayOnce = (userId, key) => once(userId, `${key}@${toLocalDateKey(new Date())}`);

/* ════════════════════════════════════════════════════════════════════
   通知清單 —— 每一則都是「值得打斷使用者」的事
   ════════════════════════════════════════════════════════════════════ */

export const NOTIFICATIONS = {
    /* ─── A. 跑步計劃生命週期 ─────────────────────────── */

    /** A1 計劃結束 → 帶去結業結算（完成度／診斷／下一套） */
    planFinished: (userId, { weeks, completionPct }) => {
        if (!once(userId, `planFinished:${weeks}:${completionPct}`)) return;
        fireMoment({
            kicker: `${weeks} 週 · 走完了`,
            theme: 'sunshine',
            parts: [['這一期\n', 'main'], ['結束', 'accent'], ['了。', 'main']],
            // 不放 CTA：結業全畫面（PlanCompletionGate）同時就會跳出來，
            // 以前 CTA 帶去 inbox，inbox 會把結算畫面蓋掉。點一下收掉就看到結算。
        });
    },

    /** A2 下週課表已依完成度自動調整 */
    weekAdjusted: (userId, { week, from, to, ruleCode }) => {
        if (!dayOnce(userId, `weekAdjusted:${week}`)) return;
        const easier = to < from;
        fireMoment({
            kicker: `第 ${week} 週 · 已調整`,
            theme: easier ? 'clearday' : 'apple',
            parts: easier
                ? [['下週\n', 'main'], ['輕一點', 'accent'], ['。', 'main']]
                : [['下週\n', 'main'], ['照原計劃', 'accent'], ['走。', 'main']],
            cta: { label: '看調整後的課表', to: '/cardio-microcycle-inbox' },
        });
    },

    /** A3 這期還沒結束，但已經明顯落後 */
    planBehind: (userId, { gapPts }) => {
        if (!dayOnce(userId, 'planBehind')) return;
        fireMoment({
            kicker: '進度 · 落後中',
            theme: 'viola',
            parts: [['不用', 'main'], ['補跑', 'accent'], ['。\n下週的量會自己降下來。', 'main']],
            cta: { label: '看我的進度', to: '/cardio-microcycle-inbox' },
        });
    },

    /** A4 新的一週開始 */
    weekStarted: (userId, { week, km }) => {
        if (!dayOnce(userId, `weekStarted:${week}`)) return;
        fireMoment({
            kicker: `第 ${week} 週 · 開始`,
            theme: 'mist',
            parts: [['這週 ', 'main'], [`${km}`, 'accent'], [' 公里。', 'main']],
        });
    },

    /** A5 下一套課表推薦已經準備好 */
    nextPlanReady: (userId, { title }) => {
        if (!once(userId, `nextPlanReady:${title}`)) return;
        fireMoment({
            kicker: '下一步 · 已備好',
            theme: 'rosehip',
            parts: [['下一套\n已經幫你', 'main'], ['想好', 'accent'], ['了。', 'main']],
            cta: { label: `看「${title}」`, to: '/cardio-plan-builder' },
        });
    },

    /* ─── B. 重訓計劃 ──────────────────────────────────── */

    /** B1 重訓計劃跑完一輪 */
    strengthCycleDone: (userId, { weeks }) => {
        if (!once(userId, `strengthCycleDone:${weeks}`)) return;
        fireMoment({
            kicker: `${weeks} 週 · 完成`,
            theme: 'gold',
            parts: [['這一輪\n你', 'main'], ['扛完', 'accent'], ['了。', 'main']],
            cta: { label: '看下一輪安排', to: '/plan-tracking' },
        });
    },

    /** B2 重訓課表依完成度變更 */
    strengthAdjusted: (userId, { week, easier }) => {
        if (!dayOnce(userId, `strengthAdjusted:${week}`)) return;
        fireMoment({
            kicker: `第 ${week} 週 · 已調整`,
            theme: easier ? 'clearday' : 'apple',
            parts: easier
                ? [['這週的重量\n', 'main'], ['退半步', 'accent'], ['。', 'main']]
                : [['這週\n可以', 'main'], ['加上去', 'accent'], ['了。', 'main']],
            cta: { label: '看課表', to: '/plan-tracking' },
        });
    },

    /* ─── C. 成就與紀錄 ────────────────────────────────── */

    /**
     * C1 破 PR
     * ⚠️ 委派給 momentEngine.recordPR —— 它已經有自己的節流
     *    （每邏輯日一次 + 前密後疏里程碑）。在這裡另外 fireMoment
     *    會變成同一次訓練跳兩張滿版，所以只轉呼叫、不重寫。
     */
    newPR: (userId, { count = 1 } = {}) => { recordPR(userId, count); },

    /** C2 距離里程碑（首次 5K / 10K / 半馬…） */
    distanceMilestone: (userId, { label }) => {
        if (!once(userId, `distance:${label}`)) return;
        fireMoment({
            kicker: '第一次 · 達成',
            theme: 'sunshine',
            parts: [['你的第一個\n', 'main'], [label, 'accent'], ['。', 'main']],
        });
    },

    /** C3 累積里程整數關卡（100 / 250 / 500 / 1000 km） */
    totalDistance: (userId, { km }) => {
        if (!once(userId, `totalKm:${km}`)) return;
        fireMoment({
            kicker: '累積 · 里程',
            theme: 'apple',
            parts: [['總共 ', 'main'], [`${km}`, 'accent'], [' 公里了。', 'main']],
        });
    },

    /* ─── D. 習慣與連續 ────────────────────────────────── */

    /**
     * D1/D2 連續登錄與中斷回歸
     * ⚠️ 同樣委派給 momentEngine.recordAppOpen —— 連續天數的計數、
     *    6 點日界線、里程碑節奏、回歸台階全部在那裡。
     *    這裡只是把入口統一，不重複實作一套計數器。
     */
    appOpen: (userId) => { recordAppOpen(userId); },

    /* ─── E. 社群 ──────────────────────────────────────── */

    /** E1 排行榜名次上升 */
    rankUp: (userId, { board, rank }) => {
        if (!dayOnce(userId, `rankUp:${board}:${rank}`)) return;
        fireMoment({
            kicker: `${board} · 名次更新`,
            theme: 'gold',
            parts: [['你上到\n第 ', 'main'], [`${rank}`, 'accent'], [' 名。', 'main']],
            cta: { label: '看排行榜', to: '/social' },
        });
    },

    /** E2 被超車 —— 只在前段班才提醒，不然只是打擾 */
    rankLost: (userId, { board, rank }) => {
        if (rank > 10) return;
        if (!dayOnce(userId, `rankLost:${board}`)) return;
        fireMoment({
            kicker: `${board} · 有人追上來`,
            theme: 'viola',
            parts: [['你掉到\n第 ', 'main'], [`${rank}`, 'accent'], [' 名了。', 'main']],
            cta: { label: '看排行榜', to: '/social' },
        });
    },

    /** E3 挑戰完成 */
    challengeDone: (userId, { title }) => {
        if (!once(userId, `challenge:${title}`)) return;
        fireMoment({
            kicker: '挑戰 · 完成',
            theme: 'brick',
            parts: [[`${title}\n`, 'dim'], ['達成', 'accent'], ['。', 'main']],
        });
    },

    /* ─── F. 身體與恢復 ────────────────────────────────── */

    /** F1 受傷風險偏高 —— 這是唯一該打斷人的健康提示 */
    injuryRisk: (userId, { acwr }) => {
        if (!dayOnce(userId, 'injuryRisk')) return;
        fireMoment({
            kicker: '負荷 · 偏高',
            theme: 'ember',
            parts: [['今天\n', 'main'], ['先休息', 'accent'], ['。\n最近的量爬太快了。', 'main']],
            cta: { label: '看訓練負荷', to: '/cardio-trend' },
        });
    },

    /** F2 恢復良好，可以加量 */
    readyToPush: (userId) => {
        if (!dayOnce(userId, 'readyToPush')) return;
        fireMoment({
            kicker: '恢復 · 完成',
            theme: 'apple',
            parts: [['身體', 'main'], ['準備好', 'accent'], ['了。', 'main']],
        });
    },
};

/* ════════════════════════════════════════════════════════════════════
   註冊表 —— 讓「有哪些通知」這件事可以被看見、被檢查、被關掉
   ════════════════════════════════════════════════════════════════════ */
export const NOTIFICATION_REGISTRY = [
    { id: 'planFinished',      group: '跑步計劃', label: '計劃結束',       cadence: '一次',     cta: false },
    { id: 'weekAdjusted',      group: '跑步計劃', label: '下週已調整',     cadence: '每週一次', cta: true  },
    { id: 'planBehind',        group: '跑步計劃', label: '進度落後',       cadence: '每日一次', cta: true  },
    { id: 'weekStarted',       group: '跑步計劃', label: '新的一週',       cadence: '每週一次', cta: false },
    { id: 'nextPlanReady',     group: '跑步計劃', label: '下一套已備好',   cadence: '一次',     cta: true  },
    { id: 'strengthCycleDone', group: '重訓計劃', label: '一輪完成',       cadence: '一次',     cta: true  },
    { id: 'strengthAdjusted',  group: '重訓計劃', label: '課表已調整',     cadence: '每週一次', cta: true  },
    { id: 'newPR',             group: '成就',     label: '破個人紀錄',     cadence: '每日一次·里程碑', cta: false, delegate: 'momentEngine.recordPR' },
    { id: 'distanceMilestone', group: '成就',     label: '距離里程碑',     cadence: '一次',     cta: false },
    { id: 'totalDistance',     group: '成就',     label: '累積里程關卡',   cadence: '一次',     cta: false },
    { id: 'appOpen',           group: '習慣',     label: '連續登錄／回歸', cadence: '里程碑',   cta: false, delegate: 'momentEngine.recordAppOpen' },
    { id: 'rankUp',            group: '社群',     label: '排名上升',       cadence: '每日一次', cta: true  },
    { id: 'rankLost',          group: '社群',     label: '被超車（前十）', cadence: '每日一次', cta: true  },
    { id: 'challengeDone',     group: '社群',     label: '挑戰完成',       cadence: '一次',     cta: false },
    { id: 'injuryRisk',        group: '身體',     label: '受傷風險偏高',   cadence: '每日一次', cta: true  },
    { id: 'readyToPush',       group: '身體',     label: '恢復完成可加量', cadence: '每日一次', cta: false },
];

/* ════════════════════════════════════════════════════════════════════
   組合式觸發 —— 呼叫端只要丟原始數據，門檻判定放這裡
   ════════════════════════════════════════════════════════════════════ */

/** 單次跑步距離里程碑（首次達成才發） */
const RUN_MILESTONES = [
    { km: 3,    label: '3 公里' },
    { km: 5,    label: '5 公里' },
    { km: 10,   label: '10 公里' },
    { km: 15,   label: '15 公里' },
    { km: 21.0975, label: '半程馬拉松' },
    { km: 30,   label: '30 公里' },
    { km: 42.195,  label: '全程馬拉松' },
];

/** 累積里程關卡 */
const TOTAL_MILESTONES = [100, 250, 500, 1000, 2000, 5000];

/**
 * 一趟跑步存檔後呼叫 —— 一次判完所有跑步相關的成就
 *
 * 累積里程由這裡自己維護（以 sessionId 去重），呼叫端只要給距離就好。
 * 存檔流程有多個入口（自動存、手動存、分享後存），去重是必要的。
 *
 * @param {string} sessionId 這一趟的 id（用來避免重複累加）
 * @param {number} distanceKm 這一趟的距離
 */
export function notifyRunSaved(userId, { sessionId, distanceKm = 0 } = {}) {
    try {
        const km = Number(distanceKm) || 0;
        if (km <= 0) return;

        // 累積里程：同一個 session 只認列一次
        const acc = uGet(userId, 'drvnLifetimeKm', { total: 0, seen: [] }) || { total: 0, seen: [] };
        const sid = sessionId ? String(sessionId) : null;
        let total = Number(acc.total) || 0;
        if (!sid || !acc.seen?.includes(sid)) {
            total += km;
            const seen = [...(acc.seen || []), sid].filter(Boolean).slice(-200);
            uSet(userId, 'drvnLifetimeKm', { total, seen });
        }

        // 單次距離：只發「這趟達到的最高一階」，不要一次噴四張
        const hit = [...RUN_MILESTONES].reverse().find((m) => km >= m.km);
        if (hit) NOTIFICATIONS.distanceMilestone(userId, { label: hit.label });

        // 累積里程：同樣只發最高的那一關
        const mark = [...TOTAL_MILESTONES].reverse().find((k) => total >= k);
        if (mark) NOTIFICATIONS.totalDistance(userId, { km: mark });
    } catch (e) { console.warn('[notify] run milestones 失敗:', e?.message); }
}

/**
 * 訓練負荷檢查 —— ACWR > 1.3 提醒休息、< 0.8 且有訓練基礎時提醒可以加量
 * @param {number} acwr 急性:慢性負荷比
 */
export function notifyLoadStatus(userId, { acwr, hasBase = true } = {}) {
    if (!Number.isFinite(acwr) || !hasBase) return;
    if (acwr > 1.3) NOTIFICATIONS.injuryRisk(userId, { acwr });
    else if (acwr < 0.8) NOTIFICATIONS.readyToPush(userId);
}

/**
 * 排行榜名次變動 —— 只在真的變動時發，且被超車只提醒前十名
 */
export function notifyRankChange(userId, { board = '排行榜', rank, prevRank } = {}) {
    if (!Number.isFinite(rank) || !Number.isFinite(prevRank) || rank === prevRank) return;
    if (rank < prevRank) NOTIFICATIONS.rankUp(userId, { board, rank });
    else NOTIFICATIONS.rankLost(userId, { board, rank });
}

/** 統一入口：notify(userId, 'planFinished', {...}) */
export function notify(userId, id, payload = {}) {
    const fn = NOTIFICATIONS[id];
    if (!fn) { console.warn('[notify] 未註冊的通知:', id); return; }
    try { fn(userId, payload); } catch (e) { console.warn('[notify] 失敗:', id, e?.message); }
}

export default notify;
