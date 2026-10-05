// API Configuration
import { mediaUrl } from '../utils/apiHostFix';
// 統一來源：優先採用 VITE_API_URL（但忽略 localhost，避免覆蓋掉手機/區網用的
// hostname 連線），否則回退到目前瀏覽器 host 的 :8000。與 LoginPage 的判斷一致。
export const API_BASE_URL = (import.meta.env.VITE_API_URL && !import.meta.env.VITE_API_URL.includes('localhost'))
    ? import.meta.env.VITE_API_URL
    : `http://${window.location.hostname}:8000`;

/**
 * Normalize an asset URL coming from the backend.
 * - `null`/`undefined`/empty → null   (caller decides fallback)
 * - Absolute http(s) URL    → returned as-is
 * - data: / blob: URLs      → returned as-is
 * - Relative `/static/...`  → prefixed with API_BASE_URL
 *
 * Used by every avatar / cover-photo `<img>` so that the leaderboard,
 * DRVN IDENTITY card, and FRIEND CODE display the real profile photo
 * instead of falling back to the first-letter / rank-number placeholder.
 */
export function resolveAssetUrl(url) {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    if (/^(https?:|data:|blob:)/i.test(trimmed)) return trimmed;
    // ⚠️ 這裡刻意不用 API_BASE_URL：打包版是用 file:// 或 drvn:// 載入的，
    //    window.location.hostname 是空的或 "app"，拼出來會是 http://:8000/...。
    //    fetch 與 XHR 有 apiHostFix 攔截會被改寫，但 <img src> 是瀏覽器自己去抓的，
    //    完全不經過攔截 —— 頭貼與封面就會靜靜地放不出來。
    //    mediaUrl 走的是 resolveApiBase()，打包版會指到正式後端。
    if (trimmed.startsWith('/')) return mediaUrl(trimmed);
    // 只有檔名 → 當成放在 /static/ 底下
    return mediaUrl(`/static/${trimmed}`);
}

export default API_BASE_URL;
