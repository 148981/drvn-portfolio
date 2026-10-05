// ════════════════════════════════════════════════════════════════════════
//  ironBasePlanData.js — 課程 06｜鋼骨基石：全身力量套裝（IRON BASE）
//  取代原 fullbodyPlanData / corePlanData 兩張卡（data 檔保留供融合與動作索引使用）
//
//  設計文件：課程改版_設計文件/06-鋼骨基石.md
//  ─ 陣容的地基課，也是新手的預設入口
//  ─ 新手 全身式 3 天／中階 上下肢分化 4 天／精熟 上下肢＋週內波動 4 天
//  ─ 三大項永遠排 tier 1（神經最新鮮時練最難的動作）
//  ─ 硬舉全難度 1 次／週、組數上限 4–5、不與大重量深蹲相鄰
//  ─ 新手 W1–W2 不碰槓鈴（啞鈴／機械先修）、W1–W4 用 RDL 學髖鉸鏈，W5 才上傳統硬舉
//
//  ⚠ 動作名稱與 nameEn 必須與 EXERCISE_MASTER_DB 逐字一致，否則示範圖與肌群判定會失效。
// ════════════════════════════════════════════════════════════════════════

/* ── 動作工廠 ─────────────────────────────────────────────────── */
const E = (name, nameEn, target, tier) => (s, r, rest, note) => ({
    name, nameEn, target, tier, sets: s, reps: r, rest,
    ...(note ? { note } : {}),
});

// 下肢
const BB_SQUAT   = E('槓鈴深蹲', 'Barbell Squat', '股四頭、臀、核心', 1);
const GOBLET     = E('高腳杯深蹲', 'Goblet Squat', '股四頭、臀', 2);
const FRONT_SQ   = E('前蹲', 'Front Barbell Squat', '股四頭、上背', 2);
const DEADLIFT   = E('硬舉', 'Barbell Deadlift', '後鏈全體', 1);
const RDL        = E('羅馬尼亞硬舉', 'Romanian Deadlift', '腿後、臀', 1);
const LEG_PRESS  = E('腿推', 'Leg Press', '股四頭、臀', 2);
const BULGARIAN  = E('保加利亞分腿蹲', 'Dumbbell Rear Lunge', '臀、股四頭', 3);
const LEG_CURL   = E('腿彎舉', 'Lying Leg Curls', '腿後肌群', 3);
const CALF       = E('站姿提踵', 'Standing Calf Raises', '小腿三頭肌', 3);

// 上肢 — 推
const BB_BENCH   = E('槓鈴臥推', 'Barbell Bench Press - Medium Grip', '胸、前束、三頭', 1);
const DB_BENCH   = E('啞鈴臥推', 'Dumbbell Bench Press', '胸、前束', 2);
const INC_BB     = E('上斜槓鈴臥推', 'Barbell Incline Bench Press - Medium Grip', '胸上部、前束', 1);
const INC_DB     = E('上斜啞鈴推舉', 'Incline Dumbbell Press', '胸上部、前束', 2);
const CLOSE_GRIP = E('窄握臥推', 'Close-Grip Barbell Bench Press', '肱三頭肌', 3);
const BB_OHP     = E('槓鈴肩推', 'Barbell Overhead Press', '三角肌前束、核心', 1);
const DB_OHP     = E('啞鈴肩推', 'Dumbbell Overhead Press', '三角肌前束、中束', 2);
const LAT_RAISE  = E('啞鈴側平舉', 'Side Lateral Raise', '三角肌中束', 3);
const PUSHDOWN   = E('三頭肌下壓', 'Triceps Pushdown', '肱三頭肌外側頭', 3);

// 上肢 — 拉
const BB_ROW     = E('槓鈴划船', 'Bent Over Barbell Row', '背闊肌、上背', 1);
const PULLUP     = E('引體向上', 'Pullups', '背闊肌、二頭', 1);
const LAT_PULL   = E('下拉', 'Wide-Grip Lat Pulldown', '背闊肌', 2);
const NEUTRAL_PD = E('對握下拉', 'Neutral Grip Lat Pulldown', '背闊肌', 2);
const SEATED_ROW = E('坐姿划船', 'Seated Cable Rows', '背闊肌、上背', 2);
const DB_ROW     = E('單臂啞鈴划船', 'One-Arm Dumbbell Row', '背闊肌', 2);
const EZ_CURL    = E('EZ Bar 彎舉', 'EZ-Bar Curl', '肱二頭肌', 3);

