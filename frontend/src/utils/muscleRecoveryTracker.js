/**
 * ══════════════════════════════════════════════════════════════
 * MUSCLE RECOVERY TRACKER v3.0
 * ══════════════════════════════════════════════════════════════
 *
 * v3 upgrades:
 *   1. Fine-grained subPart detection (chest_upper, lats, glutes, hamstrings, calves...)
 *   2. Full 15+ region output matching LoeweMuscleSculpture SVG regions exactly
 *   3. Volume-weighted fatigue per subPart (heavier sessions = slower recovery)
 *   4. Backwards compatible: still outputs simple keys (chest, back, etc.)
 *
 * Data flow:
 *   WorkoutSessionView.completeWorkout()
 *     → recordWorkoutCompletion(userId, exercises)
 *       → detects muscles + subPart via fuzzy keywords
 *       → stores { timestamp, volume, exercises, subPart } per muscle in localStorage
 *
 *   LoeweMuscleSculpture / AntigravityMuscleMap / LuxuryPlanView
 *     → getMuscleRecoveryScores(userId)
 *       → returns { chest: 34, chest_upper: 30, chest_lower: 38, lats: 60, glutes: 45, ... }
 * ══════════════════════════════════════════════════════════════
 */

// ════════════════════════════════════════
// 1. FINE-GRAINED MUSCLE DETECTION
// ════════════════════════════════════════

/**
 * Maps exercise keywords → { macro: string, subPart: string }
 * subPart aligns EXACTLY with LoeweMuscleSculpture SVG region IDs
 */
import { readJSON } from './safeStorage';

const FINE_GRAINED_RULES = [
    // ── CHEST ──────────────────────────────────────────────────
    // 🩹 修正：「反向飛鳥 / 俯身飛鳥 / reverse fly / reverse pec」是後三角動作，
    //    以前會被「飛鳥 / fly / pec」關鍵字誤判成胸 → 背日練完胸部卻顯示疲勞。
    { regex: /(incline|上斜|上胸|上斜臥推|高位夾胸)/, macro: 'chest', subPart: 'chest_upper' },
    { regex: /(decline|下斜|下胸|雙槓|dip|低位夾胸)/, macro: 'chest', subPart: 'chest_lower' },
    { regex: /(bench|chest|胸|臥推|推胸|(?<!反向)(?<!俯身)飛鳥|(?<!反向)夾胸|(?<!reverse[ _-])pec|(?<!reverse[ _-])fly|crossover|push.?up|伏地挺身)/, macro: 'chest', subPart: 'chest_mid' },

    // ── SHOULDERS ──────────────────────────────────────────────
    { regex: /(rear delt|face pull|reverse pec|reverse fly|反向飛鳥|反向夾胸|俯身飛鳥|後束|後三角)/, macro: 'shoulders', subPart: 'rear_delts' },
    { regex: /(lateral raise|side raise|側平舉|側舉|中束|中三角)/, macro: 'shoulders', subPart: 'side_delts' },
    { regex: /(shoulder|delt|overhead press|ohp|推舉|肩推|前束|前三角|front raise|前平舉|軍式)/, macro: 'shoulders', subPart: 'front_delts' },

    // ── BACK ───────────────────────────────────────────────────
    { regex: /(pull.?up|chin.?up|pulldown|lat pull|引體|下拉|lat|背闊)/, macro: 'back', subPart: 'lats' },
    { regex: /(trap|shrug|聳肩|斜方)/, macro: 'back', subPart: 'traps' },
    { regex: /(back extension|hyperextension|good morning|豎脊|下背|erector|spinal)/, macro: 'back', subPart: 'lower_back' },
    { regex: /(row|划船|back|背|deadlift|硬舉|rhomboid|菱形肌)/, macro: 'back', subPart: 'mid_back' },

    // ── ARMS ───────────────────────────────────────────────────
    { regex: /(bicep|curl|二頭|彎舉|preacher|hammer curl|concentration)/, macro: 'arms', subPart: 'biceps' },
    { regex: /(tricep|三頭|pushdown|skull|下壓|extension|close grip|diamond|kickback)/, macro: 'arms', subPart: 'triceps' },
    { regex: /(forearm|wrist curl|前臂|腕彎舉)/, macro: 'arms', subPart: 'forearms' },

    // ── LEGS ───────────────────────────────────────────────────
    { regex: /(calf|calves|提踵|小腿|gastrocnemius)/, macro: 'legs', subPart: 'calves' },
    { regex: /(hip thrust|臀推|glute bridge|frog pump|青蛙橋|abduction|外展|蚌殼|clamshell|火箭)/, macro: 'legs', subPart: 'glutes' },
    { regex: /(hamstring|rdl|romanian|nordic|leg curl|腿後|大腿後|腿彎舉|髖絞鏈|hip hinge)/, macro: 'legs', subPart: 'hamstrings' },
    { regex: /(squat|lunge|leg press|leg extension|深蹲|腿舉|弓箭步|分腿蹲|保加利亞|股四頭|quad)/, macro: 'legs', subPart: 'quads' },

    // ── CORE ───────────────────────────────────────────────────
    { regex: /(plank|crunch|捲腹|棒式|腹肌|ab |abs|core|sit.?up|leg raise|russian twist|dead bug|rollout|wheel|hollow|cable crunch|掛腿|核心)/, macro: 'core', subPart: 'abs' },
];

