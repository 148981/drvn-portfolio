// ════════════════════════════════════════════════════════════════════════
//  hyroxPlanData.js — 課程 01｜HYROX 混合體能班（HYBRID ENGINE）
//
//  設計文件：課程改版_設計文件/01-HYROX混合體能班.md
//  ─ 健身 × 跑步 混合｜8 週
//  ─ HYROX 的本質是「8 段 1km 跑 × 8 個負重站交替」，考的是
//    「在心率已經拉高的狀態下還能維持負重動作品質」（compromised running）
//
//  ⚠ 動作庫沒有 HYROX 的專項站（雪橇推／拉、SkiErg、划船機、Wall Ball、
//    Sandbag Lunge、波比跳、壺鈴擺盪）。本課程用既有動作做等效替代，
//    對使用者的說法必須誠實：這一期練的是「底子」，不是專項站技術。
//    替代對照見 STATION_MAP。
//
//  ⚠ 循環日（compromised running）目前無法用 days[].exercises 完整表達 —
//    跑段寫在 day.note，資料層仍存成一般 strength 日，以繞開 dailyAgenda
//    「dual 日只能配輕鬆跑」的限制。完整解法需要 days[].segments[]（缺口 #2）。
//
//  ⚠ 跑步端：weeks[].runPlan 為獨立跑步處方，現行 UI 會安全忽略。
// ════════════════════════════════════════════════════════════════════════

const E = (name, nameEn, target, tier) => (s, r, rest, note) => ({
    name, nameEn, target, tier, sets: s, reps: r, rest, ...(note ? { note } : {}),
});

const GOBLET     = E('高腳杯深蹲', 'Goblet Squat', '股四頭、臀', 2);
const BB_SQUAT   = E('槓鈴深蹲', 'Barbell Squat', '股四頭、臀、核心', 1);
const RDL        = E('羅馬尼亞硬舉', 'Romanian Deadlift', '腿後、臀', 1);
const DEADLIFT   = E('硬舉', 'Barbell Deadlift', '後鏈全體', 1);
const LEG_PRESS  = E('腿推', 'Leg Press', '股四頭、臀', 2);
const WALK_LUNGE = E('行走弓箭步', 'Walking Lunges', '臀、股四頭', 2);
const STEP_UP    = E('上台階', 'Step Ups', '臀大肌、臀中肌', 2);
const BW_SQUAT   = E('Bodyweight Squat', 'Bodyweight Squat', '股四頭、臀（代謝）', 3);
const FARMER     = E('農夫行走', 'Farmer Walk', '握力、軀幹剛性、單邊穩定', 1);
const PUSHUP     = E('伏地挺身', 'Pushups', '胸、三頭、核心', 3);
const DB_OHP     = E('啞鈴肩推', 'Dumbbell Overhead Press', '三角肌前束', 2);
const BB_OHP     = E('槓鈴肩推', 'Barbell Overhead Press', '三角肌前束、核心', 1);
const SEATED_ROW = E('坐姿划船', 'Seated Cable Rows', '背闊肌、上背', 2);
const BB_ROW     = E('槓鈴划船', 'Bent Over Barbell Row', '背闊肌、上背', 1);
const LAT_PULL   = E('下拉', 'Wide-Grip Lat Pulldown', '背闊肌', 2);
const STRAIGHT   = E('直臂下拉', 'Straight-Arm Pulldown', '背闊肌', 3);
const PULL_THRU  = E('繩索臀推', 'Cable Pull Through', '臀大肌', 3);
const LEG_CURL   = E('腿彎舉', 'Lying Leg Curls', '腿後肌群', 3);
const CALF       = E('站姿提踵', 'Standing Calf Raises', '小腿三頭肌', 3);
const CABLE_CR   = E('繩索捲腹', 'Cable Crunch', '腹直肌', 3);
const DEADBUG    = E('死蟲式', 'Dead Bug', '核心抗伸展', 3);
const SIDE_BR    = E('側棒式', 'Side Bridge', '側鏈穩定', 3);
const PLANK      = E('Plank', 'Plank', '核心抗伸展', 3);
const BAND_ROW   = E('Band Row', 'Band Row', '背闊肌、上背', 3);

