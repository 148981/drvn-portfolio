import assert from 'node:assert/strict';
import { activateStrengthPlan, recordStrengthPlanDay, resetStrengthPlanCompletion } from '../src/utils/strengthPlanCompletion.js';
const data = new Map();
const storage = {
    get length() { return data.size; }, key: i => [...data.keys()][i] ?? null,
    getItem: key => data.get(key) ?? null, setItem: (key, val) => data.set(key, String(val)), removeItem: key => data.delete(key),
};
const completed = () => JSON.parse(storage.getItem('completed_workouts_u_week1') || '[]');
activateStrengthPlan('u', 'A', storage);
recordStrengthPlanDay('u', 'A', 1, 1, storage);
assert.deepEqual(completed(), [1]);
activateStrengthPlan('u', 'B', storage);
assert.deepEqual(completed(), []);
recordStrengthPlanDay('u', 'A', 1, 2, storage);
assert.deepEqual(completed(), []); // A 的晚到事件不污染 B
recordStrengthPlanDay('u', 'B', 1, 3, storage);
recordStrengthPlanDay('u', 'B', 1, 3, storage);
assert.deepEqual(completed(), [3]);
activateStrengthPlan('u', 'A', storage);
assert.deepEqual(completed(), [1, 2]);
activateStrengthPlan('u', 'B', storage);
assert.deepEqual(completed(), [3]);
assert.equal(recordStrengthPlanDay('u', 'B', 0, 1, storage), false);
recordStrengthPlanDay('another', 'B', 1, 4, storage);
assert.deepEqual(completed(), [3]);
storage.setItem('completed_workouts_legacy_week1', '[1]');
activateStrengthPlan('legacy', 'new', storage);
assert.equal(storage.getItem('completed_workouts_legacy_week1'), null);
assert(storage.getItem('drvn:strength-completion-unattributed:legacy'));
storage.setItem('active_plan_id_known', 'old');
storage.setItem('completed_workouts_known_week1', '[2]');
activateStrengthPlan('known', 'new', storage);
activateStrengthPlan('known', 'old', storage);
assert.equal(storage.getItem('completed_workouts_known_week1'), '[2]');
console.log('PASS: plan/user isolation, late completion, switching back, deduplication, invalid indices and legacy attribution');
resetStrengthPlanCompletion('u', 'B', storage);
activateStrengthPlan('u', 'A', storage);
activateStrengthPlan('u', 'B', storage);
assert.deepEqual(completed(), []);
assert([...data.keys()].some(k => k.includes(':archive:')));
console.log('PASS: explicit cycle reset is archived and not resurrected on switching');
