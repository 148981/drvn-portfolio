import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { pressProps } from '../utils/nutritionMotion';
import { epleyE1RM, intensityForReps, bestE1RM as calcBestE1RM } from '../utils/strengthMath';
import { motion, AnimatePresence, Reorder, useDragControls, useMotionValue, animate as fmAnimate } from 'framer-motion';
import { ArrowLeft, Check, SkipForward, Trophy, Trash2, Heart, Clock, Flame, Target, X, Upload, Play, Pause, Zap, TrendingUp, RefreshCw, ArrowRight, Plus, Minus, ChevronLeft, ChevronRight, ChevronDown, Music2, GripVertical, List, Activity, Lightbulb, AlertTriangle, Flag, Watch, Edit3, Sparkles } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import LiveActivityCard from './LiveActivityCard';
import WorkoutAmbientLight from './WorkoutAmbientLight';
import { brandColors as C, brandAlpha as CA } from '../utils/colors';
import { recordWorkoutSaveMoments } from '../utils/momentEngine';
import useHealthKit from '../hooks/useHealthKit';
import useWatchConnection from '../hooks/useWatchConnection';
import GymViewBg from '../assets/GymViewBg.png';
import apiClient, { saveWorkout } from '../api/client';
import { activeStrengthPlanId, recordStrengthPlanDay, readStrengthPlanDays, unrecordStrengthPlanDay } from '../utils/strengthPlanCompletion';
import { getMotivationalMessage, getProgressMessage, getCelebrityQuote, getExerciseTip } from '../utils/motivationalMessages';
import { getRestQuote, getPRQuote } from '../utils/athleteQuotes';
import { getExerciseNameZh } from '../data/exerciseDatabase';
import { checkAchievements, getCompletionMessage, generateStatsSummary } from '../utils/achievements';
import FitnessCompletionCard from './FitnessCompletionCard';
import EvolutionCompletionCard from './EvolutionCompletionCard';
import StrengthResultsMobile from './StrengthResultsMobile';
import StrengthTermsExplainer from './StrengthTermsExplainer';
import { recordWorkoutCompletion } from '../utils/muscleRecoveryTracker';
import { updateChallengeProgress } from '../utils/challengeProgressHelper';
import ChallengeCompletionModal from './ChallengeCompletionModal';
import { findExerciseByName } from '../utils/exerciseDB';
import { ALL_EXERCISES, ALL_EXERCISES_MAP } from '../utils/UnifiedTrainingEngine';
import { getSubstitutes, substituteSubtitle } from '../utils/exerciseSubstitution';
import { toZhExerciseName } from '../utils/exerciseNameZh';
import WorkoutCompleteTransition from './WorkoutCompleteTransition';
import { getUserId } from '../utils/auth';
import { canUse } from '../utils/membership';
import { sessionPrescription } from '../utils/e1rmAdvisor';
import { getTodayReadiness } from '../utils/readiness';
import { defOfExercise } from '../utils/exerciseTaxonomy';
import { reportCollabProgress } from '../utils/reportCollabProgress';
import { uStorage } from '../utils/userStorage';
import {
    unlockRestAudio, playRestEndSound, ensureNotifyPermission, notifyRestEnd,
    requestWakeLock, releaseWakeLock,
} from '../utils/restCues';
import { calcPlates, BAR_OPTIONS } from '../utils/plateMath';
import FreestyleExercisePicker from './FreestyleExercisePicker';
import WorkoutSummaryReviewCard from './WorkoutSummaryReviewCard';
import { closeOrb } from '../utils/aiAnalysisOrb';
import { clearAnalysisJob } from '../utils/analysisJob';
import { haptic } from '../utils/haptics';
import { startGymActivity, updateGymActivity, stopGymActivity } from '../utils/liveActivity';
import { setVolume } from '../utils/strengthMath';
import { mediaUrl } from '../utils/apiHostFix';
import useGymSession from '../hooks/useGymSession';
import GymSessionSheet from './GymSessionSheet';
import { toast as appToast } from '../utils/toast';

// ════════════════════════════════════════
// REST OVERLAY STARRY SKY (High Performance)
// 🔵 Fix (Issue RestStarrySky): 星空陰影字串提升至模組層級，只在檔案載入時計算一次，
// 避免每次 RestStarrySky 重新掛載（每次休息開始）都重新執行隨機運算。
// ════════════════════════════════════════

const _generateStars = (count, baseSize = 1) => {
    const shadows = [];
    const colors = ['246, 244, 241', '207, 198, 184', '249, 92, 75'];
    for (let i = 0; i < count; i++) {
        const x = Math.floor(Math.random() * 1000);
        const y = Math.floor(Math.random() * 1000);
        const size = Math.random() > 0.8 ? baseSize + 1 : baseSize;
        const color = colors[Math.floor(Math.random() * colors.length)];
        const opacity = Math.random() * 0.7 + 0.3;
        const glow = Math.random() > 0.9 ? `, ${x}px ${y}px 4px rgba(${color}, 0.8)` : '';
        shadows.push(`${x}px ${y}px 0 ${size > 1 ? '0.5px' : '0'} rgba(${color}, ${opacity})${glow}`);
    }
    return shadows.join(', ');
};
// 模組層級常數：只計算一次
const _STARS_LAYER1 = _generateStars(150, 1);
const _STARS_LAYER2 = _generateStars(100, 0.5);

const RestStarrySky = () => {
    const starsLayer1 = _STARS_LAYER1;
    const starsLayer2 = _STARS_LAYER2;

    return (
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
            <style>{`
                @keyframes slowTwinkle { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
                /* 帶入下一組後的 coral 發光呼吸邊框 */
                @keyframes drvnAcceptGlow {
                    0%, 100% { box-shadow: 0 0 0 1px rgba(249,92,75,0.25), 0 0 12px rgba(249,92,75,0.18); }
                    50%      { box-shadow: 0 0 0 1px rgba(249,92,75,0.45), 0 0 22px rgba(249,92,75,0.36); }
                }
                .drvn-accept-glow { animation: drvnAcceptGlow 2.2s ease-in-out infinite; }
                @media (prefers-reduced-motion: reduce) { .drvn-accept-glow { animation: none; } }
                @keyframes driftLayer1 { from { transform: translateY(0); } to { transform: translateY(-60px); } }
                @keyframes driftLayer2 { from { transform: translateY(0); } to { transform: translateY(-30px); } }
                @keyframes shootingStar {
                    0% { transform: translateX(0) translateY(0) rotate(-45deg) scale(0); opacity: 1; }
                    70% { opacity: 1; }
                    100% { transform: translateX(-500px) translateY(500px) rotate(-45deg) scale(1); opacity: 0; }
                }
            `}</style>
            
            {/* 🌠 Shooting Stars Removed for a cleaner look */}

            <div style={{ position: 'absolute', inset: 0, width: '1px', height: '1px', borderRadius: '50%', background: 'transparent', boxShadow: starsLayer2, animation: 'slowTwinkle 7s infinite ease-in-out, driftLayer2 120s infinite linear' }} />
            <div style={{ position: 'absolute', inset: 0, width: '1.5px', height: '1.5px', borderRadius: '50%', background: 'transparent', boxShadow: starsLayer1, animation: 'slowTwinkle 4s infinite ease-in-out, driftLayer1 80s infinite linear' }} />
        </div>
    );
};



// ── 氛圍燈背景 ──
const RestAmbientGlow = () => (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        {/* 深紫色星雲 */}
        <motion.div
            animate={{
                x: [-100, 100, -100],
                y: [-50, 150, -50],
                scale: [1, 1.2, 1]
            }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="absolute -top-[20%] -left-[20%] w-[100%] h-[100%] rounded-full opacity-30"
            style={{ background: 'radial-gradient(circle, #5D3FD3 0%, transparent 70%)', filter: 'blur(80px)' }}
        />
        {/* 珊瑚色微光 (與品牌色呼應) */}
        <motion.div
            animate={{
                x: [100, -50, 100],
                y: [100, -100, 100],
                scale: [1.2, 1, 1.2]
            }}
            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
            className="absolute -bottom-[10%] -right-[10%] w-[80%] h-[80%] rounded-full opacity-20"
            style={{ background: 'radial-gradient(circle, #F95C4B 0%, transparent 70%)', filter: 'blur(100px)' }}
        />
    </div>
);

// ════════════════════════════════════════
// 🎵 WORKOUT MUSIC PROGRESS BAR (SonicFocus Integration)
// ════════════════════════════════════════
const useSonicPlayback = () => {
    const [playback, setPlayback] = useState(() => {
        try { return JSON.parse(localStorage.getItem('sonicfocus_playback') || '{}'); } catch { return {}; }
    });

    useEffect(() => {
        const updateState = () => {
            try { setPlayback(JSON.parse(localStorage.getItem('sonicfocus_playback') || '{}')); } catch { setPlayback({}); }
        };
        
        // 監聽原生 storage (跨 Tab) 與自訂事件 (同 Tab)
        window.addEventListener('storage', updateState);
        window.addEventListener('sonicfocus-update', updateState);
        
        return () => {
            window.removeEventListener('storage', updateState);
            window.removeEventListener('sonicfocus-update', updateState);
        };
    }, []);
    return playback;
};

const PLATFORM_COLORS = { spotify: '#1DB954', apple: '#FC3C44', other: '#F95C4B' };

// Mini spinning vinyl disc (replicates SonicFocus disc aesthetic at small scale)
const MiniVinylDisc = ({ img, isPlaying, platformColor }) => (
    <motion.div
        animate={{ rotate: isPlaying ? [0, 360] : 0 }}
        transition={{ repeat: Infinity, duration: 8, ease: 'linear' }}
        className="w-10 h-10 rounded-full overflow-hidden relative flex-shrink-0 flex items-center justify-center"
        style={{
            backgroundColor: img ? 'transparent' : '#262523',
            border: `1.5px solid ${isPlaying ? platformColor : 'rgba(0,0,0,0.08)'}`,
        }}
    >
        {img ? (
            <img loading="lazy" decoding="async" src={img} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
            <>
                <div className="absolute inset-0 bg-[#262523]" />
                <div className="absolute inset-0 opacity-10 bg-[conic-gradient(from_0deg,transparent_0deg,white_45deg,transparent_90deg,transparent_180deg,white_225deg,transparent_270deg)]" />
                <div className="absolute inset-0 rounded-full border border-white/5" />
                <div className="absolute inset-1 rounded-full border border-white/5" />
                <div className="absolute inset-2 rounded-full border border-white/5" />
                <div className="absolute inset-0 rounded-full" style={{ boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8)' }} />
            </>
        )}
        {/* Centre hole */}
        <div className="w-3 h-3 rounded-full bg-black/20 border border-white/10 z-10 relative flex items-center justify-center">
            <div className="w-1.5 h-1.5 bg-[#F6F4F1] rounded-full" />
        </div>
    </motion.div>
);

// Integrated Music + Progress Bar
// 🆕 hideProgress：自由訓練（邊做邊填）沒有「總進度」概念 → 不畫總進度條與 %；
//    有音樂時只保留唱片 + 曲名，沒音樂時整條不渲染。
const WorkoutMusicProgressBar = ({ progress, hideProgress = false }) => {
    const playback = useSonicPlayback();
    const isWorkoutMusicDisabled = localStorage.getItem('disable_workout_music') === '1';
    const hasMusic = !isWorkoutMusicDisabled && playback?.isPlaying && playback?.title;
    const themeColor = '#161415'; // 統一改為深黑色系

    if (hideProgress && !hasMusic) return null;

    return (
        <div className="mb-2">
            <AnimatePresence mode="wait">
                {hasMusic ? (
                    // ── Music mode: vinyl + waveform + title + bar ──
                    <motion.div
                        key="music"
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        className="flex items-center gap-3 cursor-pointer"
                        onClick={() => playback.url && window.open(playback.url, '_blank')}
                    >
                        {/* Spinning vinyl */}
                        <MiniVinylDisc img={playback.img} isPlaying={true} platformColor={themeColor} />

                        {/* Centre: waveform + title + bar */}
                        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                            {/* Top row: waveform bars + title */}
                            <div className="flex items-center gap-2">
                                {/* Animated waveform */}
                                <div className="flex items-end gap-[2px] h-4 flex-shrink-0">
                                    {[0.6, 1, 0.7, 1.3, 0.5, 1.1, 0.8].map((h, i) => (
                                        <motion.div
                                            key={i}
                                            animate={{ scaleY: [h, h * 0.3, h] }}
                                            transition={{ duration: 0.6 + i * 0.1, repeat: Infinity, ease: 'easeInOut' }}
                                            className="w-[2px] rounded-full origin-bottom"
                                            style={{ height: `${h * 14}px`, background: themeColor }}
                                        />
                                    ))}
                                </div>
                                {/* Track title */}
                                <span
                                    className="text-[17px] truncate leading-none"
                                    style={{ color: '#161415', fontFamily: "'Tenor Sans', sans-serif", fontWeight: 600, fontStyle: 'italic', marginTop: '2px' }}
                                >
                                    {playback.title}
                                </span>
                            </div>

                            {/* Progress bar - 深黑金屬質感（自由訓練隱藏） */}
                            {!hideProgress && (
                            <div className="w-full h-1.5 bg-black/5 rounded-full overflow-hidden relative">
                                <motion.div
                                    className="h-full rounded-full relative overflow-hidden"
                                    style={{
                                        background: '#F95C4B',
                                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), 0 1px 3px rgba(249,92,75,0.4)'
                                    }}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    transition={{ duration: 0.5, ease: 'easeOut' }}
                                >
                                    {/* Pulse Wave Glint */}
                                    <motion.div
                                        animate={{ x: ['-100%', '200%'] }}
                                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                        className="absolute inset-0 w-full h-full"
                                        style={{
                                            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0) 30%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0) 70%, transparent 100%)',
                                        }}
                                    />
                                </motion.div>
                            </div>
                            )}
                        </div>

                        {/* Right: progress % （自由訓練隱藏） */}
                        {!hideProgress && (
                        <span className="text-sm font-medium flex-shrink-0" style={{ color: '#161415' }}>
                            {Math.round(progress)}%
                        </span>
                        )}
                    </motion.div>
                ) : (
                    // ── No music mode: plain progress bar ──
                    <motion.div
                        key="plain"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <div className="flex justify-end items-center mb-1.5 px-1">
                            <span className="text-[#161415] text-sm font-medium">
                                {Math.round(progress)}%
                            </span>
                        </div>
                        <div className="w-full h-1.5 bg-black/5 rounded-full overflow-hidden relative">
                            <motion.div
                                className="h-full rounded-full relative overflow-hidden"
                                style={{ 
                                    background: '#F95C4B',
                                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), 0 1px 3px rgba(249,92,75,0.4)'
                                }}
                                initial={{ width: 0 }}
                                animate={{ width: `${progress}%` }}
                                transition={{ duration: 0.5, ease: 'easeOut' }}
                            >
                                {/* Pulse Wave Glint */}
                                <motion.div 
                                    animate={{ x: ['-100%', '200%'] }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                    className="absolute inset-0 w-full h-full"
                                    style={{
                                        background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0) 30%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0) 70%, transparent 100%)',
                                    }}
                                />
                            </motion.div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};


// Dark mode chip for the rest starry-sky overlay
const RestMusicChip = () => {
    const playback = useSonicPlayback();
    const isWorkoutMusicDisabled = localStorage.getItem('disable_workout_music') === '1';
    if (isWorkoutMusicDisabled || !playback?.isPlaying || !playback?.title) return null;
    const platformColor = PLATFORM_COLORS[playback?.platform] || PLATFORM_COLORS.other;
    return (
        <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="relative z-10 w-full flex items-center justify-center gap-3 py-2 cursor-pointer"
            onClick={() => playback.url && window.open(playback.url, '_blank')}
        >
            <MiniVinylDisc img={playback.img} isPlaying={true} platformColor={platformColor} />
            <div className="flex items-center gap-2 min-w-0">
                <div className="flex items-end gap-[2px] h-4 flex-shrink-0">
                    {[0.6, 1, 0.7, 1.3, 0.5, 1.1, 0.8].map((h, i) => (
                        <motion.div
                            key={i}
                            animate={{ scaleY: [h, h * 0.3, h] }}
                            transition={{ duration: 0.6 + i * 0.1, repeat: Infinity, ease: 'easeInOut' }}
                            className="w-[2px] rounded-full origin-bottom"
                            style={{ height: `${h * 12}px`, background: platformColor }}
                        />
                    ))}
                </div>
                <span className="text-sm font-bold truncate text-white/80">{playback.title}</span>
            </div>
        </motion.div>
    );
};


// =====================================================
const triggerHaptic = (type = 'medium') => haptic(type);

