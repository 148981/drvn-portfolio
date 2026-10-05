import { getUserId } from '../utils/auth';
import { toLocalDateKey } from './localDate';
/**
 * DynamicTDEEEngine.js
 *
 * 動態代謝估算引擎 — 四個黃金法則
 *
 * 這個引擎解決了「人不是機器人」問題：
 *   使用者週末忘記記、沒天天量體重，但系統依然能給出可信的 TDEE。
 *
 * 四個核心法則：
 *   Rule 1 — 不把「忘記記」當「斷食」   (The Ignore-Zero Rule)
 *   Rule 2 — 資料不足就「凍結」         (Confidence Score & Freeze)
 *   Rule 3 — 體重 EMA 平滑化           (Exponential Moving Average)
 *   Rule 4 — BMR × 1.1 安全網          (BMR Safety Floor)
 *
 * 核心公式（能量守恆）：
 *   TDEE = 平均有效熱量攝入 − (每日體重變化量 × 7700 kcal/kg)
 *
 *   體重下降 (Δ < 0) → TDEE > 攝入（消耗多於吃進去的）
 *   體重上升 (Δ > 0) → TDEE < 攝入（吃進去的多於消耗的）
 *   體重穩定          → TDEE ≈ 攝入
 */

// ─────────────────────────────────────────────────
// 常數
// ─────────────────────────────────────────────────

/** 低於此值視為「忘記記錄」，排除在計算之外 */
const MIN_VALID_CALORIES = 500;

/** 最低有效飲食記錄天數（Rule 2） */
const MIN_FOOD_DAYS = 4;

/** 最低有效體重量測次數（Rule 2） */
const MIN_WEIGHT_RECORDS = 2;

/** EMA 平滑係數 alpha（0.2 = 較平滑，0.4 = 較靈敏） */
const EMA_ALPHA = 0.25;

/**
 * 每日體重趨勢上限（kg/day）。
 * ±0.3 kg/day = ±2.1 kg/week — 已超過正常生理極限。
 * 超過此值幾乎可確定是量測誤差（不同機器、水分波動、排便差異），
 * 而非真實的脂肪/肌肉變化，必須截斷以防 TDEE 爆炸。
 */
const MAX_TREND_KG_PER_DAY = 0.3;

/** 體重記錄最大回溯天數（只取最近 90 天的 InBody 紀錄）*/
const MAX_WEIGHT_HISTORY_DAYS = 90;

/** 1 公斤體脂約等於的卡路里 */
const KCAL_PER_KG = 7700;

/** 快取 key 前綴（localStorage） */
const CACHE_KEY = 'tdee_cache_';


// ─────────────────────────────────────────────────
// Rule 1 — 過濾「忘記記錄」的天（Ignore-Zero Rule）
// ─────────────────────────────────────────────────

/**
 * 從飲食記錄中保留有效天數：
 *   - 熱量 >= MIN_VALID_CALORIES（過濾斷食誤判）
 *   - 熱量 < 8000（過濾異常超高值）
 *
 * @param {Array<{date:string, calories:number, protein?:number}>} mealHistory
 * @returns {Array} validDays — 僅包含有效紀錄的天
 */
export const filterValidFoodDays = (mealHistory = []) => {
    return (mealHistory || []).filter(d => {
        const cal = parseFloat(d.calories) || 0;
        return cal >= MIN_VALID_CALORIES && cal < 8000;
    });
};


// ─────────────────────────────────────────────────
// Rule 2 — 信任度門檻（Confidence Score）
// ─────────────────────────────────────────────────

/**
 * @typedef {'sufficient'|'insufficient'|'frozen'} ConfidenceStatus
 *
 * @returns {{ status: ConfidenceStatus, foodDays: number, weightRecords: number, message: string }}
 */
export const assessConfidence = (validFoodDays = [], validWeightRecords = []) => {
    const foodDays    = validFoodDays.length;
    const weightRecs  = validWeightRecords.length;

    if (foodDays >= MIN_FOOD_DAYS && weightRecs >= MIN_WEIGHT_RECORDS) {
        return {
            status: 'sufficient',
            foodDays,
            weightRecords: weightRecs,
            message: `已採集 ${foodDays} 天飲食 × ${weightRecs} 筆體重，動態估算啟動`,
        };
    }

    const missing = [];
    if (foodDays   < MIN_FOOD_DAYS)       missing.push(`飲食記錄不足（${foodDays}/${MIN_FOOD_DAYS} 天）`);
    if (weightRecs < MIN_WEIGHT_RECORDS)  missing.push(`體重紀錄不足（${weightRecs}/${MIN_WEIGHT_RECORDS} 筆）`);

    return {
        status: 'insufficient',
        foodDays,
        weightRecords: weightRecs,
        message: `本週數據不足，系統將凍結上週代謝估算。原因：${missing.join('、')}。`,
    };
};


// ─────────────────────────────────────────────────
// Rule 3 — 體重 EMA 平滑化（Weight Trend Smoothing）
// ─────────────────────────────────────────────────

