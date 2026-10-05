// ════════════════════════════════════════════════════════════════════════
//  runnersArmorPlanData.js — 課程 03｜跑者護甲（RUNNER'S ARMOR）
//
//  設計文件：課程改版_設計文件/03-跑者護甲.md
//  ─ 使用者「已經在跑了」，缺的是重訓。目標不是變壯，是不受傷 ＋ 跑更快
//  ─ 這是「加掛」課程：重訓繞著使用者既有的跑步課表排，不搶跑步的位置
//    → days[] 只含重訓；跑步端不寫入，由使用者原本的跑步課表負責
//  ─ 選動作標準：單腿／不對稱優先、後鏈優先、核心練抗動作、
//    小腿與跟腱有計畫、刻意避免大量離心（DOMS 會毀掉隔天的跑）
//  ─ 精熟的總場次比中階「少」不是筆誤：週跑量越高，重訓的可用額度越少
//
//  ⚠ 動作名稱與 nameEn 必須與 EXERCISE_MASTER_DB 逐字一致。
// ════════════════════════════════════════════════════════════════════════

const E = (name, nameEn, target, tier) => (s, r, rest, note) => ({
    name, nameEn, target, tier, sets: s, reps: r, rest, ...(note ? { note } : {}),
});

const GOBLET     = E('高腳杯深蹲', 'Goblet Squat', '股四頭、臀', 2);
const RDL        = E('羅馬尼亞硬舉', 'Romanian Deadlift', '腿後、臀', 1);
const BULGARIAN  = E('保加利亞分腿蹲', 'Dumbbell Rear Lunge', '臀、股四頭、單腿穩定', 2);
const STEP_UP    = E('上台階', 'Step Ups', '臀大肌、臀中肌', 2);
const HIP_THRUST = E('臀推', 'Hip Thrust', '臀大肌', 2);
const SL_THRUST  = E('單腿臀推', 'Single Leg Hip Thrust', '臀大肌、臀中肌', 2);
const LEG_CURL   = E('腿彎舉', 'Lying Leg Curls', '腿後肌群', 3);
const NORDIC     = E('反向北歐腿', 'Reverse Nordic Curl', '股四頭離心控制', 3);
const CALF       = E('站姿提踵', 'Standing Calf Raises', '小腿三頭肌、跟腱', 3);
const SEAT_CALF  = E('Seated Calf Raises', 'Seated Calf Raise', '比目魚肌', 3);
const ABDUCTOR   = E('機械髖外展', 'Thigh Abductor', '臀中肌', 3);
const CLAM       = E('側躺蚌殼式', 'Clam', '臀中肌', 3);
const FARMER     = E('農夫行走', 'Farmer Walk', '軀幹剛性、握力、單邊穩定', 2);
const SEATED_ROW = E('坐姿划船', 'Seated Cable Rows', '背闊肌、上背', 3);
const LAT_PULL   = E('下拉', 'Wide-Grip Lat Pulldown', '背闊肌', 3);
const DB_OHP     = E('啞鈴肩推', 'Dumbbell Overhead Press', '三角肌前束', 3);
const PUSHUP     = E('伏地挺身', 'Pushups', '胸、三頭', 3);
const SIDE_BR    = E('側棒式', 'Side Bridge', '側鏈穩定（抗側屈）', 3);
const DEADBUG    = E('死蟲式', 'Dead Bug', '核心抗伸展', 3);
const BIRDDOG    = E('Bird Dog', 'Bird Dog', '核心抗旋轉', 3);
const WOODCHOP   = E('繩索伐木', 'Cable Russian Twists', '核心抗旋轉', 3);
const AB_WHEEL   = E('Ab Wheel Rollout', 'Ab Wheel Rollout', '核心抗伸展', 3);
const CAT_COW    = E('Cat Cow', 'Cat Cow', '脊椎活動度', 3);

