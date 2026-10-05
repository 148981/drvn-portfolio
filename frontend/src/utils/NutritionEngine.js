import { getUserId } from '../utils/auth';
import { uGet } from './userStorage';
import { inRange, normalizeGender } from './biometrics';
/**
 * NutritionEngine.js
 *
 * 完整營養計算引擎：
 *   InBody/基本資料 → BMR → TDEE → 目標熱量 → 巨量營養素分配
 *
 * 支援兩種 BMR 公式：
 *   1. Mifflin-St Jeor（身高體重年齡性別）
 *   2. Katch-McArdle（使用 InBody 的除脂體重，精準度更高）
 *
 * 活動係數自動從訓練紀錄推算，不需要使用者手動選。
 */

// ═══════════════════════════════════════════════════
// 1. BMR CALCULATION
// ═══════════════════════════════════════════════════

/* 合法區間檢查與性別正規化都用 biometrics 那一份 —— 全專案只有一份定義。 */

/**
 * Mifflin-St Jeor (fallback when no InBody data)
 * Male:   10 × weight(kg) + 6.25 × height(cm) − 5 × age − 5 + 5
 * Female: 10 × weight(kg) + 6.25 × height(cm) − 5 × age − 5 − 161
 */
export const calcBMR_MifflinStJeor = ({ weight, height, age, gender }) => {
    /* ⚠️ 缺任何一項就回 null，不再用 70／170／25 頂上去。
       以前那組預設值會讓全新使用者按一下「減脂」就送出
       「熱量 1859、蛋白 0g、脂肪 0g、碳水 465g」—— 熱量是用一個不存在的人
       算的，蛋白與脂肪用真實的 0。呼叫端拿到 null 時要顯示「去補資料」的
       入口，不是自己再編一個（介面標準 §5）。 */
    const w = inRange(weight, 20, 300);
    const h = inRange(height, 80, 250);
    const a = inRange(age, 5, 120);
    const g = normalizeGender(gender);
    if (w == null || h == null || a == null || g == null) return null;
    return Math.round(10 * w + 6.25 * h - 5 * a + genderConstant(g));
};

/**
 * Mifflin-St Jeor 的性別常數（男 +5 / 女 −161）。
 *
 * ⚠ 稽核發現：全站 8 份實作對「沒填性別」的預設剛好相反 ——
 *   舊的 JourneyAlgorithm（已刪除）寫 `gender === 'M' ? 5 : -161`（未填→女），
 *   本引擎寫 `=== 'female' ? -161 : 5`（未填→男），
 *   同一個使用者因此會拿到差 166 kcal 的兩個目標。
 *   這裡把所有寫法（male/M/男、female/F/女）明確列出，未填一律採男性常數 ——
 *   選這個方向是因為它把熱量目標抓得較高：減脂時赤字較保守、增肌時盈餘較保守，
 *   兩邊都是比較安全的錯法。
 */
const genderConstant = (gender) => {
    const g = String(gender ?? '').trim().toLowerCase();
    if (g === 'female' || g === 'f' || g === '女' || g === 'woman') return -161;
    return 5; // male / m / 男 / 未填 / other
};

/**
 * Katch-McArdle (uses Lean Body Mass from InBody — much more accurate)
 * BMR = 370 + 21.6 × LBM(kg)
 *
 * LBM can be calculated from:
 *   - Direct: skeletal_muscle_mass is NOT the same as LBM
 *   - Best: weight × (1 - body_fat_percent / 100)
 */
/**
 * Katch-McArdle 的公式本體：BMR = 370 + 21.6 × 去脂體重(kg)。
 * 抽出來的理由：常數原本散在三個檔。LBM 的「來源」各頁不同是合理的
 * （InBody 直接量到的 LBM 比用體脂率回推準），但公式只能有一份。
 */
export const bmrFromLBM = (lbm) => Math.round(370 + 21.6 * (parseFloat(lbm) || 0));

export const calcBMR_KatchMcArdle = ({ weight, bodyFatPercent }) => {
    const w = inRange(weight, 20, 300);   // 沒有真實體重就算不出 LBM
    const bf = parseFloat(bodyFatPercent);
    if (w == null) return null;
    if (isNaN(bf) || bf <= 0 || bf >= 60) return null; // Invalid → fallback to Mifflin
    const lbm = w * (1 - bf / 100);
    return Math.round(370 + 21.6 * lbm);
};

