import { drvnHandle, realName } from './drvnHandle';

/**
 * auth.js — Centralized user identity utilities
 *
 * Priority order for getUserId():
 *  1. JWT Bearer token (most authoritative — set after OAuth login)
 *  2. Cached userId in localStorage (set by AuthCallbackPage on OAuth callback)
 *  3. Stable guest ID (generated once per device, persisted in localStorage)
 *
 * Never returns the old placeholder 'user_123' or 'user1'.
 */

const JWT_KEY      = 'auth_token';
const USER_ID_KEY  = 'userId';
const GUEST_ID_KEY = 'guest_user_id';
/**
 * ★ v2.4 使用者「真的做過選擇」的旗標。
 *
 * 為什麼需要它：getUserId() 為了讓各處都拿得到 id，找不到時會自動產生一個
 * guest_xxx 並寫進 localStorage。這是合理的，但它有個致命的副作用 ——
 * 只要任何一個元件在開機時呼叫過 getUserId()，訪客身分就被「創造」出來，
 * ensureGuestToken() 接著幫它換一張 auth_token，
 * 於是首頁的路由判斷看到憑證就直接進主頁 —— 使用者從頭到尾沒看過登入頁。
 *
 * 解法：把「有 id」和「使用者選過登入方式」分成兩件事。
 * 路由只認後者。
 */
export const AUTH_CHOICE_KEY = 'drvn_auth_choice';   // 'line' | 'google' | 'facebook' | 'apple' | 'guest'

