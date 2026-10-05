import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { readJSON } from '../utils/safeStorage';
import { activateStrengthPlan, resetStrengthPlanCompletion, readStrengthPlanDays } from '../utils/strengthPlanCompletion';
import { EquipmentIcon } from '../utils/drvnIcons';
import { getDisplayName } from '../utils/socialIdentity';
import { displayPlanName } from '../utils/planNaming';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { SwissMaskLine, SwissHairline, ease, dur } from '../utils/swissMotion.jsx';
import { GripVertical, ChevronRight, Play, Target, Zap, Flame, Activity, Edit2, BarChart3, BookOpen, Clock, Award, Plus, CheckCircle2, Sparkles, Map, Check, Trash2, X, Search, RefreshCcw, ArrowLeft, Heart, Moon, Lock, TrendingUp, MapPin } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import { useNavigate, useLocation } from 'react-router-dom';
import RecoverySculptureBento from './LoeweMuscleSculpture';
import RestDayHeroCard from './RestDayHeroCard';
import MobileNavigation from './MobileNavigation';
import BodyTargetVisualizer from './BodyTargetVisualizer';
import TrainingAnalyticsDashboard from './TrainingAnalyticsDashboard';
import { getMuscleRecoveryScores, readinessFromScores } from '../utils/muscleRecoveryTracker';
import { getTodayReadiness } from '../utils/readiness';
import { canAddCompoundSet, canShiftIntensity, suggestNextFocus, diffRowText, swapOptionsFor, measureSeason, decideSeason, seasonPlateau, rotateStrengthSeason, daysSinceLastSession, prevSeasonTonnage, redesignSeasonHistory } from '../utils/seasonTransition';
import { uStorage } from '../utils/userStorage';
import indexedDBManager from '../utils/indexedDB';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { requestBackgroundSync } from '../utils/serviceWorkerRegistration';
import { WeekFeedbackModal, FeedbackResultModal, useWeekCompletionTracker } from './WeekFeedbackUI';
import { processWeeklyFeedback, applyFeedbackToPlan, applyLevelToWholePlan } from '../utils/ProgressiveTrainingSystem';
import { gateStrengthProgression } from '../utils/memberProgression';
import { isMember, openPaywall } from '../utils/membership';
import MemberLockCard from './MemberLockCard';
import { recommendFromRPE, getCycleRPESummary } from '../utils/rpeHistoryReader';
import { buildE1RMTable, detectPlateau, calibrationStatus } from '../utils/e1rmAdvisor';
import { DEMO_PLAN } from '../data/demoPlanData';
import apiClient from '../api/client';
import { defaultStrengthWeekdays } from '../utils/dailyAgenda';
import { ONBOARDING_STATE_EVENT } from './OnboardingSpotlight';
import { getCategorizedGlobalLibrary } from '../data/globalExerciseRegistry';
import WorkoutPreviewSheet from './WorkoutPreviewSheet';
import { SeasonChangeList, SeasonAppliedSheet, SwapChooserSheet } from './SeasonChangeList';
import { ExercisePicker } from './ExercisePicker';
import { loadGymMemory, primaryGymFor, gymBlocker, gymMissingFn } from '../utils/gymMemory';
import PlanFullViewSheet from './PlanFullViewSheet';
import DataPulse from './ui/DataPulse';
import BespokeAmbientGlow from './ui/BespokeAmbientGlow';
import { editorialColors } from '../utils/colors';
import { confirmDialog, toast } from '../utils/toast';
import { T } from '../utils/theme';
import { getExerciseNameZh } from '../utils/exerciseDB';
import { haptic } from '../utils/haptics';
import { markReviewed, cycleShownKey } from '../utils/trainingFocus';   // 收官看過 → 首頁「去看回饋」同步停止
import { saveRedesignSnapshot, redesignHeadline } from '../utils/planRedesignDiff';   // 換部位重排：先存舊計劃，回來比對改了什麼
import { afterMomentIdle } from '../utils/momentEngine';

/** 本地日期鍵 YYYY-MM-DD（不要用 toISOString，那是 UTC，跨時區會差一天） */
const toLocalDayKey = (d) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};


// ── Unified palette (Image 3 spec) — 暖調中性 + 單一點睛色 ───────────────
const C = editorialColors;

