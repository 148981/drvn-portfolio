import { toEnExerciseName } from './exerciseNameZh';
// Cache the data in memory to avoid repeated fetches during a session
let exerciseCache = null;

// Use jsdelivr for reliable access to the JSON
const DB_URL = "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/dist/exercises.json";
const ASSETS_BASE_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";

/**
 * Fetch all exercises from the open source DB.
 * Returns the array of exercises.
 */
export const fetchExercises = async () => {
    if (exerciseCache) return exerciseCache;

    try {
        console.log(`[ExerciseDB] Fetching DB from ${DB_URL}...`);
        const res = await fetch(DB_URL);
        if (!res.ok) throw new Error('Failed to fetch exercise DB');
        const data = await res.json();
        exerciseCache = data;
        console.log(`[ExerciseDB] Loaded ${data.length} exercises.`);
        return data;
    } catch (error) {
        console.error("Error loading exercise DB:", error);
        return [];
    }
};

// Basic Chinese-to-English Term Mapping for Gym
const CN_MAP = {
    // Equipment
    '啞鈴': 'Dumbbell',
    '槓鈴': 'Barbell',
    '機械': 'Lever', // DB often uses 'lever' for machines
    '繩索': 'Cable',
    '史密斯': 'Smith',
    '壺鈴': 'Kettlebell',
    '自重': 'Bodyweight',

    // Position/Angle
    '上斜': 'Incline',
    '下斜': 'Decline',
    '坐姿': 'Seated',
    '俯身': 'Bent Over',
    '平板': 'Bench',
    '單臂': 'Single Arm',

    // Movement
    '臥推': 'Bench Press',
    '推舉': 'Shoulder Press',
    '胸推': 'Chest Press',
    '划船': 'Row',
    '下拉': 'Pulldown',
    '引體向上': 'Pull Up',
    '飛鳥': 'Fly',
    '彎舉': 'Curl',
    '三頭肌伸展': 'Triceps Extension',
    '側平舉': 'Lateral Raise',
    '前平舉': 'Front Raise',
    '捲腹': 'Crunch',
    '舉腿': 'Leg Raise',
    '推': 'Press',
    '拉': 'Pull',
    '站姿': 'Standing',
    '跪姿': 'Kneeling',
    '面拉': 'Face Pull',
    '聳肩': 'Shrug',
    '深蹲': 'Squat',
    '硬舉': 'Deadlift',
    '分腿蹲': 'Split Squat',
    '保加利亞': 'Bulgarian',
    '農夫走路': 'Farmers Walk',
    '波比跳': 'Burpee',
    '開合跳': 'Jumping Jack'
};

