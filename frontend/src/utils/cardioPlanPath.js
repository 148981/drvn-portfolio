// ════════════════════════════════════════════════════════════════════════
//  cardioPlanPath.js — 分期路徑規劃「從你現在的位置，怎麼走到那個目標」
//  ─────────────────────────────────────────────────────────────────────
//  背景：
//    週量安全閘上線後（v2.1），引擎不會再憑空生出做不到的課表。
//    代價是：週跑量 5 km 的人選半馬，14 週只爬得到 13–15 km/週，
//    引擎會誠實地說「這期還到不了」。誠實是對的，但只講到這裡會勸退人。
//
//  這支模組補上後半句：「到不了，但這是走過去的路，總共要多久。」
//
//  做法：
//    用「真正的引擎」逐期模擬（schedulePhases + calculateWeeklyMileage），
//    每一期結束後把尖峰的 85% 當作下一期的基準線（期間會有幾週休整），
//    並依新的週跑量重新判定難度級別，直到爬過該賽事的最低準備量。
//
//    絕不用另一套公式去畫大餅 —— 路徑上的每一個數字，
//    都是使用者真的按下去就會拿到的課表。
// ════════════════════════════════════════════════════════════════════════

import { schedulePhases, calculateWeeklyMileage } from './cardioPlanFusionEngine';
import { levelFromWeeklyKm, LEVEL_ZH } from './runnerLevel';

/** 各賽事的「最低準備量」— 與引擎的 RACE_MIN_PEAK 對齊 */
export const RACE_TARGETS = {
    race_5k_10k: { minPeak: 25, name: '5K / 10K',   short: '10K' },
    race_half:   { minPeak: 30, name: '半程馬拉松', short: '半馬' },
    race_full:   { minPeak: 45, name: '全程馬拉松', short: '全馬' },
};

export const GOAL_NAMES = {
    fat_loss:     '減脂燃燒',
    aerobic_base: '有氧基礎',
    race_5k_10k:  '5K / 10K',
    race_half:    '半程馬拉松',
    race_full:    '全程馬拉松',
};

/** 每一期之間會有 1–2 週的休整，基準線不會停在尖峰上 */
const CARRYOVER_RATIO = 0.85;
/** 後續每一期的預設長度（週） */
const STAGE_WEEKS = 12;
/** 安全上限：最多規劃到第 5 期，再遠就不是「計劃」而是「幻想」 */
const MAX_STAGES = 5;

const round1 = (v) => Math.round(v * 10) / 10;

/**
 * 用真正的引擎模擬一期，回傳這一期的起點與尖峰
 */
export function simulateStage({ goal, level, weeks, startKm }) {
    const schedule = schedulePhases(weeks, goal);
    const weekly = calculateWeeklyMileage(goal, level, schedule, startKm);
    return {
        weekly,
        startKm: weekly[0] ?? startKm,
        peakKm: weekly.length ? Math.max(...weekly) : startKm,
        totalKm: weekly.reduce((a, b) => a + b, 0),
    };
}

/**
 * 決定下一期該練什麼 —— 離目標還遠就先用中距離備賽把有氧上限撐起來，
 * 靠近了才正式進入目標課表。這是教練排年度計劃的一般作法。
 */
const goalForStage = (targetGoal, km, minPeak) => {
    // 週量還在 12 公里以下 → 什麼備賽都別談，先把有氧底做出來
    if (km < 12) return 'aerobic_base';
    // 已經摸到門檻的七成 → 正式進入目標課表
    if (km >= minPeak * 0.72) return targetGoal;
    // 中間地帶：照階梯往上爬，不跳級
    if (targetGoal === 'race_full') return km >= 25 ? 'race_half' : 'race_5k_10k';
    if (targetGoal === 'race_half') return 'race_5k_10k';
    return 'aerobic_base';   // 目標本來就是 5K/10K，中間階段就是繼續打底
};

const whyForStage = (goal, target, km, isFinal) => {
    if (isFinal) return `週量已經站上 ${target.minPeak} 公里的門檻，這期就是正式的${target.short}備賽。`;
    switch (goal) {
        case 'aerobic_base':
            return '先把有氧引擎做出來。這階段幾乎全是輕鬆跑 — 無聊，但後面的里程全靠它撐。';
        case 'race_5k_10k':
            return '用中距離備賽拉高乳酸閾值與 VO₂max，這是把週跑量再往上推的關鍵一步。';
        case 'race_half':
            return '半馬課表的長跑量會直接把你帶進全馬的準備區間。';
        default:
            return '延續上一期的量繼續往上堆。';
    }
};

/**
 * 規劃通往目標的完整分期路徑
 *
 * @param {object} plan  generateCardioPlan() 的輸出（第 1 期＝使用者現在這份）
 * @returns {null | {
 *   target, reachable, stages, totalWeeks, totalMonths, gapKm, summary
 * }}
 *   goal 不是備賽型、或這期已經達標 → 回傳 null（不需要分期）
 */
