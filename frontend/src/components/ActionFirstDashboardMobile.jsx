import './TrainingSystemGlass.css';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { getTodayAgenda, loadWeekInputs, cacheWeekBricks, applyTodayRealDone, logicalDayKey, defaultStrengthWeekdays } from '../utils/dailyAgenda';
import { pickGreeting } from '../utils/greeting';

// 🎨 稱號屬性 → 瑞士極簡配色（沉穩低飽和，襯 Cormorant Garamond 斜體）
//    running=赭金（耐力的土地色）、fitness=陶土（鐵與力量）、hybrid=石板藍（雙棲）
const TITLE_TAG_COLORS = { running: '#A98307', fitness: '#C05F3C', hybrid: '#5E6E8C', run: '#A98307', strength: '#C05F3C' };
// 呼吸光專用的「亮版」色 —— 原色偏暗會看起來像陰影；光暈用更亮更飽和的版本才像「光」。
const TITLE_GLOW_COLORS = { running: '#E4B43C', fitness: '#F0885E', hybrid: '#8FA6D6', run: '#E4B43C', strength: '#F0885E' };
// 🏷️ 稱號顯示名 — 走「簡易 ○○型」風格（依屬性），不用花俏的詩意稱號
/* ⚠️ 這張表把稱號蓋成「耐力型／力量型／全能型」三個字。
   稱號改成成就等級之後（業餘賽選手／鑽石聯賽／IFBB 職業卡…），
   再套這張表等於把使用者辛苦爬到的那一階名字丟掉，只剩一個分類。
   稱號就顯示稱號本身。 */
/* 介面標準 §7：儀式型動畫在使用者要求減少動態時必須直接跳過。
   稱號的手繪底線是「畫出來」的動作，屬於這一類。 */
const reduceMotion = typeof window !== 'undefined'
    && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
const titleTagColor = (ft) => TITLE_TAG_COLORS[ft?.category] || '#8A8478';
const titleGlowColor = (ft) => TITLE_GLOW_COLORS[ft?.category] || '#B8B0A0';
import CountUp from './ui/CountUp';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { resolveDisplayName } from '../utils/auth';
import { Zap, Flame, Clock, Trophy, Calendar, ChevronRight, ChevronLeft, Apple, Activity, Music, User, Scan, MapPin, Play, Pause, MoreHorizontal, Target, Utensils, Moon, Sun, SkipForward, X, EyeOff, Lock, Plus } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import apiClient from '../api/client';
import { fetchMuscleRecoveryScores } from '../utils/muscleRecoveryTracker';
import { getTodayReadiness, readinessLabel, readinessSourceLine } from '../utils/readiness';
import { uStorage } from '../utils/userStorage';
import HomeEditableBlock from './HomeEditableBlock';
import { HOME_CARDS, HOME_CARDS_EVENT, getHiddenHomeCards, hideHomeCard, restoreHomeCard } from '../config/homeCards';
import { formatRelativeDay } from '../utils/scheduleTime';
import { buildHomeAlerts, buildHomeAlertsPreview, alertDwellMs } from '../utils/homeAlerts';
import { haptic, hapticSelectionChanged } from '../utils/haptics';
import { refreshRecapState, isRecapUnlocked, hasNewSettlement } from '../utils/monthlyRecap';

// 預覽模式：顯示全部類別的提示假資料（跑步/健身/營養/社群），方便瀏覽設計。
// 上線改 false 即走真實事件聚合。
const HOME_ALERTS_PREVIEW = false;

// 🈶 訓練分化名稱中文化 — 主頁「今日焦點」卡與週曆議程卡共用。
//    常見英文分化名（Push/Pull/Legs/Chest…含 "Day A" 尾綴、「胸部 (Chest)」括號形式）
//    一律轉中文；已是中文原樣保留（僅去掉尾端英文括號註記）。
const zhSplitTitle = (t) => {
    if (!t) return t;
    const s = String(t).trim();
    if (/[一-鿿]/.test(s)) {
        return s.replace(/\s*\([A-Za-z\s&/+-]+\)\s*$/, '').trim() || s;
    }
    const ZH = {
        'push': '推力訓練', 'pull': '拉力訓練', 'legs': '腿部訓練', 'leg': '腿部訓練',
        'upper': '上肢訓練', 'upper body': '上肢訓練', 'lower': '下肢訓練', 'lower body': '下肢訓練',
        'full body': '全身訓練', 'fullbody': '全身訓練', 'full-body': '全身訓練',
        'chest': '胸部訓練', 'back': '背部訓練', 'shoulders': '肩部訓練', 'shoulder': '肩部訓練',
        'arms': '手臂訓練', 'arm': '手臂訓練', 'biceps': '二頭訓練', 'triceps': '三頭訓練',
        'core': '核心訓練', 'abs': '腹部訓練', 'glutes': '臀部訓練', 'glute': '臀部訓練',
        'quads': '股四頭訓練', 'hamstrings': '腿後側訓練', 'cardio': '有氧訓練', 'rest': '休息日',
        'strength': '肌力訓練', 'hypertrophy': '增肌訓練', 'foundation': '基礎訓練',
    };
    const key = s.toLowerCase()
        .replace(/^day\s*\d+\s*[·:.-]?\s*/, '')
        .replace(/\s*day\s*[a-z0-9]*$/, '')
        .replace(/\s*(workout|training|session)$/, '')
        .trim();
    return ZH[key] || s;
};
import { dismissLeaguePromotion } from '../utils/leaguePromotionReminder';
// 🎨 任務類別色彩（圖二今日議程卡的任務區隔用；App 內提醒卡牌已依需求移除，
//    每日提醒改由 iOS 桌面小工具承擔 → ios/RunWidget/DailyPromptWidget.swift）
import { categoryStyle } from '../utils/taskCategories';
import { pushDailyWidgetData } from '../utils/widgetBridge';
import { recordAppOpen, recordAllDone, afterMomentIdle } from '../utils/momentEngine';
// 🚀 上架收斂：DevMomentPreview（DEV 預覽鈕）已自主頁移除
import { runWeeklyReview } from '../utils/weeklyPlanReview';
import WeeklyBlockProposal from './WeeklyBlockProposal';
// ⏱️ 誠實時長估算（含換器械緩衝+暖身）：修正引擎 day.time 過於樂觀的問題
import { estimateDayMinutes } from '../utils/workoutTimeEstimate';
import AcidBentoCard from './ui/AcidBentoCard';
import BespokeAmbientGlow from './ui/BespokeAmbientGlow';
import WeatherCard from './ui/WeatherCard';
import EvolutionDashboard from './EvolutionDashboard';
import CapsuleNavigation from './CapsuleNavigation';
import { ONBOARDING_EVENT } from './OnboardingSpotlight';
import { resetOnboarding, isOnboardingDone } from '../utils/onboardingState';

// 🎓 教學用示範課表：新用戶教學期間還沒生成真實計劃時，用這份 demo 讓畫面有內容可示範。
//    教學完成後就改顯示「生成你的計劃」空狀態（瑞士極簡）。
const DEMO_TODAY_WORKOUT = {
    workout_name: '示範課表 · 拉力強化',
    focus: '背·二頭 (示範)',
    is_rest_day: false,
    is_demo: true,
    exercises: [
        { name: '引體向上', sets: 3, reps: '8-12', rest: '90s', target: '背部闊度', tier: 1 },
        { name: '槓鈴划船', sets: 3, reps: '8-12', rest: '90s', target: '背部厚度', tier: 1 },
        { name: '坐姿划船', sets: 3, reps: '10-12', rest: '75s', target: '中背', tier: 2 },
        { name: '啞鈴彎舉', sets: 3, reps: '12-15', rest: '60s', target: '二頭肌', tier: 3 },
    ],
};
import TutorialProgressPanel from './TutorialProgressPanel';
import DailyCheckinPanel, { getTodayCheckinItems } from './DailyCheckinPanel';
import CheckinReminderOverlay from './CheckinReminderOverlay';
import RestDayHeroCard from './RestDayHeroCard';
import DailyInsightCard from './DailyInsightCard';
import HandWave from './ui/HandWave';
import { splitHint } from '../utils/hintCopy';
import { useFeaturedTitle } from '../utils/featuredTitle';
import ActivityCalendarWidget from './ActivityCalendarWidget';
import NutritionDashboardWidget from './NutritionDashboardWidget';
import WorkoutPreviewSheet from './WorkoutPreviewSheet';
import DailyCheckInModal from './DailyCheckInModal';
import { calculateFullNutrition, getLatestInBody } from '../utils/NutritionEngine';
import { committedNutritionGoals } from '../utils/nutritionTargets';
import { SwissMaskLine, SwissHairline, ease, dur } from '../utils/swissMotion.jsx';
import { RevealCard, GhostLine, GhostBlock } from './FashionReveal';
import DataPulse from './ui/DataPulse';
import { useLanguage } from '../contexts/LanguageContext';
import { toLocalDateKey, todayKey } from '../utils/localDate';
import { toZhExerciseName } from '../utils/exerciseNameZh';

// ✅ DEV TOGGLE: Set to true to enable the daily welcome screen
const ENABLE_DAILY_WELCOME = true;


// ══════════════════════════════════════════════════════════
// 🎵 Mini Vinyl Component (黑膠唱片微型組件)
// 🔵 Fix (Issue dup-vinyl): WorkoutSessionViewMobile 中有一個同功能的 MiniVinylDisc 元件。
// 兩者 API 接近但未完全對齊（此處無 platformColor，彼處無 size）。
// TODO: 未來可抽出至 src/components/ui/MiniVinylDisc.jsx 作為共用元件，統一 API。
// ══════════════════════════════════════════════════════════
const MiniVinyl = ({ img, isPlaying, size = 44, platformColor }) => (
    <motion.div
        animate={{ rotate: isPlaying ? 360 : 0 }}
        transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
        className="relative rounded-full overflow-hidden flex items-center justify-center shrink-0 shadow-lg"
        style={{
            width: size, height: size,
            background: img ? 'transparent' : '#262523',
            border: isPlaying ? `1px solid ${platformColor || 'rgba(249,92,75,0.6)'}` : '1px solid rgba(255,255,255,0.15)',
            boxShadow: isPlaying ? `0 4px 16px ${platformColor ? platformColor + '4D' : 'rgba(249,92,75,0.3)'}` : '0 2px 8px rgba(0,0,0,0.2)'
        }}
    >
        {img ? (
            <>
                <img loading="lazy" decoding="async" src={img} className="absolute inset-0 w-full h-full object-cover" alt="cover" />
                <div className="absolute inset-0 rounded-full border border-white/10" />
            </>
        ) : (
            <>
                <div className="absolute inset-0 bg-[#262523] flex items-center justify-center">
                    <div className="absolute inset-0 opacity-10 bg-[conic-gradient(from_0deg,transparent_0deg,white_45deg,transparent_90deg,transparent_180deg,white_225deg,transparent_270deg)]" />
                </div>
                <div className="absolute inset-[15%] rounded-full border border-white/5" />
                <div className="absolute inset-[30%] rounded-full border border-white/5" />
                <div className="absolute inset-0 rounded-full shadow-[inset_0_0_12px_rgba(0,0,0,0.8)]" />
            </>
        )}
        {/* Center Hole */}
        <div className="absolute w-[25%] h-[25%] rounded-full bg-black/60 backdrop-blur-sm border border-white/10 flex items-center justify-center z-10">
            <div className="w-[30%] h-[30%] bg-[#F6F4F1] rounded-full shadow-inner" />
        </div>
    </motion.div>
);

// ══════════════════════════════════════════════════════════
// HomeMusicButton — 主頁音樂播放器 Widget（模組層級）
//
// ⚠️ 設計限制說明（Issue 12）：
// 此元件透過 localStorage ('sonicfocus_playback') 讀取 SonicFocus 內建播放器狀態，
// 並透過 CustomEvent / StorageEvent 監聽更新。
//
// 它【無法】控制 Spotify、Apple Music、YouTube Music 等外部音樂 App，
// 因為 Web 標準（Web Audio API / Media Session API）僅能控制
// 當前瀏覽器 context 內的 AudioElement，無法跨 App 發送媒體控制指令。
//
// 如需整合外部音樂 App，需透過原生 iOS MediaPlayer framework 搭配
// WKWebView ↔ Swift bridge 實現，屬於原生層級功能，非前端可單獨完成。
// ══════════════════════════════════════════════════════════
const _HMB_EQ = [
    { lo: '15%', hi: '85%' }, { lo: '40%', hi: '100%' },
    { lo: '20%', hi: '65%' }, { lo: '55%', hi: '95%' },
    { lo: '10%', hi: '70%' },
];
const _HMB_EQ_TR = _HMB_EQ.map((_, i) => ({
    duration: 0.45 + i * 0.09, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut',
}));

const HomeMusicButton = React.memo(({ onHide }) => {
    const [playback, setPlayback] = useState(null);
    const [library, setLibrary] = useState([]);
    const [open, setOpen] = useState(false);
    const [btnRect, setBtnRect] = useState(null);
    const btnRef = useRef(null);
    const panelRef = useRef(null);
    const navigate = useNavigate();
    const [hideWorkoutMusic, setHideWorkoutMusic] = useState(false);

    // 🔥 Fix #4: 移除 800ms polling，改用 StorageEvent + CustomEvent 推送
    useEffect(() => {
        const sync = () => {
            const raw = localStorage.getItem('sonicfocus_playback');
            try { setPlayback(raw ? JSON.parse(raw) : null); } catch { setPlayback(null); }
            const libRaw = localStorage.getItem('sonicfocus_library');
            try {
                const parsedLib = libRaw ? (JSON.parse(libRaw).playlists || []) : [];
                const defaultTitles = ['Morning Rise', 'Power Hour', 'Zen Flow'];
                const isDefault = (title) => title && defaultTitles.some(d => title.includes(d));
                const hasCustom = parsedLib.some(p => !isDefault(p.title));
                setLibrary(hasCustom ? parsedLib.filter(p => !isDefault(p.title)) : parsedLib);
            } catch { setLibrary([]); }
            setHideWorkoutMusic(localStorage.getItem('disable_workout_music') === '1');
        };
        sync(); // 初始讀取一次
        // 跨 Tab 的 storage 變更通知
        window.addEventListener('storage', sync);
        // 同 Tab 的 custom event 通知（由 SonicFocus 寫入時 dispatch）
        window.addEventListener('sonicfocus_playback_changed', sync);
        window.addEventListener('sonicfocus-update', sync);
        return () => {
            window.removeEventListener('storage', sync);
            window.removeEventListener('sonicfocus_playback_changed', sync);
            window.removeEventListener('sonicfocus-update', sync);
        };
    }, []);

    // Capture button position when opening
    useEffect(() => {
        if (open && btnRef.current) {
            setBtnRect(btnRef.current.getBoundingClientRect());
        }
    }, [open]);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (
                panelRef.current && !panelRef.current.contains(e.target) &&
                btnRef.current && !btnRef.current.contains(e.target)
            ) setOpen(false);
        };
        // 50ms 內就關掉的話 cleanup 先跑、listener 後掛 → 永遠掛在 document 上；計時器要一起清
        const t = setTimeout(() => document.addEventListener('pointerdown', handler), 50);
        return () => { clearTimeout(t); document.removeEventListener('pointerdown', handler); };
    }, [open]);

    // always render — shows idle music icon when no playback

    const openUrl = (url) => {
        if (!url) return;
        const a = document.createElement('a');
        a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };

    const togglePlay = (e) => {
        e.stopPropagation();
        const ns = { ...playback, isPlaying: !playback.isPlaying };
        localStorage.setItem('sonicfocus_playback', JSON.stringify(ns));
        window.dispatchEvent(new Event('sonicfocus_playback_changed'));
    };

    const switchTo = (p, e) => {
        e.stopPropagation();
        const ns = { id: p.id, title: p.title, subtitle: p.subtitle, platform: p.platform, url: p.url, img: p.img, isPlaying: true };
        localStorage.setItem('sonicfocus_playback', JSON.stringify(ns));
        window.dispatchEvent(new Event('sonicfocus_playback_changed'));
        openUrl(p.url);
        setOpen(false);
    };

    const skipNext = (e) => {
        e.stopPropagation();
        if (!library.length) return;
        const idx = library.findIndex(p => p.title === playback.title);
        const next = library[idx >= 0 && idx < library.length - 1 ? idx + 1 : 0];
        if (!next) return;
        const ns = { id: next.id, title: next.title, subtitle: next.subtitle, platform: next.platform, url: next.url, img: next.img, isPlaying: true };
        localStorage.setItem('sonicfocus_playback', JSON.stringify(ns));
        window.dispatchEvent(new Event('sonicfocus_playback_changed'));
        openUrl(next.url);
    };

    const handleHide = (e) => {
        e.stopPropagation();
        localStorage.setItem('sonicfocus_hidden', '1');
        window.dispatchEvent(new Event('sonicfocus_hidden_changed'));
        setOpen(false);
        if (onHide) onHide();
    };

    const platformLabel = (p) => p === 'spotify' ? 'Spotify' : p === 'apple' ? 'Apple Music' : 'Music';

    // 安全取值
    const isPlaying = playback?.isPlaying || false;
    const currentTitle = playback?.title || 'Not Playing';
    const currentPlatform = playback?.platform || '';
    const currentImg = playback?.img || null;

    // Portal panel — rendered directly into body to escape all z-index stacking contexts
    const panelStyle = btnRect ? {
        position: 'fixed',
        top: btnRect.bottom + 12,
        right: Math.max(16, (window.innerWidth - btnRect.right) - 24),
        zIndex: 2147483647,
        width: '280px',
        background: 'rgba(14,12,13,0.96)',
        backdropFilter: 'blur(32px)',
        WebkitBackdropFilter: 'blur(32px)',
        borderRadius: '24px',
        border: '1px solid rgba(246,244,241,0.10)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
        overflow: 'hidden',
        fontFamily: '"Plus Jakarta Sans", sans-serif',
    } : {};

    const portalContent = (
        <AnimatePresence>
            {open && btnRect && (
                <motion.div
                    ref={panelRef}
                    initial={{ opacity: 0, scale: 0.94, y: -6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.94, y: -6 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    style={panelStyle}
                >
                    {/* NOW PLAYING 區塊 */}
                    <div className="p-5" style={{ borderBottom: '1px solid rgba(246,244,241,0.06)' }}>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <div className="flex items-end gap-[2px]" style={{ height: '10px' }}>
                                    {_HMB_EQ.slice(0, 3).map((b, i) => (
                                        <motion.div key={i}
                                            animate={isPlaying ? { height: [b.lo, b.hi, b.lo] } : { height: '30%' }}
                                            transition={isPlaying ? _HMB_EQ_TR[i] : { duration: 0.3 }}
                                            style={{ width: '2px', borderRadius: '1px', background: '#F95C4B', minHeight: '2px' }}
                                        />
                                    ))}
                                </div>
                                <span className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: '#F95C4B' }}>
                                    Sonic
                                </span>
                                <span className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: 'rgba(22,20,21,0.4)' }}>
                                    · Now Playing
                                </span>
                            </div>
                            <motion.button {...pressProps('icon')} onClick={e => { e.stopPropagation(); setOpen(false); }} className="w-6 h-6 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/15 transition-colors">
                                <X size={12} color="#F6F4F1" />
                            </motion.button>
                        </div>

                        <div className="flex items-center gap-4">
                            <MiniVinyl img={currentImg} isPlaying={isPlaying} size={56} />
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-black truncate leading-tight" style={{ color: '#F95C4B', fontFamily: "'Tenor Sans', sans-serif" }}>
                                    {currentTitle}
                                </div>
                                {currentPlatform && (
                                    <div className="text-[9px] font-bold uppercase tracking-widest mt-1 mb-3" style={{ color: 'rgba(246,244,241,0.4)' }}>
                                        {platformLabel(currentPlatform)}
                                    </div>
                                )}
                                <div className="flex gap-2 mt-2">
                                    <motion.button {...pressProps('pill')} onClick={togglePlay} className="flex-1 py-2 rounded-xl flex items-center justify-center " style={{ background: '#F95C4B', color: '#161415' }}>
                                        {isPlaying ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                                    </motion.button>
                                    <motion.button {...pressProps('pill')} aria-label="下一首" onClick={skipNext} className="w-10 flex items-center justify-center rounded-xl bg-white/10 text-white border border-white/10 hover:bg-white/20">
                                        <SkipForward size={12} fill="currentColor" />
                                    </motion.button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 播放清單 */}
                    <div style={{ maxHeight: '220px', overflowY: 'auto', scrollbarWidth: 'none' }} className="py-2">
                        {library.length > 0 ? library.map(p => {
                            const isActive = p.id === playback?.id || p.title === playback?.title;
                            return (
                                <div key={p.id} onClick={e => switchTo(p, e)}
                                    className="flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors active:bg-white/5"
                                    style={{ background: isActive ? 'rgba(249,92,75,0.08)' : 'transparent' }}>
                                    <MiniVinyl img={p.img} isPlaying={isActive && isPlaying} size={32} />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[12px] font-bold truncate leading-tight"
                                            style={{ color: isActive ? '#F95C4B' : '#F6F4F1', fontFamily: "'Tenor Sans', sans-serif" }}>
                                            {p.title}
                                        </div>
                                        <div className="text-[9px] uppercase tracking-widest font-bold mt-0.5"
                                            style={{ color: 'rgba(246,244,241,0.3)' }}>
                                            {platformLabel(p.platform)}{isActive ? ' · NOW PLAYING' : ''}
                                        </div>
                                    </div>
                                </div>
                            );
                        }) : (
                            <div className="px-4 py-8 flex flex-col items-center justify-center text-center">
                                <Music size={20} style={{ color: 'rgba(246,244,241,0.15)' }} className="mb-2" />
                                <span className="text-[11px] font-bold" style={{ color: 'rgba(246,244,241,0.3)' }}>
                                    Library 尚無歌單
                                </span>
                                <motion.button {...pressProps('pill')}
 onClick={(e) => { e.stopPropagation(); navigate('/sonic-focus-mobile'); setOpen(false); }}
 className="mt-4 px-4 py-1.5 rounded-full text-[12px] font-black tracking-widest bg-white/10 text-white"
 >
                                    前往新增
                                </motion.button>
                            </div>
                        )}
                    </div>

                    {/* 鍛鍊音樂設定開關 */}
                    <div className="px-5 py-4 flex items-center justify-between" style={{ borderTop: '1px solid rgba(246,244,241,0.06)' }}>
                        <div className="text-[9px] font-bold tracking-widest uppercase" style={{ color: 'rgba(246,244,241,0.4)' }}>
                            Workout Widget
                        </div>
                        <motion.button {...pressProps('row')}
 onClick={(e) => {
 e.stopPropagation();
 if (hideWorkoutMusic) {
 localStorage.removeItem('disable_workout_music');
 } else {
 localStorage.setItem('disable_workout_music', '1');
 }
 window.dispatchEvent(new Event('workout_music_pref_changed'));
 }}
 className="flex items-center gap-2 transition-opacity active:opacity-50"
 >
                            <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: hideWorkoutMusic ? 'rgba(246,244,241,0.2)' : '#F95C4B' }}>
                                {hideWorkoutMusic ? 'Hidden' : 'Visible'}
                            </span>
                        </motion.button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    return (
        <div style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
            {/* ══ 觸發按鈕 (旋轉黑膠) ══ */}
            <div
                ref={btnRef}
                onClick={() => setOpen(v => !v)}
                className="relative cursor-pointer active:scale-95 transition-transform"
                style={{ width: 44, height: 44, borderRadius: 9999 }}
            >
                <MiniVinyl img={currentImg} isPlaying={isPlaying} size={44} />
                {/* 玻璃高光罩 — 讓黑膠也讀成 liquid glass，與右側 Logo / 頭像一致 */}
                <span className="lg-dome" aria-hidden="true" />
                {/* 音樂圖示 — 永遠顯示於中央（疊在黑膠上）；圖片載入失敗才 fallback 到 lucide Music */}
                <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                    <img
                        src="/icon/musicicon.png"
                        alt="Music"
                        style={{ width: 19, height: 19, objectFit: 'contain', display: 'block', margin: 'auto', transform: 'translateX(-2px)', filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.6))' }} /* 縮小 + 往左一點點 */
                        onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            const fb = e.currentTarget.nextElementSibling;
                            if (fb) fb.style.display = 'block';
                        }}
                    />
                    <Music size={16} color="#F0EDE6" style={{ display: 'none', filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.6))' }} />
                </div>
            </div>

            {/* ══ Portal: 渲染至 body 最高層 ══ */}
            {ReactDOM.createPortal(portalContent, document.body)}
        </div>
    );
});

