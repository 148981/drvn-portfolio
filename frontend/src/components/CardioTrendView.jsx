import React, { useState, useEffect, useRef, useMemo } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import haptic from '../utils/haptics';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, Calendar, Activity, Zap, Heart, Flame, Droplets, Battery, Utensils, Brain, Moon, AlertTriangle, Info, ChevronRight } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, CartesianGrid, ScatterChart, Scatter, ReferenceArea, ReferenceLine, ZAxis, PieChart, Pie, LineChart, Line } from 'recharts';
import { motion, AnimatePresence, useInView, useReducedMotion } from 'framer-motion';

// ══════════════════════════════════════════════
// 🎬 ANIMATION SYSTEM — Swiss-editorial, minimal
// ══════════════════════════════════════════════

// Scroll-triggered card entrance.
// When `sheen` is true, a brushed-titanium highlight overlay is layered in
// (used for all metric cards so they share the unified material language).
const CardReveal = ({ children, delay = 0, className, style, onClick, sheen = false }) => {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true, margin: '-32px' });
    const shouldReduce = useReducedMotion();
    return (
        <motion.div
            ref={ref}
            onClick={onClick}
            className={className}
            style={style}
            initial={shouldReduce ? false : { opacity: 0, y: 28 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ type: 'spring', stiffness: 280, damping: 28, delay }}
        >
            {sheen && (
                <span
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        borderRadius: 'inherit',
                        background: 'linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.5) 44%, rgba(255,255,255,0.07) 52%, transparent 60%)',
                        mixBlendMode: 'overlay',
                        opacity: 0.7,
                        zIndex: 0,
                    }}
                />
            )}
            {children}
        </motion.div>
    );
};

// Number counter spring
const springNum = { type: 'spring', stiffness: 380, damping: 22 };

// Staggered container
const staggerContainer = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.09, delayChildren: 0.05 } }
};
const staggerItem = {
    hidden: { opacity: 0, y: 22 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 28 } }
};

// ══════════════════════════════════════════════
// 🔧 SHARED WEEK-KEY HELPER  (#1 Bug Fix)
// ══════════════════════════════════════════════
// getWeekKey／withinDays／CARDIO_CONSTANTS／LSD_HEALTHY 搬到 utils/trendChartAnalysis（卡片與點開的分析同一套）
const MIN_SESSIONS_FOR_FORM_ANALYSIS = 7; // 至少 7 次 session 才解鎖 Form 分析


import apiClient from '../api/client';
import MobileNavigation from './MobileNavigation';
import ChartErrorBoundary from './ChartErrorBoundary';
import { notifyLoadStatus } from '../utils/drvnNotifications';
import { TrendAnalysisSheet, TrendGuideSheet } from './TrendChartSheets';
import { CARDIO_CONSTANTS, LSD_HEALTHY, getWeekKey, withinDays } from '../utils/trendChartAnalysis';
import HealthStatusBadges from './HealthStatusBadges';
import useHealthKit from '../hooks/useHealthKit';
import { getUserId } from '../utils/auth';
import { brandColors as C } from '../utils/colors';
import { useChartVisibility } from '../utils/advancedCharts';
import MemberLockCard from './MemberLockCard';
import { useThisWeekBricks } from '../hooks/useThisWeekBricks';
import { toLocalDateKey, startOfWeek } from '../utils/localDate';
import { CADENCE_IDEAL } from '../utils/cadenceCoach';

// ⭐️ 新增這行：引入資料層與科學模型
import {
    normalizeSession,
    computeLoadMetrics,
    calculateInjuryRisk,
    predictRaceTimes,
    predictRaceTimesByNeighborhood,
    pickReferenceRun
} from '../adapters/cardioAdapter';

// 點圖表的分析內容在 utils/trendChartAnalysis（跟著數據算，不是固定文字）


// --- 0.3 Calibration Sheet ---
const CalibrationSheet = ({ isOpen, onClose, userProfile, onSave }) => {
    const [localProfile, setLocalProfile] = useState(userProfile);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[1000] flex items-end justify-center px-4 pb-4">
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="w-full bg-[#FAF7F2] rounded-[36px] p-6 relative z-10 shadow-2xl overflow-hidden"
                style={{ maxWidth: '430px' }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="w-12 h-1.5 bg-black/10 rounded-full mx-auto mb-6" />
                <h3 className="text-2xl font-black text-zinc-900 mb-2">Model Calibration</h3>
                <p className="text-xs text-zinc-500 font-medium mb-6 leading-relaxed">
                    Update your baselines to ensure the AI Coach and VO₂ Max algorithms provide accurate insights.
                </p>

                <div className="space-y-4">
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-2">Weight (kg)</label>
                            <input
                                type="number" className="w-full bg-white rounded-xl px-4 py-3 font-bold text-zinc-900 border border-zinc-200 focus:outline-none focus:border-zinc-400"
                                value={localProfile.weight} onChange={e => setLocalProfile({ ...localProfile, weight: Number(e.target.value) })}
                            />
                        </div>
                        <div className="flex-1">
                            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-2">Rest HR</label>
                            <input
                                type="number" className="w-full bg-white rounded-xl px-4 py-3 font-bold text-zinc-900 border border-zinc-200 focus:outline-none focus:border-zinc-400"
                                value={localProfile.restHR} onChange={e => setLocalProfile({ ...localProfile, restHR: Number(e.target.value) })}
                            />
                        </div>
                        <div className="flex-1">
                            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-2">Max HR</label>
                            <input
                                type="number" className="w-full bg-white rounded-xl px-4 py-3 font-bold text-zinc-900 border border-zinc-200 focus:outline-none focus:border-zinc-400"
                                value={localProfile.maxHR} onChange={e => setLocalProfile({ ...localProfile, maxHR: Number(e.target.value) })}
                            />
                        </div>
                    </div>

                    <motion.button {...pressProps('row')}
 onClick={() => { onSave(localProfile); onClose(); }}
 className="w-full mt-4 py-4 rounded-[18px] bg-zinc-900 text-white font-black uppercase tracking-widest text-xs"
 >
                        Save & Recalibrate
                    </motion.button>
                </div>
            </motion.div>
        </div>
    );
};

// --- Sub-Components (User Provided & Enhanced) ---

// --- 共用卡片樣式 (統一鈦金屬語言：CSS 漸層 + 內陰影) ---
// 對齊 titanium-system.css 的 .ti-surface — 暖中性 + 鈦金屬刷面質感
const cardBaseClass = "p-5 ti-r-lg transition-all active:scale-[0.98] cursor-pointer relative overflow-hidden flex flex-col justify-between";
const cardGlossStyle = {
    background: 'rgba(255, 255, 255, 0.45)', 
    backdropFilter: 'blur(32px) saturate(1.8)',
    WebkitBackdropFilter: 'blur(32px) saturate(1.8)',
    borderTop: '1px solid rgba(255, 255, 255, 0.9)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
    borderLeft: '1px solid rgba(255, 255, 255, 0.6)',
    borderRight: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: 24, // 高導角
    boxShadow: '0 16px 40px -12px rgba(0, 0, 0, 0.08), inset 0 0 0 1px rgba(255, 255, 255, 0.4)',
    zIndex: 1, // 確保在氣氛燈之上
};
// 鈦金屬刷面高光 — 疊在卡片上的 overlay 子元素
const TitaniumSheen = () => (
    <span
        className="absolute inset-0 pointer-events-none"
        style={{
            borderRadius: 'inherit',
            background: 'linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.5) 44%, rgba(255,255,255,0.07) 52%, transparent 60%)',
            mixBlendMode: 'overlay',
            opacity: 0.7,
        }}
    />
);

// --- 小幫手：卡片底部的 Coach 評語標籤 ---
const CardCoachInsight = ({ text }) => (
    <div className="mt-3 pt-3 border-t border-[#E4DED2] flex items-start gap-2">
        <div className="mt-[3px] w-1.5 h-1.5 rounded-full bg-[#F95C4B] shrink-0" />
        <p className="text-[11px] text-[#161415]/60 font-medium leading-relaxed">{text}</p>
    </div>
);

