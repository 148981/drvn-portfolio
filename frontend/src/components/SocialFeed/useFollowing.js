import { useState, useCallback, useEffect, useRef } from 'react';
import {
    getGraphLocal, fetchGraph, follow as followApi, unfollow as unfollowApi,
    relationIn, RELATION,
} from '../../utils/followGraph';

/**
 * useFollowing — 追蹤/粉絲/好友狀態 hook（全 app 共用）
 *
 * 語意以 utils/followGraph.js 為唯一真相源：
 *   following 我追蹤的人 · fans 單方面追蹤我的（粉絲） · friends 互追或已加名冊
 *
 * 行為：本機快取先上畫面（第一幀不空），後端回來再校正（reconcile）。
 * 後端不可用時靜默降級成純本機，不擋 UI。
 *
 * @param {string} userId
 * @returns {{
 *   following: string[], followers: string[], friends: string[], fans: string[],
 *   counts: object, graph: object, loading: boolean,
 *   handleFollow: (id:string)=>Promise<void>,
 *   handleUnfollow: (id:string)=>Promise<void>,
 *   isFollowing: (id:string)=>boolean,
 *   isFriend: (id:string)=>boolean,
 *   isFan: (id:string)=>boolean,
 *   relationTo: (id:string)=>string,
 *   refresh: ()=>Promise<void>,
 * }}
 */
export const useFollowing = (userId) => {
    const [graph, setGraph] = useState(() => getGraphLocal(userId));
    const [loading, setLoading] = useState(true);
    const alive = useRef(true);

    useEffect(() => {
        alive.current = true;
        return () => { alive.current = false; };
    }, []);

    const refresh = useCallback(async () => {
        if (!userId) { setLoading(false); return; }
        const g = await fetchGraph(userId);
        if (alive.current && g) setGraph(g);
        if (alive.current) setLoading(false);
    }, [userId]);

    useEffect(() => {
        setGraph(getGraphLocal(userId));
        refresh();
    }, [userId, refresh]);

    const handleFollow = useCallback(async (targetId) => {
        // 樂觀更新：畫面先動，網路後補
        setGraph(prev => ({
            ...prev,
            following: prev.following?.includes(targetId) ? prev.following : [...(prev.following || []), targetId],
        }));
        const g = await followApi(targetId, userId);
        if (alive.current && g) setGraph(g);
    }, [userId]);

    const handleUnfollow = useCallback(async (targetId) => {
        setGraph(prev => ({
            ...prev,
            following: (prev.following || []).filter(id => id !== targetId),
        }));
        const g = await unfollowApi(targetId, userId);
        if (alive.current && g) setGraph(g);
    }, [userId]);

    const relationTo = useCallback(
        (targetId) => relationIn(graph, targetId, userId),
        [graph, userId]
    );

    const isFollowing = useCallback(
        (targetId) => (graph.following || []).includes(targetId),
        [graph]
    );
    const isFriend = useCallback(
        (targetId) => relationIn(graph, targetId, userId) === RELATION.FRIEND,
        [graph, userId]
    );
    const isFan = useCallback(
        (targetId) => relationIn(graph, targetId, userId) === RELATION.FAN,
        [graph, userId]
    );

    // 向後相容：舊元件會呼叫 setFollowing(list)
    const setFollowing = useCallback((next) => {
        setGraph(prev => ({
            ...prev,
            following: typeof next === 'function' ? next(prev.following || []) : next,
        }));
    }, []);

    return {
        graph,
        following: graph.following || [],
        followers: graph.followers || [],
        friends: graph.friends || [],
        fans: graph.fans || [],
        counts: graph.counts || { following: 0, followers: 0, friends: 0, fans: 0 },
        loading,
        handleFollow,
        handleUnfollow,
        isFollowing,
        isFriend,
        isFan,
        relationTo,
        refresh,
        setFollowing,
    };
};

export default useFollowing;
