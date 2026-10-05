/**
 * 🏃 cardioPlanFusionEngine — 4-14 週有氧週期化計劃融合引擎
 *
 * 與 planFusionEngine.js（重訓）平行，但專屬有氧。
 *
 * ─────────────────────────────────────────────────────────────
 * 設計哲學（融合 NRC + 80/20 + Pfitzinger + Jack Daniels）：
 *
 *  1. NRC 80/20 黃金比例：80% 低強度（Z1-Z2）+ 20% 高強度（Z3-Z5）
 *     ─ 對應 RPE_BANDS：80% RECOVERY/EASY + 20% TEMPO/MILE
 *
 *  2. 金字塔週期化（Periodization Pyramid）：
 *     base → build → peak → taper
 *     里程量 60% → 80% → 100% → 40-60%
 *
 *  3. Deload 神經減震器（鏡像 SOP §五，避震器）：
 *     每 4 週插入一個 Recovery Week（里程 ×0.6，最少 2 個 brick）
 *
 *  4. CNS 互斥保護（鏡像 SOP §四，單日 CNS 互斥）：
 *     一週內 speed brick ≤ 2 個；speed 之後強制接 recovery
 *
 *  5. 4-14 週退化（鏡像 SOP §三，動態天數壓縮）：
 *     <6 週 → base+build+1 週 taper；6-9 週 → base+build+taper；10+ → 完整四階段（備賽目標）
 *
 * ─────────────────────────────────────────────────────────────
 * 支援目標（goal）：
 *  - fat_loss     ：高頻 Z2 + 少量 HIIT，容量導向
 *  - aerobic_base ：MAF 80/20，幾乎全 Z2，少量 Z3 點綴
 *  - race_5k_10k  ：金字塔，包含 Tempo / Interval / Long Run
 *  - race_half    ：14 週半馬週期，Long Run 漸進到 20km
 *  - race_full    ：14 週全馬週期，Long Run 漸進到 32km
 *
 * ─────────────────────────────────────────────────────────────
 * 輸入 (config)：
 * {
 *   goal:              'fat_loss' | 'aerobic_base' | 'race_5k_10k' | 'race_half' | 'race_full',
 *   totalWeeks:        4..14,
 *   sessionsPerWeek:   3 | 4 | 5 | 6,
 *   currentLevel:      'beginner' | 'intermediate' | 'advanced',
 *   currentWeeklyKm:   (number, km)  // ★ 使用者目前真實週跑量，用於錨定起始基準線（漸進式超負荷）
 *   baselinePace5K:    (seconds per km)  // optional, 由 5K 完賽時間換算，用於建議目標 pace
 *   maxHR:             (bpm) // optional
 *   restingHR:         (bpm) // optional
 *   startDate:         'YYYY-MM-DD'
 *   includeStrength:   boolean // 是否每週插入 1 個 strength cross-train
 * }
 *
 * 輸出 (plan)：（與 backend cardio_plan_storage 的 schema 完全對齊）
 * {
 *   plan_id:        (uuid, 由後端 upsert 補)
 *   goal, totalWeeks, sessionsPerWeek, currentLevel, start_date,
 *   weeks: [
 *     { week_index, phase, target_mileage_km, bricks: [...], settlement: null }
 *   ],
 *   meta: { ... rationale / config snapshot }
 * }
 */

import { RPE_BANDS } from './rpeMapping';
import { normalizeRunPrescription, PACE_SHIFT_BY_SUBTYPE } from './cardioPrescription';
import { applyQualityStyle } from './runPlaceFeedback';
import { toLocalDateKey } from './localDate';
import { titleForRun, reconcileSubtypeWithDistance, distanceRangeFor, GLOBAL_MIN_KM } from './runDistanceClass';
import { deriveRunnerLevel, goalStaging, applyBeginnerGuard, week1Ceiling } from './runnerLevel';

// ═══════════════════════════════════════════════════════════════════════
// 1. CONSTANTS  —  生理週期化常數（不要硬塞進函式裡，方便測試）
// ═══════════════════════════════════════════════════════════════════════

/**
 * 各目標的「成熟跑者」週里程峰值（km）— 用於推算 base 起點與 peak。
 * 後續會依 currentLevel 乘以 levelScale。
 */
const PEAK_MILEAGE_BY_GOAL = {
    fat_loss:     30,   // 容量導向但不極端
    aerobic_base: 40,   // MAF 法則 — 慢慢堆里程
    race_5k_10k:  50,
    race_half:    65,
    race_full:    90,   // 全馬 peak week
};

const LEVEL_SCALE = {
    beginner:     0.55,
    intermediate: 0.80,
    advanced:     1.00,
};

/**
 * ★ v2.0 漸進超負荷安全參數（2026-07 PM + 教練重修）
 *
 * RAMP_RATE      — 每週最大成長率（10% Rule 依程度分級）
 * RAMP_FLOOR_KM  — 低里程時的絕對成長下限（5km/週的初學者加 8% 只有 0.4km，
 *                  沒有訓練意義；低量區改用絕對增量 1.5–3km）
 * ABS_PEAK_CAP   — 各程度的絕對週里程天花板（不論目標為何都不可超過）
 * MIN_START_KM   — 完全沒跑步習慣（基準 0）的最低起步量
 * LONG_RUN_MAX_PCT — 長跑占單週里程的安全上限（受傷風險最高的一磚）
 */
const RAMP_RATE_BY_LEVEL = {
    beginner:     0.08,
    intermediate: 0.10,
    advanced:     0.12,
};
/**
 * ★ v2.1 — 低里程區的絕對成長下限。
 *   舊值 1.5–3.0 km 在 5km/週的基準線上等於 +30～+60%／週（實測 W1→W2 +40%），
 *   完全吃掉了 10% Rule。收斂到 0.6–1.2 km，並由下方 MAX_WEEKLY_STEP_PCT 封頂，
 *   確保「絕對下限」永遠不會突破「相對上限」。
 */
const RAMP_FLOOR_KM_BY_LEVEL = {
    beginner:     0.6,
    intermediate: 0.8,
    advanced:     1.2,
};
/**
 * ★ v2.1 — 單週增幅硬天花板（相對前一個訓練週）。
 *   即使絕對下限想加更多，也不得超過這個百分比。10% Rule 的實際守門員。
 */
const MAX_WEEKLY_STEP_PCT_BY_LEVEL = {
    beginner:     0.10,
    intermediate: 0.12,
    advanced:     0.14,
};
/**
 * ★ v2.1 — 減量週執行量 = 前一個「訓練週」× 這個係數。
 *   舊值 0.65 太淺（實測 W4 是 W3 的 78%），身體不會產生超補償。
 *   與重訓端 SOP 的 sets × 0.6 對齊。
 */
const DELOAD_RATIO = 0.60;
/**
 * ★ v2.1 — ACWR（急性:慢性負荷比）安全閘。
 *   > 1.30 是運動醫學公認的受傷風險門檻；踩線就把該週往下修到 1.25。
 */
const ACWR_LIMIT = 1.30;
const ACWR_TARGET = 1.25;
/** 備賽型目標才需要 taper（賽前削疲勞）；打底型目標做 taper 等於白白浪費兩週。 */
const RACE_GOALS = new Set(['race_5k_10k', 'race_half', 'race_full']);
const ABS_PEAK_CAP_BY_LEVEL = {
    beginner:     35,
    intermediate: 65,
    advanced:     95,
};
const MIN_START_KM = 5;
// 長跑占單週里程的安全上限 —— 受傷風險最高的一磚。
// v2 收緊：教練實務普遍建議 30–35%，舊版 advanced 給到 40% 偏激進，
// 40km/週的人會排出 16km 長跑，恢復壓力過大。
const LONG_RUN_MAX_PCT = {
    beginner:     0.30,
    intermediate: 0.33,
    advanced:     0.35,
};
// 一週只有 3 趟時，30% 的上限會讓「長跑」比另外兩趟輕鬆跑還短（三趟各 33%）；放寬到 45%。
const LONG_RUN_MAX_PCT_FEW_RUNS = 0.45;

/* ★ v2.4 單趟的物理與訓練意義上下限（依據見 scripts/RUN_PLAN_STANDARD.md）
 *   RUN_MIN_KM      —— 每趟至少 2 公里（runDistanceClass.GLOBAL_MIN_KM，再短就沒有訓練意義）。
 *                      週量不夠時少排幾趟，不排 7 趟各 0.7 公里。
 *   QUALITY_RANGE   —— 速度課含暖身收操的距離範圍，與「調整里程」的範圍同一份（distanceRangeFor）。
 *                      間歇 < 3 km、節奏 < 4 km 扣掉暖身收操就沒有主課 → 改排輕鬆跑。
 *   QUALITY_WORK_PCT—— Daniels：I 配速的量 ≤ 週量 8%、T 配速 ≤ 10%；再加 4 km 暖身收操。
 *   QUALITY_MAX_SHARE—— 80/20：速度課（含暖身收操）合計 ≤ 週量 30%。
 *   LONG_MAX_MIN    —— 長跑時間上限（Daniels 150 分鐘；全馬放寬到 3 小時）。
 *   EASY_MAX_MIN    —— 其他課 ≤ 2 小時；比這更久的只能是那一週的長跑。 */
const RUN_MIN_KM = GLOBAL_MIN_KM;
const QUALITY_RANGE = {
    interval: distanceRangeFor('interval'),
    tempo:    distanceRangeFor('tempo'),
};
const QUALITY_WORK_PCT = { interval: 0.08, tempo: 0.10 };
const QUALITY_WU_CD_KM = 4;
const QUALITY_MAX_SHARE = 0.30;
const LONG_MAX_MIN = { race_full: 180, default: 150 };
const EASY_MAX_MIN = 120;
const QUALITY_MAX_MIN = 90;   // 速度課含暖身收操 ≤ 90 分鐘（配速慢的人 14 公里節奏跑要 2 小時，那已經不是節奏跑）

/**
 * 各 phase 的里程量比例（相對 peak）
 */
const PHASE_MILEAGE_RATIO = {
    base:   0.65,
    build:  0.85,
    peak:   1.00,
    taper:  0.50,
    deload: 0.60,
};

/**
 * 各 phase 的「Easy:Hard」配比 — 80/20 是預設，越接近比賽越加強 quality
 */
