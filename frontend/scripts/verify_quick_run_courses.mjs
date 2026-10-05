// verify_quick_run_courses.mjs — 跑步頁「快速訓練」固定課程的專業度斷言
//   · 四門課 × 入門／中階／進階，時長逐級增加
//   · 每一門都是 暖身 → 主課 → 緩和；強度課暖身 ≥ 10 分、緩和 ≥ 6 分
//   · 趟數寫幾趟就真的有幾趟；每段都有 RPE 區間與一句體感
//   · 範本不寫死配速；個人配速只給輕鬆段，而且要有 5K 基準
//   · 計劃模式（brick → 課表）仍能用這些範本分配配速
//   · 畫面：沒有英文殘留標籤、依體感段不做配速震動、不顯示空配速條
import * as esbuild from 'esbuild';
import { readFileSync } from 'node:fs';

const entry = `
export * as q from './src/utils/quickRunCourses.js';
export * as bm from './src/utils/brickThemeMapping.js';
export * as cp from './src/utils/cardioPrescription.js';
`;
const r = await esbuild.build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: 'js' },
    bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'error',
    define: { 'import.meta.env': '{"DEV":true}' },
});
const { q, bm, cp } = await import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));

let fail = 0;
const ok = (cond, msg) => { if (cond) console.log('  ✓', msg); else { fail++; console.log('  ✗', msg); } };
const MIN = 60;

console.log('▶ 課程結構');
const C = q.QUICK_RUN_COURSES;
ok(C.map((c) => c.id).join(',') === 'recovery,base,progressive,hill', '四門課 id 與計劃模式對應不變');
for (const c of C) {
    ok(c.difficulties.map((d) => d.level).join('') === '入門中階進階', `${c.title}：入門／中階／進階`);
    const mins = c.difficulties.map((d) => d.minutes);
    ok(mins.every((m, i) => i === 0 || m > mins[i - 1]), `${c.title}：時長逐級增加（${mins.join('/')} 分）`);
    const intense = c.id === 'progressive' || c.id === 'hill';
    for (const d of c.difficulties) {
        const st = d.steps;
        const sum = Math.round(st.reduce((a, s) => a + s.duration, 0) / MIN);
        ok(sum === d.minutes, `${c.title}${d.level}：標示時長＝各段加總（${sum} 分）`);
        ok(/暖身/.test(st[0].name) && /緩和/.test(st[st.length - 1].name), `${c.title}${d.level}：暖身開頭、緩和收尾`);
        if (intense) ok(st[0].duration >= 10 * MIN && st[st.length - 1].duration >= 6 * MIN, `${c.title}${d.level}：強度課暖身 ≥10 分、緩和 ≥6 分`);
        ok(st.every((s) => s.rpeBand && Number.isFinite(s.rpeBand.min) && s.cue), `${c.title}${d.level}：每段有 RPE 區間與體感`);
        ok(st.every((s) => s.targetPace == null), `${c.title}${d.level}：範本沒有寫死配速`);
        const repSteps = st.filter((s) => /^(節奏|間歇) \d+\/\d+$/.test(s.name));
        if (repSteps.length) {
            const n = Number(repSteps[0].name.split('/')[1]);
            ok(repSteps.length === n, `${c.title}${d.level}：寫 ${n} 趟就有 ${repSteps.length} 趟`);
            const recs = st.filter((s) => s.name === '恢復慢跑').length;
            ok(recs === n - 1, `${c.title}${d.level}：趟間恢復 ${recs} 段（最後一趟直接緩和）`);
        }
        ok(d.main && d.main.label && d.main.band, `${c.title}${d.level}：主課摘要 ${d.main?.label}・RPE ${d.main?.band?.min}–${d.main?.band?.max}`);
    }
}
const hill = C.find((c) => c.id === 'hill');
ok(hill.difficulties.every((d) => d.main.band.min >= 9), '間歇主課 RPE ≥ 9');
const tempo = C.find((c) => c.id === 'progressive');
ok(tempo.difficulties.every((d) => d.main.band.min === 7), '節奏主課 RPE 7–8');
const rec = C.find((c) => c.id === 'recovery');
ok(rec.difficulties.every((d) => d.steps.every((s) => s.rpeBand.max <= 4)), '恢復跑全程 RPE ≤ 4');

