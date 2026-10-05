import { epleyE1RMStrict, workingWeightFor, roundToPlate } from './strengthMath';
/**
 * e1rmAdvisor.js — P4/P8 修復：PR → e1RM → 下一季負重處方 + 跨季平台期偵測
 * ========================================================================
 * 問題：Double Progression 只調次數/組數（clamp ±3、5 組封頂），系統從不
 *       告訴使用者「該加多少重量」→ 力量進步曲線在第 3-4 個月觸頂。
 *
 * 閉環：
 *   trainingRecords（每組真實 weight × reps）
 *     → Epley e1RM = weight × (1 + reps/30)
 *     → 下一季建議工作重量 = e1RM × 目標次數區間對應強度%（反向 Epley）
 *     → 寫入 exercise.suggestedWeight，Season 延續時自動附上
 *
 * 平台偵測（P8）：
 *   比較「最近 28 天」vs「前一個 28 天」的 e1RM 與訓練量，
 *   兩者皆無進步 → 判定平台期，Season 結算建議「重新設計計劃」
 *   （換動作模式 / 換分化），而不是繼續空轉加次數。
 *
 * 資料不足時全部安靜降級（回 null / 空陣列），不影響既有流程。
 */
import { uStorage } from './userStorage';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* 🔢 2026-09 稽核：本檔的有效範圍原本是 1–15，其他檔案是 12 或不限，
   於是同一組 14 下在這裡估得出、在趨勢頁被排除。
   改用 utils/strengthMath 的嚴格版（超出範圍回 null），範圍與全站一致。 */
export const epleyE1RM = epleyE1RMStrict;

/* 反向 Epley 與槓片進位也一併收到 strengthMath，避免兩處微妙不同。 */

/* ── 停練回來（detraining）：隔多久沒練這個動作，重量要先退多少 ─────────────
   依據：停訓 ≤2 週肌力幾乎不掉；3–4 週開始下降，8 週以上明顯
   （Mujika & Padilla 2000；Bosquet 2013 統合分析；McMaster 2013）。
   每次訓練的處方（sessionPrescription）與換季（seasonTransition）都用這一張表，
   兩邊說的「回來先從幾公斤開始」一定一樣。scripts/CYCLE_ROTATION_STANDARD.md S6。 */
export const STRENGTH_DETRAINING = [
    { minDays: 56, factor: 0.8, dropSet: true },    // 8 週以上：−20%，主項各少 1 組
    { minDays: 28, factor: 0.9, dropSet: true },    // 4–7 週：−10%，主項各少 1 組
    { minDays: 14, factor: 0.95, dropSet: false },  // 2–3 週：−5%
];
/** @returns {{ factor:number, dropSet:boolean, days:number }} 沒停多久 → factor 1 */
export function strengthDetraining(daysOff) {
    const d = Number(daysOff);
    if (!Number.isFinite(d) || d < 14) return { factor: 1, dropSet: false, days: Number.isFinite(d) ? Math.max(0, Math.floor(d)) : 0 };
    const row = STRENGTH_DETRAINING.find((x) => d >= x.minDays);
    return { factor: row.factor, dropSet: row.dropSet, days: Math.floor(d) };
}
/** 退重量只往下取到 2.5 kg（啞鈴 0.5 kg），不會因為進位反而比停練前重 */
export const floorToPlate = (kg, step = 2.5) => Math.floor((Number(kg) || 0) / step + 1e-9) * step;

/** 取 "8-12" / "10" / 數字 → 區間中點。時間型（"30s"）回 null。 */
function repMidpoint(repsVal) {
    if (typeof repsVal === 'number') return repsVal;
    if (typeof repsVal !== 'string') return null;
    const range = repsVal.match(/^(\d+)-(\d+)$/);
    if (range) return Math.round((parseInt(range[1]) + parseInt(range[2])) / 2);
    const single = repsVal.match(/^(\d+)$/);
    if (single) return parseInt(single[1]);
    return null;
}



/**
 * 掃描 trainingRecords，建立每個動作的 e1RM 表。
 * @param {string} userId
 * @param {number} sinceDays  只看最近 N 天（預設 60）
 * @returns {Object} { [exerciseName]: { e1rm, bestWeight, bestReps, samples, lastDate } }
 */
