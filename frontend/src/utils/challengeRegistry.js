/**
 * ══════════════════════════════════════════════════════════════════════════
 * challengeRegistry — 常駐挑戰 / 季度挑戰 / 社團徽章的「唯一定義來源」
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 為什麼要有這支：
 *
 *   稽核前，「常駐挑戰」同時被定義在三個地方，而且三份互不同步：
 *     socialDataConnector.PERMANENT_CHALLENGES   5 筆   ← 社群頁那一區
 *     api_permanent_challenges.py                5 筆   ← 後端算進度
 *     growthAchievements.js category:'permanent' 8 筆   ← 成就頁那一區
 *
 *   三份不只筆數不同，連達成條件都互相矛盾：
 *     「破風配速」  社群頁＝跑出負分割      成就頁＝最佳配速 5:00/km
 *     「週週重訓」  社群頁＝每週 3 次×4 週  成就頁＝累積 12 次重訓
 *   使用者在兩個頁面看到同一個名字、兩個進度，沒有一邊說得出哪個才算數。
 *
 *   現在只在這裡定義一次，三邊都從這份生成。
 *
 * ── 「家」與「視圖」的差別（這支最重要的一個觀念）──────────────────────
 *
 *   成就頁的分類（重訓／有氧／營養／社群／親密／社團）是徽章的**家**，
 *   一個徽章只能有一個家。
 *
 *   「常駐挑戰」「季度限定」不是家，是**視圖** —— 它們橫跨分類，
 *   把散落在有氧、營養、社團的徽章依「軸」重新串成分階的挑戰。
 *
 *   ⚠️ 這一點寫錯會很慘：把 km_total_50 從「有氧」改成「常駐」，
 *      有氧分頁會整個空掉；兩邊都掛則同一枚徽章出現兩次、
 *      解鎖狀態各記一份。所以 borrowed 的徽章只加視圖、不搬家。
 *
 * ── 一個「軸」是什麼 ──────────────────────────────────────────────────
 *
 *   軸 = 一個會一直累積的真實指標 ＋ 一組由淺到深的門檻。
 *   這就是「常駐」的意思：達成一階不是結束，是升到下一階。
 *
 *   field    對應 growthAchievements.aggregateUserData 產出的欄位。
 *            ⚠️ 鐵律：沒有真實欄位就不要開這個軸。用推估值（例如
 *            「每 4 次跑步算 1 次負分割」）撐出來的徽章是假的。
 *   asset    每一階用哪個徽章素材 —— 同時也是成就 id，兩邊永遠對得上。
 *   home     這一階的徽章原本住在哪個分類。省略 = 這支登錄表就是它的家。
 *   resets   進度何時歸零：'never'（累積型）/ 'month' / 'quarter'。
 */

/* 四階語彙。超過四階的軸（例如累積里程有七階）仍然只有這四種材質，
   素材的 index 決定 3D 徽章的材質與配色。 */
export const TIER_KEYS = ['bronze', 'silver', 'gold', 'platinum'];

/** 第 i 階（共 n 階）用哪一種材質。階數多時讓後段集中在金／鉑金。 */
const tierOf = (i, n) => {
    if (n <= 4) return TIER_KEYS[Math.min(i, 3)];
    const ratio = i / (n - 1);
    if (ratio < 0.28) return 'bronze';
    if (ratio < 0.56) return 'silver';
    if (ratio < 0.86) return 'gold';
    return 'platinum';
};
const TIER_INDEX = { bronze: 0, silver: 1, gold: 2, platinum: 3 };

/* ══════════════════════════════════════════════════════════════════════
 * 常駐挑戰 —— 永不過期、一直往上疊
 * ══════════════════════════════════════════════════════════════════════ */