// 核心
const PLANK      = E('Plank', 'Plank', '核心抗伸展', 3);
const DEADBUG    = E('死蟲式', 'Dead Bug', '核心抗伸展', 3);
const BIRDDOG    = E('Bird Dog', 'Bird Dog', '核心抗旋轉', 3);
const SIDE_BR    = E('側棒式', 'Side Bridge', '側鏈穩定', 3);
const CABLE_CR   = E('繩索捲腹', 'Cable Crunch', '腹直肌', 3);

/* ── 技術檢查點（新手每次訓練都顯示）───────────────────────────── */
const CUE = {
    squat: '槓放斜方不是脖子；膝蓋與腳尖同方向；蹲到大腿低於水平；下背全程中立',
    bench: '肩胛後收下壓、胸挺起；槓落乳頭線；手肘約 45 度不外開；腳踩實地面',
    rdl:   '髖往後推不是腰往下彎；膝蓋微彎後固定；槓貼大腿滑；感覺在腿後不在下背',
    dl:    '起槓前脛骨貼槓；憋氣把背拉緊「再」離地；髖與肩同時上升；每下放回地面重設',
    ohp:   '肋骨往下收，不要用腰反弓借力；手肘在手腕正下方',
    front: '手肘抬高、槓靠三角肌前束；掉手肘就是太重了',
};

/* ── 八週進程表 ───────────────────────────────────────────────── */
// phase: 技術建立 → 容量累積 → 強度突破 → 減量與驗收
const BEGINNER_PROG = [
    { w: 1, name: '技術建立期', sets: 3, main: 12, aux: 12, rest: 90,  rpe: 'RPE 6',   swap: true,  hinge: 'rdl' },
    { w: 2, name: '技術建立期', sets: 3, main: 12, aux: 12, rest: 90,  rpe: 'RPE 6',   swap: true,  hinge: 'rdl' },
    { w: 3, name: '首次上槓鈴', sets: 3, main: 8,  aux: 10, rest: 120, rpe: 'RPE 6',   swap: false, hinge: 'rdl' },
    { w: 4, name: '容量累積期', sets: 3, main: 8,  aux: 10, rest: 120, rpe: 'RPE 7',   swap: false, hinge: 'rdl' },
    { w: 5, name: '強度突破期', sets: 3, main: 8,  aux: 10, rest: 120, rpe: 'RPE 7–8', swap: false, hinge: 'dl'  },
    { w: 6, name: '強度突破期', sets: 3, main: 8,  aux: 10, rest: 120, rpe: 'RPE 8',   swap: false, hinge: 'dl'  },
    { w: 7, name: '主動恢復期', sets: 2, main: 5,  aux: 10, rest: 120, rpe: 'RPE 5–6', swap: false, hinge: 'dl'  },
    { w: 8, name: '驗收週',     sets: 3, main: 5,  aux: 10, rest: 150, rpe: 'RPE 8',   swap: false, hinge: 'dl'  },
];

const INTER_PROG = [
    { w: 1, name: '技術建立期', t1: 3, main: 8, aux: 10, iso: 15, rest: 150, rpe: 'RPE 7' },
    { w: 2, name: '技術建立期', t1: 3, main: 8, aux: 10, iso: 15, rest: 150, rpe: 'RPE 7' },
    { w: 3, name: '容量累積期', t1: 4, main: 8, aux: 10, iso: 12, rest: 180, rpe: 'RPE 8' },
    { w: 4, name: '容量累積期', t1: 4, main: 8, aux: 10, iso: 12, rest: 180, rpe: 'RPE 8' },
    { w: 5, name: '強度突破期', t1: 4, main: 6, aux: 10, iso: 12, rest: 180, rpe: 'RPE 8–9' },
    { w: 6, name: '強度突破期', t1: 4, main: 6, aux: 10, iso: 12, rest: 180, rpe: 'RPE 9' },
    { w: 7, name: '主動恢復期', t1: 3, main: 5, aux: 10, iso: 12, rest: 150, rpe: 'RPE 5–6' },
    { w: 8, name: '驗收週',     t1: 3, main: 3, aux: 10, iso: 12, rest: 210, rpe: 'RPE 9' },
];

