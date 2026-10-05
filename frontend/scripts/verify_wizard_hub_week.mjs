/**
 * verify_wizard_hub_week.mjs —— 精靈預告的一週 = 中控台實際排的一週。
 *
 * 事故：跑步精靈說「預定排在 二／四／六」，中控台排出來完全不同，
 * 而且精靈畫面上寫「質量跑另外避開腿日隔天」—— 它用的 proposeComplementDays
 * 參數只有 { takenDays, need }，拿不到課種也不知道哪天是腿日，
 * 結構上就做不到那件事。文案在承諾程式做不到的功能。
 *
 * 現在兩個精靈都走 dailyAgenda.previewWeek → buildWeeklyAgenda，
 * 跟中控台、首頁同一支。這支驗證它們真的逐格相同。
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

const DA = await import('../src/utils/dailyAgenda.js');
const PN = await import('../src/utils/planNaming.js');
const WD = ['一', '二', '三', '四', '五', '六', '日'];
const UID = 'u_w';
const render = (w) => w.map((d, i) =>
    `${WD[i]}:${[d.strength && '重訓', d.run && (d.run.subtype || d.run.type)].filter(Boolean).join('+') || '休'}`
).join('  ');

let fail = 0;
const t = (name, cond, extra = '') => { if (!cond) fail++; console.log(`${cond ? '✓' : '✗'} ${name}${extra ? `\n    ${extra}` : ''}`); };

/* ── 情境 A：已有重訓計劃，跑步精靈預告「跑步會排哪幾天」 ───────── */
const strengthDays = PN.previewSplitFocus(3);          // 推 / 拉 / 腿
store[`currentPlan_${UID}`] = JSON.stringify({ weeks: [{ days: strengthDays }] });
const runBricks = DA.previewBricks(['tempo', 'easy', 'long']);

const wizardA = DA.previewWeek(UID, { runBricks });
DA.cacheWeekBricks(UID, runBricks);                     // 計劃確認後就是這批磚
const hubA = DA.buildWeeklyAgenda(DA.loadWeekInputs(UID));

console.log('\n── 跑步精靈（已有重訓計劃）──');
console.log('  精靈預告 :', render(wizardA));
console.log('  中控台實排:', render(hubA));
t('跑步精靈預告 = 中控台實排', render(wizardA) === render(hubA));

/* 排程真的有做到畫面宣稱的事 */
const legIdx = hubA.findIndex((d) => d.strength?.legDay);
t('課表裡認得出腿日', legIdx >= 0, `腿日在週${WD[legIdx]}`);
const longIdx = hubA.findIndex((d) => d.run?.type === 'long');
t('長跑排在週末（六或日）', longIdx === 5 || longIdx === 6, `長跑在週${WD[longIdx]}`);

/* ── 情境 B：已有跑步計劃，健身精靈預告「跑步會被排去哪」 ───────── */
store[`currentPlan_${UID}`] = 'null';                   // 還沒有重訓計劃
DA.cacheWeekBricks(UID, runBricks);
const wizardB = DA.previewWeek(UID, { strengthDays: PN.previewSplitFocus(3) });
store[`currentPlan_${UID}`] = JSON.stringify({ weeks: [{ days: PN.previewSplitFocus(3) }] });
const hubB = DA.buildWeeklyAgenda(DA.loadWeekInputs(UID));

console.log('\n── 健身精靈（已有跑步計劃）──');
console.log('  精靈預告 :', render(wizardB));
console.log('  中控台實排:', render(hubB));
t('健身精靈預告 = 中控台實排', render(wizardB) === render(hubB));

/* ── 舊的那支不可以再回來 ──────────────────────────────────── */
const TF = await import('../src/utils/trainingFocus.js');
t('proposeComplementDays 已經移除', typeof TF.proposeComplementDays === 'undefined');

console.log(fail ? `\n❌ ${fail} 個不合格\n` : '\n✅ 兩個精靈與中控台走同一支排程\n');
process.exit(fail ? 1 : 0);
