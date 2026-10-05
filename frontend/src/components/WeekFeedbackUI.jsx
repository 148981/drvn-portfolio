/**
 * WeekFeedbackUI.jsx — Luxury Editorial Design
 * Rolls-Royce / high-fashion magazine aesthetic
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import WeeklyReviewPanel from './WeeklyReviewPanel';
import { toast, confirmDialog } from '../utils/toast';
import { T } from '../utils/theme';
import MemberLockCard from './MemberLockCard';

// ─── Palette ─────────────────────────────────────────────────────────────────


// ─── Fonts ────────────────────────────────────────────────────────────────────
const FontInjector = () => (
    <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Tenor+Sans&display=swap');
        .wf-serif { font-family: 'Tenor Sans', 'Noto Sans TC', sans-serif; }
        .wf-mono  { font-family: 'Barlow Condensed', monospace; letter-spacing: 0.12em; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* 👇 加入這段玻璃材質 */
        .glass-panel {
            background: rgba(246, 244, 241, 0.75);
            backdrop-filter: blur(32px) saturate(180%);
            -webkit-backdrop-filter: blur(32px) saturate(180%);
            border-top: 1px solid rgba(255, 255, 255, 0.6);
            box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.9), 0 -24px 80px rgba(0, 0, 0, 0.15);
        }
        .glass-card {
            background: rgba(255, 255, 255, 0.4);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.6);
            box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.9), 0 4px 12px rgba(0, 0, 0, 0.04);
        }
        .glass-card-active {
            background: rgba(249, 92, 75, 0.12);
            border: 1px solid rgba(249, 92, 75, 0.3);
            box-shadow: inset 0 2px 6px rgba(249, 92, 75, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.5);
        }

        /* ── Intensity Slider ─────────────────────────────── */
        .intensity-slider {
            -webkit-appearance: none;
            appearance: none;
            width: 100%;
            height: 3px;
            background: transparent;
            outline: none;
            cursor: pointer;
            position: relative;
            z-index: 1;
        }
        /* 👇 把原來的 .intensity-slider::-webkit-slider-thumb 替換成這個 */
        .intensity-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 26px;
            height: 26px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.85);
            backdrop-filter: blur(8px);
            cursor: grab;
            border: 1px solid rgba(255, 255, 255, 0.9);
            box-shadow: inset 0 -2px 4px rgba(0,0,0,0.1), 0 4px 12px rgba(0,0,0,0.15), 0 0 0 2px var(--slider-thumb-color, #F95C4B);
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .intensity-slider:active::-webkit-slider-thumb {
            cursor: grabbing;
            transform: scale(1.18);
            box-shadow: 0 4px 16px rgba(0,0,0,0.22);
        }
        .intensity-slider::-moz-range-thumb {
            width: 26px;
            height: 26px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.85);
            backdrop-filter: blur(8px);
            cursor: grab;
            border: 1px solid rgba(255, 255, 255, 0.9);
            box-shadow: inset 0 -2px 4px rgba(0,0,0,0.1), 0 4px 12px rgba(0,0,0,0.15), 0 0 0 2px var(--slider-thumb-color, #F95C4B);
        }
    `}</style>
);

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useWeekCompletionTracker(userId, activeWeek, completedWorkouts, totalDaysPerWeek, isLastWeek = false) {
    const [showFeedbackModal, setShowFeedbackModal] = useState(false);
    const [hasFeedbackForWeek, setHasFeedbackForWeek] = useState(false);
    // 交完回饋後要「重讀一次旗標」：effect 的依賴（週數、完成日）都沒變，
    // 不 bump 這個版本號，手動「填本週回饋」按鈕會一直留著，叫人再填一次。
    const [flagVersion, setFlagVersion] = useState(0);
    const markDone = useCallback(() => setFlagVersion(v => v + 1), []);

    useEffect(() => {
        const completedSet = new Set(completedWorkouts);
        const daysInWeek   = Array.from({ length: totalDaysPerWeek }, (_, i) => i + 1);
        const allDone      = daysInWeek.every(d => completedSet.has(d));
        const feedbackKey  = `week_feedback_${userId}_week${activeWeek}`;
        const existing     = localStorage.getItem(feedbackKey);
        // 先同步旗標，不管下面會不會排自動彈窗 —— 以前提早 return，旗標狀態會停在上一週的值
        setHasFeedbackForWeek(!!existing);

        // 最後一週完成時不彈「週回報」—— 那一刻屬於週期收官（Season Recap），
        // 避免週回報與收官彈窗同時跳出。最後一週的強度回饋已整合進收官分析。
        if (allDone && !existing && !isLastWeek) {
            const t = setTimeout(() => setShowFeedbackModal(true), 1800);
            return () => clearTimeout(t);
        }
        return undefined;
    }, [activeWeek, completedWorkouts, totalDaysPerWeek, userId, isLastWeek, flagVersion]);

    return { showFeedbackModal, setShowFeedbackModal, hasFeedbackForWeek, markDone };
}

// ─── Options config ───────────────────────────────────────────────────────────
const OPTIONS = [
    {
        id:    'too_easy',
        roman: 'I',
        label: '輕而易舉',
        labelEn: 'Too Easy',
        desc:  '強度不足，身體尚有大量餘力',
        signal: '↑ 建議提升強度',
    },
    {
        id:    'just_right',
        roman: 'II',
        label: '恰到好處',
        labelEn: 'Just Right',
        desc:  '具挑戰性，但在完整控制之下完成',
        signal: '→ 維持當前軌跡',
    },
    {
        id:    'too_hard',
        roman: 'III',
        label: '強度過高',
        labelEn: 'Too Hard',
        desc:  '勉強完成，恢復需要更多時間',
        signal: '↓ 建議降低強度',
    },
];

// ─── WeekFeedbackModal ────────────────────────────────────────────────────────
// `recommendation` (optional) comes from rpeHistoryReader.recommendFromRPE():
//   { feeling, avgRPE, targetBand:{min,max,name}, dataPoints, confident, reason, level }
// When present and confident, the matching option is auto-preselected and a
// transparent "data hint" banner is shown. The user can still override.
export function WeekFeedbackModal({ weekNumber, onSubmit, onClose, recommendation = null }) {
    // Auto-preselect from real RPE data when we have a confident reading.
    const initialSel = recommendation?.confident ? recommendation.feeling : null;
    const [selected, setSelected] = useState(initialSel);
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!selected || submitting) return;
        setSubmitting(true);
        // 送出失敗（存課表丟錯）以前會讓按鈕永遠停在「···」、也沒有任何說明；
        // 現在一定會解除送出中，並告訴使用者可以再按一次。
        try {
            // Pass the recommended absolute level too, so the engine can apply the
            // correct Double Progression stage when RPE deviation is large.
            await onSubmit({
                overallFeeling: selected,
                weekNumber,
                // only forward the level when the user kept the data-recommended option
                targetLevel: (recommendation && selected === recommendation.feeling)
                    ? recommendation.level : undefined,
            });
        } catch (e) {
            console.error('[WeekFeedback] submit failed', e);
            toast.error('回饋沒有存成功，再按一次試試');
        } finally {
            setSubmitting(false);
        }
    };

    return createPortal(
        <AnimatePresence>
            <FontInjector />

            {/* Backdrop */}
            <motion.div
                key="wf-backdrop"
                className="fixed inset-0"
                style={{ zIndex: 2147483647, background: 'rgba(22,20,21,0.65)', backdropFilter: 'blur(8px)' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
            />

            {/* Panel — slides up from bottom */}
            <motion.div
                key="wf-panel"
                className="fixed bottom-0 left-0 right-0 flex justify-center"
                style={{ zIndex: 2147483647 }}
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 260 }}
            >
                <div
                    className="w-full max-w-[430px] glass-panel"
                    style={{
                        borderRadius: '28px 32px 0 0',
                        paddingBottom: 'env(safe-area-inset-bottom)',
                    }}
                >
                    {/* Pull indicator */}
                    <div className="flex justify-center pt-4 pb-2">
                        <div style={{ width: 36, height: 3, borderRadius: 2, background: T.pebble }} />
                    </div>

                    {/* Header */}
                    <div className="px-8 pt-6 pb-8">
                        {/* Week badge */}
                        <div className="flex items-center gap-3 mb-6">
                            <div style={{ width: 24, height: 1, background: T.pebble }} />
                            <span
                                className="wf-mono text-[9px] font-bold uppercase"
                                style={{ color: T.pebble, letterSpacing: '0.32em' }}
                            >
                                Week {weekNumber} · Assessment
                            </span>
                        </div>

                        <h2
                            className="wf-serif text-[34px] leading-[1.05] mb-2"
                            style={{ color: T.black, fontStyle: 'italic' }}
                        >
                            週訓練<br />完成評估
                        </h2>
                        <p
                            className="text-[13px] font-medium"
                            style={{ color: T.pebble }}
                        >
                            {recommendation?.confident
                                ? '已根據本週實際 RPE 數據預選，可手動調整'
                                : '您的回饋將即時調整後續計劃強度'}
                        </p>

                        {/* ── Data-driven RPE hint banner ── */}
                        {recommendation?.confident && recommendation.avgRPE != null && (
                            <motion.div
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.15 }}
                                className="glass-card rounded-[18px] mt-5 px-4 py-3 flex items-start gap-3"
                            >
                                <div
                                    className="shrink-0 flex flex-col items-center justify-center rounded-xl"
                                    style={{
                                        width: 46, height: 46,
                                        background: `${recommendation.feeling === 'too_easy' ? T.coral
                                            : recommendation.feeling === 'too_hard' ? '#9CA3AF' : T.black}14`,
                                    }}
                                >
                                    <span className="wf-mono text-[11px]" style={{ color: T.pebble, letterSpacing: '0.1em' }}>RPE</span>
                                    <span className="text-[17px] font-bold" style={{
                                        color: recommendation.feeling === 'too_easy' ? T.coral
                                            : recommendation.feeling === 'too_hard' ? '#6B7280' : T.black,
                                        lineHeight: 1,
                                    }}>{recommendation.avgRPE}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="wf-mono text-[12px] font-bold" style={{ color: T.pebble, letterSpacing: '0.2em' }}>
                                            本週數據分析 · {recommendation.dataPoints} 次訓練
                                        </span>
                                    </div>
                                    <p className="text-[11px] leading-snug" style={{ color: 'rgba(22,20,21,0.6)' }}>
                                        {recommendation.reason}
                                    </p>
                                </div>
                            </motion.div>
                        )}
                    </div>

                    {/* Divider */}
                    <div style={{ height: 1, background: T.stone, margin: '0 32px' }} />

                    {/* Options */}
                    <div className="px-8 py-2">
                        {OPTIONS.map((opt, i) => {
                            const isSelected = selected === opt.id;
                            const isRecommended = recommendation?.confident && recommendation.feeling === opt.id;
                            return (
                                <React.Fragment key={opt.id}>
                                    <motion.button
                                        whileTap={{ scale: 0.97 }}
                                        onClick={() => setSelected(opt.id)}
                                        className={`w-full relative text-left p-5 rounded-3xl flex items-center gap-4 transition-all duration-300 ${
                                            isSelected ? 'glass-card-active' : 'glass-card'
                                        }`}
                                        style={{ outline: 'none', cursor: 'pointer', border: 'none' }}
                                    >
                                        {/* Roman numeral */}
                                        <span
                                            className="wf-serif text-[13px] shrink-0 w-6 text-center transition-colors"
                                            style={{
                                                color: isSelected ? T.coral : T.pebble,
                                                fontStyle: 'italic',
                                            }}
                                        >
                                            {opt.roman}
                                        </span>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-baseline gap-2 mb-0.5">
                                                <span
                                                    className="text-[16px] font-bold tracking-tight transition-colors"
                                                    style={{ color: isSelected ? T.black : 'rgba(22,20,21,0.55)' }}
                                                >
                                                    {opt.label}
                                                </span>
                                                <span
                                                    className="wf-mono text-[11px] transition-colors"
                                                    style={{ color: isSelected ? T.coral : T.pebble }}
                                                >
                                                    {opt.labelEn}
                                                </span>
                                                {isRecommended && (
                                                    <span
                                                        className="wf-mono text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                                                        style={{ background: `${T.coral}1A`, color: T.coral, letterSpacing: '0.12em' }}
                                                    >
                                                        數據推薦
                                                    </span>
                                                )}
                                            </div>
                                            <p
                                                className="text-[11px] leading-snug transition-colors"
                                                style={{ color: isSelected ? 'rgba(22,20,21,0.5)' : 'rgba(22,20,21,0.3)' }}
                                            >
                                                {opt.desc}
                                            </p>
                                        </div>

                                        {/* Right signal / selection mark */}
                                        <div className="shrink-0 flex items-center gap-2">
                                            {isSelected && (
                                                <motion.span
                                                    initial={{ opacity: 0, x: -6 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    className="wf-mono text-[11px]"
                                                    style={{ color: T.coral }}
                                                >
                                                    {opt.signal}
                                                </motion.span>
                                            )}
                                            <div
                                                style={{
                                                    width: 18,
                                                    height: 18,
                                                    borderRadius: '50%',
                                                    border: `1.5px solid ${isSelected ? T.coral : T.pebble}`,
                                                    background: isSelected ? T.coral : 'transparent',
                                                    transition: 'all 0.2s',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                }}
                                            >
                                                {isSelected && (
                                                    <svg width="8" height="8" viewBox="0 0 8 8">
                                                        <path d="M1.5 4L3.2 5.8L6.5 2.2" stroke={T.paper} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                                                    </svg>
                                                )}
                                            </div>
                                        </div>
                                    </motion.button>

                                    {/* Hairline divider */}
                                    {i < OPTIONS.length - 1 && (
                                        <div style={{ height: 1, background: T.stone }} />
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </div>

                    {/* Submit */}
                    <div className="px-8 pt-4 pb-10">
                        <motion.button
                            onClick={handleSubmit}
                            disabled={!selected || submitting}
                            whileTap={selected ? { scale: 0.98 } : {}}
                            className="w-full h-[54px] relative overflow-hidden"
                            style={{
                                background: selected ? T.black : T.stone,
                                borderRadius: 12,
                                border: 'none',
                                cursor: selected ? 'pointer' : 'not-allowed',
                                transition: 'background 0.3s',
                            }}
                        >
                            {submitting ? (
                                <span
                                    className="wf-mono text-[9px] font-bold uppercase"
                                    style={{ color: T.pebble, letterSpacing: '0.28em' }}
                                >
                                    ···
                                </span>
                            ) : (
                                <span
                                    className="wf-mono text-[12px] font-bold"
                                    style={{ color: selected ? T.paper : T.pebble, letterSpacing: '0.28em' }}
                                >
                                    確認提交回饋
                                </span>
                            )}
                        </motion.button>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>,
        document.body
    );
}

// ─── FeedbackResultModal ──────────────────────────────────────────────────────
// ─── IntensityLevelSlider ─────────────────────────────────────────────────────
// Interactive slider: -3 … 0 (baseline) … +3
// Uses native pointerup/touchend listeners to reliably fire on mobile.
function IntensityLevelSlider({ level = 0, onSliderRelease }) {
    const [localLevel, setLocalLevel] = useState(Math.max(-3, Math.min(3, level)));
    const sliderRef    = useRef(null);
    // Keep a stable ref to both the callback and localLevel so native listeners
    // never capture a stale closure.
    const callbackRef  = useRef(onSliderRelease);
    const localLevelRef = useRef(localLevel);

    useEffect(() => { callbackRef.current = onSliderRelease; }, [onSliderRelease]);
    useEffect(() => { localLevelRef.current = localLevel; },   [localLevel]);

    // Sync when parent updates level (e.g. after resubmit completes)
    useEffect(() => {
        setLocalLevel(Math.max(-3, Math.min(3, level)));
    }, [level]);

    // Attach native release listeners — avoids React synthetic-event issues on iOS
    useEffect(() => {
        const el = sliderRef.current;
        if (!el) return;
        const fireRelease = () => {
            const l = parseInt(el.value);
            if (callbackRef.current) callbackRef.current(l, l > 0 ? 'too_easy' : l < 0 ? 'too_hard' : 'just_right');
        };
        el.addEventListener('pointerup',  fireRelease);
        el.addEventListener('touchend',   fireRelease);
        return () => {
            el.removeEventListener('pointerup',  fireRelease);
            el.removeEventListener('touchend',   fireRelease);
        };
    }, []); // run once — reads latest values via refs

    const thumbColor = localLevel > 0 ? T.coral : localLevel < 0 ? '#9CA3AF' : T.black;
    const pct        = ((localLevel + 3) / 6) * 100;
    const trackBg    = `linear-gradient(to right,
        ${localLevel > 0 ? T.coral + '66' : localLevel < 0 ? '#9CA3AF44' : T.black + '22'} 0%,
        ${localLevel > 0 ? T.coral + '66' : localLevel < 0 ? '#9CA3AF44' : T.black + '22'} ${pct}%,
        ${T.pebble}44 ${pct}%,
        ${T.pebble}44 100%)`;

    const labelText = localLevel === 0
        ? '基準強度'
        : localLevel > 0 ? `強度 +${localLevel}（較基準更高）`
                         : `強度 ${localLevel}（較基準更低）`;

    return (
        <div className="glass-card rounded-[18px] px-6 pt-5 pb-6 mb-6">
            {/* Header row */}
            <div className="flex justify-between items-center mb-4">
                <span className="wf-mono text-[12px] font-bold"
                    style={{ color: T.pebble, letterSpacing: '0.24em' }}>
                    調整強度等級
                </span>
                <span className="wf-mono text-[12px] font-bold"
                    style={{ color: thumbColor, letterSpacing: '0.1em', minWidth: 32, textAlign: 'right' }}>
                    {localLevel === 0 ? 'BASE' : localLevel > 0 ? `+${localLevel}` : `${localLevel}`}
                </span>
            </div>

            {/* Tick labels */}
            <div className="flex justify-between mb-1 px-0.5">
                {[-3, -2, -1, 0, 1, 2, 3].map(v => (
                    <span key={v} className="wf-mono" style={{
                        fontSize: 11,
                        color: v === localLevel ? thumbColor : v === 0 ? T.black + '55' : T.pebble + '88',
                        fontWeight: v === localLevel || v === 0 ? '700' : '400',
                        letterSpacing: '0.08em',
                        transition: 'color 0.2s',
                    }}>
                        {v === 0 ? '·' : v > 0 ? `+${v}` : v}
                    </span>
                ))}
            </div>

            {/* Slider — onChange updates visual; native pointerup fires the plan update */}
            <div style={{ position: 'relative', padding: '6px 0' }}>
                <input
                    ref={sliderRef}
                    type="range"
                    min={-3}
                    max={3}
                    step={1}
                    value={localLevel}
                    className="intensity-slider"
                    style={{ '--slider-thumb-color': thumbColor, background: trackBg, borderRadius: 3, height: 3 }}
                    onChange={e => setLocalLevel(parseInt(e.target.value))}
                />
            </div>

            {/* Sub-label */}
            <div className="mt-2" style={{ fontSize: 11, color: 'rgba(22,20,21,0.45)', lineHeight: 1.5 }}>
                {labelText}
                {localLevel !== 0 && (
                    <span style={{ marginLeft: 4, color: thumbColor }}>— 放開後套用</span>
                )}
            </div>
        </div>
    );
}

// ─── Hoisted outside FeedbackResultModal (rerender-no-inline-components) ─────
// IconMark previously closed over `summary` — now receives accentKey as prop.
const IconMark = ({ accentKey }) => {
    if (accentKey === 'too_easy') {
        return (
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path d="M14 22V6M6 14L14 6L22 14" stroke={T.coral} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        );
    }
    if (accentKey === 'too_hard') {
        return (
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path d="M14 6V22M6 14L14 22L22 14" stroke={T.pebble} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        );
    }
    // just_right — horizontal
    return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path d="M6 14H22M16 8L22 14L16 20" stroke={T.black} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
};

// ─── FeedbackResultModal ──────────────────────────────────────────────────────
export function FeedbackResultModal({ adjustments, summary, selectedFeeling, weekNumber: wkNum, onResubmit, onResetBaseline, onClose, locked = false }) {
    const navigate = useNavigate();
    // hooks 必須無條件呼叫，提早 return 放最後（修正 rules-of-hooks）
    const [activeFeeling, setActiveFeeling] = useState(selectedFeeling || summary?.accentKey || 'just_right');
    const [resubmitting, setResubmitting] = useState(false);

    if (!summary) return null;

    const { headline, subline, directive, changes = [], streak, weekNumber, remaining,
            intensityLevel = 0, prevIntensityLevel = 0 } = summary;

    const accentColor = summary.accentKey === 'too_easy' ? T.coral
        : summary.accentKey === 'too_hard' ? T.pebble
        : T.black;

    return createPortal(
        <AnimatePresence>
            <FontInjector />

            {/* Backdrop — z-index just below panel */}
            <motion.div
                key="fr-backdrop"
                className="fixed inset-0"
                style={{
                    zIndex: 2147483646,
                    background: 'rgba(22,20,21,0.75)',
                    backdropFilter: 'blur(16px)',
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
            />

            {/* Panel — above EVERYTHING including MobileNavigation */}
            <motion.div
                key="fr-panel"
                className="fixed inset-0 flex items-end justify-center"
                style={{ zIndex: 2147483647, pointerEvents: 'none' }}
                initial={{ y: 60, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 60, opacity: 0 }}
                transition={{ type: 'spring', damping: 28, stiffness: 240 }}
            >
                <div
                    className="w-full max-w-[430px] glass-panel"
                    style={{
                        borderRadius: '28px 28px 0 0',
                        paddingBottom: 'env(safe-area-inset-bottom)',
                        overflow: 'hidden',
                        pointerEvents: 'auto',
                        maxHeight: '88dvh',
                        overflowY: 'auto',
                    }}
                >
                    {/* Accent top strip */}
                    <div style={{ height: 3, background: accentColor }} />

                    {/* Pull bar */}
                    <div className="flex justify-center pt-4">
                        <div style={{ width: 36, height: 3, borderRadius: 2, background: T.pebble }} />
                    </div>

                    {/* Main content */}
                    <div className="px-8 pt-6 pb-4">
                        {/* 📊 本週回顧（逐肌群分析）— 第四週結算的重點回饋 */}
                        <WeeklyReviewPanel />

                        {/* Icon */}
                        <div
                            className="w-12 h-12 rounded-full flex items-center justify-center mb-6"
                            style={{ background: `${accentColor}12`, border: `1px solid ${accentColor}22` }}
                        >
                            {resubmitting
                                ? <div style={{ width: 18, height: 18, border: `2px solid ${accentColor}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                                : <IconMark accentKey={summary.accentKey} />
                            }
                        </div>

                        {/* Headline */}
                        <div className="mb-1 flex items-center gap-3">
                            <h2
                                className="wf-serif text-[32px] leading-none"
                                style={{ color: T.black, fontStyle: 'italic' }}
                            >
                                {locked ? '這週練得輕鬆' : headline}
                            </h2>
                            {streak >= 2 && (
                                <span
                                    className="wf-mono text-[11px] px-2 py-1 rounded-full"
                                    style={{
                                        background: `${accentColor}15`,
                                        color: accentColor,
                                        letterSpacing: '0.2em',
                                    }}
                                >
                                    ×{streak}
                                </span>
                            )}
                        </div>
                        <p
                            className="text-[13px] leading-relaxed mb-6"
                            style={{ color: 'rgba(22,20,21,0.55)' }}
                        >
                            {locked ? '下週先照原本的課表練，重量也可以自己加。' : subline}
                        </p>

                        {/* 💳 加量是會員功能：免費版看得到建議，課表不動 */}
                        {locked && (
                            <div className="mb-6">
                                <MemberLockCard feature="autoProgress" label="讓課表自動加量" />
                            </div>
                        )}

                        {/* Directive chip */}
                        {!locked && (
                        <div
                            className="glass-card inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6"
                        >
                            <div style={{ width: 5, height: 5, borderRadius: '50%', background: accentColor }} />
                            <span
                                className="wf-mono text-[11px] font-bold"
                                style={{ color: T.black, letterSpacing: '0.18em' }}
                            >
                                {directive}
                            </span>
                        </div>
                        )}

                        {/* Intensity level slider — always show so user can adjust */}
                        <IntensityLevelSlider
                            level={locked ? prevIntensityLevel : intensityLevel}
                            onSliderRelease={async (newLevel, newFeeling) => {
                                if (!onResubmit || resubmitting) return;
                                setResubmitting(true);
                                try {
                                    // Pass both the feeling AND the exact target level
                                    // so the Double Progression algorithm applies the
                                    // correct stage (reps / range shift / sets).
                                    await onResubmit(newFeeling, wkNum || weekNumber || 1, newLevel);
                                } finally {
                                    setResubmitting(false);
                                }
                            }}
                        />

                        {/* Changes list */}
                        {changes.length > 0 && (
                            <div
                                className="glass-card rounded-[18px] overflow-hidden mb-6"
                            >
                                <div
                                    className="px-4 py-2.5"
                                >
                                    <span
                                        className="wf-mono text-[12px] font-bold"
                                        style={{ color: T.pebble, letterSpacing: '0.28em' }}
                                    >
                                        具體調整項目
                                    </span>
                                </div>
                                <div className="divide-y" style={{ borderColor: T.stone }}>
                                    {changes.slice(0, 6).map((c, i) => (
                                        <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                                            <div style={{ width: 4, height: 4, borderRadius: '50%', background: accentColor, flexShrink: 0 }} />
                                            <span className="text-[12px]" style={{ color: 'rgba(22,20,21,0.65)' }}>
                                                {c}
                                            </span>
                                        </div>
                                    ))}
                                    {changes.length > 6 && (
                                        <div className="px-4 py-2.5">
                                            <span className="text-[11px]" style={{ color: T.pebble }}>
                                                ＋{changes.length - 6} 項其他調整
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* No changes (just_right or last week) */}
                        {changes.length === 0 && (
                            <div
                                className="glass-card rounded-[18px] px-5 py-4 mb-6 flex items-start gap-3"
                            >
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginTop: 1, flexShrink: 0 }}>
                                    <circle cx="7" cy="7" r="6" stroke={T.pebble} strokeWidth="1.2" />
                                    <path d="M7 4.5V7.5" stroke={T.pebble} strokeWidth="1.2" strokeLinecap="round" />
                                    <circle cx="7" cy="9.5" r="0.6" fill={T.pebble} />
                                </svg>
                                <span className="text-[12px] leading-relaxed" style={{ color: 'rgba(22,20,21,0.55)' }}>
                                    {remaining > 0
                                        ? '計劃正常遞進，無需手動調整。'
                                        : '四週週期完成。下一個週期將根據所有回饋重新評估起始強度。'}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Reset baseline link */}
                    {onResetBaseline && (
                        <div className="px-8 pb-2 flex justify-center">
                            <motion.button {...pressProps('row')}
 onClick={async () => {
 if (!(await confirmDialog('重設訓練強度為原始計劃基準？\n\n這會清除所有強度調整，將次數 / 組數還原為 AI 初始設定。', { danger: true }))) return;
 const ok = await onResetBaseline();
 if (ok !== false) { onClose(); return; }
 // 死路修復：重設失敗時直接給「重新產生」的去路，而不是留使用者原地
 const go = await confirmDialog('重設失敗：後端計劃也已修改。\n要現在前往重新產生計劃嗎？', { confirmText: '前往產生' });
 if (go) { onClose(); navigate('/workout-plan-mobile'); }
 }}
 style={{
 background: 'none',
 border: 'none',
 cursor: 'pointer',
 color: T.pebble,
 fontSize: 12,
 letterSpacing: '0.10em',
 textDecoration: 'underline',
 padding: '6px 8px',
 fontFamily: 'inherit',
 opacity: 0.7,
 }}
 >
                                重設為原始基準
                            </motion.button>
                        </div>
                    )}

                    {/* CTA */}
                    <div className="px-8 pb-10">
                        <motion.button
                            onClick={onClose}
                            whileTap={{ scale: 0.96 }}
                            className="w-full h-[58px] rounded-[18px] shadow-lg flex items-center justify-center"
                            style={{
                                background: 'rgba(22, 20, 21, 0.9)',
                                backdropFilter: 'blur(8px)',
                                border: '1px solid rgba(0,0,0,0.8)'
                            }}
                        >
                            <span className="wf-mono text-[13px] font-bold uppercase" style={{ color: T.paper, letterSpacing: '0.28em' }}>
                                繼續推進
                            </span>
                        </motion.button>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>,
        document.body
    );
}
