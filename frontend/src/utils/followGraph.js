/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * followGraph.js — 追蹤 / 粉絲 / 好友的單一真相源（前端）
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 為什麼要有這支：
 *   之前「追蹤」是 localStorage（socialDataConnector.followUser），
 *   「好友」是後端好友請求（api_friends），兩套系統各自為政，
 *   結果 UI 上出現「追蹤中」列表把每個人都寫成「好友」這種語意錯亂。
 *   從此三個名詞只有一份定義、一份計算。
 *
 * ── 名詞定義（產品層級，不可再各自解釋）──────────────────────────────
 *
 *   追蹤中 (following)  我單方面追蹤的人。
 *                       → 他們的貼文會出現在我的「追蹤中」動態流。
 *
 *   粉絲   (fan)        單方面追蹤我、我沒有追回去的人。
 *                       → 他們看得到我「公開」與「粉絲可見」的貼文，
 *                         看不到「僅好友」的貼文。
 *
 *   好友   (friend)     互相追蹤 ⟺ 或 ⟺ 已接受好友請求（社群頁名冊加的）。
 *                       → 兩條路徑都算好友，看得到我全部貼文（含「僅好友」）。
 *
 *   關係判定優先序：self > friend > following > fan > none
 *
 * ── 資料策略 ──────────────────────────────────────────────────────────
 *   後端 /api/social/friends/graph/{uid} 是真相源；
 *   localStorage（following_<uid>）只是離線快取 + 樂觀更新，
 *   後端一回來就以後端為準回寫（reconcile 模式，同 journeyJoinDate）。
 *   後端掛掉 → 靜默降級成純本機，絕不擋畫面。
 *
 * ── 跑步 × 健身同步 ────────────────────────────────────────────────────
 *   這張圖沒有運動別之分。在跑步社群追蹤的人，在健身社群一樣是追蹤中。
 *   只有「推薦誰」會依 sport 參數調整排序，關係本身永遠一致。
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import apiClient from '../api/client';
import { getUserId } from './auth';

const LS_FOLLOWING = (uid) => `following_${uid}`;
const LS_GRAPH_CACHE = (uid) => `drvn_follow_graph_${uid}`;

/* ═══════════════════ 本機快取層 ═══════════════════ */

const readJson = (key, fallback) => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
};

const writeJson = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
};

/** 我追蹤的人（本機，同步回傳，供第一幀渲染用） */
export const getFollowingLocal = (uid = getUserId()) => {
    const v = readJson(LS_FOLLOWING(uid), []);
    return Array.isArray(v) ? v : [];
};

/** 完整關係快取（本機，同步回傳） */
export const getGraphLocal = (uid = getUserId()) => {
    const cached = readJson(LS_GRAPH_CACHE(uid), null);
    const following = getFollowingLocal(uid);
    if (!cached) {
        return {
            userId: uid,
            following,
            followers: [],
            friends: [],
            fans: [],
            counts: { following: following.length, followers: 0, friends: 0, fans: 0 },
            stale: true,
        };
    }
    return { ...cached, stale: true };
};

/* ═══════════════════ 後端同步層 ═══════════════════ */

const normalizeGraph = (uid, d) => {
    const following = Array.isArray(d?.following) ? d.following : [];
    const followers = Array.isArray(d?.followers) ? d.followers : [];
    const friends = Array.isArray(d?.friends) ? d.friends : [];
    const fans = Array.isArray(d?.fans) ? d.fans : [];
    return {
        userId: uid,
        following,
        followers,
        friends,
        fans,
        followingUsers: d?.following_users || [],
        followerUsers: d?.follower_users || [],
        friendUsers: d?.friend_users || [],
        fanUsers: d?.fan_users || [],
        counts: d?.counts || {
            following: following.length,
            followers: followers.length,
            friends: friends.length,
            fans: fans.length,
        },
        stale: false,
    };
};

/**
 * 從後端取完整關係圖並回寫本機快取。
 * @returns {Promise<object|null>} 失敗回 null（呼叫端維持本機資料）
 */
