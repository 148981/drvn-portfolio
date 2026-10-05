// streakEngine.js — 🔥 DRVN 連續紀錄引擎 v2（寬容機制 × 凍結代幣）
// ─────────────────────────────────────────────────────────────────────────────
// PM 設計原則（參考 Duolingo Streak Freeze + 運動 App 的休息日現實）：
//   1. 「連續」不該懲罰科學休息 — 但也不能鬆到沒有意義。
//   2. 寬容要「看得見、有代價、可累積」：凍結代幣（Streak Freeze）
//      - 每累積 7 個訓練日 → 自動賺 1 枚凍結代幣（上限 3 枚）。
//      - 某天完全沒動 → 自動消耗 1 枚保住連續（結算時發生，使用者會被告知）。
//      - 沒代幣了才真正斷。斷了從 0 開始 — 乾脆、誠實。
//   3. 「今天」永遠有機會：今天還沒練不消耗代幣也不斷（等到明天才結算昨天）。
//   4. 所有事件（賺代幣/用代幣/斷紀錄/里程碑）都有回饋與遙測。
//
// 資料源（全真實）：trainingRecords + workout_history + cardio_sessions 的日期集合。
// 對外：
//   getStreak(userId)          → { current, best, freezes, todayDone, atRisk, freezeUsedYesterday, earnedFreezeToday }
//   STREAK_MILESTONES          → [3,7,14,21,30,50,75,100,150,200,365]
// ─────────────────────────────────────────────────────────────────────────────

import { uStorage } from './userStorage';
import { logicalDayKey } from './dailyAgenda';

const KEY = 'drvn_streak_v2';
const MAX_FREEZES = 3;
const EARN_EVERY_DAYS = 7;
export const STREAK_MILESTONES = [3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 365];

const dayKeyOffset = (offset) => logicalDayKey(new Date(Date.now() - offset * 86400000));

/* 🩹 2026-08 稽核：連續天數要跟「當日完成判定」講同一套話。
   以前這裡是「有紀錄就算一天」，而 dailyAgenda 已經改成 80% 門檻 ——
   兩邊不同步的話會出現「首頁說今天沒完成，但 streak 還在跳」的分裂。

   做法刻意保守：只看紀錄自己帶的 completionPct 欄位。
   · 有 completionPct 且低於門檻 → 這筆不算數
   · 沒有這個欄位 → 一律算數
   舊紀錄（門檻上線前寫入的）都沒有這個欄位，所以過去的連續天數
   不會被追溯打斷。自由訓練 / 自由跑寫入時 pct 會是 100，也不受影響。 */
const STREAK_MIN_COMPLETION = 80;

/** 這筆紀錄夠不夠格算進連續天數（沒有完成度資訊的舊紀錄一律放行） */
function countsForStreak(rec) {
    const pct = rec?.completionPct ?? rec?.completion_pct;
    if (pct == null) return true;
    const n = Number(pct);
    return !Number.isFinite(n) || n >= STREAK_MIN_COMPLETION;
}

/** 從三個真實資料源收集「有訓練的邏輯日」集合 */
function trainedDaySet(userId) {
    const store = uStorage(userId);
    const days = new Set();
    const push = (raw) => {
        try {
            const t = new Date(raw);
            if (!isNaN(t.getTime())) days.add(logicalDayKey(t));
        } catch { /* */ }
    };
    try {
        const records = store.get('trainingRecords', {}) || {};
        Object.values(records).forEach((r) => {
            if (r?.timestamp && countsForStreak(r)) push(r.timestamp);
        });
    } catch { /* */ }
    try {
        (store.get('workout_history', []) || []).forEach((r) => {
            const ts = r?.timestamp || r?.created_at || r?.date;
            if (ts && countsForStreak(r)) push(ts);
        });
    } catch { /* */ }
    try {
        (store.get('cardio_sessions', []) || []).forEach((s) => {
            const ts = s?.date || s?.timestamp || s?.startTime || s?.created_at;
            if (ts && countsForStreak(s)) push(ts);
        });
    } catch { /* */ }
    return days;
}

