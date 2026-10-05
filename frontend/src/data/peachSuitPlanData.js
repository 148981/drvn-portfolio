// ════════════════════════════════════════════════════════════════════════
//  peachSuitPlanData.js — 課程 05｜蜜桃翹臀套裝（PEACH SUIT）
//  取代原 glutePlanData / legPlanData 兩張卡（data 檔保留供融合與動作索引使用）
//
//  設計文件：課程改版_設計文件/05-蜜桃翹臀套裝.md
//  ─ 核心論點：臀型是三個獨立問題（上緣飽滿／側邊凹陷／下緣分界），
//    分別由三種力學向量處理 — 水平髖伸、垂直髖伸、髖外展，缺一不可
//  ─ 每次訓練前有固定的「臀部啟動熱身」，打斷久坐造成的臀肌抑制。
//    ⚠ 熱身以 tier 4 ＋ isWarmup 旗標放在 exercises[] 最前面，
//      這樣現行 UI 不用改就會把它排進訓練流程的第一段（不可跳過的關鍵五分鐘）。
//  ─ 全課不含前蹲／哈克深蹲／腿伸展 — 三個最股四頭主導的動作
//
//  ⚠ 動作名稱與 nameEn 必須與 EXERCISE_MASTER_DB 逐字一致。
// ════════════════════════════════════════════════════════════════════════

const E = (name, nameEn, target, tier) => (s, r, rest, note, extra) => ({
    name, nameEn, target, tier, sets: s, reps: r, rest,
    ...(note ? { note } : {}), ...(extra || {}),
});

/* ── 水平髖伸（頂峰收縮）── */
const HIP_THRUST = E('臀推', 'Hip Thrust', '臀大肌', 1);
const SL_THRUST  = E('單腿臀推', 'Single Leg Hip Thrust', '臀大肌上部、臀中肌', 2);
const FROG_BR    = E('青蛙橋式', 'Barbell Glute Bridge', '臀大肌上部', 2);
const PULL_THRU  = E('繩索臀推', 'Cable Pull Through', '臀大肌', 3);
const GLUTE_BR   = E('橋式', 'Glute Bridge', '臀大肌', 3);
const BAND_KICK  = E('Band Kickback', 'Band Kickback', '臀大肌', 3);
const QUAD_HIP   = E('Quadruped Hip Extension', 'Quadruped Hip Extension', '臀大肌', 3);
const CAB_KICK   = E('Cable Kickback', 'Cable Hip Extension', '臀大肌', 3);

/* ── 垂直髖伸（深屈曲拉伸）── */
const RDL        = E('羅馬尼亞硬舉', 'Romanian Deadlift', '腿後肌群、臀大肌', 1);
const SUMO_DL    = E('相撲硬舉', 'Sumo Deadlift', '臀大肌、髖外展肌、腿後', 1);
const BB_SQUAT   = E('槓鈴深蹲', 'Barbell Squat', '股四頭、臀大肌', 1);
const GOBLET     = E('高腳杯深蹲', 'Goblet Squat', '股四頭、臀大肌', 2);
const LEG_PRESS  = E('腿推', 'Leg Press', '臀大肌、股四頭', 2);
const BULGARIAN  = E('保加利亞分腿蹲', 'Dumbbell Rear Lunge', '臀大肌、股四頭', 2);
const REV_LUNGE  = E('後跨步弓箭步', 'Dumbbell Rear Lunge', '臀大肌、股四頭', 3);
const WALK_LUNGE = E('行走弓箭步', 'Walking Lunges', '臀大肌、股四頭', 3);
const STEP_UP    = E('上台階', 'Step Ups', '臀大肌、臀中肌', 3);
const BACK_EXT   = E('45度背伸展', '45° Back Extension', '腿後、豎脊肌、臀', 3);
const LEG_CURL   = E('腿彎舉', 'Lying Leg Curls', '腿後肌群', 3);

/* ── 髖外展（臀中肌）── */
const CLAM       = E('側躺蚌殼式', 'Clam', '臀中肌', 3);
const ABDUCTOR   = E('機械髖外展', 'Thigh Abductor', '臀中肌', 3);