const SPECIFIC_MAPPINGS = {
    'Band Chest Press': 'Dumbbell_Bench_Press',
    'Neutral Grip Push Ups': 'Pushups',
    'Incline Push Ups': 'Pushups',
    'Dumbbell Floor Press': 'Dumbbell_Bench_Press',
    'Band Chest Fly': 'Dumbbell_Flyes',
    'Band Pushdown': 'Triceps_Pushdown',
    'Dumbbell Kickback': 'Triceps_Pushdown',
    'Dumbbell Rear Delt Fly': 'Reverse_Machine_Flyes',
    'Band Rear Delt Fly': 'Reverse_Machine_Flyes',
    'Prone Y Raise': 'Reverse_Machine_Flyes',
    'Band Good Morning': 'Good_Morning',
    'Band Leg Curl': 'Lying_Leg_Curls',
    'Frog Pump': 'Butt_Lift_(Bridge)',
    'Band Hip Abduction': 'Thigh_Abductor',
    'Pallof Press': 'Pallof_Press_With_Band',
    'Hollow Body Hold': 'Plank',
    'Reverse Crunch': 'Flat_Bench_Lying_Leg_Raise',
    // ── 中文動作 ──────────────────────────────────────────────────────────────
    '上斜啞鈴臥推': 'Dumbbell_Incline_Bench_Press',
    '平板啞鈴臥推': 'Dumbbell_Bench_Press',
    '啞鈴臥推':     'Dumbbell_Bench_Press',
    '槓鈴臥推':     'Barbell_Bench_Press_-_Medium_Grip',
    '深蹲':         'Barbell_Squat',
    '硬舉':         'Barbell_Deadlift',
    '引體向上':     'Pullup',
    '寬握引體':     'Pullup',
    '啞鈴側平舉':   'Side_Lateral_Raise',
    '坐姿划船':     'Seated_Cable_Rows',
    '滑輪下拉':     'Wide-Grip_Lat_Pulldown',
    '俯身划船':     'Bent_Over_Barbell_Row',
    '槓鈴划船':     'Bent_Over_Barbell_Row',
    '搥式彎舉':     'Alternate_Hammer_Curl',
    '錘式彎舉':     'Alternate_Hammer_Curl',
    '繩索臉拉':     'Face_Pull',
    '啞鈴肩推':     'Dumbbell_Shoulder_Press',
    '槓鈴肩推':     'Barbell_Shoulder_Press',
    '保加利亞分腿蹲': 'Dumbbell_Bulgarian_Split_Squat',
    '窄握臥推':     'Close-Grip_Barbell_Bench_Press',
    '羅馬尼亞硬舉': 'Romanian_Deadlift',
    '臀推':         'Barbell_Hip_Thrust',
    '槓鈴臀推':     'Barbell_Hip_Thrust',
    '腿伸展':       'Leg_Extensions',
    '腿推':         'Leg_Press',
    '腿彎舉':       'Lying_Leg_Curls',
    '俯臥腿彎舉':   'Lying_Leg_Curls',

    // ── 英文複合動作 (Compound) ───────────────────────────────────────────────
    'Deadlift':                      'Barbell_Deadlift',
    'Barbell Deadlift':              'Barbell_Deadlift',
    'Romanian Deadlift':             'Romanian_Deadlift',
    'Sumo Deadlift':                 'Sumo_Deadlift',
    'Barbell Back Squat':            'Barbell_Squat',
    'Front Squat':                   'Front_Barbell_Squat',
    'Goblet Squats':                 'Dumbbell_Goblet_Squat',
    'Bulgarian Split Squats':        'Dumbbell_Bulgarian_Split_Squat',
    'Dumbbell Walking Lunges':       'Dumbbell_Walking_Lunge',
    'Hack Squat Machine':            'Barbell_Hack_Squat',
    'Smith Machine Squat':           'Smith_Machine_Squat',

    // ── 推 Push ───────────────────────────────────────────────────────────────
    'Barbell Bench Press':           'Barbell_Bench_Press_-_Medium_Grip',
    'Heavy Bench Press':             'Barbell_Bench_Press_-_Medium_Grip',
    'Incline Dumbbell Press':        'Dumbbell_Incline_Bench_Press',
    'Decline Barbell Press':         'Decline_Barbell_Bench_Press',
    'Machine Chest Press':           'Lever_Chest_Press_(Plate-Loaded)',
    'Incline Machine Press':         'Lever_Incline_Chest_Press',
    'Pec Deck Machine':              'Butterfly',
    'Cable Chest Fly':               'Cable_Crossover',
    'Cable Crossover':               'Cable_Crossover',
    'Cable Flyes (High to Low)':     'Low_Cable_Crossover',
    'Overhead Barbell Press':        'Barbell_Shoulder_Press',
    'Arnold Press':                  'Arnold_Dumbbell_Press',
    'Close-Grip Bench Press':        'Close-Grip_Barbell_Bench_Press',
    'Weighted Dips':                 'Weighted_Dips',

    // ── 拉 Pull ───────────────────────────────────────────────────────────────
    'Pull Ups':                      'Pullup',
    'Pull-ups':                      'Pullup',
    'Pull-ups (BW or Assisted)':     'Pullup',
    'Weighted Pull-ups':             'Pullup',
    'Wide Grip Pull-ups':            'Pullup',
    'Chin Ups':                      'Pullup',
    'Assisted Pull-up Machine':      'Assisted_Pullup',
    'Barbell Row':                   'Bent_Over_Barbell_Row',
    'Barbell Rows':                  'Bent_Over_Barbell_Row',
    'Bent Over Barbell Row':         'Bent_Over_Barbell_Row',
    'Barbell Bent Over Row':         'Bent_Over_Barbell_Row',
    'Barbell Bent-Over Row':         'Bent_Over_Barbell_Row',
    'T-Bar Row':                     'T-Bar_Row_with_Handle',
    'Pendlay Row':                   'Bent_Over_Barbell_Row',
    'One-Arm Dumbbell Row':          'One_Arm_Dumbbell_Row',
    'Dumbbell Row':                  'One_Arm_Dumbbell_Row',
    'Single Arm Cable Row':          'Seated_Cable_Rows',
    'Cable Row':                     'Seated_Cable_Rows',
    'Lat Pulldown':                  'Wide-Grip_Lat_Pulldown',
    'Lat Pulldown (Machine)':        'Wide-Grip_Lat_Pulldown',
    'Machine Row':                   'Lever_Seated_Row',
    'Seated Row Machine':            'Lever_Seated_Row',
    'Cable Straight-Arm Pulldown':   'Straight-Arm_Pulldown',
    'Cable Face Pulls':              'Face_Pull',

    // ── 肩部 Shoulders ────────────────────────────────────────────────────────
    'Seated Dumbbell Shoulder Press':'Dumbbell_Shoulder_Press',
    'Dumbbell Lateral Raises':       'Side_Lateral_Raise',
    'Cable Lateral Raises':          'Cable_Seated_Lateral_Raise',
    'Lateral Raise Machine':         'Lever_Lateral_Raise',
    'Bent-Over Reverse Fly':         'Reverse_Flyes',
    'Cable Upright Rows':            'Upright_Row_-_With_Bands',
    'Push Press':                    'Barbell_Push_Press',

    // ── 二頭 Biceps ───────────────────────────────────────────────────────────
    'Barbell Bicep Curls':           'Barbell_Curl',
    'Bicep Curls':                   'Dumbbell_Alternate_Bicep_Curl',
    'Dumbbell Bicep Curls':          'Dumbbell_Alternate_Bicep_Curl',
    'Cable Bicep Curls':             'Standing_Biceps_Cable_Curl',
    'EZ Bar Curls':                  'EZ-Bar_Curl',
    'Dumbbell Hammer Curls':         'Alternate_Hammer_Curl',
    'Concentration Curls':           'Concentration_Curls',

    // ── 三頭 Triceps ──────────────────────────────────────────────────────────
    'Triceps Cable Pushdown':        'Triceps_Pushdown',
    'Skull Crushers':                'Barbell_Skullcrusher',
    'Overhead Triceps Extension':    'Seated_Triceps_Press',

    // ── 腿部 Legs ─────────────────────────────────────────────────────────────
    'Leg Press Machine':             'Leg_Press',
    'Leg Press (Heavy)':             'Leg_Press',
    'Leg Extension Machine':         'Leg_Extensions',
    'Lying Leg Curl Machine':        'Lying_Leg_Curls',
    'Barbell Hip Thrust':            'Barbell_Hip_Thrust',
    'Cable Glute Kickbacks':         'Cable_Hip_Extension',
    'Standing Calf Raises':          'Calf_Raises',
    'Seated Calf Raise Machine':     'Seated_Calf_Raise',
    'Nordic Hamstring Curls':        'Lying_Leg_Curls',
    'Pistol Squats':                 'Pistol_Squat',

    // ── 核心 Core ─────────────────────────────────────────────────────────────
    'Plank':                         'Plank',
    'Hanging Leg Raises':            'Hanging_Leg_Raise',
    'Russian Twists (Weighted)':     'Russian_Twist',
    'Cable Woodchoppers':            'Standing_Cable_Wood_Chop',
    'Ab Rollout':                    'Ab_Roller',
    'Dead Bug':                      'Dead_Bug',
    'Cable Pallof Press':            'Pallof_Press_With_Band',

    // ── 引擎主要動作補強（避免 fuzzy 配錯圖）──────────────────────────────────
    'Dumbbell Overhead Press':       'Dumbbell_Shoulder_Press',
    'Machine Shoulder Press':        'Smith_Machine_Overhead_Press',
    'Barbell Overhead Press':        'Barbell_Shoulder_Press',
    'Dumbbell Bench Press':          'Dumbbell_Bench_Press',
    'Incline Barbell Press':         'Barbell_Incline_Bench_Press_-_Medium_Grip',
    'Decline Bench Press':           'Decline_Barbell_Bench_Press',
    'Chest Dips':                    'Dips_-_Chest_Version',
    'Dumbbell Fly':                  'Dumbbell_Flyes',
    'Pec Deck Fly':                  'Butterfly',
    'Seated Cable Fly':              'Cable_Crossover',
    'Low Cable Fly':                 'Low_Cable_Crossover',
    'Cable Crunch':                  'Cable_Crunch',
    'Barbell Front Squat':           'Front_Barbell_Squat',
    'Bodyweight Squat':              'Bodyweight_Squat',
    'Goblet Squat':                  'Dumbbell_Goblet_Squat',
    'Hack Squat':                    'Barbell_Hack_Squat',
    'Walking Lunges':                'Dumbbell_Walking_Lunge',
    'Bulgarian Split Squat':         'Dumbbell_Bulgarian_Split_Squat',
    'Leg Press':                     'Leg_Press',
    'Leg Extensions':                'Leg_Extensions',
    'Lying Leg Curls':               'Lying_Leg_Curls',
    'Seated Leg Curl':               'Seated_Leg_Curl',
    'Dumbbell Romanian Deadlift':    'Romanian_Deadlift_With_Dumbbells',
    'Good Morning':                  'Good_Morning',
    'Calf Raises':                   'Standing_Calf_Raises',
    'Seated Calf Raises':            'Seated_Calf_Raise',
    'Hip Thrusts':                   'Barbell_Hip_Thrust',
    'Single Leg Hip Thrust':         'Single_Leg_Glute_Bridge',
    'Glute Bridge':                  'Butt_Lift_(Bridge)',
    'Cable Kickback':                'Glute_Kickback',
    'Machine Hip Abduction':         'Thigh_Abductor',
    'Chest Supported Row':           'Lever_T-Bar_Row',
    'Single Arm Dumbbell Row':       'One-Arm_Dumbbell_Row',
    'Seated Cable Row':              'Seated_Cable_Rows',
    'Wide Grip Lat Pulldown':        'Wide-Grip_Lat_Pulldown',
    'Neutral Grip Lat Pulldown':     'V-Bar_Pulldown',
    'Straight Arm Pulldown':         'Straight-Arm_Pulldown',
    'Cable Lat Pullover':            'Straight-Arm_Pulldown',
    'Hyperextensions':               'Hyperextensions_(Back_Extensions)',
    '45° Back Extension':            'Hyperextensions_(Back_Extensions)',
    'Push Ups':                      'Pushups',
    'Face Pulls':                    'Face_Pull',
    'Dumbbell Lateral Raise':        'Side_Lateral_Raise',
    'Cable Lateral Raise':           'Cable_Seated_Lateral_Raise',
    'Front Raise':                   'Front_Dumbbell_Raise',
    'Reverse Pec Deck':              'Reverse_Machine_Flyes',
    // 🔧 修正錯圖：反向繩索交叉是「後三角」動作，原本對到胸部 Cable_Crossover 是錯圖，
    //    改對到後三角的繩索反向飛鳥。
    'Reverse Cable Crossover':       'Reverse_Cable_Crossover',
    'Barbell Bicep Curl':            'Barbell_Curl',
    'Dumbbell Bicep Curl':           'Dumbbell_Bicep_Curl',
    'Incline Dumbbell Curl':         'Incline_Dumbbell_Curl',
    'Hammer Curls':                  'Hammer_Curls',
    'EZ Bar Curl':                   'EZ-Bar_Curl',
    'Cable Curl':                    'Standing_Biceps_Cable_Curl',
    'Preacher Curls':                'Preacher_Curl',
    'Concentration Curl':            'Concentration_Curls',
    'Diamond Push Ups':              'Close-Grip_Push-Up',
    'Tricep Pushdown':               'Triceps_Pushdown',
    'Rope Pushdown':                 'Triceps_Pushdown_-_Rope_Attachment',
    'Overhead Tricep Extension':     'Standing_Dumbbell_Triceps_Extension',
    'Overhead Cable Extension':      'Cable_Rope_Overhead_Triceps_Extension',
    'Tricep Dips':                   'Dips_-_Triceps_Version',
    'Close Grip Bench Press':        'Close-Grip_Barbell_Bench_Press',
    'Ab Wheel Rollout':              'Ab_Roller',
    'Hanging Leg Raise':             'Hanging_Leg_Raise',
    'Russian Twists':                'Russian_Twist',
    'Bicycle Crunches':              'Air_Bike',
    'Leg Raises':                    'Flat_Bench_Lying_Leg_Raise',
    'Step Ups':                      'Dumbbell_Step_Ups',

    // ── 補上原本落到 fuzzy 的動作：給明確圖庫對應，避免配錯圖 ──────────────────
    //   彈力帶版動作多無專屬圖 → 對應到「同動作的標準器材版」圖示，動作型態一致。
    'Band Lateral Raise':            'Side_Lateral_Raise',
    'Band Row':                      'Bent_Over_Two-Dumbbell_Row',
    'Band Bicep Curl':               'Dumbbell_Bicep_Curl',
    'Band Tricep Extension':         'Triceps_Pushdown',
    'Band Face Pull':                'Face_Pull',
    'Band Pull Apart':               'Face_Pull',
    'Band Kickback':                 'Glute_Kickback',
    'External Rotation':             'Seated_Dumbbell_External_Rotation',
    'Cable Pull Through':            'Pull_Through',
    'Clamshells':                    'Hip_Circles_(prone)',
    'Quadruped Hip Extension':       'Flutter_Kicks',
    'V-Up':                          'Jackknife_Sit-Up',
    'Side Plank':                    'Side_Bridge',
    'Bird Dog':                      'Kneeling_Quadriceps_Stretch',
    'Superman Hold':                 'Superman',
    // 暖身/收操純伸展：圖庫無專屬圖時讓 UI 顯示誠實空狀態，不硬配錯圖
    // （Cat Cow / Hip Flexor Stretch / Ankle Mobility Drill / Pigeon Pose /
    //   Glute Bridge Hold / Shoulder Dislocates / Wall Slides 維持 fuzzy 或空狀態）
};

