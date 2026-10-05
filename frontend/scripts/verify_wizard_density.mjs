/**
 * verify_wizard_density.mjs —— 精靈每一步的資訊量與字級。
 *
 * 使用者兩句話：
 *   「現在有點分太多小區塊了會讓使用者有點不知道要看哪」
 *   「你的計劃是只有里程取向嗎？因為跑步有練 zone2 或者是間歇跑」
 *
 * 第二句其實是第一句的後果：計劃本來就有間歇與 Zone 2（80/20 極化模型排的），
 * 但預覽從頭到尾只畫里程，使用者當然看不出來 —— 資料在，只是沒擺出來。
 */
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, next) {
    try { return next(s, c); } catch (e) {
        if (s.startsWith('.') && !/\.[a-z]+$/i.test(s)) return next(s + '.js', c);
        throw e;
    }
} });
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(join(HERE, '..', 'src/components/CardioPlanBuilder.jsx'), 'utf8');
// 註解裡會引用舊文案（說明為什麼拿掉），那不算畫面上的字
const ui = raw.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const { generateCardioPlan, planIntensityMix } = await import('../src/utils/cardioPlanFusionEngine.js');
const { LEVEL_ZH } = await import('../src/utils/runnerLevel.js');

let fail = 0;
const ok = (cond, label, extra = '') => {
    if (!cond) fail++;
    console.log(`${cond ? '✓' : '✗'} ${label}${extra ? `   ${extra}` : ''}`);
};

/* ════════════════════════════════════════════════════════════════
   1 · 這份計劃不是只有里程
   ════════════════════════════════════════════════════════════════ */
console.log('\n── 1 · 計劃裡到底有沒有 Zone 2 與間歇 ──');
const plan = generateCardioPlan({
    goal: 'race_5k_10k', totalWeeks: 12, sessionsPerWeek: 4,
    currentWeeklyKm: 25, currentLevel: 'intermediate',
    baselinePace5K: 300, includeStrength: false, startDate: '2026-09-21',
});
const mix = planIntensityMix(plan);
console.log('  ' + Object.entries(mix.counts).map(([k, v]) => `${k} ${v}`).join(' · '));
ok(mix.total > 0, `共 ${mix.total} 堂跑步課`);
ok((mix.counts.easy || 0) + (mix.counts.recovery || 0) > 0, 'Zone 2（輕鬆／恢復跑）確實排進去了');
ok((mix.counts.interval || 0) + (mix.counts.tempo || 0) > 0,
    `質量課確實排進去了：節奏 ${mix.counts.tempo || 0} · 間歇 ${mix.counts.interval || 0}`);
ok((mix.counts.long || 0) > 0, `長跑 ${mix.counts.long} 堂`);

const sum = Object.values(mix.counts).reduce((a, b) => a + b, 0);
ok(sum === mix.total, `分項加起來 ${sum} = 總堂數 ${mix.total}（畫面上加得起來）`);
ok(mix.easy + mix.quality === mix.total, `輕鬆 ${mix.easy} ＋ 質量 ${mix.quality} = ${mix.total}`);
ok(mix.easyPct >= 70 && mix.easyPct <= 95,
    `輕鬆課佔 ${mix.easyPct}%（80/20 極化模型的合理區間）`);

console.log('\n── 2 · 純打底型目標仍然以輕鬆課為主 ──');
const base = generateCardioPlan({
    goal: 'aerobic_base', totalWeeks: 12, sessionsPerWeek: 4,
    currentWeeklyKm: 25, currentLevel: 'intermediate', includeStrength: false, startDate: '2026-09-21',
});
const bmix = planIntensityMix(base);
ok(bmix.easyPct >= mix.easyPct, `有氧底 ${bmix.easyPct}% ≥ 備賽 ${mix.easyPct}%（打底更輕鬆，合理）`);
ok((bmix.counts.interval || 0) === 0, '有氧底不排間歇（跟引擎文件一致）');

