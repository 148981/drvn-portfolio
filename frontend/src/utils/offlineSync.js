// ════════════════════════════════════════════════════════════════════════
//  offlineSync.js — 全域「離線紀錄補送」
//
//  🔴 為什麼存在
//  存檔失敗時，CardioTrackerMobile 會把紀錄寫進 IndexedDB（synced:false），
//  這一段本來就做對了。問題出在「誰負責把它送出去」：
//
//    重送邏輯原本只掛在 <SyncStatusIndicator>，而它只 render 在
//    跑步頁與計劃頁。也就是說 —— 使用者在地下室健身房／隧道裡跑完、
//    離線存進 IndexedDB、回家連上網路後如果沒有再點進跑步頁，
//    那筆紀錄就會永遠留在本機，不會補送。
//
//  這支檔案把補送抽成與畫面無關的函式，由 App 層在
//  「App 啟動」與「網路恢復」時呼叫，任何頁面都能觸發。
//
//  設計原則
//    · 冪等：同一筆送成功才 markWorkoutSynced，失敗保持未同步等下次
//    · 靜默：使用者沒有主動要求同步，不跳任何 UI，只寫 console
//    · 併發鎖：避免 online 事件連續觸發造成重複上傳
// ════════════════════════════════════════════════════════════════════════

import apiClient, { syncPendingStrengthWorkouts } from '../api/client';
import indexedDBManager from './indexedDB';
import { downsampleCardioForUpload } from './cardioDownsample';

let _flushing = false;
// 全域補送（跑步＋重訓）共用的鎖：online 事件連發或啟動計時器與 online 撞在一起時，
// 只允許一輪補送在跑，避免同一筆重訓被 POST 兩次（重訓的 markWorkoutSynced 在 POST 之後才寫）
let _runInFlight = null;

/* ── 課表磚回寫／RPE 的本機待送佇列 ─────────────────────────────
   complete-brick 失敗（或整趟跑步是離線存的）以前就直接丟掉 → 課表永遠沒打勾、
   週結算拿不到實跑數據。RPE 失敗雖然有寫 drvn:pendingRpeLogs，但從來沒人送出去。
   兩者都在這裡排隊，跑步紀錄補送完之後一起補送。 */
export const PENDING_BRICK_KEY = 'drvn:pendingBrickCompletions';
export const PENDING_RPE_KEY = 'drvn:pendingRpeLogs';

const readQueue = (key) => {
    try {
        const v = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(v) ? v : [];
    } catch { return []; }
};
const writeQueue = (key, list) => {
    try {
        if (list.length) localStorage.setItem(key, JSON.stringify(list));
        else localStorage.removeItem(key);
    } catch { /* 無痕模式等 */ }
};

/** 把一筆 complete-brick payload 放進待送佇列（同一 brick 只留最新一筆） */
export function queueBrickCompletion(payload) {
    if (!payload?.brick_id) return;
    const rest = readQueue(PENDING_BRICK_KEY).filter((p) => p?.brick_id !== payload.brick_id);
    writeQueue(PENDING_BRICK_KEY, [...rest, { ...payload, queued_at: new Date().toISOString() }]);
}

/** 補送 complete-brick；成功或後端明確拒收（4xx，例如磚已不存在）就移出佇列 */
export async function flushPendingBrickCompletions(userId) {
    const queue = readQueue(PENDING_BRICK_KEY);
    if (!queue.length) return 0;
    const keep = [];
    let sent = 0;
    for (const item of queue) {
        // 別的帳號留下的不動，等那個帳號登入再送
        if (item?.user_id && userId && item.user_id !== userId) { keep.push(item); continue; }
        try {
            const { queued_at: _q, ...payload } = item;
            await apiClient.post('/api/cardio-plan/complete-brick', { ...payload, user_id: payload.user_id || userId });
            sent += 1;
        } catch (e) {
            const code = e?.response?.status;
            if (code && code >= 400 && code < 500 && code !== 408 && code !== 429) continue; // 永遠送不成，丟掉
            keep.push(item);
        }
    }
    writeQueue(PENDING_BRICK_KEY, keep);
    if (sent) console.log(`[offlineSync] ✅ 補送課表磚完成 ${sent} 筆`);
    return sent;
}

/** 補送離線時沒送出的 RPE（POST /api/cardio-plan/log-rpe） */
export async function flushPendingRpeLogs(userId) {
    const queue = readQueue(PENDING_RPE_KEY);
    if (!queue.length || !userId) return 0;
    const keep = [];
    let sent = 0;
    for (const item of queue) {
        if (item?.user_id && item.user_id !== userId) { keep.push(item); continue; }
        try {
            await apiClient.post('/api/cardio-plan/log-rpe', { ...item, user_id: userId });
            sent += 1;
        } catch (e) {
            const code = e?.response?.status;
            if (code && code >= 400 && code < 500 && code !== 408 && code !== 429) continue;
            keep.push(item);
        }
    }
    writeQueue(PENDING_RPE_KEY, keep);
    if (sent) console.log(`[offlineSync] ✅ 補送 RPE ${sent} 筆`);
    return sent;
}

