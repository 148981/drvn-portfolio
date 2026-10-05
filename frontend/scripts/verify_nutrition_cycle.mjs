/**
 * verify_nutrition_cycle.mjs — 一個營養週期的「所有可能性」窮舉稽核
 * 跑法：node --import ./scripts/_register_hooks.mjs scripts/verify_nutrition_cycle.mjs
 *
 * 做法跟訓練引擎的稽核一樣：把所有輸入組合跑一遍，檢查
 *   1. 每一組都落在已定義的狀態（不會冒出第 13 種）
 *   2. 狀態與數字不互相矛盾（達標就不能同時還剩幾公斤）
 *   3. 需要使用者做事的狀態，一定給得出下一步
 *   4. 跨系統結論在專業上站得住（增重沒重訓一定要講）
 *   5. 圖表的計劃線與實測點分得開，而且不會超過目標
 */
const store = {};
globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
};
const { buildCycleState, CYCLE_PHASES, readTrainingInCycle, buildCycleChart, buildGoalGauge } =
    await import('../src/utils/nutritionCycle.js');

const DAY = 86400000;
const TODAY = new Date('2026-09-06T12:00:00');
const ago = (d) => new Date(TODAY.getTime() - d * DAY);
const iso = (d) => d.toISOString().slice(0, 10);

let pass = 0, fail = 0;
const ok = (c, msg, extra = '') => {
    if (c) { pass++; }
    else { fail++; console.log(`❌ ${msg}${extra ? `  ${extra}` : ''}`); }
};

/* ── 輸入維度 ───────────────────────────────────────────────────────── */
const CYCLE_DAYS = 56;                       // 這一期已經走了 8 週
const START = { cut: 78, bulk: 70, recomp: 72 };
const TARGET = { cut: 72, bulk: 76, recomp: 71 };
const PACE = { cut: 0.5, bulk: 0.35, recomp: 0.2 };

// 體重走向：相對「起點」的變化量（8 週後）
const TRAJECTORIES = {
    never_measured: 'never',       // 這一期開始後從沒量過（量測只存在於開始之前）
    none: null,                    // 這一期只有起點那一筆
    on_track: 'on',                // 照配速走
    too_fast: 'fast',
    too_slow: 'slow',
    stalled: 'stall',
    reverse: 'reverse',
    reached: 'reach',
    overshot: 'over',
};
const MEASURE_AGE = { fresh: 1, stale: 20 };
const TRAINING = {
    none: { s: 0, c: 0 },
    low_strength: { s: 4, c: 0 },      // 8 週 4 次 = 0.5 次/週
    adequate: { s: 20, c: 2 },         // 2.5 次/週
    cardio_heavy: { s: 20, c: 28 },    // 3.5 次/週
};

const endWeightFor = (goal, traj) => {
    const s = START[goal], t = TARGET[goal];
    const dir = t > s ? 1 : -1;
    const gap = Math.abs(t - s);
    switch (traj) {
        case 'on': return s + dir * gap * 0.6;
        case 'fast': return s + dir * gap * 0.98;
        case 'slow': return s + dir * gap * 0.15;
        case 'stall': return s + dir * 0.05;
        case 'reverse': return s - dir * 1.6;
        case 'reach': return t;
        case 'over': return t + dir * 1.2;
        default: return null;
    }
};

const setupCase = (goal, traj, ageKey, trainKey) => {
    const committedAt = ago(CYCLE_DAYS).getTime();
    const plan = {
        planId: `p_${goal}_${traj}`, goalType: goal,
        currentWeight: START[goal], targetWeight: TARGET[goal],
        pace: PACE[goal], committedAt,
    };
    const rows = TRAJECTORIES[traj] === 'never'
        ? [{ measurement_date: iso(ago(CYCLE_DAYS + 20)), weight_kg: START[goal] }]   // 只有開始之前的量測
        : [{ measurement_date: iso(ago(CYCLE_DAYS)), weight_kg: START[goal] }];
    const end = TRAJECTORIES[traj] === 'never' ? null : endWeightFor(goal, TRAJECTORIES[traj]);
    if (end !== null) rows.push({ measurement_date: iso(ago(MEASURE_AGE[ageKey])), weight_kg: Math.round(end * 10) / 10 });
    store['inbody_local_u1'] = JSON.stringify(rows);

    const mk = (n, key) => Array.from({ length: n }, (_, i) => ({
        date: iso(ago(Math.max(1, CYCLE_DAYS - Math.floor((i + 1) * CYCLE_DAYS / (n + 1))))), type: key,
    }));
    store['workout_history'] = JSON.stringify(mk(TRAINING[trainKey].s, 'strength'));
    store['cardio_sessions'] = JSON.stringify(mk(TRAINING[trainKey].c, 'run'));
    return plan;
};

