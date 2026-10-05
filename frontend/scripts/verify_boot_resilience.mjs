/**
 * verify_boot_resilience.mjs —— 沒網路、弱網、打包版，App 都不能開成一片白。
 * ─────────────────────────────────────────────────────────────────────
 * 打包版是用 file:// 或 drvn:// 載入的，window.location.hostname 是空的或 "app"。
 * 全專案 36 處直接拼 `http://${hostname}:8000` 的網址，全靠 apiHostFix 在
 * 進入點攔截 fetch/XHR 改寫 —— 少載入它一次，整個 App 連不到後端。
 * 而 <img src> 瀏覽器自己去抓，攔截碰不到，所以圖片一律要走 mediaUrl。
 */
import fs from 'fs';
import path from 'path';

const FE = path.resolve(process.cwd());
const IOS = path.resolve(process.cwd(), '..', 'ios');
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };

let bad = 0;
const ok = (cond, msg) => { console.log((cond ? '✓ ' : '✗ ') + msg); if (!cond) bad++; };

console.log('\n══ 開機韌性：離線 / 弱網 / 打包版 ══\n');

// ── 1 · 網址改寫一定要最先裝上 ──
const mainJsx = read(path.join(FE, 'src/main.jsx'));
const iHost = mainJsx.indexOf("utils/apiHostFix");
const iAuth = mainJsx.indexOf("utils/apiAuthHeader");
ok(iHost > -1, 'main.jsx 有載入 apiHostFix');
ok(iHost > -1 && iHost < 400, 'apiHostFix 是最前面的 import（要在任何請求發出前生效）');
ok(iAuth > iHost, 'apiAuthHeader 排在它後面（先補 Authorization 再改寫網址）');

const hostFix = read(path.join(FE, 'src/utils/apiHostFix.js'));
ok(/\[\^\/\]\*:8000/.test(hostFix),
   '改寫規則吃得下空 host（file:// 下會拼出 http://:8000）');

// ── 2 · 正式後端網址三個地方要一致 ──
const pick = (src, re) => (re.exec(src) || [])[1] || '';
const jsBase    = pick(hostFix, /PRODUCTION_API_BASE\s*=\s*'([^']+)'/);
const webBase   = pick(read(path.join(IOS, 'FitnessApp/WebView.swift')), /productionBaseURL\s*=\s*"([^"]+)"/);
const watchBase = pick(read(path.join(IOS, 'FitnessApp/ＦｉｔｎｅｓｓAppWatch Watch App/WatchConfig.swift')), /productionBaseURL\s*=\s*"([^"]+)"/);
ok(!!jsBase, '前端有寫死正式後端網址（打包版唯一的退路）');
ok(jsBase && jsBase === webBase && jsBase === watchBase,
   `前端 / iOS / Watch 三邊的正式後端網址一致（${jsBase || '?'}）`);

// ── 3 · 圖片與影片不能用 API_BASE_URL 拼（攔截碰不到 <img src>）──
const apiCfg = read(path.join(FE, 'src/config/api.js'));
const assetFn = /export function resolveAssetUrl\([\s\S]*?\n\}/.exec(apiCfg)?.[0] || '';
ok(assetFn.length > 0, '找得到 resolveAssetUrl');
ok(/mediaUrl\(/.test(assetFn) && !/\$\{API_BASE_URL\}/.test(assetFn),
   'resolveAssetUrl 走 mediaUrl，不是自己拼 API_BASE_URL');

const jsxDir = path.join(FE, 'src');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name);
    return e.isDirectory() ? walk(p) : (p.endsWith('.jsx') ? [p] : []);
});
const badSrc = walk(jsxDir).filter(f =>
    /src=\{`http:\/\/\$\{window\.location\.hostname\}:8000/.test(read(f)));
ok(badSrc.length === 0,
   `沒有 <img>/<video> 直接拼 :8000${badSrc.length ? `（${badSrc.length} 處）` : ''}`);

// ── 4 · render 掛了要降級，不是白畫面 ──
const app = read(path.join(FE, 'src/App.jsx'));
ok(/<RouteErrorBoundary/.test(app), '路由外面包了 RouteErrorBoundary');
ok(!/isBackendReady[\s\S]{0,80}fixed inset-0/.test(app),
   '沒有「連不到後端就蓋住全螢幕」的遮罩（那會讓離線等於開不了）');
ok(!/Connecting to AI Engine/.test(app),
   '那段遮罩是整段刪掉、不是註解起來（註解起來的死碼遲早被人打開）');

// ── 5 · 每一支會擋住畫面的請求都要有上限 ──
const client = read(path.join(FE, 'src/api/client.js'));
ok(/timeout:\s*\d+/.test(client), 'axios 有預設 timeout');
const sun = read(path.join(FE, 'src/components/SunlightIntro.jsx'));
ok(/AbortController/.test(sun) && /Promise\.race/.test(sun),
   '登入成功頁的後端檢查有逾時與保底（那頁沒有任何離開的方法）');
const login = read(path.join(FE, 'src/components/LoginPage.jsx'));
ok(/AbortController/.test(login), '登入頁查 profile 有逾時');

console.log(bad ? `\n❌ ${bad} 項未通過 —— 弱網或打包版會出事\n` : '\n✅ 斷網、弱網、打包版都還開得起來\n');
process.exit(bad ? 1 : 0);
