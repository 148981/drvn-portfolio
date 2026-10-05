// frontend/src/api/socialApi.js
// Friend-code lookup + invite for the onboarding "/social" step.
// Keeps STEP 7 followed[] logic untouched — this is a separate channel.

import { API_BASE_URL } from '../config/api';
// 後端已要求 JWT（送邀請需本人）。全域 fetch 攔截只認得幾種網址，這裡直接帶上，不靠攔截。
import { getAuthHeaders } from '../utils/auth';

/**
 * Parse a friend-code input into { name, disc }.
 * Accepts:
 *   "Iris Chen#6615"
 *   "Iris Chen #6615"
 *   "Iris Chen＃6615"  (full-width)
 *   "iris.chen#6615"
 * Throws Error('FORMAT') if it can't be split.
 */
export function parseFriendCode(raw) {
    if (typeof raw !== 'string') throw new Error('FORMAT');
    // Normalize full-width hash and trim
    const s = raw.replace(/＃/g, '#').trim();
    const m = s.match(/^(.+?)\s*#\s*(\d{3,6})$/);
    if (!m) throw new Error('FORMAT');
    const name = m[1].trim();
    const disc = m[2].padStart(4, '0');
    if (!name) throw new Error('FORMAT');
    return { name, disc };
}

/**
 * Look up an athlete by friend code.
 * @param {string} code         e.g. "Iris Chen#6615"
 * @param {string} [myUserId]   for relation hints + blocking checks
 * @returns {Promise<{user_id, name, discriminator, avatar, tag, relation}>}
 * @throws  Error('NOT_FOUND' | 'SELF' | 'BLOCKED' | 'FORMAT' | 'NETWORK')
 */
export async function lookupFriendByCode(code, myUserId) {
    const { name, disc } = parseFriendCode(code);
    const url = new URL(`${API_BASE_URL}/api/social/friends/lookup`);
    url.searchParams.set('name', name);
    url.searchParams.set('disc', disc);
    if (myUserId) url.searchParams.set('user_id', String(myUserId));

    let res;
    try {
        res = await fetch(url.toString(), { method: 'GET', headers: { ...getAuthHeaders() } });
    } catch (e) {
        throw new Error('NETWORK');
    }

    if (res.status === 404) throw new Error('NOT_FOUND');
    if (res.status === 400) {
        const body = await res.json().catch(() => ({}));
        if (String(body?.detail || '').toLowerCase().includes('own')) throw new Error('SELF');
        throw new Error('FORMAT');
    }
    if (res.status === 403) throw new Error('BLOCKED');
    if (!res.ok) throw new Error('NETWORK');

    return res.json();
}

/**
 * Send a friend request.
 * @returns {Promise<{status, message, data}>}
 * @throws  Error('ALREADY_FRIENDS' | 'SELF' | 'INCOMING_EXISTS' | 'NETWORK')
 */
export async function sendFriendInvite(fromUserId, toUserId) {
    let res;
    try {
        res = await fetch(`${API_BASE_URL}/api/social/friends/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ from_user_id: String(fromUserId), to_user_id: String(toUserId) }),
        });
    } catch (e) {
        throw new Error('NETWORK');
    }
    if (res.ok) return res.json();
    // 403：雙方有封鎖關係（或身分不符）→ 不要講成「網路問題」
    if (res.status === 403) throw new Error('BLOCKED');
    const body = await res.json().catch(() => ({}));
    const detail = String(body?.detail || '').toLowerCase();
    if (detail.includes('already friends')) throw new Error('ALREADY_FRIENDS');
    if (detail.includes('yourself')) throw new Error('SELF');
    if (detail.includes('already sent you')) throw new Error('INCOMING_EXISTS');
    throw new Error('NETWORK');
}

// 註：好友清單 / 接受拒絕 / 移除 / 搜尋已由 FriendsSheet.jsx 直接以 apiClient 接真後端，
//     不在此重複封裝，避免兩套並存。本檔僅保留 onboarding 用的 lookup + invite。

export const FRIEND_INVITE_ERRORS = {
    FORMAT: '格式錯誤 — 試試「Name#1234」',
    NOT_FOUND: '找不到這位運動員 — 確認一下拼字',
    SELF: '這是你自己的好友碼',
    BLOCKED: '無法對這位使用者發送邀請',
    ALREADY_FRIENDS: '你們已經是好友了',
    INCOMING_EXISTS: '對方已經邀請了你 — 去通知區接受吧',
    NETWORK: '連線異常 — 稍後再試',
};