// --- 0.1 AI Coach Daily Suggestion Card ---
const AICoachCard = ({ trainingLoad, injuryRisk, onCalibrate, onClick }) => {
    const hasData = trainingLoad.length > 0;
    const latestLoad = trainingLoad.at(-1) || { fitness: 0, fatigue: 0, form: 0 };
    
    // 重新定義狀態與光譜位置 (0% 是最左邊巔峰，100% 是最右邊過勞)
    let statusConfig = {
        phase: "準備就緒",
        message: "開始累積有氧底子，第一次跑步後解鎖教練分析。",
        color: C.sand,
        position: 50
    };

    if (hasData) {
        // ✅ #5 Bug Fix: use CARDIO_CONSTANTS for all thresholds
        if (injuryRisk >= CARDIO_CONSTANTS.INJURY_RISK_PCT || latestLoad.fatigue > CARDIO_CONSTANTS.FATIGUE_HIGH) {
            // 受傷高風險 / 極度疲勞
            statusConfig = { phase: "高風險", message: "疲勞透支！強制休息日。此時硬練只會增加受傷機率。", color: C.coralDeep, position: 95 };
        } else if (latestLoad.form < CARDIO_CONSTANTS.FORM_PRODUCTIVE) {
            // 過度負荷 (Overreaching)
            statusConfig = { phase: "需要恢復", message: "身體正承受高負荷。今日請安排完全休息，或極低強度的 Zone 1 恢復跑。", color: "#E85D04", position: 80 };
        } else if (latestLoad.form > CARDIO_CONSTANTS.FORM_PEAK && latestLoad.fitness > 20) {
            // 巔峰狀態 (Peaking)
            statusConfig = { phase: "巔峰充沛", message: "體能充沛且疲勞消退！今天是挑戰最佳紀錄 (PR) 或高質量課表的完美時機。", color: C.coral, position: 10 };
        } else {
            // 建設性訓練 (Productive)
            statusConfig = { phase: "穩定累積", message: "狀態穩定，是累積跑量的絕佳區間。建議維持 Zone 2 輕鬆有氧跑。", color: C.ink, position: 50 };
        }
    }

    return (
        <CardReveal delay={0} className={`${cardBaseClass} mb-4 relative`} style={cardGlossStyle} onClick={onClick} sheen>
            {/* 標題列 */}
            <div className="flex justify-between items-start mb-2 relative z-10">
                <span className="ti-kicker">今日焦點</span>
                <motion.button {...pressProps('pill')}
 onClick={(e) => { e.stopPropagation(); onCalibrate(); }}
 className="px-3 py-1.5 relative overflow-hidden"
 style={{
 background: 'rgba(255, 255, 255, 0.45)',
 backdropFilter: 'blur(16px)',
 WebkitBackdropFilter: 'blur(16px)',
 borderTop: '1px solid rgba(255, 255, 255, 1)',
 borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
 borderLeft: '1px solid rgba(255, 255, 255, 0.6)',
 borderRight: '1px solid rgba(255, 255, 255, 0.2)',
 borderRadius: '12px',
 boxShadow: '0 4px 12px rgba(0,0,0,0.06), inset 0 2px 4px rgba(255,255,255,0.7)',
 color: C.ink,
 fontSize: '11px',
 fontWeight: '800',
 letterSpacing: '0.12em',
 }}
 >
                    校準
                </motion.button>
            </div>

            {/* 當前狀態大字 */}
            <h3 className="text-3xl font-light tracking-tight mb-6 relative z-10" style={{ color: statusConfig.color }}>
                {statusConfig.phase}
            </h3>
            
            {/* 🌟 重新設計的光譜條 (帶有文字標籤) */}
            <div className="w-full relative mb-6 mt-2">
                {/* 軌道背景 */}
                <div className="absolute top-1/2 -translate-y-1/2 w-full h-1.5 rounded-full bg-[#E4DED2] overflow-hidden">
                    {/* 顏色漸層帶 (左側橘紅代表活力，中間黑色代表日常，右側深紅代表危險) */}
                    <div className="w-full h-full opacity-20" style={{ background: 'linear-gradient(90deg, #F95C4B 0%, #161415 50%, #D94030 100%)' }} />
                </div>
                
                {/* 刻度點 (裝飾用) */}
                <div className="absolute top-1/2 -translate-y-1/2 left-[10%] w-0.5 h-3 bg-[#161415]/10" />
                <div className="absolute top-1/2 -translate-y-1/2 left-[50%] w-0.5 h-3 bg-[#161415]/10" />
                <div className="absolute top-1/2 -translate-y-1/2 left-[90%] w-0.5 h-3 bg-[#161415]/10" />

                {/* 滑桿游標 (Thumb) */}
                {hasData && (
                    <div 
                        className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-1000 ease-out border-2 border-white"
                        style={{ left: `calc(${statusConfig.position}% - 7px)`, backgroundColor: statusConfig.color }}
                    />
                )}

                {/* 🌟 底部文字標籤：讓使用者立刻看懂光譜意義 */}
                <div className="absolute top-4 w-full flex justify-between px-1">
                    <span className="text-[11px] font-black tracking-wider text-[#F95C4B]">充沛 · 破紀錄</span>
                    <span className="text-[11px] font-black tracking-wider text-[#161415]/40 text-center">累積期</span>
                    <span className="text-[11px] font-black tracking-wider text-[#D94030] text-right">疲勞 · 休息</span>
                </div>
            </div>
            
            {/* 教練詳細建議 */}
            <div className="mt-4 pt-3 border-t border-[#E4DED2] flex items-start gap-2">
                <div className="mt-[3px] w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: statusConfig.color }} />
                <p className="text-[11px] text-[#161415]/70 font-medium leading-relaxed">
                    {statusConfig.message}
                </p>
            </div>
        </CardReveal>
    );
};

// --- 0.2 VO2 Max Trend Card ---
const VO2MaxTrend = ({ vo2Data, sessions = [], onClick }) => {
    const latestVO2 = vo2Data.length > 0 ? vo2Data.at(-1).vo2 : null;
    const prevVO2 = vo2Data.length > 1 ? vo2Data.at(-2).vo2 : null;
    let level = latestVO2 > 50 ? "Excellent" : "Good";

    // ✅ 抗雜訊：光學心率錶單次 VO2 誤差約 ±1.0，直接比「單次差」會讓
    //    順風/逆風的隨機跳動觸發誇張稱讚或下滑警告。改比「本週平均 vs 上週平均」。
    const avg = (arr) => arr.length ? arr.reduce((a, v) => a + v, 0) / arr.length : null;
    const inWindow = (entry, fromDaysAgo, toDaysAgo) => {
        if (!entry.rawDate) return false;
        const now = new Date();
        const days = (now - new Date(entry.rawDate)) / 86400000;
        return days >= toDaysAgo && days < fromDaysAgo;
    };
    const thisWeekAvg = avg(vo2Data.filter(e => inWindow(e, 7, 0)).map(e => e.vo2));
    const lastWeekAvg = avg(vo2Data.filter(e => inWindow(e, 14, 7)).map(e => e.vo2));

    // 週均可比 → 用週均差；否則退回單次差（仍顯示，但門檻拉高避免雜訊）
    const weeklyDelta = (thisWeekAvg !== null && lastWeekAvg !== null) ? (thisWeekAvg - lastWeekAvg) : null;
    const deltaNum = (latestVO2 && prevVO2) ? (latestVO2 - prevVO2) : null; // 顯示用單次差
    const trendDelta = weeklyDelta !== null ? weeklyDelta : deltaNum;       // 判斷趨勢用
    const VO2_NOISE = 1.5; // 高於感測器雜訊的有意義門檻

    const deltaStr = deltaNum !== null ? (deltaNum >= 0 ? '+' : '') + deltaNum.toFixed(1) : null;
    const deltaColor = deltaNum === null ? C.sand : (deltaNum > 0 ? C.coral : C.coralDeep);
    const deltaIcon = deltaNum === null ? '-' : (deltaNum > 0 ? '↑' : '↓');

    // 🧠 教練動態診斷邏輯 — 資料不足時分三態誠實回覆 (不再一律「無資料」)
    //   1. 完全沒跑 → 引導開始
    //   2. 有跑但缺心率 (最常見) → 說明 VO2 需要心率，引導配戴裝置
    //   3. 有心率但量太少 → 顯示倒數，給明確解鎖門檻
    const hasRuns = sessions.length > 0;
    const runsWithHR = sessions.filter(s => s.hr && s.durationMin && s.distance).length;
    let insight;
    if (!latestVO2) {
        if (!hasRuns) {
            insight = "完成第一次跑步後，這裡會開始追蹤你有氧引擎的最大馬力 (VO2 Max)。";
        } else if (runsWithHR === 0) {
            insight = "你已有跑步紀錄，但 VO2 Max 需要心率資料才能推算。配戴 Apple Watch 或心率帶再跑一次，數值就會自動出現。";
        } else {
            insight = `已偵測到 ${runsWithHR} 筆含心率的跑步，正在校準你的有氧基準線。再累積幾次戶外跑，估算會更穩定精準。`;
        }
    } else if (trendDelta !== null && trendDelta > VO2_NOISE) {
        insight = "突破性成長！比起上週平均，你的有氧引擎明顯升級——這是真實的訓練適應，不是單次的順風僥倖。";
    } else if (trendDelta !== null && trendDelta < -VO2_NOISE) {
        insight = "近期週均下滑且超出感測誤差範圍。可能是缺乏高強度刺激或處於長期疲勞，建議檢視睡眠與恢復。";
    } else if (latestVO2 >= 50) {
        insight = "菁英級別的有氧適能！維持這個數值需要極高的訓練自律，你做得非常好。";
    } else {
        insight = "有氧引擎處於穩定維持期。若想進一步突破，建議在下個週期加入每週一次的 VO2 Max 間歇訓練 (如亞索800)。";
    }

    return (
        <CardReveal delay={0} className={cardBaseClass} style={cardGlossStyle} onClick={onClick} sheen>
            <div className="flex justify-between items-start">
                <span className="text-[11px] text-[#161415]/40 tracking-wide font-bold">有氧適能 VO2 Max <span className="text-[11px] text-[#161415]/20 ml-1">(毫升/公斤/分)</span></span>
                {latestVO2 && <span className="text-[11px] font-black text-[#F95C4B] uppercase tracking-widest">{level}</span>}
            </div>
            <div className="my-2 flex items-baseline gap-2 h-full">
                <motion.span
                    className="text-[40px] font-light text-[#161415] leading-none"
                    initial={{ opacity: 0, scale: 0.75 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={springNum}
                >
                    {latestVO2 ? latestVO2.toFixed(1) : '--'}
                </motion.span>
                {deltaStr && (
                    <motion.span
                        className="text-[11px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5"
                        style={{ color: deltaColor, backgroundColor: `${deltaColor}15` }}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2, duration: 0.35 }}
                    >
                        {deltaStr} {deltaIcon}
                    </motion.span>
                )}
            </div>
            <div className="h-12 w-full mt-2 relative">
                <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                        <XAxis dataKey="date" hide />
                        <YAxis domain={['auto', 'auto']} hide />
                        <Tooltip cursor={{ strokeDasharray: '3 3', stroke: C.paper2 }} contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #E4DED2', color: C.ink, fontSize: '11px', fontWeight: 'bold' }} />
                        <ReferenceLine y={45} stroke={C.paper2} strokeDasharray="3 3" />
                        <Scatter data={vo2Data} line={{ stroke: C.sand, strokeWidth: 1 }}>
                            {vo2Data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={index === vo2Data.length - 1 ? C.coral : C.paper2} r={index === vo2Data.length - 1 ? 4 : 2} />
                            ))}
                        </Scatter>
                    </ScatterChart>
                </ResponsiveContainer>
                <div className="absolute top-1/2 right-0 text-[11px] text-[#161415]/20 -translate-y-[8px] font-bold">基準線：45</div>
            </div>
            <CardCoachInsight text={insight} />
        </CardReveal>
    );
};

