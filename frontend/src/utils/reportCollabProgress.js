/**
 * reportCollabProgress.js — 訓練/跑步完成後，回報進度給進行中的協作
 * ──────────────────────────────────────────────────────────────────
 * 在訓練或跑步完成存檔後呼叫一次。它會：
 *   1. 向後端查此使用者所有 accepted（進行中）的協作
 *   2. 把這次完成的量（跑步 km / 重訓 volume）累加回報給對應 type 的協作
 *   3. 後端會自動判定雙方達標 → completed
 *
 * 用法（在跑步存檔成功後）：
 *   import { reportCollabProgress } from '../utils/reportCollabProgress';
 *   reportCollabProgress({ userId, type: 'Run', amount: distanceKm });
 *
 * 重訓：reportCollabProgress({ userId, type: 'Lift', amount: totalVolume });
 *
 * 失敗不拋錯（不影響主存檔流程）。
 */

import apiClient from '../api/client';

const PROGRESS_KEY = 'collabProgressAccum'; // 各協作的本地累積值 { challenge_id: amount }

function loadAccum() {
    try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}'); } catch (_) { return {}; }
}
function saveAccum(obj) {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(obj)); } catch (_) {}
}

/**
 * @param {Object} p
 * @param {string} p.userId
 * @param {'Run'|'Lift'} p.type  這次完成的活動類型
 * @param {number} p.amount      這次完成的量（Run=km、Lift=volume）
 */
export async function reportCollabProgress({ userId, type, amount }) {
    if (!userId || !amount || amount <= 0) return;

    let challenges = [];
    try {
        const res = await apiClient.get(`/api/social/challenge/list/${userId}`);
        challenges = res.data?.challenges || [];
    } catch (_) { return; }

    // 只回報「進行中（accepted）」且 type 相符的協作/挑戰
    const active = challenges.filter(c =>
        c.status === 'accepted' && (c.type || 'Run') === type
    );
    if (active.length === 0) return;

    const accum = loadAccum();

    for (const c of active) {
        // 本地累積這次的量（後端 progress 是「目前累積總量」語意）
        const prev = accum[c.challenge_id] || 0;
        const next = prev + amount;
        accum[c.challenge_id] = next;
        try {
            await apiClient.post('/api/social/challenge/progress', {
                user_id: userId,
                challenge_id: c.challenge_id,
                progress: next,
            });
        } catch (_) { /* 單筆失敗不影響其他 */ }
    }

    saveAccum(accum);
}

export default { reportCollabProgress };