/* 每個目標的質量課輪替表。一週只排得下一格時，就照週次輪著來 ——
   讓每一種質量課在整期裡都真的出現過，而不是永遠只排到第一種。
     · 有氧底：不做間歇（MAF 80/20，只用節奏跑點綴）
     · 減脂  ：偏 HIIT
     · 全馬  ：兩次節奏配一次間歇（賽事長度決定重點在乳酸閾）
     · 半馬  ：節奏與間歇各半
     · 5K/10K：間歇是主課，節奏是配菜 */
const QUALITY_SEQUENCE = {
    aerobic_base: ['tempo'],
    fat_loss:     ['interval'],
    race_full:    ['tempo', 'tempo', 'interval'],
    race_half:    ['tempo', 'interval'],
    race_5k_10k:  ['interval', 'tempo'],
};

const PHASE_INTENSITY_MIX = {
    base:   { easy: 0.90, hard: 0.10 },
    build:  { easy: 0.80, hard: 0.20 },
    peak:   { easy: 0.70, hard: 0.30 },
    taper:  { easy: 0.85, hard: 0.15 },
    deload: { easy: 0.95, hard: 0.05 },
};

/**
 * 各 brick 類型的「相對 duration」（分鐘）— 後續會依當週 mileage 等比例縮放
 */
const BRICK_DEFAULT_DURATION = {
    recovery: 35,
    easy:     45,
    medium:   55,   // 🆕 中距離（6–12km）
    long:     75,
    tempo:    40,
    interval: 35,
    strength: 45,
};

/**
 * 各 brick 類型對應的 RPE band（鏡像 rpeMapping）
 */
const BRICK_TO_RPE = {
    recovery: RPE_BANDS.RECOVERY,
    easy:     RPE_BANDS.EASY,
    medium:   RPE_BANDS.EASY,      // 🆕 中距離也是 easy 配速，只是量比較大
    long:     RPE_BANDS.EASY,      // long run 也是 easy 配速
    tempo:    RPE_BANDS.TEMPO,
    interval: RPE_BANDS.MILE,
    strength: RPE_BANDS.EASY,      // 純參考
};

/**
 * 內部 brick subtype → backend 認可的 brick_type
 * backend 只認 'speed' | 'recovery' | 'long' | 'strength'
 */
const BRICK_BACKEND_TYPE = {
    recovery: 'recovery',
    easy:     'recovery',  // easy 也歸到 recovery 桶（NRC: 80% 都是 recovery 性質）
    medium:   'recovery',  // 🆕 中距離仍屬有氧量，歸 recovery 桶
    long:     'long',
    tempo:    'speed',
    interval: 'speed',
    strength: 'strength',
};

// ═══════════════════════════════════════════════════════════════════════
// 2. UTILITIES
// ═══════════════════════════════════════════════════════════════════════

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round1 = (v) => Math.round(v * 10) / 10;

/**
 * UUID v4 (browser-safe, fallback for environments without crypto.randomUUID)
 */
const uuid = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
};

/**
 * 估算當週 brick 應該分配的「平均 km/brick」
 */
const kmPerBrick = (weekMileage, brickCount) =>
    brickCount > 0 ? weekMileage / brickCount : 0;

/**
 * 把 pace（秒/km）換算成 mm:ss 顯示字串
 */
const formatPace = (sec) => {
    if (!sec || sec <= 0) return null;
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
};

// ═══════════════════════════════════════════════════════════════════════
// 3. PHASE SCHEDULER  —  決定每週的 phase 與 mileage
// ═══════════════════════════════════════════════════════════════════════

/**
 * 依 totalWeeks 動態切割 phase 區段（4-14 週退化邏輯）
 *
 * - 4-5 週：base + build + 1 週 taper（壓縮；備賽目標）
 * - 6-9 週：base + build + taper
 * - 10-14 週：base + build + peak + taper
 *
 * 並在每 4 週插入 deload week（不替換，是在原本 phase 內降載）
 */
export function schedulePhases(totalWeeks, goal = 'race_5k_10k') {
    const t = clamp(parseInt(totalWeeks) || 8, 4, 14);
    const isRace = RACE_GOALS.has(goal);
    const phases = [];

    if (!isRace) {
        // ★ v2.1 —— 非備賽目標（有氧基礎 / 減脂燃燒）不做 taper。
        //   Taper 的意義是「為比賽當天削疲勞」，沒有比賽日的打底週期做 taper
        //   等於白白丟掉最後兩週的訓練。改成：巔峰週 → 末週鞏固減量（超補償）。
        const tailLen = 1;                                   // 末週鞏固
        const peakLen = t >= 10 ? 2 : t >= 6 ? 1 : 0;
        const baseLen = Math.max(1, Math.round((t - tailLen - peakLen) * 0.5));
        for (let i = 0; i < t; i++) {
            if (i === t - 1) phases.push('base');            // 末週回到基礎量鞏固
            else if (peakLen > 0 && i >= t - tailLen - peakLen) phases.push('peak');
            else if (i < baseLen) phases.push('base');
            else phases.push('build');
        }
    } else if (t <= 5) {
        // 壓縮：base + build + 最後 1 週 taper。
        //   舊版 4–5 週備賽只有 base + build，最後一週是全程量最大的一週，跑完隔天就比賽 ——
        //   備賽目標一定要有賽前減量（Mujika & Padilla 2003：減量 1–3 週、量降 40–60%、強度保留）。
        const baseLen = Math.max(1, Math.floor((t - 1) * 0.4));
        for (let i = 0; i < t; i++) {
            phases.push(i === t - 1 ? 'taper' : i < baseLen ? 'base' : 'build');
        }
    } else if (t <= 9) {
        // base + build + taper（taper 固定 1 週）
        const taperLen = 1;
        const baseLen = Math.floor((t - taperLen) * 0.45);
        for (let i = 0; i < t; i++) {
            if (i >= t - taperLen) phases.push('taper');
            else if (i < baseLen) phases.push('base');
            else phases.push('build');
        }
    } else {
        // 完整四階段
        const taperLen = t >= 12 ? 2 : 1;
        const peakLen = Math.max(1, Math.floor((t - taperLen) * 0.20));
        const baseLen = Math.floor((t - taperLen - peakLen) * 0.50);
        const buildLen = t - taperLen - peakLen - baseLen;
        for (let i = 0; i < t; i++) {
            if (i >= t - taperLen) phases.push('taper');
            else if (i >= t - taperLen - peakLen) phases.push('peak');
            else if (i < baseLen) phases.push('base');
            else phases.push('build');
        }
        // 健全性：build 段如果 < 1 強制至少 1 週
        void buildLen;
    }

    // ══════════════════════════════════════════════════════════════════
    // 減量週排程（3:1 波浪）—— ★ v2.1 重修
    //
    //   舊版把 'peak' 也排除在 deload 之外，結果 14 週計劃的 W9–W12 變成
    //   連續四週純爬升（最危險的一段），而 UI 卻寫著「每 4 週自動插入減量週」。
    //
    //   新版：
    //     • peak 週可以 deload（3:1 全程適用）。
    //     • 若減量週剛好貼著 taper（會變成「減量→減量→taper」連三週掉量），
    //       往前挪一週，讓賽前保留一個完整的巔峰週。
    //     • 非備賽目標的末週固定為鞏固減量週。
    // ══════════════════════════════════════════════════════════════════
    const lastIdx = phases.length - 1;
    const taperStart = phases.indexOf('taper');
    const deload = new Set();

    for (let i = 3; i <= lastIdx; i += 4) {
        if (i === lastIdx) continue;            // 末週另外處理
        if (phases[i] === 'taper') continue;    // taper 本身就是降載
        let idx = i;
        if (taperStart >= 0 && idx >= taperStart - 1) idx = taperStart - 2;
        if (idx >= 0 && phases[idx] !== 'taper') deload.add(idx);
    }
    if (!isRace && lastIdx >= 0) deload.add(lastIdx);

    return phases.map((p, i) => ({ phase: p, isDeload: deload.has(i) }));
}

/**
 * 計算每週目標里程
 *
 * @param {string} goal
 * @param {string} level
 * @param {Array}  phaseSchedule
 * @param {number|null} currentWeeklyKm  — 使用者目前真實週跑量（漸進超負荷錨點）
 *
 * 核心邏輯：
 *   - 若有 currentWeeklyKm，base phase 第 1 週使用 max(currentWeeklyKm, 理論最低值) 做起點，
 *     再以「不超過 10%/週」原則（10% Rule）線性過渡到 targetPeak × baseRatio。
 *   - build / peak / taper 維持原本相對 targetPeak 的比例進行。
 *   - 如果 currentWeeklyKm 已高於理論 base 起點 → 縮短爬升時間（對已有訓練量者不做懲罰）。
 */