export const PERMANENT_AXES = [
    {
        id: 'dist_total', label: '累積里程', en: 'Total Distance',
        field: 'totalKm', unit: 'km', resets: 'never', sport: 'run', design: 'route',
        blurb: '雙腿寫下的總帳：跑過的每一公里都留在這裡。',
        steps: [
            { target: 50, name: '累積跑量 50 公里', asset: 'km_total_50', home: 'cardio' },
            { target: 200, name: '累積跑量 200 公里', asset: 'km_total_200', home: 'cardio' },
            { target: 500, name: '累積跑量 500 公里', asset: 'km_total_500', home: 'cardio' },
            { target: 1000, name: '累積跑量 1000 公里', asset: 'km_total_1000', home: 'cardio' },
            { target: 5000, name: '累積跑量 5000 公里', asset: 'km_total_5000', home: 'cardio' },
            { target: 10000, name: '累積跑量 10000 公里', asset: 'km_total_10000', home: 'cardio' },
            { target: 40075, name: '環繞地球一圈', asset: 'km_total_40075', home: 'cardio' },
        ],
    },
    {
        id: 'dist_single', label: '單次最長距離', en: 'Longest Run',
        field: 'longestRunDistance', unit: 'km', resets: 'never', sport: 'run', design: 'bib',
        blurb: '一次跑完的最遠距離 —— 從五公里一路推到超馬。',
        steps: [
            { target: 5, name: '單次跑 5 公里', asset: 'km_single_5', home: 'cardio' },
            { target: 10, name: '單次跑 10 公里', asset: 'km_single_10', home: 'cardio' },
            { target: 21.0975, name: '半程馬拉松', asset: 'km_single_21_1', home: 'cardio' },
            { target: 42.195, name: '全程馬拉松', asset: 'km_single_42_195', home: 'cardio' },
            { target: 50, name: '超馬 50 公里', asset: 'km_single_50', home: 'cardio' },
            { target: 100, name: '百公里超馬', asset: 'km_single_100', home: 'cardio' },
        ],
    },
    {
        id: 'run_count', label: '跑步次數', en: 'Run Count',
        field: 'totalRuns', unit: '次', resets: 'never', sport: 'run', design: 'loop',
        blurb: '出門這件事本身就是門檻：累積出門的次數。',
        steps: [
            { target: 5, name: '跑步 5 次', asset: 'run_count_5', home: 'cardio' },
            { target: 25, name: '跑步 25 次', asset: 'run_count_25', home: 'cardio' },
            { target: 75, name: '跑步 75 次', asset: 'run_count_75', home: 'cardio' },
            { target: 150, name: '跑步 150 次', asset: 'run_count_150', home: 'cardio' },
            { target: 250, name: '年度 250 次跑步', asset: 'pc_year_runs_250' },
        ],
    },
    {
        id: 'pace_best', label: '最佳配速', en: 'Best Pace',
        field: 'bestPace', unit: 'min/km', resets: 'never', sport: 'run', design: 'velocity',
        lowerIsBetter: true,
        blurb: '歷來最快的一次配速。這一軸是往下破，不是往上疊。',
        steps: [
            { target: 7, name: '破 7 分速', asset: 'pace_7', home: 'cardio' },
            { target: 6, name: '破 6 分速', asset: 'pc_pace_breaker' },
            { target: 5.5, name: '破 5 分半速', asset: 'pace_5_5', home: 'cardio' },
            { target: 4.5, name: '破 4 分半速', asset: 'pace_4_5', home: 'cardio' },
            { target: 3.8333, name: '破 3 分 50 速', asset: 'pace_3_50', home: 'cardio' },
        ],
    },
    {
        id: 'streak', label: '連續訓練', en: 'Streak',
        field: 'checklistStreak', unit: '天', resets: 'never', sport: 'both', design: 'calendar',
        blurb: '不間斷的天數（跑步或重訓皆計）。斷一天就重來。',
        steps: [
            { target: 7, name: '連續訓練 7 天', asset: 'streak_7', home: 'nutrition' },
            { target: 30, name: '連續訓練 30 天', asset: 'streak_30', home: 'nutrition' },
            { target: 90, name: '連續訓練 90 天', asset: 'streak_90', home: 'nutrition' },
            { target: 180, name: '連續訓練 180 天', asset: 'streak_180', home: 'nutrition' },
            { target: 270, name: '連續訓練 270 天', asset: 'streak_270', home: 'nutrition' },
            { target: 365, name: '連續訓練 365 天', asset: 'streak_365', home: 'nutrition' },
        ],
    },
    {
        id: 'workout_count', label: '訓練次數', en: 'Session Count',
        field: 'totalWorkouts', unit: '次', resets: 'never', sport: 'strength', design: 'loop',
        blurb: '累積進場的次數 —— 長期主義唯一的計分方式。',
        steps: [
            { target: 150, name: '年度 150 次訓練', asset: 'pc_year_workouts_150' },
            { target: 500, name: '五百次俱樂部', asset: 'pc_year_500' },
        ],
    },
    {
        id: 'iron_week', label: '週週重訓', en: 'Iron Week',
        field: 'strengthWeekStreak', unit: '週', resets: 'never', sport: 'strength', design: 'calendar',
        blurb: '連續幾週做到「每週至少 3 次重訓」。中斷就重新算。',
        steps: [
            { target: 4, name: '週週重訓不缺席', asset: 'pc_iron_week' },
        ],
    },
    {
        id: 'max_lift', label: '力量門檻', en: 'Max Lift',
        field: 'maxLift', unit: 'kg', resets: 'never', sport: 'strength', design: 'plate',
        blurb: '任一主項單組舉起的最大重量。',
        steps: [
            { target: 100, name: '百公斤俱樂部', asset: 'pc_100kg_club' },
        ],
    },
    {
        id: 'month_km', label: '月跑里程', en: 'Monthly Distance',
        field: 'monthKm', unit: 'km', resets: 'month', sport: 'run', design: 'track',
        blurb: '單月累積跑量，每月一號自動歸零重跑。',
        steps: [
            { target: 100, name: '月跑 100 公里', asset: 'pc_month_100km' },
        ],
    },
];

