// ════════════════════════════════════════════════════════════════════════
//  vTaperPlanData.js — 課程 04｜型男套裝：上半身黃金比例（V-TAPER SUIT）
//  取代原 shoulderArmPlanData / chestPlanData / backPlanData 三張卡
//  （data 檔保留供融合功能與 globalExerciseRegistry 動作索引使用）
//
//  設計文件：課程改版_設計文件/04-型男套裝.md
//  ─ 核心論點：V-taper 是「肩寬 ÷ 腰圍」的比值，不是一堆部位
//  ─ 容量優先級：三角肌中束 與 背闊肌 拿最大預算；胸刻意設在 MEV 上緣
//  ─ 刻意不做：上斜方（聳肩）、腹斜肌、前平舉 — 三者都會讓比值變差
//  ─ 新手 全上肢 A/B/C 3 天／中階與精熟 推A・拉A・推B・拉B 4 天
//
//  ⚠ 動作名稱與 nameEn 必須與 EXERCISE_MASTER_DB 逐字一致。
// ════════════════════════════════════════════════════════════════════════

const E = (name, nameEn, target, tier) => (s, r, rest, note, extra) => ({
    name, nameEn, target, tier, sets: s, reps: r, rest,
    ...(note ? { note } : {}), ...(extra || {}),
});

/* ── 肩 ── */
const BB_OHP     = E('槓鈴肩推', 'Barbell Overhead Press', '三角肌前束、核心', 1);
const DB_OHP     = E('啞鈴肩推', 'Dumbbell Overhead Press', '三角肌前束、中束', 2);
const MACH_OHP   = E('機械肩推', 'Machine Shoulder Press', '三角肌前束', 2);
const DB_LAT     = E('啞鈴側平舉', 'Side Lateral Raise', '三角肌中束', 3);
const CAB_LAT    = E('繩索側平舉', 'Cable Lateral Raise', '三角肌中束', 3);
const FACE_PULL  = E('繩索面拉', 'Face Pull', '三角肌後束、中下斜方', 3);
const REV_CAB_FLY= E('反向繩索飛鳥', 'Reverse Cable Crossover', '三角肌後束', 3);
const BAND_APART = E('Band Pull Apart', 'Band Pull Apart', '三角肌後束、上背', 3);
const BAND_FACE  = E('Band Face Pull', 'Band Face Pull', '三角肌後束、中下斜方', 3);

/* ── 背 ── */
const WIDE_PULLUP= E('寬握引體', 'Wide-Grip Pull-Up', '背闊肌', 1);
const LAT_PULL   = E('下拉', 'Wide-Grip Lat Pulldown', '背闊肌', 1);
const NEUTRAL_PD = E('對握下拉', 'Neutral Grip Lat Pulldown', '背闊肌', 2);
const BB_ROW     = E('槓鈴划船', 'Bent Over Barbell Row', '背闊肌、上背', 1);
const T_BAR      = E('T槓划船', 'T-Bar Row with Handle', '背闊肌、上背', 2);
const SEATED_ROW = E('坐姿划船', 'Seated Cable Rows', '背闊肌、上背', 2);
const CHEST_SUPP = E('俯臥支撐划船', 'Chest Supported Row', '上背、背闊肌', 2);
const DB_ROW     = E('單臂啞鈴划船', 'One-Arm Dumbbell Row', '背闊肌', 2);
const STRAIGHT   = E('直臂下拉', 'Straight-Arm Pulldown', '背闊肌', 3);
const BAND_ROW   = E('Band Row', 'Band Row', '背闊肌、上背', 3);

/* ── 胸 ── */
const INC_BB     = E('上斜槓鈴臥推', 'Barbell Incline Bench Press - Medium Grip', '胸大肌上部', 1);
const INC_DB     = E('上斜啞鈴推舉', 'Incline Dumbbell Press', '胸大肌上部、前束', 2);
const DB_BENCH   = E('啞鈴臥推', 'Dumbbell Bench Press', '胸大肌', 2);
const INC_PUSHUP = E('上斜伏地挺身', 'Incline Push-Up', '胸大肌', 3);
const DB_FLY     = E('啞鈴飛鳥', 'Dumbbell Flyes', '胸大肌', 3);
const CAB_FLY    = E('繩索夾胸', 'Cable Crossover', '胸大肌', 3);
const SEAT_FLY   = E('坐姿繩索夾胸', 'Seated Cable Fly', '胸大肌', 3);

