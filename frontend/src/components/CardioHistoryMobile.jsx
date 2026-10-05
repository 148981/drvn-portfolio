import React, { useState, useEffect, useMemo } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Activity, Trash2, Calendar, MapPin, ChevronRight, Clock, Flame, TrendingUp, Map, History, Trophy, Medal } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import { useCardioSessions, invalidateCardioCache } from '../hooks/useDRVNData';
import { DataFade, SWRStatus, SWRSkeleton } from './DataTransition';
import CardioTrendView from './CardioTrendView';
import MobileNavigation from './MobileNavigation';
import { getUserId } from '../utils/auth';
import { confirmDialog, toast } from '../utils/toast';
import { formatDuration as fmtDuration } from '../utils/format';


// High #11 — 卡片底色按訓練類型映射（與 CardioMicrocycleInbox 的 TYPE_VISUAL 統一）
//   speed/tempo/interval → coral（高強度）
//   recovery → green（低強度）
//   long → blue（長距離有氧）
//   strength → black（重訓）
//   default → pebble titanium（米色 fallback）
const TYPE_CARD_STYLES = {
    speed:     { bg: '#F95C4B', text: '#FFFFFF', textHigh: 'rgba(255,255,255,0.92)', textMed: 'rgba(255,255,255,0.75)', textLow: 'rgba(255,255,255,0.50)', bgSoft: 'rgba(255,255,255,0.14)', border: 'rgba(255,255,255,0.18)', accent: '#FFFFFF', tag: 'SPEED' },
    tempo:     { bg: '#F95C4B', text: '#FFFFFF', textHigh: 'rgba(255,255,255,0.92)', textMed: 'rgba(255,255,255,0.75)', textLow: 'rgba(255,255,255,0.50)', bgSoft: 'rgba(255,255,255,0.14)', border: 'rgba(255,255,255,0.18)', accent: '#FFFFFF', tag: 'TEMPO' },
    interval:  { bg: '#F95C4B', text: '#FFFFFF', textHigh: 'rgba(255,255,255,0.92)', textMed: 'rgba(255,255,255,0.75)', textLow: 'rgba(255,255,255,0.50)', bgSoft: 'rgba(255,255,255,0.14)', border: 'rgba(255,255,255,0.18)', accent: '#FFFFFF', tag: 'INTERVAL' },
    recovery:  { bg: '#7BD3A5', text: '#0E2E20', textHigh: 'rgba(14,46,32,0.92)',    textMed: 'rgba(14,46,32,0.72)',    textLow: 'rgba(14,46,32,0.48)',    bgSoft: 'rgba(14,46,32,0.08)',    border: 'rgba(14,46,32,0.10)',    accent: '#0E2E20', tag: '恢復跑' },
    long:      { bg: '#A5C4FF', text: '#10243F', textHigh: 'rgba(16,36,63,0.92)',    textMed: 'rgba(16,36,63,0.72)',    textLow: 'rgba(16,36,63,0.48)',    bgSoft: 'rgba(16,36,63,0.08)',    border: 'rgba(16,36,63,0.10)',    accent: '#10243F', tag: 'LONG' },
    strength:  { bg: '#161415', text: '#F6F4F1', textHigh: 'rgba(246,244,241,0.85)', textMed: 'rgba(246,244,241,0.60)', textLow: 'rgba(246,244,241,0.40)', bgSoft: 'rgba(246,244,241,0.08)', border: 'rgba(246,244,241,0.10)', accent: '#F95C4B', tag: 'STRENGTH' },
    base:      { bg: '#A5C4FF', text: '#10243F', textHigh: 'rgba(16,36,63,0.92)',    textMed: 'rgba(16,36,63,0.72)',    textLow: 'rgba(16,36,63,0.48)',    bgSoft: 'rgba(16,36,63,0.08)',    border: 'rgba(16,36,63,0.10)',    accent: '#10243F', tag: 'AEROBIC BASE' },
    easy:      { bg: '#D8F382', text: '#3A4A0F', textHigh: 'rgba(58,74,15,0.92)',    textMed: 'rgba(58,74,15,0.72)',    textLow: 'rgba(58,74,15,0.50)',    bgSoft: 'rgba(58,74,15,0.08)',    border: 'rgba(58,74,15,0.10)',    accent: '#3A4A0F', tag: 'EASY' },
    default:   { bg: '#E4DED2', text: '#161415', textHigh: 'rgba(22,20,21,0.85)',    textMed: 'rgba(22,20,21,0.60)',    textLow: 'rgba(22,20,21,0.40)',    bgSoft: 'rgba(22,20,21,0.05)',    border: 'rgba(22,20,21,0.08)',    accent: '#F95C4B', tag: '跑步' },
};

