/**
 * verify_cycle_recommendation.mjs —— 「建議 N 週」要說得出理由，而且不能自打嘴巴。
 *
 * 使用者原話：「圖五這邊也要根據他是什麼樣的跑者去推薦建議的週期」
 *
 * 三個會出事的地方：
 *   ① 建議的週數不在可點的選項裡 → 「建議」標記標在一個點不到的位置。
 *   ② 理由裡的數字寫死 → 進階＋5K/10K 建議 12 週，理由卻說「10 週剛好」。
 *      圖說 12、字說 10，使用者不知道該信哪一個。
 *   ③ 畫面算級別跟引擎算級別各寫一套 → 畫面寫「初學者建議 8 週」，
 *      按下去拿到的是中階課表。預告的必須跟實際執行的同源。
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

const { recommendCycleWeeks, CYCLE_WEEK_OPTIONS, LEVELS } = await import('../src/utils/runnerLevel.js');
const { generateCardioPlan, resolveRunnerLevel } = await import('../src/utils/cardioPlanFusionEngine.js');

let fail = 0;
const ok = (cond, label, extra = '') => {
    if (!cond) fail++;
    console.log(`${cond ? '✓' : '✗'} ${label}${extra ? `   ${extra}` : ''}`);
};

const GOALS = ['fat_loss', 'aerobic_base', 'race_5k_10k', 'race_half', 'race_full'];

console.log('\n── 1 · 15 種組合都建議得出來，而且點得到 ──');
let bad = 0;
for (const goal of GOALS) {
    const row = LEVELS.map((lv) => recommendCycleWeeks({ goal, level: lv }).weeks);
    const allOptions = row.every((w) => CYCLE_WEEK_OPTIONS.includes(w));
    if (!allOptions) bad++;
    console.log(`  ${goal.padEnd(13)} 初 ${row[0]} · 中 ${row[1]} · 進 ${row[2]} 週`);
}
ok(bad === 0, `每一格的建議都落在可點的選項 ${CYCLE_WEEK_OPTIONS.join('/')} 上`);

console.log('\n── 2 · 理由裡的數字不會跟建議打架 ──');
let clash = [];
for (const goal of GOALS) {
    for (const lv of LEVELS) {
        const { weeks, why } = recommendCycleWeeks({ goal, level: lv });
        const nums = (why.match(/\d+/g) || []).map(Number);
        // 理由裡出現的「週數」必須就是建議的那個數（30 公里這種非週數不算）
        const weekNums = (why.match(/(\d+)\s*週/g) || []).map((s) => parseInt(s, 10));
        if (weekNums.length && weekNums.some((n) => n !== weeks)) {
            clash.push(`${goal}/${lv}：建議 ${weeks} 週，理由寫「${why}」`);
        }
        if (!nums.length) clash.push(`${goal}/${lv}：理由裡一個數字都沒有`);
    }
}
ok(clash.length === 0, '15 句理由都跟建議的週數一致', clash.length ? `\n     ${clash.join('\n     ')}` : '');

console.log('\n── 3 · 舊寫法（數字寫死）會被抓到 ──');
const hardcoded = (lv) => (lv === 'beginner' ? '先用 8 週把跑量墊起來。' : '10 週剛好跑完一輪速度進程。');
const advWeeks = recommendCycleWeeks({ goal: 'race_5k_10k', level: 'advanced' }).weeks;
const advSaid = parseInt((hardcoded('advanced').match(/(\d+)\s*週/) || [])[1], 10);
ok(advSaid !== advWeeks,
    `寫死的版本：建議 ${advWeeks} 週卻寫「${advSaid} 週剛好」—— 這正是要防的自打嘴巴`);

console.log('\n── 4 · 畫面算的級別 = 引擎實際用的級別 ──');
const CASES = [
    ['新手、週跑量 5km',        { currentWeeklyKm: 5 }],
    ['手選中階但跑不到 5K',     { currentLevel: 'intermediate', canRun5k: false, currentWeeklyKm: 12 }],
    ['手選初學但 5K sub-20',    { currentLevel: 'beginner', baselinePace5K: 228, currentWeeklyKm: 40 }],
    ['跑齡 5 年、40km/週',      { runningYears: 5, currentWeeklyKm: 40 }],
    ['什麼都沒填',              {}],
];
for (const [name, cfg] of CASES) {
    const base = { goal: 'race_5k_10k', totalWeeks: 8, sessionsPerWeek: 3, includeStrength: false, startDate: '2026-09-21', ...cfg };
    const shown = resolveRunnerLevel(base);                       // 畫面用這個算「建議幾週」
    const actual = generateCardioPlan({ ...base }).current_level; // 按下去真的拿到的
    ok(shown === actual, `${name.padEnd(20)} 畫面 ${shown} = 課表 ${actual}`);
}

console.log('\n── 5 · 畫面 ──');
const ui = readFileSync(join(HERE, '..', 'src/components/CardioPlanBuilder.jsx'), 'utf8');
ok(/const suggested = w === rec\.weeks/.test(ui), '週數格子會標出建議的那一格');
ok(/aria-label=\{suggested \? `\$\{w\} 週（建議）`/.test(ui), '讀螢幕的人也聽得到哪一格是建議');
ok(/resolveRunnerLevel\(config \|\| \{\}\)/.test(ui), '級別問的是引擎同一支');
ok(!/>\s*Weeks\s*</.test(ui), '大數字旁的「Weeks」換成「週」');
ok(!/每 3 個訓練週自動插入 1 個減量週/.test(ui), '減量週／taper 的機制說明從這一步拿掉了');
ok(/\{rec\.why\}/.test(ui), '底下只留一句「為什麼建議這個週數」');
const autoPick = ui.slice(ui.indexOf('還沒自己選過週數'), ui.indexOf('還沒自己選過週數') + 600);
ok(/if \(touched\.duration\) return;/.test(autoPick),
    '使用者自己選過就不再被蓋掉（touched.duration 先擋）');
ok(/c\.totalWeeks === rec\.weeks \? c :/.test(autoPick),
    '已經等於建議值就不重設 state（不會無限重繪）');

console.log(fail === 0
    ? '\n✅ 建議的週期跟這個人相符，理由也跟數字一致\n'
    : `\n❌ ${fail} 項未通過\n`);
process.exit(fail === 0 ? 0 : 1);
