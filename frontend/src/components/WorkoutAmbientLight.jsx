import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

/**
 * WorkoutAmbientLight
 * ───────────────────────────────────────────────────────────────
 * A FUNCTIONAL ambient lighting layer for the workout session screen.
 * The colour and breathing rhythm encode the live training state, so the
 * light is informative — not just decoration:
 *
 *   state        colour            rhythm                  meaning
 *   ─────────────────────────────────────────────────────────────────────
 *   hrHigh       red  (#FF3B30)    fast urgent pulse        心率過高 → 降速
 *   resting      teal (#3FC8C0)    slow calm breathing      休息中 → 恢復
 *   paused       grey (dim)        almost still             已暫停
 *   justDone     green(#2E9E5B)    quick success bloom      完成一組
 *   active       coral(#F95C4B)    rhythm scales w/ progress 訓練中（越接近完成越快）
 *
 * Motion personality: Premium / Calm — sine-based ease-in-out breathing,
 * three layers (two auras + grain), nothing travels far (1/3 rule respected).
 * All values are derived from props, so the screen visibly "reacts" as the
 * user trains, rests, or pushes too hard.
 */
// 🎯 LOAD → 邊框光色（對應 WorkoutSessionViewMobile.getLoadZone 的分區）。
//   使用者要求：整個螢幕邊框依 load 發微光，反映當下身體狀態。
const loadBorderColor = (score) => {
    if (!score) return null;
    if (score >= 105) return '217,64,48';    // 過載區 ember
    if (score >= 90) return '249,92,75';     // 最佳區 coral
    if (score >= 70) return '90,122,58';     // 有效區 olive
    return '91,113,131';                     // 暖身區 slate
};

export default function WorkoutAmbientLight({
    isResting = false,
    isPaused = false,
    isHRTooHigh = false,
    justCompleted = false,
    progress = 0,          // 0..100 overall workout progress
    loadScore = 0,         // 最近一組的 LOAD 分數 → 驅動邊框光
}) {
    const mode = isHRTooHigh ? 'hrHigh'
        : justCompleted ? 'justDone'
        : isPaused ? 'paused'
        : isResting ? 'resting'
        : 'active';

    const cfg = useMemo(() => {
        const p = Math.max(0, Math.min(100, progress)) / 100;
        switch (mode) {
            case 'hrHigh':
                return { color: '232,72,58', topOpacity: 0.34, botColor: '232,72,58', botOpacity: 0.18, breathDur: 1.1, scale: [1, 1.12, 1], opacityPulse: [0.6, 1, 0.6] };
            case 'justDone':
                return { color: '52,168,98', topOpacity: 0.30, botColor: '52,168,98', botOpacity: 0.16, breathDur: 1.4, scale: [1, 1.16, 1], opacityPulse: [0.55, 0.95, 0.65] };
            case 'paused':
                return { color: '150,150,150', topOpacity: 0.10, botColor: '150,150,150', botOpacity: 0.06, breathDur: 8, scale: [1, 1.02, 1], opacityPulse: [0.6, 0.7, 0.6] };
            case 'resting':
                return { color: '70,196,188', topOpacity: 0.30, botColor: '70,196,188', botOpacity: 0.18, breathDur: 5.5, scale: [1, 1.07, 1], opacityPulse: [0.55, 0.9, 0.55] };
            case 'active':
            default:
                // active: the closer to finishing, the warmer/faster the heartbeat
                return {
                    color: '240,116,98',          // softer coral (Swiss: muted, not neon)
                    topOpacity: 0.26 + p * 0.10,
                    botColor: '197,168,124',      // warm sand for depth
                    botOpacity: 0.16 + p * 0.06,
                    breathDur: 4.6 - p * 1.6,     // 4.6s → 3.0s as progress rises
                    scale: [1, 1.05 + p * 0.04, 1],
                    opacityPulse: [0.62, 0.9, 0.62],
                };
        }
    }, [mode, progress]);

    const ease = [0.4, 0, 0.2, 1]; // gentle sine-like float

    // 邊框光：優先用 LOAD 分區色（反映身體負荷）；心率過高時強制紅色警示壓過。
    const borderRGB = isHRTooHigh ? '232,72,58' : loadBorderColor(loadScore);

    return (
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
            {/* Swiss-clean top light wash — a calm, intentional glow from above
                rather than a blurry blob. Gives the 極簡 "lit from the top" feel. */}
            <motion.div
                className="absolute inset-x-0 top-0 h-[55%]"
                style={{ background: `linear-gradient(180deg, rgba(${cfg.color},1) 0%, transparent 100%)` }}
                animate={{ opacity: cfg.opacityPulse.map((o) => o * cfg.topOpacity * 0.65) }}
                transition={{ duration: cfg.breathDur, repeat: Infinity, ease, repeatType: 'loop' }}
            />
            {/* Top-right primary aura — colour + breathing encode the state */}
            <motion.div
                className="absolute -top-[14%] -right-[18%] w-[82%] h-[82%] rounded-full"
                style={{ background: `radial-gradient(circle, rgba(${cfg.color},1) 0%, transparent 60%)`, filter: 'blur(52px)' }}
                animate={{ scale: cfg.scale, opacity: cfg.opacityPulse.map((o) => o * cfg.topOpacity) }}
                transition={{ duration: cfg.breathDur, repeat: Infinity, ease, repeatType: 'loop' }}
            />
            {/* Bottom-left depth aura — counter-breathes for life */}
            <motion.div
                className="absolute -bottom-[16%] -left-[14%] w-[66%] h-[66%] rounded-full"
                style={{ background: `radial-gradient(circle, rgba(${cfg.botColor},1) 0%, transparent 64%)`, filter: 'blur(60px)' }}
                animate={{ scale: cfg.scale.map((s) => 1 + (s - 1) * 0.7), opacity: cfg.opacityPulse.map((o) => o * cfg.botOpacity) }}
                transition={{ duration: cfg.breathDur * 1.25, repeat: Infinity, ease, repeatType: 'loop', delay: cfg.breathDur * 0.4 }}
            />
            {/* HR-high extra alarm sweep — only when overexerting */}
            {mode === 'hrHigh' && (
                <motion.div
                    className="absolute inset-0"
                    style={{ background: 'radial-gradient(circle at 50% 0%, rgba(249,59,48,0.18) 0%, transparent 45%)' }}
                    animate={{ opacity: [0.2, 0.6, 0.2] }}
                    transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
                />
            )}

            {/* 🎯 LOAD 邊框呼吸光 — 整個螢幕四邊依當下負荷發微光。
                inset box-shadow 從邊緣往內暈染，不擋內容；心率過高會壓成紅色。
                微微呼吸（不快、不刺眼），只是「感覺得到」的環境提示。 */}
            {borderRGB && (
                <motion.div
                    className="absolute inset-0"
                    style={{ borderRadius: 'inherit' }}
                    animate={{
                        boxShadow: [
                            `inset 0 0 22px 1px rgba(${borderRGB},0.10)`,
                            `inset 0 0 40px 3px rgba(${borderRGB},0.26)`,
                            `inset 0 0 22px 1px rgba(${borderRGB},0.10)`,
                        ],
                    }}
                    transition={{ duration: isHRTooHigh ? 1.1 : 4.2, repeat: Infinity, ease, repeatType: 'loop' }}
                />
            )}
        </div>
    );
}
