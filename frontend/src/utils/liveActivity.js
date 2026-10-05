import { formatPace as fmtPace } from './format';
// 🏝️ Live Activity（鎖屏卡片 + 靈動島）JS 橋接。
//
// 只在跑步進行中存在：start 建立、update 更新（節流）、stop 結束。
// 非 iOS 環境（無 webkit bridge）所有呼叫皆為 no-op，安全。
//
// 對應原生端：ios/FitnessApp/LiveActivity/LiveActivityManager.swift

const bridge = () => (typeof window !== 'undefined'
    ? window?.webkit?.messageHandlers?.liveActivity
    : null);

const post = (payload) => {
    try { bridge()?.postMessage(payload); } catch (_) { /* 非 iOS：忽略 */ }
};

let lastUpdateAt = 0;
const UPDATE_THROTTLE_MS = 3000; // 鎖屏數據 3 秒更新一次即可，省電

/** 將秒配速轉為 5'32" 格式 */
export const formatPaceLabel = (paceSecPerKm) => fmtPace(paceSecPerKm, '--');   // 🩹 J: 單一真相源

export const startRunActivity = (state = {}) => {
    lastUpdateAt = 0;
    post({ command: 'START', ...normalize(state) });
};

export const updateRunActivity = (state = {}, { force = false } = {}) => {
    const now = Date.now();
    if (!force && now - lastUpdateAt < UPDATE_THROTTLE_MS) return;
    lastUpdateAt = now;
    post({ command: 'UPDATE', ...normalize(state) });
};

export const stopRunActivity = (state = {}) => {
    post({ command: 'STOP', ...normalize(state) });
};

const normalize = ({ distanceKm = 0, paceSecPerKm = 0, paceLabel, elapsedSec = 0, calories = 0, isPaused = false }) => {
    const sec = Math.max(0, Math.round(Number(elapsedSec) || 0));
    return {
        distanceKm: Number(distanceKm) || 0,
        paceLabel: paceLabel || formatPaceLabel(paceSecPerKm),
        elapsedSec: sec,
        calories: Math.max(0, Math.round(Number(calories) || 0)),
        isPaused: !!isPaused,
        // ⏱ 自走式計時錨點 —
        //    WKWebView 進背景後 JS 計時器會被系統節流，鎖屏卡的「已用時間」
        //    就卡在最後一次推送的值（使用者回報：跑到某分鐘就停止更新）。
        //    帶上這個錨點，原生端可用 ActivityKit 的 Text(timerInterval:)
        //    讓時間「自己走」，不依賴 JS 推送。距離/配速仍靠 UPDATE 刷新。
        startedAtEpoch: Math.round((Date.now() - sec * 1000) / 1000),
        updatedAtEpoch: Math.round(Date.now() / 1000),
    };
};

// ────────────────────────────────────────────────────────────
// 🏋️ 重訓 Live Activity（與跑步共用同一個原生 Activity，mode:'gym'）
//    鎖屏卡顯示：時間 / 目前動作 / 組數進度；點擊回訓練頁。
// ────────────────────────────────────────────────────────────
const normalizeGym = ({ exerciseName = '--', setLabel = '--', elapsedSec = 0, calories = 0, isPaused = false }) => ({
    mode: 'gym',
    gymExercise: String(exerciseName || '--').slice(0, 12),
    gymSetLabel: String(setLabel || '--'),
    distanceKm: 0,
    paceLabel: '--',
    elapsedSec: Math.max(0, Math.round(Number(elapsedSec) || 0)),
    calories: Math.max(0, Math.round(Number(calories) || 0)),
    isPaused: !!isPaused,
    // ⏱ 自走計時錨點（同跑步：讓鎖屏時間由系統自己走，不受 JS 背景節流影響）
    startedAtEpoch: Math.round((Date.now() - Math.max(0, Math.round(Number(elapsedSec) || 0)) * 1000) / 1000),
    updatedAtEpoch: Math.round(Date.now() / 1000),
});

export const startGymActivity = (state = {}) => {
    lastUpdateAt = 0;
    post({ command: 'START', ...normalizeGym(state) });
};

export const updateGymActivity = (state = {}, { force = false } = {}) => {
    const now = Date.now();
    if (!force && now - lastUpdateAt < UPDATE_THROTTLE_MS) return;
    lastUpdateAt = now;
    post({ command: 'UPDATE', ...normalizeGym(state) });
};

export const stopGymActivity = (state = {}) => {
    post({ command: 'STOP', ...normalizeGym(state) });
};

/* 🗓️ 「排課中」Live Activity 已移除（2026-09-28）：原生端只有跑步與重訓兩種版面，
   mode:'plan' 會被畫成「RUNNING · 0.00 km」，使用者沒跑步卻看到跑步卡。 */
