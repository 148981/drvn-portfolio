/**
 * ══════════════════════════════════════════════════════════════════════════
 * STRENGTH MATH — 重訓數值的單一真相源
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 為什麼有這個檔案（2026-09 重訓稽核）：
 *
 * e1RM（估算最大肌力）在專案裡有「六個」各寫各的實作。公式都是 Epley，
 * 但「reps 要不要夾值、夾到幾」每一份都不一樣，於是同一組訓練
 * 在不同頁面會顯示不同的 1RM：
 *
 *   同一組 100kg × 20 下 →
 *     utils/metricsCalculator.js          無夾值   166.7 kg
 *     utils/workoutAnalytics.js           無夾值   166.7 kg
 *     utils/strengthCoachEngine.js        夾 15    150.0 kg
 *     components/WorkoutSessionViewMobile 夾 15    150.0 kg
 *     utils/e1rmAdvisor.js                >15 不算  不顯示
 *     components/TrainingRecordPageMobile 夾 12    140.0 kg
 *
 * 四個答案。使用者不會知道是哪支檔案寫錯，他只會覺得「這個 App 在唬爛」。
 *
 * 而且 TrainingRecordPageMobile 的註解自己就寫著：
 *   「30 下會把 1RM 灌成體重的 2 倍 → 出現 171KG / +114KG 的假數值」
 * —— 那個 bug 在那一頁修好了，其他五處還在。典型的「只修一半」。
 *
 * 規則：任何檔案都不准再自己寫 weight * (1 + reps / 30)。
 */

// ── Epley 的有效範圍 ──────────────────────────────────────────────────────
/**
 * reps 夾值上限。取 12（最保守的那個版本）——
 * Epley 是線性外推，只在低反覆準確；12 下以上誤差開始明顯，
 * 20 下會高估近 20%，30 下直接把 1RM 灌成兩倍。
 * 寧可低估也不要給使用者一個他其實推不動的數字。
 */
export const E1RM_REPS_CAP = 12;

/** 低於這個重量視為沒有有效負荷（徒手 / 輸入錯誤）。 */
const MIN_WEIGHT_KG = 0.5;

const toNum = (v) => {
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) ? n : 0;
};

/**
 * Epley 估算 1RM，reps 夾在 1–E1RM_REPS_CAP。
 * 高反覆的組不會被外推成假數字，而是以 cap 當上限保守估。
 *
 * @param {number|string} weight 重量 kg
 * @param {number|string} reps   次數
 * @returns {number} e1RM（kg，取到小數一位）；無效輸入回 0
 */
export const epleyE1RM = (weight, reps) => {
    const w = toNum(weight);
    if (w < MIN_WEIGHT_KG) return 0;
    const r = Math.min(Math.max(Math.round(toNum(reps)) || 1, 1), E1RM_REPS_CAP);
    /* ⚠️ 單次就是 1RM 本身，不能再套公式。
       Epley 在 r=1 會算出 w × (1 + 1/30) = 多 3.3% ——
       100kg 拉起來一下卻顯示 103.3kg，那是憑空生出來的重量。
       原本 metricsCalculator 與 workoutAnalytics 有這個 guard、
       strengthCoachEngine 沒有，所以同一組單次在不同頁面也是兩個數字。 */
    if (r === 1) return roundE1RM(w);
    return roundE1RM(w * (1 + r / 30));
};

/**
 * 嚴格版：超出有效反覆範圍就回 null，代表「這組估不出可信的 1RM」。
 *
 * 用在「要不要顯示 / 要不要納入趨勢」這種需要誠實的地方 ——
 * 夾值版會給一個保守數字，嚴格版直接說不知道。
 * 兩者的 cap 是同一個，不會出現「A 頁顯示了、B 頁說不知道」。
 */
export const epleyE1RMStrict = (weight, reps) => {
    const w = toNum(weight);
    const r = Math.round(toNum(reps));
    if (w < MIN_WEIGHT_KG || r < 1 || r > E1RM_REPS_CAP) return null;
    if (r === 1) return roundE1RM(w);   // 單次就是 1RM 本身（同 epleyE1RM 的說明）
    return roundE1RM(w * (1 + r / 30));
};

/**
 * 這一組能不能拿來估 1RM / 納入 PR 趨勢。
 * 各頁原本各自寫判斷（有的看 weight>0、有的看 reps<=12、有的完全不檢查），
 * 導致同一組在 A 頁進了趨勢圖、在 B 頁沒有。
 */
export const isValidE1RMSet = (set = {}) => {
    const w = toNum(set.weight);
    const r = Math.round(toNum(set.reps));
    return w >= MIN_WEIGHT_KG && r >= 1 && r <= E1RM_REPS_CAP;
};

