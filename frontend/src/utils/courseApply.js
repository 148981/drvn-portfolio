// ════════════════════════════════════════════════════════════════════════
//  courseApply.js — 「套用這門課，到底會動到哪一條軌？」
//
//  DRVN 首頁把使用者的訓練分成三條獨立的軌：跑步 / 重訓 / 營養。
//  但課程有三種型態，動到的軌不一樣：
//
//    ① 純重訓課（型男套裝、鐵底盤…）      → 只覆蓋「重訓」
//    ② 內建跑步處方的混合課（燃脂輕跑、HYROX）→ 覆蓋「重訓」＋「跑步」
//    ③ 掛載型混合課（跑者護甲）            → 只覆蓋「重訓」，跑步沿用使用者原本的
//
//  以前 UI 一律只說「改用這個計劃」，使用者按下去才發現跑步課表被換掉了。
//  這支檔案負責兩件事：
//    describeCourseImpact() → 按下去之前，逐軌講清楚會發生什麼
//    applyCourseCardioPlan() → 真的把跑步那一軌換成這門課的處方
//  兩者共用同一份判斷，確保「說的」和「做的」一定一致。
// ════════════════════════════════════════════════════════════════════════

import { generateCardioPlan } from './cardioPlanFusionEngine';
import { cacheRunCycle } from './trainingFocus';

/* 課程 bodyPart → 有氧引擎的目標。沒列到的課＝不寫跑步軌。 */
export const COURSE_CARDIO_GOAL = {
    hybrid_fatloss: 'fat_loss',      // 燃脂輕跑：跑步是主軸，負責帶走熱量
    hybrid_hyrox: 'race_5k_10k',     // HYROX：八段 1km，練的是配速下的耐受
};

const GOAL_ZH = {
    fat_loss: '減脂有氧',
    aerobic_base: '有氧基礎',
    race_5k_10k: '5K／10K 配速',
    race_half: '半馬',
    race_full: '全馬',
};

const LEVEL_ZH = { beginner: '新手', intermediate: '中階', advanced: '進階' };

const weeksOf = (plan, levelKey) =>
    plan?.levels?.[levelKey]?.weeks || plan?.levels?.[Object.keys(plan?.levels || {})[0]]?.weeks || plan?.weeks || [];

/**
 * 這門課會動到哪幾條軌、動成什麼樣子。
 * @returns {{
 *   tracks: string[], writesRun: boolean, runIsExternal: boolean,
 *   goalKey: string|null, goalLabel: string|null,
 *   totalWeeks: number, liftDays: number, runSessions: number, weekKm: number|null,
 *   lines: {track: string, text: string}[]
 * }}
 */
export function describeCourseImpact(plan, levelKey) {
    const weeks = weeksOf(plan, levelKey);
    const w1 = weeks[0] || {};
    const runs = w1.runPlan || [];
    const liftDays = (w1.days || []).length;
    const isHybrid = plan?.courseSystem === 'hybrid';
    const goalKey = COURSE_CARDIO_GOAL[plan?.bodyPart] || null;

    // 有處方 ＋ 有對應的有氧目標，才算「這門課會接管跑步」
    const writesRun = !!(isHybrid && runs.length && goalKey);
    // 掛載型：宣告 hybrid 但沒帶處方（跑者護甲）→ 明講「不動你的跑步」
    const runIsExternal = !!(isHybrid && !runs.length);

    const totalWeeks = weeks.length || Math.round((plan?.duration || 28) / 7);
    const weekKm = Number.isFinite(w1.weekMileageKm) ? w1.weekMileageKm : null;

    const lines = [];
    lines.push({
        track: '重訓',
        text: `換成「${plan?.name || '這門課'}」${LEVEL_ZH[levelKey] ? `· ${LEVEL_ZH[levelKey]}` : ''}，`
            + `每週 ${liftDays} 天、共 ${totalWeeks} 週`,
    });
    if (writesRun) {
        // ⚠ 里程寫「起步約」而不是死數字：有氧引擎會依使用者實際週跑量／5K 配速
        //   往下收（新手不會被丟一個做不到的量），HYROX 新手就會從 12 收到 9 km。
        //   宣告一個引擎不保證給的數字，等於一開始就對使用者說謊。
        lines.push({
            track: '跑步',
            text: `一起換成這門課配好的跑步處方：每週 ${runs.length} 趟`
                + `${weekKm ? `、起步約 ${weekKm} 公里（會依你目前的實際跑量再往下收）` : ''}`
                + `，方向是${GOAL_ZH[goalKey] || goalKey}`,
        });
    } else if (runIsExternal) {
        lines.push({ track: '跑步', text: '不動 —— 這門課是繞著你原本的跑步課表掛上去的' });
    } else {
        lines.push({ track: '跑步', text: '不動' });
    }
    lines.push({ track: '營養', text: '不動' });

    return {
        tracks: writesRun ? ['strength', 'running'] : ['strength'],
        writesRun, runIsExternal,
        goalKey, goalLabel: goalKey ? (GOAL_ZH[goalKey] || goalKey) : null,
        totalWeeks, liftDays, runSessions: runs.length, weekKm,
        lines,
    };
}

