// ─────────────────────────────────────────────────────────────
// 🔊 Voice Coach — 跑步即時語音播報
//
// 為什麼需要：跑者跑步時手在擺動、陽光反光、喘氣中根本看不了螢幕。
// 真正的跑步 App（NRC / Strava / Garmin）都靠耳機播報距離、配速、心率。
// 本模組提供統一入口 speak()，優先走 iOS 原生 AVSpeechSynthesizer
// （透過 WebKit messageHandler），否則退回瀏覽器 Web Speech API。
//
// 設計原則：
//   • 任何環境都不該丟例外（沒有語音合成 → 靜默 no-op）。
//   • 同一段話進來會「中斷上一段」，避免在路口連報疊字。
//   • 預設 zh-TW；找不到中文語音時退回系統預設。
// ─────────────────────────────────────────────────────────────

const LS_KEY = 'cardio_voice_enabled';

// 預設開啟（跑者標配）。使用者可在跑步前關閉。
export const isVoiceEnabled = () => localStorage.getItem(LS_KEY) !== 'false';
export const setVoiceEnabled = (on) => {
    try { localStorage.setItem(LS_KEY, String(!!on)); } catch { /* noop */ }
};

// 是否處於 iOS 原生殼層（可走 AVSpeechSynthesizer 橋接）
const hasNativeTTS = () => {
    try {
        return !!(window?.webkit?.messageHandlers?.tts);
    } catch { return false; }
};

let _voicesCache = null;
const pickZhVoice = () => {
    try {
        if (!('speechSynthesis' in window)) return null;
        if (!_voicesCache || _voicesCache.length === 0) {
            _voicesCache = window.speechSynthesis.getVoices();
        }
        const v = _voicesCache || [];
        // 優先 zh-TW，其次任何中文，最後 null（用系統預設）
        return (
            v.find(x => /zh[-_]TW/i.test(x.lang)) ||
            v.find(x => /^zh/i.test(x.lang)) ||
            null
        );
    } catch { return null; }
};

// 部分瀏覽器要等 voiceschanged 才拿得到語音清單
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
        window.speechSynthesis.onvoiceschanged = () => {
            _voicesCache = window.speechSynthesis.getVoices();
        };
    } catch { /* noop */ }
}

/**
 * 播報一段文字。
 * @param {string} text 要念出來的句子（中文）
 * @param {object} opts { interrupt=true 是否中斷前一段, rate, lang }
 */
export const speak = (text, opts = {}) => {
    if (!text) return;
    if (!isVoiceEnabled()) return;

    const { interrupt = true, rate = 1.0, lang = 'zh-TW' } = opts;

    // ── (A) iOS 原生橋接優先 ──
    if (hasNativeTTS()) {
        try {
            window.webkit.messageHandlers.tts.postMessage({ text, lang, rate, interrupt });
            return;
        } catch { /* 落到瀏覽器路徑 */ }
    }

    // ── (B) 瀏覽器 Web Speech API ──
    try {
        if (!('speechSynthesis' in window)) return;
        if (interrupt) window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang;
        u.rate = rate;
        const v = pickZhVoice();
        if (v) u.voice = v;
        window.speechSynthesis.speak(u);
    } catch { /* 靜默：語音失敗不影響跑步追蹤 */ }
};

export const stopSpeaking = () => {
    try {
        if (hasNativeTTS()) {
            window.webkit.messageHandlers.tts.postMessage({ command: 'STOP' });
        }
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    } catch { /* noop */ }
};

// ── 句子組裝 helpers ──────────────────────────────────────────

// 配速秒/km → 「5 分 12 秒」
const paceToWords = (secPerKm) => {
    if (!secPerKm || secPerKm <= 0 || !isFinite(secPerKm)) return null;
    const m = Math.floor(secPerKm / 60);
    const s = Math.round(secPerKm % 60);
    if (s === 0) return `${m} 分`;
    return `${m} 分 ${s} 秒`;
};

/**
 * 組裝整公里里程碑播報句。
 * @param {object} p { km, avgPaceSec, lastKmPaceSec, avgHr }
 * @returns {string}
 */
export const buildKmAnnouncement = ({ km, avgPaceSec, lastKmPaceSec, avgHr }) => {
    const parts = [`第 ${km} 公里`];
    const lastPace = paceToWords(lastKmPaceSec);
    const avgPace = paceToWords(avgPaceSec);
    if (lastPace) {
        parts.push(`本公里配速 ${lastPace}`);
    } else if (avgPace) {
        parts.push(`平均配速 ${avgPace}`);
    }
    if (avgHr && avgHr > 0) {
        parts.push(`平均心率 ${Math.round(avgHr)}`);
    }
    return parts.join('，');
};