/**
 * Detect muscles from an exercise object.
 * Returns Array<{ macro, subPart }>
 */
export const detectMusclesFromExercise = (exercise) => {
    const name = (exercise.name || '').toLowerCase();
    const nameEn = (exercise.nameEn || '').toLowerCase();
    const muscleField = (exercise.muscle || exercise.target_group || exercise.subPart || '').toLowerCase();
    const searchIn = `${name} ${nameEn} ${muscleField}`;

    const matched = new Map(); // subPart → { macro, subPart }
    for (const rule of FINE_GRAINED_RULES) {
        if (rule.regex.test(searchIn)) {
            matched.set(rule.subPart, { macro: rule.macro, subPart: rule.subPart });
        }
    }

    // Dedupe: if both chest_upper and chest_mid hit, keep the more specific one
    const result = [...matched.values()];

    if (result.length === 0) {
        console.warn(`[Recovery v3] No muscle match for: "${exercise.name}"`);
    }
    return result;
};

// ════════════════════════════════════════
// 2. RECOVERY CONFIGURATION
// ════════════════════════════════════════

/**
 * Science-based recovery windows per subPart
 * Small/single-joint: 36–48h, Large/compound: 48–72h
 */
const SUBPART_RECOVERY_HOURS = {
    // Chest
    chest_upper: 60, chest_mid: 60, chest_lower: 55,
    // Shoulders
    front_delts: 48, side_delts: 42, rear_delts: 42,
    // Back
    lats: 60, traps: 48, mid_back: 60, lower_back: 72,
    // Arms
    biceps: 40, triceps: 40, forearms: 36,
    // Legs
    quads: 72, hamstrings: 72, glutes: 60, calves: 36,
    // Core
    abs: 36,
};

const DEFAULT_RECOVERY_HOURS = 48;

/* 訓練量 → 負荷倍率。下限放寬到 0.45（原本是 0.8）：
   ⚠️ 原本不管多輕的一次訓練，倍率都被夾在 0.8，而下面的谷底又寫死 15 分 ——
      所以一趟 3 公里的恢復慢跑跟一趟 25 公里的長跑，跑完當下都是 15 分
      DEPLETED，身體圖整片變紅。輕的一次本來就不該讀成「掏空」。
   跟後端 recovery.py 的 cardio_weight 同一個區間（0.45–1.5）。 */
export const VOLUME_FACTOR_MIN = 0.45;
export const VOLUME_FACTOR_MAX = 1.5;
export const volumeFactorOf = (volume) => (
    volume ? Math.min(VOLUME_FACTOR_MAX, Math.max(VOLUME_FACTOR_MIN, volume / 4000)) : 1
);

