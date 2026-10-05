// 🎯 planCycleRecap 結算與下一期建議驗證
// 跑法：node --import ./scripts/_register_hooks.mjs scripts/verify_plan_recap.mjs
//
// 結算最容易犯的錯：沒量測也給結算、超過目標卻含糊成「剛好達成」、
// 或者給一個講不出理由的下一期。這裡測的就是這些。
const store = {};
globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
};
const { buildCycleRecap, isCycleComplete, archiveCycle, readCycleHistory } =
    await import('../src/utils/planCycleRecap.js');
const { computeCutProgress } = await import('../src/utils/cutProgress.js');

const DAY = 86400000;
const TODAY = new Date('2026-09-06T12:00:00');
const ago = (d) => new Date(TODAY.getTime() - d * DAY);
const iso = (d) => d.toISOString().slice(0, 10);
const setInbody = (rows) => { store['inbody_local_u1'] = JSON.stringify(rows); };

let pass = 0, fail = 0;
const ok = (c, msg, extra = '') => {
    if (c) { pass++; console.log(`✅ ${msg}`); }
    else { fail++; console.log(`❌ ${msg}${extra ? `  ${extra}` : ''}`); }
};

const bulkPlan = {
    planId: 'p1', goalType: 'bulk', currentWeight: 70, targetWeight: 74, pace: 0.35,
    committedAt: ago(70).getTime(),
};

console.log('\n── 沒走完就沒有結算 ──');
setInbody([{ measurement_date: iso(ago(70)), weight_kg: 70 }, { measurement_date: iso(ago(1)), weight_kg: 71.5 }]);
ok(buildCycleRecap('u1', bulkPlan, TODAY) === null, '還沒到目標 → 不給結算');
setInbody([{ measurement_date: iso(ago(70)), weight_kg: 70 }]);
ok(buildCycleRecap('u1', bulkPlan, TODAY) === null, '開始後沒量過 → 不給結算');
ok(buildCycleRecap('u1', null, TODAY) === null, '沒有計劃 → 不給結算');

console.log('\n── 走完了：結算要用實測，而且不美化 ──');
setInbody([{ measurement_date: iso(ago(70)), weight_kg: 70 }, { measurement_date: iso(ago(1)), weight_kg: 74.9 }]);
const r = buildCycleRecap('u1', bulkPlan, TODAY);
ok(!!r, '達標 → 有結算');
ok(r.startWeight === 70 && r.endWeight === 74.9, '起訖都是實測值', `${r.startWeight}→${r.endWeight}`);
ok(r.movedKg === 4.9, `這一期增了 ${r.movedKg} kg`);
ok(r.weeks === 10, `走了 ${r.weeks} 週`);
ok(r.avgPaceKgWk === 0.49, `平均每週 ${r.avgPaceKgWk} kg`);
ok(r.overshootKg === 0.9, `超過目標 ${r.overshootKg} kg`);
ok(/超過目標/.test(r.verdict), '評語要講出超過多少，不能含糊成「剛好達成」', r.verdict);
ok(r.verdict.length <= 40, `評語不囉嗦（${r.verdict.length} 字）`, r.verdict);

console.log('\n── 快慢要照講 ──');
{
    const fast = buildCycleRecap('u1', { ...bulkPlan, committedAt: ago(35).getTime() }, TODAY);
    ok(/早了/.test(fast.verdict), '比原訂快 → 說早了幾週', fast.verdict);
    const slow = buildCycleRecap('u1', { ...bulkPlan, committedAt: ago(160).getTime() }, TODAY);
    ok(/多花了/.test(slow.verdict), '比原訂慢 → 老實說多花幾週，但肯定他走完了', slow.verdict);
    ok(slow.verdictTone === 'neutral', '慢的時候語氣是中性，不是責備');
}

console.log('\n── 下一期要講得出理由 ──');
ok(r.next.goalType === 'cut', '增肌完 → 建議接一段減脂', r.next.goalType);
ok(r.next.reason.length > 10, '有理由，不是空話', r.next.reason);
{
    setInbody([{ measurement_date: iso(ago(70)), weight_kg: 78 }, { measurement_date: iso(ago(1)), weight_kg: 72 }]);
    const cutR = buildCycleRecap('u1', { planId: 'p2', goalType: 'cut', currentWeight: 78, targetWeight: 72, pace: 0.5, committedAt: ago(70).getTime() }, TODAY);
    ok(cutR.next.goalType === 'recomp', '減脂完 → 建議先維持，而不是再減一輪', cutR.next.goalType);
    ok(/復胖|穩住|適應/.test(cutR.next.reason), '理由講得出為什麼要先維持', cutR.next.reason);
}

console.log('\n── 延續性：一期收進歷史 ──');
setInbody([{ measurement_date: iso(ago(70)), weight_kg: 70 }, { measurement_date: iso(ago(1)), weight_kg: 74.9 }]);
{
    const r2 = buildCycleRecap('u1', bulkPlan, TODAY);
    archiveCycle('u1', bulkPlan, r2);
    const h = readCycleHistory('u1');
    ok(h.length === 1, '結算後歷史多一筆');
    ok(h[0].movedKg === 4.9 && h[0].goalType === 'bulk', '歷史存的是這一期的成果', JSON.stringify(h[0]));
    archiveCycle('u1', bulkPlan, r2);
    ok(readCycleHistory('u1').length === 1, '同一期不會被重複收錄');
    archiveCycle('u1', { ...bulkPlan, planId: 'p9' }, r2);
    ok(readCycleHistory('u1').length === 2, '不同期會累積（這就是延續性）');
}

console.log('\n── isCycleComplete 的邊界 ──');
ok(isCycleComplete(computeCutProgress('u1', bulkPlan, TODAY)) === true, '達標 → true');
ok(isCycleComplete(null) === false, 'null → false');
ok(isCycleComplete({ status: 'no_measurement' }) === false, '沒量測 → false');

console.log(`\n${fail === 0 ? '✅ 全部通過' : '❌ 有失敗'}  ${pass} 通過 / ${fail} 失敗\n`);
process.exit(fail === 0 ? 0 : 1);