// --- 0.25 本週累積：這週跑了多少 + vs 上週 ---
/* 本週累積（週一起算）＋ 跑步計劃的本週目標。
   原本另有一張「配速員」卡：目標寫死 30 km，本週跑量還拿「最後一個有跑的那一週」——
   上個月跑過、這週沒跑，也會顯示成這週的量。兩張卡講同一個數字，現在合成這一張，
   目標只用計劃裡真的排的本週里程；沒有計劃就不畫目標。 */
const WeeklyAccumCard = ({ accum, goalKm = null, onClick, onStart }) => {
    if (!accum || (accum.thisKm <= 0 && accum.thisCount <= 0)) {
        return (
            <motion.button {...pressProps('card')} onClick={() => { haptic('light'); onStart?.(); }}
                className="w-full flex items-center justify-between rounded-[24px] px-5"
                style={{ minHeight: 64, background: 'rgba(22,20,21,0.04)', border: '1px solid rgba(22,20,21,0.08)', color: '#161415' }}>
                <span className="text-[19px] font-black tracking-tight">去跑這週第一趟</span>
                <ChevronRight size={18} color="#F95C4B" strokeWidth={2.5} />
            </motion.button>
        );
    }
    const goalPct = goalKm > 0 ? Math.min(accum.thisKm / goalKm, 1) : null;
    const delta = accum.deltaKm;
    const hasPrev = accum.lastKm > 0;
    const fmtDur = (sec) => {
        const s = Math.max(0, Math.round(sec || 0));
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };
    return (
        <CardReveal delay={0} className={cardBaseClass} style={cardGlossStyle} onClick={onClick} sheen>
            <div className="flex justify-between items-start">
                <span className="text-[11px] text-[#161415]/40 tracking-wide font-bold">本週累積 <span className="text-[11px] text-[#161415]/20 ml-1">(週一起算)</span></span>
            </div>
            <div className="my-2 flex items-baseline gap-2">
                <span className="text-[40px] font-light text-[#161415] leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {accum.thisKm.toFixed(1)}
                </span>
                <span className="text-[11px] font-bold text-[#161415]/40">{goalKm ? `/ ${goalKm} km` : 'km'}</span>
                {hasPrev && Math.abs(delta) >= 0.1 && (
                    <span
                        className="text-[11px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5"
                        style={{ color: delta >= 0 ? '#5A7A3A' : '#D94030', backgroundColor: (delta >= 0 ? '#5A7A3A' : '#D94030') + '15' }}
                    >
                        {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}km
                    </span>
                )}
            </div>
            {goalPct != null && (
                <div className="h-1.5 rounded-full overflow-hidden mt-1 mb-2" style={{ background: 'rgba(22,20,21,0.08)' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.round(goalPct * 100)}%`, background: goalPct >= 1 ? '#5A7A3A' : '#F95C4B' }} />
                </div>
            )}
            <div className="flex items-center gap-4 mt-1 text-[11px] text-[#161415]/55 font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <span>{accum.thisCount} 次</span>
                <span className="text-[#161415]/20">·</span>
                <span>{fmtDur(accum.thisSec)}</span>
                {hasPrev && <><span className="text-[#161415]/20">·</span><span className="text-[#161415]/40">上週 {accum.lastKm.toFixed(1)}km</span></>}
            </div>
            <CardCoachInsight text={hasPrev
                ? (delta >= 0 ? '本週跑量已超過上週，維持這個節奏；記得週跑量增幅控制在 10% 以內。' : '本週跑量還落後上週，挑一天補一趟就能追回來。')
                : '本週剛起步，穩定累積就是最好的開始。'} />
        </CardReveal>
    );
};

// --- 0.3 Race Prediction：由近期最佳表現(Riegel) 或 VO2max 推估各距離完賽時間 ---
const fmtRaceTime = (sec) => {
    const s = Math.max(0, Math.round(sec || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
    return `${m}:${String(r).padStart(2, '0')}`;
};
const fmtRacePace = (sec) => {
    const s = Math.max(0, Math.round(sec || 0));
    return `${Math.floor(s / 60)}'${String(s % 60).padStart(2, '0')}"`;
};
const RACE_LABELS = { '5K': '5K', '10K': '10K', 'Half': '半馬', 'Full': '全馬' };

const RacePredictionCard = ({ predictions, basis, onClick }) => {
    if (!predictions) return null;
    const rows = ['5K', '10K', 'Half', 'Full'].filter(k => predictions[k]);
    if (rows.length === 0) return null;
    // 🎯 v3：每個距離各自用「最接近它的歷史紀錄」推估，所以文案要講清楚這件事。
    const anyNeighborhood = rows.some((k) => predictions[k].basis === 'neighborhood');
    const anyNearest = rows.some((k) => predictions[k].basis === 'nearest');
    const insight = basis === 'vo2'
        ? '依你目前的有氧適能推估。多跑幾次完整距離，預測會越來越準——去把它跑出來驗證。'
        : anyNeighborhood
            ? '每個距離都用你「跑過最接近的那些紀錄」推估，不是拿全部跑步平均去猜。想更準？就去跑一趟那個距離。'
            : anyNearest
                ? '目前是用你跑過最接近的距離往外推，參考性有限。跑一趟接近的距離，這裡就會準很多。'
                : '紀錄還不夠多，先累積幾趟再回來看。';
    return (
        <CardReveal delay={0} className={cardBaseClass} style={cardGlossStyle} onClick={onClick} sheen>
            <div className="flex justify-between items-start">
                <span className="text-[11px] text-[#161415]/40 tracking-wide font-bold">
                    成績預測 <span className="text-[11px] text-[#161415]/20 ml-1">(等效完賽)</span>
                </span>
                <span className="text-[11px] font-black text-[#F95C4B] uppercase tracking-widest">Predict</span>
            </div>
            <div className="grid grid-cols-4 mt-3 mb-1" style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }}>
                {rows.map((k, i) => (
                    <div
                        key={k}
                        className="flex flex-col items-center py-3"
                        style={{ borderLeft: i > 0 ? '1px solid rgba(0,0,0,0.06)' : 'none' }}
                    >
                        <span className="text-[11px] font-black uppercase tracking-widest text-[#161415]/45 mb-1.5">{RACE_LABELS[k]}</span>
                        <span className="text-[17px] font-light text-[#161415] leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {fmtRaceTime(predictions[k].seconds)}
                        </span>
                        <span className="text-[11px] text-[#161415]/35 mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {fmtRacePace(predictions[k].pacePerKm)}/km
                        </span>
                        {/* 📎 這個預測的可信度 — 用紀錄筆數說話，不裝作每格一樣準 */}
                        {predictions[k].basis && (
                            <span
                                className="text-[12px] font-black tracking-[0.12em] mt-1.5 px-1.5 py-0.5 rounded"
                                style={
                                    predictions[k].basis === 'neighborhood' && predictions[k].sampleSize >= 2
                                        ? { color: '#5A7A3A', background: 'rgba(90,122,58,0.10)' }
                                        : predictions[k].basis === 'neighborhood'
                                            ? { color: '#B8860B', background: 'rgba(184,134,11,0.10)' }
                                            : { color: 'rgba(22,20,21,0.35)', background: 'rgba(22,20,21,0.05)' }
                                }
                            >
                                {predictions[k].basis === 'neighborhood'
                                    ? `${predictions[k].sampleSize} 筆`
                                    : '外推'}
                            </span>
                        )}
                    </div>
                ))}
            </div>
            {/* 逐距離說明「這個數字是根據什麼算的」 */}
            {rows.some((k) => predictions[k].sourceLabel) && (
                <div className="mt-2 flex flex-col gap-0.5">
                    {rows.filter((k) => predictions[k].sourceLabel).map((k) => (
                        <span key={k} className="text-[11px] text-[#161415]/35 leading-relaxed">
                            <span className="font-black text-[#161415]/50">{RACE_LABELS[k]}</span>
                            　{predictions[k].sourceLabel}
                        </span>
                    ))}
                </div>
            )}
            <CardCoachInsight text={insight} />
        </CardReveal>
    );
};

// --- 1. Heart Rate Zone Distribution (純 CSS 堆疊長條圖) ---
const HeartRateTrend = ({ sessions, onClick }) => {
    // ✅ 改用真實時間窗：只統計「過去 14 天」的各區間時間，
    //    避免把一個半月前的舊心率混進佔比，害教練看不到近期進步。
    const recent = withinDays(sessions, 14);
    let totalTime = 0;
    const zoneTime = [0, 0, 0, 0, 0]; // Z1 ~ Z5
    
    recent.forEach(s => {
        if (s.zones && s.zones.array) {
           s.zones.array.forEach((z, i) => {
               zoneTime[i] += Number(z) || 0;
               totalTime += Number(z) || 0;
           });
        }
    });

    const hasData = totalTime > 0;
    const percentages = zoneTime.map(t => hasData ? (t / totalTime) * 100 : 0);
    // 取得佔比最大的是哪個 Zone
    const maxZoneIdx = percentages.indexOf(Math.max(...percentages));
    const safeZone = hasData ? maxZoneIdx : 4;
    
    // Z1 到 Z5 顏色，特別突顯 Z2 (螢光綠)
    // Z1 到 Z5 顏色，特別突顯 Z2 (Coral)
    const zoneColors = [C.ink, C.coral, C.sand, C.paper2, C.coralDeep];
    const zoneNames = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'];
    const zoneLabels = ['輕鬆', '有氧', '混氧', '閾值', '極限'];

    // 🧠 教練動態診斷邏輯 — 無資料時分態誠實回覆
    let insight;
    if (!hasData) {
        if (sessions.length === 0) {
            insight = "完成第一次跑步後，這裡會分析你的心率區間分佈，看你是否真的『該慢的慢、該快的快』。";
        } else {
            insight = "你已有跑步紀錄，但心率區間分佈需要心率資料。配戴 Apple Watch 或心率帶後，這張圖就會自動解鎖。";
        }
    } else if (percentages[1] >= 70) { // Z2 >= 70%
        insight = "教科書等級的極化訓練 (Polarized Training)！超過 70% 的時間在 Z2 累積有氧底子，這是頂尖跑者的黃金比例。";
    } else if (percentages[2] > CARDIO_CONSTANTS.Z3_HIGH_PCT) { // ✅ #3 Bug Fix: Z3 > 30% threshold (not Z3 > Z2)
        insight = "嚴重警告：你的 Z3 (混氧區間) 比例過高！這就是俗稱的垃圾跑量，會讓你非常疲勞卻無法提升有氧能力，請刻意把配速放慢。";
    } else if (percentages[3] + percentages[4] > 30) { // Z4+Z5 > 30%
        insight = "高強度區間比例偏高。這代表你最近的訓練非常操勞，請務必在接下來兩天安排純 Z1 的恢復跑。";
    } else {
        insight = "基礎有氧分佈良好。請記住心法：『輕鬆跑要足夠慢，間歇跑才能足夠快』。";
    }

    return (
        <CardReveal delay={0} className={cardBaseClass} style={cardGlossStyle} onClick={onClick} sheen>
            {/* Header */}
            <div className="flex justify-between items-start">
                <span className="text-[11px] text-[#161415]/40 tracking-wide font-bold">心率區間分佈</span>
                {hasData && (
                    // 降為中性灰標籤：Coral 焦點留給下方那條 Z2 bar（一卡一焦點）
                    <span className="text-[12px] font-black tracking-widest text-[#161415]/45">
                        {zoneLabels[safeZone]}主導
                    </span>
                )}
            </div>

            {/* 大數字 (顯示 Z2 佔比) — 改中性 Deep Black，避免與 Coral bar 雙焦點互搶 */}
            <div className="my-2 flex items-baseline gap-1">
                <span className="text-[48px] font-light text-[#161415] leading-none">{hasData ? Math.round(percentages[1]) : '--'}</span>
                <span className="text-[11px] text-[#161415]/40 pb-1 font-bold">% Z2 有氧區</span>
            </div>

            {/* CSS 堆疊長條圖 */}
            <div className="mt-3 relative w-full pt-4 pb-2">
                {/* 80% Target Marker */}
                <div className="absolute top-0 w-[1px] h-full bg-[#161415]/10 z-0" style={{ left: '80%' }} />
                <div className="absolute top-0 text-[11px] font-bold text-[#161415]/30 -translate-x-1/2" style={{ left: '80%' }}>目標：80%</div>

                {/* Bars */}
                <div className="flex h-5 w-full rounded-md overflow-hidden bg-[#F6F4F1] border border-[#E4DED2] relative z-10 shadow-inner gap-[1px]">
                    {hasData ? percentages.map((pct, i) => (
                        <motion.div
                           key={i}
                           className="h-full flex items-center justify-center whitespace-nowrap overflow-hidden"
                           style={{ backgroundColor: i === 1 ? C.coral : [C.ink, C.coral, C.sand, C.paper2, C.coralDeep][i], opacity: i === 1 ? 1 : 0.6 }}
                           initial={{ width: 0 }}
                           animate={{ width: `${Math.max(pct, 0.5)}%` }}
                           transition={{ type: 'spring', stiffness: 180, damping: 28, delay: 0.1 + i * 0.05 }}
                        >
                           {pct >= 15 && <span className={`text-[11px] font-black px-1 ${i === 1 || i === 0 || i === 4 ? 'text-white' : 'text-[#161415]'}`}>{Math.round(pct)}%</span>}
                        </motion.div>
                    )) : (
                        <div className="w-full h-full flex items-center justify-center text-[12px] text-[#161415]/25 font-black tracking-widest bg-[#F6F4F1]">訓練後解鎖</div>
                    )}
                </div>

                {/* Labels */}
                <div className="flex justify-between mt-2 px-0.5">
                    {zoneNames.map((name, i) => (
                        <div key={i} className="flex flex-col items-center gap-0.5" style={{ flex: 1, textAlign: 'center' }}>
                            <span className="text-[11px] tracking-wide font-black uppercase" style={{ color: i === 1 ? C.coral : C.sand }}>{name}</span>
                        </div>
                    ))}
                </div>
            </div>

            <CardCoachInsight text={insight} />
        </CardReveal>
    );
};

// --- 3. Pacemaker Card (極簡橫條) ---


const LSDTrend = ({ sessions, onClick }) => {
    const data = useMemo(() => {
        const buckets = {};
        (sessions || []).forEach((s) => {
            const km = Number(s.distance) || 0;
            if (km <= 0 || !s.date) return;
            const k = getWeekKey(s.date);
            if (!buckets[k]) buckets[k] = { total: 0, longest: 0, date: s.date };
            buckets[k].total += km;
            if (km > buckets[k].longest) buckets[k].longest = km;
        });
        return Object.entries(buckets)
            .sort((a, b) => new Date(a[1].date) - new Date(b[1].date))
            .slice(-8)
            .map(([k, v]) => ({
                week: k.slice(5),
                longest: Math.round(v.longest * 10) / 10,
                share: v.total > 0 ? Math.round((v.longest / v.total) * 100) : 0,
            }));
    }, [sessions]);

    const hasData = data.length >= 2;
    const latest = data[data.length - 1];
    const first = data[0];
    const grew = hasData && latest && first ? latest.longest - first.longest : 0;
    const share = latest?.share ?? 0;

    let insight;
    if (!hasData) {
        insight = '累積兩週以上的跑步紀錄後，這裡會顯示你的最長一趟怎麼往前推 — 那就是你的耐力天花板。';
    } else if (share < LSD_HEALTHY.min * 100) {
        insight = `最長一趟只占週量的 ${share}%，等於把跑量平均攤掉了。耐力是靠「單次夠長」練出來的，不是靠跑很多次短的。`;
    } else if (share > LSD_HEALTHY.max * 100) {
        insight = `最長一趟占了週量的 ${share}%，比例偏高 — 通常代表週間跑太少。多補一兩趟輕鬆跑，長跑才吃得下去。`;
    } else if (grew > 0.5) {
        insight = `最長一趟從 ${first.longest} 公里推到 ${latest.longest} 公里，占週量 ${share}% 剛好在健康區間。耐力天花板正在往上。`;
    } else {
        insight = `最長一趟維持在 ${latest.longest} 公里、占週量 ${share}%。比例健康，想再往前就把長跑每週加個 10%。`;
    }

    return (
        <CardReveal onClick={onClick} className="ti-card ti-r-lg p-5" sheen>
            <div className="flex justify-between items-start mb-1">
                <div>
                    <span className="text-[11px] text-[#161415]/40 tracking-wide font-bold">LSD · 最長一趟</span>
                    <div className="flex items-baseline gap-1.5 mt-1">
                        <span className="ti-display text-[38px] tabular-nums" style={{ color: hasData ? '#161415' : 'rgba(22,20,21,0.25)' }}>
                            {hasData ? latest.longest : '—'}
                        </span>
                        <span className="text-[12px] font-light" style={{ color: 'rgba(22,20,21,0.45)' }}>公里</span>
                    </div>
                </div>
                {hasData && (
                    <div className="text-right">
                        <div className="text-[11px] font-bold tracking-wide" style={{ color: 'rgba(22,20,21,0.40)' }}>占週量</div>
                        <div
                            className="text-[20px] font-light tabular-nums"
                            style={{
                                color: share >= LSD_HEALTHY.min * 100 && share <= LSD_HEALTHY.max * 100
                                    ? '#7BA05B' : '#FF9800',
                            }}
                        >
                            {share}<span className="text-[11px] opacity-60">%</span>
                        </div>
                    </div>
                )}
            </div>

            <div className="h-[130px] mt-3">
                {hasData ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} margin={{ top: 8, right: 4, left: -26, bottom: 0 }}>
                            <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'rgba(22,20,21,0.35)' }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 11, fill: 'rgba(22,20,21,0.30)' }} axisLine={false} tickLine={false} />
                            <Tooltip content={<CardioCustomTooltip />} cursor={{ fill: 'rgba(22,20,21,0.04)' }} />
                            <Bar dataKey="longest" radius={[6, 6, 0, 0]} maxBarSize={26}>
                                {data.map((d, i) => (
                                    <Cell
                                        key={i}
                                        fill={i === data.length - 1 ? '#5C6BC0' : 'rgba(92,107,192,0.35)'}
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-full flex items-center justify-center">
                        <span className="text-[11px]" style={{ color: 'rgba(22,20,21,0.30)' }}>資料累積中</span>
                    </div>
                )}
            </div>

            <CardCoachInsight text={insight} />
        </CardReveal>
    );
};

