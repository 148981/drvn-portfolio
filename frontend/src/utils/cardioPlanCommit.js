/**
 * cardioPlanCommit.js —— 「確認計劃」這條路上的純邏輯（單一真相源）
 * ════════════════════════════════════════════════════════════════
 * 存檔本身要 React 與網路，但「失敗要跟使用者說什麼」「儀式上要寫幾週」
 * 是純函式 —— 抽出來才測得到，也才不會兩顆按鈕各寫一套。
 *
 * 規矩只有一條：這條路徑上不存在無聲的失敗。
 * 使用者按下確認之後，畫面一定要回答兩件事 ——
 *   ① 計劃到底存進去了沒有
 *   ② 現在該做什麼
 */

/** 存檔失敗 → 一句話講完「發生什麼事 ＋ 現在該做什麼」。
 *  使用者不需要知道 HTTP 狀態碼，但一定要知道計劃存了沒。 */
export const commitErrorMessage = (e) => {
    if (e?.message === 'NO_PLAN_ID') return '伺服器沒存成功，再按一次';
    if (e?.code === 'ECONNABORTED') return '伺服器太久沒回應，計劃還沒存起來';
    const s = e?.response?.status;
    if (s === 401) return '登入過期了，重新登入再確認一次';
    if (s === 403) return '這個帳號不能存這份計劃';
    if (s === 409) return '已經有一份進行中的計劃，先去結束它';
    if (!e?.response) return '連不上伺服器，檢查網路後再按一次';
    return '存檔失敗，再按一次';
};

/** 儀式上那個「未來 N 週」的 N。
 *  必須讀「後端存回來的那一份」，不能讀畫面上的設定 ——
 *  否則後端做了任何修剪，慶祝畫面就會報一個不存在的週數。 */
export const planWeeks = (plan, fallback = 0) => {
    const n = plan?.weeks?.length || Number(plan?.total_weeks) || Number(fallback) || 0;
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};
