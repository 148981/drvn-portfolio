import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import apiClient from '../../api/client';
import { getUserId } from '../../utils/auth';
import { readInvites, activeInvites, inboxInvites } from '../../utils/trainTogether';

/**
 * useTrainTogether — 一起練的行為層
 * ══════════════════════════════════════════════════════════════════════
 * 這支補的是整個社群系統最明顯的斷點：
 *   後端有 /api/social/challenge/respond 與 /inbox，前端 0 個地方呼叫。
 *   也就是說邀請送得出去、但沒有任何畫面能接受它 —— 送出去就消失。
 *
 * 這裡把「收邀請 → 接受／拒絕 → 回報進度 → 完成」整條接起來，
 * 兩個社群頁共用同一份，不要各自再實作一次（那正是上一輪的教訓）。
 *
 * 錯誤一律往外丟給呼叫端顯示 —— 靜默失敗會讓使用者以為按了有效。
 */
export function useTrainTogether(userIdProp, { pollMs = 60_000 } = {}) {
    const userId = userIdProp || getUserId();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [offline, setOffline] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const mounted = useRef(true);

    useEffect(() => () => { mounted.current = false; }, []);

    const refresh = useCallback(async () => {
        if (!userId) { setLoading(false); return; }
        try {
            const res = await apiClient.get(`/api/social/challenge/list/${userId}`);
            if (!mounted.current) return;
            setRows(readInvites(res?.data?.challenges || [], userId));
            setOffline(false);
        } catch (err) {
            if (!mounted.current) return;
            // 連不到就標記離線，讓畫面說「暫時看不到」而不是假裝一筆都沒有
            setOffline(true);
            console.warn('一起練清單讀取失敗', err?.message || err);
        } finally {
            if (mounted.current) setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        refresh();
        if (!pollMs) return undefined;
        const t = setInterval(refresh, pollMs);
        const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
    }, [refresh, pollMs]);

    /** 接受或拒絕一筆邀請。回傳 true 代表成功，讓呼叫端決定要說什麼。 */
    const respond = useCallback(async (challengeId, action) => {
        if (!userId || !challengeId) return false;
        setBusyId(challengeId);
        // 樂觀更新：立刻反映，失敗再拉回真實狀態
        setRows((prev) => prev.map((r) => (
            r.id === challengeId
                ? { ...r, status: action === 'accept' ? 'accepted' : 'declined', cta: action === 'accept' ? 'progress' : null }
                : r
        )));
        try {
            await apiClient.post('/api/social/challenge/respond', {
                user_id: userId, challenge_id: challengeId, action,
            });
            await refresh();
            return true;
        } catch (err) {
            await refresh();            // 以伺服器為準，不要留下假的已接受
            throw err;
        } finally {
            if (mounted.current) setBusyId(null);
        }
    }, [userId, refresh]);

    /** 回報自己這一筆的累積進度（跑了幾 km / 舉了多少 volume）。 */
    const reportProgress = useCallback(async (challengeId, progress) => {
        if (!userId || !challengeId) return null;
        const res = await apiClient.post('/api/social/challenge/progress', {
            user_id: userId, challenge_id: challengeId, progress: Number(progress) || 0,
        });
        await refresh();
        return res?.data || null;
    }, [userId, refresh]);

    /** 送出一筆新的邀請。 */
    const invite = useCallback(async (payload) => {
        if (!userId) throw new Error('尚未登入');
        const res = await apiClient.post('/api/social/challenge/send', {
            from_user_id: userId, ...payload,
        });
        await refresh();
        return res?.data || null;
    }, [userId, refresh]);

    const inbox = useMemo(() => inboxInvites(rows), [rows]);
    const active = useMemo(() => activeInvites(rows), [rows]);
    const done = useMemo(() => rows.filter((r) => r.status === 'completed'), [rows]);

    return {
        userId, rows, inbox, active, done,
        inboxCount: inbox.length,
        loading, offline, busyId,
        refresh, respond, reportProgress, invite,
    };
}

export default useTrainTogether;
