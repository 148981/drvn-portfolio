// 📍 locationName — 把座標變成人看得懂的地點名（運動動態卡用）
// ─────────────────────────────────────────────────────────────
// 1. reverseGeocodeName(lat, lng)   → 「大安區 · 台北市」這類短地名（BigDataCloud 免金鑰端點，繁中）
// 2. getCurrentLocationName()       → 一次性定位（原生橋接優先）→ 反向地理編碼；重訓存檔時呼叫
// 3. cachedRouteLocationName(sid, route) → 用路線起點反解地名並以 session 快取（舊紀錄補地點）
// 取不到一律回 null — 卡片端「有才顯示」，絕不擺假地名。
import { getOneShotLocation } from './nativeLocation';

const memCache = new Map();

export async function reverseGeocodeName(lat, lng) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
    if (memCache.has(key)) return memCache.get(key);
    try {
        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), 5000) : null;
        const r = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=zh-Hant`,
            ctrl ? { signal: ctrl.signal } : undefined
        );
        if (timer) clearTimeout(timer);
        if (!r.ok) return null;
        const d = await r.json();
        // 組短地名：區/里(locality) · 市(city)；缺一用另一個補
        const locality = d.locality || d.localityInfo?.administrative?.slice(-1)?.[0]?.name || '';
        const city = d.city || d.principalSubdivision || '';
        const name = [locality, city].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ') || null;
        memCache.set(key, name);
        return name;
    } catch {
        return null;
    }
}

/** 一次性定位 + 反解地名（重訓存檔時記下「在哪裡練」）。取不到回 null。 */
export async function getCurrentLocationName({ timeout = 6000 } = {}) {
    try {
        const pos = await getOneShotLocation({ timeout });
        if (!pos) return null;
        return await reverseGeocodeName(pos.lat, pos.lng);
    } catch {
        return null;
    }
}

/** 舊有氧紀錄沒存 location_name → 用 GPS 路線起點反解，localStorage 依 session 快取。 */
export async function cachedRouteLocationName(sessionId, route) {
    if (!Array.isArray(route) || route.length === 0) return null;
    const sid = sessionId || null;
    const lsKey = sid ? `drvn:locName:${sid}` : null;
    try {
        if (lsKey) {
            const hit = localStorage.getItem(lsKey);
            if (hit) return hit === '__none__' ? null : hit;
        }
    } catch { /* */ }
    const p = route[0];
    const lat = Number(p?.lat ?? p?.[0]);
    const lng = Number(p?.lng ?? p?.[1]);
    const name = await reverseGeocodeName(lat, lng);
    try { if (lsKey) localStorage.setItem(lsKey, name || '__none__'); } catch { /* */ }
    return name;
}
