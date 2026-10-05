/**
 * planCycleRecap.js — 一期結束時的結算與下一期建議
 * ══════════════════════════════════════════════════════════════════════
 * 解決的問題：
 *   達標之後什麼都沒有。卡片寫「目標達成」，然後呢？
 *   跑步跑完有結算、重訓練完有紀錄，只有營養是「達標了，自己看著辦」。
 *   使用者最需要被接住的就是這一刻 —— 他剛做完一件持續好幾週的事。
 *
 * 這支負責三件事：
 *   1. 結算：這一期實際發生了什麼（全部用實測數字，不美化）
 *   2. 評語：做得怎麼樣（誠實，包含「比預期慢」也照講）
 *   3. 下一期：接下來合理的方向，以及為什麼
 *
 * 誠實鐵律：
 *   · 只用實測體重與實際天數；沒量過就不給結算
 *   · 超過目標就說超過多少，不含糊成「達成」
 *   · 下一期建議講得出理由（依剛完成的方向與目前體脂），不是隨機鼓勵
 */

import { computeCutProgress } from './cutProgress';

const DAY = 86400000;
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

/** 這一期算不算「可以結算」：有計劃、有實測、而且已經走到（或超過）目標。
 *  體態重塑（recomp）不算：它的目標體重本來就跟起點差不多，一量就「達標」，
 *  會在第一週就跳出結算。recomp 是照時間走的，由每 4 週回饋負責收尾。 */
export function isCycleComplete(progress) {
    return !!progress
        && progress.direction !== 'recomp'
        && progress.status === 'ok'
        && progress.remainingKg != null
        && progress.remainingKg <= 0.05;
}

/**
 * @param {string} userId
 * @param {object} plan 已承諾的計劃（drvn_nutrition_plan_<uid>）
 * @param {Date} [today]
 * @returns {null | {
 *   direction:'cut'|'bulk'|'recomp',
 *   startWeight:number, endWeight:number, movedKg:number, overshootKg:number,
 *   weeks:number, days:number, avgPaceKgWk:number,
 *   plannedPaceKgWk:number|null, aheadDays:number|null,
 *   verdict:string, verdictTone:'good'|'neutral',
 *   next:{ goalType:'cut'|'bulk'|'recomp', title:string, reason:string },
 * }}
 */
export function buildCycleRecap(userId, plan, today = new Date()) {
    const p = computeCutProgress(userId, plan, today);
    if (!isCycleComplete(p)) return null;

    const days = Math.max(1, Math.round((today.getTime() - Number(plan.committedAt)) / DAY));
    const weeks = r1(days / 7);
    const moved = Math.abs(p.movedKg || 0);
    const avgPaceKgWk = weeks > 0 ? r2(moved / weeks) : 0;
    const plannedPaceKgWk = Number(plan.pace) > 0 ? Number(plan.pace) : null;

    // 比原訂快幾天／慢幾天（用計劃當初的配速回推應該要幾天）
    let aheadDays = null;
    if (plannedPaceKgWk) {
        const totalKg = Math.abs((Number(plan.targetWeight) || 0) - (Number(plan.currentWeight) || 0));
        const plannedDays = totalKg > 0 ? Math.round((totalKg / plannedPaceKgWk) * 7) : null;
        if (plannedDays) aheadDays = plannedDays - days;   // 正 = 提前
    }

    const verbDone = p.direction === 'bulk' ? '增' : '減';
    let verdict;
    let verdictTone = 'good';
    if (aheadDays != null && aheadDays >= 7) {
        verdict = `比原訂早了 ${Math.round(aheadDays / 7)} 週。`;
    } else if (aheadDays != null && aheadDays <= -14) {
        verdict = `比原訂多花了 ${Math.round(-aheadDays / 7)} 週，但走完了。`;
        verdictTone = 'neutral';
    } else {
        verdict = `${weeks} 週，平均每週${verbDone} ${avgPaceKgWk} kg。`;
    }
    if (p.overshootKg > 0.3) {
        verdict += `超過目標 ${p.overshootKg} kg。`;
    }

    // 下一期：講得出理由的方向，而不是無腦「再來一次」
    const bf = p.direction === 'bulk' ? null : null;   // 體脂另由 UI 帶入，避免這裡假設欄位
    let next;
    if (p.direction === 'bulk') {
        next = {
            goalType: 'cut',
            title: '接一段減脂',
            reason: '增重期難免帶上一些脂肪。接一段減脂把體脂收回來，肌肉會更明顯。',
        };
    } else if (p.direction === 'cut') {
        next = {
            goalType: 'recomp',
            title: '先維持一段時間',
            reason: '剛減完先讓體重穩住幾週，身體適應了再決定下一步，比較不會復胖。',
        };
    } else {
        next = {
            goalType: 'cut',
            title: '設定新的一期',
            reason: '體態重塑走完一輪，可以挑一個更明確的方向繼續。',
        };
    }

    return {
        direction: p.direction,
        startWeight: p.startWeight,
        endWeight: p.currentWeight,
        movedKg: r1(moved),
        overshootKg: p.overshootKg || 0,
        weeks, days, avgPaceKgWk,
        plannedPaceKgWk, aheadDays,
        verdict, verdictTone,
        next,
        _bf: bf,
    };
}

/** 把結束的一期收進歷史（延續性：下一期看得到上一期做了什麼）。 */
export function archiveCycle(userId, plan, recap) {
    if (!plan || !recap) return [];
    const key = `drvn_nutrition_plan_history_${userId || 'guest'}`;
    let list = [];
    try { list = JSON.parse(localStorage.getItem(key) || '[]'); } catch { list = []; }
    if (!Array.isArray(list)) list = [];
    if (list.some((x) => x.planId && plan.planId && x.planId === plan.planId)) return list;

    const entry = {
        planId: plan.planId || `plan_${plan.committedAt}`,
        goalType: plan.goalType,
        committedAt: plan.committedAt,
        closedAt: Date.now(),
        startWeight: recap.startWeight,
        endWeight: recap.endWeight,
        movedKg: recap.movedKg,
        weeks: recap.weeks,
        avgPaceKgWk: recap.avgPaceKgWk,
    };
    const next = [entry, ...list].slice(0, 20);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* 隱私模式：這次就不存了 */ }
    return next;
}

/** 讀歷史（給「你已經完成 N 期」這種延續感用）。 */
export function readCycleHistory(userId) {
    try {
        const v = JSON.parse(localStorage.getItem(`drvn_nutrition_plan_history_${userId || 'guest'}`) || '[]');
        return Array.isArray(v) ? v : [];
    } catch { return []; }
}

export default buildCycleRecap;
