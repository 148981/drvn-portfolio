// verify_nutrition_checkpoint.mjs — 減脂／增重計劃的每 4 週回饋＋下一期建議飲食
//   · 什麼時候該回饋、要不要先量
//   · 達成／太快／差一點／沒動／走反／數字不合理 的判定
//   · 沒達成的原因：有數字才講，依影響排
//   · 下一步選項與套用（調熱量、放慢配速）不破壞三大營養素的加總
//   · 建議飲食：照每一餐吃過的東西 → 留著／換掉（同買法）／試試；增重與減脂方向相反
import * as esbuild from 'esbuild';
const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
globalThis.window = { location: { hostname: 'x', pathname: '/' }, addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
const r = await esbuild.build({
    stdin: { contents: "export * as cp from './src/utils/nutritionCheckpoint.js'; export * as fg from './src/utils/foodGuidance.js'; export * as ct from './src/utils/cutProgress.js'; export * as rc from './src/utils/planCycleRecap.js';", resolveDir: process.cwd(), loader: 'js' },
    bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'error', define: { 'import.meta.env': '{"DEV":true}' },
    plugins: [{ name: 'stub-api', setup(b) { b.onResolve({ filter: /api\/client$|cloudSync$/ }, () => ({ path: 'stub', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default { get: async () => ({}), post: async () => ({}) }; export const pushBlob = async () => true;', loader: 'js' })); } }],
});
const { cp, fg, ct, rc } = await import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));
let fail = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };
const DAY = 86400000;
const T0 = new Date('2026-09-01T08:00:00').getTime();
const today = new Date(T0 + 29 * DAY);
const iso = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const cutPlan = { planId: 'p1', goalType: 'cut', committedAt: T0, pace: 0.5, targetWeight: 70, currentWeight: 80, adjustedIntake: 1900, newProtein: 150, newCarbs: 200, newFat: 55.6 };
const ms = (pairs) => pairs.map(([d, w, bf]) => ({ t: T0 + d * DAY, weight: w, bodyFat: bf ?? null }));
const block = { index: 1, from: T0, to: T0 + 28 * DAY };
const logs = (n, kcal, protein = 150, weekendExtra = 0) => Array.from({ length: n }, (_, i) => {
    const t = T0 + i * DAY; const wd = new Date(t).getDay();
    return { date: iso(t), calories: kcal + (wd === 0 || wd === 6 ? weekendExtra : 0), protein };
});

// ── 什麼時候 ──
ok(cp.checkpointDue(cutPlan, {}, new Date(T0 + 27 * DAY)) === null, '還沒滿 4 週 → 不回饋');
const due = cp.checkpointDue(cutPlan, {}, today);
ok(due?.index === 1 && due.from === T0, '滿 4 週 → 第 1 次回饋');
ok(cp.checkpointDue(cutPlan, { p1: { reviewed: [1] } }, today) === null, '看過了 → 不再跳');
ok(cp.checkpointDue(cutPlan, { p1: { reviewed: [1] } }, new Date(T0 + 85 * DAY))?.index === 3, '很久沒開 → 只回最近的第 3 次');
ok(cp.needsFreshMeasurement(ms([[0, 80], [20, 78.5]]), block, today).need === true, '上次量是 9 天前 → 先量一次');
ok(cp.needsFreshMeasurement(ms([[0, 80], [26, 78.5]]), block, today).need === false, '3 天前量過 → 直接看結果');

// ── 判定 ──
const ev = (pairs, extra = {}) => cp.evaluateCheckpoint({ plan: cutPlan, measures: ms(pairs), dailyLogs: logs(26, 1900), mealDays: [], training: { strength: 8, cardio: 4 }, block, today, ...extra });
let e = ev([[0, 80, 25], [28, 78.2, 23.8]]);
ok(e.verdict === 'achieved' && e.ratio === 0.9 && e.praise.length > 0 && e.bodyFat.delta === -1.2, `減 1.8 kg（目標 2.0）→ 達成 90%，附做得好的地方（${e.praise.join('、')}）`);
ok(ev([[0, 80], [28, 76.4]]).verdict === 'too_fast', '4 週減 3.6 kg（每週 >1% 體重）→ 太快');
ok(ev([[0, 80], [28, 79.2]]).verdict === 'partial', '減 0.8 kg → 差一點（40%）');
ok(ev([[0, 80], [28, 79.9]]).verdict === 'missed', '幾乎沒動 → 沒達成');
ok(ev([[0, 80], [28, 81]]).verdict === 'reverse', '多了 1 kg → 走反');
e = ev([[0, 74.9], [28, 65.2]]);
ok(e.verdict === 'check' && /量錯|秤/.test(e.sub) && e.options[0].id === 'remeasure', '4 週掉 9.7 kg → 先確認數字，不硬下結論');
ok(ev([[0, 80]]).verdict === 'no_data', '這 4 週只有起點一筆 → 資料不夠');

// ── 原因 ──
e = cp.evaluateCheckpoint({ plan: cutPlan, measures: ms([[0, 80], [28, 79.9]]), dailyLogs: logs(9, 2300), mealDays: [], training: null, block, today });
ok(e.reasons[0].code === 'logging' && /記了 9 天/.test(e.reasons[0].title), `記不到一半 → 第一個原因是記錄（「${e.reasons[0].title}」）`);
e = cp.evaluateCheckpoint({ plan: cutPlan, measures: ms([[0, 80], [28, 79.9]]), dailyLogs: logs(25, 2150, 110, 500), mealDays: [], training: { strength: 2, cardio: 0 }, block, today });
const codes = e.reasons.map((x) => x.code);
ok(codes[0] === 'over_kcal' && codes.includes('weekend') && codes.includes('protein') && codes.includes('training'), `記得夠但吃多 → 熱量、週末、蛋白質、重訓（${codes.join(' > ')}）`);
ok(/約 \d/.test(e.reasons[0].detail), `熱量差換算成公斤：「${e.reasons[0].detail}」`);
e = cp.evaluateCheckpoint({ plan: cutPlan, measures: ms([[0, 80], [14, 79.9], [28, 79.9]]), dailyLogs: logs(26, 1910), mealDays: [], training: { strength: 9, cardio: 2 }, block, today });
ok(e.reasons[0].code === 'stall_followed' && e.options[0].id === 'adjust_kcal' && e.options[0].delta === -120, '照計劃吃、體重沒動 → 原因是份量低估或適應，建議每天 −120 大卡');
const meal = (d, h, name, kcal, p = 2) => ({ name, calories: kcal, protein: p, timestamp: `${iso(T0 + d * DAY)}T${String(h).padStart(2, '0')}:10:00` });
const mealDays = Array.from({ length: 20 }, (_, d) => ({ date: iso(T0 + d * DAY), meals: [meal(d, 8, '蛋餅', 287, 11), meal(d, 12, '排骨便當', 791, 29), meal(d, 15, '珍珠奶茶', 658, 1), meal(d, 19, '雞腿便當', 802, 38), meal(d, 22, '洋芋片', 300, 3)] }));
e = cp.evaluateCheckpoint({ plan: cutPlan, measures: ms([[0, 80], [28, 79.6]]), dailyLogs: logs(20, 2850), mealDays, training: { strength: 2, cardio: 0 }, block, today });
ok(e.reasons.some((x) => x.code === 'drinks'), `逐筆紀錄看得出含糖飲料（${e.reasons.map((x) => x.title).join('／')}）`);

// ── 套用 ──
const adj = cp.applyKcalDelta(cutPlan, -120, 't');
ok(adj.adjustedIntake === 1780 && Math.abs(adj.newProtein * 4 + adj.newCarbs * 4 + adj.newFat * 9 - adj.adjustedIntake) <= 5 && adj.kcalAdjustments.length === 1, '每天 −120：差額由碳水吸收，三大營養素加總仍等於熱量');
const sum = (p) => p.newProtein * 4 + p.newCarbs * 4 + p.newFat * 9;
ok(sum(adj) === adj.adjustedIntake, `調整後 P×4+C×4+F×9 剛好等於每天熱量（${sum(adj)} = ${adj.adjustedIntake}）`);
const slow = cp.applySlowerPace(cutPlan);
ok(slow.pace === 0.25 && Math.abs(slow.adjustedIntake - (1900 + Math.round(0.25 * 7700 / 7))) <= 2 && sum(slow) === slow.adjustedIntake,
    `放慢配速 0.5 → 0.25：每天多約 ${Math.round(0.25 * 7700 / 7)} 大卡，三大營養素加總仍等於熱量`);
// 碳水會掉到 30 g 以下 → 不調（回 null），而不是夾在 30 g 讓加總對不上
ok(cp.applyKcalDelta({ ...cutPlan, newCarbs: 37, adjustedIntake: 1850, newFat: 100, newProtein: 200 }, -120, 't') === null, '碳水會掉到 30 g 以下 → 拒絕調整（null）');
// 熱量低於安全下限（1200，或已知的 BMR）→ 不調
ok(cp.applyKcalDelta({ ...cutPlan, adjustedIntake: 1250 }, -120, 't') === null, '每天熱量會低於 1200 → 拒絕調整');
ok(cp.applyKcalDelta({ ...cutPlan, bmr: 1850 }, -120, 't') === null, '每天熱量會低於基礎代謝 → 拒絕調整');
ok(cp.applyKcalDelta({ ...cutPlan, adjustedIntake: 1150, newCarbs: 112 }, 150, 't') !== null, '本來就低於下限、往上加 → 允許');
ok(cp.applySlowerPace({ ...cutPlan, pace: 0.25 }) === null, '已經是最慢的檔 → 放慢配速回 null');
// 維持期偏離：方向看體重（重了少吃、輕了多吃），不看吃得多不多
const mPlan = { ...cutPlan, goalType: 'recomp', pace: 0, targetWeight: 80 };
const mUp = cp.evaluateCheckpoint({ plan: mPlan, measures: ms([[0, 80], [28, 81.5]]), dailyLogs: logs(26, 1850), mealDays: [], training: { strength: 8, cardio: 0 }, block, today });
ok(mUp.verdict === 'drift' && mUp.options[0].delta === -120, `維持期重了 1.5 kg（熱量還低於目標）→ 每天少 120（${mUp.options[0].delta}）`);
const mDown = cp.evaluateCheckpoint({ plan: mPlan, measures: ms([[0, 80], [28, 78.5]]), dailyLogs: logs(26, 2000), mealDays: [], training: { strength: 8, cardio: 0 }, block, today });
ok(mDown.verdict === 'drift' && mDown.options[0].delta === 120, `維持期輕了 1.5 kg（熱量還高於目標）→ 每天多 120（${mDown.options[0].delta}）`);
const bulkPlan = { ...cutPlan, goalType: 'bulk', pace: 0.35, targetWeight: 74, adjustedIntake: 2800, newCarbs: 400 };
const be = cp.evaluateCheckpoint({ plan: bulkPlan, measures: ms([[0, 70], [28, 70.1]]), dailyLogs: logs(25, 2400, 120), mealDays: [], training: { strength: 4, cardio: 0 }, block, today });
ok(be.verdict === 'missed' && be.reasons[0].code === 'under_kcal', '增重沒動、吃得比目標少 → 原因是吃不夠（方向跟減脂相反）');

// ── 建議飲食 ──
const g = fg.recommendFoods({ days: mealDays, goalType: 'cut', weightKg: 80, dailyKcal: 1900 });
const lunch = g.slots.lunch, snacks = g.slots.snacks;
ok(lunch.swaps.length >= 1 && lunch.swaps[0].from.name === '排骨便當' && lunch.swaps[0].sameGroup && /蛋白質|大卡/.test(lunch.swaps[0].why),
    `午餐：排骨便當 → ${lunch.swaps[0]?.to.name}（同樣是便當店；${lunch.swaps[0]?.why}）`);
const teaSwap = Object.values(g.slots).flatMap((s) => s.swaps).find((x) => x.from.name === '珍珠奶茶');
ok(teaSwap && fg.roleOf(teaSwap.to) === 'drink', `珍珠奶茶 → 換成另一杯飲料（${teaSwap?.to.name}），不是換成一個便當`);
const chipSwap = snacks.swaps.find((x) => x.from.name === '洋芋片');
ok(!chipSwap || chipSwap.to.calories <= 390, `宵夜洋芋片 → 換成差不多份量的小點（${chipSwap?.to.name || '沒有更好的就不硬換'}）`);
ok(g.insights.some((x) => x.code === 'sugary_drinks'), '整體觀察講到含糖飲料（有數字）');
ok(Object.values(g.slots).every((s) => s.discover.every((d) => fg.scoreFood({ ...d, grams: d.servingGrams }, 'cut').score >= 60)), '「試試」的都是對減脂分數高的');
const allIds = Object.values(g.slots).flatMap((s) => [...s.swaps.map((x) => x.to.id), ...s.discover.map((d) => d.id)]);
ok(new Set(allIds).size === allIds.length, '同一樣東西不會在不同餐重複建議');
ok(g.slots.lunch.proteinPerMeal === 32 && g.slots.snacks.proteinPerMeal === null, '每餐蛋白質 0.4 g/kg（80 kg → 32 g），點心不算');
const gb = fg.recommendFoods({ days: mealDays, goalType: 'bulk', weightKg: 70, dailyKcal: 2800 });
ok(!gb.slots.lunch.swaps.some((x) => x.from.name === '雞腿便當') && fg.scoreFood({ name: '雞腿便當', calories: 802, protein: 37.9, carbs: 106.9, fats: 23.2, fiber: 2.2, grams: 473 }, 'bulk', { refKcal: 980 }).score > fg.scoreFood({ name: '雞腿便當', calories: 802, protein: 37.9, carbs: 106.9, fats: 23.2, fiber: 2.2, grams: 473 }, 'cut').score,
    '增重期雞腿便當不會被叫你換掉（分數比減脂期高）');
ok(fg.scoreFood({ name: '珍珠奶茶', calories: 658, protein: 1.4, carbs: 125, fats: 16.8, fiber: 0, grams: 700 }, 'cut').score < 10, '減脂期珍珠奶茶分數最低');
const empty = fg.recommendFoods({ days: [], goalType: 'cut', weightKg: 60, dailyKcal: 1600 });
ok(empty.basedOnDays === 0 && empty.slots.breakfast.discover.length > 0 && empty.slots.breakfast.swaps.length === 0, '沒紀錄 → 不編「你常吃」，只給對目標有幫助的選擇');
const qs = fg.quickAddSuggestions(g, 'lunch', 3);
ok(qs.length > 0 && qs[0].kind === 'swap' && /取代排骨便當/.test(qs[0].why), `快速新增的建議卡：換掉的在前（「${qs[0]?.why}」）`);

// ── 進度卡：數字合不合理 ──
store['inbody_local_u9'] = JSON.stringify([{ measurement_date: iso(T0 - DAY), weight_kg: 74.9 }, { measurement_date: iso(T0 + 26 * DAY), weight_kg: 65.2 }]);
const pr = ct.computeCutProgress('u9', { goalType: 'bulk', committedAt: T0, targetWeight: 78.9, pace: 0.35 }, today);
ok(pr.offTrack && pr.implausible && !pr.targetMismatch, '圖二的情況：增重計劃掉了 9.7 kg → 標「走反」也標「數字不合理」');
ok(ct.computeCutProgress('u9', { goalType: 'cut', committedAt: T0, targetWeight: 78.9, pace: 0.5 }, today).targetMismatch, '減脂卻把目標設得比起點重 → 標出來');
ok(ct.cycleWeightSeries('u9', { committedAt: T0 }).length === 2, '趨勢圖拿得到這一期的實測點');

// ── 體態重塑不會「一量就結算」 ──
store['inbody_local_u8'] = JSON.stringify([{ measurement_date: iso(T0 - DAY), weight_kg: 70 }, { measurement_date: iso(T0 + 20 * DAY), weight_kg: 70.1 }]);
const recompPlan = { planId: 'r1', goalType: 'recomp', committedAt: T0, targetWeight: 70, currentWeight: 70, pace: 0.1 };
ok(rc.isCycleComplete(ct.computeCutProgress('u8', recompPlan, today)) === false && rc.buildCycleRecap('u8', recompPlan, today) === null, '體態重塑體重沒動 → 不算一期結束（照時間走，由 4 週回饋收尾）');
const rcEv = cp.evaluateCheckpoint({ plan: recompPlan, measures: ms([[0, 70], [28, 70.1]]), dailyLogs: logs(26, 1900), mealDays: [], training: { strength: 8, cardio: 0 }, block, today, userId: 'u8' });
ok(rcEv.verdict !== 'reached', `體態重塑的 4 週回饋不判「目標達成」（${rcEv.verdict}）`);
store['inbody_local_u7'] = JSON.stringify([{ measurement_date: iso(T0 - DAY), weight_kg: 80 }, { measurement_date: iso(T0 + 26 * DAY), weight_kg: 77.9 }]);
ok(rc.isCycleComplete(ct.computeCutProgress('u7', { goalType: 'cut', committedAt: T0, targetWeight: 78, pace: 0.5 }, today)) === true, '減脂走到目標 → 照樣算一期結束');

console.log(fail ? `\n${fail} 項失敗` : '\n全部通過');
process.exit(fail ? 1 : 0);
