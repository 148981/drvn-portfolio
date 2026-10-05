/**
 * ══════════════════════════════════════════════════════════════════════════
 * NUTRITION TARGETS — 營養目標的單一真相源
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 為什麼有這個檔案：
 *
 * 稽核前，同一個目標散落在四五個地方，而且數字互相打架：
 *   膳食纖維  UI 環寫 /30g、歷史頁 DailyScoreCard 用 30、
 *             推給後端／Apple Watch 的 payload 卻寫死 25  → 手錶跟手機不同調
 *   水分      進度條分母 2500、DailyScoreCard 分母 2500、
 *             但成就「水分充足」在 2000 就觸發        → 進度條 80% 卻跳達標
 *
 * 使用者不會知道是哪支檔案寫錯，他只會覺得「這個 App 的數字不可信」。
 * 所有跟營養目標有關的常數與推導，一律只能從這裡出去。
 *
 * 規則：任何檔案都不准再出現 2500 / 2000 / 30 / 25 這種裸數字。
 */

// ── 基準值（成人一般建議；有個人化資料時由下方 resolve 覆寫）────────────────
export const FIBER_GOAL_G = 30;        // 每日膳食纖維（g）— 美國 DGA 成人建議 25–38g，取中位
export const WATER_GOAL_ML = 2500;     // 每日水分（ml）— 預設值，有體重時改用 35ml/kg
export const WATER_PER_KG_ML = 35;     // 體重每公斤建議飲水量（ml）
export const WATER_MIN_ML = 1800;      // 下限：再輕也不該低於這個量
export const WATER_MAX_ML = 4000;      // 上限：避免體重輸入異常時算出誇張目標

// 訓練日額外補水：每燃燒 100 kcal 補 120ml（ACSM 流汗補償的粗估）
export const WATER_PER_100KCAL_ML = 120;

/**
 * 依體重 / 當日訓練量推導個人化水分目標。
 * 沒有體重就退回 WATER_GOAL_ML，不會回傳 undefined 讓呼叫端自己填魔術數字。
 *
 * @param {number} weightKg    體重（kg），可為空
 * @param {number} workoutBurn 當日運動消耗（kcal），可為空
 * @returns {number} 目標水量（ml，取整到 50）
 */
export const resolveWaterGoal = (weightKg, workoutBurn = 0) => {
    const base = weightKg > 0 ? weightKg * WATER_PER_KG_ML : WATER_GOAL_ML;
    const sweat = (workoutBurn > 0 ? workoutBurn : 0) / 100 * WATER_PER_100KCAL_ML;
    const raw = base + sweat;
    const clamped = Math.min(WATER_MAX_ML, Math.max(WATER_MIN_ML, raw));
    return Math.round(clamped / 50) * 50;
};

/**
 * 膳食纖維目標。目前不隨體重變動，但集中在這裡，
 * 之後要改成隨熱量調整（例如 14g / 1000 kcal）只要動這一支。
 */
export const resolveFiberGoal = () => FIBER_GOAL_G;

/** A committed plan already includes its activity assumption. Do not silently
 * add workout calories or replace it with a newly estimated deficit. */
export function committedNutritionGoals(plan) {
    if (!plan) return null;
    const calories = Number(plan.adjustedIntake || plan.recommendedIntake);
    const protein = Number(plan.newProtein), carbs = Number(plan.newCarbs), fats = Number(plan.newFat);
    if (![calories, protein, carbs, fats].every(Number.isFinite) || calories <= 0 || Math.min(protein, carbs, fats) < 0) return null;
    return { calories: Math.round(calories), protein, carbs, fats,
        tdee: Number(plan.tdee || plan.intrinsicTDEE) || null,
        mode: plan.goalType === 'cut' ? 'cutting' : plan.goalType === 'bulk' ? 'bulking' : 'maintenance' };
}

/**
 * 依「目標模式」從 TDEE 推出每日熱量與三大營養素。
 * 營養頁切換模式與首次設定精靈共用這一份 —— 兩邊才不會對同一個人算出不同的數字。
 * 任一項不是正數就回傳 null：寧可沒有目標，也不要存一份錯的。
 */
export const MODE_CALORIE_DELTA = { cutting: -400, maintenance: 0, bulking: 250 };
const MODE_MACROS_PER_KG = {
    cutting: { protein: 2.0, fat: 0.8 },
    maintenance: { protein: 1.8, fat: 0.9 },
    bulking: { protein: 1.8, fat: 0.8 },
};
export function macroGoalsForMode({ mode, tdee, weight }) {
    const w = Number(weight), t = Number(tdee);
    const delta = MODE_CALORIE_DELTA[mode];
    const per = MODE_MACROS_PER_KG[mode];
    if (!(w > 0) || !(t > 0) || delta === undefined || !per) return null;
    const target_calories = Math.round(t + delta);
    const protein_target = Math.round(w * per.protein);
    const fat_target = Math.round(w * per.fat);
    const carb_target = Math.round((target_calories - protein_target * 4 - fat_target * 9) / 4);
    if (!(target_calories > 0 && protein_target > 0 && fat_target > 0 && carb_target > 0)) return null;
    return { mode, target_calories, protein_target, carb_target, fat_target, tdee: Math.round(t) };
}

/**
 * 達成判定的統一門檻 —— 進度條、成就、教練文案共用同一條線，
 * 不會再出現「條子 80% 但成就說達標」。
 */
export const GOAL_HIT_RATIO = 0.9;   // 到達目標的 90% 就算達成
export const isGoalHit = (value, goal) => goal > 0 && (value || 0) >= goal * GOAL_HIT_RATIO;

/**
 * 統一的百分比計算（含 0 分母防呆、上限 100）。
 * 各卡片自己寫 Math.min(100, x / y * 100) 是重複代碼，也是打架的來源。
 */
export const pctOf = (value, goal) =>
    goal > 0 ? Math.min(100, Math.round(((value || 0) / goal) * 100)) : 0;

/**
 * 巨量營養素的顯示定義 —— 名稱、單位、色票、順序全部一份。
 * Hero 環、歷史日卡、分析頁、Apple Watch 都吃這份，欄位順序才不會東一套西一套。
 *
 * ⚠️ 膳食纖維與水分「不是」巨量營養素，刻意不放進來：
 *    它們是「有沒有吃夠」的補給指標，UI 上獨立成一張補給卡。
 */
export const MACRO_DEFS = [
    { key: 'protein', label: '蛋白質', short: '蛋白', unit: 'g', color: '#D94030' },
    { key: 'carbs', label: '碳水', short: '碳水', unit: 'g', color: '#161415' },
    { key: 'fats', label: '脂肪', short: '脂肪', unit: 'g', color: '#D4C5A5' },
];

export const SUPPLY_DEFS = [
    { key: 'fiber', label: '膳食纖維', short: '纖維', unit: 'g', color: '#5A7A3A' },
    { key: 'water', label: '水分', short: '水', unit: 'ml', color: '#5E86A8' },
];

export default {
    FIBER_GOAL_G,
    WATER_GOAL_ML,
    resolveWaterGoal,
    resolveFiberGoal,
    isGoalHit,
    pctOf,
    MACRO_DEFS,
    SUPPLY_DEFS,
};
