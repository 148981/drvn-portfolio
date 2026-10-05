import React from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, ArrowRight, Footprints, UtensilsCrossed, Moon } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴

// ──────────────────────────────────────────────────────────────────
// DRVN Standby Phase 同步邏輯 (與 watchOS StandbyManager.evaluatePhase
// 規則完全一致)。讓 App 開啟時的 DailyCheckIn 卡與手錶待機畫面顯示相同
// 情境文字。
// ──────────────────────────────────────────────────────────────────
// 優先級 (高→低)：
//   1. preWorkout : 預測訓練前 60 min 內
//   2. postWorkout: 訓練結束 30 min 內
//   3. evening    : 睡前 1 小時 (Health 排程) / 無資料 fallback 22:00
//   4. mealTime   : 07:30 / 12:30 / 18:30 ± 30 min
//   5. wakeWindow : 起床後 2 小時內 (workoutDay → wakeWorkout / 否則 wakeRecovery)
//   6. idle       : 其餘時段
const computePhase = ({
    isWorkoutDay = false,
    predictedWorkoutTimes = [],
    lastWorkoutEnd = null,
    bedtimeDate = null,
    wakeUpDate = null,
    now = new Date(),
} = {}) => {
    const hour = now.getHours();
    const ms = (n) => n * 60 * 1000;

    // 1. preWorkout (60 min 內最接近的一個)
    let bestUpcoming = null;
    for (const t of predictedWorkoutTimes) {
        const d = (t instanceof Date) ? t : new Date(t);
        const diff = d.getTime() - now.getTime();
        if (diff > 0 && diff <= ms(60)) {
            const mins = Math.ceil(diff / 60000);
            if (!bestUpcoming || mins < bestUpcoming.mins) {
                bestUpcoming = { date: d, mins };
            }
        }
    }
    if (bestUpcoming) return { phase: 'preWorkout', minsToWorkout: bestUpcoming.mins };

    // 2. postWorkout (訓練結束 30 min 內)
    if (lastWorkoutEnd) {
        const end = (lastWorkoutEnd instanceof Date) ? lastWorkoutEnd : new Date(lastWorkoutEnd);
        const since = now.getTime() - end.getTime();
        if (since >= 0 && since <= ms(30)) return { phase: 'postWorkout' };
    }

    // 3. evening (睡前 1 小時 → 凌晨 04:00)
    if (bedtimeDate) {
        const bed = (bedtimeDate instanceof Date) ? bedtimeDate : new Date(bedtimeDate);
        const interval = bed.getTime() - now.getTime();
        if (interval <= ms(60)) return { phase: 'evening' }; // 含已過睡點 / 凌晨
    } else if (hour >= 22 || hour < 4) {
        return { phase: 'evening' };
    }

    // 4. mealTime ±30 min
    const mealCenters = [{h:7,m:30},{h:12,m:30},{h:18,m:30}];
    for (const c of mealCenters) {
        const center = new Date(now);
        center.setHours(c.h, c.m, 0, 0);
        if (Math.abs(now.getTime() - center.getTime()) <= ms(30)) {
            return { phase: 'mealTime' };
        }
    }

    // 5. wakeWindow (起床後 2 小時)
    if (wakeUpDate) {
        const wake = (wakeUpDate instanceof Date) ? wakeUpDate : new Date(wakeUpDate);
        const sameDay = wake.toDateString() === now.toDateString();
        const since = now.getTime() - wake.getTime();
        if (sameDay && since >= 0 && since <= ms(120)) {
            return { phase: isWorkoutDay ? 'wakeWorkout' : 'wakeRecovery' };
        }
    }

    return { phase: 'idle' };
};

