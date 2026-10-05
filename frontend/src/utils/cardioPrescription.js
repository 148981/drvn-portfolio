import { RPE_BANDS } from './rpeMapping';
import { reconcileSubtypeWithDistance, titleForRun } from './runDistanceClass';

// 課型配速偏移（秒/公里，相對「5K 比賽配速」基準），生成、調整、校準共用這一份；後端 core/cardio_plan_rules.PACE_SHIFT 同值。
//   節奏跑＝乳酸閾值，約可撐 1 小時的配速 → 比 5K 配速慢約 15 秒（Daniels T pace ≈ 5K +15～20 s/km）
//   間歇跑＝最大攝氧量強度，約 3K～5K 比賽配速 → 比 5K 配速快約 10 秒（I pace ≈ 5K −5～15 s/km）
//   舊值 tempo −15／interval −40 讓節奏跑比 5K 比賽還快、間歇接近 1500 公尺配速，強度一律過高。
//   輕鬆／中距離／長跑＝Daniels E 區（59–74% VO2max），長跑也用 E 配速（Daniels：L 跟 E 同一區）：
//     舊值 easy +60／long +45 對 5K 25 分鐘以上的人快過 E 區，長跑甚至等於他的馬拉松配速 ——
//     長跑變成一堂速度課。改成 easy +90（與建立頁、成果預估寫的「輕鬆 ≈ 5K +90 秒」一致）、
//     long +85（比馬拉松配速慢 ≥5%）、恢復 +120（比輕鬆再慢一截）。依據與驗算見 scripts/RUN_PLAN_STANDARD.md。
export const PACE_SHIFT_BY_SUBTYPE = { long: 85, medium: 88, easy: 90, recovery: 120, tempo: 15, interval: -10 };
const TYPES = { long: 'long', medium: 'recovery', easy: 'recovery', recovery: 'recovery', tempo: 'speed', interval: 'speed' };
const BANDS = { long: 'EASY', medium: 'EASY', easy: 'EASY', recovery: 'RECOVERY', tempo: 'TEMPO', interval: 'MILE' };
const THEMES = { long: 'long_steady', medium: 'medium_steady', easy: 'easy_breath', recovery: 'recovery_drift', tempo: 'tempo_threshold', interval: 'vo2_interval' };

export function normalizeRunPrescription(brick, baselinePace5K = null) {
    if (brick.type === 'strength' || brick.subtype === 'strength' || brick.distance_km == null) return brick;
    const original = brick.subtype || (brick.type === 'speed' ? 'tempo' : brick.type) || 'easy';
    const subtype = reconcileSubtypeWithDistance(original, brick.distance_km);
    // Preserve a custom pace when only distance changes. When the class changes,
    // preserve its implied baseline and use the existing offset for the new class.
    const baseline = Number(baselinePace5K) > 0 ? Number(baselinePace5K)
        : Number(brick.target_pace_sec) > 0
            ? Number(brick.target_pace_sec) - (PACE_SHIFT_BY_SUBTYPE[original] ?? 60) : 360;
    const pace = Math.max(1, Math.round(baseline + (PACE_SHIFT_BY_SUBTYPE[subtype] ?? 60)));
    const band = RPE_BANDS[BANDS[subtype] || 'EASY'];
    return {
        ...brick, subtype, type: TYPES[subtype] || 'recovery',
        title: titleForRun(subtype, brick.distance_km), theme_id: THEMES[subtype],
        rpe_band: { min: band.min, max: band.max, label: band.label, color: band.color },
        target_pace_sec: pace,
        target_pace_label: `${Math.floor(pace / 60)}:${String(pace % 60).padStart(2, '0')}`,
        duration_min: Math.round(brick.distance_km * pace / 60),
    };
}

export function summarizeCardioWeek(week) {
    const bricks = week.bricks || [];
    const runs = bricks.filter(b => b.distance_km != null && b.type !== 'strength');
    return { ...week,
        target_mileage_km: Math.round(runs.reduce((s, b) => s + (Number(b.distance_km) || 0), 0) * 10) / 10,
        run_sessions: runs.length, strength_sessions: bricks.length - runs.length,
        total_duration_min: bricks.reduce((s, b) => s + (Number(b.duration_min) || 0), 0),
    };
}
