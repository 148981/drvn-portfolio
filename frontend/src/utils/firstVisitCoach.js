// utils/firstVisitCoach.js
// ─────────────────────────────────────────────────────────────────────────────
// 首次造訪情境提示的狀態管理。
//
// 取代「開場一次灌完 23 步」的做法：每個深功能教學改成「使用者第一次真的走到
// 那一頁時」才出現一次，看過即記錄、之後不再打擾。所有 flag 以 userId 命名空間，
// 不同帳號互不影響。
// ─────────────────────────────────────────────────────────────────────────────
import { getUserId } from './auth';

const KEY = (uid) => `drvn_first_visit_coach_${uid || 'guest'}`;

function readMap(uid) {
    try {
        return JSON.parse(localStorage.getItem(KEY(uid)) || '{}') || {};
    } catch {
        return {};
    }
}

function writeMap(uid, map) {
    try { localStorage.setItem(KEY(uid), JSON.stringify(map)); } catch { /* quota */ }
}

/** 這個提示是否已看過 */
export function hasSeenTip(tipKey, uid = getUserId()) {
    return !!readMap(uid)[tipKey];
}

/** 標記為已看過 */
export function markTipSeen(tipKey, uid = getUserId()) {
    const map = readMap(uid);
    map[tipKey] = Date.now();
    writeMap(uid, map);
}

/** 清空所有首次造訪提示 —— 供「重看教學」時一併重置，讓情境提示也會再出現一次 */
export function resetAllTips(uid = getUserId()) {
    try { localStorage.removeItem(KEY(uid)); } catch { /* */ }
}
