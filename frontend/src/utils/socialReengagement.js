// ─────────────────────────────────────────────────────────────
// 🔁 Social Re-engagement — 社交回流迴路
//
// 為什麼需要：Squads / Leaderboard / Feed 都在，但若「隊友幫你按讚/留言」
// 不會主動通知你，社交功能就只是靜態展示，無法把人拉回來。留存最強的槓桿
// 就是「有人對你的跑步有反應 → 你想回來看 → 順手再互動」的你來我往。
//
// 這支工具負責：
//   1. 記住「上次你看過自己貼文時的反應數快照」(localStorage)。
//   2. 用最新反應數比對，算出「新增的讚/留言」= 未讀數，給 UI 紅點。
//   3. 有新互動且在背景時，發本地通知把人拉回來。
//
// 注意：目前社交資料多為前端 mock/local，這支以「資料驅動」設計，
// 之後後端接上真實 reactions 時，只要把活動陣列餵進來即可運作，無需改 UI。
// ─────────────────────────────────────────────────────────────

const SNAPSHOT_KEY = (uid) => `social_reaction_snapshot_${uid}`;
const NOTIFY_KEY = 'social_reengage_notify';

export const isReengageNotifyEnabled = () => localStorage.getItem(NOTIFY_KEY) !== 'false';
export const setReengageNotifyEnabled = (on) => {
    try { localStorage.setItem(NOTIFY_KEY, String(!!on)); } catch { /* noop */ }
};

const readSnapshot = (uid) => {
    try { return JSON.parse(localStorage.getItem(SNAPSHOT_KEY(uid)) || '{}'); }
    catch { return {}; }
};
const writeSnapshot = (uid, snap) => {
    try { localStorage.setItem(SNAPSHOT_KEY(uid), JSON.stringify(snap)); } catch { /* noop */ }
};

// 從一筆活動取出反應總數（讚 + 留言）。相容多種欄位命名。
const reactionCount = (a) => {
    const kudos = Number(a.kudos_count ?? a.kudos ?? a.likes ?? 0) || 0;
    const comments = Number(a.comments ?? a.commentCount ?? a.comment_count ?? 0) || 0;
    // 表情反應（fire/high_five…）也算互動
    let reactions = 0;
    const r = a.reactions;
    if (r && typeof r === 'object') {
        reactions = Object.values(r).reduce((s, v) => s + (Number(v) || 0), 0);
    }
    return { kudos: kudos + reactions, comments, total: kudos + reactions + comments };
};

const activityId = (a) => a.activity_id || a.id || a.session_id || a.run_id || null;
const isMine = (a, uid) => {
    const owner = a.user_id || a.userId || a.owner_id || a.author_id;
    return owner != null && String(owner) === String(uid);
};

/**
 * 計算「自從上次看過後，我的貼文新增多少互動」。
 * @param {Array} activities 動態牆活動陣列（含他人；內部只挑出 isMine）
 * @param {string} uid 目前使用者 id
 * @returns {{ unreadKudos:number, unreadComments:number, unreadTotal:number, perActivity:Object }}
 */
export const computeUnreadInteractions = (activities = [], uid) => {
    const snap = readSnapshot(uid);
    let unreadKudos = 0, unreadComments = 0;
    const perActivity = {};

    for (const a of (Array.isArray(activities) ? activities : [])) {
        if (!isMine(a, uid)) continue;
        const id = activityId(a);
        if (!id) continue;
        const cur = reactionCount(a);
        const prev = snap[id] || { kudos: 0, comments: 0 };
        const dK = Math.max(0, cur.kudos - prev.kudos);
        const dC = Math.max(0, cur.comments - prev.comments);
        if (dK > 0 || dC > 0) {
            perActivity[id] = { newKudos: dK, newComments: dC };
            unreadKudos += dK;
            unreadComments += dC;
        }
    }
    return {
        unreadKudos,
        unreadComments,
        unreadTotal: unreadKudos + unreadComments,
        perActivity,
    };
};

/**
 * 把目前狀態標記為「已看過」— 更新快照，清掉紅點。
 * 在使用者打開社交頁時呼叫。
 */
export const markInteractionsSeen = (activities = [], uid) => {
    const snap = readSnapshot(uid);
    for (const a of (Array.isArray(activities) ? activities : [])) {
        if (!isMine(a, uid)) continue;
        const id = activityId(a);
        if (!id) continue;
        const cur = reactionCount(a);
        snap[id] = { kudos: cur.kudos, comments: cur.comments };
    }
    writeSnapshot(uid, snap);
};

/**
 * 偵測到新互動時發本地通知（背景時才推，前景有紅點就夠）。
 * @param {{unreadKudos, unreadComments, unreadTotal}} unread
 */
export const notifyNewInteractions = async (unread, { onlyWhenHidden = true } = {}) => {
    if (!unread || unread.unreadTotal <= 0) return;
    if (!isReengageNotifyEnabled()) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (onlyWhenHidden && document.visibilityState === 'visible') return;

    const bits = [];
    if (unread.unreadKudos > 0) bits.push(`${unread.unreadKudos} 個讚`);
    if (unread.unreadComments > 0) bits.push(`${unread.unreadComments} 則留言`);
    const title = '有人對你的跑步有反應 🏃';
    const options = {
        body: `你收到 ${bits.join('、')}，回來看看吧！`,
        tag: 'drvn-social-reengage',
        renotify: true,
        icon: '/images/icon-192.png',
        badge: '/images/icon-192.png',
        data: { route: '/social-mobile' },
        requireInteraction: false,
    };
    try {
        if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg?.showNotification) { await reg.showNotification(title, options); return; }
        }
        // eslint-disable-next-line no-new
        new Notification(title, options);
    } catch { /* noop */ }
};