/* ── HYROX 專項站 → DRVN 動作庫替代對照（誠實揭露差距）────────── */
export const STATION_MAP = [
    { station: '1000m SkiErg',        sub: '直臂下拉 → 繩索捲腹',        gap: '缺 4 分鐘持續上肢有氧、缺下肢協同' },
    { station: '50m Sled Push',       sub: '腿推（不鎖膝）→ 行走弓箭步', gap: '缺前傾全身剛性與傳力' },
    { station: '50m Sled Pull',       sub: '坐姿划船 → 繩索臀推',        gap: '缺後退步伐與握繩 60–90 秒的握力耐力' },
    { station: '80m Burpee Broad Jump', sub: '伏地挺身 → Bodyweight Squat', gap: '最大缺口：完全無離地爆發與落地衝擊，心率峰值低 5–10 bpm' },
    { station: '1000m Row',           sub: '羅馬尼亞硬舉 → 坐姿划船',    gap: '缺連續 4 分鐘全身有氧；RDL 離心成本高很多' },
    { station: '200m Farmers Carry',  sub: '農夫行走 × 50m',             gap: '唯一一對一對應，無替代損失' },
    { station: '100m Sandbag Lunges', sub: '行走弓箭步 → 高腳杯深蹲',    gap: '負荷位置錯（體側 vs 肩上），豎脊肌需求低很多' },
    { station: '100 Wall Balls',      sub: '高腳杯深蹲 → 啞鈴肩推',      gap: '缺拋擲爆發銜接與接球離心' },
];

/* ── 跑步處方 ───────────────────────────────────────────────── */
const R = (subtype, km, note) => ({
    subtype, distance_km: km,
    pace_offset_sec: { recovery: 90, easy: 60, long: 45, tempo: -15, interval: -40 }[subtype],
    rpe: { recovery: '2–3', easy: '3–4', long: '4–5', tempo: '6–7', interval: '8–9' }[subtype],
    ...(note ? { note } : {}),
});

// 週跑量：W4 與 W8 為減量／驗收週。增幅以「上一個累積週」為基準計算，全部 ≤10%
const RUN = {
    beginner: [
        { total: 12.0, bricks: [R('easy', 4.0), R('easy', 4.0), R('long', 4.0)] },
        { total: 13.2, bricks: [R('easy', 4.0), R('easy', 4.4), R('long', 4.8)] },
        { total: 14.5, bricks: [R('easy', 4.5), R('tempo', 4.0, '第一次節奏跑：講得出短句但講不了長句'), R('long', 6.0)] },
        { total: 9.0,  bricks: [R('recovery', 3.0), R('easy', 3.0), R('easy', 3.0)] },
        { total: 15.9, bricks: [R('easy', 5.0), R('tempo', 4.4), R('long', 6.5)] },
        { total: 17.5, bricks: [R('easy', 5.5), R('tempo', 5.0), R('long', 7.0)] },
        { total: 19.2, bricks: [R('easy', 6.0), R('tempo', 5.2), R('long', 8.0, '目標：連續跑完 5 km 不走')] },
        { total: 11.0, bricks: [R('recovery', 3.0), R('easy', 3.0), R('easy', 5.0, '驗收：1/4 模擬（4×400m ＋ 4 站）')] },
    ],
    inter: [
        { total: 24.0, bricks: [R('recovery', 4.0), R('easy', 6.0), R('tempo', 6.0), R('long', 8.0)] },
        { total: 26.4, bricks: [R('recovery', 4.0), R('easy', 7.0), R('tempo', 6.4), R('long', 9.0)] },
        { total: 29.0, bricks: [R('recovery', 4.5), R('easy', 7.5), R('interval', 7.0, '間歇：1000m × 5，趟間慢跑 400m'), R('long', 10.0)] },
        { total: 17.5, bricks: [R('recovery', 4.0), R('easy', 5.5), R('easy', 8.0)] },
        { total: 31.9, bricks: [R('recovery', 5.0), R('easy', 8.0), R('tempo', 7.4), R('long', 11.5)] },
        { total: 35.0, bricks: [R('recovery', 5.0), R('easy', 8.5), R('interval', 8.0), R('long', 13.5)] },
        { total: 38.5, bricks: [R('recovery', 5.5), R('easy', 9.0), R('tempo', 9.0), R('long', 15.0)] },
        { total: 22.0, bricks: [R('recovery', 4.0), R('easy', 6.0), R('easy', 12.0, '驗收：半場模擬（4×1km ＋ 4 站，計時）')] },
    ],
    advanced: [
        { total: 34.0, bricks: [R('recovery', 5.0), R('easy', 8.0), R('tempo', 8.0), R('long', 13.0)] },
        { total: 37.4, bricks: [R('recovery', 5.0), R('easy', 9.0), R('tempo', 8.4), R('long', 15.0)] },
        { total: 41.0, bricks: [R('recovery', 6.0), R('easy', 9.0), R('interval', 10.0, '間歇：1000m × 6，趟間慢跑 400m'), R('long', 16.0)] },
        { total: 25.0, bricks: [R('recovery', 5.0), R('easy', 8.0), R('long', 12.0)] },
        { total: 45.0, bricks: [R('recovery', 6.0), R('easy', 10.0), R('tempo', 11.0), R('long', 18.0)] },
        { total: 49.5, bricks: [R('recovery', 6.5), R('easy', 11.0), R('interval', 12.0), R('long', 20.0)] },
        { total: 54.0, bricks: [R('recovery', 7.0), R('easy', 12.0), R('tempo', 13.0), R('long', 22.0)] },
        { total: 30.0, bricks: [R('recovery', 5.0), R('easy', 8.0), R('easy', 17.0, '驗收：全場模擬（8×1km ＋ 8 站，含分段配速記錄）')] },
    ],
};

