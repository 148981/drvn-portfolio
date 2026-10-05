/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * useSkeletonSWR — Progressive Skeleton Loading Hook
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * State Machine (3 states):
 *   A → 'loading' : SWR isLoading=true，初次載入，無快取
 *   B → 'data'    : SWR data 成功取得
 *   C → 'error'   : SWR error 有值且無快取資料
 *
 * Anti-flicker (防閃爍) 規則：
 *   - 僅初次載入（State A）才強制最小顯示 MIN_SKELETON_MS
 *   - SWR 快取命中時直接回傳 'data'，跳過骨架屏（0ms 延遲）
 *   - 背景 revalidation (isValidating 但已有 data) 不改變 displayState
 *
 * Layout Shift 防護：
 *   - 骨架屏與真實內容保持相同外框尺寸
 *   - 狀態切換透過 opacity fade（不改變 DOM 結構）
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import { useState, useEffect, useRef } from 'react';
import useSWR from 'swr';

/** 最小骨架屏顯示時長 (ms)。防止 API 極速回應時骨架屏一閃而過 */
const MIN_SKELETON_MS = 400;

/**
 * @param {string|null} key   - SWR key（通常為 API URL）；null 代表不發請求
 * @param {object} swrOptions - 透傳給 useSWR 的額外選項
 * @returns {{
 *   displayState: 'loading' | 'data' | 'error',
 *   data: any,
 *   error: any,
 *   isValidating: boolean,
 *   mutate: Function
 * }}
 *
 * 使用範例：
 *   const { displayState, data } = useSkeletonSWR('/api/workout/records');
 */
export function useSkeletonSWR(key, swrOptions = {}) {
  const { data, error, isLoading, isValidating, mutate } = useSWR(key, swrOptions);

  /**
   * isFirstLoad：判斷是否為初次載入（無快取資料）
   *   - SWR isLoading=true 代表：沒有任何快取，正在等待首次回應
   *   - 若快取命中，isLoading 永遠為 false，data 直接可用
   */
  const isFirstLoad = isLoading && !data;

  /**
   * minTimeElapsed：最小時間是否已過
   * 只在 isFirstLoad 時才啟動計時器
   */
  const [minTimeElapsed, setMinTimeElapsed] = useState(!isFirstLoad);
  const timerRef = useRef(null);
  const didStartTimerRef = useRef(false);

  useEffect(() => {
    // 只在進入初次載入狀態時啟動計時器（且只觸發一次）
    if (isFirstLoad && !didStartTimerRef.current) {
      didStartTimerRef.current = true;
      setMinTimeElapsed(false);
      timerRef.current = setTimeout(() => {
        setMinTimeElapsed(true);
      }, MIN_SKELETON_MS);
    }

    // 若從未進入 isFirstLoad（快取命中），確保 elapsed=true
    if (!isFirstLoad && !didStartTimerRef.current) {
      setMinTimeElapsed(true);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isFirstLoad]);

  /**
   * displayState 計算邏輯：
   *
   * 1. 快取命中（!isFirstLoad && data）→ 'data'（直接渲染，0ms）
   * 2. 初次載入中，且最小時間未過     → 'loading'（骨架屏）
   * 3. 初次載入完成，有資料           → 'data'
   * 4. 錯誤，且沒有任何資料           → 'error'
   * 5. 錯誤，但有舊快取資料           → 'data'（展示舊資料，不顯示 error 畫面）
   */
  let displayState;

  if (isFirstLoad || !minTimeElapsed) {
    // State A: 骨架屏
    displayState = 'loading';
  } else if (data !== undefined) {
    // State B: 資料就緒（含快取舊資料 + 新資料）
    displayState = 'data';
  } else if (error) {
    // State C: 錯誤（且無任何快取可用）
    displayState = 'error';
  } else {
    // key 為 null 或 undefined（停用請求）→ 視為 loading
    displayState = key ? 'loading' : 'data';
  }

  return {
    displayState,
    data,
    error,
    isValidating,  // 背景 revalidation 狀態（可用來顯示 SyncStatusIndicator）
    mutate,
  };
}

/**
 * useMultiSkeletonSWR — 多個 SWR key 聚合版本
 *
 * 當一個頁面需要同時從多個端點取資料時使用。
 * 只要有任一 key 仍在初次載入，displayState 就維持 'loading'。
 *
 * @param {Array<{key: string, options?: object}>} requests
 * @returns {{
 *   displayState: 'loading' | 'data' | 'error',
 *   results: Array<{data, error, isValidating, mutate}>,
 *   allData: Array<any>
 * }}
 *
 * 使用範例：
 *   const { displayState, allData } = useMultiSkeletonSWR([
 *     { key: '/api/workout/records' },
 *     { key: '/api/user/profile' },
 *   ]);
 */
export function useMultiSkeletonSWR(requests = []) {
  // 每個 key 分別呼叫 useSkeletonSWR
  // 注意：hooks 數量必須固定（React rules），所以這裡用最多支援 8 個
  const r0 = useSkeletonSWR(requests[0]?.key ?? null, requests[0]?.options ?? {});
  const r1 = useSkeletonSWR(requests[1]?.key ?? null, requests[1]?.options ?? {});
  const r2 = useSkeletonSWR(requests[2]?.key ?? null, requests[2]?.options ?? {});
  const r3 = useSkeletonSWR(requests[3]?.key ?? null, requests[3]?.options ?? {});
  const r4 = useSkeletonSWR(requests[4]?.key ?? null, requests[4]?.options ?? {});
  const r5 = useSkeletonSWR(requests[5]?.key ?? null, requests[5]?.options ?? {});
  const r6 = useSkeletonSWR(requests[6]?.key ?? null, requests[6]?.options ?? {});
  const r7 = useSkeletonSWR(requests[7]?.key ?? null, requests[7]?.options ?? {});

  const allResults = [r0, r1, r2, r3, r4, r5, r6, r7].slice(0, requests.length);

  // 聚合 displayState：任一在 loading → 整體 loading；任一有 error 且無 data → error
  const hasLoading = allResults.some((r) => r.displayState === 'loading');
  const hasError   = allResults.some((r) => r.displayState === 'error');

  let displayState = 'data';
  if (hasLoading) displayState = 'loading';
  else if (hasError) displayState = 'error';

  return {
    displayState,
    results: allResults,
    allData: allResults.map((r) => r.data),
  };
}

export default useSkeletonSWR;