const calculateRecoveryScore = (hoursSince, fullRecoveryHours, volumeFactor = 1) => {
    const vf = Math.min(VOLUME_FACTOR_MAX, Math.max(VOLUME_FACTOR_MIN, volumeFactor));
    const full = fullRecoveryHours * vf;
    if (hoursSince >= full) return 100;

    /* 谷底depth 也跟著負荷走：重的一次掉到 15，輕的一次只掉到 ~45。
       以前這裡寫死 15 —— 谷底一樣深，只有恢復時間不同，
       所以輕鬆跑完照樣顯示 DEPLETED。 */
    const floor = Math.round(15 + (VOLUME_FACTOR_MAX - vf) / (VOLUME_FACTOR_MAX - VOLUME_FACTOR_MIN) * 30);

    // Phase 1 — Deep Fatigue (0 → 20% of full): floor → floor+20
    const phase1End = full * 0.2;
    if (hoursSince <= phase1End) {
        const p = hoursSince / phase1End;
        return Math.round(floor + p * 20);
    }

    // Phase 2 — Recovering (20% → 55% of full): 35% → 65%
    const phase2End = full * 0.55;
    if (hoursSince <= phase2End) {
        const p = (hoursSince - phase1End) / (phase2End - phase1End);
        return Math.round(35 + p * 30);
    }

    // Phase 3 — Almost Ready (55% → 100% of full): 65% → 100%
    const p = (hoursSince - phase2End) / (full - phase2End);
    return Math.round(65 + Math.min(p, 1) * 35);
};

// ════════════════════════════════════════
// 3. RECORD WORKOUT COMPLETION
// ════════════════════════════════════════

/**
 * Record a completed workout for recovery tracking.
 * Stores fine-grained subPart data so LoeweMuscleSculpture can read per-region.
 *
 * @param {string} userId
 * @param {Array<{name: string, nameEn?: string, muscle?: string, sets?: Array}>} exercises
 */
export const recordWorkoutCompletion = (userId, exercises) => {
    const storageKey = `muscle_training_v3_${userId}`;
    const now = Date.now();
    const existingData = readJSON(storageKey, {});

    // Also write to legacy key for backward compatibility
    const legacyKey = `muscle_training_${userId}`;
    const legacyData = readJSON(legacyKey, {});

    const trainedSubParts = {}; // { subPart: { macro, volume, exercises[] } }
    const trainedMacro = {};   // { macro: { volume, exercises[] } } — legacy

    exercises.forEach(exercise => {
        const detectedParts = detectMusclesFromExercise(exercise);
        if (detectedParts.length === 0) return;

        // Calculate volume for this exercise
        let exerciseVolume = 0;
        const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
        sets.forEach(s => {
            if (s.weight && s.reps) exerciseVolume += Number(s.weight) * Number(s.reps);
        });
        if (exerciseVolume === 0 && sets.length > 0) {
            exerciseVolume = sets.length * 50; // bodyweight estimate
        }

        detectedParts.forEach(({ macro, subPart }) => {
            // Fine-grained tracking
            if (!trainedSubParts[subPart]) trainedSubParts[subPart] = { macro, volume: 0, exercises: [] };
            trainedSubParts[subPart].volume += exerciseVolume;
            trainedSubParts[subPart].exercises.push(exercise.name);

            // Legacy macro tracking
            if (!trainedMacro[macro]) trainedMacro[macro] = { volume: 0, exercises: [] };
            trainedMacro[macro].volume += exerciseVolume;
            trainedMacro[macro].exercises.push(exercise.name);
        });
    });

    const cutoff = now - 7 * 24 * 60 * 60 * 1000;

    // Write fine-grained data
    Object.entries(trainedSubParts).forEach(([subPart, data]) => {
        if (!existingData[subPart]) existingData[subPart] = [];
        existingData[subPart].push({
            timestamp: now,
            exercises: [...new Set(data.exercises)],
            volume: data.volume,
            macro: data.macro,
        });
        existingData[subPart] = existingData[subPart].filter(r => r.timestamp > cutoff);
    });
    localStorage.setItem(storageKey, JSON.stringify(existingData));

    // Write legacy macro data (backward compatibility)
    Object.entries(trainedMacro).forEach(([muscle, data]) => {
        if (!legacyData[muscle]) legacyData[muscle] = [];
        legacyData[muscle].push({ timestamp: now, exercises: [...new Set(data.exercises)], volume: data.volume });
        legacyData[muscle] = legacyData[muscle].filter(r => r.timestamp > cutoff);
    });
    localStorage.setItem(legacyKey, JSON.stringify(legacyData));

    console.log('[Recovery v3] Recorded subParts:', Object.keys(trainedSubParts).join(', '));
};

