/**
 * weeklyPlanReview.js — 每週計劃依從度回顧（週一 06:00 起算的新週第一次開 App）
 * ═══════════════════════════════════════════════════════════════
 * 【要回答的問題】使用者上週有沒有照「系統生成的計劃」練？
 *   還是其實都在用「自己的 Block（自由訓練）」？
 *   如果是後者 → 他可能更喜歡自己的節奏，只是沒去改計劃
 *   → 溫柔提案：把計劃的某幾天換成他的 Block（可四週同步）。
 *
 * 【判定方法（不猜 session 歸屬，用兩個可靠訊號相減）】
 *   planDoneLastWeek = 本次計劃打勾總數 − 上次回顧時的快照
 *     （completed_workouts_week* 是計劃完成的唯一真相源）
 *   strengthLastWeek = 後端 history 中上一邏輯週（一 06:00 ~ 一 06:00）
 *     的重訓 session 數（排除 motion_analysis）
 *   freestyleLastWeek ≈ max(0, strengthLastWeek − planDoneLastWeek)
 *
 * 【觸發提案】planDone === 0 且 freestyle ≥ 2
 *   （一次都沒照計劃、卻自主練了 2 次以上 = 明確偏好訊號）
 *   每「週」最多問一次；使用者選「保持計劃」即本週靜音。
 */

import apiClient from '../api/client';
import { uGet, uSet } from './userStorage';
import { logicalNow, DAY_START_HOUR } from './dailyAgenda';
import { fireCleanWeek } from './momentEngine';

const SNAP_KEY = 'weeklyReviewSnap';      // { weekKey, planCompletedTotal }
const ASKED_KEY = 'weeklyReviewAsked';    // weekKey（本週已提案/已回答）

/** 本邏輯週的鍵（週一 06:00 起算）：回傳該週週一的 YYYY-MM-DD */
export function logicalWeekKey(now = new Date()) {
    const ln = logicalNow(now);                        // 已扣 6 小時
    const idx = (ln.getDay() + 6) % 7;                 // 0 = 週一
    const monday = new Date(ln.getFullYear(), ln.getMonth(), ln.getDate() - idx);
    const p = (n) => String(n).padStart(2, '0');
    return `${monday.getFullYear()}-${p(monday.getMonth() + 1)}-${p(monday.getDate())}`;
}

/** 計劃打勾總數（completed_workouts_week1..4 加總） */
function planCompletedTotal(userId) {
    let total = 0;
    for (let w = 1; w <= 6; w++) {
        try {
            const arr = JSON.parse(localStorage.getItem(`completed_workouts_${userId}_week${w}`)) || [];
            total += Array.isArray(arr) ? arr.length : 0;
        } catch { /* */ }
    }
    return total;
}

/** 上一邏輯週的重訓 session 數（一 06:00 ~ 一 06:00） */
async function strengthSessionsLastWeek(userId, weekKey) {
    const [y, m, d] = weekKey.split('-').map(Number);
    // 本週一 06:00 與上週一 06:00 的真實時間
    const thisMon6 = new Date(y, m - 1, d, DAY_START_HOUR, 0, 0);
    const lastMon6 = new Date(thisMon6.getTime() - 7 * 86400000);
    try {
        const res = await apiClient.get(`/api/workout/history/${userId}`, { params: { limit: 60 } });
        const sessions = res?.data?.history || [];
        return sessions.filter((s) => {
            if (s?.type === 'motion_analysis') return false;
            if (!(s?.exercises?.length > 0)) return false;
            const t = new Date(s.timestamp || s.date || 0);
            return t >= lastMon6 && t < thisMon6;
        }).length;
    } catch { return null; }   // 離線 → 這週不判，下週再說
}

/**
 * 每週回顧主入口（dashboard 掛載後呼叫；內部自帶「每週一次」防重）。
 * @returns {Promise<null | { freestyleCount: number, weekKey: string }>}
 *   非 null = 應顯示「把 Block 換進計劃」提案。
 */
export async function runWeeklyReview(userId) {
    if (!userId) return null;
    const weekKey = logicalWeekKey();

    const snap = uGet(userId, SNAP_KEY, null);
    const totalNow = planCompletedTotal(userId);

    // 第一次執行：先立快照基準，這週不判（沒有「上週」可比）
    if (!snap || !snap.weekKey) {
        uSet(userId, SNAP_KEY, { weekKey, planCompletedTotal: totalNow });
        return null;
    }
    // 同一週已跑過 → 不重複
    if (snap.weekKey === weekKey) return null;

    // 跨週了：算上週依從度，並把快照推進到本週
    const planDoneLastWeek = Math.max(0, totalNow - (snap.planCompletedTotal || 0));
    uSet(userId, SNAP_KEY, { weekKey, planCompletedTotal: totalNow });

    if (uGet(userId, ASKED_KEY, '') === weekKey) return null;

    // 沒有生成中的計劃 → 沒得提案
    let plan = null;
    try { plan = JSON.parse(localStorage.getItem(`currentPlan_${userId}`)); } catch { /* */ }
    if (!plan?.weeks?.length) return null;

    // 🍏 反向的好消息：上週計劃全勤 → 滿版慶祝（Apple 綠，一週最多一次）
    const plannedDays = plan.weeks[0]?.days?.length || 0;
    if (plannedDays > 0 && planDoneLastWeek >= plannedDays) {
        try { fireCleanWeek(userId, weekKey, planDoneLastWeek); } catch { /* */ }
        return null;   // 全勤了，當然不提案換 Block
    }

    const strengthCount = await strengthSessionsLastWeek(userId, weekKey);
    if (strengthCount === null) return null;               // 離線，跳過
    const freestyleCount = Math.max(0, strengthCount - planDoneLastWeek);

    // 觸發：計劃 0 次 + 自主 ≥ 2 次
    if (planDoneLastWeek === 0 && freestyleCount >= 2) {
        uSet(userId, ASKED_KEY, weekKey);                   // 問過即記，本週不再問
        return { freestyleCount, weekKey };
    }
    return null;
}

/** 使用者選「保持計劃」（提案 sheet 的次要按鈕） */
export function dismissWeeklyReview(userId) {
    uSet(userId, ASKED_KEY, logicalWeekKey());
}