/** Decode a JWT without a library (read-only, no verification) */
function decodeJwt(token) {
  try {
    // 🟠 Fix: base64url → base64 轉換後必須補充 padding（=）
    // atob() 要求輸入長度必須是 4 的倍數，否則拋出 DOMException
    let base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) base64 += '=';
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

/**
 * Return the current user's unique ID.
 *
 * - OAuth users  → ID from the JWT payload  (e.g. "google_117...")
 * - Guest users  → stable random ID         (persisted as `guest_user_id`)
 *
 * This function is pure (no React hooks) so it can be called anywhere.
 */
/** 使用者選過哪一種登入方式（沒選過回 null） */
export function getAuthChoice() {
    try { return localStorage.getItem(AUTH_CHOICE_KEY) || null; } catch { return null; }
}

/** 記錄使用者的登入選擇 —— 只有走過登入頁才會被呼叫 */
export function setAuthChoice(provider) {
    try { localStorage.setItem(AUTH_CHOICE_KEY, provider || 'guest'); } catch { /* */ }
}

/**
 * ★ 路由用的唯一判斷：這個人到底登入過沒有？
 *
 * 只認兩種情況：
 *   1. 有未過期的正式 JWT（OAuth 登入成功）
 *   2. 使用者明確選過登入方式（含「以訪客身分繼續」）
 *
 * 刻意「不認」自動產生的 guest_user_id —— 那只是一個內部識別碼，
 * 不代表使用者做過任何選擇。
 */
export function hasSignedIn() {
    try {
        const token = localStorage.getItem(JWT_KEY);
        if (token) {
            const payload = decodeJwt(token);
            const id = payload?.id || payload?.sub || payload?.user_id;
            // 正式帳號的 token（非訪客）→ 一定算登入過
            if (payload && payload.exp * 1000 > Date.now() && id && !String(id).startsWith('guest_')) {
                return true;
            }
        }
    } catch { /* */ }
    return !!getAuthChoice();
}

/** 清掉登入選擇（登出用） */
export function clearAuthChoice() {
    try { localStorage.removeItem(AUTH_CHOICE_KEY); } catch { /* */ }
}

export function getUserId() {
  // ── 1. JWT token (highest priority) ──────────────────────────────
  try {
    const token = localStorage.getItem(JWT_KEY);
    if (token) {
      const payload = decodeJwt(token);
      if (payload) {
        if (payload.exp * 1000 > Date.now()) {
          const id = payload.id || payload.sub || payload.user_id;
          if (id) {
            // Keep the cached copy in sync
            if (localStorage.getItem(USER_ID_KEY) !== id) {
              localStorage.setItem(USER_ID_KEY, id);
            }
            return id;
          }
        } else {
          // Token expired — clean up
          localStorage.removeItem(JWT_KEY);
        }
      }
    }
  } catch (_) { /* ignore */ }

  // ── 2. Cached userId from OAuth callback ─────────────────────────
  const stored = localStorage.getItem(USER_ID_KEY);
  if (
    stored &&
    stored !== 'user_123' &&
    stored !== 'user1' &&
    stored !== 'undefined' &&
    stored !== 'null'
  ) {
    return stored;
  }

  // ── 3. Stable guest ID (generated once, never changes) ───────────
  let guestId = localStorage.getItem(GUEST_ID_KEY);
  if (!guestId) {
    guestId = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(GUEST_ID_KEY, guestId);
  }
  return guestId;
}

/**
 * Return an Authorization header object for fetch() calls.
 * Returns {} if the user is not logged in.
 *
 * Usage:
 *   fetch('/api/...', { headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' } })
 */
export function getAuthHeaders() {
  const token = localStorage.getItem(JWT_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Returns true if the user has a valid, non-expired JWT token. */
export function isLoggedIn() {
  try {
    const token = localStorage.getItem(JWT_KEY);
    if (!token) return false;
    const payload = decodeJwt(token);
    return !!payload && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

/**
 * P5：JWT 滑動續期。token 仍有效但剩餘壽命 < 10 天時，
 * 用舊 token 換一張新的 30 天 token。活躍使用者一年內永不被登出。
 * best-effort：失敗不影響現有 token。
 */
export async function maybeRefreshToken() {
  try {
    const token = localStorage.getItem(JWT_KEY);
    if (!token) return false;
    const payload = decodeJwt(token);
    if (!payload?.exp) return false;
    const msLeft = payload.exp * 1000 - Date.now();
    if (msLeft <= 0) return false;                       // 已過期 → 走正常登入流程
    if (msLeft > 10 * 24 * 60 * 60 * 1000) return false; // 還有 >10 天 → 不用續
    const { default: apiClient } = await import('../api/client'); // 動態載入避免循環依賴
    const res = await apiClient.post('/api/auth/refresh');
    const newToken = res?.data?.token;
    if (newToken) {
      localStorage.setItem(JWT_KEY, newToken);
      console.log('[auth] JWT 滑動續期成功');
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** 通知原生端清掉 Keychain 內的登入狀態（重裝後就不會又自動還原這個帳號）。 */
export function clearNativeAuthKeychain() {
  try {
    window.webkit?.messageHandlers?.authBridge?.postMessage({ action: 'clear' });
  } catch (_) { /* 非 iOS 原生殼層時忽略 */ }
}

/** Wipe all auth state. Call this on logout. */
export function clearAuth() {
  localStorage.removeItem(JWT_KEY);
  localStorage.removeItem(USER_ID_KEY);
  clearNativeAuthKeychain();
}

/**
 * Decode display name from the active JWT (OAuth providers send `name` in payload).
 * Returns null if no JWT, expired, or no name claim.
 */
export function getJwtName() {
  try {
    const token = localStorage.getItem(JWT_KEY);
    if (!token) return null;
    const payload = decodeJwt(token);
    if (!payload) return null;
    if (payload.exp * 1000 <= Date.now()) return null;
    return payload.name || payload.display_name || payload.displayName || null;
  } catch {
    return null;
  }
}

/**
 * Decode avatar URL from the active JWT (LINE / Google return `avatar` or `picture`).
 */
export function getJwtAvatar() {
  try {
    const token = localStorage.getItem(JWT_KEY);
    if (!token) return null;
    const payload = decodeJwt(token);
    if (!payload) return null;
    if (payload.exp * 1000 <= Date.now()) return null;
    return payload.avatar || payload.picture || null;
  } catch {
    return null;
  }
}

/**
 * Stable, app-wide display-name resolver shared by every screen that shows
 * the current user's name. Order:
 *   1. cachedName       — usually `uStorage(uid).get('user_profile_cache', {}).name`
 *   2. OAuth JWT `name` — display name from LINE / Google / FB
 *   3. Auto fallback    — 「訓練者 #XXXX」（取 userId 末 4 碼大寫）
 *
 * Never returns null — caller can always render the result.
 *
 * @param {string} userId
 * @param {string|null} cachedName
 */
export function resolveDisplayName(userId, cachedName) {
  // realName() 會把「訪客用戶」「User」這種佔位字當成沒有名字。
  // ⚠️ 舊版訪客 JWT 的 name claim 就是「訪客用戶」，不擋的話首頁永遠顯示它。
  return realName(cachedName)
      || realName(getJwtName())
      || drvnHandle(userId);   // 有跑步計劃 → DRVNNER，否則 → DRVNST
}