/* ── 窮舉 ───────────────────────────────────────────────────────────── */
const goals = ['cut', 'bulk', 'recomp'];
const trajKeys = Object.keys(TRAJECTORIES);
const ages = Object.keys(MEASURE_AGE);
const trains = Object.keys(TRAINING);

const seen = {};
let combos = 0;
const noDeterminism = [];

for (const goal of goals) {
    for (const traj of trajKeys) {
        for (const ageKey of ages) {
            for (const trainKey of trains) {
                combos++;
                const plan = setupCase(goal, traj, ageKey, trainKey);
                const st = buildCycleState('u1', plan, TODAY);
                const again = buildCycleState('u1', plan, TODAY);
                if (st.phase !== again.phase) noDeterminism.push(`${goal}/${traj}/${ageKey}/${trainKey}`);
                seen[st.phase] = (seen[st.phase] || 0) + 1;

                const tag = `${goal}/${traj}/${ageKey}/${trainKey}`;

                // 1. 狀態必須在定義好的清單裡
                ok(CYCLE_PHASES.includes(st.phase), `[${tag}] 狀態要在清單內`, st.phase);

                // 2. 不能自相矛盾
                if (st.phase === 'reached' || st.phase === 'overshot') {
                    ok(st.progress.remainingKg <= 0.05, `[${tag}] 達標就不該還剩公斤數`, String(st.progress.remainingKg));
                }
                if (st.phase === 'need_first_measure') {
                    ok(st.progress.actualPaceKgWk == null, `[${tag}] 沒量測不該有實際配速`);
                    ok(st.chart.every(r => r.actual === null || r.week === 0), `[${tag}] 沒量測不該有實測點`);
                }
                if (st.phase === 'measure_stale') {
                    ok(st.coach?.level === 'action', `[${tag}] 量測過期要求使用者做事`);
                }

                // 3. 需要使用者做事的狀態，一定要有下一步
                if (st.needsUser && st.phase !== 'no_plan') {
                    const hasNext = !!st.coach?.title || st.notes.some(n => n.level === 'action' || n.level === 'watch');
                    ok(hasNext, `[${tag}] 需要行動卻沒有下一步`);
                }

                // 4. 跨系統：專業上不能放過的組合
                if (goal === 'bulk' && trainKey !== 'none' && TRAINING[trainKey].s / 8 < 2) {
                    ok(st.notes.some(n => n.system === 'strength' && n.level === 'action'),
                        `[${tag}] 增重但重訓不足，必須提醒`);
                }
                if (trainKey === 'none') {
                    ok(st.notes.length === 1 && st.notes[0].level === 'info',
                        `[${tag}] 沒有訓練紀錄時只說沒有紀錄，不指責使用者`);
                }
                if (goal === 'cut' && trainKey === 'cardio_heavy' && st.phase === 'too_fast') {
                    ok(st.notes.some(n => n.system === 'cardio'), `[${tag}] 跑量大又減太快要提醒`);
                }

                // 5. 數字不能有 NaN
                const flat = JSON.stringify(st);
                ok(!flat.includes('null,null,null') && !/NaN/.test(flat), `[${tag}] 不能出現 NaN`);

                // 6. 圖表：計劃線不越過目標、實測點只在有量測的那週
                const planned = st.chart.map(r => r.planned).filter(v => v != null);
                if (planned.length) {
                    const t = TARGET[goal], s = START[goal];
                    const dir = t > s ? 1 : -1;
                    ok(planned.every(v => dir > 0 ? v <= t + 0.001 : v >= t - 0.001),
                        `[${tag}] 計劃線不該超過目標`, `${Math.min(...planned)}~${Math.max(...planned)}`);
                    ok(planned[0] === s, `[${tag}] 計劃線從起點出發`, String(planned[0]));
                }
                const actualCount = st.chart.filter(r => r.actual != null).length;
                ok(actualCount <= 2, `[${tag}] 實測點不會被內插補值`, String(actualCount));

                // 6b. 目標刻度（取代原本那張看不懂的四合一圖）
                //     這是使用者第一眼看的東西，所以每一組都要檢查它說得對不對。
                const g = st.gauge;
                ok(g.ready === true, `[${tag}] 有計劃就要算得出目標刻度`);
                ok(g.pctDone >= 0 && g.pctDone <= 100, `[${tag}] 完成度必須落在 0–100`, String(g.pctDone));
                ok(g.pctPlan >= 0 && g.pctPlan <= 100, `[${tag}] 計劃位置必須落在 0–100`, String(g.pctPlan));
                ok(g.start === START[goal] && g.target === TARGET[goal],
                    `[${tag}] 軌道兩端就是起點與目標`, `${g.start}→${g.target}`);
                if (g.planWeight != null) {
                    const dir = TARGET[goal] > START[goal] ? 1 : -1;
                    ok(dir > 0 ? g.planWeight <= TARGET[goal] + 0.001 : g.planWeight >= TARGET[goal] - 0.001,
                        `[${tag}] 計劃位置不會超過目標`, String(g.planWeight));
                }
                if (!g.hasMeasure) {
                    ok(g.pctDone === 0, `[${tag}] 沒量過就不能有完成度`, String(g.pctDone));
                    ok(g.current === null, `[${tag}] 沒量過就沒有「目前」`);
                    ok(/還沒量/.test(g.trendText), `[${tag}] 沒量過要直說`, g.trendText);
                }
                if (st.phase === 'reached' || st.phase === 'overshot') {
                    ok(g.pctDone === 100, `[${tag}] 達標時軌道要填滿`, String(g.pctDone));
                }
                if (g.trend === 'reverse') {
                    ok((st.progress.movedKg || 0) < -0.2, `[${tag}] 只有真的往反方向才說反方向`);
                }
                if (g.trend === 'ahead') ok(g.gapKg > 0, `[${tag}] 說「比計劃快」就要真的快`, String(g.gapKg));
                if (g.trend === 'behind') ok(g.gapKg < 0, `[${tag}] 說「比計劃慢」就要真的慢`, String(g.gapKg));
                ok(g.points.length >= 1 && g.points[0].week === 0,
                    `[${tag}] 量測點從第 0 週的起點開始`, JSON.stringify(g.points.slice(0, 2)));
                ok(g.points.every(pt => Number.isFinite(pt.week) && pt.week >= 0 && Number.isFinite(pt.kg)),
                    `[${tag}] 量測點都是有效數字`);
                ok(!/NaN/.test(JSON.stringify(g)), `[${tag}] 目標刻度不能出現 NaN`);
                ok(g.trendText.length <= 20, `[${tag}] 趨勢一句話講完`, g.trendText);
                if (g.hasMeasure) {
                    ok(Number.isFinite(g.ageDays) && g.ageDays >= 0,
                        `[${tag}] 有「目前」就要說得出那是幾天前量的`, String(g.ageDays));
                    ok(g.stale === (g.ageDays >= 14), `[${tag}] 過期的判定要跟天數一致`);
                }

                // 7. 訓練次數要跟輸入對得上
                const tr = readTrainingInCycle('u1', plan, TODAY);
                ok(tr.strengthSessions === TRAINING[trainKey].s, `[${tag}] 重訓次數對得上`,
                    `${tr.strengthSessions} vs ${TRAINING[trainKey].s}`);
                ok(tr.cardioSessions === TRAINING[trainKey].c, `[${tag}] 跑步次數對得上`,
                    `${tr.cardioSessions} vs ${TRAINING[trainKey].c}`);
            }
        }
    }
}

