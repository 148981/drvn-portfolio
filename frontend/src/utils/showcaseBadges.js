/**
 * showcaseBadges — 個人資料預覽裡的「徽章」
 * ─────────────────────────────────────────────────────────────────────
 * 徽章是在使用者自己的手機上算的（checkAllAchievements 讀本機訓練紀錄），
 * 別人的手機算不出來。所以：
 *   · 自己：直接用本機算出的已解鎖徽章，並同步一份到後端
 *   · 別人：讀後端 /api/social/friends/profile/{uid} 回來的 badges
 * 同步只在內容有變時才送，避免每次打開都打一次後端。
 */
import apiClient from '../api/client';
import { checkAllAchievements } from './growthAchievements';
import { badgeImage } from './benchBadgeAssets';
import { uStorage } from './userStorage';

const TIER_RANK = { diamond: 0, platinum: 1, gold: 2, silver: 3, bronze: 4 };

/** 把成就物件收成展示用的精簡格式（高階級在前）。 */
export const toShowcase = (list) => (list || [])
    .filter((a) => a && a.unlocked)
    .map((a) => {
        let image = null;
        try { image = badgeImage(a) || a.image || null; } catch { image = a.image || null; }
        return { id: a.id, name: a.name, tier: a.tier || '', icon: a.emoji || a.icon || '', image };
    })
    .sort((a, b) => (TIER_RANK[a.tier] ?? 9) - (TIER_RANK[b.tier] ?? 9));

/** 自己的已解鎖徽章（本機計算）。 */
export const getMyShowcaseBadges = (userId) => {
    try { return toShowcase(checkAllAchievements(userId)?.achievements); } catch { return []; }
};

/** 有變才同步到後端，讓別人看得到。失敗就算了，不影響畫面。 */
export const syncShowcaseBadges = async (userId, badges = null) => {
    if (!userId) return;
    const list = badges || getMyShowcaseBadges(userId);
    const sig = list.map((b) => `${b.id}:${b.tier}`).join('|');
    let store = null;
    try { store = uStorage(userId); if (store.get('showcaseBadgesSig', '') === sig) return; } catch { /* ignore */ }
    try {
        await apiClient.post('/api/social/friends/badges', { user_id: userId, badges: list });
        try { store && store.set('showcaseBadgesSig', sig); } catch { /* ignore */ }
    } catch { /* 後端不可用 → 下次再同步 */ }
};