// ── 根據 phase 給出 UI 文字 (UI 設計後續再迭代，這邊只先同步文案)
const getContent = (todayWorkout, navigate, onClose, ctx = {}) => {
    const hour = new Date().getHours();
    const hasWorkout = todayWorkout && !todayWorkout.is_rest_day && todayWorkout.exercises?.length > 0;
    const isRestDay = todayWorkout?.is_rest_day;

    const { phase, minsToWorkout } = computePhase({
        isWorkoutDay: hasWorkout,
        predictedWorkoutTimes: ctx.predictedWorkoutTimes || [],
        lastWorkoutEnd: ctx.lastWorkoutEnd || null,
        bedtimeDate: ctx.bedtimeDate || null,
        wakeUpDate: ctx.wakeUpDate || null,
    });

    // ── 1. preWorkout : 預測訓練前 60 min ────────
    if (phase === 'preWorkout') {
        return {
            tag: `T-MINUS ${minsToWorkout}M`,
            headline: '準備\n上場',
            sub: hasWorkout ? (todayWorkout.main_exercise || todayWorkout.workout_name || null) : '黃金訓練窗口開啟中',
            meta: [],
            icon: Dumbbell,
            cta: 'Let\'s Go',
            ctaSub: '開始訓練',
            onCta: onClose,
            statusDot: '#F95C4B',
            statusLabel: 'PRE-WORKOUT',
        };
    }

    // ── 2. postWorkout : 訓練結束 30 min ─────────
    if (phase === 'postWorkout') {
        const isRunSession = ctx.lastWorkoutType === 'run';
        return {
            tag: 'RECOVERY WINDOW',
            headline: isRunSession ? '補碳\n補水' : '立即\n補蛋白',
            sub: isRunSession
                ? '跑後黃金窗口：碳水優先，恢復肌糖原'
                : '重訓後 30 分鐘：亮胺酸觸發肌肉合成',
            meta: [],
            icon: UtensilsCrossed,
            cta: 'Log Recovery Fuel',
            ctaSub: '前往營養記錄',
            onCta: () => { onClose(); navigate('/nutrition-mobile'); },
            statusDot: isRunSession ? '#0EA5E9' : '#F95C4B',
            statusLabel: isRunSession ? 'POST-RUN' : 'POST-LIFT',
        };
    }

    // ── 3. evening : 睡前 1 小時 / 22:00 後 ──────
    if (phase === 'evening') {
        return {
            tag: 'END OF DAY',
            headline: '今天\n辛苦了',
            sub: '明天繼續努力',
            meta: [],
            icon: Moon,
            cta: 'Enter Dashboard',
            ctaSub: '查看今日總結',
            onCta: onClose,
            statusDot: '#826DEE',
            statusLabel: hasWorkout ? 'TRAINING DAY' : 'RECOVERY DAY',
        };
    }

    // ── 4. mealTime : 三餐 ±30 min ──────────────
    if (phase === 'mealTime') {
        return {
            tag: 'FUEL UP',
            headline: '記錄\n餐點',
            sub: '吃對才練得好',
            meta: [],
            icon: UtensilsCrossed,
            cta: 'Log Meals',
            ctaSub: '前往飲食記錄',
            onCta: () => { onClose(); navigate('/nutrition-mobile'); },
            statusDot: '#E9C46A',
            statusLabel: hasWorkout ? 'TRAINING DAY' : 'FREE DAY',
        };
    }

    // ── 5a. wakeWorkout : 起床 2h 內 + 健身日 ────
    if (phase === 'wakeWorkout' && hasWorkout) {
        const name = todayWorkout.workout_name || '今日訓練';
        const count = todayWorkout.exercise_count || todayWorkout.exercises?.length || 0;
        const time = todayWorkout.estimated_time || 45;
        const mainEx = todayWorkout.main_exercise || (todayWorkout.exercises?.[0]?.name) || '';
        return {
            tag: 'TODAY\'S TRAINING',
            headline: name,
            sub: mainEx || 'STAY HARD.',
            meta: [
                count > 0 ? `${count} 動作` : null,
                `約 ${time} 分鐘`,
            ].filter(Boolean),
            icon: Dumbbell,
            cta: 'Let\'s Go',
            ctaSub: '開始訓練',
            onCta: onClose,
            statusDot: '#D8F382',
            statusLabel: 'TRAINING DAY',
        };
    }

    // ── 5b. wakeRecovery : 起床 2h 內 + 休息日 ───
    if (phase === 'wakeRecovery' || isRestDay) {
        return {
            tag: 'TODAY\'S PLAN',
            headline: '好好\n休息',
            sub: '肌肉在休息中成長',
            meta: [],
            icon: Moon,
            cta: 'Got It',
            ctaSub: '記得補充水分',
            onCta: onClose,
            statusDot: '#826DEE',
            statusLabel: 'RECOVERY DAY',
        };
    }

    // ── 6. idle : Fallback (依大時段給建議) ─────
    if (hasWorkout) {
        const name = todayWorkout.workout_name || '今日訓練';
        const count = todayWorkout.exercise_count || todayWorkout.exercises?.length || 0;
        const time = todayWorkout.estimated_time || 45;
        const mainEx = todayWorkout.main_exercise || (todayWorkout.exercises?.[0]?.name) || '';
        return {
            tag: 'TODAY\'S TRAINING',
            headline: name,
            sub: mainEx || null,
            meta: [
                count > 0 ? `${count} 動作` : null,
                `約 ${time} 分鐘`,
            ].filter(Boolean),
            icon: Dumbbell,
            cta: 'Let\'s Go',
            ctaSub: '開始訓練',
            onCta: onClose,
            statusDot: '#D8F382',
            statusLabel: 'TRAINING DAY',
        };
    }
    if (hour >= 5 && hour < 12) {
        return {
            tag: 'GOOD MORNING',
            headline: '準備好\n跑步了嗎？',
            sub: null,
            meta: [],
            icon: Footprints,
            cta: 'Start Cardio',
            ctaSub: '前往跑步追蹤',
            onCta: () => { onClose(); navigate('/cardio-tracker-mobile'); },
            statusDot: '#FF99DC',
            statusLabel: 'FREE DAY',
        };
    }
    if (hour >= 12 && hour < 18) {
        return {
            tag: 'THIS AFTERNOON',
            headline: '記得\n記錄飲食',
            sub: '吃對才練得好',
            meta: [],
            icon: UtensilsCrossed,
            cta: 'Log Meals',
            ctaSub: '前往飲食記錄',
            onCta: () => { onClose(); navigate('/nutrition-mobile'); },
            statusDot: '#E9C46A',
            statusLabel: 'FREE DAY',
        };
    }
    return {
        tag: 'THIS EVENING',
        headline: '今天\n辛苦了',
        sub: '明天繼續努力',
        meta: [],
        icon: Moon,
        cta: 'Enter Dashboard',
        ctaSub: null,
        onCta: onClose,
        statusDot: '#826DEE',
        statusLabel: 'FREE DAY',
    };
};

