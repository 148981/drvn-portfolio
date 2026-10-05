/**
 * RewardUnlockProvider.jsx — 全域貼紙解鎖偵測 + 獲取動畫掛載點
 * ──────────────────────────────────────────────────────────────────
 * 在 App 頂層掛一次。負責：
 *   1. 在以下時機檢查是否有「新解鎖」的限定貼紙：
 *        - 元件掛載（App 開啟）
 *        - 段位變動（leagueChanged 事件）
 *        - 手錶訓練存檔（watch-workout-saved 事件）
 *        - 任何訓練/資料完成處主動派發的 'drvn:check-rewards' 事件
 *   2. 有新解鎖 → 依序播放 RewardUnlockAnimation 獲取動畫
 *
 * 任何訓練完成的地方想觸發檢查，只要：
 *   window.dispatchEvent(new CustomEvent('drvn:check-rewards'));
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import RewardUnlockAnimation from './RewardUnlockAnimation';
import { syncUnlockedStickers, hasSeenStickerAnimation, markStickerAnimationSeen, getStickerStates, getUnlockedStickerIds } from '../utils/stickerUnlock';
import { armLeaguePromotion } from '../utils/leaguePromotionReminder';
import { getUserId } from '../utils/auth';

export default function RewardUnlockProvider() {
    const [current, setCurrent] = useState(null); // 正在顯示的獎勵
    const queueRef = useRef([]);                   // 待播放佇列
    const playingRef = useRef(false);
    const queuedIdsRef = useRef(new Set());        // 已排入佇列（含正在播）的 id，避免同一張重複排
    const currentRef = useRef(null);

    // 播放佇列中的下一個
    const playNext = useCallback(() => {
        // 🔴 修復：「播完／關掉」才算看過。原本一排入佇列就標記已看 ——
        //    動畫播到一半 App 被關掉、或一次解鎖多張只看到第一張，其餘的慶祝就永遠消失了。
        const done = currentRef.current;
        if (done) {
            try { markStickerAnimationSeen(getUserId(), done.id); } catch (_) {}
            queuedIdsRef.current.delete(done.id);
            currentRef.current = null;
        }
        if (queueRef.current.length === 0) {
            playingRef.current = false;
            setCurrent(null);
            return;
        }
        playingRef.current = true;
        const next = queueRef.current.shift();
        currentRef.current = next;
        setCurrent(next);
    }, []);

    // 檢查新解鎖並排入佇列
    const checkRewards = useCallback(() => {
        let userId;
        try { userId = getUserId(); } catch (_) { return; }
        if (!userId) return;

        let newly = [];
        let pending = [];
        try {
            newly = syncUnlockedStickers(userId) || [];
            // 已解鎖、但動畫還沒真的看完的（上次 App 中途關閉）也要補播
            const unlockedIds = new Set(getUnlockedStickerIds(userId));
            pending = getStickerStates(userId).filter((s) => unlockedIds.has(s.id));
        } catch (_) { return; }
        const newlyIds = new Set(newly.map((s) => s.id));

        // 過濾掉「動畫已播過」與「已在佇列中」的（避免重複播）
        const toShow = pending.filter((s) => !hasSeenStickerAnimation(userId, s.id) && !queuedIdsRef.current.has(s.id));
        if (toShow.length === 0) return;

        toShow.forEach((s) => {
            queuedIdsRef.current.add(s.id);
            // 段位俱樂部解鎖 = 真的晉升了 → 點亮首頁「段位晉升」提醒橫幅
            if (s.kind === 'league_club' && newlyIds.has(s.id)) {
                try { armLeaguePromotion(userId); } catch (_) {}
            }
            queueRef.current.push(s);
        });

        if (!playingRef.current) playNext();
    }, [playNext]);

    useEffect(() => {
        // 掛載時延遲檢查一次（讓資料先就緒）
        const t = setTimeout(checkRewards, 1200);

        const onLeague = () => checkRewards();
        const onWatchSaved = () => setTimeout(checkRewards, 300);
        const onManual = () => setTimeout(checkRewards, 300);

        window.addEventListener('leagueChanged', onLeague);
        window.addEventListener('watch-workout-saved', onWatchSaved);
        window.addEventListener('drvn:check-rewards', onManual);

        return () => {
            clearTimeout(t);
            window.removeEventListener('leagueChanged', onLeague);
            window.removeEventListener('watch-workout-saved', onWatchSaved);
            window.removeEventListener('drvn:check-rewards', onManual);
        };
    }, [checkRewards]);

    return (
        <RewardUnlockAnimation
            reward={current}
            onClose={playNext}
        />
    );
}