/** 頭像圖片 — 自動補全 API base，圖片載入失敗時 fallback 到 User icon */
const AvatarImage = ({ userProfile }) => {
    const [broken, setBroken] = React.useState(false);
    const apiBase = `http://${window.location.hostname}:8000`;

    // 讀取此 userId 的頭貼（命名空間），fallback 到 JWT OAuth 頭貼
    const storedAvatar = userProfile?.userId
        ? uStorage(userProfile.userId).get('user_avatar_photo', null)
        : null;
    let jwtAvatar = null;
    try {
        const token = localStorage.getItem('auth_token');
        if (token) {
            const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
            if (payload.exp * 1000 > Date.now()) jwtAvatar = payload.avatar || null;
        }
    } catch (_) { }

    const raw = storedAvatar || userProfile?.avatar || jwtAvatar;

    // 與 Profile 的 isImageAvatar 完全一致：http/https/data/blob 或「/」開頭都算圖片。
    // 「/desktop/profileX.PNG」這類是前端靜態資源，要原樣使用、不可加上 API host，
    //  否則會指到後端 :8000 載不到圖 → 退回預設人頭（這就是首頁顯示 default 的原因）。
    const isImg = typeof raw === 'string' && /^(https?:|data:|blob:|\/)/.test(raw);
    const isEmoji = typeof raw === 'string' && raw.length > 0 && !isImg;

    if (isEmoji) {
        return <span style={{ fontSize: 20, lineHeight: 1 }}>{raw}</span>;
    }
    // 圖片：直接用原值（與 Profile 同邏輯，不再 prepend apiBase）
    const src = isImg ? raw : null;
    if (!src || broken) {
        return <User size={20} className="text-[#161415]" />;
    }
    return (
        <img loading="eager" decoding="sync" fetchpriority="high"
            src={src}
            alt="Profile"
            className="w-full h-full object-cover"
            onError={() => setBroken(true)}
        />
    );
};

/**
 * ActionFirstDashboardMobile
 * Specs: iPhone 17 / 15 Pro Reference
 * - Frame: 393px
 * - Safe Top: 59px
 * - Safe Bottom: 34px (handled by nav spacer)
 * - Padding X: 20px
 * - Gap: 16px
 * - Trends: Beige
 * - More Actions: Frosted Orange Grid
 */

const RunningLoaderOverlay = ({ onClose }) => {
    return (
        <div
            onClick={onClose}
            className="fixed inset-0 z-[999999] bg-[#CFC6B8] flex flex-col justify-center items-center cursor-pointer select-none overflow-hidden"
        >
            {/* 氣氛燈背景 */}
            <BespokeAmbientGlow forceLightBg={true} forceFullPage={true} />

            <style dangerouslySetInnerHTML={{
                __html: `
                .running-loader-wrapper {
                    position: relative;
                    animation: float-run 3s ease-in-out infinite;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    z-index: 10;
                }
                .run-svg {
                    width: 180px;
                }
                .run-main {
                    fill: none;
                    stroke: url(#metal-grad);
                    stroke-width: 1.4;
                }
                .run-leg-front {
                    transform-origin: 120px 70px;
                    animation: stepFront 1.2s ease-in-out infinite;
                }
                .run-leg-back {
                    transform-origin: 90px 60px;
                    animation: stepBack 1.2s ease-in-out infinite;
                }
                .run-energy-front {
                    stroke: #FF6A3D;
                    stroke-width: 1.4;
                    fill: none;
                    stroke-dasharray: 60 200;
                    animation: energyFront 1.2s linear infinite;
                    filter: blur(0.6px);
                }
                .run-energy-back {
                    stroke: #FF6A3D;
                    stroke-width: 1.2;
                    fill: none;
                    stroke-dasharray: 60 200;
                    animation: energyBack 1.2s linear infinite;
                    opacity: 0.4;
                    filter: blur(2px);
                }
                .run-dot {
                    fill: url(#coralMetal-grad);
                    filter: drop-shadow(0 0 8px rgba(255,106,61,0.6));
                    animation: headMove 1.2s ease-in-out infinite;
                }
                @keyframes stepFront {
                    0%, 100% { transform: scaleY(1); }
                    40% { transform: scaleY(0.85); }
                    60% { transform: scaleY(1.05); }
                }
                @keyframes stepBack {
                    0%, 100% { transform: translateX(0); }
                    50% { transform: translateX(6px); }
                }
                @keyframes energyFront {
                    0% { stroke-dashoffset: 0; opacity: 0; }
                    20% { opacity: 1; }
                    100% { stroke-dashoffset: -260; opacity: 0; }
                }
                @keyframes energyBack {
                    0% { stroke-dashoffset: 40; }
                    100% { stroke-dashoffset: -220; }
                }
                @keyframes headMove {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-6px); }
                }
                @keyframes float-run {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(4px); }
                }
                .run-loading-text {
                    text-align: center;
                    margin-top: 12px;
                    font-size: 9px;
                    letter-spacing: 5px;
                    color: #161415;
                    font-weight: bold;
                }
                .run-drvn-brand {
                    text-align: center;
                    margin-top: 4px;
                    font-family: "Tenor Sans", -apple-system, sans-serif;
                    font-size: 14px;
                    font-weight: bold;
                    letter-spacing: 3px;
                    color: #F95C4B;
                    text-transform: uppercase;
                    opacity: 0.95;
                }
                .tap-to-dismiss {
                    position: absolute;
                    bottom: 40px;
                    font-size: 11px;
                    color: rgba(22, 20, 21, 0.5);
                    letter-spacing: 2px;
                    text-transform: uppercase;
                    z-index: 10;
                }
            `}} />

            <div className="running-loader-wrapper">
                <svg viewBox="0 0 220 140" className="run-svg">
                    <defs>
                        <linearGradient id="metal-grad" x1="0%" y1="0%" x2="100%">
                            <stop offset="0%" stopColor="#161415" />
                            <stop offset="50%" stopColor="#888" />
                            <stop offset="100%" stopColor="#161415" />
                        </linearGradient>

                        <linearGradient id="coralMetal-grad" x1="0%" y1="0%" x2="100%">
                            <stop offset="0%" stopColor="#FFB199" />
                            <stop offset="40%" stopColor="#FF6A3D" />
                            <stop offset="70%" stopColor="#B23A1F" />
                            <stop offset="100%" stopColor="#FFD2C2" />
                        </linearGradient>
                    </defs>

                    {/* 上弧 */}
                    <path className="run-main" d="M60 35 Q110 5 155 30" />

                    {/* 後腳 */}
                    <path className="run-main run-leg-back" d="M25 85 L80 45 Q105 25 130 45" />

                    {/* 前腳 */}
                    <path className="run-main run-leg-front" d="M130 45 L160 75 L200 45" />

                    {/* 能量（後） */}
                    <path className="run-energy-back" d="M25 85 L80 45 Q105 25 130 45" />

                    {/* 能量（前） */}
                    <path className="run-energy-front" d="M130 45 L160 75 L200 45" />

                    {/* 頭 */}
                    <circle className="run-dot" cx="160" cy="25" r="6" />
                </svg>

                <div className="run-loading-text">LOADING</div>
                <div className="run-drvn-brand">drvn</div>
            </div>

            <div className="tap-to-dismiss">TAP ANYWHERE TO CLOSE</div>
        </div>
    );
};

const MotionAuthLoaderOverlay = ({ onClose }) => {
    const [animationKey, setAnimationKey] = useState(0);
    const [progress, setProgress] = useState(0);
    // Initialize night mode based on hour (18:00 - 06:00), but allow users to toggle manually
    const [isNightMode, setIsNightMode] = useState(() => {
        const hr = new Date().getHours();
        return hr >= 18 || hr < 6;
    });

    // Automatically reset animations every 4.5 seconds to match the Tesla UI style reset
    useEffect(() => {
        const interval = setInterval(() => {
            setAnimationKey(prev => prev + 1);
        }, 4500);
        return () => clearInterval(interval);
    }, []);

    // Sync progress animation with the 4.5s cycle
    useEffect(() => {
        const start = Date.now();
        const interval = setInterval(() => {
            const elapsed = Date.now() - start;
            const percentage = Math.min(Math.floor((elapsed / 4500) * 100), 100);
            setProgress(percentage);
        }, 30);
        return () => clearInterval(interval);
    }, [animationKey]);

    // 🔒 Loading 期間鎖住整頁滾動 — 連 iOS Safari 的 rubber-banding 都禁掉
    //    使用者就算想拖也只會看到 loading 畫面，避免被「半透明 overlay 滑開背景」的 bug
    useEffect(() => {
        const prevBodyOverflow = document.body.style.overflow;
        const prevBodyTouch = document.body.style.touchAction;
        const prevHtmlOverflow = document.documentElement.style.overflow;
        document.body.style.overflow = 'hidden';
        document.body.style.touchAction = 'none';
        document.documentElement.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prevBodyOverflow;
            document.body.style.touchAction = prevBodyTouch;
            document.documentElement.style.overflow = prevHtmlOverflow;
        };
    }, []);

    return (
        <div
            onClick={onClose}
            className="fixed inset-0 z-[999999] bg-[#FFFFFF] flex items-center justify-center cursor-pointer select-none overflow-hidden"
        >
            <style dangerouslySetInnerHTML={{
                __html: `
                .tesla-scene {
                    position: relative;
                    width: 100%;
                    height: 100%;
                    overflow: hidden;
                    background: #FFFFFF;
                    transition: background-color 0.4s ease;
                }
                
                /* ===== Tesla 貫穿式尾燈 (下移至 Logo 下方) ===== */
                .tesla-light-bar {
                    position: absolute;
                    top: 45%;
                    left: 50%;
                    width: 0%;
                    height: 2.5px;
                    transform: translate(-50%, -50%);
                    background: #FF5A3D;
                    box-shadow:
                        0 0 10px rgba(255, 90, 61, 0.8),
                        0 0 25px rgba(255, 90, 61, 0.5),
                        0 0 45px rgba(255, 90, 61, 0.3);
                    animation: tesla-expand 4.5s infinite ease-in-out;
                }
                
                /* ===== DRVN LOGO — Manrope 瑞士時尚字標 ===== */
                .tesla-logo {
                    position: absolute;
                    top: 56%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    color: #161415;
                    font-family: "Manrope", -apple-system, sans-serif;
                    font-size: 38px;
                    letter-spacing: 0.34em;
                    padding-left: 0.34em;
                    font-weight: 700;
                    opacity: 1 !important;
                    text-align: center;
                    white-space: nowrap;
                    transition: color 0.4s ease;
                }

                /* ===== SLOGAN — Manrope，細字寬距 ===== */
                .tesla-slogan {
                    position: absolute;
                    top: 63%;
                    left: 50%;
                    transform: translateX(-50%);
                    font-family: "Manrope", -apple-system, sans-serif;
                    font-size: 10.5px;
                    letter-spacing: 0.42em;
                    padding-left: 0.42em;
                    color: rgba(22, 20, 21, 0.55);
                    font-weight: 500;
                    text-align: center;
                    white-space: nowrap;
                    text-transform: uppercase;
                    opacity: 1;
                    transition: color 0.4s ease;
                }
                
                /* ===== 氛圍燈系統 (Ambient Light System) ===== */
                /* 已移除所有氛圍光暈 */
                
                /* ===== animations ===== */
                @keyframes tesla-expand {
                    0% {
                        width: 0%;
                        opacity: 0;
                    }
                    30% {
                        width: 100%;
                        opacity: 1;
                    }
                    60% {
                        width: 100%;
                        opacity: 0.95;
                    }
                    100% {
                        width: 0%;
                        opacity: 0;
                    }
                }
                
                @keyframes tesla-fadeLogo {
                    0% { opacity: 0; letter-spacing: 30px; }
                    35% { opacity: 0; }
                    45% { opacity: 1; letter-spacing: 16px; }
                    70% { opacity: 1; }
                    100% { opacity: 0; letter-spacing: 30px; }
                }

                @keyframes float-slow-1 {
                    0% { transform: translate(0, 0) scale(1); }
                    100% { transform: translate(50px, 40px) scale(1.15); }
                }

                /* 🟢 最新動態卡：流動的彩色液態玻璃底（多層 radial mix + 明顯漂移旋轉） */
                .drvn-activity-feed-card { background: #FFFFFF; }
                .drvn-feed-flow {
                    background:
                        radial-gradient(38% 60% at 15% 25%, rgba(126,200,180,0.34) 0%, transparent 62%),
                        radial-gradient(42% 62% at 72% 20%, rgba(245,205,130,0.32) 0%, transparent 64%),
                        radial-gradient(48% 68% at 52% 78%, rgba(240,135,110,0.34) 0%, transparent 62%),
                        radial-gradient(44% 62% at 90% 78%, rgba(180,140,210,0.32) 0%, transparent 64%),
                        radial-gradient(40% 60% at 28% 90%, rgba(120,160,210,0.32) 0%, transparent 62%);
                    filter: blur(26px) saturate(110%);
                    opacity: 0.42;
                    animation: drvnFeedFlow 11s ease-in-out infinite alternate;
                    will-change: transform;
                }
                /* Liquid glass 前層：磨砂玻璃 + 上緣高光，讓彩色退到玻璃後面 */
                .drvn-feed-glass {
                    position: absolute; inset: 0; pointer-events: none;
                    background: linear-gradient(160deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.28) 42%, rgba(255,255,255,0.42) 100%);
                    backdrop-filter: blur(6px) saturate(1.15);
                    -webkit-backdrop-filter: blur(6px) saturate(1.15);
                    border-radius: inherit;
                }
                .drvn-feed-glass::before {
                    content: ''; position: absolute; top: 0; left: 14px; right: 14px; height: 1px;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent);
                }
                @keyframes drvnFeedFlow {
                    0%   { transform: translate(-10%, -8%) rotate(0deg)    scale(1.15); }
                    33%  { transform: translate(8%, -2%)   rotate(10deg)   scale(1.32); }
                    66%  { transform: translate(-4%, 8%)   rotate(-8deg)   scale(1.22); }
                    100% { transform: translate(10%, 6%)   rotate(6deg)    scale(1.3); }
                }
                @media (prefers-reduced-motion: reduce) {
                    .drvn-feed-flow { animation: none; }
                }

                /* float-slow-2 / float-slow-3 已下架（只剩 bokeh-1） */

                /* ===== 跑者簽名畫出動畫 (Signature Draw Animation) — Optimized ===== */
                /* 🟢 三大優化：
                 *   1. will-change: stroke-dashoffset → 通知瀏覽器這條 path 會持續變化，
                 *      提前 promote 到自己的 layer，避免每幀重新繪整顆 svg
                 *   2. shape-rendering: geometricPrecision → 更省 anti-aliasing 計算
                 *   3. ease-out 取代 cubic-bezier(0.16, 1, 0.3, 1) → 一樣絲滑但 GPU 直接吃 */
                .draw-path-upper,
                .draw-circle-head,
                .draw-path-lower {
                    will-change: stroke-dashoffset;
                    shape-rendering: geometricPrecision;
                }
                /* 🟢 加速到「貫穿式尾燈」的同節奏：
                 *    tesla-light-bar 0→88% 約 30% × 4.5s = 1.35s 內畫完
                 *    runner 整組（含最後 path）也在 ~1.1s 內完成，感覺一氣呵成
                 *    原本三條 path 分別 1.5 / 1.2+0.3 / 1.8+0.5 (=2.3s) 太拖 */
                .draw-path-upper {
                    stroke-dasharray: 260;
                    stroke-dashoffset: 260;
                    animation: tesla-drawSignature 0.7s ease-out forwards;
                }
                .draw-circle-head {
                    stroke-dasharray: 80;
                    stroke-dashoffset: 80;
                    animation: tesla-drawSignature 0.45s ease-out forwards;
                    animation-delay: 0.15s;
                }
                .draw-path-lower {
                    stroke-dasharray: 320;
                    stroke-dashoffset: 320;
                    animation: tesla-drawSignature 0.85s ease-out forwards;
                    animation-delay: 0.25s;
                }


                /* 單一珊瑚色 V — 瑞士極簡的唯一重音 */
                .titanium-v {
                    color: #FF5A3D;
                    -webkit-text-fill-color: #FF5A3D;
                }
                
                @keyframes tesla-drawSignature {
                    to {
                        stroke-dashoffset: 0;
                    }
                }

                /* 🟢 City lights / sky stars / beacon CSS 全部移除 — 對應 DOM 已刪 */

                /* ===== 夜色套件 (Night Mode Suite Override) ===== */
                .tesla-scene.is-night-mode {
                    background: #0B0B0D !important;
                }
                
                .tesla-scene.is-night-mode::after {
                    background: radial-gradient(circle at center, transparent 35%, rgba(0,0,0,0.7)) !important;
                }

                .tesla-scene.is-night-mode .tesla-logo {
                    color: #FFFFFF !important;
                    opacity: 1 !important;
                }

                .tesla-scene.is-night-mode .tesla-slogan {
                    color: rgba(255, 255, 255, 0.7) !important;
                }

                /* .tesla-grid-line override 已移除（改用 .tesla-grid-bg 的 night mode 變體） */
            `}} />

            <div className={`tesla-scene ${isNightMode ? 'is-night-mode' : ''}`} key={animationKey}>

                {/* 🟢 極簡瑞士時尚改版：移除網格背景與城市天際線（多餘點綴）。
                     只保留 logo、Manrope 名稱、標語與光條。 */}

                {/* 🏃‍♂️ Signature-style Runner Logo (手繪簽名感線條) */}
                <div className="absolute top-[32%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none z-10">
                    <svg width="220" height="110" viewBox="0 0 300 150" className="relative">
                        <defs>
                            {/* 鈦金屬拉絲質感漸層 (Spec Specular Brushed Titanium) */}
                            <linearGradient id="runner-metal" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#262523" />
                                <stop offset="20%" stopColor="#A2A2A7" />
                                <stop offset="40%" stopColor="#E5E5EA" />
                                <stop offset="60%" stopColor="#48484A" />
                                <stop offset="80%" stopColor="#C7C7CC" />
                                <stop offset="100%" stopColor="#262523" />
                            </linearGradient>
                            <linearGradient id="runner-metal-night" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#262523" />
                                <stop offset="25%" stopColor="#636366" />
                                <stop offset="50%" stopColor="#F2F2F7" />
                                <stop offset="75%" stopColor="#3A3A3C" />
                                <stop offset="90%" stopColor="#AEAEB2" />
                                <stop offset="100%" stopColor="#262523" />
                            </linearGradient>
                            {/* 珊瑚鈦金屬漸層 (Coral Titanium Specular Gradient) */}
                            <linearGradient id="runner-head-coral" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#D1D1D6" />
                                <stop offset="25%" stopColor="#FF5A3D" />
                                <stop offset="50%" stopColor="#FF8C6A" />
                                <stop offset="75%" stopColor="#FF3B30" />
                                <stop offset="100%" stopColor="#48484A" />
                            </linearGradient>
                            <linearGradient id="runner-head-coral-night" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#8E8E93" />
                                <stop offset="25%" stopColor="#FF5A3D" />
                                <stop offset="50%" stopColor="#FF9F0A" />
                                <stop offset="75%" stopColor="#FF375F" />
                                <stop offset="100%" stopColor="#262523" />
                            </linearGradient>
                        </defs>

                        {/* 🟢 跑者 logo — 移除每個 path 的 drop-shadow filter
                            原因：drop-shadow + stroke-dashoffset 動畫會強迫瀏覽器每幀重算 shadow geometry，
                                 是這個 logo 卡頓的最大主因。
                            視覺替代：用 SVG <filter> 一次定義 outer-glow 套用在整顆 svg 外部即可，
                                     成本只算一次，不會跟著動畫每幀重算 */}

                        {/* 上半身 (手寫筆觸感的前傾手臂與軀幹) */}
                        <path
                            className="draw-path-upper"
                            d="M 75,46 C 90,38 125,36 155,40 C 180,43 186,60 186,76"
                            fill="none"
                            stroke={isNightMode ? "url(#runner-metal-night)" : "url(#runner-metal)"}
                            strokeWidth="2.4"
                            strokeLinecap="round"
                        />

                        {/* 頭部圓圈 (鈦金屬 Coral 漸層質感) */}
                        <circle
                            className="draw-circle-head"
                            cx="212"
                            cy="52"
                            r="10.5"
                            fill="none"
                            stroke={isNightMode ? "url(#runner-head-coral-night)" : "url(#runner-head-coral)"}
                            strokeWidth="2.4"
                        />

                        {/* 下半身 (手寫流暢雙腿曲線) */}
                        <path
                            className="draw-path-lower"
                            d="M 90,112 C 105,102 118,72 135,58 C 150,44 170,90 182,122 C 195,155 204,92 228,64"
                            fill="none"
                            stroke={isNightMode ? "url(#runner-metal-night)" : "url(#runner-metal)"}
                            strokeWidth="2.4"
                            strokeLinecap="round"
                        />
                    </svg>
                </div>

                {/* 光條（保留） */}
                <div className="tesla-light-bar" />

                {/* DRVN (V 字以鈦金屬拉絲點綴) */}
                <div className="tesla-logo">
                    DR<span className="titanium-v">V</span>N
                </div>

                {/* 運動語言 (Move with Intent) */}
                <div className="tesla-slogan">MOVE WITH INTENT.</div>
            </div>
        </div>
    );
};

