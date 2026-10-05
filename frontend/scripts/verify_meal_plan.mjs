/**
 * verify_meal_plan.mjs — 吃法框架回歸測試
 * 跑法：node --import ./scripts/_register_hooks.mjs scripts/verify_meal_plan.mjs
 *
 * 這一層不開菜單、不替使用者決定吃什麼，只回答「這一餐大概多少、怎麼組」。
 * 所以要測的是：配額加起來對不對、比例尺真的接近那個熱量、字有沒有變囉嗦。
 */
import { buildMealPlan, SLOTS } from '../src/utils/mealPlanBuilder.js';

let pass = 0, fail = 0;
const ok = (c, msg, extra = '') => {
    if (c) { pass++; console.log(`✅ ${msg}`); }
    else { fail++; console.log(`❌ ${msg}${extra ? `  ${extra}` : ''}`); }
};

const T = { calories: 2310, protein: 150, carbs: 260, fats: 64 };
const plan = buildMealPlan(T, { bodyWeight: 70 });

console.log('\n── 配額 ──');
ok(plan.meals.length === 4, '四個時段');
ok(Math.abs(SLOTS.reduce((a, s) => a + s.share, 0) - 1) < 1e-9, '比例加起來 100%');
const sumK = plan.meals.reduce((a, m) => a + m.kcal, 0);
ok(Math.abs(sumK - T.calories) <= 4, `各餐熱量加總 = 每日目標（${sumK} vs ${T.calories}）`);
const sumP = plan.meals.reduce((a, m) => a + m.protein, 0);
ok(Math.abs(sumP - T.protein) <= 4, `各餐蛋白質加總 = 每日目標（${sumP} vs ${T.protein}）`);
ok(plan.meals.every(m => m.kcal > 0 && m.protein > 0), '每一餐都有正數配額');

console.log('\n── 配置不能是假的 ──');
ok(plan.meals.every(m => m.composition.length === 3), '每一餐都有三段配置');
ok(plan.meals.every(m => m.composition.every(c => c.grams > 0)),
    '三段都要有克數（少傳碳水脂肪會變 0 g，畫面會說謊）',
    plan.meals.map(m => m.composition.map(c => `${c.label}${c.grams}`).join('/')).join(' | '));
ok(plan.meals.every(m => Math.abs(m.composition.reduce((a2, c) => a2 + c.pct, 0) - 100) <= 1),
    '三段比例加起來 100%');
ok(plan.meals.every(m => m.composition[0].pct < 60),
    '蛋白質不會佔掉整條（整條同色＝算錯）',
    plan.meals.map(m => m.composition[0].pct).join('/'));
{
    const broken = buildMealPlan({ calories: 2000, protein: 150 });
    ok(broken.meals.every(m => m.composition.length === 0),
        '真的沒給碳水脂肪時，寧可不畫配置，也不畫一條假的');
}

console.log('\n── 比例尺：只是幫忙抓感覺，但不能抓錯 ──');
for (const m of plan.meals) {
    ok(m.examples.length >= 1, `${m.label} 至少一個比例尺`, JSON.stringify(m.examples));
    ok(m.examples.every(e => Math.abs(e.calories - m.kcal) <= m.kcal * 0.12),
        `${m.label} 比例尺落在該餐熱量 ±12%（${m.kcal} kcal）`,
        m.examples.map(e => `${e.name}${e.sizeLabel}=${e.calories}`).join('、'));
    ok(m.examples.every(e => e.sizeLabel), `${m.label} 比例尺有標份量`);
}

console.log('\n── 字數紀律 ──');
ok(plan.guidance.length <= 3, `指引最多三條（${plan.guidance.length}）`);
ok(plan.guidance.every(g => g.length <= 30), '每條指引不超過 30 字',
    plan.guidance.map(g => `${g}(${g.length})`).join(' / '));
ok(plan.disclaimer.length <= 30, `誠實聲明不超過 30 字（${plan.disclaimer.length}）`);

console.log('\n── 不可以變成「叫人吃什麼」 ──');
const allText = [...plan.guidance, plan.disclaimer].join('');
ok(!/早餐吃|午餐吃|晚餐吃|你要吃/.test(allText), '文案沒有指名某一餐要吃什麼', allText);

console.log('\n── 極端與髒輸入 ──');
for (const t of [{ calories: 1200, protein: 100 }, { calories: 3500, protein: 200 },
                 { calories: 0, protein: 0 }, {}, null]) {
    let p = null, err = null;
    try { p = buildMealPlan(t, {}); } catch (e) { err = e; }
    ok(!err && p.meals.length === 4, `目標 ${JSON.stringify(t)} 不會爆`, err?.message || '');
}
ok(buildMealPlan({ calories: 1200, protein: 100 }).meals.every(m => m.examples.length >= 0),
    '低熱量目標即使找不到比例尺也不會壞');

console.log('\n── 飲食偏好：建議要變成「他的」菜單 ──');
{
    const picked = ['bento_chicken_leg', 'store_bubble_tea', 'street_beef_noodle', 'home_egg3_toast'];
    const p2 = buildMealPlan(T, { preferredIds: picked });
    ok(p2.yourPicks.length === picked.length, `選幾樣就排幾樣（${p2.yourPicks.length}/${picked.length}）`);
    ok(p2.yourPicks.every(x => x.slotLabel && x.sizeLabel && x.calories > 0), '每一樣都有時段、份量、熱量',
        p2.yourPicks.map(x => `${x.slotLabel}:${x.name}`).join(' / '));

    const tea = p2.yourPicks.find(x => x.id === 'store_bubble_tea');
    ok(tea.snackOnly === true, '珍奶被標成「只能當點心」（蛋白質密度太低）');
    ok(tea.slotLabel === '點心', '珍奶不會被排成正餐', tea.slotLabel);

    const bento = p2.yourPicks.find(x => x.id === 'bento_chicken_leg');
    ok(bento.snackOnly === false && ['午餐', '晚餐'].includes(bento.slotLabel),
        '便當被排在正餐', bento.slotLabel);

    const anyPreferredFirst = p2.meals.some(m => m.examples.length && m.examples[0].preferred);
    ok(anyPreferredFirst, '比例尺會優先用他選的東西');

    ok(buildMealPlan(T).yourPicks.length === 0, '沒選就是空的，不假裝有專屬菜單');
    ok(buildMealPlan(T, { preferredIds: ['no_such_dish'] }).yourPicks.length === 0, '亂給 id 不會爆');
}

console.log('\n── 可重現 ──');
const sig = (p) => p.meals.map(m => `${m.kcal}:${m.examples.map(e => e.name).join(',')}`).join('|');
ok(sig(buildMealPlan(T)) === sig(buildMealPlan(T)), '同樣目標跑兩次結果一致');

console.log(`\n${fail === 0 ? '✅ 全部通過' : '❌ 有失敗'}  ${pass} 通過 / ${fail} 失敗\n`);
process.exit(fail === 0 ? 0 : 1);