/**
 * 把本機所有未同步的跑步紀錄補送到後端。
 * 重訓紀錄由 syncPendingStrengthWorkouts 負責，這裡只處理跑步，
 * 避免讀取 stats.distance 時對重訓資料拋錯（與跑步頁的分流一致）。
 *
 * @param {string} userId
 * @returns {Promise<number>} 實際補送成功的筆數
 */
export async function flushUnsyncedCardio(userId) {
    if (!userId || _flushing) return 0;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;

    _flushing = true;
    let synced = 0;
    try {
        const all = await indexedDBManager.getUnsyncedWorkouts(userId);
        const items = (all || []).filter(
            (w) => w.workout?.kind !== 'strength' && w.workout?.endpoint !== '/api/workout/save'
        );
        if (!items.length) return 0;
        console.log(`[offlineSync] 發現 ${items.length} 筆未同步跑步紀錄，開始補送`);

        for (const item of items) {
            try {
                // 與線上存檔同樣先降取樣（雲端精簡、本機保留完整解析度）
                const ds = downsampleCardioForUpload({
                    route: item.workout.route || [],
                    stream_data: item.workout.stream_data,
                });
                const payload = {
                    user_id: userId,
                    date: new Date(item.timestamp).toISOString(),
                    route_data: ds.route,
                    metrics: {
                        ...item.workout.stats,
                        distance_km: item.workout.stats?.distance,
                        duration_seconds: item.workout.stats?.duration,
                        pace_per_km: item.workout.stats?.pace,
                    },
                    stream_data: ds.stream_data,
                };
                const res = await apiClient.post('/api/cardio/session', payload);
                // 只有後端真的收下才標記已同步；否則留著等下次
                if (res?.status === 200 || res?.ok || res?.data?.session_id) {
                    await indexedDBManager.markWorkoutSynced(item.id);
                    synced += 1;
                    // 這趟是從課表磚開始跑的 → 帶上剛拿到的 session_id 排進磚回寫佇列，
                    // 下面 flushPendingBrickCompletions 會送出（以前離線跑完的磚永遠不會打勾）
                    const pb = item.workout?.pending_brick;
                    if (pb?.brick_id) {
                        queueBrickCompletion({ ...pb, user_id: pb.user_id || userId, session_id: res?.data?.session_id || null });
                    }
                }
            } catch (e) {
                // 單筆失敗不影響其他筆，也不標記已同步
                console.warn('[offlineSync] 補送失敗，保留於本機:', item.id, e?.message);
            }
        }
        if (synced) console.log(`[offlineSync] ✅ 補送完成 ${synced}/${items.length} 筆`);
    } catch (e) {
        console.warn('[offlineSync] 讀取未同步紀錄失敗:', e?.message);
    } finally {
        // 跑步紀錄送完之後再送磚回寫與 RPE（磚回寫需要 session 先存在）
        try { await flushPendingBrickCompletions(userId); } catch { /* 下次再試 */ }
        try { await flushPendingRpeLogs(userId); } catch { /* 下次再試 */ }
        _flushing = false;
    }
    return synced;
}

/**
 * 掛上全域補送：App 啟動時試一次，之後每次網路恢復再試。
 * @returns {() => void} 取消註冊用的 cleanup
 */
export function startOfflineSync(getUserId) {
    if (typeof window === 'undefined') return () => {};

    const run = () => {
        if (_runInFlight) return _runInFlight; // 上一輪還沒跑完，不重複觸發
        let uid;
        try {
            uid = typeof getUserId === 'function' ? getUserId() : getUserId;
        } catch { return undefined; /* 不讓補送影響主流程 */ }
        if (!uid) return undefined;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return undefined;

        _runInFlight = (async () => {
            // 1) 跑步紀錄（含課表磚回寫／RPE）
            try { await flushUnsyncedCardio(uid); } catch { /* 下次再試 */ }
            // 2) 重訓紀錄：saveWorkout 離線時寫進 IndexedDB，以前只有跑步頁的同步按鈕會補送 →
            //    使用者沒點進跑步頁，重訓紀錄就永遠留在本機。這裡在啟動／網路恢復時自動補送。
            try {
                const n = await syncPendingStrengthWorkouts(uid);
                if (n) console.log(`[offlineSync] ✅ 補送重訓紀錄 ${n} 筆`);
            } catch (e) {
                console.warn('[offlineSync] 重訓補送失敗，保留於本機:', e?.message);
            }
        })().finally(() => { _runInFlight = null; });
        return _runInFlight;
    };

    // 啟動時延遲一下，避開 App 初始化的網路尖峰
    const t = setTimeout(run, 4000);
    window.addEventListener('online', run);
    return () => {
        clearTimeout(t);
        window.removeEventListener('online', run);
    };
}
