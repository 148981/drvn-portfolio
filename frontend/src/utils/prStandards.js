/**
 * prStandards.js —— 個人紀錄評級的「真實人口分布」對照表（單一真相源）
 * ════════════════════════════════════════════════════════════════
 * 評級不是我們自己拍腦袋定的門檻，是對照真實族群的百分位：
 *
 *   等級       對照點              意思
 *   鑽石       ≥ 第 95 百分位       贏過 95% 的人（Elite）
 *   白金       ≥ 第 80 百分位       贏過 80%（Advanced）
 *   黃金       ≥ 第 50 百分位       贏過一半（Intermediate）
 *   白銀       ≥ 第 20 百分位       贏過 20%（Novice）
 *   青銅       其餘                  剛起步（Beginner 附近）
 *
 * 資料來源（2026 查證）：
 *   · 跑步：Running Level（runninglevel.com），全年齡、依性別的 1 英里／5K／10K／半馬／全馬分級。
 *     比的是「有在跑的人」，不是全體人口。
 *   · 重訓：Strength Level（strengthlevel.com，1.5 億筆以上使用者上傳紀錄），
 *     依性別的「1RM ÷ 體重」倍數。比的是「有在練的人」。
 *
 * ⚠️ 沒有性別（或重訓沒有體重）就不評級 —— 用「75 公斤男性」硬算出來的等級是編的。
 * ⚠️ 百分位是在相鄰兩個對照點之間線性內插的「約略值」，畫面上一律寫「約」。
 */

/** 各分級對照點的百分位 */
const PCTS = [5, 20, 50, 80, 95];

/* ── 跑步：完成時間（秒），順序 = 5%、20%、50%、80%、95% ── */
const RUN = {
    male: {
        mile: [565, 468, 398, 346, 308],
        '5k': [1889, 1579, 1351, 1184, 1060],
        '10k': [3930, 3279, 2803, 2454, 2198],
        half: [8697, 7271, 6213, 5433, 4860],
        full: [17821, 15005, 12896, 11322, 10153],
    },
    female: {
        mile: [640, 540, 464, 408, 366],
        '5k': [2127, 1808, 1567, 1384, 1247],
        '10k': [4429, 3760, 3253, 2871, 2586],
        half: [9779, 8328, 7212, 6366, 5730],
        full: [19945, 17095, 14889, 13201, 11923],
    },
};
const MILE_KM = 1.609344;

/* ── 重訓：1RM ÷ 體重，順序 = 5%、20%、50%、80%、95% ── */
const LIFT = {
    male: {
        bench: [0.5, 0.7, 1.25, 1.75, 2.2],
        squat: [0.75, 0.93, 1.5, 2.25, 2.75],
        deadlift: [1.0, 1.4, 2.0, 2.5, 3.0],
        ohp: [0.35, 0.57, 0.8, 1.1, 1.4],
    },
    female: {
        bench: [0.25, 0.5, 0.75, 1.0, 1.3],
        squat: [0.5, 0.8, 1.25, 1.5, 1.95],
        deadlift: [0.5, 0.95, 1.25, 1.75, 2.3],
        ohp: [0.2, 0.35, 0.5, 0.75, 1.0],
    },
};

const TIER_AT = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];

/**
 * 在對照點之間內插出約略百分位（1–99）。
 * @param {number} v       使用者的數值
 * @param {number[]} pts   五個對照點（對應 5/20/50/80/95 百分位）
 * @param {boolean} lowerIsBetter  跑步時間越小越好
 */
