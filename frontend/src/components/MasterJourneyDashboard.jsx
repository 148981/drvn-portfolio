/**
 * ══════════════════════════════════════════════════════════════
 * MASTER JOURNEY DASHBOARD — Magazine Bento v3
 * ══════════════════════════════════════════════════════════════
 * Layout ref: image-2 oil spa — hero card + magazine grid
 * - Training: volume this week vs last week
 * - Cardio KM + Burn: WoW delta, artistic comparison
 * - Calories / Protein: avg from nutrition API vs goal
 * - Monthly InBody: delta badges
 * ══════════════════════════════════════════════════════════════
 */

import './MasterJourneyDashboard.css';
import { bodyMeasurementPair, dashboardWeekWindow, inDashboardWeek, localRecordDate, nutritionWeekAverage, positiveGoal } from '../utils/journeyDashboardSummary';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { readJSON } from '../utils/safeStorage';
import { useNavigate } from 'react-router-dom';
import { useAdvancedMode } from '../utils/advancedMode';
import {
    motion,
    AnimatePresence,
    useAnimationFrame,
    useMotionTemplate,
    useMotionValue,
    useTransform,
    Reorder,           // 🔥 新增：最強的彈簧排版陣列
    useDragControls    // 🔥 新增：手動拖曳控制器
} from 'framer-motion';
import { Flame, Utensils, Activity, Moon, Play, ArrowRight, ArrowLeft, Plus, Scale, BarChart3, TrendingUp, CheckCircle2, Check, Layers, Trash2, Pencil, Camera, GripVertical, // 🔥 新增：拖曳握把圖示
    ChevronDown, RefreshCw } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import { getWorkoutHistory, getCardioRuns, getNutritionHistory } from '../api/client';
import apiClient from '../api/client';
import CardioBrickDetailSheet from './CardioBrickDetailSheet';
import WorkoutPreviewSheet from './WorkoutPreviewSheet';
import FirstTimeHint from './FirstTimeHint';
import JourneySinceCard from './JourneySinceCard';
import CompletePlanEntryCard from './CompletePlanEntryCard';
import { readPlanProgress, planShape } from '../utils/specialPlanProgress';
import { getUserId } from '../utils/auth';
import { getDisplayName } from '../utils/socialIdentity';
import { displayPlanName } from '../utils/planNaming';
import { getTodayAgenda, loadWeekInputs, cacheWeekBricks, applyTodayRealDone, logicalDayKey } from '../utils/dailyAgenda';
import { titleForRun } from '../utils/runDistanceClass';
import { getWorkoutHeroTheme } from '../utils/workoutHeroMapping';
import { estimateDayMinutes } from '../utils/workoutTimeEstimate';
import DailyGoalCelebration from './DailyGoalCelebration';
import { SHOULDER_ARM_PLAN } from '../data/shoulderArmPlanData';
import { CHEST_PLAN } from '../data/chestPlanData';
import { LEG_PLAN } from '../data/legPlanData';
import { GLUTE_PLAN } from '../data/glutePlanData';
import { FULLBODY_PLAN } from '../data/fullbodyPlanData';
import { BACK_PLAN } from '../data/backPlanData';
import { CORE_PLAN } from '../data/corePlanData';
// ── 課程系統（2026-08 改版）：六組課程取代原本七張單部位卡 ──
// 舊的 *_PLAN 仍保留 import：融合功能與 globalExerciseRegistry 依賴它們
import { IRON_BASE_PLAN } from '../data/ironBasePlanData';
import { V_TAPER_PLAN } from '../data/vTaperPlanData';
import { PEACH_SUIT_PLAN } from '../data/peachSuitPlanData';
import { LEAN_LIGHT_PLAN } from '../data/leanLightPlanData';
import { RUNNERS_ARMOR_PLAN } from '../data/runnersArmorPlanData';
import { HYROX_PLAN } from '../data/hyroxPlanData';
import { fuseWorkoutPlans } from '../utils/planFusionEngine';
import { uStorage } from '../utils/userStorage';
import { confirmDialog } from '../utils/toast';
import { haptic } from '../utils/haptics';
import { ensureAuthBeforeFetch } from '../utils/guestAuth';
import { totalVolume as sumSets } from '../utils/strengthMath';
import { mediaUrl } from '../utils/apiHostFix';


// ════════════════════════════════════════
// TOKENS
// ════════════════════════════════════════
const C = {
    page: '#F6F4F1',
    paper: '#F6F4F1',   // Paper
    stone: '#E4DED2',   // Stone
    pebble: '#CFC6B8',  // Pebble
    coral: '#F95C4B',   // Coral
    ember: '#D94030',   // Ember
    black: '#161415',   // Deep Black

    textPrimary: '#161415', // Deep Black
    textMuted: 'rgba(22,20,21,0.5)',
    textDim: 'rgba(22,20,21,0.3)',
    textHero: '#F6F4F1',

    red: '#F95C4B',
    green: '#5A7A3A',   // Olive — 成功色保持暖調，不用通用綠
};

const TEXTURES = {
    // ─── SWISS-NOIR TITANIUM SUITE (Figure 2 Unified Palette) ───
    titaniumMist: 'linear-gradient(135deg, #F6F4F1 0%, #FFFFFF 45%, #E4DED2 50%, #F6F4F1 100%)', // Paper/Stone Gloss
    titaniumPebble: 'linear-gradient(135deg, #BDB2A2 0%, #F6F4F1 45%, #DED9CF 50%, #BDB2A2 100%)', // Pebble Gloss
    titaniumObsidian: 'linear-gradient(135deg, #161415 0%, #323031 45%, #262523 50%, #161415 100%)', // Deep Black Gloss
    titaniumCoral: 'linear-gradient(135deg, #FF7A6B 0%, #F95C4B 45%, #D94030 50%, #FF7A6B 100%)', // Coral Gloss

    wood: `
        repeating-linear-gradient(to right, 
            #A67C52 0px, #A67C52 48px, 
            rgba(246,244,241,0.15) 48.5px, rgba(246,244,241,0.15) 49px
        ),
        #8B5E3C
    `,
    woodLight: 'url("/desktop/666.jpeg")',
    woodOverlay: 'linear-gradient(to bottom, rgba(0,0,0,0.15), rgba(0,0,0,0.35))',
    satinSilver: 'linear-gradient(135deg, #B8B8B8 0%, #EBEBEB 30%, #FFFFFF 50%, #EBEBEB 70%, #B8B8B8 100%)',
};

// ════════════════════════════════════════
// MICRO COMPONENTS
// ════════════════════════════════════════
// 📈 數字滾動上升 — 慶祝特效用（重訓卡的總容量）。
//    用 rAF + easeOutCubic，1.3 秒內從 0 跑到真實值；prefers-reduced-motion
//    或數值為 0 時直接顯示終值，不做無意義的動畫。
const CountUpNumber = ({ to = 0, duration = 1.2 }) => {
    const target = Number(to) || 0;
    const [val, setVal] = React.useState(() => {
        if (typeof window === 'undefined') return target;
        return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? target : 0;
    });
    React.useEffect(() => {
        if (!(target > 0)) { setVal(target); return; }
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) { setVal(target); return; }
        let raf;
        const t0 = performance.now();
        const ms = Math.max(200, duration * 1000);
        const tick = (now) => {
            const p = Math.min(1, (now - t0) / ms);
            const eased = 1 - Math.pow(1 - p, 3);       // easeOutCubic
            setVal(Math.round(target * eased));
            if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => raf && cancelAnimationFrame(raf);
    }, [target, duration]);
    return <>{val.toLocaleString()}</>;
};

const Lbl = ({ c, children, style = {} }) => (
    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', color: c || C.textMuted, ...style }}>
        {children}
    </span>
);

const Bar = ({ value, max, color, h = 4, bg }) => {
    const pct = max > 0 ? Math.min(value / max, 1) : 0;
    return (
        <div style={{ width: '100%', height: h, borderRadius: 99, background: bg || 'rgba(246,244,241,0.08)', overflow: 'hidden', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)' }}>
            <motion.div
                style={{
                    height: '100%',
                    borderRadius: 99,
                    background: color || TEXTURES.titaniumMist,
                    transformOrigin: 'left',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 1px 3px rgba(0,0,0,0.1)'
                }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: pct }}
                transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            />
        </div>
    );
};

// WoW delta pill
const WowDelta = ({ curr, prev, unit = '', invertGood = false, color }) => {
    if (prev === null || prev === undefined) return null;
    const diff = curr - prev;
    if (diff === 0) return <span style={{ fontSize: 11, color: color || C.textMuted, fontWeight: 700 }}>→ same</span>;
    const isPos = diff > 0;
    const isGood = invertGood ? !isPos : isPos;
    return (
        <span style={{ fontSize: 11, fontWeight: 800, color: isGood ? C.green : C.red, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            {isPos ? '↑' : '↓'}{Math.abs(diff).toFixed(unit === 'km' ? 1 : 0)}{unit}
            <span style={{ fontSize: 11, color: color || C.textMuted, fontWeight: 600 }}> vs last wk</span>
        </span>
    );
};

// ── Jelly Liquid Glass 材質庫（對齊 QUICK START 按鈕的果凍玻璃）──
// 果凍玻璃三要素：① 頂部大面積柔光 bloom（radial，像光從上方打進玻璃內部）
//               ② 底部厚實內陰影（玻璃的「厚度」）
//               ③ tint 同色系的柔軟外投影（浮起來的軟感）。
// tint 不透明度拉高（0.88–0.96），每張卡的顏色才會清楚分開，不會全部糊成底色。
const GLASS = {
    frost: { // 霜白玻璃 — 恢復 / 燃燒（淡雅、透出背景光）
        bg: 'linear-gradient(180deg, rgba(255,255,255,0.58) 0%, rgba(250,247,242,0.42) 100%)',
        blur: 'blur(24px) saturate(140%)',
        border: '1px solid rgba(255,255,255,0.65)',
        shadow: 'inset 0 1.5px 4px rgba(255,255,255,0.85), inset 0 -8px 18px rgba(186,170,148,0.16), 0 16px 36px -16px rgba(22,20,21,0.16)',
        specular: 'radial-gradient(130% 100% at 50% -30%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.14) 42%, rgba(255,255,255,0) 68%)',
    },
    coral: { // 淡珊瑚玻璃 — 本週訓練量（全畫面唯一 Coral 焦點，像 QUICK START 的淡鮭粉）
        bg: 'linear-gradient(180deg, rgba(250,138,118,0.62) 0%, rgba(243,110,92,0.56) 55%, rgba(236,98,82,0.60) 100%)',
        blur: 'blur(22px) saturate(145%)',
        border: '1px solid rgba(255,255,255,0.45)',
        shadow: 'inset 0 1.5px 4px rgba(255,255,255,0.45), inset 0 -8px 18px rgba(168,44,34,0.18), 0 18px 38px -16px rgba(226,96,84,0.38)',
        specular: 'radial-gradient(130% 100% at 50% -30%, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.12) 42%, rgba(255,255,255,0) 68%)',
    },
    dark: { // 墨黑玻璃 — 有氧（半透讓光透進來，輕盈不厚重）
        /* base：不透明底色。玻璃的漸層是半透明的，瀏覽器若不支援 backdrop-filter、
           或父層有 filter 讓它失效，這張卡就會變成淺色 —— 而文字是為深底配的淺色，
           結果是「白底白字」整塊看不見。有了 base，最差情況也還是深色卡。 */
        base: '#262327',
        bg: 'linear-gradient(180deg, rgba(48,44,45,0.80) 0%, rgba(22,20,21,0.74) 100%)',
        blur: 'blur(22px) saturate(130%)',
        border: '1px solid rgba(255,255,255,0.16)',
        shadow: 'inset 0 1.5px 4px rgba(255,255,255,0.16), inset 0 -8px 18px rgba(0,0,0,0.28), 0 18px 38px -16px rgba(0,0,0,0.30)',
        specular: 'radial-gradient(130% 100% at 50% -30%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.06) 40%, rgba(255,255,255,0) 65%)',
    },
    pebble: { // 淡柔金玻璃 — 熱量（淡香檳，不厚重）
        bg: 'linear-gradient(180deg, rgba(228,208,170,0.52) 0%, rgba(212,197,165,0.40) 100%)',
        blur: 'blur(24px) saturate(135%)',
        border: '1px solid rgba(255,255,255,0.58)',
        shadow: 'inset 0 1.5px 4px rgba(255,255,255,0.70), inset 0 -8px 18px rgba(150,126,86,0.16), 0 16px 36px -16px rgba(150,126,86,0.22)',
        specular: 'radial-gradient(130% 100% at 50% -30%, rgba(255,255,255,0.50) 0%, rgba(255,255,255,0.14) 42%, rgba(255,255,255,0) 68%)',
    },
    mist: { // 淡冷灰玻璃 — 蛋白質（微冷調，輕輕跟暖色分開）
        bg: 'linear-gradient(180deg, rgba(234,238,236,0.58) 0%, rgba(220,226,224,0.44) 100%)',
        blur: 'blur(24px) saturate(120%)',
        border: '1px solid rgba(255,255,255,0.62)',
        shadow: 'inset 0 1.5px 4px rgba(255,255,255,0.80), inset 0 -8px 18px rgba(128,142,138,0.14), 0 16px 36px -16px rgba(96,110,106,0.18)',
        specular: 'radial-gradient(130% 100% at 50% -30%, rgba(255,255,255,0.52) 0%, rgba(255,255,255,0.14) 42%, rgba(255,255,255,0) 68%)',
    },
};

// Editorial Tile Base — Apple Liquid Glass
const Tile = ({ bg, border, glass, onClick, children, style = {}, className = '' }) => {
    // 舊 API 相容：bg=C.coral 自動映射到 coral 玻璃
    let variant = glass;
    if (!variant) {
        if (bg === C.coral || bg === C.ember) variant = 'coral';
        else if (!className) variant = 'frost';
    }
    const g = variant ? GLASS[variant] : null;

    return (
        <motion.div
            className={`journey-tile ${className}`}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            onKeyDown={onClick ? (event) => {
                if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onClick(); }
            } : undefined}
            whileTap={onClick ? { scale: 0.97 } : {}}
            onClick={onClick}
            style={{
                backgroundColor: g?.base,
                backgroundImage: g?.bg,
                backdropFilter: g ? g.blur : undefined,
                WebkitBackdropFilter: g ? g.blur : undefined,
                border: border ? `1px solid ${border}` : g?.border,
                borderRadius: 24,
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                cursor: onClick ? 'pointer' : 'default',
                overflow: 'hidden',
                position: 'relative',
                boxShadow: g?.shadow,
                ...style,
            }}
        >
            {/* 鏡面高光 sweep — 玻璃頂緣受光 */}
            {g && (
                <div aria-hidden style={{
                    position: 'absolute', inset: 0, pointerEvents: 'none',
                    background: g.specular,
                    borderRadius: 'inherit',
                }} />
            )}
            {/* 底部微反射 — 玻璃厚度感 */}
            {g && (
                <div aria-hidden style={{
                    position: 'absolute', left: '8%', right: '8%', bottom: 0, height: 1.5, pointerEvents: 'none',
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)',
                }} />
            )}
            {children}
        </motion.div>
    );
};