export function planStagedPath(plan) {
    const goal = plan?.goal;
    const target = RACE_TARGETS[goal];
    if (!target || !plan?.weeks?.length) return null;

    const currentPeak = Number(plan.meta?.peak_mileage_km) || 0;
    if (currentPeak >= target.minPeak) return null;   // 這期就夠了，不必分期

    const stages = [];

    // ── 第 1 期 = 使用者現在這份計劃（真實數字，不是模擬） ──────────
    stages.push({
        index: 1,
        isCurrent: true,
        goal,
        goalName: GOAL_NAMES[goal] || goal,
        level: plan.current_level,
        levelName: LEVEL_ZH[plan.current_level] || plan.current_level,
        weeks: plan.total_weeks,
        startKm: round1(plan.weeks[0]?.target_mileage_km || 0),
        peakKm: round1(currentPeak),
        why: '你現在選的這一期。從你真實的基準線出發，安全地把週量往上帶。',
        reachedTarget: false,
    });

    // ── 後續各期：用真引擎往下推 ─────────────────────────────────
    let km = currentPeak * CARRYOVER_RATIO;
    let reachable = false;

    for (let i = 2; i <= MAX_STAGES; i++) {
        const level = levelFromWeeklyKm(km);
        const stageGoal = goalForStage(goal, km, target.minPeak);
        const sim = simulateStage({ goal: stageGoal, level, weeks: STAGE_WEEKS, startKm: km });
        const hit = sim.peakKm >= target.minPeak;
        const isFinalGoalCycle = stageGoal === goal && hit;

        stages.push({
            index: i,
            isCurrent: false,
            goal: stageGoal,
            goalName: GOAL_NAMES[stageGoal] || stageGoal,
            level,
            levelName: LEVEL_ZH[level] || level,
            weeks: STAGE_WEEKS,
            startKm: round1(sim.startKm),
            peakKm: round1(sim.peakKm),
            why: whyForStage(stageGoal, target, km, isFinalGoalCycle),
            reachedTarget: isFinalGoalCycle,
        });

        km = sim.peakKm * CARRYOVER_RATIO;

        if (isFinalGoalCycle) { reachable = true; break; }
        // 已經達標但這期練的不是目標課表 → 再補一期正式備賽
        if (hit && stageGoal !== goal) continue;
    }

    // ── 第 1 期選錯課表了嗎？ ────────────────────────────────────
    //   週跑量 5 公里的人選「半程馬拉松」，拿到的其實是一份打底課表，
    //   卻掛著半馬的名字 —— 而且會被塞進不必要的節奏跑與長跑結構。
    //   直接建議他改成真正對的那一種，並說明差在哪。
    //   建議不能只是嘴上說「這樣比較好」—— 直接把兩種課表跑一遍，
    //   把尖峰週量與總里程的差距算出來給使用者看。講得出數字才算數。
    const startKm0 = stages[0].startKm;
    const idealFirst = goalForStage(goal, Math.max(startKm0, 5), target.minPeak);
    let recommendSwitch = null;
    if (idealFirst !== goal) {
        const alt = simulateStage({
            goal: idealFirst,
            level: plan.current_level,
            weeks: plan.total_weeks,
            startKm: plan.meta?.current_weekly_km ?? startKm0,
        });
        const peakGain = round1(alt.peakKm - currentPeak);
        const totalNow = plan.weeks.reduce((a, w) => a + (w.target_mileage_km || 0), 0);
        const totalGain = Math.round(alt.totalKm - totalNow);
        // ⚠️ taper 只有「換成非備賽目標」才真的省得下來 —
        //    5K/10K 一樣是備賽型，也有 taper，不能算成好處。
        const taperWeeks = plan.weeks.filter((w) => w.phase === 'taper').length;
        const altHasTaper = !!RACE_TARGETS[idealFirst];
        const taperSaved = altHasTaper ? 0 : taperWeeks;

        const gains = [];
        if (peakGain > 0) gains.push(`尖峰週量 +${peakGain} 公里`);
        if (totalGain > 0) gains.push(`整期多跑 ${totalGain} 公里`);
        if (taperSaved > 0) gains.push(`省下 ${taperSaved} 週賽前減量`);

        recommendSwitch = {
            goal: idealFirst,
            name: GOAL_NAMES[idealFirst] || idealFirst,
            peakKm: round1(alt.peakKm),
            peakGain,
            totalGain,
            gains,
            // 一句話。好多少，交給下面的 gains 標籤用數字講 ——
            // 三句話擠在一起，使用者只會跳過整段。
            why: idealFirst === 'aerobic_base'
                ? `你現在 ${startKm0} 公里／週還在打底區間，${target.short}課表的賽前減量對你沒用。`
                : `先把有氧上限推上去，${target.short}的長跑量才吃得下。`,
        };
    }

    const totalWeeks = stages.reduce((n, s) => n + s.weeks, 0);
    // 期與期之間各留 1 週休整
    const calendarWeeks = totalWeeks + (stages.length - 1);
    // ⚠️ 不給小數。34 週 ÷ 4.345 = 7.82，但「約 7.8 個月」是假精度 ——
    //    沒有人安排得出 0.8 個月，而且使用者把每一期的週數加起來也湊不出它。
    //    週才是這張卡上唯一加得起來的單位；月只留整數當粗略感受。
    const totalMonths = Math.round(calendarWeeks / 4.345);

    const summary = reachable
        ? `${calendarWeeks} 週後週量會站上 ${target.minPeak} 公里，那時候再去跑${target.short}。`
        : `${MAX_STAGES} 期之內還到不了${target.short}的準備量，先換成${GOAL_NAMES[stages[1]?.goal] || '有氧基礎'}。`;

    return {
        target,
        reachable,
        stages,
        recommendSwitch,
        totalWeeks,
        calendarWeeks,
        totalMonths,
        gapKm: round1(target.minPeak - currentPeak),
        summary,
    };
}

export default planStagedPath;
