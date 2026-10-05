/**
 * verify_security_hardening.mjs —— 2026-09-10 資安稽核修掉的東西不准被改回去。
 * ─────────────────────────────────────────────────────────────────────
 * 那份稽核的結論是「單一根因」：後端相信網址裡的 user_id。
 * 修法是全域攔截 —— 用 JWT 的身分覆蓋掉 handler 收到的 user_id。
 * 這種修法最怕的就是「後來有人覺得擋到自己，把它關掉」，
 * 所以每一道防線在這裡都有一條斷言。
 *
 * 順便守住 console-leak：正式版不能把 console.log 打包進去。
 */
import fs from 'fs';
import path from 'path';

const FE = path.resolve(process.cwd());
const BE = path.resolve(process.cwd(), '..', 'backend');
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };

let bad = 0;
const ok = (cond, msg) => { console.log((cond ? '✓ ' : '✗ ') + msg); if (!cond) bad++; };

console.log('\n══ 資安防線（2026-09-10 稽核）══\n');

// ── C-2 / I-1 · 全域身分攔截 ──
const guard = read(path.join(BE, 'identity_guard.py'));
ok(guard.length > 0, 'backend/identity_guard.py 還在');
ok(/IDENTITY_GUARD_MODE.*?\|\|\s*["']enforce["']|or\s+["']enforce["']/.test(guard),
   '預設是 enforce（沒設環境變數就是真的擋，不是只記錄）');
const main = read(path.join(BE, 'main.py'));
ok(/_harden_identity\(app\)/.test(main), 'main.py 有真的呼叫 harden_identity(app)');
ok(/CURRENT_USER_ID/.test(main), 'middleware 有把身分放進 ContextVar 給攔截層用');

// ── P0 · /api/user/{uid} 的保留字要從路由表推導 ──
ok(/_reserved_user_segments\(app\)/.test(main),
   '保留字從 app 自己的路由表推導（之後新增 /api/user/xxx 不會再踩雷）');

// ── I-3 · chunked 繞過上傳上限 ──
ok(/transfer-encoding[\s\S]{0,120}chunked[\s\S]{0,200}411/.test(main),
   '一般 API 用 chunked 又沒帶 Content-Length → 411');

// ── C-1 · 使用者搜尋只吃完整好友碼 ──
const friends = read(path.join(BE, 'api_friends.py'));
const searchRaw = /async def search_users\([\s\S]*?\n(?=@router|async def |def )/.exec(friends)?.[0] || '';
// ⚠️ 這支的 docstring「引用了舊的漏洞寫法」當說明，掃之前一定要把註解拿掉，
//    否則會把解釋當成漏洞本身（第一版的我就誤報了）。
const searchFn = searchRaw
    .replace(/\"\"\"[\s\S]*?\"\"\"/g, '')
    .replace(/'''[\s\S]*?'''/g, '')
    .replace(/^\s*#.*$/gm, '');
ok(searchRaw.length > 0, '找得到 search_users');
ok(!/in\s+uid\.lower\(\)|in\s+user_id\.lower\(\)/.test(searchFn),
   '搜尋不再拿查詢字串去比對 user_id 子字串（那是整條越權鏈的第一把鑰匙）');
ok(!/in\s+name\.lower\(\)/.test(searchFn),
   '也不做名稱模糊比對');
ok(/\"#\"\s+not in raw|'#'\s+not in raw/.test(searchFn),
   '沒有完整好友碼（名稱#四碼）就直接回空陣列');
ok((friends.match(/30\/minute/g) || []).length >= 2,
   '搜尋與好友碼查詢都有 30/min 限流（擋四碼暴力猜）');

// ── A-1 · 重運算端點限流 ──
const pose = read(path.join(BE, 'api_pose_analysis.py'));
ok((pose.match(/12\/hour/g) || []).length >= 3,
   '三支吃 CPU 的影片分析端點都有 12/hour 限流');

// ── 前端 · raw fetch 自動補 Authorization ──
ok(read(path.join(FE, 'src/utils/apiAuthHeader.js')).length > 0,
   'apiAuthHeader.js 還在（23 處 raw fetch 靠它補 token）');
ok(/utils\/apiAuthHeader/.test(read(path.join(FE, 'src/main.jsx'))),
   'main.jsx 有載入它 —— 沒載入等於沒修');

// ── 文案 · 產品不能宣稱做得到模糊搜尋 ──
const follow = read(path.join(FE, 'src/components/SocialFeed/FollowSuggestions.jsx'));
ok(/完整好友碼/.test(follow), '搜尋框說的是「完整好友碼」，不是「搜尋名稱或 ID」');
ok(!/No users found/.test(follow + read(path.join(FE, 'src/components/SocialPage.jsx'))),
   '搜尋空狀態沒有英文 system-speak');

// ── 正式環境設定：不對就不要起來 ──
const cfg = read(path.join(BE, 'config.py'));
ok(/IS_PRODUCTION/.test(cfg) && /raise RuntimeError/.test(cfg),
   'production 設定不安全時後端拒絕啟動（fail-fast）');
ok(/JWT_SECRET[\s\S]{0,400}len\([\s\S]{0,40}<\s*32/.test(cfg),
   '機密長度不足 32 會擋下來');
ok(/CORS_ALLOW_ORIGINS[\s\S]{0,200}problems\.append/.test(cfg),
   'production 沒設 CORS 白名單會擋下來');
ok(/API_BASE_URL[\s\S]{0,900}localhost/.test(cfg),
   '對外網址還指著本機會被抓出來');
ok(/startswith\("https:\/\/"\)/.test(cfg),
   '對外網址不是 https 會被抓出來（Apple 的 Return URL 只收 https）');
// ⚠️ 2026-09-21：這兩個值原本是 fail-fast，結果正式機沒設就整台 502 ——
//    把「一個登入方式不能用」升級成「全站掛掉」。現在只有 Apple 設定好時才擋。
ok(/_apple_ready/.test(cfg) && /problems\.extend\(url_problems\)/.test(cfg),
   '對外網址只有在 Apple 已設定時才擋啟動（沒設 Apple 時不能把整台弄掛）');
ok(/https_only=settings\.IS_PRODUCTION/.test(main),
   'OAuth 的 session cookie 在正式環境標成 Secure');
ok(fs.existsSync(path.join(BE, 'check_production_config.py')),
   '有上線前設定自檢腳本 check_production_config.py');

// ── console-leak · 正式版不准帶 console.log ──
const vite = read(path.join(FE, 'vite.config.js'));
ok(/minify:\s*['"]terser['"]/.test(vite), 'production 用 terser 壓縮');
ok(/pure_funcs[\s\S]{0,160}console\.log/.test(vite),
   'console.log 會在 build 時被剝掉');
ok(/drop_debugger:\s*true/.test(vite), 'debugger 斷點會被剝掉');
ok(/drop_console:\s*false/.test(vite),
   '保留 console.error —— 正式環境的真實錯誤還要看得到');

// ⚠️ pure_funcs 只剝得掉「回傳值沒人要」的呼叫。寫成 `=> console.log(...)`
//    等於把 log 當成箭頭函式的回傳值，terser 會原封不動留在正式版裡。
const walkSrc = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name);
    return e.isDirectory() ? walkSrc(p) : (/\.jsx?$/.test(p) ? [p] : []);
});
const arrowLogs = walkSrc(path.join(FE, 'src'))
    .filter(f => /=>\s*console\.(log|warn|info|debug)\(/.test(read(f)));
ok(arrowLogs.length === 0,
   '沒有 `=> console.log(...)` 這種寫法（會被 terser 保留下來）' +
   (arrowLogs.length ? `（${arrowLogs.map(f => path.basename(f)).join('、')}）` : ''));

console.log(bad ? `\n❌ ${bad} 道防線不見了 —— 這是資安回歸\n` : '\n✅ 資安稽核修掉的東西都還在\n');
process.exit(bad ? 1 : 0);
