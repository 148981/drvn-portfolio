// ════════════════════════════════════════════════════════════════════════
//  leanLightPlanData.js — 課程 02｜輕量套裝：燃脂輕跑（LEAN LIGHT）
//
//  設計文件：課程改版_設計文件/02-輕量套裝_燃脂輕跑.md
//  ─ 健身 × 跑步 混合｜6 週｜低門檻、低器材、時間短
//  ─ 跑步是主軸（帶走熱量），輕量重訓是配角（保住肌肉，讓體重掉下去之後身形好看）
//  ─ 減脂期的重訓目的是「保肌」不是「增肌」：維持強度、降低容量，不拚組數
//  ─ 每次時長是硬約束也是賣點：新手 ≤30 分、中階 ≤40 分、精熟 ≤50 分
//
//  ⚠ 跑步端：weeks[].runPlan 為本課程的跑步處方（subtype／距離／配速偏移／RPE）。
//    目前 cardioPlanFusionEngine 尚未讀取這個欄位 —— 現行 UI 會安全忽略它，
//    重訓照常運作。串接方式見設計文件第八節。
// ════════════════════════════════════════════════════════════════════════

const E = (name, nameEn, target, tier) => (s, r, rest, note) => ({
    name, nameEn, target, tier, sets: s, reps: r, rest, ...(note ? { note } : {}),
});

const GOBLET     = E('高腳杯深蹲', 'Goblet Squat', '股四頭、臀', 2);
const BB_SQUAT   = E('槓鈴深蹲', 'Barbell Squat', '股四頭、臀、核心', 1);
const RDL        = E('羅馬尼亞硬舉', 'Romanian Deadlift', '腿後、臀', 1);
const LEG_PRESS  = E('腿推', 'Leg Press', '股四頭、臀', 2);
const LEG_CURL   = E('腿彎舉', 'Lying Leg Curls', '腿後肌群', 3);
const INC_PUSHUP = E('上斜伏地挺身', 'Incline Push-Up', '胸大肌', 3);
const DB_BENCH   = E('啞鈴臥推', 'Dumbbell Bench Press', '胸、前束', 2);
const BB_BENCH   = E('槓鈴臥推', 'Barbell Bench Press - Medium Grip', '胸、前束、三頭', 1);
const INC_DB     = E('上斜啞鈴推舉', 'Incline Dumbbell Press', '胸上部、前束', 2);
const CAB_FLY    = E('繩索夾胸', 'Cable Crossover', '胸大肌', 3);
const DB_OHP     = E('啞鈴肩推', 'Dumbbell Overhead Press', '三角肌前束、中束', 2);
const DB_LAT     = E('啞鈴側平舉', 'Side Lateral Raise', '三角肌中束', 3);
const DB_ROW     = E('單臂啞鈴划船', 'One-Arm Dumbbell Row', '背闊肌', 2);
const BAND_ROW   = E('Band Row', 'Band Row', '背闊肌、上背', 3);
const SEATED_ROW = E('坐姿划船', 'Seated Cable Rows', '背闊肌、上背', 2);
const LAT_PULL   = E('下拉', 'Wide-Grip Lat Pulldown', '背闊肌', 2);
const FACE_PULL  = E('繩索面拉', 'Face Pull', '三角肌後束、中下斜方', 3);
const PUSHDOWN   = E('三頭肌下壓', 'Triceps Pushdown', '肱三頭肌', 3);
const EZ_CURL    = E('EZ Bar 彎舉', 'EZ-Bar Curl', '肱二頭肌', 3);
const PLANK      = E('Plank', 'Plank', '核心抗伸展', 3);
const DEADBUG    = E('死蟲式', 'Dead Bug', '核心抗伸展', 3);
const SIDE_BR    = E('側棒式', 'Side Bridge', '側鏈穩定', 3);
const CABLE_CR   = E('繩索捲腹', 'Cable Crunch', '腹直肌', 3);

/* ── 跑步處方 ─────────────────────────────────────────────────
   pace 為相對 5K baseline 的秒/km 偏移：
   recovery +90｜easy +60｜long +45｜tempo −15｜interval −40         */
const R = (subtype, km, note) => ({
    subtype, distance_km: km, pace_offset_sec: { recovery: 90, easy: 60, long: 45, tempo: -15, interval: -40 }[subtype],
    rpe: { recovery: '2–3', easy: '3–4', long: '4–5', tempo: '6–7', interval: '8–9' }[subtype],
    ...(note ? { note } : {}),
});

