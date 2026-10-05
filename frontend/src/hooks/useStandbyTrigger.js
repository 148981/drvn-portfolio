import { useRef, useEffect, useCallback } from 'react';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * useStandbyTrigger — 閒置偵測（待機畫面的觸發器）
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 為什麼把它從 StandbyScreen.jsx 搬出來（2026-09 打包稽核）：
 *
 * App.jsx 原本這樣寫：
 *   // useStandbyTrigger 是 hook，必須 eager import；StandbyScreen 元件只在觸發時才 mount
 *   import StandbyScreen, { useStandbyTrigger } from './components/StandbyScreen';
 *
 * 註解本身就說明了問題：作者知道那個 1,219 行的待機畫面應該延後載入，
 * 但因為 hook 跟元件住在同一支檔案，靜態 import hook 就等於把整個元件
 * （約 53 KB）一起拖進首屏主 chunk —— 而使用者可能整場都不會閒置 3 分鐘。
 *
 * 把 hook 獨立成這支小檔案之後，App.jsx 可以 eager 引這裡、
 * 用 React.lazy 延後載入畫面本身（那正是 App.jsx 對其他 77 個元件的做法）。
 */

/** 閒置多久進入待機畫面 */
export const STANDBY_IDLE_MS = 180_000;   // 3 分鐘

export function useStandbyTrigger({ isActiveWorkout = false, onStandby = () => { } } = {}) {
    const timerRef = useRef(null);

    const reset = useCallback(() => {
        clearTimeout(timerRef.current);
        if (!isActiveWorkout) {
            timerRef.current = setTimeout(onStandby, STANDBY_IDLE_MS);
        }
    }, [isActiveWorkout, onStandby]);

    useEffect(() => {
        // 訓練進行中不進待機 —— 使用者正在看組數，畫面不能自己跳走
        if (isActiveWorkout) { clearTimeout(timerRef.current); return; }
        const events = ['touchstart', 'touchend', 'mousedown', 'keydown', 'scroll'];
        events.forEach(e => window.addEventListener(e, reset, { passive: true }));
        reset();
        return () => {
            clearTimeout(timerRef.current);
            events.forEach(e => window.removeEventListener(e, reset));
        };
    }, [isActiveWorkout, reset]);
}

export default useStandbyTrigger;
