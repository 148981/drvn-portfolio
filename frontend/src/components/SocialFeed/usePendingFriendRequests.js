import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import { getUserId } from '../../utils/auth';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * usePendingFriendRequests — 有沒有人在等你回覆好友邀請
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 2026-09 社群稽核發現的功能缺口：
 *
 * 後端 /api/social/friends/{id}/list 會回 pending_requests，
 * SocialPage 也有完整的「待審」分頁可以接受 / 拒絕 ——
 * 但整個 App 沒有任何地方告訴你「有人加你好友」。
 *
 * 底部導覽的「社群」進去的是 /social-mobile，那一頁完全沒有好友邀請的入口；
 * 唯一到得了待審分頁的路徑是「個人檔案 → 社群」這個沒有人會知道的入口。
 * 結果就是：功能寫好了、後端也通了，但邀請寄出去就石沉大海。
 *
 * 這支 hook 只做一件事 —— 回報「現在有幾封在等你」，
 * 讓社群分頁掛得上紅點，使用者才知道要去看。
 *
 * @param {string} [userId]
 * @param {number} [pollMs] 重新檢查的間隔；0 表示只查一次
 */
export function usePendingFriendRequests(userId, pollMs = 90_000) {
    const uid = userId || getUserId();
    const [count, setCount] = useState(0);
    const [requests, setRequests] = useState([]);

    const refresh = useCallback(async () => {
        if (!uid) return;
        try {
            const r = await apiClient.get(`/api/social/friends/${uid}/list`);
            const pending = r?.data?.pending_requests || [];
            setRequests(pending);
            setCount(pending.length);
        } catch {
            /* 連不到後端就當作沒有新邀請 —— 這裡是通知，不該因為離線就跳錯誤打擾使用者。
               真正需要回覆時，使用者進到待審分頁會看到那一頁自己的錯誤狀態。 */
        }
    }, [uid]);

    useEffect(() => {
        refresh();
        if (!pollMs) return undefined;
        const t = setInterval(refresh, pollMs);
        // 從背景切回來時立刻再查一次，不用等下一輪
        const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
    }, [refresh, pollMs]);

    return { count, requests, refresh };
}

export default usePendingFriendRequests;
