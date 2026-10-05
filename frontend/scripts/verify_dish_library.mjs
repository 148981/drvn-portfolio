/**
 * verify_dish_library.mjs — 餐點層回歸測試
 * 跑法：node --import ./scripts/_register_hooks.mjs scripts/verify_dish_library.mjs
 *
 * 這一層是「使用者不用拆料、不用秤重」的關鍵，但也最容易悄悄說謊：
 * 組成加總對不上總熱量、份量倍率算錯、或某道菜的熱量密度荒謬（例如
 * 一碗湯 600 kcal/100g），使用者不會發現，只會以為自己怎麼吃都瘦不下來。
 */
import { DISHES, SIZE_FACTORS, searchDishes, scaleDish } from '../src/data/dishLibrary.js';
import { getPortions, defaultGrams } from '../src/utils/foodPortions.js';

let pass = 0, fail = 0;
const ok = (cond, msg, extra = '') => {
    if (cond) { pass++; console.log(`✅ ${msg}`); }
    else { fail++; console.log(`❌ ${msg}${extra ? `  ${extra}` : ''}`); }
};

console.log('\n── 資料完整性 ──');
ok(DISHES.length >= 50, `至少 50 道餐點（目前 ${DISHES.length}）`);
ok(new Set(DISHES.map(d => d.id)).size === DISHES.length, 'id 沒有重複');
ok(new Set(DISHES.map(d => d.name)).size === DISHES.length, '名稱沒有重複');
ok(DISHES.every(d => d.servingGrams > 0 && d.calories > 0), '每道菜都有份量與熱量');
ok(DISHES.every(d => ['bento', 'street', 'store', 'home'].includes(d.group)), '分類都合法');

console.log('\n── 組成必須加得起來（數字要可追溯，不能用編的）──');
const sumMismatch = DISHES.filter(d => {
    if (!d.components.length) return false;          // 手動筆（乳清）沒有組成
    const sum = d.components.reduce((a, c) => a + c.calories, 0);
    return Math.abs(sum - d.calories) > Math.max(6, d.calories * 0.02);
});
ok(sumMismatch.length === 0, '組成熱量加總 = 該道菜總熱量（誤差 ≤2%）',
    sumMismatch.map(d => `${d.name}: 組成${d.components.reduce((a, c) => a + c.calories, 0)} vs 總${d.calories}`).join(' / '));

const gramMismatch = DISHES.filter(d =>
    d.components.length && d.components.reduce((a, c) => a + c.grams, 0) !== d.servingGrams);
ok(gramMismatch.length === 0, '組成公克加總 = 一份重量', gramMismatch.map(d => d.name).join(' / '));

ok(DISHES.every(d => d.components.every(c => c.source)), '每個原料都標了來源（TFDA／USDA）');

console.log('\n── 熱量密度合理性（擋掉生熟混淆與抄錯數字）──');
const density = DISHES.filter(d => !d.components.length ? false : true)
    .map(d => ({ name: d.name, v: d.calories / d.servingGrams }));
const absurd = density.filter(x => x.v < 0.2 || x.v > 5);
ok(absurd.length === 0, '沒有荒謬的熱量密度（0.2–5 kcal/g）',
    absurd.map(x => `${x.name} ${x.v.toFixed(2)}`).join(' / '));

const drinks = DISHES.filter(d => /茶|豆漿/.test(d.name));
ok(drinks.every(d => d.calories / d.servingGrams < 1.2), '飲料的熱量密度不會像固體食物',
    drinks.map(d => `${d.name} ${(d.calories / d.servingGrams).toFixed(2)}`).join(' / '));

console.log('\n── 幾道菜的絕對值（跟現實對得上才有意義）──');
const byId = Object.fromEntries(DISHES.map(d => [d.id, d]));
const between = (id, lo, hi) => {
    const d = byId[id];
    ok(d && d.calories >= lo && d.calories <= hi,
        `${d?.name || id} 落在 ${lo}–${hi} kcal`, d ? `實際 ${d.calories}` : '找不到');
};
between('bento_chicken_leg', 650, 1000);   // 雞腿便當
between('street_beef_noodle', 400, 750);   // 牛肉麵
between('store_onigiri', 150, 300);        // 御飯糰
between('store_bubble_tea', 450, 800);     // 珍奶大杯
between('home_chicken_rice_veg', 550, 850);// 雞胸健身餐
ok(byId['home_chicken_rice_veg'].protein >= 45, '雞胸健身餐蛋白質 ≥ 45g',
    `實際 ${byId['home_chicken_rice_veg'].protein}`);

console.log('\n── 份量三檔 ──');
const bento = byId['bento_chicken_leg'];
ok(scaleDish(bento, 'small').calories === Math.round(bento.calories * SIZE_FACTORS.small), '小份 = 0.7 倍');
ok(scaleDish(bento, 'normal').calories === bento.calories, '正常 = 原值');
ok(scaleDish(bento, 'large').calories === Math.round(bento.calories * SIZE_FACTORS.large), '大份 = 1.35 倍');

console.log('\n── 搜尋（使用者打得出來的字要找得到）──');
for (const [q, expect] of [['便當', '雞腿便當'], ['牛肉麵', '牛肉麵'], ['珍奶', '珍珠奶茶（大杯）'],
                           ['自助餐', '自助餐 三菜一肉'], ['飯糰', null], ['水餃', null], ['健身餐', null]]) {
    const hits = searchDishes(q, 5);
    ok(hits.length > 0 && (!expect || hits.some(h => h.name === expect)),
        `搜「${q}」找得到餐點${expect ? `（含 ${expect}）` : ''}`, hits.map(h => h.name).join('、'));
}
ok(searchDishes('', 5).length === 0, '空字串不回結果');

console.log('\n── 接上份量選單：餐點要問小/正常/大，不問公克 ──');
const asFood = {
    name: bento.name, is_dish: true, servingGrams: bento.servingGrams,
    serving_size_g: bento.servingGrams,
};
const p = getPortions(asFood);
ok(p.matched && p.options.length === 3, '整份餐點回三檔');
ok(p.options.map(o => o.label).join('/') === '小份/正常/大份', '標籤是小份/正常/大份',
    p.options.map(o => o.label).join('/'));
ok(p.options[1].grams === bento.servingGrams, '「正常」= 一份的重量');
ok(defaultGrams(asFood) === bento.servingGrams, '打開餐點預設就是正常份');

console.log('\n── 每 100g 換算（計算機以 100g 為基準，換算不能失真）──');
const per100 = Math.round((bento.calories / bento.servingGrams) * 100);
const backToServing = Math.round((per100 / 100) * bento.servingGrams);
ok(Math.abs(backToServing - bento.calories) <= Math.max(3, bento.calories * 0.01),
    '每 100g 換算回一份，誤差 ≤1%', `${backToServing} vs ${bento.calories}`);

console.log(`\n${fail === 0 ? '✅ 全部通過' : '❌ 有失敗'}  ${pass} 通過 / ${fail} 失敗\n`);
process.exit(fail === 0 ? 0 : 1);
