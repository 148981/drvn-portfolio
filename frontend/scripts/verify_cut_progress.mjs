// ⚖️ cutProgress 單一真相源驗證
// 用法：node --import ./scripts/_register_hooks.mjs scripts/verify_cut_progress.mjs
const store = {};
globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
};
const { computeCutProgress, formatEta } = await import('../src/utils/cutProgress.js');

const DAY = 86400000;
const TODAY = new Date('2026-09-06T12:00:00');
const ago = (d) => new Date(TODAY.getTime() - d * DAY);
const iso = (d) => d.toISOString().slice(0, 10);
const setInbody = (rows) => { store['inbody_local_u1'] = JSON.stringify(rows); };
const plan = (o = {}) => ({ goalType: 'cut', currentWeight: 72, targetWeight: 65, pace: 0.5,
    committedAt: ago(42).getTime(), ...o });

let pass = 0, fail = 0;
const t = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log(`${ok ? '✅' : '❌'} ${name}`);
    if (!ok) console.log(`     得到 ${JSON.stringify(got)}\n     預期 ${JSON.stringify(want)}`);
    ok ? pass++ : fail++;
};

// 1 沒有計劃
setInbody([]);
t('沒有計劃 → no_plan', computeCutProgress('u1', null, TODAY).status, 'no_plan');

// 2 有計劃但這一期開始後沒量過（只有更早的紀錄）
setInbody([{ measurement_date: iso(ago(60)), weight_kg: 72 }]);
{
    const r = computeCutProgress('u1', plan(), TODAY);
    t('開始後沒量過 → no_measurement', r.status, 'no_measurement');
    t('  空狀態不編造進度', [r.movedKg, r.etaDate], [null, null]);
}

// 3 剛開始不到一週 → 不談配速
setInbody([{ measurement_date: iso(ago(2)), weight_kg: 71.5 }]);
t('不到一週 → too_early', computeCutProgress('u1', plan({ committedAt: ago(3).getTime() }), TODAY).status, 'too_early');

// 4 正常進度：6 週掉 3.2 kg（72 → 68.8，目標 65）
setInbody([
    { measurement_date: iso(ago(42)), weight_kg: 72.0 },
    { measurement_date: iso(ago(21)), weight_kg: 70.3 },
    { measurement_date: iso(ago(3)),  weight_kg: 68.8 },
]);
{
    const r = computeCutProgress('u1', plan(), TODAY);
    t('正常進度 → ok', r.status, 'ok');
    t('  已減 3.2 kg', r.movedKg, 3.2);
    t('  還剩 3.8 kg', r.remainingKg, 3.8);
    t('  進度 46%', r.progressPct, 46);
    t('  第 7 週', r.weekIndex, 7);
    t('  實際配速 -0.53 kg/週', r.actualPaceKgWk, -0.53);
    t('  目標配速 -0.5 kg/週', r.targetPaceKgWk, -0.5);
    t('  達標日算得出來', r.etaReachable, true);
    console.log(`     → 「${r.headline}」／「${r.support}」・預計 ${formatEta(r.etaDate, TODAY)} 達標`);
}

// 5 往反方向跑（減脂期卻變重）
setInbody([
    { measurement_date: iso(ago(42)), weight_kg: 72.0 },
    { measurement_date: iso(ago(2)),  weight_kg: 73.4 },
]);
{
    const r = computeCutProgress('u1', plan(), TODAY);
    t('反方向 → offTrack', r.offTrack, true);
    t('  進度 0%（不給負數）', r.progressPct, 0);
    t('  不編達標日', r.etaReachable, false);
    console.log(`     → 「${r.headline}」／「${r.support}」`);
}

// 6 幾乎沒動 → 誠實說到不了
setInbody([
    { measurement_date: iso(ago(42)), weight_kg: 72.0 },
    { measurement_date: iso(ago(1)),  weight_kg: 71.9 },
]);
{
    const r = computeCutProgress('u1', plan(), TODAY);
    t('幾乎沒動 → 不編達標日', r.etaReachable, false);
    console.log(`     → 「${r.support}」`);
}

// 7 已達標
setInbody([
    { measurement_date: iso(ago(42)), weight_kg: 72.0 },
    { measurement_date: iso(ago(1)),  weight_kg: 65.0 },
]);
{
    const r = computeCutProgress('u1', plan(), TODAY);
    t('已達標', [r.headline, r.progressPct], ['已達標', 100]);
}

// 8 增肌方向
setInbody([
    { measurement_date: iso(ago(42)), weight_kg: 60.0 },
    { measurement_date: iso(ago(1)),  weight_kg: 61.5 },
]);
{
    const r = computeCutProgress('u1', plan({ goalType: 'bulk', currentWeight: 60, targetWeight: 65 }), TODAY);
    t('增肌：已增 1.5 kg', [r.direction, r.movedKg, r.headline], ['bulk', 1.5, '已增 1.5 kg']);
}

// 9 欄位別名容錯（weight / date）
setInbody([{ date: iso(ago(40)), weight: 72.0 }, { date: iso(ago(2)), weight: 69.0 }]);
t('欄位別名 weight/date 也讀得到', computeCutProgress('u1', plan(), TODAY).movedKg, 3);

// 10 髒資料不會炸
setInbody([{ date: 'x', weight: 'y' }, { weight_kg: 999 }, null, { measurement_date: iso(ago(2)), weight_kg: 69 }]);
t('髒資料被過濾且不 crash', computeCutProgress('u1', plan(), TODAY).status, 'ok');

// N 走過頭：起點 70 → 目標 70.2，量到 74.9
//   舊版會同時顯示「進度 100%」與「還剩 4.7 kg」—— 同一張卡自己打自己。
setInbody([
    { measurement_date: iso(ago(15)), weight_kg: 70.0 },
    { measurement_date: iso(ago(0)), weight_kg: 74.9 },
]);
{
    const r = computeCutProgress('u1', plan({ goalType: 'bulk', currentWeight: 70, targetWeight: 70.2, pace: 0.25, committedAt: ago(15).getTime() }), TODAY);
    t('走過頭 → 還剩 0（不是離目標多遠）', r.remainingKg, 0);
    t('  超出的量單獨記錄', r.overshootKg, 4.7);
    t('  進度封頂 100%', r.progressPct, 100);
    t('  headline 說已達標', r.headline, '已達標');
    t('  support 講清楚超過多少', r.support.includes('已超過目標 4.7'), true);
}

console.log(`\n${fail === 0 ? '✅ 全部通過' : '❌ 有失敗'}  ${pass} 通過 / ${fail} 失敗\n`);
process.exit(fail ? 1 : 0);