export function calculateWeeklyMileage(goal, level, phaseSchedule, currentWeeklyKm = null, opts = {}) {
    /* ★ v2.0 — 連續成長軌道（2026-07 PM + 教練重修）
     *
     * 舊版致命傷：基準線只錨定 base 期，build/peak 直接跳回「理論峰值 × 比例」。
     *   → 週跑量 5km 的初學者：base 結束 6.5km，build 第一週直接 18.7km（+188%）。
     *
     * 新版：整條里程曲線是一條「從使用者真實基準線出發的連續軌道」：
     *   1. 起點 = max(使用者週跑量, 5km 保底)；沒填就用保守理論起點。
     *   2. 每週成長 = max(絕對增量下限, 前週 × 成長率)，依程度分級
     *      （初學 +1.5km/8%、中階 +2km/10%、進階 +3km/12%）。
     *   3. 天花板 = min(目標理論峰值 × 程度係數, 程度絕對上限)。
     *      爬到天花板就持平 — 練得到多少就排多少，絕不憑空規劃。
     *   4. Deload 週 = 當週軌道 × 0.65，之後從軌道原位接回（經典波浪）。
     *   5. Taper：從軌道值 65% 線性降到 45%。
     */
    const genericPeak = (PEAK_MILEAGE_BY_GOAL[goal] || 40) * (LEVEL_SCALE[level] || 0.8);
    const levelCap = ABS_PEAK_CAP_BY_LEVEL[level] ?? 65;
    // ★ v2.4 現況已經高於目標峰值（例：每週 40 公里的人選減脂，目標峰值 24）→ 維持現況，不砍量。
    //   舊版直接壓到 24，第 1 週比他現在少 40% —— 那是退步，不是計劃。仍受級別絕對上限約束。
    const holdKm = Number.isFinite(currentWeeklyKm) ? Math.min(currentWeeklyKm, levelCap) : 0;
    // ★ v2.4 物理上限：選的趟數 × 單趟上限（長跑 150/180 分、其他 120 分）裝得下多少（見 weekCapacityKm）
    const capacity = Array.isArray(opts.capacityKm) ? opts.capacityKm : [];
    const capAt = (i) => (Number.isFinite(capacity[i]) && capacity[i] > 0 ? capacity[i] : Infinity);
    const peakCap = Math.max(Math.min(genericPeak, levelCap), holdKm);
    const rate = RAMP_RATE_BY_LEVEL[level] ?? 0.10;
    const floorInc = RAMP_FLOOR_KM_BY_LEVEL[level] ?? 0.8;
    const stepCap = MAX_WEEKLY_STEP_PCT_BY_LEVEL[level] ?? 0.14;

    const theoreticalStart = genericPeak * 0.5;
    let startKm = Math.max(
        MIN_START_KM,
        currentWeeklyKm != null ? currentWeeklyKm : theoreticalStart
    );
    // ★ v2.3 物理天花板：第 1 週真的塞得下多少 = 單次上限 × 可排的趟數。
    //   一週只跑 1 次、單次又被初學者保護壓在 3 公里時，第 1 週就是 3 公里 —
    //   軌道必須從 3 起算。舊版讓軌道從 5 起算、實際只排得出 3，
    //   於是第 2 週看起來像 +83%。保底 5 公里在物理上做不到時必須讓步。
    if (Number.isFinite(opts.startCapKm) && opts.startCapKm > 0) {
        startKm = Math.min(startKm, opts.startCapKm);
    }

    let trajectory = startKm; // 上一個「訓練週」的量 — 減量週不會推進它
    const raw = [];

    phaseSchedule.forEach(({ phase, isDeload }, i) => {
        if (phase === 'taper') {
            const taperTotal = phaseSchedule.filter((p) => p.phase === 'taper').length;
            const taperIdx = phaseSchedule.slice(0, i).filter((p) => p.phase === 'taper').length;
            const t = taperTotal > 1 ? taperIdx / (taperTotal - 1) : 1;
            // 一週至少一趟 2 公里（RUN_MIN_KM）—— 再少就不成一趟課
            raw.push(Math.max(Math.min(RUN_MIN_KM, trajectory), Math.min(trajectory * (0.65 - 0.20 * t), capAt(i)))); // 65% → 45%
            return;
        }

        if (isDeload) {
            // ★ v2.1 關鍵修正 —— 減量週「凍結軌道」。
            //
            //   舊版 bug：減量週照樣推進 trajectory，於是跨過減量週時吃到兩次增量。
            //   實測 W4 減量 7.2km → W5 直接 13km（+81%），對照上一個訓練週 W3(9km)
            //   也有 +44%，ACWR 衝到 1.44。真正的漸進基準必須是「上一個訓練週」。
            raw.push(Math.max(Math.min(RUN_MIN_KM, trajectory), Math.min(trajectory * DELOAD_RATIO, capAt(i))));
            return;
        }

        let next;
        if (i === 0) {
            next = Math.min(startKm, peakCap, capAt(0));
        } else {
            // 增量 = 比例增量，低量區用絕對下限墊高，但一律不得突破單週硬上限。
            const inc = Math.min(
                Math.max(trajectory * rate, floorInc),
                trajectory * stepCap
            );
            next = Math.min(trajectory + inc, peakCap, capAt(i));
        }

        // ★ ACWR 閘門「就地」生效 —— 必須在推進軌道之前壓下去。
        //   若等到最後才統一修，被壓低的那一週會和下一週之間再開出一個新的落差。
        if (raw.length >= 3) {
            const s = raw[raw.length - 1] + raw[raw.length - 2] + raw[raw.length - 3];
            if (s > 0 && next / ((next + s) / 4) > ACWR_LIMIT) {
                next = Math.min(next, (ACWR_TARGET * s) / (4 - ACWR_TARGET));
            }
        }

        trajectory = next;   // 軌道跟著被壓低 → 下一週從修正後的值繼續往上長
        raw.push(next);
    });

    return raw.map(round1);
}

/**
 * ★ v2.1 — ACWR 安全閘
 *
 * ACWR = 當週里程 ÷ 最近四週平均里程（含當週）。> 1.30 是運動醫學公認的
 * 受傷風險門檻。任何一週踩線就把它往下修到 1.25，並且只降不升。
 *
 * 解式：令前三週和為 S，要求 x / ((x + S) / 4) = 1.25
 *       → 4x = 1.25x + 1.25S → x = 1.25S / 2.75
 */
export function applyAcwrGate(weekly) {
    const out = weekly.map((v) => (Number.isFinite(v) ? v : 0));
    for (let i = 3; i < out.length; i++) {
        const s = out[i - 1] + out[i - 2] + out[i - 3];
        const chronic = (out[i] + s) / 4;
        if (chronic <= 0) continue;
        if (out[i] / chronic > ACWR_LIMIT) {
            out[i] = Math.min(out[i], (ACWR_TARGET * s) / (4 - ACWR_TARGET));
        }
    }
    return out.map(round1);
}

/**
 * ★ v2.1 — 週量安全稽核（UI 用）
 *
 * 回傳每一週的「相對上一個訓練週增幅」與 ACWR，以及整體是否安全。
 * 圖表可以直接拿這個結果去標紅、寫說明，不必自己重算。
 *
 * @param {number[]} weekly  每週目標里程
 * @param {Array}    schedule  schedulePhases() 的輸出（用來辨識減量／taper 週）
 */
export function auditWeeklyMileage(weekly = [], schedule = []) {
    const rows = [];
    let lastLoad = null;
    let maxJump = 0;
    let maxAcwr = 0;

    weekly.forEach((km, i) => {
        const info = schedule[i] || {};
        const isRecovery = !!info.isDeload || info.phase === 'taper';
        const jumpPct = !isRecovery && lastLoad ? (km / lastLoad - 1) * 100 : null;

        let acwr = null;
        if (i >= 3) {
            const chronic = (km + weekly[i - 1] + weekly[i - 2] + weekly[i - 3]) / 4;
            if (chronic > 0) acwr = km / chronic;
        }

        if (jumpPct != null) maxJump = Math.max(maxJump, jumpPct);
        if (acwr != null) maxAcwr = Math.max(maxAcwr, acwr);

        rows.push({
            week: i + 1,
            km,
            isRecovery,
            jumpPct,
            acwr,
            // 只有「訓練週相對上一個訓練週」超過 15%，或 ACWR 破 1.3 才算警訊
            risky: (jumpPct != null && jumpPct > 15) || (acwr != null && acwr > ACWR_LIMIT),
        });
        if (!isRecovery) lastLoad = km;
    });

    const peak = weekly.length ? Math.max(...weekly) : 0;
    return {
        rows,
        maxJumpPct: maxJump,
        maxAcwr,
        peakKm: peak,
        safe: !rows.some((r) => r.risky),
    };
}

// ═══════════════════════════════════════════════════════════════════════
// 4. BRICK COMPOSER  —  每週的 brick 組成
// ═══════════════════════════════════════════════════════════════════════

/**
 * 決定一週裡的 brick 類型清單（不綁日期 — NRC 哲學）
 *
 * @param {Object} ctx — { phase, isDeload, sessionsPerWeek, goal, includeStrength }
 * @returns {string[]} subtype list, e.g. ['easy', 'tempo', 'recovery', 'long']
 */
export function composeBrickTypes(ctx) {
    const { phase, isDeload, sessionsPerWeek, goal, includeStrength } = ctx;

    // ★ v2.3 語意修正 —— sessionsPerWeek 一律代表「跑步趟數」。
    //   舊版把重訓「取代」掉一個 easy，於是使用者選 4 次只拿到 3 趟跑，
    //   畫面數字與實際課表對不上。現在重訓是額外附加的一格，
    //   選幾次就是跑幾次，UI 再明白寫「n 趟跑 + 1 次重訓」。

    // Deload 週：全部低強度，數量略減
    if (isDeload) {
        const n = Math.min(sessionsPerWeek, Math.max(2, sessionsPerWeek - 1));
        const list = ['recovery', 'easy', 'long'];
        while (list.length < n) list.push('easy');
        list.length = n;                                  // 次數少時也不硬塞滿三種
        if (includeStrength) list.push('strength');
        return list;
    }

    const mix = PHASE_INTENSITY_MIX[phase] || PHASE_INTENSITY_MIX.build;
    // 賽前減量「減量不減強度」（Mujika & Padilla 2003）：3 趟以上的減量期至少保留 1 堂速度課
    //   （舊版 round(3 × 0.15) = 0，3 趟的人賽前一整週沒有任何配速刺激）
    const hardSlots = phase === 'taper' && sessionsPerWeek >= 3
        ? Math.max(1, Math.round(sessionsPerWeek * mix.hard))
        : Math.round(sessionsPerWeek * mix.hard);
    const easySlots = sessionsPerWeek - hardSlots;

    const list = [];

    // 一週至少有 1 個 long run（如果跑步次數 >= 3）
    const hasLong = sessionsPerWeek >= 3;

    // ── 1. 先安排 hard brick ──────────────────────────────
    // CNS 互斥保護：speed brick ≤ 2 / 週；初學者一週最多 1 堂（速度課之間要隔 48 小時，初學者恢復更慢）
    const safeHard = Math.min(hardSlots, ctx.level === 'beginner' ? 1 : 2);
    /* ⚠️ 舊版是「週內交錯」：i===0 排 tempo、i===1 才排 interval。
       但 80/20 之下，每週 4 趟只有 1 格質量課（round(4×0.2)=1），
       i 永遠只有 0 —— 於是選 5K/10K 的人整整 12 週一次間歇都排不到，
       而間歇正是 5K 的主課。改成「逐週輪替」：一格也輪得到。 */
    const seq = QUALITY_SEQUENCE[goal] || QUALITY_SEQUENCE.race_half;
    const wk = Number.isFinite(Number(ctx.weekIndex)) ? Number(ctx.weekIndex) : 0;
    for (let i = 0; i < safeHard; i++) {
        const q = seq[(wk + i) % seq.length];
        // 基礎期先用節奏跑（乳酸閾值）打底，最大攝氧量間歇留到建立期以後（Daniels 週期第一、二階段）；
        //   減脂目標的 HIIT 是它的主課，不受這條限制。
        // 初學者第 1 個月也先用節奏跑：最大攝氧量間歇的衝擊與恢復需求，等有氧底子有了再上（減脂的 HIIT 除外）
        const earlyBeginner = ctx.level === 'beginner' && wk < 4;
        list.push((phase === 'base' || earlyBeginner) && q === 'interval' && goal !== 'fat_loss' ? 'tempo' : q);
    }

    // ── 2. 安排 long run ─────────────────────────────────
    if (hasLong) list.push('long');

    // ── 3. 補滿 easy / recovery ──────────────────────────
    const remaining = sessionsPerWeek - list.length;
    for (let i = 0; i < remaining; i++) {
        // CNS 避震：hard 之後跟一個 recovery，其餘是 easy
        list.push(i === 0 && safeHard > 0 ? 'recovery' : 'easy');
    }

    // ── 4. 可選 strength cross-train ─────────────────────
    //   ★ v2.3：改成「額外附加」而不是取代跑步 —
    //   使用者選的次數是跑步趟數，重訓不能偷走其中一格。
    if (includeStrength && phase !== 'taper') {
        list.push('strength');
    }

    // ── 5. 重排序：導入 Slot Pattern (插槽分配) 確保交錯，避免連續高強度
    const hardBricks = list.filter(t => ['long', 'tempo', 'interval'].includes(t));
    const easyBricks = list.filter(t => ['easy', 'recovery', 'strength'].includes(t));
    
    // 確保 long run 在最後 (原 list 塞入順序為 tempo -> interval -> long，這裡保持該順序)
    const finalSchedule = [];
    
    // 如果 Hard >= Easy，從 Hard 開始排；否則從 Easy 開始，達到最完美的交錯
    const startWithHard = hardBricks.length >= easyBricks.length;
    
    while (hardBricks.length || easyBricks.length) {
        if (startWithHard) {
            if (hardBricks.length) finalSchedule.push(hardBricks.shift());
            if (easyBricks.length) finalSchedule.push(easyBricks.shift());
        } else {
            if (easyBricks.length) finalSchedule.push(easyBricks.shift());
            if (hardBricks.length) finalSchedule.push(hardBricks.shift());
        }
    }
    
    return finalSchedule;
}

