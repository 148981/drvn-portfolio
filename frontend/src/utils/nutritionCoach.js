/**
 * nutritionCoach.js — 計劃開始之後的「定期回診」與教練建議
 * ══════════════════════════════════════════════════════════════════════
 * 解決的問題：
 *   跑步與重訓都有週結算、有下一步；營養只有「設定完 → 自己記 → 沒有人回頭看」。
 *   使用者不會知道自己走得太慢、太快、或根本沒在量體重。
 *
 * 這支負責回答三件事：
 *   1. 現在該做什麼（量體重？調整吃法？還是什麼都別動）
 *   2. 為什麼（依實測體重算出來的配速，不是熱量推估）
 *   3. 下一次回來看是什麼時候
 *
 * 誠實鐵律：
 *   · 一律以實測體重為準；沒有量測就說「該量了」，不用推估頂替
 *   · 熱量調整用 7700 kcal/kg 這個公開常數換算，並講清楚那是估算
 *   · 沒有進步時不假裝有進步，但也不責備 —— 給一個具體、做得到的下一步
 *   · 不做醫療建議；體重掉太快只提示風險與方向，不開處方
 */

import { computeCutProgress } from './cutProgress';

const DAY = 86400000;

/** 回診週期：兩週。單日水分波動 ±1kg，一週看配速太吵，兩週才穩定。 */
export const REVIEW_INTERVAL_DAYS = 14;

/** 量測多久算「舊」。超過就不該再拿它當現況。 */
export const MEASUREMENT_STALE_DAYS = 14;

const KCAL_PER_KG = 7700;

const r1 = (n) => Math.round(n * 10) / 10;

/** 一次調整熱量的上限（kcal／天）。
 *  ⚠️ 以前直接把「配速差」換成熱量：兩週掉 9.7 kg → 每天多吃 5368 kcal。
 *     那不是建議，是事故。增重每天多 250–500、減脂每天少 300–500 是業界常用的區間，
 *     差再多也一次只調這麼多，兩週後再看。 */
export const MAX_DAILY_KCAL_ADJUST = 500;

/** 一週變化超過這個數字，先懷疑量測（換秤、吃飽量、衣服）而不是真的長／掉了這麼多。 */
export const IMPLAUSIBLE_KG_PER_WEEK = 1.5;

/** 熱量 → 吃得出來的份量。份量要跟數字對得上（一碗飯＋一顆蛋 ≈ 350，不是 5000）。 */
export const foodEquivalent = (kcal, bulk) => {
    const k = Math.abs(kcal);
    if (bulk) {
        if (k <= 200) return '一杯鮮奶加一顆蛋';
        if (k <= 380) return '一碗飯加一顆蛋';
        return '一碗飯加一片雞胸';
    }
    if (k <= 200) return '少半碗飯';
    if (k <= 380) return '少一碗飯';
    return '少一杯全糖手搖';
};

/**
 * @returns {{
 *   status:'no_plan'|'need_measurement'|'too_early'|'off_track'|'too_fast'|'too_slow'|'on_track'|'reached',
 *   level:'action'|'insight'|'ok',
 *   title:string, detail:string,
 *   action:{label:string, route:string, state?:object}|null,
 *   dailyKcalAdjust:number|null,
 *   weekIndex:number, daysSinceMeasure:number|null,
 *   nextReviewInDays:number|null,
 *   progress:object
 * }|null}
 */