/**
 * Smart BMR: tries Katch-McArdle first, falls back to Mifflin-St Jeor
 */
export const calcSmartBMR = (profile, inbody) => {
    // Try Katch-McArdle with InBody data
    if (inbody?.body_fat_percent && inbody?.weight_kg) {
        const katch = calcBMR_KatchMcArdle({
            weight: inbody.weight_kg,
            bodyFatPercent: inbody.body_fat_percent,
        });
        if (katch) return { bmr: katch, method: 'Katch-McArdle', lbm: +(inbody.weight_kg * (1 - inbody.body_fat_percent / 100)).toFixed(1) };
    }

    // Fallback to Mifflin-St Jeor —— 一樣不補預設值，缺就是缺
    const mifflin = calcBMR_MifflinStJeor({
        weight: inbody?.weight_kg ?? profile?.weight ?? profile?.current_weight,
        height: inbody?.height ?? profile?.height ?? profile?.height_cm,
        age: profile?.age ?? inbody?.age,
        gender: profile?.gender ?? inbody?.gender,
    });
    return { bmr: mifflin, method: mifflin == null ? null : 'Mifflin-St Jeor', lbm: null };
};


// ═══════════════════════════════════════════════════
// 2. ACTIVITY MULTIPLIER (auto-detected from training records)
// ═══════════════════════════════════════════════════

/**
 * Instead of asking the user "how active are you", we calculate it
 * from their actual training frequency in the past 7 days.
 *
 * Sedentary:       < 1 session/week → 1.2
 * Lightly Active:  1-2 sessions     → 1.375
 * Moderately:      3-4 sessions     → 1.55
 * Very Active:     5-6 sessions     → 1.725
 * Extra Active:    7+ sessions      → 1.9
 */
export const calcActivityMultiplier = (userId) => {
    try {
        // Count training days in the past 7 days（使用 userId 命名空間）
        const trainingRecords = uGet(userId, 'trainingRecords', {});
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);

        // 🔴 Fix: trainingRecords 的 key 格式是 sessionId（如 "local_1716822400000"），
        // 而非日期字串。正確做法是讀取每筆紀錄的 .date / .timestamp 欄位，
        // 並去重計算「不重複日期」數量（同一天多筆只算一天）。
        const uniqueDays = new Set();
        Object.values(trainingRecords).forEach(record => {
            // 支援兩種格式：record.date（'2024-05-01'）或 record.timestamp（ISO string）
            const dateStr = record?.date || (record?.timestamp ? record.timestamp.split('T')[0] : null);
            if (!dateStr) return;
            try {
                const d = new Date(dateStr);
                if (!isNaN(d.getTime()) && d >= sevenDaysAgo) {
                    uniqueDays.add(dateStr); // 同一天多筆訓練只計一次
                }
            } catch { /* 忽略格式異常的紀錄 */ }
        });
        let strengthDays = uniqueDays.size;

        // 🔴 Fix(cardioDays): 舊邏輯讀取「計劃排程」（planned），不代表實際完成
        // 新邏輯：優先從 localStorage 的真實跑步記錄抓最近 7 天，
        //         只有在完全沒有跑步紀錄時才 fallback 到計劃排程（且上限 cap 4 天）
        let cardioDays = 0;
        try {
            // 🔴 Fix(A1)：統一走 userStorage（per-user 命名空間，會自動從舊 key 遷移）；
            //    再相容歷史上用過的 `cardio_sessions_${userId}` 命名。
            let sessions = uGet(userId, 'cardio_sessions', null);
            if (!Array.isArray(sessions) || sessions.length === 0) {
                const legacyRaw = localStorage.getItem(`cardio_sessions_${userId}`);
                if (legacyRaw) { try { sessions = JSON.parse(legacyRaw); } catch { /* ignore */ } }
            }
            if (Array.isArray(sessions) && sessions.length > 0) {
                const uniqueCardioDays = new Set();
                (Array.isArray(sessions) ? sessions : []).forEach(s => {
                    const dateStr = s.date || (s.created_at ? s.created_at.split('T')[0] : null);
                    if (!dateStr) return;
                    try {
                        const d = new Date(dateStr);
                        if (!isNaN(d.getTime()) && d >= sevenDaysAgo) uniqueCardioDays.add(dateStr);
                    } catch { }
                });
                cardioDays = uniqueCardioDays.size;
            }
            // Fallback：無真實記錄時用計劃排程估算，但 cap 在 4 天避免高估
            if (cardioDays === 0) {
                const journey = uGet(userId, 'master_journey', null);
                if (journey?.schedule) {
                    cardioDays = Math.min(journey.schedule.filter(d => d.cardio).length, 4);
                }
            }
        } catch { }

        const totalSessions = strengthDays + Math.min(cardioDays, 3); // Cap cardio contribution

        if (totalSessions >= 7) return { multiplier: 1.9, level: 'Extra Active', sessions: totalSessions };
        if (totalSessions >= 5) return { multiplier: 1.725, level: 'Very Active', sessions: totalSessions };
        if (totalSessions >= 3) return { multiplier: 1.55, level: 'Moderately Active', sessions: totalSessions };
        if (totalSessions >= 1) return { multiplier: 1.375, level: 'Lightly Active', sessions: totalSessions };
        return { multiplier: 1.2, level: 'Sedentary', sessions: totalSessions };
    } catch {
        return { multiplier: 1.375, level: 'Lightly Active (default)', sessions: 0 };
    }
};


