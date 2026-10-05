/**
 * runPlanState.js —— 使用者的跑步計劃現在是什麼狀態（單一真相源）
 * ════════════════════════════════════════════════════════════════
 * 「這一週沒有課」跟「根本沒排過計劃」是兩件不同的事，
 * 之前兩邊都只看 thisWeekBricks 是不是空的，所以：
 *   · 計劃排好了但還沒開始 → 顯示「尚未建立專屬有氧計劃」
 *   · 整期十二週跑完了     → 也顯示「尚未建立專屬有氧計劃」
 * 排好了卻被告知沒有，是這個畫面最傷人的一句話。
 *
 * 四種狀態各自只回答一件事：現在該做什麼。
 */

export const RUN_PLAN_NONE = 'none';         // 沒排過 → 去排一份
export const RUN_PLAN_IDLE = 'idle';         // 有計劃，這週沒課 → 去看課表
export const RUN_PLAN_FINISHED = 'finished'; // 整期跑完了 → 排下一期
export const RUN_PLAN_ACTIVE = 'active';     // 這週有課 → 正常顯示課表

/**
 * @param {object|null} plan   後端 /this-week 回的 plan meta（沒有計劃時為 null）
 * @param {Array|null}  bricks 本週的訓練磚
 */
export function runPlanState(plan, bricks) {
    if (Array.isArray(bricks) && bricks.length > 0) return RUN_PLAN_ACTIVE;
    if (!plan?.plan_id) return RUN_PLAN_NONE;
    const total = Number(plan.total_weeks) || 0;
    const now = Number(plan.current_week_index) || 0;
    // 走到最後一週而且一堂待辦都沒有 → 這一期結束了，該排下一期
    if (total > 0 && now >= total) return RUN_PLAN_FINISHED;
    return RUN_PLAN_IDLE;
}

/**
 * 每個狀態要顯示的那一件事。
 * 標題兩行（第二行是現況），一顆按鈕，沒有說明段落 —— 沒資料時只留動作。
 * @param {string} state      runPlanState() 的結果
 * @param {string} goalName   目標中文名（取自 cardioPlanPath 的 GOAL_NAMES）
 */
export function runPlanAction(state, goalName = '跑步計劃') {
    switch (state) {
        case RUN_PLAN_FINISHED:
            return { line1: goalName, line2: '這一期跑完了', cta: '排下一期', to: '/cardio-plan-builder' };
        case RUN_PLAN_IDLE:
            return { line1: goalName, line2: '本週沒有課', cta: '去看課表', to: '/cardio-microcycle-inbox' };
        case RUN_PLAN_NONE:
        default:
            return { line1: '還沒有', line2: '跑步計劃', cta: '排一份跑步計劃', to: '/cardio-plan-builder' };
    }
}

/** 有計劃才顯示「第 N / M 週」；沒有就不要生一個出來。 */
export function runPlanWeekLabel(plan) {
    const total = Number(plan?.total_weeks) || 0;
    if (!plan?.plan_id || total <= 0) return '';
    const now = Math.min(Math.max(Number(plan.current_week_index) || 1, 1), total);
    return `第 ${now} / ${total} 週`;
}
