import { useState, useEffect, useCallback, useRef } from 'react';
import apiClient from '../../api/client';
import { getUserId } from '../../utils/auth';

/**
 * useLiveSession — 即時一起練（同一個當下）
 * ══════════════════════════════════════════════════════════════════════
 * 和 useTrainTogether 的差別：
 *   useTrainTogether  非同步的約定 —— 各自找時間去練，都達標就算一起完成
 *   useLiveSession    同一個當下 —— 兩個人現在都在練，看得到對方的即時進度
 *
 * 為什麼用輪詢：訓練中的數字（配速、距離、組數）不是毫秒級的東西，
 * 每 5 秒夠用；WebSocket 在弱網下掉線的處理成本遠高於它帶來的好處。
 *
 * 兩種節奏：
 *   在場中     快輪詢（liveMs，預設 5 秒）—— 要看得到對方在動
 *   不在場中   慢輪詢（idleMs，預設 45 秒）—— 只是看看有沒有人約
 * 分開是因為：用同一個快節奏會讓沒在練的人白白狂打 API。
 */
export function useLiveSession(userIdProp, { liveMs = 5000, idleMs = 45000 } = {}) {
    const userId = userIdProp || getUserId();
    const [session, setSession] = useState(null);   // 我現在在的那一場
    const [invites, setInvites] = useState([]);     // 有人開房邀我
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const mounted = useRef(true);

    useEffect(() => () => { mounted.current = false; }, []);

    const refresh = useCallback(async () => {
        if (!userId) { setLoading(false); return; }
        try {
            const res = await apiClient.get(`/api/live/mine/${userId}`);
            if (!mounted.current) return;
            setSession(res?.data?.current || null);
            setInvites(res?.data?.invites || []);
            setError(null);
        } catch (err) {
            if (!mounted.current) return;
            setError(err);
        } finally {
            if (mounted.current) setLoading(false);
        }
    }, [userId]);

    // 在場中就跑快的，不在場就跑慢的
    const inSession = !!session && session.status !== 'ended';
    useEffect(() => {
        refresh();
        const every = inSession ? liveMs : idleMs;
        const t = setInterval(refresh, every);
        const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
    }, [refresh, inSession, liveMs, idleMs]);

    const create = useCallback(async ({ type = 'Run', title = '', goal = null, unit = '', inviteUserIds = [] } = {}) => {
        const res = await apiClient.post('/api/live/create', {
            host_id: userId, type, title, goal, unit, invite_user_ids: inviteUserIds,
        });
        const s = res?.data?.session || null;
        setSession(s);
        return s;
    }, [userId]);

    const join = useCallback(async (sessionId) => {
        const res = await apiClient.post('/api/live/join', { session_id: sessionId, user_id: userId });
        const s = res?.data?.session || null;
        setSession(s);
        await refresh();
        return s;
    }, [userId, refresh]);

    /** 回報進度。訓練中每幾秒打一次，失敗不擋訓練，只記在 error。 */
    const report = useCallback(async (progress, note) => {
        if (!session?.session_id) return null;
        try {
            const res = await apiClient.post('/api/live/progress', {
                session_id: session.session_id, user_id: userId,
                progress: Number(progress) || 0, note,
            });
            const s = res?.data?.session || null;
            if (mounted.current && s) setSession(s);
            return s;
        } catch (err) {
            if (mounted.current) setError(err);
            return null;
        }
    }, [session?.session_id, userId]);

    const leave = useCallback(async () => {
        if (!session?.session_id) return;
        try {
            await apiClient.post('/api/live/leave', { session_id: session.session_id, user_id: userId });
        } finally {
            if (mounted.current) setSession(null);
            await refresh();
        }
    }, [session?.session_id, userId, refresh]);

    /** 我以外的人 —— 畫面要顯示的「夥伴」。 */
    const partners = (session?.members || []).filter((m) => !m.is_me);
    const me = (session?.members || []).find((m) => m.is_me) || null;

    return {
        userId, session, invites, partners, me,
        inSession, loading, error,
        inviteCount: invites.length,
        refresh, create, join, report, leave,
    };
}

export default useLiveSession;