const _dashboardCache = new Map();


const ActionFirstDashboardMobile = ({ userId, userProfile, userName = "Mike", withCapsuleNav = false }) => {
    const navigate = useNavigate();
    const { t } = useLanguage();

    // 🎬 進場動畫補播：首次開 App 時，主頁在「原生 splash 後面」就掛載完成，
    //    卡牌進場動畫全部播在使用者看不到的地方。
    //    解法：只在「掛載當下 splash 還蓋著（原生殼 + 尚未 revealed）」時，
    //    等 'drvn:app-revealed' 事件到來換一次 key 重掛、把動畫真正播給使用者看。
    //    瀏覽器 / splash 已收起的一般導航完全不觸發 → 不會有「刷新兩次」問題。
    const [revealKey, setRevealKey] = useState(0);
    useEffect(() => {
        const isNativeShell = !!window.webkit?.messageHandlers;
        if (!isNativeShell || window.__drvnRevealed === true) return; // 已可見 → 不需補播
        const replay = () => setRevealKey((k) => k + 1);
        window.addEventListener('drvn:app-revealed', replay, { once: true });
        return () => window.removeEventListener('drvn:app-revealed', replay);
    }, []);

    // Seed state from cache on every mount — avoids skeleton flash on re-navigation
    const _ic = _dashboardCache.get(userId); // _ic = initCache
    const hasCachedData = Boolean(_ic);

    // 🏠 卡牌編輯模式（Apple 桌面風）：長按任意卡牌 → 全部抖動；
    //    右上角 ⊖ 移除；左上角「＋」加回；設定頁「功能卡牌區」可補救。
    const [editMode, setEditMode] = useState(false);
    const [hiddenCards, setHiddenCards] = useState(() => getHiddenHomeCards(userId));
    const [showAddSheet, setShowAddSheet] = useState(false);
    useEffect(() => {
        const sync = () => setHiddenCards(getHiddenHomeCards(userId));
        window.addEventListener(HOME_CARDS_EVENT, sync);
        return () => window.removeEventListener(HOME_CARDS_EVENT, sync);
    }, [userId]);
    const enterCardEdit = useCallback(() => setEditMode(true), []);
    const removeHomeCard = useCallback((id) => { hideHomeCard(userId, id); }, [userId]);
    const isCardHidden = useCallback((id) => hiddenCards.includes(id), [hiddenCards]);
    // 統一給每個 HomeEditableBlock 的 props
    const blockProps = (id) => ({ id, editMode, onLongPress: enterCardEdit, onRemove: removeHomeCard });

    // 🥇 每日打卡金屬面板（活動紀錄月曆點擊開啟）
    const [showDailyCheckin, setShowDailyCheckin] = useState(false);
    // 🔴 呼吸燈重算 tick：打卡面板關閉時 +1（可能剛完成某項）
    const [checkinTick, setCheckinTick] = useState(0);

    // 🎓 是否需要顯示「生成你的計劃」空狀態（教學完成但仍無真實計劃）
    const [needsPlanSetup, setNeedsPlanSetup] = useState(false);
    const [todayWorkout, setTodayWorkout] = useState(
        _ic?.todayWorkout || { workout_name: "今日計劃", is_rest_day: true, exercises: [] }
    );
    const [recoveryStatus, setRecoveryStatus] = useState(
        // 🟢 Fix(honest-default): 新用戶尚未訓練 → 預設「完全恢復」是誠實狀態，
        //    但不捏造特定目標肌群分數，等真實掃描/訓練資料回來再覆蓋。
        _ic?.recoveryStatus || { battery_level: 100, status: 'Ready', target_muscle: null, target_muscle_score: null }
    );
    /* 首頁「準備度」卡的唯一來源。資料刷新（recoveryStatus 回來）時順便重算一次。 */
    const todayReadiness = useMemo(() => getTodayReadiness(userId), [userId, recoveryStatus]);

    // 🎯 下次目標 — 讀結果頁「下一步」存下的 drvn_next_goal（只讀，不寫計劃資料）。
    //    回到主頁就看得到「下次該幹嘛」，把單次跑步的迴路收尾。
    // 月報結算狀態：未解鎖 → 鎖定卡；有新結算 → 紅點
    const [recap, setRecap] = useState({ unlocked: isRecapUnlocked(), hasNew: hasNewSettlement() });
    useEffect(() => {
        let alive = true;
        refreshRecapState().then(() => { if (alive) setRecap({ unlocked: isRecapUnlocked(), hasNew: hasNewSettlement() }); });
        return () => { alive = false; };
    }, []);

    const [nextGoal, setNextGoal] = useState(null);
    const featuredTitle = useFeaturedTitle(userId); // 稱號（使用者自選，可顯示在問候語旁）
    useEffect(() => {
        if (!userId) return;
        const load = () => {
            try {
                const raw = localStorage.getItem(`drvn_next_goal_${userId}`);
                setNextGoal(raw ? JSON.parse(raw) : null);
            } catch { setNextGoal(null); }
        };
        load();
        // 回到前台時重讀（剛跑完回主頁就更新）
        const onVis = () => { if (document.visibilityState === 'visible') load(); };
        document.addEventListener('visibilitychange', onVis);
        return () => document.removeEventListener('visibilitychange', onVis);
    }, [userId]);
    const dismissNextGoal = () => {
        try { localStorage.removeItem(`drvn_next_goal_${userId}`); } catch { /* noop */ }
        setNextGoal(null);
    };

    // 🔁 天氣 + 資訊輪播 — 共用一張卡：第 0 頁天氣，其餘為提醒（依優先級）。每 4.5 秒切換。
    const [homeAlerts, setHomeAlerts] = useState([]);
    const [carouselPage, setCarouselPage] = useState(0);
    const [carouselDragging, setCarouselDragging] = useState(false); // 滑動中 → 暫停自動輪播
    // 🌫️ 開場資訊減量：公告輪播播完一輪後慢慢淡出收合（使用者互動過就保留）
    const [alertsGone, setAlertsGone] = useState(false);
    const alertsKeepRef = useRef(false);
    useEffect(() => { if (carouselDragging) alertsKeepRef.current = true; }, [carouselDragging]);
    /* 🎬 提示跑馬燈是開場序列的「最後一位」：等下面的卡都進場完才淡入。
       ⚠️ 以前它是固定 mount 後 1.0s 出現 —— 但主卡要等資料回來才揭開，
          而最後一張卡的進場到 ~1.5s 才結束，所以跑馬燈常常比卡還早亮，看起來是第一個跳出來的。
       現在：資料到齊之後，且離進場至少 1.5s，才開始 1.2s 的淡入。 */
    const mountAtRef = useRef(Date.now());
    const [alertsIntroReady, setAlertsIntroReady] = useState(false);
    // 淡入之後播 14s，沒互動就慢慢收合（計時從「出現」開始算，不是從進頁面）
    useEffect(() => {
        if (!alertsIntroReady) return undefined;
        const t = setTimeout(() => { if (!alertsKeepRef.current) setAlertsGone(true); }, 14000);
        return () => clearTimeout(t);
    }, [alertsIntroReady]);
    const carouselRef = useRef(null);
    const carouselProgrammatic = useRef(false); // 區分「程式捲動」與「使用者滑動」
    const carouselScrollEndTimer = useRef(null);
    // 使用者原生捲動 → 捲停後同步目前頁 + 暫停自動輪播 + 震動。
    //   ♾️ clone 版雙向無限 loop：實際版位為 [lastClone, 0..n-1, firstClone]，
    //      真實頁 p 落在 slot p+1；落到頭尾 clone 時無縫跳回對應真實頁。
    const carouselCountRef = useRef(1); // 真實頁數（由 render 時更新）
    const lastHapticPageRef = useRef(0);
    const onCarouselScroll = useCallback(() => {
        const el = carouselRef.current;
        if (!el || carouselProgrammatic.current) return;
        setCarouselDragging(true);
        clearTimeout(carouselScrollEndTimer.current);
        carouselScrollEndTimer.current = setTimeout(() => {
            const w = el.clientWidth || 1;
            const n = carouselCountRef.current || 1;
            const loopable = n > 1;
            const slot = Math.round(el.scrollLeft / w); // 目前停在哪個版位
            let page;
            if (!loopable) {
                page = 0;
            } else if (slot === 0) {
                // 停在左側 clone(= last) → 無縫跳到真實最後一張(slot n)
                carouselProgrammatic.current = true;
                el.scrollTo({ left: n * w, behavior: 'auto' });
                page = n - 1;
                setTimeout(() => { carouselProgrammatic.current = false; }, 60);
            } else if (slot === n + 1) {
                // 停在右側 clone(= first) → 無縫跳回真實第一張(slot 1)
                carouselProgrammatic.current = true;
                el.scrollTo({ left: w, behavior: 'auto' });
                page = 0;
                setTimeout(() => { carouselProgrammatic.current = false; }, 60);
            } else {
                page = slot - 1; // 真實頁 = slot - 1
            }
            // 換頁震動（selection changed）
            if (page !== lastHapticPageRef.current) {
                lastHapticPageRef.current = page;
                try { hapticSelectionChanged(); } catch (_) {}
            }
            setCarouselPage(page);
            setCarouselDragging(false);
        }, 120);
    }, []);
    useEffect(() => {
        if (!userId) return;
        // 預覽模式 → 顯示整套假資料；正式模式 → 真實事件聚合（含黑卡晉升 / 社群互動）。
        const alerts = HOME_ALERTS_PREVIEW
            ? buildHomeAlertsPreview()
            : buildHomeAlerts(userId, { isInPromoZone: false, socialUnread: 0 });
        setHomeAlerts(alerts);
        setCarouselPage(0);
    }, [userId, nextGoal]);
    // ♾️ 自動輪播「一直往右流動」1-2-3-1-2-3：
    //    永遠往前捲一個 slot；捲到右側 clone(= slot n+1) 後，等平順動畫結束再
    //    無縫瞬移回真實第一張(slot 1)，所以視覺上是連續往右不回頭。
    useEffect(() => {
        const n = carouselCountRef.current || (2 + homeAlerts.length);
        if (n <= 1) return;
        if (carouselDragging) return; // 使用者正在滑動 → 暫停自動輪播
        let dwell = 4500;
        if (carouselPage >= 2) dwell = alertDwellMs(homeAlerts[carouselPage - 2]?.priority);
        else if (carouselPage === 0) dwell = 5000;
        const t = setTimeout(() => {
            const el = carouselRef.current;
            if (!el) return;
            const w = el.clientWidth || 1;
            const curSlot = Math.round(el.scrollLeft / w); // 目前 slot（含 clone）
            const nextSlot = curSlot + 1;                  // 一律往前一個 slot
            carouselProgrammatic.current = true;
            el.scrollTo({ left: nextSlot * w, behavior: 'smooth' });
            if (nextSlot >= n + 1) {
                // 捲到右側 clone → 動畫結束後無縫回到真實第一張(slot 1)
                setTimeout(() => {
                    el.scrollTo({ left: w, behavior: 'auto' });
                    setCarouselPage(0);
                    carouselProgrammatic.current = false;
                }, 560);
            } else {
                setCarouselPage(nextSlot - 1); // 真實頁 = slot - 1
                setTimeout(() => { carouselProgrammatic.current = false; }, 560);
            }
        }, dwell);
        return () => clearTimeout(t);
    }, [homeAlerts, carouselPage, carouselDragging]);

    // 初次掛載 / alerts 變動 → 定位到真實第一張(slot 1)，讓左右都能 loop
    useEffect(() => {
        const el = carouselRef.current;
        if (!el) return;
        const n = carouselCountRef.current || 1;
        if (n <= 1) return;
        const w = el.clientWidth || 1;
        // 只在還停在左側 clone(slot 0) 或未定位時校正
        if (el.scrollLeft < w * 0.5) {
            carouselProgrammatic.current = true;
            el.scrollTo({ left: w, behavior: 'auto' });
            setTimeout(() => { carouselProgrammatic.current = false; }, 60);
        }
    }, [homeAlerts]);
    // 🟢 Fix(honest-default): 移除假的 streak:12 / completed:3。新用戶一律從 0 起算，
    //    真實數字由 fetchDashboardData 的 progressRes 覆蓋。捏造的連續紀錄會破壞信任。
    const [weekProgress, setWeekProgress] = useState(_ic?.weekProgress || { completed: 0, target: 0, streak: 0 });
    const [loading, setLoading] = useState(!hasCachedData); // false if we have cache → no skeleton
    useEffect(() => {
        if (loading || alertsIntroReady) return undefined;
        const reduced = typeof window !== 'undefined'
            && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (reduced) { setAlertsIntroReady(true); return undefined; }
        // 卡片揭開要 ~0.6s；離進場不到 1.5s 的話等到 1.5s（最後一張卡的進場結束點）
        const wait = Math.max(1500 - (Date.now() - mountAtRef.current), 600);
        const t = setTimeout(() => setAlertsIntroReady(true), wait);
        return () => clearTimeout(t);
    }, [loading, alertsIntroReady]);
    const [fullWorkoutData, setFullWorkoutData] = useState(_ic?.todayWorkout || null);
    const [runningData, setRunningData] = useState(_ic?.runningData || { latestDistance: 0, latestPace: 0 });

    // 🏃 今日跑步計劃 — 若計劃有未完成的跑步課，「最新跑步」卡改顯示計劃提醒。
    //    只讀 cardio-plan this-week 的第一個未完成 brick；沒有就維持顯示最新跑步數據。
    const [todayRunPlan, setTodayRunPlan] = useState(null);
    const [weekBricks, setWeekBricks] = useState([]);   // 🗓️ 整週跑步磚（給 dailyAgenda 排程）
    useEffect(() => {
        if (!userId) return;
        let alive = true;
        (async () => {
            try {
                const resp = await apiClient.get(`/api/cardio-plan/${userId}/this-week`);
                const bricks = Array.isArray(resp?.data?.bricks) ? resp.data.bricks : [];
                cacheWeekBricks(userId, bricks);   // 🗓️ 寫入本地快取，供營養頁/提醒引擎讀
                if (alive) setWeekBricks(bricks);
                const isPending = (b) => !(b.completed || b.is_completed || b.done || b.status === 'completed' || b.status === 'skipped');
                const next = bricks.find(isPending);
                if (alive && next) {
                    setTodayRunPlan({
                        title: next.title || '跑步課',
                        distanceKm: Number(next.distance_km ?? next.distanceKm ?? 0) || 0,
                        paceLabel: next.target_pace_label || null,
                    });
                }
            } catch { /* 無計劃 → 維持最新跑步顯示 */ }
        })();
        return () => { alive = false; };
    }, [userId]);

    // 🗓️ 每日議程（單一真相源）：週曆 pills 的雙點、今日卡調光、都讀這裡。
    // ✅ 今日完成狀態用「當天真實紀錄」覆寫（applyTodayRealDone）：
    //    有做該菜單或任何重訓 → 重訓打勾；計劃跑完成或任何自由跑 → 跑步打勾；
    //    沒有今天的紀錄 → 把課表制的誤判打勾拉回未完成。
    // ⚠ calendarData 的 useState 宣告在本 memo 之後 → 這裡不能直接引用
    //   （TDZ ReferenceError 會讓整頁被 error boundary 接住）。改把宣告提前到這裡。
    const [calendarData, setCalendarData] = useState(_ic?.calendarData || { cardio: [], strength: [] });
    const weekAgenda = useMemo(() => {
        try {
            // 跟中控台同一份輸入（含改期與減量），不然兩邊會排出不同的一週
            const agenda = getTodayAgenda(loadWeekInputs(userId, { cardioBricks: weekBricks }));
            return applyTodayRealDone(agenda, {
                strengthSessions: calendarData?.strength || [],
                cardioSessions: calendarData?.cardio || [],
            });
        } catch { return null; }
    }, [userId, weekBricks, calendarData]);
    const todayType = weekAgenda?.dayType || null;   // 'strength'|'run'|'dual'|'makeup'|'rest'
    // 🗓️ 每日打卡入口：點 pill → 彈出該日議程 sheet（null = 關閉）
    const [agendaDayIdx, setAgendaDayIdx] = useState(null);

    // 🔴 今日目標尚未全數完成 → 活動紀錄月曆卡邊緣亮 coral 呼吸燈。
    //    與打卡面板共用 getTodayCheckinItems（單一真相源），三大系統（重訓/跑步/營養）
    //    的今日應辦與完成狀態兩邊永遠一致。
    const todayCheckinPending = useMemo(() => {
        try {
            const cell = weekAgenda?.week?.[weekAgenda?.todayIdx] || null;
            return getTodayCheckinItems(cell, userId, null).some((i) => !i.done);
        } catch { return false; }
        // checkinTick：關閉打卡面板後重算（可能剛完成某項）
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [weekAgenda, userId, checkinTick]);

    // 🔔 每日打卡「未完成」滿版提醒 — 下午 3 點後 / 晚上 8 點各一次。
    //    等 splash + 「第 N 天」時刻收場（afterMomentIdle）才彈，永不與其他開屏彈窗打架。
    const [checkinReminder, setCheckinReminder] = useState(null); // { slot, items }
    useEffect(() => {
        if (!userId || !weekAgenda) return undefined;
        let alive = true;
        const slotNow = () => { const h = new Date().getHours(); if (h >= 20) return '20'; if (h >= 15) return '15'; return null; };
        const flagKey = (slot) => `checkin_reminder_${userId}_${logicalDayKey(new Date())}_${slot}`;
        const evaluate = () => {
            if (!alive) return;
            const slot = slotNow();
            if (!slot) return;
            const flag = flagKey(slot);
            try { if (localStorage.getItem(flag)) return; } catch { /* */ }
            let items = [];
            try {
                const cell = weekAgenda?.week?.[weekAgenda?.todayIdx] || null;
                items = getTodayCheckinItems(cell, userId, navigate);
            } catch { return; }
            if (!items.some((i) => !i.done)) return;   // 全部完成 → 不打擾
            try { localStorage.setItem(flag, '1'); } catch { /* */ }   // 先記旗標，避免重複彈
            afterMomentIdle(() => { if (alive) setCheckinReminder({ slot, items }); });
        };
        const t = setTimeout(evaluate, 2800);           // 開場：等時刻收場後評一次
        const iv = setInterval(evaluate, 60000);        // 之後每分鐘檢查是否跨過 15:00 / 20:00
        return () => { alive = false; clearTimeout(t); clearInterval(iv); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, weekAgenda, checkinTick]);

    // 🎴 iOS 桌面小工具同步：今日進度 / 段位邀請函 / 飲食 streak → App Group。
    //    每日提醒依需求不在 App 內出卡，由桌面小工具（小/中/大）承擔。
    useEffect(() => {
        try { pushDailyWidgetData(userId, weekAgenda); } catch { /* no-op */ }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [weekAgenda, userId, checkinTick]);

    // ✨ Swiss Moment · 連續開啟：一天第一次開 App（6 點日界線）→ 滿版「第 N 天。」
    //    ⏱ 時序：等開場 stagger（~2.5s）完全收尾才出場（2.6s），
    //    首開簡報（2.8s 排程）會透過 afterMomentIdle 等本時刻收場再彈。
    useEffect(() => {
        if (!userId) return undefined;
        const t = setTimeout(() => { try { recordAppOpen(userId); } catch { /* */ } }, 2600);
        return () => clearTimeout(t);
    }, [userId]);

    // ✨ Swiss Moment · 今日全完成：pending true→false 的瞬間（本次使用中達成）
    //    → 滿版「全部到位。」一天最多一次（engine 內以邏輯日鎖）。
    const momentPrevPendingRef = useRef(null);
    useEffect(() => {
        const prev = momentPrevPendingRef.current;
        momentPrevPendingRef.current = todayCheckinPending;
        if (prev === true && todayCheckinPending === false) {
            try { recordAllDone(userId); } catch { /* */ }
        }
    }, [todayCheckinPending, userId]);

    // 🔁 每週計劃回顧（週一 06:00 起算的新週第一次開 App）：
    //    上週計劃 0 次 + 自主 Block ≥ 2 次 → 提案把 Block 換進計劃。
    //    5s 後才查（讓開場動畫/滿版時刻/首開簡報都先走完），並用
    //    afterMomentIdle 排隊，永不與其他開屏彈窗打架。
    const [blockProposal, setBlockProposal] = useState(null);
    useEffect(() => {
        if (!userId) return undefined;
        const t = setTimeout(async () => {
            try {
                const r = await runWeeklyReview(userId);
                if (r) afterMomentIdle(() => setBlockProposal(r));
            } catch { /* */ }
        }, 5000);
        return () => clearTimeout(t);
    }, [userId]);

    // 🌅 登入打卡時刻：打開 app（登入）→ 等進場動畫收尾後，自動彈出滿版打卡頁
    //    （22.jpeg 滿版、同一套 getTodayCheckinItems 系統）。節流：每小時最多彈一次。
    const dailyBriefFiredRef = React.useRef(false);
    useEffect(() => {
        if (dailyBriefFiredRef.current || !weekAgenda) return undefined;
        try {
            const key = `drvn:checkinHourly:${userId || 'guest'}`;
            const now = Date.now();
            const HOUR = 60 * 60 * 1000;
            const last = Number(localStorage.getItem(key) || 0);
            if (now - last < HOUR) { dailyBriefFiredRef.current = true; return undefined; } // 一小時內已顯示過 → 不重複
            dailyBriefFiredRef.current = true;
            const t = setTimeout(() => {
                // ✨ 排隊：若 Swiss Moment（連續開啟滿版）正在播 → 等它收場再彈簡報，
                //    確保節拍是「開場動畫 → 滿版時刻 → 首開簡報」，不互相蓋臉。
                afterMomentIdle(() => {
                    try { localStorage.setItem(key, String(Date.now())); } catch { /* */ }
                    haptic('light');
                    setShowDailyCheckin(true);
                });
            }, 2800); // 開場序列（hero/卡片 stagger）約 2.5s 內結束
            return () => clearTimeout(t);
        } catch { return undefined; }
    }, [weekAgenda, userId]);

    // ── 跑步卡 patchReady：直接用組件自身的 loading state 驅動 ────────
    // 有模組快取 (hasCachedData) → 立即 true，0ms，跳過動畫
    // 初次載入   → loading=true 時顯示佔位符，fetchDashboardData 完成後 loading=false → fade-in
    // 若 API 回傳空資料，loading 仍會變 false，顯示預設 "0.0 km / --:--"
    const runPatchReady = hasCachedData || !loading;
    const [nutritionData, setNutritionData] = useState(_ic?.nutritionData || { in: 0, out: 0, target: 2000 });
    const [prData, setPrData] = useState(_ic?.prData || null);
    const [bodyData, setBodyData] = useState(_ic?.bodyData || { weight: 0, bodyFatPercentage: 0 });
    const [showPreviewSheet, setShowPreviewSheet] = useState(false);
    const [showDailyCheckIn, setShowDailyCheckIn] = useState(false);
    const [checkedInToday, setCheckedInToday] = useState(false);
    const [showRunningLoader, setShowRunningLoader] = useState(false);
    const [showMotionAuthLoader, setShowMotionAuthLoader] = useState(false);
    // 最近一次訓練類型，供 DailyCheckInModal postWorkout 分流文案
    const lastWorkoutType = (() => {
        try {
            const wd = JSON.parse(localStorage.getItem('workoutData') || '{}');
            return wd?.lastSession?.type || null;
        } catch { return null; }
    })();

    /* 📌 最近一次訓練的簡易數據 —— 最新動態卡上直接показ「你上次做了什麼」，
       不用點進去才知道。跑步與重訓取較新的那一筆。 */
    const lastActivitySummary = useMemo(() => {
        const toTs = (v) => { const t = Date.parse(String(v || '')); return Number.isFinite(t) ? t : 0; };
        const cardio = (calendarData?.cardio || [])[0] || null;
        const strengthList = (calendarData?.strength || []).slice().sort((a, b) => toTs(b.date) - toTs(a.date));
        const strength = strengthList[0] || null;
        const cTs = toTs(cardio?.created_at || cardio?.date || cardio?.timestamp);
        const sTs = toTs(strength?.date);
        if (!cTs && !sTs) return null;

        const daysAgo = (ts) => {
            if (!ts) return '';
            const d = Math.floor((Date.now() - ts) / 86400000);
            return d <= 0 ? t('今天', 'Today') : d === 1 ? t('昨天', 'Yesterday') : t(`${d} 天前`, `${d}d ago`);
        };
        /* 每種運動有自己的「看點」——跑步看距離/配速，重訓看部位/容量。
           用同一組欄位硬套會讓兩邊都失焦（跑步不需要 kg，重訓不需要配速）。
           chips 是要突顯的 2–3 個重點，text 是次要補充。 */
        if (cTs >= sTs && cardio) {
            const m = cardio.metrics || {};
            const km = Number(m.distance) || 0;
            const pace = Number(m.avgPace || m.pace) || 0;
            const mins = Math.round((Number(m.duration) || 0) / 60);
            const hr = Number(m.avgHeartRate || m.avgHR) || 0;
            const cad = Number(m.avgCadence) || 0;
            const cal = Number(m.calories) || 0;
            const paceStr = pace > 0 ? `${Math.floor(pace / 60)}'${String(Math.round(pace % 60)).padStart(2, '0')}"` : null;
            const chips = [];
            if (km > 0) chips.push({ v: km.toFixed(2), u: 'km' });
            if (paceStr) chips.push({ v: paceStr, u: '/km' });
            if (mins > 0) chips.push({ v: String(mins), u: t('分鐘', 'min') });
            const extra = [];
            if (hr > 0) extra.push(`${Math.round(hr)} bpm`);
            if (cad > 0) extra.push(`${Math.round(cad)} spm`);
            if (cal > 0) extra.push(`${Math.round(cal)} kcal`);
            const sportLabel = cardio.sport_label || t('跑步', 'Run');
            return {
                kind: 'run', label: sportLabel, when: daysAgo(cTs),
                chips, text: extra.join(' · '),
                prCount: Number(cardio.pr_count) || 0,
            };
        }
        const exs = Array.isArray(strength?.exercises) ? strength.exercises : [];
        const exCount = exs.length;
        const setCount = exs.reduce((s, e) => s + (Array.isArray(e.sets) ? e.sets.length : Number(e.sets) || 0), 0);
        const vol = Number(strength?.total_volume) || 0;
        const mins = Math.round((Number(strength?.duration_seconds || strength?.duration) || 0) / 60);
        const focus = strength?.focus_group || strength?.focus || strength?.name || '';
        const chips = [];
        if (exCount > 0) chips.push({ v: String(exCount), u: t('動作', 'ex') });
        if (setCount > 0) chips.push({ v: String(setCount), u: t('組', 'sets') });
        if (vol > 0) chips.push({ v: Math.round(vol).toLocaleString(), u: 'kg' });
        const extra = [];
        if (mins > 0) extra.push(`${mins} ${t('分鐘', 'min')}`);
        return {
            kind: 'lift', label: focus || t('重訓', 'Strength'), when: daysAgo(sTs),
            chips, text: extra.join(' · '), prCount: 0,
        };
    }, [calendarData, t]);

    // （calendarData 已提前到 weekAgenda memo 之前宣告，避免 TDZ）
    const [weeklySchedule, setWeeklySchedule] = useState(_ic?.weeklySchedule || {});
    const [activePlanWeek, setActivePlanWeek] = useState(_ic?.activePlanWeek || 1);
    const [showTutPanel, setShowTutPanel] = useState(false); // 教學進度浮窗

    // ── 讀取與 UserProfileFormMobile 相同的 localStorage cache，確保名稱和頭貼一致 ──
    const [localProfile, setLocalProfile] = useState(() => {
        if (!userId) return null;
        try {
            const cache = uStorage(userId).get('user_profile_cache', {});
            const savedAvatar = uStorage(userId).get('user_avatar_photo', null);
            let jwtName = null, jwtAvatar = null;
            try {
                const token = localStorage.getItem('auth_token');
                if (token) {
                    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
                    if (payload.exp * 1000 > Date.now()) { jwtName = payload.name || null; jwtAvatar = payload.avatar || null; }
                }
            } catch (_) { }
            return {
                name: cache.name || jwtName || null,
                avatar: savedAvatar || cache.avatar || jwtAvatar || null,
            };
        } catch (_) { return null; }
    });

    // 當開啟全螢幕載入畫面時，將 CapsuleNavigation 導航隱藏
    useEffect(() => {
        const shouldHide = showRunningLoader || showMotionAuthLoader;
        window.dispatchEvent(new CustomEvent('toggle-capsule-nav', { detail: { hidden: shouldHide } }));
        return () => {
            window.dispatchEvent(new CustomEvent('toggle-capsule-nav', { detail: { hidden: false } }));
        };
    }, [showRunningLoader, showMotionAuthLoader]);

    // 當 userId 變化時重新同步（切帳號場景）
    useEffect(() => {
        if (!userId) return;
        try {
            const cache = uStorage(userId).get('user_profile_cache', {});
            const savedAvatar = uStorage(userId).get('user_avatar_photo', null);
            let jwtName = null, jwtAvatar = null;
            try {
                const token = localStorage.getItem('auth_token');
                if (token) {
                    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
                    if (payload.exp * 1000 > Date.now()) { jwtName = payload.name || null; jwtAvatar = payload.avatar || null; }
                }
            } catch (_) { }
            setLocalProfile({
                name: cache.name || jwtName || null,
                avatar: savedAvatar || cache.avatar || jwtAvatar || null,
            });
        } catch (_) { }
    }, [userId]);

    // 名字：跟 Profile 共用 resolveDisplayName，確保首頁與 Profile 顯示一致
    //   優先：localProfile.name (=userId 命名空間 profile cache + JWT) → JWT → 「訓練者 #XXXX」
    // ⚠️ 不再使用 userProfile?.name（來自 App.jsx 全域狀態，可能是其他使用者的資料）
    // ⚠️ 不再使用 userName prop（可能是 "Mike" 等 hardcoded 預設值）
    const displayName = resolveDisplayName(userId, localProfile?.name);

    // 依規則把名稱斷行：英文每行最多 6 個字母（優先在空白斷），中文每行最多 5 個字。
    const nameLines = React.useMemo(() => {
        const name = String(displayName || '').trim();
        if (!name) return [''];
        const hasCJK = /[㐀-鿿豈-﫿]/.test(name);
        if (hasCJK) {
            // 中文：每 5 字一行
            const out = [];
            for (let i = 0; i < name.length; i += 5) out.push(name.slice(i, i + 5));
            return out;
        }
        // 英文：以空白為單位排版，單行累積長度 ≤ 7；超過就換行，單字本身過長就硬切。
        const words = name.split(/\s+/);
        const lines = [];
        let cur = '';
        for (let w of words) {
            while (w.length > 7) { if (cur) { lines.push(cur); cur = ''; } lines.push(w.slice(0, 7)); w = w.slice(7); }
            if (!cur) cur = w;
            else if ((cur + ' ' + w).length <= 7) cur = cur + ' ' + w;
            else { lines.push(cur); cur = w; }
        }
        if (cur) lines.push(cur);
        return lines.length ? lines : [name];
    }, [displayName]);

    // 合成給 AvatarImage 的 enrichedProfile（把 localProfile 的頭貼補進去）
    const enrichedProfile = { ...userProfile, userId, avatar: localProfile?.avatar || userProfile?.avatar };

    // 🚫 [已停用] 每日簽到/休息日彈窗：依需求移除「一打開 app 自動跳出」的全螢幕卡。
    //    元件仍保留(供未來手動觸發)，但不再於開啟 app 時自動彈出。
    // useEffect(() => {
    //     if (!ENABLE_DAILY_WELCOME) return;
    //     if (sessionStorage.getItem('daily_welcome_shown')) return;
    //     const timer = setTimeout(() => {
    //         setShowDailyCheckIn(true);
    //         sessionStorage.setItem('daily_welcome_shown', '1');
    //     }, 800);
    //     return () => clearTimeout(timer);
    // }, []);


    useEffect(() => {
        fetchDashboardData();

        // Add focus listener for auto-refresh
        const onFocus = () => fetchDashboardData();
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [userId]);

    const fetchDashboardData = async () => {
        // Accumulator — start from existing cache so partial failures don't erase good data
        const _next = _dashboardCache.has(userId)
            ? { ..._dashboardCache.get(userId) }
            : {};
        const BASE = `http://${window.location.hostname}:8000`;

        // ── 🏃 Priority 1: 跑步卡 fetch 立即平行啟動 ──────────────────────
        // 不等待 plan / body，第一個 API 完成就更新畫面並解除 loading。
        // 若 API 無資料或失敗 → loading 仍設為 false → 顯示預設 0.0 km / --:--
        // ⏱️ 這支決定首頁何時解除 loading：raw fetch 沒有逾時，後端冷啟動／弱網會讓卡片一直閃骨架。
        //    10 秒沒回就放棄，畫面先用快取／預設值。
        const cardioCtrl = new AbortController();
        const cardioTimer = setTimeout(() => cardioCtrl.abort(), 10000);
        fetch(`${BASE}/api/cardio/sessions/${userId}?limit=30`, { signal: cardioCtrl.signal })
            .then(r => r.ok ? r.json() : null)
            .then(d => {
                if (d?.sessions?.length > 0) {
                    const s = d.sessions[0];
                    const _run = {
                        latestDistance: s.metrics?.distance || 0,
                        latestPace: s.metrics?.avgPace || 0,
                    };
                    setRunningData(_run);
                    _next.runningData = _run;
                    setCalendarData(prev => ({ ...prev, cardio: d.sessions }));
                    _next.calendarData = {
                        ...(_next.calendarData || { cardio: [], strength: [] }),
                        cardio: d.sessions,
                    };
                }
            })
            .catch((e) => { console.log('[Dashboard] Cardio fetch:', e); })   // 大括號不能省：箭頭直接回傳 console.log 時，terser 的 pure_funcs 會當成「有人要這個回傳值」而保留下來，log 就跟著進正式版
            .finally(() => { clearTimeout(cardioTimer); setLoading(false); }); // 跑步卡立即可顯示（資料或預設值）

        try {
            // 1. Fetch PLAN data — try localStorage first (has full exercise data), fallback to API
            let plan = null;
            try {
                const cachedPlanStr = localStorage.getItem(`currentPlan_${userId}`);
                if (cachedPlanStr) {
                    const parsed = JSON.parse(cachedPlanStr);
                    if (parsed?.weeks?.length) plan = parsed;
                }
            } catch (_) { }

            if (!plan) {
                try {
                    // 🩹 v2：改走 apiClient（正式 iOS 版以 drvn:// 載入，寫死 hostname:8000 連不到）
                    const planResponse = await apiClient.get(`/api/plan/${userId}/latest`);
                    plan = planResponse?.data?.plan || null;
                } catch (_) { }
            }

            let todayWorkoutData = null;


            if (plan && plan.weeks && plan.weeks.length > 0) {
                // ── Determine which week the user is actually on ──────────────
                let activeWeek = 1;
                for (let w = 1; w <= plan.weeks.length; w++) {
                    const weekDays = (plan.weeks[w - 1]?.days || [])
                        .filter(d => !d.is_rest_day && (d.exercises?.length > 0)).length;
                    const storedCompletions = localStorage.getItem(`completed_workouts_${userId}_week${w}`);
                    let completionCount = 0;
                    try {
                        completionCount = storedCompletions ? JSON.parse(storedCompletions).length : 0;
                    } catch (_) { completionCount = 0; }
                    if (completionCount < weekDays) {
                        activeWeek = w;
                        break;
                    }
                    activeWeek = Math.min(w + 1, plan.weeks.length);
                }
                const currentWeek = plan.weeks[activeWeek - 1]; // Index 0

                if (currentWeek && currentWeek.days) {
                    // Get today's weekday
                    const now = new Date();
                    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
                    const weekdays = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
                    const todayName = weekdays[dayOfWeek];



                    const planDays = plan.days_per_week
                        || plan.weeks?.[0]?.days?.length
                        || 3;

                    const storedTrainingDays = localStorage.getItem(`weeklyTrainingDays_${userId}`);
                    let currentTrainingDays = {};

                    /* 沒有存檔時的預設訓練日。以前這裡自己寫了一張表，
                       跟排課函式（dailyAgenda 的 DEFAULT_STRENGTH_SPREAD）在 4 天／5 天
                       排出來的星期不一樣 —— 首頁說今天要練、週課表說今天休息。
                       現在三個地方共用同一份。 */
                    const defaultFor = (n) => {
                        const wk = defaultStrengthWeekdays(n);
                        const src = wk.length ? wk : defaultStrengthWeekdays(3);
                        const map = {};
                        src.forEach((js, i) => { map[js] = i + 1; });
                        return map;
                    };

                    // Helper: validate that an object looks like a "weekday→dayNum" mapping
                    // (keys are weekday indices 0-6, values are positive integers ≤ planDays)
                    const isWeekdayMap = (obj) => {
                        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
                        const entries = Object.entries(obj);
                        if (entries.length === 0) return false;
                        return entries.every(([k, v]) => {
                            const ki = parseInt(k, 10);
                            const vi = parseInt(v, 10);
                            return Number.isInteger(ki) && ki >= 0 && ki <= 6
                                && Number.isInteger(vi) && vi >= 1 && vi <= 14;
                        });
                    };

                    if (storedTrainingDays) {
                        try {
                            const allTrainingDays = JSON.parse(storedTrainingDays);

                            // Support BOTH storage shapes:
                            //   (A) Flat:    { "1": 1, "2": 2, ... }           ← single-week mapping
                            //   (B) Nested:  { "1": {"1":1,"2":2}, "2": {...} } ← per-week mapping
                            if (isWeekdayMap(allTrainingDays)) {
                                // Shape (A) — flat single mapping shared across weeks
                                currentTrainingDays = allTrainingDays;
                            } else if (allTrainingDays && typeof allTrainingDays === 'object') {
                                // Shape (B) — pick this active week, fall back to week 1
                                const candidate = allTrainingDays[activeWeek]
                                    || allTrainingDays[String(activeWeek)]
                                    || allTrainingDays[1]
                                    || allTrainingDays['1']
                                    || {};
                                if (isWeekdayMap(candidate)) {
                                    currentTrainingDays = candidate;
                                }
                            }

                            // Only fall back to default IF the stored config is genuinely invalid/empty.
                            // We deliberately DO NOT compare key count to planDays here — users may
                            // legitimately schedule consecutive days (e.g. Mon-Tue-Wed-Thu for a 4-day plan),
                            // which differs from the default spread-out mapping.
                            if (!isWeekdayMap(currentTrainingDays)) {

                                currentTrainingDays = defaultFor(planDays);
                            }
                        } catch (e) {
                            console.error('Failed to parse training days', e);
                            currentTrainingDays = defaultFor(planDays);
                        }
                    } else {
                        // No stored config -> Use defaults
                        currentTrainingDays = defaultFor(planDays);
                    }



                    let foundDayNum = null;
                    if (currentTrainingDays[dayOfWeek] !== undefined) {
                        foundDayNum = currentTrainingDays[dayOfWeek];
                    } else if (currentTrainingDays[String(dayOfWeek)] !== undefined) {
                        foundDayNum = currentTrainingDays[String(dayOfWeek)];
                    }

                    if (foundDayNum) {
                        // Day Num is 1-based, array is 0-based
                        const dayData = currentWeek.days[foundDayNum - 1];

                        if (dayData) {
                            // 分化標題：優先顯示具體課程名稱，通用 key 才轉中文
                            const focusLabelMap = {
                                PUSH: '推力訓練', PULL: '拉力訓練', LEGS: '腿部訓練',
                                UPPER: '上肢訓練', LOWER: '下肢訓練', 'FULL BODY': '全身訓練',
                                CARDIO: '有氧訓練', REST: '休息日',
                            };
                            const GENERIC_KEYS = new Set(['PUSH', 'PULL', 'LEGS', 'UPPER', 'LOWER', 'FULL BODY', 'CARDIO', 'REST']);
                            const rawFocus = dayData.focus || dayData.split || '';
                            const isGeneric = GENERIC_KEYS.has(rawFocus?.toUpperCase()?.trim());
                            // Priority: specific name > focus_group > descriptive focus > Chinese for generic key
                            const splitTitle =
                                dayData.name ||
                                dayData.focus_group ||
                                dayData.workout_name ||
                                (!isGeneric && rawFocus) ||
                                focusLabelMap[rawFocus?.toUpperCase()?.trim()] ||
                                rawFocus || null;   // null → card will auto-detect from exercises

                            // 🈶 中文化：見模組層級的 zhSplitTitle（週曆議程卡也共用同一套翻譯）

                            todayWorkoutData = {
                                workout_name: zhSplitTitle(splitTitle),
                                workout_name_en: dayData.focus_group_en || rawFocus || dayData.workout_name_en || "",
                                main_exercise: dayData.main_exercise || (dayData.exercises && dayData.exercises[0]?.name) || "",
                                // ⏱️ v4.8：顯示層用「誠實時長」（逐動作+換器械+暖身），
                                //    不再直接吃引擎的樂觀粗估（少算 8~12 分鐘）
                                estimated_time: estimateDayMinutes(dayData),
                                exercise_count: dayData.exercises?.length || 0,
                                exercises: dayData.exercises || [],
                                is_rest_day: dayData.is_rest_day || rawFocus?.toUpperCase()?.trim() === 'REST' || !(dayData.exercises?.length > 0),
                                workoutRefIndex: foundDayNum - 1
                            };
                        }
                    } else {

                        todayWorkoutData = {
                            workout_name: "休息日",
                            is_rest_day: true,
                            exercises: []
                        };
                    }

                    // Save the full schedule for the week view
                    setWeeklySchedule(currentTrainingDays);
                    _next.weeklySchedule = currentTrainingDays;
                }

                // ── Save determined active week to state ──────────────
                setActivePlanWeek(activeWeek);
                _next.activePlanWeek = activeWeek;
            }

            if (todayWorkoutData) {
                setTodayWorkout(todayWorkoutData);
                setFullWorkoutData(todayWorkoutData);
                _next.todayWorkout = todayWorkoutData;
                setNeedsPlanSetup(false);
            } else {
                // 🎓 無真實計劃 → 首頁一律顯示「建立你的第一份計劃」空卡（圖一）。
                //    （示範計劃只在「計劃頁 + 教學聚光燈進行中」才出現，首頁不放 demo。）
                const _restDay = { workout_name: "休息日", is_rest_day: true, exercises: [] };
                setTodayWorkout(_restDay);
                _next.todayWorkout = _restDay;
                setNeedsPlanSetup(true);
            }

            // 2. Fetch BODY data — 🩹 改走 apiClient（同上，避免寫死 hostname:8000）
            try {
                const bodyResult = (await apiClient.get(`/api/user/inbody-history/${userId}?limit=20`))?.data;
                const history = bodyResult?.history || [];
                if (history.length > 0) {
                    const latestBody = history[0];
                    const _body = { weight: latestBody.weight_kg || 0, bodyFatPercentage: latestBody.body_fat_percent || 0 };
                    setBodyData(_body);
                    _next.bodyData = _body;
                }
            } catch (_) { }

            // 3. (Cardio data is now fetched in parallel at top of function)

            // 4. Fetch recovery and progress (keep existing)
            const [recoveryRes, progressRes] = await Promise.all([
                apiClient.get(`/api/user/${userId}/recovery-status`).catch(() => null),
                apiClient.get(`/api/user/${userId}/week-progress`).catch(() => null)
            ]);

            if (recoveryRes?.data) { setRecoveryStatus(recoveryRes.data); _next.recoveryStatus = recoveryRes.data; }
            if (progressRes?.data) { setWeekProgress(progressRes.data); _next.weekProgress = progressRes.data; }

            // ── Persist to module-level cache ──────────────────────────────
            _dashboardCache.set(userId, _next);
            // Note: setLoading(false) is handled by the parallel cardio promise above.
            // This ensures running card shows immediately after its own fetch resolves.

            // 5. Fetch Latest PR (Manual + Auto merge strategy like PowerPRTracker)
            try {
                const manualPRs = JSON.parse(localStorage.getItem(`manualPRs_${userId}`) || '[]');
                const autoRecords = uStorage(userId).get('trainingRecords', {});
                let allPRs = [...manualPRs.map(p => ({ ...p, timestamp: new Date(p.date).getTime() }))];

                Object.values(autoRecords).forEach(dayRecord => {
                    const sessionDate = dayRecord.date || toLocalDateKey(new Date());
                    if (!dayRecord.exercises) return;
                    dayRecord.exercises.forEach(ex => {
                        const exerciseName = ex.name || ex.exercise_name;
                        if (!exerciseName || !ex.sets || !Array.isArray(ex.sets)) return;
                        ex.sets.forEach(set => {
                            if (!set.weight || set.weight === 0) return;
                            allPRs.push({
                                exercise: exerciseName,
                                weight: parseFloat(set.weight),
                                date: sessionDate,
                                timestamp: new Date(sessionDate).getTime(),
                                source: 'auto'
                            });
                        });
                    });
                });

                // Sort by date desc
                allPRs.sort((a, b) => b.timestamp - a.timestamp);

                if (allPRs.length > 0) {
                    const latest = allPRs[0];
                    const _pr = { exercise_name: latest.exercise, weight: latest.weight, date: latest.date };
                    setPrData(_pr);
                    // Update cache with fresh PR (background, non-blocking)
                    _dashboardCache.set(userId, { ..._dashboardCache.get(userId), prData: _pr });
                }
            } catch (e) {
                console.error("Failed to load PRs", e);
            }

            // 6. Fetch Nutrition & Activity Summary (NEW)
            try {
                // 🔴 toLocalDateKey 已經是本地時區，不可以再減一次 offset（會多校正一天）
                const todayDate = todayKey();

                // Fetch raw sessions for Night Owl detection (parity with Detail Page)
                const [nutriRes, cardioSessions, goalsRes] = await Promise.all([
                    apiClient.get(`/api/nutrition/sql/daily/${userId}?date=${todayDate}`).catch(() => ({ data: null })),
                    apiClient.get(`/api/cardio/sessions/${userId}`).catch(() => ({ data: null })),
                    apiClient.get(`/api/user/nutrition-goals/${userId}`).catch(() => ({ data: null }))
                ]);

                // 2. Aggregated OUT (Cardio + Strength)
                let strengthCalories = 0;
                let latestStrength = null;
                try {
                    const todayStr = toLocalDateKey(new Date());
                    const trainingRecords = uStorage(userId).get('trainingRecords', {});
                    const sessionValues = Object.values(trainingRecords);

                    // Current Day Strength
                    strengthCalories = sessionValues
                        .filter(r => (r.date || r.timestamp?.split('T')[0]) === todayStr)
                        .reduce((acc, r) => acc + (parseFloat(r.calories) || 0), 0);

                    // Latest Session (any date) for Night Owl
                    latestStrength = sessionValues.reduce((latest, s) => {
                        if (!latest) return s;
                        const t1 = new Date(s.timestamp || s.date).getTime();
                        const t2 = new Date(latest.timestamp || latest.date).getTime();
                        return t1 > t2 ? s : latest;
                    }, null);
                } catch (e) {
                    console.error("Failed to parse training records", e);
                }

                // Today's Cardio
                const cardioTodayBurn = (cardioSessions?.data?.sessions || [])
                    .filter(s => (s.date || s.timestamp)?.split('T')[0] === todayDate)
                    .reduce((sum, s) => sum + (s.metrics?.calories || 0), 0);

                let totalOut = (Number(cardioTodayBurn) || 0) + (Number(strengthCalories) || 0);

                // 🔥 Night Owl Logic (Sync with Detail Page)
                // If today's burn is 0 but we have a recent session (within 12h), count it.
                if (totalOut === 0) {
                    const allRawSessions = [];
                    (cardioSessions?.data?.sessions || []).forEach(s => {
                        allRawSessions.push({ timestamp: s.date || s.timestamp, calories: s.metrics?.calories || 0 });
                    });
                    if (latestStrength) {
                        allRawSessions.push({ timestamp: latestStrength.timestamp || latestStrength.date, calories: latestStrength.calories || 0 });
                    }

                    const trueLatest = allRawSessions.reduce((latest, w) => {
                        if (!latest) return w;
                        return new Date(w.timestamp) > new Date(latest.timestamp) ? w : latest;
                    }, null);

                    if (trueLatest) {
                        const hoursSince = (new Date().getTime() - new Date(trueLatest.timestamp).getTime()) / (1000 * 60 * 60);
                        if (hoursSince < 12) {
                            totalOut = trueLatest.calories || 0;
                        }
                    }
                }

                // 3. ENGINE SYNC: Use the same calculation logic as NutritionPageMobile
                const nutritionPlan = calculateFullNutrition({
                    profile: userProfile,
                    userId,
                    workoutBurn: totalOut,
                    mode: goalsRes?.data?.mode, // Let engine handle fallback to journey/defaults
                    inbody: getLatestInBody(userId)
                });

                let committedTargets = committedNutritionGoals(goalsRes?.data?.plan);
                if (!committedTargets) {
                    try { committedTargets = committedNutritionGoals(JSON.parse(localStorage.getItem(`drvn_nutrition_plan_${userId}`) || 'null')); } catch { /* No readable committed plan. */ }
                }
                const _nutri = {
                    in: Number(nutriRes?.data?.summary?.calories) || 0,
                    out: totalOut,
                    target: committedTargets?.calories || nutritionPlan.targetCalories || 2000
                };
                setNutritionData(_nutri);
                _dashboardCache.set(userId, { ..._dashboardCache.get(userId), nutritionData: _nutri });

            } catch (error) {
                console.error('Failed to fetch nutrition data:', error);
            }

            // 7. Load Strength Data for Calendar
            try {
                const autoRecords = uStorage(userId).get('trainingRecords', {});
                // Normalise date: extract YYYY-MM-DD from any ISO timestamp format
                const toDateKey = (raw) => {
                    if (!raw) return null;
                    const s = String(raw);
                    return s.length > 10 ? s.split('T')[0] : s;
                };
                const strengthSessions = Object.values(autoRecords).map(record => ({
                    date: toDateKey(record.date || record.timestamp || record.created_at),
                    exercises: record.exercises || [],
                    total_volume: record.volume || 100,
                })).filter(s => !!s.date);   // drop records with no date
                setCalendarData(prev => ({ ...prev, strength: strengthSessions }));
                const _cached = _dashboardCache.get(userId);
                if (_cached) _dashboardCache.set(userId, {
                    ..._cached,
                    calendarData: { ...(_cached.calendarData || { cardio: [], strength: [] }), strength: strengthSessions }
                });
            } catch (e) {
                console.error("Failed to load strength data for calendar", e);
            }

        } catch (error) {
            console.error('Failed to fetch dashboard data:', error);
            // 🩹 載入失敗：以前塞一張假的英文「Offline / Rest」休息日卡，使用者會以為今天真的休息。
            //    改成誠實的「暫時無法載入」狀態（卡片內有重試鈕）。
            //    已經有真實／快取資料就保留，不拿錯誤狀態蓋掉；只取代初始的「今日計劃」佔位。
            setTodayWorkout(prev => (
                prev && prev.workout_name !== '今日計劃'
                    ? prev
                    : { workout_name: '暫時無法載入', is_rest_day: false, is_unavailable: true, exercises: [] }
            ));
            setLoading(false);
        }
    };

    const handleStartWorkout = () => {
        if (!fullWorkoutData || fullWorkoutData.is_rest_day) {

            return;
        }
        navigate('/training-session-mobile', { state: { day: { ...fullWorkoutData, week_number: activePlanWeek } } });
    };

    const currentHour = new Date().getHours();
    const isDaytime = currentHour >= 6 && currentHour < 18;

    // 頁面容器透明，底色由 BespokeAmbientGlow 的 bg-[#E4DED2] 持有
    const morningGradient = `transparent`;
    const nightGradient = `transparent`;

    // Calculate Today's Theme Colors for Header & UI
    const journey = uStorage(userId).get('master_journey', null);

    const jsDay = new Date().getDay();
    const todayIdx = jsDay === 0 ? 6 : jsDay - 1;
    const todaySched = journey?.schedule?.[todayIdx];
    const todayHasStrength = todaySched?.strength ?? todaySched?.tasks?.strength?.active;
    const todayHasCardio = todaySched?.cardio ?? todaySched?.tasks?.cardio?.active;

    const themeColors = {
        zap: 'linear-gradient(135deg, #FFE66D 0%, #A3E635 100%)',
        strength: 'linear-gradient(135deg, #BFDBFE 0%, #3B82F6 100%)',
        cardio: 'linear-gradient(135deg, #FED7AA 0%, #F97316 100%)',
        rest: isDaytime ? '#64748B' : 'rgba(255,255,255,0.4)'
    };

    const currentThemeBg = todayHasStrength && todayHasCardio ? themeColors.zap
        : todayHasStrength ? themeColors.strength
            : todayHasCardio ? themeColors.cardio
                : themeColors.rest;

    return (
        // ── FashionReveal: Card-First ─────────────────────────────────────────
        // Page renders immediately. Each card has its own RevealCard ghost.
        // Cards are visible from t=0; only interior data crystallizes on load.
        <div style={{ position: 'relative', minHeight: '100dvh' }}>
            <motion.div
                /* 🎬 revealKey：僅在「首次掛載被原生 splash 蓋住」時 +1 一次，
                   splash 收起的瞬間重掛子樹 → 卡牌進場動畫播給使用者看。
                   一般導航 revealKey 恆為 0，不 remount、無雙重刷新。 */
                key={revealKey}
                className="w-full overflow-y-auto overflow-x-hidden relative flex flex-col font-sans text-[#161415] no-scrollbar"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                style={{
                    minHeight: '100dvh',
                    fontFamily: 'var(--font-body)',
                    overflowY: 'auto', WebkitOverflowScrolling: 'touch',
                    background: isDaytime ? morningGradient : nightGradient,
                    backgroundAttachment: 'fixed'
                }}
            >
                {/* Bespoke Ambient Glow — Lissajous 利薩茹曲線動態氛圍燈 */}
                <BespokeAmbientGlow forceLightBg={true} />

                {/* Content Wrapper - Inner Scrollable Area */}
                <div className="w-full px-[20px] flex flex-col gap-[8px]" style={{
                    // 🧘 標題區再多一點呼吸空間：safe-area 之外額外 +16px
                    paddingTop: 'calc(env(safe-area-inset-top, 54px) + 16px)',
                    // 收緊底部留白，讓三張卡牌不會被導航遮住
                    paddingBottom: 'var(--nav-clearance, 120px)',
                }}>

                    {/* 1. TOP NAV - Swiss Editorial Header（icon dock 改絕對定位，名稱可用整排寬度斷行）*/}
                    {/* 🧘 開屏留白：標題區上下多留空間，降低第一眼資訊密度 */}
                    {/* 🧘 v4.8：問候語上移 — 拿掉 pt-6，讓「晚安」與右上四顆圓鈕（top:4）同一水平帶 */}
                    <header className="relative z-10 pt-0 pb-4 px-2">
                        <div className="flex flex-col gap-[2px] w-full" style={{ paddingRight: 6 }}>
                            {/* 「歡迎回來」overline 已移除，只保留問候語 */}

                            {/* 主視覺：問候語 + 名稱「一起」由同一個遮罩往上揭開（hero reveal） */}
                            <SwissMaskLine delay={0.12}>
                                {/* 🅰️ 主頁標題字體：Manrope（Google Fonts 已載） */}
                                {/* 運動風斜體：中文沒有真斜體，靠 skewX。
                                    ⚠️ 字重用 700 不是 900：index.html 只載了 Manrope 200–800，
                                       沒有 900。設 900 的結果是中文掉到 Noto Sans TC 900 ——
                                       全 App 最重的一個字面，32px 的中文筆畫會把字腔塞滿，
                                       看起來像一塊實心磚。700 兩套字體都有實體字重，不會合成。 */}
                                <h2 className="text-[32px] leading-none text-[#161415]"
                                    style={{
                                        fontFamily: '"Manrope", "Noto Sans TC", sans-serif',
                                        fontWeight: 700, letterSpacing: '-0.03em',
                                        transform: 'skewX(-9deg)', transformOrigin: 'left bottom',
                                        display: 'inline-block',
                                        paddingRight: '12px', paddingBottom: '8px',
                                        /* 右上圓鈕是絕對定位（top:4 right:8，兩顆 40px ＋ 一個
                                           6px 間距，再 scale 1.06 → 約 91px）。問候語沒有讓開，
                                           「把那一課補回來」這種長句就會鑽到圓鈕底下。
                                           留出它們的寬度，長句改成換行而不是疊在一起。 */
                                        maxWidth: 'calc(100% - 110px)',
                                        lineHeight: 1.1,
                                    }}>
                                    {(() => {
                                        /* 問候語看「現在發生什麼事」，不是只看時間。
                                           句庫與優先級在 utils/greeting.js。 */
                                        const g = pickGreeting({
                                            dayType: todayType,
                                            strengthDone: !!weekAgenda?.todayStrengthComplete,
                                            runDone: !!weekAgenda?.todayRunComplete,
                                            streak: weekProgress?.streak,
                                            weekDone: weekProgress?.completed,
                                            weekTarget: weekProgress?.target,
                                            isNew: (weekProgress?.streak || 0) === 0
                                                && (weekProgress?.completed || 0) === 0
                                                && !weekAgenda,
                                        });
                                        return t(g.zh, g.en);
                                    })()}
                                </h2>
                                {/* 名稱（依規則斷行）＋ 稱號
                                    🎯 稱號改放「標題右下角」（人物頭像下方），與名稱底部同一水平線：
                                    容器 justify-between 讓名稱靠左、稱號推到最右；items-end 讓兩者底部對齊，
                                    稱號不再偏上。 */}
                                <div className="flex items-end justify-between w-full gap-2.5" style={{ marginTop: '14px', paddingRight: '12px', paddingBottom: '12px' }}>
                                    {/* 細斜體。兩個字各自有坑，都不是寫 CSS 直覺會想到的寫法：
                                        ① 細 —— public/fonts 只有 TenorSans-Regular.ttf 一個檔，
                                           index.css 的 300/400/700 全部指向它，所以 Tenor Sans
                                           的 fontWeight 寫幾都一樣粗。要真的細就得換家族。
                                           Outfit 有 200，是 Google Fonts 已載的實體字重，
                                           而且同樣是幾何無襯線，跟營養頁的 Tenor Sans 調性一致。
                                        ② 斜 —— index.css 幫 Tenor Sans 宣告了 font-style: italic
                                           的 face，但 src 指向那個「正體」檔。瀏覽器以為有真斜體
                                           就不合成傾斜，寫 italic 會完全沒有斜度。所以用 skewX，
                                           這也是設計系統對中文的規定（中文沒有真斜體，靠 skew）。
                                        中文沒有字符，會落到 Noto Sans TC 300。 */}
                                    <h1 className="text-[44px] leading-none"
                                        style={{
                                            color: '#161415',
                                            fontFamily: "'Outfit', 'Noto Sans TC', sans-serif",
                                            fontWeight: 200, letterSpacing: '-0.01em',
                                            transform: 'skewX(-9deg)', transformOrigin: 'left bottom',
                                            display: 'inline-block',
                                        }}>
                                        {nameLines.map((ln, i) => (
                                            <span key={i} style={{ display: 'block' }}>{ln}</span>
                                        ))}
                                    </h1>
                                    {/* 🏅 稱號 — 瑞士極簡：無框無 emoji，Cormorant Garamond 斜體 ＋
                                        依稱號屬性上色 ＋ 左側一小段同色 hairline 收筆 */}
                                    {featuredTitle?.showOnHome && featuredTitle?.label && (() => {
                                        const tagColor = titleTagColor(featuredTitle);
                                        const glowColor = titleGlowColor(featuredTitle);
                                        return (
                                            /* 🏅 身份稱號 — 點一下可去換稱號；背後帶依屬性上色的呼吸光，
                                               像一枚「活著的」身份徽記而非死標籤 */
                                            <motion.button {...pressProps('pill')}
 onClick={() => {
 import('../utils/telemetry').then(({ track }) => track('title_tap', { title: featuredTitle.id })).catch(() => {});
 // 稱號是照社群「個人」頁的成就階級給的 → 點稱號就去那裡看自己的成就與下一階
 navigate('/social-mobile', { state: { activeTab: 'profile' } });
 }}
 className="relative inline-flex items-center flex-shrink-0"
 style={{
 /* 字體放大後往下移一點，和 Miaaaaa 名稱底部更貼齊 */
 top: 8, marginBottom: 0, cursor: 'pointer',
 background: 'transparent', border: 'none', padding: '3px 5px',
 }}
 aria-label="看我的成就與稱號"
 >
                                                {/* 💡 呼吸光 — 浮在「文字正後方」的一圈柔光（依屬性上色），
                                                    像稱號背後透出來的微光暈，會緩緩呼吸。 */}
                                                <motion.span aria-hidden
                                                    style={{
                                                        position: 'absolute', left: '50%', top: '50%',
                                                        width: '132%', height: '200%', transform: 'translate(-50%, -50%)',
                                                        borderRadius: 9999, pointerEvents: 'none', filter: 'blur(11px)',
                                                        background: `radial-gradient(58% 58% at 50% 50%, ${glowColor}88 0%, ${glowColor}33 48%, transparent 76%)`,
                                                    }}
                                                    animate={{ opacity: [0.3, 0.78, 0.3], scale: [0.92, 1.07, 0.92] }}
                                                    transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
                                                />
                                                <span style={{
                                                    // 🈶 稱號 · Chiron Sung HK SemiBold Italic · 炭黑字
                                                    // （不加 text-shadow：字體下方不要有陰影）
                                                    position: 'relative',
                                                    display: 'inline-block',
                                                    fontFamily: '"ChironSungHK", "Noto Serif TC", serif',
                                                    fontWeight: 600, fontStyle: 'italic', fontSize: 20,
                                                    color: '#161415', letterSpacing: '0.06em', lineHeight: 1, whiteSpace: 'nowrap',
                                                    textShadow: 'none',
                                                }}>
                                                    {featuredTitle.poeticZh || featuredTitle.label}
                                                    {/* ✍️ 手繪底線 —— 像用筆順手劃過去的一道，不是一條 CSS 直線。
                                                        三個細節讓它看起來是手劃的：
                                                          ① 路徑本身有起伏，兩端收細（筆尖離紙）
                                                          ② 下面疊一道更淡、稍微錯位的重複筆觸（手不會一次劃準）
                                                          ③ 進場時從左往右畫出來，0.7 秒，house easing
                                                        preserveAspectRatio="none" 讓它跟著稱號長度伸縮，
                                                        四個字跟三個字都不會露出線頭。 */}
                                                    <motion.svg
                                                        aria-hidden
                                                        viewBox="0 0 120 12" preserveAspectRatio="none"
                                                        style={{
                                                            position: 'absolute', left: '-2%', right: 0, bottom: -9,
                                                            width: '104%', height: 11, overflow: 'visible',
                                                            pointerEvents: 'none',
                                                        }}
                                                        initial={reduceMotion ? false : { opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        transition={{ duration: 0.25 }}
                                                    >
                                                        {/* 主筆觸 */}
                                                        <motion.path
                                                            d="M2,7.4 C16,4.6 33,3.4 52,4.1 C71,4.8 90,6.4 118,4.2"
                                                            fill="none" stroke={tagColor} strokeWidth={2.1}
                                                            strokeLinecap="round" vectorEffect="non-scaling-stroke"
                                                            initial={reduceMotion ? false : { pathLength: 0 }}
                                                            animate={{ pathLength: 1 }}
                                                            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
                                                        />
                                                        {/* 回筆 —— 淡一點、錯開一點，手劃才有的重疊 */}
                                                        <motion.path
                                                            d="M6,9.6 C22,7.8 41,7.0 63,7.6 C84,8.2 99,9.0 113,7.4"
                                                            fill="none" stroke={tagColor} strokeWidth={1.2}
                                                            strokeLinecap="round" opacity={0.34}
                                                            vectorEffect="non-scaling-stroke"
                                                            initial={reduceMotion ? false : { pathLength: 0 }}
                                                            animate={{ pathLength: 1 }}
                                                            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.24 }}
                                                        />
                                                    </motion.svg>
                                                </span>
                                            </motion.button>
                                        );
                                    })()}
                                </div>
                            </SwissMaskLine>
                        </div>
                        {/* 右上兩顆 icon —— 音樂 ＋ 頭像。
                            手錶鈕已移除（功能不再提供）；動作庫移到健身頁工具列，
                            那裡才是「要找動作」時人會去的地方。 */}
                        <motion.div className="flex items-center gap-1.5 flex-shrink-0"
                            style={{ position: 'absolute', top: 4, right: 8, transform: 'scale(1.06)', transformOrigin: 'right top' }} /* 絕對定位右上，icon 放大一點點 */
                        >
                            {(() => {
                                /* 🎬 2026-07：右上圓鈕取消進場動畫 — 毛玻璃圓鈕任何縮放動畫
                                   都要每幀重算 blur、體感卡頓，乾脆直接靜態顯示（popItem 留空）。 */
                                const popItem = {};
                                return (<>
                            {/* 🚀 上架收斂：DEV 模擬回饋預覽鈕已移除（DevMomentPreview） */}

                            {/* 🎵 HomeMusicButton — 取代星星按鈕位置的音樂播放器 */}
                            <motion.div variants={popItem}><HomeMusicButton onHide={() => { }} /></motion.div>

                            <motion.div variants={popItem}
                                className="lg-circle w-10 h-10 rounded-full p-[2px] cursor-pointer transition-all active:scale-95 shrink-0"
                                onClick={() => navigate('/profile-mobile')}
                            >
                                <div className="w-full h-full rounded-full flex items-center justify-center overflow-hidden bg-[#CFC6B8]" style={{ position: 'relative', zIndex: 2 }}>
                                    <AvatarImage userProfile={enrichedProfile} />
                                </div>
                                <span className="lg-dome" aria-hidden="true" />
                            </motion.div>
                                </>);
                            })()}
                        </motion.div>
                    </header>

                    {/* 🧭 教學進度浮窗 */}
                    <AnimatePresence>
                        {showTutPanel && (
                            <TutorialProgressPanel
                                key="tut-panel-home"
                                onClose={() => setShowTutPanel(false)}
                                navigate={navigate}
                                style={{
                                    bottom: 'calc(env(safe-area-inset-bottom, 24px) + 102px)',
                                }}
                                onReplayAll={() => {
                                    setShowTutPanel(false);
                                    resetOnboarding();
                                    window.dispatchEvent(new CustomEvent(ONBOARDING_EVENT));
                                }}
                            />
                        )}
                    </AnimatePresence>

                    {/* 🥇 每日打卡金屬面板 — 活動紀錄月曆點擊開啟 */}
                    <DailyCheckinPanel
                        open={showDailyCheckin}
                        onClose={() => { setShowDailyCheckin(false); setCheckinTick((t) => t + 1); }}
                        cell={weekAgenda?.week?.[weekAgenda?.todayIdx] || null}
                        userId={userId}
                        navigate={navigate}
                    />

                    {/* 🔔 每日打卡未完成 · 滿版提醒（下午3點/晚上8點各一次） */}
                    <CheckinReminderOverlay
                        open={!!checkinReminder}
                        items={checkinReminder?.items || []}
                        slot={checkinReminder?.slot || '15'}
                        onClose={() => { setCheckinReminder(null); setCheckinTick((t) => t + 1); }}
                        onGo={(it) => { setCheckinReminder(null); try { it.go?.(); } catch { /* */ } }}
                    />

                    {/* 1.5. EDITORIAL WEATHER STRIP — 與上方每日摘要視為一體（移除分隔線、緊貼） */}
                    {!isCardHidden('insight') && (
                    <HomeEditableBlock {...blockProps('insight')}>
                    <motion.section
                        className="z-10 mt-1 mb-6 px-1"
                        /* 🎬 開場序列最後一位：兩張主卡滑入後才慢慢浮現；
                           播完一輪（14s，互動過則保留）→ 慢慢淡出收合，減少開屏資訊量 */
                        initial={{ opacity: 0, y: 6, filter: 'blur(6px)' }}
                        animate={alertsGone
                            ? { opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }
                            : alertsIntroReady
                                ? { opacity: 1, y: 0, filter: 'blur(0px)' }
                                : { opacity: 0, y: 6, filter: 'blur(6px)' }}
                        transition={alertsGone
                            ? { duration: 1.1, ease: [0.16, 1, 0.3, 1] }
                            : { duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                        style={{ overflow: 'hidden', pointerEvents: alertsGone ? 'none' : 'auto' }}
                        onPointerDown={() => { alertsKeepRef.current = true; }}
                    >
                        {/* 🔁 天氣 + 資訊輪播 — 共用一張卡，可左右滑動 + 自動輪播。
                              第 0 頁天氣（永遠掛載，資料不重抓），其餘是提醒。純文字、無圖示。 */}
                        {(() => {
                            const totalPages = 2 + homeAlerts.length;
                            /* 扁一點：字維持大（19px），但只留那一行字 ——
                               底下那條三系統狀態列被拿掉了，整張卡才不會那麼重。
                               中標 11 ＋ 大字 19（最多兩行）＋ 手寫波浪 7 ＋ 上下內距 18 → 86；
                               天氣卡 minHeight 52、提醒卡最高 38 的色條也都在裡面。 */
                            const CARD_H = 86;

                            // 單張卡內容（每日摘要 → 天氣 → 提醒）
                            const renderPage = (idx) => {
                                if (idx === 0) {
                                    return <DailyInsightCard userId={userId} recoveryStatus={recoveryStatus} todayWorkout={todayWorkout} />;
                                }
                                if (idx === 1) {
                                    return <WeatherCard variant="editorial" className="w-full !h-full" />;
                                }
                                const a = homeAlerts[idx - 2];
                                if (!a) return null;
                                return (
                                    <div
                                        onClick={() => {
                                            if (a.id === 'leaguePromotion') {
                                                try { dismissLeaguePromotion(userId); } catch (_) {}
                                                setHomeAlerts((prev) => prev.filter((x) => x.id !== 'leaguePromotion'));
                                            }
                                            // 帶 _seenKey 的提醒（如季報）→ 點擊後標記已看，下次不再出現
                                            if (a._seenKey) {
                                                try { localStorage.setItem(a._seenKey, '1'); } catch (_) {}
                                                setHomeAlerts((prev) => prev.filter((x) => x.id !== a.id));
                                            }
                                            // 自己帶「看過了」處理的提醒（如週期結束 → 去看回饋）
                                            if (typeof a.onOpen === 'function') {
                                                try { a.onOpen(); } catch (_) {}
                                                setHomeAlerts((prev) => prev.filter((x) => x.id !== a.id));
                                            }
                                            navigate(a.route, a.routeState ? { state: a.routeState } : undefined);
                                        }}
                                        className="w-full h-full flex items-center justify-between gap-3 px-5 rounded-[18px] cursor-pointer relative overflow-hidden"
                                        style={{
                                            /* 實心白底 —— 半透明玻璃疊在首頁的暖色漸層上，
                                               底色會一路透上來，提示卡等於沒有自己的底，
                                               字也跟著背景一起變。白底才站得住。 */
                                            background: '#FFFFFF',
                                            border: '1px solid rgba(22,20,21,0.06)',
                                            boxShadow: '0 6px 18px -12px rgba(22,20,21,0.28)',
                                        }}
                                    >
                                        {/* 提示卡不放小標 —— 一行大字直接講「要去幹嘛」，
                                            下面一行小字補為什麼。小標只是把同一件事講兩次。 */}
                                        <div className="flex items-center gap-3.5 min-w-0 relative">

                                            <div className="flex-1 min-w-0 text-left">
                                                {/* 中標：這是哪一個系統／哪一件事。homeAlerts 每一則本來就帶
                                                    eyebrow（「跑步」「下次訓練」「季報出爐」…），以前沒被畫出來。 */}
                                                {a.eyebrow && (
                                                    <p style={{
                                                        color: '#F95C4B', fontSize: 11, fontWeight: 600,
                                                        letterSpacing: '0.06em', margin: '0 0 3px',
                                                    }}>
                                                        {a.eyebrow}
                                                    </p>
                                                )}
                                                {/* 字要大，但要細；重點記號改成底下那道手寫波浪 */}
                                                <span style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
                                                    <p className="truncate" style={{
                                                        color: '#161415', fontSize: 19, fontWeight: 300,
                                                        letterSpacing: '-0.015em', lineHeight: 1.22, margin: 0,
                                                    }}>
                                                        {/* 跳色：動作上色、理由墨黑（與每日提示同一支 splitHint） */}
                                                        {(() => {
                                                            const { lead, rest } = splitHint(a.title);
                                                            return (<>
                                                                <span style={{ color: '#F95C4B', fontWeight: 600 }}>{lead}</span>
                                                                {rest}
                                                            </>);
                                                        })()}
                                                    </p>
                                                    <HandWave color="#F95C4B" height={7} style={{ marginTop: 1 }} />
                                                </span>
                                                {a.detail && (
                                                    <p className="truncate" style={{
                                                        marginTop: 3, fontSize: 11.5, fontWeight: 400,
                                                        color: 'rgba(22,20,21,0.45)', letterSpacing: '-0.005em',
                                                    }}>
                                                        {a.detail}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <ChevronRight size={15} strokeWidth={2} style={{ color: 'rgba(22,20,21,0.28)' }} className="shrink-0 relative" />
                                    </div>
                                );
                            };

                            // ♾️ 雙向無限 loop：頭尾各加一張 clone → [last, 0..n-1, first]。
                            //    落在 clone 時無縫跳回真實頁（右滑到底→回第一、左滑到頭→到最後）。
                            //    多張才需要 clone；單張不做。
                            carouselCountRef.current = totalPages; // 供 loop 計算真實頁數
                            const loopable = totalPages > 1;
                            const order = loopable
                                ? [totalPages - 1, ...Array.from({ length: totalPages }, (_, i) => i), 0]
                                : [0];
                            return (
                                // 原生 scroll-snap 輪播：iOS 阻尼感 + scroll-snap-stop:always（一次只滑一張）
                                <div
                                    ref={carouselRef}
                                    onScroll={onCarouselScroll}
                                    className="no-scrollbar flex"
                                    style={{
                                        height: CARD_H,
                                        overflowX: 'auto', overflowY: 'hidden',
                                        scrollSnapType: 'x mandatory',
                                        WebkitOverflowScrolling: 'touch',
                                        touchAction: 'pan-x',
                                        overscrollBehaviorX: 'contain',
                                        scrollBehavior: 'smooth', /* 阻尼/平順感 */
                                    }}
                                >
                                    {order.map((pageIdx, slot) => (
                                        <div
                                            key={slot}
                                            data-loop-slot={slot}
                                            data-real-page={pageIdx}
                                            style={{ flex: '0 0 100%', width: '100%', height: CARD_H, scrollSnapAlign: 'center', scrollSnapStop: 'always' }}
                                        >
                                            {renderPage(pageIdx)}
                                        </div>
                                    ))}
                                </div>
                            );
                        })()}
                    </motion.section>
                    </HomeEditableBlock>
                    )}

                    {/* 1.6. JOURNEY — Pill Strip */}
                    {!isCardHidden('week') && (
                    <HomeEditableBlock {...blockProps('week')}>
                    {(() => {
                        const journey = uStorage(userId).get('master_journey', null);

                        const jsDay = new Date().getDay();
                        const todayIdx = jsDay === 0 ? 6 : jsDay - 1;
                        const dayAbbr = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                        const now = new Date();
                        const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
                        const monday = new Date(now);
                        monday.setDate(now.getDate() + mondayOffset);
                        const weekItems = Array.from({ length: 7 }, (_, i) => {
                            const d = new Date(monday);
                            d.setDate(monday.getDate() + i);
                            return { date: d.getDate(), day: dayAbbr[i] };
                        });

                        return (
                            <motion.section
                                className="z-10 mb-4"
                                onClick={() => navigate('/master-journey-mobile')}
                                style={{ cursor: 'pointer' }}
                                initial="hidden" animate="show"
                                variants={{ hidden: {}, show: { transition: { delayChildren: 0.34, staggerChildren: 0.05 } } }}
                            >
                                {/* 七顆等分縮放，限制最大寬度以保留修長比例。 */}
                                <div className="home-week-glass-row">
                                    {weekItems.map(({ date, day }, i) => {
                                        const isToday = i === todayIdx;

                                        // jsDay: 0=Sun, 1=Mon, ..., 6=Sat
                                        // weekItems loop i: 0=Mon, 1=Tue, ..., 5=Sat, 6=Sun
                                        const jsDayMatch = (i + 1) % 7;
                                        const hasStrengthInPlan = weeklySchedule[jsDayMatch] !== undefined || weeklySchedule[String(jsDayMatch)] !== undefined;

                                        const sched = journey?.schedule?.[i];
                                        // 🗓️ dailyAgenda 單一真相源優先（跑步磚已依「繞開重訓/腿日」演算法落位）
                                        const agendaCell = weekAgenda?.week?.[i];
                                        const hasStrength = !!agendaCell?.strength || hasStrengthInPlan || (sched?.strength ?? sched?.tasks?.strength?.active);
                                        const hasCardio = !!agendaCell?.run || (sched?.cardio ?? sched?.tasks?.cardio?.active);

                                        /* 這一天是什麼日 —— 七顆膠囊原本長得一模一樣，
                                           只靠一個 14px 圖示區分，遠看是七顆白藥丸。
                                           改成底部色條，顏色＝訓練類型，全 app 同一套語意：
                                           墨黑＝重訓、珊瑚＝跑步、無色條＝休息。 */
                                        /* 一天可能同時有重訓與跑步 —— 以前只畫一個圖示（重訓優先），
                                           那天要做兩件事這件事在首頁完全看不出來。
                                           改成畫得下兩個：槓鈴（墨黑）＋火焰（珊瑚）。
                                           ⚠️ 膠囊寬度是固定的 class，七顆一律 48px ——
                                              不能讓「有兩個圖示的那天」自己變寬，那樣整排就歪了。 */
                                        const dayIcons = (hasStrength || hasCardio)
                                            ? [
                                                hasStrength ? { Icon: Dumbbell, color: '#161415' } : null,
                                                hasCardio ? { Icon: Flame, color: '#F95C4B' } : null,
                                            ].filter(Boolean)
                                            : [{ Icon: Moon, color: 'rgba(22,20,21,0.28)' }];


                                        return (
                                            <motion.button type="button" aria-label={`${day} ${date}日課表`} aria-current={isToday ? 'date' : undefined} key={i} className="home-week-glass-button"
                                                variants={{ hidden: { opacity: 0, y: -14 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } } }}
                                                whileTap={{ scale: 0.9, transition: { duration: 0.18, ease: 'easeOut' } }}
                                                whileHover={isToday ? {} : { y: -3, transition: { duration: 0.2, ease: 'easeOut' } }}
                                                onClick={(e) => { e.stopPropagation(); setAgendaDayIdx(i); }}
                                            >
                                                <div
                                                    className={`home-week-glass-pill${isToday ? ' is-today' : ''}`}
                                                >
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: 1, marginBottom: 2 }}>
                                                        {dayIcons.map(({ Icon, color }, k) => (
                                                            <Icon key={k} size={11} strokeWidth={2.2}
                                                                color={isToday ? '#161415' : color} />
                                                        ))}
                                                    </span>
                                                    {/* 星期是輔助、日期才是主角。
                                                        原本 11 / 14 只差 1.27×，兩行讀起來是同一層（§1 要 ≥1.5×）。
                                                        改成 11 / 17（1.55×）＋ 透明度拉開，一眼先看到日期。 */}
                                                    <span
                                                        className="text-[11px] font-semibold uppercase"
                                                        style={{ color: '#161415', opacity: isToday ? 0.72 : 0.45, lineHeight: 1, letterSpacing: '0.02em' }}
                                                    >
                                                        {day}
                                                    </span>
                                                    <span
                                                        className="text-[17px] font-bold"
                                                        style={{ color: '#161415', opacity: 1, lineHeight: 1.1, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}
                                                    >
                                                        {date}
                                                    </span>
                                                    {/* 底下那條訓練類型色條拿掉了 —— 它跟上面的圖示講同一件事
                                                        （槓鈴／火焰／月亮，而且圖示本身就已經是墨黑／珊瑚），
                                                        兩層疊起來整排膠囊看起來很重。 */}
                                                </div>
                                            </motion.button>
                                        );
                                    })}
                                </div>
                            </motion.section>
                        );
                    })()}
                    </HomeEditableBlock>
                    )}

                    {/* 2. CORE: Today's Focus — Card-First RevealCard */}
                    {/* ─────────────────────────────────────────────────────────
                    Card shell (orange bg + rounded corners) appears at t=0.
                    Ghost shimmer covers interior during backend fetch.
                    When loading=false: ghost lifts away, real content crystallizes.
                    ───────────────────────────────────────────────────────── */}
                    <motion.section
                        className="z-10 flex flex-col gap-5 mb-6"
                        data-onboard="home-today"
                        /* 外層只做淡入；兩張主卡各自「由左至右」滑入（見下方 motion.div） */
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.05, duration: 0.35, ease: 'easeOut' }}
                    >
                        {/* 🗓️ 每日打卡入口 — 點週曆任一天，彈出該日議程（要練什麼/跑什麼/警告/一鍵開始） */}
                        {ReactDOM.createPortal(
                            <AnimatePresence>
                                {agendaDayIdx !== null && (() => {
                                    const cell = weekAgenda?.week?.[agendaDayIdx] || { strength: null, run: null, warnings: [] };
                                    const isTodayCell = agendaDayIdx === weekAgenda?.todayIdx;
                                    const L = ['週一', '週二', '週三', '週四', '週五', '週六', '週日'];
                                    const km = cell.run ? (parseFloat(cell.run.distance_km ?? cell.run.distanceKm ?? 0) || null) : null;
                                    // ✅ 今日總進度（只在點「今天」時顯示）— 與打卡面板共用
                                    //    getTodayCheckinItems 單一真相源（含 InBody 到期/週回顧等週期事件）。
                                    const progress = (() => {
                                        if (!isTodayCell) return null;
                                        try { return getTodayCheckinItems(cell, userId, null); } catch { return null; }
                                    })();
                                    return (
                                        <motion.div key="agenda-sheet"
                                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                            onClick={() => setAgendaDayIdx(null)}
                                            style={{ position: 'fixed', inset: 0, zIndex: 2147483600, background: 'rgba(22,20,21,0.35)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
                                        >
                                            {/* 💧 Liquid Glass 卡 — 置中浮出，玻璃分層 + 內光暈 */}
                                            <motion.div
                                                initial={{ scale: 0.88, opacity: 0, y: 14 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.92, opacity: 0, y: 8 }}
                                                transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                                                onClick={(e) => e.stopPropagation()}
                                                style={{
                                                    width: '100%', maxWidth: 360,
                                                    background: 'linear-gradient(145deg, rgba(255,255,255,0.72) 0%, rgba(246,244,241,0.58) 100%)',
                                                    backdropFilter: 'blur(28px) saturate(180%)', WebkitBackdropFilter: 'blur(28px) saturate(180%)',
                                                    border: '1px solid rgba(255,255,255,0.65)',
                                                    borderRadius: 28, padding: '22px 22px 24px',
                                                    boxShadow: '0 24px 60px rgba(22,20,21,0.28), inset 0 1px 1px rgba(255,255,255,0.8), inset 0 -1px 1px rgba(22,20,21,0.05)',
                                                }}
                                            >
                                                <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.26em', color: 'rgba(22,20,21,0.4)', margin: 0 }}>
                                                    {L[agendaDayIdx]}{isTodayCell ? ' · 今天' : ''}
                                                </p>
                                                <h2 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 700, fontSize: 24, color: '#161415', margin: '4px 0 14px' }}>
                                                    {cell.strength && cell.run ? '雙 Session 日' : cell.strength ? '重訓日' : cell.run ? '跑步日' : '休息日'}
                                                </h2>

                                                {cell.strength && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: 'rgba(249,92,75,0.10)', border: '1px solid rgba(249,92,75,0.25)', marginBottom: 8 }}>
                                                        <Dumbbell size={17} strokeWidth={2.2} color="#D94030" style={{ flexShrink: 0 }} />
                                                        <div style={{ flex: 1 }}>
                                                            <p style={{ fontSize: 13, fontWeight: 700, color: '#161415', margin: 0 }}>第 {cell.strength.dayNumber} 天 · {zhSplitTitle(cell.strength.focus) || '重訓'}</p>
                                                            <p style={{ fontSize: 11, color: 'rgba(22,20,21,0.5)', margin: '2px 0 0' }}>{cell.strength.done ? '✓ 已完成' : cell.strength.legDay ? '腿日 — 今天別排高強度跑' : `${(cell.strength.exercises || []).length} 個動作`}</p>
                                                        </div>
                                                        {isTodayCell && !cell.strength.done && (
                                                            <motion.button {...pressProps('row')} onClick={() => { setAgendaDayIdx(null); navigate('/luxury-plan-view-mobile'); }}
 style={{ padding: '9px 16px', borderRadius: 99, border: 'none', background: '#F95C4B', color: '#F6F4F1', fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', cursor: 'pointer' }}>
                                                                開始
                                                            </motion.button>
                                                        )}
                                                    </div>
                                                )}

                                                {cell.run && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: 'rgba(142,155,168,0.14)', border: '1px solid rgba(142,155,168,0.35)', marginBottom: 8 }}>
                                                        <Activity size={17} strokeWidth={2.2} color="#161415" style={{ flexShrink: 0, opacity: 0.7 }} />
                                                        <div style={{ flex: 1 }}>
                                                            <p style={{ fontSize: 13, fontWeight: 700, color: '#161415', margin: 0 }}>{cell.run.title || cell.run.type}{km ? ` · ${km}km` : ''}</p>
                                                            <p style={{ fontSize: 11, color: 'rgba(22,20,21,0.5)', margin: '2px 0 0' }}>{cell.run.status === 'completed' ? '✓ 已完成' : cell.strength ? '排在重訓之後 · 輕鬆配速' : '按課表配速執行'}</p>
                                                        </div>
                                                        {isTodayCell && cell.run.status !== 'completed' && (
                                                            <motion.button {...pressProps('row')} onClick={() => { setAgendaDayIdx(null); navigate('/cardio-tracker-mobile'); }}
 style={{ padding: '9px 16px', borderRadius: 99, border: '1px solid rgba(22,20,21,0.25)', background: 'transparent', color: '#161415', fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', cursor: 'pointer' }}>
                                                                去跑步
                                                            </motion.button>
                                                        )}
                                                    </div>
                                                )}

                                                {!cell.strength && !cell.run && (
                                                    <p style={{ fontSize: 12, color: 'rgba(22,20,21,0.55)', lineHeight: 1.7, margin: '0 0 8px' }}>
                                                        完全休息 — 修復在今天發生。伸展、散步、睡好，都算訓練的一部分。
                                                    </p>
                                                )}

                                                {cell.warnings.length > 0 && cell.warnings.map((w, wi) => (
                                                    <p key={wi} style={{ fontSize: 11, color: '#D94030', margin: '6px 0 0', lineHeight: 1.5, fontWeight: 600 }}>{w}</p>
                                                ))}
                                                {/* ✅ 今日總進度 — 溫柔的達成度回顧，不是催促 */}
                                                {/* ✅ 今日進度 — 瑞士極簡：hairline 分隔、SVG 圖示、coral 完成語義（無 emoji） */}
                                                {progress && progress.length > 0 && (
                                                    <div style={{ marginTop: 12, borderTop: '1px solid rgba(22,20,21,0.10)', paddingTop: 12 }}>
                                                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                                                            <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.24em', color: 'rgba(22,20,21,0.4)', margin: 0 }}>
                                                                今日進度
                                                            </p>
                                                            <p className="tabular-nums" style={{ fontSize: 11, fontWeight: 900, color: '#161415', margin: 0 }}>
                                                                {progress.filter(p => p.done).length}<span style={{ opacity: 0.35 }}> / {progress.length}</span>
                                                            </p>
                                                        </div>
                                                        <div style={{ borderTop: '1px solid rgba(22,20,21,0.08)' }}>
                                                            {progress.map((p, pi) => {
                                                                const PIcon = p.Icon || Activity;
                                                                {/* 🎨 任務類別色彩區隔：圖示磚 + 類別色籤（營養=橄欖綠、
                                                                    身體數據=古銅、重訓=珊瑚、跑步=石板灰、回顧=柔金） */}
                                                                const cat = categoryStyle(p.key || p.sub);
                                                                return (
                                                                    <div key={p.key || pi} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 2px', borderBottom: '1px solid rgba(22,20,21,0.08)' }}>
                                                                        <div style={{
                                                                            width: 24, height: 24, borderRadius: 8, flexShrink: 0,
                                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                            background: p.done ? 'rgba(22,20,21,0.05)' : cat.bg,
                                                                        }}>
                                                                            <PIcon size={13} strokeWidth={2.2} color={p.done ? 'rgba(22,20,21,0.35)' : cat.text} />
                                                                        </div>
                                                                        <span style={{ flex: 1, fontSize: 11.5, fontWeight: 700, color: '#161415', opacity: p.done ? 0.5 : 1, textDecoration: p.done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                            {p.label}
                                                                        </span>
                                                                        {p.done ? (
                                                                            <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 900, letterSpacing: '0.14em', color: '#F95C4B' }}>
                                                                                完成
                                                                            </span>
                                                                        ) : (
                                                                            <span style={{
                                                                                flexShrink: 0, fontSize: 9, fontWeight: 900, letterSpacing: '0.12em',
                                                                                padding: '3px 8px', borderRadius: 99,
                                                                                color: cat.text, background: cat.bg,
                                                                            }}>
                                                                                {p.sub}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                        {progress.every(p => p.done) && (
                                                            <p style={{ fontSize: 11, color: '#F95C4B', fontWeight: 800, letterSpacing: '0.08em', margin: '8px 0 0', textAlign: 'center' }}>今天的你，全部到位。</p>
                                                        )}
                                                    </div>
                                                )}
                                                {isTodayCell && weekAgenda?.nutrition?.message && (
                                                    <p style={{ fontSize: 11, color: 'rgba(22,20,21,0.45)', margin: '10px 0 0', lineHeight: 1.6, borderTop: '1px solid rgba(22,20,21,0.08)', paddingTop: 10 }}>
                                                        {weekAgenda.nutrition.message}
                                                    </p>
                                                )}
                                            </motion.div>
                                        </motion.div>
                                    );
                                })()}
                            </AnimatePresence>,
                            document.body
                        )}

                        {/* 🛡️ 今日負荷警示條 — dailyAgenda 的跨模態安全防護浮出水面 */}
                        {weekAgenda?.warnings?.length > 0 && (
                            <div style={{
                                marginBottom: 12, padding: '9px 14px', borderRadius: 12,
                                background: 'rgba(249,92,75,0.10)', border: '1px solid rgba(249,92,75,0.30)',
                                display: 'flex', alignItems: 'flex-start', gap: 8,
                            }}>
                                <span style={{ fontSize: 12, flexShrink: 0, lineHeight: '16px' }}>⚠️</span>
                                <p style={{ fontSize: 11, lineHeight: 1.55, color: '#161415', opacity: 0.75, margin: 0, fontWeight: 600 }}>
                                    {weekAgenda.warnings[0].replace(/^⚠️\s*/, '')}
                                </p>
                            </div>
                        )}

                        {/* 🔁 週回顧提案：把自主 Block 換進計劃（portal sheet，一週最多一次） */}
                        <WeeklyBlockProposal
                            open={!!blockProposal}
                            freestyleCount={blockProposal?.freestyleCount || 2}
                            userId={userId}
                            onClose={() => setBlockProposal(null)}
                        />

                        {/* ── TODAY'S FOCUS — orange hero card ── */}
                        {/* 🗓️ 日型排序＋調光：今天的「主角卡」永遠排最上面 —
                            跑步日 → 跑步卡在上（重訓卡 order:1 退到下方並降 opacity）；
                            其餘（重訓/雙/補課/休息）→ 重訓卡照舊在上。
                            父層是 flex-col，用 CSS order 重排、不動 DOM 結構。 */}
                        {/* 🎬 開場：第一張主卡由左至右滑入 */}
                        <motion.div
                            initial={{ opacity: 0, x: -32 }}
                            animate={{ opacity: todayType === 'run' ? 0.55 : 1, x: 0 }}
                            transition={{ delay: 0.28, duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
                            style={{ order: todayType === 'run' ? 1 : 0 }}>
                        <RevealCard
                            isReady={!loading}
                            staggerIndex={0}
                            className="z-20"
                            ghost={
                                // Ghost matches the orange card's exact bg + shape
                                <div style={{
                                    background: 'linear-gradient(135deg, #E4DED2 0%, #D8D0C0 100%)',
                                    borderRadius: 28,
                                    height: '100%',
                                    minHeight: 210,
                                    padding: '1.25rem 1.5rem 1.25rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 10,
                                    overflow: 'hidden',
                                    border: '1px solid rgba(22, 20, 21, 0.08)'
                                }}>
                                    {/* subtitle: "TODAY'S FOCUS / 日期" */}
                                    <GhostLine width="9rem" height="0.6rem" radius="0.3rem" theme="dark" delay={0} />
                                    {/* title: "Legs — Quads / Hamstrings / Glutes" */}
                                    <GhostLine width="88%" height="1.75rem" radius="0.6rem" theme="dark" delay={0.05} />
                                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 7 }}>
                                        {/* exercise list items */}
                                        <GhostLine width="7rem" height="0.7rem" radius="0.35rem" theme="dark" delay={0.10} />
                                        <GhostLine width="8.5rem" height="0.7rem" radius="0.35rem" theme="dark" delay={0.14} />
                                        <GhostLine width="7.5rem" height="0.7rem" radius="0.35rem" theme="dark" delay={0.18} />
                                    </div>
                                    {/* bottom meta: "70 MIN · 6 個動作 · 100% OPTIMAL" */}
                                    <div style={{ marginTop: 'auto' }}>
                                        <GhostLine width="13rem" height="0.6rem" radius="0.3rem" theme="dark" delay={0.22} />
                                    </div>
                                </div>
                            }
                        >
                            {todayWorkout?.is_unavailable ? (
                                /* 📡 載入失敗：誠實告知、給重試，不假裝今天是休息日 */
                                <div
                                    className="w-full rounded-[28px] overflow-hidden"
                                    style={{ background: '#161415', minHeight: 210, padding: '32px 28px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
                                >
                                    <div>
                                        <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.22em', color: 'rgba(246,244,241,.45)', margin: 0 }}>
                                            離線 · 暫時無法載入
                                        </p>
                                        <h2 style={{ fontSize: 28, fontWeight: 300, lineHeight: 1.15, letterSpacing: '-0.02em', color: '#F6F4F1', margin: '16px 0 0' }}>
                                            今日課表<br />暫時讀不到
                                        </h2>
                                        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'rgba(246,244,241,.55)', margin: '12px 0 0', maxWidth: '24ch' }}>
                                            請確認網路連線後再試一次。
                                        </p>
                                    </div>
                                    <div style={{ marginTop: 20 }}>
                                        <motion.button {...pressProps('row')}
                                            onClick={(e) => { e.stopPropagation(); fetchDashboardData(); }}
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#F95C4B', color: '#fff', border: 'none', fontWeight: 800, fontSize: 14, letterSpacing: '0.04em', padding: '12px 24px', borderRadius: 9999, cursor: 'pointer' }}>
                                            重新載入
                                        </motion.button>
                                    </div>
                                </div>
                            ) : needsPlanSetup ? (
                                /* 🎓 瑞士極簡空狀態：教學完成但尚無計劃 → 直接進計劃產生器(體能基礎設定) */
                                <div
                                    onClick={() => navigate('/workout-plan-mobile')}
                                    className="w-full rounded-[28px] overflow-hidden active:scale-[0.99] transition-transform cursor-pointer"
                                    style={{ background: '#161415', minHeight: 240, padding: '32px 28px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
                                >
                                    <div>
                                        <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.22em', color: 'rgba(246,244,241,.45)', margin: 0 }}>
                                            尚無計劃 · NO PLAN YET
                                        </p>
                                        <h2 style={{ fontSize: 34, fontWeight: 300, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#F6F4F1', margin: '18px 0 0' }}>
                                            建立你的<br />第一份計劃
                                        </h2>
                                        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'rgba(246,244,241,.55)', margin: '14px 0 0', maxWidth: '24ch' }}>
                                            選擇專項目標，系統會依你的難度與天數，生成專屬的科學化課表。
                                        </p>
                                    </div>
                                    <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
                                        <motion.div
                                            whileTap={{ scale: 0.95 }}
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0, boxShadow: ['0 0 0 0 rgba(249,92,75,0.0)', '0 8px 26px 2px rgba(249,92,75,0.45)', '0 0 0 0 rgba(249,92,75,0.0)'] }}
                                            transition={{ opacity: { delay: 0.62, duration: 0.5 }, y: { delay: 0.62, duration: 0.5, ease: [0.16, 1, 0.3, 1] }, boxShadow: { delay: 1.0, duration: 2.6, repeat: Infinity, ease: 'easeInOut' } }}
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#F95C4B', color: '#fff', fontWeight: 800, fontSize: 14, letterSpacing: '0.04em', padding: '13px 26px', borderRadius: 9999 }}>
                                            生成計劃 →
                                        </motion.div>
                                        <motion.button {...pressProps('row')}
 onClick={(e) => { e.stopPropagation(); navigate('/freestyle-training-mobile'); }}
 style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'transparent', border: 'none', color: 'rgba(246,244,241,.6)', fontWeight: 700, fontSize: 12, letterSpacing: '0.06em', cursor: 'pointer', padding: '2px 4px' }}
 >
                                            <Zap size={14} strokeWidth={2.4} /> 直接開始訓練（免計劃）
                                        </motion.button>
                                    </div>
                                </div>
                            ) : (
                            <RestDayHeroCard
                                // 🧘 資訊簡化：標題只留主分化名（「推力強化」），括號內的部位
                                //    細節（胸·肩·三頭 / 強化 肩）點進預覽頁再看
                                title={todayWorkout?.is_rest_day ? "休息也是訓練的一部分"
                                    : ((todayWorkout?.workout_name || '').replace(/\s*[（(].*$/, '') || null)}
                                subtitle={todayWorkout?.is_rest_day ? "休息日" : "今日焦點"}
                                subtitleEn={todayWorkout?.workout_name_en || ""}
                                imageSrc="/desktop/pp1.png?v=3"
                                isRestDay={todayWorkout?.is_rest_day}
                                // 🧘 資訊簡化：首頁不列動作清單，點卡片進預覽頁再展開
                                exercises={[]}
                                // 🇨🇭 今日訓練部位：從原始標題的括號抽出（如「胸·肩·三頭」），
                                //    以瑞士極簡 tracked 小字呈現在卡片下方
                                focusParts={(() => {
                                    const m = (todayWorkout?.workout_name || '').match(/[（(]([^）)]+)[）)]/);
                                    return m ? m[1].trim().replace(/\s*[·・]\s*/g, ' · ') : '';
                                })()}
                                estimatedTime={todayWorkout?.estimated_time}
                                exerciseCount={todayWorkout?.exercise_count}
                                date={new Date().toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                                dayOfWeek={new Date().toLocaleDateString('zh-TW', { weekday: 'short' })}
                                recoveryInfo={todayReadiness ? { battery_level: todayReadiness.score } : null}
                                onClick={() => {
                                    if (todayWorkout?.is_rest_day || todayWorkout?.workout_name?.includes('休息日')) {
                                        navigate('/luxury-plan-view-mobile');
                                    } else {
                                        setShowPreviewSheet(true);
                                    }
                                }}
                            />
                            )}
                        </RevealCard>
                        </motion.div>

                        {/* ── LATEST RUN — titanium-stone card ── */}
                        {/* 跑步健身卡牌：放慢淡入＋ghost 溶出，讓它登入時更柔和地浮現（不要那麼快） */}
                        {/* 🗓️ 日型調光：今天是重訓日/補課日 → 跑步卡退後一階 */}
                        {!isCardHidden('run') && (
                        <HomeEditableBlock {...blockProps('run')}>
                        {/* 🎬 開場：第二張主卡接著由左至右滑入 */}
                        <motion.div
                            initial={{ opacity: 0, x: -32 }}
                            animate={{ opacity: (todayType === 'strength' || todayType === 'makeup') ? 0.55 : 1, x: 0 }}
                            transition={{ delay: 0.5, duration: 0.85, ease: [0.16, 1, 0.3, 1] }}>
                        <RevealCard
                            isReady={!loading}
                            staggerIndex={1}
                            revealDur={1.15}
                            ghostExitDur={0.85}
                            className="w-full z-30"
                            ghost={
                                // Ghost matches titanium-stone gradient + rounded-[28px]
                                <div style={{
                                    background: 'linear-gradient(135deg, #E4DED2 0%, #F0EDE6 35%, #D8D0C0 65%, #E4DED2 100%)',
                                    borderRadius: 28,
                                    height: '100%',
                                    minHeight: 170,
                                    padding: '1.5rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'center',
                                    gap: 10,
                                }}>
                                    {/* "LATEST RUN" label */}
                                    <GhostLine width="5rem" height="0.6rem" radius="0.3rem" theme="dark" delay={0.06} />
                                    {/* big number "0.0 km" */}
                                    <GhostLine width="7rem" height="2.75rem" radius="0.75rem" theme="dark" delay={0.10} />
                                    {/* pace text */}
                                    <GhostLine width="8rem" height="0.65rem" radius="0.32rem" theme="dark" delay={0.15} />
                                </div>
                            }
                        >
                            <AcidBentoCard
                                variant="titanium-stone"
                                delay={0}
                                onClick={() => navigate('/cardio-tracker-mobile')}
                                className="w-full !p-0 !rounded-[28px] overflow-visible"
                                style={{ minHeight: 170 }}
                            >
                                <div className="relative w-full h-full p-6 flex flex-col justify-center">
                                    {/* Text Content — 有今日計劃 → 顯示計劃提醒；否則顯示最新跑步數據 */}
                                    <div className="relative z-10" style={{ maxWidth: '60%' }}>
                                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                                            <MapPin size={14} className="text-[#161415]/40" />
                                            <p className="text-[12px] font-black tracking-[0.25em] text-[#161415]/40"
                                                style={{ fontFamily: 'system-ui, sans-serif' }}>
                                                {todayRunPlan ? t('今日計劃', "Today's Plan") : t('最新跑步', 'Latest Run')}
                                            </p>
                                            {/* 🗓️ 排程時間 — 有計劃且有排程時間才顯示（間隔顯示，純文字） */}
                                            {todayRunPlan && nextGoal?.scheduledFor && (() => {
                                                const d = new Date(nextGoal.scheduledFor);
                                                if (isNaN(d.getTime())) return null;
                                                const hh = String(d.getHours()).padStart(2, '0');
                                                const mm = String(d.getMinutes()).padStart(2, '0');
                                                return (
                                                    <span className="text-[11px] font-black tracking-[0.08em] tabular-nums px-2 py-0.5 rounded-full"
                                                        style={{ background: 'rgba(249,92,75,0.14)', color: '#D94030' }}>
                                                        {formatRelativeDay(d)} {hh}:{mm}
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                        {todayRunPlan ? (
                                            <>
                                                <h2 className="text-[44px] font-light leading-none text-[#161415]"
                                                    style={{ fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif', letterSpacing: '-0.02em' }}>
                                                    {todayRunPlan.distanceKm > 0 ? <CountUp value={todayRunPlan.distanceKm} decimals={1} /> : '—'}
                                                    <span className="text-[18px] ml-1 lowercase font-medium opacity-40">km</span>
                                                </h2>
                                                <p className="text-[9px] font-black tracking-[0.1em] mt-3 uppercase text-[#161415]/60 truncate" style={{ maxWidth: '100%' }}>
                                                    {todayRunPlan.title}{todayRunPlan.paceLabel ? ` · ${todayRunPlan.paceLabel}/km` : ''}
                                                </p>
                                            </>
                                        ) : (
                                            <>
                                                <h2 className="text-[44px] font-light leading-none text-[#161415]"
                                                    style={{ fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif', letterSpacing: '-0.02em' }}>
                                                    <DataPulse ready={runPatchReady} w="5rem" h="2.75rem" radius="0.75rem" theme="dark" inline>
                                                        <CountUp value={runningData.latestDistance || 0} decimals={1} />
                                                        <span className="text-[18px] ml-1 lowercase font-medium opacity-40">km</span>
                                                    </DataPulse>
                                                </h2>
                                                <p className="text-[9px] font-black tracking-[0.1em] mt-3 uppercase text-[#161415]/60">
                                                    <DataPulse ready={runPatchReady} w="8rem" h="0.65rem" radius="0.32rem" theme="dark" inline>
                                                        配速: {runningData.latestPace > 0 ? `${Math.floor(runningData.latestPace / 60)}'${Math.floor(runningData.latestPace % 60)}"` : '--:--'} /km
                                                    </DataPulse>
                                                </p>
                                            </>
                                        )}
                                    </div>

                                    {/* Pop-out Athlete Image — breaks card frame */}
                                    <motion.img
                                        initial={{ x: 80, opacity: 0 }}
                                        animate={{ x: 0, opacity: 1 }}
                                        transition={{ delay: 0.25, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                                        src="/desktop/pp2.png"
                                        alt="Runner"
                                        className="absolute pointer-events-none"
                                        style={{
                                            right: '-5%',
                                            bottom: '-15%',
                                            height: '145%',
                                            width: 'auto',
                                            objectFit: 'contain',
                                            zIndex: 20,
                                            filter: 'drop-shadow(-15px 15px 30px rgba(0,0,0,0.2))'
                                        }}
                                    />
                                </div>
                            </AcidBentoCard>
                        </RevealCard>
                        </motion.div>
                        </HomeEditableBlock>
                        )}
                    </motion.section>

                    {/* 🟢 最新動態 — 液態玻璃 mix 色按鈕卡（點進近30天運動時間軸） */}
                    {!isCardHidden('feed') && (
                    <HomeEditableBlock {...blockProps('feed')}>
                    <motion.section
                        className="z-10 mb-4"
                        initial={{ opacity: 0, y: -14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <motion.button {...pressProps('card')}
 onClick={() => navigate('/activity-feed-mobile')}
 className="w-full text-left"
 style={{
 // 🟢 固定（不流動）微微彩色 liquid glass：彩色再淡、玻璃感更重
 position: 'relative', overflow: 'hidden', borderRadius: 24, padding: '18px 20px', cursor: 'pointer',
 background: 'linear-gradient(115deg, rgba(126,200,180,0.24) 0%, rgba(245,220,140,0.20) 30%, rgba(240,140,110,0.22) 58%, rgba(180,140,210,0.22) 82%, rgba(120,160,210,0.24) 100%)',
 border: '1px solid rgba(255,255,255,0.8)',
 boxShadow: '0 10px 30px -12px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 2px rgba(255,255,255,0.4)',
 }}
 >
                            {/* 磨砂玻璃罩：白紗更厚，讓彩色退到玻璃後面（liquid glass） */}
                            <span aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, background: 'rgba(255,255,255,0.46)', backdropFilter: 'blur(16px) saturate(1.3)', WebkitBackdropFilter: 'blur(16px) saturate(1.3)' }} />
                            {/* 頂部高光弧 */}
                            <span aria-hidden style={{ position: 'absolute', top: 0, left: '6%', right: '6%', height: '46%', borderRadius: '0 0 50% 50%', pointerEvents: 'none', zIndex: 1, background: 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.1) 55%, transparent 80%)' }} />
                            <div className="flex items-center gap-3 relative" style={{ zIndex: 2 }}>
                                <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'rgba(255,255,255,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                                    {/* App logo 取代原 icon（放大） */}
                                    <img src="/desktop/applogo.png" alt="DRVN" style={{ width: 42, height: 42, objectFit: 'contain' }} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: 'rgba(22,20,21,0.55)' }}>Activity Feed</div>
                                    <div className="text-[16px] font-black" style={{ color: '#161415' }}>{t('最新動態', 'Latest Activity')}</div>
                                    <div className="text-[11px] font-semibold" style={{ color: 'rgba(22,20,21,0.5)', marginTop: 1 }}>
                                        {lastActivitySummary
                                            ? `${lastActivitySummary.when} · ${lastActivitySummary.label}`
                                            : t('近 30 天 · 所有運動紀錄', 'Last 30 days · all activities')}
                                    </div>
                                </div>
                                <ChevronRight size={20} style={{ color: 'rgba(22,20,21,0.4)' }} />
                            </div>

                            {/* 📌 最近一次訓練的重點數據 —— 不用點進去就知道「上次做了什麼」。
                                跑步看 距離/配速/時間，重訓看 動作數/組數/總容量：
                                兩種運動的看點不同，硬套同一組欄位會兩邊都失焦。 */}
                            {lastActivitySummary?.chips?.length > 0 && (
                                <div className="relative mt-3 pt-3" style={{ zIndex: 2, borderTop: '1px solid rgba(255,255,255,0.6)' }}>
                                    <div className="flex items-end gap-4 flex-wrap">
                                        {lastActivitySummary.chips.map((c, i) => (
                                            <div key={i} className="flex items-baseline gap-1">
                                                <span className="text-[19px] font-black leading-none tabular-nums" style={{ color: '#161415', letterSpacing: '-0.02em' }}>{c.v}</span>
                                                <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: 'rgba(22,20,21,0.45)' }}>{c.u}</span>
                                            </div>
                                        ))}
                                        {lastActivitySummary.prCount > 0 && (
                                            <span className="text-[11px] font-black px-2 py-1 rounded-full"
                                                  style={{ background: 'rgba(249,92,75,0.16)', color: '#C43D2B', border: '1px solid rgba(249,92,75,0.3)' }}>
                                                {t(`${lastActivitySummary.prCount} 項破紀錄`, `${lastActivitySummary.prCount} PR`)}
                                            </span>
                                        )}
                                    </div>
                                    {lastActivitySummary.text && (
                                        <div className="text-[11px] font-bold mt-1.5" style={{ color: 'rgba(22,20,21,0.42)' }}>
                                            {lastActivitySummary.text}
                                        </div>
                                    )}
                                </div>
                            )}
                        </motion.button>
                    </motion.section>
                    </HomeEditableBlock>
                    )}

                    {/* 2.5 ACTIVITY CALENDAR LOG */}
                    {!isCardHidden('calendar') && (
                    <HomeEditableBlock {...blockProps('calendar')}>
                    <motion.section
                        className="z-10 mb-4"
                        initial={{ opacity: 0, y: -14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.54, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                    >
                        {/* Swiss hairline section divider */}
                        <SwissHairline delay={0.34} color="rgba(22,20,21,0.08)" thickness={1} className="mb-3" />
                        <motion.h3
                            className="text-[12px] font-black tracking-[0.3em] mb-3 px-2"
                            style={{ color: 'rgba(22,20,21,0.3)' }}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.6, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                        >
                            {t("活動紀錄", "Activity Log")}
                        </motion.h3>
                        {/* 🥇 點月曆 → 每日打卡金屬面板（今日目標 + 自動勾選 + 導引）
                            🔴 今日目標（重訓/跑步/營養）尚未全數完成 → 卡牌邊緣 coral 呼吸燈提醒 */}
                        <div
                            onClick={() => { haptic('light'); setShowDailyCheckin(true); }}
                            style={{
                                cursor: 'pointer', borderRadius: 28,   // 與 ActivityCalendarWidget 的 rounded-[28px] 對齊
                                animation: todayCheckinPending ? 'drvnCheckinBreath 2.8s ease-in-out infinite' : 'none',
                            }}
                        >
                            <ActivityCalendarWidget
                                trainingData={calendarData.strength}
                                cardioData={calendarData.cardio}
                                currentMonth={new Date()}
                            />
                        </div>
                        {todayCheckinPending && (
                            <style>{`
                                @keyframes drvnCheckinBreath {
                                    0%, 100% { box-shadow: 0 0 0 0 rgba(249,92,75,0.0), 0 0 12px 0 rgba(249,92,75,0.10); }
                                    50%      { box-shadow: 0 0 0 1.5px rgba(249,92,75,0.35), 0 0 26px 2px rgba(249,92,75,0.30); }
                                }
                            `}</style>
                        )}
                    </motion.section>
                    </HomeEditableBlock>
                    )}

                    {/* 3. STATUS AREA — Card-First grid */}
                    {!isCardHidden('status') && (
                    <HomeEditableBlock {...blockProps('status')}>
                    <motion.section
                        className="grid grid-cols-2 gap-3 z-10 mb-4"
                        initial={{ opacity: 0, y: -14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.62, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                    >
                        {/* Recovery card */}
                        <RevealCard
                            isReady={!loading}
                            staggerIndex={2}
                            className="col-span-1"
                            ghost={
                                <div style={{
                                    background: 'linear-gradient(135deg, #E4DED2 0%, #F0EDE6 35%, #D8D0C0 65%, #E4DED2 100%)',
                                    borderRadius: 28,
                                    height: '100%',
                                    padding: '1.5rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                }}>
                                    <GhostLine width="5rem" height="0.6rem" theme="dark" delay={0.12} />
                                    <GhostLine width="4.5rem" height="2.75rem" radius="0.75rem" theme="dark" delay={0.16} />
                                    <GhostBlock height="2.5rem" radius="0.5rem" theme="dark" delay={0.20} />
                                </div>
                            }
                        >
                            <AcidBentoCard
                                variant="titanium-stone"
                                className="col-span-1 flex flex-col justify-between !p-6 aspect-[1/1.1] !rounded-[28px]"
                            >
                                <div className="flex justify-between items-start">
                                    <span className="text-[12px] font-black tracking-[0.04em] text-[#161415]/40">準備度</span>
                                    <Activity size={16} className="text-[#161415]/60" />
                                </div>
                                {/* 準備度 —— 跟每日摘要、跑步頁、訓練紀錄同一支 getTodayReadiness。
                                    ⚠️ 以前這裡是後端 battery_level（9 塊肌肉平均、沒練過算 100、還沒載入先填 100），
                                       底下寫死「最佳狀態」、再配一排寫死高度的長條 ——
                                       所以這張卡永遠是 100% 最佳狀態，跟其他畫面的 30 幾 % 對不起來。
                                    沒有任何訊號 → 不給數字，只給該做的事。 */}
                                {todayReadiness ? (
                                    <div>
                                        <div className="text-[44px] font-light text-[#161415] leading-none tabular-nums" style={{ fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif' }}>
                                            <CountUp value={todayReadiness.score} />%
                                        </div>
                                        <div className="text-[12px] font-black text-[#161415]/45 mt-2 tracking-[0.04em]">{readinessLabel(todayReadiness.score)}</div>
                                        <div className="text-[11px] font-semibold text-[#161415]/40 mt-1 leading-snug">{readinessSourceLine(todayReadiness.from)}</div>
                                    </div>
                                ) : (
                                    <div className="text-[17px] font-bold text-[#161415] leading-snug">練一場就有數字</div>
                                )}
                            </AcidBentoCard>
                        </RevealCard>

                        <div
                            className="col-span-1 aspect-[1/1.1] cursor-pointer"
                            onClick={() => navigate('/nutrition-mobile')}
                        >
                            <AcidBentoCard variant="titanium-mist" className="w-full h-full !p-5">
                                <NutritionDashboardWidget
                                    caloriesIn={nutritionData.in}
                                    caloriesOut={nutritionData.out}
                                    calorieGoal={nutritionData.target}
                                />
                            </AcidBentoCard>
                        </div>
                    </motion.section>
                    </HomeEditableBlock>
                    )}

                    {/* 4. TRENDS & SHORTCUTS (BEIGE/Warm Stone) */}
                    <motion.section
                        className="flex flex-col gap-3 z-10 mb-4"
                        initial={{ opacity: 0, y: -14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.7, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                    >
                        {/* Recent PRs — 規範 v1：coral 整卡降級為深鈦獎盃櫃（gold 點綴），
                            coral 預算讓給今日訓練 hero；成就語意改用 tier gold */}
                        {!isCardHidden('pr') && (
                        <HomeEditableBlock {...blockProps('pr')}>
                        <AcidBentoCard
                            variant="titanium-obsidian"
                            className="w-full !p-6 flex items-center justify-between !rounded-[28px]"
                            style={{ height: 110 }}
                            onClick={() => navigate('/power-pr-tracker-mobile')}
                        >
                            <div className="flex items-center gap-5">
                                <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center border border-white/20 shadow-inner" style={{ color: '#FFFFFF' }}>
                                    <Trophy size={20} strokeWidth={1.5} />
                                </div>
                                <div>
                                    <div className="text-[12px] font-black text-white/40 tracking-[0.04em]">個人紀錄</div>
                                    <div className="text-[18px] font-light text-white mt-1" style={{ fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif' }}>
                                        {/* ★ 動作名一律經 toZhExerciseName 在地化 —
                                            後端動作庫是英文，直接顯示會在首頁露出 "Barbell Bench Press" */}
                                        {prData ? `${toZhExerciseName(prData.exercise_name)} ${prData.weight}kg` : '尚無個人紀錄'}
                                        {prData?.improvement && <span className="text-white/60 ml-2 font-black text-[12px]">(+{prData.improvement}kg)</span>}
                                    </div>
                                </div>
                            </div>
                        </AcidBentoCard>
                        </HomeEditableBlock>
                        )}


                        {/* Body Trend — Misty Grey（依回饋改成冷灰 Mist 底） */}
                        {!isCardHidden('body') && (
                        <HomeEditableBlock {...blockProps('body')}>
                        <AcidBentoCard
                            variant="titanium-mist"
                            className="relative w-full !p-6 flex items-center justify-between !rounded-[28px] overflow-visible"
                            style={{
                                height: 110,
                                /* 身體數據卡改成 misty grey（Mist #E8E9E6 冷灰）*/
                                background: 'linear-gradient(135deg, #EDEEEC 0%, #E8E9E6 55%, #DFE1DD 100%)',
                            }}
                            onClick={() => navigate('/body-analysis-mobile')}
                        >
                            <div className="flex items-center gap-5 relative z-10 w-full">
                                <div className="w-12 h-12 rounded-full flex items-center justify-center bg-black/5 border border-black/5 shadow-inner">
                                    <Scan size={20} className="text-[#161415]/60" />
                                </div>
                                <div className="flex-1">
                                    <div className="text-[12px] font-black tracking-[0.04em] text-[#161415]/40">身體數據</div>
                                    <div className="text-[18px] font-light mt-1 text-[#161415]" style={{ fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif' }}>
                                        {bodyData.weight || '0'}kg <span className="opacity-20 mx-1">/</span> {bodyData.bodyFatPercentage || '0'}% fat
                                    </div>
                                </div>
                            </div>

                            {/* Image from user */}
                            <img loading="lazy" decoding="async"
                                src="/desktop/pp3.png"
                                alt="Body Trend"
                                className="absolute pointer-events-none"
                                style={{
                                    right: '-45%',
                                    bottom: '-45%',
                                    height: '210%',
                                    zIndex: 20,
                                    filter: 'drop-shadow(0 15px 25px rgba(0,0,0,0.15))'
                                }}
                            />
                        </AcidBentoCard>
                        </HomeEditableBlock>
                        )}
                    </motion.section>

                    {/* 5. MORE ACTIONS — 規範 v1：次要區降溫。
                        Mist #E8E9E6 冷灰地面（暖=前景、冷=退後），讓上方暖鈦卡群「浮起」，
                        三顆功能磚（黑曜/白鈦/沙鈦）在冷地上各自跳出 */}
                    {!isCardHidden('more') && (
                    <HomeEditableBlock {...blockProps('more')}>
                    <motion.section
                        className="z-10 mt-2"
                        data-onboard="home-more-actions"
                        initial={{ opacity: 0, y: -14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.78, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <h3 className="text-[12px] font-black mb-3 px-1 tracking-widest"
                            style={{ color: 'rgba(22,20,21,0.35)', fontFamily: '"Tenor Sans", sans-serif' }}>
                            {t("更多操作", "More Actions")}
                        </h3>
                        <div className="grid grid-cols-3 gap-3">

                            {/* Personality — Titanium Obsidian (High-Gloss Metal) */}
                            <motion.div
                                initial={{ opacity: 0, y: -12, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={{ delay: 0.84, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                whileTap={{ scale: 0.96 }}
                                onClick={() => navigate('/personality-mobile')}
                                className="relative aspect-square rounded-[28px] overflow-hidden cursor-pointer"
                                style={{
                                    background: 'linear-gradient(135deg, #262523 0%, #161415 40%, #0A0A0A 60%, #1F1F1F 100%)',
                                    border: '1px solid rgba(255,255,255,0.15)',
                                    boxShadow: '0 12px 40px rgba(0,0,0,0.4), inset 0 2px 4px rgba(255,255,255,0.1), inset 0 -2px 4px rgba(0,0,0,0.4)'
                                }}
                            >
                                {/* Specular Sheen */}
                                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent pointer-events-none" />

                                <div className="absolute inset-0 flex flex-col justify-between p-5">
                                    <div className="w-8 h-8 flex items-center justify-center">
                                        <User size={20} className="text-[#F6F4F1]/80" strokeWidth={2.5} />
                                    </div>
                                    <div>
                                        <p className="text-[12px] font-black tracking-[0.04em] mb-1 opacity-30 text-white">探索</p>
                                        <span className="text-[15px] font-medium uppercase text-white leading-tight block tracking-tighter"
                                            style={{ fontFamily: '"Noto Sans TC", sans-serif' }}>
                                            健身人格
                                        </span>
                                    </div>
                                </div>
                            </motion.div>

                            {/* Sonic Focus — Titanium Mist (High-Gloss Metal) */}
                            <motion.div
                                initial={{ opacity: 0, y: -12, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={{ delay: 0.9, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                whileTap={{ scale: 0.96 }}
                                onClick={() => navigate('/sonic-focus-mobile')}
                                className="relative aspect-square rounded-[28px] overflow-hidden cursor-pointer"
                                style={{
                                    background: 'linear-gradient(135deg, #FFFFFF 0%, #F5F3F0 40%, #EAE6DF 60%, #FFFFFF 100%)',
                                    border: '1px solid rgba(255,255,255,0.8)',
                                    boxShadow: '0 12px 40px rgba(22,20,21,0.1), inset 0 2px 4px rgba(255,255,255,1), inset 0 -2px 4px rgba(0,0,0,0.05)'
                                }}
                            >
                                {/* Specular Sheen */}
                                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/40 to-transparent pointer-events-none" />

                                <div className="absolute inset-0 flex flex-col justify-between p-5">
                                    <div className="w-8 h-8 flex items-center justify-center">
                                        <Music size={20} className="text-[#161415]" strokeWidth={2.5} />
                                    </div>
                                    <div>
                                        <p className="text-[12px] font-black tracking-[0.04em] mb-1 opacity-40 text-[#161415]">專注</p>
                                        <span className="text-[15px] font-medium uppercase text-[#161415] leading-tight block tracking-tighter"
                                            style={{ fontFamily: '"Noto Sans TC", sans-serif' }}>
                                            音樂<br />專注
                                        </span>
                                    </div>
                                </div>
                            </motion.div>

                            {/* Recap — Titanium Sand (High-Gloss Metal) */}
                            <motion.div
                                initial={{ opacity: 0, y: -12, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={{ delay: 0.96, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                whileTap={{ scale: 0.96 }}
                                onClick={() => navigate('/monthly-report-mobile')}
                                className={`relative aspect-square rounded-[28px] overflow-hidden cursor-pointer ${recap.unlocked && recap.hasNew ? 'drvn-recap-new' : ''}`}
                                style={{
                                    background: 'linear-gradient(135deg, #EAE5DE 0%, #D8D2C9 40%, #BDB2A3 60%, #EAE5DE 100%)',
                                    border: '1px solid rgba(255,255,255,0.6)',
                                    boxShadow: '0 12px 40px rgba(22,20,21,0.12), inset 0 2px 4px rgba(255,255,255,0.8), inset 0 -2px 4px rgba(0,0,0,0.1)'
                                }}
                            >
                                {/* Specular Sheen */}
                                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/25 to-transparent pointer-events-none" />

                                {/* 有新回顧時：右上「NEW」極簡字樣 + 邊角發光呼吸（drvn-recap-new）。
                                    取代原本的紅點，字樣比點更清楚地告訴使用者「有新的可以看」。 */}
                                {recap.unlocked && recap.hasNew && (
                                    <span className="absolute top-3 right-3" style={{ zIndex: 3 }}>
                                        <span style={{
                                            fontSize: 9, fontWeight: 900, letterSpacing: '0.18em',
                                            color: '#FFFFFF', background: '#F95C4B',
                                            padding: '2px 6px', borderRadius: 6,
                                            fontFamily: '"Geist Mono", monospace',
                                            boxShadow: '0 2px 8px rgba(249,92,75,0.45)',
                                        }}>NEW</span>
                                    </span>
                                )}

                                <div className="absolute inset-0 flex flex-col justify-between p-5">
                                    <div className="w-8 h-8 flex items-center justify-center">
                                        {recap.unlocked
                                            ? <Trophy size={20} className="text-[#161415]/60" strokeWidth={2.5} />
                                            : <Lock size={18} className="text-[#161415]/45" strokeWidth={2.5} />}
                                    </div>
                                    <div>
                                        {/* 季末月（3/6/9/12）→ 顯示「每季」；其餘月份「每月」。
                                            使用者設計意圖：前兩月月報、第三月月報＋季報。 */}
                                        {(() => {
                                            // 回顧的是「上一個已完成的月份」：8 月看到的是「七月回顧」
                                            const _revM = ((new Date().getMonth() + 11) % 12) + 1;
                                            const _zh = ['一','二','三','四','五','六','七','八','九','十','十一','十二'][_revM - 1];
                                            const _isQ = (new Date().getMonth() + 1) % 3 === 0; // 季末月同時附季報
                                            return (
                                              <>
                                                <p className="text-[12px] font-black tracking-[0.2em] mb-1 opacity-40 text-[#161415]">
                                                    {recap.unlocked ? (recap.hasNew ? '新回顧' : (_isQ ? '季度' : '月度')) : '未解鎖'}
                                                </p>
                                                {/* 季末月原本寫「八月回顧・季報」—— 六個字加一個間隔點，
                                                    在這格的寬度裡一定破版。季報本來就包含回顧，
                                                    講一次就好：季末月「八月季報」，其餘月份「八月回顧」。
                                                    字重放到 300，不跟左邊那格的粗標搶。 */}
                                                <span className="text-[15px] text-[#161415] leading-tight block tracking-tighter"
                                                    style={{ fontFamily: '"Noto Sans TC", sans-serif', fontWeight: 300 }}>
                                                    {recap.unlocked ? `${_zh}月${_isQ ? '季報' : '回顧'}` : '完成一個月解鎖'}
                                                </span>
                                              </>
                                            );
                                        })()}
                                    </div>
                                </div>
                            </motion.div>

                        </div>
                    </motion.section>
                    </HomeEditableBlock>
                    )}
                </div>

                {/* 🏠 編輯模式頂欄 — 左上「＋ 新增卡牌」、右上「完成」（Apple 桌面編輯風格） */}
                {editMode && ReactDOM.createPortal(
                    <div style={{
                        position: 'fixed', left: 0, right: 0, zIndex: 100002,
                        top: 0, paddingTop: 'calc(env(safe-area-inset-top, 12px) + 8px)',
                        paddingLeft: 16, paddingRight: 16, paddingBottom: 10,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        background: 'linear-gradient(180deg, rgba(246,244,241,0.96) 0%, rgba(246,244,241,0.82) 70%, rgba(246,244,241,0) 100%)',
                        pointerEvents: 'none',
                    }}>
                        <motion.button {...pressProps('row')}
 onClick={() => setShowAddSheet(true)}
 style={{
 pointerEvents: 'auto',
 display: 'flex', alignItems: 'center', gap: 6,
 background: 'rgba(22,20,21,0.92)', color: '#F6F4F1',
 border: 'none', borderRadius: 999, padding: '9px 16px',
 fontSize: 13, fontWeight: 800, letterSpacing: '0.04em',
 boxShadow: '0 6px 18px rgba(0,0,0,0.25)', cursor: 'pointer',
 }}
 >
                            <Plus size={15} strokeWidth={3} /> {t('新增卡牌', 'Add Card')}
                        </motion.button>
                        <motion.button {...pressProps('row')}
 onClick={() => { setEditMode(false); setShowAddSheet(false); }}
 style={{
 pointerEvents: 'auto',
 background: '#F95C4B', color: '#fff',
 border: 'none', borderRadius: 999, padding: '9px 20px',
 fontSize: 13, fontWeight: 900, letterSpacing: '0.06em',
 boxShadow: '0 6px 18px rgba(249,92,75,0.4)', cursor: 'pointer',
 }}
 >
                            {t('完成', 'Done')}
                        </motion.button>
                    </div>,
                    document.body
                )}

                {/* 🏠 新增卡牌 bottom sheet — 列出被移除的卡牌，一鍵加回 */}
                {ReactDOM.createPortal(
                    <AnimatePresence>
                        {showAddSheet && (
                            <>
                                <motion.div
                                    key="addsheet-mask"
                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                    onClick={() => setShowAddSheet(false)}
                                    style={{ position: 'fixed', inset: 0, zIndex: 100003, background: 'rgba(22,20,21,0.45)', backdropFilter: 'blur(4px)' }}
                                />
                                <motion.div
                                    key="addsheet"
                                    initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                                    transition={{ type: 'spring', damping: 30, stiffness: 320 }}
                                    style={{
                                        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 100004,
                                        background: '#F6F4F1', borderRadius: '24px 24px 0 0',
                                        padding: '20px 20px calc(env(safe-area-inset-bottom, 16px) + 20px)',
                                        maxHeight: '70dvh', overflowY: 'auto',
                                        boxShadow: '0 -12px 40px rgba(0,0,0,0.25)',
                                    }}
                                >
                                    <div style={{ width: 40, height: 4, borderRadius: 99, background: 'rgba(22,20,21,0.15)', margin: '0 auto 16px' }} />
                                    <h3 style={{ fontSize: 18, fontWeight: 900, color: '#161415', margin: '0 0 4px' }}>{t('新增卡牌', 'Add Cards')}</h3>
                                    <p style={{ fontSize: 12, color: 'rgba(22,20,21,0.5)', margin: '0 0 16px' }}>
                                        {t('把移除的卡牌加回主頁。', 'Restore removed cards to your home screen.')}
                                    </p>
                                    {hiddenCards.length === 0 ? (
                                        <div style={{ padding: '28px 0', textAlign: 'center', color: 'rgba(22,20,21,0.4)', fontSize: 13, fontWeight: 600 }}>
                                            {t('所有卡牌都在主頁上', 'All cards are on your home screen')}
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            {hiddenCards.map((id) => {
                                                const meta = HOME_CARDS.find(c => c.id === id);
                                                if (!meta) return null;
                                                return (
                                                    <div key={id} style={{
                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                        background: '#fff', borderRadius: 16, padding: '14px 16px',
                                                        border: '1px solid rgba(22,20,21,0.08)',
                                                    }}>
                                                        <div>
                                                            <div style={{ fontSize: 14, fontWeight: 800, color: '#161415' }}>{meta.title}</div>
                                                            <div style={{ fontSize: 11, color: 'rgba(22,20,21,0.45)', marginTop: 2 }}>{meta.desc}</div>
                                                        </div>
                                                        <motion.button {...pressProps('row')}
 onClick={() => { restoreHomeCard(userId, id); haptic('light'); }}
 style={{
 display: 'flex', alignItems: 'center', gap: 4,
 background: '#F95C4B', color: '#fff', border: 'none',
 borderRadius: 999, padding: '8px 14px',
 fontSize: 12, fontWeight: 900, cursor: 'pointer', flexShrink: 0,
 }}
 >
                                                            <Plus size={13} strokeWidth={3} /> {t('加回', 'Add')}
                                                        </motion.button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </motion.div>
                            </>
                        )}
                    </AnimatePresence>,
                    document.body
                )}

                {/* Workout Preview Sheet Modal */}
                {showPreviewSheet && todayWorkout && (
                    <WorkoutPreviewSheet
                        day={todayWorkout}
                        cardColor="#161415"
                        weekdayName={(() => {
                            const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
                            return days[new Date().getDay()];
                        })()}
                        planTags={journey?.tags || []}
                        onStart={(dayWithGym) => navigate('/training-session-mobile', { state: { day: dayWithGym || todayWorkout } })}
                        onClose={() => setShowPreviewSheet(false)}
                    />
                )}

                {/* 🎯 Daily Welcome Modal */}
                <DailyCheckInModal
                    isOpen={showDailyCheckIn}
                    onClose={() => setShowDailyCheckIn(false)}
                    userName={displayName}
                    todayWorkout={todayWorkout}
                    navigate={navigate}
                    lastWorkoutType={lastWorkoutType}
                />

                {/* 🏃‍♂️ Custom Running Loader Overlay */}
                <AnimatePresence>
                    {showRunningLoader && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="fixed inset-0 z-[999999]"
                        >
                            <RunningLoaderOverlay onClose={() => setShowRunningLoader(false)} />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ✨ Swiss Motion Auth Loader Overlay */}
                <AnimatePresence>
                    {showMotionAuthLoader && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="fixed inset-0 z-[999999]"
                        >
                            <MotionAuthLoaderOverlay onClose={() => setShowMotionAuthLoader(false)} />
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    );
};

export default ActionFirstDashboardMobile;