/* ══════════════════════════════════════════════════════════════════════
 * 季度挑戰 —— 每季重置，跟官方活動同一個週期
 * ══════════════════════════════════════════════════════════════════════ */
export const QUARTERLY_AXES = [
    {
        id: 'q_km', label: '本季跑量', en: 'Quarter Distance',
        field: 'quarterKm', unit: 'km', resets: 'quarter', sport: 'run', design: 'mountain',
        blurb: '這一季累積的跑步里程，跨季自動重置。',
        steps: [
            { target: 30, name: '本季跑量 30 公里', asset: 'q_km_30' },
            { target: 50, name: '季度遠征', asset: 'q_expedition' },
            { target: 100, name: '本季跑量 100 公里', asset: 'q_km_100' },
            { target: 200, name: '季度雙百', asset: 'q_pace_challenge' },
        ],
    },
    {
        id: 'q_workouts', label: '本季出席', en: 'Quarter Sessions',
        field: 'quarterWorkouts', unit: '次', resets: 'quarter', sport: 'both', design: 'camp',
        blurb: '這一季完成的訓練次數，跨季自動重置。',
        steps: [
            { target: 20, name: '本季完成 20 次訓練', asset: 'q_workouts_20' },
            { target: 30, name: '季度訓練營', asset: 'q_training_camp' },
            { target: 40, name: '季度燃脂季', asset: 'q_fat_burn' },
            { target: 50, name: '本季完成 50 次訓練', asset: 'q_workouts_50' },
        ],
    },
    {
        id: 'q_volume', label: '本季訓練量', en: 'Quarter Tonnage',
        field: 'quarterVolume', unit: 'kg', resets: 'quarter', sport: 'strength', design: 'pr',
        blurb: '這一季舉起的總重量，跨季自動重置。',
        steps: [
            { target: 50000, name: '季度力量階段', asset: 'q_strength_tier' },
        ],
    },
];

/* ══════════════════════════════════════════════════════════════════════
 * 社團 —— 不在這裡定義
 * ══════════════════════════════════════════════════════════════════════
 * 稽核前這裡有四條「跨社團總計」的軸（任務達成／社團常客／加入社團／併肩訓練），
 * 共 8 枚徽章。它們跟社團真正的玩法沒有關係 ——
 * 社團的玩法是「每一筆固定挑戰各自累積」：同一筆任務完成 1／3／6／12 個月
 * → 銅／銀／金／鉑金。一個總計數字看不出你是哪一筆做得久。
 *
 * 所以社團徽章改成「一筆任務一枚徽章、自己升階」，由 CLUB_CHALLENGES 的
 * 27 筆題庫直接生成（見 growthAchievements.js 的 squadMissionAchievements）。
 * 生成放在那邊而不是這裡，是為了避開 socialDataConnector ⇄ challengeRegistry
 * 的循環 import —— 這支被 socialDataConnector 匯入，不能反過來匯入它。
 *
 * 這裡只留分階門檻，讓成就頁與社團展示櫃用同一組數字。
 */