/* ── 核心 ── */
const DEADBUG    = E('死蟲式', 'Dead Bug', '核心抗伸展', 3);
const SIDE_BR    = E('側棒式', 'Side Bridge', '側鏈穩定、臀中肌', 3);
const CABLE_CR   = E('繩索捲腹', 'Cable Crunch', '腹直肌', 3);
const WOODCHOP   = E('繩索伐木', 'Cable Russian Twists', '核心抗旋轉', 3);
const SUPERMAN   = E('超人式', 'Superman', '豎脊肌、臀', 3);

const SS_GAP = 15;

const CUE = {
    thrust: '下巴微收、肋骨往下收。頂端是「夾臀」不是「挺腰」— 腰有感覺就是太重了',
    rdl:    '髖往後推，不是腰往下彎。膝蓋微彎之後就固定不動。感覺應該在大腿後側，不在下背',
    squat:  '站距略寬於肩、腳尖外開 20–30 度、軀幹前傾 30–45 度、蹲到大腿低於水平',
    bulg:   '每邊。前腳掌全貼地、重心壓在前腳跟、軀幹微前傾；W1–W4 可扶牆',
    abduct: '軀幹微前傾約 15 度 — 這個角度臀中肌後段參與最多',
    sumo:   '站距寬、腳尖外開 40 度，讓髖外展肌與臀大肌同時參與；下背一旦圓立刻停組',
    ss:     '超級組：A 做完休 15 秒立刻接 B，B 結束才是完整組間休息',
};

/* ── 臀部啟動熱身（三難度共用，每次訓練固定執行）───────────────── */
const WARMUP_MARK = { isWarmup: true, warmup: true };
const warmupBlock = () => ([
    { name: '側躺蚌殼式', nameEn: 'Clam', target: '臀中肌（啟動）', tier: 4, sets: 2, reps: 15, rest: 30,
      note: '啟動熱身 1/3｜每邊 15 下。骨盆不要往後倒，只有膝蓋在開', ...WARMUP_MARK },
    { name: '橋式', nameEn: 'Glute Bridge', target: '臀大肌（啟動）', tier: 4, sets: 2, reps: 15, rest: 30,
      note: '啟動熱身 2/3｜頂端夾臀停 2 秒，腰不要反弓', ...WARMUP_MARK },
    { name: 'Bird Dog', nameEn: 'Bird Dog', target: '核心（啟動）', tier: 4, sets: 2, reps: 8, rest: 30,
      note: '啟動熱身 3/3｜每邊 8 下。手腳伸長時骨盆不轉，想像背上放一杯水', ...WARMUP_MARK },
]);

/* ── 八週進程 ─────────────────────────────────────────────────── */
const PROG = (level) => {
    const comp = {
        beginner: [18, 18, 14, 14, 10, 10, 13, 14],
        inter:    [12, 12, 11, 11,  8,  8, 10,  8],
        advanced: [10, 10,  9,  9,  6,  6,  8,  6],
    }[level];
    const iso = {
        beginner: [20, 20, 18, 18, 20, 22, 15, 18],
        inter:    [20, 20, 18, 18, 18, 18, 15, 15],
        advanced: [20, 20, 18, 18, 18, 18, 15, 15],
    }[level];
    const names = ['技術建立期', '技術建立期', '容量累積期', '容量累積期', '強度突破期', '強度突破期', '主動恢復期', '驗收週'];
    const rpes  = ['RPE 6–7', 'RPE 7', 'RPE 7–8', 'RPE 8', 'RPE 8–9',
                   level === 'advanced' ? 'RPE 9–9.5（僅末組）' : 'RPE 9', 'RPE 5–6', 'RPE 7–8'];
    const scales = level === 'beginner'
        ? ['minus1', 'minus1', 1, 1, 1, 1, 'two', 'minus1']
        : [0.75, 0.75, 1, 1, 1, 1, 'two', 0.8];
    return names.map((n, i) => ({
        w: i + 1, name: n, comp: comp[i], iso: iso[i], rpe: rpes[i], scale: scales[i],
        tech: i >= 2 && i <= 5,
    }));
};

