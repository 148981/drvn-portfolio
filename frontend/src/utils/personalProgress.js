/**
 * personalProgress.js — 個人月度進步（跟自己比）
 * ──────────────────────────────────────────────────────────────────────
 * 排行榜容易讓人只在意「贏過誰」；這支工具改成讓使用者看到「自己在進步」：
 *   比較「本月」與「上月」自己的跑步數據 → 里程、配速、次數、連續天數的變化。
 *
 * 資料來源：localStorage 的 workout_history + cardio_sessions（跟人格系統同源）。
 * 回傳 { thisMonth, lastMonth, deltas, hasData }，deltas 每項含 { value, dir, pct }。
 * ──────────────────────────────────────────────────────────────────────
 */

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const m = (s) => (s && (s.metrics || s.stats)) || {};
const sDist = (s) => num(m(s).distance_km ?? m(s).distance ?? s.distance_km ?? s.distance ?? s.km);
const sPace = (s) => num(m(s).pace_per_km ?? m(s).avgPace ?? m(s).avg_pace ?? s.avgPace ?? s.pace);
const sTs = (s) => s?.timestamp ?? s?.date ?? s?.created_at ?? s?.startTime ?? null;

function readCardioSessions() {
    const out = [];
    try {
        const raw = localStorage.getItem('cardio_sessions');
        if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) out.push(...p); }
    } catch (_) {}
    try {
        const all = JSON.parse(localStorage.getItem('workout_history') || '[]');
        if (Array.isArray(all)) {
            const CARDIO_T = ['run', 'running', 'cardio', 'jog', 'walk', 'cycling', 'swim'];
            all.forEach((s) => {
                const t = String(s.type || s.activity_type || s.workout_type || '').toLowerCase();
                // workout_history 內跑步型 & 有距離者都算
                if (CARDIO_T.some((k) => t.includes(k)) || sDist(s) > 0) out.push(s);
            });
        }
    } catch (_) {}
    return out;
}

function monthKeyOf(ts) {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${d.getMonth()}`;
}

function summarize(sessions) {
    const dists = sessions.map(sDist).filter((x) => x > 0);
    const paces = sessions.map(sPace).filter((x) => x > 60 && x < 1000);
    return {
        count: sessions.length,
        distance: +dists.reduce((a, b) => a + b, 0).toFixed(1),
        avgPace: paces.length ? Math.round(paces.reduce((a, b) => a + b, 0) / paces.length) : 0,
    };
}

// 重訓 session 的訓練量(kg)
const sVolume = (s) => num(s.total_volume ?? s.volume_kg ?? s.volume ?? m(s).volume ?? m(s).volume_kg);

function readStrengthSessions() {
    const out = [];
    try {
        const all = JSON.parse(localStorage.getItem('workout_history') || '[]');
        if (Array.isArray(all)) {
            all.forEach((s) => {
                const t = String(s.type || s.activity_type || s.workout_type || '').toLowerCase();
                const isCardio = ['run', 'running', 'cardio', 'jog', 'walk', 'cycling', 'swim'].some((k) => t.includes(k));
                // 有動作清單、或訓練量、或型別含 strength/gym → 視為重訓
                if (!isCardio && (s.exercises?.length || s.completedExercises?.length || sVolume(s) > 0 || t.includes('strength') || t.includes('gym') || t.includes('workout'))) {
                    out.push(s);
                }
            });
        }
    } catch (_) {}
    try {
        const rec = JSON.parse(localStorage.getItem('trainingRecords') || '{}');
        Object.values(rec).forEach((s) => { if (s && (sVolume(s) > 0 || s.exercises?.length)) out.push(s); });
    } catch (_) {}
    return out;
}

function summarizeStrength(sessions) {
    const vols = sessions.map(sVolume).filter((x) => x > 0);
    return {
        count: sessions.length,
        volume: Math.round(vols.reduce((a, b) => a + b, 0)),
    };
}

/**
 * 計算本月 vs 上月的個人進步。
 * @param {Date} [now] 便於測試注入時間
 */
export function computeMonthlyProgress(now = new Date()) {
    const sessions = readCardioSessions();
    const thisKey = `${now.getFullYear()}-${now.getMonth()}`;
    const lastDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastKey = `${lastDate.getFullYear()}-${lastDate.getMonth()}`;

    const thisSessions = sessions.filter((s) => monthKeyOf(sTs(s)) === thisKey);
    const lastSessions = sessions.filter((s) => monthKeyOf(sTs(s)) === lastKey);

    const thisMonth = summarize(thisSessions);
    const lastMonth = summarize(lastSessions);

    // 重訓訓練量（本月 vs 上月）
    const strengthAll = readStrengthSessions();
    const thisStrength = summarizeStrength(strengthAll.filter((s) => monthKeyOf(sTs(s)) === thisKey));
    const lastStrength = summarizeStrength(strengthAll.filter((s) => monthKeyOf(sTs(s)) === lastKey));

    // 距離 / 次數：越多越好（up=進步）；配速：秒數越小越好（下降=進步）
    const mkDelta = (cur, prev, lowerIsBetter = false) => {
        const diff = cur - prev;
        const improved = lowerIsBetter ? diff < 0 : diff > 0;
        const pct = prev > 0 ? Math.round(Math.abs(diff) / prev * 100) : (cur > 0 ? 100 : 0);
        return {
            value: +Math.abs(diff).toFixed(1),
            raw: +diff.toFixed(1),
            dir: diff === 0 ? 'flat' : (improved ? 'up' : 'down'),
            pct,
        };
    };

    const deltas = {
        distance: mkDelta(thisMonth.distance, lastMonth.distance, false),
        count: mkDelta(thisMonth.count, lastMonth.count, false),
        pace: mkDelta(thisMonth.avgPace, lastMonth.avgPace, true),
        volume: mkDelta(thisStrength.volume, lastStrength.volume, false),
    };

    const hasData = thisMonth.count > 0 || lastMonth.count > 0 || thisStrength.count > 0 || lastStrength.count > 0;
    return {
        thisMonth, lastMonth, deltas, hasData,
        thisStrength, lastStrength,
    };
}

/**
 * 取得「最近一次跑步」的裝備與同行者，給圖一卡牌顯示。
 * @returns {{ shoe: {name,brand}|null, companions: {name,avatar,confidence}[], sessionId: string|null }}
 */
export function getLatestRunMeta() {
    try {
        const all = JSON.parse(localStorage.getItem('workout_history') || '[]');
        if (!Array.isArray(all) || all.length === 0) return { shoe: null, companions: [], sessionId: null };
        // 取有距離的最後一筆跑步
        const runs = all.filter((s) => sDist(s) > 0);
        const last = runs.length ? runs[runs.length - 1] : all[all.length - 1];
        const sessionId = last.session_id || null;
        let companions = [];
        try {
            const map = JSON.parse(localStorage.getItem('drvn_session_companions') || '{}');
            companions = (sessionId && map[sessionId]) || [];
        } catch (_) {}
        return { shoe: last.shoe || null, companions, sessionId };
    } catch (_) {
        return { shoe: null, companions: [], sessionId: null };
    }
}
