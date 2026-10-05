import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import SweatLiquidTransition from './SweatLiquidTransition';
import { getNextSimulatedStep, getRecoveryStep, calculateZoneStats } from '../utils/simulationUtils';
import { downsampleCardioForUpload } from '../utils/cardioDownsample';

import { Settings, Maximize2, Minimize2, History, ChevronRight, Target, TrendingUp, Map as MapIcon, Eye, Activity, Heart, Flame, Play, Pause, Square, Info, MapPin, Navigation, ArrowLeft, RefreshCcw, X, Zap, Trash2, Plus, Crown, Timer, Sun, Moon, CloudRain, Cloud, Sparkles, Calendar, MoreHorizontal, Layers, Globe, Footprints, Route as RouteIcon } from 'lucide-react';
import { MAP_STYLES, MAP_STYLE_CYCLE } from '../utils/mapTiles';
// BespokeAmbientGlow 已移除（圖二 START 卡不再疊氛圍燈）
import { useWeather } from '../hooks/useDRVNData';
// 🔴 即時一起練：把自己的距離推上去、看夥伴到哪
import { useLiveSession } from './SocialFeed/useLiveSession';
import { LiveStrip } from './SocialFeed/LiveTogether';
import { motion, AnimatePresence } from 'framer-motion';
import LiveMetricsDashboard from './LiveMetricsDashboard';
import RouteMap from './RouteMap';
import CardioResultsMobile from './CardioResultsMobile';
import SegmentExplorerMobile from './SegmentExplorerMobile';
import CardioTrendView from './CardioTrendView';
import RunningAnalysisMobile from './RunningAnalysisMobile'; // 🔥 Kept for Overlay
import SegmentSelector from './SegmentSelector';
import CardioPlanOverlay from './CardioPlanOverlay';
import TargetSelectionModal from './TargetSelectionModal';
import GrowthReportOverlay from './GrowthReportOverlay';
import WorkoutSavedConfirmation from './WorkoutSavedConfirmation';
import SaveConfirmationModal from './SaveConfirmationModal';
import BreathingAura from './BreathingAura';
import HeartRateZoneSlider from './HeartRateZoneSlider';
import WhisperCoach from './WhisperCoach';
import apiClient, { syncPendingStrengthWorkouts, getCardioRuns } from '../api/client';
import { useLocation, useNavigate } from 'react-router-dom';
import { hapticSelectionChanged } from '../utils/haptics';
import { SportIcon } from '../utils/drvnIcons';
import { startRunActivity, updateRunActivity, stopRunActivity } from '../utils/liveActivity';
import { getShoes, getCurrentShoe, setCurrentShoe, addMileageToCurrentShoe } from '../utils/shoeManager';
import { calculateHeartRateZones, getCurrentZone, fetchUserAge } from '../utils/heartRateUtils';
import { requestWakeLock, releaseWakeLock } from '../utils/restCues';
import { resolveSessionScore } from '../utils/fallbackScore';
import { ensureGaitStreams } from '../utils/runMilestones';
import { computeDistanceRankings, summarizeMedals } from '../utils/personalRecords';
import { applyTodayRealDone } from '../utils/dailyAgenda';
import { speak, stopSpeaking, isVoiceEnabled, setVoiceEnabled, buildKmAnnouncement } from '../utils/voiceCoach';
import { buildTurnInstructions, getNavState, phraseFor, nextAnnouncement } from '../utils/routeNavigation';
import { RunTurnBannerHost } from './RunTurnBanner';
import { useRecovery } from '../contexts/RecoveryContext';
import indexedDBManager from '../utils/indexedDB';
import useHealthKit from '../hooks/useHealthKit';
import GlobalFloatingMusicPlayer from './GlobalFloatingMusicPlayer';
import RunAmbientGlow from './ui/RunAmbientGlow';
import CardioBrickDetailSheet from './CardioBrickDetailSheet';
// 🌟 Phase 1 — Same-day 體驗升級三件套
import StepCapsuleStrip from './cardio/StepCapsuleStrip';
import MacroFocusOverlay from './cardio/MacroFocusOverlay';
import useStageCountdownHaptics from '../hooks/useStageCountdownHaptics';
// 💯 Phase 2-A — RPE 體感量表
import { resolveCurrentRPE, getStepRpeBand, compareRPEtoBand } from '../utils/rpeMapping';
// 🧱 Phase 2-B — Brick / Microcycle 對映
import { buildActivePlanFromBrick, buildWeeklyCoverFlowThemes } from '../utils/brickThemeMapping';
import { getTrackingTarget } from '../utils/brickTrackingTargets';
import useThisWeekBricks from '../hooks/useThisWeekBricks';
import { GOAL_NAMES } from '../utils/cardioPlanPath';
import { runPlanState, runPlanAction, runPlanWeekLabel, RUN_PLAN_ACTIVE } from '../utils/runPlanState';
import { getUserId } from '../utils/auth';
import { reportCollabProgress } from '../utils/reportCollabProgress';
import { getOneShotLocation } from '../utils/nativeLocation';

// 🔥 Google Fonts for dashboard numbers
import { createPortal } from 'react-dom';
import DataPulse from './ui/DataPulse';
import { brandColors as C } from '../utils/colors';
import DashboardMode from './DashboardMode';
import { formatPace as fmtPace, formatDuration as fmtDuration } from '../utils/format';
import { recordCardioCompletion } from '../utils/muscleRecoveryTracker';
import { getTodayReadiness, readinessLabel, readinessSourceLine } from '../utils/readiness';
import { QUICK_RUN_COURSES, personalizeQuickSteps, courseMinutesRange, mainSetOf } from '../utils/quickRunCourses';
import { sortCoursesForPlace, findRunPlaceNear, loadRunMemory, suitedCourses, COURSE_ZH, routeHistoryFor, paceLabel } from '../utils/runMemory';
import { canUse } from '../utils/membership';
import { mondayWeekKey } from '../utils/localDate';
import { hasBrickActivity } from '../utils/cardioPlanActuals';
import { toast } from '../utils/toast';
import { queueBrickCompletion, PENDING_RPE_KEY } from '../utils/offlineSync';

const PortalSheet = ({ children }) => createPortal(<div style={{ position: 'relative', zIndex: 100100 }}>{children}</div>, document.body);

// 🔋 偵測「低耗電模式」：prefers-reduced-motion 或電量 < 20% 時，回傳 true
// 用於控制光球 morph keyframe 動畫等高耗電視覺，行動裝置電力友善
const useLowPowerMode = () => {
    const [reduceMotion, setReduceMotion] = useState(() => {
        if (typeof window === 'undefined') return false;
        try {
            return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
        } catch (e) { return false; }
    });
    const [lowBattery, setLowBattery] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        // listen prefers-reduced-motion 變化
        let mq;
        try {
            mq = window.matchMedia('(prefers-reduced-motion: reduce)');
            const handler = (e) => setReduceMotion(e.matches);
            mq.addEventListener?.('change', handler);
            return () => mq.removeEventListener?.('change', handler);
        } catch (e) { /* noop */ }
    }, []);

    useEffect(() => {
        if (typeof navigator === 'undefined' || !navigator.getBattery) return;
        let battery;
        let cancelled = false;
        const sync = () => {
            if (!battery || cancelled) return;
            // 充電中視為非低電量，否則電量 < 20% 視為低電量
            setLowBattery(!battery.charging && battery.level < 0.2);
        };
        navigator.getBattery().then((b) => {
            if (cancelled) return;
            battery = b;
            sync();
            b.addEventListener('levelchange', sync);
            b.addEventListener('chargingchange', sync);
        }).catch(() => { /* iOS Safari 不支援 — 忽略 */ });
        return () => {
            cancelled = true;
            if (battery) {
                battery.removeEventListener('levelchange', sync);
                battery.removeEventListener('chargingchange', sync);
            }
        };
    }, []);

    return reduceMotion || lowBattery;
};

// Medium #14 — 字體系統統一：從 4 種（Plus Jakarta + Tenor Sans + Share Tech Mono + 預設 sans）
// 收斂為 2 種（Body 用 Plus Jakarta Sans 全 weight；Mono 用 Share Tech Mono）。
// 標題改以 letter-spacing + weight 區分階層，而非換家族（更現代、更專業）。
// 同時集中宣告 CSS variables（Medium #25）：色彩 / 圓角 / 最大寬度 / 字體。
const FontStyle = () => (
    <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,200;0,300;0,400;0,500;0,600;0,700;0,800;1,200;1,300;1,400;1,500;1,600;1,700;1,800&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');

        :root {
            --font-body: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
            --font-mono: 'Share Tech Mono', ui-monospace, SFMono-Regular, Menlo, monospace;

            /* Cardio 主題色 / 文字顏色 */
            --cardio-accent: #F95C4B;
            --cardio-accent-soft: rgba(249, 92, 75, 0.4);
            --cardio-text-strong: #161415;
            --cardio-text-muted: rgba(22, 20, 21, 0.5);
            --cardio-text-faint: rgba(22, 20, 21, 0.3);

            /* 即時數據主數字尺寸 — 跑步中放大成「移動掃視」可讀 */
            --cardio-metric-size: 28px;

            /* 面板底色 — 預設半透明玻璃（淺底地圖）；日光模式改實色、深底地圖改深色玻璃 */
            --cardio-panel-bg: rgba(246, 244, 241, 0.62);
            --cardio-panel-blur: blur(32px) saturate(1.8);
            --cardio-panel-border: rgba(255,255,255,0.30);
            --cardio-panel-border-top: rgba(255,255,255,0.85);
            --cardio-panel-border-left: rgba(255,255,255,0.50);
            --cardio-panel-shadow: 0 24px 48px rgba(0,0,0,0.12), inset 0 2px 6px rgba(255,255,255,0.7);

            /* 面板內次要 chip（GEAR / ROUTE / Apple Watch 提示）— 淺底地圖預設 */
            --cardio-chip-bg: rgba(255, 255, 255, 0.55);
            --cardio-chip-border: rgba(255, 255, 255, 0.85);
            --cardio-chip-ink: #161415;
            --cardio-chip-ink-soft: rgba(22, 20, 21, 0.55);

            /* Layout */
            --cardio-panel-max-width: 480px;
            --cardio-panel-radius: 36px;

            /* Shadow / Glow tokens — Medium #25 延伸：把散落 inline 的 box/text-shadow 收歸 */
            --cardio-shadow-card: 0 12px 48px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.5);
            --cardio-shadow-chip: 0 4px 10px -2px rgba(0,0,0,0.06), inset 0 1px 1px rgba(255,255,255,0.9);
            --cardio-shadow-cta: 0 16px 36px -8px rgba(249,92,75,0.55), 0 4px 12px rgba(217,64,48,0.30), inset 0 1.5px 1px rgba(255,255,255,0.45), inset 0 -2px 6px rgba(0,0,0,0.18);
            --cardio-shadow-chip-inset: 0 0 8px rgba(0,0,0,0.1);
            --cardio-glow-soft: 0 0 12px rgba(249,92,75,0.4);
            --cardio-glow-text: 0 1px 2px rgba(0,0,0,0.18);
        }

        /* ☀️ 日光高對比模式 — 戶外大太陽下，半透明玻璃 + 低對比會糊掉。
           切到此模式：文字轉純黑、面板改實色白底、移除毛玻璃模糊，最大化對比。 */
        .cardio-daylight {
            --cardio-text-strong: #000000;
            --cardio-text-muted: rgba(0, 0, 0, 0.72);
            --cardio-text-faint: rgba(0, 0, 0, 0.55);
            --cardio-panel-bg: #FFFFFF;
            --cardio-panel-blur: none;
        }
        .cardio-daylight .cardio-glass-panel {
            background: var(--cardio-panel-bg) !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            border-color: rgba(0,0,0,0.12) !important;
        }

        /* 🌑 深底地圖模式（深色 / 衛星）— 依設計系統「深色畫布上浮 Liquid Glass」：
           底部 dock 改深色玻璃、文字轉淺色，把深色地圖透進來，材質與上方 pill 一致。 */
        .cardio-darkmap {
            --cardio-text-strong: #F6F4F1;
            --cardio-text-muted: rgba(246, 244, 241, 0.66);
            --cardio-text-faint: rgba(246, 244, 241, 0.42);
            --cardio-panel-bg: rgba(38, 36, 35, 0.52);
            --cardio-panel-blur: blur(36px) saturate(1.6);
            --cardio-panel-border: rgba(255,255,255,0.12);
            --cardio-panel-border-top: rgba(255,255,255,0.22);
            --cardio-panel-border-left: rgba(255,255,255,0.14);
            --cardio-panel-shadow: 0 24px 48px rgba(0,0,0,0.45), inset 0 1px 2px rgba(255,255,255,0.16);
            --cardio-chip-bg: rgba(255, 255, 255, 0.10);
            --cardio-chip-border: rgba(255, 255, 255, 0.18);
            --cardio-chip-ink: #F6F4F1;
            --cardio-chip-ink-soft: rgba(246, 244, 241, 0.55);
        }

        /* 📏 跑步中放大主數字（P2-1）— 讓 time/distance/pace 在移動中也掃得到 */
        .cardio-metric-num {
            font-size: var(--cardio-metric-size);
        }

        /* prefers-reduced-motion：把 morph 動畫降為靜態 */
        @media (prefers-reduced-motion: reduce) {
            .cardio-orb-morph {
                animation: none !important;
                transition: none !important;
            }
        }

        * {
            font-family: var(--font-body);
        }
        h1, h2, h3, h4, .brand-font {
            font-family: var(--font-body);
            letter-spacing: -0.01em;
            font-weight: 800;
        }
        .share-tech-mono {
            font-family: var(--font-mono) !important;
            font-variant-numeric: tabular-nums;
        }
    `}</style>
);

const SAMPLE_ROUTE = [
    { lat: 25.0330, lng: 121.5654 },
    { lat: 25.0340, lng: 121.5644 },
    { lat: 25.0350, lng: 121.5634 },
];

// 🟢 運動模式定義（GEAR 左邊的選擇器）。挑「有速度」的運動。
//    hasElevation：需要上下坡 → 面板/儀表板顯示海拔。
//    noGps：室內無 GPS（游泳）→ 不畫地圖、不顯示海拔。
//    type：寫進結算 payload 的運動類型；hk：對應 HealthKit activityType（iOS 原生用）。
const SPORTS = [
    /* 🎯 UI 無 emoji（Definition §6.3）：icon 欄位改帶 sport key，
       渲染端用 <SportIcon type={...} /> 出線性圖示。
       emoji 在 iOS/Android 長得不一樣，且是彩色的 —— 會吃掉「一頁一個 Coral」的預算。 */
    { id: 'run',     label: '跑步',   zh: '自由跑',   icon: 'run',     hasElevation: false, noGps: false, type: 'running' },
    { id: 'cycling', label: '自行車', zh: '單車',     icon: 'cycling', hasElevation: true,  noGps: false, type: 'cycling' },
    { id: 'trail',   label: '越野跑', zh: '越野',     icon: 'trail',   hasElevation: true,  noGps: false, type: 'trail_running' },
    { id: 'hike',    label: '健行',   zh: '健行',     icon: 'hike',    hasElevation: true,  noGps: false, type: 'hiking' },
    { id: 'swim',    label: '游泳',   zh: '游泳',     icon: 'swim',    hasElevation: false, noGps: true,  type: 'swimming' },
    { id: 'ski',     label: '滑雪',   zh: '滑雪',     icon: '🎿', hasElevation: true,  noGps: false, type: 'skiing' },
];

// 🌬 Phase 1 — step.name → RunAmbientGlow tempo 對應（v1 keyword 比對）
// TODO(v2): 改用 step.intensity 欄位（'low' | 'mid' | 'high'）取代字串比對
const SLOW_KEYWORDS = ['暖身', '緩和', '恢復', '冷卻', 'warm', 'cool', 'recover'];
const FAST_KEYWORDS = ['衝刺', '加速', '全力', '極限', 'sprint', 'all out', 'max'];
const resolveTempo = (step) => {
    const name = String(step?.name || '').toLowerCase();
    if (FAST_KEYWORDS.some((k) => name.includes(k))) return 'fast';
    if (SLOW_KEYWORDS.some((k) => name.includes(k))) return 'slow';
    return 'normal';
};
// 🔍 Macro Focus 自動啟動條件 — 任何模式只要進入「衝刺/全力/極限/間歇/rep」step 都觸發
//   不再只限 reps 計劃；FAST_KEYWORDS 之外再補 interval / 間歇 / rep / 衝
const SPRINT_EXTRA_RE = /衝刺|衝|間歇|interval|sprint|全力|加速|極限|all.?out|\bmax\b|\brep\b|rep\s*\d/i;
const isSprintStep = (step) => {
    const name = String(step?.name || '').toLowerCase();
    return FAST_KEYWORDS.some((k) => name.includes(k)) || SPRINT_EXTRA_RE.test(name);
};

// 🏃 快速訓練：固定課程（utils/quickRunCourses）＋ 卡片視覺。模組層常數，id 與計劃模式的主題對應不變
const QUICK_RUN_VISUALS = {
    recovery: { image: '/desktop/recovery_poster.jpeg', icon: RefreshCcw, color: '#E8A598' },
    base: { image: '/desktop/aaaa.jpeg', icon: Heart, color: '#F07A5A' },
    progressive: { image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=600&q=80', icon: Flame, color: '#F95C4B' },
    hill: { image: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=600&q=80', icon: TrendingUp, color: '#D94030' },
};
const QUICK_RUN_THEMES = QUICK_RUN_COURSES.map((c) => ({ ...c, ...QUICK_RUN_VISUALS[c.id] }));

// Heart Rate Zones & Colors
const ZONES = {
    REST: { min: 0, max: 0, color: '#FDD835', name: 'REST', id: 0 },
    WARM_UP: { min: 0, max: 130, color: '#FDD835', name: 'WARM UP', id: 1 },    // 黃色 (準備起點)
    FAT_BURN: { min: 131, max: 150, color: '#8BC34A', name: 'FAT BURN', id: 2 }, // 鮮綠 (能量穩定燃脂)
    AEROBIC: { min: 151, max: 170, color: '#FF9800', name: 'AEROBIC', id: 3 },   // 活力橘 (心肺穩定節奏)
    ANAEROBIC: { min: 171, max: 190, color: '#F06292', name: 'ANAEROBIC', id: 4 },// 亮粉 (無氧強度標記)
    EXTREME: { min: 191, max: 220, color: '#5C6BC0', name: 'EXTREME', id: 5 }    // 深藍紫 (極限專注)
};

const getZoneInfo = (hr) => {
    if (!hr) return ZONES.WARM_UP;
    if (hr <= ZONES.WARM_UP.max) return ZONES.WARM_UP;
    if (hr <= ZONES.FAT_BURN.max) return ZONES.FAT_BURN;
    if (hr <= ZONES.AEROBIC.max) return ZONES.AEROBIC;
    if (hr <= ZONES.ANAEROBIC.max) return ZONES.ANAEROBIC;
    return ZONES.EXTREME;
};

// 💡 Points per minute in each zone (tuned for 30-min session ≈ 40-60 pts)
const ZONE_MULTIPLIERS = {
    0: 0.0,  // REST
    1: 0.5,  // WARM UP
    2: 1.0,  // FAT BURN
    3: 2.0,  // AEROBIC
    4: 3.5,  // ANAEROBIC
    5: 5.0   // EXTREME
};

// Zone id → zoneStats key (used when accumulating zone seconds)
const ZONE_ID_TO_KEY = {
    0: 'Warm-up',
    1: 'Warm-up',
    2: 'Fat Burn',
    3: 'Aerobic',
    4: 'Anaerobic',
    5: 'Extreme'
};

// Golden/Platinum State for breaking records
const GOLDEN_STATE = {
    color: '#E5E4E2', // Platinum/White Gold
    gradient: 'linear-gradient(135deg, #E5E4E2 0%, #FFFFFF 50%, #B0C4DE 100%)',
    shadow: '0 0 30px rgba(229, 228, 226, 0.6)'
};

const TEXTURES = {
    wood: `
        linear-gradient(to bottom, rgba(255,255,255,0.05) 0%, transparent 50%, rgba(0,0,0,0.2) 100%),
        repeating-linear-gradient(to right, 
            transparent 0px, transparent 38px, 
            rgba(255,255,255,0.1) 38px, rgba(255,255,255,0.1) 38.8px,
            rgba(0,0,0,0.15) 38.8px, rgba(0,0,0,0.15) 39.5px
        ),
        #8B5E3C
    `,
    // 🔥 Softened Pebble Titanium (High-light reduced from #F6F4F1)
    pebbleTitanium: 'linear-gradient(135deg, #BDB2A2 0%, #DED9CF 45%, #CDC4B4 50%, #BDB2A2 100%)',
    titaniumCoral: 'linear-gradient(135deg, #FF7A6B 0%, #F95C4B 45%, #D94030 50%, #FF7A6B 100%)',
    titaniumDark: 'linear-gradient(135deg, #161415 0%, #323031 45%, #262523 50%, #161415 100%)',
    // 🔥 Darker Matte Titanium for Buttons
    titaniumMatte: 'linear-gradient(135deg, #D1D1D1 0%, #B0B0B0 100%)',
    // 🪙 配速三色（鈦金屬拉絲漸層）— 進度條/段落上色用
    titaniumGlacier: 'linear-gradient(135deg, #8FC6F0 0%, #5FA8E0 45%, #3E86C4 50%, #8FC6F0 100%)', // 太快 → 鈦冰川藍
    titaniumGreen: 'linear-gradient(135deg, #66C9A6 0%, #3FA787 45%, #2E8568 50%, #66C9A6 100%)', // 達標 → 鈦質感綠
};

// 🪙 配速三色判定（秒/km，數字越小越快）→ 回傳鈦金屬漸層 + 主色 + 光暈
//   太慢(> 目標 +10%) → 鈦紅橘 / 太快(< 目標 −10%) → 鈦冰川藍 / ±10% 內 → 鈦質感綠
const TITANIUM_PACE = {
    hot: { gradient: 'linear-gradient(135deg, #FF7A6B 0%, #F95C4B 45%, #D94030 50%, #FF7A6B 100%)', color: '#F95C4B', glow: 'rgba(249,92,75,0.55)' },
    cold: { gradient: 'linear-gradient(135deg, #8FC6F0 0%, #5FA8E0 45%, #3E86C4 50%, #8FC6F0 100%)', color: '#5FA8E0', glow: 'rgba(95,168,224,0.55)' },
    good: { gradient: 'linear-gradient(135deg, #66C9A6 0%, #3FA787 45%, #2E8568 50%, #66C9A6 100%)', color: '#3FA787', glow: 'rgba(63,167,135,0.55)' },
};
const titaniumPace = (current, target) => {
    if (!current || current <= 0 || !target || target <= 0) return null;
    if (current > target * 1.1) return TITANIUM_PACE.hot;   // 太慢 → 鈦紅橘
    if (current < target * 0.9) return TITANIUM_PACE.cold;  // 太快 → 鈦冰川藍
    return TITANIUM_PACE.good;                               // ±10% → 鈦質感綠
};

const getZoneConfig = (currentPace, avgPace) => {
    if (!currentPace || !avgPace || currentPace > 3600) return { label: '暖身', color: '#CCD5AE', speed: 4, glow: '0px' };
    const ratio = currentPace / avgPace;
    if (ratio > 1.2) return { label: '暖身', color: '#CCD5AE', speed: 4, glow: '0px' };
    if (ratio >= 0.9) return { label: '脂肪燃燒', color: '#E9C46A', speed: 1.5, glow: '15px' };
    if (ratio >= 0.8) return { label: '有氧', color: '#F4A261', speed: 1.0, glow: '10px' };
    if (ratio >= 0.7) return { label: '無氧', color: '#E76F51', speed: 0.7, glow: '20px' };
    return { label: '極限', color: '#D62828', speed: 0.4, glow: '30px' };
};

// ══════════════════════════════════════════════════════════
// 🪙 階段狀態分類 — 把任一 step 轉成「使用者看得懂的當前狀態」
//   全模式共用（reps/pace/tempo/long…），讓光球下方 / 頂部 chip / 圖三圖四都一致
// ══════════════════════════════════════════════════════════
const getStepStatus = (step) => {
    const n = String(step?.name || '').toLowerCase();
    if (/暖身|warm.?up|熱身/.test(n)) return { label: '暖身中 · 慢慢進入狀態', short: 'WARM UP' };
    if (/收操|cool.?down|緩和|冷卻/.test(n)) return { label: '收操中 · 讓身體緩下來', short: 'COOL DOWN' };
    if (/恢復|recover|rest|walk|休息/.test(n)) return { label: '恢復段 · 把心率降下來', short: 'RECOVER' };
    if (/衝刺|sprint|全力|加速|極限|interval|間歇|rep|衝/.test(n)) return { label: '衝刺中 · 全力達標', short: 'SPRINT' };
    if (/節奏|tempo|threshold|閾值/.test(n)) return { label: '節奏跑 · 維持目標配速', short: 'TEMPO' };
    if (/穩定|steady|long|長跑|巡航|cruise/.test(n)) return { label: '穩定巡航 · 保持節奏', short: 'STEADY' };
    if (/輕鬆|easy/.test(n)) return { label: '輕鬆跑 · 對話配速', short: 'EASY' };
    return { label: step?.name ? `${step.name} · 進行中` : '進行中', short: String(step?.name || 'STEP').toUpperCase() };
};

// ══════════════════════════════════════════════════════════
// DynamicMusicIsland — 模組層級（完全隔離於 CardioTrackerMobile re-render）
// ══════════════════════════════════════════════════════════
const _DISC_SPIN = { repeat: Infinity, duration: 12, ease: 'linear' };
const _ARROW_TR = { duration: 0.2 };
const _EQ_BARS = [
    { lo: '22%', hi: '72%' }, { lo: '50%', hi: '95%' },
    { lo: '18%', hi: '58%' }, { lo: '42%', hi: '88%' },
    { lo: '28%', hi: '68%' }, { lo: '15%', hi: '48%' },
];
const _EQ_TR = _EQ_BARS.map((_, i) => ({
    duration: 0.55 + i * 0.08, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut',
}));

const DynamicMusicIsland = React.memo(() => {
    // 🔋 P0 修復：低電量 / reduceMotion 時關閉封面旋轉與均衡器無限動畫，
    // 避免整段跑步全程（螢幕恆亮）持續燒 GPU/電量。
    const isLowPower = useLowPowerMode();
    const [playback, setPlayback] = useState(null);
    const [expanded, setExpanded] = useState(false);
    const [library, setLibrary] = useState([]);

    // 🔥 Fix #4: 移除 1000ms polling，改用 StorageEvent + CustomEvent
    useEffect(() => {
        const sync = () => {
            const raw = localStorage.getItem('sonicfocus_playback');
            if (raw) {
                try {
                    const data = JSON.parse(raw);
                    setPlayback(prev => JSON.stringify(prev) !== raw ? data : prev);
                } catch (_) { }
            } else {
                setPlayback(null);
                setExpanded(false);
            }
            const libRaw = localStorage.getItem('sonicfocus_library');
            if (libRaw) {
                try {
                    const parsed = JSON.parse(libRaw).playlists || [];
                    setLibrary(prev => JSON.stringify(prev) !== JSON.stringify(parsed) ? parsed : prev);
                } catch (_) { }
            }
        };
        sync();
        window.addEventListener('storage', sync);
        window.addEventListener('sonicfocus_playback_changed', sync);
        window.addEventListener('sonicfocus-update', sync);
        return () => {
            window.removeEventListener('storage', sync);
            window.removeEventListener('sonicfocus_playback_changed', sync);
            window.removeEventListener('sonicfocus-update', sync);
        };
    }, []);

    const isWorkoutMusicDisabled = localStorage.getItem('disable_workout_music') === '1';
    if (isWorkoutMusicDisabled || !playback || !playback.isPlaying) return null;

    const switchTo = (p, e) => {
        e.stopPropagation();
        const ns = { id: p.id, title: p.title, subtitle: p.subtitle, platform: p.platform, url: p.url, img: p.img, isPlaying: true };
        localStorage.setItem('sonicfocus_playback', JSON.stringify(ns));
        window.dispatchEvent(new Event('sonicfocus_playback_changed'));
        if (p.url) {
            const a = document.createElement('a');
            a.href = p.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        }
        setExpanded(false);
    };

    return (
        <div className="pointer-events-auto flex flex-col items-center" style={{ width: '260px' }}>
            {/* ── Pill（純 div — 進出場由 parent AnimatePresence 負責）── */}
            <div
                onClick={() => setExpanded(v => !v)}
                className="flex items-center cursor-pointer select-none w-full"
                style={{
                    height: '50px',
                    background: 'rgba(20, 20, 20, 0.45)',
                    backdropFilter: 'blur(32px) saturate(1.8)',
                    WebkitBackdropFilter: 'blur(32px) saturate(1.8)',
                    borderRadius: expanded ? '18px 18px 0 0' : '18px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderTop: '1px solid rgba(255,255,255,0.15)',
                    borderBottom: expanded ? '1px solid rgba(255,255,255,0.04)' : undefined,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.2)',
                    overflow: 'hidden', transition: 'border-radius 0.2s ease',
                }}
            >
                {/* 旋轉封面 */}
                <div className="w-[50px] h-full flex-shrink-0 flex items-center justify-center relative">
                    <motion.div animate={isLowPower ? { rotate: 0 } : { rotate: 360 }} transition={isLowPower ? { duration: 0 } : _DISC_SPIN}
                        className="w-8 h-8 rounded-full overflow-hidden"
                        style={{ border: '1px solid rgba(255,255,255,0.10)' }}>
                        {playback.img
                            ? <img loading="lazy" decoding="async" src={playback.img} className="w-full h-full object-cover" alt="disc" />
                            : <div className="w-full h-full" style={{ background: 'radial-gradient(circle at 40% 35%, #262523, #0D0D0D)' }} />
                        }
                    </motion.div>
                    <div className="absolute w-2 h-2 rounded-full pointer-events-none"
                        style={{ background: C.ink, border: '1px solid rgba(255,255,255,0.08)' }} />
                </div>

                {/* 曲目文字 */}
                <div className="flex-1 flex flex-col justify-center min-w-0 px-3">
                    {/* Medium #14: 字體統一 — 移除 Tenor Sans，改用 var(--font-body) 同家族 + letter-spacing 區分階層 */}
                    <div className="text-[#F6F4F1] text-[13px] font-black uppercase truncate leading-none"
                        style={{ fontFamily: 'var(--font-body)', letterSpacing: '-0.02em' }}>
                        {playback.title}
                    </div>
                    <div className="text-[12px] font-bold tracking-[0.22em] mt-[4px] truncate"
                        style={{ color: 'rgba(246,244,241,0.30)', fontFamily: 'var(--font-body)' }}>
                        音樂{playback.bpm ? ` · ${playback.bpm} BPM` : ''}
                    </div>
                </div>

                {/* 動態均衡器 */}
                <div className="flex items-end gap-[2px] self-center" style={{ height: '14px', paddingRight: '10px' }}>
                    {_EQ_BARS.map((b, i) => (
                        <motion.div key={i}
                            animate={isLowPower ? { height: b.hi } : { height: [b.lo, b.hi, b.lo] }}
                            transition={isLowPower ? { duration: 0 } : _EQ_TR[i]}
                            className="w-[2px] rounded-t-sm"
                            style={{ backgroundColor: i >= 4 ? C.coral : 'rgba(246,244,241,0.55)', originY: 1 }}
                        />
                    ))}
                </div>

                {/* 展開箭頭 */}
                <div className="pr-3 flex-shrink-0" style={{ color: 'rgba(246,244,241,0.25)' }}>
                    <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={_ARROW_TR}>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </motion.div>
                </div>
            </div>

            {/* ── 展開清單 ── */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="w-full overflow-hidden"
                        style={{
                            background: 'rgba(20, 20, 20, 0.45)',
                            backdropFilter: 'blur(32px) saturate(1.8)',
                            WebkitBackdropFilter: 'blur(32px) saturate(1.8)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderTop: 'none',
                            borderRadius: '0 0 18px 18px',
                            boxShadow: '0 16px 40px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255, 255, 255, 0.1)',
                        }}
                    >
                        <div className="py-2" style={{ maxHeight: '200px', overflowY: 'auto', scrollbarWidth: 'none' }}>
                            {library.length > 0 ? library.map(p => {
                                const isActive = p.title === playback.title;
                                return (
                                    <div key={p.id} onClick={(e) => switchTo(p, e)}
                                        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer active:bg-white/5"
                                        style={{ background: isActive ? 'rgba(249,92,75,0.10)' : 'transparent' }}>
                                        <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0"
                                            style={{ border: '1px solid rgba(255,255,255,0.10)' }}>
                                            {p.img
                                                ? <img loading="lazy" decoding="async" src={p.img} className="w-full h-full object-cover" alt={p.title} />
                                                : <div className="w-full h-full" style={{ background: 'radial-gradient(circle, #333, #111)' }} />
                                            }
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[12px] font-black uppercase truncate leading-none"
                                                style={{ color: isActive ? C.coral : C.paper, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                                                {p.title}
                                            </div>
                                            <div className="text-[9px] font-bold uppercase tracking-widest mt-0.5"
                                                style={{ color: 'rgba(246,244,241,0.28)' }}>
                                                {p.platform === 'spotify' ? 'SPOTIFY' : p.platform === 'apple' ? 'APPLE MUSIC' : 'CUSTOM'}
                                            </div>
                                        </div>
                                        {p.url && (
                                            <div style={{ color: isActive ? C.coral : 'rgba(246,244,241,0.2)' }} className="flex-shrink-0">
                                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                                    <path d="M2 8L8 2M8 2H4M8 2V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            </div>
                                        )}
                                    </div>
                                );
                            }) : (
                                <div className="px-4 py-5 text-center text-[9px] font-black uppercase tracking-widest"
                                    style={{ color: 'rgba(246,244,241,0.2)' }}>
                                    No playlists saved
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
});


// ⚡ P0 效能修復：格式化函式在模組層共用（memo 子元件不重建閉包）。
// 🩹 J: fmtDuration / fmtPace 改由 utils/format.js 匯入（單一真相源），本地版已刪。
const fmtFixed = (val, digits = 2) => {
    if (val === null || val === undefined || isNaN(Number(val))) return (0).toFixed(digits);
    return Number(val).toFixed(digits);
};

// ⚡ P0 效能修復：直播跑步畫面每 1 秒會更新 cardioData（duration/pace/distance），
// 原本整顆 5000+ 行的 CardioTrackerMobile 都會跟著 re-render。把這三個會跳動的數字
// 抽成獨立 React.memo 子元件，只吃 primitive props —— 計時器一秒一跳時只重渲染這一小塊，
// 外層地圖容器 / 控制列 / sheet 全部不動。(Vercel rerender-memo)
const LiveMetricsRow = React.memo(function LiveMetricsRow({ duration, currentPace, distance, idle, showElevation = false, elevation = 0 }) {
    const numColor = idle ? 'var(--cardio-text-muted)' : 'var(--cardio-text-strong)';
    const cols = showElevation ? 4 : 3;

    // ══════════════════════════════════════════════════════════════════════
    // 📏 破一小時不再擠成一團（使用者回報：1:06:39 9'31" 10.22 三個數字疊在一起）
    //
    //    成因：`cardio-metric-num` 是固定字級，時長從 mm:ss（5 字）變成
    //    h:mm:ss（7 字）時就撐爆欄寬，往旁邊溢出蓋到配速。
    //    解法：依「這一格實際要顯示幾個字」動態縮字級，並加 min-w-0 +
    //    overflow-hidden 讓它永遠留在自己的格子裡。字級只縮不放，
    //    維持瑞士排版的大數字氣勢（跑步中晃動，數字必須夠大）。
    // ══════════════════════════════════════════════════════════════════════
    const fitSize = (text) => {
        const len = String(text ?? '').length;
        // 4 欄時每格更窄，起點字級要小一階
        const base = cols === 4 ? 30 : 36;
        if (len <= 5) return base;
        if (len === 6) return base - 4;
        if (len === 7) return base - 8;   // 1:06:39
        return base - 12;                 // 極端情況（>10 小時）
    };

    const Cell = ({ label, unit, value, first }) => {
        const text = String(value ?? '');
        return (
            <div className={`text-left min-w-0 overflow-hidden ${first ? 'pl-6' : 'pl-4'} pr-2`}>
                <p className="text-[9px] font-black tracking-[0.14em] mb-1.5 whitespace-nowrap"
                   style={{ color: 'var(--cardio-text-muted)' }}>
                    {label}{unit && <span className="opacity-45 ml-1">{unit}</span>}
                </p>
                <p
                    className="leading-none whitespace-nowrap"
                    style={{
                        fontFamily: 'var(--font-body)',
                        fontWeight: 300,
                        letterSpacing: '-0.02em',
                        fontVariantNumeric: 'tabular-nums',
                        fontFeatureSettings: '"tnum" 1',
                        color: numColor,
                        fontSize: fitSize(text),
                    }}
                >
                    {text}
                </p>
            </div>
        );
    };

    // 🟢 需海拔的運動（自行車/越野跑/健行/滑雪）多顯示一欄海拔；其餘維持 3 欄。
    //    標題改中文（跑步中要一眼看懂，英文 kicker 留給結算頁的編輯風排版）。
    return (
        <div className={`grid ${showElevation ? 'grid-cols-4' : 'grid-cols-3'} divide-x divide-[#CFC6B8]/40 py-3`}>
            <Cell first label="時長" value={fmtDuration(duration)} />
            <Cell label="配速" unit="分/公里" value={fmtPace(currentPace)} />
            <Cell label="距離" unit="公里" value={fmtFixed(distance, 2)} />
            {showElevation && <Cell label="爬升" unit="公尺" value={Math.round(elevation || 0)} />}
        </div>
    );
});


// ══════════════════════════════════════════════════════════════════════════
// 📊 LiveSplitsStrip — 跑步中的逐公里配速長條（用「高度」表現快慢）
//
// 使用者要求：「加上分段配速去從高度去顯示配速快慢的功能，目前有但是似乎沒有
// 做完整，沒有高低起伏跟顯示每一段的配速。」
//
// 規則：
//   • 柱高 ∝ 配速（越快越高），最快段 100%、最慢段 38%（保留可讀下限）。
//   • 每根柱子上方標該公里的實際配速 —— 使用者要看得到數字，不只看形狀。
//   • 只有一段時無從比較 → 統一給中高，不假裝有起伏。
//   • 尾段（不足 1 公里）用灰色 + 「尾」標示，不參與最快段判定。
//   • 資料來自 cardioData.splits（實跑逐公里的真實量測）。
// ══════════════════════════════════════════════════════════════════════════
const LiveSplitsStrip = React.memo(function LiveSplitsStrip({ splits = [], accent = '#F95C4B' }) {
    const list = Array.isArray(splits) ? splits.slice(-8) : [];   // 只顯示最近 8 公里，跑步中夠用
    if (list.length === 0) return null;

    const isPartial = (s) => s?.partial === true
        || (Number(s?.distanceKm ?? s?.distance_km ?? 1) > 0 && Number(s?.distanceKm ?? s?.distance_km ?? 1) < 0.95);
    const paceOf = (s) => Number(s?.pace ?? s?.time ?? 0);

    const fullPaces = list.filter((s) => !isPartial(s)).map(paceOf).filter((p) => p > 0);
    const fastest = fullPaces.length ? Math.min(...fullPaces) : 0;
    const slowest = fullPaces.length ? Math.max(...fullPaces) : 0;

    const heightPct = (s) => {
        const p = paceOf(s);
        if (isPartial(s)) return 34;
        if (!p || slowest === fastest) return 72;      // 無從比較 → 中高，不假裝有起伏
        const t = (slowest - p) / (slowest - fastest); // 0..1（越快越大）
        return Math.round(38 + t * 62);
    };
    const fmt = (p) => p > 0 ? `${Math.floor(p / 60)}'${String(Math.round(p % 60)).padStart(2, '0')}"` : '—';

    return (
        <div className="px-5 pt-1 pb-3">
            <div className="flex items-baseline justify-between mb-2">
                <span className="text-[12px] font-black tracking-[0.14em]" style={{ color: 'var(--cardio-text-muted)' }}>
                    分段配速<span className="opacity-45 ml-1">每公里</span>
                </span>
                {fastest > 0 && (
                    <span className="text-[11px] font-bold tabular-nums" style={{ color: 'var(--cardio-text-muted)' }}>
                        最快 <span style={{ color: accent, fontWeight: 900 }}>{fmt(fastest)}</span>
                    </span>
                )}
            </div>

            {/* 柱狀圖：高度＝快慢，柱上標配速 */}
            <div className="flex items-end gap-1.5" style={{ height: 76 }}>
                {list.map((s, i) => {
                    const partial = isPartial(s);
                    const p = paceOf(s);
                    const isFast = !partial && p > 0 && p === fastest && fullPaces.length > 1;
                    return (
                        <div key={`${s?.km ?? i}-${i}`} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full">
                            <span
                                className="text-[11px] font-black tabular-nums mb-1 whitespace-nowrap"
                                style={{ color: isFast ? accent : 'var(--cardio-text-muted)' }}
                            >
                                {fmt(p)}
                            </span>
                            <div
                                className="w-full rounded-t-[5px] rounded-b-[2px]"
                                style={{
                                    height: `${heightPct(s)}%`,
                                    background: partial
                                        ? 'rgba(22,20,21,0.16)'
                                        : isFast
                                            ? accent
                                            : 'linear-gradient(180deg, #8FB8CE 0%, #6C9DBA 100%)',
                                    transition: 'height 0.6s cubic-bezier(0.16,1,0.3,1)',
                                    boxShadow: isFast ? `0 0 10px ${accent}55` : 'none',
                                }}
                            />
                            <span className="text-[11px] font-bold mt-1 opacity-45 whitespace-nowrap" style={{ color: 'var(--cardio-text-muted)' }}>
                                {partial ? '尾' : `${s?.km ?? i + 1}K`}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
});


// 🔁 快速訓練詳細頁的「上次同款」回聲卡 — 只看類型（recovery/base/progressive/hill）
const QuickThemeEcho = ({ subtype, color = '#F95C4B' }) => {
    const [echo, setEcho] = useState(null);
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const { getRunEchoBySubtype } = await import('../utils/planEcho');
                const hit = getRunEchoBySubtype(getUserId(), subtype);
                if (alive && hit?.bullets?.length) setEcho(hit);
            } catch { /* 回聲屬 nice-to-have */ }
        })();
        return () => { alive = false; };
    }, [subtype]);
    if (!echo) return null;
    return (
        <div className="mt-4 rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.55)', border: `1px solid ${color}55` }}>
            <div className="text-[12px] font-black tracking-[0.22em] mb-2" style={{ color: 'rgba(22,20,21,0.5)' }}>
                上次同款 · Last Time
            </div>
            {(echo.bullets || []).slice(0, 3).map((b, i) => (
                <div key={i} className="flex items-start gap-2 mb-1">
                    <span className="shrink-0 rounded-full" style={{ width: 4, height: 4, background: color, marginTop: 7 }} />
                    <span className="text-[12px] font-semibold flex-1" style={{ color: 'rgba(22,20,21,0.75)', lineHeight: 1.55 }}>{b}</span>
                </div>
            ))}
            <div className="text-[12px] font-black tracking-[0.18em] mt-1.5" style={{ color: 'rgba(22,20,21,0.38)' }}>
                {echo.date ? new Date(echo.date).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }) : ''} · 給今天的你參考
            </div>
        </div>
    );
};

const CardioTrackerMobile = ({ onBack }) => {
    const { data: weather } = useWeather();
    const navigate = useNavigate();
    const location = useLocation();

    /* 🔴 即時一起練：如果現在人在一場裡，把自己的距離推上去，
       同時把夥伴的進度顯示在數據列下面（見 SocialFeed/useLiveSession）。 */
    const liveTogether = useLiveSession();

    // 🔍 Lifecycle Diagnostics
    useEffect(() => {
        console.log('🏗️ [Web] CardioTrackerMobile MOUNTED at:', location.pathname);
        return () => {
            console.log('🗑️ [Web] CardioTrackerMobile UNMOUNTED');
            stopSpeaking(); // 🔊 離開追蹤頁一律停止語音，避免播報延續到結果頁/其他畫面
        };
    }, []);

    // 🔥 Use Recovery Context for global state
    const { startRecovery: contextStartRecovery, updateHeartRate: contextUpdateHR, isRecovering: contextIsRecovering, recoveryTimer: contextRecoveryTimer, skipRecovery: contextSkipRecovery, recoveryCompleted } = useRecovery();

    // ♻️ 本地恢復狀態 — 必須在任何使用它的 useEffect（整公里語音播報等）之前宣告，
    //    否則會觸發 TDZ「Cannot access 'isRecovering' before initialization」讓整頁崩潰。
    const [isRecovering, setIsRecovering] = useState(false);
    const [recoveryTimer, setRecoveryTimer] = useState(60);
    const [recoveryStartHR, setRecoveryStartHR] = useState(null);

    // 🩺 HRR（心率恢復力）真實量測 —
    //    結束跑步後保留 60 秒量測窗，期間持續收手錶心率，形成真實回落曲線。
    //    HRR60 = 停止當下心率 − 第 60 秒心率（越大代表副交感神經恢復越快）。
    //    以前：一按結束就 sendWatchCommand('STOP') 把手錶量測收掉，
    //         再用 getRecoveryStep() 模擬一條假曲線 → 結算頁永遠 0 bpm / LOW。
    const recoveryCurveRef = useRef([]);      // [{ t, hr }] 真實取樣
    const recoveringRef = useRef(false);      // 給非 React 的事件處理器判斷用
    const isTrackingRef = useRef(false);      // 卸載時判斷要不要收掉手錶 session

    // 🔋 低耗電模式（prefers-reduced-motion / 電量 < 20%）→ 關閉光球 morph keyframe
    const isLowPower = useLowPowerMode();

    // Helper for safe formatting
    const safeFixed = (val, digits = 2) => {
        if (val === null || val === undefined || isNaN(Number(val))) return (0).toFixed(digits);
        return Number(val).toFixed(digits);
    };

    // 🩹 J: 單一真相源 → utils/format.js
    const formatDuration = fmtDuration;
    const formatPace = fmtPace;



    const [isTracking, setIsTracking] = useState(false);
    const [startCountdown, setStartCountdown] = useState(null);
    const [isPaused, setIsPaused] = useState(false);
    const [isTransitioning, setIsTransitioning] = useState(false);
    // ⌚ 開跑前「建議佩戴手錶」提示 — 偵測不到手錶才顯示，使用者可關閉（記憶於本次 session）
    const [watchHintDismissed, setWatchHintDismissed] = useState(
        () => sessionStorage.getItem('watch_hint_dismissed') === '1'
    );

    // ❤️ 心率連線狀態提示 — 起跑後依「實際有沒有收到心率」短暫顯示一次：
    //    有心率 → 「已連接手錶 · 心率記錄中」；無心率 → 「未偵測到心率 · 已用 GPS 記錄」。
    //    出現一下下就自動消失（如使用者要求），整場只顯示一次。
    const [hrStatusHint, setHrStatusHint] = useState(null); // null | 'connected' | 'no_hr'
    const hrHintShownRef = useRef(false);

    // 🎯 虛擬教練系統狀態
    const [showTrainingPlans, setShowTrainingPlans] = useState(false);
    const [activePlan, setActivePlan] = useState(null);
    // 🖥️ 全螢幕儀表板模式
    const [dashboardMode, setDashboardMode] = useState(false);
    // 🎯 Cover Flow 雙模式：'quick' = 靜態簡易計劃 / 'plan' = 自己排的週期課表
    const [carouselMode, setCarouselMode] = useState('quick');
    // 🎯 依 Onboarding「意圖」初始化 carousel — 第一眼就停在被推薦的有氧計劃
    //   awake → base / mindfulness → recovery / fat_burn → base / performance → hill
    //   讀取順序：onboarding_${userId}.intent_tag → drvn_recommended_cardio_id
    const recommendedCardioIndex = (() => {
        try {
            const uid = getUserId();
            const raw = localStorage.getItem(`onboarding_${uid}`);
            const intent = raw ? (JSON.parse(raw).intent_tag || '') : '';
            const directId = localStorage.getItem('drvn_recommended_cardio_id') || '';
            const INTENT_TO_CARDIO_ID = {
                awake: 'base', mindfulness: 'recovery', fat_burn: 'base',
                performance: 'hill', routine: 'base',
            };
            const targetId = directId || INTENT_TO_CARDIO_ID[intent] || '';
            const order = ['recovery', 'base', 'progressive', 'hill', 'custom'];
            const idx = order.indexOf(targetId);
            return idx >= 0 ? idx : 0;
        } catch { return 0; }
    })();
    const [carouselIndex, setCarouselIndex] = useState(recommendedCardioIndex);
    const recommendedCardioId = (() => {
        const order = ['recovery', 'base', 'progressive', 'hill', 'custom'];
        return order[recommendedCardioIndex];
    })();

    // 🎯 點擊單一主題後的詳細頁狀態
    const [selectedTheme, setSelectedTheme] = useState(null);
    const [selectedDifficultyIdx, setSelectedDifficultyIdx] = useState(0);
    // 🧱 Bottom-sheet preview for any brick (esp. strength) — 避免直接開練
    const [coverFlowPreviewBrick, setCoverFlowPreviewBrick] = useState(null);
    const [countdownActive, setCountdownActive] = useState(false);
    // 快速訓練四門固定課程 — 課表定義在 utils/quickRunCourses（唯一來源），這裡只配圖
    const TRAINING_THEMES = QUICK_RUN_THEMES;

    // 🎬 Phase 2-C — Cover Flow 動態化：從本週 bricks 生成卡片
    //   有 plan + bricks → 用 buildWeeklyCoverFlowThemes 蓋過靜態 TRAINING_THEMES
    //   沒 plan → fallback 靜態 TRAINING_THEMES（原行為不變）
    //   hook 只在 Cover Flow 開啟時才 fetch，避免無謂 request
    const {
        bricks: thisWeekBricks,
        week: thisWeek,
        plan: runPlan,
        refresh: refreshWeekBricks,
    } = useThisWeekBricks({ enabled: true });

    /* 🎯 這一週沒有課，不代表沒有計劃 —— 判斷收在 utils/runPlanState 裡，
       首頁、中控、這裡要問「他的跑步計劃現在怎樣」都問同一支。 */
    const planState = runPlanState(runPlan, thisWeekBricks);
    const isEmptyPlan = carouselMode === 'plan' && planState !== RUN_PLAN_ACTIVE;
    const planAction = runPlanAction(planState, GOAL_NAMES[runPlan?.goal] || '跑步計劃');
    const planWeekLabel = runPlanWeekLabel(runPlan);
    // 5K 基準：計劃優先，其次本機（跑步中的 RPE 換算也讀本機這份）
    const baselinePace5K = () => {
        const fromPlan = Number(runPlan?.meta?.baseline_pace_5k_sec ?? runPlan?.baseline_pace_5k_sec);
        if (fromPlan > 0) return fromPlan;
        try { return Number(localStorage.getItem('baseline_pace_5k')) || null; } catch (_) { return null; }
    };
    // 計劃磚 → 課表：計劃沒給配速時，輕鬆段用 5K 基準＋課型偏移補上（強度段依體感）
    const planFromBrick = (brick) => {
        const built = buildActivePlanFromBrick(brick, TRAINING_THEMES);
        if (!built || built.targetPaceSec) return built;
        return { ...built, steps: personalizeQuickSteps(built.steps, baselinePace5K()) };
    };

    // ── 週結束偵測：一週的 bricks 全部處理完（完成/略過）→ 跳出「週結算」提示視窗 ──
    const [showWeekSettlePrompt, setShowWeekSettlePrompt] = useState(false);
    const weekKeyForSettle = (d = new Date()) => mondayWeekKey(d);
    useEffect(() => {
        // userId state 在檔案較後面才宣告，這裡直接用 getUserId() 取，避免 TDZ 錯誤。
        const uid = getUserId();
        if (!uid || !thisWeek || !Array.isArray(thisWeekBricks) || thisWeekBricks.length === 0) return;
        // 'partial'（跑了但沒跑滿）也算這堂處理過了 —— 以前只認 completed/skipped，
        // 一週只要有一堂沒跑滿，週結算提示永遠不會跳。
        const isSettled = (b) => b.status === 'completed' || b.status === 'skipped' || b.completed || b.is_completed || b.done || hasBrickActivity(b);
        const allDone = thisWeekBricks.every(isSettled);
        if (!allDone) return;
        const wk = weekKeyForSettle();
        const promptedKey = `run_week_settle_prompted_${uid}_${wk}`;
        // 標記「本週跑步完成」→ 首頁提示列的「跑步週結算」會亮起
        try { localStorage.setItem(`run_week_done_${uid}`, wk); } catch { /* ignore */ }
        // 本週還沒在跑步頁提示過 → 跳出結算視窗（一週只跳一次）
        const seen = localStorage.getItem(`run_settlement_seen_${uid}_${wk}`);
        if (!localStorage.getItem(promptedKey) && !seen) {
            try { localStorage.setItem(promptedKey, '1'); } catch { /* ignore */ }
            setTimeout(() => setShowWeekSettlePrompt(true), 600);
        }
    }, [thisWeek, thisWeekBricks]);

    // 🏃 跑步記憶：現在在哪個跑點（打開課表時定位一次）。
    //    快速訓練：所有人看到「在這裡適合什麼」，會員（依地點排課）適合的課排前面。
    const [runPlaceHere, setRunPlaceHere] = useState(null);
    const runPlaceAskedRef = useRef(false);
    useEffect(() => {
        if (!showTrainingPlans || runPlaceAskedRef.current) return;
        runPlaceAskedRef.current = true;
        import('../utils/nativeLocation')
            .then(({ getOneShotLocation }) => getOneShotLocation({ timeout: 5000 }))
            .then((here) => {
                if (!here) return;
                const place = findRunPlaceNear(loadRunMemory(getUserId()), here);
                if (place && suitedCourses(place).length) setRunPlaceHere(place);
            })
            .catch(() => {});
    }, [showTrainingPlans]);

    const coverFlowThemes = useMemo(() => {
        if (!showTrainingPlans) return TRAINING_THEMES;
        // 🎯 Quick Mode → 原始靜態主題卡（會員：依現在的跑點把適合的課排前面）
        if (carouselMode === 'quick') {
            return runPlaceHere && canUse('placePlans') ? sortCoursesForPlace(TRAINING_THEMES, runPlaceHere) : TRAINING_THEMES;
        }
        // 課表模式 → 本週的訓練磚
        if (!thisWeekBricks || thisWeekBricks.length === 0) return TRAINING_THEMES;
        // ★ v2.4「今天該做的那一張」= 本週第一個還沒做的訓練磚。
        //   它會有呼吸光、預設被選中，點下去直接開那份課表。
        const todayBrick = thisWeekBricks.find(
            (b) => b.status !== 'completed' && b.status !== 'skipped',
        );
        const dynamic = buildWeeklyCoverFlowThemes(thisWeekBricks, TRAINING_THEMES, {
            weekIndex: thisWeek?.week_index || null,
            todayBrickId: todayBrick?.brick_id || null,
        });
        // 「自定義訓練」入口已依需求移除
        return dynamic;
    }, [showTrainingPlans, carouselMode, thisWeekBricks, thisWeek, TRAINING_THEMES, runPlaceHere]);

    // Cover Flow 開啟時，若當前 carouselIndex 超出新 themes 長度則重設
    useEffect(() => {
        if (showTrainingPlans && carouselIndex >= coverFlowThemes.length) {
            setCarouselIndex(0);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showTrainingPlans, coverFlowThemes.length]);

    // 🎯 自動偵測：開啟 Cover Flow 時，若本週有課就自動切到課表模式
    useEffect(() => {
        if (showTrainingPlans) {
            if (thisWeekBricks && thisWeekBricks.length > 0) {
                setCarouselMode('plan');
                // ★ v2.4 一打開就停在「今天該做的那一張」，不要每次都從第一張開始滑
                const idx = thisWeekBricks.findIndex(
                    (b) => b.status !== 'completed' && b.status !== 'skipped',
                );
                setCarouselIndex(idx >= 0 ? idx : 0);
            } else {
                setCarouselMode('quick');
                setCarouselIndex(0);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showTrainingPlans, thisWeekBricks?.length]);

    // 🧱 Phase 2-B — 從 CardioMicrocycleInbox 跳進來時，自動把 brick 轉成 activePlan
    //   location.state.brick 由 inbox 攜帶；轉換失敗時靜默退化為自由跑（不阻擋使用者）
    //   autoStart=true 時，轉換完成後自動觸發 3-2-1-GO! 倒數
    const incomingBrickRef = useRef(null);
    useEffect(() => {
        const brick = location.state?.brick;
        const autoStart = location.state?.autoStart;
        if (!brick || incomingBrickRef.current === brick.brick_id) return;
        const built = planFromBrick(brick);
        if (built) {
            console.log('🧱 [Brick] Auto-loaded brick → plan:', built.title, `(${built.steps.length} steps)`);
            setActivePlan(built);
            incomingBrickRef.current = brick.brick_id;
        } else {
            console.warn('🧱 [Brick] Failed to resolve theme for brick:', brick);
        }
        // 如果帶著 autoStart 旗標（route 模式開練），物件載完後自動倒數
        if (autoStart) {
            setTimeout(() => setCountdownActive(true), 400);
        }
        // 清掉 navigation state 避免 refresh 時重複觸發
        try { window.history.replaceState({}, ''); } catch (_) { }
    }, [location.state]);

    const getCurrentPlanStep = (plan, totalSeconds) => {
        if (!plan || !plan.steps || plan.steps.length === 0) return null;
        let elapsed = 0;
        for (let i = 0; i < plan.steps.length; i++) {
            if (totalSeconds < elapsed + plan.steps[i].duration) {
                return { ...plan.steps[i], index: i, stepRemaining: (elapsed + plan.steps[i].duration) - totalSeconds };
            }
            elapsed += plan.steps[i].duration;
        }
        const lastStep = plan.steps[plan.steps.length - 1];
        return { ...lastStep, index: plan.steps.length - 1, stepRemaining: 0, isFinished: true };
    };

    // 🎯 自定義訓練的狀態與手勢滑動處理
    const [showCustomBuilder, setShowCustomBuilder] = useState(false);
    const [customSteps, setCustomSteps] = useState([
        { name: 'Warm Up', durationMins: 5, targetPaceSecs: 420 },
        { name: 'Run', durationMins: 10, targetPaceSecs: 360 }
    ]);
    const dragStartX = useRef(0);

    const [cardioData, setCardioData] = useState({
        distance: 0.0,
        duration: 0,
        currentPace: 0,
        avgPace: 0,
        elevationGain: 0,
        calories: 0,
        heartRate: 0,
        score: 0,
        splits: []
    });



    // 🏝️ Live Activity（鎖屏卡片 + 靈動島）— 只在跑步進行中存在。
    //    started：START 建立；每 3 秒把最新數據推到鎖屏；暫停/恢復立即刷新；
    //    結束（isTracking=false 且 isPaused=false）→ STOP 收掉。
    const cardioDataLARef = useRef(cardioData);
    useEffect(() => { cardioDataLARef.current = cardioData; }, [cardioData]);
    const liveActivityOnRef = useRef(false);
    const liveActivityVisibilityCleanupRef = useRef(null);
    useEffect(() => {
        const snap = (paused) => ({
            distanceKm: cardioDataLARef.current.distance || 0,
            paceSecPerKm: cardioDataLARef.current.avgPace || 0,
            elapsedSec: cardioDataLARef.current.duration || 0,
            calories: cardioDataLARef.current.calories || 0,
            isPaused: paused,
        });

        let timer = null;
        if (isTracking) {
            if (!liveActivityOnRef.current) {
                liveActivityOnRef.current = true;
                startRunActivity(snap(false));
            } else {
                updateRunActivity(snap(false), { force: true }); // 恢復跑步 → 立即刷新
            }
            timer = setInterval(() => updateRunActivity(snap(false)), 3000);
            // 🏝️ 回到前台立刻補推一次，不讓使用者「點進去才看到新數據」。
            const onVisible = () => {
                if (document.visibilityState === 'visible') updateRunActivity(snap(false), { force: true });
            };
            document.addEventListener('visibilitychange', onVisible);
            liveActivityVisibilityCleanupRef.current = () => document.removeEventListener('visibilitychange', onVisible);
        } else if (isPaused) {
            // 暫停：活動保留，狀態改為已暫停
            if (liveActivityOnRef.current) updateRunActivity(snap(true), { force: true });
        } else {
            // 結束 / 重置：收掉鎖屏卡片
            if (liveActivityOnRef.current) {
                liveActivityOnRef.current = false;
                stopRunActivity(snap(false));
            }
        }
        return () => {
            if (timer) clearInterval(timer);
            if (liveActivityVisibilityCleanupRef.current) {
                liveActivityVisibilityCleanupRef.current();
                liveActivityVisibilityCleanupRef.current = null;
            }
        };
    }, [isTracking, isPaused]);

    // 離開跑步頁（unmount）保險：確保 Live Activity 一定被收掉
    useEffect(() => () => {
        if (liveActivityOnRef.current) {
            liveActivityOnRef.current = false;
            stopRunActivity({
                distanceKm: cardioDataLARef.current.distance || 0,
                paceSecPerKm: cardioDataLARef.current.avgPace || 0,
                elapsedSec: cardioDataLARef.current.duration || 0,
                calories: cardioDataLARef.current.calories || 0,
                isPaused: false,
            });
        }
    }, []);

    // 🔥 Force Simulation State (for Demo/Test)
    const [forceSimulation, setForceSimulation] = useState(() => localStorage.getItem('force_simulation') === 'true');
    const toggleForceSimulation = () => {
        const newValue = !forceSimulation;
        setForceSimulation(newValue);
        localStorage.setItem('force_simulation', String(newValue));
        if (isTracking) resetSession(); // Reset if currently running to avoid data mix-up
    };

    // Cover Flow 中間卡 / 底部 CTA 共用的確認邏輯（Critical #3 修復「點中間卡沒反應」）
    const handleCoverFlowConfirm = useCallback((theme) => {
        if (!theme) return;
        triggerNativeHaptic('heavy');

        // A. 自定義訓練 → 打開 Builder
        if (theme.id === 'custom') {
            setShowCustomBuilder(true);
            return;
        }

        // B. 動態 brick 卡
        if (theme._isBrickCard) {
            if (theme.isCompleted) {
                setShowTrainingPlans(false);
                navigate('/cardio-microcycle-inbox');
                return;
            }
            const pseudoBrick = {
                brick_id: theme.brickId,
                type: theme.brickType,
                subtype: theme.brickSubtype,
                title: theme.title,
                duration_min: theme.durationMin,
                distance_km: theme.distanceKm,
                rpe_band: theme.rpeBand,
                theme_id: null,
            };
            setCoverFlowPreviewBrick(pseudoBrick);
            return;
        }

        // C. 靜態主題 → 打開 detail sheet
        setSelectedTheme(theme);
        setSelectedDifficultyIdx(0);
    }, [navigate]);

    const latestMetricsRef = useRef(cardioData);
    useEffect(() => { latestMetricsRef.current = cardioData; }, [cardioData]);

    // 📍 Phone-side GPS — single source of truth for position, distance, pace, route.
    //    Apple Watch only contributes HR / calories / cadence (see watch-live-metrics).
    //    GPS starts immediately on mount so the map centres on the user's real
    //    location instead of a hard-coded city.
    const wallClockRef = useRef({ lastAt: null, carry: 0 }); // 🕒 真實牆鐘計時（修時間減半）
    const gpsLastPointRef = useRef(null);           // { lat, lng, t }
    const gpsWatchIdRef = useRef(null);
    const [gpsInitialPosition, setGpsInitialPosition] = useState(null);
    // 📶 GPS 訊號品質（水平誤差公尺）— null = 尚未取得定位
    const [gpsAccuracy, setGpsAccuracy] = useState(null);
    const gpsAccuracyRef = useRef(null);
    // 📍 GPS 定位提示：null=正常 / 'denied'=權限被關 / 'nosignal'=長時間沒訊號
    const [gpsPrompt, setGpsPrompt] = useState(null);
    const openLocationSettings = () => {
        try { window.webkit?.messageHandlers?.openSettings?.postMessage(''); } catch (_) {}
    };
    // 📍 定位提示三階段：
    //    1. 進畫面 2 秒還沒定位 → 'acquiring'（中性的「正在獲取位置」，不嚇人）
    //    2. 30 秒仍沒定位 → 'nosignal'（才升級成「搜尋不到訊號」引導排查）
    //    3. 拿到定位 → 全部清掉
    //    之前 15 秒就跳「搜尋不到 GPS」太急 — 其實系統還在正常搜星。
    useEffect(() => {
        if (gpsAccuracy != null) {
            setGpsPrompt(prev => (prev === 'nosignal' || prev === 'acquiring' ? null : prev));
            return;
        }
        const tAcquire = setTimeout(() => setGpsPrompt(prev => prev || 'acquiring'), 2000);
        const tNoSignal = setTimeout(() => setGpsPrompt(prev => (prev == null || prev === 'acquiring') ? 'nosignal' : prev), 30000);
        return () => { clearTimeout(tAcquire); clearTimeout(tNoSignal); };
    }, [gpsAccuracy]);
    // 🔴 Fix(avgPace): 累積配速樣本數，用於 CMA 計算，避免暖身配速永遠佔最高權重
    const paceCountRef = useRef(0);

    // ⏸️ 自動暫停（Auto-pause）— 等紅綠燈 / 綁鞋帶時自動停錶，避免平均配速被汙染。
    //    autoPausedRef：是否「由系統」暫停（區分使用者手動暫停，避免互相覆蓋）。
    //    stationarySinceRef：開始靜止的時間戳；累積 ≥ 門檻才觸發。
    const [autoPauseEnabled, setAutoPauseEnabled] = useState(
        () => localStorage.getItem('cardio_auto_pause') !== 'false' // 預設開啟
    );
    const autoPauseEnabledRef = useRef(autoPauseEnabled);
    useEffect(() => { autoPauseEnabledRef.current = autoPauseEnabled; }, [autoPauseEnabled]);
    const toggleAutoPause = useCallback(() => {
        setAutoPauseEnabled(prev => {
            const next = !prev;
            localStorage.setItem('cardio_auto_pause', String(next));
            if (!next) { // 關閉時若正處於自動暫停，立即解除
                autoPausedRef.current = false;
                stationarySinceRef.current = null;
                setAutoPaused(false);
            }
            return next;
        });
    }, []);
    const autoPausedRef = useRef(false);          // 目前是否處於「自動暫停」狀態
    const stationarySinceRef = useRef(null);      // 開始靜止的時間戳 (ms)
    const [autoPaused, setAutoPaused] = useState(false); // 觸發 UI 顯示「自動暫停中」
    // 極短跑步結束前的二次確認（2026-08 稽核）：{ km, sec, proceed }
    const [shortFinishAsk, setShortFinishAsk] = useState(null);
    const STATIONARY_SPEED = 0.5;   // m/s 以下視為靜止
    const RESUME_SPEED = 0.9;       // m/s 以上視為恢復移動（hysteresis 防抖）
    const STATIONARY_HOLD_MS = 3000; // 靜止持續多久才暫停

    // 🔊 語音播報（Voice cues）— 每跨越一個整公里播報距離/配速/心率。
    //    跑步中看不了螢幕，語音是真正讓即時數據可用的關鍵。
    const [voiceEnabled, setVoiceEnabledState] = useState(() => isVoiceEnabled());
    const lastAnnouncedKmRef = useRef(0);             // 上次已播報到第幾公里
    const lastKmMarkRef = useRef({ km: 0, duration: 0 }); // 上一個整公里時的累積秒數，用來算本公里配速

    // ══════════════════════════════════════════════════════════════════════
    // 🏁 逐公里分段（splits）累積器 — 【實跑模式的唯一真實來源】
    //
    //    過去只有 forceSimulation 分支會 push splits，真實跑步 cardioData.splits
    //    永遠是 []，導致下游（PR/里程碑/最快段/步頻分段/Run Score 續航項）
    //    全部退回 avgPace → 使用者看到「每一公里都一樣配速」。
    //
    //    這個 ref 在 GPS handler 內以純 ref 運算累積，跨越整公里時產出一筆 split：
    //      { km, time, pace, avgHR, cadence, elevGain, timestamp }
    //    時間基準用 cardioData.duration（暫停/自動暫停時不累加），所以停等紅燈
    //    不會被算進該公里的配速。
    // ══════════════════════════════════════════════════════════════════════
    const splitAccRef = useRef({
        distKm: 0,      // 我們自己維護的累積距離（避免 state 延遲）
        startDur: 0,    // 本公里起始的累積秒數
        hrSum: 0, hrN: 0,
        cadSum: 0, cadN: 0,
        elevGain: 0, lastAlt: null,
    });
    const resetSplitAcc = useCallback(() => {
        splitAccRef.current = {
            distKm: 0, startDur: 0,
            hrSum: 0, hrN: 0, cadSum: 0, cadN: 0,
            elevGain: 0, lastAlt: null,
        };
    }, []);
    // 📶 GPS 暖機門檻 — 剛開始定位時 accuracy 常常 >50m，那些點會讓
    //    「第一公里」距離虛胖、配速失真（使用者回報：第一公里數據都超怪）。
    //    誤差大於這個值的點只更新地圖，不計入距離與分段。
    const GPS_ACCURACY_REJECT_M = 40;
    // 人力運動的物理上限：30 m/s ≈ 108 km/h。超過必為定位跳動，不是真的移動。
    // （百米世界紀錄瞬時速度約 12 m/s；下坡單車極速也在 25 m/s 上下。）
    const GPS_MAX_SPEED_MPS = 30;
    const toggleVoice = useCallback(() => {
        setVoiceEnabledState(prev => {
            const next = !prev;
            setVoiceEnabled(next);
            if (!next) stopSpeaking();
            return next;
        });
    }, []);

    // 🛑 結束防誤觸（Hold-to-finish）— 跑者滿身汗、手濕，單擊結束長跑是災難。
    //    改成「長按 1.5 秒」才真正結束：按住期間進度環逐漸填滿 + 階段性震動回饋，
    //    放開即取消。finishHoldProgress 0→1 驅動 UI 環。
    const FINISH_HOLD_MS = 1500;
    const [finishHoldProgress, setFinishHoldProgress] = useState(0);
    const finishHoldRafRef = useRef(null);
    const finishHoldStartRef = useRef(0);
    const finishHapticStepRef = useRef(0);
    // 🛡️ P1 修復：恢復期倒數計時器改用 ref 管理，並在卸載時清掉，
    // 避免使用者在恢復期間切走頁面時，掛在 window.recoveryInterval 的 interval 殘留洩漏。
    const recoveryIntervalRef = useRef(null);

    const cancelFinishHold = useCallback(() => {
        if (finishHoldRafRef.current) {
            cancelAnimationFrame(finishHoldRafRef.current);
            finishHoldRafRef.current = null;
        }
        finishHoldStartRef.current = 0;
        finishHapticStepRef.current = 0;
        setFinishHoldProgress(0);
    }, []);
    // 卸載時清掉長按 RAF + 恢復期 interval，避免殘留洩漏
    useEffect(() => () => {
        if (finishHoldRafRef.current) cancelAnimationFrame(finishHoldRafRef.current);
        if (recoveryIntervalRef.current) { clearInterval(recoveryIntervalRef.current); recoveryIntervalRef.current = null; }
        if (window.recoveryInterval) { clearInterval(window.recoveryInterval); window.recoveryInterval = null; }
    }, []);

    // 🪙 每段實際配速記錄 — 每個 step 結束時計算「該段平均配速」(秒/km)，供進度條回顧上色（鈦三色）
    //    segmentPacesRef.current[stepIndex] = 該段實際平均配速；segStartRef = 當前段起點的累積里程/時間
    const segmentPacesRef = useRef({});
    const segStartRef = useRef({ distance: 0, duration: 0 });
    const [segmentPaces, setSegmentPaces] = useState({}); // 觸發 UI 重繪用

    // 🔴 Watch live-source flag — set true on any incoming watch-live-metrics event.
    //    When true, the local simulation loop only takes biometric values from
    //    the watch (HR/calories) but still calculates GPS/pace/zone locally.
    const watchSourceActiveRef = useRef(false);
    const lastWatchMetricsAtRef = useRef(0);

    // 📍 GPS lifecycle —
    //    A) iOS Native bridge (preferred): WebKit messageHandler "location"
    //       → CoreLocation → nativeBridge.onNativeEvent({type:'locationUpdate', ...})
    //    B) Browser fallback: navigator.geolocation.watchPosition
    //
    //    Triggered on COMPONENT MOUNT (not on isTracking) so the map can
    //    centre+zoom on the user's real location the moment they open the
    //    page — no more world map.

    // Helper: ingest one GPS point into route / distance / pace.
    const ingestGpsPointRef = useRef(null);
    useEffect(() => {
        ingestGpsPointRef.current = (lat, lng, t = Date.now(), alt = null, accuracy = null) => {
            const newPt = { lat, lng };
            const last = gpsLastPointRef.current;

            // Update map centre even before tracking starts
            setGpsInitialPosition(newPt);
            // 💾 記住最後定位，下次一進畫面就能立刻把地圖帶到使用者附近（不必空等第一個 fix）
            try { localStorage.setItem('drvn_lastGPS', JSON.stringify({ lat, lng })); } catch (_) {}

            // 📶 GPS 訊號品質 — accuracy 為水平誤差半徑（公尺），越小越準。
            //    起跑前跑者最焦慮「鎖定了沒」，把它做成 🟢🟡🔴 燈號。
            if (Number.isFinite(accuracy) && accuracy > 0) {
                gpsAccuracyRef.current = accuracy;
                setGpsAccuracy(accuracy);
            }

            if (isTracking && !isPaused) {
                setRoute(prev => [...prev, newPt]);
                if (last) {
                    const R = 6371000;
                    const toRad = (d) => d * Math.PI / 180;
                    const dLat = toRad(lat - last.lat);
                    const dLng = toRad(lng - last.lng);
                    const a = Math.sin(dLat / 2) ** 2
                        + Math.cos(toRad(last.lat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
                    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                    const deltaM = R * c;
                    const dtSec = Math.max(1, (t - last.t) / 1000);
                    const speedMps = deltaM / dtSec;
                    const paceSecPerKm = speedMps > 0.3 ? Math.round(1000 / speedMps) : 0;

                    // ⏸️ 自動暫停判定 — 在累積距離/配速「之前」攔截：
                    //    靜止持續 ≥ 門檻 → 進入自動暫停（凍結里程/配速）；
                    //    自動暫停中偵測到恢復移動 → 自動繼續。
                    if (autoPauseEnabledRef.current) {
                        if (autoPausedRef.current) {
                            // 已自動暫停：等速度回升才恢復
                            if (speedMps >= RESUME_SPEED) {
                                autoPausedRef.current = false;
                                stationarySinceRef.current = null;
                                setAutoPaused(false);
                                triggerNativeHaptic?.('light');
                            } else {
                                // 仍靜止：凍結，不累積里程/配速，但更新 last 供下次計算
                                gpsLastPointRef.current = { lat, lng, t };
                                return;
                            }
                        } else if (speedMps < STATIONARY_SPEED) {
                            // 尚未暫停但開始靜止：起算靜止時間
                            if (stationarySinceRef.current == null) {
                                stationarySinceRef.current = t;
                            } else if (t - stationarySinceRef.current >= STATIONARY_HOLD_MS) {
                                autoPausedRef.current = true;
                                setAutoPaused(true);
                                triggerNativeHaptic?.('medium');
                                gpsLastPointRef.current = { lat, lng, t };
                                return; // 這一點起凍結
                            }
                        } else {
                            // 有在動：清除靜止計時
                            stationarySinceRef.current = null;
                        }
                    }

                    // 📶 GPS 暖機／漂移過濾 — 誤差過大的點不計入距離與分段，
                    //    否則第一公里會被虛胖的距離與亂跳的配速汙染。
                    if (Number.isFinite(accuracy) && accuracy > GPS_ACCURACY_REJECT_M) {
                        gpsLastPointRef.current = { lat, lng, t };
                        return;
                    }

                    /* 🛡️ 跳點防呆 —— 精度過濾擋不住「精度良好但位置瞬移」的點。
                       出隧道、地下道、高樓峽谷重新定位時，GPS 會回報一個
                       accuracy 很漂亮、但距離差好幾百公尺的座標；上面那關放行，
                       這段距離就直接灌進里程，使用者會看到自己「憑空多跑 0.5 km」。
                       以人力運動的物理上限攔截：30 m/s ≈ 108 km/h，
                       任何跑步／單車都不可能達到，只可能是定位跳動。
                       處理方式與精度過濾一致：更新基準點但不累積距離。 */
                    if (speedMps > GPS_MAX_SPEED_MPS) {
                        console.warn('[GPS] 跳點已忽略：',
                            `${deltaM.toFixed(0)}m / ${dtSec.toFixed(1)}s = ${speedMps.toFixed(0)} m/s`);
                        gpsLastPointRef.current = { lat, lng, t };
                        return;
                    }

                    // ══════════════════════════════════════════════════════
                    // 🏁 逐公里分段累積（實跑唯一來源）
                    //    全部用 ref 純運算，不在 setState updater 內做副作用，
                    //    避免 StrictMode 重複執行時分段被記兩次。
                    // ══════════════════════════════════════════════════════
                    const acc = splitAccRef.current;
                    const prevDistKm = acc.distKm;
                    const newDistKm = prevDistKm + deltaM / 1000;
                    acc.distKm = newDistKm;

                    // 本公里的心率 / 步頻 / 爬升取樣
                    const hrNow = latestMetricsRef.current?.heartRate || 0;
                    if (hrNow > 0) { acc.hrSum += hrNow; acc.hrN += 1; }
                    const cadNow = liveCadenceRef.current || 0;
                    if (cadNow > 0) { acc.cadSum += cadNow; acc.cadN += 1; }
                    if (Number.isFinite(alt)) {
                        if (acc.lastAlt != null && alt > acc.lastAlt) acc.elevGain += (alt - acc.lastAlt);
                        acc.lastAlt = alt;
                    }

                    // 跨越整公里 → 產出分段（一個 tick 理論上只跨一公里，迴圈只是保險）
                    const newSplits = [];
                    const durNow = latestMetricsRef.current?.duration || 0;
                    for (let km = Math.floor(prevDistKm) + 1; km <= Math.floor(newDistKm) && km > 0; km++) {
                        // 線性內插出「剛好踩到整公里」的那一刻，避免整段被這個 tick 的長度誤差拉偏
                        const span = Math.max(1e-6, newDistKm - prevDistKm);
                        const f = Math.min(1, Math.max(0, (km - prevDistKm) / span));
                        const durAtCross = Math.max(0, durNow - (1 - f) * dtSec);
                        const splitTime = Math.max(1, Math.round(durAtCross - acc.startDur));
                        newSplits.push({
                            km,
                            time: splitTime,
                            pace: splitTime,                       // 每段 1km → 配速(秒/km) 等於該段秒數
                            avgHR: acc.hrN > 0 ? Math.round(acc.hrSum / acc.hrN) : 0,
                            cadence: acc.cadN > 0 ? Math.round(acc.cadSum / acc.cadN) : 0,
                            elevGain: Math.round(acc.elevGain * 10) / 10,
                            partial: false,
                            timestamp: t,
                        });
                        // 重設累積器，開始記下一公里
                        acc.startDur = durAtCross;
                        acc.hrSum = 0; acc.hrN = 0;
                        acc.cadSum = 0; acc.cadN = 0;
                        acc.elevGain = 0;
                    }

                    // 🔴 Fix(avgPace): 改用累積移動平均 (CMA) 取代二值平均
                    // 舊式: (prev + current) / 2 → 第一個點永遠佔 50% 權重，暖身配速永久拉高均值
                    // 新式: (prevAvg × (n-1) + current) / n → 每個點權重均等，越跑越準
                    if (paceSecPerKm > 0) paceCountRef.current += 1;
                    setCardioData(prev => ({
                        ...prev,
                        distance: Number((prev.distance + deltaM / 1000).toFixed(4)),
                        currentPace: paceSecPerKm || prev.currentPace,
                        avgPace: paceSecPerKm > 0
                            ? Math.round(
                                (prev.avgPace * (paceCountRef.current - 1) + paceSecPerKm)
                                / paceCountRef.current
                            )
                            : prev.avgPace,
                        splits: newSplits.length > 0
                            ? [...(prev.splits || []), ...newSplits]
                            : (prev.splits || []),
                    }));

                    // 🏝️ 由 GPS 回呼驅動 Live Activity 更新 —
                    //    背景定位會讓 app 保持存活並持續回呼，即使 JS 計時器被節流。
                    //    這是「鎖屏卡跑到某分鐘就不動、點進去才更新」的實際解法。
                    //    updateRunActivity 內部有 3 秒節流，不會過度推送。
                    if (liveActivityOnRef.current) {
                        updateRunActivity({
                            distanceKm: acc.distKm,
                            paceSecPerKm: latestMetricsRef.current?.avgPace || 0,
                            elapsedSec: latestMetricsRef.current?.duration || 0,
                            calories: latestMetricsRef.current?.calories || 0,
                            isPaused: false,
                        });
                    }

                    // 📡 即時跑（非模擬）的串流取樣 — 由 GPS 點驅動：寫入 pace / elevation / cadence。
                    //    這樣海拔圖、步頻/步幅卡不再因「沒有串流」而 N/A。
                    if (!forceSimulation) {
                        const s = streamDataRef.current;
                        s.timestamps.push(t);
                        s.pace.push(paceSecPerKm || 0);
                        // 海拔：GPS / native bridge 帶上來的 altitude（公尺）。沒有就補 null 佔位。
                        if (!Array.isArray(s.elevation)) s.elevation = [];
                        s.elevation.push(Number.isFinite(alt) ? Math.round(alt * 10) / 10 : null);
                        // 步頻：來自 DeviceMotion 數步器的即時 spm（cadenceRef）；無感測則 0。
                        if (!Array.isArray(s.cadence)) s.cadence = [];
                        s.cadence.push(liveCadenceRef.current > 0 ? Math.round(liveCadenceRef.current) : 0);
                        // 步幅：手錶 watchOS 量到的（沒有手錶就 0）
                        if (!Array.isArray(s.stride)) s.stride = [];
                        s.stride.push(liveStrideRef.current > 0 ? Math.round(liveStrideRef.current * 100) / 100 : 0);
                    }
                }
            }
            gpsLastPointRef.current = { lat, lng, t };
        };
    }, [isTracking, isPaused, forceSimulation]);

    // 📍 進畫面立刻用「上次定位」把地圖帶到使用者附近，不要停在世界地圖空等第一個 GPS fix。
    //    真正的 fix 幾秒內進來後 SmoothMapUpdater 會再校正到精準位置。
    useEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem('drvn_lastGPS') || 'null');
            if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lng)) {
                setGpsInitialPosition(prev => prev || saved);
            }
        } catch (_) {}
    }, []);

    // (A+B) Mount once — start GPS streaming immediately
    useEffect(() => {
        const hasNative = !!window?.webkit?.messageHandlers?.location;

        // ── (A) Native bridge ─────────────────────────────────────────────
        let prevNativeHandler = null;
        if (hasNative) {
            console.log('[GPS] Using iOS Native bridge (CoreLocation)');
            try {
                window.webkit.messageHandlers.location.postMessage({ command: 'START' });
            } catch (e) {
                console.warn('[GPS] Native START failed:', e);
            }
            prevNativeHandler = window.nativeBridge?.onNativeEvent;
            if (!window.nativeBridge) window.nativeBridge = {};
            window.nativeBridge.onNativeEvent = (jsonStr) => {
                if (prevNativeHandler) prevNativeHandler(jsonStr);
                try {
                    const evt = JSON.parse(jsonStr);
                    // 📍 定位權限被關 / 失敗 → 跳出「前往設定」提示
                    if (evt.type === 'locationError') {
                        const msg = String(evt.error || '').toLowerCase();
                        if (msg.includes('denied') || msg.includes('權限')) setGpsPrompt('denied');
                        return;
                    }
                    if (evt.type === 'locationAuthChanged') {
                        // status: 2=denied 3=restricted（CLAuthorizationStatus）→ 提示；其餘清掉
                        if (evt.status === 2 || evt.status === 3) setGpsPrompt('denied');
                        else setGpsPrompt(null);
                        return;
                    }
                    if (evt.type === 'locationUpdate'
                        && typeof evt.latitude === 'number'
                        && typeof evt.longitude === 'number'
                        && ingestGpsPointRef.current) {
                        // native bridge 可能帶 altitude（CoreLocation altitude，公尺）
                        const nativeAlt = (typeof evt.altitude === 'number') ? evt.altitude : null;
                        // CoreLocation horizontalAccuracy（公尺）；不同殼層可能叫 accuracy
                        const nativeAcc = (typeof evt.horizontalAccuracy === 'number') ? evt.horizontalAccuracy
                            : (typeof evt.accuracy === 'number') ? evt.accuracy : null;
                        ingestGpsPointRef.current(evt.latitude, evt.longitude, Date.now(), nativeAlt, nativeAcc);
                    }
                } catch (_) { }
            };
        }

        // ── (B) Browser fallback — getCurrentPosition + watchPosition ────
        let watchId = null;
        if (!hasNative && navigator.geolocation) {
            console.log('[GPS] Using navigator.geolocation fallback');
            // 🩹 權限被拒（err.code===1）要接進 gpsPrompt='denied' 顯示引導橫幅，
            //    不能只 console.warn — 使用者看不到 console。
            const onGpsError = (err) => {
                console.warn('[GPS] error:', err?.message);
                if (err && err.code === 1) setGpsPrompt('denied');
            };
            navigator.geolocation.getCurrentPosition(
                (pos) => ingestGpsPointRef.current?.(pos.coords.latitude, pos.coords.longitude, Date.now(), pos.coords.altitude, pos.coords.accuracy),
                onGpsError,
                { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
            );
            watchId = navigator.geolocation.watchPosition(
                (pos) => ingestGpsPointRef.current?.(pos.coords.latitude, pos.coords.longitude, Date.now(), pos.coords.altitude, pos.coords.accuracy),
                onGpsError,
                { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
            );
            gpsWatchIdRef.current = watchId;
        }

        // 🔥 Fix #6: 前後台切換保護 — APP 進背景時暫停 watchPosition，回前台重啟
        // 避免背景期間 GPS 斷線但 watchId 仍在，導致跑步距離出現空洞
        const handleVisibility = () => {
            if (document.visibilityState === 'hidden') {
                // APP 進背景：停止 browser GPS（native bridge 由 iOS 系統管理）
                if (!hasNative && watchId != null && navigator.geolocation) {
                    navigator.geolocation.clearWatch(watchId);
                    watchId = null;
                    gpsWatchIdRef.current = null;
                }
            } else if (document.visibilityState === 'visible') {
                // APP 回前台：重啟 browser GPS
                if (!hasNative && navigator.geolocation && gpsWatchIdRef.current == null) {
                    watchId = navigator.geolocation.watchPosition(
                        (pos) => ingestGpsPointRef.current?.(pos.coords.latitude, pos.coords.longitude, Date.now(), pos.coords.altitude, pos.coords.accuracy),
                        (err) => { /* silent: GPS 重連失敗不崩潰 */ void err; },
                        { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
                    );
                    gpsWatchIdRef.current = watchId;
                }
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
            // Clean up bridge chain
            if (hasNative) {
                try {
                    window.webkit.messageHandlers.location.postMessage({ command: 'STOP' });
                } catch (_) { }
                if (window.nativeBridge) {
                    window.nativeBridge.onNativeEvent = prevNativeHandler;
                }
            }
            if (watchId != null && navigator.geolocation) {
                navigator.geolocation.clearWatch(watchId);
            }
            gpsWatchIdRef.current = null;
        };
    }, []);

    // 🔆 螢幕常亮（Wake Lock）— 跑步進行中讓螢幕不自動鎖，跑者隨時抬手即可看數據。
    //    沿用 restCues.js 既有的 navigator.wakeLock 封裝（重訓頁也用同一套）。
    //    取得時機：開始追蹤（且非暫停）。釋放時機：結束 / 暫停 / 元件卸載。
    //    系統會在切背景時自動釋放 Wake Lock，故回前台（visible）時重新取得。
    useEffect(() => {
        const shouldHold = isTracking && !isPaused;
        if (shouldHold) {
            requestWakeLock();
        } else {
            releaseWakeLock();
        }

        // 回前台時系統可能已釋放 → 重新取得
        const reacquire = () => {
            if (document.visibilityState === 'visible' && isTracking && !isPaused) {
                requestWakeLock();
            }
        };
        document.addEventListener('visibilitychange', reacquire);

        return () => {
            document.removeEventListener('visibilitychange', reacquire);
            releaseWakeLock();
        };
    }, [isTracking, isPaused]);

    // ❤️ 心率連線狀態提示 — 起跑後 6 秒檢查一次真實心率狀態，短暫提示後自動消失。
    //    依「實際 cardioData.heartRate」判斷，不是只看裝置能力，這樣才反映真實連線狀況。
    useEffect(() => {
        if (!isTracking) { hrHintShownRef.current = false; return; }
        if (hrHintShownRef.current) return;
        const t = setTimeout(() => {
            hrHintShownRef.current = true;
            const connected = (cardioData.heartRate > 0) || watchSourceActiveRef.current;
            setHrStatusHint(connected ? 'connected' : 'no_hr');
            // 顯示一下下就消失：已連接 2.5 秒、無心率多給一點時間讀（4 秒）
            setTimeout(() => setHrStatusHint(null), connected ? 2500 : 4000);
        }, 6000);
        return () => clearTimeout(t);
    }, [isTracking]);

    // 🔊 跑步一停(結束/暫停/進入恢復)就立刻停語音，不讓上一句播報延續下去。
    useEffect(() => {
        if (!isTracking || isRecovering) stopSpeaking();
    }, [isTracking, isRecovering]);

    /* 🔴 把自己的距離推給一起練的夥伴。
       每 10 秒一次就夠 —— 距離不是毫秒級的東西，推太密只是白費電和流量。
       暫停時不推：畫面上會顯示「失去連線」，那才是事實（人確實停了）。 */
    useEffect(() => {
        if (!liveTogether.inSession || !isTracking || isPaused) return undefined;
        // 讀 ref 不讀 state：interval 只建立一次，直接抓 state 會永遠推到建立當下的舊值
        const push = () => liveTogether.report(
            Number(latestMetricsRef.current?.distance) || 0,
            isRecovering ? '恢復中' : undefined,
        );
        push();
        const t = setInterval(push, 10000);
        return () => clearInterval(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [liveTogether.inSession, isTracking, isPaused, isRecovering]);

    // 🔊 整公里語音播報 — 每跨越一個整公里就念出「第 N 公里，本公里配速 X，平均心率 Y」。
    //    用 lastAnnouncedKmRef 去重，避免 distance 抖動造成重複播報。
    useEffect(() => {
        if (!isTracking || isPaused || isRecovering || !voiceEnabled) return;
        const km = Math.floor(cardioData.distance);
        if (km >= 1 && km > lastAnnouncedKmRef.current) {
            // 本公里配速 = (本公里結束時的累積秒數 − 上個整公里的累積秒數) / 跨越的公里數
            const prevMark = lastKmMarkRef.current;
            const kmSpan = km - prevMark.km;
            const durSpan = cardioData.duration - prevMark.duration;
            const lastKmPaceSec = kmSpan > 0 && durSpan > 0 ? Math.round(durSpan / kmSpan) : null;

            const text = buildKmAnnouncement({
                km,
                avgPaceSec: cardioData.avgPace,
                lastKmPaceSec,
                avgHr: cardioData.heartRate,
            });
            speak(text);

            lastAnnouncedKmRef.current = km;
            lastKmMarkRef.current = { km, duration: cardioData.duration };
        }
    }, [cardioData.distance, cardioData.duration, cardioData.avgPace, cardioData.heartRate, isTracking, isPaused, isRecovering, voiceEnabled]);

    // 🦶 DeviceMotion 步頻偵測 — 用手機加速度計數步，推算即時步頻 (spm)
    //    原理：合加速度的峰值 = 一步落地。用簡單的峰值偵測 + 不應期(min interval)
    //    過濾雜訊，再用最近數步的時間間隔換算每分鐘步數。
    //    無感測器 / 未授權 → liveCadenceRef 維持 0，分析頁自動回退 pace 反推。
    useEffect(() => {
        if (!isTracking || isPaused) return;
        if (typeof window === 'undefined' || typeof window.DeviceMotionEvent === 'undefined') return;

        const stepTimes = [];          // 最近落地時間戳 (ms)
        let lastStepAt = 0;
        let gravity = 9.81;            // 低通濾出的重力基線
        const MIN_STEP_MS = 250;       // 不應期：>240spm 視為雜訊
        const PEAK_THRESHOLD = 1.6;    // 超過重力基線多少 m/s² 算一步

        const onMotion = (e) => {
            const a = e.accelerationIncludingGravity || e.acceleration;
            if (!a) return;
            const mag = Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2);
            // 低通追蹤重力，動態去除靜態分量
            gravity = gravity * 0.9 + mag * 0.1;
            const linear = mag - gravity;
            const now = Date.now();
            if (linear > PEAK_THRESHOLD && (now - lastStepAt) > MIN_STEP_MS) {
                lastStepAt = now;
                stepTimes.push(now);
                // 只保留最近 3 秒的步伐來算即時步頻
                while (stepTimes.length > 1 && now - stepTimes[0] > 3000) stepTimes.shift();
                if (stepTimes.length >= 2) {
                    const span = (stepTimes[stepTimes.length - 1] - stepTimes[0]) / 1000;
                    const spm = span > 0 ? ((stepTimes.length - 1) / span) * 60 : 0;
                    // clamp 到合理跑步區間，避免抖動爆值
                    liveCadenceRef.current = Math.max(0, Math.min(220, Math.round(spm)));
                }
            }
        };

        let attached = false;
        const attach = () => {
            if (attached) return;
            window.addEventListener('devicemotion', onMotion);
            attached = true;
        };

        // iOS 13+ 需要使用者手勢觸發的權限請求；START 按鈕已是手勢，這裡直接嘗試。
        // 🔒 只在「還沒授權過」時才叫 requestPermission → 授權過就直接 attach，
        //    避免每次開啟 / 每次開始都又彈一次「Access Motion and Orientation」。
        const DME = window.DeviceMotionEvent;
        let motionGranted = false;
        try { motionGranted = localStorage.getItem('drvn_motion_granted') === '1'; } catch { /* */ }
        if (typeof DME.requestPermission === 'function' && !motionGranted) {
            DME.requestPermission().then((state) => {
                if (state === 'granted') {
                    try { localStorage.setItem('drvn_motion_granted', '1'); } catch { /* */ }
                    attach();
                }
            }).catch(() => { /* 拒絕或非手勢情境：靜默回退 pace 反推 */ });
        } else {
            attach();
        }

        return () => {
            if (attached) window.removeEventListener('devicemotion', onMotion);
            liveCadenceRef.current = 0;
        };
    }, [isTracking, isPaused]);

    const startButtonRef = useRef(null);
    const startButtonHandledRef = useRef(false); // ✅ 防止重疊觸發

    const [route, setRoute] = useState([]);
    const streamDataRef = useRef({
        timestamps: [],
        heart_rate: [],
        pace: [],
        elevation: [],
        cadence: []
    });
    // 🦶 即時步頻（spm）— 由 DeviceMotion 數步器持續更新，GPS 取樣時讀取
    const liveCadenceRef = useRef(0);
    const liveStrideRef = useRef(0);   // 手錶量到的步幅（m），GPS 取樣時寫進串流

    const [showMap, setShowMap] = useState(true);
    const [showResults, setShowResults] = useState(() => location.state?.showResults || false);
    const [showSavedOverlay, setShowSavedOverlay] = useState(false);
    const [workoutSummary, setWorkoutSummary] = useState(() => location.state?.cardioData || null); // Renamed from cardioData to workoutSummary
    const [showHistory, setShowHistory] = useState(false);
    const [showTrends, setShowTrends] = useState(false);
    const [showSegmentExplorer, setShowSegmentExplorer] = useState(false);
    const [mapStyle, setMapStyle] = useState('minimal');
    const [showCardioPlan, setShowCardioPlan] = useState(false);
    const [selectedIntent, setSelectedIntent] = useState(null); // 🔥 New Intent State
    const [isFollowing, setIsFollowing] = useState(true);

    const [selectedSegmentIds, setSelectedSegmentIds] = useState([]);
    const [availableSegments, setAvailableSegments] = useState([]);
    const [showSegmentSelector, setShowSegmentSelector] = useState(false);
    const [showTargetSelector, setShowTargetSelector] = useState(false);
    const [targetScore, setTargetScore] = useState(null);
    const [targetType, setTargetType] = useState(null);

    const [availableShoes, setAvailableShoes] = useState([]);
    const [selectedShoe, setSelectedShoe] = useState(null);
    const [showInfoModal, setShowInfoModal] = useState(false); // 🔥 Info Modal State
    const [showMoreMenu, setShowMoreMenu] = useState(false); // ⚙️ Toolbar More Drawer (Portal + 液態融合)
    const [moreMenuPos, setMoreMenuPos] = useState({ top: 0, right: 0, btnW: 40 });
    const moreButtonRef = useRef(null);

    // 開啟 More 時抓取按鈕位置，讓 portal 下拉精準對齊在 ⋯ 按鈕正下方
    useEffect(() => {
        if (!showMoreMenu) return;
        const update = () => {
            if (!moreButtonRef.current) return;
            const rect = moreButtonRef.current.getBoundingClientRect();
            setMoreMenuPos({
                top: rect.bottom + 8,
                right: window.innerWidth - rect.right,
                btnW: rect.width,
            });
        };
        update();
        window.addEventListener('resize', update);
        window.addEventListener('scroll', update, true);
        return () => {
            window.removeEventListener('resize', update);
            window.removeEventListener('scroll', update, true);
        };
    }, [showMoreMenu]);

    // 💡 Saved Route State
    const [showRouteSelector, setShowRouteSelector] = useState(false);
    const [showShoeSelector, setShowShoeSelector] = useState(false);
    const [selectedSavedRoute, setSelectedSavedRoute] = useState(null);
    const [routeFocusWaypoints, setRouteFocusWaypoints] = useState(null); // triggers map flyToBounds

    // 🟢 運動模式選擇（GEAR 左邊）— 跑步以外的有速度運動。
    //    hasElevation: 需要海拔的運動才在面板/儀表板顯示海拔。noGps: 室內（游泳）不畫地圖。
    // 🏃 冷啟動一律回到「跑步」——不再記住上次的自行車，避免關掉 app 再開、點計劃卻自動變自行車。
    //    （selectedSport 仍會在本次 session 內用 setSelectedSport 切換，只是不跨啟動記憶。）
    const [selectedSport, setSelectedSport] = useState('run');
    const [showSportSelector, setShowSportSelector] = useState(false);
    // 🟢 追蹤面板基本維持 3 欄(時間/配速/里程)，爬升欄改成「展開才顯示」，避免 4 欄擠在一起。
    const [showElevationMetric, setShowElevationMetric] = useState(false);
    const handleSelectSport = (id) => {
        setSelectedSport(id);
        localStorage.setItem('drvn_selected_sport', id);
        setShowSportSelector(false);
        triggerNativeHaptic('light');
    };
    const sportMeta = SPORTS.find(s => s.id === selectedSport) || SPORTS[0];
    const sportNeedsElevation = !!sportMeta.hasElevation;

    // 🔴 零模擬數據：原兩條假「儲存路線」已移除 — 路線清單只顯示真實跑過的 availableSegments
    const MOCK_SAVED_ROUTES = [];

    const [showGrowthReport, setShowGrowthReport] = useState(false);
    const [growthData, setGrowthData] = useState(null);
    const [showSaveConfirm, setShowSaveConfirm] = useState(false);
    // 💯 RPE Post-Run Form — 跑完強制彈，使用者輸入主觀感受
    //    寫入後 → 自動 POST 到後端 → evaluateWeek() 依此決定下週是否 Demote
    const [showRpeForm, setShowRpeForm] = useState(false);
    const [lastRpeValue, setLastRpeValue] = useState(null);
    const [hasConfirmedSave, setHasConfirmedSave] = useState(false);

    const [baseline, setBaseline] = useState(() => {
        const saved = localStorage.getItem('user_baseline');
        return saved ? Number(saved) : 40;
    });

    const [heartRateZones, setHeartRateZones] = useState(null);
    const [currentZone, setCurrentZone] = useState(1);
    const [showBreathingAura, setShowBreathingAura] = useState(false);
    const [workoutHistory, setWorkoutHistory] = useState([]);

    // 🎉 今天是否已經跑過 → 輪播條上的計劃卡切成慶祝態（8 秒）。
    //    直接沿用 dailyAgenda 的 applyTodayRealDone 摘要邏輯（單一真相源），
    //    不要在這裡重寫一份「今天有沒有跑」的判斷。
    const todayRunSummary = useMemo(() => {
        try {
            const a = applyTodayRealDone(
                { todayIdx: 0, week: [{ strength: null, run: null, warnings: [] }] },
                { cardioSessions: workoutHistory }
            );
            return a?.todayRunDone || null;
        } catch { return null; }
    }, [workoutHistory]);

    const isFinalizingRef = useRef(false);
    // 🛡 防重複存檔：一次跑步只允許寫入後端一次。避免 generateAndSetData 與
    //    CardioResultsMobile 自動存檔同時觸發，造成歷史出現 2~3 張重複卡片。
    const hasSavedToBackendRef = useRef(false);

    // ✅ 🌟 Surgery 3: 監聽 Apple Watch 跑步結算摘要，自動計算進階指標並存檔
    //
    // 🛡️ 去重機制 (processedWatchTsRef):
    //    Apple Watch 透過 sendMessage + transferUserInfo 兩條路徑送 payload
    //    給 iPhone（任一條失敗時走另一條），有時兩條都成功 → 同一筆 summary
    //    會觸發兩次 'watch-cardio-summary'。再加上 App.jsx 的 navigate(state)
    //    路徑，可能瞬間有 2~3 次處理。用 watch.timestamp（毫秒）當鍵，
    //    5 秒內看到相同 timestamp 直接略過，避免 history 出現複本。
    const processedWatchTsRef = useRef(new Map());
    useEffect(() => {
        const handleWatchSummary = (e, externalPayload) => {
            // externalPayload 用於從 location.state.cardioData 走進來時直接呼叫
            const detail = externalPayload || e?.detail || {};
            const d = detail.watchSummaryPayload || detail;
            console.log('[CardioTracker] ⌚ Watch cardio summary received:', d);

            // 同時相容三種格式：
            //   (a) {watchSummaryPayload: {stats: {...}}}            ← Watch 新版 (最常見)
            //   (b) {stats: {...}, route, stream_data, ...}            ← 已展開
            //   (c) {duration, distance, calories, avgHR, ...}          ← 舊平層
            const stats = d.stats || d || {};

            const durationSec = stats.duration ?? stats.duration_seconds ?? d.duration ?? d.duration_seconds ?? 0;
            // 新 Watch payload 的 distance 是 KM；保留舊版（公尺）的 sanity check
            const rawDist = stats.distance_km ?? stats.distance ?? d.distance_km ?? d.distance ?? 0;
            const distanceKm = rawDist > 100 ? rawDist / 1000 : rawDist;
            const rawCalories = stats.calories ?? d.calories ?? 0;
            const calories = rawCalories > 0 ? Math.ceil(rawCalories) : 0;
            const avgHR = Math.round(stats.avgHR ?? d.avgHR ?? 0);
            const avgPace = stats.avgPace ?? stats.pace_per_km ?? stats.pace ?? d.avgPace ?? d.pace_per_km ?? 0;
            const score = stats.score ?? d.score ?? 0;
            const zoneStats = stats.zoneStats ?? d.zoneStats ?? {};
            const splits = stats.splits ?? d.splits ?? [];

            // 🛡️ Dedup：以 watch timestamp 為鍵
            const watchTs = d.timestamp || externalPayload?.timestamp || Date.now();
            const now = Date.now();
            // 清掉超過 60 秒的舊紀錄，避免 ref Map 無限變大
            for (const [ts, t0] of processedWatchTsRef.current) {
                if (now - t0 > 60_000) processedWatchTsRef.current.delete(ts);
            }
            if (processedWatchTsRef.current.has(watchTs)) {
                console.log(`[CardioTracker] ⌚ Skip duplicate watch summary (ts=${watchTs})`);
                return;
            }
            processedWatchTsRef.current.set(watchTs, now);

            // 組裝給 CardioResultsMobile / RunningAnalysisMobile 使用的完整 cardioData
            const watchCardioData = {
                sessionId: `watch_${watchTs}`,
                stats: {
                    distance: distanceKm,
                    distance_km: distanceKm,
                    duration: durationSec,
                    duration_seconds: durationSec,
                    avgPace,
                    pace_per_km: avgPace,
                    calories,
                    score,
                    zoneStats,
                    avgHR,
                    heartRate: Math.round(stats.heartRate ?? avgHR ?? 0),
                    splits,
                },
                route: d.route || d.route_data || [],
                stream_data: d.stream_data || { timestamps: [], heart_rate: [], pace: [], elevation: [] },
                source: 'appleWatch',
                type: d.type || 'running',
                timestamp: watchTs,
                userId: d.userId || localStorage.getItem('userId') || ''
            };

            // 1. 補齊前端專屬的 deepData (讓 CardioResultsMobile 不會報錯)
            const durationMin = Math.max(0.1, durationSec / 60);
            const effortDensity = (score / durationMin).toFixed(1);
            let recHours = Math.max(4, Math.min(48, Math.round(score / 5)));

            // 🫀 v2：EF / 去耦合改用「手錶真實串流」現算 — 舊版寫死 EF "0.00"、HRR 0，
            //    手錶跑完的結算頁會顯示假的 0 值。無有效串流 → null（結果頁誠實顯示）。
            const wHR = (d.stream_data?.heart_rate || []).map(Number).filter((h) => h > 40 && h < 230);
            const wPace = (d.stream_data?.pace || []).map(Number).filter((p) => p > 60 && p < 3600);
            const wHasHR = wHR.length > 5;
            let wEF = null, wDecoupling = null;
            if (wHasHR && wPace.length > 5) {
                const efOf = (hrArr, pArr) => {
                    const h = hrArr.reduce((a, b) => a + b, 0) / hrArr.length;
                    const p = pArr.reduce((a, b) => a + b, 0) / pArr.length;
                    return h > 0 && p > 0 ? ((1000 / p) * 60) / h : 0;
                };
                const efAll = efOf(wHR, wPace);
                if (efAll > 0) wEF = efAll.toFixed(2);
                const hMid = Math.floor(wHR.length / 2), pMid = Math.floor(wPace.length / 2);
                const ef1 = efOf(wHR.slice(0, hMid), wPace.slice(0, pMid));
                const ef2 = efOf(wHR.slice(hMid), wPace.slice(pMid));
                if (ef1 > 0 && ef2 > 0) {
                    wDecoupling = {
                        value: Number((((ef1 - ef2) / ef1) * 100).toFixed(1)),
                        first_half_ef: ef1.toFixed(2),
                        second_half_ef: ef2.toFixed(2),
                    };
                }
            }
            const zoneHasData = Object.values(zoneStats || {}).some((v) => Number(v) > 0);

            watchCardioData.deepData = {
                deep_metrics: {
                    effort_density: Number(effortDensity),
                    anaerobic_ratio: calculateAnaerobicRatio(zoneStats),
                    recovery_hours: recHours,
                    zone_distribution: zoneStats,
                    // 手錶的 zone 秒數來自真實心率；沒有就標 none（結果頁顯示誠實空狀態）
                    zone_source: zoneHasData ? 'heart_rate' : 'none'
                },
                achievements: {
                    milestone_markers: calculateMilestoneAchievements(splits, watchCardioData.route, workoutHistory),
                    has_overall_pr: false
                },
                physio_metrics: {
                    hr_data_available: wHasHR,
                    ef: { current: wEF, avg_hr: wHasHR ? Math.round(wHR.reduce((a, b) => a + b, 0) / wHR.length) : null },
                    // HRR 需要「停止後」的量測，手錶結算當下沒有冷卻段 → null（不再假裝 0）
                    hrr: { value: null, curve: [], recovery_completed: true },
                    decoupling: wDecoupling || { value: null, first_half_ef: null, second_half_ef: null }
                }
            };

            // 2. 顯示結算畫面
            setWorkoutSummary(watchCardioData);
            setShowResults(true);

            // 3. 🚀 自動寫入 LocalStorage 與後端 (唯一存檔點，iOS 端已停止 native save)
            saveWorkoutData(watchCardioData);

            // 4. 更新前端的歷史紀錄 State
            const newRecord = {
                effort_score: score,
                type: watchCardioData.type,
                timestamp: watchCardioData.timestamp,
                distance_km: distanceKm,
                splits: splits
            };
            setWorkoutHistory(prev => {
                const updated = [...prev, newRecord];
                localStorage.setItem('workout_history', JSON.stringify(updated));
                return updated;
            });

            // 5. 如果有綁定跑鞋，增加里程
            if (selectedShoe) addMileageToCurrentShoe(distanceKm);
        };

        const handleWatchSaved = () => {
            console.log('[CardioTracker] ⌚ watch-workout-saved — history will refresh on next open');
        };

        // ⌚ LIVE metrics from Watch — HR / calories / cadence / elevation / stride.
        //    GPS, pace, distance, zone, duration are all calculated on the
        //    phone (single source of truth). Watch is a biometric + 動作感測來源。
        const handleWatchLiveMetrics = (e) => {
            const m = e?.detail || {};
            if (!m || typeof m !== 'object') return;

            watchSourceActiveRef.current = true;
            lastWatchMetricsAtRef.current = Date.now();

            const hr = Number(m.heartRate) || 0;
            const cal = Number(m.calories) || 0;
            // 🦶 手錶送來的真實步頻最準 → 覆蓋 DeviceMotion 估值，供 GPS 取樣 / stream 共用
            const cadence = Number(m.cadence) || 0;
            // 🦶 手錶 watchOS 直接量測的步幅（runningStrideLength）— 比 pace/cadence 反推準
            const stride = Number(m.stride) || 0;
            if (cadence > 0) liveCadenceRef.current = cadence;
            if (stride > 0) liveStrideRef.current = stride;

            /* 串流只有一個寫入者：GPS 取樣寫 timestamps/pace/elevation/cadence/stride，
               每秒的計時迴圈寫 heart_rate/hr_timestamps（讀的就是這裡更新的心率）。
               以前手錶事件也往同一組陣列塞一筆 —— 兩個來源、兩種時間軸，
               陣列長度對不上，還把「開跑前預熱」和「暫停中」的心率一起存進去。
               這裡只更新最新值，交給那兩個（只在跑步中、沒暫停時才跑的）寫入者。 */

            // 🩺 恢復期（結束後 60 秒量測窗）：把手錶送來的「真實」心率記進恢復曲線。
            //    這是 HRR（Heart Rate Recovery）唯一合法的資料來源 —— 以前這裡不收，
            //    結算頁的 HRR 只能顯示 0 / LOW（使用者截圖圖六）。
            if (hr > 0 && recoveringRef.current) {
                recoveryCurveRef.current.push({ t: Date.now(), hr });
            }

            setCardioData(prev => ({
                ...prev,
                heartRate: hr > 0 ? hr : prev.heartRate,
                calories: cal > 0 ? cal : prev.calories,
                cadence: cadence > 0 ? cadence : prev.cadence,
                // ⚠️ zoneStats 不在這裡累加 —— 手錶事件不是每秒一次，
                //    +1/event 會讓區間秒數完全失真（單一真相源改為 wall-clock 迴圈）。
            }));
        };

        window.addEventListener('watch-cardio-summary', handleWatchSummary);
        window.addEventListener('watch-workout-saved', handleWatchSaved);
        window.addEventListener('watch-live-metrics', handleWatchLiveMetrics);

        // ⌚ 處理「使用者不在 cardio-tracker 時按 DONE → App.jsx 把資料塞進
        //    location.state 後 navigate 過來」的情境：在掛載時把 state 當成
        //    一個 watch 事件來處理（dedup 會擋掉真正觸發 listener 的二度
        //    呼叫，所以不會重複存檔）。
        if (location.state?.fromWatch && location.state?.cardioData) {
            console.log('[CardioTracker] ⌚ Received cardio data via location.state from App.jsx');
            handleWatchSummary(null, location.state.cardioData);
        }

        return () => {
            window.removeEventListener('watch-cardio-summary', handleWatchSummary);
            window.removeEventListener('watch-workout-saved', handleWatchSaved);
            window.removeEventListener('watch-live-metrics', handleWatchLiveMetrics);
        };
    }, [workoutHistory, selectedShoe]); // ✅ 記得把依賴項加進來

    // ✅ Navigation Pre-cleanup: Silence intervals before React Router unmounts
    useEffect(() => {
        const handleNavAway = () => {
            console.log('🛑 [Web] Stopping intervals before nav...');
            setIsTracking(false);
            setIsPaused(false);
            setIsRecovering(false);
            if (window.recoveryInterval) {
                clearInterval(window.recoveryInterval);
                window.recoveryInterval = null;
            }
            recoveryIntervalRef.current = null;
        };

        window.addEventListener('nav-will-change', handleNavAway);
        return () => window.removeEventListener('nav-will-change', handleNavAway);
    }, []);

    useEffect(() => {
        const originalBodyBg = document.body.style.backgroundColor;
        const originalBodyImg = document.body.style.backgroundImage;
        const originalBodySize = document.body.style.backgroundSize;
        const originalBodyPos = document.body.style.backgroundPosition;
        const originalBodyAttachment = document.body.style.backgroundAttachment;
        const originalHtmlBg = document.documentElement.style.backgroundColor;

        // Force full transparency on root tags so the fixed background div shows
        document.body.style.backgroundColor = 'transparent';
        document.body.style.backgroundImage = 'none';
        document.documentElement.style.backgroundColor = 'transparent';
        document.documentElement.style.backgroundImage = 'none';

        return () => {
            document.body.style.backgroundColor = originalBodyBg;
            document.body.style.backgroundImage = originalBodyImg;
            document.documentElement.style.backgroundColor = originalHtmlBg;
        };
    }, []);

    // --- Effects ---
    const fetchSegments = async () => {
        try {
            let lat = 25.033;
            let lng = 121.565;

            // 🔧 改走原生橋接優先（iOS 打包版避免 file:// 下的 web 定位提示與失敗），取不到就用預設座標
            const coords = await getOneShotLocation({ timeout: 5000 });
            if (coords) {
                lat = coords.lat;
                lng = coords.lng;
            }

            console.log(`Fetching segments near: ${lat}, ${lng}`);
            const response = await apiClient.get(`/api/segments/nearby?lat=${lat}&lng=${lng}&radius=10`);
            const segments = response.data.segments || [];
            setAvailableSegments(segments);
        } catch (error) {
            // ✅ 改進錯誤處理：不阻止應用運行
            console.warn('Failed to fetch segments, using empty array:', error);
            setAvailableSegments([]);
        }
    };

    useEffect(() => {
        // ✅ 安全初始化，不因 API 失敗而導致應用崩潰
        const initializeData = async () => {
            try {
                // 1. 嘗試獲取 Segments
                try {
                    await fetchSegments();
                } catch (e) {
                    console.warn('Segments unavailable:', e);
                    setAvailableSegments([]);
                }

                // 2. 載入鞋類數據 (Local Storage 為主) — 排除已退役裝備
                const shoes = getShoes().filter(s => !s.retired);
                setAvailableShoes(shoes);
                const current = getCurrentShoe();
                if (current && !current.retired) setSelectedShoe(current);

                // 3. 獲取用戶年齡並計算心率區間
                try {
                    const age = await fetchUserAge();
                    // 沒年齡就不給心率區間 —— 用 26 歲算出來的區間會直接誤導訓練強度
                    const zones = age > 0 ? calculateHeartRateZones(age) : null;
                    setHeartRateZones(zones);
                } catch (e) {
                    console.warn('沒有年齡，不顯示心率區間：', e);
                    const zones = null;
                    setHeartRateZones(zones);
                }

                // 4.5 Reset baseline if it's the old default (80)
                const savedBaseline = localStorage.getItem('user_baseline');
                if (savedBaseline === '80' || savedBaseline === null) {
                    localStorage.setItem('user_baseline', '40');
                    setBaseline(40);
                }

                // 4. 加載歷史紀錄 — 本地快取先上，再用「後端真實歷史」補齊。
                //    🩹 v2：舊版只讀 localStorage，換手機/重裝後歷史是空的 →
                //    calculateMilestoneAchievements 永遠「本場無新紀錄」。
                //    現在合併後端 runs（含 splits），PR 名次比對才有真實依據。
                const savedHistory = localStorage.getItem('workout_history');
                if (savedHistory) setWorkoutHistory(JSON.parse(savedHistory));
                try {
                    const uid = localStorage.getItem('userId');
                    if (uid) {
                        const resp = await getCardioRuns(uid, 200);
                        const backendRuns = (Array.isArray(resp) ? resp : (resp?.runs || []))
                            .map((r) => ({
                                effort_score: r.metrics?.score || 0,
                                type: 'running',
                                timestamp: r.date || r.timestamp,
                                distance_km: Number(r.distance ?? r.stats?.distance ?? 0),
                                splits: r.metrics?.splits || r.stats?.splits || [],
                            }))
                            .filter((r) => r.distance_km > 0);
                        if (backendRuns.length > 0) {
                            setWorkoutHistory((prev) => {
                                // 以 timestamp+distance 去重（本地與後端同一筆不重複計）
                                const seen = new Set(prev.map((p) => `${p.timestamp}_${p.distance_km}`));
                                const merged = [...prev];
                                backendRuns.forEach((b) => {
                                    if (!seen.has(`${b.timestamp}_${b.distance_km}`)) merged.push(b);
                                });
                                return merged;
                            });
                        }
                    }
                } catch (e) {
                    console.warn('[Tracker] 後端跑步歷史載入失敗（PR 比對將只用本地快取）:', e?.message);
                }
            } catch (error) {
                console.error('Core data initialization failed:', error);
            }
        };

        initializeData();
    }, []); // 💡 移除 fetchSegments 依賴以避免重複調用

    // --- Helper Functions ---
    const resetSession = () => {
        setIsTracking(false);
        setIsPaused(false);
        paceCountRef.current = 0; // 🔴 Fix(avgPace): 重置 CMA 樣本計數器
        // 🪙 重置每段配速記錄
        segmentPacesRef.current = {};
        segStartRef.current = { distance: 0, duration: 0 };
        setSegmentPaces({});
        setCardioData({
            distance: 0.0,
            duration: 0,
            currentPace: 0,
            avgPace: 0,
            elevationGain: 0,
            calories: 0,
            heartRate: 0,
            score: 0,
            zoneStats: { 'Warm-up': 0, 'Fat Burn': 0, 'Aerobic': 0, 'Anaerobic': 0, 'Extreme': 0 },
            splits: []
        });
        setRoute([]);
        streamDataRef.current = { timestamps: [], heart_rate: [], pace: [], elevation: [], cadence: [] };
        liveCadenceRef.current = 0;
        liveStrideRef.current = 0;
        // 🔴 Reset watch-source flag so the next session re-arms cleanly
        watchSourceActiveRef.current = false;
        lastWatchMetricsAtRef.current = 0;
        setIsRecovering(false);
        setWorkoutSummary(null);
        setHasConfirmedSave(false);
        setRecoveryTimer(60);
        isFinalizingRef.current = false;
        hasSavedToBackendRef.current = false; // 新跑步可重新存檔
        setShowGrowthReport(false);
        setStartTime(null);
        setPauseTime(null);
        setTotalPausedTime(0);
        setLastActiveTime(null);
        setIsRecording(false);
        setMapActive(true);
        setShowFinishConfirm(false);
        setActivePlan(null); // 🔥 確保清除教練狀態
    };

    const [isRecording, setIsRecording] = useState(false); // State to track if HealthKit workout is active
    const [startTime, setStartTime] = useState(null);
    const [pauseTime, setPauseTime] = useState(null);
    const [totalPausedTime, setTotalPausedTime] = useState(0);
    const [lastActiveTime, setLastActiveTime] = useState(null);
    const [mapActive, setMapActive] = useState(true);
    const [showFinishConfirm, setShowFinishConfirm] = useState(false);

    // 🆕 跑步機模式切換（持久化到 localStorage 讓使用者每次回來都記得）
    const [isTreadmillMode, setIsTreadmillMode] = useState(
        () => localStorage.getItem('cardio_treadmill_mode') === 'true'
    );
    const toggleTreadmillMode = () => {
        const next = !isTreadmillMode;
        setIsTreadmillMode(next);
        localStorage.setItem('cardio_treadmill_mode', String(next));
    };
    // 🆕 啟動 treadmill 前的「手機擺放」一次性提示
    const [showTreadmillHint, setShowTreadmillHint] = useState(false);

    // Bug fix: 穩定 reference 給 useHealthKit，避免每次 render 都產生新 callback → 觸發
    // 子層 useEffect 重跑 → setState in render warning
    const stableOnRecoveryHR = useCallback((hr) => { contextUpdateHR(hr); }, [contextUpdateHR]);

    // 🔥 HealthKit Hook Integration (Detailed Version)
    const {
        metrics: healthKitMetrics,
        dataAvailability,
        isHealthKitAvailable,
        isWorkoutActive: healthKitIsActive,
        isRecoveryPhase: healthKitIsRecovery,   // 🆕 60s HRR 收尾期
        startWorkout: startHealthKitWorkout,
        pauseWorkout: pauseHealthKitWorkout,
        resumeWorkout: resumeHealthKitWorkout,
        endWorkout: endHealthKitWorkout,
        streamData: healthKitStreamData,
        recoveryStreamData: healthKitRecoveryStream  // 🆕
    } = useHealthKit({
        forceSimulation,
        mode: isTreadmillMode ? 'treadmill' : 'running',
        // 🆕 60秒 HRR recovery 期間，每秒把心率餵給 RecoveryContext → 即時算 HRR drop
        onRecoveryHR: stableOnRecoveryHR
    });

    const [userId] = useState(() => getUserId());
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncError, setSyncError] = useState(null);

    // cardioPatchReady removed — DataPulse not used in this page's JSX

    // 接受 { onProgress } 以回報逐筆進度；回傳實際同步成功的筆數
    const handleSync = useCallback(async (opts = {}) => {
        const { onProgress } = opts;
        if (isSyncing) return 0;
        setIsSyncing(true);
        setSyncError(null);
        let syncedCount = 0;
        try {
            const unsynced = await indexedDBManager.getUnsyncedWorkouts(userId);
            // 🆕 只挑「跑步」紀錄；重訓紀錄（kind=strength）交給下方的 strength 同步迴圈，
            //    避免讀取 item.workout.stats.distance 時對重訓資料拋錯。
            const cardioItems = unsynced.filter(
                (w) => w.workout?.kind !== 'strength' && w.workout?.endpoint !== '/api/workout/save'
            );
            // 進度總筆數 = 跑步 + 重訓，讓進度條一次涵蓋兩種資料
            const strengthCount = unsynced.length - cardioItems.length;
            const total = cardioItems.length + strengthCount;
            let done = 0;
            if (total > 0 && onProgress) onProgress(0, total);

            // ── 1) 同步跑步紀錄 ──
            for (let i = 0; i < cardioItems.length; i++) {
                const item = cardioItems[i];
                try {
                    // 📉 離線補同步同樣降取樣（雲端精簡，本地保留完整）
                    const ds = downsampleCardioForUpload({ route: item.workout.route || [], stream_data: item.workout.stream_data });
                    const payload = {
                        user_id: userId,
                        date: new Date(item.timestamp).toISOString(),
                        route_data: ds.route,
                        metrics: {
                            ...item.workout.stats,
                            distance_km: item.workout.stats?.distance,
                            duration_seconds: item.workout.stats?.duration,
                            pace_per_km: item.workout.stats?.pace
                        },
                        stream_data: ds.stream_data
                    };
                    const response = await apiClient.post('/api/cardio/session', payload);
                    if (response.ok || response.status === 200) {
                        await indexedDBManager.markWorkoutSynced(item.id);
                        syncedCount++;
                    }
                } catch (err) {
                    console.warn(`Failed to sync session ${item.id}:`, err);
                }
                done++;
                if (onProgress) onProgress(done, total);
            }

            // ── 2) 同步重訓紀錄（共用同一條進度）──
            if (strengthCount > 0) {
                const liftSynced = await syncPendingStrengthWorkouts(userId, {
                    onProgress: (liftDone) => {
                        if (onProgress) onProgress(cardioItems.length + liftDone, total);
                    }
                });
                syncedCount += liftSynced;
            }
        } catch (err) {
            setSyncError(err.message);
        } finally {
            setIsSyncing(false);
        }
        return syncedCount;
    }, [userId, isSyncing]);

    // 🔥 Universal Haptic Helper (Non-blocking)
    const triggerNativeHaptic = useCallback((style = 'medium') => {
        setTimeout(() => {
            try {
                if (window.webkit?.messageHandlers?.fitnessApp) {
                    window.webkit.messageHandlers.fitnessApp.postMessage({
                        type: 'hapticFeedback',
                        style: style
                    });
                }
            } catch (err) {
                console.warn("[Web] Haptic failed:", err);
            }
        }, 10);
    }, []);

    // 🎯 虛擬教練換階提醒 — 只負責同步 currentStepIndex state（供 UI 與其他 effect 使用）
    //    震動已交給 useStageCountdownHaptics 統一管理，避免「自然換階」與「3-2-1-GO」雙重觸發
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    useEffect(() => {
        if (!activePlan || !isTracking || isPaused) return;
        const currentStep = getCurrentPlanStep(activePlan, cardioData.duration);
        if (currentStep && currentStep.index !== currentStepIndex) {
            // 🪙 結算「剛結束的那一段」實際平均配速 = 該段里程增量 / 時間增量（秒/km）
            const distDelta = cardioData.distance - segStartRef.current.distance;   // km
            const timeDelta = cardioData.duration - segStartRef.current.duration;   // sec
            if (distDelta > 0.005 && timeDelta > 0) {
                const segPace = Math.round(timeDelta / distDelta); // 秒/km
                segmentPacesRef.current = { ...segmentPacesRef.current, [currentStepIndex]: segPace };
                setSegmentPaces(segmentPacesRef.current);
            }
            // 重設下一段的起點基準
            segStartRef.current = { distance: cardioData.distance, duration: cardioData.duration };

            setCurrentStepIndex(currentStep.index);
            console.log(`教練提示：進入階段 ${currentStep.name}`);
        }
    }, [cardioData.duration, cardioData.distance, activePlan, isTracking, isPaused, currentStepIndex]);

    // 🥁 換階倒數體感引擎 (Haptic Morse Code) — 3-2-1-GO
    //    GO 那一刻同時觸發畫面白光（透過 flashSignal 受控訊號通知 MacroFocusOverlay）
    const [flashSignal, setFlashSignal] = useState(0);
    const handleStageBoundary = useCallback(() => {
        setFlashSignal((n) => n + 1);
    }, []);
    useStageCountdownHaptics({
        activePlan,
        duration: cardioData.duration,
        isTracking,
        isPaused,
        triggerNativeHaptic,
        getCurrentPlanStep,
        onStageBoundary: handleStageBoundary,
    });

    // 🎯 虛擬教練：配速體感回饋引擎 (Haptic Pacing Coach)
    const prevPaceStatus = useRef('perfect');

    useEffect(() => {
        // 每 3 秒檢查一次，避免每秒震動太煩人，且必須在追蹤中
        if (!activePlan || !isTracking || isPaused) return;

        const checkInterval = setInterval(() => {
            const currentStep = getCurrentPlanStep(activePlan, latestMetricsRef.current.duration);
            // 沒有目標配速的段（依體感段）不做配速震動，免得拿 undefined 比出假「太快／太慢」
            if (!currentStep || !(currentStep.targetPace > 0) || !(latestMetricsRef.current.currentPace > 0)) return;

            const diff = latestMetricsRef.current.currentPace - currentStep.targetPace;
            let currentStatus = 'perfect';

            // 容許誤差 ±15秒
            if (diff > 15) currentStatus = 'too_slow';
            else if (diff < -15) currentStatus = 'too_fast';

            // 只有當「狀態改變」時，才發出震動提示！
            if (currentStatus !== prevPaceStatus.current) {
                if (currentStatus === 'too_slow') {
                    // 🐢 太慢：輕快雙短震 (Tap-Tap) 提示提速
                    triggerNativeHaptic('light');
                    setTimeout(() => triggerNativeHaptic('light'), 250);
                    console.log('📱 體感教練: 震動提示 [太慢了，加快！]');
                }
                else if (currentStatus === 'too_fast') {
                    // 🐇 太快：沉重單震 (Heavy) 警告放慢
                    triggerNativeHaptic('heavy');
                    console.log('📱 體感教練: 震動警告 [太快了，穩住！]');
                }
                else if (currentStatus === 'perfect') {
                    // 🎯 回到完美：溫和單震 (Medium) 告訴使用者抓到節奏了
                    triggerNativeHaptic('medium');
                    console.log('📱 體感教練: 震動肯定 [完美配速！]');
                }
                prevPaceStatus.current = currentStatus;
            }
        }, 3000);

        return () => clearInterval(checkInterval);
    }, [activePlan, isTracking, isPaused, triggerNativeHaptic]);

    // 🔄 Sync Display Metrics from HealthKit or Fallback
    useEffect(() => {
        if (healthKitIsActive && isHealthKitAvailable && !forceSimulation) {
            // 🦶 手機原生 CMPedometer 的即時步頻（每秒更新）→ 灌進 liveCadenceRef，
            //    讓「即時顯示」與「GPS 取樣的步頻串流」都有連續值，不再只靠 WebView 內
            //    不穩定的 DeviceMotion（那正是「步頻只有一個數值」的主因）。
            if (Number(healthKitMetrics.cadence) > 0) {
                liveCadenceRef.current = Math.round(Number(healthKitMetrics.cadence));
            }
            setCardioData(prev => {
                // 🔥 ZONE ACCUMULATION (HealthKit path)
                const hkZoneInfo = getZoneInfo(healthKitMetrics.heartRate);
                const hkZoneKey = ZONE_ID_TO_KEY[hkZoneInfo.id] || 'Warm-up';
                const prevZoneStats = prev.zoneStats || { 'Warm-up': 0, 'Fat Burn': 0, 'Aerobic': 0, 'Anaerobic': 0, 'Extreme': 0 };
                const updatedZoneStats = {
                    ...prevZoneStats,
                    [hkZoneKey]: (prevZoneStats[hkZoneKey] || 0) + 1
                };
                return {
                    ...prev,
                    distance: healthKitMetrics.distance || prev.distance,
                    duration: healthKitMetrics.duration || prev.duration,
                    // HealthKit 送來的配速是「分／公里」，這頁其他地方都是「秒／公里」
                    currentPace: healthKitMetrics.pace ? healthKitMetrics.pace * 60 : prev.currentPace,
                    avgPace: healthKitMetrics.pace ? healthKitMetrics.pace * 60 : prev.avgPace,
                    elevationGain: healthKitMetrics.elevation || prev.elevationGain,
                    calories: healthKitMetrics.calories || prev.calories,
                    heartRate: healthKitMetrics.heartRate || prev.heartRate,
                    score: prev.score + ((ZONE_MULTIPLIERS[hkZoneInfo.id] || 0.5) / 60),
                    zoneStats: updatedZoneStats
                };
            });

            // Update route with latest position
            if (healthKitMetrics.currentPosition) {
                setRoute(prev => {
                    const newPoint = healthKitMetrics.currentPosition;
                    if (prev.length === 0 || prev[prev.length - 1].lat !== newPoint.lat || prev[prev.length - 1].lng !== newPoint.lng) {
                        return [...prev, newPoint];
                    }
                    return prev;
                });
            }
        }
    }, [healthKitMetrics, healthKitIsActive, isHealthKitAvailable]);


    const handleToggle = useCallback(() => {
        console.log('[React] handleToggle CALLED. isTracking:', isTracking, 'isPaused:', isPaused);

        if (!isTracking) {
            if (startCountdown !== null) return; // Prevent multiple clicks during countdown

            setStartCountdown(3);
            triggerNativeHaptic?.('medium');

            let count = 3;
            const timer = setInterval(() => {
                count -= 1;
                if (count > 0) {
                    setStartCountdown(count);
                    triggerNativeHaptic?.('light');
                } else {
                    clearInterval(timer);
                    setStartCountdown(null);

                    // Actual start logic
                    setTargetScore(baseline || 80);
                    setTargetType('steady');
                    setActivePlan(null);
                    triggerNativeHaptic?.('heavy');
                    setIsTracking(true);
                    setIsPaused(false);
                    setIsRecording(true);
                    setStartTime(new Date());
                    // ⏸️ 開跑時清空自動暫停狀態
                    autoPausedRef.current = false;
                    stationarySinceRef.current = null;
                    setAutoPaused(false);
                    // 🔊 重置里程播報並念出起跑提示
                    lastAnnouncedKmRef.current = 0;
                    lastKmMarkRef.current = { km: 0, duration: 0 };
                    resetSplitAcc();   // 🏁 重置逐公里分段累積器
                    if (isVoiceEnabled()) speak('開始跑步，加油！');
                }
            }, 1000);

        } else {
            // 手動暫停/繼續：同時清掉自動暫停狀態，避免兩套暫停互相打架
            autoPausedRef.current = false;
            stationarySinceRef.current = null;
            setAutoPaused(false);
            setIsPaused(prev => !prev);
        }
    }, [isTracking, isPaused, baseline, startCountdown, triggerNativeHaptic]);

    // ✅ Direct Native Event Binding for START RUN (Solution 3)
    useEffect(() => {
        const button = startButtonRef.current;
        if (!button) return;

        const handleTouch = (e) => {
            if (startButtonHandledRef.current) return; // ✅ 防止雙重觸發
            startButtonHandledRef.current = true;

            e.preventDefault();
            e.stopPropagation();
            console.log('🚀 [Web] START RUN Clicked - UI First');

            // 🧭 借這個使用者手勢請求羅盤權限 → 地圖上的定位扇形才能隨手機朝向轉動
            try { window.dispatchEvent(new CustomEvent('request-compass')); } catch (_) {}

            // ✅ 1. 使用 requestAnimationFrame 避開 WebKit 觸控期間的 DOM 凍結
            requestAnimationFrame(() => {
                handleToggle();
                // 300ms 後重置，避免幽靈點擊
                setTimeout(() => { startButtonHandledRef.current = false; }, 300);
            });

            // ✅ 2. Haptic Feedback
            triggerNativeHaptic('heavy');
        };

        button.addEventListener('touchstart', handleTouch, { passive: false });
        button.addEventListener('click', handleTouch);

        return () => {
            button.removeEventListener('touchstart', handleTouch);
            button.removeEventListener('click', handleTouch);
        };
    }, [handleToggle, isTracking, isPaused, triggerNativeHaptic]);


    const handleStartWithSegments = () => {
        setShowSegmentSelector(false);
        setActivePlan(null); // 🔥 自由跑模式：清除教練狀態
        setIsTracking(true);
        setIsPaused(false);
        setRoute([]); // ⚠️ 等 GPS 自動定位，不再預先放台北座標
        toggleRecording(); // Start HealthKit workout
    };

    // 💡 Dynamic Target Calculator based on Intent
    const calculateDynamicTarget = useCallback((intent, userBaseline) => {
        const base = userBaseline || 80;
        switch (intent) {
            case '#Mindfulness': return Math.round(base * 0.4);
            case '#FatBurn': return Math.round(base * 0.8);
            case '#Routine': return Math.round(base * 1.0);
            case '#Performance': return Math.round(base * 1.3);
            default: return base;
        }
    }, []);

    const handleIntentSelected = (intent) => {
        setSelectedIntent(intent);
        setShowCardioPlan(false);
        // 動態設定今日目標分數
        const calculatedTarget = calculateDynamicTarget(intent, baseline);
        setTargetScore(calculatedTarget);
        // ⛔️ TODAY'S GOAL (PUSH/STEADY/EASY) 已停用 — 直接設好目標即可
    };

    const handleTargetSelected = ({ score, type }) => {
        setTargetScore(score);
        setTargetType(type);
        setShowTargetSelector(false);
        setActivePlan(null); // 🔥 自由跑模式：清除教練狀態
        triggerNativeHaptic('medium');

        // 直接開始跑步（原本由 SegmentSelector 觸發）
        setIsTracking(true);
        setIsPaused(false);
        setRoute([]); // ⚠️ 等 GPS 自動定位，不再預先放台北座標
        toggleRecording();
    };

    const toggleSegmentSelection = (id) => {
        setSelectedSegmentIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    // ⌚ Tell Apple Watch to start/pause/stop its HKWorkoutSession so HR streams in.
    //    Silently no-op if not running inside the iOS WKWebView (e.g. desktop browser).
    const sendWatchCommand = (cmd) => {
        try {
            // 使用者在手錶面板關閉了「跑步數據」→ 不要求手錶量測（START/PREWARM 才需 gate；STOP 仍照送以結束）
            if ((cmd === 'START' || cmd === 'PREWARM') && localStorage.getItem('watchData_cardio') === 'false') return;
            if (window?.webkit?.messageHandlers?.watchWorkout) {
                window.webkit.messageHandlers.watchWorkout.postMessage({ command: cmd, mode: 'cardio' });
                console.log('[Watch] command sent:', cmd, '(cardio)');
            }
        } catch (e) {
            console.warn('[Watch] command failed:', cmd, e?.message);
        }
    };

    // ══════════════════════════════════════════════════════════════════════
    // ⌚ 手錶預熱（PREWARM）— 一進跑步頁就讓 Apple Watch 先起一個背景
    //    workout session 開始串流心率。
    //
    //    使用者回報：「每次都是開跑之後過大概一分鐘才會有心率數據，太慢了。」
    //    原因：以前是按下開始才送 START，watchOS 建立 HKWorkoutSession +
    //    感測器穩定需要 30–60 秒，那段時間 HR = 0，第一公里的心率、
    //    區間分佈、EF 全都少一塊。
    //
    //    預熱後起跑瞬間心率就有值；使用者若沒開跑就離開，卸載時會收掉。
    // ══════════════════════════════════════════════════════════════════════
    useEffect(() => { isTrackingRef.current = isTracking; }, [isTracking]);

    /* ⌚ 手錶跟著「真的在跑」的狀態走。
       以前只有一個沒人呼叫的 toggleRecording 會送 START，實際開跑（QUICK START、
       課表開跑、倒數結束）都沒送 —— 手錶是靠進頁的預熱才動起來的；手機暫停手錶也不知道。
       改成看狀態：開始 → START（預熱中的手錶會從這一刻重新計時），暫停／繼續 → 同步。
       重複送是安全的：手錶端對「已經在跑／已經暫停」的指令不會重做。 */
    const watchSyncRef = useRef({ tracking: false, paused: false });
    useEffect(() => {
        const prev = watchSyncRef.current;
        if (isTracking && !prev.tracking) sendWatchCommand('START');
        else if (isTracking && prev.tracking && isPaused !== prev.paused) sendWatchCommand(isPaused ? 'PAUSE' : 'RESUME');
        watchSyncRef.current = { tracking: isTracking, paused: isPaused };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isTracking, isPaused]);

    // ⌚ 反過來：在手錶上按暫停／繼續／結束，手機也要跟著停，不然兩邊時間對不上
    useEffect(() => {
        const onWatchState = (e) => {
            const st = String(e?.detail?.state || '').toUpperCase();
            if (!isTrackingRef.current) return;
            if (st === 'PAUSED' || st === 'ENDED' || st === 'RUNNING') {
                autoPausedRef.current = false;
                stationarySinceRef.current = null;
                setAutoPaused(false);
                setIsPaused(st !== 'RUNNING');
                if (st === 'ENDED') toast.info('手錶已結束，這趟在手機上暫停了');
            }
        };
        window.addEventListener('watch-workout-state', onWatchState);
        return () => window.removeEventListener('watch-workout-state', onWatchState);
    }, []);
    useEffect(() => { recoveringRef.current = isRecovering; }, [isRecovering]);

    useEffect(() => {
        sendWatchCommand('PREWARM');
        return () => {
            // 只有在「沒有正在跑」的情況下才收掉，避免把進行中的 session 關掉
            if (!isTrackingRef.current) sendWatchCommand('STOP');
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // --- Finish & Recovery ---
    const handleFinish = () => {
        setIsTracking(false);
        setIsPaused(true);
        // ⏸️ 清除自動暫停狀態，避免下次開跑殘留
        autoPausedRef.current = false;
        stationarySinceRef.current = null;
        setAutoPaused(false);
        // 🔊 結束語音 + 重置里程播報計數
        stopSpeaking();

        // 🏁 收尾段（不足 1 公里的最後一段）— 必須被記錄，但標記 partial:true，
        //    這樣「最快一段」比較時會被排除。
        //    使用者回報：第 10 公里出現兩筆、最後一筆 5'00" 變成最快段 —— 就是
        //    因為 0.22km 的尾段被當成完整公里去比配速。
        {
            const acc = splitAccRef.current;
            const finalDist = latestMetricsRef.current?.distance || cardioData.distance || 0;
            const finalDur = latestMetricsRef.current?.duration || cardioData.duration || 0;
            const tailKm = finalDist - Math.floor(finalDist);
            const tailSec = Math.max(0, Math.round(finalDur - acc.startDur));
            if (tailKm >= 0.05 && tailSec >= 3) {
                setCardioData(prev => ({
                    ...prev,
                    splits: [...(prev.splits || []), {
                        km: Math.floor(finalDist) + 1,
                        distanceKm: Number(tailKm.toFixed(3)),
                        time: tailSec,
                        // 尾段配速換算成「每公里」才能跟其他段同尺度比較，但仍不參與最快段
                        pace: Math.round(tailSec / tailKm),
                        avgHR: acc.hrN > 0 ? Math.round(acc.hrSum / acc.hrN) : 0,
                        cadence: acc.cadN > 0 ? Math.round(acc.cadSum / acc.cadN) : 0,
                        elevGain: Math.round(acc.elevGain * 10) / 10,
                        partial: true,
                        timestamp: Date.now(),
                    }],
                }));
            }
        }

        lastAnnouncedKmRef.current = 0;
        lastKmMarkRef.current = { km: 0, duration: 0 };
        resetSplitAcc();
        // ⌚ 【修正】結束跑步時「不」立刻叫手錶 STOP —
        //    HRR 需要停止後 60 秒的真實心率，手錶一停就永遠量不到（結算頁 HRR 恆為 0）。
        //    改送 RECOVERY：手錶保留 session、繼續串流心率，60 秒量測窗結束後才 STOP。
        sendWatchCommand('RECOVERY');

        // 🩺 開始真實 HRR 量測窗
        const stopHR = latestMetricsRef.current?.heartRate || cardioData.heartRate || 0;
        recoveryCurveRef.current = stopHR > 0 ? [{ t: Date.now(), hr: stopHR }] : [];
        recoveringRef.current = true;
        console.log("🧊 Starting Recovery via Context... stopHR =", stopHR);

        // 🔥 Use context's startRecovery to sync with CardioResultsMobile
        contextStartRecovery(stopHR);

        // Also keep local state for backward compatibility
        setIsRecovering(true);
        setRecoveryTimer(60);
        setRecoveryStartHR(cardioData.heartRate);
        // 💯 先彈 RPE 表單（強制）— 填完才彈 SaveConfirm
        setShowRpeForm(true);

        const timer = setInterval(() => {
            setRecoveryTimer(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    return 0;
                }
                // 🔥 Also update context with current HR
                contextUpdateHR(cardioData.heartRate);
                return prev - 1;
            });
        }, 1000);
        window.recoveryInterval = timer;
        recoveryIntervalRef.current = timer; // 🛡️ P1：ref 為清理依據，卸載時保證被清掉
    };

    const handleCancelSave = () => {
        setShowSaveConfirm(false);
        setIsTracking(true);
        setIsPaused(false);
        setIsRecovering(false);
        if (window.recoveryInterval) {
            clearInterval(window.recoveryInterval);
            window.recoveryInterval = null;
        }
        recoveryIntervalRef.current = null;
    };

    // 🔥 Simulation Loop — 模擬跑步數據 (開發測試用)
    // Update localStorage tracking state for GlobalFloatingMusicPlayer
    useEffect(() => {
        if (isTracking && !isPaused) {
            localStorage.setItem('cardio_tracking', '1');
            window.dispatchEvent(new Event('cardio_tracking_changed'));
        } else {
            localStorage.setItem('cardio_tracking', '0');
            window.dispatchEvent(new Event('cardio_tracking_changed'));
        }
        return () => {
            localStorage.setItem('cardio_tracking', '0');
            window.dispatchEvent(new Event('cardio_tracking_changed'));
        };
    }, [isTracking, isPaused]);

    useEffect(() => {
        let simInterval;
        // ⏸️ autoPaused 時一併凍結牆鐘秒數，讓「自動暫停」期間時間與里程同步停住。
        if (isTracking && !isPaused && !isRecovering && !autoPaused) {
            // 🕒 以「真實牆鐘時間」為準：進入計時就記下起點，暫停/恢復會重置起點以排除暫停時間。
            //    修正 setInterval 在 WKWebView 背景/鎖屏被節流→掉 tick→時間少一半的 bug。
            wallClockRef.current.lastAt = Date.now();
            wallClockRef.current.carry = 0;
            simInterval = setInterval(() => {
                const now = Date.now();

                // ✅ NORMAL MODE — real run:
                //    • GPS handler owns: route, distance, currentPace, avgPace
                //    • Watch handler owns: heartRate, calories, zoneStats (or recalc here from HR)
                //    • Score: derived from HR zone (computed locally)
                //    ⏱ 時間以「上次 tick 到現在的真實秒差」累加，而非每次 +1，
                //       背景被節流時一次補回缺的秒數，時間不再短少。
                if (!forceSimulation) {
                    setCardioData(prev => {
                        const nowMs = Date.now();
                        const last = wallClockRef.current.lastAt || nowMs;
                        const delta = Math.max(0, (nowMs - last) / 1000); // 真實經過秒數
                        wallClockRef.current.lastAt = nowMs;
                        const carry = (wallClockRef.current.carry || 0) + delta;
                        const wholeSec = Math.floor(carry);
                        wallClockRef.current.carry = carry - wholeSec;
                        const hr = prev.heartRate || 0;
                        const zoneInfo = hr > 0 ? getZoneInfo(hr) : null;
                        const mult = zoneInfo ? (ZONE_MULTIPLIERS[zoneInfo.id] || 0) : 0;
                        const pointsPerSec = mult / 60;

                        // ══════════════════════════════════════════════════
                        // 🔥 修復：實跑模式的心率區間秒數累積
                        //    以前 zoneStats 只在 simulation / HealthKit 分支累加，
                        //    真實跑步這條路徑完全沒累加 → 使用者截圖裡跑了 1:06:47，
                        //    區間分佈卻只有 14s+24s+2m43s+2s ≈ 3 分鐘，
                        //    導致「無氧區 80%」這種完全失真的比例（圖五、圖八）。
                        //    現在用 wholeSec 補回被背景節流吃掉的秒數。
                        // ══════════════════════════════════════════════════
                        let updatedZoneStats = prev.zoneStats;
                        if (wholeSec > 0 && zoneInfo) {
                            const zoneKey = ZONE_ID_TO_KEY[zoneInfo.id] || 'Warm-up';
                            const base = prev.zoneStats || {
                                'Warm-up': 0, 'Fat Burn': 0, 'Aerobic': 0, 'Anaerobic': 0, 'Extreme': 0,
                            };
                            updatedZoneStats = { ...base, [zoneKey]: (base[zoneKey] || 0) + wholeSec };
                        }

                        return {
                            ...prev,
                            duration: prev.duration + wholeSec,
                            score: prev.score + pointsPerSec * wholeSec,
                            zoneStats: updatedZoneStats,
                        };
                    });

                    // 📡 心率時間序列（1Hz）— EF / 心率漂移 / 有氧脫鉤都需要這條序列。
                    //    以前只有模擬模式會寫，真跑時 heart_rate 串流是空的。
                    {
                        const hrNow = latestMetricsRef.current?.heartRate || 0;
                        if (hrNow > 0) {
                            const s = streamDataRef.current;
                            if (!Array.isArray(s.heart_rate)) s.heart_rate = [];
                            if (!Array.isArray(s.hr_timestamps)) s.hr_timestamps = [];
                            s.heart_rate.push(hrNow);
                            s.hr_timestamps.push(Date.now());
                        }
                    }
                    return;
                }

                // ── 🧪 SIMULATION MODE (force_simulation=true, demo/test only) ──
                // ══════════════════════════════════════════════════════
                // 📍 STEP 1: 計算本秒的 HR / zone / pace（移到外部）
                //    這樣 stream 和 state 用的是同一個值，不會 stale
                // ══════════════════════════════════════════════════════
                const baseHR = 145;
                const hrVariation = Math.sin(now / 5000) * 20 + (Math.random() * 10 - 5);
                const tickHR = Math.max(110, Math.min(190, Math.round(baseHR + hrVariation)));

                const tickZoneInfo = getZoneInfo(tickHR);
                const tickZoneKey = ZONE_ID_TO_KEY[tickZoneInfo.id] || 'Warm-up';
                const tickMultiplier = ZONE_MULTIPLIERS[tickZoneInfo.id] || 0.5;
                const pointsPerSec = tickMultiplier / 60;

                const basePace = 330;
                const tickPace = Math.max(240, Math.min(480, Math.round(basePace + Math.sin(now / 8000) * 30)));
                const speedKmPerSec = 1000 / tickPace / 1000;

                // ══════════════════════════════════════════════════════
                // 📍 STEP 2: 立刻把 HR/pace 寫入 stream（當下值，無 stale）
                // ══════════════════════════════════════════════════════
                streamDataRef.current.timestamps.push(now);
                streamDataRef.current.heart_rate.push(tickHR);
                streamDataRef.current.pace.push(tickPace);

                // ══════════════════════════════════════════════════════
                // 📍 STEP 3: 更新 cardioData state
                // ══════════════════════════════════════════════════════
                setCardioData(prev => {
                    const newDistance = prev.distance + speedKmPerSec;

                    // 里程碑分段紀錄（每 1km）
                    const currentKm = Math.floor(prev.distance);
                    const nextKm = Math.floor(newDistance);
                    let updatedSplits = [...(prev.splits || [])];
                    if (nextKm > currentKm && nextKm > 0) {
                        const totalTimeUsed = updatedSplits.reduce((s, x) => s + x.time, 0);
                        const splitTime = prev.duration - totalTimeUsed;
                        // 取 stream 中最後 splitTime 個樣本的平均 HR
                        const hrSamples = streamDataRef.current.heart_rate;
                        const segHRs = hrSamples.slice(-Math.max(1, splitTime));
                        const avgHR = segHRs.length > 0
                            ? Math.round(segHRs.reduce((a, b) => a + b, 0) / segHRs.length)
                            : tickHR;
                        updatedSplits.push({
                            km: nextKm,
                            time: splitTime,
                            pace: tickPace,
                            avgHR,
                            timestamp: now
                        });
                    }

                    // Zone 秒數累加
                    const prevZoneStats = prev.zoneStats || { 'Warm-up': 0, 'Fat Burn': 0, 'Aerobic': 0, 'Anaerobic': 0, 'Extreme': 0 };
                    const updatedZoneStats = {
                        ...prevZoneStats,
                        [tickZoneKey]: (prevZoneStats[tickZoneKey] || 0) + 1
                    };

                    // 卡路里
                    const calPerSec = (8 + (tickHR - 120) * 0.05) / 60;

                    return {
                        ...prev,
                        duration: prev.duration + 1,
                        heartRate: tickHR,
                        currentPace: tickPace,
                        avgPace: prev.duration > 0
                            ? Math.round((prev.avgPace * prev.duration + tickPace) / (prev.duration + 1))
                            : tickPace,
                        distance: Number(newDistance.toFixed(4)),
                        calories: prev.calories + calPerSec,
                        score: prev.score + pointsPerSec,
                        elevationGain: prev.elevationGain + (Math.random() > 0.9 ? 0.5 : 0),
                        splits: updatedSplits,
                        zoneStats: updatedZoneStats   // ← 每秒累積
                    };
                });

                // 模擬位置移動 — 只在已經有 GPS 起點時才延伸路線；
                // 沒有真實位置就不再用台北座標假裝有位置。
                setRoute(prev => {
                    if (prev.length === 0) return prev;
                    const last = prev[prev.length - 1];
                    return [...prev, {
                        lat: last.lat + (Math.random() - 0.3) * 0.0003,
                        lng: last.lng + (Math.random() - 0.3) * 0.0003,
                    }];
                });
            }, 1000);
        }
        return () => clearInterval(simInterval);
    }, [isTracking, isPaused, isRecovering, forceSimulation, autoPaused]);

    // --- Main Loop ---
    useEffect(() => {
        let interval;
        if (isRecovering) {
            interval = setInterval(() => {
                const secondsSinceStop = 60 - recoveryTimer;
                // ══════════════════════════════════════════════════════════
                // 🩺 HRR 量測 —【真實優先】
                //    有手錶在串流 → 直接記錄它送來的真實心率（handleWatchLiveMetrics
                //    已經把每一筆 push 進 recoveryCurveRef），這裡只負責補齊
                //    「這一秒沒有新事件」時的取樣，讓曲線每秒都有點。
                //    完全沒有手錶／沒心率 → 維持 0，UI 誠實顯示 "--"，
                //    絕不再用 getRecoveryStep() 生一條假的回落曲線。
                //    只有 forceSimulation（demo 模式）才允許模擬。
                // ══════════════════════════════════════════════════════════
                const hasRealHR = (recoveryStartHR || 0) > 0;
                if (hasRealHR) {
                    const liveHR = latestMetricsRef.current?.heartRate || 0;
                    const watchAlive = (Date.now() - (lastWatchMetricsAtRef.current || 0)) < 8000;

                    let sampleHR = 0;
                    if (forceSimulation) {
                        sampleHR = getRecoveryStep(recoveryStartHR, secondsSinceStop);
                        setCardioData(prev => ({ ...prev, heartRate: sampleHR }));
                    } else if (watchAlive && liveHR > 0) {
                        sampleHR = liveHR;                       // 真實量測值
                    }

                    if (sampleHR > 0) {
                        const curve = recoveryCurveRef.current;
                        const lastAt = curve.length ? curve[curve.length - 1].t : 0;
                        if (Date.now() - lastAt >= 900) curve.push({ t: Date.now(), hr: sampleHR });
                        streamDataRef.current.timestamps.push(Date.now());
                        streamDataRef.current.heart_rate.push(sampleHR);
                        streamDataRef.current.pace.push(0);
                    }
                }

                if (recoveryTimer <= 1 && hasConfirmedSave && !isFinalizingRef.current) {
                    isFinalizingRef.current = true;
                    finishRecovery();
                    generateAndSetData(true);
                }
                if (hasConfirmedSave && !isFinalizingRef.current) {
                    generateAndSetData(false);
                }
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isRecovering, recoveryTimer, hasConfirmedSave, recoveryStartHR]);

    // --- Save & Data ---
    const handleConfirmSave = () => {
        setShowSaveConfirm(false);
        setHasConfirmedSave(true);

        // 🔍 診斷：打印要保存的數據
        console.log('📤 準備保存的數據:', {
            distance: cardioData.distance,
            duration: cardioData.duration,
            score: cardioData.score,
            heartRate: cardioData.heartRate,
        });

        // 1. 先檢查是否有 Growth (Level Up)
        //    🏅 用解析後分數（無心率走後備），讓 GPS 跑者也能正常觸發 Growth / 更新 baseline
        const currentRefBaseline = baseline || 80;
        const resolvedScore = resolveSessionScore(cardioData.score, {
            distanceKm: cardioData.distance || 0,
            durationSec: cardioData.duration || 0,
            avgPaceSec: cardioData.avgPace || 0,
        }).score;
        const isRecord = (targetScore && resolvedScore >= targetScore) || (targetType === 'challenge' && resolvedScore > currentRefBaseline);

        if (isRecord) {
            // 直接使用新分數作為 baseline
            const newBaseline = Math.round(resolvedScore);
            setBaseline(newBaseline);
            localStorage.setItem('user_baseline', newBaseline);

            setGrowthData({
                oldBaseline: currentRefBaseline,
                newBaseline: newBaseline,
                growthPercent: (((newBaseline - currentRefBaseline) / currentRefBaseline) * 100).toFixed(1),
                isLevelUp: true
            });
            setShowGrowthReport(true);
        } else {
            // Skip saved overlay, go directly to results
            proceedToResults();
        }
    };

    const handleSavedOverlayComplete = () => {
        setShowSavedOverlay(false);
        proceedToResults();
    };

    // 進入結果頁
    const proceedToResults = () => {
        console.log("🏁 Proceeding to Results Screen...");
        setShowGrowthReport(false);
        generateAndSetData(false);

        // Ensure data is set before animating
        setTimeout(() => {
            setIsTransitioning(true);
        }, 10);
    };

    const handleTransitionComplete = useCallback(() => {
        setIsTransitioning(false);
        setShowResults(true);
        // 🔥 CRITICAL: Reset scroll position so absolute/fixed overlays appear correctly
        window.scrollTo(0, 0);
    }, []);

    // 💡 Helper: 計算里程碑成就 (類似 Strava 的分段紀錄標記)
    //
    // 🔁 v3【單一真相源】：改為委派給 utils/personalRecords 的 computeDistanceRankings。
    //    以前這裡有一份自己的 bestEffortTime／排名邏輯，跟 PR 頁那份各算各的，
    //    才會出現「上方寫 10 公里最快 第 3 佳、下方卻寫本場無新紀錄」的自相矛盾。
    //    現在里程碑、PR 檔案、結算獎牌全部走同一個函式。
    const calculateMilestoneAchievements = (currentSplits, currentRoute, workoutHistory) => {
        if (!currentSplits || currentSplits.length === 0) return [];

        const rankings = computeDistanceRankings(
            {
                activity_type: 'running',
                distance: latestMetricsRef.current?.distance || cardioData.distance || 0,
                duration: latestMetricsRef.current?.duration || cardioData.duration || 0,
                splits: currentSplits,
            },
            Array.isArray(workoutHistory) ? workoutHistory : []
        );

        const route = Array.isArray(currentRoute) ? currentRoute : [];
        const RANK_LABEL = { 1: 'PR', 2: '2nd', 3: '3rd' };

        return rankings
            .filter((x) => x.rank != null)
            .map((x) => {
                // 獎牌插在「最佳努力段的終點」在路線上的比例位置
                const idx = route.length > 0
                    ? Math.min(route.length - 1, Math.max(0, Math.round(x.routeFraction * (route.length - 1))))
                    : -1;
                return {
                    distance: x.km,
                    rank: RANK_LABEL[x.rank],           // 'PR' | '2nd' | '3rd'（下游相容）
                    rankNum: x.rank,
                    medal: x.medal,                     // 'gold' | 'silver' | 'bronze'
                    time: x.sec,
                    paceSec: x.paceSec,
                    estimated: x.estimated,
                    improveSec: x.improveSec,
                    label: x.rank === 1 ? `${x.label}個人紀錄` : `${x.label}第 ${x.rank} 最佳`,
                    subLabel: x.rank === 1 ? '有史以來最快' : x.label,
                    coordinates: idx >= 0 ? route[idx] : null,
                };
            });
    };

    const calculateAnaerobicRatio = (stats) => {
        const total = Object.values(stats).reduce((a, b) => a + b, 0);
        if (total === 0) return "0%";
        const ana = (stats['Anaerobic'] || 0) + (stats['Extreme'] || 0) + (stats['anaerobic'] || 0) + (stats['extreme'] || 0);
        return Math.round((ana / total) * 100) + "%";
    };

    const generateAndSetData = async (isFinal) => {
        const finalType = targetType === 'challenge' ? 'maintain' : targetType;
        const fullHRStream = streamDataRef.current.heart_rate || [];

        // 🔥 FIX v4: Zone stats — 優先使用即時累積的 zoneStats（每秒更新，最可靠），
        //   fallback 到 HR stream 計算，最後才用預設值
        const liveZoneStats = latestMetricsRef.current.zoneStats || cardioData.zoneStats;
        const liveZoneHasData = liveZoneStats && Object.values(liveZoneStats).some(v => v > 0);

        let correctZoneStats;
        let zoneSource; // 'heart_rate' | 'estimated_pace' | 'none' — 結果頁據此誠實標示
        if (liveZoneHasData) {
            // 最可靠：直接來自每秒累積的 state
            correctZoneStats = liveZoneStats;
            zoneSource = 'heart_rate';
        } else if (fullHRStream.filter((h) => Number(h) > 40).length > 10) {
            // fallback：從 HR stream 重新計算
            correctZoneStats = calculateZoneStats(fullHRStream);
            zoneSource = 'heart_rate';
            console.warn('⚠️ 使用 HR stream 重算 zoneStats');
        } else {
            // 🩹 v2：手錶沒送心率 → 不再塞「100% 熱身區」假象。
            //    改用配速相對強度「推算」區間分佈，並標記 zone_source='estimated_pace'
            //    讓結果頁明確告知「未接收到心率數據，以配速推算」。
            const paceArr = (streamDataRef.current.pace || []).map(Number).filter((p) => p > 60 && p < 3600);
            if (paceArr.length > 10) {
                const avgP = paceArr.reduce((a, b) => a + b, 0) / paceArr.length;
                // 🎯 v3 校準：基準配速優先用「近期歷史平均」（最近 5 筆 ≥1km 的跑步），
                //    而非本次平均 — 否則全程衝刺的一趟也會被推算成「大多在有氧區」。
                //    歷史不足 2 筆才退回本次平均。
                let basePace = avgP;
                try {
                    const histPaces = (workoutHistory || [])
                        .filter((w) => Number(w.distance_km) >= 1)
                        .slice(-5)
                        .map((w) => {
                            const t = (w.splits || []).reduce((s, x) => s + (Number(x.time) || 0), 0);
                            return Number(w.distance_km) > 0 && t > 0 ? t / Number(w.distance_km) : 0;
                        })
                        .filter((p) => p > 120 && p < 1200);
                    if (histPaces.length >= 2) basePace = histPaces.reduce((a, b) => a + b, 0) / histPaces.length;
                } catch (_) { /* 歷史讀取失敗 → 用本次平均 */ }
                const est = { recovery: 0, 'fat-burn': 0, aerobic: 0, anaerobic: 0, extreme: 0 };
                paceArr.forEach((p) => {
                    const rel = p / basePace; // >1 比基準慢、<1 比基準快
                    if (rel > 1.20) est.recovery++;
                    else if (rel > 1.08) est['fat-burn']++;
                    else if (rel > 0.95) est.aerobic++;
                    else if (rel > 0.85) est.anaerobic++;
                    else est.extreme++;
                });
                correctZoneStats = est;
                zoneSource = 'estimated_pace';
                console.warn('⚠️ 無心率數據 → 以配速推算區間分佈（基準:', Math.round(basePace), 's/km)');
            } else {
                correctZoneStats = {};
                zoneSource = 'none';
                console.warn('⚠️ 無 zone 數據（心率與配速串流皆不足）');
            }
        }

        // 🔥 FIX v3: 使用 ref 讀取最新分數，避免 stale closure 導致 score = 0
        const latestScore = latestMetricsRef.current.score;
        const hrScore = latestScore > 0 ? latestScore : (cardioData.score || 0);

        // 🏅 無心率後備算分：沒戴手錶 → 心率版分數會是 0。
        //    改用距離/時間/配速估一個合理分，讓「手機 GPS 跑者」不再拿 0 PTS。
        //    有心率 → 維持心率版分數，兩條路不互相覆蓋（見 resolveSessionScore）。
        //    這是所有下游（分數卡、effort_score、effort_density）的唯一源頭，一處修好下游全對。
        const { score: finalScore, source: scoreSource } = resolveSessionScore(hrScore, {
            distanceKm: latestMetricsRef.current.distance || cardioData.distance || 0,
            durationSec: latestMetricsRef.current.duration || cardioData.duration || 0,
            avgPaceSec: latestMetricsRef.current.avgPace || cardioData.avgPace || 0,
        });

        if (finalScore === 0) {
            console.warn('⚠️ finalScore = 0 even after fallback (dist:', cardioData.distance, 'dur:', cardioData.duration, ')');
        } else if (scoreSource === 'fallback') {
            console.log('🏅 使用後備算分（無心率）:', finalScore);
        }

        const durationMin = Math.max(0.1, (latestMetricsRef.current.duration || cardioData.duration || 1) / 60);
        const effortDensity = (finalScore / durationMin).toFixed(1);
        let recHours = Math.round(finalScore / 5);
        if (recHours < 4) recHours = 4;
        if (recHours > 48) recHours = 48;

        const avgPaceVal = cardioData.avgPace || 330;
        // 🫀 v2：EF 改用「真實平均心率」計算；沒有心率數據就誠實回 null（不再假設 150 bpm 瞎掰）
        const validHR = fullHRStream.map(Number).filter((h) => h > 40 && h < 230);
        const hasHRData = validHR.length > 10;
        const avgHRReal = hasHRData ? validHR.reduce((a, b) => a + b, 0) / validHR.length : 0;
        const speedMetersPerMin = avgPaceVal > 0 ? (1000 / avgPaceVal) * 60 : 0;
        const calculatedEF = hasHRData && avgHRReal > 0 ? (speedMetersPerMin / avgHRReal).toFixed(2) : null;

        // 📉 有氧去耦合（decoupling）— 前後半段 EF 比較，需同時有 HR + pace 串流；
        //    資料不足 → null（讓結果頁顯示「資料不足」而非假的 3.5%）
        const paceStream = (streamDataRef.current.pace || []).map(Number).filter((p) => p > 60 && p < 3600);
        let decouplingReal = null;
        if (hasHRData && paceStream.length > 10) {
            const efOf = (hrArr, pArr) => {
                const h = hrArr.reduce((a, b) => a + b, 0) / hrArr.length;
                const p = pArr.reduce((a, b) => a + b, 0) / pArr.length;
                return h > 0 && p > 0 ? ((1000 / p) * 60) / h : 0;
            };
            const hMid = Math.floor(validHR.length / 2);
            const pMid = Math.floor(paceStream.length / 2);
            const ef1 = efOf(validHR.slice(0, hMid), paceStream.slice(0, pMid));
            const ef2 = efOf(validHR.slice(hMid), paceStream.slice(pMid));
            if (ef1 > 0 && ef2 > 0) {
                decouplingReal = {
                    value: Number((((ef1 - ef2) / ef1) * 100).toFixed(1)),
                    first_half_ef: ef1.toFixed(2),
                    second_half_ef: ef2.toFixed(2),
                };
            }
        }

        // ══════════════════════════════════════════════════════════════════
        // 🩺 HRR（心率恢復力）— 一律用「停止後 60 秒量測窗」的真實曲線。
        //    HRR60 = 停止當下心率 − 60 秒後心率。
        //    量測窗沒收到 ≥2 個真實樣本 → 誠實回 null（UI 顯示 "--" ＋ 說明），
        //    不再用「最高心率 − 當前心率」這種會憑空生出數字的估算。
        // ══════════════════════════════════════════════════════════════════
        const recCurve = recoveryCurveRef.current || [];
        const hrrMeasured = recCurve.length >= 2;
        const startRecHR = hrrMeasured
            ? recCurve[0].hr
            : (recoveryStartHR || (fullHRStream.length > 0 ? Math.max(...fullHRStream) : 0));
        const currentHR = latestMetricsRef.current.heartRate || cardioData.heartRate;
        const recoveryValue = hrrMeasured
            ? Math.max(0, recCurve[0].hr - recCurve[recCurve.length - 1].hr)
            : null;
        // 真實回落曲線（t = 距離停止的秒數）
        const recoveryCurveOut = hrrMeasured
            ? recCurve.map((p) => ({ t: Math.round((p.t - recCurve[0].t) / 1000), hr: p.hr }))
            : [];

        // 🔥 FIX v3: 使用 latestMetricsRef 取得最新跑步數據，避免 stale closure
        const latestData = latestMetricsRef.current;

        // ⛰️ 累積爬升 — 從 elevation 串流（每點海拔，公尺）算總上升量，寫進 summary。
        //    這樣排行榜「爬升榜」才有真實資料（原本 summary 不存，只在 stream 裡）。
        const _elevStream = (isHealthKitAvailable && !forceSimulation)
            ? [...(healthKitStreamData?.elevation || []), ...streamDataRef.current.elevation]
            : [...streamDataRef.current.elevation];
        const computeElevationGain = (arr) => {
            let gain = 0, prev = null;
            for (const v of arr) {
                if (v == null || !Number.isFinite(v)) continue;
                if (prev != null) {
                    const d = v - prev;
                    if (d > 0.5) gain += d; // 0.5m 門檻濾掉 GPS 海拔抖動
                }
                prev = v;
            }
            return Math.round(gain);
        };
        const elevationGainComputed = computeElevationGain(_elevStream) || Math.round(latestData.elevationGain || cardioData.elevationGain || 0);

        // Growth logic check just for setting passed data, actual trigger is in handleConfirmSave
        const isRecord = (targetScore && finalScore >= targetScore) || (targetType === 'challenge' && finalScore > baseline);

        // 🔥 卡路里後備推算 — 手錶沒送 kcal 時不再留白，用「體重(kg)×距離(km)×1.036」
        //    的跑步經驗公式推算，並以 calories_estimated 標記讓 UI 顯示「推算」。
        let caloriesFinal = Number(latestData.calories ?? cardioData.calories ?? 0);
        let caloriesEstimated = false;
        const distKmForCal = Number(latestData.distance || cardioData.distance || 0);
        if (!(caloriesFinal > 0) && distKmForCal > 0.05) {
            /* ⚠️ 這裡以前沒有體重就用 65kg 推算。卡路里 = 體重 × 距離 × 1.036，
               體重是編的，算出來的熱量就是編的 —— 而畫面不會說它是編的。
               沒有真實體重就不給數字；結果頁本來就有「要看跑步消耗熱量，先填體重」
               的導航（utils/biometrics 的 featureGate('runKcal')）。 */
            let weightKg = null;
            try {
                const { uStorage } = await import('../utils/userStorage');
                const cache = uStorage(getUserId()).get('user_profile_cache', {}) || {};
                const w = Number(cache.weight_kg || cache.weight || cache.current_weight || 0);
                if (w > 30 && w < 250) weightKg = w;
            } catch { /* 讀不到就是沒有 */ }
            if (weightKg) {
                caloriesFinal = Math.round(1.036 * weightKg * distKmForCal);
                caloriesEstimated = true;
            }
        }

        const newData = {
            stats: {
                ...latestData,
                score: finalScore,
                // 這個分數是心率版還是後備版 —— 兩者尺度不同，
                // 下游（肌群恢復負荷）要據此校準，否則戴不戴錶算出來的負荷會不一樣
                score_source: scoreSource,
                pace: latestData.avgPace || cardioData.avgPace,
                calories: caloriesFinal,
                calories_estimated: caloriesEstimated,
                // ⛰️ 累積爬升寫進 summary（兩種命名都給，相容後端讀取）
                elevationGain: elevationGainComputed,
                elevation_gain: elevationGainComputed,
                splits: (cardioData.splits && cardioData.splits.length > 0)
                    ? (latestData.splits || cardioData.splits)
                    : (latestData.distance > 0 ? [{
                        km: 1,
                        time: latestData.duration,
                        pace: latestData.avgPace || latestData.currentPace,
                        avgHR: latestData.heartRate,
                        timestamp: Date.now()
                    }] : []),
                zoneStats: correctZoneStats
            },
            // 🔴 Fix(A4)：沒有有效 GPS 軌跡時存空陣列，讓結算頁的「No GPS Trace」空狀態正常顯示，
            //    不再塞一個範例座標進真實資料（避免地圖出現一個落在範例點的孤點）。
            route: route.length > 1 ? route : [],
            targetScore,
            type: finalType,
            // 🔁 Plan Echo：帶上本次課表類型（快速訓練 recovery/base/progressive/hill
            //    或計劃 brick subtype）→ 結算存回聲時分類正確，下次同款會跳「上次表現」
            brick_subtype: activePlan?.subtype || activePlan?.type || null,
            brick: activePlan ? { subtype: activePlan.subtype || activePlan.type, title: activePlan.title || '' } : null,
            // 🟢 運動模式：寫進結算資料，讓結算頁/動態時間軸知道這是哪種運動。
            //    sport=run 時維持原跑步結算（完整 deep analysis）；其餘運動走精簡結算。
            sport: selectedSport,
            sportType: sportMeta.type,
            sportLabel: sportMeta.label,
            sportIcon: sportMeta.icon,
            hasElevation: sportNeedsElevation,
            isEligibleForGrowth: isRecord,
            timestamp: Date.now(),
            stream_data: {
                // 🔥 FIX: 模擬模式下只用 CardioTracker 自己的 stream（避免重複），
                //    HealthKit 模式下合併兩邊的數據
                timestamps: (isHealthKitAvailable && !forceSimulation)
                    ? [...(healthKitStreamData?.timestamps || []), ...streamDataRef.current.timestamps]
                    : [...streamDataRef.current.timestamps],
                heart_rate: (isHealthKitAvailable && !forceSimulation)
                    ? [...(healthKitStreamData?.heart_rate || []), ...streamDataRef.current.heart_rate]
                    : [...streamDataRef.current.heart_rate],
                pace: (isHealthKitAvailable && !forceSimulation)
                    ? [...(healthKitStreamData?.pace || []), ...streamDataRef.current.pace]
                    : [...streamDataRef.current.pace],
                elevation: (isHealthKitAvailable && !forceSimulation)
                    ? [...(healthKitStreamData?.elevation || []), ...streamDataRef.current.elevation]
                    : [...streamDataRef.current.elevation],
                // 🦶 步頻串流（spm）— DeviceMotion 數步器即時值；HealthKit 模式合併兩邊
                cadence: (isHealthKitAvailable && !forceSimulation)
                    ? [...(healthKitStreamData?.cadence || []), ...(streamDataRef.current.cadence || [])]
                    : [...(streamDataRef.current.cadence || [])],
                // 🦶 步幅串流（m/步）— 原始值，若無則下方 ensureGaitStreams 由 pace+cadence 推算
                stride: (isHealthKitAvailable && !forceSimulation)
                    ? [...(healthKitStreamData?.stride || []), ...(streamDataRef.current.stride || [])]
                    : [...(streamDataRef.current.stride || [])]
            },
            deepData: {
                deep_metrics: {
                    effort_density: Number(effortDensity),
                    anaerobic_ratio: calculateAnaerobicRatio(correctZoneStats),
                    recovery_hours: recHours,
                    zone_distribution: correctZoneStats,
                    // 🩹 誠實標示區間資料來源：heart_rate | estimated_pace | none
                    zone_source: zoneSource
                },
                achievements: {
                    // 🥇 v2：不再每 0.5km 洗版放里程牌 — 地圖只標「特殊點」
                    //    （該距離配速進入歷史前三的金/銀/銅獎牌），結果頁另會用
                    //    後端完整歷史重算，這裡的本地版本僅作為離線 fallback。
                    milestone_markers: calculateMilestoneAchievements(cardioData.splits, route, workoutHistory),
                    has_overall_pr: calculateMilestoneAchievements(cardioData.splits, route, workoutHistory).some(m => m.rank === 'PR')
                },
                physio_metrics: {
                    // 🫀 v2：全部改為真實計算 — 無心率數據時給 null，
                    //    結果頁會誠實顯示「未接收到心率數據」而不是畫假曲線。
                    hr_data_available: hasHRData,
                    ef: calculatedEF != null
                        ? { current: calculatedEF, avg_hr: Math.round(avgHRReal) }
                        : { current: null, avg_hr: null },
                    hrr: {
                        // 只有真的量到才給值；沒量到就是 null（UI 顯示 "--" 並說明原因）
                        value: recoveryValue,
                        curve: recoveryCurveOut,
                        measured: hrrMeasured,
                        start_hr: hrrMeasured ? startRecHR : null,
                        window_sec: hrrMeasured
                            ? Math.round((recCurve[recCurve.length - 1].t - recCurve[0].t) / 1000)
                            : 0,
                        recovery_completed: isFinal
                    },
                    decoupling: decouplingReal || { value: null, first_half_ef: null, second_half_ef: null }
                }
            }
        };

        // 🔴 Fix(bug3)：補齊步頻/步幅串流，避免結算頁出現 N/A。
        //    stride 無原始值時用「速度 ÷ (步頻/60)」由 pace+cadence 推算。
        const gait = ensureGaitStreams(newData.stream_data);
        newData.stream_data.cadence = gait.cadence;
        newData.stream_data.stride = gait.stride;
        newData.stats.avgCadence = gait.avgCadence;
        newData.stats.avgStride = gait.avgStride;

        /* 🩹 2026-08 稽核：把「這趟原本要跑多少」一起帶進結算資料。
           結算頁（CardioResultsMobile）才有辦法顯示「計劃 vs 實跑」達成率 ——
           以前排定的 10K 只跑 2K，結算頁完全不會提。
           自由跑沒有 activePlan，這兩個欄位會是 0/null，結算頁就不顯示該區塊。 */
        try {
            const plannedKm = Number(activePlan?.distance_km ?? activePlan?.distanceKm) || 0;
            if (plannedKm > 0) {
                newData.plannedDistanceKm = plannedKm;
                const actualKm = Number(newData?.stats?.distance) || 0;
                newData.completionPct = Math.max(0, Math.min(100, Math.round((actualKm / plannedKm) * 100)));
            } else {
                // 沒有計劃量 → 不評分，記 100，streakEngine 才不會誤判為未完成
                newData.completionPct = 100;
            }
        } catch { newData.completionPct = 100; }

        // 🔍 診斷：確認數據結構
        console.log('📦 生成的完整數據:', newData);
        console.log('📦 數據大小:', JSON.stringify(newData).length, 'bytes');

        setWorkoutSummary(newData); // Set to workoutSummary

        if (isFinal) {
            // 🔍 診斷：確認進入保存邏輯
            console.log('💾 isFinal = true，準備保存到後端');

            const sessionId = newData.session_id || `run_${newData.timestamp || Date.now()}`;
            const newRecord = {
                session_id: sessionId,
                effort_score: finalScore,
                type: finalType,
                timestamp: Date.now(),
                distance_km: cardioData.distance,
                splits: cardioData.splits, // 🔥 保存分段數據，用於未來的 PR 比對
                // 🥾 記錄本次選用的裝備（跑鞋）→ 圖一/排行卡牌顯示
                shoe: selectedShoe ? { id: selectedShoe.id, name: selectedShoe.name, brand: selectedShoe.brand || '' } : null,
                route: route || [],
            };
            const updatedHistory = [...workoutHistory, newRecord];
            setWorkoutHistory(updatedHistory);
            localStorage.setItem('workout_history', JSON.stringify(updatedHistory));
            localStorage.removeItem('currentRunState');
            // 🏃 跑步記憶：記這個地點與路線（跑步機沒有 GPS 路線，不記；不擋存檔）
            if (!isTreadmillMode && (selectedSport || 'run') === 'run' && Array.isArray(route) && route.length >= 5) {
                import('../utils/runMemoryRecorder')
                    .then(({ recordRunToMemory }) => recordRunToMemory(getUserId(), {
                        route, distanceKm: Number(cardioData.distance) || 0,
                        durationSec: Number(cardioData.duration) || 0,
                        type: activePlan?.subtype || activePlan?.type || null,
                    }))
                    .catch(() => {});
            }
            if (selectedShoe) addMileageToCurrentShoe(cardioData.distance);

            // 🤝 一起訓練自動偵測（仿 Strava）：拿「好友 + 全站公開」最近 session 與本趟比對時間+路線。
            //    v2：不限好友 — 非好友只要時間與路線吻合，也算一起跑（動態卡會顯示對方完賽數據）。
            //    v3：偵測改為「存檔前 await」— 把 companions 寫進 session payload 一起上雲，
            //        換裝置/重裝後依然看得到，對方的動態也能反向顯示你。localStorage 只當離線快取。
            //        單一請求 3.5s timeout，偵測失敗不阻擋、不影響存檔。
            try {
                const { detectCompanions, saveSessionCompanions, fetchTogetherPartners, mergeCompanions } =
                    await import('../utils/trainingCompanions');
                const uid = getUserId?.();
                const withTimeout = (p, ms = 3500) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
                let candidates = [];
                try {
                    const r = await withTimeout(apiClient.get(`/api/social/friends/recent-sessions/${uid}`));
                    candidates = (r?.data?.sessions || []).map((s) => ({ ...s, is_friend: true }));
                } catch (_) { /* 端點可能未上線；靜默略過 */ }
                try {
                    // 全站公開動態（非好友）— 同時間同路線也算同跑
                    const g = await withTimeout(apiClient.get(`/api/feed/global?user_id=${uid}&limit=50`));
                    const globalActs = g?.data?.activities || g?.data?.feed || g?.data || [];
                    if (Array.isArray(globalActs)) {
                        candidates = candidates.concat(
                            globalActs
                                .filter((a) => (a.user_id || a.userId) && (a.user_id || a.userId) !== uid)
                                .map((a) => ({ ...a, is_friend: false }))
                        );
                    }
                } catch (_) { /* 全站動態不可用 → 只比對好友 */ }
                const mine = { startTime: newData.timestamp || Date.now(), duration: cardioData.duration, route: route || [] };
                /* 🤝 一起跑：社群「一起練」按了加入的人是確定的，
                   GPS＋時間偵測是補充。確定的優先，合併後去重。 */
                const confirmed = await fetchTogetherPartners(uid, 'cardio');
                const companions = mergeCompanions(confirmed, detectCompanions(mine, candidates));
                if (companions.length) {
                    saveSessionCompanions(sessionId, companions);   // 本地快取（離線也看得到）
                    newData.companions = companions;                 // ⬆️ 跟 session 一起存進後端
                }
            } catch (_) { /* 偵測失敗不影響存檔 */ }
            // 🔥 Save weekly km log for Dashboard progress tracking
            try {
                const wlog = JSON.parse(localStorage.getItem('weeklyCardioLog') || '{"km":0,"sessions":[],"weekStart":null}');
                const now2 = new Date(); const wStart = new Date(now2); wStart.setDate(now2.getDate() - now2.getDay() + (now2.getDay() === 0 ? -6 : 1)); wStart.setHours(0, 0, 0, 0);
                if (!wlog.weekStart || new Date(wlog.weekStart) < wStart) { wlog.km = 0; wlog.sessions = []; wlog.weekStart = wStart.toISOString(); }
                wlog.km = +((wlog.km || 0) + (cardioData.distance || 0)).toFixed(2); wlog.sessions = [...(wlog.sessions || []), { ts: Date.now(), km: cardioData.distance || 0 }];
                localStorage.setItem('weeklyCardioLog', JSON.stringify(wlog));
                localStorage.setItem('lastCardioSession', JSON.stringify({ stats: { distance: cardioData.distance, duration: cardioData.duration, avgPace: cardioData.avgPace }, deepData: { deep_metrics: { zone_distribution: correctZoneStats } }, timestamp: Date.now() }));
            } catch (e) { console.warn('[ProgressReader] weekly log save failed', e); }

            // 🔥 同步到後端 — 一次跑步只存一次（統一走 persistCardioSession 單一入口）
            //    🔑 onSaved 內 markWorkoutSynced：讓離線同步迴圈不會把同一筆再 POST 一次
            await persistCardioSession(newData, {
                label: 'generateAndSetData',
                unlockOnEmpty: true,
                onSaved: async (sessionId, userIdToUse) => {
                    await indexedDBManager.markWorkoutSynced(
                        newData.session_id || `run_${userIdToUse}_${newData.timestamp}`
                    );
                    // 🧱 手機 GPS 跑步也要回寫課表 brick（修：從課表開始跑完卻不打勾）
                    await completeBrickIfPlanned(sessionId, userIdToUse, newData);
                },
            });
        }
    };

    const handleSkipRecovery = () => {
        setRecoveryTimer(0);
        setIsRecovering(false);
        if (!isFinalizingRef.current) {
            isFinalizingRef.current = true;
            generateAndSetData(true);
        }
    };

    const finishRecovery = () => {
        if (window.recoveryInterval) { clearInterval(window.recoveryInterval); window.recoveryInterval = null; }
        recoveryIntervalRef.current = null;
        recoveringRef.current = false;
        setIsRecovering(false);
        // ⌚ 60 秒 HRR 量測窗結束 → 現在才真正收掉手錶 session 並讓它存檔
        sendWatchCommand('STOP');
    };

    const handleCloseResults = () => {
        setShowResults(false);
        resetSession();
    };

    // 📍 Phone GPS is single source of truth — use latest route point if running,
    //    otherwise the initial fix obtained on mount; null if user denies permission.
    const currentPosition = route.length > 0
        ? route[route.length - 1]
        : (gpsInitialPosition || null);

    // ══════════════════════════════════════════════════════════════════
    // 🧭 路線導航 —— 選了路線就有 Google Maps 式的下個路口提示
    //
    //   路線是使用者在「路線探索」自己畫的 waypoints，沒有街道資料，
    //   所以我們用幾何方式解：方位角變化 → 轉彎方向，
    //   GPS 位置投影回折線 → 距離下個路口還有幾公尺。
    //   講「300 公尺後 右轉」而不是街名 — 跑步時反而更好用。
    // ══════════════════════════════════════════════════════════════════
    const navWaypoints = useMemo(
        () => (Array.isArray(selectedSavedRoute?.waypoints) ? selectedSavedRoute.waypoints : []),
        [selectedSavedRoute],
    );

    const turnSteps = useMemo(
        () => (navWaypoints.length >= 2 ? buildTurnInstructions(navWaypoints) : []),
        [navWaypoints],
    );

    const [navDismissed, setNavDismissed] = useState(false);
    // 換一條路線 → 重新啟用提示、清掉播報紀錄
    const announcedRef = useRef(new Set());
    useEffect(() => {
        setNavDismissed(false);
        announcedRef.current = new Set();
    }, [selectedSavedRoute?.segment_id, selectedSavedRoute?.name]);

    const navState = useMemo(() => {
        if (!turnSteps.length || !currentPosition) return null;
        try {
            return getNavState(currentPosition, turnSteps, navWaypoints);
        } catch (e) {
            console.warn('[nav] getNavState failed:', e?.message);
            return null;
        }
    }, [currentPosition, turnSteps, navWaypoints]);

    const showNavBanner = isTracking && !isRecovering && !showResults && !navDismissed && !!navState?.current;

    // 🔊 語音 + 震動播報：500m / 200m / 50m / 就是現在，每個路口各一次
    const offRouteAnnouncedRef = useRef(false);
    useEffect(() => {
        if (!showNavBanner || isPaused || !navState) return;

        // 偏離路線 → 只在「剛偏離」時提示一次，回到路線上就重置
        if (navState.offRoute) {
            if (!offRouteAnnouncedRef.current) {
                offRouteAnnouncedRef.current = true;
                triggerNativeHaptic?.('heavy');
                if (isVoiceEnabled()) speak('已偏離路線，請往回走回到路線上');
            }
            return;
        }
        offRouteAnnouncedRef.current = false;

        const hit = nextAnnouncement(navState.current, navState.distanceToTurnM, announcedRef.current);
        if (!hit) return;
        announcedRef.current.add(hit.key);

        // 越接近路口，震動越明確
        triggerNativeHaptic?.(hit.gate === 0 ? 'heavy' : hit.gate <= 50 ? 'medium' : 'light');
        if (isVoiceEnabled()) {
            speak(phraseFor(navState.current, hit.gate === 0 ? 0 : navState.distanceToTurnM));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [navState?.current?.i, navState?.distanceToTurnM, navState?.offRoute, showNavBanner, isPaused]);

    // Calculate Zone & Visuals
    const currentZoneInfo = getZoneInfo(cardioData.heartRate);
    const isRecordBroken = cardioData.score > targetScore || (baseline && cardioData.score > baseline);


    // Dynamic Styles based on Zone or Record Breaking
    const activeColor = isRecordBroken ? GOLDEN_STATE.color : currentZoneInfo.color;

    // 🔥 "My Notes" Pastel Theme - Dynamic Zone Colors (Matched to Effort Points Modal)
    // Using the exact colors from Figure 1 (Info Modal) - Warm Up updated to Sage Green
    const PASTEL_ZONES = {
        0: '#FDD835', // 黃色
        1: '#FDD835', // 黃色
        2: '#8BC34A', // 鮮綠
        3: '#FF9800', // 活力橘
        4: '#F06292', // 亮粉
        5: '#5C6BC0', // 深藍紫
    };

    const currentPastelInfo = {
        bg: isTracking ? (PASTEL_ZONES[currentZoneInfo.id] || PASTEL_ZONES[0]) : '#799252', // Force green when not tracking
    };

    const effortCardStyle = {
        backgroundColor: currentPastelInfo.bg + '77', // Semi-transparent pastel (47% opacity)
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        border: '1px solid rgba(255,255,255,0.25)',
        boxShadow: `0 8px 24px ${currentPastelInfo.bg}30, 0 0 0 1px rgba(255,255,255,0.1)`
    };

    const progressPercent = targetScore ? Math.min((cardioData.score / targetScore) * 100, 100) : 0;

    // ════════════════════════════════════════════════════════════════
    // 🔒 單一存檔入口 (SOP 第一階段 · 全局去重)
    //   過去有 3 處重複的 POST /api/cardio/session 區塊，payload 邏輯各自複製，
    //   是「一次跑步跳三張卡」的前端根因。現統一由 persistCardioSession 處理：
    //   共用 hasSavedToBackendRef 鎖、共用 payload、共用 session_id 寫回與
    //   IndexedDB 同步。各呼叫端只透過 onSaved callback 注入自己的後續副作用。
    // ════════════════════════════════════════════════════════════════
    const buildCardioPayload = (data, userIdToUse) => {
        // 📉 上傳前降取樣：雲端只收顯示需要的密度（HR/配速 5s、GPS 路線簡化）。
        //    完整解析度仍由 IndexedDB 在裝置本地保留；headline 數據在 metrics 不受影響。
        const { route, stream_data } = downsampleCardioForUpload({
            route: data.route,
            stream_data: data.stream_data,
        });
        return {
            user_id: userIdToUse,
            date: new Date(data.timestamp).toISOString(),
            route_data: route,
            metrics: {
                ...data.stats,
                distance_km: data.stats.distance,
                duration_seconds: data.stats.duration,
                pace_per_km: data.stats.pace,
                // 🔴 Fix(A2)：標記資料來源。模擬模式存的資料會被標成 'simulation'，
                //    讓後端/PR/統計可選擇性過濾，避免測試數據污染真實紀錄。
                source: forceSimulation ? 'simulation' : (data.stats?.source || 'gps'),
            },
            emotion: null,
            photo_url: null,
            notes: null,
            stream_data,
            // 🟢 運動模式：讓後端存正確 type，最新動態時間軸才能顯示對的圖示/名稱。
            sport: data.sport || selectedSport || 'run',
            sport_type: data.sportType || sportMeta.type,
            sport_label: data.sportLabel || sportMeta.label,
            has_elevation: data.hasElevation ?? sportNeedsElevation,
            // 🌤️ 天氣（存檔當下）：給最新動態卡片顯示溫度/天氣。
            weather: weather ? {
                temperature: weather.temperature,
                condition: weather.condition || weather.weather_main,
                uv_index: weather.uv_index,
                rain: weather.rain,
            } : null,
            location_name: weather?.location || weather?.city || null,
            // 🤝 同跑者（自動偵測）— 寫進 session 一起上雲，換裝置也看得到
            companions: Array.isArray(data.companions) && data.companions.length ? data.companions : null,
        };
    };

    // 🧱 課表 brick 回寫：這趟若由課表 brick 觸發，跑完就把 brick 標成完成（首頁課表打勾）。
    //    🩹 以前這段只綁在手錶存檔路徑(saveWorkoutData)，一般手機 GPS 跑步(generateAndSetData)
    //    不會呼叫 → 從課表點進去用手機跑，跑完課表卡永遠顯示「這堂沒做」。現抽成共用，兩條存檔路徑都呼叫。
    /* complete-brick 的 payload 抽出來：離線存檔時先存在本機紀錄裡（pending_brick），
       補送 session 後由 offlineSync 帶 session_id 回寫，不然離線跑完的磚永遠不會打勾。 */
    const buildBrickCompletion = (userIdToUse, data) => {
        if (!activePlan?.brickId) return null;
        /* 📍 在哪裡跑：週結算校準配速、換期判斷場地都要用（utils/runPlaceFeedback）。
           跑步機不拿來校準配速；爬升多的路換算成平路等效；跑點類型（操場／公園…）給換期看。 */
        const dist = Number(data?.stats?.distance) || 0;
        const durSec = Number(data?.stats?.duration) || 0;
        const rt = Array.isArray(data?.route) && data.route.length ? data.route : (Array.isArray(route) ? route : []);
        let place = null;
        try { if (!isTreadmillMode && rt.length) place = findRunPlaceNear(loadRunMemory(userIdToUse), rt[0]); } catch { /* 沒記憶就不帶 */ }
        const elev = Number(data?.stats?.elevation_gain ?? data?.stats?.elevationGain);
        return {
            user_id: userIdToUse,
            brick_id: activePlan.brickId,
            actual_distance_km: data?.stats?.distance ?? null,
            actual_duration_min: data?.stats?.duration ? Math.round(data.stats.duration / 60) : null,
            target_distance_km: activePlan.distance_km ?? activePlan.distanceKm ?? null,
            actual_pace_sec: dist > 0 && durSec > 0 ? Math.round(durSec / dist) : null,
            actual_elev_gain_m: !isTreadmillMode && Number.isFinite(elev) && elev >= 0 ? Math.round(elev) : null,
            actual_indoor: !!isTreadmillMode,
            actual_place_id: place?.id || null,
            actual_place_name: place?.name || null,
            actual_place_kind: place?.kind || null,
        };
    };

    const completeBrickIfPlanned = async (sessionId, userIdToUse, data) => {
        let payload = null;
        try { payload = buildBrickCompletion(userIdToUse, data); } catch (e) { console.warn('🧱 [Brick] payload 失敗:', e?.message); }
        if (!payload) return;
        payload = { ...payload, session_id: sessionId };
        try {
            await apiClient.post('/api/cardio-plan/complete-brick', payload);
            console.log('🧱 [Brick] Marked complete:', activePlan.brickId);
            // 磚狀態改了 → 重抓本週，Cover Flow／週結算判定才會看到這趟已完成
            try { refreshWeekBricks?.(); } catch { /* 下次進來會重抓 */ }
        } catch (brickErr) {
            console.warn('🧱 [Brick] complete-brick failed:', brickErr?.message);
            // 以前失敗只印 console，課表默默沒打勾。現在講出來，並排隊等連線後補送。
            queueBrickCompletion(payload);
            toast.error('這趟已存檔，但課表打勾沒成功；連上網路後會自動補上');
        }
    };

    const persistCardioSession = async (data, { label = 'save', onSaved, unlockOnEmpty = false } = {}) => {
        const userIdToUse = getUserId();
        // 🛡 防重複：所有存檔路徑共用同一把鎖
        if (hasSavedToBackendRef.current) {
            console.log(`⏭️ 此次跑步已存檔，略過 ${label} 重複存檔`);
            return null;
        }
        hasSavedToBackendRef.current = true;

        /* 🦵 把這趟跑步記進肌群恢復系統。
           ⚠️ 以前只有重訓頁在寫（recordWorkoutCompletion），所以跑再多，
              身體恢復圖都還是全綠 —— 那張圖等於沒把跑步算進去。
              放在網路請求之前：跑步已經發生了，後端存不存得起來是另一回事，
              身體的疲勞不會因為連線失敗就消失。 */
        try {
            recordCardioCompletion(userIdToUse, {
                // ⭐ 努力值優先：它是逐秒依心率 Zone 加權算的，看得到強度；
                //    距離看不到 —— 同樣 5 公里，Z2 輕鬆跑跟節奏跑的帳差很多。
                effortScore: Number(data?.stats?.score),
                effortSource: data?.stats?.score_source,
                distanceKm: Number(data?.stats?.distance ?? data?.distance_km ?? data?.distance),
                durationMin: Number(data?.stats?.duration) > 0
                    ? Number(data.stats.duration) / 60 : undefined,
                sport: data?.sport || selectedSport || 'run',
                label: data?.sportLabel || sportMeta?.label,
            });
        } catch (e) { console.warn('[recovery] 記錄跑步負荷失敗:', e?.message); }

        try {
            const payload = buildCardioPayload(data, userIdToUse);
            // 📍 地點升級：天氣 API 只給到城市（Taipei / Current Location）；
            //    有 GPS 路線就用「起點」反解出區級地名（例：大安區 · 台北市），動態卡更精準。
            try {
                const start = Array.isArray(payload.route_data) ? payload.route_data[0] : null;
                if (start) {
                    const { reverseGeocodeName } = await import('../utils/locationName');
                    const fine = await reverseGeocodeName(
                        Number(start.lat ?? start[0]), Number(start.lng ?? start[1])
                    );
                    if (fine) payload.location_name = fine;
                }
            } catch (_) { /* 反解失敗 → 保留天氣城市名 */ }
            const response = await apiClient.post('/api/cardio/session', payload);
            console.log('✅ 後端同步成功:', response.data);

            const sessionId = response.data?.session_id || null;
            if (sessionId) {
                localStorage.setItem('lastSavedSessionId', sessionId);
                setWorkoutSummary(prev => prev ? { ...prev, sessionId } : prev);
                await indexedDBManager.saveWorkout(userIdToUse, { ...data, synced: true });
                if (onSaved) await onSaved(sessionId, userIdToUse);
                // 回報此次跑步距離給進行中的協作（達標時後端自動判定完成）
                try {
                    const km = Number(data?.distance_km ?? data?.distance ?? 0);
                    if (km > 0) reportCollabProgress({ userId: userIdToUse, type: 'Run', amount: km });
                } catch (_) { }
            } else if (unlockOnEmpty) {
                // 後端沒回 session_id → 解鎖，讓結算頁 fallback 存檔有機會補救
                hasSavedToBackendRef.current = false;
            }
            return sessionId;
        } catch (error) {
            console.error('❌ 後端同步失敗，保存在本地等待同步:', error);
            hasSavedToBackendRef.current = false; // 失敗解鎖，允許重試
            // 從課表磚開始的這趟 → 把磚資訊一起存進本機紀錄，offlineSync 補送後才能回寫打勾
            let pendingBrick = null;
            try { pendingBrick = buildBrickCompletion(userIdToUse, data); } catch { /* 沒磚就不帶 */ }
            await indexedDBManager.saveWorkout(userIdToUse, pendingBrick ? { ...data, pending_brick: pendingBrick } : data);
            return null;
        }
    };

    const saveWorkoutData = async (data) => {
        // 🧱 Phase 2-B — 如果這次 session 是由 brick 觸發，回寫 brick 為已完成
        //    失敗不阻擋主流程（session 已存成功），下次 inbox 重整時會看到狀態還是 pending
        await persistCardioSession(data, {
            label: 'saveWorkoutData',
            // 🧱 手錶存檔路徑同樣走共用的 brick 回寫（與手機 GPS 路徑一致，避免兩邊邏輯分叉）
            onSaved: async (sessionId, userIdToUse) => {
                await completeBrickIfPlanned(sessionId, userIdToUse, data);
            },
        });
    };

    /* 低於這個量的跑步視為「可能是誤觸或臨時取消」，結束前先問一次。
       數字刻意訂得很低：只擋明顯不是一趟訓練的情況，不干擾正常短跑。 */
    const MIN_MEANINGFUL_KM = 0.3;
    const MIN_MEANINGFUL_SEC = 120;

    const finishWorkout = async (skipShortCheck = false) => {
        triggerNativeHaptic('heavy');

        /* 🩹 2026-08 稽核：這裡原本一路直達 handleFinish()，沒有任何下限檢查。
           跑 10 公尺長按結束 → 存檔 → complete-brick 標成完成 → 首頁打勾。
           現在極短的跑步會先問一次；使用者仍可選擇記錄（不阻擋）。 */
        if (!skipShortCheck) {
            const km = Number(latestMetricsRef.current?.distance ?? cardioData.distance ?? 0) || 0;
            const sec = Number(latestMetricsRef.current?.duration ?? cardioData.duration ?? 0) || 0;
            if (km < MIN_MEANINGFUL_KM && sec < MIN_MEANINGFUL_SEC) {
                setShortFinishAsk({ km, sec, proceed: () => finishWorkout(true) });
                return;
            }
        }

        // 🔥 FIX: 不再透過 HealthKit hook 的 endWorkout callback（它不包含本地模擬數據），
        //    改為走 handleFinish → recovery → generateAndSetData 的正確路線，
        //    這樣才能拿到 CardioTracker 累積的 streamDataRef、zoneStats、score
        if (isHealthKitAvailable && !forceSimulation) {
            // 真正的 HealthKit 環境：結束 workout session
            // 但仍然走 handleFinish 路線，讓 generateAndSetData 合併數據
            endHealthKitWorkout();
        }
        // 走統一的停止流程（recovery → save confirm → generateAndSetData）
        handleFinish();
    };

    // 🛑 長按結束：按下開始計時，進度環填滿到 1.0 才真正 finishWorkout()。
    const beginFinishHold = useCallback((e) => {
        // 避免觸控同時觸發滑鼠事件造成重複
        if (e && e.type === 'mousedown' && 'ontouchstart' in window) return;
        triggerNativeHaptic('light');
        finishHoldStartRef.current = performance.now();
        finishHapticStepRef.current = 0;

        const tick = () => {
            const elapsed = performance.now() - finishHoldStartRef.current;
            const p = Math.min(1, elapsed / FINISH_HOLD_MS);
            setFinishHoldProgress(p);

            // 每 1/3 進度給一次漸強震動，讓使用者感覺「快了」
            const step = Math.floor(p * 3);
            if (step > finishHapticStepRef.current) {
                finishHapticStepRef.current = step;
                triggerNativeHaptic(step >= 3 ? 'heavy' : 'medium');
            }

            if (p >= 1) {
                finishHoldRafRef.current = null;
                setFinishHoldProgress(0);
                finishWorkout();
                return;
            }
            finishHoldRafRef.current = requestAnimationFrame(tick);
        };
        finishHoldRafRef.current = requestAnimationFrame(tick);
    }, [triggerNativeHaptic]);

    // 🆕 使用者在跑步機提示彈窗按下「我知道了，開始跑」後執行
    const confirmStartFromTreadmillHint = () => {
        localStorage.setItem('treadmill_hint_seen', 'true');
        setShowTreadmillHint(false);
        setStartTime(Date.now());
        startHealthKitWorkout();
    };

    // 🔥 Modified Recording Toggle
    const toggleRecording = () => {
        if (healthKitIsActive) {
            pauseHealthKitWorkout();
            setPauseTime(Date.now());
            triggerNativeHaptic('medium');
            setShowFinishConfirm(true);
            sendWatchCommand('PAUSE');
        } else {
            if (startTime === null) {
                // 🆕 跑步機模式 + 從未看過提示 → 先彈一次性提醒，按確認後再進入流程
                if (
                    isTreadmillMode &&
                    localStorage.getItem('treadmill_hint_seen') !== 'true'
                ) {
                    setShowTreadmillHint(true);
                    return; // 等使用者按下確認後在 confirmStartFromTreadmillHint 觸發實際 start
                }
                setStartTime(Date.now());
                startHealthKitWorkout();
                sendWatchCommand('START');
            } else {
                resumeHealthKitWorkout();
                setTotalPausedTime(prev => prev + (Date.now() - pauseTime));
                sendWatchCommand('RESUME');
            }
            triggerNativeHaptic('heavy');
        }
    };

    // ... Overlays
    // if (showHistory) { navigate('/running-analytics-mobile'); return null; } // ⚠️ User code used navigate, but we stick to overlay to preserve timer state

    return (
        <>
            <FontStyle />
            {/* Sync indicator moved to toolbar row */}




            <div
                className={`relative z-10 w-full${(mapStyle === 'dark' || mapStyle === 'satellite') ? ' cardio-darkmap' : ''}`}
                style={{
                    width: '100%',
                    margin: '0 auto',
                    backgroundColor: 'transparent',
                    position: 'relative',
                    /* 🩹 起跑前／跑步中這一頁是「地圖 + 浮動面板」，浮動面板全都是
                       absolute/fixed，沒有任何需要捲動的內容。以前只設 minHeight，
                       裡面又有一塊 height:100dvh 的地圖，加上外層 #root 的 100dvh，
                       總高度會超過一個視窗 → 往下滑會露出底部黑色空白。
                       這裡直接把高度鎖死成一個視窗並關掉溢出；
                       只有結算頁（showResults）才需要真的捲動。 */
                    ...(showResults
                        ? { minHeight: '100dvh', overflow: 'visible' }
                        : {
                            height: '100dvh',
                            maxHeight: '100dvh',
                            overflow: 'hidden',
                            overscrollBehavior: 'none',
                        }),
                    // 📏 跑步中放大主數字，利於移動中掃視
                    '--cardio-metric-size': isTracking ? '40px' : '28px',
                }}
            >

                {/* 📶 GPS 訊號燈號 — 固定螢幕右上角，起跑前/跑步中都能確認定位品質 */}
                {(() => {
                    const acc = gpsAccuracy;
                    const level = acc == null ? 'searching'
                        : acc <= 12 ? 'strong'
                        : acc <= 30 ? 'fair'
                        : 'weak';
                    const cfg = {
                        searching: { dot: '#9CA3AF', text: 'GPS 搜尋中', bars: 0 },
                        weak:      { dot: '#E5484D', text: 'GPS 訊號弱', bars: 1 },
                        fair:      { dot: '#D69E2E', text: 'GPS 普通',   bars: 2 },
                        strong:    { dot: '#3DA35D', text: 'GPS 良好',   bars: 3 },
                    }[level];
                    return (
                        <div
                            className="fixed z-[60] pointer-events-none"
                            style={{
                                // ⬇️ 往下移，避免擋到上方總進度條的數值
                                top: 'calc(env(safe-area-inset-top, 12px) + 46px)',
                                right: 'calc(env(safe-area-inset-right, 0px) + 12px)',
                            }}
                        >
                            <div className="h-7 px-2.5 rounded-full flex items-center gap-1.5"
                                style={{
                                    background: 'rgba(255,255,255,0.78)',
                                    backdropFilter: 'blur(20px) saturate(1.5)',
                                    WebkitBackdropFilter: 'blur(20px) saturate(1.5)',
                                    border: '1px solid rgba(255,255,255,0.85)',
                                    boxShadow: '0 4px 12px -2px rgba(0,0,0,0.12)',
                                }}
                                aria-label={cfg.text}
                            >
                                <span className="flex items-end gap-[2px]" style={{ height: 11 }}>
                                    {[1, 2, 3].map((b) => (
                                        <span key={b} style={{
                                            width: 3,
                                            height: 3 + b * 3,
                                            borderRadius: 1,
                                            background: b <= cfg.bars ? cfg.dot : 'rgba(22,20,21,0.16)',
                                            transition: 'background 0.3s ease',
                                        }} />
                                    ))}
                                </span>
                                <span className="text-[9px] font-black tracking-[0.08em] uppercase tabular-nums" style={{ color: cfg.dot }}>
                                    {acc != null ? `±${Math.round(acc)}m` : 'GPS'}
                                </span>
                                {level === 'searching' && (
                                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: cfg.dot }} />
                                )}
                            </div>
                        </div>
                    );
                })()}

                {/* 📍 GPS 定位提示橫幅 — 權限被關 / 長時間沒訊號時引導使用者 */}
                <AnimatePresence>
                    {gpsPrompt && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                            className="fixed z-[59]"
                            style={{ top: 'calc(env(safe-area-inset-top, 12px) + 50px)', left: 16, right: 16 }}
                        >
                            <div style={{
                                borderRadius: 18, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
                                background: 'rgba(22,20,21,0.92)', border: '1px solid rgba(255,255,255,0.1)',
                                boxShadow: '0 12px 30px rgba(0,0,0,0.3)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                            }}>
                                <MapPin size={20} style={{ color: '#F95C4B', flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: 13, fontWeight: 800, color: '#F6F4F1', margin: 0 }}>
                                        {gpsPrompt === 'denied' ? '定位權限已關閉'
                                            : gpsPrompt === 'acquiring' ? '正在獲取位置…'
                                            : '搜尋不到 GPS 訊號'}
                                    </p>
                                    <p style={{ fontSize: 11, color: 'rgba(246,244,241,0.6)', margin: '2px 0 0', lineHeight: 1.4 }}>
                                        {gpsPrompt === 'denied'
                                            ? '到設定開啟「定位服務」才能記錄路線與配速'
                                            : gpsPrompt === 'acquiring'
                                                ? '正在搜尋衛星訊號，通常幾秒內完成 — 可以先開跑，鎖定後會自動記錄路線'
                                                : '請先確認定位已開啟，並移到戶外或開闊處；室內可改用跑步機模式'}
                                    </p>
                                </div>
                                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                                    {gpsPrompt !== 'acquiring' && (
                                        <motion.button {...pressProps('row')} onClick={openLocationSettings}
 style={{ padding: '8px 14px', borderRadius: 12, background: '#F95C4B', border: 'none', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>前往設定</motion.button>
                                    )}
                                    {gpsPrompt === 'acquiring' && (
                                        <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#F95C4B', flexShrink: 0 }} />
                                    )}
                                    {gpsPrompt === 'nosignal' && (
                                        <motion.button {...pressProps('row')} onClick={() => setGpsPrompt(null)}
 style={{ padding: '8px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#F6F4F1', fontSize: 12, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>知道了</motion.button>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Recovery Pill removed from Tracker - now only shows in CardioResultsMobile */}

                {/* ❤️ 心率狀態提示 — 起跑後短暫顯示一次，依真實心率狀態切換文案，自動消失 */}
                <AnimatePresence>
                    {hrStatusHint && (
                        <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                            className="fixed left-1/2 z-[60] pointer-events-none"
                            style={{ top: 'calc(env(safe-area-inset-top, 12px) + 48px)', transform: 'translateX(-50%)' }}
                        >
                            <div className="flex items-center gap-2 px-3.5 py-2 rounded-full"
                                style={{
                                    background: hrStatusHint === 'connected' ? 'rgba(61,163,93,0.92)' : 'rgba(22,20,21,0.88)',
                                    backdropFilter: 'blur(18px) saturate(1.5)',
                                    WebkitBackdropFilter: 'blur(18px) saturate(1.5)',
                                    border: '1px solid rgba(255,255,255,0.22)',
                                    boxShadow: '0 6px 16px rgba(0,0,0,0.22)',
                                }}
                            >
                                <Heart size={13} strokeWidth={2.6}
                                    style={{ color: '#FFFFFF' }}
                                    fill={hrStatusHint === 'connected' ? '#FFFFFF' : 'none'} />
                                <span className="text-[11px] font-black tracking-[0.04em] text-white whitespace-nowrap">
                                    {hrStatusHint === 'connected' ? '已連接手錶 · 心率記錄中' : '未偵測到心率 · 已用 GPS 記錄'}
                                </span>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* 🧪 模擬數據警示 — 只要 force_simulation 開著且正在追蹤，就「持續」顯示，
                    讓使用者絕不會把模擬數據誤當成真實量測（沒接上就要讓使用者知道）。 */}
                {forceSimulation && isTracking && !showResults && (
                    <div
                        className="fixed left-1/2 z-[70] pointer-events-none"
                        style={{ top: 'calc(env(safe-area-inset-top, 12px) + 12px)', transform: 'translateX(-50%)' }}
                    >
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                            style={{
                                background: 'rgba(249,92,75,0.94)',
                                backdropFilter: 'blur(16px) saturate(1.4)',
                                WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
                                border: '1px solid rgba(255,255,255,0.28)',
                                boxShadow: '0 6px 16px rgba(0,0,0,0.24)',
                            }}
                        >
                            <span className="text-[11px] font-black tracking-[0.04em] text-white whitespace-nowrap">
                                🧪 模擬數據（非真實量測）
                            </span>
                        </div>
                    </div>
                )}

                {/* 🌟 Ambient Glow — 跑步中四周發光：一律走 mode="zone"（心率 Zone 配色）。
                    配速快/慢/剛好的回饋全部收進下方 panel 的 ±s/km 條與光球，
                    外圈氛圍燈只負責「現在身體在哪個心率 Zone」，職責分離不混淆。
                    呼吸節奏 tempo 仍依當前 step 名稱驅動（暖身慢、衝刺急），帶動步頻但不改變顏色語意。 */}
                {isTracking && !showResults && (() => {
                    const currentStep = activePlan ? getCurrentPlanStep(activePlan, cardioData.duration) : null;
                    // 🌬 呼吸節奏：有計劃時依 step.name，自由跑維持 normal
                    const tempo = currentStep ? resolveTempo(currentStep) : 'normal';
                    // 🩶 無心率 → 中性呼吸光（柔白），不再假裝「暖身區」配色誤導使用者。
                    //    有心率 → 依 Zone 配色（原行為）。
                    const hasHR = cardioData.heartRate > 0;
                    const zone = hasHR ? getZoneInfo(cardioData.heartRate) : null;
                    return (
                        <RunAmbientGlow
                            mode="zone"
                            zoneId={hasHR ? zone?.id : 0}
                            zoneColor={hasHR ? zone?.color : 'rgba(214, 211, 209, 0.85)'}
                            active={isTracking && !isPaused}
                            intensity={isPaused ? 0.4 : (hasHR ? 1 : 0.7)}
                            tempo={tempo}
                        />
                    );
                })()}

                {/* 💊 Step Capsule Strip — 跑計劃時頂部膠囊進度條，眼角餘光一掃掌握全局 */}
                {isTracking && !showResults && activePlan && (() => {
                    const currentStep = getCurrentPlanStep(activePlan, cardioData.duration);
                    if (!currentStep) return null;
                    return (
                        <div
                            style={{
                                position: 'fixed',
                                top: 'calc(env(safe-area-inset-top, 0) + 6px)',
                                left: 0, right: 0, zIndex: 39,
                                pointerEvents: 'none',
                            }}
                        >
                            <StepCapsuleStrip
                                steps={activePlan.steps}
                                currentIndex={currentStep.index}
                                stepRemaining={currentStep.stepRemaining}
                                currentPace={cardioData.currentPace}
                            />
                        </div>
                    );
                })()}

                {/* 🔍 Macro Focus Overlay — 衝刺/全力/極限 step 自動啟動，地圖壓暗、巨大化倒數
                    💯 同時接 RPE 體感量表，把「絕對 pace」推到從屬位置 */}
                {isTracking && !showResults && activePlan && (() => {
                    const currentStep = getCurrentPlanStep(activePlan, cardioData.duration);
                    if (!currentStep) return null;
                    const focusOn = isSprintStep(currentStep) && !isPaused;
                    // 💯 即時 RPE：優先 HR，無心率則 fallback pace，再 fallback step band 中位
                    const stepBand = getStepRpeBand(currentStep);
                    const baseline5K = Number(localStorage.getItem('baseline_pace_5k')) || null;
                    const { rpe: currentRpe } = resolveCurrentRPE({
                        heartRate: cardioData.heartRate,
                        hrZones: heartRateZones,
                        currentPace: cardioData.currentPace,
                        baselinePace5K: baseline5K,
                        fallbackRpeBand: stepBand,
                    });
                    return (
                        <MacroFocusOverlay
                            visible={focusOn}
                            currentStep={currentStep}
                            flashSignal={flashSignal}
                            formatDuration={formatDuration}
                            formatPace={formatPace}
                            currentRpe={currentRpe}
                        />
                    );
                })()}

                {/* 🖥️ 全螢幕儀表板模式 — 把手機平放當儀表板，只看數據 + zone 氛圍燈 */}
                {isTracking && !showResults && (() => {
                    const dashStep = activePlan ? getCurrentPlanStep(activePlan, cardioData.duration) : null;
                    const goalKm = activePlan?.distance_km ?? location.state?.day?.distance_km ?? location.state?.brick?.distance_km ?? null;
                    return (
                        <DashboardMode
                            open={dashboardMode}
                            onClose={() => setDashboardMode(false)}
                            cardioData={cardioData}
                            activePlan={activePlan}
                            currentStep={dashStep}
                            goalDistanceKm={goalKm}
                            segmentPaces={segmentPaces}
                            brick={location.state?.brick || activePlan}
                            isPaused={isPaused}
                            onTogglePause={handleToggle}
                            zoneInfo={getZoneInfo(cardioData.heartRate)}
                            route={route}
                            currentPosition={currentPosition}
                            formatDuration={formatDuration}
                            formatPace={formatPace}
                            safeFixed={safeFixed}
                        />
                    );
                })()}

                {/* 🔥🔥 2. Tracker Layer (主畫面) - Flattened to block to allow native scroll 🔥🔥 */}
                <div className="w-full" style={{ display: showResults ? 'none' : 'block', backgroundColor: 'transparent' }}>

                    {/* Header */}
                    <AnimatePresence>
                        {!isTracking && (
                            <motion.div
                                initial={{ opacity: 0, y: -20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20, pointerEvents: 'none' }}
                                transition={{ duration: 0.3 }}
                                className="absolute top-0 w-full px-8 pb-2 flex items-start justify-between z-40 pointer-events-none" style={{ paddingTop: 'max(64px, calc(env(safe-area-inset-top, 48px) + 12px))' }}>
                                <div className="pointer-events-auto z-10 w-10 flex justify-start" style={{ marginLeft: '-14px' }}>
                                    <motion.button {...pressProps('icon')} onClick={() => navigate('/mobile-home')} className="w-10 h-10 rounded-full flex items-center justify-center relative overflow-hidden"
 style={{
 // 真 · 液態玻璃：低 alpha 讓地圖透出來（原本 0.55~0.66 太實，像不透明灰球）
 background: 'linear-gradient(135deg, rgba(120,113,108,0.30) 0%, rgba(87,83,78,0.34) 55%, rgba(68,64,60,0.40) 100%)',
 backdropFilter: 'blur(20px) saturate(1.9)',
 WebkitBackdropFilter: 'blur(20px) saturate(1.9)',
 borderTop: '1.5px solid rgba(245,242,238,0.7)',
 borderLeft: '1px solid rgba(231,226,220,0.45)',
 borderRight: '1px solid rgba(60,56,52,0.25)',
 borderBottom: '1px solid rgba(41,37,36,0.30)',
 boxShadow: '0 8px 22px -6px rgba(41,37,36,0.32), inset 0 1.5px 2px rgba(250,248,245,0.5)'
 }}
 >
                                        {/* 頂部高光弧 — Liquid Glass 特徵 */}
                                        <span className="absolute top-0 left-[12%] right-[12%] h-[42%] pointer-events-none" style={{
                                            background: 'linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 100%)',
                                            borderRadius: '0 0 50% 50%',
                                        }} />
                                        <ArrowLeft size={20} color={C.paper} className="relative z-10" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }} />
                                    </motion.button>
                                </div>
                                <div className="flex flex-col items-center gap-3 mt-14 pointer-events-auto absolute left-1/2 -translate-x-1/2 z-10">

                                    {/* ── Navbar pill — full Liquid Glass ── */}
                                    <div data-onboard="run-toolbar" className="flex items-center gap-1.5 px-2 py-2 rounded-[28px] relative overflow-hidden z-10" style={{
                                        background: 'linear-gradient(160deg, rgba(255,255,255,0.68) 0%, rgba(255,255,255,0.38) 45%, rgba(255,255,255,0.55) 100%)',
                                        backdropFilter: 'blur(48px) saturate(2.8) brightness(1.12)',
                                        WebkitBackdropFilter: 'blur(48px) saturate(2.8) brightness(1.12)',
                                        border: '1px solid rgba(255,255,255,0.85)',
                                        borderTop: '1.5px solid rgba(255,255,255,0.98)',
                                        boxShadow: '0 16px 40px -10px rgba(0,0,0,0.18), 0 4px 16px -4px rgba(0,0,0,0.08), inset 0 2px 6px rgba(255,255,255,0.82), inset 0 -2px 4px rgba(0,0,0,0.04)',
                                    }}>
                                        {/* 頂部高光弧 — Liquid Glass 核心特徵 */}
                                        <span className="absolute top-0 left-[4%] right-[4%] h-[45%] pointer-events-none" style={{
                                            background: 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.0) 70%)',
                                            borderRadius: '0 0 50% 50%',
                                        }} />
                                        {/* 底部折射層 */}
                                        <span className="absolute bottom-0 left-0 right-0 h-[25%] pointer-events-none" style={{
                                            background: 'linear-gradient(0deg, rgba(255,255,255,0.22) 0%, transparent 100%)',
                                            borderRadius: '0 0 32px 32px',
                                        }} />

                                        {/* Sync indicator */}
            {/* 右上角浮動雲朵（同步狀態）已移除 —— 離線補送改由 App.jsx 全域掛載，
                不需要常駐 UI。 */}
                                        <div className="w-px h-5 mx-0.5" style={{ background: 'rgba(22,20,21,0.08)' }} />

                                        {/* Coach — Deep Black 實心主按鈕（整條 bar 的主從焦點，靠深淺層次而非第二個 Coral）。
                                            計劃信箱維持暖灰玻璃當次要；教練最重，一眼看出主操作。
                                            「已載入計劃」時右上角小珊瑚點作狀態提示，是這顆唯一允許的一點 Coral。 */}
                                        <motion.button {...pressProps('pill')}
 data-onboard="run-coach"
 onClick={() => { triggerNativeHaptic('medium'); setShowTrainingPlans(true); }}
 className="h-10 px-4 rounded-full flex items-center gap-1.5 relative overflow-hidden"
 aria-label="打開訓練計劃"
 style={{
 // 深石墨灰 #2A2724 實心（收斂版：比純黑柔，主從仍在但不搶）
 background: 'linear-gradient(145deg, rgba(60,56,53,0.92) 0%, rgba(42,39,36,0.94) 55%, rgba(32,29,27,0.95) 100%)',
 backdropFilter: 'blur(24px) saturate(140%)',
 WebkitBackdropFilter: 'blur(24px) saturate(140%)',
 border: '1px solid rgba(255,255,255,0.10)',
 borderTop: '1px solid rgba(255,255,255,0.20)',
 // 陰影對稱、不下偏，讓深色鈕的視覺重心與計劃信箱對齊（解決「看起來矮一截」）
 boxShadow: '0 6px 16px -6px rgba(42,39,36,0.30), inset 0 1px 2px rgba(255,255,255,0.18), inset 0 -1px 3px rgba(0,0,0,0.22)'
 }}
 >
                                            {/* 頂部高光弧 (Liquid Glass 特徵 — 深色版) */}
                                            <span className="absolute top-0 left-[10%] right-[10%] h-[42%] pointer-events-none" style={{
                                                background: 'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.0) 100%)',
                                                borderRadius: '0 0 50% 50%',
                                            }} />

                                            <Activity size={14} strokeWidth={2.4} style={{ color: C.paper }} className="relative z-10" />
                                            <span className="text-[12px] font-black tracking-[0.04em] relative z-10" style={{ color: C.paper }}>教練</span>
                                            {activePlan && <div className="absolute top-1 right-1.5 w-1.5 h-1.5 bg-[#F95C4B] rounded-full" style={{ boxShadow: '0 0 4px rgba(249,92,75,0.6)' }} />}
                                        </motion.button>

                                        {/* Inbox — 白色 Liquid Glass */}
                                        <motion.button {...pressProps('pill')}
 data-onboard="run-plan-inbox"
 onClick={() => { triggerNativeHaptic('medium'); navigate('/cardio-microcycle-inbox'); }}
 className="h-10 px-4 rounded-full flex items-center gap-1.5 relative overflow-hidden"
 aria-label="Plan Inbox"
 style={{
 // Pebble 漸層底色 Liquid Glass
 background: 'linear-gradient(145deg, rgba(207, 198, 184, 0.62) 0%, rgba(207, 198, 184, 0.28) 100%)',
 backdropFilter: 'blur(36px) saturate(160%)',
 WebkitBackdropFilter: 'blur(36px) saturate(160%)',
 border: '1px solid rgba(207, 198, 184, 0.55)',
 // 頂部高光邊緣
 borderTop: '1px solid rgba(255, 255, 255, 0.9)',
 // 實體下拉陰影 + 內部邊緣立體感
 boxShadow: '0 8px 20px -4px rgba(43,39,34,0.12), inset 0 1px 2px rgba(255, 255, 255, 0.75), inset 0 -1px 2px rgba(43,39,34,0.06)'
 }}
 >
                                            {/* 頂部高光弧 (Liquid Glass 反射特徵) */}
                                            <span className="absolute top-0 left-[10%] right-[10%] h-[45%] pointer-events-none" style={{
                                                background: 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.0) 70%)',
                                                borderRadius: '0 0 50% 50%',
                                            }} />

                                            <Calendar size={14} strokeWidth={2.4} style={{ color: C.ink }} className="relative z-10" />
                                            <span className="text-[12px] font-black tracking-[0.04em] relative z-10" style={{ color: C.ink }}>計劃</span>
                                        </motion.button>

                                        {/* More — icon-only glass circle */}
                                        <motion.button {...pressProps('icon')}
 ref={moreButtonRef}
 data-onboard="run-more"
 onClick={(e) => { e.stopPropagation(); triggerNativeHaptic('light'); setShowMoreMenu(v => !v); }}
 className="w-10 h-10 rounded-full flex items-center justify-center relative overflow-hidden"
 aria-label="More tools"
 style={{
 background: showMoreMenu
 ? 'linear-gradient(145deg, rgba(22,20,21,0.14) 0%, rgba(22,20,21,0.08) 100%)'
 : 'linear-gradient(145deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.18) 100%)',
 backdropFilter: 'blur(20px) saturate(1.8)',
 WebkitBackdropFilter: 'blur(20px) saturate(1.8)',
 border: '1px solid rgba(255,255,255,0.60)',
 borderTop: '1px solid rgba(255,255,255,0.80)',
 boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.65)',
 transform: showMoreMenu ? 'rotate(90deg)' : 'rotate(0deg)',
 transitionDuration: '200ms',
 }}
 >
                                            <span className="absolute top-0 left-[10%] right-[10%] h-[40%] pointer-events-none" style={{
                                                background: 'linear-gradient(180deg, rgba(255,255,255,0.48) 0%, rgba(255,255,255,0.0) 100%)',
                                                borderRadius: '0 0 50% 50%',
                                            }} />
                                            <MoreHorizontal size={16} strokeWidth={2.5} style={{ color: showMoreMenu ? C.ink : 'rgba(22,20,21,0.65)' }} className="relative z-10" />
                                        </motion.button>
                                    </div>

                                    {/* ── Top Advice Carousel ──────────────────────
                                       橫向可滑動卡片區（NRC-style），放在工具列下方
                                       - Card 1: 時段感知天氣 / 紫外線 / 提醒
                                       - Card 2: 下一個未完成 brick (有時才出)
                                       Liquid Glass 質感 + scroll-snap + 自動指示點 */}
                                    <TopAdviceCarousel
                                        weather={weather}
                                        bricks={thisWeekBricks}
                                        onPreview={(brick) => setCoverFlowPreviewBrick(brick)}
                                        todayDone={todayRunSummary}
                                        planAction={planState === RUN_PLAN_ACTIVE ? null : planAction}
                                        onNavigate={(to) => { triggerNativeHaptic('light'); navigate(to); }}
                                    />
                                </div>
                                <div className="pointer-events-none z-10 w-12"></div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Tracking Dynamic Island */}
                    <AnimatePresence>
                        {isTracking && (
                            <motion.div
                                initial={{ y: -50, opacity: 0, scale: 0.9 }}
                                animate={{ y: 0, opacity: 1, scale: 1 }}
                                exit={{ y: -50, opacity: 0, scale: 0.9 }}
                                transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                                className="absolute top-0 w-full flex justify-center z-50 pointer-events-none"
                                style={{ paddingTop: 'max(16px, env(safe-area-inset-top, 48px))' }}
                            >
                                <DynamicMusicIsland />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* 3-Second Countdown Overlay — Swiss Minimal Sport */}
                    <AnimatePresence>
                        {startCountdown !== null && (
                            <motion.div
                                className="fixed inset-0 z-[99999] flex flex-col items-center justify-center pointer-events-none"
                                style={{ background: 'rgba(14,12,11,0.78)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.25 }}
                            >
                                {/* Top eyebrow — editorial hairline label */}
                                <motion.div
                                    initial={{ opacity: 0, y: -6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex items-center gap-3 mb-14"
                                >
                                    <span style={{ width: 28, height: 1, background: 'rgba(255,255,255,0.3)' }} />
                                    <span className="text-[9px] font-bold tracking-[0.5em] uppercase" style={{ color: 'rgba(255,255,255,0.55)', fontFamily: '"Geist Mono","JetBrains Mono",monospace' }}>
                                        Get Ready
                                    </span>
                                    <span style={{ width: 28, height: 1, background: 'rgba(255,255,255,0.3)' }} />
                                </motion.div>

                                {/* Ring + number */}
                                <div className="relative flex items-center justify-center" style={{ width: 220, height: 220 }}>
                                    <svg width="220" height="220" viewBox="0 0 220 220" style={{ position: 'absolute', transform: 'rotate(-90deg)' }}>
                                        {/* track */}
                                        <circle cx="110" cy="110" r="100" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1.5" />
                                        {/* sweep — resets & animates each second */}
                                        <motion.circle
                                            key={startCountdown}
                                            cx="110" cy="110" r="100" fill="none"
                                            stroke={C.coral} strokeWidth="2.5" strokeLinecap="round"
                                            pathLength={1}
                                            initial={{ pathLength: 1 }}
                                            animate={{ pathLength: 0 }}
                                            transition={{ duration: 1, ease: 'linear' }}
                                        />
                                    </svg>
                                    {/* tiny tick marks (Swiss instrument feel) */}
                                    <svg width="220" height="220" viewBox="0 0 220 220" style={{ position: 'absolute' }}>
                                        {Array.from({ length: 60 }).map((_, i) => {
                                            const ang = (i / 60) * Math.PI * 2;
                                            const isMajor = i % 5 === 0;
                                            const r1 = 100, r2 = isMajor ? 90 : 95;
                                            return (
                                                <line key={i}
                                                    x1={110 + r1 * Math.cos(ang)} y1={110 + r1 * Math.sin(ang)}
                                                    x2={110 + r2 * Math.cos(ang)} y2={110 + r2 * Math.sin(ang)}
                                                    stroke="rgba(255,255,255,0.18)" strokeWidth={isMajor ? 1.4 : 0.7}
                                                />
                                            );
                                        })}
                                    </svg>
                                    <motion.div
                                        key={startCountdown}
                                        initial={{ scale: 0.86, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 1.1, opacity: 0 }}
                                        transition={{ type: 'spring', damping: 18, stiffness: 260 }}
                                        className="tabular-nums"
                                        style={{
                                            fontFamily: 'var(--font-body)',
                                            fontWeight: 200,
                                            fontSize: 110,
                                            color: C.white,
                                            letterSpacing: '-0.04em',
                                            lineHeight: 1,
                                        }}
                                    >
                                        {startCountdown}
                                    </motion.div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* 🏷️ Critical #5 — Mode Sticky Chip
                          跑步中永遠顯示「PLAN · WK · TEMPO」或「FREE RUN」，讓使用者掃一眼即知模式
                          paused 時加入 amber 邊框提示 */}
                    <div className="absolute w-full flex justify-center z-[51] pointer-events-none" style={{ top: 'calc(env(safe-area-inset-top, 48px) + 76px)' }}>
                        <AnimatePresence>
                            {isTracking && (() => {
                                const currentStep = activePlan ? getCurrentPlanStep(activePlan, cardioData.duration) : null;
                                const isPlanMode = !!activePlan;
                                const chipBg = autoPaused
                                    ? 'linear-gradient(135deg, rgba(214,158,46,0.94) 0%, rgba(183,121,31,0.94) 100%)'
                                    : isPaused
                                    ? 'linear-gradient(145deg, rgba(22,20,21,0.72) 0%, rgba(45,42,43,0.58) 40%, rgba(22,20,21,0.68) 70%, rgba(8,6,7,0.82) 100%)'
                                    : isPlanMode
                                        ? 'linear-gradient(135deg, rgba(249,92,75,0.92) 0%, rgba(217,64,48,0.92) 100%)'
                                        : 'linear-gradient(135deg, rgba(22,20,21,0.88) 0%, rgba(40,38,36,0.92) 100%)';
                                // 🪙 頂部 chip：以「目前步驟狀態」為主，讓使用者一眼知道現在該做什麼
                                //    autoPaused 優先顯示（黃底），讓跑者一眼知道「系統幫你停錶了」
                                const chipLabel = autoPaused
                                    ? '⏸ AUTO-PAUSED · 自動暫停'
                                    : isPaused
                                    ? 'PAUSED'
                                    : isPlanMode
                                        ? (currentStep
                                            ? `PLAN · STEP ${currentStep.index + 1}/${activePlan.steps?.length || '—'} · ${getStepStatus(currentStep).short}`
                                            : `PLAN · ${activePlan.title ? String(activePlan.title).slice(0, 14).toUpperCase() : 'TRAINING'}`)
                                        : 'FREE RUN';
                                return (
                                    <motion.div
                                        initial={{ opacity: 0, y: -8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -8 }}
                                        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                                    >
                                        <motion.div
                                            className="px-3.5 py-1.5 rounded-full flex items-center gap-1.5"
                                            style={{
                                                background: chipBg,
                                                border: isPaused ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(255,255,255,0.22)',
                                                boxShadow: isPaused
                                                    ? '0 12px 28px -6px rgba(0,0,0,0.45), 0 4px 10px -2px rgba(0,0,0,0.28), inset 0 1.5px 2px rgba(255,255,255,0.22), inset 0 -2px 6px rgba(0,0,0,0.35)'
                                                    : isPlanMode
                                                        ? '0 6px 18px rgba(249,92,75,0.32), inset 0 1px 1px rgba(255,255,255,0.32)'
                                                        : '0 6px 16px rgba(0,0,0,0.30), inset 0 1px 1px rgba(255,255,255,0.16)',
                                                backdropFilter: isPaused ? 'blur(28px) saturate(1.8) brightness(0.96)' : 'blur(20px) saturate(1.6)',
                                                WebkitBackdropFilter: isPaused ? 'blur(28px) saturate(1.8) brightness(0.96)' : 'blur(20px) saturate(1.6)',
                                            }}
                                            animate={isPaused ? { scale: [1, 1.04, 1] } : { scale: 1 }}
                                            transition={isPaused ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0 }}
                                        >
                                            <div className="w-1.5 h-1.5 rounded-full"
                                                style={{
                                                    background: C.white,
                                                    boxShadow: '0 0 6px rgba(255,255,255,0.8)',
                                                }}
                                            />
                                            <span className="text-[9px] font-black uppercase tracking-widest text-white whitespace-nowrap">
                                                {chipLabel}
                                            </span>
                                        </motion.div>
                                    </motion.div>
                                );
                            })()}
                        </AnimatePresence>
                    </div>

                    {/* ── Full-screen Map + Floating Panels ── */}
                    {/* 💡 修正 1：加上 bg-[#EFEFEF] 實色背景，阻擋最底層的背景圖片穿透，消除地圖磨砂感 */}
                    <div className="relative z-30 bg-[#EFEFEF] w-full" style={{ height: '100dvh', minHeight: 500 }}>

                        {/* Map fills entire area */}
                        <div className="absolute inset-0">
                            <style>{`
                                .cardio-map-fullscreen,
                                .cardio-map-fullscreen > div,
                                .cardio-map-fullscreen .leaflet-container,
                                .cardio-map-fullscreen > div > div {
                                    width: 100% !important;
                                    height: 100% !important;
                                    min-height: 100% !important;
                                    /* 強制移除任何可能的模糊濾鏡 */
                                    filter: none !important;
                                    backdrop-filter: none !important;
                                }
                                /* 深底地圖底色（深色／衛星，含磚塊載入空檔），避免泛白 */
                                .cardio-map-fullscreen .leaflet-container {
                                    background: ${(mapStyle === 'dark' || mapStyle === 'satellite') ? '#0E1216' : 'transparent'} !important;
                                }
                                /* 🔥 客製化 Leaflet 縮放按鈕 */
                                .leaflet-control-zoom {
                                    position: absolute !important;
                                    top: 280px !important; /* 往下移避免擋字 */
                                    left: 10px !important;
                                    border: none !important;
                                    box-shadow: none !important;
                                    background: transparent !important;
                                }
                                .leaflet-control-zoom a {
                                    width: 44px !important;
                                    height: 44px !important;
                                    line-height: 44px !important;
                                    border-radius: 50% !important;
                                    background: rgba(255,255,255,0.85) !important;
                                    backdrop-filter: blur(10px) !important;
                                    -webkit-backdrop-filter: blur(10px) !important;
                                    margin-bottom: 8px !important;
                                    color: black !important;
                                    border: 1px solid rgba(0,0,0,0.1) !important;
                                    font-size: 20px !important;
                                    font-weight: 300 !important;
                                    box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;
                                }
                            `}</style>
                            <div className="cardio-map-fullscreen w-full h-full">
                                {/* 🛡 結算頁顯示時不掛載即時地圖，避免從深度分析返回時 RouteMap
                                    以殘留/NaN 座標重掛載而觸發 Invalid LatLng 白屏 */}
                                {!showResults && (
                                    <RouteMap
                                        route={route}
                                        currentPosition={currentPosition}
                                        mapStyle={mapStyle}
                                        className="w-full h-full"
                                        metrics={cardioData}
                                        controls={{ isTracking, isPaused }}
                                        targetType={targetType}
                                        targetScore={targetScore}
                                        targetSegments={selectedSavedRoute ? [selectedSavedRoute] : []}
                                        focusWaypoints={routeFocusWaypoints}
                                        // 🎨 HR-driven Zone colour for the position marker + heading cone
                                        zoneColor={getZoneInfo(cardioData.heartRate)?.color}
                                        hideStats={true}
                                        isFollowing={isFollowing}
                                        setIsFollowing={setIsFollowing}
                                    />
                                )}

                                {/* 🧭 路口提示 —— 疊在地圖上方、讓開頂部的即時數據列。
                                    只有「選了路線 + 正在跑」才出現，沒選路線完全不干擾。 */}
                                <div
                                    className="absolute left-0 right-0 z-[95] px-4 pointer-events-none"
                                    style={{ top: 'calc(max(20px, env(safe-area-inset-top, 20px)) + 74px)' }}
                                >
                                    <RunTurnBannerHost
                                        show={showNavBanner}
                                        nav={navState}
                                        routeName={selectedSavedRoute?.name}
                                        onDismiss={() => { triggerNativeHaptic('light'); setNavDismissed(true); }}
                                    />
                                </div>

                                {/* 🎯 恢復追蹤按鈕 - 置於地圖區域，避免與面板重疊 */}
                                <AnimatePresence>
                                    {!isFollowing && (
                                        <motion.button
                                            initial={{ opacity: 0, scale: 0.8, y: 10 }}
                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.8, y: 10 }}
                                            whileTap={{ scale: 0.9 }}
                                            onClick={() => {
                                                triggerNativeHaptic('medium');
                                                setIsFollowing(true);
                                                // 🧭 用這個明確動作觸發 iOS 羅盤授權（手勢中呼叫，成功率高）
                                                try { window.dispatchEvent(new CustomEvent('request-compass')); } catch (_) {}
                                            }}
                                            className="absolute bottom-[440px] right-6 z-[100] w-12 h-12 rounded-full flex items-center justify-center text-white active:scale-95 transition-all overflow-hidden"
                                            aria-label="重新置中 · 跟隨我的位置"
                                            style={{
                                                background: 'linear-gradient(145deg, rgba(22,20,21,0.72) 0%, rgba(45,42,43,0.58) 40%, rgba(22,20,21,0.68) 70%, rgba(8,6,7,0.82) 100%)',
                                                backdropFilter: 'blur(28px) saturate(1.8) brightness(0.96)',
                                                WebkitBackdropFilter: 'blur(28px) saturate(1.8) brightness(0.96)',
                                                border: '1px solid rgba(255,255,255,0.18)',
                                                boxShadow: '0 12px 28px -6px rgba(0,0,0,0.45), 0 4px 10px -2px rgba(0,0,0,0.28), inset 0 1.5px 2px rgba(255,255,255,0.22), inset 0 -2px 6px rgba(0,0,0,0.35)'
                                            }}
                                        >
                                            <span
                                                className="absolute top-0 left-[8%] right-[8%] h-[36%] pointer-events-none rounded-b-full"
                                                style={{
                                                    background: 'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.0) 100%)',
                                                    filter: 'blur(1.5px)',
                                                }}
                                            />
                                            {/* 🧭 定位導航箭頭（Google-Maps recenter 語彙）：實心箭頭朝上，
                                                乾淨俐落，明確表達「回到 / 跟隨我的位置」。 */}
                                            <svg width="20" height="20" viewBox="0 0 24 24" className="relative z-10" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))' }}>
                                                <path d="M12 2.5 L20 21 L12 16.6 L4 21 Z" fill="#F6F4F1" stroke="#F6F4F1" strokeWidth="1.2" strokeLinejoin="round" />
                                            </svg>
                                        </motion.button>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* 底部加上非常淡的漸層黑影，讓白色的玻璃面板在地圖上更清晰 */}
                            <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/10 to-transparent pointer-events-none" />
                        </div>

                        {/* ── Floating Bottom Panel (所有控制項都整齊堆疊在這裡) ── */}
                        {/* Fix #2: 限制 panel 最大寬度（橫式 / iPad 不再拉到滿版，避免 flex-between 將 Effort/Cal 兩端撐得太散） */}
                        <div
                            className="absolute bottom-0 left-1/2 -translate-x-1/2 z-30 w-full px-4 flex flex-col gap-3"
                            style={{
                                paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
                                maxWidth: 'var(--cardio-panel-max-width, 480px)',
                            }}
                        >

                            {/* Layout refactored to inline with the Start Button */}



                            {/* ❤️ HR — outside the card, sitting just above where the Cal value lives.
                                Small, low-key, fed by Watch live metrics. Zone-tinted heart icon. */}
                            <div className="w-full flex justify-end px-6 -mb-1">
                                {/* 🩺 無心率訊號（未連手錶/未開跑）時整組降為中性灰 placeholder，
                                    避免「紅心 + -- BPM」看起來像故障；有訊號才亮起紅心。 */}
                                {(() => {
                                    const hasHR = cardioData.heartRate > 0;
                                    const onDarkMap = mapStyle === 'dark' || mapStyle === 'satellite';
                                    const mutedInk = onDarkMap ? 'rgba(255,255,255,0.40)' : 'rgba(22,20,21,0.32)';
                                    /* 🦶 步頻放在心率旁邊（使用者要求）：跑步當下最該盯的兩個即時體感指標。
                                       來源與存檔同一條 liveCadenceRef（手錶 HealthKit 或手機 DeviceMotion 數步器），
                                       所以畫面看到什麼、結算頁就會算到什麼。沒感測到就顯示 -- 不猜。 */
                                    const cad = Math.round(Number(cardioData.cadence) || Number(liveCadenceRef.current) || 0);
                                    const hasCad = cad > 0;
                                    const val = (on) => (on ? (onDarkMap ? C.white : C.ink) : mutedInk);
                                    const unit = (on) => (on ? (onDarkMap ? 'rgba(255,255,255,0.65)' : 'rgba(22,20,21,0.55)') : mutedInk);
                                    return (
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-1.5">
                                        <Heart
                                            size={11}
                                            style={{ color: hasHR ? '#FF3B30' : mutedInk }}
                                            fill={hasHR ? '#FF3B30' : 'none'}
                                            strokeWidth={hasHR ? 2 : 2.2}
                                        />
                                        <span className="text-[12px] font-bold share-tech-mono" style={{ color: val(hasHR) }}>
                                            {hasHR ? Math.round(cardioData.heartRate) : '--'}
                                        </span>
                                        <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: unit(hasHR) }}>bpm</span>
                                    </div>
                                    <span style={{ width: 1, height: 10, background: mutedInk, opacity: 0.5 }} />
                                    <div className="flex items-center gap-1.5">
                                        <Footprints
                                            size={11}
                                            style={{ color: hasCad ? C.coral : mutedInk }}
                                            strokeWidth={hasCad ? 2.2 : 2.2}
                                        />
                                        <span className="text-[12px] font-bold share-tech-mono" style={{ color: val(hasCad) }}>
                                            {hasCad ? cad : '--'}
                                        </span>
                                        <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: unit(hasCad) }}>spm</span>
                                    </div>
                                </div>
                                    );
                                })()}
                            </div>

                            {/* 💡 3. Liquid Glass Metrics Panel (核心數據面板) — framer-motion 進場 */}
                            <motion.div
                                className="w-full overflow-hidden flex flex-col relative cardio-glass-panel"
                                initial={{ opacity: 0, y: 28, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                                // 🖥️ 跑步中往上拖曳 panel → 開啟全螢幕儀表板
                                drag={isTracking ? 'y' : false}
                                dragConstraints={{ top: 0, bottom: 0 }}
                                dragElastic={0.2}
                                onDragEnd={(e, info) => {
                                    if (isTracking && info.offset.y < -60) {
                                        triggerNativeHaptic('light');
                                        setDashboardMode(true);
                                    }
                                }}
                                style={{
                                    borderRadius: 'var(--cardio-panel-radius)',
                                    // 🫧 真 Liquid Glass — 半透明底，把地圖透進來；底色/文字/邊框由 map-aware CSS 變數驅動
                                    background: 'var(--cardio-panel-bg)',
                                    backdropFilter: 'var(--cardio-panel-blur)',
                                    WebkitBackdropFilter: 'var(--cardio-panel-blur)',
                                    border: '1px solid var(--cardio-panel-border)',
                                    borderTop: '1px solid var(--cardio-panel-border-top)', // 頂部強光折射
                                    borderLeft: '1px solid var(--cardio-panel-border-left)',
                                    boxShadow: 'var(--cardio-panel-shadow)',
                                }}>
                                {/* 頂部大型高光弧 (Liquid Glass 標誌性光澤) */}
                                <span className="absolute top-0 left-[5%] right-[5%] h-[30%] pointer-events-none" style={{
                                    background: 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.0) 80%)',
                                    borderRadius: '0 0 50% 50%',
                                }} />

                                {/* Top row: Zone（左）+ Calories（右）
                                    耗力分數(Effort)移除：跑步中顯示造成認知負荷過載，改於結果頁 (CardioResult) 結算。
                                    左側改放當前心率 Zone chip，讓使用者一眼知道身體強度。 */}
                                <div className="flex items-center justify-between px-6 pt-6 pb-2 relative z-10">
                                    <div className="flex items-center gap-2 min-w-0" onClick={() => setShowInfoModal(true)} style={{ cursor: 'pointer' }}>
                                        {/* 🩺 沒有心率訊號時 Zone 顯示 "--"，不再顯示以 0 推算的假 Zone */}
                                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: cardioData.heartRate > 0 ? activeColor : 'var(--cardio-text-faint)', boxShadow: 'var(--cardio-shadow-chip-inset)' }} />
                                        <span className="text-[9px] font-black uppercase tracking-[0.22em]" style={{ color: 'var(--cardio-text-muted)' }}>Zone</span>
                                        <span className="text-[18px] font-black" style={{ color: cardioData.heartRate > 0 ? 'var(--cardio-text-strong)' : 'var(--cardio-text-faint)' }}>{cardioData.heartRate > 0 ? currentZoneInfo.name : '--'}</span>
                                        <Info size={10} className="ml-1 opacity-40" style={{ color: 'var(--cardio-text-strong)' }} />
                                    </div>
                                    {(() => {
                                        // 🔥 Cal 顯示規則：
                                        //   有接收到數據(有心率/已記錄/卡路里>0) → 顯示數字並上色；
                                        //   完全沒接到手錶/HK 數據 → 顯示「--」中性灰，明確表示「未接到」。
                                        const hasCal = Math.round(cardioData.calories) > 0;
                                        const hasData = hasCal || cardioData.heartRate > 0 || isTracking;
                                        return (
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Flame size={14} style={{ color: hasCal ? 'var(--cardio-accent)' : 'var(--cardio-text-faint)' }} fill={hasCal ? 'var(--cardio-accent)' : 'none'} />
                                        <span className="text-[9px] font-black uppercase tracking-[0.22em]" style={{ color: 'var(--cardio-text-muted)' }}>Cal</span>
                                        <span className="text-[22px] leading-none" style={{ fontFamily: 'var(--font-body)', fontWeight: 500, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums', color: hasData ? 'var(--cardio-text-strong)' : 'var(--cardio-text-faint)' }}>{hasData ? Math.round(cardioData.calories) : '--'}</span>
                                        <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--cardio-text-faint)' }}>kcal</span>
                                    </div>
                                        );
                                    })()}
                                </div>

                                {/* 耗力分數目標進度條已移除 — 跑步中不顯示 Effort，避免認知負荷過載。
                                    Zone 已移至上方 Top row；最終耗力於結果頁 (CardioResult) 結算。 */}

                                {/* 🎯 計劃追蹤主秀 — 依 brick 的 panelMode 只呈現「這趟跑者該盯的那一個數據」。
                                    pace → ±s/km 流動光球；distance → 里程進度條；reps → 趟數；
                                    duration → 純計時；zone → 目標 Zone 達成。不堆疊多餘數據。 */}
                                {activePlan && isTracking && (() => {
                                    const currentStep = getCurrentPlanStep(activePlan, cardioData.duration);
                                    if (!currentStep) return null;

                                    // 解析這個 brick 追蹤什麼（recovery/easy/tempo/interval/long/strength）
                                    // 🎯 與 DashboardMode 同一來源：brick 優先、activePlan 兜底，避免兩處判出不同 panelMode
                                    const tt = getTrackingTarget(location.state?.brick || activePlan);
                                    const hasTargetPace = currentStep.targetPace > 0;
                                    // panelMode：有定義用定義，否則依資料自動退化
                                    //   配速型但這段沒有目標配速（依體感段）→ 退到「體感型」，不顯示空的配速條
                                    const basePanel = tt?.panelMode
                                        || (hasTargetPace ? 'pace' : (activePlan.distance_km > 0 ? 'distance' : 'effort'));
                                    const panelMode = (basePanel === 'pace' && !hasTargetPace) ? 'effort' : basePanel;
                                    const accent = tt?.color || C.coral;

                                    // 一行主目標提示（開跑前 detail sheet 已說過，跑中再給眼角餘光一行）
                                    const PrimaryHint = tt?.primary?.label ? (
                                        <div className="px-6 pt-1 pb-2 flex items-center gap-2">
                                            <span className="text-[12px] font-black tracking-[0.04em]" style={{ color: accent }}>目標</span>
                                            <span className="text-[12px] font-bold" style={{ color: 'var(--cardio-text-strong)' }}>{tt.primary.label}</span>
                                        </div>
                                    ) : null;

                                    // ── 體感型（沒有目標配速的段）：本段倒數 + RPE 區間 + 一句體感 ──
                                    if (panelMode === 'effort') {
                                        const band = getStepRpeBand(currentStep);
                                        const next = activePlan.steps?.[currentStep.index + 1];
                                        return (
                                            <div className="w-full">
                                                <div className="px-6 pb-5 text-center">
                                                    <div className="text-[12px] font-black text-black/50 mb-1">{currentStep.name}</div>
                                                    <div className="text-[52px] font-black leading-none share-tech-mono mb-2" style={{ color: 'var(--cardio-text-strong)', fontVariantNumeric: 'tabular-nums' }}>
                                                        {formatDuration(Math.max(0, Math.round(currentStep.stepRemaining || 0)))}
                                                    </div>
                                                    <div className="text-[12px] font-bold" style={{ color: 'var(--cardio-text-strong)' }}>
                                                        <span className="font-black" style={{ color: accent }}>RPE {band.min === band.max ? band.min : `${band.min}–${band.max}`}</span>
                                                        {currentStep.cue ? ` · ${currentStep.cue}` : ''}
                                                    </div>
                                                    {next && (
                                                        <div className="text-[11px] font-bold text-black/40 mt-2">下一段 {next.name} {Math.round(next.duration / 60)} 分鐘</div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    }

                                    // ── 里程型（long）：里程進度條 ──────────────────────────
                                    if (panelMode === 'distance') {
                                        const goal = activePlan.distance_km || 0;
                                        const done = cardioData.distance || 0;
                                        const pct = goal > 0 ? Math.min(100, (done / goal) * 100) : 0;
                                        return (
                                            <div className="w-full">
                                                {PrimaryHint}
                                                <div className="px-6 pb-5">
                                                    <div className="flex items-baseline justify-center gap-2 mb-2">
                                                        <span className="text-[48px] font-black leading-none share-tech-mono" style={{ color: 'var(--cardio-text-strong)', fontVariantNumeric: 'tabular-nums' }}>{safeFixed(done, 2)}</span>
                                                        <span className="text-[14px] font-black text-black/40">/ {safeFixed(goal, 1)} km</span>
                                                    </div>

                                                    {/* Segmented Progress Bar matching DashboardMode */}
                                                    <div className="w-full mt-4">
                                                        <div className="flex justify-between items-baseline mb-2">
                                                            <div className="flex items-baseline gap-2">
                                                                <span className="text-[12px] font-black tracking-[0.04em] text-black/50">本段建議配速</span>
                                                                {currentStep?.targetPace > 0 && (
                                                                    <span className="share-tech-mono text-[16px] font-black" style={{ color: 'var(--cardio-text-strong)' }}>
                                                                        {formatPace(currentStep.targetPace)}<span className="text-[11px] text-black/40 ml-1">/km</span>
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <span className="share-tech-mono text-[11px] font-black text-black/40">{Math.round(pct)}%</span>
                                                        </div>
                                                        <div className="flex gap-[5px] w-full">
                                                            {activePlan.steps?.map((s, i) => {
                                                                const segVal = s.distance_km || s.duration || 1;
                                                                const totalVal = activePlan.steps.reduce((acc, curr) => acc + (curr.distance_km || curr.duration || 1), 0);
                                                                const weight = segVal / totalVal;

                                                                let startPct = 0;
                                                                for (let j = 0; j < i; j++) {
                                                                    const prevVal = activePlan.steps[j].distance_km || activePlan.steps[j].duration || 1;
                                                                    startPct += (prevVal / totalVal) * 100;
                                                                }
                                                                const fill = Math.min(1, Math.max(0, (pct - startPct) / (weight * 100)));
                                                                const isCurrent = pct >= startPct && pct < (startPct + weight * 100);
                                                                const isPast = pct >= (startPct + weight * 100);

                                                                // 🪙 鈦三色：已完成段用「該段實際平均配速」、當前段用即時配速，與該段 targetPace 比較
                                                                const segTarget = s.targetPace || s.target_pace_sec || currentStep?.targetPace || 0;
                                                                const segActualPace = isCurrent
                                                                    ? cardioData.currentPace
                                                                    : (isPast ? segmentPaces[i] : 0);
                                                                const tp = titaniumPace(segActualPace, segTarget);
                                                                // 有配速判定 → 鈦三色；尚無資料 → 中性鵝卵石鈦
                                                                const fillGradient = tp ? tp.gradient : TEXTURES.pebbleTitanium;
                                                                const fillGlow = tp ? `0 0 10px ${tp.glow}, inset 0 1px 1px rgba(255,255,255,0.6)` : 'inset 0 1px 1px rgba(255,255,255,0.5)';

                                                                return (
                                                                    <div key={i} style={{
                                                                        flex: weight,
                                                                        position: 'relative', height: 10, borderRadius: 5, overflow: 'hidden',
                                                                        background: 'rgba(0,0,0,0.06)',
                                                                        border: `1px solid ${isCurrent ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.05)'}`,
                                                                        boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.05)',
                                                                    }}>
                                                                        <motion.div
                                                                            animate={{ width: `${fill * 100}%` }}
                                                                            transition={{ type: 'spring', damping: 26, stiffness: 90 }}
                                                                            style={{
                                                                                position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 5,
                                                                                background: fillGradient,
                                                                                backgroundSize: '200% 100%',
                                                                                boxShadow: fillGlow,
                                                                            }}
                                                                        />
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }

                                    // ── 時長型（strength）：純計時，隱藏配速/里程 ──────────────
                                    if (panelMode === 'duration') {
                                        const goalSec = (activePlan.duration_min || 0) * 60;
                                        const doneSec = cardioData.duration || 0;
                                        const pct = goalSec > 0 ? Math.min(100, (doneSec / goalSec) * 100) : 0;
                                        return (
                                            <div className="w-full">
                                                {PrimaryHint}
                                                <div className="px-6 pb-5">
                                                    <div className="text-center text-[9px] font-black uppercase tracking-widest text-black/40 mb-1">{currentStep.name}</div>
                                                    <div className="text-center mb-2">
                                                        <span className="text-[52px] font-black leading-none share-tech-mono" style={{ color: 'var(--cardio-text-strong)', fontVariantNumeric: 'tabular-nums' }}>{formatDuration(doneSec)}</span>
                                                    </div>
                                                    <div className="relative w-full h-2 bg-black/10 rounded-full overflow-hidden">
                                                        <motion.div className="absolute left-0 top-0 h-full rounded-full" animate={{ width: `${pct}%` }} transition={{ type: 'spring', damping: 26, stiffness: 90 }} style={{ background: accent, boxShadow: `0 0 8px ${accent}88` }} />
                                                    </div>
                                                    <div className="text-center mt-2 text-[11px] font-bold text-black/35">目標 {activePlan.duration_min || '—'} 分鐘 · 交叉訓練不追配速</div>
                                                </div>
                                            </div>
                                        );
                                    }

                                    // ── 趟數型（interval）：流動光球（配速回饋）+ 趟數 + 當前階段狀態 ──
                                    if (panelMode === 'reps') {
                                        const sprintSteps = activePlan.steps.filter(s => /衝刺|sprint|全力|加速|極限|interval|間歇|rep/i.test(s.name || ''));
                                        const totalReps = sprintSteps.length || 0;
                                        const doneReps = activePlan.steps.slice(0, currentStep.index).filter(s => /衝刺|sprint|全力|加速|極限|interval|間歇|rep/i.test(s.name || '')).length;
                                        const isSprintNow = /衝刺|sprint|全力|加速|極限|interval|間歇|rep/i.test(currentStep.name || '');
                                        const repStatus = getStepStatus(currentStep);

                                        // 🪙 與配速模式相同的流動光球：依「目前配速 vs 該段目標配速」著色
                                        const repTarget = currentStep.targetPace || 0;
                                        const repDiff = repTarget > 0 ? (cardioData.currentPace - repTarget) : 0;
                                        let repOffset = repTarget > 0 ? 50 - (repDiff / 60) * 50 : 50;
                                        repOffset = Math.max(8, Math.min(92, repOffset));
                                        let repGlow = '0 0 20px rgba(255, 154, 158, 0.4)';
                                        let repGrad = { base: '#FF9A9E', accent1: '#8DF2FF', accent2: '#E2D1F9' };
                                        if (repTarget > 0 && repDiff > 15) {
                                            repGlow = '0 0 20px rgba(249, 92, 75, 0.6)';
                                            repGrad = { base: C.coral, accent1: '#FF9F43', accent2: '#F1C40F' };
                                        } else if (repTarget > 0 && repDiff < -15) {
                                            repGlow = '0 0 20px rgba(79, 172, 254, 0.5)';
                                            repGrad = { base: '#4FACFE', accent1: '#00F2FE', accent2: '#9D50BB' };
                                        }

                                        return (
                                            <div className="w-full">
                                                <div className="px-6 pb-5">
                                                    {/* 本段建議配速 */}
                                                    <div className="flex items-baseline justify-center gap-2 mb-1">
                                                        <span className="text-[52px] font-black leading-none share-tech-mono" style={{ color: isSprintNow ? accent : 'var(--cardio-text-strong)', fontVariantNumeric: 'tabular-nums', textShadow: isSprintNow ? `0 0 16px ${accent}66` : 'none' }}>
                                                            {repTarget > 0 ? formatPace(repTarget) : '--\'--"'}
                                                        </span>
                                                        {repTarget > 0 && <span className="text-[16px] font-black text-black/40">/km</span>}
                                                    </div>

                                                    {/* 軌道與流動光球（與配速模式一致） */}
                                                    <div className="relative w-full h-1 bg-white/10 rounded-full mt-3 mb-2">
                                                        <div className="absolute left-[40%] right-[40%] top-1/2 -translate-y-1/2 h-2 bg-white/20 rounded-full" />
                                                        <motion.div
                                                            animate={{ left: `${repOffset}%` }}
                                                            transition={{ type: 'spring', damping: 25, stiffness: 120 }}
                                                            className="absolute top-1/2 -translate-y-1/2 w-[14px] h-[14px] z-10 flex items-center justify-center cardio-orb-morph"
                                                            style={{ marginLeft: '-7px', willChange: 'transform, left' }}
                                                        >
                                                            <motion.div className="relative w-full h-full rounded-full" animate={{ backgroundColor: repGrad.base, boxShadow: repGlow }}>
                                                                {isLowPower ? (
                                                                    <div className="absolute inset-0 rounded-full opacity-85" style={{ background: `linear-gradient(45deg, ${repGrad.accent1}, ${repGrad.accent2})`, filter: 'blur(1.5px)' }} />
                                                                ) : (
                                                                    <motion.div
                                                                        animate={{ borderRadius: ["42% 58% 70% 30% / 45% 45% 55% 55%", "70% 30% 46% 54% / 30% 29% 71% 70%", "30% 70% 70% 30% / 49% 60% 40% 51%", "42% 58% 70% 30% / 45% 45% 55% 55%"], rotate: 360 }}
                                                                        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                                                                        className="absolute inset-0 opacity-85"
                                                                        style={{ background: `linear-gradient(45deg, ${repGrad.accent1}, ${repGrad.accent2})`, filter: 'blur(1.5px)', willChange: 'border-radius, transform' }}
                                                                    />
                                                                )}
                                                                <div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.75) 0%, transparent 55%)' }} />
                                                            </motion.div>
                                                            <div className="absolute inset-0 rounded-full border border-white/45 shadow-[inset_0_1.5px_8px_rgba(255,255,255,0.5)]" />
                                                        </motion.div>
                                                    </div>
                                                    <div className="flex justify-between mb-3 text-[9px] font-black uppercase tracking-[0.2em]">
                                                        <span className="text-[#161415]/25">Too Slow</span>
                                                        <span className="text-[#161415]/25">Perfect</span>
                                                        <span className="text-[#161415]/25">Too Fast</span>
                                                    </div>

                                                    {/* 🪙 光球下方：當前階段狀態 */}
                                                    <div className="text-center text-[12px] font-black uppercase tracking-[0.15em]" style={{ color: isSprintNow ? accent : 'rgba(22,20,21,0.45)' }}>
                                                        {repStatus.label}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }

                                    // ── Zone 型（recovery）：目標 Zone 達成 ────────────────────
                                    if (panelMode === 'zone') {
                                        const z = getZoneInfo(cardioData.heartRate);
                                        const zMax = tt?.primary?.zoneMax || 2;
                                        const inZone = z?.id > 0 && z.id <= zMax;
                                        return (
                                            <div className="w-full">
                                                {/* Zone 型只保留這一個 Zone 主秀，不再額外加 PrimaryHint，避免「目標 Zone」重複三次 */}
                                                <div className="px-6 pb-5 text-center">
                                                    <div className="text-[12px] font-black tracking-widest text-black/40 mb-1">目標 Zone 1–{zMax} · {currentStep.name}</div>
                                                    <div className="flex items-baseline justify-center gap-2 mb-2">
                                                        <span className="text-[44px] font-black leading-none" style={{ color: inZone ? '#059669' : C.coral }}>{z?.name || 'WARM UP'}</span>
                                                    </div>
                                                    <div className="text-[12px] font-black tracking-[0.15em]" style={{ color: inZone ? '#059669' : C.coral }}>
                                                        {inZone ? '剛好 · 維持就好' : '太喘了 · 降速或改用走的'}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }

                                    // ── 配速型（easy / tempo，預設）：±s/km 流動光球 ──────────
                                    const isEasyRun = tt?.key === 'easy' || activePlan?.type === 'easy';
                                    const targetPace = currentStep.targetPace;
                                    const diff = cardioData.currentPace - targetPace;

                                    // 預設完美狀態：珠光氣泡 (Pearlescent Bubble - 圖四)
                                    let statusText = 'PERFECT PACE';
                                    let glow = '0 0 20px rgba(255, 154, 158, 0.4)';
                                    let statusGradient = {
                                        base: '#FF9A9E',    // 蜜桃粉
                                        accent1: '#8DF2FF', // 柔和青
                                        accent2: '#E2D1F9'  // 薰衣草紫
                                    };

                                    let offsetPercent = 50 - (diff / 60) * 50;
                                    offsetPercent = Math.max(8, Math.min(92, offsetPercent)); // 限制光球不出界

                                    if (diff > 15) { // 太慢：烈焰橘紅 (Fire Orange/Red)
                                        statusText = ''; // 移除提示字
                                        glow = '0 0 20px rgba(249, 92, 75, 0.6)';
                                        statusGradient = {
                                            base: C.coral,    // 主色紅
                                            accent1: '#FF9F43', // 亮橘
                                            accent2: '#F1C40F'  // 鮮黃
                                        };
                                    } else if (diff < -15) { // 太快：柔和藍綠 (Soft Blue/Cyan)
                                        statusText = ''; // 移除提示字
                                        glow = '0 0 20px rgba(79, 172, 254, 0.5)';
                                        statusGradient = {
                                            base: '#4FACFE',    // 湛藍
                                            accent1: '#00F2FE', // 青色
                                            accent2: '#9D50BB'  // 柔紫
                                        };
                                    }

                                    // Medium #16 — 計算 ±差秒數的可讀格式（PERFECT 時顯示 ±0）
                                    // Fix #3: 上限改為 30s — 超過 30 秒已遠超有意義範圍，避免「+99+」三符號擠在一起；
                                    // 且 GPS 訊號不穩 / 剛起跑時 pace 可能極端值，clamp 顯示更友善。
                                    const rawAbsDiff = Math.abs(Math.round(diff));
                                    const diffSign = Math.abs(diff) <= 1 ? '±' : diff > 0 ? '+' : '−';
                                    // 🕐 配速差改成「幾分幾秒」呈現（與儀表一致）：>=60s 顯示 M'SS"，否則 SS"
                                    const diffM = Math.floor(rawAbsDiff / 60);
                                    const diffS = rawAbsDiff % 60;
                                    const diffLabel = diffM > 0 ? `${diffM}'${String(diffS).padStart(2, '0')}"` : `${diffS}"`;

                                    return (
                                        <div className="px-6 pb-5 w-full">
                                            {!isEasyRun && PrimaryHint}

                                            {isEasyRun ? (
                                                /* 輕鬆跑：移除卡片內「訓練進度」分段條，進度改由最上方藍色膠囊條呈現 */
                                                null
                                            ) : (
                                                /* 階段與倒數 (Tempo 原本的設計) */
                                                <div className="flex justify-between items-end mb-3">
                                                    <div>
                                                        <span className="text-[9px] font-black uppercase tracking-widest text-black/40">
                                                            Step {currentStep.index + 1}/{activePlan.steps.length} · {currentStep.name}
                                                        </span>
                                                        <div className="text-black/85 text-[12px] font-bold flex items-center gap-1.5 mt-0.5 tracking-wide">
                                                            <span className="text-[9px] font-black tracking-[0.2em] uppercase text-black/40">TARGET</span>
                                                            <span className="share-tech-mono">{formatPace(targetPace)}</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-[9px] font-bold text-black/30 uppercase tracking-widest block mb-0.5">Time Left</span>
                                                        <span className="text-black font-black text-[16px] share-tech-mono">{formatDuration(currentStep.stepRemaining)}</span>
                                                    </div>
                                                </div>
                                            )}

                                            {/* 🎯 主視覺：±差秒大字 + 狀態文字
                                                  把可操作資訊放最大，光球退為輔助裝飾
                                                  Fix #3 + Medium #16 放大：48px，符號收在數字後避免 "+99+" 三符號擠壓 */}
                                            <div className="flex items-baseline justify-center gap-2 mb-1.5">
                                                <span
                                                    className="text-[48px] font-normal leading-none"
                                                    style={{
                                                        fontFamily: 'var(--font-display)',
                                                        color: statusGradient.base, // 跟隨進度光球配色
                                                        textShadow: `0 0 14px ${statusGradient.base}55, var(--cardio-glow-text)`,
                                                        fontVariantNumeric: 'tabular-nums',
                                                        letterSpacing: '-0.03em',
                                                    }}
                                                >
                                                    {diffSign}{diffLabel}
                                                </span>
                                                <span className="text-[9px] font-black uppercase tracking-[0.18em] text-black/40">s/km</span>
                                            </div>

                                            {/* 軌道與流動光球（Medium #16: 縮小為 14px，主視覺已轉移到上方 ±差秒大字） */}
                                            <div className="relative w-full h-1 bg-white/10 rounded-full mt-3 mb-2">
                                                {/* 完美配速的標記區塊 (中間) */}
                                                <div className="absolute left-[40%] right-[40%] top-1/2 -translate-y-1/2 h-2 bg-white/20 rounded-full" />

                                                <motion.div
                                                    animate={{ left: `${offsetPercent}%` }}
                                                    transition={{ type: 'spring', damping: 25, stiffness: 120 }}
                                                    className="absolute top-1/2 -translate-y-1/2 w-[14px] h-[14px] z-10 flex items-center justify-center cardio-orb-morph"
                                                    style={{
                                                        marginLeft: '-7px',
                                                        // 提示瀏覽器把光球分層加速（避免每幀重繪整條軌道）
                                                        willChange: 'transform, left',
                                                    }}
                                                >
                                                    {/* 精簡版液態核心 — 移除冗餘 sine/cosine 層，保留 morph + glow */}
                                                    <motion.div
                                                        className="relative w-full h-full rounded-full"
                                                        animate={{ backgroundColor: statusGradient.base, boxShadow: glow }}
                                                    >
                                                        {/* 低耗電模式：用靜態 gradient + 圓形，省掉 morph keyframe 與 rotate（每幀重繪 borderRadius/transform 是耗電大戶） */}
                                                        {isLowPower ? (
                                                            <div
                                                                className="absolute inset-0 rounded-full opacity-85"
                                                                style={{ background: `linear-gradient(45deg, ${statusGradient.accent1}, ${statusGradient.accent2})`, filter: 'blur(1.5px)' }}
                                                            />
                                                        ) : (
                                                            <motion.div
                                                                animate={{
                                                                    borderRadius: ["42% 58% 70% 30% / 45% 45% 55% 55%", "70% 30% 46% 54% / 30% 29% 71% 70%", "30% 70% 70% 30% / 49% 60% 40% 51%", "42% 58% 70% 30% / 45% 45% 55% 55%"],
                                                                    rotate: 360
                                                                }}
                                                                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                                                                className="absolute inset-0 opacity-85"
                                                                style={{
                                                                    background: `linear-gradient(45deg, ${statusGradient.accent1}, ${statusGradient.accent2})`,
                                                                    filter: 'blur(1.5px)',
                                                                    willChange: 'border-radius, transform',
                                                                }}
                                                            />
                                                        )}
                                                        <div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.75) 0%, transparent 55%)' }} />
                                                    </motion.div>
                                                    <div className="absolute inset-0 rounded-full border border-white/45 shadow-[inset_0_1.5px_8px_rgba(255,255,255,0.5)]" />
                                                </motion.div>
                                            </div>

                                            {/* 軌道兩端輔助文字 */}
                                            <div className="flex justify-between mt-2 text-[9px] font-black uppercase tracking-[0.2em]">
                                                <span className="text-[#161415]/25">Too Slow</span>
                                                <span className="text-[#161415]/25">Perfect</span>
                                                <span className="text-[#161415]/25">Too Fast</span>
                                            </div>
                                        </div>
                                    );
                                })()}

                                <div className="h-px mx-5" style={{ background: 'rgba(0,0,0,0.06)' }} />

                                {/* Main 3 metrics — 配速 / 時間 / 里程 為所有計劃的必備底線，永遠等重顯示。
                                    計劃差異化的主秀（±s/km、里程進度、趟數…）疊在上方，這三項不刪。 */}
                                {/* 📐 Swiss editorial：三項數據改左對齊（kicker 與大數字共用同一左基準），
                                    保留 divide-x 方形髮絲線製造「圓殼 × 硬線」張力；idle 時數字降中性灰當 placeholder。 */}
                                <LiveMetricsRow
                                    duration={cardioData.duration}
                                    currentPace={cardioData.currentPace}
                                    distance={cardioData.distance}
                                    idle={!isTracking && !isPaused}
                                    showElevation={sportNeedsElevation && showElevationMetric}
                                    elevation={cardioData.elevationGain}
                                />
                                {/* 🔴 一起練的夥伴現在到哪 —— 只佔一行。
                                    訓練當下最重要的是自己的動作，夥伴狀態是餘光看的東西。 */}
                                {liveTogether.inSession && liveTogether.partners.length > 0 && (
                                    <div className="px-5 pt-3 flex justify-center">
                                        <LiveStrip session={liveTogether.session} partners={liveTogether.partners} />
                                    </div>
                                )}
                                {/* 📊 分段配速長條 — 高度＝快慢，柱上直接標該公里配速。
                                    跑者拉開儀表板時最想確認的就是「我這幾公里穩不穩」。 */}
                                {(cardioData.splits?.length > 0) && (
                                    <LiveSplitsStrip splits={cardioData.splits} accent={C.coral} />
                                )}

                                {/* 需海拔的運動：基本仍是 3 欄，這顆小 chip 展開才多顯示「爬升」，避免 4 欄擠爆。 */}
                                {sportNeedsElevation && (
                                    <motion.button {...pressProps('pill')}
 onClick={() => { triggerNativeHaptic('light'); setShowElevationMetric(v => !v); }}
 className="mx-auto mt-1 mb-1 flex items-center gap-1 px-3 py-1 rounded-full pointer-events-auto"
 style={{ background: 'var(--cardio-chip-bg)', border: '1px solid var(--cardio-chip-border)' }}
 >
                                        <span className="text-[12px] font-black tracking-[0.16em]" style={{ color: 'var(--cardio-text-muted)' }}>
                                            {showElevationMetric ? '收起爬升' : '＋ 爬升'}
                                        </span>
                                    </motion.button>
                                )}

                                {/* 💡 4. Tracking Controls — Critical #2: START 為唯一主 CTA，Gear/Route 降級為次要 chip */}
                                <div className="flex flex-col w-full px-4 pb-5 gap-2.5">
                                    {!isTracking && !isPaused ? (
                                        <>
                                            {/* ─── 次要 chip 列：Sport · Gear · Route （在 START 上方，輕量提示型） ─── */}
                                            <div className="flex items-center justify-center gap-2">
                                                {/* 🟢 運動模式選擇器（GEAR 左邊） */}
                                                <motion.button
                                                    whileHover={{ scale: 1.04 }}
                                                    whileTap={{ scale: 0.94 }}
                                                    transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                                                    onClick={() => { triggerNativeHaptic('light'); setShowSportSelector(true); }}
                                                    className="h-9 px-3.5 rounded-full flex items-center gap-1.5 pointer-events-auto active:scale-95 transition-all"
                                                    style={{
                                                        background: 'var(--cardio-chip-bg)',
                                                        backdropFilter: 'blur(24px) saturate(1.6)',
                                                        WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
                                                        border: '1px solid var(--cardio-chip-border)',
                                                        boxShadow: '0 4px 10px -2px rgba(0,0,0,0.06), inset 0 1px 1px rgba(255,255,255,0.4)',
                                                    }}
                                                    aria-label="Select Sport"
                                                >
                                                    <SportIcon type={sportMeta.icon} size={13} strokeWidth={2} style={{ color: 'var(--cardio-chip-ink)' }} />
                                                    <span className="text-[9px] font-black tracking-[0.18em] uppercase truncate max-w-[72px]" style={{ color: 'var(--cardio-chip-ink)' }}>
                                                        {sportMeta.label}
                                                    </span>
                                                </motion.button>

                                                <motion.button
                                                    whileHover={{ scale: 1.04 }}
                                                    whileTap={{ scale: 0.94 }}
                                                    transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                                                    onClick={() => {
                                                        triggerNativeHaptic('light');
                                                        // 沒有任何裝備 → 直接帶去裝備庫新增
                                                        if (availableShoes.length === 0) {
                                                            navigate('/gear-garage-mobile');
                                                            return;
                                                        }
                                                        // 跳出選單讓使用者挑選
                                                        setShowShoeSelector(true);
                                                    }}
                                                    className="h-9 px-3.5 rounded-full flex items-center gap-1.5 pointer-events-auto active:scale-95 transition-all"
                                                    style={{
                                                        background: 'var(--cardio-chip-bg)',
                                                        backdropFilter: 'blur(24px) saturate(1.6)',
                                                        WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
                                                        border: '1px solid var(--cardio-chip-border)',
                                                        boxShadow: '0 4px 10px -2px rgba(0,0,0,0.06), inset 0 1px 1px rgba(255,255,255,0.4)',
                                                    }}
                                                    aria-label="Select Gear"
                                                >
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ color: selectedShoe ? 'var(--cardio-chip-ink)' : 'var(--cardio-chip-ink-soft)' }}>
                                                        <path d="M4 12v6a2 2 0 002 2h12a2 2 0 002-2v-6M4 12l2-2m14 2l-2-2m-2-2l-2-2m-8 4l2-2m2 4h4" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                    <span className="text-[9px] font-black tracking-[0.18em] uppercase truncate max-w-[96px]" style={{ color: selectedShoe ? 'var(--cardio-chip-ink)' : 'var(--cardio-chip-ink-soft)' }}>
                                                        {selectedShoe ? (selectedShoe.model || selectedShoe.brand) : 'GEAR'}
                                                    </span>
                                                </motion.button>

                                                <motion.button
                                                    whileHover={{ scale: 1.04 }}
                                                    whileTap={{ scale: 0.94 }}
                                                    transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                                                    onClick={() => { triggerNativeHaptic('light'); setShowRouteSelector(true); }}
                                                    className="h-9 px-3.5 rounded-full flex items-center gap-1.5 pointer-events-auto active:scale-95 transition-all"
                                                    style={{
                                                        background: 'var(--cardio-chip-bg)',
                                                        backdropFilter: 'blur(24px) saturate(1.6)',
                                                        WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
                                                        border: '1px solid var(--cardio-chip-border)',
                                                        boxShadow: '0 4px 10px -2px rgba(0,0,0,0.06), inset 0 1px 1px rgba(255,255,255,0.4)',
                                                    }}
                                                    aria-label="Select Route"
                                                >
                                                    <Navigation size={13} strokeWidth={2.4} style={{ color: selectedSavedRoute ? 'var(--cardio-chip-ink)' : 'var(--cardio-chip-ink-soft)' }} fill={selectedSavedRoute ? 'currentColor' : 'none'} />
                                                    <span className="text-[9px] font-black tracking-[0.18em] uppercase truncate max-w-[100px]" style={{ color: selectedSavedRoute ? 'var(--cardio-chip-ink)' : 'var(--cardio-chip-ink-soft)' }}>
                                                        {selectedSavedRoute ? selectedSavedRoute.name : 'ROUTE'}
                                                    </span>
                                                    {selectedSavedRoute && <div className="w-1.5 h-1.5 bg-[#F95C4B] rounded-full ml-0.5" />}
                                                </motion.button>
                                            </div>

                                            {/* 📍 選了路線 → 這條路之前的紀錄（跑之前就知道要追的是什麼） */}
                                            {selectedSavedRoute && !isTracking && (
                                                <div className="w-full mb-3 pointer-events-auto rounded-[20px] px-4 py-3"
                                                    style={{ background: 'var(--cardio-chip-bg)', border: '1px solid var(--cardio-chip-border)', backdropFilter: 'blur(24px) saturate(1.6)', WebkitBackdropFilter: 'blur(24px) saturate(1.6)' }}>
                                                    <div className="flex items-baseline justify-between gap-2">
                                                        <span className="text-[13px] font-black truncate" style={{ color: 'var(--cardio-chip-ink)' }}>{selectedSavedRoute.name}</span>
                                                        <span className="text-[12px] font-bold shrink-0" style={{ color: 'var(--cardio-chip-ink-soft)' }}>{selectedSavedRoute.distance} km</span>
                                                    </div>
                                                    {selectedSavedRoute.history ? (
                                                        <div className="flex gap-4 mt-2">
                                                            {[
                                                                ['跑過', `${selectedSavedRoute.history.runs} 次`],
                                                                ['最快配速', selectedSavedRoute.history.bestPaceSec ? `${paceLabel(selectedSavedRoute.history.bestPaceSec)}/km` : '—'],
                                                                ['最快完成', selectedSavedRoute.history.bestTimeSec ? `${Math.floor(selectedSavedRoute.history.bestTimeSec / 60)}:${String(selectedSavedRoute.history.bestTimeSec % 60).padStart(2, '0')}` : '—'],
                                                                ['上次', selectedSavedRoute.history.lastAt ? new Date(selectedSavedRoute.history.lastAt).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }) : '—'],
                                                            ].map(([k, v]) => (
                                                                <div key={k} className="min-w-0">
                                                                    <div className="text-[10px] font-black tracking-[0.16em]" style={{ color: 'var(--cardio-chip-ink-soft)' }}>{k}</div>
                                                                    <div className="text-[15px] font-black tabular-nums" style={{ color: 'var(--cardio-chip-ink)' }}>{v}</div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="text-[12px] font-bold mt-1" style={{ color: 'var(--cardio-chip-ink-soft)' }}>第一次跑這條，跑完就會記下你的紀錄</div>
                                                    )}
                                                </div>
                                            )}

                                            {/* ⌚ 建議佩戴手錶提示 — 偵測不到手錶/HealthKit 時才顯示，可關閉。
                                                有手錶 → 心率/步頻/海拔全為真實感測；沒有 → 退回 GPS + 手機動作感測估算。 */}
                                            <AnimatePresence>
                                                {!isHealthKitAvailable && !watchSourceActiveRef.current && !watchHintDismissed && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: 8, height: 0 }}
                                                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                                                        exit={{ opacity: 0, y: -6, height: 0 }}
                                                        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
                                                        className="w-full mb-3 pointer-events-auto overflow-hidden"
                                                    >
                                                        {/* 降權：改用冷調 Mist 底（#E8E9E6）讓它在溫度上退到主數據卡之後，
                                                            並收薄為次要提示條，避免和暖白主卡同色同材質互搶。 */}
                                                        <div
                                                            className="flex items-center gap-2.5 px-3.5 py-2 rounded-[18px]"
                                                            style={{
                                                                background: 'rgba(232,233,230,0.55)', // Mist #E8E9E6 半透明 → 冷調退後層
                                                                backdropFilter: 'blur(20px) saturate(1.2)',
                                                                WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
                                                                border: '1px solid rgba(207,198,184,0.45)', // Pebble hairline
                                                                boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.5)',
                                                            }}
                                                        >
                                                            <Heart size={14} strokeWidth={2} style={{ color: 'rgba(22,20,21,0.42)', flexShrink: 0 }} fill="none" />
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-[11px] font-medium tracking-[0.04em] leading-tight" style={{ color: 'rgba(22,20,21,0.72)' }}>
                                                                    戴上 Apple Watch 解鎖完整數據
                                                                </p>
                                                                <p className="text-[11px] font-normal leading-tight mt-0.5" style={{ color: 'rgba(22,20,21,0.45)' }}>
                                                                    心率 · 步頻 · 海拔將以真實感測記錄
                                                                </p>
                                                            </div>
                                                            {/* 44×44 觸控下限：視覺維持小圓鈕，外圍以透明 padding 擴大命中區 */}
                                                            <motion.button {...pressProps('icon')}
 onClick={(e) => {
 e.stopPropagation();
 setWatchHintDismissed(true);
 sessionStorage.setItem('watch_hint_dismissed', '1');
 }}
 className="flex items-center justify-center shrink-0"
 style={{ width: 44, height: 44, margin: -10, background: 'transparent' }}
 aria-label="關閉提示"
 >
                                                                <span className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'rgba(22,20,21,0.06)' }}>
                                                                    <X size={13} strokeWidth={2.6} style={{ color: 'rgba(22,20,21,0.5)' }} />
                                                                </span>
                                                            </motion.button>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>

                                            {/* ─── 主 CTA：START — Liquid Glass coral + framer-motion 微互動 ─── */}
                                            <motion.button
                                                ref={startButtonRef}
                                                whileHover={{ scale: 1.02 }}
                                                whileTap={{ scale: 0.97 }}
                                                transition={{ type: 'spring', stiffness: 380, damping: 20 }}
                                                className="w-full h-[58px] rounded-[24px] flex items-center justify-center gap-3 pointer-events-auto overflow-hidden relative"
                                                onClick={(e) => { e.stopPropagation(); handleToggle(); }}
                                                style={{
                                                    background: 'linear-gradient(145deg, rgba(249,92,75,0.72) 0%, rgba(255,122,107,0.58) 40%, rgba(249,92,75,0.65) 70%, rgba(217,64,48,0.78) 100%)',
                                                    backdropFilter: 'blur(28px) saturate(2.2) brightness(1.08)',
                                                    WebkitBackdropFilter: 'blur(28px) saturate(2.2) brightness(1.08)',
                                                    border: '1px solid rgba(255,255,255,0.38)',
                                                    boxShadow: '0 16px 36px -8px rgba(249,92,75,0.52), 0 4px 12px -2px rgba(249,92,75,0.28), inset 0 2px 3px rgba(255,255,255,0.48), inset 0 -2px 6px rgba(180,40,28,0.22)',
                                                }}
                                            >
                                                {/* 頂部高光弧 — Liquid Glass 特徵 */}
                                                <span
                                                    className="absolute top-0 left-[10%] right-[10%] h-[38%] pointer-events-none rounded-b-full"
                                                    style={{
                                                        background: 'linear-gradient(180deg, rgba(255,255,255,0.38) 0%, rgba(255,255,255,0.0) 100%)',
                                                        filter: 'blur(2px)',
                                                    }}
                                                />
                                                {/* 底部折射邊 */}
                                                <span
                                                    className="absolute bottom-0 left-0 right-0 h-[28%] pointer-events-none"
                                                    style={{
                                                        background: 'linear-gradient(0deg, rgba(255,255,255,0.12) 0%, transparent 100%)',
                                                        borderRadius: '0 0 22px 22px',
                                                    }}
                                                />
                                                <Play size={20} fill="currentColor" strokeWidth={0} className="text-white ml-1 relative z-10 drop-shadow-sm" />
                                                {/* 🏃 無計劃 → 明確標示「快速開跑」，讓只想出門跑的人零猶豫；有計劃 → 顯示計劃名 */}
                                                <span className="flex flex-col items-center relative z-10" style={{ minWidth: 0 }}>
                                                    <span className="text-white font-black text-[17px] tracking-[0.04em]" style={{ textShadow: '0 1px 8px rgba(180,40,28,0.45)' }}>
                                                        開始跑
                                                    </span>
                                                    {/* 沒有計劃時不補第二行 —— 「自由跑 · 免設定」只是把「開始跑」再講一次（介面標準 §4.1）。
                                                        有計劃才需要講清楚是哪一份。中文字距一律 ≤0.12em。 */}
                                                    {activePlan && (
                                                        <span className="text-white/80 font-bold text-[12px] tracking-[0.04em]"
                                                              style={{ marginTop: 2, minWidth: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {String(activePlan.title || '訓練計劃').slice(0, 14)}
                                                        </span>
                                                    )}
                                                </span>
                                            </motion.button>
                                        </>
                                    ) : (
                                        <div className="flex items-center justify-center w-full gap-3 px-2">
                                            {/* Resume/Pause — Liquid Glass Deep Black (#161415) when paused, neutral glass when running */}
                                            <motion.button
                                                onClick={() => { handleToggle(); triggerNativeHaptic('medium'); }}
                                                className="flex-1 h-[58px] rounded-[24px] flex items-center justify-center gap-2 active:scale-95 transition-all overflow-hidden relative"
                                                style={{
                                                    background: isPaused
                                                        ? 'linear-gradient(145deg, rgba(22,20,21,0.72) 0%, rgba(45,42,43,0.58) 40%, rgba(22,20,21,0.68) 70%, rgba(8,6,7,0.82) 100%)'
                                                        : 'linear-gradient(145deg, rgba(255,255,255,0.48) 0%, rgba(255,255,255,0.28) 50%, rgba(255,255,255,0.38) 100%)',
                                                    backdropFilter: isPaused ? 'blur(28px) saturate(1.8) brightness(0.96)' : 'blur(28px) saturate(2.0) brightness(1.06)',
                                                    WebkitBackdropFilter: isPaused ? 'blur(28px) saturate(1.8) brightness(0.96)' : 'blur(28px) saturate(2.0) brightness(1.06)',
                                                    border: isPaused
                                                        ? '1px solid rgba(255,255,255,0.18)'
                                                        : '1px solid rgba(255,255,255,0.72)',
                                                    boxShadow: isPaused
                                                        ? '0 12px 28px -6px rgba(0,0,0,0.45), 0 4px 10px -2px rgba(0,0,0,0.28), inset 0 1.5px 2px rgba(255,255,255,0.22), inset 0 -2px 6px rgba(0,0,0,0.35)'
                                                        : '0 6px 14px -4px rgba(0,0,0,0.10), inset 0 2px 4px rgba(255,255,255,0.65), inset 0 -1px 3px rgba(0,0,0,0.06)',
                                                }}
                                                animate={isPaused ? { scale: [1, 1.015, 1] } : { scale: 1 }}
                                                transition={isPaused ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : { duration: 0 }}
                                            >
                                                {/* 頂部高光弧 */}
                                                <span
                                                    className="absolute top-0 left-[8%] right-[8%] h-[36%] pointer-events-none rounded-b-full"
                                                    style={{
                                                        background: `linear-gradient(180deg, rgba(255,255,255,${isPaused ? '0.18' : '0.55'}) 0%, rgba(255,255,255,0.0) 100%)`,
                                                        filter: 'blur(1.5px)',
                                                    }}
                                                />
                                                {/* paused 呼吸光暈 — black */}
                                                {isPaused && (
                                                    <motion.span
                                                        className="absolute inset-0 rounded-[24px] pointer-events-none"
                                                        animate={{ boxShadow: ['0 0 0 0 rgba(22,20,21,0.0)', '0 0 0 10px rgba(22,20,21,0.0)'] }}
                                                        initial={{ boxShadow: '0 0 0 0 rgba(22,20,21,0.4)' }}
                                                        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                                                    />
                                                )}
                                                {isPaused
                                                    ? <Play size={18} fill={C.white} style={{ color: C.white }} className="relative z-10" />
                                                    : <Pause size={18} fill="rgba(22,20,21,0.75)" style={{ color: 'rgba(22,20,21,0.75)' }} className="relative z-10" />
                                                }
                                                <span className="text-[13px] font-black uppercase tracking-widest relative z-10"
                                                    style={{
                                                        color: isPaused ? C.white : 'rgba(22,20,21,0.82)',
                                                        textShadow: isPaused ? '0 1px 6px rgba(0,0,0,0.6)' : 'none',
                                                    }}
                                                >
                                                    {isPaused ? 'Resume' : 'Pause'}
                                                </span>
                                            </motion.button>

                                            {/* Finish — Liquid Glass Coral (#F95C4B) · 🛑 長按 1.5 秒防誤觸 */}
                                            <motion.button {...pressProps('cta')}
 onPointerDown={beginFinishHold}
 onPointerUp={cancelFinishHold}
 onPointerLeave={cancelFinishHold}
 onPointerCancel={cancelFinishHold}
 onContextMenu={(e) => e.preventDefault()}
 className="flex-1 h-[58px] rounded-[24px] flex items-center justify-center gap-2 overflow-hidden relative select-none"
 style={{
 touchAction: 'none',
 transform: finishHoldProgress > 0 ? `scale(${1 - finishHoldProgress * 0.04})` : 'scale(1)',
 background: 'linear-gradient(145deg, rgba(249,92,75,0.72) 0%, rgba(255,122,107,0.58) 40%, rgba(249,92,75,0.68) 70%, rgba(217,64,48,0.80) 100%)',
 backdropFilter: 'blur(28px) saturate(2.2) brightness(1.06)',
 WebkitBackdropFilter: 'blur(28px) saturate(2.2) brightness(1.06)',
 border: '1px solid rgba(255,255,255,0.40)',
 boxShadow: '0 10px 24px -5px rgba(249,92,75,0.48), 0 3px 8px -2px rgba(249,92,75,0.24), inset 0 2px 3px rgba(255,255,255,0.44), inset 0 -2px 6px rgba(180,36,24,0.22)',
 }}
 aria-label="長按結束跑步"
 >
                                                {/* 🛑 長按進度填充條（由左往右） */}
                                                <span
                                                    className="absolute inset-y-0 left-0 pointer-events-none z-[5]"
                                                    style={{
                                                        width: `${finishHoldProgress * 100}%`,
                                                        background: 'linear-gradient(90deg, rgba(180,36,24,0.0) 0%, rgba(180,36,24,0.55) 100%)',
                                                        transition: finishHoldProgress === 0 ? 'width 0.2s ease' : 'none',
                                                    }}
                                                />
                                                {/* 頂部高光弧 */}
                                                <span
                                                    className="absolute top-0 left-[8%] right-[8%] h-[36%] pointer-events-none rounded-b-full"
                                                    style={{
                                                        background: 'linear-gradient(180deg, rgba(255,255,255,0.36) 0%, rgba(255,255,255,0.0) 100%)',
                                                        filter: 'blur(1.5px)',
                                                    }}
                                                />
                                                <Square size={14} fill={C.white} style={{ color: C.white }} className="relative z-10" />
                                                <span className="text-[13px] font-black uppercase tracking-widest relative z-10" style={{ color: C.white, textShadow: '0 1px 8px rgba(180,36,24,0.45)' }}>
                                                    {finishHoldProgress > 0 ? '按住結束…' : 'Finish'}
                                                </span>
                                            </motion.button>
                                        </div>
                                    )}
                                </div>
                            </motion.div>

                        </div>
                    </div>
                </div>
                {/* 🟢 運動模式選擇器（DRVN design：瑞士極簡 bottom sheet） */}
                <AnimatePresence>
                    {showSportSelector && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setShowSportSelector(false)}
                            style={{ position: 'fixed', inset: 0, background: 'rgba(22,20,21,0.45)', backdropFilter: 'blur(3px)', zIndex: 4000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
                        >
                            <motion.div
                                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                                transition={{ type: 'spring', damping: 30, stiffness: 320 }}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    width: '100%', maxWidth: 480, borderRadius: '28px 28px 0 0', padding: '12px 0 36px',
                                    background: '#F6F4F1', boxShadow: '0 -10px 40px rgba(0,0,0,0.2)',
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'center', padding: '0 0 8px' }}>
                                    <div style={{ width: 36, height: 4, borderRadius: 99, background: 'rgba(22,20,21,0.12)' }} />
                                </div>
                                <div style={{ padding: '4px 22px 16px' }}>
                                    <div style={{ fontSize: 9, fontWeight: 900, color: '#F95C4B', letterSpacing: '0.22em', textTransform: 'uppercase', marginBottom: 3 }}>Activity</div>
                                    <div style={{ fontSize: 22, fontWeight: 900, color: '#161415', letterSpacing: '-0.03em' }}>選擇運動模式</div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '0 18px' }}>
                                    {SPORTS.map(s => {
                                        const active = s.id === selectedSport;
                                        return (
                                            <motion.button {...pressProps('row')} key={s.id} onClick={() => handleSelectSport(s.id)}
 style={{
 display: 'flex', alignItems: 'center', gap: 10, padding: '16px 16px',
 borderRadius: 18, cursor: 'pointer', textAlign: 'left',
 background: active ? '#161415' : '#FFFFFF',
 border: active ? '1px solid #161415' : '1px solid rgba(0,0,0,0.08)',
 transition: 'all 0.2s',
 }}>
                                                <SportIcon type={s.icon} size={22} strokeWidth={1.8} style={{ color: active ? '#F6F4F1' : '#161415', flexShrink: 0 }} />
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{ fontSize: 14, fontWeight: 800, color: active ? '#F6F4F1' : '#161415' }}>{s.label}</div>
                                                    <div style={{ fontSize: 11, fontWeight: 600, color: active ? 'rgba(246,244,241,0.5)' : 'rgba(22,20,21,0.4)', marginTop: 2 }}>
                                                        {s.hasElevation ? '含海拔' : s.noGps ? '室內·無GPS' : '速度·距離'}
                                                    </div>
                                                </div>
                                            </motion.button>
                                        );
                                    })}
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* 🔥 Route Selector Overlay (Restored Light Modal) */}
                <AnimatePresence>
                    {showRouteSelector && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="fixed inset-0 z-[10000000] bg-black/60 backdrop-blur-md flex items-center justify-center p-6"
                            onClick={() => setShowRouteSelector(false)}
                        >
                            <div className="bg-[#EFEFEF] w-full max-w-sm rounded-[28px] p-6 shadow-2xl flex flex-col gap-4 max-h-[80dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-2xl font-black text-black/90 uppercase tracking-tight">Saved Routes</h3>
                                    <motion.button {...pressProps('icon')} onClick={() => setShowRouteSelector(false)} className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center text-black/50 hover:bg-black/10 transition-colors">
                                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                                    </motion.button>
                                </div>

                                {/* 🏃 跑過的路線（跑步記憶）：選了就帶出這條路之前的紀錄 */}
                                {(() => {
                                    const mem = loadRunMemory(getUserId());
                                    const remembered = Object.values(mem?.routes || {})
                                        .filter((r) => Array.isArray(r.path) && r.path.length > 1)
                                        .sort((a, b) => (b.runs - a.runs) || ((b.lastAt || 0) - (a.lastAt || 0)));
                                    if (!remembered.length) return null;
                                    return (
                                        <>
                                            <div className="text-[11px] font-black tracking-[0.22em] text-black/40 mt-1">跑過的路線</div>
                                            {remembered.map((r) => (
                                                <div key={r.id}
                                                    onClick={() => {
                                                        setSelectedSavedRoute({
                                                            segment_id: r.id, name: r.name, waypoints: r.path,
                                                            distance: Number(r.distanceKm).toFixed(2), history: r,
                                                        });
                                                        setRouteFocusWaypoints([...r.path]);
                                                        setShowRouteSelector(false);
                                                        triggerNativeHaptic('medium');
                                                    }}
                                                    className="w-full bg-white rounded-[18px] p-4 flex items-center justify-between gap-3 cursor-pointer active:scale-95 transition-all shadow-sm border border-black/5">
                                                    <div className="min-w-0">
                                                        <div className="text-[15px] font-black text-black/85 truncate">{r.name}</div>
                                                        <div className="text-[12px] font-bold text-black/45 mt-0.5">
                                                            {Number(r.distanceKm).toFixed(2)} km · 跑過 {r.runs} 次{r.bestPaceSec ? ` · 最快 ${paceLabel(r.bestPaceSec)}/km` : ''}
                                                        </div>
                                                    </div>
                                                    <Navigation size={16} className="text-black/30 shrink-0" />
                                                </div>
                                            ))}
                                            <div className="text-[11px] font-black tracking-[0.22em] text-black/40 mt-2">自己畫的路線</div>
                                        </>
                                    );
                                })()}
                                {[...MOCK_SAVED_ROUTES, ...availableSegments].map((r, idx) => {
                                    // Resolve distance from either field
                                    const wps = r.path || r.waypoints || [];
                                    const distKm = r.distance
                                        ? Number(r.distance).toFixed(2)
                                        : r.distance_meters
                                            ? (r.distance_meters / 1000).toFixed(2)
                                            : wps.length > 1
                                                ? (() => {
                                                    let d = 0;
                                                    for (let i = 1; i < wps.length; i++) {
                                                        const R = 6371;
                                                        const dLat = (wps[i].lat - wps[i - 1].lat) * Math.PI / 180;
                                                        const dLng = (wps[i].lng - wps[i - 1].lng) * Math.PI / 180;
                                                        const a = Math.sin(dLat / 2) ** 2 + Math.cos(wps[i - 1].lat * Math.PI / 180) * Math.cos(wps[i].lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
                                                        d += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                                                    }
                                                    return d.toFixed(2);
                                                })()
                                                : '—';
                                    const wpCount = wps.length;
                                    return (
                                        <div
                                            key={r.id || r.segment_id || idx}
                                            onClick={() => {
                                                const normalizedRoute = {
                                                    segment_id: r.id || r.segment_id,
                                                    name: r.name || 'Custom Route',
                                                    waypoints: wps,
                                                    distance: distKm,
                                                    // 這條路線之前跑過嗎？（跟跑步記憶裡的路線比對指紋）
                                                    history: routeHistoryFor(loadRunMemory(getUserId()), { waypoints: wps, distanceKm: Number(distKm) || 0 }),
                                                };
                                                setSelectedSavedRoute(normalizedRoute);
                                                // ✅ Fly map to route bounds without overwriting live GPS track
                                                if (wps.length > 0) setRouteFocusWaypoints([...wps]);
                                                setShowRouteSelector(false);
                                                triggerNativeHaptic('medium');
                                            }}
                                            className="w-full bg-white rounded-[18px] p-4 flex flex-col gap-3 cursor-pointer active:scale-95 transition-all shadow-sm border border-black/5 hover:border-orange-200"
                                        >
                                            {/* 原本的上半部：路線 Icon、名稱與距離 */}
                                            <div className="flex items-center gap-4 w-full">
                                                <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 p-1.5" style={{ backgroundColor: C.paper2 }}>
                                                    {wps && wps.length > 1 ? (() => {
                                                        let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
                                                        wps.forEach(wp => {
                                                            if (wp.lat < minLat) minLat = wp.lat;
                                                            if (wp.lat > maxLat) maxLat = wp.lat;
                                                            if (wp.lng < minLng) minLng = wp.lng;
                                                            if (wp.lng > maxLng) maxLng = wp.lng;
                                                        });
                                                        const latDiff = maxLat - minLat || 0.001;
                                                        const lngDiff = maxLng - minLng || 0.001;
                                                        const points = wps.map(wp => {
                                                            const x = ((wp.lng - minLng) / lngDiff) * 80 + 10;
                                                            const y = 100 - (((wp.lat - minLat) / latDiff) * 80 + 10);
                                                            return `${x},${y}`;
                                                        }).join(' ');
                                                        return (
                                                            <svg viewBox="0 0 100 100" className="w-full h-full opacity-90">
                                                                <polyline points={points} fill="none" stroke={C.coral} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
                                                            </svg>
                                                        );
                                                    })() : (
                                                        <Navigation size={20} className="text-[#161415]/40" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-black text-[15px] leading-tight text-black/90 truncate">{r.name || '未命名路徑'}</h4>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-[11px] font-black text-black/70">{distKm} km</span>
                                                        <span className="text-black/20 text-[11px]">•</span>
                                                        <span className="text-[9px] font-bold text-black/40 uppercase tracking-widest">{wpCount} pts</span>
                                                        {!r.id && <span className="text-[12px] font-black px-1.5 py-0.5 rounded-md tracking-wide" style={{ background: C.paper2, color: C.ink }}>我的路線</span>}
                                                    </div>
                                                </div>
                                                {/* Mini distance badge */}
                                                <div className="shrink-0 w-12 h-12 rounded-full bg-black/5 flex flex-col items-center justify-center">
                                                    <span className="text-[13px] font-black text-black/80 leading-none">{distKm}</span>
                                                    <span className="text-[9px] font-bold text-black/40 uppercase tracking-wide">km</span>
                                                </div>
                                            </div>

                                            {/* 🔥 新增的 PR 重點數據卡牌 */}
                                            <div className="flex gap-2 mt-1 pt-3 border-t border-black/5 w-full">
                                                <div className="flex-1 bg-[#F95C4B]/10 rounded-xl p-2 flex flex-col items-center justify-center border border-[#F95C4B]/20">
                                                    <span className="text-[9px] text-[#F95C4B] font-bold uppercase tracking-wider mb-0.5 flex items-center gap-1">
                                                        <Crown size={10} strokeWidth={3} /> 最佳配速
                                                    </span>
                                                    <span className="text-[14px] font-black text-[#161415] share-tech-mono">{r.prs?.pace || "4'15\""}</span>
                                                </div>
                                                <div className="flex-1 bg-black/5 rounded-xl p-2 flex flex-col items-center justify-center border border-black/5">
                                                    <span className="text-[9px] text-black/50 font-bold uppercase tracking-wider mb-0.5 flex items-center gap-1">
                                                        <Timer size={10} /> RECORD
                                                    </span>
                                                    <span className="text-[14px] font-black text-[#161415] share-tech-mono">{r.prs?.time || "22:30"}</span>
                                                </div>
                                                <div className="flex-1 bg-black/5 rounded-xl p-2 flex flex-col items-center justify-center border border-black/5">
                                                    <span className="text-[9px] text-black/50 font-bold uppercase tracking-wider mb-0.5 flex items-center gap-1">
                                                        <Zap size={10} /> 努力值
                                                    </span>
                                                    <span className="text-[14px] font-black text-[#161415] share-tech-mono">{r.prs?.score || "142"}</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* 👟 Gear Selector — 跑前選擇裝備 (取代原本的循環切換) */}
                <AnimatePresence>
                    {showShoeSelector && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="fixed inset-0 z-[10000000] bg-black/60 backdrop-blur-md flex items-center justify-center p-6"
                            onClick={() => setShowShoeSelector(false)}
                        >
                            <div className="bg-[#EFEFEF] w-full max-w-sm rounded-[28px] p-6 shadow-2xl flex flex-col gap-3 max-h-[80dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-2xl font-black text-black/90 uppercase tracking-tight">選擇裝備</h3>
                                    <motion.button {...pressProps('icon')} onClick={() => setShowShoeSelector(false)} className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center text-black/50 hover:bg-black/10 transition-colors">
                                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                                    </motion.button>
                                </div>

                                {availableShoes.map((shoe) => {
                                    const isSel = selectedShoe?.id === shoe.id;
                                    const pct = shoe.maxMileage > 0 ? Math.min(100, Math.round((shoe.mileage / shoe.maxMileage) * 100)) : 0;
                                    const emoji = (shoe.imageUrl && shoe.imageUrl.length <= 4) ? shoe.imageUrl : (shoe.emoji || '👟');
                                    return (
                                        <div
                                            key={shoe.id}
                                            onClick={() => {
                                                setSelectedShoe(shoe);
                                                setCurrentShoe(shoe.id); // 🔑 持久化 → 圖一 Shoe Mileage 卡同步
                                                setShowShoeSelector(false);
                                                triggerNativeHaptic('medium');
                                            }}
                                            className="w-full rounded-[18px] p-4 flex items-center gap-4 cursor-pointer active:scale-95 transition-all border"
                                            style={{
                                                background: isSel ? C.ink : '#FFFFFF',
                                                borderColor: isSel ? C.ink : 'rgba(0,0,0,0.05)',
                                            }}
                                        >
                                            <div className="text-3xl shrink-0">{emoji}</div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: isSel ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)' }}>{shoe.brand}</p>
                                                <p className="text-[15px] font-black truncate" style={{ color: isSel ? '#FFFFFF' : C.ink }}>{shoe.model}</p>
                                                <div className="h-[3px] rounded-full mt-1.5 overflow-hidden" style={{ background: isSel ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)' }}>
                                                    <div style={{ height: '100%', width: `${pct}%`, background: pct >= 80 ? C.coralDeep : C.coral, borderRadius: 99 }} />
                                                </div>
                                                <p className="text-[11px] font-bold mt-1" style={{ color: isSel ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.4)' }}>{Number(shoe.mileage).toFixed(1)} / {shoe.maxMileage} km</p>
                                            </div>
                                            {isSel && <div className="w-2 h-2 rounded-full shrink-0" style={{ background: C.coral }} />}
                                        </div>
                                    );
                                })}

                                {/* 管理裝備入口 */}
                                <motion.button {...pressProps('pill')}
 onClick={() => { setShowShoeSelector(false); navigate('/gear-garage-mobile'); }}
 className="w-full rounded-[18px] py-3.5 mt-1 flex items-center justify-center gap-2"
 style={{ background: 'rgba(0,0,0,0.05)', color: 'rgba(0,0,0,0.55)' }}
 >
                                    <span className="text-[12px] font-black tracking-[0.04em]">管理裝備庫</span>
                                </motion.button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* 🔥 Cardio Plan Overlay */}
                {showCardioPlan && (
                    <div className="absolute inset-0 z-[1000001] bg-[#09090B]">
                        <CardioPlanOverlay
                            onClose={() => setShowCardioPlan(false)}
                            onSelectIntent={(intent) => {
                                setSelectedIntent(intent);
                                setShowCardioPlan(false);
                                // ⛔️ TODAY'S GOAL 已停用 — intent 設定後直接結束流程，不再彈 PUSH/STEADY/EASY
                            }}
                            isHealthKitAvailable={isHealthKitAvailable}
                            healthKitIsActive={healthKitIsActive}
                            forceSimulation={forceSimulation}
                            toggleForceSimulation={toggleForceSimulation}
                            hasHeartRateData={dataAvailability.hasHeartRateData}
                        />
                    </div>
                )}

                {/* 🔥 Segment Explorer Overlay */}
                {showSegmentExplorer && (
                    <div className="absolute inset-0 z-[1000001] bg-[#09090B] overflow-y-auto">
                        <SegmentExplorerMobile onClose={() => {
                            setShowSegmentExplorer(false);
                            fetchSegments(); // 🔥 Refresh list to include new segments
                        }} />
                    </div>
                )}

                {/* 🔥 Trend Analysis Overlay */}
                {/* 🔥 Trend Analysis Overlay */}
                {showTrends && (
                    <CardioTrendView
                        onClose={() => setShowTrends(false)}
                        intent={selectedIntent} // 🔥 Pass intent
                        forceSimulation={forceSimulation}
                        toggleForceSimulation={toggleForceSimulation}
                        onOpenIntentSelection={() => setShowCardioPlan(true)}
                    />
                )}

                {/* 🔥 4. History Overlay (z-[1000001]) */}
                {showHistory && (
                    <div className="absolute inset-0 z-[1000001] bg-[#09090B] overflow-y-auto">
                        <RunningAnalysisMobile onBack={() => setShowHistory(false)} />
                    </div>
                )}

                {/* Results Overlay - Using fixed to ensure it covers viewport regardless of scroll */}
                {showResults && workoutSummary && (
                    <div className="fixed inset-0 z-[10000001] bg-[#0F0F0F] overflow-y-auto">
                        <CardioResultsMobile
                            cardioData={workoutSummary}
                            userId={getUserId()}
                            userHashtags={[]}
                            onClose={handleCloseResults}
                            onSave={handleCloseResults}
                        />
                    </div>
                )}
                {showResults && !workoutSummary && (
                    <div className="fixed inset-0 z-[10000] bg-black flex items-center justify-center">
                        <div className="text-white text-center">
                            <Activity size={32} className="mx-auto mb-4 animate-spin text-orange-500" />
                            <p className="font-bold text-xs tracking-widest opacity-50 uppercase">Finalizing Analysis...</p>
                        </div>
                    </div>
                )}

                {/* Modals with Ultra High Z-Index */}
                <SweatLiquidTransition isActive={isTransitioning} onComplete={handleTransitionComplete} />


                {showSaveConfirm && (() => {
                    // 🏅 預覽分數也走後備算分，避免無心率時確認框顯示 0 PTS
                    const previewScore = resolveSessionScore(cardioData.score, {
                        distanceKm: cardioData.distance || 0,
                        durationSec: cardioData.duration || 0,
                        avgPaceSec: cardioData.avgPace || 0,
                    }).score;
                    return <SaveConfirmationModal sessionScore={previewScore} currentBaseline={baseline || 80} isEligible={targetScore ? previewScore >= targetScore : previewScore > baseline} onConfirm={handleConfirmSave} onSaveOnly={handleCancelSave} onBack={() => setShowSaveConfirm(false)} />;
                })()}

                {/* 💯 Post-Run RPE Form — 跑完強制填，未填不能關閉 */}
                <AnimatePresence>
                    {showRpeForm && (
                        <PostRunRpeModal
                            targetBand={activePlan?.rpe_band || activePlan?.brick?.rpe_band}
                            onSubmit={async (rpeValue) => {
                                setLastRpeValue(rpeValue);
                                setShowRpeForm(false);
                                // 寫入後端讓 evaluateWeek 自動決定 Demote / Insert Recovery
                                try {
                                    await apiClient.post('/api/cardio-plan/log-rpe', {
                                        user_id: userId,
                                        // buildActivePlanFromBrick 給的是 brickId，以前讀 brick.brick_id 永遠是 null → RPE 掛不到磚上
                                        brick_id: activePlan?.brickId || null,
                                        rpe: rpeValue,
                                        logged_at: new Date().toISOString(),
                                    });
                                } catch (e) {
                                    console.warn('[RPE] log failed (offline ok):', e?.message);
                                    // 失敗也存 local 之後同步
                                    try {
                                        // offlineSync 連線後會補送這個佇列
                                        const pending = JSON.parse(localStorage.getItem(PENDING_RPE_KEY) || '[]');
                                        pending.push({ user_id: userId, brick_id: activePlan?.brickId || null, rpe: rpeValue, logged_at: new Date().toISOString() });
                                        localStorage.setItem(PENDING_RPE_KEY, JSON.stringify(pending));
                                    } catch { }
                                }
                                setShowSaveConfirm(true);
                            }}
                        />
                    )}
                </AnimatePresence>

                {/* 🏁 一週訓練結束 → 週結算提示視窗（導向 WeekSettlementSheet） */}
                <AnimatePresence>
                    {showWeekSettlePrompt && (
                        <motion.div
                            className="fixed inset-0 z-[100100] flex items-end justify-center"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            onClick={() => setShowWeekSettlePrompt(false)}
                            style={{ background: 'rgba(22,20,21,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
                        >
                            <motion.div
                                onClick={(e) => e.stopPropagation()}
                                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                                transition={{ type: 'spring', stiffness: 320, damping: 34 }}
                                style={{ width: '100%', maxWidth: 440, background: '#F6F4F1', borderRadius: '26px 26px 0 0', boxShadow: '0 -18px 50px rgba(22,20,21,0.22)', paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 20px)' }}
                            >
                                <div className="flex justify-center pt-3 pb-1"><div style={{ width: 36, height: 4, borderRadius: 99, background: '#CFC6B8' }} /></div>
                                <div className="px-7 pt-4">
                                    <p className="text-[12px] font-extrabold tracking-[0.04em]" style={{ color: 'rgba(22,20,21,0.4)' }}>本週訓練完成</p>
                                    <h2 className="mt-1.5" style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 700, fontSize: 26, color: '#161415' }}>跑步週結算出爐</h2>
                                    <p className="text-[13px] mt-2 leading-relaxed" style={{ color: 'rgba(22,20,21,0.55)' }}>
                                        系統已依你本週的實際表現完成結算，並算好下週的里程與配速調整。要現在看嗎？
                                    </p>
                                </div>
                                <div className="px-6 pt-6 flex flex-col gap-2.5">
                                    <motion.button {...pressProps('row')}
 onClick={() => { setShowWeekSettlePrompt(false); navigate('/cardio-week-settlement'); }}
 className="w-full py-4 rounded-[18px] flex items-center justify-center gap-2"
 style={{ background: '#161415', color: '#F6F4F1', fontSize: 14, fontWeight: 800, letterSpacing: '0.04em' }}
 >
                                        查看週結算
                                    </motion.button>
                                    <motion.button {...pressProps('row')}
 onClick={() => setShowWeekSettlePrompt(false)}
 className="w-full py-3 rounded-[18px] text-[13px] font-bold"
 style={{ color: 'rgba(22,20,21,0.5)' }}
 >
                                        稍後再看
                                    </motion.button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Segment Selector (Black Challenge Route Modal) removed per request (Image 1) */}

                {/* ⛔️ TODAY'S GOAL (PUSH / STEADY / EASY) 已依使用者要求停用
                       — 過度增加心智負擔，且系統會用 baseline + 計劃自動推算目標
                       <TargetSelectionModal ... /> */}

                {/* 🔴 Fix(bug1)：破紀錄慶祝頁按確認後，原本只開一個沒被渲染的 SavedOverlay，
                    導致使用者被丟回儀表板、進不了結算頁。改為直接 proceedToResults()。 */}
                {showGrowthReport && growthData && <div className="fixed inset-0 z-[2000]"><GrowthReportOverlay reportData={growthData} onConfirm={() => { setShowGrowthReport(false); proceedToResults(); }} /></div>}



                {/* ⋯ More Drawer (Portal · 液態融合動畫)
                      - origin 設在 ⋯ 按鈕中心，scale 從 0.4 spring 到 1
                      - 加上一條微小的連接「滴管」三角形，視覺上像從按鈕「黏出」 */}
                <AnimatePresence>
                    {showMoreMenu && (
                        <PortalSheet>
                            <div
                                className="fixed inset-0"
                                style={{ zIndex: 100098 }}
                                onClick={() => setShowMoreMenu(false)}
                            />
                            {/* 連接小三角 — 像從 ⋯ 按鈕滴出的液態玻璃 */}
                            <motion.div
                                initial={{ opacity: 0, scale: 0 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0 }}
                                transition={{ type: 'spring', stiffness: 420, damping: 26, delay: 0.04 }}
                                style={{
                                    position: 'fixed',
                                    top: moreMenuPos.top - 6,
                                    right: moreMenuPos.right + moreMenuPos.btnW / 2 - 6,
                                    width: 12,
                                    height: 12,
                                    zIndex: 100099,
                                    transformOrigin: 'center bottom',
                                    background: 'linear-gradient(160deg, rgba(255,255,255,0.82), rgba(252,247,244,0.66))',
                                    backdropFilter: 'blur(44px) saturate(180%)',
                                    WebkitBackdropFilter: 'blur(44px) saturate(180%)',
                                    border: '1px solid rgba(255,255,255,0.85)',
                                    borderBottom: 'none',
                                    borderRight: 'none',
                                    transform: 'rotate(45deg)',
                                    pointerEvents: 'none',
                                }}
                            />
                            <motion.div
                                initial={{ opacity: 0, scale: 0.4, y: -8 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.5, y: -6 }}
                                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                style={{
                                    position: 'fixed',
                                    top: moreMenuPos.top,
                                    right: moreMenuPos.right,
                                    transformOrigin: `calc(100% - ${moreMenuPos.btnW / 2}px) top`,
                                    zIndex: 100099,
                                    minWidth: 200,
                                    // 更濃的液態玻璃 + 珊瑚色折射光暈
                                    background: 'linear-gradient(160deg, rgba(255,255,255,0.82) 0%, rgba(252,247,244,0.66) 100%)',
                                    backdropFilter: 'blur(44px) saturate(180%)',
                                    WebkitBackdropFilter: 'blur(44px) saturate(180%)',
                                    border: '1px solid rgba(255,255,255,0.65)',
                                    borderTop: '1px solid rgba(255,255,255,0.95)',
                                    boxShadow: '0 22px 48px -10px rgba(43,39,34,0.28), inset 0 1px 1px rgba(255,255,255,1)',
                                    borderRadius: 18,
                                    overflow: 'hidden',
                                    padding: '7px 0',
                                }}
                            >
                                {/* 頂部高光弧 — Liquid Glass 反射特徵 */}
                                <div className="absolute top-0 left-0 right-0 h-1/3 pointer-events-none" style={{
                                    background: 'linear-gradient(180deg, rgba(255,255,255,0.5) 0%, transparent 100%)',
                                    mixBlendMode: 'screen',
                                }} />
                                {/* 珊瑚色折射光暈 */}
                                <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full pointer-events-none" style={{
                                    background: 'rgba(249,92,75,0.18)', filter: 'blur(36px)',
                                }} />
                                {[
                                    (() => {
                                        /* 🗺 地圖樣式循環。順序與名稱都來自 utils/mapTiles ——
                                           那裡才是「一個樣式對到哪組圖磚」的定義處。
                                           ⚠️ 以前這裡自己寫一份清單，結果選單上寫「極簡」、
                                              畫出來卻是染灰的全彩圖，名稱跟結果對不上。 */
                                        const MAP_ICON = {
                                            minimal: MapIcon, street: RouteIcon, satellite: Globe, dark: Moon,
                                        };
                                        const cur = MAP_STYLE_CYCLE.includes(mapStyle) ? mapStyle : 'minimal';
                                        const next = MAP_STYLE_CYCLE[(MAP_STYLE_CYCLE.indexOf(cur) + 1) % MAP_STYLE_CYCLE.length];
                                        const MAP_META = { [next]: { icon: MAP_ICON[next] || MapIcon, label: MAP_STYLES[next].label } };
                                        // 標籤/icon 描述「點下去會切換到的模式」，所見即所得，避免名稱與結果對不上
                                        return {
                                            id: 'map-mode',
                                            icon: MAP_META[next].icon,
                                            label: MAP_META[next].label,
                                            onClick: () => setMapStyle(next),
                                        };
                                    })(),
                                    { id: 'trends', icon: TrendingUp, label: '趨勢', onClick: () => setShowTrends(true) },
                                    { id: 'segments', icon: MapIcon, label: '區段', onClick: () => setShowSegmentExplorer(true) },
                                    { id: 'history', icon: History, label: '歷史記錄', onClick: () => navigate('/cardio-history-mobile') },
                                    { id: 'places', icon: MapPin, label: '跑步記憶', onClick: () => navigate('/run-memory-mobile') },
                                    // 🔊 語音播報（開關型）— 每整公里播報距離/配速/心率
                                    { id: 'voice', icon: Activity, label: '語音播報', isToggle: true, on: voiceEnabled, onClick: () => toggleVoice() },
                                    // ⏸️ 自動暫停（開關型）— 等紅綠燈自動停錶
                                    { id: 'auto-pause', icon: Pause, label: '自動暫停', isToggle: true, on: autoPauseEnabled, onClick: () => toggleAutoPause() },
                                ].map((item, i, arr) => {
                                    // 🎨 DRVN 設計系統：Coral 只保留給「啟用中的開關」這唯一焦點；
                                    //    一般 icon chip 一律中性（鈦金屬質感），避免 6 個珊瑚 icon 變壁紙。
                                    const isActiveToggle = item.isToggle && item.on;
                                    // 在「動作型」與「開關型」之間插一條 Pebble 髮絲線，做雜誌式分組。
                                    const prev = arr[i - 1];
                                    const showGroupRule = item.isToggle && prev && !prev.isToggle;
                                    return (
                                    <React.Fragment key={item.id}>
                                    {showGroupRule && (
                                        <div className="mx-3.5 my-1.5" style={{
                                            height: 1,
                                            background: 'rgba(207,198,184,0.7)', // Pebble #CFC6B8 @70%
                                        }} />
                                    )}
                                    <motion.button
                                        initial={{ opacity: 0, x: 10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.07 + i * 0.045, duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                                        whileTap={{ scale: 0.97 }}
                                        onClick={() => {
                                            triggerNativeHaptic('medium');
                                            // 開關型項目點了不關閉選單，讓使用者連續切換；其他項目維持原本「點完關閉」行為
                                            if (!item.isToggle) setShowMoreMenu(false);
                                            item.onClick();
                                        }}
                                        className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors relative z-10"
                                        style={{ WebkitTapHighlightColor: 'transparent', minHeight: 44 }}
                                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(22,20,21,0.04)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <div className="w-8 h-8 rounded-full flex items-center justify-center transition-colors" style={
                                            isActiveToggle
                                                ? {
                                                    // 唯一允許的 Coral：啟用中的開關
                                                    background: 'linear-gradient(150deg, rgba(249,92,75,0.9), rgba(217,64,48,0.95))',
                                                    border: '1px solid rgba(255,255,255,0.5)',
                                                    boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.5), 0 0 0 3px rgba(249,92,75,0.12)',
                                                    color: '#FFFFFF',
                                                }
                                                : {
                                                    // 中性鈦金屬 chip — 暖灰，無珊瑚
                                                    background: 'linear-gradient(150deg, rgba(255,255,255,0.85), rgba(228,222,210,0.5))',
                                                    border: '1px solid rgba(255,255,255,0.6)',
                                                    boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.85)',
                                                    color: 'rgba(22,20,21,0.7)',
                                                }
                                        }>
                                            <item.icon size={15} strokeWidth={2.3} />
                                        </div>
                                        <span className="text-[9px] font-black tracking-[0.16em] uppercase flex-1" style={{
                                            color: isActiveToggle ? '#161415' : 'rgba(22,20,21,0.88)',
                                        }}>
                                            {item.label}
                                        </span>
                                        {/* 開關型項目右側顯示 iOS 風格 switch */}
                                        {item.isToggle && (
                                            <span
                                                className="relative shrink-0 rounded-full transition-colors"
                                                style={{
                                                    width: 38, height: 22,
                                                    background: item.on ? '#F95C4B' : 'rgba(22,20,21,0.18)',
                                                }}
                                            >
                                                <span
                                                    className="absolute rounded-full bg-white transition-all"
                                                    style={{
                                                        width: 18, height: 18, top: 2,
                                                        left: item.on ? 18 : 2,
                                                        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                                                    }}
                                                />
                                            </span>
                                        )}
                                    </motion.button>
                                    </React.Fragment>
                                    );
                                })}
                            </motion.div>
                        </PortalSheet>
                    )}
                </AnimatePresence>

                {/* Info Modal */}
                <AnimatePresence>
                    {showInfoModal && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowInfoModal(false)}
                            className="fixed inset-0 z-[1000] flex items-center justify-center p-6"
                            style={{ background: 'rgba(8,7,9,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
                        >
                            {/* 🫧 Liquid Glass · 瑞士極簡 Effort Points 卡牌
                                結構：①折射模糊底 ②頂部 specular 高光弧 ③內緣折射邊 ④zone 色點反射 */}
                            <motion.div
                                initial={{ scale: 0.94, opacity: 0, y: 12 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ scale: 0.94, opacity: 0, y: 12 }}
                                transition={{ type: 'spring', damping: 26, stiffness: 300 }}
                                onClick={e => e.stopPropagation()}
                                className="w-full max-w-sm relative overflow-hidden"
                                style={{
                                    borderRadius: 28,
                                    padding: '28px 26px 24px',
                                    isolation: 'isolate',
                                    background: 'linear-gradient(160deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 55%, rgba(255,255,255,0.06) 100%)',
                                    backdropFilter: 'blur(40px) saturate(180%) brightness(1.04)',
                                    WebkitBackdropFilter: 'blur(40px) saturate(180%) brightness(1.04)',
                                    border: '1px solid rgba(255,255,255,0.20)',
                                    boxShadow: 'inset 0 1.5px 1px rgba(255,255,255,0.40), inset 0 -8px 18px rgba(0,0,0,0.28), 0 24px 60px rgba(0,0,0,0.55)',
                                    color: '#F5F1EA',
                                }}
                            >
                                {/* ② 頂部 specular 高光弧 */}
                                <span aria-hidden="true" style={{ position: 'absolute', top: 0, left: '6%', right: '6%', height: '42%', borderRadius: '0 0 50% 50%', background: 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.06) 55%, transparent 80%)', pointerEvents: 'none', zIndex: 1 }} />

                                <div style={{ position: 'relative', zIndex: 2 }}>
                                    {/* 標題 — 瑞士風 eyebrow + 主標，左對齊不置中 */}
                                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.32em', color: '#D4C4B7', textTransform: 'uppercase', marginBottom: 8 }}>DRVN LAB</div>
                                    <h3 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', margin: 0, color: '#F5F1EA' }}>Effort Points</h3>
                                    <p style={{ fontSize: 13, lineHeight: 1.6, margin: '8px 0 22px', color: 'rgba(245,241,234,0.62)', fontWeight: 500 }}>
                                        依心率 Zone 給分，強度越高、倍率越大。
                                    </p>

                                    {/* zone 列表 — hairline 分隔、等寬數字、zone 色點帶反射光暈 */}
                                    <div>
                                        {[
                                            { name: 'Warm Up', color: PASTEL_ZONES[1], mult: '0.5' },
                                            { name: 'Fat Burn', color: PASTEL_ZONES[2], mult: '1.0' },
                                            { name: 'Aerobic', color: PASTEL_ZONES[3], mult: '2.0' },
                                            { name: 'Anaerobic', color: PASTEL_ZONES[4], mult: '3.5' },
                                            { name: 'Extreme', color: PASTEL_ZONES[5], mult: '5.0' },
                                        ].map((zone, i) => (
                                            <div key={i} style={{
                                                display: 'flex', alignItems: 'center', gap: 12,
                                                padding: '13px 0',
                                                borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.08)',
                                            }}>
                                                <span style={{ width: 9, height: 9, borderRadius: '50%', background: zone.color, boxShadow: `0 0 8px ${zone.color}, inset 0 1px 1px rgba(255,255,255,0.5)`, flexShrink: 0 }} />
                                                <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.01em', color: '#F5F1EA' }}>{zone.name}</span>
                                                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 2 }}>
                                                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 400, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', color: '#F5F1EA' }}>{zone.mult}</span>
                                                    <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(245,241,234,0.45)' }}>×</span>
                                                </span>
                                            </div>
                                        ))}
                                    </div>

                                    <motion.button {...pressProps('row')}
 onClick={() => setShowInfoModal(false)}
 style={{
 marginTop: 22, width: '100%', height: 52, borderRadius: 18,
 display: 'flex', alignItems: 'center', justifyContent: 'center',
 background: 'rgba(255,255,255,0.12)',
 backdropFilter: 'blur(20px) saturate(160%)',
 WebkitBackdropFilter: 'blur(20px) saturate(160%)',
 border: '1px solid rgba(255,255,255,0.22)',
 boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.30)',
 color: '#F5F1EA', fontSize: 13, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase',
 }}
 >
                                        Got It
                                    </motion.button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* 🔥 3D 訓練計劃選擇器 (Vision Pro Style Cover Flow) */}
                <AnimatePresence>
                    {showTrainingPlans && (
                        <PortalSheet>
                            <motion.div
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[100000] bg-black/80 backdrop-blur-xl flex flex-col items-center justify-center"
                                onClick={() => setShowTrainingPlans(false)}
                            >
                                {/* 頂部標題 */}
                                <motion.div
                                    initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}
                                    className="absolute top-16 w-full flex flex-col items-center px-6"
                                >
                                    {carouselMode === 'plan' && thisWeekBricks && thisWeekBricks.length > 0 ? (
                                        <>
                                            <p className="text-[12px] font-black tracking-[0.3em] mb-1.5" style={{ color: C.coral }}>
                                                WK {String(thisWeek?.week_index || 1).padStart(2, '0')} · {{ base: '基礎', build: '建立', peak: '巔峰', taper: '減量' }[(thisWeek?.phase || 'base').toLowerCase()] || (thisWeek?.phase || 'BASE')}
                                            </p>
                                            <h2 className="text-3xl font-black text-white italic mb-1" style={{ fontFamily: 'var(--font-display)' }}>
                                                本週 · {thisWeekBricks.filter(b => b.status === 'completed').length}/{thisWeekBricks.length}
                                            </h2>
                                            <p className="text-[12px] font-bold text-white/50 tracking-widest">
                                                {thisWeekBricks.filter(b => b.status === 'completed').length}/{thisWeekBricks.length} BRICKS · {
                                                    thisWeekBricks
                                                        .filter(b => b.status === 'completed')
                                                        .reduce((acc, b) => acc + (b.actual_distance_km ?? b.distance_km ?? 0), 0)
                                                        .toFixed(1)
                                                }/{thisWeek?.target_mileage_km || 0} 公里
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <p className="text-[11px] font-black text-white/50 tracking-[0.06em] mb-2">今天練什麼</p>
                                            <h2 className="text-3xl font-black text-white italic" style={{ fontFamily: 'var(--font-display)' }}>
                                                訓練計劃
                                            </h2>
                                        </>
                                    )}

                                    {/* 快速訓練 ／ 我的課表 */}
                                    <div
                                        className="mt-4 flex items-center rounded-full p-[3px] relative"
                                        style={{
                                            background: 'rgba(255,255,255,0.08)',
                                            border: '1px solid rgba(255,255,255,0.06)',
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {/* 滑塊動畫背景 */}
                                        <motion.div
                                            className="absolute top-[3px] bottom-[3px] rounded-full"
                                            style={{
                                                background: 'linear-gradient(135deg, rgba(249,92,75,0.35) 0%, rgba(217,64,48,0.25) 100%)',
                                                border: '1px solid rgba(249,92,75,0.4)',
                                                boxShadow: '0 2px 8px rgba(249,92,75,0.15)',
                                            }}
                                            animate={{
                                                left: carouselMode === 'quick' ? '3px' : '50%',
                                                width: 'calc(50% - 3px)',
                                            }}
                                            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                                        />
                                        <motion.button {...pressProps('icon')}
 onClick={() => {
 setCarouselMode('quick');
 setCarouselIndex(0);
 }}
 className={`relative z-10 px-4 py-1.5 rounded-full text-[12px] font-black tracking-[0.18em] transition-colors duration-200 ${carouselMode === 'quick' ? 'text-white' : 'text-white/40'
 }`}
 >
                                            快速訓練
                                        </motion.button>
                                        <motion.button {...pressProps('icon')}
 onClick={() => {
 setCarouselMode('plan');
 setCarouselIndex(0);
 }}
 className={`relative z-10 px-4 py-1.5 rounded-full text-[12px] font-black tracking-[0.18em] transition-colors duration-200 flex items-center gap-1.5 ${carouselMode === 'plan' ? 'text-white' : 'text-white/40'
 }`}
 >
                                            我的課表
                                            {thisWeekBricks && thisWeekBricks.length > 0 && (
                                                <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-[#F95C4B] animate-pulse" />
                                            )}
                                        </motion.button>
                                    </div>

                                    {/* 🏃 在記過的跑點：這裡適合什麼課 */}
                                    {carouselMode === 'quick' && runPlaceHere && (
                                        <p className="mt-3 text-[12px] font-bold text-white/60 text-center max-w-full truncate">
                                            {`在${runPlaceHere.name} · 適合${suitedCourses(runPlaceHere).map((id) => COURSE_ZH[id]).join('、')}`}
                                        </p>
                                    )}

                                </motion.div>

                                {/* 關閉按鈕 */}
                                <motion.button {...pressProps('icon')} onClick={() => setShowTrainingPlans(false)} className="absolute top-16 right-6 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/70 backdrop-blur-md z-50 ">
                                    <X size={20} />
                                </motion.button>

                                {/* 🎯 Plan 模式且尚無計劃 → 海報式「建立計劃」提醒（取代預設卡輪播） */}
                                {isEmptyPlan ? (
                                    <motion.div
                                        initial={{ opacity: 0, y: 16 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                        className="relative w-full h-[420px] flex flex-col items-center justify-center px-10 text-center"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {/* 沒排過 → 只顯示「去排一份」這一件事；
                                            排過了 → 顯示那份計劃，不要說他沒有。 */}
                                        <h2 style={{ fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif', fontSize: 34, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#FFFFFF', margin: 0 }}>
                                            {planAction.line1}<br />{planAction.line2}
                                        </h2>
                                        {!!planWeekLabel && (
                                            <p style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.55)', margin: '14px 0 0', letterSpacing: '0.04em' }}>
                                                {planWeekLabel}
                                            </p>
                                        )}
                                        <div style={{ width: 32, height: 1, background: 'rgba(249,92,75,0.6)', margin: '24px 0' }} />
                                        <motion.button
                                            whileTap={{ scale: 0.96 }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setShowTrainingPlans(false);
                                                navigate(planAction.to);
                                            }}
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 8,
                                                padding: '14px 30px', borderRadius: 99, border: 'none',
                                                background: 'linear-gradient(135deg, #F95C4B 0%, #D94030 100%)',
                                                color: '#fff', fontSize: 14, fontWeight: 800, letterSpacing: '0.04em',
                                                cursor: 'pointer', boxShadow: '0 10px 28px rgba(249,92,75,0.45)',
                                            }}
                                        >
                                            {planAction.cta}
                                        </motion.button>
                                    </motion.div>
                                ) : (
                                    /* 3D 輪播容器 (加入手勢滑動支援) */
                                    <motion.div
                                        className="relative w-full h-[420px] flex items-center justify-center overflow-hidden perspective-[1200px] touch-none"
                                        onClick={(e) => e.stopPropagation()}
                                        drag="x"
                                        dragConstraints={{ left: 0, right: 0 }}
                                        dragElastic={0.1}
                                        onDragStart={(e, info) => {
                                            dragStartX.current = info.point.x;
                                        }}
                                        onDragEnd={(e, info) => {
                                            const dragDistance = info.point.x - dragStartX.current;
                                            const swipeThreshold = 40; // 滑動靈敏度

                                            if (dragDistance < -swipeThreshold && carouselIndex < coverFlowThemes.length - 1) {
                                                setCarouselIndex(prev => prev + 1); // 向左滑，下一張
                                                triggerNativeHaptic('light');
                                            } else if (dragDistance > swipeThreshold && carouselIndex > 0) {
                                                setCarouselIndex(prev => prev - 1); // 向右滑，上一張
                                                triggerNativeHaptic('light');
                                            }
                                        }}
                                    >
                                        {coverFlowThemes.map((theme, i) => {
                                            // 計算與當前選中卡片的距離差異
                                            const offset = i - carouselIndex;
                                            const absOffset = Math.abs(offset);
                                            const isActive = offset === 0;

                                            // 3D 空間數學計算
                                            const x = offset * 110; // 水平推移
                                            const z = absOffset * -100; // 往後退的深度
                                            const rotateY = offset * -15; // 側面翻轉角度
                                            const scale = 1 - absOffset * 0.1; // 邊緣縮小
                                            const opacity = absOffset > 2 ? 0 : 1 - absOffset * 0.4; // 透明度衰減
                                            const zIndex = 50 - absOffset; // 確保中間在最上層

                                            const Icon = theme.icon;
                                            // ★ v2.4 今天該做的那一張 —— 呼吸光 + 類型色描邊
                                            const isToday = !!theme.isToday;
                                            const glowColor = theme.typeAccent || theme.color || C.coral;

                                            return (
                                                <motion.div
                                                    key={theme.id}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        // Critical #3 — 點中間卡直接 confirm；點側邊卡切換到該卡
                                                        // ★ v2.4：今天該做的那一張是例外 —— 不管在不在中間，
                                                        //   點下去就直接開那份課表，不要逼人先滑到中間再點一次。
                                                        if (isActive || theme.isToday) {
                                                            if (!isActive) setCarouselIndex(i);
                                                            handleCoverFlowConfirm(theme);
                                                        } else {
                                                            setCarouselIndex(i);
                                                            triggerNativeHaptic('light');
                                                        }
                                                    }}
                                                    animate={
                                                        // 今天那張多一層「呼吸」—— 光暈隨 boxShadow 緩慢脹縮
                                                        isToday
                                                            ? {
                                                                x, z, rotateY, scale, opacity, zIndex,
                                                                boxShadow: [
                                                                    `0 25px 60px rgba(0,0,0,0.6), 0 0 0 2px ${glowColor}, 0 0 18px ${glowColor}55`,
                                                                    `0 25px 60px rgba(0,0,0,0.6), 0 0 0 2.5px ${glowColor}, 0 0 40px ${glowColor}aa`,
                                                                    `0 25px 60px rgba(0,0,0,0.6), 0 0 0 2px ${glowColor}, 0 0 18px ${glowColor}55`,
                                                                ],
                                                            }
                                                            : { x, z, rotateY, scale, opacity, zIndex }
                                                    }
                                                    transition={
                                                        isToday
                                                            ? {
                                                                default: { type: 'spring', stiffness: 250, damping: 25 },
                                                                boxShadow: { duration: 2.8, repeat: Infinity, ease: 'easeInOut' },
                                                            }
                                                            : { type: 'spring', stiffness: 250, damping: 25 }
                                                    }
                                                    className={`absolute w-[260px] h-[360px] rounded-[28px] overflow-hidden shadow-2xl ${isActive ? 'cursor-pointer' : 'cursor-pointer'}`}
                                                    style={{
                                                        // 🎯 滿版海報背景
                                                        backgroundImage: `url(${theme.image})`,
                                                        backgroundSize: 'cover',
                                                        backgroundPosition: 'center',
                                                        ...(isToday ? {} : {
                                                            boxShadow: isActive
                                                                ? (theme._isBrickCard
                                                                    ? `0 25px 60px rgba(0,0,0,0.6), 0 0 0 2px ${theme.color}, 0 0 20px ${theme.color}66`
                                                                    : `0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.2)`)
                                                                : (theme._isBrickCard
                                                                    ? `0 10px 30px rgba(0,0,0,0.8), 0 0 0 1.5px ${theme.color}aa`
                                                                    : '0 10px 30px rgba(0,0,0,0.8)'),
                                                        }),
                                                        transformStyle: 'preserve-3d'
                                                    }}
                                                >
                                                    {/* 🎯 Liquid Glass Design: 半透明 + 邊框光澤 (降低模糊度讓底圖透出來) */}
                                                    <div
                                                        className="absolute inset-0 z-0 pointer-events-none transition-all duration-500"
                                                        style={{
                                                            background: theme._isBrickCard
                                                                ? 'linear-gradient(135deg, rgba(22,20,21,0.2) 0%, rgba(22,20,21,0.7) 100%)'
                                                                : 'linear-gradient(135deg, rgba(22,20,21,0.1) 0%, rgba(22,20,21,0.5) 100%)',
                                                            backdropFilter: isActive ? 'blur(0px)' : 'blur(4px)',
                                                            WebkitBackdropFilter: isActive ? 'blur(0px)' : 'blur(4px)',
                                                        }}
                                                    />
                                                    <div
                                                        className="absolute inset-0 z-0 pointer-events-none"
                                                        style={{
                                                            border: '1px solid rgba(246,244,241,0.15)',
                                                            boxShadow: 'inset 0 1px 2px rgba(246,244,241,0.2)',
                                                            borderRadius: '28px'
                                                        }}
                                                    />

                                                    {/* 型態標籤：單一中文標籤（課型） */}
                                                    <div className="absolute top-6 left-6 z-20">
                                                        <span
                                                            className="px-3 py-1 text-[11px] font-black rounded-full shadow-lg"
                                                            style={{
                                                                // 種類標籤底色：與週清單（圖三 TYPE_VISUAL.tagBg）一致
                                                                background: theme.typeTagBg || theme.color || C.paper2,
                                                                color: theme.typeTagText || C.ink,
                                                            }}
                                                        >
                                                            {theme._isBrickCard ? theme.type : (theme.tag || theme.type)}
                                                        </span>
                                                    </div>

                                                    {/* 中央/底部：主標題 (Clean Typography) */}
                                                    <div className="absolute inset-0 flex flex-col justify-end p-6 z-10">
                                                        <div className="mb-10 transition-all duration-500" style={{ transform: isActive ? 'translateY(0)' : 'translateY(20px)', opacity: isActive ? 1 : 0 }}>
                                                            <h2
                                                                className="text-[28px] leading-[1.1] font-bold tracking-tight mb-3"
                                                                style={{
                                                                    color: C.paper, // Paper
                                                                    textShadow: '0 4px 12px rgba(0,0,0,0.5)'
                                                                }}
                                                            >
                                                                {theme.title}
                                                            </h2>
                                                            <p className="text-[12px] font-medium leading-relaxed max-w-[85%]" style={{ color: C.sand /* Pebble */ }}>
                                                                {theme.desc || (theme._isBrickCard ? '依照此強度的目標配速與時間執行，建立有氧基底。' : '')}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* 🎯 右下角/底部資訊 (Liquid Glass Capsules) */}
                                                    <div className="absolute bottom-6 right-6 z-30 flex items-center gap-2 transition-opacity duration-300" style={{ opacity: isActive ? 1 : 0 }}>
                                                        {theme._isBrickCard ? (
                                                            /* 🧱 Brick 卡：顯示 RPE + 距離/時長 */
                                                            <>
                                                                {theme.distanceKm && (
                                                                    <div
                                                                        className="px-3 py-1.5 rounded-full"
                                                                        style={{ background: 'rgba(246,244,241,0.1)', border: '1px solid rgba(246,244,241,0.2)', backdropFilter: 'blur(10px)' }}
                                                                    >
                                                                        <p className="text-[11px] font-bold text-[#F6F4F1] whitespace-nowrap">
                                                                            {theme.distanceKm} 公里
                                                                        </p>
                                                                    </div>
                                                                )}
                                                                <div
                                                                    className="px-3 py-1.5 rounded-full shadow-lg"
                                                                    style={{ background: theme.typeTagBg || theme.color || C.paper2 }}
                                                                >
                                                                    <p className="text-[11px] font-black" style={{ color: theme.typeTagText || '#161415' }}>
                                                                        {theme.rpeBand ? `RPE ${theme.rpeBand.min}-${theme.rpeBand.max}` : `${theme.durationMin || ''} 分`}
                                                                    </p>
                                                                </div>
                                                            </>
                                                        ) : (
                                                            /* 🎨 靜態主題卡：顯示難度/時長 */
                                                            <>
                                                                <div
                                                                    className="px-3 py-1.5 rounded-full"
                                                                    style={{ background: 'rgba(246,244,241,0.1)', border: '1px solid rgba(246,244,241,0.2)', backdropFilter: 'blur(10px)' }}
                                                                >
                                                                    <p className="text-[11px] font-bold text-[#F6F4F1] whitespace-nowrap">
                                                                        {courseMinutesRange(theme) || theme.duration}
                                                                    </p>
                                                                </div>
                                                                <div
                                                                    className="px-3 py-1.5 rounded-full shadow-lg bg-[#F6F4F1]"
                                                                >
                                                                    <p className="text-[11px] font-black text-[#161415]">
                                                                        {theme.difficulties.length > 1 ? `${theme.difficulties.length} 個程度` : '單一課表'}
                                                                    </p>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>

                                                    {/* 圖一風格標語：隨機動態點綴 */}
                                                    <div className="absolute top-1/2 right-4 -rotate-90 opacity-40 z-10 pointer-events-none">
                                                        <p className="text-[24px] font-black text-white/20 whitespace-nowrap">
                                                            IS BETTER TOGETHER •
                                                        </p>
                                                    </div>
                                                    {/* 🌟 意圖推薦徽章：根據 Onboarding 的 intent_tag，
                                                       在被推薦的有氧計劃卡片右上角顯示 "FOR YOU" 標籤 */}
                                                    {isActive && theme.id === recommendedCardioId && !theme._isBrickCard && (
                                                        <motion.div
                                                            initial={{ opacity: 0, y: -8, scale: 0.9 }}
                                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                                            transition={{ delay: 0.35, type: 'spring', stiffness: 280, damping: 22 }}
                                                            className="absolute top-6 right-6 z-30 flex items-center gap-1.5 px-3 py-1.5 shadow-xl"
                                                            style={{
                                                                background: C.coral,
                                                                transform: 'rotate(3deg)',
                                                                boxShadow: '3px 3px 0 rgba(0,0,0,0.25)',
                                                            }}
                                                        >
                                                            <span
                                                                className="inline-block w-1.5 h-1.5 rounded-full"
                                                                style={{ background: '#fff' }}
                                                            />
                                                            <span
                                                                className="text-[12px] font-black tracking-[0.18em] text-white"
                                                                style={{ fontFamily: 'var(--font-body)' }}
                                                            >
                                                                For&nbsp;You · 意圖推薦
                                                            </span>
                                                        </motion.div>
                                                    )}

                                                    {/* 🧱 動態 brick 卡：右上角顯示「WK」Liquid 徽章 */}
                                                    {theme._isBrickCard && theme.weekIndex && !theme.isCompleted && !theme.isSkipped && (
                                                        <div
                                                            className="absolute top-6 right-6 z-30 flex items-center px-2 py-1 rounded-full shadow-md"
                                                            style={{
                                                                background: 'rgba(246,244,241,0.15)',
                                                                border: '1px solid rgba(246,244,241,0.2)',
                                                                backdropFilter: 'blur(8px)',
                                                            }}
                                                        >
                                                            <span
                                                                className="text-[9px] font-bold tracking-[0.2em] uppercase"
                                                                style={{ color: C.paper }}
                                                            >
                                                                WK {String(theme.weekIndex).padStart(2, '0')}
                                                            </span>
                                                        </div>
                                                    )}

                                                    {/* ✅ 已完成 brick：灰階遮罩 + 大綠勾 */}
                                                    {theme._isBrickCard && theme.isCompleted && (
                                                        <>
                                                            <div
                                                                className="absolute inset-0 z-20 pointer-events-none"
                                                                style={{
                                                                    background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 100%)',
                                                                    backdropFilter: 'grayscale(0.7)',
                                                                    WebkitBackdropFilter: 'grayscale(0.7)',
                                                                }}
                                                            />
                                                            <div
                                                                className="absolute top-6 right-6 z-30 flex items-center gap-1.5 px-3 py-1.5 shadow-xl"
                                                                style={{
                                                                    background: '#7BD3A5',
                                                                    transform: 'rotate(-2deg)',
                                                                    boxShadow: '3px 3px 0 rgba(0,0,0,0.30)',
                                                                }}
                                                            >
                                                                <span style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 12, lineHeight: 1 }}>✓</span>
                                                                <span
                                                                    className="text-[9px] font-black tracking-[0.20em] uppercase"
                                                                    style={{ color: '#0A0A0A', fontFamily: 'var(--font-body)' }}
                                                                >
                                                                    DONE
                                                                </span>
                                                            </div>

                                                            {/* ★ v2.4 完成率：實跑 ÷ 計劃。打勾只說「有做」，
                                                                數字才說得出「做到什麼程度」。 */}
                                                            {theme.completionPct != null && (
                                                                <div className="absolute bottom-6 left-6 right-6 z-30 pointer-events-none">
                                                                    <div className="flex items-baseline gap-1">
                                                                        <span
                                                                            className="font-light tabular-nums"
                                                                            style={{ fontSize: 44, lineHeight: 0.85, color: '#FFFFFF', letterSpacing: '-0.04em' }}
                                                                        >
                                                                            {theme.completionPct}
                                                                        </span>
                                                                        <span className="text-[16px] font-light" style={{ color: 'rgba(255,255,255,0.7)' }}>%</span>
                                                                        <span className="text-[12px] font-black tracking-[0.20em] ml-1.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
                                                                            完成度
                                                                        </span>
                                                                    </div>
                                                                    {theme.actualDistanceKm > 0 && theme.distanceKm > 0 && (
                                                                        <div className="text-[11px] font-bold tabular-nums mt-1" style={{ color: 'rgba(255,255,255,0.55)' }}>
                                                                            {theme.actualDistanceKm.toFixed(1)} / {theme.distanceKm} km
                                                                        </div>
                                                                    )}
                                                                    <div className="h-[3px] rounded-full overflow-hidden mt-2" style={{ background: 'rgba(255,255,255,0.18)' }}>
                                                                        <div
                                                                            className="h-full rounded-full"
                                                                            style={{
                                                                                width: `${Math.min(100, theme.completionPct)}%`,
                                                                                background: '#7BD3A5',
                                                                            }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </>
                                                    )}

                                                    {/* ⊘ 已跳過 brick */}
                                                    {theme._isBrickCard && theme.isSkipped && (
                                                        <>
                                                            <div
                                                                className="absolute inset-0 z-20 pointer-events-none"
                                                                style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'grayscale(0.9)', WebkitBackdropFilter: 'grayscale(0.9)' }}
                                                            />
                                                            <div
                                                                className="absolute top-6 right-6 z-30 px-3 py-1.5 shadow-xl"
                                                                style={{
                                                                    background: 'rgba(255,255,255,0.10)',
                                                                    border: '1px dashed rgba(255,255,255,0.40)',
                                                                    transform: 'rotate(-1deg)',
                                                                }}
                                                            >
                                                                <span
                                                                    className="text-[9px] font-black tracking-[0.20em] uppercase"
                                                                    style={{ color: 'rgba(255,255,255,0.70)', fontFamily: 'var(--font-body)' }}
                                                                >
                                                                    SKIPPED
                                                                </span>
                                                            </div>
                                                        </>
                                                    )}
                                                </motion.div>
                                            );
                                        })}
                                    </motion.div>
                                )}

                                {/* 底部操作區 (包含分頁指示點與開始按鈕) — 無計劃的空狀態不顯示 */}
                                {!isEmptyPlan && (
                                    <motion.div
                                        initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}
                                        className="absolute bottom-12 w-full px-8 flex flex-col items-center"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {/* 圓點指示器 */}
                                        <div className="flex gap-2 mb-8">
                                            {coverFlowThemes.map((_, i) => (
                                                <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === carouselIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/20'}`} />
                                            ))}
                                        </div>

                                        {/* 進入主題詳細頁 / 開始自定義 / 動態 brick 直接開跑（與點中間卡共用邏輯） */}
                                        <motion.button {...pressProps('pill')}
 onClick={() => handleCoverFlowConfirm(coverFlowThemes[carouselIndex])}
 className="w-full max-w-[280px] py-4 rounded-full bg-[#F95C4B] text-[#161415] text-[15px] font-black uppercase tracking-widest shadow-[0_8px_30px_rgba(249,92,75,0.4)]"
 >
                                            {(() => {
                                                const t = coverFlowThemes[carouselIndex];
                                                if (!t) return '探索';
                                                if (t.id === 'custom') return '自訂我的訓練';
                                                if (t._isBrickCard && t.isCompleted) return `✓ 已完成 · 看本週進度`;
                                                if (t._isBrickCard) return `開始 ${t.title}`;
                                                return `探索 ${t.title}`;
                                            })()}
                                        </motion.button>
                                    </motion.div>
                                )}

                            </motion.div>

                            {/* Brick preview sheet 已提升到 root，這裡不再重複 mount */}

                            {/* 🎯 主題詳細頁與難度選擇 (Theme Detail & Difficulty Selector Modal) - Redesigned to Pebble Style */}
                            <AnimatePresence>
                                {selectedTheme && selectedTheme.id !== 'custom' && (() => {
                                    const selectedDifficulty = selectedTheme.difficulties[selectedDifficultyIdx] || selectedTheme.difficulties[0];
                                    // 個人配速：有 5K 基準才給輕鬆段配速；預告與開跑用同一份 steps
                                    const courseSteps = personalizeQuickSteps(selectedDifficulty.steps, baselinePace5K());
                                    const totalDuration = Math.round(courseSteps.reduce((acc, step) => acc + step.duration, 0) / 60);
                                    const mainSet = selectedDifficulty.main || mainSetOf(courseSteps);
                                    const bandText = (b) => (b ? (b.min === b.max ? `${b.min}` : `${b.min}–${b.max}`) : '--');

                                    return (
                                        <motion.div
                                            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                                            className="fixed inset-0 z-[100005] flex flex-col"
                                            onClick={(e) => e.stopPropagation()}
                                            style={{
                                                background: 'radial-gradient(120% 70% at 50% -10%, #FFFFFF 0%, #F6F4F1 38%, #E9E3D8 100%)',
                                                color: 'var(--cardio-text-strong)',
                                                fontFamily: 'var(--font-body)',
                                            }}
                                        >
                                            {/* Titanium hairline grain overlay */}
                                            <div
                                                className="absolute inset-0 pointer-events-none"
                                                style={{
                                                    background: 'linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.4) 44%, rgba(255,255,255,0.05) 52%, transparent 60%)',
                                                    mixBlendMode: 'overlay',
                                                    opacity: 0.45,
                                                }}
                                            />

                                            {/* 頂部 Header */}
                                            <div className="relative z-10 px-6 pt-12 pb-4 flex items-center justify-between">
                                                <motion.button {...pressProps('pill')} onClick={() => setSelectedTheme(null)} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #F6F4F1 0%, #E4DED2 100%)', border: '1px solid rgba(255,255,255,0.85)', boxShadow: '0 4px 10px rgba(22,20,21,0.06), inset 0 1px 1px rgba(255,255,255,1)' }}>
                                                    <ArrowLeft size={18} strokeWidth={2.4} color="#161415" />
                                                </motion.button>
                                                <span className="text-[12px] font-extrabold tracking-[0.20em]" style={{ color: '#161415' }}>
                                                    快速訓練
                                                </span>
                                                <div className="w-10 h-10" /> {/* placeholder for balance */}
                                            </div>

                                            {/* 內容區塊 */}
                                            <div className="relative z-10 flex-1 overflow-y-auto px-6 pt-2 pb-32">
                                                {/* 標題區 */}
                                                <div className="mb-6">
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: selectedTheme.color, boxShadow: `0 0 0 3px ${selectedTheme.color}40` }} />
                                                        <span className="text-[12px] font-extrabold" style={{ color: 'rgba(22,20,21,0.50)' }}>
                                                            {selectedTheme.tag || selectedTheme.title}
                                                        </span>
                                                    </div>
                                                    <h2 className="text-[38px] leading-[1.02] font-light tracking-[-0.03em]" style={{ color: '#161415' }}>
                                                        {selectedTheme.title}
                                                    </h2>
                                                </div>

                                                {/* 難易度切換 (Difficulty Selector) */}
                                                <div className="flex gap-2 mb-6 p-1 rounded-[18px]" style={{ background: 'rgba(22,20,21,0.05)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)' }}>
                                                    {selectedTheme.difficulties.map((diff, idx) => {
                                                        const active = selectedDifficultyIdx === idx;
                                                        return (
                                                            <motion.button {...pressProps('cta')}
 key={idx}
 onClick={() => { setSelectedDifficultyIdx(idx); triggerNativeHaptic('light'); }}
 className="flex-1 py-3 rounded-[18px] text-[12px] font-black tracking-widest uppercase"
 style={{
 background: active ? '#FFFFFF' : 'transparent',
 color: active ? '#161415' : 'rgba(22,20,21,0.4)',
 boxShadow: active ? '0 4px 10px rgba(0,0,0,0.05), inset 0 1px 1px rgba(255,255,255,1)' : 'none'
 }}
 >
                                                                {diff.level}
                                                            </motion.button>
                                                        );
                                                    })}
                                                </div>

                                                {/* Metric Cards (時長 / 距離 / 目標配速) */}
                                                <div className="grid grid-cols-3 gap-3 mb-8">
                                                    <div className="rounded-[24px] p-4 relative overflow-hidden" style={{ background: 'rgba(228, 222, 210, 0.45)', backdropFilter: 'blur(30px) saturate(160%)', borderTop: '1.5px solid rgba(246, 244, 241, 0.9)', borderBottom: '1px solid rgba(207, 198, 184, 0.3)', borderLeft: '1px solid rgba(246, 244, 241, 0.6)', borderRight: '1px solid rgba(207, 198, 184, 0.3)', boxShadow: '0 8px 24px -6px rgba(22, 20, 21, 0.08), inset 0 2px 4px rgba(246, 244, 241, 0.6)' }}>
                                                        <div className="text-[12px] font-extrabold tracking-[0.04em] mb-2" style={{ color: 'rgba(22, 20, 21, 0.55)' }}>時長</div>
                                                        <div className="font-light flex items-end gap-1" style={{ color: '#161415' }}>
                                                            <span style={{ fontSize: 30, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{totalDuration}</span>
                                                            <span className="text-[11px] font-bold mb-1">分鐘</span>
                                                        </div>
                                                    </div>
                                                    <div className="rounded-[24px] p-4 relative overflow-hidden" style={{ background: 'rgba(228, 222, 210, 0.45)', backdropFilter: 'blur(30px) saturate(160%)', borderTop: '1.5px solid rgba(246, 244, 241, 0.9)', borderBottom: '1px solid rgba(207, 198, 184, 0.3)', borderLeft: '1px solid rgba(246, 244, 241, 0.6)', borderRight: '1px solid rgba(207, 198, 184, 0.3)', boxShadow: '0 8px 24px -6px rgba(22, 20, 21, 0.08), inset 0 2px 4px rgba(246, 244, 241, 0.6)' }}>
                                                        <div className="text-[12px] font-extrabold tracking-[0.04em] mb-2" style={{ color: 'rgba(22, 20, 21, 0.55)' }}>主課</div>
                                                        <div className="font-light" style={{ color: '#161415', fontSize: 22, letterSpacing: '-0.02em', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
                                                            {mainSet?.label || '--'}
                                                        </div>
                                                    </div>
                                                    <div className="rounded-[24px] p-4 relative overflow-hidden" style={{ background: 'rgba(228, 222, 210, 0.45)', backdropFilter: 'blur(30px) saturate(160%)', borderTop: '1.5px solid rgba(246, 244, 241, 0.9)', borderBottom: '1px solid rgba(207, 198, 184, 0.3)', borderLeft: '1px solid rgba(246, 244, 241, 0.6)', borderRight: '1px solid rgba(207, 198, 184, 0.3)', boxShadow: '0 8px 24px -6px rgba(22, 20, 21, 0.08), inset 0 2px 4px rgba(246, 244, 241, 0.6)' }}>
                                                        <div className="text-[12px] font-extrabold tracking-[0.04em] mb-2" style={{ color: 'rgba(22, 20, 21, 0.55)' }}>強度</div>
                                                        <div className="font-light flex items-end gap-1" style={{ color: '#161415' }}>
                                                            <span className="text-[11px] font-bold mb-1">RPE</span>
                                                            <span style={{ fontSize: 22, letterSpacing: '-0.02em', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{bandText(mainSet?.band)}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* 課程計劃 (Workout Structure) */}
                                                <div className="mb-8">
                                                    <div className="flex items-center gap-3 mb-4">
                                                        <span className="text-[12px] font-extrabold tracking-[0.04em]" style={{ color: 'rgba(22,20,21,0.50)' }}>課程計劃</span>
                                                        <div className="flex-1 h-px" style={{ background: '#EFEBE3', opacity: 0.7 }} />
                                                    </div>
                                                    <div className="rounded-[28px] p-2" style={{ background: 'rgba(255,255,255,0.5)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 12px 24px -6px rgba(22,20,21,0.05), inset 0 2px 6px rgba(255,255,255,0.8)' }}>
                                                        {courseSteps.map((step, i) => (
                                                            <div key={i} className="flex items-center gap-4 p-4 border-b last:border-0 border-black/5 relative">
                                                                <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-[13px] shrink-0" style={{ background: selectedTheme.color + '35', color: '#161415', boxShadow: `inset 0 1px 2px rgba(255,255,255,0.5)` }}>
                                                                    {i + 1}
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="text-[15px] font-bold text-[#161415] mb-1 truncate">{step.name}</div>
                                                                    {step.targetPace > 0 ? (
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="px-2 py-[3px] rounded-md text-[12px] font-black tracking-widest bg-black/5 text-black/60">建議配速</span>
                                                                            <span className="text-[12px] font-black" style={{ color: selectedTheme.color }}>{formatPace(step.targetPace)} <span className="text-[11px] text-black/40">/km</span></span>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="text-[12px] font-bold text-black/50">
                                                                            {step.rpeBand && <span className="font-black" style={{ color: '#161415' }}>RPE {bandText(step.rpeBand)}</span>}
                                                                            {step.rpeBand && step.cue ? ' · ' : ''}{step.cue || '依體感調整'}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="text-right shrink-0">
                                                                    <div className="text-[20px] font-light leading-none" style={{ color: '#161415' }}>{Math.floor(step.duration / 60)}</div>
                                                                    <div className="text-[11px] font-black text-black/40 mt-1">分鐘</div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* 教練提示 (Coach Hint) */}
                                                <div className="rounded-[28px] p-6 relative overflow-hidden" style={{ background: 'rgba(22, 20, 21, 0.75)', backdropFilter: 'blur(40px) saturate(180%)', WebkitBackdropFilter: 'blur(40px) saturate(180%)', borderTop: '1px solid rgba(207, 198, 184, 0.25)', borderBottom: '1px solid rgba(0, 0, 0, 0.4)', boxShadow: '0 12px 32px rgba(22, 20, 21, 0.3), inset 0 2px 4px rgba(246, 244, 241, 0.05)', color: '#F6F4F1' }}>
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.1)' }}>
                                                            <Info size={12} color="#FFFFFF" opacity={0.8} />
                                                        </div>
                                                        <span className="text-[12px] font-extrabold tracking-[0.04em] text-white/50">教練提示</span>
                                                    </div>
                                                    <div className="text-[13px] leading-relaxed text-white/80">
                                                        {selectedTheme.desc}
                                                    </div>

                                                    {/* 🔁 上次同款快速訓練的表現（Plan Echo） */}
                                                    <QuickThemeEcho subtype={selectedTheme.type} color={selectedTheme.color} />
                                                </div>
                                            </div>

                                            {/* 底部固定開始按鈕 CTA */}
                                            <div className="absolute bottom-0 left-0 right-0 p-6 pb-10 z-20" style={{ background: 'linear-gradient(to top, rgba(233,227,216,1) 0%, rgba(233,227,216,0.9) 50%, transparent 100%)' }}>
                                                <motion.button
                                                    whileTap={{ scale: 0.97 }}
                                                    onClick={() => {
                                                        const finalPlan = {
                                                            ...selectedTheme,
                                                            duration: selectedDifficulty.duration,
                                                            difficulty: selectedDifficulty.level,
                                                            steps: courseSteps
                                                        };
                                                        setActivePlan(finalPlan);
                                                        setSelectedTheme(null);
                                                        setShowTrainingPlans(false);
                                                        triggerNativeHaptic('heavy');
                                                        setIsTracking(true);
                                                        setIsPaused(false);
                                                        setIsRecording(true);
                                                        setStartTime(new Date());
                                                    }}
                                                    className="w-full h-[58px] rounded-full flex items-center justify-center gap-3 relative overflow-hidden"
                                                    style={{
                                                        background: 'linear-gradient(135deg, #2A2724 0%, #161415 60%, #262523 100%)',
                                                        color: '#F6F4F1',
                                                        border: '1px solid rgba(255,255,255,0.12)',
                                                        boxShadow: '0 12px 30px rgba(0,0,0,0.32), inset 0 1px 1px rgba(255,255,255,0.16), inset 0 -3px 8px rgba(0,0,0,0.5)',
                                                        letterSpacing: '0.22em',
                                                        fontWeight: 800,
                                                        fontSize: 14,
                                                    }}
                                                >
                                                    <span className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.16) 46%, rgba(255,255,255,0.02) 53%, transparent 62%)', mixBlendMode: 'screen' }} />
                                                    <span>開始 {selectedDifficulty.level} 訓練</span>
                                                </motion.button>
                                            </div>
                                        </motion.div>
                                    );
                                })()}
                            </AnimatePresence>

                            {/* 🛠️ 自定義訓練建立器 Modal (Custom Builder) */}
                            <AnimatePresence>
                                {showCustomBuilder && (
                                    <motion.div
                                        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                                        className="fixed inset-0 bg-[#0A0A0A] z-[100005] flex flex-col"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {/* 頂部 Header (Poster Style) */}
                                        <div
                                            className="relative p-8 pb-10 flex flex-col justify-end overflow-hidden"
                                            style={{
                                                backgroundImage: 'url(https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=600&q=80)',
                                                backgroundSize: 'cover',
                                                backgroundPosition: 'center',
                                                height: '240px'
                                            }}
                                        >
                                            <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-black/20 to-transparent" />

                                            <motion.button {...pressProps('pill')} onClick={() => setShowCustomBuilder(false)} className="absolute top-12 right-6 w-10 h-10 rounded-full bg-black/60 flex items-center justify-center text-white/90 z-30 backdrop-blur-xl border border-white/10 shadow-2xl">
                                                <X size={24} />
                                            </motion.button>

                                            <div className="relative z-20">
                                                <span
                                                    className="px-4 py-1 text-[9px] font-black italic tracking-[0.2em] text-white shadow-lg mb-3 inline-block"
                                                    style={{ background: '#000', fontFamily: 'var(--font-body)', transform: 'rotate(-1.5deg)' }}
                                                >
                                                    CREATE YOUR OWN BEAT
                                                </span>
                                                <h2
                                                    className="text-[44px] leading-[0.9] text-white font-black tracking-tighter"
                                                    style={{ fontFamily: 'var(--font-body)' }}
                                                >
                                                    自定義訓練
                                                </h2>
                                            </div>
                                        </div>

                                        <div className="flex-1 overflow-y-auto px-6 py-6 bg-[#0A0A0A]">
                                            {customSteps.map((step, idx) => (
                                                <div key={idx} className="bg-[#161415] rounded-[24px] p-5 mb-4 border border-white/5 relative">
                                                    <motion.button {...pressProps('row')} onClick={() => setCustomSteps(prev => prev.filter((_, i) => i !== idx))} className="absolute top-5 right-5 text-red-400 opacity-60 hover:opacity-100"><Trash2 size={16} /></motion.button>
                                                    <div className="flex flex-col gap-5">
                                                        <div>
                                                            <p className="text-[9px] text-white/40 uppercase font-black tracking-widest mb-1.5 ml-1">Step Name</p>
                                                            <input
                                                                type="text" value={step.name}
                                                                onChange={e => { const newSteps = [...customSteps]; newSteps[idx].name = e.target.value; setCustomSteps(newSteps); }}
                                                                className="bg-transparent border-b border-white/10 text-white font-bold text-[17px] outline-none w-3/4 pb-1 focus:border-[#F95C4B] transition-colors"
                                                                placeholder="e.g., Warm Up"
                                                            />
                                                        </div>
                                                        <div className="flex gap-4">
                                                            <div className="flex-1">
                                                                <p className="text-[9px] text-white/40 uppercase font-black tracking-widest mb-1.5 ml-1">Time (Min)</p>
                                                                <input type="number" value={step.durationMins} onChange={e => { const newSteps = [...customSteps]; newSteps[idx].durationMins = Number(e.target.value); setCustomSteps(newSteps); }} className="w-full bg-[#0A0A0A] rounded-[18px] px-4 py-3 text-white outline-none border border-white/5 focus:border-[#F95C4B]" />
                                                            </div>
                                                            <div className="flex-1 relative">
                                                                <p className="text-[9px] text-white/40 uppercase font-black tracking-widest mb-1.5 ml-1">Pace (Sec/km)</p>
                                                                <input type="number" value={step.targetPaceSecs} onChange={e => { const newSteps = [...customSteps]; newSteps[idx].targetPaceSecs = Number(e.target.value); setCustomSteps(newSteps); }} className="w-full bg-[#0A0A0A] rounded-[18px] px-4 py-3 text-[#F95C4B] outline-none border border-white/5 focus:border-[#F95C4B]" />
                                                                <p className="text-[11px] font-black text-white/30 mt-1.5 ml-1">{formatPace(step.targetPaceSecs)} /km</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                            <motion.button {...pressProps('pill')}
 onClick={() => { triggerNativeHaptic('light'); setCustomSteps(prev => [...prev, { name: '新階段', durationMins: 5, targetPaceSecs: 360 }]); }}
 className="w-full py-4 border-2 border-dashed border-white/10 rounded-[24px] text-white/50 font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 mb-8 hover:bg-white/5 "
 >
                                                <Plus size={16} /> 新增階段
                                            </motion.button>
                                        </div>

                                        <div className="p-6 border-t border-white/5 bg-[#161415]">
                                            <motion.button {...pressProps('pill')}
 onClick={() => {
 const finalCustomPlan = {
 id: 'custom_run', title: '自定義訓練', type: 'custom',
 bg: 'linear-gradient(160deg, #262523 0%, #3A3A3C 100%)',
 steps: customSteps.map(s => ({ name: s.name, duration: s.durationMins * 60, targetPace: s.targetPaceSecs }))
 };
 setActivePlan(finalCustomPlan);
 setShowCustomBuilder(false);
 setShowTrainingPlans(false);
 triggerNativeHaptic('heavy');
 setIsTracking(true);
 setIsPaused(false);
 setIsRecording(true);
 setStartTime(new Date());
 }}
 className="w-full py-4 rounded-full bg-white text-[#161415] text-[15px] font-black uppercase tracking-widest shadow-[0_4px_20px_rgba(255,255,255,0.2)]"
 >
                                                開始專屬訓練
                                            </motion.button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </PortalSheet>
                    )}
                </AnimatePresence>

            </div>

            {/* 🆕 跑步機模式：手機擺放位置提示彈窗（一次性） */}
            {showTreadmillHint && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-6">
                    <div className="w-full max-w-sm rounded-3xl bg-[#1A1A1C] border border-white/10 p-6 text-white">
                        <div className="text-2xl mb-3">🏃‍♂️ 室內跑步機模式</div>
                        <p className="text-sm text-white/80 leading-relaxed mb-2">
                            跑步機上沒有 GPS，DRVN 會改用 <b>加速度計</b> 推算里程。
                        </p>
                        <p className="text-sm text-white/80 leading-relaxed mb-4">
                            為了讓里程準確，請：
                        </p>
                        <ul className="text-sm text-white/90 space-y-2 mb-6 list-disc pl-5">
                            <li>把手機 <b>握在手中</b>、<b>放入褲子口袋</b>，或使用 <b>運動臂套</b></li>
                            <li>不要把手機放在跑步機儀表板上 — 那會偵測不到震動，里程會卡在 0</li>
                        </ul>
                        <div className="flex gap-2">
                            <motion.button {...pressProps('pill')}
 onClick={() => setShowTreadmillHint(false)}
 className="flex-1 py-3 rounded-[18px] bg-white/10 text-white text-sm font-bold "
 >
                                取消
                            </motion.button>
                            <motion.button {...pressProps('pill')}
 onClick={confirmStartFromTreadmillHint}
 className="flex-1 py-3 rounded-[18px] bg-white text-black text-sm font-bold "
 >
                                我知道了，開始跑
                            </motion.button>
                        </div>
                    </div>
                </div>
            )}

            {/* ⛔ 60 秒 HRR 收集中徽章 — 已依使用者要求移除（恢復數據在背景靜默累積） */}

            {/* 🎵 Music player — always show when music is playing on cardio page */}
            <GlobalFloatingMusicPlayer />

            {/* 🩹 2026-08 稽核：極短跑步的二次確認。
                以前 handleFinish() 沒有任何距離/時長下限 —— 跑 10 公尺長按結束，
                一樣進結算、一樣呼叫 complete-brick 標成完成、首頁一樣打勾。
                這裡不阻擋（誤觸開始、臨時取消都是真實情境），只讓使用者知道
                「這樣不會算完成」，並給一個「不要記錄」的乾淨出口。 */}
            {createPortal(
                <AnimatePresence>
                    {shortFinishAsk && (
                        <motion.div
                            key="short-finish-ask"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            style={{
                                position: 'fixed', inset: 0, zIndex: 100400,
                                background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(10px)',
                                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                            }}
                            onClick={() => setShortFinishAsk(null)}
                        >
                            <motion.div
                                onClick={(e) => e.stopPropagation()}
                                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                                transition={{ type: 'spring', damping: 34, stiffness: 320 }}
                                style={{
                                    width: '100%', maxWidth: 430,
                                    padding: '26px 24px max(24px, env(safe-area-inset-bottom))',
                                    borderRadius: '28px 28px 0 0', background: '#F6F4F1',
                                }}
                            >
                                <p style={{
                                    margin: 0, fontSize: 9, fontWeight: 900, letterSpacing: '0.26em',
                                    textTransform: 'uppercase', color: '#F95C4B',
                                }}>
                                    Too short to count
                                </p>
                                <h3 style={{
                                    margin: '10px 0 0', fontSize: 24, fontWeight: 500, lineHeight: 1.2,
                                    letterSpacing: '-0.02em', color: '#161415',
                                }}>
                                    這趟太短了
                                </h3>
                                <p style={{ margin: '10px 0 0', fontSize: 13.5, lineHeight: 1.65, color: 'rgba(22,20,21,0.58)' }}>
                                    目前只有 {shortFinishAsk.km.toFixed(2)} 公里、{Math.round(shortFinishAsk.sec)} 秒。
                                    現在結束會記成「部分完成」，不計入今天的達標與連續天數。
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 22 }}>
                                    <motion.button {...pressProps('row')}
 type="button"
 onClick={() => setShortFinishAsk(null)}
 style={{
 width: '100%', height: 52, borderRadius: 16, border: 'none', cursor: 'pointer',
 background: '#F95C4B', color: '#fff', fontSize: 15, fontWeight: 700,
 }}
 >
                                        繼續跑
                                    </motion.button>
                                    <motion.button {...pressProps('row')}
 type="button"
 onClick={() => { const go = shortFinishAsk.proceed; setShortFinishAsk(null); go?.(); }}
 style={{
 width: '100%', height: 50, borderRadius: 16, cursor: 'pointer',
 border: '1px solid rgba(22,20,21,0.16)', background: 'transparent',
 color: '#161415', fontSize: 14, fontWeight: 700,
 }}
 >
                                        仍要結束並記錄
                                    </motion.button>
                                    <motion.button {...pressProps('row')}
 type="button"
 onClick={() => { setShortFinishAsk(null); onBack?.(); }}
 style={{
 width: '100%', height: 44, borderRadius: 16, cursor: 'pointer',
 border: 'none', background: 'transparent',
 color: 'rgba(22,20,21,0.45)', fontSize: 13, fontWeight: 600,
 }}
 >
                                        不要記錄，直接離開
                                    </motion.button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* 🧱 Global Brick Preview Bottom-Sheet
                   — 提升到 root，這樣 NextBrickCard / CoverFlow 都能觸發
                   - 跑步 brick：BrickDetail 顯示 Session Blueprint
                   - Strength brick：顯示推薦肌力動作 → APPLY & START 跳 WorkoutSession */}
            {createPortal(
                <div style={{ position: 'relative', zIndex: 100200 }}>
                    <AnimatePresence>
                        {coverFlowPreviewBrick && (
                            <>
                                <motion.div
                                    key="preview-backdrop"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.22 }}
                                    onClick={() => setCoverFlowPreviewBrick(null)}
                                    className="fixed inset-0"
                                    style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
                                />
                                <motion.div
                                    key="preview-sheet"
                                    initial={{ y: '100%' }}
                                    animate={{ y: 0 }}
                                    exit={{ y: '100%' }}
                                    transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                                    drag="y"
                                    dragConstraints={{ top: 0, bottom: 0 }}
                                    dragElastic={{ top: 0, bottom: 0.25 }}
                                    onDragEnd={(_, info) => { if (info.offset.y > 120) setCoverFlowPreviewBrick(null); }}
                                    className="fixed left-0 right-0 bottom-0 flex flex-col"
                                    style={{
                                        background: 'linear-gradient(180deg, #FFFFFF 0%, #F6F4F1 100%)',
                                        borderTopLeftRadius: 28,
                                        borderTopRightRadius: 28,
                                        boxShadow: '0 -18px 50px rgba(22,20,21,0.30)',
                                        paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 12px)',
                                        maxHeight: '88dvh',
                                    }}
                                >
                                    <div className="flex justify-center pt-2.5 pb-1 shrink-0">
                                        <div className="w-10 h-[5px] rounded-full" style={{ background: 'rgba(22,20,21,0.22)' }} />
                                    </div>
                                    <div
                                        className="flex-1 overflow-y-auto"
                                        onPointerDownCapture={e => e.stopPropagation()}
                                        onTouchStartCapture={e => e.stopPropagation()}
                                    >
                                        <CardioBrickDetailSheet
                                            brick={coverFlowPreviewBrick}
                                            embedded
                                            onClose={() => setCoverFlowPreviewBrick(null)}
                                            onStartSuccess={() => {
                                                const brick = coverFlowPreviewBrick;
                                                // 先載入訓練計劃 (activePlan)
                                                const built = planFromBrick(brick);
                                                if (built) setActivePlan(built);
                                                // 關閉這層過渡层
                                                setCoverFlowPreviewBrick(null);
                                                setShowTrainingPlans(false);
                                                // 觸發倒數！
                                                setCountdownActive(true);
                                            }}
                                        />
                                    </div>
                                </motion.div>
                            </>
                        )}
                    </AnimatePresence>
                </div>,
                document.body
            )}

            {countdownActive && (
                <CountdownOverlay onComplete={() => {
                    setCountdownActive(false);
                    if (!isTracking) {
                        setTargetScore(baseline || 80);
                        setTargetType('steady');
                        triggerNativeHaptic('heavy');
                        setIsTracking(true);
                        setIsPaused(false);
                        setIsRecording(true);
                        setStartTime(new Date());
                    }
                }} />
            )}
        </>
    );
};

const CountdownOverlay = ({ onComplete }) => {
    const [count, setCount] = useState(3);

    useEffect(() => {
        if (count > 0) {
            const timer = setTimeout(() => setCount(c => c - 1), 1000);
            return () => clearTimeout(timer);
        } else {
            onComplete();
        }
    }, [count, onComplete]);

    if (count === 0) return null;

    return (
        <div className="fixed inset-0 z-[100300] flex flex-col items-center justify-center pointer-events-none"
            style={{ background: 'rgba(14,12,11,0.78)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
            <AnimatePresence>
                <motion.div
                    key="countdown-wrapper"
                    className="flex flex-col items-center justify-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                >
                    <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-3 mb-14"
                    >
                        <span style={{ width: 28, height: 1, background: 'rgba(255,255,255,0.3)' }} />
                        <span className="text-[9px] font-bold tracking-[0.5em] uppercase" style={{ color: 'rgba(255,255,255,0.55)', fontFamily: '"Geist Mono","JetBrains Mono",monospace' }}>
                            Get Ready
                        </span>
                        <span style={{ width: 28, height: 1, background: 'rgba(255,255,255,0.3)' }} />
                    </motion.div>

                    <div className="relative flex items-center justify-center" style={{ width: 220, height: 220 }}>
                        <svg width="220" height="220" viewBox="0 0 220 220" style={{ position: 'absolute', transform: 'rotate(-90deg)' }}>
                            <circle cx="110" cy="110" r="100" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1.5" />
                            <motion.circle
                                key={count}
                                cx="110" cy="110" r="100" fill="none"
                                stroke={C.coral} strokeWidth="2.5" strokeLinecap="round"
                                pathLength={1}
                                initial={{ pathLength: 1 }}
                                animate={{ pathLength: 0 }}
                                transition={{ duration: 1, ease: 'linear' }}
                            />
                        </svg>
                        <svg width="220" height="220" viewBox="0 0 220 220" style={{ position: 'absolute' }}>
                            {Array.from({ length: 60 }).map((_, i) => {
                                const ang = (i / 60) * Math.PI * 2;
                                const isMajor = i % 5 === 0;
                                const r1 = 100, r2 = isMajor ? 90 : 95;
                                return (
                                    <line key={i}
                                        x1={110 + r1 * Math.cos(ang)} y1={110 + r1 * Math.sin(ang)}
                                        x2={110 + r2 * Math.cos(ang)} y2={110 + r2 * Math.sin(ang)}
                                        stroke="rgba(255,255,255,0.18)" strokeWidth={isMajor ? 1.4 : 0.7}
                                    />
                                );
                            })}
                        </svg>
                        <motion.div
                            key={count}
                            initial={{ scale: 0.86, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 1.1, opacity: 0 }}
                            transition={{ type: 'spring', damping: 18, stiffness: 260 }}
                            className="tabular-nums"
                            style={{
                                fontFamily: 'var(--font-body)',
                                fontWeight: 200,
                                fontSize: 110,
                                color: C.white,
                                letterSpacing: '-0.04em',
                                lineHeight: 1,
                            }}
                        >
                            {count}
                        </motion.div>
                    </div>
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

export default CardioTrackerMobile;

// ════════════════════════════════════════════════════════════════════
// TopAdviceCarousel — 工具列下方的橫向可滑卡片區
//   - 多張 LiquidGlass 卡片並排，scroll-snap 對齊
//   - 卡片內容：StatusCard (天氣) + NextBrickCard (下一個 brick)
//   - 自動同步底部 dot 指示器
//   - iOS / 觸控板水平滑動皆順
// ════════════════════════════════════════════════════════════════════

const TopAdviceCarousel = ({ weather, bricks, onPreview, todayDone = null, planAction = null, onNavigate }) => {
    // 🎠 重寫：改用 framer-motion 拖曳 + transform 位移，取代 native scroll-snap。
    //    這樣才有：① dot 一定會跟著動 ② 一次可連滑多張 ③ 真正的阻尼/慣性感。
    const containerRef = React.useRef(null);
    const [activeIdx, setActiveIdx] = React.useState(0);
    const [pageW, setPageW] = React.useState(0);           // 單頁寬度（含 gap）
    const pausedUntilRef = React.useRef(0);

    const nextBrick = React.useMemo(() => {
        if (!Array.isArray(bricks) || bricks.length === 0) return null;
        return bricks.find((b) => b.status !== 'completed' && b.status !== 'skipped') || null;
    }, [bricks]);

    /* 卡片清單（計劃 → 進步 → 天氣）。
       ⚠️ 進步卡只在「本週真的完成過、但還沒練滿」時出現 ——
          零資料時它以前會講「踏出第一步就是進步」，那是一張假提示（介面標準 §8：新使用者提示數 = 0）；
          練滿時計劃卡已經在慶祝，再講一次就重複了。 */
    const progressShown = React.useMemo(() => {
        const list = Array.isArray(bricks) ? bricks : [];
        const done = list.filter((b) => b.status === 'completed').length;
        return done > 0 && done < list.length;
    }, [bricks]);
    const cards = React.useMemo(() => ([
        { key: 'plan', render: () => (
            <PlanCard
                bricks={bricks}
                todayDone={todayDone}
                planAction={planAction}
                onClick={planAction
                    ? () => onNavigate && onNavigate(planAction.to)
                    : (nextBrick && onPreview ? () => onPreview(nextBrick) : undefined)}
            />
        ) },
        progressShown && { key: 'progress', render: () => <ProgressCard bricks={bricks} /> },
        { key: 'status', render: () => <StatusCard weather={weather} /> },
    ].filter(Boolean)), [weather, bricks, nextBrick, onPreview, todayDone, planAction, onNavigate, progressShown]);

    const GAP = 12;

    // 量測單頁寬度（視窗變動時重算）
    /* ⚠️ 要用 offsetWidth，不能用 getBoundingClientRect：
       這條輪播放在一個正在做進場縮放（scale 0.9 → 1）的容器裡，
       getBoundingClientRect 量到的是「縮小中」的寬度 —— 每頁少算 10%，
       卡片就歪一截：左邊露出上一張的尾巴、右邊被切掉。
       offsetWidth 是版面寬度，不受 transform 影響；再用 ResizeObserver 跟著容器變。 */
    React.useEffect(() => {
        const el = containerRef.current;
        if (!el) return undefined;
        const measure = () => setPageW(el.offsetWidth + GAP);
        measure();
        let ro = null;
        if (typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(measure);
            ro.observe(el);
        } else {
            window.addEventListener('resize', measure);
        }
        return () => { if (ro) ro.disconnect(); else window.removeEventListener('resize', measure); };
    }, []);

    const clampIdx = React.useCallback((i) => Math.max(0, Math.min(cards.length - 1, i)), [cards.length]);
    // 卡片數變少（例如進步卡消失）時，不要停在一張不存在的卡上
    React.useEffect(() => { setActiveIdx((i) => Math.min(i, Math.max(0, cards.length - 1))); }, [cards.length]);

    const goTo = React.useCallback((i, manual = false) => {
        setActiveIdx(clampIdx(i));
        if (manual) pausedUntilRef.current = Date.now() + 6000;
    }, [clampIdx]);

    // 自動循環：每 5 秒切下一張（手動互動後 6 秒內暫停）
    React.useEffect(() => {
        if (cards.length <= 1) return undefined;
        const timer = setInterval(() => {
            if (Date.now() < pausedUntilRef.current) return;
            setActiveIdx((prev) => (prev + 1) % cards.length);
        }, 5000);
        return () => clearInterval(timer);
    }, [cards.length]);

    // 拖曳結束：依「拖曳距離 + 甩動速度」決定要跳幾張（可連跳多張），帶阻尼
    const handleDragEnd = React.useCallback((_e, info) => {
        pausedUntilRef.current = Date.now() + 6000;
        if (!pageW) return;
        const { offset, velocity } = info;
        // 用位移為主、速度為輔，換算成「移動了幾頁」
        const move = offset.x + velocity.x * 0.22;
        const steps = Math.round(-move / pageW);
        if (steps !== 0) goTo(activeIdx + steps);
        else setActiveIdx((i) => i); // 觸發 re-render 回彈到原位
    }, [pageW, activeIdx, goTo]);

    if (cards.length === 0) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28, delay: 0.06 }}
            className="w-[88vw] max-w-[420px] flex flex-col items-center gap-2"
        >
            {/* viewport：隱藏溢出，內層 track 用 transform 位移 */}
            <div ref={containerRef} className="w-full overflow-hidden">
                <motion.div
                    className="flex"
                    style={{ gap: GAP }}
                    drag="x"
                    dragElastic={0.16}                 /* 邊緣阻尼回彈 */
                    dragMomentum={false}
                    dragConstraints={{ left: -(cards.length - 1) * pageW, right: 0 }}
                    onDragStart={() => { pausedUntilRef.current = Date.now() + 6000; }}
                    onDragEnd={handleDragEnd}
                    animate={{ x: -activeIdx * pageW }}
                    transition={{ type: 'spring', stiffness: 300, damping: 34, mass: 0.9 }} /* 阻尼感 */
                >
                    {cards.map((c) => (
                        <div key={c.key} className="shrink-0" style={{ width: '100%' }}>
                            {c.render()}
                        </div>
                    ))}
                </motion.div>
            </div>

            {/* 指示點已移除（依回饋，地圖上不放輪播點）。輪播仍可自動循環與手動拖曳。 */}
        </motion.div>
    );
};

// ────────────────────────────────────────────────────────────────────
// 共用：Liquid Glass 卡面基底
// ────────────────────────────────────────────────────────────────────

const GLASS_CARD_STYLE = {
    background: 'rgba(255, 255, 255, 0.75)',
    backdropFilter: 'blur(36px) saturate(180%)',
    WebkitBackdropFilter: 'blur(36px) saturate(180%)',
    borderTop: '1.5px solid rgba(255, 255, 255, 1)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.25)',
    borderLeft: '1px solid rgba(255, 255, 255, 0.7)',
    borderRight: '1px solid rgba(255, 255, 255, 0.25)',
    boxShadow: '0 10px 28px -6px rgba(0,0,0,0.14), 0 2px 6px -2px rgba(0,0,0,0.06), inset 0 2px 4px rgba(255,255,255,0.85)',
    borderRadius: 18,
};

// ════════════════════════════════════════════════════════════════════
// StatusCard — 時段感知的天氣 / 紫外線 / 提醒卡
//   - 早晨 5-10：朝跑黃金時段
//   - 中午 10-15 + UV≥7：高紫外線 注意防曬
//   - 黃昏 16-19：黃昏微風 速度日好時機
//   - 入夜 19+ / 凌晨 <5：太陽下山了 夜跑帶燈
//   - 雨天：建議室內
// ════════════════════════════════════════════════════════════════════

const StatusCard = ({ weather }) => {
    /* 🛌 今天的準備度 —— 出門前最該知道的一件事。
       併入睡眠與 HRV（有的話）；沒有那些訊號就退回「重訓與跑步後的身體恢復度」。
       一個訊號都沒有（還沒練過、也沒有健康資料）→ 不顯示，不編一個數字。 */
    const ready = React.useMemo(() => {
        try {
            return getTodayReadiness(getUserId());
        } catch { return null; }
    }, []);

    const status = React.useMemo(() => {
        const now = new Date();
        const hr = now.getHours();
        const temp = weather?.temperature;
        const uv = weather?.uv_index ?? 0;
        const rain = weather?.rain ?? 0;
        const tempStr = temp != null ? `${temp}°` : '';

        if (rain > 0) {
            return {
                Icon: CloudRain, color: '#4A90E2', title: 'RAIN · INDOOR',
                text: `下雨中 · ${tempStr} · 建議室內 / 跑步機`
            };
        }
        if (uv >= 7 && hr >= 10 && hr <= 15) {
            return {
                // 警示用 Ember（深珊瑚），與 QUICK START 的亮 Coral 焦點區隔，仍保留「注意」語意
                Icon: Sun, color: '#D94030', title: 'HIGH UV · CAUTION',
                text: `${tempStr} · 高紫外線 · 注意防曬`
            };
        }
        if (hr >= 19 || hr < 5) {
            return {
                Icon: Sparkles, color: '#A5C4FF', title: '夜跑',
                text: `太陽下山了 · 夜跑帶燈${tempStr ? ` · ${tempStr}` : ''}`
            };
        }
        if (hr >= 16 && hr < 19) {
            return {
                Icon: Sun, color: '#FFB266', title: 'GOLDEN HOUR',
                text: `黃昏微風${tempStr ? ` · ${tempStr}` : ''} · 速度日好時機`
            };
        }
        if (hr >= 5 && hr < 10) {
            return {
                Icon: Sun, color: '#7BD3A5', title: 'MORNING WINDOW',
                text: `朝跑黃金時段${tempStr ? ` · ${tempStr}` : ''} · 出發！`
            };
        }
        return {
            // 預設「完美戶外天氣」用暖金 Soft-gold，而非 Coral——把整頁唯一 Coral 焦點讓給 QUICK START
            Icon: Sun, color: '#C9A24B', title: 'TODAY · STATUS',
            text: temp != null
                ? `${tempStr} · ${uv >= 6 ? '紫外線偏高 · 注意防曬' : '完美戶外天氣'}`
                : '完美戶外天氣'
        };
    }, [weather]);

    if (!weather && !status.text && !ready) return null;
    const { Icon, color, text } = status;

    return (
        <div className="relative overflow-hidden p-4" style={GLASS_CARD_STYLE}>
            {/* 反射高光 */}
            <span
                className="absolute -top-10 -left-6 w-32 h-32 pointer-events-none rounded-full"
                style={{
                    background: 'radial-gradient(circle, rgba(255,255,255,0.55) 0%, transparent 60%)',
                    filter: 'blur(6px)',
                }}
            />
            <div className="relative z-10 flex items-center gap-3">
                <div
                    className="w-11 h-11 rounded-[18px] flex items-center justify-center shrink-0"
                    style={{
                        background: `${color}22`,
                        border: `1px solid ${color}44`,
                        boxShadow: `inset 0 1px 1px rgba(255,255,255,0.9), 0 4px 10px ${color}33`,
                    }}
                >
                    <Icon size={18} strokeWidth={2.2} style={{ color }} />
                </div>
                {/* 提示卡 = 1 行大字 ＋ ≤1 行小字，沒有小標（介面標準 §2）。
                    以前上面還有一行 9px 的英文小標（GOLDEN HOUR / TODAY · STATUS），
                    跟大字講同一件事，而且字級低於 11px。 */}
                <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-bold leading-snug truncate" style={{ color: C.ink }}>
                        {text}
                    </div>
                    {/* 準備度：一行，講數字也講它從哪來 —— 一個合成數字不講來源，跟沒講一樣 */}
                    {ready && (
                        <div className="text-[12px] font-semibold mt-1 truncate" style={{ color: 'rgba(22,20,21,0.45)' }}>
                            準備度 {ready.score} · {readinessLabel(ready.score)} · {readinessSourceLine(ready.from)}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ════════════════════════════════════════════════════════════════════
// AdviceCardShell — 與 StatusCard 完全一致的版面外殼（icon chip + 標題 + 內文）
//   讓輪播三張卡（計劃 / 天氣 / 進步提示）視覺語言統一。
// ════════════════════════════════════════════════════════════════════
const AdviceCardShell = ({
    Icon, color, text, sub = null, onClick,
    celebrate = false, progressFrom = null, progressTo = null, progressTotal = null,
}) => (
    <motion.div
        {...(onClick ? pressProps('card') : {})}
        className="relative overflow-hidden p-4"
        style={{
            ...GLASS_CARD_STYLE,
            cursor: onClick ? 'pointer' : 'default',
            // 🎉 慶祝態：底色轉 Coral 淡層 + 左側細線發光
            ...(celebrate ? {
                background: 'linear-gradient(135deg, rgba(249,92,75,0.14) 0%, rgba(249,92,75,0.05) 100%)',
                border: '1px solid rgba(249,92,75,0.28)',
                boxShadow: '0 8px 24px -12px rgba(249,92,75,0.45), inset 0 1px 1px rgba(255,255,255,0.8)',
            } : {}),
        }}
        onClick={onClick}
    >
        <span
            className="absolute -top-10 -left-6 w-32 h-32 pointer-events-none rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.55) 0%, transparent 60%)', filter: 'blur(6px)' }}
        />
        {/* 慶祝態：左側細線發光 + 一次掃過的高光 */}
        {celebrate && (
            <>
                <motion.span
                    aria-hidden
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute left-0 top-0 bottom-0 pointer-events-none"
                    style={{ width: 3, background: C.coral, transformOrigin: 'top', boxShadow: `0 0 12px ${C.coral}` }}
                />
                <motion.span
                    aria-hidden
                    initial={{ x: '-120%' }}
                    animate={{ x: '160%' }}
                    transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
                    className="absolute top-0 bottom-0 pointer-events-none"
                    style={{ width: '45%', background: 'linear-gradient(100deg, transparent, rgba(255,255,255,0.55), transparent)' }}
                />
            </>
        )}
        <div className="relative z-10 flex items-center gap-3">
            <div
                className="w-11 h-11 rounded-[18px] flex items-center justify-center shrink-0"
                style={{ background: `${color}22`, border: `1px solid ${color}44`, boxShadow: `inset 0 1px 1px rgba(255,255,255,0.9), 0 4px 10px ${color}33` }}
            >
                <Icon size={18} strokeWidth={2.2} style={{ color }} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="text-[14px] font-bold leading-snug truncate" style={{ color: C.ink }}>
                    {text}
                </div>
                {sub && progressTo == null && (
                    <div className="text-[12px] font-semibold mt-1 truncate" style={{ color: 'rgba(22,20,21,0.45)' }}>
                        {sub}
                    </div>
                )}
                {/* 進度數字滾動（0/4 → 1/4） */}
                {progressTo != null && progressTotal > 0 && (
                    <div className="text-[12px] font-black tabular-nums mt-1" style={{ color: C.coral }}>
                        <motion.span
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.5, type: 'spring', stiffness: 140, damping: 18 }}
                            style={{ display: 'inline-block' }}
                        >
                            {progressTo}/{progressTotal}
                        </motion.span>
                        <span className="opacity-45 ml-1.5 font-bold">本週進度</span>
                    </div>
                )}
            </div>
        </div>
    </motion.div>
);

// ════════════════════════════════════════════════════════════════════
// PlanCard — 本週計劃摘要（輪播第一張）
//   - 顯示本週已完成 / 總 brick 數 + 下一個訓練
// ════════════════════════════════════════════════════════════════════
const PlanCard = ({ bricks, onClick, todayDone = null, planAction = null }) => {
    const list = Array.isArray(bricks) ? bricks : [];
    const total = list.length;
    const done = list.filter((b) => b.status === 'completed').length;
    const next = list.find((b) => b.status !== 'completed' && b.status !== 'skipped') || null;
    const nextName = next?.title || next?.name || next?.workout_type || '訓練';

    // ══════════════════════════════════════════════════════════════════════
    // 🎉 慶祝態（使用者要求：「圖四這邊上方輪播條也要有」）
    //
    //   • 當日完成 → 8 秒慶祝態：底色轉 Coral 淡層、進度數字滾動、
    //     文案改成「今日已達標 · 3.6 公里 / 24:10」
    //   • 本週全滿 (n/n) → 常駐慶祝態，不回復（那是整週的成果，值得一直看到）
    // ══════════════════════════════════════════════════════════════════════
    const allDone = total > 0 && done >= total;
    const [celebrating, setCelebrating] = useState(false);
    useEffect(() => {
        if (!todayDone) return;
        setCelebrating(true);
        const t = setTimeout(() => setCelebrating(false), 8000);   // 8 秒後回復
        return () => clearTimeout(t);
    }, [todayDone?.sessionId, todayDone?.at]);

    const fmtClock = (s) => {
        const m = Math.floor((s || 0) / 60), sec = Math.round((s || 0) % 60);
        return `${m}:${String(sec).padStart(2, '0')}`;
    };

    if (allDone) {
        return (
            <AdviceCardShell
                Icon={Calendar}
                color={C.coral}
                text={`本週 ${total} 趟全部完成`}
                sub="這週你沒有缺席"
                onClick={onClick}
                celebrate
            />
        );
    }

    if (celebrating && todayDone) {
        const bits = [];
        if (todayDone.distanceKm > 0) bits.push(`${todayDone.distanceKm.toFixed(2)} 公里`);
        if (todayDone.durationSec > 0) bits.push(fmtClock(todayDone.durationSec));
        return (
            <AdviceCardShell
                Icon={Calendar}
                color={C.coral}
                text={`今天達標${bits.length ? ` · ${bits.join(' / ')}` : ''}`}
                onClick={onClick}
                celebrate
                progressFrom={Math.max(0, done - 1)}
                progressTo={done}
                progressTotal={total}
            />
        );
    }

    /* 這週沒有課 → 照 utils/runPlanState 分三種講（沒排過／有計劃但這週沒課／這期跑完）。
       ⚠️ 以前一律寫「本週尚無排定計劃 · 去「計劃」領取課表」——
          排好計劃、只是這週沒課的人，也被告知「沒有計劃」；
          而且點下去什麼都不會發生（沒有下一堂可以預覽）。 */
    if (total === 0 && planAction) {
        return (
            <AdviceCardShell
                Icon={Calendar}
                color="#7BD3A5"
                text={planAction.cta}
                sub={planAction.line1 === '還沒有'
                    ? `還沒有${planAction.line2}`
                    : `${planAction.line1} · ${planAction.line2}`}
                onClick={onClick}
            />
        );
    }

    return (
        <AdviceCardShell
            Icon={Calendar}
            color="#7BD3A5"
            text={`下一趟：${nextName}`}
            sub={`本週 ${done}/${total} 趟`}
            onClick={onClick}
        />
    );
};

// ════════════════════════════════════════════════════════════════════
// ProgressCard — 進步提示（輪播第三張）
//   - 依本週已完成 brick 進度 vs 當天應有進度，產出教練評語
//   - 評語邏輯參考 CardioTrendView 的每週進度診斷
// ════════════════════════════════════════════════════════════════════
const ProgressCard = ({ bricks, onClick }) => {
    /* 🌱 進步提示 = 肯定使用者「這週做到了什麼」。只在本週真的完成過、還沒練滿時出現
       （由 TopAdviceCarousel 守門）—— 零資料不講「踏出第一步就是進步」這種空話。 */
    const list = Array.isArray(bricks) ? bricks : [];
    const total = list.length;
    const doneList = list.filter((b) => b.status === 'completed');
    const done = doneList.length;
    if (done === 0 || done >= total) return null;
    const doneKm = doneList
        .reduce((sum, b) => sum + Number(b.actual_distance_km ?? b.distance_km ?? b.target_distance_km ?? 0), 0);

    const text = doneKm > 0 ? `這週跑了 ${doneKm.toFixed(1)} 公里` : `這週完成 ${done} 趟`;
    const sub = `還差 ${total - done} 趟練滿這週`;
    return <AdviceCardShell Icon={TrendingUp} color="#F95C4B" text={text} sub={sub} onClick={onClick} />;
};

// ════════════════════════════════════════════════════════════════════
// NextBrickCard — 下一個未完成 brick 的卡片（與 StatusCard 對齊版面）
//   - 點 CTA → 呼叫 onPreview 彈 Bottom Sheet (不換頁)
// ════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════
// PostRunRpeModal — 跑完強制 RPE 填寫 (機械鐘錶指針 + 暖石色 Liquid Glass 版)
//   - 全環形 60 格立體金屬刻度 (類似高階手錶錶盤)
//   - 中央實體機械指針，支援觸控拖曳旋轉
//   - 底板採用 Stone (#E4DED2) 結合 Liquid Glass 通透質感
// ════════════════════════════════════════════════════════════════════

const RPE_DESCRIPTORS = {
    1: { band: 'REST', color: '#A5C4FF', tone: '幾乎沒在動', echo: '走路強度' },
    2: { band: 'REST', color: '#A5C4FF', tone: '極度輕鬆', echo: '可以邊走邊講話' },
    3: { band: 'RECOVERY', color: '#7BD3A5', tone: '非常輕鬆', echo: '可以邊跑邊唱歌' },
    4: { band: 'RECOVERY', color: '#7BD3A5', tone: '輕鬆', echo: '完整對話無壓力' },
    5: { band: 'EASY', color: '#D8F382', tone: '舒服的累', echo: '可以說短句' },
    6: { band: 'EASY', color: '#D8F382', tone: '有點吃力', echo: '微喘但能撐' },
    7: { band: 'TEMPO', color: '#FF99DC', tone: '吃力', echo: '對話變破碎' },
    8: { band: 'TEMPO', color: '#FF99DC', tone: '很吃力', echo: '比賽配速' },
    9: { band: 'MILE', color: C.coral, tone: '幾乎極限', echo: '無法說話' },
    10: { band: 'ALL-OUT', color: '#EB4213', tone: '完全極限', echo: '只能撐幾十秒' },
};

const PostRunRpeModal = ({ targetBand, onSubmit }) => {
    const [rpe, setRpe] = React.useState(5);
    const [dragging, setDragging] = React.useState(false);
    const ringRef = React.useRef(null);

    const desc = RPE_DESCRIPTORS[rpe] || RPE_DESCRIPTORS[5];

    // 比對目標 band 給回饋
    const comparison = React.useMemo(() => {
        if (!targetBand) return null;
        const inBand = rpe >= targetBand.min && rpe <= targetBand.max;
        if (inBand) return { tag: 'ON TARGET', tone: '正中目標 · 完美執行', color: '#059669' };
        if (rpe > targetBand.max) {
            const over = rpe - targetBand.max;
            return {
                tag: `+${over} OVER`,
                tone: over >= 2 ? '今天身體承受很大 · 下週系統會降量' : '稍微超標 · 系統會記錄',
                color: C.coralDeep,
            };
        }
        return { tag: 'UNDER', tone: '比預期輕鬆 · 系統會評估升級', color: '#4A90E2' };
    }, [rpe, targetBand]);

    // 圓環座標 → RPE 數值 (指針旋轉邏輯)
    const handlePointer = React.useCallback((e) => {
        const ring = ringRef.current;
        if (!ring) return;
        const rect = ring.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const x = (e.touches?.[0]?.clientX ?? e.clientX) - cx;
        const y = (e.touches?.[0]?.clientY ?? e.clientY) - cy;

        // 計算角度 (-90度為正上方 12點鐘方向)
        let angle = Math.atan2(y, x) * 180 / Math.PI;
        angle = angle + 90;
        if (angle > 180) angle -= 360;

        // 儀表板指針有效範圍：-140度 (RPE 1) 到 +140度 (RPE 10)
        const clampedAngle = Math.max(-140, Math.min(140, angle));
        const progress = (clampedAngle + 140) / 280;

        const value = Math.max(1, Math.min(10, Math.round(progress * 9) + 1));
        setRpe(prev => {
            if (prev !== value) {
                hapticSelectionChanged();
                return value;
            }
            return prev;
        });
    }, []);

    React.useEffect(() => {
        if (!dragging) return;
        const onMove = (e) => { e.preventDefault(); handlePointer(e); };
        const onUp = () => setDragging(false);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('touchend', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend', onUp);
        };
    }, [dragging, handlePointer]);

    // 繪製錶盤參數
    const SIZE = 240;
    const R = 90;
    const CX = SIZE / 2;
    const CY = SIZE / 2;
    const TICKS_COUNT = 60; // 完整的 60 格鐘錶刻度

    // 計算指針旋轉角度
    const rpeProgress = (rpe - 1) / 9;
    const pointerAngle = -140 + (rpeProgress * 280);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100040] flex items-center justify-center p-6"
            style={{
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
            }}
        >
            {/* ── 暖石色 (Stone) Liquid Glass 容器 ── */}
            <motion.div
                initial={{ scale: 0.94, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.94, opacity: 0, y: 10 }}
                transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                className="w-full max-w-xs rounded-[36px] p-8 shadow-[0_24px_64px_rgba(0,0,0,0.4)] relative z-[100050]"
                style={{
                    // Stone 色的透光玻璃
                    background: 'rgba(228, 222, 210, 0.85)',
                    backdropFilter: 'blur(36px) saturate(160%)',
                    WebkitBackdropFilter: 'blur(36px) saturate(160%)',
                    // Liquid Glass 頂部高光邊緣
                    border: '1px solid rgba(255,255,255,0.4)',
                    borderTop: '1px solid rgba(255,255,255,0.9)',
                    borderLeft: '1px solid rgba(255,255,255,0.6)',
                    boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.8), 0 12px 40px rgba(0,0,0,0.2)',
                    maxHeight: '92dvh',
                    overflow: 'hidden'
                }}
            >
                {/* 步驟指示器 */}
                <div className="w-full mb-5 flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase tracking-[0.22em]" style={{ color: 'rgba(22,20,21,0.5)' }}>
                        Step 1 / 2
                    </span>
                    <div className="flex-1 h-[2px] rounded-full overflow-hidden" style={{ background: 'rgba(22,20,21,0.1)' }}>
                        <div className="h-full" style={{ width: '50%', background: C.coral }} />
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-[0.22em]" style={{ color: 'rgba(22,20,21,0.3)' }}>
                        RPE · Save
                    </span>
                </div>

                {/* 標題 */}
                <p className="text-[9px] font-black uppercase tracking-widest mb-2 text-center" style={{ color: 'rgba(22,20,21,0.4)' }}>
                    Final · Brick
                </p>
                <h3 className="text-2xl font-black italic text-center mb-6 leading-tight text-[#161415]">
                    當時你的<br />感覺是？
                </h3>

                {/* 🎛️ 金屬旋鈕 (Brushed-metal Rotary Knob) — 外圈光暈隨 RPE 轉動變色 */}
                <div
                    ref={ringRef}
                    className="relative mx-auto select-none touch-none"
                    style={{ width: SIZE, height: SIZE }}
                    onMouseDown={(e) => { setDragging(true); handlePointer(e); }}
                    onTouchStart={(e) => { setDragging(true); handlePointer(e); }}
                >
                    {(() => {
                        const STROKE = 7;
                        const RING_R = (SIZE / 2) - STROKE - 4;       // 外圈光暈半徑
                        const CIRC = 2 * Math.PI * RING_R;
                        const SWEEP = 0.78;                            // 弧線只走 280°（缺口在底部）
                        const dash = CIRC * SWEEP * rpeProgress;
                        const knobR = RING_R - 16;                     // 金屬旋鈕本體半徑
                        return (
                            <>
                                {/* 外圈光暈 — 隨 RPE 變色、發光 */}
                                <svg width={SIZE} height={SIZE} className="absolute inset-0"
                                    style={{ transform: 'rotate(126deg)' }}>{/* 起點轉到底部缺口左側 */}
                                    <defs>
                                        <filter id="ringGlow" x="-50%" y="-50%" width="200%" height="200%">
                                            <feGaussianBlur stdDeviation="5" result="b" />
                                            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                                        </filter>
                                    </defs>
                                    {/* 軌道 */}
                                    <circle cx={CX} cy={CY} r={RING_R} fill="none"
                                        stroke="rgba(22,20,21,0.10)" strokeWidth={STROKE} strokeLinecap="round"
                                        strokeDasharray={`${CIRC * SWEEP} ${CIRC}`} />
                                    {/* 進度光暈 */}
                                    <circle cx={CX} cy={CY} r={RING_R} fill="none"
                                        stroke={desc.color} strokeWidth={STROKE} strokeLinecap="round"
                                        strokeDasharray={`${dash} ${CIRC}`}
                                        filter="url(#ringGlow)"
                                        style={{ transition: dragging ? 'none' : 'stroke-dasharray 0.28s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.3s ease' }} />
                                </svg>

                                {/* 圖一金屬轉盤設計 (Light Silver Metal Knob) */}
                                <div
                                    className="absolute rounded-full"
                                    style={{
                                        left: CX - knobR, top: CY - knobR, width: knobR * 2, height: knobR * 2,
                                        // 鈦金屬外圈立體邊緣 (Titanium — 帶冷灰偏暖的槍金屬色)
                                        background: 'linear-gradient(145deg, #C7C5C0 0%, #6E6B66 100%)',
                                        boxShadow: `
                                            0 16px 32px -8px rgba(0,0,0,0.42),
                                            0 4px 12px rgba(0,0,0,0.22),
                                            inset 0 1px 2px rgba(255,255,255,0.75),
                                            inset 0 -1px 2px rgba(0,0,0,0.28)`,
                                        transform: `rotate(${pointerAngle}deg)`,
                                        transition: dragging ? 'none' : 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                                        padding: 3,
                                    }}
                                >
                                    {/* 鈦金屬圓錐漸層 (Titanium Conical Gradient) — 偏冷灰、低飽和、霧面拉絲質感 */}
                                    <div className="absolute rounded-full" style={{
                                        inset: 3,
                                        background: `conic-gradient(from 180deg,
                                            #A9A7A2 0%, #E8E6E1 11%, #8C8A85 30%, #5F5D59 50%,
                                            #8C8A85 70%, #E8E6E1 89%, #A9A7A2 100%)`,
                                        boxShadow: 'inset 0 0 14px rgba(0,0,0,0.26), inset 0 2px 3px rgba(255,255,255,0.55)',
                                    }} />
                                    {/* 拉絲金屬細紋疊加 (brushed titanium micro-grain) */}
                                    <div className="absolute rounded-full pointer-events-none" style={{
                                        inset: 3,
                                        background: `repeating-conic-gradient(from 0deg, rgba(255,255,255,0.045) 0deg, rgba(0,0,0,0.045) 1.6deg, rgba(255,255,255,0.045) 3.2deg)`,
                                        mixBlendMode: 'overlay', opacity: 0.6,
                                    }} />
                                    {/* 柔和斜向高光，模擬環境反光 */}
                                    <div className="absolute rounded-full pointer-events-none" style={{
                                        inset: 3,
                                        background: 'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 45%, rgba(0,0,0,0.2) 100%)',
                                    }} />
                                    {/* 指示刻度 — 最外圈一個鈦金屬小刻度 (取代原本的紅色指針) */}
                                    <div className="absolute" style={{
                                        left: '50%', top: 5, width: 4, height: 12,
                                        marginLeft: -2, borderRadius: 2,
                                        background: 'linear-gradient(180deg, #E8E6E1 0%, #8C8A85 100%)',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.35), inset 0 1px 1px rgba(255,255,255,0.6)',
                                    }} />
                                </div>

                                {/* 中央數值（不隨旋鈕轉動）— 置於旋鈕中央 */}
                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                    <div className="font-black leading-none tabular-nums" style={{
                                        fontSize: 44, color: C.ink, letterSpacing: '-0.04em',
                                        textShadow: '0 1px 4px rgba(255,255,255,0.85)',
                                    }}>
                                        {rpe}
                                    </div>
                                    <div className="text-[9px] font-black tracking-[0.25em] uppercase mt-1.5 px-2.5 py-0.5 rounded-full"
                                        style={{ color: C.ink, background: `${desc.color}55`, border: `1px solid ${desc.color}`, backdropFilter: 'blur(2px)' }}>
                                        {desc.band}
                                    </div>
                                </div>
                            </>
                        );
                    })()}
                </div>

                {/* 描述文字 */}
                <div className="mt-6 text-center">
                    <div className="text-[16px] font-black text-[#161415]">
                        {desc.tone}
                    </div>
                    <div className="text-[12px] mt-1 font-bold" style={{ color: 'rgba(22,20,21,0.45)' }}>
                        {desc.echo}
                    </div>
                </div>

                {/* 對比目標 band */}
                {comparison && (
                    <div className="mt-5 rounded-[18px] px-3 py-2.5 flex items-center gap-2"
                        style={{
                            background: `${comparison.color}15`,
                            border: `1px solid ${comparison.color}30`,
                            boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.5)'
                        }}>
                        <span className="text-[9px] font-black tracking-[0.15em] uppercase px-2 py-1 rounded-full shrink-0"
                            style={{ background: comparison.color, color: C.white }}>
                            {comparison.tag}
                        </span>
                        <span className="text-[11px] flex-1 leading-tight font-bold" style={{ color: C.ink }}>
                            {comparison.tone}
                        </span>
                    </div>
                )}

                {/* 提交按鈕 */}
                <div className="mt-6 flex flex-col gap-3">
                    <motion.button {...pressProps('pill')}
 onClick={() => onSubmit(rpe)}
 className="w-full rounded-full py-4 font-black text-[13px] tracking-widest relative overflow-hidden"
 style={{
 background: C.coral,
 color: C.ink,
 boxShadow: `0 8px 24px rgba(249,92,75,0.4), inset 0 2px 3px rgba(255,255,255,0.4)`,
 border: '1px solid rgba(255,255,255,0.2)'
 }}
 >
                        <span className="relative z-10">RECORD RPE {rpe}</span>
                    </motion.button>
                    <div className="text-center text-[12px] font-black tracking-[0.2em]"
                        style={{ color: 'rgba(22,20,21,0.35)' }}>
                        系統會用這個分數判斷下週要不要降量
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};

// ════════════════════════════════════════════════════════════════════
// NextBrickCard
// ════════════════════════════════════════════════════════════════════

const NextBrickCard = ({ brick, onPreview }) => {
    const isStrength = brick.type === 'strength' || brick.subtype === 'strength';
    const accent = isStrength ? C.ink : C.coral;
    const subtitle = (() => {
        const parts = [];
        if (brick.distance_km != null) parts.push(`${brick.distance_km} km`);
        if (brick.duration_min != null) parts.push(`${brick.duration_min} min`);
        return parts.join(' · ');
    })();

    return (
        <motion.button
            whileTap={{ scale: 0.985 }}
            onClick={() => onPreview && onPreview(brick)}
            className="relative w-full overflow-hidden p-4 text-left"
            style={GLASS_CARD_STYLE}
        >
            {/* 反射高光 */}
            <span
                className="absolute -top-10 -left-6 w-32 h-32 pointer-events-none rounded-full"
                style={{
                    background: 'radial-gradient(circle, rgba(255,255,255,0.55) 0%, transparent 60%)',
                    filter: 'blur(6px)',
                }}
            />
            {/* 左色條 */}
            <span
                className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r"
                style={{ background: accent, boxShadow: `0 0 12px ${accent}66` }}
            />
            <div className="relative z-10 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-black tracking-[0.22em] uppercase"
                            style={{ color: accent }}>
                            {isStrength ? 'NEXT · STRENGTH' : 'NEXT BRICK'}
                        </span>
                        <span className="text-[9px] font-black tracking-[0.20em] uppercase"
                            style={{ color: 'rgba(22,20,21,0.40)' }}>
                            · {(brick.rpe_band?.label || brick.type || '').toString().toUpperCase()}
                        </span>
                    </div>
                    <div className="text-[14px] font-bold leading-tight truncate mt-0.5"
                        style={{ color: C.ink }}>
                        {brick.title || (isStrength ? '重訓交叉訓練' : '跑步')}
                    </div>
                    {subtitle && (
                        <div className="text-[11px] font-mono mt-0.5"
                            style={{ color: 'rgba(22,20,21,0.55)' }}>
                            {subtitle}
                        </div>
                    )}
                </div>
                <span
                    className="text-[12px] font-black tracking-[0.22em] px-3 py-1.5 rounded-full shrink-0"
                    style={{
                        background: accent,
                        color: C.white,
                        boxShadow: `0 4px 14px ${accent}55, inset 0 1px 1px rgba(255,255,255,0.35)`,
                    }}
                >
                    {isStrength ? '預覽 →' : '開練 →'}
                </span>
            </div>
        </motion.button>
    );
};