const RUN_BEGINNER = [
    { week: 1, total_km: 8.0,  bricks: [R('recovery', 2.0, '走跑交替：跑 2 分／走 1 分 × 6 輪'), R('easy', 3.0, '走跑交替：跑 3 分／走 1 分'), R('easy', 3.0, '走跑交替：跑 3 分／走 1 分')] },
    { week: 2, total_km: 8.8,  bricks: [R('recovery', 2.5, '走跑交替：跑 4 分／走 1 分'), R('easy', 3.0, '走跑交替：跑 5 分／走 1 分'), R('easy', 3.3, '本週最後一次走跑交替')] },
    { week: 3, total_km: 9.6,  bricks: [R('easy', 3.0, '開始嘗試連續跑，撐不住就走 30 秒再跑'), R('easy', 3.2), R('long', 3.4, '本課第一次長跑')] },
    { week: 4, total_km: 10.5, bricks: [R('easy', 3.0), R('tempo', 3.0, '節奏跑：講得出短句但講不了長句的速度'), R('long', 4.5)] },
    { week: 5, total_km: 11.5, bricks: [R('easy', 3.5), R('tempo', 3.0), R('long', 5.0, '全課最長一次')] },
    { week: 6, total_km: 7.0,  bricks: [R('recovery', 2.0), R('easy', 2.0), R('easy', 3.0, '驗收：連續跑 20 分鐘不走')] },
];

const RUN_INTER = [
    { week: 1, total_km: 18.0, bricks: [R('recovery', 3.0), R('easy', 5.0), R('tempo', 4.0), R('long', 6.0)] },
    { week: 2, total_km: 19.8, bricks: [R('recovery', 3.0), R('easy', 5.5), R('tempo', 4.3), R('long', 7.0)] },
    { week: 3, total_km: 21.7, bricks: [R('recovery', 3.5), R('easy', 6.0), R('tempo', 4.5), R('long', 7.7)] },
    { week: 4, total_km: 23.8, bricks: [R('recovery', 3.5), R('easy', 6.5), R('interval', 5.0, '間歇：400m × 8，趟間慢跑 200m'), R('long', 8.8)] },
    { week: 5, total_km: 24.0, bricks: [R('recovery', 3.5), R('easy', 6.5), R('tempo', 5.0), R('long', 9.0)] },
    { week: 6, total_km: 14.4, bricks: [R('recovery', 3.0), R('easy', 4.0), R('tempo', 2.4, '驗收：5K 計時'), R('long', 5.0)] },
];

const RUN_ADV = [
    { week: 1, total_km: 30.0, bricks: [R('recovery', 5.0), R('easy', 8.0), R('tempo', 7.0), R('long', 10.0)] },
    { week: 2, total_km: 33.0, bricks: [R('recovery', 5.0), R('easy', 9.0), R('tempo', 7.0), R('long', 12.0)] },
    { week: 3, total_km: 36.3, bricks: [R('recovery', 5.0), R('easy', 9.5), R('interval', 8.0, '間歇：1000m × 5，趟間慢跑 400m'), R('long', 13.8)] },
    { week: 4, total_km: 39.9, bricks: [R('recovery', 5.5), R('easy', 10.0), R('tempo', 8.4), R('long', 16.0, '全課最長一次')] },
    { week: 5, total_km: 33.9, bricks: [R('recovery', 5.0), R('easy', 9.0), R('interval', 8.0), R('long', 11.9, '開始收量')] },
    { week: 6, total_km: 20.0, bricks: [R('recovery', 4.0), R('easy', 5.0), R('tempo', 5.0, '驗收：5K 計時'), R('long', 6.0)] },
];

/* ── 六週進程（重訓端）───────────────────────────────────────── */
const PROG = (level) => {
    const names = ['技術建立期', '技術建立期', '容量累積期', '強度突破期', '強度突破期', '減量與驗收'];
    const rpes  = ['RPE 6', 'RPE 6–7', 'RPE 7–8', 'RPE 8', 'RPE 8', 'RPE 5–6'];
    const scales = level === 'beginner' ? ['minus1', 'minus1', 1, 1, 1, 'two'] : [0.75, 0.75, 1, 1, 1, 'two'];
    const reps = { beginner: [15, 15, 13, 11, 11, 13], inter: [15, 15, 12, 10, 10, 12], advanced: [12, 12, 11, 9, 9, 11] }[level];
    return names.map((n, i) => ({ w: i + 1, name: n, rpe: rpes[i], scale: scales[i], reps: reps[i] }));
};