const ADV_PROG = [
    { w: 1, name: '技術建立期', t1: 4, heavy: 4, mid: 8, aux: 10, iso: 15, rest: 210, rpe: 'RPE 7' },
    { w: 2, name: '技術建立期', t1: 4, heavy: 4, mid: 8, aux: 10, iso: 15, rest: 210, rpe: 'RPE 7' },
    { w: 3, name: '容量累積期', t1: 5, heavy: 3, mid: 8, aux: 10, iso: 12, rest: 240, rpe: 'RPE 8' },
    { w: 4, name: '容量累積期', t1: 5, heavy: 3, mid: 8, aux: 10, iso: 12, rest: 240, rpe: 'RPE 8' },
    { w: 5, name: '強度突破期', t1: 5, heavy: 2, mid: 6, aux: 10, iso: 12, rest: 240, rpe: 'RPE 9' },
    { w: 6, name: '強度突破期', t1: 5, heavy: 2, mid: 6, aux: 10, iso: 12, rest: 240, rpe: 'RPE 9' },
    { w: 7, name: '主動恢復期', t1: 3, heavy: 3, mid: 6, aux: 10, iso: 12, rest: 180, rpe: 'RPE 5' },
    { w: 8, name: '驗收週',     t1: 3, heavy: 1, mid: 6, aux: 10, iso: 12, rest: 300, rpe: 'RPE 10（需保護者）' },
];

/* ── 訓練日模板 ───────────────────────────────────────────────── */
const beginnerDays = (p) => {
    /* ── 新手＝每週 2 天（2026-09 改版）──────────────────────────────
       原本是 A 深蹲日／B 硬舉日／C 臥推日，一週 3 天。改成 2 天，理由是
       新手階段真正的瓶頸是「有沒有去練」，不是週容量：一週 3 天只要漏掉一天
       就變成 67% 完成率，兩天漏一天還有 50%，而且兩天之間固定隔 72 小時，
       痠痛不會把下一堂吃掉。三大項照樣每週各練一次，八週的線性加重不變。

       兩天各自都是全身，六個動作模式一週全部蓋到一次以上：
         A：蹲（squat）· 水平推（bench）· 水平拉（row）· 垂直推（OHP）
         B：髖鉸鏈（RDL→硬舉）· 垂直拉（下拉）· 上斜推 · 膝主導輔助（腿推）
       核心兩天都有，各練不同面向（抗伸展／抗旋轉）。 */
    const sq   = p.swap ? GOBLET(p.sets, p.main, p.rest, CUE.squat) : BB_SQUAT(p.sets, p.main, p.rest, CUE.squat);
    const bp   = p.swap ? DB_BENCH(p.sets, p.main, p.rest, CUE.bench) : BB_BENCH(p.sets, p.main, p.rest, CUE.bench);
    const hinge = p.hinge === 'dl'
        ? DEADLIFT(p.sets, Math.min(p.main, 5), p.rest, CUE.dl)
        : RDL(p.sets, p.main, p.rest, CUE.rdl);
    const swapNote = p.swap ? '本週用啞鈴／機械版本建立動作模式，第 3 週才上槓鈴' : undefined;

    return [
        {
            dayNumber: 1, focus: 'A｜深蹲與臥推日', time: 45, intensity: p.rpe,
            exercises: [
                { ...sq, ...(swapNote ? { note: `${CUE.squat}｜${swapNote}` } : {}) },
                { ...bp, ...(swapNote ? { note: `${CUE.bench}｜${swapNote}` } : {}) },
                SEATED_ROW(p.sets, p.aux, 75, '拉到肋骨下緣；肩胛先動，手臂才動'),
                DB_OHP(p.sets, p.aux, 75, CUE.ohp),
                PLANK(p.sets, 30, 45, '單位為秒。腰不要塌也不要翹'),
            ],
        },
        {
            dayNumber: 2, focus: 'B｜硬舉與背部日', time: 45, intensity: p.rpe,
            exercises: [
                hinge,
                LAT_PULL(p.sets, p.aux, 90, '拉到鎖骨不是拉到肚子'),
                INC_DB(p.sets, p.aux, 90, '椅背約 30 度；太斜會變成練肩'),
                LEG_PRESS(p.sets, p.aux + 2, 90, '腳掌放高一點＝髖主導；膝蓋不鎖死'),
                DEADBUG(p.sets, 10, 45, '每邊 10 下。腰緊貼地面'),
            ],
        },
    ];
};