export function buildE1RMTable(userId, sinceDays = 60) {
    const table = {};
    try {
        const records = uStorage(userId).get('trainingRecords', {}) || {};
        const cutoff = Date.now() - sinceDays * 86400000;
        Object.values(records).forEach((rec) => {
            const ts = rec?.timestamp ? new Date(rec.timestamp).getTime() : 0;
            if (!Number.isFinite(ts) || !ts || ts < cutoff || ts > Date.now()) return;
            (rec.exercises || []).forEach((ex) => {
                if (!ex?.name || ex.isWarmup) return;
                const sets = Array.isArray(ex.sets) ? ex.sets : [];
                sets.forEach((s) => {
                    if (!s || s.completed === false || s.isWarmup || s.type === 'warmup') return;
                    const est = epleyE1RM(s.weight, s.reps);
                    if (!est) return;
                    const cur = table[ex.name];
                    if (!cur || est > cur.e1rm) {
                        table[ex.name] = {
                            e1rm: Math.round(est * 10) / 10,
                            bestWeight: parseFloat(s.weight),
                            bestReps: parseInt(s.reps),
                            samples: (cur?.samples || 0) + 1,
                            lastDate: rec.timestamp,
                        };
                    } else {
                        cur.samples += 1;
                    }
                });
            });
        });
    } catch { /* 資料損壞 → 空表 */ }
    return table;
}

/**
 * 由 e1RM 推出「這個次數區間該用多重」—— 換季處方與每次訓練建議共用這一條規則。
 *   · 至少 2 組真實數據才給（hit.samples ≥ 2）
 *   · 反向 Epley 算工作重量，上限為歷史最佳重量 ×1.10（避免估算暴衝）
 *   · 時間型次數（"30s"）不給
 * @returns {number|null}
 */
export function prescribeWorkingWeight(hit, repsVal) {
    if (!hit || hit.samples < 2) return null;
    const mid = repMidpoint(repsVal);
    if (!mid) return null;
    const raw = workingWeightFor(hit.e1rm, mid);
    if (!raw) return null;
    const capped = Math.min(raw, hit.bestWeight * 1.10);
    return roundToPlate(clamp(capped, 2.5, 500));
}

/* ── 每次訓練帶好重量（會員）─────────────────────────────────────────
   教練怎麼決定今天練多重：
     ① 看最近幾次，不是看兩個月內最好的那一天 —— 最近 3 次的 e1RM 加權（近的重）
     ② 上一次每一組都做到次數上限 → 加一格（2.5kg）
     ③ 今天準備度低 → 先減 5%（很低減 10%），做完覺得輕再自己加
     ④ 上限一樣是歷史最佳重量 ×1.10，不讓估算暴衝
     ⑤ 暖身組照著工作重量推：40% × 8 → 60% × 5 → 80% × 3（輕重量只留一組）
   第一次練、只有 1 組紀錄 → 不給（跟換季處方同一條底線）。 */
const RECENT_WEIGHTS = [0.5, 0.3, 0.2];

function repRangeOf(repsVal) {
    if (typeof repsVal === 'number') return { min: repsVal, max: repsVal };
    const m = String(repsVal || '').match(/^(\d+)\s*[-–~]\s*(\d+)$/);
    if (m) return { min: parseInt(m[1], 10), max: parseInt(m[2], 10) };
    const one = String(repsVal || '').match(/^(\d+)$/);
    return one ? { min: parseInt(one[1], 10), max: parseInt(one[1], 10) } : null;
}