const CadenceTrend = ({ sessions, onClick }) => {
    // 抓取最近 10 次有步頻紀錄的跑步
    const data = sessions
        .filter(s => s.cadence && s.cadence > 0)
        .slice(-10)
        .map((s, i) => {
            const dateObj = s.date ? new Date(s.date) : new Date();
            return {
                id: i,
                day: `${dateObj.getMonth() + 1}/${dateObj.getDate()}`,
                cadence: Math.round(s.cadence)
            };
        });

    const hasData = data.length >= 2;   // 趨勢至少要兩筆真實紀錄
    const lastCadence = data.length ? data[data.length - 1].cadence : 0;
    const [IDEAL_LO, IDEAL_HI] = CADENCE_IDEAL;   // 與跑步中的步頻提示同一份門檻
    const avgCadence = hasData ? data.reduce((acc, curr) => acc + curr.cadence, 0) / data.length : 0;

    // 分析邏輯：慢性傷害警告應反映「近期(過去14天)」而非任意近 3 筆。
    // 取過去 14 天內有步頻的跑步，至少 3 次且全部 < 165 才觸發。
    const recentRuns = withinDays(sessions, 14).filter(s => s.cadence && s.cadence > 0);
    const chronicRisk = recentRuns.length >= 3 && recentRuns.every(s => s.cadence < 165);

    // 🏆 動態教練評語
    let insight;
    if (!hasData) {
        insight = data.length === 1 ? '再跑一次有步頻的紀錄，就畫得出趨勢。' : '尚無步頻資料。請確認跑錶有開啟步頻偵測。';
    } else if (chronicRisk) {
        insight = "嚴重警告：連續多次步頻過低！你目前處於高衝擊的『過度跨步』狀態，膝蓋受傷風險極高，請務必縮小步幅。";
    } else if (lastCadence < 165) {
        insight = "今日步頻偏低。每一步的觸地時間過長，會吃掉你的體力並增加關節負擔。";
    } else if (lastCadence >= IDEAL_LO && lastCadence <= IDEAL_HI) {
        insight = "完美的步頻控制！步伐落在最具經濟性且低受傷風險的黃金區間。";
    } else if (lastCadence > IDEAL_HI) {
        insight = "步頻極高！非常敏捷的步伐，通常出現在間歇衝刺或下坡，請確保心率沒有因此超載。";
    } else {
        insight = "步頻穩定，若想再往 170 推進，可以嘗試聽 170 BPM 的節拍音樂輔助。";
    }

    return (
        <CardReveal delay={0} className={cardBaseClass} style={cardGlossStyle} onClick={onClick} sheen>
            <div className="flex justify-between items-start mb-2">
                <span className="text-[11px] text-zinc-400 capitalize tracking-wide font-bold">步頻分析</span>
                <span className="text-[12px] text-zinc-500 tracking-widest bg-zinc-100 px-2 py-0.5 rounded">步/分</span>
            </div>

            <div className="flex items-end gap-2 mb-2">
                <span className="text-[32px] font-light leading-none" style={{ color: lastCadence < 165 && hasData ? C.coralDeep : C.ink }}>
                    {hasData ? lastCadence : '--'}
                </span>
                {hasData && (
                    <div className="flex flex-col mb-1">
                        <span className="text-[11px] font-bold text-zinc-400">最新步頻</span>
                        <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: lastCadence >= IDEAL_LO && lastCadence <= IDEAL_HI ? C.ink : (lastCadence < 165 ? C.coralDeep : C.sand) }}>
                            {lastCadence > IDEAL_HI ? '偏高' : lastCadence >= IDEAL_LO ? '理想區間' : (lastCadence < 165 ? '高衝擊風險' : '尚可')}
                        </span>
                    </div>
                )}
            </div>

            {/* 分析型折線圖：加入紅綠區間底色 */}
            <div className="h-32 w-full mt-4 relative">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                        <XAxis dataKey="day" hide />
                        {/* 鎖定 Y 軸範圍 140~200，讓區間比例固定 */}
                        <YAxis domain={[140, 200]} hide />
                        
                        <Tooltip 
                            cursor={{ strokeDasharray: '3 3', stroke: C.paper2 }} 
                            contentStyle={{ backgroundColor: C.ink, borderRadius: '8px', color: '#fff', fontSize: '11px', border: 'none' }} 
                        />
                        
                        {/* 黃金效率區塊 (170-185) */}
                        {hasData && (
                            <ReferenceArea y1={170} y2={185} fill={C.ink} fillOpacity={0.06} />
                        )}
                        {/* 危險衝擊區塊 (< 165) */}
                        {hasData && (
                            <ReferenceArea y1={140} y2={165} fill={C.coralDeep} fillOpacity={0.05} />
                        )}

                        {/* 參考線標籤 */}
                        {hasData && (
                            <ReferenceLine y={170} stroke={C.ink} strokeDasharray="3 3" strokeOpacity={0.35} strokeWidth={1} />
                        )}
                        {hasData && (
                            <ReferenceLine y={165} stroke={C.coralDeep} strokeDasharray="3 3" strokeOpacity={0.3} strokeWidth={1} />
                        )}

                        <Line 
                            type="monotone" 
                            dataKey="cadence" 
                            stroke={C.ink} 
                            strokeWidth={2}
                            isAnimationActive={true}
                            dot={(props) => {
                                const { cx, cy, payload, index } = props;
                                const isDanger = payload.cadence < 165;
                                const isOptimal = payload.cadence >= 170;
                                const isLast = index === data.length - 1;
                                
                                // 依據落點給予顏色：危險(Ember)、安全/中間(Black)
                                const dotColor = isDanger ? C.coralDeep : (isOptimal ? C.ink : C.sand);
                                
                                return (
                                    <circle 
                                        key={`dot-${index}`} 
                                        cx={cx} 
                                        cy={cy} 
                                        r={isLast ? 4 : 2.5} 
                                        fill={dotColor} 
                                        stroke={isDanger ? C.coralDeep : (isLast ? C.ink : '#fff')}
                                        strokeWidth={isLast ? 2 : 1}
                                        style={{ transition: 'all 0.3s ease' }}
                                    />
                                );
                            }}
                            activeDot={{ r: 6, fill: C.ink, stroke: '#fff', strokeWidth: 2 }}
                        />
                    </LineChart>
                </ResponsiveContainer>

                {/* 絕對定位的背景區塊說明文字 */}
                {hasData && (
                    <>
                        <div className="absolute top-1 left-0 text-[12px] text-[#161415]/50 font-black tracking-widest">目標區間 (170-185)</div>
                        <div className="absolute bottom-2 left-0 text-[12px] text-[#D94030]/60 font-black tracking-widest">膝蓋衝擊區 (&lt;165)</div>
                    </>
                )}
            </div>

            <CardCoachInsight text={insight} />
        </CardReveal>
    );
};

