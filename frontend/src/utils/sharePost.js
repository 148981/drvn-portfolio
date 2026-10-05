// sharePost.js —— 動態牆貼文的分享（單一出口）
// ─────────────────────────────────────────────────────────────────────────────
// 稽核前：健身社群的分享鍵 onClick 只有 triggerHaptic('light') —— 按下去會震，
// 什麼都不會發生；跑步社群則根本沒有分享鍵。
//
// 策略（由好到壞，前一層失敗才往下）：
//   1. 把貼文的媒體區（照片／DRVN 卡牌）截成圖 → 系統分享面板（圖＋文字）
//      走 shareCard.shareImageBlob：打包版用原生 shareImage 橋，瀏覽器用 Web Share
//   2. 截不到圖（跨網域照片讓 canvas 汙染、html2canvas 載入失敗）→ 只分享文字
//   3. 都不支援 → 複製到剪貼簿
//
// 回傳 'native' | 'webshare' | 'download' | 'copied' | 'cancelled' | 'failed'，
// 呼叫端依結果決定要不要跳 toast（原生面板自己會有回饋，不必再講一次）。
import { shareImageBlob } from './shareCard';

const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

/** 這則貼文一句話的成果摘要；沒有真實數據就回空字串（不編數字）。 */
export const postSummary = (post = {}) => {
    const raw = post.raw || {};
    const type = raw.activity_type || post.activity_type || post.type;
    const s = post.stats || {};
    if (type === 'run') {
        const km = num(s.distance);
        return km ? `跑了 ${km.toFixed(2)} 公里` : '';
    }
    if (type === 'fitness' || type === 'strength') {
        const kg = num(s.volume ?? post.metrics?.volume_kg);
        return kg ? `練了 ${Math.round(kg).toLocaleString()} 公斤總量` : '';
    }
    return '';
};

export const buildShareText = (post = {}, authorName = '') => {
    const who = String(authorName || '').trim();
    const body = [post.title, post.caption].map((x) => String(x || '').trim()).filter(Boolean).join('｜');
    const summary = postSummary(post);
    const head = [who, summary].filter(Boolean).join(' ');
    return [head, body].filter(Boolean).join('：') + (head || body ? '\n' : '') + '— 來自 DRVN';
};

async function captureElement(el) {
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#161415', useCORS: true, logging: false });
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/**
 * @param {object} post      動態牆貼文（socialFeed.toFeedPost 的形狀）
 * @param {object} opts
 * @param {HTMLElement} [opts.mediaEl]  要截圖的媒體區
 * @param {string} [opts.authorName]
 */
export async function sharePost(post, { mediaEl = null, authorName = '' } = {}) {
    const text = buildShareText(post, authorName);

    // 1) 圖＋文字
    if (mediaEl) {
        try {
            const blob = await captureElement(mediaEl);
            if (blob) return await shareImageBlob(blob, { filename: 'drvn-post.png', title: 'DRVN', text });
        } catch (e) {
            if (e?.name === 'AbortError') return 'cancelled';
            /* 截不到圖 → 往下改分享文字 */
        }
    }

    // 2) 純文字：打包版原生面板（shareImage 橋接受只有 text）
    try {
        if (window.webkit?.messageHandlers?.shareImage) {
            window.webkit.messageHandlers.shareImage.postMessage({ text });
            return 'native';
        }
    } catch { /* 往下 */ }

    // 3) 純文字：Web Share
    try {
        if (navigator.share) {
            await navigator.share({ title: 'DRVN', text });
            return 'webshare';
        }
    } catch (e) {
        if (e?.name === 'AbortError') return 'cancelled';
    }

    // 4) 剪貼簿
    try {
        await navigator.clipboard.writeText(text);
        return 'copied';
    } catch {
        return 'failed';
    }
}

export default sharePost;
