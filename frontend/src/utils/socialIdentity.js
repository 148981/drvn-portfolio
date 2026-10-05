import { getUserId, resolveDisplayName } from './auth';
import { realName } from './drvnHandle';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * SOCIAL IDENTITY — 我在社群裡叫什麼名字
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 2026-09 社群稽核發現的資料錯誤：
 *
 * 發文時有正確從 userProfile 讀出使用者的名字，
 * 但「留言」與「按讚」三處都寫死 fd.append('user_name', '我')。
 * 那個字串會被存進後端 —— 也就是說資料庫裡每一個人的留言作者
 * 都叫「我」，別人打開你的貼文，看到的留言全部署名「我」。
 *
 * 這不是顯示問題，是寫進去的資料就是錯的。
 * 只要牽涉到「送出我的身分」，一律走這裡。
 */

/**
 * 取得目前使用者在社群顯示的名字。
 *
 * @param {string} [userId] 明確指定使用者；省略時從 auth 取
 * @param {string} [fallback] 真的讀不到時用什麼（預設 'User'，不要用「我」）
 * @returns {string}
 */
export const getDisplayName = (userId, fallback = 'User') => {
    const uid = userId || getUserId();
    // 佔位字清單收在 drvnHandle 一份 —— 原本這裡與 auth.js 各有各的答案
    const clean = realName;

    // 1) userProfile —— App.jsx / GoalSettingModal 真正在寫的那一份
    try {
        const raw = localStorage.getItem('userProfile');
        if (raw) {
            const parsed = JSON.parse(raw);
            // userProfile 可能是 { [userId]: {...} } 也可能是扁平物件，兩種都容錯
            const name = clean(parsed?.[uid]?.name) || clean(parsed?.name)
                || clean(parsed?.[uid]?.nickname) || clean(parsed?.nickname)
                || clean(parsed?.[uid]?.displayName) || clean(parsed?.displayName);
            if (name) return name;
        }
    } catch { /* 隱私模式或格式壞掉：往下試 */ }

    /* 2) 'userName' —— 全站有 9 個地方在讀 localStorage.getItem('userName')，
          但**沒有任何一個地方在寫它**（2026-09 稽核）。所以那 9 處永遠拿到
          fallback，結果就是留言/按讚/分享卡的作者統統叫「User」或「我」。
          這裡仍然讀一次（萬一之後有人開始寫），但不再是唯一來源。 */
    try {
        const n = clean(localStorage.getItem('userName'));
        if (n) return n;
    } catch { /* ignore */ }

    // 3) 個人檔案的其他常見鍵（不同頁面歷史上存過的位置）
    for (const key of ['drvn_user_name', 'profile', 'user_profile']) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            if (raw.trim().startsWith('{')) {
                const o = JSON.parse(raw);
                const n = clean(o?.name) || clean(o?.[uid]?.name) || clean(o?.nickname);
                if (n) return n;
            } else {
                const n = clean(raw);
                if (n) return n;
            }
        } catch { /* ignore */ }
    }

    /* 4) 登入帳號本身的名字（JWT）—— auth.resolveDisplayName 是全站第四套
          名字解析，過去只有結算分享卡在用。把它接進來，四套才會給同一個答案；
          它保證有回傳值（沒名字時回「訓練者 #XXXX」），比署名「User」誠實。 */
    try {
        const n = clean(resolveDisplayName(uid, null));
        if (n) return n;
    } catch { /* ignore */ }

    return fallback;
};

/**
 * 送給後端的身分欄位。留言、按讚、發文共用同一份，
 * 不會再出現「發文是真名、留言是我」這種同一個人兩個名字的狀況。
 */
export const identityFields = (userId) => {
    const uid = userId || getUserId();
    return { user_id: String(uid || ''), user_name: getDisplayName(uid) };
};

/**
 * 把身分塞進 FormData（後端社群端點都吃 multipart）。
 */
export const appendIdentity = (fd, userId) => {
    const { user_id, user_name } = identityFields(userId);
    fd.append('user_id', user_id);
    fd.append('user_name', user_name);
    return fd;
};

export default { getDisplayName, identityFields, appendIdentity };
