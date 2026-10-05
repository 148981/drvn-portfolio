/**
 * apiFailure.js —— 「這次呼叫為什麼失敗」的單一真相源
 * ══════════════════════════════════════════════════════════════════
 * 2026-09 稽核抓到的事：社群牆與建立社團都顯示「連不到伺服器 / 請確認網路」，
 * 但伺服器是活的 —— 後端回的是 500。使用者照著提示去換 Wi-Fi、重開機，
 * 怎麼弄都沒用，因為畫面講的跟實際發生的根本不是同一件事。
 *
 * 所以：任何 catch 到的錯誤都先過這裡分類，再決定要說什麼。
 * 「連不上網」這四個字，只有在真的沒拿到回應時才准出現。
 */

/** 失敗的種類。UI 可以用它決定要不要給「重試」以外的出路。 */
export const FAIL_OFFLINE = 'offline';   // 根本沒拿到回應（斷網、DNS、CORS）
export const FAIL_TIMEOUT = 'timeout';   // 逾時
export const FAIL_AUTH = 'auth';      // 401 / 403
export const FAIL_SERVER = 'server';    // 5xx —— 是我們壞了，不是使用者的網路
export const FAIL_CLIENT = 'client';    // 4xx 其他

/** @returns {'offline'|'timeout'|'auth'|'server'|'client'} */
export const failureKind = (e) => {
    if (e?.code === 'ECONNABORTED' || /timeout/i.test(e?.message || '')) return FAIL_TIMEOUT;
    const s = e?.response?.status;
    if (!s) return FAIL_OFFLINE;
    if (s === 401 || s === 403) return FAIL_AUTH;
    if (s >= 500) return FAIL_SERVER;
    return FAIL_CLIENT;
};

/**
 * 一句話說明。動詞開頭、不講 HTTP 狀態碼，但不騙人。
 * @param {Error} e     axios / fetch 丟出來的錯誤
 * @param {string} what 這次在做什麼，例如「動態」「社團」
 */
export const failureLine = (e, what = '資料') => {
    switch (failureKind(e)) {
        case FAIL_TIMEOUT: return `伺服器太久沒回應，${what}還沒讀完`;
        case FAIL_OFFLINE: return '連不上伺服器，檢查網路後再試一次';
        case FAIL_AUTH: return `登入過期了，重新登入就看得到${what}`;
        case FAIL_SERVER: return '伺服器出錯了，不是你的網路問題';
        default: return `${what}讀不到，等一下再試一次`;
    }
};

/** 伺服器自己給了人看得懂的理由就用它的，否則用我們的分類。 */
export const failureDetail = (e, what = '資料') => {
    const d = e?.response?.data?.detail;
    if (typeof d === 'string' && d && !/^internal server error$/i.test(d)) return d;
    return failureLine(e, what);
};
