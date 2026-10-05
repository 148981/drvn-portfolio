/**
 * exerciseTaxonomy.js — 動作的分類真相：練哪裡、屬於哪個「動作模式」、健身房多常見。
 * ══════════════════════════════════════════════════════════════════════
 * 為什麼需要這一支
 * ─────────────────
 * 動作本身定義在 UnifiedTrainingEngine 的 ALL_EXERCISES（名稱／器材／tier／肌群）。
 * 但「哪兩個動作可以互相替代」需要一個 ALL_EXERCISES 沒有的欄位 —— 動作模式。
 * muscle 只能回答「練到哪塊肉」，回答不了「這是不是同一件事」：
 *   側平舉與槓鈴肩推同樣 muscle='shoulders'，但拿肩推去換側平舉是錯的
 *   （一個是垂直推的複合動作、一個是中三角的孤立動作，做的事完全不同）。
 * 反過來，硬舉 muscle='back'、羅馬尼亞硬舉 muscle='hamstrings'，
 * 但兩者都是髖鉸鏈，換起來完全合理。
 *
 * 所以：模式在這裡定義一次，scripts/verify_substitution.mjs 會確認它跟
 * ALL_EXERCISES 一對一對齊 —— 有人往動作庫加動作卻忘了給模式，npm run verify 會擋下來。
 * ══════════════════════════════════════════════════════════════════════
 */
import { ALL_EXERCISES, ALL_EXERCISES_MAP } from './UnifiedTrainingEngine';
import { toEnExerciseName } from './exerciseNameZh';

// ── 動作模式的中文名（面板上要說人話，不能寫 hip-hinge）──────────────
export const PATTERN_ZH = {
    'horizontal-push': '水平推',
    'vertical-push': '垂直推',
    'chest-fly': '夾胸',
    'vertical-pull': '垂直拉',
    'horizontal-pull': '水平拉',
    'straight-arm-pull': '直臂下拉',
    'hip-hinge': '髖鉸鏈',
    'squat': '蹲',
    'hip-extension': '伸髖',
    'hip-abduction': '髖外展',
    'knee-extension': '伸膝',
    'knee-flexion': '屈膝',
    'lateral-raise': '側平舉',
    'front-raise': '前平舉',
    'rear-delt': '後三角',
    'shoulder-rotation': '肩旋轉',
    'elbow-flexion': '屈肘',
    'elbow-extension': '伸肘',
    'calf-raise': '提踵',
    'spinal-extension': '脊椎伸展',
    'core-flexion': '核心屈曲',
    'core-antiextension': '抗伸展',
    'core-antilateral': '抗側屈',
    'core-rotation': '旋轉',
    'core-antirotation': '抗旋轉',
    'mobility': '活動度',
};