const CUE = {
    rdl:  '髖往後推不是腰往下彎。這門課的 RDL 刻意不做到力竭 — 離心痠痛會毀掉隔天的跑',
    bulg: '每邊。前腳掌全貼地、重心壓前腳跟；跑步是單腿運動，這是最像跑步的重訓動作',
    calf: '全行程、頂端停 1 秒。小腿與跟腱是跑者受傷最多的地方之一，這一項不要跳過',
    step: '每邊。箱子高度到膝蓋略上；用臀把身體推上去，不要用後腳蹬地借力',
    farm: '每趟 40 公尺。肩膀下沉、肋骨收好、走直線 — 練的是跑步時的軀幹剛性',
    side: '每邊。核心練的是「抗動作」不是捲腹 — 跑步時你的核心工作是不讓骨盆亂晃',
    nrd:  '離心控制，慢慢往後倒。做不到全程就縮小角度，膝蓋不適立刻停',
};

const NO_TRAIN = '落位規則：本次重訓不要排在「質量跑（節奏／間歇）的前一天」，也不要排在「長跑的隔天」。重訓後至少隔 6 小時再跑；跑完至少隔 4 小時再重訓';

/* ── 六週進程 ─────────────────────────────────────────────────
   本課程刻意「不追強度」：RPE 上限比其他課低，且不做力竭組。 */
const PROG = (level) => {
    const names = ['技術建立期', '技術建立期', '容量累積期', '容量累積期', '賽前收量期', '賽前收量期'];
    const rpes = {
        beginner: ['RPE 6', 'RPE 6–7', 'RPE 7', 'RPE 7', 'RPE 7', 'RPE 5–6'],
        inter:    ['RPE 6–7', 'RPE 7', 'RPE 7–8', 'RPE 8', 'RPE 7', 'RPE 5–6'],
        advanced: ['RPE 7', 'RPE 7–8', 'RPE 8', 'RPE 8', 'RPE 7', 'RPE 5'],
    }[level];
    // 每週訓練天數 —— 跑量越高，重訓額度越少（精熟遞減最快）
    const dayCount = {
        beginner: [2, 2, 2, 2, 2, 2],   // 合計 12 次
        inter:    [3, 3, 3, 3, 2, 2],   // 合計 16 次
        advanced: [3, 3, 3, 2, 2, 1],   // 合計 14 次
    }[level];
    const scales = ['minus1', 1, 1, 1, 1, 'two'];
    return names.map((n, i) => ({
        w: i + 1, name: n, rpe: rpes[i], scale: scales[i], days: dayCount[i],
        addFarmer: i >= 2,          // 第 3 週換入農夫行走
        nordic: level === 'advanced' && i >= 1 && i <= 3, // 精熟 W2–W4 才做反向北歐腿
    }));
};

const S = (base, p) => {
    if (p.scale === 'two') return 2;
    if (p.scale === 'minus1') return Math.max(2, base - 1);
    return base;
};

/* ── 訓練日模板（依當週 p.days 取前 N 天）────────────────────── */
const beginnerDays = (p) => ([
    {
        dayNumber: 1, focus: 'A｜單腿與臀 · 骨盆穩定', time: p.w === 6 ? 22 : 32, intensity: p.rpe,
        exercises: [
            GOBLET(S(3, p), 10, 75, '站距略寬於肩；蹲到大腿低於水平'),
            SL_THRUST(S(3, p), 10, 60, '每邊。頂端夾臀停 1 秒，腰不要反弓'),
            CALF(S(3, p), 15, 60, CUE.calf),
            DEADBUG(S(3, p), 10, 45, '每邊 10 下'),
        ],
        note: NO_TRAIN,
    },
    {
        dayNumber: 2, focus: 'B｜後鏈與抗旋轉', time: p.w === 6 ? 22 : 35, intensity: p.rpe,
        exercises: [
            RDL(S(3, p), 10, 75, CUE.rdl),
            STEP_UP(S(3, p), 10, 60, CUE.step),
            ...(p.addFarmer ? [FARMER(S(3, p), 40, 75, CUE.farm)] : []),
            SIDE_BR(S(3, p), 30, 45, CUE.side),
            ...(p.w === 6 ? [CAT_COW(2, 8, 30, '低負荷收尾，賽前一週把活動度顧好')] : [BIRDDOG(S(3, p), 8, 45, '每邊 8 下')]),
        ],
        note: NO_TRAIN,
    },
]);

