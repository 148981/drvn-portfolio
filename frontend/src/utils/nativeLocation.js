// 📍 一次性取得定位（給「找附近路段」之類非追蹤用途）。
//
// 為什麼需要這個：iOS 打包版用自訂 scheme / file:// 載入網頁，直接呼叫
// navigator.geolocation.getCurrentPosition 會跳出帶有醜路徑的系統定位提示，
// 而且在非 https 的 origin 下常常直接失敗（定位拿不到）。
// 因此優先走原生 CoreLocation 橋接（window.webkit.messageHandlers.location，
// 指令 GET_ONCE），其餘環境（一般瀏覽器）才 fallback 到 web 定位 API。
//
// 回傳 Promise<{ lat, lng } | null>，取不到時回 null，讓呼叫端用預設座標。
export function getOneShotLocation({ timeout = 5000 } = {}) {
    return new Promise((resolve) => {
        const hasNative = !!(typeof window !== 'undefined' && window?.webkit?.messageHandlers?.location);

        // ── (A) iOS 原生橋接：暫掛 onNativeEvent，收到第一筆 locationUpdate 即解析 ──
        if (hasNative) {
            let done = false;
            const prev = window.nativeBridge?.onNativeEvent;
            if (!window.nativeBridge) window.nativeBridge = {};
            const finish = (coords) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                // 還原先前 handler，避免覆蓋 GPS 追蹤的監聽鏈。
                // 期間若別的模組已換上新 handler，就不要把它蓋回舊的。
                if (window.nativeBridge.onNativeEvent === ours) {
                    window.nativeBridge.onNativeEvent = prev || null;
                }
                resolve(coords);
            };
            const ours = (jsonStr) => {
                if (prev) { try { prev(jsonStr); } catch (_) { } }
                try {
                    const evt = JSON.parse(jsonStr);
                    if (evt.type === 'locationUpdate'
                        && typeof evt.latitude === 'number'
                        && typeof evt.longitude === 'number') {
                        finish({ lat: evt.latitude, lng: evt.longitude });
                    } else if (evt.type === 'locationError'
                        || (evt.type === 'locationAuthChanged'
                            && (evt.status === 'denied' || evt.status === 'restricted'))) {
                        // 權限被拒／定位失敗 → 立刻回 null 用預設座標，不必空等逾時
                        finish(null);
                    }
                } catch (_) { }
            };
            window.nativeBridge.onNativeEvent = ours;
            const timer = setTimeout(() => finish(null), timeout);
            try {
                window.webkit.messageHandlers.location.postMessage({ command: 'GET_ONCE' });
            } catch (e) {
                finish(null);
            }
            return;
        }

        // ── (B) Web fallback ──
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                (err) => { console.warn('Geolocation failed, using default:', err?.message); resolve(null); },
                { timeout }
            );
        } else {
            resolve(null);
        }
    });
}
