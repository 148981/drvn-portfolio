/**
 * verify_staged_path.mjs —— 「通往半馬的路徑」上的數字要加得起來。
 *
 * 使用者原話：「圖七這邊的問題是根本沒有什麼 7.8 個月 然後太多小字了搞不清楚重點」
 *
 * 兩個病：
 *   ① 假精度。34 週 ÷ 4.345 = 7.82 → 畫面寫「約 7.8 個月」。
 *      沒有人安排得出 0.8 個月，而且把下面每一期的週數加起來也湊不出 7.8，
 *      使用者只會覺得這個數字沒來由。
 *   ② 主角太多。標題塊同時擺「N 期」「約 7.8 個月」「34 週」三個數字，
 *      底下再四段小字 —— 一張卡一個主角，其餘都是多的。
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

const { generateCardioPlan } = await import('../src/utils/cardioPlanFusionEngine.js');
const { planStagedPath } = await import('../src/utils/cardioPlanPath.js');

let fail = 0;
const ok = (cond, label, extra = '') => {
    if (!cond) fail++;
    console.log(`${cond ? '✓' : '✗'} ${label}${extra ? `   ${extra}` : ''}`);
};

/* 週跑量 8km 的人選半馬 → 這一期一定到不了，正是這張卡出現的情境 */
const plan = generateCardioPlan({
    goal: 'race_half', totalWeeks: 8, sessionsPerWeek: 3,
    currentWeeklyKm: 8, currentLevel: 'beginner',
    includeStrength: false, startDate: '2026-09-21',
});
const path = planStagedPath(plan);
ok(!!path, 'planStagedPath 有回東西（週跑量 8km 選半馬 → 確實分期）');

console.log('\n── 1 · 標題那個數字，使用者加得出來嗎 ──');
const stageWeeks = path.stages.map((s) => s.weeks);
const rests = path.stages.length - 1;
const addUp = stageWeeks.reduce((a, b) => a + b, 0) + rests;
console.log(`  畫面上每一期：${stageWeeks.join(' + ')} 週，期間休整 ${rests} 週`);
ok(path.calendarWeeks === addUp,
    `標題寫 ${path.calendarWeeks} 週 = ${stageWeeks.join('+')}+${rests}（加得起來）`);
ok(Number.isInteger(path.totalMonths),
    `月數是整數 ${path.totalMonths}（不再出現「約 7.8 個月」這種假精度）`);
ok(String(path.totalMonths).indexOf('.') < 0, '月數字串裡沒有小數點');

console.log('\n── 2 · 舊的算法：證明它真的會生出小數 ──');
const oldMonths = Math.round((path.calendarWeeks / 4.345) * 10) / 10;
ok(!Number.isInteger(oldMonths),
    `舊版同一份資料會算出 ${oldMonths} 個月（所以使用者說「根本沒有什麼 7.8 個月」）`);

console.log('\n── 3 · 文字量 ──');
const oneSentence = (s) => String(s || '').split(/[。！？]/).filter((x) => x.trim()).length;
ok(oneSentence(path.summary) <= 1, `摘要 ${oneSentence(path.summary)} 句：「${path.summary}」`);
if (path.recommendSwitch) {
    const w = path.recommendSwitch.why;
    ok(oneSentence(w) <= 1, `換目標建議 ${oneSentence(w)} 句：「${w}」`);
    ok(w.length <= 40, `　 ${w.length} 字（好多少交給下面的數字標籤講）`);
    ok((path.recommendSwitch.gains || []).length > 0,
        `具體差距用數字列出：${path.recommendSwitch.gains.join('、')}`);
}

console.log('\n── 4 · 卡片版面 ──');
const ui = readFileSync(join(HERE, '..', 'src/components/CardioPlanBuilder.jsx'), 'utf8');
// 只看真的會渲染出來的部分：註解裡引用舊文案（說明為什麼拿掉）不算違規
const stripComments = (s) => s.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const cardStart = ui.indexOf('const StagedPathCard');
const card = stripComments(ui.slice(cardStart, ui.indexOf('\nconst ', cardStart + 30)));
ok(!/個月/.test(card), '標題塊不再出現「個月」');
ok(!/\{summary\}/.test(card), '整段摘要不再印在卡上（一句話已經在標題塊講完）');
ok(/\{s\.isCurrent && \(\s*\n\s*<p/.test(card), '每一期的說明只留在「現在這期」');
const heroes = (card.match(/text-\[3[0-9]px\]/g) || []).length;
ok(heroes <= 1, `標題塊只有 ${heroes} 個主角大字`);
ok(!/你按下去就會拿到這些數字，不是估計值/.test(card),
    '拿掉那句對第 2 期之後不成立的承諾');

console.log(fail === 0
    ? '\n✅ 路徑卡上的數字加得起來，也不再有四段小字\n'
    : `\n❌ ${fail} 項未通過\n`);
process.exit(fail === 0 ? 0 : 1);