const QUALITY_SUBTYPES = new Set(['tempo', 'interval']);
// 里程權重：長跑拿最多，恢復跑最少（舊版同值）
const RUN_WEIGHT = { long: 2.6, tempo: 1.1, interval: 0.9, easy: 1.0, medium: 1.0, recovery: 0.7 };
const DROP_ORDER = ['recovery', 'easy', 'interval', 'tempo', 'long'];

/** 一趟課最後可能被叫成什麼（里程會把輕鬆跑升級成中距離／長跑），取其中最慢的配速算時間上限 —— 保證不超時。 */
const slowestPaceFor = (t, base) => Math.max(...[t, 'medium', 'long'].map((x) => base + (PACE_SHIFT_BY_SUBTYPE[x] ?? 60)));

/**
 * 每一趟的上下限（公里）。planRunDistances 分配里程、weekCapacityKm 算物理上限都用這一份，
 * 兩邊才不會一邊說裝得下、一邊排不進去。
 */
function runCaps(list, W, { goal, baselinePace5K, level, perRunMaxKm, intervalAsTempo, longMaxKm } = {}) {
    const base = baselinePace5K || 360;
    const perRun = Number(perRunMaxKm) > 0 ? Number(perRunMaxKm) : Infinity;
    const idx = list.map((t, i) => (t === 'strength' ? -1 : i)).filter((i) => i >= 0);
    const qKey = (t) => (t === 'interval' && intervalAsTempo ? 'tempo' : t);
    // 速度課合計 ≤ 週量 30%：照各自的最低量按比例分（prepareRunList 已保證最低量的總和放得下）
    const qMinSum = idx.filter((i) => QUALITY_SUBTYPES.has(list[i])).reduce((s, i) => s + QUALITY_RANGE[qKey(list[i])].min, 0);
    const hasLong = list.includes('long');
    // 指定長跑：有 long 就是它；1–2 趟的週沒有 long，第一趟非速度課的就是這週最長的那趟
    const longIdx = hasLong ? list.indexOf('long') : idx.find((i) => !QUALITY_SUBTYPES.has(list[i]));
    // 長跑占比只在 ≥3 趟時有意義（2 趟各一半、1 趟就是 100%，那是趟數決定的，不是長跑排太長）
    const share = !hasLong || idx.length < 3 ? Infinity
        : idx.length === 3 ? LONG_RUN_MAX_PCT_FEW_RUNS : (LONG_RUN_MAX_PCT[level] ?? 0.33);
    const longMin = LONG_MAX_MIN[goal] ?? LONG_MAX_MIN.default;
    const longCap = longIdx == null ? Infinity
        : Math.min(perRun, (longMin * 60) / slowestPaceFor(list[longIdx], base), share * W,
            // 最長一趟一週最多 +15%（或 +2 公里）：長跑是受傷風險最高的一趟（generateCardioPlan 依上一個訓練週傳入）
            Number(longMaxKm) > 0 ? Number(longMaxKm) : Infinity);
    const cap = {}, min = {};
    idx.forEach((i) => {
        const t = list[i];
        if (QUALITY_SUBTYPES.has(t)) {
            const k = qKey(t), r = QUALITY_RANGE[k];
            cap[i] = Math.min(perRun, r.max, QUALITY_WORK_PCT[k] * W + QUALITY_WU_CD_KM,
                (W * QUALITY_MAX_SHARE * r.min) / Math.max(r.min, qMinSum),
                (QUALITY_MAX_MIN * 60) / (base + (PACE_SHIFT_BY_SUBTYPE[k] ?? 0)));
            min[i] = Math.min(r.min, cap[i]);
        } else if (i === longIdx) {
            cap[i] = longCap;
            min[i] = Math.min(RUN_MIN_KM, cap[i]);
        } else {
            cap[i] = Math.min(perRun, (EASY_MAX_MIN * 60) / slowestPaceFor(t, base), longCap);
            min[i] = Math.min(RUN_MIN_KM, cap[i]);
        }
    });
    return { idx, cap, min, qKey, longIdx };
}

/** ①② 這週實際排得下哪些課（planRunDistances 與 weekCapacityKm 共用，兩邊看到的是同一張清單） */
function prepareRunList(subtypesIn, W, opts = {}) {
    let list = (subtypesIn || []).slice();
    const runCount = () => list.filter((t) => t !== 'strength').length;
    const perRun = Number(opts.perRunMaxKm) > 0 ? Number(opts.perRunMaxKm) : Infinity;

    // ① 每趟 ≥ 2 公里 → 趟數上限
    const maxRuns = Math.max(1, Math.floor((W + 1e-9) / RUN_MIN_KM));
    while (runCount() > maxRuns) {
        const t = DROP_ORDER.find((x) => list.includes(x));
        list.splice(list.lastIndexOf(t), 1);
    }

    // ② 速度課：≤2 趟的週不排（只剩一趟輕鬆跑要扛整週的量，最長一趟會一週暴增 50% 以上）、
    //   ≤4 趟最多 1 堂、要有主課（最低量）、合計 ≤ 週量 30%，其他每趟還要留 2 公里
    const n = runCount();
    const qCap = n <= 2 ? 0 : n >= 5 ? 2 : 1;
    let qSeen = 0, qMinSum = 0;
    list = list.map((t) => {
        if (!QUALITY_SUBTYPES.has(t)) return t;
        const k = t === 'interval' && opts.intervalAsTempo ? 'tempo' : t;
        const r = QUALITY_RANGE[k];
        const lim = Math.min(perRun, r.max, QUALITY_WORK_PCT[k] * W + QUALITY_WU_CD_KM,
            (QUALITY_MAX_MIN * 60) / ((opts.baselinePace5K || 360) + (PACE_SHIFT_BY_SUBTYPE[k] ?? 0)));
        const fits = qSeen < qCap && lim >= r.min
            && qMinSum + r.min <= W * QUALITY_MAX_SHARE + 1e-9
            && qMinSum + r.min + (n - qSeen - 1) * RUN_MIN_KM <= W + 1e-9;
        if (!fits) return 'easy';
        qSeen += 1; qMinSum += r.min;
        return t;
    });
    // 被改掉的速度課，原本配給它的那趟恢復跑（composeBrickTypes：速度課後接恢復）也還原成輕鬆跑 ——
    //   不然這週會是「輕鬆＋恢復」，兩趟量差 30%，最長一趟無緣無故比上週暴增。
    const dropped = (subtypesIn || []).filter((t) => QUALITY_SUBTYPES.has(t)).length - qSeen;
    for (let k = 0; k < dropped; k++) {
        const i = list.indexOf('recovery');
        if (i < 0) break;
        list[i] = 'easy';
    }
    return list;
}

/**
 * ★ v2.4 一週的跑步里程分配（唯一實作）。回傳調整後的課別清單與每趟 0.1 公里為單位的配額。
 */
