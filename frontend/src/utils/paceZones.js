// paceZones.js — 月報「配速區間分佈」的純邏輯（抽出以便單元測試）
// ──────────────────────────────────────────────────────────────
// 預設用「一般市民跑者」固定區間；但若使用者所有跑步都擠在同一格
// （例如全部 >7'30" 或全部 <5'30"），固定區間就失去鑑別度，
// 改用「以本人當月中位數配速為基準」的個人化區間。
// 配速單位：秒/公里，數字越小越快。

const fmt = (sec) => {
    const t = Math.round(sec);
    return `${Math.floor(t / 60)}'${String(t % 60).padStart(2, '0')}"`;
};

/** 固定區間（由快到慢） */
export const FIXED_ZONES = [
    { key: 'fast', label: '快速跑', min: 0, max: 330, desc: '< 5\'30"' },
    { key: 'tempo', label: '節奏跑', min: 330, max: 390, desc: '5\'30"-6\'30"' },
    { key: 'aerobic', label: '有氧跑', min: 390, max: 450, desc: '6\'30"-7\'30"' },
    { key: 'easy', label: '輕鬆跑', min: 450, max: 99999, desc: '> 7\'30"' },
];

/** 依中位數建立個人化區間：<92% 快速、92–100% 節奏、100–110% 有氧、>110% 輕鬆 */
export function personalZones(medianPace) {
    const b1 = medianPace * 0.92, b2 = medianPace, b3 = medianPace * 1.10;
    return [
        { key: 'fast', label: '快速跑', min: 0, max: b1, desc: `< ${fmt(b1)}` },
        { key: 'tempo', label: '節奏跑', min: b1, max: b2, desc: `${fmt(b1)}-${fmt(b2)}` },
        { key: 'aerobic', label: '有氧跑', min: b2, max: b3, desc: `${fmt(b2)}-${fmt(b3)}` },
        { key: 'easy', label: '輕鬆跑', min: b3, max: 99999, desc: `> ${fmt(b3)}` },
    ];
}

/**
 * 計算配速區間分佈。
 * @param {Array<{pace:number}>} runs
 * @returns {{ zones: Array<{key,label,desc,count}>, total: number, personalized: boolean }}
 */
export function computePaceZones(runs = []) {
    const paces = runs.map((r) => Number(r?.pace)).filter((p) => p > 0);
    const total = paces.length;
    const countIn = (zones) => zones.map((z) => ({ ...z, count: paces.filter((p) => p >= z.min && p < z.max).length }));

    let zones = countIn(FIXED_ZONES);
    let personalized = false;

    // 鑑別度檢查：>=3 次跑步且全部落在同一固定區間 → 改用個人化區間
    if (total >= 3 && zones.filter((z) => z.count > 0).length <= 1) {
        const sorted = [...paces].sort((a, b) => a - b);
        const median = sorted.length % 2
            ? sorted[(sorted.length - 1) / 2]
            : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
        zones = countIn(personalZones(median));
        personalized = true;
    }
    return { zones, total: total || 1, personalized };
}

export default { computePaceZones, personalZones, FIXED_ZONES };
