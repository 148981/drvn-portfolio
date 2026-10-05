import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

/**
 * 🏃 RunAmbientGlow — 跑步介面四周動態氛圍燈
 *
 * 支援兩種模式：
 *   1. mode="zone"  ── 自由跑步：根據心率 Zone 顯示對應 Zone 配色
 *      props: zoneId (1-5) | zoneColor (override)
 *
 *   2. mode="pace"  ── 計劃跑步：根據實際配速 vs 目標配速判定
 *        currentPace > targetPace * 1.15  → coral  (太慢)
 *        currentPace < targetPace * 0.85  → blue   (太快)
 *        otherwise (in ±15% window)        → green  (剛好)
 *      props: currentPace, targetPace (both in seconds per km)
 *
 * 🌬 呼吸節奏 (Breathing Tempo) — v2 新增：
 *   tempo="slow"   暖身 / 緩和 / 恢復 / 冷卻 → 慢速呼吸引導放鬆呼吸
 *   tempo="normal" 巡航 / 一般 → 既有預設節奏
 *   tempo="fast"   衝刺 / 加速 / 全力 / 極限 → 急促脈動帶動步頻
 *
 * 🔻 能量流失警示 (Drain Warning) — v2 新增：
 *   drainWarning=true 時，從螢幕底部往上湧出 coral 漸層，
 *   潛意識訊號「能量正在流失」，配速 too_slow 時啟用。
 *
 * 安全特性：
 *   - 不會搶觸控（pointer-events: none）
 *   - 顏色變化平滑 transition，不會閃爍
 *   - 沒有資料時自動隱藏（不渲染干擾色）
 *   - tempo / drainWarning 預設值維持既有行為（向後相容）
 */

// 心率 Zone 配色 — 對應 CardioTrackerMobile.jsx 的 ZONES 定義
const ZONE_COLORS = {
    1: '#FDD835', // WARM UP   — 黃色
    2: '#8BC34A', // FAT BURN  — 鮮綠
    3: '#FF9800', // AEROBIC   — 活力橘
    4: '#F06292', // ANAEROBIC — 亮粉
    5: '#5C6BC0', // EXTREME   — 深藍紫
};

// 計劃配速判定色
const PACE_COLORS = {
    slow: '#F95C4B',   // Coral — 太慢
    fast: '#3B82F6',   // Blue  — 太快
    onTarget: '#5A7A3A', // Green — 剛好（±15%）
};

const PACE_TOLERANCE = 0.15; // ±15%

// 🌬 呼吸節奏速率表 — 對應 Framer Motion 的 duration（秒）
// 三層動畫（邊框 / 四角 / 上下光條）各自的呼吸週期，數字越小越急促
const TEMPO_DURATIONS = {
    slow:   { edge: 4.5,  corner: 5.5, bar: 3.8 }, // 暖身/恢復 — 4-6 秒緩慢呼吸引導放鬆
    normal: { edge: 2.6,  corner: 3.4, bar: 2.2 }, // 巡航 — 既有預設
    fast:   { edge: 0.55, corner: 0.7, bar: 0.4 }, // 衝刺 — 0.4-0.7 秒急促脈動，視覺壓迫感帶動步頻
};

// 🔻 能量流失警示色（drainWarning=true 時用）
const DRAIN_COLOR = '#F95C4B'; // Coral — 與 PACE_COLORS.slow 同步

/**
 * 計算氛圍燈顏色
 */
function resolveGlowColor({ mode, zoneId, zoneColor, currentPace, targetPace }) {
    if (mode === 'pace') {
        if (!currentPace || !targetPace || currentPace <= 0 || targetPace <= 0) {
            return null; // 沒有有效資料 → 不顯示
        }
        const upper = targetPace * (1 + PACE_TOLERANCE);
        const lower = targetPace * (1 - PACE_TOLERANCE);
        if (currentPace > upper) return PACE_COLORS.slow;   // 配速數值大 → 慢 → coral
        if (currentPace < lower) return PACE_COLORS.fast;   // 配速數值小 → 快 → blue
        return PACE_COLORS.onTarget;                         // 在容差內 → green
    }
    // mode === 'zone'
    if (zoneColor) return zoneColor;
    if (zoneId && ZONE_COLORS[zoneId]) return ZONE_COLORS[zoneId];
    return null;
}

