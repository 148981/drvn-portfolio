/**
 * rpeHistoryReader.js — 真實歷史 RPE → 強度調整建議
 *
 * 將「圖二（每週評估）」的回饋從『純按鈕』升級為『資料驅動 + 可手動覆蓋』。
 *
 * ── 設計依據（real-world autoregulation，見檔末 Sources）─────────────────
 *   RPE↔RIR 標準錨點：
 *     RPE 6 ≈ 4 RIR，RPE 7 ≈ 3 RIR，RPE 8 ≈ 2 RIR，RPE 9 ≈ 1 RIR，RPE 10 ≈ 0 RIR
 *   週期化目標 RPE（沿用 ProgressiveTrainingSystem.WEEKLY_PARAMETERS）：
 *     W1 6–7 / W2 7–8 / W3 8–9 / W4 deload 5–6
 *   規則：
 *     實際平均 RPE 明顯「低於」該週目標下限 → 太輕鬆（建議 ↑ 強度）
 *     實際平均 RPE 明顯「高於」該週目標上限 → 太辛苦（建議 ↓ 強度）
 *     落在區間內                           → 剛好（維持）
 *
 * 資料來源優先序（自動降級）：
 *   1. 每組 set.rpe（1–10）── 最準，使用者在訓練中親自填寫
 *   2. record.effortScore / overall_score（0–120，RPE 加權）── 反推 RPE
 *   3. record.intensity（40–100%）── 兜底反推
 *
 * 輸出：給 WeekFeedbackModal 用的 { feeling, level, avgRPE, targetBand, dataPoints, ... }
 */

import { uStorage } from './userStorage';

// ─── 週期化目標 RPE 帶（與 WEEKLY_PARAMETERS 對齊）─────────────────────────
// week 用 1-based；超出 4 週的計劃以「最後一週視為 peak、其餘循環」處理。
const WEEK_TARGET_RPE = {
    1: { min: 6, max: 7, name: 'Base'   },
    2: { min: 7, max: 8, name: 'Build'  },
    3: { min: 8, max: 9, name: 'Peak'   },
    4: { min: 5, max: 6, name: 'Deload' },
};

// 偏離容忍：實際平均需偏離目標帶「至少這麼多」才觸發調整建議，避免雜訊。
const RPE_TOLERANCE = 0.5;

// effortScore(0–120) → RPE(1–10) 的反推。
// effortScore 由 (intensityRatio*0.7 + rpe/10*0.3)*100 得出，範圍可達 120。
// 經驗映射：~50→RPE6，~70→RPE7.5，~85→RPE8.5，~100→RPE9.5。線性夾擠。
function effortScoreToRPE(score) {
    if (!score || score <= 0) return null;
    // 50 → 6 ，105 → 10  線性
    const rpe = 6 + ((score - 50) / (105 - 50)) * 4;
    return clamp(rpe, 1, 10);
}

