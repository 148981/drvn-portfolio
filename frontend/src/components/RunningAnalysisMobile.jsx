import React, { useState, useEffect, useMemo } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Activity, Heart, Footprints, Moon, BookOpen, AlertTriangle, Trophy, TrendingUp, Zap, Clock, Flame } from 'lucide-react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, LineChart, Line, CartesianGrid, Tooltip } from 'recharts';
import { getCurrentShoe } from '../utils/shoeManager';
import apiClient from '../api/client';
import { formatDuration } from '../utils/gpsUtils';
import { useChartVisibility } from '../utils/advancedCharts';
import MemberLockCard from './MemberLockCard';
import { useMembership } from '../utils/membership';
import PhysioInsightsGrid from './PhysioInsightsGrid';
import { useRecovery } from '../contexts/RecoveryContext';
import ShoeTrackerCard from './ShoeTrackerCard';
import { getUserId } from '../utils/auth';
import { brandColors as C } from '../utils/colors';
import { buildCoachReport, chartCoachNote, buildRunIntelligence } from '../utils/coachAnalysisEngine';
import RunningLoader from './RunningLoader';
import { medalSrc, medalLabel } from '../utils/sportIcons';
import RunningEvolutionCard from './RunningEvolutionCard'; // 🚩 圖五 分享工作室（FEATURE/APEX/PHYSIO）
import ChartErrorBoundary from './ChartErrorBoundary';
import { buildZoneTimeline, ZONE_COLORS, fmtClock } from '../utils/zoneTimeline';