const S = (base, p) => {
    if (p.scale === 'two') return 2;
    if (p.scale === 'minus1') return Math.max(2, base - 1);
    if (typeof p.scale === 'number') return Math.max(2, Math.round(base * p.scale));
    return base;
};

/* ── 新手：水平日／垂直日／單腿外展日（居家）── */
const beginnerDays = (p) => ([
    {
        dayNumber: 1, focus: 'A｜水平髖伸日 · 頂峰收縮 · 臀大肌上部', time: 38, intensity: p.rpe,
        exercises: [
            ...warmupBlock(),
            SL_THRUST(S(3, p), Math.min(p.comp, 14), 60, `每邊。肩胛靠椅緣，${CUE.thrust}`),
            GLUTE_BR(S(3, p), p.iso, 45, '頂端夾臀停 1 秒'),
            BAND_KICK(S(3, p), Math.round(p.iso * 0.75), 45, '每邊。行程末端張力最大，不要用腰甩'),
            CLAM(S(3, p), p.iso, 45, '每邊'),
            DEADBUG(S(3, p), 10, 45, '每邊 10 下。腰緊貼地面'),
        ],
    },
    {
        dayNumber: 2, focus: 'B｜垂直髖伸日 · 深屈曲拉伸 · 下緣分界', time: 42, intensity: p.rpe,
        exercises: [
            ...warmupBlock(),
            GOBLET(S(3, p), Math.min(p.comp, 14), 75, CUE.squat),
            RDL(S(3, p), Math.min(p.comp, 14), 75, CUE.rdl),
            REV_LUNGE(S(3, p), Math.max(p.comp - 4, 8), 60, '每邊。往後跨（不是往前），對膝蓋壓力較低'),
            QUAD_HIP(S(3, p), Math.round(p.iso * 0.75), 45, '每邊。四足跪姿排除下背代償，最容易找到臀感'),
            SIDE_BR(S(3, p), 30, 45, '每邊 30 秒'),
        ],
    },
    {
        dayNumber: 3, focus: 'C｜單腿與外展日 · 骨盆穩定 · 臀中肌', time: 40, intensity: p.rpe,
        exercises: [
            ...warmupBlock(),
            BULGARIAN(S(3, p), Math.max(p.comp - 4, 8), 75, CUE.bulg),
            STEP_UP(S(3, p), Math.min(p.comp, 12), 60, '每邊。箱子夠高才是髖主導'),
            BAND_KICK(S(3, p), Math.round(p.iso * 0.75), 45, '每邊'),
            CLAM(S(3, p), p.iso, 45, '每邊'),
            SUPERMAN(S(3, p), 12, 45),
        ],
    },
]);

/* ── 中階：水平重／垂直／單腿外展／水平泵（健身房）── */
const interDays = (p) => ([
    {
        dayNumber: 1, focus: 'D1 水平重日 · 臀推最大負荷', time: 52, intensity: p.rpe,
        exercises: [
            ...warmupBlock(),
            HIP_THRUST(S(4, p), p.comp, 120, CUE.thrust),
            PULL_THRU(S(3, p), p.comp + 2, 75, '恆定張力、零脊椎壓力'),
            ABDUCTOR(S(4, p), p.iso - 3, 60, CUE.abduct),
            LEG_CURL(S(3, p), p.comp + 2, 75),
            CABLE_CR(S(3, p), 15, 60),
        ],
    },
    {
        dayNumber: 2, focus: 'D2 垂直日 · 深屈曲 · 後鏈', time: 50, intensity: p.rpe,
        exercises: [
            ...warmupBlock(),
            RDL(S(4, p), Math.max(p.comp - 3, 6), 120, CUE.rdl),
            LEG_PRESS(S(3, p), p.comp + 2, 90, '腳掌位置放高（踏板上緣），膝蓋不鎖死 — 這樣才是髖主導'),
            BACK_EXT(S(3, p), p.iso - 3, 60, '用臀發力不要用腰甩'),
            CLAM(S(3, p), p.iso, 45, '每邊'),
            DEADBUG(S(3, p), 12, 45, '每邊 12 下'),
        ],
    },
    {
        dayNumber: 3, focus: 'D4 單腿外展日 · 骨盆穩定 · 臀中肌', time: 52, intensity: p.rpe,
        exercises: [
            ...warmupBlock(),
            BULGARIAN(S(4, p), Math.max(p.comp - 2, 8), 90, CUE.bulg),
            STEP_UP(S(3, p), 12, 75, '每邊'),
            CAB_KICK(S(3, p), p.iso - 3, 60, '每邊'),
            ABDUCTOR(S(4, p), p.iso, 60, CUE.abduct),
            SIDE_BR(S(3, p), 40, 45, '每邊 40 秒'),
        ],
    },
    {
        dayNumber: 4, focus: 'D5 水平泵日 · 低離心 · 代謝壓力', time: 48, intensity: p.rpe,
        exercises: [
            ...warmupBlock(),
            SL_THRUST(S(4, p), p.comp + 2, 90, `每邊。${CUE.thrust}`),
            FROG_BR(S(3, p), p.iso, 60, '腳掌相對、髖外旋 — 這個位置臀大肌上部參與最高'),
            PULL_THRU(S(3, p), p.iso - 3, 60),
            LEG_CURL(S(3, p), p.iso - 3, 60),
            WOODCHOP(S(3, p), 12, 60, '每邊 12 下。這一天結束不該有明顯痠痛'),
        ],
    },
]);

