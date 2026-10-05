// ════════════════════════════════════════════════════════════════
//  planDeloadNormalizer.js — preset 計劃「第 4 週減量」正規化
//
//  SOP 第五階段：Week 4 必須是減量週（sets × 0.6，最少 2 組），給神經系統超補償。
//  但手寫的 preset 計劃多把 W4 設計成「巔峰加量」（組數比前三週更高），違反 SOP。
//  這支函式在計劃載入時就地把 W4 的每個動作組數降到「前三週峰值 × 0.6（最少 2）」，
//  動作與次數維持不變（次數不降，靠降組數＋降重達到減量），並把週名/當日焦點裡的
//  「巔峰/極限/爆發/轟炸」等加量字眼改為減量語氣，避免與實際內容矛盾。
// ════════════════════════════════════════════════════════════════

const PEAK_WORD_RE = /(巔峰|極限|爆發|轟炸|衝刺|突破)/g;

const toInt = (v) => {
    const n = parseInt(String(v), 10);
    return Number.isFinite(n) ? n : 0;
};

export const applyWeek4Deload = (plan) => {
    if (!plan?.levels) return plan;
    Object.values(plan.levels).forEach((lv) => {
        const weeks = lv.weeks;
        if (!Array.isArray(weeks) || weeks.length < 4) return;
        const w4 = weeks[3];
        if (!w4?.days) return;

        // 1) 計算前三週每個動作的「峰值組數」
        const peak = {};
        weeks.slice(0, 3).forEach((w) => (w.days || []).forEach((d) =>
            (d.exercises || []).forEach((e) => {
                const s = toInt(e.sets);
                if (s > (peak[e.name] || 0)) peak[e.name] = s;
            })
        ));

        // 2) W4 每個動作：sets = max(2, floor(peak × 0.6))；次數/休息不動
        w4.days.forEach((d) => {
            (d.exercises || []).forEach((e) => {
                const base = peak[e.name] || toInt(e.sets) || 3;
                const deloadSets = Math.max(2, Math.floor(base * 0.6));
                if (deloadSets < toInt(e.sets) || !Number.isFinite(toInt(e.sets))) {
                    e.sets = deloadSets;
                } else {
                    // W4 原本就 ≤ 0.6×peak（已是減量）→ 仍確保不高於 deloadSets
                    e.sets = Math.min(toInt(e.sets), deloadSets);
                }
            });
            // 當日焦點若含加量字眼 → 改減量語氣
            if (typeof d.focus === 'string' && PEAK_WORD_RE.test(d.focus)) {
                d.focus = d.focus.replace(PEAK_WORD_RE, '減量恢復');
            }
        });

        // 3) 週名統一為減量語氣（若原本是加量字眼或非恢復語氣）
        if (typeof w4.name === 'string' && !/(恢復|減量|deload)/i.test(w4.name)) {
            w4.name = '減量超補週';
        }
    });
    return plan;
};

export default applyWeek4Deload;