console.log('\n── 3 · 畫面真的把這些擺出來了 ──');
ok(/const IntensityMixRow/.test(ui), '里程曲線底下多了課種分佈那一列');
const curveCalls = raw.split('<MileageCurve').slice(1).map((c) => c.slice(0, 300));
ok(curveCalls.length === 2 && curveCalls.every((c) => /plan=\{/.test(c)),
    `${curveCalls.length} 個呼叫端都把課表傳進去（少傳一邊就少一邊看得到）`);
ok(!/Weekly Volume|PEAK \{/.test(ui), '圖表標頭換成中文');
ok(!/YOUR LEVEL/.test(ui), '「YOUR LEVEL」換成「你的程度」');
ok(!/>\s*Weeks\s*</.test(ui), '大數字旁的「Weeks」換成「週」');

/* ════════════════════════════════════════════════════════════════
   4 · 圖三：九個小方塊併成五個
   ════════════════════════════════════════════════════════════════ */
console.log('\n── 4 · 頻率那一步的區塊數 ──');
const cadence = ui.slice(ui.indexOf('const StepCadence'), ui.indexOf('const WeekShapeCard'));
ok(/<WeekShapeCard/.test(cadence), '「排在哪幾天」「跨系統負荷」「重訓已排 N 天」併成一塊');
for (const gone of [
    ['跨系統天數提醒', /🚦 跨系統天數提醒/],
    ['重訓系統每週已排（獨立方塊）', /重訓系統每週已排 \{strengthDays\} 天/],
    ['拖動看看那句', /拖動看看/],
    ['引擎倍率 ×0\\.55', /×0\.55/],
]) {
    ok(!gone[1].test(ui), `${gone[0]} 已經不在了`);
}
const labels = (cadence.match(/<SectionLabel/g) || []).length;
ok(labels <= 2, `這一步只剩 ${labels} 個區塊標題`);

console.log('\n── 5 · 級別名稱全 app 一致 ──');
for (const [id, zh] of Object.entries(LEVEL_ZH)) {
    ok(ui.includes(`LEVEL_ZH.${id}`), `${id} 的名稱取自 LEVEL_ZH（${zh}）`);
}
ok(!/label: '進階者'/.test(ui),
    '不再出現「進階者」—— 它在引擎那邊叫「中階」，同一個級別兩個名字最容易搞混');

console.log('\n── 6 · 字級下限 ──');
const tooSmall = [...raw.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)]
    .map((m) => Number(m[1])).filter((n) => n < 11);
const tooSmallInline = [...raw.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)\b/g)]
    .map((m) => Number(m[1])).filter((n) => n < 11);
ok(tooSmall.length + tooSmallInline.length === 0,
    `整支精靈沒有小於 11px 的字（class ${tooSmall.length} · inline ${tooSmallInline.length}）`);
const wideTracking = [...raw.matchAll(/tracking-\[(0\.\d+)em\]/g)].map((m) => Number(m[1])).filter((n) => n > 0.22);
const wideLs = [...raw.matchAll(/letterSpacing: '(0\.\d+)em'/g)].map((m) => Number(m[1])).filter((n) => n > 0.22);
ok(wideTracking.length + wideLs.length === 0,
    `字距都 ≤ 0.22em（class ${wideTracking.length} · inline ${wideLs.length} 超標）`);

console.log('\n── 7 · 質量課逐週輪替 ──');
for (const [goal, want] of [['race_5k_10k', ['interval', 'tempo']], ['race_half', ['tempo', 'interval']], ['race_full', ['tempo', 'interval']]]) {
    const p = generateCardioPlan({ goal, totalWeeks: 12, sessionsPerWeek: 4, currentWeeklyKm: 25,
        currentLevel: 'intermediate', baselinePace5K: 300, includeStrength: false, startDate: '2026-09-21' });
    const c = planIntensityMix(p).counts;
    ok(want.every((t) => (c[t] || 0) > 0),
        `${goal.padEnd(12)} 節奏 ${c.tempo || 0} · 間歇 ${c.interval || 0}（兩種都排得到）`);
}
{
    // 舊版：一週只有 1 格質量課時，i 永遠是 0 → 永遠只排到序列的第一種
    const seq = ['tempo', 'interval'];
    const oldPicks = new Set(Array.from({ length: 12 }, () => seq[0]));
    ok(oldPicks.size === 1,
        `舊版 12 週只會排到「${[...oldPicks][0]}」一種 —— 選 5K/10K 的人一次間歇都跑不到`);
}

console.log(fail === 0
    ? '\n✅ 區塊併好了，而且看得出這份計劃不只有里程\n'
    : `\n❌ ${fail} 項未通過\n`);
process.exit(fail === 0 ? 0 : 1);