/* ── 精熟：同分化 ＋ 超級組 ── */
const advDays = (p) => {
    const ssA = (grp, tag) => (p.tech ? { superset: true, supersetGroup: grp, note: `${CUE.ss}｜${tag}` } : {});
    const ssB = (grp) => (p.tech ? { supersetGroup: grp } : {});

    return [
        {
            dayNumber: 1, focus: 'D1 水平重日 · 臀推最大負荷', time: 66, intensity: p.rpe,
            exercises: [
                ...warmupBlock(),
                HIP_THRUST(S(4, p), p.comp, 180, CUE.thrust),
                FROG_BR(S(4, p), p.comp + 4, 120, '腳掌相對、髖外旋'),
                PULL_THRU(S(3, p), p.iso - 3, p.tech ? SS_GAP : 60, undefined, ssA('SS1', 'SS1-A ➜ 接機械髖外展')),
                ABDUCTOR(S(3, p), p.iso + 2, 90, CUE.abduct, ssB('SS1')),
                LEG_CURL(S(4, p), p.comp + 4, 90),
                CABLE_CR(S(3, p), 15, 60),
            ],
        },
        {
            dayNumber: 2, focus: 'D2 垂直日 · 深屈曲 · 後鏈最大負荷', time: 70, intensity: p.rpe,
            exercises: [
                ...warmupBlock(),
                SUMO_DL(S(4, p), p.comp, 180, `${CUE.sumo}｜本動作不做遞減組、不做 RPE 9.5`),
                BB_SQUAT(S(4, p), p.comp + 2, 120, `${CUE.squat}｜無法在不圓背下蹲到深度就改用腿推`),
                RDL(S(3, p), p.comp + 4, 120, CUE.rdl),
                BACK_EXT(S(3, p), p.iso - 3, 60),
                DEADBUG(S(3, p), 12, 45, '每邊 12 下'),
            ],
            note: '全課 CNS 與下背負荷的絕對峰值。做不完不是失敗 — 相撲硬舉少做一組，比明天下背痛三天好。隔天必須完全休息',
        },
        {
            dayNumber: 3, focus: 'D4 單腿外展日 · 骨盆穩定 · 臀中肌', time: 68, intensity: p.rpe,
            exercises: [
                ...warmupBlock(),
                BULGARIAN(S(4, p), Math.max(p.comp, 8), 120, CUE.bulg),
                WALK_LUNGE(S(3, p), 20, 90, '20 步。連續行進增加代謝壓力與單腿穩定需求'),
                STEP_UP(S(3, p), 12, 75, '每邊'),
                CAB_KICK(S(3, p), p.iso - 3, p.tech ? SS_GAP : 60, '每邊', ssA('SS1', 'SS1-A ➜ 接機械髖外展')),
                ABDUCTOR(S(3, p), p.iso + 2, 90, CUE.abduct, ssB('SS1')),
                SIDE_BR(S(3, p), 45, 45, '每邊 45 秒'),
            ],
        },
        {
            dayNumber: 4, focus: 'D5 水平泵日 · 低離心 · 代謝壓力', time: 58, intensity: p.rpe,
            exercises: [
                ...warmupBlock(),
                SL_THRUST(S(4, p), p.comp + 4, 90, `每邊。${CUE.thrust}`),
                PULL_THRU(S(4, p), p.iso - 3, 75),
                BAND_KICK(S(3, p), p.iso + 2, p.tech ? SS_GAP : 60, '每邊', ssA('SS1', 'SS1-A ➜ 接側躺蚌殼式')),
                CLAM(S(3, p), p.iso + 7, 60, '每邊', ssB('SS1')),
                LEG_CURL(S(4, p), p.iso - 3, 75),
                WOODCHOP(S(3, p), 12, 60, '每邊 12 下'),
            ],
        },
    ];
};

