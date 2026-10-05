/**
 * verify_no_fabricated_data.mjs —— 沒有真實資料時，不可以生出數字。
 *
 * 事故現場：全新使用者（沒量過體重、profile 全空）按一下「減脂」，
 * 舊版會 POST 出去：
 *     熱量 1859   蛋白 0g   脂肪 0g   碳水 465g
 * 熱量是用 `weight||70 / height||170 / age||25 / gender||'male'` 這個
 * 不存在的人算的，蛋白與脂肪用真實的 0 —— 一半假一半真。
 * 而這份目標是 Apple Watch 的唯一資料源，下一次又被當成「已知 tdee」優先採用。
 *
 * 規則：有量到才顯示，沒量到就給入口。
 */
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, next) {
    try { return next(s, c); } catch (e) {
        if (s.startsWith('.') && !/\.[a-z]+$/i.test(s)) return next(s + '.js', c);
        throw e;
    }
} });
const store = {};
globalThis.localStorage = {
    getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; },
};

const E = await import('../src/utils/NutritionEngine.js');
const B = await import('../src/utils/biometrics.js');

let fail = 0;
const t = (name, cond, extra = '') => {
    if (!cond) fail++;
    console.log(`${cond ? '✓' : '✗'} ${name}${extra ? `   ${extra}` : ''}`);
};

console.log('\n── 完全沒有資料 ──');
t('BMR 回 null，不是用 70/170/25 算出來的數字',
  E.calcBMR_MifflinStJeor({}) === null, `得到 ${E.calcBMR_MifflinStJeor({})}`);
t('只有體重、缺身高年齡 → 還是 null',
  E.calcBMR_MifflinStJeor({ weight: 65.2 }) === null);
t('巨量營養素沒有體重 → null',
  E.calcMacros(2000, undefined) === null);
t('gate 說缺四項', (() => {
    const g = B.biometricsGate('u_new', {});
    return !g.ok && g.missing.length === 4;
})(), JSON.stringify(B.biometricsGate('u_new', {})));
t('gate 給得出一句可以顯示的動作', B.biometricsGate('u_new', {}).label.length > 0,
  `「${B.biometricsGate('u_new', {}).label}」`);

console.log('\n── 只缺體重 ──');
const partial = { height: 170, age: 28, gender: 'male' };
t('gate 只報 weight 一項', (() => {
    const g = B.biometricsGate('u_p', partial);
    return !g.ok && g.missing.length === 1 && g.missing[0] === 'weight';
})());
t('文案講得出缺哪一項', B.biometricsGate('u_p', partial).label.includes('體重'),
  `「${B.biometricsGate('u_p', partial).label}」`);

console.log('\n── 資料齊全 ──');
const full = { height: 170, age: 28, gender: 'male', current_weight: 65.2 };
t('gate 放行', B.biometricsGate('u_ok', full).ok);
const bmr = E.calcBMR_MifflinStJeor({ weight: 65.2, height: 170, age: 28, gender: 'male' });
t('BMR 算得出來且落在合理區間', bmr > 1200 && bmr < 1900, `BMR = ${bmr}`);
t('女性常數有生效（同樣身形應該更低）',
  E.calcBMR_MifflinStJeor({ weight: 65.2, height: 170, age: 28, gender: 'female' }) < bmr);
t('巨量營養素算得出來', (() => {
    const m = E.calcMacros(2200, 65.2);
    return m && m.protein > 0 && m.fat > 0;
})());

console.log('\n── 髒資料不可以被當成真的 ──');
t('體重 0 → 當作沒有', B.readBiometrics('u_z', { weight: 0 }).weight === null);
t('體重 999 → 當作沒有', B.readBiometrics('u_z', { weight: 999 }).weight === null);
t('性別亂填 → null', B.normalizeGender('外星人') === null);
t('性別「女」認得出來', B.normalizeGender('女') === 'female');


/* ── 導航的目的地必須真的補得到那些欄位 ──────────────────────────
   InBodyInputForm 只有身高與體重的輸入框，沒有年齡與性別。
   提示說「先填年齡、性別」卻把人送到填不了的頁面 → 補完回來還是被擋，
   死路比假數字更糟。 */
