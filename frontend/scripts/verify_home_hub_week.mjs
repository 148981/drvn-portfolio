/**
 * verify_home_hub_week.mjs —— 首頁排出來的一週，跟中控台是不是同一週？
 *
 * 使用者回報：中控台顯示「週二 4K」，首頁同一天顯示「休息」。
 *
 * 兩邊其實都呼叫 buildWeeklyAgenda，差別在餵進去的 inputs：
 *     中控台  { ...loadStrengthInputs, cardioBricks, dayOverrides, runTweaks }
 *     首頁    { ...loadStrengthInputs, cardioBricks }            ← 少兩個
 * 所以使用者在中控台把某趟跑步改期或減量之後，首頁完全看不到。
 * 同一支演算法配不同輸入，一樣會得到兩個答案（介面標準 §8）。
 */
import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
registerHooks({ resolve(s, c, next) {
    try { return next(s, c); } catch (e) {
        if (s.startsWith('.') && !/\.[a-z]+$/i.test(s)) return next(s + '.js', c);
        throw e;
    }
} });
const store = {};
globalThis.localStorage = {
    getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; },
};

const A = await import('../src/utils/dailyAgenda.js');
const WD = ['一', '二', '三', '四', '五', '六', '日'];
const UID = 'u_test';

/* 重訓 3 天（推／拉／腿）＋ 跑步 2 趟 */
store[`currentPlan_${UID}`] = JSON.stringify({
    weeks: [{ days: [
        { dayNumber: 1, focus: '推力強化' },
        { dayNumber: 2, focus: '拉力強化' },
        { dayNumber: 3, focus: '腿部強化' },
    ] }],
});
const bricks = [
    { brick_id: 'r1', type: 'easy', distance_km: 3 },
    { brick_id: 'r2', type: 'easy', distance_km: 4 },
];
store[`drvn_week_bricks_${UID}`] = 'x';   // 佔位，下面直接用 cacheWeekBricks 寫正確格式
A.cacheWeekBricks(UID, bricks);

/* 使用者在中控台把 r2 那趟改到週二（idx 1） */
store[`u_${UID}_run_day_overrides`] = JSON.stringify({ r2: 1 });

const render = (week) => week.map((d, i) =>
    `${WD[i]}:${[d.strength && '重訓', d.run && `跑${d.run.distance_km}K`].filter(Boolean).join('+') || '休'}`
).join('  ');

/* ── 中控台實際排出來的 ───────────────────────────────────── */
const hub = A.buildWeeklyAgenda(A.loadWeekInputs(UID));

/* ── 舊版首頁：少了 dayOverrides 與 runTweaks ─────────────── */
const oldHome = A.buildWeeklyAgenda({
    ...A.loadStrengthInputs(UID),
    cardioBricks: A.loadCachedBricks(UID),
});

/* ── 新版首頁：同一份輸入 ─────────────────────────────────── */
const home = A.getTodayAgenda(A.loadWeekInputs(UID, { cardioBricks: A.loadCachedBricks(UID) })).week;

console.log('\n中控台     :', render(hub));
console.log('舊版首頁   :', render(oldHome));
console.log('新版首頁   :', render(home));

assert.notEqual(render(oldHome), render(hub),
    '舊版首頁竟然跟中控台一致？那這支測試的前提錯了，回去重看');

for (let i = 0; i < 7; i++) {
    assert.equal(!!home[i].strength, !!hub[i].strength, `週${WD[i]} 重訓不一致`);
    assert.equal(home[i].run?.brick_id ?? null, hub[i].run?.brick_id ?? null, `週${WD[i]} 跑步不一致`);
}
console.log('\n✅ 首頁與中控台逐格相同；舊版確實不同（改期在首頁會看不到）\n');
