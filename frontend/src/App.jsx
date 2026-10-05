import React, { useState, useEffect, lazy, Suspense } from 'react';
import { pressProps } from './utils/nutritionMotion';
import RewardUnlockProvider from './components/RewardUnlockProvider';
import PlanCompletionGate from './components/PlanCompletionGate';
import { Routes, Route, useNavigate, useLocation, Navigate, Outlet } from 'react-router-dom';
import { motion, MotionConfig } from 'framer-motion';
import { Activity, WifiOff, RefreshCw, Play, Sparkles, Home } from 'lucide-react';
import RunningLoader from './components/RunningLoader';

/**
 * ★ v2.4 BootFallback — Suspense 佔位
 *
 * 原生殼（iOS WebView）在啟動時已經有一段完整的 DRVN logo 描繪動畫蓋在上面。
 * 在那之前 React 這邊再放一個「LOADING DRVN」等於同一件事播兩次 ——
 * 使用者看到的是「動畫、動畫、又一個動畫」，而不是流暢的開場。
 *
 * 規則：
 *   · 原生殼且 splash 還沒收起 → 完全透明（讓原生動畫獨佔畫面）
 *   · 其他情況（瀏覽器、App 內導航）→ 照常顯示 loading
 */
const BootFallback = () => {
    const nativeSplashUp =
        typeof window !== 'undefined' &&
        !!window.webkit?.messageHandlers &&
        window.__drvnRevealed !== true;
    if (nativeSplashUp) return <div style={{ position: 'fixed', inset: 0, background: '#F6F4F1' }} />;
    return <RunningLoader />;
};
import RouteErrorBoundary from './components/RouteErrorBoundary';
import { FLAGS } from './config/featureFlags';
import OnboardingSpotlight, { ONBOARDING_STATE_EVENT, ONBOARDING_EVENT, SECTION_ROUTES } from './components/OnboardingSpotlight';
import AIAnalysisOrb from './components/AIAnalysisOrb';
import SwissMoment from './components/SwissMoment';
import MembershipSheet from './components/MembershipSheet';
import MembershipPlanSheet from './components/MembershipPlanSheet';
import MembershipSurvey from './components/MembershipSurvey';
import MemberWelcomeSheet from './components/MemberWelcomeSheet';
import CourseGate from './components/CourseGate';
import MemberPageGate from './components/MemberPageGate';
import { refreshMembership, startAppStoreSync } from './utils/membership';
import { openOrb } from './utils/aiAnalysisOrb';
import { hasSeenTip, markTipSeen } from './utils/firstVisitCoach';
import { toast } from './utils/toast';

// 🎵 App 重開時「完全重置」音樂播放狀態。
//    音樂功能只是「開啟外部 App（Spotify/Apple Music）連結」，DRVN 無法得知
//    對方是否還在播；重新打開 app 時如果還顯示「播放中」就是假象。
//    規則：
//      1. 冷啟動（頁面真正 reload，本模組重新執行）→ 直接清掉整個播放狀態。
//         SPA 頁內導航不會重跑本模組，所以不受影響。
//      2. iOS WebView 從背景喚醒（不會 reload）→ 用 visibilitychange 判斷：
//         在背景超過 RESUME_RESET_MIN 分鐘再回前景，一律視為「下次打開 app」→ 重置。
const resetSonicPlayback = () => {
    try {
        const raw = localStorage.getItem('sonicfocus_playback');
        if (!raw) return;
        localStorage.removeItem('sonicfocus_playback');
        window.dispatchEvent(new Event('sonicfocus_playback_changed'));
        window.dispatchEvent(new Event('sonicfocus-update'));
    } catch { /* localStorage 不可用時忽略 */ }
};
try {
    if (typeof window !== 'undefined') {
        // ① 冷啟動：一律重置（使用者要求：重開 app 音樂不能還在「播放中」）
        resetSonicPlayback();
        // ② 背景喚醒：躲在背景太久（> 30 分鐘）再回來 → 視為新的一次使用，重置
        const RESUME_RESET_MIN = 30;
        let hiddenAt = 0;
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) { hiddenAt = Date.now(); return; }
            if (hiddenAt && Date.now() - hiddenAt > RESUME_RESET_MIN * 60000) resetSonicPlayback();
            hiddenAt = 0;
        });
    }
} catch { /* ignore */ }

// 🟠 各分頁「第一次造訪」自動跑該頁的聚光燈段落（取代開場一次灌完的深功能教學）。
//    使用者首次走到某頁時，dispatch ONBOARDING_EVENT{section}，由 OnboardingSpotlight
//    跑那一頁的段落；看過即記錄，之後不再自動跳（可用「重看教學」重置）。
const RouteSectionSpotlight = () => {
    const { pathname } = useLocation();
    // 教學（聚光燈）進行中就先不要自動觸發本頁段落，避免和開場導覽互搶；
    // 因為沒 markTipSeen，使用者下次再進這頁時仍會正常觸發。
    const spotlightActiveRef = React.useRef(false);
    useEffect(() => {
        const h = (e) => { spotlightActiveRef.current = !!e.detail?.active; };
        window.addEventListener(ONBOARDING_STATE_EVENT, h);
        return () => window.removeEventListener(ONBOARDING_STATE_EVENT, h);
    }, []);
    useEffect(() => {
        const hit = SECTION_ROUTES.find((s) => pathname.startsWith(s.match));
        if (!hit) return;
        const key = `spotlight-section-${hit.section}`;
        if (hasSeenTip(key)) return;
        // 等頁面內容 mount 後再開（聚光燈本身也會輪詢等目標出現）。
        // 延遲刻意比精靈結束後的開場導覽 dispatch（700ms）晚，確保讓開場導覽先開。
        const t = setTimeout(() => {
            if (spotlightActiveRef.current) return; // 開場導覽等教學進行中 → 這次先不觸發
            markTipSeen(key);
            window.dispatchEvent(new CustomEvent(ONBOARDING_EVENT, { detail: { section: hit.section } }));
        }, 1200);
        return () => clearTimeout(t);
    }, [pathname]);
    return null;
};

// ─── Route wrappers (NO transition) ──────────────────────────────────────────
// 之前的 motion 過場會讓「離場的舊頁」與「入場的新頁」在切換瞬間同時存在並堆疊，
// 造成導航/刷新時的重疊感。改為純靜態 div：頁面瞬間切換、零動畫、零重疊。
// 保留 className 以維持原本的版面樣式。
// Premium 進場：fade + 輕微上升（house easing 0.16,1,0.3,1）
const SwissRoute = ({ children, className = '' }) => (
    <motion.div className={className}
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
        {children}
    </motion.div>
);

// Lateral variant — 從右側滑入（page push 感）
// 規範 v1：三變體統一 0.4s / house easing / 位移 ≤20px。
// 使用時機鎖定：tab 平級切換=SwissRoute、下鑽詳情=Lateral、模態/完成卡=Scale
const SwissRouteLateral = ({ children, className = '' }) => (
    <motion.div className={className}
        initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
        {children}
    </motion.div>
);

// Scale variant — 輕微放大淡入（focus 感）
const SwissRouteScale = ({ children, className = '' }) => (
    <motion.div className={className}
        initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
        {children}
    </motion.div>
);