console.log('\n── 導航目的地 ──');
const INBODY_FIXABLE = new Set(['weight', 'height']);
const cases = [
    ['四項全缺',            {},                                   B.PROFILE_ROUTE],
    ['只缺體重',            { height: 170, age: 28, gender: 'male' }, B.INBODY_ROUTE],
    ['只缺身高',            { current_weight: 65, age: 28, gender: 'male' }, B.INBODY_ROUTE],
    ['缺身高體重',          { age: 28, gender: 'male' },          B.INBODY_ROUTE],
    ['只缺性別',            { current_weight: 65, height: 170, age: 28 }, B.PROFILE_ROUTE],
    ['只缺年齡',            { current_weight: 65, height: 170, gender: 'male' }, B.PROFILE_ROUTE],
    ['缺年齡＋體重',        { height: 170, gender: 'male' },      B.PROFILE_ROUTE],
];
for (const [name, prof, want] of cases) {
    const g = B.biometricsGate('u_' + name, prof);
    const ok = g.route === want;
    if (!ok) fail++;
    console.log(`${ok ? '✓' : '✗'} ${name.padEnd(12)} → ${g.route}${ok ? '' : `   （應為 ${want}）`}`);
    // 更強的條件：目的地一定要補得完所有缺的欄位
    const reachable = g.route === B.PROFILE_ROUTE
        || g.missing.every((k) => INBODY_FIXABLE.has(k));
    if (!reachable) { fail++; console.log(`  ✗ ${name}：送去 ${g.route} 補不完 ${g.missing.join('、')}`); }
}


/* ── 每個功能的提示都要「寫清楚」───────────────────────────────
   規則：必要的資料 onboarding 先擋；其餘等使用者真的用到那個功能才提醒，
   而且那句提示要同時講出「為了什麼」與「缺什麼」，並且導到一個補得完的頁。
   光說「先填年齡」使用者不知道關他什麼事。 */
console.log('\n── 每個功能的提示 ──');
const EMPTY = {};                       // 全新使用者，什麼都沒有
const FIXABLE_AT_INBODY = new Set(['weight', 'height']);
for (const [key, need] of Object.entries(B.FEATURE_NEEDS)) {
    const g = B.featureGate(key, 'u_' + key, EMPTY);
    const problems = [];
    if (g.ok) problems.push('零資料卻說可以用');
    if (!g.label.includes(need.what)) problems.push('提示沒講是為了什麼');
    for (const f of g.missing) {
        const zh = { weight: '體重', height: '身高', age: '年齡', gender: '性別' }[f];
        if (zh && !g.label.includes(zh)) problems.push(`提示沒講缺 ${zh}`);
    }
    const reachable = g.route === B.PROFILE_ROUTE || g.missing.every((f) => FIXABLE_AT_INBODY.has(f));
    if (!reachable) problems.push(`送去 ${g.route} 補不完 ${g.missing.join('、')}`);
    if (g.label.length > 30) problems.push(`提示 ${g.label.length} 字，超過 30 字上限`);

    if (problems.length) fail++;
    console.log(`${problems.length ? '✗' : '✓'} ${key.padEnd(14)} 「${g.label}」 → ${g.route}`);
    problems.forEach((p) => console.log(`    ✗ ${p}`));
}

// 資料齊全時每個功能都要放行
const FULL = { current_weight: 65.2, height: 170, age: 28, gender: 'male' };
const blocked = Object.keys(B.FEATURE_NEEDS).filter((k) => !B.featureGate(k, 'u_full', FULL).ok);
if (blocked.length) fail++;
console.log(`${blocked.length ? '✗' : '✓'} 資料齊全 → 九個功能全部放行${blocked.length ? `（${blocked.join('、')} 仍被擋）` : ''}`);

console.log(fail ? `\n❌ ${fail} 個不合格\n` : '\n✅ 沒有真實資料時不會生出任何數字\n');
process.exit(fail ? 1 : 0);