const S = (base, p) => {
    if (p.scale === 'two') return 2;
    if (p.scale === 'minus1') return Math.max(2, base - 1);
    if (typeof p.scale === 'number') return Math.max(2, Math.round(base * p.scale));
    return base;
};

const KEEP_MUSCLE = '減脂期的重訓是為了「保住肌肉」，不是為了長肌肉。維持強度、不要為了流汗而加組數';

/* ── 訓練日模板 ───────────────────────────────────────────────── */
const beginnerDays = (p) => ([
    {
        dayNumber: 1, focus: 'A｜全身輕量 · 蹲 ＋ 推 ＋ 拉', time: 26, intensity: p.rpe,
        exercises: [
            GOBLET(S(3, p), p.reps, 60, '站距略寬於肩、腳尖外開；蹲到大腿低於水平'),
            INC_PUSHUP(S(3, p), p.reps - 3, 60, '身體打直不塌腰；太輕就把手撐低一點'),
            DB_ROW(S(3, p), p.reps - 3, 60, '每邊。拉到肋骨，肩胛先動手臂再動'),
            PLANK(S(3, p), 30, 45, '單位為秒'),
        ],
    },
    {
        dayNumber: 2, focus: 'B｜全身輕量 · 鉸鏈 ＋ 推 ＋ 拉', time: 26, intensity: p.rpe,
        exercises: [
            RDL(S(3, p), p.reps, 60, '髖往後推不是腰往下彎；感覺在腿後不在下背'),
            DB_OHP(S(3, p), p.reps - 3, 60, '肋骨往下收，不要用腰反弓借力'),
            BAND_ROW(S(3, p), p.reps, 60),
            DEADBUG(S(3, p), 10, 45, '每邊 10 下'),
        ],
    },
]);

const interDays = (p) => ([
    {
        dayNumber: 1, focus: 'A｜全身 · 下肢主導', time: 38, intensity: p.rpe,
        exercises: [
            GOBLET(S(4, p), p.reps - 3, 75, KEEP_MUSCLE),
            DB_BENCH(S(3, p), p.reps - 3, 75),
            SEATED_ROW(S(3, p), p.reps - 3, 75),
            DB_LAT(S(3, p), p.reps, 60, '手腕不要高於手肘'),
            PLANK(S(3, p), 40, 45, '單位為秒'),
        ],
    },
    {
        dayNumber: 2, focus: 'B｜全身 · 後鏈主導', time: 38, intensity: p.rpe,
        exercises: [
            RDL(S(4, p), p.reps - 5, 90, '髖往後推不是腰往下彎'),
            LAT_PULL(S(3, p), p.reps - 3, 75),
            INC_DB(S(3, p), p.reps - 3, 75),
            LEG_CURL(S(3, p), p.reps, 60),
            SIDE_BR(S(3, p), 35, 45, '每邊 35 秒'),
        ],
    },
]);

const advDays = (p) => ([
    {
        dayNumber: 1, focus: 'A｜下肢 · 保肌優先', time: 46, intensity: p.rpe,
        exercises: [
            BB_SQUAT(S(4, p), p.reps, 120, KEEP_MUSCLE),
            RDL(S(3, p), p.reps, 120),
            LEG_PRESS(S(3, p), p.reps + 4, 90),
            LEG_CURL(S(3, p), p.reps + 4, 60),
            CABLE_CR(S(3, p), 15, 60),
        ],
    },
    {
        dayNumber: 2, focus: 'B｜上肢推 · 保肌優先', time: 46, intensity: p.rpe,
        exercises: [
            BB_BENCH(S(4, p), p.reps, 120),
            DB_OHP(S(3, p), p.reps + 2, 90),
            CAB_FLY(S(3, p), p.reps + 4, 60),
            PUSHDOWN(S(3, p), p.reps + 4, 60),
            SIDE_BR(S(3, p), 45, 45, '每邊 45 秒'),
        ],
    },
    {
        dayNumber: 3, focus: 'C｜上肢拉 · 保肌優先', time: 44, intensity: p.rpe,
        exercises: [
            LAT_PULL(S(4, p), p.reps + 2, 90),
            SEATED_ROW(S(3, p), p.reps + 2, 90),
            FACE_PULL(S(3, p), p.reps + 6, 60, '拉到眉毛高度，手肘高於手腕'),
            EZ_CURL(S(3, p), p.reps + 4, 60),
            DEADBUG(S(3, p), 12, 45, '每邊 12 下'),
        ],
    },
]);