/* ── 臂 ── */
const CLOSE_GRIP = E('窄握臥推', 'Close-Grip Barbell Bench Press', '肱三頭肌', 3);
const PUSHDOWN   = E('三頭肌下壓', 'Triceps Pushdown', '肱三頭肌外側頭', 3);
const OH_CABLE   = E('繩索過頭三頭伸展', 'Overhead Cable Extension', '肱三頭肌長頭', 3);
const TRI_DIPS   = E('Tricep Dips', 'Tricep Dips', '肱三頭肌', 3);
const EZ_CURL    = E('EZ Bar 彎舉', 'EZ-Bar Curl', '肱二頭肌', 3);
const HAMMER     = E('錘式彎舉', 'Hammer Curls', '肱二頭肌、肱肌', 3);
const DB_CURL    = E('啞鈴彎舉', 'Dumbbell Bicep Curl', '肱二頭肌', 3);
const CAB_CURL   = E('繩索彎舉', 'Cable Hammer Curls - Rope Attachment', '肱二頭肌、肱肌', 3);
const FACE_AWAY  = E('面向後繩索彎舉', 'Face Away Cable Curl', '肱二頭肌長頭', 3);

const SS_GAP = 15;   // 超級組組內銜接秒數

const CUE = {
    lat:  '手肘微彎固定，手腕不要高於手肘 — 高過去就是斜方在做。舉不動就是太重了，這個動作寧可輕',
    ohp:  '站姿、臀夾緊、肋骨不外翻；過不了頭就先改用啞鈴肩推',
    pull: '拉到鎖骨不是拉到肚子，最後一下在底部停 1 秒',
    row:  '軀幹 45 度、下背中立；下背先痠就降重量',
    face: '拉到眉毛高度、手肘高於手腕 — 這是全課的肩關節保養劑量',
    ss:   '超級組：A 做完休 15 秒立刻接 B，B 結束才是完整組間休息',
};

/* ── 八週進程 ─────────────────────────────────────────────────
   scale: 該週的組數係數；comp/iso: 複合與孤立的次數；tech: 強度技巧開關 */
const PROG = (level) => ([
    { w: 1, name: '技術建立期', scale: level === 'beginner' ? 'minus1' : 0.75, comp: level === 'advanced' ? 8 : (level === 'inter' ? 11 : 15), iso: 15, rpe: 'RPE 6–7', tech: false },
    { w: 2, name: '技術建立期', scale: level === 'beginner' ? 'minus1' : 0.75, comp: level === 'advanced' ? 8 : (level === 'inter' ? 11 : 15), iso: 15, rpe: 'RPE 7',   tech: false },
    { w: 3, name: '容量累積期', scale: 1,    comp: level === 'beginner' ? 12 : (level === 'inter' ? 10 : 8), iso: level === 'beginner' ? 12 : 13, rpe: 'RPE 7–8', tech: true },
    { w: 4, name: '容量累積期', scale: 1,    comp: level === 'beginner' ? 12 : (level === 'inter' ? 10 : 8), iso: level === 'beginner' ? 12 : 13, rpe: 'RPE 8',   tech: true },
    { w: 5, name: '強度突破期', scale: 1,    comp: level === 'beginner' ? 10 : (level === 'inter' ? 8 : 6),  iso: level === 'beginner' ? 13 : 13, rpe: 'RPE 8–9', tech: true },
    { w: 6, name: '強度突破期', scale: 1,    comp: level === 'beginner' ? 10 : (level === 'inter' ? 8 : 6),  iso: level === 'beginner' ? 13 : 13, rpe: level === 'advanced' ? 'RPE 9–9.5（僅末組）' : 'RPE 9', tech: true },
    { w: 7, name: '主動恢復期', scale: 'two', comp: level === 'beginner' ? 11 : (level === 'inter' ? 10 : 8), iso: 12, rpe: 'RPE 5–6', tech: false },
    { w: 8, name: '驗收週',     scale: level === 'beginner' ? 'minus1' : 0.8, comp: level === 'beginner' ? 12 : (level === 'inter' ? 8 : 6), iso: 12, rpe: 'RPE 7–8', tech: false },
]);

