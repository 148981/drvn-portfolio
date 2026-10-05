// guestAuth.js — 訪客匿名 JWT（Phase 2b-I）
// ─────────────────────────────────────────────────────────────────────────────
// 為什麼：後端 owner-guard 只在「請求帶 JWT」時生效。訪客拿一張匿名 token，
// 自己的資料就受同等保護（別人帶著自己的 token 打你的 user_id 會被 403）。
// 失敗（離線/後端冷啟動）完全靜默 — 訪客行為與從前一致，下次啟動再試。
//
// 🔐 裝置密語（drvn_guest_secret）：訪客 ID 會出現在社群動態，光憑 ID 就能換 token
//    等於誰都能冒用訪客。後端第一次發 token 時把這台裝置的密語綁上去，之後換新 token
//    必須帶同一個密語。舊版已經有 token、還沒綁過的訪客，啟動時用手上的 token 補綁一次。

import apiClient from '../api/client';

let inflight = null;
const SECRET_KEY = 'drvn_guest_secret';
const BOUND_KEY = 'drvn_guest_secret_bound';   // 值＝綁過的 guest id

function guestSecret() {
    let s = localStorage.getItem(SECRET_KEY);
    if (!s || s.length < 16) {
        const bytes = new Uint8Array(24);
        try { crypto.getRandomValues(bytes); } catch { for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256); }
        s = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
        localStorage.setItem(SECRET_KEY, s);
    }
    return s;
}

/** 目前這張 token 是不是某個訪客的（不驗章，只讀 id） */
function tokenGuestId(token) {
    try {
        let b = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        while (b.length % 4) b += '=';
        const p = JSON.parse(atob(b));
        const id = p?.id || p?.sub || p?.user_id;
        return id && String(id).startsWith('guest_') && p.exp * 1000 > Date.now() ? String(id) : null;
    } catch { return null; }
}

export async function ensureGuestToken() {
    try {
        const existing = localStorage.getItem('auth_token');
        if (existing) {
            // 舊版訪客：手上有 token 但密語還沒綁 → 用這張 token 證明身分補綁一次（不換 token）
            const gid = tokenGuestId(existing);
            if (gid && localStorage.getItem(BOUND_KEY) !== gid && !inflight) {
                inflight = apiClient.post('/api/auth/guest', { guest_id: gid, guest_secret: guestSecret() })
                    .then(() => { localStorage.setItem(BOUND_KEY, gid); })
                    .catch(() => { /* 靜默：下次啟動再試 */ })
                    .finally(() => { inflight = null; });
                return inflight;
            }
            return;   // 已有身分（正式或訪客）
        }
        // ★ v2.4 只有「使用者明確選了以訪客身分繼續」才發匿名 token。
        //   舊版只要 localStorage 裡有 guest_user_id 就自動換 token ——
        //   而那個 id 是 getUserId() 為了內部使用自動生出來的，
        //   結果變成使用者還沒看到登入頁就已經「登入」了。
        if (localStorage.getItem('drvn_auth_choice') !== 'guest') return;
        const uid = localStorage.getItem('userId') || localStorage.getItem('guest_user_id');
        if (!uid || !uid.startsWith('guest_')) return;    // 非訪客不處理
        if (inflight) return inflight;
        inflight = apiClient.post('/api/auth/guest', { guest_id: uid, guest_secret: guestSecret() })
            .then((r) => {
                const t = r?.data?.token;
                if (t) {
                    localStorage.setItem('auth_token', t);
                    localStorage.setItem(BOUND_KEY, uid);
                    console.log('[guestAuth] anonymous token issued for', uid);
                }
            })
            .catch(() => { /* 靜默：下次啟動再試 */ })
            .finally(() => { inflight = null; });
        return inflight;
    } catch { /* localStorage 不可用等極端情況 */ }
}

/** 打私人 API 前呼叫：訪客若身上沒有 token 就先換一張，避免整批 401。
 *  已經有 token（正式或訪客）時是零成本的 no-op。 */
export async function ensureAuthBeforeFetch() {
    try {
        if (localStorage.getItem('auth_token')) return;
        await ensureGuestToken();
    } catch { /* 靜默：拿不到就照舊，呼叫端自己處理失敗 */ }
}

export default ensureGuestToken;
