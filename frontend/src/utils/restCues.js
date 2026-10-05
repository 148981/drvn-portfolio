// utils/restCues.js
// 休息計時器的「跨背景提醒」工具集：提示音 + 系統通知 + 螢幕喚醒鎖。
// 解決「鎖屏/切到別的 App 時，休息結束沒人叫醒你」的痛點。
//
// 設計原則：
//   - 全部 best-effort：任何 API 不支援或被拒絕都不應讓訓練流程中斷（靜默降級）。
//   - iOS Safari 限制：AudioContext 必須在「使用者手勢」中先解鎖一次，之後才能在計時器回呼裡播放。
//   - 提供開關（localStorage），讓使用者能關掉聲音/通知。

const SOUND_DISABLED_KEY = 'drvn_rest_sound_disabled';
const NOTIFY_DISABLED_KEY = 'drvn_rest_notify_disabled';

// ─────────────────────────────────────────────────────────────
// 設定開關
// ─────────────────────────────────────────────────────────────
export const isRestSoundEnabled = () => {
    try { return localStorage.getItem(SOUND_DISABLED_KEY) !== '1'; } catch { return true; }
};
export const setRestSoundEnabled = (enabled) => {
    try { localStorage.setItem(SOUND_DISABLED_KEY, enabled ? '0' : '1'); } catch { /* noop */ }
};
export const isRestNotifyEnabled = () => {
    try { return localStorage.getItem(NOTIFY_DISABLED_KEY) !== '1'; } catch { return true; }
};
export const setRestNotifyEnabled = (enabled) => {
    try { localStorage.setItem(NOTIFY_DISABLED_KEY, enabled ? '0' : '1'); } catch { /* noop */ }
};

// ─────────────────────────────────────────────────────────────
// 1) 提示音（Web Audio，無需音檔，體積為零）
// ─────────────────────────────────────────────────────────────
let _audioCtx = null;

const getAudioCtx = () => {
    if (_audioCtx) return _audioCtx;
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        _audioCtx = new Ctx();
        return _audioCtx;
    } catch {
        return null;
    }
};

/**
 * 在使用者手勢中呼叫一次（如「開始訓練」或第一次按「完成本組」），
 * 解鎖 iOS 的 AudioContext，讓之後計時器回呼能成功播放。
 */
export const unlockRestAudio = () => {
    const ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
        ctx.resume().catch(() => { /* noop */ });
    }
    // 播一個 0 音量的極短音，徹底完成 iOS 解鎖
    try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.01);
    } catch { /* noop */ }
};

/**
 * 播放「休息結束」提示音：兩聲上揚的短嗶（悅耳、不刺耳）。
 */
export const playRestEndSound = () => {
    if (!isRestSoundEnabled()) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => { /* noop */ });

    const beep = (startAt, freq) => {
        try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, startAt);
            // 快速起音 + 緩降，避免爆音
            gain.gain.setValueAtTime(0.0001, startAt);
            gain.gain.exponentialRampToValueAtTime(0.35, startAt + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.18);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(startAt);
            osc.stop(startAt + 0.2);
        } catch { /* noop */ }
    };

    const t0 = ctx.currentTime;
    beep(t0, 660);          // 第一聲
    beep(t0 + 0.22, 880);   // 第二聲（上揚，提示「結束」）
};

// ─────────────────────────────────────────────────────────────
// 2) 系統通知（只在分頁切到背景時推，避免前景重複打擾）
// ─────────────────────────────────────────────────────────────

/** 在使用者手勢中呼叫一次，預先索取通知權限（不阻塞）。 */
export const ensureNotifyPermission = async () => {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted' || Notification.permission === 'denied') {
        return Notification.permission;
    }
    try { return await Notification.requestPermission(); }
    catch { return Notification.permission; }
};

/**
 * 推播「休息結束」通知。只在背景時推（前景有聲音與震動就夠了）。
 * 優先用 Service Worker registration.showNotification（iOS PWA 較可靠），
 * 退回 new Notification()。
 */
export const notifyRestEnd = async ({ onlyWhenHidden = true } = {}) => {
    if (!isRestNotifyEnabled()) return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (onlyWhenHidden && document.visibilityState === 'visible') return;

    const title = '休息結束 💪';
    const options = {
        body: '回到訓練，開始下一組！',
        tag: 'drvn-rest-end',          // 同 tag 會取代舊通知，不會疊一堆
        renotify: true,
        icon: '/images/icon-192.png',  // 不存在也不影響顯示
        badge: '/images/icon-192.png',
        data: { route: '/workout-session-mobile' },
        requireInteraction: false,
    };

    try {
        if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg && reg.showNotification) {
                await reg.showNotification(title, options);
                return;
            }
        }
        // 退回路徑
        // eslint-disable-next-line no-new
        new Notification(title, options);
    } catch { /* noop */ }
};

// ─────────────────────────────────────────────────────────────
// 3) 螢幕喚醒鎖（Wake Lock）— 休息時讓螢幕不自動鎖
// ─────────────────────────────────────────────────────────────
let _wakeLock = null;

export const requestWakeLock = async () => {
    try {
        if ('wakeLock' in navigator && navigator.wakeLock?.request) {
            _wakeLock = await navigator.wakeLock.request('screen');
            // 系統可能自行釋放（如切背景），記錄下來以便回前景重取
            _wakeLock.addEventListener?.('release', () => { _wakeLock = null; });
            return true;
        }
    } catch { /* 被拒或不支援 → 靜默 */ }
    return false;
};

export const releaseWakeLock = async () => {
    try {
        if (_wakeLock) {
            await _wakeLock.release();
            _wakeLock = null;
        }
    } catch { _wakeLock = null; }
};

export const hasWakeLock = () => !!_wakeLock;