console.log(`\n── 窮舉 ${combos} 種組合（目標 ${goals.length} × 走向 ${trajKeys.length} × 量測 ${ages.length} × 訓練 ${trains.length}）──`);
console.log('狀態分布：');
for (const p of CYCLE_PHASES) {
    const n = seen[p] || 0;
    console.log(`   ${p.padEnd(20)} ${String(n).padStart(4)} 組${n === 0 ? '   ← 這次沒被觸發' : ''}`);
}
ok(noDeterminism.length === 0, '同樣輸入必須得到同樣狀態', noDeterminism.slice(0, 3).join(' / '));

console.log('\n── 沒有計劃 ──');
{
    const st = buildCycleState('u1', null, TODAY);
    seen[st.phase] = (seen[st.phase] || 0) + 1;
    ok(st.phase === 'no_plan', '沒有計劃 → no_plan');
    ok(st.notes.length === 0 && st.chart.length === 0, '沒有計劃就不畫圖、不給跨系統結論');
}

console.log('\n── 第一週 ──');
{
    store['inbody_local_u1'] = JSON.stringify([{ measurement_date: iso(ago(3)), weight_kg: 70 }]);
    const st = buildCycleState('u1', {
        planId: 'p_new', goalType: 'bulk', currentWeight: 70, targetWeight: 74,
        pace: 0.35, committedAt: ago(3).getTime(),
    }, TODAY);
    seen[st.phase] = (seen[st.phase] || 0) + 1;
    ok(st.phase === 'week_one', '不到一週 → week_one', st.phase);
    ok(!st.needsUser, '第一週不需要使用者做事');
}

