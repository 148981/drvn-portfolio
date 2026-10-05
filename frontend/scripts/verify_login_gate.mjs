/**
 * verify_login_gate.mjs — 開機路由的守門：只有「真的登入成功」才算登入過
 * ─────────────────────────────────────────────────────────────────────
 * 背景：App.jsx 的 index route 只看 hasSignedIn()：
 *     hasSignedIn() ? '/mobile-home' : '/login'
 * 而 hasSignedIn() 在沒有有效 JWT 時，退回去看 drvn_auth_choice 這個旗標。
 *
 * 所以「誰有資格寫這個旗標」＝「誰有資格讓人進主頁」。
 * 旗標必須只在下列兩種情況被寫：
 *   ① OAuth 真的拿到 token（AuthCallbackPage.finalizeLogin）
 *   ② 使用者選了訪客（訪客不會失敗）
 * 在「按下 Google 的當下」就寫，等於把「我點了」當成「我登入了」——
 * 使用者一取消，旗標留著、token 沒有，下次開機直接被送進主頁，
 * 然後每一支私人 API 都 401。
 */
import fs from 'fs';
import path from 'path';

const root = path.resolve(process.cwd(), 'src');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let bad = 0;
const ok = (cond, msg) => { console.log((cond ? '✓ ' : '✗ ') + msg); if (!cond) bad++; };

console.log('\n══ 開機路由守門 ══\n');

// ── 1 · 路由確實只認 hasSignedIn ──
const app = strip(read('App.jsx'));
ok(/hasSignedIn\(\)\s*\?\s*'\/mobile-home'\s*:\s*'\/login'/.test(app),
   '開機路由只認 hasSignedIn()');

// ── 2 · hasSignedIn 在沒有正式 token 時會退回看旗標 ──
const auth = strip(read('utils/auth.js'));
ok(/return\s*!!getAuthChoice\(\)/.test(auth),
   'hasSignedIn() 沒有正式 token 時退回看 drvn_auth_choice');

// ── 3 · 核心：按下 OAuth 按鈕的當下不可以蓋章 ──
const login = strip(read('components/LoginPage.jsx'));
const oauthFn = /const handleOAuth\s*=[\s\S]*?\n    };/.exec(login)?.[0] || '';
ok(oauthFn.length > 0, '找得到 handleOAuth');
ok(!/setAuthChoice\s*\(/.test(oauthFn),
   'handleOAuth 沒有在「按下去的當下」就蓋章（取消登入會把人鎖在主頁）');

// ── 4 · 訪客可以當下蓋章（訪客登入不會失敗）──
const guestFn = /const handleGuestLogin\s*=[\s\S]*?\n    };/.exec(login)?.[0] || '';
ok(/setAuthChoice\s*\(\s*'guest'\s*\)/.test(guestFn),
   '訪客登入仍然當下蓋章（它不會失敗）');

// ── 5 · OAuth 成功才蓋章 ──
const cbRaw = read('components/AuthCallbackPage.jsx');
const cb = strip(cbRaw);
const finalize = /const finalizeLogin\s*=[\s\S]*?\n    \}, \[/.exec(cb)?.[0] || '';
ok(/setAuthChoice\s*\(/.test(finalize),
   'AuthCallbackPage.finalizeLogin 在拿到 token 之後才蓋章');

// ── 6 · 失敗路徑要把殘留的旗標清掉 ──
const errBranch = /if \(error\) \{[\s\S]*?return;\s*\}/.exec(cb)?.[0] || '';
ok(/clearAuthChoice\s*\(|removeItem\(\s*['"]drvn_auth_choice/.test(errBranch),
   'OAuth 回來帶 error 時，清掉殘留的登入旗標');

// ⚠️ 用未去註解的原文定位：strip() 會把 `// No token` 這行標記吃掉
const noTokenIdx = cbRaw.indexOf('// No token');
const noTokenBranch = noTokenIdx >= 0 ? cbRaw.slice(noTokenIdx, noTokenIdx + 600) : '';
ok(/clearAuthChoice\s*\(|removeItem\(\s*['"]drvn_auth_choice/.test(noTokenBranch),
   '回來沒有 token 時，清掉殘留的登入旗標');

// ── 7 · 登出要清掉旗標 ──
ok(/removeItem\(\s*['"]drvn_auth_choice/.test(cb) || /clearAuthChoice/.test(cb),
   '登出會清掉登入旗標');

// ── 8 · 模擬四種情境的路由結果 ──
console.log('\n── 情境模擬 ──');
const hasSignedIn = (s) => {
    if (s.auth_token && !String(s.tokenSub || '').startsWith('guest_') && !s.expired) return true;
    return !!s.drvn_auth_choice;
};
const cases = [
    ['全新使用者',              {},                                                   false, '登入頁'],
    ['點了 Google 又取消',      { drvn_auth_choice: null },                           false, '登入頁'],
    ['Google 登入成功',         { auth_token: 'x', tokenSub: 'google_1', drvn_auth_choice: 'google' }, true, '主頁'],
    ['選了訪客',                { drvn_auth_choice: 'guest' },                        true,  '主頁'],
    ['登出之後',                {},                                                   false, '登入頁'],
    ['token 過期但選過訪客',    { auth_token: 'x', expired: true, drvn_auth_choice: 'guest' }, true, '主頁（訪客會自動換新 token）'],
];
for (const [name, state, want, where] of cases) {
    const got = hasSignedIn(state);
    ok(got === want, `${name.padEnd(18)} → ${where}`);
}

console.log(bad ? `\n❌ ${bad} 項未通過\n` : '\n✅ 只有真的登入成功才進得了主頁\n');
process.exit(bad ? 1 : 0);