/** 完成次數 → 階級。與 ClubBadgeCabinet.COUNT_TIERS 同一組門檻。 */
export const MISSION_COUNT_TIERS = [
    { key: 'platinum', need: 12 },
    { key: 'gold', need: 6 },
    { key: 'silver', need: 3 },
    { key: 'bronze', need: 1 },
];

/** 完成 n 次 → 目前階級（未達 1 次回 null）。 */
export const tierForCount = (n) => (MISSION_COUNT_TIERS.find((t) => n >= t.need) || {}).key || null;

/** 下一階還差幾次（已滿階回 null）。 */
export const nextTierForCount = (n) => {
    const asc = [...MISSION_COUNT_TIERS].reverse();
    return asc.find((t) => n < t.need) || null;
};

export const ALL_AXES = [...PERMANENT_AXES, ...QUARTERLY_AXES];
export const axisById = (id) => ALL_AXES.find((a) => a.id === id) || null;

/* ══════════════════════════════════════════════════════════════════════
 * 生成器
 * ══════════════════════════════════════════════════════════════════════ */

const RESET_ZH = { month: '本月', quarter: '本季', never: '' };

/** 門檻的顯示字串（配速要寫成 4:30 才看得懂）。 */
export const formatTarget = (axis, v) => {
    if (axis.unit === 'min/km') {
        const m = Math.floor(v);
        const s = Math.round((v - m) * 60);
        return `${m}:${String(s).padStart(2, '0')}`;
    }
    if (axis.unit === 'kg' && v >= 1000) return `${(v / 1000).toLocaleString()} 噸`;
    return v.toLocaleString();
};

/** 依真實欄位判定達成 / 進度。欄位不存在一律回 0，不用推估值灌水。 */
const makeCheck = (axis, target) => (d) => {
    const v = Number(d?.[axis.field]) || 0;
    return axis.lowerIsBetter ? (v > 0 && v <= target) : v >= target;
};
const makeProgress = (axis, target) => (d) => {
    const v = Number(d?.[axis.field]) || 0;
    if (!axis.lowerIsBetter) return Math.min(100, (v / target) * 100);
    if (v <= 0) return 0;
    if (v <= target) return 100;
    const start = 12;   // 從 12 分速開始往目標收斂，才不會一開跑就顯示 0%
    return Math.max(0, Math.min(100, ((start - v) / (start - target)) * 100));
};

/**
 * 一個軸 → 成就定義。
 * @param lens 這個軸屬於哪個視圖（permanent / quarterly / squad）
 * @returns {{owned:Array, lenses:Object}}
 *          owned  這支登錄表要自己新增的成就（home 未指定的那些）
 *          lenses id → 要額外掛上的視圖（borrowed 的那些）
 */
export const axisToAchievements = (axis, lens) => {
    const n = axis.steps.length;
    const owned = [];
    const lenses = {};
    axis.steps.forEach((step, i) => {
        lenses[step.asset] = lens;
        if (step.home) return;   // 已經有家了 —— 只掛視圖，不重複定義
        const scope = RESET_ZH[axis.resets] || '';
        owned.push({
            id: step.asset,
            axisId: axis.id,
            tierIndex: i,
            tierTotal: n,
            name: step.name,
            condition: axis.lowerIsBetter
                ? `${axis.label}進步到 ${formatTarget(axis, step.target)} ${axis.unit}以內`
                : `${scope}${axis.label}達到 ${formatTarget(axis, step.target)} ${axis.unit}`,
            description: axis.blurb,
            emoji: '',
            category: lens,
            lens,
            tier: tierOf(i, n),
            target: step.target,
            unit: axis.unit,
            check: makeCheck(axis, step.target),
            progress: makeProgress(axis, step.target),
        });
    });
    return { owned, lenses };
};

