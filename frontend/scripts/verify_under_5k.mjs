/**
 * verify_under_5k.mjs —— 「我還跑不到 5K」的人，拿到的必須是他跑得完的課表。
 *
 * 使用者問的原話：
 *   「如果前一個選項選新手 那會不會圖四這邊根本跑不到５ｋ那他要怎麼寫」
 *
 * 問題不只是少一個選項。舊版的難度推導「只往上抬、不往下壓」：
 *   手選中階 ＋ 週跑量填 12km → 中階 → 第 1 週三趟各 5 公里。
 * 對一個連續 5 公里跑不完的人來說，第 1 週就是做不到的量，
 * 而做不到的第 1 週不會有第 2 週。
 *
 * 所以「我還跑不到 5K」是硬地板：跑齡、週跑量、手選級別、目標，
 * 通通蓋不過它。這支證明地板真的擋得住，而且舊版真的擋不住。
 */
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, next) {
    try { return next(s, c); } catch (e) {
        if (s.startsWith('.') && !/\.[a-z]+$/i.test(s)) return next(s + '.js', c);
        throw e;
    }
} });

const { generateCardioPlan } = await import('../src/utils/cardioPlanFusionEngine.js');
const { deriveRunnerLevel, BEGINNER_GUARD } = await import('../src/utils/runnerLevel.js');

let fail = 0;
const ok = (cond, label, extra = '') => {
    if (!cond) fail++;
    console.log(`${cond ? '✓' : '✗'} ${label}${extra ? `   ${extra}` : ''}`);
};

const week1 = (plan) => plan.weeks[0];
const runs = (w) => (w.bricks || []).filter((b) => b.subtype !== 'strength' && b.type !== 'strength');
const longestRun = (w) => Math.max(0, ...runs(w).map((b) => Number(b.distance_km) || 0));

/* ════════════════════════════════════════════════════════════════
   1 · 地板：什麼都蓋不過「我還跑不到 5K」
   ════════════════════════════════════════════════════════════════ */
console.log('\n── 1 · 硬地板擋得住誰 ──');
const attempts = [
    ['手選進階',        { currentLevel: 'advanced' }],
    ['手選中階',        { currentLevel: 'intermediate' }],
    ['跑齡填 5 年',     { runningYears: 5 }],
    ['週跑量填 40km',   { currentWeeklyKm: 40 }],
    ['目標選全馬',      { goal: 'race_full' }],
    ['三個一起來',      { currentLevel: 'advanced', runningYears: 5, currentWeeklyKm: 40 }],
];
for (const [name, over] of attempts) {
    const lv = deriveRunnerLevel({ canRun5k: false, ...over });
    ok(lv.level === 'beginner', `${name.padEnd(14)}＋「還跑不到 5K」→ ${lv.level}`);
}
const normal = deriveRunnerLevel({ canRun5k: true, runningYears: 5, currentWeeklyKm: 40 });
ok(normal.level === 'advanced', `跑得完 5K ＋ 跑齡 5 年 ＋ 40km/週 → ${normal.level}（地板不會誤傷正常人）`);
const unknown = deriveRunnerLevel({ canRun5k: null, currentWeeklyKm: 40, runningYears: 5 });
ok(unknown.level === 'advanced', `「未測過 5K」不等於「跑不到」→ ${unknown.level}`);

/* ════════════════════════════════════════════════════════════════
   2 · 課表：第 1 週真的跑得完
   ════════════════════════════════════════════════════════════════ */
console.log('\n── 2 · 第 1 週實際排出什麼 ──');
const CFG = {
    goal: 'race_5k_10k', totalWeeks: 12, sessionsPerWeek: 4,
    currentLevel: 'intermediate',       // ← 使用者手選的，就是問題所在
    currentWeeklyKm: 12, baselinePace5K: null, includeStrength: false,
    startDate: '2026-09-21',
};
const before = generateCardioPlan({ ...CFG });                    // 舊行為（沒有這個訊號）
const after = generateCardioPlan({ ...CFG, canRun5k: false });    // 說了「我還跑不到 5K」

const b1 = week1(before), a1 = week1(after);
console.log(`  舊：第 1 週 ${b1.target_mileage_km} km、${runs(b1).length} 趟、最長一趟 ${longestRun(b1)} km`);
console.log(`  新：第 1 週 ${a1.target_mileage_km} km、${runs(a1).length} 趟、最長一趟 ${longestRun(a1)} km`);

ok(longestRun(b1) > BEGINNER_GUARD.week1MaxSingleKm,
    `舊版第 1 週有 ${longestRun(b1)} km 的單趟 —— 跑不到 5K 的人做不到`);
ok(longestRun(a1) <= BEGINNER_GUARD.week1MaxSingleKm,
    `新版每趟 ≤ ${BEGINNER_GUARD.week1MaxSingleKm} km（最長 ${longestRun(a1)} km）`);
ok(runs(a1).length <= BEGINNER_GUARD.week1MaxSessions,
    `新版第 1 週 ≤ ${BEGINNER_GUARD.week1MaxSessions} 趟（實際 ${runs(a1).length} 趟）`);
ok(a1.target_mileage_km < b1.target_mileage_km,
    `第 1 週總量從 ${b1.target_mileage_km} km 降到 ${a1.target_mileage_km} km`);

console.log('\n── 3 · 前兩週不排間歇與節奏 ──');
const quality = (w) => runs(w).filter((b) => ['interval', 'tempo'].includes(b.subtype)).length;
ok(quality(after.weeks[0]) === 0 && quality(after.weeks[1]) === 0,
    `第 1、2 週的間歇＋節奏 = ${quality(after.weeks[0])}、${quality(after.weeks[1])} 堂`);

console.log('\n── 4 · 目標不被拒絕，只是從第 1 階段開始 ──');
const full = generateCardioPlan({ ...CFG, goal: 'race_full', canRun5k: false });
ok(full.weeks.length === 12, `選全馬照樣排得出 ${full.weeks.length} 週（不潑冷水）`);
ok(longestRun(week1(full)) <= BEGINNER_GUARD.week1MaxSingleKm,
    `但第 1 週最長一趟還是 ${longestRun(week1(full))} km`);

console.log('\n── 5 · 選項本身 ──');
const { readFileSync } = await import('node:fs');
const { fileURLToPath } = await import('node:url');
const { dirname, join } = await import('node:path');
const HERE = dirname(fileURLToPath(import.meta.url));
const ui = readFileSync(join(HERE, '..', 'src/components/CardioPlanBuilder.jsx'), 'utf8');
ok(/id: 'under5k', label: '我還跑不到 5K'/.test(ui), '圖四多了「我還跑不到 5K」');
ok(/id: 'untested'/.test(ui) && /canRun5k: null/.test(ui),
    '「未測過 5K」是另一個選項，canRun5k 為 null（不知道 ≠ 跑不到）');
ok(/selectedPaceOption\?\.id === opt\.id/.test(ui),
    '用 id 判斷亮哪一顆（兩個選項的配速都是 null，用配速會認錯人）');
// 建立頁改走 generateNextCyclePlan（換期的過渡週只有它會套上；沒有換期設定時等同 generateCardioPlan）
ok(/generate(?:CardioPlan|NextCyclePlan)\(\{ \.\.\.\(config \|\| \{\}\) \}\)/.test(ui),
    '週量曲線跟存檔用同一份 config（少傳一個欄位就會畫錯一條線）');

console.log(fail === 0
    ? '\n✅ 跑不到 5K 的人，第 1 週跑得完\n'
    : `\n❌ ${fail} 項未通過\n`);
process.exit(fail === 0 ? 0 : 1);