// --- 5. Relative Effort (極簡數字) ---
const RelativeEffortTrend = ({ sessions, trainingLoad = [], onClick }) => {
    // ✅ 修正：改用「真實 7 天時間窗」。trainingLoad 現在是連續每日序列
    //    (含 TRIMP=0 休息日)，所以取最後 7 天 = 真正的過去一週，休息日也會
    //    以 0 高度的長條呈現，讓使用者看得到「練了幾天、休了幾天」。
    const last7Days = trainingLoad.slice(-7);
    const data = last7Days.map((load, i) => {
        const dateObj = load.date ? new Date(load.date) : new Date();
        return {
            id: i,
            day: dateObj.toLocaleDateString('en-US', { weekday: 'short' }),
            trimp: load.trimp || 0,
            isRest: load.trimp === 0
        };
    });

    const hasData = trainingLoad.some(l => l.trimp > 0);

    // 最近一筆「實際有訓練」的負荷（拿來跟平均比，休息日 0 不算）
    const lastTrimp = (() => {
        for (let i = last7Days.length - 1; i >= 0; i--) {
            if (last7Days[i].trimp > 0) return last7Days[i].trimp;
        }
        return 0;
    })();

    // ✅ 7-Day Avg：分母固定為 7（含休息日），分子為過去 7 天總 TRIMP。
    //    這才是科學上監控過度訓練用的「每日平均負荷」。
    const weekTotal = last7Days.reduce((acc, d) => acc + d.trimp, 0);
    const avgTrimp = weekTotal / 7;

    let insight;
    if (!hasData)            insight = "目前尚無訓練紀錄，開始訓練後自動計算心率負荷 (TRIMP)。";
    else if (lastTrimp > avgTrimp * 1.5) insight = "本次訓練負荷遠超近期平均，請確保獲得充足的睡眠與營養補充。";
    else if (lastTrimp < avgTrimp * 0.5) insight = "低負荷的動態恢復，非常好的安排，讓身體代謝先前的疲勞。";
    else                     insight = "紮實且穩定的訓練負荷，完美的有氧能力建立期。";

    return (
        <CardReveal delay={0} className={cardBaseClass} style={cardGlossStyle} onClick={onClick} sheen>
            <div className="flex justify-between items-start mb-2">
                <span className="text-[11px] text-zinc-400 capitalize tracking-wide font-bold">Relative Effort (Load)</span>
                <span className="text-[11px] text-zinc-500 uppercase tracking-widest bg-zinc-100 px-2 py-0.5 rounded">TRIMP</span>
            </div>
            
            <div className="flex items-end gap-2 mb-2">
                <span className="text-[32px] font-light text-[#161415] leading-none">{hasData ? Math.round(lastTrimp) : '--'}</span>
                {hasData && <span className="text-[11px] font-bold text-zinc-400 mb-1">Latest Load</span>}
            </div>

            {/* 週期性趨勢圖：最近 7 次的負荷 */}
            <div className="h-20 w-full mt-2 relative">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                        <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#A1A1AA' }} dy={5} />
                        <YAxis hide domain={[0, 'dataMax + 20']} />
                        <Tooltip cursor={{ fill: C.paper }} contentStyle={{ backgroundColor: C.ink, borderRadius: '8px', color: '#fff', fontSize: '11px', border: 'none' }} />
                        {/* 平均線：讓使用者知道自己的基準在哪 */}
                        {hasData && avgTrimp > 0 && (
                            <ReferenceLine y={avgTrimp} stroke={C.paper2} strokeDasharray="3 3" />
                        )}
                        <Bar dataKey="trimp" radius={[4, 4, 0, 0]}>
                            {data.map((entry, index) => {
                                // 突顯「最近一次有訓練」的長條，休息日(0)維持低調灰
                                const lastTrainedIdx = data.reduce((acc, d, i) => d.trimp > 0 ? i : acc, -1);
                                return (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={index === lastTrainedIdx ? C.coral : C.paper2}
                                    />
                                );
                            })}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
                {hasData && avgTrimp > 0 && (
                    <div className="absolute top-0 right-0 text-[11px] text-[#161415]/30 font-bold bg-[#F6F4F1] px-1">7-Day Avg: {Math.round(avgTrimp)}/day</div>
                )}
            </div>

            <CardCoachInsight text={insight} />
        </CardReveal>
    );
};

