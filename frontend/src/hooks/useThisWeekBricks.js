/**
 * 🪝 useThisWeekBricks — 取本週 bricks（Cover Flow 動態資料源）
 *
 * Lazy fetch /api/cardio-plan/{userId}/this-week 並追蹤 loading / error。
 *
 * 不主動 polling — Cover Flow overlay 開啟時呼叫一次即可。
 * 完成 brick 後請外部呼叫 refresh() 以更新打勾狀態。
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import apiClient from '../api/client';
import { getUserId } from '../utils/auth';

export function useThisWeekBricks({ enabled = true } = {}) {
    const [bricks, setBricks] = useState([]);
    const [week, setWeek] = useState(null);
    const [completion, setCompletion] = useState(null);
    // 「這一週沒有課」≠「根本沒有計劃」。plan 有值 = 計劃存在（可能還沒開始、
    // 也可能整期已經跑完）—— 少了這一格，有計劃的人會被顯示成「尚未建立計劃」。
    const [plan, setPlan] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const lastFetchRef = useRef(0);

    const refresh = useCallback(async () => {
        const userId = getUserId();
        if (!userId) { setError('no_user'); return; }
        setLoading(true);
        try {
            const res = await apiClient.get(`/api/cardio-plan/${userId}/this-week`);
            const data = res.data || {};
            setBricks(Array.isArray(data.bricks) ? data.bricks : []);
            setWeek(data.week || null);
            setCompletion(data.completion || null);
            setPlan(data.plan || null);
            setError(null);
            lastFetchRef.current = Date.now();
        } catch (e) {
            console.warn('[useThisWeekBricks] fetch failed:', e?.message);
            setError('fetch_failed');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!enabled) return;
        refresh();
    }, [enabled, refresh]);

    return { bricks, week, completion, plan, loading, error, refresh };
}

export default useThisWeekBricks;
