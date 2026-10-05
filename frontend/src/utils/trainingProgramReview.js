import { readStrengthPlanDays } from './strengthPlanCompletion';
import { computeCutProgress } from './cutProgress';
import { committedNutritionGoals } from './nutritionTargets';
const read = key => { try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; } };
export function programReviewRows(userId, now = new Date()) {
    const plans = { strength: read(`currentPlan_${userId}`), running: read(`u_${userId}_onboarding_cardio_plan`), nutrition: read(`drvn_nutrition_plan_${userId}`) };
    return Object.entries(plans).filter(([, p]) => p).map(([track, plan]) => {
        const id = plan.cycle_id || plan.plan_id || plan.planId || plan.id;
        const start = plan.startDate || plan.start_date || plan.committedAt || plan.created_at;
        const startTime = typeof start === 'number' ? start : new Date(start).getTime();
        const interval = track === 'nutrition' ? 14 : 7;
        const key = `drvn:training-review:${userId}:${track}:${id}`;
        const history = read(key);
        const safeHistory = Array.isArray(history) ? history : [];
        const latest = safeHistory.at(-1);
        const due = Number.isFinite(startTime) && now.getTime() >= (latest?.at || startTime) + interval * 86400000;
        let total = null, completed = null;
        if (track === 'strength') {
            total = (plan.weeks || []).reduce((s, w) => s + (w.days || []).filter(d => d.exercises?.length).length, 0);
            completed = (plan.weeks || []).reduce((s, w, i) => s + readStrengthPlanDays(userId, plan.plan_id || plan.id, i + 1).filter(d => w.days?.[d - 1]?.exercises?.length).length, 0);
        } else if (track === 'running') {
            const runs = (plan.weeks || []).flatMap(w => w.bricks || []).filter(b => b.type !== 'strength');
            total = runs.length; completed = runs.filter(b => b.status === 'completed').length;
        }
        const nutrition = track === 'nutrition' ? {
            goal: { cut: '減脂', bulk: '增重', recomp: '體態重塑' }[plan.goalType] || '營養計劃',
            calories: committedNutritionGoals(plan)?.calories || null,
            progress: computeCutProgress(userId, plan, now),
        } : null;
        const weeks = Number(plan.total_weeks || plan.cycleWeeks || plan.weeks?.length);
        const endTime = track === 'nutrition' ? new Date(plan.etaDate).getTime() : startTime + weeks * 7 * 86400000;
        const ended = Number.isFinite(endTime) && now.getTime() >= endTime;
        const nextReviewAt = Number.isFinite(startTime) ? Math.max(startTime, Number(latest?.at) || startTime) + interval * 86400000 : null;
        const state = startTime > now.getTime() ? 'not_started' : nutrition ? nutrition.progress.status : total > 0 && completed >= total ? 'completed' : ended ? 'cycle_ended' : completed === 0 ? 'no_records' : 'in_progress';
        let nextAction = state === 'not_started' ? '尚未到開始日，先確認每週可訓練日期。'
            : state === 'completed' ? '本期課程已完成，先回報恢復狀況，再決定是否開啟新週期。'
            : state === 'cycle_ended' ? '週期時間已到，未完成不代表能力不足；先確認漏記或缺課，再選擇續期。'
            : state === 'no_records' ? '目前沒有完成紀錄。若已訓練請先補記；尚未訓練則從下一堂開始。'
            : '依目前課表繼續，回報時一起檢視實際完成與恢復狀況。';
        if (nutrition) nextAction = nutrition.progress.currentWeight == null
            ? '先記錄本期體重與實際飲食；資料不足時不判定目標落後，也不自動調低熱量。'
            : ended ? '已到預定檢視日期，請到營養頁比較量測趨勢，再確認維持、調整或新週期。'
            : '到營養頁檢視量測趨勢與飲食紀錄；一次體重變化不直接觸發目標調整。';
        if (latest?.feeling === 'tired') nextAction += ' 你回報恢復偏累：先檢查休息日與連續高負荷安排，調整前先確認新日期。';
        if (latest?.feeling === 'adjust') nextAction += ' 你希望調整：先確認可用天數與目標，再到對應計劃修改並檢查衝堂。';
        return { track, id, key, due, interval, latest, completed, total, history: safeHistory, nutrition, state, ended, nextReviewAt, nextAction };
    });
}
export function recordProgramReview(row, feeling, now = new Date()) {
    if (!['steady', 'tired', 'adjust'].includes(feeling) || !row.id) throw new Error('Invalid review');
    const history = read(row.key);
    const safeHistory = Array.isArray(history) ? history : [];
    const entry = { at: now.getTime(), feeling, completed: row.completed, total: row.total,
        ...(row.nutrition ? { nutrition: row.nutrition } : {}) };
    localStorage.setItem(row.key, JSON.stringify([...safeHistory, entry]));
    return entry;
}