// --- 6. Fitness & Freshness (極簡線條) ---
const FitnessFreshnessChart = ({ trainingLoadData, injuryRisk = 0, onClick }) => {
    const data = trainingLoadData.slice(-14).map((d, i) => {
        const dateObj = typeof d.date === 'string' ? new Date(d.date) : d.date;
        const dateStr = dateObj ? dateObj.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) : `Day ${i}`;
        return { id: i, label: dateStr, fitness: d.fitness, fatigue: d.fatigue };
    });
    const latestLoad = trainingLoadData.at(-1) || { fitness: 0, fatigue: 0, form: 0 };
    const hasData = trainingLoadData.length > 0;
    
    // ✅ #5 Bug Fix: use CARDIO_CONSTANTS — unified thresholds across components
    const isRisky = injuryRisk >= CARDIO_CONSTANTS.INJURY_RISK_PCT || latestLoad.form < CARDIO_CONSTANTS.FORM_OVERREACH;
    const formColor = latestLoad.form >= 0 ? C.coral : C.coralDeep;

    // 🧠 教練動態診斷邏輯
    let insight;
    if (!hasData) {
        insight = "系統正在學習你的生理反應。累積約 2-3 週的訓練後，這張圖將成為你最強大的賽前調整武器。";
    } else if (isRisky) {
        // 🩹 語氣修正：「崩潰邊緣」「立即停止」是恐嚇，不是教練。
        //    ACWR/Form 是統計指標，只能提示風險，不能宣稱身體狀態。
        //    改為：先肯定使用者的努力，再說明數據，最後給可執行的處方。
        insight = "最近練得很兇 — 短期訓練壓力已經明顯高過長期體能基礎。這代表你有在推進，也代表身體需要時間把它吸收。接下來 2 天安排休息或純 Zone 1 慢跑，睡飽、吃夠，體能才會真的長上來。";
    } else if (latestLoad.form > 10 && latestLoad.fitness > 30) {
        insight = "Tapering (減量期) 成功！疲勞已完全消退，且保留了高水平的體能，你現在處於可以隨時打破 PB 的巔峰狀態。";
    } else if (latestLoad.form < CARDIO_CONSTANTS.FORM_PRODUCTIVE && latestLoad.form > CARDIO_CONSTANTS.FORM_OVERREACH) {
        insight = "有效的超負荷訓練期 (Overreaching)。身體正在承受壓力並產生破壞，這是變強的必經過程，但請注意營養攝取。";
    } else {
        insight = "體能與疲勞處於平衡的建設期。黑線 (體能) 穩定上升中，繼續維持當前的訓練質量。";
    }

    return (
        <CardReveal delay={0} className={cardBaseClass} style={cardGlossStyle} onClick={onClick} sheen>
            {isRisky && (
                <div className="absolute top-4 right-4 animate-pulse">
                    <AlertTriangle size={16} className="text-red-500" />
                </div>
            )}
            <div className="flex justify-between items-start">
                <div className="flex flex-col">
                    <span className="text-[11px] text-zinc-400 capitalize tracking-wide">Load Form</span>
                    <span className="text-[11px] text-zinc-500 tracking-widest mt-0.5">CTL / ATL Score</span>
                </div>
                {!hasData ? null : (
                    <div className="flex flex-col items-end mr-6">
                        <span className="text-[16px] font-black" style={{ color: formColor }}>
                            {Math.round(latestLoad.form)}
                        </span>
                        <span className="text-[12px] tracking-widest font-black" style={{ color: formColor }}>
                            FORM {latestLoad.form >= 0 ? '(↑ 恢復)' : '(↓ 疲勞)'}
                        </span>
                    </div>
                )}
            </div>
            <div className="h-24 w-full mt-2 relative">
                <ResponsiveContainer width="100%" height="100%">
                    {/* 兩條極細的線交織，沒有填滿 */}
                    <AreaChart data={data} margin={{ top: 5, right: 0, left: 0, bottom: -10 }}>
                        <XAxis dataKey="label" interval={6} tick={{ fill: '#71717A', fontSize: 11 }} axisLine={false} tickLine={false} tickMargin={8} />
                        <YAxis hide domain={['auto', 'auto']} />
                        <Tooltip cursor={{ strokeDasharray: '3 3', stroke: '#52525B' }} contentStyle={{ backgroundColor: '#161415', borderRadius: '8px', border: '1px solid #3F3F46', color: '#fff', fontSize: '11px' }} />
                        <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
                        <Area type="monotone" dataKey="fitness" stroke={C.ink} strokeWidth={1.5} fill="none" name="體能 (CTL)" />
                        <Area type="monotone" dataKey="fatigue" stroke={C.sand} strokeWidth={1.5} strokeDasharray="3 3" fill="none" name="疲勞 (ATL)" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
            <CardCoachInsight text={insight} />
        </CardReveal>
    );
};


// --- 00. Matrix Config (Tag -> Chart Priority) ---
const MATRIX_CONFIG = {
    '#FatBurn': { order: ['vo2max', 'heartRate', 'lsd', 'relativeEffort', 'fitnessFreshness'], label: 'Metabolic Focus' },
    '#Performance': { order: ['vo2max', 'heartRate', 'lsd', 'fitnessFreshness', 'relativeEffort', 'cadence'], label: 'Peak Output' },
    '#Mindfulness': { order: ['heartRate', 'lsd', 'fitnessFreshness', 'vo2max'], label: 'Recovery Focus' },
    '#Routine': { order: ['vo2max', 'heartRate', 'lsd', 'relativeEffort', 'fitnessFreshness', 'cadence'], label: 'Consistency Tracking' }
};

// ─── Hoisted outside CardioTrendView (rerender-no-inline-components) ────────
/* ════════════════════════════════════════════════════════════════════
   趨勢頁分區 —— 依「使用者的決策順序」而不是「圖表的技術分類」排。
     1. 今天能不能練？      → 恢復 / 負荷
     2. 練的強度對不對？    → 心率 / 攝氧
     3. 量夠不夠、有沒有進步？→ 里程 / 成績
     4. 跑得漂不漂亮？      → 技術指標
   每一區的 question 是「這區在回答什麼」，讓使用者不必猜要先看哪張圖。
   ════════════════════════════════════════════════════════════════ */
const TREND_SECTIONS = [
    {
        id: 'status',
        no: '01',
        kicker: '先看這個',
        title: '今日狀態',
        question: '身體現在能吃多少訓練？',
        accent: '#F95C4B',
        keys: ['fitnessFreshness', 'relativeEffort'],
    },
    {
        id: 'intensity',
        no: '02',
        kicker: '強度',
        title: '心率與攝氧',
        question: '該慢的有沒有慢、該快的有沒有快？',
        accent: '#F06292',
        keys: ['heartRate', 'vo2max'],
    },
    {
        id: 'volume',
        no: '03',
        kicker: '進度',
        title: '里程與成績',
        question: '量夠不夠？成績往哪個方向走？',
        accent: '#8BC34A',
        keys: ['lsd'],
    },
    {
        id: 'form',
        no: '04',
        kicker: '技術',
        title: '跑姿與效率',
        question: '同樣的力氣有沒有跑得更遠？',
        accent: '#5C6BC0',
        keys: ['cadence'],
    },
];

const TrendSection = ({ section, index, count, children }) => (
    <motion.section
        className="mb-7"
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 0.5, delay: Math.min(index * 0.06, 0.24), ease: [0.16, 1, 0.3, 1] }}
    >
        {/* 區塊標頭 */}
        <div className="px-1 mb-3">
            <div className="flex items-center gap-2 mb-1.5">
                <span
                    className="text-[11px] font-black tabular-nums tracking-[0.1em] px-1.5 py-[2px] rounded"
                    style={{ background: `${section.accent}1A`, color: section.accent }}
                >
                    {section.no}
                </span>
                <span
                    className="text-[11px] font-black tracking-[0.24em] uppercase"
                    style={{ color: 'var(--ti-ink-soft)' }}
                >
                    {section.kicker}
                </span>
                <span className="text-[11px] font-bold tabular-nums ml-auto" style={{ color: 'rgba(22,20,21,0.28)' }}>
                    {count} 張
                </span>
            </div>
            <div className="flex items-baseline gap-2.5">
                <h2 className="text-[22px] font-light tracking-[-0.02em]" style={{ color: '#161415' }}>
                    {section.title}
                </h2>
                <div className="flex-1 h-px" style={{ background: 'rgba(22,20,21,0.10)' }} />
            </div>
            <p className="text-[11px] mt-1 leading-snug" style={{ color: 'var(--ti-ink-soft)' }}>
                {section.question}
            </p>
        </div>

        <div className="space-y-4">{children}</div>
    </motion.section>
);

const CardioCustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-[#262523] border border-white/10 p-3 rounded-xl shadow-xl">
                <p className="text-white text-xs font-bold mb-1">{label}</p>
                {payload.map((p, i) => (
                    <p key={i} className="text-xs" style={{ color: p.color }}>
                        {p.name}: {Number(p.value).toFixed(1)}
                    </p>
                ))}
            </div>
        );
    }
    return null;
};

// --- Main View ---
const CardioTrendView = ({ 
    onClose, 
    intent,
    // Optional props if rendered as overlay
    forceSimulation: propForceSimulation,
    toggleForceSimulation: propToggleForceSimulation,
    onOpenIntentSelection
}) => {
    const location = useLocation();
    const navigate = useNavigate();
    const chartVis = useChartVisibility(); // 基本圖表所有人看得到；進階圖表 = 會員（utils/advancedCharts 登記表）
    // 本週目標里程：只用跑步計劃裡真的排的量（沒計劃 → null，不畫目標）
    const { week: planWeek } = useThisWeekBricks();
    const planGoalKm = Number(planWeek?.target_mileage_km) > 0 ? Math.round(Number(planWeek.target_mileage_km) * 10) / 10 : null;

    // HealthKit Stats
    const { isAvailable: isHealthKitAvailable, isActive: healthKitIsActive, dataAvailability } = useHealthKit();
    const [forceSimulation, setForceSimulation] = useState(() => {
        if (propForceSimulation !== undefined) return propForceSimulation;
        return localStorage.getItem('force_simulation') === 'true';
    });

    const toggleForceSimulation = () => {
        if (propToggleForceSimulation) {
            propToggleForceSimulation();
        } else {
            const newValue = !forceSimulation;
            setForceSimulation(newValue);
            localStorage.setItem('force_simulation', String(newValue));
        }
    };

    const [sessions, setSessions] = useState([]);
    // ⭐️ 1. 新增 State 存放模型數據
    const [trainingLoad, setTrainingLoad] = useState([]);
    const [injuryRisk, setInjuryRisk] = useState(0);
    const [selectedMetric, setSelectedMetric] = useState(null); // 點圖表 → 數據分析
    const [showGuide, setShowGuide] = useState(false);          // 「?」→ 每張圖在看什麼
    const [loading, setLoading] = useState(true);

    // ⭐️ 2. 加入 User Profile 和 VO2 資料狀態
    const [userProfile, setUserProfile] = useState({ weight: 70, restHR: 60, maxHR: 190 });
    const [vo2Data, setVo2Data] = useState([]);
    const [showCalibration, setShowCalibration] = useState(false);

    // 🔥 Use intent from prop or location state
    const activeIntent = intent || location.state?.intent || '#Routine';
    /* 「?」清單：今天適合練什麼 ＋ 這一頁實際畫出來的圖（跟下面同一份順序與會員可見性） */
    const guideKeys = ['trainingFocus', ...((MATRIX_CONFIG[activeIntent] || MATRIX_CONFIG['#Routine']).order || []).filter((k) => chartVis.visible(k))];

    const userId = getUserId();

    // ── 成績預測：以「近期最多 60 次、配速最快前 50% 的平均配速」為基準(Riegel)，
    //    避免單次短衝刺汙染；否則退回 VO2max 推估 ──
    const raceBasis = useMemo(() => {
        // 正規化為 pickReferenceRun 可讀的欄位（distance_km / duration_seconds）
        // normalizeSession 已經用「配速合理性」挑出正確的時長解讀，
        // 這裡直接沿用 durationSec（單一真相源），不要再自己乘 60。
        const normalized = (sessions || []).map((s) => ({
            distance_km: Number(s.distance || 0),
            duration_seconds: Number(s.durationSec ?? (Number(s.durationMin || 0) * 60)),
        }));
        return pickReferenceRun(normalized);
    }, [sessions]);

    const racePredictions = useMemo(() => {
        // 🎯 v3：每個距離各自找「最接近該距離」的歷史紀錄來預測，
        //    不再用全體截尾平均統一外推（那會讓 5K 被長跑稀釋）。
        const normalized = (sessions || []).map((s) => ({
            distance_km: Number(s.distance || 0),
            duration_seconds: Number(s.durationSec ?? (Number(s.durationMin || 0) * 60)),
        }));
        const byNeighborhood = predictRaceTimesByNeighborhood(normalized);
        if (byNeighborhood) return byNeighborhood;
        // 完全沒有可用跑步紀錄 → 才退回 VO2max 粗估
        const latestVO2 = vo2Data.length ? vo2Data.at(-1).vo2 : null;
        return latestVO2 ? predictRaceTimes({ vo2max: latestVO2 }) : null;
    }, [sessions, vo2Data]);

    // ── 本週累積：這週 vs 上週（ISO 週一起算）──
    const weeklyAccum = useMemo(() => {
        const thisKey = getWeekKey(new Date());
        const lastKey = getWeekKey(new Date(Date.now() - 7 * 86400000));
        let thisKm = 0, thisCount = 0, thisSec = 0, lastKm = 0;
        sessions.forEach((s) => {
            const k = getWeekKey(s.date);
            const dist = Number(s.distance || 0);
            if (k === thisKey) { thisKm += dist; thisCount += 1; thisSec += Number(s.durationMin || 0) * 60; }
            else if (k === lastKey) { lastKm += dist; }
        });
        return { thisKm, thisCount, thisSec, lastKm, deltaKm: thisKm - lastKm };
    }, [sessions]);

    const fetchData = async (profile = userProfile) => {
        try {
            const response = await apiClient.get(`/api/cardio/sessions/${userId}?limit=100`);
            const data = response.data.sessions || [];
            const sortedSessions = data.sort((a, b) => new Date(a.date || a.created_at) - new Date(b.date || b.created_at));

            // ⭐️ 2. 將原始資料透過 Adapter 轉換為乾淨格式
            const cleanSessions = sortedSessions.map(normalizeSession);
            setSessions(cleanSessions);

            // ⭐️ 3. 計算進階模型數據 (注入 UserProfile)
            const loadData = computeLoadMetrics(cleanSessions, profile);
            setTrainingLoad(loadData);

            const riskScore = calculateInjuryRisk(cleanSessions, profile);
            setInjuryRisk(riskScore);

            // ★ v2.3 身體狀態通知（統一走滿版時刻，每日最多一次）。
            //   用真實訓練負荷算出的 ACWR —— 不是計劃上的預估值。
            //   至少要有 4 次紀錄才有慢性負荷可言，否則第一次跑步就叫人休息很荒謬。
            try {
                const latest = loadData?.[loadData.length - 1];
                // computeLoadMetrics 給的是 ctl(慢性) / atl(急性)，ACWR = atl ÷ ctl
                const ctl = Number(latest?.ctl) || 0;
                const atl = Number(latest?.atl) || 0;
                notifyLoadStatus(userId, {
                    acwr: ctl > 0 ? atl / ctl : NaN,
                    hasBase: cleanSessions.length >= 4 && ctl > 0,
                });
            } catch { /* 通知失敗不影響圖表 */ }

            // ⭐️ 4. 計算 VO2 Max 歷史趨勢
            const { estimateVO2Max } = await import('../adapters/cardioAdapter');
            const vo2History = cleanSessions.map(s => {
                const vo2 = estimateVO2Max(s, profile);
                return vo2 ? { date: `${s.date.getMonth() + 1}/${s.date.getDate()}`, rawDate: s.date, vo2 } : null;
            }).filter(Boolean);
            setVo2Data(vo2History);

        } catch (error) {
            console.error("Error fetching trends:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);



    // Group Volume by Week (used for DistanceVolumeTrend)
    const weeklyVolumeData = (() => {
        const weeks = {};
        sessions.forEach(s => {
            const d = s.date; // ⭐️ 使用已經被 adapter normalized 的 Date 物件
            const weekKey = getWeekKey(d); // ✅ #1 Bug Fix: ISO Monday-anchored week key
            if (!weeks[weekKey]) weeks[weekKey] = 0;
            weeks[weekKey] += (s.distance || 0);
        });

        return Object.entries(weeks).map(([week, distance]) => ({
            date: week,
            distance
        })).slice(-6);
    })();

    // CustomTooltip hoisted above as CardioCustomTooltip — see top of file

    // ⭐️ 升級 Readiness Scores (變真 AI 雷達)


    return (
        <div className="fixed inset-0 z-[800] overflow-y-auto pb-24 overflow-x-hidden" style={{ background: '#F1F1EF' }}>
            {/* 🧊 DRVN 法則：氛圍燈是「深色畫布」專用工具，淺色 Paper 畫布上幾乎無物可發光，
                原本的橘/藍/紫三色光暈在淺底上只會糊成一片粉色、把卡片溫度拉平。
                改為一層極淡的冷調 Mist 漸層當「退後的冷色 ground」，讓暖白卡片浮起來。 */}
            <div style={{
                position: 'fixed', inset: 0,
                background: 'linear-gradient(180deg, #E8E9E6 0%, #F1F1EF 40%, #F6F4F1 100%)',
                zIndex: 0, pointerEvents: 'none',
            }} />
            
            {/* Detail Modal Overlay */}
            <AnimatePresence>
                {/* 點任何一張圖 → 直接分析這張圖的數據（不是固定的衛教文字） */}
                <TrendAnalysisSheet metric={selectedMetric} data={{ sessions, trainingLoad, vo2Data, injuryRisk }} onClose={() => setSelectedMetric(null)} />
                {/* 「?」→ 每張圖在看什麼；點一張直接看它的分析 */}
                <TrendGuideSheet open={showGuide} keys={guideKeys} onClose={() => setShowGuide(false)}
                    onPick={(k) => { setShowGuide(false); setSelectedMetric(k); }} />
            </AnimatePresence>

            <div style={{ maxWidth: '430px', margin: '0 auto', minHeight: '100dvh', position: 'relative' }}>
                {/* Header — Swiss-editorial (Liquid Glass style) */}
                <div
                    className="px-6 pt-12 pb-6 flex items-start justify-between sticky top-0 z-20"
                    style={{ 
                        background: 'linear-gradient(180deg, rgba(246,244,241,0.85) 50%, rgba(246,244,241,0) 100%)',
                        backdropFilter: 'blur(16px)',
                        WebkitBackdropFilter: 'blur(16px)',
                    }}
                >
                    <div>
                        <p className="ti-kicker mb-1.5">演化分析</p>
                        <h1 className="ti-display text-[44px]">趨勢</h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <motion.button {...pressProps('pill')}
 onClick={() => { haptic('light'); setShowGuide(true); }}
 aria-label="每張圖在看什麼"
 className="w-11 h-11 flex items-center justify-center text-[#161415] relative overflow-hidden"
 style={{
 background: 'rgba(255, 255, 255, 0.55)',
 backdropFilter: 'blur(20px) saturate(1.8)',
 WebkitBackdropFilter: 'blur(20px) saturate(1.8)',
 borderTop: '1.5px solid rgba(255, 255, 255, 1)',
 borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
 borderLeft: '1px solid rgba(255, 255, 255, 0.8)',
 borderRight: '1px solid rgba(255, 255, 255, 0.3)',
 borderRadius: '18px',
 boxShadow: '0 8px 16px -4px rgba(0, 0, 0, 0.08), inset 0 6px 12px -4px rgba(255, 255, 255, 0.8)'
 }}
 >
                            <span className="text-lg font-black relative z-10">?</span>
                        </motion.button>
                        <motion.button {...pressProps('pill')}
 onClick={() => onClose ? onClose() : navigate(-1)}
 className="w-11 h-11 flex items-center justify-center text-[#161415] relative overflow-hidden"
 style={{
 background: 'rgba(255, 255, 255, 0.55)',
 backdropFilter: 'blur(20px) saturate(1.8)',
 WebkitBackdropFilter: 'blur(20px) saturate(1.8)',
 borderTop: '1.5px solid rgba(255, 255, 255, 1)',
 borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
 borderLeft: '1px solid rgba(255, 255, 255, 0.8)',
 borderRight: '1px solid rgba(255, 255, 255, 0.3)',
 borderRadius: '18px',
 boxShadow: '0 8px 16px -4px rgba(0, 0, 0, 0.08), inset 0 6px 12px -4px rgba(255, 255, 255, 0.8)'
 }}
 >
                            <ArrowLeft size={20} strokeWidth={2.5} className="relative z-10" />
                        </motion.button>
                    </div>
                </div>

                {/* ══════════════════════════════════════════════════════════
                    Content — ★ 分區版
                    原本是一長串沒有標題的圖表，使用者不知道要先看哪一張。
                    現在依「決策順序」切成四個區塊，每區有 kicker + 標題 + 一句話
                    說明「這區在回答什麼問題」，由上而下就是一次完整的自我檢查。
                    ══════════════════════════════════════════════════════════ */}
                <div className="px-4 pb-4">
                    {(() => {
                        const config = MATRIX_CONFIG[activeIntent] || MATRIX_CONFIG['#Routine'];

                        const charts = {
                            vo2max: (key) => <ChartErrorBoundary key={key}><VO2MaxTrend vo2Data={vo2Data} sessions={sessions} onClick={() => setSelectedMetric('vo2max')} /></ChartErrorBoundary>,
                            relativeEffort: (key) => <ChartErrorBoundary key={key}><RelativeEffortTrend sessions={sessions} trainingLoad={trainingLoad} onClick={() => setSelectedMetric('relativeEffort')} /></ChartErrorBoundary>,
                            fitnessFreshness: (key) => <ChartErrorBoundary key={key}><FitnessFreshnessChart trainingLoadData={trainingLoad} injuryRisk={injuryRisk} onClick={() => setSelectedMetric('fitnessFreshness')} /></ChartErrorBoundary>,
                            heartRate: (key) => <ChartErrorBoundary key={key}><HeartRateTrend sessions={sessions} onClick={() => setSelectedMetric('heartRate')} activeTag={activeIntent} /></ChartErrorBoundary>,
                            cadence: (key) => <ChartErrorBoundary key={key}><CadenceTrend sessions={sessions} onClick={() => setSelectedMetric('cadence')} /></ChartErrorBoundary>,
                            // ★ v2.4 LSD 長距離慢跑進展 —— 耐力天花板最好懂的指標
                            lsd: (key) => <ChartErrorBoundary key={key}><LSDTrend sessions={sessions} onClick={() => setSelectedMetric('lsd')} /></ChartErrorBoundary>,
                        };

                        // 依圖表登記表過濾：基本圖表一律顯示，進階圖表只給會員（且會員沒關掉時）
                        const visible = config.order.filter((k) => chartVis.visible(k));

                        // 每一區固定要出現的「非 MATRIX」卡片
                        const fixed = {
                            status: [
                                <ChartErrorBoundary key="coach">
                                    <AICoachCard
                                        trainingLoad={trainingLoad}
                                        injuryRisk={injuryRisk}
                                        onCalibrate={() => setShowCalibration(true)}
                                        onClick={() => setSelectedMetric('trainingFocus')}
                                    />
                                </ChartErrorBoundary>,
                                injuryRisk >= 70 ? (
                                    <motion.div
                                        key="risk"
                                        initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
                                        className="ti-r-md p-4 flex items-start gap-3"
                                        style={{
                                            background: 'linear-gradient(135deg, rgba(217,64,48,0.1), rgba(217,64,48,0.04))',
                                            border: '1px solid rgba(217,64,48,0.3)',
                                        }}
                                    >
                                        <div className="p-2 rounded-full shrink-0" style={{ background: 'rgba(217,64,48,0.14)' }}>
                                            <AlertTriangle style={{ color: C.coralDeep }} size={20} />
                                        </div>
                                        <div>
                                            <h4 className="font-black text-sm uppercase tracking-wide" style={{ color: C.coralDeep }}>受傷風險 · 高</h4>
                                            <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--ti-ink-soft)' }}>
                                                急性∕慢性訓練負荷比過高，跑量增加太快。請安排一天完全休息，或改為 Zone 1 恢復跑。
                                            </p>
                                        </div>
                                    </motion.div>
                                ) : null,
                            ],
                            volume: [
                                <ChartErrorBoundary key="accum">
                                    <WeeklyAccumCard accum={weeklyAccum} goalKm={planGoalKm} onStart={() => navigate('/cardio-tracker-mobile')} />
                                </ChartErrorBoundary>,
                                racePredictions ? (
                                    <ChartErrorBoundary key="race">
                                        <RacePredictionCard
                                            predictions={racePredictions}
                                            basis={raceBasis ? 'perf' : 'vo2'}
                                        />
                                    </ChartErrorBoundary>
                                ) : null,
                                <motion.button {...pressProps('row')}
 key="pr"
 onClick={() => navigate('/pr-profile')}
 className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl"
 style={{ background: 'rgba(22,20,21,0.04)', border: '1px solid rgba(22,20,21,0.08)' }}
 >
                                    <span className="flex items-center gap-2.5">
                                        <img src="/icon/goldicon.png" alt="PR" style={{ width: 18, height: 18, objectFit: 'contain' }} />
                                        <span className="text-[11px] font-black tracking-wide" style={{ color: '#161415' }}>我的 PR 檔案 · 各距離歷年變化</span>
                                    </span>
                                    <span className="text-[13px] font-black" style={{ color: 'rgba(22,20,21,0.35)' }}>→</span>
                                </motion.button>,
                            ],
                        };

                        const sections = TREND_SECTIONS.map((sec, si) => {
                            const secCharts = visible
                                .filter((k) => sec.keys.includes(k))
                                .map((k) => charts[k]?.(k))
                                .filter(Boolean);
                            const secFixed = (fixed[sec.id] || []).filter(Boolean);
                            const body = [...secFixed, ...secCharts];
                            if (body.length === 0) return null;

                            return (
                                <TrendSection key={sec.id} section={sec} index={si} count={body.length}>
                                    {body}
                                </TrendSection>
                            );
                        });
                        // 💳 免費版：進階圖表整張不畫，只在最後放一張會員卡（整頁只有這一張）
                        return chartVis.locked('跑步')
                            ? [...sections, <MemberLockCard key="lock" feature="advancedCharts" label="解鎖 VO₂max、體能與新鮮度" style={{ marginTop: 12 }} />]
                            : sections;
                    })()}
                </div>

                <MobileNavigation />
            </div>

            <AnimatePresence>
                <CalibrationSheet
                    isOpen={showCalibration}
                    onClose={() => setShowCalibration(false)}
                    userProfile={userProfile}
                    onSave={(newProfile) => {
                        setUserProfile(newProfile);
                        fetchData(newProfile);
                    }}
                />
            </AnimatePresence>
        </div >
    );
};

export default CardioTrendView;
