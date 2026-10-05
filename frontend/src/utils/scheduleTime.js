// ─────────────────────────────────────────────────────────────
// 🗓️ Schedule Time — 「下次跑步」時間推算
//
// 背景：計劃的 brick 沒有真實日期欄位（只有陣列順序，前端用 index%7 貼 MON/TUE…）。
// 所以「下次跑步是哪一天」無法從計劃直接讀，改用「平均分散在一週」推算：
//   本週還剩 N 堂未完成 → 把它們平均塞進從今天起的未來 7 天，
//   下次跑步 = 第一堂，日期 = 今天 + round(7 / (N+1)) 天（至少 +1 天）。
//
// 顯示一律用「間隔時間」（今天 / 明天 / N 天後），不是絕對日期。
// 也提供使用者手動選項（今晚 / 明早 / 後天…）。
// ─────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

const atTime = (dateObj, hhmm = '07:00') => {
    const [h, m] = String(hhmm).split(':').map(Number);
    const d = new Date(dateObj);
    d.setHours(h || 7, m || 0, 0, 0);
    return d;
};

/**
 * 由本週 pending brick 數推算「下次跑步」的日期。
 * @param {number} pendingCount 本週剩餘未完成課數（無計劃傳 0）
 * @param {Date}   from         起算日（預設今天）
 * @returns {Date} 下次跑步日期（07:00）
 */
export const computeNextRunDate = (pendingCount = 0, from = new Date()) => {
    // 平均間隔：一週 7 天平均塞 N 堂 → 間隔 ≈ 7/(N+1)，至少 1 天、最多 3 天
    const n = Math.max(0, Number(pendingCount) || 0);
    const gap = n > 0 ? Math.min(3, Math.max(1, Math.round(7 / (n + 1)))) : 2;
    const next = new Date(from.getTime() + gap * DAY_MS);
    return atTime(next, '07:00');
};

/**
 * 把日期轉成「間隔時間」中文顯示。
 * @param {Date} target
 * @param {Date} from
 * @returns {string} 今天 / 明天 / 後天 / N 天後
 */
export const formatRelativeDay = (target, from = new Date()) => {
    const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const days = Math.round((startOfDay(target) - startOfDay(from)) / DAY_MS);
    if (days <= 0) return '今天';
    if (days === 1) return '明天';
    if (days === 2) return '後天';
    return `${days} 天後`;
};

/**
 * 完整顯示字串：相對日 + 時間，例如「明天 07:00」。
 */
export const formatScheduleLabel = (target, from = new Date()) => {
    const hh = String(target.getHours()).padStart(2, '0');
    const mm = String(target.getMinutes()).padStart(2, '0');
    return `${formatRelativeDay(target, from)} ${hh}:${mm}`;
};

/**
 * 使用者可選的快捷時間選項。每個回傳一個 Date。
 * @param {Date} nextRunDate computeNextRunDate 的結果（作為「建議」選項）
 */
export const buildScheduleOptions = (nextRunDate, from = new Date()) => {
    const today = new Date(from);
    const tomorrow = new Date(from.getTime() + DAY_MS);
    return [
        { id: 'suggested', label: '建議', date: nextRunDate, hint: formatScheduleLabel(nextRunDate, from) },
        { id: 'tonight', label: '今晚', date: atTime(today, '19:00'), hint: '今天 19:00' },
        { id: 'tomorrow_am', label: '明早', date: atTime(tomorrow, '07:00'), hint: '明天 07:00' },
        { id: 'tomorrow_pm', label: '明晚', date: atTime(tomorrow, '19:00'), hint: '明天 19:00' },
    ];
};

/** Date → 'HH:MM'，供寫入提醒系統 */
export const toHHMM = (dateObj) => {
    const hh = String(dateObj.getHours()).padStart(2, '0');
    const mm = String(dateObj.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
};
