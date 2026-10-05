// verify_run_place_feedback.mjs — 跑步回饋與換期裡的「在哪裡跑」
//   · 跑步機、爬升多的路線不拿來校準配速；有爬升的換算成平路等效
//   · 下一期是一份課表：照主場排；只有證據夠（主場不是操場、間歇一直沒做完、節奏跑做得到）才把間歇換成節奏跑
//   · 沒有跑點紀錄 → 不猜
import * as esbuild from 'esbuild';
const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
globalThis.window = { location: { hostname: 'x', pathname: '/' }, addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
const r = await esbuild.build({
    stdin: { contents: "export * as rp from './src/utils/runPlaceFeedback.js'; export * as se from './src/utils/cardioSettlementEngine.js'; export * as pg from './src/utils/cardioPlanProgress.js'; export * as fe from './src/utils/cardioPlanFusionEngine.js'; export * as ac from './src/utils/cardioPlanActuals.js';", resolveDir: process.cwd(), loader: 'js' },
    bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'error',
    define: { 'import.meta.env': '{"DEV":true}' },
    plugins: [{ name: 'stub-api', setup(b) { b.onResolve({ filter: /api\/client$|cloudSync$/ }, () => ({ path: 'stub', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default { get: async () => ({}), post: async () => ({}) }; export const pushBlob = async () => true;', loader: 'js' })); } }],
});
const { rp, se, pg, fe, ac } = await import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));
let fail = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };

// ── 配速：場地不同不能直接比 ──
ok(rp.flatEquivalentPace({ paceSec: 330, distanceKm: 8, indoor: true }).excluded === 'indoor', '跑步機 → 不拿來校準配速');
ok(rp.flatEquivalentPace({ paceSec: 400, distanceKm: 8, elevGainM: 300 }).excluded === 'hilly', '每公里爬 37 m 的山路 → 不拿來校準');
const adj = rp.flatEquivalentPace({ paceSec: 360, distanceKm: 10, elevGainM: 150 });
ok(adj.adjusted && adj.pace < 360 && adj.pace > 330, `有爬升（每公里 15 m）→ 換算平路等效 6'00" → ${Math.floor(adj.pace / 60)}'${String(adj.pace % 60).padStart(2, '0')}"`);
ok(rp.flatEquivalentPace({ paceSec: 360, distanceKm: 10 }).pace === 360, '平路 → 照原本的配速');

const plan0 = { meta: { baseline_pace_5k_sec: 300, pacing_mode: 'measured' } };
const week = { bricks: [
    // 平路那趟用「5K 5'00" 的輕鬆配速」跑（5'00" + 輕鬆跑偏移 90 秒 = 6'30"），校準後基準應該不變
    { subtype: 'easy', status: 'completed', actual_distance_km: 8, actual_duration_min: 52, actual_pace_sec: 390 },
    { subtype: 'easy', status: 'completed', actual_distance_km: 8, actual_duration_min: 60, actual_pace_sec: 450, actual_elev_gain_m: 320 },   // 山路
    { subtype: 'easy', status: 'completed', actual_distance_km: 6, actual_duration_min: 45, actual_pace_sec: 450, actual_indoor: true },     // 跑步機
] };
const samples = ac.paceCalibrationSamples(week);
ok(samples.length === 3 && samples[1].elev_gain_m === 320 && samples[2].indoor === true, '週結算的配速樣本帶著爬升與跑步機標記');
const cal = se.calibratePaceFromActuals(plan0, samples);
ok(cal.samples === 1 && cal.newBaselinePace5K === 300, `只用平路那趟校準：基準維持 5'00"（山路和跑步機那兩趟的 7'30" 沒把配速拖慢）`);
ok(cal.rationale.some((t) => /跑步機/.test(t) && /爬升多/.test(t)), `說明有寫排除了哪些：「${cal.rationale.find((t) => /跑步機/.test(t))}」`);
const calOnlyHills = se.calibratePaceFromActuals(plan0, samples.slice(1));
ok(calOnlyHills.samples === 0 && calOnlyHills.newBaselinePace5K === 300 && /不能跟平路比/.test(calOnlyHills.rationale[0]), '這週全是山路／跑步機 → 配速不動，並說原因');

// ── 換期：一份課表、照主場、證據夠才改 ──
const brick = (subtype, status, place, km = 6) => ({ subtype, type: subtype === 'interval' || subtype === 'tempo' ? 'speed' : 'recovery', distance_km: km, status,
    actual_distance_km: status === 'completed' ? km : status === 'partial' ? km / 2 : 0, ...(place ? { actual_place_id: place.id, actual_place_name: place.name, actual_place_kind: place.kind } : {}) });
const park = { id: 'p1', name: '大安森林公園', kind: 'park' }, track = { id: 't1', name: '師大操場', kind: 'track' };
const mkPlan = (weeks) => ({ goal: 'race_5k_10k', total_weeks: weeks.length, sessions_per_week: 3, meta: { planned_run_sessions: 3, baseline_pace_5k_sec: 300 },
    weeks: weeks.map((bricks, i) => ({ week_index: i + 1, bricks })) });
const parkWeeks = [0, 1, 2, 3].map(() => [brick('easy', 'completed', park), brick('tempo', 'completed', park), brick('interval', 'skipped', null)]);
let p = mkPlan(parkWeeks);
let s = rp.cyclePlaceSummary(p);
ok(s.main?.id === 'p1' && s.main.runs === 8, '主場：這期最常跑的地方（大安森林公園 8 趟）');
let adv = rp.placeAdvice(p);
ok(adv?.qualityStyle === 'tempo' && /大安森林公園/.test(adv.reason) && /0／4/.test(adv.reason), `主場是公園、間歇 0／4、節奏跑做得到 → 建議速度課以節奏跑為主`);
let rec = pg.recommendNextPlan(p);
ok(rec.config.qualityStyle === 'tempo' && rec.adjustments.some((a) => /節奏跑為主/.test(a)) && rec.mainPlace?.id === 'p1', `下一期推薦：寫進設定，並列出原因（「${rec.adjustments.find((a) => /節奏跑/.test(a))}」）`);
const diag = pg.diagnosePlan(p);
ok(diag.gaps.some((g) => /不是操場/.test(g.body)), '結業診斷的缺口講的是場地，不是「你不夠努力」');

const genBase = { goal: 'race_5k_10k', totalWeeks: 8, sessionsPerWeek: 4, currentWeeklyKm: 25, baselinePace5K: 300, runningYears: 3, includeStrength: false };
const withIv = fe.generateCardioPlan(genBase);
const hasInterval = (pl) => pl.weeks.some((w) => w.bricks.some((b) => b.subtype === 'interval'));
const tempoPlan = fe.generateCardioPlan({ ...genBase, qualityStyle: 'tempo' });
if (hasInterval(withIv)) {
    ok(!hasInterval(tempoPlan) && tempoPlan.weeks.some((w) => w.bricks.some((b) => b.place_adapted_from === 'interval' && b.subtype !== 'interval')), '生成下一期：間歇改成節奏跑（配速照節奏跑重算）');
    const tb = tempoPlan.weeks.flatMap((w) => w.bricks).find((b) => b.place_adapted_from === 'interval');
    ok(tb && tb.target_pace_sec > 300, `改過的那趟配速是節奏跑配速（${tb?.target_pace_label}），不是間歇的`);
} else {
    ok(true, '（這組設定本來就沒排間歇，略過生成檢查）');
}

// 不該改的情況
p = mkPlan([0, 1, 2, 3].map(() => [brick('easy', 'completed', track), brick('tempo', 'completed', track), brick('interval', 'skipped', null)]));
ok(rp.placeAdvice(p) === null, '主場是操場 → 間歇沒做不是場地問題，不改');
p = mkPlan([0, 1, 2, 3].map(() => [brick('easy', 'completed', park), brick('tempo', 'skipped', null), brick('interval', 'skipped', null)]));
ok(rp.placeAdvice(p) === null, '節奏跑也做不到 → 是量太重，不是場地（交給完成度規則處理）');
p = mkPlan([0, 1, 2, 3].map(() => [brick('easy', 'completed', park), brick('tempo', 'completed', park), brick('interval', 'completed', park)]));
ok(rp.placeAdvice(p) === null, '在公園間歇也做得完 → 不改');
p = mkPlan([0, 1, 2, 3].map(() => [brick('easy', 'completed', null), brick('tempo', 'completed', null), brick('interval', 'skipped', null)]));
ok(rp.placeAdvice(p) === null && pg.recommendNextPlan(p).config.qualityStyle === undefined, '沒有跑點紀錄 → 不猜，課表照原本規則');
p = mkPlan([[brick('easy', 'completed', park), brick('interval', 'skipped', null)], [brick('easy', 'completed', track), brick('interval', 'skipped', null)],
    [brick('easy', 'completed', { id: 'r1', name: '河堤', kind: 'riverside' }), brick('interval', 'skipped', null)]]);
ok(rp.cyclePlaceSummary(p).main === null, '三個地方各跑一次 → 沒有主場，不因場地改課表');

console.log(fail ? `\n${fail} 項失敗` : '\n全部通過');
process.exit(fail ? 1 : 0);