export function planRunDistances(subtypesIn, W, opts = {}) {
    const list = prepareRunList(subtypesIn, W, opts);

    // ③ 上下限 → ④ 先給最低量，剩下的照權重往上加（頂到上限就換別趟接）
    const { idx, cap, min, longIdx } = runCaps(list, W, opts);
    const a = {};
    let used = 0;
    idx.forEach((i) => { a[i] = min[i]; used += a[i]; });
    if (used > W && used > 0) idx.forEach((i) => { a[i] = (a[i] * W) / used; });   // 不到 2 公里的週：只剩 1 趟
    let rem = W - Math.min(used, W);
    // 長跑先拿到它的占比上限（週量 30–45%）：長跑跟著週量穩定成長。
    //   舊版照權重分，速度課那週變小、長跑就多拿 —— 同樣 +12% 的週量，長跑卻一週 +34%。
    if (list[longIdx] === 'long' && rem > 0) {
        const add = Math.min(cap[longIdx] - a[longIdx], rem);
        if (add > 0) { a[longIdx] += add; rem -= add; }
    }
    for (let pass = 0; pass < 24 && rem > 1e-6; pass++) {
        const open = idx.filter((i) => a[i] < cap[i] - 1e-9);
        if (!open.length) break;
        const wsum = open.reduce((s, i) => s + (RUN_WEIGHT[list[i]] ?? 1), 0);
        let given = 0;
        open.forEach((i) => {
            const add = Math.min(cap[i] - a[i], (rem * (RUN_WEIGHT[list[i]] ?? 1)) / wsum);
            a[i] += add; given += add;
        });
        rem -= given;
    }

    // ⑤ 以 0.1 公里為單位的精確配額（最大餘額法）：每趟各自四捨五入會累積誤差，
    //   5 趟就是 ±0.25 km，小週量上變成假的 +18%。磚的總和必須等於這週該跑的量。
    const alloc10 = {};
    const cap10 = (i) => Math.floor(cap[i] * 10 + 1e-6);
    const min10 = (i) => Math.min(cap10(i), Math.ceil(min[i] * 10 - 1e-6));
    const target10 = Math.round(idx.reduce((s, i) => s + a[i], 0) * 10);
    let sum10 = 0;
    const rema = [];
    idx.forEach((i) => {
        const v = a[i] * 10;
        alloc10[i] = Math.min(cap10(i), Math.max(Math.floor(v + 1e-9), a[i] >= min[i] - 1e-9 ? min10(i) : 0));
        sum10 += alloc10[i];
        rema.push({ i, r: v - Math.floor(v + 1e-9) });
    });
    let left = target10 - sum10;
    rema.sort((x, y) => y.r - x.r);
    for (let k = 0; k < rema.length && left > 0; k++) {
        if (alloc10[rema[k].i] < cap10(rema[k].i)) { alloc10[rema[k].i] += 1; left -= 1; }
    }
    for (let guard = 0; left > 0 && guard < 2000; guard++) {
        const room = idx.filter((i) => alloc10[i] < cap10(i));
        if (!room.length) break;
        for (const i of room) { if (left <= 0) break; alloc10[i] += 1; left -= 1; }
    }
    for (let guard = 0; left < 0 && guard < 2000; guard++) {
        const over = idx.filter((i) => alloc10[i] > min10(i));
        if (!over.length) break;
        const big = over.reduce((x, y) => (alloc10[x] >= alloc10[y] ? x : y));
        alloc10[big] -= 1; left += 1;
    }
    return { subtypes: list, alloc10 };
}

/**
 * ★ v2.4 這一週「物理上」最多排得下多少公里：每一趟都頂到上限時的總和。
 *   上限裡有跟週量成比例的部分（長跑 ≤ 週量 x%），所以解 W ≤ Σcap(W) 的最大 W（二分法）。
 *   一週 1 趟、配速慢（11 分/公里）的人，長跑 150 分鐘 ≈ 13 公里，那就是他這一週的上限 ——
 *   成長軌道不能排超過這個量，不然就是排出一趟 3 小時以上的「長跑」。
 */
export function weekCapacityKm(subtypes, opts = {}) {
    const list = (subtypes || []).slice();
    if (!list.some((t) => t !== 'strength')) return 0;
    const capSum = (W) => { const { idx, cap } = runCaps(prepareRunList(list, W, opts), W, opts); return idx.reduce((s, i) => s + cap[i], 0); };
    if (capSum(400) >= 400) return 400;
    let lo = 0, hi = 400;
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (capSum(mid) >= mid) lo = mid; else hi = mid; }
    return Math.floor(lo * 10) / 10;
}

/**
 * 把 brick 清單轉成「具體 brick 物件」，含 duration、距離、RPE band
 *
 * ★ v2.4 距離分配（規則與依據見 scripts/RUN_PLAN_STANDARD.md，planRunDistances 是唯一實作）：
 *   ① 每趟 ≥ 2 公里：週量不夠就少排幾趟（先拿掉恢復／輕鬆，再拿掉速度課，長跑最後）。
 *   ② 速度課要有主課：間歇 ≥ 3、節奏 ≥ 4 公里，合計 ≤ 週量 30%；≤ 4 趟的週最多 1 堂 —— 做不到就改輕鬆跑。
 *   ③ 每趟有上限：長跑 ≤ 週量 30–45% 且 ≤ 150 分鐘（全馬 180）；速度課 ≤ Daniels 的量；
 *      其他課 ≤ 120 分鐘、而且不比長跑長。
 *   ④ 先給每趟最低量，剩下的照強度權重往上加，頂到上限就換別趟接。
 *      全部頂到上限 → 這週物理上只能跑這麼多（weekCapacityKm 讓軌道本來就不會排超過這個量）。
 */
export function materializeBricks(subtypes, weekMileage, goal, baselinePace5K, level = 'intermediate', caps = {}) {
    const W = Math.max(0, Number(weekMileage) || 0);
    const planned = planRunDistances(subtypes, W, { goal, baselinePace5K, level, ...caps });
    subtypes = planned.subtypes;
    const alloc = planned.alloc10;
    if (subtypes.length === 0) return [];

    return orderForAgenda(subtypes.map((subtype, idx) => {
        const distance_km = subtype === 'strength' ? null : round1(alloc[idx] / 10);
        const rpe = BRICK_TO_RPE[subtype] || RPE_BANDS.EASY;
        const backendType = BRICK_BACKEND_TYPE[subtype] || 'recovery';

        // duration：以 baseline pace 推算（若無 baseline 用預設 6:00/km easy）
        let duration_min;
        if (distance_km == null) {
            duration_min = BRICK_DEFAULT_DURATION[subtype];
        } else {
            // pace 估算 — 課型偏移與 cardioPrescription 同一份（相對 5K 配速基準）
            const basePace = baselinePace5K || 360; // 6:00/km
            const paceShift = PACE_SHIFT_BY_SUBTYPE[subtype] ?? 0;
            const estPace = basePace + paceShift;
            duration_min = Math.round((distance_km * estPace) / 60);
        }

        // 目標 pace（顯示用）
        const basePace = baselinePace5K || 360;
        const paceShift = PACE_SHIFT_BY_SUBTYPE[subtype] ?? 0;
        const target_pace_sec = subtype === 'strength' ? null : basePace + paceShift;

        // 里程與課別必須一致（短里程不能叫長跑，長里程不能只叫輕鬆跑）
        const resolvedSubtype = reconcileSubtypeWithDistance(subtype, distance_km);

        return normalizeRunPrescription({
            brick_id: uuid(),
            type: backendType,
            subtype: resolvedSubtype, // 引擎內部標記，方便 UI 區分 tempo vs interval
            title: titleForBrick(resolvedSubtype, distance_km),
            rpe_band: { min: rpe.min, max: rpe.max, label: rpe.label, color: rpe.color },
            duration_min,
            distance_km,
            target_pace_sec,
            target_pace_label: formatPace(target_pace_sec),
            theme_id: themeForBrick(resolvedSubtype),
            status: 'pending',
            completed_session_id: null,
            completed_at: null,
            actual_distance_km: null,
        }, baselinePace5K || 360);
    }));
}

/**
 * ★ v2.4 排進星期幾的是 dailyAgenda.buildWeeklyAgenda：它把「第一個 long」放週六，其餘長跑／速度課
 *   照順序找不相鄰的日子。週量大時 12 公里以上的輕鬆跑也叫「長跑」（距離決定名稱），
 *   如果它排在真正的長跑或速度課前面，就會先佔走好日子，把速度課擠到長跑隔壁。
 *   這裡只在「長跑／速度課」佔的那幾個位置裡重排：這週最長的長跑 → 速度課 → 其他長跑；其餘課不動。
 */
function orderForAgenda(bricks) {
    const runs = bricks.filter((b) => b.distance_km != null);
    const keyLong = runs.filter((b) => b.subtype === 'long').sort((a, b) => b.distance_km - a.distance_km)[0];
    const rank = (b) => (b === keyLong ? 0 : (b.subtype === 'tempo' || b.subtype === 'interval') ? 1 : 2);
    const slots = bricks.map((b, i) => (b.subtype === 'long' || b.subtype === 'tempo' || b.subtype === 'interval' ? i : -1)).filter((i) => i >= 0);
    const sorted = slots.map((i) => bricks[i]).sort((a, b) => rank(a) - rank(b));
    const out = bricks.slice();
    slots.forEach((pos, k) => { out[pos] = sorted[k]; });
    return out;
}

// 🔁 名稱一律走 runDistanceClass 的單一真相源 —— 里程改了，名稱與分類就跟著改，
//    不會再出現「7.7 公里長跑」這種里程與命名對不上的課表。
function titleForBrick(subtype, distance_km) {
    return titleForRun(subtype, distance_km);
}

function themeForBrick(subtype) {
    return {
        long:     'long_steady',
        medium:   'medium_steady',
        tempo:    'tempo_threshold',
        interval: 'vo2_interval',
        easy:     'easy_breath',
        recovery: 'recovery_drift',
        strength: 'strength_cross',
    }[subtype] || 'easy_breath';
}

// ═══════════════════════════════════════════════════════════════════════
// 5. MAIN ENGINE  —  generateCardioPlan
// ═══════════════════════════════════════════════════════════════════════

/**
 * 🎚 這份設定最後會被判成哪一級 —— generateCardioPlan 與精靈的「建議週期」
 *    問的是同一支，所以畫面上寫「初學者 → 建議 8 週」時，
 *    按下去拿到的也一定是初學者的課表。
 *
 * 規則（順序就是優先級）：
 *   ① 使用者自己說「我還跑不到 5K」→ 硬鎖初學者，什麼都蓋不過。
 *   ② 沒手選級別 → 用跑齡 × 週跑量 × 實測 5K 推導。
 *   ③ 有手選級別 → 尊重它，但「實測體能支持的級別」更高就往上抬
 *      （已跑 10km/週、5K sub-20 的人手選初學者，不該被 3km 單次上限壓住）。
 *      只往上抬、不往下壓 —— 往下壓的只有 ①。
 */
export function resolveLevelInfo(cfg = {}) {
    const info = deriveRunnerLevel({
        runningYears: cfg.runningYears,
        currentWeeklyKm: cfg.currentWeeklyKm,
        pace5kSec: cfg.baselinePace5K,
        canRun5k: cfg.canRun5k,
    });
    if (cfg.canRun5k === false) return { ...info, level: 'beginner' };
    if (!cfg.currentLevel) return info;
    const RANK = { beginner: 0, intermediate: 1, advanced: 2 };
    // 沒填跑齡時，能把手選級別往上抬的只有實測 5K（週跑量單獨一項不夠證明）
    const yearsKnown = cfg.runningYears != null && cfg.runningYears !== '';
    const raiseTo = yearsKnown ? info.level : (info.by5k || null);
    return raiseTo && (RANK[raiseTo] ?? 0) > (RANK[cfg.currentLevel] ?? 0)
        ? { ...info, level: raiseTo }
        : { ...info, level: cfg.currentLevel };
}

/** 只要級別字串的捷徑（畫面大多只需要這個）。 */
export const resolveRunnerLevel = (cfg) => resolveLevelInfo(cfg).level;

