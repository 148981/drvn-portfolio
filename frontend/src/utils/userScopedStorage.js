// userScopedStorage.js — 帳號切換時的 localStorage 隔離（Phase 2b-H）
// ─────────────────────────────────────────────────────────────────────────────
// 🔴 問題（pitfalls.md 鐵律 1）：下列 key 是「全域」的，A 帳號登出、B 帳號登入後
//    會直接讀到 A 的營養紀錄/計劃/恢復分數 → 帳號資料互串。
//
// 🩹 解法（不動 100+ 個既有呼叫點）：「換手約定」——
//    全域 key 永遠代表『目前登入者』的資料；偵測到 userId 變更時：
//      1. 把現在的全域值歸檔到 drvnScope:<舊uid>:<key>
//      2. 從 drvnScope:<新uid>:<key> 還原（沒有就清空 → 誠實空狀態）
//    既有程式完全不用改，讀寫照舊。
//
// 首次上線遷移：沒記錄過 owner 時，把現有全域資料「認領」給當前 uid，零資料遺失。
//
// ⚠️ 千萬不要把 auth_token / userId 本身加進 SCOPED_KEYS（登入流程先寫 token
//    再寫 userId，加進去會把新 token 歸檔到舊帳號 → 登入直接壞掉）。

const OWNER_KEY = 'drvn_storage_owner';
const PREFIX = 'drvnScope:';

// 「屬於單一使用者」的全域 key（裝置偏好如 app_language、haptic_debug 不列入）
const SCOPED_KEYS = [
    'userProfile', 'selectedCoach', 'analysisResult', 'avatarConfig', 'oauth_avatar',
    'currentPlan', 'currentPlanId', 'currentWorkoutPlan', 'drvn_custom_plans',
    'master_journey', 'drvn_training_path', 'drvn_selected_sport',
    'nutrition_log', 'drvn_starred_foods', 'drvn_favorites',
    'cardio_sessions', 'cardio_tracking', 'lastCardioSession', 'lastSavedSessionId',
    'drvn_cardio_baseline', 'baseline_pace_5k', 'drvn_recommended_cardio_id',
    'muscleRecoveryScores', 'calendar_daily_claimed', 'drvn_session_companions',
    'drvn_bar_weight', 'drvn_lastGPS',
];

const safeGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* quota */ } };
const safeDel = (k) => { try { localStorage.removeItem(k); } catch { /* noop */ } };

/**
 * 在「app 啟動」與「每次 userId 寫入/清除後」呼叫。冪等：uid 沒變就是 no-op。
 * @returns {boolean} 是否發生了切換
 */
export function syncUserScope() {
    let uid;
    try { uid = localStorage.getItem('userId') || 'anon'; } catch { return false; }
    const owner = safeGet(OWNER_KEY);

    // 首次執行：把現有全域資料認領給當前 uid（遷移路徑，零資料遺失）
    if (owner == null) { safeSet(OWNER_KEY, uid); return false; }
    if (owner === uid) return false;

    // 1) 歸檔舊使用者的全域值
    for (const k of SCOPED_KEYS) {
        const v = safeGet(k);
        if (v != null) safeSet(PREFIX + owner + ':' + k, v);
        safeDel(k);
    }
    // 2) 還原新使用者的歸檔（沒有 → 保持清空，誠實空狀態）
    for (const k of SCOPED_KEYS) {
        const v = safeGet(PREFIX + uid + ':' + k);
        if (v != null) safeSet(k, v);
    }
    safeSet(OWNER_KEY, uid);
    try { window.dispatchEvent(new CustomEvent('drvn:userScopeSwitched', { detail: { from: owner, to: uid } })); } catch { /* noop */ }
    console.log(`[userScopedStorage] switched ${owner} → ${uid}`);
    return true;
}

/**
 * 「升級」情境專用（訪客 → 正式帳號、後端已 merge_guest_data）：
 * 目前全域資料直接過戶給新 uid，不歸檔、不清空 — 使用者感覺資料無縫帶過去。
 */
export function adoptCurrentData() {
    let uid;
    try { uid = localStorage.getItem('userId') || 'anon'; } catch { return; }
    safeSet(OWNER_KEY, uid);
    console.log(`[userScopedStorage] adopted current data for ${uid}`);
}

export default syncUserScope;