function loadState(userId) {
    try {
        const s = uStorage(userId).get(KEY, null);
        if (s && typeof s === 'object') return { freezes: 0, best: 0, earnedDays: 0, lastSettleDay: null, freezeUsedOn: null, ...s };
    } catch { /* */ }
    return { freezes: 0, best: 0, earnedDays: 0, lastSettleDay: null, freezeUsedOn: null };
}
function saveState(userId, s) {
    try { uStorage(userId).set(KEY, s); } catch { /* */ }
}

/**
 * 主函式：計算目前連續（含凍結結算）。冪等 — 一天內重複呼叫結果相同。
 */
export function getStreak(userId) {
    if (!userId) return { current: 0, best: 0, freezes: 0, todayDone: false, atRisk: false, freezeUsedYesterday: false, earnedFreezeToday: false };
    const days = trainedDaySet(userId);
    const state = loadState(userId);
    const today = dayKeyOffset(0);
    const todayDone = days.has(today);

    // ── ① 先賺代幣：每累積 EARN_EVERY_DAYS 訓練日 +1（單調不回收）──
    //    必須在走鏈之前結算，凍結卡才救得了「昨天」。
    let freezes = state.freezes;
    let earnedFreezeToday = false;
    const shouldHaveEarned = Math.floor(days.size / EARN_EVERY_DAYS);
    const prevEarned = state.earnedDays || 0;
    if (shouldHaveEarned > prevEarned) {
        const gain = shouldHaveEarned - prevEarned;
        state.earnedDays = shouldHaveEarned;
        const before = freezes;
        freezes = Math.min(MAX_FREEZES, freezes + gain);
        earnedFreezeToday = freezes > before;
    }

    // ── ② 由今天往回走鏈：今天未練不扣分；昨天空日嘗試用 1 枚凍結 ──
    let current = todayDone ? 1 : 0;
    let freezeUsedYesterday = state.freezeUsedOn === dayKeyOffset(1); // 今天稍早已消耗過
    const todaySettled = state.lastSettleDay === today; // 今天已結算過 → 不重複扣代幣
    let i = 1;
    while (i < 400) {
        const key = dayKeyOffset(i);
        if (days.has(key)) {
            current += 1;
            i += 1;
            continue;
        }
        // 空日：昨天(i===1)且尚未結算 → 嘗試消耗凍結代幣保鏈
        if (i === 1 && !todaySettled && state.freezeUsedOn !== key) {
            if (freezes > 0 && daysAheadInChain(days, 2) > 0) {
                freezes -= 1;
                freezeUsedYesterday = true;
                state.freezeUsedOn = key;
                i += 1;
                continue;
            }
            break; // 沒代幣 → 鏈到此為止
        }
        // 歷史空日：若「當時」已用凍結記錄過（freezeUsedOn 標記鏈上最多一個近期空日）
        if (state.freezeUsedOn === key) { i += 1; continue; }
        break;
    }

    // ── 結算与持久化（每天一次）──
    const best = Math.max(state.best || 0, current);
    if (!todaySettled || state.freezes !== freezes || state.best !== best) {
        saveState(userId, { ...state, freezes, best, lastSettleDay: today });
    }

    // atRisk：鏈還活著、今天還沒練、時間已到傍晚 → 提醒層可以出手
    const hour = new Date().getHours();
    const chainAlive = current > 0 || days.has(dayKeyOffset(1)) || freezeUsedYesterday;
    const atRisk = !todayDone && chainAlive && hour >= 17;

    return { current, best, freezes, todayDone, atRisk, freezeUsedYesterday, earnedFreezeToday };
}

// 鏈往前是否還有訓練日（避免「孤島空日」也吃代幣）
function daysAheadInChain(days, fromOffset) {
    for (let j = fromOffset; j < fromOffset + 3; j++) {
        if (days.has(dayKeyOffset(j))) return 1;
    }
    return 0;
}

/** 下一個里程碑（給 UI「還差 N 天」用） */
export function nextMilestone(current) {
    return STREAK_MILESTONES.find((m) => m > current) || null;
}

export default { getStreak, nextMilestone, STREAK_MILESTONES };
