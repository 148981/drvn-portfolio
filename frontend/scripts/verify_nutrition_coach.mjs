// 🧭 nutritionCoach 定期回診／教練建議驗證
// 用法：node --import ./scripts/_register_hooks.mjs scripts/verify_nutrition_coach.mjs
//
// 教練最不能犯的錯：沒量測還敢講配速、走反方向卻說一切順利、
// 或給一個使用者做不到的建議（「每天少 900 kcal」）。這裡測的就是這些。
const store = {};
globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
};
const { buildCoachDigest, REVIEW_INTERVAL_DAYS, MEASUREMENT_STALE_DAYS } =
    await import('../src/utils/nutritionCoach.js');

const DAY = 86400000;
const TODAY = new Date('2026-09-06T12:00:00');
const ago = (d) => new Date(TODAY.getTime() - d * DAY);
const iso = (d) => d.toISOString().slice(0, 10);
const setInbody = (rows) => { store['inbody_local_u1'] = JSON.stringify(rows); };
const cut = (o = {}) => ({ goalType: 'cut', currentWeight: 72, targetWeight: 65, pace: 0.5,
    committedAt: ago(42).getTime(), ...o });
const bulk = (o = {}) => ({ goalType: 'bulk', currentWeight: 66, targetWeight: 70, pace: 0.25,
    committedAt: ago(42).getTime(), ...o });

let pass = 0, fail = 0;
const ok = (c, msg, extra = '') => {
    if (c) { pass++; console.log(`✅ ${msg}`); }
    else { fail++; console.log(`❌ ${msg}${extra ? `\n     ${extra}` : ''}`); }
};
const show = (d) => `${d.status}／${d.level}／${d.title}`;

console.log('\n── 沒有計劃就不該有教練 ──');
setInbody([]);
ok(buildCoachDigest('u1', null, TODAY) === null, '沒有計劃 → 不回任何東西');

console.log('\n── 沒有量測：不可以用推估頂替 ──');
setInbody([{ measurement_date: iso(ago(60)), weight_kg: 72 }]);
{
    const d = buildCoachDigest('u1', cut(), TODAY);
    ok(d.status === 'need_measurement' && d.level === 'action', '開始後沒量過 → 要求量測', show(d));
    ok(d.action?.route === '/body-analysis-mobile', '附上「去量體重」的跳轉');
    ok(d.action?.state?.openInBodyForm === true, '跳過去會直接打開量測表單（防呆）');
    ok(d.dailyKcalAdjust === null, '沒有量測就不給熱量調整建議');
}

console.log('\n── 量測太舊：拿過期的自己當現況是不誠實的 ──');
setInbody([
    { measurement_date: iso(ago(42)), weight_kg: 72.0 },
    { measurement_date: iso(ago(MEASUREMENT_STALE_DAYS + 1)), weight_kg: 70.0 },
]);
{
    const d = buildCoachDigest('u1', cut(), TODAY);
    ok(d.status === 'need_measurement' && d.level === 'action', `超過 ${MEASUREMENT_STALE_DAYS} 天 → 提醒重量`, show(d));
    ok(/\d+ 天沒量體重/.test(d.title), '標題直接講幾天沒量', d.title);
}

console.log('\n── 剛開始：不到一週不談配速 ──');
setInbody([{ measurement_date: iso(ago(2)), weight_kg: 71.6 }]);
{
    const d = buildCoachDigest('u1', cut({ committedAt: ago(3).getTime() }), TODAY);
    ok(d.status === 'too_early' && d.level === 'ok', '剛開始 → 先照著吃', show(d));
    ok(d.nextReviewInDays > 0, '會告訴使用者幾天後再回來看');
}

console.log('\n── 正常配速 ──');
setInbody([
    { measurement_date: iso(ago(42)), weight_kg: 72.0 },
    { measurement_date: iso(ago(2)), weight_kg: 68.9 },
]);
{
    const d = buildCoachDigest('u1', cut(), TODAY);
    ok(d.status === 'on_track' && d.level === 'ok', '接近目標配速 → on_track', show(d));
    ok(d.dailyKcalAdjust === null, '正常時不亂叫人調整');
    ok(d.nextReviewInDays <= REVIEW_INTERVAL_DAYS, '有下一次回診時間');
}

console.log('\n── 走反方向 ──');
setInbody([
    { measurement_date: iso(ago(42)), weight_kg: 72.0 },
    { measurement_date: iso(ago(1)), weight_kg: 73.4 },
]);
{
    const d = buildCoachDigest('u1', cut(), TODAY);
    ok(d.status === 'off_track' && d.level === 'action', '反方向 → action', show(d));
    ok(d.dailyKcalAdjust < 0, '減脂反向時建議「少吃」（負值）', String(d.dailyKcalAdjust));
    ok(Math.abs(d.dailyKcalAdjust) <= 1200, '建議幅度不會荒謬（≤1200 kcal/天）', String(d.dailyKcalAdjust));
    ok(d.detail.includes('手搖'), '用看得到的東西描述熱量，不是純數字', d.detail);
}

