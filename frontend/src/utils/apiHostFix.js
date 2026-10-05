// ============================================================================
// apiHostFix — App 打包版 API 網址全域修正
// ----------------------------------------------------------------------------
// 背景：前端許多地方直接用 `http://${window.location.hostname}:8000` 拼 API。
//   - 在瀏覽器 / 區網開發：hostname 有值（區網 IP），正常連本地後端。
//   - 在 iOS App 打包版：網頁不是用 http(s) 載入，而是：
//       • file://          → hostname 為空 → http://:8000（壞）
//       • drvn://app/      → hostname 為 "app" → http://app:8000（壞）
//     兩者都連不到後端。
//
// 解法：在 App 最早啟動時攔截 fetch 與 XMLHttpRequest。
//   「打包版環境」(protocol 非 http/https) 永遠不該連 :8000 區網伺服器，
//   一律把任何 http://<任意host>:8000/... 改寫到正式後端網址。
//   85+ 處硬編碼完全不用動，且同時相容 file:// 與 drvn:// scheme。
//
// 只在「打包版」情境啟用；一般瀏覽器與區網開發完全不受影響。
// ============================================================================

// 🚀 正式後端網址（與 iOS AppConfig / WatchConfig 保持一致）
const PRODUCTION_API_BASE = 'https://drvn-app-production.up.railway.app';

// 是否為「打包版環境」：網頁不是用 http/https 載入（file:// 或 drvn://app 等），
// 或 hostname 空白。這種情況下一律導向正式後端。
function shouldRewrite() {
  try {
    const proto = window.location.protocol; // 'file:' / 'drvn:' / 'http:' / 'https:'
    const host = window.location.hostname;
    const isPackaged = proto !== 'http:' && proto !== 'https:';
    return isPackaged || !host || host === '';
  } catch {
    return false;
  }
}

// 把指向本地後端的 URL 改寫到正式後端。
// 打包版裡任何 http://<host>:8000 都是錯的（應走 Railway），全部改寫；
// 同時涵蓋 host 為空（http://:8000）與畸形 http:///api 形態。
// 不動 https://、外部資源、或已是正式網址的請求。
function rewriteUrl(url) {
  if (typeof url !== 'string') return url;

  const patterns = [
    /^http:\/\/[^/]*:8000/i,      // http://<任意host或空>:8000（含 app / localhost / 127.0.0.1 / 空）
    /^http:\/\/\/?(?=api\/)/i,    // http:///api 或 http://api 這種畸形
  ];
  // 相對路徑 /api/...：打包版的網頁在 drvn://app，相對路徑會打到本機殼層（回 index.html、200），
  // 等於請求根本沒送到後端。這支只在打包版才會被呼叫，所以直接補上正式後端。
  if (url.startsWith('/api/') || url.startsWith('/upload/')) return PRODUCTION_API_BASE + url;
  for (const re of patterns) {
    if (re.test(url)) {
      return url.replace(re, PRODUCTION_API_BASE).replace(/([^:])\/\//g, '$1/');
    }
  }
  return url;
}

/**
 * 給「不經過 fetch / XHR」的呼叫端用的解析器。
 *
 * 為什麼需要這個：上面的攔截只補得到 JS 自己發的請求。原生端（Swift 的
 * URLSession）拿到的 base URL 是我們用 postMessage 傳過去的字串，
 * 它不會經過這裡的改寫 —— 傳 `http://app:8000` 過去就是直接 DNS 失敗。
 * 所以要把 base URL 傳給原生層之前，一律先過這支。
 */
export function resolveApiBase() {
  // 打包版（drvn:// 或 file://）：本機 :8000 不存在，一律走正式後端。
  if (shouldRewrite()) return PRODUCTION_API_BASE;
  // 瀏覽器 / 區網開發：維持與 api/client.js 完全相同的推導，
  // ⚠️ 這裡**不能**套 rewriteUrl —— 那會把區網開發機 http://192.168.x.x:8000
  //    也改寫成 Railway，開發時就再也連不到本機後端。
  const envUrl = import.meta.env?.VITE_API_URL;
  if (envUrl && !envUrl.includes('localhost')) return envUrl;
  return `http://${typeof window !== 'undefined' ? window.location.hostname : ''}:8000`;
}

/**
 * 把後端回的相對路徑（/static/results/xxx.mp4、/api/plan-covers/... ）
 * 變成真的載得到的絕對網址。
 *
 * ⚠️ 為什麼一定要有這支：下面的 installApiHostFix 只攔得到 fetch 與
 *    XMLHttpRequest。`<img src>`、`<video src>`、`<source>` 這些是瀏覽器
 *    自己去抓的，**完全不經過攔截**。所以只要有人寫
 *        src={`http://${window.location.hostname}:8000${url}`}
 *    打包版（drvn:// 載入，hostname 是 app）就會去連一個不存在的主機，
 *    圖片與 AR 疊合影片一定放不出來 —— 而且是靜靜地放不出來。
 *
 * @param {string|null|undefined} path 後端給的路徑（相對或絕對都吃）
 * @returns {string|null} 絕對網址；沒有路徑就回 null（不要生一個壞網址出來）
 */
export function mediaUrl(path) {
  const p = typeof path === 'string' ? path.trim() : '';
  if (!p) return null;
  if (/^(https?:|data:|blob:)/i.test(p)) return p;
  const base = resolveApiBase().replace(/\/+$/, '');
  return `${base}${p.startsWith('/') ? '' : '/'}${p}`;
}

function installApiHostFix() {
  if (!shouldRewrite()) return; // 開發 / 瀏覽器：不介入

  // 1) fetch
  if (typeof window.fetch === 'function') {
    const origFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      try {
        if (typeof input === 'string') {
          input = rewriteUrl(input);
        } else if (input && typeof input.url === 'string') {
          const newUrl = rewriteUrl(input.url);
          if (newUrl !== input.url) input = new Request(newUrl, input);
        }
      } catch { /* 改寫失敗就照原樣送 */ }
      return origFetch(input, init);
    };
  }

  // 2) XMLHttpRequest（axios 在某些設定下會走這條）
  if (window.XMLHttpRequest) {
    const origOpen = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      try { url = rewriteUrl(url); } catch { /* noop */ }
      return origOpen.call(this, method, url, ...rest);
    };
  }

  // eslint-disable-next-line no-console
  console.log('[apiHostFix] 已啟用：API 請求改寫至', PRODUCTION_API_BASE);
}

// import 此模組即立即安裝（作為副作用）。放在進入點的第一個 import，
// 確保在任何會發 API 請求的程式之前完成攔截。
installApiHostFix();