const collect = (axes, lens) => axes.reduce((acc, axis) => {
    const { owned, lenses } = axisToAchievements(axis, lens);
    acc.owned.push(...owned);
    Object.assign(acc.lenses, lenses);
    return acc;
}, { owned: [], lenses: {} });

const _perm = collect(PERMANENT_AXES, 'permanent');
const _quart = collect(QUARTERLY_AXES, 'quarterly');

/** 登錄表自己擁有的成就 —— growthAchievements 直接把這份接在陣列後面。 */
export const REGISTRY_ACHIEVEMENTS = [..._perm.owned, ..._quart.owned];

/**
 * id → 視圖。成就頁的「常駐挑戰 / 季度限定 / 社團」分頁用這張表收人，
 * 而不是比對 category —— 因為 km_total_50 的家在「有氧」，
 * 它只是同時出現在常駐挑戰這個視圖裡。
 */
export const ACHIEVEMENT_LENS = { ..._perm.lenses, ..._quart.lenses };

/** 這枚徽章屬於哪個視圖（沒有就回 null）。 */
export const lensOf = (id) => ACHIEVEMENT_LENS[id] || null;

/** 成就頁分頁篩選：家在這一類、或被這個視圖收錄，都算。 */
export const inCategory = (ach, catId) =>
    ach?.category === catId || ACHIEVEMENT_LENS[ach?.id] === catId;

/** 素材登錄（給 3D 徽章用）：只補素材庫還沒有的 id。 */
export const REGISTRY_BADGE_ASSETS = Object.fromEntries(
    REGISTRY_ACHIEVEMENTS.map((a) => [a.id, {
        asset: a.id,
        name: a.name,
        family: a.category,
        index: TIER_INDEX[a.tier],
        design: axisById(a.axisId)?.design || 'loop',
        number: String(Math.round(a.target)),
    }])
);

/* ══════════════════════════════════════════════════════════════════════
 * 社群頁用：一個軸「現在在第幾階」
 * ══════════════════════════════════════════════════════════════════════ */

/**
 * 依使用者目前數值算出這個軸的狀態。
 * @returns {{done,total,current,next,value,pct,complete,tier}}
 */
export const axisStatus = (axis, data) => {
    const value = Number(data?.[axis.field]) || 0;
    const hit = (t) => (axis.lowerIsBetter ? (value > 0 && value <= t) : value >= t);
    const done = axis.steps.filter((s) => hit(s.target)).length;
    const current = done > 0 ? axis.steps[done - 1] : null;
    const next = done < axis.steps.length ? axis.steps[done] : null;
    let pct = 100;
    if (next) {
        if (axis.lowerIsBetter) {
            const start = current ? current.target : 12;
            pct = value > 0 ? Math.max(0, Math.min(100, ((start - value) / (start - next.target)) * 100)) : 0;
        } else {
            const base = current ? current.target : 0;
            pct = Math.max(0, Math.min(100, ((value - base) / (next.target - base)) * 100));
        }
    }
    return {
        done, total: axis.steps.length, current, next, value, pct,
        complete: !next,
        tier: done > 0 ? tierOf(done - 1, axis.steps.length) : null,
    };
};

/** 社群頁「常駐挑戰」卡片用的攤平資料。sport: 'run' | 'strength' | 'all' */
export const permanentChallengeCards = (data, sport = 'all') =>
    PERMANENT_AXES
        .filter((a) => sport === 'all' || a.sport === sport || a.sport === 'both')
        .map((axis) => ({ axis, status: axisStatus(axis, data) }));

export default {
    TIER_KEYS,
    PERMANENT_AXES, QUARTERLY_AXES, ALL_AXES,
    MISSION_COUNT_TIERS, tierForCount, nextTierForCount,
    REGISTRY_ACHIEVEMENTS, REGISTRY_BADGE_ASSETS, ACHIEVEMENT_LENS,
    lensOf, inCategory, axisById, axisStatus, permanentChallengeCards, formatTarget,
};
