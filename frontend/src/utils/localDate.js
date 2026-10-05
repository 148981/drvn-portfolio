// localDate.js — 本地日期鑰匙（單一真相源）
// ─────────────────────────────────────────────────────────────
// 🔴 為什麼存在：`d.toISOString().split('T')[0]` 回傳的是 UTC 日期。
// 台灣（UTC+8）在 00:00–07:59 之間的紀錄會被歸到「昨天」，
// 直接打斷 streak、打卡、週統計。全站取「某活動屬於哪一天」一律用這裡。
//
// 規則（產品憲法鐵律 4：單一真相源）：
//   - 「這筆紀錄是哪一天」→ toLocalDateKey()（使用者手機時區）
//   - 與後端交換的機器時間戳 → 照舊用 ISO 完整字串（含時間與時區）
//   - 不要再新增任何 toISOString().split('T')[0]

/**
 * 回傳本地時區的 YYYY-MM-DD。
 * @param {Date|string|number} [input] Date 物件 / 可解析字串 / epoch ms，省略 = 現在
 * @returns {string} 'YYYY-MM-DD'（無效輸入回 ''，呼叫端自行決定 fallback）
 */
export function toLocalDateKey(input) {
    const d = input instanceof Date ? input : input != null ? new Date(input) : new Date();
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** 今天（本地時區）的 YYYY-MM-DD。 */
export function todayKey() {
    return toLocalDateKey(new Date());
}

/** 兩個日期是否為同一個「本地日」。 */
export function isSameLocalDay(a, b) {
    return toLocalDateKey(a) === toLocalDateKey(b) && toLocalDateKey(a) !== '';
}

/* ═══════════════════════════════════════════════════════════════════
   一週的起點 —— 全 App 統一「週一為始」
   ─────────────────────────────────────────────────────────────────
   🔴 為什麼存在：專案裡原本同時有兩種算法
       週一制：(getDay() + 6) % 7        ← 課表、週曆、agenda、UI 標籤
       週日制：getDate() - getDay()      ← 部分統計、成就、訓練日誌
     兩者在「週日」會差整整一週：2026-09-06（日）
       週一制起點 = 08-31（這週的最後一天）
       週日制起點 = 09-06（新的一週第一天）
     結果就是週日練完之後，課表說「本週完成 3/3」、
     統計卻說「本週 0 次」——而且只有週日會錯，極難被回報。

   UI 一律顯示「一二三四五六日」，所以週一制才是正確的那個。
   新程式一律用這支，不要再自己算。
   ═══════════════════════════════════════════════════════════════ */

/** 星期幾（週一 = 0 … 週日 = 6）。JS 原生 getDay() 是週日 = 0。 */
export function weekdayMonFirst(d = new Date()) {
    const t = d instanceof Date ? d : new Date(d);
    return (t.getDay() + 6) % 7;
}

/** 該日期所屬「週一為始」那一週的週一 00:00（本地時區）。 */
export function startOfWeek(d = new Date(), weekOffset = 0) {
    const t = d instanceof Date ? new Date(d) : new Date(d);
    if (Number.isNaN(t.getTime())) return new Date(NaN);
    t.setDate(t.getDate() - weekdayMonFirst(t) + weekOffset * 7);
    t.setHours(0, 0, 0, 0);
    return t;
}

/** 該日期所屬那一週的週日 23:59:59.999（本地時區）。 */
export function endOfWeek(d = new Date(), weekOffset = 0) {
    const s = startOfWeek(d, weekOffset);
    if (Number.isNaN(s.getTime())) return new Date(NaN);
    s.setDate(s.getDate() + 6);
    s.setHours(23, 59, 59, 999);
    return s;
}

/**
 * 「週一為始」的週標記，格式 `YYYY-Wn`（ISO 週，本地時區）。
 * 以前各檔自己算（年初偏移 ÷ 7）—— 那個算法在週六白天就跳到下一週，
 * 週六的長跑、週日的結算都被算進「下週」。
 */
export function mondayWeekKey(d = new Date()) {
    const t = startOfWeek(d);
    if (Number.isNaN(t.getTime())) return '';
    const thu = new Date(t); thu.setDate(t.getDate() + 3);          // 這週的週四決定 ISO 年
    const jan4 = new Date(thu.getFullYear(), 0, 4);
    const week1 = startOfWeek(jan4);
    const week = 1 + Math.round((t - week1) / 604800000);
    return `${thu.getFullYear()}-W${week}`;
}

export default toLocalDateKey;
