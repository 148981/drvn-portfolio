/**
 * verify_drvn_handle.mjs —— 還沒取名字的人，預設代號算得對不對。
 *
 * 這個名字會出現在排行榜、社團、留言署名，而且是在登入最早期算出來的：
 * 一旦丟錯（例如存檔壞掉的 JSON）整個登入流程就掛了。所以四種輸入都要測，
 * 包含壞資料與沒有 userId。
 */
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, next) {
    try { return next(s, c); } catch (e) {
        if (s.startsWith('.') && !/\.[a-z]+$/i.test(s)) return next(s + '.js', c);
        throw e;
    }
} });
const store = {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: () => {}, removeItem: () => {} };
const { drvnHandle, realName } = await import('../src/utils/drvnHandle.js');

const KEY = 'u_user_a3f2_onboarding_cardio_plan';
const set = (v) => { if (v === null) delete store[KEY]; else store[KEY] = typeof v === 'string' ? v : JSON.stringify(v); };

const cases = [
    ['有跑步計劃',          { plan_id: 'run_9' }, 'DRVNNER #A3F2'],
    ['跑步計劃只有 id',     { id: 'run_9' },      'DRVNNER #A3F2'],
    ['沒有跑步計劃',        null,                 'DRVNST #A3F2'],
    ['有 key 但空物件',     {},                   'DRVNST #A3F2'],
    ['存檔壞掉不可以丟錯',  '{壞掉的',            'DRVNST #A3F2'],
];

let fail = 0;
for (const [name, plan, want] of cases) {
    set(plan);
    let got;
    try { got = drvnHandle('user_a3f2'); } catch (e) { got = `丟錯：${e.message}`; }
    const ok = got === want;
    if (!ok) fail++;
    console.log(`${ok ? '✓' : '✗'} ${name.padEnd(20)} → ${got}${ok ? '' : `   （應為 ${want}）`}`);
}
set(null);
const noUid = drvnHandle(null);
const okNoUid = noUid === 'DRVNST #0000';
if (!okNoUid) fail++;
console.log(`${okNoUid ? '✓' : '✗'} ${'沒有 userId'.padEnd(20)} → ${noUid}`);

/* ── 佔位字必須被當成「沒有名字」──────────────────────────────
   舊版訪客 JWT 的 name claim 是「訪客用戶」。這一關沒擋住，首頁就會
   一直顯示它、預設代號那行永遠跑不到 —— 這正是實際發生過的 bug。 */
for (const v of ['訪客用戶', '訪客', 'User', 'guest', 'GUEST', '我', 'undefined', '  ', '']) {
    const got = realName(v);
    const ok = got === '';
    if (!ok) fail++;
    console.log(`${ok ? '✓' : '✗'} 佔位字 ${JSON.stringify(v).padEnd(12)} → 當成沒有名字${ok ? '' : `（卻回傳 ${JSON.stringify(got)}）`}`);
}
/* 真的名字不可以被誤殺 */
for (const v of ['Mike', '陳冠甫', 'userX', '訪客小明']) {
    const got = realName(v);
    const ok = got === v;
    if (!ok) fail++;
    console.log(`${ok ? '✓' : '✗'} 真名   ${JSON.stringify(v).padEnd(12)} → ${JSON.stringify(got)}`);
}

console.log(fail ? `\n❌ ${fail} 個不合格\n` : '\n✅ 預設代號與佔位字判斷全對\n');
process.exit(fail ? 1 : 0);