const DELOAD_NOTE = '減量週：這週只做兩組、RPE 5–6，你會覺得沒練到 — 那正是重點。六週的疲勞讓臀部一直腫脹，量圍度量不準。這週不要加重，一公斤都不要';
const TEST_NOTE   = '驗收週：疲勞清掉了，這週測。臀推 8 下的重量、保加利亞不扶能做幾下、臀圍、腰圍。圍度請在訓練「之前」量 — 訓練後多出來的是泵感不是成績';

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

const buildWeeks = (prog, dayFn) => prog.map(p => ({
    weekNumber: p.w,
    name: p.name,
    days: withCalendarDays(dayFn(p), p.name).map(d => ({
        ...d,
        weekPhase: p.name,
        ...(p.w === 7 ? { note: DELOAD_NOTE } : p.w === 8 ? { note: TEST_NOTE } : {}),
    })),
}));

/* ═══════════════════════════════════════════════════════════════ */
export const PEACH_SUIT_PLAN = {
    id: 'peach-suit-56',
    name: '翹臀訓練',
    subtitle: '三種角度練臀，八週把臀型練起來',
    bodyPart: 'glutes_posterior',
    bodyPartLabel: '臀與後鏈',
    duration: 56,
    coverImage: '/desktop/Gemini_Generated_Image_f5fhhcf5fhhcf5fh.png',
    description: '臀部上緣、側邊、下緣是三個不同的問題，課程用三種角度分開練。每次訓練前有五分鐘的臀部熱身，先讓臀出力，正式組才練得到。',
    tags: ['三種角度', '每次先做臀部熱身', '練骨盆穩定', '八週不換動作'],
    isCourse: true,
    courseSystem: 'strength',

    levels: {
        beginner: {
            key: 'beginner',
            label: '新手',
            labelEn: 'Beginner',
            recommendedDays: 3,
            recommendedDaysLabel: '建議每週 3 天（第 1／3／5 天）',
            durationPerSession: '35-45',
            equipment: ['可調啞鈴', '穩固椅子', '迷你彈力圈'],
            targetArea: '臀大肌、臀中肌、腿後肌群、核心',
            intensity: '低至中等（RPE 6–8）',
            expectedGain: '臀部啟動感建立、單腿站立骨盆穩定、臀圍與腰臀比初步改變',
            benefits: [
                '三天全部在家可完成，一組啞鈴＋一張椅子＋一條彈力圈就夠',
                '每次訓練都從固定的啟動熱身開始 — 這是「深蹲有臀感」的關鍵五分鐘',
                '三種力學向量各有專屬的一天，不會八週只做臀推',
            ],
            periodization: {
                phase1: { name: '技術建立', weeks: '第 1–2 週', focus: '學動作、找臀感；保加利亞可扶牆', reps: '18 次', intensity: 'RPE 6–7' },
                phase2: { name: '容量累積', weeks: '第 3–4 週', focus: '組數補滿，深蹲時開始能在臀部感覺到發力', reps: '14 次', intensity: 'RPE 7–8' },
                phase3: { name: '強度突破', weeks: '第 5–6 週', focus: '複合加重；外展與孤立維持高次數不加重', reps: '複合 10 · 外展 20–22', intensity: 'RPE 8–9' },
                phase4: { name: '減量與驗收', weeks: '第 7–8 週', focus: 'W7 每動作 2 組不加重；W8 測單腿臀推、量臀圍腰圍', reps: '13 → 14 次', intensity: 'RPE 5–6 → 7–8' },
            },
            weeks: buildWeeks(PROG('beginner'), beginnerDays),
        },

        intermediate: {
            key: 'intermediate',
            label: '中階',
            labelEn: 'Intermediate',
            recommendedDays: 4,
            recommendedDaysLabel: '建議每週 4 天（第 1／2／4／5 天）',
            durationPerSession: '45-55',
            equipment: ['槓鈴', '臀推架', '繩索', '髖外展機', '腿彎舉機'],
            targetArea: '臀大肌、臀中肌、腿後肌群、豎脊肌、核心',
            intensity: '中等至高（RPE 7–9）',
            expectedGain: '臀圍 +1~2 cm、臀推力量 +20~35%、臀中肌可見的上緣改變',
            benefits: [
                '三種力學向量的週容量 20／23／11 組，配比有依據不是隨手排',
                '高離心動作（RDL、保加利亞）與低離心動作（臀推、繩索臀推）分日排',
                '全課不含前蹲、哈克深蹲、腿伸展 — 股四頭只拿維持量',
            ],
            periodization: {
                phase1: { name: '技術建立', weeks: '第 1–2 週', focus: '重量保守，先把姿勢固定', reps: '12 次', intensity: 'RPE 6–7' },
                phase2: { name: '容量累積', weeks: '第 3–4 週', focus: '組數補滿，W4 是容量峰值', reps: '11 次', intensity: 'RPE 7–8' },
                phase3: { name: '強度突破', weeks: '第 5–6 週', focus: '複合 +5kg、次數降到 8；外展不進低次數區間', reps: '複合 8 · 外展 18', intensity: 'RPE 8–9' },
                phase4: { name: '減量與驗收', weeks: '第 7–8 週', focus: 'W7 容量降 60%；W8 測臀推 8RM 與保加利亞不扶下數', reps: '複合 8–10', intensity: 'RPE 5–6 → 7–8' },
            },
            weeks: buildWeeks(PROG('inter'), interDays),
        },

        advanced: {
            key: 'advanced',
            label: '精熟',
            labelEn: 'Advanced',
            recommendedDays: 4,
            recommendedDaysLabel: '建議每週 4 天（第 1／2／4／5 天，第 3 天必須完全休息）',
            durationPerSession: '55-70',
            equipment: ['槓鈴', '臀推架', '繩索', '髖外展機', '腿彎舉機', '深蹲架'],
            targetArea: '同中階，容量與強度技巧上調',
            intensity: '高（RPE 8–9.5，9.5 僅限末組；相撲硬舉除外）',
            expectedGain: '三向量容量全在 MAV 帶、臀推與相撲硬舉同步進步、上緣與下緣同時改變',
            benefits: [
                '週總直接組數 61 組，臀大肌已在 MAV 上緣 — 全課最大的一筆投資',
                '超級組只用在外展與低離心孤立，大重量動作維持完整休息',
                '相撲硬舉補上「深屈曲 ＋ 外展位」的複合刺激，是其他難度沒有的一塊',
            ],
            periodization: {
                phase1: { name: '技術建立', weeks: '第 1–2 週', focus: '組數壓 75%，超級組停用', reps: '10 次', intensity: 'RPE 7–8' },
                phase2: { name: '容量累積', weeks: '第 3–4 週', focus: '組數補滿並開啟超級組', reps: '9 次', intensity: 'RPE 8–9' },
                phase3: { name: '強度突破', weeks: '第 5–6 週', focus: '複合降到 6 次；相撲硬舉不追 RPE 9.5', reps: '複合 6 · 外展 18', intensity: 'RPE 9–9.5（僅末組）' },
                phase4: { name: '減量與驗收', weeks: '第 7–8 週', focus: 'W7 技巧全停；W8 測臀推與相撲硬舉 6RM、量臀圍腰圍', reps: '複合 6–8', intensity: 'RPE 5–6 → 8' },
            },
            weeks: buildWeeks(PROG('advanced'), advDays),
        },
    },
};

export default PEACH_SUIT_PLAN;
