/**
 * moderation.js — 社群內容的檢舉與封鎖（App Store 審查指南 1.2）
 * ─────────────────────────────────────────────────────────────
 * 後端：/api/moderation/report、/api/moderation/block（api_moderation.py），
 *       動態牆與留言列表在後端就把封鎖的人、檢舉過的內容濾掉。
 * 本機：按下去立刻藏起來（不等網路），存在 drvn_moderation_<uid>。
 */
import { useEffect, useState } from 'react';
import api from '../api/client';
import { getUserId } from './auth';
import { toast } from './toast';

export const REPORT_REASONS = [
    ['sexual', '色情或裸露'],
    ['harassment', '騷擾、霸凌或仇恨'],
    ['violence', '暴力或危險行為'],
    ['spam', '垃圾訊息或廣告'],
    ['misinformation', '不實或有害的健康資訊'],
    ['other', '其他'],
];

const EVT = 'drvn:moderation-changed';
const key = () => `drvn_moderation_${getUserId() || 'guest'}`;

function read() {
    try {
        const v = JSON.parse(localStorage.getItem(key()) || '{}') || {};
        return { hidden: Array.isArray(v.hidden) ? v.hidden : [], blocked: Array.isArray(v.blocked) ? v.blocked : [] };
    } catch (_) { return { hidden: [], blocked: [] }; }
}
function write(st) {
    try { localStorage.setItem(key(), JSON.stringify(st)); } catch (_) { /* ignore */ }
    try { window.dispatchEvent(new CustomEvent(EVT)); } catch (_) { /* ignore */ }
}

export const isHiddenContent = (id) => !!id && read().hidden.includes(String(id));
export const isBlockedUser = (uid) => !!uid && read().blocked.includes(String(uid));

/** 檢舉貼文／留言／使用者：立刻對自己藏起來，送後端等人工處理（24 小時內） */
export async function reportContent({ type, id, authorId = null, reason = 'other', snapshot = '' }) {
    if (!id) return false;
    const st = read();
    if (!st.hidden.includes(String(id))) write({ ...st, hidden: [...st.hidden, String(id)].slice(-500) });
    try {
        await api.post('/api/moderation/report', {
            target_type: type, target_id: String(id), target_user_id: authorId ? String(authorId) : null,
            reason, snapshot: String(snapshot || '').slice(0, 2000),
        });
        toast.success('已檢舉，我們會在 24 小時內處理');
        return true;
    } catch (_) {
        /* 以前不論成敗都說「已檢舉」—— 沒送到後端就沒有人會處理。說實話，讓使用者可以再按一次。 */
        const now = read();
        write({ ...now, hidden: now.hidden.filter((x) => x !== String(id)) });
        toast.error('檢舉沒有送出去，請確認網路後再試一次');
        return false;
    }
}

/** 封鎖使用者：雙方互相看不到動態與留言（後端同時解除好友與追蹤） */
export async function blockUser(uid, name = '') {
    if (!uid || String(uid) === String(getUserId())) return false;
    const st = read();
    if (!st.blocked.includes(String(uid))) write({ ...st, blocked: [...st.blocked, String(uid)] });
    try {
        await api.post('/api/moderation/block', { user_id: String(uid) });
        toast.success(name ? `已封鎖 ${name}，可在「我的 › 封鎖名單」解除` : '已封鎖，可在「我的 › 封鎖名單」解除');
        return true;
    } catch (_) {
        /* 本機先藏著（不讓使用者再看到），但要講清楚還沒同步：換裝置或對方那邊還看得到 */
        toast.error('封鎖還沒同步到伺服器，請確認網路後再封鎖一次');
        return false;
    }
}

/** 本機標記為已封鎖（伺服器端已經封鎖過時用，例如社團討論裡的封鎖） */
export function markBlockedLocally(uid) {
    if (!uid) return;
    const st = read();
    if (!st.blocked.includes(String(uid))) write({ ...st, blocked: [...st.blocked, String(uid)] });
}

export async function unblockUser(uid, name = '') {
    try {
        await api.delete(`/api/moderation/block/${encodeURIComponent(uid)}`);
    } catch (_) {
        toast.error('解除封鎖沒有成功，請稍後再試');
        return false;
    }
    const st = read();
    write({ ...st, blocked: st.blocked.filter((x) => x !== String(uid)) });
    toast.success(name ? `已解除封鎖 ${name}` : '已解除封鎖');
    return true;
}

/** 封鎖名單（含名字），給「封鎖名單」畫面用。順便把伺服器的名單同步回本機
 *  —— 換手機、重裝 App 之後，本機的封鎖紀錄是空的，畫面上的即時過濾會失效。 */
export async function fetchBlockedUsers() {
    const r = await api.get('/api/moderation/blocks');
    const ids = (r?.data?.blocked || []).map(String);
    const users = Array.isArray(r?.data?.users) ? r.data.users : ids.map((user_id) => ({ user_id, name: '' }));
    const st = read();
    // 聯集：離線時封鎖、還沒同步上去的那幾個也要繼續藏著
    if (ids.some((x) => !st.blocked.includes(x))) write({ ...st, blocked: [...new Set([...st.blocked, ...ids])] });
    return users;
}

let syncedOnce = false;
/** 每次開 App 同步一次伺服器的封鎖名單（失敗就沿用本機，不打擾使用者） */
export function syncBlocksOnce() {
    if (syncedOnce || !getUserId()) return;
    syncedOnce = true;
    fetchBlockedUsers().catch(() => { syncedOnce = false; });
}

/** 封鎖／檢舉狀態一變，用到的畫面就重畫 */
export function useModerationVersion() {
    const [v, setV] = useState(0);
    useEffect(() => {
        syncBlocksOnce();
        const on = () => setV((x) => x + 1);
        window.addEventListener(EVT, on);
        return () => window.removeEventListener(EVT, on);
    }, []);
    return v;
}