export function buildCoachDigest(userId, activePlan, today = new Date()) {
    const p = computeCutProgress(userId, activePlan, today);
    if (p.status === 'no_plan') return null;

    const base = {
        weekIndex: p.weekIndex,
        daysSinceMeasure: p.ageDays,
        nextReviewInDays: null,
        dailyKcalAdjust: null,
        action: null,
        progress: p,
    };

    /* 每個「該做一件事」都要有入口。稽核前只有 need_measurement 帶動作，
       走反方向／太快／太慢都只講問題不給路 —— 使用者知道錯了卻不知道去哪改。
       local: 'openPlanner' 由呼叫端對應到「打開計劃調整」。 */
    const goAdjustPlan = { label: '調整計劃', local: 'openPlanner' };
    const goNewCycle = { label: '開新的一期', local: 'newCycle' };

    const goToMeasure = {
        label: '去量體重',
        route: '/body-analysis-mobile',
        state: { openInBodyForm: true, from: 'nutrition-plan' },
    };

    // ── 1. 沒量過：進度是用實測算的，沒有量測就沒有進度可談 ──
    if (p.status === 'no_measurement') {
        return {
            ...base, status: 'need_measurement', level: 'action',
            title: '還沒量體重',
            detail: '進度用實測算。量一次就開始追蹤配速。',
            action: goToMeasure, nextReviewInDays: 0,
        };
    }

    // ── 2. 量測太舊：拿兩週前的體重當現況，等於在看過期的自己 ──
    if (p.ageDays != null && p.ageDays >= MEASUREMENT_STALE_DAYS) {
        return {
            ...base, status: 'need_measurement', level: 'action',
            title: `${p.ageDays} 天沒量體重`,
            detail: '配速還在用上一筆算。重量一次才是現在的你。',
            action: goToMeasure, nextReviewInDays: 0,
        };
    }

    // ── 3. 剛開始：不到一週談配速是雜訊 ──
    if (p.status === 'too_early') {
        return {
            ...base, status: 'too_early', level: 'ok',
            title: '這週先照著吃就好',
            detail: '滿一週、再量一次體重，這裡才算得出你的實際速度。',
            nextReviewInDays: Math.max(1, 7 - Math.floor(p.weeksElapsed * 7)),
        };
    }

    const daysToReview = Math.max(0, REVIEW_INTERVAL_DAYS - (p.ageDays ?? 0));

    // ── 4. 已達標 ──
    if (p.remainingKg != null && p.remainingKg <= 0.05) {
        return {
            ...base, status: 'reached', level: 'ok',
            title: '目標達成',
            detail: p.overshootKg > 0.3
                ? `已超過目標 ${p.overshootKg} kg。可以開新的一期了。`
                : `${p.startWeight} → ${p.currentWeight} kg。可以開新的一期了。`,
            nextReviewInDays: daysToReview,
            action: goNewCycle,
        };
    }

    const target = p.targetPaceKgWk;      // 目標配速（帶方向，減脂為負）
    const actual = p.actualPaceKgWk;      // 實測配速（帶方向）
    const dirSign = p.direction === 'bulk' ? 1 : -1;
    const towardTarget = actual != null ? actual * dirSign : null;   // 正 = 往目標走
    const targetToward = target != null ? Math.abs(target) : null;

    /** 把「配速差」換成每天要調整多少熱量（7700 kcal ≈ 1 kg）。 */
    const kcalFor = (paceGapKgWk) => {
        const raw = Math.round((paceGapKgWk * KCAL_PER_KG) / 7);
        const capped = Math.min(MAX_DAILY_KCAL_ADJUST, Math.abs(raw));
        return Math.sign(raw) * Math.round(capped / 50) * 50;   // 取整到 50，不假裝精準到個位
    };

    // ── 4.5 一週變化大到不合理 → 先確認量測，不要照這個數字改菜單 ──
    if (actual != null && Math.abs(actual) > IMPLAUSIBLE_KG_PER_WEEK) {
        return {
            ...base, status: 'need_measurement', level: 'action',
            title: `體重${actual > 0 ? '多' : '少'}了 ${Math.abs(r1(p.currentWeight - p.startWeight))} kg？`,
            detail: '變化太大，先早上空腹、同一台秤再量一次',
            action: goToMeasure, nextReviewInDays: 0,
        };
    }

    // ── 5. 走反方向 ──
    if (p.offTrack) {
        const gap = targetToward != null ? targetToward + Math.abs(towardTarget || 0) : 0.5;
        const adjust = dirSign * kcalFor(gap);
        return {
            ...base, status: 'off_track', level: 'action',
            /* ⚠️ 以前寫「往反方向 9.7 kg」—— 使用者看不出是多了還是少了。直接講體重怎麼了。 */
            title: p.direction === 'bulk'
                ? `體重反而少了 ${Math.abs(p.movedKg)} kg`
                : `體重反而多了 ${Math.abs(p.movedKg)} kg`,
            detail: p.direction === 'bulk'
                ? `每天多吃約 ${Math.abs(adjust)} kcal：${foodEquivalent(adjust, true)}`
                : `每天少吃約 ${Math.abs(adjust)} kcal：${foodEquivalent(adjust, false)}`,
            dailyKcalAdjust: adjust,
            nextReviewInDays: daysToReview,
            action: goAdjustPlan,
        };
    }

    // ── 6. 太快：減脂每週掉超過體重的 1% 會賠掉肌肉 ──
    const weeklyPct = p.currentWeight ? (Math.abs(towardTarget || 0) / p.currentWeight) * 100 : 0;
    if (p.direction !== 'bulk' && weeklyPct > 1.0) {
        const safePace = p.currentWeight * 0.0075;   // 回到約 0.75%／週
        const adjust = kcalFor(Math.abs(towardTarget) - safePace);
        return {
            ...base, status: 'too_fast', level: 'action',
            title: `減太快：每週 ${Math.abs(r1(towardTarget))} kg`,
            detail: `容易連肌肉一起掉。每天多吃約 ${Math.abs(adjust)} kcal，蛋白質吃滿。`,
            dailyKcalAdjust: Math.abs(adjust),
            nextReviewInDays: daysToReview,
            action: goAdjustPlan,
        };
    }

    // ── 7. 太慢：實際配速不到目標的一半 ──
    if (targetToward && towardTarget != null && towardTarget < targetToward * 0.5) {
        const adjust = dirSign * kcalFor(targetToward - Math.max(0, towardTarget));
        return {
            ...base, status: 'too_slow', level: 'insight',
            title: `偏慢：每週 ${r1(Math.abs(towardTarget))} kg`,
            detail: p.direction === 'bulk'
                ? `每天約多 ${Math.abs(adjust)} kcal，或接受晚一點達標。`
                : `每天約少 ${Math.abs(adjust)} kcal，或接受晚一點達標。`,
            dailyKcalAdjust: adjust,
            nextReviewInDays: daysToReview,
            action: goAdjustPlan,
        };
    }

    // ── 8. 正常 ──
    return {
        ...base, status: 'on_track', level: 'ok',
        title: `配速正常：每週 ${r1(Math.abs(towardTarget || 0))} kg`,
        detail: `已${p.direction === 'bulk' ? '增' : '減'} ${Math.abs(p.movedKg)} kg，還剩 ${p.remainingKg} kg。${daysToReview <= 0 ? '這週' : `${daysToReview} 天後`}再量一次。`,
        nextReviewInDays: daysToReview,
    };
}

/**
 * 最近實際平均每天吃多少（kcal）。
 * 只算「有記錄」的天（calories > 0）、不含今天（今天還沒吃完，算進去會把平均拉低），
 * 最多往回看 7 個記錄天；少於 2 天不算平均（一天的數字不叫平均）。
 * @param {Array<{date:string, calories:number}>} history
 * @returns {{avg:number, days:number}|null}
 */
export function recentAvgIntake(history = [], today = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const days = (Array.isArray(history) ? history : [])
        .filter((d) => d && Number(d.calories) > 0 && String(d.date || '').slice(0, 10) !== todayKey)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .slice(0, 7);
    if (days.length < 2) return null;
    const avg = Math.round(days.reduce((s, d) => s + Number(d.calories), 0) / days.length);
    return { avg, days: days.length };
}

export default buildCoachDigest;