// ═══════════════════════════════════════════════════
// 3. TDEE CALCULATION
// ═══════════════════════════════════════════════════

export const calcTDEE = (bmr, activityMultiplier) => {
    return Math.round(bmr * activityMultiplier);
};


// ═══════════════════════════════════════════════════
// 4. GOAL-BASED CALORIE ADJUSTMENT
// ═══════════════════════════════════════════════════

/**
 * @param {'cutting'|'maintenance'|'bulking'} mode
 * @param {number} tdee
 * @returns {{ targetCalories: number, deficit: number }}
 */
export const calcTargetCalories = (mode, tdee) => {
    switch (mode) {
        case 'cutting':
            return { targetCalories: tdee - 400, deficit: -400, label: '減脂（-400 kcal）' };
        case 'bulking':
            return { targetCalories: tdee + 250, deficit: 250, label: '增肌（+250 kcal）' };
        default:
            return { targetCalories: tdee, deficit: 0, label: '維持體態' };
    }
};


// ═══════════════════════════════════════════════════
// 5. MACRO DISTRIBUTION (based on training type + goal)
// ═══════════════════════════════════════════════════

/**
 * Training type deeply affects macro ratios:
 *
 * Strength-focused → High protein (2.0-2.2g/kg), moderate carbs
 * Cardio-focused   → High carbs (recovery glycogen), moderate protein
 * Mixed            → Balanced high
 * Rest day         → Lower carbs, maintenance protein
 *
 * @param {number} targetCalories
 * @param {number} bodyWeight (kg)
 * @param {'strength'|'cardio'|'mixed'|'rest'} trainingType - today's training type
 * @param {'cutting'|'maintenance'|'bulking'} mode
 */
