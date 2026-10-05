// shareCard.js — 分享卡的單一出口（Phase 2b-L）
// ─────────────────────────────────────────────────────────────────────────────
// 🔴 之前：navigator.share/下載 fallback 散落 6+ 個元件。WKWebView（打包版）
//    「沒有」Web Share API，`a.download` 也不會觸發下載 → 打包版分享靜默失敗。
// 🩹 現在：三層策略，全站分享一律呼叫這裡 —
//    1. 打包版 → 原生 shareImage bridge（UIActivityViewController 系統分享面板）
//    2. 瀏覽器支援 Web Share → navigator.share({files})
//    3. 桌面瀏覽器 → 傳統下載
//
// 回傳：'native' | 'webshare' | 'download' | 'cancelled'（AbortError 不是失敗）

const blobToDataURL = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
});

export async function shareImageBlob(blob, { filename = 'drvn-card.png', title = 'DRVN', text = '' } = {}) {
    // 1) 打包版：原生分享面板
    try {
        if (window.webkit?.messageHandlers?.shareImage) {
            const dataURL = await blobToDataURL(blob);
            window.webkit.messageHandlers.shareImage.postMessage({ dataURL, filename, text });
            return 'native';
        }
    } catch (e) { console.warn('[shareCard] native bridge failed, falling back:', e?.message); }

    // 2) Web Share API（行動瀏覽器）
    try {
        const file = new File([blob], filename, { type: blob.type || 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title, text });
            return 'webshare';
        }
    } catch (e) {
        if (e?.name === 'AbortError') return 'cancelled';   // 使用者取消 ≠ 失敗
        console.warn('[shareCard] web share failed, falling back:', e?.message);
    }

    // 3) 桌面：下載
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'download';
}

/**
 * 把 DOM 元素截成卡片並分享（html2canvas 動態載入，不佔首屏 bundle）。
 * @param {HTMLElement} el
 * @param {object} opts { filename, title, text, scale=2, backgroundColor=null }
 */
export async function shareElementAsImage(el, opts = {}) {
    const { scale = 2, backgroundColor = null, ...shareOpts } = opts;
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(el, { scale, backgroundColor, useCORS: true });
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error('canvas.toBlob returned null');
    return shareImageBlob(blob, shareOpts);
}

export default shareImageBlob;