/* ── 八週進程 ─────────────────────────────────────────────────── */
const PROG = (level) => {
    const names = ['技術建立期', '技術建立期', '容量累積期', '減量週', '強度突破期', '強度突破期', '峰值週', '驗收週'];
    const rpes  = ['RPE 6–7', 'RPE 7', 'RPE 7–8', 'RPE 5–6', 'RPE 8', 'RPE 8–9', 'RPE 8–9', 'RPE 7（驗收日除外）'];
    const scales = ['minus1', 'minus1', 1, 'two', 1, 1, 1, 0.8];
    const rounds = { beginner: [2, 2, 3, 2, 3, 4, 4, 3], inter: [3, 3, 4, 2, 4, 5, 5, 4], advanced: [3, 4, 5, 3, 5, 6, 6, 4] }[level];
    const days   = { beginner: 3, inter: 3, advanced: 4 }[level];
    return names.map((n, i) => ({ w: i + 1, name: n, rpe: rpes[i], scale: scales[i], rounds: rounds[i], days }));
};

const S = (base, p) => {
    if (p.scale === 'two') return 2;
    if (p.scale === 'minus1') return Math.max(2, base - 1);
    if (typeof p.scale === 'number') return Math.max(2, Math.round(base * p.scale));
    return base;
};

const circuitNote = (p, runMeters) =>
    `循環日｜本週 ${p.rounds} 輪。每一輪：先跑 ${runMeters} 公尺，回來立刻依序做完下列動作，做完算一輪，輪間休息 2 分鐘。\n` +
    `這一天練的是「心率已經拉高時還能不能維持動作品質」（compromised running）—— 這是 HYROX 的核心能力。\n` +
    `強制中止條件：任一輪的跑步配速比第一輪慢超過 20 秒／公里，就停在該輪，不要硬撐完。`;

const CONCURRENT = '同期效應落位規則：下肢大重量與質量跑至少間隔 24 小時；長跑的「隔天」絕不排大重量下肢；減量週兩邊同時收量';

/* ── 訓練日模板 ───────────────────────────────────────────────── */
const beginnerDays = (p) => ([
    {
        dayNumber: 1, focus: 'A｜負重基礎 · 蹲與攜行', time: 40, intensity: p.rpe,
        exercises: [
            GOBLET(S(3, p), 12, 75, '站距略寬於肩、腳尖外開；蹲到大腿低於水平'),
            FARMER(S(3, p), 40, 90, '每趟 40 公尺。肩膀下沉、肋骨收好、走直線'),
            STEP_UP(S(3, p), 12, 60, '每邊。箱子高度到膝蓋略上'),
            PUSHUP(S(3, p), 12, 60, '身體打直不塌腰'),
            PLANK(S(3, p), 40, 45, '單位為秒'),
        ],
        note: CONCURRENT,
    },
    {
        dayNumber: 2, focus: 'B｜循環日 · compromised running（替代站）', time: 45, intensity: p.rpe, isCircuit: true, circuitRounds: p.rounds, runPerRoundM: 400,
        exercises: [
            BW_SQUAT(p.rounds, 15, 0, '替代 Burpee Broad Jump（下肢代謝段）'),
            PUSHUP(p.rounds, 12, 0, '替代 Burpee Broad Jump（上肢段）— 缺離地爆發，這是本課最大的替代缺口'),
            FARMER(p.rounds, 40, 0, '替代 Farmers Carry — 唯一一對一對應，無替代損失'),
            WALK_LUNGE(p.rounds, 16, 0, '替代 Sandbag Lunges。16 步（每邊 8 步）'),
            DB_OHP(p.rounds, 10, 120, '替代 Wall Balls（上推段）。做完這一項算一輪，休 2 分鐘'),
        ],
        note: circuitNote(p, 400),
    },
    {
        dayNumber: 3, focus: 'C｜後鏈與拉力', time: 40, intensity: p.rpe,
        exercises: [
            RDL(S(3, p), 10, 90, '髖往後推不是腰往下彎；替代 Row 的髖鉸鏈成分'),
            BAND_ROW(S(3, p), 15, 60, '替代 Sled Pull 的拉力成分'),
            LEG_PRESS(S(3, p), 15, 90, '腳掌放高＝髖主導；膝蓋不鎖死 — 替代 Sled Push'),
            CALF(S(3, p), 15, 60),
            DEADBUG(S(3, p), 12, 45, '每邊 12 下'),
        ],
        note: CONCURRENT,
    },
]);