const interDays = (p) => ([
    {
        dayNumber: 1, focus: 'D1 下肢 A｜深蹲主導', time: 55, intensity: p.rpe,
        exercises: [
            BB_SQUAT(p.t1, p.main, p.rest, CUE.squat),
            RDL(3, p.aux - 2, 120, CUE.rdl),
            LEG_PRESS(3, p.aux, 90),
            LEG_CURL(3, p.iso, 75),
            PLANK(3, 45, 45, '單位為秒'),
        ],
    },
    {
        dayNumber: 2, focus: 'D2 上肢 A｜臥推主導 · 水平推拉', time: 54, intensity: p.rpe,
        exercises: [
            BB_BENCH(p.t1, p.main, p.rest, CUE.bench),
            BB_ROW(p.t1, p.aux - 2, 120, '軀幹 45 度、下背中立；下背先痠就降重量'),
            DB_OHP(3, p.aux, 90, CUE.ohp),
            LAT_PULL(3, p.aux, 90),
            PUSHDOWN(3, p.iso, 60),
        ],
    },
    {
        dayNumber: 3, focus: 'D4 下肢 B｜硬舉主導 · 髖鉸鏈 ＋ 單腿', time: 55, intensity: p.rpe,
        exercises: [
            DEADLIFT(Math.min(p.t1, 4), Math.max(p.main - 2, 3), p.rest, CUE.dl),
            FRONT_SQ(3, p.aux - 2, 120, `${CUE.front}｜硬舉之後請保守，下背已經吃過一輪`),
            BULGARIAN(3, p.aux, 90, '每邊。前腳掌全貼地、重心壓前腳跟'),
            CALF(3, p.iso, 60),
            DEADBUG(3, 12, 45, '每邊 12 下'),
        ],
    },
    {
        dayNumber: 4, focus: 'D5 上肢 B｜肩推主導 · 垂直推拉', time: 54, intensity: p.rpe,
        exercises: [
            BB_OHP(p.t1, p.main, p.rest, CUE.ohp),
            PULLUP(p.t1, p.aux - 2, 120, '做不到就用下拉遞補，不要用甩的'),
            INC_BB(3, p.aux - 2, 120),
            SEATED_ROW(3, p.aux, 90),
            EZ_CURL(3, p.iso, 60),
        ],
    },
]);

