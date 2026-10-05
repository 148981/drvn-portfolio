// ============================================================================
// apiAuthHeader — 讓 raw fetch() 自動帶上 Authorization
// ----------------------------------------------------------------------------
// 背景（資安稽核 Step 2）：
//   後端加上全域身分攔截後，凡是吃 user_id / operator_id 的端點都必須帶 JWT。
//   前端有兩種發請求的方式：
//     • apiClient（axios，293 處）→ interceptor 已自動帶 token ✅
//     • raw fetch()（54 處）      → 絕大多數沒帶 token ❌ → 會收到 401
//
//   逐檔補 headers 要動到十幾個元件檔，容易和其他人正在改的分支衝突。
//   這裡沿用 apiHostFix 的做法：在進入點攔截一次 fetch，
//   只要目標是「我們自己的後端」且尚未帶 Authorization，就自動補上。
//
//   ⚠️ 只對自家後端補 token，絕不外送到第三方網址（那等於外洩 JWT）。
//
// 必須放在 apiHostFix 之後 import —— 這樣本模組的包裝在外層，
// 先補標頭再交給 apiHostFix 改寫網址，兩者不互相干擾。
// ============================================================================

const TOKEN_KEY = 'auth_token';
const PRODUCTION_API_BASE = 'https://drvn-app-production.up.railway.app';

function readToken() {
  try {
    const t = localStorage.getItem(TOKEN_KEY);
    if (!t || t === 'null' || t === 'undefined') return null;
    return t;
  } catch {
    return null;
  }
}

// 這個網址是不是「我們自己的後端 API」？只有 true 才會補上 token。
function isOwnApiUrl(url) {
  if (typeof url !== 'string' || !url) return false;

  // 同源相對路徑
  if (url.startsWith('/api/') || url.startsWith('/upload/')) return true;

  let u;
  try {
    u = new URL(url, typeof window !== 'undefined' ? window.location.href : undefined);
  } catch {
    return false;
  }
  if (!/^\/(api|upload)\//.test(u.pathname)) return false;

  // 正式後端
  if (url.startsWith(PRODUCTION_API_BASE)) return true;
  // 本機 / 區網開發後端（一律 :8000），也涵蓋打包版的 http://app:8000
  if (u.port === '8000') return true;
  // 與目前頁面同源
  try {
    if (u.origin === window.location.origin) return true;
  } catch { /* file:// 之類沒有 origin，忽略 */ }

  return false;
}

function installApiAuthHeader() {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;

  const origFetch = window.fetch.bind(window);

  window.fetch = function (input, init) {
    try {
      const token = readToken();
      if (!token) return origFetch(input, init);

      const url = typeof input === 'string'
        ? input
        : (input && typeof input.url === 'string' ? input.url : '');
      if (!isOwnApiUrl(url)) return origFetch(input, init);

      // 呼叫端自己帶了 Authorization 就不動它
      const explicit = init && init.headers ? new Headers(init.headers) : null;
      if (explicit && explicit.has('Authorization')) return origFetch(input, init);
      if (!explicit && input instanceof Request && input.headers.get('Authorization')) {
        return origFetch(input, init);
      }

      // 情境 A：fetch(new Request(...)) 且沒有另外給 init.headers
      if (input instanceof Request && !explicit) {
        const headers = new Headers(input.headers);
        headers.set('Authorization', `Bearer ${token}`);
        return origFetch(new Request(input, { headers }), init);
      }

      // 情境 B：fetch(url, init) — 最常見
      const headers = explicit || new Headers();
      headers.set('Authorization', `Bearer ${token}`);
      return origFetch(input, { ...(init || {}), headers });
    } catch {
      // 補標頭失敗就照原樣送出，絕不因為這層而讓請求整個失敗
      return origFetch(input, init);
    }
  };
}

// import 此模組即立即安裝（副作用）。
installApiAuthHeader();