// Arc gauge — Liquid Glass 儀表：玻璃圓盤底 + 漸層弧 + 弧光暈染
const Arc = ({ value, max, size = 60, color, textColor }) => {
    const r = (size - 10) / 2;
    const c2 = 2 * Math.PI * r;
    const pct = Math.min(value / max, 1);
    const gid = React.useId();
    return (
        <div style={{ position: 'relative', width: size, height: size }}>
            {/* 玻璃圓盤 — 儀表本體是一塊小玻璃 */}
            <div aria-hidden style={{
                position: 'absolute', inset: 5, borderRadius: '50%',
                background: 'linear-gradient(160deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.10) 100%)',
                backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.55)',
                boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.85), inset 0 -2px 5px rgba(22,20,21,0.08)',
            }} />
            <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', position: 'relative' }}>
                <defs>
                    <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={color} stopOpacity="1" />
                        <stop offset="100%" stopColor="#D94030" stopOpacity="0.85" />
                    </linearGradient>
                </defs>
                {/* 內凹玻璃軌道 */}
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(22,20,21,0.10)" strokeWidth={5} />
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
                {/* 進度弧 — 漸層 + 光暈，像玻璃裡透出的燈絲 */}
                <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${gid})`} strokeWidth={5} strokeLinecap="round"
                    strokeDasharray={c2}
                    initial={{ strokeDashoffset: c2 }}
                    animate={{ strokeDashoffset: c2 - pct * c2 }}
                    transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1] }}
                    style={{ filter: `drop-shadow(0 0 5px ${color}88)` }}
                />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 900, color: textColor || C.textPrimary, fontFamily: '"Tenor Sans", sans-serif', lineHeight: 1 }}>{value}</span>
            </div>
        </div>
    );
};

// ════════════════════════════════════════
// PLAN FUSION HELPERS
// ════════════════════════════════════════

// Extract top N exercises from plan's week-1 beginner level across all days.
// Preserves `target` so buildFusedPlan can route arm exercises correctly.
const getTopExercises = (plan, maxPerPlan = 4) => {
    try {
        const week1 = plan?.levels?.beginner?.weeks?.[0];
        if (!week1?.days) return [];
        const seen = new Set();
        const result = [];
        for (const day of week1.days) {
            for (const ex of (day.exercises || [])) {
                if (!ex?.name || seen.has(ex.name)) continue;
                seen.add(ex.name);
                result.push({
                    name: ex.name,
                    nameEn: ex.nameEn || ex.name,
                    sets: ex.sets || 3,
                    reps: typeof ex.reps === 'number' ? String(ex.reps) : (ex.reps || '10-12'),
                    rest: ex.rest || 60,
                    target: ex.target || '',  // critical for arm plan routing
                    ...(ex.note ? { note: ex.note } : {}),
                });
                if (result.length >= maxPerPlan) return result;
            }
        }
        return result;
    } catch (_) { return []; }
};

// Build a PPL-structured merged plan from an array of selected phase objects
// Each phase has: { plan, isChest, isShoulder, isBack, isLeg, isGlute, isFullBody, title }
const buildFusedPlan = (pickedPhases) => {
    const pushExes = [], pullExes = [], legsExes = [];

    pickedPhases.forEach(phase => {
        if (phase.isChest || phase.isShoulder) {
            // Chest/Shoulder → all push (compound first, 3 exercises)
            pushExes.push(...getTopExercises(phase.plan, 3));

        } else if (phase.isBack) {
            // Back → all pull
            pullExes.push(...getTopExercises(phase.plan, 3));

        } else if (phase.isLeg || phase.isGlute) {
            // Legs/Glutes → all legs
            legsExes.push(...getTopExercises(phase.plan, 3));

        } else if (phase.isFullBody) {
            // Full body → distribute evenly across 3 days
            const exes = getTopExercises(phase.plan, 6);
            exes.forEach((ex, ei) => {
                if (ei % 3 === 0) pushExes.push(ex);
                else if (ei % 3 === 1) pullExes.push(ex);
                else legsExes.push(ex);
            });

        } else {
            // SHOULDER_ARM_PLAN or CORE_PLAN — use target field to correctly route:
            // '二頭' / '肱肌' → Pull (biceps day)
            // '三頭'          → Push (triceps with chest/shoulder)
            // Default (no target) → Pull
            const exes = getTopExercises(phase.plan, 6); // extract more for both days
            exes.forEach(ex => {
                const t = ex.target || '';
                if (t.includes('三頭') || t.toLowerCase().includes('tricep') || t.includes('三角肌') || t.toLowerCase().includes('shoulder')) {
                    pushExes.push(ex);
                } else if (t.includes('腹') || t.includes('核心') || t.toLowerCase().includes('abs') || t.toLowerCase().includes('core')) {
                    // Core exercises → route to legs day (usually where core is placed)
                    legsExes.push(ex);
                } else {
                    // biceps, brachialis, or unspecified → pull day
                    pullExes.push(ex);
                }
            });
        }
    });

    // Build day templates (only include days that have exercises)
    const dayTemplates = [];
    const DAY_META = [
        { weekday: 'MON', label: '週一' },
        { weekday: 'WED', label: '週三' },
        { weekday: 'FRI', label: '週五' },
        { weekday: 'SAT', label: '週六' },
    ];
    if (pushExes.length > 0)
        dayTemplates.push({ focus: 'Push — 胸 / 肩 / 三頭', exercises: pushExes.slice(0, 5) });
    if (pullExes.length > 0)
        dayTemplates.push({ focus: 'Pull — 背 / 二頭', exercises: pullExes.slice(0, 5) });
    if (legsExes.length > 0)
        dayTemplates.push({ focus: 'Legs — 腿 / 臀', exercises: legsExes.slice(0, 5) });
    if (dayTemplates.length === 0)
        dayTemplates.push({ focus: '全身訓練', exercises: [...pushExes, ...pullExes, ...legsExes].slice(0, 6) });

    // 4-week PPL periodization (mirrors UnifiedTrainingEngine PHASES)
    const WEEK_THEMES = [
        { weekNumber: 1, name: '基礎建立週 — 動作熟悉', mult: 1.0, intensify: false },
        { weekNumber: 2, name: '訓練量累積週 — 增加容量', mult: 1.15, intensify: false },
        { weekNumber: 3, name: '強化突破週 — 衝刺強度', mult: 1.0, intensify: true },
        { weekNumber: 4, name: '減量恢復週 — 超補償', mult: 0.65, intensify: false },
    ];

    const weeks = WEEK_THEMES.map(wt => ({
        weekNumber: wt.weekNumber,
        name: wt.name,
        days: dayTemplates.map((dt, di) => ({
            dayNumber: di + 1,
            weekday: (DAY_META[di] || DAY_META[0]).weekday,
            focus: dt.focus,
            time: Math.round(dt.exercises.length * 8 + 11),
            exercises: dt.exercises.map(ex => {
                const sets = Math.max(2, Math.round((ex.sets || 3) * wt.mult));
                let reps = ex.reps || '10-12';
                if (wt.intensify && typeof reps === 'string' && reps.includes('-')) {
                    const parts = reps.split('-').map(r => parseInt(r) || 10);
                    reps = `${Math.max(3, parts[0] - 2)}-${Math.max(5, parts[1] - 3)}`;
                }
                return { ...ex, sets, reps };
            }),
        })),
    }));

    const planNames = pickedPhases
        .map(p => (p.title || p.plan?.name || '').split('：')[0])
        .filter(Boolean).join(' × ');

    // Add nameEn fallback so PlanPreviewPage's unique exercise counter works
    const weeksWithNameEn = weeks.map(wk => ({
        ...wk,
        days: wk.days.map(d => ({
            ...d,
            exercises: d.exercises.map(ex => ({ ...ex, nameEn: ex.nameEn || ex.name })),
        })),
    }));

    // Build the single level (fusion plans don't have beginner/intermediate/advanced —
    // intensity is determined by the source plans, not a separate level picker)
    const fusionLevel = {
        key: 'fusion',
        label: `${pickedPhases.length} 計劃融合`,
        frequencyLabel: `每週 ${dayTemplates.length} 天`,
        durationPerSession: dayTemplates.length >= 3 ? '45-60' : '35-50',
        equipment: ['依各原計劃器材'],
        targetArea: dayTemplates.map(d => d.focus.split('—')[0].trim()).join(' / '),
        expectedGain: '多目標同步進步，4 週線性週期化，PPL 分化確保肌群恢復',
        benefits: [
            `整合「${planNames}」精華動作，各計劃取 2–3 個核心動作避免過量。`,
            `PPL ${dayTemplates.length} 日分化結構，各肌群每週有足夠頻率且充分恢復。`,
            '4 週線性週期：基礎建立 → 量累積 → 強度突破 → 減量超補償。',
        ],
        periodization: {
            phase1: { name: '基礎建立期', weeks: '第 1 週', focus: '動作熟悉、建立神經肌肉連結', reps: '標準次數', intensity: 'RPE 6-7' },
            phase2: { name: '訓練量累積期', weeks: '第 2 週', focus: '增加組數，提升訓練容量', reps: '+15% 組數', intensity: 'RPE 7-8' },
            phase3: { name: '強化突破期', weeks: '第 3 週', focus: '降低次數衝刺重量', reps: '3–5 / 6–8 下', intensity: 'RPE 8-9' },
            phase4: { name: '減量超補償期', weeks: '第 4 週', focus: '恢復與超補償，保持動作品質', reps: '標準次數', intensity: 'RPE 5-6' },
        },
        weeks: weeksWithNameEn,
    };

    return {
        id: `fusion_${Date.now()}`,
        name: '智能融合計劃',
        isFusion: true,
        fusionSubtitle: planNames,
        fusionCount: pickedPhases.length,
        bodyPart: 'fusion',
        bodyPartLabel: `${pickedPhases.length} 計劃融合`,
        duration: 28,
        tags: ['PPL 分化', '多部位整合', '智能排程', '4 週週期'],
        description: `整合「${planNames}」的精華動作，以 PPL 分化架構重新組合。每個計劃取核心動作配合 4 週線性週期化，讓多個訓練目標同時推進，不互相干擾。`,
        // Single level only — fusion plans don't split into beginner/intermediate/advanced
        levels: { fusion: fusionLevel },
    };
};

// 🍎 APPLE-LIKE DRAGGABLE CARD COMPONENT (V4 - 精準邊緣滾動版)
const DraggableCardItem = ({ entry, carouselRef, children }) => {
    const controls = useDragControls();
    const [isDragging, setIsDragging] = useState(false);
    const pointerX = useRef(0); // 追蹤手指在全螢幕的 X 座標

    // 🔥 邊緣滾動引擎：當卡片被抓起時觸發
    useEffect(() => {
        if (!isDragging) return;

        let animationFrameId;
        const scrollContainer = carouselRef.current;
        if (!scrollContainer) return;

        const scrollLoop = () => {
            const threshold = 70; // 觸發滾動的邊界寬度 (px)
            const maxSpeed = 10;  // 滾動速度
            const { clientWidth } = document.documentElement; // 取得手機螢幕總寬

            // 如果手指靠近左邊緣
            if (pointerX.current < threshold) {
                scrollContainer.scrollLeft -= maxSpeed;
            }
            // 如果手指靠近右邊緣
            else if (pointerX.current > clientWidth - threshold) {
                scrollContainer.scrollLeft += maxSpeed;
            }
            animationFrameId = requestAnimationFrame(scrollLoop);
        };

        animationFrameId = requestAnimationFrame(scrollLoop);
        return () => cancelAnimationFrame(animationFrameId);
    }, [isDragging, carouselRef]);

    return (
        <Reorder.Item
            value={entry}
            dragListener={false} // 🔥 關鍵：關閉全卡片抓取，讓列表可以自由滑動
            dragControls={controls}
            onDragStart={() => setIsDragging(true)}
            onDragEnd={() => {
                setIsDragging(false);
                pointerX.current = 0;
            }}
            // 🔥 更新手指位置到 Ref，供滾動引擎讀取
            onDrag={(event, info) => {
                pointerX.current = info.point.x;
            }}
            style={{
                position: 'relative',
                flexShrink: 0,
                zIndex: isDragging ? 100 : 1,
            }}
        >
            {children(controls, isDragging)}
        </Reorder.Item>
    );
};

// ════════════════════════════════════════
// ROADMAP CAROUSEL COMPONENT
// ════════════════════════════════════════
const PlanRoadmapCarousel = ({ userId, fusionMode, setFusionMode, selectedIdxs, setSelectedIdxs }) => {
    const navigate = useNavigate();
    const advancedMode = useAdvancedMode(); // 進階模式才顯示融合入口
    const [savedFusionCards, setSavedFusionCards] = useState([]);
    const [editMode, setEditMode] = useState(false);
    const [cardOrder, setCardOrder] = useState([]);

    const [planCoverImages, setPlanCoverImages] = useState({});

    const fileInputsRef = useRef({});
    const carouselRef = useRef(null);
    const MAX_FUSION = 3;

    const springConfig = { type: "spring", stiffness: 350, damping: 30, mass: 1 };

    // 📐 進度改讀 utils/specialPlanProgress（單一真相源）：
    //    · per-user key（舊的無前綴 key 會自動遷移，換帳號不再串進度）
    //    · 分母一律從計劃結構算，算不出來就是 null —— 不再用寫死的 12 當假分母
    const uidForPlans = userId || getUserId();
    const getPlanStats = (plan) => {
        const { done, total } = readPlanProgress(uidForPlans, plan, 'beginner');
        return { done, total };
    };

    const phases = [
        // ══════════════════════════════════════════════════════════════
        //  課程陣容（2026-08 改版）— 六組課程取代原本七張單部位卡。
        //  排序刻意把「全身力量基礎」放第一：它是新手的預設入口。
        //  舊卡的 *PlanData.js 全部保留，只是不再出現在這個陣列裡
        //  （globalExerciseRegistry 與融合功能仍依賴它們）。
        //
        //  isFullBody / isLeg / isUpper 供 buildFusedPlan 路由；
        //  noFusion 標記混合課程 —— 它們帶跑步處方，融合只處理重訓，
        //  選進去會把跑步那一半靜默丟掉。
        // ══════════════════════════════════════════════════════════════
        { days: "8 WEEKS", title: "全身力量基礎", desc: "深蹲、臥推、硬舉三個動作打底。前兩週用啞鈴把動作做對，第三週才上槓鈴。", bg: "url('/desktop/Gemini_Generated_Image_i9cnrki9cnrki9cn.png')", color: "#F6F4F1", isCompleted: false, isFullBody: true, isIronBase: true, level: "beginner", plan: IRON_BASE_PLAN, material: "titanium" },
        { days: "8 WEEKS", title: "上半身線條", desc: "練肩膀側面和背闊肌，讓肩看起來更寬、腰看起來更窄。", bg: "url('/desktop/Gemini_Generated_Image_hd8zwuhd8zwuhd8z.png')", color: "#F6F4F1", isCompleted: false, isUpper: true, isVTaper: true, level: "beginner", plan: V_TAPER_PLAN, material: "titanium" },
        { days: "8 WEEKS", title: "翹臀訓練", desc: "用三種角度分開練臀，每次訓練前先做五分鐘臀部熱身。", bg: "url('/desktop/Gemini_Generated_Image_f5fhhcf5fhhcf5fh.png')", color: "#F6F4F1", isCompleted: false, isGlute: true, isPeach: true, level: "beginner", plan: PEACH_SUIT_PLAN, material: "wood" },
        { days: "6 WEEKS", title: "減脂：跑步＋輕重訓", desc: "跑步負責減脂，輕量重訓保住線條。新手每次不超過三十分鐘。", bg: "url('/desktop/Gemini_Generated_Image_3bwypz3bwypz3bwy.png')", color: "#F6F4F1", isCompleted: false, isFullBody: true, isLeanLight: true, noFusion: true, level: "beginner", plan: LEAN_LIGHT_PLAN, material: "carbon" },
        { days: "6 WEEKS", title: "跑者肌力", desc: "給已經有在跑步的人。重訓繞著你原本的跑步課表排，目標是不受傷。", bg: "url('/desktop/back_portrait.png')", color: "#F6F4F1", isCompleted: false, isLeg: true, isArmor: true, noFusion: true, level: "beginner", plan: RUNNERS_ARMOR_PLAN, material: "carbon" },
        { days: "8 WEEKS", title: "混合體能：跑步＋負重", desc: "跑一段、扛一段，交替八輪。練的是喘的時候動作還能不能做好。", bg: "url('/desktop/Gemini_Generated_Image_o6ou6wo6ou6wo6ou.png')", color: "#F6F4F1", isCompleted: false, isFullBody: true, isHyrox: true, noFusion: true, level: "beginner", plan: HYROX_PLAN, material: "wood" },
    ].map(p => {
        const stats = getPlanStats(p.plan);
        const progress = stats.total > 0 ? Math.min(1, stats.done / stats.total) : 0;
        let isActive = progress > 0 && progress < 1;
        
        // Also check if this plan is the globally active plan in localStorage.
        // 比對放寬：id 或 名稱任一吻合都算「執行中」，避免開始計劃後存的 id
        // 與卡片 plan.id 不一致時偵測不到（導致專項欄沒收合）。
        try {
            const pr = localStorage.getItem(`currentPlan_${getUserId()}`);
            if (pr) {
                const parsed = JSON.parse(pr);
                /* ⚠️ 課程改名之後，「靠名字認出是同一份計劃」就會失效：
                   啟用課程時存的 plan_id 是一次性的 program id（`<uuid>:strength`），
                   跟卡片的 p.plan.id（`iron-base-56`）本來就對不上，
                   所以這裡實際上一直是靠名字在比 —— 改一次名，執行中的人就全部變成沒在執行。
                   prepareCourseProgram 存了 source_course.id，那才是這份計劃真正的出處。 */
                const sourceCourseId = parsed.source_course?.id;
                const activePlanId = parsed.plan_id || parsed.id;
                const activePlanName = parsed.name || parsed.plan_name;
                const cardName = p.plan.name || p.plan.plan_name || p.title;
                if ((sourceCourseId && p.plan.id === sourceCourseId) ||
                    (activePlanId && p.plan.id === activePlanId) ||
                    (activePlanName && cardName && activePlanName === cardName)) {
                    isActive = true;
                }
            }
        } catch(e) {}
        
        // 抬頭與進度用同一份結構算，兩個數字不可能再打架
        const shape = planShape(p.plan, 'beginner');
        const progressText = stats.total
            ? `${stats.done}/${stats.total} 次`
            : '尚未排定';
        const durationText = shape.weeks ? `${shape.weeks} 週 · ${shape.sessions} 次` : '';
        return { ...p, isActive, progress, progressText, durationText };
    });

    // ── Load covers from backend (persistent across sessions) ──
    useEffect(() => {
        const uid = userId || getUserId();
        fetch(`http://${window.location.hostname}:8000/api/plan-covers/${uid}`)
            .then(r => r.ok ? r.json() : { covers: {} })
            .then(data => {
                if (!data.covers) return;
                // Backend key format: "plan_{planId}" or "fusion_{fusionId}"
                // State key format for phase plans: just "{planId}" (matches card.plan.id)
                // State key for fusions: "fusion_{id}" (matches lookup below)
                const planCovers = {};
                const fusionCovers = {};
                Object.entries(data.covers).forEach(([k, v]) => {
                    const url = v.startsWith('/static')
                        ? mediaUrl(v) : v;
                    if (k.startsWith('plan_')) planCovers[k.slice(5)] = url;
                    else if (k.startsWith('fusion_')) fusionCovers[k.slice(7)] = url;
                });
                if (Object.keys(planCovers).length > 0)
                    setPlanCoverImages(planCovers);
                // Inject fusion covers into savedFusionCards
                if (Object.keys(fusionCovers).length > 0) {
                    setSavedFusionCards(prev => prev.map(fc => {
                        const url = fusionCovers[fc.id];
                        return url ? { ...fc, coverImage: url } : fc;
                    }));
                }
            })
            .catch(() => { });
    }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Load fusion cards + build unified card order ──
    useEffect(() => {
        const savedFusion = uStorage(userId).get('savedFusionPlans', []);
        setSavedFusionCards(savedFusion);

        const defaultOrder = [
            ...phases.map((_, i) => ({ type: 'phase', idx: i })),
            ...savedFusion.map(fc => ({ type: 'fusion', id: fc.id })),
        ];

        try {
            const raw = uStorage(userId).get('masterJourneyCardOrder', null);
            if (raw) {
                let merged = raw;
                // Remove stale fusion entries (deleted cards)
                merged = merged.filter(o => o.type === 'phase' || savedFusion.find(fc => fc.id === o.id));
                // Append new fusion cards not yet in the saved order
                savedFusion.forEach(fc => {
                    if (!merged.find(o => o.type === 'fusion' && o.id === fc.id))
                        merged.push({ type: 'fusion', id: fc.id });
                });
                // Ensure all phase slots present (safety)
                phases.forEach((_, i) => {
                    if (!merged.find(o => o.type === 'phase' && o.idx === i))
                        merged.push({ type: 'phase', idx: i });
                });
                setCardOrder(merged);
                cardOrderRef.current = merged;
            } else {
                setCardOrder(defaultOrder);
                cardOrderRef.current = defaultOrder;
            }
        } catch (_) {
            setCardOrder(defaultOrder);
            cardOrderRef.current = defaultOrder;
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Keep ref in sync so touch handlers always see latest order
    const cardOrderRef = useRef([]);
    useEffect(() => { cardOrderRef.current = cardOrder; }, [cardOrder]);

    // ── Unified move (arrow buttons fallback) ──
    const moveCardByIdx = (fromIdx, dir) => {
        const toIdx = fromIdx + dir;
        if (toIdx < 0 || toIdx >= cardOrder.length) return;
        const newOrder = [...cardOrder];
        [newOrder[fromIdx], newOrder[toIdx]] = [newOrder[toIdx], newOrder[fromIdx]];
        setCardOrder(newOrder);
        try { uStorage(userId).set('masterJourneyCardOrder', newOrder); } catch (_) { }
    };

    // ── Delete fusion card ──
    const deleteFusionCard = (id) => {
        const updatedFusion = savedFusionCards.filter(c => c.id !== id);
        const newOrder = cardOrder.filter(o => !(o.type === 'fusion' && o.id === id));
        setSavedFusionCards(updatedFusion);
        setCardOrder(newOrder);
        try {
            uStorage(userId).set('savedFusionPlans', updatedFusion);
            uStorage(userId).set('masterJourneyCardOrder', newOrder);
        } catch (_) { }
    };

    // ── Upload cover to backend (shared helper) ──
    const uploadCoverToBackend = async (coverId, file) => {
        const uid = userId || getUserId();
        const form = new FormData();
        form.append('cover_id', coverId);
        form.append('image', file);
        try {
            const res = await fetch(
                `http://${window.location.hostname}:8000/api/plan-covers/${uid}`,
                { method: 'POST', body: form }
            );
            if (res.ok) {
                const { url } = await res.json();
                return mediaUrl(url);
            }
        } catch (_) { }
        // Fallback: use local DataURL if backend unavailable
        return null;
    };

    // ── Cover image upload (fusion cards) ──
    const handleCoverImageUpload = async (id, file) => {
        if (!file) return;
        // Optimistic preview
        const localUrl = URL.createObjectURL(file);
        setSavedFusionCards(prev => prev.map(fc => fc.id === id ? { ...fc, coverImage: localUrl } : fc));

        // Upload to backend (key: "fusion_{id}")
        const backendUrl = await uploadCoverToBackend(`fusion_${id}`, file);
        const finalUrl = backendUrl || localUrl;
        setSavedFusionCards(prev => {
            const updated = prev.map(fc => fc.id === id ? { ...fc, coverImage: finalUrl } : fc);
            try { uStorage(userId).set('savedFusionPlans', updated); } catch (_) { }
            return updated;
        });
    };

    // ── Cover image upload (phase plan cards) ──
    // planId = card.plan.id e.g. "arm-plan", state key = planId (no prefix)
    const handlePlanCoverUpload = async (planId, file) => {
        if (!file || !planId) return;
        const localUrl = URL.createObjectURL(file);
        setPlanCoverImages(prev => ({ ...prev, [planId]: localUrl }));
        const backendUrl = await uploadCoverToBackend(`plan_${planId}`, file);
        if (backendUrl) setPlanCoverImages(prev => ({ ...prev, [planId]: backendUrl }));
    };

    const activePlanId = useMemo(() => {
        try {
            const uid = getUserId();
            const pr = localStorage.getItem(`currentPlan_${uid}`);
            if (pr) return JSON.parse(pr).id;
        } catch (e) { }
        return null;
    }, []);

    const toggleSelect = (phaseIdx) => {
        setSelectedIdxs(prev => {
            if (prev.includes(phaseIdx)) return prev.filter(x => x !== phaseIdx);

            const targetPhase = phases[phaseIdx];
            // 混合課程（含跑步處方）不參與融合：融合引擎只處理重訓，
            // 選進去會把跑步那一半靜默丟掉，等於給使用者一份殘缺的課表。
            if (targetPhase.noFusion) return prev;
            const hasFullBodyInPrev = prev.some(idx => phases[idx].isFullBody);
            const hasOthersInPrev = prev.some(idx => !phases[idx].isFullBody);

            // 互斥鎖邏輯：
            // 1. 如果點擊的是全身計劃，但已經選了其他局部計劃 -> 鎖死
            if (targetPhase.isFullBody && hasOthersInPrev) return prev;
            // 2. 如果點擊的是局部計劃，但已經選了全身計劃 -> 鎖死
            if (!targetPhase.isFullBody && hasFullBodyInPrev) return prev;

            if (prev.length >= MAX_FUSION) return prev;
            return [...prev, phaseIdx];
        });
    };

    const handleFuse = () => {
        const selectedPlans = selectedIdxs.map(i => phases[i].plan).filter(Boolean);
        setFusionMode(false);
        setSelectedIdxs([]);
        if (selectedPlans.length === 1) {
            handlePhasePress(phases.find(ph => ph.plan?.id === selectedPlans[0].id));
        } else {
            navigate('/plan-preview', { state: { sourcePlans: selectedPlans } });
        }
    };

    // 讀取目前執行中的計劃（id / name）。
    const getActivePlanMeta = () => {
        try {
            const pr = localStorage.getItem(`currentPlan_${getUserId()}`);
            if (pr) { const p = JSON.parse(pr); return { id: p.plan_id || p.id, name: p.name || p.plan_name }; }
        } catch { /* ignore */ }
        return { id: null, name: null };
    };

    // 判斷「被點的卡片」是不是目前正在執行的那個計劃。
    const isActivePlanCard = (cardPlan, cardTitle) => {
        const a = getActivePlanMeta();
        if (!a.id && !a.name) return false;
        const cid = cardPlan?.id;
        const cname = cardPlan?.name || cardPlan?.plan_name || cardTitle;
        return (a.id && cid && a.id === cid) || (a.name && cname && a.name === cname);
    };

    // 已有執行中計劃、且點的是「別的」計劃時才提醒。
    // 回傳 true = 可以繼續切換；false = 維持目前計劃。
    const confirmSwitchIfActive = async (targetPlan, targetTitle) => {
        // 🔧 同時看 anyActive 與 currentPlan：執行中的若是「融合計劃」(不在卡片清單)，
        //    anyActive 偵測不到 → 改用 OR，確保有任何執行中計劃時都會提示。
        if (!anyActive && !getActivePlanMeta().id) return true;
        // 點的就是目前這個計劃 → 不提醒，直接進入。
        if (isActivePlanCard(targetPlan, targetTitle)) return true;
        const activeName = getActivePlanMeta().name || '目前的計劃';
        // 顏色對調：主要(紅)按鈕＝「繼續目前計劃」(安全選項)；次要(白)＝「切換計劃」。
        // confirmDialog 的 confirm 鈕為紅，所以把「繼續」放 confirm、回傳值反轉。
        const keepCurrent = await confirmDialog(
            `你目前正在執行「${activeName}」。\n切換到新的計劃會以新計劃接手，原本的進度仍會保留。確定要切換嗎？`,
            { title: '已有執行中的計劃', confirmText: '繼續目前計劃', cancelText: '切換計劃', danger: true }
        );
        return !keepCurrent; // 按「繼續目前計劃」(confirm) → 不切換
    };

    const handlePhasePress = async (phase) => {
        if (!phase || !phase.plan) return;
        // 點目前正在執行的計劃 → 一樣進入計劃預覽（看得到完整週預覽），
        // 但帶 isActivePlan 旗標，讓底部按鈕變「繼續計劃」、且不再彈切換提醒。
        const active = isActivePlanCard(phase.plan, phase.title);
        /* 【不在這裡問切換】以前一點卡片就跳「已有執行中的計劃」，使用者
           連課表都還沒看到就被逼著決定。改成先讓他進去看，真的要用了
           再由計劃詳情頁的「開始計劃」按鈕確認（見 PlanPreviewPageMobile）。 */
        // 課程改版後每張卡都自帶 plan，直接帶進預覽頁 —— 不再需要逐一 if/else 分支。
        navigate('/plan-preview', {
            state: {
                plan: phase.plan,
                defaultLevel: phase.level || 'beginner',
                bg: phase.bg,
                isActivePlan: active,
            },
        });
    };

    const activeStatusList = useMemo(() => {
        let activeId = null;
        try {
            const pr = localStorage.getItem(`currentPlan_${getUserId()}`);
            if (pr) activeId = JSON.parse(pr).plan_id || JSON.parse(pr).id;
        } catch(e) {}

        return cardOrder.map(item => {
            if (item.type === 'phase') {
                const card = phases[item.idx];
                return card ? card.isActive : false;
            } else {
                const cardIdx = savedFusionCards.findIndex(c => c.id === item.id);
                if (cardIdx === -1) return false;
                const card = savedFusionCards[cardIdx];
                const stats = getPlanStats(card);
                return (stats.done > 0 && stats.done < stats.total) || (activeId && activeId === card.id);
            }
        });
    }, [cardOrder, phases, savedFusionCards]);
    const anyActive = activeStatusList.some(a => a);

    // 只要有「任一執行中的計劃」（專項 phase 或融合 fusion）→ 整個專項訓練欄自動收合。
    // 🔧 加上 currentPlan(localStorage) 偵測：融合計劃啟用後不一定在卡片清單中，
    //    僅靠 anyActive 會偵測不到 → 補上「目前執行中計劃」判斷，確保融合計劃時也收合。
    const planActive = anyActive || !!getActivePlanMeta().id;
    const [sectionCollapsed, setSectionCollapsed] = useState(false);
    // 用 ref 記住上一次的 planActive，只有「狀態真的改變」時才自動收合/展開，
    // 避免覆蓋使用者手動點「展開」的選擇。
    const prevPlanActiveRef = useRef(null);
    useEffect(() => {
        if (prevPlanActiveRef.current !== planActive) {
            setSectionCollapsed(planActive);
            prevPlanActiveRef.current = planActive;
        }
    }, [planActive]);

    // 顯示順序：進行中的卡片排到最前（編輯／融合模式下維持原序，方便拖曳/多選）
    const displayOrder = useMemo(() => {
        if (editMode || fusionMode) return cardOrder.map((entry, i) => ({ entry, i }));
        return cardOrder
            .map((entry, i) => ({ entry, i }))
            .sort((a, b) => (activeStatusList[b.i] ? 1 : 0) - (activeStatusList[a.i] ? 1 : 0));
    }, [cardOrder, activeStatusList, editMode, fusionMode]);

    // 收合且非融合時：整欄只剩標題列，把上下留白收緊，避免與「本週」間出現大空隙
    const sectionCompact = sectionCollapsed && !fusionMode;
    return (
        <div style={{ paddingTop: '18px', paddingBottom: sectionCompact ? '6px' : '28px' }}>
            {/* 新手教學高亮範圍：標題列 + 整列計劃卡片一起框住 */}
            <div data-onboard="plan-section">
                {/* ── Header ── */}
                <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.30 }}
                    style={{ padding: '0 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: sectionCompact ? 0 : (fusionMode ? 10 : 16) }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Lbl c={C.textPrimary} style={{ opacity: 0.6 }}>專項訓練</Lbl>
                          {planActive && (
                            <motion.button
                              whileTap={{ scale: 0.9 }}
                              onClick={() => setSectionCollapsed(c => !c)}
                              style={{ display: 'flex', alignItems: 'center', gap: 3, padding: 0, background: 'none', border: 'none', color: C.coral, fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', cursor: 'pointer' }}
                            >
                              {sectionCollapsed ? '展開' : '收合'}
                              <motion.span animate={{ rotate: sectionCollapsed ? 0 : 180 }} style={{ display: 'inline-flex' }}><ChevronDown size={11} /></motion.span>
                            </motion.button>
                          )}
                        </div>
                        {fusionMode && (
                            <p style={{ color: C.coral, fontSize: 11, fontWeight: 700, margin: '4px 0 0', letterSpacing: '0.02em' }}>
                                選擇 2–{MAX_FUSION} 個計劃合併 ({selectedIdxs.length}/{MAX_FUSION})
                            </p>
                        )}
                        {editMode && !fusionMode && (
                            <p style={{ color: C.pebble, fontSize: 11, fontWeight: 700, margin: '4px 0 0', letterSpacing: '0.02em' }}>
                                拖移卡牌排序 · 長按滑動可重排
                            </p>
                        )}
                      </div>
                    </div>

                    <div data-onboard="plan-tools" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

                        {/* 🗑️ 2026-09：「融合」入口已移除（使用者決定）。
                            fusionMode 這個狀態與下游邏輯先保留 —— 融合計劃是可以被
                            其他流程建立的，直接拔掉整條會動到卡片清單與課表接手邏輯。
                            這裡只是不再提供從中控台進入融合的按鈕。 */}
                    </div>
                </motion.div>

                {/* ── Unified Carousel (Apple 絲滑彈簧排版 + 強力自動滾動) ── */}
                {/* 融合模式一定要展開卡片(否則無法選取)，即使計劃進行中也展開 */}
                {(!sectionCollapsed || fusionMode) && (
                <Reorder.Group
                    axis="x"
                    ref={carouselRef}
                    values={cardOrder}
                    onReorder={(newOrder) => {
                        // 🔥 只有在真正發生「順序改變」時才觸發震動
                        if (JSON.stringify(newOrder) !== JSON.stringify(cardOrder)) {
                            haptic('medium');
                            setCardOrder(newOrder);
                            try { uStorage(userId).set('masterJourneyCardOrder', newOrder); } catch (_) { }
                        }
                    }}
                    style={{
                        display: 'flex', gap: 12, overflowX: 'auto',
                        padding: '28px 18px 24px', margin: 0,
                        // 只有在編輯模式下才關閉磁吸，讓手動拖曳更準確
                        scrollSnapType: editMode ? 'none' : 'x mandatory',
                        WebkitOverflowScrolling: 'touch',
                    }}
                >
                    <style>{`ul::-webkit-scrollbar { display: none; }`}</style>

                    {displayOrder.map(({ entry, i: cardIdx }) => {
                        const isPhase = entry.type === 'phase';
                        const phaseIdx = entry.idx;
                        const card = isPhase ? phases[phaseIdx] : savedFusionCards.find(f => f.id === entry.id);
                        if (!card) return null;

                        const cardIsActive = activeStatusList[cardIdx];
                        const isDimmed = anyActive && !cardIsActive;

                        const isSelected = isPhase && selectedIdxs.includes(phaseIdx);

                        // --- 互斥鎖與最大數量判定 ---
                        const hasFullBodySelected = selectedIdxs.some(idx => phases[idx].isFullBody);
                        const hasOthersSelected = selectedIdxs.some(idx => !phases[idx].isFullBody);

                        const isMutuallyExclusive = fusionMode && !isSelected && (
                            (card.isFullBody && hasOthersSelected) ||
                            (!card.isFullBody && hasFullBodySelected)
                        );
                        const isMaxed = fusionMode && !isSelected && selectedIdxs.length >= MAX_FUSION;

                        const isCardDisabled = isMutuallyExclusive || isMaxed;

                        const hasCover = !isPhase && !!card.coverImage;
                        const customCover = isPhase ? planCoverImages[card.plan?.id] : null;

                        return (
                            <DraggableCardItem key={isPhase ? `p_${phaseIdx}` : `f_${entry.id}`} entry={entry} carouselRef={carouselRef}>
                                {(controls, isDragging) => (
                                    <motion.div
                                        layout // 🔥 讓卡片換位時會有「滑過去」的動畫，而不是閃現

                                        // ── Premium entrance: fade + slide up, no scale (perf) ──
                                        initial={{ opacity: 0, y: 28 }}
                                        animate={{
                                            opacity: isCardDisabled ? 0.2 : ((isDimmed && !editMode) ? 0.7 : 1),
                                            y: (isDimmed && !editMode) ? 6 : 0,
                                            scale: isDragging ? 1.04 : ((isDimmed && !editMode) ? 0.97 : 1),
                                            boxShadow: isDragging
                                                ? '0 30px 60px rgba(0,0,0,0.5), 0 0 0 4px #F95C4B'
                                                : (isSelected ? '0 0 0 2px #F95C4B' : 'none'), // 卡牌下方不留投影（拖曳/選取才給回饋）
                                        }}
                                        transition={{
                                            y: { duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.08 + cardIdx * 0.055 },
                                            opacity: { duration: 0.38, ease: 'easeOut', delay: 0.08 + cardIdx * 0.055 },
                                            scale: isDragging
                                                ? { type: 'spring', stiffness: 400, damping: 30 }
                                                : { duration: 0 },
                                            boxShadow: { type: 'spring', stiffness: 300, damping: 28 },
                                        }}

                                        whileTap={editMode ? {} : { scale: 0.97 }}
                                        onClick={async () => {
                                            if (editMode) return;
                                            if (isPhase && fusionMode) { toggleSelect(phaseIdx); return; }
                                            if (isPhase) handlePhasePress(card);
                                            else {
                                                const activeFusion = isActivePlanCard(card, card.name || card.title);
                                                const allPlans = [SHOULDER_ARM_PLAN, CHEST_PLAN, LEG_PLAN, GLUTE_PLAN, FULLBODY_PLAN, BACK_PLAN, CORE_PLAN,
                                                    IRON_BASE_PLAN, V_TAPER_PLAN, PEACH_SUIT_PLAN, LEAN_LIGHT_PLAN, RUNNERS_ARMOR_PLAN, HYROX_PLAN];
                                                const srcPlans = (card.sourcePlanIds || []).map(id => allPlans.find(p => p.id === id)).filter(Boolean);
                                                if (srcPlans.length >= 2) {
                                                    // 這條也是導向計劃預覽 → 切換確認同樣延後到預覽頁的「開始計劃」
                                                    navigate('/plan-preview', { state: { sourcePlans: srcPlans, sourceLevelsMap: card.sourceLevelsMap || {}, daysPerWeek: card.daysPerWeek || 4, fromDashboard: true, isActivePlan: activeFusion } });
                                                }
                                            }
                                        }}
                                        style={{
                                            width: '280px', height: '280px',
                                            borderRadius: '28px',
                                            // 🔥 核心修正：移除材質紋理，只保留原圖與文字保護漸層
                                            backgroundColor: isPhase ? (customCover ? '#161415' : (card.bg.includes('url') ? '#161415' : card.bg)) : '#161415',
                                            backgroundImage: `
                                            linear-gradient(rgba(22,20,21,0.1) 0%, rgba(22,20,21,0.95) 100%),
                                            ${isPhase
                                                    ? (customCover ? `url(${customCover})` : card.bg.includes('url') ? `${card.bg}` : 'none')
                                                    : (hasCover ? `url(${card.coverImage})` : 'linear-gradient(135deg, #161415 0%, #262523 40%, #1A1819 100%)')}
                                        `,
                                            backgroundBlendMode: 'normal',

                                            backgroundSize: 'cover, cover',
                                            backgroundRepeat: 'no-repeat, no-repeat',
                                            backgroundPosition: 'center, center',

                                            scrollSnapAlign: 'center', padding: '28px',
                                            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                                            color: isPhase ? card.color : C.paper, position: 'relative', overflow: 'hidden',
                                            cursor: editMode ? (isDragging ? 'grabbing' : 'pointer') : 'pointer',
                                            // opacity moved to animate (framer-motion controls it for entrance)
                                            filter: isCardDisabled ? 'grayscale(100%) brightness(0.5)' : 'none',
                                            touchAction: editMode ? 'pan-x' : 'auto',
                                        }}
                                    >
                                        {/* 互斥鎖提示訊息 */}
                                        {isMutuallyExclusive && (
                                            <div style={{
                                                position: 'absolute', inset: 0, zIndex: 30,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                padding: '20px', textAlign: 'center'
                                            }}>
                                                <span style={{
                                                    color: '#fff', fontSize: 12, fontWeight: 900,
                                                    lineHeight: 1.4, textShadow: '0 2px 10px rgba(0,0,0,0.5)'
                                                }}>
                                                    全身計劃無法與<br />局部計劃混搭
                                                </span>
                                            </div>
                                        )}
                                        <div style={{ position: 'absolute', inset: 0, background: (isPhase && card.isActive) ? 'linear-gradient(180deg,rgba(255,255,255,0.1) 0%,rgba(0,0,0,0.1) 100%)' : 'linear-gradient(180deg,rgba(255,255,255,0.05) 0%,rgba(0,0,0,0.1) 100%)', pointerEvents: 'none' }} />

                                        {/* 融合選擇標籤 */}
                                        {fusionMode && isPhase && (
                                            <motion.div
                                                initial={{ scale: 0.5, opacity: 0 }}
                                                animate={{ scale: 1, opacity: 1 }}
                                                style={{
                                                    position: 'absolute', top: 14, left: 14, zIndex: 10,
                                                    width: 28, height: 28, borderRadius: 99,
                                                    background: isSelected ? '#F95C4B' : 'rgba(255,255,255,0.25)',
                                                    border: `2px solid ${isSelected ? '#F95C4B' : 'rgba(255,255,255,0.55)'}`,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    backdropFilter: 'blur(6px)',
                                                    boxShadow: isSelected ? '0 2px 10px rgba(249,92,75,0.5)' : 'none',
                                                }}
                                            >
                                                {isSelected && <Check size={13} color="#fff" strokeWidth={3} />}
                                            </motion.div>
                                        )}

                                        {/* 隱藏的封面圖上傳器 */}
                                        <input
                                            type="file" accept="image/*" style={{ display: 'none' }}
                                            ref={el => { fileInputsRef.current[isPhase ? `phase_${phaseIdx}` : card.id] = el; }}
                                            onChange={(e) => isPhase ? handlePlanCoverUpload(card.plan?.id, e.target.files[0]) : handleCoverImageUpload(card.id, e.target.files[0])}
                                        />

                                        <AnimatePresence>
                                            {editMode && (
                                                <motion.div
                                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                                    style={{ position: 'absolute', inset: 0, zIndex: 20, borderRadius: '28px', background: 'rgba(22,20,21,0.6)', backdropFilter: 'blur(5px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}
                                                    onClick={e => e.stopPropagation()}
                                                >
                                                    <div
                                                        onPointerDown={(e) => {
                                                            controls.start(e);
                                                            haptic('light');
                                                        }}
                                                        style={{
                                                            padding: '12px 32px', background: 'rgba(255,255,255,0.2)',
                                                            borderRadius: 99, display: 'flex', alignItems: 'center', gap: 8,
                                                            color: '#FFF', fontSize: 13, fontWeight: 900, cursor: 'grab',
                                                            touchAction: 'none',
                                                            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                                                            border: '1px solid rgba(255,255,255,0.1)'
                                                        }}
                                                    >
                                                        <GripVertical size={16} /> 按住拖曳排序
                                                    </div>

                                                    <div style={{ display: 'flex', gap: 8 }}>
                                                        {!isPhase && <motion.button {...pressProps('row')} onClick={(e) => { e.stopPropagation(); deleteFusionCard(card.id); }} style={{ padding: '8px 16px', borderRadius: 99, background: 'rgba(217,64,48,0.2)', border: '1px solid rgba(217,64,48,0.4)', color: '#F95C4B', fontSize: 11, fontWeight: 900 }}>刪除</motion.button>}
                                                        <motion.button {...pressProps('row')} onClick={(e) => { e.stopPropagation(); fileInputsRef.current[isPhase ? `phase_${phaseIdx}` : card.id]?.click(); }} style={{ padding: '8px 16px', borderRadius: 99, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#FFF', fontSize: 11, fontWeight: 900 }}>封面</motion.button>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>

                                        <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none' }}>
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                                                {isPhase && card.isCompleted && <CheckCircle2 size={16} color={C.coral} />}
                                                {cardIsActive && !fusionMode && !editMode && (
                                                    <span style={{ fontSize: 11, fontWeight: 900, padding: '4px 10px', borderRadius: 99, background: 'rgba(255,255,255,0.2)', color: '#FFF', letterSpacing: '0.12em', backdropFilter: 'blur(4px)' }}>進行中</span>
                                                )}
                                                {isPhase && isSelected && (
                                                    <span style={{ fontSize: 11, fontWeight: 900, padding: '4px 10px', borderRadius: 99, background: 'rgba(249,92,75,0.3)', color: '#FFF', letterSpacing: '0.12em', backdropFilter: 'blur(4px)' }}>✓ 已選</span>
                                                )}
                                                {!isPhase && (
                                                    <span style={{ fontSize: 11, fontWeight: 900, padding: '4px 10px', borderRadius: 99, background: 'rgba(249,92,75,0.30)', color: C.coral, letterSpacing: '0.12em', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        <Activity size={9} /> AI FUSION
                                                    </span>
                                                )}
                                            </div>
                                            <div>
                                                <h3 style={{ fontSize: isPhase ? 24 : 20, fontWeight: 400, fontFamily: '"Tenor Sans", sans-serif', lineHeight: 1.1, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '-0.01em' }}>
                                                    {isPhase ? card.title : (card.name || '智能融合計劃')}
                                                </h3>
                                                <p style={{ fontSize: isPhase ? 13 : 11, lineHeight: 1.5, opacity: 0.8, fontWeight: 500 }}>
                                                    {isPhase ? card.desc : (card.fusionSubtitle || card.bodyPartLabel)}
                                                </p>
                                                <div style={{ marginTop: 20 }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                                        <span style={{ fontSize: 11, fontWeight: 900, opacity: 0.5 }}>{isPhase ? 'PROGRESS' : '建立時間'}</span>
                                                        <span style={{ fontSize: 11, fontWeight: isPhase ? 900 : 700, opacity: 0.8, color: isPhase ? 'inherit' : C.coral }}>
                                                            {isPhase ? card.progressText : (card.createdAt ? new Date(card.createdAt).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' }) : '–')}
                                                        </span>
                                                    </div>
                                                    <div style={{ width: '100%', height: isPhase ? 4 : 3, borderRadius: 99, background: isPhase ? 'rgba(255,255,255,0.1)' : 'rgba(249,92,75,0.15)' }}>
                                                        {isPhase ? (
                                                            <motion.div style={{ height: '100%', borderRadius: 99, background: card.color, opacity: 0.8 }} initial={{ width: 0 }} animate={{ width: `${card.progress * 100}%` }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.3 + Math.min(cardIdx * 0.055, 0.25) }} />
                                                        ) : (
                                                            <div style={{ height: '100%', borderRadius: 99, background: `linear-gradient(90deg, ${C.coral}, ${C.ember})`, width: '15%' }} />
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </DraggableCardItem>
                        );
                    })}
                </Reorder.Group>
                )}
            </div>{/* /data-onboard="plan-section" */}

            {/* ── 銀色飾條：專項訓練（既有課表）與完整計劃（新的一期）之間的分隔。
                   拉絲金屬細線，兩端漸隱，中間一小段亮面，像儀器面板上的分隔飾條。 */}
            {!fusionMode && (
                <div style={{ margin: '2px 22px 12px', height: 3, display: 'flex', alignItems: 'center' }}>
                    <div style={{
                        flex: 1, height: 1.5, borderRadius: 99,
                        background: 'linear-gradient(90deg, rgba(207,198,184,0) 0%, rgba(196,190,180,0.55) 18%, rgba(255,255,255,0.95) 46%, rgba(214,208,197,0.85) 54%, rgba(196,190,180,0.55) 82%, rgba(207,198,184,0) 100%)',
                        boxShadow: '0 1px 0 rgba(255,255,255,0.7)',
                    }} />
                </div>
            )}

            {/* 🎯 設計屬於你的完整計劃 — 訓練重點 → 跑步/重訓/營養三張課表一次配好。
                放在進化日誌正上方：上面是「接下來要幹嘛」，下面是「已經走過什麼」。 */}
            {!fusionMode && <CompletePlanEntryCard userId={userId} />}


            {/* ── Fusion Action Bar ── */}
            <AnimatePresence>
                {fusionMode && selectedIdxs.length >= 1 && (
                    <motion.div
                        initial={{ y: 120, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 120, opacity: 0 }}
                        transition={{ type: 'spring', damping: 22, stiffness: 280 }}
                        onClick={handleFuse}
                        style={{
                            position: 'fixed', bottom: 36, left: 16, right: 16, zIndex: 999,
                            background: '#F95C4B',
                            borderRadius: 24, padding: '18px 24px',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            border: '1.5px solid rgba(255,255,255,0.25)',
                            boxShadow: '0 8px 32px rgba(249,92,75,0.45)',
                            cursor: 'pointer',
                        }}
                    >
                        <div>
                            <p style={{ color: '#fff', fontWeight: 900, fontSize: 18, margin: 0, letterSpacing: '0.02em', fontFamily: '"Tenor Sans", sans-serif' }}>
                                合併 {selectedIdxs.length} 個計劃 →
                            </p>
                            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 4, fontWeight: 700 }}>
                                {selectedIdxs.map(i => (phases[i]?.title || '').split('：')[0]).filter(Boolean).join(' × ')}
                            </p>
                        </div>
                        <div style={{ width: 48, height: 48, borderRadius: 18, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Layers size={22} color="#fff" />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// ════════════════════════════════════════

// ════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════
/* ── 統計卡的兩種非數字狀態 ───────────────────────────────────────────
   介面標準 §5：沒到資料門檻就不要畫空的大數字／空軌道／「—」佔位。
   一張卡只留「下一步要做的那一件事」，其餘都不出現。 */
const StatEmpty = ({ action, onDark }) => (
    <div className="journey-stat-empty">
        <span className="journey-stat-empty__action">{action}</span>
        <ArrowRight size={15} style={{ color: onDark ? 'rgba(246,244,241,0.55)' : 'rgba(22,20,21,0.35)', flexShrink: 0 }} />
    </div>
);

/* 這一條資料真的讀不到（離線／未登入）時用。說清楚「讀不到」與「還沒有」不同，
   並且把重試放在讀不到的那張卡上，而不是飄在區塊標題底下。 */
const StatUnavailable = ({ onRetry, onDark }) => (
    <div className="journey-stat-empty">
        <button type="button" className="journey-stat-retry"
            onClick={(e) => { e.stopPropagation(); haptic('light'); onRetry?.(); }}
            style={onDark ? { color: '#F6F4F1', borderColor: 'rgba(246,244,241,0.28)' } : undefined}>
            <RefreshCw size={13} /> 重新載入
        </button>
    </div>
);

const MasterJourneyDashboard = ({ userId }) => {
    const navigate = useNavigate();
    const [plan, setPlan] = useState(null);
    const [thisWeek, setThisWeek] = useState({ km: 0, calories: 0 });
    const [lastWeek, setLastWeek] = useState({ km: null, calories: null });
    const [thisVol, setThisVol] = useState(0);
    const [lastVol, setLastVol] = useState(null);
    const [nutAvg, setNutAvg] = useState({ calories: null, protein: null, days: 0 });
    const [nutGoal, setNutGoal] = useState({ calories: null, protein: null });
    const [weightGoal, setWeightGoal] = useState({ mode: null, target: null }); // InBody 變化上色用：體重往哪邊才算變好
    const [inbody, setInbody] = useState(null);
    const [delta, setDelta] = useState(null);
    const [monthLabel, setMonthLabel] = useState('');
    // ── dataReady: stats are loaded (controls skeleton shimmer, NOT page render) ──
    const [dataReady, setDataReady] = useState(false);
    const [dataErrors, setDataErrors] = useState({});
    /* 三條資料全部讀不到 = 連不上伺服器（不是「這週沒練」）。
       這兩件事在畫面上必須長得不一樣：前者給「重新載入」，後者給「去做第一次」。 */
    const allStatsFailed = Boolean(dataErrors.strength && dataErrors.cardio && dataErrors.nutrition);

    /* 今日 Hero 卡的封面照。啟用課程時 prepareCourseProgram 會把整份 course
       攤平寫進 currentPlan，coverImage 就在裡面；引擎生成的計劃沒有，回 null
       由 CSS 退回暗拉絲鈦金屬。 */
    const planCover = useMemo(() => {
        const c = plan?.coverImage || plan?.cover_image || plan?.source_course?.coverImage;
        if (!c || typeof c !== 'string') return null;
        return c.startsWith('url(') ? c.slice(4, -1).replace(/^["']|["']$/g, '') : c;
    }, [plan]);

    // ── Session cache helpers (3-min TTL) ─────────────────────────────────────
    const CACHE_TTL = 3 * 60 * 1000;
    const cacheKey = `mjd_cache_v2_${userId}`;
    const readCache = () => {
        try {
            const raw = sessionStorage.getItem(cacheKey);
            if (!raw) return null;
            const { ts, data } = JSON.parse(raw);
            if (Date.now() - ts > CACHE_TTL) return null;
            return data;
        } catch (_) { return null; }
    };
    const writeCache = (data) => {
        try { sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data })); } catch (_) { }
    };

const triggerHaptic = (style = 'medium') => haptic(style);

    // 🔥 Fusion State lifted for global UI synchronization (Navigation Dock hiding)
    const [fusionMode, setFusionMode] = useState(false);
    const [selectedIdxs, setSelectedIdxs] = useState([]);

    // 🎖️ Promotion invitation banner removed per design decision (2026-07)
    const [showWorkoutPreview, setShowWorkoutPreview] = useState(null);
    const [showRunPreview, setShowRunPreview] = useState(false);

    // 同步通知 App.jsx 隱藏全局 CapsuleNavigation
    useEffect(() => {
        window.dispatchEvent(new CustomEvent('fusionModeChange', { detail: { active: fusionMode } }));
        return () => {
            // 離開頁面時確保恢復
            if (fusionMode) window.dispatchEvent(new CustomEvent('fusionModeChange', { detail: { active: false } }));
        };
    }, [fusionMode]);

    const activeWeek = useMemo(() => {
        if (!plan?.weeks) return 1;
        for (let w = 0; w < plan.weeks.length; w++) {
            const done = readJSON(`completed_workouts_${userId}_week${w + 1}`, []);
            if (done.length < (plan.weeks[w].days?.length || 0)) return w + 1;
        }
        return plan.weeks.length;
    }, [plan, userId]);

    const weekComp = useMemo(() => {
        if (!plan?.weeks?.[activeWeek - 1]) return { done: 0, total: 0 };
        const total = plan.weeks[activeWeek - 1].days?.length || 0;
        const saved = readJSON(`completed_workouts_${userId}_week${activeWeek}`, []);
        const done = new Set((Array.isArray(saved) ? saved : []).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= total)).size;
        return { done, total };
    }, [plan, activeWeek, userId]);

    // ── 跑步計劃：抓本週跑步計劃，找出「今天」的跑步訓練磚 ──
    const [cardioBricks, setCardioBricks] = useState([]);
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const res = await apiClient.get(`/api/cardio-plan/${userId}/this-week`);
                const bricks = Array.isArray(res.data?.bricks) ? res.data.bricks : [];
                cacheWeekBricks(userId, bricks);   // 🗓️ 同步本地快取
                if (alive) setCardioBricks(bricks);
            } catch { /* 無計劃或後端不可用 → 不顯示跑步卡 */ }
        })();
        return () => { alive = false; };
    }, [userId]);

    // 🗓️ 改讀 dailyAgenda 單一真相源：跑步磚依「繞開重訓/腿日」的排程演算法落位，
    //    取代舊的平均撒點猜日子 — 全 App 各頁面從此對「今天跑不跑」說同一句話。
    // 📥 所有跑步／重訓紀錄（用來判斷「今天是否已經練過」）
    const [allCardioRuns, setAllCardioRuns] = useState([]);
    const [allStrengthSessions, setAllStrengthSessions] = useState([]);

    const todayAgenda = useMemo(() => {
        try {
            const a = getTodayAgenda(loadWeekInputs(userId, { cardioBricks }));
            // ✅ 用真實紀錄覆寫 done 狀態，並算出今天的跑步／重訓摘要
            return applyTodayRealDone(a, {
                cardioSessions: allCardioRuns,
                strengthSessions: allStrengthSessions,
            });
        } catch { return null; }
    }, [userId, cardioBricks, plan, activeWeek, allCardioRuns, allStrengthSessions]);

    // 🏃 今天已完成的跑步（有值 → 主頁卡片顯示「已達標 + 最近一次數據」，
    //    不再繼續顯示今天的原定計劃，直到下一個計劃日）
    const todayRunDone = todayAgenda?.todayRunDone || null;
    // 🏋️ 今天已完成的重訓（同上，並觸發卡片的容量滾動 + 金屬反光慶祝特效）
    const todayStrengthDone = todayAgenda?.todayStrengthDone || null;
    const todayWorkout = todayStrengthDone ? null : todayAgenda?.blocks?.find(block => block.type === 'strength')?.payload || null;

    /* 今日重訓 Hero 的照片：照「這堂課的標籤」（拉力／推力／下肢／全身…）挑一張，
       對照表只有 utils/workoutHeroMapping 一份。
       ⚠️ 這張卡之前只看課程封面（course.coverImage），引擎生成的計劃沒有封面，
          所以大部分人看到的都是同一片黑色金屬，推日跟腿日長得一模一樣。
          標籤認不出來（綜合）才退回課程封面。 */
    const todayHeroStyle = useMemo(() => {
        if (!todayWorkout) return undefined;
        /* 先看主標籤（括號前那段：「拉力強化 (背・二頭)（強化 肩）」→「拉力強化」），
           認不出來才看整串。整串一起看的話，括號裡多一個「肩」就會被判成上半身綜合。 */
        const full = `${todayWorkout.focus || ''} ${todayWorkout.name || ''}`;
        const primary = String(todayWorkout.focus || todayWorkout.name || '').replace(/[（(].*$/, '').trim();
        let theme = getWorkoutHeroTheme(primary);
        if (theme.key === 'default') theme = getWorkoutHeroTheme(full);
        const img = theme.key !== 'default' ? theme.image : (planCover || theme.image);
        if (!img) return undefined;
        const fromTheme = img === theme.image;
        return {
            backgroundImage: `url("${encodeURI(img)}")`,
            backgroundColor: fromTheme ? theme.base : undefined,
            backgroundSize: fromTheme ? theme.imageSize : 'cover',
            backgroundPosition: fromTheme ? theme.imagePosition : 'center',
            backgroundRepeat: 'no-repeat',
        };
    }, [todayWorkout, planCover]);

    /* 大概要練多久 —— 跟首頁焦點卡、計劃預覽同一支 estimateDayMinutes。
       ⚠️ 沒有動作明細、也沒有引擎給的時間時，那支會回 45 當預設 —— 那是編的，這裡不顯示。 */
    const todayWorkoutMin = useMemo(() => {
        if (!todayWorkout) return null;
        const hasDetail = Array.isArray(todayWorkout.exercises) && todayWorkout.exercises.length > 0;
        const engineTime = parseInt(todayWorkout.time || todayWorkout.estimated_time, 10);
        if (!hasDetail && !(engineTime > 0)) return null;
        const m = estimateDayMinutes(todayWorkout);
        return Number.isFinite(m) && m > 0 ? m : null;
    }, [todayWorkout]);

    const todayRun = useMemo(() => {
        // 今天已經跑過 → 不再把計劃當成待辦推給使用者
        if (todayRunDone) return null;
        const blk = todayAgenda?.blocks?.find(b => b.type === 'run');
        return blk ? blk.payload : null;
    }, [todayAgenda, todayRunDone]);

    // 今日 session 輪播：重訓 + 跑步（有哪個就放哪個；兩個都有就輪播）
    const sessionSlides = useMemo(() => {
        const arr = [];
        if (todayWorkout) arr.push('strength');
        if (todayRun) arr.push('run');
        return arr;
    }, [todayWorkout, todayRun]);
    const [slideIdx, setSlideIdx] = useState(0);
    const safeIdx = sessionSlides.length ? (slideIdx % sessionSlides.length) : 0;
    const curSlide = sessionSlides[safeIdx] || (todayWorkout ? 'strength' : (todayRun ? 'run' : null));

    const fetchAll = useCallback(async () => {
        // ── 1. Sync / instant sources (localStorage) ─────────────────────────
        setPlan(readJSON(`currentPlan_${userId}`, null));
        setDataReady(false);

        try {
            setInbody(null); setDelta(null); setMonthLabel('');
            const loc = readJSON(`inbody_local_${userId}`, []);
            if (Array.isArray(loc) && loc.length) {
                const { current: curr, previous: prev } = bodyMeasurementPair(loc);
                setInbody(curr);
                if (curr && prev) {
                    /* ⚠️ 原本寫 (curr.x || 0) - (prev.x || 0)：上一筆缺那個欄位時，
                       || 0 會讓漲幅直接等於「這次的完整數值」——
                       畫面上就出現「體重 65.2 ↑65.2」，等於說你這個月長了 65 公斤。
                       兩邊都要有真實數字才算得出變化，缺一邊就不給。 */
                    const diff = (a, b) => {
                        const x = Number(a), y = Number(b);
                        if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0) return null;
                        return (x - y).toFixed(1);
                    };
                    setDelta({
                        weight: diff(curr.weight_kg, prev.weight_kg),
                        muscle: diff(curr.skeletal_muscle_mass, prev.skeletal_muscle_mass),
                        fat: diff(curr.body_fat_percent, prev.body_fat_percent),
                    });
                    const fm = d => { const date = localRecordDate(d.measurement_date || d.date); return Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`; };
                    if (fm(prev) && fm(curr)) setMonthLabel(`${fm(prev)} → ${fm(curr)}`);
                }
            }
        } catch (_) { }

        // ── 2. Restore from session cache for instant feel on repeat visits ──
        const cached = readCache();
        if (cached) {
            if (cached.nutGoal) setNutGoal(cached.nutGoal);
            if (cached.nutAvg) setNutAvg(cached.nutAvg);
            if (cached.thisWeek) setThisWeek(cached.thisWeek);
            if (cached.lastWeek) setLastWeek(cached.lastWeek);
            if (cached.thisVol != null) setThisVol(cached.thisVol);
            if (cached.lastVol != null) setLastVol(cached.lastVol);
        }

        // ── 3. Fire all API calls in parallel ────────────────────────────────
        /* 先確保身上有 token。後端的 owner-guard 對「沒帶 JWT」一律回 401，
           所以訪客一旦沒有匿名 token，下面四支全部會失敗 ——
           畫面上就是三張卡同時變成讀不到。 */
        try { await ensureAuthBeforeFetch(); } catch (_) { /* 拿不到就照舊往下打 */ }
        try {
            const now = new Date();
            const weekWindow = dashboardWeekWindow(now);
            const tw0 = weekWindow.start, lw0 = weekWindow.previous;

            const [goalsRes, nutRes, cardioRes, workoutRes] = await Promise.allSettled([
                apiClient.get(`/api/user/nutrition-goals/${userId}`).then(r => r.data),
                getNutritionHistory(userId, 14),
                getCardioRuns(userId),
                getWorkoutHistory(userId, 100),
            ]);

            const errors = {
                nutrition: nutRes.status === 'rejected' || !Array.isArray(nutRes.value?.history),
                cardio: cardioRes.status === 'rejected',
                strength: workoutRes.status === 'rejected',
            };
            setDataErrors(errors);
            const gd = goalsRes.status === 'fulfilled' ? goalsRes.value : null;
            const newNutGoal = { calories: positiveGoal(gd?.target_calories), protein: positiveGoal(gd?.protein_target) };
            setNutGoal(newNutGoal);
            setWeightGoal({ mode: gd?.mode || null, target: positiveGoal(gd?.plan?.targetWeight ?? gd?.plan?.target_weight) ?? null });
            const newNutAvg = nutritionWeekAverage(nutRes.status === 'fulfilled' ? nutRes.value?.history : [], weekWindow);
            setNutAvg(newNutAvg);

            // ── Cardio ─────────────────────────────────────────────────────
            let newThisWeek = null, newLastWeek = null;
            try {
                if (cardioRes.status === 'fulfilled') {
                    const cRes = cardioRes.value;
                    const runs = cRes.runs;
                    if (!Array.isArray(runs)) throw new Error('Invalid cardio history');
                    const runKm = r => (positiveGoal(r.distance ?? r.metrics?.distance_km ?? r.metrics?.distance) ?? 0);
                    const runCal = r => Number(r.calories ?? r.metrics?.calories ?? 0);
                    const runDate = r => localRecordDate(r.date || r.timestamp || r.created_at);
                    const twRuns = runs.filter(r => inDashboardWeek(r.date || r.timestamp || r.created_at, weekWindow));
                    const lwRuns = runs.filter(r => { const d = runDate(r); return d >= lw0 && d < tw0; });
                    newThisWeek = { km: parseFloat(twRuns.reduce((s, r) => s + runKm(r), 0).toFixed(1)), calories: Math.round(twRuns.reduce((s, r) => s + runCal(r), 0)) };
                    newLastWeek = { km: lwRuns.length ? parseFloat(lwRuns.reduce((s, r) => s + runKm(r), 0).toFixed(1)) : null, calories: lwRuns.length ? Math.round(lwRuns.reduce((s, r) => s + runCal(r), 0)) : null };
                    setThisWeek(newThisWeek);
                    setLastWeek(newLastWeek);
                    // ✅ 供主頁卡片判斷「今天是否已經跑過」→ 計劃卡改顯示已達標
                    setAllCardioRuns(runs);
                }
            } catch (_) { setDataErrors(previous => ({ ...previous, cardio: true })); }

            // ── Workout volume ─────────────────────────────────────────────
            let newThisVol = null, newLastVol = null;
            try {
                if (workoutRes.status === 'fulfilled') {
                    const rd = workoutRes.value;
                    const recs = (rd.history || rd || []).map(r => ({ ...r, volume: r.total_volume ?? r.volume ?? 0, date: r.timestamp || r.date }));
                    const calcVol = (r) => {
                        const fromSets = r.exercises?.reduce((acc, ex) => {
                            const sets = ex.detailedSets || (Array.isArray(ex.sets) && ex.sets.length && typeof ex.sets[0] === 'object' ? ex.sets : null);
                            if (sets) return acc + sets.reduce((v, s) => v + ((parseFloat(s.weight) || 0) * (parseFloat(s.reps) || 0)), 0);
                            const w = parseFloat((ex.weight || 0).toString().replace('kg', '')) || 0;
                            const sc = parseInt(ex.sets || 0);
                            const rStr = (ex.reps || '0').toString();
                            let rep = parseFloat(rStr) || 0;
                            if (rStr.includes('-')) { const p = rStr.split('-').map(parseFloat); rep = (p[0] + p[1]) / 2; }
                            return acc + (sc * rep * w || 0);
                        }, 0) || 0;
                        return fromSets > 0 ? fromSets : (positiveGoal(r.volume) ?? 0);
                    };
                    const twVol = recs.filter(r => inDashboardWeek(r.timestamp || r.date, weekWindow)).reduce((s, r) => s + calcVol(r), 0);
                    const lwVol = recs.filter(r => { const d = new Date(r.timestamp || r.date); return d >= lw0 && d < tw0; }).reduce((s, r) => s + calcVol(r), 0);
                    newThisVol = Math.round(twVol);
                    newLastVol = lwVol > 0 ? Math.round(lwVol) : null;
                    setThisVol(newThisVol);
                    setLastVol(newLastVol);
                    // ✅ 供主頁判斷「今天是否已完成重訓」→ 卡片改顯示已達標＋慶祝特效
                    setAllStrengthSessions(recs.map(r => ({ ...r, volume: calcVol(r) })));
                }
            } catch (_) { setDataErrors(previous => ({ ...previous, strength: true })); }

            // ── Write cache ────────────────────────────────────────────────
            writeCache({
                nutGoal: newNutGoal,
                nutAvg: newNutAvg,
                thisWeek: newThisWeek,
                lastWeek: newLastWeek,
                thisVol: newThisVol,
                lastVol: newLastVol,
            });
        } catch (e) { setDataErrors({ strength: true, cardio: true, nutrition: true }); console.error('[Dashboard]', e); }

        setDataReady(true);
    }, [userId]);

    useEffect(() => { fetchAll(); }, [fetchAll]);
    useEffect(() => {
        const fn = () => { if (document.visibilityState === 'visible') fetchAll(); };
        document.addEventListener('visibilitychange', fn);
        return () => document.removeEventListener('visibilitychange', fn);
    }, [fetchAll]);

    // 沒取過名字的計劃顯示「某某的健身計劃」，不是英文的 My Training Plan
    const planName = displayPlanName(plan?.plan_name || plan?.name, getDisplayName());
    const splitLabel = { foundation: 'PPL', precision: 'Bro Split', pulse: 'Full Body' }[plan?.split_type] || '';
    const dayNames = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

    // ── No more blocking spinner — page renders immediately, stats arrive via dataReady ──

    return (
        <div className="journey-dashboard" style={{
            width: '100%',
            minHeight: '100dvh',
            backgroundColor: C.page,
            fontFamily: '"Tenor Sans", sans-serif',
            overflowX: 'hidden',
            position: 'relative',
            color: C.textPrimary
        }}>
            {/* 首次啟用「計劃融合」→ 操作步驟教學（看過一次即不再出現） */}
            <FirstTimeHint
                show={fusionMode}
                tipKey="first-plan-fusion"
                title="計劃融合怎麼玩"
                steps={[
                    '點 2–3 個想融合的計劃',
                    '設定難度與每週天數',
                    '確認後開始 4 週課表',
                ]}
            />

            <div className="journey-dashboard__content" style={{ position: 'relative', zIndex: 1, paddingTop: 'max(20px,env(safe-area-inset-top,59px))', paddingBottom: 'var(--nav-clearance, 96px)' }}>

                {/* ── HEADER — single motion node, opacity+y only ── */}
                <motion.div
                    initial={{ opacity: 0, y: -14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
                    style={{ padding: '10px 18px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}
                >
                    <div>
                        <Lbl c={C.textPrimary} style={{ opacity: 0.5, fontWeight: 900, letterSpacing: '0.15em' }}>{plan ? `課表第 ${activeWeek} 週${splitLabel ? ` · ${splitLabel}` : ''}` : '我的訓練'}</Lbl>
                        <div style={{ overflow: 'hidden' }}>
                            {/* 標題固定、不做進場/切換動畫 */}
                            <h1
                                style={{ fontSize: 'clamp(24px, 4vw, 34px)', fontWeight: 500, color: C.textPrimary, fontFamily: '"Tenor Sans", sans-serif', lineHeight: 1, margin: '4px 0 0', letterSpacing: '-0.02em', textTransform: 'uppercase' }}
                            >
                                {planName}
                            </h1>
                        </div>
                    </div>
                    <Lbl c={C.textPrimary} style={{ opacity: 0.5, fontWeight: 900, letterSpacing: '0.15em' }}>{dayNames[new Date().getDay()]}</Lbl>
                </motion.div>

                {/* HERO CARD — Today's Session */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.18 }}
                    style={{ padding: '8px 14px 12px' }}
                >
                    {todayRunDone || todayStrengthDone ? (() => {
                        const done = todayRunDone || todayStrengthDone;
                        const isRun = Boolean(todayRunDone);
                        return <Tile className="journey-action-card" onClick={() => navigate(isRun ? '/cardio-tracker-mobile' : '/luxury-plan-view-mobile')}>
                            <div className="journey-stat-heading"><span>{isRun ? '今日跑步紀錄' : '今日重訓紀錄'}</span><CheckCircle2 size={18} /></div>
                            <h2 className="journey-task-title">{done.complete ? '今日訓練已完成' : '已儲存本次訓練'}</h2>
                            <p className="journey-muted">{isRun ? `${done.distanceKm ?? 0} km` : `${done.volumeKg ?? 0} kg`}{done.durationSec > 0 ? ` · ${Math.round(done.durationSec / 60)} 分鐘` : ''} · 查看紀錄</p>
                        </Tile>;
                    })() : curSlide === 'run' && todayRun ? (
                        <Tile className="journey-action-card journey-today-hero" glass={null}
                            style={planCover ? { backgroundImage: `url(${planCover})` } : undefined}
                            onClick={() => { triggerHaptic('light'); setShowRunPreview(true); }}>
                            <div className="journey-stat-heading"><span>今日跑步</span><Activity size={18} /></div>
                            <h2 className="journey-task-title">{titleForRun(todayRun.subtype || todayRun.type, todayRun.distance_km)}</h2>
                            <div className="journey-card-footer"><span>{todayRun.duration_min ? `預計 ${todayRun.duration_min} 分鐘` : '查看今日訓練內容'}</span><span>查看課程 <ArrowRight size={14} /></span></div>
                        </Tile>
                    ) : todayWorkout ? (
                        /* ── 今日重訓 = 整頁的 Hero ──────────────────────────────
                           課程本身帶了一張封面照（course.coverImage，啟用時一起寫進
                           currentPlan），但這張卡一直沒有用它，於是整頁最重要的一張
                           卡變成一片白底。照片＋暗罩做成深色 Hero，淺色字壓在上面；
                           沒有封面的計劃（引擎生成的）退回暗拉絲鈦金屬，一樣是深色錨點。 */
                        <Tile className="journey-action-card journey-today-hero" glass={null}
                            style={todayHeroStyle}
                            onClick={() => {
                            if (plan?.id) navigate('/plan-tracking', { state: { planId: plan.id } });
                            else navigate('/luxury-plan-view-mobile', { state: { autoExpandDay: todayWorkout.dayNumber } });
                        }}>
                            <div className="journey-stat-heading"><span>今日重訓</span><Dumbbell size={18} /></div>
                            <h2 className="journey-task-title">{todayWorkout.focus || todayWorkout.name || '今日課程'}</h2>
                            <div className="journey-card-footer"><span>{todayWorkoutMin ? `約 ${todayWorkoutMin} 分鐘 · ` : ''}第 {activeWeek} 週 · 第 {todayWorkout.dayNumber} 堂</span><span>查看課程 <ArrowRight size={14} /></span></div>
                        </Tile>
                    ) : (() => {
                        const makeup = todayAgenda?.makeup?.payload ? todayAgenda.makeup : null;
                        return <Tile className="journey-action-card" onClick={makeup ? () => { triggerHaptic('light'); setShowWorkoutPreview(makeup.payload); } : undefined}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20 }}>
                            <div className="journey-action-icon">{makeup ? <Dumbbell size={20} /> : <Moon size={20} />}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <h2 className="journey-task-title">{makeup ? `課表本週尚有 ${makeup.remaining} 堂` : '今天沒有安排訓練'}</h2>
                                <p className="journey-muted">{makeup ? `可選補課 · ${[makeup.name, makeup.parts].filter(Boolean).join(' · ')}` : '可休息，或到計劃管理調整安排。'}</p>
                            </div>
                            {makeup && <span className="journey-action-link">查看課程 <ArrowRight size={14} /></span>}
                        </Tile>;
                    })()}

                    {/* 輪播指示點：今天有重訓＋跑步兩個 session 時可點擊切換 */}
                    {sessionSlides.length > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 7, marginTop: 12 }}>
                            {sessionSlides.map((s, i) => (
                                <button key={s} onClick={() => setSlideIdx(i)} aria-label={s === 'run' ? '查看今日跑步' : '查看今日重訓'} aria-pressed={i === safeIdx}
                                    style={{ width: 44, height: 24, borderRadius: 99, border: 'none', cursor: 'pointer', padding: 0, transition: 'all 0.25s', background: i === safeIdx ? C.textPrimary : 'rgba(22,20,21,0.18)' }} />
                            ))}
                        </div>
                    )}

                    {/* 今日跑步 brick 預覽：點「開始」直接看今天該跑的內容，再從這裡開始 */}
                    <AnimatePresence>
                        {showRunPreview && todayRun && (
                            <CardioBrickDetailSheet brick={todayRun} onClose={() => setShowRunPreview(false)} />
                        )}
                    </AnimatePresence>

                    {/* 補課／今日課表預覽 — 點卡片直接跳出，並可直接開始訓練 */}
                    <AnimatePresence>
                        {showWorkoutPreview && (
                            <WorkoutPreviewSheet
                                day={showWorkoutPreview}
                                cardColor="#161415"
                                onStart={(dayWithGym) => { const d = dayWithGym || showWorkoutPreview; setShowWorkoutPreview(null); triggerHaptic('heavy'); navigate('/training-session-mobile', { state: { day: d } }); }}
                                onClose={() => setShowWorkoutPreview(null)}
                            />
                        )}
                    </AnimatePresence>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1], delay: 0.32 }}
                >
                    <PlanRoadmapCarousel
                        userId={userId}
                        fusionMode={fusionMode}
                        setFusionMode={setFusionMode}
                        selectedIdxs={selectedIdxs}
                        setSelectedIdxs={setSelectedIdxs}
                    />
                </motion.div>

                <section className="journey-summary" aria-label="本週紀錄">
                    <div className="journey-section-heading">
                        <h2>本週紀錄</h2><span>週一至今天</span>
                    </div>
                    {/* ── 讀不到資料時：整塊統計不渲染，只留一張「去把它讀回來」的動作卡 ──
                        （介面標準 §5：沒資料就只顯示該做的那一件事）
                        原本是三張卡照樣畫出來、每張都填「—」，上面再浮一行
                        「部分紀錄暫時無法載入」＋一顆文字按鈕。同一句「我沒有資料」
                        講了四遍，而那行提示既不知道在講哪張卡，也不像可以點。 */}
                    {!dataReady ? (
                        <div className="journey-stats-grid">
                            {[0, 1, 2].map(i => <div key={i} className="journey-stat-skeleton ti-skeleton" />)}
                        </div>
                    ) : allStatsFailed ? (
                        <Tile className="journey-action-card" onClick={() => { triggerHaptic('light'); fetchAll(); }}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20 }}>
                            <div className="journey-action-icon"><RefreshCw size={20} /></div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <h2 className="journey-task-title">重新載入本週紀錄</h2>
                                <p className="journey-muted">目前連不上伺服器，先讀不到這週的數字。</p>
                            </div>
                            <ArrowRight size={16} style={{ color: C.textDim, flexShrink: 0 }} />
                        </Tile>
                    ) : (
                    <div className="journey-stats-grid">
                        {/* 三張卡按「材質 ＋ 溫度」分層：暖鈦金屬（前景）→ 墨黑深面（錨）→ 冷霧面（退後的地）。
                            原本三張都被 CSS 的 !important 壓成同一片玻璃白 ——
                            墨黑卡連自己的深底都被蓋掉，淺色字就這樣貼在白底上（截圖裡那張看不見的卡）。 */}
                        <Tile className="journey-stat journey-stat--strength" glass={null}
                            onClick={() => navigate('/luxury-plan-view-mobile')}>
                            <div className="journey-stat-heading"><span>重訓總訓練量</span><Dumbbell size={17} /></div>
                            {dataErrors.strength ? <StatUnavailable onRetry={fetchAll} />
                                : thisVol > 0 ? <>
                                    <div className="journey-stat-value">{thisVol.toLocaleString()}<small>kg</small></div>
                                    {weekComp.total > 0 && <div className="journey-plan-progress"><span>課表第 {activeWeek} 週</span><strong>{weekComp.done} / {weekComp.total} 堂完成</strong></div>}
                                </> : <StatEmpty action="做第一堂重訓" />}
                        </Tile>

                        <Tile className="journey-stat journey-stat--dark" glass={null}
                            onClick={() => navigate('/cardio-tracker-mobile')}>
                            <div className="journey-stat-heading"><span>跑步總距離</span><Activity size={17} /></div>
                            {dataErrors.cardio ? <StatUnavailable onRetry={fetchAll} onDark />
                                : thisWeek.km > 0 ? <div className="journey-stat-value">{thisWeek.km}<small>km</small></div>
                                : <StatEmpty action="記錄第一次跑步" onDark />}
                        </Tile>

                        <Tile className="journey-stat journey-stat--mist" glass={null}
                            onClick={() => navigate('/nutrition-mobile')}>
                            <div className="journey-stat-heading"><span>每日平均攝取</span><Utensils size={17} /></div>
                            {dataErrors.nutrition ? <StatUnavailable onRetry={fetchAll} />
                                : nutAvg.days > 0 ? <>
                                    <div className="journey-stat-value">{nutAvg.calories}<small>大卡</small></div>
                                    <div className="journey-plan-progress"><span>{nutAvg.days} 天平均</span><strong>{nutAvg.protein == null ? '蛋白質未記錄' : `蛋白質 ${nutAvg.protein} g`}</strong></div>
                                </> : <StatEmpty action="記一餐" />}
                        </Tile>
                    </div>
                    )}
                    <div className="journey-section-heading journey-section-heading--body"><h2>身體數據</h2></div>
                    {inbody ? (
                        <Tile glass="frost" className="journey-body-card" onClick={() => navigate('/body-analysis-mobile')}>
                            <div className="journey-stat-heading"><span><Scale size={17} /> InBody</span><span>{inbody.measurement_date || inbody.date || '日期未記錄'}</span></div>
                            <div className="journey-body-grid">
                                {[
                                    { key: 'weight', label: '體重', val: inbody.weight_kg, unit: 'kg', diff: delta?.weight },
                                    { key: 'muscle', label: '骨骼肌量', val: inbody.skeletal_muscle_mass, unit: 'kg', diff: delta?.muscle },
                                    { key: 'fat', label: '體脂率', val: inbody.body_fat_percent, unit: '%', diff: delta?.fat },
                                ].map(item => {
                                    /* 變好＝珊瑚、變差＝DRVN 綠；持平或看不出好壞（沒有目標的體重）＝原本的灰。
                                       肌肉多＝好、體脂低＝好；體重看目標：有目標體重 → 離目標更近才算好，
                                       沒有目標就看飲食計劃是減脂還是增肌，維持期不上色。 */
                                    const d = Number(item.diff);
                                    let tone = null;
                                    if (item.diff != null && d !== 0 && Number.isFinite(d)) {
                                        if (item.key === 'muscle') tone = d > 0 ? 'good' : 'bad';
                                        else if (item.key === 'fat') tone = d < 0 ? 'good' : 'bad';
                                        else {
                                            const cur = Number(item.val), tgt = Number(weightGoal.target);
                                            if (tgt > 0 && cur > 0) tone = Math.abs(cur - tgt) < Math.abs(cur - d - tgt) ? 'good' : 'bad';
                                            else if (weightGoal.mode === 'cutting') tone = d < 0 ? 'good' : 'bad';
                                            else if (weightGoal.mode === 'bulking') tone = d > 0 ? 'good' : 'bad';
                                        }
                                    }
                                    const color = tone === 'good' ? '#F95C4B' : tone === 'bad' ? '#5A7A3A' : undefined;
                                    return <div key={item.label}>
                                        <span>{item.label}</span>
                                        <strong>{positiveGoal(item.val) ?? '—'}<small>{item.unit}</small></strong>
                                        {item.diff != null && <p style={color ? { color, fontWeight: 700 } : undefined}>{d === 0 ? '持平' : `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} ${item.unit}`}</p>}
                                    </div>;
                                })}
                            </div>
                            <div className="journey-card-footer"><span>{monthLabel ? `比較 ${monthLabel}` : '新增測量後可比較'}</span><span>完整分析 <ArrowRight size={14} /></span></div>
                        </Tile>
                    ) : <Tile glass="frost" className="journey-body-card" onClick={() => navigate('/body-analysis-mobile')}>
                        <div className="journey-stat-heading"><span>尚無身體測量紀錄</span><Plus size={18} /></div>
                        <p className="journey-muted">新增 InBody，追蹤體重、肌肉量與體脂率。</p>
                    </Tile>}
                </section>

            {/* 🛤️ Since Day 1 — 自從加入 DRVN 的真實變化總結。
                放在內容區最後：上面全部是「接下來要幹嘛」，走過的路擺在最後回頭看。

                ⚠️⚠️ 這張卡一定要留在 zIndex:1 的內容層「裡面」。
                   它本來被放在這個 </div> 的外面，變成整頁根節點的直接子元素 ——
                   而根節點底下還有一層 fixed inset-0 z-0 的背景層。
                   CSS 繪製順序：沒有 position 也沒有 transform 的區塊，背景畫在
                   第 4 階；有 z-index 的定位元素畫在第 8 階。所以那層背景會蓋在
                   這張卡的底色上，整張卡變成「畫面上只剩那條珊瑚細線」。
                   （進場動畫跑的時候 framer 會寫 transform、卡片暫時浮上來看得到，
                     動畫結束 transform 變回 none 就又沉下去 —— 所以它是「閃一下就不見」，
                     以前才會被誤判成透明度的問題。）
                   內容層有 zIndex:1，放進來就永遠在背景之上。 */}
            {!fusionMode && <JourneySinceCard userId={userId} />}
            </div>

            {/* 🔥 Hide navigation when Fusion Action Bar is active to prevent overlap */}
            {/* 🎉 當日達標的同理時刻 — 一句陪伴語 + 三個真實數字，每日只播一次。
                跑步與重訓共用同一個元件（元件內以 per-user + 日期 key 去重）。 */}
            {/* 🩹 2026-08 稽核：慶祝的條件改成「真的完成」而不是「有紀錄」。
                以前 12 組只做 1 組（8%）也會跳出跟做滿一樣的「辛苦了。今天有出門、有完成。」
                現在未達 80% 的日子仍然會保留摘要卡與紀錄，只是不彈慶祝頁 ——
                部分完成不是失敗，但也不該和做滿領同一句話。
                注意：算不出分母的自由訓練 / 自由跑，complete 會是 true（見 dailyAgenda 的
                gradeCompletion），所以這個改動不會誤傷沒有計劃的人。 */}
            {((todayRunDone?.complete) || (todayStrengthDone?.complete)) && (
                <DailyGoalCelebration
                    open
                    userId={userId}
                    dateKey={logicalDayKey()}
                    kind={todayRunDone?.complete ? 'run' : 'strength'}
                    stats={todayRunDone?.complete ? {
                        distanceKm: todayRunDone.distanceKm,
                        durationSec: todayRunDone.durationSec,
                        paceSec: todayRunDone.paceSec,
                    } : {
                        volumeKg: todayStrengthDone.volumeKg,
                        durationSec: todayStrengthDone.durationSec,
                        sets: todayStrengthDone.sets,
                    }}
                    prCount={(todayRunDone?.complete ? todayRunDone : todayStrengthDone)?.prCount || 0}
                    weekCount={(todayRunDone?.complete ? todayRunDone : todayStrengthDone)?.count || 0}
                    streakDays={0}
                    onClose={() => { /* 自動去重，無需額外狀態 */ }}
                />
            )}

            {/* Navigation is owned by App; avoid duplicate gesture surfaces. */}
            <style>{`
                @keyframes bannerShimmer {
                    from { transform: translateX(-100%) skewX(-12deg); }
                    to   { transform: translateX(350%) skewX(-12deg); }
                }
            `}</style>
        </div>
    );
};

export default MasterJourneyDashboard;