/**
 * 主入口：產生一份完整的有氧計劃
 */
export function generateCardioPlan(config = {}) {
    // ── 0. 預設值與驗證 ─────────────────────────────────
    const cfg = {
        goal:             'aerobic_base',
        totalWeeks:       8,
        sessionsPerWeek:  4,
        currentLevel:     null,   // ★ 不再預設 intermediate — 沒填就由跑齡×週跑量推導
        runningYears:     null,   // ★ 跑齡（年），與週跑量一起決定難度
        currentWeeklyKm:  null,   // ★ 使用者目前週跑量，用於漸進超負荷錨點
        baselinePace5K:   null,   // ★ 使用者 5K 完賽時間換算（秒/公里）
        canRun5k:         null,   // ★ false = 使用者自己說「還跑不到 5K」（硬地板，見 runnerLevel）
        maxHR:            null,
        restingHR:        null,
        startDate:        toLocalDateKey(new Date()),
        includeStrength:  true,
        ...config,
    };

    // ══════════════════════════════════════════════════════════════════════
    // 🎚 難度推導 —— 由「跑齡 × 平均週跑量」決定，目標不能覆蓋它
    //
    // 使用者要求：「不要讓使用者一開始就有做不到的感覺 —— 像是初學者
    //   可能就算一個禮拜五公里對他們來說都有困難了。」
    //
    // 兩個維度不一致就取較保守的那一級：
    //   跑齡 3 年但現在週跑量只有 6km（久沒練）→ beginner，不是 advanced。
    //   身體現況比履歷重要，做得到才會有下一週。
    // ══════════════════════════════════════════════════════════════════════
    const levelInfo = resolveLevelInfo(cfg);
    cfg.currentLevel = levelInfo.level;
    const staging = goalStaging(cfg.goal, cfg.currentLevel);

    cfg.totalWeeks = clamp(parseInt(cfg.totalWeeks) || 8, 4, 14);
    // ★ v2.3：開放 1–7 次／週（滑桿）。1–2 次是「重新開始 / 維持」的合法選擇，
    //   不該被擋在門外；7 次是每天跑，引擎會自動把強度攤平。
    cfg.sessionsPerWeek = clamp(parseInt(cfg.sessionsPerWeek) || 4, 1, 7);
    // 如果有 currentWeeklyKm，進行合理性 clamp（0–200km）
    if (cfg.currentWeeklyKm != null) {
        cfg.currentWeeklyKm = clamp(parseFloat(cfg.currentWeeklyKm) || 0, 0, 200);
    }

    // ══════════════════════════════════════════════════════════════════════
    // ★ v2.3 初學者保護「前置」化 —— 這是 +22% 假爬升的根因修正
    //
    //   舊版流程：算軌道 → 生 brick → 事後把第 1 週壓下來。
    //   第 1 週被壓成 4.5，第 2 週卻還在原軌道的 5.5 → 使用者實際看到 +22%，
    //   而 meta 裡的稽核是壓之前算的，還顯示 safe。同一份計劃兩個答案。
    //
    //   新版：先把保護上限換算成「第 1 週實際做得到的量」，
    //   直接當作成長軌道的起點。整條曲線從一開始就長在正確的位置。
    // ══════════════════════════════════════════════════════════════════════
    const guard = week1Ceiling(cfg.currentLevel, cfg.currentWeeklyKm);
    // 第 1 週真正排得出幾趟（初學者保護會限制次數）
    const week1RunSlots = Math.max(1, Math.min(cfg.sessionsPerWeek, guard.maxSessions ?? cfg.sessionsPerWeek));
    // 第 1 週物理上塞得下的極限 = 單次上限 × 趟數，再和總量上限取小
    const physicalCeiling = Math.min(
        guard.maxSingleKm ? guard.maxSingleKm * week1RunSlots : Infinity,
        guard.maxWeekKm ?? Infinity,
    );
    const anchorKm = cfg.currentWeeklyKm != null
        ? Math.min(cfg.currentWeeklyKm, physicalCeiling)
        : null;

    // ── 1. 排 phase、每週課種、物理上限、mileage ─────────────
    const phaseSchedule = schedulePhases(cfg.totalWeeks, cfg.goal);
    const weekSubtypes = phaseSchedule.map((ps, i) => composeBrickTypes({
        phase: ps.phase,
        isDeload: ps.isDeload,
        weekIndex: i,        // ★ 質量課逐週輪替要用（見 QUALITY_SEQUENCE）
        // ★ v2.3：第 1 週的次數上限「在排課時」就生效。
        //   舊版是先排滿 5 趟、分配完里程，再事後刪掉 2 趟 —
        //   被刪掉那兩趟的里程就這樣憑空消失，第 2 週看起來像 +115%。
        sessionsPerWeek: i === 0 ? week1RunSlots : cfg.sessionsPerWeek,
        goal: cfg.goal,
        includeStrength: cfg.includeStrength,
        level: cfg.currentLevel,   // ★ v2.4 初學者一週最多 1 堂速度課
    }));
    // ★ v2.3 初學者第 1 週的單次上限在分配時就生效（削完會回灌），不再等事後 guard 砍一刀。
    const capsFor = (i) => ({
        ...(i === 0 && guard.maxSingleKm ? { perRunMaxKm: guard.maxSingleKm } : {}),
        intervalAsTempo: cfg.qualityStyle === 'tempo',   // 間歇會被改成節奏跑 → 照節奏跑的上下限分配
    });
    const matOpts = (i) => ({ goal: cfg.goal, baselinePace5K: cfg.baselinePace5K, level: cfg.currentLevel, ...capsFor(i) });
    // ★ v2.4 每週物理上限（每趟都頂到上限時的總和）—— 軌道不能排超過這個量，
    //   否則多出來的里程只會變成一趟 3 小時以上的長跑，或在分配時無聲消失。
    const rawCapacityKm = weekSubtypes.map((st, i) => weekCapacityKm(st, matOpts(i)));
    // 訓練週的上限取「這週以後所有訓練週」的最小值：某一週多一堂速度課、裝得比較少時，
    //   前面的週也不要先衝上去再掉下來（第 1 週 79 公里、第 2 週 54 公里那種）。
    const isLoadWeek = (i) => !phaseSchedule[i].isDeload && phaseSchedule[i].phase !== 'taper';
    const capacityKm = [];
    const refreshCapacity = () => {
        let fwd = Infinity;
        for (let i = phaseSchedule.length - 1; i >= 0; i--) {
            if (isLoadWeek(i)) { fwd = Math.min(fwd, rawCapacityKm[i]); capacityKm[i] = fwd; }
            else capacityKm[i] = rawCapacityKm[i];
        }
    };
    refreshCapacity();
    // ── 2. 逐週組 brick ────────────────────────────────
    //   ★ v2.4 依序排：最長一趟要對照「上一個訓練週」的最長一趟（≤ +15% 或 +2 公里）。
    //   這個上限讓某一週裝不下軌道排的量時，把那一週的物理上限往下修、重算軌道 ——
    //   軌道永遠接著「實際排出來的量」長，不會在下一週開出假的大跳。
    let weeklyMileage = [];
    let weeks = [];
    for (let pass = 0; pass < 6; pass++) {
        weeklyMileage = calculateWeeklyMileage(
            cfg.goal,
            cfg.currentLevel,
            phaseSchedule,
            anchorKm,                              // ★ 已納入初學者保護的有效起點
            { startCapKm: physicalCeiling, capacityKm },   // ★ 第 1 週物理上塞得下的極限／每週物理上限
        );
        let prevLongKm = null;
        let shrunk = false;
        weeks = phaseSchedule.map((ps, i) => {
            const caps = capsFor(i);
            if (prevLongKm != null) caps.longMaxKm = Math.max(prevLongKm * 1.15, prevLongKm + 2);
            const bricks = materializeBricks(
                weekSubtypes[i],
                weeklyMileage[i],
                cfg.goal,
                cfg.baselinePace5K,
                cfg.currentLevel,  // ★ v2.0 長跑安全上限依程度封頂
                caps,
            );
            const runs = bricks.filter((b) => b.distance_km != null);
            const realized = round1(runs.reduce((s, b) => s + b.distance_km, 0));
            if (realized < weeklyMileage[i] - 0.05) { rawCapacityKm[i] = realized; shrunk = true; }
            if (!ps.isDeload && ps.phase !== 'taper' && runs.length) prevLongKm = Math.max(...runs.map((b) => b.distance_km));
            return {
                week_index: i + 1,
                phase: ps.phase,
                is_deload: ps.isDeload,
                target_mileage_km: weeklyMileage[i],
                bricks,
                settlement: null,
            };
        });
        if (!shrunk) break;
        refreshCapacity();
    }

    // ── 3. 安全檢查：賽事準備度（★ v2.4 移到最後，用最終的課表算 —— 見 raceReadinessFlags）
    const achievedPeak = Math.max(...weeklyMileage);
    const mileageAudit = auditWeeklyMileage(weeklyMileage, phaseSchedule);
    const safetyFlags = [];

    // ── 4. 組 plan ─────────────────────────────────────
    const rawPlan = {
        plan_id: null, // 後端 upsert 時補
        plan_type: 'cardio',
        goal: cfg.goal,
        total_weeks: cfg.totalWeeks,
        sessions_per_week: cfg.sessionsPerWeek,
        current_level: cfg.currentLevel,
        start_date: cfg.startDate,
        weeks,
        meta: {
            engine_version: '2.0.0',
            generated_at: new Date().toISOString(),
            peak_mileage_km: achievedPeak,          // ★ v2.0：改記「實際爬得到」的峰值
            safety_flags: safetyFlags,              // ★ v2.0：賽事準備量不足等警示
            // ★ v2.1：週量爬升安全稽核（單週增幅 / ACWR），UI 直接拿去畫與說明
            mileage_audit: {
                max_jump_pct: round1(mileageAudit.maxJumpPct),
                max_acwr: Math.round(mileageAudit.maxAcwr * 100) / 100,
                safe: mileageAudit.safe,
                start_km: cfg.currentWeeklyKm,
                peak_ratio: cfg.currentWeeklyKm
                    ? Math.round((achievedPeak / Math.max(cfg.currentWeeklyKm, MIN_START_KM)) * 10) / 10
                    : null,
            },
            baseline_pace_5k_sec: cfg.baselinePace5K,
            // ── 配速模式：未測 5K → 'estimated'（用預設 6:00/km 估算，追蹤仍有依據）
            //            有測 5K → 'measured'（使用者實測換算）
            //            之後跑出真實資料 → 結算引擎會把它升級成 'calibrated'
            pacing_mode: cfg.baselinePace5K ? 'measured' : 'estimated',
            pace_confidence: cfg.baselinePace5K ? 0.9 : 0.4,  // 0..1，calibrate 後會提高
            current_weekly_km: cfg.currentWeeklyKm,
            max_hr: cfg.maxHR,
            resting_hr: cfg.restingHR,
            include_strength: cfg.includeStrength,
            rationale: buildRationale(cfg),
            // 🎚 難度推導的來龍去脈（UI 要能告訴使用者「為什麼給你這個強度」）
            level_source: {
                derived: levelInfo.level,
                by_experience: levelInfo.byExperience,
                by_weekly_km: levelInfo.byWeeklyKm,
                reason: levelInfo.reason,
                running_years: cfg.runningYears,
            },
            goal_staged: staging.staged,
            goal_stage_note: staging.stageNote,
        },
    };

    // 🛡 初學者保護條款（第 1 週次數上限、前 2 週不排 quality）
    const guardedPlan = applyBeginnerGuard(rawPlan, {
        level: cfg.currentLevel,
        currentWeeklyKm: cfg.currentWeeklyKm,
    });

    // 📐 最後一道：把所有數字對齊到「訓練磚」這個唯一真相源
    // A beginner guard can change a quality run into easy. Its pace, time,
    // theme and RPE must change with the prescription, not only its label.
    guardedPlan.weeks.forEach(w => {
        w.bricks = w.bricks.map(b => normalizeRunPrescription(b, cfg.baselinePace5K || 360));
    });
    // 📍 換期時依場地的建議（runPlaceFeedback.placeAdvice）：主場不是操場、間歇一直沒做完 → 間歇改節奏跑
    if (cfg.qualityStyle) applyQualityStyle(guardedPlan, cfg.qualityStyle, (b) => normalizeRunPrescription(b, cfg.baselinePace5K || 360));
    // 🚶 跑不到 5K／零基礎：前 4 週寫成走跑交替（C25K、Galloway）
    if (isRunWalkNovice(cfg)) applyRunWalk(guardedPlan);
    // 🏁 賽前減量「減量不減強度」：週量太小、排不下一整堂速度課時，用加速跑保留配速刺激
    applyTaperStrides(guardedPlan, resolveRunnerLevel(cfg));
    const finalPlan = finalizePlanNumbers(guardedPlan, phaseSchedule);
    // ★ v2.4 賽事準備度用「最終課表」算（週數、峰值週量、最長一趟），做不到就誠實說
    finalPlan.meta.safety_flags = raceReadinessFlags(finalPlan, cfg);
    return finalPlan;
}