console.log('\n── 覆蓋率：每一個定義過的狀態都要被觸發到 ──');
{
    const missing = CYCLE_PHASES.filter(p => !seen[p]);
    ok(missing.length === 0, '沒有任何狀態是「定義了卻沒測到」', missing.join('、'));
    console.log('   最終分布：');
    for (const p of CYCLE_PHASES) console.log(`      ${p.padEnd(20)} ${String(seen[p] || 0).padStart(4)} 組`);
}

console.log('\n── 圖表：計劃線與實測點是兩欄，不混成一條 ──');
{
    const plan = setupCase('bulk', 'on_track', 'fresh', 'adequate');
    const chart = buildCycleChart('u1', plan, TODAY);
    ok(chart.length >= 8, `至少涵蓋已經過的週數（${chart.length}）`);
    ok(chart.every(r => 'planned' in r && 'actual' in r), '每一週都同時有計劃與實測欄位');
    ok(chart.some(r => r.strength > 0), '圖表帶得出重訓次數');
    ok(chart.every(r => r.week >= 0 && Number.isFinite(r.week)), '週數是有效數字');
}

console.log('\n── 目標刻度：折線圖只在量測夠多時才出現 ──');
{
    const committedAt = ago(56).getTime();
    const plan = {
        planId: 'p_g', goalType: 'cut', currentWeight: 78, targetWeight: 72,
        pace: 0.5, committedAt,
    };
    // 只有起點一筆
    store['inbody_local_u1'] = JSON.stringify([{ measurement_date: iso(ago(56)), weight_kg: 78 }]);
    const g1 = buildGoalGauge('u1', plan, TODAY);
    ok(g1.measureCount === 1, '只有起點 → 一個點', String(g1.measureCount));
    ok(g1.pctDone === 0, '只有起點 → 完成度 0%，軌道是空的', String(g1.pctDone));
    ok(g1.stale === true && g1.ageDays === 56,
        '「目前」是 56 天前量的，必須標出來，不能假裝是現況', `${g1.ageDays} 天 / stale=${g1.stale}`);

    // 兩筆：還是不畫線
    store['inbody_local_u1'] = JSON.stringify([
        { measurement_date: iso(ago(56)), weight_kg: 78 },
        { measurement_date: iso(ago(2)), weight_kg: 75.5 },
    ]);
    const g2 = buildGoalGauge('u1', plan, TODAY);
    ok(g2.measureCount === 2, '兩筆量測 → 兩個點（UI 門檻是 3，所以還不畫線）', String(g2.measureCount));
    ok(g2.hasMeasure === true && g2.current === 75.5, '目前顯示的是最新一筆實測', String(g2.current));
    ok(g2.pctDone === 42, '完成度 = (78−75.5)/6 ≈ 42%', String(g2.pctDone));
    ok(g2.pctPlan === 67, '照 0.5kg/週走 8 週應該完成 67%', String(g2.pctPlan));
    ok(g2.trend === 'behind', '實際 2.5kg vs 計劃 4kg → 落後', `${g2.trend} ${g2.gapKg}`);
    ok(g2.trendText === '比計劃慢 1.5 KG', '落後幾公斤要講出來', g2.trendText);

    // 三筆：可以畫線了
    store['inbody_local_u1'] = JSON.stringify([
        { measurement_date: iso(ago(56)), weight_kg: 78 },
        { measurement_date: iso(ago(28)), weight_kg: 76 },
        { measurement_date: iso(ago(2)), weight_kg: 74 },
    ]);
    ok(buildGoalGauge('u1', plan, TODAY).measureCount === 3, '三筆量測 → 可以畫趨勢線');
}

console.log('\n── 目標刻度：沒有計劃就什麼都不畫 ──');
{
    const g = buildGoalGauge('u1', null, TODAY);
    ok(g.ready === false, '沒有計劃 → ready false');
    ok(g.points.length === 0 && g.pctDone === 0, '沒有計劃就沒有點、沒有完成度');
}

console.log('\n── 目標刻度：走過頭時軌道填滿，不會超出 100% ──');
{
    const plan = {
        planId: 'p_o', goalType: 'cut', currentWeight: 78, targetWeight: 72,
        pace: 0.5, committedAt: ago(56).getTime(),
    };
    store['inbody_local_u1'] = JSON.stringify([
        { measurement_date: iso(ago(56)), weight_kg: 78 },
        { measurement_date: iso(ago(1)), weight_kg: 70.4 },
    ]);
    const g = buildGoalGauge('u1', plan, TODAY);
    ok(g.pctDone === 100, '超過目標仍然是 100%，不是 127%', String(g.pctDone));
    ok(g.trend === 'ahead', '走得比計劃快', g.trend);
}

console.log(`\n${fail === 0 ? '✅ 全部通過' : '❌ 有失敗'}  ${pass} 通過 / ${fail} 失敗\n`);
process.exit(fail === 0 ? 0 : 1);