/**
 * 從一組 sets 取最佳 e1RM（沒有有效組就回 0）。
 * 「最佳」一律以 e1RM 比較，不是以最大重量 ——
 * 100kg×1 與 90kg×5 誰比較強，看的是 e1RM。
 */
export const bestE1RM = (sets = []) => {
    const vals = (sets || []).filter(isValidE1RMSet).map(s => epleyE1RM(s.weight, s.reps));
    return vals.length ? Math.max(...vals) : 0;
};

/**
 * 反向 Epley：想做 targetReps 下時，該用多重。
 * @returns {number|null}
 */
export const workingWeightFor = (e1rm, targetReps) => {
    const e = toNum(e1rm);
    const r = Math.round(toNum(targetReps));
    if (e <= 0 || r < 1) return null;
    return e / (1 + r / 30);
};

/** 該 rep 數相對於 1RM 的強度百分比（0–1）。 */
export const intensityForReps = (reps) => {
    const r = Math.min(Math.max(Math.round(toNum(reps)) || 1, 1), E1RM_REPS_CAP);
    return 1 / (1 + r / 30);
};

// ── 顯示用的統一四捨五入 ──────────────────────────────────────────────────
/** e1RM 一律小數一位。原本有的檔案取整、有的一位，同一個值兩種寫法。 */
export const roundE1RM = (kg) => Math.round(toNum(kg) * 10) / 10;

/** 槓片現實：建議重量四捨五入到 2.5kg。 */
export const roundToPlate = (kg) => Math.round(toNum(kg) / 2.5) * 2.5;

/**
 * 訓練量（tonnage）= 重量 × 次數，逐組加總。
 * 集中在這裡的理由同上：各頁本來各自 reduce，
 * 有的把 0 公斤的徒手組也算進去、有的沒有。
 */
export const setVolume = (set = {}) => toNum(set.weight) * Math.max(0, Math.round(toNum(set.reps)));
export const totalVolume = (sets = []) => (sets || []).reduce((s, x) => s + setVolume(x), 0);

/**
 * 單一「動作」的訓練量。存檔值優先，否則 Σ(每組 重量×次數)。
 *
 * ⚠ 修掉的坑：社群卡／動態卡／分享卡原本寫 parseInt(s.weight)，
 *   2.5kg 的槓片會被截成 2kg —— 同一次訓練在卡片上比結算頁少。
 *   重量一律 parseFloat，次數才 round。
 */
export const exerciseVolume = (ex = {}) => {
    const e = ex || {};
    const direct = toNum(e.volume ?? e.total_volume ?? e.volume_kg);
    if (direct > 0) return direct;
    const sets = Array.isArray(e.detailedSets) ? e.detailedSets
        : (Array.isArray(e.sets) ? e.sets : null);
    return sets ? totalVolume(sets) : 0;
};

/**
 * 一筆「已存檔的訓練紀錄」的訓練量 —— 全站唯一的讀取方式。
 *
 * 為什麼需要這支：同一個數字在後端/localStorage/舊紀錄裡有五種欄位名
 * (total_volume / volume / volume_kg / metrics.volume_kg / metrics.volume)，
 * 各頁本來各自寫 `a ?? b` 兜底、而且清單長度不一 ——
 * 只存了 metrics.volume_kg 的那筆訓練，在今日議程有數字、在進化日誌卻是 0。
 *
 * 順序：存檔值（後端算過的，最權威）→ 全部別名 → 都沒有才從組數回推。
 * ⚠ 注意 sets 可能是陣列（每組明細）也可能是數字（只記了組數），
 *   是數字時無法回推訓練量，回 0 而不是亂算。
 */
export const sessionVolume = (session = {}) => {
    const s = session || {};
    const direct = toNum(
        s.total_volume ?? s.volume ?? s.volume_kg
        ?? s.metrics?.volume_kg ?? s.metrics?.volume
    );
    if (direct > 0) return direct;

    const sets = Array.isArray(s.detailedSets) ? s.detailedSets
        : (Array.isArray(s.sets) ? s.sets : null);
    if (sets) return totalVolume(sets);

    // 動作層級的紀錄：Σ 每個動作的每一組
    const exercises = Array.isArray(s.exercises) ? s.exercises
        : (Array.isArray(s.completedExercises) ? s.completedExercises : null);
    if (exercises) {
        return exercises.reduce((acc, ex) => {
            const exSets = Array.isArray(ex?.detailedSets) ? ex.detailedSets
                : (Array.isArray(ex?.sets) ? ex.sets : []);
            return acc + totalVolume(exSets);
        }, 0);
    }
    return 0;
};

export default {
    E1RM_REPS_CAP,
    sessionVolume,
    exerciseVolume,
    epleyE1RM,
    epleyE1RMStrict,
    isValidE1RMSet,
    bestE1RM,
    workingWeightFor,
    intensityForReps,
    roundE1RM,
    roundToPlate,
    setVolume,
    totalVolume,
};