export function percentileOf(v, pts, lowerIsBetter = false) {
    if (!Number.isFinite(v) || !Array.isArray(pts)) return null;
    const x = lowerIsBetter ? -v : v;
    const p = lowerIsBetter ? pts.map((t) => -t) : pts;
    if (x <= p[0]) return Math.max(1, Math.round(5 - 4 * Math.min(1, (p[0] - x) / Math.abs(p[1] - p[0]))));
    if (x >= p[4]) return Math.min(99, Math.round(95 + 4 * Math.min(1, (x - p[4]) / Math.abs(p[4] - p[3]))));
    for (let i = 0; i < 4; i++) {
        if (x >= p[i] && x <= p[i + 1]) {
            const r = (x - p[i]) / (p[i + 1] - p[i]);
            return Math.round(PCTS[i] + r * (PCTS[i + 1] - PCTS[i]));
        }
    }
    return null;
}

const tierOfPct = (pct) => {
    if (pct == null) return null;
    if (pct >= 95) return 'diamond';
    if (pct >= 80) return 'platinum';
    if (pct >= 50) return 'gold';
    if (pct >= 20) return 'silver';
    return 'bronze';
};

/**
 * 跑步評級。
 * @param {'1k'|'5k'|'10k'|'half'|'full'} dist
 * @param {number} value  1k 傳「每公里配速秒數」，其他傳「完成秒數」
 * @param {'male'|'female'|null} gender
 * @returns {{tier:string, pct:number, pop:string}|null}  沒性別 → null
 */
export function gradeRun(dist, value, gender) {
    const g = RUN[gender];
    if (!g || !(value > 0)) return null;
    let pts, v = value;
    if (dist === '1k') { pts = g.mile.map((t) => t / MILE_KM); }   // 英里完成時間 → 每公里配速
    else pts = g[dist];
    if (!pts) return null;
    const pct = percentileOf(v, pts, true);
    return { tier: tierOfPct(pct), pct, pop: '跑者' };
}

/** Epley 估算 1RM（次數封頂 10 —— 超過 10 下的估算誤差太大） */
export const estimate1RM = (w, reps) => {
    const r = Math.max(1, Math.min(10, Number(reps) || 1));
    return r === 1 ? w : w * (1 + r / 30);
};

/**
 * 重訓評級（用估算 1RM ÷ 體重對照）。
 * @param {'bench'|'squat'|'deadlift'|'ohp'} lift
 * @returns {{tier:string, pct:number, pop:string, ratio:number}|null}  沒性別或體重 → null
 */
export function gradeLift(lift, weightKg, reps, bodyweightKg, gender) {
    const g = LIFT[gender];
    if (!g || !g[lift] || !(weightKg > 0) || !(bodyweightKg > 30)) return null;
    const ratio = estimate1RM(weightKg, reps) / bodyweightKg;
    const pct = percentileOf(ratio, g[lift], false);
    return { tier: tierOfPct(pct), pct, pop: '訓練者', ratio: Math.round(ratio * 100) / 100 };
}

/**
 * 同一個成績，分別放在「一般男性」與「一般女性」的分布裡各贏過約多少 %。
 * 排名頁用：除了 DRVN 裡的名次，也讓人知道自己在一般跑者／訓練者裡的位置。
 * 跑步不需要性別也算得出來（兩邊都算）；重訓需要體重。
 */
export function runPctByGender(dist, value) {
    if (!(value > 0)) return null;
    const out = {};
    ['male', 'female'].forEach((g) => {
        const r = gradeRun(dist, value, g);
        if (r && r.pct != null) out[g] = r.pct;
    });
    return Object.keys(out).length ? out : null;
}

export function liftPctByGender(lift, weightKg, reps, bodyweightKg) {
    const out = {};
    ['male', 'female'].forEach((g) => {
        const r = gradeLift(lift, weightKg, reps, bodyweightKg, g);
        if (r && r.pct != null) out[g] = r.pct;
    });
    return Object.keys(out).length ? out : null;
}

/** 「贏過約 63% 的跑者」—— 畫面直接用 */
export const pctLine = (g) => (g && g.pct != null ? `贏過約 ${g.pct}% 的${g.pop}` : '');

export const PR_TIER_ORDER = TIER_AT;
export default { gradeRun, gradeLift, percentileOf, estimate1RM, pctLine };
