import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Area, AreaChart, CartesianGrid, ReferenceLine } from 'recharts';
import {
    motion,
    AnimatePresence,
    Reorder,
    useAnimationFrame,
    useMotionTemplate,
    useMotionValue,
    useTransform
} from 'framer-motion';
import { Search, Plus, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, X, Camera, Scan, Loader2, Flame, Droplets, Target, Activity, Utensils, Info, HelpCircle, CheckCircle2, Maximize2, Minimize2, MapPin, Zap, Brain, History, Languages, Clock, Trash2, RefreshCw, AlertCircle, BarChart2, Calendar, PieChart, Edit2, TrendingUp, Sparkles, Star, GripVertical, MoreHorizontal, Settings, Bookmark, Copy, Minus, Download } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import { GoalIcon, NutrientIcon } from '../utils/drvnIcons';
// import { Html5Qrcode } from 'html5-qrcode'; // Removed to reduce bundle size as requested
// import NutrientTimingCard from './NutrientTimingCard'; // Removed to avoid black screen issue
import NutritionAnalysis from './NutritionAnalysis';
import apiClient from '../api/client';
import { activateProgram, newProgramId, publishProgram, programRevision } from '../utils/trainingProgram';
import { useNavigate, useLocation } from 'react-router-dom';
import { updateChallengeProgress } from '../utils/challengeProgressHelper';
import ChallengeCompletionModal from './ChallengeCompletionModal';
import {
    ParticleBurst, LogSuccessFlash, MacroMilestoneToast,
    StreakWidget, FastingReminder,
    useMilestoneTracker, useLogFeedback, FloatingMacroChip
} from './NutritionGamification';
/* 🩹 calcTDEE / calcBMR_MifflinStJeor 在 3754 行有用到卻沒 import ——
   走到「重算每日目標」那條路就會 ReferenceError 整頁掛掉。 */
import { calculateFullNutrition, calcSmartBMR, getLatestInBody, calcTDEE, calcBMR_MifflinStJeor } from '../utils/NutritionEngine';
import { runDynamicTDEE } from '../utils/DynamicTDEEEngine';
import { getUserId, resolveDisplayName } from '../utils/auth';
import { biometricsGate } from '../utils/biometrics';
import { getTodayAgenda, loadStrengthInputs, loadCachedBricks, cacheWeekBricks, logicalDayKey } from '../utils/dailyAgenda';
import { nutritionStreakDays } from '../utils/widgetBridge';
import { recordAction, recordFirst } from '../utils/momentEngine';
import { uGet, uSet } from '../utils/userStorage';
import { useChartVisibility } from '../utils/advancedCharts';
import MemberLockCard from './MemberLockCard';
import { canUse } from '../utils/membership';
import { computeCutProgress, formatEta } from '../utils/cutProgress';
import { getPortions, defaultGrams } from '../utils/foodPortions';
import { prismPalette } from '../utils/prismGlass';
import { searchDishes, dishesForSlot, MEAL_SLOTS } from '../data/dishLibrary';
import { dishSearchFood, preferredSearchFoods, foodSearchSignature } from '../utils/nutritionFoodSearch';
import { buildMealPlan, SLOTS as MEAL_SLOT_DEFS } from '../utils/mealPlanBuilder';
import { buildCoachDigest, recentAvgIntake } from '../utils/nutritionCoach';
// 🎯 營養目標單一真相源 —— 纖維／水分目標只准從這裡出去（見 utils/nutritionTargets.js）
import { resolveWaterGoal, resolveFiberGoal, pctOf, MACRO_DEFS, committedNutritionGoals, macroGoalsForMode } from '../utils/nutritionTargets';
// 🎬 互動回饋預設 —— 按下去的手感收成一份規格（見 utils/nutritionMotion.jsx）
import { pressProps, PRESS_SPRING, riseIn } from '../utils/nutritionMotion';
import { haptic } from '../utils/haptics';
// 💡 首次操作教學 —— 全 App 都有，唯獨最複雜的飲食頁沒掛（8000+ 行、三個分頁）
import FirstTimeHint from './FirstTimeHint';
import { stepIssue as wizardStepIssue, unlockedSteps } from '../utils/planWizardGuards';
import { buildCycleRecap, archiveCycle, readCycleHistory } from '../utils/planCycleRecap';
import { buildCycleState } from '../utils/nutritionCycle';
import NutritionCheckpointSheet, { readFoodGuidance } from './NutritionCheckpointSheet';
import { checkpointDue, readCheckpointStore, rebalanceToKcal } from '../utils/nutritionCheckpoint';
import { quickAddSuggestions } from '../utils/foodGuidance';
// 今日預估目標＋三條會被訓練量校準的預估曲線（見 utils/nutritionProjection.js）
import { buildProjection } from '../utils/nutritionProjection';
// 每一樣食物的圖示（emoji 或自己拍的照片）—— 全站從這裡讀，換一次到處都換
import { readFoodIcons, setFoodIcon, resolveFoodIcon, FOOD_EMOJIS, compressImageToDataUrl } from '../utils/foodIcons';
import { RevealCard, GhostLine, GhostBlock } from './FashionReveal';
// 🟢 P2-4: 純函式 / 設計常數抽離至獨立模組（不改 render 行為，僅降低本檔體積）
import {
    containsChinese, PLAN_META, GOAL_THEME, getFoodSourceInfo, triggerHaptic, processFoodName,
    C, TEXTURES, GLASS_INPUT,
} from '../utils/nutritionHelpers';
import { toast, confirmDialog } from '../utils/toast';

/* ─────────────────────────────────────────────────────────────
   📿 StepCounterRing — AP 鐘錶風 外框 + 步數數字
   ─────────────────────────────────────────────────────────────
   • 外圈：細刻度 + 雙環（仿 Audemars Piguet 鐘面的極簡 bezel）
   • 中心：當日步數（千位分隔），下方一行 "STEPS"
   • 數據來源：
       1. iOS WebView：window.webkit.messageHandlers.fitnessApp.postMessage({type:'getSteps'})
          → Swift HealthKitManager.getTodaySteps() → sendToJS('stepsResult', {steps})
          → window.nativeBridge.onNativeEvent(jsonStr) → 此元件監聽
       2. 非 iOS：靜默不顯示（不會去要 HealthKit）
   • 自動更新：每 60 秒拉一次
*/
const StepCounterRing = React.memo(function StepCounterRing() {
    const [steps, setSteps] = useState(null);   // null = 還沒拿到，不顯示
    const lastFetchRef = useRef(0);

    // 嘗試發 request 給 native（只有在 iOS WebView 內才有效）
    const requestSteps = () => {
        try {
            const bridge = window?.webkit?.messageHandlers?.fitnessApp;
            if (bridge) {
                bridge.postMessage({ type: 'getSteps' });
                lastFetchRef.current = Date.now();
            }
        } catch (_) { /* 非 iOS, ignore */ }
    };

    useEffect(() => {
        // ── 監聽 native 回傳 ───────────────────────────────────
        const prev = window.nativeBridge?.onNativeEvent;
        if (!window.nativeBridge) window.nativeBridge = {};
        window.nativeBridge.onNativeEvent = (jsonStr) => {
            if (prev) { try { prev(jsonStr); } catch (_) { } }
            try {
                const evt = JSON.parse(jsonStr);
                if (evt && evt.type === 'stepsResult') {
                    const n = parseInt(evt.steps ?? evt.data?.steps ?? 0, 10);
                    if (!isNaN(n)) setSteps(n);
                }
            } catch (_) { }
        };

        // ── 初次抓 + 每分鐘 refresh ─────────────────────────────
        requestSteps();
        const t = setInterval(requestSteps, 60_000);

        // ── App 從 background 回前景時立即重新抓 ────────────────
        const onVis = () => { if (!document.hidden) requestSteps(); };
        document.addEventListener('visibilitychange', onVis);

        return () => {
            clearInterval(t);
            document.removeEventListener('visibilitychange', onVis);
            if (window.nativeBridge) window.nativeBridge.onNativeEvent = prev;
        };
    }, []);

    // 非 iOS 環境（沒拿到任何資料）→ 不顯示，避免占空間
    if (steps === null) return null;

    const formatted = steps.toLocaleString('en-US');
    const displayValue = steps >= 1000 ? `${(steps / 1000).toFixed(1)}k` : steps;

    return (
        <div
            aria-label={`今日步數 ${formatted}`}
            style={{
                width: 64, height: 64,
                position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                userSelect: 'none',
            }}
        >
            <svg
                viewBox="0 0 64 64"
                width="64" height="64"
                style={{ position: 'absolute', inset: 0 }}
                aria-hidden="true"
            >
                {/* 12 neat dial tick marks mathematically rotated */}
                {Array.from({ length: 12 }).map((_, i) => {
                    const isMajor = i % 3 === 0;
                    return (
                        <line
                            key={i}
                            x1="32"
                            y1={isMajor ? "6" : "7.5"}
                            x2="32"
                            y2={isMajor ? "11" : "10"}
                            stroke={i === 7 ? "#F95C4B" : "#161415"}
                            strokeWidth={isMajor ? "1.8" : "1"}
                            strokeLinecap="round"
                            transform={`rotate(${i * 30} 32 32)`}
                        />
                    );
                })}
            </svg>

            {/* Center value: step count */}
            <div style={{ zIndex: 1, marginTop: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{
                    fontFamily: "'Tenor Sans', sans-serif",
                    fontSize: 11,
                    fontWeight: 800,
                    color: '#F95C4B',
                    letterSpacing: '-0.02em',
                    lineHeight: 1
                }}>
                    {displayValue}
                </span>
                <span style={{
                    fontSize: '5px',
                    fontWeight: 900,
                    color: '#161415',
                    opacity: 0.4,
                    letterSpacing: '0.05em',
                    marginTop: 1,
                    textTransform: 'uppercase'
                }}>
                    steps
                </span>
            </div>
        </div>
    );
});
import DataPulse from './ui/DataPulse';
import { toLocalDateKey, todayKey } from '../utils/localDate';

const FontStyle = () => (
    <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,200;0,300;0,400;0,500;0,600;0,700;0,800;1,200;1,300;1,400;1,500;1,600;1,700;1,800&family=Tenor+Sans&display=swap');
        * {
            font-family: 'Plus Jakarta Sans', sans-serif;
        }
        h1, h2, h3, h4, .brand-font {
            font-family: 'Tenor Sans', sans-serif !important;
        }
        /* 🔥 終極解法：強制手機瀏覽器接管圖表的上下滑動，不准 JS 攔截 */
        .recharts-wrapper, .recharts-surface {
            touch-action: pan-y !important;
        }
    `}</style>
);


// --- 內建 NutrientTimingCard 組件 (避免 Import 錯誤導致黑屏) ---


// [NEW] 語系偵測 Regex
// 🟢 P2-4: containsChinese / PLAN_META / getFoodSourceInfo / triggerHaptic /
//   processFoodName / C / TEXTURES / GLASS_INPUT 已抽至 ../utils/nutritionHelpers（見頂部 import）

// ── 藝術感數據飛行動畫組件 ──
const ArtisticSuccessOverlay = ({ data, onComplete }) => {
    useEffect(() => {
        // 🔥 精準對齊動畫時間軸的震動回饋 (Haptic Feedback)
        const timers = [
            // 0.2s: 中央打勾圖示彈出時 (中度震動)
            setTimeout(() => triggerHaptic('medium'), 200),
            // 0.6s: 卡路里起飛時 (輕微震動)
            setTimeout(() => triggerHaptic('light'), 600),
            // 0.7s: 蛋白質起飛時 (輕微震動)
            setTimeout(() => triggerHaptic('light'), 700),
            // 0.75s: 碳水起飛時 (輕微震動)
            setTimeout(() => triggerHaptic('light'), 750),
            // 0.8s: 脂肪起飛時 (輕微震動)
            setTimeout(() => triggerHaptic('light'), 800),
            // 2.4s: 動畫結束，清理組件
            setTimeout(onComplete, 2400)
        ];

        return () => timers.forEach(clearTimeout);
    }, [onComplete]);

    if (!data) return null;

    return (
        <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center">
            {/* 階段 1：中央極簡確認字卡 (顯示約 0.8 秒後縮小消失) */}
            <AnimatePresence>
                <motion.div
                    initial={{ scale: 0.8, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.5, opacity: 0, y: -50 }}
                    transition={{ type: "spring", damping: 20, stiffness: 200 }}
                    className="absolute flex flex-col items-center"
                >
                    <div
                        className="rounded-[28px] px-8 py-6 text-center"
                        style={{
                            background: 'rgba(255, 255, 255, 0.45)',
                            backdropFilter: 'blur(40px) saturate(2.0)',
                            WebkitBackdropFilter: 'blur(40px) saturate(2.0)',
                            borderTop: '1px solid rgba(255, 255, 255, 0.9)',
                            borderLeft: '1px solid rgba(255, 255, 255, 0.6)',
                            borderRight: '1px solid rgba(255, 255, 255, 0.3)',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.3)',
                            boxShadow: '0 24px 80px rgba(0, 0, 0, 0.15), inset 0 2px 4px rgba(255, 255, 255, 0.6)'
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.2, type: "spring" }}
                            className="w-12 h-12 bg-[#F95C4B] rounded-full flex items-center justify-center mx-auto mb-3 shadow-[0_0_20px_rgba(249,92,75,0.4)]"
                        >
                            <CheckCircle2 size={24} className="text-white" />
                        </motion.div>
                        <h3 className="text-xl font-black text-[#161415] tracking-tight">{data.name}</h3>
                        <p className="text-sm font-bold text-[#161415]/40 uppercase tracking-widest mt-1">已記錄</p>
                    </div>
                </motion.div>
            </AnimatePresence>

            {/* 階段 2：四大營養素分裂並「飛入」上方儀表板 */}
            {[
                { key: 'cal', val: `+${data.calories}`, color: '#F95C4B', delay: 0.6, endY: '-35dvh', endX: '0vw' },
                { key: 'pro', val: `${data.protein}P`, color: '#F95C4B', delay: 0.7, endY: '-15dvh', endX: '-25vw' },
                { key: 'carb', val: `${data.carbs}C`, color: '#D94030', delay: 0.75, endY: '-15dvh', endX: '0vw' },
                { key: 'fat', val: `${data.fats}F`, color: '#161415', delay: 0.8, endY: '-15dvh', endX: '25vw' },
            ].map((macro) => (
                <motion.div
                    key={macro.key}
                    initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
                    animate={{
                        opacity: [0, 1, 1, 0],
                        scale: [0, 1.2, 1, 0.5],
                        x: `calc(${macro.endX})`,
                        y: `calc(${macro.endY})`
                    }}
                    transition={{
                        delay: macro.delay,
                        duration: 1.2,
                        ease: [0.16, 1, 0.3, 1], // 優雅的減速貝茲曲線
                        times: [0, 0.2, 0.8, 1]
                    }}
                    className="absolute px-3 py-1.5 rounded-full text-white font-black text-xs shadow-lg"
                    style={{ backgroundColor: macro.color }}
                >
                    {macro.val}
                </motion.div>
            ))}
        </div>
    );
};

// ── 藝術級流體光條組件 (重製版：極簡純淨版) ──
/* 每一餐在弧線上的顏色。順序＝早、午、晚、點心。 */

/* 全螢幕彈層的層級。底部膠囊導覽列是 99999，彈層必須比它高，
   否則底下的按鈕會被導覽列壓住。跟 LegalSheet 同一個值。 */
const Z_SHEET = 300000;

/* 陽極處理鈦：金屬的明暗結構不動（暗邊 → 高光 → 中段 → 暗邊），
   只把中段染上那一餐的顏色。高光保持純白 —— 那道白才是「金屬」的來源，
   染到高光就會變成塑膠色塊。 */
const mixHex = (hex, to, amt) => {
    const h = String(hex).replace('#', '');
    const t = String(to).replace('#', '');
    const p = (v, i) => parseInt(v.slice(i * 2, i * 2 + 2), 16);
    const out = [0, 1, 2].map((i) => Math.round(p(h, i) + (p(t, i) - p(h, i)) * amt));
    return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('');
};
const anodizedStops = (color) => [
    ['0%', mixHex(color, '#161415', 0.52)],
    ['16%', mixHex(color, '#FFFFFF', 0.70)],
    ['34%', '#FFFFFF'],
    ['46%', mixHex(color, '#FFFFFF', 0.30)],
    ['66%', color],
    ['86%', mixHex(color, '#161415', 0.30)],
    ['100%', mixHex(color, '#161415', 0.50)],
];

const MathFluidArc = ({ pct, children, marks = [] }) => {
    const dashArray = 125.6;
    const targetOffset = Math.max(0, dashArray - (dashArray * (pct / 100)));

    /* 分餐刻度：半圓從 (10,50) 走到 (90,50)，圓心 (50,50)、半徑 40。
       走到 t（0–1）時角度 θ = π − tπ。刻度做成一根跨過軌道的金屬條，
       所以要的是「中心點 + 旋轉角」，不是兩個端點 —— 有寬度才吃得到拉絲漸層。 */
    const barAt = (t, r = 40) => {
        const th = Math.PI - Math.min(1, Math.max(0, t)) * Math.PI;
        return {
            cx: 50 + r * Math.cos(th),
            cy: 50 - r * Math.sin(th),
            deg: (Math.atan2(-Math.sin(th), Math.cos(th)) * 180) / Math.PI,
        };
    };


    return (
        <div className="relative w-full max-w-[280px] mx-auto mt-6 aspect-[2/1] flex flex-col items-center justify-end overflow-visible">

            <svg viewBox="0 0 100 55" className="absolute top-0 w-full h-full overflow-visible z-10">
                <defs>
                    {/* [NEW] Volumetric Metallic Gradient — mimics the conic lighting in Image 2 */}
                    <linearGradient id="brandFluidGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#161415" />
                        <stop offset="20%" stopColor="#4A4A4A" />
                        <stop offset="50%" stopColor="#FFFFFF" /> {/* High-contrast highlight */}
                        <stop offset="80%" stopColor="#262523" />
                        <stop offset="100%" stopColor="#161415" />
                    </linearGradient>

                    {/* 拉絲鈦金屬條：沿條的「短邊」打光 —— 暗邊 → 高光 → 暗邊，
                        跟 ti-surface-dark 同一組深鈦色，壓在亮面拉絲底板上才分得出來。
                        objectBoundingBox：每根條各自算自己的光，轉到哪個角度都一致。 */}
                    {/* 細刻度：中性鈦，不帶餐別顏色 —— 它們是尺，不是資料 */}
                    <linearGradient id="tiMinor" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
                        <stop offset="0%" stopColor="#6E6862" />
                        <stop offset="28%" stopColor="#FFFFFF" />
                        <stop offset="60%" stopColor="#CFC6B8" />
                        <stop offset="100%" stopColor="#5E594F" />
                    </linearGradient>


                    {/* Progress Sheen — Vibrant but with metallic depth */}
                    <linearGradient id="progressMetallic" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#FF2D55" />
                        <stop offset="50%" stopColor="#FFCC00" />
                        <stop offset="100%" stopColor="#FF9500" />
                    </linearGradient>
                </defs>

                {/* 疊層 1：金屬實體軌道 (Solid Titanium Track) */}
                <path
                    d="M 10 50 A 40 40 0 0 1 90 50"
                    fill="none"
                    stroke="url(#brandFluidGradient)"
                    strokeWidth="9"
                    strokeLinecap="round"
                    style={{ opacity: 0.12 }}
                />

                {/* 內側細節高光 */}
                <path
                    d="M 14.5 50 A 35.5 35.5 0 0 1 85.5 50"
                    fill="none"
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth="0.5"
                    strokeLinecap="round"
                />

                {/* 疊層 2：進度扇形 (Anodized Progress) */}
                <motion.path
                    d="M 10 50 A 40 40 0 0 1 90 50"
                    fill="none"
                    stroke="url(#progressMetallic)"
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeDasharray={dashArray}
                    initial={{ strokeDashoffset: dashArray }}
                    animate={{ strokeDashoffset: targetOffset }}
                    transition={{ duration: 1.5, ease: "circOut" }}
                />

                {/* 僅保留三餐累積目標位置：沿半圓徑向的細鈦金屬刻度。 */}
                {marks.map((m) => {
                    const b = barAt(m.pct / 100);
                    return (
                        <g key={m.id} transform={`translate(${b.cx} ${b.cy}) rotate(${b.deg})`}>
                            <rect x={-5.4} y={-0.425} width={10.8} height={0.85}
                                fill={m.color} stroke="#161415" strokeWidth={0.08} />
                        </g>
                    );
                })}
            </svg>

            {/* 核心數據區塊 */}
            <div className="text-center relative z-20 translate-y-3">
                {children}
            </div>
        </div>
    );
};

// --- Predictive Chart Helpers (Data-Agnostic Dots) ---
const WeightCurveDot = (props) => {
    const { cx, cy, index, payload, labelEvery, totalPts } = props;
    if (!payload) return null;
    const showLabel = index % (labelEvery || 3) === 0 || index === (totalPts || 26);
    if (!showLabel) return null;
    return (
        <g key={`wcd-${index}`}>
            <circle cx={cx} cy={cy} r={2.5} fill="rgba(22,20,21,0.15)" />
            <text x={cx} y={cy - 9} textAnchor="middle" fill="rgba(22,20,21,0.35)" fontSize={11} fontWeight="700">{payload.target}kg</text>
        </g>
    );
};
const BFCurveDot = (props) => {
    const { cx, cy, index, payload, labelEvery, totalPts } = props;
    if (!payload) return null;
    const showLabel = index % (labelEvery || 3) === 0 || index === (totalPts || 26);
    if (!showLabel) return null;
    return (
        <g key={`bfcd-${index}`}>
            <circle cx={cx} cy={cy} r={2.5} fill="rgba(22,20,21,0.22)" />
            <text x={cx} y={cy - 9} textAnchor="middle" fill="rgba(22,20,21,0.55)" fontSize={11} fontWeight="700">{payload.targetBF}%</text>
        </g>
    );
};
const SMMCurveDot = (props) => {
    const { cx, cy, index, payload, labelEvery, totalPts } = props;
    if (!payload) return null;
    const showLabel = index % (labelEvery || 3) === 0 || index === (totalPts || 26);
    if (!showLabel) return null;
    return (
        <g key={`smmcd-${index}`}>
            <circle cx={cx} cy={cy} r={2.5} fill="rgba(22,20,21,0.22)" />
            <text x={cx} y={cy - 9} textAnchor="middle" fill="rgba(22,20,21,0.55)" fontSize={11} fontWeight="700">{payload.targetSMM}kg</text>
        </g>
    );
};
const ActualWeightDot = (props) => {
    const { cx, cy, index, payload, stroke: lineStroke } = props;
    if (!payload || payload.actual === undefined) return null;
    const isMock = payload.isMock;
    const color = lineStroke || (isMock ? 'rgba(249,92,75,0.45)' : '#F95C4B');
    return (
        <g key={`awd-${index}`}>
            <circle cx={cx} cy={cy} r={5} fill={color} stroke="#fff" strokeWidth={2} strokeDasharray={isMock ? '2 1' : 'none'} />
            <text x={cx} y={cy - 13} textAnchor="middle" fill={color} fontSize={11} fontWeight="900">{payload.actual}kg</text>
        </g>
    );
};
const ActualBFDot = (props) => {
    const { cx, cy, index, payload, stroke: lineStroke } = props;
    if (!payload || payload.actualBF === undefined) return null;
    const isMock = payload.isMock;
    const color = lineStroke || (isMock ? 'rgba(59,130,246,0.30)' : '#8B9DAB');
    return (
        <g key={`abfd-${index}`}>
            <circle cx={cx} cy={cy} r={5} fill={color} stroke="#fff" strokeWidth={2} strokeDasharray={isMock ? '2 1' : 'none'} />
            <text x={cx} y={cy - 13} textAnchor="middle" fill={color} fontSize={11} fontWeight="900">{payload.actualBF}%</text>
        </g>
    );
};
const ActualSMMDot = (props) => {
    const { cx, cy, index, payload, stroke: lineStroke } = props;
    if (!payload || payload.actualSMM === undefined) return null;
    const isMock = payload.isMock;
    const color = lineStroke || (isMock ? 'rgba(22,20,21,0.25)' : '#161415');
    return (
        <g key={`asmmd-${index}`}>
            <circle cx={cx} cy={cy} r={5} fill={color} stroke="#fff" strokeWidth={2} strokeDasharray={isMock ? '2 1' : 'none'} />
            <text x={cx} y={cy - 13} textAnchor="middle" fill={color} fontSize={11} fontWeight="900">{payload.actualSMM}kg</text>
        </g>
    );
};

// ✅ 貼到檔案上方（全域層級）
const CustomTooltip = ({ active, payload, label, unit = '', actualColor = '#161415', targetKey = 'target', hasInBody }) => {
    if (active && payload && payload.length) {
        return (
            <div style={{ background: '#161415', borderRadius: 12, padding: '10px 14px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 30px rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)' }}>
                <p style={{ fontSize: 9, fontWeight: 900, color: 'rgba(255,255,255,0.4)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {payload.map((item, idx) => {
                        const isTarget = item.dataKey === targetKey;
                        const labelText = isTarget ? '目標' : (hasInBody ? '實測' : '模擬');
                        const valColor = isTarget ? 'rgba(255,255,255,0.55)' : actualColor;
                        return (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'center' }}>
                                <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.7)' }}>{labelText}</span>
                                <span style={{ fontSize: 12, fontWeight: 900, color: valColor, tabularNums: true }}>{item.value}<span style={{ fontSize: 11, opacity: 0.6, marginLeft: 1 }}>{unit}</span></span>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }
    return null;
};

// --- BodyRecompPlanner v2.0 — Goal-Oriented Nutrition Command Centre ---
// 🚀 React.memo：BodyRecompPlanner 內含 5 個 useMemo 的重量級圖表計算。
//   父層 NutritionPageMobile 有 76 個 useState，任一變動都會 re-render；
//   未 memo 前此重組件每次都跟著重算圖表。memo 後只在自身 props 真變時渲染。
/**
 * 餐盤配置：一餐的熱量怎麼分成蛋白質／主食／油脂。
 * 用圓環而不是長條 —— 使用者腦中的參照物是一個盤子，不是一條進度條。
 * 角度是用熱量算出來的（P4／C4／F9），不是隨手畫的裝飾。
 */
/* ⚠️ 這裡原本是 { protein:'#F95C4B', carbs:'#CFC6B8', fats:'#D4C5A5' } ——
   碳水 #CFC6B8 與脂肪 #D4C5A5 是兩個幾乎一樣的米色，圓環上根本分不出來。
   而且 Hero 環用的是另一組顏色（MACRO_DEFS），同一個東西兩套定義。
   統一讀 utils/nutritionTargets 的 MACRO_DEFS：珊瑚／墨黑／米色，三個一眼可分。 */
const MACRO_COLORS = Object.fromEntries(MACRO_DEFS.map(m => [m.key, m.color]));

/* ⚠️ 目標體重的預設值只在「點選目標類型」時才會算，
   但 seedGoalType（從完整計劃引導頁帶進來）不會經過那個 onClick ——
   結果是目標類型變成「增重」、目標體重卻還停在預設的「現在 −5 公斤」，
   畫面上就出現「增重 · 70KG → 65KG」這種自相矛盾的計劃。
   把推導抽出來共用，並在下面用 effect 補上 seed 那條路。 */
export const defaultTargetsFor = (goalType, { currentWeight = 70, ibWeight = null, ibLBM = null, ibBF = null, gender = 'male' } = {}) => {
    const base = ibWeight || currentWeight;
    if (goalType === 'bulk') {
        const tbf = gender === 'female' ? 26 : 15;
        return {
            targetWeight: parseFloat((base + 4).toFixed(1)),
            targetBodyFat: ibBF !== null ? parseFloat((ibBF + 1.5).toFixed(1)) : tbf,
        };
    }
    const tbf = goalType === 'cut' ? (gender === 'female' ? 22 : 12) : (gender === 'female' ? 24 : 14);
    return {
        targetWeight: ibLBM !== null
            ? parseFloat((ibLBM / (1 - tbf / 100)).toFixed(1))
            : parseFloat(Math.max(30, currentWeight - 5).toFixed(1)),
        targetBodyFat: tbf,
    };
};

/** 目標體重站在對的那一邊嗎（增重要比現在重、減脂要比現在輕）。 */
export const targetMatchesGoal = (goalType, currentWeight, targetWeight) => {
    if (!(currentWeight > 0) || !(targetWeight > 0)) return false;
    if (goalType === 'bulk') return targetWeight > currentWeight + 0.2;
    if (goalType === 'cut') return targetWeight < currentWeight - 0.2;
    return true;   // recomp：體重維持，兩邊都可以
};

/* 餐段配色 —— 早／午／晚／點心各自一個色。
   原本四段全部用同一個珊瑚色，捲下去就分不出現在在哪一餐。
   色相依「一天的光線」排：早上暖黃 → 中午珊瑚 → 傍晚紫紅 → 點心薄荷。 */
const SLOT_COLORS = { breakfast: '#E8A33D', lunch: '#F95C4B', dinner: '#B5548C', snacks: '#4FA88B' };
const slotColor = (key) => SLOT_COLORS[key] || '#F95C4B';
const MacroPlate = ({ segments = [], size = 68, stroke = 13 }) => {
    if (!segments.length) return null;
    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;
    const arcs = segments.reduce((acc, sg) => {
        const len = (Math.max(0, sg.pct) / 100) * circ;
        acc.list.push({ key: sg.key, len, offset: acc.used });
        return { list: acc.list, used: acc.used + len };
    }, { list: [], used: 0 }).list;
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0, display: 'block' }} aria-hidden="true">
            <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(22,20,21,0.06)" strokeWidth={stroke} />
                {arcs.map((a) => (
                    <circle
                        key={a.key}
                        cx={size / 2} cy={size / 2} r={r} fill="none"
                        stroke={MACRO_COLORS[a.key] || '#CFC6B8'}
                        strokeWidth={stroke}
                        strokeDasharray={`${a.len} ${circ - a.len}`}
                        strokeDashoffset={-a.offset}
                    />
                ))}
            </g>
        </svg>
    );
};

const BodyRecompPlanner = React.memo(({ isOpen, onClose, currentWeight, profile = {}, tdee, dynamicTDEEActive = false, onSave, userId, activityBurn = 0, workoutData = {}, history = [], seedGoalType = null, openEditing = false }) => {
    const navigate = useNavigate();

    // ── Persisted plan state ──────────────────────────────────────────────
    const STORAGE_KEY = `drvn_nutrition_plan_${userId || 'guest'}`;
    const loadSaved = () => {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
    };

    const saved = loadSaved();
    // 🎯 seedGoalType：從「完整計劃」引導頁帶進來的處方（依訓練重點＋最新體組成算出）。
    //    只有走那條路進來才會有值，所以它代表使用者剛剛的明確選擇 → 優先於舊存檔。
    const [goalType, setGoalType] = useState(() => seedGoalType || loadSaved().goalType || 'cut');
    useEffect(() => {
        if (seedGoalType) setGoalType(seedGoalType);
    }, [seedGoalType]);

    /* 目標體重必須站在對的那一邊：增重要比現在重、減脂要比現在輕。
       之前只有「點選目標類型」那條路會修正 —— 從引導頁帶 seedGoalType
       進來的不會，於是出現「增重 · 70KG → 65KG」這種自打嘴巴的計劃。
       這裡補上：方向錯了就用該類型的預設值重算，方向對就不動使用者調過的數字。 */
    useEffect(() => {
        if (targetMatchesGoal(goalType, currentWeight, targetWeight)) return;
        const t = defaultTargetsFor(goalType, { currentWeight, ibWeight, ibLBM, ibBF, gender });
        setTargetWeight(t.targetWeight);
        setTargetBodyFat((prev) => (prev == null ? t.targetBodyFat : prev));
    }, [goalType, currentWeight]);   // eslint-disable-line react-hooks/exhaustive-deps
    const [targetWeight, setTargetWeight] = useState(() => loadSaved().targetWeight ?? (currentWeight > 5 ? currentWeight - 5 : currentWeight));
    const [targetBodyFat, setTargetBodyFat] = useState(() => loadSaved().targetBodyFat ?? null);
    const [pace, setPace] = useState(() => loadSaved().pace ?? 0.5);
    const [committedAt] = useState(() => loadSaved().committedAt || null);
    // Goal date — manual override or computed from pace
    const [useManualDate, setUseManualDate] = useState(() => loadSaved().useManualDate || false);
    const [manualGoalDate, setManualGoalDate] = useState(() => loadSaved().manualGoalDate || '');
    const [isEditing, setIsEditing] = useState(() => loadSaved().committedAt ? false : true);
    const commitInFlight = useRef(false);
    const pendingCommit = useRef(null);
    const [savingPlan, setSavingPlan] = useState(false);
    /* 🪜 逐步解鎖：第一步先亮，做完才開下一步 —— 讓使用者知道自己走到哪、還剩什麼。
       已經存過計劃的人（committedAt 有值）直接全開，不用再走一次。 */
    const [stepDone, setStepDone] = useState(() => {
        const done = !!loadSaved().committedAt;
        return { mode: done, target: done, pace: done };
    });
    const markStep = (k) => setStepDone((t) => (t[k] ? t : { ...t, [k]: true }));

    /* 🧭 副標要回答「我現在在哪」。原本不論檢視或編輯，標題下面都寫
       「四個步驟：選類型 → 設數字 → 選速度 → 確認日期」，
       但檢視模式畫面上根本沒有那四步，使用者只能自己找哪張卡對應哪一步。 */
    /* 動效語彙（沿用 design system 的 house easing）：
       入場 0.42s、位移 ≤14px、一次只有一個主角在動；列表 stagger 70ms 封頂。 */
    /* 瑞士排版共用：kicker（小而寬的部門標）與髮絲線（用線分隔，不用巢狀方框） */
    const K = { fontSize: 12, fontWeight: 900, letterSpacing: '0.24em', color: 'rgba(22,20,21,0.38)', marginBottom: 6 };
    const RULE = '1px solid rgba(207,198,184,0.7)';
    const EASE = [0.16, 1, 0.3, 1];
    const stepAnim = {
        initial: { opacity: 0, y: 14 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -10 },
        transition: { duration: 0.42, ease: EASE },
    };
    const rise = (i = 0) => ({
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.5, ease: EASE, delay: Math.min(i, 6) * 0.07 },
    });

    const STEP_LABELS = ['目標類型', '目標數字', '達標速度', '常吃什麼', '計劃總覽'];

    /* 🪜 一次只走一步（與健身、跑步的計劃精靈同一種節奏）。
       原本四個步驟全部攤在同一頁往下捲，使用者要自己判斷「我現在在哪、還剩什麼」。 */
    const [wizardStep, setWizardStep] = useState(0);

    /* 🍜 飲食偏好：讓使用者先挑幾樣「我平常就吃這個」，
       建議才會是他的菜單，而不是一份漂亮但他不會照做的範本。
       存在本機（跟著 user），承諾計劃時一併寫進 plan。 */
    const PREF_KEY = `nutrition_food_prefs_${userId || 'guest'}`;
    const EMPTY_PREFS = { breakfast: [], lunch: [], dinner: [], snack: [] };
    const [foodPrefs, setFoodPrefs] = useState(() => {
        try {
            const v = JSON.parse(localStorage.getItem(PREF_KEY) || 'null');
            if (Array.isArray(v)) return { ...EMPTY_PREFS, lunch: v };   // 舊格式（不分餐）沿用
            return v && typeof v === 'object' ? { ...EMPTY_PREFS, ...v } : { ...EMPTY_PREFS };
        } catch { return { ...EMPTY_PREFS }; }
    });
    const [prefQuery, setPrefQuery] = useState('');
    /* 從食物庫挑某一餐 —— 上面那個搜尋框只搜「這一頁的預設清單」，
       食物庫裡其他東西進不來。這個 sheet 搜的是完整食物庫，
       選完直接寫進該餐段的偏好並關閉，回到常吃什麼那一頁。 */
    const [librarySlot, setLibrarySlot] = useState(null);
    const [libraryQuery, setLibraryQuery] = useState('');
    const openLibraryForSlot = (slotKey) => { setLibraryQuery(''); setLibrarySlot(slotKey); };
    const prefCount = Object.values(foodPrefs).reduce((a, v) => a + (v?.length || 0), 0);
    const togglePref = (slotKey, id) => {
        setFoodPrefs((prev) => {
            const cur = prev[slotKey] || [];
            const next = {
                ...prev,
                [slotKey]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(0, 4),
            };
            try { localStorage.setItem(PREF_KEY, JSON.stringify(next)); } catch { /* 隱私模式寫不進去就算了 */ }
            return next;
        });
    };

    // 🔥 確保每次打開視窗時，只要有存檔過，就強制回到「鈦金屬質感檢視模式」
    useEffect(() => {
        if (isOpen) {
            const currentSaved = loadSaved();
            // openEditing：從教練卡「調整計劃」進來 → 直接進精靈，不用再找編輯按鈕
            setIsEditing(currentSaved.committedAt && !openEditing ? false : true);
            setWizardStep(0);
        }
    }, [isOpen]);   // eslint-disable-line react-hooks/exhaustive-deps

    // [NEW] 點擊展開邏輯狀態
    const [isMacrosExpanded, setIsMacrosExpanded] = useState(true);   // 三大營養素是這張卡的一半，不該藏著
    const [isInBodyExpanded, setIsInBodyExpanded] = useState(false);
    const [showBurnRefPopup, setShowBurnRefPopup] = useState(false);

    // ── InBody Data (reloads every time planner opens) ───────────
    // 🔥 FIX: Fetch from backend API + merge with localStorage (matches BodyAnalysisViewMobile)
    // Previously only read localStorage, so records only in backend were invisible here.
    const [_inBodyRecords, _setInBodyRecords] = useState([]);

    useEffect(() => {
        if (!userId || !isOpen) return;

        const normalizeRecord = (r) => {
            const n = { ...r };
            if (!n.measurement_date && n.date) n.measurement_date = n.date;
            if (n.weight !== undefined && n.weight_kg === undefined) n.weight_kg = n.weight;
            if (n.body_fat_percentage !== undefined && n.body_fat_percent === undefined) n.body_fat_percent = n.body_fat_percentage;
            if (n.muscle_mass !== undefined && n.skeletal_muscle_mass === undefined) n.skeletal_muscle_mass = n.muscle_mass;
            // 🔗 跨系統同步修正：預測曲線讀 .smm，但紀錄存的是 skeletal_muscle_mass —
            //    缺這條別名會讓營養預測退回「性別估算值」，與健身預測（讀真實 InBody）不同步。
            if (n.smm === undefined && n.skeletal_muscle_mass !== undefined) n.smm = n.skeletal_muscle_mass;
            if (n.skeletal_muscle_mass === undefined && n.smm !== undefined) n.skeletal_muscle_mass = n.smm;
            return n;
        };

        // 1. Read local records immediately
        let localRecords = [];
        try { localRecords = JSON.parse(localStorage.getItem(`inbody_local_${userId}`) || '[]'); } catch { }

        // Set local data first for instant rendering
        if (localRecords.length > 0) {
            _setInBodyRecords(localRecords.map(normalizeRecord).sort((a, b) =>
                new Date(b.measurement_date || b.date) - new Date(a.measurement_date || a.date)
            ));
        }

        // 2. Fetch from backend and merge (same pattern as BodyAnalysisViewMobile.fetchInBodyHistory)
        (async () => {
            try {
                // ⚠️ 這裡原本寫死 http://<hostname>:8000 —— 那是開發機的位址，
                //    手機上（drvn://app）永遠連不到，等於「只有這支手機量的才看得到」。
                //    改用 apiClient，跟其他 API 走同一條路（正式環境自動指向 Railway）。
                const response = await apiClient.get(`/api/user/inbody-history/${userId}?limit=20`);
                const data = response?.data || {};
                const backendHistory = data.history || [];

                if (backendHistory.length > 0) {
                    // Merge: backend wins for duplicates, keep local-only records
                    const backendIds = new Set(backendHistory.map(r => r.record_id));
                    const localOnly = localRecords.filter(r => !backendIds.has(r.record_id));
                    const merged = [...localOnly, ...backendHistory]
                        .map(normalizeRecord)
                        .sort((a, b) => new Date(b.measurement_date || b.date) - new Date(a.measurement_date || a.date));

                    _setInBodyRecords(merged);

                    // 🔥 Sync merged data back to localStorage so future opens are instant
                    try { localStorage.setItem(`inbody_local_${userId}`, JSON.stringify(merged.slice(0, 50))); } catch { }
                } else if (localRecords.length === 0) {
                    _setInBodyRecords([]);
                }
            } catch {
                // Backend offline — local data (already set above) is the fallback
                console.warn('[BodyRecompPlanner] Backend offline, using local InBody data');
            }
        })();
    }, [userId, isOpen]);

    const latestInBody = _inBodyRecords.length > 0 ? _inBodyRecords[0] : null;

    const hasInBody = !!latestInBody;
    // hasRecentInBody = has InBody data from within the past 7 days
    const hasRecentInBody = useMemo(() => {
        if (!latestInBody) return false;
        try {
            const recordDate = new Date(latestInBody.measurement_date || latestInBody.date);
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            return recordDate >= sevenDaysAgo;
        } catch { return false; }
    }, [latestInBody]);

    const ibWeight = latestInBody?.weight_kg || currentWeight;
    const ibBF = latestInBody?.body_fat_percent || null;
    const ibLBM = ibBF !== null ? parseFloat((ibWeight * (1 - ibBF / 100)).toFixed(1)) : null;
    const ibFatMass = ibBF !== null ? parseFloat((ibWeight * ibBF / 100).toFixed(1)) : null;
    // 不知道性別就是 null —— 男女的體脂門檻差很多，猜錯等於給錯建議
    const gender = ['male', 'female'].includes(String(latestInBody?.gender || profile?.gender).toLowerCase())
        ? String(latestInBody?.gender || profile?.gender).toLowerCase() : null;

    // ── Recommendation Engine (based on InBody body fat %) ───────────────
    const BF_THRESHOLDS = gender === 'female'
        ? { cutMin: 32, recompMin: 25 }  // female
        : { cutMin: 25, recompMin: 18 }; // male
    const recommendedGoalType = ibBF === null ? 'cut'
        : ibBF >= BF_THRESHOLDS.cutMin ? 'cut'
            : ibBF >= BF_THRESHOLDS.recompMin ? 'recomp'
                : 'bulk';

    // Recommended target BF% (healthy range)
    const recTargetBF = gender === 'female'
        ? (goalType === 'cut' ? 22 : goalType === 'bulk' ? 26 : 24)
        : (goalType === 'cut' ? 12 : goalType === 'bulk' ? 15 : 14);
    // Recommended target weight = LBM / (1 - recTargetBF/100)
    const recTargetWeight = ibLBM !== null
        ? parseFloat((ibLBM / (1 - recTargetBF / 100)).toFixed(1))
        : (goalType === 'bulk' ? currentWeight + 4 : currentWeight - 5);

    // ── Science Engine ────────────────────────────────────────────────────
    const PACE_CONFIG = {
        cut: [{ label: '慢', val: 0.25, desc: '每週 −0.25 kg' }, { label: '標準', val: 0.5, desc: '每週 −0.5 kg' }, { label: '快', val: 0.8, desc: '每週 −0.8 kg' }],
        recomp: [{ label: '慢', val: 0.1, desc: '每週 0.1 kg' }, { label: '標準', val: 0.2, desc: '每週 0.2 kg' }, { label: '快', val: 0.35, desc: '每週 0.35 kg' }],
        // ⚠️ 熱量只能決定「體重往哪個方向走多快」，不能保證長出來的是肌肉。
        //    沒有重訓的熱量盈餘只會變脂肪，所以這裡不用「精實增肌」這種承諾式標籤。
        bulk: [{ label: '慢', val: 0.2, desc: '每週 +0.2 kg' }, { label: '標準', val: 0.35, desc: '每週 +0.35 kg' }, { label: '快', val: 0.6, desc: '每週 +0.6 kg' }],
    };

    // 目標識別（顏色／文字／icon）統一由 utils/nutritionHelpers 的 GOAL_THEME 提供，
    // 精靈與總覽頁不再各寫一份 —— 同一份計劃兩處顏色不同是最基本的不一致。
    const GOAL_META = GOAL_THEME;
    const meta = GOAL_META[goalType];

    /* 名字用 auth.resolveDisplayName —— 跟首頁與個人頁同一支。
       profile.name 來自 App.jsx 的全域狀態，可能是別人的資料（見 ActionFirstDashboard 的註記）。 */
    const planOwnerName = useMemo(() => {
        try {
            const n = resolveDisplayName(userId, profile?.name);
            return n && !/^訓練者\s*#/.test(n) ? n : '';   // 沒有真名就不硬掛一個代號
        } catch { return ''; }
    }, [userId, profile]);

    const weightDiff = Math.abs(ibWeight - targetWeight);
    const bfDiff = ibBF !== null ? Math.abs(ibBF - targetBodyFat) : 0;
    const weeklyChange = goalType === 'bulk' ? pace : -pace;
    const weeksToGoal = (pace > 0 && weightDiff > 0) ? (weightDiff / pace) : 0;
    const dailyDeficit = pace > 0 ? Math.round((pace * 7700) / 7) : 0;

    // Goal date: manual override OR computed from pace
    const computedTargetDate = new Date();
    computedTargetDate.setDate(computedTargetDate.getDate() + Math.max(1, Math.round(weeksToGoal * 7)));
    const effectiveGoalDate = useManualDate && manualGoalDate
        ? new Date(manualGoalDate)
        : computedTargetDate;
    const formattedDate = effectiveGoalDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const actualWeeksToGoal = useManualDate && manualGoalDate
        ? Math.max(0, (new Date(manualGoalDate) - new Date()) / (7 * 86400000))
        : weeksToGoal;

    // Per-velocity projected dates (for recommendation display)
    const previewWeightDiff = weightDiff > 0 ? weightDiff : (goalType === 'recomp' ? 2 : 5);
    const paceWithDates = PACE_CONFIG[goalType].map(p => {
        const d = new Date();
        d.setDate(d.getDate() + Math.round((previewWeightDiff / p.val) * 7));
        return { ...p, projectedDate: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) };
    });

    // ── Nutrition Formula Engine ──────────────────────────────────────────
    // TDEE source priority:
    //   1. Dynamic TDEE   — energy-balance method (MacroFactor): TDEE = avg_intake − Δweight×7700
    //                       (passed as `tdee` prop when dynamicTDEEActive=true)
    //   2. Katch-McArdle  — BMR = 370 + 21.6 × LBM(kg)  [best static formula when InBody exists]
    //   3. Mifflin-St Jeor— BMR = 10W + 6.25H − 5A + 5  [profile-only fallback]
    //   TDEE = BMR × 1.55 (moderately active)
    //
    // Deficit/Surplus:  1 kg fat = 7,700 kcal → daily Δ = pace × 7700 / 7
    // Protein: 2.2 g/kg (cut) · 2.0 g/kg (recomp) · 1.8 g/kg (bulk)
    // Fat:     0.8 g/kg (cut) · 1.0 g/kg (others)
    // Carbs:   (Total kcal − P×4 − F×9) ÷ 4  (remainder)
    const _calcLBM = ibLBM ?? parseFloat((currentWeight * 0.80).toFixed(1));
    // 🔴 Fix: Mifflin-St Jeor 原本寫死 170cm/25歲/男性 — 改讀真實 profile
    //   （女性常數 −161；身高年齡缺失才退回預設），BMR 誤差可差 ±200+ kcal
    const _pf = (() => { try { return { ...(JSON.parse(localStorage.getItem(`userProfile_${userId}`)) || {}), ...profile }; } catch { return profile; } })();
    const needsProfileData = !hasInBody && !(Number(_pf.height || _pf.height_cm) > 0 && Number(_pf.age) >= 18 && ['male', 'female'].includes(_pf.gender));
    /* 沒填就是 null。上面的 needsProfileData 已經在判斷「資料夠不夠」，
       這裡再用 170／25 頂上去，等於那個旗標永遠沒有意義。 */
    const _heightCm = Number(parseFloat(_pf.height || _pf.height_cm)) > 0
        ? parseFloat(_pf.height || _pf.height_cm) : null;
    const _ageYr = Number(parseInt(_pf.age)) > 0 ? parseInt(_pf.age) : null;
    const _isFemale = gender === 'female' || _pf.gender === 'female';
    const _intrinsicBMR = ibBF !== null
        ? Math.round(370 + 21.6 * _calcLBM)                               // Katch-McArdle (InBody)
        : Math.round(10 * currentWeight + 6.25 * _heightCm - 5 * _ageYr + (_isFemale ? -161 : 5)); // Mifflin-St Jeor
    const _intrinsicTDEE = Math.round(_intrinsicBMR * 1.55);
    // Use Dynamic TDEE first (most accurate), then static formula, then hard fallback
    const baseTDEE = (tdee && tdee > 1000) ? tdee : _intrinsicTDEE;
    const _tdeeSource = dynamicTDEEActive ? 'Dynamic TDEE'
        : ibBF !== null ? 'Katch-McArdle'
            : 'Mifflin-St Jeor';
    // 最近實際吃多少（有記錄的天、不含今天）—— 算法只有 utils/nutritionCoach 一份
    const recentIntake = useMemo(() => recentAvgIntake(history), [history]);
    const baseIntake = goalType === 'cut' ? Math.max(1200, baseTDEE - dailyDeficit)
        : goalType === 'recomp' ? Math.round(baseTDEE * 0.95)
            : Math.min(5000, baseTDEE + dailyDeficit);

    // Both the activity multiplier and observed TDEE already include activity.
    // Keep workout burn as context rather than adding it to the cycle target.
    const todayBurn = activityBurn || workoutData?.totalBurn || 0;
    const adjustedIntake = Math.round(baseIntake);

    // Macros (goal-type-aware)
    const proteinMultiplier = goalType === 'cut' ? 2.2 : goalType === 'recomp' ? 2.0 : 1.8;
    const fatMultiplier = goalType === 'cut' ? 0.8 : goalType === 'recomp' ? 1.0 : 1.0;
    /* ⚖️ 用實測體重算，不用 profile 的 current_weight（那是註冊時填的，常常過期）。
       畫面上顯示 74.9 kg，蛋白質卻照 70 kg 算，是最容易被抓到的不一致。 */
    const macroWeight = Number(ibWeight) > 0 ? Number(ibWeight)
        : Number(currentWeight) > 0 ? Number(currentWeight) : null;
    const newProtein = Math.round(macroWeight * proteinMultiplier);
    const newFat = Math.round(macroWeight * fatMultiplier);
    const newCarbs = Math.max(30, Math.round((adjustedIntake - newProtein * 4 - newFat * 9) / 4));

    // Chart glide path (used in main page after commit)
    const chartData = useMemo(() => {
        const points = Math.min(Math.ceil(weeksToGoal), 12);
        const data = [];
        for (let i = 0; i <= points; i++) {
            const w = currentWeight + weeklyChange * i;
            data.push({ week: `W${i}`, weight: parseFloat(w.toFixed(1)) });
        }
        return data;
    }, [currentWeight, weeklyChange, weeksToGoal]);

    // ── Tri-Projection Curves (Weight + Body Fat % + Skeletal Muscle Mass) ─────────────────────

    // Next measurement date (every 2 weeks from committedAt or today)
    const nextMeasureDate = useMemo(() => {
        const base = committedAt ? new Date(committedAt) : new Date();
        const now = new Date();
        let d = new Date(base);
        while (d <= now) d.setDate(d.getDate() + 14);
        return d.toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' });
    }, [committedAt]);


    // Daily protocol guidance
    const workoutType = workoutData?.workoutType || 'rest';
    const isTrainingDay = workoutType !== 'rest';
    const preWorkoutCarbs = Math.round(newCarbs * 0.30);
    const postWorkoutCarbs = Math.round(newCarbs * 0.35);
    const preWorkoutPro = Math.round(newProtein * 0.20);
    const postWorkoutPro = Math.round(newProtein * 0.30);

    const DAILY_CHECKLIST = [
        { id: `chk_pro_${userId}`, icon: 'protein', label: `蛋白質目標 ${newProtein}g`, sub: '分配在日常餐點，不必額外疊加固定睡前份量' },
        { id: `chk_cal_${userId}`, icon: 'meal', label: `總熱量 ${adjustedIntake} kcal`, sub: '已包含計劃的活動假設；運動消耗另列參考' },
        { id: `chk_water_${userId}`, icon: 'water', label: '喝水 ≥ 35ml/kg', sub: `約 ${Math.round(currentWeight * 0.035 * 1000)} ml` },
        { id: `chk_train_${userId}`, icon: '🏋️', label: isTrainingDay ? '今日訓練已記錄' : '今日為恢復日', sub: isTrainingDay ? `消耗 ${todayBurn} kcal` : '輕度活動 + 伸展' },
        { id: `chk_fiber_${userId}`, icon: '🥦', label: '蔬菜 ≥ 3 份', sub: '幫助飽足感與消化' },
    ];

    /* 🍽️ 建議菜單：設定完只丟四個數字（2310 kcal、P150…）是營養師的語言，
       不是「我明天早餐要吃什麼」的答案。跑步會給課表、健身會給課表，
       營養也該給。內容來自 utils/mealPlanBuilder.js（用真的吃得到的台灣餐點）。 */
    const mealPlan = useMemo(
        () => buildMealPlan(
            // ⚠️ 碳水與脂肪一定要一起傳：少傳就會算出「主食 0 g、油脂 0 g」，
            //    比例條整條變成蛋白質 —— 畫面會直接說謊。
            { calories: baseIntake, protein: newProtein, carbs: newCarbs, fats: newFat },
            { bodyWeight: currentWeight, preferredBySlot: foodPrefs }
        ),
        [baseIntake, newProtein, newCarbs, newFat, currentWeight, foodPrefs]
    );

    /* 🛡️ 防呆：不是「碰過沒」，是「這一步填的東西合不合理」。
       擋下來的時候一定要說出為什麼，並在做得到的情況下附一個解法。
       （原本只看 stepDone.*，使用者可以設出「增肌但目標體重比現在低」這種計劃。） */
    const guardCtx = {
        goalType, hasInBody, stepDone,
        targetWeight, targetBodyFat,
        currentWeight: Number(ibWeight) || Number(currentWeight) || 0,
        weeklyChange,
    };
    const withAction = (issue) => (issue && issue.needsMeasure
        ? {
            ...issue,
            actionLabel: '去量測',
            action: () => { onClose(); navigate('/body-analysis-mobile', { state: { openInBodyForm: true, from: 'nutrition-plan' } }); },
        }
        : issue);

    const currentIssue = withAction(wizardStepIssue(wizardStep, guardCtx));
    const canAdvance = !currentIssue;
    const stepUnlocked = unlockedSteps(guardCtx);
    const currentStep = wizardStep + 1;

    /* 檢視模式的面板要回答兩件事：我走到哪、接下來該怎麼努力。
       兩者都讀同一份實測資料（cutProgress / nutritionCoach），
       不會跟總覽頁或分析頁的數字打架。 */
    const viewProgress = useMemo(
        () => computeCutProgress(userId, loadSaved()),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [userId, isOpen, isEditing]
    );
    /* 🧩 一個週期的完整狀態（12 種可能性收在 utils/nutritionCycle.js）、
       跨系統結論（重訓／跑步實際次數）與圖表資料。
       這裡不再自己判斷狀態 —— 判斷只有一份，畫面只負責顯示。 */
    const cycleState = useMemo(
        () => buildCycleState(userId, loadSaved()),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [userId, isOpen, isEditing]
    );

    /* 趨勢圖的 Y 軸範圍要自己指定。交給 recharts 的 dataMin／dataMax 時，
       這一期只量過一次的人會拿到「上下界是同一個值」的退化座標軸 ——
       畫面上就會出現一根刻度、一個孤點，看不出哪條是哪條（實測回饋）。 */
    const cycleYDomain = useMemo(() => {
        const g = cycleState.gauge || {};
        const vals = [g.start, g.target,
            ...cycleState.chart.map((r) => r.actual),
            ...cycleState.chart.map((r) => r.planned)]
            .filter((v) => typeof v === 'number' && Number.isFinite(v));
        if (!vals.length) return [0, 1];
        return [Math.floor(Math.min(...vals) - 1), Math.ceil(Math.max(...vals) + 1)];
    }, [cycleState]);

    /* 🎯 一期結束的結算：達標之後不能只寫「目標達成」就沒了。
       這裡算出這一期實際發生什麼、給一句誠實評語、並提出下一期的方向。 */
    const cycleRecap = useMemo(
        () => buildCycleRecap(userId, loadSaved()),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [userId, isOpen, isEditing]
    );
    const RECAP_SEEN_KEY = `nutrition_recap_seen_${userId || 'guest'}`;
    const [recapDismissed, setRecapDismissed] = useState(() => {
        try { return localStorage.getItem(RECAP_SEEN_KEY) || ''; } catch { return ''; }
    });
    const savedPlanId = loadSaved().planId || '';
    const showRecap = !!cycleRecap && recapDismissed !== savedPlanId;
    const cycleCount = useMemo(
        () => readCycleHistory(userId).length,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [userId, isOpen, recapDismissed]
    );
    /* 這一期收進歷史＋結算標成看過 —— 只能在「下一期真的存好了」之後做。
       以前一按「設定下一期」就先收掉，使用者在精靈裡關掉、或存檔失敗，
       結算卡就再也不出現，舊計劃卻還在跑。 */
    const pendingNextCycle = useRef(null);
    const closeFinishedCycle = (plan, recap) => {
        archiveCycle(userId, plan, recap);
        try { localStorage.setItem(RECAP_SEEN_KEY, plan.planId || ''); } catch { /* 隱私模式 */ }
        setRecapDismissed(plan.planId || '');
    };
    const startNextCycle = () => {
        pendingNextCycle.current = { plan: loadSaved(), recap: cycleRecap };
        // 帶著上下文進下一期：方向已建議、起點用現在的實測體重
        if (cycleRecap?.next?.goalType) {
            const nextGoal = cycleRecap.next.goalType;
            setGoalType(nextGoal);
            setPace(PACE_CONFIG[nextGoal][1].val);
            /* 目標體重也要跟著新方向重算：上一期的目標（例如減脂的 72 kg）就是現在的體重，
               沿用的話新的一期一開始就「已達標」。跟點選目標類型走同一份推導。 */
            const t = defaultTargetsFor(nextGoal, { currentWeight, ibWeight, ibLBM, ibBF, gender });
            setTargetWeight(t.targetWeight);
            setTargetBodyFat(t.targetBodyFat);
            markStep('mode');
        }
        setWizardStep(0);
        setIsEditing(true);
    };
    /* 「先維持」不是只把卡片關掉：減脂／增重的熱量赤字（盈餘）還掛在計劃上，
       使用者以為在維持，其實還在減。這裡真的存一份維持（recomp）計劃：
       每天熱量 = TDEE，蛋白質、脂肪不變，碳水補滿差額。存好了才收掉這一期。 */
    const [maintainSaving, setMaintainSaving] = useState(false);
    const keepMaintaining = async () => {
        if (commitInFlight.current) return;
        const prev = loadSaved();
        const kcal = Number(baseTDEE) > 1000 ? Number(baseTDEE) : Number(prev.tdee || prev.intrinsicTDEE);
        const macros = rebalanceToKcal(prev, kcal);
        if (!macros) {
            toast.error('算不出維持期的熱量，請用「調整計劃」手動設定');
            return;
        }
        const weightNow = Number(ibWeight) || Number(currentWeight) || Number(prev.currentWeight) || null;
        const now = Date.now();
        const plan = {
            ...prev,
            planId: `plan_${userId || 'guest'}_${now}`,
            goalType: 'recomp', pace: 0, weeklyChange: 0,
            targetWeight: weightNow ?? prev.targetWeight, currentWeight: weightNow ?? prev.currentWeight,
            recommendedIntake: macros.adjustedIntake, ...macros,
            tdee: kcal, committedAt: now,
            // 維持期照時間走（每 4 週回饋一次），給一個 8 週後的回顧日
            etaDate: new Date(now + 8 * 7 * 86400000).toISOString(),
            useManualDate: false, manualGoalDate: '',
            kcalAdjustments: [],
        };
        commitInFlight.current = true;
        setMaintainSaving(true);
        try {
            await onSave({ plan, programId: newProgramId() });
            closeFinishedCycle(prev, cycleRecap);
            onClose();
        } catch (error) {
            toast.error(error?.code === 'offline' ? error.message : '維持計劃沒有存成功，請稍後再按一次');
        } finally {
            commitInFlight.current = false;
            setMaintainSaving(false);
        }
    };

    const viewCoach = useMemo(
        () => buildCoachDigest(userId, loadSaved()),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [userId, isOpen, isEditing]
    );

    // 今日預估目標＋預估曲線；配速會被這一期實際的訓練量校準
    const projection = useMemo(
        () => buildProjection(userId, loadSaved()),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [userId, isOpen, isEditing]
    );
    const [showProjection, setShowProjection] = useState(true);   // 圖就是重點，預設攤開

    /* 🚪 提示不能是死路 —— 說了「重訓次數不足」就要能直接去安排
       ──────────────────────────────────────────────────────────────
       nutritionCycle / nutritionCoach 的每一則提示都可以帶 action：
         · { label, route }  → 關掉這張表、導到那個頁面
         · { label, local }  → 留在原地做事（開精靈 / 開新的一期）
       沒有 action 的提示就不畫按鈕，不會生出假的入口。 */
    const NoteAction = ({ action, primary = false }) => {
        if (!action?.label) return null;
        const go = () => {
            triggerHaptic('medium');
            if (action.local === 'openPlanner' || action.local === 'newCycle') {
                setWizardStep(0);
                setIsEditing(true);
                return;
            }
            if (action.route) {
                onClose?.();
                navigate(action.route, action.state ? { state: action.state } : undefined);
            }
        };
        return (
            <motion.button
                {...pressProps('pill')}
                type="button"
                onClick={go}
                style={{
                    marginTop: 10, padding: '9px 16px', borderRadius: 999, cursor: 'pointer',
                    background: primary ? '#F95C4B' : 'rgba(246,244,241,0.10)',
                    color: '#F6F4F1',
                    border: primary ? 'none' : '1px solid rgba(246,244,241,0.28)',
                    fontSize: 12, fontWeight: 900, letterSpacing: '0.04em',
                }}
            >
                {action.label} →
            </motion.button>
        );
    };

    const handleCommit = async () => {
        if (commitInFlight.current) return;
        if (needsProfileData) {
            toast.error('請先在個人資料補齊身高、成年年齡與生理性別，才能確認這份營養估算');
            return;
        }
        if (!Number.isFinite(adjustedIntake) || !(adjustedIntake > 0) || ![newProtein, newCarbs, newFat].every(Number.isFinite)) {
            toast.error('請先補齊身體資料，再建立營養計劃');
            return;
        }
        if (Math.abs(newProtein * 4 + newCarbs * 4 + newFat * 9 - adjustedIntake) > 5) {
            toast.error('目前配速留下的熱量不足以容納營養分配，請放慢目標配速後重新確認');
            return;
        }
        const planId = `plan_${userId || 'guest'}_${Date.now()}`;
        const plan = {
            planId, userId, goalType, targetWeight, targetBodyFat, pace,
            currentBF: ibBF,          // save current body fat for protocol summary
            recommendedIntake: baseIntake, adjustedIntake,
            newProtein, newCarbs, newFat,
            bmrMethod: ibBF !== null ? 'Katch-McArdle' : 'Mifflin-St Jeor',
            bmr: _intrinsicBMR, intrinsicTDEE: _intrinsicTDEE,
            tdee: baseTDEE, committedAt: Date.now(),
            etaDate: effectiveGoalDate.toISOString(),
            useManualDate, manualGoalDate,
            weeklyChange, currentWeight,
            foodPrefs,
        };
        // Retain the same request on retry after an uncertain network response.
        const signature = JSON.stringify({ ...plan, planId: null, committedAt: null });
        if (pendingCommit.current?.signature !== signature) pendingCommit.current = { signature, plan, programId: newProgramId() };
        commitInFlight.current = true;
        setSavingPlan(true);
        try {
            await onSave(pendingCommit.current);
            pendingCommit.current = null;
            // 從結算卡「設定下一期」進來的 → 新的一期存好了，才把上一期收進歷史
            if (pendingNextCycle.current) {
                closeFinishedCycle(pendingNextCycle.current.plan, pendingNextCycle.current.recap);
                pendingNextCycle.current = null;
            }
            onClose();
        } catch (error) {
            /* activateProgram 連不上伺服器時會丟 code='offline' 並附上明確的一句話；
               那種情況照它說的講，不要再套「尚未確認同步」讓人以為是別的問題。 */
            toast.error(error?.code === 'offline'
                ? error.message
                : '計劃尚未確認同步，已保留設定。請恢復連線後重試；重試同一份設定不會重複建立週期。');
        } finally {
            commitInFlight.current = false;
            setSavingPlan(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, y: '100dvh' }}
                    animate={{ opacity: 1, y: 0, transitionEnd: { transform: 'none' } }}
                    exit={{ opacity: 0, y: '100dvh' }}
                    transition={{ type: 'spring', damping: 28, stiffness: 200 }}
                    style={{ background: '#F6F4F1', height: '100dvh', width: '100vw' }}
                    className="fixed top-0 left-0 z-[200] flex flex-col overflow-hidden"
                >
                    <div className="px-6 pt-16 pb-3 flex justify-between items-start flex-shrink-0 bg-[#F6F4F1] z-10" style={{ borderBottom: '1px solid rgba(22,20,21,0.08)' }}>
                        <div>
                            {/* 一個 kicker、一個標題、一句支撐。原本是英文兩行大標
                                （Nutrition / Protocol.）加一行英文 kicker —— 介面是中文的，
                                最大的那行字卻要使用者自己翻譯。 */}
                            <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.24em', color: meta.color, marginBottom: 6 }}>
                                {isEditing ? '設定中' : '執行中'}
                            </p>
                            <h2 className="brand-font" style={{ fontSize: 32, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.02em', color: '#161415' }}>
                                {planOwnerName ? `${planOwnerName}的` : ''}{meta.label}計劃
                            </h2>
                            <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(22,20,21,0.45)', marginTop: 8, letterSpacing: '0.01em' }}>
                                {isEditing
                                    ? `第 ${currentStep} 步 / 共 ${STEP_LABELS.length} 步 · ${STEP_LABELS[currentStep - 1]}`
                                    : (cycleState?.gauge?.ready
                                        ? `這一期第 ${Math.floor(cycleState.gauge.weeksElapsed) + 1} 週`
                                        : '還沒開始')}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <motion.button {...pressProps('pill')}
 onClick={() => { triggerHaptic('light'); setShowBurnRefPopup(true); }}
 style={{ padding: 12, background: 'rgba(22,20,21,0.06)', borderRadius: '50%', border: 'none', cursor: 'pointer', color: '#161415' }}
 >
                                <HelpCircle size={20} strokeWidth={1.5} />
                            </motion.button>
                            <motion.button {...pressProps('pill')} aria-label="關閉"
 onClick={onClose}
 style={{ padding: 12, background: 'rgba(22,20,21,0.06)', borderRadius: '50%', border: 'none', cursor: 'pointer', color: '#161415' }}
 >
                                <X size={20} strokeWidth={1.5} />
                            </motion.button>
                        </div>
                    </div>

                    {/* ── Scrollable Content ─────────────────────────────── */}
                    <div className="flex-1 overflow-y-auto no-scrollbar relative" style={{ WebkitOverflowScrolling: 'touch' }}>
                        <div className="px-6 py-5 space-y-6 pb-4">

                            {/* ── InBody 提醒（降階版）──────────────────────────────
                                這是提醒，不是主角。原本它是整幅深色卡＋Coral 大按鈕，
                                和下面那張深色「計劃執行中」卡並排，一頁出現兩張深色卡，
                                視覺上分不出誰重要（設計鐵律：一頁最多一張深色卡）。
                                改成淺色單行，資訊一句話講完，整條可點。 */}
                            {!hasRecentInBody && (
                                <motion.button {...pressProps('card')}
                                    onClick={() => {
                                        triggerHaptic('medium');
                                        onClose();
                                        // 防呆：直接把量測表單打開，並告訴對方「填完會回到計劃」，
                                        // 不要讓使用者跳過去之後自己在頁面裡找按鈕。
                                        navigate('/body-analysis-mobile', { state: { openInBodyForm: true, from: 'nutrition-plan' } });
                                    }}
                                    className="w-full text-left ti-surface-pale ms-glow-coral transition-transform"
                                    style={{
                                        borderRadius: 14, padding: '12px 16px',
                                        border: '1px solid rgba(217,64,48,0.26)',
                                        display: 'flex', alignItems: 'center', gap: 12,
                                    }}
                                >
                                    <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.18em', color: '#D94030', flexShrink: 0 }}>
                                        {hasInBody ? 'InBody 已過期' : 'InBody 未輸入'}
                                    </span>
                                    <span style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(22,20,21,0.62)', flex: 1, lineHeight: 1.45 }}>
                                        {hasInBody
                                            ? `數據超過 7 天，建議 ${nextMeasureDate} 前重新量測`
                                            : '量測後可追蹤實際體重與身體組成變化'}
                                    </span>
                                    <ChevronRight size={14} style={{ color: 'rgba(22,20,21,0.35)', flexShrink: 0 }} />
                                </motion.button>
                            )}

                            {needsProfileData && <div role="status" style={{ fontSize: 13, lineHeight: 1.7, padding: 14 }}>
                                尚缺基本身體資料，目前數字僅供預覽，補齊後才能確認計劃。
                                <motion.button {...pressProps('row')} type="button" onClick={() => { onClose(); navigate('/profile-mobile'); }} style={{ display: 'block', marginTop: 8 }}>前往補齊個人資料</motion.button>
                            </div>}
                            {/* ═══ SECTION: STRATEGY ═══ */}
                            {!isEditing ? (
                                showRecap ? (
                                    /* 🎉 一期結束的結算 —— 達標不能只寫「目標達成」就沒了。
                                       慶祝照設計系統：一個 coral 光暈擴散一次（不是常駐特效）、
                                       主角彈入、其餘依序浮現；不做彩帶、不做全螢幕閃光。 */
                                    <motion.div
                                        className="ti-surface-dark"
                                        initial={{ opacity: 0, y: 16 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.5, ease: EASE }}
                                        style={{ borderRadius: 28, padding: 28, position: 'relative', overflow: 'hidden' }}
                                    >
                                        <div className="ti-sheen ti-sheen-dark" />
                                        <motion.div
                                            initial={{ opacity: 0.5, scale: 0.55 }}
                                            animate={{ opacity: 0, scale: 2 }}
                                            transition={{ duration: 1.2, ease: EASE, delay: 0.15 }}
                                            style={{
                                                position: 'absolute', top: '10%', left: '-8%', width: 280, height: 280,
                                                borderRadius: '50%', pointerEvents: 'none',
                                                background: 'radial-gradient(circle, rgba(249,92,75,0.55) 0%, transparent 70%)',
                                            }}
                                        />

                                        <div style={{ position: 'relative', zIndex: 1 }}>
                                            <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.28em', color: '#F95C4B', marginBottom: 12 }}>
                                                這一期結束 · {meta.label}{cycleCount > 0 ? ` · 第 ${cycleCount + 1} 期` : ''}
                                            </p>

                                            <motion.div
                                                initial={{ scale: 0.6, opacity: 0 }}
                                                animate={{ scale: 1, opacity: 1 }}
                                                transition={{ type: 'spring', stiffness: 220, damping: 18, delay: 0.18 }}
                                                style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}
                                            >
                                                <span className="brand-font tabular-nums" style={{ fontSize: 62, fontWeight: 300, lineHeight: 0.9, letterSpacing: '-0.04em', color: '#F6F4F1' }}>
                                                    {cycleRecap.direction === 'bulk' ? '+' : '−'}{cycleRecap.movedKg}
                                                </span>
                                                <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', color: 'rgba(246,244,241,0.45)' }}>kg</span>
                                            </motion.div>

                                            <motion.p {...rise(1)} className="tabular-nums" style={{ fontSize: 12, fontWeight: 700, color: 'rgba(246,244,241,0.55)', marginBottom: 20 }}>
                                                {cycleRecap.startWeight} → {cycleRecap.endWeight} kg
                                            </motion.p>

                                            <motion.div {...rise(2)} className="grid grid-cols-3 gap-px" style={{ background: 'rgba(255,255,255,0.10)', marginBottom: 18 }}>
                                                {[
                                                    { k: '花了', v: `${cycleRecap.weeks}`, u: '週' },
                                                    { k: '平均每週', v: `${cycleRecap.avgPaceKgWk}`, u: 'kg' },
                                                    { k: cycleRecap.overshootKg > 0.3 ? '超過目標' : '目標', v: cycleRecap.overshootKg > 0.3 ? `${cycleRecap.overshootKg}` : '達成', u: cycleRecap.overshootKg > 0.3 ? 'kg' : '' },
                                                ].map((c) => (
                                                    <div key={c.k} style={{ background: '#161415', padding: '14px 10px' }}>
                                                        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(246,244,241,0.45)', marginBottom: 5 }}>{c.k}</p>
                                                        <p className="tabular-nums" style={{ fontSize: 20, fontWeight: 300, color: '#F6F4F1' }}>
                                                            {c.v}{c.u && <span style={{ fontSize: 11, fontWeight: 700, marginLeft: 3, color: 'rgba(246,244,241,0.45)' }}>{c.u}</span>}
                                                        </p>
                                                    </div>
                                                ))}
                                            </motion.div>

                                            <motion.p {...rise(3)} style={{ fontSize: 12.5, lineHeight: 1.7, color: 'rgba(246,244,241,0.75)', marginBottom: 22 }}>
                                                {cycleRecap.verdict}
                                            </motion.p>

                                            <motion.div {...rise(4)} style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 18 }}>
                                                <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.28em', color: 'rgba(246,244,241,0.40)', marginBottom: 8 }}>
                                                    下一期
                                                </p>
                                                <p style={{ fontSize: 17, fontWeight: 800, color: '#F6F4F1', marginBottom: 6 }}>{cycleRecap.next.title}</p>
                                                <p style={{ fontSize: 11.5, lineHeight: 1.7, color: 'rgba(246,244,241,0.55)', marginBottom: 18 }}>{cycleRecap.next.reason}</p>

                                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                                    <motion.button
                                                        whileTap={{ scale: 0.96 }}
                                                        onClick={() => { triggerHaptic('success'); startNextCycle(); }}
                                                        style={{
                                                            flex: 1, minWidth: 150, padding: '14px 18px', borderRadius: 14, border: 'none',
                                                            background: '#F95C4B', color: '#161415', cursor: 'pointer',
                                                            fontSize: 12, fontWeight: 900, letterSpacing: '0.08em',
                                                        }}
                                                    >
                                                        設定下一期 · {GOAL_META[cycleRecap.next.goalType]?.label}
                                                    </motion.button>
                                                    <motion.button
                                                        whileTap={{ scale: 0.96 }}
                                                        disabled={maintainSaving}
                                                        onClick={() => { triggerHaptic('light'); keepMaintaining(); }}
                                                        style={{
                                                            padding: '14px 18px', borderRadius: 14, cursor: 'pointer',
                                                            background: 'transparent', border: '1px solid rgba(255,255,255,0.22)',
                                                            color: 'rgba(246,244,241,0.70)', fontSize: 12, fontWeight: 900, letterSpacing: '0.08em',
                                                        }}
                                                    >
                                                        {maintainSaving ? '存檔中…' : '先維持'}
                                                    </motion.button>
                                                </div>
                                            </motion.div>
                                        </div>
                                    </motion.div>
                                ) : (
                                // 🌟 模式 A：鈦金屬質感面板 + 放大目標日期
                                <div className="ti-surface-dark" style={{
                                    borderRadius: 28,
                                    padding: '28px',
                                    position: 'relative',
                                    overflow: 'hidden',
                                }}>
                                    <div className="ti-sheen ti-sheen-dark" />
                                    <div className="relative z-10 flex justify-between items-start mb-8">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: meta.color }} />
                                                <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.24em', color: meta.color }}>這一期 · {meta.label}</p>
                                            </div>
                                            {/* 已經達標（含超過）就不要再寫「執行中」——
                                                卡片自己說達成、標題卻說執行中，使用者只會覺得系統沒在算。 */}
                                            <h3 className="text-4xl font-light text-white tracking-tight leading-none mb-4" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.03em' }}>
                                                {viewProgress.status === 'ok' && viewProgress.remainingKg <= 0.05 ? '目標已達成' : '目標執行中'}
                                            </h3>

                                            {/* 主角改成「實測走了多少」。原本這裡放目標日期，
                                                但使用者第一眼想知道的是自己走到哪，不是當初許的願。 */}
                                            {viewProgress.status === 'ok' ? (
                                                <div className="flex items-baseline gap-2">
                                                    <span className="tabular-nums" style={{ fontFamily: 'var(--font-display)', fontSize: 46, fontWeight: 300, lineHeight: 1, letterSpacing: '-0.03em', color: viewProgress.offTrack ? '#D94030' : '#F6F4F1' }}>
                                                        {Math.abs(viewProgress.movedKg)}
                                                    </span>
                                                    <span className="text-[12px] font-black tracking-[0.25em] text-white/45 pb-1">
                                                        {viewProgress.offTrack
                                                            ? (goalType === 'bulk' ? '反而少了 kg' : '反而多了 kg')
                                                            : (goalType === 'bulk' ? '已增 kg' : '已減 kg')}
                                                    </span>
                                                </div>
                                            ) : (
                                                <div className="inline-flex flex-col">
                                                    <span className="text-[12px] font-black tracking-[0.06em] text-white/45 mb-1">預計達標</span>
                                                    <span className="text-xl font-black text-white tracking-tighter border-b-2 border-white pb-1">{formattedDate}</span>
                                                </div>
                                            )}
                                        </div>

                                        <motion.button {...pressProps('icon')}
 onClick={() => setIsEditing(true)}
 className="w-12 h-12 rounded-full bg-white/10 border border-white/20 shadow-sm flex items-center justify-center group"
 >
                                            <Edit2 size={16} className="text-white/60 group-hover:text-white" />
                                        </motion.button>
                                    </div>

                                    {/* 進度軌：起點 → 現在 → 目標。有實測才畫，沒有就不畫假的。 */}
                                    {viewProgress.status === 'ok' && (
                                        <div className="relative z-10 mb-6">
                                            <div className="relative h-1" style={{ background: 'rgba(255,255,255,0.14)' }}>
                                                <div className="absolute top-0 left-0 h-full" style={{ width: `${viewProgress.progressPct}%`, background: meta.color }} />
                                                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full" style={{ left: `${viewProgress.progressPct}%`, background: meta.color, boxShadow: '0 0 0 3px rgba(22,20,21,0.9)' }} />
                                            </div>
                                            <div className="flex justify-between mt-2">
                                                <span className="text-[11px] font-black tabular-nums text-white/40">起點 {viewProgress.startWeight}</span>
                                                <span className="text-[11px] font-black tabular-nums text-white">現在 {viewProgress.currentWeight} kg</span>
                                                <span className="text-[11px] font-black tabular-nums text-white/40">目標 {viewProgress.targetWeight}</span>
                                            </div>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-3 gap-1 mb-8 relative z-10" style={{ border: '1.5px solid rgba(207,198,184,0.30)', borderRadius: 4, padding: '20px 8px' }}>
                                        {(viewProgress.status === 'ok'
                                            ? [
                                                /* ⚠️「還剩 13.7」看不出要加還是減；「預計達標 — 需調整」看不出是什麼意思。
                                                   標籤直接講方向，到不了就直接說到不了（原因在下面「下一步」）。 */
                                                { k: goalType === 'bulk' ? '還要增' : goalType === 'cut' ? '還要減' : '離目標', v: `${viewProgress.remainingKg}`, u: 'kg' },
                                                { k: '第幾週', v: `${viewProgress.weekIndex}`, u: '週' },
                                                { k: '預計達標', v: viewProgress.etaReachable ? (formatEta(viewProgress.etaDate) || '已達標') : '到不了', u: viewProgress.etaReachable ? '' : '照現在' },
                                            ]
                                            : [
                                                { k: '目標體重', v: `${targetWeight}`, u: 'kg', hero: true },
                                                { k: '目標體脂', v: targetBodyFat !== null ? targetBodyFat.toFixed(1) : '—', u: '%' },
                                                { k: '預計達標', v: formattedDate, u: '' },
                                            ]
                                        ).map((c, idx) => (
                                            <div key={c.k} className={`px-2 ${idx === 1 ? 'border-x border-white/10' : ''}`}>
                                                <p className="text-[11px] font-bold tracking-[0.1em] text-white/45 mb-2">{c.k}</p>
                                                <div className="flex items-baseline gap-1">
                                                    <motion.span
                                                        className="text-[26px] font-light tracking-tight tabular-nums leading-none"
                                                        initial={{ opacity: 0.5 }}
                                                        whileInView={{ opacity: 1 }}
                                                        viewport={{ once: false, amount: 0.8 }}
                                                        transition={{ duration: 0.5, delay: idx * 0.08 }}
                                                        style={{ fontFamily: 'var(--font-display)', color: c.hero ? '#CFC6B8' : '#F6F4F1' }}
                                                    >{c.v}</motion.span>
                                                    {c.u && <span className="text-[11px] font-bold" style={{ color: c.hero ? 'rgba(207,198,184,0.7)' : 'rgba(255,255,255,0.4)' }}>{c.u}</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* 跨系統：熱量與訓練必須一起看。
                                        增重沒重訓＝長脂肪、減脂沒阻力訓練＝掉肌肉，
                                        這是專業上不能不講的事，判斷在 utils/nutritionCycle.js。 */}
                                    {cycleState.notes.length > 0 && (
                                        <div className="relative z-10 mb-6">
                                            {cycleState.notes.slice(0, 2).map((n) => (
                                                <div key={n.title} style={{
                                                    borderLeft: `2px solid ${n.level === 'action' ? '#F95C4B' : n.level === 'watch' ? '#D4C5A5' : 'rgba(255,255,255,0.20)'}`,
                                                    paddingLeft: 12, marginBottom: 12,
                                                }}>
                                                    <p style={{
                                                        fontSize: 12, fontWeight: 900, letterSpacing: '0.25em', marginBottom: 4,
                                                        color: n.system === 'strength' ? 'rgba(246,244,241,0.55)' : n.system === 'cardio' ? 'rgba(246,244,241,0.55)' : 'rgba(246,244,241,0.40)',
                                                    }}>
                                                        {n.system === 'strength' ? '重訓' : n.system === 'cardio' ? '跑步' : '訓練'}
                                                    </p>
                                                    <p style={{ fontSize: 12.5, fontWeight: 800, color: '#F6F4F1', marginBottom: 2 }}>{n.title}</p>
                                                    <p style={{ fontSize: 11, lineHeight: 1.6, color: 'rgba(246,244,241,0.55)' }}>{n.detail}</p>
                                                    <NoteAction action={n.action} />
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* 接下來該怎麼努力 —— 與總覽頁的教練同一份判斷 */}
                                    {viewCoach && (
                                        <div className="relative z-10 mb-7" style={{ borderLeft: `2px solid ${viewCoach.level === 'action' ? '#F95C4B' : 'rgba(255,255,255,0.22)'}`, paddingLeft: 12 }}>
                                            <p className="text-[12px] font-black tracking-[0.25em] mb-1.5" style={{ color: viewCoach.level === 'action' ? '#F95C4B' : 'rgba(255,255,255,0.40)' }}>
                                                {viewCoach.level === 'action' ? '下一步' : '目前狀況'}
                                            </p>
                                            <p className="text-[13px] font-bold text-white leading-snug">{viewCoach.title}</p>
                                            <p className="text-[11px] leading-relaxed mt-1" style={{ color: 'rgba(255,255,255,0.55)' }}>{viewCoach.detail}</p>
                                            <NoteAction action={viewCoach.action} primary />
                                        </div>
                                    )}

                                    <div className="relative z-10">
                                        <motion.button {...pressProps('cta')}
                                            onClick={() => setIsMacrosExpanded(!isMacrosExpanded)}
                                            className="w-full flex justify-between items-center group"
                                        >
                                            <div className="flex flex-col items-start">
                                                {/* 標籤要講「這個數字是要你幹嘛」——「建議攝取基準」是名詞，不是答案 */}
                                                <p className="text-[11px] font-bold tracking-[0.06em] text-white/45 mb-1.5">每天吃這麼多</p>
                                                <div className="flex items-baseline gap-1.5">
                                                    <span className="text-[44px] font-light text-[#F95C4B] tracking-tight leading-none" style={{ fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums' }}>{baseIntake}</span>
                                                    <span className="text-[11px] font-bold text-white/45">大卡</span>
                                                </div>
                                                {/* 目標旁邊一定要有「你現在實際吃多少」—— 只給目標不給現況，看不出差多少。
                                                    平均只算有記錄的天、不含今天（今天還沒吃完）。 */}
                                                <p className="text-[12px] font-semibold mt-2 tabular-nums" style={{ color: 'rgba(255,255,255,0.55)' }}>
                                                    {recentIntake
                                                        ? <>最近平均 <span style={{ color: '#F6F4F1', fontWeight: 800 }}>{recentIntake.avg}</span> 大卡
                                                            {Math.abs(baseIntake - recentIntake.avg) >= 50
                                                                ? ` · ${baseIntake > recentIntake.avg ? '還差' : '多了'} ${Math.abs(baseIntake - recentIntake.avg)}`
                                                                : ' · 剛好'}</>
                                                        : '記 2 天飲食，這裡會比對你實際吃多少'}
                                                </p>
                                            </div>
                                            <div className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center group-active:scale-95 transition-all">
                                                <motion.div animate={{ rotate: isMacrosExpanded ? 180 : 0 }}>
                                                    <ChevronDown size={18} className="text-white/60" />
                                                </motion.div>
                                            </div>
                                        </motion.button>

                                        <AnimatePresence>
                                            {isMacrosExpanded && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="flex gap-4 pt-5 mt-4 border-t border-white/10">
                                                        {[
                                                            { label: '蛋白質', val: newProtein, color: '#F95C4B' },
                                                            { label: '碳水', val: newCarbs, color: '#F6F4F1' },
                                                            { label: '脂肪', val: newFat, color: '#D4C5A5' }
                                                        ].map(m => (
                                                            <div key={m.label} className="flex-1">
                                                                <p className="text-[11px] font-bold text-white/45 tracking-[0.1em] mb-1.5">{m.label}</p>
                                                                <p className="text-[22px] font-light tracking-tight leading-none" style={{ color: m.color, fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums' }}>
                                                                    {m.val}<span className="text-[11px] font-bold" style={{ opacity: 0.55, marginLeft: 2 }}>g</span>
                                                                </p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>
                                )
                            ) : (
                                <div className="space-y-6">
                                    {/* 🪜 進度列：四步走到哪一目瞭然，走過的可以點回去改 */}
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        {STEP_LABELS.map((label, i) => {
                                            const done = i < wizardStep;
                                            const active = i === wizardStep;
                                            return (
                                                <motion.button {...pressProps('row')}
                                                    key={label}
                                                    onClick={() => { if (i <= wizardStep || stepUnlocked[i]) { triggerHaptic('light'); setWizardStep(i); } }}
                                                    style={{
                                                        flex: 1, padding: 0, border: 'none', background: 'none',
                                                        cursor: (i <= wizardStep || stepUnlocked[i]) ? 'pointer' : 'default', textAlign: 'left',
                                                    }}
                                                >
                                                    <div style={{
                                                        height: 3, borderRadius: 2, marginBottom: 6,
                                                        background: active ? '#F95C4B' : done ? 'rgba(22,20,21,0.45)' : 'rgba(22,20,21,0.12)',
                                                    }} />
                                                    <span style={{
                                                        fontSize: 11, fontWeight: 900, letterSpacing: '0.08em',
                                                        color: active ? '#161415' : 'rgba(22,20,21,0.35)',
                                                    }}>
                                                        {label}
                                                    </span>
                                                </motion.button>
                                            );
                                        })}
                                    </div>

                                    <AnimatePresence mode="wait" initial={false}>
                                    {wizardStep === 0 && (<motion.div key="step0" {...stepAnim} className="space-y-6">
                                    {/* 步驟標題交給頂部進度列，這裡不再重複一次（同一句話講兩遍） */}
                                    <div>
                                        <p style={{ fontSize: 12, color: 'rgba(22,20,21,0.50)', marginBottom: 14, lineHeight: 1.6 }}>
                                            想先減脂、先增肌，還是兩件事一起慢慢來。
                                        </p>
                                        {/* 三個選項改成直式列表：瑞士排版用「線」分隔，不用三個大圓角方框。
                                            選中＝左側 coral 線＋墨色字，未選＝淡化；理由寫成一句話，不用小徽章。 */}
                                        <div>
                                            {Object.entries(GOAL_META).map(([key, g], gi) => {
                                                const isSelected = goalType === key;
                                                return (
                                                    <motion.button
                                                        key={key}
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{ duration: 0.42, ease: EASE, delay: gi * 0.07 }}
                                                        whileTap={{ scale: 0.985 }}
                                                        onClick={() => {
                                                            markStep('mode');
                                                            setGoalType(key);
                                                            setPace(PACE_CONFIG[key][1].val);
                                                            // 目標體重／體脂的推導收在 defaultTargetsFor（見檔案上方），
                                                            // 這裡與 seed 那條路走同一份，不會再各算各的。
                                                            const t = defaultTargetsFor(key, { currentWeight, ibWeight, ibLBM, ibBF, gender });
                                                            setTargetWeight(t.targetWeight);
                                                            setTargetBodyFat(t.targetBodyFat);
                                                        }}
                                                        style={{
                                                            width: '100%', textAlign: 'left', cursor: 'pointer',
                                                            background: 'transparent', border: 'none', borderRadius: 0,
                                                            padding: '16px 0 16px 14px',
                                                            borderTop: gi === 0 ? RULE : 'none',
                                                            borderBottom: RULE,
                                                            borderLeft: `2px solid ${isSelected ? '#F95C4B' : 'transparent'}`,
                                                            display: 'flex', alignItems: 'center', gap: 14,
                                                            transition: 'border-color 0.3s cubic-bezier(0.16,1,0.3,1)',
                                                        }}
                                                    >
                                                        <GoalIcon
                                                            type={g.icon} size={20} strokeWidth={1.6}
                                                            style={{ flexShrink: 0, color: '#161415', opacity: isSelected ? 0.9 : 0.28 }}
                                                        />
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <span className="brand-font" style={{
                                                                display: 'block', fontSize: 24, fontWeight: 400, letterSpacing: '-0.01em', lineHeight: 1.1,
                                                                color: isSelected ? '#161415' : 'rgba(22,20,21,0.35)',
                                                            }}>{g.label}</span>
                                                            <span style={{
                                                                fontSize: 11.5, fontWeight: 600,
                                                                color: isSelected ? 'rgba(22,20,21,0.55)' : 'rgba(22,20,21,0.30)',
                                                            }}>{g.desc}</span>
                                                        </div>
                                                        <span style={{
                                                            width: 14, height: 14, flexShrink: 0,
                                                            border: `1.5px solid ${isSelected ? '#F95C4B' : 'rgba(22,20,21,0.18)'}`,
                                                            background: isSelected ? '#F95C4B' : 'transparent',
                                                        }} />
                                                    </motion.button>
                                                );
                                            })}
                                        </div>

                                        {/* 推薦的理由要寫出來 —— 一個小徽章說「依你的體脂」，
                                            但沒說是多少、也沒說為什麼，等於沒講。 */}
                                        {hasInBody && recommendedGoalType && (
                                            <p style={{ fontSize: 11.5, lineHeight: 1.7, color: 'rgba(22,20,21,0.50)', marginTop: 14 }}>
                                                你目前體脂 <span className="tabular-nums" style={{ fontWeight: 800, color: '#161415' }}>{ibBF !== null ? ibBF.toFixed(1) : '—'}%</span>
                                                ，一般會建議先{GOAL_META[recommendedGoalType]?.verb || '調整'}。
                                                最後還是你決定。
                                            </p>
                                        )}
                                        {!hasInBody && (
                                            <p style={{ fontSize: 11.5, lineHeight: 1.7, color: 'rgba(22,20,21,0.40)', marginTop: 14 }}>
                                                量過體脂之後，這裡會依你的數據給建議。
                                            </p>
                                        )}
                                    </div>

                                    </motion.div>)}

                                    {wizardStep === 1 && (<motion.div key="step1" {...stepAnim} className="space-y-6">
                                    <p style={{ fontSize: 12, color: 'rgba(22,20,21,0.50)', margin: '4px 0 14px', lineHeight: 1.6 }}>
                                        設一個做得到的數字。之後隨時可以改。
                                    </p>

                                    {/* Weight Goal — Titanium Pebble themed */}
                                    <div style={{
                                        opacity: stepDone.mode ? 1 : 0.4,
                                        pointerEvents: stepDone.mode ? 'auto' : 'none',
                                        transition: 'opacity .3s ease',
                                        borderTop: RULE, paddingTop: 18,
                                    }}>
                                        <div className="grid grid-cols-2 gap-4 relative">
                                            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 1, height: '80%', background: 'rgba(22,20,21,0.08)' }} />
                                            <div className="flex flex-col items-center">
                                                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.2em', color: 'rgba(22,20,21,0.40)', marginBottom: 8 }}>目前</span>
                                                <div className="brand-font" style={{ fontSize: 38, fontWeight: 500, color: hasInBody ? '#161415' : 'rgba(22,20,21,0.20)', letterSpacing: '-0.03em', display: 'flex', alignItems: 'baseline', gap: 4 }}>
                                                    {hasInBody ? ibWeight : '—'}{hasInBody && <span style={{ fontSize: 13, opacity: 0.4, fontFamily: 'inherit' }}>kg</span>}
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-center">
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
                                                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.2em', color: '#161415' }}>目標</span>
                                                    {hasInBody && Math.abs(targetWeight - recTargetWeight) < 0.6 && (
                                                        <span style={{ background: 'transparent', color: 'rgba(22,20,21,0.45)', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', border: '1px solid rgba(22,20,21,0.16)', padding: '1px 5px', borderRadius: 4 }}>建議值</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <motion.button whileTap={{ scale: 0.88 }} onClick={() => { markStep('target'); setTargetWeight(p => parseFloat(Math.max(30, p - 0.5).toFixed(1))); }} style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid rgba(22,20,21,0.2)', background: 'transparent', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#161415' }}>−</motion.button>
                                                    <div className="brand-font" style={{ fontSize: 34, fontWeight: 500, color: '#161415', letterSpacing: '-0.03em', display: 'flex', alignItems: 'baseline', gap: 4, minWidth: 80, justifyContent: 'center' }}>
                                                        <motion.span
                                                            key={targetWeight}
                                                            initial={{ opacity: 0, y: 8 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            transition={{ duration: 0.16, ease: EASE }}
                                                            className="tabular-nums"
                                                        >{targetWeight.toFixed(1)}</motion.span>
                                                        <span style={{ fontSize: 12, color: 'rgba(22,20,21,0.40)', fontFamily: 'inherit' }}>kg</span>
                                                    </div>
                                                    <motion.button {...pressProps('row')} onClick={() => { markStep('target'); /* 上限 300 kg：原本只有下限 Math.max(30,...)，往上可以一直加。
   目標體重會直接決定熱量赤字與體重預測曲線，離譜的目標會讓整組建議失真。 */
                                                    setTargetWeight(p => parseFloat(Math.min(300, p + 0.5).toFixed(1))); }} style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid rgba(22,20,21,0.2)', background: 'transparent', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#161415' }}>+</motion.button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Body Fat % — Current vs Target (mirrors weight layout) */}
                                        <div style={{ marginTop: 18, paddingTop: 18, borderTop: RULE }}>
                                            <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.18em', color: 'rgba(22,20,21,0.35)', textAlign: 'center', marginBottom: 12 }}>
                                                體脂率 Body Fat %
                                                {hasInBody && <span style={{ background: '#161415', color: '#fff', fontSize: 11, fontWeight: 900, letterSpacing: '0.06em', padding: '1px 5px', borderRadius: 4, marginLeft: 6 }}>InBody</span>}
                                            </p>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8, position: 'relative' }}>
                                                {/* divider */}
                                                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 1, height: '80%', background: 'rgba(22,20,21,0.08)' }} />
                                                {/* CURRENT */}
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.2em', color: 'rgba(22,20,21,0.40)', marginBottom: 6 }}>目前</span>
                                                    <div className="brand-font" style={{ fontSize: 32, fontWeight: 500, color: '#161415', letterSpacing: '-0.03em', display: 'flex', alignItems: 'baseline', gap: 2 }}>
                                                        {ibBF !== null ? ibBF.toFixed(1) : '—'}
                                                        {ibBF !== null && <span style={{ fontSize: 13, opacity: 0.4, fontFamily: 'inherit' }}>%</span>}
                                                    </div>
                                                    {!hasInBody && <p style={{ fontSize: 11, color: 'rgba(22,20,21,0.25)', marginTop: 2, letterSpacing: '0.04em' }}>輸入 InBody 解鎖</p>}
                                                </div>
                                                <div style={{ width: 8 }} />
                                                {/* TARGET */}
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                                                        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.2em', color: '#161415' }}>目標</span>
                                                        {hasInBody && targetBodyFat === recTargetBF && (
                                                            <span style={{ background: 'transparent', color: 'rgba(22,20,21,0.45)', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', border: '1px solid rgba(22,20,21,0.16)', padding: '1px 5px', borderRadius: 4 }}>建議值</span>
                                                        )}
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <motion.button {...pressProps('icon')} onClick={() => { markStep('target'); setTargetBodyFat(p => p === null ? (ibBF ? Math.max(5, Math.round(ibBF) - 3) : 20) : Math.max(5, p - 0.5)); }} style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#161415' }}>−</motion.button>
                                                        <div className="brand-font" style={{ fontSize: 30, fontWeight: 500, color: targetBodyFat ? '#161415' : 'rgba(22,20,21,0.25)', letterSpacing: '-0.03em', display: 'flex', alignItems: 'baseline', gap: 2, minWidth: 68, justifyContent: 'center' }}>
                                                            {targetBodyFat !== null ? targetBodyFat.toFixed(1) : '—'}
                                                            {targetBodyFat !== null && <span style={{ fontSize: 12, color: 'rgba(22,20,21,0.40)', fontFamily: 'inherit' }}>%</span>}
                                                        </div>
                                                        <motion.button {...pressProps('icon')} onClick={() => { markStep('target'); setTargetBodyFat(p => p === null ? (ibBF ? Math.max(5, Math.round(ibBF) - 3) : 20) : Math.min(50, p + 0.5)); }} style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#161415' }}>+</motion.button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    </motion.div>)}

                                    {wizardStep === 2 && (<motion.div key="step2" {...stepAnim} className="space-y-6">
                                    {/* ═══ MERGED STRATEGY & DATE CARD (Titanium) ═══ */}
                                    <div style={{ borderTop: RULE, paddingTop: 18 }}>

                                        {/* Velocity Section */}
                                        <div className="mb-8 relative z-10">
                                            <p style={{ fontSize: 12, color: 'rgba(22,20,21,0.50)', marginBottom: 14, lineHeight: 1.6 }}>
                                                快一點比較早到，但也比較難撐。中間那個是多數人撐得住的。
                                                {goalType === 'bulk' && ' 增加的是肌肉還是脂肪，取決於你有沒有規律重訓。'}
                                                {goalType === 'cut' && ' 減掉的是脂肪還是肌肉，取決於蛋白質與重訓。'}
                                            </p>
                                            <div className="flex gap-2">
                                                {paceWithDates.map((p, idx) => {
                                                    const isSelected = pace === p.val;
                                                    const isRecommended = idx === 1; // middle option
                                                    return (
                                                        <motion.button
                                                            key={p.label}
                                                            initial={{ opacity: 0, y: 10 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            transition={{ duration: 0.4, ease: EASE, delay: idx * 0.07 }}
                                                            whileTap={{ scale: 0.96 }}
                                                            onClick={() => { markStep('pace'); setPace(p.val); setUseManualDate(false); }}
                                                            style={{
                                                                flex: 1, padding: '14px 8px', borderRadius: 14, cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)', position: 'relative',
                                                                border: `1px solid ${isSelected ? '#161415' : 'rgba(22,20,21,0.12)'}`,
                                                                background: isSelected ? '#161415' : 'transparent',
                                                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                                                                boxShadow: 'none',
                                                                transform: 'none'
                                                            }}
                                                        >
                                                            {isRecommended && (
                                                                <span style={{
                                                                    position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)',
                                                                    background: '#F95C4B', color: '#F6F4F1', fontSize: 11, fontWeight: 900, letterSpacing: '0.08em',
                                                                    padding: '2px 7px', borderRadius: 5, whiteSpace: 'nowrap', zIndex: 2
                                                                }}>多數人</span>
                                                            )}
                                                            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: isSelected ? '#F6F4F1' : 'rgba(22,20,21,0.55)', marginTop: isRecommended ? 4 : 0 }}>{p.label}</span>
                                                            <span style={{ fontSize: 11, fontWeight: 600, color: isSelected ? 'rgba(246,244,241,0.60)' : 'rgba(22,20,21,0.35)' }}>{p.desc}</span>
                                                            <span style={{ fontSize: 11, fontWeight: 800, color: isSelected ? '#F6F4F1' : 'rgba(22,20,21,0.35)', marginTop: 2 }}>{p.projectedDate}</span>
                                                        </motion.button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Goal Date Picker Section */}
                                        <div className="pt-6 border-t border-white/10 relative z-10">
                                            <div className="flex justify-between items-center mb-6">
                                                <div>
                                                    <p style={{ fontSize: 11, color: 'rgba(22,20,21,0.35)', marginTop: 4, fontWeight: 600 }}>
                                                        {useManualDate ? '✓ 手動設定 (Manual)' : `依策略自動推算 (Auto)`}
                                                    </p>
                                                </div>
                                                <div style={{ position: 'relative' }}>
                                                    <motion.button {...pressProps('row')}
                                                        style={{
                                                            fontSize: 11, fontWeight: 900, color: '#161415',
                                                            border: '1px solid rgba(22,20,21,0.16)',
                                                            background: useManualDate ? 'rgba(22,20,21,0.10)' : 'transparent',
                                                            borderRadius: 12, padding: '6px 14px', cursor: 'pointer',
                                                            letterSpacing: '0.05em'
                                                        }}
                                                    >
                                                        {useManualDate ? '✓ 自訂' : '自訂'}
                                                    </motion.button>
                                                    <input
                                                        type="date"
                                                        value={manualGoalDate || toLocalDateKey(new Date())}
                                                        min={toLocalDateKey(new Date())}
                                                        onChange={e => { setUseManualDate(true); setManualGoalDate(e.target.value); }}
                                                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, zIndex: 10 }}
                                                    />
                                                </div>
                                            </div>

                                            <div className="flex justify-between items-end">
                                                <span className="brand-font" style={{ fontSize: 36, fontWeight: 500, color: '#161415', letterSpacing: '-0.02em' }}>{formattedDate}</span>
                                                <div className="text-right">
                                                    <span style={{ display: 'block', fontSize: 12, fontWeight: 900, color: meta.color, letterSpacing: '0.02em' }}>
                                                        {Math.ceil(actualWeeksToGoal)} 週
                                                    </span>
                                                    <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(22,20,21,0.45)', letterSpacing: '0.05em' }}>
                                                        {goalType === 'bulk' ? '+' : '-'}{Math.round(weightDiff * 10) / 10} 公斤{hasInBody ? ` · ${goalType === 'bulk' ? '+' : '-'}${Math.round(bfDiff * 10) / 10}% 體脂` : ''}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    </motion.div>)}

                                    {/* ── STEP 04 常吃什麼 ────────────────────────────────
                                        挑幾樣他真的會吃的東西，建議才會是「他的菜單」，
                                        不是一份漂亮但不會照做的範本。可以跳過。 */}
                                    {wizardStep === 3 && (
                                        <motion.div key="step3" {...stepAnim}>
                                            <p style={{ fontSize: 12, color: 'rgba(22,20,21,0.50)', lineHeight: 1.6, marginBottom: 14 }}>
                                                挑幾樣你平常就會吃的，下一頁的搭配會從這些排。可以跳過。
                                            </p>

                                            {/* 🌃 夜晚餐廳：選食物這一段換成深色場景＋氛圍燈。
                                                照設計系統的氛圍燈規則做 —— 一個光源、藏在內容後面、
                                                低透明度大模糊、色相取自色票（coral／ember），不是彩虹霓虹。
                                                只有這一段是暗的，其餘步驟維持一致的淺色編輯式。 */}
                                            <div style={{
                                                position: 'relative', overflow: 'hidden',
                                                borderRadius: 24, padding: '20px 18px 22px',
                                                background: 'linear-gradient(168deg, #1B1719 0%, #161415 55%, #120F11 100%)',
                                                border: '1px solid rgba(255,255,255,0.07)',
                                            }}>
                                                <div className="ms-neon-ambient" style={{
                                                    position: 'absolute', top: -90, right: -60, width: 260, height: 260,
                                                    background: 'radial-gradient(circle, rgba(249,92,75,0.30) 0%, rgba(217,64,48,0.10) 45%, transparent 70%)',
                                                    filter: 'blur(18px)', pointerEvents: 'none', zIndex: 0,
                                                }} />
                                                <div style={{
                                                    position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
                                                    background: 'linear-gradient(100deg, transparent 35%, rgba(255,255,255,0.035) 50%, transparent 65%)',
                                                }} />

                                                <div style={{ position: 'relative', zIndex: 1 }}>
                                                    <p className="ms-neon-sign" style={{
                                                        fontSize: 11, fontWeight: 900, letterSpacing: '0.3em', textTransform: 'uppercase',
                                                        color: '#F95C4B', marginBottom: 14,
                                                    }}>
                                                        Tonight&apos;s Menu
                                                    </p>

                                                    <input
                                                        value={prefQuery}
                                                        onChange={(e) => setPrefQuery(e.target.value)}
                                                        placeholder="找食物（例如：便當、牛肉麵、飯糰）"
                                                        style={{
                                                            width: '100%', padding: '11px 14px', borderRadius: 12,
                                                            border: '1px solid rgba(255,255,255,0.14)',
                                                            background: 'rgba(255,255,255,0.06)',
                                                            fontSize: 13, fontWeight: 600, color: '#F6F4F1', outline: 'none',
                                                        }}
                                                    />

                                                    {Object.entries(MEAL_SLOTS).map(([slotKey, slotLabel], si) => {
                                                        const q = prefQuery.trim();
                                                        const list = dishesForSlot(slotKey).filter(d => !q
                                                            || d.name.includes(q) || (d.aliases || []).some(a => a.includes(q)));
                                                        if (!list.length) return null;
                                                        const chosen = foodPrefs[slotKey] || [];
                                                        return (
                                                            <motion.div
                                                                key={slotKey}
                                                                initial={{ opacity: 0, y: 10 }}
                                                                animate={{ opacity: 1, y: 0 }}
                                                                transition={{ duration: 0.45, ease: EASE, delay: Math.min(si, 4) * 0.08 }}
                                                                style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.09)' }}
                                                            >
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 }}>
                                                                    <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.18em', color: slotColor(slotKey), display: 'flex', alignItems: 'center', gap: 7 }}>
                                                                        <span style={{ width: 8, height: 8, borderRadius: 999, background: slotColor(slotKey), flexShrink: 0 }} />
                                                                        {slotLabel}
                                                                    </p>
                                                                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                                                                        <span style={{ fontSize: 11, fontWeight: 700, color: chosen.length ? slotColor(slotKey) : 'rgba(246,244,241,0.30)' }}>
                                                                            {chosen.length ? `已選 ${chosen.length}／4` : '最多 4 樣'}
                                                                        </span>
                                                                        {/* 從食物庫挑 —— 上面那個搜尋框只搜這一頁的預設清單，
                                                                            食物庫裡的東西進不來。這個入口打開完整食物庫，
                                                                            選完直接加進「這一餐」並回到本頁。 */}
                                                                        <motion.button
                                                                            {...pressProps('pill')}
                                                                            type="button"
                                                                            onClick={() => { triggerHaptic('light'); openLibraryForSlot(slotKey); }}
                                                                            aria-label={`從食物庫挑${slotLabel}`}
                                                                            disabled={chosen.length >= 4}
                                                                            style={{
                                                                                padding: '5px 11px', borderRadius: 999,
                                                                                border: '1px solid ' + slotColor(slotKey) + '66',
                                                                                background: 'transparent',
                                                                                color: chosen.length >= 4 ? 'rgba(246,244,241,0.25)' : slotColor(slotKey),
                                                                                fontSize: 11, fontWeight: 800,
                                                                                cursor: chosen.length >= 4 ? 'not-allowed' : 'pointer',
                                                                            }}
                                                                        >
                                                                            ＋食物庫
                                                                        </motion.button>
                                                                    </span>
                                                                </div>
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                                                    {list.map((d, di) => {
                                                                        const on = chosen.includes(d.id);
                                                                        const full = !on && chosen.length >= 4;
                                                                        return (
                                                                            <motion.button
                                                                                key={d.id}
                                                                                disabled={full}
                                                                                initial={{ opacity: 0, scale: 0.94 }}
                                                                                animate={{ opacity: full ? 0.4 : 1, scale: 1 }}
                                                                                transition={{ duration: 0.35, ease: EASE, delay: Math.min(di, 6) * 0.025 }}
                                                                                whileTap={{ scale: 0.94 }}
                                                                                onClick={() => { triggerHaptic('light'); togglePref(slotKey, d.id); }}
                                                                                className={on ? 'ms-neon-on' : ''}
                                                                                style={{
                                                                                    padding: '8px 13px', borderRadius: 999,
                                                                                    cursor: full ? 'not-allowed' : 'pointer',
                                                                                    border: `1px solid ${on ? slotColor(slotKey) : 'rgba(255,255,255,0.14)'}`,
                                                                                    background: on ? slotColor(slotKey) : 'rgba(255,255,255,0.055)',
                                                                                    color: on ? '#161415' : 'rgba(246,244,241,0.72)',
                                                                                    fontSize: 12, fontWeight: on ? 900 : 700,
                                                                                }}
                                                                            >
                                                                                {d.name}
                                                                                <span className="tabular-nums" style={{ fontSize: 11, marginLeft: 6, opacity: on ? 0.65 : 0.45 }}>{d.calories}</span>
                                                                            </motion.button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </motion.div>
                                                        );
                                                    })}

                                                    {/* ── 食物庫（從某一餐的「＋食物庫」打開）───────────────
                                                        選一樣就直接加進那一餐並關閉，不用再回頭找。 */}
                                                    <AnimatePresence>
                                                        {librarySlot && (
                                                            <motion.div
                                                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                                                onClick={(e) => { if (e.target === e.currentTarget) setLibrarySlot(null); }}
                                                                style={{
                                                                    position: 'fixed', inset: 0, zIndex: 10050,
                                                                    background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
                                                                    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                                                                }}
                                                            >
                                                                <motion.div
                                                                    initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                                                                    transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    style={{
                                                                        width: '100%', maxWidth: 440,
                                                                        background: '#161415', borderRadius: '24px 24px 0 0',
                                                                        padding: '14px 18px',
                                                                        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 18px)',
                                                                        maxHeight: '78dvh', display: 'flex', flexDirection: 'column',
                                                                    }}
                                                                >
                                                                    <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 10 }}>
                                                                        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(246,244,241,0.25)' }} />
                                                                    </div>
                                                                    <p style={{ fontSize: 13, fontWeight: 800, color: slotColor(librarySlot), marginBottom: 10 }}>
                                                                        加到{MEAL_SLOTS[librarySlot]}
                                                                    </p>
                                                                    <input
                                                                        autoFocus
                                                                        value={libraryQuery}
                                                                        onChange={(e) => setLibraryQuery(e.target.value)}
                                                                        placeholder="找食物"
                                                                        style={{
                                                                            width: '100%', padding: '11px 14px', borderRadius: 12,
                                                                            border: '1px solid rgba(255,255,255,0.14)',
                                                                            background: 'rgba(255,255,255,0.06)',
                                                                            color: '#F6F4F1', fontSize: 14, outline: 'none',
                                                                        }}
                                                                    />
                                                                    <div style={{ flex: 1, overflowY: 'auto', marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                                        {(libraryQuery.trim() ? searchDishes(libraryQuery.trim(), 30) : dishesForSlot(librarySlot)).map(d => {
                                                                            const on = (foodPrefs[librarySlot] || []).includes(d.id);
                                                                            const full = !on && (foodPrefs[librarySlot] || []).length >= 4;
                                                                            return (
                                                                                <motion.button
                                                                                    {...pressProps('row')}
                                                                                    key={d.id}
                                                                                    type="button"
                                                                                    disabled={full}
                                                                                    onClick={() => {
                                                                                        triggerHaptic('light');
                                                                                        togglePref(librarySlot, d.id);
                                                                                        setLibrarySlot(null);   // 選完直接回上一頁
                                                                                    }}
                                                                                    style={{
                                                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                                                        padding: '12px 14px', borderRadius: 12, textAlign: 'left',
                                                                                        border: '1px solid ' + (on ? slotColor(librarySlot) : 'rgba(255,255,255,0.10)'),
                                                                                        background: on ? slotColor(librarySlot) + '22' : 'rgba(255,255,255,0.04)',
                                                                                        color: full ? 'rgba(246,244,241,0.30)' : '#F6F4F1',
                                                                                        cursor: full ? 'not-allowed' : 'pointer',
                                                                                    }}
                                                                                >
                                                                                    <span style={{ fontSize: 13, fontWeight: 700 }}>{d.name}</span>
                                                                                    <span className="tabular-nums" style={{ fontSize: 12, color: 'rgba(246,244,241,0.45)' }}>{d.calories}</span>
                                                                                </motion.button>
                                                                            );
                                                                        })}
                                                                        {libraryQuery.trim() && searchDishes(libraryQuery.trim(), 30).length === 0 && (
                                                                            <p style={{ fontSize: 12, color: 'rgba(246,244,241,0.40)', padding: '18px 0', textAlign: 'center' }}>找不到這個</p>
                                                                        )}
                                                                    </div>
                                                                </motion.div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>

                                                    <p style={{ fontSize: 11, color: 'rgba(246,244,241,0.38)', marginTop: 18, lineHeight: 1.6 }}>
                                                        共選了 <span className="tabular-nums" style={{ color: '#F95C4B', fontWeight: 900 }}>{prefCount}</span> 樣。
                                                        挑越貼近你平常吃的，下一頁的搭配越準。
                                                    </p>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}

                                    {/* ── STEP 05 計劃總覽 ──────────────────────────────────
                                        瑞士編輯式：一頁一個主角（達標週數），其餘一律降階；
                                        用髮絲線分隔，不用巢狀方框；數字大而輕、標籤小而寬。 */}
                                    {wizardStep === 4 && (
                                        <motion.div key="step4" {...stepAnim} className="space-y-9">

                                            {/* 主角：還要多久 */}
                                            <motion.div {...rise(0)}>
                                                <p style={K}>預期成效</p>
                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                                    <span className="brand-font tabular-nums" style={{ fontSize: 68, fontWeight: 300, lineHeight: 0.9, letterSpacing: '-0.04em', color: '#161415' }}>
                                                        {Math.ceil(actualWeeksToGoal)}
                                                    </span>
                                                    <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.22em', color: 'rgba(22,20,21,0.40)' }}>週</span>
                                                </div>
                                                <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(22,20,21,0.45)', marginTop: 8 }}>
                                                    {formattedDate} 達標
                                                </p>
                                            </motion.div>

                                            {/* 體重旅程：起點 → 目標 */}
                                            <motion.div {...rise(1)} style={{ borderTop: RULE, paddingTop: 14 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                                    <div>
                                                        <p style={K}>起點</p>
                                                        <p className="tabular-nums" style={{ fontSize: 22, fontWeight: 300, color: 'rgba(22,20,21,0.45)' }}>{currentWeight}</p>
                                                    </div>
                                                    <div style={{ flex: 1, height: 1, background: '#CFC6B8', margin: '0 14px', position: 'relative', top: -4 }}>
                                                        <span style={{ position: 'absolute', right: -1, top: -3, width: 7, height: 7, borderRadius: 4, background: meta.color }} />
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <p style={{ ...K, textAlign: 'right' }}>目標</p>
                                                        <p className="tabular-nums" style={{ fontSize: 22, fontWeight: 300, color: '#161415' }}>
                                                            {targetWeight}<span style={{ fontSize: 11, fontWeight: 800, marginLeft: 3, color: 'rgba(22,20,21,0.40)' }}>KG</span>
                                                        </p>
                                                    </div>
                                                </div>
                                                <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(22,20,21,0.40)', marginTop: 8 }}>
                                                    每週 {goalType === 'bulk' ? '+' : '−'}{Math.abs(Math.round(weeklyChange * 100) / 100)} kg
                                                    {targetBodyFat !== null && ` · 體脂 ${targetBodyFat.toFixed(1)}%`}
                                                </p>
                                            </motion.div>

                                            {/* 每日目標 */}
                                            <motion.div {...rise(2)} style={{ borderTop: RULE, paddingTop: 14 }}>
                                                <p style={K}>每日目標</p>
                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
                                                    <span className="brand-font tabular-nums" style={{ fontSize: 52, fontWeight: 300, lineHeight: 0.9, letterSpacing: '-0.03em', color: '#F95C4B' }}>
                                                        {baseIntake}
                                                    </span>
                                                    <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.22em', color: 'rgba(22,20,21,0.40)' }}>KCAL · 基準</span>
                                                </div>
                                                <div className="grid grid-cols-3">
                                                    {[{ l: '蛋白質', v: newProtein }, { l: '碳水', v: newCarbs }, { l: '脂肪', v: newFat }].map((m, idx) => (
                                                        <div key={m.l} style={{ borderLeft: idx ? RULE : 'none', paddingLeft: idx ? 12 : 0 }}>
                                                            <p style={K}>{m.l}</p>
                                                            <p className="tabular-nums" style={{ fontSize: 17, fontWeight: 300, color: '#161415' }}>
                                                                {m.v}<span style={{ fontSize: 11, fontWeight: 800, marginLeft: 2, color: 'rgba(22,20,21,0.40)' }}>G</span>
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </motion.div>

                                            {/* 三餐配置 —— 每一餐都講三件事：多少熱量、怎麼分、吃什麼。
                                                比例條是用熱量算的（P4／C4／F9），不是裝飾；
                                                「吃什麼」優先用他自己挑的東西，沒挑才給一般例子。 */}
                                            <motion.div {...rise(3)} style={{ borderTop: RULE, paddingTop: 14 }}>
                                                <p style={K}>三餐配置</p>
                                                {mealPlan.meals.map((m, idx) => (
                                                    <div key={m.key} style={{ paddingTop: idx ? 16 : 6, borderTop: idx ? RULE : 'none', marginTop: idx ? 14 : 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                                                            <span style={{ fontSize: 13, fontWeight: 800, color: '#161415' }}>{m.label}</span>
                                                            <span className="tabular-nums" style={{ fontSize: 15, fontWeight: 300, color: '#161415' }}>
                                                                {m.kcal}<span style={{ fontSize: 11, fontWeight: 800, marginLeft: 3, color: 'rgba(22,20,21,0.35)' }}>KCAL</span>
                                                            </span>
                                                        </div>

                                                        {/* 餐盤配置：這一餐的熱量怎麼分（角度＝熱量佔比） */}
                                                        {m.composition.length > 0 && (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: m.picks.length || m.examples.length ? 10 : 0 }}>
                                                                <MacroPlate segments={m.composition} />
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    {m.composition.map(c => (
                                                                        <div key={c.key} style={{ display: 'flex', alignItems: 'baseline', gap: 7, paddingBottom: 3 }}>
                                                                            <span style={{ width: 7, height: 7, flexShrink: 0, background: MACRO_COLORS[c.key] }} />
                                                                            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(22,20,21,0.62)', width: 40 }}>{c.label}</span>
                                                                            <span className="tabular-nums" style={{ fontSize: 12, fontWeight: 700, color: '#161415' }}>{c.grams} g</span>
                                                                            <span className="tabular-nums" style={{ fontSize: 11, fontWeight: 700, color: 'rgba(22,20,21,0.32)' }}>{c.pct}%</span>
                                                                        </div>
                                                                    ))}
                                                                    {m.veg && (
                                                                        <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(22,20,21,0.38)', marginTop: 2 }}>＋{m.veg}</p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* 這餐吃什麼 —— 是「配好的一餐」，不是把他選的全部列出來。
                                                            沒被排進來的收在下面一行「還可以換」。 */}
                                                        {m.picks.length > 0 ? (
                                                            <>
                                                                {m.picks.map(x => (
                                                                    <div key={x.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, paddingTop: 2 }}>
                                                                        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#161415', flex: 1 }}>
                                                                            {x.name}
                                                                            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(22,20,21,0.40)', marginLeft: 5 }}>{x.sizeLabel}</span>
                                                                            {x.snackOnly && (
                                                                                <span style={{ fontSize: 11, color: 'rgba(22,20,21,0.38)', marginLeft: 5 }}>· 蛋白質低，要另外補</span>
                                                                            )}
                                                                        </span>
                                                                        <span className="tabular-nums" style={{ fontSize: 11, fontWeight: 300, color: 'rgba(22,20,21,0.50)' }}>{x.calories}</span>
                                                                    </div>
                                                                ))}
                                                                {m.alternatives?.length > 0 && (
                                                                    <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(22,20,21,0.35)', marginTop: 4 }}>
                                                                        還可以換：{m.alternatives.map(a => a.name).join('、')}
                                                                    </p>
                                                                )}
                                                            </>
                                                        ) : m.examples.length > 0 && (
                                                            <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(22,20,21,0.35)' }}>
                                                                ≈ {m.examples.map(e => `${e.name}${e.sizeLabel === '正常' ? '' : ` ${e.sizeLabel}`}`).join('、')}
                                                            </p>
                                                        )}
                                                    </div>
                                                ))}

                                                {mealPlan.yourPicks.length === 0 && (
                                                    <motion.button {...pressProps('row')}
                                                        onClick={() => { triggerHaptic('light'); setWizardStep(3); }}
                                                        style={{ background: 'none', border: 'none', padding: '14px 0 0', cursor: 'pointer', textAlign: 'left' }}
                                                    >
                                                        <span style={{ fontSize: 11.5, fontWeight: 700, color: meta.color }}>回上一步挑常吃的 →</span>
                                                    </motion.button>
                                                )}

                                            </motion.div>

                                            {/* ── 運動怎麼幫你達標 ────────────────────────────────
                                                這一頁的最後一個問題是「那我健身跟跑步呢」——
                                                那才是重點，值得用大字講。
                                                原本這裡有四段小字：手掌換算、重訓一句、跑步一句、
                                                三條提醒、免責聲明，全部 11px 灰字擠在一起，
                                                重點被埋在雜訊裡。留兩句大的，其餘刪。 */}
                                            <motion.div {...rise(4)} style={{ borderTop: RULE, paddingTop: 20 }}>
                                                <p style={{ fontSize: 20, fontWeight: 700, color: '#161415', lineHeight: 1.45, letterSpacing: '-0.01em' }}>
                                                    重訓決定增加的是肌肉還是脂肪。
                                                </p>
                                                <p style={{ fontSize: 20, fontWeight: 700, color: '#161415', lineHeight: 1.45, letterSpacing: '-0.01em', marginTop: 10 }}>
                                                    跑步當天燒掉的熱量，會加回這份額度。
                                                </p>
                                                <p style={{ fontSize: 11, color: 'rgba(22,20,21,0.30)', marginTop: 18 }}>{mealPlan.disclaimer}</p>
                                            </motion.div>
                                        </motion.div>
                                    )}
                                    </AnimatePresence>

                                    {/* 🪜 底部導引：一次只給一個明確動作 */}
                                    <div className="flex gap-3 pt-2">
                                        {wizardStep > 0 && (
                                            <motion.button {...pressProps('pill')}
 onClick={() => { triggerHaptic('light'); setWizardStep(wizardStep - 1); }}
 style={{
 padding: '14px 20px', borderRadius: 14, background: 'transparent',
 border: '1px solid rgba(22,20,21,0.18)', color: 'rgba(22,20,21,0.55)',
 fontSize: 12, fontWeight: 900, letterSpacing: '0.1em', cursor: 'pointer',
 }}
 >
                                                上一步
                                            </motion.button>
                                        )}
                                        {wizardStep < 4 && (
                                            <motion.button {...pressProps('pill')}
 onClick={() => { if (canAdvance) { triggerHaptic('medium'); setWizardStep(wizardStep + 1); } }}
 disabled={!canAdvance}
 style={{
 flex: 1, padding: '14px 20px', borderRadius: 14,
 background: canAdvance ? '#161415' : 'rgba(22,20,21,0.10)',
 color: canAdvance ? '#F6F4F1' : 'rgba(22,20,21,0.35)',
 border: 'none', fontSize: 12, fontWeight: 900, letterSpacing: '0.1em',
 cursor: canAdvance ? 'pointer' : 'not-allowed',
 }}
 >
                                                {canAdvance ? `下一步 · ${STEP_LABELS[wizardStep + 1]}` : '還不能繼續'}
                                            </motion.button>
                                        )}
                                    </div>

                                    {/* 擋下來就要說為什麼，能給解法就給 */}
                                    {currentIssue && wizardStep < 4 && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 10 }}>
                                            <span style={{ fontSize: 11.5, color: '#D94030', fontWeight: 700, flex: 1, lineHeight: 1.5 }}>
                                                {currentIssue.msg}
                                            </span>
                                            {currentIssue.action && (
                                                <motion.button {...pressProps('pill')}
 onClick={() => { triggerHaptic('medium'); currentIssue.action(); }}
 style={{
 padding: '8px 14px', borderRadius: 999, cursor: 'pointer',
 border: '1px solid rgba(217,64,48,0.35)', background: 'rgba(249,92,75,0.08)',
 color: '#D94030', fontSize: 11, fontWeight: 900, whiteSpace: 'nowrap',
 }}
 className="ms-glow-coral"
 >
                                                    {currentIssue.actionLabel} →
                                                </motion.button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* 📊 這一期：目標 · 目前 · 趨勢 ────────────────────────────
                                原本這裡是一張把「計劃線＋實測線＋重訓柱＋跑步柱」四樣東西
                                塞進 190px 的組合圖。實際在手機上看的結果是四條擠在一起、
                                座標軸退化成兩個數字，使用者看不出哪個是哪個。

                                改成先回答三個問題，再談細節：
                                  目標 → 軌道的兩端（起點 → 目標）
                                  目前 → 實測填滿到哪（唯一的大數字）
                                  趨勢 → 軌道上的記號＝照配速今天應該站的位置，
                                         兩者的差距寫成一句「比計劃快／慢幾公斤」
                                量測累積到三筆以上，下面才補一張純體重折線；
                                只有兩個點時連成線會讓人以為中間每天都量過。 */}
                            {!isEditing && cycleState.gauge.ready && (() => {
                                const g = cycleState.gauge;
                                const TREND_COLOR = { ok: '#5A7A3A', watch: '#161415', action: '#D94030', idle: 'rgba(22,20,21,0.38)' };
                                const trendColor = TREND_COLOR[g.trendTone] || TREND_COLOR.idle;

                                /* 沒量過就沒有進度可言。空的大數字、空的軌道、只有虛線的趨勢圖
                                   都是在講「我沒有資料」—— 講四遍。這時候整區只留一件事：去量。 */
                                if (!g.hasMeasure) {
                                    return (
                                        <motion.button {...pressProps('card')}
                                            type="button"
                                            initial={{ opacity: 0, y: 12 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.5, ease: EASE }}
                                            onClick={() => {
                                                triggerHaptic('medium');
                                                onClose();
                                                navigate('/body-analysis-mobile', { state: { openInBodyForm: true, from: 'nutrition-plan' } });
                                            }}
                                            style={{
                                                marginTop: 20, width: '100%', padding: '20px 18px', borderRadius: 18,
                                                background: 'rgba(249,92,75,0.08)', border: '1px solid rgba(249,92,75,0.30)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                gap: 12, cursor: 'pointer', textAlign: 'left',
                                            }}
                                        >
                                            <span style={{ fontSize: 22, fontWeight: 900, color: '#161415', letterSpacing: '-0.03em', lineHeight: 1.2 }}>
                                                先去量一次體重
                                            </span>
                                            <ChevronRight size={20} strokeWidth={2.6} style={{ color: '#F95C4B', flexShrink: 0 }} />
                                        </motion.button>
                                    );
                                }

                                return (
                                    <motion.div
                                        initial={{ opacity: 0, y: 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.5, ease: EASE }}
                                        style={{ marginTop: 20, paddingTop: 16, borderTop: RULE }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                                            <p style={K}>這一期 · 目標進度</p>
                                            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(22,20,21,0.35)' }}>
                                                重訓 {cycleState.training.strengthSessions} 次 · 跑步 {cycleState.training.cardioSessions} 次
                                            </span>
                                        </div>

                                        {/* ① 一個大數字＝實測體重（事實），而且要標清楚它是「目前」。
                                            只寫 65.2 KG 放在「目標進度」底下，會被讀成「目標是 65.2」。 */}
                                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                                            <div style={{ minWidth: 0 }}>
                                                <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', color: 'rgba(22,20,21,0.40)', marginBottom: 4 }}>
                                                    目前體重
                                                </p>
                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                                    <span className="brand-font tabular-nums" style={{ fontSize: 44, fontWeight: 300, lineHeight: 0.9, letterSpacing: '-0.03em', color: '#161415' }}>
                                                        {g.current}
                                                    </span>
                                                    <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', color: 'rgba(22,20,21,0.40)' }}>KG</span>
                                                </div>
                                                <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(22,20,21,0.42)', marginTop: 6 }}>
                                                    {g.ageDays > 0 ? `${g.ageDays} 天前量的` : '今天量的'}
                                                </p>
                                            </div>
                                            <span style={{
                                                marginLeft: 'auto', paddingBottom: 4, fontSize: 12, fontWeight: 900,
                                                letterSpacing: '0.02em', color: trendColor, whiteSpace: 'nowrap',
                                            }}>
                                                {g.trendText}
                                            </span>
                                        </div>

                                        {/* ② 跑道：起點 → 目前 → 目標，三個點都在同一條線上。
                                            進度條滑進畫面才長出來（whileInView），每次滑到都會重跑一次。 */}
                                        <motion.div
                                            initial="rest" whileInView="run" viewport={{ once: false, amount: 0.6 }}
                                            style={{ position: 'relative', height: 12, marginTop: 34 }}
                                        >
                                            {/* 今天照配速該站的位置 —— 數字跟著記號走 */}
                                            {g.planWeight != null && g.pctPlan > 0 && g.pctPlan < 100 && (
                                                <span style={{
                                                    position: 'absolute', left: `${g.pctPlan}%`, top: -19,
                                                    transform: g.pctPlan < 15 ? 'none' : g.pctPlan > 85 ? 'translateX(-100%)' : 'translateX(-50%)',
                                                    whiteSpace: 'nowrap', fontSize: 11, fontWeight: 800, color: 'rgba(22,20,21,0.55)',
                                                }}>
                                                    今天該到 {g.planWeight}
                                                </span>
                                            )}
                                            <div style={{ position: 'absolute', inset: 0, background: 'rgba(22,20,21,0.07)', borderRadius: 2 }} />
                                            <motion.div
                                                variants={{ rest: { width: 0 }, run: { width: `${g.pctDone}%` } }}
                                                transition={{ duration: 0.9, ease: EASE, delay: 0.1 }}
                                                style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2, background: g.trend === 'reverse' ? '#D94030' : '#F95C4B' }}
                                            />
                                            {/* 目前的位置：跑者在跑道上的那一點 */}
                                            <motion.div
                                                variants={{ rest: { left: '0%', opacity: 0 }, run: { left: `${g.pctDone}%`, opacity: 1 } }}
                                                transition={{ duration: 0.9, ease: EASE, delay: 0.1 }}
                                                style={{
                                                    position: 'absolute', top: -4, width: 20, height: 20, borderRadius: 99,
                                                    marginLeft: -10, background: '#F95C4B',
                                                    border: '3px solid #F6F4F1', boxShadow: '0 2px 10px rgba(249,92,75,0.45)',
                                                }}
                                            />
                                            {g.pctPlan > 0 && g.pctPlan < 100 && (
                                                <div style={{
                                                    position: 'absolute', left: `${g.pctPlan}%`, top: -5, width: 2, height: 22,
                                                    background: 'rgba(22,20,21,0.45)', transform: 'translateX(-1px)',
                                                }} />
                                            )}
                                        </motion.div>

                                        {/* ③ 跑道兩端：起點是灰的，目標用 Pebble 底強調 —— 那是要去的地方 */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 14 }}>
                                            <span className="tabular-nums" style={{ fontSize: 11, fontWeight: 800, color: 'rgba(22,20,21,0.38)' }}>
                                                起點 {g.start}
                                            </span>
                                            <motion.span
                                                className="tabular-nums"
                                                initial={{ opacity: 0.6 }} whileInView={{ opacity: 1 }} viewport={{ once: false, amount: 0.6 }}
                                                transition={{ duration: 0.5, delay: 0.7 }}
                                                style={{
                                                    fontSize: 12, fontWeight: 900, color: '#161415',
                                                    background: '#CFC6B8', borderRadius: 99, padding: '5px 12px',
                                                    letterSpacing: '-0.01em',
                                                }}>
                                                目標 {g.target} KG
                                            </motion.span>
                                        </div>

                                        {/* ④ 預估趨勢：展開才畫，三條各自一張圖
                                            體重／體脂率／骨骼肌分開畫 —— 單位不同，疊在一起只會互相遮蔽。
                                            虛線是預估、實心點是實測，兩者永遠分得開。
                                            沒量過體脂或骨骼肌就不畫那一張，不用族群平均值頂替。 */}
                                        {/* 💳 預估曲線是會員的成效預測；實測體重進度（上面那條軌道）永遠免費 */}
                                        {!canUse('forecast') && projection.ready
                                            && projection.series.filter((r) => r.actualWeight != null).length >= 2 && (
                                            <MemberLockCard feature="forecast" label="看體重體脂往哪走" style={{ marginTop: 16 }} />
                                        )}
                                        {canUse('forecast') && projection.ready
                                            && projection.series.filter((r) => r.actualWeight != null).length >= 2 && (
                                            <div style={{ marginTop: 16 }}>
                                                <motion.button
                                                    {...pressProps('cta')}
                                                    type="button"
                                                    onClick={() => { triggerHaptic('light'); setShowProjection((v) => !v); }}
                                                    aria-expanded={showProjection}
                                                    style={{
                                                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                        padding: '12px 0', borderTop: RULE, borderBottom: showProjection ? 'none' : RULE,
                                                        background: 'none', border: 'none', cursor: 'pointer',
                                                    }}
                                                >
                                                    <span style={{ fontSize: 13, fontWeight: 800, color: '#161415' }}>預估趨勢</span>
                                                    <motion.span animate={{ rotate: showProjection ? 180 : 0 }} style={{ display: 'inline-flex' }}>
                                                        <ChevronDown size={18} style={{ color: 'rgba(22,20,21,0.45)' }} />
                                                    </motion.span>
                                                </motion.button>

                                                <AnimatePresence initial={false}>
                                                    {showProjection && (
                                                        <motion.div
                                                            initial={{ height: 0, opacity: 0 }}
                                                            animate={{ height: 'auto', opacity: 1 }}
                                                            exit={{ height: 0, opacity: 0 }}
                                                            transition={{ duration: 0.32, ease: EASE }}
                                                            style={{ overflow: 'hidden' }}
                                                        >
                                                            {[
                                                                { key: 'weight', actualKey: 'actualWeight', label: '體重', unit: 'kg', show: true, ref: g.target },
                                                                { key: 'bodyFat', actualKey: 'actualBodyFat', label: '體脂率', unit: '%', show: projection.hasBodyFat, ref: null },
                                                                { key: 'smm', actualKey: 'actualSmm', label: '骨骼肌', unit: 'kg', show: projection.hasSmm, ref: null },
                                                            ].filter((c) => c.show).map((c) => (
                                                                <div key={c.key} style={{ marginTop: 14 }}>
                                                                    <p style={{ ...K, marginBottom: 4 }}>{c.label}</p>
                                                                    <div style={{ height: 124, width: '100%' }}>
                                                                        <ResponsiveContainer width="100%" height="100%">
                                                                            <LineChart data={projection.series} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                                                                                <CartesianGrid stroke="rgba(22,20,21,0.06)" vertical={false} />
                                                                                <XAxis
                                                                                    dataKey="week" tickLine={false} axisLine={false}
                                                                                    tick={{ fontSize: 11, fill: 'rgba(22,20,21,0.35)', fontWeight: 700 }}
                                                                                    tickFormatter={(v) => `第${v}週`}
                                                                                    minTickGap={18}
                                                                                />
                                                                                <YAxis
                                                                                    domain={['auto', 'auto']} tickLine={false} axisLine={false}
                                                                                    tick={{ fontSize: 11, fill: 'rgba(22,20,21,0.35)', fontWeight: 700 }}
                                                                                    width={40}
                                                                                />
                                                                                <Tooltip
                                                                                    contentStyle={{
                                                                                        background: '#161415', border: 'none', borderRadius: 10,
                                                                                        fontSize: 11, color: '#F6F4F1', padding: '8px 10px',
                                                                                    }}
                                                                                    labelFormatter={(v) => `第 ${v} 週`}
                                                                                    formatter={(val, name) => [`${val} ${c.unit}`, name]}
                                                                                />
                                                                                {c.ref != null && (
                                                                                    <ReferenceLine
                                                                                        y={c.ref} stroke="#161415" strokeDasharray="2 4" strokeOpacity={0.55}
                                                                                        label={{ value: `目標 ${c.ref}`, position: 'insideTopRight', fontSize: 11, fontWeight: 800, fill: 'rgba(22,20,21,0.55)' }}
                                                                                    />
                                                                                )}
                                                                                <Line
                                                                                    type="monotone" dataKey={c.key} name="預估"
                                                                                    stroke="rgba(22,20,21,0.32)" strokeWidth={1.6} strokeDasharray="4 4"
                                                                                    dot={false} isAnimationActive={false}
                                                                                />
                                                                                <Line
                                                                                    type="monotone" dataKey={c.actualKey} name="實測"
                                                                                    stroke="#F95C4B" strokeWidth={2.2} connectNulls
                                                                                    dot={{ r: 3, fill: '#F95C4B', strokeWidth: 0 }}
                                                                                    isAnimationActive={false}
                                                                                />
                                                                            </LineChart>
                                                                        </ResponsiveContainer>
                                                                    </div>
                                                                </div>
                                                            ))}

                                                            <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
                                                                <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(22,20,21,0.45)' }}>
                                                                    <span style={{ display: 'inline-block', width: 14, height: 2, background: '#F95C4B', marginRight: 5, verticalAlign: 'middle' }} />
                                                                    實測
                                                                </span>
                                                                <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(22,20,21,0.45)' }}>
                                                                    <span style={{ display: 'inline-block', width: 14, height: 2, background: 'rgba(22,20,21,0.32)', marginRight: 5, verticalAlign: 'middle' }} />
                                                                    預估
                                                                </span>
                                                            </div>
                                                            {/* 說明文字拿掉 —— 圖上已經有「實測 / 預估」兩條線和目標虛線，
                                                                頁尾也已經寫了「這些數字是估算值」。 */}
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        )}
                                    </motion.div>
                                );
                            })()}

                            {/* InBody guard moved to top of scrollable content */}

                            {(!isEditing || wizardStep === 4) && <section className="ti-surface" style={{ borderRadius: 24, padding: 20 }} aria-label="身體組成量測摘要">
                                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>身體組成</h3>
                                {/* 三個數字排開就看得懂，不用寫成一段話 */}
                                <div style={{ display: 'flex', alignItems: 'stretch' }}>
                                    {[
                                        { k: '體脂', v: ibBF != null ? `${ibBF}` : '—', u: '%' },
                                        { k: '骨骼肌', v: latestInBody?.smm ? `${latestInBody.smm}` : '—', u: 'kg' },
                                    ].map((m, i) => (
                                        <React.Fragment key={m.k}>
                                            {i > 0 && <div style={{ width: 1, background: 'rgba(22,20,21,0.10)' }} />}
                                            <div style={{ flex: 1, textAlign: 'center' }}>
                                                <div className="tabular-nums" style={{ fontSize: 26, fontWeight: 300, lineHeight: 1, color: '#161415', fontFamily: 'var(--font-display)' }}>
                                                    {m.v}<span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(22,20,21,0.40)', marginLeft: 2 }}>{m.u}</span>
                                                </div>
                                                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(22,20,21,0.40)', marginTop: 6 }}>{m.k}</div>
                                            </div>
                                        </React.Fragment>
                                    ))}
                                </div>
                                <p style={{ fontSize: 11.5, fontWeight: 700, color: 'rgba(22,20,21,0.42)', marginTop: 14 }}>
                                    下次檢視 {nextMeasureDate}・在相近時間與條件下量
                                </p>
                            </section>}

                            {/* committed info at bottom */}
                            {committedAt && (
                                <p style={{ fontSize: 11, color: 'rgba(22,20,21,0.35)', textAlign: 'center', paddingBottom: 2 }}>
                                    這一期從 {new Date(committedAt).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })} 開始
                                </p>
                            )}

                            {/* ── Commit Button (移入滾動區塊內) ───────────────────────────────────── */}
                            <div style={{ paddingTop: '4px', paddingBottom: '32px' }}>
                                {isEditing && wizardStep < 4 ? null : isEditing ? (
                                    <div className="flex flex-col gap-2">
                                        {!hasInBody && (
                                            <motion.button {...pressProps('card')}
                                                onClick={() => {
                                                    triggerHaptic('medium');
                                                    onClose();
                                                    navigate('/body-analysis-mobile', { state: { openInBodyForm: true, from: 'nutrition-plan' } });
                                                }}
                                                className="ms-glow-coral transition-transform"
                                                style={{
                                                    width: '100%', padding: '10px 14px', marginBottom: 4, borderRadius: 12,
                                                    background: 'rgba(249,92,75,0.08)', border: '1px solid rgba(217,64,48,0.26)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: 'pointer',
                                                }}
                                            >
                                                <span style={{ fontSize: 11, fontWeight: 800, color: '#D94030', letterSpacing: '0.04em' }}>
                                                    還缺 InBody 數據 · 點這裡去輸入
                                                </span>
                                                <ChevronRight size={14} style={{ color: '#D94030' }} />
                                            </motion.button>
                                        )}
                                        <motion.button {...pressProps('row')}
                                            onClick={handleCommit}
                                            disabled={!hasInBody || savingPlan}
                                            style={{
                                                width: '100%', padding: '16px', borderRadius: 18, border: 'none',
                                                cursor: !hasInBody ? 'not-allowed' : 'pointer',
                                                background: !hasInBody ? 'rgba(22,20,21,0.1)' : '#161415',
                                                color: !hasInBody ? 'rgba(22,20,21,0.4)' : '#fff',
                                                fontSize: 12, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                                boxShadow: !hasInBody ? 'none' : '0 8px 24px rgba(22,20,21,0.20)',
                                                transition: 'all 0.15s',
                                            }}
                                            onTouchStart={e => { if (hasInBody) e.currentTarget.style.transform = 'scale(0.97)' }}
                                            onTouchEnd={e => { if (hasInBody) e.currentTarget.style.transform = 'scale(1)' }}
                                        >
                                            {hasInBody ? (
                                                <>{savingPlan ? '正在確認並同步計劃…' : `開始這個計劃 · ${meta.label}`} <ChevronRight size={14} /></>
                                            ) : (
                                                <>先量 InBody 才能開始</>
                                            )}
                                        </motion.button>
                                    </div>
                                ) : (
                                    <motion.button {...pressProps('row')}
                                        onClick={onClose}
                                        style={{
                                            width: '100%', padding: '16px', borderRadius: 18, border: '1px solid rgba(22,20,21,0.1)', cursor: 'pointer',
                                            background: '#fff', color: '#161415', fontSize: 12, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.15s',
                                        }}
                                        onTouchStart={e => e.currentTarget.style.transform = 'scale(0.97)'}
                                        onTouchEnd={e => e.currentTarget.style.transform = 'scale(1)'}
                                    >
                                        返回儀表板
                                    </motion.button>
                                )}

                                {/* 🩹 2026-08 稽核：整個營養系統原本零醫療免責。
                                    App 實際在開熱量處方（減脂 −400kcal / 增肌 +250kcal）、
                                    逐公斤蛋白質係數，還用 7700kcal/kg 預測體重變化速率 ——
                                    這種程度的健康建議必須有免責說明。
                                    主畫面只留一行，完整內容收進「？」，不佔版面。 */}
                                <motion.button {...pressProps('row')}
                                    type="button"
                                    onClick={() => { triggerHaptic('light'); setShowBurnRefPopup(true); }}
                                    style={{
                                        width: '100%', marginTop: 12, padding: 0, border: 'none',
                                        background: 'transparent', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                        fontSize: 11, lineHeight: 1.5, color: 'rgba(22,20,21,0.40)',
                                    }}
                                >
                                    這些數字是估算值，不是醫療建議
                                    <HelpCircle size={12} strokeWidth={2} />
                                </motion.button>
                            </div>
                        </div>
                    </div>

                    

                    {/* 運動熱量消耗參考彈出視窗 (Burn Reference Popup) */}
                    <AnimatePresence>
                        {showBurnRefPopup && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                                onClick={() => setShowBurnRefPopup(false)}
                            >
                                <motion.div
                                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                                    animate={{ scale: 1, opacity: 1, y: 0 }}
                                    exit={{ scale: 0.95, opacity: 0, y: 20 }}
                                    className="bg-[#FFFFFF] rounded-[28px] p-6 w-full max-w-sm max-h-[90dvh] overflow-y-auto no-scrollbar relative shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] border border-[#EAE7E0]"
                                    onClick={e => e.stopPropagation()}
                                >
                                    <div className="flex items-center justify-between mb-6 pb-4 border-b border-black/5">
                                        <div className="flex items-center gap-2">
                                            <Flame size={20} className="text-[#F95C4B]" />
                                            <h3 className="text-xl font-black tracking-tighter text-[#161415] uppercase">
                                                關於這些數字
                                            </h3>
                                        </div>
                                        <motion.button {...pressProps('icon')} onClick={() => setShowBurnRefPopup(false)} className="p-2 rounded-full text-[#161415]/40 hover:bg-[#161415]/5 hover:text-[#161415] transition-all">
                                            <X size={18} strokeWidth={2.5} />
                                        </motion.button>
                                    </div>

                                    <p className="text-[12px] font-black tracking-widest text-[#161415] mb-3">
                                        運動消耗參考
                                    </p>
                                    <p className="text-xs text-[#161415]/60 mb-5 leading-relaxed">
                                        常見運動的大約消耗，可以拿來抓當天要多補多少。這是一般成人的概略值，沒有依你的體重個人化。
                                    </p>

                                    <div className="grid grid-cols-2 gap-3 mb-6">
                                        {[
                                            { activity: '慢跑', time: '30min', kcal: '~300', emoji: '🏃‍♂️' },
                                            { activity: '重訓', time: '45min', kcal: '~200', emoji: '🏋️‍♂️' },
                                            { activity: '游泳', time: '30min', kcal: '~250', emoji: '🏊‍♂️' },
                                            { activity: '單車', time: '30min', kcal: '~200', emoji: '🚴‍♂️' },
                                        ].map((item, i) => (
                                            <div key={i} className="flex justify-between items-center bg-[#F9F8F6] px-4 py-3 rounded-[18px] border border-[#EAE7E0] shadow-sm">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-lg">{item.emoji}</span>
                                                    <div>
                                                        <p className="text-xs font-black text-[#161415] leading-none">{item.activity}</p>
                                                        <p className="text-[11px] font-bold text-[#161415]/40 mt-1">{item.time}</p>
                                                    </div>
                                                </div>
                                                <span className="text-xs font-black text-[#F95C4B] tabular-nums">{item.kcal}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* ── 目標熱量怎麼來的（複雜規則 → 列點，不寫成一大段） ── */}
                                    <div className="mb-5 pt-5 border-t border-black/5">
                                        <p className="text-[12px] font-black tracking-widest text-[#161415] mb-3">
                                            你的目標熱量怎麼算的
                                        </p>
                                        <ul className="text-xs text-[#161415]/60 leading-relaxed list-disc pl-4 space-y-1.5">
                                            <li>先用身高體重年齡估你的基礎代謝；有 InBody 就改用體脂數據，會更準。</li>
                                            <li>再依你過去 7 天實際訓練的天數，調整每日活動消耗。</li>
                                            <li>最後依你選的目標加減：減脂扣一些、增肌加一些。</li>
                                            <li>體重變化的預估速度，是用「7700 大卡約等於 1 公斤」換算的。</li>
                                        </ul>
                                    </div>

                                    {/* copy-rules: allow-long — 醫療免責聲明，法遵內容不能為了簡潔而砍 */}
                                    {/* ── 安心使用：醫療免責（2026-08 稽核補上，原本整個營養系統完全沒有） ── */}
                                    <div className="mb-5 p-4 rounded-[18px] bg-[#F9F8F6] border border-[#EAE7E0]">
                                        <div className="flex items-center gap-1.5 mb-2">
                                            <AlertCircle size={13} className="text-[#161415]/45 shrink-0" />
                                            <p className="text-[12px] font-black tracking-widest text-[#161415]/70">
                                                安心使用
                                            </p>
                                        </div>
                                        <ul className="text-xs text-[#161415]/60 leading-relaxed list-disc pl-4 space-y-1.5">
                                            <li>以上都是根據一般成人公式做的<b className="text-[#161415]/80">估算</b>，不是醫療診斷或治療建議。</li>
                                            <li>實際需求會因體質、作息、用藥、壓力而不同，數字僅供參考。</li>
                                            <li>如果你有糖尿病、腎臟疾病、飲食失調病史，或正在懷孕／哺乳，請先諮詢醫師或營養師再調整目標。</li>
                                            <li>身體出現不適時，以身體的感受為準，不要為了達標硬撐。</li>
                                        </ul>
                                    </div>

                                    <motion.button {...pressProps('pill')} onClick={() => setShowBurnRefPopup(false)} className="w-full py-4 rounded-[18px] text-xs font-black tracking-widest text-white bg-[#161415] shadow-[0_4px_15px_rgba(22,20,21,0.2)] uppercase">
                                        了解並關閉
                                    </motion.button>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            )}
        </AnimatePresence>
    );
}, (prev, next) => {
    // 自訂淺比較：只在「實際影響圖表渲染」的資料 props 改變時才 re-render。
    // 刻意忽略 onClose/onSave 的函式參照（父層 inline 定義每次都新建，
    // 但行為等價），避免父層 76 個 state 任一變動就連帶重算此重組件圖表。
    return (
        prev.isOpen === next.isOpen &&
        prev.currentWeight === next.currentWeight &&
        prev.profile === next.profile &&
        prev.tdee === next.tdee &&
        prev.dynamicTDEEActive === next.dynamicTDEEActive &&
        prev.userId === next.userId &&
        prev.activityBurn === next.activityBurn &&
        prev.workoutData === next.workoutData &&
        prev.history === next.history
    );
});
BodyRecompPlanner.displayName = 'BodyRecompPlanner';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Module-level persistent cache — survives React unmount/remount.
// Keyed by userId. Populated after first successful fetchData().
// On re-navigation, state initialises FROM cache → zero loading flash.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const _nutritionCache = new Map();

/* ═══════════════════════════════════════════════════════════════════
   單筆飲食輸入的合理範圍
   ─────────────────────────────────────────────────────────────────
   熱量 10000 kcal：一餐吃到一萬大卡已是極端值（一般大餐 1500–2500），
                    這個上限只攔「多按一個 0」的誤觸。
   三大營養素 2000 g：任一巨量營養素單餐 2 公斤同理。
   水 5000 ml：單次補水 5 公升是水中毒等級，更多必為誤觸。
   ═══════════════════════════════════════════════════════════════ */
const NUTRI_LIMITS = {
    // 單筆食物份量 3 公斤：再多就是多打一個 0（300 → 3000 還算吃得到一大鍋，30000 不可能）
    grams:    { min: 0, max: 3000 },
    calories: { min: 0, max: 10000 },
    macro:    { min: 0, max: 2000 },
    water:    { min: 0, max: 5000 },
};

/** 收斂到合理範圍；空值／NaN 一律回 0，不讓 undefined 進當日累計 */
const clampNutri = (v, { min, max }) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
};

/* ═══════════════════════════════════════════════════════════════════
   💡 MACRO_INFO — 點營養素環／補給條會看到的說明
   ───────────────────────────────────────────────────────────────────
   稽核發現：Hero 卡上只有數字，沒有任何一個地方解釋
   「蛋白質 /168g 這個目標是誰決定的、吃不到會怎樣」。
   使用者看不懂的數字等於沒有顯示。三句話講完：
   這是什麼 → 目標怎麼來 → 沒達到會怎樣。不寫論文。
   ═══════════════════════════════════════════════════════════════════ */
// copy-rules: allow-long — 點營養素環才展開的說明卡；使用者主動想知道才會看到，這裡本來就該把話講完
/** 食物圖示的唯一畫法：使用者換過的照片 / emoji 優先，沒換就用食物本身帶的。 */
const FoodIcon = ({ icons, food, fallback = '🍽️', size = 24, className = '', style = {} }) => {
    const ic = resolveFoodIcon(icons, food, fallback);
    if (ic.image) {
        return (
            <img
                src={ic.image} alt="" loading="lazy" decoding="async" className={className}
                style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), objectFit: 'cover', ...style }}
            />
        );
    }
    return <span className={className} style={{ fontSize: size, lineHeight: 1, ...style }}>{ic.emoji}</span>;
};

const MACRO_INFO = {
    protein: {
        title: '蛋白質',
        what: '身體修補肌肉的材料。訓練把肌纖維拆開，蛋白質負責把它補回去、而且補得比原本強一點。',
        goal: '目標是用你的體重算的：減脂期每公斤 2.2 公克、增肌期 2.0 公克 —— 減脂時要吃更多，因為熱量赤字下肌肉最容易被拿去燒掉。',
        miss: '持續攝取不足可能影響肌肉維持與恢復。可在每餐加入蛋、豆、魚或肉，並觀察整週攝取與訓練表現。',
    },
    carbs: {
        title: '碳水化合物',
        what: '訓練當下的燃料。存在肌肉裡叫肝醣，是你做最後幾下還推得動的原因。',
        goal: '蛋白質與脂肪先鎖定，剩下的熱量全部給碳水 —— 所以碳水目標會隨你的熱量目標一起浮動。',
        miss: '碳水不足可能影響高強度或長時間訓練。疲勞也與睡眠、總熱量及恢復有關，可先檢查訓練前後是否有主食。',
    },
    fats: {
        title: '脂肪',
        what: '荷爾蒙的原料，睪固酮與雌激素都靠它合成，也負責帶脂溶性維生素進體內。',
        goal: '依計劃熱量與營養分配估算；這是規劃值，不是所有人都適用的最低攝取量。可從魚、堅果與烹調油適量攝取。',
        miss: '長期壓太低會影響荷爾蒙、睡眠與情緒，減脂效果反而變差。',
    },
    fiber: {
        title: '膳食纖維',
        what: '不會被消化吸收，但能延緩血糖上升、讓你比較久不餓，也照顧腸道菌相。',
        goal: '每天 30 公克。這是成人建議量的中位數，不隨體重變動。',
        miss: '減脂期最容易缺 —— 吃得少纖維一起變少，然後就整天覺得餓。蔬菜與全穀是最省熱量的補法。',
    },
    water: {
        title: '水分',
        what: '肌肉約七成是水。缺水時力量輸出與專注力都會先掉，通常比你感覺到口渴更早。',
        goal: '畫面是依體重與運動量設定的飲水提醒估值，不是實測流汗量。請配合口渴、天氣與流汗情況分次補充；有醫囑限水時依醫囑。',
        miss: '單日少喝不至於怎樣，但長期缺水會讓訓練表現、恢復速度、甚至食慾判斷都失準。',
    },
};

const NutritionPageMobile = ({ userProfile, userId: propUserId }) => {
    const userId = propUserId || getUserId();
    const navigate = useNavigate();
    const location = useLocation();

    // 🗓️ 每日議程 → 營養日型提示（練「之前」就知道今天怎麼吃；練完後由 Training Context 接手）
    //    跑步磚讀本地快取（首頁抓 API 時寫入），跑步日/雙 session 日的文案也正確。
    const [agendaRevision, setAgendaRevision] = useState(0);
    useEffect(() => {
        let disposed = false;
        let version = 0;
        const refresh = async () => {
            const current = ++version;
            setAgendaRevision(n => n + 1);
            try {
                const { data } = await apiClient.get(`/api/cardio-plan/${userId}/this-week`);
                if (!disposed && current === version && Array.isArray(data?.bricks)) {
                    cacheWeekBricks(userId, data.bricks);
                    setAgendaRevision(n => n + 1);
                }
            } catch { /* Offline: retain cached schedule. */ }
        };
        refresh();
        window.addEventListener('training-program-changed', refresh);
        window.addEventListener('focus', refresh);
        return () => { disposed = true; window.removeEventListener('training-program-changed', refresh); window.removeEventListener('focus', refresh); };
    }, [userId]);
    const agendaHint = useMemo(() => {
        try {
            const dayOverrides = JSON.parse(localStorage.getItem(`u_${userId}_run_day_overrides`) || '{}');
            const a = getTodayAgenda({ ...loadStrengthInputs(userId), cardioBricks: loadCachedBricks(userId), dayOverrides });
            return a?.nutrition ? { ...a.nutrition, dayType: a.dayType } : null;
        } catch { return null; }
    }, [userId, agendaRevision]);

    // ── Check module-level cache BEFORE any useState ─────────────────
    const _cache = _nutritionCache.get(userId);
    const hasCachedData = Boolean(_cache);

    const [isRefreshing, setIsRefreshing] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [stats, setStats] = useState(() => _cache?.stats || { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, water: 0 });
    const pendingWaterMl = useRef(0); // 已送出、伺服器尚未確認的水量（見 handleQuickAddWater）
    // isFirstLoad: true only when we have NO cached data (genuine first visit)
    const isFirstLoad = useRef(!hasCachedData);
    const [nutritionMode, setNutritionMode] = useState('maintenance'); // cutting, maintenance, bulking
    const [userGoals, setUserGoals] = useState(null); // Loaded from backend
    const [history, setHistory] = useState(() => _cache?.history || []);
    // recentFoods declaration moved to Smart Engine section
    const [detailedMeals, setDetailedMeals] = useState({});
    const [expandedDates, setExpandedDates] = useState({});
    const [trainingHistory, setTrainingHistory] = useState([]); // 🔥 Training history for analysis
    // loading = false when we have cached data; spinner skipped entirely
    const [loading, setLoading] = useState(!hasCachedData);
    const [activeTab, setActiveTab] = useState('overview'); // overview, history, analysis
    const chartVis = useChartVisibility(); // 動態代謝、進食時鐘 = 會員的進階圖表；其餘分析卡是基本圖表
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingMeal, setEditingMeal] = useState(null);
    const [newMeal, setNewMeal] = useState({ name: '', emoji: '🍽️', image: null, calories: '', protein: '', carbs: '', fats: '', fiber: '', water: '', vegetables: '' });

    /* 手動輸入：熱量可以從營養素自己算出來（蛋白 4、碳水 4、脂肪 9 大卡/g）。
       使用者通常只知道其中一邊，沒必要兩邊都逼他填。
       一旦他自己改過熱量，就不再自動覆蓋 —— 那是他的數字。 */
    const [kcalEdited, setKcalEdited] = useState(false);
    useEffect(() => { if (showAddForm) setKcalEdited(false); }, [showAddForm]);
    const kcalFromMacros = useMemo(() => {
        const n = (v) => { const x = parseFloat(v); return Number.isFinite(x) && x > 0 ? x : 0; };
        const total = n(newMeal.protein) * 4 + n(newMeal.carbs) * 4 + n(newMeal.fats) * 9;
        return total > 0 ? Math.round(total) : null;
    }, [newMeal.protein, newMeal.carbs, newMeal.fats]);
    useEffect(() => {
        if (!showAddForm || kcalEdited || kcalFromMacros == null) return;
        setNewMeal((prev) => (String(prev.calories) === String(kcalFromMacros)
            ? prev : { ...prev, calories: String(kcalFromMacros) }));
    }, [kcalFromMacros, kcalEdited, showAddForm]);
    const customMealPhotoInputRef = useRef(null);

    const handleCustomMealPhotoUpload = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            triggerHaptic('medium');
            const reader = new FileReader();
            reader.onload = (event) => {
                setNewMeal(prev => ({ ...prev, image: event.target.result }));
            };
            reader.readAsDataURL(file);
        }
    };
    const [showChallengeCelebration, setShowChallengeCelebration] = useState(false);
    const [completedChallenge, setCompletedChallenge] = useState(null);
    const [todayMeals, setTodayMeals] = useState(() => _cache?.todayMeals || []); // 🔥 For Nutrient Timing

    /* 🩹 2026-08 稽核：真實的連續記錄天數。
       這裡原本兩處都寫死成 `todayMeals.length > 0 ? 1 : 0` —— 不管使用者連了
       3 天還是 30 天，畫面上永遠只會顯示 0 或 1，等於拿假數字冒充成就。
       widgetBridge 早就有正確實作（以 6 點日界線去重後累加），但只餵給
       iOS 桌面小工具。這裡接回同一支，App 與小工具講同一個數字。 */
    const nutriStreak = useMemo(() => {
        void todayMeals;   // 記完一餐要立刻反映到 streak
        try { return nutritionStreakDays(userId); } catch { return 0; }
    }, [userId, todayMeals]);

    /* 🩹 首頁的「今天還沒記錄任何一餐」在讀 nutrition_logged_<uid>_<date>，
       但全專案沒有任何地方寫過這個 key —— 所以那張提示每天傍晚都會出現，
       就算你今天記了五餐。今日餐點只存在這一頁的 state（來自 API），
       所以在這裡補一份本機鏡像給首頁用。 */
    useEffect(() => {
        if (!userId || !todayMeals?.length) return;
        try {
            localStorage.setItem(`nutrition_logged_${userId}_${toLocalDateKey(new Date())}`, '1');
        } catch { /* 無痕模式：首頁那張提示會多跳一次，不影響記錄 */ }
    }, [userId, todayMeals]);
    const [recentEntries, setRecentEntries] = useState(() => _cache?.recentEntries || []); // 🗓️ Multi-day diary
    const [loadingDates, setLoadingDates] = useState({});
    // Separate history for deep-analysis tab: logged_only=true, 90-day window
    // so sanitize() always gets real recorded days, not zero-filled placeholders
    const [analysisHistory, setAnalysisHistory] = useState([]);
    const [analysisFetched, setAnalysisFetched] = useState(false);
    const [historyTimeRange, setHistoryTimeRange] = useState(7); // 7, 14, 30 days
    const [showExplanation, setShowExplanation] = useState(false);
    /* 💡 點營養素環／補給條後彈出的「這是什麼」小卡。
       原本 Hero 卡上只有數字沒有解釋，使用者看到「/168g」不知道那個目標從哪來、
       也不知道吃不夠會怎樣。存的是 MACRO_INFO 的 key（protein / carbs / fats / fiber / water）。 */
    const [macroInfo, setMacroInfo] = useState(null);
    const [flyAnimData, setFlyAnimData] = useState(null);
    const [isQuickAddMode, setIsQuickAddMode] = useState(false);
    const [showPlanner, setShowPlanner] = useState(false);
    // 教練卡「調整計劃」要直接進編輯；其他入口照舊（有計劃就先看檢視模式）
    const [plannerEditOnOpen, setPlannerEditOnOpen] = useState(false);
    // 🎯 從「完整計劃」引導頁進來：直接把目標策略面板打開，並帶入建議的目標類型。
    //    只在掛載時判斷一次 —— 使用者關掉面板後不該又被自動彈開。
    const _focusSeed = location.state?.focusSeed || null;
    useEffect(() => {
        if (location.state?.openPlanner) setShowPlanner(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const [activePlan, setActivePlan] = useState(() => {
        // Use the same userId that NutritionPageMobile resolved (propUserId or JWT/guest)
        const resolvedId = propUserId || getUserId();
        try { return JSON.parse(localStorage.getItem(`drvn_nutrition_plan_${resolvedId}`)) || null; } catch { return null; }
    });
    useEffect(() => {
        const refreshPlan = () => {
            try { setActivePlan(JSON.parse(localStorage.getItem(`drvn_nutrition_plan_${userId}`) || 'null')); } catch { /* Keep the last readable plan. */ }
        };
        refreshPlan();
        window.addEventListener('training-program-changed', refreshPlan);
        window.addEventListener('storage', refreshPlan);
        return () => {
            window.removeEventListener('training-program-changed', refreshPlan);
            window.removeEventListener('storage', refreshPlan);
        };
    }, [userId]);

    // [Navigation toggler relocated below all state initializations]

    const [isFoodLogEditMode, setIsFoodLogEditMode] = useState(false);

    // ⭐ Starred / Frequent Foods (replaces customFavorites)
    const defaultFavorites = [
        { name: '水煮蛋', emoji: '🥚', calories: 144, protein: 12.6, carbs: 0.8, fats: 9.6, serving_size_g: 50, category: 'breakfast' },
        { name: '雞胸肉', emoji: '🍗', calories: 165, protein: 31, carbs: 0, fats: 3.6, serving_size_g: 100, category: 'lunch' },
        { name: '高蛋白', emoji: '🥤', calories: 400, protein: 80, carbs: 10, fats: 5, serving_size_g: 30, category: 'snacks' },
        { name: '香蕉', emoji: '🍌', calories: 89, protein: 1.1, carbs: 23, fats: 0.3, serving_size_g: 100, category: 'breakfast' },
        { name: '地瓜', emoji: '🍠', calories: 114, protein: 1.6, carbs: 27.8, fats: 0.1, serving_size_g: 100, category: 'lunch' }
    ];
    /* 🖼️ 食物圖示：使用者換過的 emoji / 照片。key 是食物名稱，
       所以快速加入、日記、詳情彈窗看到的都是同一個。 */
    const [foodIcons, setFoodIcons] = useState(() => readFoodIcons(userId));
    const [iconPickerFor, setIconPickerFor] = useState(null);   // 正在改圖示的食物名稱
    const iconFileRef = useRef(null);

    const applyFoodIcon = (name, icon) => {
        if (!setFoodIcon(userId, name, icon)) {
            toast.error('圖片存不下來，請換一張小一點的');
            return;
        }
        setFoodIcons(readFoodIcons(userId));
        triggerHaptic('light');
        setIconPickerFor(null);
    };

    const handleIconFile = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';                       // 同一張再選一次也要能觸發
        if (!file || !iconPickerFor) return;
        try {
            const dataUrl = await compressImageToDataUrl(file);
            applyFoodIcon(iconPickerFor, { image: dataUrl });
        } catch (err) {
            console.error('食物圖示上傳失敗', err);
            toast.error('這張圖讀不起來，請換一張');
        }
    };

    const [starredFoods, setStarredFoods] = useState(() => {
        try {
            const saved = localStorage.getItem(`drvn_starred_foods_${userId}`);
            if (saved) return JSON.parse(saved).map(f => ({ ...f, category: f.category || 'all' }));
            // Migrate existing favorites
            const old = localStorage.getItem(`drvn_favorites_${userId}`);
            if (old) return JSON.parse(old).map(f => ({ ...f, starredAt: Date.now(), category: 'all' }));
            return defaultFavorites.map(f => ({ ...f, starredAt: Date.now() }));
        } catch { return defaultFavorites.map(f => ({ ...f, starredAt: Date.now() })); }
    });
    const starredOwner = useRef(userId);
    useEffect(() => {
        if (starredOwner.current !== userId) return;
        // 存不下（照片太大、空間滿）不能讓整頁當掉：先試完整版，再退成不帶照片的版本
        try {
            localStorage.setItem(`drvn_starred_foods_${userId}`, JSON.stringify(starredFoods));
        } catch {
            try {
                const lite = starredFoods.map(f => (typeof f?.image === 'string' && f.image.startsWith('data:') ? { ...f, image: null } : f));
                localStorage.setItem(`drvn_starred_foods_${userId}`, JSON.stringify(lite));
            } catch (e) { console.warn('[starred] save failed', e?.message); }
        }
    }, [starredFoods, userId]);
    useEffect(() => {
        if (starredOwner.current === userId) return;
        starredOwner.current = userId;
        try {
            const saved = JSON.parse(localStorage.getItem(`drvn_starred_foods_${userId}`) || '[]');
            setStarredFoods(Array.isArray(saved) ? saved : []);
        } catch { setStarredFoods([]); }
    }, [userId]);

    const isStarred = (name) => starredFoods.some(f => f.name === name);
    /* ⚠️ 全程不出聲。資料格式換過是我們的事，使用者沒做過這個動作，
       跳一句「已匯入本機舊收藏，使用前請確認每 100 克營養值與實際份量」
       只會讓他對著一句看不懂的話發呆（drvn-interface-standard §4.4）。
       搬失敗也一樣不吵 —— 舊資料原封不動留在這台裝置上，沒有東西掉。 */
    const importLegacyFavorites = () => {
        try {
            const old = JSON.parse(localStorage.getItem('drvn_starred_foods') || localStorage.getItem('drvn_favorites') || '[]');
            if (!Array.isArray(old)) return;
            const usable = old.filter(f => f && typeof f.name === 'string');
            if (usable.length === 0) return;
            setStarredFoods(prev => [...prev, ...usable.filter(f => !prev.some(p => p.name === f.name))]);
        } catch { /* 搬不動就算了，舊資料還在原地 */ }
    };

    /* 舊收藏改成自動搬一次，不再放按鈕。
       「匯入舊收藏」對使用者是一句看不懂的話 —— 那是我們的資料格式換過，
       不是他要學的操作。搬完標記，之後不再重跑。 */
    useEffect(() => {
        if (!userId) return;
        const doneKey = `drvn_legacy_favs_migrated_${userId}`;
        try {
            if (localStorage.getItem(doneKey)) return;
            if (!localStorage.getItem('drvn_starred_foods') && !localStorage.getItem('drvn_favorites')) return;
            importLegacyFavorites();
            localStorage.setItem(doneKey, '1');
        } catch { /* 搬不動就算了，舊資料還在原地 */ }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);
    const [favCategorySelectFood, setFavCategorySelectFood] = useState(null);
    const [comboPendingLogData, setComboPendingLogData] = useState(null);
    const toggleStar = (food) => {
        triggerHaptic('light');
        setFavCategorySelectFood(food);
    };

    // 🛡️ 分類選單連點兩下：兩次呼叫拿到同一份 comboPendingLogData（state 還沒更新）→ 同一餐記兩筆
    const comboCommitRef = useRef(null);
    const completeCategoryStarredSave = (catId) => {
        if (comboPendingLogData) {
            if (comboCommitRef.current === comboPendingLogData) return;
            comboCommitRef.current = comboPendingLogData;
            const { starredTemplate, newEntry } = comboPendingLogData;

            // 1. Add template to starred foods
            const finalStarred = { ...starredTemplate, category: catId };
            setStarredFoods(prev => [finalStarred, ...prev.filter(f => f.name !== finalStarred.name)]);

            // 2. Add entry to logged meals
            const tempId = Date.now();
            const tempEntryWithId = {
                ...newEntry,
                id: tempId,
                emoji: finalStarred.emoji,
                image: finalStarred.image
            };
            setTodayMeals(prev => [tempEntryWithId, ...prev]);

            const round1 = (v) => Math.round(v * 10) / 10;
            setStats(prev => ({
                calories: Math.round((prev.calories || 0) + newEntry.calories),
                protein: round1((prev.protein || 0) + newEntry.protein),
                carbs: round1((prev.carbs || 0) + newEntry.carbs),
                fats: round1((prev.fats || 0) + newEntry.fats),
                fiber: round1((prev.fiber || 0) + (newEntry.fiber || 0)),
                water: (prev.water || 0)
            }));

            setHistory(prev => {
                const todayIndex = prev.findIndex(h => h.date === todayDate);
                if (todayIndex >= 0) {
                    const newHistory = [...prev];
                    newHistory[todayIndex] = {
                        ...newHistory[todayIndex],
                        calories: Math.round((newHistory[todayIndex].calories || 0) + newEntry.calories),
                        protein: round1((newHistory[todayIndex].protein || 0) + newEntry.protein),
                        carbs: round1((newHistory[todayIndex].carbs || 0) + newEntry.carbs),
                        fats: round1((newHistory[todayIndex].fats || 0) + newEntry.fats),
                        fiber: round1((newHistory[todayIndex].fiber || 0) + (newEntry.fiber || 0))
                    };
                    return newHistory;
                } else {
                    return [...prev, {
                        date: todayDate,
                        calories: Math.round(newEntry.calories),
                        protein: round1(newEntry.protein),
                        carbs: round1(newEntry.carbs),
                        fats: round1(newEntry.fats),
                        fiber: round1(newEntry.fiber || 0),
                        water: 0,
                        vegetables: 0
                    }];
                }
            });

            // Add normalized template to recentFoods
            setRecentFoods(prev => {
                return [finalStarred, ...prev.filter(f => f.name !== finalStarred.name)].slice(0, 20);
            });

            // Close all combo UI states
            setShowComboBuilder(false);
            setIsComboMode(false);
            setComboCart([]);
            setShowSmartSearch(false);
            setIsQuickAddMode(false);
            setSelectedFood(null);
            setSearchQuery('');
            setInputGrams(100);
            setComboImage(null);

            // Trigger flying animation
            setFlyAnimData({
                name: newEntry.name,
                calories: newEntry.calories,
                protein: newEntry.protein,
                carbs: newEntry.carbs,
                fats: newEntry.fats,
                emoji: finalStarred.emoji,
                image: finalStarred.image
            });
            setTimeout(() => setFlyAnimData(null), 3000);

            // Reset pending state
            setComboPendingLogData(null);

            // Post to backend database in background
            // 失敗不能只寫 console —— 畫面已經加上去了，要講清楚並重新讀一次，讓數字回到真的
            // 成功也要重讀：畫面上這筆是暫時 id，不換成伺服器 id 的話，馬上編輯／刪除會 404
            apiClient.post('/api/nutrition/sql/log', newEntry)
                .then(() => fetchData(true))
                .catch(err => {
                    console.error("Error logging combo to database:", err);
                    toast.error('這一餐沒有存到，請再記一次');
                    fetchData(true);
                });

        } else if (favCategorySelectFood) {
            // Standard favorite flow
            setStarredFoods(prev => {
                const filtered = prev.filter(f => f.name !== favCategorySelectFood.name);
                return [{ ...favCategorySelectFood, emoji: favCategorySelectFood.emoji || '⭐', starredAt: Date.now(), category: catId }, ...filtered];
            });
        }
        setFavCategorySelectFood(null);
        triggerHaptic('success');
    };
    const reorderStarred = (fromIdx, toIdx) => {
        setStarredFoods(prev => {
            const arr = [...prev];
            const [item] = arr.splice(fromIdx, 1);
            arr.splice(toIdx, 0, item);
            return arr;
        });
    };

    // Drag-to-reorder state for Quick Add
    const [showPortionGuide, setShowPortionGuide] = useState(false);
    const [dishCompOpen, setDishCompOpen] = useState(false); // 選份量卡：組成預設收起
    const [showRecommendedMeals, setShowRecommendedMeals] = useState(false);
    const [dragOverStarIdx, setDragOverStarIdx] = useState(null);
    const [dragStarIdx, setDragStarIdx] = useState(null);
    const [quickAddSortMode, setQuickAddSortMode] = useState(false);
    const [quickAddManualCat, setQuickAddManualCat] = useState(null); // null = 跟著時間自動；設定後手動覆蓋

    const today = toLocalDateKey(new Date());
    // 有快取 → 立即 true（0ms）；初次載入 → loading=false 時 fade-in；
    // 無資料也會 false → 顯示預設值 0，不會卡在佔位符
    const nutritionPatchReady = hasCachedData || !loading;

    // [NEW] 分類過濾 State
    const [activeCategoryFilter, setActiveCategoryFilter] = useState('all');

    const [showAddFav, setShowAddFav] = useState(false);
    const [editingStarred, setEditingStarred] = useState(null); // food being edited
    const [favIconOpen, setFavIconOpen] = useState(false);
    const [favMoreOpen, setFavMoreOpen] = useState(false);

    // Auto-detect current meal category by hour
    const getAutoMealCat = () => {
        const h = new Date().getHours();
        if (h >= 5 && h < 11) return 'breakfast';
        if (h >= 11 && h < 14) return 'lunch';
        if (h >= 14 && h < 21) return 'dinner';
        return 'snacks';
    };

    // 新增 category 欄位 — 預設根據當前時間自動選餐
    const [newFav, setNewFav] = useState({ name: '', emoji: '🍽️', image: null, calories: '', protein: '', carbs: '', fats: '', serving_size_g: 100, category: getAutoMealCat() });
    const favPhotoInputRef = useRef(null);

    const handleFavPhotoUpload = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            triggerHaptic('medium');
            const reader = new FileReader();
            reader.onload = (event) => {
                setNewFav(prev => ({ ...prev, image: event.target.result }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleAddFavSubmit = () => {
        if (!(newFav.name || '').trim() || !(Number(newFav.calories) > 0)) return;
        // 表單填的是「一份」，資料一律存每 100 g
        const g = parseInt(newFav.serving_size_g) || 100;
        const per100 = (v, dp = 1) => { const n = (parseFloat(v) || 0) * 100 / g; return dp ? Math.round(n * 10) / 10 : Math.round(n); };
        const newEntry = {
            ...newFav,
            id: newFav.id || `custom_${Date.now()}`,
            name: newFav.name.replace(/\s*[0\.]+\s*$/, '').trim(), // 防呆：儲存時強制移除 00 贅字
            calories: per100(newFav.calories, 0),
            protein: per100(newFav.protein),
            carbs: per100(newFav.carbs),
            fats: per100(newFav.fats),
            serving_size_g: g,
            starredAt: newFav.starredAt || Date.now(),
        };
        if (editingStarred !== null) {
            setStarredFoods(prev => prev.map((f, i) => i === editingStarred ? newEntry : f));
            setEditingStarred(null);
        } else {
            setStarredFoods(prev => [newEntry, ...prev]);
        }
        setShowAddFav(false);
        setFavIconOpen(false);
        setFavMoreOpen(false);
        // 從搜尋建的：清掉關鍵字，剛建好的那一個就在常用清單最上面
        setSearchQuery('');
        setActiveCategoryFilter('all');
        setNewFav({ name: '', emoji: '🍽️', image: null, calories: '', protein: '', carbs: '', fats: '', serving_size_g: 100, category: getAutoMealCat() });
    };

    // 每 100 g → 表單上的「一份」
    const favToForm = (f) => {
        const g = parseInt(f.serving_size_g) || 100;
        const per = (v, dp = 1) => { const n = (parseFloat(v) || 0) * g / 100; if (!n) return ''; return String(dp ? Math.round(n * 10) / 10 : Math.round(n)); };
        return { ...f, serving_size_g: g, calories: per(f.calories, 0), protein: per(f.protein), carbs: per(f.carbs), fats: per(f.fats) };
    };
    // 自己建一個：帶入搜尋框裡打的字
    const openCreateFood = (name = '') => {
        setEditingStarred(null);
        setFavIconOpen(false);
        setFavMoreOpen(false);
        setNewFav({ name: (name || '').trim(), emoji: '🍽️', image: null, calories: '', protein: '', carbs: '', fats: '', serving_size_g: 100, category: getAutoMealCat() });
        setShowAddFav(true);
    };

    const handleDeleteFav = (e, index) => {
        e.stopPropagation();
        setStarredFoods(prev => prev.filter((_, i) => i !== index));
    };

    // ── 🛒 Combo Mode / Mixed Meals States & Helper ──
    const [isComboMode, setIsComboMode] = useState(false);
    const [comboCart, setComboCart] = useState([]); // [{ food, grams, id }]
    const [showComboBuilder, setShowComboBuilder] = useState(false);
    const [comboName, setComboName] = useState('');
    const [comboEmoji, setComboEmoji] = useState('🍲');
    const [comboImage, setComboImage] = useState(null); // base64 string
    const comboPhotoInputRef = useRef(null);

    const handleComboPhotoUpload = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            triggerHaptic('medium');
            const reader = new FileReader();
            reader.onload = (event) => {
                // 手機原圖動輒好幾 MB，存進常用食物會撐爆本機空間 → 縮成 320px 的 JPEG
                const src = event.target.result;
                const img = new Image();
                img.onload = () => {
                    try {
                        const k = Math.min(1, 320 / Math.max(img.width, img.height));
                        const c = document.createElement('canvas');
                        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
                        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                        setComboImage(c.toDataURL('image/jpeg', 0.72));
                    } catch { setComboImage(null); }
                };
                img.onerror = () => setComboImage(null);
                img.src = src;
            };
            reader.readAsDataURL(file);
        }
    };

    const handleFoodClick = (food) => {
        if (isComboMode) {
            triggerHaptic('light');
            setComboCart(prev => {
                const exists = prev.some(item => item.food.name === food.name);
                if (exists) {
                    return prev.filter(item => item.food.name !== food.name);
                } else {
                    return [...prev, { food, grams: defaultGrams(food), id: Date.now() }];
                }
            });
        } else {
            setSelectedFood(food);
            setInputGrams(defaultGrams(food));
        }
    };

    // 🔥 State: 儲存今日日期字串，確保與後端一致
    /* 🔴 本地日期：toLocalDateKey 讀的已經是本地欄位（getFullYear/getMonth/getDate），
       再自己減一次 getTimezoneOffset 就是「校正兩次」——
       台灣（UTC+8）每天 16:00 之後會算成明天，晚上喝的水、吃的飯
       全部被記到隔天，讀回來當然對不上。統一走 todayKey()。 */
    const [todayDate, setTodayDate] = useState(() => todayKey());

    // 🔥 新增：動態驅動時段切換的計時器
    const [currentHour, setCurrentHour] = useState(new Date().getHours());
    useEffect(() => {
        // 每分鐘檢查一次小時是否改變，若改變則觸發畫面更新
        const timer = setInterval(() => {
            const now = new Date();
            const h = now.getHours();
            if (h !== currentHour) {
                setCurrentHour(h);
            }

            // ── 隔日檢查：同樣只認 todayKey()，不要再做第二次時區校正 ──
            const dStr = todayKey();
            if (dStr !== todayDate) {
                console.log(`[Nutrition] Date changed from ${todayDate} to ${dStr}. Refreshing...`);
                setTodayDate(dStr);
                // 這裡可以選擇性觸發 fetchData() 重新載入新的一天的數據
                // fetchData(); 
            }
        }, 60000);
        return () => clearInterval(timer);
    }, [currentHour, todayDate]);

    // 🔥 Workout data state for smart nutrition
    const [workoutData, setWorkoutData] = useState({
        totalBurn: 0,
        workoutType: 'rest',
        lastSession: null
    });

    // 🟢 iPhone HealthKit 今日「主動消耗熱量」(Active Energy Burned, kcal)
    //    來源：window.webkit.messageHandlers.fitnessApp.postMessage({type:'getActiveEnergy'})
    //    回傳：window.nativeBridge.onNativeEvent → {type:'activeEnergyResult', kcal:Number}
    //    用途：併入 netCalories 公式，讓「淨卡路里」反映身體真實活動量
    //    非 iOS / 無權限 → 維持 0，不影響原有 workoutData.totalBurn 計算
    const [hkActiveEnergy, setHkActiveEnergy] = useState(0);
    useEffect(() => {
        // 1. 設定回呼鏈（與 StepCounterRing 一樣的 nativeBridge.onNativeEvent pattern）
        const prev = window.nativeBridge?.onNativeEvent;
        if (!window.nativeBridge) window.nativeBridge = {};
        window.nativeBridge.onNativeEvent = (jsonStr) => {
            if (prev) { try { prev(jsonStr); } catch (_) { } }
            try {
                const evt = JSON.parse(jsonStr);
                if (evt && evt.type === 'activeEnergyResult') {
                    const kcal = parseInt(evt.kcal ?? evt.data?.kcal ?? 0, 10);
                    if (!isNaN(kcal)) setHkActiveEnergy(kcal);
                }
            } catch (_) { }
        };

        // 2. 發送 request — iOS 才會回應
        const ask = () => {
            try {
                window?.webkit?.messageHandlers?.fitnessApp?.postMessage({ type: 'getActiveEnergy' });
            } catch (_) { }
        };
        ask();
        const t = setInterval(ask, 60_000); // 每分鐘更新一次

        // 3. App 從背景回前景時也重抓
        const onVis = () => { if (!document.hidden) ask(); };
        document.addEventListener('visibilitychange', onVis);

        return () => {
            clearInterval(t);
            document.removeEventListener('visibilitychange', onVis);
            if (window.nativeBridge) window.nativeBridge.onNativeEvent = prev;
        };
    }, []);

    // 🔥 時間偵測邏輯：幾點就顯示幾點的菜單，也可手動切換
    const QUICK_ADD_CATS = [
        { id: 'breakfast', label: '早餐', emoji: '🌅' },
        { id: 'lunch', label: '午餐', emoji: '☀️' },
        { id: 'dinner', label: '晚餐', emoji: '🍽️' },
        { id: 'snacks', label: '點心', emoji: '☕' },
    ];

    /* 計劃裡挑的常吃食物 —— 提前算好給下面的快速新增用
       （preferredFoods 宣告在更下面，這裡不能直接引用）。 */
    const planFoods = useMemo(() => {
        let preferences = activePlan?.foodPrefs;
        if (!preferences) {
            try { preferences = JSON.parse(localStorage.getItem(`nutrition_food_prefs_${userId}`) || '{}'); } catch { preferences = {}; }
        }
        try { return preferredSearchFoods(preferences) || []; } catch { return []; }
    }, [activePlan, userId]);

    /* 這個人最常記錄什麼 —— 用來把常吃的自動往前排。
       資料來自真實的飲食日記（recentEntries），不是猜的。 */
    const logCounts = useMemo(() => {
        const counts = new Map();
        (recentEntries || []).forEach((day) => {
            (day?.meals || []).forEach((m) => {
                const k = String(m?.name || '').replace(/\s*[0.]+\s*$/, '').trim();
                if (k) counts.set(k, (counts.get(k) || 0) + 1);
            });
        });
        return counts;
    }, [recentEntries]);

    /* 弧線上的分餐刻度：每一餐的額度累積到哪裡。
       跟下面的分餐分頁共用同一份比例，兩邊不會對不上。 */
    const arcMealMarks = useMemo(() => {
        const out = [];
        let acc = 0;
        MEAL_SLOT_DEFS.forEach((sl) => {
            acc += sl.share;
            const id = sl.key === 'snack' ? 'snacks' : sl.key;
            if (acc >= 0.999) return;             // 最後一餐剛好在弧線尾端，畫了也看不到
            out.push({ id, pct: Math.round(acc * 1000) / 10, color: ({ breakfast: '#161415', lunch: '#F95C4B', dinner: '#F6F4F1' })[id] });
        });
        return out;
    }, []);

    const { currentCat, timeLabel, displayQuickFoods } = useMemo(() => {
        // 自動時間判斷
        let autoCat = 'snacks';
        let autoLabel = '宵夜 / 甜點';
        if (currentHour >= 5 && currentHour < 11) { autoCat = 'breakfast'; autoLabel = '早餐推薦'; }
        else if (currentHour >= 11 && currentHour < 14) { autoCat = 'lunch'; autoLabel = '午餐推薦'; }
        else if (currentHour >= 17 && currentHour < 21) { autoCat = 'dinner'; autoLabel = '晚餐推薦'; }
        else if (currentHour >= 14 && currentHour < 17) { autoCat = 'snacks'; autoLabel = '下午茶 / 甜點'; }

        // 手動覆蓋
        const cat = quickAddManualCat || autoCat;
        const catInfo = QUICK_ADD_CATS.find(c => c.id === cat);
        const label = quickAddManualCat ? catInfo.label : autoLabel;

        // Include both exact category match AND 'all' (foods added without specific category)
        const filtered = starredFoods.filter(f => f.category === cat || f.category === 'all');

        /* 計劃裡挑的「常吃的」也併進這一列 —— 它跟收藏做的是同一件事
           （點一下加進今天），本來分成上下兩區只是讓人多捲一段。
           收藏排前面（那是他自己加的），常吃的接在後面，重複的不再出現一次。 */
        const seen = new Set(filtered.map(f => (f.name || '').trim()));
        const fromPlan = (planFoods || []).filter(f => f && !seen.has((f.name || '').trim()));

        /* 記得最多次的排前面 —— 你每天都在記的那幾樣，不該每次都要往右滑才找得到。
           沒記錄過的維持原本順序（收藏在前、計劃挑的在後），所以新加的不會被埋掉。 */
        const merged = [...filtered, ...fromPlan];
        const freq = (f) => logCounts.get(String(f?.name || '').replace(/\s*[0.]+\s*$/, '').trim()) || 0;
        const ordered = merged
            .map((f, i) => ({ f, i, n: freq(f) }))
            .sort((a, b) => (b.n - a.n) || (a.i - b.i))
            .map((x) => x.f);

        return { currentCat: cat, timeLabel: label, displayQuickFoods: ordered };
    }, [starredFoods, currentHour, quickAddManualCat, planFoods, logCounts]);


    // 🔥 State: 儲存今日所有運動記錄（用於 Nutrient Timing 顯示多筆記錄）
    const [todayWorkouts, setTodayWorkouts] = useState([]);


    /* ⚖️ 體重只有一個來源：最近一次實測。沒量過就退到註冊時填的，
       兩個都沒有就回 0（= 不知道），讓引擎用它自己的預設值，
       不要在四個地方各自假裝使用者是 70 公斤。 */
    const realWeight = useMemo(() => {
        try {
            const w = Number(getLatestInBody(userId)?.weight_kg);
            if (w > 0) return w;
        } catch { /* 沒量測就往下退 */ }
        // 後端檔案的欄位是 weight_kg；只讀 current_weight 的話 onboarding 填的體重會被當成沒填
        const p = Number(userProfile?.current_weight) || Number(userProfile?.weight_kg) || Number(userProfile?.weight);
        return p > 0 ? p : 0;
    }, [userId, userProfile]);

    // 0a. BMR（獨立計算，供動態 TDEE 引擎使用）
    const bmr = useMemo(() => {
        try {
            const inbody = getLatestInBody(userId);
            return calcSmartBMR(userProfile || {}, inbody).bmr;
        } catch { return 1500; }
    }, [userProfile, userId]);

    // 0b. Dynamic TDEE — 能量守恆法（資料充足時驅動 LEFT 目標）
    //     依賴 history（歷史頁面同一份數據）+ InBody localStorage
    const dynamicTDEEResult = useMemo(() => {
        if (!history || history.length === 0) return null;
        try {
            return runDynamicTDEE({ mealHistory: history, bmr, userId });
        } catch { return null; }
    }, [history, bmr, userId]);

    // 1. Smart Nutrition Plan — auto-resolves InBody, training type, and goal from master_journey
    //    若動態 TDEE 數據充足（confidence=sufficient），用真實代謝覆蓋靜態活動係數估算
    const nutritionPlan = useMemo(() => {
        const tdeeOverride = (dynamicTDEEResult?.confidence === 'sufficient' && dynamicTDEEResult.tdee > 0)
            ? dynamicTDEEResult.tdee
            : null;
        return calculateFullNutrition({
            profile: userProfile,
            // inbody: auto-loaded from localStorage by engine
            mode: nutritionMode,        // user's manual override from UI; engine also checks journey goals
            // trainingType: auto-detected from master_journey schedule by engine
            workoutBurn: workoutData.totalBurn || 0,
            userId,
            tdeeOverride,              // null = fallback 靜態公式；有值 = 動態代謝驅動目標
        });
    }, [userProfile, nutritionMode, workoutData, userId, dynamicTDEEResult]);


    // Derived individual goals — 結合動態代謝與計劃配速的智慧引擎
    const GOALS = useMemo(() => {
        const currentWeight = realWeight;

        // 🎯 纖維與水分：以前 UI 寫 30／2500、推給後端寫 25／2500、成就在 2000 觸發，
        //    三邊各講各的。現在一律由 utils/nutritionTargets 推導，
        //    水分還會隨體重與當日運動消耗調整（不再是全人類都 2500）。
        const fiberGoal = resolveFiberGoal();
        const waterGoal = resolveWaterGoal(currentWeight, workoutData?.totalBurn || 0);
        const committed = committedNutritionGoals(activePlan);
        if (committed) return { ...committed, fiber: fiberGoal, water: waterGoal };

        if (activePlan) {
            // 1. 動態 TDEE 作為基準 (如果有足夠數據，強制覆蓋舊計劃的死數字)
            const currentBaseTDEE = (dynamicTDEEResult?.confidence === 'sufficient' && dynamicTDEEResult.tdee > 1000)
                ? dynamicTDEEResult.tdee
                : (activePlan.tdee || activePlan.intrinsicTDEE || nutritionPlan.tdee || 2000);

            // 2. 加上目標配速 (盈餘或赤字)
            const dailyDiff = ((activePlan.pace || 0) * 7700) / 7;
            let targetKcal = currentBaseTDEE;

            if (activePlan.goalType === 'bulk') {
                targetKcal += dailyDiff;
            } else if (activePlan.goalType === 'cut') {
                targetKcal -= dailyDiff;
                targetKcal = Math.max(1200, targetKcal); // 絕對防呆底線
            } else if (activePlan.goalType === 'recomp') {
                targetKcal = Math.round(currentBaseTDEE * 0.95);
            }

            // 3. 加上運動消耗補償
            const finalPlanKcal = Math.round(targetKcal + ((workoutData?.totalBurn || 0) > 0 ? workoutData.totalBurn * 0.5 : 0));

            // 4. 動態分配巨量營養素 (蛋白與脂肪錨定，剩餘熱量給碳水)
            const pro = activePlan.newProtein || Math.round(currentWeight * (activePlan.goalType === 'cut' ? 2.2 : 2.0));
            const fat = activePlan.newFat || Math.round(currentWeight * (activePlan.goalType === 'cut' ? 0.8 : 1.0));
            const carbs = Math.max(30, Math.round((finalPlanKcal - (pro * 4) - (fat * 9)) / 4));

            return {
                calories: finalPlanKcal,
                protein: pro,
                carbs: carbs,
                fats: fat,
                fiber: fiberGoal,
                water: waterGoal,
                tdee: currentBaseTDEE,
                mode: activePlan.goalType === 'cut' ? 'cutting' : activePlan.goalType === 'bulk' ? 'bulking' : 'maintenance',
            };
        }

        // 如果完全沒有設定計劃的 fallback
        return {
            calories: nutritionPlan.targetCalories,
            protein: nutritionPlan.protein,
            carbs: nutritionPlan.carbs,
            fats: nutritionPlan.fat,
            fiber: fiberGoal,
            water: waterGoal,
            tdee: nutritionPlan.tdee,
            mode: nutritionPlan.mode,
        };
    }, [nutritionPlan, activePlan, workoutData.totalBurn, dynamicTDEEResult, userProfile, realWeight]);

    // 🔴 Fix(targets)：把手機算好的每日營養目標推到後端，
    //    讓 Apple Watch 的 daily 端點讀得到「跟手機一模一樣」的目標。
    //    手機是唯一資料源（InBody / journey 都只在本機），故由手機 push。
    const lastPushedTargetsRef = useRef('');
    useEffect(() => {
        if (!userId || !GOALS) return;
        const payload = {
            user_id: userId,
            calories: Math.round(GOALS.calories || 0),
            protein:  Math.round(GOALS.protein || 0),
            carbs:    Math.round(GOALS.carbs || 0),
            fats:     Math.round(GOALS.fats || 0),
            // GOALS 現在一定帶得出 fiber / water（見上方 resolveFiberGoal / resolveWaterGoal），
            // 不再用 || 25、|| 2500 這種會讓手錶跟手機不同調的後備值。
            fiber:    Math.round(GOALS.fiber),
            water:    Math.round(GOALS.water),
            mode:     GOALS.mode || 'maintenance',
        };
        if (!(payload.calories > 0)) return;   // 還沒算好就先不推
        // 去重：目標沒變就不重複打 API
        const sig = JSON.stringify(payload);
        if (sig === lastPushedTargetsRef.current) return;
        lastPushedTargetsRef.current = sig;
        apiClient.post('/api/nutrition/sql/targets', payload).catch((e) => {
            console.warn('[Nutrition] push targets to backend failed:', e?.message || e);
        });
    }, [GOALS, userId]);

    // 2. 🔥 修正：判斷是否剛結束運動 (Expanded Window - 24 Hours)
    const isJustFinished = useMemo(() => {
        if (!workoutData.lastSession?.timestamp) {
            console.log('⚠️ isJustFinished: No lastSession timestamp');
            return false;
        }
        try {
            const sessionTime = new Date(workoutData.lastSession.timestamp).getTime();
            const now = Date.now();

            // 計算差異 (毫秒 -> 小時)
            const diffHours = (now - sessionTime) / (1000 * 60 * 60);

            console.log(`🕒 Recovery Window Check:`);
            console.log(`   Session: ${new Date(sessionTime).toLocaleString()}`);
            console.log(`   Now: ${new Date(now).toLocaleString()}`);
            console.log(`   Diff: ${diffHours.toFixed(2)} hours`);
            console.log(`   Within 24h window: ${diffHours > -0.1 && diffHours < 24.0}`);

            // 條件：過去 24 小時內，且不能是未來時間 (容錯 5分鐘)
            return diffHours > -0.1 && diffHours < 24.0;
        } catch (e) {
            console.error("Date error", e);
            return false;
        }
    }, [workoutData.lastSession]);

    // 3. Adjusted Goals (Now equal to GOALS because engine handles adjustment)
    const adjustedGoals = GOALS;

    // ─── ⚖️ 減脂／增重進度（單一真相源）───────────────────────────────────
    //  總覽頁的極簡行與分析頁的完整卡片都讀這一份，兩處數字不可能打架。
    //  依據是實測體重，不是熱量推估 —— 見 utils/cutProgress.js 的說明。
    //
    //  ⚠️ 這裡原本是 114 行的 dashboardChartData（熱量推估的體重預測曲線）。
    //     它的渲染處只用到 .length，算出來的 totalPts / labelEvery 也沒人用 ——
    //     註解寫著「Progress Chart」但圖表根本不存在。整段移除，
    //     進度改用實測資料呈現（推估曲線不該冒充進度）。
    const cutProgress = useMemo(
        () => computeCutProgress(userId, activePlan),
        [userId, activePlan]
    );

    /* 🧭 定期回診：跑步有週結算、重訓有課表進度，營養原本設定完就沒有人回頭看。
       這份摘要回答「現在該做什麼、為什麼、下次什麼時候再看」——
       判斷依據是實測體重（見 utils/nutritionCoach.js），不是熱量推估。 */
    const coachDigest = useMemo(
        () => buildCoachDigest(userId, activePlan),
        [userId, activePlan]
    );

    /* 提示看過就該收起來。以「狀況 + 日期」當簽名：
       同一件事同一天只講一次；狀況變了（例如從正常變成走反方向）或隔天，會再出現。 */
    /* 日型橫幅的「知道了」。簽章＝今天＋這句話：
       收掉只收今天這一句，隔天或訊息變了會再出現。 */
    const HINT_KEY = `nutrition_hint_seen_${userId || 'guest'}`;
    const hintSig = agendaHint ? `${todayDate}|${agendaHint.message}` : null;
    const [hintSeen, setHintSeen] = useState(() => {
        try { return localStorage.getItem(HINT_KEY) || ''; } catch { return ''; }
    });

    const COACH_KEY = `nutrition_coach_seen_${userId || 'guest'}`;
    const coachSig = coachDigest ? `${coachDigest.status}|${todayDate}` : null;
    const [coachSeen, setCoachSeen] = useState(() => {
        try { return localStorage.getItem(COACH_KEY) || ''; } catch { return ''; }
    });
    /* 達標時教練卡與下方計劃卡會講同一句話（「目標達成 · 可以開新的一期了」），
       而計劃卡本身就帶「開新的一期」按鈕 —— 讓計劃卡負責，教練卡讓位。 */
    /* 一個畫面只留一個提示。
       教練卡與下方的計劃卡是同一份 cutProgress 算出來的，狀態一樣時
       等於同一句話講兩遍 ——
         · 達標   → 兩邊都說「目標達成」，計劃卡還帶「開新的一期」按鈕
         · 沒量過 → 教練卡說「還沒量體重」，計劃卡說「開始之後還沒量過」
       這兩種狀態計劃卡本來就講得完整，教練卡讓位。
       其餘狀態（走反方向、太快、太慢）計劃卡不會講，才由教練卡出面。 */
    /* 一個畫面只留一個提示。
       計劃卡已移除（標題就是計劃），所以「還沒量體重／目標達成」這些
       全部交還給教練卡 —— 它是這一頁唯一的提示位。
       下方的日型橫幅（RUN DAY…）只在教練卡沒事要說時才出現。 */
    /* 🗓️ 每 4 週回饋（utils/nutritionCheckpoint）：到了就由它佔這一頁唯一的提示位，教練卡讓位。 */
    const [cpVersion, setCpVersion] = useState(0);
    const [checkpointOpen, setCheckpointOpen] = useState(false);
    const cpDue = useMemo(
        () => checkpointDue(activePlan, readCheckpointStore(userId)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [activePlan, userId, cpVersion, todayDate]
    );
    /* 回饋時存下的「下一期建議飲食」→ 快速新增的建議卡 */
    const [foodGuidance, setFoodGuidance] = useState(() => readFoodGuidance(userId));
    useEffect(() => {
        const reload = () => setFoodGuidance(readFoodGuidance(userId));
        reload();
        window.addEventListener('drvn:food-guidance-changed', reload);
        return () => window.removeEventListener('drvn:food-guidance-changed', reload);
    }, [userId]);
    const showCoach = !cpDue && !!coachDigest && coachSeen !== coachSig;
    const dismissCoach = () => {
        try { localStorage.setItem(COACH_KEY, coachSig); } catch { /* 隱私模式：這次就不記了 */ }
        setCoachSeen(coachSig);
    };

    // 切到深度分析時：用 logged_only=true 拉 90 天真實記錄天
    // 這樣 sanitize() 永遠拿到有真實數據的日子，不被零值天數稀釋。
    // 抽成具名函式：分頁按鈕與總覽頁的進度行都走同一條路。
    const openAnalysis = (force = false) => {
        setActiveTab('analysis');
        if (analysisFetched && force !== true) return;
        apiClient.get(`/api/nutrition/sql/history/${userId}?days=90&logged_only=true`)
            .then(res => {
                const raw = res?.data?.history || [];
                setAnalysisHistory(raw.map(day => {
                    const s2 = day.summary || {};
                    return {
                        date: day.date,
                        calories: s2.calories || s2.total_calories || 0,
                        protein: s2.protein || 0,
                        carbs: s2.carbs || 0,
                        fats: s2.fats || 0,
                        fiber: s2.fiber || 0,
                        water: s2.water || s2.water_ml || 0,
                        meal_count: day.meal_count,
                    };
                }));
                setAnalysisFetched(true);
            })
            .catch(() => {
                setAnalysisHistory(history.filter(d => d.calories > 0));
                setAnalysisFetched(true);
            });
    };

    // Data Fetching
    // --- Data Fetching ---
    const fetchData = async (isBackground = false) => {
        const fetchedPlanRevision = programRevision(userId);
        if (!isBackground) setLoading(true);
        else setIsRefreshing(true);

        try {
            console.log(`🔄 Fetching data for date: ${todayDate}`);

            const [dailyRes, historyRes, recentRes, workoutRes, strengthHistoryRes, goalsRes, inbodyRes] = await Promise.all([
                // 🔥 Use SQL Endpoint
                apiClient.get(`/api/nutrition/sql/daily/${userId}?date=${todayDate}`),
                // 歷史／常吃失敗不該拖垮今天的紀錄 —— 各自接住，失敗就保留畫面上原本的
                apiClient.get(`/api/nutrition/sql/history/${userId}?days=${historyTimeRange}`).catch(() => null),
                // 🔥 Use SQL Endpoint
                apiClient.get(`/api/nutrition/sql/recent/${userId}`).catch(() => null),
                // 🔥 關鍵：傳送 date 參數給 workout summary API
                apiClient.get(`/api/cardio/today-summary/${userId}?date=${todayDate}`).catch(e => ({ data: null })),
                // 🔥 額外獲取重訓歷史作為後備
                apiClient.get(`/api/workout/history/${userId}`).catch(e => ({ data: null })),
                // 🔥 Fetch Nutrition Goals
                apiClient.get(`/api/user/nutrition-goals/${userId}`).catch(e => ({ data: null })),
                // 🔥 Fetch InBody History to ensure sync
                apiClient.get(`/api/user/inbody-history/${userId}?limit=20`).catch(e => ({ data: { history: [] } }))
            ]);

            const currentStats = dailyRes?.data?.summary || { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, water: 0 };

            setStats(prev => ({
                ...prev,
                ...currentStats,
                // 伺服器真值 ＋ 還在路上的加水量（pending），不靠時間窗猜
                water: Math.max(0, Number(currentStats.water) || 0) + pendingWaterMl.current,
            }));
            setTodayMeals(dailyRes?.data?.meals || []);

            // 🗓️ Fetch recent diary entries (last 3 days) for Food Log persistence
            try {
                const recentRes = await apiClient.get(`/api/nutrition/sql/recent-entries/${userId}?days=3`);
                setRecentEntries(recentRes?.data?.days || []);
            } catch (e) {
                console.warn('[Nutrition] Could not fetch recent entries:', e.message);
            }

            // Process history to flatten summary structure for charts
            // TODO: Migrate history to SQL as well
            const rawHistory = historyRes?.data?.history || [];
            if (historyRes) {
            const processedHistory = rawHistory.map(day => {
                const s = day.summary || {};
                return {
                    date: day.date,
                    calories: s.calories || s.total_calories || 0,
                    protein: s.protein || 0,
                    carbs: s.carbs || 0,
                    fats: s.fats || 0,
                    fiber: s.fiber || 0,
                    water: s.water || s.water_ml || 0,
                    meal_count: day.meal_count
                };
            });
            setHistory(processedHistory);
            }
            setAnalysisFetched(false);
            setDetailedMeals({});
            if (activeTab === 'analysis') openAnalysis(true);
            if (recentRes) setRecentFoods(recentRes?.data?.results || []); // Note: SQL returns {results: [...]}

            let finalWorkoutData = {
                totalBurn: 0,
                workoutType: 'rest',
                lastSession: null
            };
            let allWorkoutsToday = [];

            // 🔥 獲取今日所有運動（跑步 + 重訓）
            console.log('🔍 Fetching cardio data for user:', userId);
            const cardioSessions = await apiClient.get(`/api/cardio/sessions/${userId}?limit=20`).catch((err) => {
                console.error('❌ Cardio fetch error:', err);
                return { data: { sessions: [] } };
            });
            console.log('✅ Cardio fetch response:', cardioSessions);
            const todayStr = todayDate;

            // 過濾今天的跑步記錄
            const todayCardio = (cardioSessions?.data?.sessions || []).filter(s =>
                s.date && s.date.startsWith(todayStr)
            );

            // Process Training History for Analysis Charts
            const tHistory = [];
            // Merge cardio
            (cardioSessions?.data?.sessions || []).forEach(s => {
                tHistory.push({
                    date: s.date,
                    duration: s.duration_seconds || (s.duration_minutes * 60) || 0,
                    distance: s.distance_km || 0,
                    type: 'cardio'
                });
            });
            // Merge strength
            (strengthHistoryRes?.data?.history || []).forEach(s => {
                tHistory.push({
                    date: s.timestamp,
                    duration: s.duration_seconds || (s.duration_minutes * 60) || 2700, // Default 45m for strength if missing
                    distance: 0,
                    type: 'strength'
                });
            });
            setTrainingHistory(tHistory);

            // 過濾今天的重訓記錄
            const todayStrength = (strengthHistoryRes?.data?.history || []).filter(w =>
                w.timestamp && (w.timestamp.startsWith(todayStr) || w.timestamp.includes(todayStr))
            );

            // 組合所有今日運動記錄為統一格式
            todayCardio.forEach(s => {
                allWorkoutsToday.push({
                    timestamp: s.date,  // sessions API 使用 date 欄位
                    duration: s.metrics?.duration || 0,
                    calories: s.metrics?.calories || 0,
                    type: 'run'
                });
            });

            todayStrength.forEach(s => {
                allWorkoutsToday.push({
                    timestamp: s.timestamp,
                    duration: s.duration_seconds || 0,
                    calories: s.calories_est || s.calories || 0,
                    type: 'strength'
                });
            });

            console.log(`🔥 Found ${allWorkoutsToday.length} workouts today (${todayCardio.length} cardio + ${todayStrength.length} strength)`);
            console.log('📊 Today workouts:', allWorkoutsToday);
            console.log('🏃 Cardio sessions raw:', cardioSessions?.data?.sessions);
            console.log('💪 Strength sessions raw:', strengthHistoryRes?.data?.history?.slice(0, 3));
            setTodayWorkouts(allWorkoutsToday);

            // Process InBody History
            const backendInBody = inbodyRes?.data?.history || [];
            if (backendInBody.length > 0) {
                let localRecords = [];
                try { localRecords = JSON.parse(localStorage.getItem(`inbody_local_${userId}`) || '[]'); } catch { }

                const normalizeRecord = (r) => {
                    const n = { ...r };
                    if (!n.measurement_date && n.date) n.measurement_date = n.date;
                    if (n.weight !== undefined && n.weight_kg === undefined) n.weight_kg = n.weight;
                    if (n.body_fat_percentage !== undefined && n.body_fat_percent === undefined) n.body_fat_percent = n.body_fat_percentage;
                    if (n.muscle_mass !== undefined && n.skeletal_muscle_mass === undefined) n.skeletal_muscle_mass = n.muscle_mass;
                    return n;
                };

                const backendIds = new Set(backendInBody.map(r => r.record_id));
                const localOnly = localRecords.filter(r => !backendIds.has(r.record_id));
                const merged = [...localOnly, ...backendInBody]
                    .map(normalizeRecord)
                    .sort((a, b) => new Date(b.measurement_date || b.date) - new Date(a.measurement_date || a.date));

                try { localStorage.setItem(`inbody_local_${userId}`, JSON.stringify(merged.slice(0, 50))); } catch { }
            }

            if (workoutRes?.data) {
                console.log('═══════════════════════════════════════');
                console.log('🔥 WORKOUT DATA FROM BACKEND:');
                console.log('   Total Burn:', workoutRes.data.total_burn);

                finalWorkoutData = {
                    totalBurn: workoutRes.data.total_burn || 0,
                    workoutType: workoutRes.data.workout_type || 'rest',
                    lastSession: workoutRes.data.last_session || null
                };
            }

            if (finalWorkoutData.totalBurn === 0 && allWorkoutsToday.length > 0) {
                const totalBurn = allWorkoutsToday.reduce((sum, w) => sum + (w.calories || 0), 0);
                finalWorkoutData.totalBurn = totalBurn;
                finalWorkoutData.workoutType = allWorkoutsToday.some(w => w.type === 'run') && allWorkoutsToday.some(w => w.type === 'strength') ? 'mixed' :
                    allWorkoutsToday.some(w => w.type === 'run') ? 'run' : 'strength';
            }

            // [NEW] Set Nutrition Mode from Backend (using goalsRes from Promise.all)
            if (goalsRes?.data && fetchedPlanRevision === programRevision(userId)) {
                if (goalsRes.data.plan) {
                    const raw = JSON.stringify(goalsRes.data.plan);
                    if (localStorage.getItem(`drvn_nutrition_plan_${userId}`) !== raw) publishProgram(userId, { nutrition: goalsRes.data.plan });
                    setActivePlan(goalsRes.data.plan);
                }
                setNutritionMode(goalsRes.data.mode || 'maintenance');
                setUserGoals(goalsRes.data);
                /* 🩹 2026-08 稽核：營養目標只存在後端，但打卡面板（DailyCheckinPanel）
                   是同步函式、打不了 API —— 這就是它以前只能用「有記錄就算完成」的原因。
                   這裡把目標熱量順手快取到 user storage，讓打卡面板能算達成率。
                   讀不到快取時打卡面板會退回舊行為，不會卡住沒設目標的人。 */
                try { uSet(userId, 'nutrition_goals', goalsRes.data); } catch { /* 快取失敗不影響主流程 */ }
            }

            // 🔥 獨立修復：找出「絕對」最新的運動（跨日也能偵測）
            // Combine all available raw sessions for finding true `lastSession`
            const allRawSessions = [];
            (cardioSessions?.data?.sessions || []).forEach(s => {
                allRawSessions.push({
                    timestamp: s.date,
                    duration: s.metrics?.duration || 0,
                    calories: s.metrics?.calories || 0,
                    type: 'run'
                });
            });
            (strengthHistoryRes?.data?.history || []).forEach(s => {
                allRawSessions.push({
                    timestamp: s.timestamp,
                    duration: s.duration_seconds || 0,
                    calories: s.calories_est || s.calories || 0,
                    type: 'strength'
                });
            });

            const trueLatest = allRawSessions.reduce((latest, w) => {
                if (!latest) return w;
                return new Date(w.timestamp) > new Date(latest.timestamp) ? w : latest;
            }, null);

            if (trueLatest) {
                console.log('✅ Found true latest session from history:', trueLatest);
                finalWorkoutData.lastSession = trueLatest;

                // 🔥 Functional Day Logic: If today's burn is 0 but we have a recent session (within 12h),
                // treat it as the active context for the UI (Ring, Colors, Text).
                const hoursSince = (new Date().getTime() - new Date(trueLatest.timestamp).getTime()) / (1000 * 60 * 60);
                if (finalWorkoutData.totalBurn === 0 && hoursSince < 12) {
                    console.log(`🌙 Night Owl / Early Morning Mode: Using session from ${hoursSince.toFixed(1)}h ago`);
                    finalWorkoutData.totalBurn = trueLatest.calories || 0;
                    finalWorkoutData.workoutType = trueLatest.type || 'run';

                    // 🔥 Hack: Populate todayWorkouts so NutrientTimingCard can render the timeline
                    if (!allWorkoutsToday.length) {
                        const carriedSession = {
                            timestamp: trueLatest.timestamp,
                            duration: trueLatest.duration || 3600,
                            calories: trueLatest.calories || 0,
                            type: trueLatest.type || 'run'
                        };
                        // Direct state update won't work inside immediate render cycle perfectly, 
                        // but for this component structure it's okay or we return it
                        setTodayWorkouts([carriedSession]);
                    }
                }
            }

            console.log('✅ Final Workout Data:', finalWorkoutData);

            setWorkoutData(finalWorkoutData);

            // ── Persist to module-level cache ──────────────────────────
            // Next time user navigates here, state initialises from this
            // cache → loading = false from the very first render.
            _nutritionCache.set(userId, {
                stats: dailyRes?.data?.summary || { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, water: 0 },
                history: (historyRes?.data?.history || []).map(day => {
                    const s = day.summary || {};
                    return { date: day.date, calories: s.calories || 0, protein: s.protein || 0, carbs: s.carbs || 0, fats: s.fats || 0, fiber: s.fiber || 0, water: s.water || 0, meal_count: day.meal_count };
                }),
                todayMeals: dailyRes?.data?.meals || [],
                recentEntries: [],  // populated separately below
            });

            setLoadError(false);
        } catch (error) {
            console.error("Fetch error:", error);
            // 今天的紀錄讀不到：畫面上的 0 不是真的 0 —— 要讓人知道，並能重試
            setLoadError(true);
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    };

    // [NEW] Helper to Calculate and Save Goals
    const handleModeChange = async (newMode) => {
        /* ⚠️ 沒有真實身體數據就不算、也不送。
           原本這裡會用「70kg／170cm／25歲／男」這個不存在的人算出熱量，
           蛋白與脂肪卻用真實的 0，然後 POST 出去：
               減脂 → 熱量 1859、蛋白 0g、脂肪 0g、碳水 465g
           這份目標同時是 Apple Watch 的唯一資料源，而且下一次會被當成
           「已知的 tdee」優先採用 —— 錯誤會自我固化。
           改成：缺資料就帶去補，補完再回來。 */
        const gate = biometricsGate(userId, userProfile);
        if (!gate.ok) {
            toast.info(gate.label);
            // gate.route 會依「缺哪幾項」挑一個真的補得完的頁面
            navigate(gate.route, { state: { returnTo: '/nutrition-mobile' } });
            return;
        }

        setNutritionMode(newMode);

        // Calculate new targets
        const weight = realWeight;
        // Estimate TDEE if missing (Mifflin-St Jeor + 1.375)
        // 🩹 原本把身高寫死 175、年齡寫死 25、性別寫死男性 —— 對女性使用者可以差 300+ kcal。
        //    改吃真實 profile；缺欄位時由引擎給統一的預設值。
        const tdee = userGoals?.tdee || calcTDEE(calcBMR_MifflinStJeor({
            weight,
            height: userProfile?.height || userProfile?.height_cm,
            age: userProfile?.age,
            gender: userProfile?.gender,
        }), 1.375);

        // 熱量與三大營養素的算法只有一份（utils/nutritionTargets），首次設定精靈也用同一支。
        const computed = macroGoalsForMode({ mode: newMode, tdee, weight });
        // 最後一道閘：任何一項不是正數就不送 —— 寧可沒有目標，也不要存一份錯的
        if (!computed) {
            toast.error('資料不足，這組目標沒有存起來');
            return;
        }
        const newGoals = { user_id: userId, ...computed };

        try {
            await apiClient.post('/api/user/nutrition-goals', newGoals);
            setUserGoals(newGoals);
            fetchData(true); // Refresh
        } catch (e) {
            console.error("Failed to save goals", e);
        }
    };

    // 處理 Planner 儲存邏輯
    const handleSaveStrategy = async ({ plan, programId }) => {
        const result = await activateProgram(userId, { program_id: programId, nutrition: plan }, apiClient);
        const saved = result.nutrition;
        const goals = committedNutritionGoals(saved);
        setActivePlan(saved);
        setNutritionMode(goals.mode);
        setUserGoals({ mode: goals.mode, target_calories: goals.calories,
            protein_target: goals.protein, carb_target: goals.carbs, fat_target: goals.fats, tdee: saved.tdee });
        /* 到這裡計劃已經存好了。之後的重新整理失敗只是畫面晚一點更新，
           不能讓它丟出去被呼叫端當成「存檔失敗」（使用者會再按一次、多開一期）。 */
        try { await fetchData(true); } catch (e) { console.warn('[nutrition] refresh after save failed', e); }
        triggerHaptic('success');
        try { recordFirst(userId, 'gen_nutrition_plan'); } catch { /* optional celebration */ }
        // 回傳後端存下的那一份：planId 會被換成 <program_id>:nutrition，呼叫端要用新的 id
        return saved;
    };

    // 🔥 自動刷新邏輯
    useEffect(() => {
        // 首次載入：完整 fetch（顯示 loading）
        // 之後 location.key 變動（從 workout 回來）：使用背景靜默刷新，保留既有資料
        const isFirst = isFirstLoad.current;
        isFirstLoad.current = false;
        fetchData(isFirst ? false : true); // 非首次改成 background mode，不清空 UI

        // On Focus (Silent Refresh)
        const onFocus = () => {
            fetchData(true);
        };
        window.addEventListener('focus', onFocus);

        return () => {
            window.removeEventListener('focus', onFocus);
        };
        // todayDate 也要在依賴裡：跨過午夜之後不重抓，畫面會停在昨天的數字，
        // 但新的記錄已經寫到今天 —— 加了東西看起來就像沒進去。
    }, [userId, historyTimeRange, location.key, todayDate]);

    const updateNutritionChallenges = async (mealData) => {
        try {
            const isHydration = mealData.name.toLowerCase().includes('water') || mealData.name.toLowerCase().includes('水');
            const result = await updateChallengeProgress(userId, {
                activity_type: isHydration ? 'hydration' : 'nutrition',
                calories: parseInt(mealData.calories),
                protein: parseInt(mealData.protein),
                carbs: parseInt(mealData.carbs),
                fats: parseInt(mealData.fats),
                water_ml: parseInt(mealData.water || 0),
                vegetables: parseInt(mealData.vegetables || 0),
                timestamp: new Date().toISOString(),
                met_goal: (stats.calories + parseInt(mealData.calories)) >= GOALS.calories * 0.9 &&
                    (stats.protein + parseInt(mealData.protein)) >= GOALS.protein * 0.8
            });

            if (result.badgesEarned && result.badgesEarned.length > 0) {
                setCompletedChallenge(result.badgesEarned[0].challenge);
                setShowChallengeCelebration(true);
            }
        } catch (error) {
            console.error('Failed to update challenge progress:', error);
        }
    };

    // --- Actions ---
    const handleAddMeal = async (e) => {
        if (e) e.preventDefault();
        const mealData = {
            name: newMeal.name || 'Unknown',
            emoji: newMeal.emoji || '🍽️',
            /* 🛡️ 界線防呆 —— 這些數字會累積成當日攝取，並回頭影響
               熱量赤字、體重預測曲線與後續的營養建議。
               單筆餐點打成 50000 kcal（多按一個 0）會讓當天整組建議失真，
               使用者卻只看到「今天已達標」而不知道是自己打錯。
               上限刻意放得比任何真實單餐都寬，只攔明顯的誤觸。 */
            calories: clampNutri(newMeal.calories, NUTRI_LIMITS.calories),
            protein: clampNutri(newMeal.protein, NUTRI_LIMITS.macro),
            carbs: clampNutri(newMeal.carbs, NUTRI_LIMITS.macro),
            fats: clampNutri(newMeal.fats, NUTRI_LIMITS.macro),
            fiber: clampNutri(newMeal.fiber, NUTRI_LIMITS.macro),
            water_ml: clampNutri(newMeal.water, NUTRI_LIMITS.water),
            grams: 100,
            date: todayDate,
            timestamp: new Date().toISOString(),
            user_id: userId
        };

        if (mealSaveInFlight.current) return;
        mealSaveInFlight.current = true;
        setSavingMeal(true);
        try {
            await apiClient.post('/api/nutrition/sql/log', mealData);
        } catch (error) {
            toast.error("儲存失敗，已保留輸入內容，請重試");
            return;
        } finally {
            mealSaveInFlight.current = false;
            setSavingMeal(false);
        }

        // Only show success after the server accepts the meal.
        const prevTodayMeals = [...todayMeals];
        const prevStats = { ...stats };
        const prevHistory = [...history];

        // Optimistic update before API
        const tempEntry = { ...mealData, id: `temp_${Date.now()}` };
        setTodayMeals(prev => [tempEntry, ...prev]);

        const round1 = (v) => Math.round(v * 10) / 10;

        setStats(prev => ({
            ...prev,
            calories: Math.round((prev.calories || 0) + mealData.calories),
            protein: round1((prev.protein || 0) + mealData.protein),
            carbs: round1((prev.carbs || 0) + mealData.carbs),
            fats: round1((prev.fats || 0) + mealData.fats),
            water: Math.round((prev.water || 0) + mealData.water_ml)
        }));
        setHistory(prev => {
            const todayIdx = prev.findIndex(h => h.date === todayDate);
            if (todayIdx >= 0) {
                const updated = [...prev];
                updated[todayIdx] = {
                    ...updated[todayIdx],
                    calories: Math.round((updated[todayIdx].calories || 0) + mealData.calories),
                    protein: round1((updated[todayIdx].protein || 0) + mealData.protein),
                    carbs: round1((updated[todayIdx].carbs || 0) + mealData.carbs),
                    fats: round1((updated[todayIdx].fats || 0) + mealData.fats),
                    water: Math.round((updated[todayIdx].water || 0) + mealData.water_ml)
                };
                return updated;
            } else {
                return [...prev, {
                    date: todayDate,
                    ...mealData,
                    protein: round1(mealData.protein),
                    carbs: round1(mealData.carbs),
                    fats: round1(mealData.fats),
                    water: mealData.water_ml
                }];
            }
        });

        // 🔥 新增：將手動輸入的餐點即時加入「Recent Local (最近紀錄)」，格式會自動顯示為 🕒 最近紀錄
        setRecentFoods(prev => {
            const newRecent = {
                name: mealData.name,
                emoji: mealData.emoji, // 🔥 讓 Recent 也能顯示 emoji
                calories: mealData.calories,
                protein: mealData.protein,
                carbs: mealData.carbs,
                fats: mealData.fats,
                fiber: mealData.fiber,
                serving_size_g: 100,
                is_global: false,
                is_tfda: false
            };
            // 放到最前面，並過濾掉同名舊紀錄
            return [newRecent, ...prev.filter(f => f.name !== newRecent.name)].slice(0, 20);
        });

        updateNutritionChallenges(newMeal);
        setNewMeal({ name: '', emoji: '🍽️', calories: '', protein: '', carbs: '', fats: '', fiber: '', water: '', vegetables: '' });
        setShowAddForm(false);

        // 🎉 達標慶祝：這一筆讓「蛋白質 / 熱量甜蜜區」首次達標 →
        //    Swiss 滿版編輯時刻（SwissMoment）＋ 原生三拍觸覺（rigid→medium→heavy）。
        //    每天每項只慶祝一次；零 emoji，走瑞士極簡運動編輯風。
        try {
            const newProtein = (prevStats.protein || 0) + mealData.protein;
            const newCal = (prevStats.calories || 0) + mealData.calories;
            const celebrate = async (key, moment) => {
                const dk = `drvn:nutriGoalHit_${key}_${userId}`;
                if (localStorage.getItem(dk) === todayDate) return;
                localStorage.setItem(dk, todayDate);
                try {
                    const [{ hapticCelebrate }, { fireMoment }] = await Promise.all([
                        import('../utils/haptics'), import('../utils/momentEngine'),
                    ]);
                    hapticCelebrate();
                    fireMoment(moment);
                } catch { /* */ }
            };
            if (GOALS?.protein > 0 && (prevStats.protein || 0) < GOALS.protein && newProtein >= GOALS.protein) {
                celebrate('protein', {
                    kicker: 'NUTRITION · 蛋白質達標',
                    theme: 'apple',
                    parts: [[`${Math.round(GOALS.protein)}g`, 'accent'], ['\n肌肉的建材，今天備齊。', 'main']],
                    holdMs: 2400,
                });
            }
            if (GOALS?.calories > 0 && newCal >= GOALS.calories * 0.9 && newCal <= GOALS.calories * 1.05 && (prevStats.calories || 0) < GOALS.calories * 0.9) {
                celebrate('calories', {
                    kicker: 'NUTRITION · 熱量甜蜜區',
                    theme: 'viola',
                    parts: [['落點正確。', 'accent'], ['\n今天的紀律，會變成下週的數字。', 'main']],
                    holdMs: 2400,
                });
            }
        } catch { /* 慶祝屬 nice-to-have */ }

        // ✨ 前幾次里程碑（第1/3/7「天」有記錄飲食）— 每邏輯日只計一次，
        //    同一天連加三筆食物不會連炸滿版。
        try {
            const dk = logicalDayKey(new Date());
            if (uGet(userId, 'momentNutriDay', '') !== dk) {
                uSet(userId, 'momentNutriDay', dk);
                recordAction(userId, 'nutrition_log', '記錄飲食');
            }
        } catch { /* */ }

        // 🚀 觸發高質感飛行動畫！
        setFlyAnimData({
            name: mealData.name,
            calories: mealData.calories,
            protein: mealData.protein,
            carbs: mealData.carbs,
            fats: mealData.fats,
        });

        await fetchData(true);
    };

    // 營養頁不提供 PDF 匯出：報告只有月報與進化日誌兩個出口（會員）。

    const [dismissedRecovery, setDismissedRecovery] = useState(false);

    // 🔁 一鍵複製某一天的所有餐點到今天 —— 降低日常記錄摩擦（天天吃差不多時最有感）。
    // 直接用已載入記憶體的 dayGroup.meals，逐筆丟進既有 log API，完成後刷新。
    const [isCopyingDay, setIsCopyingDay] = useState(false);
    /* 複製一整天是一筆一筆送的，中途斷線會「前幾筆進去了、後面沒有」。
       記下這一份清單已經送成功的是哪幾筆，重按一次只補沒進去的，不會重複記。 */
    const copyDayProgress = useRef({ sig: null, done: new Set() });
    const recoveryLogInFlight = useRef(false);
    // 複製預覽卡：{ source: 'yesterday'|'day', dateLabel, items: [{ ...meal, _include, _grams }] }
    const [copyPreview, setCopyPreview] = useState(null);

    // 開啟「複製預覽」卡，讓使用者逐項勾選/微調份量後再複製
    const openCopyPreview = (meals, dateLabel = '昨天', e) => {
        if (e) e.stopPropagation();
        if (!meals || meals.length === 0) return;
        triggerHaptic('light');
        setCopyPreview({
            dateLabel,
            items: meals.map((m, i) => ({
                ...m,
                _key: (m.name || 'item') + i,
                _include: true,
                _grams: m.grams || 100,
                _baseGrams: m.grams || 100,
                _baseCals: m.calories > 0 ? m.calories : Math.round((m.protein || 0) * 4 + (m.carbs || 0) * 4 + (m.fats || 0) * 9),
            })),
        });
    };
    const handleCopyDay = async (meals, e) => {
        if (e) e.stopPropagation();
        if (isCopyingDay || !meals || meals.length === 0) return;
        triggerHaptic('success');
        setIsCopyingDay(true);
        const sig = JSON.stringify(meals.map((m) => [m._key || m.id || m.name, m._grams || m.grams || 0]));
        if (copyDayProgress.current.sig !== sig) copyDayProgress.current = { sig, done: new Set() };
        const done = copyDayProgress.current.done;
        let ok = 0;
        try {
            for (const [idx, food] of meals.entries()) {
                if (done.has(idx)) continue;   // 上一次已經送成功的，不再送一次
                const cleanName = (food.name || '').replace(/\s*[0\.]+\s*$/, '').trim();
                const baseCals = food.calories > 0 ? food.calories
                    : Math.round((food.protein || 0) * 4 + (food.carbs || 0) * 4 + (food.fats || 0) * 9);
                // 依微調份量等比例縮放（_grams / _baseGrams）
                const baseG = food._baseGrams || food.grams || 100;
                const newG = food._grams || baseG;
                const scale = baseG > 0 ? newG / baseG : 1;
                const mealData = {
                    name: cleanName || food.name || 'Unknown',
                    calories: Math.round((baseCals || 0) * scale),
                    protein: +(parseFloat(food.protein || 0) * scale).toFixed(1),
                    carbs: +(parseFloat(food.carbs || 0) * scale).toFixed(1),
                    fats: +(parseFloat(food.fats || 0) * scale).toFixed(1),
                    fiber: +(parseFloat(food.fiber || 0) * scale).toFixed(1),
                    water_ml: Math.round(parseInt(food.water_ml || food.water || 0) * scale),
                    grams: Math.round(newG),
                    date: todayDate,
                    timestamp: new Date().toISOString(),
                    user_id: userId,
                };
                await apiClient.post('/api/nutrition/sql/log', mealData);
                done.add(idx);
                ok++;
            }
            copyDayProgress.current = { sig: null, done: new Set() };
            setCopyPreview(null);
            toast.success(`已複製 ${ok} 筆餐點到今天`);
            // 都存好了；重新整理失敗只是畫面晚一點更新，不算複製失敗
            try { await fetchData(); } catch { /* 下次聚焦會再抓 */ }
        } catch (error) {
            console.error('複製整天餐點失敗:', error);
            // 部分成功要講清楚，使用者才知道再按一次只會補剩下的
            toast.error(done.size > 0
                ? `已複製 ${done.size} 筆，其餘失敗，再按一次會補上剩下的`
                : '複製失敗，請稍後再試');
            fetchData();
        } finally {
            setIsCopyingDay(false);
        }
    };

    const handleSmartRecoveryLog = async (e) => {
        // 連點兩下不能記兩份恢復餐
        if (recoveryLogInFlight.current) return;
        recoveryLogInFlight.current = true;
        triggerHaptic('success');
        const weight = realWeight;
        const isRun = workoutData.lastSession?.type === 'run';
        const proteinRec = Math.max(20, Math.round(weight * (isRun ? 0.25 : 0.3)));
        const carbsRec = Math.max(30, Math.round(weight * (isRun ? 1.0 : 0.6)));
        const foodName = isRun ? '跑後補充餐 (⚡ Glycogen Restore)' : '重訓後補充餐 (💪 Muscle Rebuild)';

        const mealData = {
            user_id: userId,
            name: foodName,
            calories: (proteinRec * 4) + (carbsRec * 4) + 45,
            protein: proteinRec,
            carbs: carbsRec,
            fats: 5,
            water_ml: 500,
            grams: 100,
            date: todayDate,
            timestamp: new Date().toISOString()
        };

        /* 先樂觀更新畫面，但要留一份原狀：送不上去就整個還原（含恢復卡），
           不然畫面寫著已記錄、伺服器其實沒有，重新整理後那一餐就憑空消失。 */
        const snapshot = { todayMeals, stats, history, recentFoods };
        const tempEntry = { ...mealData, id: Date.now() };
        setTodayMeals(prev => [tempEntry, ...prev]);
        setStats(prev => ({
            ...prev,
            calories: (prev.calories || 0) + mealData.calories,
            protein: (prev.protein || 0) + mealData.protein,
            carbs: (prev.carbs || 0) + mealData.carbs,
            fats: (prev.fats || 0) + mealData.fats,
            water: (prev.water || 0) + mealData.water_ml
        }));
        setHistory(prev => {
            const todayIdx = prev.findIndex(h => h.date === todayDate);
            if (todayIdx >= 0) {
                const updated = [...prev];
                updated[todayIdx] = {
                    ...updated[todayIdx],
                    calories: (updated[todayIdx].calories || 0) + mealData.calories,
                    protein: (updated[todayIdx].protein || 0) + mealData.protein,
                    carbs: (updated[todayIdx].carbs || 0) + mealData.carbs,
                    fats: (updated[todayIdx].fats || 0) + mealData.fats
                };
                return updated;
            }
            return prev;
        });

        // 🔥 新增：將推薦恢復餐即時加入「Recent Local」
        setRecentFoods(prev => {
            const recFood = { ...mealData, is_global: false, is_tfda: false, serving_size_g: 100 };
            return [recFood, ...prev.filter(f => f.name !== recFood.name)].slice(0, 20);
        });

        if (e) {
            // 🚀 觸發高質感飛行動畫！
            setFlyAnimData({
                name: foodName,
                calories: mealData.calories,
                protein: mealData.protein,
                carbs: mealData.carbs,
                fats: mealData.fats,
            });
        }
        setDismissedRecovery(true);

        try {
            await apiClient.post('/api/nutrition/sql/log', mealData);
            fetchData();
        } catch (err) {
            console.error('Recovery log failed', err);
            setTodayMeals(snapshot.todayMeals);
            setStats(snapshot.stats);
            setHistory(snapshot.history);
            setRecentFoods(snapshot.recentFoods);
            setDismissedRecovery(false);
            toast.error('恢復餐沒有記到，請再按一次');
        } finally {
            recoveryLogInFlight.current = false;
        }
    };

    const handleQuickAdd = (food, e) => {
        triggerHaptic('light');
        if (!food) return;
        // Ensure food has required fields for calculator view
        const safeFood = {
            ...food,
            id: food.id || food.food_id || `recent_${Date.now()}`,
            calories: food.calories || 0,
            protein: food.protein || 0,
            carbs: food.carbs || 0,
            fats: food.fats || 0,
            fiber: food.fiber || 0,
            serving_size_g: food.serving_size_g || food.grams || 100,
        };
        setSelectedFood(safeFood);
        setInputGrams(defaultGrams(safeFood));
        setIsQuickAddMode(true);
        setShowSmartSearch(true);
    };

    const handleDeleteFood = async (foodName) => {
        if (!foodName) return;

        // 1. Optimistic Update
        setRecentFoods(prev => prev.filter(f => f.name !== foodName));

        try {
            // 2. API Call
            await apiClient.delete(`/api/nutrition/recent/${userId}/${encodeURIComponent(foodName)}`);
        } catch (error) {
            console.error("Error deleting food:", error);
            // Revert or refresh on failure
            fetchData();
        }
    };

    const fetchDetailedMeals = async (date, isToggle = true) => {
        if (isToggle && expandedDates[date]) {
            setExpandedDates(prev => ({ ...prev, [date]: false }));
            return;
        }
        if (detailedMeals[date]) {
            setExpandedDates(prev => ({ ...prev, [date]: true }));
            return;
        }
        setLoadingDates(prev => ({ ...prev, [date]: true }));
        try {
            const res = await apiClient.get(`/api/nutrition/sql/daily/${userId}?date=${date}`);
            setDetailedMeals(prev => ({ ...prev, [date]: res.data.meals || [] }));
            setExpandedDates(prev => ({ ...prev, [date]: true }));
        } catch (error) {
            console.error("Error fetching meals for date:", error);
        } finally {
            setLoadingDates(prev => ({ ...prev, [date]: false }));
        }
    };

    const handleEditMeal = (meal) => {
        setEditingMeal(meal);
        setNewMeal({
            name: meal.name,
            emoji: meal.emoji || '🍽️',
            calories: meal.calories?.toString() || '',
            protein: meal.protein?.toString() || '',
            carbs: meal.carbs?.toString() || '',
            fats: meal.fats?.toString() || '',
            fiber: meal.fiber?.toString() || '',
            water: meal.water_ml?.toString() || '',
            vegetables: meal.vegetables?.toString() || ''
        });
        setShowAddForm(true);
    };

    const handleDeleteMeal = async (mealId) => {
        if (!(await confirmDialog("確定要刪除這筆紀錄嗎？", { danger: true }))) return;

        if (mealSaveInFlight.current) return;
        mealSaveInFlight.current = true;
        try {
            await apiClient.delete(`/api/nutrition/sql/meal/${mealId}?user_id=${userId}`);
            triggerHaptic('light');
            await fetchData(true);
        } catch (error) {
            toast.error("刪除失敗，紀錄仍保留，請重試");
        } finally {
            mealSaveInFlight.current = false;
        }
    };

    const handleSaveMeal = async () => {
        if (!editingMeal) {
            handleAddMeal();
            return;
        }

        const mealId = editingMeal.id;
        const updatedFields = {
            user_id: userId,
            name: newMeal.name,
            // 編輯既有餐點走的是另一條路徑，界線防呆要一併套用，
            // 否則使用者「新增時被收斂、事後改回離譜值」就繞過去了。
            calories: clampNutri(newMeal.calories, NUTRI_LIMITS.calories),
            protein: clampNutri(newMeal.protein, NUTRI_LIMITS.macro),
            carbs: clampNutri(newMeal.carbs, NUTRI_LIMITS.macro),
            fats: clampNutri(newMeal.fats, NUTRI_LIMITS.macro),
            fiber: clampNutri(newMeal.fiber, NUTRI_LIMITS.macro),
            water_ml: clampNutri(newMeal.water, NUTRI_LIMITS.water),
        };

        if (mealSaveInFlight.current) return;
        mealSaveInFlight.current = true;
        setSavingMeal(true);
        try {
            try {
                await apiClient.put(`/api/nutrition/sql/meal/${mealId}`, updatedFields);
            } catch (putErr) {
                if (putErr?.response?.status === 405) {
                    // Server may not have reloaded the PUT route — fall back to PATCH
                    await apiClient.patch(`/api/nutrition/sql/meal/${mealId}`, updatedFields);
                } else {
                    throw putErr;
                }
            }
        // ── Optimistic Update: reflect change immediately in UI ───────────
        setTodayMeals(prev => prev.map(m => m.id === mealId ? { ...m, ...updatedFields } : m));
        setDetailedMeals(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(date => {
                next[date] = (next[date] || []).map(m =>
                    m.id === mealId ? { ...m, ...updatedFields } : m
                );
            });
            return next;
        });

        // Close form immediately for snappy UX
        setEditingMeal(null);
        setNewMeal({ name: '', emoji: '🍽️', calories: '', protein: '', carbs: '', fats: '', fiber: '', water: '', vegetables: '' });
        setShowAddForm(false);

            await fetchData(true);
        } catch (error) {
            console.error("Error updating meal:", error);
            toast.error("修改失敗，已保留編輯內容，請重試");
        } finally {
            mealSaveInFlight.current = false;
            setSavingMeal(false);
        }
    };

    /* 💧 加水 —— 樂觀顯示，但以伺服器為準對帳
       ──────────────────────────────────────────────────────────────
       舊版用「5 秒內不要相信伺服器」的時間窗擋抖動：超過 5 秒的請求、
       或請求根本失敗時，數字會自己彈回 0，而且失敗只寫進 console，
       畫面什麼都不說 —— 看起來就是「加了水都不會顯示」。

       改成記帳：pendingWaterMl 是「已經送出、伺服器還沒確認」的量。
         · 畫面 = 伺服器真值 + pending（永遠不會少算，也不會重複算）
         · POST 回來代表後端已 commit → pending 扣掉 → 再拉一次對帳
         · 失敗 → pending 扣掉、畫面退回去、而且明講失敗原因 */
    const handleQuickAddWater = async (amount) => {
        triggerHaptic('light');
        pendingWaterMl.current += amount;
        setStats(prev => ({ ...prev, water: (prev.water || 0) + amount }));

        try {
            await apiClient.post('/api/nutrition/sql/log', {
                user_id: userId,
                name: 'Hydration',
                calories: 0,
                protein: 0,
                carbs: 0,
                fats: 0,
                water_ml: amount,
                grams: 0,
                type: 'water',
                date: todayDate,
                timestamp: new Date().toISOString()
            });
            // 回應送達＝後端已寫入，pending 先歸帳再對帳，避免重複計算
            pendingWaterMl.current = Math.max(0, pendingWaterMl.current - amount);
            fetchData(true);
        } catch (err) {
            pendingWaterMl.current = Math.max(0, pendingWaterMl.current - amount);
            setStats(prev => ({ ...prev, water: Math.max(0, (prev.water || 0) - amount) }));
            const status = err?.response?.status;
            console.error('加水失敗', status ?? '(no response)', err);
            toast.error(
                !err?.response ? '連線失敗，這杯水沒記錄到'
                    : status === 401 ? '登入已過期，請重新登入'
                        : `記錄失敗（${status}），請重試`
            );
        }
    };

    // [NEW] Smart Engine State
    const [showSmartSearch, setShowSmartSearch] = useState(false);
    const [showAllVariations, setShowAllVariations] = useState(false);
    const logButtonRef = useRef(null);
    const isDraggingRef = useRef(false);
    const statsCardRef = useRef(null);

    // 🎮 Gamification Hooks
    const { activeMilestone, clearMilestone } = useMilestoneTracker(stats, adjustedGoals);
    const { showSuccess, successData, particleTrigger, particlePos, triggerFeedback } = useLogFeedback();
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchUnavailable, setSearchUnavailable] = useState(false);
    const [recentFoods, setRecentFoods] = useState([]); // [NEW] Recent Foods
    const [selectedFood, setSelectedFood] = useState(null);
    // 每次打開選份量卡：組成收起、換一組玻璃的顏色（每次都不同色）
    const [prismSeed, setPrismSeed] = useState(() => Math.random());
    // 營養素微調（這一筆的增減，公克）：資料庫的值跟你那一份不一樣時自己修；換食物就歸零
    const [macroAdj, setMacroAdj] = useState({ protein: 0, carbs: 0, fats: 0 });
    const [macroAdjOpen, setMacroAdjOpen] = useState(false);
    useEffect(() => {
        setDishCompOpen(false);
        setMacroAdj({ protein: 0, carbs: 0, fats: 0 });
        setMacroAdjOpen(false);
        if (selectedFood) setPrismSeed(Math.random());
    }, [selectedFood?.name]);
    const prismStyle = useMemo(() => prismPalette(prismSeed), [prismSeed]);
    const [inputGrams, setInputGrams] = useState(100);
    const mealSaveInFlight = useRef(false);
    const [savingMeal, setSavingMeal] = useState(false);
    const preferredFoods = useMemo(() => {
        let preferences = activePlan?.foodPrefs;
        if (!preferences) {
            try { preferences = JSON.parse(localStorage.getItem(`nutrition_food_prefs_${userId}`) || '{}'); } catch { preferences = {}; }
        }
        return preferredSearchFoods(preferences);
    }, [activePlan, userId, showSmartSearch]);
    // showScanner and isScanningStatus removed to reduce bundle size as requested

    // ⭐ 當任何全螢幕或滑動 Overlay 開啟時，隱藏全局導航列 (CapsuleNavigation)
    useEffect(() => {
        const shouldHide = showPlanner || showSmartSearch || showComboBuilder || showExplanation || !!selectedFood;
        const toggleNav = () => {
            window.dispatchEvent(new CustomEvent('toggle-capsule-nav', {
                detail: { hidden: shouldHide }
            }));
        };

        toggleNav();

        const handleVisibilityChange = () => {
            if (!document.hidden) toggleNav();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.dispatchEvent(new CustomEvent('toggle-capsule-nav', {
                detail: { hidden: false }
            }));
        };
    }, [showPlanner, showSmartSearch, showComboBuilder, showExplanation, selectedFood]);

    // [NEW] Handle Search
    // ── 3-tier Search: Local FTS5 → Local LIKE → Open Food Facts ──────
    useEffect(() => {
        if (!showSmartSearch) return;
        const abortController = new AbortController();

        const timer = setTimeout(async () => {
            if (searchQuery.trim().length > 0) {
                setIsSearching(true);
                setSearchUnavailable(false);
                const queryIsChinese = containsChinese(searchQuery);

                // ── Tier 0: 餐點層（本地、零延遲、排最前面）──────────────
                //  使用者吃的是「一個雞腿便當」，不是「白飯 250g ＋ 雞腿 130g」。
                //  TFDA 是原料表（便當 0 筆、牛肉麵 0 筆），只給原料等於要他
                //  自己拆料再秤重 —— 那是他做不到的事。餐點的每 100g 值由
                //  組成算出來（見 data/dishLibrary.js），所以下面的份量計算、
                //  組合模式、記錄流程完全不用改。
                const dishHits = searchDishes(searchQuery.trim(), 6).map(dishSearchFood).filter(Boolean);
                setSearchResults(dishHits);

                // 國際資料庫跟本地資料庫同時查（以前等本地回來才開始查國際，要多等一輪）
                const offLang = queryIsChinese ? '&lc=zh' : '';
                const offUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(searchQuery)}&json=1&page_size=15${offLang}`;
                /* 不帶自訂 header：自訂 User-Agent 會讓瀏覽器／App 先送 CORS 預檢，
                   Open Food Facts 擋掉預檢 → 手機上國際資料庫整個查不到。 */
                /* ⏱️ 國際資料庫要有上限：本地查不到時畫面只剩「搜尋中…」，
                   OFF 從台灣連線偶爾卡 30 秒以上，看起來就是當掉。8 秒沒回就當作查不到。 */
                const offCtrl = new AbortController();
                const offTimer = setTimeout(() => offCtrl.abort(), 8000);
                abortController.signal.addEventListener('abort', () => offCtrl.abort());
                const offPromise = fetch(offUrl, { signal: offCtrl.signal })
                    .then(r => { if (!r.ok) throw new Error('Food database unavailable'); return r.json(); })
                    // 逾時不是使用者取消：換成一般錯誤，讓下面照常顯示本地結果／「連不上」
                    .catch(err => ({ __err: (offCtrl.signal.aborted && !abortController.signal.aborted) ? new Error('Food database timeout') : err }))
                    .finally(() => clearTimeout(offTimer));

                try {
                    // ── Tier 1+2: Local backend (FTS5 with LIKE fallback built-in) ──
                    let localResults = [];
                    let localAvailable = false;
                    try {
                        const localRes = await apiClient.get(
                            `/api/nutrition/sql/search?q=${encodeURIComponent(searchQuery)}&limit=20`,
                            { signal: abortController.signal }
                        );
                        if (abortController.signal.aborted) return;
                        localAvailable = true;
                        localResults = localRes.data?.results || [];
                        setSearchResults([...dishHits, ...localResults]); // 餐點在前，原料在後
                        setShowAllVariations(false);
                    } catch (err) {
                        if (err.name === 'AbortError' || err.name === 'CanceledError') return;
                        console.warn('[FoodSearch] Local API failed:', err?.message);
                    }

                    // ── Tier 3: Open Food Facts ──────────
                    let globalResults = [];
                    try {
                        const offData = await offPromise;
                        if (offData?.__err) throw offData.__err;

                        globalResults = (offData.products || [])
                            .filter(p => p.product_name || p.product_name_zh)
                            .map(p => {
                                const bestName = p.product_name_zh_hant || p.product_name_zh || p.product_name_en || p.product_name || 'Unknown Product';
                                const originalCountry = p.countries_tags?.[0]?.replace('en:', '').toUpperCase() || 'WORLD';
                                return {
                                    id: `off_${p.code}`,
                                    name: bestName,
                                    brands: p.brands,
                                    calories: Math.round(p.nutriments?.['energy-kcal_100g'] || 0),
                                    protein: parseFloat(p.nutriments?.['proteins_100g'] || 0).toFixed(1),
                                    carbs: parseFloat(p.nutriments?.['carbohydrates_100g'] || 0).toFixed(1),
                                    fats: parseFloat(p.nutriments?.['fat_100g'] || 0).toFixed(1),
                                    fiber: parseFloat(p.nutriments?.['fiber_100g'] || 0).toFixed(1),
                                    is_global: true,
                                    image: p.image_front_thumb_url,
                                    country_code: originalCountry === 'TAIWAN' ? 'TW' : originalCountry,
                                };
                            });
                    } catch (offErr) {
                        if (offErr.name === 'AbortError' || offErr.name === 'CanceledError') return;
                        if (!localAvailable && !abortController.signal.aborted) setSearchUnavailable(true);
                        console.warn('[FoodSearch] Open Food Facts failed:', offErr?.message);
                    }

                    // ── Combine & rank (合併並去重) ─────────────────────────────────
                    const combined = [...localResults, ...globalResults].sort((a, b) => {
                        // 1. 來源權重：TFDA 絕對優先
                        // （旗標可能是 0／null／undefined／true —— 先轉成布林再比，不然排序會亂跳）
                        if (!!a.is_tfda !== !!b.is_tfda) return a.is_tfda ? -1 : 1;
                        if (!!a.is_global !== !!b.is_global) return a.is_global ? 1 : -1;

                        const nameA = (a.name || '').toLowerCase();
                        const nameB = (b.name || '').toLowerCase();
                        const query = searchQuery.toLowerCase();

                        // 2. 完全匹配優先 (Exact Match)
                        const aExact = nameA === query;
                        const bExact = nameB === query;
                        if (aExact && !bExact) return -1;
                        if (!aExact && bExact) return 1;

                        // 3. 醬料/調味料降權 (若使用者沒特別搜尋「醬」，則自動把調味料往後排)
                        const isCondiment = (name) => /醬|汁|粉|調味|風味|湯塊|料理塊/.test(name);
                        const queryIsCondiment = isCondiment(query);
                        if (!queryIsCondiment) {
                            const aCond = isCondiment(nameA);
                            const bCond = isCondiment(nameB);
                            if (aCond && !bCond) return 1;  // a是醬料，b不是 -> b優先
                            if (!aCond && bCond) return -1; // b是醬料，a不是 -> a優先
                        }

                        // 4. 中文優先度
                        if (queryIsChinese) {
                            const aZh = containsChinese(nameA);
                            const bZh = containsChinese(nameB);
                            if (aZh && !bZh) return -1;
                            if (!aZh && bZh) return 1;
                        }

                        // 5. 字串長度短的優先 (通常名稱越短，越接近原型食物。例如 "牛排" 勝過 "黑胡椒牛排")
                        const aContains = nameA.includes(query);
                        const bContains = nameB.includes(query);
                        if (aContains && bContains) {
                            if (nameA.length !== nameB.length) return nameA.length - nameB.length;
                        } else if (aContains && !bContains) {
                            return -1;
                        } else if (!aContains && bContains) {
                            return 1;
                        }

                        // 6. 圖片權重 (最後才比圖片，避免有圖的醬料贏過沒圖的主食)
                        const aHasImg = a.image || a.thumbnail || a.image_url ? 1 : 0;
                        const bHasImg = b.image || b.thumbnail || b.image_url ? 1 : 0;
                        return bHasImg - aHasImg;
                    });

                    // ── 智慧去重 & Atwater 卡路里自動補算邏輯 ──
                    const uniqueResults = [];
                    const seenSignatures = new Set();

                    combined.forEach(item => {
                        const pro = parseFloat(item.protein || 0);
                        const carb = parseFloat(item.carbs || 0);
                        const fat = parseFloat(item.fats || 0);
                        let cal = Math.round(item.calories || 0);

                        // 🔥 終極防呆：如果資料庫卡路里為 0 或小於 10，但三大營養素存在，自動幫他算！
                        if (cal <= 10 && (pro > 0 || carb > 0 || fat > 0)) {
                            cal = Math.round(pro * 4 + carb * 4 + fat * 9);
                            item.calories = cal; // 覆寫回 item
                        }

                        // 去重機制 (熱量、蛋白、脂肪 極度接近視為同一個項目)
                        const signature = foodSearchSignature(item);

                        if (!seenSignatures.has(signature)) {
                            seenSignatures.add(signature);
                            uniqueResults.push(item);
                        }
                    });

                    if (abortController.signal.aborted) return;
                    setSearchResults([...dishHits, ...uniqueResults.filter(r => !r.is_dish)]);
                    setShowAllVariations(false);

                } catch (e) {
                    if (e.name !== 'AbortError' && e.name !== 'CanceledError') {
                        console.error('[FoodSearch] Unexpected error:', e);
                    }
                } finally {
                    if (!abortController.signal.aborted) {
                        setIsSearching(false);
                    }
                }
            } else {
                setSearchResults([]);
                setIsSearching(false);
                fetchRecentFoods();
            }
        }, 400);

        return () => {
            clearTimeout(timer);
            abortController.abort();
        };
    }, [searchQuery, showSmartSearch]);

    // [NEW] 條碼掃描處理邏輯
    // eslint-disable-next-line no-unused-vars
    const handleBarcodeScan = async (decodedText) => {
        // showScanner / isScanningStatus 這兩個 state 已被移除（見 L3463），
        // 這裡不能再呼叫它們的 setter，否則一旦掃描 UI 被接回來就會整頁崩。
        setIsSearching(true);

        try {
            // 調用 Open Food Facts API v2 (精準條碼查詢)
            const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${decodedText}.json`);
            const data = await response.json();

            if (data.status === 1) {
                const p = data.product;
                const source = getFoodSourceInfo({ brands: p.brands, is_global: true });

                const scannedFood = {
                    id: `scan_${p.code}`,
                    name: p.product_name_zh || p.product_name || '未知掃描商品',
                    brands: p.brands,
                    calories: p.nutriments?.['energy-kcal_100g'] || 0,
                    protein: parseFloat(p.nutriments?.['proteins_100g'] || 0).toFixed(1),
                    carbs: parseFloat(p.nutriments?.['carbohydrates_100g'] || 0).toFixed(1),
                    fats: parseFloat(p.nutriments?.['fat_100g'] || 0).toFixed(1),
                    fiber: parseFloat(p.nutriments?.['fiber_100g'] || 0).toFixed(1),
                    is_global: true,
                    image: p.image_front_thumb_url,
                    country_code: p.countries_tags?.[0]?.replace('en:', '').toUpperCase() || 'WORLD',
                    brand_tag: source.label !== '全球庫' ? source : null
                };

                setSelectedFood(scannedFood);
                setInputGrams(100);
            } else {
                toast.info(`找不到條碼: ${decodedText}`);
            }
        } catch (error) {
            console.error('Barcode lookup failed', error);
            toast.error('掃描產品查詢失敗，請檢查網路。');
        } finally {
            setIsSearching(false);
        }
    };

    // [NEW] Fetch Recent Foods
    const fetchRecentFoods = async () => {
        try {
            const res = await apiClient.get(`/api/nutrition/sql/recent/${userId}`);
            setRecentFoods(res.data.results || []);
        } catch (e) {
            console.error("Failed to fetch recent", e);
        }
    };

    // Load recent when overlay opens
    useEffect(() => {
        if (showSmartSearch) {
            fetchRecentFoods();
        }
    }, [showSmartSearch]);

    // 🥣 份量選項（單一真相源：utils/foodPortions.js）
    //    資料庫一律以每 100g 計，只給 ×0.5/×1/×1.5/×2 等於逼使用者自己
    //    把「一碗飯」換算成公克。這裡改成家常單位；沒把握的食物照樣給公克，
    //    不編一個好看但錯的單位。
    const portionOptions = useMemo(() => getPortions(selectedFood), [selectedFood]);

    // [NEW] Calculator Logic
    const calculatedMacros = useMemo(() => {
        if (!selectedFood) return { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 };

        const ratio = inputGrams / 100;
        const basePro = Math.max(0, parseFloat(selectedFood.protein) || 0);
        const baseCarb = Math.max(0, parseFloat(selectedFood.carbs) || 0);
        const baseFat = Math.max(0, parseFloat(selectedFood.fats) || 0);
        const baseFiber = Math.max(0, parseFloat(selectedFood.fiber) || 0);

        // 🔥 Atwater 估算：若資料庫 calories=0 但三大營養素有值，用 P×4 + C×4 + F×9 補算
        let baseCals = parseFloat(selectedFood.calories) || 0;
        if (baseCals === 0 && (basePro > 0 || baseCarb > 0 || baseFat > 0)) {
            baseCals = basePro * 4 + baseCarb * 4 + baseFat * 9;
        }

        const clamp = (v) => Math.max(0, v);
        return {
            calories: clamp(Math.round(baseCals * ratio)),
            protein: clamp(parseFloat((basePro * ratio).toFixed(1))),
            carbs: clamp(parseFloat((baseCarb * ratio).toFixed(1))),
            fats: clamp(parseFloat((baseFat * ratio).toFixed(1))),
            fiber: clamp(parseFloat((baseFiber * ratio).toFixed(1)))
        };
    }, [selectedFood, inputGrams]);

    /* 實際要記的那一份 = 依份量算出來的 ＋ 使用者自己微調的增減。
       熱量跟著三大營養素走（蛋白質、碳水 4 大卡/g，脂肪 9 大卡/g），不另外讓人改熱量 ——
       改了營養素熱量卻不動，數字就對不起來了。 */
    const finalMacros = useMemo(() => {
        const r1 = (v) => Math.max(0, Math.round(v * 10) / 10);
        const dp = Number(macroAdj.protein) || 0, dc = Number(macroAdj.carbs) || 0, df = Number(macroAdj.fats) || 0;
        const protein = r1(calculatedMacros.protein + dp);
        const carbs = r1(calculatedMacros.carbs + dc);
        const fats = r1(calculatedMacros.fats + df);
        // 用「實際變動量」算熱量（夾到 0 的那部分不算）
        const realDelta = (protein - calculatedMacros.protein) * 4 + (carbs - calculatedMacros.carbs) * 4 + (fats - calculatedMacros.fats) * 9;
        return {
            ...calculatedMacros,
            protein, carbs, fats,
            calories: Math.max(0, Math.round(calculatedMacros.calories + realDelta)),
        };
    }, [calculatedMacros, macroAdj]);
    const macroAdjusted = !!(macroAdj.protein || macroAdj.carbs || macroAdj.fats);

    const handleComboLog = async () => {
        if (comboCart.length === 0) return;
        triggerHaptic('medium');

        // Calculate aggregate totals
        const totalGrams = comboCart.reduce((acc, curr) => acc + curr.grams, 0);
        const totalCals = comboCart.reduce((acc, curr) => acc + (curr.food.calories * curr.grams) / 100, 0);
        const totalProtein = comboCart.reduce((acc, curr) => acc + (curr.food.protein * curr.grams) / 100, 0);
        const totalCarbs = comboCart.reduce((acc, curr) => acc + (curr.food.carbs * curr.grams) / 100, 0);
        const totalFats = comboCart.reduce((acc, curr) => acc + (curr.food.fats * curr.grams) / 100, 0);
        const totalFiber = comboCart.reduce((acc, curr) => acc + ((curr.food.fiber || 0) * curr.grams) / 100, 0);

        const finalName = comboName.trim() || comboCart.map(c => String(c.food.name || '').replace(/\s*[0\.]+\s*$/, '').trim()).join(' + ').slice(0, 18);

        const roundedCals = Math.round(totalCals);
        const round1 = (v) => Math.round(v * 10) / 10;

        const newEntry = {
            user_id: userId,
            name: finalName,
            calories: roundedCals,
            protein: round1(totalProtein),
            carbs: round1(totalCarbs),
            fats: round1(totalFats),
            fiber: round1(totalFiber),
            grams: parseInt(totalGrams) || 100,
            food_id: null,
            is_tfda: 0,
            is_global: 0,
            date: todayDate,
            timestamp: new Date().toISOString()
        };

        const tempId = Date.now();

        // 1. Build normalized version for StarredFoods template
        const normalizedCals = totalGrams > 0 ? Math.round((totalCals / totalGrams) * 100) : 0;
        const normalizedProtein = totalGrams > 0 ? parseFloat(((totalProtein / totalGrams) * 100).toFixed(1)) : 0;
        const normalizedCarbs = totalGrams > 0 ? parseFloat(((totalCarbs / totalGrams) * 100).toFixed(1)) : 0;
        const normalizedFats = totalGrams > 0 ? parseFloat(((totalFats / totalGrams) * 100).toFixed(1)) : 0;
        const normalizedFiber = totalGrams > 0 ? parseFloat(((totalFiber / totalGrams) * 100).toFixed(1)) : 0;

        const starredTemplate = {
            id: `combo_starred_${tempId}`,
            name: finalName,
            emoji: comboImage ? null : (comboEmoji || '🍲'),
            image: comboImage || null,
            calories: normalizedCals,
            protein: normalizedProtein,
            carbs: normalizedCarbs,
            fats: normalizedFats,
            fiber: normalizedFiber,
            serving_size_g: 100,
            category: 'all', // Will be determined by category selection prompt
            starredAt: Date.now()
        };

        // 2. Package data and launch Starred Category Selection Modal!
        setComboPendingLogData({ starredTemplate, newEntry });
        setFavCategorySelectFood(starredTemplate);
    };

    const handleSmartLog = async (e) => {
        triggerHaptic('medium');
        if (!selectedFood || mealSaveInFlight.current) return;
        if (!Number.isFinite(Number(inputGrams)) || Number(inputGrams) <= 0) {
            toast.error('請輸入大於 0 的實際食用份量');
            return;
        }
        // 份量沒有上限的話，100 打成 10000 會記進 10 公斤、幾萬大卡，當天整組建議失真
        if (Number(inputGrams) > NUTRI_LIMITS.grams.max) {
            toast.error(`單筆份量最多 ${NUTRI_LIMITS.grams.max} g，請確認是不是多打了一個 0`);
            return;
        }

        mealSaveInFlight.current = true;
        setSavingMeal(true);
        const tempId = Date.now(); // 暫時 ID，只用於 Optimistic UI，不送後端
        const newEntry = {
            user_id: userId,
            name: selectedFood.name,
            ...finalMacros,
            // 與 handleAddMeal 同一道界線：資料庫裡單位錯的食物乘上份量也不會爆表
            calories: clampNutri(finalMacros?.calories, NUTRI_LIMITS.calories),
            protein: clampNutri(finalMacros?.protein, NUTRI_LIMITS.macro),
            carbs: clampNutri(finalMacros?.carbs, NUTRI_LIMITS.macro),
            fats: clampNutri(finalMacros?.fats, NUTRI_LIMITS.macro),
            ...(finalMacros?.fiber != null ? { fiber: clampNutri(finalMacros.fiber, NUTRI_LIMITS.macro) } : {}),
            grams: Number(inputGrams),
            food_id: selectedFood.id ? parseInt(selectedFood.id) || null : null, // 確保是整數或 null
            is_tfda: selectedFood.is_tfda || 0,
            is_global: selectedFood.is_global || 0,
            date: todayDate,
            timestamp: new Date().toISOString()
        };

        // Capture previous state for potential rollback
        const prevTodayMeals = [...todayMeals];
        const prevStats = { ...stats };
        const prevHistory = [...history];

        try {
            // 1. Optimistic UI Update（加上暫時 id 讓 key 不衝突）
            const tempEntryWithId = { ...newEntry, id: tempId };
            setTodayMeals(prev => [tempEntryWithId, ...prev]);

            const round1 = (v) => Math.round(v * 10) / 10;

            setStats(prev => ({
                calories: Math.round((prev.calories || 0) + newEntry.calories),
                protein: round1((prev.protein || 0) + newEntry.protein),
                carbs: round1((prev.carbs || 0) + newEntry.carbs),
                fats: round1((prev.fats || 0) + newEntry.fats),
                fiber: round1((prev.fiber || 0) + (newEntry.fiber || 0)),
                water: (prev.water || 0)
            }));

            // Optimistic History Update
            setHistory(prev => {
                const todayIndex = prev.findIndex(h => h.date === todayDate);
                if (todayIndex >= 0) {
                    const newHistory = [...prev];
                    newHistory[todayIndex] = {
                        ...newHistory[todayIndex],
                        calories: Math.round((newHistory[todayIndex].calories || 0) + newEntry.calories),
                        protein: round1((newHistory[todayIndex].protein || 0) + newEntry.protein),
                        carbs: round1((newHistory[todayIndex].carbs || 0) + newEntry.carbs),
                        fats: round1((newHistory[todayIndex].fats || 0) + newEntry.fats),
                        fiber: round1((newHistory[todayIndex].fiber || 0) + (newEntry.fiber || 0))
                    };
                    return newHistory;
                } else {
                    return [...prev, {
                        date: todayDate,
                        calories: Math.round(newEntry.calories),
                        protein: round1(newEntry.protein),
                        carbs: round1(newEntry.carbs),
                        fats: round1(newEntry.fats),
                        fiber: round1(newEntry.fiber || 0),
                        water: 0,
                        vegetables: 0
                    }];
                }
            });

            // 🔥 新增：將搜尋並加入的餐點即時更新到「Recent Local (最近紀錄)」
            setRecentFoods(prev => {
                return [selectedFood, ...prev.filter(f => f.name !== selectedFood.name)].slice(0, 20);
            });

            // Keep the draft open until the server confirms the diary entry.
            await apiClient.post('/api/nutrition/sql/log', newEntry);
            setShowSmartSearch(false);
            setIsQuickAddMode(false);
            setSelectedFood(null);
            setSearchQuery('');
            setInputGrams(100);

            // 🚀 觸發高質感飛行動畫！
            setFlyAnimData({
                name: newEntry.name,
                calories: newEntry.calories,
                protein: newEntry.protein,
                carbs: newEntry.carbs,
                fats: newEntry.fats,
            });

            // 3. Updates
            updateNutritionChallenges({
                name: selectedFood.name,
                ...finalMacros
            });
            fetchData(); // Sync with server source of truth
        } catch (err) {
            // ── [ROLLBACK] ──
            setTodayMeals(prevTodayMeals);
            setStats(prevStats);
            setHistory(prevHistory);
            // 誠實錯誤：把真正的失敗原因講清楚，而不是一律「請檢查網路」（誤導使用者）
            const status = err?.response?.status;
            const detail = err?.response?.data?.detail;
            console.error("Log failed", status ?? '(no response)', detail ?? '', err);
            let msg;
            if (!err?.response) msg = "連線逾時，請確認網路後重試";
            else if (status === 401) msg = "登入已過期，請重新登入後再記錄";
            else if (status === 422) msg = "這筆食物資料格式有誤，請重新選擇";
            else if (status >= 500) msg = "伺服器暫時無法記錄，請稍後再試";
            else msg = "記錄失敗，請稍後再試";
            toast.error(msg);
        } finally {
            mealSaveInFlight.current = false;
            setSavingMeal(false);
        }
    };

    // Get workout context explanation
    const getWorkoutExplanation = () => {
        // 🔥 Use latest session type for context if available, otherwise fallback to daily type
        const wt = workoutData.lastSession?.type || workoutData.workoutType;
        if (wt === 'run') {
            return {
                title: "跑步日 - 補充碳水化合物",
                description: "今天跑步消耗了大量肝醣，建議增加碳水攝取以恢復能量儲備。",
                highlight: "carbs"
            };
        } else if (wt === 'strength') {
            return {
                title: "重訓日 - 補充蛋白質",
                description: "肌肉在訓練後需要蛋白質來修復與生長，建議增加優質蛋白攝取。",
                highlight: "protein"
            };
        } else if (wt === 'mixed') {
            return {
                title: "混合訓練日 - 全面補充",
                description: "今天同時進行跑步與重訓，需要同時補充碳水與蛋白質。",
                highlight: "both"
            };
        }
        return null;
    };

    const workoutExplanation = getWorkoutExplanation();

    // Unified glassmorphism card style
    const glassCard = {
        background: 'rgba(28, 28, 30, 0.5)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
    };

    // First-load skeleton — only when no cached data exists.
    // ── FashionReveal: skeleton early-return removed ──────────────────────────
    // PageShimmerOverlay is injected directly into the real page render below.
    // Cards appear instantly at t=0; shimmer dissolves staggered when data lands.

    // --- 準備渲染的數值與狀態 ---
    // 🟢 淨卡路里 = 攝取 − (訓練紀錄總消耗 OR HealthKit 主動消耗，取大者)
    //    取大者避免「同一場訓練被 workoutData + HK 重複計算兩次」
    //    例：使用者重訓記了 350 kcal、Apple Watch HK 也記到 280 kcal → 取 350
    //    純走路日（沒記訓練）→ workoutData.totalBurn=0 / HK=420 → 取 420
    const externalBurn = Math.max(workoutData.totalBurn || 0, hkActiveEnergy || 0);
    const netCalories = Math.max(0, Number(stats.calories) || 0); // Intake target and progress use the same quantity.
    const caloriesLeft = Math.max(0, GOALS.calories - Math.max(0, netCalories));
    const caloriesProgressPct = Math.min(100, (Math.max(0, netCalories) / (GOALS.calories || 1)) * 100);

    // 動態判斷提示語
    const getGreetingMessage = () => {
        // 統一大小寫風格（Title Case），避免與報告卡片中的字樣大小寫不一致
        if (todayMeals.length === 0) return '記錄今天的飲食';
        if (caloriesProgressPct < 50) return "Keep Fueling Up";
        if (caloriesProgressPct >= 50 && caloriesProgressPct < 90) return "You Are Doing Great";
        if (caloriesProgressPct >= 90 && caloriesProgressPct <= 110) return "Great Job Today";
        return "A Bit Over, That's Okay!";
    };

    /* 標題 = 「這是誰的、哪一種計劃」—— 使用者現在在做的那件事，
       而不是「記錄今天的飲食」這種每個人每天都一樣的問候語。
       名字走 auth.resolveDisplayName，跟首頁、個人頁、計劃表同一支；
       直接讀 localStorage 的 userProfile 會拿到別人的名字。 */
    const planOwnerName = useMemo(() => {
        try {
            const n = resolveDisplayName(userId, userProfile?.name);
            return n && !/^訓練者\s*#/.test(n) ? n : '';   // 沒有真名就不硬掛一個代號
        } catch { return ''; }
    }, [userId, userProfile]);
    const greetingText = (() => {
        if (!activePlan) return getGreetingMessage();
        const pm = PLAN_META[activePlan.goalType] || PLAN_META.cut;
        return planOwnerName ? `${planOwnerName}的${pm.label}計劃` : `${pm.label}計劃`;
    })();
    const greetingIsCJK = /[\u4e00-\u9fff]/.test(greetingText);

    return (
        // ── FashionReveal: Card-First (same system as HomeMobile) ─────────────
        // Each card shell renders at t=0. Ghost shimmer fills card interior.
        // When data arrives: ghost lifts away, real content crystallises in.
        <div
            className="min-h-[100dvh] font-sans overflow-x-hidden text-[#161415]"
            style={{ maxWidth: '430px', margin: '0 auto', backgroundColor: '#F8F5F0', paddingBottom: 'calc(9rem + env(safe-area-inset-bottom, 0px))', position: 'relative' }}
        >

            {/* ── 複製預覽卡：列出來源日餐點，逐項勾選 / 微調份量後再複製 ── */}
            <AnimatePresence>
                {copyPreview && (() => {
                    const included = copyPreview.items.filter(it => it._include);
                    const totalCals = included.reduce((s, it) => {
                        const baseG = it._baseGrams || 100;
                        const scale = baseG > 0 ? (it._grams || baseG) / baseG : 1;
                        return s + Math.round((it._baseCals || 0) * scale);
                    }, 0);
                    const updateItem = (key, patch) => setCopyPreview(p => ({ ...p, items: p.items.map(it => it._key === key ? { ...it, ...patch } : it) }));
                    return (
                        <motion.div
                            className="fixed inset-0 z-[120] flex items-end justify-center"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            onClick={() => setCopyPreview(null)}
                            style={{ background: 'rgba(22,20,21,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
                        >
                            <motion.div
                                onClick={e => e.stopPropagation()}
                                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                                transition={{ type: 'spring', stiffness: 320, damping: 34 }}
                                className="w-full"
                                style={{ maxWidth: 430, maxHeight: '82dvh', background: '#F6F4F1', borderRadius: '26px 26px 0 0', display: 'flex', flexDirection: 'column', boxShadow: '0 -18px 50px rgba(22,20,21,0.22)' }}
                            >
                                {/* Grabber */}
                                <div className="flex justify-center pt-3 pb-1 shrink-0">
                                    <div style={{ width: 36, height: 4, borderRadius: 99, background: '#CFC6B8' }} />
                                </div>
                                {/* Header */}
                                <div className="px-6 pt-3 pb-4 shrink-0">
                                    <p className="text-[11px] font-extrabold tracking-[0.04em]" style={{ color: 'rgba(22,20,21,0.45)' }}>複製{copyPreview.dateLabel}的紀錄</p>
                                    <h2 className="mt-1" style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 700, fontSize: 24, color: '#161415' }}>確認要複製的餐點</h2>
                                    <p className="text-[12px] mt-1.5" style={{ color: 'rgba(22,20,21,0.5)' }}>勾選要帶過來的項目，份量可微調。</p>
                                </div>
                                {/* Items */}
                                <div className="flex-1 overflow-y-auto px-4" style={{ WebkitOverflowScrolling: 'touch' }}>
                                    {copyPreview.items.map((it) => {
                                        const cleanName = (it.name || '').replace(/\s*[0\.]+\s*$/, '').trim() || '未命名';
                                        const baseG = it._baseGrams || 100;
                                        const scale = baseG > 0 ? (it._grams || baseG) / baseG : 1;
                                        const cals = Math.round((it._baseCals || 0) * scale);
                                        return (
                                            <div key={it._key} className="flex items-center gap-3 px-2 py-3" style={{ borderBottom: '1px solid rgba(22,20,21,0.06)', opacity: it._include ? 1 : 0.4 }}>
                                                {/* include checkbox */}
                                                <motion.button {...pressProps('icon')}
                                                    onClick={() => updateItem(it._key, { _include: !it._include })}
                                                    className="shrink-0 flex items-center justify-center"
                                                    style={{ width: 24, height: 24, borderRadius: 8, border: it._include ? 'none' : '1.5px solid rgba(22,20,21,0.25)', background: it._include ? '#F95C4B' : 'transparent' }}
                                                >
                                                    {it._include && <CheckCircle2 size={16} color="#fff" strokeWidth={2.5} />}
                                                </motion.button>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[14px] font-bold truncate" style={{ color: '#161415' }}>{cleanName}</p>
                                                    <p className="text-[11px] font-semibold tabular-nums" style={{ color: 'rgba(22,20,21,0.45)' }}>{cals} kcal · {Math.round(it._grams)}g</p>
                                                </div>
                                                {/* grams stepper */}
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <motion.button {...pressProps('icon')} onClick={() => updateItem(it._key, { _grams: Math.max(10, Math.round((it._grams || baseG) - 10)) })}
 className="flex items-center justify-center" style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(22,20,21,0.05)', color: 'rgba(22,20,21,0.6)' }}>
                                                        <Minus size={13} strokeWidth={2.5} />
                                                    </motion.button>
                                                    <span className="text-[12px] font-black tabular-nums text-center" style={{ width: 38, color: '#161415' }}>{Math.round(it._grams)}g</span>
                                                    <motion.button {...pressProps('icon')} onClick={() => updateItem(it._key, { _grams: Math.round((it._grams || baseG) + 10) })}
 className="flex items-center justify-center" style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(22,20,21,0.05)', color: 'rgba(22,20,21,0.6)' }}>
                                                        <Plus size={13} strokeWidth={2.5} />
                                                    </motion.button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                {/* Footer */}
                                <div className="px-5 pt-3 shrink-0" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
                                    <div className="flex items-center justify-between mb-3 px-1">
                                        <span className="text-[12px] font-bold tracking-wider" style={{ color: 'rgba(22,20,21,0.4)' }}>共 {included.length} 項 · 合計</span>
                                        <span className="tabular-nums" style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 22, color: '#161415' }}>{totalCals} <span className="text-[9px] font-bold uppercase" style={{ color: 'rgba(22,20,21,0.4)' }}>kcal</span></span>
                                    </div>
                                    <motion.button {...pressProps('row')}
                                        onClick={() => handleCopyDay(included)}
                                        disabled={isCopyingDay || included.length === 0}
                                        className="w-full py-4 rounded-[18px] flex items-center justify-center gap-2 transition-transform disabled:opacity-40"
                                        style={{ background: '#161415', color: '#F6F4F1', fontSize: 14, fontWeight: 800, letterSpacing: '0.04em' }}
                                    >
                                        <Copy size={15} strokeWidth={2.4} />
                                        {isCopyingDay ? '複製中…' : `複製 ${included.length} 項到今天`}
                                    </motion.button>
                                </div>
                            </motion.div>
                        </motion.div>
                    );
                })()}
            </AnimatePresence>

            {/* ── Background-revalidation hairline shimmer ────────────────
                Visible only while fetchData(isBackground=true) is running.
                isRefreshing = true during background syncs.
                1px warm-gold line sweeps across the top — invisible to
                casual users, but signals "live data" to attentive ones. */}
            <AnimatePresence>
                {isRefreshing && (
                    <motion.div
                        aria-hidden="true"
                        initial={{ opacity: 0, scaleX: 0 }}
                        animate={{ opacity: 1, scaleX: 1 }}
                        exit={{ opacity: 0, transition: { duration: 0.4 } }}
                        transition={{ duration: 0.35 }}
                        style={{
                            position: 'fixed', top: 0, left: 0, right: 0, height: 1.5,
                            transformOrigin: 'left center',
                            background: 'linear-gradient(90deg, transparent 0%, rgba(249,92,75,0.0) 10%, rgba(249,92,75,0.6) 45%, rgba(249,92,75,0.85) 50%, rgba(249,92,75,0.6) 55%, rgba(249,92,75,0.0) 90%, transparent 100%)',
                            pointerEvents: 'none',
                            zIndex: 9999,
                        }}
                    />
                )}
            </AnimatePresence>

            {/* 讀不到今天的紀錄 → 一行說明＋重試，不讓 0 假裝成真的 */}
            <AnimatePresence>
                {loadError && !loading && (
                    <motion.div
                        role="status"
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        style={{
                            position: 'fixed', zIndex: 9000, left: 16, right: 16,
                            top: 'calc(10px + env(safe-area-inset-top))',
                            maxWidth: 408, marginInline: 'auto', boxSizing: 'border-box',
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '6px 6px 6px 16px', borderRadius: 999,
                            background: 'rgba(22,20,21,0.86)', color: '#F6F4F1',
                            backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
                            boxShadow: '0 8px 24px -10px rgba(22,20,21,0.45)',
                        }}
                    >
                        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            今天的紀錄讀不到
                        </span>
                        <motion.button
                            {...pressProps('pill')}
                            onClick={() => { haptic('light'); fetchData(false); }}
                            style={{
                                minHeight: 44, padding: '0 16px', borderRadius: 999, border: 'none',
                                background: '#F95C4B', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', flexShrink: 0,
                            }}
                        >再試一次</motion.button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Gamification Global Overlays */}
            <ParticleBurst trigger={particleTrigger} x={particlePos.x} y={particlePos.y} />

            {/* 藝術感成功動畫 Overlay */}
            <AnimatePresence>
                {flyAnimData && (
                    <ArtisticSuccessOverlay
                        data={flyAnimData}
                        onComplete={() => setFlyAnimData(null)}
                    />
                )}
            </AnimatePresence>

            <MacroMilestoneToast milestoneKey={activeMilestone} visible={!!activeMilestone} onDone={clearMilestone} />
            <FloatingMacroChip visible={showSuccess} calories={successData.calories} origin={particlePos} targetRef={statsCardRef} />
            {/* 頂部只需要讓開狀態列 + 一個呼吸的距離。
                ⚠️ 這裡以前是 safe-area + 68px —— iPhone 上等於 127px 的空白，
                   第一屏有四分之一是什麼都沒有的紙。留白是用來分層的，不是用來墊高的。 */}
            <div className="px-6 pb-0" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)' }}>

                {/* 🩹 2026-08 稽核：返回鍵。ChevronLeft 一直有 import 卻從未被渲染，
                    導致營養主頁是全站唯一沒有返回路徑的三大系統入口頁 ——
                    使用者從首頁「三大系統」卡片點進來後，App 內沒有任何離開提示。 */}
                <motion.button {...pressProps('icon')}
                    type="button"
                    onClick={() => { triggerHaptic('light'); navigate('/mobile-home'); }}
                    aria-label="返回首頁"
                    className="flex items-center justify-center rounded-full mb-3"
                    style={{
                        width: 34, height: 34, marginLeft: -6,
                        border: `1px solid ${C.hairline || 'rgba(22,20,21,0.14)'}`,
                        background: 'transparent', color: C.ink || '#161415', cursor: 'pointer',
                    }}
                >
                    <ChevronLeft size={19} strokeWidth={2.2} />
                </motion.button>

                {/* Header Section — 標題置頂，streak / 步數 浮於右上 */}
                <div className="mb-0 relative">
                    {/* 右上角：步數環 + streak（浮層，不占位）
                        🎯 與標題基線對齊、不再壓到標題（標題已保留 pr-28 安全區） */}
                    <motion.div
                        className="absolute top-0 right-0 flex items-center gap-2 z-20"
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.35, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                    >
                        {/* 📿 AP 鐘錶風步數環（只在 iOS WebView 環境會顯示，要拿到 HealthKit 權限） */}
                        <StepCounterRing />

                        {/* 精簡 streak pill —— 顯示真實連續天數，不再寫死 1 */}
                        {nutriStreak > 0 && (
                            <div
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
                                style={{ background: 'rgba(249,92,75,0.10)', border: '1px solid rgba(249,92,75,0.20)' }}
                                title={`連續記錄 ${nutriStreak} 天`}
                            >
                                <Flame size={13} style={{ color: '#F95C4B' }} fill="#F95C4B" />
                                <span className="text-xs font-black tabular-nums" style={{ color: '#F95C4B' }}>{nutriStreak}</span>
                            </div>
                        )}

                        {/* 📄 報告下載已移除 —
                            「今天的飲食」是即時儀表板，不是報告。營養報告已收斂到
                            月報（MonthlyReportPage）與季報（QuarterlyReport）統一出口，
                            避免同一份資料出現多個下載入口、也解決此處與標題／步數環的碰撞。 */}
                    </motion.div>

                    {/* 標題 — 最頂，留右邊安全區給步數環 + streak
                        中文零狀態標題單行呈現（不再把「食」擠到第二排），字級隨寬度自適應 */}
                    <motion.div
                        className={greetingIsCJK ? "pr-24 mb-5" : "pr-28 mb-6"}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.08, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <h1
                                className="tracking-tight text-[#161415] leading-[1.05] font-medium"
                                style={{
                                    fontFamily: "'Tenor Sans', sans-serif",
                                    fontSize: 'clamp(1.5rem, 7vw, 2rem)',
                                    letterSpacing: '-0.01em',
                                    minWidth: 0,
                                }}
                            >
                                {greetingText}
                            </h1>
                            {/* ⋯ 從被刪掉的計劃卡搬到標題旁 —— 標題就是計劃，
                                要看設定或調整就從這裡進去。 */}
                            {activePlan && (
                                <motion.button {...pressProps('icon')}
                                    onClick={() => { triggerHaptic('light'); setShowPlanner(true); }}
                                    aria-label="查看與調整營養計劃"
                                    style={{
                                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: '#F6F4F1', border: '1px solid rgba(22,20,21,0.06)',
                                        color: '#F95C4B', cursor: 'pointer',
                                        boxShadow: '0 4px 12px rgba(22,20,21,0.03)',
                                    }}
                                >
                                    <MoreHorizontal size={18} strokeWidth={3} />
                                </motion.button>
                            )}
                        </div>
                    </motion.div>

                    <motion.div
                        data-onboard="nutrition-tabs"
                        className="flex p-1.5 mx-auto mb-6 relative"
                        style={{
                            background: 'rgba(255, 255, 255, 0.35)',
                            backdropFilter: 'blur(40px) saturate(200%)',
                            WebkitBackdropFilter: 'blur(40px) saturate(200%)',
                            borderRadius: 9999,
                            border: '1px solid rgba(255, 255, 255, 0.5)',
                            boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.7), 0 4px 16px rgba(0,0,0,0.04)',
                            width: 'fit-content'
                        }}
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.22, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    >
                        {[
                            { key: 'overview', label: '總覽' },
                            { key: 'history', label: '歷史' },
                            { key: 'analysis', label: '分析' },
                        ].map(tab => (
                            <motion.button {...pressProps('icon')}
                                key={tab.key}
                                onClick={() => {
                                    if (tab.key === 'analysis') { openAnalysis(); }
                                    else { setActiveTab(tab.key); }
                                    // keep existing historyTimeRange logic for history tab
                                    if (tab.key === 'history' && historyTimeRange < 30) {
                                        setHistoryTimeRange(30);
                                    }
                                }}
                                className="relative px-6 py-2 rounded-full font-bold text-[13px] whitespace-nowrap transition-colors z-10"
                                style={{
                                    color: activeTab === tab.key ? '#F95C4B' : 'rgba(22,20,21,0.5)',
                                }}
                            >
                                {activeTab === tab.key && (
                                    <motion.div
                                        layoutId="ios26-liquid-glass-tab"
                                        className="absolute inset-0 rounded-full z-[-1]"
                                        style={{
                                            background: 'rgba(249, 92, 75, 0.15)',
                                            border: '1px solid rgba(249, 92, 75, 0.3)',
                                            boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.6), 0 2px 8px rgba(249,92,75,0.1)'
                                        }}
                                        transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                                    />
                                )}
                                <span className="relative z-10 tracking-wide">{tab.label}</span>
                            </motion.button>
                        ))}
                    </motion.div>
                </div>

                {/* Content Based on Tab */}
                <AnimatePresence mode="wait">
                    {activeTab === 'overview' ? (
                        <motion.div
                            key="overview"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="space-y-6"
                        >
                            {/* ── 今日訓練橫幅 ────────────────────────────────────────
                                稽核前這條橫幅在給「訓練後營養處方」（碳 +30g、蛋 2.0g/kg），
                                但同一個畫面往下捲一點的「訓練後補給」卡也在給處方
                                （70kg 跑者：碳 70g、蛋 21g）—— 同一餐兩個數字，差兩倍以上。
                                使用者不會知道要聽誰的，只會覺得這個 App 自己都沒搞清楚。

                                收斂原則：一件事只由一個地方負責。
                                  · 這條橫幅只回答「今天練了什麼、燒了多少」（事實）
                                  · 吃什麼、吃多少交給下面的補給卡（有具體食物、可以按下去記錄）
                                順便修掉原本算好卻沒用的 config.tag / label / accentColor，
                                以及混合訓練日永遠顯示 GYM DAY 的 bug。 */}
                            {/* 一個畫面只有一個提示：教練卡有事要說時，這條橫幅讓位。
                                （教練卡是「該做一件事」，比「今天練了什麼」優先。） */}
                            {!showCoach && todayWorkouts.length > 0 && (() => {
                                const hasRun = todayWorkouts.some(w => w.type === 'run');
                                const hasStrength = todayWorkouts.some(w => w.type === 'strength');
                                const totalBurn = todayWorkouts.reduce((s, w) => s + (w.calories || 0), 0);
                                const dayLabel = hasRun && hasStrength ? '今天跑步 + 重訓'
                                    : hasRun ? '今天跑了步'
                                    : '今天做了重訓';
                                return (
                                    <motion.button
                                        type="button"
                                        onClick={() => { triggerHaptic('light'); navigate('/training-record-mobile'); }}
                                        aria-label={`${dayLabel}，點擊查看訓練紀錄`}
                                        {...pressProps('card')}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="mb-6 ti-surface-pale w-full text-left"
                                        style={{
                                            border: 'none',
                                            cursor: 'pointer',
                                            borderRadius: 12,
                                            minHeight: 52,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '0 14px',
                                            gap: 12,
                                            position: 'relative',
                                        }}
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <span style={{ width: 6, height: 6, borderRadius: 999, background: '#F95C4B', flexShrink: 0 }} />
                                            <span style={{ fontSize: 14, fontWeight: 600, color: '#161415', fontFamily: "'Noto Sans TC', sans-serif", whiteSpace: 'nowrap' }}>
                                                {dayLabel}
                                            </span>
                                        </div>

                                        {/* ❌ 這裡原本也印一次「−XXX kcal」——
                                            但下方 Hero 大弧底下已經有「-XXX kcal 已燃燒」，
                                            那一行是用來解釋中央那個「淨卡路里」怎麼算出來的，
                                            有存在必要；這裡再印一次就只是同一個數字出現兩次。
                                            改成把這條橫幅的職責換成「去看那筆訓練」，
                                            它就有了自己的工作，而不是複述隔壁的數字。 */}
                                        <span className="flex items-center gap-1 flex-shrink-0"
                                            style={{ fontSize: 12, fontWeight: 600, color: 'rgba(22,20,21,0.42)' }}>
                                            看訓練紀錄
                                            <ChevronRight size={14} />
                                        </span>
                                    </motion.button>
                                );
                            })()}

                            {/* 🧭 教練回診（總覽最上方）──────────────────────────────
                                瑞士編輯式：kicker → 一句標題 → 一行說明 → 一個動作。
                                需要行動時左側 coral 線 + 呼吸燈；只是回報時安靜到底，
                                天天在閃久了就沒人看。 */}
                            {cpDue && (
                                <motion.button
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                    onClick={() => { triggerHaptic('medium'); setCheckpointOpen(true); }}
                                    className="w-full text-left mb-7 ms-glow-coral"
                                    style={{ padding: '14px 0 14px 14px', background: 'transparent', border: 'none', borderLeft: '2px solid #F95C4B', borderRadius: 2, display: 'block' }}
                                >
                                    <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.24em', marginBottom: 6, color: '#D94030' }}>
                                        第 {cpDue.index} 次回饋 · {cpDue.index * 4} 週到了
                                    </p>
                                    <p style={{ fontSize: 17, fontWeight: 800, color: '#161415', letterSpacing: '-0.015em', lineHeight: 1.25 }}>
                                        看這 4 週走得怎麼樣
                                    </p>
                                    <p style={{ fontSize: 11.5, lineHeight: 1.6, color: 'rgba(22,20,21,0.50)', marginTop: 4 }}>
                                        量一次體重 → 看有沒有達成、原因在哪 → 下一期吃什麼
                                    </p>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 10, fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', color: '#D94030' }}>
                                        開始回饋 <ChevronRight size={13} />
                                    </span>
                                </motion.button>
                            )}

                            {showCoach && (
                                <motion.button
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                    onClick={() => {
                                        triggerHaptic(coachDigest.level === 'action' ? 'medium' : 'light');
                                        /* nutritionCoach 的動作有兩種：{ route } 去別頁、{ local } 留在這頁做事。
                                           以前只認 route —— 「調整計劃」「開新的一期」是 local，按了等於 navigate(undefined)，什麼都沒發生。
                                           調整計劃 → 直接開精靈編輯；開新的一期 → 開計劃面板，結算卡上就是「設定下一期」。 */
                                        const a = coachDigest.action;
                                        if (a?.local === 'openPlanner') { setPlannerEditOnOpen(true); setShowPlanner(true); }
                                        else if (a?.local === 'newCycle') { setPlannerEditOnOpen(false); setShowPlanner(true); }
                                        else if (a?.route) navigate(a.route, a.state ? { state: a.state } : undefined);
                                        else openAnalysis();
                                    }}
                                    className={`w-full text-left mb-7 transition-transform ${coachDigest.level === 'action' ? 'ms-glow-coral' : ''}`}
                                    style={{
                                        padding: '14px 0 14px 14px',
                                        background: 'transparent',
                                        border: 'none',
                                        borderLeft: `2px solid ${coachDigest.level === 'action' ? '#F95C4B' : 'rgba(207,198,184,0.9)'}`,
                                        borderRadius: 2,
                                        display: 'block',
                                        position: 'relative',
                                    }}
                                >
                                    <p style={{
                                        fontSize: 12, fontWeight: 900, letterSpacing: '0.24em', marginBottom: 6,
                                        color: coachDigest.level === 'action' ? '#D94030' : 'rgba(22,20,21,0.38)',
                                    }}>
                                        {coachDigest.level === 'action' ? '該做一件事' : `這一期第 ${coachDigest.weekIndex} 週`}
                                    </p>
                                    <p style={{ fontSize: 17, fontWeight: 800, color: '#161415', letterSpacing: '-0.015em', lineHeight: 1.25 }}>
                                        {coachDigest.title}
                                    </p>
                                    <p style={{ fontSize: 11.5, lineHeight: 1.6, color: 'rgba(22,20,21,0.50)', marginTop: 4 }}>
                                        {coachDigest.detail}
                                    </p>
                                    {coachDigest.action && (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 10, fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', color: '#D94030' }}>
                                            {coachDigest.action.label}
                                            <ChevronRight size={13} />
                                        </span>
                                    )}
                                    <span
                                        role="button"
                                        tabIndex={0}
                                        aria-label="知道了"
                                        onClick={(e) => { e.stopPropagation(); triggerHaptic('light'); dismissCoach(); }}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); dismissCoach(); } }}
                                        style={{
                                            position: 'absolute', top: 10, right: 0, padding: 6, cursor: 'pointer',
                                            fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', color: 'rgba(22,20,21,0.30)',
                                        }}
                                    >
                                        知道了
                                    </span>
                                </motion.button>
                            )}

                            {/* 🗓️ 計劃日型橫幅 — 練「之前」就告訴使用者今天怎麼吃、記得記錄。
                                （練完後上方 Training Context 出現，這條自動讓位） */}
                            {!showCoach && todayWorkouts.length === 0 && agendaHint && hintSeen !== hintSig && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                    className="mb-7"
                                    style={{
                                        position: 'relative',
                                        padding: '14px 64px 14px 14px',
                                        borderLeft: '2px solid rgba(207,198,184,0.9)',
                                        borderRadius: 2,
                                    }}
                                >
                                    {/* 大字＝今天要做的那一件事。層次靠字級與字重差，不靠小標 */}
                                    <p style={{
                                        fontSize: 24, fontWeight: 300, lineHeight: 1.3,
                                        letterSpacing: '-0.015em', color: '#161415', margin: 0,
                                    }}>
                                        {agendaHint.message}
                                    </p>
                                    {GOALS.calories > 0 && (
                                        <p className="tabular-nums" style={{
                                            fontSize: 11.5, fontWeight: 700, marginTop: 5,
                                            color: 'rgba(22,20,21,0.45)',
                                        }}>
                                            今天目標 {Math.round(GOALS.calories)} 大卡
                                        </p>
                                    )}
                                    <span
                                        role="button"
                                        tabIndex={0}
                                        aria-label="知道了"
                                        onClick={() => {
                                            triggerHaptic('light');
                                            try { localStorage.setItem(HINT_KEY, hintSig); } catch { /* 隱私模式：這次就不記了 */ }
                                            setHintSeen(hintSig);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key !== 'Enter') return;
                                            try { localStorage.setItem(HINT_KEY, hintSig); } catch { /* 隱私模式：這次就不記了 */ }
                                            setHintSeen(hintSig);
                                        }}
                                        style={{
                                            position: 'absolute', top: 12, right: 0, padding: 6, cursor: 'pointer',
                                            fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', color: 'rgba(22,20,21,0.30)',
                                        }}
                                    >
                                        知道了
                                    </span>
                                </motion.div>
                            )}

                            {/* 📝 快速記錄 ────────────────────────────────────────────
                                原本這裡有一段三行的散文：「今日依已確認計劃：2310 大卡、
                                蛋白質 126 g。先記錄實際飲食，再看剩餘量安排下一餐；
                                運動紀錄不會自動增加飲食額度，需要調整時請回計劃確認。」

                                三個問題：
                                  · 2310 大卡與蛋白質 126g，往下捲一點的 Hero 環就在顯示同一組數字
                                  · 「運動不會自動加額度」是規則說明，不是今天要做的事 ——
                                    那屬於熱量環的說明小卡（點環會看到），不該天天佔三行
                                  · 按鈕寫「搜尋食物並記錄今天吃了什麼」11 個字，說「記錄一餐」就夠
                                這一區的工作只有一件：讓人按下去開始記錄。 */}
                            {/* ❌「記錄一餐」按鈕已移除 ——
                                下方的熱量面板本身就是這一頁的主角，點它就能記錄，
                                不需要在它上面再擺一顆做同一件事的按鈕。 */}
                            <section aria-label="快速記錄飲食" className="mb-6">
                                {/* 「常吃的」與「匯入舊收藏」已移到下方「快速新增」區 ——
                                    這裡是「開始記錄」的入口，一顆按鈕就夠；
                                    一整排食物膠囊出現在頁面最上方太突然，
                                    而且下面的快速新增本來就是放這些的地方。 */}
                            </section>
                            {/* 新手教學高亮範圍：目標設定 + 熱量環一起框住 */}
                            <div data-onboard="nutrition-ring" className="space-y-6">
                                {/* ❌ 計劃卡已移除 —— 標題已經是「XXX 的增重計劃」，
                                    「執行中 · 增重」是同一句話再講一次；
                                    目標體重與配速屬於計劃設定，點標題旁的 ⋯ 進去看就好。
                                    「去量體重」這個動作交還給上方的教練卡（同時只留一個提示）。 */}


                                {/* ── Hero 磚: 大弧形進度條 + Macro rings — 光鈦材質（bento hero）──
                                    整塊可點 = 記錄一餐。這是這一頁的主角，
                                    上面不需要再擺一顆做同一件事的按鈕。
                                    （營養素環自己有 onClick 看說明，事件不會互相蓋掉。） */}
                                <motion.div
                                    className="ti-surface"
                                    role="button"
                                    tabIndex={0}
                                    aria-label="記錄一餐"
                                    onClick={(e) => {
                                        // 點在營養素環或補給條上 → 那些自己有 handler，這裡不接手
                                        if (e.target.closest('button')) return;
                                        triggerHaptic('medium');
                                        setIsQuickAddMode(false); setSelectedFood(null); setSearchQuery(''); setShowSmartSearch(true);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key !== 'Enter' && e.key !== ' ') return;
                                        e.preventDefault();
                                        setIsQuickAddMode(false); setSelectedFood(null); setSearchQuery(''); setShowSmartSearch(true);
                                    }}
                                    whileTap={{ scale: 0.985 }}
                                    transition={PRESS_SPRING}
                                    style={{ borderRadius: 28, position: 'relative', overflow: 'hidden', padding: '20px 8px 8px', cursor: 'pointer' }}>
                                    {/* 用指定的圖作為底圖，移除 opacity 與 mixBlendMode 以完全顯示圖片，並加入一層極淡的遮罩確保文字閱讀性 */}
                                    <div style={{ position: 'absolute', inset: 0, backgroundImage: "url('/desktop/11.jpeg')", backgroundSize: 'cover', backgroundPosition: 'center', pointerEvents: 'none' }} />
                                    <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }} />
                                    <div className="ti-sheen" />
                                    <RevealCard
                                        isReady={!loading}
                                        staggerIndex={0}
                                        ghost={
                                            <div style={{
                                                background: 'linear-gradient(145deg, #F0ECE5 0%, #E8E2D9 100%)',
                                                borderRadius: 28,
                                                minHeight: 280,
                                                padding: '1.5rem 1.5rem 1.25rem',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                gap: 14,
                                            }}>
                                                {/* Arc placeholder */}
                                                <GhostBlock width="200px" height="200px" radius="50%" theme="dark" delay={0} style={{ flexShrink: 0 }} />
                                                {/* Macro circles row */}
                                                <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 4 }}>
                                                    {[0, 0.05, 0.10, 0.15].map((d, i) => (
                                                        <GhostBlock key={i} width="52px" height="52px" radius="50%" theme="dark" delay={d} />
                                                    ))}
                                                </div>
                                            </div>
                                        }
                                    >
                                        {/* ── 大弧形進度條 ── */}
                                        {/* 🎯 排版修正：原本「剩餘 / 紀錄」用 absolute top-14 疊在弧形上，
                                            四位數熱量（如 2252）會直接撞上中央大字（-160）。
                                            改為弧形下方的瑞士基線列：中央細線分隔、tabular-nums 對齊，
                                            數字永遠不會重疊，且資訊層級更清楚（主角只有中央那個數字）。 */}
                                        <div className="text-center mb-6 mt-2 relative">

                                            {/* 數學模型流體進度條 */}
                                            <MathFluidArc pct={caloriesProgressPct} marks={GOALS.calories > 0 ? arcMealMarks : []}>
                                                <span className="text-[52px] font-light tracking-tight leading-none text-[#161415]" style={{ fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums' }}>
                                                    <DataPulse ready={nutritionPatchReady} w="6rem" h="2.75rem" radius="0.75rem" theme="dark" inline>
                                                        {Math.round(netCalories)}
                                                    </DataPulse>
                                                </span>
                                                <p className="text-[13px] font-medium mt-1" style={{ color: 'rgba(22,20,21,0.40)', fontFamily: "'Noto Sans TC', sans-serif" }}>
                                                    已攝取大卡
                                                </p>
                                                {/* 🔥 運動消耗標示 */}
                                                {workoutData.totalBurn > 0 && (
                                                    <div className="flex items-center justify-center gap-1 mt-1">
                                                        <span className="text-[11px]">🔥</span>
                                                        <span className="text-[11px] font-black" style={{ color: '#F95C4B' }}>
                                                            運動消耗約 {Math.round(workoutData.totalBurn)} kcal（另列）
                                                        </span>
                                                    </div>
                                                )}
                                            </MathFluidArc>

                                            {/* 剩餘 / 紀錄 — 弧形下方的瑞士基線列（兩欄等分＋中央髮絲線） */}
                                            <div className="mt-5 mx-8 flex items-stretch"
                                                style={{ borderTop: '1px solid rgba(22,20,21,0.08)', paddingTop: 14 }}>
                                                <div className="flex-1 text-center">
                                                    <p className="text-[22px] font-medium text-[#161415] leading-none"
                                                        style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                                                        {Math.round(caloriesLeft)}
                                                    </p>
                                                    <p className="text-[12px] font-medium tracking-[0.18em] mt-1.5"
                                                        style={{ color: 'rgba(22,20,21,0.40)', fontFamily: "'Noto Sans TC', sans-serif" }}>剩餘</p>
                                                </div>
                                                <div style={{ width: 1, background: 'rgba(22,20,21,0.08)' }} />
                                                <div className="flex-1 text-center">
                                                    <p className="text-[22px] font-medium text-[#161415] leading-none"
                                                        style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                                                        {todayMeals.length}
                                                    </p>
                                                    <p className="text-[12px] font-medium tracking-[0.18em] mt-1.5"
                                                        style={{ color: 'rgba(22,20,21,0.40)', fontFamily: "'Noto Sans TC', sans-serif" }}>紀錄</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* ── 三大營養素環 ────────────────────────────────────────
                                            改動（2026-09 稽核）：
                                            1. 原本擠了四個環（含膳食纖維）在 max-w-[64px] 裡，
                                               中央數字 12px、分母 7.5px、標籤 8px —— 設計系統的
                                               字級下限是 11px，這裡三種字全部違規，手機上看不清。
                                               纖維本來就不是巨量營養素，移到下方「補給」卡，
                                               這裡回到三個環，每個環放大到 80px，字級全部合規。
                                            2. 環現在可以點：點下去說明這個營養素是什麼、目標怎麼來，
                                               不用再讓使用者自己猜「/168g 是什麼意思」。 */}
                                        <div className="flex justify-center gap-5 mt-5 mb-6 px-6">
                                            {MACRO_DEFS.map((macro, idx) => {
                                                const value = stats[macro.key] || 0;
                                                const target = GOALS[macro.key] || 1;
                                                const pct = pctOf(value, target);
                                                const hit = pct >= 100;
                                                return (
                                                    <motion.button
                                                        key={macro.key}
                                                        type="button"
                                                        onClick={() => { triggerHaptic('light'); setMacroInfo(macro.key); }}
                                                        aria-label={`${macro.label} ${Math.round(value)} 公克，目標 ${target} 公克，已達 ${pct}%。點擊看說明`}
                                                        whileTap={{ scale: 0.94 }}
                                                        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                                                        className="flex flex-col items-center"
                                                        style={{ background: 'none', border: 'none', padding: 0, width: 80, cursor: 'pointer' }}
                                                    >
                                                        <div className="relative mb-2.5 flex items-center justify-center" style={{ width: 80, height: 80 }}>
                                                            <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90 overflow-visible">
                                                                <defs>
                                                                    <linearGradient id={`macroGrad-${macro.key}`} x1="0%" y1="0%" x2="100%" y2="0%">
                                                                        <stop offset="0%" stopColor={macro.color} />
                                                                        <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.6" />
                                                                        <stop offset="100%" stopColor={macro.color} />
                                                                    </linearGradient>
                                                                </defs>

                                                                {/* Physical Outer Bezel */}
                                                                <circle cx="50" cy="50" r="48" fill="none" stroke="#161415" strokeWidth="0.5" strokeOpacity="0.05" />

                                                                {/* Background Track (Hollow) */}
                                                                <circle
                                                                    cx="50" cy="50" r="40"
                                                                    fill="none"
                                                                    stroke="rgba(22,20,21,0.05)"
                                                                    strokeWidth="8"
                                                                />

                                                                {/* Anodized Progress Ring */}
                                                                <motion.circle
                                                                    cx="50" cy="50" r="40"
                                                                    fill="none"
                                                                    stroke={`url(#macroGrad-${macro.key})`}
                                                                    strokeWidth="8"
                                                                    strokeLinecap="round"
                                                                    strokeDasharray="251.2"
                                                                    initial={{ strokeDashoffset: 251.2 }}
                                                                    animate={{ strokeDashoffset: 251.2 - (251.2 * pct) / 100 }}
                                                                    transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                                                                    style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}
                                                                />
                                                            </svg>

                                                            {/* 中央：已吃 / 目標 —— 兩行都在 11px 下限之上 */}
                                                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                                <span className="tabular-nums" style={{ fontSize: 19, fontWeight: 500, lineHeight: 1, color: '#161415', letterSpacing: '-0.02em' }}>
                                                                    <DataPulse ready={nutritionPatchReady} w="2.2rem" h="1rem" radius="0.32rem" theme="dark" inline>
                                                                        {Math.round(value)}
                                                                    </DataPulse>
                                                                </span>
                                                                <span className="tabular-nums" style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.3, marginTop: 2, color: hit ? macro.color : 'rgba(22,20,21,0.42)' }}>
                                                                    /{target}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* 標籤：中文全名 + 單位，不再是 8px 的英文縮寫 */}
                                                        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', color: 'rgba(22,20,21,0.62)', fontFamily: "'Noto Sans TC', sans-serif" }}>
                                                            {macro.label}
                                                        </span>
                                                        <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(22,20,21,0.34)', marginTop: 1 }}>
                                                            公克
                                                        </span>
                                                    </motion.button>
                                                );
                                            })}
                                        </div>
                                    </RevealCard>
                                </motion.div>{/* /ti-surface hero 磚（整塊可點 = 記錄一餐） */}
                            </div>{/* /data-onboard="nutrition-ring" */}


                            {/* ── Quick Add (RevealCard — Card-First) ── */}
                            <RevealCard
                                isReady={!loading}
                                staggerIndex={1}
                                ghost={
                                    <div style={{
                                        background: 'linear-gradient(145deg, #F0ECE5 0%, #E8E2D9 100%)',
                                        borderRadius: 24,
                                        minHeight: 160,
                                        padding: '1.25rem 1.5rem',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 12,
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <GhostLine width="5rem" height="0.65rem" radius="0.3rem" theme="dark" delay={0} />
                                            <GhostLine width="3rem" height="0.65rem" radius="0.3rem" theme="dark" delay={0.04} />
                                        </div>
                                        <div style={{ display: 'flex', gap: 10 }}>
                                            {[0, 0.06, 0.12, 0.18].map((d, i) => (
                                                <GhostBlock key={i} width="70px" height="70px" radius="16px" theme="dark" delay={d} />
                                            ))}
                                        </div>
                                    </div>
                                }
                            >
                                <div className="mb-6 mt-2">
                                    <div className="flex justify-between items-center mb-2">
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'rgba(22,20,21,0.40)' }}>快速新增</h2>
                                            <span className="text-[11px] font-semibold" style={{ color: 'rgba(22,20,21,0.35)' }}>
                                                {timeLabel}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {(() => {
                                                // 🔁 複製昨天：只在昨天有記錄時顯示，放在最顯眼的 Quick Add 區
                                                const yStr = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return toLocalDateKey(d); })();
                                                const yMeals = (recentEntries || []).find(e => e.date === yStr)?.meals || [];
                                                if (yMeals.length === 0) return null;
                                                return (
                                                    <motion.button {...pressProps('pill')}
 onClick={(e) => openCopyPreview(yMeals, '昨天', e)}
 disabled={isCopyingDay}
 className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg text-[#161415]/55 bg-black/5 disabled:opacity-40 "
 >
                                                        <Copy size={11} strokeWidth={2.2} />
                                                        複製昨天 ({yMeals.length})
                                                    </motion.button>
                                                );
                                            })()}
                                            <motion.button {...pressProps('row')}
                                                onClick={() => setQuickAddSortMode(p => !p)}
                                                className={`text-[11px] font-bold px-2 py-1 rounded-lg transition-all ${quickAddSortMode ? 'bg-[#F95C4B] text-white' : 'text-[#161415]/40 bg-black/5'}`}
                                            >
                                                {quickAddSortMode ? '完成' : '排序'}
                                            </motion.button>
                                        </div>
                                    </div>
                                    {/* 手動切換類別 tabs */}
                                    {(() => {
                                        // ── Meal allocation + rollover logic ──
                                        /* 分餐比例只有一份來源（mealPlanBuilder 的 SLOTS）——
                                           這裡以前自己寫了一組 25/35/25/15，跟那邊的 25/35/30/10 不一樣，
                                           同一個晚餐營養頁說 626、中控台說 751。 */
                                        const MEAL_SLOTS = MEAL_SLOT_DEFS.map((sl) => ({
                                            id: sl.key === 'snack' ? 'snacks' : sl.key,
                                            pct: sl.share,
                                        }));
                                        const getMealSlot = (m) => {
                                            const h = m.timestamp ? new Date(m.timestamp).getHours() : currentHour;
                                            if (h >= 5 && h < 11) return 'breakfast';
                                            if (h >= 11 && h < 16) return 'lunch';
                                            if (h >= 16 && h < 21) return 'dinner';
                                            return 'snacks';
                                        };
                                        const loggedPerSlot = { breakfast: 0, lunch: 0, dinner: 0, snacks: 0 };
                                        todayMeals.forEach(m => { loggedPerSlot[getMealSlot(m)] += (m.calories || 0); });
                                        const planDailyKcal = GOALS.calories;
                                        const allocWithRollover = {};
                                        let carry = 0;
                                        const nowHour = currentHour;
                                        const slotDone = { breakfast: nowHour >= 11, lunch: nowHour >= 16, dinner: nowHour >= 21, snacks: false };
                                        MEAL_SLOTS.forEach(({ id, pct }) => {
                                            const base = planDailyKcal > 0 ? Math.round(planDailyKcal * pct) : 0;
                                            const effective = base;
                                            carry = 0;
                                            allocWithRollover[id] = { base, effective, logged: loggedPerSlot[id], done: slotDone[id], hasRollover: carry > 0 && !slotDone[id] };
                                        });
                                        return (
                                            <div className="flex gap-1.5 mb-3">
                                                {QUICK_ADD_CATS.map(c => {
                                                    const isActive = currentCat === c.id;
                                                    const alloc = allocWithRollover[c.id];
                                                    return (
                                                        <motion.button {...pressProps('pill')}
 key={c.id}
 onClick={() => { triggerHaptic('light'); setQuickAddManualCat(quickAddManualCat === c.id ? null : c.id); }}
 className="flex flex-col items-center justify-center px-2.5 py-1.5 rounded-[12px] text-[11px] font-bold flex-1"
 style={{
 background: isActive ? '#F6F4F1' : 'transparent',
 color: isActive ? 'rgba(22,20,21,0.75)' : 'rgba(22,20,21,0.30)',
 border: isActive ? '1px solid rgba(207,198,184,0.8)' : '1px solid transparent',
 boxShadow: isActive ? 'inset 0 1px 0 rgba(255,255,255,0.85), 0 4px 12px rgba(22,20,21,0.05)' : 'none',
 }}
 >
                                                            <span className="tracking-wide">{c.label}</span>
                                                            {alloc && planDailyKcal > 0 && (
                                                                <span style={{
                                                                    fontSize: 11,
                                                                    fontWeight: 800,
                                                                    fontVariantNumeric: 'tabular-nums',
                                                                    color: alloc.done
                                                                        ? (alloc.logged > alloc.effective ? '#D94030' : '#5A7A3A')
                                                                        : (isActive ? 'rgba(22,20,21,0.55)' : 'rgba(22,20,21,0.30)'),
                                                                    marginTop: 3,
                                                                }}>
                                                                    {/* 已攝取 / 目標，數字清楚對齊 */}
                                                                    <span style={{ fontWeight: 900 }}>{Math.round(alloc.logged)}</span>
                                                                    <span style={{ opacity: 0.5 }}> / {alloc.effective}</span>
                                                                </span>
                                                            )}

                                                        </motion.button>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()}
                                    {/* 🔥 終極解法：將排序與正常模式徹底分離，杜絕 Framer Motion 綁架滑動事件 */}
                                    {quickAddSortMode ? (
                                        /* ── 排序模式 (開啟 Framer Motion) ── */
                                        <Reorder.Group
                                            axis="x"
                                            values={displayQuickFoods}
                                            onReorder={(newOrder) => {
                                                const otherCats = starredFoods.filter(f => f.category !== currentCat && f.category !== 'all');
                                                setStarredFoods([...newOrder, ...otherCats]);
                                            }}
                                            className="flex gap-2.5 overflow-x-auto pb-4 px-1 -mx-1 hide-scrollbar"
                                        >
                                            {displayQuickFoods.slice(0, 10).map((preset, i) => {
                                                const cleanName = preset.name.replace(/\s*[0\.]+\s*$/, '').trim();
                                                return (
                                                    <Reorder.Item
                                                        key={preset.name + i}
                                                        value={preset}
                                                        className="relative group flex-shrink-0"
                                                    >
                                                        <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-4 rounded-[24px] relative overflow-hidden"
                                                            style={{
                                                                minWidth: '85px',
                                                                background: 'transparent'
                                                            }}>
                                                            <div className="absolute inset-0 rounded-[24px] overflow-hidden" style={{ background: 'linear-gradient(150deg, rgba(246,244,241,0.72) 0%, rgba(232,233,230,0.50) 100%)', backdropFilter: 'blur(14px) saturate(1.3)', WebkitBackdropFilter: 'blur(14px) saturate(1.3)', border: '1px solid rgba(255,255,255,0.65)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85)' }}>
                                                                <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(115deg, transparent 12%, rgba(255,255,255,0.4) 46%, transparent 60%)' }} />
                                                            </div>
                                                            <GripVertical size={12} className="text-[#161415]/30 absolute top-2 right-2 z-20" />
                                                            <FoodIcon icons={foodIcons} food={preset} fallback="⭐" size={40} className="z-10 drop-shadow-md" style={{ borderRadius: 12 }} />
                                                            <div className="text-center mt-2 z-10">
                                                                <div className="text-[13px] font-black text-[#161415] whitespace-nowrap leading-tight max-w-[75px] truncate uppercase tracking-tight">{cleanName}</div>
                                                                <div className="text-[11px] font-black text-[#161415]/50 leading-tight tracking-[0.5px] mt-1">{Math.round(preset.calories * defaultGrams(preset) / 100)} 大卡／常用份量</div>
                                                            </div>
                                                        </div>

                                                        <div className="absolute top-2 right-2 flex flex-col gap-2 z-30">
                                                            <motion.button {...pressProps('icon')}
 onClick={() => {
 const realIdx = starredFoods.findIndex(f => f.name === preset.name);
 setEditingStarred(realIdx);
 setNewFav(favToForm({ ...preset, name: cleanName }));
 setFavIconOpen(false);
 setFavMoreOpen(!!(preset.protein || preset.carbs || preset.fats));
 setShowAddFav(true);
 }}
 className="w-7 h-7 rounded-full flex items-center justify-center shadow-md backdrop-blur-md border"
 style={{ background: 'rgba(255,255,255,0.55)', borderColor: 'rgba(255,255,255,0.7)' }}
 >
                                                                <Edit2 size={12} strokeWidth={2.5} className="text-[#161415]/70" />
                                                            </motion.button>
                                                            <motion.button {...pressProps('icon')}
 onClick={() => {
 triggerHaptic('heavy');
 setStarredFoods(prev => prev.filter(f => f.name !== preset.name));
 }}
 className="w-7 h-7 rounded-full flex items-center justify-center shadow-md backdrop-blur-md border"
 style={{ background: 'rgba(249,92,75,0.85)', borderColor: 'rgba(255,255,255,0.3)' }}
 >
                                                                <X size={12} strokeWidth={2.5} className="text-white" />
                                                            </motion.button>
                                                        </div>
                                                    </Reorder.Item>
                                                );
                                            })}
                                        </Reorder.Group>
                                    ) : (
                                        /* ── 正常模式 (純原生 HTML，保證絕對不會卡死) ── */
                                        <div className="flex gap-2.5 overflow-x-auto pb-4 px-1 -mx-1 hide-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
                                            {displayQuickFoods.length === 0 && (
                                                <motion.button {...pressProps('row')} type="button"
                                                    onClick={() => {
                                                        triggerHaptic('medium');
                                                        setIsQuickAddMode(false); setSelectedFood(null);
                                                        setSearchQuery(''); setShowSmartSearch(true);
                                                    }}
                                                    className="flex flex-col justify-center flex-1 px-5 py-4 rounded-[18px] min-h-[110px] text-left"
                                                    style={{ background: '#E8E9E6', border: '1px solid rgba(207,198,184,0.55)' }}>
                                                    <p className="text-[11px] font-extrabold tracking-[0.04em]" style={{ color: 'rgba(22,20,21,0.45)' }}>我的常吃</p>
                                                    <p className="text-[14px] font-bold mt-1.5 leading-snug" style={{ color: 'rgba(22,20,21,0.55)' }}>還沒有常吃的東西</p>
                                                    <p className="text-[11px] font-bold mt-1" style={{ color: '#F95C4B' }}>搜尋記錄第一筆，之後就會出現在這 →</p>
                                                </motion.button>
                                            )}

                                            {/* 🍱 建議卡：每 4 週回饋時依你吃過的東西算的（utils/foodGuidance），標「建議」 */}
                                            {(() => {
                                                const have = new Set(displayQuickFoods.map((f) => String(f.name || '').replace(/\s*[0.]+\s*$/, '').trim()));
                                                return quickAddSuggestions(foodGuidance, currentCat, 3)
                                                    .filter((sg) => !have.has(sg.food.name))
                                                    .map((sg) => {
                                                        const preset = dishSearchFood(sg.food);
                                                        if (!preset) return null;
                                                        return (
                                                            <motion.button {...pressProps('pill')}
                                                                key={`sg_${sg.food.id}`}
                                                                onClick={(e) => handleQuickAdd(preset, e)}
                                                                aria-label={`建議：${sg.food.name}，${sg.why}`}
                                                                className="flex-shrink-0 flex flex-col items-center justify-center gap-1.5 px-4 py-4 rounded-[24px] relative overflow-hidden"
                                                                style={{ minWidth: '85px', maxWidth: '150px', background: 'transparent', WebkitUserSelect: 'none' }}
                                                            >
                                                                <div className="absolute inset-0 rounded-[24px] overflow-hidden" style={{ background: 'linear-gradient(150deg, rgba(255,255,255,0.86) 0%, rgba(246,244,241,0.6) 100%)', border: '1.5px solid rgba(249,92,75,0.45)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)' }} />
                                                                <span className="z-10" style={{ position: 'absolute', top: 8, left: 10, fontSize: 10, fontWeight: 900, color: '#D94030', letterSpacing: '0.06em' }}>建議</span>
                                                                <span className="z-10" style={{ fontSize: 36, lineHeight: 1 }}>{preset.emoji}</span>
                                                                <div className="text-center mt-2 z-10" style={{ maxWidth: 128 }}>
                                                                    <div className="text-[13px] font-black text-[#161415] whitespace-nowrap leading-tight truncate tracking-tight">{sg.food.name}</div>
                                                                    <div className="text-[11px] font-black leading-tight mt-1 truncate" style={{ color: '#D94030' }}>{sg.why}</div>
                                                                </div>
                                                            </motion.button>
                                                        );
                                                    });
                                            })()}

                                            {displayQuickFoods.slice(0, 10).map((preset, i) => {
                                                const cleanName = preset.name.replace(/\s*[0\.]+\s*$/, '').trim();
                                                return (
                                                    <motion.button {...pressProps('pill')}
 key={preset.name + i}
 onClick={(e) => handleQuickAdd(preset, e)}
 className="flex-shrink-0 flex flex-col items-center justify-center gap-1.5 px-4 py-4 rounded-[24px] relative overflow-hidden group/btn"
 style={{
 minWidth: '85px',
 background: 'transparent',
 WebkitUserSelect: 'none'
 }}
 >
                                                        <div className="absolute inset-0 rounded-[24px] overflow-hidden" style={{ background: 'linear-gradient(150deg, rgba(246,244,241,0.72) 0%, rgba(232,233,230,0.50) 100%)', backdropFilter: 'blur(14px) saturate(1.3)', WebkitBackdropFilter: 'blur(14px) saturate(1.3)', border: '1px solid rgba(255,255,255,0.65)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85)' }}>
                                                            <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(115deg, transparent 12%, rgba(255,255,255,0.4) 46%, transparent 60%)' }} />
                                                        </div>
                                                        <FoodIcon icons={foodIcons} food={preset} fallback="⭐" size={40} className="z-10 drop-shadow-md" style={{ borderRadius: 12 }} />
                                                        <div className="text-center mt-2 z-10">
                                                            <div className="text-[13px] font-black text-[#161415] whitespace-nowrap leading-tight max-w-[75px] truncate uppercase tracking-tight">{cleanName}</div>
                                                            <div className="text-[11px] font-black text-[#161415]/50 leading-tight tracking-[0.5px] mt-1">{Math.round(preset.calories * defaultGrams(preset) / 100)} 大卡／常用份量</div>
                                                        </div>
                                                    </motion.button>
                                                );
                                            })}

                                            {/* 新增按鈕 */}
                                            <motion.button {...pressProps('pill')}
 aria-label="新增食物"
 onClick={() => { triggerHaptic('light'); setIsQuickAddMode(false); setSelectedFood(null); setIsComboMode(false); setComboCart([]); setSearchQuery(''); setShowSmartSearch(true); }}
 className="flex-shrink-0 flex flex-col items-center justify-center gap-1 px-4 py-4 rounded-[24px] text-[#161415]"
 style={{
 minWidth: '85px',
 minHeight: '110px',
 background: 'transparent',
 border: '1.2px dashed rgba(184, 184, 184, 0.6)',
 }}
 >
                                                <Plus size={20} strokeWidth={3} />
                                                <span className="text-[12px] font-bold mt-1">新增</span>
                                            </motion.button>
                                        </div>
                                    )}

                                    {/* 「常吃的」不另外開一區 —— 它跟上面那排卡片做的是同一件事
                                        （點一下加進今天），分成兩區只是讓人多捲一段。
                                        已併進快速新增的卡片列（見上方 displayQuickFoods）。 */}
                                    {/* 「匯入舊收藏」已移除：那是一次性的資料搬遷動作，
                                        不該天天掛在記錄畫面上讓人猜它是什麼。 */}
                                </div>
                            </RevealCard>

                            {/* ── 水分補給 (RevealCard — Card-First) ── */}
                            <RevealCard
                                isReady={!loading}
                                staggerIndex={2}
                                ghost={
                                    <div style={{
                                        background: 'linear-gradient(145deg, #E2DDD5 0%, #D1CBC3 100%)',
                                        borderRadius: 28,
                                        minHeight: 110,
                                        padding: '1.5rem',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 16,
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                <GhostLine width="5rem" height="0.65rem" radius="0.3rem" theme="dark" delay={0} />
                                                <GhostLine width="7rem" height="1rem" radius="0.4rem" theme="dark" delay={0.05} />
                                            </div>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <GhostBlock width="52px" height="30px" radius="20px" theme="dark" delay={0.08} />
                                                <GhostBlock width="52px" height="30px" radius="20px" theme="dark" delay={0.11} />
                                            </div>
                                        </div>
                                        <GhostBlock width="100%" height="8px" radius="4px" theme="dark" delay={0.14} />
                                    </div>
                                }
                            >
                                <div className="rounded-[28px] p-6 mb-6 relative overflow-hidden" style={{
                                    background: 'linear-gradient(140deg, rgba(224,237,246,0.72) 0%, rgba(198,218,233,0.48) 52%, rgba(236,244,249,0.68) 100%)',
                                    backdropFilter: 'blur(20px) saturate(1.5)',
                                    WebkitBackdropFilter: 'blur(20px) saturate(1.5)',
                                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -2px 6px rgba(94,134,168,0.12), 0 12px 28px -12px rgba(94,134,168,0.30)',
                                    border: '1px solid rgba(255,255,255,0.65)'
                                }}>
                                    {/* Specular sweep（液態玻璃高光）*/}
                                    <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(105deg, transparent 8%, rgba(255,255,255,0.45) 40%, rgba(255,255,255,0.06) 52%, transparent 64%)' }} />

                                    {/* ── 只講水 ──────────────────────────────────────────────
                                        原本這張卡把水分和膳食纖維放在一起，一張卡兩件事、
                                        兩條看起來一樣的長條，反而誰都看不清楚。
                                        使用者要的就是「今天喝了多少」—— 數字放大、按鈕放大，其他都拿掉。 */}
                                    {(() => {
                                        const water = Math.round(stats.water || 0);
                                        const goal = GOALS.water;
                                        const pct = pctOf(water, goal);
                                        const hit = water >= goal;
                                        return (
                                            <div className="relative z-10">
                                                <div className="flex items-start justify-between mb-4">
                                                    <button
                                                        type="button"
                                                        onClick={() => { triggerHaptic('light'); setMacroInfo('water'); }}
                                                        aria-label={`今天喝了 ${water} 毫升，目標 ${goal} 毫升，已達 ${pct}%。點擊看說明`}
                                                        className="text-left"
                                                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                                                    >
                                                        <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.22em', color: 'rgba(28,58,78,0.55)', textTransform: 'uppercase', marginBottom: 6 }}>
                                                            Water
                                                        </p>
                                                        <span className="tabular-nums" style={{ color: '#16303F', display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                                            <motion.span
                                                                key={water}
                                                                initial={{ scale: 0.9, opacity: 0.6 }}
                                                                animate={{ scale: 1, opacity: 1 }}
                                                                transition={{ type: 'spring', stiffness: 420, damping: 18 }}
                                                                style={{ fontSize: 40, fontWeight: 400, fontFamily: 'var(--font-display)', letterSpacing: '-0.03em', lineHeight: 1 }}
                                                            >
                                                                {water}
                                                            </motion.span>
                                                            <span style={{ fontSize: 14, fontWeight: 700, opacity: 0.5 }}>/ {goal} ml</span>
                                                        </span>
                                                    </button>
                                                    <div className="flex gap-2 shrink-0">
                                                        {[250, 500].map(ml => (
                                                            <motion.button
                                                                key={ml}
                                                                type="button"
                                                                onClick={() => handleQuickAddWater(ml)}
                                                                whileTap={{ scale: 0.92 }}
                                                                transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                                                                aria-label={`喝了 ${ml} 毫升的水`}
                                                                className="rounded-full bg-white/60 border border-white/75 text-[#16303F] backdrop-blur-md"
                                                                style={{ minWidth: 62, minHeight: 44, fontSize: 15, fontWeight: 800, letterSpacing: '0.02em', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)' }}
                                                            >
                                                                +{ml}
                                                            </motion.button>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className="h-2.5 w-full rounded-full overflow-hidden" style={{ background: 'rgba(22,48,63,0.10)', border: '1px solid rgba(255,255,255,0.5)' }}>
                                                    <motion.div
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${pct}%` }}
                                                        transition={{ type: 'spring', stiffness: 160, damping: 26 }}
                                                        className="h-full rounded-full"
                                                        style={{ background: 'linear-gradient(90deg, #8FB8D6 0%, #5E86A8 100%)', boxShadow: '0 0 10px #5E86A888' }}
                                                    />
                                                </div>

                                                <p style={{ fontSize: 13, fontWeight: 700, color: 'rgba(22,48,63,0.62)', marginTop: 12, fontFamily: "'Noto Sans TC', sans-serif" }}>
                                                    {hit ? '今天的水喝夠了' : `再 ${goal - water} ml 就達標`}
                                                </p>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </RevealCard>

                            {/* 4. Smart Suggestions — Recovery Fuel (Swiss Editorial Premium Card) */}
                            <AnimatePresence>
                                {(todayWorkouts.length > 0 && workoutData.lastSession && !dismissedRecovery) && (
                                    (() => {
                                        const weight = realWeight;
                                        const isRun = workoutData.lastSession?.type === 'run' || workoutData.workoutType === 'run';
                                        // ── 統一色票（圖一規範）──
                                        const accentColor = '#F95C4B'; // Coral — 跑步 / 重訓統一
                                        const accentEmber = '#D94030'; // Ember — 深底按鈕
                                        const accentLight = 'rgba(249,92,75,0.09)';
                                        const accentShadow = 'rgba(249,92,75,0.18)';

                                        // ── 科學推薦量 ──
                                        const proteinRec = Math.max(20, Math.round(weight * (isRun ? 0.25 : 0.30)));
                                        const carbsRec = Math.max(30, Math.round(weight * (isRun ? 1.0 : 0.60)));
                                        const fatRec = Math.max(5, Math.round(weight * (isRun ? 0.05 : 0.08)));
                                        const caloriesBurned = Math.round((workoutData.lastSession.calories || workoutData.totalBurn) || 0);

                                        // ── 個人化推薦：根據訓練時段查我的最愛 ──
                                        const sessionHour = workoutData.lastSession?.timestamp
                                            ? new Date(workoutData.lastSession.timestamp).getHours()
                                            : new Date().getHours();
                                        const mealCat =
                                            sessionHour >= 5 && sessionHour < 11 ? 'breakfast' :
                                                sessionHour >= 11 && sessionHour < 14 ? 'lunch' :
                                                    sessionHour >= 14 && sessionHour < 17 ? 'snacks' :
                                                        sessionHour >= 17 && sessionHour < 22 ? 'dinner' : 'snacks';

                                        // 從 starredFoods 取符合時段的前 4 筆，按最愛排序
                                        const MEAL_CAT_LABEL = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snacks: '點心' };
                                        const matchedFavs = starredFoods
                                            .filter(f => f.category === mealCat || f.category === 'all')
                                            .slice(0, 4)
                                            .map(f => ({
                                                emoji: f.emoji || '⭐',
                                                image: f.image || null,
                                                name: f.name,
                                                macro: f.protein > 0
                                                    ? `${Math.round(f.protein)}g 蛋白`
                                                    : f.carbs > 0
                                                        ? `${Math.round(f.carbs)}g 碳水`
                                                        : `${Math.round(f.calories || 0)} kcal`,
                                                isPersonal: true,
                                            }));

                                        // Default fallback（按訓練類型）
                                        const defaultRun = [
                                            { emoji: '🍌', name: '香蕉 + 蜂蜜吐司', macro: `${Math.round(carbsRec * 0.45)}g 碳水`, isPersonal: false },
                                            { emoji: '🥛', name: '全脂牛奶蛋白搖', macro: `${Math.round(proteinRec * 0.5)}g 蛋白`, isPersonal: false },
                                            { emoji: '🥥', name: '椰子水 / 電解質', macro: '補充鈉鉀鎂', isPersonal: false },
                                            { emoji: '🍙', name: '白飯糰', macro: `${Math.round(carbsRec * 0.55)}g 碳水`, isPersonal: false },
                                        ];
                                        const defaultLift = [
                                            { emoji: '🍗', name: '雞胸肉 + 地瓜', macro: `${Math.round(proteinRec * 0.6)}g 蛋白`, isPersonal: false },
                                            { emoji: '🥤', name: 'Whey 乳清蛋白', macro: '亮胺酸觸發合成', isPersonal: false },
                                            { emoji: '🍚', name: '白米飯', macro: `${Math.round(carbsRec * 0.5)}g 碳水`, isPersonal: false },
                                            { emoji: '🥛', name: '全脂牛奶', macro: '酪蛋白緩釋補充', isPersonal: false },
                                        ];
                                        const defaults = isRun ? defaultRun : defaultLift;

                                        // 有我的最愛就用，不足 4 筆時用 default 補齊
                                        const foodSuggestions = matchedFavs.length >= 4
                                            ? matchedFavs
                                            : [...matchedFavs, ...defaults.slice(matchedFavs.length)];
                                        const hasPersonal = matchedFavs.length > 0;

                                        return (
                                            <motion.div
                                                key="recovery-fuel-card"
                                                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: 16, scale: 0.97 }}
                                                transition={{ type: 'spring', damping: 28, stiffness: 260 }}
                                                className="mb-4 overflow-hidden"
                                                style={{
                                                    borderRadius: 28,
                                                    background: '#F6F4F1',
                                                    boxShadow: `0 2px 1px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.07), 0 20px 40px ${accentShadow}`,
                                                    border: `1px solid rgba(22,20,21,0.07)`,
                                                }}
                                            >
                                                {/* ── Minimalist Editorial Header ── */}
                                                <div
                                                    className="relative px-6 pt-5 pb-3 border-b border-[#161415]/5"
                                                >
                                                    <div className="flex items-baseline justify-between relative z-10">
                                                        <div>
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <div className="w-1 h-1 rounded-full bg-[#F95C4B]" />
                                                                <span className="text-[12px] font-black tracking-[0.04em] text-[#F95C4B]">訓練後補給</span>
                                                            </div>
                                                            <h3 className="text-xl font-black italic uppercase leading-tight tracking-tight text-[#F95C4B]" style={{ fontFamily: '"Tenor Sans", sans-serif' }}>
                                                                Recovery Fuel
                                                            </h3>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="text-[12px] font-black text-[#161415]/30 tracking-[0.04em] block mb-0.5">已消耗</span>
                                                            <div className="flex items-baseline justify-end gap-1">
                                                                <span className="text-xl font-black tabular-nums text-[#161415]" style={{ fontFamily: '"Tenor Sans", sans-serif' }}>{caloriesBurned}</span>
                                                                <span className="text-[11px] font-bold text-[#161415]/40">kcal</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* ── Minimalist Macro Grid ── */}
                                                <div className="px-6 py-6">
                                                    <div className="grid grid-cols-3 divide-x divide-[#161415]/5">
                                                        {[
                                                            { label: isRun ? '碳水' : '蛋白質', value: isRun ? carbsRec : proteinRec, unit: 'g', primary: true },
                                                            { label: isRun ? '蛋白質' : '碳水', value: isRun ? proteinRec : carbsRec, unit: 'g', primary: false },
                                                            { label: '脂肪', value: fatRec, unit: 'g', primary: false },
                                                        ].map((item, idx) => (
                                                            <div key={idx} className="flex flex-col items-center">
                                                                <span className="text-[9px] font-black uppercase tracking-[0.3em] mb-2" style={{ color: item.primary ? accentColor : '#161415', opacity: item.primary ? 1 : 0.3, fontFamily: '"Tenor Sans", sans-serif' }}>
                                                                    {item.label}
                                                                </span>
                                                                <div className="flex items-baseline gap-0.5">
                                                                    <span className="text-2xl font-black tabular-nums leading-none text-[#161415]" style={{ fontFamily: '"Tenor Sans", sans-serif', letterSpacing: '-0.03em' }}>
                                                                        {item.value}
                                                                    </span>
                                                                    <span className="text-[11px] font-bold text-[#161415]/30">{item.unit}</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <p className="text-[9px] font-black uppercase tracking-[0.4em] text-center mt-5 text-[#161415]/30" style={{ fontFamily: '"Tenor Sans", sans-serif' }}>
                                                        Protocol Optimized · {weight} kg
                                                    </p>
                                                </div>

                                                {/* ── 分隔線 ── */}
                                                <div style={{ margin: '16px 22px 0', height: 1, background: 'rgba(22,20,21,0.07)' }} />

                                                {/* ── 食物建議清單 ── */}
                                                <div style={{ padding: '14px 22px 0' }}>
                                                    {/* 標題列：顯示是否個人化 */}
                                                    <div
                                                        className="flex items-center justify-between mb-3 cursor-pointer"
                                                        onClick={() => { setShowRecommendedMeals(!showRecommendedMeals); triggerHaptic('light'); }}
                                                    >
                                                        <div className="flex items-center gap-1.5">
                                                            <p className="text-[9px] font-black uppercase tracking-[0.26em]" style={{ color: '#161415', fontFamily: '"Tenor Sans", sans-serif', opacity: 0.9 }}>
                                                                Recommended Meals
                                                            </p>
                                                            {showRecommendedMeals ? <ChevronUp size={10} className="text-[#161415]/30" /> : <ChevronDown size={10} className="text-[#161415]/30" />}
                                                        </div>
                                                    </div>

                                                    <AnimatePresence>
                                                        {showRecommendedMeals && (
                                                            <motion.div
                                                                initial={{ height: 0, opacity: 0 }}
                                                                animate={{ height: 'auto', opacity: 1 }}
                                                                exit={{ height: 0, opacity: 0 }}
                                                                transition={{ duration: 0.3, ease: "easeInOut" }}
                                                                className="overflow-hidden"
                                                            >
                                                                <div className="grid grid-cols-2 gap-2 pb-1">
                                                                    {foodSuggestions.map((food, idx) => (
                                                                        <div
                                                                            key={idx}
                                                                            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5"
                                                                            style={{
                                                                                background: food.isPersonal ? accentLight : 'rgba(22,20,21,0.04)',
                                                                                border: food.isPersonal
                                                                                    ? `1px solid rgba(249,92,75,0.18)`
                                                                                    : '1px solid rgba(22,20,21,0.05)',
                                                                            }}
                                                                        >
                                                                            <span className="flex-shrink-0 relative w-6 h-6 flex items-center justify-center rounded-lg overflow-hidden bg-white/20">
                                                                                {food.image ? (
                                                                                    <img loading="lazy" decoding="async" src={food.image} className="w-full h-full object-cover" alt="" />
                                                                                ) : (
                                                                                    <span style={{ fontSize: 16, lineHeight: 1 }}>{food.emoji}</span>
                                                                                )}
                                                                            </span>
                                                                            <div className="overflow-hidden">
                                                                                <p className="text-[11px] font-bold leading-tight truncate" style={{ color: '#161415' }}>{food.name}</p>
                                                                                <p className="text-[11px] font-medium mt-0.5" style={{ color: food.isPersonal ? accentColor : 'rgba(22,20,21,0.40)' }}>{food.macro}</p>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>

                                                {/* ── CTA ── */}
                                                <div style={{ padding: '16px 22px 20px' }}>
                                                    <motion.button
                                                        whileTap={{ scale: 0.97 }}
                                                        onClick={(e) => handleSmartRecoveryLog(e)}
                                                        className="w-full flex items-center justify-center gap-2.5 font-black uppercase"
                                                        style={{
                                                            background: `
                                                                linear-gradient(135deg, 
                                                                    #8C847E 0%, 
                                                                    #B6ADA5 25%, 
                                                                    #E4DED2 45%, 
                                                                    #D1CEC7 55%, 
                                                                    #B6ADA5 80%, 
                                                                    #8C847E 100%
                                                                )
                                                            `,
                                                            color: '#161415',
                                                            borderRadius: 12,
                                                            padding: '16px 20px',
                                                            fontSize: 12,
                                                            letterSpacing: '0.2em',
                                                            fontFamily: '"Tenor Sans", sans-serif',
                                                            border: '1px solid rgba(255,255,255,0.3)',
                                                            boxShadow: '0 8px 32px rgba(0,0,0,0.15), inset 0 1px 1px rgba(255,255,255,0.8)',
                                                            textShadow: '0 0.5px 0 rgba(255,255,255,0.2)'
                                                        }}
                                                    >
                                                        RECORD NOW
                                                    </motion.button>
                                                </div>
                                            </motion.div>
                                        );
                                    })()
                                )}
                            </AnimatePresence>


                            {/* 自己建一個食物 —— 從搜尋進來（找不到時）或編輯常用食物。
                                FINAL DRVN：Paper 底 → 名字是這一頁的標題（大字＋一條 Pebble 細線，不框）
                                → 一張亮面拉絲鈦卡放「一份」的兩個數字（熱量是主角，1.5px 直角硬線隔開份量）
                                → 可不填的營養素沉在 Mist 冷灰底 → 唯一的珊瑚是「加入常用」。
                                欄位照包裝習慣填「一份」，存的時候才換算成每 100 g。 */}
                            <AnimatePresence>
                                {showAddFav && (() => {
                                    const closeFav = () => { setShowAddFav(false); setEditingStarred(null); setFavIconOpen(false); setFavMoreOpen(false); };
                                    const canSave = !!(newFav.name || '').trim() && Number(newFav.calories) > 0;
                                    const INK = '#161415', FAINT = 'rgba(22,20,21,0.40)', GHOST = 'rgba(22,20,21,0.22)', PEBBLE = '#CFC6B8', MIST = '#E8E9E6';
                                    const EASE = [0.16, 1, 0.3, 1];
                                    const rise = (i) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, ease: EASE, delay: 0.06 + i * 0.07 } });
                                    const KICKER = { fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', color: FAINT };
                                    const numInput = (key, size, label, onDark = false) => (
                                        <input type="number" inputMode="decimal" placeholder="0" aria-label={label} value={newFav[key]}
                                            onChange={e => setNewFav({ ...newFav, [key]: e.target.value })}
                                            className={onDark ? 'ti-metric placeholder:text-[rgba(246,244,241,0.30)]' : 'ti-metric placeholder:text-[rgba(22,20,21,0.36)]'}
                                            style={{ width: '100%', minWidth: 0, border: 'none', outline: 'none', background: 'transparent', padding: 0, fontSize: size, color: onDark ? '#F6F4F1' : INK }} />
                                    );
                                    return (
                                    <motion.div
                                        key="fav-sheet"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0, transition: { duration: 0.16 } }}
                                        className="fixed inset-0 z-[100] flex items-end justify-center"
                                        style={{ background: 'rgba(22,20,21,0.42)' }}
                                        onClick={closeFav}
                                    >
                                        <motion.div
                                            initial={{ y: 24, opacity: 0, scale: 0.98 }}
                                            animate={{ y: 0, opacity: 1, scale: 1 }}
                                            exit={{ y: 24, opacity: 0, transition: { duration: 0.16, ease: [0, 0, 0.2, 1] } }}
                                            transition={{ duration: 0.4, ease: EASE }}
                                            onClick={e => e.stopPropagation()}
                                            className="no-scrollbar"
                                            style={{
                                                width: '100%', maxWidth: 440, boxSizing: 'border-box', background: '#F6F4F1', color: INK,
                                                borderRadius: '36px 36px 0 0', padding: '12px 20px max(20px, env(safe-area-inset-bottom))',
                                                boxShadow: '0 -24px 48px -18px rgba(32,32,32,0.22)',
                                                maxHeight: 'calc(100dvh - env(safe-area-inset-top) - 12px)', overflowY: 'auto',
                                            }}
                                        >
                                            <div aria-hidden style={{ width: 36, height: 4, borderRadius: 999, background: PEBBLE, margin: '0 auto 14px' }} />

                                            {/* kicker + 關閉 */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <div style={{ ...KICKER, flex: 1, minWidth: 0 }}>{editingStarred !== null ? '編輯常用食物' : '新的常用食物'}</div>
                                                <motion.button {...pressProps('icon')} type="button" aria-label="關閉" onClick={() => { triggerHaptic('light'); closeFav(); }}
                                                    style={{ width: 44, height: 44, borderRadius: 999, border: 'none', background: MIST, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    <X size={18} color={INK} />
                                                </motion.button>
                                            </div>

                                            <input type="file" ref={favPhotoInputRef} onChange={(e) => { handleFavPhotoUpload(e); setFavIconOpen(false); }} accept="image/*" className="hidden" />

                                            {/* 標題列：圖示＋名字（名字就是這頁的大標，不框，下面一條 Pebble 細線） */}
                                            <motion.div {...rise(0)} style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginTop: 6 }}>
                                                <motion.button {...pressProps('icon')} type="button" aria-label="換圖示" aria-expanded={favIconOpen}
                                                    onClick={() => { triggerHaptic('light'); setFavIconOpen(v => !v); }}
                                                    style={{ width: 56, height: 56, flexShrink: 0, borderRadius: 18, overflow: 'hidden', background: MIST, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, lineHeight: 1,
                                                        border: 'none', boxShadow: favIconOpen ? `0 0 0 1.5px ${INK}` : 'inset 0 1px 2px rgba(22,20,21,0.06)' }}>
                                                    {newFav.image ? <img src={newFav.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (newFav.emoji || '🍽️')}
                                                </motion.button>
                                                <input type="text" value={newFav.name} aria-label="食物名稱" placeholder="食物名稱"
                                                    onChange={(e) => setNewFav({ ...newFav, name: e.target.value })}
                                                    className="placeholder:text-[rgba(22,20,21,0.22)]"
                                                    style={{ flex: 1, minWidth: 0, height: 56, border: 'none', borderBottom: `1px solid ${PEBBLE}`, borderRadius: 0, background: 'transparent', padding: '0 0 6px', outline: 'none',
                                                        fontSize: 26, fontWeight: 300, letterSpacing: '-0.02em', color: INK, boxSizing: 'border-box' }} />
                                            </motion.div>

                                            {/* 圖示：點了才展開，沉在 Mist 冷灰底 */}
                                            <AnimatePresence initial={false}>
                                                {favIconOpen && (
                                                    <motion.div key="icons" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.28, ease: EASE }} style={{ overflow: 'hidden' }}>
                                                        <div className="hide-scrollbar" style={{ display: 'flex', gap: 4, overflowX: 'auto', marginTop: 12, padding: 6, borderRadius: 24, background: MIST, WebkitOverflowScrolling: 'touch' }}>
                                                            <motion.button {...pressProps('pill')} type="button" onClick={() => favPhotoInputRef.current?.click()}
                                                                style={{ flexShrink: 0, height: 44, padding: '0 14px', borderRadius: 999, border: 'none', background: '#F6F4F1', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, color: INK, boxShadow: '0 1px 2px rgba(32,32,32,0.04)' }}>
                                                                <Camera size={16} /> 照片
                                                            </motion.button>
                                                            {FOOD_EMOJIS.map((em) => {
                                                                const on = !newFav.image && newFav.emoji === em;
                                                                return (
                                                                    <motion.button key={em} {...pressProps('icon')} type="button" aria-label={`用 ${em} 當圖示`} aria-pressed={on}
                                                                        onClick={() => { triggerHaptic('light'); setNewFav({ ...newFav, emoji: em, image: null }); setFavIconOpen(false); }}
                                                                        style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 999, fontSize: 22, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
                                                                            background: on ? '#F6F4F1' : 'transparent', boxShadow: on ? `0 0 0 1.5px ${INK}` : 'none' }}>
                                                                        {em}
                                                                    </motion.button>
                                                                );
                                                            })}
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>

                                            {/* 主角：黑色液態玻璃 —— 一份的熱量（大）｜份量（小），中間 1.5px 直角硬線；邊緣折射帶一點虹彩 */}
                                            <motion.div {...rise(1)} className="lg-black"
                                                style={{ marginTop: 20, borderRadius: 28, padding: '18px 20px 20px', display: 'flex', alignItems: 'stretch', overflow: 'hidden' }}>
                                                <label style={{ flex: 1.7, minWidth: 0, display: 'block', position: 'relative', zIndex: 1, cursor: 'text' }}>
                                                    <span style={{ ...KICKER, color: 'rgba(246,244,241,0.60)', display: 'block' }}>一份的熱量</span>
                                                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
                                                        <span style={{ flex: 1, minWidth: 0 }}>{numInput('calories', 52, '輸入熱量', true)}</span>
                                                        <span style={{ fontSize: 12, fontWeight: 800, color: 'rgba(246,244,241,0.60)', flexShrink: 0 }}>大卡</span>
                                                    </span>
                                                </label>
                                                <div aria-hidden style={{ width: 1.5, background: 'rgba(255,255,255,0.16)', margin: '2px 18px', flexShrink: 0, position: 'relative', zIndex: 1 }} />
                                                <label style={{ flex: 1, minWidth: 0, display: 'block', position: 'relative', zIndex: 1, cursor: 'text' }}>
                                                    <span style={{ ...KICKER, color: 'rgba(246,244,241,0.60)', display: 'block' }}>份量</span>
                                                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 8, paddingTop: 14 }}>
                                                        <span style={{ flex: 1, minWidth: 0 }}>{numInput('serving_size_g', 30, '一份幾克', true)}</span>
                                                        <span style={{ fontSize: 12, fontWeight: 800, color: 'rgba(246,244,241,0.60)', flexShrink: 0 }}>g</span>
                                                    </span>
                                                </label>
                                            </motion.div>

                                            {/* 可不填：沉在 Mist 冷灰底 */}
                                            <motion.div {...rise(2)} style={{ marginTop: 12, borderRadius: 24, background: MIST, overflow: 'hidden' }}>
                                                <motion.button {...pressProps('row')} type="button" aria-expanded={favMoreOpen}
                                                    onClick={() => { triggerHaptic('light'); setFavMoreOpen(v => !v); }}
                                                    style={{ width: '100%', minHeight: 52, display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'none', padding: '0 18px', color: INK, textAlign: 'left' }}>
                                                    <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700 }}>
                                                        營養素與分類<span style={{ color: FAINT, fontWeight: 600 }}> · 可不填</span>
                                                    </span>
                                                    <ChevronDown size={18} color={FAINT} style={{ flexShrink: 0, transform: favMoreOpen ? 'rotate(180deg)' : 'none', transition: 'transform .28s cubic-bezier(0.16,1,0.3,1)' }} />
                                                </motion.button>
                                                <AnimatePresence initial={false}>
                                                    {favMoreOpen && (
                                                        <motion.div key="more" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.28, ease: EASE }} style={{ overflow: 'hidden' }}>
                                                            <div style={{ padding: '0 18px 18px' }}>
                                                                {/* 直角資料列：三格用 1.5px Pebble 硬線分開 */}
                                                                <div style={{ display: 'flex', borderTop: `1.5px solid ${PEBBLE}`, paddingTop: 12 }}>
                                                                    {[['protein', '蛋白質'], ['carbs', '碳水'], ['fats', '脂肪']].map(([key, label], i) => (
                                                                        <label key={key} style={{ flex: 1, minWidth: 0, display: 'block', cursor: 'text', paddingLeft: i ? 12 : 0, marginLeft: i ? 12 : 0, borderLeft: i ? `1.5px solid ${PEBBLE}` : 'none' }}>
                                                                            <span style={{ ...KICKER, letterSpacing: '0.16em', display: 'block' }}>{label}</span>
                                                                            <span style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginTop: 6, minHeight: 32 }}>
                                                                                <span style={{ flex: 1, minWidth: 0 }}>{numInput(key, 24, label)}</span>
                                                                                <span style={{ fontSize: 12, fontWeight: 800, color: FAINT, flexShrink: 0 }}>g</span>
                                                                            </span>
                                                                        </label>
                                                                    ))}
                                                                </div>
                                                                <div style={{ ...KICKER, margin: '18px 0 8px' }}>放在哪一餐</div>
                                                                <div style={{ display: 'flex', gap: 2, padding: 4, borderRadius: 999, background: 'rgba(22,20,21,0.05)' }}>
                                                                    {[{ id: 'all', label: '不分' }, { id: 'breakfast', label: '早' }, { id: 'lunch', label: '午' }, { id: 'dinner', label: '晚' }, { id: 'snacks', label: '甜點' }].map(cat => {
                                                                        const on = (newFav.category || 'all') === cat.id;
                                                                        return (
                                                                            <motion.button key={cat.id} {...pressProps('pill')} type="button" aria-pressed={on}
                                                                                onClick={() => { triggerHaptic('light'); setNewFav({ ...newFav, category: cat.id }); }}
                                                                                style={{ flex: 1, minWidth: 0, height: 44, borderRadius: 999, border: 'none', fontSize: 14, fontWeight: 700,
                                                                                    background: on ? '#F6F4F1' : 'transparent', color: on ? INK : FAINT, boxShadow: on ? '0 8px 24px -10px rgba(32,32,32,0.16), 0 1px 2px rgba(32,32,32,0.04)' : 'none' }}>
                                                                                {cat.label}
                                                                            </motion.button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </motion.div>

                                            {/* 唯一的珊瑚 */}
                                            {/* 內容一長（小螢幕展開營養素）按鈕仍貼在底部看得到 */}
                                            <motion.div {...rise(3)} style={{ position: 'sticky', bottom: 0, zIndex: 2, margin: '0 -20px', padding: '0 20px 2px', background: 'linear-gradient(to bottom, rgba(246,244,241,0) 0%, #F6F4F1 22px)' }}>
                                                <motion.button {...pressProps('cta')} type="button"
                                                    onClick={() => { if (!canSave) { triggerHaptic('heavy'); return; } triggerHaptic('success'); handleAddFavSubmit(); }}
                                                    aria-disabled={!canSave}
                                                    className={canSave ? 'ti-btn-primary' : ''}
                                                    style={{ width: '100%', height: 56, marginTop: 20, borderRadius: 999, fontSize: 16, letterSpacing: '0.12em',
                                                        ...(canSave ? {} : { border: 'none', fontWeight: 800, background: 'rgba(22,20,21,0.06)', color: GHOST }) }}>
                                                    {editingStarred !== null ? '儲存' : '加入常用'}
                                                </motion.button>
                                            </motion.div>
                                            {editingStarred !== null && (
                                                <motion.button {...pressProps('row')} type="button"
                                                    onClick={() => { triggerHaptic('heavy'); handleDeleteFav({ stopPropagation: () => { } }, editingStarred); closeFav(); }}
                                                    style={{ width: '100%', height: 44, marginTop: 6, border: 'none', background: 'none', fontSize: 14, fontWeight: 700, color: '#D94030' }}>
                                                    從常用移除
                                                </motion.button>
                                            )}
                                        </motion.div>
                                    </motion.div>
                                    );
                                })()}
                            </AnimatePresence>

                            {/* ⚖️ 份量估算指南 Modal — 鈦金屬瑞士高級雜誌質感 */}
                            <AnimatePresence>
                                {showPortionGuide && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/75 backdrop-blur-xl"
                                        onClick={() => setShowPortionGuide(false)}
                                    >
                                        <motion.div
                                            initial={{ scale: 0.95, opacity: 0, y: 24 }}
                                            animate={{ scale: 1, opacity: 1, y: 0 }}
                                            exit={{ scale: 0.95, opacity: 0, y: 24 }}
                                            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                                            onClick={e => e.stopPropagation()}
                                            className="bg-gradient-to-br from-[#262523] via-[#121111] to-[#181617] border border-[#FAF8F5]/10 rounded-[36px] p-7 w-full max-w-sm max-h-[90dvh] overflow-y-auto no-scrollbar shadow-[0_32px_64px_-16px_rgba(0,0,0,0.8)] relative"
                                        >
                                            {/* Ambient Metallic Glow inside container */}
                                            <div className="absolute top-0 left-1/4 w-1/2 h-16 bg-[#FAF8F5]/2 rounded-full blur-[20px] pointer-events-none" />

                                            <div className="flex justify-between items-start mb-7 relative z-10">
                                                <div>
                                                    {/* ⚠️ 以前上面有「01 · VISUAL PORTION GUIDE」—— 英文小標跟大標講同一件事，刪掉。 */}
                                                    <h3 className="text-[22px] font-bold tracking-tight text-[#F6F4F1]">
                                                        用手估份量
                                                    </h3>
                                                    <p className="text-[12px] font-semibold mt-1.5" style={{ color: 'rgba(246,244,241,0.5)' }}>
                                                        {selectedFood ? '點一個最接近的，直接填進去' : '沒有秤的時候，用手比就好'}
                                                    </p>
                                                </div>
                                                <motion.button {...pressProps('icon')}
 onClick={() => { setShowPortionGuide(false); triggerHaptic('light'); }}
 className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white"
 >
                                                    <X size={15} strokeWidth={2.5} />
                                                </motion.button>
                                            </div>

                                            <div className="space-y-3 relative z-10">
                                                {/* 每一列都是按鈕：點了就把公克填回去、關掉這張。
                                                    ⚠️ 以前這張只能看不能按 —— 看完還要自己記住數字、關掉、再打進去；
                                                       左邊的圖示是深灰色畫在深黑底上，整排看起來是空白方塊。 */}
                                                {[
                                                    { icon: '✋', title: '一個手掌心', desc: '肉、魚、海鮮', grams: 100 },
                                                    { icon: '✊', title: '一個拳頭', desc: '飯、麵、地瓜', grams: 150 },
                                                    { icon: '🤲', title: '雙手捧起', desc: '青菜', grams: 200 },
                                                    { icon: '👍', title: '一個大拇指', desc: '堅果、油、醬料', grams: 10 },
                                                    { icon: '🥚', title: '一顆蛋', desc: '雞蛋', grams: 50 },
                                                ].map((item, i) => (
                                                    <motion.button
                                                        key={i}
                                                        {...pressProps('row')}
                                                        onClick={() => {
                                                            if (selectedFood) {
                                                                setInputGrams(item.grams);
                                                                triggerHaptic('success');
                                                            } else {
                                                                triggerHaptic('light');
                                                            }
                                                            setShowPortionGuide(false);
                                                        }}
                                                        className="w-full text-left bg-white/[0.04] border border-white/10 rounded-[18px] p-3.5 flex items-center gap-4"
                                                        style={{ minHeight: 64 }}
                                                    >
                                                        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-[24px]" style={{ background: 'rgba(246,244,241,0.08)', border: '1px solid rgba(246,244,241,0.12)' }}>
                                                            {item.icon}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-[14px] font-bold text-[#F6F4F1] truncate">{item.title}</p>
                                                            <p className="text-[12px] font-semibold mt-0.5" style={{ color: 'rgba(246,244,241,0.5)' }}>{item.desc}</p>
                                                        </div>
                                                        <span className="text-[17px] font-bold text-[#F95C4B] tabular-nums flex-shrink-0">
                                                            {item.grams} g
                                                        </span>
                                                    </motion.button>
                                                ))}
                                            </div>

                                            {/* 右上角已有 ✕；這裡不再放一顆「了解，繼續紀錄」—— 選一列就是繼續。 */}
                                        </motion.div>
                                    </motion.div>
                                )}
                            </AnimatePresence>


                            {/* ── Food Log 區塊 ── */}
                            <RevealCard
                                isReady={!loading}
                                staggerIndex={3}
                                ghost={
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <GhostLine width="5rem" height="0.75rem" radius="0.35rem" theme="light" delay={0} />
                                            <GhostLine width="3rem" height="0.65rem" radius="0.3rem" theme="light" delay={0.04} />
                                        </div>
                                        <GhostBlock width="100%" height="220px" radius="32px" theme="light" delay={0.06}
                                            style={{ background: 'linear-gradient(145deg, rgba(207,198,184,0.6), rgba(180,170,155,0.5))' }}
                                        />
                                    </div>
                                }
                            >
                                <div className="mb-6">
                                    <div className="flex justify-between items-center mb-3">
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-xl font-bold" style={{ color: '#161415' }}>今天吃了什麼</h2>
                                            {todayMeals.length > 0 && (
                                                <span className="text-[11px] font-black px-1.5 py-0.5 rounded-full bg-[#161415] text-white tabular-nums">
                                                    {todayMeals.length}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {todayMeals.length > 0 && (
                                                <motion.button {...pressProps('pill')}
 onClick={() => { triggerHaptic('light'); setIsFoodLogEditMode(!isFoodLogEditMode); }}
 className={`px-3 py-1.5 rounded-full text-[11px] font-black ${isFoodLogEditMode
 ? 'bg-[#F95C4B] text-white shadow-md'
 : 'bg-black/6 text-[#161415]/55 border border-black/8'
 }`}
 >
                                                    {isFoodLogEditMode ? '✓ 完成' : '編輯'}
                                                </motion.button>
                                            )}
                                            <motion.button {...pressProps('pill')}
 onClick={() => { triggerHaptic('light'); setIsQuickAddMode(false); setShowSmartSearch(true); }}
 className="text-[12px] font-black tracking-widest transition-colors "
 style={{ color: 'rgba(22,20,21,0.35)' }}
 >
                                                全部 →
                                            </motion.button>
                                        </div>
                                    </div>

                                    {/* Food Log 卡片 — Pebble 質感 */}
                                    <div className="rounded-[28px] overflow-hidden relative shadow-sm border border-black/5" style={{ background: '#E4DED2' }}>

                                        {todayMeals.length === 0 ? (
                                            // ── 今日無紀錄：顯示最近 3 天的歷史餐點 ──
                                            (() => {
                                                const pastDays = (recentEntries || []).filter(d => d.date !== todayDate && d.meals && d.meals.length > 0);
                                                if (pastDays.length === 0) {
                                                    return (
                                                        <div className="px-6 py-8" style={{ background: '#E8E9E6', color: '#161415' }}>
                                                            {/* 這個空狀態就在「今天吃了什麼」標題正下方 ——
                                                                原本 kicker 又寫一次同樣四個字，等於連著讀兩遍。
                                                                大字 0 已經說明沒有紀錄，一行提示就夠。 */}
                                                            <div className="flex items-baseline gap-2">
                                                                <span className="font-light tabular-nums leading-none" style={{ fontFamily: 'var(--font-display)', fontSize: '56px', letterSpacing: '-0.03em', color: 'rgba(22,20,21,0.28)' }}>0</span>
                                                                <span className="text-[11px] font-bold" style={{ color: 'rgba(22,20,21,0.35)' }}>餐</span>
                                                            </div>
                                                            <p className="text-[11px] font-medium mt-3" style={{ color: 'rgba(22,20,21,0.42)' }}>從下方開始記錄</p>
                                                        </div>
                                                    );
                                                }
                                                return (
                                                    <div>
                                                        <div className="px-5 pt-4 pb-1">
                                                            <p className="text-[11px] font-black tracking-[0.04em] opacity-45" style={{ color: '#161415' }}>今日尚未記錄 · 最近記錄</p>
                                                        </div>
                                                        {pastDays.flatMap(dayGroup => {
                                                            const isYesterday = (() => {
                                                                const yesterday = new Date();
                                                                yesterday.setDate(yesterday.getDate() - 1);
                                                                return dayGroup.date === toLocalDateKey(yesterday);
                                                            })();
                                                            const dateLabel = isYesterday ? '昨日' : dayGroup.date;
                                                            return [
                                                                <div key={`hdr-${dayGroup.date}`} className="px-5 pt-3 pb-1 flex items-center justify-between gap-3">
                                                                    <span className="text-[9px] font-black tracking-widest uppercase opacity-30" style={{ color: '#161415' }}>{dateLabel}</span>
                                                                    <motion.button {...pressProps('pill')}
 onClick={(e) => openCopyPreview(dayGroup.meals, dateLabel, e)}
 disabled={isCopyingDay}
 className="flex items-center gap-1 px-3 py-1 rounded-full text-[9px] font-black tracking-widest uppercase bg-[#161415]/5 border border-[#161415]/10 text-[#161415]/65 disabled:opacity-40"
 >
                                                                        <Copy size={10} strokeWidth={2.4} />
                                                                        複製這天 ({dayGroup.meals.length})
                                                                    </motion.button>
                                                                </div>,
                                                                ...dayGroup.meals.slice(0, 3).map((food, i) => {
                                                                    const cleanName = food.name.replace(/\s*[0\.]+\s*$/, '').trim();
                                                                    const displayCals = food.calories > 0 ? food.calories
                                                                        : Math.round((food.protein || 0) * 4 + (food.carbs || 0) * 4 + (food.fats || 0) * 9);

                                                                    const isWater = cleanName.includes('水') || (food.water_ml || food.water) > 0;

                                                                    return (
                                                                        <div key={`${dayGroup.date}-${food.id || i}`}
                                                                            className="flex justify-between items-center gap-4 px-5 py-3 opacity-60"
                                                                            style={{ borderBottom: '1px solid rgba(22,20,21,0.06)' }}
                                                                        >
                                                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                                                <div className="w-8 h-8 flex items-center justify-center shrink-0 rounded-xl" style={{ background: 'rgba(22,20,21,0.04)', color: 'rgba(22,20,21,0.45)' }}>
                                                                                    {food.image ? (
                                                                                        <img loading="lazy" decoding="async" src={food.image} className="w-full h-full object-cover rounded-xl" alt="" />
                                                                                    ) : (
                                                                                        isWater ? <Droplets size={15} strokeWidth={2} /> : <Utensils size={14} strokeWidth={2} />
                                                                                    )}</div>
                                                                                <span className="text-sm font-bold text-[#161415] truncate">{cleanName}</span>
                                                                            </div>
                                                                            <span className="text-[16px] font-light tabular-nums text-[#161415] shrink-0" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>{displayCals} <span className="text-[9px] font-bold opacity-40 uppercase" style={{ fontFamily: 'var(--font-body)' }}>kcal</span></span>
                                                                        </div>
                                                                    );
                                                                })
                                                            ];
                                                        })}
                                                    </div>
                                                );
                                            })()
                                        ) : todayMeals.slice(0, 5).map((food, i) => {
                                            // 防呆：強制移除 00 贅字
                                            const cleanName = food.name.replace(/\s*[0\.]+\s*$/, '').trim();
                                            // Atwater 補算：DB calories=0 但巨量營養素有值時估算顯示卡路里
                                            const displayCals = (food.calories > 0)
                                                ? food.calories
                                                : Math.round((food.protein || 0) * 4 + (food.carbs || 0) * 4 + (food.fats || 0) * 9);
                                            // 圖六：跳過所有巨量營養素都為0的極端資料
                                            if (displayCals === 0 && (food.protein || 0) === 0 && (food.carbs || 0) === 0 && (food.fats || 0) === 0) return null;

                                            const matchingFav = starredFoods.find(f => f.name.replace(/\s*[0\.]+\s*$/, '').trim() === cleanName);
                                            const matchingRecent = recentEntries?.flatMap(e => e.meals).find(f => f.name.replace(/\s*[0\.]+\s*$/, '').trim() === cleanName && f.emoji);
                                            const displayEmoji = food.emoji || matchingFav?.emoji || matchingRecent?.emoji || (cleanName.includes('水') ? '💧' : '🍽️');

                                            // 點擊已記錄餐點 → 換算回 per-100g 並打開計算機
                                            const openLoggedFoodCalc = () => {
                                                if (isFoodLogEditMode) return; // 編輯模式時不跳計算機
                                                triggerHaptic('light');
                                                const grams = food.grams || 100;
                                                const per100 = (v) => grams > 0 ? parseFloat(((v / grams) * 100).toFixed(2)) : 0;
                                                setSelectedFood({
                                                    id: food.food_id || null,
                                                    name: food.name,
                                                    calories: per100(food.calories),
                                                    protein: per100(food.protein),
                                                    carbs: per100(food.carbs),
                                                    fats: per100(food.fats),
                                                    fiber: per100(food.fiber || 0),
                                                    serving_size_g: grams,
                                                    is_tfda: food.is_tfda || 0,
                                                    is_global: food.is_global || 0,
                                                    emoji: food.emoji || '🍽️',
                                                });
                                                setInputGrams(grams);
                                                setIsQuickAddMode(true);
                                                setShowSmartSearch(true);
                                            };

                                            return (
                                                <motion.div
                                                    key={food.id || i}
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    onClick={openLoggedFoodCalc}
                                                    whileTap={{ scale: isFoodLogEditMode ? 1 : 0.98 }}
                                                    className="flex justify-between items-center gap-3 px-4 py-3 transition-colors bg-transparent relative cursor-pointer select-none"
                                                    style={{ borderBottom: i < Math.min(todayMeals.length, 5) - 1 ? '1px solid rgba(22,20,21,0.08)' : 'none' }}
                                                >
                                                    {/* 左側：Icon、名稱與營養素 */}
                                                    <div className="flex-1 min-w-0 flex items-center gap-2.5">
                                                        <div className="w-8 h-8 flex items-center justify-center shrink-0">
                                                            {food.image ? (
                                                                <img loading="lazy" decoding="async" src={food.image} className="w-full h-full object-cover rounded-lg" alt="" />
                                                            ) : (
                                                                <span className="text-[26px] drop-shadow-sm leading-none">{displayEmoji}</span>
                                                            )}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center justify-between gap-2 mb-0.5">
                                                                <div className="flex items-center gap-1 min-w-0">
                                                                    <h4 className="font-bold text-[#161415] text-xs truncate leading-none">{cleanName}</h4>
                                                                    {!!food.is_tfda && (
                                                                        <span className="text-[9px] font-black border border-[#161415]/15 text-[#161415]/40 px-1 py-0.5 rounded-sm whitespace-nowrap uppercase shrink-0">TFDA</span>
                                                                    )}
                                                                </div>
                                                                {/* 卡路里固定靠右 */}
                                                                <span className="text-[16px] font-light tabular-nums text-[#161415] shrink-0" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
                                                                    {displayCals} <span className="text-[9px] font-bold opacity-40 uppercase" style={{ fontFamily: 'var(--font-body)' }}>kcal</span>
                                                                </span>
                                                            </div>
                                                            {/* 營養素小標籤 */}
                                                            <p className="mt-1 text-[11px] font-bold tabular-nums" style={{ color: 'rgba(22,20,21,0.45)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>
                                                                P {food.protein} · C {food.carbs} · F {food.fats}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* 右側：編輯與刪除按鈕 (透過狀態與動畫控制顯示) */}
                                                    <AnimatePresence>
                                                        {isFoodLogEditMode && (
                                                            <motion.div
                                                                initial={{ opacity: 0, width: 0, scale: 0.8 }}
                                                                animate={{ opacity: 1, width: 'auto', scale: 1 }}
                                                                exit={{ opacity: 0, width: 0, scale: 0.8 }}
                                                                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                                                className="flex items-center gap-1.5 shrink-0 overflow-hidden ml-2"
                                                            >
                                                                <motion.button {...pressProps('icon')}
 onClick={(e) => { e.stopPropagation(); triggerHaptic('light'); handleEditMeal(food); }}
 className="w-8 h-8 rounded-full bg-white/50 flex items-center justify-center text-[#161415]/60 shadow-sm"
 aria-label="編輯餐點"
 >
                                                                    <Edit2 size={13} strokeWidth={2.5} />
                                                                </motion.button>
                                                                <motion.button {...pressProps('icon')}
 onClick={(e) => { e.stopPropagation(); triggerHaptic('medium'); handleDeleteMeal(food.id); }}
 className="w-8 h-8 rounded-full bg-[#F95C4B]/10 flex items-center justify-center text-[#F95C4B] border border-[#F95C4B]/20"
 aria-label="刪除餐點"
 >
                                                                    <Trash2 size={13} strokeWidth={2.5} />
                                                                </motion.button>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </motion.div>
                                            );
                                        })}

                                        {/* 底部 CTA — 搜尋（主要）與自訂（次要） */}
                                        <div className="p-3 pt-2 flex flex-col gap-2" style={{ borderTop: '1px solid rgba(22,20,21,0.08)' }}>
                                            {/* Primary: Search Food */}
                                            <motion.button {...pressProps('row')}
                                                onClick={() => { triggerHaptic('medium'); setIsQuickAddMode(false); setShowSmartSearch(true); }}
                                                className="w-full flex items-center justify-center gap-2.5 py-4 rounded-[18px] font-black text-[9px] uppercase tracking-[0.22em] transition-all shadow-sm"
                                                style={{
                                                    background: '#161415',
                                                    color: '#F6F4F1',
                                                }}
                                            >
                                                <Search size={14} strokeWidth={2.5} />
                                                <span>搜尋食物資料庫</span>
                                            </motion.button>

                                            {/* Secondary: Custom Manual Entry */}
                                            <motion.button {...pressProps('row')}
                                                onClick={() => { triggerHaptic('light'); setEditingMeal(null); setNewMeal({ name: '', emoji: '🍽️', calories: '', protein: '', carbs: '', fats: '', fiber: '', water: '', vegetables: '' }); setShowAddForm(true); }}
                                                className="w-full flex items-center justify-center gap-2 py-3 rounded-[18px] font-black text-[9px] uppercase tracking-[0.22em] transition-all"
                                                style={{
                                                    background: 'rgba(22,20,21,0.05)',
                                                    color: 'rgba(22,20,21,0.55)',
                                                    border: '1px solid rgba(22,20,21,0.08)',
                                                }}
                                            >
                                                <Plus size={13} strokeWidth={2.5} />
                                                <span>手動自訂輸入</span>
                                            </motion.button>
                                        </div>
                                    </div>
                                </div>

                                {/* ❌ 已移除：DailyScoreCard（今日總評 S/A/B/C + 四條進度條）
                                    同一個捲動畫面的最上方，Hero 卡已經用大弧＋營養素環回答了
                                    「今天吃得如何」；這張卡把一模一樣的熱量／蛋白質／纖維／水分
                                    再畫一次成進度條，只是換個形狀講同一件事。
                                    一個數據只在一個地方出現 —— 留 Hero，砍這張。 */}
                            </RevealCard>

                        </motion.div>


                    ) : activeTab === 'history' ? (
                        <motion.div
                            key="history"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-4 px-1"
                        >
                            {/* 🟢 過濾掉完全沒紀錄的「空殼日」卡牌。
                               原因：後端 /api/nutrition/sql/history 會回傳區間內每一天（即使 meal_count=0），
                               所以清除帳號後仍會出現一排 0 值卡牌。
                               真實有紀錄的判定：meal_count > 0 OR 任一營養素 > 0 OR 喝水 > 0 */}
                            {(() => {
                                const nonEmpty = (history || []).filter(d => (
                                    (d.meal_count || 0) > 0 ||
                                    (d.calories || 0) > 0 ||
                                    (d.protein || 0) > 0 ||
                                    (d.carbs || 0) > 0 ||
                                    (d.fats || 0) > 0 ||
                                    (d.fiber || 0) > 0 ||
                                    (d.water || 0) > 0
                                ));
                                if (nonEmpty.length === 0) {
                                    return (
                                        <div className="text-center py-20">
                                            <History size={40} className="mx-auto mb-4" style={{ color: 'rgba(22,20,21,0.18)' }} />
                                            <p className="text-sm font-black" style={{ color: 'rgba(22,20,21,0.38)' }}>還沒有飲食紀錄</p>
                                            <p className="text-xs mt-1.5" style={{ color: 'rgba(22,20,21,0.30)' }}>記錄過的日子會整理成一天一張，往回看得到。</p>
                                        </div>
                                    );
                                }
                                return nonEmpty.sort((a, b) => new Date(b.date) - new Date(a.date)).map((dayData) => {
                                    const dateObj = new Date(dayData.date);
                                    const dayStr = dateObj.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
                                    const weekday = dateObj.toLocaleDateString('en-US', { weekday: 'short' });

                                    const calories = Math.round(dayData.calories || 0);
                                    const protein = parseFloat(dayData.protein || 0).toFixed(1);
                                    const carbs = parseFloat(dayData.carbs || 0).toFixed(1);
                                    const fats = parseFloat(dayData.fats || 0).toFixed(1);
                                    const fiber = parseFloat(dayData.fiber || 0).toFixed(1);
                                    const water = dayData.water || 0;

                                    return (
                                        <motion.div
                                            key={dayData.date}
                                            className="rounded-[28px] overflow-hidden relative mb-4"
                                            style={{
                                                backgroundImage: "url('/desktop/11.jpeg')",
                                                backgroundSize: 'cover',
                                                backgroundPosition: 'center',
                                                boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
                                                border: '1px solid rgba(255,255,255,0.1)'
                                            }}
                                        >
                                            {/* Dark overlay for legibility */}
                                            <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/40 to-transparent z-0" />

                                            {/* 瑞士雜誌排版頭部 */}
                                            <div className="px-6 pt-6 pb-4 flex justify-between items-end relative z-10">
                                                <div>
                                                    <div className="text-[9px] font-black uppercase tracking-[0.3em] text-white/60 mb-1">{weekday}</div>
                                                    <h3 className="text-3xl font-black tracking-tighter text-white leading-none drop-shadow-md">{dayStr.replace('/', '.')}</h3>
                                                </div>
                                                <div className="text-right flex flex-col items-end">
                                                    <div className="text-[11px] font-black tracking-[0.06em] text-white/55 mb-1">當日攝取</div>
                                                    <div className="flex items-baseline gap-1">
                                                        <span className="text-2xl font-black text-white tabular-nums tracking-tighter drop-shadow-md">{calories}</span>
                                                        <span className="text-[11px] font-bold text-white/60">KCAL</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="px-6 pb-5 relative z-10">
                                                {/* 精品網格 */}
                                                <div className="grid grid-cols-5 gap-1 py-4 border-y border-white/10">
                                                    {/* 同一列不要中英夾雜（原本是 PRO / CARB / 脂肪 / 膳食纖維 / H2O），
                                                        而且每個數字都要帶單位 —— 只寫「23.5」看不出是公克還是公升。 */}
                                                    {[
                                                        { label: '蛋白質', val: protein, unit: 'g' },
                                                        { label: '碳水', val: carbs, unit: 'g' },
                                                        { label: '脂肪', val: fats, unit: 'g' },
                                                        { label: '纖維', val: fiber, unit: 'g' },
                                                        { label: '水分', val: (water / 1000).toFixed(1), unit: 'L' }
                                                    ].map((m, idx) => (
                                                        /* 字級拉到 11px 下限後，label 與 value 若同大小就沒有層級了。
                                                           數值升到 15px 當主角、標籤留在 11px 當支撐；
                                                           中文標籤不再加 letter-spacing（中文拉字距只會變散）。 */
                                                        <div key={idx} className="flex flex-col items-center justify-center">
                                                            <span className="text-[11px] font-medium opacity-55 text-white mb-1">{m.label}</span>
                                                            <span className="text-[15px] font-bold text-white drop-shadow-sm tabular-nums leading-none">
                                                                {m.val}<span className="text-[11px] font-medium opacity-60 ml-0.5">{m.unit}</span>
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* 展開詳情按鈕 */}
                                                <motion.button {...pressProps('pill')}
 onClick={() => fetchDetailedMeals(dayData.date)}
 disabled={!!loadingDates[dayData.date]}
 className="w-full mt-4 py-3 rounded-[18px] bg-black/30 border border-white/20 flex items-center justify-center gap-2 text-[12px] font-black tracking-[0.2em] text-white hover:bg-black/40 shadow-sm backdrop-blur-md disabled:opacity-60"
 >
                                                    {loadingDates[dayData.date]
                                                        ? '載入中…'
                                                        : expandedDates[dayData.date] ? '收合餐點' : '看這天吃了什麼'}
                                                    {!loadingDates[dayData.date] && (expandedDates[dayData.date]
                                                        ? <ChevronUp size={12} strokeWidth={3} />
                                                        : <ChevronDown size={12} strokeWidth={3} />)}
                                                </motion.button>

                                                <AnimatePresence>
                                                    {expandedDates[dayData.date] && detailedMeals[dayData.date] && (
                                                        <motion.div
                                                            initial={{ height: 0, opacity: 0 }}
                                                            animate={{ height: 'auto', opacity: 1 }}
                                                            exit={{ height: 0, opacity: 0 }}
                                                            className="mt-3 overflow-hidden bg-[#FDFCFB] rounded-[18px] border border-black/5 shadow-inner p-2 space-y-1"
                                                        >
                                                            {detailedMeals[dayData.date].map((meal, mIdx) => {
                                                                const displayCals = meal.calories > 0 ? meal.calories : Math.round((meal.protein || 0) * 4 + (meal.carbs || 0) * 4 + (meal.fats || 0) * 9);
                                                                return (
                                                                    <div key={mIdx} className="group flex justify-between items-center p-3 rounded-[18px] border border-black/[0.03] bg-white/70 hover:bg-white transition-all shadow-sm relative">
                                                                        <div className="flex items-center gap-3 min-w-0">
                                                                            <div className="w-10 h-10 rounded-[12px] bg-[#F6F4F1] flex items-center justify-center text-lg shadow-inner border border-black/5">
                                                                                <FoodIcon icons={foodIcons} food={meal} fallback={meal.name.includes('水') ? '💧' : '🍽️'} size={20} />
                                                                            </div>
                                                                            <div className="min-w-0">
                                                                                <p className="text-sm font-black text-[#161415] truncate tracking-tight">{meal.name.replace(/\s*[0\.]+\s*$/, '').trim()}</p>
                                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                                    <span className="text-[11px] font-black text-[#161415]/50 tabular-nums">{displayCals} kcal</span>
                                                                                    <div className="flex gap-1">
                                                                                        {/* 後端回的是浮點數，直接印會出現「P 23.456」 */}
                                                                                        <span className="text-[11px] font-bold text-[#161415]/40 bg-[#161415]/5 px-1.5 py-0.5 rounded-md tabular-nums">蛋白 {Math.round(meal.protein || 0)}g</span>
                                                                                        <span className="text-[11px] font-bold text-[#161415]/40 bg-[#161415]/5 px-1.5 py-0.5 rounded-md tabular-nums">碳水 {Math.round(meal.carbs || 0)}g</span>
                                                                                        <span className="text-[11px] font-bold text-[#161415]/40 bg-[#161415]/5 px-1.5 py-0.5 rounded-md tabular-nums">脂肪 {Math.round(meal.fats || 0)}g</span>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-1.5 shrink-0 ml-3">
                                                                            <motion.button {...pressProps('icon')}
 onClick={() => handleEditMeal(meal)}
 className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center text-[#161415]/50 hover:bg-[#161415] hover:text-white"
 >
                                                                                <Edit2 size={12} strokeWidth={2.5} />
                                                                            </motion.button>
                                                                            <motion.button {...pressProps('icon')}
 onClick={() => handleDeleteMeal(meal.id)}
 className="w-8 h-8 rounded-full bg-[#F95C4B]/10 flex items-center justify-center text-[#F95C4B]/80 hover:bg-[#F95C4B] hover:text-white border border-[#F95C4B]/20"
 >
                                                                                <Trash2 size={12} strokeWidth={2.5} />
                                                                            </motion.button>
                                                                        </div>
                                                                    </div>
                                                                )
                                                            })}
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        </motion.div>
                                    );
                                });
                            })()}
                        </motion.div>
                    ) : (
                        <motion.div
                            key="analysis"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                        >
                            {/* 分析說明按鈕（右上角） */}
                            <div className="flex justify-end mb-3">
                                <motion.button {...pressProps('pill')}
 onClick={() => setShowExplanation(true)}
 className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold "
 style={{ background: 'rgba(22,20,21,0.06)', color: 'rgba(22,20,21,0.45)', border: '1px solid rgba(22,20,21,0.10)' }}
 >
                                    <Info size={12} /> 圖表說明
                                </motion.button>
                            </div>

                            {!analysisFetched ? (
                                // Still loading analysis data
                                <div className="text-center py-20">
                                    <div className="w-8 h-8 border-2 border-[#F95C4B] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                                    <p className="text-sm font-bold" style={{ color: 'rgba(22,20,21,0.40)' }}>載入分析數據中…</p>
                                </div>
                            ) : (analysisHistory.length < 1 && !activePlan) ? (
                                // No logged days at all
                                <div className="text-center py-20">
                                    <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(22,20,21,0.04)' }}>
                                        <BarChart2 size={24} style={{ color: 'rgba(22,20,21,0.20)' }} />
                                    </div>
                                    <h3 className="text-lg font-black mb-2" style={{ color: 'rgba(22,20,21,0.35)' }}>數據收集中</h3>
                                    <p className="text-sm max-w-[260px] mx-auto" style={{ color: 'rgba(22,20,21,0.30)' }}>
                                        開始記錄飲食後即可看到深度分析圖表。
                                    </p>
                                </div>
                            ) : (
                                <NutritionAnalysis
                                    nutritionHistory={analysisHistory}
                                    trainingHistory={trainingHistory}
                                    targets={GOALS}
                                    meals={todayMeals}
                                    userId={userId}
                                    profile={userProfile || {}}
                                    activePlan={activePlan}
                                    showTdee={chartVis.visible('nutritionTdee')}
                                    showMealTiming={chartVis.visible('nutritionMealTiming')}
                                    locked={chartVis.locked('營養')}
                                />
                            )}
                        </motion.div>
                    )}
                </AnimatePresence >

                {/* Add Meal Form Modal (Custom Log) */}
                <AnimatePresence>
                    {showAddForm && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                            onClick={() => { setShowAddForm(false); setEditingMeal(null); }}
                        >
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                                className="rounded-[28px] p-6 w-full max-w-sm max-h-[90dvh] overflow-y-auto no-scrollbar relative"
                                style={{
                                    fontFamily: '"Tenor Sans", sans-serif',
                                    background: 'rgba(228, 222, 210, 0.85)', // Stone
                                    backdropFilter: 'blur(30px) saturate(1.5)',
                                    WebkitBackdropFilter: 'blur(30px) saturate(1.5)',
                                    borderTop: '1px solid rgba(255, 255, 255, 0.8)',
                                    borderLeft: '1px solid rgba(255, 255, 255, 0.5)',
                                    borderRight: '1px solid rgba(255, 255, 255, 0.2)',
                                    borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
                                    boxShadow: '0 24px 80px rgba(0, 0, 0, 0.15), inset 0 2px 4px rgba(255, 255, 255, 0.6)',
                                }}
                                onClick={e => e.stopPropagation()}
                            >
                                <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/30">
                                    <h3 className="text-xl font-bold tracking-tight text-[#161415]" style={{ fontFamily: '"Tenor Sans", sans-serif' }}>
                                        {editingMeal ? '修改這一筆' : '手動輸入'}
                                    </h3>
                                    <motion.button {...pressProps('icon')} onClick={() => { setShowAddForm(false); setEditingMeal(null); }} className="p-2 rounded-full text-[#161415]/40 hover:bg-[#161415]/5 hover:text-[#161415] transition-all">
                                        <X size={18} strokeWidth={2.5} />
                                    </motion.button>
                                </div>

                                <form onSubmit={(e) => { e.preventDefault(); editingMeal ? handleSaveMeal() : handleAddMeal(); }} className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="file"
                                            ref={customMealPhotoInputRef}
                                            onChange={handleCustomMealPhotoUpload}
                                            accept="image/*"
                                            className="hidden"
                                        />
                                        <div
                                            onClick={() => customMealPhotoInputRef.current?.click()}
                                            style={GLASS_INPUT}
                                            className="relative shrink-0 w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden cursor-pointer active:scale-95 transition-all group"
                                        >
                                            {newMeal.image ? (
                                                <img loading="lazy" decoding="async" src={newMeal.image} className="w-full h-full object-cover" alt="" />
                                            ) : (
                                                <span className="text-3xl">{newMeal.emoji || '🍽️'}</span>
                                            )}
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                                                <Camera size={14} />
                                            </div>
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <label className="block text-xs font-bold opacity-40 mb-1">食物名稱</label>
                                            <input
                                                type="text"
                                                value={newMeal.name}
                                                onChange={(e) => setNewMeal({ ...newMeal, name: e.target.value })}
                                                placeholder="例如：烤雞胸"
                                                autoFocus
                                                style={GLASS_INPUT}
                                                className="w-full rounded-xl px-4 py-3 font-bold transition-all outline-none placeholder:text-[#161415]/30"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="flex gap-2 items-center justify-start text-[11px] font-bold">
                                        <motion.button {...pressProps('pill')}
 type="button"
 onClick={() => customMealPhotoInputRef.current?.click()}
 style={GLASS_INPUT}
 className="px-3 py-1.5 rounded-lg text-[#161415]/70 flex items-center gap-1"
 >
                                            <Camera size={10} /> {newMeal.image ? '換照片' : '上傳照片'}
                                        </motion.button>
                                        {newMeal.image && (
                                            <motion.button {...pressProps('pill')}
 type="button"
 onClick={() => {
 triggerHaptic('medium');
 setNewMeal({ ...newMeal, image: null });
 }}
 className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20"
 >
                                                移除照片 (用表情)
                                            </motion.button>
                                        )}
                                        {/* 表情改成直接點 —— 以前是一個要自己叫出表情鍵盤打字的小框 */}
                                        {!newMeal.image && ['🍱', '🍗', '🥗', '🍜', '🥤', '🍞'].map((e) => (
                                            <motion.button {...pressProps('pill')} key={e} type="button"
                                                onClick={() => { triggerHaptic('light'); setNewMeal({ ...newMeal, emoji: e }); }}
                                                className="w-8 h-8 rounded-lg text-base leading-none flex items-center justify-center"
                                                style={newMeal.emoji === e
                                                    ? { background: 'rgba(22,20,21,0.10)', border: '1px solid rgba(22,20,21,0.22)' }
                                                    : { background: 'transparent', border: '1px solid transparent' }}
                                            >{e}</motion.button>
                                        ))}
                                    </div>

                                    {/* 營養素先填、熱量自己算 —— 大部分人知道其中一邊就好 */}
                                    <div className="grid grid-cols-3 gap-3 mt-4">
                                        <div>
                                            <label className="block text-xs font-bold opacity-40 mb-1">蛋白質 g</label>
                                            <input type="number" inputMode="decimal" min="0" max="2000" placeholder="0" step="0.1" value={newMeal.protein} onChange={e => setNewMeal({ ...newMeal, protein: e.target.value })} style={{ ...GLASS_INPUT, background: 'rgba(249,92,75,0.12)' }} className="w-full text-[#F95C4B] rounded-xl px-3 py-2 outline-none font-bold text-center tabular-nums" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold opacity-40 mb-1">碳水 g</label>
                                            <input type="number" inputMode="decimal" min="0" max="2000" placeholder="0" step="0.1" value={newMeal.carbs} onChange={e => setNewMeal({ ...newMeal, carbs: e.target.value })} style={{ ...GLASS_INPUT, background: 'rgba(59,130,246,0.12)' }} className="w-full text-blue-600 rounded-xl px-3 py-2 outline-none font-bold text-center tabular-nums" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold opacity-40 mb-1">脂肪 g</label>
                                            <input type="number" inputMode="decimal" min="0" max="2000" placeholder="0" step="0.1" value={newMeal.fats} onChange={e => setNewMeal({ ...newMeal, fats: e.target.value })} style={{ ...GLASS_INPUT, background: 'rgba(234,179,8,0.14)' }} className="w-full text-yellow-600 rounded-xl px-3 py-2 outline-none font-bold text-center tabular-nums" />
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex items-baseline justify-between mb-1">
                                            <label className="text-xs font-bold opacity-40">熱量 大卡</label>
                                            {!kcalEdited && kcalFromMacros != null && (
                                                <span className="text-[10.5px] font-bold" style={{ color: 'rgba(22,20,21,0.38)' }}>
                                                    由上面自動算的，可以直接改
                                                </span>
                                            )}
                                        </div>
                                        <input type="number" inputMode="numeric" min="0" max="10000" placeholder="0"
                                            value={newMeal.calories}
                                            onChange={e => { setKcalEdited(true); setNewMeal({ ...newMeal, calories: e.target.value }); }}
                                            required style={GLASS_INPUT}
                                            className="w-full rounded-xl px-4 py-3 font-black text-2xl outline-none tabular-nums" />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold opacity-40 mb-1">同時記水分 ml（可略）</label>
                                        <input type="number" inputMode="numeric" min="0" max="5000" placeholder="0" value={newMeal.water} onChange={e => setNewMeal({ ...newMeal, water: e.target.value })} style={GLASS_INPUT} className="w-full rounded-xl px-4 py-2.5 font-bold text-base text-blue-600 outline-none tabular-nums" />
                                    </div>



                                    <motion.button {...pressProps('pill')}
 type="button"
 onClick={() => setShowPortionGuide(true)}
 style={GLASS_INPUT}
 className="w-full mt-4 py-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-[#161415]/70"
 >
                                        <Info size={14} /> 視覺份量估算指南
                                    </motion.button>

                                    <div className="flex gap-3 mt-6">
                                        <motion.button {...pressProps('pill')} type="button" onClick={() => { setShowAddForm(false); setEditingMeal(null); }} style={GLASS_INPUT} className="flex-1 py-3.5 rounded-xl font-bold text-[#161415]/60">取消</motion.button>
                                        <motion.button {...pressProps('pill')}
 type="submit"
 disabled={!newMeal.name || !newMeal.calories}
 style={{ boxShadow: '0 8px 24px rgba(22,20,21,0.25), inset 0 1px 1px rgba(255,255,255,0.15)' }}
 className="flex-[2] py-3.5 rounded-xl font-bold bg-[#161415] text-white disabled:opacity-30 disabled:bg-[#161415]/20 disabled:text-[#161415]/40"
 >
                                            {editingMeal ? '儲存修改' : '加入紀錄'}
                                        </motion.button>
                                    </div>
                                </form>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Challenge Modal */}
                {showChallengeCelebration && completedChallenge && (
                    <ChallengeCompletionModal challenge={completedChallenge} onClose={() => setShowChallengeCelebration(false)} isDarkMode={true} />
                )}
            </div>

            {/* [NEW] Smart Search Overlay */}
            <AnimatePresence>
                {showSmartSearch && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-transparent flex items-center justify-center p-4"
                        onClick={(e) => {
                            if (isDraggingRef.current) return;
                            if (e.target === e.currentTarget) {
                                setShowSmartSearch(false);
                                setIsQuickAddMode(false);
                            }
                        }}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            onClick={e => e.stopPropagation()}
                            className={`w-full max-w-sm ${isQuickAddMode ? 'h-auto' : 'h-[85dvh]'} ${isQuickAddMode ? 'bg-transparent shadow-none border-none' : ''} flex flex-col overflow-hidden relative`}
                            style={!isQuickAddMode ? {
                                background: isComboMode ? 'rgba(217, 64, 48, 0.15)' : 'rgba(207, 198, 184, 0.65)',
                                backdropFilter: 'blur(40px) saturate(2.0)',
                                WebkitBackdropFilter: 'blur(40px) saturate(2.0)',
                                borderTop: '1px solid rgba(255, 255, 255, 0.8)',
                                borderLeft: '1px solid rgba(255, 255, 255, 0.5)',
                                borderRight: '1px solid rgba(255, 255, 255, 0.2)',
                                borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
                                boxShadow: '0 24px 80px rgba(0, 0, 0, 0.15), inset 0 2px 4px rgba(255, 255, 255, 0.6)',
                                borderRadius: '28px'
                            } : {}}
                        >
                            {/* Header - Hidden in Quick Add Mode */}
                            {!isQuickAddMode && (
                                <div className="px-6 py-6 flex flex-col gap-4 relative z-20">
                                    <div className="flex items-center gap-3">
                                        <motion.button {...pressProps('pill')}
 onClick={() => setShowSmartSearch(false)}
 className="p-2.5 rounded-full text-[#161415]"
 style={{
 background: 'rgba(255, 255, 255, 0.45)',
 border: '1px solid rgba(255, 255, 255, 0.6)',
 boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.8), 0 4px 12px rgba(0,0,0,0.05)',
 }}
 >
                                            <ChevronDown size={20} strokeWidth={2.5} />
                                        </motion.button>
                                        <div className="flex-1 relative">
                                            <input
                                                type="text"
                                                placeholder="搜尋食物（例如：雞肉、白飯）..."
                                                aria-label="搜尋食物"
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                style={{ fontFamily: '"Tenor Sans", sans-serif', background: 'rgba(255, 255, 255, 0.45)', border: '1px solid rgba(255, 255, 255, 0.6)', boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.8), 0 4px 12px rgba(0,0,0,0.05)' }}
                                                className="w-full text-[#161415] rounded-[24px] py-3.5 pl-11 pr-4 focus:outline-none focus:border-[#161415]/60 focus:ring-1 focus:ring-[#161415]/60 text-xs font-bold placeholder:text-[#161415]/60 transition-all"
                                            />
                                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#161415]/40">
                                                <Utensils size={16} strokeWidth={2} />
                                            </div>
                                            {isSearching && (
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                                    <Loader2 size={18} className="text-[#F95C4B] animate-spin" />
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* 記一樣／自由配：兩個並排的選項，現在在哪一個一眼看得出來。
                                        ⚠️ 以前是一行「單品記錄」＋一顆「⚡ 自由配/組合餐點」按鈕 —— 按鈕上寫的是
                                           「要切去的模式」，標籤寫的是「現在的模式」，兩個字串互換，使用者分不出現在是哪個。 */}
                                    <div className="flex gap-1 p-1.5 rounded-[28px]" style={{ background: 'rgba(255, 255, 255, 0.35)', border: '1px solid rgba(255, 255, 255, 0.5)', boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.6), 0 4px 12px rgba(0,0,0,0.05)' }}>
                                        {[{ id: false, label: '記一樣' }, { id: true, label: '自由配' }].map(opt => {
                                            const on = isComboMode === opt.id;
                                            return (
                                                <motion.button key={opt.label} {...pressProps('pill')}
                                                    onClick={() => {
                                                        if (on) return;
                                                        triggerHaptic('light');
                                                        setIsComboMode(opt.id);
                                                        if (!opt.id) setComboCart([]);
                                                    }}
                                                    aria-pressed={on}
                                                    className="flex-1 min-h-[44px] rounded-[24px] text-[14px] font-bold transition-all"
                                                    style={on
                                                        ? { background: '#161415', color: '#F6F4F1', boxShadow: '0 4px 12px rgba(22,20,21,0.18)' }
                                                        : { background: 'transparent', color: 'rgba(22,20,21,0.55)' }}
                                                >
                                                    {opt.label}
                                                </motion.button>
                                            );
                                        })}
                                    </div>
                                    {/* 自由配、還沒選：一行告訴他下一步做什麼 */}
                                    {isComboMode && comboCart.length === 0 && (
                                        <p className="text-[12px] font-semibold text-center" style={{ color: 'rgba(22,20,21,0.55)' }}>
                                            點食物加進這一餐，可以選好幾樣
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Content */}
                            <div className="flex-1 overflow-y-auto no-scrollbar px-6 py-5 pb-[120px]">
                                {/* Search Results */}
                                <div className="space-y-4">
                                    {/* 從「新增」進來、還沒打字：自己建一個放最上面 */}
                                    {!isComboMode && !isSearching && searchQuery.trim().length === 0 && (
                                        <motion.button {...pressProps('row')} type="button"
                                            onClick={() => { triggerHaptic('light'); openCreateFood(searchQuery); }}
                                            className="w-full flex items-center gap-3 text-left mb-5"
                                            style={{ minHeight: 60, padding: '0 16px 0 10px', borderRadius: 24, border: 'none', background: 'rgba(232,233,230,0.85)', color: '#161415' }}>
                                            <span style={{ width: 40, height: 40, borderRadius: 999, background: '#F6F4F1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 1px 2px rgba(32,32,32,0.04)' }}>
                                                <Plus size={18} strokeWidth={2.2} />
                                            </span>
                                            <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700 }}>自己建一個食物</span>
                                            <ChevronRight size={18} style={{ flexShrink: 0, opacity: 0.4 }} />
                                        </motion.button>
                                    )}
                                    {/* ⭐ STARRED SECTION */}
                                    {searchQuery.trim().length === 0 && starredFoods.length > 0 && (
                                        <div className="mb-6">
                                            {/* 🔥 極簡柔順幾何分類 Tabs (鈦銀底盤) */}
                                            <div className="flex gap-1 p-1.5 rounded-[28px] mb-5 w-full" style={{ background: 'rgba(255, 255, 255, 0.35)', border: '1px solid rgba(255, 255, 255, 0.5)', boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.6), 0 4px 12px rgba(0,0,0,0.05)' }}>
                                                {[
                                                    { id: 'all', label: '全部' },
                                                    { id: 'breakfast', label: '早' },
                                                    { id: 'lunch', label: '午' },
                                                    { id: 'dinner', label: '晚' },
                                                    { id: 'snacks', label: '甜點' }
                                                ].map(cat => (
                                                    <motion.button {...pressProps('cta')}
                                                        key={cat.id}
                                                        onClick={() => setActiveCategoryFilter(cat.id)}
                                                        style={{
                                                            fontFamily: '"Tenor Sans", sans-serif',
                                                            ...(activeCategoryFilter === cat.id
                                                                ? { background: 'rgba(255, 255, 255, 0.7)', border: '1px solid rgba(255, 255, 255, 0.9)', boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.9), 0 4px 12px rgba(0,0,0,0.1)', color: '#161415' }
                                                                : { background: 'transparent', color: 'rgba(22, 20, 21, 0.4)' })
                                                        }}
                                                        className={`flex-1 py-2.5 rounded-[24px] text-xs font-black tracking-wider transition-all text-center flex items-center justify-center`}
                                                    >
                                                        {cat.label}
                                                    </motion.button>
                                                ))}
                                            </div>

                                            {/* 過濾並顯示收藏項目 */}
                                            {starredFoods
                                                .filter(f => activeCategoryFilter === 'all' || f.category === activeCategoryFilter)
                                                .map((food, si) => {
                                                    const cleanName = food.name.replace(/\s*[0\.]+\s*$/, '').trim();
                                                    const isInCart = comboCart.some(c => c.food.name === food.name);
                                                    return (
                                                        <div key={food.name + si} className="relative mb-3.5 overflow-hidden rounded-[24px] shadow-[0_4px_20px_rgba(22,20,21,0.05)] border border-[#CFC6B8]/70">
                                                            {/* 上層可滑動卡片 - 極簡流暢圓角版 */}
                                                            <motion.div
                                                                onClick={() => handleFoodClick(food)}
                                                                className={`p-4 rounded-[24px] flex justify-between items-center transition-all cursor-pointer relative z-10 ${isInCart
                                                                    ? 'text-[#161415] scale-[0.99]'
                                                                    : 'text-[#161415]'
                                                                    }`}
                                                                style={isInCart ? {
                                                                    background: 'linear-gradient(135deg, rgba(249,92,75,0.18) 0%, rgba(255,255,255,0.78) 70%)',
                                                                    border: '1.5px solid rgba(249,92,75,0.6)',
                                                                    boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.9), 0 8px 24px rgba(0,0,0,0.1)'
                                                                } : {
                                                                    background: 'rgba(255, 255, 255, 0.45)',
                                                                    borderTop: '1px solid rgba(255, 255, 255, 0.9)',
                                                                    borderLeft: '1px solid rgba(255, 255, 255, 0.6)',
                                                                    borderRight: '1px solid rgba(255, 255, 255, 0.3)',
                                                                    borderBottom: '1px solid rgba(255, 255, 255, 0.3)',
                                                                    boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.6), 0 8px 24px rgba(0,0,0,0.06)'
                                                                }}
                                                            >
                                                                <div className="flex items-center gap-3.5 flex-1 min-w-0 pr-2">
                                                                    {/* 左側：精緻圓滑圖片與 Badge */}
                                                                    <span className={`text-2xl flex-shrink-0 relative w-12 h-12 flex items-center justify-center rounded-[18px]`}>
                                                                        <FoodIcon icons={foodIcons} food={food} size={26} style={{ borderRadius: 14 }} />
                                                                        {isInCart && (
                                                                            <span className="absolute -top-1.5 -right-1.5 bg-[#F95C4B] text-white text-[11px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-md z-20">✓</span>
                                                                        )}
                                                                    </span>

                                                                    {/* 中間：文字資訊 */}
                                                                    <div className="min-w-0 flex-1 pr-2">
                                                                        <p className={`font-bold text-base truncate tracking-tight text-[#161415]`} style={{ fontFamily: '"Tenor Sans", sans-serif' }}>{cleanName}</p>
                                                                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                                            <p className={`text-[11px] font-black tabular-nums text-[#161415]/70`} style={{ fontFamily: '"Tenor Sans", sans-serif' }}>{food.is_dish ? `${food.calories} kcal／100 g` : `${food.calories} kcal／100 g`}</p>
                                                                            <div className="flex gap-1.5">
                                                                                {/* 柔順膠囊小圓角 */}
                                                                                <span className={`px-2 py-0.5 rounded-[6px] text-[11px] font-black tracking-wider border bg-[#D94030]/15 text-[#D94030] border-[#D94030]/30 shadow-2xs`} style={{ fontFamily: '"Tenor Sans", sans-serif' }}>P:{food.protein}</span>
                                                                                <span className={`px-2 py-0.5 rounded-[6px] text-[11px] font-black tracking-wider border bg-[#F59E0B]/15 text-[#D97706] border-[#F59E0B]/30 shadow-2xs`} style={{ fontFamily: '"Tenor Sans", sans-serif' }}>C:{food.carbs}</span>
                                                                                <span className={`px-2 py-0.5 rounded-[6px] text-[11px] font-black tracking-wider border bg-[#161415]/10 text-[#161415] border-[#161415]/20 shadow-2xs`} style={{ fontFamily: '"Tenor Sans", sans-serif' }}>F:{food.fats}</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* 右側：🌟 無外框裸裝鈦金屬黃星星 (Anodized Titanium Gold Star) */}
                                                                <motion.button {...pressProps('icon')}
 onClick={(e) => { e.stopPropagation(); toggleStar(food); }}
 className="p-2 bg-transparent flex-shrink-0 hover:scale-110 flex items-center justify-center text-[#E6B95C]"
 >
                                                                    <Star size={20} fill="#E6B95C" stroke="#C59B3C" strokeWidth={2} className="filter drop-shadow-[0_2px_6px_rgba(230,185,92,0.45)]" />
                                                                </motion.button>
                                                            </motion.div>
                                                        </div>
                                                    );
                                                })
                                            }
                                            {/* 防呆：如果該分類下沒東西 */}
                                            {starredFoods.filter(f => activeCategoryFilter === 'all' || f.category === activeCategoryFilter).length === 0 && (
                                                <p className="text-[11px] text-center font-bold text-[#161415]/40 py-6 border border-dashed border-[#CFC6B8] rounded-[18px]" style={{ fontFamily: '"Tenor Sans", sans-serif' }}>
                                                    此分類無收藏項目
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* RECENT FOODS HEADER & LIST */}
                                    {searchQuery.trim().length === 0 && recentFoods.length > 0 && (
                                        <div className="mb-6">
                                            <div className="flex items-center gap-2 mb-4">
                                                <Clock size={16} className="text-[#161415]/40 shrink-0" strokeWidth={2.5} />
                                                <span className="text-xs font-black text-[#161415]/40 tracking-widest" style={{ fontFamily: '"Tenor Sans", sans-serif' }}>最近吃過</span>
                                            </div>
                                            {recentFoods.slice(0, 10).map((food, ri) => {
                                                const cleanName = food.name.replace(/\s*[0\.]+\s*$/, '').trim();
                                                const isInCart = comboCart.some(c => c.food.name === food.name);
                                                return (
                                                    <div key={food.name + '_recent_' + ri} className="relative mb-3 overflow-hidden rounded-[24px] shadow-[0_4px_20px_rgba(22,20,21,0.05)] border border-[#CFC6B8]/70">
                                                        {/* 上層可滑動卡片 - 結合極致香檳太金屬與選取特效 */}
                                                        <motion.div
                                                            onClick={() => handleFoodClick(food)}
                                                            className={`p-4 rounded-[24px] flex justify-between items-center transition-all cursor-pointer relative z-10 ${isInCart
                                                                ? 'text-[#161415] scale-[0.99]'
                                                                : 'text-[#161415]'
                                                                }`}
                                                            style={isInCart ? {
                                                                background: 'linear-gradient(135deg, rgba(249,92,75,0.18) 0%, rgba(255,255,255,0.78) 70%)',
                                                                border: '1.5px solid rgba(249,92,75,0.6)',
                                                                boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.9), 0 8px 24px rgba(0,0,0,0.1)'
                                                            } : {
                                                                background: 'rgba(255, 255, 255, 0.45)',
                                                                borderTop: '1px solid rgba(255, 255, 255, 0.9)',
                                                                borderLeft: '1px solid rgba(255, 255, 255, 0.6)',
                                                                borderRight: '1px solid rgba(255, 255, 255, 0.3)',
                                                                borderBottom: '1px solid rgba(255, 255, 255, 0.3)',
                                                                boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.6), 0 8px 24px rgba(0,0,0,0.06)'
                                                            }}
                                                        >
                                                            <div className="flex items-center gap-3.5 flex-1 min-w-0 pr-2">
                                                                {/* 左側精緻圓角圖片 */}
                                                                <span className={`text-2xl flex-shrink-0 relative w-12 h-12 flex items-center justify-center rounded-[18px]`}>
                                                                    {food.image ? (
                                                                        <img loading="lazy" decoding="async" src={food.image} className="w-full h-full object-cover rounded-[18px]" alt="" />
                                                                    ) : (
                                                                        food.emoji || '🕒'
                                                                    )}
                                                                    {isInCart && (
                                                                        <span className="absolute -top-1.5 -right-1.5 bg-[#F95C4B] text-white text-[11px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-md z-20">✓</span>
                                                                    )}
                                                                </span>

                                                                <div className="min-w-0 flex-1 pr-2">
                                                                    <p className={`font-bold text-base truncate tracking-tight text-[#161415]`} style={{ fontFamily: '"Tenor Sans", sans-serif' }}>{cleanName}</p>
                                                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                                        <p className={`text-[11px] font-black tabular-nums text-[#161415]/70`} style={{ fontFamily: '"Tenor Sans", sans-serif' }}>{food.is_dish ? `${food.calories} kcal／100 g` : `${food.calories} kcal／100 g`}</p>
                                                                        <div className="flex gap-1.5">
                                                                            <span className={`px-2 py-0.5 rounded-[6px] text-[11px] font-black tracking-wider border bg-[#D94030]/15 text-[#D94030] border-[#D94030]/30 shadow-2xs`} style={{ fontFamily: '"Tenor Sans", sans-serif' }}>P:{food.protein}</span>
                                                                            <span className={`px-2 py-0.5 rounded-[6px] text-[11px] font-black tracking-wider border bg-[#F59E0B]/15 text-[#D97706] border-[#F59E0B]/30 shadow-2xs`} style={{ fontFamily: '"Tenor Sans", sans-serif' }}>C:{food.carbs}</span>
                                                                            <span className={`px-2 py-0.5 rounded-[6px] text-[11px] font-black tracking-wider border bg-[#161415]/10 text-[#161415] border-[#161415]/20 shadow-2xs`} style={{ fontFamily: '"Tenor Sans", sans-serif' }}>F:{food.fats}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </motion.div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {searchQuery.trim().length > 0 && searchResults.length > 0 ? (
                                        // ── 搜尋結果：最佳匹配與展開 UI ──
                                        <div className="space-y-3 pb-8">
                                            {(() => {
                                                const topMatch = searchResults[0];
                                                const otherVariations = searchResults.slice(1);
                                                const { cleanName: topCleanName, tags: topTags } = processFoodName(topMatch.name);
                                                const topSource = getFoodSourceInfo(topMatch);
                                                const isInCart = comboCart.some(c => c.food.name === topMatch.name);

                                                return (
                                                    <>
                                                        {/* 🏆 最佳匹配大卡片 - 流暢極簡圓角版 */}
                                                        <div
                                                            onClick={() => handleFoodClick(topMatch)}
                                                            className={`p-5 rounded-[28px] cursor-pointer active:scale-95 transition-all relative overflow-hidden group ${isInCart
                                                                ? 'text-[#161415] scale-[0.99]'
                                                                : 'text-[#161415]'
                                                                }`}
                                                            style={isInCart ? {
                                                                background: 'linear-gradient(135deg, rgba(249,92,75,0.18) 0%, rgba(255,255,255,0.78) 70%)',
                                                                border: '1.5px solid rgba(249,92,75,0.6)',
                                                                boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.9), 0 8px 24px rgba(0,0,0,0.1)'
                                                            } : {
                                                                background: 'rgba(255, 255, 255, 0.45)',
                                                                borderTop: '1px solid rgba(255, 255, 255, 0.9)',
                                                                borderLeft: '1px solid rgba(255, 255, 255, 0.6)',
                                                                borderRight: '1px solid rgba(255, 255, 255, 0.3)',
                                                                borderBottom: '1px solid rgba(255, 255, 255, 0.3)',
                                                                boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.6), 0 8px 24px rgba(0,0,0,0.06)'
                                                            }}
                                                        >
                                                            {/* 右上角標籤：契合大卡片的流暢倒角 */}
                                                            <span className={`absolute top-0 right-0 text-[12px] font-black px-4 py-2 rounded-bl-[18px] rounded-tr-[28px] tracking-[0.2em] transition-all backdrop-blur-md ${isInCart ? 'bg-[#F95C4B] text-white shadow-lg' : 'bg-[#161415] text-[#F95C4B] border-b border-l border-[#CFC6B8]/50 shadow-md'
                                                                }`} style={{ fontFamily: '"Tenor Sans", sans-serif' }}>
                                                                {isInCart ? '已選取' : '最符合的食物'}
                                                            </span>

                                                            <div className="flex items-center gap-4 mb-5 relative z-10 mt-1">
                                                                <span className={`text-3xl shrink-0 w-14 h-14 flex items-center justify-center rounded-[18px] overflow-hidden ${isInCart ? 'opacity-80' : ''}`}>
                                                                    {topMatch.image ? (
                                                                        <img loading="lazy" decoding="async" src={topMatch.image} className="w-full h-full object-cover" alt="" />
                                                                    ) : (
                                                                        topMatch.emoji || '🎯'
                                                                    )}
                                                                </span>
                                                                <div className="min-w-0 flex-1 pr-4">
                                                                    <h4 className="font-black text-lg leading-tight truncate text-[#161415] drop-shadow-2xs" style={{ fontFamily: '"Tenor Sans", sans-serif' }}>
                                                                        {topCleanName}
                                                                    </h4>
                                                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                                        {topSource.label !== '最近紀錄' && (
                                                                            <span className="flex items-center gap-1 text-[11px] font-bold" style={{ color: topSource.color, fontFamily: '"Tenor Sans", sans-serif' }}>
                                                                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: topSource.color }}></span>
                                                                                {topSource.label}
                                                                            </span>
                                                                        )}
                                                                        {topTags.map((t, i) => (
                                                                            <span key={i} className="text-[11px] font-bold px-2 py-0.5 rounded-[8px] border bg-white/60 text-[#161415]/70 border-[#CFC6B8] shadow-2xs" style={{ fontFamily: '"Tenor Sans", sans-serif' }}>
                                                                                {t.label}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* 營養數據區塊：鈦金屬風格分割線 */}
                                                            <div className={`flex justify-between items-end relative z-10 pt-4 border-t ${isInCart ? 'border-[#F95C4B]/30' : 'border-[#CFC6B8]/60'}`}>
                                                                {/* 餐點顯示「一整份」的熱量；原料顯示每 100 g。
                                                                    不標清楚基準，使用者會把 183 kcal 的白飯當成一碗只有 183。 */}
                                                                <div>
                                                                    <p className="text-[28px] font-black tabular-nums leading-none text-[#F95C4B] drop-shadow-2xs font-mono">
                                                                        {topMatch.is_dish ? topMatch.dish.calories : topMatch.calories} <span className="text-[9px] font-bold uppercase text-[#161415]/60 tracking-wider" style={{ fontFamily: '"Tenor Sans", sans-serif' }}>kcal</span>
                                                                    </p>
                                                                    <p className="text-[12px] font-bold tracking-[0.1em] mt-1 text-[#161415]/40" style={{ fontFamily: '"Tenor Sans", sans-serif' }}>
                                                                        {topMatch.is_dish ? `一份 · 約 ${topMatch.servingGrams} g` : '每 100 g'}
                                                                    </p>
                                                                </div>
                                                                <div className="flex gap-1.5" aria-label="每 100 克的蛋白質、碳水與脂肪">
                                                                    <span className={`px-2.5 py-1 rounded-[8px] text-[11px] font-black tracking-wider border bg-[#D94030]/15 text-[#D94030] border-[#D94030]/30 shadow-xs`} style={{ fontFamily: '"Tenor Sans", sans-serif' }}>P {topMatch.is_dish ? topMatch.dish.protein : topMatch.protein}</span>
                                                                    <span className={`px-2.5 py-1 rounded-[8px] text-[11px] font-black tracking-wider border bg-[#F59E0B]/15 text-[#D97706] border-[#F59E0B]/30 shadow-xs`} style={{ fontFamily: '"Tenor Sans", sans-serif' }}>C {topMatch.is_dish ? topMatch.dish.carbs : topMatch.carbs}</span>
                                                                    <span className={`px-2.5 py-1 rounded-[8px] text-[11px] font-black tracking-wider border bg-[#161415]/10 text-[#161415] border-[#161415]/20 shadow-xs`} style={{ fontFamily: '"Tenor Sans", sans-serif' }}>F {topMatch.is_dish ? topMatch.dish.fats : topMatch.fats}</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* 展開其他變體按鈕：極簡優雅圓角 */}
                                                        {otherVariations.length > 0 && !showAllVariations && (
                                                            <motion.button {...pressProps('pill')}
 onClick={() => setShowAllVariations(true)}
 className="w-full mt-3.5 py-3.5 text-[9px] font-mono font-black uppercase tracking-[0.25em] text-[#161415]/70 bg-gradient-to-b from-[#EAE7E0] to-[#E4DED2] border border-[#CFC6B8] rounded-[24px] hover:border-[#161415]/40 hover:text-[#161415] flex items-center justify-center gap-2 shadow-sm"
 >
                                                                <ChevronDown size={14} strokeWidth={2.5} className="text-[#F95C4B]" /> 查看其他 {otherVariations.length} 個結果
                                                            </motion.button>
                                                        )}

                                                        {/* 展開後的其他變體列表 */}
                                                        {showAllVariations && (
                                                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-2.5 mt-3.5">
                                                                {otherVariations.map((food, idx) => {
                                                                    const { cleanName, tags } = processFoodName(food.name);
                                                                    const source = getFoodSourceInfo(food);
                                                                    const isInCart = comboCart.some(c => c.food.name === food.name);
                                                                    return (
                                                                        <div
                                                                            key={food.id || idx}
                                                                            onClick={() => handleFoodClick(food)}
                                                                            className={`p-4 rounded-[18px] transition-all flex justify-between items-center cursor-pointer ${isInCart
                                                                                ? 'text-[#161415] scale-[0.99]'
                                                                                : 'text-[#161415]'
                                                                                }`}
                                                                            style={isInCart ? {
                                                                                background: 'linear-gradient(135deg, rgba(249,92,75,0.18) 0%, rgba(255,255,255,0.78) 70%)',
                                                                                border: '1.5px solid rgba(249,92,75,0.6)',
                                                                                boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.9), 0 8px 24px rgba(0,0,0,0.1)'
                                                                            } : {
                                                                                background: 'rgba(255, 255, 255, 0.45)',
                                                                                borderTop: '1px solid rgba(255, 255, 255, 0.9)',
                                                                                borderLeft: '1px solid rgba(255, 255, 255, 0.6)',
                                                                                borderRight: '1px solid rgba(255, 255, 255, 0.3)',
                                                                                borderBottom: '1px solid rgba(255, 255, 255, 0.3)',
                                                                                boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.6), 0 8px 24px rgba(0,0,0,0.06)'
                                                                            }}
                                                                        >
                                                                            <div className="flex items-center gap-3.5 flex-1 min-w-0 pr-2">
                                                                                <span className={`text-2xl flex-shrink-0 relative w-12 h-12 flex items-center justify-center rounded-[12px] overflow-hidden ${isInCart ? 'opacity-80' : ''}`}>
                                                                                    {food.image ? (
                                                                                        <img loading="lazy" decoding="async" src={food.image} className="w-full h-full object-cover" alt="" />
                                                                                    ) : (
                                                                                        food.emoji || '🕒'
                                                                                    )}
                                                                                </span>
                                                                                <div className="min-w-0 flex-1 pr-2">
                                                                                    <p className={`font-bold text-base truncate tracking-tight text-[#161415]`} style={{ fontFamily: '"Tenor Sans", sans-serif' }}>{cleanName}</p>
                                                                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                                                        <p className={`text-[11px] font-black tabular-nums text-[#161415]/70`} style={{ fontFamily: '"Tenor Sans", sans-serif' }}>{food.is_dish ? `${food.calories} kcal／100 g` : `${food.calories} kcal／100 g`}</p>
                                                                                        <div className="flex gap-1.5">
                                                                                            <span className={`px-2 py-0.5 rounded-[6px] text-[11px] font-black tracking-wider border bg-[#D94030]/15 text-[#D94030] border-[#D94030]/30 shadow-2xs`} style={{ fontFamily: '"Tenor Sans", sans-serif' }}>P:{food.protein}</span>
                                                                                            <span className={`px-2 py-0.5 rounded-[6px] text-[11px] font-black tracking-wider border bg-[#F59E0B]/15 text-[#D97706] border-[#F59E0B]/30 shadow-2xs`} style={{ fontFamily: '"Tenor Sans", sans-serif' }}>C:{food.carbs}</span>
                                                                                            <span className={`px-2 py-0.5 rounded-[6px] text-[11px] font-black tracking-wider border bg-[#161415]/10 text-[#161415] border-[#161415]/20 shadow-2xs`} style={{ fontFamily: '"Tenor Sans", sans-serif' }}>F:{food.fats}</span>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </motion.div>
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    ) : searchQuery.trim().length > 0 ? (
                                        <div className="text-center py-20">
                                            <div className="w-16 h-16 bg-[#E4DED2]/50 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <Search size={24} className="text-[#161415]/20" />
                                            </div>
                                            <p role="status" className="font-bold text-[#161415]">{isSearching ? '搜尋中…' : searchUnavailable ? '食物資料庫暫時連不上' : `找不到「${searchQuery.trim()}」`}</p>
                                            {!isSearching && !isComboMode && (
                                                <motion.button {...pressProps('cta')} type="button"
                                                    onClick={() => { triggerHaptic('light'); openCreateFood(searchQuery); }}
                                                    className="ti-btn-dark mx-auto mt-5 flex items-center justify-center gap-2"
                                                    style={{ height: 48, padding: '0 22px', borderRadius: 999, fontSize: 15, letterSpacing: '0.08em', maxWidth: '100%' }}>
                                                    <Plus size={16} strokeWidth={2.6} />
                                                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>自己建一個</span>
                                                </motion.button>
                                            )}
                                        </div>
                                    ) : starredFoods.length > 0 ? null : (
                                        <div className="text-center py-20">
                                            <div className="w-16 h-16 bg-[#E4DED2]/50 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <Sparkles size={24} className="text-[#161415]/20" />
                                            </div>
                                            <p className="font-bold text-[#161415]">輸入就會即時搜尋</p>
                                        </div>
                                    )}
                                    {/* 有結果時也留一個出口：列表裡沒有想要的那一個 */}
                                    {!isComboMode && !isSearching && searchQuery.trim().length > 0 && searchResults.length > 0 && (
                                        <motion.button {...pressProps('row')} type="button"
                                            onClick={() => { triggerHaptic('light'); openCreateFood(searchQuery); }}
                                            className="w-full flex items-center gap-3 text-left"
                                            style={{ minHeight: 60, padding: '0 16px 0 10px', borderRadius: 24, border: 'none', background: 'rgba(232,233,230,0.85)', color: '#161415' }}>
                                            <span style={{ width: 40, height: 40, borderRadius: 999, background: '#F6F4F1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 1px 2px rgba(32,32,32,0.04)' }}>
                                                <Plus size={18} strokeWidth={2.2} />
                                            </span>
                                            <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700 }}>找不到？自己建一個</span>
                                            <ChevronRight size={18} style={{ flexShrink: 0, opacity: 0.4 }} />
                                        </motion.button>
                                    )}
                                </div>
                            </div>

                            <AnimatePresence>
                                {selectedFood && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 100 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 100 }}
                                        /* 跑版修正：原本只有 px-4，上下沒有留安全區，
                                           靈動島與底部 home indicator 會蓋住卡片頭尾。 */
                                        className="fixed inset-0 z-[9999] flex flex-col justify-center items-center bg-black/40 backdrop-blur-sm px-4"
                                        style={{
                                            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
                                            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
                                        }}
                                        onClick={(e) => {
                                            if (e.target === e.currentTarget) {
                                                const cameFromQuickAdd = isQuickAddMode;
                                                setSelectedFood(null);
                                                setIsQuickAddMode(false);
                                                if (cameFromQuickAdd) setShowSmartSearch(false);
                                            }
                                        }}
                                    >
                                        <div
                                            /* 卡片自己不捲：玻璃（含邊緣折射那兩層）掛在外殼上，永遠包住整張卡；
                                               內容太長時只捲裡面那一層。
                                               ⚠️ 以前外殼本身 overflow-y:auto，一捲動折射光就停在原地、
                                                  卡片上半部的標題被捲出畫面（截圖：只看得到「每 100 g」）。 */
                                            className="lg-prism rounded-[36px] relative w-full mx-auto"
                                            style={{
                                                ...prismStyle,
                                                maxWidth: 360,
                                                maxHeight: '100%',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                overflow: 'hidden',
                                                flexShrink: 0,
                                            }}
                                        >
                                            <div className="relative z-10 no-scrollbar" style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '22px 20px 8px' }}>
                                                {/* Top-Right Favorite Star Toggle */}
                                                <motion.button {...pressProps('icon')}
 onClick={() => {
 triggerHaptic('medium');
 toggleStar(selectedFood);
 }}
 className="absolute top-0 right-0 p-2 text-2xl z-20"
 aria-label="收藏餐點"
 >
                                                    {isStarred(selectedFood.name) ? (
                                                        <span style={{ color: '#E0A100' }}>★</span>
                                                    ) : (
                                                        <span style={{ color: 'rgba(22,20,21,0.35)' }}>☆</span>
                                                    )}
                                                </motion.button>

                                                <div className="flex items-center gap-3.5 mb-5 pr-10">
                                                    {/* 圖示可以自己換：食物庫給的 emoji 常常對不上使用者心裡那家店的樣子。
                                                        點一下 → 選 emoji 或用自己拍的照片；換過之後全站都跟著換。 */}
                                                    {(() => {
                                                        const ic = resolveFoodIcon(foodIcons, selectedFood);
                                                        return (
                                                            <motion.button
                                                                {...pressProps('icon')}
                                                                type="button"
                                                                onClick={() => { triggerHaptic('light'); setIconPickerFor(selectedFood.name); }}
                                                                aria-label={`更換「${selectedFood.name}」的圖示`}
                                                                className="relative shrink-0 w-14 h-14 rounded-[18px] flex items-center justify-center overflow-hidden"
                                                                style={{ padding: 0, cursor: 'pointer', background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 4px 12px -6px rgba(22,20,21,0.18)' }}
                                                            >
                                                                {ic.image ? (
                                                                    <img loading="lazy" decoding="async" src={ic.image} className="w-full h-full object-cover" alt="" />
                                                                ) : (
                                                                    <span className="text-[32px]">{ic.emoji}</span>
                                                                )}
                                                                <span
                                                                    aria-hidden="true"
                                                                    className="absolute bottom-0 right-0 flex items-center justify-center"
                                                                    style={{
                                                                        width: 20, height: 20, borderRadius: 999,
                                                                        background: 'rgba(20,16,14,0.88)', border: '1px solid rgba(255,255,255,0.28)',
                                                                        fontSize: 11, color: '#F6F4F1', lineHeight: 1,
                                                                    }}
                                                                >
                                                                    ✎
                                                                </span>
                                                            </motion.button>
                                                        );
                                                    })()}
                                                    <div className="flex-1 min-w-0">
                                                        <h3
                                                            className="font-medium tracking-tight leading-tight"
                                                            style={{ fontFamily: "'Tenor Sans', sans-serif", color: '#161415', fontSize: 'clamp(20px, 5.8vw, 26px)', lineBreak: 'strict' }}
                                                        >
                                                            {selectedFood.name}
                                                        </h3>
                                                        <p className="text-[12px] mt-1 font-semibold tabular-nums" style={{ color: 'rgba(22,20,21,0.55)' }}>
                                                            每 100 g · {Math.round(Number(selectedFood.calories) || 0)} 大卡
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* 份量：講「一碗 / 一顆 / 一個手掌」，不要使用者自己換算公克。
                                                    對照表在 utils/foodPortions.js。沒把握的食物一律退回公克級距 ——
                                                    生米若被當成「一碗飯」，熱量會整整多算一倍以上。 */}
                                                <div className="flex gap-2 mb-3">
                                                    {portionOptions.options.map(opt => {
                                                        const isActive = Number(inputGrams) === opt.grams;
                                                        return (
                                                            <motion.button {...pressProps('pill')} key={opt.label}
 onClick={() => { setInputGrams(opt.grams); triggerHaptic('light'); }}
 className="flex-1 py-2.5 rounded-[18px] border min-w-0"
 style={{
 background: isActive ? '#161415' : 'rgba(255,255,255,0.46)',
 color: isActive ? '#F6F4F1' : '#161415',
 borderColor: isActive ? '#161415' : 'rgba(255,255,255,0.75)',
 minHeight: 56,
 }}>
                                                                <span className="block text-[12px] font-black tracking-wide">{opt.label}</span>
                                                                <span className="block tabular-nums" style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>{opt.grams} g</span>
                                                            </motion.button>
                                                        );
                                                    })}
                                                </div>

                                                {/* 整份餐點：攤開組成。使用者不必自己拆料、也不必秤重，
                                                    但他有權知道這個數字是怎麼算出來的（組成會隨份量一起縮放）。 */}
                                                {selectedFood.is_dish && selectedFood.dish?.components?.length > 1 && (
                                                    <div className="mb-3 rounded-[18px] overflow-hidden" style={{ background: 'rgba(255,255,255,0.40)', border: '1px solid rgba(255,255,255,0.7)' }}>
                                                        {/* 組成預設收起：一列「這一份的組成 · N 樣」，點了才攤開 */}
                                                        <motion.button {...pressProps('row')} type="button" aria-expanded={dishCompOpen}
                                                            onClick={() => { triggerHaptic('light'); setDishCompOpen(v => !v); }}
                                                            className="w-full flex items-center gap-2 px-4 text-left"
                                                            style={{ minHeight: 48, background: 'none', border: 'none', color: '#161415' }}>
                                                            <span className="flex-1 min-w-0 text-[13px] font-bold">
                                                                這一份的組成<span className="font-semibold" style={{ color: 'rgba(22,20,21,0.5)' }}> · {selectedFood.dish.components.length} 樣</span>
                                                            </span>
                                                            <ChevronDown size={16} className="shrink-0" color="rgba(22,20,21,0.5)" style={{ transform: dishCompOpen ? 'rotate(180deg)' : 'none', transition: 'transform .28s cubic-bezier(0.16,1,0.3,1)' }} />
                                                        </motion.button>
                                                        <AnimatePresence initial={false}>
                                                            {dishCompOpen && (
                                                                <motion.div key="comp" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }} style={{ overflow: 'hidden' }}>
                                                                    <div className="px-4 pb-3" style={{ borderTop: '1px solid rgba(22,20,21,0.08)', paddingTop: 8 }}>
                                                                        {selectedFood.dish.components.map(c => {
                                                                            const scale = (Number(inputGrams) || selectedFood.servingGrams) / selectedFood.servingGrams;
                                                                            return (
                                                                                <div key={c.name} className="flex items-baseline justify-between gap-3 py-0.5">
                                                                                    <span className="text-[12px] font-semibold min-w-0 truncate" style={{ color: 'rgba(22,20,21,0.85)' }}>{c.name}</span>
                                                                                    <span className="text-[12px] font-semibold tabular-nums shrink-0" style={{ color: 'rgba(22,20,21,0.55)' }}>
                                                                                        {Math.round(c.grams * scale)} g · {Math.round(c.calories * scale)} 大卡
                                                                                    </span>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                        <p className="text-[11px] mt-2" style={{ color: 'rgba(22,20,21,0.5)' }}>衛福部資料換算的一般份量，僅供估算</p>
                                                                    </div>
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>
                                                )}

                                                {/* 第二層：這個份量長什麼樣（只在有把握時才說） */}
                                                {(() => {
                                                    const active = portionOptions.options.find(o => Number(inputGrams) === o.grams);
                                                    return active?.hint ? (
                                                        <p className="text-[12px] mb-3" style={{ color: 'rgba(22,20,21,0.55)' }}>
                                                            {active.hint}
                                                        </p>
                                                    ) : null;
                                                })()}

                                                {/* 自訂份量：拖拉桿就好（沒有人在餐桌前打數字）；右邊的數字點了也能直接改。
                                                    拉桿的範圍跟著這個食物走：從 10 g 到「大份的 1.6 倍」（至少 300 g）。
                                                    「?」＝沒有秤的時候，用手比的對照。 */}
                                                {(() => {
                                                    const opts = portionOptions.options || [];
                                                    const biggest = opts.reduce((m, o) => Math.max(m, Number(o.grams) || 0), 0);
                                                    const max = Math.max(300, Math.ceil((biggest * 1.6) / 10) * 10, Number(inputGrams) || 0);
                                                    const step = max > 600 ? 10 : 5;
                                                    const val = Math.min(max, Math.max(0, Number(inputGrams) || 0));
                                                    const pct = max > 10 ? ((val - 10) / (max - 10)) * 100 : 0;
                                                    return (
                                                        <div className="mb-4 rounded-[24px]" style={{ padding: '12px 16px 14px', background: 'rgba(255,255,255,0.40)', border: '1px solid rgba(255,255,255,0.7)' }}>
                                                            <div className="flex items-center gap-1">
                                                                <span className="font-extrabold text-[12px] whitespace-nowrap" style={{ color: 'rgba(22,20,21,0.62)' }}>自訂份量</span>
                                                                <motion.button {...pressProps('icon')}
                                                                    type="button"
                                                                    aria-label="沒有秤？用手估"
                                                                    onClick={(e) => { e.stopPropagation(); triggerHaptic('light'); setShowPortionGuide(true); }}
                                                                    className="flex items-center justify-center shrink-0"
                                                                    style={{ width: 44, height: 44, borderRadius: 999, border: 'none', background: 'transparent', padding: 0 }}
                                                                >
                                                                    <span style={{ width: 24, height: 24, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(22,20,21,0.14)', fontSize: 13, fontWeight: 800, color: '#161415', lineHeight: 1 }}>?</span>
                                                                </motion.button>
                                                                <span className="flex-1" />
                                                                <input
                                                                    type="number"
                                                                    inputMode="numeric"
                                                                    aria-label="份量（公克）"
                                                                    value={inputGrams}
                                                                    max={NUTRI_LIMITS.grams.max}
                                                                    onChange={(e) => {
                                                                        let v = e.target.value;
                                                                        if (v.length > 1 && v.startsWith('0')) v = v.replace(/^0+/, '');
                                                                        const g = v === '' ? '' : Math.max(0, parseInt(v) || 0);
                                                                        // 打到 3 公斤以上多半是多按了一個 0：擋下來並說出原因，停在上限
                                                                        if (g !== '' && g > NUTRI_LIMITS.grams.max) {
                                                                            toast.error(`單筆份量最多 ${NUTRI_LIMITS.grams.max} g`);
                                                                            setInputGrams(NUTRI_LIMITS.grams.max);
                                                                            return;
                                                                        }
                                                                        setInputGrams(g);
                                                                    }}
                                                                    className="bg-transparent text-right font-light focus:outline-none tabular-nums min-w-0"
                                                                    style={{ fontFamily: "'Tenor Sans', sans-serif", fontSize: 30, color: '#161415', width: 92, lineHeight: 1 }}
                                                                />
                                                                <span className="text-[16px] font-medium" style={{ color: 'rgba(22,20,21,0.45)' }}>g</span>
                                                            </div>
                                                            <input
                                                                type="range"
                                                                className="drvn-range"
                                                                aria-label="拖拉調整份量"
                                                                min={10}
                                                                max={max}
                                                                step={step}
                                                                value={Math.max(10, val)}
                                                                onChange={(e) => setInputGrams(parseInt(e.target.value, 10) || 0)}
                                                                onPointerUp={() => triggerHaptic('light')}
                                                                style={{ '--pct': `${Math.max(0, Math.min(100, pct))}%`, marginTop: 6 }}
                                                            />
                                                            <div className="flex justify-between tabular-nums" style={{ fontSize: 11, fontWeight: 600, color: 'rgba(22,20,21,0.45)', marginTop: 2 }}>
                                                                <span>10 g</span><span>{max} g</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}

                                                {/* 這一份吃進去多少：熱量一個大數字，三大營養素收成一行（介面標準 §2）。
                                                    ⚠️ 以前是五格一樣大的 CALS／PRO／CARB／脂肪／膳食纖維 —— 英中混雜、沒有單位、
                                                       五個數字一樣大，看不出哪個是重點。 */}
                                                {(() => {
                                                    const f1 = (v) => { const n = Number(v) || 0; return n >= 10 ? Math.round(n) : Math.round(n * 10) / 10; };
                                                    const M = finalMacros;
                                                    const rows = [
                                                        { key: 'protein', label: '蛋白質', color: '#D94030' },
                                                        { key: 'carbs', label: '碳水', color: '#161415' },
                                                        { key: 'fats', label: '脂肪', color: '#161415' },
                                                    ];
                                                    const setAbs = (key, v) => {
                                                        const base = Number(calculatedMacros[key]) || 0;
                                                        const n = Math.max(0, Math.min(999, Number(v) || 0));
                                                        setMacroAdj((a) => ({ ...a, [key]: Math.round((n - base) * 10) / 10 }));
                                                    };
                                                    const bump = (key, d) => { triggerHaptic('light'); setAbs(key, Math.round((Number(M[key]) || 0) + d)); };
                                                    return (
                                                        <div className="mb-3 px-1">
                                                            <div className="flex items-baseline gap-2">
                                                                <span className="text-[44px] font-light text-[#161415] leading-none tabular-nums" style={{ fontFamily: "'Tenor Sans', sans-serif", letterSpacing: '-0.03em' }}>
                                                                    {Math.round(Number(M.calories) || 0)}
                                                                </span>
                                                                <span className="text-[12px] font-bold" style={{ color: 'rgba(22,20,21,0.5)' }}>大卡</span>
                                                            </div>
                                                            {/* 三大營養素一行；點這一行就能自己微調（資料庫的值跟你那一份不一樣時） */}
                                                            <motion.button {...pressProps('row')} type="button" aria-expanded={macroAdjOpen}
                                                                onClick={() => { triggerHaptic('light'); setMacroAdjOpen((v) => !v); }}
                                                                className="w-full flex items-center gap-2 text-left"
                                                                style={{ minHeight: 44, background: 'none', border: 'none', padding: 0, marginTop: 4 }}>
                                                                <span className="flex-1 min-w-0 text-[12px] font-semibold tabular-nums" style={{ color: 'rgba(22,20,21,0.62)' }}>
                                                                    {/* 每一項不拆行，項目之間才換行 */}
                                                                    <span style={{ color: '#D94030', fontWeight: 800, whiteSpace: 'nowrap' }}>蛋白質 {f1(M.protein)} g</span>
                                                                    {' · '}<span style={{ whiteSpace: 'nowrap' }}>{`碳水 ${f1(M.carbs)} g`}</span>
                                                                    {' · '}<span style={{ whiteSpace: 'nowrap' }}>{`脂肪 ${f1(M.fats)} g`}</span>
                                                                    {Number(M.fiber) > 0 && <>{' · '}<span style={{ whiteSpace: 'nowrap' }}>{`纖維 ${f1(M.fiber)} g`}</span></>}
                                                                </span>
                                                                <span className="shrink-0 flex items-center gap-0.5 text-[12px] font-bold" style={{ color: macroAdjusted ? '#161415' : 'rgba(22,20,21,0.5)' }}>
                                                                    {macroAdjusted ? '已微調' : '微調'}
                                                                    <ChevronDown size={14} style={{ transform: macroAdjOpen ? 'rotate(180deg)' : 'none', transition: 'transform .28s cubic-bezier(0.16,1,0.3,1)' }} />
                                                                </span>
                                                            </motion.button>
                                                            <AnimatePresence initial={false}>
                                                                {macroAdjOpen && (
                                                                    <motion.div key="madj" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }} style={{ overflow: 'hidden' }}>
                                                                        <div className="rounded-[18px] mt-1" style={{ padding: '4px 10px', background: 'rgba(255,255,255,0.40)', border: '1px solid rgba(255,255,255,0.7)' }}>
                                                                            {rows.map((row, i) => (
                                                                                <div key={row.key} className="flex items-center gap-2" style={{ minHeight: 48, borderTop: i ? '1px solid rgba(22,20,21,0.07)' : 'none' }}>
                                                                                    <span className="flex-1 min-w-0 text-[13px] font-bold" style={{ color: row.color }}>{row.label}</span>
                                                                                    <motion.button {...pressProps('icon')} type="button" aria-label={`${row.label}減 1 公克`} onClick={() => bump(row.key, -1)}
                                                                                        className="flex items-center justify-center shrink-0" style={{ width: 44, height: 44, border: 'none', background: 'transparent', padding: 0 }}>
                                                                                        <span style={{ width: 30, height: 30, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.75)', border: '1px solid rgba(22,20,21,0.12)' }}><Minus size={14} /></span>
                                                                                    </motion.button>
                                                                                    <input type="number" inputMode="decimal" aria-label={`${row.label}（公克）`}
                                                                                        value={f1(M[row.key])}
                                                                                        onChange={(e) => setAbs(row.key, e.target.value)}
                                                                                        className="bg-transparent text-center tabular-nums focus:outline-none"
                                                                                        style={{ width: 52, fontSize: 17, fontWeight: 700, color: '#161415' }} />
                                                                                    <span className="text-[12px] font-semibold" style={{ color: 'rgba(22,20,21,0.45)', width: 10 }}>g</span>
                                                                                    <motion.button {...pressProps('icon')} type="button" aria-label={`${row.label}加 1 公克`} onClick={() => bump(row.key, 1)}
                                                                                        className="flex items-center justify-center shrink-0" style={{ width: 44, height: 44, border: 'none', background: 'transparent', padding: 0 }}>
                                                                                        <span style={{ width: 30, height: 30, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.75)', border: '1px solid rgba(22,20,21,0.12)' }}><Plus size={14} /></span>
                                                                                    </motion.button>
                                                                                </div>
                                                                            ))}
                                                                            {macroAdjusted && (
                                                                                <motion.button {...pressProps('row')} type="button"
                                                                                    onClick={() => { triggerHaptic('light'); setMacroAdj({ protein: 0, carbs: 0, fats: 0 }); }}
                                                                                    className="w-full text-[12px] font-bold"
                                                                                    style={{ minHeight: 44, border: 'none', background: 'none', color: 'rgba(22,20,21,0.55)', borderTop: '1px solid rgba(22,20,21,0.07)' }}>
                                                                                    還原成資料庫的值
                                                                                </motion.button>
                                                                            )}
                                                                        </div>
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>
                                                        </div>
                                                    );
                                                })()}

                                            </div>
                                            {/* 記錄／取消固定在卡片底部：內容再長（小螢幕、展開組成）按鈕都看得到 */}
                                            <div className="relative z-10" style={{ flex: '0 0 auto', padding: '10px 20px 18px', borderTop: '1px solid rgba(255,255,255,0.55)' }}>
                                                <motion.button {...pressProps('pill')}
 ref={logButtonRef}
 onClick={handleSmartLog}
 disabled={savingMeal}
 className="lg-btn-soft-coral w-full rounded-[18px] text-[15px] font-extrabold mb-2"
 style={{ letterSpacing: '0.06em', minHeight: 54 }}
 >
                                                    {savingMeal ? '正在儲存…' : `記錄這一份 · ${Number(inputGrams) || 0} g`}
                                                </motion.button>

                                                <div className="flex gap-2">
                                                    <motion.button {...pressProps('cta')}
                                                        onClick={() => {
                                                            triggerHaptic('light');
                                                            // 若是「快速新增」直接進來的（非從清單瀏覽），取消時整個關閉，
                                                            // 不要把使用者彈回食物清單頁（圖四）。
                                                            const cameFromQuickAdd = isQuickAddMode;
                                                            setSelectedFood(null);
                                                            setIsQuickAddMode(false);
                                                            if (cameFromQuickAdd) {
                                                                setShowSmartSearch(false);
                                                            }
                                                        }}
                                                        className="flex-1 min-h-[44px] rounded-[18px] font-bold text-[13px]" style={{ color: 'rgba(22,20,21,0.62)', background: 'rgba(255,255,255,0.40)', border: '1px solid rgba(255,255,255,0.7)' }}
                                                    >
                                                        取消
                                                    </motion.button>

                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* ── 🛒 Floating Tray Overlay ── */}
                            {isComboMode && comboCart.length > 0 && (
                                <motion.div
                                    initial={{ y: 50, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    exit={{ y: 50, opacity: 0 }}
                                    className="absolute bottom-4 left-4 right-4 z-40 bg-[#161415]/95 backdrop-blur-md p-4 rounded-3xl border border-white/10 shadow-2xl flex items-center justify-between gap-3"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        {/* Cart items list with badges */}
                                        <div className="flex -space-x-2 shrink-0">
                                            {comboCart.slice(0, 3).map((item, idx) => (
                                                <div key={idx} className="w-8 h-8 rounded-full bg-[#E4DED2] border border-[#161415] flex items-center justify-center text-sm shadow-sm relative shrink-0">
                                                    {item.food.emoji || '🍲'}
                                                </div>
                                            ))}
                                            {comboCart.length > 3 && (
                                                <div className="w-8 h-8 rounded-full bg-[#F95C4B] border border-[#161415] flex items-center justify-center text-[11px] font-black text-white shadow-sm shrink-0">
                                                    +{comboCart.length - 3}
                                                </div>
                                            )}
                                        </div>

                                        <div className="min-w-0">
                                            <p className="text-[12px] font-bold text-white/60">已選 {comboCart.length} 樣</p>
                                            <p className="text-[14px] font-bold text-white truncate">
                                                <span className="tabular-nums">{comboCart.reduce((acc, curr) => acc + Math.round((curr.food.calories * curr.grams) / 100), 0)} kcal</span>
                                            </p>
                                        </div>
                                    </div>

                                    <motion.button {...pressProps('pill')}
 onClick={() => {
 triggerHaptic('medium');
 setComboName('');
 setComboEmoji('🍲');
 setShowComboBuilder(true);
 }}
 className="bg-white text-[#161415] hover:bg-[#E4DED2] px-4 py-2.5 rounded-[18px] text-[12px] font-black tracking-wider shrink-0 shadow-md flex items-center gap-1"
 >
                                        下一步：調份量 <ChevronRight size={14} />
                                    </motion.button>
                                </motion.div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── 🥟 Combo Builder Modal (組合計算機) ── */}
            <AnimatePresence>
                {showComboBuilder && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[250] flex items-end justify-center bg-black/45 backdrop-blur-md"
                        onClick={() => setShowComboBuilder(false)}
                    >
                        <motion.div
                            initial={{ y: '100%', opacity: 0.9 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: '100%', opacity: 0.9 }}
                            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                            style={{ background: '#F6F4F1', height: '88dvh' }}
                            className="w-full max-w-sm rounded-t-[28px] flex flex-col overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Drag Handle */}
                            <div className="flex justify-center pt-3 pb-1 shrink-0">
                                <div className="w-10 h-1 rounded-full bg-[#CFC6B8]" />
                            </div>

                            {/* ══ 自由配：調份量 → 記錄 ═════════════════════════════════════════
                                ⚠️ 以前順序是「命名＋選表情 → 份量 → 四格總計 → 英文說明」：
                                   最不重要的命名放最上面，要做的事（調份量）被推到下面；
                                   +／− 是 32px 小方塊，每樣食物佔一整張卡；底下還寫著
                                   「自動 normalized 100g 存入常用收藏」。
                                現在：上面是這一餐的總熱量（主角）→ 每樣食物一列、大 +／− →
                                取名收成一行選填 → 一顆「記錄這一餐」。 */}
                            {(() => {
                                const clean = (n) => String(n || '').replace(/\s*[0\.]+\s*$/, '').trim();
                                const r1 = (v) => { const n = Number(v) || 0; return n >= 10 ? Math.round(n) : Math.round(n * 10) / 10; };
                                const setGrams = (id, g) => setComboCart(prev => prev.map(c => c.id === id ? { ...c, grams: Math.max(0, Math.min(2000, g)) } : c));
                                const totalG = comboCart.reduce((a, c) => a + (Number(c.grams) || 0), 0);
                                const sum = (k) => comboCart.reduce((a, c) => a + ((Number(c.food[k]) || 0) * (Number(c.grams) || 0)) / 100, 0);
                                const totalCals = sum('calories');
                                return (
                                    <>
                                        {/* 頂：這一餐總共多少（跟著份量即時變） */}
                                        <div className="flex justify-between items-start px-6 pt-3 pb-4 border-b border-[#E4DED2] shrink-0">
                                            <div className="min-w-0">
                                                <p className="text-[12px] font-extrabold text-[#161415]/45">自由配 · {comboCart.length} 樣</p>
                                                <div className="flex items-baseline gap-1.5 mt-1">
                                                    <span className="text-[44px] font-light text-[#161415] leading-none tabular-nums" style={{ letterSpacing: '-0.03em' }}>{Math.round(totalCals)}</span>
                                                    <span className="text-[12px] font-bold text-[#161415]/50">大卡</span>
                                                </div>
                                                <p className="text-[12px] font-semibold text-[#161415]/55 mt-1.5 tabular-nums">
                                                    <span className="text-[#D94030] font-extrabold">蛋白質 {r1(sum('protein'))} g</span>
                                                    {` · 碳水 ${r1(sum('carbs'))} g · 脂肪 ${r1(sum('fats'))} g · 共 ${totalG} g`}
                                                </p>
                                            </div>
                                            <motion.button {...pressProps('icon')}
                                                onClick={() => setShowComboBuilder(false)}
                                                aria-label="回去選食物"
                                                className="w-11 h-11 flex items-center justify-center rounded-full bg-[#E4DED2] shrink-0"
                                            >
                                                <X size={16} className="text-[#161415]" />
                                            </motion.button>
                                        </div>

                                        <div className="flex-1 overflow-y-auto px-5 py-4">
                                            {comboCart.length === 0 ? (
                                                <motion.button {...pressProps('card')}
                                                    onClick={() => setShowComboBuilder(false)}
                                                    className="w-full bg-white rounded-3xl border border-[#E4DED2] px-5 flex items-center justify-between"
                                                    style={{ minHeight: 64 }}>
                                                    <span className="text-[17px] font-bold text-[#161415]">回去選食物</span>
                                                    <ChevronRight size={18} />
                                                </motion.button>
                                            ) : (
                                                <div className="bg-white rounded-3xl border border-[#E4DED2] shadow-sm overflow-hidden">
                                                    {comboCart.map((item, idx) => {
                                                        const kcal = Math.round((Number(item.food.calories) || 0) * (Number(item.grams) || 0) / 100);
                                                        const prot = r1((Number(item.food.protein) || 0) * (Number(item.grams) || 0) / 100);
                                                        return (
                                                            <div key={item.id || idx} className="px-4 py-3.5" style={{ borderTop: idx === 0 ? 'none' : '1px solid #EFEAE2' }}>
                                                                <div className="flex items-center gap-3">
                                                                    <span className="w-10 h-10 shrink-0 rounded-[14px] bg-[#F6F4F1] flex items-center justify-center text-[22px] overflow-hidden">
                                                                        {item.food.image
                                                                            ? <img loading="lazy" decoding="async" src={item.food.image} className="w-full h-full object-cover" alt="" />
                                                                            : (item.food.emoji || '🍲')}
                                                                    </span>
                                                                    <div className="min-w-0 flex-1">
                                                                        <p className="text-[14px] font-bold text-[#161415] truncate">{clean(item.food.name)}</p>
                                                                        <p className="text-[12px] font-semibold text-[#161415]/50 tabular-nums">{kcal} 大卡 · 蛋白質 {prot} g</p>
                                                                    </div>
                                                                    <motion.button {...pressProps('icon')}
                                                                        onClick={() => { triggerHaptic('medium'); setComboCart(prev => prev.filter(c => c.id !== item.id)); }}
                                                                        aria-label={`拿掉${clean(item.food.name)}`}
                                                                        className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full text-[#161415]/35"
                                                                    >
                                                                        <X size={18} />
                                                                    </motion.button>
                                                                </div>
                                                                {/* 份量：大 −／＋（一次 10 g）＋ 中間可直接打字 */}
                                                                <div className="flex items-center gap-2 mt-2.5 pl-[52px]">
                                                                    <motion.button {...pressProps('icon')}
                                                                        onClick={() => { triggerHaptic('light'); setGrams(item.id, (Number(item.grams) || 0) - 10); }}
                                                                        aria-label="少 10 克"
                                                                        className="w-11 h-11 rounded-full bg-[#F6F4F1] border border-[#E4DED2] flex items-center justify-center text-[20px] font-bold text-[#161415]"
                                                                    >−</motion.button>
                                                                    <div className="flex-1 flex items-baseline justify-center gap-1 rounded-full bg-[#F6F4F1] border border-[#E4DED2]" style={{ minHeight: 44, paddingTop: 8 }}>
                                                                        <input
                                                                            type="number"
                                                                            inputMode="numeric"
                                                                            value={item.grams}
                                                                            onChange={e => setGrams(item.id, parseInt(e.target.value) || 0)}
                                                                            className="bg-transparent text-center text-[17px] font-bold text-[#161415] w-16 focus:outline-none tabular-nums"
                                                                        />
                                                                        <span className="text-[12px] font-bold text-[#161415]/45">g</span>
                                                                    </div>
                                                                    <motion.button {...pressProps('icon')}
                                                                        onClick={() => { triggerHaptic('light'); setGrams(item.id, (Number(item.grams) || 0) + 10); }}
                                                                        aria-label="多 10 克"
                                                                        className="w-11 h-11 rounded-full bg-[#161415] flex items-center justify-center text-[20px] font-bold text-[#F6F4F1]"
                                                                    >＋</motion.button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {/* 取名（選填）：一行。不取名就用食物名串起來 */}
                                            {comboCart.length > 0 && (
                                                <div className="mt-5">
                                                    <p className="text-[12px] font-extrabold text-[#161415]/45 mb-2">存成常用餐點（選填）</p>
                                                    <div className="flex items-center gap-2 bg-white rounded-3xl border border-[#E4DED2] p-2">
                                                        <input type="file" ref={comboPhotoInputRef} onChange={handleComboPhotoUpload} accept="image/*" className="hidden" />
                                                        <motion.button {...pressProps('icon')}
                                                            onClick={() => { triggerHaptic('light'); comboPhotoInputRef.current?.click(); }}
                                                            aria-label="換照片"
                                                            className="relative w-11 h-11 shrink-0 rounded-[14px] bg-[#F6F4F1] flex items-center justify-center text-[24px] overflow-hidden"
                                                        >
                                                            {comboImage ? <img src={comboImage} className="w-full h-full object-cover" alt="" /> : comboEmoji}
                                                            <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-[#161415] text-white flex items-center justify-center"><Camera size={9} /></span>
                                                        </motion.button>
                                                        <input
                                                            type="text"
                                                            value={comboName}
                                                            onChange={e => setComboName(e.target.value)}
                                                            placeholder={comboCart.map(c => clean(c.food.name)).join(' + ').slice(0, 18)}
                                                            className="flex-1 min-w-0 bg-transparent text-[14px] font-bold text-[#161415] outline-none placeholder:text-[#161415]/35 px-1"
                                                            style={{ minHeight: 44 }}
                                                        />
                                                    </div>
                                                    {!comboImage && (
                                                        <div className="flex gap-1 overflow-x-auto py-2 scrollbar-hide">
                                                            {['🍲', '🥟', '🥗', '🥩', '🍣', '🍛', '🍱', '🍔', '🍕', '🍜'].map(emoji => (
                                                                <motion.button {...pressProps('icon')}
                                                                    key={emoji}
                                                                    onClick={() => { triggerHaptic('light'); setComboEmoji(emoji); }}
                                                                    className="w-11 h-11 shrink-0 rounded-xl text-[22px] flex items-center justify-center"
                                                                    style={comboEmoji === emoji ? { background: 'rgba(249,92,75,0.12)', border: '1px solid rgba(249,92,75,0.4)' } : { background: 'transparent' }}
                                                                >{emoji}</motion.button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {comboCart.length > 0 && (
                                            <div className="px-5 pt-3 pb-5 border-t border-[#E4DED2] shrink-0 bg-[#FAF8F5]">
                                                <motion.button {...pressProps('cta')}
                                                    onClick={handleComboLog}
                                                    disabled={comboCart.length === 0 || totalG <= 0}
                                                    className="w-full rounded-[18px] bg-[#161415] text-[#F6F4F1] font-bold text-[14px] disabled:opacity-40 shadow-md"
                                                    style={{ minHeight: 52 }}
                                                >
                                                    記錄這一餐 · {Math.round(totalCals)} 大卡
                                                </motion.button>
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── 💡 首次進入飲食頁的操作教學 ──────────────────────────────
                稽核發現：FirstTimeHint 這個元件在計劃建立、課表產生、跑步計劃
                都掛了，唯獨最複雜的這一頁（8000+ 行、三個分頁、十幾張卡）沒有。
                新使用者進來看到一堆環和數字，不知道第一步該做什麼。
                看過一次就不再打擾（設定裡可重置）。 */}
            {/* 卡片不遮畫面（見 FirstTimeHint）—— 使用者一邊讀一邊看得到大弧與三個環。
                所以每一條只要點名「哪一塊是什麼」，不必把規則也寫進來。 */}
            <FirstTimeHint
                tipKey="nutrition-overview-v2"
                title="這一頁怎麼看"
                steps={[
                    '大弧＝今天吃進多少',
                    '三個環點了看目標怎麼算',
                    '要記錄按上面搜尋食物',
                ]}
                show={activeTab === 'overview'}
            />

            {/* ── 🖼️ 換食物圖示：選 emoji 或用自己的照片 ──────────────────── */}
            <input
                ref={iconFileRef}
                type="file"
                accept="image/*"
                onChange={handleIconFile}
                style={{ display: 'none' }}
                aria-hidden="true"
                tabIndex={-1}
            />
            <AnimatePresence>
                {iconPickerFor && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[240] flex items-end justify-center bg-black/40 backdrop-blur-sm"
                        onClick={() => setIconPickerFor(null)}
                        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
                    >
                        <motion.div
                            initial={{ y: 80, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 80, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                            onClick={(e) => e.stopPropagation()}
                            role="dialog"
                            aria-label="更換食物圖示"
                            className="w-full"
                            style={{
                                maxWidth: 520, background: '#F6F4F1', borderTopLeftRadius: 28, borderTopRightRadius: 28,
                                padding: '20px 20px 24px', maxHeight: '78dvh', overflowY: 'auto',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                <h3 style={{ fontSize: 18, fontWeight: 700, color: '#161415' }}>換個圖示</h3>
                                <motion.button
                                    {...pressProps('icon')}
                                    type="button"
                                    onClick={() => setIconPickerFor(null)}
                                    aria-label="關閉"
                                    style={{ background: 'none', border: 'none', fontSize: 20, color: 'rgba(22,20,21,0.45)', cursor: 'pointer' }}
                                >
                                    ✕
                                </motion.button>
                            </div>
                            <p style={{ fontSize: 13, fontWeight: 700, color: 'rgba(22,20,21,0.5)', marginBottom: 16 }}>
                                {iconPickerFor}
                            </p>

                            <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
                                <motion.button
                                    {...pressProps('cta')}
                                    type="button"
                                    onClick={() => iconFileRef.current?.click()}
                                    style={{
                                        flex: 1, minHeight: 48, borderRadius: 14, cursor: 'pointer',
                                        background: '#161415', color: '#F6F4F1', border: 'none',
                                        fontSize: 15, fontWeight: 800,
                                    }}
                                >
                                    用照片
                                </motion.button>
                                <motion.button
                                    {...pressProps('cta')}
                                    type="button"
                                    onClick={() => applyFoodIcon(iconPickerFor, null)}
                                    style={{
                                        flex: 1, minHeight: 48, borderRadius: 14, cursor: 'pointer',
                                        background: 'transparent', color: '#161415', border: '1px solid rgba(22,20,21,0.20)',
                                        fontSize: 15, fontWeight: 800,
                                    }}
                                >
                                    還原預設
                                </motion.button>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6 }}>
                                {FOOD_EMOJIS.map((em) => (
                                    <motion.button
                                        key={em}
                                        {...pressProps('icon')}
                                        type="button"
                                        onClick={() => applyFoodIcon(iconPickerFor, { emoji: em })}
                                        aria-label={`用 ${em} 當圖示`}
                                        style={{
                                            aspectRatio: '1', minHeight: 40, borderRadius: 12, cursor: 'pointer',
                                            background: foodIcons?.[iconPickerFor]?.emoji === em ? 'rgba(249,92,75,0.14)' : 'rgba(22,20,21,0.04)',
                                            border: foodIcons?.[iconPickerFor]?.emoji === em ? '1.5px solid #F95C4B' : '1px solid rgba(22,20,21,0.06)',
                                            fontSize: 22, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}
                                    >
                                        {em}
                                    </motion.button>
                                ))}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── 💡 營養素說明小卡（點 Hero 環或補給條後出現）────────────────
                「面板一看就要知道這是什麼」的最後一哩：數字看得懂了，
                但「這個目標憑什麼是這個數字」要點得到答案。
                彈出用 spring，關閉用 backdrop 或右上角 —— 不擋路。

                掛到 document.body：底部膠囊導覽列是 z-index 99999、而且長在 App 層，
                小卡留在頁面樹裡不管 z 開多高都會被它蓋住（「知道了」按鈕壓在導覽列下面）。
                跟 LegalSheet 同一套做法。 */}
            {createPortal(
            <AnimatePresence>
                {macroInfo && MACRO_INFO[macroInfo] && (() => {
                    const info = MACRO_INFO[macroInfo];
                    const def = [...MACRO_DEFS, { key: 'fiber', color: '#5A7A3A' }, { key: 'water', color: '#5E86A8' }]
                        .find(d => d.key === macroInfo);
                    const accent = def?.color || '#F95C4B';
                    const value = macroInfo === 'fiber' ? Math.round(stats.fiber || 0) : Math.round(stats[macroInfo] || 0);
                    const goal = GOALS[macroInfo] || 0;
                    const unit = macroInfo === 'water' ? 'ml' : 'g';
                    return (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            style={{ zIndex: Z_SHEET }}
                            className="fixed inset-0 flex items-end justify-center bg-black/30 backdrop-blur-sm"
                            onClick={() => setMacroInfo(null)}
                        >
                            <motion.div
                                initial={{ y: 60, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: 60, opacity: 0 }}
                                transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                                style={{ background: '#F6F4F1', maxHeight: '82dvh', paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}
                                className="w-full max-w-sm rounded-t-[28px] overflow-y-auto"
                                onClick={e => e.stopPropagation()}
                            >
                                <div className="flex justify-center pt-3 pb-1">
                                    <div className="w-10 h-1 rounded-full" style={{ background: '#CFC6B8' }} />
                                </div>

                                {/* 頭：現況擺第一，說明擺第二 —— 他是先看到自己的數字才點進來的 */}
                                <div className="px-6 pt-4 pb-5" style={{ borderBottom: '1px solid #E4DED2' }}>
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.2em', color: '#CFC6B8', marginBottom: 6 }}>
                                                今日進度
                                            </p>
                                            <h3 style={{ fontSize: 22, fontWeight: 700, color: '#161415', fontFamily: "'Noto Sans TC', sans-serif" }}>
                                                {info.title}
                                            </h3>
                                        </div>
                                        <div className="text-right">
                                            <p className="tabular-nums" style={{ color: '#161415' }}>
                                                <span style={{ fontSize: 30, fontWeight: 300, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em', color: accent }}>{value}</span>
                                                <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.45, marginLeft: 4 }}>/ {goal} {unit}</span>
                                            </p>
                                        </div>
                                    </div>
                                    <div className="mt-4 h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'rgba(22,20,21,0.07)' }}>
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${pctOf(value, goal)}%` }}
                                            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                                            className="h-full rounded-full"
                                            style={{ background: accent }}
                                        />
                                    </div>
                                </div>

                                <div className="px-6 py-2">
                                    {[
                                        { k: '這是什麼', v: info.what },
                                        { k: '目標怎麼來的', v: info.goal },
                                        { k: '沒吃到會怎樣', v: info.miss },
                                    ].map(({ k, v }) => (
                                        <div key={k} className="py-4" style={{ borderBottom: '1px solid #E4DED2' }}>
                                            <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: accent, marginBottom: 6 }}>{k}</p>
                                            <p style={{ fontSize: 14, lineHeight: 1.75, color: 'rgba(22,20,21,0.72)', fontFamily: "'Noto Sans TC', sans-serif" }}>{v}</p>
                                        </div>
                                    ))}
                                </div>

                                <div className="px-6 pt-3">
                                    <motion.button
                                        type="button"
                                        onClick={() => { triggerHaptic('light'); setMacroInfo(null); }}
                                        whileTap={{ scale: 0.97 }}
                                        transition={{ type: 'spring', stiffness: 400, damping: 24 }}
                                        className="w-full rounded-[18px]"
                                        style={{ minHeight: 48, background: '#161415', color: '#F6F4F1', fontSize: 14, fontWeight: 700, border: 'none', fontFamily: "'Noto Sans TC', sans-serif" }}
                                    >
                                        知道了
                                    </motion.button>
                                </div>
                            </motion.div>
                        </motion.div>
                    );
                })()}
            </AnimatePresence>, document.body)}

            {/* copy-rules: allow-long — 點「圖表說明」才打開的彈窗，是查資料的地方，不是主畫面 */}
            {/* Explanation Modal — 瑞士極簡風格，涵蓋全部 6 張分析卡 */}
            <AnimatePresence>
                {showExplanation && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] flex items-end justify-center bg-black/30 backdrop-blur-sm"
                        onClick={() => setShowExplanation(false)}
                    >
                        <motion.div
                            initial={{ y: 60, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 60, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                            style={{ background: '#F6F4F1', maxHeight: '88dvh', paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
                            className="w-full max-w-sm rounded-t-[28px] overflow-y-auto"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Handle bar */}
                            <div className="flex justify-center pt-3 pb-1">
                                <div className="w-10 h-1 rounded-full" style={{ background: '#CFC6B8' }} />
                            </div>

                            {/* Header */}
                            <div className="flex justify-between items-center px-6 py-4" style={{ borderBottom: '1px solid #E4DED2' }}>
                                <div>
                                    <p className="text-[12px] font-black tracking-[0.04em]" style={{ color: '#CFC6B8' }}>深度分析 · 圖表說明</p>
                                    <h3 className="text-xl font-black" style={{ color: '#161415' }}>各卡片介紹</h3>
                                </div>
                                <motion.button {...pressProps('icon')}
 onClick={() => setShowExplanation(false)}
 className="w-8 h-8 flex items-center justify-center rounded-full"
 style={{ background: '#E4DED2' }}
 >
                                    <X size={14} style={{ color: '#161415' }} />
                                </motion.button>
                            </div>

                            {/* Cards */}
                            <div className="px-6 pt-4 space-y-0 divide-y" style={{ '--tw-divide-opacity': 1, borderColor: '#E4DED2' }}>
                                {[
                                    /* ⚠️ 這份說明「必須」跟實際渲染的卡片一一對應。
                                       稽核前它落後程式碼好幾版：
                                         · 少了最上面那張「減脂進度」（現在永遠顯示，卻沒人解釋）
                                         · 04 寫「7 日滾動均線」，但程式碼算的是前後各 3 天的置中平均，
                                           檔案裡甚至有註解說「寫成 7 日均線是不準的說法」——
                                           程式自己知道，說明書卻照舊騙人
                                         · 03 描述「滑桿左移右移、正方形指針」，那個 UI 早就被拿掉了
                                       改卡片就要回來改這裡，否則說明書會變成第二套事實。 */
                                    {
                                        accent: '#F95C4B',
                                        label: '01 · PROGRESS & PACING',
                                        title: '減脂／增重進度',
                                        desc: [
                                            '這張卡回答三件事：走到哪、走多快、還要多久。',
                                            '上半：從起點到現在移動了幾公斤、還剩多少、目前第幾週、預計哪天達標。',
                                            '下半（配速）：左邊是你設定的每週目標增減公斤數，右邊是實際的。有量過體重就用實測值並標「實測」，還沒量過才用熱量結餘推算並標「預估」—— 兩個差很多的時候你會知道是哪一種。最底下那句話是依照實際在發生的事給的調整建議。',
                                            '依據一律是實際量到的體重，不是熱量推算出來的預測值。沒量過就會顯示空狀態並提醒你去量，不會拿推估冒充事實。',
                                        ],
                                    },
                                    {
                                        accent: '#F95C4B',
                                        label: '02 · WEEKLY ADHERENCE',
                                        title: '七日執行報告',
                                        desc: '過去 7 天達標情況。珊瑚紅＝達標、石板＝接近、淺灰＝未達。',
                                    },
                                    {
                                        accent: '#F95C4B',
                                        label: '03 · DYNAMIC TDEE ENGINE', chartKey: 'nutritionTdee',
                                        title: '動態代謝估算',
                                        desc: [
                                            '採用 MacroFactor / Carbon 同款四大防呆法則，讓系統像有經驗的教練，而非冷酷的數學老師。',
                                            '🚫 Rule 1 忽略漏記天 — 低於 500 kcal 的天視為「忘記記錄」，不列入平均，避免 TDEE 因週末漏記而暴跌。',
                                            '⏸ Rule 2 信任度門檻 — 本週有效飲食天 < 4 或體重量測 < 2 次，系統直接凍結上週數值並顯示原因，而非亂算。',
                                            '📉 Rule 3 EMA 體重平滑 — 以指數移動平均（α=0.25）消除水分、排便造成的體重波動，再以能量守恆公式 TDEE = 平均攝入 − 每日體重變化 × 7700 算出真實消耗。',
                                            '🛡 Rule 4 BMR 安全網 — 不論怎麼算，TDEE 都不會低於 BMR × 1.1（你躺一整天的最低消耗），徹底杜絕 900 kcal 這種不可能的數字。',
                                        ],
                                    },
                                    {
                                        accent: '#F95C4B',
                                        label: '04 · DAILY TREND',
                                        title: '每日趨勢',
                                        desc: '柱狀＝當日攝取，折線＝走勢，虛線＝目標。可切換四種營養素。',
                                    },
                                    {
                                        accent: '#161415',
                                        label: '05 · CIRCADIAN RHYTHM', chartKey: 'nutritionMealTiming',
                                        title: '進食時鐘',
                                        desc: '一天 24 小時的進食分布，每點一次紀錄。中央為次數，右上為斷食時數。',
                                    },
                                    {
                                        accent: '#D94030',
                                        label: '06 · FOOD ROI',
                                        title: '食物 ROI 榜',
                                        desc: '今日蛋白質來源最高、脂肪來源最高的食物。',
                                    },
                                ]
                                    /* 🔬 關閉「進階圖表」時，03/04/06 這三張卡根本不會渲染。
                                       說明書卻照樣列出來，使用者會在畫面上找一張不存在的卡。
                                       說明只講看得到的東西。 */
                                    .filter(item => !item.chartKey || chartVis.visible(item.chartKey))
                                    .map(({ accent, label, title, desc }) => (
                                    <div key={title} className="py-5">
                                        <div className="flex items-start gap-3">
                                            <div className="w-0.5 self-stretch shrink-0 rounded-full mt-0.5" style={{ background: accent }} />
                                            <div className="flex-1">
                                                <p className="text-[9px] font-black uppercase tracking-[0.18em] mb-1" style={{ color: '#CFC6B8' }}>{label}</p>
                                                <p className="text-sm font-black mb-2" style={{ color: '#161415' }}>{title}</p>
                                                {/* desc 可以是字串或字串陣列（陣列時每項為一段落） */}
                                                {Array.isArray(desc) ? desc.map((line, i) => (
                                                    <p key={i} className="text-[12px] font-medium leading-relaxed mb-2 last:mb-0"
                                                        style={{ color: '#161415', opacity: 0.60 }}>{line}</p>
                                                )) : (
                                                    <p className="text-[12px] font-medium leading-relaxed" style={{ color: '#161415', opacity: 0.60 }}>{desc}</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            {/* copy-rules: end */}
            {/* 🗓️ 每 4 週回饋 */}
            <NutritionCheckpointSheet
                open={checkpointOpen && !!cpDue}
                userId={userId}
                plan={activePlan}
                block={cpDue}
                weightKg={realWeight}
                dailyKcal={GOALS.calories}
                onClose={() => { setCheckpointOpen(false); setCpVersion((v) => v + 1); }}
                onApplyPlan={(p) => handleSaveStrategy({ plan: p, programId: newProgramId() })}
                onOpenRecap={() => setShowPlanner(true)}
            />
            {/* 🔥 把這個掛在 NutritionPageMobile 元件回傳的最外層內部 */}
            <BodyRecompPlanner
                isOpen={showPlanner}
                onClose={() => {
                    setShowPlanner(false);
                    setPlannerEditOnOpen(false);
                    // 從「完整計劃」引導頁進來的 → 關掉策略面板就回那一頁繼續設定下一項
                    if (_focusSeed && location.state?.returnTo) navigate(location.state.returnTo);
                }}
                /* 起點一律用最近一次真實量測（realWeight 同一支）；
                   以前寫死 || 70，量到 65.2 的人，計劃起點還是 70。 */
                currentWeight={realWeight}
                profile={userProfile || {}}
                tdee={
                    // Priority: Dynamic TDEE (energy-balance) → Katch-McArdle/Mifflin → saved goal
                    (dynamicTDEEResult?.confidence === 'sufficient' && dynamicTDEEResult.tdee > 1000)
                        ? dynamicTDEEResult.tdee
                        : (nutritionPlan.tdee > 1000 ? nutritionPlan.tdee : (userGoals?.tdee || 0))
                }
                dynamicTDEEActive={dynamicTDEEResult?.confidence === 'sufficient'}
                onSave={handleSaveStrategy}
                userId={userId}
                activityBurn={workoutData?.totalBurn || 0}
                workoutData={workoutData}
                history={history}
                seedGoalType={_focusSeed?.goalType || null}
                openEditing={plannerEditOnOpen}
            />

            {/* ── 🌟 Starred Category Selection Modal — 鈦金屬瑞士高級雜誌質感 ── */}
            <AnimatePresence>
                {favCategorySelectFood && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
                        onClick={() => { setFavCategorySelectFood(null); setComboPendingLogData(null); }}
                    >
                        <motion.div
                            initial={{ scale: 0.96, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.96, opacity: 0, y: 20 }}
                            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                            className="bg-[#FAF8F5] rounded-[36px] p-7 w-full max-w-[290px] max-h-[90dvh] overflow-y-auto no-scrollbar relative shadow-[0_24px_60px_-10px_rgba(28,26,27,0.18)] border border-[#DCD6C8]"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Subtle metallic top sheen line */}
                            <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-[#E4DED2] to-transparent opacity-80" />

                            <div className="text-center mb-6">
                                <div className="w-12 h-12 rounded-full bg-[#F5F3EE] border border-[#E8E2D5] flex items-center justify-center mx-auto mb-3.5 shadow-sm">
                                    <span className="text-xl filter drop-shadow-sm">⭐</span>
                                </div>

                                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#262523]/40 mb-1" style={{ fontFamily: '"Tenor Sans", sans-serif' }}>
                                    Favorites Manager
                                </p>

                                <h3 className="text-lg font-black text-[#262523] tracking-tight" style={{ fontFamily: '"Tenor Sans", sans-serif' }}>
                                    {starredFoods.some(f => f.name === favCategorySelectFood.name) ? '修改收藏分類' : '選擇收藏分類'}
                                </h3>

                                <p className="text-[11px] text-[#262523]/40 mt-1.5 leading-relaxed font-bold max-w-[90%] mx-auto">
                                    {starredFoods.some(f => f.name === favCategorySelectFood.name) ? '請選擇此食物收藏的目標分類時段' : '請為此食物選擇要加入的時段'}
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mb-3.5">
                                {[
                                    { id: 'breakfast', label: '早餐', emoji: '🌅' },
                                    { id: 'lunch', label: '午餐', emoji: '☀️' },
                                    { id: 'dinner', label: '晚餐', emoji: '🍽' },
                                    { id: 'snacks', label: '點心', emoji: '☕' },
                                ].map(cat => (
                                    <motion.button {...pressProps('pill')}
 key={cat.id}
 type="button"
 onClick={() => { triggerHaptic('light'); completeCategoryStarredSave(cat.id); }}
 className="flex flex-col items-center justify-center gap-1.5 py-3.5 px-2 rounded-[18px] bg-[#F5F3EE] hover:bg-[#EAE5D8] border border-[#E8E2D5] hover:border-[#D8D2C4] text-[#262523] shadow-sm group"
 >
                                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm border border-black/5 group-hover:scale-105 transition-transform">
                                            <span className="text-lg">{cat.emoji}</span>
                                        </div>
                                        <span className="text-[9px] font-black tracking-widest mt-0.5">{cat.label}</span>
                                    </motion.button>
                                ))}
                            </div>

                            <motion.button {...pressProps('row')}
                                onClick={() => { triggerHaptic('medium'); completeCategoryStarredSave('all'); }}
                                className="w-full py-3.5 rounded-[18px] bg-[#262523] hover:bg-black text-white text-[12px] font-black tracking-[0.2em] transition-all shadow-md mb-2"
                            >
                                📁 不分類 (顯示於全部)
                            </motion.button>

                            {starredFoods.some(f => f.name === favCategorySelectFood.name) && (
                                <motion.button {...pressProps('row')}
                                    onClick={() => {
                                        setStarredFoods(prev => prev.filter(f => f.name !== favCategorySelectFood.name));
                                        setFavCategorySelectFood(null);
                                        setComboPendingLogData(null);
                                        triggerHaptic('medium');
                                    }}
                                    className="w-full py-3.5 rounded-[18px] bg-[#F95C4B]/10 hover:bg-[#F95C4B]/15 text-[#F95C4B] text-[12px] font-black tracking-[0.2em] transition-all border border-[#F95C4B]/25 mb-2"
                                >
                                    ❌ 移出常用收藏
                                </motion.button>
                            )}

                            <motion.button {...pressProps('cta')}
                                onClick={() => { setFavCategorySelectFood(null); setComboPendingLogData(null); triggerHaptic('light'); }}
                                className="w-full py-2.5 text-[#262523]/40 text-[12px] font-black tracking-[0.25em] hover:text-[#262523] transition-colors mt-2"
                            >
                                取消
                            </motion.button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default NutritionPageMobile;
