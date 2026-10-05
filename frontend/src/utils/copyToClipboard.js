/**
 * copyToClipboard.js
 * ─────────────────────────────────────────────────────────────
 * 可靠的跨環境複製到剪貼簿（特別針對 iOS WKWebView 調優）。
 *
 * 重點：**完全同步執行**。不能用 async/await！原因：
 *   · iOS WKWebView 對 clipboard 操作要求「在 user gesture 同一 tick 內完成」
 *   · 一旦 await 跳到下一個 microtask，user gesture 過期 → execCommand 看似
 *     return true 但實際剪貼簿沒被寫入（這就是「按得下去但貼上空白」的根因）
 *   · navigator.clipboard.writeText 本身是 Promise，會跨越 microtask，
 *     在 iOS WKWebView 上經常失效
 *
 * 因此策略改為：
 *   路線 1：execCommand('copy') + 隱形 textarea（同步、最相容）
 *   路線 2：navigator.clipboard.writeText（非同步、補強）
 *   路線 3：DRVN native bridge（若 iOS 端日後新增 'clipboard' handler）
 *
 * 用法：
 *   const ok = copyToClipboard(text);  // 同步！直接拿 boolean
 *   if (ok) showToast('已複製');
 *
 * 必須在 user gesture（click / pointerup）的 listener 中**同步呼叫**。
 * ─────────────────────────────────────────────────────────────
 */

const isIOSDevice = () => {
    if (typeof navigator === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent || '') ||
        // iPad on iOS 13+ 偽裝成 Mac，再用 touch 判斷
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

/**
 * 同步嘗試把 text 寫入剪貼簿。
 * @param {string} text
 * @returns {boolean} 是否成功
 */
export function copyToClipboard(text) {
    if (typeof text !== 'string') text = String(text ?? '');
    if (!text) return false;
    if (typeof document === 'undefined') return false;

    // ─── 路線 1：execCommand('copy') — 同步、user gesture 內最穩 ───
    let execOk = false;
    let ta = null;
    try {
        ta = document.createElement('textarea');
        ta.value = text;
        // 防止鍵盤彈出 + 畫面跳動
        ta.setAttribute('readonly', '');
        ta.setAttribute('aria-hidden', 'true');
        ta.style.cssText = [
            'position:fixed',
            'top:0',
            'left:0',
            'width:1px',
            'height:1px',
            'padding:0',
            'border:none',
            'outline:none',
            'box-shadow:none',
            'background:transparent',
            'opacity:0',
            'pointer-events:none',
            // 防 iOS 自動放大
            'font-size:16px',
            // 確保元素在 viewport 內，否則 select 在某些 WebKit 版本會失敗
            'z-index:-1',
        ].join(';');
        document.body.appendChild(ta);

        if (isIOSDevice()) {
            // iOS Safari / WKWebView：必須先把 readOnly 暫時拿掉才能 select，
            // 但移除 readonly 又會彈鍵盤 → 用 contentEditable 雙保險
            const prevContentEditable = ta.contentEditable;
            const prevReadOnly = ta.readOnly;
            ta.contentEditable = 'true';
            ta.readOnly = false;

            const range = document.createRange();
            range.selectNodeContents(ta);
            const sel = window.getSelection();
            if (sel) {
                sel.removeAllRanges();
                sel.addRange(range);
            }
            ta.setSelectionRange(0, 999999);

            try { execOk = document.execCommand('copy'); } catch { execOk = false; }

            ta.contentEditable = prevContentEditable;
            ta.readOnly = prevReadOnly;
        } else {
            ta.select();
            ta.setSelectionRange(0, text.length);
            try { execOk = document.execCommand('copy'); } catch { execOk = false; }
        }
    } catch {
        execOk = false;
    } finally {
        if (ta && ta.parentNode) ta.parentNode.removeChild(ta);
    }

    if (execOk) {
        // execCommand 成功，順手也透過 native bridge 寫一份（讓 native 端也持有）
        try {
            if (typeof window !== 'undefined' &&
                window.webkit?.messageHandlers?.clipboard) {
                window.webkit.messageHandlers.clipboard.postMessage({ text });
            }
        } catch { /* noop */ }
        return true;
    }

    // ─── 路線 2：non-blocking 補強 — navigator.clipboard.writeText ───
    // 跨 microtask，user gesture 可能過期，但仍嘗試（部分桌機環境只能走這條）
    try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            // 不能 await！立刻發出，由 Promise queue 處理
            navigator.clipboard.writeText(text).catch(() => { /* silent */ });
            // 桌機通常會成功，但我們無法在同步路徑得知 → 回 true 樂觀回饋
            return true;
        }
    } catch { /* fall through */ }

    // ─── 路線 3：native bridge（若 iOS native 端註冊 'clipboard' handler）───
    try {
        if (typeof window !== 'undefined' &&
            window.webkit?.messageHandlers?.clipboard) {
            window.webkit.messageHandlers.clipboard.postMessage({ text });
            return true;
        }
    } catch { /* noop */ }

    return false;
}

export default copyToClipboard;