const interDays = (p) => ([
    {
        dayNumber: 1, focus: 'A｜負重基礎 · 蹲與攜行', time: 52, intensity: p.rpe,
        exercises: [
            BB_SQUAT(S(4, p), 8, 150, '這是本課唯一的大重量下肢動作，排在最前面'),
            FARMER(S(4, p), 50, 90, '每趟 50 公尺'),
            WALK_LUNGE(S(3, p), 20, 90, '20 步'),
            BB_OHP(S(3, p), 8, 120, '肋骨往下收，不要用腰反弓借力'),
            CABLE_CR(S(3, p), 15, 60),
        ],
        note: CONCURRENT,
    },
    {
        dayNumber: 2, focus: 'B｜循環日 · compromised running（替代站）', time: 55, intensity: p.rpe, isCircuit: true, circuitRounds: p.rounds, runPerRoundM: 800,
        exercises: [
            LEG_PRESS(p.rounds, 25, 0, '不鎖膝、連續動 — 替代 Sled Push'),
            SEATED_ROW(p.rounds, 20, 0, '替代 Sled Pull'),
            STRAIGHT(p.rounds, 25, 0, '替代 SkiErg'),
            GOBLET(p.rounds, 15, 0, '替代 Wall Balls（蹲段）'),
            FARMER(p.rounds, 50, 120, '替代 Farmers Carry。做完算一輪，休 2 分鐘'),
        ],
        note: circuitNote(p, 800),
    },
    {
        dayNumber: 3, focus: 'C｜後鏈與拉力', time: 52, intensity: p.rpe,
        exercises: [
            RDL(S(4, p), 8, 120, '替代 Row 的髖鉸鏈成分'),
            BB_ROW(S(3, p), 10, 120, '軀幹 45 度、下背中立'),
            PULL_THRU(S(3, p), 15, 60, '替代 Sled Pull 的髖伸成分'),
            LEG_CURL(S(3, p), 12, 75),
            SIDE_BR(S(3, p), 45, 45, '每邊 45 秒'),
        ],
        note: CONCURRENT,
    },
]);

const advDays = (p) => ([
    {
        dayNumber: 1, focus: 'A｜負重基礎 · 蹲與攜行', time: 60, intensity: p.rpe,
        exercises: [
            BB_SQUAT(S(4, p), 6, 180),
            FARMER(S(4, p), 50, 90, '每趟 50 公尺'),
            WALK_LUNGE(S(3, p), 24, 90, '24 步'),
            BB_OHP(S(4, p), 8, 120),
            CABLE_CR(S(3, p), 15, 60),
        ],
        note: CONCURRENT,
    },
    {
        dayNumber: 2, focus: 'B｜循環日 · compromised running（替代站）', time: 70, intensity: p.rpe, isCircuit: true, circuitRounds: p.rounds, runPerRoundM: 1000,
        exercises: [
            LEG_PRESS(p.rounds, 25, 0, '不鎖膝、連續動 — 替代 Sled Push'),
            SEATED_ROW(p.rounds, 20, 0, '替代 Sled Pull'),
            STRAIGHT(p.rounds, 25, 0, '替代 SkiErg'),
            WALK_LUNGE(p.rounds, 24, 0, '24 步 — 替代 Sandbag Lunges'),
            GOBLET(p.rounds, 15, 0, '替代 Wall Balls'),
            FARMER(p.rounds, 50, 120, '做完算一輪，休 2 分鐘'),
        ],
        note: `${circuitNote(p, 1000)}\n⚠ 第 6 週的這一天是全課程唯一同時具備「最高心率負荷 ＋ 最高肌肉疲勞 ＋ 最長時間」的一天。中止條件務必遵守。`,
    },
    {
        dayNumber: 3, focus: 'C｜後鏈最大負荷', time: 62, intensity: p.rpe,
        exercises: [
            DEADLIFT(Math.min(S(4, p), 4), 5, 180, '組數上限 4 組；下背一旦圓立刻停組'),
            BB_ROW(S(4, p), 8, 120),
            PULL_THRU(S(3, p), 15, 60),
            LEG_CURL(S(3, p), 12, 75),
            SIDE_BR(S(3, p), 45, 45, '每邊 45 秒'),
        ],
        note: `${CONCURRENT}｜硬舉日的隔天不排大重量下肢`,
    },
    {
        dayNumber: 4, focus: 'D｜上肢拉力與核心（低疲勞）', time: 45, intensity: p.rpe,
        exercises: [
            LAT_PULL(S(4, p), 10, 90),
            SEATED_ROW(S(3, p), 12, 90),
            DB_OHP(S(3, p), 12, 75),
            PUSHUP(S(3, p), 15, 60),
            DEADBUG(S(3, p), 12, 45, '每邊 12 下'),
        ],
        note: '這一天刻意低疲勞，排在長跑的隔天也安全',
    },
]);

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