// 💡 1. 專門用於「總時間」的格式化 (例如 00:57)
const formatRunTime = (seconds) => {
    if (!seconds && seconds !== 0) return "--:--";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    // 如果超過 1 小時，顯示 H:MM:SS
    if (m >= 60) {
        const h = Math.floor(m / 60);
        const remM = m % 60;
        return `${h}:${remM.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// 💡 2. 專門用於「配速」的格式化 (例如 5'30")
const formatRunPace = (secondsPerKm) => {
    if (!secondsPerKm || secondsPerKm === 0 || !isFinite(secondsPerKm)) return "--'--\"";
    const m = Math.floor(secondsPerKm / 60);
    const s = Math.floor(secondsPerKm % 60);
    return `${m}'${s.toString().padStart(2, '0')}"`;
};

// Figure 5 Unified Color Palette
const COLORS = {
    paper: C.paper,
    deepBlack: C.ink,
    stone: C.paper2,
    pebble: C.sand,
    coral: C.coral,
    ember: C.coralDeep,
    white: C.white,
    // Morandi accents used by charts / cards (previously undefined → now intentional)
    sageGreen: '#8FA395',
    slateBlue: '#56A5C7',
    dustyRose: '#EBA5AC',
    mauveGray: '#BDA0A0'
};

// Font Styles
const FontStyle = () => (
    <style>{`
        
        
        .font-serif-elegant {
            font-family: var(--font-body);
        }
        
        .font-serif-body {
            font-family: var(--font-body);
        }

        .font-sans {
            font-family: sans-serif;
        }
        
        .font-atomic-age {
            font-family: var(--font-body);
        }

        .note-label {
            font-size: 8px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.15em;
            color: #161415;
            opacity: 1; /* Pure Black as requested */
            margin-bottom: 4px;
        }

        .glass-card {
            background: rgba(228, 222, 210, 0.7); /* Stone Base */
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid rgba(207, 198, 184, 0.3); /* Pebble Border */
            box-shadow: 0 4px 20px 0 rgba(22, 20, 21, 0.03);
        }

        .paper-texture {
            background-color: ${COLORS.paper};
            background-image: url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.05'/%3E%3C/svg%3E");
        }

        /* Effort Bar - High Contrast Vibrant Palette */
        .bar-segment.recovery, .legend-dot.recovery { background-color: #FDD835; }
        .bar-segment.fat-burn, .legend-dot.fat-burn { background-color: #8BC34A; }
        .bar-segment.aerobic, .legend-dot.aerobic { background-color: #FF9800; }
        .bar-segment.anaerobic, .legend-dot.anaerobic { background-color: #F06292; }
        .bar-segment.extreme, .legend-dot.extreme { background-color: #5C6BC0; }

        /* Override legacy backgrounds for inner card sections */
        .card-main-content, .card-footer, .effort-card-container { 
            background-color: transparent !important; 
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
        }
    `}</style>
);

// ══════════════════════════════════════════════════════════════════════════
// 📑 SectionHeader — 每個圖表區塊的「中型中文標題 ＋ 一句這區在看什麼」。
//
//    使用者回報：「太多專業圖表了，使用者真的會看不太懂 —— 不只要中文化，
//    更要讓他們明確用中標題區分量測種類。」
//    瑞士編輯風：英文小 kicker（uppercase tracking）＋ 中文中標 ＋ 一句白話說明。
// ══════════════════════════════════════════════════════════════════════════
const SectionHeader = ({ kicker, title, desc }) => (
    <div className="pt-6 pb-1">
        {/* 英文 kicker（COACH／SPLITS…）拿掉：介面全中文，標題一層就夠 */}
        <h3
            className="text-[19px] font-black leading-tight text-[#161415]"
            style={{ letterSpacing: '-0.01em' }}
        >
            {title}
        </h3>
        {desc && (
            <p className="text-[12px] font-medium text-black/45 leading-relaxed mt-1.5">{desc}</p>
        )}
        <div className="mt-3 h-px w-full" style={{ background: 'rgba(22,20,21,0.08)' }} />
    </div>
);

// Effort Depth Analysis Component (Synchronized with Results Page)
const EffortDepthAnalysis = ({ deepData, score, streamData, zoneStats, durationSec = 0 }) => {
    // 1. Map Data - More robust extraction (handles both nested and flat structures)
    const deepMetrics = deepData?.deep_metrics || {}; 
    const sourceData = deepData?.zone_distribution || deepMetrics.zone_distribution || zoneStats || {};
    
    // Fallback for score if prop is empty but available in deepData
    const finalScore = score || deepData?.physio_metrics?.physio_load || deepMetrics.physio_load || 0;

    // 2. Normalization / Logic (Identical to Results view)
    const normalizeZone = (key) => {
        if (!key) return null;
        const s = String(key).toLowerCase().replace(/[\s-]/g, '');
        if (s.includes('extreme') || s === '5') return 'extreme';
        if (s.includes('anaerobic') || s === '4') return 'anaerobic';
        if (s.includes('aerobic') || s === '3') return 'aerobic';
        if (s.includes('fat') || s === '2') return 'fat-burn';
        if (s.includes('warm') || s.includes('recovery') || s === '1') return 'recovery';
        return null;
    };

    const ZONE_ORDER = ['recovery', 'fat-burn', 'aerobic', 'anaerobic', 'extreme'];
    const ZONE_LABELS = { 'recovery': '熱身區', 'fat-burn': '燃脂區', 'aerobic': '有氧區', 'anaerobic': '無氧區', 'extreme': '極限區' };

    let finalStats = { 'recovery': 0, 'fat-burn': 0, 'aerobic': 0, 'anaerobic': 0, 'extreme': 0 };
    Object.keys(sourceData).forEach(key => {
        const mapped = normalizeZone(key);
        if (mapped) finalStats[mapped] += (Number(sourceData[key]) || 0);
    });

    const hrArr = streamData?.heart_rate;
    // 🩹 誠實：是否有「真實心率串流」。沒有手錶/心率帶就不該憑分數捏造區間分佈。
    const hasRealHR = Array.isArray(hrArr) && hrArr.filter(h => Number(h) > 40).length > 10;
    const allZero = Object.values(finalStats).every(v => v === 0);
    if (allZero && hrArr && hrArr.length > 1) {
        hrArr.forEach(raw => {
            const hr = Number(raw);
            if (hr < 40) return;
            if (hr <= 130) finalStats['recovery']++;
            else if (hr <= 150) finalStats['fat-burn']++;
            else if (hr <= 170) finalStats['aerobic']++;
            else if (hr <= 190) finalStats['anaerobic']++;
            else finalStats['extreme']++;
        });
    }

    let totalVal = Object.values(finalStats).reduce((a, b) => a + b, 0);

    const hrToZone = (val) => {
        if (val <= 130) return 'recovery';
        if (val <= 150) return 'fat-burn';
        if (val <= 170) return 'aerobic';
        if (val <= 190) return 'anaerobic';
        return 'extreme';
    };

    let totalScore = Math.round(finalScore || 0);
    if (totalScore === 0 && hrArr && hrArr.length > 1) {
        let recalculated = 0;
        const ptsPerMin = { 'recovery': 0.5, 'fat-burn': 1.0, 'aerobic': 2.0, 'anaerobic': 3.5, 'extreme': 5.0 };
        hrArr.forEach(raw => {
            const hr = Number(raw);
            if (hr < 40) return;
            const zone = hrToZone(hr);
            recalculated += (ptsPerMin[zone] || 0.5) / 60;
        });
        totalScore = Math.round(recalculated);
    }

    // 3. 🩹 誠實修正：舊版在「沒有心率」時會依分數捏造一組區間分佈（例如 99% 熱身區），
    //    這是假數據。改為：只有「真的有心率」才允許用分數補全區間；沒手錶就維持空，
    //    下方會走 zoneUnreliable 分支只顯示分數＋恢復需求＋導航推估說明。
    if (totalVal === 0 && totalScore > 0 && hasRealHR) {
        if (totalScore < 30) {
            finalStats['recovery'] = 80; finalStats['fat-burn'] = 20;
        } else if (totalScore < 60) {
            finalStats['recovery'] = 20; finalStats['fat-burn'] = 50; finalStats['aerobic'] = 30;
        } else if (totalScore < 85) {
            finalStats['fat-burn'] = 20; finalStats['aerobic'] = 60; finalStats['anaerobic'] = 20;
        } else {
            finalStats['aerobic'] = 30; finalStats['anaerobic'] = 50; finalStats['extreme'] = 20;
        }
        totalVal = 100; // Total is now normalized to 100% for the synthetic distribution
    }

    const getZoneWidth = (zoneKey) => {
        if (totalVal === 0) return zoneKey === 'recovery' ? 100 : 0;
        return (finalStats[zoneKey] / totalVal) * 100;
    };

    // ══════════════════════════════════════════════════════════════════════
    // 🎨 修復（使用者回報「顏色配錯了，導致比例顯示怪怪的」）：
    //
    //    舊版這條長條是「時間軸」— 用 hrArr 的『樣本數』依時間順序切段；
    //    但下面的圖例百分比是用 finalStats 的『秒數』算的。
    //    兩個來源不同 → 長條看起來 80% 是某個顏色，圖例卻寫 1%，完全對不上。
    //
    //    改為：長條與圖例都從同一份 finalStats 產生（單一真相源），
    //    依 ZONE_ORDER 由輕到重排列 → 長條的每一段寬度＝圖例的百分比，
    //    顏色與比例保證一致。
    // ══════════════════════════════════════════════════════════════════════
    let timelineSegments = null;
    if (totalVal > 0) {
        timelineSegments = ZONE_ORDER
            .filter(z => finalStats[z] > 0)
            .map(z => ({ zone: z, pct: (finalStats[z] / totalVal) * 100 }));
    }
    // ══════════════════════════════════════════════════════════════════════
    // 🕒 真·時間軸（使用者要求：「哪一段時間哪個 zone 你要分好」）
    //
    //    上面那條堆疊長條是「各區總佔比」——依區間輕→重排序，
    //    看得出你在有氧區待了 40%，卻看不出那 40% 是開頭跑太快還是最後衝刺。
    //    這裡另外依「實際時間順序」把心率串流切段，兩條長條回答不同問題：
    //      ① chrono  → 這趟「怎麼跑的」
    //      ② 佔比長條 → 這趟「總共練到什麼」
    //
    //    ⚠ 有真實心率時，下方圖例的秒數改用 chrono.totals，
    //      確保時間軸與佔比出自同一批 segments（歷史上兩者用不同來源
    //      算過，導致長條 80% / 圖例 1% 的災難）。
    // ══════════════════════════════════════════════════════════════════════
    const chrono = useMemo(
        () => buildZoneTimeline(hrArr, streamData?.timestamps, Number(durationSec) || 0),
        [hrArr, streamData, durationSec]
    );
    if (chrono.ok) {
        finalStats = { ...finalStats, ...chrono.totals };
        totalVal = chrono.totalSec;
        timelineSegments = ZONE_ORDER
            .filter(z => (chrono.totals[z] || 0) > 0)
            .map(z => ({ zone: z, pct: (chrono.totals[z] / chrono.totalSec) * 100 }));
    }
    // 時間刻度直接用每一段的起點（比等距刻度更有意義：使用者要看的是「換區的時間點」）
    const hasTimeline = timelineSegments !== null && timelineSegments.length > 0;

    const getDominantZone = () => {
        const ZH = { 'recovery': '熱身區', 'fat-burn': '燃脂區', 'aerobic': '有氧區', 'anaerobic': '無氧區', 'extreme': '極限區' };
        if (totalVal === 0) return ZH['recovery'];
        const maxKey = Object.keys(finalStats).reduce((a, b) => finalStats[a] > finalStats[b] ? a : b);
        return ZH[maxKey] || maxKey;
    };

    const getAnaerobicWork = () => {
        const ana = (finalStats['anaerobic'] || 0) + (finalStats['extreme'] || 0);
        const pct = totalVal > 0 ? (ana / totalVal) * 100 : 0;
        return Math.round(pct) + "%";
    };

    const getRecoveryNeed = () => {
        if (deepMetrics.recovery_hours) return `${deepMetrics.recovery_hours} 小時`;
        let hours = Math.round(totalScore / 5);
        if (hours < 4) hours = 4;
        return `${hours} 小時`;
    };

    // Swiss empty state — score < 10 + 無 zone 數據時不顯示假分佈
    const isEmptyEffort = totalScore < 10 && totalVal === 0;
    const SWISS_FONT = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, sans-serif';

    // 🩹 v2 誠實顯示：區間資料來源（heart_rate | estimated_pace | none）＋舊資料防呆
    //   （例：25 分鐘的跑只有 14 秒 zone 資料 → 不再顯示「100% 熱身區」假象）
    const zoneSource = deepData?.deep_metrics?.zone_source || deepMetrics.zone_source || null;
    const zoneEstimated = zoneSource === 'estimated_pace';
    // 🩹 沒有真實心率、也不是合法的配速推估 → 不顯示區間分佈，只給分數＋恢復需求＋說明。
    const zoneUnreliable = zoneSource === 'none' || (!hasRealHR && !zoneEstimated) || (
        !zoneEstimated &&
        (!hrArr || hrArr.length <= 10) &&
        Number(durationSec) > 300 &&
        totalVal > 0 &&
        totalVal < Number(durationSec) * 0.2
    );

    if (isEmptyEffort) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ type: 'spring', stiffness: 100, damping: 22 }}
                style={{ padding: '24px 4px', borderTop: '1px solid rgba(0,0,0,0.10)', fontFamily: SWISS_FONT }}
            >
                <div className="flex items-baseline justify-between pb-4 border-b border-black/10 mb-5">
                    <div>
                        <p className="text-[12px] font-black tracking-[0.04em] text-black/45 mb-1">— 生理負荷</p>
                        <h3 style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '-0.03em', margin: 0, color: '#161415' }}>努力深度</h3>
                    </div>
                    <div className="text-right">
                        <span className="tabular-nums" style={{ fontSize: '42px', fontWeight: 900, color: 'rgba(22,20,21,0.18)', lineHeight: 1 }}>—</span>
                        <span className="text-[11px] font-black uppercase tracking-widest text-black/30 ml-1">pts</span>
                    </div>
                </div>
                <p className="text-[12px] font-medium text-black/55 leading-relaxed max-w-[320px]">
                    尚無生理負荷資料。完成一次 10 秒以上、有心率記錄的活動後，各區間的時間分配與訓練效益會在這裡呈現。
                </p>
            </motion.div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ type: 'spring', stiffness: 100, damping: 22 }}
            style={{ padding: '24px 4px 8px 4px', borderTop: '1px solid rgba(0,0,0,0.10)', fontFamily: SWISS_FONT }}
        >
            {/* Header — Swiss editorial */}
            <div className="flex items-baseline justify-between pb-4 border-b border-black/10 mb-5">
                <div>
                    <p className="text-[12px] font-black tracking-[0.04em] text-black/45 mb-1">— 生理負荷</p>
                    <h3 style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '-0.03em', margin: 0 }}>努力深度</h3>
                </div>
                <div className="flex items-baseline gap-1">
                    <span className="tabular-nums" style={{ fontSize: '42px', fontWeight: 900, color: COLORS.coral, lineHeight: 1, letterSpacing: '-0.04em' }}>{totalScore}</span>
                    <span className="text-[12px] font-black tracking-widest text-black/40">pts{zoneUnreliable ? ' · 推估' : ''}</span>
                </div>
            </div>

            <p className="text-[12px] font-black tracking-[0.04em] text-black/45 mb-3">— 區間分佈</p>

            {/* 🩹 資料來源誠實標示 */}
            {zoneEstimated && (
                <div className="flex items-start gap-2 mb-4 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(202,138,4,0.08)', border: '1px solid rgba(202,138,4,0.18)' }}>
                    <p className="text-[11px] font-bold leading-relaxed" style={{ color: '#8a6d0b' }}>
                        手錶未接收到心率數據 — 區間分佈由「配速相對強度」推算，僅供參考。
                    </p>
                </div>
            )}
            {zoneUnreliable && (
                <div className="mb-5">
                    <div className="h-1.5 w-full" style={{ background: 'rgba(0,0,0,0.06)' }} />
                    <p className="text-[11px] text-black/45 font-bold leading-relaxed mt-2">
                        沒有偵測到心率數據，無法拆出五區時間分配。上方分數為依配速與 GPS 距離推估的努力值；配戴 Apple Watch 或心率帶後，這裡會顯示真實的心率區間分佈。
                    </p>
                </div>
            )}

            {/* ── ① 整趟時間軸：第幾分鐘在哪一區（依實際時間順序）── */}
            {!zoneUnreliable && chrono.ok && (
            <div className="mb-6">
                <div className="flex items-baseline justify-between mb-2">
                    <p className="text-[12px] font-black tracking-[0.04em] text-black/40">整趟時間軸</p>
                    <p className="text-[11px] font-bold text-black/35">{chrono.segments.length} 段 · 依實際時序</p>
                </div>
                {/* ═══ 一條完整 100% 的進度條：每一段用該 zone 的顏色 ═══
                    使用者要求：「用有顏色區分 zone 去顯示一條完整 100%，
                    呈現裡面進度條哪一段是什麼顏色」。
                    → 長條本身就是答案，文字全部塞進段落裡；
                      窄到放不下字的段落只留顏色（硬塞會糊成一團）。 */}
                <div
                    className="w-full flex"
                    style={{ height: 46, borderRadius: 10, overflow: 'hidden', background: 'rgba(0,0,0,0.05)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)' }}
                >
                    {chrono.segments.map((seg, i) => {
                        const pct = (seg.durSec / chrono.totalSec) * 100;
                        const mins = Math.round(seg.durSec / 60);
                        return (
                            <div
                                key={i}
                                style={{
                                    width: `${pct}%`, background: ZONE_COLORS[seg.zone],
                                    borderRight: i < chrono.segments.length - 1 ? '2px solid #FFF' : 'none',
                                    display: 'flex', flexDirection: 'column',
                                    alignItems: 'center', justifyContent: 'center',
                                    overflow: 'hidden', minWidth: 0,
                                }}
                                title={`${fmtClock(seg.startSec)} – ${fmtClock(seg.endSec)}　${ZONE_LABELS[seg.zone]}　${mins} 分 · ${Math.round(pct)}%`}
                            >
                                {/* 手機上長條約 350px 寬：9.5px 中文字 ≈ 9.5px。
                                    3 字「無氧區」需 ~8.3%、2 字「無氧」需 ~5.4%、
                                    副標「3 分 · 11%」需 ~16%。門檻照這個算，
                                    才不會該放得下的段落被誤判成放不下。 */}
                                {pct >= 8 && (
                                    <span className="text-[11px] font-black leading-none whitespace-nowrap" style={{ color: '#FFF' }}>
                                        {pct >= 13 ? ZONE_LABELS[seg.zone] : ZONE_LABELS[seg.zone].replace('區', '')}
                                    </span>
                                )}
                                {pct >= 18 && (
                                    <span className="text-[11px] font-bold leading-none mt-1 tabular-nums whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.85)' }}>
                                        {mins} 分 · {Math.round(pct)}%
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* 段落分界的實際時間（貼齊每段起點；太窄的段落跳過避免疊字） */}
                <div className="relative w-full" style={{ height: 14, marginTop: 3 }}>
                    {chrono.segments.map((seg, i) => {
                        const leftPct = (seg.startSec / chrono.totalSec) * 100;
                        const pct = (seg.durSec / chrono.totalSec) * 100;
                        if (i > 0 && pct < 8) return null;
                        return (
                            <span
                                key={i}
                                className="absolute text-[11px] font-bold tabular-nums text-black/40"
                                style={{ left: `${leftPct}%`, transform: i === 0 ? 'none' : 'translateX(-50%)' }}
                            >
                                {fmtClock(seg.startSec)}
                            </span>
                        );
                    })}
                    <span className="absolute right-0 text-[11px] font-bold tabular-nums text-black/40">
                        {fmtClock(chrono.totalSec)}
                    </span>
                </div>

                {/* 窄段落在長條裡放不下字 → 這裡補齊，確保每一段都查得到 */}
                {chrono.segments.some((s) => (s.durSec / chrono.totalSec) * 100 < 8) && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                        {chrono.segments
                            .filter((s) => (s.durSec / chrono.totalSec) * 100 < 8)
                            .map((seg, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                    <span className="shrink-0 rounded-full" style={{ width: 6, height: 6, background: ZONE_COLORS[seg.zone] }} />
                                    <span className="text-[11px] font-bold tabular-nums text-black/45">
                                        {fmtClock(seg.startSec)}–{fmtClock(seg.endSec)} {ZONE_LABELS[seg.zone]}
                                    </span>
                                </div>
                            ))}
                    </div>
                )}
            </div>
            )}

            {/* ── ② 各區總佔比（把時間軸重新依區間輕→重排序後的總和）── */}
            {!zoneUnreliable && (
            <div className="mb-5">
                {chrono.ok && (
                    <p className="text-[12px] font-black tracking-[0.04em] text-black/40 mb-2">各區總佔比</p>
                )}
                {hasTimeline ? (
                    <div className="h-2.5 w-full overflow-hidden flex rounded-full" style={{ background: 'rgba(0,0,0,0.06)' }}>
                        {timelineSegments.map((seg, i) => (
                            <div
                                key={i}
                                className={`bar-segment ${seg.zone}`}
                                style={{ width: `${seg.pct}%`, border: 'none' }}
                                title={`${ZONE_LABELS[seg.zone]} ${Math.round(seg.pct)}%`}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="h-1.5 w-full" style={{ background: 'rgba(0,0,0,0.06)' }} />
                )}
            </div>
            )}

            {/* Zone Legend — 3 cols Swiss editorial */}
            {!zoneUnreliable && (
            <div className="grid grid-cols-3 gap-y-4 gap-x-3 mb-6">
                {ZONE_ORDER.map(key => {
                    const width = getZoneWidth(key);
                    const seconds = finalStats[key] || 0;
                    const mins = Math.floor(seconds / 60);
                    const secs = seconds % 60;
                    const isEmpty = width <= 0.5;
                    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

                    return (
                        <div key={key} className="flex items-start gap-2" style={{ opacity: isEmpty ? 0.3 : 1 }}>
                            <span className={`w-1.5 h-1.5 rounded-full legend-dot ${key} mt-[7px] shrink-0`} />
                            <div className="flex flex-col min-w-0">
                                <span className="text-[11px] font-bold text-black/55 leading-tight uppercase tracking-[0.1em] truncate">{ZONE_LABELS[key]}</span>
                                <span className="text-[15px] font-black text-black tabular-nums leading-tight mt-1">
                                    {Math.round(width)}<span className="text-[11px] opacity-50 ml-0.5">%</span>
                                </span>
                                {!isEmpty && seconds > 0 && (
                                    <span className="text-[11px] font-bold text-black/40 tabular-nums leading-none mt-0.5">{timeStr}</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
            )}

            {/* Footer — divide-y Swiss editorial */}
            <div className="divide-y divide-black/10 mt-2 border-t border-black/10">
                <div className="flex items-baseline justify-between py-3">
                    <span className="text-[12px] font-black tracking-[0.04em] text-black/45">主導區間</span>
                    <span className="text-[12px] font-black tracking-tight text-black/80">{zoneUnreliable ? '—' : `${getDominantZone()}${zoneEstimated ? '（推算）' : ''}`}</span>
                </div>
                <div className="flex items-baseline justify-between py-3">
                    <span className="text-[12px] font-black tracking-[0.04em] text-black/45">無氧佔比</span>
                    <span className="text-[12px] font-black tracking-tight text-black/80 tabular-nums">{zoneUnreliable ? '—' : getAnaerobicWork()}</span>
                </div>
                <div className="flex items-baseline justify-between py-3">
                    <span className="text-[12px] font-black tracking-[0.04em] text-black/45">恢復需求</span>
                    <span className="text-[12px] font-black tracking-tight text-black/80 tabular-nums">{getRecoveryNeed()}</span>
                </div>
            </div>
        </motion.div>
    );
};

// 🛡️ P2 修復：EmptyChart 是純靜態空狀態，無任何 closure 依賴，搬到模組頂層，
// 避免每次父元件 render 重建型別、導致圖表區塊不必要的卸載重掛。
const EmptyChart = ({ unit, message }) => (
    <div className="h-28 w-full mb-2 flex flex-col items-center justify-center gap-2 rounded-2xl" style={{ background: 'rgba(0,0,0,0.03)' }}>
        <span className="text-[12px] font-bold text-black/45">{message || '尚未取得數據'}</span>
        <span className="text-[11px] text-black/35 leading-relaxed text-center px-6">需要 Apple Watch 或手機動作感測才能記錄，戶外配戴後即可顯示。</span>
    </div>
);

const RunningAnalysisMobile = () => {
    const navigate = useNavigate();
    const { sessionId } = useParams();
    const location = useLocation();
    const chartVis = useChartVisibility(); // 進階生理指標 = 會員圖表（utils/advancedCharts 登記表）
    const { canUse: memberCan } = useMembership();
    const runFull = memberCan('runAnalysis');   // 💳 完整跑步分析：分數拆解、教練全部建議、跑姿、負荷
    const [sessionData, setSessionData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    // 🚩 分享改開圖五工作室（RunningEvolutionCard）；最新動態的分享也帶 openCheckIn 進來 → 一律開工作室
    const [showEvolution, setShowEvolution] = useState(!!location.state?.openCheckIn);

    // ⚠️ Mock data generator removed — 此頁只顯示來自真實跑步的後端數據。

    // 🔥 Use Recovery Context for real-time timer updates
    const { isRecovering, recoveryTimer, skipRecovery } = useRecovery();

    const loadSessionData = async () => {
        setLoading(true);
        setError(null);
        let idToFetch = sessionId;
        // watch_xxx 是 Apple Watch 的臨時前端 ID，後端不認識
        // 直接 fallback 到後端回傳的真實 session ID
        if (!idToFetch || idToFetch === 'latest' || idToFetch?.startsWith('watch_')) {
            idToFetch = localStorage.getItem('lastSavedSessionId');
        }

        // Retry helper to handle race conditions where backend analysis isn't ready
        // Increased to 5 retries * 1.5s = ~7.5s wait time
        const fetchWithRetry = async (fn, retries = 5, delay = 1500) => {
            try {
                return await fn();
            } catch (error) {
                if (retries > 0) {
                    console.log(`Data not ready, retrying in ${delay}ms... (${retries} left)`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return fetchWithRetry(fn, retries - 1, delay);
                }
                throw error;
            }
        };

        if (idToFetch) {
            try {
                // Pre-resolve userId before closure to avoid Safari/WKWebView scope issues
                // 🤝 從社群動態點好友的跑步進來時，state.ownerId = 對方的 userId（session 屬於對方）
                const currentUserId = location.state?.ownerId || getUserId();
                // Wrap the API call with retry logic
                const [routeRes, deepRes] = await fetchWithRetry(() => Promise.all([
                    apiClient.get(`/api/cardio/session/${idToFetch}/route?user_id=${currentUserId}`),
                    apiClient.get(`/api/cardio/deep-analysis/${idToFetch}?user_id=${currentUserId}`)
                ]));

                const newData = {
                    cardioData: {
                        stats: routeRes.data.metrics,
                        route: routeRes.data.route_data,
                        stream_data: routeRes.data.stream_data  // 🔥 Include stream data for charts
                    },
                    // 🔥 CRITICAL FIX: Backend now returns {deepData: {...}}, so extract it
                    deepData: deepRes.data.deepData || deepRes.data,  // Fallback for old structure
                    timestamp: routeRes.data.created_at || new Date().toISOString(),
                    splits_analysis: deepRes.data.splits_analysis || [],
                    split_unit: deepRes.data.split_unit || "1km"
                };

                // 🔥 DEBUG: Log the API response and constructed data
                console.log("═══════════════════════════════════════");
                console.log("🔍 DEBUG: deepRes.data (raw API response):", JSON.stringify(deepRes.data, null, 2));
                console.log("🔍 DEBUG: deepRes.data.deepData:", JSON.stringify(deepRes.data.deepData, null, 2));
                console.log("🔍 DEBUG: newData.deepData (what we set):", JSON.stringify(newData.deepData, null, 2));
                console.log("═══════════════════════════════════════");

                setSessionData(newData);
                setLoading(false);

            } catch (err) {
                console.error("API Fetch Error after retries:", err);

                // 區分錯誤類型，給使用者有意義的說明
                const status = err?.response?.status;
                let errorInfo;

                if (status === 404) {
                    errorInfo = {
                        type: 'not_found',
                        title: '找不到這筆跑步紀錄',
                        message: `Session ID「${idToFetch}」在伺服器上不存在，可能尚未儲存成功或已被刪除。`,
                        canRetry: false,
                    };
                } else if (status === 202 || status === 503 || err?.message?.includes('timeout')) {
                    errorInfo = {
                        type: 'processing',
                        title: 'AI 報告生成中',
                        message: 'AI 正在分析你的跑步數據，通常需要 10–30 秒。請稍後再試。',
                        canRetry: true,
                    };
                } else if (!navigator.onLine) {
                    errorInfo = {
                        type: 'offline',
                        title: '目前沒有網路連線',
                        message: '請確認你的網路狀態後再重試。',
                        canRetry: true,
                    };
                } else if (status >= 500) {
                    errorInfo = {
                        type: 'server',
                        title: '伺服器發生錯誤',
                        message: `伺服器回傳 ${status} 錯誤，可能是後端 AI 分析服務暫時異常，請稍後再試。`,
                        canRetry: true,
                    };
                } else {
                    errorInfo = {
                        type: 'unknown',
                        title: '無法載入分析報告',
                        message: `已重試 5 次仍無法取得數據（${err?.message || '未知錯誤'}）。如問題持續請回上頁重新進入。`,
                        canRetry: true,
                    };
                }

                setError(errorInfo);
                setLoading(false);
            }
        } else {
            console.warn('No session ID found for analysis');
            setError({
                type: 'no_session',
                title: '找不到跑步記錄',
                message: '找不到這趟的紀錄。請回上頁確認跑步已儲存再重試。',
                canRetry: false,
            });
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSessionData();
    }, [sessionId, navigate]);

    if (loading) {
        // 🟢 統一使用 App 的加載頁（RunningLoader），取代原本的 Loading Analysis 畫面
        return <RunningLoader />;
    }

    if (error) {
        const isProcessing = error.type === 'processing';
        return (
            <div className="min-h-[100dvh] flex items-center justify-center relative overflow-hidden p-6">
                {/* 與 loading 畫面相同背景，維持設計一致性 */}
                <div className="fixed inset-0 z-[-1]" style={{ backgroundImage: 'url("/images/(9) Instagram.jpg")', backgroundSize: '100% 100%' }} />
                {/* 半透明遮罩讓文字易讀 */}
                <div className="fixed inset-0 z-[-1]" style={{ backgroundColor: 'rgba(246,244,241,0.82)' }} />
                <FontStyle />
                <div className="text-center max-w-xs w-full">
                    {/* icon */}
                    <div className="mb-5 flex justify-center">
                        {isProcessing ? (
                            <Activity size={44} className="animate-pulse" style={{ color: COLORS.coral }} />
                        ) : (
                            <AlertTriangle size={44} style={{ color: COLORS.coral }} />
                        )}
                    </div>
                    {/* 標題 */}
                    <h3 className="font-serif-elegant text-xl mb-3" style={{ color: COLORS.deepBlack }}>
                        {error.title}
                    </h3>
                    {/* 原因說明 */}
                    <p className="font-sans text-sm mb-6 leading-relaxed" style={{ color: '#6B6060' }}>
                        {error.message}
                    </p>
                    <div className="flex flex-col gap-3">
                        {error.canRetry && (
                            <motion.button {...pressProps('pill')}
 onClick={loadSessionData}
 className="text-white py-3 px-6 rounded-xl font-bold text-sm shadow-md"
 style={{ backgroundColor: COLORS.coral }}
 >
                                重新嘗試
                            </motion.button>
                        )}
                        <motion.button {...pressProps('row')}
 onClick={() => {
 /* 這一頁載入失敗時 navigate(-1) 常常回到一個已經被 replace 掉的
 歷史項目 → 使用者以為「頁面不見了」。有來源頁就明確回去。 */
 const from = location?.state?.from;
 if (from) navigate(from); else navigate(-1);
 }}
 className="font-sans text-xs underline"
 style={{ color: COLORS.pebble }}
 >
                            返回上一頁
                        </motion.button>
                    </div>
                </div>
            </div>
        );
    }

    if (!sessionData) return null; // Should be covered by error/loading states

    const { cardioData, splits_analysis: splits, split_unit: splitUnit } = sessionData;

    // 🏆 Run Score（打分系統）— 依需求只在 Deep Analysis 頁出現（結算頁只做鼓勵）。
    //    用完整教練引擎 buildRunIntelligence 算這趟的執行品質分（0–100）。
    let runIntel = null;
    try {
        runIntel = buildRunIntelligence({
            stats: cardioData?.stats,
            splits: cardioData?.stats?.splits,
            splitsAnalysis: splits,
            stream_data: cardioData?.stream_data,
            deepData: sessionData.deepData,
        });
        // 🩹 分數一致性：若這場已有「存檔時算好的分數」，一律以存檔值為準顯示，
        //    不要每次進頁面重算 —— 否則「剛結束(有即時心率)」與「從動態重進(讀不到心率)」
        //    會走不同支柱、分母不同 → 同一場跑步分數不一樣。
        if (runIntel) {
            const storedScore = Number(
                cardioData?.stats?.run_score ?? cardioData?.stats?.runScore ??
                cardioData?.run_score ?? sessionData?.deepData?.run_score
            );
            if (Number.isFinite(storedScore) && storedScore > 0) {
                runIntel.runScore = Math.round(storedScore);
                if (cardioData?.stats?.run_grade || cardioData?.stats?.runGrade) {
                    runIntel.runGrade = cardioData.stats.run_grade || cardioData.stats.runGrade;
                }
            }
        }
    } catch { runIntel = null; }

    // Helper for Dynamic Greeting (Copied from CardioResultsMobile)
    const getRunTitle = () => {
        const date = new Date(cardioData?.timestamp || new Date());
        const hour = date.getHours();
        const morningTitles = ["Morning Ritual", "Dawn Patrol", "Sunrise Stride"];
        const middayTitles = ["Solar Session", "Midday Grind", "Power Break"];
        const afternoonTitles = ["Golden Hour", "Sunset Chase", "Dusk Dash"];
        const eveningTitles = ["Night Shift", "After Hours", "Evening Flow"];
        const pick = (arr) => arr[(date.getDate() + hour) % arr.length].toUpperCase();
        if (hour >= 5 && hour < 11) return pick(morningTitles);
        if (hour >= 11 && hour < 16) return pick(middayTitles);
        if (hour >= 16 && hour < 18) return pick(afternoonTitles);
        return pick(eveningTitles);
    };

    // 🔥 Generate 1.0km Splits from Stream Data (Frontend Calculation)
    const generate1kmSplits = () => {
        // Fallback to original splits if stream data is insufficient
        if (!cardioData?.stream_data?.timestamps || !cardioData?.stream_data?.pace) return splits;

        const { timestamps, pace } = cardioData.stream_data;
        if (timestamps.length < 2) return splits;

        // 🔴 Fix(分段膨脹)：以「回報總距離」為權威上限，避免串流 pace 雜訊把距離累積膨脹
        //    （13km 卻跑出 17 段的根因）。段數上限 = floor(總距離)。
        const reportedKm = Number(cardioData?.stats?.distance ?? cardioData?.stats?.distance_km ?? 0);
        const maxWholeKm = reportedKm > 0 ? Math.floor(reportedKm + 1e-6) : Infinity;

        const newSplits = [];
        let currentDist = 0;
        // 🩹 改為「時間/距離加權」而非「瞬時配速算術平均」：
        //    算術平均會被慢速點(紅燈/上坡/GPS抖動)過度放大，系統性偏慢 ~20-30 秒/km，
        //    導致分段配速比整趟平均(圖四, 接近 Strava)慢一截、對不起來。
        //    正確配速 = 該公里實際累積時間 / 實際累積距離。
        let bucketTime = 0;   // 這一公里桶累積的秒數
        let bucketDist = 0;   // 這一公里桶累積的距離(km)
        let nextMilestone = 1.0; // 1.0km

        for (let i = 1; i < timestamps.length; i++) {
            const timeDelta = (timestamps[i] - timestamps[i - 1]) / 1000; // seconds
            const currentPace = pace[i] || pace[i - 1] || 300; // s/km

            if (currentPace > 0 && currentPace < 3600) { // Filter outliers
                const distDelta = timeDelta / currentPace; // km
                currentDist += distDelta;
                bucketTime += timeDelta;
                bucketDist += distDelta;

                if (currentDist >= nextMilestone && newSplits.length < maxWholeKm) {
                    const wPace = bucketDist > 0 ? bucketTime / bucketDist : currentPace; // 時間/距離加權配速
                    newSplits.push({
                        km: nextMilestone,
                        distanceKm: 1,          // 完整公里段
                        partial: false,
                        pace: wPace,
                        is_pr: false,
                        is_fastest: false
                    });

                    bucketTime = 0;
                    bucketDist = 0;
                    nextMilestone += 1.0;
                }
            }
        }

        // 尾段（未滿 1km 的餘數）：標成 partial，標籤用「下一個整數公里」避免與最後完整段撞號，
        // 且帶 distanceKm 供渲染端判定為尾段(不列入完整公里數/最快段比較)。
        if (bucketDist > 0.02 && newSplits.length < maxWholeKm + 1 && reportedKm > newSplits.length) {
            const wPace = bucketTime / bucketDist;
            const tailDist = Number(Math.min(bucketDist, Math.max(0, reportedKm - newSplits.length)).toFixed(3));
            if (tailDist > 0.02) {
                newSplits.push({
                    km: newSplits.length + 1,   // 例：已有 5 段 → 尾段標 6（不會和第 5 段的 "5" 撞號）
                    distanceKm: tailDist,       // 尾段實際距離(<1)，渲染端據此顯示「尾段」
                    partial: true,
                    pace: wPace,
                    is_pr: false,
                    is_fastest: false
                });
            }
        }

        // Calculate Fastest — 只在「完整公里段」裡找最快，尾段(partial)不參與比較
        const wholeSplits = newSplits.filter(s => !s.partial);
        if (wholeSplits.length > 0) {
            const minPace = Math.min(...wholeSplits.map(s => s.pace));
            newSplits.forEach(s => s.is_fastest = !s.partial && Math.abs(s.pace - minPace) < 1);
        }

        return newSplits.length > 0 ? newSplits : splits;
    };

    // For now, I'll stick to updating the PROPS passed to components
    const runTitle = getRunTitle();
    const activeSplits = generate1kmSplits();

    return (
        <div className="w-full min-h-[100dvh] relative" style={{ backgroundColor: 'transparent' }}>
            {/* Clean Paper Background */}
            <div
                className="fixed inset-0 pointer-events-none"
                style={{
                    zIndex: -1,
                    backgroundColor: COLORS.paper
                }}
            />
            <div className="min-h-[100dvh] pb-32" style={{ backgroundColor: 'transparent' }}>
                <FontStyle />

                {/* Header (Back Button - Minimal) */}
                <div className="sticky top-0 z-20 pb-2 px-6 flex justify-between items-center"
                    style={{
                        backgroundColor: 'transparent',
                        paddingTop: 'max(env(safe-area-inset-top), 24px)',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                    }}>
                    <motion.button {...pressProps('row')}
 onClick={() => {
 // 從哪來就回哪去（例如最近動態列表）→ 優先返回來源頁
 const from = location?.state?.from;
 if (from) {
 navigate(from);
 } else if (sessionData && sessionData.cardioData) {
 navigate('/cardio-tracker-mobile', {
 state: { showResults: true, cardioData: sessionData.cardioData }
 });
 } else {
 navigate(-1);
 }
 }}
 className="w-10 h-10 flex items-center justify-center text-black active:opacity-60 transition-opacity"
 style={{ background: 'transparent' }}
 >
                        <ArrowLeft size={20} strokeWidth={1.6} />
                    </motion.button>
                    {/* Swiss Editorial — issue line in nav */}
                    <span
                        className="text-black"
                        style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: '11px',
                            fontWeight: 900,
                            letterSpacing: '0.32em',
                            textTransform: 'uppercase',
                        }}
                    >
                        Analysis ── No. {String(new Date().getDate()).padStart(2, '0')}
                    </span>
                    <div className="w-10" />
                </div>

                {/* Recovery Timer — Sticky top thin bar，不擋畫面 */}
                {isRecovering && recoveryTimer > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ type: 'spring', stiffness: 110, damping: 22 }}
                        className="sticky z-30 w-full flex items-center justify-between px-5"
                        style={{
                            top: 'max(env(safe-area-inset-top), 0px)',
                            background: C.coral,
                            color: C.white,
                            height: 36,
                            fontFamily: 'var(--font-body)',
                            boxShadow: '0 4px 12px rgba(249, 92, 75, 0.18)',
                        }}
                    >
                        <div className="flex items-center gap-2.5">
                            <motion.span
                                className="w-1.5 h-1.5 rounded-full bg-white"
                                animate={{ opacity: [0.4, 1, 0.4] }}
                                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                            />
                            <span className="text-[11px] font-black uppercase tracking-[0.22em] tabular-nums">
                                Recovering · {String(recoveryTimer).padStart(2, '0')}s
                            </span>
                            <Heart size={11} fill="white" className="text-white" />
                        </div>
                        <motion.button {...pressProps('row')}
 onClick={skipRecovery}
 className="text-[11px] font-black uppercase tracking-[0.22em] text-white/75 hover:text-white active:opacity-60 transition-opacity"
 >
                            Skip
                        </motion.button>
                    </motion.div>
                )}
                <div className="max-w-lg mx-auto px-6 pt-4 space-y-6">

                    {/* 1. Report Header Card */}
                    <ReportHeaderCard stats={sessionData.cardioData?.stats} title={runTitle} timestamp={cardioData?.timestamp} />

                    {/* 1.5 🏆 DRVN Run Score — 打分系統（只在 Deep Analysis 頁出現）。
                        結算頁做鼓勵、深度分析頁才亮出這趟的執行品質分（0–100，缺資料只算有的維度）。 */}
                    <ChartErrorBoundary>
                    {runIntel && (runIntel.runScore != null ? (
                        <div className="pb-5 border-b border-black/10">
                            <div className="flex items-end justify-between">
                                <div>
                                    <div className="text-[12px] font-black tracking-[0.28em] text-black/45 mb-1">— {(runIntel.scoreLabel || 'RUN SCORE').toUpperCase()}{runIntel.scoreBasis === 'no_hr' ? (runIntel.isBike ? ' · 依速度/GPS' : ' · 依配速/GPS') : ''}{runIntel.isBike && runIntel.avgSpeedKmh ? ` · 均速 ${runIntel.avgSpeedKmh} km/h` : ''}</div>
                                    <div className="flex items-baseline gap-2">
                                        <span className="tabular-nums" style={{ fontSize: 56, fontWeight: 300, lineHeight: 0.9, letterSpacing: '-0.04em', color: C.coral, fontFamily: '"Tenor Sans", sans-serif' }}>{runIntel.runScore}</span>
                                        <span className="text-[13px] font-black text-black/40">/100</span>
                                        <span className="text-[15px] font-black" style={{ color: C.coral }}>{runIntel.runGrade}</span>
                                    </div>
                                </div>
                            </div>
                            {/* pillar 拆解 — 每一項幾分/滿分（讓分數可解釋、不是黑箱）；💳 拆解是完整跑步分析（會員） */}
                            {runFull && (
                            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
                                {(runIntel.scorePillars || []).map((p) => (
                                    <span key={p.key} className="text-[11px] font-bold text-black/50 tabular-nums">
                                        {p.label} <span className="text-black/80 font-black">{p.points}</span><span className="text-black/30">/{p.max}</span>
                                    </span>
                                ))}
                            </div>
                            )}
                        </div>
                    ) : (
                        <div className="pb-5 border-b border-black/10">
                            <div className="text-[11px] font-black uppercase tracking-[0.28em] text-black/45 mb-1">— RUN SCORE</div>
                            <p className="text-[12px] font-bold text-black/55 leading-relaxed">這趟缺少逐段配速或心率，無法評分。戴手錶或用戶外 GPS 就有完整 Run Score。</p>
                        </div>
                    ))}
                    </ChartErrorBoundary>

                    {/* 📸 重新分享入口 — 錯過結束當下的分享，之後隨時可回來打卡 */}
                    <motion.button {...pressProps('row')}
 onClick={() => setShowEvolution(true)}
 className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl"
 style={{ background: 'rgba(22,20,21,0.05)', border: '1px solid rgba(22,20,21,0.08)' }}
 >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
                        <span className="text-[12px] font-black tracking-[0.04em]" style={{ color: C.ink }}>分享這次跑步 · 打卡頁</span>
                    </motion.button>

                    {/* ══════════════════════════════════════════════════════
                        📐 區塊順序 =「回饋感由高到低」
                           ① 教練肯定與進步 → ② 破紀錄／里程碑 → ③ 分段表現
                           → ④ 跑姿步態 → ⑤ 路線與爬升 → ⑥ 生理負荷 → ⑦ 專業指標
                        每一區都有中文中標題 ＋ 一句「這區在看什麼」，
                        使用者不用猜每張圖是幹嘛的。
                        ══════════════════════════════════════════════════════ */}

                    {/* ① 教練怎麼看 —— 先肯定，永遠排第一 */}
                    <SectionHeader
                        kicker="COACH"
                        title="教練怎麼看這一趟"
                        desc="先講你做對了什麼，再講可以怎麼調整。"
                    />
                    <ChartErrorBoundary>
                    <CoachReportSection cardioData={sessionData.cardioData} deepData={sessionData.deepData} full={runFull} />
                    </ChartErrorBoundary>

                    {/* ② 破紀錄與里程碑 —— 辛苦運動後最該先被看到的回報 */}
                    <SectionHeader
                        kicker="RECORDS"
                        title="這趟破了哪些紀錄"
                        desc="每個距離單位分開比較，金銀銅代表在你的歷史中排第幾。"
                    />
                    <ChartErrorBoundary>
                    <MilestoneSummary cardioData={{
                        ...sessionData.cardioData,
                        deepData: sessionData.deepData,
                        sessionId: (sessionId && sessionId !== 'latest' && !String(sessionId).startsWith('watch_'))
                            ? sessionId
                            : (typeof localStorage !== 'undefined' ? localStorage.getItem('lastSavedSessionId') : null),
                    }} />
                    </ChartErrorBoundary>

                    {/* ③ 分段表現（標題在下方 splits 區塊內，這裡先放小節說明） */}
                    <SectionHeader
                        kicker="SPLITS"
                        title="每一公里跑得如何"
                        desc="長條越長代表那一公里越快。看得出你是前快後慢，還是穩住到最後。"
                    />

                    {/* 6. Splits List Analysis */}
                    {activeSplits && activeSplits.length > 0 && (() => {
                        // Strava 式分段：橫向配速長條（越快越長）+ 頂部小結算。
                        // ⚠️ 尾段（不足 1 公里）不參與「最快一段」比較 —— 使用者回報
                        //    「最後第十公里會有兩個，最後一個顯示 5 分速變最快」，
                        //    就是 0.22km 的收尾被當成完整公里去比配速。
                        const isPartial = (s) => s?.partial === true
                            || (Number(s?.distanceKm ?? s?.distance_km ?? 1) > 0
                                && Number(s?.distanceKm ?? s?.distance_km ?? 1) < 0.95);
                        const fullSplits = activeSplits.filter((s) => !isPartial(s));
                        const paces = fullSplits.map(s => s.pace).filter(p => p > 0);
                        const fastest = paces.length ? Math.min(...paces) : 0;
                        const slowest = paces.length ? Math.max(...paces) : 0;
                        const fastestKm = fullSplits.find(s => s.pace === fastest)?.km;
                        // 條長：最快=100%、最慢=42%（保留可讀下限）
                        const barPct = (p) => {
                            if (!p || slowest === fastest) return 100;
                            const t = (slowest - p) / (slowest - fastest); // 0..1（越快越大）
                            return Math.round(42 + t * 58);
                        };
                        return (
                        <div className="bg-transparent mt-2">
                            <div className="flex justify-between items-center mb-4 pb-2 border-b border-black/5">
                                <p className="note-label !mb-0 opacity-100">分段分析</p>
                                <span className="note-label !mb-0 opacity-40">單位：每 1.0 公里</span>
                            </div>

                            {/* 頂部小結算（類似 Strava 結果列） */}
                            <div className="grid grid-cols-3 gap-2 mb-5">
                                {[
                                    { label: '完整公里數', value: fullSplits.length },
                                    { label: '最快一段', value: fastestKm ? `第 ${Math.round(fastestKm)} 公里` : '—' },
                                    { label: '最佳配速', value: fastest ? formatRunPace(fastest) : '—' },
                                ].map((b) => (
                                    <div key={b.label} className="text-center py-3 rounded-2xl" style={{ background: 'rgba(0,0,0,0.03)' }}>
                                        <div className="text-[16px] font-black text-black tabular-nums leading-none">{b.value}</div>
                                        <div className="text-[11px] font-bold text-black/40 uppercase tracking-wider mt-1.5">{b.label}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="space-y-0">
                                {activeSplits.map((split, i) => {
                                    const partial = isPartial(split);
                                    const isFast = !partial && split.pace === fastest;
                                    const tailKm = Number(split.distanceKm ?? split.distance_km ?? 0);
                                    return (
                                    <div key={i} className="py-3 border-b border-black/5 last:border-0 px-1"
                                         style={partial ? { opacity: 0.62 } : undefined}>
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm font-black text-black w-7 shrink-0">
                                                {partial
                                                    ? <span className="text-[11px] opacity-60">尾段</span>
                                                    : <>{split.km.toFixed(0)}<span className="text-[11px] ml-0.5 opacity-50">K</span></>}
                                            </span>
                                            {/* 配速長條 */}
                                            <div className="flex-1 h-5 rounded-md overflow-hidden" style={{ background: 'rgba(0,0,0,0.04)' }}>
                                                <div
                                                    className="h-full rounded-md flex items-center"
                                                    style={{
                                                        width: `${partial ? 30 : barPct(split.pace)}%`,
                                                        background: partial ? 'rgba(0,0,0,0.18)'
                                                            : isFast ? '#F95C4B' : (split.is_pr || split.is_fastest) ? '#F9A24B' : '#56A5C7',
                                                        transition: 'width 0.5s ease',
                                                    }}
                                                />
                                            </div>
                                            <span className="text-sm font-atomic-age text-black w-14 text-right shrink-0 tabular-nums">{formatRunPace(split.pace)}</span>
                                        </div>
                                        {partial && (
                                            <div className="pl-10 mt-1">
                                                <span className="text-[12px] font-bold tracking-widest text-black/40">
                                                    {tailKm > 0 ? `不足 1 公里（${tailKm.toFixed(2)} km）· 不列入最快段比較` : '不足 1 公里 · 不列入最快段比較'}
                                                </span>
                                            </div>
                                        )}
                                        {!partial && (isFast || split.is_pr) && (
                                            <div className="pl-10 mt-1">
                                                <span className="text-[12px] font-black tracking-widest text-[#F95C4B]">{split.is_pr ? '個人紀錄 PR' : '本場最快'}</span>
                                            </div>
                                        )}
                                    </div>
                                    );
                                })}
                            </div>
                        </div>
                        );
                    })()}

                    {/* ④ 跑姿步態 — 步頻/步幅只對「跑步」有意義；騎腳踏車不顯示。 */}
                    <ChartErrorBoundary>
                    {(() => {
                        const sp = String(sessionData.cardioData?.stats?.sport || sessionData.cardioData?.stats?.sportType || sessionData.cardioData?.type || 'run').toLowerCase();
                        const isRunSport = !/(bike|cycl|ride|腳踏|單車|自行|騎)/.test(sp);
                        return (isRunSport && runFull) ? (
                            <>
                                <SectionHeader
                                    kicker="FORM"
                                    title="跑姿與步態"
                                    desc="步頻＝每分鐘踏幾步，步幅＝每一步跨多遠。步頻偏低通常代表跨步煞車，膝蓋負擔會比較大。"
                                />
                                <TechnicalDetails
                                    streamData={sessionData.cardioData?.stream_data}
                                    avgPace={sessionData.cardioData?.stats?.avgPace || sessionData.cardioData?.stats?.pace_per_km || 300}
                                    stats={sessionData.cardioData?.stats}
                                    cardioData={sessionData.cardioData}
                                />
                            </>
                        ) : null;
                    })()}
                    </ChartErrorBoundary>

                    {/* ⑤ 路線與爬升 —— 【預設顯示】
                        爬升直接影響配速判讀（教練分析也一直引用它），
                        把它藏在「進階圖表」開關後面，使用者會覺得「為什麼只有一個數據有圖表」。 */}
                    <SectionHeader
                        kicker="TERRAIN"
                        title="路線起伏與爬升"
                        desc="爬坡會讓配速自然變慢、心率變高 —— 那是肌力在工作，評估表現時要把它算進去。"
                    />
                    <ChartErrorBoundary>
                    <ElevationChart
                        routeData={sessionData.cardioData?.route}
                        streamElevation={sessionData.cardioData?.stream_data?.elevation}
                        totalGain={sessionData.cardioData?.stats?.elevationGain ?? sessionData.cardioData?.stats?.elevation_gain}
                        totalKm={Number(sessionData.cardioData?.stats?.distance ?? 0)}
                    />
                    </ChartErrorBoundary>

                    {/* ⑥ 生理負荷 —— 💳 完整跑步分析（會員）。過負荷警示與肌群恢復在首頁／恢復頁，永遠免費 */}
                    {runFull && (<>
                    <SectionHeader
                        kicker="LOAD"
                        title="這趟對身體的負荷"
                        desc="依心率待在各區間的時間換算訓練壓力，並推估需要多久恢復。"
                    />
                    <ChartErrorBoundary>
                    <EffortDepthAnalysis
                        deepData={sessionData.deepData}
                        score={sessionData.cardioData?.stats?.score}
                        streamData={sessionData.cardioData?.stream_data}
                        zoneStats={sessionData.cardioData?.stats?.zoneStats}
                        durationSec={Number(sessionData.cardioData?.stats?.duration) || 0}
                    />
                    </ChartErrorBoundary>
                    </>)}

                    {/* ⑦ 專業指標 — 會員的進階圖表，放最後；免費版只放一張會員卡 */}
                    {chartVis.visible('runPhysio') && (
                        <>
                            <SectionHeader
                                kicker="PHYSIOLOGY"
                                title="進階生理指標"
                                desc="同心率跑多快、停下來恢復多快、後半段掉了多少"
                            />
                            <PhysioInsightsGrid data={sessionData.deepData?.physio_metrics || sessionData.deepData} />
                        </>
                    )}

                    {/* 5. 裝備 */}
                    <ShoeTrackerCard />


                </div>
            </div>

            {/* 🏞️ 圖五 分享工作室（FEATURE/APEX/PHYSIO）— 本頁分享鈕 & 最新動態分享都開這個 */}
            {showEvolution && sessionData?.cardioData && createPortal(
                <RunningEvolutionCard
                    cardioData={{ ...sessionData.cardioData, deepData: sessionData.deepData, timestamp: sessionData.timestamp, sessionId }}
                    onExit={() => {
                        setShowEvolution(false);
                        if (location.state?.openCheckIn) navigate(-1);
                    }}
                />,
                document.body
            )}
        </div>
    );
};



// 🟢 資深教練回饋區（瑞士極簡 list）— 用 coachAnalysisEngine 產生多維度完整回饋。
//    每筆：色條 + 類別標籤 + 黑體標題(含關鍵數字) + 判讀/白話/下一步。
const CoachReportSection = ({ cardioData, deepData, full = true }) => {
    const TONE = {
        praise: { c: '#5A7A3A', label: '亮點' },
        warn: { c: '#F95C4B', label: '注意' },
        info: { c: '#3B82F6', label: '數據' },
        coach: { c: '#8B5CF6', label: '教練' },
    };
    let report;
    try {
        report = buildCoachReport({
            stats: cardioData?.stats,
            splits: cardioData?.stats?.splits || cardioData?.splits,
            splitsAnalysis: cardioData?.splits_analysis,
            stream_data: cardioData?.stream_data,
            deepData: deepData || cardioData?.deepData,
        });
    } catch (e) {
        return null;
    }
    if (!report?.insights?.length) return null;
    // 💳 免費版看第一項（最重要的那一張），其餘是完整跑步分析；整頁只在這裡放一張會員卡
    const shown = full ? report.insights : report.insights.slice(0, 1);
    const hiddenCount = report.insights.length - shown.length;
    const SWISS_FONT = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, sans-serif';

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.5 }}
            style={{ borderTop: '1px solid rgba(0,0,0,0.10)', padding: '22px 4px', fontFamily: SWISS_FONT }}
        >
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-black/10">
                <span className="text-[12px] font-black tracking-[0.04em] text-black/55">— 資深教練分析</span>
                <span className="text-[12px] font-black tracking-[0.28em] text-black/35 tabular-nums">{report.insights.length} 項回饋</span>
            </div>
            <div className="divide-y divide-black/10">
                {shown.map((it, idx) => {
                    const t = TONE[it.tone] || TONE.info;
                    return (
                        <div key={it.id || idx} className="py-5 flex items-start gap-4">
                            <div className="w-px self-stretch shrink-0" style={{ background: t.c, minHeight: 56, opacity: 0.85 }} />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1.5">
                                    <span className="text-[11px] font-black uppercase tracking-[0.22em]" style={{ color: t.c }}>{t.label}</span>
                                    {it.metric && <span className="text-[11px] font-black text-black/35 tabular-nums">· {it.metric}</span>}
                                </div>
                                <h4 className="text-[15px] font-black text-black leading-snug mb-1" style={{ letterSpacing: '-0.01em' }}>{it.title}</h4>
                                <p className="text-[12px] text-black/70 font-semibold leading-relaxed mb-1">{it.verdict}</p>
                                {it.why && <p className="text-[12px] text-black/50 leading-relaxed mb-1">{it.why}</p>}
                                {it.action && <p className="text-[12px] font-bold leading-relaxed" style={{ color: t.c }}>{it.action}</p>}
                            </div>
                        </div>
                    );
                })}
            </div>
            {!full && (
                <MemberLockCard feature="runAnalysis" label={hiddenCount > 0 ? `看其餘 ${hiddenCount} 項分析` : '看完整跑步分析'} style={{ marginTop: 12 }} />
            )}
        </motion.div>
    );
};

// 🟢 小成就結算（里程碑摘要）— 放在教練分析(圖三)下方、表現圖(圖四)上方。
//    顯示：本次達成的整數公里里程牌 + 破紀錄數，類似 Strava 的結果摘要。
const MilestoneSummary = ({ cardioData }) => {
    const navigate = useNavigate();
    const navigateToPR = () => navigate('/pr-profile');
    const totalKm = Number(cardioData?.stats?.distance ?? 0);
    // 🥇 v2：地圖不再產每公里 distance markers（改為 PR 獎牌特殊點），
    //    里程牌改由「完成的整數公里」直接推導，不依賴 markers。
    const wholeKm = Array.from({ length: Math.max(0, Math.floor(totalKm)) }, (_, i) => ({ distance: i + 1 }));
    // 🏅 破紀錄數：優先用後端 medal 演算法（真實名次），fallback 用 marker 的 PR 數
    const [medals, setMedals] = useState(null);
    useEffect(() => {
        const sid = cardioData?.sessionId || cardioData?.session_id;
        const uid = cardioData?.userId || getUserId();
        if (!sid || !uid) return;
        let cancelled = false;
        apiClient.get(`/api/cardio/analytics/medals/${uid}/${sid}`)
            .then(r => { if (!cancelled) setMedals(r.data); })
            .catch(() => { });
        return () => { cancelled = true; };
    }, [cardioData?.sessionId, cardioData?.session_id]);
    const localMarkers = cardioData?.deepData?.achievements?.milestone_markers || [];

    // ══════════════════════════════════════════════════════════════════════
    // 🏅 各距離成績列表 —【單一真相源，不再自相矛盾】
    //
    //    使用者回報：「上面寫 10 公里最快 第 3 佳，下面卻寫本場無新紀錄」，
    //    以及「里程碑應該像圖十八那樣明確顯示每一段的 PR 紀錄」。
    //
    //    做法：後端 medals API 有值就用它，沒有就用本機 milestone_markers
    //    （兩者現在都來自同一套 computeDistanceRankings 的欄位語義）。
    //    每個「本次有跑到」的標準距離都列一行，有名次就掛金銀銅，
    //    沒名次也照列（顯示成績，只是沒得牌）—— 使用者看得到全貌。
    // ══════════════════════════════════════════════════════════════════════
    const DIST_MAP = { '1K': 1, '3K': 3, '5K': 5, '10K': 10, 'HALF': 21.0975, 'FULL': 42.195 };
    const DIST_LABEL = { '1K': '1 公里', '3K': '3 公里', '5K': '5 公里', '10K': '10 公里', 'HALF': '半程馬拉松', 'FULL': '全程馬拉松' };
    const fmtPaceMs = (sec) => sec > 0 ? `${Math.floor(sec / 60)}'${String(Math.round(sec % 60)).padStart(2, '0')}"` : '';
    const fmtTime = (sec) => {
        if (!(sec > 0)) return '';
        const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.round(sec % 60);
        return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
    };
    const fmtImprove = (sec) => {
        const v = Math.abs(Math.round(sec || 0));
        if (v <= 0) return '';
        const m = Math.floor(v / 60), s = v % 60;
        return m > 0 ? (s > 0 ? `${m} 分 ${s} 秒` : `${m} 分`) : `${s} 秒`;
    };

    const distanceRows = (() => {
        // 來源 A：後端 medals
        if (Array.isArray(medals?.medals) && medals.medals.length > 0) {
            return medals.medals
                .filter((m) => m.key !== 'LONGEST' && DIST_MAP[m.key])
                .map((m) => {
                    const km = DIST_MAP[m.key];
                    const parts = String(m.detail || '').split(':');
                    const secs = parts.length === 2 ? (Number(parts[0]) * 60 + Number(parts[1])) : 0;
                    return {
                        key: m.key,
                        km,
                        label: DIST_LABEL[m.key] || m.label,
                        rank: m.rank === 'PR' || m.rank === '1st' ? 1 : m.rank === '2nd' ? 2 : m.rank === '3rd' ? 3 : null,
                        sec: secs,
                        paceSec: km > 0 && secs > 0 ? Math.round(secs / km) : 0,
                        improveSec: Number(m.improve_sec ?? m.improveSec ?? 0),
                    };
                })
                .sort((a, b) => a.km - b.km);
        }
        // 來源 B：本機 milestone_markers（calculateMilestoneAchievements 產出）
        return (localMarkers || [])
            .filter((m) => Number(m.distance) > 0)
            .map((m) => ({
                key: `${m.distance}K`,
                km: Number(m.distance),
                label: `${m.distance} 公里`,
                rank: m.rankNum ?? (m.rank === 'PR' ? 1 : m.rank === '2nd' ? 2 : m.rank === '3rd' ? 3 : null),
                sec: Number(m.time || 0),
                paceSec: Number(m.paceSec || 0),
                improveSec: Number(m.improveSec || 0),
            }))
            .sort((a, b) => a.km - b.km);
    })();

    const goldCount = distanceRows.filter((r) => r.rank === 1).length;
    const silverCount = distanceRows.filter((r) => r.rank === 2).length;
    const bronzeCount = distanceRows.filter((r) => r.rank === 3).length;
    const prCount = medals ? (medals.pr_count ?? goldCount) : goldCount;
    const medalCount = goldCount + silverCount + bronzeCount;

    if (totalKm <= 0 && wholeKm.length === 0) return null;
    const SWISS_FONT = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, sans-serif';
    const RANK_STYLE = {
        1: { color: '#C59D5F', bg: 'rgba(197,157,95,0.10)', border: 'rgba(197,157,95,0.24)', text: '個人新紀錄' },
        2: { color: '#8E8E93', bg: 'rgba(142,142,147,0.10)', border: 'rgba(142,142,147,0.22)', text: '歷史第 2 佳' },
        3: { color: '#A9714B', bg: 'rgba(169,113,75,0.10)', border: 'rgba(169,113,75,0.22)', text: '歷史第 3 佳' },
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.45 }}
            style={{ borderTop: '1px solid rgba(0,0,0,0.10)', padding: '20px 4px', fontFamily: SWISS_FONT }}
        >
            <div className="flex items-center justify-between mb-4">
                <span className="text-[12px] font-black tracking-[0.04em] text-black/55">— 里程碑</span>
                <span className="text-[12px] font-black tracking-[0.28em] text-black/35">{totalKm.toFixed(2)} 公里</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="text-center py-3 rounded-2xl" style={{ background: 'rgba(0,0,0,0.03)' }}>
                    <div className="text-[20px] font-black text-black tabular-nums leading-none">{Math.floor(totalKm)}<span className="text-[11px] opacity-40 ml-0.5">KM</span></div>
                    <div className="text-[12px] font-bold text-black/40 tracking-wider mt-1.5">完成距離</div>
                </div>
                <div className="text-center py-3 rounded-2xl" style={{ background: 'rgba(0,0,0,0.03)' }}>
                    <div className="text-[20px] font-black text-black tabular-nums leading-none">{wholeKm.length}<span className="text-[11px] opacity-40 ml-0.5">個</span></div>
                    <div className="text-[12px] font-bold text-black/40 tracking-wider mt-1.5">里程牌</div>
                </div>
                {/* 🏅 獎牌格：金銀銅總計（與下方逐距離列表同一份資料，不會再互相矛盾） */}
                <div className="text-center py-3 rounded-2xl flex flex-col items-center justify-center" style={{ background: medalCount > 0 ? 'rgba(197,157,95,0.1)' : 'rgba(0,0,0,0.03)' }}>
                    {medalCount > 0 ? (
                        <>
                            <div className="flex items-center gap-1 leading-none">
                                <img src={medalSrc(goldCount > 0 ? 'PR' : silverCount > 0 ? '2nd' : '3rd')} alt="medal" style={{ width: 20, height: 20, objectFit: 'contain' }} />
                                <span className="text-[20px] font-black tabular-nums" style={{ color: '#C59D5F' }}>{medalCount}</span>
                            </div>
                            <div className="text-[11px] font-bold tracking-wider mt-1.5" style={{ color: '#C59D5F' }}>
                                {[goldCount && `金${goldCount}`, silverCount && `銀${silverCount}`, bronzeCount && `銅${bronzeCount}`].filter(Boolean).join(' ')}
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="text-[15px] font-black text-black/30 leading-none">—</div>
                            <div className="text-[11px] font-bold text-black/35 tracking-wider mt-1.5">本場無新紀錄</div>
                        </>
                    )}
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════
                🏅 各距離成績逐項列出（圖十八樣式）
                   每個距離單位獨立一行：獎牌 → 距離 → 名次說明 → 成績 → 配速。
                   有破紀錄再多一行「比先前最佳快了 X」，說得出進步幅度。
                ══════════════════════════════════════════════════════════════ */}
            {distanceRows.length > 0 && (
                <div className="flex flex-col gap-1.5 mb-3">
                    {distanceRows.map((r) => {
                        const st = RANK_STYLE[r.rank];
                        return (
                            <div key={r.key} className="px-3 py-2.5 rounded-xl"
                                style={{
                                    background: st ? st.bg : 'rgba(0,0,0,0.03)',
                                    border: `1px solid ${st ? st.border : 'rgba(0,0,0,0.05)'}`,
                                }}>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="flex items-center gap-2 min-w-0">
                                        {st ? (
                                            <img src={medalSrc(r.rank === 1 ? 'PR' : r.rank === 2 ? '2nd' : '3rd')}
                                                 alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} />
                                        ) : (
                                            <span className="inline-block rounded-full shrink-0"
                                                  style={{ width: 8, height: 8, background: 'rgba(22,20,21,0.16)', marginLeft: 5, marginRight: 5 }} />
                                        )}
                                        <span className="text-[12px] font-black truncate" style={{ color: '#161415' }}>{r.label}</span>
                                        {st && (
                                            <span className="text-[11px] font-black shrink-0 px-1.5 py-0.5 rounded"
                                                  style={{ color: st.color, background: 'rgba(255,255,255,0.5)' }}>
                                                {st.text}
                                            </span>
                                        )}
                                    </span>
                                    <span className="flex items-baseline gap-2 shrink-0">
                                        {r.sec > 0 && (
                                            <span className="text-[13px] font-black tabular-nums" style={{ color: st ? st.color : '#161415' }}>
                                                {fmtTime(r.sec)}
                                            </span>
                                        )}
                                        {r.paceSec > 0 && (
                                            <span className="text-[11px] font-bold tabular-nums text-black/40">
                                                {fmtPaceMs(r.paceSec)}/km
                                            </span>
                                        )}
                                    </span>
                                </div>
                                {r.rank === 1 && r.improveSec > 0 && (
                                    <p className="text-[11px] font-bold mt-1.5 pl-[26px]" style={{ color: st.color }}>
                                        比先前最佳快了 {fmtImprove(r.improveSec)}
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
            {/* 里程牌排列（每整數公里一個小圓點） */}
            {wholeKm.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {wholeKm.map((m) => (
                        <span key={m.distance} className="text-[11px] font-black tabular-nums px-2 py-1 rounded-full"
                            style={{ background: 'rgba(0,0,0,0.05)', color: '#161415' }}>
                            {m.distance}K
                        </span>
                    ))}
                </div>
            )}
            {/* 🏆 PR 檔案入口 — 看各距離現任 PR 與歷年變化折線 */}
            <motion.button {...pressProps('row')}
 onClick={() => navigateToPR()}
 className="w-full mt-4 flex items-center justify-between px-4 py-3 rounded-2xl"
 style={{ background: 'rgba(22,20,21,0.04)', border: '1px solid rgba(22,20,21,0.07)' }}
 >
                <span className="flex items-center gap-2">
                    <img src={medalSrc('PR')} alt="PR" style={{ width: 16, height: 16, objectFit: 'contain' }} />
                    <span className="text-[11px] font-black" style={{ color: '#161415' }}>我的 PR 檔案 · 歷年變化</span>
                </span>
                <span className="text-[11px] font-black" style={{ color: 'rgba(22,20,21,0.35)' }}>→</span>
            </motion.button>
        </motion.div>
    );
};

// Reusable Card Component - Cream/Beige for Content
// Reusable Card Component - Modular Variants
const AnalysisCard = ({ title, subtitle, children, variant = 'stone' }) => {
    // Swiss Editorial Card：拿掉 pebble 背景與圓角，純用 borderTop + 留白 + Sans
    const isDark = variant === 'dark';
    const SWISS_FONT = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, sans-serif';

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ type: 'spring', stiffness: 100, damping: 22 }}
            className="relative"
            style={{
                background: isDark ? C.ink : 'transparent',
                padding: isDark ? '28px 24px' : '24px 4px',
                borderRadius: isDark ? '4px' : '0',
                borderTop: isDark ? 'none' : '1px solid rgba(0,0,0,0.10)',
                color: isDark ? C.paper : C.ink,
                fontFamily: SWISS_FONT,
                marginBottom: '8px',
            }}
        >
            <div className="flex items-baseline justify-between mb-5">
                <div className="flex flex-col">
                    {subtitle && (
                        <span
                            className="text-[11px] font-black uppercase tracking-[0.28em] mb-1"
                            style={{ color: isDark ? 'rgba(246,244,241,0.5)' : 'rgba(22,20,21,0.45)' }}
                        >
                            — {subtitle}
                        </span>
                    )}
                    <h2
                        style={{
                            fontSize: '20px',
                            fontWeight: 900,
                            letterSpacing: '-0.025em',
                            textTransform: 'none',
                            fontFamily: SWISS_FONT,
                            color: isDark ? C.paper : C.ink,
                            margin: 0,
                        }}
                    >
                        {title}
                    </h2>
                </div>
            </div>
            {children}
        </motion.div>
    );
};


// Stat Pill Component
const StatPill = ({ value, unit }) => (
    <div className="text-center">
        <div className="font-sans font-bold text-2xl" style={{ color: COLORS.deepBlack }}>
            {value}
        </div>
        {unit && (
            <div className="text-xs font-sans uppercase tracking-wider opacity-60" style={{ color: COLORS.deepBlack }}>
                {unit}
            </div>
        )}
    </div>
);

// Pace Stability Card - Fluid Line
const PaceStabilityCard = ({ splits, avgPace }) => {
    const chartData = splits.map((split) => ({
        x: split.km,
        km: split.km.toFixed(2), // Show actual km with 2 decimal places
        pace: split.pace,
        avg: avgPace
    }));

    return (
        <AnalysisCard title="配速穩定度" subtitle="節奏連續性">
            <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                        <defs>
                            <linearGradient id="paceGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={COLORS.sageGreen} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={COLORS.sageGreen} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <XAxis
                            dataKey="km"
                            tick={{ fontSize: 11, fill: COLORS.mauveGray }}
                            axisLine={{ stroke: COLORS.mauveGray + '30' }}
                            tickLine={false}
                        />
                        <YAxis
                            domain={['dataMin - 10', 'dataMax + 10']}
                            tick={{ fontSize: 11, fill: COLORS.mauveGray }}
                            axisLine={{ stroke: COLORS.mauveGray + '30' }}
                            tickLine={false}
                            tickFormatter={(val) => {
                                const m = Math.floor(val / 60);
                                const s = Math.floor(val % 60);
                                return `${m}:${s.toString().padStart(2, '0')}`;
                            }}
                            width={45}
                        />
                        <Area
                            type="monotone"
                            dataKey="pace"
                            stroke={COLORS.sageGreen}
                            strokeWidth={3}
                            fill="url(#paceGradient)"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
            <p className="text-xs text-center mt-3 font-sans" style={{ color: COLORS.mauveGray }}>
                Smooth lines indicate consistent pacing
            </p>
        </AnalysisCard>
    );
};

// Heart Rate Spectrum Card - Watercolor
// Heart Rate Spectrum Card - Watercolor (Figure 1 Palette)
const HeartRateSpectrumCard = ({ hrAnalysis }) => {
    if (!hrAnalysis || !hrAnalysis.zone_analysis) {
        return null;
    }

    const zones = hrAnalysis.zone_analysis;

    // 🔥 Palette matching Figure 1 & EffortDepth
    const ZONE_COLORS = {
        'recovery': '#799252',  // Green
        'fatBurn': '#FDE67A',   // Yellow
        'aerobic': '#F88600',   // Orange
        'anaerobic': '#E07000', // Darker Orange
        'extreme': '#5D4037'    // Brown/Dark
    };

    // Helper to normalize keys
    const normalizeKey = (k) => {
        const lower = k.toLowerCase();
        if (lower.includes('1') || lower.includes('recovery') || lower.includes('warm')) return 'recovery';
        if (lower.includes('2') || lower.includes('fat')) return 'fatBurn';
        if (lower.includes('3') || lower.includes('aerobic')) return 'aerobic';
        if (lower.includes('4') || lower.includes('anaerobic')) return 'anaerobic';
        if (lower.includes('5') || lower.includes('extreme')) return 'extreme';
        return 'recovery';
    };

    const ZONE_LABELS = {
        'recovery': 'Recovery',
        'fatBurn': 'Fat Burn',
        'aerobic': 'Aerobic',
        'anaerobic': 'Anaerobic',
        'extreme': 'Extreme'
    };

    // Sort order
    const ORDER = ['recovery', 'fatBurn', 'aerobic', 'anaerobic', 'extreme'];

    return (
        <AnalysisCard title="心率效率" subtitle="能量分佈">
            {/* Spectrum Bar */}
            <div className="h-4 rounded-full overflow-hidden flex mb-4 bg-[#E6D4B8]/30">
                {Object.entries(zones).map(([zone, data]) => {
                    const normalized = normalizeKey(zone);
                    if (!data.percentage) return null;
                    return (
                        <div
                            key={zone}
                            style={{
                                width: `${data.percentage}%`,
                                backgroundColor: ZONE_COLORS[normalized],
                                opacity: 0.9
                            }}
                        />
                    );
                })}
            </div>

            {/* Zone Breakdown */}
            <div className="space-y-2">
                {ORDER.map(key => {
                    // Find matching data in zones (fuzzy match)
                    const entry = Object.entries(zones).find(([z]) => normalizeKey(z) === key);
                    if (!entry) return null;
                    const [originalKey, data] = entry;
                    if (data.percentage <= 0) return null;

                    return (
                        <div key={key} className="flex justify-between items-center text-xs font-sans">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ZONE_COLORS[key] }} />
                                <span style={{ color: COLORS.mauveGray }}>{ZONE_LABELS[key]}</span>
                            </div>
                            <span style={{ color: '#2C3E50' }} className="font-bold">
                                {data.percentage.toFixed(1)}%
                            </span>
                        </div>
                    );
                })}
            </div>
        </AnalysisCard>
    );
};

// Recovery Card - Moon Phase
const RecoveryCard = ({ distance, intensity }) => {
    // Calculate recovery hours based on distance and intensity
    const recoveryHours = Math.min(48, Math.max(12, distance * 3));
    const moonPhase = Math.min(100, (recoveryHours / 48) * 100);

    return (
        <AnalysisCard title="恢復建議" subtitle="身體電量">
            <div className="flex items-center gap-6">
                {/* Moon Icon */}
                <div className="relative w-24 h-24 flex items-center justify-center">
                    <div
                        className="w-20 h-20 rounded-full"
                        style={{
                            background: `linear-gradient(90deg, ${COLORS.slateBlue} ${100 - moonPhase}%, transparent ${100 - moonPhase}%)`,
                            border: `2px solid ${COLORS.slateBlue}`
                        }}
                    >
                        <Moon size={40} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ color: COLORS.slateBlue }} />
                    </div>
                </div>

                {/* Recovery Info */}
                <div className="flex-1">
                    <p className="text-2xl font-serif-elegant mb-1" style={{ color: COLORS.slateBlue }}>
                        {recoveryHours}h
                    </p>
                    <p className="text-sm font-sans" style={{ color: COLORS.mauveGray }}>
                        Recommended rest before next intense session
                    </p>
                </div>
            </div>
        </AnalysisCard>
    );
};










// 1. Report Header Card (Orange - Plan Vibe)
const ReportHeaderCard = ({ stats, title, timestamp }) => {
    const dist = Number(stats?.distance || stats?.distance_km || 0);
    const time = Number(stats?.duration || stats?.duration_seconds || 0);
    let paceRaw = Number(stats?.avgPace || stats?.pace || stats?.pace_per_km || 0);

    if (paceRaw === 0 && dist > 0.001 && time > 0) {
        paceRaw = time / dist;
    }

    // 🚴 自行車：主指標改「平均速度 km/h」，而不是跑步的配速。
    const sportStr = String(stats?.sport || stats?.sportType || stats?.type || 'run').toLowerCase();
    const isBike = /(bike|cycl|ride|腳踏|單車|自行|騎)/.test(sportStr);
    const speedKmh = time > 0 ? (dist / (time / 3600)) : 0;

    const formattedDate = new Date(timestamp || new Date()).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

    // 🔥 Calculate Dominant Zone for Dynamic Background
    const getDominantZoneColor = () => {
        const zoneStats = stats?.zoneStats || {};
        // Find zone with max duration
        let maxZone = '1';
        let maxVal = -1;

        Object.entries(zoneStats).forEach(([key, val]) => {
            if (Number(val) > maxVal) {
                maxVal = Number(val);
                maxZone = key;
            }
        });

        // Map to standard keys if needed (handling backend variations)
        const map = {
            '1': '#799252', 'warmup': '#799252', 'recovery': '#799252',     // Green
            '2': '#FDE67A', 'fatburn': '#FDE67A',                           // Yellow
            '3': '#F88600', 'aerobic': '#F88600',                           // Orange
            '4': '#F88600', 'anaerobic': '#F88600',                         // Orange
            '5': '#F88600', 'extreme': '#F88600'                            // Orange
        };

        // Fuzzy match or default to Green
        return map[maxZone] || map[String(Object.keys(map).find(k => maxZone.toLowerCase().includes(k)))] || '#799252';
    };

    const subTextColor = 'rgba(255, 255, 255, 0.7)'; // White with opacity
    const statsColor = C.white;

    const SWISS_FONT = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, sans-serif';
    const calories = Math.round(stats?.calories || 0);
    const metrics = [
        { id: 'dist', label: 'Distance', unit: 'km', value: dist > 0 ? dist.toFixed(2) : '—', active: dist > 0, accent: true },
        { id: 'dur', label: 'Duration', unit: '', value: time >= 1 ? formatRunTime(time) : '—', active: time >= 1 },
        isBike
            ? { id: 'pace', label: 'Avg Speed', unit: 'km/h', value: speedKmh > 0 ? speedKmh.toFixed(1) : '—', active: speedKmh > 0 }
            : { id: 'pace', label: 'Avg Pace', unit: '/km', value: paceRaw > 0 ? formatRunPace(paceRaw) : '—', active: paceRaw > 0 },
        { id: 'cal', label: 'Calories', unit: 'kcal', value: calories >= 1 ? calories : '—', active: calories >= 1 },
    ];

    return (
        <motion.div
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07 } } }}
            className="relative"
            style={{ padding: '4px 0 8px 0', fontFamily: SWISS_FONT }}
        >
            {/* Issue line */}
            <motion.div
                variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
                className="flex items-center justify-between mb-4"
            >
                <span className="text-[11px] font-black uppercase tracking-[0.32em] text-black/45">— Deep Analysis</span>
                <span className="text-[11px] font-black uppercase tracking-[0.32em] text-black/45 tabular-nums">{formattedDate}</span>
            </motion.div>

            {/* 大標 — Swiss display */}
            <motion.h2
                variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 110, damping: 22 } } }}
                style={{
                    fontSize: 'clamp(2.2rem, 8.5vw, 3rem)',
                    fontWeight: 900,
                    lineHeight: '0.95',
                    letterSpacing: '-0.045em',
                    textTransform: 'uppercase',
                    color: C.ink,
                    margin: '0 0 18px 0',
                }}
            >
                {title || "Run Analysis"}
            </motion.h2>

            {/* 2x2 Swiss editorial grid with cross dividers */}
            <div className="grid grid-cols-2 mt-2" style={{ borderTop: '1px solid rgba(0,0,0,0.10)' }}>
                {metrics.map((m, i) => (
                    <motion.div
                        key={m.id}
                        variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 110, damping: 22 } } }}
                        className="flex flex-col justify-between py-5"
                        style={{
                            opacity: m.active ? 1 : 0.42,
                            borderLeft: i % 2 === 1 ? '1px solid rgba(0,0,0,0.10)' : 'none',
                            borderBottom: i < 2 ? '1px solid rgba(0,0,0,0.10)' : 'none',
                            paddingLeft: i % 2 === 1 ? '18px' : '4px',
                            paddingRight: i % 2 === 0 ? '12px' : '4px',
                        }}
                    >
                        <span className="text-[11px] font-black uppercase tracking-[0.22em] text-black/55 mb-3">
                            {m.label}
                        </span>
                        <div className="flex items-baseline gap-1.5">
                            <span
                                className="font-black leading-none tabular-nums share-tech-mono"
                                style={{
                                    fontSize: '32px',
                                    letterSpacing: '-0.02em',
                                    color: m.active && m.accent ? C.coral : C.ink,
                                }}
                            >
                                {m.value}
                            </span>
                            {m.unit && (
                                <span className="text-[11px] font-bold uppercase tracking-widest text-black/40">{m.unit}</span>
                            )}
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* 隱藏的舊內容（保留以免破壞 layout 流），用 inline display:none 收起 */}
            <div style={{ display: 'none' }}>
                <div>
                    <h2 style={{ color: C.white }}>
                        {title || "Run Analysis"}
                    </h2>
                    <p style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                        {formattedDate}
                    </p>
                </div>
                <div>
                    <Activity size={20} color={C.white} />
                </div>
                <div>
                    <p style={{ color: subTextColor }}>距離</p>
                    <div>
                        <span style={{ color: statsColor }}>{dist.toFixed(2)}</span>
                        <span style={{ color: subTextColor }}>KM</span>
                    </div>
                </div>
                <div>
                    <p style={{ color: subTextColor }}>時長</p>
                    <div>
                        <span style={{ color: statsColor }}>{formatRunTime(time)}</span>
                    </div>
                </div>
                <div>
                    <div>
                        <p style={{ color: subTextColor }}>平均配速</p>
                        <span style={{ color: statsColor }}>{formatRunPace(paceRaw)}</span>
                        <span style={{ color: subTextColor }}>/KM</span>
                    </div>
                    <div>
                        <p style={{ color: subTextColor }}>CALORIES</p>
                        <span style={{ color: statsColor }}>{Math.round(stats?.calories || 0)}</span>
                        <span style={{ color: subTextColor }}>KCAL</span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};



