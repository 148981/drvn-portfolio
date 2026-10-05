/**
 * verify_apple_signin.mjs —— Sign in with Apple 是上架的必要條件，不是選配。
 * ─────────────────────────────────────────────────────────────────────
 * App Store 審查指南 4.8：只要 App 用 Google / Facebook / LINE 這類第三方登入
 * 建立或驗證主要帳號，就必須同時提供 Sign in with Apple。少一個就退件。
 *
 * 這支守三件事：
 *   ① 登入頁真的有 Apple 這個選項（而且不是只有圖示）
 *   ② 後端 /api/auth/apple 是真的實作，不是「直接回 not_configured」的樁
 *   ③ 後端會吐的每一個錯誤代碼，前端都有中文可以講給使用者聽
 */
import fs from 'fs';
import path from 'path';

const FE = path.resolve(process.cwd(), 'src');
const BE = path.resolve(process.cwd(), '..', 'backend');
const read = (p) => fs.readFileSync(p, 'utf8');

let bad = 0;
const ok = (cond, msg) => { console.log((cond ? '✓ ' : '✗ ') + msg); if (!cond) bad++; };

console.log('\n══ Sign in with Apple（App Store 4.8）══\n');

const login = read(path.join(FE, 'components/LoginPage.jsx'));
const providers = [...login.matchAll(/id:\s*'(line|google|facebook|apple)'/g)].map(m => m[1]);
const third = providers.filter(p => p !== 'apple');
ok(providers.includes('apple'),
   `登入頁提供 Apple（目前有：${providers.join(' / ') || '無'}）`);
ok(third.length === 0 || providers.includes('apple'),
   '有第三方登入就一定有 Apple —— 不然 4.8 直接退件');

const auth = read(path.join(BE, 'api_auth.py'));

ok(/@router\.get\("\/apple"\)/.test(auth), '後端有 GET /api/auth/apple');
ok(/@router\.post\("\/apple\/callback"/.test(auth),
   '後端有 POST /api/auth/apple/callback（Apple 是跨站 form_post 打回來的）');
ok(/response_mode["']?\s*:\s*["']form_post["']/.test(auth),
   '授權請求用 form_post（拿得到姓名與 Email）');
ok(/scope["']?\s*:\s*["']name email["']/.test(auth), '有要 name 與 email');

// ② 不能是樁：/apple 一定要在「設定齊全時」導去 Apple，不是無條件回錯誤
const appleFn = /@router\.get\("\/apple"\)[\s\S]*?\n@router/.exec(auth)?.[0] || '';
ok(/APPLE_AUTH_URL/.test(appleFn),
   '/apple 會真的把人帶去 Apple（不是無條件回 apple_not_configured 的樁）');
ok(/_apple_configured\(\)/.test(appleFn),
   '金鑰沒設好時誠實回報，不把人丟進一半的流程');

// ③ id_token 一定要驗章 —— 不驗等於誰都能偽造登入
ok(/jwt\.decode\(\s*id_token,\s*key,[\s\S]{0,160}?algorithms=\["RS256"\]/.test(auth),
   'id_token 用 Apple 公鑰驗章');
ok(/audience=APPLE_SERVICES_ID/.test(auth) && /issuer=APPLE_ISSUER/.test(auth),
   '驗章有比對 audience 與 issuer');
ok(!/id_token[\s\S]{0,200}verify_signature["']?\s*:\s*False/.test(auth),
   '沒有任何地方跳過 id_token 的簽章驗證');

// client_secret 必須現簽（Apple 不吃固定字串）
ok(/algorithm="ES256"/.test(auth) && /headers=\{"kid": APPLE_KEY_ID\}/.test(auth),
   'client_secret 是用 .p8 現簽的 ES256 JWT');

// state 不靠 session（跨站 POST 帶不上 SameSite=Lax 的 cookie）
const cb = /@router\.post\("\/apple\/callback"[\s\S]*?\n@router/.exec(auth)?.[0] || '';
ok(cb.length > 0 && !/request\.session/.test(cb),
   'callback 不依賴 session（跨站 POST 帶不上 cookie）');
ok(/_apple_read_state\(/.test(cb), 'native / 前端網址是從簽過的 state 還原');

// ④ 後端吐的錯誤代碼，前端都要有中文
const codes = [...auth.matchAll(/make_error_redirect\(\s*["']([a-z_]+)["']/g)].map(m => m[1]);
const cbPage = read(path.join(FE, 'components/AuthCallbackPage.jsx'));
const zhBlock = /const ERROR_ZH = \{[\s\S]*?\n\};/.exec(cbPage)?.[0] || '';
const missing = [...new Set(codes)].filter(c => !zhBlock.includes(`${c}:`));
ok(missing.length === 0,
   `每個錯誤代碼都有中文說法${missing.length ? `（缺：${missing.join('、')}）` : ''}`);
ok(!/❌|✅/.test(cbPage.slice(cbPage.indexOf('return ('))),
   '登入過場畫面沒有 emoji（Product OS 鐵律）');

console.log(bad ? `\n❌ ${bad} 項未通過 —— 這會擋上架\n` : '\n✅ Apple 登入這條路是完整的\n');
process.exit(bad ? 1 : 0);
