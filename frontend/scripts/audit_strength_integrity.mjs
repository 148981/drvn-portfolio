// Run with: node --import ./scripts/_register_hooks.mjs scripts/audit_strength_integrity.mjs
import { generateUnifiedPlan, validatePlan, estimateDayMinutes } from '../src/utils/UnifiedTrainingEngine.js';

const report = { configurations: 0, exceptions: [], findings: {} };
const record = (code, context) => {
    const row = report.findings[code] ||= { count: 0, examples: [] };
    row.count++;
    if (row.examples.length < 2) row.examples.push(context);
};
for (const level of ['beginner', 'intermediate', 'advanced'])
for (const daysPerWeek of [1, 2, 3, 4, 5, 6])
for (const equipment of ['mixed', 'bodyweight', 'equipment'])
for (const trainingStyle of ['bodybuilding', 'strength'])
for (const selectedHashtags of [[], ['chest'], ['legs'], ['chest', 'back', 'legs'], ['shoulders', 'back', 'glutes'], ['chest', 'arms']])
for (const sessionDuration of [30, 60]) {
    const config = { level, daysPerWeek, equipment, trainingStyle, selectedHashtags, sessionDuration };
    report.configurations++;
    let plan;
    try { plan = generateUnifiedPlan(config); }
    catch (e) { report.exceptions.push({ config, error: e.message }); continue; }
    for (const issue of validatePlan(plan)) record('internal_validator', { config, issue });
    if (plan.weeks.length !== 4) record('week_count', { config });
    for (const w of plan.weeks) {
        if (w.days.length !== daysPerWeek) record('day_count', { config, actual: w.days.length });
        let previousExtreme = false;
        for (const d of w.days) {
            const exs = d.exercises.filter(e => !e.isWarmup && e.tier !== 4);
            const ctx = { config, week: w.week_number, day: d.day_number };
            if (!exs.length) record('empty_day', ctx);
            const names = exs.map(e => e.nameEn || e.name);
            if (new Set(names).size !== names.length) record('duplicate_day', { ...ctx, names });
            const extreme = exs.filter(e => e.cns === 'extreme');
            if (extreme.length > 1) record('multiple_extreme', { ...ctx, names: extreme.map(e => e.name) });
            if (extreme.length && previousExtreme) record('consecutive_extreme', ctx);
            previousExtreme = extreme.length > 0;
            const time = estimateDayMinutes(d.exercises, d.warmup);
            if (Number(d.time) !== time) record('stale_time', { ...ctx, displayed: d.time, recomputed: time });
            if (time > sessionDuration + 5) record('over_requested_time', { ...ctx, time });
            const groups = {};
            for (const e of exs) {
                if (!(Number.isInteger(e.sets) && e.sets > 0) || !e.reps || e.rest == null) record('incomplete_prescription', { ...ctx, name: e.name });
                if (equipment === 'bodyweight' && !['bodyweight', 'band'].includes(e.eq)) record('unavailable_equipment', { ...ctx, name: e.name, equipment: e.eq });
                if (e.supersetId) (groups[e.supersetId] ||= []).push(e);
                if (w.phase === 'Deload' && e.isDropSet) record('deload_drop_set', ctx);
            }
            for (const group of Object.values(groups)) {
                if (group.length !== 2) record('orphan_superset', { ...ctx, names: group.map(e => e.name) });
                if (group.filter(e => ['extreme', 'high'].includes(e.cns)).length >= 2) record('heavy_superset', { ...ctx, names: group.map(e => e.name) });
                if (group.length === 2 && group[0].sets !== group[1].sets) record('unequal_superset_rounds', { ...ctx, group: group.map(e => ({ name: e.name, sets: e.sets, order: e.supersetOrder })) });
            }
        }
    }
}
console.log(JSON.stringify(report, null, 2));
// 時間上限仍是待處理的產品規則；其餘資料一致性錯誤必須使驗證失敗。
if (report.exceptions.length || Object.keys(report.findings).some(k => k !== 'over_requested_time')) {
    process.exitCode = 1;
}