// ─── Lazy-loaded route components ────────────────────────────────────────────
// 所有 page-level 元件改用 React.lazy()，避免首次載入時把 249 個元件全部打包進去
// 只有真正用到的 route 才會觸發下載，大幅縮短首屏 bundle 體積與 TTI
const UploadCard = lazy(() => import('./components/UploadCard'));
const ExpertUploadCard = lazy(() => import('./components/UploadCard').then(m => ({ default: m.ExpertUploadCard })));
const UserUploadCard = lazy(() => import('./components/UploadCard').then(m => ({ default: m.UserUploadCard })));
const ProcessingSpinner = lazy(() => import('./components/ProcessingSpinner'));
const UserProfileForm = lazy(() => import('./components/UserProfileForm'));
const UserProfileFormMobile = lazy(() => import('./components/UserProfileFormMobile'));
const NutritionPageMobile = lazy(() => import('./components/NutritionPageMobile'));
const EvolutionMatrixPage = lazy(() => import('./components/EvolutionMatrixPage'));
const EvolutionCompletionCard = lazy(() => import('./components/EvolutionCompletionCard'));
const MetricProgressView = lazy(() => import('./components/MetricProgressView'));
const CardioTrackerMobile = lazy(() => import('./components/CardioTrackerMobile'));
const CardioPlanBuilder = lazy(() => import('./components/CardioPlanBuilder'));
const JourneyEvolutionPage = lazy(() => import('./components/JourneyEvolutionPage'));
const TrainingFocusPlannerMobile = lazy(() => import('./components/TrainingFocusPlannerMobile'));
const CardioMicrocycleInbox = lazy(() => import('./components/cardio/CardioMicrocycleInbox'));
const WeekSettlementSheet = lazy(() => import('./components/WeekSettlementSheet'));
const CardioBrickDetailSheet = lazy(() => import('./components/CardioBrickDetailSheet'));
const CardioPlanEditor = lazy(() => import('./components/CardioPlanEditor'));
// ❌ ActivityFeed / HashtagSetupPage 的 lazy import 已移除 —— 兩條路由都進不去（見下方說明）
const StrengthSessionDetailMobile = lazy(() => import('./components/StrengthSessionDetailMobile'));
const WorkoutCompletionCard = lazy(() => import('./components/WorkoutCompletionCard'));
const FitnessCommunityPage = lazy(() => import('./components/FitnessCommunityPage'));
const GearGaragePage = lazy(() => import('./components/GearGaragePage'));
const ActionFirstDashboardMobile = lazy(() => import('./components/ActionFirstDashboardMobile'));
const ProgressHub = lazy(() => import('./components/ProgressHub'));
// OnboardingFlow（舊版引導流程）已停用 — 統一走 OnboardingWizard。
// /onboarding 保留為轉址，避免舊書籤失效。
const OnboardingWizard = lazy(() => import('./components/OnboardingWizard'));
const TrainingPartnerBubble = lazy(() => import('./components/TrainingPartnerBubble'));
const WorkoutPlanGeneratorViewMobile = lazy(() => import('./components/WorkoutPlanGeneratorViewMobile'));
const LuxuryPlanViewMobile = lazy(() => import('./components/LuxuryPlanViewMobile'));
const GymMemoryPage = lazy(() => import('./components/GymMemoryPage'));
const RunMemoryPage = lazy(() => import('./components/RunMemoryPage'));
const CustomPlanBuilderMobile = lazy(() => import('./components/CustomPlanBuilderMobile'));
const CustomPlanListMobile = lazy(() => import('./components/CustomPlanListMobile'));
const PlanPreviewPageMobile = lazy(() => import('./components/PlanPreviewPageMobile'));
const PlanTrackingPageMobile = lazy(() => import('./components/PlanTrackingPageMobile'));
const MasterJourneyDashboard = lazy(() => import('./components/MasterJourneyDashboard'));
const ChestPlanPreviewPageMobile = lazy(() => import('./components/ChestPlanPreviewPageMobile'));
const TrainingLogPageMobile = lazy(() => import('./components/TrainingLogPageMobile'));
const TrainingRecordPageMobile = lazy(() => import('./components/TrainingRecordPageMobile'));
const ChallengeDetailView = lazy(() => import('./components/ChallengeDetailView'));
const GymBagView = lazy(() => import('./components/GymBagView'));
const RunningAnalyticsMobile = lazy(() => import('./components/RunningAnalyticsMobile'));
const CardioTrendView = lazy(() => import('./components/CardioTrendView'));
const RunningAnalysisMobile = lazy(() => import('./components/RunningAnalysisMobile'));
const CardioHistoryMobile = lazy(() => import('./components/CardioHistoryMobile'));
const SegmentExplorerMobile = lazy(() => import('./components/SegmentExplorerMobile'));
const BodyAnalysisViewMobile = lazy(() => import('./components/BodyAnalysisViewMobile'));
const PowerPRTrackerMobile = lazy(() => import('./components/PowerPRTrackerMobile'));
const ActivityFeedMobile = lazy(() => import('./components/ActivityFeedMobile'));
const PRProfilePage = lazy(() => import('./components/PRProfilePage'));
const SocialPage = lazy(() => import('./components/SocialPage'));
const GymBagViewMobile = lazy(() => import('./components/GymBagViewMobile'));
const SmartTrainerModeMobile = lazy(() => import('./components/SmartTrainerModeMobile'));
const WorkoutSessionViewMobile = lazy(() => import('./components/WorkoutSessionViewMobile'));
const FreestyleStartView = lazy(() => import('./components/FreestyleStartView'));
const SonicFocusViewMobile = lazy(() => import('./components/SonicFocusViewMobile'));
const CoachQAViewMobile = lazy(() => import('./components/CoachQAViewMobile'));
const WeeklyRecapViewMobile = lazy(() => import('./components/WeeklyRecapViewMobile'));
const MonthlyReportPage = lazy(() => import('./components/MonthlyReportPage'));
const PersonalityViewMobile = lazy(() => import('./components/PersonalityViewMobile'));
const AnalysisChoiceMobile = lazy(() => import('./components/AnalysisChoiceMobile'));
const PoseValidationMobile = lazy(() => import('./components/PoseValidationMobile'));
const CoachSelectorMobile = lazy(() => import('./components/CoachSelectorMobile'));
const UploadMobile = lazy(() => import('./components/UploadMobile'));
const ResultViewMobile = lazy(() => import('./components/ResultViewMobile'));
const ExerciseSelectorMobile = lazy(() => import('./components/ExerciseSelectorMobile'));
const ExerciseHistoryMobile = lazy(() => import('./components/ExerciseHistoryMobile'));
const TemplateUploadMobile = lazy(() => import('./components/TemplateUploadMobile'));
const CapsuleNavigation = lazy(() => import('./components/CapsuleNavigation'));
const SharePreviewModal = lazy(() => import('./components/SharePreviewModal'));
const SocialHubMobile = lazy(() => import('./components/SocialHubMobile'));
const ARViewMobile = lazy(() => import('./components/ARViewMobile'));
const PoseAnalyzerMobile = lazy(() => import('./components/PoseAnalyzerMobile'));
const LoginSettingsMobile = lazy(() => import('./components/LoginSettingsMobile'));
const SunlightIntro = lazy(() => import('./components/SunlightIntro'));
const LoginPage = lazy(() => import('./components/LoginPage'));
const AuthCallbackPage = lazy(() => import('./components/AuthCallbackPage'));
const WeeklyInsightsDetailMobile = lazy(() => import('./components/WeeklyInsightsDetailMobile'));
const CustomExerciseLibraryViewMobile = lazy(() => import('./components/CustomExerciseLibraryViewMobile'));

// Contexts are small and used globally — keep them eager
import { EventBusProvider } from './contexts/EventBusContext';
import { RecoveryProvider } from './contexts/RecoveryContext';

// 待機畫面 — 閒置 15 秒自動進入，連點兩下解除
/* 🔻 打包優化（2026-09）：hook 與畫面拆開。
   hook 很小、必須 eager；1,219 行的待機畫面改成 lazy —— 使用者可能整場都不會閒置到，
   沒道理讓它佔用首屏。做法與本檔其他 77 個 lazy 元件一致。 */
import { useStandbyTrigger } from './hooks/useStandbyTrigger';
const StandbyScreen = lazy(() => import('./components/StandbyScreen'));
// ⌚ 手錶回傳跑步資料時要落地的結算頁。元件本來就會讀 router state
//    (window.history.state.usr.cardioData)，只是路由一直沒註冊 → 白畫面。
const CardioResultsMobile = lazy(() => import('./components/CardioResultsMobile'));

import apiClient, { uploadExpertVideo, uploadUserVideo, checkBackendHealth, addExpertVideos } from './api/client';
import { getUserId, hasSignedIn } from './utils/auth';
import { syncUserScope } from './utils/userScopedStorage';