const interDays = (p) => ([
    {
        dayNumber: 1, focus: 'A｜單腿與臀 · 最像跑步的一天', time: p.w >= 5 ? 30 : 42, intensity: p.rpe,
        exercises: [
            BULGARIAN(S(3, p), 8, 90, CUE.bulg),
            HIP_THRUST(S(3, p), 10, 90, '頂端夾臀停 1 秒；這是低離心動作，隔天不該痠'),
            CALF(S(4, p), 12, 60, CUE.calf),
            WOODCHOP(S(3, p), 12, 60, '每邊 12 下。抗旋轉'),
        ],
        note: NO_TRAIN,
    },
    {
        dayNumber: 2, focus: 'B｜後鏈 · 腿後兩個功能都練', time: p.w >= 5 ? 30 : 42, intensity: p.rpe,
        exercises: [
            RDL(S(3, p), 8, 120, CUE.rdl),
            STEP_UP(S(3, p), 10, 75, CUE.step),
            LEG_CURL(S(3, p), 12, 60, '腿後有伸髖與屈膝兩個功能，RDL 只練到前者'),
            SIDE_BR(S(3, p), 40, 45, CUE.side),
        ],
        note: NO_TRAIN,
    },
    {
        dayNumber: 3, focus: 'C｜臀中肌與軀幹剛性（W5 起移除）', time: 38, intensity: p.rpe,
        exercises: [
            GOBLET(S(3, p), 10, 75),
            ABDUCTOR(S(3, p), 15, 60, '軀幹微前傾約 15 度'),
            ...(p.addFarmer ? [FARMER(S(3, p), 40, 75, CUE.farm)] : [CLAM(S(3, p), 20, 45, '每邊 20 下')]),
            ...(p.addFarmer ? [PUSHUP(S(3, p), 12, 60, '上半身比重低，但軀幹剛性與手臂擺動需要它')] : []),
            DEADBUG(S(3, p), 12, 45, '每邊 12 下'),
        ],
        note: `${NO_TRAIN}｜這是三天中最容易被犧牲的一天：跑量吃緊時優先砍它`,
    },
]);

