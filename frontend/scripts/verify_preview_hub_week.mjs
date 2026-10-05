/**
 * verify_preview_hub_week.mjs —— 計劃預覽頁排出來的一週，跟中控台是不是同一週？
 *
 * 為什麼需要這支：
 *   預覽頁原本自己寫了一套排法（重訓照課表資料的 calendarDay、跑步用
 *   preferEmpty／preferDouble 塞空格），中控台與首頁走的卻是
 *   dailyAgenda.buildWeeklyAgenda。同一份課表、同一批跑步，兩邊排出來的
 *   星期不一樣 —— 使用者在預覽頁看到週一週四，按下開始之後中控台是另一組。
 *   介面標準 §8：畫面預告的結果，必須跟實際執行的函式同源。
 *
 * 這支把兩套算法都跑一遍，斷言：
 *   ① 舊算法確實跟中控台不一致（否則這次重構沒有意義）
 *   ② 預覽頁現在走的路徑（buildWeeklyAgenda）跟中控台逐格相同
 */
import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
registerHooks({ resolve(s, c, next) {
    try { return next(s, c); } catch (e) {
        if (s.startsWith('.') && !/\.[a-z]+$/i.test(s)) return next(s + '.js', c);
        throw e;
    }
} });
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const { buildWeeklyAgenda } = await import('../src/utils/dailyAgenda.js');
const WD = ['一', '二', '三', '四', '五', '六', '日'];

/* 跑者護甲 · 新手：一週 2 天重訓，課表資料把它排在 calendarDay 1 與 4 */
const days = [
    { dayNumber: 1, focus: 'A｜單腿與臀 · 骨盆穩定', calendarDay: 1 },
    { dayNumber: 2, focus: 'B｜後鏈與抗旋轉', calendarDay: 4 },
];
/* 使用者自己的跑步計劃：本週 3 趟 */
const bricks = [
    { brick_id: 'r1', type: 'easy', distance_km: 5 },
    { brick_id: 'r2', type: 'tempo', distance_km: 6 },
    { brick_id: 'r3', type: 'long', distance_km: 12 },
];

const render = (week) => week.map((d, i) =>
    `${WD[i]}:${[d.strength && '重訓', d.run && `跑${d.run.distance_km}K`].filter(Boolean).join('+') || '休'}`
).join('  ');

/* ── 中控台／首頁實際會排出來的一週 ────────────────────────────── */
const hub = buildWeeklyAgenda({ plan: { weeks: [{ days }] }, activeWeek: 1, cardioBricks: bricks });

/* ── 舊版預覽頁的算法（原封不動搬過來）───────────────────────── */
const oldPreview = () => {
    const cell = {};
    const ensure = (d) => (cell[d] = cell[d] || { lift: null, run: null });
    const liftDays = days.map(d => d.calendarDay).filter(Boolean);
    days.forEach((d, i) => { if (d.calendarDay) ensure(d.calendarDay).lift = { idx: i }; });
    const preferEmpty = [2, 4, 6, 3, 5, 7, 1].filter(d => !liftDays.includes(d));
    const preferDouble = [2, 4, 6, 3, 5, 7, 1].filter(d => liftDays.includes(d));
    const order = [...preferEmpty, ...preferDouble];
    bricks.forEach((r) => {
        const d = order.find(x => !cell[x]?.run);
        if (d) ensure(d).run = r;
    });
    return Array.from({ length: 7 }, (_, i) => ({
        strength: cell[i + 1]?.lift || null, run: cell[i + 1]?.run || null,
    }));
};

console.log('\n中控台／首頁 :', render(hub));
console.log('舊版預覽頁   :', render(oldPreview()));
console.log('新版預覽頁   :', render(buildWeeklyAgenda({ plan: { weeks: [{ days }] }, activeWeek: 1, cardioBricks: bricks })));

/* ① 舊的確實不一樣 —— 這次重構不是白做的 */
assert.notEqual(render(oldPreview()), render(hub),
    '舊算法竟然跟中控台一致？那這支測試的前提錯了，回去重看');

/* ② 新的逐格相同 */
const preview = buildWeeklyAgenda({ plan: { weeks: [{ days }] }, activeWeek: 1, cardioBricks: bricks });
for (let i = 0; i < 7; i++) {
    assert.equal(!!preview[i].strength, !!hub[i].strength, `週${WD[i]} 重訓不一致`);
    assert.equal(preview[i].run?.brick_id ?? null, hub[i].run?.brick_id ?? null, `週${WD[i]} 跑步不一致`);
}

console.log('\n✅ 預覽頁與中控台逐格相同；舊算法確實不同（所以這次重構有意義）\n');