/** 給 confirmDialog 用的純文字版本（每軌一行，前面加箭頭） */
export function impactMessage(impact, { activeName } = {}) {
    const head = activeName
        ? `你目前正在執行「${activeName}」。改用這門課會動到：\n\n`
        : '套用這門課會動到：\n\n';
    return head + impact.lines.map((l) => `· ${l.track}：${l.text}`).join('\n')
        + '\n\n原本的進度都會保留，隨時可以換回來。';
}

/**
 * 把這門課的跑步處方寫進「跑步」那一軌。
 * 用 generateCardioPlan 產生，而不是自己拼一份 —— 全 App 讀跑步計劃的地方
 * （中控台、週曆、提醒、結算）都只認這個 schema，自己拼會有半套資料的風險。
 *
 * @returns {Promise<{ok: boolean, plan?: object, error?: any}>}
 */
export async function applyCourseCardioPlan({ plan, levelKey, userId, apiClient = null, baselinePace5K = null, currentWeeklyKm = null, startDate = null }) {
    const impact = describeCourseImpact(plan, levelKey);
    if (!impact.writesRun) return { ok: false, skipped: true };

    try {
        if (!apiClient) throw new Error('套裝跑步計劃需要完成同步才能啟用');
        const cardioPlan = generateCardioPlan({
            goal: impact.goalKey,
            totalWeeks: impact.totalWeeks,
            sessionsPerWeek: impact.runSessions,
            currentLevel: levelKey || 'beginner',
            // 課程第一週的週跑量就是這門課替使用者設定的起點；
            // 使用者自己的實測週跑量若更高，引擎會自動往上抬（deriveRunnerLevel）。
            currentWeeklyKm: Number(currentWeeklyKm) || impact.weekKm || 0,
            baselinePace5K: baselinePace5K ?? null,
            ...(startDate ? { startDate } : {}),
            // ⚠ false：重訓那一軌已經由這門課自己的 days[] 負責。
            //   設 true 的話有氧引擎會再塞一塊「重訓交叉訓練」磚，
            //   首頁週曆就會同一週出現兩套重訓來源。
            includeStrength: false,
            sourceCourseId: plan?.id || null,
            sourceCourseName: plan?.name || null,
        });
        // 來源是持久化欄位；生成器不會保留任意 config 欄位。
        cardioPlan.source_course = {
            id: plan?.id || plan?.plan_id || null,
            name: plan?.name || plan?.plan_name || '',
            level: levelKey,
        };
        const { data } = await apiClient.post('/api/cardio-plan/save', { user_id: userId, plan: cardioPlan });
        if (data?.status !== 'success' || !data?.plan_id || !data?.plan?.weeks?.length) {
            throw new Error('套裝跑步計劃沒有取得有效儲存結果');
        }
        const savedPlan = data.plan;
        localStorage.setItem(`u_${userId}_onboarding_cardio_plan`, JSON.stringify(savedPlan));
        cacheRunCycle(userId, savedPlan);
        // 換跑步軌 → 之前的手動改期 / 減量存檔已經對不上新的磚，一併清掉
        try {
            localStorage.removeItem(`u_${userId}_run_day_overrides`);
            localStorage.removeItem(`u_${userId}_run_tweaks`);
            localStorage.removeItem(`drvn:weekBricks_${userId}`);
        } catch { /* 略 */ }

        return { ok: true, plan: savedPlan };
    } catch (e) {
        console.warn('[courseApply] cardio plan 生成失敗', e);
        return { ok: false, error: e };
    }
}
