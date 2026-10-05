// 📍 nearbyPlaces — 附近的健身房／跑步地點（iOS 原生 Apple 地圖搜尋，免金鑰）
// ─────────────────────────────────────────────────────────────
// 原生：WebView.swift 的 places 橋接（MKLocalPointsOfInterestRequest）。
// 網頁版沒有這個橋接 → 回空陣列，畫面改成「自己取名」，不編店名。
import { getOneShotLocation } from './nativeLocation';
import { reverseGeocodeName } from './locationName';

/**
 * @param {{lat:number, lng:number}} coords
 * @param {{kind?:'gym'|'run', radius?:number, timeout?:number}} opts
 * @returns {Promise<Array<{name,lat,lng,distance,category,area}>>}
 */
export function getNearbyPlaces(coords, { kind = 'gym', radius = 400, timeout = 6000 } = {}) {
    return new Promise((resolve) => {
        const handler = typeof window !== 'undefined' ? window.webkit?.messageHandlers?.places : null;
        if (!handler || !Number.isFinite(coords?.lat) || !Number.isFinite(coords?.lng)) { resolve([]); return; }
        const requestId = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        let done = false;
        if (!window.nativeBridge) window.nativeBridge = {};
        const prev = window.nativeBridge.onNativeEvent;
        const finish = (list) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            if (window.nativeBridge.onNativeEvent === listener) window.nativeBridge.onNativeEvent = prev || null;
            resolve(Array.isArray(list) ? list.filter((p) => p && p.name) : []);
        };
        const listener = (jsonStr) => {
            if (prev) { try { prev(jsonStr); } catch (_) { /* ignore */ } }
            try {
                const evt = JSON.parse(jsonStr);
                if (evt.type === 'placesResult' && evt.requestId === requestId) finish(evt.places);
            } catch (_) { /* ignore */ }
        };
        window.nativeBridge.onNativeEvent = listener;
        const timer = setTimeout(() => finish([]), timeout);
        try { handler.postMessage({ lat: coords.lat, lng: coords.lng, kind, radius, requestId }); }
        catch (_) { finish([]); }
    });
}

/**
 * 現在在哪：座標、地區名、附近的地點候選。任何一步拿不到就是 null／空陣列。
 * @returns {Promise<{coords:{lat,lng}|null, area:string|null, places:Array}>}
 */
export async function locateHere({ kind = 'gym', radius = 400 } = {}) {
    const coords = await getOneShotLocation({ timeout: 6000 }).catch(() => null);
    if (!coords) return { coords: null, area: null, places: [] };
    const [area, places] = await Promise.all([
        reverseGeocodeName(coords.lat, coords.lng).catch(() => null),
        getNearbyPlaces(coords, { kind, radius }).catch(() => []),
    ]);
    return { coords, area: area || null, places };
}

export default { getNearbyPlaces, locateHere };