// 根據 session metadata 推斷訓練類型
const inferSessionType = (session) => {
    const t = String(session.type || session.subtype || session.metrics?.type || '').toLowerCase();
    const name = String(session.brick_title || session.title || '').toLowerCase();
    const merged = `${t} ${name}`;
    if (/speed|sprint|interval/.test(merged))  return 'speed';
    if (/tempo|threshold/.test(merged))         return 'tempo';
    if (/recover|cool|easy.*recover/.test(merged)) return 'recovery';
    if (/long|endurance|18k|20k|25k|30k|marathon|half/.test(merged)) return 'long';
    if (/strength|weight|squat|lift/.test(merged)) return 'strength';
    if (/base|aerobic|maf/.test(merged))         return 'base';
    if (/easy|jog/.test(merged))                 return 'easy';
    // 距離 fallback：>=15km 判定 long
    const dist = Number(session.metrics?.distance) || 0;
    if (dist >= 15) return 'long';
    return 'default';
};

const CardioHistoryMobile = () => {
    const navigate = useNavigate();
    const [selectedDate, setSelectedDate] = useState('');
    const [showTrends, setShowTrends] = useState(false);
    const userId = getUserId();

    // ── SWR: fetch once, cache forever, revalidate silently ─────────
    const {
        data: cardioData,
        isLoading,
        isValidating,
        mutate,
    } = useCardioSessions(userId, 1000);

    // All sessions sorted once from SWR cache (not re-fetched on filter)
    const allSessions = useMemo(() => {
        const raw = cardioData?.sessions ?? [];
        return [...raw].sort((a, b) =>
            new Date(b.created_at || b.date) - new Date(a.created_at || a.date)
        );
    }, [cardioData]);

    // 🔴 Fix(timezone): toDateString() 比對依賴本地 Locale，且無法處理純日期字串 (YYYY-MM-DD)
    // 在 UTC+8 環境下，UTC 儲存的 "2024-05-01T22:30:00Z" → toDateString() = "Wed May 01 2024"
    // 但若使用者在台灣晚上 11 點跑步，後端 UTC 時間已是隔天，導致記錄被歸到錯誤日期
    // 修復：優先直接比對 YYYY-MM-DD 字串，只有帶時間的 ISO 字串才做本地化轉換
    const toLocalDateStr = (raw) => {
        if (!raw) return '';
        // 純日期格式 YYYY-MM-DD：直接回傳，不轉換（避免 new Date() 的 UTC 偏移）
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
        // 帶時間的 ISO 字串：轉為本地日期
        const d = new Date(raw);
        if (isNaN(d.getTime())) return '';
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    // Client-side filtering: NO additional API call — pure derivation
    const sessions = useMemo(() => {
        if (!selectedDate) return allSessions;
        return allSessions.filter(session => {
            const sessionDateStr = toLocalDateStr(session.date || session.created_at);
            return sessionDateStr === selectedDate;
        });
    }, [allSessions, selectedDate]);

    // Stable dataKey: changes on filter OR on new data from server
    const dataKey = `${selectedDate || 'all'}-${allSessions.length}`;

    // Font Styles - Ensuring Knewave is available
    useEffect(() => {
        const link = document.createElement('link');
        link.href = '/fonts/fonts.css';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
        return () => document.head.removeChild(link);
    }, []);

    const filterByDate = (date) => {
        // Only updates local state — no API call.
        // DataFade will crossfade when `dataKey` changes.
        setSelectedDate(date);
    };

    const handleDelete = async (e, sessionId) => {
        e.stopPropagation();
        if (!(await confirmDialog('確定要刪除這筆跑步記錄嗎？', { danger: true }))) return;

        try {
            await apiClient.delete(`/api/cardio/session/${sessionId}?user_id=${userId}`);
            // Invalidate SWR cache — triggers background re-fetch
            invalidateCardioCache(userId);
        } catch (error) {
            console.error('Error deleting session:', error);
            // 原本失敗時完全沒提示，使用者以為刪了、紀錄卻還在
            toast.error('刪除失敗，請檢查網路後再試');
        }
    };

    // 舊紀錄的數值可能是字串（"5.2"）或 null：字串會讓 reduce 變成字串串接、.toFixed 直接 TypeError 整頁白屏
    const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

    const formatDuration = fmtDuration;   // 🩹 J: 單一真相源（>1h 自動 H:MM:SS）

    // First-load: no cached data yet
    if (isLoading && !cardioData) {
        return (
            <div style={{ maxWidth: '430px', margin: '0 auto', padding: '5rem 1.5rem 2rem' }}>
                <SWRSkeleton lines={5} height="5rem" gap="0.75rem" rounded="1.25rem" />
            </div>
        );
    }

    return (
        <div style={{
            maxWidth: '100%',
            width: '100%',
            backgroundColor: '#CFC6B8', // Pebble color
            color: '#161415',
            fontFamily: 'var(--font-body)',
            minHeight: '100dvh',
            paddingBottom: '80px', // Space for BottomNav
            overflowX: 'hidden',
            position: 'relative'
        }}>
            {/* Fixed Background Layer (Removed Image) */}
            <div
                className="fixed inset-0 pointer-events-none"
                style={{
                    zIndex: -1,
                    backgroundColor: '#CFC6B8',
                }}
            />
            {/* SWR hairline revalidation indicator — absolute top of viewport */}
            <SWRStatus isValidating={isValidating} />

            <div style={{ maxWidth: '430px', margin: '0 auto', minHeight: '100dvh', position: 'relative' }}>
                {/* Header — always visible, never fades */}
                <div className="px-6 pt-12 pb-6 flex items-start justify-between">
                    <div>
                        <h1 className="text-[42px] leading-none text-[#161415]" style={{ fontFamily: 'var(--font-body)', fontWeight: 300, letterSpacing: '-0.03em' }}>
                            歷史
                        </h1>
                        <p className="text-[#161415]/40 font-bold text-xs tracking-widest uppercase mt-2 ml-1">
                            你的旅程
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <motion.button {...pressProps('icon')} onClick={() => navigate('/cardio-tracker-mobile')} className="w-10 h-10 rounded-full flex items-center justify-center bg-[#262523] text-white/70"><ArrowLeft size={20} /></motion.button>
                    </div>
                </div>

                {/* Date Filter Pills */}
                <div className="px-6 mb-6 overflow-x-auto no-scrollbar flex items-center gap-3">
                    <div className="bg-[#262523] rounded-full px-4 py-3 flex items-center gap-3 border border-white/5 whitespace-nowrap">
                        <Calendar size={16} className="text-white/50" />
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => filterByDate(e.target.value)}
                            className="bg-transparent border-none outline-none text-xs font-bold text-white uppercase tracking-wider w-full placeholder-white/20"
                            style={{ colorScheme: 'dark' }}
                        />
                        {selectedDate && (
                            <motion.button {...pressProps('icon')} onClick={() => filterByDate('')} className="bg-white/10 p-1 rounded-full"><X size={12} /></motion.button>
                        )}
                    </div>
                </div>

                {/* ── DataFade wrapper: stats + list crossfade together ── */}
                <DataFade dataKey={dataKey}>

                {/* Total Statistics Section — iOS 26 Liquid Glass (dark tint variant) */}
                {sessions.length > 0 && (
                    <div className="px-6 mb-6">
                        <div
                            onClick={() => setShowTrends(true)}
                            className="rounded-[28px] p-6 active:scale-95 transition-transform cursor-pointer relative overflow-hidden"
                            style={{
                                // 半透明深色玻璃 tint：保留深色階層感，但讓底層 pebble 背景透出 → 真正的 Liquid Glass
                                background: 'linear-gradient(135deg, rgba(28,28,30,0.82) 0%, rgba(28,28,30,0.68) 100%)',
                                backdropFilter: 'blur(28px) saturate(180%)',
                                WebkitBackdropFilter: 'blur(28px) saturate(180%)',
                                border: '1px solid rgba(255,255,255,0.12)',
                                boxShadow: '0 1px 0 rgba(255,255,255,0.18) inset, 0 18px 48px -20px rgba(0,0,0,0.55), 0 2px 10px -4px rgba(0,0,0,0.35)',
                            }}
                        >
                            {/* 玻璃折射高光 — 右上角光暈 */}
                            <div
                                className="absolute -top-14 -right-12 w-48 h-48 rounded-full pointer-events-none"
                                style={{ background: 'radial-gradient(circle, rgba(255,155,127,0.25), transparent 70%)', filter: 'blur(30px)' }}
                            />
                            {/* 鏡面斜向掃光 */}
                            <div className="absolute inset-0 pointer-events-none" style={{ borderRadius: 28, background: 'linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.10) 46%, transparent 56%)' }} />
                            <div className="flex items-center gap-2 mb-4 relative z-10">
                                <Activity size={16} className="text-[#FF9B7F]" />
                                <h3 className="text-white font-bold text-sm uppercase tracking-wider">總統計 & 趨勢</h3>
                                <ChevronRight size={14} className="text-white/30 ml-auto" />
                            </div>
                            <div className="grid grid-cols-3 gap-4 relative z-10">
                                <div>
                                    <p className="text-[12px] font-bold text-white/40 mb-1">距離</p>
                                    <p className="text-xl font-black text-white">
                                        {sessions.reduce((acc, s) => acc + num(s.metrics?.distance), 0).toFixed(1)}
                                        <span className="text-[11px] ml-1 text-white/40">km</span>
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[12px] font-bold text-white/40 mb-1">熱量</p>
                                    <p className="text-xl font-black text-white">
                                        {(sessions.reduce((acc, s) => acc + num(s.metrics?.calories), 0) / 1000).toFixed(1)}
                                        <span className="text-[11px] ml-1 text-white/40">k</span>
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[12px] font-bold text-white/40 mb-1">爬升</p>
                                    <p className="text-xl font-black text-white">
                                        {Math.round(sessions.reduce((acc, s) => acc + (s.metrics?.elevationGain || 0), 0))}
                                        <span className="text-[11px] ml-1 text-white/40">m</span>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Content List */}
                <div className="px-4 pb-4 space-y-4">
                    {sessions.length === 0 ? (
                        /* 第一次的邀請放在畫面正中央，不要縮在最上面 */
                        <div style={{ minHeight: 'calc(100dvh - 260px)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div
                            className="rounded-[28px] p-8 text-center relative overflow-hidden"
                            style={{
                                background: 'linear-gradient(135deg, rgba(255,255,255,0.55) 0%, rgba(246,244,241,0.35) 100%)',
                                backdropFilter: 'blur(24px) saturate(180%)',
                                WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                                border: '1px solid rgba(255,255,255,0.6)',
                                boxShadow: '0 10px 30px rgba(0,0,0,0.10), inset 0 1px 2px rgba(255,255,255,0.9)',
                            }}
                        >
                            {/* 鏡面高光 */}
                            <div style={{ position: 'absolute', inset: 0, borderRadius: 28, pointerEvents: 'none', background: 'radial-gradient(120% 80% at 18% 0%, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 50%)' }} />
                            <div className="relative z-10">
                                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: 'rgba(249,92,75,0.12)', border: '1px solid rgba(249,92,75,0.25)' }}>
                                    <Activity size={24} style={{ color: '#F95C4B' }} />
                                </div>
                                <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.4em', color: 'rgba(22,20,21,0.35)', marginBottom: 6 }}>跑步紀錄</p>
                                <h3 style={{ fontFamily: 'var(--font-body)', fontWeight: 300, letterSpacing: '-0.02em', fontSize: 26, color: '#161415', margin: 0 }}>尚無紀錄</h3>
                                <p className="mt-3 mb-7 mx-auto" style={{ fontSize: 13, lineHeight: 1.6, color: 'rgba(22,20,21,0.5)', maxWidth: 240 }}>
                                    完成第一次跑步，這裡就會記錄你的旅程。
                                </p>
                                <motion.button {...pressProps('pill')}
 onClick={() => navigate('/cardio-tracker-mobile')}
 className="px-7 py-3.5 rounded-full"
 style={{
 background: 'linear-gradient(135deg, #F95C4B 0%, #D94030 100%)',
 color: '#fff', fontSize: 12, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase',
 border: 'none', boxShadow: '0 8px 22px rgba(249,92,75,0.4)',
 }}
 >
                                    Start Running
                                </motion.button>
                            </div>
                        </div>
                        </div>
                    ) : (
                        sessions.map((session, index) => {
                            const dateObj = new Date(session.created_at || session.date);
                            const metrics = session.metrics || {};
                            // High #11 — 按訓練類型映射底色（取代原本 index 循環）
                            const sessionType = inferSessionType(session);
                            const style = TYPE_CARD_STYLES[sessionType] || TYPE_CARD_STYLES.default;

                            // 安全計算 PTS/MIN，防禦壞掉的 0 秒歷史資料
                            const durationSec = num(metrics.duration || metrics.duration_seconds);
                            const durationMin = durationSec / 60;
                            const ptsPerMin = durationMin > 0 ? (num(metrics.score) / durationMin) : 0;

                            // iOS 26 Liquid Glass：將類型底色轉為半透明玻璃 tint，保留類型識別色但加上模糊與高光邊緣
                            const isLightTint = style.text === '#FFFFFF' || style.text === '#F6F4F1';
                            const glassCardStyle = {
                                background: `linear-gradient(135deg, ${style.bg}E6 0%, ${style.bg}CC 100%)`,
                                backdropFilter: 'blur(24px) saturate(170%)',
                                WebkitBackdropFilter: 'blur(24px) saturate(170%)',
                                border: `1px solid ${isLightTint ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.55)'}`,
                                boxShadow: `0 1px 0 ${isLightTint ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.7)'} inset, 0 16px 44px -18px rgba(22,20,21,0.30), 0 2px 8px -4px rgba(22,20,21,0.18)`
                            };

                            return (
                                <motion.div
                                    key={session.session_id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: Math.min(index, 6) * 0.05 }}
                                    onClick={() => navigate(`/running-analysis-mobile/${session.session_id}`, { state: { from: '/cardio-history' } })}
                                    className={`rounded-[28px] p-6 relative group active:scale-[0.98] transition-all cursor-pointer overflow-hidden`}
                                    style={glassCardStyle}
                                >
                                    {/* 玻璃折射高光 */}
                                    <div
                                        className="absolute -top-12 -right-10 w-44 h-44 rounded-full pointer-events-none"
                                        style={{ background: `radial-gradient(circle, ${isLightTint ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.5)'}, transparent 70%)`, filter: 'blur(28px)' }}
                                    />
                                    {/* Top Row: Date & Delete */}
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: style.textMed }}>
                                                    {dateObj.toLocaleDateString('zh-TW', { weekday: 'long' })}
                                                </div>
                                                {/* Type tag — 一眼分辨訓練類型 */}
                                                <div
                                                    className="px-2 py-0.5 rounded-full text-[9px] font-black tracking-[0.2em] uppercase"
                                                    style={{ backgroundColor: style.bgSoft, color: style.text, border: `1px solid ${style.border}` }}
                                                >
                                                    {style.tag}
                                                </div>
                                            </div>
                                            <h3 className="text-2xl font-black leading-none" style={{ color: style.text }}>
                                                {dateObj.getDate()} {dateObj.toLocaleDateString('zh-TW', { month: 'short' })}
                                            </h3>
                                            <div className="text-[11px] font-bold mt-1" style={{ color: style.textLow }}>
                                                {dateObj.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                            </div>
                                        </div>

                                        <motion.button {...pressProps('icon')}
 onClick={(e) => handleDelete(e, session.session_id)}
 className="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
 style={{ backgroundColor: style.bgSoft }}
 >
                                            <Trash2 size={16} style={{ color: style.textLow }} />
                                        </motion.button>
                                    </div>

                                    {/* Achievement Badges — ⚠️ 只顯示來自後端真實 milestone_markers，無真實成就時不顯示任何徽章 */}
                                    {(() => {
                                        const realMarkers = session.deepData?.achievements?.milestone_markers;
                                        // 無真實成就資料 → 不渲染徽章列（不再用假資料填充）
                                        if (!Array.isArray(realMarkers) || realMarkers.length === 0) return null;

                                        const labelFor = (marker) => {
                                            if (marker.rank === 'PR') return '個人紀錄';
                                            if (marker.rank === '2nd') return '第 2 佳';
                                            if (marker.rank === '3rd') return '第 3 佳';
                                            return marker.subLabel || marker.rank || '';
                                        };

                                        return (
                                            <div className="flex flex-wrap gap-2 mb-5">
                                                {realMarkers.slice(0, 2).map((marker, i) => (
                                                    <div key={i} className="flex items-center gap-1 px-2.5 py-1 rounded-lg backdrop-blur-sm" style={{ backgroundColor: style.bgSoft, border: `1px solid ${style.border}` }}>
                                                        {marker.rank === 'PR' ? <Trophy size={10} className="text-yellow-600" fill="currentColor" /> : <Medal size={10} style={{ color: style.textMed }} />}
                                                        <span className="text-[11px] font-black" style={{ color: style.textHigh }}>{marker.distance}k {labelFor(marker)}</span>
                                                    </div>
                                                ))}
                                                {realMarkers.length > 2 && (
                                                    <div className="flex items-center px-2 py-1 rounded-lg backdrop-blur-sm" style={{ backgroundColor: style.bgSoft, border: `1px solid ${style.border}` }}>
                                                        <span className="text-[11px] font-black" style={{ color: style.textHigh }}>+{realMarkers.length - 2}</span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    {/* Stats Grid - 3 Columns with Elevation */}
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="rounded-[18px] p-3" style={{ backgroundColor: style.bgSoft }}>
                                            <div className="flex items-center gap-1 mb-1">
                                                <MapPin size={10} style={{ color: style.text }} />
                                                <span className="text-[12px] font-black tracking-wider" style={{ color: style.textMed }}>距離</span>
                                            </div>
                                            <p className="text-lg font-black leading-none" style={{ color: style.text }}>
                                                {num(metrics.distance).toFixed(2)}
                                                <span className="text-[11px] ml-0.5" style={{ color: style.textMed }}>km</span>
                                            </p>
                                        </div>
                                        <div className="rounded-[18px] p-3" style={{ backgroundColor: style.bgSoft }}>
                                            <div className="flex items-center gap-1 mb-1">
                                                <Clock size={10} style={{ color: style.text }} />
                                                <span className="text-[12px] font-black tracking-wider" style={{ color: style.textMed }}>時間</span>
                                            </div>
                                            <p className="text-lg font-black leading-none" style={{ color: style.text }}>
                                                {/* 👇 關鍵修復：兼容 duration_seconds */}
                                                {formatDuration(metrics.duration || metrics.duration_seconds || 0)}
                                            </p>
                                        </div>
                                        <div className="rounded-[18px] p-3" style={{ backgroundColor: style.bgSoft }}>
                                            <div className="flex items-center gap-1 mb-1">
                                                <Activity size={10} style={{ color: style.text }} />
                                                <span className="text-[12px] font-black tracking-wider" style={{ color: style.textMed }}>爬升</span>
                                            </div>
                                            <p className="text-lg font-black leading-none" style={{ color: style.text }}>
                                                {Math.round(metrics.elevationGain || 0)}
                                                <span className="text-[11px] ml-0.5" style={{ color: style.textMed }}>m</span>
                                            </p>
                                        </div>
                                    </div>

                                    {/* Bottom Row: Pace, Calories & Effort */}
                                    <div className="mt-4 flex items-center gap-4 px-1">
                                        <div className="flex flex-col">
                                            <span className="text-[12px] font-bold" style={{ color: style.textLow }}>平均配速</span>
                                            <span className="text-sm font-black" style={{ color: style.text }}>
                                                {/* 👇 關鍵修復：抓取正確的 pace 屬性，並強制秒數補 0 */}
                                                {Math.floor((metrics.avgPace || metrics.pace_per_km || metrics.pace || 0) / 60)}'
                                                {Math.floor((metrics.avgPace || metrics.pace_per_km || metrics.pace || 0) % 60).toString().padStart(2, '0')}"
                                            </span>
                                        </div>
                                        <div className="w-px h-6" style={{ backgroundColor: style.border }}></div>
                                        <div className="flex flex-col">
                                            <span className="text-[12px] font-bold" style={{ color: style.textLow }}>熱量</span>
                                            <div className="flex items-center gap-1">
                                                <span className="text-sm font-black" style={{ color: style.text }}>{Math.round(metrics.calories || 0)}</span>
                                                <Flame size={10} style={{ color: style.textLow }} fill="currentColor" />
                                            </div>
                                        </div>
                                        <div className="w-px h-6" style={{ backgroundColor: style.border }}></div>
                                        <div className="flex flex-col">
                                            <span className="text-[12px] font-bold" style={{ color: style.textLow }}>努力深度</span>
                                            <div className="flex items-center gap-1">
                                                <span className="text-sm font-black" style={{ color: style.text }}>
                                                    {ptsPerMin.toFixed(1)}
                                                </span>
                                                <span className="text-[11px] font-bold" style={{ color: style.textLow }}>分/分鐘</span>
                                            </div>
                                        </div>

                                        <div className="ml-auto w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: style.text }}>
                                            <ChevronRight size={14} style={{ color: style.bg }} />
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })
                    )}
                </div>

                {/* Close DataFade wrapper */}
                </DataFade>

            </div>

            {/* Trends Overlay */}
            {showTrends && <CardioTrendView onClose={() => setShowTrends(false)} />}

            <MobileNavigation />
        </div>
    );
};

// Helper for X icon
const X = ({ size, className }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
);

export default CardioHistoryMobile;