/* 🔧 [2026-09] 圖片對照逐一核對過 free-exercise-db 的實際 id（876 筆）。
   舊表有 40 幾個 id 根本不存在（例如 Pullup、Dumbbell_Incline_Bench_Press），會掉到模糊比對、配到別的動作。
   這張表覆蓋掉錯的；圖庫真的沒有的動作放在 NO_IMAGE，顯示空狀態，不硬配一張錯圖。 */
Object.assign(SPECIFIC_MAPPINGS, {
    'Machine Chest Press': 'Leverage_Chest_Press',
    'Incline Dumbbell Press': 'Incline_Dumbbell_Press',
    'Decline Push Ups': 'Decline_Push-Up',
    'Machine Shoulder Press': 'Machine_Shoulder_Military_Press',
    'Band Shoulder Press': 'Shoulder_Press_-_With_Bands',
    'Reverse Cable Crossover': 'Cable_Rear_Delt_Fly',
    'External Rotation': 'External_Rotation_with_Band',
    'Skull Crushers': 'EZ-Bar_Skullcrusher',
    'Diamond Push Ups': 'Push-Ups_-_Close_Triceps_Position',
    'Bench Dips': 'Bench_Dips',
    'Pull Ups': 'Pullups',
    'Chin Ups': 'Chin-Up',
    'Chest Supported Row': 'Leverage_Iso_Row',
    'Inverted Row': 'Inverted_Row',
    'Hyperextensions': 'Hyperextensions_Back_Extensions',
    '45° Back Extension': 'Hyperextensions_Back_Extensions',
    'Band Hammer Curl': 'Hammer_Curls',
    'Bulgarian Split Squat': 'Split_Squat_with_Dumbbells',
    'Goblet Squat': 'Goblet_Squat',
    'Walking Lunges': 'Dumbbell_Lunges',
    'Reverse Lunge': 'Dumbbell_Rear_Lunge',
    'Dumbbell Romanian Deadlift': 'Stiff-Legged_Dumbbell_Deadlift',
    'Single Leg Romanian Deadlift': 'Kettlebell_One-Legged_Deadlift',
    'Sliding Leg Curl': 'Ball_Leg_Curl',
    'Glute Bridge': 'Butt_Lift_Bridge',
    'Single Leg Glute Bridge': 'Single_Leg_Glute_Bridge',
    'Single Leg Calf Raise': 'Standing_Dumbbell_Calf_Raise',
    'Frog Pump': 'Butt_Lift_Bridge',
    'Pallof Press': 'Pallof_Press',
    'Band Chest Press': 'Bench_Press_-_With_Bands',
    'Dumbbell Floor Press': 'Dumbbell_Floor_Press',
    'Band Chest Fly': 'Cross_Over_-_With_Bands',
    'Incline Push Ups': 'Incline_Push-Up',
    'Band Lateral Raise': 'Lateral_Raise_-_With_Bands',
    'Dumbbell Rear Delt Fly': 'Seated_Bent-Over_Rear_Delt_Raise',
    'Band Rear Delt Fly': 'Back_Flyes_-_With_Bands',
    'Prone Y Raise': 'Lying_Rear_Delt_Raise',
    'Band Tricep Extension': 'Speed_Band_Overhead_Triceps',
    'Dumbbell Kickback': 'Tricep_Dumbbell_Kickback',
    'Hack Squat': 'Hack_Squat',
    'Band Leg Curl': 'Seated_Band_Hamstring_Curl',
    'Band Good Morning': 'Band_Good_Morning',
    'Quadruped Hip Extension': 'Glute_Kickback',
    'Reverse Crunch': 'Reverse_Crunch',
    'Band Pull Apart': 'Band_Pull_Apart',
    'Arm Circles': 'Arm_Circles',
    'Scapular Push Up': 'Scapular_Pull-Up',
    'Hip Flexor Stretch': 'Kneeling_Hip_Flexor',
    'Ankle Circles': 'Ankle_Circles',
    'Inchworm': 'Inchworm',
    'Mountain Climbers (slow)': 'Mountain_Climbers',
    'Glute Bridge (warm-up)': 'Butt_Lift_Bridge',
    'Cat Cow': 'Cat_Stretch',
    '上斜啞鈴臥推': 'Incline_Dumbbell_Press',
    '引體向上': 'Pullups',
    '寬握引體': 'Pullups',
    '保加利亞分腿蹲': 'Split_Squat_with_Dumbbells',
    'Goblet Squats': 'Goblet_Squat',
    'Bulgarian Split Squats': 'Split_Squat_with_Dumbbells',
    'Dumbbell Walking Lunges': 'Dumbbell_Lunges',
    'Incline Machine Press': 'Leverage_Incline_Chest_Press',
    'Weighted Dips': 'Dips_-_Chest_Version',
    'Pull-ups': 'Pullups',
    'Pull-ups (BW or Assisted)': 'Pullups',
    'Weighted Pull-ups': 'Weighted_Pull_Ups',
    'Wide Grip Pull-ups': 'Pullups',
    'Assisted Pull-up Machine': 'Band_Assisted_Pull-Up',
    'One-Arm Dumbbell Row': 'One-Arm_Dumbbell_Row',
    'Dumbbell Row': 'One-Arm_Dumbbell_Row',
    'Machine Row': 'Leverage_Iso_Row',
    'Seated Row Machine': 'Leverage_Iso_Row',
    'Lateral Raise Machine': 'Side_Lateral_Raise',
    'Push Press': 'Push_Press',
    'Cable Glute Kickbacks': 'Glute_Kickback',
    'Standing Calf Raises': 'Standing_Calf_Raises',
    'Pistol Squats': 'Kettlebell_Pistol_Squat',
    'Cable Pallof Press': 'Pallof_Press',
});
const NO_IMAGE = new Set(['Pike Push Ups', 'Wall Sit', 'Band Lat Pulldown', 'Bird Dog', 'Clamshells', 'Hollow Body Hold', 'Wall Slides', 'Shoulder Dislocates', 'Dead Hang', 'Thoracic Rotation', 'Leg Swing', 'Fire Hydrants', 'Jumping Jacks', 'High Knees']);