const advDays = (p) => ([
    {
        dayNumber: 1, focus: 'A｜單腿與臀 · 高負荷低容量', time: p.w >= 5 ? 28 : 45, intensity: p.rpe,
        exercises: [
            BULGARIAN(S(4, p), 6, 120, CUE.bulg),
            HIP_THRUST(S(4, p), 6, 120, '低離心、可加重 — 精熟跑者的力量主指標'),
            CALF(S(4, p), 10, 75, CUE.calf),
            AB_WHEEL(S(3, p), 10, 60, '抗伸展；下背一有感覺就縮小行程'),
        ],
        note: NO_TRAIN,
    },
    {
        dayNumber: 2, focus: 'B｜後鏈 · 離心控制（W5 起移除反向北歐腿）', time: p.w >= 5 ? 28 : 45, intensity: p.rpe,
        exercises: [
            RDL(S(4, p), 6, 150, CUE.rdl),
            STEP_UP(S(3, p), 8, 90, `${CUE.step}｜可用爆發性執行（快上慢下）替代跳箱 — 動作庫沒有 plyometric，這是最接近的替代`),
            ...(p.nordic ? [NORDIC(S(3, p), 6, 90, CUE.nrd)] : []),
            SEAT_CALF(S(3, p), 15, 60, '坐姿版本打比目魚肌 — 站姿提踵打不到的那一半'),
            SIDE_BR(S(3, p), 45, 45, CUE.side),
        ],
        note: NO_TRAIN,
    },
    {
        dayNumber: 3, focus: 'C｜軀幹剛性與上半身（W4 起移除）', time: 40, intensity: p.rpe,
        exercises: [
            FARMER(S(4, p), 40, 90, CUE.farm),
            ABDUCTOR(S(3, p), 15, 60, '軀幹微前傾約 15 度'),
            SEATED_ROW(S(3, p), 10, 90, '上半身比重低，但手臂擺動需要背'),
            LAT_PULL(S(3, p), 10, 75),
            WOODCHOP(S(3, p), 12, 60, '每邊 12 下'),
        ],
        note: `${NO_TRAIN}｜跑量 >45 km 時這一天最先被砍，第 4 週起自動移除`,
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

const buildWeeks = (prog, dayFn) => prog.map(p => ({
    weekNumber: p.w,
    name: `${p.name}（重訓 ${p.days} 次）`,
    days: withCalendarDays(dayFn(p).slice(0, p.days), p.name).map(d => ({ ...d, weekPhase: p.name })),
}));

/* ═══════════════════════════════════════════════════════════════ */
export const RUNNERS_ARMOR_PLAN = {
    id: 'runners-armor-42',
    name: '跑者肌力',
    subtitle: '已經在跑了，補上不受傷的肌力',
    bodyPart: 'runner_strength',
    bodyPartLabel: '跑者專用力量',
    duration: 42,
    coverImage: '/desktop/back_portrait.png',
    description: '給已經有在跑步的人。重訓繞著你原本的跑步課表排，每週 2–3 次、每次 30–45 分鐘，目標是不受傷和跑更快，不是變壯。',
    tags: ['給有在跑的人', '預防受傷', '單腳穩定', '不影響跑步'],
    isCourse: true,
    courseSystem: 'hybrid',
    hybridNote: '本課程只寫入重訓（days[]）。跑步由使用者既有的跑步課表負責 —— 不要為了「看起來像混合課程」而補上跑步磚，補上去就變成取代使用者的跑步課表，那是另一門課。落位規則見各日 note。',

    levels: {
        beginner: {
            key: 'beginner',
            label: '新手',
            labelEn: 'Beginner',
            recommendedDays: 2,
            recommendedDaysLabel: '每週 2 次重訓（六週固定）',
            durationPerSession: '22-35',
            equipment: ['可調啞鈴', '穩固箱子或階梯', '彈力帶'],
            targetArea: '臀大肌、臀中肌、腿後、小腿與跟腱、抗動作核心',
            intensity: '低（RPE 6–7，不做力竭組）',
            expectedGain: '單腿站立骨盆穩定、跑姿末段不再塌髖、常見過用不適的發生率下降',
            benefits: [
                '每週只佔用 2 個時段、每次 35 分鐘以內，不會排擠你的跑步',
                '刻意不做力竭 — 這門課的第一約束是「隔天還跑得動」',
                '小腿與跟腱有專屬處方，那是跑者受傷最多的地方之一',
            ],
            periodization: {
                phase1: { name: '技術建立', weeks: '第 1–2 週', focus: '學動作、建立單腿穩定，重量刻意輕', reps: '10 次', intensity: 'RPE 6–7' },
                phase2: { name: '容量累積', weeks: '第 3–4 週', focus: '換入農夫行走；組數補滿', reps: '10 次', intensity: 'RPE 7' },
                phase3: { name: '維持期', weeks: '第 5 週', focus: '維持不加量 — 這時候你的跑量通常正在爬', reps: '10 次', intensity: 'RPE 7' },
                phase4: { name: '收量週', weeks: '第 6 週', focus: '每動作 2 組、換入活動度收尾；若有比賽這週就是 taper', reps: '10 次', intensity: 'RPE 5–6' },
            },
            weeks: buildWeeks(PROG('beginner'), beginnerDays),
        },

        intermediate: {
            key: 'intermediate',
            label: '中階',
            labelEn: 'Intermediate',
            recommendedDays: 3,
            recommendedDaysLabel: '每週 3 次（第 5 週起降為 2 次）',
            durationPerSession: '30-42',
            equipment: ['槓鈴', '啞鈴', '臀推架', '髖外展機', '腿彎舉機', '箱子'],
            targetArea: '臀大肌、臀中肌、腿後（伸髖與屈膝）、小腿、抗動作核心',
            intensity: '中等（RPE 6–8，不做力竭組）',
            expectedGain: '單腿力量對稱、跑步經濟性改善、長跑後段掉速幅度縮小',
            benefits: [
                '週跑量 20–45 km 的跑者設計；第 5 週起自動降為 2 次，替跑量讓路',
                '腿後的兩個功能（伸髖與屈膝）都有動作，RDL 之外還有腿彎舉',
                'C 日是刻意設計成「可犧牲」的一天 — 跑量吃緊時優先砍它',
            ],
            periodization: {
                phase1: { name: '技術建立', weeks: '第 1–2 週', focus: '建立單腿模式，重量保守', reps: '8–10 次', intensity: 'RPE 6–7' },
                phase2: { name: '容量累積', weeks: '第 3–4 週', focus: '換入農夫行走與伏地挺身；組數補滿', reps: '8–10 次', intensity: 'RPE 7–8' },
                phase3: { name: '收量期', weeks: '第 5 週', focus: 'C 日移除，剩 2 次；強度維持、容量下降', reps: '8–10 次', intensity: 'RPE 7' },
                phase4: { name: '賽前 taper', weeks: '第 6 週', focus: '每動作 2 組；有比賽就把這週當 taper 週', reps: '8–10 次', intensity: 'RPE 5–6' },
            },
            weeks: buildWeeks(PROG('inter'), interDays),
        },

        advanced: {
            key: 'advanced',
            label: '精熟',
            labelEn: 'Advanced',
            recommendedDays: 3,
            recommendedDaysLabel: '每週 3 次遞減至 1 次（3／3／3／2／2／1）',
            durationPerSession: '28-45',
            equipment: ['槓鈴', '啞鈴', '臀推架', '髖外展機', '繩索', '箱子'],
            targetArea: '同中階，負荷更高、容量更低',
            intensity: '高負荷低容量（RPE 7–8，絕不力竭）',
            expectedGain: '在 peak week 期間維持力量不流失、地面接觸時間縮短、賽前不帶著重訓疲勞上場',
            benefits: [
                '週跑量 >45 km 的備賽跑者設計：總場次比中階「少」是處方的一部分',
                '負荷高、次數低（6 次區間），用強度維持力量而不製造疲勞',
                '第 4 週起 C 日移除、第 6 週只剩 1 次 — 跑量的優先級永遠高於重訓',
            ],
            periodization: {
                phase1: { name: '技術建立', weeks: '第 1–2 週', focus: '3 次／週；W2 換入反向北歐腿', reps: '6–8 次', intensity: 'RPE 7–8' },
                phase2: { name: '容量累積', weeks: '第 3 週', focus: '本課唯一的容量峰值，之後只減不加', reps: '6–8 次', intensity: 'RPE 8' },
                phase3: { name: '收量期', weeks: '第 4–5 週', focus: 'C 日移除；W5 起反向北歐腿完全移除', reps: '6–8 次', intensity: 'RPE 7–8' },
                phase4: { name: '賽前 taper', weeks: '第 6 週', focus: '只剩 1 次、每動作 2 組。賽前一週的重訓只為了「不掉」', reps: '6 次', intensity: 'RPE 5' },
            },
            weeks: buildWeeks(PROG('advanced'), advDays),
        },
    },
};

export default RUNNERS_ARMOR_PLAN;