/** 依當週 scale 調整基準組數 */
const S = (base, p) => {
    if (p.scale === 'two') return 2;
    if (p.scale === 'minus1') return Math.max(2, base - 1);
    if (typeof p.scale === 'number') return Math.max(2, Math.round(base * p.scale));
    return base;
};

const DELOAD_NOTE = '減量週：這週的重點是不練。容量降到 60%，一公斤都不要加 — 卸掉疲勞，下週測出來的才是真的你';
const TEST_NOTE   = '驗收週：疲勞已清掉，這週測。記下重量、肩圍、腰圍（訓練「前」量，同一條軟尺同一個位置）';
const wkNote = (p, base) => (p.w === 7 ? DELOAD_NOTE : p.w === 8 ? TEST_NOTE : base);

/* ── 新手：全上肢 A／B／C（居家：啞鈴＋椅子＋彈力帶）── */
const beginnerDays = (p) => ([
    {
        dayNumber: 1, focus: 'A｜肩線日 · 垂直推主導 · 中束優先', time: 35, intensity: p.rpe,
        exercises: [
            DB_OHP(S(3, p), p.comp, 75, CUE.ohp),
            DB_LAT(S(3, p), p.iso, 60, CUE.lat),
            INC_PUSHUP(S(3, p), p.comp, 60, '身體打直不塌腰；太輕就把手撐低一點'),
            BAND_APART(S(3, p), p.iso + 2, 45, '手臂打直、肩胛往中間夾'),
            HAMMER(S(3, p), p.iso, 60),
        ],
    },
    {
        dayNumber: 2, focus: 'B｜背闊日 · 純拉日 · 整天不做推', time: 35, intensity: p.rpe,
        exercises: [
            DB_ROW(S(3, p), p.comp, 75, '每邊。拉到肋骨不是拉到胸口；肩胛先動手臂再動'),
            BAND_ROW(S(3, p), p.iso, 60),
            BAND_FACE(S(3, p), p.iso + 2, 45, CUE.face),
            DB_LAT(S(3, p), p.iso, 60, CUE.lat),
            DB_CURL(S(3, p), p.iso, 60),
        ],
    },
    {
        dayNumber: 3, focus: 'C｜胸與比例日 · 上斜推主導 · 中束二次曝光', time: 35, intensity: p.rpe,
        exercises: [
            INC_DB(S(3, p), p.comp, 75),
            DB_FLY(S(3, p), p.iso, 60, '手肘微彎固定，感覺在胸不在肩前'),
            DB_LAT(S(3, p), p.iso, 60, CUE.lat),
            DB_ROW(S(3, p), p.comp, 75, '每邊'),
            TRI_DIPS(S(3, p), p.iso, 60, '用椅子做；肩膀不聳、身體貼近椅緣'),
        ],
    },
]);

