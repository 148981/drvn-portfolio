// ─────────────────────────────────────────────────────────────
// 📅 月報結算邏輯（每月 1 號結算）
//
// 規則：
//  • 一個月在「下個月 1 號」結算出爐。所以「最近一個已結算月份」＝上一個完整日曆月。
//    例：6/15 時最近已結算月份 = 5 月；7/1 一到 → 6 月結算 → 提示有新結算。
//  • 第一個完整月份完成前 → 月報「鎖定」，提示使用者先完成一個月訓練。
//  • 一旦解鎖（曾有任一已結算月份含真實資料）就永久解鎖。
//  • 新結算偵測：最近「含資料」的已結算月份 != 使用者上次看過的月份 → 有新結算。
//
// 解鎖/已看狀態存在 localStorage（依 userId 隔離），homeAlerts 與儀表板卡片
// 可同步讀取；refreshRecapState() 會打後端確認當月是否有真實資料並更新快取。
// ─────────────────────────────────────────────────────────────
import { getUserId } from './auth';
import apiClient from '../api/client';

const MONTHS_ZH = ['1 月', '2 月', '3 月', '4 月', '5 月', '6 月', '7 月', '8 月', '9 月', '10 月', '11 月', '12 月'];
const MONTHS_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const K_UNLOCKED = 'drvn_recap_unlocked';
const K_SETTLED = 'drvn_recap_settled_ym';   // 最近「含資料」的已結算月份
const K_SEEN = 'drvn_recap_seen_ym';         // 使用者上次看過的已結算月份

const key = (base, uid) => `${base}_${uid || getUserId() || 'guest'}`;

/** 最近一個「已結算（完整結束）」的月份 = 上一個日曆月。 */
export function getSettledMonth(date = new Date()) {
    const last = new Date(date.getFullYear(), date.getMonth(), 0); // 上個月最後一天
    const year = last.getFullYear();
    const month = last.getMonth(); // 0-indexed
    return {
        year, month,
        ym: `${year}-${String(month + 1).padStart(2, '0')}`,
        zh: MONTHS_ZH[month],
        en: MONTHS_EN[month],
    };
}

/** 下次結算日 = 下個月 1 號（本月結束、本月出爐）。 */
export function getNextSettlementDate(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

/** 下次結算日的中文標籤，如「7 月 1 日」。 */
export function getNextSettlementLabel(date = new Date()) {
    const d = getNextSettlementDate(date);
    return `${d.getMonth() + 1} 月 1 日`;
}

export function isRecapUnlocked(uid) {
    return localStorage.getItem(key(K_UNLOCKED, uid)) === 'true';
}

export function getSeenMonth(uid) {
    return localStorage.getItem(key(K_SEEN, uid));
}

/** 標記使用者已看過某個已結算月份（清除「新結算」紅點）。 */
export function markSettlementSeen(ym, uid) {
    try { localStorage.setItem(key(K_SEEN, uid), ym || getSettledMonth().ym); } catch { /* 略 */ }
}

/** 是否有「新的、尚未看過」的已結算月報（已解鎖才算）。 */
export function hasNewSettlement(uid) {
    if (!isRecapUnlocked(uid)) return false;
    const settled = localStorage.getItem(key(K_SETTLED, uid));
    return !!settled && getSeenMonth(uid) !== settled;
}

/**
 * 打後端確認「最近已結算月份」是否有真實資料，更新解鎖/結算快取。
 * 回傳 { unlocked, hasData, ym, report }。供儀表板與 recap 頁呼叫。
 * 一旦曾解鎖即永久保持解鎖（只會把 unlocked 設 true，不會設回 false）。
 */
export async function refreshRecapState(uid) {
    const userId = uid || getUserId();
    const settled = getSettledMonth();
    if (!userId) return { unlocked: false, hasData: false, ym: settled.ym, report: null };
    try {
        const { data: r } = await apiClient.get(`/api/user/monthly-report/${userId}?month=${settled.ym}`);
        const hasData = !!r && (
            (r.fitness?.sessions || 0) > 0 ||
            (r.cardio?.run_count || 0) > 0 ||
            (r.nutrition?.logged_days || 0) > 0
        );
        if (hasData) {
            localStorage.setItem(key(K_UNLOCKED, userId), 'true');
            localStorage.setItem(key(K_SETTLED, userId), settled.ym);
        }
        return { unlocked: hasData || isRecapUnlocked(userId), hasData, ym: settled.ym, report: hasData ? r : null };
    } catch (e) {
        return { unlocked: isRecapUnlocked(userId), hasData: false, ym: settled.ym, report: null };
    }
}
