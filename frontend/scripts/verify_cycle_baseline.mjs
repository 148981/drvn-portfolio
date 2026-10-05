/**
 * verify_cycle_baseline.mjs —— 這一期的「起點體重」不可以是編出來的數字。
 *
 * 實際畫面上長出來的樣子（使用者回報）：
 *     目前體重 65.2 KG（2 天前量的）
 *     起點 70 ／ 今天該到 70.3 ／ 目標 78.9
 * 三個數字自己打架。原因是建立計劃時還沒量過體重，NutritionEngine 用
 * `parseFloat(weight) || 70` 把 70 頂上去存進計劃，而 cutProgress 一律
 * 優先讀計劃裡的 currentWeight —— 那個假的 70 就永遠蓋過真正量到的 65.2，
 * 整條配速跟著算歪。
 *
 * 斷言：只要有真實量測，起點就必須是真實量測，不是計劃裡存的值。
 */
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, next) {
    try { return next(s, c); } catch (e) {
        if (s.startsWith('.') && !/\.[a-z]+$/i.test(s)) return next(s + '.js', c);
        throw e;
    }
} });

const DAY = 86400000;
const store = {};
globalThis.localStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
};

const { computeCutProgress } = await import('../src/utils/cutProgress.js');

const UID = 'u_test';
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
const now = new Date('2026-09-14T00:00:00Z').getTime();
const committedAt = now - 5 * DAY;

/* cutProgress 讀的是 inbody_local_<uid>，一列長這樣：
   { measurement_date: 'YYYY-MM-DD', weight_kg: number }。日期會被切到「天」。 */
const setMeasures = (rows) => {
    store[`inbody_local_${UID}`] = JSON.stringify(
        rows.map(([ms, kg]) => ({ measurement_date: dayKey(ms), weight_kg: kg }))
    );
};

let fail = 0;
const t = (name, cond, extra = '') => {
    if (!cond) fail++;
    console.log(`${cond ? '✓' : '✗'} ${name}${extra ? `   ${extra}` : ''}`);
};

const plan = {
    goalType: 'bulk', committedAt,
    currentWeight: 70,        // ← 建立計劃時沒量過，被 || 70 頂上來的假值
    targetWeight: 78.9, pace: 0.3,
};

/* A：使用者其實量過 65.2（開始前一天）→ 起點必須是 65.2，不是 70 */
setMeasures([[committedAt - DAY, 65.2], [now - 2 * DAY, 65.2]]);
const a = computeCutProgress(UID, plan, new Date(now));
t('有真實量測 → 起點 65.2，不是計劃裡的 70', a.startWeight === 65.2, `startWeight = ${a.startWeight}`);
t('  └ 起點正確之後，位移不再是憑空的 −4.8', Math.abs(a.movedKg) < 0.01, `movedKg = ${a.movedKg}`);

/* B：一次都沒量過 → 才退回計劃裡存的值（畫面至少還有東西可顯示） */
setMeasures([]);
const b = computeCutProgress(UID, plan, new Date(now));
t('完全沒量過 → 退回計劃裡的值 70', b.startWeight === 70, `startWeight = ${b.startWeight}`);

/* C：開始之前沒量過、之後才量 → 用之後第一筆，不是假的 70 */
setMeasures([[committedAt + 2 * DAY, 66.0]]);
const c = computeCutProgress(UID, plan, new Date(now));
t('開始後才量 → 起點 66.0', c.startWeight === 66.0, `startWeight = ${c.startWeight}`);

console.log(fail ? `\n❌ ${fail} 個不合格\n` : '\n✅ 起點永遠是真實量測，編出來的預設值蓋不過去\n');
process.exit(fail ? 1 : 0);
