/**
 * UnifiedTrainingEngine  v9.1
 * ═══════════════════════════════════════════════════════════════
 *
 * MUSCLE BALANCE GUARANTEES
 * ─────────────────────────
 * #Chest     → flat bench (mid) + incline (upper) — always both
 * #Back      → vertical pull (lats width) + horizontal row (thickness) — always both
 * #Shoulders → press (front/mid) + lateral raise (mid) + rear delt — all 3 heads
 * #Arms      → biceps:2 + triceps:2 — always 2 each, balanced
 * #Legs      → squat pattern (quads) + hip hinge (hamstrings) — always both
 * #Glutes    → hip thrusts (T1, non-negotiable) + RDL + isolation
 * #Core      → cross-day append (flexion + anti-extension + rotation)
 *
 * TIER SYSTEM
 * ───────────
 * Tier 1 — Mainstream primary compounds (Bench, Squat, Deadlift, OHP, Row, PullUps)
 * Tier 2 — Secondary compounds / important variants
 * Tier 3 — Isolation / accessory movements
 * Tier 4 — Corrective / rehab
 *
 * EXERCISE ORDERING WITHIN SESSION
 * ─────────────────────────────────
 * Same-muscle exercises grouped together. Within each muscle: T1→T2→T3.
 * Corrective (T4) at front if problem tag, else at tail.
 *
 * SUPERSET SYSTEM (v9.1)
 * ──────────────────────
 * Trigger A (Efficiency): sessionDuration ≤ 45 min && level !== 'beginner'
 *   → Antagonist superset (e.g. Biceps+Triceps, Chest+Back) — pack more volume in less time
 * Trigger B (Intensity): level === 'advanced'
 *   → T3 isolation superset (same-muscle burnout) — metabolic stress, increased pump
 * Powerlifting style: ALWAYS disables superset — ATP recovery requires full rest (3-5 min)
 * Superset pairs tagged with supersetId, rest:'0s', and a coach note for the UI.
 * ═══════════════════════════════════════════════════════════════
 */

// 🌐 共用中文命名表（與 planFusionEngine 同步，單一真相來源）
import { SPLIT_FOCUS, withBoostedFocus } from './planNaming';
// 🈶 英文動作名 → 中文在地化（生成引擎動作庫為英文，輸出時譯成中文與全站一致）
import { toZhExerciseName } from './exerciseNameZh';

const C = 'compound', I = 'isolation', R = 'corrective';

// ─── WARMUP LIBRARY ──────────────────────────────────────────
const WARMUP_LIBRARY = [
    { name: 'Arm Circles', zone: 'upper', time: 1.5, reps: '20 each', eq: 'bodyweight' },
    { name: 'Wall Slides', zone: 'upper', time: 1.5, reps: '10', eq: 'bodyweight' },
    { name: 'Scapular Push Up', zone: 'upper', time: 1.5, reps: '10', eq: 'bodyweight' },
    { name: 'Shoulder Dislocates', zone: 'upper', time: 1.5, reps: '10', eq: 'bodyweight' },
    { name: 'Band Pull Apart', zone: 'upper', time: 1.5, reps: '15', eq: 'bodyweight' },
    { name: 'Dead Hang', zone: 'upper', time: 1, reps: '30s', eq: 'bodyweight' },
    { name: 'Thoracic Rotation', zone: 'upper', time: 1.5, reps: '10 each', eq: 'bodyweight' },
    { name: 'Cat Cow', zone: 'upper', time: 1, reps: '10', eq: 'bodyweight' },
    { name: 'Hip Flexor Stretch', zone: 'lower', time: 1.5, reps: '30s each', eq: 'bodyweight' },
    { name: 'Glute Bridge (warm-up)', zone: 'lower', time: 1.5, reps: '12', eq: 'bodyweight' },
    { name: 'Leg Swing', zone: 'lower', time: 1, reps: '15 each', eq: 'bodyweight' },
    { name: "World's Greatest Stretch", zone: 'lower', time: 1.5, reps: '6 each', eq: 'bodyweight' },
    { name: 'Bodyweight Squat', zone: 'lower', time: 1.5, reps: '15', eq: 'bodyweight' },
    { name: 'Fire Hydrants', zone: 'lower', time: 1, reps: '12 each', eq: 'bodyweight' },
    { name: 'Ankle Circles', zone: 'lower', time: 1, reps: '10 each', eq: 'bodyweight' },
    { name: 'Jumping Jacks', zone: 'full', time: 1.5, reps: '30s', eq: 'bodyweight' },
    { name: 'Inchworm', zone: 'full', time: 1.5, reps: '8', eq: 'bodyweight' },
    { name: 'High Knees', zone: 'full', time: 1, reps: '30s', eq: 'bodyweight' },
    { name: 'Mountain Climbers (slow)', zone: 'full', time: 1, reps: '10 each', eq: 'bodyweight' },
];

// ─── EXERCISE LIBRARY ────────────────────────────────────────
// time formula: (n_sets × exec_secs + (n-1) × rest_secs) / 60, rounded
// compound exec ~25s/set, isolation exec ~18s/set

const MUSCLE_ZONES = {
    chest: ['chest-mid', 'chest-upper'], // 🛑 移除 'chest-lower'，讓下胸從保底必修變為選修
    shoulders: ['shoulders-press', 'shoulders-lateral', 'shoulders-rear', 'shoulders-front'], // 🔧 v9.2: 補上前束 zone，讓 Front Raise 可被 fillByTime 自然抽選
    back: ['back-lats', 'back-mid', 'back-lower'],
    biceps: ['biceps'],
    triceps: ['triceps'],
    quads: ['quads-squat', 'quads-iso'],           // 🔧 v9.2: 補上 Leg Extensions / Reverse Nordic 等孤立 zone
    hamstrings: ['hamstrings-hinge', 'hamstrings-iso'], // 🔧 v9.2: 補上 Lying Leg Curls 等孤立 zone
    glutes: ['glutes-thrust', 'glutes-iso', 'glutes-abduct'], // 🔧 v9.2: 補上 Cable Kickback / Hip Abduction / Clamshells 等 zone
    core: ['core'],
    calves: ['calves'],
};

const CHEST = [
    { name: 'Barbell Bench Press', zone: 'chest-mid', muscle: 'chest', cat: C, tier: 1, cns: 'high', sets: 4, reps: '5-8', rest: '120s', time: 8, diff: 2, eq: 'barbell' },
    { name: 'Incline Barbell Press', zone: 'chest-upper', muscle: 'chest', cat: C, tier: 1, cns: 'high', sets: 4, reps: '6-10', rest: '120s', time: 8, diff: 2, eq: 'barbell' },
    { name: 'Machine Chest Press', zone: 'chest-mid', muscle: 'chest', cat: C, tier: 1, cns: 'medium', sets: 3, reps: '8-12', rest: '90s', time: 5, diff: 0, eq: 'machine' },
    { name: 'Dumbbell Bench Press', zone: 'chest-mid', muscle: 'chest', cat: C, tier: 2, cns: 'medium', sets: 3, reps: '8-12', rest: '90s', time: 5, diff: 1, eq: 'dumbbell' },
    { name: 'Incline Dumbbell Press', zone: 'chest-upper', muscle: 'chest', cat: C, tier: 2, cns: 'medium', sets: 3, reps: '10-12', rest: '90s', time: 5, diff: 1, eq: 'dumbbell' },

    // 🛑 [修復點 1] 下胸複合動作降級為 Tier 3，不再搶佔黃金複合推配額
    { name: 'Decline Bench Press', zone: 'chest-lower', muscle: 'chest', cat: C, tier: 3, cns: 'high', sets: 3, reps: '8-12', rest: '90s', time: 5, diff: 2, eq: 'barbell' },
    { name: 'Chest Dips', zone: 'chest-lower', muscle: 'chest', cat: C, tier: 3, cns: 'medium', sets: 3, reps: '8-12', rest: '90s', time: 5, diff: 2, eq: 'bodyweight' },

    { name: 'Push Ups', zone: 'chest-mid', muscle: 'chest', cat: C, tier: 2, cns: 'low', sets: 3, reps: '12-20', rest: '60s', time: 3, diff: 0, eq: 'bodyweight' },
    // ➕ [徒手庫補強] 腳墊高伏地挺身：徒手唯一的「上胸」動作，補齊居家胸肌上/中平衡保證
    { name: 'Decline Push Ups', zone: 'chest-upper', muscle: 'chest', cat: C, tier: 2, cns: 'low', sets: 3, reps: '10-15', rest: '60s', time: 3, diff: 1, eq: 'bodyweight' },

    // 🛑 [修復點 2] 繩索夾胸升級為 Tier 2，確保中階訓練者在第2/第3動作時優先抽到夾胸
    // 🔧 [冗餘合併] 移除 'Cable Crossover' 與 'Low Cable Fly'：與 Seated Cable Fly 同為「繩索夾胸」，
    //    僅手部交叉/角度微差(真實健身資料佐證機制幾乎相同)，保留一個代表即可，避免動作庫雜訊。
    { name: 'Seated Cable Fly', zone: 'chest-mid', muscle: 'chest', cat: I, tier: 2, cns: 'low', sets: 3, reps: '12-15', rest: '60s', time: 3, diff: 1, eq: 'cable' },

    { name: 'Pec Deck Fly', zone: 'chest-mid', muscle: 'chest', cat: I, tier: 3, cns: 'low', sets: 3, reps: '12-15', rest: '60s', time: 3, diff: 0, eq: 'machine' },
    { name: 'Dumbbell Fly', zone: 'chest-mid', muscle: 'chest', cat: I, tier: 3, cns: 'low', sets: 3, reps: '12-15', rest: '60s', time: 3, diff: 1, eq: 'dumbbell' },
    // ➕ [2026-09 動作庫補強] 關節受限／居家時原本沒得選 → 同部位沒動作可排或整週重複同一個
    { name: 'Band Chest Press', zone: 'chest-mid', muscle: 'chest', cat: C, tier: 2, cns: 'low', sets: 3, reps: '12-15', rest: '60s', time: 3, diff: 0, eq: 'band' },
    { name: 'Neutral Grip Push Ups', zone: 'chest-mid', muscle: 'chest', cat: C, tier: 2, cns: 'low', sets: 3, reps: '10-15', rest: '60s', time: 3, diff: 1, eq: 'bodyweight' },
    { name: 'Incline Push Ups', zone: 'chest-mid', muscle: 'chest', cat: C, tier: 3, cns: 'low', sets: 3, reps: '12-20', rest: '60s', time: 3, diff: 0, eq: 'bodyweight' },
    { name: 'Dumbbell Floor Press', zone: 'chest-mid', muscle: 'chest', cat: C, tier: 2, cns: 'medium', sets: 3, reps: '8-12', rest: '90s', time: 5, diff: 1, eq: 'dumbbell' },
    { name: 'Band Chest Fly', zone: 'chest-mid', muscle: 'chest', cat: I, tier: 3, cns: 'low', sets: 3, reps: '12-15', rest: '45s', time: 3, diff: 0, eq: 'band' },
];
const SHOULDERS = [
    { name: 'Barbell Overhead Press', zone: 'shoulders-press', muscle: 'shoulders', cat: C, tier: 1, cns: 'high', sets: 4, reps: '5-8', rest: '120s', time: 8, diff: 2, eq: 'barbell' },
    { name: 'Machine Shoulder Press', zone: 'shoulders-press', muscle: 'shoulders', cat: C, tier: 1, cns: 'medium', sets: 3, reps: '8-12', rest: '90s', time: 5, diff: 0, eq: 'machine' },
    { name: 'Dumbbell Overhead Press', zone: 'shoulders-press', muscle: 'shoulders', cat: C, tier: 2, cns: 'medium', sets: 3, reps: '8-12', rest: '90s', time: 5, diff: 1, eq: 'dumbbell' },
    // ➕ [徒手庫補強] 居家「肩推模式」過去完全缺失（只有側平舉/面拉）→ 徒手肩日沒有主項
    { name: 'Pike Push Ups', zone: 'shoulders-press', muscle: 'shoulders', cat: C, tier: 2, cns: 'medium', sets: 3, reps: '8-12', rest: '75s', time: 4, diff: 2, eq: 'bodyweight' },
    { name: 'Band Shoulder Press', zone: 'shoulders-press', muscle: 'shoulders', cat: C, tier: 2, cns: 'low', sets: 3, reps: '12-15', rest: '60s', time: 3, diff: 0, eq: 'band' },
    { name: 'Arnold Press', zone: 'shoulders-press', muscle: 'shoulders', cat: C, tier: 2, cns: 'medium', sets: 3, reps: '10-12', rest: '90s', time: 5, diff: 1, eq: 'dumbbell' },
    { name: 'Dumbbell Lateral Raise', zone: 'shoulders-lateral', muscle: 'shoulders', cat: I, tier: 2, cns: 'low', sets: 4, reps: '12-15', rest: '60s', time: 4, diff: 0, eq: 'dumbbell' }, // mid delt
    { name: 'Cable Lateral Raise', zone: 'shoulders-lateral', muscle: 'shoulders', cat: I, tier: 2, cns: 'low', sets: 3, reps: '12-15', rest: '60s', time: 3, diff: 0, eq: 'cable' },    // mid delt
    { name: 'Band Lateral Raise', zone: 'shoulders-lateral', muscle: 'shoulders', cat: I, tier: 3, cns: 'low', sets: 3, reps: '15-20', rest: '45s', time: 3, diff: 0, eq: 'band' },     // mid delt
    { name: 'Front Raise', zone: 'shoulders-front', muscle: 'shoulders', cat: I, tier: 3, cns: 'low', sets: 3, reps: '12-15', rest: '60s', time: 3, diff: 0, eq: 'dumbbell' }, // front delt
    { name: 'Reverse Pec Deck', zone: 'shoulders-rear', muscle: 'shoulders', cat: I, tier: 2, cns: 'low', sets: 3, reps: '12-15', rest: '60s', time: 3, diff: 0, eq: 'machine' },  // rear delt
    { name: 'Reverse Cable Crossover', zone: 'shoulders-rear', muscle: 'shoulders', cat: I, tier: 2, cns: 'low', sets: 3, reps: '12-15', rest: '60s', time: 3, diff: 1, eq: 'cable' },    // rear delt
    { name: 'Face Pulls', zone: 'shoulders-rear', muscle: 'shoulders', cat: R, tier: 2, cns: 'low', sets: 3, reps: '15-20', rest: '45s', time: 3, diff: 0, eq: 'cable' },    // rear delt
    { name: 'Band Face Pull', zone: 'shoulders-rear', muscle: 'shoulders', cat: R, tier: 3, cns: 'low', sets: 3, reps: '15-20', rest: '30s', time: 2, diff: 0, eq: 'band' },     // rear delt
    { name: 'External Rotation', zone: 'shoulders-rear', muscle: 'shoulders', cat: R, tier: 4, cns: 'low', sets: 3, reps: '15', rest: '30s', time: 2, diff: 0, eq: 'band' },
    { name: 'Band Pull Apart', zone: 'shoulders-rear', muscle: 'shoulders', cat: R, tier: 4, cns: 'low', sets: 3, reps: '20', rest: '30s', time: 2, diff: 0, eq: 'band' },
    // ➕ [2026-09 動作庫補強] 關節受限／居家時原本沒得選 → 同部位沒動作可排或整週重複同一個
    { name: 'Dumbbell Rear Delt Fly', zone: 'shoulders-rear', muscle: 'shoulders', cat: I, tier: 2, cns: 'low', sets: 3, reps: '12-15', rest: '60s', time: 3, diff: 0, eq: 'dumbbell' },
    { name: 'Band Rear Delt Fly', zone: 'shoulders-rear', muscle: 'shoulders', cat: I, tier: 3, cns: 'low', sets: 3, reps: '15-20', rest: '45s', time: 2, diff: 0, eq: 'band' },
    { name: 'Prone Y Raise', zone: 'shoulders-rear', muscle: 'shoulders', cat: I, tier: 3, cns: 'low', sets: 3, reps: '12-15', rest: '45s', time: 2, diff: 0, eq: 'bodyweight' },
];
const TRICEPS = [
    { name: 'Close Grip Bench Press', zone: 'triceps', muscle: 'triceps', cat: C, tier: 2, cns: 'medium', sets: 3, reps: '8-12', rest: '90s', time: 5, diff: 2, eq: 'barbell' },
    { name: 'Skull Crushers', zone: 'triceps', muscle: 'triceps', cat: I, tier: 2, cns: 'medium', sets: 3, reps: '8-12', rest: '75s', time: 4, diff: 1, eq: 'barbell' },
    { name: 'Overhead Cable Extension', zone: 'triceps', muscle: 'triceps', cat: I, tier: 2, cns: 'low', sets: 3, reps: '10-12', rest: '60s', time: 3, diff: 0, eq: 'cable' },
    { name: 'Tricep Dips', zone: 'triceps', muscle: 'triceps', cat: C, tier: 2, cns: 'medium', sets: 3, reps: '10-15', rest: '75s', time: 4, diff: 1, eq: 'bodyweight' },
    // ↕ tier 修正：Pushdown 是健身房最普遍的三頭主力孤立動作，由 Tier 3 → Tier 2
    // 🔧 [冗餘合併] 移除 'Rope Pushdown'：與 Tricep Pushdown 同為繩索下壓，僅握把差異(真實資料佐證
    //    機制近乎相同)，保留 Tricep Pushdown 一個代表即可。
    { name: 'Tricep Pushdown', zone: 'triceps', muscle: 'triceps', cat: I, tier: 2, cns: 'low', sets: 3, reps: '10-15', rest: '60s', time: 3, diff: 0, eq: 'cable' },
    // ➕ 新增：Diamond Push Ups — ACE 研究三頭活性最高的徒手動作，居家常見
    { name: 'Diamond Push Ups', zone: 'triceps', muscle: 'triceps', cat: C, tier: 3, cns: 'low', sets: 3, reps: '10-15', rest: '60s', time: 3, diff: 1, eq: 'bodyweight' },
    // ↕ tier 修正：過頭伸展對三頭長頭刺激最佳 (研究比下壓多 ~50% 長頭生長)，由 Tier 3 → Tier 2
    { name: 'Overhead Tricep Extension', zone: 'triceps', muscle: 'triceps', cat: I, tier: 2, cns: 'low', sets: 3, reps: '10-12', rest: '60s', time: 3, diff: 0, eq: 'dumbbell' },
    { name: 'Band Tricep Extension', zone: 'triceps', muscle: 'triceps', cat: I, tier: 3, cns: 'low', sets: 3, reps: '12-15', rest: '45s', time: 3, diff: 0, eq: 'band' },
    // ➕ [徒手庫補強] 板凳撐體：比雙槓撐容易的入門三頭複合，居家用椅子即可
    { name: 'Bench Dips', zone: 'triceps', muscle: 'triceps', cat: C, tier: 3, cns: 'low', sets: 3, reps: '10-15', rest: '60s', time: 3, diff: 0, eq: 'bodyweight' },
    // ➕ [2026-09 動作庫補強] 關節受限／居家時原本沒得選 → 同部位沒動作可排或整週重複同一個
    { name: 'Band Pushdown', zone: 'triceps', muscle: 'triceps', cat: I, tier: 3, cns: 'low', sets: 3, reps: '15-20', rest: '45s', time: 3, diff: 0, eq: 'band' },
    { name: 'Dumbbell Kickback', zone: 'triceps', muscle: 'triceps', cat: I, tier: 3, cns: 'low', sets: 3, reps: '12-15', rest: '45s', time: 3, diff: 0, eq: 'dumbbell' },
];
const BACK = [
    { name: 'Deadlift', zone: 'back-lower', muscle: 'back', cat: C, tier: 1, cns: 'extreme', sets: 4, reps: '4-6', rest: '180s', time: 11, diff: 3, eq: 'barbell' },
    { name: 'Barbell Row', zone: 'back-mid', muscle: 'back', cat: C, tier: 1, cns: 'high', sets: 4, reps: '6-10', rest: '120s', time: 8, diff: 2, eq: 'barbell' },
    { name: 'Pull Ups', zone: 'back-lats', muscle: 'back', cat: C, tier: 1, cns: 'high', sets: 4, reps: '5-10', rest: '120s', time: 8, diff: 2, eq: 'bodyweight' },
    { name: 'Chest Supported Row', zone: 'back-mid', muscle: 'back', cat: C, tier: 1, cns: 'medium', sets: 3, reps: '8-12', rest: '90s', time: 5, diff: 1, eq: 'machine' },
    { name: 'Wide Grip Lat Pulldown', zone: 'back-lats', muscle: 'back', cat: C, tier: 2, cns: 'medium', sets: 4, reps: '8-12', rest: '90s', time: 7, diff: 1, eq: 'cable' },
    { name: 'Neutral Grip Lat Pulldown', zone: 'back-lats', muscle: 'back', cat: C, tier: 2, cns: 'medium', sets: 3, reps: '10-12', rest: '90s', time: 5, diff: 1, eq: 'cable' },
    { name: 'Chin Ups', zone: 'back-lats', muscle: 'back', cat: C, tier: 2, cns: 'medium', sets: 3, reps: '6-10', rest: '120s', time: 7, diff: 2, eq: 'bodyweight' },
    { name: 'Seated Cable Row', zone: 'back-mid', muscle: 'back', cat: C, tier: 2, cns: 'medium', sets: 3, reps: '10-12', rest: '90s', time: 5, diff: 1, eq: 'cable' },
    { name: 'Single Arm Dumbbell Row', zone: 'back-mid', muscle: 'back', cat: C, tier: 2, cns: 'medium', sets: 3, reps: '10-12', rest: '75s', time: 5, diff: 1, eq: 'dumbbell' },
    { name: 'T-Bar Row', zone: 'back-mid', muscle: 'back', cat: C, tier: 2, cns: 'high', sets: 3, reps: '8-12', rest: '90s', time: 5, diff: 2, eq: 'barbell' },
    { name: 'Band Row', zone: 'back-mid', muscle: 'back', cat: C, tier: 2, cns: 'low', sets: 3, reps: '12-15', rest: '60s', time: 4, diff: 0, eq: 'band' },
    // ➕ [徒手庫補強] 反向划船：徒手水平拉主力（桌下/單槓即可），居家背厚度不再只剩彈力帶
    { name: 'Inverted Row', zone: 'back-mid', muscle: 'back', cat: C, tier: 2, cns: 'medium', sets: 3, reps: '8-12', rest: '75s', time: 4, diff: 1, eq: 'bodyweight' },
    // ➕ [徒手庫補強] 彈力帶下拉：沒有單槓也能練垂直拉（背闊寬度），新手徒手背日的救星
    { name: 'Band Lat Pulldown', zone: 'back-lats', muscle: 'back', cat: C, tier: 2, cns: 'low', sets: 3, reps: '12-15', rest: '60s', time: 3, diff: 0, eq: 'band' },
    { name: 'Straight Arm Pulldown', zone: 'back-lats', muscle: 'back', cat: I, tier: 3, cns: 'low', sets: 3, reps: '12-15', rest: '60s', time: 3, diff: 0, eq: 'cable' },
    // 🔧 [常見度審查] 移除 'Cable Lat Pullover'：與 Straight Arm Pulldown 同為「直臂下拉」模式的
    //    冷門變體（教練實務只開其中一個），保留 Straight Arm Pulldown 一個代表即可。
    { name: 'Hyperextensions', zone: 'back-lower', muscle: 'back', cat: I, tier: 3, cns: 'low', sets: 3, reps: '12-15', rest: '60s', time: 3, diff: 0, eq: 'machine' },
    { name: 'Bird Dog', zone: 'core', muscle: 'back', cat: R, tier: 4, cns: 'low', sets: 3, reps: '10 each', rest: '30s', time: 2, diff: 0, eq: 'bodyweight' },
    { name: 'Superman Hold', zone: 'core', muscle: 'back', cat: R, tier: 4, cns: 'low', sets: 3, reps: '10', rest: '30s', time: 2, diff: 0, eq: 'bodyweight' },
    { name: 'Cat Cow', zone: 'core', muscle: 'back', cat: R, tier: 4, cns: 'low', sets: 3, reps: '10', rest: '20s', time: 2, diff: 0, eq: 'bodyweight' },
];
const BICEPS = [
    { name: 'Barbell Bicep Curl', zone: 'biceps', muscle: 'biceps', cat: I, tier: 2, cns: 'medium', sets: 3, reps: '8-12', rest: '75s', time: 4, diff: 1, eq: 'barbell' },
    { name: 'EZ Bar Curl', zone: 'biceps', muscle: 'biceps', cat: I, tier: 2, cns: 'low', sets: 3, reps: '10-12', rest: '60s', time: 3, diff: 1, eq: 'barbell' },
    { name: 'Dumbbell Bicep Curl', zone: 'biceps', muscle: 'biceps', cat: I, tier: 2, cns: 'low', sets: 3, reps: '10-12', rest: '60s', time: 3, diff: 0, eq: 'dumbbell' },
    { name: 'Hammer Curls', zone: 'biceps', muscle: 'biceps', cat: I, tier: 2, cns: 'low', sets: 3, reps: '10-12', rest: '60s', time: 3, diff: 0, eq: 'dumbbell' },
    { name: 'Preacher Curls', zone: 'biceps', muscle: 'biceps', cat: I, tier: 2, cns: 'low', sets: 3, reps: '10-12', rest: '60s', time: 3, diff: 1, eq: 'machine' },
    // ➕ 新增：Incline Curl 是研究公認上二頭最佳孤立動作 (伸展位刺激)，常見且重要 → Tier 2
    { name: 'Incline Dumbbell Curl', zone: 'biceps', muscle: 'biceps', cat: I, tier: 2, cns: 'low', sets: 3, reps: '10-12', rest: '60s', time: 3, diff: 1, eq: 'dumbbell' },
    // ➕ 新增：Concentration Curl — 經典短頭孤立動作，健身房常見
    { name: 'Concentration Curl', zone: 'biceps', muscle: 'biceps', cat: I, tier: 3, cns: 'low', sets: 3, reps: '12-15', rest: '45s', time: 3, diff: 0, eq: 'dumbbell' },
    { name: 'Cable Curl', zone: 'biceps', muscle: 'biceps', cat: I, tier: 3, cns: 'low', sets: 3, reps: '12-15', rest: '45s', time: 3, diff: 0, eq: 'cable' },
    { name: 'Band Bicep Curl', zone: 'biceps', muscle: 'biceps', cat: I, tier: 3, cns: 'low', sets: 3, reps: '12-15', rest: '45s', time: 3, diff: 0, eq: 'band' },
    // ➕ [徒手庫補強] 彈力帶錘式彎舉：居家二頭第二選擇，避免整週重複同一個彎舉
    { name: 'Band Hammer Curl', zone: 'biceps', muscle: 'biceps', cat: I, tier: 3, cns: 'low', sets: 3, reps: '12-15', rest: '45s', time: 3, diff: 0, eq: 'band' },
];
const LEGS = [
    { name: 'Barbell Back Squat', zone: 'quads-squat', muscle: 'quads', cat: C, tier: 1, cns: 'extreme', sets: 4, reps: '5-8', rest: '180s', time: 11, diff: 3, eq: 'barbell' },
    { name: 'Barbell Front Squat', zone: 'quads-squat', muscle: 'quads', cat: C, tier: 1, cns: 'extreme', sets: 4, reps: '5-8', rest: '180s', time: 11, diff: 3, eq: 'barbell' },
    { name: 'Hack Squat', zone: 'quads-squat', muscle: 'quads', cat: C, tier: 1, cns: 'high', sets: 4, reps: '8-12', rest: '90s', time: 7, diff: 1, eq: 'machine' },
    { name: 'Leg Press', zone: 'quads-squat', muscle: 'quads', cat: C, tier: 2, cns: 'medium', sets: 3, reps: '10-15', rest: '90s', time: 5, diff: 1, eq: 'machine' },
    { name: 'Smith Machine Squat', zone: 'quads-squat', muscle: 'quads', cat: C, tier: 2, cns: 'medium', sets: 3, reps: '10-12', rest: '90s', time: 5, diff: 1, eq: 'machine' },
    { name: 'Bulgarian Split Squat', zone: 'quads-squat', muscle: 'quads', cat: C, tier: 2, cns: 'medium', sets: 3, reps: '8-12', rest: '90s', time: 5, diff: 2, eq: 'dumbbell' },
    { name: 'Goblet Squat', zone: 'quads-squat', muscle: 'quads', cat: C, tier: 2, cns: 'medium', sets: 3, reps: '10-12', rest: '90s', time: 5, diff: 0, eq: 'dumbbell' },
    { name: 'Walking Lunges', zone: 'quads-squat', muscle: 'quads', cat: C, tier: 2, cns: 'medium', sets: 3, reps: '10-12', rest: '75s', time: 5, diff: 1, eq: 'dumbbell' },
    { name: 'Bodyweight Squat', zone: 'quads-squat', muscle: 'quads', cat: C, tier: 3, cns: 'low', sets: 3, reps: '15-20', rest: '60s', time: 3, diff: 0, eq: 'bodyweight' },
    // ➕ [徒手庫補強] 後弓步蹲：徒手單邊蹲模式，比走路弓步穩、比保加利亞蹲友善
    { name: 'Reverse Lunge', zone: 'quads-squat', muscle: 'quads', cat: C, tier: 2, cns: 'medium', sets: 3, reps: '10-12', rest: '75s', time: 4, diff: 1, eq: 'bodyweight' },
    { name: 'Leg Extensions', zone: 'quads-iso', muscle: 'quads', cat: I, tier: 3, cns: 'low', sets: 3, reps: '12-15', rest: '60s', time: 3, diff: 0, eq: 'machine' },
    // ➕ [徒手庫補強] 靠牆深蹲(等長)：徒手股四頭孤立收尾
    { name: 'Wall Sit', zone: 'quads-iso', muscle: 'quads', cat: I, tier: 3, cns: 'low', sets: 3, reps: '30-45s', rest: '45s', time: 3, diff: 0, eq: 'bodyweight' },
    { name: 'Romanian Deadlift', zone: 'hamstrings-hinge', muscle: 'hamstrings', cat: C, tier: 1, cns: 'high', sets: 4, reps: '8-12', rest: '120s', time: 8, diff: 2, eq: 'barbell' },
    // ➕ 新增：Dumbbell RDL — 啞鈴版後鏈鉸鏈，居家/啞鈴使用者的主力後鏈動作
    { name: 'Dumbbell Romanian Deadlift', zone: 'hamstrings-hinge', muscle: 'hamstrings', cat: C, tier: 2, cns: 'medium', sets: 3, reps: '10-12', rest: '90s', time: 6, diff: 1, eq: 'dumbbell' },
    { name: 'Sumo Deadlift', zone: 'hamstrings-hinge', muscle: 'hamstrings', cat: C, tier: 2, cns: 'high', sets: 3, reps: '6-10', rest: '120s', time: 7, diff: 2, eq: 'barbell' },
    // ➕ 新增：Good Morning — 經典後鏈鉸鏈，EMG 研究中腿後活性高
    { name: 'Good Morning', zone: 'hamstrings-hinge', muscle: 'hamstrings', cat: C, tier: 2, cns: 'high', sets: 3, reps: '8-12', rest: '90s', time: 6, diff: 2, eq: 'barbell' },
    // ➕ 新增：Seated Leg Curl — 健身房腿後孤立首選 (研究顯示坐姿伸展位優於俯臥)，原本竟缺漏
    { name: 'Seated Leg Curl', zone: 'hamstrings-iso', muscle: 'hamstrings', cat: I, tier: 2, cns: 'low', sets: 3, reps: '10-15', rest: '60s', time: 4, diff: 0, eq: 'machine' },
    { name: 'Lying Leg Curls', zone: 'hamstrings-iso', muscle: 'hamstrings', cat: I, tier: 3, cns: 'low', sets: 3, reps: '10-12', rest: '60s', time: 3, diff: 0, eq: 'machine' },
    // ➕ [徒手庫補強] 居家「腿後」過去完全缺失（鉸鏈全是槓/啞鈴、彎舉全是機械）→ 徒手使用者練不到腿後
    { name: 'Single Leg Romanian Deadlift', zone: 'hamstrings-hinge', muscle: 'hamstrings', cat: C, tier: 2, cns: 'medium', sets: 3, reps: '10-12', rest: '60s', time: 4, diff: 1, eq: 'bodyweight' },
    { name: 'Sliding Leg Curl', zone: 'hamstrings-iso', muscle: 'hamstrings', cat: I, tier: 3, cns: 'medium', sets: 3, reps: '8-12', rest: '60s', time: 3, diff: 1, eq: 'bodyweight' },
    { name: 'Hip Thrusts', zone: 'glutes-thrust', muscle: 'glutes', cat: C, tier: 1, cns: 'high', sets: 4, reps: '10-15', rest: '90s', time: 7, diff: 1, eq: 'barbell' },
    { name: 'Single Leg Hip Thrust', zone: 'glutes-thrust', muscle: 'glutes', cat: C, tier: 2, cns: 'medium', sets: 3, reps: '10-12', rest: '75s', time: 5, diff: 2, eq: 'dumbbell' },
    { name: 'Step Ups', zone: 'glutes-thrust', muscle: 'glutes', cat: C, tier: 2, cns: 'medium', sets: 3, reps: '10-12', rest: '75s', time: 5, diff: 1, eq: 'dumbbell' },
    { name: '45° Back Extension', zone: 'glutes-thrust', muscle: 'glutes', cat: C, tier: 2, cns: 'medium', sets: 3, reps: '10-15', rest: '75s', time: 5, diff: 1, eq: 'machine' },
    { name: 'Cable Pull Through', zone: 'glutes-thrust', muscle: 'glutes', cat: C, tier: 2, cns: 'medium', sets: 3, reps: '12-15', rest: '60s', time: 4, diff: 1, eq: 'cable' },
    { name: 'Glute Bridge', zone: 'glutes-thrust', muscle: 'glutes', cat: C, tier: 2, cns: 'low', sets: 3, reps: '12-15', rest: '60s', time: 4, diff: 0, eq: 'bodyweight' },
    // ➕ [徒手庫補強] 單腳臀橋：徒手臀橋的進階單邊版，居家臀日不再只有一個動作
    { name: 'Single Leg Glute Bridge', zone: 'glutes-thrust', muscle: 'glutes', cat: C, tier: 2, cns: 'low', sets: 3, reps: '10-12', rest: '60s', time: 4, diff: 1, eq: 'bodyweight' },
    { name: 'Machine Hip Abduction', zone: 'glutes-abduct', muscle: 'glutes', cat: I, tier: 2, cns: 'low', sets: 3, reps: '12-15', rest: '60s', time: 3, diff: 0, eq: 'machine' },
    { name: 'Cable Kickback', zone: 'glutes-iso', muscle: 'glutes', cat: I, tier: 3, cns: 'low', sets: 3, reps: '12-15', rest: '45s', time: 3, diff: 0, eq: 'cable' },
    { name: 'Band Kickback', zone: 'glutes-iso', muscle: 'glutes', cat: I, tier: 3, cns: 'low', sets: 3, reps: '15-20', rest: '30s', time: 3, diff: 0, eq: 'band' },
    { name: 'Clamshells', zone: 'glutes-abduct', muscle: 'glutes', cat: R, tier: 4, cns: 'low', sets: 3, reps: '15 each', rest: '30s', time: 2, diff: 0, eq: 'band' },
    { name: 'Quadruped Hip Extension', zone: 'glutes-iso', muscle: 'glutes', cat: R, tier: 4, cns: 'low', sets: 3, reps: '12 each', rest: '30s', time: 2, diff: 0, eq: 'bodyweight' },
    { name: 'Calf Raises', zone: 'calves', muscle: 'calves', cat: I, tier: 3, cns: 'low', sets: 4, reps: '15-20', rest: '45s', time: 4, diff: 0, eq: 'machine' },
    { name: 'Seated Calf Raises', zone: 'calves', muscle: 'calves', cat: I, tier: 3, cns: 'low', sets: 3, reps: '15-20', rest: '45s', time: 3, diff: 0, eq: 'machine' },
    // ➕ [徒手庫補強] 單腳提踵：居家小腿過去完全缺失（兩個提踵都是機械）
    { name: 'Single Leg Calf Raise', zone: 'calves', muscle: 'calves', cat: I, tier: 3, cns: 'low', sets: 3, reps: '12-15', rest: '45s', time: 3, diff: 0, eq: 'bodyweight' },
    // ➕ [2026-09 動作庫補強] 關節受限／居家時原本沒得選 → 同部位沒動作可排或整週重複同一個
    { name: 'Band Good Morning', zone: 'hamstrings-hinge', muscle: 'hamstrings', cat: C, tier: 2, cns: 'low', sets: 3, reps: '12-15', rest: '60s', time: 4, diff: 0, eq: 'band' },
    { name: 'Band Leg Curl', zone: 'hamstrings-iso', muscle: 'hamstrings', cat: I, tier: 3, cns: 'low', sets: 3, reps: '12-15', rest: '45s', time: 3, diff: 0, eq: 'band' },
    { name: 'Frog Pump', zone: 'glutes-iso', muscle: 'glutes', cat: I, tier: 3, cns: 'low', sets: 3, reps: '20-25', rest: '45s', time: 3, diff: 0, eq: 'bodyweight' },
    { name: 'Band Hip Abduction', zone: 'glutes-abduct', muscle: 'glutes', cat: I, tier: 3, cns: 'low', sets: 3, reps: '15-20', rest: '45s', time: 3, diff: 0, eq: 'band' },
];
const CORE = [
    { name: 'Ab Wheel Rollout', zone: 'core', muscle: 'core', cat: C, tier: 2, cns: 'medium', sets: 3, reps: '8-12', rest: '75s', time: 4, diff: 2, eq: 'bodyweight' },
    { name: 'Hanging Leg Raise', zone: 'core', muscle: 'core', cat: C, tier: 2, cns: 'medium', sets: 3, reps: '10-15', rest: '75s', time: 4, diff: 2, eq: 'bodyweight' },
    { name: 'Cable Crunch', zone: 'core', muscle: 'core', cat: I, tier: 2, cns: 'low', sets: 3, reps: '12-15', rest: '60s', time: 3, diff: 1, eq: 'cable' },
    { name: 'Plank', zone: 'core', muscle: 'core', cat: C, tier: 2, cns: 'low', sets: 3, reps: '45-60s', rest: '60s', time: 3, diff: 0, eq: 'bodyweight' },
    { name: 'V-Up', zone: 'core', muscle: 'core', cat: I, tier: 3, cns: 'low', sets: 3, reps: '12-15', rest: '60s', time: 3, diff: 1, eq: 'bodyweight' },
    { name: 'Russian Twists', zone: 'core', muscle: 'core', cat: I, tier: 3, cns: 'low', sets: 3, reps: '20', rest: '45s', time: 3, diff: 1, eq: 'bodyweight' },
    { name: 'Bicycle Crunches', zone: 'core', muscle: 'core', cat: I, tier: 3, cns: 'low', sets: 3, reps: '20', rest: '45s', time: 3, diff: 0, eq: 'bodyweight' },
    { name: 'Leg Raises', zone: 'core', muscle: 'core', cat: I, tier: 3, cns: 'low', sets: 3, reps: '12-15', rest: '60s', time: 3, diff: 0, eq: 'bodyweight' },
    { name: 'Dead Bug', zone: 'core', muscle: 'core', cat: R, tier: 4, cns: 'low', sets: 3, reps: '8-10', rest: '30s', time: 2, diff: 0, eq: 'bodyweight' },
    { name: 'Side Plank', zone: 'core', muscle: 'core', cat: R, tier: 4, cns: 'low', sets: 3, reps: '30-45s', rest: '45s', time: 2, diff: 0, eq: 'bodyweight' },
    // ➕ [2026-09 動作庫補強] 關節受限／居家時原本沒得選 → 同部位沒動作可排或整週重複同一個
    { name: 'Pallof Press', zone: 'core', muscle: 'core', cat: I, tier: 2, cns: 'low', sets: 3, reps: '10-12', rest: '45s', time: 3, diff: 0, eq: 'band' },
    { name: 'Hollow Body Hold', zone: 'core', muscle: 'core', cat: I, tier: 3, cns: 'low', sets: 3, reps: '20-30s', rest: '45s', time: 3, diff: 1, eq: 'bodyweight' },
    { name: 'Reverse Crunch', zone: 'core', muscle: 'core', cat: I, tier: 3, cns: 'low', sets: 3, reps: '12-15', rest: '45s', time: 3, diff: 0, eq: 'bodyweight' },
];
const CORRECTIVE = [
    { name: 'Hip Flexor Stretch', muscle: 'hips', cat: R, tier: 4, sets: 2, reps: '30s each', rest: '20s', time: 2, diff: 0, eq: 'bodyweight' },
    { name: 'Ankle Mobility Drill', muscle: 'calves', cat: R, tier: 4, sets: 3, reps: '10 each', rest: '20s', time: 2, diff: 0, eq: 'bodyweight' },
    { name: 'Pigeon Pose', muscle: 'hips', cat: R, tier: 4, sets: 2, reps: '60s each', rest: '20s', time: 2, diff: 0, eq: 'bodyweight' },
    { name: 'Glute Bridge Hold', muscle: 'glutes', cat: R, tier: 4, sets: 3, reps: '30s', rest: '30s', time: 2, diff: 0, eq: 'bodyweight' },
    { name: 'Shoulder Dislocates', muscle: 'shoulders', cat: R, tier: 4, sets: 3, reps: '10', rest: '20s', time: 2, diff: 0, eq: 'band' },
    { name: 'Wall Slides', muscle: 'shoulders', cat: R, tier: 4, sets: 3, reps: '10', rest: '20s', time: 2, diff: 0, eq: 'bodyweight' },
];
export const ALL_EXERCISES = [...CHEST, ...SHOULDERS, ...TRICEPS, ...BACK, ...BICEPS, ...LEGS, ...CORE, ...CORRECTIVE];

// ─── 自動補全 location 欄位 ────────────────────────────────────
// location: 'home'  → bodyweight / band（居家可做）
//           'gym'   → barbell / cable / machine（需健身房器材）
//           'both'  → dumbbell（啞鈴，居家或健身房皆可）
ALL_EXERCISES.forEach(ex => {
    if (ex.location) return;
    if (ex.eq === 'bodyweight' || ex.eq === 'band') ex.location = 'home';
    else if (ex.eq === 'dumbbell') ex.location = 'both';
    else ex.location = 'gym'; // barbell, cable, machine
});

// 以動作名稱為 key 的查詢 Map，供前端 Picker 顯示正確屬性
export const ALL_EXERCISES_MAP = Object.fromEntries(ALL_EXERCISES.map(ex => [ex.name, ex]));


// ─── INJURY AVOIDANCE ────────────────────────────────────────
// 🩺 關節限制 → 應完全避開的高風險動作（教練安全紅線；涵蓋所有深蹲/推舉等變體，不只槓鈴版）
const INJURY_AVOID = {
    // 膝：避開所有深蹲類負重屈膝與膝伸（含黑克/徒手/高腳杯/分腿/上台階/腿伸/北歐）
    knee: ['Barbell Back Squat', 'Barbell Front Squat', 'Hack Squat', 'Smith Machine Squat',
        'Bodyweight Squat', 'Goblet Squat', 'Bulgarian Split Squat', 'Walking Lunges',
        'Leg Press', 'Leg Extensions', 'Step Ups', 'Reverse Lunge', 'Wall Sit'],
    // 背(下背)：避開所有脊椎承載的鉸鏈與彎腰划船
    back: ['Band Good Morning', 'Deadlift', 'Sumo Deadlift', 'Romanian Deadlift', 'Dumbbell Romanian Deadlift',
        'Single Leg Romanian Deadlift',
        'Good Morning', 'Barbell Row', 'T-Bar Row', 'Bent Over Barbell Row', 'Hyperextensions',
        '45° Back Extension', 'Barbell Back Squat', 'Barbell Front Squat'],
    // 肩：避開所有過頭推、臥推與雙槓撐（含啞鈴/機械版）
    shoulder: ['Band Chest Press', 'Barbell Bench Press', 'Incline Barbell Press', 'Dumbbell Bench Press',
        'Incline Dumbbell Press', 'Machine Chest Press', 'Decline Bench Press',
        'Barbell Overhead Press', 'Dumbbell Overhead Press', 'Arnold Press', 'Machine Shoulder Press',
        'Chest Dips', 'Tricep Dips', 'Skull Crushers', 'Close Grip Bench Press', 'Upright Row',
        'Pike Push Ups', 'Band Shoulder Press', 'Decline Push Ups', 'Bench Dips'],
    // 腕：避開直槓抓握高負荷（槓鈴推/划船/彎舉/前蹲架位）
    wrist: ['Incline Push Ups', 'Barbell Bench Press', 'Incline Barbell Press', 'Barbell Row', 'Barbell Overhead Press',
        'Skull Crushers', 'Barbell Bicep Curl', 'Close Grip Bench Press', 'Barbell Front Squat',
        'Front Squat', 'Push Ups', 'Diamond Push Ups',
        'Pike Push Ups', 'Decline Push Ups', 'Bench Dips'],
    // 髖：避開大幅髖屈/髖伸負荷
    hip: ['Band Good Morning', 'Barbell Back Squat', 'Barbell Front Squat', 'Romanian Deadlift', 'Dumbbell Romanian Deadlift',
        'Single Leg Romanian Deadlift',
        'Good Morning', 'Hip Thrusts', 'Single Leg Hip Thrust', 'Deadlift', 'Sumo Deadlift',
        'Walking Lunges', 'Bulgarian Split Squat', 'Reverse Lunge', 'Single Leg Glute Bridge'],
    neck: ['Barbell Back Squat', 'Deadlift', 'Barbell Row', 'Barbell Overhead Press'],
    // 踝：避開需大幅踝背屈/站姿負重的動作
    ankle: ['Barbell Back Squat', 'Barbell Front Squat', 'Bodyweight Squat', 'Walking Lunges',
        'Bulgarian Split Squat', 'Calf Raises', 'Seated Calf Raises', 'Step Ups',
        'Single Leg Calf Raise', 'Reverse Lunge'],
};

// ─── SPLIT DEFINITIONS ───────────────────────────────────────
// primary muscles listed in the order exercises should appear within the session
const SPLITS = {
    precision: [
        {
            id: 'chest', focus: SPLIT_FOCUS.chest, shortFocus: 'CHEST', warmup: 'upper',
            primary: ['chest'], accessory: ['triceps']
        },
        {
            id: 'back', focus: SPLIT_FOCUS.back, shortFocus: 'BACK', warmup: 'upper',
            primary: ['back'], accessory: ['biceps', 'triceps']
        },
        {
            id: 'glutes', focus: SPLIT_FOCUS.glutes, shortFocus: 'GLUTES', warmup: 'lower',
            primary: ['glutes', 'hamstrings'], accessory: ['calves']
        },
        {
            id: 'quads', focus: SPLIT_FOCUS.quads, shortFocus: 'LEGS', warmup: 'lower',
            primary: ['quads', 'hamstrings'], accessory: ['calves']
        },
        {
            id: 'shoulders', focus: SPLIT_FOCUS.shoulders, shortFocus: 'SHOULDERS', warmup: 'upper',
            primary: ['shoulders'], accessory: ['biceps', 'triceps']
        },
        {
            id: 'biceps', focus: SPLIT_FOCUS.biceps, shortFocus: 'ARMS', warmup: 'upper',
            primary: ['biceps', 'triceps'], accessory: []
        },
        {
            id: 'core', focus: SPLIT_FOCUS.core, shortFocus: 'CORE', warmup: 'full',
            primary: ['core'], accessory: []
        },
    ],
};

// ─── HASHTAG: MUSCLES ────────────────────────────────────────
// requiredExercises: [{name, muscle}] — injected before any time-budget fill
// These are "signature moves" that MUST appear regardless of budget.
export const MUSCLES = {

    // ── CHEST ── Upper + Mid balance ─────────────────────────
    'chest': {
        label: '胸肌', icon: '💪', cat: 'muscles', muscles: ['chest'],
        requiredExercises: [
            { name: 'Barbell Bench Press', muscle: 'chest' },
            { name: 'Incline Dumbbell Press', muscle: 'chest' },
        ],
        priorityExercises: [
            'Barbell Bench Press', 'Incline Barbell Press', 'Incline Dumbbell Press',
            'Dumbbell Bench Press', 'Seated Cable Fly', 'Cable Crossover', 'Pec Deck Fly',
        ],
    },

    // ── BACK ── Lats width (vertical) + Mid-back thickness (horizontal) ──
    'back': {
        label: '背部', icon: '🦾', cat: 'muscles', muscles: ['back'],
        requiredExercises: [
            { name: 'Pull Ups', muscle: 'back' },
            { name: 'Barbell Row', muscle: 'back' },
        ],
        priorityExercises: [
            'Pull Ups', 'Barbell Row', 'Wide Grip Lat Pulldown',
            'Seated Cable Row', 'Single Arm Dumbbell Row', 'Straight Arm Pulldown',
        ],
    },

    // ── SHOULDERS ── Front + Mid + Rear (3 heads, all mandatory) ──────
    'shoulders': {
        label: '肩膀', icon: '⚡', cat: 'muscles', muscles: ['shoulders'],
        minShoulderBalance: true,
        requiredExercises: [
            { name: 'Dumbbell Overhead Press', muscle: 'shoulders' },
            { name: 'Dumbbell Lateral Raise', muscle: 'shoulders' },
            { name: 'Reverse Pec Deck', muscle: 'shoulders' },
        ],
        priorityExercises: [
            'Dumbbell Overhead Press', 'Barbell Overhead Press', 'Arnold Press',
            'Dumbbell Lateral Raise', 'Cable Lateral Raise',
            'Reverse Pec Deck', 'Face Pulls', 'Front Raise',
        ],
    },

    // ── ARMS ── Biceps:2 + Triceps:2 minimum (always balanced) ──────
    'arms': {
        label: '手臂', icon: '💪', cat: 'muscles', muscles: ['biceps', 'triceps'],
        requiredSubMuscles: { biceps: 2, triceps: 2 },
        requiredExercises: [
            { name: 'Barbell Bicep Curl', muscle: 'biceps' },
            { name: 'Hammer Curls', muscle: 'biceps' },
            { name: 'Skull Crushers', muscle: 'triceps' },
            { name: 'Tricep Pushdown', muscle: 'triceps' },
        ],
        priorityExercises: [
            'Barbell Bicep Curl', 'Hammer Curls', 'Skull Crushers',
            'Tricep Pushdown', 'Rope Pushdown', 'Incline Dumbbell Curl',
            'Overhead Tricep Extension',
        ],
    },

    // ── CORE ── Anti-extension + Flexion + Rotation (all 3 patterns) ──
    'core': {
        label: '核心 / 腹肌', icon: '🔥', cat: 'muscles', muscles: ['core'],
        crossDayAppend: true,
        requiredExercises: [],
        priorityExercises: [
            'Ab Wheel Rollout', 'Hanging Leg Raise', 'Cable Crunch', 'Plank', 'Russian Twists',
        ],
    },

    // ── LEGS ── Squat pattern (quads) + Hip hinge (hamstrings) ──────
    'legs': {
        label: '腿部', icon: '🦵', cat: 'muscles', muscles: ['quads', 'hamstrings'],
        requiredSubMuscles: { quads: 2, hamstrings: 1 },
        requiredExercises: [
            { name: 'Barbell Back Squat', muscle: 'quads' },
            { name: 'Romanian Deadlift', muscle: 'hamstrings' },
        ],
        priorityExercises: [
            'Barbell Back Squat', 'Romanian Deadlift', 'Leg Press',
            'Bulgarian Split Squat', 'Lying Leg Curls', 'Leg Extensions', 'Walking Lunges',
        ],
    },

    // ── GLUTES ── Hip Thrust + Hip Hinge + Isolation (Bret Contreras) ──
    'glutes': {
        label: '臀部', icon: '🍑', cat: 'muscles', muscles: ['glutes', 'hamstrings'],
        requiredSubMuscles: { glutes: 2, hamstrings: 1 },
        requiredExercises: [
            { name: 'Hip Thrusts', muscle: 'glutes' },
            { name: 'Romanian Deadlift', muscle: 'hamstrings' },
            { name: 'Cable Kickback', muscle: 'glutes' },
        ],
        priorityExercises: [
            'Hip Thrusts', 'Romanian Deadlift', 'Bulgarian Split Squat',
            'Glute Bridge', 'Cable Kickback', 'Band Kickback', 'Clamshells',
        ],
    },
};

export const ALL_TAGS = { ...MUSCLES };
export const PRIMARY_GOALS = { ...MUSCLES };
export const CATEGORY_LIMITS = { muscles: 3 }; // 拔除 problems

// ─── CONFLICT DETECTION ────────────────────────────────
export const detectSplitConflicts = (selectedHashtags, splitType) => {
    return [];
};

// ─── BASELINE ────────────────────────────────────────────────
export const conductBaselineAssessment = ({ pushUpReps = 0, squatReps = 0, plankSeconds = 0, manualLevel }) => {
    if (manualLevel) return { level: manualLevel, strengthScore: 0 };
    let s = 0;
    if (pushUpReps >= 30) s += 3; else if (pushUpReps >= 15) s += 2; else if (pushUpReps >= 8) s += 1;
    if (squatReps >= 40) s += 3; else if (squatReps >= 25) s += 2; else if (squatReps >= 12) s += 1;
    if (plankSeconds >= 120) s += 3; else if (plankSeconds >= 60) s += 2; else if (plankSeconds >= 30) s += 1;
    return { level: s >= 7 ? 'advanced' : s >= 4 ? 'intermediate' : 'beginner', strengthScore: s };
};

// ─── ENGINE CONSTANTS ─────────────────────────────────────────
const WARMUP_BUDGET = 8, COOLDOWN = 3, TR = 2;

// ════════════════════════════════════════════════════════════════
// ⚖️ 教練法典 LEVEL_CODE（單一真相來源 / Single Source of Truth）
// ════════════════════════════════════════════════════════════════
// 所有「等級 → 動作數量 / 動作池 / 超級組 / 週期化 / 標籤限制」規則一律讀這裡。
// 任何地方不得再散落自己的 magic number（過去中階上限同時存在 4 與 5 兩種版本）。
//
// 立法依據（真實教練帶學生的普適標準）：
//   新手   — 動作模式學習期：3–4 個動作、純複合、器械優先、禁槓鈴/禁孤立填充/禁超級組/
//            禁遞減組、固定 3×12-15、每週 2–4 天、目標肌群最多 2 個（少而精）。
//   中階   — 累積期：4–5 個動作、大肌群 2複合+1孤立、T1 自由重量+輔助器械、
//            超級組每日最多 1 組、強化週 T1 走 6-8RM（不下探神經極限區）。
//   高階   — 專項期：5–6 個動作、大肌群 2複合+2孤立、自由重量優先、
//            超級組每日最多 2 組、強化週 T1 3-5RM/240s。
//
// ⚠️ sessionMins 是「時間預算」，不是承諾給使用者的時長，而且實測從來不會成為
//    綁定條件 —— 三個等級的預算（34/49/64 分）都用不完，永遠是動作數上限先觸頂。
//    實際課表中位數：新手 30 分 / 中階 42–51 分 / 高階 50–58 分。
//    使用者看到的是 day.time（真實計算值），plan.session_duration 全 app 沒有任何地方顯示，
//    sessionMins 的唯一消費者 trainingFocus.buildFocusPlan() 目前沒有呼叫端。
//    → 所以「宣告時長達不到」是純內部落差，不是對使用者說謊，
//      不要為了湊滿分鐘數而加動作（那會讓週組數超出有效區間上緣）。
//      真正該看的劑量指標是「每部位每週 10–20 組」，見下方 volumeHint 的審核。
export const LEVEL_CODE = {
    beginner: {
        label: '新手',
        sessionMins: 45,
        exMin: 3, exMax: 3,           // 每日正式動作數（硬法規，與 plan-auditor 官方標準一致：3/4/6）
        isoPerBig: 0,                 // 每個大肌群可配的孤立輔助數
        maxSupersetsPerDay: 0,        // 禁超級組（先建立動作模式）
        allowDropSet: false,          // 禁遞減組
        allowBarbell: false,          // 禁槓鈴自由重量（器械/繩索/啞鈴優先）
        allowIsolationFill: false,    // 填充階段禁孤立動作（手臂配額補注除外）
        maxDiff: 1,                   // 動作難度上限（保加利亞蹲/引體/雙槓撐 diff2 一律排除）
        maxDiffBodyweight: 2,         // 徒手環境放寬到 2（否則無背部動作可用）
        maxTierPool: 2,               // 新手動作池只到 Tier 2（tier3 孤立/次要變體不進新手課表）
        maxTierPoolBodyweight: 3,     // 徒手環境放寬（徒手深蹲等基本功是 tier3）
        forbidCns: ['extreme'],       // 禁極限 CNS 動作
        maxMuscleTags: 2,             // wizard：目標肌群標籤最多 2 個
        maxDaysPerWeek: 4,            // wizard：每週最多 4 天（恢復優先）
        weeklyArmQuota: 1,            // 每週二頭/三頭配額各 1
    },
    intermediate: {
        label: '中階',
        sessionMins: 60,
        exMin: 4, exMax: 4,           // 與 plan-auditor 官方標準一致
        isoPerBig: 1,
        maxSupersetsPerDay: 1,
        allowDropSet: true,
        allowBarbell: true,
        allowIsolationFill: true,
        maxDiff: 3,
        maxDiffBodyweight: 3,
        forbidCns: [],
        maxMuscleTags: 4,
        maxDaysPerWeek: 5,
        weeklyArmQuota: 2,
    },
    advanced: {
        label: '高階',
        sessionMins: 75,
        exMin: 5, exMax: 6,
        isoPerBig: 2,
        maxSupersetsPerDay: 2,
        allowDropSet: true,
        allowBarbell: true,
        allowIsolationFill: true,
        maxDiff: 3,
        maxDiffBodyweight: 3,
        forbidCns: [],
        maxMuscleTags: 6,
        maxDaysPerWeek: 5,
        weeklyArmQuota: 2,
    },
};
export const getLevelCode = (level) => LEVEL_CODE[level] || LEVEL_CODE.beginner;

// ⚖️ 統一等級動作閘門：任何「把動作放進課表」的路徑（填充/配額/救援/核心保證/傷病替代）
//    都必須通過這裡。過去每個路徑各自複製過濾條件，配額補注就漏掉了新手禁槓鈴的檢查。
// 🧗 嚴格徒手垂直拉（引體向上／反手引體）：要能拉起整個體重，實務上是中階以上才做得起來。
//    新手就算在徒手環境也不排（徒手背部改用反式划船／彈力帶下拉），健身房新手走滑輪下拉。
export const STRICT_BW_PULLS = new Set(['Pull Ups', 'Chin Ups']);
export const passesLevelGate = (ex, level, equipment = 'mixed') => {
    const law = getLevelCode(level);
    if ((level || 'beginner') === 'beginner' && STRICT_BW_PULLS.has(ex.name)) return false;
    const maxDiff = equipment === 'bodyweight' ? law.maxDiffBodyweight : law.maxDiff;
    if ((ex.diff ?? 0) > maxDiff) return false;
    if (!law.allowBarbell && ex.eq === 'barbell') return false;
    if (law.forbidCns.includes(ex.cns)) return false;
    // ⚖️ 動作池 tier 上限（新手 ≤2）：在「源頭」就擋掉 tier3，
    //    而不是靠輸出端事後過濾（事後過濾會把配額剛補的動作又砍掉 → 日過薄）。
    if ((ex.tier ?? 3) !== 4) {
        const maxTier = equipment === 'bodyweight' ? (law.maxTierPoolBodyweight ?? 3) : (law.maxTierPool ?? 3);
        if ((ex.tier ?? 3) > maxTier) return false;
    }
    return true;
};

// ════════════════════════════════════════════════════════════════
// ⚖️ 分化純度法 SPLIT PURITY（教練紅線）
// ════════════════════════════════════════════════════════════════
// 推日不練拉力肌、拉日不練推力肌、腿日不練上肢。
// key = 當日 shortFocus；value = 該日「絕不允許出現」的肌群。
// 任何補注路徑（配額/救援/換位）都不得違反；最後還有一道總清掃兜底。
const LOWER_FORBID = ['chest', 'back', 'shoulders', 'biceps', 'triceps'];
const DAY_FORBIDDEN_MUSCLES = {
    'PUSH': ['back', 'biceps'],
    'PULL': ['chest', 'triceps'],
    'UPPER A': ['back', 'biceps'],      // 上肢推日
    'UPPER B': ['chest', 'triceps'],    // 上肢拉日
    'CHEST': ['back', 'biceps'],
    'BACK': ['chest', 'triceps'],
    'LEGS': LOWER_FORBID,
    'LOWER': LOWER_FORBID,
    'LOWER A': LOWER_FORBID,
    'LOWER B': LOWER_FORBID,
    'QUADS': LOWER_FORBID,
    'GLUTES': LOWER_FORBID,
};
const dayForbiddenMuscles = (shortFocus) =>
    new Set(DAY_FORBIDDEN_MUSCLES[String(shortFocus || '').toUpperCase()] || []);

// ════════════════════════════════════════════════════════════════
// ⏱️ 統一時間預估模型（單一真相來源，引擎與 UI 共用，不再各算各的）
// ════════════════════════════════════════════════════════════════
// 物理基礎，每個常數都有明確意義，不再用神祕魔術數字：
//   • 每組「執行時間」= 次數 × 每次節奏秒數（向心1s＋離心2s≈3s/次，T1大重量抓 4s/次）
//   • 每組「組間休息」= 動作處方的 rest（解析 "90s" / "2min" / 數字秒）
//   • 每個動作 = 換器材/暖身組 setup + 組數×(執行+休息)
//   • 一天 = 動態熱身(WARMUP_BUDGET) + Σ動作 + 收操(COOLDOWN)
// 超級組第二動作不另計休息與 setup（接續做），故時間較短。

// 解析 rest 字串 → 秒
const parseRestSeconds = (rest) => {
    if (rest == null) return 75;
    if (typeof rest === 'number') return rest > 10 ? rest : rest * 60; // >10 視為秒，否則視為分
    const s = String(rest).trim().toLowerCase();
    const min = s.match(/^([\d.]+)\s*(min|m|分)/);
    if (min) return parseFloat(min[1]) * 60;
    const sec = s.match(/^([\d.]+)\s*(s|sec|秒)?/);
    return sec ? parseFloat(sec[1]) : 75;
};

// 解析 reps → 估算「每組次數」(取範圍中值；遞減組用總階數估)
const parseRepsForTime = (reps) => {
    if (reps == null) return 10;
    const s = String(reps);
    if (s.includes('->')) {                    // 遞減組 "12 -> 10 -> 8 -> 6"
        const nums = s.split('->').map(x => parseInt(x)).filter(n => !isNaN(n));
        return nums.reduce((a, b) => a + b, 0); // 全部加總（不休息連續做）
    }
    if (/(\d+)\s*(s|sec|秒)/.test(s)) {         // 等長動作如 "45-60s" → 視為一組約 45s 工作
        const m = s.match(/(\d+)/g);
        return m ? (parseInt(m[m.length - 1]) / 3) : 15; // 換算成等效次數（每次≈3s）
    }
    const m = s.match(/(\d+)\s*-\s*(\d+)/);
    if (m) return Math.round((parseInt(m[1]) + parseInt(m[2])) / 2); // 範圍取中值
    const single = parseInt(s);
    return isNaN(single) ? 10 : single;
};

/**
 * 估算單一動作所需分鐘數（透明、可解釋）。
 * @param {object} ex - 動作物件 (含 sets/reps/rest/tier/eq/isWarmup/supersetOrder)
 * @param {boolean} isFirst - 是否為當日第一個主項（多 +設定時間）
 */
export const estimateExerciseMinutes = (ex, isFirst = false) => {
    if (!ex) return 0;
    // 熱身 / 矯正動作：固定短時
    if (ex.isWarmup || ex.tier === 4) return Math.max(1.5, (Number(ex.time) || 2));

    const sets = Math.max(1, parseInt(ex.sets) || 3);
    const reps = parseRepsForTime(ex.reps);
    const secPerRep = (ex.tier === 1) ? 4 : 3;                 // T1 大重量節奏較慢
    const workMinPerSet = (reps * secPerRep) / 60;            // 每組執行時間（分）
    const restMinPerSet = parseRestSeconds(ex.rest) / 60;     // 每組休息（分）

    // 超級組第二動作：接續做，不另計組間休息與 setup
    const isSupersetB = ex.supersetOrder === 'B' || ex.supersetId && ex._ssSecond;
    const perSet = isSupersetB ? workMinPerSet + 0.3 : workMinPerSet + restMinPerSet;

    // 換器材 / 暖身組 setup
    let setup;
    if (isSupersetB) setup = 0.3;
    else if (isFirst) setup = 2.5;                             // 當日首項抓重量、暖身組
    else if (ex.eq === 'barbell') setup = 1.5;                 // 上退槓片
    else if (ex.eq === 'machine' || ex.eq === 'cable') setup = 1.0;
    else if (ex.eq === 'dumbbell' || ex.eq === 'kettlebell') setup = 0.75;
    else setup = 0.5;                                          // 徒手 / 彈力帶

    return setup + sets * perSet;
};

/**
 * 估算整天訓練時間（分鐘，已四捨五入）。
 * @param {array} mainExercises - 主訓練動作
 * @param {array} warmups - 熱身動作（可省略，會用 WARMUP_BUDGET 概估）
 */
export const estimateDayMinutes = (mainExercises = [], warmups = null) => {
    const warmupMins = warmups && warmups.length
        ? warmups.reduce((s, w) => s + Math.max(1.5, (Number(w.time) || 2)), 0)
        : WARMUP_BUDGET;
    let total = warmupMins + COOLDOWN;
    let firstMainDone = false;
    mainExercises.forEach(ex => {
        if (ex.isWarmup || ex.tier === 4) { total += estimateExerciseMinutes(ex); return; }
        const isFirst = !firstMainDone;
        firstMainDone = true;
        total += estimateExerciseMinutes(ex, isFirst);
    });
    return Math.round(total);
};

/**
 * 核心修正：動態成本預測器
 * 讓 fillByTime (塞背包) 時所使用的時間，能精準對齊 SOP 第五階段的物理模型耗時。
 * 解決新手模式下因「靜態休息時間」過長導致的 Leg Day 動作過少問題。
 */
const getAdjustedCost = (ex, level, style) => {
    if (ex.tier === 4 || ex.isWarmup) return (ex.time || 2) + TR;

    // 模擬 applyTrainingStyle 的組數與休息邏輯
    let sets = 3, restMins = 1;
    let execTimePerSet = 0.75;

    if (level === 'beginner') {
        sets = 3; restMins = 1; // 新手固定 1 min 休息
    } else {
        const isSmall = SMALL_MUSCLES.has(ex.muscle) || ex.cat === I;
        if (style === 'strength') {
            if (ex.tier === 1) { sets = 4; restMins = 2; execTimePerSet = 0.9; }
            else if (ex.tier === 2) { sets = 3; restMins = 1.5; }
            else { sets = 3; restMins = 1; }
        } else {
            // Bodybuilding
            if (isSmall || ex.tier === 3) { sets = 3; restMins = 1; }
            else { sets = 3; restMins = 1.5; execTimePerSet = 0.8; }
        }
    }
    
    return (execTimePerSet + restMins) * sets + TR;
};

export const autoDetectSessionDuration = (level) => getLevelCode(level).sessionMins;

// ⚠️ [S-09] 這個函式永遠回傳同一個常數，generateUnifiedPlan 的 splitType 參數
//    也只是被原封不動放進輸出的 split_type 欄位供 UI 顯示。
//    真正決定分化的是 buildSchedule()（天數 × 肌群標籤的決策樹）。
//    保留是為了不動輸出 schema —— 不要以為傳這個參數會改變課表。
export const autoDetectSplitType = () => 'foundation';

const durationToMainBudget = (mins) => Math.max(20, mins - WARMUP_BUDGET - COOLDOWN);

// ─── HELPERS ─────────────────────────────────────────────────
const buildWarmup = (zone, equipment, budget = 8) => {
    const pool = WARMUP_LIBRARY.filter(w => {
        const zm = w.zone === zone || w.zone === 'full';
        const em = equipment === 'bodyweight' ? w.eq === 'bodyweight' : true;
        return zm && em;
    });
    const sorted = [...pool.filter(w => w.zone === zone), ...pool.filter(w => w.zone === 'full')];
    const out = []; let used = 0; const seen = new Set();
    for (const w of sorted) {
        if (used + w.time > budget) break;
        if (seen.has(w.name)) continue;
        out.push({ name: w.name, muscle: 'warmup', cat: R, tier: 4, sets: 1, reps: w.reps, rest: '0s', time: w.time, isWarmup: true });
        seen.add(w.name); used += w.time;
    }
    return out;
};

const avoidList = (injuries) => injuries.flatMap(inj => INJURY_AVOID[inj.toLowerCase()] || []);

const getPoolForMuscle = (muscle, equipment, level, injuries, maxTier = 3, priorityNames = [], allowedZones = null, forceAllowIsolation = false) => {
    const avoid = avoidList(injuries);
    const law = getLevelCode(level);
    const base = ALL_EXERCISES.filter(ex =>
        ex.muscle === muscle &&
        (!allowedZones || allowedZones.includes(ex.zone)) &&
        !avoid.includes(ex.name) &&
        (ex.tier <= maxTier || priorityNames.includes(ex.name)) &&
        (equipment !== 'bodyweight' || (ex.eq === 'bodyweight' || ex.eq === 'band')) &&
        (equipment !== 'equipment' || ex.eq !== 'bodyweight') &&
        passesLevelGate(ex, level, equipment) &&                 // ⚖️ 統一等級閘門
        (level === 'advanced' || ex.zone !== 'chest-lower')
    );
    const strict = (law.allowIsolationFill || forceAllowIsolation) ? base : base.filter(ex => ex.cat !== I);
    /* 🔧 [2026-09] 新手「只給複合」是原則，但手臂等部位在傷病／徒手限制下常常一個複合都不剩
       （例：肩＋腕受傷的新手 → 三頭 0 個動作 → 選了手臂整週沒練到）。
       這時退回允許孤立動作，總比整個部位空白好。 */
    return strict.length ? strict : base;
};

// 🏋️ 依等級偏好器材（數字小=優先）：
//   初階 → 器械/繩索為主(安全好學、避開槓鈴自由重量)
//   中階 → 主項(tier≤1)用自由重量(槓/啞鈴)、輔助(tier≥2)用器械/繩索（器械+一個槓的概念）
//   高階 → 自由重量(槓鈴/啞鈴)為主
/* 目前這一份計劃選的訓練環境（generateUnifiedPlan 開頭設定、結束還原；引擎是同步執行的）。
   ⚠️ 以前「健身房＋自重（混合）」跟「健身房」只差在後者會濾掉自重動作，但排序兩者完全一樣 ——
      1080 種組合裡有 898 種生出一模一樣的課表，等於這個選項沒作用。
      現在混合模式的「輔助動作」會優先挑自重（伏地挺身、雙槓撐體、反式划船…），
      大重量主項仍然走槓鈴／啞鈴，所以選哪個環境真的會換到不同的課表。 */
let CURRENT_EQUIPMENT = 'mixed';

const equipScore = (ex, level) => {
    const eq = ex.eq || 'barbell';
    // 只優先「自重複合」（雙槓撐體、伏地挺身、反式划船）；靠牆深蹲、青蛙臀推這類自重孤立／靜態動作
    // 對有器材的人刺激不夠，不該因為是自重就排在腿伸屈、腿彎舉前面。
    if (CURRENT_EQUIPMENT === 'mixed' && eq === 'bodyweight' && (ex.tier || 3) >= 2 && ex.cat === C) return -1;
    if (level === 'beginner')
        return ({ machine: 0, cable: 0, bodyweight: 1, band: 1, dumbbell: 2, kettlebell: 3, barbell: 5 })[eq] ?? 2;
    // 有器材的中高階：彈力帶、自重孤立（青蛙臀推、靠牆深蹲）負荷調不上去，排在最後才用
    const bwIso = eq === 'bodyweight' && ex.cat !== C;
    if (level === 'advanced') {
        if (bwIso) return 2;
        return ({ barbell: 0, dumbbell: 0, kettlebell: 1, cable: 1, bodyweight: 1, machine: 2, band: 3 })[eq] ?? 1;
    }
    // 中階：主項偏自由、輔助偏器械
    if ((ex.tier || 3) <= 1)
        return ({ barbell: 0, dumbbell: 0, kettlebell: 1, machine: 1, cable: 1, bodyweight: 1, band: 2 })[eq] ?? 1;
    if (bwIso) return 2;
    return ({ machine: 0, cable: 0, dumbbell: 1, bodyweight: 1, band: 2, kettlebell: 2, barbell: 2 })[eq] ?? 1;
};

// 統一比較器：初階「器材優先 > 層級」(讓新手拿到滑輪下拉而非引體)；
//             中/高階「層級(複合先行) > 器材偏好」。
const compareByLevel = (a, b, level, preferLowRep = false) => {
    const es = equipScore(a, level) - equipScore(b, level);
    if (level === 'beginner') {
        if (es !== 0) return es;
        if (a.tier !== b.tier) return a.tier - b.tier;
    } else {
        if (a.tier !== b.tier) return a.tier - b.tier;
        if (es !== 0) return es;
    }
    return preferLowRep ? b.diff - a.diff : 0;
};

const sortPool = (pool, priorityNames = [], preferLowRep = false, correctiveFirst = false, level = 'intermediate') => {
    return [...pool].sort((a, b) => {
        const ai = priorityNames.indexOf(a.name), bi = priorityNames.indexOf(b.name);
        if (ai !== -1 || bi !== -1) { if (ai === -1) return 1; if (bi === -1) return -1; return ai - bi; }
        if (correctiveFirst) { const d = (a.tier === 4 ? -1 : 0) - (b.tier === 4 ? -1 : 0); if (d) return d; }
        return compareByLevel(a, b, level, preferLowRep);
    });
};

const ZONE_PRIORITY = {
    chest: ['chest-mid', 'chest-upper'],
    back: ['back-lower', 'back-lats', 'back-mid'],
    shoulders: ['shoulders-press', 'shoulders-lateral', 'shoulders-rear'],
    quads: ['quads-squat', 'quads-iso'],
    hamstrings: ['hamstrings-hinge', 'hamstrings-iso'],
    glutes: ['glutes-thrust', 'glutes-iso', 'glutes-abduct'],
};

// 🔧 給每個肌群「唯一」的排序值（不再讓腿部四塊並列 =1）。
//    並列會導致最終重排無法把同肌群聚在一起——例如後鏈守衛補了第二個 hamstrings
//    排到 glutes 後面，就出現「hamstrings > glutes > hamstrings」把腿後拆散的群聚錯誤。
//    腿日順序：股四頭(大重量深蹲) → 腿後(鉸鏈) → 臀 → 小腿，符合教練「大重量複合先行」慣例。
const ABSOLUTE_MUSCLE_PRIORITY = {
    quads: 1, hamstrings: 2, glutes: 3, calves: 4,
    chest: 5, shoulders: 6,
    back: 7,
    biceps: 8, triceps: 8,
    core: 9
};

const reorderExercises = (exercises, muscleOrder, correctiveFirst = false, trainingStyle = 'bodybuilding') => {
    let sorted = [...exercises].sort((a, b) => {
        if (a.tier === 4 && b.tier !== 4) return 1;
        if (b.tier === 4 && a.tier !== 4) return -1;
        if (a.tier === 4 && b.tier === 4) return 0;
        const idxA = muscleOrder.indexOf(a.muscle);
        const idxB = muscleOrder.indexOf(b.muscle);
        const prioA = idxA !== -1 ? idxA : (ABSOLUTE_MUSCLE_PRIORITY[a.muscle] || 99) + muscleOrder.length;
        const prioB = idxB !== -1 ? idxB : (ABSOLUTE_MUSCLE_PRIORITY[b.muscle] || 99) + muscleOrder.length;
        if (prioA !== prioB) return prioA - prioB;
        if (a.muscle !== b.muscle) return a.muscle.localeCompare(b.muscle);
        const tierA = a.tier || 3;
        const tierB = b.tier || 3;
        if (tierA !== tierB) return tierA - tierB;
        const cnsRank = { extreme: 0, high: 1, medium: 2, low: 3 };
        const cnsA = cnsRank[a.cns] ?? 4;
        const cnsB = cnsRank[b.cns] ?? 4;
        if (cnsA !== cnsB) return cnsA - cnsB;
        const isBarbellA = (a.eq === 'barbell' || (a.name || '').includes('Barbell')) ? 0 : 1;
        const isBarbellB = (b.eq === 'barbell' || (b.name || '').includes('Barbell')) ? 0 : 1;
        if (isBarbellA !== isBarbellB) return isBarbellA - isBarbellB;
        const zOrder = ZONE_PRIORITY[a.muscle] || [];
        const zAi = zOrder.indexOf(a.zone);
        const zBi = zOrder.indexOf(b.zone);
        return (zAi === -1 ? 999 : zAi) - (zBi === -1 ? 999 : zBi);
    });
    const corrective = sorted.filter(e => e.tier === 4);
    const main = sorted.filter(e => e.tier < 4);
    return correctiveFirst ? [...corrective, ...main] : [...main, ...corrective];
};

const shouldEnableSuperset = (level, sessionDuration, trainingStyle) => {
    if (trainingStyle === 'strength') return false;    // 力量課表：ATP 完整恢復優先，禁超級組
    return getLevelCode(level).maxSupersetsPerDay > 0; // ⚖️ 讀法典：新手 0 / 中階 1 / 高階 2
};

const ANTAGONIST_PAIRS = [
    ['biceps', 'triceps'],
    ['chest', 'back'],
    ['quads', 'hamstrings'],
    ['shoulders', 'back'],
];

const injectSupersetTags = (exercises, isEnabled, level = 'intermediate') => {
    if (!isEnabled) return exercises;
    const result = exercises.map(ex => ({ ...ex }));
    let ssCounter = 0;
    for (let i = 0; i < result.length - 1; i++) {
        const curr = result[i];
        const next = result[i + 1];
        if (curr.isWarmup || next.isWarmup) continue;
        if (curr.tier === 4 || next.tier === 4) continue;
        if (curr.supersetId || next.supersetId) continue;
        const isHighCNS = (ex) => ex.cns === 'high' || ex.cns === 'extreme';
        if (isHighCNS(curr) && isHighCNS(next)) continue;
        // 🛑 [CNS 安全閘] 大肌群的複合動作（臥推、深蹲、划船…）絕不拿來組超級組，
        //    避免「大重量複合連續做」把神經系統打爆。超級組只允許出現在
        //    小肌群孤立 / 拮抗對 / 同肌群孤立力竭，這條規則是你概念的安全底線。
        const isBigCompound = (ex) => BIG_MUSCLES.has(ex.muscle) && ex.cat === C;
        if (isBigCompound(curr) || isBigCompound(next)) continue;
        const isAntagonist = ANTAGONIST_PAIRS.some(([a, b]) =>
            (curr.muscle === a && next.muscle === b) ||
            (curr.muscle === b && next.muscle === a)
        );

        // 🛑 [修復點 2A] Trigger B: 同肌群 T3 isolation burnout 配對（advanced only）
        const isSameMuscleIsolation =
            level === 'advanced' &&
            curr.muscle === next.muscle &&
            curr.tier === 3 && next.tier === 3 &&
            curr.cat === I && next.cat === I;

        // 🔧 [中高階：小肌群孤立省時配對] 你的核心概念——把被佔比鎖壓縮掉的小肌群
        //    (肩側平舉、三頭、二頭等孤立動作) 以「超級組 B」接在前一個動作後面，
        //    省下組間休息時間，不另佔一個完整動作格。
        //    安全限制：next 必須是「小肌群/孤立」、curr 不能是大重量複合(前面 isBigCompound 已擋)、
        //    兩者不同肌群以免局部疲勞過快，且 curr 不能也是極限 CNS(前面 isHighCNS 已擋)。
        const SMALL_OR_ISO = (ex) => SMALL_MUSCLES.has(ex.muscle) || ex.cat === I;
        const isSmallIsoFiller =
            (level === 'intermediate' || level === 'advanced') &&
            SMALL_OR_ISO(next) &&
            next.cat === I &&
            curr.muscle !== next.muscle &&
            // 🔧 核心不當超級組填料：三頭+核心、肩+核心 這種配對教練不會開，核心一律單獨做。
            curr.muscle !== 'core' && next.muscle !== 'core' &&
            !isHighCNS(next);

        if (isAntagonist || isSameMuscleIsolation || isSmallIsoFiller) {
            // small_filler 不交換順序：小肌群孤立固定當 B(接在後面省休息)；
            // 其他類型維持原本「tier 小者(主項)排前面」的交換。
            if (!isSmallIsoFiller && (result[i + 1].tier || 3) < (result[i].tier || 3)) {
                const temp = result[i];
                result[i] = result[i + 1];
                result[i + 1] = temp;
            }
            const currRef = result[i];
            const nextRef = result[i + 1];
            const ssType = isAntagonist ? 'antagonist'
                : isSameMuscleIsolation ? 'isolation_burnout'
                : 'small_filler';
            const ssId = `ss_${ssType}_${ssCounter++}`;
            currRef.supersetId = ssId;
            nextRef.supersetId = ssId;
            currRef.supersetType = ssType;
            nextRef.supersetType = ssType;
            
            // 🌟 新增：給前端 UI 判斷與渲染用的標籤
            currRef.isSuperset = true;
            currRef.supersetOrder = 'A'; // 前端可渲染成 1A, 2A 等
            nextRef.isSuperset = true;
            nextRef.supersetOrder = 'B'; // 前端可渲染成 1B, 2B 等

            currRef.rest = '0s';
            currRef.note = isAntagonist
                ? `⚡ 拮抗超級組：接續下一個動作，組間不休息 (Antagonist Superset)`
                : isSameMuscleIsolation
                    ? `🔥 同肌群力竭組：T3 連續夾擊，泵感最大化`
                    : `⚡ 超級組：接續做下一個小肌群動作，省下組間休息`;
            nextRef.note = `✅ 超級組結束 — 休息 ${nextRef.rest} 後繼續下一組`;
            i++;
            continue;
        }
    }
    return result;
};

// 🔧 [2026-10] 超級組最後整理：一組超級組一定是「相鄰的兩個動作、輪數一樣」。
//    後面的補位／換動作只換掉其中一個時，另一個會變成「只有自己一個人的超級組」（UI 顯示 1A 卻沒有 1B），
//    扣組數也可能只扣到其中一個（A 3 輪、B 2 輪做不起來）。
//    規則：落單或沒相鄰 → 拿掉超級組標記，回到一般動作；兩個輪數不同 → 兩個都用比較少的那個。
const normalizeSupersetPairs = (exercises = []) => {
    const groups = {};
    exercises.forEach((e, i) => { if (e && e.supersetId) (groups[e.supersetId] ||= []).push(i); });
    Object.values(groups).forEach(idx => {
        const ok = idx.length === 2 && idx[1] === idx[0] + 1;
        if (!ok) {
            idx.forEach(i => {
                const e = { ...exercises[i] };
                ['supersetId', 'supersetType', 'isSuperset', 'supersetOrder'].forEach(k => delete e[k]);
                if (typeof e.note === 'string' && /超級組|力竭組：T3/.test(e.note)) delete e.note;
                exercises[i] = e;
            });
            return;
        }
        const [a, b] = idx.map(i => exercises[i]);
        const n = Math.min(parseInt(a.sets) || 0, parseInt(b.sets) || 0);
        if (n > 0 && (parseInt(a.sets) !== n || parseInt(b.sets) !== n)) {
            exercises[idx[0]] = { ...a, sets: n };
            exercises[idx[1]] = { ...b, sets: n };
        }
    });
    return exercises;
};

const canAddEx = (ex, dailyState, globalUsed, prevDayHadExtreme = false) => {
    if (prevDayHadExtreme && ex.cns === 'extreme') return false;
    if (dailyState.names.has(ex.name)) return false;
    if (ex.cns === 'extreme' && dailyState.extremeUsed) return false;
    const patternKey = `${ex.muscle}::${ex.zone}::${ex.cat}`;
    if (dailyState.patterns && dailyState.patterns.has(patternKey)) return false;
    if (globalUsed && globalUsed.has(ex.name)) {
        if (ex.tier !== 1 && ex.muscle !== 'core') return false;
    }
    return true;
};

const markUsed = (ex, dailyState, globalUsed) => {
    dailyState.names.add(ex.name);
    if (ex.cns === 'extreme') dailyState.extremeUsed = true;
    if (!dailyState.patterns) dailyState.patterns = new Set();
    dailyState.patterns.add(`${ex.muscle}::${ex.zone}::${ex.cat}`);
    if (globalUsed) globalUsed.add(ex.name);
};

const injectRequired = (selectedHashtags, equipment, level, injuries, dailyState, globalUsed, budget, allowedMuscles = null, prevDayHadExtreme = false) => {
    const avoid = avoidList(injuries);
    const out = []; let rem = budget;
    // ⚖️ 指定動作注入的「每肌群上限 2」：肩標籤的三顆指定動作(推/側/後)若全數注入，
    //    會在全身日把其他肌群的格子吃光（3 肩佔掉 4 格中的 3 格）→ 造成空洞日。
    const perMuscleCount = {};
    for (const tag of selectedHashtags) {
        const info = MUSCLES[tag];
        if (!info?.requiredExercises) continue;
        for (const req of info.requiredExercises) {
            if (allowedMuscles && !allowedMuscles.includes(req.muscle)) continue;
            if ((perMuscleCount[req.muscle] || 0) >= 2) continue;
            if (avoid.includes(req.name)) continue;
            const ex = ALL_EXERCISES.find(e => e.name === req.name);
            if (!ex) continue;
            if (!canAddEx(ex, dailyState, globalUsed, prevDayHadExtreme)) continue;
            if (equipment === 'bodyweight' && ex.eq !== 'bodyweight' && ex.eq !== 'band') continue;
            if (!passesLevelGate(ex, level, equipment)) continue;          // ⚖️ 統一等級閘門
            if (!getLevelCode(level).allowIsolationFill && ex.cat === I) continue;
            if (ex.time + TR > rem) continue;
            out.push({ ...ex }); markUsed(ex, dailyState, globalUsed); rem -= (ex.time + TR);
            perMuscleCount[req.muscle] = (perMuscleCount[req.muscle] || 0) + 1;
        }
    }
    return { injected: out, rem };
};

const fillByTime = ({ muscles, budget, equipment, level, injuries, priorityNames, preferLowRep, preferCompound, dailyState, globalUsed, minPerMuscle = {}, maxPerMuscle = {}, compoundCapPerMuscle = {}, zoneOverrides = {}, prevDayHadExtreme = false, preFilled = [], trainingStyle = 'bodybuilding' }) => {
    const out = []; let rem = budget;
    const avoid = avoidList(injuries);
    // 計算某肌群目前的複合動作數（含 preFilled）
    const compoundCount = (muscle) =>
        preFilled.filter(e => e.muscle === muscle && isCompoundEx(e)).length +
        out.filter(e => e.muscle === muscle && isCompoundEx(e)).length;
    // 是否已達該肌群複合上限
    const atCompoundCap = (muscle) =>
        compoundCapPerMuscle[muscle] !== undefined && compoundCount(muscle) >= compoundCapPerMuscle[muscle];
    for (const muscle of muscles) {
        const zones = (zoneOverrides && zoneOverrides[muscle]) ? zoneOverrides[muscle] : (MUSCLE_ZONES[muscle] || [muscle]);
        for (const zone of zones) {
            if (preFilled.some(e => e.zone === zone) || out.some(e => e.zone === zone)) continue;
            const pool = ALL_EXERCISES.filter(ex =>
                ex.zone === zone && !avoid.includes(ex.name) && canAddEx(ex, dailyState, globalUsed, prevDayHadExtreme) &&
                ex.tier <= 3 &&
                (equipment !== 'bodyweight' || ex.eq === 'bodyweight' || ex.eq === 'band') &&
                passesLevelGate(ex, level, equipment) &&          // ⚖️ 統一等級閘門
                (getLevelCode(level).allowIsolationFill || ex.cat !== I) &&
                (level === 'advanced' || ex.zone !== 'chest-lower')
            ).sort((a, b) => {
                const ai = priorityNames.indexOf(a.name), bi = priorityNames.indexOf(b.name);
                if (ai !== -1 || bi !== -1) return (ai === -1 ? 1 : (bi === -1 ? -1 : ai - bi));
                return compareByLevel(a, b, level);
            });
            for (const ex of pool) {
                // 🔧 大肌群複合上限：已滿 2 複合時，只允許再加孤立動作
                if (isCompoundEx(ex) && atCompoundCap(muscle)) continue;
                const cost = getAdjustedCost(ex, level, trainingStyle);
                if (cost > rem) continue;
                out.push({ ...ex }); markUsed(ex, dailyState, globalUsed); rem -= cost;
                break;
            }
        }
    }
    for (const muscle of muscles) {
        const target = (minPerMuscle[muscle] || 0);
        const current = preFilled.filter(e => e.muscle === muscle).length + out.filter(e => e.muscle === muscle).length;
        const need = target - current;
        if (need <= 0) continue;
        const maxTier = preferCompound ? 2 : 3;
        const allowedZones = (zoneOverrides && zoneOverrides[muscle]) ? zoneOverrides[muscle] : null;
        const pool = sortPool(getPoolForMuscle(muscle, equipment, level, injuries, maxTier, priorityNames, allowedZones), priorityNames, preferLowRep, false, level);
        let added = 0;
        for (const ex of pool) {
            if (added >= need) break;
            // 🔧 大肌群複合上限
            if (isCompoundEx(ex) && atCompoundCap(muscle)) continue;
            const cost = getAdjustedCost(ex, level, trainingStyle);
            if (!canAddEx(ex, dailyState, globalUsed, prevDayHadExtreme) || cost > rem) continue;
            out.push({ ...ex }); markUsed(ex, dailyState, globalUsed); rem -= cost; added++;
        }
    }
    let pass = 0;
    while (rem > 4 && pass < 50) {
        const muscle = muscles[pass % muscles.length]; pass++;
        if (maxPerMuscle[muscle] !== undefined) {
            const currentCount = preFilled.filter(e => e.muscle === muscle).length + out.filter(e => e.muscle === muscle).length;
            if (currentCount >= maxPerMuscle[muscle]) continue;
        }
        const maxTier = preferCompound ? 2 : 3;
        const allowedZones = (zoneOverrides && zoneOverrides[muscle]) ? zoneOverrides[muscle] : null;
        const pool = sortPool(getPoolForMuscle(muscle, equipment, level, injuries, maxTier, priorityNames, allowedZones), priorityNames, preferLowRep, false, level);
        let added = false;
        for (const ex of pool) {
            // 🔧 大肌群複合上限
            if (isCompoundEx(ex) && atCompoundCap(muscle)) continue;
            const cost = getAdjustedCost(ex, level, trainingStyle);
            if (!canAddEx(ex, dailyState, globalUsed, prevDayHadExtreme) || cost > rem) continue;
            out.push({ ...ex }); markUsed(ex, dailyState, globalUsed); rem -= cost; added = true; break;
        }
        if (!added) break;
    }
    return out;
};

const appendCore = (mainEx, budget, equipment, level, injuries, priorityNames, dailyState, globalUsed, count = 2, prevDayHadExtreme = false, trainingStyle = 'bodybuilding') => {
    const rem = budget - mainEx.reduce((s, e) => s + getAdjustedCost(e, level, trainingStyle), 0);
    if (rem < 5) return [];
    const sorted = sortPool(getPoolForMuscle('core', equipment, level, injuries, 3), priorityNames, false, false, level);
    /* 🔧 [2026-09] 核心輪替：本週還沒排過的核心動作先上（穩定排序、保留原本的偏好順序）。
       以前每天都從同一個排序頭拿，棒式／腹輪一週出現 4–5 次。 */
    const pool = globalUsed
        ? [...sorted.filter(e => !globalUsed.has(e.name)), ...sorted.filter(e => globalUsed.has(e.name))]
        : sorted;
    const out = []; let r = Math.min(rem, count * 8);
    for (const ex of pool) {
        if (out.length >= count) break;
        const cost = getAdjustedCost(ex, level, trainingStyle);
        if (!canAddEx(ex, dailyState, globalUsed, prevDayHadExtreme) || cost > r) continue;
        out.push({ ...ex }); markUsed(ex, dailyState, globalUsed); r -= cost;
    }
    return out;
};

const appendCorrective = (mainEx, budget, prio, equipment, level, injuries, dailyState, globalUsed, prevDayHadExtreme = false, trainingStyle = 'bodybuilding') => {
    const rem = budget - mainEx.reduce((s, e) => s + getAdjustedCost(e, level, trainingStyle), 0);
    if (rem < 4) return [];
    const avoid = avoidList(injuries);
    const pool = ALL_EXERCISES.filter(ex => ex.tier === 4 && canAddEx(ex, dailyState, globalUsed, prevDayHadExtreme) && prio.includes(ex.name) && !avoid.includes(ex.name));
    const out = []; let r = Math.min(rem, 8);
    for (const ex of pool) {
        if (out.length >= 1) break;
        const cost = getAdjustedCost(ex, level, trainingStyle);
        if (cost > r) continue;
        out.push({ ...ex }); markUsed(ex, dailyState, globalUsed); r -= cost;
    }
    return out;
};

const SBD_PRIORITY = {
    chest: ['Barbell Bench Press', 'Incline Barbell Press'],
    back: ['Deadlift', 'Barbell Row'],
    quads: ['Barbell Back Squat'],
    hamstrings: ['Romanian Deadlift'],
    shoulders: ['Barbell Overhead Press'],
    glutes: ['Hip Thrusts'],
};

const SMALL_MUSCLES = new Set(['biceps', 'triceps', 'calves', 'forearms']);
// 大肌群：每天固定 2 個複合動作，孤立輔助隨等級 (0/1/2) 增加
const BIG_MUSCLES = new Set(['chest', 'back', 'quads', 'hamstrings', 'glutes']);
const isCompoundEx = (ex) => ex && ex.cat === C; // C = 'compound'

const buildSession = ({ primaryMuscles, accessoryMuscles, warmupZone, budget, equipment, level, selectedHashtags, injuries, focus, shortFocus, zoneOverrides = null, trainingStyle = 'bodybuilding', globalUsedNames = new Set(), prevDayHadExtreme = false, excludedMuscles = new Set(), skipLegBalanceGuard = false }) => {
    const dailyState = { names: new Set(), extremeUsed: false, patterns: new Set() };
    // 🔧 排除使用者未選的大肌群（胸/背/腿）
    primaryMuscles = primaryMuscles.filter(m => !excludedMuscles.has(m));
    accessoryMuscles = accessoryMuscles.filter(m => !excludedMuscles.has(m));
    const allMuscles = [...primaryMuscles, ...accessoryMuscles];
    const priorityNames = [];
    if (trainingStyle === 'strength') {
        allMuscles.forEach(m => {
            if (SBD_PRIORITY[m]) priorityNames.push(...SBD_PRIORITY[m]);
        });
    }
    const warmup = buildWarmup(warmupZone, equipment, WARMUP_BUDGET);
    warmup.forEach(w => markUsed(w, dailyState, globalUsedNames));
    const { injected, rem: remAfterInject } = injectRequired(selectedHashtags, equipment, level, injuries, dailyState, globalUsedNames, budget, allMuscles, prevDayHadExtreme);
    const preferLowRep = (trainingStyle === 'strength');
    const preferCompound = (level !== 'advanced');
    const minPerMuscle = {};
    const maxPerMuscle = {};
    const compoundCapPerMuscle = {};
    // 等級對應的「孤立/輔助」動作數量（每個大肌群）
    const ISO_BY_LEVEL = level === 'beginner' ? 0 : level === 'intermediate' ? 1 : 2;
    const fillOrder = [...primaryMuscles];
    // 🎯 當日是否有「真正的大肌群」當主項（push=胸、pull=背、legs=腿）。
    //    注意：肩(shoulders) 被選為標籤時會被升級成 primary，但它不是 BIG_MUSCLES，
    //    所以這個旗標只認真正的大肌群，用來壓低同日小肌群/肩的上限、鎖住佔比。
    const dayHasBigPrimary = primaryMuscles.some(m => BIG_MUSCLES.has(m));
    primaryMuscles.forEach(m => {
        if (BIG_MUSCLES.has(m)) {
            // 大肌群：固定 2 個複合 + 隨等級增加的孤立 (0/1/2)
            minPerMuscle[m] = 2;
            maxPerMuscle[m] = 2 + ISO_BY_LEVEL;
            compoundCapPerMuscle[m] = 2;
        } else if (dayHasBigPrimary && level !== 'beginner') {
            // 🛑 大肌群佔比鎖：同日有大肌群主項時，被升級成 primary 的小肌群/肩
            //    上限壓到「最多 2」(且仍 < 大肌群)，避免肩推+側平舉把胸的格子吃掉。
            //    被壓縮掉的小肌群容量，改由填充階段的超級組回補。
            minPerMuscle[m] = 1;
            maxPerMuscle[m] = 2;
        } else {
            // 非大肌群主要部位（如純肩日）：維持原邏輯
            minPerMuscle[m] = (level === 'beginner') ? 1 : 2;
            maxPerMuscle[m] = (level === 'beginner') ? 2 : (level === 'intermediate') ? 3 : 4;
        }
    });
    accessoryMuscles.forEach(m => {
        fillOrder.push(m);
        if (BIG_MUSCLES.has(m)) {
            // 大肌群當輔助部位時：複合上限仍鎖 2，但總量稍低
            minPerMuscle[m] = (level === 'beginner') ? 1 : 2;
            maxPerMuscle[m] = (level === 'beginner') ? 1 : 2 + Math.max(0, ISO_BY_LEVEL - 1);
            compoundCapPerMuscle[m] = 2;
        } else {
            // 🛑 大肌群佔比鎖：當天有大肌群主項時，輔助的小肌群/肩每塊壓到「最多 1」，
            //    多出來的小肌群容量改用「超級組」回補（見填充階段超級組邏輯），
            //    而不是讓側平舉、繩索夾胸這類孤立動作把大肌群的格子吃掉。
            if (dayHasBigPrimary && level !== 'beginner') {
                minPerMuscle[m] = 1;
                maxPerMuscle[m] = 1;
            } else {
                minPerMuscle[m] = (level === 'beginner') ? 0 : 1;
                maxPerMuscle[m] = (level === 'beginner') ? 1 : (level === 'intermediate') ? 2 : 3;
            }
        }
    });
    const filled = fillByTime({
        muscles: fillOrder, budget: remAfterInject, equipment, level, injuries,
        priorityNames, preferLowRep, preferCompound, dailyState, globalUsed: globalUsedNames,
        minPerMuscle, maxPerMuscle, compoundCapPerMuscle, zoneOverrides, prevDayHadExtreme,
        preFilled: injected,
        trainingStyle
    });
    let extras = [];
    if (selectedHashtags.includes('core') && !primaryMuscles.includes('core')) {
        extras.push(...appendCore([...injected, ...filled], budget, equipment, level, injuries, MUSCLES['core']?.priorityExercises || [], dailyState, globalUsedNames, 2, prevDayHadExtreme, trainingStyle));
    }
    const all = [...injected, ...filled, ...extras];
    
    // 🛑 [修復點 3 - 保險層] Leg Balance Guard：若該日有 quads-squat 但缺 hamstrings-hinge，強制補注
    // 🆕 例外：當天是「股四頭專屬日 (lower_a)」時跳過此守衛——後鏈(羅馬硬舉)會排在隔天的
    // 後鏈日 (lower_b)，刻意把深蹲與硬舉分開以降低單日 CNS，這裡不該又把硬舉硬塞回股四頭日。
    const hasQuadsSquat = all.some(e => e.zone === 'quads-squat');
    const hasHinge = all.some(e => e.zone === 'hamstrings-hinge');
    const legsAreExcluded = excludedMuscles.has('quads') || excludedMuscles.has('hamstrings') || excludedMuscles.has('legs');
    if (hasQuadsSquat && !hasHinge && !legsAreExcluded && !skipLegBalanceGuard) {
        const hingePool = ALL_EXERCISES
            .filter(e =>
                e.zone === 'hamstrings-hinge' &&
                !avoidList(injuries).includes(e.name) &&
                !globalUsedNames.has(e.name) &&
                (equipment !== 'bodyweight' || e.eq === 'bodyweight' || e.eq === 'band') &&
                passesLevelGate(e, level, equipment)               // ⚖️ 統一等級閘門
            )
            .sort((a, b) => a.tier - b.tier);
        if (hingePool[0]) {
            all.push({ ...hingePool[0] });
            markUsed(hingePool[0], dailyState, globalUsedNames);
        }
    }

    // 🆘 [掉塊救援 Anti-Collapse Rescue]
    // 當部位選太少又分太多天時，跨日去重 (globalUsedNames) 會把該日合法肌群的動作庫吃光，
    // 導致某天塌成只剩 1 個動作 (甚至只剩一個 core 補位)。這裡做最後一道防線：
    // 若該日「非核心」動作數 < 2，放寬跨日去重 (只看當日 dailyState) 再從合法肌群補滿到至少 2 個。
    // 寧可讓某動作跨日重複，也不要讓使用者面對一個幾乎空白的訓練日。
    const realCount = () => all.filter(e => (e.muscle !== 'core' && e.cat !== 'core' && e.zone !== 'core')).length;
    if (allMuscles.length > 0 && realCount() < 2) {
        const RESCUE_TARGET = 2;
        // 依 fillOrder (主→輔) 的肌群順序，挑 tier 最低(最重要)、當日尚未出現的複合動作
        for (const m of fillOrder) {
            if (realCount() >= RESCUE_TARGET) break;
            const pool = ALL_EXERCISES
                .filter(e =>
                    e.muscle === m &&
                    !avoidList(injuries).includes(e.name) &&
                    !dailyState.names.has(e.name) &&            // 只防當日重複，放寬跨日
                    !(dailyState.patterns && dailyState.patterns.has(`${e.muscle}::${e.zone}::${e.cat}`)) && // 🛡️ 同動作模式防重
                    !all.some(x => x.name === e.name) &&
                    (equipment !== 'bodyweight' || e.eq === 'bodyweight' || e.eq === 'band') &&
                    passesLevelGate(e, level, equipment)        // ⚖️ 統一等級閘門
                )
                .sort((a, b) => a.tier - b.tier);
            if (pool[0]) {
                all.push({ ...pool[0] });
                markUsed(pool[0], dailyState, globalUsedNames);
            }
        }
    }

    // 🔧 補到「每日下限」：核心(複合)動作由前面選取已就位，這裡用輔助(孤立)補滿到該等級的
    //    最少動作數（新手 3 / 中階 4 / 高階 5），維持「複合先行、輔助補足」的組成。
    //    新手只補複合(維持純複合)；中高階補位優先孤立(輔助)。
    const MIN_BY_LEVEL = getLevelCode(level).exMin;   // ⚖️ 讀法典：新手 3 / 中階 4 / 高階 5
    if (allMuscles.length > 0) {
        let guard = 0;
        while (realCount() < MIN_BY_LEVEL && guard < 14) {
            guard++;
            let added = false;
            for (const mus of fillOrder) {
                const pool = ALL_EXERCISES
                    .filter(e =>
                        e.muscle === mus &&
                        !avoidList(injuries).includes(e.name) &&
                        !dailyState.names.has(e.name) &&
                        !(dailyState.patterns && dailyState.patterns.has(`${e.muscle}::${e.zone}::${e.cat}`)) && // 🛡️ 同動作模式防重（RDL+啞鈴RDL 不得同日）
                        !all.some(x => x.name === e.name) &&
                        (equipment !== 'bodyweight' || e.eq === 'bodyweight' || e.eq === 'band') &&
                        passesLevelGate(e, level, equipment) &&                        // ⚖️ 統一等級閘門
                        (getLevelCode(level).allowIsolationFill || isCompoundEx(e)) && // 新手只補複合
                        (e.cns !== 'extreme')                                          // 補位不再加極限 CNS
                    )
                    .sort((a, b) => {
                        if (level === 'beginner') return a.tier - b.tier;             // 新手：複合(tier小)優先
                        const aIso = isCompoundEx(a) ? 1 : 0, bIso = isCompoundEx(b) ? 1 : 0;
                        return (aIso - bIso) || (b.tier - a.tier);                     // 中高階：孤立(輔助)優先
                    });
                if (pool[0]) { all.push({ ...pool[0] }); markUsed(pool[0], dailyState, globalUsedNames); added = true; break; }
            }
            if (!added) break; // 動作庫已補不出更多 → 停
        }
    }

    // 🛑 [大肌群佔比鎖 — 最終守衛] 教練標準：同一天若有大肌群主項，
    //    每一個小肌群/肩的「正式動作數」都不得超過當日最大的大肌群動作數。
    //    例：push 日胸 2 → 肩最多 2、三頭最多 2；胸若只有 1 → 小肌群一律壓到 1。
    //    超出的部分砍掉「最不重要」(孤立、tier 最高) 的那幾個；被砍掉的小肌群容量
    //    稍後由超級組階段以「不另佔動作格」的方式回補（見 injectSupersetTags）。
    if (level !== 'beginner') {
        const dayHasBig = allMuscles.some(m => BIG_MUSCLES.has(m));
        if (dayHasBig) {
            const isReal = (e) => e.muscle !== 'core' && e.tier !== 4 && !e.isWarmup;
            const countByMuscle = (mus) => all.filter(e => e.muscle === mus && isReal(e)).length;
            const maxBig = Math.max(...allMuscles.filter(m => BIG_MUSCLES.has(m)).map(countByMuscle), 0);
            for (const mus of allMuscles) {
                if (BIG_MUSCLES.has(mus) || mus === 'core') continue;
                let excess = countByMuscle(mus) - maxBig;
                if (excess <= 0) continue;
                // 砍最不重要：先孤立、再 tier 高的
                const victims = all
                    .filter(e => e.muscle === mus && isReal(e))
                    .sort((a, b) => {
                        const aIso = isCompoundEx(a) ? 1 : 0, bIso = isCompoundEx(b) ? 1 : 0;
                        return (aIso - bIso) || (b.tier - a.tier); // 孤立先砍、tier 高先砍
                    });
                for (const v of victims) {
                    if (excess <= 0) break;
                    const idx = all.indexOf(v);
                    if (idx !== -1) { all.splice(idx, 1); excess--; }
                }
            }
        }
    }

    const ordered = reorderExercises(all, allMuscles, false, trainingStyle);

    // ⚖️ 每日動作數量範圍（讀法典）：新手 3–4、中階 4–5、高階 5–6
    let SESSION_EX_CAP = getLevelCode(level).exMax;

    // 🫁 [高 CNS 減量] 教練觀點：深蹲(extreme)+羅馬硬舉(high) 這類「兩個以上大重量複合」
    // 同日時，神經系統負擔已經很重，再硬塞滿 6 個動作（尤其再加 Reverse Nordic 這種高張力離心）
    // 會讓腿日過硬、恢復不良。這裡依「當日 high/extreme 大複合的數量」動態扣減動作上限：
    //   2 個重壓複合 → 扣 1；3 個含以上 → 扣 2。
    // 但仍嚴守難度基準下限（新手至少 3、中階至少 3、進階至少 4），不會把課表砍到太空。
    const heavyCompoundCount = ordered.filter(e =>
        e.cat === C && (e.cns === 'extreme' || e.cns === 'high') && e.tier <= 2
    ).length;
    if (heavyCompoundCount >= 3) SESSION_EX_CAP -= 2;
    else if (heavyCompoundCount >= 2) SESSION_EX_CAP -= 1;
    // 下限（讀法典）：新手 3 / 中階 4 / 高階 5（重壓扣減後仍守住範圍最小值）
    const CAP_FLOOR = getLevelCode(level).exMin;
    SESSION_EX_CAP = Math.max(CAP_FLOOR, SESSION_EX_CAP);

    // ── 🔁 [超級組：先配對、再依「格子」截斷] ─────────────────────────────
    // ⚖️ [S-11] 現行決定：**超級組 B 一樣佔一格**（與 plan-auditor 官方標準一致 ——
    //    每日總動作數就是總數，超級組省的是「時間」不是「格子」，數量紀律優先於灌量）。
    //    早期曾有相反的設計（B 不佔格，讓被佔比鎖壓縮掉的小肌群能塞回來），
    //    那份註解已移除，以免與 slotCost() 的實作互相矛盾。
    // 做法：先在「未截斷」的完整清單上配對超級組（小肌群孤立／拮抗對），再依格數截斷。
    const ssEligible = shouldEnableSuperset(level, budget + WARMUP_BUDGET + COOLDOWN, trainingStyle);
    const tagged = injectSupersetTags(ordered, ssEligible, level);

    // 依「格子數」截斷：超級組 B (supersetOrder==='B') 不另計一格。
    // ⚖️ 每日超級組上限讀法典（新手 0 / 中階 1 / 高階 2），避免整堂課都在趕（恢復風險）。
    const MAX_SUPERSETS_PER_DAY = getLevelCode(level).maxSupersetsPerDay;
    const capped = [];
    let slotsUsed = 0;
    let ssGroupsKept = 0;
    const seenSS = new Set();
    for (const ex of tagged) {
        const isSSb = ex.supersetId && ex.supersetOrder === 'B';
        const isSSa = ex.supersetId && ex.supersetOrder === 'A';
        // 超級組組數上限：超過上限的超級組「拆掉」當普通動作處理（仍佔格）
        if (ex.supersetId && !seenSS.has(ex.supersetId)) {
            seenSS.add(ex.supersetId);
            if (ssGroupsKept >= MAX_SUPERSETS_PER_DAY) {
                // 超過上限 → 還原成普通動作（清掉超級組標記）
                ex._ssDropped = true;
            } else {
                ssGroupsKept++;
            }
        }
        // ⚖️ 超級組 B 一樣佔格（與 plan-auditor 官方標準一致：每日總動作數就是總數，
        //    超級組省的是「時間」不是「格子」——數量紀律優先於灌量）。
        const slotCost = 1;
        if (slotsUsed + slotCost > SESSION_EX_CAP) break;
        capped.push(ex);
        slotsUsed += slotCost;
    }
    // 清理被「拆掉」的超級組標記（讓 UI 不顯示殘缺的單邊超級組）
    const groupCount = {};
    capped.forEach(e => { if (e.supersetId) groupCount[e.supersetId] = (groupCount[e.supersetId] || 0) + 1; });
    capped.forEach(e => {
        if (e.supersetId && (e._ssDropped || groupCount[e.supersetId] < 2)) {
            delete e.supersetId; delete e.supersetType; delete e.isSuperset;
            delete e.supersetOrder; delete e._ssDropped;
            if (e.rest === '0s') e.rest = '60s';
            if (e.note && (e.note.includes('超級組') || e.note.includes('力竭組'))) delete e.note;
        }
    });

    const finalExercises = capped;
    const supersetEnabled = ssEligible && finalExercises.some(e => e.supersetId);

    const totalTime = finalExercises.reduce((s, e) => s + e.time + TR, 0);
    // ⚖️ muscleOrder：當日「主→輔」肌群順序，供最終重排使用（群聚+順序的當日真相）
    return { warmup, exercises: finalExercises, focus, shortFocus, time: String(Math.round(WARMUP_BUDGET + totalTime + COOLDOWN)), supersetEnabled, muscleOrder: [...allMuscles] };
};

// ─── PPL ─────────────────────────────────────────────────────
const PPL_CONFIGS = {
    push: {
        primaryMuscles: ['chest'], accessoryMuscles: ['shoulders', 'triceps'], warmupZone: 'upper',
        focus: SPLIT_FOCUS.push, shortFocus: 'PUSH',
        zoneOverrides: { shoulders: ['shoulders-press', 'shoulders-lateral'] },
    },
    pull: {
        primaryMuscles: ['back'], accessoryMuscles: ['biceps', 'shoulders'], warmupZone: 'upper',
        focus: SPLIT_FOCUS.pull, shortFocus: 'PULL',
        zoneOverrides: { back: ['back-lats', 'back-mid', 'back-lower'], shoulders: ['shoulders-rear'] },
    },
    legs: {
        primaryMuscles: ['quads', 'hamstrings'], accessoryMuscles: ['glutes', 'calves'], warmupZone: 'lower',
        focus: SPLIT_FOCUS.legs, shortFocus: 'LEGS'
    },
};

const getTagAdjustedPPLConfig = (dayId, selectedHashtags) => {
    const d = PPL_CONFIGS[dayId];
    let primary = [...d.primaryMuscles];
    let accessory = [...d.accessoryMuscles];
    let focus = d.focus;

    const boostedMuscles = selectedHashtags
        .filter(t => MUSCLES[t] && t !== 'core')
        .flatMap(t => MUSCLES[t].muscles || []);

    // ⚖️ [分化純度法] #Arms 標籤不做跨日交叉填充。
    //    教練標準：三頭與「推」同日（臥推/肩推已預疲勞三頭）、二頭與「拉」同日
    //    （划船/引體已預疲勞二頭）。Push 日本來就有 triceps、Pull 日本來就有 biceps，
    //    選了 #arms 只是提高它們的配額優先度，絕不把三頭塞進拉日、二頭塞進推日。
    //    （舊版「修復點 1A」方向完全相反，是 Pull 日出現三頭下壓的根源，已廢止。）

    accessory.forEach(m => {
        if (boostedMuscles.includes(m) && !primary.includes(m)) primary = [...primary, m];
    });
    const newAccessory = accessory.filter(m => !primary.includes(m) || d.primaryMuscles.includes(m));

    const boostedKeys = boostedMuscles
        .filter(m => primary.includes(m) && !d.primaryMuscles.includes(m));
    if (boostedKeys.length) focus = withBoostedFocus(d.focus, boostedKeys);

    if (dayId === 'legs' && boostedMuscles.includes('glutes')) {
        if (!primary.includes('glutes')) primary = ['quads', 'hamstrings', 'glutes'];
        focus = SPLIT_FOCUS.legs_glute_priority;
    }
    return { primary, accessory: newAccessory, focus, zoneOverrides: d.zoneOverrides, warmupZone: d.warmupZone, shortFocus: d.shortFocus };
};

const buildPPLSession = (dayId, budget, equipment, level, selectedHashtags, injuries, trainingStyle = 'bodybuilding', globalUsedNames = new Set(), prevDayHadExtreme = false, excludedMuscles = new Set()) => {
    const { primary, accessory, focus, shortFocus, warmupZone, zoneOverrides } = getTagAdjustedPPLConfig(dayId, selectedHashtags);
    return buildSession({ primaryMuscles: primary, accessoryMuscles: accessory, warmupZone, budget, equipment, level, selectedHashtags, injuries, focus, shortFocus, zoneOverrides, trainingStyle, globalUsedNames, prevDayHadExtreme, excludedMuscles });
};

// Full Body session rotation configs (A/B alternation for 1-2 day splits)
// 🔧 A/B 互補設計：天數少 (2天) 時每日動作數有限，若兩天都先練胸+背，肩/腿/臂會被擠掉。
// A 日偏「推 + 股四頭」(胸·肩·三頭·股四頭)，B 日偏「拉 + 後鏈」(背·二頭·腿後·臀)，
// 讓有限的名額在兩天之間互補，整週盡量涵蓋所有選到的肌群。
const FB_CONFIGS = [
    { muscles: ['quads', 'chest', 'shoulders', 'triceps', 'core', 'back', 'hamstrings'], warmup: 'full', focus: SPLIT_FOCUS.fb_a, shortFocus: 'FB-A' },
    { muscles: ['back', 'hamstrings', 'glutes', 'biceps', 'core', 'chest', 'shoulders'], warmup: 'full', focus: SPLIT_FOCUS.fb_b, shortFocus: 'FB-B' },
    { muscles: ['legs', 'chest', 'shoulders', 'back', 'core', 'biceps', 'triceps'], warmup: 'full', focus: SPLIT_FOCUS.fb_c, shortFocus: 'FB-C' },
];

const buildFBSession = (configIdx, budget, equipment, level, selectedHashtags, injuries, trainingStyle = 'bodybuilding', globalUsedNames = new Set(), prevDayHadExtreme = false, excludedMuscles = new Set(), singleDay = false) => {
    const dailyState = { names: new Set(), extremeUsed: false, patterns: new Set() };
    const cfg = FB_CONFIGS[configIdx % FB_CONFIGS.length];
    // 🔧 'legs' 標籤在 FB 設定中是聚合詞，需展開後再排除
    const isExcluded = (m) => excludedMuscles.has(m) || (m === 'legs' && (excludedMuscles.has('quads') || excludedMuscles.has('hamstrings')));
    const boosted = [...new Set(selectedHashtags.filter(t => MUSCLES[t]).flatMap(t => MUSCLES[t].muscles || []))].filter(m => !isExcluded(m));
    const cfgMuscles = (cfg.muscles || []).filter(m => !isExcluded(m));
    // 🔧 排序改「依當日 A/B 設定的肌群順序」而非把所有選到的肌群一律塞到最前面。
    // 否則 2 天全身時，兩天都會先練胸+背，把肩/腿/臂擠出名額。
    // 規則：先排「當日設定 (cfgMuscles) 中、使用者也有選 (boosted) 的肌群」(維持 A/B 偏向)，
    //       再補上其他被選到但不在當日設定的肌群，最後才是設定中未被選到的補充肌群。
    const boostedInCfg = cfgMuscles.filter(m => boosted.includes(m));
    const boostedExtra = boosted.filter(m => !cfgMuscles.includes(m));
    const cfgRest = cfgMuscles.filter(m => !boosted.includes(m));
    const foundations = singleDay ? ['quads', 'chest', 'back'].filter(m => !isExcluded(m)) : [];
    const orderedMuscles = [...new Set([...foundations, ...boostedInCfg, ...boostedExtra, ...cfgRest])];
    const minPerMuscle = {};
    boosted.forEach(m => { minPerMuscle[m] = 2; });
    cfgMuscles.filter(m => !boosted.includes(m)).forEach(m => { minPerMuscle[m] = 1; });
    const VOL_WEIGHTS = { quads: 5, hamstrings: 5, glutes: 5, back: 4, chest: 4, shoulders: 4, biceps: 2, triceps: 2, calves: 2, core: 1 };
    const totalWeight = orderedMuscles.reduce((sum, m) => sum + (VOL_WEIGHTS[m] || 2), 0);
    const estTotalExercises = Math.floor(budget / 6);
    const maxPerMuscle = {};
    orderedMuscles.forEach(m => {
        const weight = VOL_WEIGHTS[m] || 2;
        maxPerMuscle[m] = Math.max(minPerMuscle[m] || 1, Math.round((weight / totalWeight) * estTotalExercises));
    });
    const priorityNames = []; let preferLowRep = false, preferCompound = false;
    selectedHashtags.forEach(tag => {
        const info = ALL_TAGS[tag]; if (!info) return;
        (info.priorityExercises || []).forEach(n => { if (!priorityNames.includes(n)) priorityNames.push(n); });
        if (info.preferLowRep) preferLowRep = true;
        if (info.preferCompound) preferCompound = true;
    });
    if (trainingStyle === 'strength') {
        preferCompound = true;
        preferLowRep = true;
        orderedMuscles.forEach(muscle => {
            if (equipment === 'bodyweight') return;
            (SBD_PRIORITY[muscle] || []).forEach(name => {
                if (!priorityNames.includes(name)) priorityNames.push(name);
            });
        });
    }
    const warmup = buildWarmup(cfg.warmup, equipment, WARMUP_BUDGET);
    warmup.forEach(w => markUsed(w, dailyState, globalUsedNames));
    const { injected } = injectRequired(selectedHashtags, equipment, level, injuries, dailyState, globalUsedNames, budget, null, prevDayHadExtreme);
    // 單日全身先保留基本覆蓋；能力、器材與傷勢閘門仍須遵守。
    // 最終估時若超出預算，明確回報，不靜默刪掉唯一的推／拉／下肢動作。
    for (const muscle of foundations) {
        if (injected.some(e => e.muscle === muscle)) continue;
        const candidate = sortPool(getPoolForMuscle(muscle, equipment, level, injuries, 3, priorityNames), priorityNames, preferLowRep, false, level)
            .find(e => canAddEx(e, dailyState, globalUsedNames, prevDayHadExtreme)
                && passesLevelGate(e, level, equipment)
                && (getLevelCode(level).allowIsolationFill || e.cat !== I));
        if (candidate) {
            injected.push({ ...candidate });
            markUsed(candidate, dailyState, globalUsedNames);
        }
    }
    const remAfterInject = budget - injected.reduce((s, e) => s + e.time + TR, 0);
    const filled = fillByTime({
        muscles: orderedMuscles, budget: remAfterInject, equipment, level, injuries,
        priorityNames, preferLowRep, preferCompound, dailyState, globalUsed: globalUsedNames,
        minPerMuscle, maxPerMuscle, prevDayHadExtreme,
        preFilled: injected
    });
    let extras = [];
    if (selectedHashtags.includes('core')) {
        extras.push(...appendCore([...injected, ...filled], budget, equipment, level, injuries, MUSCLES['core']?.priorityExercises || [], dailyState, globalUsedNames, 2, prevDayHadExtreme));
    }
    const all = [...injected, ...filled, ...extras];
    const ordered = reorderExercises(all, orderedMuscles, false, trainingStyle);

    // ⚖️ 全身日同樣套用每日動作數量天花板（讀法典）：新手 4 / 中階 5 / 高階 6
    const FB_SESSION_EX_CAP = getLevelCode(level).exMax;
    const foundationExercises = foundations.map(m => ordered.find(e => e.muscle === m)).filter(Boolean);
    const reserved = new Set(foundationExercises);
    const selected = [...foundationExercises, ...ordered.filter(e => !reserved.has(e))].slice(0, FB_SESSION_EX_CAP);
    const cappedFB = reorderExercises(selected, orderedMuscles, false, trainingStyle);

    // 🛑 [修復點 2B] 依「實際生成結果」回填 flag，避免誤導 UI
    const ssEligible = shouldEnableSuperset(level, budget + WARMUP_BUDGET + COOLDOWN, trainingStyle);
    const finalExercises = injectSupersetTags(cappedFB, ssEligible, level);
    // ⚖️ 超級組每日上限讀法典：超過的組別還原成普通動作
    const ssMax = getLevelCode(level).maxSupersetsPerDay;
    const ssSeen = [];
    finalExercises.forEach(e => {
        if (!e.supersetId) return;
        if (!ssSeen.includes(e.supersetId)) ssSeen.push(e.supersetId);
        if (ssSeen.indexOf(e.supersetId) >= ssMax) {
            delete e.supersetId; delete e.supersetType; delete e.isSuperset; delete e.supersetOrder;
            if (e.rest === '0s') e.rest = '60s';
            if (e.note && (e.note.includes('超級組') || e.note.includes('力竭組'))) delete e.note;
        }
    });
    const supersetEnabled = ssEligible && finalExercises.some(e => e.supersetId);

    const totalTime = finalExercises.reduce((s, e) => s + e.time + TR, 0);
    return { warmup, exercises: finalExercises, focus: cfg.focus, shortFocus: cfg.shortFocus, time: String(Math.round(WARMUP_BUDGET + totalTime + COOLDOWN)), supersetEnabled, muscleOrder: [...orderedMuscles] };
};

const PHASES = [
    { week: 1, name: 'Base', mult: 1.0, label: 'FOUNDATION', intensify: false, deload: false },
    { week: 2, name: 'Build', mult: 1.15, label: 'ACCUMULATION', intensify: false, deload: false },
    { week: 3, name: 'Peak', mult: 1.0, label: 'INTENSIFICATION', intensify: true, deload: false },
    { week: 4, name: 'Deload', mult: 0.6, label: 'DELOAD', intensify: false, deload: true },
];

// ⚖️ [週期化法] 4 週波段依「等級」開不同處方 —— 同一套 W1 Base → W2 Build →
//    W3 Peak → W4 Deload 骨架，但強化週(W3)的強度深度必須符合訓練年資：
//      新手   — 絕不下探低次數區（新手第3週做 3-5RM 是教練硬傷）。
//               W3 僅把次數收斂到 10-12 並提示加重，動作模式優先。
//      中階   — T1 走 6-8RM / 180s（重量週），T2 8-10 / 120s；不碰神經極限區。
//      高階   — T1 3-5RM / 240s（神經高峰），T2 6-8 / 120s。
//    Deload 對所有等級一致：組數 ×0.6、恢復優先（intensity offset 已在外層歸零）。
const applyPhase = (ex, phase, level = 'intermediate') => {
    if (ex.isWarmup || ex.tier === 4) return ex;
    let newSets = phase.deload
        ? Math.max(2, Math.floor((ex.sets || 3) * phase.mult))
        : Math.max(2, Math.round((ex.sets || 3) * phase.mult));
    let newReps = ex.reps;
    let newRest = ex.rest;
    if (phase.intensify) {
        if (level === 'advanced') {
            if (ex.tier === 1) { newReps = '3-5'; newRest = '240s'; }
            else if (ex.tier === 2) { newReps = '6-8'; newRest = '120s'; }
        } else if (level === 'intermediate') {
            if (ex.tier === 1) { newReps = '6-8'; newRest = '180s'; }
            else if (ex.tier === 2) { newReps = '8-10'; newRest = '120s'; }
        } else {
            // 新手強化週：小幅收斂次數 + 加重提示，禁止進入低次數高強度區
            //（本來就 8–10 下的新手力量取向複合不會被拉高成 10–12，見下方「強化週只會變少」）
            newReps = '10-12';
        }
    }
    // 🔧 [2026-10] 強化週只會讓次數變少（更重），不會變多：引體向上這種本來就 5–8 下的，
    //    以前套「tier 2 → 8–10」反而在高峰週變成更多下。
    if (phase.intensify) {
        const topOf = (r) => Number(String(r || '').match(/(\d+)\s*[-–]\s*(\d+)/)?.[2]);
        if (topOf(newReps) > topOf(ex.reps)) { newReps = ex.reps; newRest = ex.rest; }
    }
    return { ...ex, sets: newSets, reps: newReps, rest: newRest };
};

const UL_CONFIGS = {
    upper: { primary: ['chest', 'back', 'shoulders'], accessory: ['biceps', 'triceps'], warmup: 'upper', focus: SPLIT_FOCUS.upper, shortFocus: 'UPPER' },
    // 🆕 上半身 A/B 拆分：每日動作數有限 (新手3/中階4)，硬塞胸+背+肩+臂會擠掉肩臂。
    // 改成兩天上半身互補：A 偏推 (胸·肩·三頭)，B 偏拉 (背·二頭·後三角)，
    // 確保整週每個上半身肌群都練得到，不再只剩胸+背。
    upper_a: { primary: ['chest', 'shoulders', 'triceps'], accessory: [], warmup: 'upper', focus: SPLIT_FOCUS.upper_a, shortFocus: 'UPPER A' },
    upper_b: { primary: ['back', 'biceps'], accessory: ['shoulders'], warmup: 'upper', focus: SPLIT_FOCUS.upper_b, shortFocus: 'UPPER B' },
    lower: { primary: ['quads', 'hamstrings', 'glutes'], accessory: ['calves', 'core'], warmup: 'lower', focus: SPLIT_FOCUS.lower, shortFocus: 'LOWER' },
    // 🆕 下肢 A/B 拆分：把深蹲(extreme)主導的「股四頭日」與羅馬硬舉/臀推(high)主導的
    // 「後鏈日」分開，避免兩個大重量複合擠在同一天 → 腿日不再過硬，且前側/後側都練得更完整。
    // A 日股四頭優先 (深蹲·腿伸·弓步)，B 日後鏈優先 (羅馬硬舉·臀推·腿後彎舉)。
    lower_a: { primary: ['quads'], accessory: ['glutes', 'calves'], warmup: 'lower', focus: SPLIT_FOCUS.lower_a, shortFocus: 'LOWER A' },
    lower_b: { primary: ['hamstrings', 'glutes'], accessory: ['calves'], warmup: 'lower', focus: SPLIT_FOCUS.lower_b, shortFocus: 'LOWER B' },
};
const buildULSession = (id, budget, equipment, level, selectedHashtags, injuries, trainingStyle = 'bodybuilding', globalUsedNames = new Set(), prevDayHadExtreme = false, excludedMuscles = new Set()) => {
    const def = UL_CONFIGS[id] || UL_CONFIGS.upper;
    // 股四頭專屬日 (lower_a) 跳過「深蹲必補硬舉」守衛，讓後鏈動作留在 lower_b
    const skipLegBalanceGuard = (id === 'lower_a');
    return buildSession({ primaryMuscles: def.primary, accessoryMuscles: def.accessory, warmupZone: def.warmup, budget, equipment, level, selectedHashtags, injuries, focus: def.focus, shortFocus: def.shortFocus, trainingStyle, globalUsedNames, prevDayHadExtreme, excludedMuscles, skipLegBalanceGuard });
};

const ARNOLD_CONFIGS = {
    chest_back: { primary: ['chest', 'back'], accessory: [], warmup: 'upper', focus: SPLIT_FOCUS.chest_back, shortFocus: 'PUSH-PULL' },
    shoulder_arms: { primary: ['shoulders', 'biceps', 'triceps'], accessory: [], warmup: 'upper', focus: SPLIT_FOCUS.shoulder_arms, shortFocus: 'ARMS' },
    legs: { primary: ['quads', 'hamstrings', 'glutes'], accessory: ['calves', 'core'], warmup: 'lower', focus: SPLIT_FOCUS.arnold_legs, shortFocus: 'LEGS' },
};

const buildArnoldSession = (id, budget, equipment, level, selectedHashtags, injuries, trainingStyle = 'bodybuilding', globalUsedNames = new Set(), prevDayHadExtreme = false, excludedMuscles = new Set()) => {
    const def = ARNOLD_CONFIGS[id] || ARNOLD_CONFIGS.chest_back;
    return buildSession({ primaryMuscles: def.primary, accessoryMuscles: def.accessory, warmupZone: def.warmup, budget, equipment, level, selectedHashtags, injuries, focus: def.focus, shortFocus: def.shortFocus, trainingStyle, globalUsedNames, prevDayHadExtreme, excludedMuscles });
};

// ─── 大肌群「未選即排除」判定 ──────────────────────────────────
// 規則：胸 / 背 / 腿 為三大肌群。若使用者選了其中 2 個但漏掉第 3 個，
// 視為「不想練那個部位」→ 從預設分化中「完全排除」該部位（不主動塞進課表）。
// 特例：胸↔背為拮抗推拉對，漏掉其一時除了排除，另外回傳 balanceHint，
//       讓 UI 顯示提示橫幅＋一鍵補入按鈕，由使用者自行決定是否加入。
const BIG_MUSCLE_TAGS = ['chest', 'back', 'legs'];
const BIG_MUSCLE_UNDERLYING = {
    chest: ['chest'],
    back: ['back'],
    legs: ['quads', 'hamstrings', 'glutes', 'calves', 'legs'],
};
const resolveMuscleScope = (nonCoreMuscleHashes = []) => {
    const selectedBig = BIG_MUSCLE_TAGS.filter(t => nonCoreMuscleHashes.includes(t));
    const omittedBig = BIG_MUSCLE_TAGS.filter(t => !nonCoreMuscleHashes.includes(t));
    const excludedMuscles = new Set();
    let balanceHint = null;

    // 只有「選了 2 個大肌群、漏掉 1 個」時才觸發排除意圖
    if (selectedBig.length === 2 && omittedBig.length === 1) {
        const omitted = omittedBig[0];
        // 一律排除被漏掉的大肌群（不主動塞動作）
        (BIG_MUSCLE_UNDERLYING[omitted] || [omitted]).forEach(m => excludedMuscles.add(m));
        // 胸↔背拮抗對：額外給提示（UI 會顯示橫幅＋一鍵補入）
        if (omitted === 'chest' && selectedBig.includes('back')) {
            balanceHint = '偵測到你選了背但未選胸。本計劃已不含胸部動作；若想維持推拉平衡，可點「加入胸部」補上一個複合動作。';
        } else if (omitted === 'back' && selectedBig.includes('chest')) {
            balanceHint = '偵測到你選了胸但未選背。本計劃已不含背部動作；若想維持推拉平衡，可點「加入背部」補上一個複合動作。';
        }
    }
    return { excludedMuscles, balanceHint };
};

// ─── SCHEDULE BUILDER ────────────────────────────────────────
const buildScheduleRaw = (daysPerWeek, nonCoreMuscleHashes = [], excludedMuscles = new Set()) => {
    // 1. 將標籤轉換為底層肌群陣列
    const selected = nonCoreMuscleHashes.flatMap(t => MUSCLES[t]?.muscles || []);
    const has = (m) => selected.includes(m);

    // ─── 極端專項判定 (Edge Cases) ───
    // 🎯 案例 A：沙漏型 / 比基尼 (肩+背+臀，絕對不練胸/腿前側)
    if (has('shoulders') && has('back') && has('glutes') && !has('chest') && !has('quads')) {
        const hourglassCycle = [
            { type: 'custom', primary: ['back', 'shoulders'], accessory: ['core'], warmupZone: 'upper', focus: '上半身輪廓 (背·肩)', shortFocus: 'UPPER' },
            { type: 'custom', primary: ['glutes', 'hamstrings'], accessory: ['core'], warmupZone: 'lower', focus: '下肢後鏈 (臀·腿後)', shortFocus: 'LOWER' },
            { type: 'custom', primary: ['shoulders', 'glutes'], accessory: ['back'], warmupZone: 'full', focus: '沙漏型強化 (肩·臀)', shortFocus: 'HOURGLASS' }
        ];
        return { days: Array.from({ length: daysPerWeek }, (_, i) => hourglassCycle[i % 3]), splitLabel: '沙漏型雕塑分化 (肩·背·臀)' };
    }

    // 🎯 案例 B：胸臂街健 / Bro Split (胸+手臂，絕對不練背/腿)
    if (has('chest') && (has('biceps') || has('triceps')) && !has('back') && !has('glutes') && !has('quads')) {
        // 🔧 若使用者也選了肩，把肩併入胸日 (推力結構)，避免肩被整個 split 忽略。
        const chestDayPrimary = has('shoulders') ? ['chest', 'shoulders'] : ['chest'];
        const chestDayFocus = has('shoulders') ? '推力結構 (胸·肩·三頭)' : '胸大肌結構';
        const chestArmsCycle = [
            { type: 'custom', primary: chestDayPrimary, accessory: has('shoulders') ? ['triceps', 'core'] : ['core'], warmupZone: 'upper', focus: chestDayFocus, shortFocus: 'CHEST' },
            // 🔧 手臂日純粹練二頭+三頭(+核心)，不再把肩放進來搶名額（肩已在胸日練到），
            //    確保新手 3 格也能讓二頭、三頭都各排到。
            { type: 'custom', primary: ['biceps', 'triceps'], accessory: ['core'], warmupZone: 'upper', focus: '手臂維度特訓', shortFocus: 'ARMS' }
        ];
        // 🔧 [2026-10] 一週只練一天：輪不到手臂日，胸日又禁二頭 → 選了手臂卻整週沒有二頭。
        //    一天就排成「胸＋手臂」同一天（胸先、二頭三頭收尾），上半身日不禁拉。
        if (daysPerWeek <= 1) {
            return { days: [{ type: 'custom', primary: chestDayPrimary, accessory: ['triceps', 'biceps', 'core'], warmupZone: 'upper', focus: '胸·手臂 (胸·二頭·三頭)', shortFocus: 'UPPER' }], splitLabel: '街健重點分化 (胸·臂)' };
        }
        return { days: Array.from({ length: daysPerWeek }, (_, i) => chestArmsCycle[i % 2]), splitLabel: '街健重點分化 (胸·臂)' };
    }

    // 🎯 案例 C：純下肢專項 (絕對不練上半身)
    if ((has('quads') || has('glutes')) && !has('chest') && !has('shoulders') && !has('back') && !has('biceps')) {
        const lowerCycle = [
            { type: 'custom', primary: ['quads', 'hamstrings'], accessory: ['calves', 'core'], warmupZone: 'lower', focus: '前側主導 (股四頭+腿後)', shortFocus: 'QUADS' },
            { type: 'custom', primary: ['glutes', 'hamstrings'], accessory: ['quads', 'core'], warmupZone: 'lower', focus: '後鏈主導 (臀·腿後)', shortFocus: 'GLUTES' }
        ];
        return { days: Array.from({ length: daysPerWeek }, (_, i) => lowerCycle[i % 2]), splitLabel: '下肢專項分化 (腿·臀)' };
    }

    // ─── 陣營權重計算 (處理任意部位選擇) ───
    const upperMuscles = ['chest', 'back', 'shoulders', 'biceps', 'triceps'];
    const lowerMuscles = ['quads', 'hamstrings', 'glutes', 'calves'];
    
    // 計算使用者選了幾個上半身/下半身部位
    const upperFocusCount = upperMuscles.filter(has).length;
    const lowerFocusCount = lowerMuscles.filter(has).length;

    // ─── 排除大肌群後的路由覆寫 ───
    // 若使用者選了 2 個大肌群、漏掉腿 → 排除整個下肢，全部走上半身分化
    const legsExcluded = excludedMuscles.has('quads') || excludedMuscles.has('legs');
    const chestExcluded = excludedMuscles.has('chest');
    if (legsExcluded) {
        if (daysPerWeek <= 2) {
            return {
                days: Array.from({ length: daysPerWeek }, (_, i) => ({ type: 'fb', configIdx: i })),
                splitLabel: '上半身綜合循環 (No Legs)'
            };
        }
        // 上半身推/拉循環（無腿日）；偶數補肩臂日
        const upperCycle = chestExcluded
            ? [
                { type: 'ul', id: 'upper' },
                { type: 'custom', primary: ['back', 'shoulders'], accessory: ['biceps', 'triceps'], warmupZone: 'upper', focus: '背·肩·臂', shortFocus: 'PULL' },
              ]
            : [
                { type: 'ppl', id: 'push' },
                { type: 'ppl', id: 'pull' },
                { type: 'ul', id: 'upper' },
              ];
        // 推、拉次數要一樣：4 天以前是「推·拉·上半身·推」，推兩次拉一次 → 胸的量是背的兩倍，圓肩風險。
        //   偶數天推拉交替；奇數天把「上半身」放中間（3 天：推·拉·上半身；5 天：推·拉·上半身·推·拉）。
        const pushPull = [{ type: 'ppl', id: 'push' }, { type: 'ppl', id: 'pull' }];
        const balanced = chestExcluded ? null
            : daysPerWeek % 2 === 0
                ? Array.from({ length: daysPerWeek }, (_, i) => pushPull[i % 2])
                : [...pushPull, { type: 'ul', id: 'upper' }, ...Array.from({ length: daysPerWeek - 3 }, (_, i) => pushPull[i % 2])];
        return {
            days: balanced || Array.from({ length: daysPerWeek }, (_, i) => upperCycle[i % upperCycle.length]),
            splitLabel: '上半身強化分化 (No Legs)'
        };
    }

    // ─── 天數動態路由 ───
    if (daysPerWeek <= 2) {
        return {
            days: Array.from({ length: daysPerWeek }, (_, i) => ({ type: 'fb', configIdx: i })),
            splitLabel: '全身綜合循環 (Full Body)'
        };
    }

    if (daysPerWeek === 4) {
        // 壓倒性上半身偏好 (完全沒選下半身)
        if (upperFocusCount >= 2 && lowerFocusCount === 0) {
            return {
                days: [{ type: 'ppl', id: 'push' }, { type: 'ppl', id: 'pull' }, { type: 'ppl', id: 'legs' }, { type: 'ul', id: 'upper' }],
                splitLabel: '上肢強化分化 (PPL + Upper)'
            };
        }
        // 壓倒性下半身偏好 (完全沒選上半身)
        if (lowerFocusCount >= 2 && upperFocusCount === 0) {
            return {
                days: [{ type: 'ul', id: 'lower' }, { type: 'ul', id: 'upper' }, { type: 'ppl', id: 'legs' }, { type: 'custom', primary: ['glutes', 'hamstrings'], accessory: ['core'], warmupZone: 'lower', focus: '臀腿後鏈特訓', shortFocus: 'GLUTES' }],
                splitLabel: '下肢強化分化 (Lower Focus)'
            };
        }
        // 預設/混搭選擇：上下肢交替
        // 🆕 若上半身肌群選得多 (胸/背 + 肩或臂)，單一 Upper 日 (新手3/中階4 個動作) 塞不下，
        // 會擠掉肩與手臂。改用 Upper A(推)/Upper B(拉) 互補，確保整週每個上半身肌群都練到。
        // 也涵蓋「只選肩/臂」的情況：通用 upper 設定會先填胸+背 (使用者根本沒選)，把肩臂擠掉，
        // 所以只要有選到肩或臂，就走 A/B 拆分，讓肩臂一定排得到。
        const upperCrowded =
            ((has('chest') || has('back')) && (has('shoulders') || has('biceps') || has('triceps')))
            || has('shoulders') || has('biceps') || has('triceps');
        // 🆕 下肢 A/B 拆分條件：使用者有選腿，且前側(股四頭)與後側(臀/腿後)都有，
        // 才把兩個下肢日拆成「股四頭日」與「後鏈日」(深蹲與羅馬硬舉分開，腿日不過硬)。
        // 只選到單側 (例如只練臀) 時不拆，避免某天變空洞 → 用通用 lower 日混練。
        const lowerSplittable = (has('quads') || has('hamstrings') || has('glutes'));
        const lowerA = lowerSplittable ? 'lower_a' : 'lower';
        const lowerB = lowerSplittable ? 'lower_b' : 'lower';

        if (upperCrowded) {
            return {
                days: [
                    { type: 'ul', id: 'upper_a' },
                    { type: 'ul', id: lowerA },
                    { type: 'ul', id: 'upper_b' },
                    { type: 'ul', id: lowerB },
                ],
                splitLabel: lowerSplittable
                    ? '上下肢均衡分化 (Upper A·B / Lower A·B)'
                    : '上下肢均衡分化 (Upper A·B / Lower)'
            };
        }
        return {
            days: [
                { type: 'ul', id: 'upper' },
                { type: 'ul', id: lowerA },
                { type: 'ul', id: 'upper' },
                { type: 'ul', id: lowerB },
            ],
            splitLabel: lowerSplittable
                ? '上下肢均衡分化 (Upper / Lower A·B)'
                : '上下肢均衡分化 (Upper/Lower)'
        };
    }

    if (daysPerWeek === 5) {
        // 壓倒性上半身偏好
        if (upperFocusCount >= 2 && lowerFocusCount === 0) {
            const arnold = ['chest_back', 'shoulder_arms', 'legs', 'chest_back', 'shoulder_arms'];
            return { days: arnold.map(id => ({ type: 'arnold', id })), splitLabel: '上半身特化 (Arnold Split)' };
        }
        // 壓倒性下半身偏好
        if (lowerFocusCount >= 2 && upperFocusCount === 0) {
            return {
                days: [{ type: 'ul', id: 'lower' }, { type: 'ul', id: 'upper' }, { type: 'ppl', id: 'legs' }, { type: 'ul', id: 'upper' }, { type: 'custom', primary: ['glutes', 'hamstrings'], accessory: ['core'], warmupZone: 'lower', focus: '臀腿後鏈特訓', shortFocus: 'GLUTES' }],
                splitLabel: '下肢強化分化 (3 Lower / 2 Upper)'
            };
        }
        // 預設/混搭選擇：最科學的黃金混搭
        // 🆕 修掉「Legs 日 + Lower 日性質重複」：把兩個下肢日拆成股四頭主導 (Lower A) 與
        // 後鏈主導 (Lower B)，兩天不再重複，深蹲與羅馬硬舉也分開 → 腿日不過硬。
        // 並把兩個腿日錯開 (Day3 / Day5)，中間夾 Upper 日讓下肢有恢復時間。
        // lower_a/lower_b 各自的肌群 (股四頭 / 臀·腿後) 都足以撐起一天，永遠採 A/B 拆分，
        // 不會出現兩個一模一樣的「Lower Body」。
        return {
            days: [
                { type: 'ppl', id: 'push' },
                { type: 'ppl', id: 'pull' },
                { type: 'ul', id: 'lower_a' },
                { type: 'ul', id: 'upper' },
                { type: 'ul', id: 'lower_b' },
            ],
            splitLabel: '黃金五天分化 (Push·Pull·腿A / Upper·腿B)'
        };
    }

    // 🔧 PPL 前置防呆：PPL 的「拉日」需要背或二頭才成立。若使用者沒選任何拉力肌群
    //    (背/二頭)，且有選下肢，用 PPL 會產生空洞 Pull 日 (例：chest+legs)。
    //    這種情況把「拉日」換成「腿日」，讓上肢(推)與下肢交替，不再有空拉日。
    const hasPull = has('back') || has('biceps');
    const hasLower = has('quads') || has('hamstrings') || has('glutes');
    if (!hasPull && hasLower) {
        const lowA = 'lower_a', lowB = 'lower_b';
        // 推 → 腿A → 推 → 腿B → 推 …（上肢用 PPL 的 push 日，已含胸肩三頭）
        const cyc = ['push', lowA, 'push', lowB, 'push'];
        return {
            days: Array.from({ length: daysPerWeek }, (_, i) => {
                const id = cyc[i % cyc.length];
                return id === 'push' ? { type: 'ppl', id: 'push' } : { type: 'ul', id };
            }),
            splitLabel: '推 / 下肢分化 (無拉力肌群)'
        };
    }

    // 預設 3 天或 6 天 PPL
    const cycle = ['push', 'pull', 'legs'];
    return {
        days: Array.from({ length: daysPerWeek }, (_, i) => ({ type: 'ppl', id: cycle[i % 3] })),
        splitLabel: '標準推拉腿 (PPL)'
    };
};
// ─── DYNAMIC STYLE MODIFIER ───────────────────────────────────
/**
 * 根據訓練風格決定組數/次數/休息。
 *
 * 兩種風格：
 *   strength    (建力)  — 複合動作偏低次數（5-8），組間充分休息，禁超級組
 *   bodybuilding (健美)  — 全部 8-12 下（小肌群 12-15 下），標準肌肥大訓練
 *
 * 新手覆蓋：3 組 × 12-15 下（動作學習優先）；選力量的新手複合動作 8-10 下
 */
const applyTrainingStyle = (ex, style, index, level = 'intermediate') => {
    if (ex.tier === 4 || ex.isWarmup) return ex;

    // 🔧 [2026-10] 槓鈴複合（窄握臥推、下斜臥推…）就算算在小肌群或 tier 3，也不開 12–15 下：
    //    槓鈴推舉要能加重才有意義，15 下的重量輕到失去主項刺激，高次數時技術也最容易散。
    const barbellCompound = ex.cat === C && ex.eq === 'barbell';
    const isSmall = (SMALL_MUSCLES.has(ex.muscle) && !barbellCompound) || ex.cat === I;
    let newSets, newReps, newRest;

    if (style === 'strength') {
        // 建力：T1 複合偏低次數，T2/T3 維持中等次數
        if (ex.tier === 1) { newSets = 4; newReps = '5-8'; newRest = '120s'; }
        else if (ex.tier === 2) { newSets = 3; newReps = '8-10'; newRest = '90s'; }
        else { newSets = 3; newReps = '10-12'; newRest = '60s'; }
    } else {
        // bodybuilding (預設) — 肌肥大全程
        if (isSmall || (ex.tier === 3 && !barbellCompound)) { newSets = 3; newReps = '12-15'; newRest = '60s'; }
        // 槓鈴臥推、深蹲這類主項休 2 分鐘：90 秒回不來，下一組次數會掉，總訓練量反而少（Schoenfeld 2016）
        else if (ex.tier === 1) { newSets = 3; newReps = '8-12'; newRest = '120s'; }
        else { newSets = 3; newReps = '8-12'; newRest = '90s'; }
    }

    // 新手覆蓋：無論風格，一律 3 組 × 12-15（專注動作品質）
    if (level === 'beginner') {
        // 複合動作休 90 秒：新手 12–15 下的機械胸推、腿推，60 秒心肺還沒回來，第三組會做不完
        newSets = 3; newReps = '12-15'; newRest = ex.cat === C ? '90s' : '60s';
        // 選了「力量」的新手：複合動作 8–10 下（約 70% 1RM，ACSM 新手建議 8–12 的下緣），
        // 還是比進階的 5–8 輕，動作學得穩，但確實是在練力量而不是耐力
        if (style === 'strength' && ex.cat === C && ex.muscle !== 'core') newReps = '8-10';
    }

    // 🧗 引體向上／反手引體是「拉自己的體重」，不能像滑輪下拉一樣調重量：
    //    中階開 8–12 下多數人第二組就掉到 5 下，直接寫成做得到的 6–10（建力 5–8）；高階才給到 8–12。
    if (STRICT_BW_PULLS.has(ex.name) && level !== 'advanced') {
        newReps = style === 'strength' ? '5-8' : '6-10';
        newRest = '120s';
    }

    return { ...ex, sets: newSets, reps: newReps, rest: newRest };
};

// ─── 新手建議重量公式 ─────────────────────────────────────────
/**
 * 依體重與性別計算新手建議起始重量（僅 beginner 等級使用）
 * 基於 ExRx.net Starting Strength 標準與 Rippetoe 新手重量建議
 *
 * ⚖️ [型別統一] 回傳「物件」而非字串。
 *    原本回傳 '30 kg' / '15 kg each' 這種字串，但 UI 的判斷是
 *    `ex.suggestedWeight > 0`（字串轉數字 = NaN → 永遠不顯示），
 *    訓練頁又用 `.toString()` 把它塞進重量輸入框（"5 kg each" 進數字欄）。
 *    e1rmAdvisor.applyLoadPrescriptions 寫的一直都是數字 —— 以數字為準。
 *
 * ⚖️ [性別係數依部位分開] 原本全動作共用 0.65。
 *    事實：男女肌力差距在「上肢」遠大於「下肢」——
 *    上肢約為男性的 55–65%，下肢約 70–80%（相對除脂體重時差距更小）。
 *    用單一 0.65 會同時「高估女性上肢、低估女性下肢」，
 *    60kg 女性深蹲被算成 21.5kg 這種起始重量在現實中沒有訓練刺激。
 *    起始重量寧可保守（可以加，不能受傷），但不能保守到沒有意義。
 *
 * @param {string} exerciseName
 * @param {number} bodyWeightKg - 使用者體重（kg），來自 InBody 設定
 * @param {string} gender       - 'male' | 'female'
 * @returns {{kg:number, each:boolean, bodyweightOnly:boolean}|null}
 */
/**
 * 找一個「同肌群、同部位」的替代動作（換季個人化用：卡住了換角度、做不到換簡單的）。
 * 一律走引擎自己的過濾（等級閘門、器材、關節限制黑名單），不另寫一套規則。
 *
 * @param {object} current  課表裡的動作（name 可能已中文化，nameEn 是原名）
 * @param {{level:string, equipment?:string, injuries?:string[], exclude?:string[], easier?:boolean}} opts
 *        exclude：不要選到的原名（例如同一天已經有的動作）；easier：要比現在簡單
 * @returns {object|null}  已中文化、沿用原本組數／次數／休息的新動作；找不到回 null
 */
/* ════ 換動作推薦：照「這份課表選的器材範圍」挑，排前面的最像原本那個 ════════════════
   ⚠️ 以前換季「一直跳過 → 換簡單一點的」只看難度最低 —— 彈力帶的難度最低，
      於是健身房的課表被換成「彈力帶胸推／彈力帶夾胸／彈力帶肩推」，使用者根本不會在健身房做。
   規則：
     · 器材範圍跟著課表：在家徒手 → 只給徒手／彈力帶；健身房（含混合）→ 不給彈力帶、不給徒手孤立動作
     · 健身房記憶裡「這間沒有」的器材不推（isBlocked）
     · 越像越前面：同部位細區 → 同類型（複合／孤立）→ 同器材 → 同層級；
       easier（做不到／一直跳過）→ 同器材家族裡偏向器械／繩索（軌跡固定、好上手）與較低難度
   回傳前 limit 個，每個帶一句為什麼推薦（why）。 */
const EQ_ZH = { barbell: '槓鈴', dumbbell: '啞鈴', machine: '器械', cable: '繩索', kettlebell: '壺鈴', bodyweight: '徒手', band: '彈力帶' };
const GYM_EQ = new Set(['barbell', 'dumbbell', 'machine', 'cable', 'kettlebell']);
export const lookupEngineExercise = (nameOrEn) => {
    const hit = ALL_EXERCISES_MAP[nameOrEn] || ALL_EXERCISES.find((e) => toZhExerciseName(e.name) === nameOrEn);
    return hit ? { ...hit, name: toZhExerciseName(hit.name), nameEn: hit.name } : null;
};
export const recommendAlternatives = (current, { level = 'beginner', equipment = 'mixed', injuries = [], exclude = [], easier = false, limit = 4, isBlocked = null } = {}) => {
    const en = current?.nameEn || current?.name;
    const base = ALL_EXERCISES_MAP[en] || ALL_EXERCISES.find((e) => toZhExerciseName(e.name) === en);
    if (!base) return [];
    const env = equipment === 'gym' ? 'equipment' : equipment === 'home' ? 'bodyweight' : equipment;
    const gymPlan = env !== 'bodyweight';
    const keep = (ex) => ex.name !== base.name && !exclude.includes(ex.name) && !exclude.includes(toZhExerciseName(ex.name)) && ex.tier !== 4
        && (!gymPlan || (ex.eq !== 'band' && (ex.eq !== 'bodyweight' || ex.cat === C)))
        && !(isBlocked && isBlocked(ex));
    let pool = getPoolForMuscle(base.muscle, env, level, injuries, 3).filter(keep);
    if (pool.length < limit) {
        const more = getPoolForMuscle(base.muscle, env, level, injuries, 3, [], null, true).filter(keep);
        pool = [...pool, ...more.filter((m) => !pool.some((p) => p.name === m.name))];
    }
    if (!pool.length) return [];
    const baseEq = base.eq || 'barbell';
    const eqCost = (ex) => {
        const eq = ex.eq || 'barbell';
        if (eq === baseEq) return easier && !['machine', 'cable'].includes(eq) ? 1 : 0;
        if (GYM_EQ.has(eq) && GYM_EQ.has(baseEq)) return easier && ['machine', 'cable'].includes(eq) ? 0 : 1.5;
        return 4;
    };
    const score = (ex) => (ex.zone === base.zone ? 0 : 3)
        + (ex.cat === base.cat ? 0 : 4)
        + Math.abs((ex.tier || 3) - (base.tier || 3)) * 2
        + eqCost(ex) * 2
        + (easier ? Math.max(0, (ex.diff ?? 1) - (base.diff ?? 1) + 1) : Math.abs((ex.diff ?? 1) - (base.diff ?? 1)));
    return [...pool].sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name)).slice(0, limit).map((pick) => {
        const why = [
            pick.zone === base.zone ? '練同一個位置' : '同部位',
            EQ_ZH[pick.eq || 'barbell'] || null,
            easier && ((pick.diff ?? 1) < (base.diff ?? 1) || ['machine', 'cable'].includes(pick.eq)) ? '比較好上手' : null,
        ].filter(Boolean).join(' · ');
        return { ...pick, name: toZhExerciseName(pick.name), nameEn: pick.name, sets: current.sets, reps: current.reps, rest: current.rest, why };
    });
};

export const findAlternativeExercise = (current, opts = {}) => recommendAlternatives(current, { ...opts, limit: 1 })[0] || null;

export const calcSuggestedWeight = (exerciseName, bodyWeightKg, gender) => {
    // 沒體重算不出來；沒性別也算不出來 —— 倍數表是男性基準，
    // 不知道性別就當男性，等於對女性使用者系統性高估建議重量。
    if (!bodyWeightKg || bodyWeightKg <= 0) return null;
    if (!['male', 'female', 'M', 'F'].includes(String(gender))) return null;
    const bw = Number(bodyWeightKg);
    const isFemale = gender === 'female' || gender === 'F';

    // 倍數表：佔體重百分比（男性基準）
    const BW_RATIO = {
        // ── Barbell ──
        'Barbell Bench Press': 0.40,
        'Incline Barbell Press': 0.35,
        'Barbell Overhead Press': 0.28,
        'Barbell Back Squat': 0.55,
        'Romanian Deadlift': 0.50,
        'Deadlift': 0.60,
        'Barbell Row': 0.40,
        'Sumo Deadlift': 0.55,
        // ── Dumbbell ──
        'Dumbbell Bench Press': 0.18, // each
        'Incline Dumbbell Press': 0.15, // each
        'Dumbbell Overhead Press': 0.12, // each
        'Dumbbell Lateral Raise': 0.05, // each
        'Dumbbell Bicep Curl': 0.08, // each
        'Hammer Curls': 0.08, // each
        'Single Arm Dumbbell Row': 0.18, // each
        'Bulgarian Split Squat': 0.10, // each
        'Goblet Squat': 0.22,
        'Walking Lunges': 0.10, // each
        'Hip Thrusts': 0.40,
        'Glute Bridge': 0.00, // bodyweight for beginner
    };

    // 下肢動作清單（性別係數用）——其餘一律視為上肢
    const LOWER_BODY_LIFTS = new Set([
        'Barbell Back Squat', 'Romanian Deadlift', 'Deadlift', 'Sumo Deadlift',
        'Bulgarian Split Squat', 'Goblet Squat', 'Walking Lunges', 'Hip Thrusts', 'Glute Bridge',
    ]);
    const gFactor = isFemale ? (LOWER_BODY_LIFTS.has(exerciseName) ? 0.75 : 0.60) : 1.0;

    const ratio = BW_RATIO[exerciseName];
    if (ratio === undefined) return null;
    if (ratio === 0) return { kg: 0, each: false, bodyweightOnly: true };

    const kg = Math.round((bw * ratio * gFactor) / 2.5) * 2.5; // 最接近 2.5 kg
    const each = ['Dumbbell Bench Press', 'Incline Dumbbell Press', 'Dumbbell Overhead Press',
        'Dumbbell Lateral Raise', 'Dumbbell Bicep Curl', 'Hammer Curls',
        'Single Arm Dumbbell Row', 'Bulgarian Split Squat', 'Walking Lunges'].includes(exerciseName);
    return { kg: Math.max(2.5, kg), each, bodyweightOnly: false };
};

// ─── MAIN EXPORT ─────────────────────────────────────────────
/* 🔧 [2026-09] 排除了背，就不該還有「拉日」；排除了胸，就不該還有「推日」。
   以前選「胸＋手臂＋腿」會排出一個拉日，但背被排除 → 拉日只剩肩推、側平舉、二頭，
   標題寫「拉力強化（背·二頭）」卻一個背的動作都沒有。
   現在這種日子改成「肩·手臂日」（有選肩或手臂時）或對側的推／拉日。 */
const PULL_DAY = (d) => (d.type === 'ppl' && d.id === 'pull') || (d.type === 'ul' && d.id === 'upper_b');
const PUSH_DAY = (d) => (d.type === 'ppl' && d.id === 'push') || (d.type === 'ul' && d.id === 'upper_a');
/* ════ 分化：一律以「推／拉／腿」為骨架（2026-09 定案）══════════════════════════
     2 天：上半身（推＋拉）／下半身
     3 天：推 · 拉 · 腿
     4 天：推 · 拉 · 腿 ＋ 1 個重點日
     5 天：推 · 拉 · 腿 ＋ 2 個重點日
   重點日照使用者選的重點部位（胸→推日、背→拉日、腿→腿日）：
     · 只選 1 個 → 那一天多練一次（5 天再加一個上半身日）
     · 胸＋背 → 4 天加「上半身日」（胸背一起，推拉次數才對等）；5 天推、拉各加一次
     · 有腿 → 腿日多練一次（第二個腿日換成後鏈為主，深蹲跟硬舉分開）
     · 三個都選 → 4 天加上半身日；5 天加上半身日＋腿日
   同一種日子不連著排（中間至少隔一種）。
   沒選的部位一樣有它的那一天（推拉腿三天都在），只是不會多練一次 ——「沒選 ≠ 不練」。 */
const buildSchedule = (daysPerWeek, nonCoreMuscleHashes = [], _excluded = new Set(), level = 'intermediate') => {
    if (daysPerWeek <= 1) return buildScheduleRaw(daysPerWeek, nonCoreMuscleHashes, new Set());
    const PUSH = { type: 'ppl', id: 'push' }, PULL = { type: 'ppl', id: 'pull' }, LEGS = { type: 'ppl', id: 'legs' };
    const LEGS_B = { type: 'ul', id: 'lower_b' }, UPPER = { type: 'ul', id: 'upper' }, LOWER = { type: 'ul', id: 'lower' };
    if (daysPerWeek === 2) return { days: [UPPER, LOWER], splitLabel: '上下半身 (Upper / Lower)' };
    const focus = ['chest', 'back', 'legs'].filter(t => nonCoreMuscleHashes.includes(t));
    const has = (t) => focus.includes(t);
    const extraN = Math.max(0, Math.min(3, daysPerWeek - 3));
    let extras = [];
    if (extraN > 0) {
        const one = has('chest') && has('back') ? UPPER
            : has('legs') ? LEGS_B
            : has('chest') ? PUSH
            : has('back') ? PULL : UPPER;
        extras.push(one);
        if (extraN > 1) {
            let two;
            if (focus.length === 1) two = has('legs') ? UPPER : UPPER;        // 單一重點：再加一個上半身日
            else if (has('chest') && has('back') && !has('legs')) { extras = [PUSH, PULL]; }
            else if (has('legs')) two = (has('chest') && has('back')) ? LEGS_B : has('chest') ? PUSH : has('back') ? PULL : UPPER;
            else two = UPPER;
            if (two) extras.push(two);
        }
        if (extraN > 2) extras.push(UPPER);
        extras = extras.slice(0, extraN);
    }
    // 排序：同種日子不相鄰（推／拉／腿／上半身；兩個腿日也不能連著），第一天從推日開始
    const kind = (d) => (d.id === 'push' ? 'push' : d.id === 'pull' ? 'pull' : (d.id === 'legs' || d.id === 'lower_b' || d.id === 'lower') ? 'legs' : 'upper');
    const pool = [PUSH, PULL, LEGS, ...extras];
    const perms = (arr) => arr.length <= 1 ? [arr] : arr.flatMap((x, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)]).map(r => [x, ...r]));
    const score = (seq) => {
        let bad = 0;
        for (let i = 1; i < seq.length; i++) {
            const a = kind(seq[i - 1]), b = kind(seq[i]);
            if (a === b) bad += 10;
            // 上半身日緊接在推或拉之後，胸背會連兩天被練
            if ((a === 'upper' && (b === 'push' || b === 'pull')) || (b === 'upper' && (a === 'push' || a === 'pull'))) bad += 1;
        }
        if (kind(seq[0]) !== 'push') bad += 0.5;
        return bad;
    };
    const ordered = perms(pool).reduce((best, seq) => (score(seq) < score(best) ? seq : best));
    const label = daysPerWeek === 3 ? '推 · 拉 · 腿 (PPL)' : `推 · 拉 · 腿 ＋ ${extras.length} 個重點日`;
    return { days: ordered, splitLabel: label };
};

export const generateUnifiedPlan = ({
    assessment,
    selectedHashtags = [],
    splitType,           // 若未傳入則自動偵測（固定 foundation）
    equipment = 'mixed',
    injuries = [],
    daysPerWeek = 3,
    level: levelParam,
    manualLevel,
    sessionDuration,     // 若未傳入則依等級自動決定
    trainingStyle = 'bodybuilding',
    userBodyWeight,      // 新增：新手建議重量用
    userGender,          // 新增：新手建議重量用
    intensity = 'medium',
    rotateFrom = null,   // 換季「換部位重排」：上一份課表的動作名稱（英或中都可）
}) => {
    const level = manualLevel || levelParam || assessment?.level || 'beginner';
    CURRENT_EQUIPMENT = equipment || 'mixed';
    // 自動偵測分化與時長
    const resolvedSplitType = splitType || autoDetectSplitType();
    // 力量取向組間休息 2–5 分鐘，同樣的動作數一定比肌肥大久；教練排力量課通常多抓 15 分鐘。
    const resolvedDuration = sessionDuration || (autoDetectSessionDuration(level) + (trainingStyle === 'strength' ? 15 : 0));
    const budget = durationToMainBudget(resolvedDuration);

    // ⚖️ [S-06] 每日動作硬上限的「單一計算來源」。
    //    高 CNS 日（同日 2 個以上大重量複合）往下扣，但守住等級下限。
    //    過去這段扣減在 buildSession 與 trimDayToCap 各寫一次，
    //    但配額補注與最終硬上限卻讀未扣減的 exMax —— 於是被扣到 5 格的高階腿日
    //    會在補注階段被推回 6 格，扣減只在管線中段短暫存在過。
    //    現在四個位置全部讀這一個 function。
    // ⚠️ [S-05] 注意扣減的實際適用範圍：因為 exMin===exMax（新手 3/3、中階 4/4），
    //    Math.max(exMin, ...) 會把扣減完全拉回去 —— 這個機制只對高階（5–6）生效，
    //    而且最多只能 6→5。不是 bug，是 LEVEL_CODE 的區間設計使然，但別誤以為它全等級適用。
    const dailyExerciseCap = (mainExs = []) => {
        const law = getLevelCode(level);
        const heavy = mainExs.filter(e => e.cat === C && (e.cns === 'extreme' || e.cns === 'high') && e.tier <= 2).length;
        let cap = law.exMax;
        if (heavy >= 3) cap -= 2; else if (heavy >= 2) cap -= 1;
        return Math.max(law.exMin, cap);
    };

    const effectiveHashtags = [...new Set([...selectedHashtags])];

    // 新增提取使用者選的強化部位標籤
    const nonCoreMuscleHashes = effectiveHashtags.filter(t => MUSCLES[t] && t !== 'core');
    // 🔧 大肌群「未選即排除」判定（胸/背/腿）
    // 推拉腿三天都在，沒選的部位也有它的日子 → 不再「排除」任何大肌群（以前選胸＋背會整個拿掉腿）
    const { balanceHint } = resolveMuscleScope(nonCoreMuscleHashes);
    const excludedMuscles = new Set();
    const { days: sched, splitLabel } = buildSchedule(daysPerWeek, nonCoreMuscleHashes, excludedMuscles, level);

    // ── Compute plan-level superset flag (consistent across all days) ──
    const supersetEligibleGlobal = shouldEnableSuperset(level, resolvedDuration, trainingStyle);

    // ── AI insight string — displayed in the plan header UI ────
    const buildAIInsight = () => {
        if (level === 'beginner') {
            return '新手模式：計劃以複合動作為主，組數精簡，幫助神經系統適應訓練模式。動作難度偏低，建議專注動作品質。';
        }
        if (!supersetEligibleGlobal) {
            if (trainingStyle === 'powerlifting') {
                return '力量訓練模式：ATP-PCr 完整恢復優先，已停用超級組。組間休息 3–5 分鐘以確保最大輸出功率。';
            }
            return null;
        }
        const triggerA = resolvedDuration <= 45 && level !== 'beginner';
        const triggerB = level === 'advanced';
        if (triggerA && triggerB) {
            return '根據你的進階體能基準與緊湊訓練時間，AI 已自動加入拮抗超級組，提升訓練密度。';
        }
        if (triggerB) {
            return '根據你的進階體能基準，AI 已優化動作順序並加入拮抗超級組，以提升代謝壓力與訓練含金量。';
        }
        if (triggerA) {
            return '45 分鐘緊湊模式已啟動：AI 自動配對拮抗肌群組成超級組，在有限時間內保留最高訓練容量。';
        }
        return null;
    };

    const weeks = PHASES.map(phase => {
        let prevDayHadExtreme = false;
        // SOP 1-1: 建立此訓練週期的跨日全局去重記憶體
        const globalUsedNames = new Set();

        const days = sched.reduce((acc, cfg, i) => {
            let s;
            if (cfg.type === 'ppl') {
                s = buildPPLSession(cfg.id, budget, equipment, level, effectiveHashtags, injuries, trainingStyle, globalUsedNames, prevDayHadExtreme, excludedMuscles);
            } else if (cfg.type === 'ul') {
                s = buildULSession(cfg.id, budget, equipment, level, effectiveHashtags, injuries, trainingStyle, globalUsedNames, prevDayHadExtreme, excludedMuscles);
            } else if (cfg.type === 'arnold') {
                s = buildArnoldSession(cfg.id, budget, equipment, level, effectiveHashtags, injuries, trainingStyle, globalUsedNames, prevDayHadExtreme, excludedMuscles);
            } else if (cfg.type === 'fb') {
                s = buildFBSession(cfg.configIdx, budget, equipment, level, effectiveHashtags, injuries, trainingStyle, globalUsedNames, prevDayHadExtreme, excludedMuscles, daysPerWeek === 1);
            } else if (cfg.type === 'custom') {
                // 🎯 動態接住新建立的客製化組合
                s = buildSession({
                    primaryMuscles: cfg.primary,
                    accessoryMuscles: cfg.accessory,
                    warmupZone: cfg.warmupZone,
                    budget, equipment, level,
                    selectedHashtags: effectiveHashtags,
                    injuries,
                    focus: cfg.focus,
                    shortFocus: cfg.shortFocus,
                    trainingStyle,
                    globalUsedNames,
                    prevDayHadExtreme,
                    excludedMuscles
                });
            }

            // 重新計算當日的 Extreme 狀態給明天使用
            prevDayHadExtreme = s.exercises.some(ex => ex.cns === 'extreme');

            // 一天最多一個遞減組（收尾用；兩個以上等於整天都在力竭）—— 從最後面的動作開始給
            const dropIdx = (() => {
                for (let k = s.exercises.length - 1; k >= 0; k--) {
                    const e = s.exercises[k];
                    const last = (k === s.exercises.length - 1) || (s.exercises[k + 1] && s.exercises[k + 1].muscle !== e.muscle);
                    if (last && !e.supersetId && ['cable', 'machine', 'dumbbell'].includes(e.eq) && e.cat === I
                        && (level === 'advanced' ? e.tier === 3 : e.tier >= 2) && e.muscle !== 'core') return k;
                }
                return -1;
            })();
            const finalExercises = s.exercises.map((ex, index) => {
                const styledEx = applyTrainingStyle(ex, trainingStyle, index, level);
                const phased = applyPhase(styledEx, phase, level);
                let resultEx = phased;

                // 強度補償邏輯 — 🔧 v9.2: Deload 週強制忽略 intensity offset，防止恢復週被抵消
                let intensityOffset = 0;
                if (phase.name !== 'Deload') {
                    if (intensity === 'low') intensityOffset = -1;
                    if (intensity === 'high') intensityOffset = 1;
                }

                const minSets = phase.name === 'Deload' ? 1 : 2;
                resultEx.sets = Math.max(minSets, (resultEx.sets || 3) + intensityOffset);

                // ── 遞減組 (Drop Set) 判定邏輯 (保留你原本的) ──
                const isLastOfMuscle = (index === s.exercises.length - 1) || 
                                       (s.exercises[index + 1] && s.exercises[index + 1].muscle !== ex.muscle);

                // ⚖️ [S-01] 減量週不得開遞減組。
                //    Deload 的用途是恢復（組數已 ×0.6、intensity offset 已歸零）；
                //    若還保留「降重 20% 不休息續作」的力竭處方，等於量降了、強度極值沒降，
                //    與本週期的目的直接衝突（sports-science：疲勞日不加壓）。
                const canDoDropSet = getLevelCode(level).allowDropSet &&
                                     !phase.deload &&
                                     trainingStyle !== 'strength' &&
                                     isLastOfMuscle && 
                                     !ex.supersetId && 
                                     // 遞減組要能「快速降重」：啞鈴架／插銷配重才做得到；徒手、彈力帶、靜態動作（靠牆深蹲）做不了
                                     index === dropIdx &&
                                     (level === 'advanced' ? ex.tier === 3 : ex.tier >= 2);

                if (canDoDropSet) {
                    resultEx.isDropSet = true;
                    // 遞減組是收尾用的力竭組，1–2 輪就夠；3 輪 × 4 段等於 12 個力竭小組，恢復不了
                    resultEx.sets = Math.min(parseInt(resultEx.sets) || 2, 2);
                    if (level === 'advanced') {
                        resultEx.reps = '12 -> 10 -> 8 -> 6'; 
                        resultEx.dropStages = 4;
                        resultEx.note = '遞減組：做到力竭後降重約 20%，不休息接著做，共 4 段。';
                    } else {
                        resultEx.reps = '12 -> 8'; 
                        resultEx.dropStages = 2;
                        resultEx.note = '遞減組：做到力竭後降重約 20% 再做一段，動作不變形。';
                    }
                }

                // ── ⏱️ 單一動作耗時：用統一模型計算（引擎與 UI 共用同一公式）──
                // 標記當日首個主項，供 setup 加成判斷
                resultEx._isFirstMain = (index === 0) || (s.exercises.slice(0, index).every(e => e.isWarmup || e.tier === 4) && !(resultEx.isWarmup || resultEx.tier === 4));
                resultEx.estimatedMins = Math.round(estimateExerciseMinutes(resultEx, resultEx._isFirstMain));

                // ⚖️ 新手起始重量／選重指令改到「最終回合」統一處理（見下方 applyBeginnerLoadGuidance）——
                //    這裡看不到之後才被配額補注／核心保證／純度回補／下限回補／器械替換塞進來的動作。

                return resultEx;
            });

            acc.push({
                day_number: i + 1,
                focus: s.focus,
                shortFocus: s.shortFocus,
                // ⚖️ 當日「主→輔」肌群順序（分化真相），最終重排與純度法都讀這裡
                muscle_order: s.muscleOrder || [],
                // ⏱️ 用統一模型算當日總時間（熱身 + 各動作 + 收操），引擎與 UI 同一公式
                time: String(estimateDayMinutes(finalExercises, s.warmup)),
                warmup: s.warmup,
                superset_enabled: s.supersetEnabled,
                exercises: finalExercises
            });
            return acc;
        }, []);

        return {
            week_number: phase.week,
            phase: phase.name,
            phase_label: phase.label,
            days,
        };
    });

    // 🛑 [修復點 1B] requiredSubMuscles 跨日驗證：確保整週符合 SOP 子肌群配額
    const enforceWeeklySubMuscleQuota = (week, selectedHashtags, equipment, level, injuries, trainingStyle) => {
        // 🩺 傷病紅線：配額補注現在跑在傷病總清掃之後，池子必須自帶 avoid 過濾
        const avoidQ = new Set(avoidList(injuries || []));
        // 彙總所有選中標籤的 requiredSubMuscles 約束
        const quota = {};
        selectedHashtags.forEach(tag => {
            const sub = MUSCLES[tag]?.requiredSubMuscles;
            if (!sub) return;
            Object.entries(sub).forEach(([muscle, count]) => {
                quota[muscle] = Math.max(quota[muscle] || 0, count);
            });
        });
        // ⚖️ 手臂週配額讀法典：新手每週 biceps/triceps 各 1（動作學習優先），中高階 2。
        const armQuota = getLevelCode(level).weeklyArmQuota;
        if (quota.biceps) quota.biceps = Math.min(quota.biceps, armQuota);
        if (quota.triceps) quota.triceps = Math.min(quota.triceps, armQuota);
        if (Object.keys(quota).length === 0) return week;

        // ⚖️ 每日動作數量天花板讀 dailyExerciseCap（與 buildSession / trimDayToCap 同源）
        const realLen = (day) => day.exercises.filter(e => !e.isWarmup && e.tier !== 4).length;

        // 計算每塊肌群當週實際出現次數（去重後）
        const weeklyCount = {};
        const weeklyNames = new Set();
        week.days.forEach(day => {
            day.exercises.forEach(ex => {
                if (ex.isWarmup || ex.tier === 4) return;
                if (!weeklyNames.has(ex.name)) {
                    weeklyCount[ex.muscle] = (weeklyCount[ex.muscle] || 0) + 1;
                    weeklyNames.add(ex.name);
                }
            });
        });

        const CAP_BONUS_MUSCLES = new Set(['biceps', 'triceps', 'calves']);

        // 對未達標的肌群，找一個合適的日子補齊
        Object.entries(quota).forEach(([muscle, required]) => {
            let deficit = required - (weeklyCount[muscle] || 0);
            if (deficit <= 0) return;

            // ⚠️ 配額補注嚴格不可突破天花板（不再 +1）。手臂覆蓋改由「最終智慧裁切」保護：
            // 補進來的二頭/三頭即使讓當天滿格，裁切時也會優先保留(該肌群唯一動作必留)，
            // 被砍的是重複的高 tier 輔助，而非剛補的手臂。
            const effectiveCap = (day) => dailyExerciseCap(
                day.exercises.filter(e => !e.isWarmup && e.tier !== 4));

            // 拮抗判定：二頭→有背(拉)的日、三頭→有胸(推)的日
            const trainsAntagonist = (d) =>
                (muscle === 'biceps' && d.exercises.some(e => e.muscle === 'back')) ||
                (muscle === 'triceps' && d.exercises.some(e => e.muscle === 'chest'));

            let candidateDays = [...week.days]
                .map((d, idx) => ({
                    day: d,
                    idx,
                    hasMuscle: d.exercises.some(e => e.muscle === muscle),
                    hasAntagonist: trainsAntagonist(d),
                    muscleCount: d.exercises.filter(e => e.muscle === muscle).length,
                    totalCount: d.exercises.length
                }))
                .filter(c => realLen(c.day) < effectiveCap(c.day))
                // ⚖️ [分化純度法] 配額補注絕不違反當日禁區：
                //    三頭永遠進不了 PULL 日、二頭永遠進不了 PUSH 日、上肢永遠進不了腿日。
                .filter(c => !dayForbiddenMuscles(c.day.shortFocus).has(muscle));

            // 🆕 二頭/三頭只能補在「上半身日」，絕不亂塞到腿日 (避免腿日冒出三頭的怪課表)。
            // 優先序：① 有練拮抗肌(背/胸)或已有該肌群的日 → ② 其他純度合法的上肢日。
            // 若整週沒有任何合法日可放 (極端情況)，才放棄補注，寧缺勿錯。
            if (muscle === 'biceps' || muscle === 'triceps') {
                const isUpperDay = (c) => c.day.exercises.some(e =>
                    ['chest', 'back', 'shoulders', 'biceps', 'triceps'].includes(e.muscle));
                const ideal = candidateDays.filter(c => c.hasMuscle || c.hasAntagonist);
                const upperOnly = candidateDays.filter(isUpperDay);
                candidateDays = ideal.length > 0 ? ideal : upperOnly; // 沒有合法上肢日 → 空陣列 → 不補
                // 🆕 讓二頭/三頭分散到不同天：優先選「還沒被小肌群 +1 占用」的日子，
                //    避免二頭把兩個上肢日的 bonus 都吃掉、害三頭無處可放。
                const noBonusYet = candidateDays.filter(c =>
                    !c.day.exercises.some(e => e._quotaInjected && CAP_BONUS_MUSCLES.has(e.muscle)));
                if (noBonusYet.length > 0) candidateDays = noBonusYet;
            } else if (CAP_BONUS_MUSCLES.has(muscle)) {
                // calves：優先補在已有小腿或有腿部動作的日子
                const relevant = candidateDays.filter(c => c.hasMuscle ||
                    c.day.exercises.some(e => ['quads', 'hamstrings', 'glutes', 'calves'].includes(e.muscle)));
                if (relevant.length > 0) candidateDays = relevant;
            }

            // 🔧 [2026-10] 這個肌群本來就排在那天（muscle_order 有它）的日子優先，臀不會先被塞到推日
            const homeOf = (c) => ((c.day.muscle_order || []).includes(muscle) ? 1 : 0);
            candidateDays.sort((a, b) => {
                if (homeOf(a) !== homeOf(b)) return homeOf(b) - homeOf(a);
                if (a.hasAntagonist !== b.hasAntagonist) return b.hasAntagonist - a.hasAntagonist;
                if (a.hasMuscle !== b.hasMuscle) return b.hasMuscle - a.hasMuscle;
                if (a.muscleCount !== b.muscleCount) return a.muscleCount - b.muscleCount;
                return a.totalCount - b.totalCount; // 同條件下，塞給最空的一天
            });

            for (const cand of candidateDays) {
                if (deficit <= 0) break;
                if (realLen(cand.day) >= effectiveCap(cand.day)) continue; // 🔧 超過(有效)天花板的日子不再塞
                const dailyNames = new Set(cand.day.exercises.map(e => e.name));
                // 🛡️ [SOP 一致性] 配額補注不得繞過單日守則（v9.3 修復：
                //    advanced + core+legs 組合曾在股四頭日補進第二顆 extreme 深蹲）：
                //    ① 單日 CNS 互斥：當日已有 extreme → 池子剔除所有 extreme
                //    ② 模式收斂：同 muscle::zone::cat 力學模式當日只能出現一次
                const dayHasExtreme = cand.day.exercises.some(e => e.cns === 'extreme');
                const dayPatterns = new Set(cand.day.exercises
                    .filter(e => !e.isWarmup && e.tier !== 4)
                    .map(e => `${e.muscle}::${e.zone}::${e.cat}`));
                const pool = ALL_EXERCISES
                    .filter(ex =>
                        ex.muscle === muscle &&
                        !weeklyNames.has(ex.name) &&
                        !dailyNames.has(ex.name) &&
                        !avoidQ.has(ex.name) &&                 // 🩺 傷病紅線
                        ex.tier <= 3 &&
                        !(ex.cns === 'extreme' && dayHasExtreme) &&                    // 🛡️ ①
                        !dayPatterns.has(`${ex.muscle}::${ex.zone}::${ex.cat}`) &&     // 🛡️ ②
                        (equipment !== 'bodyweight' || ex.eq === 'bodyweight' || ex.eq === 'band') &&
                        passesLevelGate(ex, level, equipment)   // ⚖️ 統一等級閘門（舊版漏了新手禁槓鈴）
                    )
                    .sort((a, b) => a.tier - b.tier);

                for (const ex of pool) {
                    if (deficit <= 0) break;
                    if (realLen(cand.day) >= effectiveCap(cand.day)) break; // 🔧 塞滿即停，保護(有效)天花板
                    if (ex.cns === 'extreme' && cand.day.exercises.some(e => e.cns === 'extreme')) continue; // 🛡️ 迴圈內再守一次
                    const styled = applyTrainingStyle(ex, trainingStyle, 0, level);
                    const phased = applyPhase(styled, PHASES.find(p => p.name === week.phase) || PHASES[0], level);
                    const injectedEx = { ...phased, _quotaInjected: true };
                    // 🛡️ [排序四級跳] 複合動作不可排在同肌群孤立動作之後（同肌群複合先行）：
                    //    找到當日第一個「同肌群且非複合」的位置，插在它前面；否則 push 到最後。
                    const isCompound = injectedEx.cat === C;
                    const firstIsoIdx = isCompound
                        ? cand.day.exercises.findIndex(e =>
                            !e.isWarmup && e.tier !== 4 && e.muscle === injectedEx.muscle && e.cat !== C)
                        : -1;
                    if (firstIsoIdx !== -1) cand.day.exercises.splice(firstIsoIdx, 0, injectedEx);
                    else cand.day.exercises.push(injectedEx);
                    dayPatterns.add(`${ex.muscle}::${ex.zone}::${ex.cat}`);
                    weeklyNames.add(ex.name);
                    deficit--;
                }
            }

            // 🔁 換位補注：若所有合適日都滿格仍未補滿（例：Push 日塞滿胸+肩，三頭無位），
            //    在「有練拮抗肌的滿格日」上，把某個「有 2 個以上動作的肌群」的多餘那個換成缺的小肌群。
            //    這樣不破壞天花板，又能保證手臂被練到（覆蓋優先於某肌群的第 2 個輔助）。
            if (deficit > 0 && (muscle === 'biceps' || muscle === 'triceps')) {
                const wantsAntag = (d) => (muscle === 'biceps' && d.exercises.some(e => e.muscle === 'back'))
                    || (muscle === 'triceps' && d.exercises.some(e => e.muscle === 'chest'));
                const isUpperDay = (d) => d.exercises.some(e => ['chest', 'back', 'shoulders', 'biceps', 'triceps'].includes(e.muscle));
                // ⚖️ [分化純度法] 換位補注同樣不得違反當日禁區（三頭不進拉日、二頭不進推日）
                const purityOk = (d) => !dayForbiddenMuscles(d.shortFocus).has(muscle);
                let swapDays = week.days.filter(d => wantsAntag(d) && purityOk(d));
                if (swapDays.length === 0) swapDays = week.days.filter(d => isUpperDay(d) && purityOk(d));
                for (const d of swapDays) {
                    if (deficit <= 0) break;
                    if (d.exercises.some(e => e.muscle === muscle)) continue; // 已有就不換
                    const mainEx = d.exercises.filter(e => !e.isWarmup && e.tier !== 4);
                    const cnt = {};
                    mainEx.forEach(e => { cnt[e.muscle] = (cnt[e.muscle] || 0) + 1; });
                    // 找「該肌群有 2+ 個」的多餘動作換掉，挑 tier 最高(最不重要)的那個；
                    // 保留每個肌群至少 1 個（換的是第 2、第 3 個，不論 tier）。
                    // 🔧 [2026-09] 也允許換掉「這週別天也有練到」的肌群（例：背一週兩天，其中一天讓位給三頭）。
                    const weekMuscleDays = (m) => week.days.filter(x => x.exercises.some(e => !e.isWarmup && e.tier !== 4 && e.muscle === m)).length;
                    // 沒被選為目標的肌群（全身日的填充動作）也可以讓位給使用者選的手臂。
                    const targetMus = new Set(selectedHashtags.flatMap(t => ALL_TAGS[t]?.muscles || []));
                    const expendable = (m) => cnt[m] >= 2 || weekMuscleDays(m) >= 2 || !targetMus.has(m);
                    const victims = mainEx
                        .filter(e => e.muscle !== muscle && e.muscle !== 'core' && expendable(e.muscle))
                        .sort((a, b) => ((targetMus.has(a.muscle) ? 1 : 0) - (targetMus.has(b.muscle) ? 1 : 0))
                            || (b.tier || 0) - (a.tier || 0) || mainEx.indexOf(b) - mainEx.indexOf(a));
                    // 避免砍掉該肌群最重要(tier 最低)那個：只挑非該肌群最小 tier 的實例
                    const victim = victims.find(v => {
                        const sameMuscle = mainEx.filter(e => e.muscle === v.muscle);
                        if (sameMuscle.length === 1) return weekMuscleDays(v.muscle) >= 2 || !targetMus.has(v.muscle); // 當天唯一 → 別天有練、或本來就不是目標才可讓位
                        const minTier = Math.min(...sameMuscle.map(e => e.tier || 3));
                        return (v.tier || 3) > minTier || sameMuscle.indexOf(v) > 0;
                    });
                    if (!victim) continue;
                    const dailyNames = new Set(d.exercises.map(e => e.name));
                    const repl = ALL_EXERCISES
                        .filter(ex => ex.muscle === muscle && !weeklyNames.has(ex.name) && !dailyNames.has(ex.name) && ex.tier <= 3 &&
                            !avoidQ.has(ex.name) &&                  // 🩺 傷病紅線
                            (equipment !== 'bodyweight' || ex.eq === 'bodyweight' || ex.eq === 'band') &&
                            passesLevelGate(ex, level, equipment))   // ⚖️ 統一等級閘門
                        .sort((a, b) => a.tier - b.tier)[0];
                    if (!repl) continue;
                    const idx = d.exercises.indexOf(victim);
                    const styled = applyTrainingStyle(repl, trainingStyle, 0, level);
                    const phased = applyPhase(styled, PHASES.find(p => p.name === week.phase) || PHASES[0], level);
                    d.exercises[idx] = { ...phased, _quotaInjected: true };
                    weeklyNames.add(repl.name);
                    deficit--;
                }
            }
        });
        return week;
    };

    // ⚖️ 配額補注已移到「分化純度清掃之後」執行（見下方 sweepPurity 後的呼叫）：
    //    先清掉違規動作，配額才能看到真實空缺、把手臂補進合法的日子。

    // ⚖️ 每日動作數的「硬天花板」讀法典：新手 3 / 中階 4 / 高階 5–6（不可被任何補注突破）。
    // 高 CNS 日（同日 2+ 大重量複合）再往下扣，避免腿日過硬，但守住絕對下限。
    // ⚠️ 不再有「小肌群 / 核心 +1」的超額容許——上限就是上限。
    const dayHardCap = (mainExs) => dailyExerciseCap(mainExs);
    // 智慧裁切：超過上限時，優先砍「最不重要」的動作，但確保「每個肌群至少留 1 個」(覆蓋優先)。
    // 作法分兩階段：① 每個肌群先保留它最重要(tier 最低)的 1 個 → 保證覆蓋；
    //              ② 名額還有剩，再依重要度回補各肌群的第 2、第 3 個。
    const trimDayToCap = (day) => {
        const warm = day.exercises.filter(e => e.isWarmup || e.tier === 4);
        let main = day.exercises.filter(e => !(e.isWarmup || e.tier === 4));
        const cap = dayHardCap(main);

        // ⚖️ 超級組 B 一樣佔格（官方標準：每日動作總數 = 總數）
        const slotCost = () => 1;
        const usedSlots = main.reduce((s, e) => s + slotCost(e), 0);
        if (usedSlots <= cap) return;

        const withIdx = main.map((e, i) => ({ e, i }));
        // 🛑 大肌群佔比鎖優先：保留順序的重要度——
        //    ① 大肌群(胸/背/腿)的複合動作最優先(不可被砍到只剩 1)；
        //    ② 接著小肌群/孤立的「超級組 B」(反正不佔格，幾乎一定保留)；
        //    ③ 其餘依 tier 與原順序。
        const isBig = (e) => BIG_MUSCLES.has(e.muscle);
        const rank = (x) => {
            const e = x.e;
            if (isBig(e) && e.cat === C) return 0;          // 大肌群複合：最優先
            // ⚖️ 保證型補注（核心保證/配額手臂）受保護：它們是使用者點名要的覆蓋，
            //    裁切時不可先砍（否則「補了又砍」→ 核心/手臂整週消失）。
            if (e._coreGuaranteed || e._quotaInjected) return 1;
            if (e.supersetId && e.supersetOrder === 'B') return 2; // 超級組B
            if (isBig(e)) return 2;                          // 大肌群孤立
            return 3;                                        // 其餘小肌群/孤立
        };
        const importance = (a, b) =>
            rank(a) - rank(b) ||
            (a.e.tier || 3) - (b.e.tier || 3) ||
            a.i - b.i;

        const sorted = [...withIdx].sort(importance);
        const kept = [];
        let slots = 0;
        // ⚖️ 總動作數硬上限 = cap（超級組 B 也佔格，不再有超額容許）。
        const TOTAL_CEIL = cap;
        for (const x of sorted) {
            const c = slotCost(x.e);
            if (kept.length >= TOTAL_CEIL) break;       // 絕對總量上限
            if (slots + c > cap) continue;              // 超出格數：一律略過(含 SS-B)
            kept.push(x);
            slots += c;
        }
        // 清掉因主項被砍而落單的超級組 B
        const keptIds = new Set(kept.map(x => x.e.supersetId).filter(Boolean));
        const keptCount = {};
        kept.forEach(x => { if (x.e.supersetId) keptCount[x.e.supersetId] = (keptCount[x.e.supersetId]||0)+1; });
        const cleaned = kept.filter(x => {
            if (x.e.supersetId && keptCount[x.e.supersetId] < 2) {
                delete x.e.supersetId; delete x.e.supersetType; delete x.e.isSuperset; delete x.e.supersetOrder;
                if (x.e.rest === '0s') x.e.rest = '60s';
            }
            return true;
        });
        // 還原原始順序
        const ranked = cleaned.sort((a, b) => a.i - b.i).map(x => x.e);
        day.exercises = [...warm, ...ranked];
    };

    // 🔥 核心保證（Core Guarantee）：使用者有選 core 卻被擠掉時，把核心掛到下肢/腿日一起練。
    // ⚠️ 嚴格守住硬天花板：只往「尚未滿格」的 host 日塞；若全滿則靠下方智慧裁切保留核心。
    if (effectiveHashtags.includes('core')) {
        const isLowerDay = (d) => /lower|leg|腿|臀|下肢/i.test(`${d.focus || ''} ${d.shortFocus || ''}`);
        const realLen = (d) => d.exercises.filter(e => !e.isWarmup && e.tier !== 4).length;
        weeks.forEach(week => {
            const weeklyCoreNames = new Set();
            week.days.forEach(d => d.exercises.forEach(e => { if (e.muscle === 'core') weeklyCoreNames.add(e.name); }));
            const coreTarget = level === 'beginner' ? 1 : 2;
            if (weeklyCoreNames.size >= coreTarget) return;

            const corePool = ALL_EXERCISES
                .filter(ex => ex.muscle === 'core' && ex.tier <= 3 &&
                    (equipment !== 'bodyweight' || ex.eq === 'bodyweight' || ex.eq === 'band') &&
                    passesLevelGate(ex, level, equipment))
                .sort((a, b) => a.tier - b.tier);

            // 優先掛在「下肢日且還沒滿格」；其次任何還沒滿格、核心最少的日子
            let hostDays = week.days.filter(d => isLowerDay(d) && realLen(d) < dayHardCap(d.exercises.filter(e => !e.isWarmup && e.tier !== 4)));
            if (hostDays.length === 0) {
                hostDays = [...week.days]
                    .filter(d => realLen(d) < dayHardCap(d.exercises.filter(e => !e.isWarmup && e.tier !== 4)))
                    .sort((a, b) => a.exercises.filter(e => e.muscle === 'core').length - b.exercises.filter(e => e.muscle === 'core').length);
            }
            // 若有空格的 host，先用 append 補；沒有就跳過 append，直接進入下方換位補注
            let di = 0;
            for (const ex of corePool) {
                if (weeklyCoreNames.size >= coreTarget) break;
                if (weeklyCoreNames.has(ex.name)) continue;
                const avail = hostDays.filter(h => realLen(h) < dayHardCap(h.exercises.filter(e => !e.isWarmup && e.tier !== 4)));
                if (avail.length === 0) break;
                const host = avail[di % avail.length];
                if (host.exercises.some(e => e.name === ex.name)) continue;
                const styled = applyTrainingStyle(ex, trainingStyle, 0, level);
                const phased = applyPhase(styled, PHASES.find(p => p.name === week.phase) || PHASES[0], level);
                host.exercises.push({ ...phased, _coreGuaranteed: true });
                weeklyCoreNames.add(ex.name);
                di++;
            }

            // 🔁 換位補注核心：若整週都滿格仍沒有核心，在「核心動作最少、且有可替換重複動作」的
            //    下肢/任一日，把某個 2+ 肌群的多餘動作換成核心（核心負荷低，不影響大重量主項）。
            if (weeklyCoreNames.size < coreTarget) {
                const corePool2 = ALL_EXERCISES
                    .filter(ex => ex.muscle === 'core' && ex.tier <= 3 &&
                        (equipment !== 'bodyweight' || ex.eq === 'bodyweight' || ex.eq === 'band') &&
                        passesLevelGate(ex, level, equipment))
                    .sort((a, b) => a.tier - b.tier);
                const orderedDays = [...week.days].sort((a, b) => {
                    const la = isLowerDay(a) ? 0 : 1, lb = isLowerDay(b) ? 0 : 1;
                    return la - lb; // 下肢日優先
                });
                for (const d of orderedDays) {
                    if (weeklyCoreNames.size >= coreTarget) break;
                    if (d.exercises.some(e => e.muscle === 'core')) continue;
                    const mainEx = d.exercises.filter(e => !e.isWarmup && e.tier !== 4);
                    const cnt = {};
                    mainEx.forEach(e => { cnt[e.muscle] = (cnt[e.muscle] || 0) + 1; });
                    let victims = mainEx
                        // 🛑 大肌群佔比鎖：核心換位優先「不」拿大肌群(胸/背/腿)的複合動作開刀——
                        //    否則胸會從 2 被換成 1，破壞「大肌群佔比 > 小肌群」。優先換小肌群/孤立的多餘動作。
                        .filter(e => cnt[e.muscle] >= 2 && !(BIG_MUSCLES.has(e.muscle) && e.cat === C))
                        .sort((a, b) => (b.tier || 0) - (a.tier || 0));
                    // ⚖️ 新手救濟條款：新手每日僅 3 格且全是大肌群複合時（純複合課表），
                    //    找不到小肌群可換 → 允許犧牲「某大肌群的第 2 個複合」換核心。
                    //    使用者點名要練核心，覆蓋 > 某肌群的第二個動作（每肌群仍保底 1 個）。
                    if (victims.length === 0) {
                        victims = mainEx
                            .filter(e => cnt[e.muscle] >= 2)
                            .sort((a, b) => (b.tier || 0) - (a.tier || 0));
                    }
                    const victim = victims.find(v => {
                        const same = mainEx.filter(e => e.muscle === v.muscle);
                        return (v.tier || 3) > Math.min(...same.map(e => e.tier || 3)) || same.indexOf(v) > 0;
                    });
                    if (!victim) continue;
                    const repl = corePool2.find(ex => !weeklyCoreNames.has(ex.name) && !d.exercises.some(e => e.name === ex.name));
                    if (!repl) continue;
                    const idx = d.exercises.indexOf(victim);
                    const styled = applyTrainingStyle(repl, trainingStyle, 0, level);
                    const phased = applyPhase(styled, PHASES.find(p => p.name === week.phase) || PHASES[0], level);
                    d.exercises[idx] = { ...phased, _coreGuaranteed: true };
                    weeklyCoreNames.add(repl.name);
                }
            }
        });
    }

    // 🔒 絕對硬天花板（最後一道，跑在所有補注之後）：每日動作數一律收斂到上限內，
    //     高階最多 6、中階 4、新手 3（高 CNS 日再往下扣）。智慧裁切會保留必要動作。
    // 🩺 傷病安全總清掃（最後一道安全網，跑在所有補注之後）：
    //    任何路徑（配額/核心/救援/徵召）若漏放了「關節限制應避開」的動作，這裡一律移除，
    //    並嘗試用同肌群的安全替代補回（找不到安全替代就留空，寧缺勿傷）。
    if (injuries && injuries.length) {
        const avoidSet = new Set(avoidList(injuries));
        weeks.forEach(week => week.days.forEach(day => {
            const dayNames = new Set(day.exercises.map(e => e.name));
            day.exercises = day.exercises.map(ex => {
                if (!avoidSet.has(ex.name)) return ex;
                // 找同肌群、不在避開清單、當日沒出現過的安全替代（tier 接近優先）
                const repl = ALL_EXERCISES
                    .filter(c => c.muscle === ex.muscle && !avoidSet.has(c.name) && !dayNames.has(c.name) &&
                        c.tier !== 4 &&
                        (equipment !== 'bodyweight' || c.eq === 'bodyweight' || c.eq === 'band') &&
                        (equipment !== 'equipment' || c.eq !== 'bodyweight') &&
                        passesLevelGate(c, level, equipment))
                    .sort((a, b) => Math.abs((a.tier || 3) - (ex.tier || 3)) - Math.abs((b.tier || 3) - (ex.tier || 3)))[0];
                if (repl) { dayNames.add(repl.name); return { ...repl, sets: ex.sets, reps: ex.reps, rest: ex.rest }; }
                return null; // 沒有安全替代 → 移除（寧缺勿傷）
            }).filter(Boolean);
        }));
    }

    // ─── ⚖️ [分化純度法 — 最終總清掃] ────────────────────────────────────
    // 任何路徑漏放的「當日禁區肌群」動作（例：拉日的三頭、推日的二頭、腿日的上肢）
    // 一律移除；若移除後低於等級動作數下限，用當日合法肌群的動作補回。
    const sweepPurity = () => weeks.forEach(week => week.days.forEach(day => {
        const forbidden = dayForbiddenMuscles(day.shortFocus);
        if (!forbidden.size) return;
        const before = day.exercises.length;
        day.exercises = day.exercises.filter(e => e.isWarmup || !forbidden.has(e.muscle));
        if (day.exercises.length === before) return;

        // 補回：維持等級動作數下限（寧可用合法肌群的第 2、第 3 順位動作，也不留違規動作）
        const law = getLevelCode(level);
        const realLen = () => day.exercises.filter(e => !e.isWarmup && e.tier !== 4).length;
        const legalMuscles = [...new Set(day.exercises.filter(e => !e.isWarmup && e.tier !== 4).map(e => e.muscle))]
            .filter(m => m !== 'core');
        const avoidSet = new Set(avoidList(injuries));
        const dayNames = new Set(day.exercises.map(e => e.name));
        const dayPatterns = new Set(day.exercises.filter(e => !e.isWarmup && e.tier !== 4)
            .map(e => `${e.muscle}::${e.zone}::${e.cat}`));
        let guard = 0;
        while (realLen() < law.exMin && guard < 10) {
            guard++;
            let added = false;
            for (const mus of legalMuscles) {
                if (realLen() >= law.exMin) break;
                const cand = ALL_EXERCISES.filter(ex =>
                    ex.muscle === mus && ex.tier <= 3 &&
                    !dayPatterns.has(`${ex.muscle}::${ex.zone}::${ex.cat}`) &&
                    !avoidSet.has(ex.name) && !dayNames.has(ex.name) &&
                    (equipment !== 'bodyweight' || ex.eq === 'bodyweight' || ex.eq === 'band') &&
                    (equipment !== 'equipment' || ex.eq !== 'bodyweight') &&
                    passesLevelGate(ex, level, equipment) &&
                    (getLevelCode(level).allowIsolationFill || ex.cat === C))
                    .sort((a, b) => a.tier - b.tier)[0];
                if (cand) {
                    const styled = applyTrainingStyle(cand, trainingStyle, 0, level);
                    const phased = applyPhase(styled, PHASES.find(p => p.name === week.phase) || PHASES[0], level);
                    day.exercises.push({ ...phased, _purityRefill: true });
                    dayNames.add(cand.name);
                    dayPatterns.add(`${cand.muscle}::${cand.zone}::${cand.cat}`);
                    added = true;
                }
            }
            if (!added) break;
        }
    }));

    // ⚖️ 執行順序（教練管線）：
    //   ① 純度清掃 → ② 裁切到硬上限 → ③ 配額補注 → ④ 再掃一次純度保險
    //   配額必須在「裁切之後」跑：此時每日格數已是最終真實容量，
    //   補進來的手臂動作不會再被裁切砍掉（先補後裁 = 三頭整週消失的根源）。
    sweepPurity();
    weeks.forEach(week => week.days.forEach(day => trimDayToCap(day)));
    weeks.forEach(week => enforceWeeklySubMuscleQuota(week, effectiveHashtags, equipment, level, injuries, trainingStyle));
    sweepPurity();

    // （🔃 最終排序正規化已移到「佔比鎖 / 下限回補」之後執行——見下方 normalizeDayOrder）

    // ─── 🛑 [大肌群佔比鎖 — 全域最終守衛] ──────────────────────────────────
    // 跑在「所有補注(配額/核心)、裁切、重排」之後，作為單一真相來源(single source of truth)。
    // 規則：同一天若有真正的大肌群(胸/背/腿)當主項，則每一個小肌群/肩的「佔格動作數」
    //       都不得超過當日最大大肌群的動作數。超出的，砍最不重要(孤立、tier 高)；
    //       但「超級組 B(不佔格)」與大肌群本身不在裁切之列——確保胸 2 / 肩 ≤ 2 這種正確佔比。
    // 例外：新手不套用(新手本來就純複合、量少)。
    if (level !== 'beginner') {
        weeks.forEach(week => week.days.forEach(day => {
            // 先清掉「落單的超級組」(配對的另一半被前面流程砍掉)：還原成普通動作
            const ssCount = {};
            day.exercises.forEach(e => { if (e.supersetId) ssCount[e.supersetId] = (ssCount[e.supersetId]||0)+1; });
            day.exercises.forEach(e => {
                if (e.supersetId && ssCount[e.supersetId] < 2) {
                    delete e.supersetId; delete e.supersetType; delete e.isSuperset; delete e.supersetOrder;
                    if (e.rest === '0s') e.rest = '60s';
                    if (e.note && (e.note.includes('超級組') || e.note.includes('力竭組'))) delete e.note;
                }
            });
            const main = day.exercises.filter(e => !e.isWarmup && e.tier !== 4);
            const dayHasBig = main.some(e => BIG_MUSCLES.has(e.muscle));
            if (!dayHasBig) return;
            // ⚖️ 佔格判定：超級組 B 一樣佔格（官方標準）
            const occupies = () => true;
            const countMuscle = (mus) => main.filter(e => e.muscle === mus && occupies(e)).length;
            const bigMuscles = [...new Set(main.filter(e => BIG_MUSCLES.has(e.muscle)).map(e => e.muscle))];
            const maxBig = Math.max(...bigMuscles.map(countMuscle), 1);
            const smallMuscles = [...new Set(main.filter(e => !BIG_MUSCLES.has(e.muscle) && e.muscle !== 'core').map(e => e.muscle))];
            const toRemove = new Set();
            for (const mus of smallMuscles) {
                let excess = countMuscle(mus) - maxBig;
                if (excess <= 0) continue;
                // 砍最不重要：孤立先砍、tier 高先砍；但保留「超級組成員」(B 不佔格、A 砍掉會破壞配對)
                const victims = main
                    .filter(e => e.muscle === mus && occupies(e) && !e.supersetId)
                    .sort((a, b) => {
                        const aIso = (a.cat === C) ? 1 : 0, bIso = (b.cat === C) ? 1 : 0;
                        return (aIso - bIso) || ((b.tier || 3) - (a.tier || 3));
                    });
                for (const v of victims) {
                    if (excess <= 0) break;
                    toRemove.add(v); excess--;
                }
            }
            if (toRemove.size) {
                day.exercises = day.exercises.filter(e => !toRemove.has(e));
            }

            // 🔒 [最終硬上限] 跑在所有補注/裁切/重排之後，確保每日「佔格動作數」嚴守難度範圍：
            //    新手 3 / 中階 4 / 高階 5–6（數字以 LEVEL_CODE 為準，註解不再自己抄一份）。
            //    高 CNS 日的扣減在這裡一樣生效 —— 這是 S-06 修掉的破口。
            //    超出時砍「最不重要」(非大肌群複合、孤立、tier 高、非超級組)。
            const occ = () => true;                    // ⚖️ 超級組 B 一樣佔格
            const mainNow = day.exercises.filter(e => !e.isWarmup && e.tier !== 4);
            const HARD = dailyExerciseCap(mainNow);
            let usedSlots = mainNow.filter(occ).length;
            if (usedSlots > HARD) {
                const cut = new Set();
                const cuttable = mainNow
                    .filter(e => occ(e) && !e.supersetId && !(BIG_MUSCLES.has(e.muscle) && e.cat === C))
                    .sort((a, b) => {
                        // 砍序：核心 → 小肌群孤立(tier 高) → 其餘
                        const score = (e) => (e.muscle === 'core' ? 0 : 1) * 100 - (e.cat === C ? 50 : 0) - (e.tier || 3);
                        return score(a) - score(b);
                    });
                for (const v of cuttable) {
                    if (usedSlots <= HARD) break;
                    cut.add(v); usedSlots--;
                }
                if (cut.size) day.exercises = day.exercises.filter(e => !cut.has(e));
            }
        }));
    }

    const boostedMuscles = [...new Set(effectiveHashtags.flatMap(t => (ALL_TAGS[t]?.muscles || [])))];
    // 僅保留 MUSCLES 標籤供 UI 顯示（過濾掉問題部位/體態標籤）
    const displayTags = selectedHashtags.filter(t => MUSCLES[t]);
    
    // 🔧 輸出後處理 ①：新手「純複合 + 器械優先」（不在這裡做中文化，中文化留到最後）
    const isBeginnerLevel = level === 'beginner';
    // 🩺 [S-02] 這段器械替換跑在「傷病總清掃」之後，所以必須自帶避開清單 ——
    //    否則剛被安全機制移除的動作，會從這條替換路徑被換回課表裡。
    const beginnerAvoidSet = new Set(avoidList(injuries || []));
    weeks.forEach(w => (w.days || []).forEach(d => {
        let exs = d.exercises || [];
        if (isBeginnerLevel && equipment !== 'bodyweight') {
            // 新手純複合：tier3 已在 passesLevelGate 源頭擋掉（非徒手），此處僅為保險
            const compounds = exs.filter(e => (e.tier || 3) < 3);
            if (compounds.length >= 2) exs = compounds;
            // 🏋️ 初階「以器械為主」：把自由重量複合換成同 zone 的 machine/cable 版本
            //    (槓鈴臥推→機械胸推、引體向上→滑輪下拉、槓鈴划船→坐姿划船…)，更安全好上手。
            // ⚖️ [器材合規] 僅限「非徒手環境」：居家徒手模式絕不可換成器械動作。
            const dayNames = new Set(exs.map(e => e.name));
            exs = exs.map(e => {
                if (e.isWarmup || e.tier === 4 || e.eq === 'machine' || e.eq === 'cable') return e;
                const alt = ALL_EXERCISES.find(c =>
                    c.zone === e.zone && (c.eq === 'machine' || c.eq === 'cable') &&
                    c.cat === C && c.cns !== 'extreme' && !dayNames.has(c.name) &&
                    // 🩺 傷病紅線：替換進來的動作一樣不得踩到關節限制
                    !beginnerAvoidSet.has(c.name) &&
                    // ⚖️ 統一等級閘門（單一真相源）：原本這裡自己寫 (c.diff||0) < 3，
                    //    但新手法典是 maxDiff = 1，diff2 動作會從這裡繞進新手課表。
                    passesLevelGate(c, level, equipment));
                if (alt) { dayNames.delete(e.name); dayNames.add(alt.name); return { ...alt, sets: e.sets, reps: e.reps, rest: e.rest }; }
                return e;
            });
        }
        d.exercises = exs;
    }));

    // ─── ⚖️ [下限保證 — 最終回補] ─────────────────────────────────────────
    // 跑在所有「會移除動作」的守衛（純度/佔比鎖/硬上限/新手純化）之後：
    // 任何一天正式動作數低於等級下限時，用「當日合法肌群」回補。
    // 嚴守：純度法、等級閘門、器材、傷病、不重複；大肌群優先、tier 低優先。
    weeks.forEach(week => week.days.forEach(day => {
        const law = getLevelCode(level);
        const mainList = () => day.exercises.filter(e => !e.isWarmup && e.tier !== 4);
        if (mainList().length >= law.exMin) return;
        const forbidden = dayForbiddenMuscles(day.shortFocus);
        const avoidSet = new Set(avoidList(injuries || []));
        const candMuscles = [...new Set([
            ...mainList().map(e => e.muscle),
            ...(Array.isArray(day.muscle_order) ? day.muscle_order : []),
        ])].filter(m => m && m !== 'core' && !forbidden.has(m))
          .sort((a, b) => (BIG_MUSCLES.has(b) ? 1 : 0) - (BIG_MUSCLES.has(a) ? 1 : 0)); // 大肌群優先
        const phaseObj = PHASES.find(p => p.name === week.phase) || PHASES[0];
        let guard = 0;
        while (mainList().length < law.exMin && guard < 12) {
            guard++;
            let added = false;
            const dayNames = new Set(day.exercises.map(e => e.name));
            // 🛡️ 同動作模式防重：同 zone+cat 已存在就不再補（避免 RDL + 啞鈴RDL 同日並存）
            const dayPatterns = new Set(day.exercises.filter(e => !e.isWarmup && e.tier !== 4)
                .map(e => `${e.muscle}::${e.zone}::${e.cat}`));
            for (const mus of candMuscles) {
                if (mainList().length >= law.exMin) break;
                const cand = ALL_EXERCISES.filter(ex =>
                    ex.muscle === mus && ex.tier <= 3 && ex.cns !== 'extreme' &&
                    !avoidSet.has(ex.name) && !dayNames.has(ex.name) &&
                    !dayPatterns.has(`${ex.muscle}::${ex.zone}::${ex.cat}`) &&
                    (equipment !== 'bodyweight' || ex.eq === 'bodyweight' || ex.eq === 'band') &&
                    (equipment !== 'equipment' || ex.eq !== 'bodyweight') &&
                    passesLevelGate(ex, level, equipment) &&
                    (getLevelCode(level).allowIsolationFill || ex.cat === C))
                    .sort((a, b) => (a.tier - b.tier) || (equipScore(a, level) - equipScore(b, level)))[0];
                if (cand) {
                    const styled = applyTrainingStyle(cand, trainingStyle, 0, level);
                    const phased = applyPhase(styled, phaseObj, level);
                    day.exercises.push({ ...phased, _minRefill: true });
                    dayNames.add(cand.name);
                    dayPatterns.add(`${cand.muscle}::${cand.zone}::${cand.cat}`);
                    added = true;
                }
            }
            if (!added) break;
        }
    }));

    // ─── 🔃 [最終排序正規化]（管線最後一步，任何補注/裁切都在它之前）────────
    //    每日「主訓練」依「當日分化」的肌群順序重排：主項肌群先、同肌群相鄰、
    //    組內 tier 低者先、複合先於孤立、核心一律收尾；超級組 A+B 綁定不拆散。
    weeks.forEach(week => week.days.forEach(day => {
        const warm = day.exercises.filter(e => e.isWarmup);
        const corr = day.exercises.filter(e => !e.isWarmup && e.tier === 4);
        const main = day.exercises.filter(e => !e.isWarmup && e.tier !== 4);

        // 🔁 超級組原子化：把「A+B」綁成一個排序單位
        const units = [];
        const consumed = new Set();
        main.forEach((e, i) => {
            if (consumed.has(i)) return;
            if (e.supersetId) {
                const partnerIdx = main.findIndex((x, j) => j !== i && !consumed.has(j) && x.supersetId === e.supersetId);
                if (partnerIdx !== -1) {
                    const partner = main[partnerIdx];
                    const aMember = e.supersetOrder === 'B' ? partner : e;
                    const bMember = e.supersetOrder === 'B' ? e : partner;
                    consumed.add(i); consumed.add(partnerIdx);
                    units.push({ items: [aMember, bMember], anchor: aMember, i });
                    return;
                }
            }
            consumed.add(i);
            units.push({ items: [e], anchor: e, i });
        });

        // ⚖️ [順序法] 肌群優先序 = 「當日分化」的主→輔順序（day.muscle_order），
        //    而不是全域表。全域表會讓拉日的後三角(肩=6)排在划船(背=7)前面——順序硬傷。
        const dayOrder = Array.isArray(day.muscle_order) ? day.muscle_order : [];
        const musclePrio = (m) => {
            if (m === 'core') return 999;                        // 核心永遠收尾
            const idx = dayOrder.indexOf(m);
            if (idx !== -1) return idx;                          // 當日分化順序優先
            return 100 + (ABSOLUTE_MUSCLE_PRIORITY[m] ?? 50);    // 其餘退回全域表
        };
        units.sort((a, b) => {
            const pa = musclePrio(a.anchor.muscle);
            const pb = musclePrio(b.anchor.muscle);
            if (pa !== pb) return pa - pb;                       // 肌群優先序（核心最後）
            if (a.anchor.muscle !== b.anchor.muscle) return a.anchor.muscle.localeCompare(b.anchor.muscle);
            const ta = a.anchor.tier || 3, tb = b.anchor.tier || 3;
            if (ta !== tb) return ta - tb;                       // 同肌群內：tier 低(主項)在前
            const ca = a.anchor.cat === C ? 0 : 1, cb = b.anchor.cat === C ? 0 : 1;
            if (ca !== cb) return ca - cb;                       // 複合先於孤立
            return a.i - b.i;                                    // 穩定排序
        });
        const flat = units.flatMap(u => u.items);
        day.exercises = [...warm, ...flat, ...corr];
    }));

    // ─── 🛡️ [排序四級跳 — 同肌群 tier 正規化（最終保險層）] ─────────────────
    // 必須跑在「單位重排序」之後（否則會被重排覆蓋）。
    // 規則：同一天同肌群的動作 tier 必須遞增（複合先行）。
    // 超級組成員不移動（拆散配對比排序錯更糟）；把「非超級組」同肌群動作
    // 拔出後依 tier 升冪插回；若目標位置落在超級組內部，往前推到該組第一個成員前。
    weeks.forEach(week => (week.days || []).forEach(day => {
        let arr = day.exercises || [];
        const isMain = (e) => e && !e.isWarmup && e.tier !== 4;
        const muscles = [...new Set(arr.filter(isMain).map(e => e.muscle))];
        muscles.forEach(mus => {
            const entries = arr.filter(e => isMain(e) && e.muscle === mus);
            if (entries.length < 2) return;
            let ok = true;
            for (let j = 1; j < entries.length; j++) if ((entries[j].tier || 3) < (entries[j - 1].tier || 3)) { ok = false; break; }
            if (ok) return;
            const movable = entries.filter(e => !e.supersetId);
            if (movable.length === 0) return; // 全是超級組成員 → 不動
            const movSet = new Set(movable);
            const anchorIdx = arr.findIndex(e => isMain(e) && e.muscle === mus);
            arr = arr.filter(e => !movSet.has(e));
            movable.sort((a, b) => (a.tier || 3) - (b.tier || 3)).forEach(ex => {
                const t = ex.tier || 3;
                let insertAt = arr.findIndex(e => isMain(e) && e.muscle === mus && (e.tier || 3) > t);
                if (insertAt === -1) {
                    let last = -1;
                    arr.forEach((e, i) => { if (isMain(e) && e.muscle === mus) last = i; });
                    insertAt = last !== -1 ? last + 1 : Math.min(anchorIdx, arr.length);
                } else {
                    // 目標位置在超級組內部 → 往前推到該超級組的第一個成員，保住配對相鄰
                    const ssId = arr[insertAt]?.supersetId;
                    if (ssId) {
                        while (insertAt > 0 && arr[insertAt - 1]?.supersetId === ssId) insertAt--;
                    }
                }
                arr.splice(insertAt, 0, ex);
            });
            day.exercises = arr;
        });
        day.exercises = arr;
    }));

    // 🔧 [2026-09] 輸出後處理 ①.1：選了核心就一定要練到核心。
    //    高階 2 天全身課常把時間預算吃光，appendCore 拿不到 5 分鐘就整週沒有核心 ——
    //    使用者明明勾了「核心／腹肌」。這裡保證每週至少 2 天（天數不足就每天）收尾一個核心動作：
    //    當天還沒滿就加在最後；滿了就替換掉「同肌群當天已有 2 個以上」裡最不重要的那個。
    if (effectiveHashtags.includes('core')) {
        const law = getLevelCode(level);
        const avoidC = new Set(avoidList(injuries || []));
        weeks.forEach(w => {
            const days = w.days || [];
            const isMain = (e) => !e.isWarmup && e.tier !== 4;
            const coreDays = days.filter(d => (d.exercises || []).some(e => isMain(e) && e.muscle === 'core')).length;
            let need = Math.min(2, days.length) - coreDays;
            if (need <= 0) return;
            const weekNames = new Set(days.flatMap(d => (d.exercises || []).map(e => e.nameEn || e.name)));
            const phase = PHASES.find(p => p.name === w.phase) || PHASES[0];
            const order = [...days]
                .filter(d => !(d.exercises || []).some(e => isMain(e) && e.muscle === 'core'))
                .sort((a, b) => a.exercises.filter(isMain).length - b.exercises.filter(isMain).length);
            for (const d of order) {
                if (need <= 0) break;
                const main = d.exercises.filter(isMain);
                const dayNames = new Set(d.exercises.map(e => e.nameEn || e.name));
                const pick = sortPool(getPoolForMuscle('core', equipment, level, injuries || [], 3), MUSCLES['core']?.priorityExercises || [], false, false, level)
                    .filter(ex => !avoidC.has(ex.name) && !dayNames.has(ex.name) && ex.cns !== 'extreme')
                    .sort((a, b) => (weekNames.has(a.name) ? 1 : 0) - (weekNames.has(b.name) ? 1 : 0))[0];
                if (!pick) continue;
                const coreEx = { ...applyPhase(applyTrainingStyle(pick, trainingStyle, 0, level), phase, level), _coverageInjected: true };
                // ⚖️ [S-06] 讀 dailyExerciseCap（高 CNS 日扣減後的上限），不是未扣減的 exMax
                if (main.length < dailyExerciseCap(main)) {
                    d.exercises.push(coreEx);
                } else {
                    const cnt = {};
                    main.forEach(e => { cnt[e.muscle] = (cnt[e.muscle] || 0) + 1; });
                    const victim = [...main]
                        .filter(e => cnt[e.muscle] >= 2 && e.muscle !== 'core')
                        .sort((a, b) => (b.tier || 3) - (a.tier || 3) || main.indexOf(b) - main.indexOf(a))[0];
                    if (!victim) continue;
                    d.exercises = d.exercises.filter(e => e !== victim);
                    d.exercises.push(coreEx);
                }
                weekNames.add(pick.name);
                need--;
            }
        });
    }

    // 🔧 [2026-09] 輸出後處理 ①.2：整週變化度。
    //    同一個動作一週最多排 3 次（週頻率 3 已是教練給主項的上限）；多出來的那幾次，
    //    換成同肌群、同部位、同類型的替代動作（沿用原本組數／次數／休息，仍過傷病與等級閘門）。
    //    以前腹輪、哈克深蹲、羅馬尼亞硬舉常常一週 4–5 次 —— 同一關節角度天天磨，進步停滯又容易累積勞損。
    {
        const WEEKLY_REPEAT_LIMIT = 3;
        const KEEP = ['name', 'zone', 'muscle', 'cat', 'tier', 'cns', 'diff', 'eq', 'time'];
        weeks.forEach(w => {
            const count = new Map();
            (w.days || []).forEach(d => {
                const dayNames = new Set((d.exercises || []).map(e => e.nameEn || e.name));
                d.exercises = (d.exercises || []).map(e => {
                    const en = e.nameEn || e.name;
                    if (e.isWarmup || e.tier === 4) return e;
                    const n = (count.get(en) || 0) + 1;
                    if (n <= WEEKLY_REPEAT_LIMIT) { count.set(en, n); return e; }
                    const full = [...count.entries()].filter(([, c]) => c >= WEEKLY_REPEAT_LIMIT).map(([k]) => k);
                    const alt = findAlternativeExercise({ ...e, name: en }, {
                        level, equipment, injuries: injuries || [],
                        exclude: [...dayNames, ...full],
                    });
                    if (!alt || (alt.cns === 'extreme' && e.cns !== 'extreme')) {
                        // 沒得換的核心填充（使用者沒選核心）：這週第 4 次以後就拿掉，只要當天還夠最少動作數
                        const mainN = (d.exercises || []).filter(x => !x.isWarmup && x.tier !== 4).length;
                        if (e.muscle === 'core' && !effectiveHashtags.includes('core') && mainN > getLevelCode(level).exMin) return null;
                        count.set(en, n); return e;
                    }
                    const next = { ...e };
                    KEEP.forEach(k => { if (k === 'name') next.name = alt.nameEn; else if (alt[k] !== undefined) next[k] = alt[k]; });
                    delete next.nameEn;
                    delete next.suggestedWeight; delete next.suggestedWeightEach; delete next.note;
                    dayNames.delete(en); dayNames.add(alt.nameEn);
                    count.set(alt.nameEn, (count.get(alt.nameEn) || 0) + 1);
                    return next;
                }).filter(Boolean);
            });
        });
    }

    // 🔧 [2026-09] 輸出後處理 ①.3：同一天同一肌群的動作數上限。
    //    大肌群（胸／背／股四頭／腿後／臀）最多 3 個、肩 2 個（有選肩才 3 個）、手臂與核心 2 個、小腿 1 個。
    //    以前高階推日會排「臥推＋上斜推＋繩索夾胸＋啞鈴飛鳥」四個胸：第 4 個幾乎沒有額外刺激、只增加疲勞，
    //    而同一天三頭一個都沒有。多出來的那個換成當天協同肌（推日→三頭／肩、拉日→二頭／後束…），
    //    不違反分化純度、仍過傷病與等級閘門。
    {
        const BIG = new Set(['chest', 'back', 'quads', 'hamstrings', 'glutes']);
        const selectedMus = new Set(effectiveHashtags.flatMap(t => ALL_TAGS[t]?.muscles || []));
        const capOf = (m, d) => BIG.has(m) ? 3
            : m === 'shoulders' ? ((selectedMus.has('shoulders') || /ARMS|SHOULDER/i.test(String(d?.shortFocus || ''))) ? 3 : 2)
            : m === 'calves' ? 1 : 2;
        // [肌群, 允許的部位]：拉日只能補後束，推日的肩只補推／側平舉
        const PUSH_SH = ['shoulders-press', 'shoulders-lateral', 'shoulders-front'];
        const PARTNER = {
            chest: [['triceps'], ['shoulders', PUSH_SH]], shoulders: [['triceps'], ['chest']], triceps: [['shoulders', PUSH_SH], ['chest']],
            back: [['biceps'], ['shoulders', ['shoulders-rear']]], biceps: [['back'], ['shoulders', ['shoulders-rear']]],
            quads: [['hamstrings'], ['glutes'], ['calves']], hamstrings: [['glutes'], ['quads'], ['calves']], glutes: [['hamstrings'], ['quads'], ['calves']],
        };
        const isMain = (e) => !e.isWarmup && e.tier !== 4;
        weeks.forEach(w => {
            const phase = PHASES.find(p => p.name === w.phase) || PHASES[0];
            const weekNames = new Set((w.days || []).flatMap(d => (d.exercises || []).map(e => e.nameEn || e.name)));
            // 一週直接組數會超過 20 組的肌群（例：胸臂分化一週三個胸日 × 3 個胸動作 = 27 組）→ 這週每天最多 2 個
            const weekTot = {};
            (w.days || []).forEach(d => (d.exercises || []).filter(isMain).forEach(e => { weekTot[e.muscle] = (weekTot[e.muscle] || 0) + (parseInt(e.sets) || 0); }));
            const tighten = new Set(Object.keys(weekTot).filter(m => weekTot[m] > 20));
            (w.days || []).forEach(d => {
                // 拉日（背·二頭）不該出現推舉類的肩動作 —— 換成後束，找不到就換背／二頭
                if (/^(PULL|UPPER B|BACK)$/i.test(String(d.shortFocus || ''))) {
                    d.exercises = (d.exercises || []).map(e => {
                        if (!isMain(e) || e.zone !== 'shoulders-press') return e;
                        const dayNames = new Set(d.exercises.map(x => x.nameEn || x.name));
                        const pats = new Set(d.exercises.filter(isMain).map(x => `${x.muscle}::${x.zone}::${x.cat}`));
                        const tries = [['shoulders', ['shoulders-rear']], ['back', null], ['biceps', null]];
                        for (const [m, zones] of tries) {
                            const pick = sortPool(getPoolForMuscle(m, equipment, level, injuries || [], 3), MUSCLES[m]?.priorityExercises || [], false, false, level)
                                .find(ex => !dayNames.has(ex.name) && !pats.has(`${ex.muscle}::${ex.zone}::${ex.cat}`) && ex.cns !== 'extreme');
                            if (pick) {
                                const styled = applyPhase(applyTrainingStyle(pick, trainingStyle, 0, level), phase, level);
                                weekNames.add(pick.name);
                                return { ...styled, sets: e.sets, _capReplaced: e.nameEn || e.name };
                            }
                        }
                        return e;
                    });
                }
                /* 新手全身課：一天只有 3 個動作，每個部位 1 個 —— 重點部位靠「每天都練」累積量，
                   不是同一天塞兩個胸把腿、背擠掉（新手要先建立蹲、推、拉的基本動作）。 */
                const fbBeginner = level === 'beginner' && /^FB/i.test(String(d.shortFocus || ''));
                const fbDay = /^FB/i.test(String(d.shortFocus || ''));
                const bigGroups = ['chest', 'back', 'legs'].filter(t => effectiveHashtags.includes(t)).length;
                const capHere = (m) => fbBeginner ? 1
                    : (fbDay && bigGroups >= 3 && BIG.has(m)) ? 1          // 全身課選了胸背腿：每天各 1 個，三大部位每天都練到
                    : (tighten.has(m) || fbDay) ? Math.min(2, capOf(m, d)) : capOf(m, d);
                // 補位順序照當天全身課的設定（A：推·股四頭、B：拉·後鏈、C：綜合），不要三天都補同一個部位
                const fbCfg = FB_CONFIGS.find(c => c.shortFocus === String(d.shortFocus || '').toUpperCase());
                const FB_FILL = (fbCfg ? fbCfg.muscles : ['quads', 'back', 'hamstrings', 'shoulders'])
                    .map(m => (m === 'legs' ? 'quads' : m))
                    .filter(m => m !== 'core')
                    .map(m => (m === 'shoulders' ? [m, PUSH_SH] : [m]));
                let guard = 6;
                let balDone = false;
                while (guard-- > 0) {
                    const main = (d.exercises || []).filter(isMain);
                    const cnt = {};
                    main.forEach(e => { cnt[e.muscle] = (cnt[e.muscle] || 0) + 1; });
                    // 上半身日：胸跟背一樣多（2 胸 1 背一週下來就是推比拉多一倍）
                    const upperDay = /^UPPER$/i.test(String(d.shortFocus || ''))
                        || (fbDay && effectiveHashtags.includes('chest') && effectiveHashtags.includes('back'));
                    const ch = cnt.chest || 0, bk = cnt.back || 0;
                    // 差 2 個以上一定調；差 1 個時，只有「這一週那一邊的總組數已經明顯比較多」才調（不然 3 個名額會來回翻）
                    const big1 = ch > bk ? 'chest' : 'back', small1 = ch > bk ? 'back' : 'chest';
                    const oneSet = 3;
                    // 一週只有這一個上半身日（2 天的上下半身）：胸背各 1、第三格給肩臂，不要 2 胸 1 背
                    // 名額是奇數（新手 3 格、高階 5 格）時也一樣：胸背各半，多出來那格給肩（側平舉），推拉才對等
                    const onlyUpper = upperDay && (((w.days || []).filter(x => /^(UPPER|FB)/i.test(String(x.shortFocus || ''))).length === 1
                        && !(w.days || []).some(x => /^(PUSH|PULL)$/i.test(String(x.shortFocus || ''))))
                        || (/^UPPER$/i.test(String(d.shortFocus || '')) && main.length % 2 === 1));
                    // 差 1 個：這週那一邊已經多出一整個動作的組數以上 → 換（每天只調一次，避免來回翻）
                    const overBal = !balDone && upperDay && !excludedMuscles?.has?.('chest') && !excludedMuscles?.has?.('back')
                        && Math.max(ch, bk) >= 2
                        && (Math.abs(ch - bk) >= 2 || (Math.abs(ch - bk) === 1 && (onlyUpper || (weekTot[big1] || 0) - (weekTot[small1] || 0) >= oneSet)))
                        ? big1 : null;
                    if (overBal) balDone = true;
                    const overCap = Object.keys(cnt).find(m => cnt[m] > capHere(m));
                    // 全身課：選了的大部位（胸／背／腿）每天都要有；缺的那個，從「同部位有兩個」或「沒被選的部位」裡騰位子
                    const LEGS = ['quads', 'hamstrings', 'glutes'];
                    const groupOf = (m) => (LEGS.includes(m) ? 'legs' : m);
                    let missingBig = null, fbVictim = null;
                    if (fbDay && !overCap && !overBal) {
                        const gCnt = {};
                        main.forEach(e => { gCnt[groupOf(e.muscle)] = (gCnt[groupOf(e.muscle)] || 0) + 1; });
                        missingBig = ['chest', 'back', 'legs'].find(g => effectiveHashtags.includes(g) && !gCnt[g]
                            && !(g === 'legs' ? excludedMuscles?.has?.('quads') : excludedMuscles?.has?.(g))) || null;
                        if (missingBig) {
                            // 加強的肩臂一週已經有 2 個以上 → 也可以讓一個給缺席的大部位（胸背腿每天都在比加強輔助部位重要）
                            const accWeek = (mm) => (w.days || []).reduce((a, x) => a + (x.exercises || []).filter(e => isMain(e) && e.muscle === mm).length, 0);
                            fbVictim = main.filter(e => e.muscle !== 'core' && (gCnt[groupOf(e.muscle)] >= 2 || !selectedMus.has(e.muscle)
                                || (['shoulders', 'biceps', 'triceps'].includes(e.muscle) && accWeek(e.muscle) >= 2)))
                                .sort((a, b) => ((b.cat === I) - (a.cat === I)) || ((b.tier || 3) - (a.tier || 3)) || (d.exercises.indexOf(b) - d.exercises.indexOf(a)))[0] || null;
                            if (!fbVictim) missingBig = null;
                        }
                    }
                    /* 推拉腿日：那一天的主角如果是使用者選的重點部位，當天至少要有 2 個它的動作
                       （新手一天只有 3 格，核心、二頭這些會把重點擠到只剩 1 個 → 一週只有 3 組胸）。 */
                    let focusVictim = null, focusNeed = null;
                    if (!overCap && !overBal && !fbVictim) {
                        const sfU = String(d.shortFocus || '').toUpperCase();
                        const need = sfU === 'PUSH' && effectiveHashtags.includes('chest') ? ['chest']
                            : sfU === 'PULL' && effectiveHashtags.includes('back') ? ['back']
                            : (['LEGS', 'LOWER', 'LOWER A', 'LOWER B'].includes(sfU) && effectiveHashtags.includes('legs')) ? ['quads', 'hamstrings', 'glutes'] : null;
                        if (need) {
                            const have = main.filter(e => need.includes(e.muscle)).length;
                            if (have < 2) {
                                const rankV = (e) => (e.muscle === 'core' ? 0 : !selectedMus.has(e.muscle) ? 1 : 2);
                                focusVictim = main.filter(e => !need.includes(e.muscle) && rankV(e) < 2)
                                    .sort((a, b) => rankV(a) - rankV(b) || ((b.cat === I) - (a.cat === I)) || ((b.tier || 3) - (a.tier || 3)))[0] || null;
                                if (focusVictim) focusNeed = need;
                            }
                        }
                    }
                    const over = overCap || overBal || (fbVictim ? fbVictim.muscle : null) || (focusVictim ? focusVictim.muscle : null);
                    const prefer = focusNeed ? focusNeed.map(m => [m]) : overCap ? [] : overBal ? (Math.abs(ch - bk) === 1 && onlyUpper
                            ? [['shoulders', ['shoulders-lateral']], ['shoulders', PUSH_SH], ['triceps'], ['biceps']]
                            : [[overBal === 'chest' ? 'back' : 'chest']])
                        : missingBig ? [[missingBig === 'legs' ? 'quads' : missingBig], ...(missingBig === 'legs' ? [['hamstrings'], ['glutes']] : [])] : [];
                    if (!over) break;
                    // 砍掉這個肌群裡最不重要的：孤立先於複合、tier 大的先、排在後面的先
                    const victim = fbVictim || focusVictim || main.filter(e => e.muscle === over)
                        .sort((a, b) => ((b.cat === I) - (a.cat === I)) || ((b.tier || 3) - (a.tier || 3)) || (d.exercises.indexOf(b) - d.exercises.indexOf(a)))[0];
                    const forbid = dayForbiddenMuscles(d.shortFocus);
                    const dayNames = new Set(d.exercises.map(e => e.nameEn || e.name));
                    let repl = null;
                    // 最後的退路：核心（放在收尾，不影響其他部位的恢復）
                    const partners = [...prefer, ...((fbDay || fbBeginner) ? FB_FILL : (PARTNER[over] || [])), ['core']];
                    for (const [m, zones] of partners) {
                        if (forbid.has(m) || (cnt[m] || 0) >= capHere(m) || excludedMuscles?.has?.(m)) continue;
                        if ((weekTot[m] || 0) + (parseInt(victim.sets) || 3) > 20) continue;   // 補位不能把別的肌群推過一週 20 組
                        const dayPatterns = new Set(d.exercises.filter(isMain).map(e => `${e.muscle}::${e.zone}::${e.cat}`));
                        const pool = sortPool(getPoolForMuscle(m, equipment, level, injuries || [], 3, [], zones || null), MUSCLES[m]?.priorityExercises || [], trainingStyle === 'strength', false, level)
                            .filter(ex => !dayNames.has(ex.name) && ex.cns !== 'extreme' && !dayPatterns.has(`${ex.muscle}::${ex.zone}::${ex.cat}`));
                        const pick = pool.find(ex => !weekNames.has(ex.name)) || pool[0];
                        if (pick) { repl = pick; break; }
                    }
                    const idx = d.exercises.indexOf(victim);
                    if (repl) {
                        const styled = applyPhase(applyTrainingStyle(repl, trainingStyle, 0, level), phase, level);
                        d.exercises[idx] = { ...styled, sets: victim.sets, _capReplaced: victim.nameEn || victim.name };
                        weekNames.add(repl.name);
                        const vs = parseInt(victim.sets) || 0;
                        weekTot[over] = (weekTot[over] || 0) - vs;
                        weekTot[repl.muscle] = (weekTot[repl.muscle] || 0) + vs;
                    } else if (main.length > getLevelCode(level).exMin) {
                        d.exercises.splice(idx, 1);
                        weekTot[over] = (weekTot[over] || 0) - (parseInt(victim.sets) || 0);
                    } else break;
                }
            });
            /* 整週覆蓋：使用者選的部位（含二頭、三頭、肩）整週一個動作都沒有 → 找一天騰位子補進去。
               騰位子的順序：同部位當天有兩個以上的、沒被選的部位；不違反分化純度；新手全身課也適用
               （例：新手選「手臂＋核心＋腿」，全身課三天都被腿跟核心排滿，手臂整週沒練到）。 */
            const LEGS2 = ['quads', 'hamstrings', 'glutes'];
            const grp = (m) => (LEGS2.includes(m) ? 'legs' : m);
            const wanted = [...selectedMus].filter(m => !['calves', 'legs'].includes(m) && !excludedMuscles?.has?.(m));
            wanted.forEach(m => {
                const has = (w.days || []).some(d => (d.exercises || []).some(e => isMain(e) && e.muscle === m));
                if (has) return;
                const pool = sortPool(getPoolForMuscle(m, equipment, level, injuries || [], 3), MUSCLES[m]?.priorityExercises || [], trainingStyle === 'strength', false, level)
                    .filter(ex => ex.cns !== 'extreme');
                if (!pool.length) return;
                // 🔧 [2026-10] 先找「這個部位本來就該練的那天」（muscle_order 有它的日子：臀→腿日），找不到才放別天。
                //    以前照星期順序找，選了臀卻把臀推塞在推日第一個，腿日反而沒有臀。
                const homeFirst = [...(w.days || [])].sort((a, b) => ((b.muscle_order || []).includes(m) - (a.muscle_order || []).includes(m)));
                for (const d of homeFirst) {
                    if (dayForbiddenMuscles(d.shortFocus).has(m)) continue;
                    const main = (d.exercises || []).filter(isMain);
                    const g = {};
                    main.forEach(e => { g[grp(e.muscle)] = (g[grp(e.muscle)] || 0) + 1; });
                    // 選了的部位當天有 2 個以上也可以讓一個（例：2 天上半身胸 2 背 2，選了肩卻整週沒有 → 讓一個胸給肩推）
                    const sameSide = (x) => (['shoulders', 'triceps'].includes(m) ? x.muscle === 'chest' : m === 'biceps' ? x.muscle === 'back' : false) ? 0 : 1;
                    // 🔧 [2026-10] 核心也可以讓位：沒選核心、或選了但這週別天還有核心動作。
                    //    以前選了核心就一律不動 → 中階 2 天選「胸背手臂核心」：上半身日是 臥推／划船／彎舉／懸垂舉腿，
                    //    三頭整週沒練到，那一格最後還被週量下限換成第二個胸推（腿日本來就有健腹輪）。
                    const coreWeek = (w.days || []).reduce((a, x) => a + (x.exercises || []).filter(e => isMain(e) && e.muscle === 'core').length, 0);
                    let victim = main.filter(e => e.muscle !== 'core' && (g[grp(e.muscle)] >= 2 || !selectedMus.has(e.muscle)))
                        .sort((a, b) => ((selectedMus.has(a.muscle) ? 1 : 0) - (selectedMus.has(b.muscle) ? 1 : 0))
                            || (g[grp(b.muscle)] - g[grp(a.muscle)]) || (sameSide(a) - sameSide(b)) || ((b.cat === I) - (a.cat === I)) || ((b.tier || 3) - (a.tier || 3)))[0]
                        || (main.filter(e => e.muscle === 'core').length && (!effectiveHashtags.includes('core') || coreWeek >= 2) ? main.find(e => e.muscle === 'core') : null);
                    // 這週唯一的核心動作在這天 → 把核心搬到別天（換掉那天沒選、還有兩個以上同類的腿部動作），空出來的位子給漏掉的部位。
                    //    （同 V1 週量下限的作法；例：新手 2 天選胸背肩核心，上半身日 3 格被胸／背／捲腹佔滿，肩整週沒練到）
                    if (!victim) {
                        const coreEx = main.find(e => e.muscle === 'core');
                        if (coreEx) {
                            for (const od of (w.days || [])) {
                                if (od === d || dayForbiddenMuscles(od.shortFocus).has('core')) continue;
                                const om = (od.exercises || []).filter(isMain);
                                if (om.some(e => e.muscle === 'core')) continue;
                                const legsN = om.filter(e => LEGS2.includes(e.muscle)).length;
                                const ov = om.filter(e => !selectedMus.has(e.muscle) && !e._coverageInjected && LEGS2.includes(e.muscle) && legsN >= 3)
                                    .sort((a, b) => ((b.cat === I) - (a.cat === I)) || ((b.tier || 3) - (a.tier || 3)))[0];
                                if (!ov) continue;
                                od.exercises[od.exercises.indexOf(ov)] = { ...coreEx, sets: ov.sets };
                                victim = coreEx;
                                break;
                            }
                        }
                    }
                    if (!victim) continue;
                    const dayNames = new Set(d.exercises.map(e => e.nameEn || e.name));
                    const pick = pool.find(ex => !dayNames.has(ex.name));
                    if (!pick) continue;
                    const styled = applyPhase(applyTrainingStyle(pick, trainingStyle, 0, level), phase, level);
                    d.exercises[d.exercises.indexOf(victim)] = { ...styled, sets: victim.sets, _coverageInjected: true };
                    weekNames.add(pick.name);
                    break;
                }
            });

            /* 🔧 [2026-09] 維持量：沒選的部位也要練到（「沒選 ≠ 不練」）。
               重點部位（使用者選的胸／背／腿）排課、加量、先練；沒選的大肌群跟輔助部位（肩、二頭、三頭、核心）
               每週至少 1 個動作維持 —— 只從「那個肌群一週已經有 3 個以上動作」的地方騰位子，
               不動重點部位的主要量，也不硬塞進違反分化純度的日子（拉日不放胸、腿日不放上半身）。
               找不到安全的位子就不塞（例：新手一天只有 3 個動作），推拉複合動作本身也會練到這些部位。 */
            const BASELINE = ['chest', 'back', 'quads', 'hamstrings', 'shoulders', 'triceps', 'biceps', 'core'];
            const weekCount = () => {
                const c = {};
                (w.days || []).forEach(d => (d.exercises || []).filter(isMain).forEach(e => { c[e.muscle] = (c[e.muscle] || 0) + 1; }));
                return c;
            };
            const BIG_M = new Set(['chest', 'back', 'quads', 'hamstrings']);
            const focusBig = new Set([...selectedMus].filter(x => ['chest', 'back', 'quads', 'hamstrings', 'glutes'].includes(x)));
            const ACC = new Set(['shoulders', 'triceps', 'biceps', 'core']);
            const usedDays = new Set();   // 一天最多塞一個維持量動作
            // 🔧 [2026-10] 整週都沒有上半身日（只選腿、一週練一天的下肢專項）→ 不再把胸推塞進腿日。
            //    使用者明確只要下肢，分化純度（腿日不練上肢）優先；validatePlan 與 verify_strength_coverage 都以此為準。
            BASELINE.forEach(m => {
                const wc = weekCount();
                if (wc[m]) return;
                const pool = sortPool(getPoolForMuscle(m, equipment, level, injuries || [], 3), MUSCLES[m]?.priorityExercises || [], trainingStyle === 'strength', false, level)
                    .filter(ex => ex.cns !== 'extreme' && ex.tier !== 1);   // 維持量用中等難度的動作，不額外加大重量主項
                if (!pool.length) return;
                // 腿的維持量優先放上半身日／全身日；上半身的維持量優先放同側的推或拉日
                const days = [...(w.days || [])].sort((a, b) => (a.exercises || []).length - (b.exercises || []).length);
                for (const d of days) {
                    if (usedDays.has(d)) continue;
                    const forbidden = dayForbiddenMuscles(d.shortFocus).has(m);
                    if (forbidden) continue;
                    const main = (d.exercises || []).filter(isMain);
                    const dc = {};
                    main.forEach(e => { dc[e.muscle] = (dc[e.muscle] || 0) + 1; });
                    // 腿部（股四頭／腿後／臀）算同一組：當天有兩個腿的動作，其中一個可以讓位
                    const LEGS3 = ['quads', 'hamstrings', 'glutes'];
                    const legDay = main.filter(e => LEGS3.includes(e.muscle)).length;
                    const legWeek = LEGS3.reduce((a, x) => a + (wc[x] || 0), 0);
                    // 騰位子：① 那個肌群當天有兩個以上、一週三個以上；② 大肌群的維持量可以換掉「沒被選來加強」的輔助動作
                    // 重點部位在它自己那一天至少留 2 個（推日的胸、拉日的背、腿日的腿）
                    const protectedFocus = (e) => focusBig.has(e.muscle) && dc[e.muscle] <= 2;
                    const canGive = (e) => !e._coverageInjected && !e._maintenance && !protectedFocus(e) && (
                        (dc[e.muscle] >= 2 && (wc[e.muscle] || 0) >= 3)
                        || (LEGS3.includes(e.muscle) && !LEGS3.includes(m) && legDay >= 2
                            && legWeek >= (LEGS3.some(x => focusBig.has(x)) ? (level === 'beginner' ? 4 : 5) : 3) && !(focusBig.has(e.muscle) && (wc[e.muscle] || 0) <= 1))
                        || (m === 'quads' && ['hamstrings', 'glutes'].includes(e.muscle) && legDay >= 2)
                        // 推的複合本身就練三頭、拉的複合本身就練二頭：新手名額不夠時，胸的維持量可以取代獨立的三頭動作、背取代二頭
                        || (level === 'beginner' && !selectedMus.has(e.muscle) && ((m === 'chest' && e.muscle === 'triceps') || (m === 'back' && e.muscle === 'biceps')))
                        // 胸、背、股四頭一週一個都沒有 → 從一週已經有 2 個以上動作的肌群騰一個（新手一天只有 3 個名額時）
                        || (BIG_M.has(m) && m !== 'hamstrings' && e.muscle !== 'core' && (wc[e.muscle] || 0) >= 2 && level === 'beginner'
                            && !(focusBig.has(e.muscle) && (wc[e.muscle] || 0) <= Math.max(2, (w.days || []).length)))   // 重點部位每天都要有
                        || (BIG_M.has(m) && ACC.has(e.muscle) && !selectedMus.has(e.muscle)
                            && (wc[e.muscle] || 0) >= (m === 'hamstrings' ? 2 : 1))   // 胸、背、股四頭一定要有；肩臂的推拉複合本來就練得到
                        || (BIG_M.has(m) && m !== 'hamstrings' && ACC.has(e.muscle) && selectedMus.has(e.muscle) && (wc[e.muscle] || 0) >= 2));
                    // 當天還沒排滿（低於這個程度的每日動作數）→ 直接加在後面，不用換掉任何動作
                    const roomLeft = main.length < dailyExerciseCap(main);   // ⚖️ [S-06] 同一個上限來源
                    const victim = roomLeft ? null : main.filter(canGive)
                        .sort((a, b) => ((selectedMus.has(a.muscle) ? 1 : 0) - (selectedMus.has(b.muscle) ? 1 : 0))
                            || ((b.cat === I) - (a.cat === I)) || ((b.tier || 3) - (a.tier || 3)) || (d.exercises.indexOf(b) - d.exercises.indexOf(a)))[0];
                    if (!victim && !roomLeft) continue;
                    const dayNames = new Set(d.exercises.map(e => e.nameEn || e.name));
                    const pats = new Set(main.map(e => `${e.muscle}::${e.zone}::${e.cat}`));
                    const pullDay = /^(PULL|UPPER B|BACK)$/i.test(String(d.shortFocus || ''));
                    const pick = pool.find(ex => !dayNames.has(ex.name) && !pats.has(`${ex.muscle}::${ex.zone}::${ex.cat}`)
                        && !(pullDay && ex.zone === 'shoulders-press'));   // 拉日的肩只放後束
                    if (!pick) continue;
                    const styled = applyPhase(applyTrainingStyle(pick, trainingStyle, 0, level), phase, level);
                    if (victim) d.exercises[d.exercises.indexOf(victim)] = { ...styled, sets: victim.sets, _maintenance: true };
                    else d.exercises.push({ ...styled, _maintenance: true });
                    weekNames.add(pick.name);
                    usedDays.add(d);
                    break;
                }
            });

            /* 重點部位的週量下限（教練標準 V1）：選來加強的胸／背／腿，一週直接組數至少
               新手 6 組、中高階 9 組（一週只練到一次的 2 天課表 6 組；新手 2 天胸背都選時上半身只有 3 格，各 3 組）。
               不夠時在它自己的那一天（推→胸、拉→背、腿→腿、上半身日→胸背）把「沒選的輔助動作」或
               「一週有兩個以上的加強部位」換成重點部位的動作；換不到再把重點動作加 1 組（新手固定 3 組不加）。 */
            if (!phase.deload) {
                const LEGS_F = ['quads', 'hamstrings', 'glutes'];
                // 🔧 [2026-10] 臀部（新手引導可選）也是重點部位：臀＋腿後（臀推、羅馬尼亞硬舉）一週同樣要到下限。
                //    以前只看胸背腿，中階 3 天選「腿＋臀」臀的直接組數只有 6 組（臀推 3 ＋ 硬舉 3）。
                const GROUP = { chest: ['chest'], back: ['back'], legs: LEGS_F, glutes: ['glutes', 'hamstrings'] };
                const HOME = { chest: /^(PUSH|UPPER|FB.*)$/i, back: /^(PULL|UPPER|FB.*)$/i, legs: /^(LEGS|LOWER|LOWER A|LOWER B|QUADS|GLUTES|FB.*)$/i };
                HOME.glutes = HOME.legs;
                const focusTags = ['chest', 'back', 'legs', 'glutes'].filter(t => effectiveHashtags.includes(t));
                const upperFocusN = focusTags.filter(t => t !== 'legs' && t !== 'glutes').length;
                const nDays = (w.days || []).length;
                const upperBoost = effectiveHashtags.includes('shoulders') || effectiveHashtags.includes('arms');
                // 2 天又加強手臂（二頭、三頭各要一格），或胸背都是重點又加強肩：上半身一天的格子不夠 → 重點部位 4 組就是上限
                const armsTight = level !== 'beginner' && nDays < 3
                    && (effectiveHashtags.includes('arms') || (effectiveHashtags.includes('shoulders') && upperFocusN === 2));
                const lowerG = (g) => g === 'legs' || g === 'glutes';
                const floorOf = (g) => level === 'beginner'
                    ? (nDays < 3 && !lowerG(g) && (upperFocusN === 2 || upperBoost) ? 3 : 6)
                    : (nDays >= 3 ? 8 : (armsTight && !lowerG(g) ? 4 : 6));
                const focusMus = new Set(focusTags.flatMap(t => GROUP[t]));
                const allMain = () => (w.days || []).flatMap(d => (d.exercises || []).filter(isMain));
                const setsOf = (ms) => allMain().filter(e => ms.includes(e.muscle)).reduce((a, e) => a + (parseInt(e.sets) || 0), 0);
                const cntWeek = (m) => allMain().filter(e => e.muscle === m).length;
                focusTags.forEach(g => {
                    const ms = GROUP[g].filter(m => !excludedMuscles?.has?.(m));
                    if (!ms.length) return;
                    const floor = floorOf(g);
                    let guard = 8;
                    while (setsOf(ms) < floor && guard-- > 0) {
                        let done = false;
                        const homeDays = (w.days || []).filter(d => HOME[g].test(String(d.shortFocus || '')))
                            .sort((a, b) => a.exercises.filter(e => isMain(e) && ms.includes(e.muscle)).length - b.exercises.filter(e => isMain(e) && ms.includes(e.muscle)).length);
                        for (const d of homeDays) {
                            const main = d.exercises.filter(isMain);
                            // 讓位順序：沒選、一週還有別的 → 沒選的核心 → 加強部位但一週有兩個以上 → 沒選且是唯一一個（複合動作本身會練到）
                            const rankV = (e) => {
                                if (focusMus.has(e.muscle) || e._coverageInjected) return 9;
                                const n = cntWeek(e.muscle), sel = selectedMus.has(e.muscle);
                                if (BIG.has(e.muscle)) return n >= 2 ? 1 : 9;
                                if (e.muscle === 'core') return sel ? (n >= 2 ? 2 : 9) : 1;
                                if (!sel) return n >= 2 ? 0 : 3;
                                return n >= 2 ? 2 : 9;
                            };
                            let victim = main.filter(e => rankV(e) < 9)
                                .sort((a, b) => rankV(a) - rankV(b) || ((b.cat === I) - (a.cat === I)) || ((b.tier || 3) - (a.tier || 3)))[0];
                            /* 沒得換、但這天有核心（使用者選的）→ 把核心搬到別天（腿日收尾），空出來的位子給重點部位。
                               別天讓位的條件：沒選的腿部動作、當天還有兩個以上腿的動作（腿照樣練得到）。 */
                            if (!victim) {
                                const coreEx = main.find(e => e.muscle === 'core');
                                if (coreEx) {
                                    for (const od of (w.days || [])) {
                                        if (od === d || dayForbiddenMuscles(od.shortFocus).has('core')) continue;
                                        const om = od.exercises.filter(isMain);
                                        if (om.some(e => e.muscle === 'core')) continue;
                                        const legsN = om.filter(e => LEGS_F.includes(e.muscle)).length;
                                        const ov = om.filter(e => !focusMus.has(e.muscle) && !selectedMus.has(e.muscle) && !e._coverageInjected
                                            && ((LEGS_F.includes(e.muscle) && legsN >= 3) || (!BIG.has(e.muscle) && cntWeek(e.muscle) >= 2)))
                                            .sort((a, b) => ((b.cat === I) - (a.cat === I)) || ((b.tier || 3) - (a.tier || 3)))[0];
                                        if (!ov) continue;
                                        od.exercises[od.exercises.indexOf(ov)] = { ...coreEx, sets: ov.sets };
                                        victim = coreEx;
                                        break;
                                    }
                                }
                            }
                            if (!victim) continue;
                            const dc = {};
                            main.forEach(e => { dc[e.muscle] = (dc[e.muscle] || 0) + 1; });
                            const forbid = dayForbiddenMuscles(d.shortFocus);
                            const targets = ms.filter(m => !forbid.has(m) && (dc[m] || 0) < capOf(m, d)).sort((a, b) => setsOf([a]) - setsOf([b]));
                            const dayNames = new Set(d.exercises.map(e => e.nameEn || e.name));
                            const pats = new Set(main.map(e => `${e.muscle}::${e.zone}::${e.cat}`));
                            let pick = null;
                            for (const m of targets) {
                                const pool = sortPool(getPoolForMuscle(m, equipment, level, injuries || [], 3), MUSCLES[m]?.priorityExercises || [], trainingStyle === 'strength', false, level)
                                    .filter(ex => !dayNames.has(ex.name) && ex.cns !== 'extreme' && !pats.has(`${ex.muscle}::${ex.zone}::${ex.cat}`));
                                pick = pool.find(ex => !weekNames.has(ex.name)) || pool[0];
                                if (pick) break;
                            }
                            if (!pick) continue;
                            const styled = applyPhase(applyTrainingStyle(pick, trainingStyle, 0, level), phase, level);
                            d.exercises[d.exercises.indexOf(victim)] = { ...styled, sets: victim.sets, _focusFloor: true };
                            weekNames.add(pick.name);
                            done = true;
                            break;
                        }
                        if (!done) {
                            if (level === 'beginner') break;
                            const cand = (w.days || []).filter(d => HOME[g].test(String(d.shortFocus || '')))
                                .flatMap(d => d.exercises.filter(e => isMain(e) && ms.includes(e.muscle) && !e.isDropSet && (parseInt(e.sets) || 0) < 4))
                                .sort((a, b) => ((a.cat === I) - (b.cat === I)) || ((a.tier || 3) - (b.tier || 3)) || ((parseInt(a.sets) || 0) - (parseInt(b.sets) || 0)))[0];
                            if (!cand) break;
                            cand.sets = (parseInt(cand.sets) || 0) + 1;
                        }
                    }
                });

                /* 背是重點（中高階）：一週要同時有垂直拉（下拉／引體）跟水平拉（划船）——
                   只練一個方向，背闊跟中背會有一邊沒練到。缺的那個方向，從「同方向有兩個」的背動作換過來。 */
                if (effectiveHashtags.includes('back') && level !== 'beginner' && !excludedMuscles?.has?.('back')) {
                    const backs = () => allMain().filter(e => e.muscle === 'back');
                    const zc = () => backs().reduce((a, e) => ((a[e.zone] = (a[e.zone] || 0) + 1), a), {});
                    for (const missing of ['back-lats', 'back-mid']) {
                        const z = zc();
                        if (z[missing]) continue;
                        const victims = (w.days || []).flatMap(d => d.exercises.filter(e => isMain(e) && e.muscle === 'back' && e.zone !== missing
                            && (e.zone === 'back-lower' || (z[e.zone] || 0) >= 2)).map(e => [d, e]))
                            .sort((a, b) => ((a[1].zone === 'back-lower' ? 0 : 1) - (b[1].zone === 'back-lower' ? 0 : 1)) || ((b[1].cat === I) - (a[1].cat === I)) || ((b[1].tier || 3) - (a[1].tier || 3)));
                        for (const [d, victim] of victims) {
                            const dayNames = new Set(d.exercises.map(e => e.nameEn || e.name));
                            const pick = sortPool(getPoolForMuscle('back', equipment, level, injuries || [], 3, [], [missing]), MUSCLES.back?.priorityExercises || [], trainingStyle === 'strength', false, level)
                                .find(ex => !dayNames.has(ex.name) && ex.cns !== 'extreme' && ex.zone === missing);
                            if (!pick) continue;
                            const styled = applyPhase(applyTrainingStyle(pick, trainingStyle, 0, level), phase, level);
                            d.exercises[d.exercises.indexOf(victim)] = { ...styled, sets: victim.sets, _planeFix: true };
                            weekNames.add(pick.name);
                            break;
                        }
                    }
                }
            }

            /* 最後對一次整週的推拉：推（胸＋肩推）比拉（背＋後束）多或少超過一半 →
               在上半身日把多的那一邊換一個給少的那一邊（胸背都選時才調，那是使用者要的平衡）。 */
            if (effectiveHashtags.includes('chest') && effectiveHashtags.includes('back')) {
                const sets = (pred) => (w.days || []).flatMap(d => (d.exercises || []).filter(isMain)).filter(pred).reduce((a, e) => a + (parseInt(e.sets) || 0), 0);
                const push = sets(e => e.muscle === 'chest' || e.zone === 'shoulders-press');
                const pull = sets(e => e.muscle === 'back' || e.zone === 'shoulders-rear');
                const heavy = push > pull * 1.5 ? 'chest' : pull > push * 1.5 ? 'back' : null;
                if (heavy) {
                    const light = heavy === 'chest' ? 'back' : 'chest';
                    const d = (w.days || []).find(x => /^(UPPER|FB)/i.test(String(x.shortFocus || '')) && (x.exercises || []).filter(e => isMain(e) && e.muscle === heavy).length >= 2);
                    if (d) {
                        const main = d.exercises.filter(isMain);
                        const victim = main.filter(e => e.muscle === heavy).sort((a, b) => ((b.cat === I) - (a.cat === I)) || ((b.tier || 3) - (a.tier || 3)) || (d.exercises.indexOf(b) - d.exercises.indexOf(a)))[0];
                        const names = new Set(d.exercises.map(e => e.nameEn || e.name));
                        const pats = new Set(main.map(e => `${e.muscle}::${e.zone}::${e.cat}`));
                        const pick = sortPool(getPoolForMuscle(light, equipment, level, injuries || [], 3), MUSCLES[light]?.priorityExercises || [], trainingStyle === 'strength', false, level)
                            .find(ex => !names.has(ex.name) && !pats.has(`${ex.muscle}::${ex.zone}::${ex.cat}`) && ex.cns !== 'extreme');
                        if (victim && pick) {
                            const styled = applyPhase(applyTrainingStyle(pick, trainingStyle, 0, level), phase, level);
                            d.exercises[d.exercises.indexOf(victim)] = { ...styled, sets: victim.sets, _balanced: true };
                        }
                    } else {
                        /* 推拉腿：沒有上半身日可以換 → 在「少的那一邊」自己的那天（拉日／推日），
                           把沒選的手臂或核心換成那一邊的動作（拉日優先補後束，也算拉） */
                        const home = (w.days || []).find(x => (light === 'back' ? /^PULL$/i : /^PUSH$/i).test(String(x.shortFocus || '')));
                        if (home) {
                            const main = home.exercises.filter(isMain);
                            const cntW = (m) => (w.days || []).reduce((a, x) => a + (x.exercises || []).filter(e => isMain(e) && e.muscle === m).length, 0);
                            const victim = main.filter(e => ['biceps', 'triceps', 'core'].includes(e.muscle) && !selectedMus.has(e.muscle)
                                && !(e.muscle === 'core' && cntW('core') <= 1 && effectiveHashtags.includes('core')))
                                .sort((a, b) => ((a.muscle === 'core') - (b.muscle === 'core')))[0];
                            if (victim) {
                                const names = new Set(home.exercises.map(e => e.nameEn || e.name));
                                const pats = new Set(main.map(e => `${e.muscle}::${e.zone}::${e.cat}`));
                                const cnt = main.filter(e => e.muscle === light).length;
                                const tries = light === 'back' ? [['shoulders', ['shoulders-rear']], ...(cnt < 3 ? [['back', null]] : [])] : (cnt < 3 ? [['chest', null]] : []);
                                for (const [m, zones] of tries) {
                                    const pick = sortPool(getPoolForMuscle(m, equipment, level, injuries || [], 3, [], zones), MUSCLES[m]?.priorityExercises || [], trainingStyle === 'strength', false, level)
                                        .find(ex => !names.has(ex.name) && !pats.has(`${ex.muscle}::${ex.zone}::${ex.cat}`) && ex.cns !== 'extreme');
                                    if (!pick) continue;
                                    const styled = applyPhase(applyTrainingStyle(pick, trainingStyle, 0, level), phase, level);
                                    home.exercises[home.exercises.indexOf(victim)] = { ...styled, sets: victim.sets, _balanced: true };
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        });
    }

    // 🔧 [2026-09] 輸出後處理 ①.35：同一週第二次練同部位換變化（中高階肌肥大）。
    //    4–5 天的課表會有第二個推／拉／上半身日；如果跟前面那天共用 2 個以上一模一樣的動作，
    //    等於把同一天做兩次 —— 教練會保留主項、其他換同部位同類型的變化（槓鈴划船 → 坐姿划船、引體 → 下拉），
    //    角度不同刺激才完整。新手不換：新手就是要重複練同樣的動作把技術練穩。力量風格也不換（主項本來就一週練兩次）。
    if (level !== 'beginner' && trainingStyle !== 'strength') {
        const KEEP = ['name', 'zone', 'muscle', 'cat', 'tier', 'cns', 'diff', 'eq', 'time'];
        const isMain = (e) => !e.isWarmup && e.tier !== 4 && e.muscle !== 'core';
        const en = (e) => e.nameEn || e.name;
        weeks.forEach(w => {
            const days = w.days || [];
            for (let j = 1; j < days.length; j++) {
                for (let i = 0; i < j; i++) {
                    const earlier = new Set((days[i].exercises || []).filter(isMain).map(en));
                    const shared = (days[j].exercises || []).filter(e => isMain(e) && earlier.has(en(e)));
                    if (shared.length < 2) continue;
                    // 從最不重要的開始換，換到只剩 1 個共用為止（次要的換不到，就換主項的變化）
                    shared.sort((a, b) => ((b.tier || 3) - (a.tier || 3)) || ((b.cat === I) - (a.cat === I)));
                    let left = shared.length;
                    shared.forEach(e => {
                        if (left < 2) return;
                        // 先找整週沒出現過的；沒有就用別天有的，但不能讓這天跟任何一天又共用 2 個以上
                        const dayJ = new Set((days[j].exercises || []).filter(isMain).map(en));
                        const overlapOK = (name) => days.every((d, k) => {
                            if (k === j) return true;
                            const ks = new Set((d.exercises || []).filter(isMain).map(en));
                            return !ks.has(name) || [...dayJ].filter(x => x !== en(e) && ks.has(x)).length === 0;
                        });
                        const weekNames = days.flatMap(d => (d.exercises || []).map(en));
                        let alt = null;
                        for (const base of [weekNames, [...dayJ, ...earlier]]) {   // 先找整週沒出現過的，沒有再放寬
                            const exclude = [...base];
                            for (let t = 0; t < 8 && !alt; t++) {
                                const c = findAlternativeExercise({ ...e, name: en(e) }, { level, equipment, injuries: injuries || [], exclude });
                                if (!c) break;
                                if (c.zone === e.zone && c.cat === e.cat && !(c.cns === 'extreme' && e.cns !== 'extreme') && overlapOK(c.nameEn)) alt = c;
                                else exclude.push(c.nameEn);
                            }
                            if (alt) break;
                        }
                        if (!alt) return;
                        const next = { ...e };
                        KEEP.forEach(k => { if (k === 'name') next.name = alt.nameEn; else if (alt[k] !== undefined) next[k] = alt[k]; });
                        delete next.nameEn;
                        delete next.suggestedWeight; delete next.suggestedWeightEach; delete next.note;
                        next._variation = en(e);
                        const arr = days[j].exercises;
                        arr[arr.indexOf(e)] = next;
                        left--;
                    });
                }
            }
        });
    }

    // 🔧 [2026-10] 輸出後處理 ①.36：同一個主項（tier 1）不排在連續兩天。
    //    5–6 天的課表「拉日 → 隔天上半身日」會兩天都是引體向上、兩天都是槓鈴臥推；
    //    同一個動作至少隔 48 小時，教練會在第二天換同部位同類型的變化（引體 → 滑輪下拉、臥推 → 啞鈴臥推）。
    //    只換後面那天；前後兩天都已經有的動作不選，換不到就維持原樣。
    {
        const isMainV = (e) => !e.isWarmup && e.tier !== 4;
        const KEEPV = ['zone', 'muscle', 'cat', 'tier', 'cns', 'diff', 'eq', 'time'];
        weeks.forEach((w, wi) => {
            const days = w.days || [];
            const phase = PHASES[wi] || PHASES[0];
            for (let i = 1; i < days.length; i++) {
                const prevTier1 = new Set((days[i - 1].exercises || []).filter(e => isMainV(e) && (e.tier || 3) === 1).map(e => e.nameEn || e.name));
                const d = days[i];
                (d.exercises || []).filter(e => isMainV(e) && (e.tier || 3) === 1 && e.muscle !== 'core' && prevTier1.has(e.nameEn || e.name)).forEach(e => {
                    const near = [days[i - 1], d, days[i + 1]].filter(Boolean).flatMap(x => (x.exercises || []).map(y => y.nameEn || y.name));
                    const pats = new Set((d.exercises || []).filter(x => isMainV(x) && x !== e).map(x => `${x.muscle}::${x.zone}::${x.cat}`));
                    const alt = recommendAlternatives({ ...e, name: e.nameEn || e.name }, { level, equipment, injuries: injuries || [], exclude: near, limit: 12 })
                        .find(c => c.zone === e.zone && c.cat === e.cat && !(c.cns === 'extreme' && e.cns !== 'extreme')
                            && !pats.has(`${c.muscle}::${c.zone}::${c.cat}`));
                    if (!alt) return;
                    const raw = ALL_EXERCISES_MAP[alt.nameEn];
                    const styled = raw ? applyPhase(applyTrainingStyle(raw, trainingStyle, 0, level), phase, level) : null;
                    const next = { ...e, name: alt.nameEn };
                    KEEPV.forEach(k => { if (alt[k] !== undefined) next[k] = alt[k]; });
                    if (styled) { next.reps = styled.reps; next.rest = styled.rest; }
                    delete next.nameEn; delete next.suggestedWeight; delete next.suggestedWeightEach;
                    if (!e.supersetId) delete next.note;
                    next._variation = e.nameEn || e.name;
                    d.exercises[d.exercises.indexOf(e)] = next;
                });
            }
        });
    }

    // 🔧 [2026-10] 輸出後處理 ①.37：極限 CNS 動作（深蹲、硬舉這類）不連兩天。
    //    生成時有 prevDayHadExtreme 擋，但後面的補位／替換路徑不一定都守，
    //    實測中階 4 天建力會排出「腿日背蹲 → 隔天拉日硬舉」：下背跟神經系統連兩天吃最重的。
    //    兩天都有 → 換掉「不是使用者重點」那天的極限動作（都是重點就換後面那天），換成同部位、同類型的非極限複合。
    {
        const isMainX = (e) => !e.isWarmup && e.tier !== 4;
        const focusMusX = new Set(effectiveHashtags.flatMap(t => ALL_TAGS[t]?.muscles || []));
        const KEEPX = ['zone', 'muscle', 'cat', 'tier', 'cns', 'diff', 'eq', 'time'];
        weeks.forEach(w => {
            const days = w.days || [];
            for (let i = 1; i < days.length; i++) {
                const exA = (days[i - 1].exercises || []).filter(e => isMainX(e) && e.cns === 'extreme');
                const exB = (days[i].exercises || []).filter(e => isMainX(e) && e.cns === 'extreme');
                if (!exA.length || !exB.length) continue;
                const aFocus = exA.some(e => focusMusX.has(e.muscle)), bFocus = exB.some(e => focusMusX.has(e.muscle));
                const order = (aFocus && !bFocus) ? [days[i], days[i - 1]] : (!aFocus && bFocus) ? [days[i - 1], days[i]] : [days[i], days[i - 1]];
                for (const d of order) {
                    const victims = (d.exercises || []).filter(e => isMainX(e) && e.cns === 'extreme');
                    const dayNames = (d.exercises || []).map(e => e.nameEn || e.name);
                    let ok = true;
                    victims.forEach(v => {
                        const pats = new Set((d.exercises || []).filter(e => isMainX(e) && e !== v).map(e => `${e.muscle}::${e.zone}::${e.cat}`));
                        const alt = recommendAlternatives({ ...v, name: v.nameEn || v.name }, { level, equipment, injuries: injuries || [], exclude: dayNames, limit: 12 })
                            .find(c => c.cns !== 'extreme' && c.cat === v.cat && !pats.has(`${c.muscle}::${c.zone}::${c.cat}`));
                        if (!alt) { ok = false; return; }
                        const next = { ...v, name: alt.nameEn };
                        KEEPX.forEach(k => { if (alt[k] !== undefined) next[k] = alt[k]; });
                        delete next.nameEn; delete next.suggestedWeight; delete next.suggestedWeightEach;
                        next._cnsSpread = v.nameEn || v.name;
                        d.exercises[d.exercises.indexOf(v)] = next;
                        dayNames.push(alt.nameEn);
                    });
                    if (ok) break;
                }
            }
        });
    }

    // 🔧 [2026-10] 輸出後處理 ①.38：四週用同一套動作，只有組數／次數／休息跟著週期變。
    //    每一週是分開生成的，後面的補位（重點部位週量下限、覆蓋、平衡）又只在非減量週跑，
    //    以前 30–40% 的課表第 2 或第 4 週會換掉動作：減量週胸推不見、換成肩推＋雙槓（選了胸，第 4 週卻沒練胸）。
    //    教練帶一個 4 週週期不會每週換動作（新手更是要重複同樣的動作才學得穩），減量週＝同樣的動作、少做幾組。
    //    做法：以第 1 週為準；後面的週有同一個動作就沿用它自己的處方，沒有就用第 1 週的動作套那一週的週期處方。
    //    超級組配對與內部標記（維持量、補位…）一律跟第 1 週一樣，排序才會四週一致。
    const lockWeeksToBase = () => {
        const isMainL = (e) => !e.isWarmup && e.tier !== 4;
        const en = (e) => e.nameEn || e.name;
        const SS_FIELDS = ['supersetId', 'supersetType', 'isSuperset', 'supersetOrder'];
        const isSsNote = (n) => typeof n === 'string' && /超級組|力竭組：T3/.test(n);
        const base = weeks[0];
        weeks.slice(1).forEach((w, wi) => {
            const phase = PHASES[wi + 1] || PHASES[0];
            (w.days || []).forEach((d, di) => {
                const b0 = base?.days?.[di];
                if (!b0) return;
                const own = new Map((d.exercises || []).filter(isMainL).map(e => [en(e), e]));
                const locked = (b0.exercises || []).filter(isMainL).map(b => {
                    const mine = own.get(en(b));
                    let x;
                    if (mine) x = { ...mine };
                    else {
                        x = applyPhase({ ...b }, phase, level);
                        if (b.isDropSet) {
                            if (phase.deload) {
                                const raw = ALL_EXERCISES_MAP[en(b)];
                                x.reps = raw ? applyTrainingStyle(raw, trainingStyle, 0, level).reps : x.reps;
                                delete x.isDropSet; delete x.dropStages; delete x.note;
                            } else {
                                x.reps = b.reps;
                                x.sets = Math.min(parseInt(x.sets) || 2, 2);
                            }
                        }
                    }
                    SS_FIELDS.forEach(k => { delete x[k]; if (b[k] !== undefined) x[k] = b[k]; });
                    if (b.supersetId) x.note = b.note;
                    else if (isSsNote(x.note)) delete x.note;
                    Object.keys(x).forEach(k => { if (k.startsWith('_') && k !== '_isFirstMain') delete x[k]; });
                    Object.keys(b).forEach(k => { if (k.startsWith('_') && k !== '_isFirstMain') x[k] = b[k]; });
                    return x;
                });
                const rest = (d.exercises || []).filter(e => !isMainL(e));
                d.exercises = [...locked, ...rest];
            });
        });
    };
    lockWeeksToBase();

    // （放在「沒選的部位也要練到」與「四週同一套動作」之後：前面的補注會把腿塞回上半身日）
    // 🔧 [2026-10] 輸出後處理 ①.43：選的重點部位（胸／背）每週組數要夠。
    //    例：新手 2 天選「胸＋核心＋腿」→ 上半身日 3 格被胸、背、核心各佔一格，胸一週只有 3 組（要 6 組）。
    //    教練的做法：核心移到下半身日收尾（換掉腿日第三個同肌群動作），上半身日空出來的格子補第二個胸的動作。
    //    只在「當天格子滿了、又有可以讓出來的動作」時才動；四週用同一套規則，挑選結果每週一樣。
    {
        const law = getLevelCode(level);
        const avoidF = new Set(avoidList(injuries || []));
        const isMain = (e) => !e.isWarmup && e.tier !== 4;
        const tags = effectiveHashtags;
        const nDays = (weeks[0]?.days || []).length;
        const upperFocusN = ['chest', 'back'].filter(t => tags.includes(t)).length;
        const upperBoost = tags.includes('shoulders') || tags.includes('arms');
        const needOf = () => {
            if (level === 'beginner') return nDays < 3 && (upperFocusN === 2 || upperBoost) ? 3 : 6;
            return nDays >= 3 ? 8 : 6;
        };
        const focusT = ['chest', 'back'].filter(t => tags.includes(t));
        const protectedMus = new Set(tags.flatMap(t => ALL_TAGS[t]?.muscles || []));
        // 補進來的動作：當天不能跟同部位已有的動作同一個動作模式（同區塊同類型），
        // 優先補這一週還沒練到的區塊（背：有下拉就補划船、有划船就補下拉）
        const pickFor = (muscle, d, weekNames, weekZones) => {
            const dayNames = new Set((d.exercises || []).map(e => e.nameEn || e.name));
            const dayPats = new Set((d.exercises || []).filter(e => isMain(e) && e.muscle === muscle).map(e => `${e.zone}|${e.cat}`));
            return sortPool(getPoolForMuscle(muscle, equipment, level, injuries || [], 3, MUSCLES[muscle]?.priorityExercises || []), MUSCLES[muscle]?.priorityExercises || [], false, false, level)
                .filter(ex => !avoidF.has(ex.name) && !dayNames.has(ex.name) && ex.cns !== 'extreme' && passesLevelGate(ex, level, equipment)
                    && !dayPats.has(`${ex.zone}|${ex.cat}`)
                    && (equipment !== 'bodyweight' || ['bodyweight', 'band'].includes(ex.eq)))
                .sort((a, b) => (weekZones.has(a.zone) ? 1 : 0) - (weekZones.has(b.zone) ? 1 : 0)
                    || (weekNames.has(a.name) ? 1 : 0) - (weekNames.has(b.name) ? 1 : 0))[0] || null;
        };
        // ①.42 上下半身分化：同一週有下半身日時，上半身日不放腿／臀的動作
        //      （以前新手 2 天選「胸＋核心＋臀」，上半身日會塞一個反向弓步，胸反而只剩一個動作）。
        //      能搬就搬到下半身日；搬不了就換成上半身的動作（優先選的重點部位）。只有一天的課表不動（那天本來就是全身）。
        const LEGM = new Set(['quads', 'hamstrings', 'glutes', 'calves']);
        const isLowerDay = (d) => /^(LEGS|LOWER.*|QUADS|GLUTES)$/i.test(String(d.shortFocus || ''));
        weeks.slice(0, 1).forEach(w => {
            const days = w.days || [];
            if (!days.some(isLowerDay)) return;
            const phase = PHASES.find(ph => ph.name === w.phase) || PHASES[0];
            const weekNames = new Set(days.flatMap(d => (d.exercises || []).map(e => e.nameEn || e.name)));
            days.filter(d => /^UPPER$/i.test(String(d.shortFocus || ''))).forEach(d => {
                (d.exercises || []).filter(e => isMain(e) && LEGM.has(e.muscle)).forEach(legEx => {
                    const target = days.find(x => isLowerDay(x)
                        && !(x.exercises || []).some(e => (e.nameEn || e.name) === (legEx.nameEn || legEx.name))
                        && (x.exercises || []).filter(isMain).length < dailyExerciseCap((x.exercises || []).filter(isMain)));
                    if (target) target.exercises.push(legEx);
                    const setsOfW = (m) => days.flatMap(x => x.exercises || []).filter(e => isMain(e) && e.muscle === m && e !== legEx).reduce((a, e) => a + (+e.sets || 0), 0);
                    const want = ['chest', 'back'].filter(t => tags.includes(t)).sort((a, b) => setsOfW(a) - setsOfW(b));
                    const weekZones = (m) => new Set(days.flatMap(x => x.exercises || []).filter(e => isMain(e) && e.muscle === m).map(e => e.zone));
                    let pick = null;
                    for (const m of [...want, 'shoulders', 'back', 'chest']) { pick = pickFor(m, d, weekNames, weekZones(m)); if (pick) break; }
                    if (!pick && !target) return;   // 換不了也搬不走：保留，總比少一個動作好
                    d.exercises = pick
                        ? d.exercises.map(e => (e === legEx ? { ...applyPhase(applyTrainingStyle(pick, trainingStyle, 1, level), phase, level), _coverageInjected: true } : e))
                        : d.exercises.filter(e => e !== legEx);
                    if (pick) weekNames.add(pick.name);
                });
            });
        });

        if (focusT.length) weeks.slice(0, 1).forEach(w => {
            const days = w.days || [];
            const phase = PHASES.find(ph => ph.name === w.phase) || PHASES[0];
            const weekNames = new Set(days.flatMap(d => (d.exercises || []).map(e => e.nameEn || e.name)));
            const setsOf = (m) => days.flatMap(d => d.exercises || []).filter(e => isMain(e) && e.muscle === m).reduce((a, e) => a + (+e.sets || 0), 0);
            for (const t of focusT) {
                for (let guard = 0; guard < 2 && setsOf(t) < needOf(); guard++) {
                    let done = false;
                    for (const d of days) {
                        if (done) break;
                        const main = (d.exercises || []).filter(isMain);
                        if (!main.some(e => e.muscle === t) || dayForbiddenMuscles(d.shortFocus).has(t)) continue;
                        const weekZones = new Set(days.flatMap(x => x.exercises || []).filter(e => isMain(e) && e.muscle === t).map(e => e.zone));
                        const pick = pickFor(t, d, weekNames, weekZones);
                        if (!pick) continue;
                        const newEx = { ...applyPhase(applyTrainingStyle(pick, trainingStyle, 1, level), phase, level), _coverageInjected: true };
                        // 胸背都選時，補了這一邊不能讓推拉比超過 1.6（另一邊補不進來時寧可兩邊一樣少）
                        const other = focusT.find(x => x !== t);
                        if (other && setsOf(t) + (+newEx.sets || 0) > 1.6 * setsOf(other)) continue;
                        if (main.length < dailyExerciseCap(main)) {
                            d.exercises.push(newEx); weekNames.add(pick.name); done = true; break;
                        }
                        // 格子滿了：讓出一格。優先把核心搬到別天（別天有空格，或別天有同肌群 2 個以上可以換掉一個）
                        const coreEx = main.find(e => e.muscle === 'core');
                        if (coreEx) {
                            for (const d2 of days) {
                                if (d2 === d || dayForbiddenMuscles(d2.shortFocus).has('core')) continue;
                                const m2 = (d2.exercises || []).filter(isMain);
                                if (m2.some(e => e.muscle === 'core')) continue;
                                if (m2.length < dailyExerciseCap(m2)) {
                                    d2.exercises.push(coreEx);
                                } else {
                                    // 讓出來的動作：拿掉之後，它所屬的重點部位一週組數仍然夠、當天仍有複合動作、髖鉸鏈仍在
                                    const tagOfM = (m) => tags.find(tg => (ALL_TAGS[tg]?.muscles || []).includes(m));
                                    const tagSets = (tg) => (ALL_TAGS[tg]?.muscles || []).reduce((a, m) => a + setsOf(m), 0);
                                    const isHinge = (e) => e.zone === 'hamstrings-hinge' || /Deadlift|Back Extension|Good Morning|Pull Through|Hyperextension/i.test(e.nameEn || e.name || '');
                                    const hingeCount = days.flatMap(x => x.exercises || []).filter(e => isMain(e) && isHinge(e)).length;
                                    const victim = [...m2].filter(e => {
                                        if (e.muscle === 'core' || focusT.includes(e.muscle)) return false;
                                        const tg = tagOfM(e.muscle);
                                        if (tg && tagSets(tg) - (+e.sets || 0) < (tg === 'legs' || tg === 'glutes' ? 6 : needOf())) return false;
                                        if (e.cat === C && m2.filter(x => x.cat === C).length <= 1) return false;
                                        if (isHinge(e) && hingeCount <= 1) return false;
                                        return true;
                                    }).sort((a, b) => (b.tier || 3) - (a.tier || 3) || (a.cat === C) - (b.cat === C) || m2.indexOf(b) - m2.indexOf(a))[0];
                                    if (!victim) continue;
                                    d2.exercises = d2.exercises.map(e => (e === victim ? coreEx : e));
                                }
                                d.exercises = d.exercises.map(e => (e === coreEx ? newEx : e));
                                weekNames.add(pick.name); done = true; break;
                            }
                            if (done) break;
                        }
                        // 或換掉一個沒有選、當天也不是主角的小肌群孤立動作（肩、二頭、三頭）
                        const filler = [...main].filter(e => !protectedMus.has(e.muscle) && ['shoulders', 'biceps', 'triceps'].includes(e.muscle) && e.cat !== C)
                            .sort((a, b) => (b.tier || 3) - (a.tier || 3))[0];
                        if (filler) {
                            d.exercises = d.exercises.map(e => (e === filler ? newEx : e));
                            weekNames.add(pick.name); done = true; break;
                        }
                    }
                    if (!done) break;
                }
            }
        });
        // 只改了第 1 週：把後面三週對齊第 1 週（同一套動作、各週自己的組數／次數）
        lockWeeksToBase();
    }

    // 🔧 [2026-10] 輸出後處理 ①.43b：換季重排要真的「換刺激」（週期輪換標準 S3／S5）。
    //    以前重排時如果建議的部位跟上一季一樣，會生出幾乎一模一樣的課表（有時 0 個新動作），
    //    「換一份」等於沒換。教練的做法：主項（tier 1）留著，前後兩季才比得起來；
    //    輔助動作至少換掉 30%，換成同部位、同區塊、同類型的變化式（仍過關節限制與等級閘門）。
    if (Array.isArray(rotateFrom) && rotateFrom.length && weeks[0]) {
        const prevNames = new Set(rotateFrom.filter(Boolean).flatMap(n => [String(n), toZhExerciseName(String(n)) || String(n)]));
        const wasUsed = (en) => prevNames.has(en) || prevNames.has(toZhExerciseName(en) || en);
        const avoidR = new Set(avoidList(injuries || []));
        const isMainR = (e) => !e.isWarmup && e.tier !== 4;
        const KEEP_R = ['name', 'zone', 'muscle', 'cat', 'tier', 'cns', 'diff', 'eq', 'time'];
        const base = weeks[0];
        const accessories = (base.days || []).flatMap((d, di) => (d.exercises || [])
            .filter(e => isMainR(e) && (e.tier || 3) >= 2 && wasUsed(e.nameEn || e.name))
            .map(e => ({ d, di, e })));
        // 至少 30% 的動作（以整份課表不重複的動作數算）是新的；主項（tier 1）不換
        const allMain = new Set((base.days || []).flatMap(d => (d.exercises || []).filter(isMainR).map(e => e.nameEn || e.name)));
        const alreadyNew = [...allMain].filter(n => !wasUsed(n)).length;
        let need = Math.max(0, Math.ceil(allMain.size * 0.3) - alreadyNew);
        const weekNames = new Set((base.days || []).flatMap(d => (d.exercises || []).map(e => e.nameEn || e.name)));
        // 先換次要的（tier 高、孤立），主要的輔助複合盡量留著
        // 同一個動作在好幾天出現 → 換一次就全部一起換（下面用 swappedTo 記住）
        const swappedTo = new Map();
        accessories.sort((a, b) => (b.e.tier || 3) - (a.e.tier || 3) || ((a.e.cat === C) - (b.e.cat === C)));
        for (const { d, e } of accessories) {
            const key = e.nameEn || e.name;
            if (swappedTo.has(key)) {
                const alt0 = swappedTo.get(key);
                const sw0 = { ...e }; KEEP_R.forEach(k => { if (alt0[k] !== undefined) sw0[k] = alt0[k]; }); sw0.nameEn = alt0.name;
                delete sw0.suggestedWeight; delete sw0.suggestedWeightEach;
                d.exercises = d.exercises.map(x => (x === e ? sw0 : x));
                continue;
            }
            if (need <= 0) continue;
            const dayNames = new Set((d.exercises || []).map(x => x.nameEn || x.name));
            const alt = ALL_EXERCISES
                .filter(x => x.muscle === e.muscle && x.zone === e.zone && x.cat === e.cat && x.tier !== 4
                    && !wasUsed(x.name) && !dayNames.has(x.name) && !weekNames.has(x.name) && !avoidR.has(x.name)
                    && passesLevelGate(x, level, equipment)
                    && (equipment !== 'bodyweight' || ['bodyweight', 'band'].includes(x.eq)))
                .sort((a, b) => Math.abs((a.tier || 3) - (e.tier || 3)) - Math.abs((b.tier || 3) - (e.tier || 3)) || (a.diff ?? 1) - (b.diff ?? 1))[0];
            if (!alt) continue;
            const swapped = { ...e };
            KEEP_R.forEach(k => { if (alt[k] !== undefined) swapped[k] = alt[k]; });
            swapped.nameEn = alt.name;
            delete swapped.suggestedWeight; delete swapped.suggestedWeightEach;
            d.exercises = d.exercises.map(x => (x === e ? swapped : x));
            weekNames.add(alt.name);
            swappedTo.set(key, alt);
            need--;
        }
        lockWeeksToBase();
    }

    // 🔧 [2026-10] 輸出後處理 ①.44：有練腿就要有髖鉸鏈（教練標準 B1）。放在 ①.4（每週 ≤20 組）之前，換進來的組數也會被那一關管到。
    //    分化課表的腿日本來就排硬舉類，但一週只練一天的全身日會變成「深蹲、臥推、划船、腿伸展」或
    //    「深蹲、臥推、上斜推、划船、引體」—— 整週沒有任何髖鉸鏈，腿後側跟下背完全沒練到。
    //    做法：整週有股四頭／臀、卻沒有鉸鏈 → 在一個可以練腿的日子，把「當天同部位還有別的動作」裡最不重要的一個
    //    （先挑沒選的部位、孤立先於複合、tier 大的先）換成鉸鏈；當天已有極限動作（深蹲）就不放硬舉。四週一起換。
    //    新手全身日只有 3 格（推、拉、蹲），不會有可以讓的動作 → 不動。
    {
        const isMain = (e) => !e.isWarmup && e.tier !== 4;
        const en = (e) => e.nameEn || e.name;
        const HINGE_NAMES = new Set(['45° Back Extension', 'Cable Pull Through', 'Hyperextensions']);
        const isHinge = (e) => e.zone === 'hamstrings-hinge' || e.zone === 'back-lower' || HINGE_NAMES.has(en(e));
        const sel = new Set(effectiveHashtags.flatMap(t => ALL_TAGS[t]?.muscles || []));
        const w0 = weeks[0];
        const all0 = (w0?.days || []).flatMap(d => (d.exercises || []).filter(isMain));
        if (all0.some(e => ['quads', 'glutes'].includes(e.muscle)) && !all0.some(isHinge)) {
            const hosts = (w0.days || []).map((d, di) => ({ d, di }))
                .filter(({ d }) => !dayForbiddenMuscles(d.shortFocus).has('hamstrings') && !/^(PUSH|PULL|UPPER.*|CHEST|BACK|SHOULDERS|ARMS)$/i.test(String(d.shortFocus || '')))
                .sort((a, b) => (b.d.exercises.some(e => isMain(e) && e.muscle === 'quads') - a.d.exercises.some(e => isMain(e) && e.muscle === 'quads')));
            for (const { d, di } of hosts) {
                const main = d.exercises.filter(isMain);
                const cnt = {};
                main.forEach(e => { cnt[e.muscle] = (cnt[e.muscle] || 0) + 1; });
                const victim = main.filter(e => cnt[e.muscle] >= 2 && e.muscle !== 'core' && !e.supersetId)
                    .sort((a, b) => ((sel.has(a.muscle) ? 1 : 0) - (sel.has(b.muscle) ? 1 : 0)) || ((b.cat !== C) - (a.cat !== C)) || ((b.tier || 3) - (a.tier || 3)) || (main.indexOf(b) - main.indexOf(a)))[0];
                if (!victim) continue;
                const dayExtreme = main.some(e => e !== victim && e.cns === 'extreme');
                const names = new Set(d.exercises.map(en));
                const pool = [
                    ...sortPool(getPoolForMuscle('hamstrings', equipment, level, injuries || [], 3, [], ['hamstrings-hinge']), MUSCLES.legs?.priorityExercises || [], trainingStyle === 'strength', false, level),
                    ...getPoolForMuscle('glutes', equipment, level, injuries || [], 3).filter(ex => HINGE_NAMES.has(ex.name)),
                ].filter(ex => ex.cat === C && !names.has(ex.name) && !(dayExtreme && ex.cns === 'extreme')
                    && !main.some(e => e !== victim && e.muscle === ex.muscle && e.zone === ex.zone && e.cat === ex.cat));   // 不跟當天的臀推撞同一個動作模式
                const pick = pool[0];
                if (!pick) continue;
                weeks.forEach((w, wi) => {
                    const wd = w.days?.[di];
                    if (!wd) return;
                    const idx = wd.exercises.findIndex(e => isMain(e) && en(e) === en(victim));
                    if (idx < 0) return;
                    const old = wd.exercises[idx];
                    const styled = applyPhase(applyTrainingStyle(pick, trainingStyle, 0, level), PHASES[wi] || PHASES[0], level);
                    const flags = Object.fromEntries(Object.entries(old).filter(([k]) => k.startsWith('_') && k !== '_isFirstMain' && k !== '_maintenance'));
                    // 換掉的是孤立／遞減組（2 組）→ 鉸鏈用自己的處方組數；換掉的是複合 → 沿用原本的組數（時間已排好）
                    wd.exercises[idx] = { ...styled, ...flags, sets: (old.cat === C && !old.isDropSet) ? old.sets : styled.sets, _hingeInjected: true };
                });
                break;
            }
        }
    }

    // 🔧 [2026-10] 輸出後處理 ①.45：[S-06] 高 CNS 日動作上限的最後一道關卡。
    //    dailyExerciseCap 在各個補位點都有讀，但每個補位點只看「加之前」的那一天：
    //    先補維持量（當時還有空位），後面的覆蓋／週量補位又換進一個大重量複合 → 重壓複合變 2 個、上限從 6 降成 5，
    //    當天卻還是 6 個（高階一週一天的全身日最常見：臥推＋引體＋上斜推＋腿的維持量＋二頭＋三頭）。
    //    這裡用最終的課表重算一次；超過就拿掉「當天同部位還有別的動作」裡最不重要的一個
    //    （孤立先於複合、tier 大的先），四週同一天一起拿，課表每週長得一樣（①.38）。不會拿掉某部位當天唯一的動作。
    {
        const isMain = (e) => !e.isWarmup && e.tier !== 4;
        const en = (e) => e.nameEn || e.name;
        const dayCount = Math.max(0, ...weeks.map(w => (w.days || []).length));
        for (let di = 0; di < dayCount; di++) {
            const col = weeks.map(w => w.days?.[di]).filter(Boolean);
            let guard = 6;
            while (guard-- > 0) {
                const ref = col.find(d => { const m = (d.exercises || []).filter(isMain); return m.length > dailyExerciseCap(m); });
                if (!ref) break;
                const main = ref.exercises.filter(isMain);
                const cnt = {};
                main.forEach(e => { cnt[e.muscle] = (cnt[e.muscle] || 0) + 1; });
                const drop = main
                    .filter(e => cnt[e.muscle] >= 2)
                    .sort((a, b) => ((b.cat !== C) - (a.cat !== C)) || ((b.tier || 3) - (a.tier || 3)) || (main.indexOf(b) - main.indexOf(a)))[0];
                if (drop) {
                    col.forEach(d => { d.exercises = d.exercises.filter(e => !isMain(e) || en(e) !== en(drop)); });
                    continue;
                }
                // 每個部位當天都只有一個動作（一週一天的全身日：胸、背、肩、二頭、三頭、腿各一）→ 拿掉就漏練。
                // 改成把一個大重量複合換成同部位、較輕的複合（引體 → 滑輪下拉）：重壓複合少一個，上限就回到 6。
                // 先換「不是使用者選的部位」的那個，重點部位的主項保留。
                const isHeavy = (e) => e.cat === C && (e.cns === 'extreme' || e.cns === 'high') && (e.tier || 3) <= 2;
                const sel = new Set(effectiveHashtags.flatMap(t => ALL_TAGS[t]?.muscles || []));
                const pullDay = /^(PULL|UPPER B|BACK)$/i.test(String(ref.shortFocus || ''));
                let swapped = false;
                for (const v of main.filter(e => isHeavy(e) && !e.supersetId)
                    .sort((a, b) => ((sel.has(a.muscle) ? 1 : 0) - (sel.has(b.muscle) ? 1 : 0)) || (main.indexOf(b) - main.indexOf(a)))) {
                    const names = new Set(ref.exercises.map(en));
                    const pats = new Set(main.filter(e => e !== v).map(e => `${e.muscle}::${e.zone}::${e.cat}`));
                    const alt = getPoolForMuscle(v.muscle, equipment, level, injuries || [], 3)
                        .filter(ex => ex.cat === C && !isHeavy(ex) && !names.has(ex.name) && !pats.has(`${ex.muscle}::${ex.zone}::${ex.cat}`)
                            && !(pullDay && ex.zone === 'shoulders-press'))
                        .sort((a, b) => ((a.zone === v.zone ? 0 : 1) - (b.zone === v.zone ? 0 : 1)) || ((a.tier || 3) - (b.tier || 3)))[0];
                    if (!alt) continue;
                    weeks.forEach((w, wi) => {
                        const d = w.days?.[di];
                        if (!d) return;
                        const idx = d.exercises.findIndex(e => isMain(e) && en(e) === en(v));
                        if (idx < 0) return;
                        const old = d.exercises[idx];
                        const styled = applyPhase(applyTrainingStyle(alt, trainingStyle, 0, level), PHASES[wi] || PHASES[0], level);
                        const flags = Object.fromEntries(Object.entries(old).filter(([k]) => k.startsWith('_') && k !== '_isFirstMain'));
                        d.exercises[idx] = { ...styled, ...flags, sets: old.sets };
                    });
                    swapped = true;
                    break;
                }
                if (!swapped) break;
            }
        }
    }

    // 🔧 [2026-09] 輸出後處理 ①.4：每個肌群一週直接組數不超過 20 組（研究上肌肥大的有效區間約 10–20 組，
    //    再多恢復跟不上）。超過時先從孤立動作扣組（最少 2 組），再扣複合（最少 3 組）。
    {
        const MAX_WEEKLY = 20;
        const isMain = (e) => !e.isWarmup && e.tier !== 4;
        weeks.forEach(w => {
            const all = (w.days || []).flatMap(d => (d.exercises || []).filter(isMain));
            const tot = {};
            all.forEach(e => { tot[e.muscle] = (tot[e.muscle] || 0) + (parseInt(e.sets) || 0); });
            Object.keys(tot).forEach(m => {
                let over = tot[m] - MAX_WEEKLY, guard = 40;
                while (over > 0 && guard-- > 0) {
                    const pick = all.filter(e => e.muscle === m && e.cat !== C && (parseInt(e.sets) || 0) > 2)
                        .sort((a, b) => (parseInt(b.sets) || 0) - (parseInt(a.sets) || 0))[0]
                        || all.filter(e => e.muscle === m && (parseInt(e.sets) || 0) > ((e.tier || 3) === 1 ? 3 : 2))
                            .sort((a, b) => (parseInt(b.sets) || 0) - (parseInt(a.sets) || 0) || (b.tier || 3) - (a.tier || 3))[0];
                    // 最後的退路：主項也降到 2 組（高頻率的專項分化，量分散在很多天）
                    const last = pick || all.filter(e => e.muscle === m && (parseInt(e.sets) || 0) > 2)
                        .sort((a, b) => (parseInt(b.sets) || 0) - (parseInt(a.sets) || 0))[0];
                    if (!last) break;
                    last.sets = (parseInt(last.sets) || 0) - 1;
                    over -= 1;
                }
            });
        });
    }

    // ─── ⚖️ [新手起始重量／選重指令 — 最終回合] ────────────────────────────
    //   位置很重要：必須跑在所有「會新增或替換動作」的流程之後
    //   （配額補注／核心保證／純度回補／下限回補／新手器械替換），
    //   且在中文化之前 —— BW_RATIO 是用英文動作名比對的。
    //   原本寫在逐動作 map 裡，實測會漏掉 8 個後來才進課表的動作。
    //
    //   給不給數字的判準（現實中教練的做法）：
    //     · 自由重量（槓鈴／啞鈴）→ 給明確 kg，因為絕對負荷是可比的。
    //     · 機械／繩索 → 不給數字。各廠配重片標示與槓桿比不同，
    //       同樣「40kg」在兩台機器上不是同一件事；用體重換算出來的是假的精確
    //       （違反誠實數據原則）。改給「怎麼挑」的指令 —— 教練站在機械前講的那句話。
    //     · 徒手 → 講清楚先把動作做穩。
    if (level === 'beginner') {
        const MACHINE_NOTE = '機械配重各廠不同，不用體重換算。先選一個能輕鬆做滿的重量，最後 2 下吃力但動作不變形；下次能做滿且有餘力再加一片。';
        weeks.forEach(w => (w.days || []).forEach(d => {
            d.exercises = (d.exercises || []).map(ex => {
                if (ex.isWarmup || ex.tier === 4) return ex;
                if (typeof ex.suggestedWeight === 'number' && ex.suggestedWeight > 0) return ex;
                const sw = userBodyWeight
                    ? calcSuggestedWeight(ex.name, userBodyWeight, userGender)
                    : null;
                if (sw?.bodyweightOnly) {
                    return { ...ex, note: ex.note || '徒手即可 — 先把動作做穩再加負重。' };
                }
                if (sw && sw.kg > 0) {
                    return {
                        ...ex,
                        suggestedWeight: sw.kg,          // ⚖️ 數字（與 e1rmAdvisor 同型別，UI 用 > 0 判斷）
                        suggestedWeightEach: sw.each,
                        note: ex.note || (sw.each
                            ? `起始建議 ${sw.kg} kg（每手）。做滿次數上限且還有餘力，下次加 2.5 kg。`
                            : `起始建議 ${sw.kg} kg。做滿次數上限且還有餘力，下次加 2.5 kg。`),
                    };
                }
                if (ex.eq === 'machine' || ex.eq === 'cable') {
                    return { ...ex, note: ex.note || MACHINE_NOTE };
                }
                return ex;
            });
        }));
    }

    // 超級組在排序前先整理一次：落單的拆回一般動作，排序才會把真正的一對當成一個單位搬
    weeks.forEach(w => (w.days || []).forEach(d => { d.exercises = normalizeSupersetPairs([...(d.exercises || [])]); }));

    // 🔧 輸出後處理 ①.5：大重量複合（tier 1）一律排在同一天的最前面。
    //    ⚠️ 前面的排序是「照肌群聚在一起」，所以會出現「飛鳥（孤立）→ 划船（大複合）」——
    //       孤立先把肌肉磨累，後面的大重量就推不動，也比較容易受傷；教練的慣例是精神最好時做最重的。
    //    只動順序、不動選了哪些動作；超級組（同 supersetId 相鄰）當成一個單位一起搬，不會被拆開。
    //    🔧 [2026-10] 寫成函式：①.6 為了塞進時間會減組、超級組輪數對不上就被拆回一般動作，
    //       拆開後的「二頭彎舉」還留在原本那組的位置（排在後三角前面）→ 拆完要再排一次（見 ①.6 之後）。
    const coachOrderDay = (d) => {
        const list = Array.isArray(d.exercises) ? d.exercises : [];
        const units = [];
        list.forEach(e => {
            const last = units[units.length - 1];
            if (last && e.supersetId && last[0].supersetId === e.supersetId) last.push(e);
            else units.push([e]);
        });
        /* 🔧 [2026-09] 排序改成教練的順序：
             ① 複合動作在前、孤立在後、核心收尾、矯正最後；
             ② 同一類裡「當天的主角肌群」先做完再換下一個肌群（臥推 → 上斜推 → 肩推），
                不再因為肩推是 tier 1 就插在兩個胸推中間；
             ③ 肌群的先後：該肌群最重的動作 tier 越小越先，同 tier 看原本誰先出現。 */
        const real = list.filter(e => !e.isWarmup && e.tier !== 4);
        const bestTier = {}, firstIdx = {};
        real.forEach((e, i) => {
            bestTier[e.muscle] = Math.min(bestTier[e.muscle] ?? 9, e.tier || 3);
            if (firstIdx[e.muscle] === undefined) firstIdx[e.muscle] = i;
        });
        // 使用者選的部位先練（精神最好的時候給重點部位），再依該肌群最重的動作、原本出現的順序
        const focusSet = new Set(effectiveHashtags.flatMap(t => ALL_TAGS[t]?.muscles || []));
        // 重點大肌群（胸背腿）最先，加強的輔助部位其次，其他最後
        const BIGS = new Set(['chest', 'back', 'quads', 'hamstrings', 'glutes']);
        // 🔧 [2026-10]「客串」的肌群（不在這天 muscle_order 裡，例：推日被補進來的臀推、腿推）排在同一類的最後：
        //    就算它是使用者的重點，推日也先做胸肩，不會第一個就做臀推（重點部位在自己那天才排第一）。
        const home = new Set(d.muscle_order || []);
        const foreignKey = (m) => (home.size > 0 && m !== 'core' && !home.has(m) ? 5000 : 0);
        const muscleKey = (m) => foreignKey(m) + (focusSet.has(m) ? (BIGS.has(m) ? 0 : 500) : 1000) + (bestTier[m] ?? 9) * 100 + (firstIdx[m] ?? 99);
        // 大肌群 → 小肌群：非手臂日裡的二頭／三頭（包含雙槓撐體、窄握臥推這類複合）一律放在
        // 胸、背、肩、腿都做完之後。先把三頭練累，後面的推舉跟夾胸就做不好。
        const ARM = new Set(['biceps', 'triceps']);
        const armDay = real.length > 0 && real.every(e => ARM.has(e.muscle) || e.muscle === 'core');
        const isBigCompound = (e) => e.cat === C && !ARM.has(e.muscle) && e.muscle !== 'core';
        // 🔧 [2026-10] 當天沒有胸背肩腿的複合（傷病／徒手把它們砍光，只剩雙槓撐體、鑽石伏地挺身這類手臂複合）
        //    → 手臂複合就是當天的主項，排第一（教練順序第 1 條「先多關節」優先於第 5 條「手臂放後面」），
        //    不會變成「靠牆深蹲（孤立）→ 雙槓撐體」。
        const hasBigCompound = real.some(isBigCompound);
        // 🔧 [2026-10] 超級組（A＋B）照「A」排：A 是先做的那個、決定這組屬於哪個部位、哪一段（複合／孤立／手臂）。
        //    以前是「整組有任何複合就算複合、有手臂就算手臂」，於是
        //    推日變成「伏地挺身 →〔鑽石伏地挺身＋側平舉〕→ 夾胸」（胸做到一半先練三頭）、
        //    拉日變成「划船 → 引體 → 臉拉 →〔直臂下拉＋彎舉〕」（背的孤立被後三角切開）。
        //    validatePlan 也是只看 A（B 掛在 A 後面、不佔位），兩邊同一個定義。
        const lead = (u) => (u.length > 1 ? (u.find(e => e.supersetOrder === 'A') || u[0]) : (u.find(e => e.muscle !== 'core') || u[0]));
        const rank = (u) => {
            if (u.some(e => e.isWarmup)) return 0;
            if (u.every(e => e.tier === 4)) return 4;
            if (u.every(e => e.muscle === 'core')) return 3;
            const a = lead(u);
            const comp = a.cat === C;
            if (!armDay && !hasBigCompound && comp && a.muscle !== 'core') return 1;
            // 維持量：複合排在重點部位的複合之後、孤立之前；孤立排在手臂之前（大肌群 → 小肌群）
            if (a._maintenance) {
                if (!armDay && ARM.has(a.muscle)) return comp ? 2.4 : 2.5;
                return comp ? 1.5 : 2.3;
            }
            if (!armDay && ARM.has(a.muscle)) return comp ? 2.4 : 2.5;
            if (a.muscle === 'core') return 3;
            return comp ? 1 : 2;
        };
        // 輕的複合（tier 3：雙槓撐體、腳墊高伏地挺身…）排在所有 tier 1–2 複合之後 —— 目的是不讓 tier 1 大重量排在輕動作後面。
        // 🔧 [2026-10] 只在「別的部位還有 tier 1 主項」或「這個部位沒有更重的複合」時才往後搬：
        //    以前沒有任何 tier 1 的徒手推日也照搬，變成「伏地挺身 → 肩推 → 雙槓撐體 → 夾胸」，胸被切成三段。
        //    孤立動作不套這條（它們本來就在所有複合之後，再依 tier 往後搬只會把同部位的孤立切開）。
        const heavyOf = (m) => real.some(e => e.muscle === m && e.cat === C && (e.tier || 3) <= 2);
        const tier1Elsewhere = (m) => real.some(e => e.muscle !== m && e.cat === C && (e.tier || 3) === 1);
        const scored = units.map((u, i) => {
            const t = lead(u).tier || 3;
            const mus = lead(u).muscle;
            const b = lead(u).cat === C && t >= 3 && (!heavyOf(mus) || tier1Elsewhere(mus)) ? 1 : 0;
            return { u, i, r: rank(u), b, m: muscleKey(mus), t, mus, c: 0 };
        });
        // 同肌群裡多關節先於單關節（核心：健腹輪 → 繩索捲腹），同類再看 tier
        const isoKey = (u) => (lead(u).cat === C ? 0 : 1);
        const cmp = (x, y) => (x.r - y.r) || (x.c - y.c) || (x.b - y.b) || (x.m - y.m) || (isoKey(x.u) - isoKey(y.u)) || (x.t - y.t) || (x.i - y.i);
        // 孤立動作接著「最後一個複合動作的肌群」先做完，再換下一個肌群。
        // 以前拉日會變成「划船 → 引體 → 反向飛鳥 → 直臂下拉」：背做到一半插一個後三角；
        // 腿日也一樣：羅馬尼亞硬舉之後先接腿彎舉，不要中間插腿伸展把腿後側切開。
        const lastCompound = scored.filter(x => x.r === 1).sort(cmp).pop();
        if (lastCompound) scored.forEach(x => { if (x.r === 2 && x.mus === lastCompound.mus) x.c = -1; });
        d.exercises = scored
            .sort(cmp)
            .flatMap(x => x.u);
    };
    weeks.forEach(w => (w.days || []).forEach(coachOrderDay));

    // 🔧 [2026-09] 輸出後處理 ①.6：每天都要塞得進時間預算。
    //    以前只在總覽顯示「超出預算」，高階幾乎每一份都跳（力量取向更常見）—— 課表本身應該就排進時間裡。
    //    教練的做法依序：① 先拿掉當天最不重要的孤立動作（仍守每日最少動作數、每個肌群至少留 1 個）；
    //    ② 還超過 → 孤立動作減 1 組（最少 2 組）；③ 再超過 → 複合動作減 1 組（最少 3 組）。
    //    同一天在四週都拿掉同一個動作，課表每週長得一樣，只有組數跟著週期變。
    {
        const law = getLevelCode(level);
        const isMain = (e) => !e.isWarmup && e.tier !== 4;
        /* 高峰週只讓當天前兩個主項走大重量（3–5 下、長休息）；第三個以後的大複合回到 6–8 下、休 2 分鐘。
           一天五個大重量 3–5 下是比賽備賽的量，神經疲勞恢復不了，時間也會拉到 80 分鐘以上。 */
        weeks.forEach(w => {
            if (!/peak/i.test(String(w.phase || ''))) return;
            (w.days || []).forEach(d => {
                let heavy = 0;
                (d.exercises || []).forEach(e => {
                    if (!isMain(e) || e.cat !== C) return;
                    const m = String(e.reps || '').match(/(\d+)\s*[-–]\s*(\d+)/);
                    if (!m || Number(m[2]) > 5) return;
                    heavy += 1;
                    if (heavy > 2) { e.reps = '6-8'; e.rest = '120s'; }
                });
            });
        });
        const dayCount = Math.max(0, ...weeks.map(w => (w.days || []).length));
        const timeOf = (d) => estimateDayMinutes(d.exercises || [], d.warmup);
        for (let di = 0; di < dayCount; di++) {
            const col = weeks.map(w => w.days?.[di]).filter(Boolean);
            let guard = 12;
            while (guard-- > 0 && Math.max(...col.map(timeOf)) > resolvedDuration) {
                const ref = col.reduce((a, b) => (timeOf(b) > timeOf(a) ? b : a));
                const main = ref.exercises.filter(isMain);
                const cnt = {};
                main.forEach(e => { cnt[e.muscle] = (cnt[e.muscle] || 0) + 1; });
                const droppable = main
                    .filter(e => main.length > law.exMin && cnt[e.muscle] >= 2 && !e._coverageInjected && !e._quotaInjected)
                    .sort((a, b) => ((b.cat === I) - (a.cat === I)) || ((b.tier || 3) - (a.tier || 3)) || (ref.exercises.indexOf(b) - ref.exercises.indexOf(a)))[0];
                if (droppable) {
                    const key = droppable.nameEn || droppable.name;
                    col.forEach(d => { d.exercises = d.exercises.filter(e => (e.nameEn || e.name) !== key || !isMain(e)); });
                    continue;
                }
                // 減組：只動超時的那幾週
                let changed = false;
                col.filter(d => timeOf(d) > resolvedDuration).forEach(d => {
                    const ms = d.exercises.filter(isMain);
                    const pick = ms.filter(e => e.cat !== C && (parseInt(e.sets) || 3) > 2).sort((a, b) => (parseInt(b.sets) || 0) - (parseInt(a.sets) || 0))[0]
                        || ms.filter(e => e.cat === C && (parseInt(e.sets) || 3) > 3).sort((a, b) => (parseInt(b.sets) || 0) - (parseInt(a.sets) || 0))[0];
                    if (pick) { pick.sets = (parseInt(pick.sets) || 3) - 1; changed = true; }
                });
                if (!changed) break;
            }
        }
    }

    // ①.6 減組可能只減到超級組的其中一個 → 再整理一次（輪數對齊、落單拆開）
    //    拆開的動作要回到教練順序裡它該在的位置 → 再排一次（只動順序，不增減動作）
    weeks.forEach(w => (w.days || []).forEach(d => { d.exercises = normalizeSupersetPairs([...(d.exercises || [])]); coachOrderDay(d); }));

    // 🔧 輸出後處理 ②：動作名稱英→中（一律最後做，讓所有內部邏輯都用英文名比對）
    weeks.forEach(w => (w.days || []).forEach(d => {
        const localize = (e) => { const en = e.nameEn || e.name; return { ...e, name: toZhExerciseName(e.name), nameEn: en }; };
        d.exercises = (d.exercises || []).map(localize);
        if (Array.isArray(d.warmup)) d.warmup = d.warmup.map(localize);
        // 補足動作、週期處方與傷勢替換都會改變時間，必須以最終輸出重算。
        d.exercises.forEach((e, i) => {
            e.estimatedMins = Math.round(estimateExerciseMinutes(e, i === 0));
        });
        d.time = String(estimateDayMinutes(d.exercises, d.warmup));
        d.time_budget = resolvedDuration;
        d.time_overflow_minutes = Math.max(0, Number(d.time) - resolvedDuration);
        d.time_budget_met = d.time_overflow_minutes === 0;
    }));
    const longestDay = Math.max(0, ...weeks.flatMap(w => w.days.map(d => Number(d.time))));
    const timeHint = longestDay > resolvedDuration
        ? `最長一天約 ${longestDay} 分鐘，超過 ${resolvedDuration} 分鐘`
        : null;

    // 第一週主要肌群的直接組數估計；10 組是肌肥大參考值，不是有效性門檻。
    // 不以此推算可訓練部位上限，也不自動增加使用者的訓練量。
    const WEEKLY_SET_FLOOR = 10;
    const volumeHint = (() => {
        const w1 = weeks[0];
        if (!w1?.days?.length) return null;
        const setsByMuscle = {};
        w1.days.forEach(d => (d.exercises || []).forEach(e => {
            if (e.isWarmup || e.tier === 4) return;
            setsByMuscle[e.muscle] = (setsByMuscle[e.muscle] || 0) + (parseInt(e.sets) || 0);
        }));
        const totalSets = Object.values(setsByMuscle).reduce((a, b) => a + b, 0);
        // 只檢查「使用者自己點名的重點」，且核心不列入（核心不是肌肥大劑量的同一套標準）
        const under = [];
        nonCoreMuscleHashes.forEach(tag => {
            const list = MUSCLES[tag]?.muscles || [tag];
            const sets = list.reduce((sum, m) => sum + (setsByMuscle[m] || 0), 0);
            if (sets < WEEKLY_SET_FLOOR) {
                under.push(`${MUSCLES[tag]?.label || tag} ${sets} 組`);
            }
        });
        if (!under.length) return null;
        return `第一週直接訓練組數估計：${under.join('、')}；全週共 ${totalSets} 組。`
             + `這是依主要訓練肌群加總，未計入間接刺激；腿部等大類也不代表其中每塊肌肉的組數。`
             + `以肌肥大為目標時，可參考約每肌群每週 10 組，但這不是最低有效門檻，較少組數仍可能有效。`
             + `請依目標、恢復與實際進步調整；0 組表示未安排直接訓練，不代表完全沒有刺激。`;
    })();

    const supersetEnabledGlobal = weeks.some(w => w.days.some(d => d.superset_enabled));
    const aiInsight = (() => {
        let base = buildAIInsight();
        if (supersetEligibleGlobal && !supersetEnabledGlobal) {
            base = (base ? base + ' ' : '') + '（本次分化結構未產生可配對的拮抗組，已自動省略超級組標記。）';
        }
        // 🔧 胸背平衡提示（選背未選胸時）
        if (balanceHint) {
            base = (base ? base + ' ' : '') + balanceHint;
        }
        // ⚖️ 週訓練量不足提示（與 balance_hint 同一條顯示路徑）
        if (volumeHint) {
            base = (base ? base + ' ' : '') + volumeHint;
        }
        if (timeHint) base = (base ? base + ' ' : '') + timeHint;
        return base;
    })();
    // ⚖️ [S-12] 開發期自我稽核：把 validatePlan 接進生成流程。
    //    它本來只在 scripts/audit_unified_legislation.mjs 跑，產品裡完全不驗證，
    //    所以任何硬傷（純度／數量／群聚／順序／等級動作池）都會靜靜出貨。
    //    只在 Vite dev 模式下 console.warn；正式版與 node 測試腳本行為完全不變。
    try {
        if (import.meta?.env?.DEV) {
            const _violations = validatePlan({ user_level: level, weeks });
            if (_violations.length) {
                console.warn(`[UnifiedTrainingEngine] 這份計劃有 ${_violations.length} 條硬傷：`, _violations);
            }
        }
    } catch { /* 稽核本身絕不可以擋住生成 */ }

    return {
        plan_name: '我的健身計劃',   // 中性預設；顯示端換成「某某的健身計劃」
        split_type: resolvedSplitType,
        split_label: splitLabel, // 🌟 這裡新增！把算出來的分化名稱傳給前端
        training_style: trainingStyle,
        session_duration: resolvedDuration,
        user_level: level, days_per_week: daysPerWeek,
        selected_hashtags: displayTags, selected_tags: displayTags,
        boosted_muscles: boostedMuscles, equipment_preference: equipment,
        injuries, user_profile: { level, assessment },
        superset_enabled: supersetEnabledGlobal,
        ai_insight: aiInsight,
        balance_hint: balanceHint, // 🔧 胸背平衡提示（供 UI 單獨顯示）
        volume_hint: volumeHint,   // ⚖️ 週訓練量不足提示（供 UI 單獨顯示）
        time_hint: timeHint,
        time_budget_met: !timeHint,
        excluded_muscles: [...excludedMuscles], // 🔧 被排除的大肌群
        weeks, created_at: new Date().toISOString(),
    };
};

// ════════════════════════════════════════════════════════════════
// ⚖️ validatePlan — 教練硬傷稽核器（立法的執法機關）
// ════════════════════════════════════════════════════════════════
// 用「專業教練帶學生」的紅線檢查一份生成計劃，回傳違規清單。
// 供回歸測試與開發期自我檢查用；無違規只代表通過以下程式規則，不代表個人適用性。
export const validatePlan = (plan) => {
    const violations = [];
    const level = plan.user_level || 'beginner';
    const law = getLevelCode(level);
    const isMain = (e) => !e.isWarmup && e.tier !== 4;
    const occupies = (e) => !(e.supersetId && e.supersetOrder === 'B');

    (plan.weeks || []).forEach(week => (week.days || []).forEach(day => {
        const where = `W${week.week_number} D${day.day_number} [${day.shortFocus}]`;
        const main = (day.exercises || []).filter(isMain);

        // 1) 分化純度：拉日無三頭/胸、推日無二頭/背、腿日無上肢
        const forbidden = dayForbiddenMuscles(day.shortFocus);
        main.forEach(e => {
            if (forbidden.has(e.muscle)) violations.push(`${where} 純度違規：${e.muscle} 出現在 ${day.shortFocus} 日（${e.nameEn || e.name}）`);
        });

        // 2) 動作數量：每日總動作數（含超級組 B）必須 ≤ 等級上限
        const slots = main.length;
        if (slots > law.exMax) violations.push(`${where} 數量違規：${slots} 個動作 > ${law.label}上限 ${law.exMax}`);

        // 3) 群聚：同肌群動作必須相鄰（不可被其他肌群切開）
        //    超級組 A+B 是一個單位（B 掛在 A 後面），以 A 的肌群計，不參與群聚判定。
        //    🔧 [2026-10] 唯一允許的拆開＝「先做完所有大重量複合，再回頭補孤立」：
        //       深蹲 → 羅馬尼亞硬舉 → 腿伸展 → 腿彎舉、臥推 → 肩推 → 夾胸。
        //       條件：同一肌群最多兩段；第一段只能是複合動作，第二段不能再有重壓複合（tier 1–2）。
        //       像「臥推 → 夾胸 → 肩推 → 上斜臥推」這種做到一半換部位再回來推重的，仍然算違規。
        const seq = main.filter(occupies).map(e => e.muscle);
        const ordUnits = main.filter(occupies);
        const runs = {};
        ordUnits.forEach((e, i) => {
            if (e.muscle === 'core') return;
            const r = runs[e.muscle] ||= [];
            if (i > 0 && ordUnits[i - 1].muscle === e.muscle) r[r.length - 1].push(e);
            else r.push([e]);
        });
        Object.entries(runs).forEach(([m, r]) => {
            if (r.length <= 1) return;
            const heavyC = (e) => e.cat === C && (e.tier || 3) <= 2;
            const ok = r.length === 2 && r[0].every(e => e.cat === C) && !r[1].some(heavyC);
            if (!ok) violations.push(`${where} 群聚違規：${m} 被其他肌群切開`);
        });

        // 4) 順序：核心必須收尾；同肌群內 tier 不可逆序（孤立不可排在複合前）
        const coreIdx = seq.indexOf('core');
        if (coreIdx !== -1 && seq.slice(coreIdx).some(m => m !== 'core')) {
            violations.push(`${where} 順序違規：核心後面還有其他肌群`);
        }
        //    🔧 [2026-10] tier 是「同一類動作裡的優先順序」，只在同類（複合對複合、孤立對孤立）之間比；
        //       跨類看的是「孤立不可排在同肌群複合之前」。窄距伏地挺身（tier 3 複合）→ 過頭三頭伸展（tier 2 孤立）
        //       是先多關節再單關節的正確順序，以前因為 3 > 2 被誤判成逆序。
        const ord = ordUnits;
        for (let i = 1; i < ord.length; i++) {
            if (ord[i].muscle !== ord[i - 1].muscle) continue;
            if (ord[i].cat === C && ord[i - 1].cat !== C) {
                violations.push(`${where} 順序違規：${ord[i].muscle} 孤立排在複合前（${ord[i - 1].nameEn || ord[i - 1].name} → ${ord[i].nameEn || ord[i].name}）`);
            } else if (ord[i].cat === ord[i - 1].cat && (ord[i].tier || 3) < (ord[i - 1].tier || 3)) {
                violations.push(`${where} 順序違規：${ord[i].muscle} 內 tier 逆序（${ord[i - 1].nameEn || ord[i - 1].name} → ${ord[i].nameEn || ord[i].name}）`);
            }
        }

        // 5) 等級動作池：禁槓鈴/難度/CNS/超級組/遞減組
        main.forEach(e => {
            if (!law.allowBarbell && e.eq === 'barbell') violations.push(`${where} 動作池違規：新手出現槓鈴動作（${e.nameEn || e.name}）`);
            if (law.forbidCns.includes(e.cns)) violations.push(`${where} 動作池違規：${law.label}出現 ${e.cns} CNS 動作（${e.nameEn || e.name}）`);
            if (!law.allowDropSet && e.isDropSet) violations.push(`${where} 技術違規：${law.label}出現遞減組`);
        });
        const ssGroups = new Set(main.filter(e => e.supersetId).map(e => e.supersetId));
        if (ssGroups.size > law.maxSupersetsPerDay) violations.push(`${where} 超級組違規：${ssGroups.size} 組 > 上限 ${law.maxSupersetsPerDay}`);

        // 6) 週期化：新手任何一週都不得出現 3-5RM 神經極限處方
        if (level === 'beginner') {
            main.forEach(e => {
                if (String(e.reps).trim() === '3-5') violations.push(`${where} 週期違規：新手出現 3-5RM 處方（${e.nameEn || e.name}）`);
            });
        }
    }));
    return violations;
};
export default generateUnifiedPlan;