// "My Notes" Aesthetic Styles
const MyNotesStyles = () => (
    <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Tenor+Sans&display=swap');
        
        /* Liquid Glass Utilities - iOS 26 Pebble Tint (.glassEffect(.tint(pebble))) */
        .glass-panel {
            /* 1. Pebble Tint：使用 45% 透明度的 Pebble 色作為濾鏡，保留背景穿透性 */
            background: rgba(207, 198, 184, 0.45);
            
            /* 2. Refraction (折射)：iOS 26 標準的高強度模糊與飽和度提升 */
            backdrop-filter: blur(48px) saturate(150%);
            -webkit-backdrop-filter: blur(48px) saturate(150%);
            
            /* 3. Hairline：極細的半透明白邊，取代生硬的實色邊框 */
            border: 1px solid rgba(255, 255, 255, 0.15);
            
            /* 4. Depth & Light (核心)：
               - inset 0 1px 1px：模擬頂部邊緣吃到環境光的 Specular Highlight (高光)
               - inset 0 0 0 1px：極微弱的內輪廓，撐起玻璃厚度
               - 0 18px 48px：柔和且擴散的環境陰影，讓玻璃浮起來 
            */
            box-shadow: 
                inset 0 1px 1px rgba(255, 255, 255, 0.85), 
                inset 0 0 0 1px rgba(255, 255, 255, 0.25),
                0 18px 48px -12px rgba(22, 20, 21, 0.2);
        }

        .glass-card {
            /* 次級玻璃 (降階處理)：降低透明度與模糊半徑，建立層次感 */
            background: rgba(207, 198, 184, 0.25);
            backdrop-filter: blur(32px) saturate(150%);
            -webkit-backdrop-filter: blur(32px) saturate(150%);
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 
                inset 0 1px 1px rgba(255, 255, 255, 0.6), 
                inset 0 0 0 1px rgba(255, 255, 255, 0.12),
                0 12px 32px -8px rgba(22, 20, 21, 0.12);
        }
        .glass-card-dark {
            background: rgba(22, 20, 21, 0.85);
            backdrop-filter: blur(20px) saturate(150%);
            border: 1px solid rgba(255, 255, 255, 0.15);
            box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.2), 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        /* Modern Scrollbar */
        .no-scrollbar::-webkit-scrollbar {
            display: none;
        }
        .no-scrollbar {
            -ms-overflow-style: none;
            scrollbar-width: none;
        }
        
        ::-webkit-scrollbar {
            width: 0px;
            background: transparent;
        }

        :root {
            --bg-primary: #161415;       /* Deep Black */
            --bg-card-dark: #262523;     /* Off-Black Card */
            --text-primary: #F6F4F1;     /* Paper */
            --text-secondary: #CFC6B8;   /* Pebble */
            --text-black: #000000;       /* Black (for colorful cards) */
            
            /* Colorful Palette (Figure 2) */
            --card-stone: #E4DED2;
            --card-pebble: #CFC6B8;
            --card-coral: #F95C4B;
            --card-ember: #D94030;
            --card-paper: #F6F4F1;
        }

        * {
            font-family: 'Tenor Sans', sans-serif !important;
        }


        .font-reenie {
            font-family: 'Reenie Beanie', cursive;
        }

        /* 調整 Tenor Sans 的特定粗細與間距感 */
        .font-black {
            font-weight: 800;
            letter-spacing: -0.02em;
        }
        
        .font-bold {
            font-weight: 700;
        }
        
        .font-medium {
            font-weight: 500;
        }
    `}</style>
);

const formatFocusLabel = (focus) => {
    if (!focus) return 'TRAINING';
    if (focus.includes('+')) return focus;
    const mainPart = focus.split('(')[0].trim();
    const subPart = focus.match(/\((.+)\)/)?.[1] || '';
    return subPart || mainPart;
};

// Parse focus string like "Push — Chest / Shoulders / Triceps"
// Returns { sessionType: "PUSH", muscles: ["Chest", "Shoulders", "Triceps"] }
const parseFocusChips = (focus) => {
    if (!focus) return { sessionType: 'TRAINING', muscles: [] };
    const parts = focus.split(/—|–/);
    const sessionType = (parts[0] || '').trim().toUpperCase();
    const muscleStr = (parts[1] || '').trim();
    const muscles = muscleStr
        ? muscleStr.split('/').map(m => m.trim()).filter(Boolean)
        : [];
    return { sessionType, muscles };
};

// Equipment label → uppercase display string
const EQ_LABEL = {
    barbell: '槓鈴', dumbbell: '啞鈴', cable: '纜繩',
    machine: '機械', bodyweight: '自重', band: '彈力帶',
};

// Inline muscle-target + equipment subtitle (sync lookup from globalExerciseRegistry)
const ExerciseMeta = React.memo(({ ex }) => {
    const [meta, setMeta] = useState({ targetLabel: '', eqLabel: '' });
    useEffect(() => {
        if (!ex?.name) return;
        import('../data/globalExerciseRegistry').then(({ analyzeExercise }) => {
            try {
                const info = analyzeExercise(ex);
                setMeta({
                    targetLabel: info.targetLabel || '',
                    eqLabel: EQ_LABEL[ex.eq] || (ex.eq || '').toUpperCase(),
                });
            } catch {
                setMeta({ targetLabel: '', eqLabel: EQ_LABEL[ex.eq] || (ex.eq || '').toUpperCase() });
            }
        });
    }, [ex?.name, ex?.eq]);

    if (!meta.targetLabel && !meta.eqLabel) return null;
    return (
        <p style={{ fontSize: 11, color: '#F95C4B', margin: '2px 0 0', letterSpacing: '0.06em', fontWeight: 600 }}>
            {meta.targetLabel}
            {meta.targetLabel && meta.eqLabel && <span style={{ color: 'rgba(22,20,21,0.30)', margin: '0 6px' }}>·</span>}
            {/* 🆕 器材標籤加深，避免淺灰隱形 */}
            <span style={{ color: 'rgba(22,20,21,0.62)' }}>{meta.eqLabel}</span>
        </p>
    );
});

// Exercise row card — image from exerciseDB API
const ExerciseRowCard = React.memo(({ ex, size = 52 }) => {
    const [imgSrc, setImgSrc] = useState(null);
    const [imgErr, setImgErr] = useState(false);

    useEffect(() => {
        if (!ex?.name) return;
        let cancelled = false;
        import('../utils/exerciseDB').then(({ findExerciseByName }) => {
            findExerciseByName(ex.name).then(data => {
                if (!cancelled && data?.gifUrl) setImgSrc(data.gifUrl);
            });
        });
        return () => { cancelled = true; };
    }, [ex?.name]);

    /* 🎯 UI 無 emoji（Definition §6.3）：器材圖示改用 lucide 線性圖示。
       emoji 是彩色的、跨系統長得不一樣，會破壞「一頁一個 Coral」的色彩預算。 */

    return (
        <div style={{
            width: size, height: size, flexShrink: 0, borderRadius: 12,
            overflow: 'hidden', background: '#E4DED2',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            {imgSrc && !imgErr ? (
                <img loading="lazy" decoding="async"
                    src={imgSrc}
                    alt={ex?.name}
                    onError={() => setImgErr(true)}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
            ) : (
                <EquipmentIcon type={ex?.eq} size={Math.round(size * 0.36)} strokeWidth={1.7} style={{ color: 'currentColor', opacity: 0.75 }} />
            )}
        </div>
    );
});

/* ══════════════════════════════════════════════════════════════════════
 * Liquid Glass Toolbar — iOS 26 Refraction Style
 * ──────────────────────────────────────────────────────────────────────
 * • No border dividers — glass merges naturally via hover/active dimple
 * • Multi-layer refraction: blur + saturate + 1px inner highlight + sheen
 * • Hover halo: cursor 位置產生玻璃凹陷光暈
 * • Active dimple: pressed scale + inner shadow inversion (玻璃被按出凹陷)
 * • Regen 跨出 pill 作為獨立主 CTA
 * ══════════════════════════════════════════════════════════════════════ */
const LiquidGlassToolbar = React.memo(function LiquidGlassToolbar({
    navigate, setShowFullPlan,
}) {
    const tools = [
        /* 📚 動作庫 —— 2026-09 從首頁右上角搬過來。
           「我想查一個動作怎麼做」是健身情境，不是開 App 第一眼的情境；
           放在課表這一頁，跟「看紀錄／改課表／設定」同一排才找得到。
           ⚠️ 標籤是 aria-label，用中文（§3 全中文）；其餘三顆的英文標籤一併改掉。 */
        { key: 'library', icon: BookOpen, label: '動作庫', onClick: () => navigate('/exercise-library-mobile') },
        { key: 'analytics', icon: BarChart3, label: '訓練紀錄', onClick: () => navigate('/training-record-mobile') },
        /* ✏️ 編輯計劃 —— 2026-09 把「編輯課表」與「自訂計劃」合成一顆：
           兩顆都在「改我的課表」，只是一個改動作、一個用訓練區塊拼。
           現在編輯頁裡每一天都能套用／存成區塊，右上角進計劃庫。 */
        { key: 'edit', icon: Edit2, label: '編輯計劃', onClick: () => setShowFullPlan(true) },
        /* 📍 健身房記憶：去過哪些健身房、每間有／沒有什麼器材 */
        { key: 'gym', icon: MapPin, label: '健身房記憶', onClick: () => navigate('/gym-memory-mobile') },
    ];

    // 順序：工具 → 重新生成（prominent 黑底）
    // 【2026-09】移除最右的免計劃閃電鍵（mist 雲朵 + 呼吸燈）——
    //   「直接開始訓練（免計劃）」在頁面下方已有入口，頂部不需要第二個。
    const allTools = [
        ...tools,
        {
            key: 'regen', icon: RefreshCcw, label: '重新生成計劃', prominent: true,
            onClick: async () => {
                const confirmed = (await confirmDialog('確定要重新生成訓練計劃嗎？'));
                if (confirmed) navigate('/workout-plan-mobile');
            },
        },
    ];

    return (
        <motion.div
            data-onboard="plan-toolbar"
            className="mt-4 relative w-full flex items-center"
            /* 5 顆 × 58px ＝ 290，加 4 個間距。375 寬的 SE 扣掉 px-3 只剩 351，
               gap 16 會剛好卡到邊，收到 12 留餘裕。 */
            style={{ gap: 12 }}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.32, duration: dur.standard, ease: ease.decel }}
        >
            {/* ── 五顆獨立圓形液態玻璃鍵（iOS 26 Liquid Glass）：均勻橫向分布 ── */}
            {allTools.map((tool) => (
                <GlassCircleButton
                    key={tool.key}
                    icon={tool.icon}
                    label={tool.label}
                    prominent={tool.prominent}
                    mist={tool.mist}
                    breathing={tool.breathing}
                    onClick={tool.onClick}
                />
            ))}
        </motion.div>
    );
});

/* ── 單顆圓形液態玻璃按鈕：模糊 + 高光反射 + 互動凹陷 ───────────────── */
const GlassCircleButton = React.memo(function GlassCircleButton({ icon: Icon, label, prominent, mist, breathing, onClick }) {
    const [pressed, setPressed] = useState(false);
    const [hover, setHover] = useState(false);
    const SIZE = 58;

    // mist：misty grey 底（DRVN Mist #E8E9E6）
    const bg = prominent
        ? 'radial-gradient(120% 120% at 50% 0%, rgba(60,56,52,0.92) 0%, rgba(22,20,21,0.92) 70%)'
        : mist
            ? 'radial-gradient(120% 120% at 50% 0%, #EEEFEC 0%, #E8E9E6 70%)'
            : 'radial-gradient(120% 120% at 50% 0%, rgba(255,255,255,0.55) 0%, rgba(246,244,241,0.30) 100%)';

    return (
        <motion.button
            aria-label={label}
            onClick={onClick}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => { setHover(false); setPressed(false); }}
            onMouseDown={() => setPressed(true)}
            onMouseUp={() => setPressed(false)}
            onTouchStart={() => setPressed(true)}
            onTouchEnd={() => setPressed(false)}
            animate={{ scale: pressed ? 0.92 : hover ? 1.05 : 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 24 }}
            className="relative flex items-center justify-center shrink-0"
            style={{
                flex: 1,
                maxWidth: prominent ? SIZE * 1.0 : SIZE,
                height: SIZE,
                borderRadius: '50%',
                border: 'none',
                cursor: 'pointer',
                background: bg,
                backdropFilter: 'blur(24px) saturate(180%)',
                WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                color: prominent ? '#F6F4F1' : 'rgba(22,20,21,0.66)',
                boxShadow: prominent
                    ? 'inset 0 1px 1px rgba(255,255,255,0.22), inset 0 -3px 6px rgba(0,0,0,0.35), 0 8px 22px -8px rgba(0,0,0,0.45)'
                    : 'inset 0 1px 1px rgba(255,255,255,0.9), inset 0 -3px 6px rgba(22,20,21,0.06), 0 8px 22px -10px rgba(22,20,21,0.22)',
            }}
        >
            {/* 上緣鏡面高光（specular sweep） */}
            <span
                className="absolute pointer-events-none"
                style={{
                    top: 4, left: '18%', right: '18%', height: '40%',
                    borderRadius: '50%',
                    background: prominent
                        ? 'linear-gradient(to bottom, rgba(255,255,255,0.18), transparent)'
                        : 'linear-gradient(to bottom, rgba(255,255,255,0.85), transparent)',
                    filter: 'blur(1px)',
                }}
            />
            {/* 呼吸燈：coral 光暈在 icon 後面脈動（breathing） */}
            {breathing && (
                <motion.span aria-hidden
                    animate={{ opacity: [0.25, 0.7, 0.25], scale: [0.85, 1.15, 0.85] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ position: 'absolute', width: 30, height: 30, borderRadius: '50%', background: 'radial-gradient(circle, rgba(249,92,75,0.6) 0%, transparent 70%)', zIndex: 1 }}
                />
            )}
            {/* 中間圖示：coral 色 */}
            <Icon size={prominent ? 18 : 19} strokeWidth={1.9} style={{ color: C.coral, position: 'relative', zIndex: 2 }} />
        </motion.button>
    );
});

/* ── 單一 icon 按鈕：hover halo + active dimple，無 border 分隔 ─────────── */
const GlassToolButton = React.memo(function GlassToolButton({ children, onClick, label, dim }) {
    const [hover, setHover] = useState(false);
    const [pressed, setPressed] = useState(false);

    return (
        <motion.button
            aria-label={label}
            onClick={onClick}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => { setHover(false); setPressed(false); }}
            onMouseDown={() => setPressed(true)}
            onMouseUp={() => setPressed(false)}
            onTouchStart={() => setPressed(true)}
            onTouchEnd={() => setPressed(false)}
            // 引入 Framer Motion 的流體彈簧物理特性
            animate={{
                scale: pressed ? 0.92 : hover ? 1.04 : 1
            }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="relative flex items-center justify-center rounded-full"
            style={{
                width: 40,
                height: 40,
                // Liquid Glass: Hover Halo (懸浮光暈) vs Active Dimple (按壓凹陷)
                background: pressed
                    ? 'radial-gradient(circle at 50% 100%, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.02) 60%, transparent 100%)'
                    : hover
                        ? 'radial-gradient(circle at 50% 0%, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.15) 70%, transparent 100%)'
                        : 'transparent',
                // 模擬玻璃厚度的折射與內陰影反轉
                boxShadow: pressed
                    ? 'inset 0 4px 8px rgba(0,0,0,0.12), inset 0 -1px 2px rgba(255,255,255,0.6)'
                    : hover
                        ? 'inset 0 1px 1px rgba(255,255,255,0.9), 0 4px 12px rgba(0,0,0,0.06)'
                        : 'none',
                color: dim
                    ? (hover ? 'rgba(22,20,21,0.8)' : 'rgba(22,20,21,0.4)')
                    : (hover ? '#161415' : 'rgba(22,20,21,0.65)'),
            }}
        >
            {children}
        </motion.button>
    );
});

/* 🩹 2026-08 稽核：App.jsx 一直有傳 onBack 進來，但這個元件從來沒有解構它，
   整支檔案 grep `onBack` 是 0 筆 —— 也就是課表總覽（重訓系統的主入口頁）
   完全沒有返回路徑，使用者進來之後只能靠底部 Tab 或系統手勢離開。
   這裡把 prop 接回來，並在 header 補上返回鍵；沒傳 onBack 時退回 /mobile-home。 */
/* 「開始訓練」的呼吸 —— 這顆是整頁唯一要人現在動手的按鈕，
   讓它自己輕輕起伏，眼睛會先落在它身上。
   2.8 秒一次、幅度只有 1.5%，不是會晃到人的動畫；
   使用者把系統動態效果關掉時完全不動（介面標準 §7）。 */
const BREATHE = {
    scale: [1, 1.015, 1],
    boxShadow: [
        '0 14px 30px -10px rgba(217,64,48,0.30), inset 0 2px 3px rgba(255,255,255,0.55), inset 0 -2px 6px rgba(180,40,28,0.14)',
        '0 20px 40px -10px rgba(217,64,48,0.42), inset 0 2px 3px rgba(255,255,255,0.68), inset 0 -2px 6px rgba(180,40,28,0.14)',
        '0 14px 30px -10px rgba(217,64,48,0.30), inset 0 2px 3px rgba(255,255,255,0.55), inset 0 -2px 6px rgba(180,40,28,0.14)',
    ],
};
const BREATHE_T = { duration: 2.8, repeat: Infinity, ease: 'easeInOut' };

/** 計劃有幾週就回傳 [1..n]（以前寫死 [1,2,3,4]，6、8 週的課第 5 週之後永遠不會前進）。 */
const weekNumsOf = (p) => Array.from({ length: Math.max(1, p?.weeks?.length || 4) }, (_, i) => i + 1);

const LuxuryPlanViewMobile = ({ userId, onBack }) => {
    // 系統把動態效果關掉時，「開始訓練」就不呼吸（介面標準 §7）
    const reduceMotion = useReducedMotion();
    const navigate = useNavigate();
    /* 返回：優先用呼叫端給的 onBack（App.jsx 傳的是回首頁），
       沒給就退回 /mobile-home —— 不用 navigate(-1)，因為這頁常常是從
       中控台或深連結直接進來的，history 上一筆不一定是使用者想回去的地方。 */
    const handleBack = useCallback(() => {
        haptic('light');
        if (typeof onBack === 'function') onBack();
        else navigate('/mobile-home');
    }, [onBack, navigate]);
    const location = useLocation();

    // ── plan MUST be first state — prevents TDZ if other initializers reference it ──
    const [plan, setPlan] = useState(() => {
        return location.state?.plan || null;
    });

    const [loading, setLoading] = useState(!location.state?.plan);

    // 🎓 教學聚光燈進行中 → 若無真實計劃，暫時顯示示範計劃（圖五）讓教學有內容可教；
    //    教學一結束（或本來就有真實計劃）即恢復正常：無計劃就顯示重設計的空頁（圖四）。
    const [tutorialActive, setTutorialActive] = useState(false);
    useEffect(() => {
        const h = (e) => setTutorialActive(!!e.detail?.active);
        window.addEventListener(ONBOARDING_STATE_EVENT, h);
        return () => window.removeEventListener(ONBOARDING_STATE_EVENT, h);
    }, []);
    useEffect(() => {
        if (tutorialActive) {
            setPlan(prev => (!prev || prev?.isDemo) ? DEMO_PLAN : prev); // 無真實計劃 → 顯示示範
            setLoading(false);
        } else {
            setPlan(prev => (prev?.isDemo) ? null : prev); // 教學結束 → 移除示範 → 顯示空頁(圖四)
        }
    }, [tutorialActive]);

    const [activeWeek, setActiveWeek] = useState(1);
    const [expandedDay, setExpandedDay] = useState(() => {
        const params = new URLSearchParams(location.search);
        const day = params.get('day');
        return day ? parseInt(day) : 1;
    });

    // ── Persist activeWeek for Apple Watch plan sync ─────────────────────
    useEffect(() => {
        if (userId) localStorage.setItem(`activeWeek_${userId}`, String(activeWeek));
    }, [activeWeek, userId]);
    const [showAnalytics, setShowAnalytics] = useState(false);

    // ── 🛡️ 終極 Loading 守護者 (Watchdog) ──
    // 如果 5 秒後還在轉圈圈，強行關閉 Loading。確保使用者絕對不會被卡死。
    useEffect(() => {
        if (loading) {
            const timer = setTimeout(() => {
                console.warn('🕒 Loading watchdog triggered - forcing UI reveal');
                setLoading(false);
            }, 4500);
            return () => clearTimeout(timer);
        }
    }, [loading]);

    // ── WorkoutPreviewSheet state ──
    const [previewDay, setPreviewDay] = useState(null);
    const [previewCardColor, setPreviewCardColor] = useState('#FF9E80');
    const [previewWeekday, setPreviewWeekday] = useState('TODAY');
    const [showFullPlan, setShowFullPlan] = useState(false);

    // 🔁 週回顧提案入口：帶著 openFullEdit 進來（「把我的 Block 換進計劃」CTA）
    //    → 計劃載入後自動展開「編輯計劃」完整視圖，讓使用者直接替換訓練日。
    useEffect(() => {
        if (location.state?.openFullEdit && plan) {
            const t = setTimeout(() => setShowFullPlan(true), 450);
            return () => clearTimeout(t);
        }
        return undefined;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.state?.openFullEdit, !!plan]);



    /* 🩹 2026-08 稽核：中控台「這天可以減量」的深連結接點。
       比照下面 targetMuscleGroups 的既有寫法 —— 從 location.state 拿到
       「要指給使用者看哪一天」，頁面自己畫高亮。差別在這是「天」的層級，
       原本只有「肌群」層級的高亮機制。 */
    const highlightDayNumber = location.state?.highlightDayNumber ?? null;
    const reduceHint = location.state?.reduceHint || null;
    const [planHintDismissed, setPlanHintDismissed] = useState(false);

    const [targetMuscleGroups, setTargetMuscleGroups] = useState(() => {
        return location.state?.targetMuscleGroups || [];
    });

    const saveTimerRef = useRef(null); // 🔥 For debouncing
    const hasFetchedRef = useRef(false); // 🔥 Prevent double fetch in StrictMode
    const hasInitializedRef = useRef(false); // 🔥 Prevent duplicate initialization
    const initializationLockRef = useRef(false); // 🔥 Lock during initialization process
    const [saveStatus, setSaveStatus] = useState(null); // 🔥 saving | success | error

    // 🔥 新增：同步狀態
    const [lastSyncTime, setLastSyncTime] = useState(() => {
        const saved = localStorage.getItem(`lastSyncTime_${userId}`);
        return saved ? parseInt(saved) : null;
    });
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncError, setSyncError] = useState(null);

    // 直接用組件 loading state 驅動：有資料/快取即顯示，無資料顯示預設值
    const luxPatchReady = !loading;

    // 🔥 網絡狀態
    const { isOnline } = useNetworkStatus();

    // --- Progressive Feedback Logic ---
    const [showFeedbackResult, setShowFeedbackResult] = useState(false);
    const [feedbackAdjustments, setFeedbackAdjustments] = useState(null);


    // User body weight for calorie calculation
    const userWeightKg = useMemo(() => {
        try {
            const profile = JSON.parse(localStorage.getItem(`userProfile_${userId}`) || '{}');
            const w = Number(profile.weight_kg ?? profile.current_weight);
            // 沒量過就是 null —— 呼叫端要顯示「去補資料」，不是用 70 公斤估
            return Number.isFinite(w) && w > 20 && w < 300 ? w : null;
        } catch { return null; }
    }, [userId]);

    // Plan hashtags for "Designed For" section
    const planTags = useMemo(() => {
        if (!plan) return [];
        return plan.selected_hashtags
            || plan.selected_tags
            || readJSON(`userPlanTags_${userId}`, []);
    }, [plan, userId]);

    // Fetch latest plan to ensure persistence (fixes revision on navigate back)
    const hasShownWelcome = useRef(false);

    useEffect(() => {
        // 🔥 防止重複執行
        if (hasInitializedRef.current || initializationLockRef.current) {
            console.log('⏭️ Skipping duplicate initialization');
            return;
        }

        initializationLockRef.current = true;
        console.log('📥 [Mount] LuxuryPlanView initialized - FIRST TIME ONLY');

        // ── Ensure a plan has _originalSnapshot saved (plan-load baseline) ──
        // IMPORTANT: Only snapshot plans with NO feedback history yet.
        // If feedback has already been applied, the exercise values may be inflated
        // and creating a snapshot from them would corrupt the baseline.
        const ensureSnapshot = (p) => {
            if (!p) return p;
            if (p._originalSnapshot) return p;
            // Skip snapshot creation for plans that have already been modified by feedback.
            // These plans must use rebuildSnapshotFromBackend() to get a clean baseline.
            if (p._feedbackHistory?.length || p._intensityLevel) return p;
            // Fresh plan with no feedback → safe to snapshot current exercise values
            return {
                ...p,
                _originalSnapshot: p.weeks.map(wk => ({
                    days: (wk.days || []).map(day => ({
                        exercises: (day.exercises || []).map(ex => ({
                            name: ex.name, sets: ex.sets, reps: ex.reps, rest: ex.rest,
                        })),
                    })),
                })),
            };
        };

        const initializePlan = async () => {
            try {
                // 1. 優先使用 navigation state
                if (location.state?.plan) {
                    console.log('✅ Using plan from navigation state');
                    const navPlan = ensureSnapshot(location.state.plan);

                    // 切換課表時保留各課表完成紀錄，更新目前課表的相容鏡像。
                    try {
                        const incomingId = navPlan.plan_id || navPlan.id || null;
                        const lastActiveId = localStorage.getItem(`active_plan_id_${userId}`);
                        const isContinuing = location.state?.isActivePlan === true;
                        if (incomingId && incomingId !== lastActiveId && !isContinuing) {
                            // 清掉週回報/收官旗標，讓新計劃的回饋流程重新開始
                            weekNumsOf(navPlan).forEach(w => localStorage.removeItem(`week_feedback_${userId}_week${w}`));
                        }
                        if (incomingId) activateStrengthPlan(userId, incomingId);
                    } catch (e) { console.warn('reset completion on new plan failed', e); }

                    setPlan(navPlan);
                    setLoading(false);

                    // 保存到 localStorage
                    if (navPlan.plan_id) {
                        localStorage.setItem(`currentPlan_${userId}`, JSON.stringify(navPlan));
                    }

                    // Restore Welcome Message logic
                    if (navPlan.is_first_plan) {
                        const storageKey = `welcome_shown_${navPlan.plan_id}`;
                        if (!localStorage.getItem(storageKey) && !hasShownWelcome.current) {
                            setShowWelcomeOverlay(true);
                            hasShownWelcome.current = true;
                            localStorage.setItem(storageKey, 'true');
                        }
                    }

                    hasInitializedRef.current = true;
                    // Also load recovery scores here
                    const scores = getMuscleRecoveryScores(userId);
                    setMuscleRecoveryScores(scores);
                    return; // ✅ 直接返回，不調用後端
                }

                // 2. 嘗試從 localStorage 恢復
                const cachedPlan = localStorage.getItem(`currentPlan_${userId}`);
                if (cachedPlan) {
                    try {
                        const parsed = ensureSnapshot(JSON.parse(cachedPlan));
                        if (parsed && parsed.plan_id) {
                            console.log('💾 Restored from localStorage:', parsed.plan_id);
                            setPlan(parsed);
                            // Persist snapshot back if it was just created
                            if (!JSON.parse(cachedPlan)._originalSnapshot) {
                                localStorage.setItem(`currentPlan_${userId}`, JSON.stringify(parsed));
                            }
                            setLoading(false);
                            hasInitializedRef.current = true;
                            // Also load recovery scores here
                            const scores = getMuscleRecoveryScores(userId);
                            setMuscleRecoveryScores(scores);
                            return; // ✅ 直接返回，不調用後端
                        }
                    } catch (e) {
                        console.error('Parse error:', e);
                    }
                }

                // 3. 都沒有，才從後端獲取（但不清空現有數據）
                console.log('🌐 Fetching from backend...');
                await fetchLatestPlan();
                hasInitializedRef.current = true;
                // Also load recovery scores here
                const scores = getMuscleRecoveryScores(userId);
                setMuscleRecoveryScores(scores);
                setLoading(false);

            } catch (error) {
                console.error('Initialization error:', error);
                hasInitializedRef.current = true;
            }
        };

        initializePlan();
    }, []); // 🔥 空依賴數組 - 只在掛載時執行一次

    // 🔥 初始化 IndexedDB
    useEffect(() => {
        indexedDBManager.init().then(() => {
            console.log('✅ IndexedDB ready');
        }).catch(err => {
            console.error('❌ IndexedDB init failed:', err);
        });
    }, []);

    // 🔥 監聽網絡狀態變化
    useEffect(() => {
        const handleOnline = async () => {
            console.log('🌐 Back online - syncing...');

            try {
                // 獲取未同步的數據
                const unsyncedPlans = await indexedDBManager.getUnsyncedPlans(userId);

                if (unsyncedPlans.length > 0) {
                    console.log(`📤 Syncing ${unsyncedPlans.length} unsynced plans...`);
                    requestBackgroundSync('sync-plans');
                }
            } catch (error) {
                console.error('Sync error:', error);
            }
        };

        window.addEventListener('online', handleOnline);

        return () => {
            window.removeEventListener('online', handleOnline);
        };
    }, [userId]);

    // 🔥 重載同步方法
    // 接受 { onProgress } 以回報逐筆進度；回傳實際同步成功的計劃筆數
    const handleRetrySync = async (opts = {}) => {
        const { onProgress } = opts;
        if (!plan || !isOnline) {
            return 0;
        }

        console.log('🔄 Retrying sync...');
        setSyncError(null);

        let syncedCount = 0;
        try {
            const unsyncedPlans = await indexedDBManager.getUnsyncedPlans(userId);
            const total = unsyncedPlans.length;

            if (total > 0) {
                if (onProgress) onProgress(0, total);
                for (let i = 0; i < unsyncedPlans.length; i++) {
                    const record = unsyncedPlans[i];
                    try {
                        const p = record.plan || record;
                        const resp = await apiClient.post('/api/plan/save', { user_id: userId, plan: p });
                        if (resp.status >= 200 && resp.status < 300) {
                            if (record.id != null && indexedDBManager.markPlanSynced) {
                                await indexedDBManager.markPlanSynced(record.id);
                            }
                            syncedCount++;
                        }
                    } catch (err) {
                        console.warn('Failed to sync plan record:', err);
                    }
                    if (onProgress) onProgress(i + 1, total);
                }
            } else if (expandedDay !== null) {
                // 沒有待同步的整份計劃，但有開啟中的當日修改 → 重新保存
                await savePlanDay(plan, expandedDay - 1);
            }

            // 🆕 補完雲朵同步：一併沖掉 cloudSync 的失敗重試佇列
            //    （trainingRecords / workout_history 等 localStorage 備份，之前只有 app 啟動時才會重送）
            try {
                const { flushCloudQueue } = await import('../utils/cloudSync');
                syncedCount += await flushCloudQueue();
            } catch (_) { /* 雲備份佇列不可用 → 略過，不影響計劃同步 */ }

            const now = Date.now();
            setLastSyncTime(now);
            localStorage.setItem(`lastSyncTime_${userId}`, now.toString());
        } catch (err) {
            setSyncError(err.message);
        }

        return syncedCount;
    };

    const verifyPlanInBackground = async (planId) => {
        try {
            console.log('🔍 [Background] Verifying plan existence:', planId);
            const { data } = await apiClient.get(`/api/plan/${userId}/latest`);
            if (data) {
                if (data.plan && data.plan.plan_id === planId) {
                    console.log('✅ [Background] Plan verified in backend');
                }
            }
        } catch (e) {
            console.error('[Background] verification failed', e);
        }
    };

    // Welcome Overlay State and Handler
    const [showWelcomeOverlay, setShowWelcomeOverlay] = useState(false);

    const dismissWelcome = () => {
        setShowWelcomeOverlay(false);
        // Optionally update backend to clear flag if needed, 
        // but simple local dismiss is often enough for UX
    };

    // Per-week training days configuration
    const [weeklyTrainingDays, setWeeklyTrainingDays] = useState(() => {
        const planDays = location.state?.plan?.days_per_week
            || location.state?.plan?.weeks?.[0]?.days?.length
            || 3;

        const saved = localStorage.getItem(`weeklyTrainingDays_${userId}`);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // 排程的天數比課表少（舊的 3 天排程配上新的 5 天課）→ 多出來的那幾天永遠排不到，改用預設重排
                const known = location.state?.plan?.weeks?.[0]?.days?.filter?.(d => d?.exercises?.length)?.length || 0;
                const scheduled = Object.keys(parsed?.[1] || {}).length;
                if (parsed && typeof parsed === 'object' && scheduled > 0 && !(known && scheduled < known)) {
                    return parsed;
                }
            } catch (e) {
                console.error("Error parsing weeklyTrainingDays:", e);
            }
        }

        /* 預設訓練日只有一份來源：dailyAgenda 的 DEFAULT_STRENGTH_SPREAD。
           這裡以前自己寫了一張表，4 天／5 天跟排課函式排出來的星期不一樣 ——
           生成計劃時預告的日期會對不上實際課表。 */
        const weekdays = defaultStrengthWeekdays(planDays);
        const fallback = defaultStrengthWeekdays(3);
        const dayConfig = {};
        (weekdays.length ? weekdays : fallback).forEach((js, i) => { dayConfig[js] = i + 1; });
        const config = { 1: dayConfig, 2: dayConfig, 3: dayConfig, 4: dayConfig };
        localStorage.setItem(`weeklyTrainingDays_${userId}`, JSON.stringify(config));
        return config;
    });

    // State for Exercise Editing
    // 🆕 動作層級的拖曳排序/編輯模式已移除：永久關閉，所有相關 UI 不再渲染
    const isExerciseEditing = false;
    const setIsExerciseEditing = () => {}; // no-op（保留呼叫點相容）
    const [showAddExerciseModal, setShowAddExerciseModal] = useState(false);

    const [modalView, setModalView] = useState('categories');
    const [selectedCategory, setSelectedCategory] = useState(null);

    const [targetDayIndexForAdd, setTargetDayIndexForAdd] = useState(null);
    const [replacementTarget, setReplacementTarget] = useState(null);

    const [searchQuery, setSearchQuery] = useState('');

    const exerciseLibraryData = useMemo(() => {
        const catData = getCategorizedGlobalLibrary();
        const allList = [];
        const categories = ['All'];

        Object.entries(catData).forEach(([cat, list]) => {
            const displayCat = cat.charAt(0).toUpperCase() + cat.slice(1);
            categories.push(displayCat);
            list.forEach(ex => {
                allList.push({
                    ...ex,
                    muscle: displayCat
                });
            });
        });

        return { allList, categories };
    }, []);

    const availableExercisesList = exerciseLibraryData.allList;
    const exerciseCategories = exerciseLibraryData.categories;

    // --- 🌍 Navigation Visibility Control ---
    // Hides the global CapsuleNavigation when the modal is open
    useEffect(() => {
        window.dispatchEvent(new CustomEvent('toggle-capsule-nav', {
            detail: { hidden: showAddExerciseModal }
        }));

        // Cleanup when component unmounts or modal closes
        return () => {
            window.dispatchEvent(new CustomEvent('toggle-capsule-nav', {
                detail: { hidden: false }
            }));
        };
    }, [showAddExerciseModal]);

    const savePlanDay = async (updatedPlan, dayIndex) => {
        try {
            setIsSyncing(true);
            setSyncError(null);
            setSaveStatus('saving');

            // 1. 立即保存到 localStorage（最快）
            localStorage.setItem(`currentPlan_${userId}`, JSON.stringify(updatedPlan));
            console.log('💾 Saved to localStorage');

            // 2. 保存到 IndexedDB（離線備份）
            try {
                await indexedDBManager.savePlan(userId, updatedPlan);
                console.log('💾 Saved to IndexedDB');
            } catch (dbError) {
                console.warn('⚠️ IndexedDB save failed:', dbError);
                // 繼續執行，不影響主流程
            }

            // 3. 如果在線，同步到後端
            if (isOnline) {
                // Case 1: Plan 沒有 ID
                if (!updatedPlan.plan_id) {
                    const { data: savedData } = await apiClient.post('/api/plan/save', { user_id: userId, plan: updatedPlan });
                    updatedPlan.plan_id = savedData.plan_id;
                    setPlan(prev => ({ ...prev, plan_id: savedData.plan_id }));

                    // 更新本地存儲
                    localStorage.setItem(`currentPlan_${userId}`, JSON.stringify(updatedPlan));
                    await indexedDBManager.savePlan(userId, updatedPlan);
                }

                // Case 2: 更新特定 day
                const day = updatedPlan.weeks[activeWeek - 1].days[dayIndex];
                await apiClient.put(`/api/plan/${updatedPlan.plan_id}/day/${dayIndex + 1}`, { user_id: userId, week: activeWeek, exercises: day.exercises });

                console.log('✅ Synced to backend');

                // 更新同步時間
                const now = Date.now();
                setLastSyncTime(now);
                localStorage.setItem(`lastSyncTime_${userId}`, now.toString());
                setSaveStatus('success');
                setTimeout(() => setSaveStatus(null), 2000);

            } else {
                // 離線模式：註冊後台同步
                console.log('📴 Offline: Will sync when online');
                setSaveStatus('success'); // 在離線模式下也顯示成功，因為本地已保存
                setTimeout(() => setSaveStatus(null), 2000);
                requestBackgroundSync('sync-plans');
            }

            // 更新本地狀態
            setPlan(prev => {
                const newPlan = JSON.parse(JSON.stringify(prev));
                if (newPlan.weeks?.[activeWeek - 1]?.days[dayIndex]) {
                    newPlan.weeks[activeWeek - 1].days[dayIndex].exercises = updatedPlan.weeks[activeWeek - 1].days[dayIndex].exercises;
                }
                return newPlan;
            });

        } catch (error) {
            console.error('❌ Save failed:', error);
            setSyncError(error.message);
            setSaveStatus('error');
            setTimeout(() => setSaveStatus(null), 3000);

            // 即使後端失敗，本地數據已保存
            console.log('⚠️ Backend sync failed, but data saved locally');

        } finally {
            setIsSyncing(false);
        }
    };

    const toggleExerciseEditMode = () => {
        setIsExerciseEditing(!isExerciseEditing);
    };

    const handlePlanUpdate = useCallback(async (updatedPlan) => {
        // 1. Update React state immediately
        setPlan(updatedPlan);

        // 2. Persist to localStorage right away (instant, synchronous)
        localStorage.setItem(`currentPlan_${userId}`, JSON.stringify(updatedPlan));

        // 3a. Proactively push updated plan to Apple Watch (if reachable)
        //     The Swift side handles throttling / reachability checks.
        try {
            // Extract the active week's plan and format it safely for the Watch
            const activeWeekDays = updatedPlan.weeks[activeWeek - 1]?.days || [];
            const watchFriendlyPlan = activeWeekDays
                .filter(day => day.exercises && day.exercises.length > 0)
                .map((day, idx) => {
                    // Extract clean focus name (e.g., "胸部 (Chest)" -> "Chest")
                    let focusRaw = day.focus || day.workout_name || "Training";
                    let focusClean = focusRaw.includes('(') ? focusRaw.match(/\((.+)\)/)?.[1] || focusRaw.split('(')[0].trim() : focusRaw;

                    return {
                        label: `Day ${day.day_number || idx + 1} · ${focusClean}`,
                        exercises: day.exercises.map(ex => ({
                            name: ex.name,
                            // Ensure strict numerical types expected by Swift
                            sets: parseInt(ex.sets) || 3,
                            reps: parseInt(String(ex.reps).split('-')[0]) || 10,
                            weight: parseFloat(String(ex.weight).replace('kg', '')) || 0
                        }))
                    };
                });

            // Pass the heavily typed payload to the iOS wrapper
            window.webkit?.messageHandlers?.fitnessApp?.postMessage({
                type: 'sendGymPlanToWatch',
                gymPlan: watchFriendlyPlan
            });
            console.log('📱 Sent formatted plan to iOS wrapper:', watchFriendlyPlan);
        } catch (_) { /* non-iOS environment — ignore */ }

        // 3. Persist to IndexedDB (offline backup)
        try {
            await indexedDBManager.savePlan(userId, updatedPlan);
        } catch (dbErr) {
            console.warn('⚠️ IndexedDB save failed (non-fatal):', dbErr);
        }

        // 4. Sync to backend — POST /api/plan/save now does upsert:
        //    • if plan_id exists in the file → replaces in-place
        //    • if plan_id is new / missing   → appends as a new plan
        try {
            const { data } = await apiClient.post('/api/plan/save', { user_id: userId, plan: updatedPlan });
            // If the backend assigned a brand-new plan_id, propagate it
            if (data.plan_id && data.plan_id !== updatedPlan.plan_id) {
                    const planWithId = { ...updatedPlan, plan_id: data.plan_id };
                    setPlan(planWithId);
                    localStorage.setItem(`currentPlan_${userId}`, JSON.stringify(planWithId));
                    try { await indexedDBManager.savePlan(userId, planWithId); } catch (_) { }
                    console.log('✅ Plan saved to backend, new id:', data.plan_id);
            } else {
                console.log('✅ Plan upserted on backend, id:', data.plan_id);
            }
        } catch (e) {
            console.warn('⚠️ Backend sync failed (data saved locally):', e.message);
        }
    }, [userId]);

    // ── Rebuild _originalSnapshot from the clean backend plan ────────────────
    // Called when the user hits "重設為原始基準" after test runs have inflated
    // the stored reps. The backend plan is clean when it has no _feedbackHistory.
    const rebuildSnapshotFromBackend = useCallback(async () => {
        try {
            const { plan: backendPlan } = (await apiClient.get(`/api/plan/${userId}/latest`)).data;
            if (!backendPlan?.weeks?.length) throw new Error('no plan weeks in response');

            // Backend must be clean (no feedback modifications)
            if (backendPlan._intensityLevel || backendPlan._feedbackHistory?.length) {
                console.warn('⚠️ Backend plan also has feedback applied — cannot auto-reset');
                return false;
            }

            const freshSnapshot = backendPlan.weeks.map(wk => ({
                days: (wk.days || []).map(day => ({
                    exercises: (day.exercises || []).map(ex => ({
                        name: ex.name, sets: ex.sets, reps: ex.reps, rest: ex.rest,
                    })),
                })),
            }));

            const resetPlan = {
                ...plan,
                weeks: JSON.parse(JSON.stringify(backendPlan.weeks)),
                _originalSnapshot: freshSnapshot,
                _intensityLevel: 0,
                _feedbackHistory: [],
                _nextCycleFeedback: undefined,
            };

            await handlePlanUpdate(resetPlan);
            console.log('✅ Snapshot rebuilt from backend — plan reset to original baseline');
            return true;
        } catch (e) {
            console.error('❌ rebuildSnapshotFromBackend failed:', e);
            return false;
        }
    }, [plan, userId, handlePlanUpdate]);

    const handleRemoveExercise = (dayIdx, exIdx) => {
        if (!plan || !plan.weeks) return;

        // Deep clone for safety
        const newPlan = JSON.parse(JSON.stringify(plan));
        const day = newPlan.weeks[activeWeek - 1].days[dayIdx];

        if (day && day.exercises) {
            day.exercises.splice(exIdx, 1);
            setPlan(newPlan);
            savePlanDay(newPlan, dayIdx);
        }
    };

    const handleAddExercise = (exerciseName, exerciseMuscle = null) => {
        if (!plan) return;

        // Use passed muscle, or current selected category, or fallback
        const muscleToStore = exerciseMuscle || (selectedCategory !== 'All' ? selectedCategory : 'Other');

        // Deep clone
        const newPlan = JSON.parse(JSON.stringify(plan));

        // Handle Replacement
        if (replacementTarget) {
            const { dayIdx, exIdx } = replacementTarget;
            const day = newPlan.weeks[activeWeek - 1].days[dayIdx];
            if (day && day.exercises && day.exercises[exIdx]) {
                day.exercises[exIdx].name = exerciseName;
                day.exercises[exIdx].muscle = muscleToStore;
                setPlan(newPlan);
                savePlanDay(newPlan, dayIdx);
            }
            setReplacementTarget(null);
            setShowAddExerciseModal(false);
            setSearchQuery('');
            return;
        }

        if (targetDayIndexForAdd === null) return;
        const day = newPlan.weeks[activeWeek - 1].days[targetDayIndexForAdd];

        if (!day.exercises) day.exercises = [];

        day.exercises.push({
            name: exerciseName,
            sets: 3,
            reps: '10-12',
            weight: '10kg',
            rest: '60s',
            muscle: muscleToStore
        });

        setPlan(newPlan);
        setShowAddExerciseModal(false);
        setSearchQuery('');
        savePlanDay(newPlan, targetDayIndexForAdd);
    };

    const handleUpdateExerciseParam = (dayIdx, exIdx, field, value) => {
        if (!plan || !plan.weeks) return;

        // Deep clone
        const newPlan = JSON.parse(JSON.stringify(plan));
        const day = newPlan.weeks[activeWeek - 1].days[dayIdx];

        if (day && day.exercises && day.exercises[exIdx]) {
            day.exercises[exIdx][field] = value;
            setPlan(newPlan);

            // 🔥 DEBOUNCE: Wait 1 second before saving to backend
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            saveTimerRef.current = setTimeout(() => {
                console.log('⏰ [Frontend] Debounced save triggered for Day Index:', dayIdx);
                savePlanDay(newPlan, dayIdx);
            }, 1000);
        }
    };

    /** ─────────────────────────────────────────────────────────────────
     * handleReorderGroups — move a whole group (superset / standalone)
     * up or down. Supersets are bound together as one unit.
     * ───────────────────────────────────────────────────────────────── */
    const handleReorderGroups = (dayIdx, fromGi, toGi) => {
        if (!plan || !plan.weeks) return;
        const newPlan = JSON.parse(JSON.stringify(plan));
        const day = newPlan.weeks[activeWeek - 1].days[dayIdx];
        if (!day || !day.exercises) return;

        const exList = day.exercises;
        const groups = [];
        let idx = 0;
        while (idx < exList.length) {
            const ex = exList[idx];
            const ssId = ex.supersetId || ex.supersetGroup;
            if (ssId) {
                const pair = [];
                while (idx < exList.length && (exList[idx].supersetId || exList[idx].supersetGroup) === ssId) {
                    pair.push(exList[idx]);
                    idx++;
                }
                groups.push(pair);
            } else {
                groups.push([exList[idx]]);
                idx++;
            }
        }

        if (toGi < 0 || toGi >= groups.length) return;

        const temp = groups[fromGi];
        groups[fromGi] = groups[toGi];
        groups[toGi] = temp;

        day.exercises = groups.flat();
        setPlan(newPlan);
        savePlanDay(newPlan, dayIdx);
    };


    const currentTrainingDays = weeklyTrainingDays[activeWeek] || {};

    const [completedWorkouts, setCompletedWorkouts] = useState(new Set()); // Track completed day numbers

    // --- Progressive Feedback (Hook) ---
    // Calculate total days for current week safely
    const currentWeekTotalDays = useMemo(() => {
        return plan?.weeks?.[activeWeek - 1]?.days?.length || 0;
    }, [plan, activeWeek]);

    // 是否為週期最後一週（最後一週完成 → 走收官，不彈週回報）
    const isLastWeek = useMemo(() => {
        const totalWeeks = plan?.weeks?.length || 0;
        return totalWeeks > 0 && activeWeek >= totalWeeks;
    }, [plan, activeWeek]);

    const { showFeedbackModal, setShowFeedbackModal, hasFeedbackForWeek, markDone: markWeekFeedbackDone } = useWeekCompletionTracker(
        userId,
        activeWeek,
        completedWorkouts, // Set of completed day numbers
        currentWeekTotalDays,
        isLastWeek
    );

    // 🔔 從首頁「週訓練回饋」提醒點進來（routeState.openWeekFeedback）→ 直接開週回饋表單，
    //    而不是只停在計劃頁。等頁面 mount 後再開，避免搶在資料載入前。
    // 首頁「去填第 N 週回饋」帶 feedbackWeek 過來 —— 表單要開第 N 週，不是目前這週。
    const [feedbackWeekOverride, setFeedbackWeekOverride] = useState(null);
    const feedbackWeek = feedbackWeekOverride || activeWeek;
    useEffect(() => {
        if (location.state?.openWeekFeedback) {
            const w = Number(location.state?.feedbackWeek);
            if (w > 0) setFeedbackWeekOverride(w);
            const t = setTimeout(() => setShowFeedbackModal(true), 450);
            return () => clearTimeout(t);
        }
        return undefined;
    }, [location.state?.openWeekFeedback, setShowFeedbackModal]);
    /* 表單一打開就把「這是第幾週的回饋」凍結住：之後 activeWeek 不管怎麼變（自動跳週、點週標籤），
       答案都存在打開那一刻的那一週，不會被記到下一週去。 */
    useEffect(() => {
        if (showFeedbackModal) setFeedbackWeekOverride((w) => w || activeWeek);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showFeedbackModal]);

    /* 🏆 從首頁「你這個月的努力結晶」點進來（開封儀式之後）→ 直接開收官報告。
       同時標記為已看過，這樣中控台與首頁的「去看回饋」提醒就會停止 ——
       不然人已經看完了，系統還在喊。 */
    useEffect(() => {
        if (!location.state?.openCycleRecap) return undefined;
        const t = setTimeout(() => {
            /* 只打開，不標記「看過」—— 要按了下一季的確認才算回饋完成，
               不然使用者點進來看一眼就關掉，提醒從此消失，永遠沒機會回饋。 */
            setShowCycleComplete(true);
        }, 300);
        return () => clearTimeout(t);
    }, [location.state?.openCycleRecap, userId]);

    // ── Data-driven recommendation from REAL training-history RPE ──────────
    // Reads this week's logged set RPE / effortScore, compares against the
    // periodized target band, and recommends a feeling + intensity level.
    // Recomputed whenever the modal opens (so it reflects the latest logged sets).
    const rpeRecommendation = useMemo(() => {
        if (!showFeedbackModal || !plan?.weeks) return null;
        try {
            const currentLevel = plan._intensityLevel || 0;
            return recommendFromRPE(userId, feedbackWeek, plan, currentLevel);
        } catch (e) {
            console.warn('[RPE] recommendation failed', e);
            return null;
        }
    }, [showFeedbackModal, plan, feedbackWeek, userId]);

    const handleWeekFeedback = async (feedbackData) => {
        const { overallFeeling, weekNumber, targetLevel } = feedbackData;
        console.log('📝 Feedback received:', overallFeeling, 'week', weekNumber,
            targetLevel !== undefined ? `(RPE-recommended level ${targetLevel})` : '');

        // ── Warn if snapshot is missing (plan was loaded with pre-existing feedback) ──
        if (!plan?._originalSnapshot) {
            console.warn('⚠️ Plan has no _originalSnapshot — adjustments will use current (possibly inflated) values as baseline. Use "重設為原始基準" to restore correct values.');
        }

        // ── Apply real plan adjustments ──────────────────────────────────────
        // If the user kept the data-recommended option, targetLevel carries the
        // exact Double Progression stage derived from real RPE deviation
        // (e.g. RPE far below target → jump +2 instead of +1).
        const { plan: updatedPlan, changes, summary } = applyFeedbackToPlan(
            plan,
            overallFeeling,
            weekNumber,
            targetLevel !== undefined
                ? { restoreFromSnapshot: true, targetLevel }
                : {}
        );
        console.log('🔄 Plan adjustments applied:', changes.length, 'changes');

        // 💳 減量永遠免費，自動加量才是會員：非會員的「加量」只給建議，課表不動
        if (gateStrengthProgression(summary).locked) {
            /* 課表不動，但「這週回答過了」一樣要記下來 ——
               以前這裡直接 return，旗標沒寫，自動彈窗與手動按鈕會一直叫他再填一次。 */
            localStorage.setItem(`week_feedback_${userId}_week${weekNumber}`, JSON.stringify({
                week: weekNumber, feeling: overallFeeling, date: new Date().toISOString(),
                changes: [], summary, locked: true,
            }));
            markWeekFeedbackDone();
            setFeedbackAdjustments({ summary, changes: [], weekNumber, locked: true });
            setShowFeedbackModal(false);
            setShowFeedbackResult(true);
            return;
        }

        // ── Persist adjusted plan ────────────────────────────────────────────
        /* 沒有任何動作改變也要存：updatedPlan 帶著這次回饋的強度等級／週紀錄等 metadata，
           只在 changes>0 才存，下一週的回饋與「重設基準」會讀到舊的等級。 */
        await handlePlanUpdate(updatedPlan);

        // ── Save feedback record ─────────────────────────────────────────────
        const feedbackEntry = {
            week: weekNumber,
            feeling: overallFeeling,
            date: new Date().toISOString(),
            changes,
            summary,
        };
        localStorage.setItem(`week_feedback_${userId}_week${weekNumber}`, JSON.stringify(feedbackEntry));
        markWeekFeedbackDone();   // 手動「填本週回饋」按鈕跟著消失

        setFeedbackAdjustments({ summary, changes, weekNumber });

        // Close feedback modal, show result modal
        setShowFeedbackModal(false);
        setShowFeedbackResult(true);
    };

    // Called when user moves the intensity slider inside FeedbackResultModal
    // targetLevel = absolute slider position (-3…+3)
    const handleResubmitFeedback = async (newFeeling, weekNumber, targetLevel) => {
        console.log('🔁 Re-applying feedback:', newFeeling, 'level', targetLevel, 'week', weekNumber);
        const { plan: updatedPlan, changes, summary } = applyFeedbackToPlan(
            plan,
            newFeeling,
            weekNumber,
            {
                restoreFromSnapshot: true,   // always restore from baseline first
                targetLevel,                 // absolute Double Progression stage
            },
        );

        // 💳 同一條規則：非會員把強度往上拉 → 不寫入課表
        if (gateStrengthProgression(summary).locked) {
            setFeedbackAdjustments({ summary, changes: [], weekNumber, locked: true });
            return;
        }

        if (handlePlanUpdate) {
            await handlePlanUpdate(updatedPlan);
        } else {
            setPlan(updatedPlan);
            localStorage.setItem(`currentPlan_${userId}`, JSON.stringify(updatedPlan));
        }

        const feedbackEntry = {
            week: weekNumber, feeling: newFeeling,
            date: new Date().toISOString(), changes, summary,
        };
        localStorage.setItem(`week_feedback_${userId}_week${weekNumber}`, JSON.stringify(feedbackEntry));
        setFeedbackAdjustments({ summary, changes, weekNumber });
    };


    // Unified Effect for data fetching and sync
    useEffect(() => {
        console.log('💡 Plan state changed:', plan?.plan_id ? `ID: ${plan.plan_id}` : 'No ID');
    }, [plan]);

    const [error, setError] = useState(null);

    const fetchLatestPlan = async () => {
        try {
            setLoading(true);
            setError(null);

            if (isOnline && userId && userId !== 'null' && userId !== 'undefined') {
                // 在線：從後端獲取 (加入 5 秒超時保護)
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);

                const response = await fetch(`http://${window.location.hostname}:8000/api/plan/${userId}/latest`, {
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (response.ok) {
                    const data = await response.json();

                    if (data.plan && data.plan.plan_id) {
                        /* 離線時換的季（上傳沒送出去）：本機這份是同一個計劃、季數比後端新 → 用本機的並補送。
                           不然後端的上一季會把剛換好的這一季蓋回去 —— 收官再跳一次、季數再 +1，換季的調整也不見了。 */
                        let localPlan = null;
                        try { localPlan = JSON.parse(localStorage.getItem(`currentPlan_${userId}`) || 'null'); } catch { localPlan = null; }
                        if (localPlan?.plan_id === data.plan.plan_id && (Number(localPlan.season) || 1) > (Number(data.plan.season) || 1)) {
                            setPlan(localPlan);
                            apiClient.post('/api/plan/save', { user_id: userId, plan: localPlan }).catch(() => { /* 下次再補 */ });
                            return;
                        }
                        setPlan(data.plan);

                        // 保存到本地
                        localStorage.setItem(`currentPlan_${userId}`, JSON.stringify(data.plan));
                        await indexedDBManager.savePlan(userId, data.plan);

                        // 更新同步時間
                        const now = Date.now();
                        setLastSyncTime(now);
                        localStorage.setItem(`lastSyncTime_${userId}`, now.toString());

                        console.log('✅ Fetched from backend and cached');
                        return;
                    }
                }
            }

            // 離線或後端失敗：從本地恢復
            console.log('📴 Using offline data...');

            // 1. 優先從 IndexedDB 恢復
            try {
                const indexedDBPlan = await indexedDBManager.getLatestPlan(userId);
                if (indexedDBPlan) {
                    setPlan(indexedDBPlan);
                    console.log('💾 Restored from IndexedDB');
                    return;
                }
            } catch (dbError) {
                console.warn('⚠️ IndexedDB read failed:', dbError);
            }

            // 2. 其次從 localStorage 恢復
            const cachedPlan = localStorage.getItem(`currentPlan_${userId}`);
            if (cachedPlan) {
                const parsed = JSON.parse(cachedPlan);
                setPlan(parsed);
                console.log('💾 Restored from localStorage');
                return;
            }

            console.warn('⚠️ No cached data available');

        } catch (error) {
            console.error('Error fetching plan:', error);
            setError(error.message);

            // 錯誤時也嘗試恢復本地數據
            const cachedPlan = localStorage.getItem(`currentPlan_${userId}`);
            if (cachedPlan) {
                setPlan(JSON.parse(cachedPlan));
                console.log('💾 Error recovery from localStorage');
            }
        } finally {
            setLoading(false);
        }
    };

    // Internal Navigation Helper
    const handleStartWorkout = (day) => {
        if (!day) return;
        console.log('[Start Workout] Day data:', day);

        /* 休息日預覽（dayNumber 0）按「開始訓練」：以前照樣帶 plan_id，day_number 0 被當成沒填 → 退回 1，
           做完伸展就把第 1 天打勾。休息日不屬於課表的任何一天 → 走自由訓練，不帶 plan_id／day_number。 */
        if (day.type === 'rest' || Number(day.dayNumber ?? day.day_number) === 0) {
            const { plan_id: _pid, planId: _pid2, day_number: _dn, dayNumber: _dn2, week_number: _wn, ...rest } = day;
            navigate('/training-session-mobile', {
                state: { day: { ...rest, plan_name: '休息日恢復', title: '休息日恢復', isFreestyle: true }, freestyle: true },
            });
            return;
        }

        // Find the day number based on which day this is in the week
        // 預覽 sheet 傳進來的是 { ...day, dayNumber } 的複本 —— 用參照找會是 -1，
        // 以前因此一律被記成 Day 1（練完週三那天，週三還是沒打勾、週一被打勾）。
        const dayIndex = days.findIndex(d => d === day);
        const explicit = Number(day.dayNumber || day.day_number);
        const dayNumber = explicit > 0 ? explicit : (dayIndex >= 0 ? dayIndex + 1 : 1);

        navigate('/training-session-mobile', {
            state: {
                day: {
                    ...day,
                    plan_id: plan?.plan_id || plan?.id,
                    day_number: dayNumber,
                    week_number: activeWeek
                }
            }
        });
    };

    // Load completed workouts from localStorage — isolated per week
    useEffect(() => {
        if (plan?.plan_id || plan?.id) activateStrengthPlan(userId, plan.plan_id || plan.id);
        const loadCompletedFromStorage = () => {
            // Always reset first so switching weeks clears old checkmarks
            setCompletedWorkouts(new Set());
            const stored = JSON.stringify(readStrengthPlanDays(userId, plan?.plan_id || plan?.id, activeWeek));
            if (stored) {
                try {
                    const completed = new Set(JSON.parse(stored));
                    console.log('[Completion] Week', activeWeek, '→', Array.from(completed));
                    setCompletedWorkouts(completed);
                } catch (e) { console.error('Completion parse error', e); }
            }
        };
        loadCompletedFromStorage();

        // Also listen for storage events (when workout completes in another tab/window)
        const handleStorageChange = (e) => {
            if (e.key === `completed_workouts_${userId}_week${activeWeek}`) {
                loadCompletedFromStorage();
            }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, [userId, activeWeek, plan?.plan_id, plan?.id]);

    // Helper to get day name
    const getDayName = (dayIndex) => {
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        return days[dayIndex % 7];
    };

    // Calculate recovery scores dynamically
    const [muscleRecoveryScores, setMuscleRecoveryScores] = useState({});

    /* 🗓️ 以前這裡一進頁就開一張「排課中」的鎖屏 Live Activity。
       原生端沒有「排課」的版面，只會套跑步版 —— 使用者沒在跑步，鎖屏卻出現「RUNNING · 0.00 km」
       還一直計時；在這頁把 App 滑掉，那張卡就一直留著。已移除：鎖屏卡只給跑步與重訓進行中用。 */
    const [weekCompletionStatus, setWeekCompletionStatus] = useState({});
    const [weekLockHint, setWeekLockHint] = useState(null); // 週數追蹤：前面尚未完成時的鎖定提示
    const [workoutHistory, setWorkoutHistory] = useState([]);

    useEffect(() => {
        const loadRecoveryScores = async () => {
            if (userId) {
                // 直接讀 localStorage，不走 API（API 沒有實作恢復計算）
                const scores = getMuscleRecoveryScores(userId);
                console.log('[Recovery] Scores:', scores);
                setMuscleRecoveryScores(scores);
            }
        };
        loadRecoveryScores();

        // Fetch completed workouts from history
        const fetchCompletedWorkouts = async () => {
            // Track completion for current active week
            const currentWeekCompleted = new Set();
            // Track full completion for all weeks
            const weeksStatus = {};

            // 1) API 只負責抓歷史顯示；抓不到也不影響鎖定計算
            try {
                const response = await fetch(`http://${window.location.hostname}:8000/api/workout/history/${userId}?limit=100`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.history) {
                        setWorkoutHistory(data.history);
                    }
                }
            } catch (error) {
                console.error('Failed to fetch workout history:', error);
            }

            // 2) 🆕 週完成度一律從 localStorage 計算（不依賴 API，後端沒開也能正確鎖定）
            try {
                    // Iterate through all 4 weeks to determine status
                    weekNumsOf(plan).forEach(weekNum => {
                        const weekIdx = weekNum - 1;
                        if (!plan?.weeks?.[weekIdx]?.days) return;

                        const weekDays = plan.weeks[weekIdx].days;
                        const weekCompletedDays = new Set();

                        // Check LocalStorage first (highest priority for seamless UX)
                        try {
                            const storedCompleted = JSON.stringify(readStrengthPlanDays(userId, plan?.plan_id || plan?.id, weekNum));
                            if (storedCompleted) {
                                const completedList = JSON.parse(storedCompleted);
                                completedList.forEach(d => weekCompletedDays.add(d));
                            }
                        } catch (e) {
                            console.error('LS Error:', e);
                        }

                        // Check history
                        // data.history?.forEach(session => {
                        //     // Add fuzzy matching logic if needed here, but relying on LS/Plan logic is safer for consistency
                        // });

                        // If it's the active week, populate the main set
                        if (weekNum === activeWeek) {
                            weekCompletedDays.forEach(d => currentWeekCompleted.add(d));
                        }

                        // Check if ALL days in this week are completed
                        // Only count days that have exercises
                        const trainableDaysCount = weekDays.filter(d => d.exercises && d.exercises.length > 0).length;

                        // If all trainable days are covered (and count > 0)
                        if (trainableDaysCount > 0 && weekCompletedDays.size >= trainableDaysCount) {
                            weeksStatus[weekNum] = true;
                        } else {
                            weeksStatus[weekNum] = false;
                        }
                    });
            } catch (error) {
                console.error('Failed to compute week completion:', error);
            }

            console.log('[Completion Check] Current Week Set:', Array.from(currentWeekCompleted));
            console.log('[Completion Check] Weeks Status:', weeksStatus);

            setCompletedWorkouts(currentWeekCompleted);
            setWeekCompletionStatus(weeksStatus);
        };
        fetchCompletedWorkouts();
    }, [userId, plan, activeWeek]); // Reload when plan changes, activeWeek changes, or component mounts

    // Auto-advance to next incomplete week
    useEffect(() => {
        if (!plan?.weeks || Object.keys(weekCompletionStatus).length === 0) return;

        // If current week is completed, advance to next incomplete week
        if (weekCompletionStatus[activeWeek]) {
            /* 這週練完了但還沒回饋 → 先留在這週。週回饋是 1.8 秒後才彈出來的，
               這裡馬上跳到下一週會把那個計時器清掉（彈窗永遠不出現），
               或讓答案被記到下一週。回饋交了（或關掉）之後再往下跳，見下方 advancePastWeek。
               最後一週不彈週回饋（走收官），不受這條限制。 */
            const lastWeek = Math.max(0, ...weekNumsOf(plan));
            let hasFlag = true;
            try { hasFlag = !!localStorage.getItem(`week_feedback_${userId}_week${activeWeek}`); } catch { /* */ }
            if (!hasFlag && activeWeek < lastWeek) return;
            const nextIncomplete = weekNumsOf(plan).find(w => w > activeWeek && !weekCompletionStatus[w]);
            if (nextIncomplete) {
                console.log(`✅ Week ${activeWeek} complete → auto-advancing to Week ${nextIncomplete}`);
                setActiveWeek(nextIncomplete);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [weekCompletionStatus]); // Only trigger when completion status changes

    /* 週回饋交了／關掉之後才往下一週走 —— 而且只在那一週真的練完時才跳，
       手動提早回饋（才練 1 堂）不能把人帶過還沒練完的那一週。 */
    const advancePastWeek = (week) => {
        if (!week || !weekCompletionStatus[week]) return;
        const nextIncomplete = weekNumsOf(plan).find(w => w > week && !weekCompletionStatus[w]);
        const target = nextIncomplete || (weekNumsOf(plan).includes(week + 1) ? week + 1 : null);
        if (target) setTimeout(() => setActiveWeek(target), 300);
    };

    // Detect full cycle completion → show Season Recap + auto-renew
    const [showCycleComplete, setShowCycleComplete] = useState(false);
    // 收官自動觸發：最後一週不彈週回報（圖二），因此不能只靠回報彈窗關閉時
    // 才呼叫 checkAndTriggerSeasonComplete。改為偵測「所有週皆完成」就自動跳出
    // 完美收官（圖一），與前三週的週回報流程互斥、不會同時出現。
    useEffect(() => {
        if (!plan?.weeks || Object.keys(weekCompletionStatus).length === 0) return;
        const totalWeeks = plan.weeks.length || 0;
        if (totalWeeks <= 0) return;
        const allWeeksComplete = Array.from({ length: totalWeeks }, (_, i) => i + 1)
            .every(w => weekCompletionStatus[w]);
        // 只有最後一週完成（= 全部完成）才觸發；前面幾週走週回報，不會進到這裡。
        if (allWeeksComplete && !showFeedbackModal && !showFeedbackResult) {
            checkAndTriggerSeasonComplete();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [weekCompletionStatus, plan, showFeedbackModal, showFeedbackResult]);
    // User's chosen next-cycle strategy in the recap modal:
    //   null = not chosen yet | 'progress' = swap/add a new muscle focus
    //   'intensity' = keep parts, adjust intensity per RPE
    const [seasonChoice, setSeasonChoice] = useState(null);
    /* 換季預告裡「換成什麼」使用者自己挑的：{ 原動作名: 動作 | null(不換) } */
    const [swapChoices, setSwapChoices] = useState({});
    const [swapEditing, setSwapEditing] = useState(null);     // 正在挑的那一列 { name, newName }
    const [swapLibrary, setSwapLibrary] = useState(false);
    // 進入「開始下個月」的儀式確認步驟：null = 仍在回顧 | 'confirm' = 詢問延續或重設
    const [seasonStartStep, setSeasonStartStep] = useState(null);
    const [currentSeason, setCurrentSeason] = useState(() => {
        return parseInt(localStorage.getItem(`season_${userId}`) || '1');
    });
    /* 季數跟著課表走（plan.season 會上傳後端）：換裝置／清快取後 localStorage 倒回 1，
       收官「看過了」旗標跟頁首「這一季改了什麼」都會對不上。取兩者較大的。 */
    useEffect(() => {
        const s = Number(plan?.season) || 0;
        if (s > 0) setCurrentSeason((cur) => Math.max(cur, s));
    }, [plan?.season]);

    const autoRecapRef = useRef(null);
    /* 換季套用完成：這一季改了哪些（套用後立刻給看；新一季還沒練第一堂之前，頁首留一張卡可以再點開） */
    const [seasonAppliedOpen, setSeasonAppliedOpen] = useState(false);
    /* 收官的確認鍵防連點：按下去到收官關掉之間不收第二下；收官重新打開才放開 */
    const seasonSubmitRef = useRef(false);
    const [seasonSubmitting, setSeasonSubmitting] = useState(false);
    useEffect(() => {
        if (showCycleComplete) { seasonSubmitRef.current = false; setSeasonSubmitting(false); }
    }, [showCycleComplete]);
    /* 換部位重排回來（產生器帶 seasonRedesignDone）：打開「改了什麼」。
       等「計劃成立」之類的滿版時刻收場才開，不疊在一起；看過一次就不再自動開（重新整理也不會）。 */
    const seasonAppliedSeenKey = (p) => `season_applied_seen_${userId}_${p?.plan_id || p?.id}_${p?._seasonApplied?.season}`;
    useEffect(() => {
        if (!location.state?.seasonRedesignDone || plan?._seasonApplied?.kind !== 'redesign') return undefined;
        try { if (localStorage.getItem(seasonAppliedSeenKey(plan))) return undefined; } catch { /* */ }
        let alive = true;
        afterMomentIdle(() => { if (alive) setSeasonAppliedOpen(true); }, 250);
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.state?.seasonRedesignDone, plan?.plan_id, plan?._seasonApplied?.kind]);
    const closeSeasonApplied = () => {
        setSeasonAppliedOpen(false);
        try { if (plan?._seasonApplied) localStorage.setItem(seasonAppliedSeenKey(plan), '1'); } catch { /* */ }
    };

    const checkAndTriggerSeasonComplete = () => {
        const totalWeeks = plan?.weeks?.length || 4;
        const allWeeksComplete = Array.from({ length: totalWeeks }, (_, i) => i + 1)
            .every(w => weekCompletionStatus[w]);

        if (allWeeksComplete) {
            const shownKey = cycleShownKey(userId, plan?.plan_id || plan?.id, currentSeason);
            /* 「確認過」才算數：自動彈一次就好（同一次打開 App 不重複彈），
               但沒按確認就關掉的話，頁首那張「去回饋」卡會一直留著，下次打開再提醒。 */
            if (!localStorage.getItem(shownKey) && autoRecapRef.current !== shownKey) {
                autoRecapRef.current = shownKey;
                // 延遲 400ms 讓上一個彈窗有時間優雅收起
                setTimeout(() => {
                    setShowCycleComplete(true);
                }, 400);
            }
        }
    };

    // InBody history for the season recap modal.
    // Field names are normalized so both API (body_fat_percentage / muscle_mass)
    // and local InBody form (body_fat_percent / skeletal_muscle_mass) work.
    const [seasonInBodyData, setSeasonInBodyData] = useState(null);
    const [seasonInBodySimulated, setSeasonInBodySimulated] = useState(false);

    const normalizeInBody = (rec) => ({
        weight: rec.weight ?? rec.weight_kg ?? null,
        body_fat_percentage: rec.body_fat_percentage ?? rec.body_fat_percent ?? null,
        muscle_mass: rec.muscle_mass ?? rec.skeletal_muscle_mass ?? null,
        date: rec.date || rec.measurement_date || rec.savedAt || null,
    });


    // Calculate current stats from real data
    /* ⚠️ 這裡以前是「把所有分數平均，沒有就回 85」——
       ① 85 是憑空編的；② 沒練過的肌群一律算 100，所以一次都沒練的人
       會拿到接近滿分的「恢復度」。改用 readinessFromScores：
       只把真的練過的肌群納入平均，一塊都沒有就回 null，畫面改顯示動作。 */
    const avgRecoveryScore = useMemo(
        () => readinessFromScores(muscleRecoveryScores)?.score ?? null,
        [muscleRecoveryScores]);
    /* 列表上那個「準備度 %」跟首頁、跑步頁同一支；肌群雕塑才用上面的肌肉恢復。 */
    const todayReadinessScore = useMemo(
        () => getTodayReadiness(userId)?.score ?? null,
        [userId, muscleRecoveryScores]);

    const totalVolume = useMemo(() => {
        try {
            const records = Object.values(uStorage(userId).get('trainingRecords', {}));
            if (!records.length) return 0;
            // 只計算「本計劃週期（這一個月）」內的訓練量，避免把歷史所有紀錄都加進來。
            // 窗口 = 計劃起始日 → 起始日 + 總週數×7 天。
            const startStr = plan?.startDate || plan?.start_date || plan?.created_at;
            const totalWeeks = plan?.weeks?.length || 4;
            let scoped = records;
            if (startStr) {
                const start = new Date(startStr);
                const end = new Date(start); end.setDate(start.getDate() + totalWeeks * 7);
                const windowed = records.filter(r => {
                    const d = new Date(r.date || r.timestamp);
                    return !isNaN(d) && d >= start && d < end;
                });
                // 若窗口內有資料就用窗口；否則退回全部（避免日期缺失時顯示 0）
                if (windowed.length > 0) scoped = windowed;
            }
            const total = scoped.reduce((sum, r) => sum + (r.volume || r.total_volume || 0), 0);
            return Math.round(total);
        } catch { return 0; }
    }, [userId, plan]);

    /* ── 本期完成進度：練完幾堂 / 總共幾堂 ───────────────────────────
       日曆天數（第 22 / 28 天）講的是時間過了多少，不是你做了多少。
       這支算的是實際完成的課表數，兩個是不同的東西。 */
    const cycleDone = useMemo(() => {
        const weeks = plan?.weeks;
        if (!Array.isArray(weeks) || weeks.length === 0) return null;
        const planId = plan?.plan_id || plan?.id;
        if (!planId) return null;
        let done = 0, total = 0;
        for (let w = 1; w <= weeks.length; w++) {
            const days = weeks[w - 1]?.days || [];
            const trainable = days.filter((d) => d?.exercises?.length > 0).length;
            if (trainable === 0) continue;
            total += trainable;
            const list = readStrengthPlanDays(userId, planId, w) || [];
            done += Math.min(list.length, trainable);   // 髒資料不讓它超過總數
        }
        if (total === 0) return null;
        return { done, total, pct: Math.round((done / total) * 100) };
    }, [plan, userId, weekCompletionStatus]);

    // ── 訓練週期天數追蹤：以「一個月 = 總週數×7 天」計算現在進行到第幾天 ──
    //    起始日優先用 plan 的 startDate/created_at；缺失時退回「本機第一次完成
    //    訓練的日期」，再退回今天。讓使用者清楚知道週期進度 (Day N / 28)。
    const cycleProgress = useMemo(() => {
        const totalWeeks = plan?.weeks?.length || 4;
        const totalDays = totalWeeks * 7;

        let start = null;
        const startStr = plan?.startDate || plan?.start_date || plan?.created_at;
        if (startStr) {
            const d = new Date(startStr);
            if (!isNaN(d)) start = d;
        }
        if (!start) {
            try {
                const records = Object.values(uStorage(userId).get('trainingRecords', {}));
                const dates = records.map(r => new Date(r.date || r.timestamp)).filter(d => !isNaN(d));
                if (dates.length > 0) start = new Date(Math.min(...dates.map(d => d.getTime())));
            } catch { /* ignore */ }
        }
        if (!start) start = new Date();

        const s0 = new Date(start); s0.setHours(0, 0, 0, 0);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const elapsed = Math.floor((today - s0) / 86400000);
        const currentDay = Math.min(Math.max(1, elapsed + 1), totalDays);

        // ── 「回饋日」判定 ──────────────────────────────────────────────
        // 當天若是「該回饋的日子」就在右上角天數標一下。判定條件 = 觸發圖二
        // /圖一的同一條件：本週可訓練日全部完成、且尚未提交過該事件。
        //   • 非最後一週全完成 + 未填週回報  → 該填「週回報」（圖二）
        //   • 最後一週全完成 + 收官尚未顯示  → 該看「完美收官」（圖一）
        let isFeedbackDay = false;
        try {
            const wIdx = activeWeek - 1;
            const weekDays = plan?.weeks?.[wIdx]?.days || [];
            const trainable = weekDays.filter(d => d.exercises && d.exercises.length > 0).length;
            const doneSet = new Set(completedWorkouts);
            const doneCount = weekDays.reduce(
                (n, d, i) => n + ((d.exercises?.length > 0 && doneSet.has(i + 1)) ? 1 : 0), 0);
            const weekAllDone = trainable > 0 && doneCount >= trainable;
            if (weekAllDone) {
                if (activeWeek >= totalWeeks) {
                    const shownKey = cycleShownKey(userId, plan?.plan_id || plan?.id, currentSeason);
                    isFeedbackDay = !localStorage.getItem(shownKey);
                } else {
                    const fbKey = `week_feedback_${userId}_week${activeWeek}`;
                    isFeedbackDay = !localStorage.getItem(fbKey);
                }
            }
        } catch { /* ignore */ }

        // 日曆走到最後一天（或已經超過）→ 這一期時間到了，不管練完幾堂都該回饋、決定下一期
        const timeUp = elapsed + 1 >= totalDays;
        let recapSeen = false;
        try { recapSeen = !!localStorage.getItem(cycleShownKey(userId, plan?.plan_id || plan?.id, currentSeason)); } catch { /* */ }
        if (timeUp && !recapSeen) isFeedbackDay = true;

        return { currentDay, totalDays, totalWeeks, isFeedbackDay, timeUp, recapSeen, overdueDays: Math.max(0, elapsed + 1 - totalDays) };
    }, [plan, userId, activeWeek, completedWorkouts, currentSeason, showCycleComplete]);

    // ── Season analysis: real computed metrics for the cycle complete modal ──
    const seasonAnalysis = useMemo(() => {
        if (!plan?.weeks) return null;
        try {
            const totalWeeks = plan.weeks.length;
            // Count all completed sessions across all weeks
            let totalCompletedSessions = 0;
            let totalPlannedSessions = 0;
            for (let w = 1; w <= totalWeeks; w++) {
                const stored = JSON.stringify(readStrengthPlanDays(userId, plan?.plan_id || plan?.id, w));
                const weekDays = plan.weeks[w - 1]?.days || [];
                totalPlannedSessions += weekDays.filter(d => d.exercises?.length > 0).length;
                if (stored) {
                    try { totalCompletedSessions += JSON.parse(stored).length; } catch { }
                }
            }
            /* ⚠️ 以前這裡「一堂都沒練 → 當成全部做完」，收官頁顯示完成率 100%。
               沒練就是 0，畫面會改成「這一季還沒有訓練紀錄」。 */

            // 已完成數不應超過計劃數（防 DEBUG 模擬或殘留紀錄灌爆分子）
            if (totalPlannedSessions > 0) {
                totalCompletedSessions = Math.min(totalCompletedSessions, totalPlannedSessions);
            }

            // 完成率封頂 100%，避免顯示 1600% 之類的不合理值
            const overallRate = totalPlannedSessions > 0
                ? Math.min(100, Math.round((totalCompletedSessions / totalPlannedSessions) * 100))
                : 100;

            // Collect feedback history from plan metadata
            const feedbackHistory = plan._feedbackHistory || [];
            const tooEasyCount = feedbackHistory.filter(h => h.feeling === 'too_easy').length;
            const tooHardCount = feedbackHistory.filter(h => h.feeling === 'too_hard').length;

            // 總量只放真的練出來的（以前沒紀錄就拿「體重 × 0.3 × 組 × 次」估一個假總量）
            const displayVolume = totalVolume > 0 ? totalVolume : 0;

            /* 訓練量成長、力量趨勢：只用這一季真的練過的紀錄量出來（seasonTransition.measureSeason）。
               ⚠️ 以前「訓練量 +4.5%」是完成率 × 4.5 乘出來的，不是量的。資料不夠 → null，畫面不顯示。 */
            let measured = null;
            try {
                const recs = Object.values(uStorage(userId).get('trainingRecords', {}) || {});
                const since = plan.startDate ? new Date(plan.startDate).getTime() : 0;
                measured = measureSeason(plan, recs, { sinceMs: Number.isFinite(since) ? since : 0, completedSessions: totalCompletedSessions, plannedSessions: totalPlannedSessions, prevTonnage: prevSeasonTonnage(plan) });
                measured.daysOff = daysSinceLastSession(recs);
            } catch { measured = null; }

            // Narrative analysis
            let narrative = '';
            if (overallRate >= 90) {
                narrative = `完成率 ${overallRate}%，執行力極強。`;
            } else if (overallRate >= 70) {
                narrative = `完成率 ${overallRate}%，整體穩健。`;
            } else {
                narrative = `完成率 ${overallRate}%，下個週期可加強一致性。`;
            }
            if (tooEasyCount >= 2) narrative += ' 計劃強度已依回饋上調。';
            if (tooHardCount >= 2) narrative += ' 強度已優化，建議延長恢復時間。';
            if (tooEasyCount === 0 && tooHardCount === 0) narrative += ' 強度契合度良好，維持當前節奏。';

            // Body estimate
            let bodyEstimate = '';
            if (overallRate >= 85) {
                bodyEstimate = `執行力極佳。若配合適當熱量盈餘，本週期已具備良好的肌肥大刺激條件。`;
            } else if (overallRate >= 60) {
                bodyEstimate = `表現穩健，建議下週期可嘗試提升訓練頻率以累積更多有效容量。`;
            } else {
                bodyEstimate = `訓練量略低，下週期建議先以建立穩定訓練習慣為首要目標。`;
            }

            return {
                totalCompletedSessions,
                totalPlannedSessions,
                overallRate,
                displayVolume,
                volumeGrowthPct: measured?.volumeDeltaPct ?? null,
                e1rmDeltaPct: measured?.e1rmDeltaPct ?? null,
                measured,
                narrative,
                bodyEstimate,
                totalWeeks,
            };
        } catch (e) {
            console.error('seasonAnalysis error', e);
            return null;
        }
    }, [plan, userId, totalVolume, showCycleComplete]);

    // ── 進步回饋：告訴使用者「哪邊進步了」— 供「休息卡」放大版顯示 ──
    //    綜合：本週期總容量、估計 1RM 成長幅度、部位平衡（練最多/最少的肌群）。
    const progressFeedback = useMemo(() => {
        try {
            const tally = {};
            plan?.weeks?.forEach((wk) => {
                wk.days?.forEach((day) => {
                    day.exercises?.forEach((ex) => {
                        const m = ex.muscle_group || ex.muscleGroup || ex.target_muscle || ex.muscle;
                        if (m) tally[m] = (tally[m] || 0) + 1;
                    });
                });
            });
            const entries = Object.entries(tally).sort((a, b) => b[1] - a[1]);
            // 肌群名稱在地化（資料庫多為英文；避免卡面出現 chest / hamstrings 這類英文）
            const MZH = { chest: '胸', back: '背', legs: '腿', quads: '股四頭', quadriceps: '股四頭', hamstrings: '腿後', glutes: '臀', shoulders: '肩', arms: '手臂', biceps: '二頭', triceps: '三頭', core: '核心', abs: '核心', calves: '小腿', delts: '三角肌', deltoids: '三角肌', lats: '闊背', traps: '斜方肌', forearms: '前臂' };
            const zhM = (m) => m ? (MZH[String(m).toLowerCase()] || m) : m;
            const topMuscle = zhM(entries[0]?.[0]) || null;
            const lowMuscle = entries.length > 1 ? zhM(entries[entries.length - 1][0]) : null;

            // 1RM 成長：需有「真實完成的訓練量」才估算；資料不足時回傳 null → UI 顯示「－－」
            const hasRealVolume = totalVolume > 0;
            // 只放量出來的訓練量成長（以前是完成率 × 5 推出來的假百分比）
            let oneRMGainPct = null;
            if (hasRealVolume && Number.isFinite(seasonAnalysis?.volumeGrowthPct) && seasonAnalysis.volumeGrowthPct > 0) {
                oneRMGainPct = seasonAnalysis.volumeGrowthPct;
            }

            const vol = totalVolume > 0 ? totalVolume : (seasonAnalysis?.displayVolume || 0);
            const hasData = vol > 0 || entries.length > 0;
            return { hasData, topMuscle, lowMuscle, oneRMGainPct, vol };
        } catch {
            return { hasData: false, topMuscle: null, lowMuscle: null, oneRMGainPct: null, vol: 0 };
        }
    }, [plan, totalVolume, seasonAnalysis]);

    useEffect(() => {
        if (!showCycleComplete) return;
        let cancelled = false;

        const loadLocal = () => {
            try {
                const raw = JSON.parse(localStorage.getItem(`inbody_local_${userId}`) || '[]');
                return Array.isArray(raw) ? raw.map(normalizeInBody) : [];
            } catch { return []; }
        };

        /* 沒有 ≥2 筆真的 InBody → 這一季就沒有身體變化可以講。
           ⚠️ 以前這裡會「模擬」一筆（肌肉 +0.6 kg、體脂 −0.8%），還拿它判斷「身體有進步 → 加量」。 */
        fetch(`http://${window.location.hostname}:8000/api/user/inbody-history/${userId}?limit=8`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (cancelled) return;
                const api = (data?.history || []).map(normalizeInBody);
                const local = loadLocal();
                // Prefer whichever has >=2 usable points
                const usable = api.length >= 2 ? api : local.length >= 2 ? local : null;
                if (usable) {
                    setSeasonInBodyData(usable);
                    setSeasonInBodySimulated(false);
                } else {
                    setSeasonInBodyData(null);
                    setSeasonInBodySimulated(false);
                }
            })
            .catch(() => {
                if (cancelled) return;
                const local = loadLocal();
                if (local.length >= 2) { setSeasonInBodyData(local); setSeasonInBodySimulated(false); }
                else { setSeasonInBodyData(null); setSeasonInBodySimulated(false); }
            });

        return () => { cancelled = true; };
    }, [showCycleComplete, userId]);

    const completionRate = useMemo(() => {
        if (!plan?.weeks?.[activeWeek - 1]) return 0;
        const totalDays = plan.weeks[activeWeek - 1].days?.length || 0;
        if (totalDays === 0) return 0;
        const completedCount = completedWorkouts.size;
        return Math.round((completedCount / totalDays) * 100);
    }, [completedWorkouts, plan, activeWeek]);

    // Auto-detect today's workout by matching weekday names
    const todayDayNumber = useMemo(() => {
        if (!plan?.weeks?.[activeWeek - 1]?.days) return null;

        const now = new Date();
        const dayOfWeek = now.getDay();
        const weekdays = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
        const todayName = weekdays[dayOfWeek];

        console.log('[Auto-Expand] Today is', todayName, '(dayOfWeek:', dayOfWeek, ')');

        // Find day card with matching weekday label
        const days = plan.weeks[activeWeek - 1].days;
        for (let i = 0; i < days.length; i++) {
            const dayNum = i + 1;
            const configKey = Object.keys(currentTrainingDays).find(k => currentTrainingDays[k] === dayNum);
            if (configKey) {
                const cardWeekday = weekdays[parseInt(configKey)];
                console.log(`  DAY ${dayNum} label: ${cardWeekday}`);
                if (cardWeekday === todayName) {
                    console.log(`  ✓ Match! Expanding DAY ${dayNum}`);
                    return dayNum;
                }
            }
        }
        console.log('  No match - rest day');
        return null;
    }, [plan, currentTrainingDays, activeWeek]);

    // 🔕 已停用「自動展開 + 自動滾動到當天動作菜單」的行為
    //    原本進入此頁時會自動把當天的訓練卡展開並 scrollIntoView，
    //    依需求取消 —— 改為由使用者自行點選卡片才展開。
    //    （如需恢復，將下方 useEffect 內容換回 setExpandedDay + scrollIntoView 即可）
    useEffect(() => {
        // 切換週次時收合卡片，保持乾淨的初始狀態，但不主動展開任何一天
        setExpandedDay(null);
    }, [activeWeek]);

    if (loading) {
        return (
            <div className="min-h-[100dvh] bg-[#F6F4F1] flex items-center justify-center">
                <style>{`@keyframes spin-slow { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                <div className="w-12 h-12 border-2 border-[#E4DED2] border-t-[#F95C4B] rounded-full animate-[spin-slow_1s_linear_infinite]"></div>
            </div>
        );
    }

    if (!plan) {
        // 🎨 瑞士極簡空狀態（中文）：暖 Paper 畫布、左對齊編輯式排版、
        //    kicker → 大字輕量標題 → 支援說明 → 單一 Coral 主 CTA + 次要外框鈕。
        return (
            <div className="relative min-h-[100dvh] bg-[#F6F4F1] flex flex-col justify-center"
                style={{ padding: 'calc(env(safe-area-inset-top,0px) + 40px) 28px calc(env(safe-area-inset-bottom,0px) + 120px)' }}>
                <MyNotesStyles />
                {/* 空狀態同樣要有離開路徑 —— 這裡最容易讓人卡住（2026-08 稽核） */}
                <motion.button {...pressProps('icon')}
 type="button"
 onClick={handleBack}
 aria-label="返回"
 className="flex items-center justify-center rounded-full"
 style={{
 position: 'absolute', left: 22,
 top: 'calc(env(safe-area-inset-top,0px) + 18px)',
 width: 34, height: 34,
 border: '1px solid rgba(22,20,21,0.14)',
 background: 'transparent', color: '#161415', cursor: 'pointer',
 }}
 >
                    <ArrowLeft size={17} strokeWidth={2.2} />
                </motion.button>
                {/* 細紅 kicker rule + 部門標 */}
                <div className="flex items-center gap-3 mb-6">
                    <span style={{ width: 28, height: 2, background: '#F95C4B', display: 'inline-block' }} />
                    <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.22em', color: 'rgba(22,20,21,.45)' }}>
                        尚無計劃
                    </span>
                </div>
                {/* 大字輕量標題 */}
                <h1 style={{ fontSize: 40, fontWeight: 300, lineHeight: 1.08, letterSpacing: '-0.02em', color: '#161415', margin: 0 }}>
                    打造你的<br />專屬訓練藍圖
                </h1>
                {/* 支援說明 */}
                <p style={{ fontSize: 15, lineHeight: 1.7, color: 'rgba(22,20,21,.55)', margin: '20px 0 0', maxWidth: '26ch' }}>
                    選擇你的專項目標，系統會依照你的難度、可訓練天數與恢復狀態，自動生成科學化的四週課表。
                </p>
                {/* 主 CTA：Coral */}
                <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => navigate('/workout-plan-mobile')}
                    style={{
                        marginTop: 36, alignSelf: 'flex-start',
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        background: '#F95C4B', color: '#fff',
                        fontWeight: 800, fontSize: 15, letterSpacing: '0.04em',
                        padding: '15px 30px', borderRadius: 9999, border: 'none', cursor: 'pointer',
                        boxShadow: '0 8px 24px -10px rgba(249,92,75,.5)',
                    }}
                >
                    生成計劃 <span style={{ fontWeight: 400 }}>→</span>
                </motion.button>
                {/* 次要：從頭自訂（編輯式方框細字） */}
                <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => navigate('/custom-plans')}
                    style={{
                        marginTop: 14, alignSelf: 'flex-start',
                        padding: '13px 28px', border: '1.5px solid #161415', borderRadius: 4,
                        background: 'transparent', color: '#161415',
                        fontSize: 12, letterSpacing: '0.16em', fontWeight: 700, cursor: 'pointer',
                    }}
                >
                    從頭自訂計劃
                </motion.button>
                {/* 直接訓練：不需計劃即可開練 */}
                <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => navigate('/freestyle-training-mobile')}
                    style={{
                        marginTop: 14, alignSelf: 'flex-start',
                        display: 'inline-flex', alignItems: 'center', gap: 7,
                        padding: '13px 28px', border: 'none', borderRadius: 4,
                        background: 'transparent', color: 'rgba(22,20,21,.55)',
                        fontSize: 12, letterSpacing: '0.16em', fontWeight: 700, cursor: 'pointer',
                    }}
                >
                    <Zap size={14} strokeWidth={2.4} /> 直接開始訓練（免計劃）
                </motion.button>
            </div>
        );
    }

    const getPhaseName = (week) => {
        if (week === 1) return "基礎建立";
        if (week === 2) return "容量累積";
        if (week === 3) return "強度衝刺";
        return "巔峰表現";
    };

    /* 2026-08 稽核：此處原有一支 DEBUG 用的 simulateSeasonCompletion()，
       會直接把 completed_workouts_${userId}_week${w} 寫成整季全勤的假資料。
       它從未被任何按鈕呼叫（死碼），但只要有人手滑接上一顆按鈕，
       使用者就能一鍵偽造整個賽季的訓練紀錄，污染真實存檔。已移除。
       之後若需要同等的開發工具，請放在明確的 dev-only 開關後面。 */

    const currentWeekData = plan.weeks?.[activeWeek - 1] || {};
    const days = currentWeekData.days || [];

    // ── 今天要練什麼 ────────────────────────────────────────────────
    // 進頁第一眼就該看到。日卡列表（plan-daylist）在整頁最下面，要先滑過
    // 標題、工具列、hashtag、週次、日期圈、RECOVERY 才看得到 ——
    // 等於「點進來不知道今天要幹嘛」。這裡先解析出今天那一天。
    const _weekdayNames = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
    const _todayName = _weekdayNames[new Date().getDay()];
    const _resolveWeekday = (index) => {
        const dayNumber = index + 1;
        const configured = Object.keys(currentTrainingDays)
            .find(k => parseInt(currentTrainingDays[k]) === dayNumber);
        if (configured) return _weekdayNames[parseInt(configured)];
        const offset = (activeWeek - 1) * 7 + index * Math.ceil(7 / Math.max(1, days.length));
        return _weekdayNames[offset % 7];
    };
    const _sessions = days
        .map((day, index) => ({
            day, index, dayNumber: index + 1,
            weekdayName: _resolveWeekday(index),
            exercises: day?.exercises || [],
            focus: day?.focus || day?.workout_name || '訓練',
        }))
        .filter(s2 => s2.exercises.length > 0);
    const todaySession = _sessions.find(s2 => s2.weekdayName === _todayName) || null;
    const nextSession = todaySession ? null : _sessions
        .map(s2 => ({ ...s2, _gap: (_weekdayNames.indexOf(s2.weekdayName) - new Date().getDay() + 7) % 7 }))
        .sort((a, b) => a._gap - b._gap)[0] || null;
    // 這週排在今天之前、還沒練的那一堂（錯過的）—— 休息日優先提示補練，
    // 跟首頁補課卡、跑步頁「下一個目標」同一個規則：先處理漏掉的，再看下一次。
    const _todayMonIdx = (new Date().getDay() + 6) % 7;
    const missedSession = todaySession ? null : _sessions
        .map(s2 => ({ ...s2, _mon: (_weekdayNames.indexOf(s2.weekdayName) + 6) % 7 }))
        .filter(s2 => s2._mon < _todayMonIdx && !completedWorkouts?.has?.(s2.dayNumber))
        .sort((a, b) => a._mon - b._mon)[0] || null;
    const todayTotalSets = todaySession
        ? todaySession.exercises.reduce((n, ex) => n + (parseInt(ex?.sets) || 0), 0)
        : 0;

    return (
        <motion.div
            className="relative w-full min-h-[100dvh] overflow-x-hidden font-sans bg-[#CFC6B8] text-[#161415]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: dur.quick, ease: ease.lift }}
            style={{
                maxWidth: '430px',
                margin: '0 auto',
                fontFamily: "'Tenor Sans', sans-serif",
            }}
        >
            <MyNotesStyles />

            {/* 右上角浮動雲朵（同步狀態）已移除 —— 離線補送改由 App.jsx 全域掛載，
                不需要常駐 UI。 */}
            {/* 🆕 改用金屬照片底牌，移除彩色氛圍光暈避免弄濁照片 */}
            {/* <BespokeAmbientGlow transparent={true} absolute={true} /> */}

            {/* Main Content（底部留白用 --nav-clearance，讓背景延伸到導覽列下方並清出內容空間）*/}
            <div className="relative z-10 flex flex-col px-3 py-4" style={{ paddingTop: 'max(20px, env(safe-area-inset-top, 50px))', paddingBottom: 'var(--nav-clearance, 96px)' }}>

                {/* 返回：課表總覽是重訓系統的主入口，必須有明確的離開路徑（2026-08 稽核） */}
                <motion.button {...pressProps('icon')}
 type="button"
 onClick={handleBack}
 aria-label="返回"
 className="flex items-center justify-center rounded-full shrink-0"
 style={{
 width: 34, height: 34, marginLeft: -6,
 border: '1px solid rgba(22,20,21,0.14)',
 background: 'rgba(246,244,241,0.55)',
 color: '#161415', cursor: 'pointer',
 backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
 }}
 >
                    <ArrowLeft size={17} strokeWidth={2.2} />
                </motion.button>

                {/* 從中控台帶著「這天要減量」的建議進來時，先講清楚為什麼在這裡 */}
                {reduceHint && !planHintDismissed && (
                    <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-3 rounded-[16px] px-4 py-3 flex items-start gap-2.5"
                        style={{ background: 'rgba(249,92,75,0.09)', border: '1px solid rgba(249,92,75,0.24)' }}
                    >
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div className="text-[12px] font-black tracking-[0.24em] mb-1" style={{ color: '#D94030' }}>
                                建議調整{highlightDayNumber ? ` · 第 ${highlightDayNumber} 天` : ''}
                            </div>
                            <p className="text-[12px] leading-relaxed m-0" style={{ color: 'rgba(22,20,21,0.68)' }}>
                                {reduceHint}
                            </p>
                        </div>
                        <motion.button {...pressProps('icon')}
 type="button"
 aria-label="關閉提示"
 onClick={() => setPlanHintDismissed(true)}
 className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
 style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(22,20,21,0.35)' }}
 >
                            <X size={13} strokeWidth={2.4} />
                        </motion.button>
                    </motion.div>
                )}

                {/* ── Swiss Editorial Header ─────────────────────── */}
                <div className="flex flex-col gap-4 mb-6 relative" style={{ marginTop: '20px' }}>
                    {/* 右上角：訓練週期天數追蹤 (Day N / 總天數) */}
                    <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.12, duration: dur.standard, ease: ease.decel }}
                        className="absolute right-0 top-0 z-20 flex flex-col items-end"
                    >
                        <div className="flex items-baseline gap-1 relative" style={{ color: '#161415' }}>
                            {/* 回饋日標記：當天該回饋（圖二/圖一）時，天數右上角亮一顆珊瑚點 */}
                            {cycleProgress.isFeedbackDay && (
                                <motion.span
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                                    className="absolute -top-1 -right-2 z-10 block rounded-full"
                                    title="今天有訓練回饋"
                                    style={{
                                        width: 8, height: 8, background: '#D94030',
                                        boxShadow: '0 0 0 2px rgba(255,255,255,0.9), 0 0 8px rgba(217,64,48,0.6)',
                                    }}
                                />
                            )}
                            <span className="text-[12px] font-black tracking-[0.04em] opacity-40">第</span>
                            <span
                                className="text-2xl font-black tracking-tighter tabular-nums leading-none"
                                style={cycleProgress.isFeedbackDay ? { color: '#D94030' } : undefined}
                            >{cycleProgress.currentDay}</span>
                            <span className="text-[11px] font-bold opacity-30 tabular-nums">/ {cycleProgress.totalDays}</span>
                        </div>
                        {/* 進度條 */}
                        <div className="mt-1.5 w-20 h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(22,20,21,0.10)' }}>
                            <div className="h-full rounded-full" style={{ width: `${(cycleProgress.currentDay / cycleProgress.totalDays) * 100}%`, background: '#D94030' }} />
                        </div>
                        <span className="text-[12px] font-bold tracking-[0.18em] opacity-30 mt-1">
                            {cycleProgress.totalWeeks} 週週期
                        </span>
                    </motion.div>

                    <div className="flex flex-col items-start justify-between gap-4 w-full">
                        <div className="w-full pr-24">
                            {/* Swiss label + hairline reveal */}
                            <motion.div
                                className="flex items-center gap-3 mb-3"
                                initial={{ opacity: 0, x: -14 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.06, duration: dur.standard, ease: ease.decel }}
                            >
                                <span className="text-[9px] font-black tracking-[0.25em] uppercase shrink-0" style={{ color: '#D94030' }}>
                                    <DataPulse ready={luxPatchReady} w="6rem" h="0.65rem" radius="0.32rem" theme="dark" inline>
                                        Phase {activeWeek} · {getPhaseName(activeWeek)}
                                    </DataPulse>
                                </span>
                                <SwissHairline delay={0.18} color="rgba(217,64,48,0.30)" thickness={1} className="flex-1" />
                            </motion.div>

                            {/* Plan title — 依回饋移除進場動畫，避免標題「往上刷兩次」 */}
                            {/* 標題收小：原本 text-5xl 兩行約佔 160px，把「今天要練什麼」擠到摺線下，
                                就違背了「一進來就看到要練什麼」。計劃名稱是次要資訊。 */}
                            <h1 className="text-[26px] leading-[1.15] font-serif tracking-tight text-[#161415] pb-1">
                                <DataPulse ready={luxPatchReady} w="10rem" h="2.75rem" radius="0.75rem" theme="light" inline>
                                    {displayPlanName(plan.plan_name || plan.name, getDisplayName())}
                                </DataPulse>
                            </h1>
                        </div>

                        {/* ⏱ 這一期的日曆到了（第 28／28 天起）→ 放在最上面，一眼就看到。
                            以前是「訓練安排」底下一條細線，要往下滑才找得到，
                            又被跨計劃的「看過了」旗標吃掉 —— 到期當天什麼都沒跳。
                            點了開收官報告並標記這份計劃看過（首頁的提醒同一個旗標，兩邊一起停）。 */}
                        {cycleProgress.timeUp && !cycleProgress.recapSeen && (
                            /* 看起來要能按：深色鈦牆＋後面一盞珊瑚氛圍燈，右邊一顆會呼吸的珊瑚「去回饋」，
                               上面一行小標講清楚是第幾天、為什麼現在要做。 */
                            <motion.button {...pressProps('card')}
                                onClick={() => {
                                    haptic('light');
                                    setShowCycleComplete(true);   // 只打開；按下一季的確認才算完成，這張卡才會消失
                                }}
                                className="ti-surface-dark"
                                style={{
                                    position: 'relative', overflow: 'hidden', width: '100%', minHeight: 96, display: 'flex', alignItems: 'center', gap: 14,
                                    padding: '16px 16px 16px 20px', marginBottom: 14, borderRadius: 24, cursor: 'pointer',
                                    textAlign: 'left', color: '#F6F4F1', boxSizing: 'border-box',
                                }}>
                                <div aria-hidden className="ti-ambient" />
                                <span style={{ position: 'relative', zIndex: 1, flex: 1, minWidth: 0 }}>
                                    <span style={{ display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '0.2em', color: '#FF8A7A' }}>
                                        DAY {Math.min(cycleProgress.currentDay, cycleProgress.totalDays)} / {cycleProgress.totalDays}
                                    </span>
                                    <span style={{ display: 'block', fontSize: 18, fontWeight: 800, marginTop: 4 }}>
                                        {cycleProgress.overdueDays > 0 ? '這一期結束了' : '這一期今天到期'}
                                    </span>
                                    <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(246,244,241,0.66)', marginTop: 3 }}>
                                        {cycleDone ? `練完 ${cycleDone.done}／${cycleDone.total} 堂 · 回饋完排下一期` : '回饋完排下一期'}
                                    </span>
                                </span>
                                <motion.span
                                    animate={reduceMotion ? undefined : BREATHE}
                                    transition={reduceMotion ? undefined : BREATHE_T}
                                    style={{
                                        position: 'relative', zIndex: 1, flexShrink: 0, minHeight: 44, padding: '0 16px', borderRadius: 999,
                                        display: 'flex', alignItems: 'center', gap: 4, fontSize: 15, fontWeight: 800, color: '#fff',
                                        background: 'var(--lg-coral-glass)', border: '1px solid var(--lg-coral-glass-stroke)',
                                    }}>
                                    去回饋 <ChevronRight size={16} />
                                </motion.span>
                            </motion.button>
                        )}

                        {/* 🆕 這一季改了什麼：換季套用後、新一季練第一堂之前都留著，點開看每一項 */}
                        {plan?._seasonApplied && plan._seasonApplied.season === currentSeason && completedWorkouts.size === 0 && !(cycleProgress.timeUp && !cycleProgress.recapSeen) && (
                            <motion.button {...pressProps('card')}
                                onClick={() => { haptic('light'); setSeasonAppliedOpen(true); }}
                                style={{
                                    width: '100%', minHeight: 64, display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '12px 18px', marginBottom: 14, borderRadius: 24, cursor: 'pointer', textAlign: 'left',
                                    background: 'rgba(22,20,21,0.04)', border: '1px solid rgba(22,20,21,0.08)', color: '#161415', boxSizing: 'border-box',
                                }}>
                                <span style={{ flex: 1, minWidth: 0 }}>
                                    {/* 換部位重排的那一季：rows 是空的（整份換掉），改用整份比對的一句話 */}
                                    <span style={{ display: 'block', fontSize: 16, fontWeight: 800 }}>
                                        {plan._seasonApplied.kind === 'redesign'
                                            ? `第 ${plan._seasonApplied.season} 季 · 換了一份新計劃`
                                            : plan._seasonApplied.rows?.length ? `第 ${plan._seasonApplied.season} 季改了 ${plan._seasonApplied.rows.length} 項` : `第 ${plan._seasonApplied.season} 季照原本的課表`}
                                    </span>
                                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(22,20,21,0.5)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {plan._seasonApplied.kind === 'redesign'
                                            ? (plan._seasonApplied.redesign ? redesignHeadline(plan._seasonApplied.redesign) : '點開看新計劃')
                                            : plan._seasonApplied.rows?.length ? plan._seasonApplied.rows.slice(0, 2).map((r) => diffRowText(r)).join('、') : '從第 1 週重新開始'}
                                    </span>
                                </span>
                                <ChevronRight size={18} color="rgba(22,20,21,0.45)" style={{ flexShrink: 0 }} />
                            </motion.button>
                        )}

                        {/* ══ 今天要練什麼 —— 整頁第一優先，先於任何工具列 ══ */}
                        <motion.div
                            data-onboard="plan-today"
                            className="w-full"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1, duration: dur.standard, ease: ease.decel }}
                        >
                            {todaySession ? (
                                <div className="ti-surface-photo ti-r-2xl"
                                    style={{ position: 'relative', overflow: 'hidden', padding: '24px 24px 22px' }}>
                                    {/* 白玻璃罩 —— 與下方日卡同一套材質：真實拉絲金屬照片透出來，整體仍偏亮 */}
                                    <span className="ti-glass-veil" />

                                    <div style={{ position: 'relative', zIndex: 1 }}>
                                        <div className="flex items-center justify-between" style={{ marginBottom: 13 }}>
                                            <span className="ti-kicker" style={{ color: '#D94030' }}>今天</span>
                                            <span className="ti-mono" style={{ fontSize: 11, color: 'rgba(22,20,21,0.50)' }}>
                                                {todaySession.exercises.length} 個動作{todayTotalSets ? ` · ${todayTotalSets} 組` : ''}
                                            </span>
                                        </div>

                                        <h2 style={{
                                            fontFamily: 'var(--font-display)', fontWeight: 300,
                                            fontSize: 34, lineHeight: 1.06, letterSpacing: '-0.02em',
                                            color: '#161415', margin: '0 0 18px',
                                        }}>
                                            {todaySession.focus}
                                        </h2>

                                        {/* 右角資料列：Pebble 髮絲線分隔、數值等寬 */}
                                        <div style={{ marginBottom: 20 }}>
                                            {todaySession.exercises.slice(0, 4).map((ex, i) => (
                                                <div key={i} style={{
                                                    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                                                    padding: '9px 0',
                                                    borderTop: i === 0 ? 'none' : '1px solid rgba(207,198,184,0.60)',
                                                }}>
                                                    <span style={{
                                                        fontSize: 14, fontWeight: 700, color: '#161415',
                                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 14,
                                                    }}>{ex?.name || '動作'}</span>
                                                    <span className="ti-mono" style={{
                                                        fontSize: 11.5, color: 'rgba(22,20,21,0.52)', flexShrink: 0,
                                                    }}>
                                                        {/* 這一季剛改過的動作：數字前面標「新」，一眼知道哪裡跟上一季不一樣 */}
                                                        {plan?._seasonApplied?.season === currentSeason && plan._seasonApplied.rows?.some((r) => r.newName === ex?.name || r.name === ex?.name) && (
                                                            <span style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 800, color: '#F6F4F1', background: '#161415', borderRadius: 999, padding: '2px 7px', marginRight: 6 }}>新</span>
                                                        )}
                                                        {ex?.sets ? `${ex.sets}×${ex.reps ?? '—'}` : ''}
                                                    </span>
                                                </div>
                                            ))}
                                            {todaySession.exercises.length > 4 && (
                                                <div style={{
                                                    paddingTop: 9, borderTop: '1px solid rgba(207,198,184,0.60)',
                                                    fontSize: 11.5, color: 'rgba(22,20,21,0.48)',
                                                }}>
                                                    還有 {todaySession.exercises.length - 4} 個
                                                </div>
                                            )}
                                        </div>

                                        {/* Liquid Glass coral —— 與日卡展開後的「開始訓練」同一顆，
                                            但降飽和：alpha 0.72→0.50、saturate 2.2→1.25，做出隔著霧面玻璃的珊瑚色 */}
                                        <motion.button
                                            whileHover={{ scale: 1.01 }}
                                            whileTap={{ scale: 0.97 }}
                                            animate={reduceMotion ? undefined : BREATHE}
                                            transition={reduceMotion ? { type: 'spring', stiffness: 380, damping: 20 } : BREATHE_T}
                                            onClick={() => handleStartWorkout(todaySession.day)}
                                            style={{
                                                width: '100%', height: 54, borderRadius: 20,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                                                position: 'relative', overflow: 'hidden', cursor: 'pointer',
                                                /* 配方在 styles/liquid-glass.css 的 --lg-coral-glass*：
                                                   儲存鍵那顆讀的是同一組變數，兩邊不會再各長各的。 */
                                                border: '1px solid var(--lg-coral-glass-stroke)',
                                                background: 'var(--lg-coral-glass)',
                                                backdropFilter: 'var(--lg-coral-glass-filter)',
                                                WebkitBackdropFilter: 'var(--lg-coral-glass-filter)',
                                                boxShadow: 'var(--lg-coral-glass-shadow)',
                                            }}
                                        >
                                            {/* 上緣鏡面高光 —— 液態玻璃的關鍵 */}
                                            <span style={{
                                                position: 'absolute', top: 0, left: '8%', right: '8%', height: '40%',
                                                pointerEvents: 'none', borderRadius: '0 0 999px 999px',
                                                background: 'linear-gradient(180deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0) 100%)',
                                                filter: 'blur(2px)',
                                            }} />
                                            <span style={{
                                                position: 'absolute', bottom: 0, left: 0, right: 0, height: '28%',
                                                pointerEvents: 'none', borderRadius: '0 0 20px 20px',
                                                background: 'linear-gradient(0deg, rgba(255,255,255,0.14) 0%, transparent 100%)',
                                            }} />
                                            <Play size={15} fill="currentColor" strokeWidth={0}
                                                style={{ color: '#FFFFFF', position: 'relative', zIndex: 10 }} />
                                            {/* 白字。玻璃同步加厚一階（alpha 0.50→0.66），白字才讀得到 ——
                                                之前改黑字就是因為那一階太淡撐不住白。 */}
                                            <span style={{
                                                color: '#FFFFFF', fontSize: 14, fontWeight: 800, letterSpacing: '0.1em',
                                                fontFamily: 'var(--font-display)', position: 'relative', zIndex: 10,
                                            }}>開始訓練</span>
                                        </motion.button>
                                    </div>
                                </div>
                            ) : (
                                /* 休息日：冷調 Mist 底的安靜面板 —— 與訓練日的金屬拉開溫度層次 */
                                <div className="ti-r-xl" style={{
                                    background: '#E8E9E6', border: '1px solid rgba(207,198,184,0.55)',
                                    padding: '18px 22px',
                                }}>
                                    <div className="ti-kicker" style={{ marginBottom: 6 }}>今天</div>
                                    <div style={{
                                        fontFamily: 'var(--font-display)', fontWeight: 300,
                                        fontSize: 24, letterSpacing: '-0.01em', color: '#161415', lineHeight: 1.1,
                                    }}>休息日</div>
                                    {missedSession && (
                                        <motion.button
                                            {...pressProps('pill')}
                                            onClick={() => { haptic('medium'); handleStartWorkout(missedSession.day); }}
                                            aria-label={`補練${missedSession.weekdayName}的${missedSession.focus}`}
                                            style={{
                                                marginTop: 12, minHeight: 44, width: '100%', padding: '10px 16px',
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                                                borderRadius: 999, border: '1px solid rgba(249,92,75,0.35)',
                                                background: 'rgba(255,255,255,0.72)', cursor: 'pointer', textAlign: 'left',
                                            }}
                                        >
                                            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 700, color: '#161415' }}>
                                                補練{missedSession.weekdayName} · {missedSession.focus}
                                            </span>
                                            <Play size={13} fill="currentColor" strokeWidth={0} style={{ color: '#F95C4B', flexShrink: 0 }} />
                                        </motion.button>
                                    )}
                                    {nextSession && (
                                        <div style={{ fontSize: 12.5, color: 'rgba(22,20,21,0.55)', marginTop: 7 }}>
                                            下一次 {nextSession.weekdayName} · {nextSession.focus}
                                        </div>
                                    )}
                                </div>
                            )}
                        </motion.div>

                        {/* Quick Actions — iOS 26 Liquid Glass Toolbar (無分隔線) */}
                        <LiquidGlassToolbar
                            navigate={navigate}
                            setShowFullPlan={setShowFullPlan}
                        />
                    </div>


                    {/* 2026-09 減資訊：移除 #CHEST #SHOULDERS… 標籤列。
                        訓練部位在上方「今天」卡片的大標已經說清楚，這排只是重複，而且是英文。 */}

                    {/* Welcome Overlay for First Plan - My Notes Style */}
                    <AnimatePresence>
                        {showWelcomeOverlay && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm"
                                onClick={dismissWelcome}
                            >
                                <motion.div
                                    initial={{ scale: 0.9, y: 20, rotate: -2 }}
                                    animate={{ scale: 1, y: 0, rotate: 0 }}
                                    exit={{ scale: 0.9, y: 20 }}
                                    className="bg-[#E4DED2] p-8 rounded-[28px] max-w-sm w-full shadow-2xl relative overflow-hidden text-[#161415]"
                                    onClick={e => e.stopPropagation()}
                                >
                                    {/* Header */}
                                    <div className="flex justify-between items-start mb-6">
                                        <h3 className="text-3xl font-bold leading-none tracking-tight font-serif-display">
                                            專屬計劃
                                            <div className="text-sm font-sans font-medium opacity-60 mt-1">First Plan Generated</div>
                                        </h3>
                                        <div className="w-10 h-10 rounded-full border border-black/10 flex items-center justify-center">
                                            <Heart size={20} className="text-black/60" />
                                        </div>
                                    </div>

                                    {/* Content */}
                                    <p className="text-black/80 mb-8 leading-relaxed font-medium">
                                        這是根據您的目標、訓練頻率與場地設備，
                                        特別為您量身打造的第一套訓練計劃。
                                        <br /><br />
                                        準備好開始蛻變了嗎？
                                    </p>

                                    {/* Action Button */}
                                    <motion.button
                                        whileTap={{ scale: 0.95 }}
                                        onClick={dismissWelcome}
                                        className="w-full py-4 bg-[#161415] text-[#CFC6B8] font-bold rounded-[24px] text-lg hover:bg-black transition-colors flex items-center justify-center gap-2"
                                    >
                                        <span>開始訓練</span>
                                        <Sparkles size={18} className="text-[#F95C4B]" />
                                    </motion.button>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Analytics Overlay */}
                    <AnimatePresence>
                        {showAnalytics && (
                            <TrainingAnalyticsDashboard
                                onClose={() => setShowAnalytics(false)}
                                workoutHistory={workoutHistory}
                                recoveryScore={avgRecoveryScore}
                                muscleScores={muscleRecoveryScores}
                                userId={userId}
                                userProfile={plan?.user_profile}
                            />
                        )}
                    </AnimatePresence>

                    {/* Week Selector — Swiss: hairline strip + morphing Coral underline */}
                    <div
                        data-onboard="plan-weeks"
                        className="relative flex items-end gap-6 self-start pb-2 mb-0"
                        style={{
                            borderBottom: `1px solid ${C.black}10`,
                            maxWidth: '100%', overflowX: 'auto', scrollbarWidth: 'none',
                        }}
                    >
                        {weekNumsOf(plan).map((week) => {
                            const isCompleted = weekCompletionStatus[week];
                            const isActive = activeWeek === week;
                            // 週數追蹤：前面尚未完成的最早一週 = 目前該練的週次
                            const statusKnown = Object.keys(weekCompletionStatus).length > 0;
                            const firstIncomplete = weekNumsOf(plan).find(w => !weekCompletionStatus[w]) || weekNumsOf(plan).length;
                            // 只能停留在「已完成的週」或「目前該練的週」，不能跳到更後面尚未解鎖的週
                            const isLocked = statusKnown && week > firstIncomplete;

                            return (
                                <motion.button {...pressProps('cta')}
 key={week}
 onClick={() => {
 if (isLocked) {
 // 前面還沒做完 → 提示使用者先完成前面的週次
 setWeekLockHint({ target: week, doFirst: firstIncomplete });
 haptic('warning');
 clearTimeout(window.__weekLockTimer);
 window.__weekLockTimer = setTimeout(() => setWeekLockHint(null), 4500);
 return;
 }
 setWeekLockHint(null);
 setActiveWeek(week);
 }}
 className="relative flex items-center gap-1 pb-2 cursor-pointer transition-colors duration-200 "
 style={{ opacity: isLocked ? 0.4 : 1 }}
 >
                                    <span
                                        className="uppercase tabular-nums"
                                        style={{
                                            fontSize: 12,
                                            letterSpacing: '0.22em',
                                            color: isActive ? C.black : `${C.black}55`,
                                            fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
                                            fontWeight: isActive ? 600 : 500,
                                            transition: 'color 200ms',
                                        }}
                                    >
                                        第{week}週
                                    </span>

                                    {isLocked && (
                                        <Lock size={9} strokeWidth={2} style={{ color: `${C.black}55`, marginLeft: 2 }} />
                                    )}

                                    {isCompleted && !isActive && !isLocked && (
                                        <span
                                            className="inline-block rounded-full"
                                            style={{ width: 3, height: 3, background: C.coral, marginLeft: 2 }}
                                        />
                                    )}

                                    {/* Morphing active underline — single coral hairline */}
                                    {isActive && (
                                        <motion.span
                                            layoutId="week-active-underline"
                                            className="absolute left-0 right-0"
                                            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                                            style={{
                                                bottom: -1,
                                                height: 2,
                                                background: C.coral,
                                                borderRadius: 2,
                                            }}
                                        />
                                    )}
                                </motion.button>
                            );
                        })}
                    </div>

                    {/* 週數鎖定提示：前面尚未完成，先做前面 */}
                    <AnimatePresence>
                        {weekLockHint && (
                            <motion.div
                                key="week-lock-hint"
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                className="self-start mt-2 flex items-center gap-1.5"
                                style={{ fontSize: 11, letterSpacing: '0.01em', color: C.ember, fontWeight: 500 }}
                            >
                                <Lock size={10} strokeWidth={2} />
                                請先完成第 {weekLockHint.doFirst} 週的訓練，才能解鎖第 {weekLockHint.target} 週
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>



                {/* Training Days Scheduler - 極簡行事曆 */}
                <div data-onboard="plan-schedule" className="mb-4">
                    <div className="flex justify-between items-center mb-3">
                        <h3
                            className="uppercase"
                            style={{
                                fontSize: 12,
                                letterSpacing: '0.28em',
                                color: 'rgba(22,20,21,0.42)',
                                fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
                                fontWeight: 500,
                            }}
                        >
                            訓練安排
                        </h3>
                        {/* 2026-09：訓練日的調整統一搬到中控台，這裡只顯示不編輯。
                            同一件事兩個入口會讓兩邊的防呆規則不一致。 */}
                    </div>

                    {/* 🩹 本週回饋的「手動入口」。
                        原本 showFeedbackModal 只有 useWeekCompletionTracker 的自動彈窗會打開，
                        而它要求「整週每一天都練完」；全 app 沒有任何按鈕能開它。
                        中控台卻照樣顯示「待回饋」叫人來填 —— 點進來什麼都找不到。
                        門檻改成「有練就能回饋」：完成 ≥1 堂就出現，填過就不再出現。 */}
                    {completedWorkouts.size > 0 && !hasFeedbackForWeek && (
                        <motion.button {...pressProps('row')}
                            onClick={() => { haptic('light'); setShowFeedbackModal(true); }}
                            style={{
                                width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10,
                                padding: '14px 0', marginBottom: 4, background: 'transparent', cursor: 'pointer',
                                textAlign: 'left', border: 'none',
                                borderTop: '1px solid rgba(207,198,184,0.7)',
                                borderBottom: '1px solid rgba(207,198,184,0.7)',
                            }}>
                            <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: '#161415' }}>
                                填第 {activeWeek} 週的訓練回饋
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#F95C4B' }}>
                                已完成 {completedWorkouts.size} 堂
                            </span>
                        </motion.button>
                    )}

                    {/* Rest Day — 放大成「進步回饋卡」：告訴使用者哪邊進步了（1RM 預測 / 總容量 / 部位平衡）*/}
                    {!todayDayNumber && (
                        <motion.button
                            onClick={() => {
                                setPreviewDay({
                                    id: 'rest-day',
                                    dayNumber: 0,
                                    focus: '休息 & 恢復',
                                    exercises: [
                                        { name: 'Foam Rolling', sets: 1, reps: '10 min', muscle: 'Full Body' },
                                        { name: 'Deep Stretching', sets: 1, reps: '15 min', muscle: 'Flexibility' },
                                        { name: 'Hydration & Nutrition', sets: 1, reps: 'Optimal', muscle: 'Recovery' }
                                    ],
                                    time: '25',
                                    type: 'rest'
                                });
                                setPreviewCardColor('#E4DED2');
                                setPreviewWeekday('REST DAY');
                            }}
                            whileTap={{ scale: 0.99 }}
                            className="w-full mb-6 rounded-[24px] px-5 py-5 text-left ti-surface-pale"
                            style={{ position: 'relative', overflow: 'hidden', display: 'block' }}
                        >
                            {/* 標題列：進步回饋 + 休息狀態小字 */}
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <TrendingUp size={17} strokeWidth={2.2} style={{ color: C.coral }} />
                                    {/* 運動風斜體：中文沒有真正的斜體字，用 skew 做出傾斜，
                                        搭配重字重與收緊的字距 —— 這是標題，不是資料標籤。 */}
                                    <span style={{
                                        fontSize: 22, fontWeight: 900, color: C.ink,
                                        letterSpacing: '-0.03em', lineHeight: 1,
                                        display: 'inline-block', transform: 'skewX(-9deg)',
                                        transformOrigin: 'left bottom',
                                    }}>
                                        你的進步
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <Moon size={12} strokeWidth={1.6} style={{ color: `${C.black}50` }} />
                                    <span className="tabular-nums" style={{ fontSize: 11, fontWeight: 600, color: `${C.black}50`, fontFamily: '"Geist Mono", "JetBrains Mono", monospace' }}>
                                        休息{todayReadinessScore != null ? ` · 準備度 ${Math.round(todayReadinessScore)}%` : ''}
                                    </span>
                                    <ChevronRight size={13} strokeWidth={1.6} style={{ color: `${C.black}38` }} />
                                </div>
                            </div>

                            {/* 重點只有一個：這一期做完幾堂。
                                其餘三個數字收成一行小字 —— 它們是佐證，不是主角。
                                （原本三格各有標題＋大數字＋說明，光這一張卡就六段小字。） */}
                            {cycleDone && (
                                <div className="mb-3">
                                    <div className="flex items-baseline gap-2">
                                        <span className="tabular-nums" style={{
                                            fontSize: 44, fontWeight: 300, lineHeight: 1, color: C.ink,
                                            fontFamily: 'var(--font-display)', letterSpacing: '-0.03em',
                                        }}>{cycleDone.done}</span>
                                        <span className="tabular-nums" style={{ fontSize: 17, fontWeight: 500, color: `${C.black}45` }}>
                                            / {cycleDone.total} 堂
                                        </span>
                                        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', color: `${C.black}40` }}>
                                            本期完成
                                        </span>
                                    </div>
                                    <div style={{ height: 5, borderRadius: 99, background: `${C.black}12`, overflow: 'hidden', marginTop: 10 }}>
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${cycleDone.pct}%` }}
                                            transition={{ type: 'spring', stiffness: 240, damping: 32, delay: 0.15 }}
                                            style={{ height: '100%', borderRadius: 99, background: C.coral }}
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: 11.5, fontWeight: 600, color: `${C.black}45` }}>
                                {progressFeedback.oneRMGainPct != null && (
                                    <span>訓練量 <span style={{ color: C.coral, fontWeight: 800 }}>+{progressFeedback.oneRMGainPct}%</span></span>
                                )}
                                {progressFeedback.vol > 0 && (
                                    <>
                                        <span style={{ opacity: 0.35 }}>·</span>
                                        <span className="tabular-nums">總量 {progressFeedback.vol > 999 ? `${(progressFeedback.vol / 1000).toFixed(1)}k` : progressFeedback.vol} kg</span>
                                    </>
                                )}
                                {progressFeedback.topMuscle && (
                                    <>
                                        <span style={{ opacity: 0.35 }}>·</span>
                                        <span>主攻 {progressFeedback.topMuscle}</span>
                                    </>
                                )}
                            </div>
                        </motion.button>
                    )}

                    {/* 2026-09：一排星期圓點已移除 —— 訓練日的調整在中控台做，
                        下面的課表卡本來就逐日列出來了，這裡再放一排只是重複。 */}
                </div>

                {/* RECOVERY SCULPTURE BENTO - Recovery Status
                    （維持原本行為：顯示各部位的肌肉恢復量。肌肉平衡分析已移到 InBody 分析頁的「歷史」。） */}
                <div data-onboard="plan-recovery" className="mt-2 mb-6 relative z-10">
                    <RecoverySculptureBento
                        recoveryData={muscleRecoveryScores}
                        overallScore={avgRecoveryScore}
                    />
                </div>

                {/* Day List Container — Swiss stagger reveal
                    規範 v1：key={activeWeek} 讓切週時整列以 Lateral（x:16→0）重新進場，
                    stagger 收斂到 70ms、house easing */}
                <motion.div
                    key={activeWeek}
                    data-onboard="plan-daylist"
                    className="space-y-4"
                    initial="hidden"
                    animate="visible"
                    variants={{
                        hidden: { opacity: 0, x: 16 },
                        visible: {
                            opacity: 1, x: 0,
                            transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1], staggerChildren: 0.07, delayChildren: 0.12 }
                        }
                    }}
                >
                    {
                        days.map((day, index) => {
                            const dayNumber = index + 1;
                            const isExpanded = expandedDay === dayNumber;
                            const status = index === 0 ? 'READY' : 'LOCKED';

                            // Calculate Weekday Name based on the week's actual calendar dates
                            // Assuming each week starts on a specific day (e.g., Monday)
                            const weekStartOffset = (activeWeek - 1) * 7; // Days from plan start
                            const dayCalendarOffset = weekStartOffset + (index * Math.ceil(7 / days.length)); // Distribute days across the week

                            // Get the day of week (0 = Sunday, 6 = Saturday)
                            const dayOfWeek = dayCalendarOffset % 7;
                            const weekdays = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

                            // Try to find from training days config first, otherwise use calculated

                            // Check if this day corresponds to Today
                            const todayIndex = new Date().getDay(); // 0=Sun, 1=Mon...
                            const todayName = weekdays[todayIndex];

                            const configuredWeekdayIndex = Object.keys(currentTrainingDays).find(key => parseInt(currentTrainingDays[key]) === dayNumber);
                            const weekdayName = configuredWeekdayIndex
                                ? weekdays[parseInt(configuredWeekdayIndex)]
                                : weekdays[dayOfWeek];

                            // Recalculate isToday based on the final weekdayName
                            const isDayMatch = weekdayName === todayName;

                            // Define Colors for Days
                            const THEME = {
  BLACK: T.STONE_DARK,
  PAPER: T.PAPER,
  STONE: T.STONE,
  PEBBLE: T.PEBBLE,
  CORAL: T.CORAL,
};
                            const isHero = isDayMatch;
                            const cardColor = isHero ? '#F6F4F1' : '#F6F4F1';
                            // Swiss editorial: Paper bg, Ink text, coral left-border accent for today

                            return (
                                <motion.div
                                    key={index}
                                    id={`day-card-${dayNumber}`}
                                    variants={{
                                        // 規範 v1：位移 ≤20px、house easing 統一
                                        hidden: { opacity: 0, y: 14 },
                                        visible: {
                                            opacity: 1, y: 0,
                                            transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] }
                                        }
                                    }}
                                    onClick={() => setExpandedDay(isExpanded ? null : dayNumber)}
                                    // 👇 DRVN Titanium 拉絲金屬日卡：用真實金屬照片(11.jpeg)當底材質 + 半透明白玻璃罩；今日感靠「整圈 coral 特斯拉光暈 + coral DAY 徽章」
                                    className="mb-4 cursor-pointer transition-all duration-300 ti-surface-photo"
                                    style={{
                                        borderRadius: 28, // Bento 圓潤感
                                        padding: 12,
                                        overflow: 'hidden',
                                        position: 'relative',
                                        // 🆕 今日：整圈微微特斯拉感 coral 光暈（疊在 ti-surface 金屬斜角陰影上）
                                        boxShadow: isHero
                                            ? '0 0 0 1px rgba(249,92,75,0.20), 0 0 18px rgba(249,92,75,0.22), 0 0 40px rgba(249,92,75,0.12), 0 14px 34px rgba(22,20,21,0.07), inset 0 2px 3px rgba(255,255,255,1), inset 0 -3px 7px rgba(22,20,21,0.05)'
                                            : undefined,
                                    }}
                                >
                                    {/* DRVN 拉絲金屬斜向光澤 */}
                                    <span className="ti-sheen" />
                                    {/* 🆕 金屬白 Liquid Glass 罩：在拉絲金屬上再蒙一層霜面白玻璃 */}
                                    <span className={`ti-glass-veil${isHero ? ' ti-glass-veil--hero' : ''}`} />
                                    {/* ── Shimmer overlay for today ── */}
                                    {isHero && (
                                        <motion.div
                                            style={{
                                                position: 'absolute', top: 0, left: 0,
                                                width: '70%', height: '100%',
                                                background: 'linear-gradient(100deg, transparent 30%, rgba(249,92,75,0.06) 48%, rgba(249,92,75,0.12) 50%, rgba(249,92,75,0.06) 52%, transparent 70%)',
                                                pointerEvents: 'none', zIndex: 2,
                                                borderRadius: 18,
                                            }}
                                            animate={{ x: ['-100%', '260%'] }}
                                            transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 2.4, ease: [0.16, 1, 0.3, 1] }}
                                        />
                                    )}
                                    {/* ── Bento Glass Header ── */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative', zIndex: 3 }}>

                                        {/* Bento Cell 1: Day 數字模塊 — 兩種狀態都用亮玻璃，主卡上用半透明白玻璃浮起 */}
                                        <div style={{
                                            width: 52, height: 52, borderRadius: 18, flexShrink: 0,
                                            position: 'relative', overflow: 'hidden', isolation: 'isolate',
                                            // 🆕 今日：coral 玻璃徽章（唯一的 coral 強調點）；其他天：暖 Paper/Stone 徽章（不再冷白）
                                            background: isHero
                                                ? 'linear-gradient(135deg, rgba(255,122,107,0.92) 0%, rgba(249,92,75,0.95) 40%, rgba(217,64,48,0.96) 100%)'
                                                : 'linear-gradient(135deg, rgba(246,244,241,0.95) 0%, rgba(228,222,210,0.85) 100%)',
                                            backdropFilter: 'blur(16px) saturate(180%)',
                                            WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                                            boxShadow: isHero
                                                ? '0 8px 20px rgba(217, 64, 48, 0.30), inset 0 1.5px 1px rgba(255,255,255,0.55)'
                                                : 'inset 0 1.5px 0 rgba(255,255,255,0.8), 0 8px 22px rgba(43,39,34,0.14)',
                                            border: isHero ? '1px solid rgba(255,255,255,0.45)' : '1px solid rgba(255,255,255,0.7)',
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            <span className="wf-mono" style={{ fontSize: 9, letterSpacing: '0.2em', color: isHero ? '#FFF0EC' : '#161415', fontWeight: 800 }}>DAY</span>
                                            <span style={{ fontSize: 22, fontWeight: 700, color: isHero ? '#FFFFFF' : '#161415', lineHeight: 1 }}>{dayNumber}</span>
                                        </div>

                                        {/* Bento Cell 2: 資訊模塊 */}
                                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <h3 className="wf-serif truncate" style={{ fontSize: isHero ? 22 : 20, margin: 0, color: '#161415', fontWeight: 600 }}>{weekdayName}</h3>
                                                {completedWorkouts.has(dayNumber) && <CheckCircle2 size={18} color="#5A7A3A" />}
                                                {isHero && (
                                                    <span style={{ background: 'rgba(249,92,75,0.12)', color: '#D94030', border: '1px solid rgba(249,92,75,0.3)', padding: '2px 8px', borderRadius: 6, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em' }}>TODAY</span>
                                                )}
                                            </div>

                                            {/* 子網格：標籤 Pills */}
                                            {(() => {
                                                const { sessionType, muscles } = parseFocusChips(day.focus);
                                                return (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                                                        {sessionType && sessionType !== 'TRAINING' && (
                                                            // DRVN：coral 只留給今日，其他天焦點標籤降為中性深墨
                                                            <span style={{ padding: '2px 0', fontSize: 9, fontWeight: 800, color: isHero ? '#D94030' : 'rgba(22,20,21,0.55)', letterSpacing: '0.1em' }}>
                                                                {sessionType}
                                                            </span>
                                                        )}
                                                        {sessionType && sessionType !== 'TRAINING' && <span style={{ color: 'rgba(22,20,21,0.3)', fontSize: 11 }}>|</span>}
                                                        <span style={{ padding: '2px 0', fontSize: 11, fontWeight: 700, color: 'rgba(22,20,21,0.6)', letterSpacing: '0.05em' }}>
                                                            {day.time || '45'} MIN · {day.exercises?.length || 0} 動作
                                                        </span>
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        <div style={{
                                            width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            // 主卡：白玻璃圓鈕；次卡：淺玻璃圓鈕（統一語言）
                                            background: 'linear-gradient(135deg, rgba(255,255,255,0.55), rgba(255,255,255,0.30))',
                                            border: '1px solid rgba(255,255,255,0.6)',
                                            backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
                                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)',
                                            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                            transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
                                        }}>
                                            <ChevronRight size={18} color="#161415" opacity={0.7} />
                                        </div>
                                    </div>

                                    {/* ── Expanded Content ── */}
                                    <AnimatePresence>
                                        {isExpanded && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.22 }}
                                                className="overflow-hidden"
                                                style={{ position: 'relative', zIndex: 3 }}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(43,39,34,0.10)' }}>
                                                    {/* Grouped exercise list — superset / drop-set / standalone */}
                                                    <div>
                                                        {(() => {
                                                            // ── Build groups ──────────────────────────────────────
                                                            const exList = day.exercises || [];
                                                            const groups = [];
                                                            let idx = 0;
                                                            while (idx < exList.length) {
                                                                const ex = exList[idx];
                                                                const ssId = ex.supersetId || ex.supersetGroup;
                                                                if (ssId) {
                                                                    const pair = [];
                                                                    while (idx < exList.length && (exList[idx].supersetId || exList[idx].supersetGroup) === ssId) {
                                                                        pair.push({ ex: exList[idx], origIdx: idx });
                                                                        idx++;
                                                                    }
                                                                    groups.push({ type: 'superset', pair, ssId, supersetType: pair[0]?.ex?.supersetType });
                                                                } else {
                                                                    groups.push({ type: 'standalone', ex, origIdx: idx });
                                                                    idx++;
                                                                }
                                                            }

                                                            const totalGroups = groups.length;
                                                            let ssCounter = 0;
                                                            return groups.map((g, gi) => {

                                                                // ── SUPERSET CARD ──────────────────────────────────
                                                                if (g.type === 'superset') {
                                                                    ssCounter++;
                                                                    const displayGid = `SS${ssCounter}`;
                                                                    const isAntagonist = g.supersetType === 'antagonist';
                                                                    const ssAccent = isAntagonist ? '#FF453A' : '#FF9F0A';
                                                                    const ssLabel = isAntagonist ? '拮抗肌超級組' : '力竭超級組';
                                                                    const letters = 'ABCDEFGH';
                                                                    return (
                                                                        <motion.div
                                                                            key={gi}
                                                                            layout="position"
                                                                            transition={{ type: "spring", stiffness: 380, damping: 32 }}
                                                                            drag={isExerciseEditing ? "y" : false}
                                                                            dragConstraints={{ top: 0, bottom: 0 }}
                                                                            dragElastic={0.4}
                                                                            dragTransition={{ bounceStiffness: 600, bounceDamping: 25 }}
                                                                            onDragEnd={(event, info) => {
                                                                                const offset = info.offset.y;
                                                                                if (Math.abs(offset) > 40) {
                                                                                    const direction = offset > 0 ? 1 : -1;
                                                                                    const targetGi = gi + direction;
                                                                                    if (targetGi >= 0 && targetGi < totalGroups) {
                                                                                        handleReorderGroups(index, gi, targetGi);
                                                                                    }
                                                                                }
                                                                            }}
                                                                            style={{
                                                                                marginBottom: 0, marginTop: 0,
                                                                                padding: '16px 2px 18px 14px',
                                                                                position: 'relative',
                                                                                // 瑞士極簡：無 bento 面板，左側 coral 細線標記超級組 + 底部 hairline 分隔
                                                                                borderLeft: `2px solid ${ssAccent}`,
                                                                                borderBottom: '1px solid rgba(43,39,34,0.10)',
                                                                                cursor: 'default',
                                                                            }}
                                                                        >
                                                                            {/* Header — 特殊組實心膠囊徽章（與彈出 modal 一致）*/}
                                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, position: 'relative', zIndex: 1 }}>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 99, background: ssAccent, color: '#fff', fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                                                                                        {isAntagonist ? <Zap size={11} color="#fff" strokeWidth={2.4} /> : <Flame size={11} color="#fff" strokeWidth={2.4} />}
                                                                                        超級組 {displayGid}
                                                                                    </span>
                                                                                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(22,20,21,0.5)' }}>{ssLabel}</span>
                                                                                </div>
                                                                            </div>
                                                                            {/* Exercises in pair */}
                                                                            {g.pair.map(({ ex, origIdx }, pi) => (
                                                                                <div key={pi} style={{ marginBottom: pi < g.pair.length - 1 ? 16 : 0 }}>
                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                                                        <ExerciseRowCard ex={ex} size={44} />
                                                                                        <div style={{
                                                                                            width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                                                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                                            fontSize: 11, fontWeight: 900,
                                                                                            background: pi === 0 ? '#161415' : `${ssAccent}18`,
                                                                                            color: pi === 0 ? '#E4DED2' : ssAccent,
                                                                                        }}>
                                                                                            {letters[pi] || (pi + 1)}
                                                                                        </div>
                                                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                                                            <p style={{ fontSize: 13, fontWeight: 600, color: '#161415', margin: 0, lineHeight: 1.3 }}>{getExerciseNameZh(ex.name)}</p>
                                                                                            <ExerciseMeta ex={ex} />
                                                                                            <div style={{
                                                                                                display: 'inline-flex', alignItems: 'center',
                                                                                                padding: '2px 8px', borderRadius: 999,
                                                                                                background: 'transparent', border: `1px solid ${ssAccent}40`,
                                                                                                color: '#D94030', fontSize: 11, fontWeight: 800,
                                                                                                letterSpacing: '0.05em', marginTop: 4
                                                                                            }}>
                                                                                                {ex.sets} 組 · {ex.reps} 次
                                                                                                {ex.rest === '0s' && <span style={{ marginLeft: 4 }}>· 不休息</span>}
                                                                                                {ex.suggestedWeight > 0 && <span style={{ marginLeft: 4 }}>· 建議 {ex.suggestedWeight}kg</span>}
                                                                                            </div>
                                                                                        </div>
                                                                                        {isExerciseEditing && (
                                                                                            <div style={{ display: 'flex', gap: 4 }}>
                                                                                                <motion.button {...pressProps('row')} onClick={(e) => { e.stopPropagation(); setReplacementTarget({ dayIdx: index, exIdx: origIdx }); setSelectedCategory('All'); setShowAddExerciseModal(true); }} style={{ padding: '5px 8px', border: '1px solid #CFC6B8', borderRadius: 2, background: '#F6F4F1', cursor: 'pointer', color: '#161415', fontSize: 11 }} title="替換">⇄</motion.button>
                                                                                                <motion.button {...pressProps('row')} onClick={(e) => { e.stopPropagation(); handleRemoveExercise(index, origIdx); }} style={{ padding: '5px 8px', border: '1px solid rgba(249,92,75,0.3)', borderRadius: 2, background: 'transparent', cursor: 'pointer', color: '#F95C4B', fontSize: 11 }} title="刪除">×</motion.button>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                    {/* Connector arrow between pair items */}
                                                                                    {pi < g.pair.length - 1 && (
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 56, marginTop: 12 }}>
                                                                                            <div style={{ width: 1, height: 16, background: ssAccent, opacity: 0.3 }} />
                                                                                            <span style={{ fontSize: 9, fontWeight: 900, color: ssAccent, opacity: 0.5, letterSpacing: '0.2em', textTransform: 'uppercase' }}>→ NEXT</span>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            ))}
                                                                        </motion.div>
                                                                    );
                                                                }

                                                                // ── FINISHER DROP SET CARD ────────────────────────
                                                                const { ex, origIdx } = g;
                                                                if (ex?.isDropSet) {
                                                                    const dropAccent = '#FF453A';
                                                                    return (
                                                                        <motion.div
                                                                            key={gi}
                                                                            layout="position"
                                                                            transition={{ type: "spring", stiffness: 380, damping: 32 }}
                                                                            drag={isExerciseEditing ? "y" : false}
                                                                            dragConstraints={{ top: 0, bottom: 0 }}
                                                                            dragElastic={0.4}
                                                                            dragTransition={{ bounceStiffness: 600, bounceDamping: 25 }}
                                                                            onDragEnd={(event, info) => {
                                                                                const offset = info.offset.y;
                                                                                if (Math.abs(offset) > 40) {
                                                                                    const direction = offset > 0 ? 1 : -1;
                                                                                    const targetGi = gi + direction;
                                                                                    if (targetGi >= 0 && targetGi < totalGroups) {
                                                                                        handleReorderGroups(index, gi, targetGi);
                                                                                    }
                                                                                }
                                                                            }}
                                                                            style={{
                                                                                marginBottom: 0, marginTop: 0,
                                                                                padding: '16px 2px 18px 14px',
                                                                                position: 'relative',
                                                                                // 瑞士極簡：左側 coral 細線標記收尾組 + 底部 hairline 分隔
                                                                                borderLeft: `2px solid ${dropAccent}`,
                                                                                borderBottom: '1px solid rgba(43,39,34,0.10)',
                                                                                cursor: 'default',
                                                                            }}
                                                                        >
                                                                            {/* 特殊組實心膠囊徽章（與彈出 modal 一致）*/}
                                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, position: 'relative', zIndex: 1 }}>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 99, background: dropAccent, color: '#fff', fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                                                                                        <Flame size={11} color="#fff" strokeWidth={2.4} /> 收尾組
                                                                                    </span>
                                                                                    <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(22,20,21,0.5)' }}>遞減組</span>
                                                                                </div>
                                                                            </div>
                                                                            <div>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                                                    <ExerciseRowCard ex={ex} size={44} />
                                                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                                                        <p style={{ fontSize: 13, fontWeight: 600, color: '#161415', margin: 0, lineHeight: 1.3 }}>{getExerciseNameZh(ex.name)}</p>
                                                                                        <ExerciseMeta ex={ex} />
                                                                                        <div style={{
                                                                                            display: 'inline-flex', alignItems: 'center',
                                                                                            padding: '2px 8px', borderRadius: 999,
                                                                                            background: 'transparent', border: `1px solid ${dropAccent}40`,
                                                                                            color: '#D94030', fontSize: 11, fontWeight: 800,
                                                                                            letterSpacing: '0.05em', marginTop: 4
                                                                                        }}>
                                                                                            {ex.sets} 組 · {ex.reps} 次 · 不休息
                                                                                            {ex.suggestedWeight > 0 && <span style={{ marginLeft: 4 }}>· 建議 {ex.suggestedWeight}kg</span>}
                                                                                        </div>
                                                                                    </div>
                                                                                    {isExerciseEditing && (
                                                                                        <div style={{ display: 'flex', gap: 4 }}>
                                                                                            <motion.button {...pressProps('row')} onClick={(e) => { e.stopPropagation(); setReplacementTarget({ dayIdx: index, exIdx: origIdx }); setSelectedCategory('All'); setShowAddExerciseModal(true); }} style={{ padding: '5px 8px', border: '1px solid #CFC6B8', borderRadius: 2, background: '#F6F4F1', cursor: 'pointer', color: '#161415', fontSize: 11 }} title="替換">⇄</motion.button>
                                                                                            <motion.button {...pressProps('row')} onClick={(e) => { e.stopPropagation(); handleRemoveExercise(index, origIdx); }} style={{ padding: '5px 8px', border: '1px solid rgba(249,92,75,0.3)', borderRadius: 2, background: 'transparent', cursor: 'pointer', color: '#F95C4B', fontSize: 11 }} title="刪除">×</motion.button>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        </motion.div>
                                                                    );
                                                                }

                                                                // ── REGULAR STANDALONE ────────────────────────────
                                                                return (
                                                                    <motion.div
                                                                        key={gi}
                                                                        layout="position"
                                                                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                                                                        drag={isExerciseEditing ? "y" : false}
                                                                        dragConstraints={{ top: 0, bottom: 0 }}
                                                                        dragElastic={0.4}
                                                                        dragTransition={{ bounceStiffness: 600, bounceDamping: 25 }}
                                                                        onDragEnd={(event, info) => {
                                                                            const offset = info.offset.y;
                                                                            if (Math.abs(offset) > 40) {
                                                                                const direction = offset > 0 ? 1 : -1;
                                                                                const targetGi = gi + direction;
                                                                                if (targetGi >= 0 && targetGi < totalGroups) {
                                                                                    handleReorderGroups(index, gi, targetGi);
                                                                                }
                                                                            }
                                                                        }}
                                                                        whileDrag={{
                                                                            scale: 1.02,
                                                                            zIndex: 50,
                                                                        }}
                                                                        style={{
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: 12,
                                                                            position: 'relative',
                                                                            // 瑞士極簡：無 bento 面板，hairline 橫線分隔；保留左側縮圖
                                                                            padding: '14px 2px',
                                                                            borderBottom: '1px solid rgba(43,39,34,0.10)',
                                                                            marginBottom: 0,
                                                                            marginTop: 0,
                                                                            cursor: isExerciseEditing ? 'grab' : 'default',
                                                                            touchAction: 'none',
                                                                        }}
                                                                    >
                                                                        {isExerciseEditing && (
                                                                            <div style={{ color: '#161415', opacity: 0.35, display: 'flex', alignItems: 'center', cursor: 'grab', marginRight: 4 }}>
                                                                                <GripVertical size={14} />
                                                                            </div>
                                                                        )}
                                                                        <ExerciseRowCard ex={ex} size={52} />
                                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                                            <p style={{ fontSize: 13, fontWeight: 600, color: '#161415', margin: 0, lineHeight: 1.3 }}>{getExerciseNameZh(ex.name)}</p>
                                                                            <ExerciseMeta ex={ex} />
                                                                            {!isExerciseEditing ? (
                                                                                <div style={{
                                                                                    display: 'inline-flex', alignItems: 'center',
                                                                                    padding: '2px 8px', borderRadius: 999,
                                                                                    background: 'transparent', border: '1px solid #D9403040',
                                                                                    color: '#D94030', fontSize: 11, fontWeight: 800,
                                                                                    letterSpacing: '0.05em', marginTop: 4
                                                                                }}>
                                                                                    {ex.sets} 組 · {ex.reps} 次
                                                                                    {ex.rest === '0s' && <span style={{ marginLeft: 4 }}>· 不休息</span>}
                                                                                    {ex.suggestedWeight > 0 && <span style={{ marginLeft: 4 }}>· 建議 {ex.suggestedWeight}kg</span>}
                                                                                </div>
                                                                            ) : (
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid #CFC6B8', borderRadius: 2, padding: '2px 6px', background: '#F6F4F1' }}>
                                                                                        <span style={{ fontSize: 11, color: '#6B6B6B' }}>S</span>
                                                                                        <input className="w-6 bg-transparent text-xs font-bold text-center focus:outline-none" style={{ color: '#161415' }} value={ex.sets} onChange={(e) => handleUpdateExerciseParam(index, origIdx, 'sets', e.target.value)} />
                                                                                    </div>
                                                                                    <span style={{ fontSize: 11, color: '#CFC6B8' }}>×</span>
                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid #CFC6B8', borderRadius: 2, padding: '2px 6px', background: '#F6F4F1' }}>
                                                                                        <span style={{ fontSize: 11, color: '#6B6B6B' }}>R</span>
                                                                                        <input className="w-8 bg-transparent text-xs font-bold text-center focus:outline-none" style={{ color: '#161415' }} value={ex.reps} onChange={(e) => handleUpdateExerciseParam(index, origIdx, 'reps', e.target.value)} />
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        {ex.is_pr && !isExerciseEditing && (
                                                                            <Award size={13} style={{ color: '#D97706', flexShrink: 0 }} />
                                                                        )}
                                                                        {isExerciseEditing && (
                                                                            <div style={{ display: 'flex', gap: 4 }}>
                                                                                <motion.button {...pressProps('row')} onClick={(e) => { e.stopPropagation(); setReplacementTarget({ dayIdx: index, exIdx: origIdx }); setSelectedCategory('All'); setShowAddExerciseModal(true); }} style={{ padding: '5px 8px', border: '1px solid #CFC6B8', borderRadius: 2, background: '#F6F4F1', cursor: 'pointer', color: '#161415', fontSize: 11 }} title="替換">⇄</motion.button>
                                                                                <motion.button {...pressProps('row')} onClick={(e) => { e.stopPropagation(); handleRemoveExercise(index, origIdx); }} style={{ padding: '5px 8px', border: '1px solid rgba(249,92,75,0.3)', borderRadius: 2, background: 'transparent', cursor: 'pointer', color: '#F95C4B', fontSize: 11 }} title="刪除">×</motion.button>
                                                                            </div>
                                                                        )}
                                                                    </motion.div>
                                                                );
                                                            });
                                                        })()}
                                                        {isExerciseEditing && (
                                                            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                                <motion.button {...pressProps('row')} onClick={(e) => { e.stopPropagation(); setTargetDayIndexForAdd(index); setSelectedCategory('All'); setShowAddExerciseModal(true); }} style={{ width: '100%', padding: '11px 0', border: '1.5px dashed #CFC6B8', borderRadius: 2, background: 'transparent', cursor: 'pointer', fontSize: 12, color: '#6B6B6B', fontFamily: 'var(--font-display)', letterSpacing: '0.1em' }}>
                                                                    ＋ 新增動作
                                                                </motion.button>
                                                                <motion.button {...pressProps('row')} onClick={(e) => { e.stopPropagation(); savePlanDay(plan, index); toggleExerciseEditMode(); }} style={{ width: '100%', padding: '11px 0', background: '#161415', border: 'none', borderRadius: 2, cursor: 'pointer', fontSize: 12, color: '#F6F4F1', fontFamily: 'var(--font-display)', letterSpacing: '0.12em', fontWeight: 600 }}>
                                                                    完成儲存 ✓
                                                                </motion.button>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* ── Bento Actions ── */}
                                                    <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
                                                        {/* 🆕 開始訓練 — 與跑步頁 START / 預覽 sheet 一致的 Liquid Glass coral */}
                                                        <motion.button
                                                            whileHover={{ scale: 1.02 }}
                                                            whileTap={{ scale: 0.97 }}
                                                            transition={{ type: 'spring', stiffness: 380, damping: 20 }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setPreviewDay({ ...day, dayNumber });
                                                                setPreviewCardColor('#F6F4F1');
                                                                setPreviewWeekday(weekdayName);
                                                            }}
                                                            style={{
                                                                flex: 1, height: 54, borderRadius: 18,
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                                                                position: 'relative', overflow: 'hidden', cursor: 'pointer',
                                                                /* 跟今日卡那顆是同一顆按鈕，就要長得一模一樣。
                                                                   這裡本來自己寫了一份更飽和的（saturate 2.2、alpha 0.72），
                                                                   同一頁上下捲動會看到兩種濃度的珊瑚。改讀同一組變數。 */
                                                                border: '1px solid var(--lg-coral-glass-stroke)',
                                                                background: 'var(--lg-coral-glass)',
                                                                backdropFilter: 'var(--lg-coral-glass-filter)',
                                                                WebkitBackdropFilter: 'var(--lg-coral-glass-filter)',
                                                                boxShadow: 'var(--lg-coral-glass-shadow)',
                                                            }}
                                                        >
                                                            <span style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: '38%', pointerEvents: 'none', borderRadius: '0 0 999px 999px', background: 'linear-gradient(180deg, rgba(255,255,255,0.38) 0%, rgba(255,255,255,0) 100%)', filter: 'blur(2px)' }} />
                                                            <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '28%', pointerEvents: 'none', borderRadius: '0 0 20px 20px', background: 'linear-gradient(0deg, rgba(255,255,255,0.12) 0%, transparent 100%)' }} />
                                                            <Play size={16} fill="currentColor" strokeWidth={0} style={{ color: '#FFFFFF', position: 'relative', zIndex: 10 }} />
                                                            <span style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 800, letterSpacing: '0.1em', fontFamily: 'var(--font-display)', position: 'relative', zIndex: 10 }}>開始訓練</span>
                                                        </motion.button>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            );
                        })
                    }
                </motion.div>


                {/* Add Exercise Modal (Unified Swiss Magazine Redesign) */}
                <AnimatePresence>
                    {showAddExerciseModal && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-[#161415]/95 flex items-end justify-center z-[9999] p-0"
                            onClick={() => { setShowAddExerciseModal(false); setSearchQuery(''); }}
                        >
                            <motion.div
                                initial={{ y: '100%' }}
                                animate={{ y: 0 }}
                                exit={{ y: '100%' }}
                                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                                className="bg-[#F6F4F1] w-full h-[92dvh] rounded-t-[36px] flex flex-col shadow-2xl overflow-hidden border-t border-[#CFC6B8]"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {/* Modal Header - Magazine Style (Compacted) */}
                                <div className="px-8 pt-8 pb-4 flex-shrink-0">
                                    <div className="flex items-center justify-between mb-1">
                                        <div style={{ fontSize: 9, fontWeight: 900, color: '#D94030', letterSpacing: '0.3em', textTransform: 'uppercase' }}>
                                            Boutique Registry
                                        </div>
                                        <motion.button {...pressProps('icon')}
 onClick={() => { setShowAddExerciseModal(false); setSearchQuery(''); }}
 className="w-8 h-8 rounded-full border border-[#CFC6B8] flex items-center justify-center text-[#161415] hover:bg-[#161415] hover:text-[#F6F4F1]"
 >
                                            <X size={14} color="#161415" />
                                        </motion.button>
                                    </div>
                                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2.2rem', lineHeight: 1.1, color: '#161415', margin: '4px 0' }}>
                                        {selectedCategory === 'All' ? 'EXERCISE' : selectedCategory.toUpperCase()}
                                        <span className="ml-3" style={{ fontSize: '1.1rem', opacity: 0.3, fontWeight: 400, fontFamily: 'var(--font-body)', letterSpacing: '0.1em' }}>LIBRARY</span>
                                    </h2>
                                    <div className="h-[1px] w-full bg-[#161415] opacity-5 mt-4" />
                                </div>

                                {/* View 1: Categorized Selection Grid */}
                                {selectedCategory === 'All' ? (
                                    <div className="flex-1 overflow-y-auto px-8 pb-10 no-scrollbar">
                                        <div className="grid grid-cols-1 gap-4">
                                            {exerciseCategories.filter(c => c !== 'All').map((cat, idx) => {
                                                const count = availableExercisesList.filter(ex => ex.muscle === cat).length;
                                                return (
                                                    <motion.button
                                                        key={cat}
                                                        initial={{ opacity: 0, y: 20 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{ delay: Math.min(idx, 6) * 0.05 }}
                                                        onClick={() => setSelectedCategory(cat)}
                                                        className="group flex items-center justify-between py-8 border-b border-[#CFC6B8]/50 text-left hover:px-2 transition-all"
                                                    >
                                                        <div className="flex flex-col">
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-[11px] font-black text-[#D94030] opacity-40">0{idx + 1}</span>
                                                                <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: '#161415', letterSpacing: '0.05em' }}>{cat.toUpperCase()}</h4>
                                                            </div>
                                                            <p style={{ fontSize: 9, fontWeight: 900, color: '#6B6B6B', letterSpacing: '0.15em', marginTop: 4 }}>
                                                                {count} ITEMS ARCHIVED
                                                            </p>
                                                        </div>
                                                        <div className="w-12 h-12 rounded-full border border-[#CFC6B8] flex items-center justify-center group-hover:bg-[#161415] group-hover:text-[#F6F4F1] transition-all">
                                                            <ChevronRight size={20} />
                                                        </div>
                                                    </motion.button>
                                                );
                                            })}
                                        </div>

                                        {/* Editorial Quote / Footer */}
                                        <div className="mt-20 border-t border-[#161415] pt-10 opacity-30">
                                            <p style={{ fontSize: 12, lineHeight: 1.6, maxWidth: '80%' }}>
                                                "True athletic mastery begins with surgical precision in movement selection."
                                                <br />
                                                <span className="font-bold">— THE DRVN PROTOCOL</span>
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    /* View 2: Detailed Exercise List with Search & Filter */
                                    <div className="flex-1 flex flex-col min-h-0 bg-white rounded-t-[36px] shadow-inner">
                                        {/* Sub-header with Search */}
                                        <div className="px-8 pt-8 pb-4 flex-shrink-0">
                                            <div className="flex items-center gap-4 mb-6">
                                                <motion.button {...pressProps('row')}
 onClick={() => setSelectedCategory('All')}
 className="flex items-center gap-2 text-[9px] font-black tracking-widest text-[#161415] opacity-40 hover:opacity-100 transition-opacity"
 >
                                                    <ArrowLeft size={14} /> BACK
                                                </motion.button>
                                                <div className="h-[1px] flex-1 bg-[#161415] opacity-5" />
                                            </div>

                                            <div className="relative mb-6">
                                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#161415]/20" size={18} />
                                                <input
                                                    type="text"
                                                    placeholder="Search by name or equipment..."
                                                    value={searchQuery}
                                                    onChange={(e) => setSearchQuery(e.target.value)}
                                                    className="w-full h-14 bg-[#F6F4F1] rounded-[18px] pl-12 pr-6 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-[#161415]/10 border border-transparent transition-all"
                                                />
                                            </div>

                                            {/* Category Filter Tabs */}
                                            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                                                {exerciseCategories.map(cat => (
                                                    <motion.button {...pressProps('icon')}
 key={cat}
 onClick={() => setSelectedCategory(cat)}
 className={`px-5 py-2.5 rounded-full text-[9px] font-black tracking-[0.15em] uppercase whitespace-nowrap ${selectedCategory === cat
 ? 'bg-[#161415] text-[#F6F4F1]'
 : 'bg-[#F6F4F1] text-[#161415]/40 hover:bg-[#161415]/5'
 }`}
 >
                                                        {cat}
                                                    </motion.button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Exercise Scroll Area */}
                                        <div className="flex-1 overflow-y-auto px-6 no-scrollbar pb-20">
                                            {availableExercisesList
                                                .filter(ex => {
                                                    const matchesCat = selectedCategory === 'All' || ex.muscle.toLowerCase() === selectedCategory.toLowerCase();
                                                    const matchesSearch = ex.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                                        (ex.eqLabel || '').toLowerCase().includes(searchQuery.toLowerCase());
                                                    return matchesCat && matchesSearch;
                                                })
                                                .map((exercise, idx) => (
                                                    <motion.div
                                                        key={exercise.name + idx}
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        onClick={() => handleAddExercise(exercise.name, exercise.muscle)}
                                                        className="group flex items-center gap-5 p-4 rounded-3xl hover:bg-[#F6F4F1] active:scale-[0.98] transition-all cursor-pointer border border-transparent hover:border-[#CFC6B8]/30 mb-2"
                                                    >
                                                        <div className="w-20 h-20 bg-[#F6F4F1] rounded-[18px] overflow-hidden flex items-center justify-center border border-[#161415]/5 relative group-hover:scale-105 transition-transform">
                                                            <ExerciseRowCard ex={exercise} size={70} />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className="text-[9px] font-black text-[#D94030] bg-[#D94030]/5 px-2 py-0.5 rounded-sm tracking-widest uppercase">
                                                                    {exercise.targetLabel || exercise.subPart || 'GENERAL'}
                                                                </span>
                                                            </div>
                                                            <h5 className="text-[15px] font-bold text-[#161415] truncate mb-0.5 group-hover:text-[#D94030] transition-colors">{exercise.name}</h5>
                                                            <div className="flex items-center gap-3">
                                                                <p className="text-[9px] font-black tracking-widest text-[#161415]/30 uppercase">
                                                                    {exercise.eqLabel || exercise.eq || 'Standard'}
                                                                </p>
                                                                <div className="w-1 h-1 rounded-full bg-[#CFC6B8]" />
                                                                <p className="text-[9px] font-black tracking-widest text-[#D94030] uppercase opacity-60">
                                                                    TIER {exercise.tier || 3}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="w-10 h-10 rounded-full border border-[#CFC6B8]/30 flex items-center justify-center text-[#161415]/20 group-hover:bg-[#161415] group-hover:text-white transition-all">
                                                            <Plus size={16} />
                                                        </div>
                                                    </motion.div>
                                                ))}

                                            {availableExercisesList.filter(ex => {
                                                const matchesCat = selectedCategory === 'All' || ex.muscle.toLowerCase() === selectedCategory.toLowerCase();
                                                const matchesSearch = ex.name.toLowerCase().includes(searchQuery.toLowerCase());
                                                return matchesCat && matchesSearch;
                                            }).length === 0 && (
                                                    <div className="text-center py-20 opacity-30">
                                                        <Search size={40} className="mx-auto mb-4 opacity-20" />
                                                        <p className="text-xs font-black tracking-widest uppercase">No Archive Found</p>
                                                    </div>
                                                )}
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Season Complete Modal */}
                {createPortal(
                    <AnimatePresence>
                        {showCycleComplete && (() => {
                            // ── Compute inline coach analysis ──────────────────────────
                            const sa = seasonAnalysis;
                            const feedbackHistory = plan?._feedbackHistory || [];
                            const tooEasyCount = feedbackHistory.filter(h => h.feeling === 'too_easy').length;
                        const tooHardCount = feedbackHistory.filter(h => h.feeling === 'too_hard').length;
                        const justRightCount = feedbackHistory.filter(h => h.feeling === 'just_right').length;
                        const totalFeedbacks = feedbackHistory.length;

                        // InBody delta: compare latest vs oldest in the 4-week window
                        let inBodyDelta = null;
                        if (seasonInBodyData && seasonInBodyData.length >= 2) {
                            const latest = seasonInBodyData[0];
                            const oldest = seasonInBodyData[seasonInBodyData.length - 1];
                            inBodyDelta = {
                                weight: latest.weight != null && oldest.weight != null
                                    ? +(latest.weight - oldest.weight).toFixed(1) : null,
                                bodyFat: latest.body_fat_percentage != null && oldest.body_fat_percentage != null
                                    ? +(latest.body_fat_percentage - oldest.body_fat_percentage).toFixed(1) : null,
                                muscle: latest.muscle_mass != null && oldest.muscle_mass != null
                                    ? +(latest.muscle_mass - oldest.muscle_mass).toFixed(1) : null,
                                latest,
                            };
                        }

                        // ── 4-week real RPE trend (from logged sets) ──────────────
                        let cycleRPE = { weekly: [], cycleAvgRPE: null, trend: null };
                        try { cycleRPE = getCycleRPESummary(userId, plan); } catch { }

                        // ── 強度契合度分桶（太輕鬆 / 剛好 / 太辛苦）─────────────────
                        //   優先用「真實每週平均 RPE vs 該週週期化目標帶」分類（資料驅動）：
                        //     under（低於目標下限）→ 太輕鬆；on_target → 剛好；over → 太辛苦
                        //   每週各算一次（不是取單一平均），反映整個週期的強度分佈。
                        //   若完全沒有 RPE 紀錄，退回使用者在每週評估手動回報的次數。
                        const rpeWeeks = cycleRPE.weekly.filter(w => w.avgRPE !== null);
                        const hasRpeData = rpeWeeks.length > 0;
                        const easyN = hasRpeData ? rpeWeeks.filter(w => w.status === 'under').length : tooEasyCount;
                        const justN = hasRpeData ? rpeWeeks.filter(w => w.status === 'on_target').length : justRightCount;
                        const hardN = hasRpeData ? rpeWeeks.filter(w => w.status === 'over').length : tooHardCount;
                        const breakdownTotal = hasRpeData ? rpeWeeks.length : totalFeedbacks;

                        /* ── 換季決策：seasonTransition.decideSeason（標準 scripts/CYCLE_ROTATION_STANDARD.md S1–S3，
                              scripts/audit_cycle_rotation.mjs 用同一支模擬上千人連續換季）──
                           進步看「真的練出來的」：估算 1RM、每堂訓練量（measureSeason）；InBody 只收真的量過、而且合理的。
                           ⚠️ 以前「有沒有進步」只看 InBody —— 沒量過就模擬一筆肌肉 +0.6 kg，於是：
                              RPE 爆表的人被建議加組、連兩季卡住的人也被說「身體有進步」。 */
                        const realBodyDelta = inBodyDelta && !seasonInBodySimulated
                            && !(Math.abs(inBodyDelta.muscle ?? 0) > 2 || Math.abs(inBodyDelta.bodyFat ?? 0) > 3) ? inBodyDelta : null;
                        const measured = sa?.measured || null;
                        let isPlateau = false;
                        try { isPlateau = seasonPlateau(plan?._seasonHistory, measured) || !!detectPlateau(userId)?.plateau; } catch { /* */ }
                        const decision = {
                            ...decideSeason({
                                adherencePct: measured?.adherencePct ?? (sa ? sa.overallRate : null),
                                sessions: sa?.totalCompletedSessions ?? 0,
                                rpeWeekly: cycleRPE.weekly,
                                plateau: isPlateau,
                                e1rmDeltaPct: measured?.e1rmDeltaPct ?? null,
                                volumeDeltaPct: measured?.volumeDeltaPct ?? null,
                                body: realBodyDelta,
                                daysOff: measured?.daysOff ?? 0,
                                canProgress: canAddCompoundSet(plan),
                                canShiftUp: canShiftIntensity(plan, 'up'),
                                canShiftDown: canShiftIntensity(plan, 'down'),
                            }),
                            cycleAvgRPE: cycleRPE.cycleAvgRPE,
                            rpeTrend: cycleRPE.trend,
                        };

                        /* 部位平衡：看這一季每個部位實際做了幾組（seasonTransition.suggestNextFocus，
                           換季精靈預選部位用的是同一支）。
                           ⚠️ 以前讀 ex.muscle_group —— 引擎輸出的欄位叫 ex.muscle，所以這裡永遠是空的，
                              「哪裡練得少」從來沒出現過。 */
                        let nextFocus = null;
                        try {
                            const recs = Object.values(uStorage(userId).get('trainingRecords', {}) || {});
                            const since = plan?.startDate ? new Date(plan.startDate).getTime() : 0;
                            nextFocus = suggestNextFocus(plan, recs, { sinceMs: Number.isFinite(since) ? since : 0 });
                        } catch { /* */ }
                        const perWeekEntries = nextFocus ? Object.entries(nextFocus.perWeek).sort((a, b) => b[1] - a[1]) : [];
                        const topMuscles = perWeekEntries.slice(0, 3).map(([t]) => nextFocus.label(t));
                        const lowMuscles = nextFocus ? nextFocus.focus.slice(0, 1).map((t) => nextFocus.label(t)) : [];

                        // Next cycle recommendations
                        const cycleRecs = [];
                        if (tooEasyCount >= 2) cycleRecs.push('下週期建議提高工作重量或組數，持續漸進超負荷。');
                        if (tooHardCount >= 2) cycleRecs.push('下週期建議延長恢復時間，避免過度訓練，確保動作品質優先。');
                        if ((sa?.overallRate || 0) < 70) cycleRecs.push('提升出席一致性是最大槓桿，建議縮短每次訓練時間以降低阻力。');
                        if (lowMuscles.length > 0) cycleRecs.push(`${lowMuscles.join('、')} 訓練頻率偏低，下週期可加強比例。`);
                        if (cycleRecs.length === 0) cycleRecs.push('整體執行穩健，下週期維持當前節奏並持續漸進即可。');
                        // 🧪 e1RM 校準測試週（每 8 週）：讓建議重量從估算升級為實測
                        const calib = calibrationStatus(userId);
                        if (calib?.due) cycleRecs.push(calib.message);

                        // InBody coach recommendations
                        const inBodyRecs = [];
                        if (inBodyDelta) {
                            if (inBodyDelta.bodyFat !== null && inBodyDelta.bodyFat < -0.3) inBodyRecs.push(`體脂下降 ${Math.abs(inBodyDelta.bodyFat)}%，脂肪燃燒效果顯著，下週期可維持有氧比例。`);
                            if (inBodyDelta.bodyFat !== null && inBodyDelta.bodyFat > 0.5) inBodyRecs.push(`體脂略升 ${inBodyDelta.bodyFat}%，建議下週期增加有氧訓練頻率或控制熱量攝入。`);
                            if (inBodyDelta.muscle !== null && inBodyDelta.muscle > 0.3) inBodyRecs.push(`肌肉量增加 ${inBodyDelta.muscle}kg，增肌效果良好，下週期可進一步加重。`);
                            if (inBodyDelta.muscle !== null && inBodyDelta.muscle <= 0) inBodyRecs.push(`肌肉量未顯著增加，建議確保蛋白質攝取充足（每日每公斤體重 1.6–2.2g）。`);
                        }
                        if (inBodyRecs.length === 0 && topMuscles.length > 0) {
                            inBodyRecs.push(`本週期訓練重心在 ${topMuscles.join('、')}，建議下週期補強拮抗肌群以維持肌肉平衡。`);
                        }

                        return (
                            <motion.div
                                key="season-modal"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 flex items-end justify-center transition-all duration-500"
                                style={{ background: 'rgba(22,20,21,0.65)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', zIndex: 2147483600 }}
                                onClick={() => { setSeasonStartStep(null); setShowCycleComplete(false); }}
                            >
                                <motion.div
                                    initial={{ y: 80, scale: 0.95, opacity: 0 }}
                                    animate={{ y: 0, scale: 1, opacity: 1 }}
                                    exit={{ y: 80, scale: 0.95, opacity: 0 }}
                                    transition={{ type: 'spring', damping: 32, stiffness: 280 }}
                                    className="w-full max-w-[480px]"
                                    style={{
                                        borderRadius: '36px 36px 0 0',
                                        // ── Liquid Glass 主體：半透明暖白 + 背景模糊，讓底下深色遮罩透上來 ──
                                        background: 'rgba(248, 246, 242, 0.72)',
                                        backdropFilter: 'blur(40px) saturate(180%)',
                                        WebkitBackdropFilter: 'blur(40px) saturate(180%)',
                                        boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.7), inset 0 0 0 1px rgba(255,255,255,0.25), 0 -10px 40px rgba(0,0,0,0.18)',
                                        overflow: 'hidden',
                                        maxHeight: '92dvh',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        paddingBottom: 'env(safe-area-inset-bottom)'
                                    }}
                                    onClick={e => e.stopPropagation()}
                                >
                                    {/* ── Top bar: Titanium accent & Pull indicator ── */}
                                    <div style={{ 
                                        height: 4, 
                                        background: 'linear-gradient(90deg, #9C9E9F 0%, #E0E2E3 20%, #F6F4F1 50%, #E0E2E3 80%, #9C9E9F 100%)',
                                        boxShadow: '0 1px 1px rgba(255,255,255,0.8) inset',
                                        flexShrink: 0 
                                    }} />
                                    <div className="flex justify-center pt-4 shrink-0">
                                        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(22,20,21,0.15)' }} />
                                    </div>

                                    {/* ── Scrollable body ── */}
                                    <div style={{ overflowY: 'auto', flex: 1 }} className="no-scrollbar">

                                        {/* ══ 週期收官（依 drvn-interface-standard 重排）══════════════════
                                           ⚠️ 以前這張收官頁有 7 段：數字列、一致性長條（跟完成率同一個數字）、
                                              容量卡、身體組成＋一句跟數字矛盾的評語（肌肉 −5.6kg 卻說「具備良好的肌肥大條件」）、
                                              推薦方向＋兩行說明、兩顆只會「選起來」不會做事的按鈕、三條教練建議
                                              （最後一條說「維持當前節奏」，跟上面的「降低強度」打架），
                                              按下開始之後還要再選一次「延續／重新設計」。
                                           現在只回答三件事：這一季練得怎樣 → 身體變了什麼 → 下一季怎麼改（當場確認）。 */}
                                        {(() => {
                                            const nextSeason = Math.max(Number(plan?.season) || 1, currentSeason) + 1;
                                            const dir = decision.intensityDir;
                                            const rate = sa?.overallRate ?? null;
                                            const vol = (totalVolume || 0) > 0 ? totalVolume : null;
                                            const growth = Number(sa?.volumeGrowthPct);

                                            /* 下一季可以怎麼改 —— 每一個選項都是「按確認就會發生」的具體改動，
                                               或是「帶你去改的地方」並說清楚到了要按哪裡。 */
                                            const avgRpe = decision.cycleAvgRPE;
                                            const progressOk = canAddCompoundSet(plan);
                                            const intensityOk = dir !== 'maintain' && canShiftIntensity(plan, dir);
                                            // 加不上去、降不下去的情況 decideSeason 已經處理（改走「照原本＋逐動作加重」或「換一份」）
                                            const rec = decision.recommend;
                                            /* 每季客製化：把這一季每一組的真實紀錄交進去，逐個動作決定
                                               加重量／加次數／加減組／換掉一直跳過或卡住的（seasonTransition.personalizeSeason）。
                                               沒有紀錄 → 不編造任何個人化。 */
                                            let seasonRecords = [];
                                            try { seasonRecords = Object.values(uStorage(userId).get('trainingRecords', {}) || {}); } catch { /* */ }
                                            const seasonSince = plan?.startDate ? new Date(plan.startDate).getTime() : 0;
                                            const seasonMember = isMember();
                                            /* 預告 = 真正執行的那支（utils/seasonTransition），畫面說什麼就改什麼 */
                                            /* 🏋️ 換季改的是全部健身房共用的那一份課表，照「主場」排：
                                               主場 = 排課時指定的那間 → 這季最常去的那間 → 上次去的那間（utils/gymMemory.primaryGymFor）。
                                               主場沒有的器材，換動作時不推，已經排了的換成主場做得到的；
                                               其他健身房不各自換季 —— 到那間練時訓練頁會臨時替換。
                                               在別間因為沒器材改做的替代、或那間沒這台而沒做的，不算「一直跳過」。 */
                                            let isBlocked = null, gymMissing = null, homeGym = null;
                                            try {
                                                const gm = loadGymMemory(userId);
                                                homeGym = primaryGymFor(gm, { planGymId: plan?.gymId || null, sinceMs: Number.isFinite(seasonSince) ? seasonSince : 0 });
                                                isBlocked = gymBlocker(homeGym);
                                                gymMissing = gymMissingFn(gm);
                                            } catch { /* 沒有健身房記憶就不擋 */ }
                                            /* 預告 = 按確認寫進去的那一份：同一支 rotateStrengthSeason、同一組輸入（S9、S10）。
                                               e1RM 負重處方（會員）也在裡面一起算 —— 以前是預告畫完才套，套用後跟預告不一樣。 */
                                            let loadTable = null;
                                            if (seasonMember) { try { loadTable = buildE1RMTable(userId); } catch { loadTable = null; } }
                                            const buildNextPlan = (ids, withRecords, label = '') => {
                                                const r = rotateStrengthSeason(plan, {
                                                    picks: ids, dir, records: seasonRecords, withPersonal: withRecords,
                                                    sinceMs: Number.isFinite(seasonSince) ? seasonSince : 0, nowMs: Date.now(), todayKey: toLocalDayKey(new Date()),
                                                    loadTable, swapChoices, isBlocked, gymMissing, homeGymName: homeGym?.name || null,
                                                    label, currentSeason, measured: sa?.measured || null, hold: !!decision.hold,
                                                });
                                                return { p: r.plan, rows: r.rows, changes: r.changes, personal: r.personal || [] };
                                            };
                                            // 「依紀錄逐個動作調整」有幾項：只算 personalizeSeason 的（停練退重量、負重處方是自動的，不算）
                                            const personalCount = buildNextPlan([], true).personal.filter((c) => !c.auto).length;

                                            /* 下一季怎麼改 —— 可以複選（以前是單選：降強度就不能同時依紀錄加重量）。
                                               一個都不勾 ＝ 照原本的課表；「換部位重排」是另一條路，選了就不跟其他一起。
                                               💳 加量（加強度／加組）與依紀錄逐動作調整是會員；降強度永遠免費。 */
                                            const OPTIONS = [
                                                dir !== 'maintain' && canShiftIntensity(plan, dir) && {
                                                    id: 'intensity',
                                                    label: dir === 'down' ? '降一級強度' : '加一級強度',
                                                    why: dir === 'down' ? '次數少一點、休息長一點，先讓身體恢復' : '還有空間往上加',
                                                    member: dir === 'up',
                                                },
                                                canAddCompoundSet(plan) && {
                                                    id: 'progress', member: true,
                                                    label: '複合動作各加 1 組',
                                                    why: decision.progressed && Number(sa?.e1rmDeltaPct) > 0 ? `力量 +${sa.e1rmDeltaPct}%，可以加量` : '上限 5 組',
                                                },
                                                personalCount > 0 && {
                                                    id: 'personal', member: true,
                                                    label: '依這季紀錄逐個動作調整',
                                                    why: `${personalCount} 個動作：做滿的加重、一直跳過的換掉`,
                                                },
                                            ].filter(Boolean);
                                            const REDESIGN = { id: 'redesign', label: '換部位，重排一份', nav: true,
                                                why: nextFocus?.focus?.length ? `建議重點：${nextFocus.focus.map((t) => nextFocus.label(t)).join('、')}` : (decision.plateau ? '連續兩季沒進步' : '天數與器材沿用這一季') };
                                            const recIds = [
                                                ...(rec === 'intensity' && OPTIONS.some((o) => o.id === 'intensity') ? ['intensity'] : []),
                                                ...(rec === 'progress' && OPTIONS.some((o) => o.id === 'progress') ? ['progress'] : []),
                                            ];
                                            // 非會員：建議照標，但不預先勾會員選項（不然一打開主按鈕就變成「解鎖」）
                                            const defaultPicks = [
                                                ...recIds.filter((id) => seasonMember || !OPTIONS.find((o) => o.id === id)?.member),
                                                ...(personalCount > 0 && seasonMember ? ['personal'] : []),
                                            ];
                                            const picks = (Array.isArray(seasonChoice) ? seasonChoice : defaultPicks)
                                                .filter((id) => id === 'redesign' || OPTIONS.some((o) => o.id === id));
                                            const isRedesign = picks.includes('redesign');
                                            const togglePick = (id) => {
                                                haptic('light');
                                                if (id === 'redesign') { setSeasonChoice(isRedesign ? defaultPicks : ['redesign']); return; }
                                                const base = picks.filter((x) => x !== 'redesign');
                                                setSeasonChoice(base.includes(id) ? base.filter((x) => x !== id) : [...base, id]);
                                            };
                                            const ensurePick = (id) => { if (!picks.includes(id)) togglePick(id); };
                                            const pickedOpts = OPTIONS.filter((o) => picks.includes(o.id));
                                            const picked = isRedesign ? REDESIGN : {
                                                id: picks.join('+') || 'keep', nav: false,
                                                label: pickedOpts.length ? pickedOpts.map((o) => o.label).join('＋') : '照原本的課表',
                                            };
                                            const preview = isRedesign ? null : buildNextPlan(picks.filter((x) => x !== 'personal'), picks.includes('personal'), picked.label);
                                            const pickedLocked = !seasonMember && pickedOpts.some((o) => o.member);
                                            /* 按確認會改的每一項 = 新舊課表直接比對（真的會寫進去的那份），不是另外寫的說明文字 */
                                            const diffRows = preview ? preview.rows : [];
                                            const planKeyNow = cycleShownKey(userId, plan?.plan_id || plan?.id, currentSeason);
                                            /* 回饋完成 = 按了下一季的確認（換部位也算：接下來會生成新計劃）。
                                               只有這裡才標記「看過」—— 中途關掉，頁首的卡跟首頁提醒都會留著。 */
                                            const markCycleDone = () => {
                                                try { localStorage.setItem(planKeyNow, 'true'); } catch { /* */ }
                                                try { markReviewed(userId, 'strength'); } catch { /* */ }
                                            };

                                            const runNextSeason = () => {
                                                if (seasonSubmitRef.current) return;   // 防連點：同一次收官只結算一次
                                                haptic('medium');
                                                if (pickedLocked) { openPaywall('seasonAuto'); return; }
                                                seasonSubmitRef.current = true;
                                                setSeasonSubmitting(true);
                                                if (picked.nav) {
                                                    /* 換部位：新計劃還沒生出來。以前這裡就先把季數 +1、標記收官看過，
                                                       使用者在產生器按返回（或送出失敗）→ 舊計劃被當成下一季、收官提醒也消失。
                                                       改成把資訊帶過去，等產生器 activateProgram 成功後才寫。
                                                       舊計劃先存一份快照（綁這次收官的 key）：生成後回來比對「改了什麼」。 */
                                                    saveRedesignSnapshot(localStorage, userId, { plan, cycleDoneKey: planKeyNow, season: nextSeason,
                                                        history: redesignSeasonHistory(plan, sa?.measured || null, nextSeason - 1) });
                                                    setSeasonChoice(null);
                                                    setShowCycleComplete(false);
                                                    navigate('/workout-plan-mobile', { state: { seasonRedesign: nextSeason, cycleDoneKey: planKeyNow } });
                                                    return;
                                                }
                                                /* 先把新的一季寫進本機、再標記收官完成（S11）：
                                                   以前先標記才存 —— 存失敗就變成「收官看過了、課表卻還是上一季」，提醒消失、卡在到期的課表。
                                                   寫不進去 → 丟錯給 startNextSeason，按鈕放開、提示再按一次。 */
                                                const updatedPlan = preview.p;
                                                localStorage.setItem(`currentPlan_${userId}`, JSON.stringify(updatedPlan));
                                                markCycleDone();
                                                setSwapChoices({});
                                                localStorage.setItem(`season_${userId}`, String(updatedPlan.season || nextSeason));
                                                // 每週回饋是「這一季」的：新的一季要重新問，不然第 1 週會直接沿用上一季第 1 週的答案
                                                try { weekNumsOf(plan).forEach(w => localStorage.removeItem(`week_feedback_${userId}_week${w}`)); } catch { /* */ }
                                                setCurrentSeason(updatedPlan.season || nextSeason);
                                                resetStrengthPlanCompletion(userId, plan?.plan_id || plan?.id);
                                                setCompletedWorkouts(new Set());
                                                setWeekCompletionStatus({});
                                                setActiveWeek(1);
                                                // 新的一季起始日（今天）、季數、這一季改了什麼（_seasonApplied）都由 rotateStrengthSeason 寫好了
                                                setSeasonChoice(null);
                                                setSeasonStartStep(null);
                                                // 同一份計劃的下一季：上傳到後端（upsert，會成為最新一份）。
                                                // 以前只寫本機 —— 下次開中控就被後端的上一季蓋回去，還顯示「已到期」。
                                                handlePlanUpdate(updatedPlan);
                                                setShowCycleComplete(false);
                                                haptic('success');
                                                setTimeout(() => setSeasonAppliedOpen(true), 380);
                                                import('../utils/telemetry')
                                                    .then(({ track }) => track('season_continued', {
                                                        season: nextSeason, strategy: picked.id,
                                                        plateau: !!decision.plateau,
                                                        load_rx_count: (updatedPlan._loadPrescriptions || []).length,
                                                    }))
                                                    .catch(() => {});
                                            };
                                            // 中途任何一步丟錯（localStorage 滿了、比對失敗…）都不能讓確認鈕永遠卡在「處理中」
                                            const startNextSeason = () => {
                                                try { runNextSeason(); }
                                                catch (e) {
                                                    console.warn('[season] 開始下一季失敗', e);
                                                    seasonSubmitRef.current = false;
                                                    setSeasonSubmitting(false);
                                                    toast.error('沒有成功，再按一次試試');
                                                }
                                            };

                                            /* 這一季的回饋：哪裡進步、哪裡可以加強 —— 每一條「可以加強」都接到下面的一個改法，
                                               點它就幫你選好那個改法（不是丟一句話給你自己想怎麼改）。
                                               ⚠️ 以前這裡是一行「去調整飲食目標」—— 這是健身的季回顧，
                                                  叫人跳去營養頁、又沒說要調什麼，按了也不知道要幹嘛。 */
                                            const bf = inBodyDelta?.bodyFat, mu = inBodyDelta?.muscle;
                                            const realBody = inBodyDelta && !seasonInBodySimulated;
                                            // 一個月肌肉 ±2 kg、體脂 ±3% 以上：生理上幾乎不可能，多半是量測條件不同
                                            const bodyOdd = realBody && ((mu != null && Math.abs(mu) > 2) || (bf != null && Math.abs(bf) > 3));
                                            const sessions = sa?.totalCompletedSessions;
                                            /* 主角卡上的佐證：只放主角數字以外的事實（完成率本身就是大數字，不再寫一次）；
                                               訓練量沒長、強度偏高偏低 → 放在下面對應的改法上，不在這裡重複 */
                                            const heroFacts = [
                                                sessions ? `${sessions} 次訓練` : null,
                                                vol ? `總量 ${vol.toLocaleString()} kg` : null,
                                                Number.isFinite(growth) && growth > 0 ? `訓練量 +${growth}%` : null,
                                                dir === 'maintain' && avgRpe != null ? '強度剛好' : null,
                                            ].filter(Boolean);
                                            const gaps = [
                                                dir === 'down' ? { text: avgRpe != null ? `平均 RPE ${avgRpe}，組組都快力竭` : '練得太吃力，恢復跟不上', fix: intensityOk ? 'intensity' : 'redesign' } : null,
                                                dir === 'up' ? { text: avgRpe != null ? `平均 RPE ${avgRpe}，還有餘力` : '練得太輕鬆', fix: intensityOk ? 'intensity' : 'progress' } : null,
                                                decision.plateau ? { text: '連續兩季力量沒進步', fix: 'redesign' } : null,
                                                !decision.plateau && Number.isFinite(growth) && growth <= 0 ? { text: '訓練量沒有成長', fix: progressOk ? 'progress' : 'redesign' } : null,
                                                lowMuscles.length > 0 ? { text: `${lowMuscles.join('、')}練得比較少`, fix: 'redesign' } : null,
                                                rate != null && rate < 70 ? { text: `完成率 ${rate}%，先把次數練滿`, fix: 'keep' } : null,
                                                realBody && !bodyOdd && mu != null && mu <= -0.3 ? { text: '肌肉量往下掉，先穩住', fix: dir === 'down' ? 'intensity' : 'keep' } : null,
                                            ].filter(Boolean).slice(0, 3);
                                            /* 每一條「可以加強」掛在它對應的改法上（珊瑚色一行原因），點那個改法就是選它 ——
                                               不再另開一段「可以加強」再重複一次改法的名字。對不上任何改法的，掛在「照原本的課表」那一行。 */
                                            const optIds = new Set([...OPTIONS.map((o) => o.id), 'redesign']);
                                            const gapFor = (id) => gaps.filter((g) => g.fix === id).map((g) => g.text);
                                            const keepGaps = gaps.filter((g) => !optIds.has(g.fix)).map((g) => g.text);
                                            const noSeasonData = rate == null || sa?.totalCompletedSessions === 0;
                                            const H2 = { fontSize: 17, fontWeight: 800, color: '#161415', letterSpacing: '-0.01em' };
                                            const HINT = { display: 'block', fontSize: 13, fontWeight: 700, color: '#F95C4B', marginTop: 3, lineHeight: 1.4 };
                                            const SUB = { display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(22,20,21,0.5)', marginTop: 3, lineHeight: 1.4 };
                                            const rise = (i) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.42, delay: reduceMotion ? 0 : 0.06 * i, ease: [0.16, 1, 0.3, 1] } });
                                            const goTrain = () => { haptic('light'); setShowCycleComplete(false); };
                                            const goInBody = () => { haptic('light'); setShowCycleComplete(false); navigate('/body-analysis-mobile'); };
                                            const bodyTiles = inBodyDelta && !seasonInBodySimulated ? [
                                                { label: '體重', unit: 'kg', value: inBodyDelta.weight, good: (v) => v <= 0 },
                                                { label: '體脂', unit: '%', value: inBodyDelta.bodyFat, good: (v) => v <= 0 },
                                                { label: '肌肉量', unit: 'kg', value: inBodyDelta.muscle, good: (v) => v >= 0 },
                                            ].filter((d) => d.value !== null && d.value !== undefined) : [];
                                            return (
                                                <>
                                                    {/* ① 這一季的成績：整張唯一的主角 —— 深色鈦金屬、一個大數字、一句話 */}
                                                    <motion.div {...rise(0)} className="ti-surface-dark"
                                                        style={{ position: 'relative', overflow: 'hidden', margin: '12px 16px 0', borderRadius: 28, padding: '22px 22px 20px' }}>
                                                        <div aria-hidden className="ti-sheen ti-sheen-dark" />
                                                        <div style={{ position: 'relative', fontSize: 15, fontWeight: 700, color: 'rgba(246,244,241,0.72)' }}>
                                                            第 {currentSeason} 季完成
                                                        </div>
                                                        {noSeasonData ? (
                                                            /* 沒有紀錄：不放假數字，給一條去練的路 */
                                                            <div style={{ position: 'relative' }}>
                                                                <div style={{ fontSize: 24, fontWeight: 800, color: '#F6F4F1', marginTop: 8, lineHeight: 1.3 }}>這一季還沒有訓練紀錄</div>
                                                                <motion.button {...pressProps('cta')} onClick={goTrain}
                                                                    style={{ marginTop: 14, minHeight: 48, padding: '0 18px', borderRadius: 999, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                                                                        background: 'var(--lg-coral-glass)', border: '1px solid var(--lg-coral-glass-stroke)' }}>
                                                                    先去練今天的課 <ChevronRight size={16} />
                                                                </motion.button>
                                                            </div>
                                                        ) : (
                                                            <div style={{ position: 'relative' }}>
                                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 6 }}>
                                                                    <span style={{ fontSize: 64, fontWeight: 300, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums', color: '#F6F4F1', fontFamily: 'var(--font-display)', lineHeight: 1 }}>
                                                                        {rate}<span style={{ fontSize: 28 }}>%</span>
                                                                    </span>
                                                                    <span style={{ fontSize: 17, fontWeight: 800, color: '#F6F4F1' }}>
                                                                        {rate >= 90 ? '完美收官' : rate >= 70 ? '穩穩練完' : '有練就有累積'}
                                                                    </span>
                                                                </div>
                                                                <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(246,244,241,0.66)', marginTop: 10, lineHeight: 1.5 }}>
                                                                    {['完成率', ...heroFacts].join(' · ')}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </motion.div>

                                                    {/* ② 身體變了什麼：內容層的液態玻璃（冷白），跟上面的暖黑鈦錯開材質 */}
                                                    <motion.div {...rise(1)}
                                                        style={{ margin: '12px 16px 0', borderRadius: 24, padding: '16px 16px 14px',
                                                            background: 'linear-gradient(160deg, rgba(255,255,255,0.78) 0%, rgba(240,243,247,0.58) 100%)',
                                                            backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)',
                                                            border: '1px solid rgba(255,255,255,0.85)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.9), 0 8px 24px rgba(40,42,50,0.06)' }}>
                                                        <div style={H2}>身體變化</div>
                                                        {bodyTiles.length ? (
                                                            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${bodyTiles.length}, 1fr)`, gap: 8, marginTop: 12 }}>
                                                                {bodyTiles.map((d) => {
                                                                    const ok = d.good(d.value);
                                                                    return (
                                                                        <div key={d.label} style={{ borderRadius: 16, padding: '12px 10px', background: ok ? 'rgba(255,255,255,0.9)' : 'rgba(249,92,75,0.08)', border: `1px solid ${ok ? 'rgba(22,20,21,0.06)' : 'rgba(249,92,75,0.22)'}` }}>
                                                                            <div style={{ fontSize: 26, fontWeight: 300, fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-display)', color: ok ? '#161415' : '#F95C4B', lineHeight: 1.1 }}>
                                                                                {`${d.value > 0 ? '+' : ''}${d.value}`}<span style={{ fontSize: 14, marginLeft: 2 }}>{d.unit}</span>
                                                                            </div>
                                                                            <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(22,20,21,0.55)', marginTop: 4 }}>{d.label}</div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        ) : (
                                                            /* 沒量過：區塊照樣在，告訴他去量就能比 */
                                                            <motion.button {...pressProps('row')} onClick={goInBody}
                                                                style={{ width: '100%', minHeight: 56, marginTop: 10, padding: '0 4px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }}>
                                                                <span style={{ flex: 1, minWidth: 0 }}>
                                                                    <span style={{ display: 'block', fontSize: 15, fontWeight: 800, color: '#161415' }}>這一季沒有 InBody 紀錄</span>
                                                                    <span style={SUB}>量一次，下一季收官就能比</span>
                                                                </span>
                                                                <span style={{ flexShrink: 0, minHeight: 44, padding: '0 14px', borderRadius: 999, background: '#161415', color: '#F6F4F1', fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 2 }}>
                                                                    去量 <ChevronRight size={15} />
                                                                </span>
                                                            </motion.button>
                                                        )}
                                                        {/* 變化大到生理上不太可能 → 多半是量測條件不同，不拿來決定下一季 */}
                                                        {bodyOdd && (
                                                            <div style={{ marginTop: 10, fontSize: 13, fontWeight: 600, color: 'rgba(22,20,21,0.55)', lineHeight: 1.6 }}>
                                                                一個月變這麼多，多半是量的時間或喝水不同，這次不拿來判斷。
                                                                <span role="button" onClick={goInBody}
                                                                    style={{ color: '#161415', fontWeight: 800, textDecoration: 'underline', cursor: 'pointer' }}>有空再量一次</span>
                                                            </div>
                                                        )}
                                                    </motion.div>

                                                    {/* ③ 下一季怎麼練：每個改法帶著它的原因（珊瑚色），可以複選；換部位是另一條路 */}
                                                    <motion.div {...rise(2)} style={{ padding: '22px 16px 0' }}>
                                                        <div style={{ display: 'flex', alignItems: 'baseline', padding: '0 4px', marginBottom: 10 }}>
                                                            <span style={H2}>下一季怎麼練</span>
                                                            {OPTIONS.length > 1 && <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600, color: 'rgba(22,20,21,0.45)' }}>可以複選</span>}
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                            {OPTIONS.map((opt) => {
                                                                const active = picks.includes(opt.id);
                                                                const isRec = recIds.includes(opt.id);
                                                                const hints = gapFor(opt.id);
                                                                return (
                                                                    <motion.button key={opt.id} {...pressProps('row')} layout="position"
                                                                        onClick={() => togglePick(opt.id)}
                                                                        aria-pressed={active}
                                                                        className={active ? undefined : 'ti-surface-pale'}
                                                                        style={{
                                                                            width: '100%', minHeight: 64, padding: '12px 14px', borderRadius: 20, cursor: 'pointer', textAlign: 'left',
                                                                            display: 'flex', alignItems: 'center', gap: 12, opacity: isRedesign ? 0.55 : 1, color: '#161415',
                                                                            ...(active ? { background: '#fff', border: '1.5px solid #161415', boxShadow: '0 6px 18px rgba(22,20,21,0.08)' } : {}),
                                                                        }}>
                                                                        {/* 方框 = 可以複選 */}
                                                                        <span style={{ width: 24, height: 24, borderRadius: 8, flexShrink: 0, border: `1.5px solid ${active ? '#161415' : 'rgba(22,20,21,0.3)'}`, background: active ? '#161415' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                            {active && <Check size={15} color="#F6F4F1" strokeWidth={3} />}
                                                                        </span>
                                                                        <span style={{ flex: 1, minWidth: 0 }}>
                                                                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                                <span style={{ fontSize: 16, fontWeight: 800 }}>{opt.label}</span>
                                                                                {isRec && <span style={{ fontSize: 12, fontWeight: 800, color: '#F95C4B' }}>建議</span>}
                                                                                {opt.member && !seasonMember && <Lock size={13} color="rgba(22,20,21,0.45)" aria-label="會員" />}
                                                                            </span>
                                                                            {hints.length ? <span style={HINT}>{hints.join('；')}</span> : (opt.why && <span style={SUB}>{opt.why}</span>)}
                                                                        </span>
                                                                    </motion.button>
                                                                );
                                                            })}
                                                            {(OPTIONS.length > 0 || keepGaps.length > 0) && (
                                                                <div style={{ padding: '2px 6px', fontSize: 13, fontWeight: 600, color: 'rgba(22,20,21,0.45)', lineHeight: 1.5 }}>
                                                                    {keepGaps.length > 0 && <span style={{ color: '#F95C4B', fontWeight: 700 }}>{keepGaps.join('；')}。</span>}
                                                                    {OPTIONS.length > 0 ? '都不勾＝照原本的課表' : '照原本的課表，從第 1 週開始'}
                                                                </div>
                                                            )}
                                                            {/* 另一條路：換部位重排（選了就不跟上面一起）—— 暖珊瑚玻璃，跟上面的鈦色選項分開 */}
                                                            <motion.button {...pressProps('row')} onClick={() => togglePick('redesign')} aria-pressed={isRedesign}
                                                                style={{
                                                                    width: '100%', minHeight: 64, padding: '12px 14px', borderRadius: 20, cursor: 'pointer', textAlign: 'left', marginTop: 4,
                                                                    display: 'flex', alignItems: 'center', gap: 12, color: '#161415',
                                                                    background: isRedesign ? 'linear-gradient(145deg, rgba(249,92,75,0.16) 0%, rgba(249,92,75,0.06) 100%)' : 'rgba(249,92,75,0.05)',
                                                                    border: isRedesign ? '1.5px solid #F95C4B' : '1px solid rgba(249,92,75,0.35)',
                                                                }}>
                                                                {/* 圓的 = 單選（另一條路） */}
                                                                <span style={{ width: 24, height: 24, borderRadius: 999, flexShrink: 0, border: `1.5px solid ${isRedesign ? '#F95C4B' : 'rgba(249,92,75,0.5)'}`, background: isRedesign ? '#F95C4B' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                    {isRedesign && <Check size={15} color="#fff" strokeWidth={3} />}
                                                                </span>
                                                                <span style={{ flex: 1, minWidth: 0 }}>
                                                                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                        <span style={{ fontSize: 16, fontWeight: 800 }}>{REDESIGN.label}</span>
                                                                        {rec === 'redesign' && <span style={{ fontSize: 12, fontWeight: 800, color: '#F95C4B' }}>建議</span>}
                                                                    </span>
                                                                    {gapFor('redesign').length ? <span style={HINT}>{gapFor('redesign').join('；')}</span> : <span style={SUB}>{REDESIGN.why}</span>}
                                                                </span>
                                                            </motion.button>
                                                        </div>
                                                    </motion.div>

                                                    {/* ④ 按確認會改什麼：新舊課表逐項比對（真的會寫進去的那份）。換部位 → 說清楚接下來去哪、回來會看到什麼 */}
                                                    <AnimatePresence mode="wait" initial={false}>
                                                        {!picked.nav ? (
                                                            <motion.div key="preview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.24 }}
                                                                style={{ padding: '22px 20px 0' }}>
                                                                <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 4 }}>
                                                                    <span style={H2}>確認後會改</span>
                                                                    {diffRows.length > 0 && <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: 'rgba(22,20,21,0.5)' }}>{diffRows.length} 項</span>}
                                                                </div>
                                                                {diffRows.length === 0 ? (
                                                                    <div style={{ fontSize: 15, fontWeight: 700, color: '#161415', minHeight: 44, display: 'flex', alignItems: 'center' }}>課表不變，從第 1 週重新開始</div>
                                                                ) : (
                                                                    <SeasonChangeList rows={diffRows} limit={4} onSwap={(r) => setSwapEditing({ name: r.name, newName: r.newName })} />
                                                                )}
                                                                {homeGym && diffRows.some((r) => r.parts.some((p) => p.label === '換成')) && (
                                                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(22,20,21,0.5)', marginTop: 6, lineHeight: 1.5 }}>
                                                                        {`換動作照「${homeGym.name}」的器材挑；到別間練，開始前會自動換成那間有的`}
                                                                    </div>
                                                                )}
                                                                {pickedLocked && (
                                                                    <MemberLockCard feature="seasonAuto" label="勾選的調整要會員才能套用" style={{ marginTop: 10 }} />
                                                                )}
                                                            </motion.div>
                                                        ) : (
                                                            <motion.div key="redesign-note" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.24 }}
                                                                style={{ margin: '18px 16px 0', padding: '14px 16px', borderRadius: 20, background: 'rgba(22,20,21,0.04)', border: '1px solid rgba(22,20,21,0.06)' }}>
                                                                <div style={{ fontSize: 15, fontWeight: 800, color: '#161415' }}>部位照建議選好，天數與器材沿用</div>
                                                                <div style={SUB}>生成後會回到這裡，告訴你新計劃改了什麼</div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>

                                                    {/* 確認列：黏在底部，一顆主按鈕（防連點） */}
                                                    <div style={{ position: 'sticky', bottom: 0, zIndex: 2, padding: '18px 16px 18px', marginTop: 8,
                                                        background: 'linear-gradient(180deg, rgba(248,246,242,0) 0%, rgba(248,246,242,0.92) 28%, rgba(248,246,242,0.98) 100%)' }}>
                                                        <motion.button {...pressProps('cta')}
                                                            onClick={startNextSeason}
                                                            disabled={seasonSubmitting}
                                                            className={isRedesign ? undefined : 'ti-surface-dark'}
                                                            /* 換部位：珊瑚液態玻璃＋呼吸（整張只有這一顆要人現在按） */
                                                            animate={isRedesign && !reduceMotion ? BREATHE : undefined}
                                                            transition={isRedesign && !reduceMotion ? BREATHE_T : undefined}
                                                            style={{ width: '100%', minHeight: 56, borderRadius: 18, color: '#F6F4F1', fontSize: 16, fontWeight: 800, cursor: seasonSubmitting ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                                                opacity: seasonSubmitting ? 0.6 : 1,
                                                                ...(isRedesign ? { background: 'var(--lg-coral-glass)', backdropFilter: 'var(--lg-coral-glass-filter)', WebkitBackdropFilter: 'var(--lg-coral-glass-filter)', border: '1px solid var(--lg-coral-glass-stroke)', boxShadow: 'var(--lg-coral-glass-shadow)' } : {}) }}>
                                                            {pickedLocked
                                                                ? <>解鎖換季一鍵套用 <ChevronRight size={16} /></>
                                                                : picked.nav
                                                                ? <>去換部位 <ChevronRight size={16} /></>
                                                                : <><Check size={16} /> {diffRows.length ? `套用 ${diffRows.length} 項並開始` : '開始下一季'}</>}
                                                        </motion.button>
                                                        <motion.button {...pressProps('row')}
                                                            onClick={() => setShowCycleComplete(false)}
                                                            style={{ width: '100%', minHeight: 44, marginTop: 4, border: 'none', background: 'transparent', color: 'rgba(22,20,21,0.5)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                                                            稍後再說
                                                        </motion.button>
                                                    </div>
                                                    {/* 換成什麼：推薦（同器材範圍）＋ 不換 ＋ 從動作庫挑 */}
                                                    <SwapChooserSheet
                                                        open={!!swapEditing && !swapLibrary}
                                                        fromName={swapEditing?.name}
                                                        currentName={swapEditing ? (diffRows.find((r) => r.name === swapEditing.name)?.newName || swapEditing.name) : null}
                                                        options={swapEditing ? swapOptionsFor(plan, swapEditing.name, { isBlocked, current: swapEditing.newName }) : []}
                                                        onPick={(o) => { setSwapChoices((m) => ({ ...m, [swapEditing.name]: o })); setSwapEditing(null); }}
                                                        onLibrary={() => setSwapLibrary(true)}
                                                        onClose={() => setSwapEditing(null)} />
                                                    {swapLibrary && swapEditing && (
                                                        <ExercisePicker
                                                            title={`「${swapEditing.name}」換成`}
                                                            suggestCategory={plan?.weeks?.flatMap((w) => w.days || []).flatMap((d) => d.exercises || []).find((e) => e.name === swapEditing.name)?.muscle || ''}
                                                            onSelect={(ex) => { setSwapChoices((m) => ({ ...m, [swapEditing.name]: ex })); setSwapLibrary(false); setSwapEditing(null); }}
                                                            onClose={() => setSwapLibrary(false)} />
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                </motion.div>
                            </motion.div>
                        );
                        })()}
                    </AnimatePresence>,
                    document.body
                )}

                {!showFeedbackModal && !showAddExerciseModal && !showCycleComplete && <MobileNavigation />}

                <SeasonAppliedSheet open={seasonAppliedOpen} applied={plan?._seasonApplied} onClose={closeSeasonApplied} />

                {/* --- Feedback Modals --- */}
                {showFeedbackModal && (
                    <WeekFeedbackModal
                        weekNumber={feedbackWeek}
                        /* 凍結的週數要等存完才放掉：先清掉的話，送出中 weekNumber 會變回 activeWeek */
                        onSubmit={async (data) => {
                            await handleWeekFeedback(data);
                            setFeedbackWeekOverride(null);
                        }}
                        onClose={() => {
                            const w = feedbackWeek;
                            setShowFeedbackModal(false);
                            setFeedbackWeekOverride(null);
                            // 不填就關掉：那週已練完的話一樣往下一週走，不把人卡在練完的週
                            advancePastWeek(w);
                        }}
                        recommendation={rpeRecommendation}
                    />
                )}

                {showFeedbackResult && feedbackAdjustments && (
                    <FeedbackResultModal
                        adjustments={feedbackAdjustments}
                        summary={feedbackAdjustments.summary}
                        selectedFeeling={feedbackAdjustments.summary?.accentKey}
                        weekNumber={feedbackAdjustments.weekNumber || activeWeek}
                        onResubmit={handleResubmitFeedback}
                        locked={!!feedbackAdjustments.locked}
                        onResetBaseline={rebuildSnapshotFromBackend}
                        onClose={() => {
                            setShowFeedbackResult(false);

                            const totalWeeks = plan?.weeks?.length || 4;
                            const currentFeedbackWeek = feedbackAdjustments.weekNumber || activeWeek;

                            // 邏輯分流：
                            if (currentFeedbackWeek < totalWeeks) {
                                // 情境 A：前三週 —— 自動跳週已改成等回饋完才走，所以這裡不論課表有沒有變都要推進；
                                // 但那週沒練完（手動提早回饋）就留在原地。
                                advancePastWeek(currentFeedbackWeek);
                            } else {
                                // 情境 B：最後一週，檢查並觸發「完美收官」
                                checkAndTriggerSeasonComplete();
                            }
                        }}
                    />
                )}

                {/* ── WorkoutPreviewSheet ── */}
                {previewDay && (
                    <WorkoutPreviewSheet
                        day={previewDay}
                        cardColor={previewCardColor}
                        weekdayName={previewWeekday}
                        planTags={planTags}
                        userWeightKg={userWeightKg}
                        userId={userId}
                        onStart={(dayWithGym) => {
                            setPreviewDay(null);
                            handleStartWorkout(dayWithGym || previewDay);
                        }}
                        onClose={() => setPreviewDay(null)}
                    />
                )}
            </div>

            <AnimatePresence>
                {showFullPlan && (
                    <PlanFullViewSheet
                        plan={plan}
                        onPlanUpdate={handlePlanUpdate}
                        onClose={() => setShowFullPlan(false)}
                    />
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default LuxuryPlanViewMobile;