// =====================================================
// 🔥 ENHANCED COMPLETE SET BUTTON
// =====================================================
const CompleteSetButton = ({ onPress, onHoldEnd, currentSet, totalSets, warmupSets = 0, openEnded = false }) => {
    const [isPressed, setIsPressed] = useState(false);
    const [showRipple, setShowRipple] = useState(false);
    const [ripplePos, setRipplePos] = useState({ x: 0, y: 0 });
    const [justCompleted, setJustCompleted] = useState(false);

    // 🔥 HOLD-TO-END LOGIC
    // 長按 ~1.4s → 環繞按鈕的光暈進度條 0→100%，滿了觸發「結束今日訓練」確認視窗。
    // 中途放開 → 光暈倒退歸零並取消（可逆）。短點放開 → 記錄這組。
    const HOLD_MS = 1400;            // 長按結束訓練門檻
    const [isHolding, setIsHolding] = useState(false);
    const [holdProgress, setHoldProgress] = useState(0);   // 0..1 光暈填充
    const holdRaf = useRef(null);
    const holdStart = useRef(0);
    const holdFired = useRef(false);
    const pressStartTs = useRef(0);
    const milestoneRef = useRef(0);  // 觸覺里程碑

    const cancelHoldLoop = () => {
        if (holdRaf.current) { cancelAnimationFrame(holdRaf.current); holdRaf.current = null; }
    };

    // 放開後讓光暈平滑倒退歸零
    const drainHold = () => {
        cancelHoldLoop();
        const drainStart = performance.now();
        const startVal = holdProgress;
        const step = (now) => {
            const t = (now - drainStart) / 320;          // 320ms 收回
            const v = Math.max(0, startVal * (1 - t));
            setHoldProgress(v);
            if (v > 0.001) holdRaf.current = requestAnimationFrame(step);
            else { setHoldProgress(0); holdRaf.current = null; }
        };
        holdRaf.current = requestAnimationFrame(step);
    };

    const startPress = (e) => {
        setIsPressed(true);
        setIsHolding(true);
        holdFired.current = false;
        milestoneRef.current = 0;
        pressStartTs.current = performance.now();
        holdStart.current = performance.now();
        triggerHaptic('medium'); // 按下瞬間即時震動

        cancelHoldLoop();
        const loop = (now) => {
            const p = Math.min(1, (now - holdStart.current) / HOLD_MS);
            setHoldProgress(p);
            // 每 25% 給一下漸強觸覺，營造「蓄力」感
            const ms = Math.floor(p * 4);
            if (ms > milestoneRef.current) { milestoneRef.current = ms; triggerHaptic('tap'); }
            if (p >= 1) {
                if (!holdFired.current) {
                    holdFired.current = true;
                    triggerHaptic('heavy');
                    onHoldEnd && onHoldEnd();      // 觸發結束訓練確認視窗
                }
                cancelHoldLoop();
                return;
            }
            holdRaf.current = requestAnimationFrame(loop);
        };
        holdRaf.current = requestAnimationFrame(loop);
    };

    const endPress = (e) => {
        cancelHoldLoop();
        const heldMs = performance.now() - pressStartTs.current;
        setIsPressed(false);
        setIsHolding(false);

        if (holdFired.current) {
            // 已觸發結束訓練：直接收回光暈，不記錄
            drainHold();
            return;
        }
        // 中途放開（可逆）：光暈倒退歸零
        drainHold();
        // 短點（明顯小於門檻）→ 記錄這組
        if (heldMs < 350) {
            handleClick(e);
        }
    };

    const handleClick = (e) => {
        // Ripple effect position
        const clientX = e.clientX || (e.touches && e.touches[0]?.clientX);
        const clientY = e.clientY || (e.touches && e.touches[0]?.clientY);

        if (clientX && clientX > 0) {
            const rect = e.currentTarget.getBoundingClientRect();
            setRipplePos({
                x: clientX - rect.left,
                y: clientY - rect.top
            });
            setShowRipple(true);
            setTimeout(() => setShowRipple(false), 600);
        }

        // Trigger haptic — 短按放開：二段式震動確認感
        triggerHaptic('tap');

        // Visual feedback sequence
        setJustCompleted(true);
        setTimeout(() => setJustCompleted(false), 800);

        // Call parent handler
        onPress({ isFastLog: false });
    };

    return (
        <div className="relative w-full">
        {/* 🔆 長按光暈環：環繞按鈕外緣描邊，0→100% 繞一圈；放開可逆地收回 */}
        {holdProgress > 0.001 && (
            <div
                className="absolute pointer-events-none z-30"
                style={{
                    inset: '-7px',
                    borderRadius: '9999px',
                    // 外圈柔光暈
                    boxShadow: `0 0 ${10 + holdProgress * 26}px ${holdProgress * 8}px rgba(255,170,150,${0.25 + holdProgress * 0.45})`,
                    opacity: Math.min(1, holdProgress * 1.4 + 0.2),
                    transition: 'none',
                }}
            >
                <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                    {/* 描邊軌道（淡） */}
                    <rect x="2" y="2" width="96" height="96" rx="48" ry="48"
                        fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="2.4" vectorEffect="non-scaling-stroke" />
                    {/* 進度描邊（亮），用 pathLength=1 讓 dasharray 與長寬比無關 */}
                    <rect x="2" y="2" width="96" height="96" rx="48" ry="48"
                        fill="none" stroke="#FFE9E2" strokeWidth="3" strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                        pathLength="1"
                        strokeDasharray="1"
                        strokeDashoffset={1 - holdProgress}
                        style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', filter: 'drop-shadow(0 0 4px rgba(255,210,196,0.9))' }}
                    />
                </svg>
            </div>
        )}
        <motion.button
            onMouseDown={startPress}
            onMouseUp={endPress}
            onMouseLeave={endPress}
            onTouchStart={startPress}
            onTouchEnd={endPress}
            animate={isPressed ? { scale: 0.94 } : { scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className="relative isolate w-full overflow-hidden rounded-full transition-transform touch-none"
            style={{
                /* 與 styles/liquid-glass.css 的 .lg-btn--coral 同一階濃度 ——
                   這顆是「完成本組」，全站最常按的那一顆，它定調了珊瑚長什麼樣，
                   所以兩邊必須同步。改濃度時兩個地方一起改。 */
                background: justCompleted
                    ? 'rgba(217, 64, 48, 0.95)' // Ember：已完成的瞬間才用深色
                    : 'var(--lg-coral-grad)',
                boxShadow: justCompleted ? [
                    'inset 0 1px 1px rgba(255,255,255,0.4)',
                    'inset 0 0 0 1px rgba(255,255,255,0.2)',
                    '0 6px 18px rgba(217,64,48,0.24)',
                ].join(', ') : [
                    'inset 0 1px 0 rgba(255,255,255,0.70)',
                    '0 8px 22px -10px rgba(249,92,75,0.26)',
                ].join(', '),
                transition: 'background 0.4s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.4s ease',
                minHeight: '72px',
                border: '1px solid rgba(255,255,255,0.45)',
            }}
        >
            {/* ✨ 鏡面高光弧：liquid glass 招牌頂部反光 */}
            {!justCompleted && (
                <div
                    className="absolute inset-x-0 top-0 h-1/2 pointer-events-none z-[1]"
                    style={{
                        background: 'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.03) 55%, transparent 100%)',
                        borderRadius: '9999px 9999px 50% 50%',
                        mixBlendMode: 'screen',
                    }}
                />
            )}
            {/* Ambient subtle glow inside the button */}
            {!justCompleted && (
                <motion.div
                    className="absolute inset-0 pointer-events-none rounded-full"
                    style={{
                        background: 'radial-gradient(ellipse at top, rgba(255,255,255,0.08) 0%, transparent 60%)',
                        mixBlendMode: 'screen',
                    }}
                    animate={{ opacity: [0.5, 0.8, 0.5] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                />
            )}
            {/* 🌟 長按蓄力：按鈕內由下往上的亮光填充，隨 holdProgress 上升/收回 */}
            {holdProgress > 0.001 && (
                <div
                    className="absolute inset-x-0 bottom-0 pointer-events-none z-[2] rounded-full"
                    style={{
                        height: `${holdProgress * 100}%`,
                        background: 'linear-gradient(0deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.12) 70%, transparent 100%)',
                        mixBlendMode: 'screen',
                        transition: 'none',
                    }}
                />
            )}
            {/* 接近完成時整顆按鈕加亮，暗示「就要結束訓練」 */}
            {holdProgress > 0.001 && (
                <div
                    className="absolute inset-0 pointer-events-none z-[2] rounded-full"
                    style={{
                        background: `rgba(255,255,255,${holdProgress * 0.18})`,
                        mixBlendMode: 'screen',
                    }}
                />
            )}

            <div className="relative z-10 flex items-center justify-center gap-3 py-5 px-6">
                <AnimatePresence mode="wait">
                    {justCompleted ? (
                        <motion.div
                            key="completed"
                            initial={{ scale: 0, rotate: -180 }}
                            animate={{ scale: 1, rotate: 0 }}
                            exit={{ scale: 0 }}
                            transition={{ type: "spring", stiffness: 400, damping: 15 }}
                            className="flex items-center gap-2"
                        >
                            <Check size={22} strokeWidth={2.2} style={{ color: '#F95C4B' }} />
                            <span
                                style={{
                                    color: '#F6F4F1',
                                    fontSize: 18,
                                    fontWeight: 500,
                                    letterSpacing: '0.04em',
                                    fontFamily: '"Tenor Sans", "Geist", sans-serif',
                                }}
                            >
                                做得好
                            </span>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="ready"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="flex items-center gap-3"
                        >
                            <motion.div animate={{ rotate: [0, 5, -5, 0] }} transition={{ duration: 0.4, repeat: Infinity, repeatDelay: 2 }}>
                                <Check size={26} strokeWidth={3} style={{ color: '#F6F4F1' }} />
                            </motion.div>
                            <div className="text-left">
                                <div
                                    className="uppercase"
                                    style={{
                                        color: '#F6F4F1',
                                        fontSize: 18,
                                        fontWeight: 500,
                                        letterSpacing: '0.04em',
                                        lineHeight: 1,
                                        fontFamily: '"Tenor Sans", "Geist", sans-serif',
                                    }}
                                >
                                    完成本組
                                </div>
                                {/* 🩹 這行原本永遠顯示「第 N 組 / M」—— 與頁首右上角、
                                    以及右側進度環的數字完全相同，同一畫面出現三次。
                                    只保留頁首沒有的資訊（邊做邊填）；暖身有自己的說明卡。 */}
                                {openEnded && (
                                    <div
                                        className="uppercase mt-1"
                                        style={{
                                            color: 'rgba(246,244,241,0.6)',
                                            fontSize: 9,
                                            letterSpacing: '0.22em',
                                            fontFamily: '"Geist Mono", monospace',
                                            fontWeight: 500,
                                        }}
                                    >
                                        {`第 ${currentSet - warmupSets} 組 · 邊做邊填`}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="absolute right-5 top-1/2 -translate-y-1/2">
                <svg width="40" height="40" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(246,244,241,0.15)" strokeWidth="3" />
                    <motion.circle
                        cx="18" cy="18" r="14" fill="none" stroke={justCompleted ? "rgba(249,92,75,0.8)" : "#F6F4F1"} strokeWidth="3" strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 14}`} initial={{ strokeDashoffset: 2 * Math.PI * 14 }}
                        animate={{ strokeDashoffset: 2 * Math.PI * 14 * (1 - (currentSet - 1) / Math.max(totalSets, 1)) }}
                        style={{ transform: 'rotate(-90deg)', transformOrigin: '18px 18px' }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                    {/* 🩹 環內數字已移除 —— 與頁首右上角的「第 N 組 / M」重複。
                        進度用弧線表達就夠，暖身狀態由暖身說明卡負責。 */}
                </svg>
            </div>
        </motion.button>
        {/* 長按提示：蓄力時顯示「持續按住結束今日訓練」 */}
        <AnimatePresence>
            {isHolding && holdProgress > 0.05 && !justCompleted && (
                <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    className="absolute left-1/2 -translate-x-1/2 -top-7 pointer-events-none z-30 whitespace-nowrap"
                    style={{
                        fontSize: 12, letterSpacing: '0.22em', fontWeight: 700,
                        color: 'rgba(255,255,255,0.95)', textTransform: 'uppercase',
                        fontFamily: '"Geist Mono", monospace',
                        textShadow: '0 1px 6px rgba(0,0,0,0.35)',
                    }}
                >
                    {holdProgress >= 0.999 ? '放開結束今日訓練' : '持續按住結束今日訓練'}
                </motion.div>
            )}
        </AnimatePresence>
        </div>
    );
};

// =====================================================
// NO-IMAGE PLACEHOLDER — Charcoal Liquid Glass, lucide icon (無 emoji)
// =====================================================
const ExercisePlaceholder = ({ exerciseName, category }) => {
    const categoryIcons = {
        'PUSH':      Dumbbell,
        'PULL':      Activity,
        'LEGS':      Activity,
        'CHEST':     Target,
        'BACK':      Activity,
        'SHOULDERS': Zap,
        'ARMS':      Dumbbell,
        'CORE':      Flame,
        'CARDIO':    Heart,
        'STRENGTH':  Dumbbell,
        'default':   Dumbbell,
    };

    const IconCmp = categoryIcons[category?.toUpperCase()] || categoryIcons.default;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-full aspect-[4/3] max-h-[55dvh] rounded-3xl overflow-hidden flex flex-col items-center justify-center"
            style={{
                background: 'rgba(246,244,241,0.04)',
                border: '1px solid rgba(246,244,241,0.08)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 12px 32px rgba(0,0,0,0.35)',
            }}
        >
            {/* Icon — float gently */}
            <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
                className="mb-5"
                style={{ color: 'rgba(246,244,241,0.35)' }}
            >
                <IconCmp size={64} strokeWidth={1.2} />
            </motion.div>

            {/* Exercise Name */}
            <div className="text-center px-6">
                <div
                    className="uppercase mb-2"
                    style={{
                        color: 'rgba(246,244,241,0.4)',
                        fontSize: 9,
                        letterSpacing: '0.28em',
                        fontFamily: '"Geist Mono", monospace',
                        fontWeight: 500,
                    }}
                >
                    {category || 'Exercise'}
                </div>
                <h2
                    className="leading-[1.05]"
                    style={{
                        color: '#F6F4F1',
                        fontSize: 24,
                        fontWeight: 400,
                        letterSpacing: '-0.01em',
                        fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif',
                    }}
                >
                    {exerciseName}
                </h2>
            </div>
        </motion.div>
    );
};

// =====================================================

// ── muscle label helpers ──────────────────────────────────────
// Chinese exercise name → body-part label (module-level so all components can use it)
// copy-rules: allow-long — 以下是動作名稱查表的 key，不是畫面上的文案。
// 這張表和 CHINESE_EXERCISE_MAP 本來就共用同一批動作名，R7 的「重複」是誤判。
const ZH_NAME_TO_PART = {
    // 胸
    '臥推':'胸','上斜臥推':'胸','下斜臥推':'胸','槓鈴臥推':'胸','啞鈴臥推':'胸',
    '上斜啞鈴臥推':'胸','夾胸':'胸','滑輪夾胸':'胸','蝴蝶機夾胸':'胸','啞鈴飛鳥':'胸',
    '上斜啞鈴飛鳥':'胸','伏地挺身':'胸','雙槓撐體':'胸','低位繩索夾胸':'胸','高位繩索夾胸':'胸',
    // 背
    '硬舉':'背','羅馬尼亞硬舉':'背','引體向上':'背','滑輪下拉':'背','坐姿划船':'背',
    '槓鈴划船':'背','啞鈴划船':'背','單臂啞鈴划船':'背','T槓划船':'背','直臂下拉':'背',
    '背部伸展':'背','寬握引體向上':'背',
    // 肩
    '肩推':'肩','槓鈴肩推':'肩','啞鈴肩推':'肩','阿諾肩推':'肩','側平舉':'肩',
    '啞鈴側平舉':'肩','前平舉':'肩','俯身側平舉':'肩','俯身飛鳥':'肩','面拉':'肩',
    '反向飛鳥':'肩','聳肩':'肩',
    // 二頭
    '彎舉':'二頭','槓鈴彎舉':'二頭','啞鈴彎舉':'二頭','EZ槓彎舉':'二頭','EZ 槓彎舉':'二頭',
    '鎚式彎舉':'二頭','錘式彎舉':'二頭','集中彎舉':'二頭','滑輪彎舉':'二頭','牧師椅彎舉':'二頭',
    // 三頭
    '三頭下壓':'三頭','滑輪三頭下壓':'三頭','法式推舉':'三頭','頭後臂屈伸':'三頭',
    '窄握臥推':'三頭','繩索下壓':'三頭','過頭三頭伸展':'三頭','反握下壓':'三頭',
    // 腿
    '深蹲':'腿','槓鈴深蹲':'腿','背蹲':'腿','前蹲':'腿','哈克深蹲':'腿','腿推':'腿',
    '腿伸展':'腿','腿彎舉':'腿','俯臥腿彎舉':'腿','坐姿腿彎舉':'腿','弓步蹲':'腿',
    '保加利亞蹲':'腿','直腿硬舉':'腿','腿外展':'腿','腿內收':'腿',
    // 臀
    '臀推':'臀','臀橋':'臀',
    // 小腿
    '小腿提踵':'小腿','站立提踵':'小腿','坐姿提踵':'小腿',
    // 核心
    '捲腹':'核心','仰臥起坐':'核心','平板支撐':'核心','棒式':'核心','側棒式':'核心',
    '俄羅斯轉體':'核心','懸掛抬腿':'核心','登山式':'核心','腹輪':'核心',
};
// copy-rules: end

const MUSCLE_ENG_TO_ZH = {
    chest:'胸', back:'背', shoulders:'肩', arms:'手臂', legs:'腿', core:'核心',
    biceps:'二頭', triceps:'三頭', glutes:'臀', hamstrings:'腿後側', quads:'腿前側', calves:'小腿',
};
// 部位圓點色 —— 收斂到 DRVN 調色盤（原本用 Tailwind 霓虹紅/青/紫/黃，違反色票）
const PART_DOT = {
    胸:'#F95C4B', 背:'#5B7183', 肩:'#C68E5D', 手臂:'#8B7F72', 腿:'#5A7A3A',
    核心:'#8F9E8B', 二頭:'#8B7F72', 三頭:'#A09384', 臀:'#C68E5D', 腿後側:'#5A7A3A',
    腿前側:'#5A7A3A', 小腿:'#8F9E8B',
};
const getMuscleLabel = (ex) => {
    // 1. Chinese name lookup (most reliable for Chinese-named exercises)
    if (ex.name && ZH_NAME_TO_PART[ex.name]) return ZH_NAME_TO_PART[ex.name];
    // 2. Keyword scan on name (partial match)
    const n = ex.name || '';
    if (/臥推|夾胸|飛鳥|伏地挺身/.test(n)) return '胸';
    if (/引體|划船|下拉|硬舉/.test(n)) return '背';
    if (/肩推|側平舉|面拉|聳肩/.test(n)) return '肩';
    if (/彎舉/.test(n)) return '二頭';
    if (/三頭|下壓|法式|窄握/.test(n)) return '三頭';
    if (/深蹲|腿推|腿舉|弓步|保加利亞/.test(n)) return '腿';
    if (/臀推|臀橋/.test(n)) return '臀';
    if (/提踵/.test(n)) return '小腿';
    if (/捲腹|棒式|平板|核心/.test(n)) return '核心';
    // 2b. 🩹 英文動作名關鍵字推斷 —— 在信任可能錯誤的 category 之前先猜。
    //     這是圖三 Reverse Pec Deck 顯示 CORE 的修法：category 髒也不會標錯部位。
    const en = `${ex.name || ''} ${ex.nameEn || ''}`.toLowerCase();
    if (/reverse pec|rear delt|face pull|lateral raise|front raise|shoulder press|overhead press|upright row|delt/.test(en)) return '肩';
    if (/bench|chest|pec deck|fly|dip|push[\s-]?up/.test(en)) return '胸';
    if (/row|pull[\s-]?up|chin[\s-]?up|pulldown|lat|deadlift|pull apart|shrug/.test(en)) return '背';
    if (/curl/.test(en)) return '二頭';
    if (/tricep|pushdown|extension|close grip/.test(en)) return '三頭';
    if (/squat|lunge|leg press|leg curl|leg extension|calf|hamstring|quad/.test(en)) return '腿';
    if (/hip thrust|glute/.test(en)) return '臀';
    if (/plank|crunch|sit[\s-]?up|oblique|\bab\b|core/.test(en)) return '核心';
    // 3. English muscle field
    const raw = ex.muscle || ex.category || ex.day_focus || '';
    return MUSCLE_ENG_TO_ZH[raw.toLowerCase()] || MUSCLE_ENG_TO_ZH[raw] || (raw && raw !== 'STRENGTH' && raw !== 'strength' ? raw.slice(0, 3) : null) || null;
};
const muscleDotColor = (label) => PART_DOT[label] || '#9CA3AF';

// ── 即時監測：已記錄各組數據晶片（可點擊 +/− 即時微調） ──────────
//    on light: 灰底晶片；on dark(current)：玻璃晶片。點數字直接 step 修改。
//    無「剩餘組位」ghost：邊做邊填做完一組就選下一個，不預先畫空位。
const LoggedSetChips = ({ ex, globalIdx, onUpdateLoggedSets, dark = false }) => {
    // 🩹 保留原始索引：logged 是過濾後的清單，之前把過濾後的 index 直接寫回
    //    ex.sets，只要中間有一組沒紀錄，改的就是別組。
    const logged = (ex.sets || [])
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s && (s.completed || s.weight != null || s.reps != null));
    const [openIdx, setOpenIdx] = useState(-1);              // 展開中的原始索引
    const [draft, setDraft] = useState({ weight: '', reps: '' });
    // 🩹 面板原本是 absolute 掛在 chip 底下，被外層 .lg-glass 的
    //    `isolation:isolate` ＋ `.lg-glass > * { z-index:1 }` 關在「本次進度」那格的
    //    堆疊脈絡裡 —— z-index 開再高也蓋不過後面的「組數 SETS」。
    //    改成 portal 掛到 document.body + position:fixed，才是真正的最上層。
    const [anchor, setAnchor] = useState(null);              // { top, left, openUp }
    if (logged.length === 0) return null;

    const editable = typeof onUpdateLoggedSets === 'function';

    const write = (setIdx, field, val) => {
        const base = ex.sets || [];
        onUpdateLoggedSets?.(globalIdx, base.map((s, si) => (si === setIdx ? { ...s, [field]: val } : s)));
    };
    // PANEL_H = 內距 24 + 兩列 32×2 + 三段 gap 8×2 + 完成鍵 34 ≈ 138，抓 150 當安全值
    const PANEL_W = 250, PANEL_H = 150, GAP = 6, EDGE = 10;
    const openChip = (i, set, el) => {
        const r = el.getBoundingClientRect();
        const openUp = r.bottom + GAP + PANEL_H > window.innerHeight - EDGE;
        setAnchor({
            top: openUp ? Math.max(EDGE, r.top - GAP - PANEL_H) : r.bottom + GAP,
            left: Math.min(Math.max(EDGE, r.left), window.innerWidth - PANEL_W - EDGE),
        });
        setOpenIdx(i);
        setDraft({ weight: String(set.weight ?? 0), reps: String(set.reps ?? 0) });
    };
    const closeChip = () => { setOpenIdx(-1); setAnchor(null); };
    // 直接打字改：只留數字與一個小數點，邊打邊寫回，不用另外按確認
    const typeField = (i, f, raw) => {
        const clean = String(raw).replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1').slice(0, 6);
        setDraft(d => ({ ...d, [f]: clean }));
        write(i, f, clean === '' ? 0 : (parseFloat(clean) || 0));
    };
    const stepField = (i, f, delta) => {
        const next = Math.max(0, +(((parseFloat(draft[f]) || 0) + delta).toFixed(1)));
        setDraft(d => ({ ...d, [f]: String(next) }));
        write(i, f, next);
    };

    const chipBg   = dark ? 'rgba(255,255,255,0.10)' : 'rgba(22,20,21,0.05)';
    const chipBd   = dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(22,20,21,0.10)';
    const numColor = dark ? 'rgba(255,255,255,0.92)' : '#161415';
    const subColor = dark ? 'rgba(255,255,255,0.42)' : 'rgba(22,20,21,0.4)';
    const miniBtn  = {
        width: 32, height: 32, borderRadius: 9, flexShrink: 0,
        border: '1px solid rgba(22,20,21,0.12)', background: '#fff', color: '#161415',
        fontSize: 17, lineHeight: 1, cursor: 'pointer',
    };

    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }} onClick={e => e.stopPropagation()}>
            {logged.map(({ s: set, i: realIdx }) => {
                const isOpen = editable && openIdx === realIdx;
                return (
                    <div key={realIdx} style={{ position: 'relative' }}>
                        <motion.button {...pressProps('row')}
                            disabled={!editable}
                            aria-label={`修改第 ${set.set_number || realIdx + 1} 組`}
                            onClick={(e) => { if (!editable) return; isOpen ? closeChip() : openChip(realIdx, set, e.currentTarget); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px 4px 9px',
                                borderRadius: 9, border: chipBd, background: chipBg,
                                cursor: editable ? 'pointer' : 'default',
                            }}>
                            <span style={{ fontFamily: '"Geist Mono", monospace', fontSize: 11, color: subColor }}>#{set.set_number || realIdx + 1}</span>
                            <span style={{ fontFamily: '"Tenor Sans","Noto Sans TC",sans-serif', fontSize: 12, color: numColor, letterSpacing: '-0.01em' }}>
                                {(set.weight ?? 0)}<span style={{ fontSize: 11, color: subColor }}>kg</span> · {(set.reps ?? 0)}<span style={{ fontSize: 11, color: subColor }}>次</span>
                            </span>
                            {/* 🖊 可點的證據：沒有這顆，使用者不會知道這些數字能改 */}
                            {editable && <Edit3 size={11} strokeWidth={2.2} style={{ color: subColor, marginLeft: 1, flexShrink: 0 }} />}
                        </motion.button>

                        {/* 展開 → 就地改重量／次數：可直接打字，也可 +/− 微調。
                            🩹 原本 left:50% + translateX(-50%) 置中在 chip 上：chip 靠左時
                               整個面板被容器切掉；bottom:100% 往上彈又會蓋住上面的卡片。
                               改成貼齊 chip 左緣、往下展開、寬度不超過容器。 */}
                        {isOpen && anchor && createPortal(
                            <>
                            {/* 點面板以外的地方就收起來 */}
                            <div onClick={closeChip} style={{ position: 'fixed', inset: 0, zIndex: 2147483000 }} />
                            <div style={{
                                position: 'fixed', top: anchor.top, left: anchor.left,
                                zIndex: 2147483001, display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 14,
                                width: PANEL_W,
                                background: 'linear-gradient(180deg, rgba(250,249,247,0.98), rgba(236,232,226,0.99))',
                                backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                                border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 18px 44px rgba(0,0,0,0.32)',
                            }}>
                                {[{ f: 'weight', s: 2.5, u: 'kg', zh: '重量' }, { f: 'reps', s: 1, u: '次', zh: '次數' }].map(({ f, s, u, zh }) => (
                                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ width: 34, flexShrink: 0, fontSize: 12, color: 'rgba(22,20,21,0.5)', fontFamily: '"Geist Mono", monospace' }}>{zh}</span>
                                        <motion.button {...pressProps('row')} aria-label={`${zh}減少`} onClick={() => stepField(realIdx, f, -s)} style={miniBtn}>−</motion.button>
                                        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                                            <input
                                                value={draft[f]}
                                                onChange={e => typeField(realIdx, f, e.target.value)}
                                                onFocus={e => e.target.select()}
                                                inputMode="decimal"
                                                aria-label={zh}
                                                style={{
                                                    width: '100%', boxSizing: 'border-box', height: 32, borderRadius: 9,
                                                    padding: '0 26px 0 10px', textAlign: 'center',
                                                    border: '1px solid rgba(22,20,21,0.12)', background: '#fff', color: '#161415',
                                                    fontFamily: '"Tenor Sans","Noto Sans TC",sans-serif', fontSize: 16, outline: 'none',
                                                }} />
                                            <span style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'rgba(22,20,21,0.4)', pointerEvents: 'none' }}>{u}</span>
                                        </div>
                                        <motion.button {...pressProps('row')} aria-label={`${zh}增加`} onClick={() => stepField(realIdx, f, s)} style={miniBtn}>+</motion.button>
                                    </div>
                                ))}
                                <motion.button {...pressProps('row')} onClick={closeChip}
                                    style={{ height: 34, borderRadius: 10, border: 'none', background: '#161415', color: '#fff', fontSize: 13, cursor: 'pointer' }}>
                                    完成
                                </motion.button>
                            </div>
                            </>, document.body
                        )}
                    </div>
                );
            })}
        </div>
    );
};

/* ── 健身提示統一版位 ────────────────────────────────────────────
   版位基準線：頂欄 LiveActivityCard 是 absolute（不佔文件流），
   實高 = max(20px, safe-area-top) + 62px(玻璃條) + 12px(pb-3)。 */
const TOP_BAR_BOTTOM_CSS = 'max(20px, env(safe-area-inset-top, 20px)) + 74px';

/* 三張提示卡（Plan Echo / Micro-Win / 教練提醒）原本層級不一致 ——
   一張 fixed z-45、兩張 absolute z-30，而且散在 JSX 三個地方，會互相疊、
   也會被父層的 overflow / transform / isolation 關住。
   統一改成 portal 到 document.body：真正懸浮在視窗最上層，不受任何父層影響。
   z-index 38 = 壓過所有頁面內容與底部 CTA(z-20)，但低於休息覆蓋層(z-40)
   與各種彈窗(z-50 以上) —— 提示可以蓋內容，但不該蓋掉模態。 */
const SessionHintLayer = ({ children }) => createPortal(
    <div style={{
        position: 'fixed', left: 0, right: 0, zIndex: 38,
        top: `calc(${TOP_BAR_BOTTOM_CSS} + 12px)`,
        maxWidth: 430, margin: '0 auto', padding: '0 24px',
        pointerEvents: 'none',
    }}>
        <div style={{ pointerEvents: 'auto' }}>{children}</div>
    </div>,
    document.body
);

// ── single swipeable + reorderable queue card ─────────────────
const QueueCard = ({ ex, isCurrent, globalIdx, onDelete, onAddAfter, onEdit, onUpdateLoggedSets, dragControls }) => {
    const ACTION_W = 116;
    const x = useMotionValue(0);
    const [revealed, setRevealed] = useState(false);
    const muscleLabel = getMuscleLabel(ex);
    const dotColor = muscleDotColor(muscleLabel);
    /* 連點兩下編輯已經拿掉 —— 手勢沒有任何提示，使用者不會知道它存在，
       而且在可拖曳排序的列表上很容易誤觸。編輯改走底下那顆「編輯動作」。
       這一層現在只負責：左滑抽屜開著的時候，點一下把它收回去。 */
    const handleTap = () => { if (revealed) snapClose(); };

    const snapClose = () => { fmAnimate(x, 0, { type: 'spring', stiffness: 500, damping: 38 }); setRevealed(false); };
    const snapOpen  = () => { fmAnimate(x, -ACTION_W, { type: 'spring', stiffness: 500, damping: 38 }); setRevealed(true); };

    const handleDragEnd = (_, info) => {
        if (info.offset.x < -36 || (revealed && info.offset.x < 20)) snapOpen();
        else snapClose();
    };

    const TITANIUM_DARK = 'linear-gradient(135deg, #3A3A3A 0%, #5A5A5A 30%, #484848 60%, #6A6A6A 100%)';

    // 🩹 最外層原本是 overflow:'hidden'（給已經移除的左滑抽屜用的）。這層本身沒有背景、
    //    圓角是內層卡片自己畫的，留著只會把「點組數改重量」展開的編輯面板從卡片下緣
    //    切掉一半。改成 visible。
    return (
        <div style={{ position: 'relative', marginBottom: 8, borderRadius: 18, overflow: 'visible' }}>

            {/* ── 左滑抽屜：刪除此動作 ──
                刪除從「卡片底下的常駐按鈕」改成手勢 —— 它是破壞性動作，
                不該跟「編輯 / 新增」並排讓人一眼就按到；要刪就得先滑開它。 */}
            {/* ⚠️ 抽屜與滑動只包「卡片那一列」。
                第一版把整塊（含已記錄組數與兩顆按鈕）一起包進去，結果
                刪除鈕被撐成整塊那麼高、按鈕也跟著滑走 —— 而且卡片是半透明的，
                紅色抽屜直接透到卡片上。現在列是實體的，抽屜也只有一列高。 */}
            <div style={{ position: 'relative' }}>
                <div style={{
                    position: 'absolute', top: 0, bottom: 0, right: 0, width: ACTION_W,
                    display: 'flex', alignItems: 'stretch', zIndex: 1,
                }}>
                    <motion.button {...pressProps('row')}
                        onClick={(e) => { e.stopPropagation(); snapClose(); onDelete?.(globalIdx); }}
                        className="lg-btn lg-btn--coral"
                        style={{
                            flex: 1, borderRadius: 18, cursor: 'pointer',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                            fontSize: 11.5, letterSpacing: '0.06em', fontWeight: 600,
                        }}
                    >
                        <Trash2 size={15} /> 刪除此動作
                    </motion.button>
                </div>

                {/* ── 卡片那一列：可左滑 ── */}
                <motion.div
                    onClick={handleTap}
                    drag="x"
                    dragDirectionLock
                    dragConstraints={{ left: -ACTION_W, right: 0 }}
                    dragElastic={0.06}
                    onDragEnd={handleDragEnd}
                    style={{ position: 'relative', zIndex: 2, x, touchAction: 'pan-y' }}
                >
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px',
                    // ✨ Liquid Glass 卡片
                    /* 實體，不是玻璃 —— 左滑抽屜在它底下，半透明會整片透過來 */
                    background: isCurrent
                        ? 'linear-gradient(180deg, #2C282A 0%, #141213 100%)'
                        : '#FFFFFF',
                    border: isCurrent ? '1px solid rgba(255,255,255,0.16)' : '1px solid rgba(255,255,255,0.55)',
                    boxShadow: isCurrent
                        ? 'inset 0 1px 1px rgba(255,255,255,0.22), inset 0 -1px 2px rgba(0,0,0,0.25), 0 8px 24px rgba(22,20,21,0.22)'
                        : 'inset 0 1px 1px rgba(255,255,255,0.7), 0 4px 14px rgba(0,0,0,0.06)',
                    borderRadius: 18,
                }}>
                    {/* Drag grip — activates Reorder.Item drag */}
                    <div
                        onPointerDown={e => { e.stopPropagation(); dragControls.start(e); }}
                        style={{ cursor: 'grab', touchAction: 'none', padding: '2px 0', flexShrink: 0 }}
                    >
                        <GripVertical size={15} color={isCurrent ? 'rgba(255,255,255,0.22)' : 'rgba(22,20,21,0.2)'} />
                    </div>

                    {/* Muscle dot chip — only shown when label is known */}
                    {muscleLabel && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                            padding: '2px 7px', borderRadius: 28,
                            background: isCurrent ? 'rgba(255,255,255,0.1)' : `${dotColor}22`,
                        }}>
                            <div style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                            <span style={{
                                fontSize: 11, fontWeight: 500, letterSpacing: '0.08em',
                                color: isCurrent ? 'rgba(255,255,255,0.6)' : dotColor,
                            }}>{muscleLabel}</span>
                        </div>
                    )}

                    {/* Exercise info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        {isCurrent && (
                            <span style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.2em', color: '#F95C4B', display: 'block', marginBottom: 1, }}>● 進行中</span>
                        )}
                        <p style={{
                            fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13,
                            color: isCurrent ? 'white' : '#161415',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.25, margin: 0,
                        }}>{getExerciseNameZh(ex.name)}</p>
                        <p style={{ fontSize: 11, fontWeight: 500, margin: '2px 0 0', color: isCurrent ? 'rgba(255,255,255,0.42)' : 'rgba(22,20,21,0.38)' }}>
                            {(() => {
                                const done = (ex.sets || []).filter(s => s && s.completed).length;
                                const target = ex.sets_target || 3;
                                // 即時監測：進行中/已有紀錄 → 顯示「已完成 X/Y 組」進度；否則顯示計劃
                                if (isCurrent || done > 0) return `已完成 ${done}/${target} 組 · 目標 ${ex.reps}次${ex.rest ? ` · 休${ex.rest}` : ''}`;
                                return `${target}組 · ${ex.reps}次${ex.rest ? ` · 休${ex.rest}` : ''}`;
                            })()}
                        </p>
                    </div>

                    {/* Swipe hint arrow (only when not revealed) */}
                    {!revealed && (
                        <div style={{ flexShrink: 0, opacity: 0.2 }}>
                            <ChevronLeft size={14} color={isCurrent ? 'white' : '#161415'} />
                        </div>
                    )}
                </div>
                </motion.div>
            </div>
            {/* 即時監測：已記錄各組數據 + 快速修改 / 就地插入動作 */}
                {(() => {
                    const hasLog = (ex.sets || []).some(s => s && (s.completed || s.weight != null || s.reps != null));
                    if (!isCurrent && !hasLog) return null;
                    const btnBase = {
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, height: 34, borderRadius: 11,
                        fontFamily: '"Geist Mono", monospace', fontSize: 11.5, letterSpacing: '0.06em', fontWeight: 500, cursor: 'pointer',
                    };
                    // 🩹 這一區（已記錄的組數 + 刪除／儲存）排在深色卡片「外面」的淺色底上，
                    //    原本卻跟著 isCurrent 走白色配色 —— 進行中時白字白底疊在淺色底，
                    //    「儲存」和每一組的數字都幾乎看不見。一律用深色墨水配色。
                    const editBtn = { ...btnBase, background: 'rgba(22,20,21,0.06)', border: '1px solid rgba(22,20,21,0.12)', color: '#161415' };
                    return (
                        <div style={{ padding: '0 14px 12px' }}>
                            <LoggedSetChips ex={ex} globalIdx={globalIdx} onUpdateLoggedSets={onUpdateLoggedSets} dark={false} />
                            {hasLog && (
                                <p style={{ fontSize: 11, color: 'rgba(22,20,21,0.42)', margin: '6px 0 0', fontFamily: '"Geist Mono", monospace' }}>
                                    點一下組數可改重量與次數
                                </p>
                            )}
                            {/* 這兩顆是「對這個動作可以做什麼」：改它、或在它後面插一個。
                                刪除搬到左滑（破壞性動作不該跟它們並排）；
                                「儲存」也拿掉了 —— 那顆其實只是關閉面板，改到的東西早就存了，
                                叫「儲存」會讓人以為不按就不算。 */}
                            <div style={{ display: 'flex', gap: 8, marginTop: 10 }} onClick={e => e.stopPropagation()}>
                                <motion.button {...pressProps('row')} onClick={() => onEdit?.(globalIdx, ex)} style={{ ...editBtn, flex: 1 }}>
                                    <Edit3 size={13} /> 編輯動作
                                </motion.button>
                                <motion.button {...pressProps('row')} onClick={() => onAddAfter?.(globalIdx)} style={{ ...editBtn, flex: 1 }}>
                                    <Plus size={13} strokeWidth={2.5} /> 新增動作
                                </motion.button>
                            </div>
                        </div>
                    );
                })()}
        </div>
    );
};

// ── wrapper that provides Reorder.Item + drag controls ────────
// IMPORTANT: value must be the GROUP object (same reference as groupedQueue items),
// NOT the inner exercise object — otherwise Reorder.Group's onReorder receives a mix
// of exercise objects and group objects, breaking flattenGroups.
const ReorderQueueCard = ({ group, isCurrent, globalIdx, onDelete, onAddAfter, onEdit, onUpdateLoggedSets }) => {
    const dragControls = useDragControls();
    return (
        <Reorder.Item
            value={group}
            dragListener={false}
            dragControls={dragControls}
            style={{ listStyle: 'none' }}
            whileDrag={{ scale: 1.02, zIndex: 99 }}
        >
            <QueueCard
                ex={group.exercise}
                isCurrent={isCurrent}
                globalIdx={globalIdx}
                onDelete={onDelete}
                onAddAfter={onAddAfter}
                onEdit={onEdit}
                onUpdateLoggedSets={onUpdateLoggedSets}
                dragControls={dragControls}
            />
        </Reorder.Item>
    );
};

// ── Superset group card (moves as one Reorder unit) ──────────
const SupersetGroupCard = ({ group, isCurrentGroup, groupStartGlobalIdx, onDelete, onDeleteGroup, onOpenAddPanel }) => {
    const ACTION_W = 116;
    const x = useMotionValue(0);
    const [revealed, setRevealed] = useState(false);
    const dragControls = useDragControls();
    const snapClose = () => { fmAnimate(x, 0, { type: 'spring', stiffness: 500, damping: 38 }); setRevealed(false); };
    const snapOpen  = () => { fmAnimate(x, -ACTION_W, { type: 'spring', stiffness: 500, damping: 38 }); setRevealed(true); };
    const handleDragEnd = (_, info) => { if (info.offset.x < -36 || (revealed && info.offset.x < 20)) snapOpen(); else snapClose(); };

    return (
        <Reorder.Item value={group} dragListener={false} dragControls={dragControls} style={{ listStyle: 'none', marginBottom: 8 }} whileDrag={{ scale: 1.02, zIndex: 99 }}>
            <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden' }}>
                {/* Swipeable surface (Swipe removed) */}
                <motion.div
                    style={{ position: 'relative', zIndex: 2 }}>
                    <div style={{
                        background: isCurrentGroup ? '#161415' : 'white',
                        border: isCurrentGroup ? 'none' : '1px solid rgba(22,20,21,0.07)',
                        boxShadow: isCurrentGroup ? '0 6px 22px rgba(22,20,21,0.20)' : '0 1px 5px rgba(0,0,0,0.05)',
                        borderRadius: 18, overflow: 'hidden',
                    }}>
                        {/* Superset badge bar */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px 4px', borderBottom: isCurrentGroup ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(22,20,21,0.05)' }}>
                            <div onPointerDown={e => { e.stopPropagation(); dragControls.start(e); }} style={{ cursor: 'grab', touchAction: 'none', flexShrink: 0 }}>
                                <GripVertical size={14} color={isCurrentGroup ? 'rgba(255,255,255,0.2)' : 'rgba(22,20,21,0.18)'} />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 28, background: isCurrentGroup ? 'rgba(249,92,75,0.25)' : 'rgba(249,92,75,0.1)', flexShrink: 0 }}>
                                <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#F95C4B' }} />
                                <span style={{ fontSize: 12, fontWeight: 500, color: '#F95C4B', letterSpacing: '0.1em' }}>超級組</span>
                            </div>
                            {isCurrentGroup && <span style={{ fontSize: 9, fontWeight: 500, color: '#F95C4B', letterSpacing: '0.2em', textTransform: 'uppercase', marginLeft: 2 }}>NOW</span>}
                            <div style={{ flex: 1 }} />
                            {!revealed && <ChevronLeft size={13} color={isCurrentGroup ? 'rgba(255,255,255,0.2)' : 'rgba(22,20,21,0.2)'} />}
                        </div>
                        {/* Exercises */}
                        {group.exercises.map((ex, i) => {
                            const ml = getMuscleLabel(ex); const dc = muscleDotColor(ml);
                            return (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: i === group.exercises.length - 1 ? '10px 14px 12px' : '10px 14px 8px' }}>
                                    <div style={{ width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <span style={{ fontSize: 11, fontWeight: 500, color: isCurrentGroup ? 'rgba(249,92,75,0.8)' : '#F95C4B' }}>{String.fromCharCode(65+i)}</span>
                                    </div>
                                    {ml && <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 6px', borderRadius: 28, background: isCurrentGroup ? 'rgba(255,255,255,0.08)' : `${dc}22`, flexShrink: 0 }}>
                                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: dc }} />
                                        <span style={{ fontSize: 11, fontWeight: 500, color: isCurrentGroup ? 'rgba(255,255,255,0.5)' : dc }}>{ml}</span>
                                    </div>}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 12, color: isCurrentGroup ? 'white' : '#161415', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getExerciseNameZh(ex.name)}</p>
                                        <p style={{ fontSize: 11, fontWeight: 500, margin: '1px 0 0', color: isCurrentGroup ? 'rgba(255,255,255,0.4)' : 'rgba(22,20,21,0.36)' }}>{ex.sets_target||3}組 · {ex.reps}次</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </motion.div>
            </div>
        </Reorder.Item>
    );
};

// =====================================================
// 🗂️ WORKOUT QUEUE SHEET  (floating bottom drawer)
// =====================================================
const WorkoutQueueSheet = ({ exercisesWithSets, currentExerciseIndex, onClose, onReorder, onSkip, onSkipGroup, onUpdateLoggedSets, initialAddPanel = null, isLiveFill = false }) => {
    const completedExs = exercisesWithSets.slice(0, currentExerciseIndex);
    const TITANIUM = 'linear-gradient(135deg, #C8C8C8 0%, #E4E4E4 28%, #B4B4B4 55%, #D0D0D0 100%)';

    // ── internal add-exercise panel state ──
    // 🆕 initialAddPanel：從「動作面板」按「加入動作」時直接開在加入頁
    const [addPanel, setAddPanel] = useState(initialAddPanel != null ? { afterAbsIdx: initialAddPanel } : null); // null | { afterAbsIdx }
    // ── 編輯動作資訊（由卡片上的「編輯動作」開啟）──
    const [editPanel, setEditPanel] = useState(null); // null | { absIdx, sets, reps, rest }
    const [addSearch, setAddSearch] = useState('');
    const [addCat, setAddCat] = useState('all');
    const CATS = ['all','chest','back','shoulders','arms','legs','core'];
    const CAT_ZH = { all:'全部', chest:'胸', back:'背', shoulders:'肩', arms:'手臂', legs:'腿', core:'核心' };

    // ── queue items (flat list with stable keys) ──
    // 🟠 Fix: useState initializer 只在首次掛載執行，Sheet 重新開啟時不會重新同步。
    // 改用 props 直接計算，並透過 useEffect 在 exercisesWithSets / currentExerciseIndex
    // 有變動時（使用者完成一組後再開啟 Queue）自動更新 queueItems。
    const [queueItems, setQueueItems] = useState(() =>
        exercisesWithSets.slice(currentExerciseIndex).map((ex, i) => ({
            ...ex, _qid: `${ex.name}_${currentExerciseIndex + i}_${Date.now()}`
        }))
    );

    // 🟠 Fix: 當外部 exercisesWithSets 或 currentExerciseIndex 更新時同步 queueItems
    // （僅在 queueItems 長度與預期不符時才重置，避免覆蓋使用者在 Sheet 內的操作）
    useEffect(() => {
        const expectedQueue = exercisesWithSets.slice(currentExerciseIndex);
        // 只在來源資料有根本性變化時才重置（例如跳過了動作、外部重排）
        const currentNames = queueItems.map(q => q.name).join(',');
        const expectedNames = expectedQueue.map(q => q.name).join(',');
        if (currentNames !== expectedNames) {
            setQueueItems(expectedQueue.map((ex, i) => ({
                ...ex, _qid: `${ex.name}_${currentExerciseIndex + i}_${Date.now()}`
            })));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [exercisesWithSets, currentExerciseIndex]);

    // ── group into singles + superset groups for Reorder ──
    const groupedQueue = useMemo(() => {
        const result = []; const seen = new Set();
        queueItems.forEach((ex) => {
            if (ex.supersetGroup) {
                if (!seen.has(ex.supersetGroup)) {
                    seen.add(ex.supersetGroup);
                    const partners = queueItems.filter(e => e.supersetGroup === ex.supersetGroup);
                    result.push({ type: 'superset', exercises: partners, _gid: `ss_${ex.supersetGroup}`, supersetGroup: ex.supersetGroup });
                }
            } else {
                result.push({ type: 'single', exercise: ex, _gid: ex._qid });
            }
        });
        return result;
    }, [queueItems]);

    const flattenGroups = (groups) => groups.flatMap(g => g.type === 'single' ? [g.exercise] : g.exercises);

    // offset map: groupedQueue index → start globalIdx
    const groupStartIdxMap = useMemo(() => {
        let offset = currentExerciseIndex;
        return groupedQueue.map(g => { const s = offset; offset += g.type === 'single' ? 1 : g.exercises.length; return s; });
    }, [groupedQueue, currentExerciseIndex]);

    const handleReorder = useCallback((newGroups) => {
        const flat = flattenGroups(newGroups);
        setQueueItems(flat);
        onReorder([...completedExs, ...flat]);
    }, [completedExs, onReorder]);

    const handleDelete = useCallback((absIdx) => {
        // Remove from local visual list immediately
        const localIdx = absIdx - currentExerciseIndex;
        if (localIdx >= 0) {
            setQueueItems(prev => {
                const updated = [...prev];
                updated.splice(localIdx, 1);
                return updated;
            });
        }
        onSkip(absIdx);
    }, [onSkip, currentExerciseIndex]);

    // 🟡 Fix: 原子性刪除整個超級組，一次 haptic + 一次 state 更新（Issue 16）
    const handleDeleteGroup = useCallback((groupStartAbsIdx, groupSize) => {
        const localStart = groupStartAbsIdx - currentExerciseIndex;
        if (localStart >= 0) {
            setQueueItems(prev => {
                const updated = [...prev];
                updated.splice(localStart, groupSize); // 一次移除 groupSize 個元素
                return updated;
            });
        }
        // 通知父層進行原子刪除（父層的 handleSkipGroupFromQueue）
        onSkipGroup(groupStartAbsIdx, groupSize);
    }, [onSkipGroup, currentExerciseIndex]);

    const handleAddFromPanel = useCallback((ex) => {
        const insertAfter = addPanel?.afterAbsIdx ?? (currentExerciseIndex);
        const localInsert = insertAfter - currentExerciseIndex + 1;
        const newEx = { name: ex.name, sets_target: ex.sets || 3, reps: ex.reps || '10', rest: ex.rest || '60s', sets: [], category: ex.muscle || 'STRENGTH', muscle: ex.muscle, completed: false, _qid: `${ex.name}_added_${Date.now()}` };
        setQueueItems(prev => {
            const updated = [...prev];
            updated.splice(localInsert, 0, newEx);
            onReorder([...completedExs, ...updated]);
            return updated;
        });
        setAddPanel(null); setAddSearch(''); setAddCat('all');
    }, [addPanel, currentExerciseIndex, completedExs, onReorder]);

    // 開啟編輯面板（由卡片上的「編輯動作」觸發）
    const openEdit = useCallback((absIdx, ex) => {
        setEditPanel({
            absIdx,
            name: ex.name,
            sets: ex.sets_target || 3,
            reps: ex.reps || '10',
            rest: ex.rest || '60s',
        });
    }, []);

    // 套用編輯：更新 queueItems + 通知父層
    const applyEdit = useCallback(() => {
        if (!editPanel) return;
        const localIdx = editPanel.absIdx - currentExerciseIndex;
        setQueueItems(prev => {
            const updated = [...prev];
            if (localIdx >= 0 && updated[localIdx]) {
                updated[localIdx] = {
                    ...updated[localIdx],
                    sets_target: Math.max(1, parseInt(editPanel.sets) || 1),
                    reps: String(editPanel.reps),
                    rest: String(editPanel.rest),
                };
            }
            onReorder([...completedExs, ...updated]);
            return updated;
        });
        setEditPanel(null);
    }, [editPanel, currentExerciseIndex, completedExs, onReorder]);

    const filteredEx = useMemo(() => {
        if (typeof ALL_EXERCISES === 'undefined') return [];
        return ALL_EXERCISES.filter(ex => {
            const matchCat = addCat === 'all' || ex.muscle === addCat;
            const matchSearch = !addSearch || ex.name.toLowerCase().includes(addSearch.toLowerCase());
            return matchCat && matchSearch;
        }).slice(0, 60);
    }, [addCat, addSearch]);

    // ── 🎯 推薦動作：依「當天菜單」的肌群分佈，推薦互補/同肌群動作 ──
    //   規則：① 統計當天各肌群次數 → 主要訓練肌群權重最高
    //         ② 互補肌群加分（推↔三頭/肩、拉↔二頭、腿三群互補）
    //         ③ tier 1–2（黃金複合/優質輔助）優先、填補缺少的 zone
    //         ④ 排除已在菜單裡的動作
    const recommendedEx = useMemo(() => {
        if (typeof ALL_EXERCISES === 'undefined' || !exercisesWithSets?.length) return [];
        // 互補肌群圖（推 / 拉 / 腿）
        const COMPLEMENT = {
            chest: ['triceps', 'shoulders'], shoulders: ['triceps', 'chest'], triceps: ['chest', 'shoulders'],
            back: ['biceps'], biceps: ['back'],
            quads: ['hamstrings', 'glutes', 'calves'], hamstrings: ['quads', 'glutes'], glutes: ['quads', 'hamstrings'], calves: ['quads'],
            core: ['core'],
        };
        // 當天菜單肌群統計 + 已出現的 (muscle→zones)
        const muscleCount = {}; const presentNames = new Set(); const zonesByMuscle = {};
        exercisesWithSets.forEach(ex => {
            const def = ALL_EXERCISES_MAP?.[ex.name] || ex;
            const m = def.muscle; if (!m) return;
            muscleCount[m] = (muscleCount[m] || 0) + 1;
            presentNames.add(ex.name);
            if (def.zone) { (zonesByMuscle[m] = zonesByMuscle[m] || new Set()).add(def.zone); }
        });
        if (Object.keys(muscleCount).length === 0) return [];
        // 目標肌群集合：主要肌群 + 其互補肌群
        const primaryMuscles = Object.entries(muscleCount).sort((a, b) => b[1] - a[1]).map(([m]) => m);
        const focusMuscle = primaryMuscles[0];
        const targetWeight = {};
        primaryMuscles.forEach((m, i) => { targetWeight[m] = Math.max(targetWeight[m] || 0, 3 - i); }); // 主肌群權重遞減
        primaryMuscles.forEach(m => (COMPLEMENT[m] || []).forEach(c => { targetWeight[c] = Math.max(targetWeight[c] || 0, 1.5); }));

        const scored = ALL_EXERCISES
            .filter(ex => !presentNames.has(ex.name) && targetWeight[ex.muscle])
            .map(ex => {
                let score = targetWeight[ex.muscle] * 10;
                if (ex.tier === 1) score += 4; else if (ex.tier === 2) score += 3; else if (ex.tier === 3) score += 1;
                // 填補缺少的 zone（例如已練 chest-mid/upper，缺 chest-lower → 加分）
                const zset = zonesByMuscle[ex.muscle];
                if (ex.zone && zset && !zset.has(ex.zone)) score += 2;
                // 同一主要肌群略優先於互補肌群，讓「加動作」預設仍以今天焦點為主
                if (ex.muscle === focusMuscle) score += 1.5;
                return { ex, score };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, 6)
            .map(s => s.ex);
        return scored;
    }, [exercisesWithSets]);

    return (
        <div className="fixed inset-0 z-[60]" onClick={addPanel ? undefined : onClose}>
            <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)' }} />

            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', stiffness: 400, damping: 36 }}
                onClick={e => e.stopPropagation()}
                style={{ position: 'absolute', bottom: 0, left: 0, right: 0, maxWidth: 430, margin: '0 auto', maxHeight: '84dvh', minHeight: editPanel ? 480 : 'auto',
                    // ✨ Liquid Glass 底板
                    background: 'linear-gradient(180deg, rgba(246,244,241,0.72) 0%, rgba(232,228,222,0.80) 100%)',
                    backdropFilter: 'blur(44px) saturate(170%) brightness(1.03)',
                    WebkitBackdropFilter: 'blur(44px) saturate(170%) brightness(1.03)',
                    borderTop: '1px solid rgba(255,255,255,0.7)',
                    boxShadow: 'inset 0 1.5px 1px rgba(255,255,255,0.8), 0 -20px 60px rgba(0,0,0,0.20)',
                    borderRadius: '28px 32px 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                <div style={{ width: 44, height: 4, background: 'rgba(22,20,21,0.12)', borderRadius: 9999, margin: '14px auto 0', flexShrink: 0 }} />

                {/* ─── Header ─── */}
                <div style={{ padding: '10px 18px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                    <div>
                        {addPanel
                            ? <h3 style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 18, color: '#161415', margin: 0 }}>加入動作</h3>
                            : <h3 style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 20, color: '#161415', margin: 0 }}>今日菜單</h3>}
                        <p style={{ fontSize: 11, color: 'rgba(22,20,21,0.38)', fontWeight: 500, margin: '2px 0 0' }}>
                            {addPanel ? '選擇後直接加入，不會離開此頁面' : `${completedExs.length}/${exercisesWithSets.length} 已完成 · 左滑刪除 · 拖把手排序`}
                        </p>
                    </div>
                    <motion.button whileTap={{ scale: 0.9 }} onClick={addPanel ? () => { setAddPanel(null); setAddSearch(''); setAddCat('all'); } : onClose}
                        style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(22,20,21,0.07)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {addPanel ? <ArrowLeft size={16} color="rgba(22,20,21,0.6)" /> : <X size={16} color="rgba(22,20,21,0.5)" />}
                    </motion.button>
                </div>

                {/* ─── Add Exercise Panel ─── */}
                {addPanel ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {/* Category pills */}
                        <div style={{ display: 'flex', gap: 6, padding: '4px 14px 8px', overflowX: 'auto', flexShrink: 0 }}>
                            {CATS.map(cat => (
                                <motion.button {...pressProps('row')} key={cat} onClick={() => setAddCat(cat)}
 style={{ flexShrink: 0, padding: '5px 12px', borderRadius: 28, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 500,
 background: addCat === cat ? '#161415' : 'rgba(22,20,21,0.07)',
 color: addCat === cat ? 'white' : 'rgba(22,20,21,0.5)' }}>
                                    {CAT_ZH[cat]}
                                </motion.button>
                            ))}
                        </div>
                        {/* Exercise list — NO keyboard, category-only browsing */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 32px' }}>
                            {/* ─── 🎯 推薦動作：依當天菜單肌群推薦（僅在「全部」且未搜尋時顯示） ─── */}
                            {addCat === 'all' && !addSearch && recommendedEx.length > 0 && (
                                <div style={{ marginBottom: 12 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 2px 8px' }}>
                                        <Sparkles size={13} color="#F95C4B" />
                                        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', color: '#F95C4B' }}>推薦動作</span>
                                        <span style={{ fontSize: 11, color: 'rgba(22,20,21,0.35)', fontWeight: 500 }}>· 依今日菜單</span>
                                    </div>
                                    {recommendedEx.map(ex => {
                                        const ml = getMuscleLabel(ex); const dc = muscleDotColor(ml);
                                        return (
                                            <motion.button key={`rec_${ex.name}`} whileTap={{ scale: 0.97 }} onClick={() => handleAddFromPanel(ex)}
                                                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px', borderRadius: 18, marginBottom: 6, textAlign: 'left', cursor: 'pointer',
                                                    background: 'rgba(249,92,75,0.06)', border: '1px solid rgba(249,92,75,0.22)', boxShadow: '0 1px 4px rgba(249,92,75,0.06)' }}>
                                                <div style={{ width: 36, height: 36, borderRadius: 12, background: ml ? `${dc}20` : 'rgba(22,20,21,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    <Dumbbell size={17} color={ml ? dc : 'rgba(22,20,21,0.4)'} />
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <p style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13, color: '#161415', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getExerciseNameZh(ex.name)}</p>
                                                    <p style={{ fontSize: 11, color: 'rgba(22,20,21,0.4)', margin: '2px 0 0', fontWeight: 500 }}>{ex.sets}組 · {ex.reps}次{ex.rest ? ` · 休${ex.rest}` : ''}</p>
                                                </div>
                                                {ml && <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 28, background: `${dc}18`, flexShrink: 0 }}>
                                                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: dc }} />
                                                    <span style={{ fontSize: 11, fontWeight: 500, color: dc }}>{ml}</span>
                                                </div>}
                                            </motion.button>
                                        );
                                    })}
                                    {/* 分隔：以下為完整動作庫 */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 2px 8px' }}>
                                        <div style={{ flex: 1, height: 1, background: 'rgba(22,20,21,0.08)' }} />
                                        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.14em', color: 'rgba(22,20,21,0.32)' }}>完整動作庫</span>
                                        <div style={{ flex: 1, height: 1, background: 'rgba(22,20,21,0.08)' }} />
                                    </div>
                                </div>
                            )}
                            {filteredEx.length === 0
                                ? <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(22,20,21,0.3)', fontWeight: 700 }}>沒有相關動作</div>
                                : filteredEx.map(ex => {
                                    const ml = getMuscleLabel(ex); const dc = muscleDotColor(ml);
                                    return (
                                        <motion.button key={ex.name} whileTap={{ scale: 0.97 }} onClick={() => handleAddFromPanel(ex)}
                                            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px', borderRadius: 18, marginBottom: 6, textAlign: 'left', border: 'none', background: 'white', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                                            <div style={{ width: 36, height: 36, borderRadius: 12, background: ml ? `${dc}20` : 'rgba(22,20,21,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                <Dumbbell size={17} color={ml ? dc : 'rgba(22,20,21,0.4)'} />
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <p style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13, color: '#161415', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getExerciseNameZh(ex.name)}</p>
                                                <p style={{ fontSize: 11, color: 'rgba(22,20,21,0.4)', margin: '2px 0 0', fontWeight: 500 }}>{ex.sets}組 · {ex.reps}次{ex.rest ? ` · 休${ex.rest}` : ''}</p>
                                            </div>
                                            {ml && <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 28, background: `${dc}18`, flexShrink: 0 }}>
                                                <div style={{ width: 4, height: 4, borderRadius: '50%', background: dc }} />
                                                <span style={{ fontSize: 11, fontWeight: 500, color: dc }}>{ml}</span>
                                            </div>}
                                        </motion.button>
                                    );
                                })}
                        </div>
                    </div>
                ) : (
                /* ─── Queue List ─── */
                <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 36, paddingLeft: 14, paddingRight: 14 }}>
                    {/* ─── 即時統計 LIVE：本次訓練總量 / 已完成組數 ─── */}
                    {(() => {
                        let totalSets = 0, totalVol = 0, totalReps = 0;
                        exercisesWithSets.forEach(ex => (ex.sets || []).forEach(s => {
                            if (s && s.completed) { totalSets += 1; totalReps += (parseFloat(s.reps) || 0); totalVol += (parseFloat(s.weight) || 0) * (parseFloat(s.reps) || 0); }
                        }));
                        const stats = [
                            { k: '已完成組', v: totalSets, u: '組' },
                            { k: '總訓練量', v: Math.round(totalVol).toLocaleString(), u: 'kg' },
                            { k: '總次數', v: totalReps, u: '次' },
                        ];
                        return (
                            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                {stats.map((s, i) => (
                                    <div key={i} style={{
                                        flex: 1, padding: '10px 12px', borderRadius: 16,
                                        background: i === 1 ? 'linear-gradient(180deg, rgba(44,40,42,0.92), rgba(20,18,19,0.96))' : 'rgba(255,255,255,0.5)',
                                        border: i === 1 ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(255,255,255,0.6)',
                                        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                                        boxShadow: i === 1 ? '0 8px 22px rgba(22,20,21,0.22)' : 'inset 0 1px 1px rgba(255,255,255,0.7)',
                                    }}>
                                        <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.16em', margin: 0, color: i === 1 ? 'rgba(255,255,255,0.5)' : 'rgba(22,20,21,0.42)' }}>{s.k}</p>
                                        <p style={{ fontFamily: '"Tenor Sans","Noto Sans TC",sans-serif', fontSize: 21, margin: '2px 0 0', letterSpacing: '-0.02em', color: i === 1 ? '#fff' : '#161415' }}>
                                            {s.v}<span style={{ fontSize: 11, marginLeft: 2, color: i === 1 ? 'rgba(255,255,255,0.5)' : 'rgba(22,20,21,0.4)' }}>{s.u}</span>
                                        </p>
                                    </div>
                                ))}
                            </div>
                        );
                    })()}

                    {/* Completed — 顯示每組已記錄數據，可點擊即時修改 */}
                    {completedExs.map((ex, i) => {
                        const ml = getMuscleLabel(ex); const dc = muscleDotColor(ml);
                        const maxW = Math.max(0, ...(ex.sets || []).map(s => parseFloat(s.weight) || 0));
                        return (
                            <div key={`done_${i}`}
                                style={{ borderRadius: 18, marginBottom: 8, background: 'rgba(22,20,21,0.04)', border: '1px solid rgba(22,20,21,0.05)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
                                    {/* 完成的勾勾用同一顆淺珊瑚 —— 原本是拉絲鈦金屬（灰），
                                        在同樣是灰白的已完成卡上完全看不出「這個做完了」。 */}
                                    <div style={{ width: 24, height: 24, borderRadius: 8, background: 'var(--lg-coral-grad)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 2px 6px -2px rgba(249,92,75,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <Check size={11} color="#fff" strokeWidth={3} />
                                    </div>
                                    {ml && <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 28, background: `${dc}18`, flexShrink: 0 }}>
                                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: dc }} />
                                        <span style={{ fontSize: 11, fontWeight: 500, color: dc }}>{ml}</span>
                                    </div>}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13, color: '#161415', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getExerciseNameZh(ex.name)}</p>
                                        <p style={{ fontSize: 11, color: 'rgba(22,20,21,0.38)', margin: '1px 0 0', fontWeight: 500 }}>{ex.sets?.length||0}/{ex.sets_target||3} 組完成{maxW > 0 ? ` · 最高 ${maxW}kg` : ''}</p>
                                    </div>
                                </div>
                                <div style={{ padding: '0 14px 12px' }}>
                                    <LoggedSetChips ex={ex} globalIdx={i} onUpdateLoggedSets={onUpdateLoggedSets} dark={false} />
                                    {/* 已完成動作：快速修改（開完整編輯面板改每組重量/次數） */}
                                    <motion.button {...pressProps('row')} onClick={() => openEdit(i, ex)}
 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, width: '100%', height: 34, marginTop: 10, borderRadius: 11, background: 'rgba(22,20,21,0.06)', border: '1px solid rgba(22,20,21,0.08)', color: '#161415', fontFamily: '"Geist Mono", monospace', fontSize: 11.5, letterSpacing: '0.06em', fontWeight: 500, cursor: 'pointer' }}>
                                        <Edit3 size={13} /> 快速修改各組數據
                                    </motion.button>
                                </div>
                            </div>
                        );
                    })}

                    {/* Current + Queue */}
                    <Reorder.Group axis="y" values={groupedQueue} onReorder={handleReorder} style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {groupedQueue.map((group, gi) => {
                            const startIdx = groupStartIdxMap[gi];
                            const isCurrentGroup = startIdx <= currentExerciseIndex && startIdx + (group.type === 'single' ? 1 : group.exercises.length) > currentExerciseIndex;
                            if (group.type === 'superset') {
                                return (
                                    <SupersetGroupCard key={group._gid} group={group} isCurrentGroup={isCurrentGroup}
                                        groupStartGlobalIdx={startIdx} onDelete={handleDelete}
                                        onDeleteGroup={handleDeleteGroup}
                                        onOpenAddPanel={(absIdx) => setAddPanel({ afterAbsIdx: absIdx })} />
                                );
                            }
                            return (
                                <ReorderQueueCard key={group._gid} group={group} isCurrent={isCurrentGroup}
                                    globalIdx={startIdx}
                                    onDelete={handleDelete}
                                    onEdit={openEdit}
                                    onUpdateLoggedSets={onUpdateLoggedSets}
                                    onAddAfter={(absIdx) => setAddPanel({ afterAbsIdx: absIdx })} />
                            );
                        })}
                    </Reorder.Group>

                    {/* 最底下那顆常駐「＋ 新增動作」拿掉了 —— 每個動作卡片自己
                        就有一顆「新增動作」（插在它後面），底部再放一顆等於同一件事
                        在同一個畫面出現兩次，而且兩顆插入的位置還不一樣。 */}
                </div>
                )}

                {/* ─── ✨ 編輯動作資訊面板 (Liquid Glass) ─── */}
                <AnimatePresence>
                    {editPanel && (
                        <div
                            onClick={() => setEditPanel(null)}
                            style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', alignItems: 'stretch', justifyContent: 'center', background: 'rgba(0,0,0,0.35)' }}
                        >
                            <motion.div
                                onClick={e => e.stopPropagation()}
                                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                                transition={{ type: 'spring', damping: 32, stiffness: 340 }}
                                className="no-scrollbar"
                                style={{
                                    // 🔧 修正滑動：面板填滿父層(menu sheet 84dvh)且自身可捲動。
                                    //    父層 overflow:hidden + 本面板 maxHeight 比父層大 → 底部被裁掉又滑不動。
                                    //    改為 height:100%/flex 撐滿父層，內容超出時用 overflowY:auto 在面板內捲動。
                                    position: 'relative', width: '100%', height: '100%', padding: '20px 18px 24px',
                                    boxSizing: 'border-box',
                                    background: 'linear-gradient(180deg, rgba(225,218,208,0.78) 0%, rgba(205,196,183,0.86) 100%)',
                                    backdropFilter: 'blur(40px) saturate(170%)', WebkitBackdropFilter: 'blur(40px) saturate(170%)',
                                    borderTop: '1px solid rgba(255,255,255,0.7)',
                                    boxShadow: 'inset 0 1.5px 1px rgba(255,255,255,0.85), 0 -16px 48px rgba(0,0,0,0.18)',
                                    borderRadius: '28px 28px 0 0',
                                    overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch',
                                    touchAction: 'pan-y',
                                }}
                            >
                                <div style={{ width: 40, height: 4, borderRadius: 9999, background: 'rgba(22,20,21,0.15)', margin: '0 auto 14px' }} />
                                <p style={{ fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif', fontSize: 20, color: '#161415', textAlign: 'center', margin: 0 }}>編輯動作</p>
                                <p style={{ fontSize: 9, letterSpacing: '0.12em', color: 'rgba(22,20,21,0.5)', textAlign: 'center', margin: '4px 0 18px', fontFamily: '"Geist Mono", monospace' }}>{getExerciseNameZh(editPanel.name)}</p>

                                {/* 組數 Stepper */}
                                {[
                                    { key: 'sets', label: '組數 SETS', step: 1, min: 1, isNum: true },
                                ].map(({ key, label }) => (
                                    <div key={key} style={{ marginBottom: 14 }}>
                                        <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.22em', color: 'rgba(22,20,21,0.6)', fontFamily: '"Geist Mono", monospace', marginBottom: 6 }}>{label}</label>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 18, padding: 6, background: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.55)' }}>
                                            <motion.button {...pressProps('row')} onClick={() => setEditPanel(p => ({ ...p, sets: Math.max(1, (parseInt(p.sets) || 1) - 1) }))}
 style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.6)', color: '#161415', fontSize: 20 }}>−</motion.button>
                                            <span style={{ fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif', fontSize: 24, color: '#161415' }}>{editPanel.sets}</span>
                                            <motion.button {...pressProps('row')} onClick={() => setEditPanel(p => ({ ...p, sets: (parseInt(p.sets) || 0) + 1 }))}
 style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.6)', color: '#161415', fontSize: 20 }}>+</motion.button>
                                        </div>
                                    </div>
                                ))}

                                {/* 次數 + 休息 文字輸入 */}
                                <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: 12, letterSpacing: '0.22em', color: 'rgba(22,20,21,0.6)', fontFamily: '"Geist Mono", monospace', marginBottom: 6 }}>次數 REPS</label>
                                        <input value={editPanel.reps} onChange={e => setEditPanel(p => ({ ...p, reps: e.target.value }))}
                                            style={{ width: '100%', boxSizing: 'border-box', height: 48, borderRadius: 12, padding: '0 14px', background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.6)', color: '#161415', fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif', fontSize: 18, outline: 'none' }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: 12, letterSpacing: '0.22em', color: 'rgba(22,20,21,0.6)', fontFamily: '"Geist Mono", monospace', marginBottom: 6 }}>休息 REST</label>
                                        <input value={editPanel.rest} onChange={e => setEditPanel(p => ({ ...p, rest: e.target.value }))} placeholder="90s / 2min"
                                            style={{ width: '100%', boxSizing: 'border-box', height: 48, borderRadius: 12, padding: '0 14px', background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.6)', color: '#161415', fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif', fontSize: 18, outline: 'none' }} />
                                    </div>
                                </div>

                                {/* 🆕 已完成各組紀錄：可即時修改過去填寫的重量 / 次數 */}
                                {(() => {
                                    const editEx = exercisesWithSets[editPanel.absIdx];
                                    const logged = (editEx?.sets || []).filter(s => s && (s.completed || s.weight != null || s.reps != null));
                                    if (logged.length === 0) return null;
                                    const writeLogged = (setIdx, field, val) => {
                                        const base = editEx.sets || [];
                                        // 事後編輯同樣要過界線 —— 這條路徑直接改的是「已存檔」的組數，
                                        // 不收斂的話會繞過完成組時的防呆，一樣會污染 PR 與訓練量。
                                        const safe = val === '' ? ''
                                            : clampSetInput(val, SET_LIMITS[field] || SET_LIMITS.reps);
                                        const newSets = base.map((s, si) => si === setIdx ? { ...s, [field]: safe } : s);
                                        onUpdateLoggedSets?.(editPanel.absIdx, newSets);
                                    };
                                    const stepLogged = (setIdx, field, delta, min = 0) => {
                                        const cur = parseFloat(editEx.sets[setIdx]?.[field]) || 0;
                                        writeLogged(setIdx, field, Math.max(min, +(cur + delta).toFixed(1)));
                                    };
                                    return (
                                        <div style={{ marginBottom: 16 }}>
                                            <label style={{ display: 'block', fontSize: 12, letterSpacing: '0.22em', color: 'rgba(22,20,21,0.6)', fontFamily: '"Geist Mono", monospace', marginBottom: 8 }}>已完成紀錄 LOGGED</label>
                                            {logged.map((set, si) => (
                                                <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                                    <span style={{ width: 26, fontFamily: '"Geist Mono", monospace', fontSize: 12, color: 'rgba(22,20,21,0.5)' }}>#{set.set_number || si + 1}</span>
                                                    {[{ f: 'weight', step: 2.5, unit: 'kg' }, { f: 'reps', step: 1, unit: '次' }].map(({ f, step, unit }) => (
                                                        <div key={f} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, borderRadius: 12, padding: 4, background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.6)' }}>
                                                            <motion.button {...pressProps('row')} onClick={() => stepLogged(si, f, -step)} style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.6)', color: '#161415', fontSize: 16, cursor: 'pointer' }}>−</motion.button>
                                                            <input type="number" value={set[f] ?? ''} onChange={(e) => writeLogged(si, f, e.target.value)}
                                                                style={{ width: 38, textAlign: 'center', background: 'transparent', border: 'none', outline: 'none', fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif', fontSize: 16, color: '#161415' }} />
                                                            <motion.button {...pressProps('row')} onClick={() => stepLogged(si, f, step)} style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.6)', color: '#161415', fontSize: 16, cursor: 'pointer' }}>+</motion.button>
                                                        </div>
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}

                                {/* 加入動作 / 刪除 按鈕（邊做邊填不顯示「加入動作」— 做完直接選下一個） */}
                                <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                                    {!isLiveFill && (
                                        <motion.button {...pressProps('row')} onClick={() => { setAddPanel({ afterAbsIdx: editPanel.absIdx }); setEditPanel(null); }}
 style={{
 flex: 1, height: 48, borderRadius: 12, color: '#fff',
 background: '#F95C4B', border: 'none',
 fontFamily: '"Geist Mono", monospace', fontSize: 13, letterSpacing: '0.1em',
 display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer'
 }}>
                                            + 加入動作
                                        </motion.button>
                                    )}
                                    <motion.button {...pressProps('row')} onClick={() => { onSkip(editPanel.absIdx); setEditPanel(null); }}
 style={{
 flex: 1, height: 48, borderRadius: 12, color: '#fff',
 background: '#161415', border: 'none',
 fontFamily: '"Geist Mono", monospace', fontSize: 13, letterSpacing: '0.1em',
 display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer'
 }}>
                                        × 刪除
                                    </motion.button>
                                </div>

                                <motion.button {...pressProps('row')} onClick={applyEdit}
 style={{
 width: '100%', height: 54, borderRadius: 18, color: '#fff',
 background: 'linear-gradient(180deg, rgba(255,135,117,0.82) 0%, rgba(249,92,75,0.86) 100%)',
 backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)',
 border: '1px solid rgba(255,255,255,0.28)',
 boxShadow: 'inset 0 1.5px 1px rgba(255,225,217,0.55), 0 10px 24px -6px rgba(249,92,75,0.4)',
 fontFamily: '"Geist Mono", monospace', fontSize: 13, letterSpacing: '0.24em',
 cursor: 'pointer'
 }}>儲存</motion.button>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    );
};

// =====================================================
// 🔥 MAIN COMPONENT
// =====================================================
/* ═══════════════════════════════════════════════════════════════════
   單組輸入的合理範圍
   ─────────────────────────────────────────────────────────────────
   重量上限 500 kg：世界紀錄級的蹲舉／硬舉約 500 kg，人類不可能更高；
                   徒手動作為 0，故下限 0。
   次數上限 200 下：高次數耐力訓練也很難超過，200 以上必為誤觸。
   目的是攔截「少打小數點／多按一個 0」，不是限制使用者 ——
   界線刻意放得比任何真實使用者都寬。
   ═══════════════════════════════════════════════════════════════ */
const SET_LIMITS = {
    weight: { min: 0, max: 500 },
    reps:   { min: 0, max: 200 },
};

/* 依動作分級的重量上限
   ─────────────────────────────────────────────────────────────────
   單一 500 kg 門檻擋不住「二頭彎舉 300 kg」這種明顯誤輸入 ——
   對深蹲來說 300 合理，對彎舉來說荒謬。這裡依動作型態再收一層，
   數字仍取「遠高於任何真實使用者」的水準，只攔誤觸不擋強者。 */
const LIFT_WEIGHT_CAP = [
    { max: 100, kw: ['彎舉', 'curl', '飛鳥', 'fly', '側平舉', 'lateral', '面拉', 'face pull',
                     '三頭', 'tricep', '下壓', 'pushdown', '腕', 'wrist', '提踵', 'calf raise'] },
    { max: 200, kw: ['肩推', 'overhead press', 'ohp', '划船', 'row', '下拉', 'pulldown',
                     '引體', 'pull up', '臂屈伸', 'dip', '弓步', 'lunge', '分腿蹲', 'split squat'] },
    { max: 350, kw: ['臥推', 'bench', '推舉', 'press'] },
    // 深蹲／硬舉／臀推等下肢大重量 → 沿用全域 500
];

/** 依動作名稱取得該動作的重量上限（找不到關鍵字就用全域上限） */
export const weightCapFor = (exerciseName = '') => {
    const n = String(exerciseName).toLowerCase();
    for (const { max, kw } of LIFT_WEIGHT_CAP) {
        if (kw.some((k) => n.includes(k.toLowerCase()))) return { min: 0, max };
    }
    return SET_LIMITS.weight;
};

/** 收斂到合理範圍；NaN／空值一律回下限，不讓 undefined 流進紀錄 */
export const clampSetInput = (v, { min, max }) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
};

const WorkoutSessionViewMobile = ({ workoutPlan = {}, userId, onExit, onOpenAnalysis }) => {
    const playback = useSonicPlayback();
    const [activeImages, setActiveImages] = useState([]);
    const [currentFrame, setCurrentFrame] = useState(0);
    const [imgFailed, setImgFailed] = useState(false); // 圖片載入失敗 → 降級到 placeholder

    // 🧹 卸載安全的 setTimeout：集中追蹤所有一次性視覺回饋計時器
    //   （漣漪 / 完成閃光 / 氛圍燈）。使用者在動畫期間離開訓練頁時，
    //   卸載 cleanup 會一次清空全部 pending timeout，避免「卸載後 setState」
    //   的 React 警告與記憶體洩漏。
    const pendingTimeoutsRef = useRef(new Set());
    const safeTimeout = React.useCallback((fn, delay) => {
        const id = setTimeout(() => {
            pendingTimeoutsRef.current.delete(id);
            fn();
        }, delay);
        pendingTimeoutsRef.current.add(id);
        return id;
    }, []);
    useEffect(() => () => {
        pendingTimeoutsRef.current.forEach(clearTimeout);
        pendingTimeoutsRef.current.clear();
    }, []);

    // Hide global CapsuleNavigation (and TutorialBadge) during the immersive workout session
    useEffect(() => {
        window.dispatchEvent(new CustomEvent('toggle-capsule-nav', { detail: { hidden: true } }));
        return () => window.dispatchEvent(new CustomEvent('toggle-capsule-nav', { detail: { hidden: false } }));
    }, []);

    const effectivePlan = useMemo(() => {
        if (workoutPlan && (workoutPlan.exercises || workoutPlan.data?.exercises)) {
            return workoutPlan;
        }
        try {
            // 優先用 userId 命名空間的 key 讀取，自動遷移舊 key
            const store = uStorage(userId || localStorage.getItem('userId'));
            const saved = store.get('currentWorkoutPlan', null);
            if (saved) return saved;
        } catch (e) {
            console.error("Failed to recover plan", e);
        }
        return workoutPlan || {};
    }, [workoutPlan]);

    // 在訓練開始時固定所屬課表，不能在結束時重新讀取另一份目前課表。
    const completionPlanId = useRef(effectivePlan.plan_id || effectivePlan.planId || activeStrengthPlanId(userId || localStorage.getItem('userId'))).current;

    // Session state — all hooks declared BEFORE any conditional return (Rules of Hooks)
    const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
    // ❌ 刪除這行： const [currentSet, setCurrentSet] = useState(1);
    const [isResting, setIsResting] = useState(false);
    const [restTimeRemaining, setRestTimeRemaining] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    // 🕒 訓練計時器：用「持久化時間戳」而非單純 prev+1，
    //   這樣切到分析頁再切回來（元件重新掛載）時，計時不會歸零重來。
    //   模型：baseElapsed（已累積的秒數）+ 目前進行中區段(segStartedAt→now)。
    // ─────────────────────────────────────────────────────────────
    // 🆕 訓練暗存升級為 localStorage（關閉瀏覽器重開也能復原）
    //   - sessionStorage 會隨分頁關閉清空，localStorage 不會。
    //   - 為避免「很久以前的殘留」被誤還原，加上 TTL（預設 6 小時）。
    //   - 計時器與進度共用同一套儲存與過期規則，確保兩者一致。
    //   - 還原採「先暫存、由使用者選擇繼續或重來」，不自動套用。
    // ─────────────────────────────────────────────────────────────
    const PROGRESS_TTL_MS = 6 * 60 * 60 * 1000; // 6 小時內的未完成訓練才提供還原

    const TIMER_KEY = 'drvn:workoutTimer';
    const readWorkoutTimer = () => {
        try {
            const raw = JSON.parse(localStorage.getItem(TIMER_KEY));
            if (!raw) return null;
            // 過期的計時器一律視為無效（避免顯示一個練了 10 小時的怪數字）
            if (raw.savedAt && Date.now() - raw.savedAt > PROGRESS_TTL_MS) return null;
            return raw;
        } catch { return null; }
    };
    const writeWorkoutTimer = (v) => {
        try { localStorage.setItem(TIMER_KEY, JSON.stringify({ ...v, savedAt: Date.now() })); } catch { /* ignore */ }
    };
    const computeElapsed = (t) => {
        if (!t) return 0;
        const seg = t.segStartedAt ? Math.floor((Date.now() - t.segStartedAt) / 1000) : 0;
        return (t.baseElapsed || 0) + Math.max(0, seg);
    };

    const PROGRESS_KEY = 'drvn:workoutProgress';
    const planSig = useMemo(() => {
        const exs = effectivePlan?.exercises || effectivePlan?.data?.exercises || [];
        // 用 使用者 + 動作數 + 各動作名稱串接 當指紋，足以辨識「是不是同一份訓練」
        return `${userId || ''}|${exs.length}|${exs.map(e => e.name).join(',')}`;
    }, [effectivePlan, userId]);
    const readProgress = (opts = {}) => {
        try {
            const raw = JSON.parse(localStorage.getItem(PROGRESS_KEY));
            if (!raw) return null;
            // 🆕 ignoreSig：從姿勢分析返回時放行 — 自由訓練（邊做邊填）中途加動作會讓
            //    指紋與初始計劃不同，但快照就是幾秒前自己存的，直接信任。
            if (!opts.ignoreSig && raw.planSig !== planSig) return null;    // 指紋不符 → 不同訓練
            if (raw.savedAt && Date.now() - raw.savedAt > PROGRESS_TTL_MS) return null; // 過期
            return raw;
        } catch { return null; }
    };
    const writeProgress = (v) => {
        try {
            localStorage.setItem(PROGRESS_KEY, JSON.stringify({ ...v, planSig, savedAt: Date.now() }));
        } catch { /* ignore（容量滿等情況不影響訓練進行）*/ }
    };
    const clearProgress = () => {
        try {
            localStorage.removeItem(PROGRESS_KEY);
            localStorage.removeItem(TIMER_KEY);
        } catch { /* ignore */ }
    };

    // 🆕 從「姿勢分析」返回：不彈還原卡、不重跑計劃 — 靜默接回進度與計時。
    //    handleUseAnalysis 離開前會種下這個 flag；這裡消費掉它。
    const [resumeFromAnalysis] = useState(() => {
        try {
            if (sessionStorage.getItem('drvn:resumeWorkoutFromAnalysis') === '1') {
                sessionStorage.removeItem('drvn:resumeWorkoutFromAnalysis');
                return true;
            }
        } catch { /* ignore */ }
        return false;
    });
    // 🆕 啟動時讀一次暗存快照；有「已完成至少一組」才需要詢問使用者是否還原。
    //   初始 state 一律保持乾淨（不自動套用），等使用者在卡片上選「繼續上次」才套。
    //   從姿勢分析返回時放寬指紋檢查（自由訓練中途加動作會改變指紋）。
    const initialRestoreRef = useRef(readProgress({ ignoreSig: resumeFromAnalysis }));
    const hasRestorable =
        !!initialRestoreRef.current &&
        Array.isArray(initialRestoreRef.current.completedSets) &&
        initialRestoreRef.current.completedSets.length > 0;
    const [showRestorePrompt, setShowRestorePrompt] = useState(hasRestorable && !resumeFromAnalysis);

    // 🔁 Plan Echo：偵測「同款/相似課表」→ 開場跳出「上次表現」提示卡
    const [planEcho, setPlanEcho] = useState(null); // { opener, echo, similarity }
    useEffect(() => {
        // 只在「全新開始」時顯示（有可還原進度＝中途回來，不干擾）
        if (hasRestorable || resumeFromAnalysis) return;
        let alive = true;
        (async () => {
            try {
                const { getStrengthEcho, echoOpener } = await import('../utils/planEcho');
                const exs = effectivePlan?.exercises || effectivePlan?.data?.exercises || [];
                const hit = getStrengthEcho(effectiveUserId, exs);
                if (alive && hit?.echo?.bullets?.length) {
                    setPlanEcho({ opener: echoOpener('strength'), ...hit });
                    // 📊 市場觀察：回聲提示曝光（上市後驗證此功能的價值）
                    import('../utils/telemetry').then(({ track }) => track('plan_echo_shown', { type: 'strength', similarity: hit.similarity })).catch(() => {});
                }
            } catch { /* 回聲屬 nice-to-have */ }
        })();
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* 🩹 白卡原本只有按 × 才會消失 —— 使用者不理它就整場訓練都掛在畫面上，
       而且排在它後面的「教練提醒」永遠等不到。改成開場看一眼就好：
       10 秒後自動退場（動畫已由 AnimatePresence 處理）。 */
    useEffect(() => {
        if (!planEcho) return undefined;
        const id = setTimeout(() => setPlanEcho(null), 10000);
        return () => clearTimeout(id);
    }, [planEcho]);

    const [totalTimeElapsed, setTotalTimeElapsed] = useState(0);
    const [completedSets, setCompletedSets] = useState([]);
    const [ambientFlash, setAmbientFlash] = useState(false);   // 氛圍燈：完成一組時短暫綠光
    const [showPauseMenu, setShowPauseMenu] = useState(false);
    const [showEndConfirm, setShowEndConfirm] = useState(false);   // 長按結束訓練確認視窗
    const [endConfirmExpanded, setEndConfirmExpanded] = useState(true);  // 結束視窗：展開/收合已完成動作
    const [showCompletion, setShowCompletion] = useState(false);
    const [showShareCard, setShowShareCard] = useState(false); // 結算頁 → 分享卡片切換
    // 📍 這次在哪裡練 —— 存檔時反解出來的真實地名，分享卡要用它
    //    （分享卡原本寫死 'Taipei City'，那是印在要貼出去的圖上的假資料）
    const [savedLocationName, setSavedLocationName] = useState('');
    const [achievements, setAchievements] = useState([]);
    // 🆕 休息畫面：精選運動員語錄（每次休息隨機抽一句）+ PR 彩蛋
    const [restQuote, setRestQuote] = useState(() => getRestQuote());
    const [prCelebration, setPrCelebration] = useState(null); // { name, oldPR, newPR, kind, quote }
    // 🩹 restAdjust 已移除：它只餵那顆「+15s · RPE」小標，而 setRestAdjust 從頭到尾
    //    沒有任何呼叫端 —— 值永遠是 0，那顆 pill 其實從來沒出現過。
    // 🆕 組間休息頁「下一組建議重量」：依上一組重量 + RPE（或上次訓練紀錄）計算
    const [nextSetSuggestion, setNextSetSuggestion] = useState(null); // { exercise, weight, reason }
    const [exerciseTip, setExerciseTip] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [showWeightInput, setShowWeightInput] = useState(false);
    const [showLastSessionRecord, setShowLastSessionRecord] = useState(false);
    // 🆕 點動作大圖跳出的「動作面板」：可直接改組數/次數/休息（草稿，按儲存才套用）
    const [exerciseDraft, setExerciseDraft] = useState(null);
    const [inputWeight, setInputWeight] = useState('');
    const [inputReps, setInputReps] = useState('');
    const [prAlerts, setPrAlerts] = useState([]);
    const [exercisePRs, setExercisePRs] = useState({});
    // 🆕 各動作「歷史最佳 e1RM」：耗力分數與訓練區間的正確基準
    //    （舊版拿 pr_weight〔最大重量〕當 1RM，8–12 下的訓練會把強度整體高估）
    const [exerciseE1RMs, setExerciseE1RMs] = useState({});
    const [lastSessionStats, setLastSessionStats] = useState({});
    // 🆕 加重提示改為「每個動作各自一則」的 map：{ [動作名]: {weight, message} | null }
    //    只在該動作顯示；做完該動作第一組（重量已定）就自動消失，不再跨動作殘留。
    const [overloadSuggestions, setOverloadSuggestions] = useState({});
    const [completedChallenge, setCompletedChallenge] = useState(null);
    const [showChallengeCelebration, setShowChallengeCelebration] = useState(false);
    const [substituteOptions, setSubstituteOptions] = useState([]);
    const [substituteHint, setSubstituteHint] = useState('');
    const [showSubstituteModal, setShowSubstituteModal] = useState(false);
    const [inputRPE, setInputRPE] = useState(8); // Default to RPE 8 (2 reps reserve)
    // 🆕 配重計算機：是否展開 + 目前選的空槓重（記憶在 localStorage）
    const [showPlateCalc, setShowPlateCalc] = useState(false);
    const [barWeight, setBarWeight] = useState(() => {
        try { return parseFloat(localStorage.getItem('drvn_bar_weight')) || 20; } catch { return 20; }
    });
    const [isTransitionActive, setIsTransitionActive] = useState(false);
    const [finalStats, setFinalStats] = useState({ volume: 0, sets: 0 });
    // ── Mid-session: Skip + Add Exercise + Queue Sheet ──
    const [showAddExerciseModal, setShowAddExerciseModal] = useState(false);
    const [addExSearch, setAddExSearch] = useState('');
    const [addExCategory, setAddExCategory] = useState('all');
    const [showSkipConfirm, setShowSkipConfirm] = useState(false);
    const [showQueueSheet, setShowQueueSheet] = useState(false);
    // 🆕 自由訓練（直接訓練模式）：做完一個動作後彈出「選下一個 / 完成此次計劃」
    const isFreestyle = !!(effectivePlan?.isFreestyle || workoutPlan?.isFreestyle);
    // 🆕 邊做邊填：只設次數/休息，組數開放，做完一組休息、按「完成此動作」才選下個。
    //    只有這個子模式套用新流程；「先排好整份」的自由訓練維持原本組數制。
    const isLiveFill = !!(effectivePlan?.fillWhileDoing || workoutPlan?.fillWhileDoing);
    const [freestyleNextOpen, setFreestyleNextOpen] = useState(false);
    // 🆕 結束前的「訓練回顧 + 編輯 + 結束確認」卡（所有訓練最後一組 / 長按結束都會跳出）
    const [showSummaryReview, setShowSummaryReview] = useState(false);
    // 重訓術語說明（1RM / 訓練分區 / RPE / LOAD / 訓練量）—— 2026-08 稽核新增
    const [showTermsHelp, setShowTermsHelp] = useState(false);
    const [justCompleted, setJustCompleted] = useState(false);
    const [lastEffortScore, setLastEffortScore] = useState(null);
    const [addExInsertIndex, setAddExInsertIndex] = useState(null); // 記錄要安插的位置
    const [syncToast, setSyncToast] = useState(null); // { type: 'success'|'error', msg: string }

    // 🔴 Fix(session-guard): 離開確認彈窗，防止訓練中誤觸返回鍵遺失進度
    const [showExitGuard, setShowExitGuard] = useState(false);

    // 安全離開：有已完成組數時先彈確認，否則直接離開
    const safeExit = () => {
        if (completedSets.length > 0 && !showCompletion) {
            setShowExitGuard(true);
        } else {
            clearProgress();   // 🆕 清掉暗存的進度與計時器（localStorage）
            closeOrb(); clearAnalysisJob();   // 離開訓練 → 浮球一併消失
            onExit();
        }
    };

    // ── Toast 自動消失 ──
    useEffect(() => {
        if (!syncToast) return;
        const t = setTimeout(() => setSyncToast(null), 4000);
        return () => clearTimeout(t);
    }, [syncToast]);

    /* ── e1RM 估算 ──────────────────────────────────────────────────
       這段註解原本寫「與趨勢分析頁一致，避免兩套公式互相打架」，
       但它夾 15、趨勢分析頁夾 12 —— 實際上還是打架的。
       🔢 2026-09 稽核：改讀 utils/strengthMath，這次是真的一致。 */
    const estimate1RM = epleyE1RM;

    // 耗力得分（修正版）：
    //   基準改為「歷史最佳 e1RM」— 舊版拿 pr_weight（最大重量）當 1RM，
    //   會把 8–12 下的訓練組整體高估 20–30%。
    //   分數構成：70% 相對強度（本組 e1RM / 歷史最佳 e1RM）+ 30% 主觀 RPE。
    //   100 = 與你的歷史最佳輸出同水準；>100 = 正在突破。
    const calculateEffortScore = (weight, reps, rpe, exerciseName) => {
        const currentE1RM = estimate1RM(weight, reps);
        // 無歷史資料 → 用本組自身當基準（此時分數主要反映 RPE）
        const refE1RM = exerciseE1RMs[exerciseName] || currentE1RM || 1;
        const intensityRatio = Math.min(currentE1RM / refE1RM, 1.25);
        const rpeWeight = Math.min(Math.max(parseFloat(rpe) || 8, 1), 10) / 10;
        return Math.min(Math.round((intensityRatio * 0.7 + rpeWeight * 0.3) * 100), 120);
    };

    /* 訓練分區推估整支移除 —— 它唯一的用途是在記錄面板的重量欄位旁邊
       印「肌肥大 79% 1RM」，那個徽章已經拿掉了（見該處註解）。
       留著一支沒人呼叫的推估函式，下次只會有人把它接回別的地方。 */

    // 新增：解析次數範圍 (例如 "10-12" -> { min: 10, max: 12 })
    const parseRepRange = useCallback((repsString) => {
        if (!repsString) return { min: 10, max: 10 };
        const str = repsString.toString();
        if (str.includes('-')) {
            const parts = str.split('-');
            return { min: parseInt(parts[0], 10) || 10, max: parseInt(parts[1], 10) || 10 };
        }
        const val = parseInt(str, 10);
        return { min: val || 10, max: val || 10 };
    }, []);

    // 🩹 getEffortSuggestion 已移除：它是「AI Coach 建議」卡的文字，
    //    而那張卡與「下一組建議重量」講的是同一個 RPE，已合併；
    //    要給的處方就是那張卡上的建議重量與 reason，不需要再多一段散文。

    // 🎯 LOAD 的明確意義（Definition §3.4：數字旁一定要有錨點）。
    //   LOAD = 相對強度（本組 e1RM ÷ 歷史最佳）× 70% + 主觀 RPE × 30%，封頂 120。
    //   所以它「已經結合 RPE」。分區告訴使用者「這個負荷落在哪個帶」：
    //     ≥105 過載區（力竭邊緣，要留意關節）
    //     90–104 最佳區（安全且最有效的增肌帶）
    //     70–89 有效區（還有餘力，可再進一階）
    //     <70 暖身區
    //   顏色用高對比的實色文字（原本的沙色 #C9A876 在灰底上幾乎看不見）。
    const getLoadZone = (score) => {
        if (!score) return { label: '—', hint: '', color: 'rgba(22,20,21,0.4)', bg: 'rgba(22,20,21,0.06)', border: 'rgba(22,20,21,0.12)' };
        if (score >= 105) return { label: '過載區', hint: '力竭邊緣 · 留意關節', color: '#D94030', bg: 'rgba(217,64,48,0.12)', border: 'rgba(217,64,48,0.5)' };
        if (score >= 90)  return { label: '最佳區', hint: '安全且最有效的增肌帶', color: '#F95C4B', bg: 'rgba(249,92,75,0.12)', border: 'rgba(249,92,75,0.5)' };
        if (score >= 70)  return { label: '有效區', hint: '身體可負荷 · 還有餘力', color: '#5A7A3A', bg: 'rgba(90,122,58,0.12)', border: 'rgba(90,122,58,0.45)' };
        return { label: '暖身區', hint: '強度偏低 · 可再加', color: '#5B7183', bg: 'rgba(91,113,131,0.12)', border: 'rgba(91,113,131,0.4)' };
    };

    // 🔥 Robust User Identification: Fallback to localStorage if prop is missing
    const effectiveUserId = useMemo(() => {
        if (userId) return userId;
        const cachedId = localStorage.getItem('userId');
        if (cachedId) return cachedId;
        return getUserId(); // Last resort fallback
    }, [userId]);

    // 🆕 教練回饋帶入：上次結算頁的「動作級教練回饋」，這次做到同動作時提醒。
    //    來源：StrengthResultsMobile 收到 AI 總評後存進 localStorage（14 天內有效）。
    const coachNotes = useMemo(() => {
        try {
            const raw = JSON.parse(localStorage.getItem(`drvn:coachNotes:${effectiveUserId}`)) || {};
            const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
            const valid = {};
            Object.entries(raw).forEach(([name, v]) => {
                if (v && v.note && (!v.date || new Date(v.date).getTime() > cutoff)) valid[name] = v;
            });
            return valid;
        } catch { return {}; }
    }, [effectiveUserId]);
    // 使用者滑掉的提醒（本次訓練內不再出現）
    const [dismissedCoachNotes, setDismissedCoachNotes] = useState({});

    // 🏋️ 健身房模式：mode='gym' → Swift 端開 traditionalStrengthTraining
    //                disableSimulation=true → 沒手錶時 metrics 維持 0，UI 顯示 "--"
    const { metrics, dataAvailability,
        isHealthKitAvailable: hkIsAvailable, isAuthorized: hkIsAuthorized,
        isWorkoutActive: hkIsActive, startWorkout: hkStartWorkout,
        pauseWorkout: hkPauseWorkout, resumeWorkout: hkResumeWorkout, endWorkout: hkEndWorkout
    } = useHealthKit({ mode: 'gym', disableSimulation: true });

    // ⌚ Apple Watch 連線狀態（來自原生 WatchConnectivity 橋接）
    const watch = useWatchConnection();

    // 🆕 是否有真實手錶數據（用來決定顯示 "--" 或數字）
    //    來源擴充：HealthKit 心率 OR 手錶 WatchConnectivity 直接送來的即時心率。
    const hasWatchData = (hkIsAvailable && hkIsAuthorized && (dataAvailability?.hasHeartRateData || metrics.heartRate > 0))
        || watch.isRecording || watch.liveHeartRate > 0;

    // 顯示用心率：優先用 HealthKit，沒有時退而用手錶 WatchConnectivity 心率
    const displayHeartRate = metrics.heartRate > 0 ? metrics.heartRate : watch.liveHeartRate;
    // 顯示用卡路里：優先 HealthKit，沒有時退而用手錶 WatchConnectivity 卡路里
    const displayCalories = metrics.calories > 0 ? metrics.calories : watch.liveCalories;

    // 心率警示邏輯 (移至 metrics 初始化之後)
    // 🆕 沒手錶資料時不觸發警示，避免無資料卻被當成「過高」
    const hrThreshold = 160;
    const isHRTooHigh = hasWatchData && metrics.heartRate > hrThreshold;

    const [exercisesWithSets, setExercisesWithSets] = useState(() => {
        const sourceExercises = effectivePlan.exercises || effectivePlan.data?.exercises || [];
        // 🆕 一律從乾淨狀態開始；是否套用暗存由使用者在還原卡上決定（見 applyRestore）
        return sourceExercises.map(ex => ({
            ...ex,
            sets: [],
            // 邊做邊填（openEnded）不設固定組數，保留 99 哨兵；其餘照原本自動加熱身組
            sets_target: ex.openEnded ? 99 : (ex.warmupSets || 0) + (ex.sets || 3),
            completed: false
        }));
    });

    // 🏋️ 健身房記憶：開始時認出是哪一間（會員：客製的健身房先換成這間做得到的動作），
    //    結束時問跳過的動作是不是沒器材。邏輯全在 hooks/useGymSession。
    const gymSession = useGymSession({
        userId: effectiveUserId,
        exercises: exercisesWithSets,
        setExercises: setExercisesWithSets,
        enabled: !!effectiveUserId,
        trackSkips: !isFreestyle,
        preset: effectivePlan?.gymChoice || null,   // 預覽面板選的健身房（菜單已照這間換好）
    });
    const localRecordIdRef = useRef(null);         // 本機 trainingRecords 這一場的 id（健身房問完回填用）
    useEffect(() => {
        const ch = gymSession.adapted;
        if (!ch?.length || !gymSession.gym) return;
        appToast.info(ch.length > 1
            ? `照這間的器材換了 ${ch.length} 個動作`
            : `這間沒有${ch[0].station}，改做${toZhExerciseName(ch[0].to) || ch[0].to}`);
    }, [gymSession.adapted, gymSession.gym]);

    // 🆕「繼續上次」：把暗存的進度套回三個 state；只在使用者按下時呼叫
    const applyRestore = () => {
        const saved = initialRestoreRef.current;
        if (!saved) { setShowRestorePrompt(false); return; }
        try {
            if (Array.isArray(saved.completedSets)) setCompletedSets(saved.completedSets);
            if (Array.isArray(saved.exercisesWithSets)) {
                setExercisesWithSets(prev => {
                    // 以目前計劃為底，只把每個動作的 sets/completed 蓋回去（長度需相符）。
                    // 🆕 長度不符（自由訓練中途加過動作）且是從姿勢分析返回 → 整份採用快照
                    if (saved.exercisesWithSets.length !== prev.length) {
                        return resumeFromAnalysis ? saved.exercisesWithSets : prev;
                    }
                    return prev.map((ex, i) => ({
                        ...ex,
                        sets: saved.exercisesWithSets[i]?.sets || [],
                        completed: saved.exercisesWithSets[i]?.completed || false,
                    }));
                });
            }
            if (Number.isInteger(saved.currentExerciseIndex)) {
                // 🆕 上限以「快照的動作數」為準（自由訓練的快照可能比初始計劃長）
                const exs = effectivePlan?.exercises || effectivePlan?.data?.exercises || [];
                const maxLen = Math.max(exs.length, Array.isArray(saved.exercisesWithSets) ? saved.exercisesWithSets.length : 0);
                setCurrentExerciseIndex(Math.min(saved.currentExerciseIndex, Math.max(0, maxLen - 1)));
            }
            // 計時器也接回來（用暗存的 baseElapsed 續算）
            const t = readWorkoutTimer();
            if (t) setTotalTimeElapsed(computeElapsed(t));
        } catch (e) {
            console.warn('還原訓練進度失敗:', e);
        }
        setShowRestorePrompt(false);
    };

    // 🆕「重新開始」：丟掉暗存，從零開始
    const discardRestore = () => {
        clearProgress();
        initialRestoreRef.current = null;
        setShowRestorePrompt(false);
    };

    // 🆕 從姿勢分析返回 → 靜默還原（不彈卡、不重跑計劃、進度條不歸零）
    useEffect(() => {
        if (resumeFromAnalysis) applyRestore();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 🆕 進度變動就暗存（completedSets / 每組配重次數 / 目前動作）。
    //    還沒回答還原卡、或結算畫面開啟後都不覆寫（避免蓋掉待還原的快照 / 把已完成訓練又存回去）。
    useEffect(() => {
        if (showCompletion || showRestorePrompt) return;
        writeProgress({ completedSets, exercisesWithSets, currentExerciseIndex });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [completedSets, exercisesWithSets, currentExerciseIndex, showCompletion, showRestorePrompt]);

    const timerRef = useRef(null);
    const restTargetTimeRef = useRef(0);
    // 🆕 上一組的 RPE（動態休息秒數用：費力 → 多休息、輕鬆 → 少休息）
    const lastRpeRef = useRef(8);
    // 🆕 使用者在休息頁按了「帶入下一組」→ 下次打開記錄面板時用這個重量預填
    const acceptedSuggestionRef = useRef(null); // { exercise, weight }
    // 🔥 暫停時保存「剩餘毫秒數」，恢復時用它重算目標時間，避免暫停期間休息倒數繼續流失
    const restRemainingMsRef = useRef(0);
    const sessionTimerRef = useRef(null);
    // 本次訓練畫面是否已啟動過計時（用來只在首次歸零）。
    // 🆕 從姿勢分析返回時視為「已啟動」→ 不歸零，接續持久化的計時往下數。
    const timerStartedRef = useRef(resumeFromAnalysis);

    // Derived values (guarded with optional chaining for empty-plan case)
    const exercises = effectivePlan?.exercises || effectivePlan?.data?.exercises || [];
    const currentExercise = exercisesWithSets[currentExerciseIndex];

    // 🔥 ✅ 新增：動態計算當前動作做到第幾組 (根據已經存下的歷史紀錄長度)
    const currentSet = currentExercise ? Math.min((currentExercise.sets?.length || 0) + 1, currentExercise.sets_target || 3) : 1;

    // 🏝️ 重訓 Live Activity（鎖屏卡＋靈動島，與跑步同一套原生機制，mode:'gym'）
    //    進訓練建立 → 動作/組數/暫停/計時變化更新（JS 端 3s 節流）→ 結算或離開頁面結束。
    const gymLARef = useRef(false);
    // 🗑️ 結算頁「長按取消紀錄」：記住這次存檔的 session id 才刪得掉
    const savedSessionIdRef = useRef(null);
    // 長按取消時，存檔可能還在路上（saveWorkout 尚未回來、拿不到 session id）→ 用這個旗標在回來後補刪
    const cancelledRef = useRef(false);
    // 這一場「新打的」課表勾：取消紀錄要一起拿掉（原本就打過勾的那天不動）
    const recordedPlanDayRef = useRef(null);
    // 結束確認連點兩下 → completeWorkout 跑兩次、存兩筆。進入後就鎖住。
    const completingRef = useRef(false);
    // 🩹 結算時定格的最終時長（clearProgress 清掉計時器後，這是唯一可信來源）
    const finalDurationRef = useRef(0);
    useEffect(() => {
        if (showCompletion || !currentExercise) return;
        const payload = {
            exerciseName: currentExercise.name || '重量訓練',
            setLabel: `${currentSet}/${currentExercise.sets_target || 3} 組`,
            elapsedSec: totalTimeElapsed,
            isPaused,
        };
        if (!gymLARef.current) { gymLARef.current = true; startGymActivity(payload); }
        else updateGymActivity(payload);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentExerciseIndex, currentSet, isPaused, totalTimeElapsed, showCompletion]);
    useEffect(() => {
        // 結算畫面開啟 → 結束（鎖屏顯示總結 4 秒後自動消失）
        if (showCompletion && gymLARef.current) {
            gymLARef.current = false;
            stopGymActivity({ exerciseName: '訓練完成', setLabel: 'DONE', elapsedSec: totalTimeElapsed });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showCompletion]);
    useEffect(() => () => {
        // 離開訓練頁的 unmount 保險：一定收掉，不留殭屍鎖屏卡
        if (gymLARef.current) { gymLARef.current = false; stopGymActivity({}); }
    }, []);

    // 🆕 加重提示（衍生值）：只在「當前動作」且「還沒做第一組」時顯示；
    //    一旦記錄了第一組（重量已敲定）或滑掉，就消失，不會跨動作殘留。
    const overloadSuggestion = (currentExercise && (currentExercise.sets?.length || 0) === 0)
        ? (overloadSuggestions[currentExercise.name] || null)
        : null;
    const dismissOverloadSuggestion = () => {
        if (currentExercise) setOverloadSuggestions(prev => ({ ...prev, [currentExercise.name]: null }));
    };

    // 🆕 教練回饋提醒（衍生值）：這次做到「上次結算頁教練點名的動作」且還沒做第一組時顯示。
    //    與 Micro-Win 同一個版位；Micro-Win 優先（同時存在時先顯示加重提示）。
    const coachNote = (currentExercise && (currentExercise.sets?.length || 0) === 0 && !dismissedCoachNotes[currentExercise.name])
        ? (coachNotes[currentExercise.name]?.note || null)
        : null;
    const dismissCoachNote = () => {
        if (currentExercise) setDismissedCoachNotes(prev => ({ ...prev, [currentExercise.name]: true }));
    };

    // 🏋️ 槓片計算適用性：只有「槓鈴 / 史密斯」這類上槓片的動作才顯示槓片計算與快速加片鈕。
    //    啞鈴、繩索、機械、壺鈴、彈力帶、自重動作一律不顯示（細節決定專業感）。
    const isBarbellExercise = useMemo(() => {
        const name = currentExercise?.name;
        if (!name) return false;
        // ① 先查動作資料庫的器材欄位（最可靠）
        const db = ALL_EXERCISES.find(e => e.name === name || e.name?.toLowerCase() === String(name).toLowerCase());
        if (db?.eq) return db.eq === 'barbell';
        // ② 查不到 → 名稱關鍵字判斷：先排除明確非槓鈴器材
        const n = String(name).toLowerCase();
        if (/dumbbell|cable|machine|kettlebell|band|bodyweight/.test(n) || /啞鈴|繩索|機械|器械|壺鈴|彈力|自重/.test(name)) return false;
        // ③ 槓鈴 / 史密斯（史密斯機一樣上槓片）與經典槓鈴動作
        return /barbell|smith|deadlift|romanian|back squat|front squat|overhead press|bench press|hip thrust/.test(n)
            || /槓鈴|史密斯|硬舉|臥推|深蹲|臀推|肩推/.test(name);
    }, [currentExercise?.name]);
    const totalSets = exercisesWithSets.reduce((sum, ex) => sum + (ex.sets_target || 3), 0);
    const completedSetsCount = completedSets.length;
    // 🔒 上限 100%：自由訓練（邊做邊填）動作數會一路增加，避免出現 450% 這種怪數字
    const progress = totalSets > 0 ? Math.min(100, (completedSetsCount / totalSets) * 100) : 0;
    // 🔥 FIX: 永遠以本地秒數 totalTimeElapsed 為單一真實來源，
    //   避免 metrics.duration (Swift HK builder.elapsedTime) 與本地計時並存造成跳動。
    const displayDuration = totalTimeElapsed;

    // ── fetchExercisePR 必須宣告在 useEffect 之前（避免 temporal dead zone 問題）──
    const fetchExercisePR = useCallback(async (exerciseName) => {
        try {
            const response = await fetch(`http://${window.location.hostname}:8000/api/strength/history/${effectiveUserId}?exercise=${encodeURIComponent(exerciseName)}`);
            if (response.ok) {
                const data = await response.json();
                const exerciseData = Array.isArray(data) ? data : (data[exerciseName] || []);
                if (exerciseData?.length > 0) {
                    const maxPR = Math.max(...exerciseData.map(r => r.pr_weight || 0));
                    setExercisePRs(prev => ({ ...prev, [exerciseName]: maxPR }));
                    // 🆕 歷史最佳 e1RM（Epley）：耗力分數 / 訓練區間的正確基準
                    // 🔢 這裡原本夾 15，同檔案上方的 estimate1RM 夾 15、趨勢頁夾 12 ——
                    //    「歷史最佳 e1RM」跟畫面上顯示的 e1RM 用的不是同一把尺。
                    const bestE1RM = calcBestE1RM(
                        exerciseData.map(r => ({ weight: r.training_weight || r.pr_weight, reps: r.reps }))
                    );
                    if (bestE1RM > 0) setExerciseE1RMs(prev => ({ ...prev, [exerciseName]: bestE1RM }));
                    const sorted = [...exerciseData].sort((a, b) => new Date(b.date) - new Date(a.date));

                    if (sorted.length > 0) {
                        setLastSessionStats(prev => ({
                            ...prev,
                            [exerciseName]: {
                                weight: sorted[0].training_weight || sorted[0].pr_weight || 0,
                                reps: sorted[0].reps || 10
                            }
                        }));

                        // 🔥 漸進性超負荷 (Progressive Overload) 智能判斷
                        const currentExTarget = effectivePlan.exercises?.find(e => e.name === exerciseName)
                            || effectivePlan.data?.exercises?.find(e => e.name === exerciseName);
                        const repRange = parseRepRange(currentExTarget?.reps);
                        const lastReps = parseInt(sorted[0].reps || 0, 10);

                        // 💳 會員：每次訓練帶好重量 —— e1RM 反推今天這個次數該用多重
                        //    （與換季負重處方同一條規則：e1rmAdvisor.prescribeWorkingWeight）
                        //    2026-09 教練等級：最近 3 次加權、上次每組做滿就加一格、準備度低先減、附暖身組
                        const rx = canUse('sessionWeight')
                            ? sessionPrescription(effectiveUserId, exerciseName, currentExTarget?.reps, {
                                readinessScore: getTodayReadiness(effectiveUserId)?.score ?? null,
                                eq: defOfExercise(exerciseName)?.eq || null,
                            })
                            : null;
                        const rxWeight = rx?.weight || null;

                        if (rxWeight) {
                            setOverloadSuggestions(prev => ({
                                ...prev,
                                [exerciseName]: {
                                    weight: rxWeight,
                                    prescribed: true,
                                    message: `${rxWeight}kg · ${rx.reason}`,
                                    warmups: rx.warmups || [],
                                }
                            }));
                        } else if (sorted[0].training_weight > 0 && lastReps >= repRange.max) {
                            setOverloadSuggestions(prev => ({
                                ...prev,
                                [exerciseName]: {
                                    weight: sorted[0].training_weight + 2.5,
                                    message: `上次已成功完成 ${repRange.max} 下！今天要不要挑戰加重到 ${sorted[0].training_weight + 2.5}kg？`
                                }
                            }));
                        } else if (sorted.length >= 2 && sorted[0].training_weight > 0 && sorted[0].training_weight === sorted[1].training_weight) {
                            setOverloadSuggestions(prev => ({
                                ...prev,
                                [exerciseName]: {
                                    weight: sorted[0].training_weight + 2.5,
                                    message: `已經連續兩次使用 ${sorted[0].training_weight}kg，準備好突破了嗎？`
                                }
                            }));
                        } else {
                            setOverloadSuggestions(prev => ({ ...prev, [exerciseName]: null }));
                        }
                    }
                }
            }
        } catch (_err) {
            // Silent fail — PR 讀取失敗不影響訓練流程
        }
    }, [effectiveUserId, effectivePlan, parseRepRange]);

    // All useEffect hooks must be before any conditional return
    useEffect(() => {
        hkStartWorkout();
        // 🔄 每次打開訓練畫面 → 計時器歸零、立刻開始計時(baseElapsed=0 + 此刻為起點)。
        //    注意：只清空持久值，實際的每秒遞增交給下方計時 interval effect 處理。
        // ⌚ 同時叫 Apple Watch 開 HKWorkoutSession——心率/卡路里要靠手錶量測再透過
        //    WatchConnectivity 傳回(iPhone 沒有心率感測器)。沒這行手錶永遠不會傳心率。
        try { if (localStorage.getItem('watchData_gym') !== 'false') window.webkit?.messageHandlers?.watchWorkout?.postMessage({ command: 'START', mode: 'gym' }); } catch (_) {}
        return () => {
            // 離開訓練畫面 → 通知手錶結束 workout，停止量測、省電
            try { window.webkit?.messageHandlers?.watchWorkout?.postMessage({ command: 'STOP', mode: 'gym' }); } catch (_) {}
        };
    }, []);

    useEffect(() => {
        if (currentExercise?.name) {
            setExerciseTip(getExerciseTip(currentExercise.name));
            if (!exercisePRs[currentExercise.name]) fetchExercisePR(currentExercise.name);
        }
    }, [currentExerciseIndex, currentExercise?.name, fetchExercisePR]);

    // 🆕 開啟「動作面板」（點大圖）時，把當前動作的組數/次數/休息帶進草稿
    useEffect(() => {
        if (showLastSessionRecord && currentExercise) {
            setExerciseDraft({
                sets: currentExercise.sets_target || 3,
                reps: String(currentExercise.reps ?? '10'),
                rest: String(currentExercise.rest ?? '90s'),
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showLastSessionRecord]);

    // Load exercise images
    // 🟠 Fix: 用 cancelled flag 防止 async loadGif 在 cleanup 後繼續 setState；
    //         用 intervalRef 確保計時器始終被正確清除，防止多個計時器並存。
    useEffect(() => {
        let cancelled = false;
        const intervalRef = { current: null };

        const loadGif = async () => {
            setActiveImages([]);
            setCurrentFrame(0);
            setImgFailed(false);
            if (currentExercise?.image_url) {
                const fullUrl = mediaUrl(currentExercise.image_url);
                if (!cancelled) setActiveImages([fullUrl]);
            } else if (currentExercise?.name) {
                const exerciseData = await findExerciseByName(currentExercise.name);
                if (!cancelled && exerciseData?.imageUrls?.length > 0) {
                    setActiveImages(exerciseData.imageUrls);
                }
            }
        };

        loadGif();

        // 啟動 frame 輪播計時器（只在有多張圖片時切換）
        // 🔧 改為連續交叉淡入淡出：間隔 1200ms，配合 0.7s 的 opacity 過渡，
        //    每張示範圖都能完整淡入、停留、再淡出，畫面連續平順，不會閃爍急切。
        intervalRef.current = setInterval(() => {
            if (cancelled) return;
            setActiveImages(prev => {
                if (prev.length > 1) setCurrentFrame(f => (f + 1) % prev.length);
                return prev;
            });
        }, 1200);

        return () => {
            cancelled = true;
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        };
    }, [currentExercise?.name]);

    // 計時器：每次打開訓練畫面從 0 開始、每秒遞增；暫停凍結、繼續續算。
    useEffect(() => {
        if (showCompletion) return;

        let t;
        if (!timerStartedRef.current) {
            // 🔄 本畫面第一次啟動 → 強制歸零，從此刻開始計時
            t = { baseElapsed: 0, segStartedAt: Date.now() };
            writeWorkoutTimer(t);
            timerStartedRef.current = true;
        } else {
            t = readWorkoutTimer() || { baseElapsed: 0, segStartedAt: Date.now() };
        }

        if (isPaused) {
            // 暫停：把進行中的區段折進 baseElapsed，停止計時
            if (t && t.segStartedAt) {
                t = { baseElapsed: computeElapsed(t), segStartedAt: 0 };
                writeWorkoutTimer(t);
                setTotalTimeElapsed(t.baseElapsed);
            }
            return;
        }

        // 進行中：若不在計時區段，開一個新區段（從現在續算）
        if (!t.segStartedAt) t = { ...t, segStartedAt: Date.now() };
        writeWorkoutTimer(t);
        setTotalTimeElapsed(computeElapsed(t));   // 立刻同步一次，避免閃 0

        const id = setInterval(() => {
            // 🩹 修正結算頁時間顯示 0:00：completeWorkout 會先 clearProgress() 清掉計時器，
            //    這裡讀到 null 時不能把 totalTimeElapsed 歸零，要凍結在最後的值。
            const t = readWorkoutTimer();
            if (t) setTotalTimeElapsed(computeElapsed(t));
        }, 1000);

        sessionTimerRef.current = id;
        return () => clearInterval(id);
    }, [isPaused, showCompletion]);

    // 🔥 精準休息計時器：使用 ref 儲存目標時間，徹底解決 useEffect 閉包捕捉到舊 state (0) 的問題
    //    並正確處理「暫停」：暫停時凍結剩餘時間，恢復時用剩餘時間重算目標，避免暫停期間倒數流失
    useEffect(() => {
        if (!isResting) return;

        // ⏸ 暫停中：把目前剩餘毫秒數凍結起來，不要讓絕對時間戳繼續流逝
        if (isPaused) {
            const frozen = restTargetTimeRef.current - Date.now();
            restRemainingMsRef.current = frozen > 0 ? frozen : 0;
            return; // 不啟動 interval；cleanup 會清掉上一個 interval
        }

        // ▶️ 恢復 / 開始：若有凍結的剩餘時間，用它重建目標時間戳
        if (restRemainingMsRef.current > 0) {
            restTargetTimeRef.current = Date.now() + restRemainingMsRef.current;
            restRemainingMsRef.current = 0;
        }

        // 確保目標時間是有效的（恢復時若已過期，視為休息已完成 → 同樣給提醒）
        if (restTargetTimeRef.current <= Date.now()) {
            setRestTimeRemaining(0);
            setIsResting(false);
            triggerHaptic('success');
            playRestEndSound();
            notifyRestEnd();
            return;
        }

        // 立即同步一次顯示，避免恢復瞬間的閃爍
        setRestTimeRemaining(Math.max(1, Math.round((restTargetTimeRef.current - Date.now()) / 1000)));

        timerRef.current = setInterval(() => {
            const now = Date.now();
            const remaining = Math.round((restTargetTimeRef.current - now) / 1000);

            if (remaining <= 0) {
                clearInterval(timerRef.current);
                setRestTimeRemaining(0);
                setIsResting(false);
                triggerHaptic('success');
                // 🆕 跨背景提醒：聲音（前景）+ 系統通知（背景）。wake lock 由 isResting effect 釋放。
                playRestEndSound();
                notifyRestEnd();
            } else {
                setRestTimeRemaining(remaining);
            }
        }, 500); // 每 500ms 校正一次，確保精準

        return () => clearInterval(timerRef.current);
    }, [isResting, isPaused]); // 不依賴 restTimeRemaining，完全靠 ref 與 Date.now() 計算

    // 🆕 螢幕喚醒鎖：休息中（且未暫停）保持螢幕亮，讓使用者能看著倒數；
    //    休息結束/暫停/離開時釋放。Wake Lock 切到背景會被系統自動釋放，
    //    回前景時若仍在休息就重新取得（visibilitychange）。
    useEffect(() => {
        const shouldHold = isResting && !isPaused;
        if (shouldHold) {
            requestWakeLock();
        } else {
            releaseWakeLock();
        }

        const handleVisibility = () => {
            if (document.visibilityState === 'visible' && isResting && !isPaused) {
                requestWakeLock();
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
            // 元件卸載或依賴變化時確保釋放，避免鎖殘留
            if (!shouldHold) releaseWakeLock();
        };
    }, [isResting, isPaused]);

    // 🆕 卸載時保險：離開訓練頁一定釋放喚醒鎖
    useEffect(() => {
        return () => { releaseWakeLock(); };
    }, []);

    // Early return for invalid plan — safe here because all hooks are already declared above
    // ── Queue 操作的 useCallback：須在任何條件式 return 之前宣告（修正 rules-of-hooks）──
    const handleReorderQueue = useCallback((newExercisesArr) => {
        setExercisesWithSets(newExercisesArr);
    }, []);

    // ── Delete/skip any exercise from queue (by absolute index) ──
    const handleSkipFromQueue = useCallback((exAbsIdx) => {
        triggerHaptic('medium');
        setExercisesWithSets(prev => {
            const updated = [...prev];
            updated.splice(exAbsIdx, 1);
            return updated;
        });
        if (exAbsIdx === currentExerciseIndex) {
            setIsResting(false);
        }
    }, [currentExerciseIndex]);

    // 🟡 Fix: 原子性刪除整個超級組 — 單次 haptic + 單次 splice，消除多次觸發問題（Issue 16）
    const handleSkipGroupFromQueue = useCallback((groupStartAbsIdx, groupSize) => {
        triggerHaptic('medium'); // 只觸發一次 haptic
        setExercisesWithSets(prev => {
            const updated = [...prev];
            updated.splice(groupStartAbsIdx, groupSize); // 一次移除整組
            return updated;
        });
        // 若當前動作在被刪除的組內，停止休息倒計時
        if (currentExerciseIndex >= groupStartAbsIdx && currentExerciseIndex < groupStartAbsIdx + groupSize) {
            setIsResting(false);
        }
    }, [currentExerciseIndex]);

    // ── Add exercise after a specific absolute index ──
    const handleAddAfterIndex = useCallback((absIdx) => {
        setShowQueueSheet(false);
        setAddExSearch('');
        setAddExCategory('all');

        setAddExInsertIndex(absIdx); // 🔥 記住使用者點了哪個動作的「加入後」
        setShowAddExerciseModal(true);
    }, []);

    // 🎉 休息結束後清掉 PR 彩蛋（下次破紀錄再觸發）
    // ⚠ 這個 useEffect 原本寫在下面「找不到本次訓練」早退之後 →
    //   課表還沒載入時 hook 數量少一個，載入後多一個 → React 拋
    //   "Rendered more hooks than during the previous render"。必須放在早退之前。
    useEffect(() => {
        if (!isResting && prCelebration) setPrCelebration(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isResting]);

    if (!effectivePlan || (!effectivePlan.exercises && !effectivePlan.data?.exercises)) {
        return (
            <div
                className="min-h-[100dvh] flex items-center justify-center p-6 text-center"
                style={{ maxWidth: '430px', margin: '0 auto', backgroundColor: C.blackSoft }}
            >
                <div
                    className="w-full rounded-3xl p-8"
                    style={{
                        background: 'linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
                        backdropFilter: 'blur(16px)',
                        WebkitBackdropFilter: 'blur(16px)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 12px 40px rgba(0,0,0,0.4)',
                    }}
                >
                    <div
                        className="mx-auto mb-5 flex items-center justify-center rounded-[18px]"
                        style={{ width: 56, height: 56, background: CA.coral15 }}
                    >
                        <AlertTriangle size={26} color={C.coral} strokeWidth={2} />
                    </div>
                    <h2 className="text-xl font-bold mb-2" style={{ color: C.white }}>找不到本次訓練</h2>
                    <p className="text-sm mb-6 leading-relaxed" style={{ color: CA.white55 }}>
                        課表資料遺失或無效，可能是頁面重新整理或連結已過期。請返回重新開始訓練。
                    </p>
                    <motion.button {...pressProps('row')}
 onClick={onExit}
 className="w-full py-3 rounded-[18px] font-semibold"
 style={{ background: C.coral, color: C.white }}
 >
                        返回
                    </motion.button>
                </div>
            </div>
        );
    }

    // ─── SUBSTITUTE EXERCISE LOGIC ───
    /* 整套「哪些動作可以互換、誰該排前面」搬到 utils/exerciseSubstitution.js。
       這裡原本有兩張表（中文動作名→肌群、名稱關鍵字→肌群）加一段排序，
       三份知識分散在畫面元件裡，結果是：
         · 中文課表查不到英文動作庫 → 動作把自己列成自己的替代
         · 只比對 muscle → 引體向上被推薦硬舉、側平舉被推薦槓鈴肩推
         · 查不到就倒出全部位 Tier 1 → 深蹲與臥推互為替代
       證據在 scripts/verify_substitution.mjs（含「舊做法真的會這樣」那一段）。 */
    const handleOpenSubstitute = () => {
        triggerHaptic('light');
        const options = getSubstitutes(currentExercise, { userId: effectiveUserId, limit: 10 });
        setSubstituteOptions(options);
        setSubstituteHint(substituteSubtitle(currentExercise, options));
        setShowSubstituteModal(true);
    };

    const handleSelectSubstitute = (newExerciseDef) => {
        triggerHaptic('success');

        const updatedExercises = [...exercisesWithSets];
        const prevEx = updatedExercises[currentExerciseIndex];

        /* 只帶走「這個動作是什麼」，不要把面板上的顯示欄位（中文器材標、理由標籤、
           熟悉度組數…）寫進課表 —— 那些是這一次挑選當下的說明，存進去就會過期。 */
        /* 只帶走「這個動作是什麼」。下面這些是替代動作面板當下的顯示欄位
           （中文器材標、理由標籤、熟悉度組數…），存進課表就會過期；
           sets 是動作庫的預設組數，要讓位給你原本計劃的組數。 */
        const DISPLAY_ONLY_KEYS = ['sets', 'eqZh', 'pattern', 'patternZh', 'matchKind', 'reason', 'familiarSets'];
        const cleanNewDef = Object.fromEntries(
            Object.entries(newExerciseDef).filter(([k]) => !DISPLAY_ONLY_KEYS.includes(k))
        );

        updatedExercises[currentExerciseIndex] = {
            ...prevEx,
            ...cleanNewDef,
            name: newExerciseDef.name,
            sets: prevEx.sets || [],           // Keep completed sets
            sets_target: prevEx.sets_target    // Force inherit original planned volume
        };

        setExercisesWithSets(updatedExercises);
        setShowSubstituteModal(false);

        fetchExercisePR(newExerciseDef.name);
        setExerciseTip(getExerciseTip(newExerciseDef.name));
    };

    const handleCompleteSet = (options = {}) => {
        const isFastLog = options.isFastLog || false;

        triggerHaptic(isFastLog ? 'success' : 'heavy');

        const currentExerciseData = exercisesWithSets[currentExerciseIndex];
        const lastSet = currentExerciseData.sets[currentExerciseData.sets.length - 1];

        // 🔥 Smart Pre-fill Logic (Enhanced for Drop Sets)
        let defaultWeight = '';
        let defaultReps = '';

        if (lastSet?.weight) {
            if (currentExercise.isDropSet || (typeof currentExercise.reps === 'string' && currentExercise.reps.includes('->'))) {
                // 🔻 Drop Set 循環邏輯
                const repStages = typeof currentExercise.reps === 'string' ? currentExercise.reps.split('->').map(s => parseInt(s.trim())) : [10];
                const stagesPerSeq = repStages.length;
                const completedSetsInExercise = currentExerciseData.sets.filter(s => s.completed).length;
                const nextStageIdx = completedSetsInExercise % stagesPerSeq;

                if (nextStageIdx === 0) {
                    // 👉 開啟新的一個循環：重量恢復到最原始（或上一大組的第一組重量）
                    // 尋找「上一個循環的第一組」
                    const firstSetOfLastSeq = currentExerciseData.sets[completedSetsInExercise - stagesPerSeq];
                    defaultWeight = firstSetOfLastSeq?.weight ? firstSetOfLastSeq.weight.toString() : lastSet.weight.toString();
                    defaultReps = repStages[0].toString();
                } else {
                    // 👉 在循環內部：自動降重 20%
                    defaultWeight = (Math.round((parseFloat(lastSet.weight) * 0.8) * 2) / 2).toString();
                    defaultReps = repStages[nextStageIdx].toString();
                }
            } else {
                // 一般組：使用上一組重量；若使用者在休息頁按過「帶入下一組」建議 → 用建議重量
                const accepted = acceptedSuggestionRef.current;
                if (accepted && accepted.exercise === currentExercise.name && accepted.weight > 0) {
                    defaultWeight = accepted.weight.toString();
                    acceptedSuggestionRef.current = null; // 用過即清，不跨組殘留
                } else {
                    defaultWeight = lastSet.weight.toString();
                }
                let planReps = parseInt(currentExercise.reps?.toString() || '10', 10);
                defaultReps = isNaN(planReps) ? '10' : planReps.toString();
            }
        } else {
            // 第一組：使用歷史資料或計劃預設（休息頁按過「帶入下一組」則優先用建議）
            const acceptedFirst = acceptedSuggestionRef.current;
            if (acceptedFirst && acceptedFirst.exercise === currentExercise.name && acceptedFirst.weight > 0) {
                defaultWeight = acceptedFirst.weight.toString();
                acceptedSuggestionRef.current = null;
            } else if (overloadSuggestions[currentExercise.name]?.prescribed) {
                // 💳 會員：每次訓練帶好重量（跟提示卡上的數字是同一個）
                defaultWeight = overloadSuggestions[currentExercise.name].weight.toString();
            } else if (lastSessionStats[currentExercise.name]?.weight) {
                defaultWeight = lastSessionStats[currentExercise.name].weight.toString();
            } else if (currentExercise.suggestedWeight) {
                // P4：無上次紀錄時，用 Season 結算的 e1RM 負重處方預填
                defaultWeight = currentExercise.suggestedWeight.toString();
            }
            const repStages = typeof currentExercise.reps === 'string' ? currentExercise.reps.split('->').map(s => parseInt(s.trim())) : [10];
            defaultReps = repStages[0].toString();
        }

        if (isFastLog) {
            setInputWeight(defaultWeight === '' ? '0' : defaultWeight);
            setInputReps(defaultReps);
            setInputRPE(currentExercise.isDropSet ? 10 : 8); // Drop Set 預設力竭 (RPE 10)

            safeTimeout(() => {
                const btn = document.getElementById('save-set-btn-hidden');
                if (btn) btn.click();
                else {
                    finalizeFastLog(parseFloat(defaultWeight || 0), parseInt(defaultReps), currentExercise.isDropSet ? 10 : 8);
                }
            }, 50);
        } else {
            setInputWeight(defaultWeight);
            setInputReps(defaultReps);
            setShowWeightInput(true);
        }
    };

    const parseRestTime = (restString) => {
        if (restString == null) return 60;
        // 數字一律視為「秒」（課表資料如 60/90/120/150 都是秒）
        if (typeof restString === 'number') {
            return restString > 0 ? Math.round(restString) : 60;
        }
        const str = String(restString).trim().toLowerCase();

        // 格式 "m:ss" 例如 "1:30" → 90 秒
        const colon = str.match(/^(\d+)\s*:\s*(\d{1,2})$/);
        if (colon) return parseInt(colon[1]) * 60 + parseInt(colon[2]);

        // 取數字（支援小數，如 1.5 分）
        const numMatch = str.match(/(\d+(?:\.\d+)?)/);
        if (!numMatch) return 60;
        const value = parseFloat(numMatch[1]);
        if (isNaN(value) || value <= 0) return 60;

        // 判斷單位：分鐘 vs 秒
        const isMinutes = /分|min|m\b|'/.test(str) && !/秒|sec|s\b|"/.test(str);
        if (isMinutes) return Math.round(value * 60);

        // 明確標秒，或數字很大 → 秒
        if (/秒|sec|s\b|"/.test(str) || value > 10) return Math.round(value);

        // 沒單位且數字 <= 10 → 視為分鐘（避免 "1" 被當成 1 秒）
        return Math.round(value * 60);
    };

    // 🆕 自由訓練：到隊列末尾時不直接結算，改彈出「選下一個 / 完成此次計劃」
    const finishOrPromptNext = (updatedExercises) => {
        if (isFreestyle) {
            // 自由訓練：最後一組做完 → 跳「選下一個 / 長按結束」
            triggerHaptic('success');
            setIsResting(false);
            setFreestyleNextOpen(true);
        } else {
            // 一般課表：最後一組做完 → 先跳訓練回顧卡（可編輯 + 確認結束）
            triggerHaptic('success');
            setIsResting(false);
            setShowSummaryReview(true);
        }
    };

    // 🆕 自由訓練：選了下一個動作 → 接到隊列尾並立即開始
    //   邊做邊填的兩個關鍵行為：
    //   ① 同動作合併疊加：若清單裡已有同名動作（例如不小心跳過又重選），
    //      不新增第二筆，而是跳回那筆繼續累加組數 —— 結算頁才不會出現兩個 Reverse Pec Deck。
    //   ② 組數開放：sets_target 用大哨兵值（openEnded），做到自己按「完成此動作」為止。
    const handleFreestyleAddNext = (ex) => {
        triggerHaptic('success');
        const open = !!ex.openEnded || isLiveFill;
        const norm = (s) => String(s || '').trim().toLowerCase();

        setExercisesWithSets(prev => {
            // ① 找同名動作（合併疊加）
            const existingIdx = prev.findIndex(e => norm(e.name) === norm(ex.name));
            if (existingIdx !== -1) {
                // 跳回既有那筆，保留已做的組數，接著繼續累加 —— 不新增重複條目
                const updated = prev.map((e, i) => i === existingIdx
                    ? { ...e, completed: false, reps: String(ex.reps || e.reps), rest: String(ex.rest || e.rest) }
                    : e);
                setCurrentExerciseIndex(existingIdx);
                return updated;
            }
            // ② 新動作接到隊列尾
            const newEx = {
                name: ex.name,
                sets_target: open ? 99 : Math.max(1, parseInt(ex.sets) || 3),
                openEnded: open,
                reps: String(ex.reps || '8-12'),
                rest: String(ex.rest || '90s'),
                sets: [],
                category: ex.category || ex.muscle || 'STRENGTH',
                muscle: ex.muscle,
                completed: false,
            };
            const updated = [...prev, newEx];
            setCurrentExerciseIndex(updated.length - 1);
            return updated;
        });
        setFreestyleNextOpen(false);
        setIsResting(false);
        setShowWeightInput(false);
    };

    // 🆕 邊做邊填：在休息頁按「完成此動作」→ 收掉當前動作（保留已完成組數），跳出選下一個動作。
    //   若這個動作一組都沒做（例如選了就想換）→ 從清單移除，不留 0 組空殼。
    const finishCurrentLiveExercise = () => {
        triggerHaptic('medium');
        setExercisesWithSets(prev => {
            const cur = prev[currentExerciseIndex];
            const doneCount = cur ? (cur.sets || []).filter(s => s.completed).length : 0;
            if (cur && doneCount === 0) {
                // 0 組 → 直接移除，不記錄
                return prev.filter((_, i) => i !== currentExerciseIndex);
            }
            // 有做 → 標記完成，之後結算納入
            return prev.map((e, i) => i === currentExerciseIndex ? { ...e, completed: true } : e);
        });
        setIsResting(false);
        setNextSetSuggestion(null);
        setFreestyleNextOpen(true);
    };

    // 🆕 自由訓練：長按結束 → 跳訓練回顧卡（可編輯 + 確認結束）
    const handleFreestyleFinish = () => {
        setFreestyleNextOpen(false);
        setShowSummaryReview(true);
    };

    // 🔥 新增：超級組智能路由引擎 (Superset Router)
    const routeToNextStep = (updatedExercises) => {
        const currentEx = updatedExercises[currentExerciseIndex];
        const isExDone = currentEx.sets.filter(s => s.completed).length >= (currentEx.sets_target || 3);

        if (currentEx.supersetGroup) {
            // 尋找同一個超級組的下一個動作 (例如：SS1-A 找 SS1-B)
            const nextSSIdx = updatedExercises.findIndex((e, i) => i > currentExerciseIndex && e.supersetGroup === currentEx.supersetGroup);

            if (nextSSIdx !== -1) {
                // 👉 找到 B 動作：直接跳轉，不休息 (SWITCH)
                setCurrentExerciseIndex(nextSSIdx);
                triggerHaptic('light');
            } else {
                // 👉 沒找到下一個：代表已經是 B 動作 (超級組的最後一個動作)
                if (isExDone) {
                    // 整組超級組 (例如 4 輪) 都做完了！尋找下一個非同組的動作
                    const nextBlockIdx = updatedExercises.findIndex((e, i) => i > currentExerciseIndex && e.supersetGroup !== currentEx.supersetGroup);
                    if (nextBlockIdx !== -1) {
                        triggerRest(currentEx.rest, nextBlockIdx, updatedExercises);
                    } else {
                        finishOrPromptNext(updatedExercises);
                    }
                } else {
                    // 👉 關鍵！一輪做完 (A+B各一組)：開始休息，休息完自動跳回 A 動作做下一組！
                    const firstSSIdx = updatedExercises.findIndex(e => e.supersetGroup === currentEx.supersetGroup);
                    triggerRest(currentEx.rest, firstSSIdx, updatedExercises);
                }
            }
        } else {
            // 一般單一動作邏輯
            if (isExDone) {
                if (currentExerciseIndex + 1 < updatedExercises.length) {
                    triggerRest(currentEx.rest, currentExerciseIndex + 1, updatedExercises);
                } else {
                    finishOrPromptNext(updatedExercises);
                }
            } else {
                // 🔥 新增：智慧遞減組路由 (Cycle Control)
                const isDropSet = currentEx.isDropSet || (typeof currentEx.reps === 'string' && currentEx.reps.includes('->'));
                if (isDropSet) {
                    const repStages = typeof currentEx.reps === 'string' ? currentEx.reps.split('->').map(s => parseInt(s.trim())) : [10];
                    const stagesPerSeq = repStages.length;
                    const completedInEx = updatedExercises[currentExerciseIndex].sets.filter(s => s.completed).length;
                    
                    const isSequenceDone = completedInEx % stagesPerSeq === 0;

                    if (isSequenceDone) {
                        // ✅ 一個完整循環 (如 10->8->6) 結束：開始長休息
                        triggerRest(currentEx.rest, currentExerciseIndex, updatedExercises);
                    } else {
                        // 🔄 還在循環內：直接跳到下一組，不休息
                        setCurrentExerciseIndex(currentExerciseIndex);
                        triggerHaptic('medium');
                    }
                } else {
                    triggerRest(currentEx.rest, currentExerciseIndex, updatedExercises); // 休息完繼續做當前動作下一組
                }
            }
        }
    };

    const triggerRest = (restStr, nextIdx, exList = exercisesWithSets) => {
        // 🆕 下一組建議重量：依「本次上一組重量 + RPE」；換動作時退回「上次訓練紀錄」。
        //    這就是教練在旁邊會講的那句話 — 顯示在組間休息頁。
        try {
            const nextEx = exList[nextIdx];
            let sug = null;
            const roundTo = (w) => Math.max(0, Math.round(w / 2.5) * 2.5);
            if (nextEx) {
                const doneSets = (nextEx.sets || []).filter(s => s.completed && parseFloat(s.weight) > 0);

                /* ⚠️ 遞減組：一個循環（例如 12 → 8）的最後一組是「刻意降重」的那一組。
                   拿它當基準去建議下一組，等於把降完的重量當成你現在的實力 ——
                   畫面上就會出現「起始 45kg，降到 35kg，建議下一輪 35kg」，
                   一輪比一輪輕，遞減組整個失去意義。
                   遞減組休息只會發生在「一個循環做完」之後，所以下一組必定是新循環的
                   第一階：基準要回到上一輪的起始重量。 */
                const stages = String(nextEx.reps ?? '').split('->')
                    .map((x) => parseInt(x.trim())).filter((n) => !isNaN(n));
                const isDropSet = stages.length > 1;
                const cycleStartW = (isDropSet && doneSets.length >= stages.length)
                    ? parseFloat(doneSets[doneSets.length - stages.length].weight) || 0
                    : 0;

                const lastW = doneSets.length ? parseFloat(doneSets[doneSets.length - 1].weight) : 0;
                if (cycleStartW > 0) {
                    /* 新的一輪從起始重量開始。這裡不套 RPE 調整 ——
                       上一組的 RPE 是「降重之後做到力竭」的感受，它說不出
                       起始重量該不該變。 */
                    sug = { weight: roundTo(cycleStartW), reason: `遞減組新的一輪，回到 ${roundTo(cycleStartW)}kg 起跑` };
                } else if (lastW > 0) {
                    const r = parseFloat(lastRpeRef.current) || 8;
                    if (r <= 6) sug = { weight: roundTo(lastW + 2.5), reason: `上一組 RPE ${r} 還很輕鬆，下一組可以加到 ${roundTo(lastW + 2.5)}kg 試試` };
                    else if (r <= 8.5) sug = { weight: roundTo(lastW), reason: `上一組 RPE ${r} 在最佳區間，維持 ${roundTo(lastW)}kg 把次數做滿` };
                    else if (r < 10) sug = { weight: roundTo(lastW), reason: `上一組 RPE ${r} 偏費力，維持重量、把動作放慢做穩` };
                    else sug = { weight: roundTo(lastW * 0.95), reason: `上一組已力竭（RPE 10），降到 ${roundTo(lastW * 0.95)}kg 完成剩餘組數` };
                } else if (parseFloat(lastSessionStats[nextEx.name]?.weight) > 0) {
                    const w = roundTo(parseFloat(lastSessionStats[nextEx.name].weight));
                    sug = { weight: w, reason: `依你上次的紀錄，建議從 ${w}kg 開始` };
                }
                if (sug && sug.weight > 0) sug = { ...sug, exercise: nextEx.name };
                else sug = null;
            }
            setNextSetSuggestion(sug);
        } catch { setNextSetSuggestion(null); }
        const baseSeconds = parseRestTime(restStr || '60s');
        // 🆕 動態休息：依上一組 RPE 微調（自動恢復管理，資深教練直覺）
        //    RPE ≥ 9.5 → +45s；RPE ≥ 9 → +30s；RPE ≤ 6 → −15s；下限 30s。
        const rpe = parseFloat(lastRpeRef.current) || 8;
        let adjust = 0;
        if (rpe >= 9.5) adjust = 45;
        else if (rpe >= 9) adjust = 30;
        else if (rpe <= 6) adjust = -15;
        const restSeconds = Math.max(30, baseSeconds + adjust);
        // 🩹 調整量只餵那顆已移除的「+15s · RPE」小標；秒數本身已經反映在倒數上，
        //    不需要再存一份 state 去顯示原理。adjust 仍然實際影響 restSeconds。
        // ✅ 關鍵：必須先設定 ref（絕對時間戳），再 setIsResting(true)
        // 這樣 useEffect 觸發時，ref 已有正確值，不會因為舊值 0 而瞬間關閉
        restTargetTimeRef.current = Date.now() + (restSeconds * 1000);
        restRemainingMsRef.current = 0; // 重置任何殘留的凍結剩餘時間
        setCurrentExerciseIndex(nextIdx);
        setRestTimeRemaining(restSeconds);
        setIsResting(true);

        // 🆕 每次休息隨機抽一句「精選運動員語錄」（各運動皆有，見 utils/athleteQuotes.js）
        setRestQuote(getRestQuote());
    };

    // 🏆 PR 雙軌偵測（saveSetData / finalizeFastLog 共用）：
    //   ① 重量 PR：比歷史最重更重。
    //   ② e1RM PR：重量沒破，但「同重量做更多下」讓估算 1RM 創新高 — 這也是真實進步。
    const detectAndCelebratePR = (weight, reps) => {
        const name = currentExercise.name;
        const histPR = exercisePRs[name] || 0;
        const histE1RM = exerciseE1RMs[name] || 0;
        const curE1RM = estimate1RM(weight, reps);
        const r1 = (v) => Math.round(v * 10) / 10;
        if (histPR > 0 && weight > histPR) {
            setPrAlerts(prev => [...prev, { name, exercise: name, oldPR: histPR, newPR: weight, kind: 'weight' }]);
            setPrCelebration({ name, oldPR: histPR, newPR: weight, kind: 'weight', quote: getPRQuote() });
            setExercisePRs(prev => ({ ...prev, [name]: weight }));
            triggerHaptic('success');
        } else if (histE1RM > 0 && curE1RM > histE1RM * 1.005) {
            setPrAlerts(prev => [...prev, { name, exercise: name, oldPR: r1(histE1RM), newPR: r1(curE1RM), kind: 'e1rm' }]);
            setPrCelebration({ name, oldPR: r1(histE1RM), newPR: r1(curE1RM), kind: 'e1rm', quote: getPRQuote() });
            triggerHaptic('success');
        }
        // e1RM 基準隨時墊高，之後要更強才會再觸發
        if (curE1RM > histE1RM) setExerciseE1RMs(prev => ({ ...prev, [name]: curE1RM }));
    };

    // 修改 finalizeFastLog 的結尾
    const finalizeFastLog = (weight, reps, rpe) => {
        // 🆕 快速記錄同樣在手勢中解鎖音訊 + 預索通知權限
        unlockRestAudio();
        ensureNotifyPermission();
        const effortScore = calculateEffortScore(weight, reps, rpe, currentExercise.name);
        const updatedExercises = exercisesWithSets.map((ex, idx) => {
            if (idx === currentExerciseIndex) {
                // 🩹 修正：快速記錄之前漏了 completed 標記 → 動作永遠不會被標成做完
                const isNowDone = (ex.sets.length + 1) >= (ex.sets_target || 3);
                return { ...ex, completed: isNowDone, sets: [...ex.sets, { set_number: currentSet, weight, reps, rpe, effortScore, completed: true }] };
            }
            return ex;
        });

        // 🩹 修正：快速記錄之前漏了 PR 偵測 / completedSets / 氛圍燈 → 組進度條會漏亮
        detectAndCelebratePR(weight, reps);
        setExercisesWithSets(updatedExercises);
        setLastEffortScore(effortScore);
        lastRpeRef.current = rpe;
        setCompletedSets(prev => [...prev, `${currentExerciseIndex}-${currentSet}`]);
        setAmbientFlash(true);
        safeTimeout(() => setAmbientFlash(false), 900);
        setJustCompleted(true);
        safeTimeout(() => setJustCompleted(false), 3000);

        // 🔥 呼叫智能路由
        routeToNextStep(updatedExercises);
    };

    // 修改 saveSetData 的結尾
    const saveSetData = () => {
        // 🆕 在使用者手勢中解鎖音訊 + 預索通知權限（iOS 限制需在手勢內，重複呼叫無害）
        unlockRestAudio();
        ensureNotifyPermission();
        /* 🛡️ 輸入界線防呆 —— 這兩個數字會永久寫進訓練紀錄，並往下影響
           個人紀錄（PR）、總訓練量、雷達圖與後續課表的重量推薦。
           少打一個小數點或多按一下 0（例如 600 kg、300 下）一旦存進去，
           PR 會被灌爆、之後每張圖表都跟著歪，而且使用者很難自己找回來。
           這裡在寫入前收斂到人類可能的範圍，而不是等到圖表壞掉才發現。 */
        const weight = clampSetInput(parseFloat(inputWeight), weightCapFor(currentExercise?.name));
        const reps = clampSetInput(parseInt(inputReps, 10), SET_LIMITS.reps);
        const rpe = inputRPE;
        const effortScore = calculateEffortScore(weight, reps, rpe, currentExercise.name);

        const updatedExercises = exercisesWithSets.map((ex, idx) => {
            if (idx === currentExerciseIndex) {
                // 如果已經達到目標組數，標記整個動作完成
                const isNowDone = (ex.sets.length + 1) >= (ex.sets_target || 3);
                return { ...ex, completed: isNowDone, sets: [...ex.sets, { set_number: currentSet, weight, reps, rpe, effortScore, completed: true }] };
            }
            return ex;
        });

        // 🏆 PR 雙軌判定：以「歷史個人最佳」為基準（重量 PR + e1RM PR），
        //    不再把「熱身 20kg → 正式 60kg」誤判成 PR。
        detectAndCelebratePR(weight, reps);

        setExercisesWithSets(updatedExercises);
        setLastEffortScore(effortScore);
        lastRpeRef.current = rpe;
        setCompletedSets(prev => [...prev, `${currentExerciseIndex}-${currentSet}`]);
        // 氛圍燈：完成一組亮一下綠光（功能性回饋）
        setAmbientFlash(true);
        safeTimeout(() => setAmbientFlash(false), 900);
        setShowWeightInput(false);
        setInputRPE(8);

        // 🔥 呼叫智能路由
        routeToNextStep(updatedExercises);
    };

    const skipRest = () => {
        triggerHaptic('light');
        setIsResting(false);
        setRestTimeRemaining(0);
    };

    // ── Skip current exercise ──
    const handleSkipExercise = () => {
        triggerHaptic('medium');
        setShowSkipConfirm(false);
        setIsResting(false);
        if (currentExerciseIndex + 1 < exercisesWithSets.length) {
            setCurrentExerciseIndex(currentExerciseIndex + 1);
        } else {
            finishOrPromptNext(exercisesWithSets);
        }
    };

    // ── Add exercise mid-session (inserts right after current) ──
    const handleAddExercise = (ex) => {
        triggerHaptic('success');
        const newEx = {
            name: ex.name,
            sets_target: ex.sets || 3,
            reps: ex.reps || '10',
            rest: ex.rest || '60s',
            sets: [],
            category: ex.muscle || ex.bodyCategory || ex.cat || 'STRENGTH',
            completed: false,
        };
        
        setExercisesWithSets(prev => {
            const updated = [...prev];
            // 🔥 如果有指定位置，就插在那裡；否則預設插在當前動作之後
            const targetIdx = addExInsertIndex !== null ? addExInsertIndex : currentExerciseIndex;
            updated.splice(targetIdx + 1, 0, newEx);
            return updated;
        });
        
        setShowAddExerciseModal(false);
        setAddExSearch('');
        setAddExInsertIndex(null); // 重置
    };

    // 🔴 Fix: 同時支援中文與英文動作名稱的肌群偵測
    const detectPrimaryMuscleGroup = (exercisesWithSets) => {
        const muscleCount = {};
        exercisesWithSets.forEach(ex => {
            const name = ex.name || '';
            const nameLower = name.toLowerCase();

            // ── 胸 / Chest ──
            // 🩹 修正：「反向飛鳥/俯身飛鳥/反向夾胸/reverse fly」是後三角動作，不能算胸；
            //    bare "press" 也移除（肩推/腿推會被誤判成胸）。
            if (/臥推|(?<!反向)夾胸|(?<!反向)(?<!俯身)飛鳥|伏地挺身|雙槓/.test(name) ||
                /chest|bench|incline press|decline press|(?<!reverse[ _-])pec|(?<!reverse[ _-])fly|push.?up/.test(nameLower)) {
                muscleCount['chest'] = (muscleCount['chest'] || 0) + 1;
            }
            // ── 背 / Back ──
            if (/硬舉|划船|引體|下拉|背部伸展|直臂/.test(name) ||
                /back|row|pull|deadlift|lat|rhomboid/.test(nameLower)) {
                muscleCount['back'] = (muscleCount['back'] || 0) + 1;
            }
            // ── 肩 / Shoulders ──
            if (/肩推|側平舉|前平舉|俯身飛鳥|面拉|聳肩|反向飛鳥/.test(name) ||
                /shoulder|delt|raise|overhead|ohp/.test(nameLower)) {
                muscleCount['shoulders'] = (muscleCount['shoulders'] || 0) + 1;
            }
            // ── 腿 / Legs ──
            if (/深蹲|腿推|腿伸展|腿彎舉|弓步|保加利亞|提踵|腿外展|腿內收/.test(name) ||
                /leg|squat|lunge|calf|quad|hamstring/.test(nameLower)) {
                muscleCount['legs'] = (muscleCount['legs'] || 0) + 1;
            }
            // ── 臀 / Glutes ──
            if (/臀推|臀橋|蚌殼|外展/.test(name) ||
                /glute|hip thrust|abduction|clamshell/.test(nameLower)) {
                muscleCount['glutes'] = (muscleCount['glutes'] || 0) + 1;
            }
            // ── 臂 / Arms ──
            if (/彎舉|三頭下壓|法式推舉|頭後臂屈伸|窄握|繩索下壓/.test(name) ||
                /bicep|tricep|curl|extension|pushdown/.test(nameLower)) {
                muscleCount['arms'] = (muscleCount['arms'] || 0) + 1;
            }
            // ── 核心 / Core ──
            if (/捲腹|仰臥起坐|平板支撐|棒式|側棒式|俄羅斯轉體|懸掛抬腿|腹輪/.test(name) ||
                /core|ab|plank|crunch|sit.?up/.test(nameLower)) {
                muscleCount['core'] = (muscleCount['core'] || 0) + 1;
            }

            // ── Fallback：使用 category / muscle / day_focus 欄位 ──
            const catField = (ex.category || ex.muscle || ex.day_focus || '').toLowerCase();
            if (catField && !Object.keys(muscleCount).length) {
                if (/chest|push|胸/.test(catField)) muscleCount['chest'] = (muscleCount['chest'] || 0) + 1;
                if (/back|pull|背/.test(catField)) muscleCount['back'] = (muscleCount['back'] || 0) + 1;
                if (/shoulder|肩/.test(catField)) muscleCount['shoulders'] = (muscleCount['shoulders'] || 0) + 1;
                if (/leg|lower|腿/.test(catField)) muscleCount['legs'] = (muscleCount['legs'] || 0) + 1;
                if (/arm|臂/.test(catField)) muscleCount['arms'] = (muscleCount['arms'] || 0) + 1;
                if (/core|ab|腹/.test(catField)) muscleCount['core'] = (muscleCount['core'] || 0) + 1;
            }
        });
        const sorted = Object.entries(muscleCount).sort((a, b) => b[1] - a[1]);
        return sorted.length > 0 ? sorted[0][0] : 'Full Body';
    };

    const completeWorkout = async (latestExercises = exercisesWithSets) => {
        if (completingRef.current) return;
        completingRef.current = true;
        // 🆕 邊做邊填：選了動作但一組都沒做（直接跳過）→ 不記錄，不顯示 0 組。
        //    自由訓練一律濾掉「沒有任何完成組」的動作，結算/存檔才乾淨。
        if (isFreestyle) {
            latestExercises = (latestExercises || []).filter(ex => (ex.sets || []).some(s => s.completed));
        }
        // 🩹 先把「最終訓練時長」定格下來（clearProgress 會清掉持久化計時器，之後就讀不到了）
        const finalDurationSec = computeElapsed(readWorkoutTimer()) || totalTimeElapsed || 0;
        finalDurationRef.current = finalDurationSec;
        // 訓練結束 → 清掉持久化計時器與暗存進度，並讓 AI 分析浮球直接消失（不論是否長按過），
        //   否則球會卡在外面、回不去已結束的訓練。
        clearProgress();   // 🆕 一併清掉計時器 + 暗存進度（localStorage），避免下次誤還原
        closeOrb();
        clearAnalysisJob();
        /* 🩹 2026-08 稽核：這裡原本算了 finalIsComplete 之後就再也沒人讀它（死碼），
           所以「12 組只做 1 組」跟「做滿 12 組」寫進歷史後長得一模一樣。
           現在把完成度算成百分比、寫進紀錄，讓下游（streakEngine / 結算文案 /
           dailyAgenda）能分辨這兩件事。
           自由訓練沒有「計劃組數」這個分母 → 一律記 100，不受門檻影響。 */
        const finalCompletionPct = isFreestyle || !(totalSets > 0)
            ? 100
            : Math.max(0, Math.min(100, Math.round((completedSetsCount / totalSets) * 100)));
        const finalIsComplete = finalCompletionPct >= 80;
        const stats = generateStatsSummary({
            completedSets: completedSetsCount, totalSets,
            duration: finalDurationSec,
            estimatedCalories: metrics.calories > 0 ? metrics.calories : (effectivePlan.calories_est || 250),
            exercises: latestExercises,
            intensity: effectivePlan.intensity
        });
        const newAchievements = checkAchievements(stats);
        setAchievements(newAchievements);
        triggerHaptic('completion'); // 🔥 Haptic on workout complete

        // 🟡 Fix: 提升至外層 scope，讓兩個 try block 共用，消除重複計算（Issue 11）
        let dynamicIntensity = 70; // fallback：中等強度
        let estimatedCalories = effectivePlan.calories_est || 250; // fallback：計劃預估值
        let caloriesWereEstimated = true; // 🆕 沒有手錶實測心率/卡路里 → 結算頁要標「預估」

        let totalVolume = 0;
        let totalHardSets = 0;
        const muscleHardSets = { chest: 0, back: 0, legs: 0, shoulders: 0, arms: 0, core: 0 };
        try {
            latestExercises.forEach(ex => {
                let primaryMuscle = detectPrimaryMuscleGroup([ex]);
                if (primaryMuscle === 'glutes') primaryMuscle = 'legs';
                ex.sets?.forEach(set => {
                    if (set.completed && set.weight && set.reps) {
                        totalVolume += set.weight * set.reps;
                        const rpeVal = parseFloat(set.rpe) || 0;
                        if (rpeVal >= 7) {
                            totalHardSets += 1;
                            if (muscleHardSets[primaryMuscle] !== undefined) {
                                muscleHardSets[primaryMuscle] += 1;
                            }
                        }
                    }
                });
            });
            const muscleGroups = new Set();
            latestExercises.forEach(ex => {
                const name = ex.name?.toLowerCase() || '';
                if (name.includes('chest') || name.includes('bench') || name.includes('press') || name.includes('push')) muscleGroups.add('chest');
                if (name.includes('back') || name.includes('row') || name.includes('pull') || name.includes('lat') || name.includes('deadlift')) muscleGroups.add('back');
                if (name.includes('shoulder') || name.includes('raise') || name.includes('overhead')) muscleGroups.add('shoulders');
                if (name.includes('bicep') || name.includes('tricep') || name.includes('curl') || name.includes('arm')) muscleGroups.add('arms');
                if (name.includes('core') || name.includes('ab') || name.includes('plank')) muscleGroups.add('core');
                if (name.includes('leg') || name.includes('squat') || name.includes('lunge') || name.includes('calf')) muscleGroups.add('legs');
            });
            const now = new Date();
            // 🩹 修正：改用「本地日期」而不是 toISOString()（UTC）。
            //    台灣 +8 時區在凌晨訓練會被記到前一天，導致趨勢/熱力圖日期錯位。
            const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const sessionId = `local_${now.getTime()}`;
            localRecordIdRef.current = sessionId;
            const gymTag = gymSession.currentGym();   // 🏋️ 在哪間練（還不知道 → 結算問完再補）
            // 🟡 Fix: 使用 getAndUpdate 做原子性讀-改-寫，防止多分頁同時訓練時互相覆蓋（Issue 13）
            const userStore = uStorage(effectiveUserId);

            // ── 計算耗力分數 (effortScore) ──
            const lsEffortScores = [];
            latestExercises.forEach(ex => {
                ex.sets?.forEach(set => {
                    if (set.completed && set.effortScore > 0) lsEffortScores.push(set.effortScore);
                });
            });
            const lsAvgEffort = lsEffortScores.length > 0
                ? Math.round(lsEffortScores.reduce((a, b) => a + b, 0) / lsEffortScores.length)
                : Math.round(progress);

            // ── 動態計算強度 (intensity)：直接採用平均耗力分數（0–120 → 封頂 100）。
            //    耗力分數本身已是「相對個人最佳 e1RM 的強度 + RPE」的合成值，
            //    再乘 0.75 只會系統性低估，趨勢頁的「強度 %」也會跟著失真。
            dynamicIntensity = Math.min(100, Math.max(0, Math.round(lsAvgEffort)));

            // 🟡 Fix: 將體重讀取抽出為共用 helper，避免重複實作相同邏輯（Issue 11）
            const getBodyWeightKg = () => {
                // ① InBody 最新量測（最準）
                try {
                    const inbodyRaw = localStorage.getItem(`inbody_local_${effectiveUserId}`);
                    const inbody = inbodyRaw ? JSON.parse(inbodyRaw) : null;
                    const latest = Array.isArray(inbody) ? inbody[inbody.length - 1] : inbody;
                    if (parseFloat(latest?.weight_kg) > 0) return parseFloat(latest.weight_kg);
                } catch { /* ignore */ }
                // ② 🆕 個人檔案體重（onboarding / 設定填的）
                try {
                    const profile = JSON.parse(localStorage.getItem('userProfile')) || {};
                    const w = parseFloat(profile.weight ?? profile.current_weight ?? profile.weight_kg);
                    if (w > 0) return w;
                } catch { /* ignore */ }
                // ③ 都沒有 → 70kg 預設
                return 70;
            };

            // ── 卡路里：真實數據優先 ──
            //   ① Apple Watch 實測（HealthKit / WatchConnectivity）→ 直接採用，最真實。
            //   ② 沒有手錶 → MET 估算（體重 × MET × 實際時數，不再無條件進位到整分鐘）。
            const bodyWeightKg = getBodyWeightKg();
            const durationHr = finalDurationSec / 3600;
            const met = dynamicIntensity >= 75 ? 6.0 : 5.0;
            const watchKcal = hasWatchData && displayCalories > 0 ? Math.round(displayCalories) : 0;
            estimatedCalories = watchKcal > 0 ? watchKcal : Math.round(bodyWeightKg * met * durationHr);
            caloriesWereEstimated = watchKcal <= 0; // 手錶實測才算真實數據

            const newRecord = {
                id: sessionId,
                date: today,
                volume: Math.round(totalVolume),
                hard_sets: totalHardSets,
                muscle_hard_sets: muscleHardSets,
                intensity: dynamicIntensity,      // ✅ 動態強度，不再硬編碼 75
                effortScore: lsAvgEffort,
                focus_group: effectivePlan.focus_group || detectPrimaryMuscleGroup(latestExercises),
                muscles: Array.from(muscleGroups),
                timestamp: now.toISOString(),
                duration_mins: Math.ceil(finalDurationSec / 60),
                duration_seconds: finalDurationSec, // 🆕 秒級時長：動態時間軸/結算頁不再被進位失真
                calories: estimatedCalories,       // ✅ 動態卡路里估算
                // 🆕 完成度（2026-08）：做了計劃的百分之幾。streakEngine 用這個
                //    決定要不要把今天算進連續天數；沒有這個欄位的舊紀錄一律放行。
                completionPct: finalCompletionPct,
                isComplete: finalIsComplete,
                plannedSets: totalSets || null,
                completedSets: completedSetsCount,
                hasPR: prAlerts.length > 0,
                gym: gymTag,                       // 🏋️ { id, name } | null
                exercises: latestExercises.map(ex => {
                    const completedSets = ex.sets?.filter(s => s.completed) || [];
                    const maxWeight = completedSets.reduce((max, s) => Math.max(max, parseFloat(s.weight || 0)), 0);
                    const totalReps = completedSets.reduce((sum, s) => sum + parseInt(s.reps || 0), 0);
                    return {
                        name: ex.name,
                        // 🏋️ 在這間因為沒器材改做的替代：slot = 原本課表上的動作（換季分析不把它算成跳過）
                        ...(ex.gymOrig?.name ? { slot: ex.gymOrig.name } : {}),
                        ...(ex.eq ? { eq: ex.eq } : {}),   // 機械類重量跨健身房不能直接比
                        sets: completedSets,
                        setsCount: completedSets.length,
                        reps: completedSets.length > 0 ? Math.round(totalReps / completedSets.length) : 0,
                        weight: maxWeight,
                        detailedSets: ex.sets
                    };
                })
            };
            // ✅ getAndUpdate：重新從 localStorage 讀最新值後再追加，防止多分頁覆蓋競態
            let totalRecordCount = 0;
            userStore.getAndUpdate('trainingRecords', (records) => {
                records[sessionId] = newRecord;
                totalRecordCount = Object.keys(records).length;
                return records;
            }, {});

            // 📊 漏斗事件：workout_completed（含第幾次，D1/D7 與首訓漏斗都靠它）
            import('../utils/telemetry')
                .then(({ track }) => track('workout_completed', {
                    nth: totalRecordCount,
                    volume: Math.round(totalVolume),
                    duration_mins: Math.ceil(finalDurationSec / 60),
                }))
                .catch(() => {});

            // 🔔 價值時刻請求通知權限：只在「第一次訓練完成」後 3 秒問一次。
            //    慶祝畫面正在播 → 使用者情緒最高點，同意率遠高於藏在設定裡。
            try {
                if (totalRecordCount === 1 && !localStorage.getItem('drvn:notifAsked')) {
                    localStorage.setItem('drvn:notifAsked', '1');
                    setTimeout(() => {
                        import('../utils/workoutReminders')
                            .then(async ({ requestNotificationPermission }) => {
                                const result = await requestNotificationPermission();
                                import('../utils/telemetry')
                                    .then(({ track }) => track(
                                        result === 'granted' ? 'notif_perm_granted' : 'notif_perm_denied',
                                        { at: 'first_workout_completion', result }))
                                    .catch(() => {});
                            })
                            .catch(() => {});
                    }, 3000);
                }
            } catch { /* ignore */ }
        } catch (error) {
            console.error('Error saving training record:', error);
        }

        // Trigger high-impact transition before showing the final card
        setFinalStats({ volume: Math.round(totalVolume), sets: completedSetsCount, calories: estimatedCalories, caloriesEstimated: caloriesWereEstimated, intensity: dynamicIntensity });
        setIsTransitionActive(true);
        // Delaying setShowCompletion(true) until transition is done via its onComplete callback

        setIsSaving(true);

        // ═══ ALWAYS record recovery locally (never depends on API) ═══
        try {
            recordWorkoutCompletion(effectiveUserId, latestExercises);
        } catch (recErr) {
            console.error('❌ [Recovery] Failed to record (Mobile):', recErr);
        }

        // 自由訓練與未達完成門檻的紀錄不推進課表進度。
        if (!isFreestyle && totalSets > 0 && finalIsComplete) {
            try {
                const dayNumber = effectivePlan.day_number || effectivePlan.dayNumber || 1;
                const activeWeek = effectivePlan.week_number || effectivePlan.weekNumber || 1;
                const alreadyDone = readStrengthPlanDays(effectiveUserId, completionPlanId, activeWeek).includes(Number(dayNumber));
                if (recordStrengthPlanDay(effectiveUserId, completionPlanId, activeWeek, dayNumber) && !alreadyDone) {
                    recordedPlanDayRef.current = { planId: completionPlanId, week: activeWeek, day: dayNumber };
                }
            } catch (compErr) {
                console.error('❌ [Completion] Failed (Mobile):', compErr);
            }
        }

        // 📍 在哪裡練：存檔同時開始「一次性定位＋反解地名」（與同伴偵測並行，
        //    最多等 6 秒；拿不到就存 null，絕不阻擋存檔）。動態卡會顯示這個地點。
        // 🏋️ 健身房記憶：記這一場、需要時結算頁會跳問題卡（不擋存檔）
        const finalGymTag = gymSession.currentGym();
        gymSession.finish(latestExercises, {
            recordId: localRecordIdRef.current,
            focus: effectivePlan.focus_group || effectivePlan.focus || null,
        }).catch(() => {});

        const locationNamePromise = import('../utils/locationName')
            .then(({ getCurrentLocationName }) => getCurrentLocationName({ timeout: 6000 }))
            .then((n) => { setSavedLocationName(finalGymTag?.name || n || ''); return n; })
            .catch(() => null);

        try {
            const detectedFocusGroup = effectivePlan.focus_group || detectPrimaryMuscleGroup(latestExercises);

            // 計算 RPE-based 平均耗力分數
            const allEffortScores = [];
            latestExercises.forEach(ex => {
                ex.sets?.forEach(set => {
                    if (set.completed && set.effortScore > 0) allEffortScores.push(set.effortScore);
                });
            });
            const avgEffortScore = allEffortScores.length > 0
                ? Math.round(allEffortScores.reduce((a, b) => a + b, 0) / allEffortScores.length)
                : (Number.isFinite(Math.round(progress)) ? Math.round(progress) : 0);

            // 🤝 「一起練」自動偵測（重訓版，仿 Strava）：好友的重訓時段與我重疊（±20 分鐘 /
            //    區間交集）→ 判定一起運動，顯示在最新動態卡下方。偵測失敗不阻擋、不影響存檔。
            let gymCompanions = [];
            try {
                const { detectCompanions, fetchTogetherPartners, mergeCompanions } =
                    await import('../utils/trainingCompanions');
                const withTimeout = (p, ms = 3500) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
                let candidates = [];
                try {
                    const r = await withTimeout(apiClient.get(`/api/social/friends/recent-sessions/${effectiveUserId}?days=1`));
                    candidates = (r?.data?.sessions || [])
                        .filter(s => s.type === 'strength')
                        .map(s => ({ ...s, is_friend: true }));
                } catch (_) { /* 好友端點不可用 → 只比對全站 */ }
                // 🆕 全站公開動態（非好友）：同時段在用 DRVN 練重訓的人也算一起練（與跑步側一致）
                try {
                    const g = await withTimeout(apiClient.get(`/api/feed/global?user_id=${effectiveUserId}&limit=50`));
                    const globalActs = g?.data?.activities || g?.data?.feed || g?.data || [];
                    if (Array.isArray(globalActs)) {
                        candidates = candidates.concat(
                            globalActs
                                .filter((a) => {
                                    const uid2 = a.user_id || a.userId;
                                    const kind = String(a.sport || a.type || a.sport_type || '').toLowerCase();
                                    return uid2 && uid2 !== effectiveUserId && (kind === 'strength' || kind === 'gym');
                                })
                                .map((a) => ({ ...a, is_friend: false }))
                        );
                    }
                } catch (_) { /* 全站動態不可用 → 只比對好友 */ }
                let detected = [];
                if (candidates.length) {
                    const mine = { startTime: Date.now() - finalDurationSec * 1000, duration: finalDurationSec, route: [] };
                    detected = detectCompanions(mine, candidates);
                }
                /* 🤝 「一起練」是事實不是推測：社群那邊按了加入/接受的夥伴，
                   優先於時間重疊猜出來的。兩者合併後才是這一場真正的同行者。 */
                const confirmed = await fetchTogetherPartners(effectiveUserId, 'strength');
                gymCompanions = mergeCompanions(confirmed, detected);
            } catch (_) { /* 端點不可用 → 靜默略過 */ }

            // 🟡 Fix: 改用外層已計算的 estimatedCalories / dynamicIntensity，不再重複讀取 InBody（Issue 11）
            const saveResult = await saveWorkout({
                user_id: effectiveUserId, coach_id: effectivePlan?.coach_id || 'ai_coach',
                overall_score: avgEffortScore,
                metrics: {
                    completion_rate: Number.isFinite(Math.round(progress)) ? Math.round(progress) : 0,
                    calories: estimatedCalories,     // ✅ 共用外層動態估算（不再重複計算）
                    intensity: dynamicIntensity      // ✅ 共用外層動態強度（不再重複計算）
                },
                reps_count: completedSetsCount,
                completed_sets_count: completedSetsCount,
                exercises: latestExercises,
                duration_mins: Math.ceil(finalDurationSec / 60),
                duration_seconds: finalDurationSec,
                total_volume: Math.round(totalVolume),
                hard_sets: totalHardSets,
                muscle_hard_sets: muscleHardSets,
                focus_group: detectedFocusGroup,
                pr_alerts: prAlerts,
                companions: gymCompanions,  // 🤝 跟 session 一起存進後端（跨裝置可見）
                gym_id: finalGymTag?.id || null,           // 🏋️ 在哪間健身房（認得出來才有）
                gym_name: finalGymTag?.name || null,
                location_name: finalGymTag?.name || await locationNamePromise   // 📍 在哪裡練：認得健身房就用健身房名，否則定位反解地名
            });
            // 🤝 本地快取 companions（掛在後端回傳的 session_id 上，供動態卡離線顯示）
            try {
                savedSessionIdRef.current = saveResult?.session_id || savedSessionIdRef.current;
                // 存檔途中已被長按取消：那時還沒有 session id 刪不掉，現在補刪，避免後端留下一筆幽靈紀錄
                if (cancelledRef.current && saveResult?.session_id) {
                    apiClient.post('/api/workout/history/delete', { user_id: effectiveUserId, workout_id: saveResult.session_id })
                        .catch((e) => { console.warn('cancel record (late) failed', e); });
                    savedSessionIdRef.current = null;
                }
                if (gymCompanions.length && saveResult?.session_id) {
                    const { saveSessionCompanions } = await import('../utils/trainingCompanions');
                    saveSessionCompanions(saveResult.session_id, gymCompanions);
                }
            } catch (_) { /* ignore */ }
            // 🆕 離線情況：saveWorkout 已把這筆重訓安全存進本機，連線後會自動同步。
            //    顯示安心提示（info），而非錯誤，因為資料其實沒有遺失。
            if (saveResult && saveResult.offline) {
                setSyncToast({ type: 'info', msg: '已存在這支手機，連上網路會自動同步' });
            }
            // 回報此次重訓總量給進行中的協作（達標時後端自動判定完成）
            try {
                if (totalVolume > 0) reportCollabProgress({ userId: effectiveUserId, type: 'Lift', amount: Math.round(totalVolume) });
            } catch (_) {}
            // 成功時不顯示 Toast，避免干擾結算畫面
        } catch (error) {
            console.error('❌ [Sync] Workout save failed (Mobile):', error);
            // ⚠️ 走到這裡代表連本機 IndexedDB 也寫入失敗（極罕見）。明確告知使用者。
            setSyncToast({ type: 'error', msg: '存檔失敗，請截圖本次數據後再試一次' });
        } finally {
            setIsSaving(false);
            hkEndWorkout();
        }
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handlePause = () => { triggerHaptic('medium'); setIsPaused(true); hkPauseWorkout(); setShowPauseMenu(true); };
    const handleResume = () => { triggerHaptic('success'); setIsPaused(false); hkResumeWorkout(); setShowPauseMenu(false); };
    const handleUseAnalysis = () => {
        triggerHaptic('tap'); setIsPaused(true);
        // 🆕 種下「從分析頁回來」flag：返回時靜默接回進度，不重跑計劃
        try { sessionStorage.setItem('drvn:resumeWorkoutFromAnalysis', '1'); } catch { /* ignore */ }
        if (onOpenAnalysis) onOpenAnalysis();
    };

    if (showCompletion) {
        return (
            <div style={{ maxWidth: '430px', margin: '0 auto', position: 'relative' }}>
                {showShareCard ? (
                    <EvolutionCompletionCard
                        exercises={exercisesWithSets} durationSeconds={finalDurationRef.current || totalTimeElapsed}
                        calories={finalStats.calories || 0} completedSets={completedSetsCount}
                        totalSets={totalSets} heartRate={metrics.heartRate || 0}
                        exercisePRs={exercisePRs}
                        locationName={savedLocationName}
                        onExit={() => setShowShareCard(false)} onShare={() => { }}
                    />
                ) : (
                    <StrengthResultsMobile
                        exercises={exercisesWithSets} durationSeconds={finalDurationRef.current || totalTimeElapsed}
                        calories={finalStats.calories || 0} completedSets={completedSetsCount}
                        caloriesEstimated={finalStats.caloriesEstimated !== false}
                        totalSets={totalSets} heartRate={metrics.heartRate || 0}
                        intensity={finalStats.intensity || 0} exercisePRs={exercisePRs}
                        prAlerts={prAlerts}
                        focusGroup={effectivePlan?.focus_group || ''}
                        userId={effectiveUserId}
                        onExit={onExit}
                        onSaveRecord={() => {
                            setSyncToast({ type: 'info', msg: '紀錄已儲存' });
                            // ✨ 滿版回饋統一入口：破PR > 清晨/深夜彩蛋 > 前幾次里程碑
                            try {
                                recordWorkoutSaveMoments(effectiveUserId, { prCount: exercisePRs?.length || 0 });
                            } catch { /* */ }
                            // 🧭 儲存紀錄 = 收尾 → 回主頁（依需求）
                            onExit?.();
                        }}
                        onShare={() => { triggerHaptic('tap'); setShowShareCard(true); }}
                        onCancelRecord={async () => {
                            // 長按取消：刪除剛存的紀錄（若已存到後端）→ 離開結算
                            cancelledRef.current = true;   // 存檔還在路上 → 回來後補刪（見 completeWorkout）
                            // 本機那一筆與課表打勾也要撤掉：以前只刪後端，首頁／週完成度照樣算這一場
                            try {
                                const lid = localRecordIdRef.current;
                                if (lid) uStorage(effectiveUserId).getAndUpdate('trainingRecords', (records) => {
                                    if (records && typeof records === 'object') delete records[lid];
                                    return records;
                                }, {});
                            } catch (e) { console.warn('cancel local record failed', e); }
                            try {
                                const pd = recordedPlanDayRef.current;
                                if (pd) unrecordStrengthPlanDay(effectiveUserId, pd.planId, pd.week, pd.day);
                                recordedPlanDayRef.current = null;
                            } catch (e) { console.warn('undo plan day failed', e); }
                            try {
                                const wid = savedSessionIdRef.current;
                                if (wid) await apiClient.post('/api/workout/history/delete', { user_id: effectiveUserId, workout_id: wid });
                            } catch (e) { console.warn('cancel record failed', e); }
                            savedSessionIdRef.current = null;
                            onExit?.();
                        }}
                    />
                )}
                <GymSessionSheet review={gymSession.review} userId={effectiveUserId} onDone={gymSession.resolve} />
                <ChallengeCompletionModal
                    isOpen={showChallengeCelebration} onClose={() => setShowChallengeCelebration(false)}
                    challenge={completedChallenge}
                    badge={completedChallenge ? { icon: completedChallenge.badge_icon, color: completedChallenge.badge_color, reward_points: completedChallenge.reward_points } : null}
                />
                {/* SYNC TOAST (For Checkout Page) */}
                <AnimatePresence>
                    {syncToast && (
                        <motion.div
                            initial={{ opacity: 0, y: 20, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.9 }}
                            className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[10000] flex items-center gap-3 px-5 py-3 rounded-full shadow-2xl"
                            style={{
                                background: syncToast.type === 'error' ? '#D94030' : '#161415',
                                color: '#F6F4F1'
                            }}
                        >
                            <span style={{ fontSize: 16 }}>
                                {syncToast.type === 'error' ? '⚠️' : '☁️'}
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>
                                {syncToast.msg}
                            </span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    }

    if (!currentExercise) {
        return (
            // 訓練中是全螢幕模式，不放底部導覽。原本這裡有一個沒 import 的
            // <MobileNavigation />，只要走到這個分支就會丟 ReferenceError。
            // 離開只走「返回」，與上面另一個 early return 一致。
            <div className="min-h-[100dvh] flex items-center justify-center" style={{ maxWidth: '430px', margin: '0 auto' }}>
                <motion.button {...pressProps('row')} onClick={onExit} className="px-6 py-2 bg-[#E8D5B5] rounded-lg">返回</motion.button>
            </div>
        );
    }

    const hasImages = activeImages.length > 0 && !imgFailed;

    /* 🩹 收斂：「遞減組／暖身組／收尾組 · 這樣做」與「動作提示」原本各自獨立判斷，
       同時成立時會兩三張疊在一起（例如超級組的暖身組又帶 tip）。
       改成同一個插槽、依優先序只顯示一張：
         超級組動線 > 遞減組 > 暖身組 > 收尾組 > 動作提示
       超級組排第一是因為它講的是「等一下要去哪」，其他三張講的是「這一組怎麼做」。 */
    const howToCard = (() => {
        if (currentExercise.supersetGroup) return 'tip';
        const repsStr = String(currentExercise.reps ?? '');
        const isDrop = currentExercise.isDropSet || repsStr.includes('->');
        if (isDrop && repsStr.split('->').map(n => parseInt(n.trim())).filter(n => !isNaN(n)).length >= 2) return 'drop';
        if (currentSet <= (currentExercise.warmupSets || 0)) return 'warmup';
        const note = String(currentExercise.note || currentExercise.finisher || '');
        if (/finisher|力竭|燃燒|收尾|力竟/i.test(note) || currentExercise.isFinisher) return 'finisher';
        if (exerciseTip || currentExercise.note) return 'tip';
        return null;
    })();

    // ── 版位基準線（2026-09 跑版修正）─────────────────────────────
    // LiveActivityCard 是 absolute（不佔文件流），實際底緣 =
    //   max(20px, safe-area-top) + 62px(玻璃條本體) + 12px(pb-3)
    // 頂部所有懸浮提示與媒體區都以這條線為基準，換機型才不會互相壓到。
    const TOP_BAR_BOTTOM = TOP_BAR_BOTTOM_CSS;   // 提示層與媒體區共用同一條基準線
    // 同一時間只會出現一張頂部提示；先在圖片上方留好它的淨空，
    // 提示才不會蓋到示範圖（Plan Echo 卡比較高，留多一點）。
    const topHintClear = planEcho ? 168 : (overloadSuggestion || coachNote) ? 96 : 0;

    return (
        <div
            className="relative flex flex-col overflow-hidden"
            style={{
                maxWidth: '430px',
                margin: '0 auto',
                minHeight: '100dvh',
                height: '100dvh',
                background: '#CFC6B8', // Pebble color
                fontFamily: '"Tenor Sans", "Geist", "Plus Jakarta Sans", sans-serif',
                color: '#161415',
            }}
        >

            {/* BACKGROUND — 功能性氛圍燈：顏色與呼吸節奏會隨訓練狀態變化
                （訓練中=珊瑚、休息=青、心率過高=紅警示、完成一組=綠、暫停=暗） */}
            <WorkoutAmbientLight
                isResting={isResting}
                isPaused={isPaused}
                isHRTooHigh={isHRTooHigh}
                justCompleted={ambientFlash}
                progress={progress}
                loadScore={lastEffortScore || (currentExercise?.sets?.length ? currentExercise.sets[currentExercise.sets.length - 1].effortScore : 0)}
            />

            {/* ====================================================
                🔥 FIX: LiveActivityCard is ALWAYS visible
                Moved OUTSIDE the image conditional block
            ==================================================== */}
            <div className="relative z-20" data-onboard="session-dashboard">
                <LiveActivityCard
                    durationSeconds={displayDuration}
                    /* 🆕 沒手錶就傳 null，LiveActivityCard 內部會渲染 "--" */
                    calories={hasWatchData ? displayCalories : null}
                    heartRate={hasWatchData ? displayHeartRate : null}
                    hasWatchData={hasWatchData}
                    watchConnected={watch.connected || watch.isRecording}
                    watchRecording={watch.isRecording}
                    isPaused={isPaused}
                    onTogglePause={isPaused ? handleResume : handlePause}
                    onTapQueue={() => setShowQueueSheet(true)}
                />
            </div>

            {/* 🔁 Plan Echo — 同款/相似課表提示卡：「上次練這份課表時…」 */}
            <SessionHintLayer>
            <AnimatePresence>
                {planEcho && (
                    <motion.div
                        initial={{ opacity: 0, y: -14, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.97 }}
                        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                        /* 版位由 SessionHintLayer 負責，這裡只管動畫。 */
                    >
                    <div
                        className="rounded-[20px] px-4 py-3.5"
                        style={{
                            background: 'rgba(255,255,255,0.86)',
                            backdropFilter: 'blur(24px) saturate(150%)',
                            WebkitBackdropFilter: 'blur(24px) saturate(150%)',
                            border: '1px solid rgba(255,255,255,0.65)',
                            boxShadow: '0 18px 40px -14px rgba(22,20,21,0.34), inset 0 1px 0 rgba(255,255,255,0.9)',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.22em', color: '#F95C4B', marginBottom: 4 }}>
                                    {planEcho.similarity === 'exact' ? '同款課表 · Last Time' : '相似課表 · Last Time'}
                                </div>
                                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#161415', marginBottom: 6 }}>{planEcho.opener}</div>
                                {(planEcho.echo.bullets || []).slice(0, 3).map((b, bi) => (
                                    <div key={bi} style={{ display: 'flex', gap: 7, marginBottom: 3 }}>
                                        <span style={{ flexShrink: 0, width: 4, height: 4, borderRadius: '50%', background: '#F95C4B', marginTop: 7 }} />
                                        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(22,20,21,0.72)', lineHeight: 1.5, flex: 1 }}>{b}</span>
                                    </div>
                                ))}
                            </div>
                            <motion.button {...pressProps('row')}
 onClick={() => setPlanEcho(null)}
 aria-label="關閉提示"
 style={{
 flexShrink: 0, width: 26, height: 26, borderRadius: '50%',
 background: 'rgba(22,20,21,0.06)', border: 'none',
 fontSize: 13, fontWeight: 800, color: 'rgba(22,20,21,0.55)', lineHeight: 1,
 }}
 >
                                ✕
                            </motion.button>
                        </div>
                    </div>
                    </motion.div>
                )}
            </AnimatePresence>
            </SessionHintLayer>

            {/* MAIN CONTENT */}
            <div className="relative z-10 flex-1 flex flex-col">

                {/* MEDIA SECTION — 有 Micro-Win 提示時把圖片往下推，讓提示完整落在儀表板下方、圖片上方（不再壓到圖片） */}
                <div data-onboard="session-exercise" className="flex-1 flex items-center justify-center px-4 pb-0 relative" style={{
                    /* 🩹 2026-09 跑版修正（兩個獨立的錯）：
                       1) paddingTop 原本寫死 140px，但頂欄吃 safe-area：iPhone 上
                          頂欄底緣已經在 133px、提示卡在 151px，圖片卻還停在 140px
                          → 圖片貼著頂欄、提示卡整張壓在圖片上。改成跟頂欄同一條
                          基準線算，並把提示卡的淨空一起留出來。
                       2) paddingBottom 原本再補 132px 說要「幫底部 CTA 留淨空」，
                          但 CTA 的淨空是下面 BOTTOM CONTENT 的 pb-40 在負責，
                          這 132px 只是在畫面正中間挖出一個 ~145px 的空洞。
                       媒體區是 flex-1，改它的 padding 只會影響圖片自己的位置，
                       不會推到底下的進度條與動作名稱（版面一樣不會跳）。 */
                    paddingTop: `calc(${TOP_BAR_BOTTOM} + 12px + ${topHintClear}px)`,
                    paddingBottom: 12,
                    minHeight: 0,
                    /* 提示卡出現/關掉時只有圖片會平移，底下的資訊列不動 */
                    transition: 'padding-top 0.35s cubic-bezier(0.16,1,0.3,1)',
                }}>

                    {/* ── Skip button removed from here ── */}

                    <AnimatePresence mode="wait">
                        {hasImages ? (
                            // 🔥 Has images: 兩張示範圖「連續交叉淡入淡出」，不再用 key 切換造成閃爍。
                            //    兩張圖一律同時掛載並堆疊，只切換 opacity，達成平滑連續變換(crossfade)。
                            <motion.div
                                key="exercise-media"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}   // 🔧 移除呼吸效果：圖卡保持靜止
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.3 }}
                                whileTap={{ scale: 0.98 }}
                                className="relative w-auto max-w-full overflow-hidden cursor-pointer"
                                onClick={() => setShowLastSessionRecord(true)}
                                style={{
                                    /* 空間被提示卡壓縮時圖片跟著縮，不會溢出被 overflow-hidden 裁掉 */
                                    maxHeight: 'min(35dvh, 100%)',
                                    borderRadius: '24px',
                                    background: 'rgba(255, 255, 255, 0.25)',
                                    backdropFilter: 'blur(40px) saturate(150%)',
                                    WebkitBackdropFilter: 'blur(40px) saturate(150%)',
                                    border: '1px solid rgba(255, 255, 255, 0.4)',
                                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 16px 40px rgba(0,0,0,0.1)',
                                    transform: 'rotate(0deg)'
                                }}
                            >
                                {/* 用第一張圖撐開容器尺寸（不可見，僅佔位，避免高度跳動） */}
                                <img aria-hidden="true"
                                    src={activeImages[0]}
                                    alt=""
                                    className="w-full h-full object-contain opacity-0 pointer-events-none"
                                />
                                {/* 兩張(或多張)示範圖堆疊，靠 opacity 交叉淡入淡出 → 連續平滑變換，無閃爍 */}
                                {activeImages.map((src, i) => (
                                    <img key={src + i} loading="lazy" decoding="async"
                                        src={src}
                                        alt={currentExercise.name}
                                        className="absolute inset-0 w-full h-full object-contain"
                                        style={{
                                            opacity: i === currentFrame ? 1 : 0,
                                            transition: 'opacity 0.7s ease-in-out'  // 與輪播間隔(700ms)同步，連續交替
                                        }}
                                        onError={() => setImgFailed(true)}
                                    />
                                ))}
                            </motion.div>
                        ) : (
                            // 🔥 No images: show animated placeholder (ALWAYS shows)
                            <div
                                className="w-full px-8 cursor-pointer active:scale-[0.98] transition-transform"
                                onClick={() => setShowLastSessionRecord(true)}
                            >
                                <ExercisePlaceholder
                                    exerciseName={currentExercise.name}
                                    category={currentExercise.category || currentExercise.day_focus || 'STRENGTH'}
                                />
                            </div>
                        )}
                    </AnimatePresence>
                </div>

                {/* BOTTOM CONTENT */}
                <div className="relative z-10 px-6 mt-3 pb-40 flex flex-col bg-transparent">

                    {/* 🎵 Integrated Music + Workout Progress Bar（邊做邊填模式不顯示總進度條） */}
                    <WorkoutMusicProgressBar progress={progress} hideProgress={isFreestyle} />

                    {/* 🩹 已移除「分段進度條」：它畫的是這個動作做到第幾組，
                        與下方資訊列右側的「第 1 組 / 3」是同一件事，同一畫面講兩次。
                        留文字版（更精確、也是眼睛真正會讀的），拿掉圖形版。 */}

                    {/* 🩹 已移除「Apple Watch · 未偵測到手錶數據」提示列。
                        原本的邏輯是 state !== 'off' 就 return null —— 也就是這一列
                        「只有在沒有手錶時才會出現」，存在的唯一功用是告訴使用者
                        「你沒有手錶」。訓練中沒有任何可以據此行動的事，
                        而頂欄本來就有手錶圖示在表示狀態。 */}

                    {/* Exercise Info — 換動作時整組資訊由下而上淡入（Premium 緩動，stagger） */}
                    <motion.div
                        key={`exinfo-${currentExerciseIndex}`}
                        className="space-y-3"
                        initial="hidden"
                        animate="show"
                        variants={{
                            hidden: {},
                            show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
                        }}
                    >
                        <motion.div
                            className="flex items-center gap-2 mt-2"
                            variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } } }}
                        >
                            <span
                                className="px-2.5 py-1 rounded-md text-[12px] shrink-0"
                                style={{
                                    background: 'rgba(22,20,21,0.05)',
                                    border: '1px solid rgba(22,20,21,0.12)',
                                    color: '#161415',
                                    letterSpacing: '0.22em',
                                    fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
                                    fontWeight: 600,
                                }}
                            >
                                {/* 🩹 部位標籤：改用 getMuscleLabel（從動作名稱/肌群正確推斷），
                                    不再直接顯示可能髒掉的 category（圖三 Reverse Pec Deck 顯示 CORE 的修法）。 */}
                                {getMuscleLabel(currentExercise) || currentExercise.day_focus || "力量訓練"}
                            </span>

                            {/* Superset chip — Coral ghost (拿掉 outer glow) */}
                            {currentExercise.supersetGroup && (() => {
                                const groupExs = exercisesWithSets.filter(e => e.supersetGroup === currentExercise.supersetGroup);
                                const myIndex = groupExs.findIndex(e => e.name === currentExercise.name);
                                const letter = String.fromCharCode(65 + Math.max(0, myIndex));
                                return (
                                    <span
                                        className="px-2.5 py-1 rounded-md text-[12px] shrink-0"
                                        style={{
                                            background: 'rgba(249,92,75,0.10)',
                                            border: '1px solid rgba(249,92,75,0.28)',
                                            color: '#F95C4B',
                                            letterSpacing: '0.22em',
                                            fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
                                            fontWeight: 500,
                                        }}
                                    >
                                        超級組 {letter}
                                    </span>
                                );
                            })()}

                            <span
                                className="text-[12px] ml-auto"
                                style={{
                                    color: 'rgba(22, 20, 21, 0.55)',
                                    letterSpacing: '0.22em',
                                    fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
                                    fontWeight: 500,
                                }}
                            >
                                {/* 規範 v1：數值更新用上滑換位（160ms house easing），不整行重渲染 */}
                                {/* 🩹 暖身時原本顯示「第 1 組 / 3」，但 3 是正式組總數，
                                    而暖身說明卡寫的是「第 1/2 組」（暖身組數）—— 同一個畫面
                                    兩個不同分母長得一模一樣，比重複更糟。暖身改標「暖身」。 */}
                                {currentSet <= (currentExercise.warmupSets || 0) ? '暖身 ' : '第 '}<span style={{ display: 'inline-flex', overflow: 'hidden', verticalAlign: 'bottom' }}>
                                    <AnimatePresence mode="popLayout" initial={false}>
                                        <motion.span
                                            key={currentSet}
                                            className="tabular-nums"
                                            initial={{ y: 12, opacity: 0 }}
                                            animate={{ y: 0, opacity: 1 }}
                                            exit={{ y: -12, opacity: 0 }}
                                            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                                        >{currentSet}</motion.span>
                                    </AnimatePresence>
                                </span> 組{currentExercise.openEnded ? '' : (
                                    currentSet <= (currentExercise.warmupSets || 0)
                                        ? ` / ${currentExercise.warmupSets}`
                                        : ` / ${currentExercise.sets_target || 3}`
                                )}
                            </span>
                        </motion.div>

                        <motion.div
                            className="flex items-start justify-between gap-4"
                            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } } }}
                        >
                            <h1
                                className="leading-[0.95] flex-1"
                                style={{
                                    fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif',
                                    fontWeight: 400,
                                    fontSize: 36,
                                    color: '#161415',
                                    letterSpacing: '-0.01em',
                                }}
                            >
                                {getExerciseNameZh(currentExercise.name)}
                            </h1>
                            <motion.button
                                whileTap={{ scale: 0.92 }}
                                onClick={handleOpenSubstitute}
                                aria-label="Substitute Exercise"
                                className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center transition-colors"
                                style={{
                                    /* 🩹 這頁底色是淺色 Pebble，白色 6%/10% 等於隱形；
                                       換成與「部位」chip 同一組深色描邊，按鈕才看得見。 */
                                    background: 'rgba(22,20,21,0.05)',
                                    border: '1px solid rgba(22,20,21,0.12)',
                                    color: 'rgba(22, 20, 21, 0.55)',
                                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)',
                                }}
                            >
                                <RefreshCw size={18} strokeWidth={1.6} />
                            </motion.button>
                        </motion.div>

                        {/* Reps / PR / Load — divide-x hairline 取代 border-l */}
                        <motion.div
                            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } } }}
                            className="flex items-center divide-x"
                            style={{
                                borderTop: '1px solid rgba(22,20,21,0.10)',
                                paddingTop: 12,
                                color: 'rgba(22, 20, 21, 0.55)',
                            }}
                        >
                            {/* 🩹 這行擠了「次數 · 個人最佳 · LOAD 分區 · ？」四段，在 393–402px 的
                                iPhone 上本來就已經溢出（實測 363px 內容塞進 354px），字級補回 11px
                                後更嚴重。改成可換行 —— 寧可多一行，也不要把數字截掉。 */}
                            <style>{`.workout-divide > * + * { border-left: 1px solid rgba(22,20,21,0.10); padding-left: 14px; margin-left: 14px; }`}</style>
                            <div className="workout-divide flex items-center" style={{ flexWrap: 'wrap', rowGap: 10 }}>
                                <div className="flex items-baseline gap-1.5">
                                    {/* 🆕 依需求移除次數前的圖示，數字直接開頭 */}
                                    <span
                                        className="tabular-nums"
                                        style={{
                                            fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif',
                                            fontWeight: 400,
                                            fontSize: 22,
                                            color: '#161415',
                                            lineHeight: 1,
                                        }}
                                    >
                                        {currentExercise.reps}
                                    </span>
                                    <span
                                        className="text-[12px]"
                                        style={{
                                            color: 'rgba(22, 20, 21, 0.55)',
                                            letterSpacing: '0.22em',
                                            fontFamily: '"Geist Mono", monospace',
                                            fontWeight: 500,
                                        }}
                                    >
                                        次
                                    </span>
                                </div>

                                {exercisePRs[currentExercise.name] > 0 && (
                                    <div className="flex items-baseline gap-1.5">
                                        <Trophy size={14} strokeWidth={1.6} style={{ color: '#C9A876' }} />
                                        <span
                                            className="tabular-nums"
                                            style={{
                                                fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif',
                                                fontWeight: 400,
                                                fontSize: 16,
                                                color: '#C9A876',
                                                lineHeight: 1,
                                            }}
                                        >
                                            {exercisePRs[currentExercise.name]}
                                            <span style={{ fontSize: 11, opacity: 0.6 }}>kg</span>
                                        </span>
                                        <span
                                            className="text-[12px]"
                                            style={{
                                                color: 'rgba(201,168,118,0.55)',
                                                letterSpacing: '0.22em',
                                                fontFamily: '"Geist Mono", monospace',
                                                fontWeight: 500,
                                            }}
                                        >
                                            個人最佳
                                        </span>
                                    </div>
                                )}

                                {/* 🩹 收斂：LOAD 分區已移到休息頁的「下一組建議」卡 ——
                                    正在做組的當下沒空讀負荷分區，休息時才有；而且它本來就是
                                    建議重量的依據，放在一起才看得懂。這行只留「次數 · 個人最佳」。 */}
                            </div>
                        </motion.div>

                        {/* 🔻 特殊組型「怎麼做」直接顯示 — 遞減組(drop set)：把「12 → 8」翻成每組的具體操作，
                            使用者不用自己解讀。當前該做哪一組會高亮。 */}
                        {(() => {
                            if (howToCard !== 'drop') return null;   // 同插槽只顯示一張
                            const repsStr = String(currentExercise.reps ?? '');
                            const stages = repsStr.split('->').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
                            if (stages.length < 2) return null;
                            const doneInEx = (currentExercise.sets || []).filter(s => s && s.completed).length;
                            const curStageIdx = doneInEx % stages.length;   // 這個循環內，現在該做第幾階
                            return (
                                <motion.div
                                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                                    /* 遞減組＝今天這一組跟平常不一樣，用金屬面板當底把它跟一般組拉開。
                                       材質定義在 styles/titanium-system.css 的 .ti-metal-panel。
                                       原本是一層淡珊瑚底 —— 但這一頁到處都是珊瑚，它反而不顯眼。 */
                                    className="ti-metal-panel p-3 rounded-[16px]"
                                >
                                    <div className="flex items-center gap-1.5 mb-2">
                                        <TrendingUp size={13} strokeWidth={2} style={{ color: '#F95C4B', transform: 'scaleY(-1)' }} />
                                        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', color: '#F95C4B' }}>遞減組 · 這樣做</span>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        {stages.map((rep, si) => {
                                            const isNow = si === curStageIdx;
                                            const drop = si === 0 ? '起始重量' : '降重 20%';
                                            return (
                                                <div key={si} className="flex items-center gap-2" style={{ opacity: isNow ? 1 : 0.5 }}>
                                                    <span style={{ width: 18, height: 18, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        background: isNow ? '#F95C4B' : 'rgba(22,20,21,0.08)', color: isNow ? '#fff' : 'rgba(22,20,21,0.5)', fontSize: 11, fontWeight: 700 }}>{si + 1}</span>
                                                    <span style={{ fontFamily: '"Tenor Sans","Noto Sans TC",sans-serif', fontSize: 14, color: '#161415' }}>{rep} 次</span>
                                                    <span style={{ fontSize: 11, color: si === 0 ? 'rgba(22,20,21,0.5)' : '#F95C4B', fontWeight: 500 }}>· {drop}</span>
                                                    {isNow && <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: '#F95C4B', marginLeft: 'auto' }}>← 現在</span>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <p style={{ fontSize: 11, color: 'rgba(22,20,21,0.5)', marginTop: 8, lineHeight: 1.5 }}>
                                        不休息連續做完 {stages.join(' → ')} 次，每階遞減重量約 20%，直到力竭。
                                    </p>
                                </motion.div>
                            );
                        })()}

                        {/* 🔥 暖身組「怎麼做」：正在做暖身組時，直接說明要用比正式組輕、不要做到力竭。 */}
                        {(() => {
                            if (howToCard !== 'warmup') return null;   // 同插槽只顯示一張
                            const wu = currentExercise.warmupSets || 0;
                            return (
                                <motion.div
                                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                                    className="p-3 rounded-[16px]"
                                    style={{ background: 'rgba(143,158,139,0.12)', border: '1px solid rgba(143,158,139,0.35)' }}
                                >
                                    <div className="flex items-center gap-1.5 mb-1.5">
                                        <Flame size={13} strokeWidth={2} style={{ color: '#5A7A3A' }} />
                                        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', color: '#5A7A3A' }}>暖身組 · 這樣做</span>
                                        <span style={{ fontSize: 11, color: 'rgba(22,20,21,0.45)', fontWeight: 500 }}>第 {currentSet}/{wu} 組</span>
                                    </div>
                                    <p style={{ fontSize: 12, color: '#161415', lineHeight: 1.6 }}>
                                        用正式組約 <b>50–60%</b> 的重量做 {currentExercise.reps} 次，<b>不要做到力竭</b>——目的是喚醒肌肉、拉開關節活動度，把力氣留給後面的正式組。
                                    </p>
                                </motion.div>
                            );
                        })()}

                        {/* ⚡ Finisher / 力竭組「怎麼做」：note 含 Finisher/力竭 時，把它變成明確操作說明。 */}
                        {(() => {
                            if (howToCard !== 'finisher') return null;   // 同插槽只顯示一張
                            return (
                                <motion.div
                                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                                    className="p-3 rounded-[16px]"
                                    style={{ background: 'linear-gradient(180deg, rgba(249,92,75,0.10) 0%, rgba(249,92,75,0.05) 100%)', border: '1px solid rgba(249,92,75,0.28)' }}
                                >
                                    <div className="flex items-center gap-1.5 mb-1.5">
                                        <Zap size={13} strokeWidth={2} style={{ color: '#F95C4B' }} />
                                        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', color: '#F95C4B' }}>收尾組 FINISHER · 這樣做</span>
                                    </div>
                                    <p style={{ fontSize: 12, color: '#161415', lineHeight: 1.6 }}>
                                        最後一組做到<b>力竭</b>：動作維持標準，能做幾下就做幾下。全程<b>控制動作、不要借力甩動</b>。
                                    </p>
                                </motion.div>
                            );
                        })()}

                        {currentExercise.rpe_target && (
                            <div className="flex items-center gap-2">
                                <span
                                    className="text-[9px] uppercase"
                                    style={{
                                        color: 'rgba(22, 20, 21, 0.55)',
                                        letterSpacing: '0.22em',
                                        fontFamily: '"Geist Mono", monospace',
                                        fontWeight: 500,
                                    }}
                                >
                                    Target RPE
                                </span>
                                <span
                                    className="px-2 py-0.5 text-[11px] tabular-nums rounded-md"
                                    style={{
                                        background: 'rgba(22,20,21,0.05)',
                                        border: '1px solid rgba(22,20,21,0.12)',
                                        color: '#161415',
                                        fontFamily: '"Geist Mono", monospace',
                                        fontWeight: 500,
                                    }}
                                >
                                    {currentExercise.rpe_target}
                                </span>
                            </div>
                        )}

                        {/* 超級組智慧動線提示 — White Liquid Glass */}
                        {howToCard === 'tip' && (() => {
                            let isSS = !!currentExercise.supersetGroup;
                            let ssMessage = '';
                            if (isSS) {
                                const groupExs = exercisesWithSets.filter(e => e.supersetGroup === currentExercise.supersetGroup);
                                const myIndex = groupExs.findIndex(e => e.name === currentExercise.name);
                                const isLast = myIndex === groupExs.length - 1;

                                if (isLast) {
                                    ssMessage = `本輪超級組最後一項：做完後進入組間休息`;
                                } else {
                                    const nextLetter = String.fromCharCode(65 + myIndex + 1);
                                    ssMessage = `做完不休息，直接跳轉動作 ${nextLetter}`;
                                }
                            }

                            return (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="p-3.5 rounded-[18px] flex gap-3 items-start"
                                    style={{
                                        // 🤍 White Liquid Glass
                                        background: 'linear-gradient(180deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.4) 100%)',
                                        backdropFilter: 'blur(20px) saturate(140%)',
                                        WebkitBackdropFilter: 'blur(20px) saturate(140%)',
                                        border: '1px solid rgba(255,255,255,0.8)',
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.06), inset 0 1px 1px rgba(255,255,255,1)',
                                    }}
                                >
                                    {isSS ? (
                                        <Zap size={14} strokeWidth={1.8} style={{ color: '#F95C4B', marginTop: 2, flexShrink: 0 }} />
                                    ) : (
                                        <Lightbulb size={14} strokeWidth={1.8} style={{ color: '#161415', marginTop: 2, flexShrink: 0 }} />
                                    )}
                                    <div className="flex-1">
                                        {isSS && (
                                            <p className="leading-relaxed mb-1" style={{ fontSize: 13, fontWeight: 600, color: '#161415', fontFamily: '"Tenor Sans", "Geist", sans-serif' }}>
                                                {ssMessage}
                                            </p>
                                        )}
                                        {currentExercise.note && !isSS && (
                                            <p className="leading-relaxed mb-1" style={{ fontSize: 13, fontWeight: 600, color: '#161415', fontFamily: '"Tenor Sans", "Geist", sans-serif' }}>
                                                {currentExercise.note}
                                            </p>
                                        )}
                                        {exerciseTip && (
                                            <p className="leading-relaxed" style={{ fontSize: 11, fontWeight: 500, color: 'rgba(22, 20, 21, 0.7)', fontFamily: '"Tenor Sans", "Geist", sans-serif' }}>
                                                {exerciseTip.replace(/^[^：:]*[：:]\s*/, '')}
                                            </p>
                                        )}
                                    </div>
                                </motion.div>
                            );
                        })()}
                    </motion.div>
                </div>
            </div>

            {/* 🔥 ENHANCED COMPLETE SET BUTTON - Fixed Bottom */}
            <div data-onboard="session-actionbar" className="fixed bottom-[40px] left-0 right-0 px-5 z-20 flex flex-col gap-2" style={{ maxWidth: '430px', margin: '0 auto' }}>
                <CompleteSetButton
                    onPress={handleCompleteSet}
                    onHoldEnd={() => { setIsPaused(true); setShowSummaryReview(true); }}
                    currentSet={currentSet}
                    totalSets={currentExercise.sets_target || 3}
                    warmupSets={currentExercise.warmupSets || 0}
                    openEnded={currentExercise.openEnded}
                />
            </div>

            {/* ======================== OVERLAYS ======================== */}

            {/* REST TIMER OVERLAY - 升級版 */}
            <AnimatePresence>
                {isResting && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed top-0 bottom-0 w-full z-40 flex flex-col items-center justify-start p-8 overflow-y-auto"
                        style={{
                            maxWidth: '430px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            paddingBottom: 'calc(48px + env(safe-area-inset-bottom, 16px))',
                            // 🆕 改為 misty grey（Mist #E8E9E6 冷灰），移除星空頂
                            background: 'linear-gradient(180deg, #ECEDEB 0%, #E8E9E6 55%, #DFE0DD 100%)',
                        }}
                    >
                        {/* 🆕 星空頂已移除，改用 misty grey 純色背景 */}

                        <div className="flex-none flex flex-col items-center justify-start gap-4 mt-20">
                            {/* Mini Music Chip */}
                            <RestMusicChip />

                            {/* HR Display — 拿掉 animate-ping，改 Coral 呼吸 */}
                            <motion.div
                                initial={{ y: -20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                className="relative z-10 flex flex-col items-center gap-2 mt-2"
                            >
                                <div className="flex items-baseline gap-2">
                                    <motion.span
                                        animate={isHRTooHigh ? { opacity: [0.6, 1, 0.6] } : { opacity: 0.55 }}
                                        transition={isHRTooHigh ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } : {}}
                                        style={{ display: 'inline-flex', alignItems: 'center' }}
                                    >
                                        <Heart
                                            size={16}
                                            strokeWidth={1.8}
                                            style={{
                                                color: isHRTooHigh ? '#F95C4B' : 'rgba(246,244,241,0.4)',
                                                fill: isHRTooHigh ? '#F95C4B' : 'transparent',
                                            }}
                                        />
                                    </motion.span>
                                    <span
                                        className="tabular-nums"
                                        title={hasWatchData ? '' : '尚未偵測到 Apple Watch'}
                                        style={{
                                            fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif',
                                            fontWeight: 400,
                                            fontSize: 42,
                                            color: '#161415',
                                            lineHeight: 1,
                                            letterSpacing: '-0.01em',
                                        }}
                                    >
                                      {hasWatchData && displayHeartRate > 0 ? Math.round(displayHeartRate) : "—"}
                                    </span>
                                    <span
                                        className="uppercase"
                                        style={{
                                            color: 'rgba(22,20,21,0.42)',
                                            fontSize: 9,
                                            letterSpacing: '0.28em',
                                            fontFamily: '"Geist Mono", monospace',
                                            fontWeight: 500,
                                        }}
                                    >
                                        BPM
                                    </span>
                                </div>
                                {isHRTooHigh && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                                        style={{
                                            background: 'rgba(249,92,75,0.08)',
                                            border: '1px solid rgba(249,92,75,0.28)',
                                            backdropFilter: 'blur(8px)',
                                            WebkitBackdropFilter: 'blur(8px)',
                                        }}
                                    >
                                        <AlertTriangle size={11} strokeWidth={1.8} style={{ color: '#F95C4B' }} />
                                        <p
                                            className="uppercase"
                                            style={{
                                                color: '#F95C4B',
                                                fontSize: 9,
                                                letterSpacing: '0.22em',
                                                fontFamily: '"Geist Mono", monospace',
                                                fontWeight: 500,
                                            }}
                                        >
                                            Heart Rate High — slow down
                                        </p>
                                    </motion.div>
                                )}
                            </motion.div>
                        </div>

                        {/* Middle Section — 瑞士極簡：運動員語錄為主角（大膽字體 + Framer Motion 出場），
                            恢復倒數退居小字；破 PR 時整段被「時尚彩蛋」接管 */}
                        <div className="relative z-10 w-full flex flex-col items-center mt-10 px-1">
                            <AnimatePresence mode="wait">
                                {prCelebration ? (
                                    /* ══ 🎉 PR 彩蛋 — Swiss fashion takeover ══ */
                                    <motion.div
                                        key="pr-celebration"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0, transition: { duration: 0.25 } }}
                                        className="w-full flex flex-col items-start"
                                    >
                                        {/* Coral rule 由左掃入 */}
                                        <motion.div
                                            initial={{ scaleX: 0 }}
                                            animate={{ scaleX: 1 }}
                                            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                                            style={{ transformOrigin: 'left', width: '100%', height: 5, background: '#F95C4B' }}
                                        />
                                        <motion.span
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.25, duration: 0.4 }}
                                            className="uppercase mt-5"
                                            style={{ color: '#F95C4B', fontSize: 9, letterSpacing: '0.3em', fontFamily: '"Geist Mono", monospace', fontWeight: 700 }}
                                        >
                                            {prCelebration.kind === 'e1rm' ? '— Estimated 1RM Record' : '— Personal Record'}
                                        </motion.span>
                                        {/* NEW PR 巨型字 clip-reveal */}
                                        <div style={{ overflow: 'hidden', marginTop: 6 }}>
                                            <motion.h2
                                                initial={{ y: '110%' }}
                                                animate={{ y: 0 }}
                                                transition={{ delay: 0.18, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                                                style={{
                                                    fontSize: 'clamp(3.2rem, 17vw, 4.6rem)', fontWeight: 900, lineHeight: 0.92,
                                                    letterSpacing: '-0.045em', textTransform: 'uppercase', color: '#161415', margin: 0,
                                                    fontFamily: '-apple-system, "Helvetica Neue", Helvetica, sans-serif',
                                                }}
                                            >
                                                New<br />Apex
                                            </motion.h2>
                                        </div>
                                        {/* 動作 + 舊紀錄 → 新紀錄 */}
                                        <motion.div
                                            initial={{ opacity: 0, y: 14 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.55, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                            className="mt-6 w-full"
                                            style={{ borderTop: '1px solid rgba(22,20,21,0.12)', paddingTop: 14 }}
                                        >
                                            <p className="uppercase" style={{ fontSize: 9, letterSpacing: '0.22em', color: 'rgba(22,20,21,0.5)', fontFamily: '"Geist Mono", monospace', margin: 0 }}>
                                                {getExerciseNameZh(prCelebration.name)}
                                            </p>
                                            <div className="flex items-baseline gap-3 mt-2 tabular-nums">
                                                <span style={{ fontSize: 24, fontWeight: 400, color: 'rgba(22,20,21,0.35)', textDecoration: 'line-through', fontFamily: '"Tenor Sans", sans-serif' }}>
                                                    {prCelebration.oldPR}
                                                </span>
                                                <motion.span
                                                    initial={{ scale: 0.7, opacity: 0 }}
                                                    animate={{ scale: 1, opacity: 1 }}
                                                    transition={{ delay: 0.75, type: 'spring', stiffness: 300, damping: 16 }}
                                                    style={{ fontSize: 46, fontWeight: 400, color: '#F95C4B', lineHeight: 1, fontFamily: '"Tenor Sans", sans-serif' }}
                                                >
                                                    {prCelebration.newPR}<span style={{ fontSize: 15, opacity: 0.6 }}>kg</span>
                                                </motion.span>
                                            </div>
                                            {prCelebration.kind === 'e1rm' && (
                                                <p style={{ fontSize: 11, color: 'rgba(22,20,21,0.5)', margin: '6px 0 0', fontFamily: '"Geist Mono", monospace', letterSpacing: '0.06em' }}>
                                                    同重量做出更多下 — 估算 1RM 創新高
                                                </p>
                                            )}
                                        </motion.div>
                                        {/* 破紀錄語錄 */}
                                        {prCelebration.quote && (
                                            <motion.p
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                transition={{ delay: 1.0, duration: 0.6 }}
                                                style={{ marginTop: 18, fontSize: 15, lineHeight: 1.6, color: 'rgba(22,20,21,0.72)', fontStyle: 'italic', fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif' }}
                                            >
                                                「{prCelebration.quote.text}」
                                                <span style={{ display: 'block', marginTop: 6, fontSize: 9, fontStyle: 'normal', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(22,20,21,0.4)', fontFamily: '"Geist Mono", monospace' }}>
                                                    {prCelebration.quote.author} · {prCelebration.quote.sport}
                                                </span>
                                            </motion.p>
                                        )}
                                    </motion.div>
                                ) : (
                                    /* ══ 精選運動員語錄 — Swiss editorial hero ══ */
                                    <motion.div
                                        key={`quote-${restQuote?.text || 'q'}`}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0, transition: { duration: 0.2 } }}
                                        className="w-full flex flex-col items-start"
                                    >
                                        {/* Kicker + hairline */}
                                        <motion.div
                                            initial={{ opacity: 0, x: -14 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                            className="flex items-center gap-3 w-full mb-6"
                                        >
                                            <span className="uppercase shrink-0" style={{ color: '#F95C4B', fontSize: 9, letterSpacing: '0.28em', fontFamily: '"Geist Mono", monospace', fontWeight: 700 }}>
                                                — Rest · {restQuote?.sport || 'Athlete'}
                                            </span>
                                            <motion.div
                                                initial={{ scaleX: 0 }}
                                                animate={{ scaleX: 1 }}
                                                transition={{ delay: 0.2, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                                                className="flex-1 h-px"
                                                style={{ transformOrigin: 'left', background: 'rgba(22,20,21,0.18)' }}
                                            />
                                        </motion.div>
                                        {/* 大膽語錄本體 — clip reveal 上升出場 */}
                                        <div style={{ overflow: 'hidden' }}>
                                            <motion.blockquote
                                                initial={{ y: '55%', opacity: 0 }}
                                                animate={{ y: 0, opacity: 1 }}
                                                transition={{ delay: 0.16, duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
                                                style={{
                                                    fontFamily: '"Tenor Sans", "Noto Serif TC", "Noto Sans TC", serif',
                                                    fontSize: 'clamp(1.9rem, 8.4vw, 2.4rem)',
                                                    lineHeight: 1.28, fontWeight: 400, color: '#161415',
                                                    letterSpacing: '-0.015em', margin: 0,
                                                }}
                                            >
                                                {restQuote?.text}
                                            </motion.blockquote>
                                        </div>
                                        {/* Credit line */}
                                        <motion.div
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.55, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                            className="mt-6 flex items-center gap-2.5"
                                        >
                                            <span style={{ width: 22, height: 2, background: '#F95C4B', display: 'block' }} />
                                            <span className="uppercase" style={{ fontSize: 9, letterSpacing: '0.2em', color: 'rgba(22,20,21,0.6)', fontFamily: '"Geist Mono", monospace', fontWeight: 600 }}>
                                                {restQuote?.author}
                                            </span>
                                        </motion.div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* 恢復倒數 — 縮小成低調的小 pill，不再是畫面主角 */}
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.7, duration: 0.45 }}
                                className="mt-9 self-start flex items-center gap-2 px-3.5 py-2 rounded-full"
                                style={{
                                    background: 'rgba(255,255,255,0.5)',
                                    border: '1px solid rgba(255,255,255,0.75)',
                                    backdropFilter: 'blur(10px)',
                                    WebkitBackdropFilter: 'blur(10px)',
                                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8), 0 3px 10px rgba(0,0,0,0.06)',
                                }}
                            >
                                <Clock size={12} strokeWidth={2} style={{ color: 'rgba(22,20,21,0.5)' }} />
                                <span className="tabular-nums" style={{ fontSize: 15, fontWeight: 500, color: '#161415', fontFamily: '"Tenor Sans", sans-serif', lineHeight: 1 }}>
                                    {restTimeRemaining}
                                </span>
                                <span className="uppercase" style={{ fontSize: 9, letterSpacing: '0.24em', color: 'rgba(22,20,21,0.42)', fontFamily: '"Geist Mono", monospace', fontWeight: 600 }}>
                                    Rest
                                </span>
                                {/* 🩹 收斂：原本這裡有一顆「+15s · RPE」小標在解釋秒數為什麼變動。
                                    調整後的秒數已經直接顯示在左邊的倒數上，這顆只是在講原理 —— 刪。 */}
                            </motion.div>

                            {/* 🩹 收斂：原本這裡是獨立的「AI Coach 建議」卡 —— LOAD 數字、負荷分區、
                                「安全且最有效的增肌帶 · 相對強度＋RPE」錨點說明，再加一段建議文字。
                                它和下面那張「下一組建議重量」都是同一個 RPE 算出來的，等於同一件事講兩次。
                                合併進下面那張：LOAD 只留「數字 · 分區」一行，解釋文字進「?」說明卡。 */}
                            {/* 🆕 下一組建議重量 — 依上一組重量 + RPE（教練級即時處方） */}
                            {nextSetSuggestion && (
                                <motion.div
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.35, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                                    className={`w-full mt-6 ${nextSetSuggestion.accepted ? 'drvn-accept-glow' : ''}`}
                                    style={{
                                        borderRadius: 18, padding: '14px 16px',
                                        background: 'rgba(255,255,255,0.55)',
                                        // 🎯 帶入後：coral 發光呼吸邊框（drvn-accept-glow keyframes 在下方 <style> 注入）
                                        border: nextSetSuggestion.accepted ? '1px solid rgba(249,92,75,0.6)' : '1px solid rgba(255,255,255,0.8)',
                                        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                                        boxShadow: nextSetSuggestion.accepted
                                            ? '0 0 0 1px rgba(249,92,75,0.3), 0 0 18px rgba(249,92,75,0.28)'
                                            : 'inset 0 1px 0 rgba(255,255,255,0.85), 0 4px 14px rgba(0,0,0,0.06)',
                                        display: 'flex', alignItems: 'center', gap: 12,
                                    }}
                                >
                                    <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 99, background: '#F95C4B', flexShrink: 0 }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        {/* kicker ＋ 上一組的 LOAD 分區收在同一行：
                                            原本 LOAD 自己佔一整張卡，但它就是這個建議重量的依據，
                                            放在一起才看得懂「為什麼建議這個重量」。 */}
                                        <div className="flex items-center gap-2" style={{ flexWrap: 'wrap', rowGap: 4 }}>
                                            <p style={{ fontSize: 12, letterSpacing: '0.06em', color: '#F95C4B', fontWeight: 700, margin: 0 }}>
                                                下一組建議
                                            </p>
                                            {/* 名詞解釋擺在標題旁邊 —— 它是「整張卡的說明」，
                                                不是 LOAD 那個數字的註腳。 */}
                                            <motion.button {...pressProps('row')}
                                                type="button"
                                                aria-label="這些數字是什麼意思"
                                                onClick={(e) => { e.stopPropagation(); setShowTermsHelp(true); }}
                                                style={{
                                                    width: 16, height: 16, padding: 0, borderRadius: '50%', border: 'none', cursor: 'pointer',
                                                    background: 'rgba(22,20,21,0.08)', color: 'rgba(22,20,21,0.5)',
                                                    fontSize: 11, fontWeight: 800, lineHeight: 1,
                                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                                }}
                                            >?</motion.button>
                                            {lastEffortScore > 0 && (() => {
                                                const z = getLoadZone(lastEffortScore);
                                                return (
                                                    <span className="flex items-center gap-1.5" style={{ margin: 0 }}>
                                                        <span className="tabular-nums" style={{ fontSize: 11, fontWeight: 800, color: z.color, fontFamily: '"Geist Mono", monospace' }}>
                                                            LOAD {lastEffortScore}%
                                                        </span>
                                                        <span style={{ width: 3, height: 3, borderRadius: 99, background: z.color }} />
                                                        <span style={{ fontSize: 11, fontWeight: 800, color: z.color }}>{z.label}</span>
                                                        {/* 「？」搬到卡片標題列了 —— 它夾在 LOAD 94% 與「最佳區」中間，
                                                            看起來像數字的一部分，而且把那一行撐開。 */}
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                        <div className="flex items-baseline gap-1.5" style={{ margin: '4px 0 3px' }}>
                                            <span className="tabular-nums" style={{ fontSize: 26, fontWeight: 500, color: '#161415', fontFamily: '"Tenor Sans", sans-serif', lineHeight: 1 }}>
                                                {nextSetSuggestion.weight}
                                            </span>
                                            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(22,20,21,0.45)', fontFamily: '"Geist Mono", monospace' }}>KG</span>
                                        </div>
                                        <p style={{ fontSize: 11.5, color: 'rgba(22,20,21,0.62)', margin: 0, lineHeight: 1.45, fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif' }}>
                                            {nextSetSuggestion.reason}
                                        </p>
                                    </div>
                                    <motion.button {...pressProps('pill')}
 onClick={() => {
 acceptedSuggestionRef.current = { exercise: nextSetSuggestion.exercise, weight: nextSetSuggestion.weight };
 // 帶入時的震動質感（成功回饋）＋ 卡片轉為發光呼吸邊框
 triggerHaptic('success');
 if (window.navigator?.vibrate) window.navigator.vibrate([12, 40, 18]);
 setNextSetSuggestion(prev => prev ? { ...prev, accepted: true } : prev);
 }}
 disabled={nextSetSuggestion.accepted}
 style={{
 flexShrink: 0, padding: '9px 14px', borderRadius: 12, border: 'none', cursor: 'pointer',
 background: nextSetSuggestion.accepted ? 'rgba(249,92,75,0.14)' : '#161415',
 color: nextSetSuggestion.accepted ? '#F95C4B' : '#F6F4F1',
 fontFamily: '"Geist Mono", monospace', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em',
 display: 'flex', alignItems: 'center', gap: 5,
 }}
 >
                                        {nextSetSuggestion.accepted
                                            ? <><Check size={12} strokeWidth={3} /> 已帶入</>
                                            : '帶入下一組'}
                                    </motion.button>
                                </motion.div>
                            )}

                            {/* 心率過高 → 小字提醒（語錄已是主角，這裡只留必要警示） */}
                            {isHRTooHigh && (
                                <p
                                    className="self-start mt-4 leading-relaxed"
                                    style={{ color: '#F95C4B', fontSize: 11.5, fontWeight: 600, fontFamily: '"Tenor Sans", "Geist", sans-serif' }}
                                >
                                    你的心跳很快，多深呼吸幾次再開始。
                                </p>
                            )}
                        </div>

                        {/* Bottom Section: Next Exercise Preview - 僅在動作最後一組結束後顯示 */}
                        <div className="relative z-10 w-full mt-10 space-y-4">
                            {currentSet === 1 && currentExerciseIndex > 0 && (
                                <motion.div
                                    initial={{ y: 12, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    className="flex items-center justify-between px-4 py-2.5 rounded-[18px]"
                                    style={{
                                        background: 'rgba(22,20,21,0.04)',
                                        border: '1px solid rgba(22,20,21,0.08)',
                                        backdropFilter: 'blur(8px)',
                                    }}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="px-2 py-1 rounded-lg" style={{ background: 'rgba(22,20,21,0.06)', border: '1px solid rgba(22,20,21,0.10)' }}>
                                            <span className="text-[12px] font-medium tracking-[0.04em]" style={{ color: 'rgba(22,20,21,0.45)' }}>下一個</span>
                                        </div>
                                        <span className="font-medium text-[13px] tracking-tight" style={{ color: 'rgba(22,20,21,0.85)' }}>{getExerciseNameZh(currentExercise.name)}</span>
                                        <span className="text-[11px] font-bold" style={{ color: 'rgba(22,20,21,0.25)' }}>·</span>
                                        <span className="text-[11px] font-bold" style={{ color: 'rgba(22,20,21,0.35)' }}>{currentExercise.sets_target} sets</span>
                                    </div>
                                    <ArrowRight size={14} className="shrink-0" style={{ color: 'rgba(22,20,21,0.25)' }} />
                                </motion.div>
                            )}

                            <motion.button {...pressProps('pill')}
 onClick={skipRest}
 className="relative isolate w-full py-5 overflow-hidden rounded-[24px] font-medium tracking-widest text-xs flex items-center justify-center gap-3 "
 style={{
 // ✨ misty grey 上的淡玻璃鈕（深色字）
 color: '#161415',
 background: 'linear-gradient(180deg, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.35) 100%)',
 backdropFilter: 'blur(16px) saturate(150%)',
 WebkitBackdropFilter: 'blur(16px) saturate(150%)',
 border: '1px solid rgba(255,255,255,0.8)',
 boxShadow: [
 'inset 0 1px 1px rgba(255,255,255,0.9)',
 'inset 0 -1px 2px rgba(0,0,0,0.05)',
 '0 6px 16px rgba(0,0,0,0.08)',
 ].join(', '),
 }}
 >
                                {/* 頂部鏡面高光 */}
                                <span
                                    className="absolute inset-x-0 top-0 h-1/2 pointer-events-none"
                                    style={{
                                        background: 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, transparent 100%)',
                                        borderRadius: '24px 24px 50% 50%',
                                        mixBlendMode: 'screen',
                                    }}
                                />
                                <SkipForward size={16} fill="#161415" className="relative z-10" />
                                <span className="relative z-10">SKIP REST PERIOD</span>
                            </motion.button>

                            {/* 🆕 邊做邊填：休息頁上的「完成此動作」—— 按下才收掉當前動作、跳出選下一個。
                                組數由使用者決定，這顆就是「決定不再做這個動作」的出口。 */}
                            {isLiveFill && (
                                <motion.button {...pressProps('pill')}
 onClick={finishCurrentLiveExercise}
 className="w-full py-4 rounded-[24px] font-medium text-xs flex items-center justify-center gap-2.5 "
 style={{
 color: '#F6F4F1', background: '#161415', border: 'none',
 letterSpacing: '0.08em',
 boxShadow: '0 6px 18px rgba(22,20,21,0.18)',
 }}
 >
                                    <Check size={15} strokeWidth={2.6} />
                                    完成此動作 · 選下一個
                                </motion.button>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* WEIGHT INPUT MODAL — Pebble Liquid Glass */}
            <AnimatePresence>
                {showWeightInput && (
                    <div className="fixed inset-0 z-50 flex items-end justify-center"
                         style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)' }}>
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
                            className="relative isolate w-full rounded-t-[28px] p-6 space-y-5 overflow-hidden"
                            style={{
                                maxWidth: '430px',
                                // ✨ Liquid Glass (iOS 26) — 更透、更亮、帶折射
                                background: 'linear-gradient(180deg, rgba(225, 218, 208, 0.62) 0%, rgba(205, 196, 183, 0.74) 100%)',
                                backdropFilter: 'blur(40px) saturate(165%) brightness(1.04)',
                                WebkitBackdropFilter: 'blur(40px) saturate(165%) brightness(1.04)',
                                boxShadow: [
                                    'inset 0 1.5px 1px rgba(255,255,255,0.85)',
                                    'inset 0 0 0 1px rgba(255,255,255,0.45)',
                                    'inset 0 -2px 4px rgba(0,0,0,0.06)',
                                    '0 -20px 60px rgba(0,0,0,0.18)',
                                ].join(', '),
                                borderTop: '1px solid rgba(255,255,255,0.7)',
                            }}
                        >
                            {/* ✨ 頂部鏡面高光弧 */}
                            <div
                                className="absolute inset-x-0 top-0 h-24 pointer-events-none z-0"
                                style={{
                                    background: 'linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.06) 60%, transparent 100%)',
                                    borderRadius: '28px 32px 50% 50%',
                                    mixBlendMode: 'soft-light',
                                }}
                            />
                            {/* Drag handle */}
                            <div className="w-10 h-1 rounded-full mx-auto relative z-10"
                                 style={{ background: 'rgba(22,20,21,0.15)' }} />

                            {/* Header */}
                            <div className="relative z-10 text-center">
                                <motion.button {...pressProps('icon')}
 onClick={() => setShowWeightInput(false)}
 aria-label="Close"
 className="absolute -top-1 -left-1 w-9 h-9 rounded-full flex items-center justify-center"
 style={{
 background: 'rgba(255,255,255,0.4)',
 border: '1px solid rgba(255,255,255,0.6)',
 color: '#161415',
 boxShadow: '0 2px 8px rgba(0,0,0,0.05), inset 0 1px 1px rgba(255,255,255,0.8)',
 }}
 >
                                    <X size={16} strokeWidth={1.8} />
                                </motion.button>
                                <h3 style={{ fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif', fontWeight: 400, fontSize: 26, color: '#161415', letterSpacing: '-0.01em', lineHeight: 1 }}>
                                    第 {currentSet} 組
                                </h3>
                                <p className="mt-1.5 uppercase" style={{ color: 'rgba(22,20,21,0.6)', fontSize: 9, letterSpacing: '0.22em', fontFamily: '"Geist Mono", monospace', fontWeight: 500 }}>
                                    {getExerciseNameZh(currentExercise.name)}
                                </p>
                            </div>

                            <div className="relative z-10 flex flex-col gap-4">
                                <div className="flex items-start gap-3">
                                    {/* ── Weight Stepper ──────────────────────── */}
                                    <div className="flex-1 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label style={{ color: 'rgba(22, 20, 21, 0.6)', fontSize: 11, letterSpacing: '0.06em', fontWeight: 500 }}>
                                                重量 kg
                                            </label>
                                            {/* 「肌肥大 79% 1RM」拿掉了 —— 正在記這一組的人要填的是重量與次數，
                                                訓練分區是事後看報告才有用的資訊，擺在輸入框旁邊只是雜訊；
                                                而且 1RM 是推估值，放在這裡像是在宣稱它很準。 */}
                                        </div>
                                        <div className="flex items-center justify-between rounded-[18px] p-1.5"
                                             style={{ background: 'rgba(255, 255, 255, 0.3)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255, 255, 255, 0.5)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)' }}>
                                            <motion.button {...pressProps('icon')}
 onClick={() => setInputWeight(prev => Math.max(0, (parseFloat(prev) || 0) - 2.5).toString())}
 className="w-11 h-11 flex items-center justify-center rounded-xl touch-manipulation"
 style={{ background: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.6)', color: '#161415', boxShadow: '0 2px 8px rgba(0,0,0,0.05), inset 0 1px 1px rgba(255,255,255,0.8)' }}
 >
                                                <Minus size={18} strokeWidth={1.8} />
                                            </motion.button>
                                            <div className="relative flex-1 text-center">
                                                <input
                                                    type="number" inputMode="decimal" min="0" max="500" step="0.5"
                                                    value={inputWeight} onChange={(e) => setInputWeight(e.target.value)}
                                                    className="w-full bg-transparent text-center focus:outline-none tabular-nums"
                                                    style={{ color: '#161415', fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif', fontWeight: 400, fontSize: 26, letterSpacing: '-0.01em' }}
                                                    placeholder="0"
                                                />
                                            </div>
                                            <motion.button {...pressProps('icon')}
 onClick={() => setInputWeight(prev => ((parseFloat(prev) || 0) + 2.5).toString())}
 className="w-11 h-11 flex items-center justify-center rounded-xl touch-manipulation"
 style={{ background: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.6)', color: '#161415', boxShadow: '0 2px 8px rgba(0,0,0,0.05), inset 0 1px 1px rgba(255,255,255,0.8)' }}
 >
                                                <Plus size={18} strokeWidth={1.8} />
                                            </motion.button>
                                        </div>
                                        {/* Quick Plates — 快速加重鈕：所有動作都顯示（啞鈴/機械也常用 10/20 快速累加）；
                                            只有「槓片計算」展開區維持槓鈴類動作限定 */}
                                        <div className="flex gap-2 mt-2 justify-center items-center">
                                            {[
                                                { kg: 10, bg: 'radial-gradient(circle at 35% 30%, #FF7060 0%, #F95C4B 55%, #C9352A 100%)', txt: '#FFFFFF', tint: 'rgba(249,92,75,0.28)' },
                                                { kg: 20, bg: 'radial-gradient(circle at 35% 30%, #D8CFC0 0%, #B8AFA0 55%, #968B7B 100%)', txt: '#161415', tint: 'rgba(184,175,160,0.28)' },
                                                { kg: 45, bg: 'radial-gradient(circle at 35% 30%, #3A3638 0%, #1A181A 55%, #0E0D0F 100%)', txt: '#F6F4F1', tint: 'rgba(58,54,56,0.30)' },
                                            ].map(({ kg, bg, txt, tint }) => (
                                                <motion.button {...pressProps('icon')}
 key={kg} onClick={() => { setInputWeight(prev => ((parseFloat(prev) || 0) + kg).toString()); triggerHaptic('light'); }}
 className=" touch-manipulation flex flex-col items-center justify-center rounded-full select-none"
 style={{
 width: 38, height: 38, background: bg,
 boxShadow: ['inset 0 1px 0 rgba(255,255,255,0.18)', 'inset 0 -2px 4px rgba(0,0,0,0.22)', `0 2px 6px ${tint}`].join(', '),
 WebkitTapHighlightColor: 'transparent',
 }}
 >
                                                    <span style={{ color: txt, fontSize: 11, fontWeight: 500, fontFamily: '"Geist Mono", monospace', lineHeight: 1 }}>{kg}</span>
                                                    <span style={{ color: txt, fontSize: 11, fontWeight: 500, lineHeight: 1, marginTop: 2, opacity: 0.55, fontFamily: '"Geist Mono", monospace' }}>kg</span>
                                                </motion.button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* ── Reps Stepper ───────────────────────── */}
                                    <div className="flex-1 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label style={{ color: 'rgba(22, 20, 21, 0.6)', fontSize: 11, letterSpacing: '0.06em', fontWeight: 500 }}>
                                                次數
                                            </label>
                                            {currentExercise.reps && (
                                                <span style={{ color: 'rgba(22, 20, 21, 0.6)', fontSize: 11, letterSpacing: '0.06em', fontWeight: 500 }}>
                                                    目標 {currentExercise.reps} 次
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between rounded-[18px] p-1.5"
                                             style={{ background: 'rgba(255, 255, 255, 0.3)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255, 255, 255, 0.5)', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)' }}>
                                            <motion.button {...pressProps('icon')}
 onClick={() => setInputReps(prev => Math.max(0, (parseInt(prev) || 0) - 1).toString())}
 className="w-11 h-11 flex items-center justify-center rounded-xl touch-manipulation"
 style={{ background: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.6)', color: '#161415', boxShadow: '0 2px 8px rgba(0,0,0,0.05), inset 0 1px 1px rgba(255,255,255,0.8)' }}
 >
                                                <Minus size={18} strokeWidth={1.8} />
                                            </motion.button>
                                            <div className="relative flex-1 text-center">
                                                <input
                                                    type="number" inputMode="numeric" min="0" max="200" step="1"
                                                    value={inputReps} onChange={(e) => setInputReps(e.target.value)}
                                                    className="w-full bg-transparent text-center focus:outline-none tabular-nums"
                                                    style={{ color: '#161415', fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif', fontWeight: 400, fontSize: 26, letterSpacing: '-0.01em' }}
                                                    placeholder="0"
                                                />
                                            </div>
                                            <motion.button {...pressProps('icon')}
 onClick={() => setInputReps(prev => ((parseInt(prev) || 0) + 1).toString())}
 className="w-11 h-11 flex items-center justify-center rounded-xl touch-manipulation"
 style={{ background: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.6)', color: '#161415', boxShadow: '0 2px 8px rgba(0,0,0,0.05), inset 0 1px 1px rgba(255,255,255,0.8)' }}
 >
                                                <Plus size={18} strokeWidth={1.8} />
                                            </motion.button>
                                        </div>
                                    </div>
                                </div>

                                {/* 🆕 ── 配重計算機（只有槓鈴 / 史密斯類動作顯示） ── */}
                                {isBarbellExercise && (
                                <div>
                                    <motion.button {...pressProps('row')}
 onClick={() => { setShowPlateCalc(v => !v); triggerHaptic('light'); }}
 className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl touch-manipulation"
 style={{ background: 'rgba(255,255,255,0.28)', border: '1px solid rgba(255,255,255,0.45)' }}
 >
                                        <span className="flex items-center gap-2 uppercase" style={{ color: 'rgba(22,20,21,0.7)', fontSize: 9, letterSpacing: '0.2em', fontFamily: '"Geist Mono", monospace', fontWeight: 500 }}>
                                            <Dumbbell size={13} strokeWidth={1.8} /> 槓片計算
                                        </span>
                                        <ChevronDown size={15} strokeWidth={2}
                                            style={{ color: 'rgba(22,20,21,0.5)', transform: showPlateCalc ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                    </motion.button>

                                    <AnimatePresence>
                                        {showPlateCalc && (() => {
                                            const res = calcPlates(parseFloat(inputWeight) || 0, barWeight);
                                            return (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="mt-2 px-4 py-3 rounded-xl space-y-3"
                                                         style={{ background: 'rgba(255,255,255,0.22)', border: '1px solid rgba(255,255,255,0.4)' }}>
                                                        {/* 空槓切換 */}
                                                        <div className="flex items-center gap-1.5">
                                                            <span className=" mr-1" style={{ color: 'rgba(22,20,21,0.55)', fontSize: 12, letterSpacing: '0.16em', fontFamily: '"Geist Mono", monospace' }}>槓</span>
                                                            {BAR_OPTIONS.map(opt => (
                                                                <motion.button {...pressProps('row')}
 key={opt.kg}
 onClick={() => { setBarWeight(opt.kg); try { localStorage.setItem('drvn_bar_weight', String(opt.kg)); } catch {} triggerHaptic('light'); }}
 className="px-2.5 py-1 rounded-lg touch-manipulation"
 style={{
 fontSize: 11, fontFamily: '"Geist Mono", monospace', fontWeight: 500,
 background: barWeight === opt.kg ? '#161415' : 'rgba(255,255,255,0.4)',
 color: barWeight === opt.kg ? '#F6F4F1' : '#161415',
 border: '1px solid ' + (barWeight === opt.kg ? '#161415' : 'rgba(255,255,255,0.6)'),
 }}
 >
                                                                    {opt.kg}
                                                                </motion.button>
                                                            ))}
                                                        </div>

                                                        {/* 每邊配重視覺 */}
                                                        {res.perSide.length > 0 ? (
                                                            <div className="flex flex-wrap items-center gap-1.5">
                                                                <span className=" mr-0.5" style={{ color: 'rgba(22,20,21,0.55)', fontSize: 12, letterSpacing: '0.16em', fontFamily: '"Geist Mono", monospace' }}>每邊</span>
                                                                {res.perSide.flatMap(({ plate, count }) =>
                                                                    Array.from({ length: count }).map((_, i) => (
                                                                        <span key={`${plate}-${i}`}
                                                                            className="inline-flex items-center justify-center rounded-md tabular-nums"
                                                                            style={{
                                                                                minWidth: 34, height: 26, padding: '0 6px',
                                                                                fontSize: 11, fontWeight: 600, fontFamily: '"Geist Mono", monospace',
                                                                                background: 'rgba(22,20,21,0.06)', color: '#161415',
                                                                                border: '1px solid rgba(22,20,21,0.12)',
                                                                            }}>
                                                                            {plate}
                                                                        </span>
                                                                    ))
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <p style={{ fontSize: 11, color: 'rgba(22,20,21,0.5)', fontFamily: '"Geist Mono", monospace' }}>
                                                                {res.reason || '不需要加片（空槓）'}
                                                            </p>
                                                        )}

                                                        {/* 達成總重 / 差額提示 */}
                                                        <div className="flex items-center justify-between pt-0.5">
                                                            <span style={{ fontSize: 11, color: 'rgba(22,20,21,0.5)', fontFamily: '"Geist Mono", monospace' }}>
                                                                槓 {barWeight} + 每邊 {res.perSideWeight} ×2
                                                            </span>
                                                            <span style={{
                                                                fontSize: 11, fontWeight: 600, fontFamily: '"Geist Mono", monospace',
                                                                color: res.ok ? '#161415' : '#F95C4B',
                                                            }}>
                                                                = {res.achievedTotal}kg{res.ok ? '' : ` (差${Math.abs(res.diff)})`}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            );
                                        })()}
                                    </AnimatePresence>
                                </div>
                                )}

                                {/* Estimated Volume row */}
                                <div
                                    className="relative z-10 flex justify-between items-center px-4 py-3 rounded-xl mt-1"
                                    style={{
                                        background: 'rgba(246,244,241,0.03)',
                                        border: '1px solid rgba(246,244,241,0.05)',
                                    }}
                                >
                                    <span
                                        className="uppercase"
                                        style={{
                                            color: 'rgba(22, 20, 21, 0.55)',
                                            fontSize: 9,
                                            letterSpacing: '0.22em',
                                            fontFamily: '"Geist Mono", monospace',
                                            fontWeight: 500,
                                        }}
                                    >
                                        這一組訓練量
                                    </span>
                                    <div className="flex items-baseline gap-1">
                                        <span
                                            className="tabular-nums"
                                            style={{
                                                color: '#161415',
                                                fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif',
                                                fontWeight: 400,
                                                fontSize: 20,
                                                letterSpacing: '-0.01em',
                                            }}
                                        >
                                            {((parseFloat(inputWeight) || 0) * (parseFloat(inputReps) || 0)).toLocaleString()}
                                        </span>
                                        <span
                                            className="uppercase"
                                            style={{
                                                color: 'rgba(22, 20, 21, 0.55)',
                                                fontSize: 9,
                                                letterSpacing: '0.22em',
                                                fontFamily: '"Geist Mono", monospace',
                                                fontWeight: 500,
                                            }}
                                        >
                                            kg
                                        </span>
                                    </div>
                                </div>

                            {/* RPE Selector */}
                            <div className="relative z-10 space-y-3 pt-1">
                                <div className="flex justify-between items-end">
                                    <label
                                        className="uppercase"
                                        style={{
                                            color: 'rgba(22, 20, 21, 0.55)',
                                            fontSize: 9,
                                            letterSpacing: '0.22em',
                                            fontFamily: '"Geist Mono", monospace',
                                            fontWeight: 500,
                                        }}
                                    >
                                        強度 RPE
                                    </label>
                                    <span
                                        className="uppercase tabular-nums"
                                        style={{
                                            color: inputRPE === 10 ? '#F95C4B' : '#161415',
                                            fontSize: 12,
                                            letterSpacing: '0.18em',
                                            fontFamily: '"Geist Mono", monospace',
                                            fontWeight: 500,
                                        }}
                                    >
                                        {inputRPE === 10 ? '力竭' : `RPE ${inputRPE}`}
                                    </span>
                                </div>

                                <div className="flex gap-2">
                                    {[7, 8, 9, 10].map((val) => {
                                        const isActive = inputRPE === val;
                                        const isPeak = val === 10;
                                        return (
                                            <motion.button {...pressProps('pill')}
 key={val}
 onClick={() => {
 setInputRPE(val);
 triggerHaptic('light');
 }}
 className="flex-1 py-2.5 rounded-xl uppercase"
 style={{
 fontSize: 9,
 letterSpacing: '0.18em',
 fontFamily: '"Geist Mono", monospace',
 fontWeight: 500,
 background: isActive
 ? (isPeak ? 'rgba(249,92,75,0.14)' : '#F6F4F1')
 : 'rgba(246,244,241,0.04)',
 border: `1px solid ${isActive
 ? (isPeak ? 'rgba(249,92,75,0.30)' : 'rgba(246,244,241,0.20)')
 : 'rgba(246,244,241,0.08)'}`,
 color: isActive
 ? (isPeak ? '#F95C4B' : '#161415')
 : 'rgba(22, 20, 21, 0.55)',
 boxShadow: isActive
 ? (isPeak ? 'inset 0 1px 0 rgba(255,200,190,0.2)' : 'inset 0 1px 0 rgba(255,255,255,0.5)')
 : 'inset 0 1px 0 rgba(255,255,255,0.03)',
 }}
 >
                                                {isPeak ? '力竭' : val}
                                            </motion.button>
                                        );
                                    })}
                                </div>

                                <input
                                    type="range" min="5" max="10" step="0.5"
                                    value={inputRPE}
                                    onChange={(e) => setInputRPE(parseFloat(e.target.value))}
                                    className="w-full h-1 rounded-full appearance-none"
                                    style={{
                                        background: `linear-gradient(to right, #F95C4B 0%, #C9A876 ${((inputRPE - 5) / 5) * 100}%, rgba(246,244,241,0.08) ${((inputRPE - 5) / 5) * 100}%, rgba(246,244,241,0.08) 100%)`,
                                    }}
                                />
                                <div
                                    className="flex justify-between uppercase px-1"
                                    style={{
                                        color: 'rgba(22, 20, 21, 0.45)',
                                        fontSize: 9,
                                        letterSpacing: '0.22em',
                                        fontFamily: '"Geist Mono", monospace',
                                        fontWeight: 500,
                                    }}
                                >
                                    <span>輕鬆</span>
                                    <span>中等</span>
                                    <span>力竭</span>
                                </div>
                            </div>

                            {/* 儲存這一組 —— 與「動作設定」的儲存同一顆材質（全站唯一那顆珊瑚）。
                                原本是深珊瑚實心：這張面板本身就是淺色玻璃，一顆飽和深色壓在最底下
                                像是警告而不是「記一筆」。顏色定義在 styles/liquid-glass.css。 */}
                            <motion.button {...pressProps('row')}
 onClick={saveSetData}
 className="lg-btn lg-btn--coral lg-btn--interactive w-full py-4 rounded-[18px]"
 style={{ fontSize: 15, letterSpacing: '0.08em', fontWeight: 600 }}
 >
                                儲存這一組
                            </motion.button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* LAST SESSION MODAL */}
            <AnimatePresence>
                {showLastSessionRecord && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/60 backdrop-blur-sm"
                        onClick={() => setShowLastSessionRecord(false)}
                    >
                        <motion.div
                            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="lg-glass lg-glass--frost w-full rounded-t-[36px] p-6 pb-12 shadow-2xl"
                            onClick={e => e.stopPropagation()}
                            style={{ maxWidth: '430px', margin: '0 auto', borderRadius: '36px 36px 0 0' }}
                        >
                            <div className="flex justify-between items-center mb-4">
                                <div>
                                    <h3 className="text-[20px] font-medium text-[#161415]" style={{ fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif' }}>{getExerciseNameZh(currentExercise.name)}</h3>
                                    <p className="text-[12px] font-medium tracking-[0.04em] text-black/40 mt-1" style={{ fontFamily: '"Geist Mono", monospace' }}>動作設定 · Exercise Panel</p>
                                </div>
                                <motion.button {...pressProps('pill')} onClick={() => setShowLastSessionRecord(false)} className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center">
                                    <X size={16} className="text-black/50" />
                                </motion.button>
                            </div>

                            {(() => {
                                const hasRecord = lastSessionStats[currentExercise.name] && lastSessionStats[currentExercise.name].weight > 0;
                                const prW = exercisePRs[currentExercise.name] || 0;
                                const draft = exerciseDraft || { sets: currentExercise.sets_target || 3, reps: String(currentExercise.reps ?? '10'), rest: String(currentExercise.rest ?? '90s') };
                                const applyDraft = () => {
                                    setExercisesWithSets(prev => prev.map((ex, i) => i === currentExerciseIndex
                                        ? { ...ex, sets_target: Math.max(1, parseInt(draft.sets) || 1), reps: String(draft.reps), rest: String(draft.rest) }
                                        : ex));
                                    triggerHaptic('success');
                                    setShowLastSessionRecord(false);
                                };
                                const stepBtn = { width: 38, height: 38, borderRadius: 12, background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.65)', color: '#161415', fontSize: 18, cursor: 'pointer' };
                                const fieldBox = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 16, padding: 5, background: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.55)' };
                                return (
                                    <>
                                        {/* 🩹 這一區原本只有「上次紀錄 · 尚無紀錄」——
                                            正在做這個動作的時候，最該看到的是「這次已經做了什麼」。
                                            改成：本次已完成的每一組在最上面，上次紀錄與 PR 降階成一行。 */}
                                        {(() => {
                                            const doneSets = (currentExercise.sets || []).filter(s => s && (s.completed || s.weight != null || s.reps != null));
                                            const target = currentExercise.sets_target || 3;
                                            return (
                                                <div className="rounded-[16px] mb-4 px-4 py-3" style={{ background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.6)' }}>
                                                    <div className="flex items-center justify-between">
                                                        <span style={{ fontSize: 12, letterSpacing: '0.16em', color: 'rgba(22,20,21,0.5)', fontFamily: '"Geist Mono", monospace' }}>本次進度</span>
                                                        <span className="tabular-nums" style={{ fontSize: 15, fontWeight: 600, color: '#161415', fontFamily: '"Tenor Sans", sans-serif' }}>
                                                            已完成 {doneSets.length} / {target} 組
                                                        </span>
                                                    </div>

                                                    {/* 🩹 原本這裡是純文字：看得到卻改不了，想補剛剛少打的重量
                                                        還得退出面板重來。改用跟課表清單同一顆可點的 chip —— 點一下
                                                        就能直接打字或 +/− 改這一組的重量與次數。 */}
                                                    <LoggedSetChips
                                                        ex={currentExercise}
                                                        globalIdx={currentExerciseIndex}
                                                        dark={false}
                                                        onUpdateLoggedSets={(absIdx, newSets) => {
                                                            setExercisesWithSets(prev => prev.map((e, idx) => idx === absIdx ? { ...e, sets: newSets } : e));
                                                        }}
                                                    />
                                                    {doneSets.length > 0 && (
                                                        <p style={{ fontSize: 11, color: 'rgba(22,20,21,0.42)', margin: '6px 0 0', fontFamily: '"Geist Mono", monospace' }}>
                                                            點一下組數可改重量與次數
                                                        </p>
                                                    )}

                                                    <div className="flex items-center justify-between" style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(22,20,21,0.08)' }}>
                                                        <span className="flex items-center gap-2" style={{ fontSize: 12, letterSpacing: '0.1em', color: 'rgba(22,20,21,0.45)', fontFamily: '"Geist Mono", monospace' }}>
                                                            <Clock size={12} strokeWidth={2.2} /> 上次
                                                        </span>
                                                        <span className="tabular-nums" style={{ fontSize: 13, color: 'rgba(22,20,21,0.62)', fontFamily: '"Tenor Sans", sans-serif' }}>
                                                            {hasRecord ? `${lastSessionStats[currentExercise.name].weight}kg × ${lastSessionStats[currentExercise.name].reps || '--'}` : '尚無紀錄'}
                                                            {prW > 0 && (
                                                                <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 800, color: '#F95C4B', background: 'rgba(249,92,75,0.10)', border: '1px solid rgba(249,92,75,0.25)', borderRadius: 999, padding: '2px 8px', fontFamily: '"Geist Mono", monospace' }}>
                                                                    PR {prW}kg
                                                                </span>
                                                            )}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* 組數 stepper */}
                                        <label style={{ display: 'block', fontSize: 12, letterSpacing: '0.22em', color: 'rgba(22,20,21,0.55)', fontFamily: '"Geist Mono", monospace', marginBottom: 6 }}>組數 SETS</label>
                                        <div style={{ ...fieldBox, marginBottom: 12 }}>
                                            <motion.button {...pressProps('row')} style={stepBtn} onClick={() => setExerciseDraft(p => ({ ...(p || draft), sets: Math.max(1, (parseInt((p || draft).sets) || 1) - 1) }))}>−</motion.button>
                                            <span className="tabular-nums" style={{ fontFamily: '"Tenor Sans", sans-serif', fontSize: 22, color: '#161415' }}>{draft.sets}</span>
                                            <motion.button {...pressProps('row')} style={stepBtn} onClick={() => setExerciseDraft(p => ({ ...(p || draft), sets: (parseInt((p || draft).sets) || 0) + 1 }))}>+</motion.button>
                                        </div>

                                        {/* 次數 + 休息 */}
                                        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                                            <div style={{ flex: 1 }}>
                                                <label style={{ display: 'block', fontSize: 12, letterSpacing: '0.22em', color: 'rgba(22,20,21,0.55)', fontFamily: '"Geist Mono", monospace', marginBottom: 6 }}>次數 REPS</label>
                                                <input value={draft.reps} onChange={e => setExerciseDraft(p => ({ ...(p || draft), reps: e.target.value }))}
                                                    style={{ width: '100%', boxSizing: 'border-box', height: 46, borderRadius: 12, padding: '0 14px', background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.6)', color: '#161415', fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif', fontSize: 17, outline: 'none' }} />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <label style={{ display: 'block', fontSize: 12, letterSpacing: '0.22em', color: 'rgba(22,20,21,0.55)', fontFamily: '"Geist Mono", monospace', marginBottom: 6 }}>休息 REST</label>
                                                <input value={draft.rest} onChange={e => setExerciseDraft(p => ({ ...(p || draft), rest: e.target.value }))} placeholder="90s / 2min"
                                                    style={{ width: '100%', boxSizing: 'border-box', height: 46, borderRadius: 12, padding: '0 14px', background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.6)', color: '#161415', fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif', fontSize: 17, outline: 'none' }} />
                                            </div>
                                        </div>

                                        {/* 🩹 移除「＋ 加入動作」：這個面板的工作是「設定這個動作」，
                                            插入別的動作屬於今日菜單，放在這裡只是多一個要判斷的選項。
                                            底部只留「跳過此動作」與「儲存」。 */}
                                        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                                            <motion.button {...pressProps('row')}
 onClick={() => { setShowLastSessionRecord(false); setShowSkipConfirm(true); }}
 style={{ flex: 1, height: 48, borderRadius: 14, color: '#fff', background: '#161415', border: 'none', fontFamily: '"Geist Mono", monospace', fontSize: 12.5, letterSpacing: '0.08em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}
 >
                                                <SkipForward size={15} fill="currentColor" /> 跳過此動作
                                            </motion.button>
                                        </div>

                                        {/* 儲存＝這個面板唯一要人按的動作，用全站同一顆珊瑚液態玻璃。
                                            原本是 11.jpeg 的拉絲鈦金屬：那是一張灰色照片，
                                            在同樣灰白的玻璃面板裡完全沒有「這是主要動作」的訊號。 */}
                                        <motion.button {...pressProps('row')}
 onClick={applyDraft}
 className="lg-btn lg-btn--coral lg-btn--interactive w-full py-4 rounded-[18px] font-medium text-lg"
 style={{ letterSpacing: '0.04em' }}
 >
                                            儲存
                                        </motion.button>
                                    </>
                                );
                            })()}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ─── 長按結束今日訓練：Liquid Glass 確認視窗（含當日進度紀錄） ─── */}
            <AnimatePresence>
                {showEndConfirm && (() => {
                    const totalSetsAll = exercisesWithSets.reduce((s, ex) => s + (ex.sets?.length || ex.sets_target || 3), 0);
                    const doneSets = completedSets.length;
                    const doneExercises = exercisesWithSets.filter(ex => (ex.sets || []).some(s => s.completed)).length;
                    let liveVolume = 0;
                    exercisesWithSets.forEach(ex => (ex.sets || []).forEach(s => {
                        if (s.completed && s.weight && s.reps) liveVolume += parseFloat(s.weight) * parseInt(s.reps);
                    }));
                    const pct = totalSetsAll > 0 ? Math.round((doneSets / totalSetsAll) * 100) : 0;
                    const perExercise = exercisesWithSets
                        .map(ex => ({
                            name: ex.name,
                            done: (ex.sets || []).filter(s => s.completed).length,
                            total: ex.sets?.length || ex.sets_target || 3,
                            sets: (ex.sets || []).filter(s => s.completed).map(s => ({ weight: s.weight, reps: s.reps })),
                        }))
                        .filter(e => e.done > 0);
                    const doneExCount = perExercise.length;

                    return (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[70] flex items-center justify-center p-6"
                        style={{ background: 'rgba(20,20,20,0.45)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
                        onClick={() => { setShowEndConfirm(false); setIsPaused(false); }}
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 24, opacity: 0 }}
                            animate={{ scale: 1, y: 0, opacity: 1 }}
                            exit={{ scale: 0.92, y: 16, opacity: 0 }}
                            transition={{ type: 'spring', damping: 24, stiffness: 320 }}
                            className="lg-glass lg-glass--frost w-full no-scrollbar"
                            style={{ maxWidth: 380, borderRadius: 28, padding: '26px 22px 22px', maxHeight: '88dvh', overflowY: 'auto' }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex flex-col items-center text-center" style={{ marginBottom: 18 }}>
                                <h2 style={{ margin: 0, fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif', fontSize: 23, color: '#161415' }}>結束今日訓練？</h2>
                                <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'rgba(22,20,21,0.55)', lineHeight: 1.5 }}>
                                    確認後將直接結算，並前往今日結果頁面。
                                </p>
                            </div>

                            {/* 當日進度紀錄 */}
                            <div className="lg-glass" style={{ borderRadius: 18, padding: '16px 16px 14px', marginBottom: 16 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                                    <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.2em', color: 'rgba(22,20,21,0.45)' }}>今日進度</span>
                                    <span style={{ fontSize: 13, fontWeight: 800, color: '#D94030' }}>{pct}%</span>
                                </div>
                                {/* 進度條 */}
                                <div style={{ height: 8, borderRadius: 99, background: 'rgba(22,20,21,0.08)', overflow: 'hidden', marginBottom: 16 }}>
                                    <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.5, ease: 'easeOut' }}
                                        style={{ height: '100%', borderRadius: 99, background: 'linear-gradient(90deg, #FF7A6B, #D94030)' }} />
                                </div>
                                {/* 數據格 */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: perExercise.length ? 14 : 0 }}>
                                    {[
                                        { v: `${doneSets}/${totalSetsAll}`, l: '組數 SETS' },
                                        { v: `${Math.round(liveVolume).toLocaleString()}`, l: '訓練量 KG' },
                                        { v: formatTime(displayDuration), l: '時長 TIME' },
                                    ].map((m, i) => (
                                        <div key={i} className="lg-glass lg-glass--frost" style={{ borderRadius: 12, padding: '10px 6px', textAlign: 'center' }}>
                                            <div style={{ fontSize: 17, fontWeight: 900, color: '#161415', fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif', lineHeight: 1 }}>{m.v}</div>
                                            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', color: 'rgba(22,20,21,0.45)', marginTop: 5 }}>{m.l}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* 已完成動作 — 可收合/展開 */}
                            {perExercise.length > 0 && (
                                <div className="lg-glass" style={{ borderRadius: 18, padding: '4px 4px', marginBottom: 16, overflow: 'hidden' }}>
                                    {/* 收合列：點擊切換 */}
                                    <motion.button {...pressProps('cta')}
 onClick={() => { triggerHaptic('tap'); setEndConfirmExpanded(v => !v); }}
 className="w-full"
 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px', background: 'transparent', border: 'none', cursor: 'pointer' }}
 >
                                        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.2em', color: 'rgba(22,20,21,0.55)' }}>
                                            已完成動作
                                        </span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(22,20,21,0.45)', fontFamily: '"Geist Mono", monospace' }}>
                                                {doneExCount} 動作 · {doneSets} 組
                                            </span>
                                            <motion.span animate={{ rotate: endConfirmExpanded ? 180 : 0 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }} style={{ display: 'inline-flex' }}>
                                                <ChevronDown size={16} color="rgba(22,20,21,0.5)" strokeWidth={2.4} />
                                            </motion.span>
                                        </span>
                                    </motion.button>
                                    {/* 展開內容 */}
                                    <AnimatePresence initial={false}>
                                        {endConfirmExpanded && (
                                            <motion.div
                                                key="expanded"
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ height: { duration: 0.3, ease: [0.16, 1, 0.3, 1] }, opacity: { duration: 0.2 } }}
                                                style={{ overflow: 'hidden' }}
                                            >
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '2px 8px 10px', maxHeight: 200, overflowY: 'auto' }} className="no-scrollbar">
                                                    {perExercise.map((e, i) => (
                                                        <motion.div
                                                            key={i}
                                                            initial={{ opacity: 0, x: -8 }}
                                                            animate={{ opacity: 1, x: 0 }}
                                                            transition={{ delay: 0.04 + i * 0.04, duration: 0.25 }}
                                                            style={{ padding: '8px 8px', borderRadius: 12, background: 'rgba(255,255,255,0.35)' }}
                                                        >
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                                                <span style={{ fontSize: 12.5, color: 'rgba(22,20,21,0.85)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getExerciseNameZh(e.name)}</span>
                                                                <span style={{ fontSize: 11, fontWeight: 800, color: e.done >= e.total ? '#2E9E5B' : 'rgba(22,20,21,0.45)', fontFamily: '"Geist Mono", monospace', flexShrink: 0 }}>{e.done}/{e.total}</span>
                                                            </div>
                                                            {/* 每組 重量×次數 */}
                                                            {e.sets.length > 0 && (
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                                                                    {e.sets.map((s, j) => (
                                                                        <span key={j} style={{ fontSize: 11, fontWeight: 700, color: 'rgba(22,20,21,0.6)', fontFamily: '"Geist Mono", monospace', padding: '2px 7px', borderRadius: 7, background: 'rgba(22,20,21,0.06)' }}>
                                                                            {s.weight ? `${s.weight}kg` : '—'} × {s.reps || '—'}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </motion.div>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}

                            {/* 動作鍵 */}
                            <motion.button {...pressProps('cta')}
 onClick={() => { triggerHaptic('heavy'); setShowEndConfirm(false); setShowSummaryReview(true); }}
 className="lg-btn lg-btn--interactive w-full"
 style={{
 background: 'linear-gradient(135deg, rgba(249,92,75,0.55) 0%, rgba(217,64,48,0.65) 100%)',
 backdropFilter: 'blur(24px) saturate(140%)',
 WebkitBackdropFilter: 'blur(24px) saturate(140%)',
 color: '#fff',
 border: '1px solid rgba(255,255,255,0.3)',
 boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), 0 8px 24px rgba(249,92,75,0.15)',
 padding: '15px 0',
 borderRadius: 18,
 display: 'flex',
 alignItems: 'center',
 justifyContent: 'center',
 gap: 8,
 fontSize: 16.5,
 fontWeight: 700
 }}
 >
                                確認結束並查看結果
                            </motion.button>
                            <motion.button {...pressProps('cta')}
 onClick={() => { triggerHaptic('tap'); setShowEndConfirm(false); setIsPaused(false); }}
 className="lg-btn lg-btn--frost lg-btn--interactive w-full"
 style={{ padding: '13px 0', borderRadius: 18, marginTop: 10, fontWeight: 600, fontSize: 14, color: '#161415' }}
 >
                                繼續訓練
                            </motion.button>
                        </motion.div>
                    </motion.div>
                    );
                })()}
            </AnimatePresence>

            {/* PAUSE MENU */}
            <AnimatePresence>
                {showPauseMenu && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-6"
                    >
                        <div className="w-full max-w-sm space-y-4 bg-[#F6F4F1]/95 backdrop-blur-xl rounded-[28px] p-8 shadow-2xl border border-white/50">
                            <h2 className="text-2xl font-bold text-[#161415] text-center mb-6">暫停</h2>
                            <motion.button {...pressProps('cta')}
 onClick={handleResume}
 className="lg-btn lg-btn--flat lg-btn--coral lg-btn--interactive w-full py-4 rounded-[18px] font-bold flex items-center justify-center gap-2"
 style={{ letterSpacing: '0.08em' }}
 >
                                <Play size={20} fill="currentColor" /> 繼續
                            </motion.button>
                            {/* 「AI 分析」→「動作分析」：使用者要的是「看我動作對不對」，
                                AI 是實作方式，不是功能名稱。 */}
                            <motion.button {...pressProps('cta')} onClick={handleUseAnalysis} className="lg-btn lg-btn--flat lg-btn--dark lg-btn--interactive w-full py-4 rounded-[18px] font-bold flex items-center justify-center gap-2" style={{ letterSpacing: '0.08em' }}>
                                <Upload size={20} /> 動作分析
                            </motion.button>
                            <motion.button {...pressProps('cta')}
 onClick={() => { triggerHaptic('heavy'); safeExit(); }}
 className="lg-btn lg-btn--flat lg-btn--frost lg-btn--interactive w-full py-4 rounded-[18px] font-bold flex items-center justify-center gap-2"
 style={{ letterSpacing: '0.08em' }}
 >
                                <X size={20} /> 結束訓練
                            </motion.button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* MICRO-WIN — 瑞士極簡，落在頂欄下方、動作圖片上方，旋轉跳出。
                🩹 補上 !planEcho：原本只有教練提醒排隊讓位，Micro-Win 沒有，
                   兩張同時出現時會疊在同一個版位。三張一律排隊：
                   Plan Echo > Micro-Win > 教練提醒。 */}
            <SessionHintLayer>
            <AnimatePresence>
                {!planEcho && overloadSuggestion && (
                    <motion.div
                        initial={{ y: -16, opacity: 0, rotate: -3, scale: 0.95 }}
                        animate={{ y: 0, opacity: 1, rotate: 0, scale: 1 }}
                        exit={{ x: -160, opacity: 0, transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] } }}
                        transition={{ type: 'spring', stiffness: 320, damping: 20 }}
                        style={{ touchAction: 'pan-y' }}   /* 版位由 SessionHintLayer 負責 */
                        /* 👉 往左滑掉：拖過門檻或快速左滑就關閉 */
                        drag="x"
                        dragDirectionLock
                        dragConstraints={{ left: 0, right: 0 }}
                        dragElastic={{ left: 0.9, right: 0.12 }}
                        onDragEnd={(e, info) => {
                            if (info.offset.x < -70 || info.velocity.x < -450) dismissOverloadSuggestion();
                        }}
                        whileDrag={{ cursor: 'grabbing' }}
                    >
                        <div style={{
                            borderRadius: 16, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
                            background: 'rgba(22,20,21,0.92)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            boxShadow: '0 10px 28px rgba(0,0,0,0.28)',
                        }}>
                            {/* coral 細直條（瑞士式 rule，不用 icon 框） */}
                            <div style={{ width: 2.5, alignSelf: 'stretch', borderRadius: 99, background: '#F95C4B', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', color: '#F95C4B', margin: 0 }}>{overloadSuggestion.prescribed ? '今日重量' : '加重挑戰'}</p>
                                <p style={{ fontSize: 12, fontWeight: 600, color: '#F6F4F1', margin: '3px 0 0', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{overloadSuggestion.message}</p>
                                {overloadSuggestion.prescribed && overloadSuggestion.warmups?.length > 0 && (
                                    <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(246,244,241,0.6)', margin: '3px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontVariantNumeric: 'tabular-nums' }}>
                                        {`暖身 ${overloadSuggestion.warmups.map((w) => `${w.weight}×${w.reps}`).join(' → ')}`}
                                    </p>
                                )}
                            </div>
                            <motion.button {...pressProps('row')}
 onClick={() => { setInputWeight(overloadSuggestion.weight.toString()); dismissOverloadSuggestion(); }}
 style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 10, background: '#F95C4B', border: 'none', color: '#fff', fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', cursor: 'pointer', minHeight: 32 }}
 >
                                帶入
                            </motion.button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            </SessionHintLayer>

            {/* 🆕 教練回饋提醒 — 上次結算頁教練點名的動作，這次做到時帶入提醒 */}
            <SessionHintLayer>
            <AnimatePresence>
                {/* 🩹 加上 !planEcho：白卡（同款課表 · Last Time）是跟著文件流排版的，
                    這張黑卡卻是 absolute 釘在距頂 92px，兩張同時出現時黑卡直接壓在白卡上，
                    把「刷新 N 項個人紀錄」和 Strength Score 整段蓋掉。
                    兩張講的都是「上次」，本來就不該同時出現 —— 改成排隊：
                    白卡關掉（×）之後這張才登場。 */}
                {!planEcho && !overloadSuggestion && coachNote && (
                    <motion.div
                        initial={{ y: -16, opacity: 0, scale: 0.97 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ x: -160, opacity: 0, transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] } }}
                        transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                        style={{ touchAction: 'pan-y' }}   /* 版位由 SessionHintLayer 負責 */
                        drag="x"
                        dragDirectionLock
                        dragConstraints={{ left: 0, right: 0 }}
                        dragElastic={{ left: 0.9, right: 0.12 }}
                        onDragEnd={(e, info) => {
                            if (info.offset.x < -70 || info.velocity.x < -450) dismissCoachNote();
                        }}
                        whileDrag={{ cursor: 'grabbing' }}
                    >
                        <div style={{
                            borderRadius: 16, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
                            background: 'rgba(22,20,21,0.92)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            boxShadow: '0 10px 28px rgba(0,0,0,0.28)',
                        }}>
                            <div style={{ width: 2.5, alignSelf: 'stretch', borderRadius: 99, background: '#F95C4B', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontFamily: "'Manrope', sans-serif", fontSize: 12, fontWeight: 800, letterSpacing: '0.18em', color: '#F95C4B', margin: 0 }}>教練提醒 · 上次回饋</p>
                                <p style={{ fontSize: 11.5, fontWeight: 500, color: '#F6F4F1', margin: '3px 0 0', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{coachNote}</p>
                            </div>
                            <motion.button {...pressProps('row')}
 onClick={dismissCoachNote}
 style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.14)', color: '#F6F4F1', fontFamily: "'Manrope', sans-serif", fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', cursor: 'pointer' }}
 >
                                知道了
                            </motion.button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            </SessionHintLayer>

            {/* SUBSTITUTE EXERCISE MODAL */}
            <AnimatePresence>
                {showSubstituteModal && (
                    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-end justify-center">
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            className="bg-white w-full rounded-t-[28px] p-6 space-y-4 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] flex flex-col max-h-[85dvh]"
                            style={{ maxWidth: '430px' }}
                        >
                            <div className="w-12 h-1 bg-black/10 rounded-full mx-auto shrink-0" />

                            <div className="flex items-center justify-between shrink-0">
                                <div>
                                    <h3 className="text-2xl font-medium text-[#161415]">替代動作</h3>
                                    <p className="text-[#161415]/60 font-medium text-sm">
                                        {substituteHint}
                                    </p>
                                </div>
                                <motion.button {...pressProps('icon')} onClick={() => setShowSubstituteModal(false)} className="p-2 bg-black/5 rounded-full">
                                    <X size={20} className="text-[#161415]/60" />
                                </motion.button>
                            </div>

                            <div className="overflow-y-auto flex-1 pb-8 space-y-3 mt-4">
                                {substituteOptions.length > 0 ? (
                                    substituteOptions.map((opt, idx) => (
                                        <motion.button
                                            key={idx}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => handleSelectSubstitute(opt)}
                                            className="w-full bg-[#F6F4F1] hover:bg-[#E8D5B5]/30 border border-black/5 p-4 rounded-[18px] flex items-center justify-between text-left transition-colors"
                                        >
                                            <div style={{ minWidth: 0 }}>
                                                <h4 className="text-lg font-medium text-[#161415]">{toZhExerciseName(opt.name)}</h4>
                                                {/* 標籤只留兩個：拿什麼練、為什麼排在這裡。
                                                    以前寫 BARBELL / Tier 2 —— 英文，而且 Tier 沒有人知道是什麼。 */}
                                                <div className="flex gap-1.5 mt-1.5 items-center">
                                                    {opt.eqZh && (
                                                        <span className="text-[11px] px-2 py-0.5 rounded-md font-medium"
                                                            style={{ background: 'rgba(22,20,21,0.06)', color: 'rgba(22,20,21,0.62)' }}>
                                                            {opt.eqZh}
                                                        </span>
                                                    )}
                                                    {opt.reason && (
                                                        <span className="text-[11px] px-2 py-0.5 rounded-md font-medium"
                                                            style={{
                                                                background: opt.familiarSets > 0 ? 'rgba(249,92,75,0.10)' : 'rgba(22,20,21,0.06)',
                                                                color: opt.familiarSets > 0 ? '#D9604F' : 'rgba(22,20,21,0.62)',
                                                            }}>
                                                            {opt.reason}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <ArrowRight size={20} className="text-[#161415]/30" />
                                        </motion.button>
                                    ))
                                ) : (
                                    /* 寧可誠實說沒有，也不要硬塞一份不能用的清單。
                                       自訂動作查不到定義時就會走到這裡，給的是「自己挑」這條路。 */
                                    <div className="text-center py-10 px-6">
                                        <p className="text-[15px] font-medium text-[#161415]/70 m-0">
                                            這個動作沒有可直接替換的選項
                                        </p>
                                        <p className="text-[12.5px] text-[#161415]/45 mt-2 mb-5 leading-relaxed">
                                            自訂動作還沒有對應的動作模式，換成別的動作要自己挑
                                        </p>
                                        <motion.button {...pressProps('row')}
                                            onClick={() => { setShowSubstituteModal(false); handleAddAfterIndex(currentExerciseIndex); }}
                                            className="px-6 py-3 rounded-[16px] text-[14px] font-medium"
                                            style={{ background: '#161415', color: '#F6F4F1' }}>
                                            自己加一個動作
                                        </motion.button>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ── 雲端同步 Toast 通知 ── */}
            <AnimatePresence>
                {syncToast && (
                    <motion.div
                        key="sync-toast"
                        initial={{ opacity: 0, y: 40, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                        className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-[18px] shadow-xl flex items-center gap-3"
                        style={{
                            background: syncToast.type === 'success' ? '#161415' : '#D94030',
                            color: '#F6F4F1',
                            minWidth: 220,
                            maxWidth: '90vw',
                        }}
                    >
                        <span style={{ fontSize: 16 }}>
                            {syncToast.type === 'success' ? '☁️' : '⚠️'}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>
                            {syncToast.msg}
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* HIGH-IMPACT WORKOUT COMPLETE TRANSITION */}
            <WorkoutCompleteTransition
                isActive={isTransitionActive}
                totalVolume={finalStats.volume}
                totalSets={finalStats.sets}
                onComplete={() => {
                    setIsTransitionActive(false);
                    setShowCompletion(true);
                    setSyncToast({ type: 'success', msg: '訓練已同步到雲端 ✓' });
                }}
            />

            {/* ══════════ SKIP EXERCISE CONFIRM ══════════ */}
            <AnimatePresence>
                {showSkipConfirm && (
                    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center px-6"
                        onClick={() => setShowSkipConfirm(false)}>
                        <motion.div
                            initial={{ scale: 0.88, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.88, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                            onClick={e => e.stopPropagation()}
                            className="bg-white rounded-[28px] p-7 w-full shadow-2xl"
                            style={{ maxWidth: '340px' }}
                        >
                            <div className="text-center mb-6">
                                <div className="w-14 h-14 rounded-[18px] bg-[#161415]/5 flex items-center justify-center mx-auto mb-4">
                                    <SkipForward size={26} className="text-[#F95C4B]" />
                                </div>
                                <h3 className="text-xl font-medium text-[#161415] mb-1">略過此動作？</h3>
                                <p className="text-sm text-[#161415]/50 font-medium leading-relaxed">
                                    「{currentExercise?.name}」將被略過，直接進入下一個動作。
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <motion.button {...pressProps('cta')}
 onClick={() => setShowSkipConfirm(false)}
 className="flex-1 py-3.5 rounded-[18px] bg-black/5 text-[#161415] font-medium text-sm"
 >取消</motion.button>
                                <motion.button {...pressProps('cta')}
 onClick={handleSkipExercise}
 className="flex-1 py-3.5 rounded-[18px] bg-[#161415] text-white font-medium text-sm"
 >略過</motion.button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ══════════ ADD EXERCISE MODAL ══════════ */}
            <AnimatePresence>
                {showAddExerciseModal && (() => {
                    const CATEGORIES = ['all', 'chest', 'back', 'shoulders', 'arms', 'legs', 'core'];
                    const CAT_LABELS = { all: '全部', chest: '胸', back: '背', shoulders: '肩', arms: '手臂', legs: '腿', core: '核心' };
                    const filtered = ALL_EXERCISES.filter(ex => {
                        const matchCat = addExCategory === 'all' || ex.muscle === addExCategory;
                        const matchSearch = !addExSearch || ex.name.toLowerCase().includes(addExSearch.toLowerCase());
                        return matchCat && matchSearch;
                    }).slice(0, 50);

                    return (
                        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end justify-center"
                            onClick={() => setShowAddExerciseModal(false)}>
                            <motion.div
                                initial={{ y: '100%' }}
                                animate={{ y: 0 }}
                                exit={{ y: '100%' }}
                                transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                                onClick={e => e.stopPropagation()}
                                className="bg-white w-full rounded-t-[28px] shadow-2xl flex flex-col"
                                style={{ maxWidth: '430px', maxHeight: '88dvh' }}
                            >
                                {/* Handle */}
                                <div className="w-12 h-1 bg-black/10 rounded-full mx-auto mt-4 mb-5 shrink-0" />

                                {/* Header */}
                                <div className="px-6 pb-4 shrink-0">
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <h3 className="text-2xl font-medium text-[#161415]">加入動作</h3>
                                            <p className="text-sm text-[#161415]/50 font-medium">插入到目前動作之後</p>
                                        </div>
                                        <motion.button {...pressProps('icon')} onClick={() => setShowAddExerciseModal(false)}
 className="w-9 h-9 bg-black/5 rounded-full flex items-center justify-center">
                                            <X size={18} className="text-[#161415]/50" />
                                        </motion.button>
                                    </div>
                                    {/* Search */}
                                    <div className="relative mb-3">
                                        <input
                                            type="text"
                                            value={addExSearch}
                                            onChange={e => setAddExSearch(e.target.value)}
                                            placeholder="搜尋動作名稱…"
                                            autoFocus
                                            className="w-full px-4 py-3 bg-black/5 rounded-[18px] text-sm font-medium text-[#161415] placeholder-black/30 outline-none border border-transparent focus:border-black/10"
                                        />
                                    </div>
                                    {/* Category pills */}
                                    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                                        {CATEGORIES.map(cat => (
                                            <motion.button {...pressProps('icon')} key={cat}
 onClick={() => setAddExCategory(cat)}
 className="shrink-0 px-3 py-1.5 rounded-full text-[9px] font-medium uppercase tracking-wider"
 style={{
 background: addExCategory === cat ? '#161415' : 'rgba(0,0,0,0.06)',
 color: addExCategory === cat ? '#fff' : 'rgba(26,26,26,0.5)',
 }}
 >{CAT_LABELS[cat]}</motion.button>
                                        ))}
                                    </div>
                                </div>

                                {/* Exercise list */}
                                <div className="overflow-y-auto flex-1 px-4 pb-8">
                                    {filtered.length === 0 ? (
                                        <div className="text-center py-12 text-[#161415]/30 font-bold">找不到相關動作</div>
                                    ) : filtered.map(ex => (
                                        <motion.button
                                            key={ex.name}
                                            whileTap={{ scale: 0.97 }}
                                            onClick={() => handleAddExercise(ex)}
                                            className="w-full flex items-center gap-4 py-3.5 px-3 rounded-[18px] mb-1 text-left active:bg-black/5 transition-colors"
                                        >
                                            <div className="w-10 h-10 rounded-xl bg-[#F95C4B]/10 flex items-center justify-center shrink-0">
                                                <Dumbbell size={18} className="text-[#F95C4B]" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-[#161415] text-sm leading-tight truncate">{getExerciseNameZh(ex.name)}</p>
                                                <p className="text-[#161415]/40 text-[11px] font-medium mt-0.5">
                                                    {ex.warmupSets ? `${ex.warmupSets}熱身+${ex.sets}正式組` : `${ex.sets}組`} · {ex.reps}次 · {ex.rest}
                                                </p>
                                            </div>
                                            <div className="shrink-0 flex flex-col items-end gap-1">
                                                <span className="text-[9px] bg-black/5 px-2 py-0.5 rounded-md font-bold uppercase text-[#161415]/50">
                                                    {ex.muscle}
                                                </span>
                                                <span className="text-[11px] text-[#161415]/30 font-medium">{ex.eq}</span>
                                            </div>
                                        </motion.button>
                                    ))}
                                </div>
                            </motion.div>
                        </div>
                    );
                })()}
            </AnimatePresence>

            {/* ══════════ WORKOUT QUEUE SHEET ══════════ */}
            <AnimatePresence>
                {showQueueSheet && (
                    <WorkoutQueueSheet
                        exercisesWithSets={exercisesWithSets}
                        currentExerciseIndex={currentExerciseIndex}
                        isLiveFill={isLiveFill}
                        initialAddPanel={typeof showQueueSheet === 'object' ? showQueueSheet.addAfter : null}
                        onClose={() => setShowQueueSheet(false)}
                        onReorder={handleReorderQueue}
                        onSkip={handleSkipFromQueue}
                        onSkipGroup={handleSkipGroupFromQueue}
                        onUpdateLoggedSets={(absIdx, newSets) => {
                            setExercisesWithSets(prev => prev.map((e, idx) => idx === absIdx ? { ...e, sets: newSets } : e));
                        }}
                        onAddAfterIndex={handleAddAfterIndex}
                        onAddExercise={() => {
                            setShowQueueSheet(false);
                            setShowAddExerciseModal(true);
                            setAddExSearch('');
                            setAddExCategory('all');
                        }}
                    />
                )}
            </AnimatePresence>

            {/* ══════════ 🆕 自由訓練：選下一個動作 / 完成此次計劃 ══════════ */}
            <AnimatePresence>
                {freestyleNextOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, zIndex: 90 }}>
                        <FreestyleExercisePicker
                            title="選下一個動作"
                            subtitle={`已完成 ${completedSets.length} 組 · 繼續選或結束`}
                            confirmLabel="加入並開始"
                            finishLabel="完成此次計劃"
                            fillWhileDoing={isLiveFill}
                            onConfirm={handleFreestyleAddNext}
                            onFinish={handleFreestyleFinish}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ══════════ 🆕 訓練回顧 + 編輯 + 結束確認 ══════════ */}
            <AnimatePresence>
                {showSummaryReview && (() => {
                    // 🆕 自由訓練：結算回顧只顯示「真的有做的動作」（0 組不列）。
                    const reviewExercises = isFreestyle
                        ? exercisesWithSets.filter(ex => (ex.sets || []).some(s => s.completed))
                        : exercisesWithSets;
                    // 🔧 把原「結束確認彈窗(圖三)」的今日完成進度整合進回顧卡(圖二)。
                    //    邊做邊填沒有固定組數，總數改用「已完成組數」當分母，避免 99 稀釋成 0%。
                    const totalSetsAll = reviewExercises.reduce((s, ex) => s + (ex.openEnded
                        ? (ex.sets?.filter(x => x.completed).length || 0)
                        : (ex.sets?.length || ex.sets_target || 3)), 0);
                    const doneSetsCount = completedSets.length;
                    const pctDone = totalSetsAll > 0 ? Math.round((doneSetsCount / totalSetsAll) * 100) : 0;
                    return (
                    <WorkoutSummaryReviewCard
                        exercises={reviewExercises}
                        durationMins={totalTimeElapsed ? Math.max(1, Math.round(totalTimeElapsed / 60)) : undefined}
                        progressPct={pctDone}
                        doneSets={doneSetsCount}
                        totalSetsAll={totalSetsAll}
                        durationSeconds={displayDuration}
                        onUpdateSet={(exIdx, setIdx, field, val) => {
                            /* 結束前回顧卡的輸入框原本直接寫原始字串：「1e9」、負數、「abc」都會進紀錄，
                               污染 PR 與訓練量。跟 saveSetData 同一套界線（依動作的重量上限／次數上限）；
                               清空中的 '' 先留著讓人打字，非數字就忽略這次輸入。 */
                            if (val !== '' && !Number.isFinite(Number(val))) return;
                            setExercisesWithSets(prev => prev.map((e, idx) => {
                                if (idx !== exIdx) return e;
                                const limits = field === 'weight' ? weightCapFor(e.name) : (SET_LIMITS[field] || SET_LIMITS.reps);
                                const safe = val === '' ? '' : clampSetInput(val, limits);
                                return { ...e, sets: (e.sets || []).map((s, si) => si === setIdx ? { ...s, [field]: safe } : s) };
                            }));
                        }}
                        onClose={() => { setShowSummaryReview(false); setIsPaused(false); }}
                        onConfirm={() => { setShowSummaryReview(false); completeWorkout(exercisesWithSets); }}
                    />
                    );
                })()}
            </AnimatePresence>

            {/* 重訓術語說明「？」—— 這個系統以前完全沒有說明入口（2026-08 稽核） */}
            <StrengthTermsExplainer isOpen={showTermsHelp} onClose={() => setShowTermsHelp(false)} />

            {/* 🔴 Fix(session-guard): 訓練離開確認彈窗 */}
            <AnimatePresence>
                {showExitGuard && (
                    <div
                        className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center px-6"
                        onClick={() => setShowExitGuard(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.88, opacity: 0, y: 16 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.88, opacity: 0, y: 16 }}
                            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                            onClick={e => e.stopPropagation()}
                            className="bg-white rounded-[28px] p-7 w-full shadow-2xl"
                            style={{ maxWidth: '340px' }}
                        >
                            <div className="text-center mb-6">
                                <div className="w-14 h-14 rounded-[18px] flex items-center justify-center mx-auto mb-4"
                                    style={{ background: 'rgba(249,92,75,0.1)' }}>
                                    <X size={26} style={{ color: '#F95C4B' }} />
                                </div>
                                <h3 className="text-xl font-medium text-[#161415] mb-1">確定要結束訓練？</h3>
                                <p className="text-sm text-[#161415]/50 font-medium leading-relaxed">
                                    你已完成 <span className="font-medium text-[#F95C4B]">{completedSets.length} 組</span> 訓練。<br />
                                    離開後本次未儲存的進度將會遺失。
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <motion.button {...pressProps('cta')}
 onClick={() => setShowExitGuard(false)}
 className="flex-1 py-4 rounded-[18px] font-bold text-[#161415] text-sm"
 style={{ background: 'rgba(22,20,21,0.06)' }}
 >
                                    繼續訓練
                                </motion.button>
                                <motion.button {...pressProps('cta')}
 onClick={() => { clearProgress(); closeOrb(); clearAnalysisJob(); setShowExitGuard(false); onExit(); }}
 className="flex-1 py-4 rounded-[18px] font-medium text-white text-sm"
 style={{ background: 'linear-gradient(135deg, #F95C4B, #D94030)' }}
 >
                                    確認離開
                                </motion.button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* 🆕 未完成訓練還原卡：關閉重開後若偵測到上次有未完成的訓練，讓使用者選擇 */}
            <AnimatePresence>
                {showRestorePrompt && initialRestoreRef.current && (
                    <div className="fixed inset-0 z-[210] bg-black/60 backdrop-blur-sm flex items-center justify-center px-6">
                        <motion.div
                            initial={{ scale: 0.88, opacity: 0, y: 16 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.88, opacity: 0, y: 16 }}
                            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                            className="bg-white rounded-[28px] p-7 w-full shadow-2xl"
                            style={{ maxWidth: '340px' }}
                        >
                            <div className="text-center mb-6">
                                <div className="w-14 h-14 rounded-[18px] flex items-center justify-center mx-auto mb-4"
                                    style={{ background: 'rgba(249,92,75,0.1)' }}>
                                    <RefreshCw size={24} style={{ color: '#F95C4B' }} />
                                </div>
                                <h3 className="text-xl font-medium text-[#161415] mb-1">繼續上次的訓練？</h3>
                                <p className="text-sm text-[#161415]/50 font-medium leading-relaxed">
                                    偵測到你上次有一場未完成的訓練，<br />
                                    已完成 <span className="font-medium text-[#F95C4B]">
                                        {(initialRestoreRef.current.completedSets || []).length} 組
                                    </span>。要從上次的進度接著練嗎？
                                </p>
                            </div>
                            <div className="flex flex-col gap-3">
                                <motion.button {...pressProps('cta')}
 onClick={applyRestore}
 className="w-full py-4 rounded-[18px] font-medium text-white text-sm"
 style={{ background: 'linear-gradient(135deg, #F95C4B, #D94030)' }}
 >
                                    繼續上次進度
                                </motion.button>
                                <motion.button {...pressProps('cta')}
 onClick={discardRestore}
 className="w-full py-4 rounded-[18px] font-bold text-[#161415] text-sm"
 style={{ background: 'rgba(22,20,21,0.06)' }}
 >
                                    重新開始
                                </motion.button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

        </div>
    );
};

export default WorkoutSessionViewMobile;
