// verify_season_transition.mjs — 換季：預告清單＝真的會寫進課表的改動
//   · 每一種改法（加一組／降強度／照舊）預告的差異，套用後課表真的是那樣
//   · 依紀錄的個人化（加重量、做不到就換）會出現在清單裡，並帶原因
//   · 照舊＋沒紀錄 → 清單是空的（不編造改動）
import * as esbuild from 'esbuild';
const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
globalThis.window = { location: { hostname: 'x', pathname: '/' }, addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
const r = await esbuild.build({
    stdin: { contents: "export * as st from './src/utils/seasonTransition.js';", resolveDir: process.cwd(), loader: 'js' },
    bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'error',
    define: { 'import.meta.env': '{"DEV":true}' },
    plugins: [{ name: 'stub-api', setup(b) { b.onResolve({ filter: /api\/client$|cloudSync$/ }, () => ({ path: 'stub', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default { get: async () => ({}), post: async () => ({}) }; export const pushBlob = async () => true;', loader: 'js' })); } }],
});
const { st } = await import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));
let fail = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };

const day = () => ({ exercises: [
    { name: '槓鈴臥推', nameEn: 'Barbell Bench Press', sets: 3, reps: '8-12', rest: '90s', cat: 'compound', zone: 'chest', muscle: 'chest', eq: 'barbell', tier: 1 },
    { name: '啞鈴側平舉', nameEn: 'Lateral Raise', sets: 3, reps: '12-15', rest: '60s', cat: 'isolation', zone: 'shoulders', muscle: 'shoulders', eq: 'dumbbell', tier: 3 },
] });
const plan = { plan_id: 'p1', weeks: [1, 2, 3, 4].map((n) => ({ week: n, phase: n === 4 ? 'deload' : 'build', days: [day()] })) };

// 加一組
let res = st.buildNextSeasonPlan(plan, 'progress', 'maintain');
let rows = st.diffSeasonPlans(plan, res.plan, res.personal);
ok(rows.length === 1 && rows[0].name === '槓鈴臥推' && rows[0].parts.some((p) => p.label === '組數' && p.from === '3 組' && p.to === '4 組'), '複合動作加一組：清單列出「槓鈴臥推 3 組 → 4 組」');
ok(res.plan.weeks[0].days[0].exercises[0].sets === 4 && res.plan.weeks[3].days[0].exercises[0].sets === 3, '套用後第 1 週真的 4 組，減量週不動');
ok(!rows.some((x) => x.name === '啞鈴側平舉'), '孤立動作沒改 → 不出現在清單');
ok(st.diffRowText(rows[0]) === '槓鈴臥推 3→4 組', '短句：槓鈴臥推 3→4 組');

// 照舊、沒紀錄
res = st.buildNextSeasonPlan(plan, 'keep', 'maintain');
ok(st.diffSeasonPlans(plan, res.plan, res.personal).length === 0, '照原本的課表＋沒有紀錄 → 沒有任何改動（不編造）');

// 降強度
res = st.buildNextSeasonPlan(plan, 'intensity', 'down');
rows = st.diffSeasonPlans(plan, res.plan, res.personal);
ok(rows.length > 0, `降一級強度 → 清單有實際改動（${rows.length} 項：${rows.map(st.diffRowText).join('、')}）`);

// 依紀錄：每組都做滿 → 加重量
const now = Date.now();
const rec = (i) => ({ timestamp: new Date(now - (20 - i) * 86400000).toISOString(), exercises: [
    { name: '槓鈴臥推', sets: [1, 2, 3].map(() => ({ weight: 60, reps: 12, rpe: 7.5, completed: true })) },
    { name: '啞鈴側平舉', sets: [1, 2, 3].map(() => ({ weight: 8, reps: 13, rpe: 8, completed: true })) },
] });
res = st.buildNextSeasonPlan(plan, 'keep', 'maintain', { records: [rec(1), rec(2), rec(3), rec(4)], sinceMs: 0 });
rows = st.diffSeasonPlans(plan, res.plan, res.personal);
const bench = rows.find((x) => x.name === '槓鈴臥推');
ok(bench && bench.parts.some((p) => p.label === '重量' && p.from === '60 kg' && p.to === '62.5 kg') && bench.why === '每組都做滿',
    `每組都做滿 → 清單：臥推 60 → 62.5 kg，原因「每組都做滿」（${bench ? st.diffRowText(bench) : '沒有'}）`);

// 複選：降強度 ＋ 加一組 ＋ 依紀錄 —— 三種改動同時出現在清單、同時寫進課表
res = st.buildNextSeasonPlan(plan, ['intensity', 'progress'], 'down', { records: [rec(1), rec(2), rec(3), rec(4)], sinceMs: 0 });
rows = st.diffSeasonPlans(plan, res.plan, res.personal);
const b2 = rows.find((x) => x.name === '槓鈴臥推');
ok(b2 && ['組數', '次數', '重量'].every((l) => b2.parts.some((p) => p.label === l)),
    `複選三種改法：臥推同時改組數、次數、重量（${b2 ? b2.parts.map((p) => `${p.label} ${p.from}→${p.to}`).join('／') : '沒有'}）`);
ok(res.plan._nextCycleStrategy === 'intensity+progress', '複選的策略有記下來（intensity+progress）');
res = st.buildNextSeasonPlan(plan, [], 'maintain');
ok(st.diffSeasonPlans(plan, res.plan, res.personal).length === 0, '一個都沒勾＝照原本的課表');

// 一直跳過 → 換動作：健身房課表不能換成彈力帶；推薦的替代要跟原本同部位、同器材範圍
const gp = { plan_id: 'p2', equipment_preference: 'mixed', user_level: 'intermediate', weeks: [1, 2, 3, 4].map((n) => ({ week: n, phase: 'build', days: [{ exercises: [
    { name: '槓鈴臥推', nameEn: 'Barbell Bench Press', sets: 3, reps: '8-12', rest: '90s', cat: 'compound', zone: 'chest', muscle: 'chest', eq: 'barbell', tier: 1 },
    { name: '上斜啞鈴推舉', nameEn: 'Incline Dumbbell Press', sets: 3, reps: '8-12', rest: '90s', cat: 'compound', zone: 'chest-upper', muscle: 'chest', eq: 'dumbbell', tier: 2 },
] }] })) };
const skipRecs = [1, 2, 3, 4].map((i) => ({ timestamp: new Date(now - (20 - i) * 86400000).toISOString(), exercises: [{ name: '槓鈴臥推', sets: [{ weight: 60, reps: 8, rpe: 8, completed: true }] }] }));
res = st.buildNextSeasonPlan(gp, [], 'maintain', { records: skipRecs, sinceMs: 0 });
const sw = res.personal.find((c) => c.kind === 'swap');
const swapped = res.plan.weeks[0].days[0].exercises[1];
ok(sw && swapped.eq !== 'band' && swapped.eq !== undefined, `一直跳過的上斜啞鈴推舉 → 換成「${swapped.name}」（${swapped.eq}），不是彈力帶`);
const opts = st.swapOptionsFor(gp, '上斜啞鈴推舉', { current: swapped.name });
ok(opts.length >= 2 && opts.every((o) => o.eq !== 'band' && o.muscle === 'chest'), `換別的：推薦 ${opts.length} 個同部位、健身房器材（${opts.map((o) => o.name).join('、')}）`);
ok(opts.every((o) => o.why), '每個推薦都有一句為什麼');
const blocked = st.swapOptionsFor(gp, '上斜啞鈴推舉', { isBlocked: (ex) => ex.eq === 'machine' });
ok(blocked.every((o) => o.eq !== 'machine'), '健身房沒有的器材不推');
const picked = st.applySwapChoices(res.plan, gp, { '上斜啞鈴推舉': opts[1] });
ok(picked.weeks[2].days[0].exercises[1].name === opts[1].name && picked.weeks[2].days[0].exercises[1].sets === 3, `使用者自己挑 → 四週都換成「${opts[1].name}」，組數保留`);
const kept = st.applySwapChoices(res.plan, gp, { '上斜啞鈴推舉': null });
ok(kept.weeks[0].days[0].exercises[1].name === '上斜啞鈴推舉' && !kept.weeks[0].days[0].exercises[1]._swappedFrom, '選「不換」→ 保留原本的動作');
{ const dr = st.diffSeasonPlans(gp, kept, res.personal); ok(!dr.some((r) => r.name === '上斜啞鈴推舉' && r.parts.some((p) => p.label === '換成')), '不換之後，預告清單就沒有這一項換動作'); }


// ══ 跨健身房：換季改的是共用的那份課表，別間的臨時替換不能被當成「跳過」或「退步」══
{
    const DAY = 86400000;
    const legPlan = () => ({ plan_id: 'p3', equipment_preference: 'mixed', user_level: 'intermediate', gymId: 'gA',
        weeks: [1, 2, 3, 4].map((n) => ({ week: n, phase: 'build', days: [{ exercises: [
            { name: '腿推', nameEn: 'Leg Press', sets: 3, reps: '10-12', rest: '90s', cat: 'compound', zone: 'quads', muscle: 'quads', eq: 'machine', tier: 2 },
            { name: '槓鈴臥推', nameEn: 'Barbell Bench Press', sets: 3, reps: '8-12', rest: '90s', cat: 'compound', zone: 'chest', muscle: 'chest', eq: 'barbell', tier: 1 },
        ] }] })) });
    const bench = (w = 60) => ({ name: '槓鈴臥推', eq: 'barbell', sets: [{ weight: w, reps: 8, rpe: 8, completed: true }] });
    const rec = (i, gym, exs) => ({ timestamp: new Date(now - (30 - i) * DAY).toISOString(), gym, exercises: exs });
    const gB = { id: 'gB', name: '學校健身房' }, gC = { id: 'gC', name: '飯店健身房' }, gA = { id: 'gA', name: '公司樓下' };

    // ① 在 B 館沒腿推機，每次都改做替代（slot = 腿推）→ 不算跳過、不會被換掉
    const subRecs = [1, 2, 3, 4].map((i) => rec(i, gB, [bench(), { name: '保加利亞分腿蹲', slot: '腿推', sets: [{ weight: 12, reps: 10, rpe: 8, completed: true }] }]));
    let a = st.analyzeSeasonExercises(legPlan(), subRecs, 0);
    ok(a['腿推'].subbed === 4 && a['腿推'].skipped === 0 && a['腿推'].done === 0, '在別間因為沒器材改做替代 → 算「替代」不算「跳過」');
    let r3 = st.buildNextSeasonPlan(legPlan(), [], 'maintain', { records: subRecs });
    ok(!r3.personal.some((c) => c.name === '腿推' && c.kind === 'swap'), '所以換季不會因為「一直跳過」把腿推換掉');

    // ② 在 C 館那天沒做腿推、也沒替代，但 C 館後來被標成沒有腿推機 → 器材問題，不算跳過
    const skipC = [1, 2, 3].map((i) => rec(i, gC, [bench()]));
    const missingAtC = (gymId, ex) => gymId === 'gC' && /Leg Press|腿推/.test(`${ex.name}${ex.nameEn}`);
    a = st.analyzeSeasonExercises(legPlan(), skipC, 0, { gymMissing: missingAtC });
    ok(a['腿推'].gymSkipped === 3 && a['腿推'].skipped === 0, '那間沒這台而沒做 → 不算跳過');
    r3 = st.buildNextSeasonPlan(legPlan(), [], 'maintain', { records: skipC, gymMissing: missingAtC });
    ok(!r3.personal.some((c) => c.name === '腿推'), '→ 換季不動腿推');
    r3 = st.buildNextSeasonPlan(legPlan(), [], 'maintain', { records: skipC });
    ok(r3.personal.some((c) => c.name === '腿推' && c.kind === 'swap' && c.why === '一直跳過'), '對照：器材沒問題卻一直沒做 → 照舊換掉（規則沒被放寬）');

    // ③ 機械類重量只在同一間比：A 館腿推機 100→115 在進步，B 館的機台輕很多，不能混在一起算
    const mixRecs = [];
    [100, 105, 110, 115].forEach((w, i) => {
        mixRecs.push(rec(i * 2 + 1, gA, [bench(), { name: '腿推', eq: 'machine', sets: [{ weight: w, reps: 10, rpe: 8, completed: true }] }]));
        if (i > 0) mixRecs.push(rec(i * 2 + 2, gB, [bench(), { name: '腿推', eq: 'machine', sets: [{ weight: 50, reps: 10, rpe: 8, completed: true }] }]));
    });
    mixRecs.push(rec(9, gA, [bench(), { name: '腿推', eq: 'machine', sets: [{ weight: 117.5, reps: 10, rpe: 8, completed: true }] }]));   // A 館多練一次 → A 是主要的那間
    mixRecs.push(rec(10, gB, [bench(), { name: '腿推', eq: 'machine', sets: [{ weight: 50, reps: 10, rpe: 8, completed: true }] }]));  // 最後一次在 B，也不會拿 B 的 50 kg 當起點
    a = st.analyzeSeasonExercises(legPlan(), mixRecs, 0);
    ok(a['腿推'].trendPct > 5 && a['腿推'].lastTopWeight === 117.5 && a['腿推'].loadGym?.id === 'gA',
        `機械類跨館：趨勢只看做最多的那間（+${Math.round(a['腿推'].trendPct)}%）、起始重量用那間的 ${a['腿推'].lastTopWeight} kg`);
    ok(a['槓鈴臥推'].gyms === 2 && a['槓鈴臥推'].loadGym === null, '自由重量各館一樣 → 照常一起算');

    // ④ 主場沒有這台 → 換成主場做得到的（不佔一季 3 個的名額），並說是哪一間
    const homeBlocks = (ex) => /Leg Press|腿推/.test(`${ex.name}${ex.nameEn || ''}`) || ex.eq === 'machine' && /leg/i.test(ex.name || '');
    r3 = st.buildNextSeasonPlan(legPlan(), [], 'maintain', { records: [rec(1, gA, [bench()])], isBlocked: homeBlocks, homeGymName: '公司樓下' });
    const lp = r3.plan.weeks[0].days[0].exercises[0];
    const why = r3.personal.find((c) => c.name === '腿推');
    ok(lp.name !== '腿推' && !homeBlocks(lp) && why?.why === '公司樓下沒有這台', `主場沒有腿推機 → 換成「${lp.name}」，理由寫「${why?.why}」`);

    // ⑤ 之前照健身房換過的標記，換季換掉後作廢（不然到別間會被還原成上一季的舊動作）
    const adaptedPlan = legPlan();
    adaptedPlan.weeks.forEach((w) => { w.days[0].exercises[0] = { ...w.days[0].exercises[0], name: '腿推', gymOrig: { name: '哈克深蹲', nameEn: 'Hack Squat' }, gymSwappedFrom: '哈克深蹲' }; });
    r3 = st.buildNextSeasonPlan(adaptedPlan, [], 'maintain', { records: [rec(1, gA, [bench()])], isBlocked: homeBlocks, homeGymName: '公司樓下' });
    const ap = r3.plan.weeks[1].days[0].exercises[0];
    ok(ap.name !== '腿推' && !ap.gymOrig && !ap.gymSwappedFrom, '換季換掉的動作不再帶著上一間的健身房替換標記');
    const chosen = st.applySwapChoices(r3.plan, adaptedPlan, { '腿推': { name: 'Goblet Squat' } });
    ok(!chosen.weeks[0].days[0].exercises[0].gymOrig, '使用者在換季預告自己挑的也一樣');

    // ⑥ 照課表（排給 A 館、帶 gymOrig）在 A 館做 → 算表現；回到原課表版本（C 館有哈克深蹲機）→ 算替代
    const recsA = [1, 2].map((i) => rec(i, gA, [bench(), { name: '腿推', slot: '哈克深蹲', sets: [{ weight: 100, reps: 10, completed: true }] }]));
    const recsC = [3].map((i) => rec(i, gC, [bench(), { name: '哈克深蹲', sets: [{ weight: 80, reps: 10, completed: true }] }]));
    a = st.analyzeSeasonExercises(adaptedPlan, [...recsA, ...recsC], 0);
    ok(a['腿推'].done === 2 && a['腿推'].subbed === 1 && a['腿推'].skipped === 0, '課表本身是照健身房排的：在那間照做算表現、在別間做回原動作算替代');

    // ⑦ 下一季練哪裡：別間的替代動作也算進原本的部位
    const fRecs = [1, 2, 3, 4].map((i) => rec(i, gB, [{ name: '保加利亞分腿蹲', slot: '腿推', sets: Array.from({ length: 6 }, () => ({ weight: 12, reps: 10, completed: true })) }]));
    const sug = st.suggestNextFocus(legPlan(), fRecs, { sinceMs: 0 });
    ok(sug.perWeek.legs === 6, `下一季部位建議：在別間做的替代也算腿的組數（每週 ${sug.perWeek.legs} 組）`);
}

console.log(fail ? `\n${fail} 項失敗` : '\n全部通過');
process.exit(fail ? 1 : 0);
