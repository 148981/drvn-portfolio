/**
 * verify_run_plan_states.mjs —— 有計劃的人，不可以被告知「你還沒有計劃」。
 *
 * 舊版只看「本週有沒有訓練磚」：
 *   bricks.length === 0  →  顯示「尚未建立專屬有氧計劃」
 * 於是兩種人被冤枉：
 *   · 計劃排好了、下週一才開始 → 今天打開被說沒有計劃
 *   · 十二週整期跑完了         → 也被說沒有計劃
 * 後端更慘：那兩種情況跟「真的沒排過」回一模一樣的空物件，前端想分也分不出來。
 *
 * 這支同時驗三件事：
 *   ① 新的判斷四種狀態都對
 *   ② 舊的判斷確實會冤枉人（所以這次改動有意義）
 *   ③ 後端真的把 plan 帶回來了，前端才有得分
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(HERE, '..', p), 'utf8');

const {
    runPlanState, runPlanAction, runPlanWeekLabel,
    RUN_PLAN_NONE, RUN_PLAN_IDLE, RUN_PLAN_FINISHED, RUN_PLAN_ACTIVE,
} = await import('../src/utils/runPlanState.js');

let fail = 0;
const ok = (cond, label, extra = '') => {
    if (!cond) fail++;
    console.log(`${cond ? '✓' : '✗'} ${label}${extra ? `   ${extra}` : ''}`);
};

/* ── 四種真實情境 ───────────────────────────────────────────── */
const PLAN = (over = {}) => ({
    plan_id: 'run_abc', goal: 'race_5k_10k',
    start_date: '2026-09-21', total_weeks: 12, sessions_per_week: 4,
    current_week_index: 1, ...over,
});
const BRICK = { brick_id: 'b1', type: 'easy', status: 'pending' };

const cases = [
    ['沒排過計劃',            null,                             [],       RUN_PLAN_NONE],
    ['排好了、下週一才開始',  PLAN({ current_week_index: 1 }),  [],       RUN_PLAN_IDLE],
    ['期中某一週剛好沒排課',  PLAN({ current_week_index: 6 }),  [],       RUN_PLAN_IDLE],
    ['十二週整期跑完了',      PLAN({ current_week_index: 12 }), [],       RUN_PLAN_FINISHED],
    ['本週有課',              PLAN({ current_week_index: 3 }),  [BRICK],  RUN_PLAN_ACTIVE],
];

console.log('\n── 1 · 四種狀態 ──');
for (const [name, plan, bricks, want] of cases) {
    const got = runPlanState(plan, bricks);
    ok(got === want, `${name.padEnd(22)} → ${got}`, got === want ? '' : `（應為 ${want}）`);
}

console.log('\n── 2 · 每種狀態顯示什麼、按下去去哪 ──');
const GOAL = '5K / 10K';
const expect = [
    [RUN_PLAN_NONE,     '還沒有 / 跑步計劃',      '排一份跑步計劃', '/cardio-plan-builder'],
    [RUN_PLAN_IDLE,     '5K / 10K / 本週沒有課',  '去看課表',       '/cardio-microcycle-inbox'],
    [RUN_PLAN_FINISHED, '5K / 10K / 這一期跑完了', '排下一期',      '/cardio-plan-builder'],
];
for (const [state, shown, cta, to] of expect) {
    const a = runPlanAction(state, GOAL);
    const line = `${a.line1} / ${a.line2}`;
    ok(line === shown && a.cta === cta && a.to === to,
        `${state.padEnd(9)}「${line}」→［${a.cta}］→ ${a.to}`);
    ok(a.cta.length <= 8, `　 按鈕「${a.cta}」${a.cta.length} 字 ≤ 8`);
}
ok(!runPlanAction(RUN_PLAN_NONE, GOAL).line1.includes('尚未建立'),
    '沒排過時不再寫「尚未建立專屬有氧計劃」這種系統口吻');

console.log('\n── 3 · 週次標籤：沒有計劃就不生一個出來 ──');
ok(runPlanWeekLabel(null) === '', '沒有計劃 → 不顯示週次');
ok(runPlanWeekLabel({ plan_id: 'x' }) === '', '有計劃但沒週數 → 不顯示（不寫第 1 / 0 週）');
ok(runPlanWeekLabel(PLAN({ current_week_index: 6 })) === '第 6 / 12 週', '第 6 / 12 週');
ok(runPlanWeekLabel(PLAN({ current_week_index: 99 })) === '第 12 / 12 週', '超出總週數 → 夾在 12，不會寫第 99 週');
ok(runPlanWeekLabel(PLAN({ current_week_index: 0 })) === '第 1 / 12 週', '還沒開始 → 第 1 週，不是第 0 週');

/* ── 舊算法：證明它真的會冤枉人 ───────────────────────────── */
console.log('\n── 4 · 舊算法拿同樣的資料跑一次 ──');
const oldSaysNoPlan = (plan, bricks) => !bricks || bricks.length === 0;   // 舊版只看這個
let wronged = 0;
for (const [name, plan, bricks] of cases) {
    const oldEmpty = oldSaysNoPlan(plan, bricks);
    const reallyHasPlan = !!plan?.plan_id;
    if (oldEmpty && reallyHasPlan) {
        wronged++;
        console.log(`  · ${name} —— 舊版會說「尚未建立計劃」，其實他有 ${plan.total_weeks} 週的計劃`);
    }
}
ok(wronged >= 2, `舊版會冤枉 ${wronged} 種情境（所以這次改動有意義）`);

/* ── 後端：兩種「空」必須分得出來 ─────────────────────────── */
console.log('\n── 5 · 後端把計劃帶回來了 ──');
const api = readFileSync(join(HERE, '..', '..', 'backend', 'api_cardio_plan_endpoints.py'), 'utf8');
const fn = api.slice(api.indexOf('async def get_this_week_bricks'), api.indexOf('@router.post("/api/cardio-plan/complete-brick")'));
ok(/"plan": None, "plan_id": None/.test(fn), '真的沒有計劃 → plan 明確回 None');
ok((fn.match(/"plan": meta/g) || []).length === 2, '有計劃時（本週有課／沒課）兩條路都帶 plan meta 回去');
ok(/current_week_index/.test(fn), 'meta 帶了 current_week_index（前端才算得出第幾週）');
ok(!/return \{"week": None, "bricks": \[\], "completion": None\}\s*\n/.test(fn),
    '沒有任何一條路再回「分不出是哪種空」的舊物件');

console.log('\n── 6 · 畫面真的用這一支 ──');
const ui = read('src/components/CardioTrackerMobile.jsx');
ok(/runPlanState\(runPlan, thisWeekBricks\)/.test(ui), 'CardioTrackerMobile 呼叫 runPlanState');
ok(!/尚未建立/.test(ui), '「尚未建立專屬有氧計劃」已經不在了');
ok(!/建立 AI 有氧計劃|讓 AI 依你的目標/.test(ui), '畫面上沒有「AI」了（根本沒有用 AI）');
ok(!/No Active Plan|Virtual Coach/.test(ui), '英文標籤換成中文');
ok(!/text-\[9px\]/.test(ui.slice(ui.indexOf('isEmptyPlan ? ('), ui.indexOf('isEmptyPlan ? (') + 3000)),
    '這一塊沒有 9px 的字（最小 11px）');

console.log(fail === 0
    ? '\n✅ 排好的計劃不會被說成沒有\n'
    : `\n❌ ${fail} 項未通過\n`);
process.exit(fail === 0 ? 0 : 1);