/** 這個動作最近每一次訓練：{ at, e1rm, topWeight, topReps, sets:[{weight,reps}] }（新的在前） */
function recentSessionsOf(userId, exerciseName, sinceDays = 60) {
    const out = [];
    try {
        const records = uStorage(userId).get('trainingRecords', {}) || {};
        const cutoff = Date.now() - sinceDays * 86400000;
        Object.values(records).forEach((rec) => {
            const at = rec?.timestamp ? new Date(rec.timestamp).getTime() : 0;
            if (!Number.isFinite(at) || !at || at < cutoff || at > Date.now()) return;
            (rec.exercises || []).forEach((ex) => {
                if (ex?.name !== exerciseName || ex.isWarmup) return;
                const sets = (Array.isArray(ex.sets) ? ex.sets : [])
                    .filter((st) => st && st.completed !== false && !st.isWarmup && st.type !== 'warmup')
                    .map((st) => ({ weight: parseFloat(st.weight), reps: parseInt(st.reps, 10) }))
                    .filter((st) => st.weight > 0 && st.reps > 0);
                let best = null;
                sets.forEach((st) => {
                    const e = epleyE1RM(st.weight, st.reps);
                    if (e && (!best || e > best.e1rm)) best = { e1rm: e, topWeight: st.weight, topReps: st.reps };
                });
                if (best) out.push({ at, ...best, sets });
            });
        });
    } catch { /* 資料損壞 → 沒有紀錄 */ }
    return out.sort((a, b) => b.at - a.at);
}

/**
 * 今天這個動作的處方。資料不足回 null。
 * @param {object} opts.readinessScore  今天的準備度（utils/readiness.getTodayReadiness().score），沒有就不調
 * @param {string} opts.eq              器材大類（dumbbell 的暖身只留一組）
 * @returns {{ weight:number, warmups:Array<{weight,reps}>, reason:string, readinessPct:number,
 *             nudged:boolean, basisSessions:number } | null}
 */
export function sessionPrescription(userId, exerciseName, repsVal, { readinessScore = null, eq = null } = {}) {
    try {
        if (!userId || !exerciseName) return null;
        const table = buildE1RMTable(userId);
        const hit = table[exerciseName];
        const baseline = prescribeWorkingWeight(hit, repsVal);          // 同一條底線：≥2 組、非時間型
        if (!baseline) return null;
        const range = repRangeOf(repsVal);
        const recent = recentSessionsOf(userId, exerciseName).slice(0, RECENT_WEIGHTS.length);
        let weight = baseline;
        let nudged = false;
        if (recent.length) {
            const wSum = RECENT_WEIGHTS.slice(0, recent.length).reduce((a, b) => a + b, 0);
            const e = recent.reduce((acc, r, i) => acc + r.e1rm * RECENT_WEIGHTS[i], 0) / wSum;
            const raw = workingWeightFor(e, repMidpoint(repsVal));
            if (raw) weight = roundToPlate(clamp(Math.min(raw, hit.bestWeight * 1.10), 2.5, 500));
            // 上一次每一組都做到次數上限 → 加一格
            const last = recent[0];
            const lastWorking = last.sets.filter((st) => st.weight >= last.topWeight);
            if (range && lastWorking.length >= 2 && lastWorking.every((st) => st.reps >= range.max)) {
                const up = roundToPlate(last.topWeight + 2.5);
                if (up > weight) { weight = Math.min(up, roundToPlate(hit.bestWeight * 1.10)); nudged = true; }
            }
        }
        // 停練回來：這個動作最後一次練是兩週以前 → 先退一點（跟換季同一張表）
        const daysOff = recent.length ? (Date.now() - recent[0].at) / 86400000 : 0;
        const det = strengthDetraining(daysOff);
        if (det.factor < 1) weight = Math.max(2.5, floorToPlate(weight * det.factor));
        // 準備度
        let readinessPct = 0;
        const score = Number(readinessScore);
        if (Number.isFinite(score) && readinessScore !== null) {
            if (score < 30) readinessPct = -10;
            else if (score < 45) readinessPct = -5;
        }
        if (readinessPct) weight = roundToPlate(Math.max(2.5, weight * (1 + readinessPct / 100)));

        // 暖身組（工作重量的 40／60／80%，槓鈴至少空槓 20kg；輕重量或啞鈴只留一組）
        const warmups = [];
        const light = weight < 30 || String(eq || '').toLowerCase() === 'dumbbell';
        const steps = light ? [[0.5, 10]] : [[0.4, 8], [0.6, 5], [0.8, 3]];
        steps.forEach(([pct, reps]) => {
            let w = roundToPlate(weight * pct);
            if (!light && String(eq || '').toLowerCase() === 'barbell') w = Math.max(20, w);
            if (w > 0 && w < weight && !warmups.some((x) => x.weight === w)) warmups.push({ weight: w, reps });
        });

        const last = recent[0];
        const reason = det.factor < 1
            ? `隔了 ${Math.floor(det.days / 7)} 週沒練，先減 ${Math.round((1 - det.factor) * 100)}%`
            : readinessPct
            ? `今天準備度偏低，先減 ${Math.abs(readinessPct)}%`
            : nudged
                ? `上次 ${last.topWeight}kg 每組都做滿，加一格`
                : recent.length >= 2
                    ? `依最近 ${recent.length} 次的表現`
                    : `依上次 ${last ? `${last.topWeight}kg × ${last.topReps}` : '紀錄'}`;
        return { weight, warmups, reason, readinessPct, nudged, basisSessions: recent.length, detrainPct: Math.round((1 - det.factor) * 100) };
    } catch { return null; }
}

