// Node >= 22.15 (registerHooks); no browser or native bundler required.
import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
registerHooks({ resolve(s, c, next) {
    try { return next(s, c); } catch (e) {
        if (s.startsWith('.') && !/\.[a-z]+$/i.test(s)) return next(s + '.js', c);
        throw e;
    }
} });
const engine = await import('../src/utils/cardioPlanFusionEngine.js');
const settle = await import('../src/utils/cardioSettlementEngine.js');
const progress = await import('../src/utils/cardioPlanProgress.js');
const actuals = await import('../src/utils/cardioPlanActuals.js');
const { normalizeRunPrescription: normalize, PACE_SHIFT_BY_SUBTYPE: SHIFT } = await import('../src/utils/cardioPrescription.js');
const week = { week_index: 2, target_mileage_km: 10, bricks: [
    normalize({ brick_id: 'a', type: 'speed', subtype: 'tempo', distance_km: 4, status: 'pending' }, 360),
    normalize({ brick_id: 'b', type: 'recovery', subtype: 'easy', distance_km: 6, status: 'pending' }, 360),
    { brick_id: 'c', type: 'strength', subtype: 'strength', duration_min: 30, status: 'pending' },
] };
const fixtures = [0.8, 1, 1.07].map(multiplier => {
    const adjustments = { next_week_mileage_multiplier: multiplier, intensity_shift: -1, insert_recovery: true };
    const expected = settle.applyAdjustmentsToWeek(week, adjustments);
    const plan = { weeks: [week, expected, { ...week, week_index: 3 }, { ...week, week_index: 4, is_deload: true }] };
    return { week, adjustments, expected, plan, meta: engine.finalizePlanNumbers(plan).meta };
});
if (process.argv.includes('--fixtures')) {
    process.stdout.write(JSON.stringify(fixtures));
} else {
    let cases = 0;
    for (const goal of ['fat_loss', 'aerobic_base', 'race_5k_10k', 'race_half', 'race_full'])
    for (const currentLevel of ['beginner', 'intermediate', 'advanced'])
    for (const sessionsPerWeek of [1, 2, 3, 4, 5, 6, 7])
    for (const totalWeeks of [4, 8, 14])
    for (const currentWeeklyKm of [0, 1, 5, 15, 40])
    for (const includeStrength of [false, true]) {
        const p = engine.generateCardioPlan({ goal, currentLevel, sessionsPerWeek, totalWeeks, currentWeeklyKm, includeStrength });
        for (const w of p.weeks) {
            const runs = w.bricks.filter(b => b.type !== 'strength');
            assert.ok(runs.length <= sessionsPerWeek, JSON.stringify({ goal, currentLevel, sessionsPerWeek, w }));
            assert.equal(w.target_mileage_km, Math.round(runs.reduce((s, b) => s + b.distance_km, 0) * 10) / 10);
            for (const b of runs) {
                assert.ok(Number.isFinite(b.target_pace_sec) && b.distance_km >= 0.5);
                assert.equal(b.duration_min, Math.round(b.distance_km * b.target_pace_sec / 60));
                assert.equal(b.title, normalize(b).title);
            }
        }
        assert.equal(p.meta.totals.total_km, Math.round(p.weeks.reduce((s, w) => s + w.target_mileage_km, 0) * 10) / 10);
        cases++;
    }
    const adjusted = fixtures[0].expected;
    assert.equal(adjusted.target_mileage_km, 8);
    assert.equal(adjusted.bricks.length, week.bricks.length);
    assert.deepEqual(adjusted.bricks[2], week.bricks[2]);
    assert.equal(adjusted.bricks[0].subtype, 'recovery');
    assert.equal(adjusted.bricks[0].target_pace_sec, 360 + SHIFT.recovery);   // 節奏跑降成恢復跑：同一個 5K 基準 + 恢復跑偏移
    const partial = { ...week, bricks: [{ ...week.bricks[0], status: 'partial', actual_distance_km: 1 }] };
    assert.deepEqual(settle.applyAdjustmentsToWeek(partial, fixtures[0].adjustments), partial);
    assert.equal(actuals.actualRunKm({ status: 'completed', distance_km: 5, actual_distance_km: 0 }), 0);
    assert.equal(actuals.paceCalibrationSamples({ bricks: [{ status: 'completed', distance_km: 5, duration_min: 30 }] }).length, 0);
    assert.equal(settle.deriveWeekStats(partial).actual_mileage_km, 1);
    assert.equal(settle.deriveWeekStats({ bricks: [{ status: 'completed', user_rpe: 9, rpe_band: { min: 5, max: 6 } }] }).avg_rpe, 9);
    const p = { weeks: [{ week_index: 1, settlement: { apply_adjustments: false }, bricks: partial.bricks }, week] };
    assert.equal(progress.adjustNextWeek(p, 1).changed, false);
    const begun = { weeks: [{ week_index: 1, bricks: partial.bricks }, partial] };
    assert.equal(progress.adjustNextWeek(begun, 1).changed, false);
    assert.equal(progress.computePlanProgress(p).overall.actualKm, 1);
    const calibrated = settle.applyCalibrationToPlan(p, { newBaselinePace5K: 400, samples: 1 }, 1);
    assert.deepEqual(calibrated.weeks[0], p.weeks[0]);
    assert.equal(calibrated.weeks[1].bricks[1].target_pace_sec, 400 + SHIFT.medium);   // 6 km → 中距離跑，新基準 400 + 中距離偏移
    const sessions = [1, 2, 3, 4].map(i => ({ id: i, sport: 'running', distance_km: 6, date: new Date(Date.now() - i * 86400000).toISOString() }));
    const full = { bricks: [{ ...week.bricks[0], status: 'completed', actual_distance_km: 4, user_rpe: 6 }] };
    const result = settle.evaluateWeek(full, [], { allSessions: sessions });
    assert.notEqual(result.verdict, 'promote');
    assert.ok(result.adjustments.next_week_mileage_multiplier <= 1);
    assert.deepEqual(settle.computeACWR([...sessions, sessions[0], { ...sessions[0], id: 'bike', sport: 'cycling' }, { ...sessions[0], id: 'future', date: new Date(Date.now() + 86400000).toISOString() }]), settle.computeACWR(sessions));
    assert.deepEqual(settle.computeACWR(sessions.map(s => ({ ...s, distance_km: undefined, metrics: { distance_km: 6 } }))), settle.computeACWR(sessions));
    assert.deepEqual(settle.computeACWR([...sessions, { ...sessions[0], id: 'sim', source: 'simulation' }]), settle.computeACWR(sessions));
    // RPE 回寫：buildActivePlanFromBrick 要帶 brickId 與 rpe_band（跑完 RPE 表單與 log-rpe 都靠它）
    const { buildActivePlanFromBrick } = await import('../src/utils/brickThemeMapping.js');
    const themes = [{ id: 'recovery', title: 'R', type: 'run', difficulties: [{ level: 1, steps: [{ name: '暖身', duration: 300 }, { name: '巡航', duration: 1200 }, { name: '緩和', duration: 300 }] }] }];
    const active = buildActivePlanFromBrick({ brick_id: 'rb', type: 'recovery', duration_min: 30, rpe_band: { min: 3, max: 4 } }, themes);
    assert.equal(active.brickId, 'rb');
    assert.deepEqual(active.rpe_band, { min: 3, max: 4 });
    // 週結算提示：partial 磚也算處理過（hasBrickActivity）
    assert.equal(actuals.hasBrickActivity({ status: 'partial' }), true);
    console.log(`PASS: ${cases} generation configurations; settlement, actuals, calibration and lifecycle regressions.`);
}
