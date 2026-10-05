/**
 * verify_nutrition_wizard.mjs — 營養計劃精靈的整體檢查
 * 跑法：node --import ./scripts/_register_hooks.mjs scripts/verify_nutrition_wizard.mjs
 *
 * 涵蓋三件事：
 *   1. 防呆：哪些狀態不能往下一步，而且要說得出原因
 *   2. 餐點庫的時段標籤：使用者是用「早餐吃什麼」在挑東西
 *   3. 餐盤配置：比例是算出來的，不能出現「蛋白質 100%」這種假的
 */
import { stepIssue, unlockedSteps, MAX_GOAL_GAP_RATIO } from '../src/utils/planWizardGuards.js';
import { DISHES, MEAL_SLOTS, dishesForSlot } from '../src/data/dishLibrary.js';
import { buildMealPlan } from '../src/utils/mealPlanBuilder.js';

let pass = 0, fail = 0;
const ok = (c, msg, extra = '') => {
    if (c) { pass++; console.log(`✅ ${msg}`); }
    else { fail++; console.log(`❌ ${msg}${extra ? `  ${extra}` : ''}`); }
};

const base = {
    goalType: 'cut', hasInBody: true,
    stepDone: { mode: true, target: true, pace: true },
    currentWeight: 72, targetWeight: 65, targetBodyFat: 20, weeklyChange: -0.5,
};

console.log('\n── 防呆：每一步擋得住，而且說得出原因 ──');
ok(stepIssue(0, { ...base, stepDone: { mode: false } })?.code === 'no_mode', '沒選目標類型 → 擋');
ok(stepIssue(0, base) === null, '選了就放行');

ok(stepIssue(1, { ...base, hasInBody: false })?.code === 'no_inbody', '沒有 InBody → 擋在第二步');
ok(stepIssue(1, { ...base, hasInBody: false })?.needsMeasure === true, '而且要能直接帶去量測');
ok(stepIssue(1, { ...base, stepDone: { mode: true, target: false } })?.code === 'not_confirmed',
    '沒確認目標數字 → 擋');

ok(stepIssue(1, { ...base, goalType: 'bulk', targetWeight: 68 })?.code === 'bulk_down',
    '增重卻把目標設得比現在低 → 擋（這是不可能的計劃）');
ok(stepIssue(1, { ...base, goalType: 'cut', targetWeight: 80 })?.code === 'cut_up',
    '減脂卻把目標設得比現在高 → 擋');
ok(stepIssue(1, { ...base, goalType: 'bulk', targetWeight: 76, weeklyChange: 0.3 }) === null,
    '增重目標比現在高 → 放行');

ok(stepIssue(1, { ...base, targetWeight: 40 })?.code === 'too_far',
    `差距超過 ${MAX_GOAL_GAP_RATIO * 100}% → 擋，建議先設階段性目標`);
ok(stepIssue(1, { ...base, targetWeight: 65 }) === null, '合理範圍內放行');

ok(stepIssue(1, { ...base, targetBodyFat: 2 })?.code === 'bf_range', '目標體脂 2% → 擋');
ok(stepIssue(1, { ...base, targetBodyFat: 60 })?.code === 'bf_range', '目標體脂 60% → 擋');
ok(stepIssue(1, { ...base, targetBodyFat: null }) === null, '沒設體脂不擋（可選）');

ok(stepIssue(2, { ...base, stepDone: { mode: true, target: true, pace: false } })?.code === 'no_pace',
    '沒選速度 → 擋');
ok(stepIssue(2, { ...base, weeklyChange: 0 })?.code === 'zero_pace', '速度算不出每週變化 → 擋');
ok(stepIssue(3, { ...base, stepDone: {} }) === null, '「常吃什麼」可以跳過，不擋人');
ok(stepIssue(4, base) === null, '總覽不擋');

const issues = [0, 1, 2].map(i => stepIssue(i, { ...base, hasInBody: false, stepDone: {} }));
ok(issues.every(x => !x || (x.msg && x.msg.length <= 30)), '每個擋下來的理由都在 30 字以內',
    issues.filter(Boolean).map(x => `${x.msg}(${x.msg.length})`).join(' / '));

console.log('\n── 進度列：沒過的步驟不能亂跳 ──');
{
    const u = unlockedSteps({ ...base, hasInBody: false, stepDone: { mode: true } });
    ok(u[0] === true && u[1] === true, '第一步永遠可以回去；第二步在選完類型後開放');
    ok(u[2] === false && u[3] === false && u[4] === false, '沒 InBody 就不能跳到後面的步驟');
    const all = unlockedSteps(base);
    ok(all.every(Boolean), '全部填完後每一步都能點');
}

console.log('\n── 餐點庫：使用者是用「早餐吃什麼」在挑 ──');
ok(DISHES.every(d => Array.isArray(d.slots) && d.slots.length > 0), '每道菜都有時段標籤');
for (const [k, label] of Object.entries(MEAL_SLOTS)) {
    ok(dishesForSlot(k).length >= 8, `${label} 至少 8 個選項（${dishesForSlot(k).length}）`);
}
const drinks = DISHES.filter(d => /茶/.test(d.name));
ok(drinks.every(d => d.slots.every(s2 => s2 === 'snack')), '手搖飲只出現在點心，不會出現在正餐',
    drinks.map(d => `${d.name}:${d.slots}`).join(' / '));

console.log('\n── 餐盤配置：比例要是算出來的 ──');
{
    const plan = buildMealPlan({ calories: 2503, protein: 160, carbs: 270, fats: 70 }, {
        preferredBySlot: { breakfast: ['store_ham_egg_sandwich'], lunch: ['bento_chicken_leg'], snack: ['store_bubble_tea'] },
    });
    ok(plan.meals.every(m => m.composition.length === 3), '四餐都有三段配置');
    ok(plan.meals.every(m => Math.abs(m.composition.reduce((a, c) => a + c.pct, 0) - 100) <= 1), '每一餐加起來 100%');
    ok(plan.meals.every(m => m.composition.every(c => c.pct > 5 && c.pct < 70)),
        '沒有任何一段吃掉整個圓（那代表算錯）',
        plan.meals.map(m => m.composition.map(c => c.pct).join('/')).join(' | '));

    const bf = plan.meals.find(m => m.key === 'breakfast');
    ok(bf.picks.some(x => x.id === 'store_ham_egg_sandwich'), '早餐挑的東西就排在早餐');
    const lunch = plan.meals.find(m => m.key === 'lunch');
    ok(lunch.picks.some(x => x.id === 'bento_chicken_leg'), '午餐挑的東西就排在午餐');
    const snack = plan.meals.find(m => m.key === 'snack');
    ok(snack.picks.some(x => x.id === 'store_bubble_tea' && x.snackOnly), '手搖排在點心並標記蛋白質低');

    const teaAsLunch = buildMealPlan({ calories: 2503, protein: 160, carbs: 270, fats: 70 },
        { preferredBySlot: { lunch: ['store_bubble_tea'] } });
    const t = teaAsLunch.meals.find(m => m.key === 'lunch').picks[0];
    ok(t && t.snackOnly && t.chosenSlot, '他堅持午餐喝手搖 → 尊重他的選擇，但標記出來（不偷偷搬走）');
}

console.log(`\n${fail === 0 ? '✅ 全部通過' : '❌ 有失敗'}  ${pass} 通過 / ${fail} 失敗\n`);
process.exit(fail === 0 ? 0 : 1);