export const calcMacros = (targetCalories, bodyWeight, trainingType = 'rest', mode = 'maintenance') => {
    // 沒有真實體重就算不出「每公斤幾克」—— 回 null，不拿 70 公斤湊
    const w = inRange(bodyWeight, 20, 300);
    if (w == null || !(Number(targetCalories) > 0)) return null;
    let proteinPerKg, fatPerKg, protein, fat, carbs;

    // ── Protein (g/kg bodyweight) ──
    // 休息日肌肉合成速率下降，不需要訓練日同等的蛋白質攝取量
    // 依據：Morton et al. 2018, ISSN Position Stand 2017
    if (trainingType === 'rest') {
        // 休息日：力量訓練模式 1.6g/kg，一般/有氧模式 1.4g/kg（維持正氮平衡即可）
        proteinPerKg = (mode === 'cutting')
            ? 1.8   // 減脂期休息日仍要防止肌肉流失，稍微提高
            : (mode === 'bulking' ? 1.6 : 1.5);
    } else if (mode === 'cutting') {
        // Higher protein during cut to preserve muscle
        proteinPerKg = trainingType === 'strength' || trainingType === 'mixed' ? 2.2 : 2.0;
    } else if (mode === 'bulking') {
        proteinPerKg = trainingType === 'strength' || trainingType === 'mixed' ? 2.0 : 1.8;
    } else {
        proteinPerKg = trainingType === 'strength' ? 2.0 : trainingType === 'cardio' ? 1.6 : 1.8;
    }

    protein = Math.round(w * proteinPerKg);

    // ── Fat (g/kg bodyweight) ──
    // Minimum ~0.7g/kg for hormonal health, up to 1.0g/kg
    fatPerKg = mode === 'cutting' ? 0.7 : mode === 'bulking' ? 0.9 : 0.8;
    fat = Math.round(w * fatPerKg);

    // ── Carbs (remaining calories) ──
    const caloriesFromProtein = protein * 4;
    const caloriesFromFat = fat * 9;
    const remainingCalories = Math.max(0, targetCalories - caloriesFromProtein - caloriesFromFat);
    carbs = Math.round(remainingCalories / 4);

    // ── Training-type adjustments ──
    if (trainingType === 'cardio') {
        // Shift some fat calories to carbs for glycogen
        const shift = Math.round(w * 0.15); // ~10g fat → ~25g carbs
        fat = Math.max(Math.round(w * 0.6), fat - shift);
        carbs = Math.round((targetCalories - protein * 4 - fat * 9) / 4);
    } else if (trainingType === 'rest') {
        // 休息日：降低碳水，略提高脂肪
        carbs = Math.max(50, carbs - Math.round(w * 0.3));
        // 🔴 Fix(rest-fat): 重新計算剩餘卡路里給脂肪，但必須確保非負值
        // 舊邏輯：fat = (target - protein*4 - carbs*4) / 9，若 protein+carbs 已超過 target 會得到負 fat
        // 新邏輯：先確認剩餘熱量 >= 0 再除以 9
        const remainingForFat = targetCalories - protein * 4 - carbs * 4;
        fat = remainingForFat > 0 ? Math.round(remainingForFat / 9) : 0;
    }

    // Ensure minimums
    protein = Math.max(50, protein);
    carbs = Math.max(50, carbs);
    fat = Math.max(30, fat);

    // Recalculate actual calories
    const actualCalories = protein * 4 + carbs * 4 + fat * 9;

    return {
        protein,
        carbs,
        fat,
        proteinPerKg: +(protein / w).toFixed(1),
        fatPerKg: +(fat / w).toFixed(1),
        carbsPerKg: +(carbs / w).toFixed(1),
        actualCalories,
        trainingType,
    };
};


// ═══════════════════════════════════════════════════
// 6. WORKOUT BURN ADJUSTMENT
// ═══════════════════════════════════════════════════

/**
 * On workout days, add exercise burn to calorie budget.
 * This creates a "dynamic TDEE" that responds to actual activity.
 */
export const adjustForWorkout = (baseTargetCalories, workoutBurn = 0, macros = {}, trainingType = 'rest') => {
    if (workoutBurn <= 0) return { targetCalories: baseTargetCalories, ...macros, workoutBurn: 0 };

    const newTarget = baseTargetCalories + Math.round(workoutBurn);

    // Distribute the extra calories based on training type
    let extraProtein = 0, extraCarbs = 0;
    if (trainingType === 'cardio' || trainingType === 'run') {
        // 60% of burn → carbs (glycogen restoration)
        extraCarbs = Math.round((workoutBurn * 0.6) / 4);
        extraProtein = Math.round((workoutBurn * 0.25) / 4);
    } else if (trainingType === 'strength') {
        // More protein for muscle repair
        extraProtein = Math.round((workoutBurn * 0.35) / 4);
        extraCarbs = Math.round((workoutBurn * 0.45) / 4);
    } else {
        // Mixed
        extraProtein = Math.round((workoutBurn * 0.3) / 4);
        extraCarbs = Math.round((workoutBurn * 0.5) / 4);
    }

    const finalProtein = (macros.protein || 0) + extraProtein;
    const finalCarbs   = (macros.carbs   || 0) + extraCarbs;
    const finalFat     = macros.fat || 0; // Don't increase fat from exercise

    return {
        targetCalories: newTarget,
        protein: finalProtein,
        carbs:   finalCarbs,
        fat:     finalFat,
        // 🔴 Fix(adjustForWorkout): 補上 actualCalories，讓呼叫方可以驗收三大營養素加總
        actualCalories: finalProtein * 4 + finalCarbs * 4 + finalFat * 9,
        workoutBurn: Math.round(workoutBurn),
        extraProtein,
        extraCarbs,
    };
};


// ═══════════════════════════════════════════════════
// 7. FULL PIPELINE (one-call convenience function)
// ═══════════════════════════════════════════════════