/* ══════════════════════════════════════════════════════════════════════
   ★ v2.4 賽事準備度 —— 備賽目標的最低準備（RUN_PLAN_STANDARD.md「目標距離」）
     5K/10K ≥ 6 週；半馬 ≥ 8 週、峰值 ≥ 30 km/週、最長一趟 ≥ 16 km；
     全馬 ≥ 12 週、峰值 ≥ 45 km/週、最長一趟 ≥ 26 km（Hansons 的長跑上限 16 英里）。
   計劃照樣給（不拒絕目標），但每一條沒達到的都要寫出來；成果預估看到這些旗標就不報完賽時間。
   ══════════════════════════════════════════════════════════════════════ */
export const RACE_READINESS = {
    race_5k_10k: { name: '5K／10K', weeks: 6 },
    race_half:   { name: '半馬', weeks: 8, peakKm: 30, longKm: 16 },
    race_full:   { name: '全馬', weeks: 12, peakKm: 45, longKm: 26 },
};
export function raceReadinessFlags(plan, cfg = {}) {
    const rule = RACE_READINESS[cfg.goal || plan?.goal];
    if (!rule) return [];
    const weeks = plan?.weeks || [];
    const T = weeks.length;
    const peak = plan?.meta?.peak_mileage_km ?? Math.max(0, ...weeks.map((w) => w.target_mileage_km || 0));
    const longest = plan?.meta?.totals?.longest_run_km ?? 0;
    const flags = [];
    if (rule.weeks && T < rule.weeks) {
        flags.push({ code: 'weeks_below_race_minimum', underprepared: true,
            message: `${rule.name}至少要準備 ${rule.weeks} 週，這份只有 ${T} 週。` });
    }
    if (rule.peakKm && peak < rule.peakKm) {
        flags.push({ code: 'peak_below_race_minimum', underprepared: true,
            message: `${T} 週內安全爬到的週量約 ${round1(peak)} 公里，${rule.name}建議至少 ${rule.peakKm} 公里。` });
    }
    if (rule.longKm && longest < rule.longKm) {
        flags.push({ code: 'long_run_below_race_minimum', underprepared: true,
            message: `最長一趟 ${round1(longest)} 公里，${rule.name}長跑一般要練到 ${rule.longKm} 公里。` });
    }
    if (flags.length) {
        const last = flags[flags.length - 1];
        last.message += rule.longKm ? '建議拉長週期，或先挑短一點的距離。' : '建議拉長週期。';
    }
    return flags;
}

/* ══════════════════════════════════════════════════════════════════════
   🚶 走跑交替（Couch-to-5K、Galloway）—— 跑不到 5K、或完全沒有跑步習慣的人，
   第一週就要求連續跑 2–3 公里，多數人會在第 5 分鐘停下來、覺得自己失敗。
   前 4 週用「跑 X 分、走 1 分」完成同樣的時間，跑段逐週拉長：1 → 2 → 4 → 8 分鐘，第 5 週起連續跑。
   處方以時間為準（duration_min 不變）；跑步中介面照常追蹤距離。
   ══════════════════════════════════════════════════════════════════════ */
const RUN_WALK_STEPS = [1, 2, 4, 8];   // 第 1–4 週每段跑幾分鐘；走路固定 1 分鐘
export const isRunWalkNovice = (cfg = {}) => cfg.canRun5k === false
    || (cfg.currentLevel === 'beginner' && !(Number(cfg.currentWeeklyKm) >= 5) && !(Number(cfg.baselinePace5K) > 0));
export function applyRunWalk(plan) {
    (plan?.weeks || []).slice(0, RUN_WALK_STEPS.length).forEach((w, wi) => {
        const runMin = RUN_WALK_STEPS[wi];
        (w.bricks || []).forEach((b) => {
            if (b.distance_km == null || b.type === 'strength' || b.subtype === 'strength') return;
            const rounds = Math.max(1, Math.round((b.duration_min || 0) / (runMin + 1)));
            b.run_walk = { run_min: runMin, walk_min: 1, rounds, label: `跑 ${runMin} 分、走 1 分 × ${rounds} 輪` };
        });
    });
    if (plan?.meta) plan.meta.run_walk_weeks = Math.min(RUN_WALK_STEPS.length, plan.weeks?.length || 0);
    return plan;
}

/**
 * ★ v2.3 —— 數字收斂（單一真相源）
 *
 * 課表上真正會被執行的東西是「訓練磚」。所以每一週的 target_mileage_km
 * 一律等於該週所有訓練磚的距離總和，peak / total / 安全稽核也全部
 * 從這組最終數字重算。
 *
 * 這解掉三個對不上：
 *   1. 保護條款改過第 1 週，但 meta.mileage_audit 還是改之前算的
 *      → 引擎說 safe、UI 說偏高，同一份計劃兩個答案。
 *   2. 週目標里程 vs 該週磚加總有 0.1–0.5 km 的漂移。
 *   3. 週期頁的 PEAK 與預覽頁的總公里各自四捨五入 → 6 km vs 6.1 km。
 */
/**
 * 🏁 賽前減量週的加速跑（Daniels：E 跑＋加速跑；Mujika & Padilla 2003：減量不減強度）
 *   減量週量太小（例：4 週計劃最後一週 11 公里），一堂節奏／間歇的最低量（含暖身收操）放不下，
 *   prepareRunList 會把它改成輕鬆跑 —— 結果賽前一整週完全沒有配速刺激。
 *   這時在一趟輕鬆跑後面接 6 × 20 秒加速跑：幾乎不增加疲勞，但保住腿的速度感。
 *   初學者不加（前幾週本來就不排速度課），已經有速度課的週不加。
 */
export function applyTaperStrides(plan, level) {
    if (!plan?.weeks?.length || level === 'beginner') return plan;
    plan.weeks.forEach((w) => {
        if (w.phase !== 'taper') return;
        const runs = (w.bricks || []).filter((b) => b.distance_km != null && b.type !== 'strength');
        if (runs.length < 3 || runs.some((b) => b.subtype === 'tempo' || b.subtype === 'interval' || b.strides)) return;
        const longest = runs.reduce((m, b) => (b.distance_km > (m?.distance_km ?? -1) ? b : m), null);
        const pick = runs.find((b) => b.subtype === 'easy' && b !== longest) || runs.find((b) => b !== longest && b.subtype !== 'recovery');
        if (!pick) return;
        pick.strides = { reps: 6, seconds: 20, label: '跑完接 6 × 20 秒加速跑（快但放鬆，每趟走回來休息）' };
        // 標題維持「N 公里 輕鬆跑」（titleForRun 是唯一真相源）；加速跑寫在 strides，課的詳情頁會顯示
    });
    return plan;
}