// ─── Apple Watch Workout Sync ─────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// ⌚ Apple Watch Workout Sync
// Listens for GYM_DONE native events forwarded from Swift:
//   GymLoggingView → WCSession → WatchConnectivityManager → HealthAppBridge → sendToJS
//
// On receipt:
//  1. Saves the workout to the backend (appears in 紀錄 tab)
//  2. Navigates to /watch-workout-done so the user can review & 打卡
// ─────────────────────────────────────────────────────────────────────────────
const WatchWorkoutSync = ({ userId }) => {
    const navigate = useNavigate();

    useEffect(() => {
        if (!userId) return;

        const handleWatchGymDone = async (event) => {
            try {
                const {
                    volume = 0, sets = 0, calories = 0, duration = 0,
                    heartRate = 0, avgHR = 0, effortScore = 0,
                    muscle = '', exercises = [],
                } = event;

                const durationMins = Math.max(1, Math.round(duration / 60));
                const effectiveHR = heartRate || avgHR || 0;

                // ── 1. Save to backend so it appears in 紀錄 tab ──────────────
                // 使用 JSON body 對齊 SaveWorkoutRequest（api_plan_endpoints.py 優先匹配）
                const payload = {
                    user_id: userId,
                    coach_id: 'apple_watch',
                    overall_score: Math.min(100, Math.round((volume / Math.max(1, durationMins)) / 3)),
                    metrics: {
                        calories,
                        heartRate: effectiveHR,
                        effortScore,
                        source: 'appleWatch',
                        completion_rate: 100,
                        intensity: 75,
                    },
                    reps_count: sets,
                    exercises: exercises,
                    duration_mins: durationMins,
                    total_volume: Math.round(volume),
                    focus_group: muscle || 'strength',
                    pr_alerts: exercises.flatMap(ex =>
                        (ex.sets || []).filter(s => s.isPR).map(() => ({ name: ex.name }))
                    ),
                };

                let sessionId = null;
                // 手錶已經自己存進後端了 → 這裡只刷新紀錄、顯示結算，不再存第二筆
                if (event.savedByWatch) {
                    window.dispatchEvent(new CustomEvent('watch-workout-saved'));
                } else try {
                    // 🩹 v2：改走 apiClient（自動用正式後端 base URL + 認證）。
                    //    舊版寫死 http://{hostname}:8000 — iOS 打包版以 drvn:// scheme 載入，
                    //    hostname 不是後端 → 手錶重訓紀錄在正式版會「靜默存檔失敗」。
                    const res = await apiClient.post('/api/workout/save', payload);
                    sessionId = res?.data?.session_id || null;
                    // 通知 TrainingRecordPageMobile 自動刷新紀錄列表
                    window.dispatchEvent(new CustomEvent('watch-workout-saved'));
                } catch (saveErr) {
                    console.warn('⌚ Watch workout save failed:', saveErr.message);
                }

                // ── 2. Navigate to 打卡結算頁 ──────────────────────────────────
                // Map Watch exercises format → EvolutionCompletionCard format
                const mappedExercises = exercises.map(ex => ({
                    name: ex.name || '—',
                    sets: (ex.sets || []).map(s => ({
                        weight: parseFloat(s.weight) || 0,
                        reps: parseInt(s.reps) || 0,
                        rpe: parseFloat(s.rpe) || 8,
                        effortScore: parseInt(s.effortScore) || 0,
                        isPR: !!s.isPR,
                        completed: true,
                    })),
                }));

                navigate('/watch-workout-done-mobile', {
                    state: {
                        watchData: {
                            exercises: mappedExercises,
                            durationSeconds: duration,
                            calories,
                            completedSets: sets,
                            heartRate: effectiveHR,
                            totalVolume: volume,
                            effortScore,
                            sessionId,
                            completedDate: new Date().toISOString(),
                            source: 'appleWatch',
                        },
                    },
                    replace: false,
                });

            } catch (e) {
                console.warn('⌚ WatchWorkoutSync error:', e.message);
            }
        };

        // Chain with existing nativeBridge.onNativeEvent handlers
        const prev = window.nativeBridge?.onNativeEvent;
        if (!window.nativeBridge) window.nativeBridge = {};
        window.nativeBridge.onNativeEvent = (jsonStr) => {
            if (prev) prev(jsonStr);
            try {
                const evt = JSON.parse(jsonStr);
                if (evt.type === 'GYM_DONE') handleWatchGymDone(evt);
            } catch (_) { }
        };

        return () => {
            if (window.nativeBridge) window.nativeBridge.onNativeEvent = prev;
        };
    }, [userId, navigate]);

    return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// ⌚ Apple Watch Cardio Sync (global listener)
// Listens for 'watch-cardio-summary' events from iOS WebView bridge (sent when
// user taps DONE on the Watch summary screen).
//
// Job: parse the *new* nested payload coming from
//   ＦｉｔｎｅｓｓAppWatch Watch App/ContentView.swift → sendSummaryToPhone()
// shape:
//   { watchSummaryPayload: { stats: {...}, route, stream_data, ... } }
// then **navigate** to /cardio-tracker-mobile with the parsed data in
// `location.state`. The actual save + UI is owned by CardioTrackerMobile,
// which uses a dedup ref so the same payload isn't saved twice when both
// listeners fire for the same event.
// ─────────────────────────────────────────────────────────────────────────────
const WatchCardioSync = () => {
    const navigate = useNavigate();

    useEffect(() => {
        const handleWatchSummary = (e) => {
            // 兼容兩種 payload 形式：
            //   1) e.detail = { watchSummaryPayload: { stats: {...}, ... } }   ← 新版（iOS Bridge）
            //   2) e.detail = { stats: {...}, ... }                              ← 萬一直接送進來
            //   3) e.detail = { duration, distance, calories, avgHR, ... }      ← 舊平層格式
            const raw = e.detail || {};
            const d = raw.watchSummaryPayload || raw;
            const stats = d.stats || d || {};

            // 統一解析（與 CardioTrackerMobile.handleWatchSummary 完全一致）
            const durationSec = stats.duration ?? stats.duration_seconds ?? d.duration ?? 0;
            // Watch 新版 payload 的 distance 欄位已是 KM。舊版可能是公尺，所以做 sanity check
            const rawDist = stats.distance_km ?? stats.distance ?? d.distance ?? 0;
            const distanceKm = rawDist > 100 ? rawDist / 1000 : rawDist;
            const calories = Math.round(stats.calories ?? d.calories ?? 0);
            const avgHR = Math.round(stats.avgHR ?? d.avgHR ?? 0);
            const avgPace = stats.avgPace ?? stats.pace_per_km ?? stats.pace ?? d.avgPace ?? 0;
            const score = stats.score ?? d.score ?? 0;
            const zoneStats = stats.zoneStats ?? d.zoneStats ?? {};
            const splits = stats.splits ?? d.splits ?? [];

            // 用 timestamp 當去重鍵；避免同一筆 summary 被存兩次
            const watchTs = d.timestamp || Date.now();

            const watchCardioData = {
                sessionId: `watch_${watchTs}`,        // 穩定的去重 ID
                stats: {
                    distance: distanceKm,           // KM
                    distance_km: distanceKm,
                    duration: durationSec,          // 秒
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
                userId: d.userId || localStorage.getItem('userId') || '',
            };

            // 走 router state；CardioTrackerMobile 會在掛載時讀取並處理（含存檔 + 去重）
            navigate('/cardio-tracker-mobile', {
                state: {
                    cardioData: watchCardioData,
                    showResults: true,
                    fromWatch: true,
                },
                replace: false
            });
        };

        window.addEventListener('watch-cardio-summary', handleWatchSummary);
        return () => window.removeEventListener('watch-cardio-summary', handleWatchSummary);
    }, [navigate]);

    return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// ⌚ Watch Workout Done Page
// Rendered after the Watch sends GYM_DONE. Shows EvolutionCompletionCard
// pre-filled with watch data so the user can review stats and 打卡 (check-in).
// ─────────────────────────────────────────────────────────────────────────────
const WatchWorkoutDonePage = ({ userId }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const watchData = location.state?.watchData;

    // If somehow navigated here without data, redirect to records
    if (!watchData) {
        return (
            <div style={{
                maxWidth: 430, margin: '0 auto', minHeight: '100dvh',
                background: '#161415', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', color: '#F6F4F1'
            }}>
                <p style={{ opacity: 0.5, marginBottom: 24 }}>No workout data.</p>
                <motion.button {...pressProps('row')}
 onClick={() => navigate('/training-record-mobile')}
 style={{
 background: '#F95C4B', color: '#fff', border: 'none',
 borderRadius: 24, padding: '12px 28px', fontWeight: 700, cursor: 'pointer'
 }}
 >
                    訓練紀錄
                </motion.button>
            </div>
        );
    }

    const {
        exercises = [], durationSeconds = 0, calories = 0,
        completedSets = 0, heartRate = 0,
    } = watchData;

    return (
        <div style={{ maxWidth: 430, margin: '0 auto', position: 'relative' }}>
            {/* Watch badge — 讓使用者知道這是手錶傳回的數據 */}
            <div style={{
                position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)',
                zIndex: 9999, background: 'rgba(22,20,21,0.88)', backdropFilter: 'blur(10px)',
                borderRadius: 18, padding: '6px 14px', border: '1px solid rgba(249,92,75,0.3)',
                display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'none',
            }}>
                <span style={{ fontSize: 14 }}>⌚</span>
                <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: 2,
                    color: '#F95C4B', textTransform: 'uppercase'
                }}>
                    Apple Watch
                </span>
            </div>

            <EvolutionCompletionCard
                exercises={exercises}
                durationSeconds={durationSeconds}
                calories={calories}
                completedSets={completedSets}
                heartRate={heartRate}
                completedDate={new Date(watchData.completedDate || watchData._fallbackDate || new Date().toISOString())}
                activity_type="Strength"
                onExit={() => navigate('/training-record-mobile')}
                onShare={() => { }}
            />
        </div>
    );
};

// ✅ Global WKWebView Repaint Fix: GPU compositor hint (no FOUC)
// WKWebView Repaint Fix — 只在 iOS WKWebView 環境啟用
// 用 opacity 微閃取代 display:none：不觸發 layout thrashing，不中斷計時器，無 FOUC
const WKWebViewRepaintFix = () => {
    const location = useLocation();
    // 只有 WKWebView 才有 window.webkit.messageHandlers
    const isWKWebView = !!window?.webkit?.messageHandlers;

    useEffect(() => {
        if (!isWKWebView) return; // 純瀏覽器 / Android 不需要
        const root = document.getElementById('root');
        if (!root) return;
        root.style.opacity = '0.99';
        const rafId = requestAnimationFrame(() => {
            root.style.opacity = '';
        });
        return () => cancelAnimationFrame(rafId);
    }, [location.pathname, isWKWebView]);

    return null;
};

// 🔵 P1-2: 底部膠囊導覽的「隱藏路由」單一來源（全螢幕/沉浸式頁面）。
// 任何頁要隱藏底部導覽，只在此處新增其路由片段即可，不再散落於各處 OR 判斷。
const HIDE_MOBILE_NAV_ROUTES = [
    '/workout-plan-mobile',
    '/weekly-recap-mobile',
    '/monthly-report',
    '/ar-mobile',
    '/pose-analyzer',
    '/weekly-recap/week',
    '/training-session',        // 同時涵蓋 /training-session-mobile
    '/freestyle-training-mobile',
    '/plan-preview',
    '/chest-plan-preview',
    '/plan-tracking',
    '/fusion-config',
    '/training-focus',          // 訓練重點引導：二級頁，用返回鍵離開
    '/personality-mobile',
    '/cardio-tracker-mobile',
    '/cardio-plan-builder',
    '/cardio-microcycle-inbox',
    '/cardio-week-settlement',
    '/cardio-brick-detail',
    '/cardio-plan-editor',
    '/custom-plan-builder',
    '/exercise-library-mobile',
    '/upload-mobile',
    '/exercise-selector-mobile',
    '/result-mobile',
    '/template-upload-mobile',
    '/custom-plans',
    // 🩹 從最新動態點進的「單次紀錄結算頁」：沉浸閱讀，不顯示底部導航（用返回鍵離開）。
    //    ⚠ 動態列表頁本身（/activity-feed-mobile）要保留導航 — 只有點進單次結算才隱藏。
    '/running-analysis-mobile',
    '/cardio-results-mobile',
    '/strength-session-mobile',
    '/pr-profile',
    '/gear-garage-mobile',
];

/** 讀 localStorage 的 JSON；不存在或解析失敗 → null（開機路徑不能因為一筆壞快取整個掛掉） */
const readStoredJson = (key) => {
    try {
        const saved = localStorage.getItem(key);
        return saved ? JSON.parse(saved) : null;
    } catch { return null; }
};

