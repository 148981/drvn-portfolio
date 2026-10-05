/**
 * featuredTitle.js — 使用者選來「掛在身上」的稱號（Identity）
 * ──────────────────────────────────────────────────────────────
 * 只有已解鎖的成就 / 等級稱號可選；使用者可選擇是否顯示在首頁問候語旁。
 * 存 localStorage（per-user），並廣播事件讓首頁即時更新。
 *
 * 形狀：{ id, label, emoji, showOnHome }
 */
import { useState, useEffect } from 'react';
import { validateFeatured } from './titleEngine';

const KEY = (uid) => `drvn_featured_title_${uid || 'anon'}`;
const EVENT = 'drvn:featured-title-changed';

export function getFeaturedTitle(userId) {
    let v = null;
    try {
        v = JSON.parse(localStorage.getItem(KEY(userId)));
        v = v && typeof v === 'object' ? v : null;
    } catch (_) {
        return null;
    }
    // 讀的時候就對一次：改名後顯示新名字；門檻不再成立的那一階不會繼續掛著
    try { return validateFeatured(userId, v); } catch (_) { return v; }
}

export function setFeaturedTitle(userId, obj) {
    try {
        if (obj) localStorage.setItem(KEY(userId), JSON.stringify(obj));
        else localStorage.removeItem(KEY(userId));
    } catch (_) {}
    try { window.dispatchEvent(new CustomEvent(EVENT, { detail: obj || null })); } catch (_) {}
    return obj;
}

export function useFeaturedTitle(userId) {
    const [t, setT] = useState(() => getFeaturedTitle(userId));
    useEffect(() => {
        const h = () => setT(getFeaturedTitle(userId));
        window.addEventListener(EVENT, h);
        const sh = (e) => { if (e.key === KEY(userId)) setT(getFeaturedTitle(userId)); };
        window.addEventListener('storage', sh);
        return () => {
            window.removeEventListener(EVENT, h);
            window.removeEventListener('storage', sh);
        };
    }, [userId]);
    return t;
}