// intensity(40–100%) → RPE 兜底
function intensityToRPE(intensity) {
    if (!intensity || intensity <= 0) return null;
    // 60% → 6，100% → 10
    const rpe = 6 + ((intensity - 60) / (100 - 60)) * 4;
    return clamp(rpe, 1, 10);
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * 取得目標 RPE 帶。週數可超過 4，循環對應 1–4 的相位。
 * @param {number} weekNumber 1-based
 * @param {number} totalWeeks 計劃總週數（用來判定最後一週是否為 deload）
 */
export function getTargetRPEBand(weekNumber, totalWeeks = 4) {
    // 若計劃恰為 4 週標準週期，直接查表
    if (totalWeeks === 4 && WEEK_TARGET_RPE[weekNumber]) {
        return WEEK_TARGET_RPE[weekNumber];
    }
    // 其他長度：最後一週當 deload，其餘線性遞增 6→9
    if (weekNumber >= totalWeeks && totalWeeks >= 2) {
        return WEEK_TARGET_RPE[4]; // deload
    }
    const denom = Math.max(1, totalWeeks - 2); // 留最後一週給 deload
    const ratio = (weekNumber - 1) / denom;    // 0…1
    const center = 6.5 + ratio * 2;            // 6.5 → 8.5
    return { min: Math.round(center - 0.5), max: Math.round(center + 0.5), name: `W${weekNumber}` };
}

/**
 * 從單筆 record 萃取「該次訓練的平均 RPE」（自動降級）。
 * @returns {number|null}
 */
function extractRecordRPE(record) {
    // 1) 每組 set.rpe
    const setRPEs = [];
    (record.exercises || []).forEach(ex => {
        const sets = ex.detailedSets || ex.sets || [];
        if (Array.isArray(sets)) {
            sets.forEach(s => {
                if (s && typeof s === 'object') {
                    const r = parseFloat(s.rpe);
                    if (r > 0) setRPEs.push(clamp(r, 1, 10));
                }
            });
        }
    });
    if (setRPEs.length > 0) {
        return { rpe: avg(setRPEs), source: 'set_rpe', samples: setRPEs.length };
    }

    // 2) effortScore / overall_score
    const eff = record.effortScore || record.overall_score;
    const fromEff = effortScoreToRPE(eff);
    if (fromEff !== null) return { rpe: fromEff, source: 'effort_score', samples: 1 };

    // 3) intensity
    const fromInt = intensityToRPE(record.intensity);
    if (fromInt !== null) return { rpe: fromInt, source: 'intensity', samples: 1 };

    return null;
}

const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;

/**
 * 讀取「指定計劃週」內所有真實訓練的平均 RPE。
 *
 * 用 plan 週的日期範圍來篩 trainingRecords。若 plan 沒有日期，
 * 退而用 completed_workouts_{userId}_week{N} 的數量 + 最近 N 筆紀錄近似。
 *
 * @param {string} userId
 * @param {number} weekNumber  1-based
 * @param {object} plan        currentPlan（含 weeks，可能含 startDate）
 * @returns {{ avgRPE:number|null, dataPoints:number, source:string, perRecord:Array }}
 */
export function getWeekRealRPE(userId, weekNumber, plan) {
    try {
        const records = Object.values(uStorage(userId).get('trainingRecords', {}));
        if (!records.length) return { avgRPE: null, dataPoints: 0, source: 'none', perRecord: [] };

        // 嘗試用日期範圍
        let windowRecords = null;
        const startStr = plan?.startDate || plan?.start_date || plan?.created_at;
        if (startStr) {
            const start = new Date(startStr);
            const wkStart = new Date(start); wkStart.setDate(start.getDate() + (weekNumber - 1) * 7);
            const wkEnd = new Date(wkStart); wkEnd.setDate(wkStart.getDate() + 7);
            windowRecords = records.filter(r => {
                const d = new Date(r.date || r.timestamp);
                return d >= wkStart && d < wkEnd;
            });
        }

        // 有起始日、這一週就是沒練 → 沒有資料。
        // ⚠️ 以前這裡會「退路抓最近 N 筆」，於是沒練的那一週被填上別週（甚至上一季）的 RPE，
        //    季末的「平均 RPE 8、恢復不夠」可能一半是借來的數字。
        if (startStr && windowRecords && windowRecords.length === 0) {
            return { avgRPE: null, dataPoints: 0, source: 'none', perRecord: [] };
        }
        // 退路（只給沒有起始日的舊計劃）：用「本週應完成天數」抓最近 N 筆
        if (!windowRecords || windowRecords.length === 0) {
            const completedKey = `completed_workouts_${userId}_week${weekNumber}`;
            let n = 0;
            try { n = (JSON.parse(localStorage.getItem(completedKey) || '[]')).length; } catch { n = 0; }
            if (n === 0) n = plan?.weeks?.[weekNumber - 1]?.days?.filter(d => d.exercises?.length)?.length || 3;
            windowRecords = records
                .sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date))
                .slice(0, n);
        }

        const perRecord = [];
        windowRecords.forEach(r => {
            const ext = extractRecordRPE(r);
            if (ext) perRecord.push({ date: r.date || r.timestamp, ...ext });
        });

        if (perRecord.length === 0) return { avgRPE: null, dataPoints: 0, source: 'none', perRecord: [] };

        const avgRPE = +avg(perRecord.map(p => p.rpe)).toFixed(1);
        // 主要來源 = 出現最多次的 source
        const srcCount = {};
        perRecord.forEach(p => { srcCount[p.source] = (srcCount[p.source] || 0) + 1; });
        const source = Object.entries(srcCount).sort((a, b) => b[1] - a[1])[0][0];

        return { avgRPE, dataPoints: perRecord.length, source, perRecord };
    } catch (e) {
        console.error('[rpeHistoryReader] getWeekRealRPE error', e);
        return { avgRPE: null, dataPoints: 0, source: 'error', perRecord: [] };
    }
}

/**
 * 核心：把真實平均 RPE 對照週期化目標帶，產出建議。
 *
 * @returns {{
 *   feeling: 'too_easy'|'just_right'|'too_hard',
 *   level: number,           // 建議的絕對強度等級 (-3…+3)，相對 currentLevel ±1~2
 *   avgRPE: number|null,
 *   targetBand: {min,max,name},
 *   deviation: number,       // 正=偏難，負=偏輕
 *   dataPoints: number,
 *   source: string,
 *   confident: boolean,      // 是否有足夠真實資料（>=2 筆且來自 set_rpe/effort）
 *   reason: string,          // 給 UI 顯示的人話
 * }}
 */