/**
 * 對體重序列套用指數移動平均（EMA），消除每日水分/排便波動。
 * 並在有量測的點之間做線性補差，讓趨勢線更連貫。
 *
 * @param {Array<{date:string, weight:number}>} weightRecords - 按日期升序排列
 * @param {number} alpha - EMA 平滑係數（預設 0.25）
 * @returns {{ smoothed: Array<{date, rawWeight, ema}>, trendKgPerDay: number, startEMA: number, endEMA: number }}
 */
export const smoothWeightEMA = (weightRecords = [], alpha = EMA_ALPHA) => {
    const sorted = [...weightRecords]
        .filter(r => r.weight > 30 && r.weight < 300) // 排除生理不可能值
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (sorted.length < 2) {
        const single = sorted[0];
        return {
            smoothed:      single ? [{ date: single.date, rawWeight: single.weight, ema: single.weight }] : [],
            trendKgPerDay: 0,
            startEMA:      single?.weight || 0,
            endEMA:        single?.weight || 0,
            daySpan:       0,
        };
    }

    // EMA 計算
    let ema = sorted[0].weight;
    const smoothed = sorted.map(r => {
        ema = alpha * r.weight + (1 - alpha) * ema;
        return { date: r.date, rawWeight: r.weight, ema: +ema.toFixed(2) };
    });

    const startEMA = smoothed[0].ema;
    const endEMA   = smoothed[smoothed.length - 1].ema;
    const daySpan  = Math.max(1,
        (new Date(sorted[sorted.length - 1].date) - new Date(sorted[0].date)) / 86400000
    );
    const rawTrend = (endEMA - startEMA) / daySpan;

    // 截斷生理不可能的趨勢（量測誤差、不同機器、水分差異）
    const trendKgPerDay = Math.max(-MAX_TREND_KG_PER_DAY, Math.min(MAX_TREND_KG_PER_DAY, rawTrend));

    return { smoothed, trendKgPerDay, startEMA, endEMA, daySpan };
};


// ─────────────────────────────────────────────────
// Rule 4 — BMR × 1.1 安全網（Safety Floor）
// ─────────────────────────────────────────────────

/**
 * TDEE 的物理下限：BMR × 1.1
 * 不管使用者怎麼漏記，這個值就是「躺在床上一整天 + 10% NEAT」的最低消耗。
 *
 * @param {number} bmr - 基礎代謝率（kcal/day）
 * @returns {number} floor
 */
export const calcBMRFloor = (bmr) => Math.round((parseFloat(bmr) || 1400) * 1.1);


// ─────────────────────────────────────────────────
// 主函數：calcDynamicTDEE
// ─────────────────────────────────────────────────

/**
 * 動態 TDEE 計算（整合四個黃金法則）。
 *
 * @param {object} opts
 * @param {Array}  opts.mealHistory    - 飲食記錄 [{date, calories, protein, carbs, fats}]
 * @param {Array}  opts.weightHistory  - 體重記錄 [{date, weight}]，來自 InBody 或每日量測
 * @param {number} opts.bmr            - 基礎代謝（kcal）
 * @param {string} opts.userId         - 用於讀寫 localStorage 快取
 *
 * @returns {DynamicTDEEResult}
 */
export const calcDynamicTDEE = ({
    mealHistory   = [],
    weightHistory = [],
    bmr           = 1500,
    userId        = 'user1',
}) => {
    // ── Rule 1: 過濾無效日 ──────────────────────────────
    const validFoodDays = filterValidFoodDays(mealHistory);

    // ── Rule 3 prep: 整理體重資料（只取最近 90 天，避免舊量測扭曲趨勢）────────
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - MAX_WEIGHT_HISTORY_DAYS);
    const cutoffDateStr = toLocalDateKey(cutoffDate);

    const validWeightRecords = (weightHistory || [])
        .filter(r => r.weight > 30 && r.weight < 300)
        .filter(r => !r.date || r.date >= cutoffDateStr)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    // ── Rule 2: 信任度評估 ─────────────────────────────
    const confidence = assessConfidence(validFoodDays, validWeightRecords);
    const bmrFloor   = calcBMRFloor(bmr);

    if (confidence.status === 'insufficient') {
        // 從快取載入上次的 TDEE（凍結機制）
        const cached = loadCachedTDEE(userId);
        return {
            tdee:               cached?.tdee || bmrFloor,
            confidence:         'frozen',
            frozen:             true,
            frozenFrom:         cached?.date || null,
            frozenTDEE:         cached?.tdee || bmrFloor,
            bmrFloor,
            bmr,
            message:            confidence.message,
            foodDays:           confidence.foodDays,
            weightRecords:      confidence.weightRecords,
            validFoodDays:      [],
            smoothed:           [],
            trendKgPerDay:      0,
            weightTrend:        'unknown',
            avgDailyCalories:   null,
            rawTDEE:            null,
            wasCappedByBMR:     false,
        };
    }

    // ── Rule 3: EMA 體重平滑 ──────────────────────────
    const { smoothed, trendKgPerDay, startEMA, endEMA, daySpan } =
        smoothWeightEMA(validWeightRecords);

    // ── 能量守恆公式計算 TDEE ──────────────────────────
    const avgDailyCalories = validFoodDays.reduce((s, d) => s + d.calories, 0) / validFoodDays.length;

    // TDEE = 平均攝取 − (每日體重變化 × 7700)
    // 體重下降 (Δ < 0) → TDEE 大於攝取（你消耗比吃的多）
    const rawTDEE = avgDailyCalories - trendKgPerDay * KCAL_PER_KG;

    // ── Rule 4: BMR 安全網 ─────────────────────────────
    const tdee          = Math.round(Math.max(rawTDEE, bmrFloor));
    const wasCappedByBMR = rawTDEE < bmrFloor;

    // 體重趨勢標籤
    const weightTrend =
        trendKgPerDay >  0.02 ? 'gaining' :
        trendKgPerDay < -0.02 ? 'losing'  : 'stable';

    // 儲存此次結果供下次凍結使用
    saveCachedTDEE(userId, { tdee, date: toLocalDateKey(new Date()) });

    return {
        tdee,
        confidence:       'sufficient',
        frozen:           false,
        frozenFrom:       null,
        frozenTDEE:       null,
        bmrFloor,
        bmr,
        message:          confidence.message,
        foodDays:         confidence.foodDays,
        weightRecords:    confidence.weightRecords,
        validFoodDays,
        smoothed,          // [{date, rawWeight, ema}] — 給圖表用
        trendKgPerDay:    +trendKgPerDay.toFixed(4),
        weightTrend,
        startEMA:         +startEMA.toFixed(1),
        endEMA:           +endEMA.toFixed(1),
        daySpan:          Math.round(daySpan),
        avgDailyCalories: Math.round(avgDailyCalories),
        rawTDEE:          Math.round(rawTDEE),
        wasCappedByBMR,
    };
};