// 2. 配速圖表 (Pace Chart)
const PaceChart = ({ data, avgPace, streamData, duration }) => {
    // 🔥 Try to use stream_data for real pace over time
    let chartData = [];

    if (streamData?.timestamps?.length > 1 && streamData?.pace?.length > 1) {
        // Use real stream data
        const startTime = streamData.timestamps[0];
        const step = Math.ceil(streamData.timestamps.length / 20); // Downsample to ~20 points

        for (let i = 0; i < streamData.timestamps.length; i += step) {
            chartData.push({
                time: (streamData.timestamps[i] - startTime) / 1000, // seconds
                pace: streamData.pace[i] || avgPace || 300
            });
        }
    } else if (data && data.length > 0) {
        // Use splits data - convert km to estimated time
        const targetPace = avgPace || 300;
        chartData = data.map((d, i) => ({
            time: (d.km || i * 0.1) * targetPace,
            pace: d.pace || targetPace
        }));
    }
    // ⚠️ 無真實 stream / splits 數據時不再用亂數模擬，改顯示空狀態。

    const hasData = chartData.length > 0;

    // Helper to format time as MM:SS
    const formatTime = (seconds) => {
        if (!seconds && seconds !== 0) return "00:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    if (!hasData) {
        return (
            <AnalysisCard title="配速策略" subtitle="配速連續性 (MIN/KM)">
                <div className="h-48 w-full mt-2 flex flex-col items-center justify-center gap-1">
                    <span className="text-3xl font-serif-elegant text-black/20">—</span>
                    <span className="text-[12px] tracking-wider text-black/30">無配速串流數據</span>
                </div>
            </AnalysisCard>
        );
    }

    return (
        <AnalysisCard title="配速策略" subtitle="配速連續性 (MIN/KM)">
            <div className="h-48 w-full mt-2">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#000" opacity={0.05} vertical={false} />
                        <XAxis
                            dataKey="time"
                            tick={{ fontSize: 11, fill: '#000', opacity: 0.3, fontWeight: 700 }}
                            tickFormatter={(val) => formatTime(val)}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis
                            reversed
                            domain={['auto', 'auto']}
                            tick={{ fontSize: 11, fill: '#000', opacity: 0.3, fontWeight: 700 }}
                            axisLine={false}
                            tickLine={false}
                            /* 🩹 2026-08 稽核：同一頁的「Avg Pace」用 5'14" 格式，
                               這張圖卻用 5.23（小數分鐘），使用者得自己換算兩種格式
                               代表同一件事。統一走 formatRunPace()。 */
                            tickFormatter={(v) => formatRunPace(v)}
                            width={38}
                        />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#FFF', border: '1px solid #EEE', borderRadius: '8px' }}
                            labelStyle={{ color: '#888' }}
                            formatter={(value) => [`${formatRunPace(value)}/km`, '配速']}
                        />
                        <Line
                            type="monotone"
                            dataKey="pace"
                            stroke={COLORS.ember}
                            strokeWidth={3}
                            dot={false}
                            activeDot={{ r: 4, fill: COLORS.ember }}
                            isAnimationActive={false}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </AnalysisCard>
    );
};

