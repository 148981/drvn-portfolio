// 📅 journeyJoinDate — 「加入 DRVN 第幾天」單一真相源
// ─────────────────────────────────────────────────────────────
// 舊版只看 localStorage（onboarding / InBody），兩者都沒有就以「今天」落檔 —
// 結果老用戶換裝置或清快取後永遠顯示「第 1 天」（沒在計數）。
// 修正：把「最早一筆真實紀錄」（重訓歷史 / 有氧 session / InBody / onboarding）
// 全部納入候選，取最早者作為 Day 1，並回寫 localStorage 固定住。
import apiClient, { getWorkoutHistory } from '../api/client';

const JOIN_KEY = (uid) => `drvn_join_date_${uid || 'guest'}`;

/** 由 join 日期算「第幾天」：加入當天 = 第 1 天。 */
export const joinDaysFrom = (join) =>
    Math.max(1, Math.floor((Date.now() - join.getTime()) / 86400000) + 1);

/** 同步讀已落檔的 join date（沒有回 null）。 */
export function storedJoinDate(userId) {
    try {
        const c = localStorage.getItem(JOIN_KEY(userId));
        if (!c) return null;
        const d = new Date(c);
        return isNaN(d) ? null : d;
    } catch { return null; }
}

/**
 * 非同步校正：撈重訓歷史 + 有氧 sessions + 本機 InBody/onboarding，
 * 取最早日期為 Day 1（比已存的更早才覆寫）。回傳最終 join Date。
 */
export async function reconcileJoinDate(userId) {
    const candidates = [];
    const push = (raw) => {
        if (raw == null) return;
        const d = new Date(raw);
        // 2020 前的日期視為髒資料（epoch 0 / 無效 timestamp）
        if (!isNaN(d) && d.getTime() > new Date('2020-01-01').getTime() && d.getTime() <= Date.now()) {
            candidates.push(d);
        }
    };

    const stored = storedJoinDate(userId);
    if (stored) push(stored);
    try {
        const ob = JSON.parse(localStorage.getItem(`onboarding_${userId}`) || 'null');
        push(ob?.completed_at);
    } catch { /* */ }
    try {
        const ib = JSON.parse(localStorage.getItem(`inbody_local_${userId}`) || '[]');
        (Array.isArray(ib) ? ib : []).forEach((r) => push(r.measurement_date || r.date || r.created_at));
    } catch { /* */ }

    // 真實紀錄（重訓 + 有氧）— 任一端點失敗都不阻擋
    try {
        const w = await getWorkoutHistory(userId, 500).catch(() => null);
        const list = w?.history || (Array.isArray(w) ? w : []);
        list.forEach((r) => push(r.timestamp || r.date || r.created_at));
    } catch { /* */ }
    try {
        const r = await apiClient.get(`/api/cardio/sessions/${userId}?limit=300`).catch(() => null);
        (r?.data?.sessions || []).forEach((s) => push(s.created_at || s.date));
    } catch { /* */ }

    const join = candidates.length
        ? new Date(Math.min(...candidates.map((d) => d.getTime())))
        : new Date();
    try { localStorage.setItem(JOIN_KEY(userId), join.toISOString()); } catch { /* */ }
    return join;
}
