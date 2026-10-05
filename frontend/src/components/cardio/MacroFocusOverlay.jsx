import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getStepRpeBand, RPE_BANDS } from '../../utils/rpeMapping';

// 🪙 把 step 轉成簡短狀態標籤（與 CardioTrackerMobile.getStepStatus 對齊）
const stepStatusShort = (step) => {
    const n = String(step?.name || '').toLowerCase();
    if (/暖身|warm.?up|熱身/.test(n)) return 'WARM UP';
    if (/收操|cool.?down|緩和|冷卻/.test(n)) return 'COOL DOWN';
    if (/恢復|recover|rest|walk|休息/.test(n)) return 'RECOVER';
    if (/衝刺|sprint|全力|加速|極限|interval|間歇|rep|衝/.test(n)) return 'SPRINT';
    if (/節奏|tempo|threshold|閾值/.test(n)) return 'TEMPO';
    if (/穩定|steady|long|長跑|巡航|cruise/.test(n)) return 'STEADY';
    if (/輕鬆|easy/.test(n)) return 'EASY';
    return String(step?.name || 'CURRENT STEP').toUpperCase();
};

/**
 * 🔍 MacroFocusOverlay — 巨大化專注模式（Macro Focus UI）
 *
 * 設計哲學：跑者在「衝刺 / 全力 / 極限」step 時不需要看花俏的地圖，
 *   他們在喘氣時只看得到巨大、高對比的倒數數字。把地圖壓暗、把數字推到 180px，
 *   讓專注力收束到當下這一秒。
 *
 * 主要視覺：
 *   - 全螢幕 backdrop-blur + 半透明黑遮罩壓暗地圖
 *   - 中央 share-tech-mono 約 text-[160px] 倒數，低於 5 秒切 coral + scale pulse
 *   - 步驟名稱與目標配速放在倒數上下
 *   - GO 那一刻 100ms 全螢幕白光（由 flashSignal prop 觸發，與 useStageCountdownHaptics 串接）
 *
 * 逃生口：
 *   - 長按中央 1.5 秒可暫時隱藏 Overlay（顯示「Tap to restore」小提示）
 *   - 隱藏狀態下整個元件只剩底部一條 5px coral 細線提示「Focus dormant」
 *
 * @param {boolean} visible           — 是否啟用 Focus 模式
 * @param {object}  currentStep       — getCurrentPlanStep 回傳值
 * @param {number}  flashSignal       — 整數，每次 +1 觸發一次白光（受控訊號）
 * @param {Function} formatDuration   — (seconds) => "mm:ss"
 * @param {Function} formatPace       — (sec/km) => "5'30\""
 * @param {number|null} currentRpe    — 即時 RPE（給 Effort 標籤顯示，可選）
 */
