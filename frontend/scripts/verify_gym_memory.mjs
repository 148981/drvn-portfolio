// verify_gym_memory.mjs — 健身房記憶的邏輯斷言
//   · 同一間的判定（150 m 內）、熟練度門檻、常用器材依部位
//   · 客製條件最多三間；滿了要指定換掉哪一間
//   · 做完組數的器材自動算「有」；「沒有」只能由使用者說
//   · 跳過的動作：只問器材還不知道的，同一台只問一次，徒手不問
//   · 依健身房換動作：沒有的器材一定被換掉、換上去的這間一定有、組數次數保留
import * as esbuild from 'esbuild';

const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
globalThis.window = { location: { hostname: 'x', pathname: '/' }, addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = o?.detail; } };

const r = await esbuild.build({
    stdin: { contents: "export * as gm from './src/utils/gymMemory.js'; export * as gs from './src/utils/gymStations.js'; export * as sub from './src/utils/exerciseSubstitution.js';", resolveDir: process.cwd(), loader: 'js' },
    bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'error',
    define: { 'import.meta.env': '{"DEV":true}' },
    plugins: [{ name: 'stub-api', setup(b) { b.onResolve({ filter: /api\/client$|cloudSync$/ }, () => ({ path: 'stub', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default { get: async () => ({}), post: async () => ({}) }; export const pushBlob = async () => true;', loader: 'js' })); } }],
});
const { gm, gs, sub } = await import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));

let fail = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };
const sets = (n, reps = 8) => Array.from({ length: n }, () => ({ weight: 50, reps, completed: true }));

// ── 器材台 ──
ok(gs.stationOf('Hack Squat')?.id === 'hack_squat' && gs.stationOf('哈克深蹲')?.id === 'hack_squat', '器材台：中英文動作名都認得（哈克深蹲 → 哈克深蹲機）');
ok(gs.stationOf('Pec Deck Fly')?.id === gs.stationOf('Reverse Pec Deck')?.id, '器材台：夾胸與反向飛鳥共用蝴蝶機');
ok(gs.stationOf('Push Ups') === null && gs.stationOf('自訂怪動作') === null, '器材台：徒手動作與查不到的動作不需要器材');
ok(gs.stationOf('Pull Ups')?.zh === '單槓', '器材台：引體向上要單槓');

// ── 同一間 ──
let mem = gm.loadGymMemory('u1');
const A = { lat: 25.0330, lng: 121.5654 };
let res = gm.createGym(mem, { poiName: 'World Gym 信義', area: '信義區 · 台北市', ...A });
mem = res.mem; const ga = res.gym;
ok(ga.name === 'World Gym 信義', '沒自己取名 → 用地圖上的店名');
ok(gm.findGymNear(mem, { lat: 25.0335, lng: 121.5656 })?.id === ga.id, '60 公尺內 → 同一間');
ok(gm.findGymNear(mem, { lat: 25.0400, lng: 121.5654 }) === null, '780 公尺外 → 不是這間');
mem = gm.renameGym(mem, ga.id, '  公司樓下  ');
ok(mem.gyms[ga.id].name === '公司樓下', '可以自己命名（去頭尾空白）');

// ── 熟練度 ──
ok(gm.proficiencyOf(mem.gyms[ga.id]) === null, '還沒練過 → 沒有熟練度（不給假等級）');
for (let i = 0; i < 5; i++) mem = gm.recordGymSession(mem, ga.id, [{ name: 'Leg Press', sets: sets(3) }, { name: 'Dumbbell Bench Press', sets: sets(4) }]);
const pf = gm.proficiencyOf(mem.gyms[ga.id]);
ok(pf.label === '常客' && pf.level === 3 && pf.toNext === 10 && pf.nextLabel === '主場', '練 5 次 → 常客，再 10 次到主場');

// ── 常用器材依部位 ──
const byM = gm.stationsByMacro(mem.gyms[ga.id]);
ok(byM.find((b) => b.macro === 'legs')?.stations[0]?.zh === '腿推機' && byM.find((b) => b.macro === 'legs').stations[0].sets === 15, '常用器材：腿 → 腿推機 15 組');
ok(byM.find((b) => b.macro === 'chest')?.stations[0]?.zh === '啞鈴', '常用器材：胸 → 啞鈴（同一個啞鈴算在它練的部位）');
ok(!byM.some((b) => b.macro === 'back'), '沒練過的部位不列');

// ── 跳過的動作 ──
const planned = ['Leg Press', 'Hack Squat', 'Smith Machine Squat', 'Push Ups', 'Pec Deck Fly', 'Reverse Pec Deck'];
const done = [{ name: 'Leg Press', sets: sets(3) }, { name: 'Hack Squat', sets: [] }];
const ask = gm.skippedToAsk(mem.gyms[ga.id], planned, done);
ok(ask.map((a) => a.station.id).join(',') === 'hack_squat,smith,pec_deck', '跳過的動作：徒手不問、做過的不問、同一台（蝴蝶機）只問一次');
ok(gm.skippedToAsk(mem.gyms[ga.id], ['Leg Press'], []).length === 0, '在這間用過的器材（腿推機）跳過了也不問');

// ── 客製名額 ──
const coords = [{ lat: 24.1, lng: 120.6 }, { lat: 24.2, lng: 120.7 }, { lat: 24.3, lng: 120.8 }];
const extra = coords.map((c, i) => { const x = gm.createGym(mem, { name: `館${i}`, ...c }); mem = x.mem; return x.gym; });
let m1 = gm.markMissing(mem, ga.id, 'hack_squat');
ok(m1.ok && gm.isCustomGym(m1.mem, ga.id) && m1.mem.gyms[ga.id].missing.hack_squat, '說「沒有」→ 這間自動變客製並記下');
mem = m1.mem;
mem = gm.markMissing(mem, extra[0].id, 'smith').mem;
mem = gm.markMissing(mem, extra[1].id, 'smith').mem;
const full = gm.markMissing(mem, extra[2].id, 'smith');
ok(!full.ok && full.needsSlot && mem.custom.length === 3, '第四間：名額滿（3 間）→ 要先選換掉哪一間');
const rep = gm.makeCustomGym(mem, extra[2].id, extra[0].id);
ok(rep.ok && rep.mem.custom.includes(extra[2].id) && !rep.mem.custom.includes(extra[0].id)
    && Object.keys(rep.mem.gyms[extra[0].id].missing).length === 0 && rep.mem.gyms[extra[0].id], '換掉一間：它的紀錄還在，只清掉客製條件');
ok(gm.skippedToAsk(mem.gyms[ga.id], ['Hack Squat'], []).length === 0, '已經說過沒有的器材不再問');
const mh = gm.markAvailable(mem, ga.id, 'smith');
ok(gm.skippedToAsk(mh.gyms[ga.id], ['Smith Machine Squat'], []).length === 0 && gm.stationStatus(mh.gyms[ga.id], 'smith') === 'available', '說「有，只是沒練」→ 下次不再問');

// ── 做過就是有 ──
let m2 = gm.recordGymSession(mem, ga.id, [{ name: 'Hack Squat', sets: sets(2) }]);
ok(!m2.gyms[ga.id].missing.hack_squat && gm.stationStatus(m2.gyms[ga.id], 'hack_squat') === 'available', '標成沒有、後來在這裡做完了 → 自動改回有');

// ── 依健身房換動作 ──
const day = [
    { name: 'Hack Squat', sets: 4, reps: '8-10', rest: '120s' },
    { name: 'Leg Extensions', sets: 3, reps: '12-15', rest: '60s' },
    { name: 'Push Ups', sets: 3, reps: '12', rest: '60s' },
];
const ad = gm.adaptExercisesForGym(day, mem.gyms[ga.id], 'u1');
const swapped = ad.exercises[0];
ok(ad.changes.length === 1 && ad.changes[0].from === 'Hack Squat', '沒有的器材一定被換掉，其他不動');
ok(gs.stationOf(swapped.name)?.id !== 'hack_squat' && swapped.sets === 4 && swapped.reps === '8-10' && swapped.rest === '120s', '換上去的不是同一台，組數／次數／休息保留');
ok(swapped.name === 'Leg Press', `優先換成這間常用的器材（${swapped.name}）`);
mem = gm.setGymSwap(mem, ga.id, 'Hack Squat', 'Goblet Squat');
ok(gm.adaptExercisesForGym(day, mem.gyms[ga.id], 'u1').exercises[0].name === 'Goblet Squat', '使用者指定的替代優先');
const noCustom = gm.adaptExercisesForGym(day, mem.gyms[extra[0].id] ? { ...mem.gyms[extra[0].id], missing: {} } : null, 'u1');
ok(noCustom.changes.length === 0, '沒有記「沒有」的健身房 → 課表不動');
const plan = { weeks: [{ days: [{ exercises: day }, { exercises: day }] }] };
const ap = gm.adaptPlanForGym(plan, mem.gyms[ga.id], 'u1');
ok(ap.plan.weeks[0].days.every((d) => d.exercises[0].name === 'Goblet Squat') && ap.changes.length === 1 && plan.weeks[0].days[0].exercises[0].name === 'Hack Squat',
    '整份計劃都換、變更只列一次、原計劃不被改到');

// ── 替代清單排除這間沒有的 ──
const subs = sub.getSubstitutes('Leg Press', { userId: 'u1', limit: 10, gym: gm.gymProfile({ missing: { hack_squat: 1, smith: 1 }, stations: {} }) });
ok(subs.length > 0 && !subs.some((s) => ['Hack Squat', 'Smith Machine Squat'].includes(s.name)), '替代清單不列這間沒有的器材');

// ── 開始前換健身房：預覽面板的菜單 ──
{
    const zhDay = [
        { name: '哈克深蹲', nameEn: 'Hack Squat', eq: 'machine', sets: 4, reps: '8-10', rest: '120s' },
        { name: '腿推機', nameEn: 'Leg Press', eq: 'machine', sets: 3, reps: '10-12', rest: '90s' },
        { name: '伏地挺身', nameEn: 'Push Ups', sets: 3, reps: '12', rest: '60s' },
    ];
    const gA = { ...mem.gyms[ga.id], swaps: {} };                // 沒有哈克深蹲機
    const a1 = gm.adaptDayForGym(zhDay, gA, 'u1');
    const sw = a1.exercises[0];
    ok(a1.swaps.length === 1 && /[㐀-鿿]/.test(sw.name) && sw.nameEn && sw.nameEn !== 'Hack Squat'
        && gs.stationOf(sw.name)?.id !== 'hack_squat', `中文課表換上中文名、英文名跟著新動作（${sw.name} / ${sw.nameEn}）`);
    ok(sw.name !== '腿推機' && sw.nameEn !== 'Leg Press', '不換成菜單上已經有的動作（腿推機已在菜單上，不會做兩次）');
    ok(sw.sets === 4 && sw.reps === '8-10' && sw.gymOrig?.name === '哈克深蹲', '組數保留、記得原本是哪個動作');
    // 切到另一間（什麼都有）→ 完整換回原課表
    const back = gm.adaptDayForGym(a1.exercises, { ...mem.gyms[extra[1].id], missing: {} }, 'u1');
    ok(back.swaps.length === 0 && back.exercises[0].name === '哈克深蹲' && back.exercises[0].nameEn === 'Hack Squat'
        && back.exercises[0].eq === 'machine' && !('gymOrig' in back.exercises[0]), '換到器材齊全的那間 → 菜單完整換回原課表（名稱、英文名、器材）');
    // A → B → A：不會越換越歪
    const gB = { ...mem.gyms[extra[1].id], missing: { leg_press: 1 }, swaps: {} };
    const toB = gm.adaptDayForGym(a1.exercises, gB, 'u1');
    ok(toB.exercises[0].name === '哈克深蹲' && toB.swaps.length === 1 && toB.swaps[0].from === '腿推機', 'A 換到 B：從原課表重套（B 有哈克深蹲機 → 換回來；B 沒腿推機 → 換掉）');
    const backA = gm.adaptDayForGym(toB.exercises, gA, 'u1');
    ok(backA.exercises.map((e) => e.name).join() === a1.exercises.map((e) => e.name).join(), 'B 再換回 A：和第一次選 A 的菜單一模一樣');
    ok(gm.adaptDayForGym(a1.exercises, null, 'u1').exercises[0].name === '哈克深蹲', '不指定健身房 → 只還原');
    ok(gm.swappedInMenu(a1.exercises).length === 1 && gm.swappedInMenu(zhDay).length === 0, '列得出菜單裡哪些動作照健身房換過');
    // 指定的替代用中文記、課表用英文 → 一樣認得
    const gSwap = { ...gA, swaps: { 哈克深蹲: 'Goblet Squat' } };
    ok(gm.adaptExercisesForGym([{ name: 'Hack Squat', sets: 3, reps: '10' }], gSwap, 'u1').exercises[0].name === 'Goblet Squat', '指定的替代：中英文名都對得上');
    // 暖身不換
    ok(gm.adaptExercisesForGym([{ name: 'Hack Squat', isWarmup: true }], gA, 'u1').changes.length === 0, '暖身動作不換');
}

// ── 選單：客製（最多三間）在前 ──
{
    const list = gm.gymChoiceList(mem, 8);
    ok(list.slice(0, 3).every((x) => x.custom) && list.filter((x) => x.custom).length === 3 && list.length <= 8, '開始前的健身房清單：客製三間排前面，其餘依最近去的');
    ok(list.find((x) => x.gym.id === ga.id)?.missingCount === Object.keys(mem.gyms[ga.id].missing).length, '客製的那間列出記了幾台沒有');
}

// ── 每間的訓練紀錄 ──
{
    let m3 = gm.recordGymSession(mem, ga.id, [{ name: 'Leg Press', sets: sets(3, 10) }, { name: 'Push Ups', sets: [{ reps: 12, weight: 0, completed: true }] }], 1000, { recordId: 'local_1', focus: 'legs', swapped: 1 });
    const before = m3.gyms[ga.id].sessions;
    const lg = gm.gymLog(m3.gyms[ga.id]).find((l) => l.id === 'local_1');
    ok(lg.id === 'local_1' && lg.exercises === 2 && lg.sets === 4 && lg.volume === 1500 && lg.swapped === 1 && lg.focus === 'legs', '每場記進這間：動作數、組數、總量、換了幾個');
    m3 = gm.recordGymSession(m3, ga.id, [{ name: 'Leg Press', sets: sets(3) }], 2000, { recordId: 'local_1' });
    ok(m3.gyms[ga.id].sessions === before, '同一場不會記兩次（結束直接記、問完再記不會重複）');
    for (let i = 0; i < 25; i++) m3 = gm.recordGymSession(m3, ga.id, [{ name: 'Leg Press', sets: sets(1) }], 3000 + i, { recordId: `r${i}` });
    ok(m3.gyms[ga.id].log.length === gm.GYM_LOG_KEEP && gm.gymLog(m3.gyms[ga.id])[0].id === 'r24', `只留最近 ${gm.GYM_LOG_KEEP} 場、新的在前`);
    ok(m3.lastGymId === ga.id, '記住上次在哪間練');
}

// ── 名額：第四間要換掉一間 ──
{
    const r4 = gm.makeCustomGym(mem, extra[2].id);
    ok(!r4.ok && r4.needsReplace && r4.mem.custom.length === 3, '已記三間時把第四間設成客製 → 要先選換掉哪一間（不會偷偷超過三間）');
    const loaded = gm.loadGymMemory('u_over');
    ok(loaded.custom.length === 0, '空記憶');
}

// ── 換季的主場 ──
{
    let m4 = gm.loadGymMemory('u_season');
    const g1 = gm.createGym(m4, { name: '公司', lat: 25, lng: 121 }); m4 = g1.mem;
    const g2 = gm.createGym(m4, { name: '學校', lat: 24, lng: 120 }); m4 = g2.mem;
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) m4 = gm.recordGymSession(m4, g2.gym.id, [{ name: 'Leg Press', sets: sets(1) }], t0 + i, { recordId: `s${i}` });
    m4 = gm.recordGymSession(m4, g1.gym.id, [{ name: 'Leg Press', sets: sets(1) }], t0 + 100, { recordId: 'c1' });
    ok(gm.primaryGymFor(m4, { sinceMs: t0 })?.id === g2.gym.id, '主場：這季練最多次的那間（不是上次去的那間）');
    ok(gm.primaryGymFor(m4, { planGymId: g1.gym.id, sinceMs: t0 })?.id === g1.gym.id, '主場：排課時指定的那間優先');
    ok(gm.primaryGymFor(m4, { sinceMs: t0 + 1000 })?.id === g1.gym.id, '這季還沒在任何一間練過 → 上次去的那間');
    m4 = gm.markMissing(m4, g2.gym.id, 'leg_press').mem;
    const blk = gm.gymBlocker(m4.gyms[g2.gym.id]);
    ok(blk({ name: '腿推' }) && blk({ name: 'Leg Press' }) && !blk({ name: 'Barbell Back Squat' }), '主場沒有的器材：中英文動作名都擋得到，其他不擋');
    ok(gm.gymBlocker(m4.gyms[g1.gym.id]) === null, '沒記缺什麼的健身房 → 不擋');
    const gmiss = gm.gymMissingFn(m4);
    ok(gmiss(g2.gym.id, { name: '腿推', nameEn: 'Leg Press' }) && !gmiss(g1.gym.id, { name: '腿推' }), '某一場所在的那間有沒有這台，查得到');
}

// ── 存讀 ──
gm.saveGymMemory('u1', mem);
ok(gm.loadGymMemory('u1').gyms[ga.id].name === '公司樓下', '存了讀得回來');
ok(gm.loadGymMemory('nobody').custom.length === 0, '沒資料 → 空的記憶（不編健身房）');

console.log(fail ? `\n${fail} 項失敗` : '\n全部通過');
process.exit(fail ? 1 : 0);