const advDays = (p) => ([
    {
        dayNumber: 1, focus: 'D1 下肢重｜力量 · 深蹲最大強度', time: 68, intensity: p.rpe,
        exercises: [
            BB_SQUAT(p.t1, p.heavy, p.rest, `${CUE.squat}｜組間 4 分鐘不是浪費，是這個強度區間的必要條件`),
            RDL(4, p.mid - 2, 150, CUE.rdl),
            LEG_PRESS(3, p.aux, 90),
            LEG_CURL(3, p.iso, 75),
            CABLE_CR(3, p.iso, 60),
        ],
    },
    {
        dayNumber: 2, focus: 'D2 上肢重｜力量 · 臥推最大強度', time: 70, intensity: p.rpe,
        exercises: [
            BB_BENCH(p.t1, p.heavy, p.rest, CUE.bench),
            BB_ROW(4, p.mid - 2, 150),
            BB_OHP(3, p.mid, 120, CUE.ohp),
            NEUTRAL_PD(3, p.aux, 90),
            CLOSE_GRIP(3, p.aux, 90, '手肘收在體側不外開'),
        ],
    },
    {
        dayNumber: 3, focus: 'D4 下肢中｜肥大 ＋ 硬舉 · 弱環節', time: 68, intensity: p.rpe,
        exercises: [
            DEADLIFT(4, Math.max(p.heavy + 1, 2), p.rest, `${CUE.dl}｜組數上限 4 組，這是全課唯一的硬性上限；不做遞減、不做 RPE 9.5`),
            FRONT_SQ(4, p.mid, 150, CUE.front),
            BULGARIAN(3, p.aux, 90, '每邊'),
            CALF(4, p.iso, 60),
            SIDE_BR(3, 45, 45, '每邊 45 秒'),
        ],
    },
    {
        dayNumber: 4, focus: 'D5 上肢中｜肥大 · 上斜推 ＋ 垂直拉', time: 64, intensity: p.rpe,
        exercises: [
            INC_BB(4, p.mid, 150),
            PULLUP(4, p.mid, 120, '做不到 8 下用下拉遞補'),
            DB_OHP(3, p.aux, 90, CUE.ohp),
            SEATED_ROW(3, p.iso, 90),
            EZ_CURL(3, p.iso, 60),
        ],
    },
]);

/* ── 週生成器 ─────────────────────────────────────────────────── */
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
    days: withCalendarDays(dayFn(p), p.name).map(d => ({ ...d, weekPhase: p.name })),
}));