const DailyCheckInModal = ({
    isOpen,
    onClose,
    userName = 'Athlete',
    todayWorkout = null,
    navigate = () => {},
    // ── DRVN Standby Phase 同步輸入 ──
    // 由上層 (App.jsx) 自 HealthBridge 取得後注入
    predictedWorkoutTimes = [],   // Date[] | string[] (ISO)
    lastWorkoutEnd = null,        // Date | string | null
    bedtimeDate = null,           // Date | string | null  (Health 排程睡眠時間)
    wakeUpDate = null,            // Date | string | null  (今日起床時間)
    lastWorkoutType = null,       // 'run' | 'strength' | null — 影響 postWorkout 文案與顏色
}) => {
    if (!isOpen) return null;

    const content = getContent(todayWorkout, navigate, onClose, {
        predictedWorkoutTimes,
        lastWorkoutEnd,
        lastWorkoutType,
        bedtimeDate,
        wakeUpDate,
    });
    const Icon = content.icon;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100000] bg-black/55 backdrop-blur-xl flex items-center justify-center p-6"
                    onClick={onClose}
                    onDoubleClick={onClose}
                >
                    {/* Card */}
                    <motion.div
                        initial={{ scale: 0.93, opacity: 0, y: 24 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.93, opacity: 0, y: 24 }}
                        transition={{ type: 'spring', damping: 26, stiffness: 220 }}
                        onClick={e => e.stopPropagation()}
                        className="relative w-full max-w-[380px] bg-[#F6F4F1] rounded-[28px] overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.25)] flex flex-col"
                        style={{ minHeight: '480px' }}
                    >
                        {/* Background image */}
                        <div className="absolute inset-0 z-0">
                            <img loading="lazy" decoding="async"
                                src="/assets/editorial_fitness_bg_light.jpg"
                                alt=""
                                className="w-full h-full object-cover opacity-85"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#F6F4F1] via-[#F6F4F1]/30 to-transparent" />
                        </div>

                        {/* Top labels */}
                        <div className="absolute top-7 left-7 z-10 flex flex-col gap-0.5">
                            <span className="text-[9px] font-black uppercase tracking-[0.22em] text-[#161415]/50"
                                style={{ fontFamily: '"Tenor Sans", sans-serif' }}>
                                DRVN® MASTER PROGRAM
                            </span>
                            <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#161415]/30"
                                style={{ fontFamily: '"Tenor Sans", sans-serif' }}>
                                {content.tag}
                            </span>
                        </div>
                        <div className="absolute top-7 right-7 z-10 text-right">
                            <span className="text-[18px] font-black italic text-[#161415] leading-none"
                                style={{ fontFamily: '"Tenor Sans", sans-serif' }}>DRVN®</span>
                            <div className="w-6 h-[1px] bg-[#161415]/20 mt-1 ml-auto" />
                        </div>

                        {/* Main content */}
                        <div className="relative z-10 flex flex-col flex-1 px-7 pt-24 pb-7">

                            {/* Headline */}
                            <motion.div
                                initial={{ x: -16, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                transition={{ delay: 0.15 }}
                            >
                                <h1
                                    className="text-[52px] font-black italic text-[#161415] leading-[0.88] tracking-tighter uppercase whitespace-pre-line"
                                    style={{ fontFamily: '"Tenor Sans", sans-serif' }}
                                >
                                    {(() => {
                                        if (typeof content.headline === 'string' && content.headline.includes('—')) {
                                            const [main, sub] = content.headline.split('—');
                                            return (
                                                <>
                                                    {main}—
                                                    <span className="block mt-1" style={{ fontSize: '0.55em', lineHeight: '1.1', opacity: 0.8 }}>
                                                        {sub}
                                                    </span>
                                                </>
                                            );
                                        }
                                        return content.headline;
                                    })()}
                                </h1>
                                {content.sub && (
                                    <p className="mt-3 text-[13px] font-medium text-[#161415]/50 italic"
                                        style={{ fontFamily: '"Tenor Sans", sans-serif' }}>
                                        {content.sub}
                                    </p>
                                )}
                            </motion.div>

                            {/* Meta info (exercise count / time) */}
                            {content.meta.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.3 }}
                                    className="flex gap-5 mt-5"
                                >
                                    {content.meta.map((m, i) => (
                                        <div key={i}>
                                            <span className="block text-[22px] font-black italic text-[#161415] leading-none"
                                                style={{ fontFamily: '"Tenor Sans", sans-serif' }}>{m}</span>
                                        </div>
                                    ))}
                                </motion.div>
                            )}

                            {/* Status row */}
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.35 }}
                                className="flex items-center gap-2 mt-4"
                            >
                                <div
                                    className="w-2 h-2 rounded-full"
                                    style={{ background: content.statusDot, boxShadow: `0 0 6px ${content.statusDot}` }}
                                />
                                <span className="text-[9px] font-black uppercase tracking-[0.22em] text-[#161415]/40"
                                    style={{ fontFamily: '"Tenor Sans", sans-serif' }}>
                                    {content.statusLabel}
                                </span>
                                <span className="text-[9px] font-bold text-[#161415]/20 ml-2 uppercase tracking-widest"
                                    style={{ fontFamily: '"Tenor Sans", sans-serif' }}>
                                    {userName}
                                </span>
                            </motion.div>

                            {/* Spacer */}
                            <div className="flex-1" />

                            {/* CTA buttons */}
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.4 }}
                                className="flex flex-col gap-3"
                            >
                                <motion.button {...pressProps('row')}
 onClick={content.onCta}
 className="w-full bg-[#161415] text-[#F6F4F1] py-4 rounded-[18px] font-black text-[16px] uppercase flex items-center justify-between px-5 shadow-xl"
 style={{ fontFamily: '"Tenor Sans", sans-serif' }}
 >
                                    <span className="flex items-center gap-3">
                                        <Icon size={18} strokeWidth={2.5} />
                                        {content.cta}
                                    </span>
                                    <ArrowRight size={18} strokeWidth={2.5} />
                                </motion.button>

                                <motion.button {...pressProps('row')}
 onClick={onClose}
 className="text-[9px] font-black text-[#161415]/30 uppercase tracking-[0.28em] hover:text-[#161415]/50 transition-colors text-center py-1"
 style={{ fontFamily: '"Tenor Sans", sans-serif' }}
 >
                                    {content.ctaSub || 'Dismiss for now'}
                                </motion.button>
                            </motion.div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default DailyCheckInModal;
