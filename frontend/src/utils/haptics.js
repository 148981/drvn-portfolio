/**
 * haptics.js — DRVN 震動橋接
 * ─────────────────────────────────────────────────────────────
 * iOS WKWebView Bridge：window.webkit.messageHandlers.haptic.postMessage(style)
 *   native 端 (WebView.swift) 接受： 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'
 *   無 selectionXxx 事件 → 我們把它映射到 light / rigid。
 *
 * Android Web Fallback：navigator.vibrate(ms)
 *   注意：Chrome 要求使用者第一次互動之後才會啟用，否則靜默 no-op。
 *
 * Safari Desktop / iPad Safari：navigator.vibrate 不支援 → no-op。
 *
 * Debug：把 localStorage.setItem('drvn:haptic_debug','1') 後重整，
 *        console 會印出每次 trigger 與選用的路線。
 * ─────────────────────────────────────────────────────────────
 */

// 啟動 debug：localStorage.setItem('drvn:haptic_debug','1')
const DEBUG = (() => {
    try { return typeof window !== 'undefined' && window.localStorage?.getItem('drvn:haptic_debug') === '1'; }
    catch { return false; }
})();

// iOS native 端註冊的 channel name 是 "haptic"（見 ios/FitnessApp/WebView.swift）
const IOS_BRIDGE_NAME = 'haptic';

// 一次性偵測 + 記錄環境（debug 時印一次）
let probed = false;
function probeEnv() {
    if (probed || !DEBUG) return;
    probed = true;
    /* eslint-disable no-console */
    const hasWebkit = !!(typeof window !== 'undefined' && window.webkit?.messageHandlers);
    const hasBridge = !!(hasWebkit && window.webkit.messageHandlers[IOS_BRIDGE_NAME]);
    const hasVibrate = !!(typeof navigator !== 'undefined' && navigator.vibrate);
    console.log('[haptic] env', {
        hasWebkit, hasBridge,
        registeredHandlers: hasWebkit ? Object.keys(window.webkit.messageHandlers || {}) : [],
        hasVibrate,
        ua: typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a',
    });
    /* eslint-enable no-console */
}

// 把抽象事件 type → iOS impact style
function mapTypeToImpactStyle(type) {
    switch (type) {
        case 'selectionChanged': return 'light';     // 旋鈕轉到下一個刻度
        case 'selectionStart':   return 'rigid';     // 旋鈕剛被按下
        case 'selectionEnd':     return 'soft';      // 旋鈕鬆開
        case 'heavy':            return 'heavy';
        case 'medium':           return 'medium';
        case 'rigid':            return 'rigid';
        case 'soft':             return 'soft';
        case 'light':
        default:                 return 'light';
    }
}

// 把抽象事件 type → Android vibrate 毫秒
function mapTypeToVibrateMs(type) {
    switch (type) {
        case 'selectionChanged': return 8;
        case 'selectionStart':   return 12;
        case 'selectionEnd':     return 6;
        case 'heavy':            return 30;
        case 'medium':           return 20;
        case 'rigid':            return 15;
        case 'soft':             return 8;
        case 'light':
        default:                 return 10;
    }
}

const triggerNativeHaptic = (type) => {
    probeEnv();

    try {
        // 1) iOS WKWebView 原生 bridge — 最佳路線
        if (typeof window !== 'undefined' &&
            window.webkit?.messageHandlers?.[IOS_BRIDGE_NAME]) {
            const style = mapTypeToImpactStyle(type);
            window.webkit.messageHandlers[IOS_BRIDGE_NAME].postMessage(style);
            if (DEBUG) console.log('[haptic] ios bridge →', type, '⇒', style); // eslint-disable-line
            return;
        }

        // 1.5) 舊 fitnessApp handler（Xcode 未 rebuild 前的相容路線）
        if (typeof window !== 'undefined' &&
            window.webkit?.messageHandlers?.fitnessApp) {
            const style = mapTypeToImpactStyle(type);
            window.webkit.messageHandlers.fitnessApp.postMessage({ type: 'hapticFeedback', style });
            if (DEBUG) console.log('[haptic] fitnessApp bridge →', type, '⇒', style); // eslint-disable-line
            return;
        }

        // 2) Web Vibration API — Android Chrome / Firefox
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            const ms = mapTypeToVibrateMs(type);
            const ok = navigator.vibrate(ms);
            if (DEBUG) console.log('[haptic] vibrate', ms, 'ms →', ok); // eslint-disable-line
            return;
        }

        // 3) 桌機 / Safari iOS（無 bridge、無 vibrate）→ no-op
        if (DEBUG) console.log('[haptic] no available channel for', type); // eslint-disable-line
    } catch (e) {
        if (DEBUG) console.warn('[haptic] error', e); // eslint-disable-line
    }
};

// 一般按鈕點擊 (Light Impact)
export const hapticTap = () => triggerNativeHaptic('light');

// 旋鈕/滑桿開始拖曳
export const hapticSelectionStart = () => triggerNativeHaptic('selectionStart');

// 旋鈕/滑桿刻度改變
export const hapticSelectionChanged = () => triggerNativeHaptic('selectionChanged');

// 旋鈕/滑桿結束拖曳
export const hapticSelectionEnd = () => triggerNativeHaptic('selectionEnd');

// 成功（如送出表單、完成）
export const hapticSuccess = () => triggerNativeHaptic('medium');

// 警告 / 錯誤
export const hapticWarning = () => triggerNativeHaptic('heavy');

// 🎉 慶祝觸覺 — 模擬 iOS UINotificationFeedbackGenerator(.success) 的原生質感：
//    輕點起手 → 中震主拍 → 重震收尾，節奏 0/110/260ms（非單一大震，是「有句讀」的震動）。
//    用於：營養達標、InBody 進步、PR 等值得慶祝的時刻。
export const hapticCelebrate = () => {
    triggerNativeHaptic('rigid');
    setTimeout(() => triggerNativeHaptic('medium'), 110);
    setTimeout(() => triggerNativeHaptic('heavy'), 260);
};

// ── 通用入口：語意型別 → 統一觸覺規則（全 App 收斂用）──
// tap/light=輕點、success=成功(medium)、warning/error=警示(heavy)
const TYPE_ALIAS = {
    tap: 'light',
    success: 'medium',
    warning: 'heavy',
    error: 'heavy',
    completion: 'heavy',
    selection: 'selectionChanged',
};
export const haptic = (type = 'light') => {
    const t = TYPE_ALIAS[type] || type;
    triggerNativeHaptic(t);
};
export default haptic;