/** 只要重量的舊入口（換季處方驗證也用它）；沒準備度資料時跟換季處方同一個數字 */
export function sessionWeightFor(userId, exerciseName, repsVal, opts = {}) {
    return sessionPrescription(userId, exerciseName, repsVal, opts)?.weight ?? null;
}

/**
 * P4 主入口：把建議工作重量寫進計劃（mutate plan）。
 * 只處理有歷史 e1RM 且次數為力量型（非時間型）的動作。
 * @returns {Array<{name, suggestedWeight, e1rm, targetReps}>} 變更摘要（給 UI 顯示）
 */
export function applyLoadPrescriptions(plan, userId) {
    const changes = [];
    try {
        if (!plan?.weeks?.length) return changes;
        const table = buildE1RMTable(userId);
        if (Object.keys(table).length === 0) return changes;

        const seen = new Set();
        plan.weeks.forEach((week) => {
            week.days?.forEach((day) => {
                day.exercises?.forEach((ex) => {
                    const hit = table[ex.name];
                    const mid = repMidpoint(ex.reps);
                    const suggested = prescribeWorkingWeight(hit, ex.reps);
                    if (!suggested) return;
                    ex.suggestedWeight = suggested;
                    ex.e1rmBasis = hit.e1rm;
                    if (!seen.has(ex.name)) {
                        seen.add(ex.name);
                        changes.push({ name: ex.name, suggestedWeight: suggested, e1rm: hit.e1rm, targetReps: mid });
                    }
                });
            });
        });
    } catch { /* 降級：不加處方 */ }
    return changes;
}

/**
 * 🧪 e1RM 校準測試週：每 8 週建議做一次 AMRAP 校準，
 * 讓建議重量從「日常組估算」升級為「測試日實測」。
 * 判定：距離上次校準（或第一筆紀錄）≥ 56 天 → 到期。
 * @returns {null | { due: boolean, daysSince: number, message: string }}
 */
export function calibrationStatus(userId) {
    try {
        const KEY = `drvn:e1rmCalibratedAt_${userId}`;
        let last = null;
        try { last = localStorage.getItem(KEY); } catch { /* ignore */ }
        if (!last) {
            // 沒校準過 → 以第一筆訓練紀錄當起點
            const records = Object.values(uStorage(userId).get('trainingRecords', {}) || {});
            if (records.length < 8) return null; // 新手期不催測試
            const first = records.map(r => r?.timestamp).filter(Boolean).sort()[0];
            last = first || null;
        }
        if (!last) return null;
        const daysSince = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
        const due = daysSince >= 56;
        return {
            due,
            daysSince,
            message: due
                ? `距離上次力量校準已 ${daysSince} 天 — 建議本週安排一次 AMRAP 測試日（主項做到接近力竭的一組），讓建議重量用實測重新對準。`
                : null,
        };
    } catch { return null; }
}

/** 完成校準後呼叫（測試日結算時）。 */
export function markCalibrated(userId) {
    try { localStorage.setItem(`drvn:e1rmCalibratedAt_${userId}`, new Date().toISOString()); } catch { /* ignore */ }
}

