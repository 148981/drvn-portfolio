/**
 * 💪 strengthOutcomeForecast — 健身計劃「預期成效」預測引擎
 * ─────────────────────────────────────────────────────────────────────
 * 三大系統的回饋分工（單一真相源，其他模組請引用此註解）：
 *
 *   🏃 跑步系統   → 預測「表現」：週里程曲線、配速區間（VDOT）、有氧能力
 *   💪 健身系統   → 預測「力量與肌肉」：主力動作力量成長 %、骨骼肌(SMM)增量、週訓練量
 *   🥗 營養系統   → 預測「身體組成」：體重 / 體脂軌跡（熱量收支 × P-ratio）
 *
 *   界線：健身系統回答「你會變多強、長多少肌肉」——以 InBody 的骨骼肌量
 *   （skeletal_muscle_mass）為錨點；體重與體脂率的走向屬於熱量收支問題，
 *   一律交給營養系統的體重預測曲線，本模組只做交叉引導、不重複預測。
 *
 * 科學依據（訓練科學共識區間）：
 *   月度力量成長：初學 6–10% / 中階 3–5% / 進階 1–2%（Newbie gains 遞減）
 *   月度骨骼肌增量（熱量與蛋白質到位前提）：初學 0.4–0.8kg / 中階 0.2–0.4 / 進階 0.05–0.15
 *   頻率係數：每週 3 練 ×0.9、4 練 ×1.0、5 練 ×1.08、6 練 ×1.12（邊際遞減）
 *   風格係數：力量型 1RM 成長 ×1.25、肌肥大 ×1.0；肌肉量反向 ×0.85 / ×1.0
 */

import { getUserId } from './auth';

// ── 讀最新 InBody（與營養系統同一份資料源：inbody_local_<uid>）──────────
export function getLatestInbody(userId = getUserId()) {
    try {
        const arr = JSON.parse(localStorage.getItem(`inbody_local_${userId}`) || '[]');
        if (!Array.isArray(arr) || arr.length === 0) return null;
        // 依日期取最新一筆（陣列不保證排序）
        const measuredAt = (r) => Date.parse(r?.measurement_date || r?.date || r?.created_at || '');
        const sorted = arr.filter(r => Number.isFinite(measuredAt(r)) && measuredAt(r) <= Date.now())
            .sort((a, b) => measuredAt(b) - measuredAt(a));
        if (!sorted.length) return null;
        const n = { ...sorted[0] };
        // 欄位別名歸一（鏡像 NutritionPageMobile 的 normalize 規則）
        if (n.weight !== undefined && n.weight_kg === undefined) n.weight_kg = n.weight;
        if (n.body_fat_percentage !== undefined && n.body_fat_percent === undefined) n.body_fat_percent = n.body_fat_percentage;
        if (n.muscle_mass !== undefined && n.skeletal_muscle_mass === undefined) n.skeletal_muscle_mass = n.muscle_mass;
        return n;
    } catch {
        return null;
    }
}

const STRENGTH_GAIN_PCT_MONTH = {
    beginner:     [6, 10],
    intermediate: [3, 5],
    advanced:     [1, 2],
};
const SMM_GAIN_KG_MONTH = {
    beginner:     [0.4, 0.8],
    intermediate: [0.2, 0.4],
    advanced:     [0.05, 0.15],
};
const FREQ_SCALE = { 1: 0.6, 2: 0.75, 3: 0.9, 4: 1.0, 5: 1.08, 6: 1.12, 7: 1.12 };

/**
 * 主入口：依計劃參數＋InBody 產出「照著練 N 週後」的預期成效
 *
 * @returns {{
 *   weeks, strengthGainPct: [lo,hi], smmGainKg: [lo,hi],
 *   baselineSMM, projectedSMM: [lo,hi]|null, weeklySets: number|null,
 *   hasInbody: boolean, notes: string[]
 * }}
 */
export function computeStrengthForecast({
    level = 'beginner',
    daysPerWeek = 4,
    trainingStyle = 'bodybuilding',
    weeks = 4,
    plan = null,
    inbody = null,
} = {}) {
    const months = weeks / 4.33;
    const freq = FREQ_SCALE[daysPerWeek] ?? 1.0;
    const styleStrength = trainingStyle === 'strength' ? 1.25 : 1.0;
    const styleHyper = trainingStyle === 'strength' ? 0.85 : 1.0;

    const [sLo, sHi] = STRENGTH_GAIN_PCT_MONTH[level] || STRENGTH_GAIN_PCT_MONTH.intermediate;
    const [mLo, mHi] = SMM_GAIN_KG_MONTH[level] || SMM_GAIN_KG_MONTH.intermediate;

    const strengthGainPct = [
        Math.round(sLo * months * freq * styleStrength * 10) / 10,
        Math.round(sHi * months * freq * styleStrength * 10) / 10,
    ];
    const smmGainKg = [
        Math.round(mLo * months * freq * styleHyper * 100) / 100,
        Math.round(mHi * months * freq * styleHyper * 100) / 100,
    ];

    // 週訓練量：從計劃第一週實算（正式動作組數總和）
    let weeklySets = null;
    const days = plan?.weeks?.[0]?.days || [];
    if (days.length) {
        weeklySets = days.reduce((sum, d) =>
            sum + (d.exercises || [])
                .filter((e) => !e.isWarmup)
                .reduce((s, e) => s + (parseInt(e.sets_target ?? e.sets) || 3), 0),
        0);
    }

    const rawSmm = Number(inbody?.skeletal_muscle_mass);
    const smm = Number.isFinite(rawSmm) && rawSmm > 0 ? rawSmm : null;
    const projectedSMM = smm != null
        ? [
            Math.round((smm + smmGainKg[0]) * 10) / 10,
            Math.round((smm + smmGainKg[1]) * 10) / 10,
        ]
        : null;

    const notes = [
        '肌肉增量以「熱量與蛋白質到位」為前提 — 體重與體脂的走向請看營養系統的計劃預測。',
    ];
    if (!inbody) {
        notes.push('尚未量測 InBody — 到「身體數據」補一筆，即可看到你的骨骼肌量預測起點。');
    }
    if (level === 'advanced') {
        notes.push('進階者成長以突破停滯與細節雕刻為主，數字小是正常的。');
    }

    return {
        weeks,
        strengthGainPct,
        smmGainKg,
        baselineSMM: smm,
        projectedSMM,
        weeklySets,
        hasInbody: !!inbody,
        notes,
    };
}

export default { computeStrengthForecast, getLatestInbody };
