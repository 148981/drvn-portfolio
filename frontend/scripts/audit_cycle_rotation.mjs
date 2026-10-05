// 🔁 週期輪換稽核：模擬一大群使用者連續練 ≥4 個週期（重訓＋跑步），每一次換期都用
//    scripts/CYCLE_ROTATION_STANDARD.md 的教練標準檢查「下一期接得對不對」。
//   用法（在 frontend/ 底下）：
//     node scripts/audit_cycle_rotation.mjs              # 標準：重訓 12 種課表 × 135 種人；跑步 30 種課表 × 45 種人；各 5 個週期（4 次換期），約 75 秒
//     node scripts/audit_cycle_rotation.mjs --quick      # 只跑一半的課表（開發時快速回歸）
//     node scripts/audit_cycle_rotation.mjs --show=8     # 每個問題代碼多印幾筆範例
//     node scripts/audit_cycle_rotation.mjs --src=/abs/path/frontend   # 對另一份程式碼跑（前後對照用）
//   回傳碼：有任何 ❌ 硬傷 → 1；只有 ⚠️ 警告 → 0。
//
// 走的是真的程式碼（esbuild 打包 src/utils/*）：
//   重訓：UnifiedTrainingEngine 產第一份 → seasonTransition（measureSeason／decideSeason／rotateStrengthSeason）換季，
//         平台期 e1rmAdvisor.detectPlateauFromRecords；舊版程式碼沒有這些入口時，照舊版收官頁的寫法重現（legacy）。
//   跑步：cardioPlanFusionEngine 產第一份 → 每週 autoAdjustPlan → diagnosePlan／recommendNextPlan → generateNextCyclePlan。
// 模擬的人：完成率 100／75／50／0%／跳過第 3 期、RPE 偏低／剛好／偏高、表現進步／卡住／退步、兩期之間停 0／2／8 週。
// 除錯：--only="名字片段" 只跑那些人；--debug 印每次換季的決策與改動；--debug --ex=動作名 再印那個動作的分析。
import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=').slice(1).join('=') : d; };
const QUICK = process.argv.includes('--quick');
const SHOW = +arg('show', 3);
const SRC = path.resolve(arg('src', process.cwd()));
const CYCLES = 5;
const ONLY = arg('only', '');   // 只跑名字含這段字的人（除錯用），例：--only="beginner/4天/mixed 完成100% RPEok progress"
const DEBUG = process.argv.includes('--debug');
const DAY = 86400000;