const DELOAD_NOTE = '減量與驗收週：重訓每動作 2 組、跑量降 40%。這週的重點是把疲勞卸掉，讓最後的驗收數字是真的';

/** 依「每週練幾天」自動配到不相鄰的日曆日（3 天→一三五；4 天→一二四五），
 *  讓同肌群間隔 48–72 小時這件事在資料層就看得出來，而不是只寫在說明文字裡。 */
const WEEK_SCHEDULE = { 1: [1], 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 5, 6] };
const withCalendarDays = (days, weekName = '') => {
    const sched = WEEK_SCHEDULE[days.length] || days.map((_, i) => i + 1);
    // 驗收週：RM 測試需要 2.5–3.5 分鐘組間休息，那是正確的實務，不是超標。
    // 這個旗標之後也可以拿來驅動「今天要測、需要保護者」的強制提示卡。
    const isTest = /驗收/.test(weekName);
    return days.map((d, i) => ({ ...d, calendarDay: sched[i], ...(isTest ? { isTest: true } : {}) }));
};

const buildWeeks = (prog, dayFn, runPlan) => prog.map((p, i) => ({
    weekNumber: p.w,
    name: `${p.name}（週跑量 ${runPlan[i].total_km} km）`,
    runPlan: runPlan[i].bricks,
    weekMileageKm: runPlan[i].total_km,
    days: withCalendarDays(dayFn(p), p.name).map(d => ({
        ...d,
        weekPhase: p.name,
        ...(p.w === 6 ? { note: DELOAD_NOTE } : {}),
    })),
}));