// ════════════════════════════════════════
// 3b. 有氧（跑步 / 單車）的肌群負荷
// ════════════════════════════════════════
/**
 * 跑步吃的是哪些肌群、吃多重。
 *
 * ⚠️ 為什麼要有這一段：recordWorkoutCompletion 只有重訓頁在呼叫，
 *    所以跑再多、身體肌群恢復圖都還是全綠 100% —— 那張圖等於沒把
 *    跑步算進去。使用者問「跑步系統是不是也要有計算」，答案是要，
 *    而且要跟重訓寫進同一個儲存、走同一條恢復曲線（不然又是兩套真相）。
 *
 * 權重依「跑步實際吃的程度」：小腿最重，股四頭次之，
 * 腿後與臀較輕（跑步是伸髖但離心負荷不如重訓），核心最輕。
 */
const CARDIO_MUSCLE_LOAD = {
    calves: 1.0,
    quads: 0.9,
    hamstrings: 0.7,
    glutes: 0.6,
    abs: 0.4,
};

/* 換算成跟重訓同一個尺度的「訓練量」（重訓的 volumeFactor 是 volume / 4000）。

   ⭐ 優先用「努力值」——那是跑步頁逐秒依心率 Zone 加權累加出來的
      （Z2×1.0、Z3×2.0、Z4×3.5、Z5×5.0 ÷ 60），它看得到「強度」，
      距離看不到：同樣 5 公里，Z2 輕鬆跑跟節奏跑對身體的帳完全不同。

   ⚠️ 努力值有兩條路，尺度不一樣（見 utils/fallbackScore.js 的 resolveSessionScore）：
        source='hr'        心率版，一小時中等強度 ≈ 100 分
        source='fallback'  沒戴錶時用距離/時間/配速估，同一趟大約是心率版的 1.6 倍
      所以兩條路各自校準，讓「同一趟跑步，戴不戴錶算出來的負荷差不多」——
      否則身體圖會因為今天有沒有戴錶而長得不一樣。
   完全沒有努力值（舊紀錄）才退回距離／時間。 */
const EFFORT_TO_VOLUME = { hr: 40, fallback: 25 };
const KM_TO_VOLUME = 400;
const MIN_TO_VOLUME = 70;

/**
 * 這一趟該算多少「訓練量」。努力值優先，沒有才退回距離／時間。
 * @returns {{volume:number, from:'effort_hr'|'effort_fallback'|'distance'|'duration'}|null}
 */
export const cardioLoadOf = ({ effortScore, effortSource, distanceKm, durationMin } = {}) => {
    const eff = Number(effortScore);
    if (Number.isFinite(eff) && eff > 0) {
        const src = effortSource === 'fallback' ? 'fallback' : 'hr';
        return { volume: eff * EFFORT_TO_VOLUME[src], from: `effort_${src}` };
    }
    const km = Number(distanceKm);
    if (Number.isFinite(km) && km > 0) return { volume: km * KM_TO_VOLUME, from: 'distance' };
    const min = Number(durationMin);
    if (Number.isFinite(min) && min > 0) return { volume: min * MIN_TO_VOLUME, from: 'duration' };
    return null;
};

/**
 * 記錄一趟有氧。
 * @param {string} userId
 * @param {{effortScore?:number, effortSource?:'hr'|'fallback', distanceKm?:number,
 *          durationMin?:number, sport?:string, label?:string}} run
 * @returns {string[]|null} 實際記進去的肌群；資料不足回 null（不編一筆進去）
 */