/**
 * Complete nutrition calculation pipeline.
 *
 * @param {object} params
 * @param {object} params.profile - { weight, height, age, gender, current_weight }
 * @param {object|null} params.inbody - Latest InBody record { weight_kg, body_fat_percent, skeletal_muscle_mass, height }
 * @param {'cutting'|'maintenance'|'bulking'} params.mode
 * @param {'strength'|'cardio'|'mixed'|'rest'} params.trainingType - Today's training type
 * @param {number} params.workoutBurn - Today's exercise calories burned
 * @param {string} params.userId
 *
 * @returns {object} Full nutrition prescription
 */
export const calculateFullNutrition = ({
    profile = {},
    inbody = undefined,   // if undefined, auto-loaded from localStorage
    mode = undefined,     // if undefined, auto-read from master_journey
    trainingType = undefined, // if undefined, detected from master_journey schedule
    workoutBurn = 0,
    userId = getUserId(),
    tdeeOverride = null,  // 若提供，直接使用此動態 TDEE，跳過靜態公式估算
}) => {
    // Auto-load InBody if not provided
    const resolvedInbody = inbody !== undefined ? inbody : getLatestInBody(userId);

    // Auto-detect training type from master_journey schedule (overrides workoutData)
    const resolvedTrainingType = trainingType !== undefined
        ? trainingType
        : detectTodayTrainingType({});

    // Auto-detect mode from journey goals if not explicitly set
    const resolvedMode = mode !== undefined ? mode : (getGoalModeFromJourney() || 'maintenance');

    // Step 1: BMR
    const bmrResult = calcSmartBMR(profile, resolvedInbody);

    // Step 2: Activity multiplier (auto-detected)
    const activity = calcActivityMultiplier(userId);

    // Step 3: TDEE — 優先使用動態 TDEE（由能量守恆法計算），fallback 靜態公式
    const tdee = (tdeeOverride !== null && tdeeOverride > 0)
        ? tdeeOverride
        : calcTDEE(bmrResult.bmr, activity.multiplier);

    // Step 4: Goal-adjusted calories
    const { targetCalories, deficit, label: goalLabel } = calcTargetCalories(resolvedMode, tdee);

    // Step 5: Macro split
    const bodyWeight = inRange(resolvedInbody?.weight_kg, 20, 300)
        ?? inRange(profile?.current_weight, 20, 300)
        ?? inRange(profile?.weight, 20, 300);

    /* ── 資料不足就誠實說不足，不回半真半假的數字 ──────────────────
       ⚠️ 這裡刻意回傳「完整形狀但數值全是 null」而不是直接回 null：
          四個呼叫端有三個是直接解構 `.targetCalories / .protein / ...`，
          回 null 會讓那三頁白畫面。帶 insufficientData 旗標的完整物件
          可以讓呼叫端照常解構，然後靠旗標決定顯示「去補資料」的入口。 */
    if (bmrResult.bmr == null || bodyWeight == null) {
        const missing = [];
        if (bodyWeight == null) missing.push('weight');
        if (bmrResult.bmr == null) missing.push('height', 'age', 'gender');
        return {
            insufficientData: true, missing,
            bmr: null, bmrMethod: null, lbm: null,
            activityLevel: activity.level, activityMultiplier: activity.multiplier,
            weeklyTrainingSessions: activity.sessions,
            tdee: null,
            mode: resolvedMode, goalLabel: null, deficit: null, baseTargetCalories: null,
            targetCalories: null, protein: null, carbs: null, fat: null,
            proteinPerKg: null, carbsPerKg: null, fatPerKg: null,
            trainingType: resolvedTrainingType, workoutBurn: 0, extraProtein: 0, extraCarbs: 0,
            bodyWeight: null,
            bodyFatPercent: inRange(resolvedInbody?.body_fat_percent, 1, 70),
            muscleMass: inRange(resolvedInbody?.skeletal_muscle_mass, 5, 100),
            todaySchedule: getTodayScheduleDay(userId),
        };
    }

    const macros = calcMacros(targetCalories, bodyWeight, resolvedTrainingType, resolvedMode);

    // Step 6: Workout burn adjustment
    const adjusted = adjustForWorkout(targetCalories, workoutBurn, macros, resolvedTrainingType);


    return {
        insufficientData: false, missing: [],
        // Raw calculations
        bmr: bmrResult.bmr,
        bmrMethod: bmrResult.method,
        lbm: bmrResult.lbm,
        activityLevel: activity.level,
        activityMultiplier: activity.multiplier,
        weeklyTrainingSessions: activity.sessions,
        tdee,

        // Goal
        mode: resolvedMode,
        goalLabel,
        deficit,
        baseTargetCalories: targetCalories,

        // Final prescription (after workout adjustment)
        targetCalories: adjusted.targetCalories,
        protein: adjusted.protein,
        carbs: adjusted.carbs,
        fat: adjusted.fat,

        // Per-kg ratios
        proteinPerKg: macros.proteinPerKg,
        carbsPerKg: macros.carbsPerKg,
        fatPerKg: macros.fatPerKg,

        // Workout context
        trainingType: resolvedTrainingType,
        workoutBurn: adjusted.workoutBurn,
        extraProtein: adjusted.extraProtein || 0,
        extraCarbs: adjusted.extraCarbs || 0,

        // Body data source
        bodyWeight,
        bodyFatPercent: resolvedInbody?.body_fat_percent || null,
        muscleMass: resolvedInbody?.skeletal_muscle_mass || null,
        todaySchedule: getTodayScheduleDay(userId),
    };
};