/* ═══════════════════════════════════════════════════════════════ */
export const LEAN_LIGHT_PLAN = {
    id: 'lean-light-42',
    name: '減脂：跑步＋輕重訓',
    subtitle: '跑步減脂，重訓保住線條',
    bodyPart: 'hybrid_fatloss',
    bodyPartLabel: '燃脂 · 跑步 × 輕量重訓',
    duration: 42,
    coverImage: '/desktop/Gemini_Generated_Image_i9cnrki9cnrki9cn.png',
    description: '跑步負責減脂，輕量重訓負責保住肌肉，讓體重掉下去之後身形還是好看的。一對啞鈴、一張椅子、一雙跑鞋就能開始，新手每次不超過三十分鐘。',
    tags: ['跑步＋重訓', '器材很少', '每次 30 分鐘', '適合新手'],
    isCourse: true,
    courseSystem: 'hybrid',
    hybridNote: '本課程的跑步處方寫在 weeks[].runPlan。串接 cardio 系統前，跑步端請依 runPlan 手動排入或由 cardioPlanFusionEngine 讀取（見設計文件第八節缺口清單）。',

    levels: {
        beginner: {
            key: 'beginner',
            label: '新手',
            labelEn: 'Beginner',
            recommendedDays: 5,
            recommendedDaysLabel: '每週 5 天：重訓 2 次 ＋ 跑步 3 次（2 天全休）',
            durationPerSession: '18-30',
            equipment: ['可調啞鈴', '穩固椅子', '彈力帶', '跑鞋'],
            targetArea: '全身輕量保肌 ＋ 有氧基礎',
            intensity: '低（重訓 RPE 6–8｜跑步 RPE 2–5）',
            expectedGain: '體重下降 3–5%、腰圍 −3~−6 cm、瘦體重維持 ±1%、從走跑交替到連續跑 20 分鐘',
            benefits: [
                '每次 30 分鐘以內，一對啞鈴＋一張椅子＋一雙跑鞋就能完成',
                '前兩週用走跑交替入門，第三週才要求連續跑',
                '六週總跑量 55.4 km，單週增幅全部 ≤10%',
            ],
            periodization: {
                phase1: { name: '走跑入門', weeks: '第 1–2 週', focus: '跑 2–5 分／走 1 分；重訓學動作', reps: '15 次', intensity: 'RPE 6' },
                phase2: { name: '容量累積', weeks: '第 3 週', focus: '開始連續跑，第一次長跑', reps: '13 次', intensity: 'RPE 7–8' },
                phase3: { name: '強度突破', weeks: '第 4–5 週', focus: '加入節奏跑；重訓次數降、重量升', reps: '11 次', intensity: 'RPE 8' },
                phase4: { name: '減量與驗收', weeks: '第 6 週', focus: '跑量降 40%；驗收連續跑 20 分鐘、量腰圍體重', reps: '13 次', intensity: 'RPE 5–6' },
            },
            nutritionNote: '這門課的成果有 60–70% 來自吃。三件事就好：液體熱量歸零、每餐一個手掌大的蛋白質、澱粉只在訓練日多給。目標是每天比平常少 300–500 大卡，不需要算到個位數。',
            weeks: buildWeeks(PROG('beginner'), beginnerDays, RUN_BEGINNER),
        },

        intermediate: {
            key: 'intermediate',
            label: '中階',
            labelEn: 'Intermediate',
            recommendedDays: 6,
            recommendedDaysLabel: '每週 6 天：重訓 2 次 ＋ 跑步 4 次（1 天全休）',
            durationPerSession: '21-40',
            equipment: ['健身房全器材', '跑鞋'],
            targetArea: '全身保肌 ＋ 有氧容量',
            intensity: '中等（重訓 RPE 6–8｜跑步 RPE 2–7）',
            expectedGain: '體重下降 3–5%、腰圍 −3~−6 cm、5K 進步 2–4%',
            benefits: [
                '每次 40 分鐘以內，重訓與跑步都排得進上班日',
                '六週總跑量 121.7 km，每週 quality run 不超過 2 次',
                '高離心動作與長跑分日排，隔天不會拖著兩條腿去跑',
            ],
            periodization: {
                phase1: { name: '技術建立', weeks: '第 1–2 週', focus: '建立 80/20 節奏，重訓重量保守', reps: '15 次', intensity: 'RPE 6–7' },
                phase2: { name: '容量累積', weeks: '第 3 週', focus: '跑量堆到 21.7 km', reps: '12 次', intensity: 'RPE 7–8' },
                phase3: { name: '強度突破', weeks: '第 4–5 週', focus: '加入間歇；重訓進入 10 次區間', reps: '10 次', intensity: 'RPE 8' },
                phase4: { name: '減量與驗收', weeks: '第 6 週', focus: '跑量降 40%；驗收 5K 計時、量腰圍體重', reps: '12 次', intensity: 'RPE 5–6' },
            },
            nutritionNote: '赤字每天 300–500 大卡，蛋白質每公斤體重 1.6–2.2 公克。訓練後兩小時內補蛋白質＋碳水 — 這不是加餐，是把當天的額度挪過來。',
            weeks: buildWeeks(PROG('inter'), interDays, RUN_INTER),
        },

        advanced: {
            key: 'advanced',
            label: '精熟',
            labelEn: 'Advanced',
            recommendedDays: 6,
            recommendedDaysLabel: '每週 6 天 7 場：重訓 3 次 ＋ 跑步 4 次，其中一天練兩場',
            durationPerSession: '22-50',
            equipment: ['健身房全器材', '跑鞋'],
            targetArea: '全身保肌 ＋ 有氧容量',
            intensity: '中等至高（重訓 RPE 6–8｜跑步 RPE 2–9）',
            expectedGain: '體重下降 3–5%、腰圍 −3~−6 cm；5K 僅承諾 0–2% — 赤字期的主要收穫是「不退步」',
            benefits: [
                '六週總跑量 193 km，第 5 週起主動收量避免赤字期過載',
                '重訓拆成下肢／上肢推／上肢拉，單次容量低但頻率夠',
                '對精熟者誠實：熱量赤字下跑步表現很難進步，守住就是成功',
            ],
            periodization: {
                phase1: { name: '技術建立', weeks: '第 1–2 週', focus: '30–33 km 建立基礎，重訓組數壓 75%', reps: '12 次', intensity: 'RPE 7' },
                phase2: { name: '容量累積', weeks: '第 3 週', focus: '跑量 36.3 km，加入 1000m 間歇', reps: '11 次', intensity: 'RPE 7–8' },
                phase3: { name: '強度突破', weeks: '第 4–5 週', focus: 'W4 峰值 39.9 km（含 16 km 長跑）；W5 起收量', reps: '9 次', intensity: 'RPE 8' },
                phase4: { name: '減量與驗收', weeks: '第 6 週', focus: '跑量降至 20 km；驗收 5K 計時、量腰圍體脂', reps: '11 次', intensity: 'RPE 5–6' },
            },
            nutritionNote: '赤字控制在每天 300–400 大卡就好 — 跑量這麼高的時候赤字再大，掉的會是肌肉與表現。蛋白質拉到每公斤 2.0–2.2 公克。',
            weeks: buildWeeks(PROG('advanced'), advDays, RUN_ADV),
        },
    },
};

export default LEAN_LIGHT_PLAN;
