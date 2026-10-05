// mentionDirectory.js — 🔴 零模擬數據：@mention 建議名單改用「真實好友」
// 資料源：/api/social/friends/leaderboard（與排行榜同一名錄），模組級快取 5 分鐘。
// 沒有好友 / API 失敗 → 回傳空陣列（不捏造 Sarah/Mike 假人）。

let _cache = { names: [], at: 0 };
const TTL = 5 * 60 * 1000;

export async function loadMentionNames() {
    if (Date.now() - _cache.at < TTL && _cache.names.length) return _cache.names;
    try {
        const { getUserId } = await import('./auth');
        const { default: api } = await import('../api/client');
        const uid = getUserId();
        if (!uid) return [];
        const res = await api.get(`/api/social/friends/leaderboard/${uid}`);
        const names = (res?.data?.leaderboard || [])
            .filter((r) => r.user_id !== uid)
            .map((r) => String(r.name || '').trim())
            .filter(Boolean);
        _cache = { names, at: Date.now() };
        return names;
    } catch {
        return _cache.names || [];
    }
}

export default { loadMentionNames };
