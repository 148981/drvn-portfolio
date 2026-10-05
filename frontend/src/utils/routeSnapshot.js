/**
 * routeSnapshot — 跟 iOS 要一張「已經畫好路線」的 Apple Maps 靜態圖
 * ─────────────────────────────────────────────────────────────────────
 * Strava 為什麼點進跑步就有地圖：它先給一張伺服器畫好的靜態地圖（Mapbox Static），
 * 要拖曳才載入互動地圖。我們在 App 裡用 iOS 內建的 MKMapSnapshotter 做同一件事：
 * Apple Maps、視網膜解析度、免金鑰、通常 1 秒內回來。
 * 網頁版（沒有原生橋）回 null，呼叫端退回 Leaflet。
 */
const cache = new Map();                 // key → { image, markers }
const MAX_CACHE = 40;
const pending = new Map();               // requestId → resolve
let wrapper = null;

export const canSnapshotRoute = () =>
    typeof window !== 'undefined' && !!window.webkit?.messageHandlers?.routeSnapshot;

/* 其他功能也會暫時換掉 nativeBridge.onNativeEvent —— 每次送出前確認我們還掛在最外層 */
const ensureListener = () => {
    if (!window.nativeBridge) window.nativeBridge = {};
    if (window.nativeBridge.onNativeEvent && window.nativeBridge.onNativeEvent === wrapper) return;
    const prev = window.nativeBridge.onNativeEvent;
    wrapper = (jsonStr) => {
        let evt = null;
        try { evt = JSON.parse(jsonStr); } catch { evt = null; }
        if (evt && evt.type === 'routeSnapshot' && pending.has(evt.requestId)) {
            const done = pending.get(evt.requestId);
            pending.delete(evt.requestId);
            done(evt.error ? null : { image: evt.image, markers: evt.markers || [] });
            return;
        }
        if (prev) { try { prev(jsonStr); } catch { /* swallow */ } }
    };
    window.nativeBridge.onNativeEvent = wrapper;
};

/** 太多點會讓訊息變大、也沒有視覺差異 —— 均勻抽到最多 600 點，頭尾一定保留 */
const thin = (pts, max = 600) => {
    if (pts.length <= max) return pts;
    const step = (pts.length - 1) / (max - 1);
    const out = [];
    for (let i = 0; i < max; i++) out.push(pts[Math.round(i * step)]);
    return out;
};

const keyOf = (pts, markers, w, h, dark, color) => {
    const a = pts[0], b = pts[pts.length - 1], m = pts[Math.floor(pts.length / 2)];
    return [pts.length, a, m, b, markers.length, markers[0], w, h, dark ? 1 : 0, color].join('|');
};

/**
 * @param {Array<[number,number]>} coords  [lat,lng]
 * @param {Array<[number,number]>} markers 要回傳像素座標的點（例如獎牌位置）
 * @returns {Promise<{image:string, markers:number[][]}|null>}
 */
export function requestRouteSnapshot({ coords, markers = [], width, height, dark = false, color = '#F95C4B', padding = 28, timeoutMs = 6000 }) {
    if (!canSnapshotRoute()) return Promise.resolve(null);
    const pts = thin((coords || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])));
    if (pts.length < 2 || !(width > 0) || !(height > 0)) return Promise.resolve(null);
    const w = Math.round(width), h = Math.round(height);
    const key = keyOf(pts, markers, w, h, dark, color);
    if (cache.has(key)) return Promise.resolve(cache.get(key));

    ensureListener();
    const requestId = `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return new Promise((resolve) => {
        const timer = setTimeout(() => { pending.delete(requestId); resolve(null); }, timeoutMs);
        pending.set(requestId, (res) => {
            clearTimeout(timer);
            if (res) {
                cache.set(key, res);
                if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
            }
            resolve(res);
        });
        try {
            window.webkit.messageHandlers.routeSnapshot.postMessage({
                requestId, coords: pts, markers, width: w, height: h, dark, color, padding,
            });
        } catch {
            clearTimeout(timer); pending.delete(requestId); resolve(null);
        }
    });
}