export function recommendFromRPE(userId, weekNumber, plan, currentLevel = 0) {
    const totalWeeks = plan?.weeks?.length || 4;
    const targetBand = getTargetRPEBand(weekNumber, totalWeeks);
    const { avgRPE, dataPoints, source } = getWeekRealRPE(userId, weekNumber, plan);

    // 沒有真實資料 → 不預選，交給使用者自己選
    if (avgRPE === null) {
        return {
            feeling: 'just_right',
            level: currentLevel,
            avgRPE: null, targetBand, deviation: 0,
            dataPoints: 0, source: 'none', confident: false,
            reason: '尚無足夠訓練紀錄，請依體感選擇。',
        };
    }

    const mid = (targetBand.min + targetBand.max) / 2;
    let feeling, deviation, stepHint;

    // 大幅偏離門檻：偏離目標帶 ≥1.0 分視為「明顯」，跳 2 級；否則 1 級。
    // （RPE 上限為 10，對 8-9 的高週目標而言，>=10 已接近力竭，1.0 即足以判定減量）
    const BIG_JUMP = 1.0;
    if (avgRPE < targetBand.min - RPE_TOLERANCE) {
        feeling = 'too_easy';
        deviation = +(avgRPE - mid).toFixed(1); // 負
        // 偏離越大、升越多級（最多 +2）
        stepHint = (targetBand.min - avgRPE) >= BIG_JUMP ? 2 : 1;
    } else if (avgRPE > targetBand.max + RPE_TOLERANCE) {
        feeling = 'too_hard';
        deviation = +(avgRPE - mid).toFixed(1); // 正
        stepHint = (avgRPE - targetBand.max) >= BIG_JUMP ? -2 : -1;
    } else {
        feeling = 'just_right';
        deviation = +(avgRPE - mid).toFixed(1);
        stepHint = 0;
    }

    const level = clamp(currentLevel + stepHint, -3, 3);
    const confident = dataPoints >= 2 && (source === 'set_rpe' || source === 'effort_score');

    const rir = Math.max(0, Math.round(10 - avgRPE));
    let reason;
    if (feeling === 'too_easy') {
        reason = `本週平均 RPE ${avgRPE}（保留約 ${rir} 下），低於 ${targetBand.name} 目標 ${targetBand.min}-${targetBand.max}，身體仍有餘力 → 建議提升強度。`;
    } else if (feeling === 'too_hard') {
        reason = `本週平均 RPE ${avgRPE}（保留約 ${rir} 下），高於 ${targetBand.name} 目標 ${targetBand.min}-${targetBand.max}，接近力竭 → 建議降低強度確保恢復。`;
    } else {
        reason = `本週平均 RPE ${avgRPE}（保留約 ${rir} 下），正落在 ${targetBand.name} 目標 ${targetBand.min}-${targetBand.max} 內 → 維持當前節奏。`;
    }

    return { feeling, level, avgRPE, targetBand, deviation, dataPoints, source, confident, reason };
}

/**
 * 給「圖一（第四週/週期總結）」用：彙整整個週期的 RPE 趨勢。
 * @returns {{ weekly:Array<{week,avgRPE,target,status}>, cycleAvgRPE:number|null, trend:'rising'|'falling'|'stable'|null }}
 */
export function getCycleRPESummary(userId, plan) {
    const totalWeeks = plan?.weeks?.length || 4;
    const weekly = [];
    for (let w = 1; w <= totalWeeks; w++) {
        const band = getTargetRPEBand(w, totalWeeks);
        const { avgRPE, dataPoints } = getWeekRealRPE(userId, w, plan);
        let status = 'no_data';
        if (avgRPE !== null) {
            if (avgRPE < band.min - RPE_TOLERANCE) status = 'under';
            else if (avgRPE > band.max + RPE_TOLERANCE) status = 'over';
            else status = 'on_target';
        }
        weekly.push({ week: w, avgRPE, target: band, status, dataPoints });
    }
    const withData = weekly.filter(x => x.avgRPE !== null);
    const cycleAvgRPE = withData.length ? +avg(withData.map(x => x.avgRPE)).toFixed(1) : null;

    let trend = null;
    if (withData.length >= 2) {
        const first = withData[0].avgRPE, last = withData[withData.length - 1].avgRPE;
        trend = last - first > 0.4 ? 'rising' : last - first < -0.4 ? 'falling' : 'stable';
    }
    return { weekly, cycleAvgRPE, trend };
}

/* ───────────────────────────────────────────────────────────────────────────
 * Sources（real-world autoregulation 依據）：
 *  - Barbell Medicine — Autoregulation & RPE: https://www.barbellmedicine.com/blog/autoregulation-and-rpe-part-i/
 *  - RippedBody — Guide to RPE & RIR: https://rippedbody.com/rpe/
 *  - SET FOR SET — Autoregulation tools: https://www.setforset.com/blogs/news/autoregulation-tools-for-strength-training
 *  RPE↔RIR：RPE6≈4RIR, 7≈3, 8≈2, 9≈1, 10≈0；肥大 1-3 RIR、肌力 1-2 RIR。
 * ─────────────────────────────────────────────────────────────────────────── */