const MacroFocusOverlay = ({
    visible = false,
    currentStep = null,
    flashSignal = 0,
    formatDuration = (s) => String(s),
    formatPace = (s) => String(s),
    currentRpe = null,
}) => {
    const [hidden, setHidden] = useState(false);     // 長按手動隱藏
    const [showFlash, setShowFlash] = useState(false); // 100ms 白光
    const longPressTimerRef = useRef(null);

    // 🎯 監聽 flashSignal — 每次變化觸發白光（受控訊號，數字遞增即可）
    const lastFlashRef = useRef(flashSignal);
    useEffect(() => {
        if (flashSignal !== lastFlashRef.current && visible && !hidden) {
            lastFlashRef.current = flashSignal;
            setShowFlash(true);
            const t = setTimeout(() => setShowFlash(false), 100);
            return () => clearTimeout(t);
        }
        lastFlashRef.current = flashSignal;
    }, [flashSignal, visible, hidden]);

    // 🎯 visible 變 false（離開衝刺 step）時自動還原 hidden 狀態
    useEffect(() => {
        if (!visible) setHidden(false);
    }, [visible]);

    const handlePressStart = () => {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = setTimeout(() => {
            setHidden((prev) => !prev);
        }, 1500);
    };
    const handlePressEnd = () => {
        clearTimeout(longPressTimerRef.current);
    };

    // 沒有 currentStep 就完全不渲染 — 避免 visible=true 但資料空的閃爍
    if (!visible || !currentStep) {
        return (
            <AnimatePresence>
                {showFlash && (
                    <motion.div
                        key="macro-flash-only"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.92 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.08 }}
                        style={{
                            position: 'fixed', inset: 0, zIndex: 99,
                            background: '#FFFFFF', pointerEvents: 'none',
                        }}
                    />
                )}
            </AnimatePresence>
        );
    }

    const stepRemaining = currentStep.stepRemaining ?? 0;
    const isCritical = stepRemaining <= 5 && stepRemaining > 0;

    // 🚪 手動隱藏狀態 — 留底部 dormant 線提示
    if (hidden) {
        return (
            <>
                <div
                    onPointerDown={handlePressStart}
                    onPointerUp={handlePressEnd}
                    onPointerCancel={handlePressEnd}
                    style={{
                        position: 'fixed',
                        left: 0, right: 0, bottom: 'env(safe-area-inset-bottom, 0)',
                        height: 18, zIndex: 38,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer',
                    }}
                >
                    <div style={{
                        width: 36, height: 3, borderRadius: 999,
                        background: '#F95C4B', opacity: 0.85,
                        boxShadow: '0 0 8px #F95C4B66',
                    }} />
                </div>
                <AnimatePresence>
                    {showFlash && (
                        <motion.div
                            key="macro-flash-hidden"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.92 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.08 }}
                            style={{
                                position: 'fixed', inset: 0, zIndex: 99,
                                background: '#FFFFFF', pointerEvents: 'none',
                            }}
                        />
                    )}
                </AnimatePresence>
            </>
        );
    }

    return (
        <>
            <motion.div
                key="macro-focus-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.28, ease: 'easeOut' }}
                onPointerDown={handlePressStart}
                onPointerUp={handlePressEnd}
                onPointerCancel={handlePressEnd}
                style={{
                    position: 'fixed', inset: 0, zIndex: 38,
                    background: 'rgba(0,0,0,0.55)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    pointerEvents: 'auto',
                    paddingTop: 'env(safe-area-inset-top, 0)',
                    paddingBottom: 'env(safe-area-inset-bottom, 0)',
                }}
            >
                {/* 步驟名稱（上）— Michroma + 鈦橘紅，強化「衝刺提醒」識別 */}
                <div style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 400, letterSpacing: '0.32em', textTransform: 'uppercase',
                    fontSize: 12, color: '#F95C4B',
                    textShadow: '0 0 14px rgba(249,92,75,0.5)',
                    marginBottom: 24,
                }}>
                    {stepStatusShort(currentStep)}
                </div>

                {/* 巨大化倒數 — Michroma 約 160px，鈦橘紅；低於 5 秒加亮 + scale pulse */}
                <motion.div
                    animate={isCritical ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                    transition={isCritical ? { duration: 0.7, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
                    style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 'min(34vw, 168px)',
                        lineHeight: 1,
                        color: '#F95C4B',
                        letterSpacing: '-0.02em',
                        textShadow: isCritical
                            ? '0 0 32px rgba(249,92,75,0.7)'
                            : '0 0 22px rgba(249,92,75,0.45)',
                    }}
                >
                    {formatDuration(stepRemaining)}
                </motion.div>

                {/* 目標 — Effort RPE Band（主）+ 目標配速（從屬，僅供對照）
                    NRC 哲學：用體感取代絕對配速，避免天氣或狀態導致挫敗感 */}
                {(() => {
                    const band = getStepRpeBand(currentStep);
                    const bandLabel = band.min === band.max ? `RPE ${band.min}` : `RPE ${band.min}-${band.max}`;
                    const bandKey = Object.keys(RPE_BANDS).find(
                        (k) => RPE_BANDS[k].min === band.min && RPE_BANDS[k].max === band.max
                    );
                    const bandColor = bandKey ? RPE_BANDS[bandKey].color : '#FFFFFF';
                    return (
                        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                            <div style={{
                                fontFamily: "'Share Tech Mono', monospace",
                                fontSize: 22,
                                letterSpacing: '0.12em',
                                color: bandColor,
                                textShadow: `0 0 12px ${bandColor}55`,
                            }}>
                                EFFORT&nbsp;&nbsp;{bandLabel}
                                {currentRpe != null && (
                                    <span style={{ marginLeft: 12, color: 'rgba(255,255,255,0.6)', fontSize: 16 }}>
                                        · NOW {currentRpe}
                                    </span>
                                )}
                            </div>
                            {currentStep.targetPace > 0 && (
                                <div style={{
                                    fontFamily: "'Share Tech Mono', monospace",
                                    fontSize: 13,
                                    color: 'rgba(255,255,255,0.42)',
                                    letterSpacing: '0.08em',
                                }}>
                                    ≈ {formatPace(currentStep.targetPace)}&nbsp;/km
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* 逃生口提示 */}
                <div style={{
                    position: 'absolute',
                    bottom: 'calc(env(safe-area-inset-bottom, 0) + 28px)',
                    left: 0, right: 0, textAlign: 'center',
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.32em',
                    color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase',
                }}>
                    Hold to hide
                </div>
            </motion.div>

            {/* 🌟 GO 白光 — 獨立於 overlay 之上，100ms */}
            <AnimatePresence>
                {showFlash && (
                    <motion.div
                        key="macro-flash"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.92 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.08 }}
                        style={{
                            position: 'fixed', inset: 0, zIndex: 99,
                            background: '#FFFFFF', pointerEvents: 'none',
                        }}
                    />
                )}
            </AnimatePresence>
        </>
    );
};

export default MacroFocusOverlay;