// 3. 海拔圖表 (Elevation Chart)
// ⚠️ 真實數據原則：只用 route_data 內真實 ele 值，無真實海拔時顯示空狀態。
const ElevationChart = ({ routeData, streamElevation, totalGain, totalKm = 0 }) => {
    // 🔴 Fix(爬升沒資料)：海拔真正來源是 stream_data.elevation（route 點只有 lat/lng 無 .ele）。
    //    優先用串流海拔；退回 route 的 .ele；都沒有才算真的無資料。
    let raw = [];
    const se = (streamElevation || []).filter((v) => Number.isFinite(v));
    if (se.length > 0) {
        raw = se.map((ele) => Number(ele));
    } else {
        raw = (routeData || []).map((d) => Number(d?.ele ?? d?.elevation)).filter((v) => Number.isFinite(v));
    }
    // 🗜 v2 降採樣：海拔串流每秒一點，一小時的跑會有 3600 點 — 全部畫出來
    //    只會得到毛刺很多、讀不出趨勢的曲線。改為分桶保峰降採樣：
    //    每桶保留「最高點與最低點」（維持原順序），總點數壓到 ~160，
    //    山峰山谷不會被平均掉，曲線乾淨可讀。
    const TARGET_BUCKETS = 80;
    let sampled = raw;
    if (raw.length > TARGET_BUCKETS * 2) {
        const bucketSize = Math.ceil(raw.length / TARGET_BUCKETS);
        sampled = [];
        for (let b = 0; b < raw.length; b += bucketSize) {
            const bucket = raw.slice(b, b + bucketSize);
            let minI = 0, maxI = 0;
            bucket.forEach((v, i) => { if (v < bucket[minI]) minI = i; if (v > bucket[maxI]) maxI = i; });
            const picks = [...new Set([Math.min(minI, maxI), Math.max(minI, maxI)])];
            picks.forEach((i) => sampled.push({ v: bucket[i], origIdx: b + i }));
        }
    } else {
        sampled = raw.map((v, i) => ({ v, origIdx: i }));
    }
    const N = raw.length;
    const chartData = sampled.map((p) => ({
        index: p.origIdx,
        km: totalKm > 0 && N > 1 ? Number(((p.origIdx / (N - 1)) * totalKm).toFixed(1)) : p.origIdx,
        ele: p.v,
    }));
    const hasData = chartData.length > 1;

    const eles = chartData.map(d => d.ele);
    const minEle = hasData ? Math.min(...eles) : 0;
    const maxEle = hasData ? Math.max(...eles) : 0;
    // 累積爬升：優先用回報的 totalGain，否則由串流算正向增量
    let gain = Number(totalGain) || 0;
    if (!gain && hasData) {
        let prev = null;
        for (const v of eles) { if (prev != null && v - prev > 0.5) gain += (v - prev); prev = v; }
        gain = Math.round(gain);
    }

    if (!hasData) {
        // 🟢 沒資料就不硬畫圖，明確告知使用者原因
        return (
            <AnalysisCard title="坡度肌力" subtitle="垂直爬升剖面">
                <div className="h-28 w-full mt-2 flex flex-col items-center justify-center gap-2 rounded-2xl" style={{ background: 'rgba(0,0,0,0.03)' }}>
                    <span className="text-[12px] font-bold text-black/45">尚未取得海拔數據</span>
                    <span className="text-[11px] text-black/35 leading-relaxed text-center px-6">此路線 GPS 未回傳高度，或為室內/跑步機。戶外開啟精確定位後即可記錄爬升。</span>
                </div>
            </AnalysisCard>
        );
    }

    return (
        <AnalysisCard title="坡度肌力" subtitle="垂直爬升剖面">
            <div className="h-32 w-full mt-2">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 6, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorEle" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={COLORS.coral} stopOpacity={0.2} />
                                <stop offset="95%" stopColor={COLORS.coral} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <XAxis
                            dataKey="km"
                            type="number"
                            domain={['dataMin', 'dataMax']}
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 11, fill: '#000', opacity: 0.25, fontWeight: 700 }}
                            interval="preserveStartEnd"
                            height={20}
                            tickFormatter={(v) => `${v}K`}
                        />
                        <YAxis
                            domain={[minEle - 5, maxEle + 5]}
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 11, fill: '#000', opacity: 0.25, fontWeight: 700 }}
                            width={30}
                            tickFormatter={(v) => Math.round(v)}
                        />
                        <Area
                            type="monotone"
                            dataKey="ele"
                            stroke={COLORS.coral}
                            fillOpacity={1}
                            fill="url(#colorEle)"
                            strokeWidth={3}
                            connectNulls
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
            <div className="flex justify-between items-end mt-4">
                <div>
                    <p className="text-2xl font-serif-elegant text-black/80">+{gain}<span className="text-sm">m</span></p>
                    <p className="note-label text-black/30 !mb-0 font-bold">總爬升</p>
                </div>
                <p className="text-[11px] text-black/30 font-bold">已降採樣至 {chartData.length} 點</p>
            </div>
            {/* 🎓 教練判讀 */}
            <p className="text-[11px] text-black/55 leading-relaxed mt-3 pt-3 border-t border-black/5">
                {chartCoachNote('elevation', { stats: { elevationGain: gain } })}
                {gain > 0 && totalKm > 0 ? `　平均每公里爬 ${Math.round(gain / totalKm)} 公尺${gain / totalKm > 15 ? '，屬於丘陵路線 — 配速慢一點是正常的，這種課同時練到臀腿肌力。' : '，起伏溫和，對配速影響有限。'}` : ''}
            </p>
        </AnalysisCard>
    );
};

