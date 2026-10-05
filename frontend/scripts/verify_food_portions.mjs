/**
 * verify_food_portions.mjs — 份量對照表回歸測試
 * 跑法：node --import ./scripts/_register_hooks.mjs scripts/verify_food_portions.mjs
 *
 * 重點不是「有沒有份量」，而是「不能給錯份量」：
 * 生米被當成一碗飯、肉鬆被當成一個手掌，都會讓熱量整整多算一倍以上。
 */
import { getPortions, defaultGrams } from '../src/utils/foodPortions.js';

let pass = 0, fail = 0;
const ok = (cond, msg, extra = '') => {
    if (cond) { pass++; console.log(`✅ ${msg}`); }
    else { fail++; console.log(`❌ ${msg}${extra ? `  ${extra}` : ''}`); }
};

const labels = (n) => getPortions({ name: n }).options.map(o => o.label).join(' / ');
const gramsOf = (n, label) => getPortions({ name: n }).options.find(o => o.label === label)?.grams;

console.log('\n── 命中家常單位 ──');
ok(gramsOf('白飯', '1 碗') === 200, '白飯 → 1 碗 200g', labels('白飯'));
ok(gramsOf('雞蛋', '1 顆') === 55, '雞蛋 → 1 顆 55g', labels('雞蛋'));
ok(gramsOf('雞胸肉', '1 份') === 150, '雞胸肉 → 1 份 150g（一個手掌）', labels('雞胸肉'));
ok(gramsOf('全麥吐司', '1 片') === 30, '吐司 → 1 片 30g', labels('全麥吐司'));
ok(gramsOf('香蕉', '1 根') === 100, '香蕉 → 1 根 100g', labels('香蕉'));
ok(gramsOf('低脂牛奶', '1 杯') === 240, '牛奶 → 1 杯 240g', labels('低脂牛奶'));
ok(gramsOf('高蛋白', '1 匙') === 30, '高蛋白 → 1 匙 30g', labels('高蛋白'));
ok(gramsOf('紅肉甘藷', '1 條') === 150, '甘藷 → 1 條 150g', labels('紅肉甘藷'));

console.log('\n── 絕對不能給錯的（給錯 = 熱量多算一倍以上）──');
for (const raw of ['稉米', '秈米', '糙米', '燕麥']) {
    const p = getPortions({ name: raw });
    ok(!p.matched, `${raw}（生的）不給「碗」，退回公克級距`, labels(raw));
}
ok(!getPortions({ name: '鯖魚肉脯' }).matched, '鯖魚肉脯 不給「一個手掌 150g」', labels('鯖魚肉脯'));
ok(!getPortions({ name: '豬肉鬆' }).matched, '豬肉鬆 不給「一個手掌 150g」', labels('豬肉鬆'));
ok(getPortions({ name: '甘藷葉' }).options.some(o => o.label === '半碗'),
    '甘藷葉 走蔬菜規則（半碗），不是「一條地瓜」', labels('甘藷葉'));
ok(!getPortions({ name: '米酒' }).matched, '米酒 不被「米飯」規則誤判', labels('米酒'));
ok(!getPortions({ name: '米漿' }).matched, '米漿 不被「米飯」規則誤判', labels('米漿'));

console.log('\n── 未命中時的行為 ──');
const unknown = getPortions({ name: '鹹酥雞粉' });
ok(!unknown.matched, '沒把握的食物 → matched=false');
ok(unknown.options.length === 4 && unknown.options[1].grams === 100, '未命中給 50/100/150/200 g 級距');
ok(defaultGrams({ name: '鹹酥雞粉' }) === 100, '未命中預設 100g');

console.log('\n── 收藏項目自帶單份重量 ──');
const fav = { name: '自製能量棒', serving_size_g: 45 };
ok(getPortions(fav).matched, '有 serving_size_g 就以它展開，不落回公克級距');
ok(getPortions(fav).options.map(o => o.grams).join(',') === '23,45,90', '半份 / 1 份 / 2 份 = 23,45,90',
    getPortions(fav).options.map(o => `${o.label}=${o.grams}`).join(' '));
ok(defaultGrams(fav) === 45, '預設帶入 1 份 45g');

console.log('\n── 預設值合理性 ──');
ok(defaultGrams({ name: '白飯' }) === 200, '打開白飯預設就是 1 碗');
ok(defaultGrams({ name: '雞蛋' }) === 55, '打開雞蛋預設就是 1 顆');

console.log(`\n${fail === 0 ? '✅ 全部通過' : '❌ 有失敗'}  ${pass} 通過 / ${fail} 失敗\n`);
process.exit(fail === 0 ? 0 : 1);