// ─────────────────────────────────────────────────
// InBody → 體重記錄轉換器
// ─────────────────────────────────────────────────

/**
 * 從 InBody 記錄陣列中提取每日體重資料（作為體重歷史的主要來源）。
 *
 * @param {Array} inbodyRecords - 從 localStorage `inbody_local_${userId}` 讀取
 * @returns {Array<{date:string, weight:number, source:'inbody'}>}
 */
export const extractWeightFromInBody = (inbodyRecords = []) => {
    return (inbodyRecords || [])
        .filter(r => r.weight_kg > 0)
        .map(r => ({
            date:   (r.measurement_date || r.date || '').split('T')[0],
            weight: parseFloat(r.weight_kg),
            source: 'inbody',
        }))
        .filter(r => r.date && r.weight > 0);
};


// ─────────────────────────────────────────────────
// LocalStorage 快取（凍結用）
// ─────────────────────────────────────────────────

const loadCachedTDEE = (userId) => {
    try {
        return JSON.parse(localStorage.getItem(`${CACHE_KEY}${userId}`) || 'null');
    } catch { return null; }
};

const saveCachedTDEE = (userId, data) => {
    try {
        localStorage.setItem(`${CACHE_KEY}${userId}`, JSON.stringify(data));
    } catch { /* storage full or SSR */ }
};


// ─────────────────────────────────────────────────
// Convenience: all-in-one loader
// ─────────────────────────────────────────────────

/**
 * 完整的動態 TDEE 計算管線（一行呼叫版本）。
 * 自動從 localStorage 讀取 InBody 記錄。
 *
 * @param {object} opts
 * @param {Array}  opts.mealHistory  - 飲食記錄陣列（從 API history 取得）
 * @param {number} opts.bmr          - 基礎代謝（由 NutritionEngine.calcSmartBMR 計算）
 * @param {string} opts.userId
 * @param {Array}  opts.extraWeightLogs - 額外每日體重記錄（可選，格式同 InBody）
 *
 * @returns {DynamicTDEEResult}
 */
export const runDynamicTDEE = ({ mealHistory, bmr, userId = getUserId(), extraWeightLogs = [] }) => {
    // 從 InBody 提取體重記錄
    let inbodyRecords = [];
    try {
        inbodyRecords = JSON.parse(localStorage.getItem(`inbody_local_${userId}`) || '[]');
    } catch { /* pass */ }

    // 只保留最近 MAX_WEIGHT_HISTORY_DAYS 天的 InBody 記錄，
    // 避免舊測量與現在食物數據跨度不一致，導致 TDEE 爆炸
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - MAX_WEIGHT_HISTORY_DAYS);
    const cutoffStr = toLocalDateKey(cutoff);

    const inbodyWeights = extractWeightFromInBody(inbodyRecords)
        .filter(r => r.date >= cutoffStr);

    // 合併：InBody + 額外每日量測（去重，同一天 InBody 優先）
    const seen = new Set(inbodyWeights.map(r => r.date));
    const extraFiltered = (extraWeightLogs || []).filter(r => !seen.has(r.date));
    const weightHistory = [...inbodyWeights, ...extraFiltered]
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    return calcDynamicTDEE({ mealHistory, weightHistory, bmr, userId });
};