// ── 每一個動作屬於哪個模式 ─────────────────────────────────────────
// key 必須與 ALL_EXERCISES 的 name 完全一致（verify_substitution 會雙向檢查齊全）。
export const EXERCISE_PATTERN = {
    // ── 胸 ──
    'Barbell Bench Press': 'horizontal-push',
    'Incline Barbell Press': 'horizontal-push',
    'Machine Chest Press': 'horizontal-push',
    'Dumbbell Bench Press': 'horizontal-push',
    'Incline Dumbbell Press': 'horizontal-push',
    'Decline Bench Press': 'horizontal-push',
    'Chest Dips': 'horizontal-push',
    'Push Ups': 'horizontal-push',
    'Decline Push Ups': 'horizontal-push',
    'Seated Cable Fly': 'chest-fly',
    'Pec Deck Fly': 'chest-fly',
    'Dumbbell Fly': 'chest-fly',

    // ── 肩 ──
    'Barbell Overhead Press': 'vertical-push',
    'Machine Shoulder Press': 'vertical-push',
    'Dumbbell Overhead Press': 'vertical-push',
    'Pike Push Ups': 'vertical-push',
    'Band Shoulder Press': 'vertical-push',
    'Arnold Press': 'vertical-push',
    'Dumbbell Lateral Raise': 'lateral-raise',
    'Cable Lateral Raise': 'lateral-raise',
    'Band Lateral Raise': 'lateral-raise',
    'Front Raise': 'front-raise',
    'Reverse Pec Deck': 'rear-delt',
    'Reverse Cable Crossover': 'rear-delt',
    'Face Pulls': 'rear-delt',
    'Band Face Pull': 'rear-delt',
    'Band Pull Apart': 'rear-delt',
    'External Rotation': 'shoulder-rotation',

    // ── 三頭 ──
    'Close Grip Bench Press': 'elbow-extension',
    'Skull Crushers': 'elbow-extension',
    'Overhead Cable Extension': 'elbow-extension',
    'Tricep Dips': 'elbow-extension',
    'Tricep Pushdown': 'elbow-extension',
    'Diamond Push Ups': 'elbow-extension',
    'Overhead Tricep Extension': 'elbow-extension',
    'Band Tricep Extension': 'elbow-extension',
    'Bench Dips': 'elbow-extension',

    // ── 背 ──
    // 硬舉是髖鉸鏈，不是拉。標成拉的話，引體向上就會被推薦硬舉當替代 —— 那是錯的。
    'Deadlift': 'hip-hinge',
    'Barbell Row': 'horizontal-pull',
    'Pull Ups': 'vertical-pull',
    'Chest Supported Row': 'horizontal-pull',
    'Wide Grip Lat Pulldown': 'vertical-pull',
    'Neutral Grip Lat Pulldown': 'vertical-pull',
    'Chin Ups': 'vertical-pull',
    'Seated Cable Row': 'horizontal-pull',
    'Single Arm Dumbbell Row': 'horizontal-pull',
    'T-Bar Row': 'horizontal-pull',
    'Band Row': 'horizontal-pull',
    'Inverted Row': 'horizontal-pull',
    'Band Lat Pulldown': 'vertical-pull',
    'Straight Arm Pulldown': 'straight-arm-pull',
    'Hyperextensions': 'spinal-extension',
    'Superman Hold': 'spinal-extension',
    'Bird Dog': 'core-antiextension',
    'Cat Cow': 'mobility',

    // ── 二頭 ──
    'Barbell Bicep Curl': 'elbow-flexion',
    'EZ Bar Curl': 'elbow-flexion',
    'Dumbbell Bicep Curl': 'elbow-flexion',
    'Hammer Curls': 'elbow-flexion',
    'Preacher Curls': 'elbow-flexion',
    'Incline Dumbbell Curl': 'elbow-flexion',
    'Concentration Curl': 'elbow-flexion',
    'Cable Curl': 'elbow-flexion',
    'Band Bicep Curl': 'elbow-flexion',
    'Band Hammer Curl': 'elbow-flexion',

    // ── 腿：蹲 ──
    'Barbell Back Squat': 'squat',
    'Barbell Front Squat': 'squat',
    'Hack Squat': 'squat',
    'Leg Press': 'squat',
    'Smith Machine Squat': 'squat',
    'Bulgarian Split Squat': 'squat',
    'Goblet Squat': 'squat',
    'Walking Lunges': 'squat',
    'Bodyweight Squat': 'squat',
    'Reverse Lunge': 'squat',
    'Step Ups': 'squat',
    'Leg Extensions': 'knee-extension',
    'Wall Sit': 'knee-extension',

    // ── 腿：髖鉸鏈與腿後 ──
    'Romanian Deadlift': 'hip-hinge',
    'Dumbbell Romanian Deadlift': 'hip-hinge',
    'Sumo Deadlift': 'hip-hinge',
    'Good Morning': 'hip-hinge',
    'Single Leg Romanian Deadlift': 'hip-hinge',
    'Cable Pull Through': 'hip-hinge',
    'Seated Leg Curl': 'knee-flexion',
    'Lying Leg Curls': 'knee-flexion',
    'Sliding Leg Curl': 'knee-flexion',

    // ── 臀 ──
    'Hip Thrusts': 'hip-extension',
    'Single Leg Hip Thrust': 'hip-extension',
    '45° Back Extension': 'hip-extension',
    'Glute Bridge': 'hip-extension',
    'Single Leg Glute Bridge': 'hip-extension',
    'Cable Kickback': 'hip-extension',
    'Band Kickback': 'hip-extension',
    'Quadruped Hip Extension': 'hip-extension',
    'Glute Bridge Hold': 'hip-extension',
    'Machine Hip Abduction': 'hip-abduction',
    'Clamshells': 'hip-abduction',

    // ── 小腿 ──
    'Calf Raises': 'calf-raise',
    'Seated Calf Raises': 'calf-raise',
    'Single Leg Calf Raise': 'calf-raise',

    // ── 核心 ──
    'Ab Wheel Rollout': 'core-antiextension',
    'Hanging Leg Raise': 'core-flexion',
    'Cable Crunch': 'core-flexion',
    'Plank': 'core-antiextension',
    'V-Up': 'core-flexion',
    'Russian Twists': 'core-rotation',
    'Bicycle Crunches': 'core-rotation',
    'Leg Raises': 'core-flexion',
    'Dead Bug': 'core-antiextension',
    'Side Plank': 'core-antilateral',

    // ── 2026-09 補強 ──
    'Band Chest Press': 'horizontal-push',
    'Neutral Grip Push Ups': 'horizontal-push',
    'Incline Push Ups': 'horizontal-push',
    'Dumbbell Floor Press': 'horizontal-push',
    'Band Chest Fly': 'chest-fly',
    'Band Pushdown': 'elbow-extension',
    'Dumbbell Kickback': 'elbow-extension',
    'Dumbbell Rear Delt Fly': 'rear-delt',
    'Band Rear Delt Fly': 'rear-delt',
    'Prone Y Raise': 'rear-delt',
    'Band Good Morning': 'hip-hinge',
    'Band Leg Curl': 'knee-flexion',
    'Frog Pump': 'hip-extension',
    'Band Hip Abduction': 'hip-abduction',
    'Pallof Press': 'core-antirotation',
    'Hollow Body Hold': 'core-antiextension',
    'Reverse Crunch': 'core-flexion',

    // ── 矯正 / 活動度 ──
    'Hip Flexor Stretch': 'mobility',
    'Ankle Mobility Drill': 'mobility',
    'Pigeon Pose': 'mobility',
    'Shoulder Dislocates': 'mobility',
    'Wall Slides': 'mobility',
};