// 4. 技術詳情 (Technical Details - Cadence & Stride)
// ⚠️ 真實數據原則：
//    ① 有真實步頻串流 (stream_data.cadence，來自 DeviceMotion / 手錶) → 直接使用，stride = speed/cadence。
//    ② 否則退回從 stream_data.pace 反推估算。
//    ③ 兩者皆無 → N/A，不用亂數模擬填充。
const TechnicalDetails = ({ streamData, avgPace = 300, stats = {}, cardioData = {} }) => {
    const totalKm = Number(stats?.distance ?? stats?.distance_km ?? 0);
    const buildChartData = () => {
        const N = 24;
        const safePace = avgPace > 0 ? avgPace : 300;

        // ══════════════════════════════════════════════════════════════
        // ① 真實步頻串流 —【保留時間軸完整性】
        //
        //    ⚠️ 舊版先 filter 掉 0（沒量到的秒），再用「陣列索引」換算公里位置。
        //    感測器中途斷掉時，被濾掉的那一段直接消失，剩下的點被硬擠到
        //    整條 X 軸上 → 就是使用者截圖裡「前面一條平線、6K 後突然斷崖」
        //    那種不可能的形狀（步頻不會瞬間掉 30 spm 還維持不變）。
        //
        //    新版：走完整陣列，沒量到的秒填 null 當「資料缺口」，
        //    公里位置永遠依真實索引比例換算，圖形不再被壓縮變形。
        // ══════════════════════════════════════════════════════════════
        const cadRaw = Array.isArray(streamData?.cadence) ? streamData.cadence : [];
        const paceForStride = streamData?.pace || [];
        const cadValid = cadRaw.filter((c) => Number.isFinite(c) && c > 0);

        if (cadValid.length >= 5) {
            const total = cadRaw.length;
            const step = Math.max(1, Math.floor(total / N));
            const out = [];
            for (let i = 0; i < total && out.length < N; i += step) {
                const rawCad = Number(cadRaw[i]);
                const has = Number.isFinite(rawCad) && rawCad > 0;
                const cad = has ? Math.max(120, Math.min(220, Math.round(rawCad))) : null;
                const p = Number.isFinite(paceForStride[i]) && paceForStride[i] > 0 ? paceForStride[i] : safePace;
                const speed = (1000 / p) * 60; // m/min
                const stride = cad ? parseFloat((speed / cad).toFixed(2)) : null;
                // 公里位置依「在整條串流中的真實位置」換算，不受缺口影響
                const km = totalKm > 0 ? Number(((i / Math.max(1, total - 1)) * totalKm).toFixed(1)) : out.length;
                out.push({ index: out.length, km, cadence: cad, stride });
            }
            return out;
        }

        // ══════════════════════════════════════════════════════════════
        // ② 沒有真實步頻 → 不再用 pace 反推假造一條曲線。
        //
        //    舊版拿 `baseCadence = 175` 乘上速度比例生出「步頻」，
        //    那不是量測、是猜的 —— 而且下游的步幅（speed ÷ cadence）
        //    也會跟著變成假數據，使用者根本無從判斷哪個能信。
        //    依 DRVN 誠實數據鐵律：沒量到就說沒量到，並給取得方式。
        // ══════════════════════════════════════════════════════════════
        return null;
    };

    const chartData = buildChartData();
    const hasData = Array.isArray(chartData) && chartData.length > 0;
    // 🟢 真實步頻/步幅判定：只有「真的有感測資料」才顯示圖，避免用 pace 反推的假數據誤導。
    // 🩹 v2 誠實檢查：整條串流都是同一個值（如全程 165）代表感測器沒有持續更新，
    //    這種「假的平線」不畫圖也不判讀，直接告訴使用者原因。
    const cadValidArr = (streamData?.cadence || []).filter((c) => Number.isFinite(c) && c > 0);
    const cadIsFlat = cadValidArr.length > 10 && new Set(cadValidArr.map((c) => Math.round(c))).size <= 1;
    const hasRealCadence = cadValidArr.length >= 5 && !cadIsFlat;
    const hasRealStride = (streamData?.stride || []).filter((s) => Number.isFinite(s) && s > 0).length >= 5
        || (Number(stats?.avgStride) > 0);
    // 平均值只用「真的有量到」的點算，null 缺口不參與平均（否則會被稀釋）
    const cadPoints = hasData ? chartData.filter((d) => Number.isFinite(d.cadence) && d.cadence > 0) : [];
    const stridePoints = hasData ? chartData.filter((d) => Number.isFinite(d.stride) && d.stride > 0) : [];
    const avgCadence = cadPoints.length
        ? Math.round(cadPoints.reduce((s, d) => s + d.cadence, 0) / cadPoints.length)
        : null;
    const avgStride = stridePoints.length
        ? (stridePoints.reduce((s, d) => s + d.stride, 0) / stridePoints.length).toFixed(2)
        : null;
    // 📉 資料完整度 — 缺口比例太高要告訴使用者，不能讓半截資料看起來像全程量測
    const cadCoverage = hasData ? cadPoints.length / chartData.length : 0;

    // Liquid Glass 材質（iOS 26）— 暖灰色調融入整頁
    const glassStyle = {
        background: 'linear-gradient(135deg, rgba(255,255,255,0.62) 0%, rgba(244,240,233,0.50) 100%)',
        backdropFilter: 'blur(22px) saturate(160%)',
        WebkitBackdropFilter: 'blur(22px) saturate(160%)',
        border: '1px solid rgba(255,255,255,0.7)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.9) inset, 0 12px 40px -16px rgba(22,20,21,0.22), 0 2px 6px -4px rgba(22,20,21,0.18)'
    };

    // 🟢 步頻、步幅各自獨立成「整張大圖」(不再 2 個小方塊)，中文 + 教練短評。
    const xTick = { fontSize: 11, fill: COLORS.mauveGray, fontWeight: 700 };
    const fmtKm = (v) => `${v}K`;
    const noteCadence = chartCoachNote('cadence', cardioData);
    const noteStride = chartCoachNote('stride', cardioData);

    return (
        <div className="space-y-4 mb-6">
            {/* 步頻大圖 */}
            <div className="rounded-[28px] p-5" style={glassStyle}>
                <div className="flex items-baseline justify-between mb-3">
                    <p className="text-[12px] text-[#161415] font-black tracking-[0.04em] opacity-60">步頻 · CADENCE</p>
                    <div className="text-right">
                        <span className="text-2xl font-serif-elegant text-[#2C3E50]">{hasRealCadence ? avgCadence : 'N/A'}</span>
                        {hasRealCadence && <span className="text-[11px] text-[#BDA0A0] ml-1">spm</span>}
                    </div>
                </div>
                {hasRealCadence ? (
                    <div className="h-40 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 8, right: 6, left: 0, bottom: 4 }}>
                                <defs>
                                    <linearGradient id="colorCad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={COLORS.sageGreen} stopOpacity={0.45} />
                                        <stop offset="95%" stopColor={COLORS.sageGreen} stopOpacity={0.02} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#000" opacity={0.05} vertical={false} />
                                <XAxis dataKey="km" type="number" domain={['dataMin', 'dataMax']} axisLine={false} tickLine={false} tick={xTick} tickFormatter={fmtKm} height={18} />
                                <YAxis domain={[140, 210]} axisLine={false} tickLine={false} tick={xTick} width={30} tickCount={4} />
                                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #EEE', fontSize: 12 }} labelFormatter={(v) => `第 ${v} 公里`} formatter={(val) => [`${Math.round(val)} spm`, '步頻']} />
                                <Area type="monotone" dataKey="cadence" stroke={COLORS.sageGreen} fill="url(#colorCad)" strokeWidth={2.5} connectNulls dot={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <EmptyChart
                        unit="spm"
                        message={cadIsFlat ? '步頻感測未持續更新' : '尚未取得步頻數據'}
                    />
                )}
                {cadIsFlat && (
                    <p className="text-[11px] text-black/55 leading-relaxed mt-3 pt-3 border-t border-black/5">
                        整段回報都是同一個數值（{Math.round(cadValidArr[0])} spm）— 這代表感測來源沒有真的逐秒量測，本次不做步頻判讀。配戴 Apple Watch 或允許動作感測後可取得真實步頻曲線。
                    </p>
                )}
                {/* 📉 資料完整度誠實標示 — 半截量測不能看起來像全程量測 */}
                {hasRealCadence && cadCoverage < 0.8 && (
                    <p className="text-[11px] text-black/40 leading-relaxed mt-2 font-bold">
                        本次僅約 {Math.round(cadCoverage * 100)}% 的時間量到步頻（其餘為感測缺口，圖上以斷點呈現），平均值僅供參考。
                    </p>
                )}
                {hasRealCadence && <p className="text-[11px] text-black/55 leading-relaxed mt-3 pt-3 border-t border-black/5">{noteCadence}</p>}
                {!hasRealCadence && !cadIsFlat && (
                    <p className="text-[11px] text-black/55 leading-relaxed mt-3 pt-3 border-t border-black/5">
                        這一趟沒有量到步頻。步頻需要手機動作感測或 Apple Watch 才能逐秒記錄 —— 我們不用配速去反推一個猜出來的數字給你看。
                        下次把手機放在口袋、或戴上手錶，這裡就會長出真實的步頻曲線。
                    </p>
                )}
            </div>

            {/* 步幅大圖 */}
            <div className="rounded-[28px] p-5" style={glassStyle}>
                <div className="flex items-baseline justify-between mb-3">
                    <p className="text-[12px] text-[#161415] font-black tracking-[0.04em] opacity-60">步幅 · STRIDE</p>
                    <div className="text-right">
                        <span className="text-2xl font-serif-elegant text-[#2C3E50]">{hasRealStride ? avgStride : 'N/A'}</span>
                        {hasRealStride && <span className="text-[11px] text-[#BDA0A0] ml-1">m</span>}
                    </div>
                </div>
                {hasRealStride ? (
                    <div className="h-40 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 8, right: 6, left: 0, bottom: 4 }}>
                                <defs>
                                    <linearGradient id="colorStr" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={COLORS.slateBlue} stopOpacity={0.45} />
                                        <stop offset="95%" stopColor={COLORS.slateBlue} stopOpacity={0.02} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#000" opacity={0.05} vertical={false} />
                                <XAxis dataKey="km" type="number" domain={['dataMin', 'dataMax']} axisLine={false} tickLine={false} tick={xTick} tickFormatter={fmtKm} height={18} />
                                <YAxis domain={[0.6, 1.8]} axisLine={false} tickLine={false} tick={xTick} width={30} tickCount={4} tickFormatter={(v) => v.toFixed(1)} />
                                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #EEE', fontSize: 12 }} labelFormatter={(v) => `第 ${v} 公里`} formatter={(val) => [`${Number(val).toFixed(2)} m`, '步幅']} />
                                <Area type="monotone" dataKey="stride" stroke={COLORS.slateBlue} fill="url(#colorStr)" strokeWidth={2.5} connectNulls dot={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                ) : <EmptyChart unit="m" message="尚未取得步幅數據" />}
                {hasRealStride && <p className="text-[11px] text-black/55 leading-relaxed mt-3 pt-3 border-t border-black/5">{noteStride}</p>}
                {!hasRealStride && (
                    <p className="text-[11px] text-black/55 leading-relaxed mt-3 pt-3 border-t border-black/5">
                        步幅＝速度 ÷ 步頻，所以沒有真實步頻就算不出真實步幅。先把步頻量到，這一格自然會有數字。
                    </p>
                )}
            </div>
        </div>
    );
};

export default RunningAnalysisMobile;
