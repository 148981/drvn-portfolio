import assert from 'node:assert/strict';
import { applyCourseCardioPlan, describeCourseImpact } from '../src/utils/courseApply.js';
import { LEAN_LIGHT_PLAN } from '../src/data/leanLightPlanData.js';
import { RUNNERS_ARMOR_PLAN } from '../src/data/runnersArmorPlanData.js';
import { readTrainingLinkage } from '../src/utils/trainingFocus.js';

const values = new Map();
globalThis.localStorage = {
    getItem: k => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, String(v)),
    removeItem: k => values.delete(k),
};
globalThis.window = { localStorage: globalThis.localStorage };
values.set('drvn_run_cycle_test', '{"planId":"old"}');
values.set('u_test_run_day_overrides', '{"old":true}');
const before = [...values];
const failed = await applyCourseCardioPlan({ plan: LEAN_LIGHT_PLAN, levelKey: 'beginner', userId: 'test', apiClient: {
    post: async () => { throw new Error('offline'); },
} });
assert.equal(failed.ok, false);
assert.deepEqual([...values], before);

let submitted;
const success = await applyCourseCardioPlan({ plan: LEAN_LIGHT_PLAN, levelKey: 'beginner', userId: 'test', startDate: '2026-09-07', apiClient: {
    post: async (url, body) => {
        assert.equal(url, '/api/cardio-plan/save');
        submitted = body.plan;
        return { data: { status: 'success', plan_id: 'saved', plan: { ...body.plan, plan_id: 'saved' } } };
    },
} });
assert.equal(success.ok, true);
assert.equal(submitted.start_date, '2026-09-07');
assert.equal(submitted.source_course.id, LEAN_LIGHT_PLAN.id);
assert.equal(JSON.parse(values.get('drvn_run_cycle_test')).planId, 'saved');
assert.equal(JSON.parse(values.get('u_test_onboarding_cardio_plan')).plan_id, 'saved');
assert.equal(values.has('u_test_run_day_overrides'), false);
const current = [...values];
assert.equal(describeCourseImpact(RUNNERS_ARMOR_PLAN, 'beginner').runIsExternal, true);
const armor = await applyCourseCardioPlan({ plan: RUNNERS_ARMOR_PLAN, levelKey: 'beginner', userId: 'test' });
assert.equal(armor.skipped, true);
assert.deepEqual([...values], current);
values.set('currentPlan_test', JSON.stringify({ source_course: { name: '燃脂輕跑' }, linked_cardio_plan_id: 'saved', courseSystem: 'hybrid' }));
assert.equal(readTrainingLinkage('test').status, 'linked');
values.set('drvn_run_cycle_test', '{"planId":"different"}');
assert.equal(readTrainingLinkage('test').status, 'separated');
console.log('PASS: hybrid saves canonical run ID/source/date/cache; failed saves preserve current run; runners armor keeps existing running plan');