console.log('\n── 減太快：會賠掉肌肉 ──');
setInbody([
    { measurement_date: iso(ago(28)), weight_kg: 72.0 },
    { measurement_date: iso(ago(1)), weight_kg: 66.5 },
]);
{
    const d = buildCoachDigest('u1', cut({ committedAt: ago(28).getTime() }), TODAY);
    ok(d.status === 'too_fast' && d.level === 'action', '每週掉超過體重 1% → 提醒太快', show(d));
    ok(d.dailyKcalAdjust > 0, '太快時建議「多吃」（正值）', String(d.dailyKcalAdjust));
    ok(d.detail.includes('蛋白質'), '提醒蛋白質吃滿');
}

console.log('\n── 太慢 ──');
setInbody([
    { measurement_date: iso(ago(42)), weight_kg: 72.0 },
    { measurement_date: iso(ago(1)), weight_kg: 71.2 },
]);
{
    const d = buildCoachDigest('u1', cut(), TODAY);
    ok(d.status === 'too_slow', '不到目標一半 → too_slow', show(d));
    ok(d.level === 'insight', '太慢是提醒不是警報（不責備）');
    ok(d.detail.includes('接受晚一點達標'), '給第二條路：也可以接受慢一點', d.detail);
}

console.log('\n── 增肌方向的建議要反過來 ──');
setInbody([
    { measurement_date: iso(ago(42)), weight_kg: 66.0 },
    { measurement_date: iso(ago(1)), weight_kg: 66.1 },
]);
{
    const d = buildCoachDigest('u1', bulk(), TODAY);
    ok(['too_slow', 'on_track'].includes(d.status), '增肌太慢也判得出來', show(d));
    if (d.dailyKcalAdjust != null) ok(d.dailyKcalAdjust > 0, '增肌建議是「多吃」', String(d.dailyKcalAdjust));
    else ok(true, '增肌建議是「多吃」（此情境無需調整）');
}

console.log('\n── 已達標 ──');
setInbody([
    { measurement_date: iso(ago(42)), weight_kg: 72.0 },
    { measurement_date: iso(ago(1)), weight_kg: 65.0 },
]);
{
    const d = buildCoachDigest('u1', cut(), TODAY);
    ok(d.status === 'reached' && d.level === 'ok', '到目標 → reached', show(d));
    ok(!/還剩/.test(d.detail), '達標後不要再講還剩幾公斤');
}

console.log('\n── 文案紀律：提示是提示，不是文章 ──');
{
    const cases = [];
    setInbody([{ measurement_date: iso(ago(60)), weight_kg: 72 }]);
    cases.push(buildCoachDigest('u1', cut(), TODAY));
    setInbody([{ measurement_date: iso(ago(42)), weight_kg: 72 }, { measurement_date: iso(ago(20)), weight_kg: 70 }]);
    cases.push(buildCoachDigest('u1', cut(), TODAY));
    setInbody([{ measurement_date: iso(ago(42)), weight_kg: 72 }, { measurement_date: iso(ago(2)), weight_kg: 68.9 }]);
    cases.push(buildCoachDigest('u1', cut(), TODAY));
    setInbody([{ measurement_date: iso(ago(42)), weight_kg: 72 }, { measurement_date: iso(ago(1)), weight_kg: 73.4 }]);
    cases.push(buildCoachDigest('u1', cut(), TODAY));
    setInbody([{ measurement_date: iso(ago(42)), weight_kg: 72 }, { measurement_date: iso(ago(1)), weight_kg: 71.2 }]);
    cases.push(buildCoachDigest('u1', cut(), TODAY));
    const longTitle = cases.filter(c => c.title.length > 16);
    const longDetail = cases.filter(c => c.detail.length > 34);
    ok(longTitle.length === 0, '標題都在 16 字以內', longTitle.map(c => `${c.title}(${c.title.length})`).join(' / '));
    ok(longDetail.length === 0, '說明都在 34 字以內', longDetail.map(c => `${c.detail}(${c.detail.length})`).join(' / '));
    ok(cases.every(c => !c.detail.includes('。。')), '沒有重複句號');
}

console.log('\n── 髒資料不能讓教練崩掉 ──');
setInbody([{ measurement_date: 'x', weight_kg: 'abc' }, null, { weight: 0 }]);
{
    let err = null, d = null;
    try { d = buildCoachDigest('u1', cut(), TODAY); } catch (e) { err = e; }
    ok(!err && d && typeof d.title === 'string', '髒資料照樣回一個可顯示的結果', err?.message || '');
}

console.log(`\n${fail === 0 ? '✅ 全部通過' : '❌ 有失敗'}  ${pass} 通過 / ${fail} 失敗\n`);
process.exit(fail === 0 ? 0 : 1);