export const recordCardioCompletion = (userId, run = {}) => {
    if (!userId) return null;
    const load = cardioLoadOf(run);
    // 努力值、距離、時間都沒有 → 這趟根本沒資料，不要記一筆假的進去
    if (!load) return null;
    const base = load.volume;

    const storageKey = `muscle_training_v3_${userId}`;
    const now = Date.now();
    const cutoff = now - 7 * 24 * 60 * 60 * 1000;
    const data = readJSON(storageKey, {});
    const label = run.label || (run.sport === 'bike' ? '單車' : '跑步');

    Object.entries(CARDIO_MUSCLE_LOAD).forEach(([subPart, w]) => {
        if (!data[subPart]) data[subPart] = [];
        data[subPart].push({
            timestamp: now,
            exercises: [label],
            volume: Math.round(base * w),
            macro: subPart === 'abs' ? 'core' : 'legs',
            source: 'cardio',
            loadFrom: load.from,   // 這筆負荷是用努力值還是距離算的（之後要回溯時看得出來）
        });
        data[subPart] = data[subPart].filter(r => r.timestamp > cutoff);
    });
    try { localStorage.setItem(storageKey, JSON.stringify(data)); } catch { /* 配額滿 → 略過 */ }
    return Object.keys(CARDIO_MUSCLE_LOAD);
};

// ════════════════════════════════════════
// 4. GET RECOVERY SCORES (FINE-GRAINED)
// ════════════════════════════════════════

const ALL_SUBPARTS = Object.keys(SUBPART_RECOVERY_HOURS);

/**
 * Get fine-grained recovery scores for all SVG muscle regions.
 *
 * @param {string} userId
 * @returns {Object} Full map of all keys used by LoeweMuscleSculpture:
 *   {
 *     // Fine-grained (15+ SVG region IDs)
 *     chest_upper, chest_lower, chest_mid,
 *     front_delts, side_delts, rear_delts,
 *     lats, traps, mid_back, lower_back,
 *     biceps, triceps, forearms,
 *     quads, hamstrings, glutes, calves,
 *     abs,
 *     // Expanded aliases (LoeweMuscleSculpture getScore mapping)
 *     left_shoulder, right_shoulder,
 *     left_arm, right_arm,
 *     left_leg, right_leg,
 *     upper_back,
 *     glute,
 *     // Simple macro keys (dashboard / legacy)
 *     chest, back, shoulders, arms, core, legs
 *   }
 */
