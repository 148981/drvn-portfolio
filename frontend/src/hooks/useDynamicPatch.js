/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * useDynamicPatch — 卡牌內個別數據點的動態填補 Hook
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 與 useSkeletonSWR 的根本差異：
 *   useSkeletonSWR  → 控制「整頁」骨架屏（全頁遮蓋）
 *   useDynamicPatch → 控制「卡牌內個別數據點」的微型脈衝佔位符
 *                     卡牌框架始終渲染，只有動態數字/文字位置有佔位符
 *
 * 狀態機：
 *   patchReady = false → 顯示脈衝佔位符（Pulse Placeholder）
 *   patchReady = true  → 數據淡入（Fade-in，200ms）
 *
 * 快取命中捷徑 (hasCache = true)：
 *   patchReady 從一開始就是 true，直接渲染，完全跳過動畫。
 *   這讓使用者再次進入頁面時感受到 0 毫秒載入。
 *
 * 最小顯示時間保護 (Anti-Flicker)：
 *   僅初次載入才強制佔位符至少顯示 minMs (預設 400ms)。
 *   API 在 50ms 回應也要等夠 minMs 才執行 Fade-in。
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import { useState, useEffect, useRef } from 'react';
import useSWR from 'swr';

const DEFAULT_MIN_MS = 400;

/**
 * @param {string|null} key - SWR key（API 路徑）；null = 暫停請求
 * @param {{
 *   hasCache?: boolean,  // 是否已有模組層級快取（如 _dashboardCache）
 *   minMs?: number,      // 最小佔位符顯示時長（ms）
 *   swrOptions?: object, // 額外 SWR 選項
 * }} options
 *
 * @returns {{
 *   patchReady: boolean,   // false = 佔位符, true = 填入真實數據
 *   data: any,
 *   error: any,
 *   isValidating: boolean, // 背景 revalidation（不影響 patchReady）
 *   mutate: Function,
 * }}
 *
 * 使用範例（卡牌內數據點）：
 *   const { patchReady, data } = useDynamicPatch(
 *     userId ? `/api/cardio/sessions/${userId}?limit=1` : null,
 *     { hasCache: hasCachedData }
 *   );
 *
 *   <DataPulse ready={patchReady} w={80} h={44}>
 *     {runDistance.toFixed(1)} km
 *   </DataPulse>
 */
export function useDynamicPatch(key, { hasCache = false, minMs = DEFAULT_MIN_MS, swrOptions = {} } = {}) {
    const { data, error, isLoading, isValidating, mutate } = useSWR(key ?? null, swrOptions);

    // 初次載入：SWR 正在請求且無任何快取資料
    const isFirstLoad = isLoading && data === undefined;

    /**
     * 初始 patchReady 判斷：
     *   有模組快取 (hasCache) → 立即 true（完全跳過動畫）
     *   key = null            → 立即 true（無需請求）
     *   SWR 直接命中 HTTP 快取 (!isFirstLoad) → 立即 true
     *   否則 (isFirstLoad)    → 從 false 開始，等待 minMs + API 回應
     */
    const immediateReady = hasCache || !key || !isFirstLoad;
    const [patchReady, setPatchReady] = useState(immediateReady);

    // minElapsed: 最小顯示時間是否已過
    const [minElapsed, setMinElapsed] = useState(immediateReady);

    // 防止 StrictMode 雙次執行導致計時器重複啟動
    const startedRef = useRef(false);
    const timerRef   = useRef(null);

    // ── 最小時間計時器（只在初次載入時觸發）─────────────────────────
    useEffect(() => {
        if (immediateReady) return; // 快取命中，不需計時

        if (isFirstLoad && !startedRef.current) {
            startedRef.current = true;
            setMinElapsed(false);
            timerRef.current = setTimeout(() => {
                setMinElapsed(true);
            }, minMs);
        }

        if (!isFirstLoad && !startedRef.current) {
            // SWR 在掛載時就已有 HTTP 快取，立即 ready
            setMinElapsed(true);
        }

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isFirstLoad, immediateReady]);

    // ── 合併條件：minElapsed AND (data 已到 OR error) → patchReady ──
    useEffect(() => {
        if (!patchReady && minElapsed && (data !== undefined || error || !key)) {
            setPatchReady(true);
        }
    }, [minElapsed, data, error, key, patchReady]);

    return { patchReady, data, error, isValidating, mutate };
}

export default useDynamicPatch;
