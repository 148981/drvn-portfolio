/**
 * memberProgression.js — 「減量永遠免費，自動加量才是會員」的唯一判斷
 * ══════════════════════════════════════════════════════════════════════
 * 重訓每週回饋、跑步週結算、換季，都從這裡問「這次調整能不能自動套用」。
 * 規則只有一條：
 *   · 調整方向是「減量／維持」→ 所有人都自動套用（安全，不能收費）
 *   · 調整方向是「加量」      → 會員自動套用；免費使用者看得到建議，但課表不動
 * 免費使用者永遠可以自己手動改課表，這裡只管「系統幫你改」這件事。
 */
import { isMember } from './membership';

/**
 * 重訓：每週回饋算出的強度等級。
 * @param {{ intensityLevel?: number, prevIntensityLevel?: number }} summary
 * @returns {{ locked: boolean }}
 */
export function gateStrengthProgression(summary, member = isMember()) {
    const next = Number(summary?.intensityLevel ?? 0);
    const prev = Number(summary?.prevIntensityLevel ?? 0);
    return { locked: !member && next > prev };
}

/**
 * 跑步：週結算的下週調整。加量的部分拿掉（倍率封頂 1、強度不上調），減量照常。
 * @returns {{ adjustments: object|null, locked: boolean }}
 */
export function gateRunAdjustments(adjustments, member = isMember()) {
    if (!adjustments) return { adjustments, locked: false };
    const m = Number(adjustments.next_week_mileage_multiplier);
    const shift = Number(adjustments.intensity_shift || 0);
    const increases = (Number.isFinite(m) && m > 1) || shift > 0;
    if (member || !increases) return { adjustments, locked: false };
    return {
        adjustments: {
            ...adjustments,
            next_week_mileage_multiplier: Number.isFinite(m) ? Math.min(1, m) : 1,
            intensity_shift: Math.min(0, shift),
        },
        locked: true,
    };
}

export default { gateStrengthProgression, gateRunAdjustments };
