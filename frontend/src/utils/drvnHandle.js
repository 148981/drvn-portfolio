/**
 * ══════════════════════════════════════════════════════════════════════════
 * drvnHandle — 還沒取名字的人，預設叫什麼
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   有跑步計劃        → DRVNNER #A3F2
 *   沒有（只練重訓）  → DRVNST #A3F2
 *
 * 跑者是一種身分，會有人自稱；重訓是這個 App 的底盤，所以當預設。
 * 兩個都有的人算 DRVNNER —— 規則只有兩條，不需要第三種仲裁，
 * 同一個人每次算出來都一樣。
 *
 * #尾碼保留：排行榜、社團、留言署名都要分得出兩個沒取名字的人。
 *
 * ⚠️ 這支刻意 **零 import**。它被 auth.js 呼叫，而 auth 在登入流程最早期就載入；
 *    若改成 import trainingFocus 會把整條 UnifiedTrainingEngine 依賴鏈拖進登入路徑。
 *    代價是這裡直接寫了兩個 localStorage key（全專案早就有多處這樣讀）。
 */

/** 這個人有沒有啟用中的跑步計劃。讀不到一律當作沒有。 */
const hasRunPlan = (userId) => {
    try {
        const raw = localStorage.getItem(`u_${userId}_onboarding_cardio_plan`);
        if (!raw) return false;
        const p = JSON.parse(raw);
        return !!(p?.plan_id || p?.id);
    } catch { return false; }
};

/**
 * 這些都不是真的名字，只是「還沒取名字」的佔位字。
 *
 * ⚠️ 舊版訪客 JWT 的 name claim 就是「訪客用戶」（後端簽的）。resolveDisplayName
 *    第二步讀 JWT 名字，讀到它就直接回傳了 —— 預設代號那一行永遠跑不到，
 *    首頁因此顯示「訪客用戶」。後端已經不再簽這個名字，但已發出去的 token
 *    還在使用者手機裡，所以這裡一定要擋。
 *
 * 這份清單原本只存在 socialIdentity.js 裡一份，auth.js 不知道它 ——
 * 同一個問題兩支檔案兩種答案。現在只有這裡一份，兩邊都 import。
 */
const PLACEHOLDER = /^(user|guest|you|me|我|訪客|訪客用戶|訪客使用者|使用者|unknown|null|undefined)$/i;

/** 是真名就回傳去掉前後空白的版本，是佔位字或空的就回傳 ''。 */
export const realName = (v) => {
    const s = String(v ?? '').trim();
    return (!s || PLACEHOLDER.test(s)) ? '' : s;
};

/** 沒取名字時的預設代號。 */
export const drvnHandle = (userId) => {
    const tail = String(userId || '').slice(-4).toUpperCase() || '0000';
    return `${hasRunPlan(userId) ? 'DRVNNER' : 'DRVNST'} #${tail}`;
};

export default drvnHandle;