export const fetchGraph = async (uid = getUserId(), { hydrate = true } = {}) => {
    if (!uid) return null;
    try {
        const res = await apiClient.get(`/api/social/friends/graph/${uid}`, {
            params: { hydrate },
        });
        const g = normalizeGraph(uid, res?.data);
        writeJson(LS_GRAPH_CACHE(uid), g);
        writeJson(LS_FOLLOWING(uid), g.following);   // 與舊 key 保持同步，舊元件不會壞
        return g;
    } catch {
        return null;
    }
};

/* ═══════════════════ 動作（樂觀更新 + 後端同步） ═══════════════════ */

/* ⚠️ 2026-09 稽核：這兩個動作原本失敗時完全不吭聲，註解寫「之後校正」——
   但校正的方式是 fetchGraph「以後端為準回寫本機」，也就是說離線時按下的追蹤
   會被下一次同步直接抹掉。使用者在捷運上追蹤了一個人，之後那個人就
   莫名其妙不在追蹤清單裡，而且從頭到尾沒有人告訴他。
   現在失敗會說出來，讓他知道要重按一次。 */
const notifyFollowFailed = async (action) => {
    try {
        const { toast } = await import('./toast');
        toast.error(action === 'follow' ? '追蹤沒有成功，請確認網路後再試' : '取消追蹤沒有成功，請稍後再試');
    } catch { /* toast 不可用就算了，不能因為提示失敗而讓動作也失敗 */ }
};

/**
 * 追蹤某人。先更新本機（畫面立刻有反應），再打後端。
 * 後端失敗 → 告知使用者（本機那份會被下次 fetchGraph 覆蓋掉）。
 */
export const follow = async (targetId, uid = getUserId()) => {
    if (!uid || !targetId || uid === targetId) return getGraphLocal(uid);

    const list = getFollowingLocal(uid);
    if (!list.includes(targetId)) {
        writeJson(LS_FOLLOWING(uid), [...list, targetId]);
    }
    try {
        await apiClient.post('/api/social/friends/follow', { user_id: uid, target_id: targetId });
    } catch {
        writeJson(LS_FOLLOWING(uid), getFollowingLocal(uid).filter(id => id !== targetId));  // 回滾，畫面不要停在假狀態
        notifyFollowFailed('follow');
        return getGraphLocal(uid);
    }
    return (await fetchGraph(uid)) || getGraphLocal(uid);
};

export const unfollow = async (targetId, uid = getUserId()) => {
    if (!uid || !targetId) return getGraphLocal(uid);

    const before = getFollowingLocal(uid);
    writeJson(LS_FOLLOWING(uid), before.filter(id => id !== targetId));
    try {
        await apiClient.post('/api/social/friends/unfollow', { user_id: uid, target_id: targetId });
    } catch {
        writeJson(LS_FOLLOWING(uid), before);   // 回滾
        notifyFollowFailed('unfollow');
        return getGraphLocal(uid);
    }
    return (await fetchGraph(uid)) || getGraphLocal(uid);
};

/* ═══════════════════ 關係判定 ═══════════════════ */

export const RELATION = {
    SELF: 'self',
    FRIEND: 'friend',       // 互追 或 已接受好友請求
    FOLLOWING: 'following', // 我追他，他沒追我
    FAN: 'fan',             // 他追我，我沒追他 → 他是我的粉絲
    NONE: 'none',
};

export const RELATION_LABEL = {
    [RELATION.SELF]: '你自己',
    [RELATION.FRIEND]: '好友',
    [RELATION.FOLLOWING]: '追蹤中',
    [RELATION.FAN]: '粉絲',
    [RELATION.NONE]: '',
};

/** 從一份 graph 判定我對 targetId 的關係（純函式，不打網路） */
export const relationIn = (graph, targetId, uid = getUserId()) => {
    if (!graph || !targetId) return RELATION.NONE;
    if (targetId === uid) return RELATION.SELF;
    const has = (arr) => Array.isArray(arr) && arr.includes(targetId);
    if (has(graph.friends)) return RELATION.FRIEND;
    if (has(graph.following) && has(graph.followers)) return RELATION.FRIEND; // 互追即好友
    if (has(graph.following)) return RELATION.FOLLOWING;
    if (has(graph.followers) || has(graph.fans)) return RELATION.FAN;
    return RELATION.NONE;
};

