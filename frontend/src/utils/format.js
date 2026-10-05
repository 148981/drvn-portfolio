// format.js — 全站數字顯示的單一真相源（Phase 2b-J，產品憲法鐵律 4）
// ─────────────────────────────────────────────────────────────────────────────
// 🔴 之前：formatPace 有 20 份實作、formatDuration 有 6 份 — 輸入單位（秒/分）、
//    空值語彙（--:-- / 0'00" / — / null）、四捨五入規則各自為政，
//    同一筆配速在動態卡與結算頁可能差 1 秒、長相不同。
// 🩹 現在：顯示規則只在這裡定義一次。
//
// DRVN 顯示規範：
//   配速  → M'SS"（秒進位含進位處理），空值 → --'--"
//   時長  → M:SS，滿 1 小時 → H:MM:SS；compact 變體 → 1h 23m / 45m
//   合理配速區間（資料驗證用）→ 120–1200 秒/km

export const PACE_EMPTY = "--'--\"";

/** 配速（秒/公里）→ "5'37\""。無效輸入回 empty（預設 --'--"）。 */
export function formatPace(secPerKm, empty = PACE_EMPTY) {
    const v = Number(secPerKm);
    if (!Number.isFinite(v) || v <= 0) return empty;
    const total = Math.round(v);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}'${String(s).padStart(2, '0')}"`;
}

/** 配速（分/公里，可含小數）→ 同上。 */
export function formatPaceMin(minPerKm, empty = PACE_EMPTY) {
    const v = Number(minPerKm);
    if (!Number.isFinite(v) || v <= 0) return empty;
    return formatPace(v * 60, empty);
}

/** 時長（秒）→ "MM:SS"；≥1 小時 → "H:MM:SS"。falsy → "0:00"。 */
export function formatDuration(seconds) {
    const v = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(v / 3600);
    const m = Math.floor((v % 3600) / 60);
    const s = v % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

/** 時長（秒）→ "1h 23m" / "45m"（列表、摘要用的精簡版）。 */
export function formatDurationCompact(seconds) {
    const v = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(v / 3600);
    const m = Math.floor((v % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** 資料驗證：配速是否在人類合理區間（120–1200 秒/km，pitfalls.md 規則）。 */
export function isPlausiblePace(secPerKm) {
    const v = Number(secPerKm);
    return Number.isFinite(v) && v >= 120 && v <= 1200;
}