// ── 器材中文 ────────────────────────────────────────────────────────
export const EQUIPMENT_ZH = {
    barbell: '槓鈴', dumbbell: '啞鈴', machine: '機械',
    cable: '滑輪', bodyweight: '徒手', band: '彈力帶',
};
export const equipmentZh = (eq) => EQUIPMENT_ZH[String(eq || '').toLowerCase()] || null;

// ── 健身房有多常見（0–100）────────────────────────────────────────
// 這是編輯判斷、不是量測數據：依台灣連鎖健身房（健身工廠／World Gym／小型工作室）
// 的器材普及度排的相對順序，只拿來決定推薦排序，不會以數字形式顯示給使用者。
// 改動它只會改變排序，不會讓畫面上多出任何一個假數據。
const EQUIPMENT_AVAILABILITY = {
    bodyweight: 100, dumbbell: 96, barbell: 90, cable: 84, machine: 76, band: 40,
};
// 個別動作要的是「特定那一台／那一根」，不能只看器材大類
const EXERCISE_AVAILABILITY = {
    'Hack Squat': 58,            // 哈克機不是每間都有
    'Smith Machine Squat': 80,
    'Leg Press': 88,
    'Machine Chest Press': 82,
    'Machine Shoulder Press': 78,
    'Chest Supported Row': 70,
    'T-Bar Row': 66,             // T槓／地雷管站不普及
    'Pec Deck Fly': 74,
    'Reverse Pec Deck': 72,
    'Preacher Curls': 76,
    'Seated Leg Curl': 74,
    'Lying Leg Curls': 78,
    'Machine Hip Abduction': 72,
    '45° Back Extension': 70,
    'Hyperextensions': 70,
    'Calf Raises': 78,
    'Seated Calf Raises': 70,
    'Hip Thrusts': 78,           // 要臥推椅加護墊，人多時排不到
    'Cable Pull Through': 80,
    'Pull Ups': 88,              // 要單槓
    'Chin Ups': 88,
    'Hanging Leg Raise': 84,
    'Chest Dips': 82,            // 要雙槓
    'Tricep Dips': 82,
    'Inverted Row': 72,          // 要史密斯或低槓
    'Ab Wheel Rollout': 55,      // 要滾輪
    'Sliding Leg Curl': 50,      // 要滑盤或毛巾地板
};
export const gymAvailability = (ex) => {
    if (!ex) return 0;
    const byName = EXERCISE_AVAILABILITY[ex.name];
    if (byName != null) return byName;
    return EQUIPMENT_AVAILABILITY[String(ex.eq || '').toLowerCase()] ?? 60;
};