/* ═══════════════════════════════════════════════════════════════
   IRON BASE PLAN
═══════════════════════════════════════════════════════════════ */
export const IRON_BASE_PLAN = {
    id: 'iron-base-56',
    name: '全身力量基礎',
    subtitle: '深蹲、臥推、硬舉，八週打好底',
    bodyPart: 'full_body_strength',
    bodyPartLabel: '全身力量',
    duration: 56,
    coverImage: '/desktop/Gemini_Generated_Image_i9cnrki9cnrki9cn.png',
    description: '用深蹲、臥推、硬舉三個動作打底，前兩週先用啞鈴和機械把動作做對，第三週才上槓鈴。八週後你會知道自己能舉多重。',
    tags: ['三大項', '每週加一點重量', '適合新手', '八週不換動作'],
    isCourse: true,
    courseSystem: 'strength',

    levels: {
        beginner: {
            key: 'beginner',
            label: '新手',
            labelEn: 'Beginner',
            recommendedDays: 2,
            recommendedDaysLabel: '每週 2 天，第 1 天與第 4 天，中間隔 72 小時',
            durationPerSession: '40-45',
            equipment: ['啞鈴', '機械', '槓鈴（第 3 週起）', '深蹲架', '臥推椅'],
            targetArea: '全身（股四頭、臀、腿後、胸、背、肩、核心）',
            intensity: '低至中等（RPE 6–8）',
            expectedGain: '三大項工作重量 +20~50%、能獨立完成深蹲臥推硬舉各 5 下',
            benefits: [
                '一週只要排兩天，中間隔 72 小時 —— 漏一天也還有一半，這個階段練得完比練得多重要',
                '兩天都是全身，三大項每週各練一次，六種動作模式一次不漏',
                '前兩週不碰槓鈴，先用啞鈴與機械把動作做對再加載',
            ],
            periodization: {
                phase1: { name: '技術建立', weeks: '第 1–2 週', focus: '啞鈴與機械版本，先學動作不學重量', reps: '12 次', intensity: 'RPE 6' },
                phase2: { name: '首次上槓鈴', weeks: '第 3–4 週', focus: '槓鈴起始重量刻意保守，開始每次加重', reps: '8 次', intensity: 'RPE 6–7' },
                phase3: { name: '強度突破', weeks: '第 5–6 週', focus: '傳統硬舉登場；線性加重（下肢 +5kg、上肢 +2.5kg）', reps: '8 次（硬舉 5 次）', intensity: 'RPE 7–8' },
                phase4: { name: '減量與驗收', weeks: '第 7–8 週', focus: 'W7 卸疲勞不加重；W8 測三大項 5RM', reps: '5 次', intensity: 'RPE 5–6 → 8' },
            },
            weeks: buildWeeks(BEGINNER_PROG, beginnerDays),
        },

        intermediate: {
            key: 'intermediate',
            label: '中階',
            labelEn: 'Intermediate',
            recommendedDays: 4,
            recommendedDaysLabel: '建議每週 4 天（第 1／2／4／5 天）',
            durationPerSession: '45-55',
            equipment: ['槓鈴', '深蹲架', '臥推椅', '繩索', '機械'],
            targetArea: '全身，上下肢分化',
            intensity: '中等至高（RPE 7–9）',
            expectedGain: '三大項 3RM 合計 +8~15%、能承受深蹲 4×8 @RPE 8 而不影響隔日上肢',
            benefits: [
                '上下肢交錯排程，同部位固定 72 小時恢復',
                '硬舉與大重量深蹲間隔 72 小時，下背不會被連續轟炸',
                '每個動作模式維持 2 次／週，同時單次容量加倍',
            ],
            periodization: {
                phase1: { name: '技術建立', weeks: '第 1–2 週', focus: '固定姿勢，重量保守', reps: '8 次', intensity: 'RPE 7' },
                phase2: { name: '容量累積', weeks: '第 3–4 週', focus: '組數補滿；次數做滿且 RPE≤8 就加重', reps: '8 次', intensity: 'RPE 8' },
                phase3: { name: '強度突破', weeks: '第 5–6 週', focus: '次數下修、負荷上修；輔助不追強度', reps: '6 次', intensity: 'RPE 8–9' },
                phase4: { name: '減量與驗收', weeks: '第 7–8 週', focus: 'W7 容量降 60%；W8 測三大項 3RM', reps: '5 → 3 次', intensity: 'RPE 5–6 → 9' },
            },
            weeks: buildWeeks(INTER_PROG, interDays),
        },

        advanced: {
            key: 'advanced',
            label: '精熟',
            labelEn: 'Advanced',
            recommendedDays: 4,
            recommendedDaysLabel: '建議每週 4 天（第 1／2／4／5 天）',
            durationPerSession: '55-70',
            equipment: ['槓鈴', '深蹲架', '安全槓或保護者', '繩索', '機械'],
            targetArea: '全身，上下肢分化 ＋ 週內強度波動（DUP）',
            intensity: '高（RPE 7–9；驗收週除外）',
            expectedGain: '三大項 1RM 合計 +2~5%、弱環節 +5~10%、淨肌肉 +0.25~0.75 kg',
            benefits: [
                '週內波動讓力量與肥大兩種刺激並存，不互相排擠',
                '弱環節（前蹲、窄握臥推、引體）有專屬的中強度日',
                '硬舉維持 1 次／週、組數上限 4 組 — 訓練年齡越高越要省著用',
            ],
            periodization: {
                phase1: { name: '技術建立', weeks: '第 1–2 週', focus: '重日 4 次、中日 8 次，先把節奏建立', reps: '4 / 8 次', intensity: 'RPE 7' },
                phase2: { name: '容量累積', weeks: '第 3–4 週', focus: '重日升至 5 組，容量峰值', reps: '3 / 8 次', intensity: 'RPE 8' },
                phase3: { name: '強度突破', weeks: '第 5–6 週', focus: '重日進入 2 次區間；硬舉不追 RPE 9.5', reps: '2 / 6 次', intensity: 'RPE 9' },
                phase4: { name: '減量與驗收', weeks: '第 7–8 週', focus: 'W7 卸疲勞；W8 測 1RM，無保護者請改測 3RM', reps: '3 → 1 次', intensity: 'RPE 5 → 10' },
            },
            weeks: buildWeeks(ADV_PROG, advDays),
        },
    },
};

export default IRON_BASE_PLAN;
