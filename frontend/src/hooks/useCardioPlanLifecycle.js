import { useCallback, useEffect, useRef, useState } from 'react';
import apiClient from '../api/client';
import { getUserId } from '../utils/auth';
import {
    autoAdjustPlan,
    isPlanFinished,
    currentWeekIndex,
    daysUntilEnd,
    computePlanProgress,
    trackingSnapshot,
} from '../utils/cardioPlanProgress';
import { notify } from '../utils/drvnNotifications';
import { cacheRunCycle, clearRunCycle } from '../utils/trainingFocus';

/* ════════════════════════════════════════════════════════════════════
   useCardioPlanLifecycle — 把「計劃會自己往前走」這件事接起來

   每次進到計劃相關畫面時做兩件事：

   1. 補齊自動調整
      已經過完的每一週，依實際完成度調整它的下一週，並寫回後端。
      使用者隔了三週才打開也沒關係，會逐週補齊。

   2. 判定結業
      到了 end_date 就結算 —— 不管跑完沒有。完成度 = 實跑 ÷ 計劃，
      沒跑完就是沒跑完，那才是誠實的數字。慶祝畫面每份計劃只出現一次。

   刻意不做的事：
     · 不在這裡改 UI，只回傳狀態，畫面自己決定要不要顯示
     · 寫回失敗保留後端版本，不把尚未保存的調整顯示為已完成。
   ════════════════════════════════════════════════════════════════════ */

const celebratedKey = (userId, plan) =>
    `drvn_plan_celebrated_${userId}_${plan?.plan_id || plan?.start_date || 'x'}`;