export function finalizePlanNumbers(plan, phaseSchedule = null) {
    if (!plan?.weeks?.length) return plan;

    const schedule = phaseSchedule
        || plan.weeks.map((w) => ({ phase: w.phase, isDeload: w.is_deload }));

    const weeks = plan.weeks.map((w) => {
        const runBricks = (w.bricks || []).filter((b) => b.distance_km != null);
        const km = round1(runBricks.reduce((s, b) => s + (b.distance_km || 0), 0));
        const durationMin = (w.bricks || []).reduce((s, b) => s + (b.duration_min || 0), 0);
        return {
            ...w,
            target_mileage_km: km,
            // UI 需要的衍生值一次算好，各頁不要各自再算一遍
            run_sessions: runBricks.length,
            strength_sessions: (w.bricks || []).length - runBricks.length,
            total_duration_min: durationMin,
        };
    });

    const mileages = weeks.map((w) => w.target_mileage_km);
    const peak = mileages.length ? Math.max(...mileages) : 0;
    const totalKm = round1(mileages.reduce((a, b) => a + b, 0));
    const audit = auditWeeklyMileage(mileages, schedule);
    const startKm = mileages[0] ?? 0;

    // ── 「?」說明用：引擎替使用者擋掉／調整了什麼 ────────────────
    //   主畫面只講「怎麼練、會得到什麼」，這些機制全部收在問號裡。
    const loadWeeks = weeks.filter((w) => !w.is_deload && w.phase !== 'taper');
    const plannedRuns = loadWeeks.length
        ? Math.max(...loadWeeks.map((w) => w.run_sessions))
        : (weeks[0]?.run_sessions || 0);
    const explain = [];

    explain.push({
        code: 'ramp',
        title: '漸進超負荷',
        body: `每次加量都對照「上一個訓練週」而不是減量週，單週增幅最高 +${round1(audit.maxJumpPct)}%（安全線 15%）。`,
    });
    explain.push({
        code: 'acwr',
        title: '受傷風險控管',
        body: `ACWR（近期負荷 ÷ 四週平均）全程最高 ${Math.round(audit.maxAcwr * 100) / 100}，` +
              `超過 1.30 會自動把該週壓回來。`,
    });
    // ★ v2.4 每一句都從這份計劃的數字寫出來 —— 舊版寫死「每 3 週減量、量降到 60%、少跑一趟」，
    //   一週只跑 1–2 趟的人減量週根本沒有少一趟，4 週的備賽計劃也沒有減量週。
    const deloadWeeks = weeks.map((w, i) => ({ w, i })).filter(({ w }) => w.is_deload);
    if (deloadWeeks.length) {
        const ratios = [], fewer = [];
        deloadWeeks.forEach(({ w, i }) => {
            const prev = weeks.slice(0, i).filter((x) => !x.is_deload && x.phase !== 'taper').pop();
            if (prev?.target_mileage_km > 0) ratios.push(w.target_mileage_km / prev.target_mileage_km);
            if (prev) fewer.push(w.run_sessions < prev.run_sessions);
        });
        const pct = ratios.length ? Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100) : null;
        explain.push({
            code: 'deload',
            title: '減量週',
            body: `第 ${deloadWeeks.map(({ i }) => i + 1).join('、')} 週減量：` +
                  `${pct ? `量降到約 ${pct}%` : '量降下來'}${fewer.length && fewer.every(Boolean) ? '、少跑一趟' : ''}、不排速度課。`,
        });
    }
    const selectedRuns = Number(plan.sessions_per_week) || plannedRuns;
    if (weeks[0] && weeks[0].run_sessions < plannedRuns && plan.meta?.beginner_guard_applied) {
        explain.push({
            code: 'week1_guard',
            title: '第 1 週保護',
            body: `第 1 週只排 ${weeks[0].run_sessions} 趟、每趟最多 3 公里。先做得到。`,
        });
    }
    // 每趟至少 2 公里：週量還小的時候，排不滿使用者選的趟數
    const shortWeeks = weeks.map((w, i) => ({ w, i }))
        .filter(({ w, i }) => !w.is_deload && w.phase !== 'taper' && w.run_sessions < selectedRuns && !(i === 0 && plan.meta?.beginner_guard_applied));
    if (shortWeeks.length) {
        // 「第 N 週起每週 n 趟」：N 一定在最後一個少排的訓練週之後，句子才成立
        const lastShort = shortWeeks[shortWeeks.length - 1].i;
        const fullFrom = weeks.findIndex((w, i) => i > lastShort && w.run_sessions >= selectedRuns);
        explain.push({
            code: 'min_run',
            title: '每趟至少 2 公里',
            body: `量還小的週先少排幾趟：第 ${shortWeeks.map(({ i }) => i + 1).join('、')} 週。` +
                  (fullFrom >= 0 ? `第 ${fullFrom + 1} 週起每週 ${selectedRuns} 趟。` : `這份計劃的量還排不滿每週 ${selectedRuns} 趟。`),
        });
    }
    if (plan.meta?.run_walk_weeks) {
        explain.push({
            code: 'run_walk',
            title: '走跑交替',
            body: `前 ${plan.meta.run_walk_weeks} 週走跑交替：跑段從 1 分鐘拉長到 8 分鐘，之後連續跑。`,
        });
    }
    if (plan.meta?.include_strength) {
        const hasTaper = weeks.some((w) => w.phase === 'taper');
        explain.push({
            code: 'strength',
            title: '重訓交叉訓練',
            body: `重訓另外排，不佔跑步趟數${hasTaper ? '，賽前減量週不排' : ''}。重訓能降低受傷率、讓跑步更省力。`,
        });
    }

    return {
        ...plan,
        weeks,
        meta: {
            ...plan.meta,
            engine_version: '2.3.0',
            peak_mileage_km: peak,
            planned_run_sessions: plannedRuns,
            explain,
            // 📊 全流程共用的彙總 —— 任何頁面都不該自己再加總一次
            totals: {
                total_km: totalKm,
                total_bricks: weeks.reduce((n, w) => n + (w.bricks?.length || 0), 0),
                total_run_sessions: weeks.reduce((n, w) => n + w.run_sessions, 0),
                total_strength_sessions: weeks.reduce((n, w) => n + w.strength_sessions, 0),
                total_duration_min: weeks.reduce((n, w) => n + w.total_duration_min, 0),
                start_km: startKm,
                peak_km: peak,
                longest_run_km: round1(weeks.reduce((mx, w) => {
                    (w.bricks || []).forEach((b) => { if ((b.distance_km || 0) > mx) mx = b.distance_km; });
                    return mx;
                }, 0)),
            },
            mileage_audit: {
                max_jump_pct: round1(audit.maxJumpPct),
                max_acwr: Math.round(audit.maxAcwr * 100) / 100,
                safe: audit.safe,
                start_km: startKm,
                peak_ratio: startKm > 0 ? Math.round((peak / startKm) * 10) / 10 : null,
                risky_weeks: audit.rows.filter((r) => r.risky).map((r) => r.week),
            },
        },
    };
}

/**
 * 給 UI 用的人話解釋：「為什麼這份計劃長這樣？」
 */
function buildRationale(cfg) {
    const goalLabel = {
        fat_loss:     '減脂燃燒 · 高頻 Z2 + 微量 HIIT',
        aerobic_base: '有氧基礎 · MAF 80/20 法則',
        race_5k_10k:  '5K/10K 備賽 · 金字塔週期化',
        race_half:    '半程馬拉松 · 14 週週期',
        race_full:    '全程馬拉松 · 14 週週期 + 減量',
    }[cfg.goal] || cfg.goal;

    const anchorLine = cfg.currentWeeklyKm != null
        ? `起點錨定你的真實週跑量 ${cfg.currentWeeklyKm}km，依程度分級漸進（初學 +8%/中階 +10%/進階 +12% 每週）`
        : `未提供目前週跑量 — 使用保守理論起點，建議回頭填寫基準線讓計劃更貼身`;

    return [
        `目標：${goalLabel}`,
        `${cfg.totalWeeks} 週 × ${cfg.sessionsPerWeek} 次/週 = 共 ${cfg.totalWeeks * cfg.sessionsPerWeek} 個訓練磚`,
        anchorLine,
        `週期化：80% 輕鬆 / 20% 高強度（建立期）；95/5（減量期）；70/30（巔峰期）`,
        `每 3–4 週減量 · 速度課每週最多 2 堂 · 長跑最多 150 分鐘`,
    ];
}

// ═══════════════════════════════════════════════════════════════════════
// 6. INSPECTORS  —  給 UI 顯示週期化的視覺化摘要
// ═══════════════════════════════════════════════════════════════════════

/**
 * 把 plan 攤平成一張「強度熱力圖」資料源
 * 回傳 [{ week, phase, mileage, easy_pct, hard_pct, bricks_count }]
 */
export function inspectPlan(plan) {
    return (plan?.weeks || []).map((w) => {
        const total = w.bricks.length || 1;
        const hard = w.bricks.filter((b) => ['tempo', 'interval'].includes(b.subtype)).length;
        const easy = total - hard;
        return {
            week: w.week_index,
            phase: w.phase,
            is_deload: w.is_deload,
            mileage: w.target_mileage_km,
            easy_pct: Math.round((easy / total) * 100),
            hard_pct: Math.round((hard / total) * 100),
            bricks_count: total,
        };
    });
}

/**
 * 🎚 整份計劃的課種分佈 —— 回答「這份計劃只看里程嗎？」
 *
 * 使用者問過：「因為跑步有練 zone2 或者是間歇跑等等，這些目前有考慮在計劃內嗎」
 * 答案一直是有（composeBrickTypes 就是 80/20 極化模型排的），
 * 但預覽從頭到尾只畫里程，使用者當然看不出來。數字要擺出來才算數。
 *
 * @returns {{ counts:Object, total:number, easy:number, quality:number, easyPct:number }}
 */
export function planIntensityMix(plan) {
    const counts = {};
    let total = 0;
    let quality = 0;
    for (const w of plan?.weeks || []) {
        for (const b of w.bricks || []) {
            const t = b.subtype || b.type;
            if (!t || t === 'strength') continue;
            counts[t] = (counts[t] || 0) + 1;
            total += 1;
            if (t === 'tempo' || t === 'interval') quality += 1;
        }
    }
    const easy = total - quality;
    return { counts, total, easy, quality, easyPct: total ? Math.round((easy / total) * 100) : 0 };
}

/**
 * 取得單週的視覺摘要 — for Week Card
 */
export function summarizeWeek(week) {
    const bricks = week?.bricks || [];
    const counts = bricks.reduce((acc, b) => {
        acc[b.subtype || b.type] = (acc[b.subtype || b.type] || 0) + 1;
        return acc;
    }, {});
    return {
        mileage: week?.target_mileage_km || 0,
        phase: week?.phase || 'base',
        is_deload: !!week?.is_deload,
        counts,
        total_bricks: bricks.length,
    };
}

// ═══════════════════════════════════════════════════════════════════════
// 7. EXPORT DEFAULT
// ═══════════════════════════════════════════════════════════════════════

export default {
    generateCardioPlan,
    schedulePhases,
    calculateWeeklyMileage,
    applyAcwrGate,
    auditWeeklyMileage,
    finalizePlanNumbers,
    composeBrickTypes,
    materializeBricks,
    inspectPlan,
    summarizeWeek,
    PEAK_MILEAGE_BY_GOAL,
    LEVEL_SCALE,
    PHASE_MILEAGE_RATIO,
    PHASE_INTENSITY_MIX,
};
