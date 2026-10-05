import { useEffect, useRef } from 'react';

/**
 * 會在分頁切到背景（document.hidden）時自動暫停的 setInterval。
 *
 * 一般 setInterval 即使使用者切到別的分頁、把 App 丟到背景，仍會持續
 * 觸發回呼（通常是打 API / 重渲染），白白浪費電力、流量與 CPU。
 * 這個 hook 在 visibilitychange 時暫停計時器，回到前景時立刻補跑一次再恢復。
 *
 * ⚠️ 只適合「非關鍵、可暫停」的輪詢（同步狀態、社群動態、排行榜刷新等）。
 *    運動中即時追蹤、計時器等不可中斷的邏輯請勿使用，以免背景時停止紀錄。
 *
 * @param {() => void} callback   每次觸發要執行的函式
 * @param {number|null} delay     間隔毫秒；傳 null 可暫停
 * @param {object}   [options]
 * @param {boolean}  [options.runOnFocus=true]  回到前景時是否立即補跑一次
 */
export function useVisibilityInterval(callback, delay, { runOnFocus = true } = {}) {
  const savedCallback = useRef(callback);

  // 永遠保存最新的 callback，避免 stale closure，也不用把它放進 deps
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay == null) return undefined;

    let intervalId = null;

    const tick = () => savedCallback.current?.();

    const start = () => {
      if (intervalId == null) {
        intervalId = setInterval(tick, delay);
      }
    };

    const stop = () => {
      if (intervalId != null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        if (runOnFocus) tick(); // 回前景立即補抓一次，避免畫面是舊資料
        start();
      }
    };

    // 初始：只有在前景才啟動
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      stop();
    };
  }, [delay, runOnFocus]);
}

export default useVisibilityInterval;
