import assert from 'node:assert/strict';
import { generateUnifiedPlan } from '../src/utils/UnifiedTrainingEngine.js';

let count = 0;
for (const level of ['beginner', 'intermediate', 'advanced'])
for (const equipment of ['mixed', 'equipment', 'bodyweight'])
for (const trainingStyle of ['strength', 'bodybuilding'])
for (const selectedHashtags of [[], ['chest', 'back', 'legs']])
for (const sessionDuration of [30, 60]) {
    const plan = generateUnifiedPlan({ level, equipment, trainingStyle, selectedHashtags, sessionDuration, daysPerWeek: 1 });
    count++;
    for (const week of plan.weeks) {
        const day = week.days[0];
        const muscles = new Set(day.exercises.map(e => e.muscle));
        for (const muscle of ['quads', 'chest', 'back']) {
            assert(muscles.has(muscle), JSON.stringify({ level, equipment, trainingStyle, selectedHashtags, sessionDuration, week: week.week_number, missing: muscle }));
        }
        assert.equal(day.time_overflow_minutes, Math.max(0, Number(day.time) - sessionDuration));
        assert.equal(day.time_budget_met, Number(day.time) <= sessionDuration);
    }
    const feasible = plan.weeks.every(w => w.days.every(d => d.time_budget_met));
    assert.equal(plan.time_budget_met, feasible);
    assert.equal(Boolean(plan.time_hint), !feasible);
    if (!feasible) assert(plan.ai_insight.includes(plan.time_hint));
}
const specific = generateUnifiedPlan({ level: 'beginner', daysPerWeek: 1, selectedHashtags: ['legs'] });
assert(specific.weeks.every(w => w.days.every(d => d.exercises.every(e => !['chest', 'back'].includes(e.muscle)))));
console.log(`PASS: ${count} single-day configurations, all four weeks cover lower/push/pull; time feasibility and explicit lower-only scope preserved`);