export const getMuscleRecoveryScores = (userId) => {
    const storageKey = `muscle_training_v3_${userId}`;
    const legacyKey = `muscle_training_${userId}`;
    const fineData = readJSON(storageKey, {});
    const legacyData = readJSON(legacyKey, {});
    const now = Date.now();

    // ── Compute fine-grained subPart scores ──
    /* ⚠️ tracked：這塊肌肉「有沒有被練過」。
       沒練過時分數照樣給 100 是為了讓下游的數學不炸，但畫面不可以拿它
       當「完全恢復」來顯示 —— 一次都沒練的人不該看到滿版綠色 100% FRESH，
       那是編出來的。畫面請看 _tracked 決定要不要顯示數字。 */
    const tracked = {};
    const subPartScores = {};
    ALL_SUBPARTS.forEach(subPart => {
        const records = fineData[subPart] || [];
        tracked[subPart] = records.length > 0;
        if (records.length === 0) {
            subPartScores[subPart] = 100;
        } else {
            const last = records[records.length - 1];
            const hoursSince = (now - last.timestamp) / (1000 * 60 * 60);
            const fullHours = SUBPART_RECOVERY_HOURS[subPart] || DEFAULT_RECOVERY_HOURS;
            const volumeFactor = volumeFactorOf(last.volume);
            subPartScores[subPart] = calculateRecoveryScore(hoursSince, fullHours, volumeFactor);
        }
    });

    // ── Compute legacy macro scores (from legacy storage) ──
    const macroGroups = ['chest', 'back', 'shoulders', 'arms', 'core', 'legs'];
    const macroScores = {};
    macroGroups.forEach(muscle => {
        const records = legacyData[muscle] || [];
        if (records.length === 0) {
            macroScores[muscle] = 100;
        } else {
            const last = records[records.length - 1];
            const hoursSince = (now - last.timestamp) / (1000 * 60 * 60);
            const volumeFactor = volumeFactorOf(last.volume);
            macroScores[muscle] = calculateRecoveryScore(hoursSince, DEFAULT_RECOVERY_HOURS, volumeFactor);
        }
    });

    // ── Derive macro from fine-grained if legacy is empty ──
    const avgOf = (...keys) => {
        const vals = keys.map(k => subPartScores[k] ?? 100);
        return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    };

    const chestScore = Math.min(subPartScores.chest_upper, subPartScores.chest_mid, subPartScores.chest_lower);
    const backScore = Math.min(subPartScores.lats, subPartScores.mid_back, subPartScores.traps, subPartScores.lower_back);
    const shoulderScore = Math.min(subPartScores.front_delts, subPartScores.side_delts, subPartScores.rear_delts);
    const armsScore = Math.min(subPartScores.biceps, subPartScores.triceps);
    const legsScore = Math.min(subPartScores.quads, subPartScores.hamstrings, subPartScores.glutes, subPartScores.calves);
    const coreScore = subPartScores.abs;

    // Use fine-grained if available, else fall back to legacy macro
    const resolve = (fineVal, legacyVal) => (fineVal < 100 ? fineVal : legacyVal);

    return {
        /* 哪些肌群真的有訓練紀錄（畫面據此決定顯不顯示分數）。
           底線開頭：跟肌群 key 區隔，下游列舉 key 時不會誤當成一塊肌肉。 */
        _tracked: tracked,
        _anyTracked: Object.values(tracked).some(Boolean),

        // ── Fine-grained subPart keys (used by SVG getScore mapping) ──
        chest_upper: subPartScores.chest_upper,
        chest_lower: subPartScores.chest_lower,
        chest_mid: subPartScores.chest_mid,
        front_delts: subPartScores.front_delts,
        side_delts: subPartScores.side_delts,
        rear_delts: subPartScores.rear_delts,
        lats: subPartScores.lats,
        traps: subPartScores.traps,
        mid_back: subPartScores.mid_back,
        lower_back: subPartScores.lower_back,
        biceps: subPartScores.biceps,
        triceps: subPartScores.triceps,
        forearms: subPartScores.forearms,
        quads: subPartScores.quads,
        hamstrings: subPartScores.hamstrings,
        glutes: subPartScores.glutes,
        calves: subPartScores.calves,
        abs: subPartScores.abs,

        // ── Expanded alias keys (LoeweMuscleSculpture getScore uses these) ──
        left_shoulder:  resolve(shoulderScore, macroScores.shoulders),
        right_shoulder: resolve(shoulderScore, macroScores.shoulders),
        left_arm:       resolve(armsScore, macroScores.arms),
        right_arm:      resolve(armsScore, macroScores.arms),
        left_leg:       resolve(legsScore, macroScores.legs),
        right_leg:      resolve(legsScore, macroScores.legs),
        upper_back:     resolve(avgOf('lats', 'traps', 'mid_back'), macroScores.back),
        glute:          resolve(subPartScores.glutes, macroScores.legs),

        // ── Simple macro keys (dashboards, legacy) ──
        chest:     resolve(chestScore, macroScores.chest),
        back:      resolve(backScore, macroScores.back),
        shoulders: resolve(shoulderScore, macroScores.shoulders),
        arms:      resolve(armsScore, macroScores.arms),
        core:      resolve(coreScore, macroScores.core),
        legs:      resolve(legsScore, macroScores.legs),
    };
};

/**
 * Fetch recovery scores from server, fallback to local calculation.
 */
export const fetchMuscleRecoveryScores = async (userId) => {
    try {
        const response = await fetch(`http://${window.location.hostname}:8000/api/user/recovery/${userId}`);
        if (!response.ok) throw new Error('API Error');
        const data = await response.json();
        const scores = data.scores || {};
        const local = getMuscleRecoveryScores(userId);
        // Merge: server overrides local for keys it provides
        return { ...local, ...scores };
    } catch (error) {
        console.error("[Recovery v3] Server unavailable, using local:", error);
        return getMuscleRecoveryScores(userId);
    }
};

/**
 * Get detailed recovery info (for tooltips, recovery page, etc.)
 */
