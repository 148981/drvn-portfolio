/**
 * monthlyRecapReminder.js — 月回顧「時間到」提示邏輯
 * ──────────────────────────────────────────────────────────
 * 純邏輯工具，不含 UI。判斷是否該提示使用者去看「上個月的月報」。
 *
 * 觸發條件（三者皆需成立）：
 *   1. 已進入新的月份（上個月已結束）
 *   2. 上個月有訓練紀錄（沒練過就不打擾）
 *   3. 這個月還沒看過上月的月報（已看過 / 已關閉就不再提示）
 *
 * 用法（在任何元件，例如首頁 Dashboard）：
 *   import { shouldShowMonthlyRecap, dismissMonthlyRecap } from '../utils/monthlyRecapReminder';
 *   const reminder = shouldShowMonthlyRecap(userId);
 *   if (reminder.show) { ...顯示提示，點擊導向 /monthly-report... }
 *   // 使用者看過或關閉後：
 *   dismissMonthlyRecap(userId);
 */

import { uGet, uSet } from './userStorage';

const DISMISS_KEY = 'monthlyRecapSeen'; // 存「已看過的月份標記」，格式 'YYYY-MM'（指上個月）

/** 取得上一個月的 { year, month, key }（month 為 1-12，key 為 'YYYY-MM'） */
function getPrevMonth(now = new Date()) {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    return { year, month, key };
}

/** 讀取本地訓練紀錄（與 MonthlyReportPage 相同資料源） */
function getTrainingRecords(userId) {
    // trainingRecords 可能是 array 或 { id: record } 物件，兩者都處理
    const raw = uGet(userId, 'trainingRecords', null);
    if (!raw) return [];
    return Array.isArray(raw) ? raw : Object.values(raw);
}

/** 判斷上個月是否有任何訓練紀錄 */
function hasRecordsInMonth(userId, monthKey) {
    const records = getTrainingRecords(userId);
    return records.some((r) => {
        const dateStr = String(r?.date || r?.timestamp || '');
        return dateStr.startsWith(monthKey);
    });
}

/**
 * 是否該顯示月回顧提示。
 * @returns {{ show: boolean, monthKey: string, month: number, year: number, reason: string }}
 */
export function shouldShowMonthlyRecap(userId, now = new Date()) {
    const prev = getPrevMonth(now);
    const base = { show: false, monthKey: prev.key, month: prev.month, year: prev.year, reason: '' };

    // 條件 3：已看過/已關閉上月報告 → 不提示
    const seen = uGet(userId, DISMISS_KEY, null);
    if (seen === prev.key) {
        return { ...base, reason: 'already_seen' };
    }

    // 條件 2：上月沒有訓練紀錄 → 不打擾
    if (!hasRecordsInMonth(userId, prev.key)) {
        return { ...base, reason: 'no_records' };
    }

    // 條件 1（隱含）：getPrevMonth 一定是已結束的月份；走到這裡即代表「時間到」
    return { ...base, show: true, reason: 'due' };
}

/**
 * 標記「上個月的月報已看過 / 已關閉」，之後不再提示，直到下個月。
 */
export function dismissMonthlyRecap(userId, now = new Date()) {
    const prev = getPrevMonth(now);
    uSet(userId, DISMISS_KEY, prev.key);
}

export default { shouldShowMonthlyRecap, dismissMonthlyRecap };