/* ── 中階：推 A／拉 A／推 B／拉 B（健身房全器材）── */
const interDays = (p) => ([
    {
        dayNumber: 1, focus: 'D1 推 A｜肩優先 · 垂直推 · 中束最大量', time: 52, intensity: p.rpe,
        exercises: [
            BB_OHP(S(4, p), p.comp, 120, CUE.ohp),
            CAB_LAT(S(4, p), p.iso, 60, CUE.lat),
            INC_DB(S(3, p), p.comp, 90),
            DB_LAT(S(4, p), p.iso + 2, 60, CUE.lat),
            PUSHDOWN(S(4, p), p.iso, 60),
        ],
    },
    {
        dayNumber: 2, focus: 'D2 拉 A｜背闊優先 · 垂直拉 · 寬度', time: 50, intensity: p.rpe,
        exercises: [
            LAT_PULL(S(4, p), p.comp, 90, CUE.pull),
            SEATED_ROW(S(3, p), p.comp, 90),
            STRAIGHT(S(3, p), p.iso, 60, '唯一能繞開二頭直接練背闊的動作'),
            FACE_PULL(S(3, p), p.iso + 2, 60, CUE.face),
            EZ_CURL(S(4, p), p.comp, 60),
        ],
    },
    {
        dayNumber: 3, focus: 'D4 推 B｜胸優先 · 上斜推 · 胸最新鮮', time: 50, intensity: p.rpe,
        exercises: [
            INC_BB(S(4, p), p.comp, 120, '選上斜不選平板：上胸決定鎖骨下方是否飽滿'),
            DB_OHP(S(3, p), p.comp, 90, CUE.ohp),
            CAB_FLY(S(3, p), p.iso, 60),
            DB_LAT(S(4, p), p.iso + 2, 60, CUE.lat),
            OH_CABLE(S(4, p), p.iso, 60, '長頭只有在過頭位才被完全拉長'),
        ],
    },
    {
        dayNumber: 4, focus: 'D5 拉 B｜厚度優先 · 水平拉 · 上背密度', time: 52, intensity: p.rpe,
        exercises: [
            BB_ROW(S(4, p), p.comp, 120, CUE.row),
            NEUTRAL_PD(S(3, p), p.comp, 90),
            CHEST_SUPP(S(3, p), p.comp, 90, '胸靠墊完全排除代償'),
            REV_CAB_FLY(S(3, p), p.iso + 2, 60),
            HAMMER(S(4, p), p.comp, 60),
        ],
    },
]);

/* ── 精熟：同分化 ＋ 超級組／遞減組 ── */
const advDays = (p) => {
    const ss = (grp, tag) => (p.tech ? { superset: true, supersetGroup: grp, note: `${CUE.ss}｜${tag}` } : {});
    const ssB = (grp) => (p.tech ? { supersetGroup: grp } : {});
    const drop = p.tech && p.w >= 5 ? '末組遞減：力竭後立刻降重 30% 再做到力竭，一次即可（只在繩索與機械做）' : undefined;

    return [
        {
            dayNumber: 1, focus: 'D1 推 A｜肩優先 · 垂直推 · 中束雙動作', time: 65, intensity: p.rpe,
            exercises: [
                BB_OHP(S(4, p), p.comp, 180, CUE.ohp),
                INC_DB(S(4, p), p.comp + 2, 120),
                CAB_LAT(S(4, p), p.iso, p.tech ? SS_GAP : 60, undefined, ss('SS1', 'SS1-A ➜ 接啞鈴側平舉')),
                DB_LAT(S(4, p), p.iso + 2, 90, CUE.lat, ssB('SS1')),
                SEAT_FLY(S(3, p), p.iso, 60),
                PUSHDOWN(S(4, p), p.iso, 90, drop),
            ],
        },
        {
            dayNumber: 2, focus: 'D2 拉 A｜背闊優先 · 垂直拉 · 寬度', time: 68, intensity: p.rpe,
            exercises: [
                WIDE_PULLUP(S(4, p), p.comp, 180, '做不到就用下拉遞補，不要用甩的'),
                LAT_PULL(S(4, p), p.comp + 4, 90, CUE.pull),
                SEATED_ROW(S(3, p), p.comp + 4, 90),
                STRAIGHT(S(3, p), p.iso, p.tech ? SS_GAP : 60, undefined, ss('SS1', 'SS1-A ➜ 接繩索面拉')),
                FACE_PULL(S(3, p), p.iso + 2, 90, CUE.face, ssB('SS1')),
                EZ_CURL(S(4, p), p.comp + 4, p.tech ? SS_GAP : 60, undefined, ss('SS2', 'SS2-A ➜ 接面向後繩索彎舉')),
                FACE_AWAY(S(4, p), p.iso, 90, '手臂在身後＝二頭長頭最大拉伸', ssB('SS2')),
            ],
        },
        {
            dayNumber: 3, focus: 'D4 推 B｜胸優先 · 上斜推 · 胸最新鮮', time: 66, intensity: p.rpe,
            exercises: [
                INC_BB(S(4, p), p.comp, 180),
                DB_BENCH(S(4, p), p.comp + 2, 120),
                MACH_OHP(S(3, p), p.comp + 4, 90, '此時已疲勞，用機械最安全'),
                CAB_FLY(S(3, p), p.iso, p.tech ? SS_GAP : 60, undefined, ss('SS1', 'SS1-A ➜ 接啞鈴側平舉')),
                DB_LAT(S(4, p), p.iso + 2, 90, CUE.lat, ssB('SS1')),
                CLOSE_GRIP(S(3, p), p.comp + 4, 90, '手肘收在體側不外開'),
            ],
        },
        {
            dayNumber: 4, focus: 'D5 拉 B｜厚度優先 · 水平拉 · 上背密度', time: 68, intensity: p.rpe,
            exercises: [
                BB_ROW(S(4, p), p.comp, 180, CUE.row),
                T_BAR(S(4, p), p.comp + 2, 120),
                NEUTRAL_PD(S(3, p), p.comp + 4, 90),
                REV_CAB_FLY(S(3, p), p.iso + 2, p.tech ? SS_GAP : 60, undefined, ss('SS1', 'SS1-A ➜ 接繩索面拉')),
                FACE_PULL(S(3, p), p.iso + 2, 90, CUE.face, ssB('SS1')),
                HAMMER(S(4, p), p.comp + 4, p.tech ? SS_GAP : 60, undefined, ss('SS2', 'SS2-A ➜ 接繩索彎舉')),
                CAB_CURL(S(4, p), p.iso, 90, undefined, ssB('SS2')),
            ],
        },
    ];
};

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
        ...(p.w === 7 || p.w === 8 ? { note: wkNote(p) } : {}),
    })),
}));

