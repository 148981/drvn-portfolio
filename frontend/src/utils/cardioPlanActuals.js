// Plan targets are prescriptions, never measurements. Keep explicit zero and
// partial effort distinct from a missing measurement throughout the lifecycle.
export function nonNegativeMeasurement(value) {
    if (value == null || value === '' || typeof value === 'boolean') return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

export function actualRunKm(brick) {
    return nonNegativeMeasurement(brick?.actual_distance_km) ?? 0;
}

export function hasBrickActivity(brick) {
    return ['completed', 'partial', 'skipped'].includes(brick?.status)
        || actualRunKm(brick) > 0
        || (nonNegativeMeasurement(brick?.actual_duration_min) ?? 0) > 0;
}

export function paceCalibrationSamples(week) {
    return (week?.bricks || [])
        .filter(b => b.type !== 'strength' && b.subtype !== 'strength')
        .map(b => ({
            distance_km: nonNegativeMeasurement(b.actual_distance_km),
            duration_min: nonNegativeMeasurement(b.actual_duration_min),
            actual_pace_sec: nonNegativeMeasurement(b.actual_pace_sec),
            brick_subtype: b.subtype,
            // 場地：跑步機／爬升多的路配速不能直接比（utils/runPlaceFeedback.flatEquivalentPace）
            elev_gain_m: nonNegativeMeasurement(b.actual_elev_gain_m),
            indoor: !!b.actual_indoor,
        }))
        .filter(s => s.actual_pace_sec > 0 || (s.distance_km > 0 && s.duration_min > 0));
}
