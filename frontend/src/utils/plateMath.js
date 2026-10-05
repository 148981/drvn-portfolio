// utils/plateMath.js
// 槓鈴配重計算：給定目標總重 + 空槓重，算出「每邊」該放哪些槓片。
// 純函式、無副作用，方便單元測試。

// 標準公斤健身房單邊可用片組（大到小，貪婪法用）
export const STANDARD_KG_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

// 可切換的空槓重量選項
export const BAR_OPTIONS = [
    { kg: 20, label: '標準槓 20kg' },
    { kg: 15, label: '女槓 15kg' },
    { kg: 10, label: 'EZ / 短槓 10kg' },
];

/**
 * 計算單邊槓片組合。
 *
 * @param {number} totalWeight 目標總重量（含槓）
 * @param {number} barWeight   空槓重量（預設 20）
 * @param {number[]} plates    單邊可用片組（預設標準公斤）
 * @returns {{
 *   ok: boolean,                 // 是否能用現有片組精確湊出
 *   barWeight: number,
 *   perSide: {plate:number,count:number}[], // 每邊各片數量（大到小）
 *   perSideWeight: number,       // 每邊實際總重
 *   achievedTotal: number,       // 實際達成的總重（barWeight + perSideWeight*2）
 *   diff: number,                // 達成總重 - 目標總重（0=精準；<0=湊不滿）
 *   reason?: string              // 無法計算時的說明
 * }}
 */
export function calcPlates(totalWeight, barWeight = 20, plates = STANDARD_KG_PLATES) {
    const target = Number(totalWeight);

    // 邊界：非數字
    if (!Number.isFinite(target)) {
        return emptyResult(barWeight, '請輸入有效重量');
    }
    // 邊界：目標小於空槓 → 連空槓都比這重
    if (target < barWeight) {
        return {
            ok: false,
            barWeight,
            perSide: [],
            perSideWeight: 0,
            achievedTotal: barWeight,
            diff: barWeight - target,
            reason: `目標比空槓（${barWeight}kg）還輕`,
        };
    }
    // 剛好等於空槓 → 不放片
    if (target === barWeight) {
        return {
            ok: true,
            barWeight,
            perSide: [],
            perSideWeight: 0,
            achievedTotal: barWeight,
            diff: 0,
        };
    }

    // 每邊需要的重量
    let perSideTarget = (target - barWeight) / 2;

    // 貪婪法：由大到小塞片
    const sorted = [...plates].sort((a, b) => b - a);
    const perSide = [];
    let remaining = round2(perSideTarget);

    for (const p of sorted) {
        if (remaining <= 0) break;
        const count = Math.floor(round2(remaining) / p);
        if (count > 0) {
            perSide.push({ plate: p, count });
            remaining = round2(remaining - p * count);
        }
    }

    const perSideWeight = round2(perSideTarget - remaining);
    const achievedTotal = round2(barWeight + perSideWeight * 2);
    const diff = round2(achievedTotal - target);

    return {
        ok: Math.abs(diff) < 0.001,
        barWeight,
        perSide,
        perSideWeight,
        achievedTotal,
        diff,
        // 湊不出精確值時，告訴使用者最接近能做到的總重
        reason: Math.abs(diff) < 0.001
            ? undefined
            : `現有槓片最接近 ${achievedTotal}kg（差 ${Math.abs(diff)}kg）`,
    };
}

function emptyResult(barWeight, reason) {
    return {
        ok: false,
        barWeight,
        perSide: [],
        perSideWeight: 0,
        achievedTotal: barWeight,
        diff: 0,
        reason,
    };
}

// 浮點數修正到小數兩位（避免 31.25 - 25 = 6.249999... 之類誤差）
function round2(n) {
    return Math.round(n * 100) / 100;
}
