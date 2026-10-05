/**
 * runPlaceFeedback.js — 跑步回饋與換期（下一期）裡的「在哪裡跑」
 * ══════════════════════════════════════════════════════════════════════
 * 和重訓換季同一套想法（utils/seasonTransition × utils/gymMemory）：
 *
 *   · 下一期是「一份」課表，不是每個跑點各一份。
 *     課表照這一期最常跑的地方（主場）的條件排；偶爾去別的地方跑，不改課表。
 *
 *   · 不同地方的數字不能直接比，回饋要先把場地的差別拿掉：
 *       跑步機     → 皮帶速度各台不準、沒有風阻 —— 不拿來校準配速（完成度照算）
 *       爬升多的路 → 配速換算成平路等效再比；爬太多（每公里 > 25 m）就不拿來校準
 *     不然在山路跑一週，系統會以為你變慢了，下一週把配速全部放慢。
 *
 *   · 換期時只有「證據夠」才因為場地改課表：
 *       間歇一直沒做完、節奏跑卻做得到、而且主場不是操場
 *       → 下一期的速度課以節奏跑為主（說清楚為什麼）。
 *     沒有跑點紀錄 → 不猜，課表照原本的規則排。
 *
 * 純函式，node 驗證腳本直接 import。
 * ══════════════════════════════════════════════════════════════════════
 */

export const HILLY_M_PER_KM = 25;          // 每公里爬升超過這個 → 不拿來校準配速
/* 爬升換算平路：每爬 1 公尺約等於多跑 4 公尺平路。
   (Naismith 類規則約 8 公尺，但跑一圈回到起點，下坡會還回一部分；取一半，寧可少修正) */
export const CLIMB_FLAT_EQUIV_M = 4;

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const isRun = (b) => b && b.distance_km != null && b.type !== 'strength' && b.subtype !== 'strength';
const isDone = (b) => b?.status === 'completed';
const isTouched = (b) => ['completed', 'partial', 'skipped'].includes(b?.status);

/**
 * 一趟的配速換成「平路、戶外」等效；不能比的回 excluded（'indoor' | 'hilly'）
 * @returns {{ pace:number|null, excluded:string|null, adjusted:boolean }}
 */
export function flatEquivalentPace({ paceSec = null, distanceKm = null, durationMin = null, elevGainM = null, indoor = false } = {}) {
    if (indoor) return { pace: null, excluded: 'indoor', adjusted: false };
    const d = num(distanceKm);
    let pace = num(paceSec);
    if (!(pace > 0) && d > 0 && num(durationMin) > 0) pace = (durationMin * 60) / d;
    if (!(pace > 0)) return { pace: null, excluded: null, adjusted: false };
    const gain = num(elevGainM);
    if (!(gain > 0) || !(d > 0)) return { pace, excluded: null, adjusted: false };
    if (gain / d > HILLY_M_PER_KM) return { pace: null, excluded: 'hilly', adjusted: false };
    const flatKm = d + (gain * CLIMB_FLAT_EQUIV_M) / 1000;
    return { pace: Math.round((pace * d) / flatKm), excluded: null, adjusted: true };
}

/** 這一期在哪些地方跑（只看有跑點紀錄的完成／部分完成的課） */
export function cyclePlaceSummary(plan) {
    const byId = {};
    let known = 0, indoor = 0, total = 0;
    (plan?.weeks || []).forEach((w) => (w.bricks || []).forEach((b) => {
        if (!isRun(b) || !(b.status === 'completed' || b.status === 'partial')) return;
        total += 1;
        if (b.actual_indoor) { indoor += 1; return; }
        const id = b.actual_place_id;
        if (!id) return;
        known += 1;
        const p = (byId[id] = byId[id] || { id, name: b.actual_place_name || '這個跑點', kind: b.actual_place_kind || null, runs: 0, km: 0 });
        p.runs += 1;
        p.km = Math.round((p.km + (num(b.actual_distance_km) || 0)) * 10) / 10;
        if (b.actual_place_kind) p.kind = b.actual_place_kind;
    }));
    const places = Object.values(byId).sort((a, b) => b.runs - a.runs || b.km - a.km);
    // 主場：有一半以上（有紀錄的）都在那裡跑，才算得上「主場」
    const main = places[0] && places[0].runs >= Math.max(2, Math.ceil(known * 0.5)) ? places[0] : null;
    return { places, main, known, indoor, total };
}

/** 速度課（間歇／節奏）排了幾趟、做完幾趟 —— 只算已經過去的（有狀態的） */
export function qualityCompletion(plan) {
    const out = { interval: { planned: 0, done: 0 }, tempo: { planned: 0, done: 0 } };
    (plan?.weeks || []).forEach((w) => (w.bricks || []).forEach((b) => {
        if (!isRun(b) || !out[b.subtype] || !isTouched(b)) return;
        out[b.subtype].planned += 1;
        if (isDone(b)) out[b.subtype].done += 1;
    }));
    return out;
}

const KIND_ZH = { track: '操場', park: '公園', riverside: '河濱', road: '路跑' };

/**
 * 換期時要不要因為場地改課表。證據不夠回 null。
 * @returns {null | { qualityStyle:'tempo', main, reason:string, interval, tempo }}
 */
export function placeAdvice(plan) {
    const { main } = cyclePlaceSummary(plan);
    if (!main || !main.kind || main.kind === 'track') return null;
    const q = qualityCompletion(plan);
    const iRate = q.interval.planned ? q.interval.done / q.interval.planned : null;
    const tRate = q.tempo.planned ? q.tempo.done / q.tempo.planned : null;
    if (q.interval.planned < 3 || iRate >= 0.5) return null;          // 間歇做得到 → 不改
    if (tRate != null && tRate < 0.6) return null;                    // 節奏跑也做不到 → 不是場地問題，是量太重
    const where = `${main.name}${KIND_ZH[main.kind] ? `（${KIND_ZH[main.kind]}）` : ''}`;
    return {
        qualityStyle: 'tempo', main,
        interval: q.interval, tempo: q.tempo,
        reason: `這一期多在${where}跑，不是操場；間歇只做完 ${q.interval.done}／${q.interval.planned} 趟${q.tempo.planned ? `，節奏跑做完 ${q.tempo.done}／${q.tempo.planned} 趟` : ''}。下一期的速度課以節奏跑為主，在路上也能照配速跑。`,
    };
}

/** 依 placeAdvice 改生成好的課表：間歇改成同距離的節奏跑（配速照新課型重算） */
export function applyQualityStyle(plan, style, normalize) {
    if (style !== 'tempo' || !plan?.weeks || typeof normalize !== 'function') return plan;
    const base = num(plan?.meta?.baseline_pace_5k_sec);
    plan.weeks.forEach((w) => {
        w.bricks = (w.bricks || []).map((b) => (b?.subtype === 'interval' && !isTouched(b)
            ? { ...normalize({ ...b, subtype: 'tempo', type: 'speed' }, base), place_adapted_from: 'interval' }
            : b));
    });
    plan.meta = { ...(plan.meta || {}), quality_style: 'tempo' };
    return plan;
}

export default { flatEquivalentPace, cyclePlaceSummary, qualityCompletion, placeAdvice, applyQualityStyle };