/**
 * Find an exercise by name (fuzzy match with Translation).
 * @param {string} name - The name of the exercise (English or Chinese)
 * @returns {object|null} - The exercise object or null
 */
export const findExerciseByName = async (nameIn) => {
    let name = nameIn;
    if (!name) return null;
    // console.log(`[ExerciseDB] Searching for: "${name}"`); // Reduced log spam

    const allExercises = await fetchExercises();
    if (!allExercises || allExercises.length === 0) {
        console.warn('[ExerciseDB] Database empty or failed to load');
        return null;
    }

    // Helper to process result
    const processResult = (ex) => {
        if (!ex) return null;
        // Construct Image URLs
        if (ex.images && ex.images.length > 0) {
            ex.imageUrls = ex.images.map(img => `${ASSETS_BASE_URL}/${img}`);
            ex.gifUrl = ex.imageUrls[0]; // Default poster
        }
        return ex;
    };

    // 0. Check Specific Hardcoded Mappings first
    //    中文名先轉回動作庫英文名：以前「坐姿繩索夾胸」走模糊比對，「坐姿」「繩索」配到坐姿划船的圖。
    {
        const en = /[\u4e00-\u9fa5]/.test(name) ? toEnExerciseName(name) : name;
        if (en && en !== name && SPECIFIC_MAPPINGS[en]) name = en;
    }
    if (NO_IMAGE.has(name)) return null;
    if (SPECIFIC_MAPPINGS[name]) {
        const targetId = SPECIFIC_MAPPINGS[name];
        // Normalize for comparison
        const match = allExercises.find(ex =>
            ex.id.toLowerCase() === targetId.toLowerCase()
        );
        if (match) {
            console.log(`[ExerciseDB] Direct Match: ${name} -> ${match.id}`);
            return processResult(match);
        }
    }

    // 1. Prepare Query (Handle Chinese Translation)
    let query = name;
    const hasChinese = /[\u4e00-\u9fa5]/.test(name);

    if (hasChinese) {
        let translated = name;
        Object.entries(CN_MAP).forEach(([cn, en]) => {
            translated = translated.replace(new RegExp(cn, 'g'), ' ' + en + ' ');
        });
        query = translated.trim();
        console.log(`[ExerciseDB] Translated "${name}" -> "${query}"`);
    }

    const normalizedQuery = query.toLowerCase().replace(/[^a-z0-9]/g, '');

    // 2. Exact match (normalized ID)
    const exact = allExercises.find(ex => ex.id.replace(/[^a-z0-9]/g, '').toLowerCase() === normalizedQuery);
    if (exact) {
        return processResult(exact);
    }

    // 3. Keyword Match (Score-based)
    const cleanQuery = query.replace(/\s+/g, ' ').trim();
    const keywords = cleanQuery.toLowerCase().split(' ').filter(k => k.length > 2);

    if (keywords.length === 0) return null;

    // 關鍵字權重：動作型態詞（如 overhead/incline/decline）比器材詞重要，避免配錯圖
    const STRONG_KEYWORDS = new Set(['overhead', 'incline', 'decline', 'seated', 'standing', 'lying', 'bench', 'row', 'press', 'curl', 'fly', 'raise', 'pulldown', 'pullup', 'pushdown', 'extension', 'thrust', 'squat', 'deadlift', 'lunge', 'crossover', 'kickback',
        // ── 區別性關鍵字：避免「划船」配到「直立上拉(upright)」、「彎舉」配到「集中(concentration)」等錯誤模糊比對 ──
        'bent', 'upright', 'front', 'rear', 'reverse', 'close', 'wide', 'hammer', 'preacher', 'concentration', 'hip', 'glute', 'bridge', 'calf', 'sumo', 'romanian', 'goblet', 'hack', 'pull', 'pushup', 'dip', 'shrug', 'face']);
    const scoreCandidate = (ex) => {
        const exWords = ex.id.replace(/_/g, ' ').toLowerCase().split(/\s+/);
        const exSet = new Set(exWords);
        let score = 0;
        for (const k of keywords) {
            if (exSet.has(k)) score += STRONG_KEYWORDS.has(k) ? 3 : 1;          // 完整字詞命中
            else if (exWords.some(w => w.includes(k))) score += STRONG_KEYWORDS.has(k) ? 2 : 0.5; // 部分命中
        }
        // 懲罰：候選含有「查詢沒有的強型態詞」（避免 overhead 配到 bench）
        for (const w of exWords) {
            if (STRONG_KEYWORDS.has(w) && !keywords.includes(w)) score -= 2;
        }
        return score;
    };

    // Filter candidates that contain ALL keywords first (strict)
    let candidates = allExercises.filter(ex => {
        const exId = ex.id.replace(/_/g, ' ').toLowerCase();
        return keywords.every(k => exId.includes(k));
    });

    // Fallback: Contain MOST keywords
    if (candidates.length === 0) {
        candidates = allExercises.filter(ex => {
            const exId = ex.id.replace(/_/g, ' ').toLowerCase();
            const matchCount = keywords.filter(k => exId.includes(k)).length;
            return matchCount >= keywords.length - 1 && matchCount >= 2;
        });
    }

    // Fallback 2: "Machine" <-> "Lever" swap
    if (candidates.length === 0 && keywords.includes('machine')) {
        const leverKeywords = keywords.map(k => k === 'machine' ? 'lever' : k);
        candidates = allExercises.filter(ex => {
            const exId = ex.id.replace(/_/g, ' ').toLowerCase();
            return leverKeywords.every(k => exId.includes(k));
        });
    }

    // Fallback 3: 去掉「器材/姿勢修飾詞」後比對核心動作。
    //   許多動作（啞鈴羅馬尼亞硬舉、側臥髖外展、單腿臀推…）在英文圖庫只有「基本款」，
    //   因器材前綴卡住而配不到。先剝掉修飾詞，用核心關鍵字再比一次。
    let matchKeywords = keywords;       // 防錯圖門檻評估時用的關鍵字集合
    let usedCoreFallback = false;
    if (candidates.length === 0) {
        const QUALIFIERS = new Set(['dumbbell', 'barbell', 'cable', 'machine', 'lever', 'smith', 'banded', 'band',
            'seated', 'standing', 'lying', 'side', 'bstance', 'deficit', 'single', 'leg', 'kneeling', 'incline', 'decline']);
        const core = keywords.filter(k => !QUALIFIERS.has(k));
        if (core.length >= 1 && core.length < keywords.length) {
            candidates = allExercises.filter(ex => {
                const exId = ex.id.replace(/_/g, ' ').toLowerCase();
                return core.every(k => exId.includes(k));
            });
            if (candidates.length > 0) { matchKeywords = core; usedCoreFallback = true; }
        }
    }

    if (candidates.length > 0) {
        // 🔧 依加權分數排序（型態詞優先），同分再取最短 id；避免「最短 id」誤判
        candidates.sort((a, b) => {
            const sb = scoreCandidate(b), sa = scoreCandidate(a);
            if (sb !== sa) return sb - sa;
            return a.id.length - b.id.length;
        });
        const best = candidates[0];
        const bestScore = scoreCandidate(best);
        // 🔴 防錯圖門檻：避免「Reverse Nordic Curl」只靠 reverse+curl 配到不相干的繩索彎舉而顯示錯圖。
        // 核心判斷：查詢裡每個「具識別性的關鍵字」(長度 >= 4，例如 nordic) 是否真的出現在候選。
        // 若有這種識別字完全沒被候選包含，代表這只是型態詞 (curl/press) 撞名的弱配對 → 回傳 null，
        // 讓 UI 顯示誠實空狀態 (此動作暫無示範圖片與說明) 而非配一張錯的圖。
        const bestWords = best.id.replace(/_/g, ' ').toLowerCase().split(/\s+/);
        const inBest = (k) => bestWords.some(w => w === k || w.includes(k) || k.includes(w));
        // 具識別性的關鍵字 = 長度 >= 4 的查詢詞 (排除 the/and 類短詞)
        // 🔧 若是「剝除修飾詞」的核心比對，門檻只評估核心關鍵字（修飾詞本就被允許缺席）
        const distinctiveKeywords = matchKeywords.filter(k => k.length >= 4);
        const missedDistinctive = distinctiveKeywords.filter(k => !inBest(k));
        // 命中比例：（核心）關鍵字有多少出現在候選
        const coverage = matchKeywords.length > 0 ? matchKeywords.filter(inBest).length / matchKeywords.length : 1;
        // 拒配條件：(a) 有識別字完全沒命中 且 整體命中率不足 7 成；或 (b) 整體分數過低
        //   核心比對(已剝修飾詞)時，分數門檻放寬（修飾詞被扣分屬正常），改靠 (a) 的核心識別字把關。
        const scoreFloor = usedCoreFallback ? -2 : 1;
        if ((missedDistinctive.length > 0 && coverage < 0.7) || bestScore <= scoreFloor) {
            console.log(`[ExerciseDB] Fuzzy match too weak for "${name}" (best ${best.id} score ${bestScore}, miss [${missedDistinctive.join(',')}], coverage ${coverage.toFixed(2)}) → 回傳 null`);
            return null;
        }
        console.log(`[ExerciseDB] Fuzzy Match: ${name} -> ${best.id} (score ${bestScore})`);
        return processResult(best);
    }

    console.warn('[ExerciseDB] No match found for:', name);
    return null;
};

