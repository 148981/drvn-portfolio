/**
 * trainTogether.js — 「一起練」的單一真相源
 * ══════════════════════════════════════════════════════════════════════
 * 為什麼要有這一支：
 *   後端 /api/social/challenge/* 早就把整套寫好了 —— 兩種模式、進度、
 *   兩人「一起完成」的時間窗、bond 親密度。但前端只接了「送出」，
 *   沒有收件匣、沒有接受／拒絕。結果是：邀請寄得出去，對方永遠收不到，
 *   功能等於不存在。
 *
 *   這支把「一筆邀請現在到底是什麼狀態」的判斷收成一份：誰邀誰、
 *   我的進度、對方的進度、誰領先、還差多少、下一步該按什麼。
 *   任何畫面要顯示一起練，都從這裡讀，不要各自再算一次。
 *
 * 兩種模式（對應後端的 mode 欄位）：
 *   collaborate — 一起練：兩個人都達標才算成功，而且要在 2 小時內
 *                 都完成（後端 COLLAB_WINDOW_HOURS）。這是「陪伴」。
 *   challenge   — 對決：同一個目標比進度。這是「較勁」。
 *
 * 誠實鐵律：進度一律是雙方各自回報的真實數值，不推估、不補值。
 *   還沒回報就是 0 並明說「還沒開始」。
 */

/** 後端的 mode → 畫面該怎麼講這件事。 */
export const TT_MODES = {
    collaborate: {
        key: 'collaborate',
        label: '一起練',
        short: '一起',
        rule: '兩個人都達標才算成功',
        color: '#4FA88B',
        icon: '🤝',
    },
    challenge: {
        key: 'challenge',
        label: '對決',
        short: '對決',
        rule: '同一個目標，比誰先到',
        color: '#F95C4B',
        icon: '⚡',
    },
};

export const modeOf = (c) => TT_MODES[c?.mode] || TT_MODES.collaborate;

/** 後端 type → 中文。 */
export const TT_TYPES = { Run: '跑步', Lift: '重訓', run: '跑步', fitness: '重訓' };
export const typeLabel = (t) => TT_TYPES[t] || '訓練';

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const pct = (v, target) => (target > 0 ? Math.max(0, Math.min(100, Math.round((v / target) * 100))) : 0);

/**
 * 把一筆後端邀請整理成畫面直接能用的樣子。
 * @param {object} c   後端 challenge 物件
 * @param {string} me  目前使用者 id
 */
export function readInvite(c, me) {
    if (!c) return null;
    const isFrom = c.from_user_id === me;
    const target = num(c.metric);
    const mine = num(isFrom ? c.from_progress : c.to_progress);
    const theirs = num(isFrom ? c.to_progress : c.from_progress);
    const mode = modeOf(c);

    const other = c.other_user || (isFrom ? c.to_user : c.from_user) || null;
    const otherName = other?.name || other?.display_name || '夥伴';

    const myPct = pct(mine, target);
    const theirPct = pct(theirs, target);
    const iHit = target > 0 && mine >= target;
    const theyHit = target > 0 && theirs >= target;

    /* 這一筆現在該說什麼、該給什麼按鈕 —— 畫面不要自己再判一次。 */
    let headline, cta = null;
    if (c.status === 'pending') {
        headline = isFrom ? `等 ${otherName} 回覆` : `${otherName} 邀你${mode.label}`;
        cta = isFrom ? null : 'respond';
    } else if (c.status === 'declined') {
        headline = isFrom ? `${otherName} 這次不方便` : '已婉拒';
    } else if (c.status === 'completed') {
        headline = mode.key === 'collaborate'
            ? `和 ${otherName} 一起完成了`
            : (mine > theirs ? '你贏了' : mine < theirs ? `${otherName} 這次比較快` : '平手');
    } else { // accepted / 進行中
        if (iHit && !theyHit) headline = mode.key === 'collaborate' ? `你到了，等 ${otherName}` : `你領先 ${otherName}`;
        else if (!iHit && theyHit) headline = mode.key === 'collaborate' ? `${otherName} 到了，換你` : `${otherName} 領先`;
        else if (mine === 0 && theirs === 0) headline = '還沒開始';
        else headline = mode.key === 'collaborate' ? '兩個人都在路上' : (myPct > theirPct ? '你領先' : myPct < theirPct ? `${otherName} 領先` : '目前平手');
        cta = 'progress';
    }

    return {
        id: c.challenge_id,
        raw: c,
        mode,
        typeText: typeLabel(c.type),
        title: c.title || `${typeLabel(c.type)} ${target}${c.unit || ''}`,
        desc: c.desc || '',
        status: c.status,
        direction: isFrom ? 'sent' : 'received',
        other, otherName,
        target, unit: c.unit || '',
        mine, theirs, myPct, theirPct, iHit, theyHit,
        remaining: Math.max(0, Math.round((target - mine) * 10) / 10),
        headline, cta,
        bond: num(c.bond),
        createdAt: c.created_at || null,
        completedAt: c.completed_at || null,
    };
}

/** 一次整理一整份清單，並依「需要我動作 → 進行中 → 其他」排序。 */
export function readInvites(list, me) {
    const rows = (Array.isArray(list) ? list : [])
        .map((c) => readInvite(c, me))
        .filter(Boolean);
    const rank = (r) => {
        if (r.status === 'pending' && r.direction === 'received') return 0;  // 等我回覆
        if (r.status === 'accepted') return 1;                                // 進行中
        if (r.status === 'pending') return 2;                                 // 等對方
        if (r.status === 'completed') return 3;
        return 4;                                                             // declined
    };
    return rows.sort((a, b) => rank(a) - rank(b) || String(b.createdAt).localeCompare(String(a.createdAt)));
}

/** 現在進行中的（已接受、還沒完成）—— 動態牆要置頂顯示的就是這些。 */
export const activeInvites = (rows) => rows.filter((r) => r.status === 'accepted');
/** 等我回覆的 —— 待審分頁與紅點用的。 */
export const inboxInvites = (rows) => rows.filter((r) => r.status === 'pending' && r.direction === 'received');

/**
 * bond 親密度 → 一句看得懂的話。
 * 數字本身沒有意義，要講「這代表你們一起練了多少」。
 */
export function bondLevel(score) {
    const s = Math.max(0, num(score));
    if (s >= 800) return { label: '固定訓練夥伴', tier: 4, hint: '一起練過很多次了' };
    if (s >= 400) return { label: '常一起練', tier: 3, hint: '已經是習慣了' };
    if (s >= 150) return { label: '練過幾次', tier: 2, hint: '再約幾次就成習慣' };
    if (s > 0) return { label: '剛開始一起練', tier: 1, hint: '第一次之後最容易斷，約下一次吧' };
    return { label: '還沒一起練過', tier: 0, hint: '邀他一起練，這裡就會開始累積' };
}

/** 送出邀請前的檢查 —— 送不出去的東西不要讓使用者按下去才知道。 */
export function validateInvite({ toUserId, fromUserId, metric, type }) {
    if (!fromUserId) return '請先登入';
    if (!toUserId) return '請先選一位夥伴';
    if (toUserId === fromUserId) return '不能邀請自己';
    if (!(num(metric) > 0)) return '請設定一個目標數字';
    if (!type) return '請選跑步或重訓';
    return null;
}

export default readInvites;
