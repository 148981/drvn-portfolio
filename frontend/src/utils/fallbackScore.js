// ─────────────────────────────────────────────────────────────
// 🏅 Fallback Session Score — 無心率時的後備算分
//
// 背景：SESSION SCORE 原本只用心率 Zone 累加（每秒依 Zone 加分）。
// 沒戴手錶 / 沒授權 HealthKit / 桌面測試 → 全程無心率 → 每秒加 0 → 跑完 0 PTS。
// 但 app 主打「手機 GPS 為單一定位來源、手錶只是輔助」，所以沒手錶也該有合理分數。
//
// 後備算分：用距離 / 時間 / 配速估一個努力分，量級對齊心率版（大致 ~0.5~2 分/分鐘）。
//   base   = 距離(km) × 10           → 跑越遠分越多（主項）
//   timeB  = 時間(分) × 0.6          → 跑越久分越多
//   paceB  = 配速加成                → 配速越快給越多（用合理區間 mapping，避免極端值）
// 三者相加。只有「真的沒有有效心率分數」時才用它，有心率就維持原本心率版，不打架。
// ─────────────────────────────────────────────────────────────

// 配速(秒/km) → 加成分。越快越高，但夾在合理區間避免 GPS 抖動的極端值。
const paceBonus = (avgPaceSec, distanceKm) => {
    if (!avgPaceSec || avgPaceSec <= 0 || distanceKm < 0.3) return 0;
    // 6'00"/km(360s)當基準 0 加成；每快 30 秒 +3 分，每慢 30 秒 -2 分（夾 -10..+20）
    const deltaSec = 360 - avgPaceSec;
    const raw = (deltaSec / 30) * (deltaSec >= 0 ? 3 : 2);
    return Math.max(-10, Math.min(20, raw));
};

/**
 * 由距離/時間/配速估算後備分數。
 * @param {object} p { distanceKm, durationSec, avgPaceSec }
 * @returns {number} 後備分數（≥ 0，四捨五入到 1 位）
 */
export const computeFallbackScore = ({ distanceKm = 0, durationSec = 0, avgPaceSec = 0 } = {}) => {
    const dist = Math.max(0, Number(distanceKm) || 0);
    const durMin = Math.max(0, (Number(durationSec) || 0) / 60);
    if (dist <= 0 && durMin <= 0) return 0;

    const base = dist * 10;
    const timeB = durMin * 0.6;
    const paceB = paceBonus(Number(avgPaceSec) || 0, dist);

    const score = Math.max(0, base + timeB + paceB);
    return Math.round(score * 10) / 10;
};

/**
 * 取得「最終分數」：有心率分數就用心率分數，否則用後備分。
 * 這是唯一入口，讓有/無心率兩條路不會互相覆蓋。
 * @param {number} hrScore   心率版累加分數（cardioData.score / latestRef.score）
 * @param {object} runStats  { distanceKm, durationSec, avgPaceSec }
 * @returns {{ score:number, source:'hr'|'fallback' }}
 */
export const resolveSessionScore = (hrScore, runStats) => {
    const hr = Number(hrScore) || 0;
    if (hr > 0.5) return { score: Math.round(hr * 10) / 10, source: 'hr' };
    const fb = computeFallbackScore(runStats);
    return { score: fb, source: 'fallback' };
};