// Layout Component
const Layout = ({ step, isBackendReady, resetApp, userId, showHeader: showHeaderProp = true }) => {
    const location = useLocation();

    // 🔥 Fix: 監聽 resize，避免旋轉螢幕後 isMobile 不更新
    const [windowWidth, setWindowWidth] = useState(
        typeof window !== 'undefined' ? window.innerWidth : 1024
    );
    useEffect(() => {
        const onResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // 🔴 Fix(isMobile): 移除依賴 pathname 字串的錯誤判斷
    // 原本 includes('home') / includes('dashboard') 會讓桌面上的 /mobile-home 也被誤判為 mobile
    // 現在只用螢幕寬度 + UA 判定，確保 Desktop Layout 在桌面正確顯示
    const isMobile = windowWidth < 1024 ||
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    // 監聽 fusionMode 全局事件（由 MasterJourneyDashboard 觸發）
    const [isFusionMode, setIsFusionMode] = useState(false);
    useEffect(() => {
        const handler = (e) => setIsFusionMode(e.detail?.active ?? false);
        window.addEventListener('fusionModeChange', handler);
        return () => window.removeEventListener('fusionModeChange', handler);
    }, []);

    // 監聽待機畫面狀態（由 App 在 StandbyScreen 開啟/解除時派發）
    // 待機時隱藏底部導航列，解除後恢復
    const [isStandby, setIsStandby] = useState(false);
    useEffect(() => {
        const handler = (e) => setIsStandby(e.detail?.active ?? false);
        window.addEventListener('standbyChange', handler);
        return () => window.removeEventListener('standbyChange', handler);
    }, []);

    // 🔵 P1-2: 收斂為單一來源。要讓某頁隱藏底部膠囊導覽，只需在此陣列加一條路由片段。
    //   （/training-session 已涵蓋 /training-session-mobile，故不重複列出）
    const shouldHideMobileNav = isFusionMode || isStandby ||
        HIDE_MOBILE_NAV_ROUTES.some(r => location.pathname.includes(r));

    // Robust check for any Cardio related route
    const isCardioRoute = [
        'cardio-plan-builder',
        'cardio-microcycle-inbox',
        'cardio-week-settlement',
        'cardio-brick-detail',
        'cardio-plan-editor',
        'cardio',
        'running-analysis',
        'segment-explorer',
        'cardio-history',
        'cardio-trends'
    ].some(term =>
        location.pathname.toLowerCase().includes(term) ||
        window.location.hash.toLowerCase().includes(term)
    );

    // Define light cardio routes that use the Paper (#F6F4F1) background
    const isLightCardioRoute = [
        'cardio-microcycle-inbox',
        'cardio-week-settlement',
        'cardio-brick-detail',
        'cardio-plan-editor',
        'cardio-plan-builder'
    ].some(term =>
        location.pathname.toLowerCase().includes(term) ||
        window.location.hash.toLowerCase().includes(term)
    );

    return (
        <div className={`min-h-[100dvh] ${isCardioRoute ? 'bg-transparent' : 'bg-glass-dark'} text-white font-sans selection:bg-glass-beige selection:text-glass-dark relative overflow-x-hidden transition-colors duration-500`}>
            {/* 全域貼紙解鎖偵測 + 獲取動畫（訓練完成/段位變動時自動播放） */}
            <RewardUnlockProvider />
            {/* ★ v2.3 全域結業攔截：計劃到 end_date 就跳結業＋下一套推薦，
                不必等使用者自己點進「計劃」才發現這期已經結束。
                跑步中／登入中／建計劃中會自動讓開。 */}
            <PlanCompletionGate />
            {/* Global Background Layer for Cardio Contexts - Image removed as requested */}
            {isCardioRoute && (
                <div
                    className="fixed inset-0 pointer-events-none"
                    style={{
                        zIndex: 0,
                        backgroundColor: isLightCardioRoute ? '#F6F4F1' : '#161415' 
                    }}
                />
            )}
            {/* 「連不到後端就蓋住全螢幕」的遮罩已經整段移除，不是暫時關掉。
                理由記在這裡，免得以後有人覺得「應該要提示使用者」又加回來：
                它會在收訊差或後端冷啟動時把整個 App 鎖住，使用者連已經存在本機的
                資料都看不到 —— 離線等於開不起來。後端不可用是每一頁自己的事
                （該頁顯示自己的空狀態或重試卡），不是一張蓋住全世界的遮罩。 */}

            {/* Main Content Area - relative z-10 for transparency stacking */}
            {/* 🔴 Fix(P0-3): 行動版底部統一保留膠囊導覽高度的安全留白，避免內容被導覽列遮蔽。
                僅在導覽列實際顯示時加（!shouldHideMobileNav），全螢幕頁面不留多餘空白。 */}
            {/* 導覽列為 position:fixed 浮層，不佔版位；底部留白交由各頁自身的內容 padding 處理，
                這樣頁面背景能一路延伸到導覽列下方，不會在最後一格下方露出深色父層。
                每頁的 --nav-clearance 變數可供內容區做底部留白。 */}
            <main
                className={`relative z-10 min-h-[600px] flex flex-col transition-opacity duration-300 opacity-100 ${isMobile ? '' : 'max-w-7xl mx-auto pb-24'}`}
                style={isMobile && !shouldHideMobileNav
                    /* 底部留白同時清開「膠囊導覽列」與其上方浮動的「教學未完成」badge，
                       badge 位於 safe-area+102px、約 34px 高，故留白拉到 safe-area+150px。 */
                    ? { '--nav-clearance': 'calc(env(safe-area-inset-bottom, 24px) + 150px)' }
                    : undefined}
            >
                <Outlet />
            </main>



            {/* Universal Capsule Navigation */}
            {!shouldHideMobileNav && <CapsuleNavigation />}

            {/* 🟠 各分頁首次造訪 → 自動跑該頁聚光燈段落（取代開場一次灌完的深功能教學） */}
            <RouteSectionSpotlight />

            {/* 🎵 Music player is handled per-page (home/cardio/training) */}
        </div>
    );
};

// Protected Route Wrapper
const ProtectedRoute = ({ userId, children }) => {
    // 修復：不導向 /welcome（會顯示 Golden Template），改導向 /login
    if (!userId) {
        return <Navigate to="/login" replace />;
    }
    return children;
};

export default function App() {
    const navigate = useNavigate();
    const location = useLocation();
    const isFirstNavRender = React.useRef(true);

    // （已收斂）換頁震動移除：按鈕觸覺由 utils/globalHaptics 統一提供，避免雙重回饋

    // ⌚ Global Watch Cardio Receiver
    useEffect(() => {
        window.receiveWatchCardioData = (cardioData) => {
            navigate('/cardio-results-mobile', {
                state: { cardioData }
            });
        };
        return () => { delete window.receiveWatchCardioData; };
    }, [navigate]);

    const [processingProgress, setProcessingProgress] = useState(0);
    const [isBackendReady, setIsBackendReady] = useState(false);
    const [isSideView, setIsSideView] = useState(false);

    // ─── 待機畫面（Standby）───────────────────────────────────────────────
    // 在「健身中 / 跑步中」以外的頁面閒置 30 秒 → 進入待機畫面
    // 連點兩下即可解除回原畫面
    const [showStandby, setShowStandby] = useState(false);

    // 運動進行中的頁面（live session）— 這些頁面不觸發待機，也不顯示待機畫面
    const ACTIVE_WORKOUT_ROUTES = [
        '/training-session',         // 健身訓練進行中
        '/training-session-mobile',
        '/smart-trainer',            // 智慧訓練進行中
        '/smart-trainer-mobile',
        '/cardio-tracker',           // 有氧 / 跑步進行中
        '/cardio-tracker-mobile',
    ];
    const isActiveWorkout = ACTIVE_WORKOUT_ROUTES.some(
        r => location.pathname === r || location.pathname.startsWith(r + '/')
    );

    // 🧭 新手教學進行中 — 教學期間完全不觸發、不顯示待機畫面
    const [onboardingActive, setOnboardingActive] = useState(false);
    useEffect(() => {
        const handler = (e) => setOnboardingActive(e.detail?.active ?? false);
        window.addEventListener(ONBOARDING_STATE_EVENT, handler);
        return () => window.removeEventListener(ONBOARDING_STATE_EVENT, handler);
    }, []);

    // 待機畫面是否可見：state 為 true、不在運動中頁面、且教學未進行
    // （用衍生值而非 effect 同步 — 切到運動頁時自動隱藏，不需額外 setState）
    const standbyVisible = showStandby && !isActiveWorkout && !onboardingActive;

    // 待機畫面開啟 / 解除時，通知 Layout 隱藏 / 恢復底部導航列
    useEffect(() => {
        window.dispatchEvent(
            new CustomEvent('standbyChange', { detail: { active: standbyVisible } })
        );
    }, [standbyVisible]);

    // 閒置 3 分鐘觸發待機畫面（運動中 / 教學中完全不觸發；待機畫面已開啟時不重複觸發）
    useStandbyTrigger({
        isActiveWorkout: isActiveWorkout || showStandby || onboardingActive,
        onStandby: () => setShowStandby(true), // ✅ 重新啟用待機功能（IDLE_MS=3分鐘）
    });

    // Persistent State
    // 🛡️ 開機讀快取：壞掉的 JSON（被截斷／寫進 "undefined"）會在這裡 throw，
    //    App 外層沒有 error boundary → 每次開啟都白畫面。讀不懂就當沒有。
    const [userProfile, setUserProfile] = useState(() => readStoredJson('userProfile'));
    const [selectedCoach, setSelectedCoach] = useState(() => readStoredJson('selectedCoach'));
    const [userId, setUserId] = useState(() => getUserId());

    /* 💳 會員身分 —— 登入後與每次回到 App 時向後端更新（真相源在 /api/membership/me）。 */
    useEffect(() => {
        if (!userId) return;
        refreshMembership();
        startAppStoreSync();   // iOS：把 App Store 上有效的訂閱（含續訂）同步給後端
        const onVisible = () => { if (document.visibilityState === 'visible') { refreshMembership(); startAppStoreSync(); } };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [userId]);

    /* 📡 離線紀錄補送 —— 全域掛載（App 啟動 + 每次網路恢復）。
       ⚠ 原本補送只掛在 <SyncStatusIndicator>，而它僅 render 於跑步頁與計劃頁：
         在地下室／隧道離線跑完 → 存進 IndexedDB → 回家連上網卻沒再進跑步頁，
         那筆紀錄就永遠留在本機不會上傳。改成與畫面無關，任何頁面都會補送。 */
    useEffect(() => {
        if (!userId) return;
        let cleanup = () => {};
        import('./utils/offlineSync')
            .then(({ startOfflineSync }) => { cleanup = startOfflineSync(() => userId); })
            .catch(() => {});
        return () => cleanup();
    }, [userId]);

    // 🔔 訓練提醒引擎 — 補上「完全沒有提醒/通知」的留存漏洞。
    //    登入後（有 userId）才啟動；前景排程 + 連續紀錄搶救，背景遞送交給原生層。
    //    使用者預設為「關閉」，需在設定中主動開啟，尊重通知疲勞。
    useEffect(() => {
        if (!userId) return;
        let cleanup = () => {};
        import('./utils/workoutReminders')
            .then(({ initWorkoutReminders }) => { cleanup = initWorkoutReminders(userId); })
            .catch(() => {});
        return () => cleanup();
    }, [userId]);

    // 🔗 精靈存好 profile 後會廣播 drvn:profile-updated —— loadProfile 只在掛載時跑一次（訪客不跑），
    // 不接這個的話剛完成精靈，營養頁還拿著舊的／空的 userProfile 說「先填身體數據」。
    useEffect(() => {
        const onProfileUpdated = (e) => {
            const p = e?.detail;
            if (!p || typeof p !== 'object') return;
            // 只收目前登入帳號的資料，避免換帳號時被舊事件蓋掉
            const uid = getUserId();
            if (p.user_id && uid && p.user_id !== uid) return;
            setUserProfile((prev) => ({ ...(prev && prev.user_id === p.user_id ? prev : {}), ...p }));
        };
        window.addEventListener('drvn:profile-updated', onProfileUpdated);
        return () => window.removeEventListener('drvn:profile-updated', onProfileUpdated);
    }, []);

    // 📊 推播點擊追蹤 — 原生點通知導頁前會廣播 drvn:push-open，這裡上報 push_open
    //    （上市後回答：「推播文案到底有沒有人點？哪一種點位最有效？」）
    useEffect(() => {
        const onPushOpen = (e) => {
            import('./utils/telemetry')
                .then(({ track }) => track('push_open', { route: e?.detail?.route || '' }))
                .catch(() => {});
        };
        window.addEventListener('drvn:push-open', onPushOpen);
        return () => window.removeEventListener('drvn:push-open', onPushOpen);
    }, []);

    // 🛡️ P1 一年資料守護 — trainingRecords / currentPlan / season / 完成狀態
    //    自動雲端備份（啟動後、每 30 分鐘、切背景時），換機時本地為空自動還原。
    //    offline-first：全部 best-effort，失敗進重試佇列，絕不擋 UI。
    useEffect(() => {
        if (!userId) return;
        import('./utils/yearlyDataGuard')
            .then(({ startGuard }) => startGuard(userId))
            .catch(() => {});
    }, [userId]);

    // 📊 觀測性 — 全域錯誤攔截 + 漏斗事件（app_open / workout_completed…）
    //    自建、無第三方依賴，批次 fire-and-forget，絕不影響 UI。
    useEffect(() => {
        if (!userId) return;
        import('./utils/telemetry')
            .then(({ initTelemetry }) => initTelemetry(userId))
            .catch(() => {});
    }, [userId]);

    // 監聽 auth_token / userId 在 localStorage 的變化（同一個 tab 的 custom event）
    // AuthCallbackPage 用 window.location.replace 強制重載所以不需要這個，
    // 但 LoginPage 的「進入 App」按鈕走的是 onLoginSuccess 回調，需要這裡接住。
    // 同時處理 401 攔截器觸發的登出事件（detail.reason === '401'）
    // ─── 🚀 URL Sanitizer (Fix base path drift) ──────────────────────────
    // 如果網址出現 /login#/... 這種錯誤結構，強制校正回 /#/...
    useEffect(() => {
        // ⚠️ iOS App 打包版以 file:// 載入，pathname 是
        //    /private/var/.../WebContent/dist/index.html（既非 / 也非 /index.html），
        //    若在此情境執行下面的 location.replace('/' + hash) 會跳到 file:///#/...
        //    （沙箱外）被 WebKit 擋下 → 反覆重載 → loading 頻閃。
        //    file:// 環境下 HashRouter 已能正常運作，直接跳過這段瀏覽器專用的校正。
        const isFileProtocol = window.location.protocol === 'file:';
        if (isFileProtocol) return;

        if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
            console.warn('🚨 Detected base path drift:', window.location.pathname);
            const targetHash = window.location.hash || '#/mobile-home';
            // 強制重置基礎路徑為根目錄 /
            window.location.replace('/' + targetHash);
        }
    }, []);

    useEffect(() => {
        const handleAuthChanged = (e) => {
            const reason = e?.detail?.reason;
            if (reason === '401') {
                // Token 已過期，清除狀態並導向登入頁
                setUserId(null);
                navigate('/login', { replace: true });
                return;
            }
            const fresh = getUserId();
            setUserId(prev => prev !== fresh ? fresh : prev);
        };
        window.addEventListener('auth-changed', handleAuthChanged);
        return () => window.removeEventListener('auth-changed', handleAuthChanged);
    }, [navigate]);

    const [analysisResult, setAnalysisResult] = useState(() => readStoredJson('analysisResult'));

    // Save state changes
    useEffect(() => {
        if (userProfile) localStorage.setItem('userProfile', JSON.stringify(userProfile));
        if (userId) localStorage.setItem('userId', userId);
        if (selectedCoach) localStorage.setItem('selectedCoach', JSON.stringify(selectedCoach));
        if (analysisResult) localStorage.setItem('analysisResult', JSON.stringify(analysisResult));
    }, [userProfile, userId, selectedCoach, analysisResult]);

    // Backend Check & Profile Sync
    useEffect(() => {
        const check = async () => {
            const healthy = await checkBackendHealth();
            setIsBackendReady(healthy);
        };

        const loadProfile = async () => {
            if (userProfile) return; // Already loaded
            // ── 只讀取當前登入使用者的 profile，不再抓取全部使用者資料 ──
            // 舊版使用 /api/user/profiles 並取「最新更新」的那個，
            // 會導致 userId 被覆蓋成其他使用者，造成名稱/資料混用。
            const currentUid = getUserId();
            // 訪客不需要從後端載入 profile
            if (!currentUid || currentUid.startsWith('guest_')) return;
            try {
                const { API_BASE_URL } = await import('./config/api');
                const token = localStorage.getItem('auth_token');
                const res = await fetch(`${API_BASE_URL}/api/user/profile/${currentUid}`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                if (res.ok) {
                    const profile = await res.json();
                    if (profile && profile.user_id) {
                        setUserProfile(profile);
                        // ⚠️ 不再 setUserId(profile.user_id)：userId 只由 JWT 決定，
                        // 避免後端資料把 userId 覆蓋成舊值
                        if (location.pathname === '/') {
                            navigate('/mobile-home');
                        }
                    }
                }
            } catch (e) {
                console.error("Failed to load profile", e);
            }
        };

        check();
        loadProfile();

        // 🩹 P7-1(耗電): 原本每 5 秒 poll 後端健康、永不停止。
        // 改為：未連上時 5s → 10s → 20s → 40s → 60s 指數退避；
        // 連上後停止輪詢，只在「回到前景」時再確認一次（斷線由各 API 呼叫自然偵測）。
        let stopped = false;
        let timerId = null;
        let delay = 5000;
        const loop = async () => {
            if (stopped) return;
            const healthy = await checkBackendHealth();
            setIsBackendReady(healthy);
            if (healthy) return;             // 連上就收工，不再燒電
            delay = Math.min(delay * 2, 60000);
            timerId = setTimeout(loop, delay);
        };
        timerId = setTimeout(loop, delay);

        const onVisible = () => {
            if (document.visibilityState === 'visible') {
                delay = 5000;
                check();                      // 回前景重新確認一次
            }
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            stopped = true;
            if (timerId) clearTimeout(timerId);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, []);

    // 📦 InBody 換機不失憶
    // ────────────────────────────────────────────────────────────
    // 後端一直都有完整的 InBody 紀錄，但「讀」這一側從來沒有人把它拉回來 ——
    // 20 多支引擎（營養、TDEE、體態預測、成就、訓練焦點…）讀的都是
    // localStorage 的 inbody_local_<uid>。換手機或重灌之後那個 key 是空的，
    // App 就當作你從來沒量過。這一步把後端的紀錄填回同一個快取，
    // 那些引擎一行都不用改。拉不到就維持現狀，下次開機再試。
    useEffect(() => {
        const uid = userId || getUserId();
        if (!uid) return;
        import('./utils/inbodyStore')
            .then((m) => m.hydrateInBody(uid))
            .catch(() => { /* 離線 / 後端冷啟動：用本機既有的就好 */ });
        // 同理：專項計劃「做到第幾次」也只存在本機，換裝置就歸零。
        import('./utils/specialPlanProgress')
            .then((m) => m.hydratePlanProgress(uid))
            .catch(() => { /* 拉不到就用本機的，改動時會自己再推一次 */ });
    }, [userId]);

    // --- Handlers ---

    const handleExpertUpload = async (e) => {
        if (!isBackendReady) return;
        const files = e.target.files;
        if (files && files.length > 0) {
            setProcessingProgress(10);
            try {
                await uploadExpertVideo(files);
                setProcessingProgress(100);
                setTimeout(() => {
                    setProcessingProgress(0);
                    navigate('/profile');
                }, 500);
            } catch (error) {
                console.error("Expert upload failed", error);
                toast.error("建立示範範本失敗，請稍後再試");
                setProcessingProgress(0);
            }
        }
    };

    const handleProfileSubmit = (profile, shouldNavigate = true) => {
        setUserProfile(profile);
        // 🟠 Fix: 只在 profile 帶有合法 user_id 才更新；
        //   否則表單 save 時送進來的 data 沒有 user_id，
        //   會把 userId 設為 undefined → ProtectedRoute 把使用者踢回 /login。
        if (profile && profile.user_id) {
            setUserId(profile.user_id);
        }
        if (shouldNavigate) navigate('/dashboard');
    };

    const handleCoachSelect = (coach) => {
        setSelectedCoach(coach);
        navigate('/upload');
    };

    const handleUserUpload = async (e) => {
        if (!isBackendReady) return;
        const file = e.target.files[0];
        if (file) {
            setProcessingProgress(10);
            // navigate('/processing'); // Optional: Could allow staying on same page with overlay

            try {
                const interval = setInterval(() => {
                    setProcessingProgress(p => (p < 90 ? p + 5 : p));
                }, 500);

                const result = await uploadUserVideo(
                    file,
                    isSideView,
                    userId,
                    selectedCoach?.coach_id
                );

                clearInterval(interval);
                setProcessingProgress(100);
                setAnalysisResult(result); // Saved to localStorage via effect

                setTimeout(() => {
                    setProcessingProgress(0);
                    navigate('/result');
                }, 500);

            } catch (error) {
                console.error("User upload failed", error);
                toast.error("分析失敗，請稍後再試");
                setProcessingProgress(0);
            }
        }
    };

    const handleAddExpertVideos = async (e) => {
        // ... same logic ...
        if (!isBackendReady) return;
        const files = e.target.files;
        if (files && files.length > 0) {
            setProcessingProgress(10);
            try {
                const result = await addExpertVideos(files);
                setProcessingProgress(100);
                toast.success(`計劃已更新，新增 ${result.new_reps} 次示範`);
                setTimeout(() => {
                    setProcessingProgress(0);
                }, 500);
            } catch (error) {
                // ...
                setProcessingProgress(0);
            }
        }
    };

    const resetApp = () => {
        // Clear local storage if we want a full reset? Or just nav home?
        // Let's just navigate home for now, or clear analysis result
        setAnalysisResult(null);
        navigate('/dashboard');
    };

    const fullReset = () => {
        localStorage.clear();
        setUserProfile(null);
        setUserId(null);
        navigate('/login');
    }

    // Determine 'Step' for UI Indicator (Mapping routes to steps)
    const getStep = (path) => {
        if (path.includes('welcome')) return 1;
        if (path.includes('profile')) return 2;
        if (path.includes('dashboard')) return 2.5; // Actually 2.5 in old app
        if (path.includes('coach')) return 3;
        if (path.includes('upload')) return 4;
        if (path.includes('result') || path.includes('ar')) return 5;
        return 0;
    };

    const currentStep = getStep(location.pathname);

    return (
        /* ♿ 全站 reduced-motion 底線（DRVN UIUX Definition §2.5）
           稽核發現 63 個一級頁面裡只有 2 頁做了處理。
           MotionConfig reducedMotion="user" 會讓所有 framer-motion 動畫
           自動遵守使用者的系統設定（前庭功能障礙者看到大量位移動畫會頭暈／噁心）。
           CSS 動畫端由 styles/design-tokens.css 的 @media 區塊負責。
           這是可及性底線，不是加分項。 */
        <MotionConfig reducedMotion="user">
        <RecoveryProvider>
            <EventBusProvider>
                <WKWebViewRepaintFix />
                {/* ⌚ Apple Watch workout sync — saves GYM_DONE events to backend */}
                <WatchWorkoutSync userId={userId} />
                <WatchCardioSync />
                {/* Global Processing Spinner */}
                {processingProgress > 0 && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(45, 41, 38, 0.95)' }}>
                        <ProcessingSpinner
                            progress={processingProgress}
                            title="Processing..."
                            subtitle="Analyzing biomechanics"
                        />
                    </div>
                )}

                {/* Suspense wraps all lazy routes — shows a minimal spinner while the chunk loads */}
                {/* RouteErrorBoundary：任一頁 render 例外時降級成友善錯誤頁，而非整頁白畫面。
                    以 location.pathname 當 key → 切換頁面時自動清除錯誤狀態。 */}
                <RouteErrorBoundary key={location.pathname}>
                {/* ★ v2.4 開場只留一段動畫。
                    原本會連放三段：原生 splash（Swift DRVNLoadingView）→
                    這裡的 RunningLoader「LOADING DRVN」→ SunlightIntro「登入成功」。
                    原生 splash 還蓋在上面時，這裡再放一次 loading 是純粹的浪費，
                    使用者只會覺得「怎麼一直在轉」。→ 改用透明佔位。 */}
                <Suspense fallback={<BootFallback />}>
                    {/* AnimatePresence 已移除：頁面切換不再有進/出場動畫，避免新舊頁堆疊重疊 */}
                    <Routes location={location}>
                            <Route path="/onboarding" element={<Navigate to="/onboarding-wizard" replace />} />
                            {/* 首次註冊登入後的資料初始化精靈（11 step） */}
                            <Route path="/onboarding-wizard" element={<OnboardingWizard />} />

                            {/* ── Auth Routes (public, no Layout wrapper) ── */}
                            <Route path="/login" element={
                                <LoginPage onSwitchUser={() => navigate('/profile-mobile')} onLoginSuccess={({ userId: uid, token }) => {
                                    if (uid) { setUserId(uid); localStorage.setItem('userId', uid); syncUserScope(); }
                                    if (token) localStorage.setItem('auth_token', token);
                                    // 統一走「登入成功頁」：由 SunlightIntro 判斷
                                    // （含「後端已有 profile → 跳過首次填寫精靈」的重裝情境）
                                    navigate('/sunlight-intro-mobile');
                                }} />
                            } />
                            <Route path="/auth-callback" element={<AuthCallbackPage />} />

                            <Route path="/" element={<Layout step={currentStep} isBackendReady={isBackendReady} resetApp={resetApp} userId={userId} />}>

                                {/* Public / Setup Routes */}
                                {/* ★ v2.4 開機路由 —— 只認「使用者真的選過登入方式」。
                                    舊版看 userId / auth_token 有沒有值，但那兩個都可能是
                                    getUserId() 自動生出來的訪客身分 → 使用者從沒看過登入頁，
                                    卻直接被帶進「登入成功」。現在改用 hasSignedIn()。 */}
                                <Route index element={<Navigate to={
                                    hasSignedIn() ? '/mobile-home' : '/login'
                                } replace />} />

                                {/* welcome 路由已移除 Golden Template 頁面，直接導向 login */}
                                <Route path="welcome" element={<Navigate to="/login" replace />} />

                                <Route path="sunlight-intro-mobile" element={
                                    <SwissRoute>
                                        <SunlightIntro />
                                    </SwissRoute>
                                } />

                                <Route path="profile" element={
                                    <SwissRouteLateral className="max-w-2xl mx-auto w-full">
                                        <UserProfileForm onSubmit={handleProfileSubmit} onSkip={() => navigate('/dashboard')} />
                                    </SwissRouteLateral>
                                } />

                                {/* Analysis Choice Screen */}
                                <Route path="analysis-choice" element={<Navigate to="/analysis-choice-mobile" replace />} />

                                {/* Protected Routes */}
                                <Route path="dashboard" element={<Navigate to="/mobile-home" replace />} />

                                {/* 🟡 Cleanup(dead-route): 移除 "dashboard-old" 備份路由
                                    （全專案無任何 navigate / Link 連到它，註解亦標明為 backup）。
                                    其元件 RecommendationsView 若日後需要可從 git 歷史取回。 */}

                                <Route path="body-analysis" element={<Navigate to="/body-analysis-mobile" replace />} />

                                {/* Mobile Workout Plan Routes */}
                                <Route path="workout-plan-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <WorkoutPlanGeneratorViewMobile
                                                userId={userId}
                                                onBack={() => navigate('/mobile-home')}
                                            />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                <Route path="custom-plan-builder" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <CustomPlanBuilderMobile userId={userId} />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                <Route path="custom-plans" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <CustomPlanListMobile userId={userId} />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                {/* Plan Preview Page */}
                                <Route path="plan-preview" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <PlanPreviewPageMobile />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                {/* Plan Tracking Page */}
                                <Route path="plan-tracking" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <PlanTrackingPageMobile />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                <Route path="chest-plan-preview" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <ChestPlanPreviewPageMobile />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />



                                {/* Master Journey Dashboard */}
                                <Route path="master-journey-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <MasterJourneyDashboard userId={userId} />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />
                                {/* 舊路由別名 → 導向統一的 -mobile 路由 */}
                                <Route path="master-journey" element={<Navigate to="/master-journey-mobile" replace />} />

                                {/* DirectPlanView - Alternative View */}
                                {/* Training Session Route */}
                                {/* Mobile Training Session Route */}
                                <Route path="training-session-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            {/* 💳 進階課程第 2 週起是會員：所有開始訓練的入口都經過這裡，只擋一次 */}
                                            <CourseGate day={location.state?.day || {}} userId={userId}>
                                            <WorkoutSessionViewMobile
                                                userId={userId}
                                                workoutPlan={location.state?.day || {}}
                                                onExit={() => {
                                                    /* If launched from plan-tracking, go back so it can mark the session done */
                                                    const pendingIdx = sessionStorage.getItem('pendingCompleteIdx');
                                                    if (pendingIdx !== null) {
                                                        navigate(-1);   // pendingCompleteIdx stays for PlanTrackingPageMobile to consume
                                                    } else {
                                                        navigate('/training-record-mobile');
                                                    }
                                                }}
                                                onOpenAnalysis={() => {
                                                    /* 縮小成 AI 分析浮球，記住要返回的訓練進度，再跳到動作分析頁 */
                                                    openOrb({
                                                        returnTo: '/training-session-mobile',
                                                        returnState: { day: location.state?.day || {} },
                                                        analysisTo: '/exercise-selector-mobile',
                                                        label: '分析準備中',
                                                    });
                                                    navigate('/exercise-selector-mobile', { state: { fromWorkout: true } });
                                                }}
                                            />
                                            </CourseGate>
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                <Route path="freestyle-training-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <FreestyleStartView />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                {/* 跑步記憶：跑點與常跑路線 */}
                                <Route path="run-memory-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <RunMemoryPage />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                {/* 健身房記憶地圖：去過哪些健身房、器材有／沒有 */}
                                <Route path="gym-memory-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <GymMemoryPage />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                <Route path="exercise-library-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <CustomExerciseLibraryViewMobile />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                <Route path="smart-trainer" element={<Navigate to="/smart-trainer-mobile" replace />} />

                                <Route path="nutrition-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <NutritionPageMobile userId={userId} userProfile={userProfile} />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />
                                <Route path="cardio-tracker" element={<Navigate to="/cardio-tracker-mobile" replace />} />

                                <Route path="coach" element={<Navigate to="/coach-mobile" replace />} />

                                <Route path="upload" element={<Navigate to="/upload-mobile" replace />} />

                                <Route path="result" element={<Navigate to="/result-mobile" replace />} />

                                <Route path="ar" element={<Navigate to={FLAGS.arAnalysis ? '/ar-mobile' : '/mobile-home'} replace />} />

                                {FLAGS.arAnalysis ? (
                                    <Route path="ar-mobile" element={
                                        <ProtectedRoute userId={userId}>
                                            <SwissRoute>
                                                <ARViewMobile videoUrl={analysisResult?.arVideoUrl} repSegments={analysisResult?.repSegments} />
                                            </SwissRoute>
                                        </ProtectedRoute>
                                    } />
                                ) : (
                                    <Route path="ar-mobile" element={<Navigate to="/mobile-home" replace />} />
                                )}

                                {/* AI 姿態分析 (Edge Computing) — V1 以 feature flag 延後 */}
                                {FLAGS.poseAnalyzer ? (
                                    <Route path="pose-analyzer" element={
                                        <ProtectedRoute userId={userId}>
                                            <PoseAnalyzerMobile />
                                        </ProtectedRoute>
                                    } />
                                ) : (
                                    <Route path="pose-analyzer" element={<Navigate to="/mobile-home" replace />} />
                                )}

                                {/* InBody 設定改由 body-analysis-mobile（BodyAnalysisViewMobile）統一處理，舊 inbody-setup 路由已移除 */}


                                {/* dashboard-mobile 與 mobile-home 重複 → 收斂為單一入口 */}
                                <Route path="dashboard-mobile" element={<Navigate to="/mobile-home" replace />} />

                                {/* Restore Legacy Social Route */}
                                {/* 🤝 好友頁（協作/PK/名冊/好友最近訓練）— 從 git 還原的 SocialPage，
                                    上架前清理時被誤刪；接 /api/social/friends + challenge 完整 API */}
                                <Route path="social" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <SocialPage userProfile={userProfile} />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                <Route path="mobile-home" element={
                                    <ProtectedRoute userId={userId}>
                                        <ActionFirstDashboardMobile
                                            userId={userId}
                                            userProfile={userProfile}
                                            userName={userProfile?.name}
                                        />
                                    </ProtectedRoute>
                                } />

                                {/* Mobile Cardio Routes */}
                                <Route path="cardio-tracker-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <CardioTrackerMobile />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                {/* ── Since Day 1 完整進化頁 ── */}
                                <Route path="journey-evolution-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRouteLateral>
                                            <JourneyEvolutionPage />
                                        </SwissRouteLateral>
                                    </ProtectedRoute>
                                } />

                                {/* ── 訓練重點 → 完整計劃引導（跑步/重訓/營養一次配好） ── */}
                                <Route path="training-focus" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRouteLateral>
                                            <TrainingFocusPlannerMobile userId={userId} />
                                        </SwissRouteLateral>
                                    </ProtectedRoute>
                                } />

                                {/* ── Cardio Plan Builder & Microcycle Inbox ── */}
                                <Route path="cardio-plan-builder" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <CardioPlanBuilder onClose={() => navigate(-1)} />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />
                                <Route path="cardio-microcycle-inbox" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <CardioMicrocycleInbox onClose={() => navigate('/cardio-tracker-mobile')} />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />
                                <Route path="cardio-week-settlement" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <WeekSettlementSheet onClose={() => navigate(-1)} />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />
                                <Route path="cardio-brick-detail" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <CardioBrickDetailSheet onClose={() => navigate(-1)} />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />
                                <Route path="cardio-plan-editor" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <CardioPlanEditor onClose={() => navigate(-1)} />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                <Route path="weekly-recap/week/:weekNumber/insights-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <WeeklyInsightsDetailMobile />
                                    </ProtectedRoute>
                                } />

                                {/* Analysis Flow Mobile Routes */}
                                {/* 舊版 ProgressViewMobile 已移除，/progress-mobile 轉址至首頁 */}
                                <Route path="progress-mobile" element={<Navigate to="/mobile-home" replace />} />

                                <Route path="analysis-choice-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <AnalysisChoiceMobile />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                <Route path="pose-validation-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <PoseValidationMobile />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                <Route path="exercise-selector-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <ExerciseSelectorMobile />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                <Route path="exercise-history-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <ExerciseHistoryMobile />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                <Route path="template-upload-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <TemplateUploadMobile />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                <Route path="coach-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <CoachSelectorMobile
                                                userProfile={userProfile}
                                                onSelect={(coach) => {
                                                    setSelectedCoach(coach);
                                                    navigate('/upload-mobile');
                                                }}
                                                onSkip={() => {
                                                    setSelectedCoach(null);
                                                    navigate('/upload-mobile');
                                                }}
                                                onBack={() => navigate('/analysis-choice-mobile')}
                                            />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                <Route path="upload-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <UploadMobile
                                                userId={userId}
                                                selectedCoach={selectedCoach}
                                                onAnalyzeComplete={(result) => {
                                                    setAnalysisResult(result);
                                                    navigate('/result-mobile', { state: { result } });
                                                }}
                                            />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                {/* ⌚ 跑步結算頁（單次沉浸結算）：目前唯一入口是手錶回傳
                                     window.receiveWatchCardioData；app 內結束跑步是由
                                     CardioTrackerMobile 內嵌渲染同一個元件。 */}
                                <Route path="cardio-results-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <CardioResultsMobile />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />
                                <Route path="result-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <ResultViewMobile />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />
                                {/* 🆕 該次重訓的結果頁（從最新動態卡點進來；含「分享成果」三張卡選擇頁） */}
                                <Route path="strength-session-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRouteLateral>
                                            <StrengthSessionDetailMobile />
                                        </SwissRouteLateral>
                                    </ProtectedRoute>
                                } />
                                <Route path="running-analytics-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <RunningAnalyticsMobile />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />
                                <Route path="running-analysis-mobile/:sessionId" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <RunningAnalysisMobile />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />
                                <Route path="cardio-history-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <CardioHistoryMobile />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />
                                {FLAGS.segmentExplorer ? (
                                    <Route path="segment-explorer-mobile" element={
                                        <ProtectedRoute userId={userId}>
                                            <SwissRoute>
                                                <SegmentExplorerMobile />
                                            </SwissRoute>
                                        </ProtectedRoute>
                                    } />
                                ) : (
                                    <Route path="segment-explorer-mobile" element={<Navigate to="/mobile-home" replace />} />
                                )}

                                {/* ❌ /hashtag-setup 已移除（2026-09 社群稽核）—— 同樣零導航進不去。
                                    標籤選擇實際發生在發文流程的 IGPostComposer 裡。 */}

                                {/* Phase2Demo disabled - using HashtagSetupPage instead
                        <Route path="phase2-demo" element={
                            <ProtectedRoute userId={userId}>
                                <SwissRoute>
                                    <Phase2Demo userId={userId} />
                                </SwissRoute>
                            </ProtectedRoute>
                        } />
                        */}

                                {/* Luxury Sports Car Cockpit Plan View (NEW) */}
                                {/* Training Log & Analytics Page (NEW) */}
                                <Route path="training-log" element={<Navigate to="/training-log-mobile" replace />} />

                                <Route path="training-log-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <TrainingLogPageMobile userId={userId} />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                {/* ❌ /activity-feed 已移除（2026-09 社群稽核）
                                    全專案沒有任何 navigate 或連結指向它 —— 使用者永遠到不了。
                                    動態牆的正式入口是底部導覽的「社群」→ /social-mobile。 */}

                                {/* Training Record Pages */}
                                <Route path="training-record-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <TrainingRecordPageMobile userId={userId} />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                {/* MERGED: Social Hub (Redirects for legacy links) */}
                                <Route path="/social-mobile" element={<SocialHubMobile />} />
                                <Route path="/evolution-matrix-MOBILE" element={<EvolutionMatrixPage />} />
                                <Route path="/social-share-preview" element={<SharePreviewModal />} />
                                <Route path="/community-mobile" element={<Navigate to="/social-mobile" replace />} />
                                {/* 舊版行動挑戰頁 ChallengesViewMobile 已停用，功能併入 social-mobile Hub（動態/排行/社團）。
                                    /challenges-mobile 一律轉址至社群 Hub。 */}
                                <Route path="/challenges-mobile" element={<Navigate to="/social-mobile" replace />} />

                                {/* Capsule Navigation Items */}
                                <Route path="luxury-plan-view-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <LuxuryPlanViewMobile
                                                userId={userId}
                                                onStartWorkout={(day) => {
                                                    navigate('/training-session-mobile', { state: { day } });
                                                }}
                                                onBack={() => navigate('/mobile-home')}
                                            />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                {/* Profile Mobile */}
                                <Route path="profile-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <UserProfileFormMobile onSubmit={handleProfileSubmit} userProfile={userProfile} />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                {/* Body Analysis Mobile */}
                                <Route path="body-analysis-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <BodyAnalysisViewMobile userId={userId} onBack={() => navigate(-1)} />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                {/* Power PR Tracker Mobile */}
                                <Route path="power-pr-tracker-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <PowerPRTrackerMobile userId={userId} />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                {/* 🟢 最新動態時間軸（近30天所有運動） */}
                                <Route path="activity-feed-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <ActivityFeedMobile userId={userId} />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                {/* 🏆 PR 檔案（公里制）— 各距離現任 PR + 歷年進程折線 */}
                                <Route path="pr-profile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <PRProfilePage userId={userId} />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                {/* 🤝 /friends-mobile → 統一導向好友頁（SocialPage） */}
                                <Route path="friends-mobile" element={<Navigate to="/social" replace />} />

                                {/* Challenges Mobile 已移除（併入 social-mobile Hub），路由於上方統一轉址 */}

                                {/* Community/Social Feed Mobile → 收斂至單一社群 Hub */}
                                <Route path="community-mobile" element={<Navigate to="/social-mobile" replace />} />

                                {/* Gym Bag Mobile */}
                                <Route path="gym-bag-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <GymBagViewMobile />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                {/* Sonic Focus Mobile */}
                                <Route path="sonic-focus-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <SonicFocusViewMobile />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                {/* Coach QA Mobile */}
                                <Route path="coach-qa-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <CoachQAViewMobile />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                {/* Weekly Recap Mobile */}
                                <Route path="weekly-recap-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <WeeklyRecapViewMobile />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                {/* Monthly Deep Analysis Report */}
                                <Route path="monthly-report-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <MemberPageGate feature="monthlyReport" label="看這個月的月報">
                                                <MonthlyReportPage />
                                            </MemberPageGate>
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />
                                {/* 舊路由別名 → 導向統一的 -mobile 路由 */}
                                <Route path="monthly-report" element={<Navigate to="/monthly-report-mobile" replace />} />

                                {/* Personality Mobile */}
                                <Route path="personality-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <PersonalityViewMobile />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                {/* Smart Trainer Mobile */}
                                <Route path="smart-trainer-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <SmartTrainerModeMobile />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                {/* Power PR Tracker (LOEWE Morandi) */}
                                {/* Fitness Community */}
                                <Route path="fitness-community-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <FitnessCommunityPage userId={userId} />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                {/* Gear Garage */}
                                <Route path="gear-garage-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <GearGaragePage userId={userId} />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                {/* Social Community (Phase 2) → 收斂至單一社群 Hub */}
                                <Route path="community" element={<Navigate to="/social-mobile" replace />} />

                                {/* Challenges View (Community Challenges & Clubs) */}
                                <Route path="challenges" element={<Navigate to="/social-mobile" replace />} />

                                {/* Challenge Detail View */}
                                <Route path="challenges/:challengeId" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <ChallengeDetailView userId={userId} />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                {/* Original Plan View (4-Week Plan) */}
                                {/* 舊 off-brand 原型首頁 SportsHomepage 已移除（藍黃配色、無導航入口） */}

                                {/* 舊桌面版 SonicFocusView 已移除，統一使用 /sonic-focus-mobile */}

                                <Route path="gym-bag" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRouteLateral direction={1}>
                                            <GymBagView />
                                        </SwissRouteLateral>
                                    </ProtectedRoute>
                                } />

                                <Route path="running-analysis/:sessionId" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRouteScale>
                                            <RunningAnalysisMobile />
                                        </SwissRouteScale>
                                    </ProtectedRoute>
                                } />

                                {/* Running Analytics — 桌機版已淘汰，統一導向手機版 */}
                                <Route path="running-analytics" element={
                                    <Navigate to="/running-analytics-mobile" replace />
                                } />

                                {/* Redirect old path to new */}
                                <Route path="running-history" element={
                                    <Navigate to="/running-analytics-mobile" replace />
                                } />

                                {/* Weekly Recap - Story Flow  */}
                                {/* 舊桌面版 WeeklyInsightsDetail 已移除，統一使用 insights-mobile */}

                                {/* Fitness Personality Page */}
                                <Route path="personality" element={<Navigate to="/personality-mobile" replace />} />



                                {/* Cardio Evolution Trends View */}
                                <Route path="running-trend-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <SwissRoute>
                                            <CardioTrendView />
                                        </SwissRoute>
                                    </ProtectedRoute>
                                } />

                                {/* Login / Settings Mobile — Dev 工具（User ID 切換器），正式版自動移除 */}
                                {FLAGS.devTools ? (
                                    <Route path="login-settings-mobile" element={
                                        <ProtectedRoute userId={userId}>
                                            <LoginSettingsMobile />
                                        </ProtectedRoute>
                                    } />
                                ) : (
                                    <Route path="login-settings-mobile" element={<Navigate to="/mobile-home" replace />} />
                                )}

                                {/* ⌚ Apple Watch 結算頁 — Watch DONE → 打卡 */}
                                <Route path="watch-workout-done-mobile" element={
                                    <ProtectedRoute userId={userId}>
                                        <WatchWorkoutDonePage userId={userId} />
                                    </ProtectedRoute>
                                } />
                                {/* 舊路由別名 → 導向統一的 -mobile 路由 */}
                                <Route path="watch-workout-done" element={<Navigate to="/watch-workout-done-mobile" replace />} />

                                {/* 🕳️ 兜底：打錯或已移除的路徑一律回首頁。
                                     沒有這條時，navigate 到不存在的路由會渲染成全白畫面
                                     （使用者只看得到白屏，沒有任何線索）。 */}
                                <Route path="*" element={<Navigate to="/mobile-home" replace />} />

                            </Route>
                    </Routes>
                </Suspense>
                </RouteErrorBoundary>

                {/* 🧭 新手教學聚光燈引導 —— 必須放在 <Routes> 之外！
                     App 的 <Routes> 有 key={location.pathname}，每次跳轉會整棵重建，
                     放在 Layout 或任何路由內的組件都會被卸載 → 教學畫面消失。
                     放這裡（Provider 層）才不受路由 key 重建影響，跨頁教學得以持續。
                     由首頁的指南針按鈕透過 window 全域事件觸發。*/}
                <OnboardingSpotlight />

                {/* 🔮 AI 分析浮球（Liquid Glass）— 暫停訓練→AI 分析時縮小成浮球，
                     跳到動作分析頁；分析完成後點浮球返回原訓練進度。
                     放在 <Routes> 之外，跨頁不被卸載。 */}
                <AIAnalysisOrb />

                {/* ✨ Swiss Moment — 滿版瑞士極簡儀式感回饋（連續開啟/全完成/前幾次里程碑）。
                     全域事件驅動（momentEngine.fireMoment），放 <Routes> 之外跨頁可用。 */}
                <SwissMoment />

                {/* 💳 會員付費牆 —— 任何畫面 openPaywall(feature) 打開，放 <Routes> 之外跨頁可用。 */}
                <MembershipSheet />
                <MembershipPlanSheet />
                <MembershipSurvey />
                <MemberWelcomeSheet />

                {/* ─── 待機畫面 — 閒置 3 分鐘進入，連點兩下解除 ───
                    （註解原本寫 15 秒，但 useStandbyTrigger 的 IDLE_MS 是 180_000 = 3 分鐘）
                    改成 lazy 之後要用 Suspense 包住；fallback 給 null —— 待機畫面本來就是
                    悄悄浮現的，載入那一瞬間不該閃一個 loading 出來。 */}
                {standbyVisible && (
                    <Suspense fallback={null}>
                        <StandbyScreen
                            userId={userId || 'guest'}
                            isActiveWorkout={isActiveWorkout}
                            onExit={() => setShowStandby(false)}
                        />
                    </Suspense>
                )}
            </EventBusProvider>
        </RecoveryProvider>
        </MotionConfig>
    );
}