// ── 環境：localStorage／window／可控時間 ─────────────────────────────
const store = {};
globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }, key: (i) => Object.keys(store)[i], get length() { return Object.keys(store).length; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};
globalThis.window = { location: { hostname: 'x', pathname: '/' }, addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
const realNow = Date.now.bind(Date);
let simNow = null;
Date.now = () => (simNow ?? realNow());

const r = await esbuild.build({
    stdin: {
        contents: [
            "export * as st from './src/utils/seasonTransition.js';",
            "export * as E from './src/utils/UnifiedTrainingEngine.js';",
            "export * as e1 from './src/utils/e1rmAdvisor.js';",
            "export * as cp from './src/utils/cardioPlanProgress.js';",
            "export * as fe from './src/utils/cardioPlanFusionEngine.js';",
            "export * as path_ from './src/utils/cardioPlanPath.js';",
            "export * as ac from './src/utils/cardioPlanActuals.js';",
        ].join('\n'),
        resolveDir: SRC, loader: 'js',
    },
    bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'error',
    define: { 'import.meta.env': '{"DEV":false}' },
    plugins: [{ name: 'stub-api', setup(b) {
        b.onResolve({ filter: /api\/client$|cloudSync$/ }, () => ({ path: 'stub', namespace: 'stub' }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default { get: async () => ({}), post: async () => ({}) }; export const pushBlob = async () => true;', loader: 'js' }));
    } }],
});
const { st, E, e1, cp, fe, path_ } = await import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));
const LEGACY_STRENGTH = typeof st.rotateStrengthSeason !== 'function';
const LEGACY_RUN = typeof cp.generateNextCyclePlan !== 'function';
const read = (p) => { try { return fs.readFileSync(path.join(SRC, p), 'utf8'); } catch { return ''; } };

// ── 規則參數（跟 CYCLE_ROTATION_STANDARD.md 同一組數字；稽核端自己寫一份，不讀被稽核的程式）──
const STD = {
    LOW_ADH: 50, GOOD_ADH: 75, MAX_LOAD_PCT: 10, MAX_SET_STEP: 1, MAX_REP_STEP: 2, MIN_RETAIN: 0.7,
    WEEKLY_SETS_CAP: 20, LEVEL_MIN: -2, LEVEL_MAX: 3, MAX_DELOAD_GAP: 6,
    DETRAIN: [[56, 0.8, true], [28, 0.9, true], [14, 0.95, false]],
    RUN_START_OF_PEAK: { race_full: 0.7, race_half: 0.8, race_5k_10k: 0.85, default: 0.9 },
    ACWR_MAX: 1.3, ACWR_MIN: 0.8,
    RUN_DETRAIN: [[56, 0.5, 0.07], [28, 0.7, 0.04], [14, 0.85, 0.02]],
    PROMOTE_RATIO: 0.8, PROMOTE_5K_KM: 12,
};
const detOf = (days) => STD.DETRAIN.find(([m]) => days >= m) || [0, 1, false];
const runDetOf = (days) => STD.RUN_DETRAIN.find(([m]) => days >= m) || [0, 1, 0];

// ── 問題收集 ─────────────────────────────────────────
const counts = {}, ex = {}, sev = {}, users = {};
const flag = (sport, level, code, who, msg) => {
    const k = `${sport}:${code}`;
    sev[k] = level; counts[k] = (counts[k] || 0) + 1;
    (users[k] ||= new Set()).add(String(who).split(' 第')[0]);
    (ex[k] ||= []).length < SHOW && ex[k].push(`${who}  ${msg}`);
};
const H = (sport, code, who, msg) => flag(sport, 'H', code, who, msg);
const dist = {};   // 決策分佈（給人看「這群人被建議了什麼」）
const tally = (row, col) => { const r = (dist[row] ||= {}); r[col] = (r[col] || 0) + 1; };
const W = (sport, code, who, msg) => flag(sport, 'W', code, who, msg);

const clone = (o) => JSON.parse(JSON.stringify(o));
const isDeload = (w) => /deload|taper|減量/i.test(String(w?.phase || ''));
const range = (reps) => { const m = String(reps ?? '').match(/(\d+)\s*[-–]\s*(\d+)/); if (m) return [+m[1], +m[2]]; const n = parseInt(reps, 10); return Number.isFinite(n) && n > 0 ? [n, n] : null; };
const mainEx = (d) => (d?.exercises || []).filter((e) => !e.isWarmup && e.tier !== 4);
const epley = (w, r) => (w > 0 && r >= 1 && r <= 12 ? (r === 1 ? w : w * (1 + r / 30)) : 0);
const pattern = (k, adh) => Math.floor((k + 1) * adh + 1e-9) > Math.floor(k * adh + 1e-9);   // 均勻分散的出席
const dayKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const midnight = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

/* ══════════════════════════════════════════════════════════════════
 * 重訓
 * ══════════════════════════════════════════════════════════════════ */
const S_PROFILES = [];
for (const level of ['beginner', 'intermediate', 'advanced'])
    for (const daysPerWeek of QUICK ? [4] : [3, 5])
        for (const equipment of ['mixed', 'bodyweight'])
            S_PROFILES.push({ level, daysPerWeek, equipment, trainingStyle: 'bodybuilding', selectedHashtags: level === 'beginner' ? ['legs'] : ['chest', 'back'], injuries: [] });
const ADH = [1, 0.75, 0.5, 0, 'skip'];   // skip：前兩期照練、第三期整期沒練、之後回來
const adhAt = (a, c) => (a === 'skip' ? (c === 3 ? 0 : 1) : a);
const adhName = (a) => (a === 'skip' ? '跳過第3期' : `完成${a * 100}%`);
const RPE = { under: 6, ok: 8, over: 9.5 };
const OUTCOMES = ['progress', 'plateau', 'regress'];
const BREAKS = [0, 14, 56];
const UID = 'sim';
const recKey = `u_${UID}_trainingRecords`;

const startWeight = (e) => {
    const eq = String(e.eq || '');
    if (eq === 'bodyweight' || eq === 'none' || eq === 'band' || !eq) return 0;
    if (eq === 'dumbbell' || eq === 'kettlebell') return e.cat === 'compound' ? 14 : 8;
    if (e.cat !== 'compound') return eq === 'cable' || eq === 'machine' ? 20 : 10;
    return /quads|hamstrings|glutes/.test(e.muscle || '') ? 60 : 40;
};

/** 依這個人的設定，把一整季的訓練紀錄「練出來」 */
function simulateStrengthSeason(plan, persona, startMs, working) {
    const recs = [];
    let k = 0, planned = 0, done = 0;
    const weekly = [];
    plan.weeks.forEach((w, wi) => {
        let any = false;
        (w.days || []).forEach((d, di) => {
            const list = mainEx(d);
            if (!list.length) return;
            planned += 1;
            const go = pattern(k++, persona.adh);
            if (!go) return;
            done += 1; any = true;
            const nDays = (w.days || []).length || 1;
            const t = startMs + (wi * 7 + Math.floor((di * 7) / Math.max(nDays, 1))) * DAY + 18 * 3600000;
            const exs = list.map((e) => {
                const rg = range(e.reps) || [8, 12];
                const rg0 = range(plan.weeks[0].days.flatMap((q) => q.exercises).find((q) => q.name === e.name)?.reps) || rg;
                const carried = working[e.name];
                const baseW = parseFloat(e.suggestedWeight) > 0 ? parseFloat(e.suggestedWeight) : (carried ?? startWeight(e));
                // 真實的人：Peak 週次數區間變低就用比較重的重量（強度一樣）；進步的人每週再多一點
                const inc = e.eq === 'dumbbell' || e.eq === 'kettlebell' ? 1 : 2.5;
                const growth = persona.outcome === 'progress' ? 1 + 0.01 * wi : persona.outcome === 'regress' && wi >= 2 ? 0.95 : 1;
                const scaled = baseW > 0 && !isDeload(w) ? baseW * ((1 + rg0[1] / 30) / (1 + rg[1] / 30)) * growth : baseW;
                // 進步的人往上取整、卡住／退步的人往下取整（不讓槓片進位憑空造出進步）
                const rnd = persona.outcome === 'progress' ? Math.round : Math.floor;
                let wt = baseW > 0 ? Math.max(inc, rnd(scaled / inc + 1e-9) * inc) : 0;
                if (persona.outcome === 'regress' && wi >= 2 && wt > 0 && wt >= baseW) wt = Math.max(inc, wt - inc);
                let reps;
                if (persona.outcome === 'progress') reps = Math.min(rg[1], rg[0] + Math.round(((rg[1] - rg[0]) * (wi + 1)) / 2));
                else if (persona.outcome === 'plateau') reps = Math.min(rg[1], rg[0] + 1);
                else reps = Math.max(1, rg[0] - (wi >= 2 ? 1 : 0));
                const n = Math.max(1, parseInt(e.sets, 10) || 3);
                const sets = Array.from({ length: n }, () => ({ weight: wt, reps, rpe: RPE[persona.rpe], completed: true }));
                return { name: e.name, nameEn: e.nameEn, eq: e.eq, sets };
            });
            const volume = exs.reduce((s, x) => s + x.sets.reduce((a, y) => a + y.weight * y.reps, 0), 0);
            recs.push({ id: `r${t}`, timestamp: new Date(t).toISOString(), exercises: exs, volume });
        });
        const band = { min: 7, max: 8.5 };
        const v = RPE[persona.rpe];
        weekly.push({ week: wi + 1, avgRPE: any ? v : null, status: !any ? 'no_data' : v < band.min - 0.5 ? 'under' : v > band.max + 0.5 ? 'over' : 'on_target' });
    });
    return { recs, planned, done, weekly };
}

/** 舊版收官頁（LuxuryPlanViewMobile 換季段）的決策與套用，照原樣重現 —— 只在被稽核的程式碼沒有新入口時用 */
function legacyStrength(plan, ctx) {
    const rate = ctx.planned > 0 ? Math.min(100, Math.round(((ctx.done || ctx.planned) / ctx.planned) * 100)) : 100;   // 舊版：0 堂 → 當全做完
    const shownVolumeGrowth = rate >= 80 ? +(4.5 * rate / 100).toFixed(1) : 0;                                    // 舊版：拿完成率乘出來
    const muscleGain = +(0.6 * Math.min(1, rate / 100)).toFixed(1);                                                // 舊版：沒量 InBody 就模擬一筆
    const progressed = muscleGain >= 0.3 && rate >= 75;
    const over = ctx.weekly.filter((w) => w.status === 'over').length, under = ctx.weekly.filter((w) => w.status === 'under').length;
    const dir = under > over && under >= 2 ? 'up' : over > under && over >= 2 ? 'down' : 'maintain';
    const pl = e1.detectPlateau(UID);
    const plateau = !!pl?.plateau && !progressed;
    const recommend = progressed ? 'progress' : plateau ? 'redesign' : 'intensity';
    const progressOk = st.canAddCompoundSet(plan);
    const rec0 = recommend === 'intensity' && dir === 'maintain' ? 'keep' : recommend;
    const intensityOk = dir !== 'maintain' && st.canShiftIntensity(plan, dir);
    const rec = (rec0 === 'progress' && !progressOk) || (rec0 === 'intensity' && !intensityOk) ? 'redesign' : rec0;
    const picks = [...(rec === 'intensity' && intensityOk ? ['intensity'] : []), ...(rec === 'progress' && progressOk ? ['progress'] : [])];
    return { rec, dir, picks, shown: { adherencePct: rate, volumeDeltaPct: shownVolumeGrowth, bodyClaim: progressed ? `肌肉量 +${muscleGain} kg` : null } };
}
function legacyRotate(plan, { picks, dir, records, sinceMs, nowMs, currentSeason }) {
    const pv = st.buildNextSeasonPlan(plan, picks, dir, { records, sinceMs });
    const previewRows = st.diffSeasonPlans(plan, pv.plan, pv.personal);
    const applied = clone(pv.plan);
    e1.applyLoadPrescriptions(applied, UID);   // 舊版：預告畫完之後才套負重處方
    applied.season = currentSeason + 1;
    applied.startDate = dayKey(nowMs);
    const rows = st.diffSeasonPlans(plan, applied, pv.personal);
    applied._seasonApplied = { season: applied.season, rows };
    return { plan: applied, rows, previewRows, personal: pv.personal, season: applied.season };
}

function auditStrength() {
    let rotations = 0, usersN = 0;
    const t0 = realNow();
    for (const prof of S_PROFILES) {
        const base = E.generateUnifiedPlan(prof);
        for (const adh of ADH) for (const rpe of Object.keys(RPE)) for (const outcome of OUTCOMES) for (const brk of BREAKS) {
            usersN += 1;
            const who = `${prof.level}/${prof.daysPerWeek}天/${prof.equipment} ${adhName(adh)} RPE${rpe} ${outcome} 停${brk / 7}週`;
            if (ONLY && !who.includes(ONLY)) continue;
            for (const k of Object.keys(store)) delete store[k];
            let plan = clone(base);
            let startMs = new Date('2026-01-05T00:00:00').getTime();
            plan.startDate = dayKey(startMs);
            plan.season = 1;
            let currentSeason = 1;
            const allRecs = {};
            const working = {};
            let plateauRun = 0;
            let prevTon = null, prevTonNext = null;
            for (let c = 1; c < CYCLES; c++) {
                const tag = `${who} 第${c}→${c + 1}季`;
                const persona = { adh: adhAt(adh, c), rpe, outcome, brk };
                const sim = simulateStrengthSeason(plan, persona, startMs, working);
                sim.recs.forEach((x) => { allRecs[x.id] = x; });
                // 這一季每個動作實際最重做到幾公斤、力量趨勢
                const lastTop = {}, firstE = {}, lastE = {};
                sim.recs.forEach((x) => x.exercises.forEach((e) => {
                    const top = Math.max(...e.sets.map((s) => s.weight));
                    const wi = Math.floor((new Date(x.timestamp).getTime() - startMs) / (7 * DAY));
                    const r0 = plan.weeks[0].days.flatMap((q) => q.exercises).find((q) => q.name === e.name)?.reps;
                    const rw = plan.weeks[wi]?.days.flatMap((q) => q.exercises).find((q) => q.name === e.name)?.reps;
                    if (!isDeload(plan.weeks[wi]) && String(r0) === String(rw)) lastTop[e.name] = top;
                    else if (lastTop[e.name] == null) lastTop[e.name] = top;
                    const est = Math.max(...e.sets.map((s) => epley(s.weight, s.reps)));
                    if (!isDeload(plan.weeks[wi])) {   // 減量週故意輕，不拿來判斷退步
                        if (firstE[e.name] == null) firstE[e.name] = est;
                        lastE[e.name] = est;
                    }
                    working[e.name] = lastTop[e.name];
                }));
                const nowMs = startMs + 28 * DAY + brk * DAY;
                simNow = nowMs;
                localStorage.setItem(recKey, JSON.stringify(allRecs));
                const records = Object.values(allRecs);
                const sinceMs = startMs;
                const daysOff = sim.recs.length || records.length
                    ? (nowMs - Math.max(...records.map((x) => new Date(x.timestamp).getTime()))) / DAY : null;
                const trueAdh = sim.planned ? Math.round((sim.done / sim.planned) * 100) : 0;
                const p0 = clone(plan);

                // ── 決策 ──
                let decision, shown, picks, dir, out;
                try {
                    if (LEGACY_STRENGTH) {
                        const L = legacyStrength(plan, { planned: sim.planned, done: sim.done, weekly: sim.weekly });
                        decision = { recommend: L.rec, intensityDir: L.dir }; shown = L.shown; picks = [...L.picks, 'personal']; dir = L.dir;
                    } else {
                        const m = st.measureSeason(plan, records, { sinceMs, untilMs: nowMs, completedSessions: sim.done, plannedSessions: sim.planned, prevTonnage: st.prevSeasonTonnage(plan) });
                        const plateau = st.seasonPlateau(plan._seasonHistory, m) || !!e1.detectPlateauFromRecords(records, nowMs)?.plateau;
                        decision = st.decideSeason({ ...m, rpeWeekly: sim.weekly, plateau, body: null, daysOff: daysOff ?? 0,
                            canProgress: st.canAddCompoundSet(plan), canShiftUp: st.canShiftIntensity(plan, 'up'), canShiftDown: st.canShiftIntensity(plan, 'down') });
                        dir = decision.intensityDir;
                        picks = [...(decision.recommend === 'intensity' && dir !== 'maintain' && st.canShiftIntensity(plan, dir) ? ['intensity'] : []),
                            ...(decision.recommend === 'progress' && st.canAddCompoundSet(plan) ? ['progress'] : []), 'personal'];
                        shown = { adherencePct: m.adherencePct, volumeDeltaPct: m.volumeDeltaPct, bodyClaim: null, measured: m };
                    }
                } catch (e) { H('重訓', 'S11 換季決策丟錯', tag, e.message); break; }

                // S9 收官畫面的數字要跟真實一致
                if (shown.adherencePct !== trueAdh) H('重訓', 'S9 完成率不是真的', tag, `實際 ${trueAdh}%，畫面 ${shown.adherencePct}%`);
                {
                    // 訓練量成長的真值：這一季每堂（不含減量週）總量 vs 上一季；第一季或任一季沒資料 → 沒有這個數字
                    const ton = sim.recs.filter((x) => !isDeload(plan.weeks[Math.floor((new Date(x.timestamp).getTime() - startMs) / (7 * DAY))]))
                        .map((x) => x.exercises.reduce((a, q) => a + q.sets.reduce((b, y) => b + y.weight * y.reps, 0), 0)).filter((v) => v > 0);
                    const cur = ton.length ? Math.round(ton.reduce((a, b) => a + b, 0) / ton.length) : null;
                    const truth = cur && prevTon ? Math.round(((cur - prevTon) / prevTon) * 1000) / 10 : null;
                    const sv = shown.volumeDeltaPct;
                    if (truth == null ? (sv != null && sv !== 0) : (sv == null || Math.abs(sv - truth) > 0.5))
                        H('重訓', 'S9 訓練量成長不是量出來的', tag, `實測 ${truth}%，畫面 ${sv}%`);
                    prevTonNext = cur;
                }
                if (shown.bodyClaim) H('重訓', 'S9 拿模擬的 InBody 下結論', tag, `沒量過 InBody 卻顯示「${shown.bodyClaim}」並據此建議加量`);

                tally(`${adhName(persona.adh)}·RPE${rpe}·${outcome}${brk ? `·停${brk / 7}週` : ''}`, decision.recommend);
                // ── 換季（redesign 走產生器重排）──
                if (decision.recommend === 'redesign') {
                    let focus = prof.selectedHashtags;
                    try { focus = st.suggestNextFocus(plan, records, { sinceMs })?.focus || focus; } catch { /* */ }
                    // 跟產生器頁一樣：換部位重排時把上一季的動作名稱傳進去（rotateFrom）
                    const np = E.generateUnifiedPlan({ ...prof, selectedHashtags: focus, rotateFrom: [...new Set(plan.weeks.flatMap((w) => w.days.flatMap(mainEx)).map((e) => e.name))] });
                    const oldN = new Set(plan.weeks.flatMap((w) => w.days.flatMap(mainEx)).map((e) => e.name));
                    const newN = [...new Set(np.weeks.flatMap((w) => w.days.flatMap(mainEx)).map((e) => e.name))];
                    if (newN.filter((n) => !oldN.has(n)).length / Math.max(1, newN.length) < 0.3) W('重訓', 'S3 換一份卻幾乎一樣', tag, `新課表 ${newN.length} 個動作只有 ${newN.filter((n) => !oldN.has(n)).length} 個是新的`);
                    np.season = Math.max(plan.season || 1, currentSeason) + 1; np.startDate = dayKey(nowMs);
                    // 換部位重排：收官頁把換季歷史存進快照、產生器寫進新課表（seasonTransition.redesignSeasonHistory）
                    np._seasonHistory = st.redesignSeasonHistory ? st.redesignSeasonHistory(plan, shown.measured, np.season - 1) : plan._seasonHistory;
                    plan = np; currentSeason = np.season; plateauRun = 0; prevTon = prevTonNext;
                    startMs = midnight(nowMs);
                    rotations += 1;
                    continue;
                }
                const run = () => (LEGACY_STRENGTH
                    ? legacyRotate(plan, { picks: picks.filter((x) => x !== 'personal'), dir, records: picks.includes('personal') ? records : null, sinceMs, nowMs, currentSeason })
                    : st.rotateStrengthSeason(plan, { picks, dir, records, sinceMs, nowMs, todayKey: dayKey(nowMs), withPersonal: true,
                        loadTable: e1.buildE1RMTable(UID), currentSeason, measured: shown.measured, hold: !!decision.hold, label: 'sim' }));
                let res;
                try { res = run(); } catch (e) { H('重訓', 'S11 換季丟錯（卡住）', tag, e.message); break; }
                rotations += 1;
                const p1 = res.plan;
                if (DEBUG && arg('ex', '')) { const nm = arg('ex', ''); console.log('DBG', nm, 'auditLastTop', lastTop[nm], 'analyze', JSON.stringify(st.analyzeSeasonExercises(p0, records, sinceMs)[nm]), sim.recs.map((x) => { const q = x.exercises.find((y) => y.name === nm); return q ? `${Math.floor((new Date(x.timestamp).getTime() - startMs) / (7 * DAY))}:${q.sets[0].weight}x${q.sets[0].reps}` : null; }).filter(Boolean).join(' ')); }
                if (DEBUG && arg('ex', '')) console.log('DBG2', p1.weeks.map((w, wi) => w.days.map((d) => d.exercises.filter((q) => q.name === arg('ex', '')).map((q) => `w${wi}:${q.sets}x${q.reps}@${q.suggestedWeight}`).join(',')).filter(Boolean).join(' ')).join(' | '));
                if (DEBUG) console.log(tag, JSON.stringify({ decision, adh: trueAdh, shown: { ...shown, measured: undefined }, rows: (res.rows || []).map((x) => st.diffRowText(x)), personal: (res.personal || []).map((x) => `${x.kind}:${x.text}:${x.why}`) }));

                // S10 同一份課表再算一次 → 一模一樣（重整／連點不會跳兩季）
                try {
                    const again = run();
                    const strip = (p) => JSON.stringify({ ...p, _seasonApplied: { ...p._seasonApplied, at: 0 } });
                    if (strip(again.plan) !== strip(p1)) H('重訓', 'S10 同樣輸入換兩次結果不同', tag, '');
                } catch { /* 上面已記 */ }
                const expSeason = Math.max(p0.season || 1, currentSeason) + 1;
                if (p1.season !== expSeason) H('重訓', 'S10 季數沒有剛好 +1', tag, `${p0.season} → ${p1.season}`);
                // S11 不會卡住：新的一季從今天開始、週數不變
                if (p1.startDate !== dayKey(nowMs)) H('重訓', 'S11 新一季起始日不是今天', tag, `${p1.startDate}`);
                if ((p1.weeks || []).length !== p0.weeks.length) H('重訓', 'S11 換季後週數不對', tag, `${p0.weeks.length} → ${p1.weeks?.length}`);
                // S9 預告 = 實際寫進去的
                const pv = res.previewRows || res.rows;
                const stripRows = (rows) => JSON.stringify((rows || []).map((x) => ({ n: x.name, nn: x.newName, p: x.parts })));
                if (stripRows(pv) !== stripRows(p1._seasonApplied?.rows)) H('重訓', 'S9 預告清單跟套用後不一樣', tag, `預告 ${pv.length} 項、套用後 ${p1._seasonApplied?.rows?.length} 項`);
                if (stripRows(st.diffSeasonPlans(p0, p1, res.personal)) !== stripRows(p1._seasonApplied?.rows)) H('重訓', 'S9 摘要沒涵蓋全部改動', tag, '');

                // ── 逐動作比對 ──
                const lvl0 = p0._intensityLevel || 0, lvl1 = p1._intensityLevel || 0;
                if (lvl1 < STD.LEVEL_MIN || lvl1 > STD.LEVEL_MAX) H('重訓', 'S8 強度等級超出範圍', tag, `${lvl1}`);
                const det = detOf(daysOff ?? 0);
                const lowAdh = trueAdh < STD.LOW_ADH;
                const over = sim.weekly.filter((w) => w.status === 'over').length >= 2;
                let increased = lvl1 > lvl0;
                if (lvl1 > lvl0 && (lowAdh || over || det[2])) H('重訓', 'S2 不該加量卻加強度', tag, `完成 ${trueAdh}%／RPE ${rpe}／停 ${Math.round(daysOff ?? 0)} 天 → 強度 ${lvl0}→${lvl1}`);
                const swappedNames = new Set();
                p1.weeks.forEach((w, wi) => {
                    const ow = p0.weeks[wi];
                    if (!ow) return;
                    if (isDeload(ow) !== isDeload(w)) H('重訓', 'S7 減量週被拿掉或搬走', tag, `第 ${wi + 1} 週 ${ow.phase} → ${w.phase}`);
                    w.days.forEach((d, di) => d.exercises.forEach((e, ei) => {
                        const o = ow.days?.[di]?.exercises?.[ei];
                        if (!o || e.isWarmup) return;
                        if (o.name !== e.name) { swappedNames.add(o.name); return; }
                        const os = parseInt(o.sets, 10) || 0, ns = parseInt(e.sets, 10) || 0;
                        const or = range(o.reps), nr = range(e.reps);
                        if (isDeload(w)) {
                            if (ns > os || (or && nr && nr[1] > or[1])) H('重訓', 'S7 減量週被加量', tag, `${e.name} ${os}×${o.reps} → ${ns}×${e.reps}`);
                            return;
                        }
                        if (ns - os > STD.MAX_SET_STEP) H('重訓', 'S4 一季加超過 1 組', tag, `${e.name} ${os}→${ns} 組`);
                        if (or && nr && (nr[1] - or[1] > STD.MAX_REP_STEP || nr[0] - or[0] > STD.MAX_REP_STEP)) H('重訓', 'S4 次數一次加太多', tag, `${e.name} ${o.reps}→${e.reps}`);
                        const up = ns > os || (or && nr && nr[1] > or[1]);
                        if (up) increased = true;
                        if (up && (lowAdh || over)) H('重訓', 'S2 不該加量卻加組／加次數', tag, `完成 ${trueAdh}%／RPE ${rpe}：${e.name} ${os}×${o.reps} → ${ns}×${e.reps}`);
                        if (up && det[2]) H('重訓', 'S6 停練回來還加量', tag, `停 ${Math.round(daysOff)} 天：${e.name} ${os}×${o.reps} → ${ns}×${e.reps}`);
                        if (det[2] && wi === 0 && e.cat === 'compound' && os > 2 && ns >= os) H('重訓', 'S6 停練 4 週以上主項沒有少一組', tag, `停 ${Math.round(daysOff)} 天：${e.name} 還是 ${ns} 組`);
                        // 重量：跟這一季實際做到的最重比
                        const sw = parseFloat(e.suggestedWeight);
                        const last = lastTop[e.name];
                        if (sw > 0 && last > 0 && wi === 0) {
                            const inc = e.eq === 'dumbbell' || e.eq === 'kettlebell' || e.cat !== 'compound' ? 1 : 2.5;
                            const capPct = Math.max(last * (1 + STD.MAX_LOAD_PCT / 100), last + inc) + 0.01;
                            const minW = e.eq === 'dumbbell' || e.eq === 'kettlebell' ? 1 : 2.5;
                            const rg = nr || [8, 12];
                            const lastBest = Math.max(...sim.recs.flatMap((x) => x.exercises.filter((q) => q.name === e.name).flatMap((q) => q.sets.map((s) => epley(s.weight, s.reps)))));
                            const implied = epley(sw, Math.round((rg[0] + rg[1]) / 2));
                            if (sw > capPct && implied > lastBest * (1 + STD.MAX_LOAD_PCT / 100) + 1) H('重訓', 'S4 一季加重超過 10%', tag, `${e.name} 上季最重 ${last} → 建議 ${sw} kg`);
                            if (sw > last) increased = true;
                            if (sw > last && (lowAdh || over)) H('重訓', 'S2 不該加量卻加重量', tag, `完成 ${trueAdh}%／RPE ${rpe}：${e.name} ${last}→${sw} kg`);
                            if (det[1] < 1 && sw > Math.max(minW, last * det[1]) + 0.01) H('重訓', 'S6 停練回來重量沒有先退', tag, `停 ${Math.round(daysOff)} 天：${e.name} 上季 ${last} kg → 建議 ${sw} kg（應 ≤ ${Math.floor(last * det[1] / 2.5) * 2.5}）`);
                            const trend = firstE[e.name] > 0 && lastE[e.name] > 0 ? (lastE[e.name] - firstE[e.name]) / firstE[e.name] : 0;
                            if (trend < -0.02 && sw > last) H('重訓', 'S2 力量退步還加重量', tag, `${e.name} e1RM ${Math.round(trend * 100)}%，${last}→${sw} kg`);
                        }
                    }));
                });
                // S5 動作保留率（主場沒器材被迫換的不算）
                {
                    const uniq = new Set(p0.weeks.flatMap((w) => w.days.flatMap(mainEx)).map((e) => e.name));
                    const forced = new Set((res.personal || []).filter((c) => c.kind === 'swap' && /沒有這台/.test(c.why || '')).map((c) => c.name));
                    const n = [...swappedNames].filter((x) => !forced.has(x)).length;
                    const allow = Math.max(1, Math.floor(uniq.size * (1 - STD.MIN_RETAIN)));
                    if (n > allow) H('重訓', 'S5 一季換掉太多動作', tag, `${uniq.size} 個動作換掉 ${n} 個（上限 ${allow}）：${[...swappedNames].join('、')}`);
                }
                // S8 每週每部位組數
                p1.weeks.forEach((w, wi) => {
                    const tot = (days) => (days || []).flatMap(mainEx).reduce((m, e) => { m[e.muscle] = (m[e.muscle] || 0) + (parseInt(e.sets, 10) || 0); return m; }, {});
                    const a = tot(w.days), b = tot(base.weeks[wi]?.days);
                    Object.keys(a).forEach((mu) => { if (a[mu] > Math.max(STD.WEEKLY_SETS_CAP, b[mu] || 0)) H('重訓', 'S8 每週單一部位組數超量', tag, `第 ${wi + 1} 週 ${mu} ${a[mu]} 組`); });
                });
                // S7 減量週間隔
                {
                    let gap = 0, worst = 0;
                    p1.weeks.forEach((w) => { gap = isDeload(w) ? 0 : gap + 1; worst = Math.max(worst, gap); });
                    if (worst > STD.MAX_DELOAD_GAP) H('重訓', 'S7 超過 6 週沒有減量週', tag, `連續 ${worst} 週`);
                }
                // S2 該進步的人要真的往上加（不然課表空轉）
                if (persona.adh === 1 && outcome === 'progress' && rpe !== 'over' && brk === 0 && !(daysOff >= 14) && !increased)
                    H('重訓', 'S2 有進步卻沒有任何加量', tag, `決策 ${decision.recommend}，${(res.rows || []).length} 項改動都沒有往上加`);
                // S3 平台期：有照練、連兩季卡住 → 要換刺激
                const stuck = persona.adh >= 0.75 && outcome === 'plateau' && rpe === 'ok' && brk === 0;   // RPE 偏低沒進步 = 練太輕，不算卡住
                plateauRun = stuck ? plateauRun + 1 : 0;
                if (plateauRun >= 2 && !(res.personal || []).some((x) => x.kind === 'swap'))
                    H('重訓', 'S3 連兩季卡住卻沒換刺激', tag, `決策 ${decision.recommend}（應換部位重排或換變化式）`);
                if (plateauRun >= 2) plateauRun = 0;
                // 套用：下一季
                plan = p1; currentSeason = p1.season; prevTon = prevTonNext;
                startMs = midnight(nowMs);
            }
        }
    }
    simNow = null;
    return { rotations, users: usersN, secs: (realNow() - t0) / 1000 };
}

/* ══════════════════════════════════════════════════════════════════
 * 跑步
 * ══════════════════════════════════════════════════════════════════ */
const R_PROFILES = [];
const LV_KM = { beginner: 8, intermediate: 20, advanced: 40 };
for (const goal of ['fat_loss', 'aerobic_base', 'race_5k_10k', 'race_half', 'race_full'])
    for (const level of ['beginner', 'intermediate', 'advanced'])
        for (const totalWeeks of QUICK ? [8] : [8, 12])
            R_PROFILES.push({ goal, currentLevel: level, currentWeeklyKm: LV_KM[level], totalWeeks, sessionsPerWeek: level === 'beginner' ? 3 : 4, includeStrength: false, baselinePace5K: level === 'beginner' ? 420 : level === 'intermediate' ? 330 : 270 });
const PACE_F = { progress: 0.97, plateau: 1.0, regress: 1.04 };
const GOAL_RANK = { fat_loss: 0, aerobic_base: 0, race_5k_10k: 1, race_half: 2, race_full: 3 };
const LV_RANK = { beginner: 0, intermediate: 1, advanced: 2 };

function simulateRunCycle(plan, persona) {
    const start = new Date(`${plan.start_date}T00:00:00`).getTime();
    let k = 0;
    for (let wi = 0; wi < plan.weeks.length; wi++) {
        // 前一週結束、寬限期過了 → 自動調整這一週（跟 App 每次打開一樣）
        if (wi > 0) {
            const today = new Date(start + (wi * 7 + 2) * DAY + 12 * 3600000);
            const a = cp.autoAdjustPlan(plan, today);
            plan = a.plan;
            const b = cp.autoAdjustPlan(plan, today);
            if (b.changed || b.applied.length) H('跑步', 'R10 同一週被調整兩次', persona.who, `第 ${wi + 1} 週`);
        }
        const w = plan.weeks[wi];
        w.bricks = (w.bricks || []).map((b, bi) => {
            if (b.distance_km == null) return b;
            const go = pattern(k++, persona.adh);
            const at = new Date(start + (wi * 7 + Math.min(6, bi * 2)) * DAY + 7 * 3600000).toISOString();
            if (!go) return { ...b, status: 'skipped' };
            const pace = Math.round((b.target_pace_sec || 360) * PACE_F[persona.outcome]);
            return { ...b, status: 'completed', completed_at: at, actual_distance_km: b.distance_km,
                actual_duration_min: Math.round((b.distance_km * pace) / 60 * 10) / 10, actual_pace_sec: pace };
        });
    }
    return plan;
}

function auditRunning() {
    let rotations = 0, usersN = 0;
    const t0 = realNow();
    const gen = (cfg) => (LEGACY_RUN ? fe.generateCardioPlan(cfg) : cp.generateNextCyclePlan(cfg));
    for (const prof of R_PROFILES) {
        for (const adh of ADH) for (const outcome of OUTCOMES) for (const brk of BREAKS) {
            usersN += 1;
            const who = `${prof.goal}/${prof.currentLevel}/${prof.totalWeeks}週 ${adhName(adh)} ${outcome} 停${brk / 7}週`;
            if (ONLY && !who.includes(ONLY)) continue;
            let plan = fe.generateCardioPlan({ ...prof, startDate: '2026-01-05' });
            for (let c = 1; c < CYCLES; c++) {
                const tag = `${who} 第${c}→${c + 1}期`;
                const cAdh = adhAt(adh, c);
                plan = simulateRunCycle(plan, { adh: cAdh, outcome, who: tag });
                const start = new Date(`${plan.start_date}T00:00:00`).getTime();
                const endMs = start + plan.weeks.length * 7 * DAY;
                const today = new Date(endMs + brk * DAY + 9 * 3600000);
                let diag, rec, rec2, next;
                try {
                    diag = cp.diagnosePlan(plan);
                    rec = cp.recommendNextPlan(plan, diag, { today });
                    rec2 = cp.recommendNextPlan(plan, cp.diagnosePlan(plan), { today });
                    next = gen({ ...rec.config, startDate: dayKey(today.getTime()) });
                } catch (e) { H('跑步', 'R11 換期丟錯（卡住）', tag, e.message); break; }
                rotations += 1;
                if (JSON.stringify(rec.config) !== JSON.stringify(rec2.config)) H('跑步', 'R10 同樣輸入推薦不同', tag, '');
                const prog = cp.computePlanProgress(plan);
                const ratio = prog.overall.ratio;
                const adhPct = Math.round(ratio * 100);
                const peak = Math.max(0, ...prog.weeks.map((w) => w.actualKm));
                const last4 = prog.weeks.slice(-4);
                const chronic = last4.reduce((s, w) => s + w.actualKm, 0) / Math.max(1, last4.length);
                // 停跑天數：最後一趟到今天（稽核自己算）
                const lastRun = Math.max(0, ...plan.weeks.flatMap((w) => w.bricks.filter((b) => (b.actual_distance_km || 0) > 0).map((b) => new Date(b.completed_at).getTime())));
                const daysOff = lastRun > 0 ? (midnight(today.getTime()) - midnight(lastRun)) / DAY : (midnight(today.getTime()) - start) / DAY;
                const [, volF, paceSlow] = runDetOf(daysOff);
                const w1 = Number(next.weeks?.[0]?.target_mileage_km) || 0;
                const nextGoal = next.goal || rec.config.goal;

                // R11 一定排得出下一期
                if (!next.weeks?.length || w1 <= 0) H('跑步', 'R11 下一期是空的', tag, `第 1 週 ${w1} km`);
                if (next.weeks?.length !== Math.max(4, Math.min(14, rec.config.totalWeeks))) W('跑步', 'R11 週數跟推薦不同', tag, `${rec.config.totalWeeks} → ${next.weeks?.length}`);
                // R1 起點 vs 上一期實跑尖峰
                const startCap = STD.RUN_START_OF_PEAK[plan.goal] ?? STD.RUN_START_OF_PEAK.default;
                if (adhPct >= STD.GOOD_ADH && daysOff < 14 && peak > 0) {
                    if (w1 > peak + 0.05) H('跑步', 'R1 下一期從尖峰 100% 以上開始', tag, `上期實跑尖峰 ${peak} km → 第 1 週 ${w1} km`);
                    else if (w1 > peak * startCap + 0.5) W('跑步', 'R1 下一期起點高於尖峰的建議比例', tag, `尖峰 ${peak} km × ${startCap} = ${(peak * startCap).toFixed(1)} → 第 1 週 ${w1} km`);
                    if (w1 < peak * 0.5 - 0.5) H('跑步', 'R1 照練完的人被打回原點', tag, `尖峰 ${peak} km → 第 1 週 ${w1} km（< 50%）`);
                }
                // R2 ACWR
                if (chronic > 0 && daysOff < 14) {
                    const acwr = w1 / chronic;
                    if (acwr > STD.ACWR_MAX + 0.05 && w1 > 6.5) H('跑步', 'R2 起點 ACWR > 1.3', tag, `最後 4 週平均 ${chronic.toFixed(1)} km → 第 1 週 ${w1} km（${acwr.toFixed(2)}）`);
                    else if (acwr < STD.ACWR_MIN && adhPct >= STD.GOOD_ADH) W('跑步', 'R2 起點 ACWR < 0.8（掉太多）', tag, `最後 4 週平均 ${chronic.toFixed(1)} km → 第 1 週 ${w1} km（${acwr.toFixed(2)}）`);
                }
                // R3 級別延續
                const lv0 = LV_RANK[plan.current_level] ?? 0, lv1 = LV_RANK[next.current_level] ?? 0;
                if (adhPct >= STD.GOOD_ADH && daysOff < 56 && lv1 < lv0) H('跑步', 'R3 照練完卻被降級', tag, `${plan.current_level} → ${next.current_level}`);
                if (daysOff >= 56 && lv1 > lv0) H('跑步', 'R6 停跑 8 週還升級', tag, `${plan.current_level} → ${next.current_level}`);
                // R4 目標升級要有底子
                const g0 = GOAL_RANK[plan.goal] ?? 0, g1 = GOAL_RANK[nextGoal] ?? 0;
                if (g1 > g0) {
                    const need = nextGoal === 'race_5k_10k' ? STD.PROMOTE_5K_KM : (path_.RACE_TARGETS[nextGoal]?.minPeak || 99) * 0.72;
                    if (ratio < STD.PROMOTE_RATIO || chronic < need * 0.8 || daysOff >= 28) H('跑步', 'R4 底子不夠就升級目標', tag, `${plan.goal} → ${nextGoal}（完成 ${adhPct}%、最後 4 週 ${chronic.toFixed(1)} km、停 ${daysOff} 天）`);
                }
                if (adhPct < STD.LOW_ADH && path_.RACE_TARGETS[nextGoal]) H('跑步', 'R5 完成不到一半還排備賽', tag, `完成 ${adhPct}% → ${nextGoal}`);
                // R5 次數
                const s0 = plan.meta?.planned_run_sessions ?? plan.sessions_per_week, s1 = rec.config.sessionsPerWeek;
                if (Math.abs(s1 - s0) > 1) H('跑步', 'R5 每週次數一次改超過 1', tag, `${s0} → ${s1}`);
                if (s1 > s0 && (ratio < 0.95 || daysOff >= 14)) H('跑步', 'R5 沒做滿就加次數', tag, `完成 ${adhPct}%、停 ${daysOff} 天：${s0} → ${s1}`);
                // R6 停跑回來
                if (daysOff >= 14 && chronic > 0) {
                    const ref = Math.max(chronic, peak * 0.5);
                    if (w1 > Math.max(peak, chronic) * volF + 0.6 && w1 > 6.5) H('跑步', 'R6 停跑回來量沒有先降', tag, `停 ${daysOff} 天：上期尖峰 ${peak}／最後 4 週 ${chronic.toFixed(1)} km → 第 1 週 ${w1} km（應 ≤ ${(Math.max(peak, chronic) * volF).toFixed(1)}）`);
                    void ref;
                }
                if (daysOff >= 56 && path_.RACE_TARGETS[nextGoal] && !path_.RACE_TARGETS[plan.goal]) H('跑步', 'R6 停跑 8 週還升級備賽', tag, `${plan.goal} → ${nextGoal}`);
                if (daysOff >= 56 && path_.RACE_TARGETS[nextGoal]) W('跑步', 'R6 停跑 8 週直接接備賽', tag, `${plan.goal} → ${nextGoal}`);
                const pace0 = Number(plan.meta?.baseline_pace_5k_sec) || null, pace1 = Number(next.meta?.baseline_pace_5k_sec) || null;
                if (daysOff >= 28 && pace0 && pace1 && pace1 < pace0 && cAdh === 0) H('跑步', 'R6 停跑回來配速反而變快', tag, `${pace0} → ${pace1} 秒/公里`);
                // R7 配速重估：最後 4 週有 ≥3 趟實跑
                {
                    const weeksActive = plan.weeks.filter((w) => w.bricks.some((b) => b.status === 'completed')).slice(-4);
                    const n = weeksActive.flatMap((w) => w.bricks.filter((b) => b.status === 'completed' && b.actual_pace_sec > 0)).length;
                    if (n >= 3 && pace0 && pace1 && daysOff < 14) {
                        if (outcome === 'progress' && pace1 > pace0 + 1) H('跑步', 'R7 跑得比課表快，配速基準卻變慢', tag, `${pace0} → ${pace1}`);
                        if (outcome === 'regress' && pace1 < pace0 - 1) H('跑步', 'R7 跑得比課表慢，配速基準卻變快', tag, `${pace0} → ${pace1}`);
                        if (outcome !== 'plateau' && Math.abs(pace1 - pace0) < 2) H('跑步', 'R7 配速基準沒用這期實跑重估', tag, `${n} 趟實跑都${outcome === 'progress' ? '快' : '慢'}了 3–4%，基準還是 ${pace0}`);
                    }
                }
                // R8 誠實：畫面上的數字 = 下一期真的長的樣子
                if (rec.realBaseline != null && Math.abs(rec.realBaseline - w1) > 0.15) H('跑步', 'R8 「新起點」跟第 1 週不一樣', tag, `畫面 ${rec.realBaseline} km，第 1 週 ${w1} km`);
                const nPeak = next.meta?.totals?.peak_km;
                if (rec.projectedPeakKm != null && nPeak != null && Math.abs(rec.projectedPeakKm - nPeak) > 0.15) H('跑步', 'R8 預告尖峰跟實際不一樣', tag, `${rec.projectedPeakKm} vs ${nPeak}`);
                if (rec.title !== (path_.GOAL_NAMES[nextGoal] || nextGoal)) H('跑步', 'R8 標題跟目標不一致', tag, `${rec.title} vs ${nextGoal}`);
                [...rec.reasons, ...rec.adjustments].forEach((t) => {
                    const m1 = t.match(/每週次數 (\d+) → (\d+)/); if (m1 && (+m1[1] !== s0 || +m1[2] !== s1)) H('跑步', 'R8 理由裡的次數跟設定不一致', tag, t);
                    const m2 = t.match(/週期 (\d+) → (\d+)/); if (m2 && (+m2[1] !== plan.total_weeks || +m2[2] !== rec.config.totalWeeks)) H('跑步', 'R8 理由裡的週數跟設定不一致', tag, t);
                });
                if (daysOff >= 14 && ![...rec.reasons, ...rec.adjustments].some((t) => /停|休/.test(t))) H('跑步', 'R8 停跑打折了卻沒說', tag, `停 ${daysOff} 天`);
                // R9 整期沒跑
                if (cAdh === 0) {
                    const prevW1 = Number(plan.weeks[0]?.target_mileage_km) || 0;
                    if (w1 > Math.max(prevW1, 6) + 0.05) H('跑步', 'R9 整期沒跑，下一期起點反而更高', tag, `${prevW1} → ${w1} km`);
                    if (nextGoal !== 'aerobic_base') H('跑步', 'R9 整期沒跑還排原目標', tag, nextGoal);
                }
                // R1 比賽週期後的過渡週
                if (path_.RACE_TARGETS[plan.goal] && adhPct >= STD.LOW_ADH && daysOff < 14) {
                    const q = (next.weeks?.[0]?.bricks || []).filter((b) => ['tempo', 'interval'].includes(b.subtype));
                    if (q.length) H('跑步', 'R1 比賽週期後第 1 週就排強度', tag, `${q.map((b) => b.subtype).join('、')}`);
                }
                // R12 下一期前 5 週內要有減量／恢復週
                {
                    const first = (next.weeks || []).slice(0, 5);
                    if (next.weeks?.length >= 6 && !first.some((w) => w.is_deload || w.transition)) W('跑步', 'R12 前 5 週沒有恢復週', tag, '');
                }
                plan = next;
            }
        }
    }
    return { rotations, users: usersN, secs: (realNow() - t0) / 1000 };
}

/* ══════════════════════════════════════════════════════════════════
 * 結構檢查：畫面那一層（不能用模擬跑的）—— 讀原始碼
 * ══════════════════════════════════════════════════════════════════ */
function auditStructure() {
    const lux = read('src/components/LuxuryPlanViewMobile.jsx');
    const gate = read('src/components/PlanCompletionGate.jsx');
    const hook = read('src/hooks/useCardioPlanLifecycle.js');
    const cel = read('src/components/PlanCompletionCelebration.jsx');
    const S = (code, cond, msg) => { if (!cond) H('結構', code, '原始碼', msg); };
    S('S9 0 堂當成全做完', !/if \(totalCompletedSessions === 0\) totalCompletedSessions = totalPlannedSessions/.test(lux), '收官頁：一堂都沒練 → 完成率顯示 100%');
    S('S9 訓練量成長是乘出來的', !/realisticVolumeGrowth/.test(lux), '收官頁：訓練量 +x% 是完成率 × 4.5 算的，不是量的');
    S('S9 模擬 InBody 進了決策', !/const simulate = \(\) =>/.test(lux), '收官頁：沒量 InBody 就模擬一筆，並拿它判斷「有進步 → 加量」');
    S('S9 預告後才套負重處方', !/applyLoadPrescriptions\(updatedPlan/.test(lux), '收官頁：預告清單畫完後才套 e1RM 負重處方 → 套用後跟預告不一樣');
    S('S10 換季沒走單一入口', LEGACY_STRENGTH || /rotateStrengthSeason\(/.test(lux), '收官頁沒有呼叫 rotateStrengthSeason');
    {
        const i = lux.indexOf('const runNextSeason = () =>');
        const body = i > 0 ? lux.slice(i, i + 5000) : '';
        const save = body.search(/localStorage\.setItem\(`currentPlan_\$\{userId\}`/);
        const mark = body.indexOf('markCycleDone();');
        S('S11 先標記收官才存課表', save > 0 && mark > save, '確認下一季：先把收官標成完成、才寫課表 → 寫失敗就卡在「看過了但沒換季」');
    }
    S('S11 季數不跟課表走', /plan\?\.season/.test(lux) && /setCurrentSeason\(\(\w+\) => Math\.max/.test(lux), '季數只存在 localStorage：換裝置／清快取後季數倒回 1，收官旗標對不上');
    S('S11 離線換季被後端蓋回去', /localPlan\?\.plan_id === data\.plan\.plan_id && \(Number\(localPlan\.season\) \|\| 1\) > \(Number\(data\.plan\.season\) \|\| 1\)/.test(lux),
        '離線換季（上傳沒送出）→ 下次上線後端的上一季把新的一季蓋回去，收官再跳一次、季數多 +1');
    S('R11 存檔失敗就離開結業畫面', /if \(!res\?\.saved\)[\s\S]{0,120}return;/.test(gate), 'PlanCompletionGate：下一期沒存成功仍跳走');
    S('R11 沒存成功就蓋章', /if \(saved\) \{ dismissCelebration\(\)/.test(hook), 'useCardioPlanLifecycle：還沒存成功就把結業蓋章');
    S('R8 套用的不是預覽那一份', LEGACY_RUN || /generateNextCyclePlan\(/.test(hook), 'useCardioPlanLifecycle.applyNextPlan 跟推薦預覽不是同一支生成');
    S('R8 結業頁的推薦不是同一支', /recommendNextPlan\(plan, diagnosis/.test(cel), 'PlanCompletionCelebration 沒有呼叫 recommendNextPlan');
}

// ── 執行 ─────────────────────────────────────────────
const sRes = auditStrength();
const rRes = auditRunning();
auditStructure();

console.log(`\n週期輪換稽核 ${LEGACY_STRENGTH || LEGACY_RUN ? `（舊版程式碼：${[LEGACY_STRENGTH && '重訓', LEGACY_RUN && '跑步'].filter(Boolean).join('、')}照原寫法重現）` : ''}`);
console.log(`  重訓：${S_PROFILES.length} 種課表 × ${ADH.length * 3 * OUTCOMES.length * BREAKS.length} 種人 = ${sRes.users} 位 × ${CYCLES} 季 → ${sRes.rotations} 次換季（${sRes.secs.toFixed(0)} 秒）`);
console.log(`  跑步：${R_PROFILES.length} 種課表 × ${ADH.length * OUTCOMES.length * BREAKS.length} 種人 = ${rRes.users} 位 × ${CYCLES} 期 → ${rRes.rotations} 次換期（${rRes.secs.toFixed(0)} 秒）`);
console.log('\n重訓換季決策分佈（列＝這一季的人，欄＝建議）：');
const COLS = ['keep', 'intensity', 'progress', 'redesign'];
console.log(`  ${'這一季'.padEnd(26)}${COLS.map((c) => c.padStart(10)).join('')}`);
Object.keys(dist).filter((k) => !/停/.test(k) && /完成100%|完成50%|完成0%/.test(k)).sort().forEach((k) => {
    const tot = COLS.reduce((a, c) => a + (dist[k][c] || 0), 0);
    console.log(`  ${k.padEnd(26)}${COLS.map((c) => `${Math.round(((dist[k][c] || 0) / tot) * 100)}%`.padStart(10)).join('')}`);
});
const keys = Object.keys(counts).sort((a, b) => (sev[a] === sev[b] ? b.localeCompare(a) * -1 : sev[a] === 'H' ? -1 : 1));
let hard = 0, warn = 0;
for (const k of keys) {
    const isH = sev[k] === 'H';
    if (isH) hard += counts[k]; else warn += counts[k];
    console.log(`\n${isH ? '❌' : '⚠️ '} ${k}  ${counts[k]} 次（${users[k].size} 位）`);
    ex[k].forEach((x) => console.log(`     · ${x}`));
}
console.log(`\n${hard ? '❌' : '✅'} 硬傷 ${hard} 次／${keys.filter((k) => sev[k] === 'H').length} 種；⚠️ 警告 ${warn} 次／${keys.filter((k) => sev[k] === 'W').length} 種`);
process.exit(hard ? 1 : 0);