// ── 負重等級：這個動作加不加得了重量 ─────────────────────────────
// 排替代動作時很關鍵：槓鈴臥推的替代如果推徒手伏地挺身，等於叫你把強度砍掉一半。
// 器材大類決定預設，少數動作要個別指定（引體向上是徒手，但掛重量片是常態）。
const LOADABLE_EQ = new Set(['barbell', 'dumbbell', 'machine', 'cable']);
const LOAD_CLASS_OVERRIDE = {
    'Pull Ups': 'loaded', 'Chin Ups': 'loaded',
    'Chest Dips': 'loaded', 'Tricep Dips': 'loaded',
};
export const loadClassOf = (ex) => {
    if (!ex) return 'light';
    return LOAD_CLASS_OVERRIDE[ex.name]
        || (LOADABLE_EQ.has(String(ex.eq || '').toLowerCase()) ? 'loaded' : 'light');
};

// ── 肌群中文（全站共用；以前散在三支檔案各寫一份）───────────────────
export const MUSCLE_ZH = {
    chest: '胸', back: '背', shoulders: '肩', arms: '手臂', legs: '腿',
    core: '核心', glutes: '臀', biceps: '二頭', triceps: '三頭',
    quads: '股四頭', hamstrings: '腿後', calves: '小腿', hips: '髖',
};
export const muscleZh = (key) => MUSCLE_ZH[String(key || '').trim().toLowerCase()] || null;

// 細分肌群 → 使用者在意的大分類（課表分類講的是「推／拉／腿」這個尺度）
const MACRO_OF = {
    chest: 'chest', back: 'back', shoulders: 'shoulders', core: 'core',
    biceps: 'arms', triceps: 'arms', arms: 'arms',
    quads: 'legs', hamstrings: 'legs', calves: 'legs', glutes: 'legs',
    legs: 'legs', hips: 'legs',
};
export const toMacroMuscle = (key) => MACRO_OF[String(key || '').trim().toLowerCase()] || null;

// ── 名稱 → 定義（中文課表也查得到）─────────────────────────────────
export const defOfExercise = (name) => {
    const raw = String(name || '').trim();
    if (!raw) return null;
    return ALL_EXERCISES_MAP[raw] || ALL_EXERCISES_MAP[toEnExerciseName(raw)] || null;
};
export const patternOfExercise = (name) => {
    const def = defOfExercise(name);
    return def ? (EXERCISE_PATTERN[def.name] || null) : null;
};
export const muscleOfExercise = (name) => {
    const def = defOfExercise(name);
    return def ? toMacroMuscle(def.muscle) : null;
};

/**
 * 一場訓練練了哪些部位。回傳中文標題與依動作數排序的肌群清單。
 * 練到四個以上大部位才叫「全身」—— 這樣才不會把推力日也寫成 Full Body。
 */
export function sessionGroups(exercises) {
    const tally = {};
    (Array.isArray(exercises) ? exercises : []).forEach((ex) => {
        const m = muscleOfExercise(ex?.name);
        if (m) tally[m] = (tally[m] || 0) + 1;
    });
    const keys = Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    if (keys.length === 0) return { keys: [], label: null };
    if (keys.length >= 4) return { keys, label: '全身' };
    return { keys, label: keys.map(muscleZh).filter(Boolean).join('・') || null };
}

export const KNOWN_EXERCISE_COUNT = ALL_EXERCISES.length;
