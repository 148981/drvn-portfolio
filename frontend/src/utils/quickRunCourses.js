/**
 * quickRunCourses.js — 跑步頁「快速訓練」的四門固定課程（唯一定義）
 * ══════════════════════════════════════════════════════════════════════
 * 四門課剛好對應跑步計劃的四種課型（utils/brickThemeMapping.resolveThemeId）：
 *   recovery    恢復跑   ← 計劃的 recovery / easy 磚
 *   base        有氧跑   ← long 磚
 *   progressive 節奏跑   ← tempo 磚
 *   hill        間歇跑   ← interval / speed 磚
 * （id 沿用舊值：計劃模式、註冊推薦、Plan Echo 都用這四個 id 對應）
 *
 * 專業原則：
 *   1. 每一門都是「暖身 → 主課 → 緩和」，強度課前暖身 ≥ 10 分鐘、後面緩和 ≥ 6 分鐘。
 *   2. 強度用 RPE 區間寫（utils/rpeMapping 的 RPE_BANDS，全 App 同一套），並附一句能自己判斷的體感。
 *      心率與配速因人而異，寫死一個全員配速＝對大多數人都是錯的。
 *   3. 配速只在「有個人基準」時才給，而且只給輕鬆段（恢復／有氧／長跑），
 *      用跑步計劃同一份偏移（cardioPrescription.PACE_SHIFT_BY_SUBTYPE）。
 *      節奏與間歇段一律依體感 —— 強度段的配速要靠實測校準，不用公式硬推。
 *   4. 三個程度沿用課程的統一分級：入門／中階／進階。趟數寫幾趟就真的有幾趟。
 *   5. 範本上不放 targetPace：計劃模式會用計劃自己的目標配速填進去
 *      （以前範本寫死配速，會把計劃算好的個人配速蓋掉）。
 */
import { PACE_SHIFT_BY_SUBTYPE } from './cardioPrescription';
import { RPE_BANDS } from './rpeMapping';

const M = 60;

/** 一段課：name 的關鍵字（暖身／緩和／恢復／節奏／間歇）會被計劃模式拿來分配配速權重，別亂改 */
const step = (name, min, band, cue, paceKey = null) => ({
    name, duration: Math.round(min * M),
    rpeBand: RPE_BANDS[band],   // 跑步中 RPE 量表、Macro Focus 都讀這個（rpeMapping.getStepRpeBand）
    cue, ...(paceKey ? { paceKey } : {}),
});

/** n 趟「快 a 分／慢 b 分」—— 最後一趟後面不接恢復，直接進緩和 */
const reps = (n, fastMin, easyMin, fastName, fastBand, fastCue) => {
    const out = [];
    for (let i = 1; i <= n; i++) {
        out.push(step(`${fastName} ${i}/${n}`, fastMin, fastBand, fastCue));
        if (i < n) out.push(step('恢復慢跑', easyMin, 'RECOVERY', '慢到呼吸回穩', 'recovery'));
    }
    return out;
};

/** 主課＝暖身與緩和之間、扣掉趟間恢復的那幾段（詳細頁的「主課／強度」就讀這個） */
export function mainSetOf(steps = []) {
    const main = steps.slice(1, -1).filter((s) => s.name !== '恢復慢跑');
    if (!main.length) return null;
    const mins = main.map((s) => Math.round(s.duration / M));
    const same = mins.every((m) => m === mins[0]);
    return {
        label: main.length > 1 && same ? `${main.length} × ${mins[0]} 分` : `${mins.reduce((a, b) => a + b, 0)} 分`,
        band: main[0].rpeBand || null,
    };
}

const level = (name, steps) => {
    const total = Math.round(steps.reduce((s, x) => s + x.duration, 0) / M);
    return { level: name, duration: `${total}m`, minutes: total, steps, main: mainSetOf(steps) };
};