console.log('▶ 個人配速');
const steps = tempo.difficulties[0].steps;
ok(q.personalizeQuickSteps(steps, null).every((s) => s.targetPace == null), '沒有 5K 基準 → 全程依體感');
const p = q.personalizeQuickSteps(steps, 300);
ok(p.filter((s) => /節奏/.test(s.name)).every((s) => s.targetPace == null), '節奏段不用公式推配速');
ok(p.filter((s) => s.paceKey).every((s) => s.targetPace > 300), '輕鬆段配速比 5K 配速慢');
ok(steps.every((s) => s.targetPace == null), '個人化不改動範本本身');
ok(q.courseMinutesRange(rec) === '20–40 分', '卡片時長範圍 20–40 分');

console.log('▶ 計劃模式相容');
const themes = C.map((c) => ({ ...c }));
const built = bm.buildActivePlanFromBrick({ brick_id: 'b1', type: 'speed', subtype: 'interval', duration_min: 39, target_pace_sec: 330 }, themes);
ok(built && built.id === 'hill', 'interval 磚 → 間歇跑課表');
const fast = built.steps.filter((s) => /間歇/.test(s.name));
const slow = built.steps.filter((s) => /恢復|暖身|緩和/.test(s.name));
ok(fast.length > 0 && fast.every((s) => s.targetPace > 0), '計劃配速有填進間歇段');
ok(Math.max(...fast.map((s) => s.targetPace)) < Math.min(...slow.map((s) => s.targetPace)), '間歇段比暖身／恢復段快');
const easy = bm.buildActivePlanFromBrick({ brick_id: 'b2', type: 'easy', subtype: 'easy', duration_min: 35 }, themes);
ok(easy && easy.steps.every((s) => !(s.targetPace > 0)), '計劃沒給配速時不冒出範本配速');
ok(Math.round(easy.steps.reduce((a, s) => a + s.duration, 0) / MIN) === 35, '輕鬆磚依計劃時長調整（35 分）');

console.log('▶ 課型配速（相對 5K 比賽配速）');
const S = cp.PACE_SHIFT_BY_SUBTYPE;
ok(S.tempo >= 10 && S.tempo <= 25, `節奏跑比 5K 配速慢 10–25 秒（${S.tempo}）`);
ok(S.interval >= -20 && S.interval <= 0, `間歇跑比 5K 配速快 0–20 秒（${S.interval}）`);
ok(S.interval < S.tempo && S.tempo < S.long && S.long < S.easy && S.easy < S.recovery, '快慢順序：間歇 < 節奏 < 長跑 < 輕鬆 < 恢復');
const py = readFileSync('../backend/core/cardio_plan_rules.py', 'utf8').match(/PACE_SHIFT = (\{[^}]*\})/);
ok(py && JSON.stringify(JSON.parse(py[1])) === JSON.stringify(S), '後端 PACE_SHIFT 與前端同值');
const fusion = readFileSync('src/utils/cardioPlanFusionEngine.js', 'utf8');
ok(!/tempo:\s*-15|interval:\s*-40/.test(fusion + readFileSync('src/components/CardioBrickDetailSheet.jsx', 'utf8')), '沒有殘留的舊偏移副本');

console.log('▶ 畫面');
const src = readFileSync('src/components/CardioTrackerMobile.jsx', 'utf8');
ok(src.includes('const TRAINING_THEMES = QUICK_RUN_THEMES;'), '快速訓練只讀 quickRunCourses');
ok(!/'MULTIPLE'|• SERIES|'Run For'/.test(src), '卡片沒有英文殘留標籤');
ok(/!\(currentStep\.targetPace > 0\)/.test(src), '依體感段不做配速震動');
ok(src.includes("panelMode === 'effort'") && src.includes("(basePanel === 'pace' && !hasTargetPace) ? 'effort'"), '沒配速的段顯示體感面板，不顯示空配速條');
ok(src.includes('steps: courseSteps'), '開跑用的課表＝詳細頁看到的課表');

if (fail) { console.log(`\n✗ ${fail} 項未通過`); process.exit(1); }
console.log('\n✓ 快速訓練課程全部通過');