/* ═══════════════════════════════════════════════════════════════ */
export const V_TAPER_PLAN = {
    id: 'v-taper-suit-56',
    name: '上半身線條',
    subtitle: '練肩寬和背厚，讓腰看起來更窄',
    bodyPart: 'upper_body',
    bodyPartLabel: '上半身',
    duration: 56,
    coverImage: '/desktop/Gemini_Generated_Image_hd8zwuhd8zwuhd8z.png',
    description: '不是每個部位都練大，而是把時間集中在決定身形的兩塊肌肉：肩膀側面和背闊肌。全課不練上斜方，因為它會讓肩膀看起來更圓而不是更寬。',
    tags: ['練肩寬', '練背厚', '不練上斜方', '八週不換動作'],
    isCourse: true,
    courseSystem: 'strength',

    levels: {
        beginner: {
            key: 'beginner',
            label: '新手',
            labelEn: 'Beginner',
            recommendedDays: 3,
            recommendedDaysLabel: '建議每週 3 天（第 1／3／5 天）',
            durationPerSession: '30-40',
            equipment: ['可調啞鈴', '穩固椅子', '彈力帶'],
            targetArea: '三角肌中束、背闊肌、胸大肌、肱二頭、肱三頭',
            intensity: '低至中等（RPE 6–8）',
            expectedGain: '肩線變寬、上背挺起來、襯衫肩部撐得起來',
            benefits: [
                '三天全部在家可完成，一組啞鈴＋一張椅子＋一條彈力帶就夠',
                '三角肌中束每週練三次，是全課容量最高的肌群',
                'B 日完整一天不做推的動作，肩關節每週有 96 小時休息',
            ],
            periodization: {
                phase1: { name: '技術建立', weeks: '第 1–2 週', focus: '學動作、找感受度，刻意做不滿', reps: '15 次', intensity: 'RPE 6–7' },
                phase2: { name: '容量累積', weeks: '第 3–4 週', focus: '組數補滿，泵感出現（那是血流不是進步）', reps: '12 次', intensity: 'RPE 7–8' },
                phase3: { name: '強度突破', weeks: '第 5–6 週', focus: '複合加重 2.5kg；側平舉維持高次數不加重', reps: '複合 10 · 孤立 13', intensity: 'RPE 8' },
                phase4: { name: '減量與驗收', weeks: '第 7–8 週', focus: 'W7 每動作 2 組不加重；W8 測肩推 8RM、量肩圍腰圍', reps: '11 → 12 次', intensity: 'RPE 5–6 → 7–8' },
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
            equipment: ['槓鈴', '啞鈴', '繩索', '下拉機'],
            targetArea: '背闊肌、三角肌中束、胸大肌、上背與後束、二頭、三頭',
            intensity: '中等至高（RPE 7–9）',
            expectedGain: '肩腰比明顯改善、背闊下緣外展可見、垂直拉力量 +10–15%',
            benefits: [
                '背闊肌拿到全課最高容量（20 組／週），寬度與厚度各半',
                '推／拉完全分離，三頭與二頭不會被連續兩天輾壓',
                '手臂沒有獨立日，但二頭實際吃到 17.5 有效組數',
            ],
            periodization: {
                phase1: { name: '技術建立', weeks: '第 1–2 週', focus: '組數壓 75%，重量比你以為的輕', reps: '複合 11 · 孤立 15', intensity: 'RPE 6–7' },
                phase2: { name: '容量累積', weeks: '第 3–4 週', focus: '組數補滿，W4 是容量峰值', reps: '複合 10 · 孤立 13', intensity: 'RPE 7–8' },
                phase3: { name: '強度突破', weeks: '第 5–6 週', focus: '複合 +2.5kg、次數降到 8；孤立不進低次數區間', reps: '複合 8 · 孤立 13', intensity: 'RPE 8–9' },
                phase4: { name: '減量與驗收', weeks: '第 7–8 週', focus: 'W7 容量降 60%；W8 測下拉與上斜臥推 8RM', reps: '複合 8–10', intensity: 'RPE 5–6 → 7–8' },
            },
            weeks: buildWeeks(PROG('inter'), interDays),
        },

        advanced: {
            key: 'advanced',
            label: '精熟',
            labelEn: 'Advanced',
            recommendedDays: 4,
            recommendedDaysLabel: '建議每週 4 天（第 1／2／4／5 天）',
            durationPerSession: '55-70',
            equipment: ['槓鈴', '啞鈴', '繩索', '引體架', '機械'],
            targetArea: '同中階，容量與強度技巧上調',
            intensity: '高（RPE 8–9.5，9.5 僅限末組）',
            expectedGain: '背闊厚度與寬度同步、肩線頂點明顯、力量在低疲勞下驗收出真實新高',
            benefits: [
                '背闊 22 組／週已在 MAV 上緣 — 全課最大的一筆投資',
                '超級組只用在拮抗肌與孤立動作，自由重量複合動作維持完整休息',
                '遞減組只放繩索與機械，力竭時不會有姿勢崩壞的風險',
            ],
            periodization: {
                phase1: { name: '技術建立', weeks: '第 1–2 週', focus: '組數壓 75%，強度技巧全部停用', reps: '複合 8 · 孤立 15', intensity: 'RPE 7–8' },
                phase2: { name: '容量累積', weeks: '第 3–4 週', focus: '組數補滿並開啟超級組', reps: '複合 8 · 孤立 13', intensity: 'RPE 8–9' },
                phase3: { name: '強度突破', weeks: '第 5–6 週', focus: '複合降到 6 次；每天最多一個末組遞減', reps: '複合 6 · 孤立 13', intensity: 'RPE 9–9.5（僅末組）' },
                phase4: { name: '減量與驗收', weeks: '第 7–8 週', focus: 'W7 技巧全停、每動作 2 組；W8 測引體最大下數與上斜臥推 6RM', reps: '複合 6–8', intensity: 'RPE 5–6 → 8' },
            },
            weeks: buildWeeks(PROG('advanced'), advDays),
        },
    },
};

export default V_TAPER_PLAN;