export const QUICK_RUN_COURSES = [
    {
        id: 'recovery', type: 'recovery', tag: '恢復日', title: '恢復跑',
        desc: '強度課或長跑的隔天用。慢到能完整講話，促進血流，不累積疲勞。',
        difficulties: [
            level('入門', [step('快走暖身', 5, 'REST', '手臂擺起來'), step('輕鬆恢復跑', 12, 'RECOVERY', '能完整講話', 'recovery'), step('步行緩和', 3, 'REST', '呼吸完全平穩')]),
            level('中階', [step('快走暖身', 3, 'REST', '手臂擺起來'), step('輕鬆恢復跑', 24, 'RECOVERY', '能完整講話', 'recovery'), step('步行緩和', 3, 'REST', '呼吸完全平穩')]),
            level('進階', [step('慢跑暖身', 5, 'RECOVERY', '越慢越好', 'recovery'), step('輕鬆恢復跑', 31, 'RECOVERY', '能完整講話', 'recovery'), step('步行緩和', 4, 'REST', '呼吸完全平穩')]),
        ],
    },
    {
        id: 'base', type: 'base', tag: '有氧', title: '有氧跑',
        desc: '一週跑量的主體。維持在微喘、還能講短句的強度，練的是心肺底子與脂肪利用。',
        difficulties: [
            level('入門', [step('慢跑暖身', 5, 'RECOVERY', '比有氧再慢一點', 'recovery'), step('有氧跑', 20, 'EASY', '微喘可講短句', 'easy'), step('緩和慢走', 5, 'REST', '呼吸完全平穩')]),
            level('中階', [step('慢跑暖身', 8, 'RECOVERY', '比有氧再慢一點', 'recovery'), step('有氧跑', 32, 'EASY', '微喘可講短句', 'easy'), step('緩和慢跑', 5, 'RECOVERY', '慢慢收', 'recovery')]),
            level('進階', [step('慢跑暖身', 10, 'RECOVERY', '比有氧再慢一點', 'recovery'), step('有氧長跑', 45, 'EASY', '微喘可講短句', 'long'), step('緩和慢跑', 5, 'RECOVERY', '慢慢收', 'recovery')]),
        ],
    },
    {
        id: 'progressive', type: 'progressive', tag: '節奏', title: '節奏跑',
        desc: '在「舒服的吃力」撐一段時間，推高乳酸閾值，讓你能用更快的速度跑更久。',
        difficulties: [
            level('入門', [step('暖身慢跑', 10, 'RECOVERY', '越跑越熱', 'recovery'), ...reps(2, 6, 2, '節奏', 'TEMPO', '只能講幾個字'), step('緩和慢跑', 6, 'RECOVERY', '慢慢收', 'recovery')]),
            level('中階', [step('暖身慢跑', 10, 'RECOVERY', '越跑越熱', 'recovery'), step('節奏 連續', 20, 'TEMPO', '只能講幾個字'), step('緩和慢跑', 10, 'RECOVERY', '慢慢收', 'recovery')]),
            level('進階', [step('暖身慢跑', 12, 'RECOVERY', '越跑越熱', 'recovery'), ...reps(3, 8, 2, '節奏', 'TEMPO', '只能講幾個字'), step('緩和慢跑', 10, 'RECOVERY', '慢慢收', 'recovery')]),
        ],
    },
    {
        id: 'hill', type: 'hill', tag: '間歇', title: '間歇跑',
        desc: '短而快的反覆，提升最大攝氧量。每一趟都要跑得一樣快，最後一趟還留一點力。',
        difficulties: [
            level('入門', [step('暖身慢跑', 10, 'RECOVERY', '越跑越熱', 'recovery'), ...reps(6, 1, 2, '間歇', 'MILE', '接近全力但可控'), step('緩和慢跑', 7, 'RECOVERY', '慢慢收', 'recovery')]),
            level('中階', [step('暖身慢跑', 12, 'RECOVERY', '越跑越熱', 'recovery'), ...reps(5, 3, 2, '間歇', 'MILE', '接近全力但可控'), step('緩和慢跑', 10, 'RECOVERY', '慢慢收', 'recovery')]),
            level('進階', [step('暖身慢跑', 12, 'RECOVERY', '越跑越熱', 'recovery'), ...reps(6, 3, 2, '間歇', 'MILE', '接近全力但可控'), step('緩和慢跑', 10, 'RECOVERY', '慢慢收', 'recovery')]),
        ],
    },
];

/**
 * 快速訓練的個人配速：有 5K 基準才給，而且只給輕鬆段（paceKey）。
 * 沒有基準 → 原樣回傳（全部依體感）。畫面預告與開始跑步都呼叫這一支，兩邊一定一致。
 */
export function personalizeQuickSteps(steps = [], baselinePace5K = null) {
    const base = Number(baselinePace5K);
    return steps.map((s) => {
        if (!(base > 0) || !s.paceKey || PACE_SHIFT_BY_SUBTYPE[s.paceKey] == null) return { ...s };
        return { ...s, targetPace: Math.round(base + PACE_SHIFT_BY_SUBTYPE[s.paceKey]) };
    });
}

/** 卡片上的時長範圍（例：20–40 分） */
export function courseMinutesRange(course) {
    const mins = (course?.difficulties || []).map((d) => d.minutes).filter(Number.isFinite);
    if (!mins.length) return '';
    const lo = Math.min(...mins), hi = Math.max(...mins);
    return lo === hi ? `${lo} 分` : `${lo}–${hi} 分`;
}

export default { QUICK_RUN_COURSES, personalizeQuickSteps, courseMinutesRange, mainSetOf };