export const getMuscleRecoveryDetails = (userId) => {
    const storageKey = `muscle_training_v3_${userId}`;
    const fineData = readJSON(storageKey, {});
    const now = Date.now();

    const details = {};

    ALL_SUBPARTS.forEach(subPart => {
        const records = fineData[subPart] || [];
        if (records.length === 0) {
            /* ⚠️ tracked:false —— 「沒練過」不是「完全恢復」。score 照樣給 100 是為了
               讓下游的數學不炸，但畫面必須看 tracked 決定要不要顯示，
               否則一次都沒練的人會看到滿排 100% 可訓練。 */
            details[subPart] = { status: 'ready', score: 100, tracked: false, lastTraining: null, hoursUntilRecovery: 0, exercises: [] };
        } else {
            const last = records[records.length - 1];
            const hoursSince = (now - last.timestamp) / (1000 * 60 * 60);
            const fullHours = SUBPART_RECOVERY_HOURS[subPart] || DEFAULT_RECOVERY_HOURS;
            const volumeFactor = volumeFactorOf(last.volume);
            const score = calculateRecoveryScore(hoursSince, fullHours, volumeFactor);
            const full = fullHours * volumeFactor;

            let status = 'ready';
            if (score < 35) status = 'fatigued';
            else if (score < 65) status = 'recovering';
            else if (score < 100) status = 'almost_ready';

            details[subPart] = {
                tracked: true,
                status, score,
                lastTraining: new Date(last.timestamp),
                hoursSinceTraining: Math.round(hoursSince),
                hoursUntilRecovery: Math.max(0, Math.round(full - hoursSince)),
                exercises: last.exercises || [],
                volume: last.volume || 0,
            };
        }
    });

    return details;
};

// ════════════════════════════════════════
// EXPORTS (Backward Compatible)
// ════════════════════════════════════════

// Legacy keyword map (kept for any consumer still importing it)
export const MUSCLE_KEYWORDS = {
    chest: ['chest', 'bench', 'push up', 'push-up', 'pushup', 'pec', 'fly', '胸', '臥推'],
    back: ['back', 'row', 'pull up', 'pulldown', 'lat', 'deadlift', '背', '划船', '引體', '下拉', '硬舉'],
    shoulders: ['shoulder', 'delt', 'overhead press', 'lateral raise', '肩', '推舉', '側平舉'],
    arms: ['bicep', 'tricep', 'curl', 'extension', '二頭', '三頭', '手臂', '彎舉'],
    core: ['core', 'plank', 'crunch', 'ab ', 'abs', '核心', '腹', '捲腹'],
    legs: ['leg', 'squat', 'lunge', 'calf', 'glute', 'hip thrust', 'hamstring', 'quad', '腿', '深蹲', '臀'],
};

export const RECOVERY_CONFIG = {
    FULL_RECOVERY: 48,
    FATIGUE_THRESHOLD: 6,
    RECOVERING_THRESHOLD: 24,
};

export default {
    getMuscleRecoveryScores,
    fetchMuscleRecoveryScores,
    getMuscleRecoveryDetails,
    recordWorkoutCompletion,
    detectMusclesFromExercise,
    MUSCLE_KEYWORDS,
    RECOVERY_CONFIG,
};

// ════════════════════════════════════════
// 6. 準備度（readiness）
// ════════════════════════════════════════
/**
 * 「準備度」到底是什麼：最近這幾天的訓練把身體壓到什麼程度、現在恢復到哪。
 *
 * ⚠️ 它只在「有訓練紀錄」時才有意義。
 *    以前的算法是把 9 塊肌肉的分數平均 —— 而沒練過的肌肉一律算 100，
 *    所以一次都沒練的人會拿到「準備度 100 · 恢復 極佳」。
 *    那不是「你恢復得很好」，是「我們沒看過你訓練」。兩件事差很多，
 *    而且後者不該用一個滿分數字來表示。
 *
 * 所以：只把「真的練過」的肌群納入平均；一塊都沒有就回 null，
 * 由畫面改顯示「去練一場」而不是一個數字。
 *
 * @param {object} scores getMuscleRecoveryScores() 的回傳
 * @returns {{score:number, from:number}|null}
 */
export const readinessFromScores = (scores) => {
    const tracked = scores?._tracked;
    if (!tracked) return null;
    const keys = Object.keys(tracked).filter(k => tracked[k] && Number.isFinite(scores[k]));
    if (keys.length === 0) return null;
    const sum = keys.reduce((a, k) => a + Number(scores[k]), 0);
    return { score: Math.round(sum / keys.length), from: keys.length };
};

/* ⚠️ readinessLabel 已經搬到 utils/readiness.js —— 準備度現在不只看訓練負荷，
   還會併入睡眠與 HRV，門檻文字只能有一份定義。這裡不再重複一份。 */