/**
 * 英文動作名稱 → 中文對照表
 * 用於 UI 顯示，演算法內部仍使用英文
 */
export const EXERCISE_NAME_ZH = {
    'Band Chest Press': '彈力帶胸推',
    'Neutral Grip Push Ups': '握把伏地挺身',
    'Incline Push Ups': '上斜伏地挺身',
    'Dumbbell Floor Press': '啞鈴地板臥推',
    'Band Chest Fly': '彈力帶夾胸',
    'Band Pushdown': '彈力帶三頭下壓',
    'Dumbbell Kickback': '啞鈴三頭後踢',
    'Dumbbell Rear Delt Fly': '啞鈴俯身反向飛鳥',
    'Band Rear Delt Fly': '彈力帶反向飛鳥',
    'Prone Y Raise': '俯臥 Y 字上舉',
    'Band Good Morning': '彈力帶早安式',
    'Band Leg Curl': '彈力帶腿彎舉',
    'Frog Pump': '青蛙臀橋',
    'Band Hip Abduction': '彈力帶髖外展',
    'Pallof Press': '帕洛夫推',
    'Hollow Body Hold': '空心支撐',
    'Reverse Crunch': '反向捲腹',
    // ── 腿部 ──────────────────────────────────────────────────────
    'Barbell Squat':                '槓鈴深蹲',
    'Front Squat':                  '前蹲',
    'Goblet Squats':                '高腳杯深蹲',
    'Goblet Squat':                 '高腳杯深蹲',
    'Bulgarian Split Squats':       '保加利亞分腿蹲',
    'Bulgarian Split Squat':        '保加利亞分腿蹲',
    'Dumbbell Walking Lunges':      '啞鈴行進弓箭步',
    'Walking Lunges':               '行進弓箭步',
    'Lunge':                        '弓箭步',
    'Lunges':                       '弓箭步',
    'Hack Squat Machine':           '黑克深蹲機',
    'Smith Machine Squat':          '史密斯深蹲',
    'Leg Press Machine':            '腿推機',
    'Leg Press (Heavy)':            '腿推機（重）',
    'Leg Press':                    '腿推',
    'Leg Extension Machine':        '腿伸展機',
    'Leg Extensions':               '腿伸展',
    'Lying Leg Curl Machine':       '俯臥腿彎舉機',
    'Lying Leg Curls':              '俯臥腿彎舉',
    'Barbell Hip Thrust':           '槓鈴臀推',
    'Hip Thrust':                   '臀推',
    'Cable Glute Kickbacks':        '繩索臀踢',
    'Glute Kickback':               '臀踢',
    'Standing Calf Raises':         '站姿提踵',
    'Seated Calf Raise Machine':    '坐姿提踵機',
    'Nordic Hamstring Curls':       '北歐腿後彎舉',
    'Pistol Squats':                '單腳深蹲',
    'Pistol Squat':                 '單腳深蹲',
    'Stiff-Leg Deadlift':           '直腿硬舉',
    'Sumo Deadlift':                '相撲硬舉',
    'Deadlift':                     '硬舉',
    'Barbell Deadlift':             '槓鈴硬舉',

    // ── 推 Push ────────────────────────────────────────────────────
    'Barbell Bench Press':          '槓鈴臥推',
    'Heavy Bench Press':            '大重量臥推',
    'Incline Dumbbell Press':       '上斜啞鈴推',
    'Decline Barbell Press':        '下斜槓鈴推',
    'Machine Chest Press':          '胸推機',
    'Incline Machine Press':        '上斜推胸機',
    'Pec Deck Machine':             '夾胸機',
    'Cable Chest Fly':              '繩索飛鳥',
    'Cable Crossover':              '繩索交叉',
    'Cable Flyes (High to Low)':    '繩索飛鳥（高到低）',
    'Overhead Barbell Press':       '槓鈴肩推',
    'Dumbbell Shoulder Press':      '啞鈴肩推',
    'Arnold Press':                 '阿諾推',
    'Close-Grip Bench Press':       '窄握臥推',
    'Weighted Dips':                '負重雙槓撐',
    'Dips':                         '雙槓撐',
    'Push Up':                      '伏地挺身',
    'Push Ups':                     '伏地挺身',
    'Push Press':                   '借力推',

    // ── 拉 Pull ────────────────────────────────────────────────────
    'Pull Ups':                     '引體向上',
    'Pull-ups':                     '引體向上',
    'Pull-ups (BW or Assisted)':    '引體向上（輔助）',
    'Weighted Pull-ups':            '負重引體向上',
    'Wide Grip Pull-ups':           '寬握引體向上',
    'Chin Ups':                     '反握引體向上',
    'Assisted Pull-up Machine':     '輔助引體向上機',
    'Barbell Rows':                 '槓鈴划船',
    'Bent Over Barbell Row':        '俯身槓鈴划船',
    'Barbell Bent Over Row':        '俯身槓鈴划船',
    'Barbell Bent-Over Row':        '俯身槓鈴划船',
    'Pendlay Row':                  '彭德雷划船',
    'One-Arm Dumbbell Row':         '單臂啞鈴划船',
    'Dumbbell Row':                 '啞鈴划船',
    'Single Arm Cable Row':         '單臂繩索划船',
    'Cable Row':                    '繩索划船',
    'Lat Pulldown':                 '滑輪下拉',
    'Lat Pulldown (Machine)':       '滑輪下拉機',
    'Machine Row':                  '機械划船',
    'Seated Row Machine':           '坐姿划船機',
    'Cable Straight-Arm Pulldown':  '繩索直臂下拉',
    'Cable Face Pulls':             '繩索臉拉',
    'Face Pull':                    '繩索臉拉',

    // ── 肩部 ────────────────────────────────────────────────────────
    'Seated Dumbbell Shoulder Press':'坐姿啞鈴肩推',
    'Dumbbell Lateral Raises':      '啞鈴側平舉',
    'Lateral Raise':                '側平舉',
    'Cable Lateral Raises':         '繩索側平舉',
    'Lateral Raise Machine':        '側平舉機',
    'Bent-Over Reverse Fly':        '俯身反向飛鳥',
    'Reverse Fly':                  '反向飛鳥',
    'Cable Upright Rows':           '繩索直立划船',
    'Upright Row':                  '直立划船',
    'Front Raise':                  '前平舉',
    'Dumbbell Front Raise':         '啞鈴前平舉',

    // ── 二頭 ────────────────────────────────────────────────────────
    'Barbell Bicep Curls':          '槓鈴彎舉',
    'Bicep Curls':                  '彎舉',
    'Bicep Curl':                   '彎舉',
    'Dumbbell Bicep Curls':         '啞鈴彎舉',
    'Cable Bicep Curls':            '繩索彎舉',
    'EZ Bar Curls':                 'EZ槓彎舉',
    'Dumbbell Hammer Curls':        '啞鈴錘式彎舉',
    'Hammer Curl':                  '錘式彎舉',
    'Hammer Curls':                 '錘式彎舉',
    'Concentration Curls':          '集中彎舉',

    // ── 三頭 ────────────────────────────────────────────────────────
    'Triceps Cable Pushdown':       '繩索三頭下壓',
    'Skull Crushers':               '躺姿三頭伸展',
    'Overhead Triceps Extension':   '過頂三頭伸展',
    'Triceps Pushdown':             '三頭下壓',
    'Triceps Dips':                 '三頭撐',

    // ── 核心 ────────────────────────────────────────────────────────
    'Plank':                        '棒式',
    'Hanging Leg Raises':           '懸掛抬腿',
    'Leg Raise':                    '抬腿',
    'Russian Twists (Weighted)':    '俄羅斯轉體',
    'Cable Woodchoppers':           '繩索砍木',
    'Ab Rollout':                   '滾輪捲腹',
    'Dead Bug':                     '死蟲式',
    'Cable Pallof Press':           '繩索帕洛夫推',
    'Crunch':                       '捲腹',
    'Crunches':                     '捲腹',
    'Sit Up':                       '仰臥起坐',
    'Sit Ups':                      '仰臥起坐',
    'Mountain Climber':             '登山者',
    'Mountain Climbers':            '登山者',

    // ── 臀部 ────────────────────────────────────────────────────────
    'Glute Bridge':                 '臀橋',
    'Glute Bridges':                '臀橋',
    'Clamshell':                    '蚌殼式',
    'Cable Hip Abduction':          '繩索髖外展',
    'Hip Abduction Machine':        '髖外展機',

    // ── 背部 ────────────────────────────────────────────────────────
    'Hyperextension':               '背伸展',
    'Back Extension':               '背伸展',
    'Shrug':                        '聳肩',
    'Barbell Shrug':                '槓鈴聳肩',
    'Dumbbell Shrug':               '啞鈴聳肩',

    // ── 有氧 ────────────────────────────────────────────────────────
    'Burpee':                       '波比跳',
    'Burpees':                      '波比跳',
    'Jump Rope':                    '跳繩',
    'Box Jump':                     '跳箱',
    'Box Jumps':                    '跳箱',
    'Jumping Jack':                 '開合跳',
    'Farmers Walk':                 '農夫走路',
    'Farmers Carry':                '農夫攜重',
    'Battle Ropes':                 '戰繩',
    'Kettlebell Swing':             '壺鈴擺盪',
    'Kettlebell Swings':            '壺鈴擺盪',
    'Sled Push':                    '推雪橇',
    'Sled Pull':                    '拉雪橇',

    // ── 下底線格式（exerciseDB API 回傳名）─────────────────────────
    // 腿部
    'Barbell_Squat':                '槓鈴深蹲',
    'Barbell_Hack_Squat':           '槓鈴黑克深蹲',
    'Front_Barbell_Squat':          '槓鈴前蹲',
    'Dumbbell_Bulgarian_Split_Squat':'啞鈴保加利亞分腿蹲',
    'Dumbbell_Goblet_Squat':        '啞鈴高腳杯深蹲',
    'Dumbbell_Walking_Lunge':       '啞鈴行進弓箭步',
    'Smith_Machine_Squat':          '史密斯深蹲',
    'Pistol_Squat':                 '單腳深蹲',
    'Split Squat':                  '分腿蹲',
    'Leg_Press':                    '腿推',
    'Leg_Extensions':               '腿伸展',
    'Lying_Leg_Curls':              '俯臥腿彎舉',
    'Barbell_Hip_Thrust':           '槓鈴臀推',
    'Calf_Raises':                  '提踵',
    'Seated_Calf_Raise':            '坐姿提踵',
    'Romanian_Deadlift':            '羅馬尼亞硬舉',
    'Sumo_Deadlift':                '相撲硬舉',
    'Barbell_Deadlift':             '槓鈴硬舉',

    // 推
    'Barbell_Bench_Press_-_Medium_Grip': '槓鈴臥推（中握距）',
    'Dumbbell_Bench_Press':         '啞鈴臥推',
    'Dumbbell_Incline_Bench_Press': '上斜啞鈴臥推',
    'Decline_Barbell_Bench_Press':  '下斜槓鈴臥推',
    'Close-Grip_Barbell_Bench_Press':'窄握槓鈴臥推',
    'Lever_Chest_Press_(Plate-Loaded)': '槓片式胸推機',
    'Lever_Incline_Chest_Press':    '上斜胸推機',
    'Bench Press':                  '臥推',
    'Chest Press':                  '胸推',
    'Shoulder Press':               '肩推',
    'Barbell_Shoulder_Press':       '槓鈴肩推',
    'Dumbbell_Shoulder_Press':      '啞鈴肩推',
    'Arnold_Dumbbell_Press':        '阿諾啞鈴推',
    'Barbell_Push_Press':           '槓鈴借力推',
    'Weighted_Dips':                '負重雙槓撐',
    'Cable_Crossover':              '繩索交叉',
    'Low_Cable_Crossover':          '低位繩索交叉',

    // 拉
    'Bent_Over_Barbell_Row':        '俯身槓鈴划船',
    'Barbell_Curl':                 '槓鈴彎舉',
    'One_Arm_Dumbbell_Row':         '單臂啞鈴划船',
    'T-Bar_Row_with_Handle':        'T型槓划船',
    'Wide-Grip_Lat_Pulldown':       '寬握滑輪下拉',
    'Seated_Cable_Rows':            '坐姿繩索划船',
    'Straight-Arm_Pulldown':        '直臂下拉',
    'Assisted_Pullup':              '輔助引體向上',
    'Pull Up':                      '引體向上',
    'Pullup':                       '引體向上',
    'Pulldown':                     '下拉',
    'Lever_Seated_Row':             '槓桿坐姿划船',
    'Face_Pull':                    '繩索臉拉',

    // 肩部
    'Lever_Lateral_Raise':          '機械側平舉',
    'Lever_Reverse_Fly':            '機械反向飛鳥',
    'Cable_Seated_Lateral_Raise':   '坐姿繩索側平舉',
    'Side_Lateral_Raise':           '側平舉',
    'Reverse_Flyes':                '反向飛鳥',
    'Upright_Row_-_With_Bands':     '彈力帶直立划船',
    'Cable_Hip_Extension':          '繩索髖伸展',

    // 二頭
    'Barbell_Preacher_Curl':        '槓鈴牧師椅彎舉',
    'Dumbbell_Alternate_Bicep_Curl':'啞鈴交替彎舉',
    'Alternate_Hammer_Curl':        '交替錘式彎舉',
    'EZ-Bar_Curl':                  'EZ槓彎舉',
    'Concentration_Curls':          '集中彎舉',
    'Standing_Biceps_Cable_Curl':   '站姿繩索彎舉',

    // 三頭
    'Barbell_Skullcrusher':         '槓鈴躺姿三頭伸展',
    'Triceps Extension':            '三頭伸展',
    'Triceps_Pushdown':             '三頭下壓',
    'Seated_Triceps_Press':         '坐姿三頭推舉',

    // 核心
    'Dead_Bug':                     '死蟲式',
    'Ab_Roller':                    '滾輪捲腹',
    'Russian_Twist':                '俄羅斯轉體',
    'Hanging_Leg_Raise':            '懸掛抬腿',
    'Standing_Cable_Wood_Chop':     '站姿繩索砍木',
    'Pallof_Press_With_Band':       '彈力帶帕洛夫推',

    // ── UnifiedTrainingEngine 主訓練動作 ─────────────────────────
    // 胸部
    'Dumbbell Bench Press':         '啞鈴臥推',
    'Incline Barbell Press':        '上斜槓鈴推',
    'Decline Bench Press':          '下斜臥推',
    'Chest Dips':                   '胸部雙槓撐',
    'Pec Deck Fly':                 '夾胸機飛鳥',
    'Dumbbell Fly':                 '啞鈴飛鳥',
    'Low Cable Fly':                '低位繩索飛鳥',
    'Seated Cable Fly':             '坐姿繩索飛鳥',
    'Cable Crunch':                 '繩索捲腹',
    'Band Chest Press':             '彈力帶胸推',

    // 肩部
    'Barbell Overhead Press':       '槓鈴肩推',
    'Machine Shoulder Press':       '機械肩推',
    'Dumbbell Overhead Press':      '啞鈴肩推',
    'Reverse Cable Crossover':      '反向繩索交叉',
    'Reverse Pec Deck':             '反向夾胸機',
    'Face Pulls':                   '繩索臉拉',
    'Band Face Pull':               '彈力帶臉拉',
    'Band Lateral Raise':           '彈力帶側平舉',
    'Cable Lateral Raise':          '繩索側平舉',
    'Dumbbell Lateral Raise':       '啞鈴側平舉',
    'External Rotation':            '外旋轉',

    // 背部
    'Barbell Row':                  '槓鈴划船',
    'Chest Supported Row':          '俯臥支撐划船',
    'Wide Grip Lat Pulldown':       '寬握滑輪下拉',
    'Neutral Grip Lat Pulldown':    '對握下拉',
    'Seated Cable Row':             '坐姿繩索划船',
    'Single Arm Dumbbell Row':      '單臂啞鈴划船',
    'Meadows Row':                  'Meadows 划船',
    'T-Bar Row':                    'T型槓划船',
    'Straight Arm Pulldown':        '直臂下拉',
    'Cable Lat Pullover':           '繩索直臂下拉',
    'Hyperextensions':              '背伸展',
    'Band Row':                     '彈力帶划船',
    'Superman Hold':                '超人式撐',
    'Bird Dog':                     '鳥狗式',

    // 三頭
    'Close Grip Bench Press':       '窄握臥推',
    'Overhead Cable Extension':     '過頭繩索三頭伸展',
    'Tricep Dips':                  '三頭雙槓撐',
    'Diamond Push Ups':             '鑽石伏地挺身',
    'Tricep Pushdown':              '三頭下壓',
    'Rope Pushdown':                '繩索下壓',
    'Overhead Tricep Extension':    '過頭三頭伸展',
    'Band Tricep Extension':        '彈力帶三頭伸展',

    // 二頭
    'Barbell Bicep Curl':           '槓鈴彎舉',
    'EZ Bar Curl':                  'EZ槓彎舉',
    'Dumbbell Bicep Curl':          '啞鈴彎舉',
    'Preacher Curls':               '牧師椅彎舉',
    'Incline Dumbbell Curl':        '上斜啞鈴彎舉',
    'Concentration Curl':           '集中彎舉',
    'Cable Curl':                   '繩索彎舉',
    'Band Bicep Curl':              '彈力帶彎舉',

    // 腿部
    'Barbell Back Squat':           '槓鈴後蹲',
    'Barbell Front Squat':          '槓鈴前蹲',
    'Hack Squat':                   '黑克深蹲',
    'Bodyweight Squat':             '徒手深蹲',
    'Romanian Deadlift':            '羅馬尼亞硬舉',
    'Dumbbell Romanian Deadlift':   '啞鈴羅馬尼亞硬舉',
    'Good Morning':                 '早安式體前屈',
    'Seated Leg Curl':              '坐姿腿後勾',

    // 臀部
    'Hip Thrusts':                  '臀推',
    'Single Leg Hip Thrust':        '單腳臀推',
    'Step Ups':                     '上台階',
    '45° Back Extension':           '45度背伸展',
    'Cable Pull Through':           '繩索臀推',
    'Machine Hip Abduction':        '機械髖外展',
    'Cable Kickback':               '繩索臀踢',
    'Band Kickback':                '彈力帶臀踢',
    'Clamshells':                   '蚌殼式',
    'Quadruped Hip Extension':      '四足跪姿髖伸展',
    'Calf Raises':                  '提踵',
    'Seated Calf Raises':           '坐姿提踵',

    // 核心
    'Ab Wheel Rollout':             '滾輪捲腹',
    'Hanging Leg Raise':            '懸掛抬腿',
    'V-Up':                         'V字起坐',
    'Russian Twists':               '俄羅斯轉體',
    'Bicycle Crunches':             '腳踏車捲腹',
    'Leg Raises':                   '抬腿',
    'Side Plank':                   '側棒式',

    // ── UnifiedTrainingEngine 暖身動作 ───────────────────────────
    'Arm Circles':                  '手臂繞環',
    'Wall Slides':                  '靠牆滑臂',
    'Scapular Push Up':             '肩胛伏地挺身',
    'Shoulder Dislocates':          '肩關節繞環',
    'Band Pull Apart':              '彈力帶開胸',
    'Dead Hang':                    '懸吊放鬆',
    'Thoracic Rotation':            '胸椎旋轉',
    'Cat Cow':                      '貓牛式',
    'Hip Flexor Stretch':           '髖屈肌伸展',
    'Glute Bridge (warm-up)':       '臀橋（暖身）',
    'Leg Swing':                    '腿部擺盪',
    "World's Greatest Stretch":     '世界最佳伸展',
    'Fire Hydrants':                '消防栓式',
    'Ankle Circles':                '踝關節繞環',
    'Inchworm':                     '毛毛蟲爬',
    'High Knees':                   '高抬腿',
    'Mountain Climbers (slow)':     '登山者（慢速）',
    'Jumping Jacks':                '開合跳',

    // ── 收操動作 ─────────────────────────────────────────────────
    'Ankle Mobility Drill':         '踝關節活動操',
    'Pigeon Pose':                  '鴿式伸展',
    'Glute Bridge Hold':            '臀橋保持',
};

/**
 * 取得動作的中文名稱，若無對應則回傳原英文名稱
 * @param {string} name - 動作英文名稱
 * @returns {string} - 中文名稱或原名
 */
export const getExerciseNameZh = (name) => {
    if (!name) return name;
    // 若已是中文（包含中文字符）直接回傳
    if (/[一-鿿]/.test(name)) return name;
    return EXERCISE_NAME_ZH[name] || name;
};
