import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recordStrengthPlanDay, readStrengthPlanDays } from '../src/utils/strengthPlanCompletion.js';

// 執行實際元件內的儲存區塊；不需要登入或寫入真實使用者資料。
// 🔧 [2026-10] 元件的儲存流程改成「先組 training_schedule（讀元件裡的 scheduleMap）→ activateProgram 送
//    /api/training-program/activate」。以前只截 planToSave 那一段、又沒把元件作用域的 scheduleMap 傳進去，
//    腳本自己丟 ReferenceError（產品程式沒問題：scheduleMap 是元件裡的 useMemo）。
//    現在從 trainingSchedule 截到拿到 finalPlan，元件作用域的變數由這裡注入，送出走真正的 activateProgram。
const mem = new Map();
globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
};
const { activateProgram, newProgramId, withExistingRunSchedule } = await import('../src/utils/trainingProgram.js');
const source = readFileSync(new URL('../src/components/WorkoutPlanGeneratorViewMobile.jsx', import.meta.url), 'utf8');
const start = source.indexOf('            const trainingSchedule = {};');
const end = source.indexOf("            localStorage.setItem('currentPlan'", start);
assert(start >= 0 && end > start, '找不到元件裡的儲存區塊');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
// redesignCarry：換部位重排時要一起存的季數／換季歷史（一般生成是空物件）
const block = new AsyncFunction('generatedPlan', 'planName', '_focusSeed', 'apiClient', 'currentUserId',
    'scheduleMap', 'scheduleOverrides', 'programIdRef', 'activateProgram', 'withExistingRunSchedule', 'newProgramId', 'redesignCarry',
    source.slice(start, end) + '\nreturn finalPlan;');
const save = (plan, name, seed, api, uid, scheduleMap = {}) => {
    mem.clear();
    return block(plan, name, seed, api, uid, scheduleMap, {}, { current: null }, activateProgram, withExistingRunSchedule, newProgramId, {});
};
let submitted;
const seed = { startDate: '2026-09-07', cycleWeeks: 8, blocks: [{ type: 'base' }] };
const result = await save({ weeks: [{}, {}] }, 'Test', seed, { post: async (url, body) => {
    assert.equal(url, '/api/training-program/activate'); submitted = body;
    return { data: { status: 'success', strength: { ...body.strength, plan_id: 'saved-id' } } };
} }, 'test-user', { 1: 1, 4: 2 });
assert.equal(submitted.user_id, 'test-user');
assert.ok(submitted.program_id, '每次啟用要帶 program_id（斷線重送去重用）');
assert.equal(submitted.strength.startDate, seed.startDate);
assert.equal(submitted.strength.cycleWeeks, 8);
assert.deepEqual(submitted.strength.cycleBlocks, seed.blocks);
assert.deepEqual(submitted.strength.training_schedule, { 1: { 1: 1, 4: 2 }, 2: { 1: 1, 4: 2 } });
assert.deepEqual(result, { ...submitted.strength, plan_id: 'saved-id' });
// 伺服器回 success 卻沒有 plan_id、或連不上 → 都必須丟錯，不能當作已儲存
await assert.rejects(save({}, 'Test', null, { post: async () => ({ data: { status: 'success' } }) }, 'test-user'));
await assert.rejects(save({}, 'Test', null, { post: async () => { throw new Error('offline'); } }, 'test-user'));
assert.ok(mem.has('drvn:pending-program:test-user'), '斷線時要留下待補送的 program');

const session = readFileSync(new URL('../src/components/WorkoutSessionViewMobile.jsx', import.meta.url), 'utf8');
const a = session.indexOf('        if (!isFreestyle && totalSets > 0 && finalIsComplete) {');
const b = session.indexOf('        // 📍', a);
assert(a >= 0 && b > a);
// 元件現在先用 readStrengthPlanDays 判斷「這天是不是已經記過」，記到的那天寫進 recordedPlanDayRef（結算頁取消用）
const complete = new Function('isFreestyle', 'totalSets', 'finalIsComplete', 'effectivePlan', 'effectiveUserId', 'localStorage', 'recordStrengthPlanDay', 'completionPlanId', 'readStrengthPlanDays', 'recordedPlanDayRef', session.slice(a, b));
for (const [freestyle, sets, isComplete, expected] of [
    [true, 12, true, false], [false, 12, false, false],
    [false, 0, true, false], [false, 12, true, true],
]) {
    const data = new Map([['active_plan_id_test-user', 'test-plan'], ['drvn:strength-completion-owner:test-user', 'test-plan']]);
    const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
    const ref = { current: null };
    for (let i = 0; i < 2; i++) complete(freestyle, sets, isComplete, { day_number: 2, week_number: 3 }, 'test-user', storage,
        (user, plan, week, day) => recordStrengthPlanDay(user, plan, week, day, storage), 'test-plan',
        (user, plan, week) => readStrengthPlanDays(user, plan, week, storage), ref);
    assert.equal(data.has('completed_workouts_test-user_week3'), expected);
    // 第二次（重複完成）不可以蓋掉第一次的紀錄指標；沒完成就不能有指標
    assert.deepEqual(ref.current, expected ? { planId: 'test-plan', week: 3, day: 2 } : null);
    if (expected) assert.deepEqual(JSON.parse(data.get('completed_workouts_test-user_week3')), [2]);
}
console.log('PASS: save payload, canonical ID, rejected/offline saves, partial/empty/freestyle/complete progress and duplicate completion');