const RunAmbientGlow = ({
    mode = 'zone',           // 'zone' | 'pace'
    zoneId = null,           // 1-5
    zoneColor = null,        // optional override
    currentPace = null,      // seconds per km
    targetPace = null,       // seconds per km
    active = true,           // 跑步是否進行中
    intensity = 1,           // 0-1 — 整體強度
    tempo = 'normal',        // 🌬 'slow' | 'normal' | 'fast' — 呼吸節奏
    drainWarning = false,    // 🔻 true → 底部上湧 coral 漸層警示
}) => {
    const glowColor = useMemo(
        () => resolveGlowColor({ mode, zoneId, zoneColor, currentPace, targetPace }),
        [mode, zoneId, zoneColor, currentPace, targetPace]
    );

    // 🌬 解析呼吸節奏 — 不認得的 tempo 一律 fallback 到 normal，避免顯示崩潰
    const tempoDur = TEMPO_DURATIONS[tempo] || TEMPO_DURATIONS.normal;

    // 早退條件：drainWarning 可以在沒有 glowColor 時也獨立渲染（例：自由跑配速資料缺失但教練仍想警告）
    if (!active || (!glowColor && !drainWarning)) return null;

    // ✨ 微光版：只在邊緣留淡淡光帶 + 四角極輕光暈，不會壓住地圖數據
    //    整體不透明度上限 ~ 0.28，地圖與底部 panel 可清晰閱讀
    return (
        <div
            aria-hidden="true"
            style={{
                position: 'fixed',
                inset: 0,
                pointerEvents: 'none',
                zIndex: 35, // 蓋在地圖 (z-30) 之上、UI (z-40+) 之下
                overflow: 'hidden',
                mixBlendMode: 'normal',
            }}
        >
            {/* 🌈 主氛圍燈（三層）— 僅當有有效 glowColor 才渲染，避免 drainWarning 獨立模式破圖 */}
            {glowColor && (
                <>
                    {/* 微光邊框（內陰影）— 增強深度與擴散 */}
                    <motion.div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            boxShadow: `inset 0 0 54px 6px ${glowColor}`,
                            transition: 'box-shadow 600ms ease-out',
                        }}
                        animate={{ opacity: [0.35 * intensity, 0.58 * intensity, 0.35 * intensity] }}
                        transition={{ duration: tempoDur.edge, repeat: Infinity, ease: 'easeInOut' }}
                    />

                    {/* 四角光暈 — 增強透明度與覆蓋半徑 */}
                    <motion.div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            background: `
                                radial-gradient(circle at 0% 0%, ${glowColor}77 0%, transparent 22%),
                                radial-gradient(circle at 100% 0%, ${glowColor}77 0%, transparent 22%),
                                radial-gradient(circle at 0% 100%, ${glowColor}77 0%, transparent 22%),
                                radial-gradient(circle at 100% 100%, ${glowColor}77 0%, transparent 22%)
                            `,
                            transition: 'background 600ms ease-out',
                        }}
                        animate={{ opacity: [0.45 * intensity, 0.72 * intensity, 0.45 * intensity] }}
                        transition={{ duration: tempoDur.corner, repeat: Infinity, ease: 'easeInOut' }}
                    />

                    {/* 頂部 / 底部光條（更厚且帶有更強暈染模糊） */}
                    <motion.div
                        style={{
                            position: 'absolute',
                            top: 0, left: 0, right: 0, height: 3.5,
                            background: glowColor,
                            filter: 'blur(1.2px)',
                            transition: 'background 600ms ease-out',
                        }}
                        animate={{ opacity: [0.55 * intensity, 0.85 * intensity, 0.55 * intensity] }}
                        transition={{ duration: tempoDur.bar, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <motion.div
                        style={{
                            position: 'absolute',
                            bottom: 0, left: 0, right: 0, height: 3.5,
                            background: glowColor,
                            filter: 'blur(1.2px)',
                            transition: 'background 600ms ease-out',
                        }}
                        animate={{ opacity: [0.55 * intensity, 0.85 * intensity, 0.55 * intensity] }}
                        transition={{ duration: tempoDur.bar, repeat: Infinity, ease: 'easeInOut', delay: tempoDur.bar / 2 }}
                    />
                </>
            )}

            {/* 🔻 能量流失警示 — 從底部往上 60% 高度的 coral 漸層脈動
                獨立於 glowColor 之外，可單獨啟用作為「太慢」的潛意識訊號 */}
            {drainWarning && (
                <motion.div
                    aria-hidden="true"
                    style={{
                        position: 'absolute',
                        left: 0, right: 0, bottom: 0,
                        height: '60%',
                        background: `linear-gradient(to top, ${DRAIN_COLOR}55 0%, ${DRAIN_COLOR}22 40%, transparent 100%)`,
                        pointerEvents: 'none',
                    }}
                    animate={{ opacity: [0.45 * intensity, 0.85 * intensity, 0.45 * intensity] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                />
            )}
        </div>
    );
};

// 對外暴露常數，方便外部 trace / 測試
RunAmbientGlow.ZONE_COLORS = ZONE_COLORS;
RunAmbientGlow.PACE_COLORS = PACE_COLORS;
RunAmbientGlow.PACE_TOLERANCE = PACE_TOLERANCE;
RunAmbientGlow.TEMPO_DURATIONS = TEMPO_DURATIONS;
RunAmbientGlow.DRAIN_COLOR = DRAIN_COLOR;
RunAmbientGlow.resolveGlowColor = resolveGlowColor;

export default RunAmbientGlow;