/* ═══════════════════ 貼文可見度 ═══════════════════ */

export const VISIBILITY = {
    PUBLIC: 'public',       // 所有人
    FOLLOWERS: 'followers', // 粉絲＋好友（追蹤我的人）
    FRIENDS: 'friends',     // 僅好友（互追／已加名冊）
};

/* 發布到哪些社群（可複選；都不選 = 只留在個人檔案）。
   發文（IGPostComposer）與編輯（EditPostSheet）共用這一份。 */
export const COMMUNITY_TARGETS = [
    { id: 'run', label: '跑步社群' },
    { id: 'fitness', label: '健身社群' },
];

export const VISIBILITY_OPTIONS = [
    { id: VISIBILITY.PUBLIC, label: '公開', desc: '所有人都看得到，也可能出現在探索' },
    { id: VISIBILITY.FOLLOWERS, label: '粉絲', desc: '追蹤你的人（粉絲＋好友）看得到' },
    { id: VISIBILITY.FRIENDS, label: '僅好友', desc: '只有互相追蹤／名冊上的好友看得到' },
];

/**
 * 這篇貼文，viewer 看得到嗎？
 * @param {object} post    需有 visibility 與 user_id
 * @param {object} graph   貼文作者的關係圖（或觀看者自己的，含 friends/followers）
 * @param {string} viewerId
 */
export const canView = (post, graph, viewerId = getUserId()) => {
    if (!post) return false;
    const authorId = post.user_id || post.uId;
    if (!authorId || authorId === viewerId) return true;

    const v = post.visibility || VISIBILITY.PUBLIC;
    if (v === VISIBILITY.PUBLIC) return true;

    const rel = relationIn(graph, viewerId, authorId);
    if (v === VISIBILITY.FRIENDS) return rel === RELATION.FRIEND;
    // followers：粉絲與好友都算（都追蹤了作者）
    return rel === RELATION.FRIEND || rel === RELATION.FAN;
};

/* ═══════════════════ 搜尋 & 推薦 ═══════════════════ */

/**
 * 依 ID 或名稱搜尋使用者。支援三種輸入：
 *   · 名稱片段        例：mia
 *   · 完整好友碼      例：Mia#1234
 *   · user_id 片段    例：user_9f2
 */
export const searchUsers = async (query, uid = getUserId()) => {
    const q = (query || '').trim();
    if (q.length < 1) return [];
    try {
        // 好友碼格式優先走精準查詢
        if (q.includes('#')) {
            const [name, disc] = q.split('#');
            const res = await apiClient.get('/api/social/friends/lookup', {
                params: { name: name.trim(), disc: (disc || '').trim(), user_id: uid },
            });
            const u = res?.data;
            return u && u.user_id ? [u] : [];
        }
        const res = await apiClient.get(`/api/social/friends/search/${encodeURIComponent(q)}`, {
            params: { user_id: uid },
        });
        return Array.isArray(res?.data) ? res.data.filter(u => u.user_id !== uid) : [];
    } catch {
        return [];
    }
};

/**
 * 推薦追蹤。跑步社群傳 sport='run'、健身社群傳 sport='strength'，
 * 兩邊呼叫同一支演算法（後端 suggestions-v2），排序邏輯永遠一致。
 * 舊端點作為降級路徑，確保後端未更新時畫面仍有內容。
 */
export const getSuggestions = async (uid = getUserId(), { sport = null, limit = 12 } = {}) => {
    if (!uid) return [];
    try {
        const res = await apiClient.get(`/api/social/friends/suggestions-v2/${uid}`, {
            params: { limit, ...(sport ? { sport } : {}) },
        });
        const list = res?.data?.suggestions;
        if (Array.isArray(list) && list.length) return list;
    } catch { /* 落到舊端點 */ }

    try {
        const res = await apiClient.get(`/api/social/friends/suggestions/${uid}`, { params: { limit } });
        return res?.data?.suggestions || [];
    } catch {
        return [];
    }
};

export default {
    getFollowingLocal, getGraphLocal, fetchGraph,
    follow, unfollow,
    RELATION, RELATION_LABEL, relationIn,
    VISIBILITY, VISIBILITY_OPTIONS, canView,
    searchUsers, getSuggestions,
};