export default function useCardioPlanLifecycle({ enabled = true } = {}) {
    const userId = getUserId();
    const [plan, setPlan] = useState(null);
    const [loading, setLoading] = useState(enabled);
    const [celebration, setCelebration] = useState(null);   // 要慶祝的計劃（null = 不顯示）
    const [adjustments, setAdjustments] = useState([]);     // 這次補了哪些調整
    const syncingRef = useRef(false);

    const persist = useCallback(async (p) => {
        if (!userId || !p) return false;
        try {
            const res = await apiClient.post('/api/cardio-plan/save', { user_id: userId, plan: p });
            return res.data?.status === 'success' ? res.data.plan || false : false;
        } catch (e) {
            console.warn('[planLifecycle] 寫回失敗，下次進來會再試:', e?.message);
            return false;
        }
    }, [userId]);

    const sync = useCallback(async () => {
        if (!enabled || !userId || syncingRef.current) return;
        syncingRef.current = true;
        try {
            setLoading(true);
            const res = await apiClient.get(`/api/cardio-plan/${userId}/latest`);
            const latest = res?.data?.plan || null;
            if (!latest?.weeks?.length) {
                // 後端確定沒有計劃 → 週期快取也要跟著清掉，不然中控台會顯示不存在的一輪
                try { clearRunCycle(userId); } catch { /* */ }
                setPlan(null);
                return;
            }
            // 中控台算「跑到第幾週」用的兩個欄位（計劃本體在後端，這裡只留衍生快取）
            try { cacheRunCycle(userId, latest); } catch { /* */ }

            // ── 1. 自動調整（依每一週的實際完成度往下傳遞）──
            let { plan: adjusted, applied, changed } = autoAdjustPlan(latest);
            if (changed || applied.length) {
                const saved = await persist(adjusted);
                if (!saved) {
                    // Another device may have completed a brick while this view
                    // was computing. Keep the server prescription authoritative.
                    // 以前這裡直接 return —— 409 撞車那次就跳過下面的結業判定，
                    // 計劃明明到期了也不會跳結算。改成拿後端最新版繼續往下判定。
                    let refreshedPlan = null;
                    try {
                        const refreshed = await apiClient.get(`/api/cardio-plan/${userId}/latest`);
                        refreshedPlan = refreshed.data?.plan || null;
                    } catch { /* 重抓失敗就用剛剛那份 */ }
                    adjusted = refreshedPlan?.weeks?.length ? refreshedPlan : latest;
                    applied = [];
                } else {
                    adjusted = saved;
                }
            }
            setAdjustments(applied);
            setPlan(adjusted);

            // ── 2. 到 end_date → 結業 ──
            const finished = isPlanFinished(adjusted);
            const snap = trackingSnapshot(adjusted);

            if (finished) {
                const key = celebratedKey(userId, adjusted);
                if (!localStorage.getItem(key)) {
                    // 全 App 統一的滿版時刻，帶去結算頁
                    notify(userId, 'planFinished', {
                        weeks: adjusted.total_weeks,
                        completionPct: Math.round((snap?.doneRatio || 0) * 100),
                    });
                    setCelebration(adjusted);
                } else {
                    // 已經看過結算但沒有開新計劃 → 溫和提醒一次「下一套還在等你」
                    try {
                        const { diagnosePlan, recommendNextPlan } = await import('../utils/cardioPlanProgress');
                        const rec = recommendNextPlan(adjusted, diagnosePlan(adjusted));
                        notify(userId, 'nextPlanReady', { title: rec.title });
                    } catch { /* 推薦失敗就不提醒 */ }
                }
                return;
            }

            // ── 3. 其餘提示一律走同一套滿版時刻 ──
            const lastChange = [...applied].reverse().find((a) => a.changed);
            if (lastChange) {
                notify(userId, 'weekAdjusted', {
                    week: lastChange.week,
                    from: lastChange.before,
                    to: lastChange.after,
                    ruleCode: lastChange.rule,
                });
            } else if (snap && snap.gapPts > 20) {
                notify(userId, 'planBehind', { gapPts: snap.gapPts });
            }
        } catch (e) {
            console.warn('[planLifecycle] sync 失敗:', e?.message);
        } finally {
            setLoading(false);
            syncingRef.current = false;
        }
    }, [enabled, userId, persist]);

    useEffect(() => { sync(); }, [sync]);

    /** 慶祝畫面關掉 → 蓋章，同一份計劃不再跳 */
    const dismissCelebration = useCallback(() => {
        if (celebration) {
            try { localStorage.setItem(celebratedKey(userId, celebration), new Date().toISOString()); }
            catch { /* 無痕模式等情況 */ }
        }
        setCelebration(null);
    }, [celebration, userId]);

    /** 只關掉結業畫面、不蓋章 —— 給「我想自己調整」用：
     *  新計劃還沒建出來就蓋章，使用者在建立頁按返回後就再也看不到結算／下一套。 */
    const hideCelebration = useCallback(() => { setCelebration(null); }, []);

    /** 從結業畫面直接套用下一套課表 */
    const applyNextPlan = useCallback(async (config) => {
        // 跟結業畫面的預覽同一支（比賽週期後第 1 週是過渡週；utils/cardioPlanProgress.generateNextCyclePlan）
        const { generateNextCyclePlan } = await import('../utils/cardioPlanProgress');
        const { toLocalDateKey } = await import('../utils/localDate');
        const next = generateNextCyclePlan({ ...config, startDate: toLocalDateKey(new Date()) });
        const saved = await persist(next);
        if (saved) { dismissCelebration(); setPlan(saved); cacheRunCycle(userId, saved); }
        return { plan: saved || next, saved: !!saved };
    }, [persist, dismissCelebration, userId]);

    const status = plan ? {
        week: currentWeekIndex(plan),
        totalWeeks: plan.total_weeks,
        daysLeft: daysUntilEnd(plan),
        progress: computePlanProgress(plan),
        finished: isPlanFinished(plan),
    } : null;

    return {
        plan, loading, status, adjustments,
        celebration, dismissCelebration, hideCelebration, applyNextPlan,
        refresh: sync,
    };
}