// ═══════════════════════════════════════════════════
// 8. HELPER: Load latest InBody from localStorage
// ═══════════════════════════════════════════════════

export const getLatestInBody = (userId) => {
    try {
        const local = JSON.parse(localStorage.getItem(`inbody_local_${userId}`) || '[]');
        if (local.length === 0) return null;
        return local.sort((a, b) =>
            new Date(b.measurement_date || b.date) - new Date(a.measurement_date || a.date)
        )[0];
    } catch {
        return null;
    }
};


// ═══════════════════════════════════════════════════
// 9. HELPER: Detect today's training type from schedule
// ═══════════════════════════════════════════════════

/**
 * Returns the raw schedule entry for today from master_journey.
 * schedule is indexed Mon=0 to Sun=6 (matching the JourneyGenerator layout).
 */
export const getTodayScheduleDay = (userId) => {
    try {
        const journey = uGet(userId || getUserId(), 'master_journey', null)
            // 向下相容：若 userId 命名空間無資料，嘗試全域 key
            || JSON.parse(localStorage.getItem('master_journey') || 'null');
        if (!journey?.schedule) return null;
        const jsDay = new Date().getDay(); // 0=Sun, 1=Mon...
        // journey.schedule: index 0=Mon, 6=Sun → convert
        const todayIdx = jsDay === 0 ? 6 : jsDay - 1;
        return journey.schedule[todayIdx] || null;
    } catch {
        return null;
    }
};

/**
 * Determine today's training type.
 *
 * Priority:
 *   1. master_journey schedule (planned training)
 *   2. Actual workoutData from backend/session
 *   3. Default: 'rest'
 *
 * This ensures Nutrition page always matches the *plan*, not just what was logged.
 */
export const detectTodayTrainingType = (workoutData = {}) => {
    // 1. PRIORITY: Check today's planned schedule from master_journey
    const todaySchedule = getTodayScheduleDay();
    if (todaySchedule) {
        if (todaySchedule.strength && todaySchedule.cardio) return 'mixed';
        if (todaySchedule.strength) return 'strength';
        if (todaySchedule.cardio) return 'cardio';
        // schedule entry exists but no training planned → rest day
        return 'rest';
    }

    // 2. FALLBACK: Use actual workout data from API
    if (workoutData?.workoutType && workoutData.workoutType !== 'rest') {
        return workoutData.workoutType;
    }

    // 3. DEFAULT: rest
    return 'rest';
};


// ═══════════════════════════════════════════════════
// 10. HELPER: Get goal mode from journey weekly targets
// ═══════════════════════════════════════════════════

/**
 * Reads the goal-based nutrition mode from master_journey.
 * Returns 'cutting', 'bulking', or 'maintenance'.
 */
export const getGoalModeFromJourney = (userId) => {
    try {
        const journey = uGet(userId || getUserId(), 'master_journey', null)
            || JSON.parse(localStorage.getItem('master_journey') || 'null');
        if (!journey?.weeklyTargets || !journey?.currentWeek) return null;

        const weekIdx = (journey.currentWeek || 1) - 1;
        const weekTarget = journey.weeklyTargets[weekIdx];
        const deficit = weekTarget?.nutrition?.deficit_or_surplus || 0;

        if (deficit < -100) return 'cutting';
        if (deficit > 100) return 'bulking';
        return 'maintenance';
    } catch {
        return null;
    }
};