const buildWeeks = (prog, dayFn, runSet) => prog.map((p, i) => ({
    weekNumber: p.w,
    name: `${p.name}（循環 ${p.rounds} 輪 · 週跑量 ${runSet[i].total} km）`,
    runPlan: runSet[i].bricks,
    weekMileageKm: runSet[i].total,
    circuitRounds: p.rounds,
    days: withCalendarDays(dayFn(p).slice(0, p.days), p.name).map(d => ({ ...d, weekPhase: p.name })),
}));

/* ═══════════════════════════════════════════════════════════════ */
export const HYROX_PLAN = {
    id: 'hybrid-engine-56',
    name: '混合體能：跑步＋負重',
    subtitle: '跑一段、扛一段，八週練到不掉速',
    bodyPart: 'hybrid_hyrox',
    bodyPartLabel: '混合體能 · 跑步 × 功能性力量',
    duration: 56,
    coverImage: '/desktop/Gemini_Generated_Image_o6ou6wo6ou6wo6ou.png',
    description: '跑一段、做一組負重動作，交替八輪，比照 HYROX 賽制，練的是喘的時候動作還能不能做好。沒有雪橇和滑雪機的場館，課程會換成效果接近的動作，並標出哪裡不一樣。',
    tags: ['跑步＋負重交替', '喘的時候的動作品質', '比照 HYROX 賽制', '八週'],
    isCourse: true,
    courseSystem: 'hybrid',
    stationMap: STATION_MAP,
    hybridNote: '循環日的跑段寫在 day.note，資料層仍為 strength 日（繞開 dailyAgenda 的 dual 日限制）。獨立跑步處方在 weeks[].runPlan。完整解法需要 days[].segments[]，見設計文件第八節。',
    honestyNote: '本課程練的是 HYROX 的體能底子，不是專項站技術。雪橇推拉、SkiErg、划船機、Wall Ball、波比跳都不在動作庫中，替代對照與差距見 stationMap。真的要比賽，賽前請另外找場地練專項站。',

    levels: {
        beginner: {
            key: 'beginner',
            label: '新手',
            labelEn: 'Beginner',
            recommendedDays: 3,
            recommendedDaysLabel: '每週 3 次重訓／循環 ＋ 3 次跑步',
            durationPerSession: '40-45',
            equipment: ['啞鈴', '箱子或階梯', '彈力帶', '跑鞋'],
            targetArea: '下肢負重耐力、攜行能力、核心剛性、有氧基礎',
            intensity: '低至中等（RPE 6–8）',
            expectedGain: '連續跑完 5 km 不走、蹲得穩、能完成 1/4 模擬（4×400m ＋ 4 站）',
            benefits: [
                '循環輪數從 2 輪長到 4 輪，難度靠輪數而不是靠加重',
                '八週總跑量 112 km，單週增幅（對照上一個累積週）全部 ≤10%',
                '第 4 週有完整減量週，跑量與重訓同時收',
            ],
            periodization: {
                phase1: { name: '技術建立', weeks: '第 1–2 週', focus: '學動作、學循環節奏；循環 2 輪', reps: '12–15 次', intensity: 'RPE 6–7' },
                phase2: { name: '容量累積', weeks: '第 3 週', focus: '循環 3 輪，第一次節奏跑', reps: '12–15 次', intensity: 'RPE 7–8' },
                phase3: { name: '減量與再累積', weeks: '第 4–6 週', focus: 'W4 全面減量；W5–W6 重回累積並加到 4 輪', reps: '12–15 次', intensity: 'RPE 5–6 → 8–9' },
                phase4: { name: '峰值與驗收', weeks: '第 7–8 週', focus: 'W7 跑量峰值 19.2 km；W8 收量並執行 1/4 模擬', reps: '12–15 次', intensity: 'RPE 8–9 → 7' },
            },
            weeks: buildWeeks(PROG('beginner'), beginnerDays, RUN.beginner),
        },

        intermediate: {
            key: 'intermediate',
            label: '中階',
            labelEn: 'Intermediate',
            recommendedDays: 3,
            recommendedDaysLabel: '每週 3 次重訓／循環 ＋ 4 次跑步',
            durationPerSession: '52-55',
            equipment: ['槓鈴', '啞鈴', '繩索', '腿推機', '跑鞋'],
            targetArea: '下肢力量與負重耐力、拉力耐力、核心剛性、有氧容量',
            intensity: '中等至高（RPE 7–9）',
            expectedGain: '能完成半場模擬（4×1km ＋ 4 站，計時）、深蹲與 RDL 力量同步進步',
            benefits: [
                '循環輪數 3 → 5 輪，每輪跑 800 公尺',
                '八週總跑量 224 km，第 4 週減量週跑量與重訓同時收',
                '下肢大重量與質量跑固定間隔 24 小時以上，長跑隔天不排下肢',
            ],
            periodization: {
                phase1: { name: '技術建立', weeks: '第 1–2 週', focus: '建立 80/20 節奏；循環 3 輪', reps: '8–20 次', intensity: 'RPE 6–7' },
                phase2: { name: '容量累積', weeks: '第 3 週', focus: '循環 4 輪，加入 1000m 間歇', reps: '8–20 次', intensity: 'RPE 7–8' },
                phase3: { name: '減量與強度突破', weeks: '第 4–6 週', focus: 'W4 減量；W5–W6 循環加到 5 輪', reps: '8–20 次', intensity: 'RPE 5–6 → 8–9' },
                phase4: { name: '峰值與驗收', weeks: '第 7–8 週', focus: 'W7 跑量峰值 38.5 km；W8 半場模擬計時', reps: '8–20 次', intensity: 'RPE 8–9 → 7' },
            },
            weeks: buildWeeks(PROG('inter'), interDays, RUN.inter),
        },

        advanced: {
            key: 'advanced',
            label: '精熟',
            labelEn: 'Advanced',
            recommendedDays: 4,
            recommendedDaysLabel: '每週 4 次重訓／循環 ＋ 4 次跑步',
            durationPerSession: '45-70',
            equipment: ['槓鈴', '啞鈴', '繩索', '腿推機', '跑鞋'],
            targetArea: '同中階，負荷與容量上調；含硬舉日',
            intensity: '高（RPE 7–9）',
            expectedGain: '能完成全場模擬（8×1km ＋ 8 站，含分段配速記錄）',
            benefits: [
                '循環輪數 3 → 6 輪，每輪跑 1000 公尺（正式賽的跑段距離）',
                '八週總跑量 316 km；第 4 天刻意低疲勞，可安全排在長跑隔天',
                '硬舉組數上限 4 組、每週 1 次，且隔天不排大重量下肢',
            ],
            periodization: {
                phase1: { name: '技術建立', weeks: '第 1–2 週', focus: '循環 3–4 輪，建立節奏', reps: '5–25 次', intensity: 'RPE 6–7' },
                phase2: { name: '容量累積', weeks: '第 3 週', focus: '循環 5 輪，1000m × 6 間歇', reps: '5–25 次', intensity: 'RPE 7–8' },
                phase3: { name: '減量與強度突破', weeks: '第 4–6 週', focus: 'W4 減量；W6 循環 6 輪為全課最重的一天', reps: '5–25 次', intensity: 'RPE 5–6 → 8–9' },
                phase4: { name: '峰值與驗收', weeks: '第 7–8 週', focus: 'W7 跑量峰值 54 km；W8 全場模擬', reps: '5–25 次', intensity: 'RPE 8–9 → 7' },
            },
            weeks: buildWeeks(PROG('advanced'), advDays, RUN.advanced),
        },
    },
};

export default HYROX_PLAN;