/**
 * P8：跨季平台期偵測。
 * 比較最近 28 天 vs 前一個 28 天的（a）主要動作平均 e1RM（b）總訓練量。
 * @returns {null | { plateau, e1rmDeltaPct, volumeDeltaPct, detail }}
 *   資料不足（任一窗口 < 4 次訓練）回 null。
 */
export function detectPlateau(userId) {
    try {
        return detectPlateauFromRecords(Object.values(uStorage(userId).get('trainingRecords', {}) || {}), Date.now());
    } catch {
        return null;
    }
}

/** detectPlateau 的純函式核心（換季稽核 scripts/audit_cycle_rotation.mjs 用模擬時間直接測） */
export function detectPlateauFromRecords(records = [], now = Date.now()) {
    try {
        const WINDOW = 28 * 86400000;
        const inWindow = (rec, from, to) => {
            const ts = rec?.timestamp ? new Date(rec.timestamp).getTime() : 0;
            return ts >= from && ts < to;
        };
        const recent = records.filter((r) => inWindow(r, now - WINDOW, now));
        const prev = records.filter((r) => inWindow(r, now - 2 * WINDOW, now - WINDOW));
        if (recent.length < 4 || prev.length < 4) return null; // 資料不足

        const totalVolume = (arr) => arr.reduce((s, r) => s + (r.volume || 0), 0);
        /* 跨健身房：機械／滑輪的重量各家不同，同一個動作在不同間要分開比
           （A 館腿推 120 kg、B 館腿推 90 kg 不是退步）；自由重量各家一樣，照動作名比。 */
        const MACHINE = /^(machine|cable|smith|plate[_-]?loaded)$/i;
        const keyOf = (rec, ex) => (MACHINE.test(String(ex.eq || '')) && rec.gym?.id ? `${ex.name}@${rec.gym.id}` : ex.name);
        const bestOf = (arr) => {
            const best = {};
            arr.forEach((rec) => (rec.exercises || []).forEach((ex) => {
                const k = keyOf(rec, ex);
                (ex.sets || []).forEach((st) => {
                    const est = epleyE1RM(st.weight, st.reps);
                    if (est && (!best[k] || est > best[k])) best[k] = est;
                });
            }));
            return best;
        };
        // 只比兩個窗口都有做的動作（同一間的同一台）—— 換了健身房、菜單被替換，
        // 不同動作的重量混在一起平均，會讓「換了一間比較輕的」看起來像退步
        const bPrev = bestOf(prev), bNow = bestOf(recent);
        const common = Object.keys(bNow).filter((k) => bPrev[k]);
        // 兩個窗口沒有共同動作（剛換部位重排／整份換掉）→ 比不出來，不能拿 0% 當「沒進步」
        if (!common.length) return null;
        const avg = (b) => (common.length ? common.reduce((a, k) => a + b[k], 0) / common.length : 0);

        const volPrev = totalVolume(prev);
        const volNow = totalVolume(recent);
        const e1Prev = avg(bPrev);
        const e1Now = avg(bNow);

        const volumeDeltaPct = volPrev > 0 ? Math.round(((volNow - volPrev) / volPrev) * 1000) / 10 : 0;
        const e1rmDeltaPct = e1Prev > 0 ? Math.round(((e1Now - e1Prev) / e1Prev) * 1000) / 10 : 0;

        // 平台判定：e1RM 與訓練量「雙雙」無實質進步（< +1.5%）
        const plateau = e1rmDeltaPct < 1.5 && volumeDeltaPct < 1.5;
        return {
            plateau,
            e1rmDeltaPct,
            volumeDeltaPct,
            detail: plateau
                ? `連續兩個訓練窗口 e1RM（${e1rmDeltaPct >= 0 ? '+' : ''}${e1rmDeltaPct}%）與訓練量（${volumeDeltaPct >= 0 ? '+' : ''}${volumeDeltaPct}%）皆未成長 — 建議重新設計計劃：更換動作模式或分化方式，給身體全新刺激。`
                : `e1RM ${e1rmDeltaPct >= 0 ? '+' : ''}${e1rmDeltaPct}%、訓練量 ${volumeDeltaPct >= 0 ? '+' : ''}${volumeDeltaPct}% — 仍在成長軌道上。`,
        };
    } catch {
        return null;
    }
}
