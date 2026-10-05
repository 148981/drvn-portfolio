/**
 * 💯 rpeMapping — Rate of Perceived Exertion (體感量表) 1-10
 *
 * 設計哲學（NRC inspired）：
 *   「夏天的 6 分速和冬天的 6 分速對心臟的負擔完全不同。」
 *   用體感取代絕對配速，避免跑者因天氣熱或當天狀態差達不到 pace 而挫敗。
 *
 * 三個入口（依資料可得性自動降級）：
 *   1. 心率 + HR Zones → heartRateToRPE（最準）
 *   2. 配速 + baseline 5K pace → paceToRPE（次準）
 *   3. step 設定的 rpeBand → 直接使用（兜底）
 *
 * RPE 帶 (Band) 對應 NRC 哲學：
 *   1-2  ── REST          — 走路或站著
 *   3-4  ── RECOVERY      — 「能輕鬆用完整句子聊天」
 *   5-6  ── EASY          — 「能說短句、有點微喘」
 *   7-8  ── 5K/10K PACE   — 「微喘、無法講完整句子的比賽配速」
 *   9    ── MILE PACE     — 「幾乎全力衝刺的極限配速」
 *   10   ── ALL-OUT       — 「絕對極限、只能維持數十秒」
 */

// === RPE 帶常數（外部測試 / UI 顯示用） ===
export const RPE_BANDS = {
    REST:        { min: 1, max: 2, label: 'REST',     color: '#A5C4FF', tone: '走路或靜止' },
    RECOVERY:    { min: 3, max: 4, label: 'RECOVERY', color: '#7BD3A5', tone: '輕鬆聊天' },
    EASY:        { min: 5, max: 6, label: 'EASY',     color: '#D8F382', tone: '微喘可短語' },
    TEMPO:       { min: 7, max: 8, label: 'TEMPO',    color: '#FF99DC', tone: '比賽配速' },
    MILE:        { min: 9, max: 9, label: 'MILE',     color: '#F95C4B', tone: '極限衝刺' },
    ALL_OUT:     { min: 10, max: 10, label: 'ALL-OUT', color: '#EB4213', tone: '只能撐數十秒' },
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * 心率 → RPE
 * 用 HR Zone 1-5 作為錨點，線性內插出 1-10
 *
 * @param {number} hr — 即時心率
 * @param {object} hrZones — { zone1: {min,max}, zone2: ..., zone5: ... }（5 個 zone）
 * @returns {number|null} 1-10 整數，無資料回 null
 */
export function heartRateToRPE(hr, hrZones) {
    if (!hr || hr <= 0 || !hrZones) return null;

    // Map zone1..zone5 → RPE 中位值 [2, 4, 6, 8, 10]
    // 在 zone 內按 (hr - zoneMin) / (zoneMax - zoneMin) 內插
    const zoneOrder = ['zone1', 'zone2', 'zone3', 'zone4', 'zone5'];
    const rpeAnchor = [2, 4, 6, 8, 10];

    for (let i = 0; i < zoneOrder.length; i++) {
        const z = hrZones[zoneOrder[i]];
        if (!z) continue;
        const min = z.min ?? 0;
        const max = z.max ?? 220;
        if (hr <= max) {
            const ratio = (hr - min) / Math.max(1, max - min);
            const prevRPE = i === 0 ? 1 : rpeAnchor[i - 1];
            const curRPE = rpeAnchor[i];
            const rpe = prevRPE + (curRPE - prevRPE) * clamp(ratio, 0, 1);
            return Math.round(clamp(rpe, 1, 10));
        }
    }
    return 10; // 超過 zone5 上限
}

/**
 * 配速 → RPE
 * 用 baseline 5K best 作為錨點（5K pace ≈ RPE 8）
 * 線性外插：跑得越快 RPE 越高，跑得越慢 RPE 越低
 *
 * @param {number} actualPaceSec — 當前配速（秒/公里）
 * @param {number} baselinePace5K — 使用者 5K best pace（秒/公里）
 * @returns {number|null}
 */
export function paceToRPE(actualPaceSec, baselinePace5K) {
    if (!actualPaceSec || actualPaceSec <= 0) return null;
    if (!baselinePace5K || baselinePace5K <= 0) {
        // 沒 baseline → 用粗略絕對對照（適合一般成人）
        if (actualPaceSec > 600) return 3;   // > 10 min/km
        if (actualPaceSec > 510) return 4;
        if (actualPaceSec > 450) return 5;
        if (actualPaceSec > 400) return 6;
        if (actualPaceSec > 360) return 7;
        if (actualPaceSec > 320) return 8;
        if (actualPaceSec > 280) return 9;
        return 10;
    }
    // 有 baseline：用 ratio 計算
    //   actual = baseline → RPE 8（5K pace）
    //   actual = baseline * 1.3 → RPE 5（Easy）
    //   actual = baseline * 1.5 → RPE 3（Recovery）
    //   actual = baseline * 0.92 → RPE 9（Mile）
    //   actual = baseline * 0.85 → RPE 10（All-out）
    const ratio = actualPaceSec / baselinePace5K;
    let rpe;
    if (ratio >= 1.5) rpe = 3;
    else if (ratio >= 1.3) rpe = 3 + (1.5 - ratio) / (1.5 - 1.3) * 2;   // 3-5
    else if (ratio >= 1.1) rpe = 5 + (1.3 - ratio) / (1.3 - 1.1) * 2;   // 5-7
    else if (ratio >= 1.0) rpe = 7 + (1.1 - ratio) / (1.1 - 1.0) * 1;   // 7-8
    else if (ratio >= 0.92) rpe = 8 + (1.0 - ratio) / (1.0 - 0.92) * 1; // 8-9
    else if (ratio >= 0.85) rpe = 9 + (0.92 - ratio) / (0.92 - 0.85) * 1; // 9-10
    else rpe = 10;
    return Math.round(clamp(rpe, 1, 10));
}

/**
 * RPE → 目標配速帶（給 plan builder 用，把 RPE band 換成 pace 顯示）
 *
 * @param {{min:number, max:number}} rpeBand
 * @param {number} baselinePace5K
 * @returns {{minPace:number, maxPace:number}|null}
 */
export function rpeToTargetPaceBand(rpeBand, baselinePace5K) {
    if (!rpeBand || !baselinePace5K) return null;
    // 反向查表 — 與 paceToRPE 對稱
    const rpeToRatio = (r) => {
        if (r <= 3) return 1.5;
        if (r <= 5) return 1.5 - (r - 3) / 2 * 0.2;        // 1.5 → 1.3
        if (r <= 7) return 1.3 - (r - 5) / 2 * 0.2;        // 1.3 → 1.1
        if (r <= 8) return 1.1 - (r - 7) * 0.1;            // 1.1 → 1.0
        if (r <= 9) return 1.0 - (r - 8) * 0.08;           // 1.0 → 0.92
        return 0.92 - (r - 9) * 0.07;                       // 0.92 → 0.85
    };
    // 注意 RPE 越高 pace 越低（跑越快），所以 max RPE 對應 min pace
    const minPace = Math.round(baselinePace5K * rpeToRatio(rpeBand.max));
    const maxPace = Math.round(baselinePace5K * rpeToRatio(rpeBand.min));
    return { minPace, maxPace };
}

/**
 * 把單一 RPE 數值對到 band label（給 UI 顯示用）
 */
export function rpeToBandLabel(rpe) {
    if (rpe == null) return null;
    const r = clamp(rpe, 1, 10);
    for (const key of Object.keys(RPE_BANDS)) {
        const b = RPE_BANDS[key];
        if (r >= b.min && r <= b.max) return b;
    }
    return null;
}

/**
 * 統一入口：根據可得資料計算當前 RPE
 *   優先順序：HR → pace → step.rpeBand 中位值（兜底）
 *
 * @param {object} ctx
 * @param {number} ctx.heartRate
 * @param {object} ctx.hrZones
 * @param {number} ctx.currentPace
 * @param {number} ctx.baselinePace5K
 * @param {{min,max}} ctx.fallbackRpeBand
 * @returns {{rpe:number|null, source:'hr'|'pace'|'fallback'|'none'}}
 */
export function resolveCurrentRPE({ heartRate, hrZones, currentPace, baselinePace5K, fallbackRpeBand }) {
    const hrRpe = heartRateToRPE(heartRate, hrZones);
    if (hrRpe != null) return { rpe: hrRpe, source: 'hr' };
    const paceRpe = paceToRPE(currentPace, baselinePace5K);
    if (paceRpe != null) return { rpe: paceRpe, source: 'pace' };
    if (fallbackRpeBand) {
        const mid = Math.round((fallbackRpeBand.min + fallbackRpeBand.max) / 2);
        return { rpe: mid, source: 'fallback' };
    }
    return { rpe: null, source: 'none' };
}

/**
 * 判定當前 RPE 與目標 band 的關係（給 Aura Orb 用，取代「pace diff > 15s 才警示」）
 *
 * @returns {'in_band'|'too_easy'|'too_hard'|'unknown'}
 */
export function compareRPEtoBand(currentRpe, targetBand) {
    if (currentRpe == null || !targetBand) return 'unknown';
    if (currentRpe < targetBand.min) return 'too_easy';
    if (currentRpe > targetBand.max) return 'too_hard';
    return 'in_band';
}

/**
 * 從 step.name 推論 RPE band（v1 keyword 兜底）
 *   讓我們不用一次改 13 個 TRAINING_THEMES difficulty 配置。
 *   TODO(v2): 改用 step.rpeBand 顯式欄位，廢棄此函式。
 *
 * @param {object} step — { name, targetPace }
 * @returns {{min:number, max:number}}
 */
export function inferRpeBandFromStep(step) {
    if (!step) return { min: 5, max: 6 };
    const name = String(step.name || '').toLowerCase();

    // 高強度：全力 / 極限 / 衝刺 → MILE 或 ALL-OUT
    if (/極限|all.?out/i.test(name)) return { min: 10, max: 10 };
    if (/全力|衝刺|sprint|無氧/i.test(name)) return { min: 9, max: 10 };
    // 中高強度：加速 / Tempo → TEMPO
    if (/加速|tempo|threshold|race/i.test(name)) return { min: 7, max: 8 };
    // 中強度：巡航 / 穩定 → EASY-TEMPO
    if (/巡航|穩定|cruise|steady|aerobic/i.test(name)) return { min: 6, max: 7 };
    // 啟動 / 漸進 → EASY
    if (/啟動|漸進|build|pickup/i.test(name)) return { min: 5, max: 7 };
    // 暖身 / 緩和 / 恢復 / 冷卻 → RECOVERY
    if (/暖身|緩和|恢復|冷卻|warm|cool|recover|easy/i.test(name)) return { min: 3, max: 4 };
    // 快走 / 慢走 → REST-RECOVERY
    if (/快走|慢走|步行|walk/i.test(name)) return { min: 2, max: 3 };

    // 兜底：pace 數值判定
    const p = step.targetPace;
    if (p && p > 0) {
        if (p < 280) return { min: 10, max: 10 };
        if (p < 320) return { min: 9, max: 10 };
        if (p < 360) return { min: 7, max: 8 };
        if (p < 440) return { min: 6, max: 7 };
        if (p < 540) return { min: 4, max: 5 };
        return { min: 3, max: 4 };
    }
    return { min: 5, max: 6 };
}

/**
 * 取得 step 的 RPE band — 優先用 step.rpeBand 顯式欄位（v2），fallback 到推論（v1）
 */
export function getStepRpeBand(step) {
    if (step && step.rpeBand && typeof step.rpeBand.min === 'number') return step.rpeBand;
    return inferRpeBandFromStep(step);
}
