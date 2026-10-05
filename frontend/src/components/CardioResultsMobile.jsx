
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { mapThemeClass } from '../utils/mapTiles';
import DrvnTileLayer from './DrvnTileLayer';
import RouteSnapshotMap from './RouteSnapshotMap';
import { canSnapshotRoute } from '../utils/routeSnapshot';
import MapAutoResize from './MapAutoResize';
import { getDisplayName } from '../utils/socialIdentity';
import { pressProps } from '../utils/nutritionMotion';
import { createPortal } from 'react-dom';
import { useMap } from 'react-leaflet';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Share2, X, Camera, Clock, BookmarkPlus,
    Flame, Zap, Activity, Info, ChevronRight,
    MapPin, Calendar, Heart, ChevronDown, ChevronUp, BookOpen, BarChart2, TrendingUp, ArrowLeft, ArrowRight
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MapContainer, Polyline, Marker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
// html2canvas import removed — unused dead code (bundle-dynamic-imports)
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, CartesianGrid, Tooltip, ComposedChart, Area, Legend } from 'recharts';
import apiClient, { getCardioRuns } from '../api/client';
import { computePersonalRecords, detectNewRecords, formatPaceSec, formatDurationSec, computeDistanceRankings, buildPRTimeline, STANDARD_DISTANCES } from '../utils/personalRecords';
import { buildCoachReport, chartCoachNote, buildRunIntelligence } from '../utils/coachAnalysisEngine';
import { medalSrc } from '../utils/sportIcons';
import ChartErrorBoundary from './ChartErrorBoundary';
import { buildNextStepGoal, buildPlanNextStep, isGoalAchieved } from '../utils/nextStepGoal';
import { getReminderSettings, saveReminderSettings, requestNotificationPermission } from '../utils/workoutReminders';
import { computeNextRunDate, buildScheduleOptions, formatScheduleLabel, toHHMM } from '../utils/scheduleTime';

import HoldToCancelRecord from './HoldToCancelRecord';
import SharePreviewModal from './SharePreviewModal';
import RunningEvolutionCard from './RunningEvolutionCard'; // 🚩 新增跑步雜誌分享組件
import { useRecovery } from '../contexts/RecoveryContext';
import { getUserId } from '../utils/auth';
import { brandColors as C } from '../utils/colors';
import { useMembership } from '../utils/membership';
import MemberLockCard from './MemberLockCard';
import { toast } from '../utils/toast';
import { recordAction } from '../utils/momentEngine';
import { notifyRunSaved } from '../utils/drvnNotifications';
import { formatPace as fmtPace } from '../utils/format';


// --- Assets & Styles ---
// Fix Leaflet icons
// Fix Leaflet icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// 🔥 Resize Map Component for Leaflet inside Grid/Flex
const ResizeMap = () => {
    const map = useMap();
    useEffect(() => {
        const timer = setTimeout(() => {
            map.invalidateSize();
        }, 500); // 500ms delay to ensure container is stable
        return () => clearTimeout(timer);
    }, [map]);
    return null;
};

const PALETTE = {
    paper: C.paper,
    deepBlack: C.ink,
    stone: C.paper2,
    pebble: C.sand,
    coral: C.coral,
    ember: C.coralDeep,
    white: C.white,
    textPrimary: C.ink,
    textSecondary: 'rgba(22, 20, 21, 0.6)'
};

// Typography constants suitable for style injection if needed, 
// though we usually use inline styles or Tailwind classes.
// Header Font: "Poiret One", cursive
// Body Font: system-ui, sans-serif

// --- Effort Depth Card (Ported from RunningAnalysis) ---
// Effort Depth Card (Used in Results Page)
const EffortDepthCard = ({ score, duration, zoneData, deepData, streamData, zoneStats, hasMeaningfulData = true, maxHR = null }) => {
    // 🟢 點擊卡片 → 開啟專業 zone 解說彈窗（瑞士極簡 + 微玻璃）
    const [showZoneInfo, setShowZoneInfo] = useState(false);
    // 🫀 心率區間門檻：若有 maxHR（依使用者年齡 208−0.7×age 算出）就個人化，
    //    否則回退到原本的固定門檻（130/150/170/190），對沒填年齡的使用者無行為變化。
    const ZONE_BOUNDS = (maxHR && maxHR > 120)
        ? {
            recovery: Math.round(maxHR * 0.60),   // < 60%
            fatBurn: Math.round(maxHR * 0.70),    // 60–70%
            aerobic: Math.round(maxHR * 0.80),    // 70–80%
            anaerobic: Math.round(maxHR * 0.90),  // 80–90%（以上為 extreme）
        }
        : { recovery: 130, fatBurn: 150, aerobic: 170, anaerobic: 190 };
    const deepMetrics = deepData?.deep_metrics || {};
    // 🔥 Improved extraction for robustness
    const sourceData = deepData?.zone_distribution || deepMetrics.zone_distribution || zoneData || zoneStats || {};
    const finalScore = score || deepData?.physio_metrics?.physio_load || deepMetrics.physio_load || 0;

    // 1. Data Mapping & Normalization — 極度寬容的 Key 匹配
    const normalizeZone = (key) => {
        if (!key) return null;
        // 強制轉小寫並去掉空格與橫線，確保 "WARM UP" 和 "warm-up" 都變成 "warmup"
        const s = String(key).toLowerCase().replace(/[\s-]/g, '');

        // 🔥 注意順序：anaerobic 包含 aerobic，所以必須先檢查 anaerobic
        if (s.includes('extreme') || s === '5') return 'extreme';
        if (s.includes('anaerobic') || s === '4') return 'anaerobic';
        if (s.includes('aerobic') || s === '3') return 'aerobic';
        if (s.includes('fat') || s === '2') return 'fat-burn';
        if (s.includes('warm') || s.includes('recovery') || s === '1') return 'recovery';
        return null;
    };

    const ZONE_ORDER = ['recovery', 'fat-burn', 'aerobic', 'anaerobic', 'extreme'];
    const ZONE_LABELS = { 'recovery': '熱身區', 'fat-burn': '燃脂區', 'aerobic': '有氧區', 'anaerobic': '無氧區', 'extreme': '極限區' };

    // 彙總各區間數據
    let finalStats = { 'recovery': 0, 'fat-burn': 0, 'aerobic': 0, 'anaerobic': 0, 'extreme': 0 };

    Object.keys(sourceData).forEach(key => {
        const mapped = normalizeZone(key);
        if (mapped) finalStats[mapped] += (Number(sourceData[key]) || 0);
    });

    // 2. Metrics Logic (HR Stream Processing)
    const hrArr = streamData?.heart_rate;

    // Fallback: if zone_distribution was all zeros but we have raw HR stream, recompute
    const allZero = Object.values(finalStats).every(v => v === 0);
    if (allZero && hrArr && hrArr.length > 1) {
        hrArr.forEach(raw => {
            const hr = Number(raw);
            if (hr < 40) return;
            if (hr <= ZONE_BOUNDS.recovery) finalStats['recovery']++;
            else if (hr <= ZONE_BOUNDS.fatBurn) finalStats['fat-burn']++;
            else if (hr <= ZONE_BOUNDS.aerobic) finalStats['aerobic']++;
            else if (hr <= ZONE_BOUNDS.anaerobic) finalStats['anaerobic']++;
            else finalStats['extreme']++;
        });
    }

    let totalVal = Object.values(finalStats).reduce((a, b) => a + b, 0);

    const hrToZone = (val) => {
        if (val <= ZONE_BOUNDS.recovery) return 'recovery';
        if (val <= ZONE_BOUNDS.fatBurn) return 'fat-burn';
        if (val <= ZONE_BOUNDS.aerobic) return 'aerobic';
        if (val <= ZONE_BOUNDS.anaerobic) return 'anaerobic';
        return 'extreme';
    };

    // Score: 優先 props，其次從 HR stream 計算，最後從 zoneStats 計算
    const ZONE_PTS_PER_MIN = { 'recovery': 0.5, 'fat-burn': 1.0, 'aerobic': 2.0, 'anaerobic': 3.5, 'extreme': 5.0 };
    let totalScore = Math.round(finalScore || 0);
    if (totalScore === 0 && hrArr && hrArr.length > 1) {
        let recalculated = 0;
        hrArr.forEach(raw => {
            const hr = Number(raw);
            if (hr < 40) return;
            const zone = hrToZone(hr);
            recalculated += (ZONE_PTS_PER_MIN[zone] || 0.5) / 60;
        });
        totalScore = Math.round(recalculated);
    }
    // 如果還是 0，從 zoneStats 秒數估算
    if (totalScore === 0 && zoneStats) {
        const ZONE_SEC_MAP2 = {
            'WARM UP': 'recovery', 'Warm Up': 'recovery', 'Warm-up': 'recovery', 'Recovery': 'recovery',
            'FAT BURN': 'fat-burn', 'Fat Burn': 'fat-burn',
            'AEROBIC': 'aerobic', 'Aerobic': 'aerobic',
            'ANAEROBIC': 'anaerobic', 'Anaerobic': 'anaerobic',
            'EXTREME': 'extreme', 'Extreme': 'extreme',
        };
        let calc = 0;
        Object.keys(zoneStats).forEach(k => {
            const zKey = ZONE_SEC_MAP2[k];
            if (zKey) calc += (Number(zoneStats[k]) || 0) * (ZONE_PTS_PER_MIN[zKey] || 0.5) / 60;
        });
        totalScore = Math.round(calc);
    }

    // 🎯 Performance-Based Fallback (v2)：只在 score 足夠（≥10）時才合成分佈
    //   原本只要 score > 0 就合成，但例如 score=2（只跑了幾秒）也會強推 80%/20%，誤導用戶
    //   現在改為 score ≥ 10 才合成，否則保留空狀態
    if (totalVal === 0 && totalScore >= 10) {
        if (totalScore < 30) {
            finalStats['recovery'] = 80; finalStats['fat-burn'] = 20;
        } else if (totalScore < 60) {
            finalStats['recovery'] = 20; finalStats['fat-burn'] = 50; finalStats['aerobic'] = 30;
        } else if (totalScore < 85) {
            finalStats['fat-burn'] = 20; finalStats['aerobic'] = 60; finalStats['anaerobic'] = 20;
        } else {
            finalStats['aerobic'] = 30; finalStats['anaerobic'] = 50; finalStats['extreme'] = 20;
        }
        totalVal = 100;
    }

    // 🪶 整張卡的 empty state：
    //   1) 父層 hasMeaningfulData=false（距離/時長/卡路里都不夠）→ 強制 empty
    //   2) score < 10 且沒任何 zone 數據 → 也視為 empty
    //   原本只看 totalVal===0，但 hrArr 即使 1-2 個 sample 也會把 totalVal 撐起來造成 100% recovery 假象
    const isEmptyEffort = !hasMeaningfulData || (totalScore < 10 && totalVal < 10);

    // 🩹 v2 誠實顯示：區間資料來源與可靠度
    //   zone_source（tracker v2 寫入）: 'heart_rate' | 'estimated_pace' | 'none'
    //   舊資料防呆：zone 總秒數遠小於運動時長（例：25 分鐘的跑只有 14 秒 zone 資料）
    //   → 視為手錶未接收到心率，不再顯示「100% 熱身區」的假象
    const zoneSource = deepData?.deep_metrics?.zone_source || deepMetrics.zone_source || null;
    const runDurationSec = Number(duration) || 0;
    const zoneEstimated = zoneSource === 'estimated_pace';
    const zoneUnreliable = zoneSource === 'none' || (
        !zoneEstimated &&
        (!hrArr || hrArr.length <= 10) &&
        runDurationSec > 300 &&
        totalVal > 0 &&
        totalVal < runDurationSec * 0.2
    );

    const getZoneWidth = (zoneKey) => {
        if (totalVal === 0) return zoneKey === 'recovery' ? 100 : 0;
        return (finalStats[zoneKey] / totalVal) * 100;
    };
    // 🎯 進度條第一優先：真實 HR Stream 對映成時序片段
    let timelineSegments = null;
    if (hrArr && hrArr.length > 1) {
        // Mode A: 真實心率時序—每個採樣點對映一個時刻，連續相同 zone 合併
        const segs = [];
        let curZone = hrToZone(Number(hrArr[0]));
        let cnt = 1;
        for (let i = 1; i < hrArr.length; i++) {
            const z = hrToZone(Number(hrArr[i]));
            if (z === curZone) {
                cnt++;
            } else {
                segs.push({ zone: curZone, pct: (cnt / hrArr.length) * 100 });
                curZone = z;
                cnt = 1;
            }
        }
        segs.push({ zone: curZone, pct: (cnt / hrArr.length) * 100 });
        timelineSegments = segs;
    } else if (totalVal > 0) {
        // Mode B: 從聚合數據環原比例條 (按生理順序呈現：熱身 → 有氧 → 極限)
        timelineSegments = ZONE_ORDER
            .filter(z => finalStats[z] > 0)
            .map(z => ({ zone: z, pct: (finalStats[z] / totalVal) * 100 }));
    }
    const hasTimeline = timelineSegments !== null && timelineSegments.length > 0;


    const getDominantZone = () => {
        if (totalVal === 0) return '熱身區'; // edge case: no data
        const maxKey = Object.keys(finalStats).reduce((a, b) => finalStats[a] > finalStats[b] ? a : b);
        return ZONE_LABELS[maxKey] || maxKey.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    };

    const getAnaerobicWork = () => {
        const ana = (finalStats['anaerobic'] || 0) + (finalStats['extreme'] || 0);
        const pct = totalVal > 0 ? (ana / totalVal) * 100 : 0;
        return Math.round(pct) + "%";
    };

    const getRecoveryNeed = () => {
        // Use backend value if possible
        if (deepMetrics.recovery_hours) return `${deepMetrics.recovery_hours} 小時`;

        let hours = Math.round(score / 5);
        if (hours < 4) hours = 4;
        if (hours > 48) hours = 48;
        return `${hours} 小時`;
    };

    // Swiss Editorial Empty State — 極簡留白，無多餘 card border
    if (isEmptyEffort) {
        return (
            <div className="effort-card-container">
                <div className="card-main-content">
                    <div className="flex items-baseline justify-between pb-4 border-b border-black/10 mb-5">
                        <div>
                            <p className="text-[12px] font-black tracking-[0.04em] text-black/35 mb-1">— 生理負荷</p>
                            <h3 className="card-title">努力深度</h3>
                        </div>
                        <div className="text-right">
                            <span className="text-[42px] font-black leading-none tabular-nums" style={{ color: 'rgba(22,20,21,0.18)' }}>—</span>
                            <span className="text-[11px] font-black uppercase tracking-widest text-black/30 ml-1">pts</span>
                        </div>
                    </div>
                    <p className="text-[12px] font-medium text-black/55 leading-relaxed max-w-[320px]">
                        尚無生理負荷資料。完成一次 10 秒以上、有心率記錄的活動後，
                        <br />
                        各區間的時間分配與訓練效益會在這裡呈現。
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="effort-card-container">
            {/* Upper Section — Swiss Editorial */}
            <div className="card-main-content">
                <motion.button {...pressProps('cta')}
 type="button"
 onClick={() => setShowZoneInfo(true)}
 className="w-full flex items-baseline justify-between pb-4 border-b border-black/10 mb-5 text-left active:opacity-70 transition-opacity"
 style={{ background: 'transparent', border: 'none', borderBottom: '1px solid rgba(0,0,0,0.10)', cursor: 'pointer' }}
 >
                    <div>
                        <p className="text-[12px] font-black tracking-[0.04em] text-black/45 mb-1">生理負荷</p>
                        <h3 className="card-title flex items-center gap-1.5">
                            努力深度
                            <Info size={13} className="text-black/30" />
                        </h3>
                    </div>
                    <div className="text-right flex items-baseline gap-1">
                        <span className="main-metric-value">{totalScore}</span>
                        <span className="text-[11px] font-black uppercase tracking-widest text-black/40">pts</span>
                    </div>
                </motion.button>
                <EffortInfoPopup isOpen={showZoneInfo} onClose={() => setShowZoneInfo(false)} />


                {/* Chart Section */}
                <div className="chart-container">
                    {/* 🩹 資料來源誠實標示 */}
                    {zoneEstimated && (
                        <div className="flex items-start gap-2 mb-4 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(202,138,4,0.08)', border: '1px solid rgba(202,138,4,0.18)' }}>
                            <Info size={12} className="shrink-0 mt-[1px]" style={{ color: '#CA8A04' }} />
                            <p className="text-[11px] font-bold leading-relaxed" style={{ color: '#8a6d0b' }}>
                                手錶未接收到心率數據 — 以下區間分佈由「配速相對強度」推算，僅供參考。
                            </p>
                        </div>
                    )}
                    {zoneUnreliable ? (
                        <div className="px-1 pb-2">
                            <div className="stacked-bar" style={{ gap: 0, backgroundColor: '#E5E7EB' }}>
                                <div style={{
                                    width: '100%', height: '100%', borderRadius: '7px',
                                    backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 6px, rgba(255,255,255,0.4) 6px, rgba(255,255,255,0.4) 8px)'
                                }} />
                            </div>
                            <p className="text-[11px] text-black/45 font-bold leading-relaxed mt-2">
                                手錶未接收到心率數據，本次無法計算真實區間分佈。
                                下次確認手錶連線後，這裡會顯示五區時間分配。
                            </p>
                        </div>
                    ) : (
                    <>
                    {/* 實時春度條 — 實際 HR Stream 時序呈現 */}
                    {hasTimeline ? (
                        <div className="stacked-bar" style={{ gap: 0 }}>
                            {timelineSegments.map((seg, i) => (
                                <div
                                    key={i}
                                    className={`bar-segment ${seg.zone}`}
                                    style={{
                                        width: `${seg.pct}%`,
                                        // 不同 zone 之間加上細白線區隔
                                        borderRight: i < timelineSegments.length - 1 && seg.zone !== timelineSegments[i + 1]?.zone
                                            ? '2px solid rgba(255,255,255,0.6)' : 'none',
                                        borderRadius: i === 0 ? '7px 0 0 7px'
                                            : i === timelineSegments.length - 1 ? '0 7px 7px 0'
                                                : '0'
                                    }}
                                />
                            ))}
                        </div>
                    ) : (
                        // 沒有 HR stream — 顯示佔位條 + 提示
                        <div style={{ marginBottom: '16px' }}>
                            <div className="stacked-bar" style={{ gap: 0, backgroundColor: '#E5E7EB' }}>
                                <div style={{
                                    width: '100%', height: '100%', borderRadius: '7px',
                                    backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 6px, rgba(255,255,255,0.4) 6px, rgba(255,255,255,0.4) 8px)'
                                }}
                                />
                            </div>
                            <p className="text-[12px] text-black/30 font-bold tracking-widest mt-1 px-1">
                                即時心率數據不足 · 結束後可查看誤差試
                            </p>
                        </div>
                    )}

                    {/* Swiss editorial: dash + uppercase tracking */}
                    <div className="text-[12px] font-black tracking-[0.28em] text-black/45 mb-4 px-1">
                        — 區間分佈
                    </div>

                    {/* Legend Grid — Swiss editorial：橫排 3 cols，主數據百分比 大字 */}
                    <div className="grid grid-cols-3 gap-y-4 gap-x-3 mb-2">
                        {ZONE_ORDER.map(key => {
                            const width = getZoneWidth(key);
                            const isEmpty = width <= 0.5;
                            return (
                                <div key={key} className="flex items-start gap-2" style={{ opacity: isEmpty ? 0.3 : 1 }}>
                                    <span className={`w-1.5 h-1.5 rounded-full legend-dot ${key} mt-[7px] shrink-0`} />
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-[11px] font-bold text-black/55 leading-tight uppercase tracking-[0.1em] truncate">{ZONE_LABELS[key]}</span>
                                        <span className="text-[15px] font-black text-black tabular-nums leading-tight mt-1">
                                            {Math.round(width)}<span className="text-[11px] opacity-50 ml-0.5">%</span>
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    </>
                    )}
                </div>
            </div>

            {/* Footer — Swiss Editorial：divide-y + 左右 alignment */}
            <div className="divide-y divide-black/10 mt-4">
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
        </div>
    );
};

// --- Effort Info Popup (inline, replaces EffortExplanationModal) ---
const EFFORT_PALETTE = { paper: C.paper, deepBlack: C.ink, stone: C.paper2, coral: C.coral };

const EffortInfoPopup = ({ isOpen, onClose }) => (
    <AnimatePresence>
        {isOpen && (
            <motion.div
                key="effort-info-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                style={{ position: 'fixed', inset: 0, background: 'rgba(22,20,21,0.6)', zIndex: 3000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
            >
                <motion.div
                    key="effort-info-card"
                    initial={{ y: '100%', opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: '100%', opacity: 0 }}
                    transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                    onClick={e => e.stopPropagation()}
                    style={{
                        background: EFFORT_PALETTE.paper,
                        width: '100%',
                        maxWidth: 480,
                        borderRadius: '28px 28px 0 0',
                        maxHeight: '72dvh',
                        overflowY: 'auto',
                        padding: '0 0 40px 0',
                        boxShadow: '0 -8px 40px rgba(0,0,0,0.2)',
                    }}
                >
                    {/* Handle bar */}
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
                        <div style={{ width: 36, height: 4, borderRadius: 99, background: 'rgba(22,20,21,0.12)' }} />
                    </div>

                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 20px 16px' }}>
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 900, color: EFFORT_PALETTE.coral, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 2 }}>GRAVITY SCORE</div>
                            <div style={{ fontSize: 20, fontWeight: 900, color: EFFORT_PALETTE.deepBlack, letterSpacing: '-0.03em', lineHeight: 1 }}>動態負荷系統</div>
                        </div>
                        <motion.button {...pressProps('row')} aria-label="關閉"
 onClick={onClose}
 style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(22,20,21,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
 >
                            <X size={16} color={EFFORT_PALETTE.deepBlack} />
                        </motion.button>
                    </div>

                    {/* Section divider */}
                    <div style={{ height: 1, background: EFFORT_PALETTE.stone, margin: '0 20px 20px' }} />

                    {/* Body */}
                    <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

                        {/* Intro */}
                        <p style={{ fontSize: 12, color: 'rgba(22,20,21,0.6)', lineHeight: 1.6, margin: 0 }}>
                            此指標結合 <b style={{ color: EFFORT_PALETTE.deepBlack }}>心率區間</b>、<b style={{ color: EFFORT_PALETTE.deepBlack }}>運動強度</b> 和 <b style={{ color: EFFORT_PALETTE.deepBlack }}>燃脂效率</b>，為您提供完整的運動負荷評估。
                        </p>

                        {/* 1. Zone Colors */}
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                <div style={{ width: 20, height: 20, borderRadius: '50%', background: EFFORT_PALETTE.deepBlack, color: 'white', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>1</div>
                                <span style={{ fontSize: 14, fontWeight: 900, color: EFFORT_PALETTE.deepBlack }}>心率區間與顏色</span>
                            </div>
                            <div style={{ background: EFFORT_PALETTE.stone, borderRadius: 18, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {[
                                    { dot: '#FDD835', label: '熱身區', sub: '低強度・Zone 1' },
                                    { dot: '#8BC34A', label: '燃脂區', sub: '最佳效率・Zone 2' },
                                    { dot: '#FF9800', label: '有氧區', sub: '耐力訓練・Zone 3' },
                                    { dot: '#F06292', label: '無氧區', sub: '高強度・Zone 4' },
                                    { dot: '#5C6BC0', label: '極限區', sub: '最大負荷・Zone 5' },
                                ].map(({ dot, label, sub }) => (
                                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                                        <span style={{ fontSize: 12, fontWeight: 800, color: EFFORT_PALETTE.deepBlack }}>{label}</span>
                                        <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(22,20,21,0.4)', marginLeft: 'auto' }}>{sub}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 2. Calculation */}
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                <div style={{ width: 20, height: 20, borderRadius: '50%', background: EFFORT_PALETTE.deepBlack, color: 'white', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>2</div>
                                <span style={{ fontSize: 14, fontWeight: 900, color: EFFORT_PALETTE.deepBlack }}>心率加權計算</span>
                            </div>
                            <div style={{ background: 'white', borderRadius: 18, padding: '12px 16px', border: `1px solid ${EFFORT_PALETTE.stone}` }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, paddingBottom: 8, borderBottom: `1px solid ${EFFORT_PALETTE.stone}`, marginBottom: 8 }}>
                                    {['區間', '強度', '乘數'].map(h => (
                                        <span key={h} style={{ fontSize: 11, fontWeight: 900, color: 'rgba(22,20,21,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: h === '乘數' ? 'right' : h === '強度' ? 'center' : 'left' }}>{h}</span>
                                    ))}
                                </div>
                                {[
                                    { zone: 'Zone 5', color: '#5C6BC0', label: '極限', mult: '2.0×' },
                                    { zone: 'Zone 4', color: '#F06292', label: '高強度', mult: '1.5×' },
                                    { zone: 'Zone 3', color: '#FF9800', label: '有氧', mult: '1.2×' },
                                    { zone: 'Zone 2', color: '#8BC34A', label: '基礎', mult: '1.0×' },
                                ].map(({ zone, color, label, mult }) => (
                                    <div key={zone} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginBottom: 6, alignItems: 'center' }}>
                                        <span style={{ fontSize: 11, fontWeight: 800, color }}>{zone}</span>
                                        <span style={{ fontSize: 11, color: 'rgba(22,20,21,0.5)', textAlign: 'center' }}>{label}</span>
                                        <span style={{ fontSize: 12, fontWeight: 900, color: EFFORT_PALETTE.deepBlack, textAlign: 'right' }}>{mult}</span>
                                    </div>
                                ))}
                                <p style={{ fontSize: 11, color: 'rgba(22,20,21,0.5)', marginTop: 8, lineHeight: 1.5 }}>
                                    分數 = <b style={{ color: EFFORT_PALETTE.deepBlack }}>卡路里消耗</b> × <b style={{ color: EFFORT_PALETTE.deepBlack }}>心率乘數</b>
                                </p>
                            </div>
                        </div>

                        {/* 3. Goal Progress */}
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                <div style={{ width: 20, height: 20, borderRadius: '50%', background: EFFORT_PALETTE.deepBlack, color: 'white', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>3</div>
                                <span style={{ fontSize: 14, fontWeight: 900, color: EFFORT_PALETTE.deepBlack }}>目標進度條</span>
                            </div>
                            <div style={{ background: EFFORT_PALETTE.stone, borderRadius: 18, padding: '12px 16px' }}>
                                <p style={{ fontSize: 11, color: 'rgba(22,20,21,0.6)', lineHeight: 1.6, margin: 0 }}>
                                    動態追蹤 <b style={{ color: EFFORT_PALETTE.deepBlack }}>目標完成度</b> (0% → 100%)。<br />
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#aaa', display: 'inline-block' }} />
                                        <b style={{ color: EFFORT_PALETTE.deepBlack }}>維持目標</b>：白色光效
                                    </span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#D4A853', display: 'inline-block' }} />
                                        <b style={{ color: EFFORT_PALETTE.coral }}>挑戰目標</b>：金色流光極限突破
                                    </span>
                                </p>
                            </div>
                        </div>

                    </div>
                </motion.div>
            </motion.div>
        )}
    </AnimatePresence>
);

// 破紀錄類型 → 豐富的說明文字（讓內容多元完整，不只一行 detail）
const RECORD_META = {
    FIRST: { icon: '🎉', blurb: '第一筆紀錄，一切從這裡開始。' },
    DISTANCE: { icon: '🛣️', blurb: '有史以來最長距離，有氧引擎又升級了。' },
    PACE: { icon: '⚡', blurb: '個人最快配速，速度正在突破。' },
    DEFAULT: { icon: '🏅', blurb: '又一個 PR 被刷新。' },
};
const recordMeta = (type) => {
    if (!type) return RECORD_META.DEFAULT;
    if (type === 'FIRST') return RECORD_META.FIRST;
    if (type === 'DISTANCE') return RECORD_META.DISTANCE;
    if (type.startsWith('PACE')) return RECORD_META.PACE;
    return RECORD_META.DEFAULT;
};

// 🏆 破紀錄詳情彈窗 — 瑞士極簡 + 微玻璃（bottom sheet）。多筆紀錄逐項完整展開。
//    v2：加入「PR 檔案」— 各標準距離(公里制)本場名次 + 歷年 PR 進程。
const RecordsDetailModal = ({ isOpen, onClose, records = [], stats = {}, rankings = [], timeline = {}, onOpenProfile = null }) => (
    <AnimatePresence>
        {isOpen && (
            <motion.div
                key="rec-backdrop"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={onClose}
                style={{ position: 'fixed', inset: 0, background: 'rgba(22,20,21,0.45)', backdropFilter: 'blur(3px)', zIndex: 3000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
            >
                <motion.div
                    key="rec-card"
                    initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                    transition={{ type: 'spring', damping: 30, stiffness: 320 }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        width: '100%', maxWidth: 480, maxHeight: '78dvh', overflowY: 'auto',
                        borderRadius: '28px 28px 0 0', padding: '0 0 40px',
                        // 微玻璃：半透明 Paper + 模糊 + 高光描邊
                        background: 'linear-gradient(180deg, rgba(246,244,241,0.92) 0%, rgba(246,244,241,0.98) 100%)',
                        backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)',
                        border: '1px solid rgba(255,255,255,0.7)',
                        boxShadow: '0 -10px 50px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.9)',
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
                        <div style={{ width: 36, height: 4, borderRadius: 99, background: 'rgba(22,20,21,0.12)' }} />
                    </div>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 22px 14px' }}>
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 900, color: '#C59D5F', letterSpacing: '0.22em', textTransform: 'uppercase', marginBottom: 3 }}>Personal Records</div>
                            <div style={{ fontSize: 22, fontWeight: 900, color: C.ink, letterSpacing: '-0.03em', lineHeight: 1 }}>本場破了 {records.length} 項紀錄</div>
                        </div>
                        <motion.button {...pressProps('row')} aria-label="關閉" onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(22,20,21,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <X size={16} color={C.ink} />
                        </motion.button>
                    </div>
                    <div style={{ height: 1, background: 'rgba(0,0,0,0.08)', margin: '0 22px 18px' }} />
                    {/* 逐項紀錄 */}
                    <div style={{ padding: '0 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {records.map((r, i) => {
                            const meta = recordMeta(r.type);
                            // 🏅 名次獎牌：有 rank 用 rank，否則首次/一般都給金牌
                            const rMedal = medalSrc(r.rank || 'PR');
                            return (
                                <div key={r.type || i} style={{ display: 'flex', gap: 14, padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 2px 10px -4px rgba(0,0,0,0.12)' }}>
                                    <img src={rMedal} alt="medal" style={{ width: 30, height: 30, objectFit: 'contain', flexShrink: 0 }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                                            <span style={{ fontSize: 14, fontWeight: 900, color: C.ink }}>{r.label}</span>
                                            <span style={{ fontSize: 15, fontWeight: 900, color: '#C59D5F' }} className="tabular-nums">{r.detail}</span>
                                        </div>
                                        <p style={{ fontSize: 12, color: 'rgba(22,20,21,0.6)', lineHeight: 1.6, margin: 0 }}>{meta.blurb}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {/* 🏆 PR 檔案 — 各標準距離（公里制）：本場名次 + 歷年 PR 進程 */}
                    {rankings.length > 0 && (
                        <div style={{ margin: '24px 22px 0' }}>
                            <div style={{ fontSize: 12, fontWeight: 900, color: 'rgba(22,20,21,0.45)', letterSpacing: '0.28em', marginBottom: 12 }}>
                                — PR 檔案 · 公里制
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {rankings.map((rk) => {
                                    const tl = timeline[rk.key] || [];
                                    const currentPR = tl[tl.length - 1] || null;
                                    return (
                                        <div key={rk.key} style={{ padding: '13px 2px', borderTop: '1px solid rgba(0,0,0,0.08)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                                    {rk.rank && rk.historyCount > 0
                                                        ? <img src={medalSrc(rk.rank)} alt={`第${rk.rank}`} style={{ width: 20, height: 20, objectFit: 'contain' }} />
                                                        : <span style={{ width: 20, textAlign: 'center', fontSize: 11, fontWeight: 900, color: 'rgba(22,20,21,0.3)' }}>·</span>}
                                                    <span style={{ fontSize: 13, fontWeight: 900, color: C.ink }}>{rk.label}</span>
                                                    {rk.rank && rk.historyCount > 0 && (
                                                        <span style={{ fontSize: 11, fontWeight: 900, color: '#C59D5F' }}>
                                                            {rk.rank === 1 ? '本場 · 有史以來最快' : `本場 · 歷史第 ${rk.rank} 快`}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="tabular-nums" style={{ fontSize: 13, fontWeight: 900, color: C.ink }}>
                                                    {formatDurationSec(rk.sec)}
                                                    <span style={{ fontSize: 11, color: 'rgba(22,20,21,0.45)', marginLeft: 4 }}>{formatPaceSec(rk.paceSec)}/km</span>
                                                </span>
                                            </div>
                                            {/* 歷年 PR 進程（最多近 4 次刷新） */}
                                            {tl.length > 1 && (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, paddingLeft: 28 }}>
                                                    {tl.slice(-4).map((t, i, arr) => (
                                                        <span key={i} className="tabular-nums" style={{
                                                            fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 99,
                                                            background: i === arr.length - 1 ? 'rgba(197,157,95,0.14)' : 'rgba(0,0,0,0.05)',
                                                            color: i === arr.length - 1 ? '#8a6a33' : 'rgba(22,20,21,0.55)',
                                                        }}>
                                                            {String(t.date).slice(0, 10)} · {formatDurationSec(t.sec)}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                            {currentPR && tl.length <= 1 && (
                                                <p style={{ fontSize: 11, color: 'rgba(22,20,21,0.4)', margin: '6px 0 0 28px' }}>
                                                    這是此距離的第一筆紀錄 — 之後每次刷新都會記在這裡。
                                                </p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    {/* 🏆 完整 PR 檔案入口 */}
                    {onOpenProfile && (
                        <motion.button {...pressProps('row')}
 onClick={onOpenProfile}
 style={{ margin: '18px 22px 0', width: 'calc(100% - 44px)', padding: '13px 16px', borderRadius: 16, border: 'none', background: C.ink, color: '#fff', fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
 >
                            查看完整 PR 檔案 · 歷年變化 →
                        </motion.button>
                    )}
                    {/* 鼓勵語 */}
                    <div style={{ margin: '18px 22px 0', padding: '14px 16px', borderRadius: 18, background: 'rgba(197,157,95,0.08)', border: '1px solid rgba(197,157,95,0.2)' }}>
                        <p style={{ fontSize: 12, fontWeight: 800, color: C.ink, margin: 0, lineHeight: 1.6 }}>
                            🔥 紀錄就是用來打破的。把今天的手感記住，下一次就是新的起點。
                        </p>
                    </div>
                </motion.div>
            </motion.div>
        )}
    </AnimatePresence>
);

// 🔴 零模擬數據原則：原 getMockData 假跑步資料已移除。
//    直接開網址（無 state）時回傳全零結構 → hasMeaningfulData=false，
//    頁面自動走既有的「誠實空狀態」降階路徑，不再出現假的 5.02km 紀錄。
const getMockData = () => ({
    sessionId: 'mock_empty',
    timestamp: new Date().toISOString(),
    stats: { distance: 0, duration: 0, pace: 0, calories: 0, score: 0, zoneStats: {} },
    route: [],
    deepData: { deep_metrics: {}, physio_metrics: {}, achievements: { milestone_markers: [] } },
    stream_data: { timestamps: [], heart_rate: [], pace: [] },
});

const CardioResultsMobile = ({ cardioData: propsCardioData, userId: propsUserId, onClose, onSave }) => {
    const navigate = useNavigate();
    const location = useLocation();

    // Use Recovery Context for global state
    const { isRecovering, recoveryTimer, currentHR, recoveryCompleted, skipRecovery, hrrValue } = useRecovery();

    // State
    const [insights, setInsights] = useState(null);
    // 路線地圖：先給 Apple Maps 靜態圖（立即、清楚），點了才換成可拖曳的互動地圖
    const [routeMapLive, setRouteMapLive] = useState(false);
    const { canUse: memberCan } = useMembership();
    const runFull = memberCan('runAnalysis');   // 💳 完整跑步分析：逐項建議、心率區間與負荷、配速心率曲線
    const [splitsAnalysis, setSplitsAnalysis] = useState([]); // New State
    const [loading, setLoading] = useState(true);
    const [shareMode, setShareMode] = useState(false);
    const [isPaceOpen, setIsPaceOpen] = useState(true);
    const isInsightsOpen = true; // Fixed default value
    const [showSharePreview, setShowSharePreview] = useState(false);
    const [showRunningEvolution, setShowRunningEvolution] = useState(false); // 🚩 控制跑步雜誌編輯器
    const [showEffortInfo, setShowEffortInfo] = useState(false);
    const hasSavedRef = useRef(false);
    const hasFetchedInsightsRef = useRef(false);
    const [isSaving, setIsSaving] = useState(false);
    const [userMaxHR, setUserMaxHR] = useState(null); // 依年齡算出的最大心率（個人化心率區間用）
    const isSavingRef = useRef(false);

    // Initial Data Logic: Props (real workout) > Navigation State > Mock (UI fallback only)
    const [cardioData, setCardioData] = useState(() => {
        if (propsCardioData) return propsCardioData;
        const stateData = window?.history?.state?.usr?.cardioData; // react-router state
        if (stateData) return stateData;
        return getMockData(); // fallback for direct URL access / dev
    });

    // 🫀 取得使用者年齡 → 算出個人化最大心率（Tanaka：208 − 0.7×age）
    //    傳給 EffortDepthCard 做心率區間個人化；抓不到年齡就維持 null（用固定門檻）。
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { fetchUserAge, calculateHeartRateZones } = await import('../utils/heartRateUtils');
                const age = await fetchUserAge();
                if (cancelled) return;
                const zones = calculateHeartRateZones(age);
                if (zones?.maxHR) setUserMaxHR(zones.maxHR);
            } catch (e) {
                console.warn('[CardioResults] 無法取得年齡，心率區間改用固定門檻', e);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // 🪶 hasMeaningfulData：判斷 stats 是否真有訓練數據可呈現
    //   用於空狀態降階：避免「0.00 / 00:00 / --'-- / 0」被當作 Hero 強推給用戶
    //   ⚠ 必須宣告在 cardioData useState 之後 — 否則 TDZ
    const hasMeaningfulData = useMemo(() => {
        const s = cardioData?.stats || {};
        const dist = Number(s.distance) || 0;
        const dur = Number(s.duration) || 0;
        const cal = Number(s.calories) || 0;
        return dist >= 0.01 || dur >= 10 || cal >= 1;
    }, [cardioData?.stats?.distance, cardioData?.stats?.duration, cardioData?.stats?.calories]);

    const userId = propsUserId || getUserId();

    /* 🩹 2026-08 稽核：計劃 vs 實跑的達成率。
       只在「這趟是照計劃磚跑的」時候才算得出來（自由跑沒有分母）。
       門檻 80% 與 dailyAgenda.COMPLETION_THRESHOLD / 後端 complete_brick 一致。 */
    const planCompare = useMemo(() => {
        const targetKm = Number(
            cardioData?.plannedDistanceKm ?? cardioData?.planned_distance_km ?? cardioData?.targetDistanceKm
        ) || 0;
        const actualKm = Number(cardioData?.stats?.distance ?? cardioData?.distance) || 0;
        if (!(targetKm > 0)) return null;
        const pct = Math.max(0, Math.round((actualKm / targetKm) * 100));
        return { targetKm, actualKm, pct, done: pct >= 80 };
    }, [cardioData?.plannedDistanceKm, cardioData?.planned_distance_km, cardioData?.targetDistanceKm, cardioData?.stats?.distance, cardioData?.distance]);

    // 🟢 是否為「非跑步的基本運動」（自行車/越野跑/健行/游泳/滑雪）。
    //    這些運動的結算頁只顯示基本數據，略過 deep analysis（教練回饋/努力深度/配速圖）。
    //    sport 未設定或為 run → 維持完整跑步結算。
    const isBasicSport = useMemo(() => {
        const sp = cardioData?.sport || cardioData?.sportType || '';
        return !!sp && sp !== 'run' && sp !== 'running';
    }, [cardioData?.sport, cardioData?.sportType]);
    const sportIcon = cardioData?.sportIcon || '🏃';
    const sportLabel = cardioData?.sportLabel || '跑步';

    // 🏆 真實個人紀錄（PR）— 取代寫死的假 PR 標記。
    //    抓取歷史 → 排除本次 → 計算 priorRecords → 判斷本次是否破紀錄。
    const [newRecords, setNewRecords] = useState([]);          // 本次打破的紀錄清單
    const [personalRecords, setPersonalRecords] = useState(null); // 含本次的最新紀錄（供標記用）
    const [runHistory, setRunHistory] = useState([]); // 過往跑步（供 Run Intelligence 長期趨勢/進步比較）
    const [showRecordsModal, setShowRecordsModal] = useState(false); // 破紀錄詳情彈窗（Liquid Glass）

    // 🏆 PR 系統資料（公里制）— 本場各標準距離的歷史名次 + 歷年 PR 進程
    const prRankings = useMemo(() => {
        const s = cardioData?.stats || {};
        if (!(Number(s.distance) > 0)) return [];
        return computeDistanceRankings(
            { distance: Number(s.distance) || 0, duration: Number(s.duration) || 0, pace: Number(s.pace) || 0, splits: s.splits || [] },
            runHistory,
        );
    }, [cardioData?.stats, runHistory]);
    const prTimeline = useMemo(() => {
        const s = cardioData?.stats || {};
        const cur = {
            distance: Number(s.distance) || 0,
            duration: Number(s.duration) || 0,
            pace: Number(s.pace) || 0,
            splits: s.splits || [],
            date: cardioData?.timestamp ? new Date(cardioData.timestamp).toISOString() : new Date().toISOString(),
        };
        return buildPRTimeline([...runHistory, cur]);
    }, [cardioData?.stats, cardioData?.timestamp, runHistory]);
    // 🎯 下一步小目標 — 有計劃 → 指向計劃下一課；無計劃 → 智慧混合目標
    const [nextStep, setNextStep] = useState(null);
    const [nextStepScheduled, setNextStepScheduled] = useState(false);
    const [achievedPrevGoal, setAchievedPrevGoal] = useState(false); // 本次是否達成上次目標
    // 🗓️ 排程時間 — 由本週剩餘課數平均分散推算「建議時間」，使用者可改選
    const [scheduleOptions, setScheduleOptions] = useState([]);
    const [selectedSchedule, setSelectedSchedule] = useState(null); // { id, label, date, hint }
    // 🔁 Plan Echo + 🔔 結算後推播 — 把本次跑步濃縮成列點存檔；
    //    下次開「同款」跑步計劃（同類型、距離 ±1km）時會跳出「上次表現」提示。
    const echoSavedRef = useRef(false);
    useEffect(() => {
        if (echoSavedRef.current || !userId || !hasMeaningfulData || isBasicSport) return;
        // ⚠️ mock 資料（直接開網址 / dev fallback）不存回聲、不推播
        if (String(cardioData?.sessionId || '').startsWith('mock')) return;
        const s = cardioData?.stats || {};
        const dist = Number(s.distance) || 0;
        if (dist < 1) return;
        // 稍等 1.5s 讓 runHistory 先到，讓「比上次快/慢」列點更完整；失敗也照存
        // （runHistory 更新會取消舊計時並重排 → 最終只存一次、且用最完整的資料）
        const t = setTimeout(async () => {
            if (echoSavedRef.current) return;
            echoSavedRef.current = true;
            try {
                const { saveRunEcho } = await import('../utils/planEcho');
                const intel = buildRunIntelligence(
                    { stats: s, splits: s.splits, stream_data: cardioData.stream_data, deepData: cardioData.deepData },
                    { priorRuns: runHistory },
                );
                saveRunEcho(userId, {
                    subtype: cardioData?.brick?.subtype || cardioData?.brick_subtype || 'easy',
                    distanceKm: dist,
                    runIntel: intel,
                    // 存數字（時間＋距離），不存結算當下的句子 —— 見 planEcho.js 的說明
                    stats: {
                        planName: cardioData?.brick?.title || '',
                        durationSec: Number(s.duration) || 0,
                    },
                });
                const { firePostWorkoutNudges } = await import('../utils/workoutReminders');
                firePostWorkoutNudges(userId, { type: 'run', prCount: newRecords.length, distanceKm: dist });
                // 📊 市場觀察：跑步完賽事件（上市後看跑步漏斗）
                import('../utils/telemetry').then(({ track }) => track('run_completed', { km: dist, pr: newRecords.length })).catch(() => {});
            } catch { /* 回聲屬 nice-to-have，不影響結算頁 */ }
        }, 1500);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, hasMeaningfulData, isBasicSport, runHistory]);

    // 📄 下載本次跑步完整報告（整頁 → A4 PDF 自動分頁）
    const reportRef = useRef(null);
    // 🩹 移除「下載報告 PDF」：結算頁的工作是讓人一眼看懂這趟跑得如何，
    //    產一份 A4 報告不是這頁的職責。

    const prCheckedRef = useRef(false);
    useEffect(() => {
        if (prCheckedRef.current) return;
        if (!userId || !hasMeaningfulData) return;
        prCheckedRef.current = true;

        const s = cardioData?.stats || {};
        const finishedRun = {
            distance: Number(s.distance) || 0,
            duration: Number(s.duration) || 0,
            pace: Number(s.pace) || 0,
            run_id: cardioData?.sessionId || cardioData?.session_id || null,
        };

        // ✅ 跑完先檢查：這次有沒有達成「上次存下的目標」？達成 → 清掉，避免主頁顯示過時目標。
        try {
            const savedRaw = localStorage.getItem(`drvn_next_goal_${userId}`);
            if (savedRaw) {
                const savedGoal = JSON.parse(savedRaw);
                if (isGoalAchieved(finishedRun, savedGoal)) {
                    localStorage.removeItem(`drvn_next_goal_${userId}`);
                    setAchievedPrevGoal(true);
                }
            }
        } catch { /* 解析失敗就忽略，不擋結果頁 */ }

        (async () => {
            try {
                const resp = await getCardioRuns(userId, 200);
                const allRuns = Array.isArray(resp) ? resp : (resp?.runs || []);
                // 排除「本次」這筆（用 session id 比對，沒有 id 就用最近一筆距離+時間近似排除）
                const finishedId = finishedRun.run_id;
                const priorRuns = allRuns.filter((r) => {
                    const rid = r.run_id || r.session_id || r.sessionId;
                    if (finishedId && rid) return rid !== finishedId;
                    // 無 id：排除距離與時間都幾乎相同的最近筆，避免把本次算進歷史
                    const dist = Number(r.distance ?? r.stats?.distance ?? 0);
                    const dur = Number(r.duration ?? r.stats?.duration ?? 0);
                    return !(Math.abs(dist - finishedRun.distance) < 0.02 && Math.abs(dur - finishedRun.duration) < 3);
                });

                const prior = computePersonalRecords(priorRuns);
                const broken = detectNewRecords(finishedRun, prior);
                setNewRecords(broken);
                setRunHistory(priorRuns);
                // 含本次的最新紀錄（用於地圖標記真實 PR 點）
                setPersonalRecords(computePersonalRecords([...priorRuns, finishedRun]));

                // 🎯 下一步：先看是否有「計劃的下一課」未完成（計劃情境優先）。
                //    讀 this-week 端點找第一個未完成 brick；失敗或無計劃 → 退回智慧混合目標。
                let planNext = null;
                let pendingCount = 0;
                try {
                    const planResp = await apiClient.get(`/api/cardio-plan/${userId}/this-week`);
                    const bricks = Array.isArray(planResp?.data?.bricks) ? planResp.data.bricks : [];
                    const isPending = (b) => !(b.completed || b.is_completed || b.done || b.status === 'completed' || b.status === 'skipped');
                    const nextBrick = bricks.find(isPending);
                    if (nextBrick) planNext = buildPlanNextStep(nextBrick);
                    pendingCount = bricks.filter(isPending).length;
                } catch { /* 無計劃 / 端點無回應 → 走 free-run 目標 */ }

                setNextStep(planNext || buildNextStepGoal(finishedRun, priorRuns));

                // 🗓️ 由剩餘課數推算「下次跑步」建議時間（無計劃 → pendingCount 0，仍給 2 天後預設）
                const nextRunDate = computeNextRunDate(pendingCount);
                const opts = buildScheduleOptions(nextRunDate);
                setScheduleOptions(opts);
                setSelectedSchedule(opts[0]); // 預設選「建議」
            } catch (e) {
                // 抓不到歷史不該擋住結果頁；靜默退回（不顯示 PR 而非顯示假 PR）
                console.warn('[PR] history fetch failed:', e?.message);
                // 仍給一個基於本次的目標，至少有「下一步」可引導
                setNextStep(buildNextStepGoal(finishedRun, []));
            }
        })();
    }, [userId, hasMeaningfulData, cardioData]);

    // 🔔 一鍵排程 — 存目標 + 開啟提醒（複用既有 workoutReminders 系統，不另起爐灶）
    const handleScheduleNext = useCallback(async () => {
        try {
            // 1) 存「下一步目標」+ 排定時間到獨立 key（不碰計劃資料）
            const goalPayload = {
                ...nextStep,
                savedAt: Date.now(),
                fromSessionId: cardioData?.sessionId || null,
                scheduledFor: selectedSchedule?.date ? new Date(selectedSchedule.date).toISOString() : null,
            };
            localStorage.setItem(`drvn_next_goal_${userId}`, JSON.stringify(goalPayload));
            // 2) 請求通知權限 + 開啟訓練提醒，並把使用者選的時間寫進提醒系統
            await requestNotificationPermission();
            const cur = getReminderSettings(userId);
            const timeStr = selectedSchedule?.date ? toHHMM(new Date(selectedSchedule.date)) : cur.time;
            saveReminderSettings(userId, { ...cur, enabled: true, time: timeStr });
            setNextStepScheduled(true);
            toast.success(`已排${selectedSchedule?.hint || '下次提醒'}，目標已存到主頁`);
        } catch (e) {
            console.warn('[NextStep] schedule failed:', e?.message);
            toast.error('排程失敗，請稍後再試');
        }
    }, [nextStep, userId, cardioData]);

    // Helper: Formatters
    const formatTime = (seconds) => {
        if (!seconds) return "00:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const formatPace = fmtPace;   // 🩹 J: 單一真相源 → utils/format.js（/km 由 UI 加）

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Morning Run";
        if (hour < 18) return "Afternoon Run";
        return "Evening Stride";
    };

    // 🔥 DVRN AI Coach Brain: Generate Enhanced Insights (v3 — 多維度分析)
    // 🟢 教練回饋：改用「資深教練規則引擎」(coachAnalysisEngine)。
    //    產出多維度、有亮點/問題/處方/下一步的完整回饋，初學者也看得懂。
    //    映射到既有 UI 的 {type,title,text} 結構（tone→type 沿用原配色）。
    const generateEnhancedAdvice = () => {
        const TONE_TO_TYPE = { praise: 'Achievement', warn: 'Warning', info: 'Efficiency', coach: 'Recovery' };
        const CAT_TO_TYPE = { pacing: 'Stamina', heart: 'Warning', efficiency: 'Efficiency', terrain: 'Stamina', gait: 'Efficiency', recovery: 'Recovery', highlight: 'Achievement' };
        try {
            const report = buildCoachReport({
                stats: cardioData.stats,
                splits: cardioData.stats?.splits,
                splitsAnalysis,
                stream_data: cardioData.stream_data,
                deepData: cardioData.deepData,
            });
            if (report.insights?.length) {
                return report.insights.map((it) => ({
                    type: CAT_TO_TYPE[it.category] || TONE_TO_TYPE[it.tone] || 'Efficiency',
                    title: it.metric ? `${it.title}　·　${it.metric}` : it.title,
                    /* 🩹 原本是「判讀 ＋ 白話為什麼 ＋ 下一步」三層打包成一段。
                       衛教句（為什麼）不是結算頁的工作 —— 一張卡只要「發生什麼」和「下一步做什麼」。
                       三層砍成兩層，這一列的資訊量直接少三分之一。 */
                    text: [it.verdict, it.action ? `➜ ${it.action}` : ''].filter(Boolean).join('\n'),
                }));
            }
        } catch (e) {
            console.warn('[coach] engine failed, fallback to legacy advice:', e?.message);
        }
        return generateLegacyAdvice();
    };

    const generateLegacyAdvice = () => {
        // 優先使用後端分析的 splitsAnalysis，否則 fallback 到本地 stats.splits
        const analysisData = splitsAnalysis?.length > 0 ? splitsAnalysis : cardioData.stats.splits;
        const stats = cardioData?.stats || {};
        const deepMetricsLocal = cardioData?.deepData?.deep_metrics || {};
        const streamHR = cardioData?.stream_data?.heart_rate || [];
        const streamPace = cardioData?.stream_data?.pace || [];
        const durationMin = Math.max(1, (stats.duration || 0) / 60);

        // 🚀 關鍵：如果是模擬數據或短距離（沒有 Splits），手動生成一個基於總數據的建議
        if ((!analysisData || analysisData.length < 1) && stats.distance > 0) {
            const items = [{
                type: 'Achievement',
                title: '動態模擬分析中',
                text: `你完成了 ${stats.distance?.toFixed(2)}km 的測試。目前心率維持在 ${Math.round(cardioData.heartRate || 0)}bpm，表現穩定。持續增加距離以解鎖深層耐力分析。`,
                icon: <Zap size={14} />
            }];
            // 即使短距也嘗試給心率建議
            if (streamHR.length > 10) {
                const avgHR = Math.round(streamHR.filter(h => h > 40).reduce((a, b) => a + b, 0) / streamHR.filter(h => h > 40).length);
                if (avgHR > 160) {
                    items.push({ type: 'Warning', title: '強度偏高', text: `平均心率 ${avgHR} bpm，這對短距離來說偏高，建議正式跑時稍事保留。`, icon: <Heart size={14} /> });
                } else if (avgHR > 0) {
                    items.push({ type: 'Recovery', title: '有氧節奏良好', text: `平均 ${avgHR} bpm 處於舒適的有氧開發區間。`, icon: <Heart size={14} /> });
                }
            }
            return items;
        }

        if (!analysisData || analysisData.length < 1) return [];

        const insightsList = [];
        const getPace = (s) => s.avg_pace || s.pace || 0;
        const getHR = (s) => s.avg_hr || s.avgHR || 0;
        const getIndex = (s) => s.split_index || s.km || 1;

        // O(n) min/max instead of O(n log n) sort (js-min-max-loop)
        const fastestSplit = analysisData.reduce((min, s) => getPace(s) < getPace(min) ? s : min, analysisData[0]);
        const slowestSplit = analysisData.reduce((max, s) => getPace(s) > getPace(max) ? s : max, analysisData[0]);

        // ═══ 維度 A：配速策略分析 (Pacing Strategy) ═══
        const firstKm = analysisData[0];
        const lastKm = analysisData[analysisData.length - 1];
        const paceDiff = getPace(lastKm) - getPace(firstKm);
        const paceSpread = getPace(slowestSplit) - getPace(fastestSplit);

        if (paceDiff < -10) {
            insightsList.push({
                type: 'Stamina',
                title: '教科書級負分割',
                text: `後段比前段快 ${Math.abs(Math.round(paceDiff))} 秒/km，這是精英跑者的特徵 — 代表你的配速策略與體能分配非常成熟。`,
                icon: <Zap size={14} />
            });
        } else if (paceDiff > 30) {
            insightsList.push({
                type: 'Warning',
                title: '體能分配需調整',
                text: `後段配速掉了 ${Math.round(paceDiff)} 秒/km。建議：下次前 2km 刻意放慢 10-15 秒，把體力留給後半段。`,
                icon: <Activity size={14} />
            });
        } else if (paceSpread < 15 && analysisData.length >= 3) {
            insightsList.push({
                type: 'Stamina',
                title: '穩定如節拍器',
                text: `全程配速波動僅 ${Math.round(paceSpread)} 秒，一致性非常好。穩定的配速是提升長距離表現的基石。`,
                icon: <Zap size={14} />
            });
        }

        // ═══ 維度 B：心率分析 (Heart Rate Intelligence) ═══
        if (streamHR.length > 10) {
            const validHR = streamHR.filter(h => h > 40);
            const avgHR = Math.round(validHR.reduce((a, b) => a + b, 0) / validHR.length);
            const maxHR = Math.max(...validHR);

            // 心率漂移偵測：後半心率 vs 前半心率
            const half = Math.floor(validHR.length / 2);
            const firstHalfAvg = validHR.slice(0, half).reduce((a, b) => a + b, 0) / half;
            const secondHalfAvg = validHR.slice(half).reduce((a, b) => a + b, 0) / (validHR.length - half);
            const hrDrift = secondHalfAvg - firstHalfAvg;

            if (hrDrift > 10) {
                insightsList.push({
                    type: 'Warning',
                    title: '心率漂移偵測',
                    text: `後半段心率比前半高 ${Math.round(hrDrift)} bpm（${Math.round(firstHalfAvg)} → ${Math.round(secondHalfAvg)}），可能是脫水或體溫過高。建議在長跑中補充水分。`,
                    icon: <Heart size={14} />
                });
            } else if (hrDrift < -5 && analysisData.length >= 3) {
                insightsList.push({
                    type: 'Efficiency',
                    title: '心率控制出色',
                    text: `你在維持配速的同時心率還下降了 ${Math.abs(Math.round(hrDrift))} bpm，展現出極佳的跑步經濟性。`,
                    icon: <Heart size={14} />
                });
            }

            // Zone 比例分析
            const zoneDistrib = deepMetricsLocal.zone_distribution || {};
            const totalZone = Object.values(zoneDistrib).reduce((a, b) => a + b, 0);
            if (totalZone > 0) {
                const z4pct = ((zoneDistrib['Anaerobic'] || zoneDistrib['anaerobic'] || 0) / totalZone) * 100;
                const z5pct = ((zoneDistrib['Extreme'] || zoneDistrib['extreme'] || zoneDistrib['EXTREME'] || 0) / totalZone) * 100;
                const highIntensity = z4pct + z5pct;
                if (highIntensity > 50) {
                    insightsList.push({
                        type: 'Warning',
                        title: '高強度佔比過高',
                        text: `無氧+極限區間佔了 ${Math.round(highIntensity)}%，如果不是比賽或間歇訓練，建議增加 Zone 2（有氧）的比例來打好基礎。`,
                        icon: <Activity size={14} />
                    });
                } else if (highIntensity < 5 && stats.distance >= 3) {
                    insightsList.push({
                        type: 'Recovery',
                        title: '輕鬆跑完成',
                        text: `幾乎全程都在低心率區間，這是一次完美的恢復跑。在高強度訓練之間穿插這樣的跑步非常重要。`,
                        icon: <Heart size={14} />
                    });
                }
            }
        }

        // ═══ 維度 C：心肺效率 (Efficiency Factor) ═══
        const ef = parseFloat(cardioData.deepData?.physio_metrics?.ef?.current || 0);
        if (ef > 1.3) {
            insightsList.push({
                type: 'Efficiency',
                title: '卓越的跑步效率',
                text: `EF 值 ${ef} 遠高於基準線，代表你在每一次心跳中榨取了更多的速度。持續堆積有氧跑量可以進一步提升這個指標。`,
                icon: <Heart size={14} />
            });
        } else if (ef >= 1.0) {
            insightsList.push({
                type: 'Efficiency',
                title: '心肺效率穩定',
                text: `EF 值 ${ef}，表示配速與心率的比值在正常範圍。持續累積跑量將逐步提升你的有氧基礎。`,
                icon: <Heart size={14} />
            });
        }

        // ═══ 維度 D：亮點路段 (Best Split Analysis) ═══
        const splitIndex = getIndex(fastestSplit);
        const splitHR = getHR(fastestSplit);
        const splitPace = getPace(fastestSplit);

        let whyText = "這一段你的步幅與頻率達到最佳平衡。";
        if (splitHR > 0 && splitHR < 155) {
            whyText = "令人驚豔的是，你在高速下仍維持低心率（" + splitHR + " bpm），心肺輸出效率極高。";
        } else if (splitHR >= 170) {
            whyText = "心率 " + splitHR + " bpm 處於高位，但你仍然維持住了配速，展現極佳的抗乳酸耐力。";
        }

        insightsList.push({
            type: 'Achievement',
            title: `亮點：第 ${splitIndex} 公里 · ${formatPace(splitPace)}`,
            text: whyText,
            icon: <TrendingUp size={14} />
        });

        // ═══ 維度 E：恢復建議 (Recovery Recommendation) ═══
        const recoveryHrs = deepMetricsLocal.recovery_hours || Math.max(4, Math.round((stats.score || 0) / 5));
        if (recoveryHrs > 0) {
            let recText = '';
            if (recoveryHrs >= 24) {
                recText = `這次訓練強度較大（建議恢復 ${recoveryHrs} 小時），明天安排完全休息或輕鬆走路，讓身體充分恢復。`;
            } else if (recoveryHrs >= 12) {
                recText = `建議至少休息 ${recoveryHrs} 小時後再進行下一次中高強度訓練。明天可以做輕鬆的交叉訓練（游泳、瑜伽）。`;
            } else {
                recText = `恢復需求約 ${recoveryHrs} 小時。你可以在今天稍晚或明天安排下一次跑步。記得補充蛋白質與碳水化合物。`;
            }
            insightsList.push({
                type: 'Recovery',
                title: `恢復處方：${recoveryHrs} 小時`,
                text: recText,
                icon: <Clock size={14} />
            });
        }

        return insightsList;
    };

    // Sync props → state when parent passes new real workout data
    useEffect(() => {
        if (propsCardioData) {
            console.log("🔄 CardioResultsMobile: Syncing real workout data from props...");
            setCardioData(propsCardioData);
        }
    }, [propsCardioData]);
    const fetchInsights = useCallback(async (sessionId) => {
        setLoading(true);
        try {
            const idToFetch = sessionId || cardioData?.sessionId;
            if (!idToFetch) { setLoading(false); return; }

            // 🕒 API Timeout wrapper
            const withTimeout = (promise, ms) => {
                const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms));
                return Promise.race([promise, timeout]);
            };

            const [insightsRes, depthRes] = await Promise.all([
                withTimeout(apiClient.get(`/api/cardio/insights/post-run/${idToFetch}?user_id=${userId}`), 8000),
                withTimeout(apiClient.get(`/api/cardio/deep-analysis/${idToFetch}?user_id=${userId}`), 8000).catch(() => ({ data: {} }))
            ]).catch(error => {
                console.warn("⚠️ API Parallel Fetch error or timeout:", error);
                return [{ data: null }, { data: {} }];
            });

            if (insightsRes?.data) {
                console.log('✅ Insights fetched:', insightsRes.data);
                setInsights(insightsRes.data);
            }

            if (depthRes.data) {
                console.log('✅ Depth Analysis fetched:', depthRes.data);
                setCardioData(prev => ({
                    ...prev,
                    deepData: depthRes.data
                }));

                if (depthRes.data.splits_analysis) {
                    setSplitsAnalysis(depthRes.data.splits_analysis);
                }
            }
        } catch (error) {
            console.error("❌ Failed to fetch insights:", error);
            setInsights({
                summary_text: `Great run! You covered ${cardioData?.stats?.distance?.toFixed(2) || 0}km in ${formatTime(cardioData?.stats?.duration || 0)}.`,
                stats: {
                    total_distance_km: cardioData?.stats?.distance?.toFixed(2) || 0,
                    total_sessions: 1,
                    avg_pace_str: formatPace(cardioData?.stats?.pace || 0)
                },
                recommendations: [
                    "Hydrate well to aid recovery.",
                    "Stretch your hamstrings and calves.",
                    "Consider rest or easy run tomorrow."
                ]
            });
        }
        setLoading(false);
    }, [cardioData, userId]);

    const saveCardioSession = useCallback(async (notifyParent = true) => {
        if (isSavingRef.current) return null;
        isSavingRef.current = true;
        setIsSaving(true);
        if (!cardioData) {
            console.log('⚠️ No cardio data to save');
            return null;
        }

        try {
            const payload = {
                user_id: userId,
                date: cardioData.timestamp ? new Date(cardioData.timestamp).toISOString() : new Date().toISOString(),
                route_data: cardioData.route || [],
                metrics: {
                    distance: cardioData.stats.distance || 0,
                    distance_km: cardioData.stats.distance || 0,
                    duration: cardioData.stats.duration || cardioData.stats.duration_seconds || 0,
                    duration_seconds: cardioData.stats.duration || cardioData.stats.duration_seconds || 0,
                    // 👇 關鍵修復：優先讀取 avgPace
                    avgPace: cardioData.stats.avgPace || cardioData.stats.pace || 0,
                    pace_per_km: cardioData.stats.avgPace || cardioData.stats.pace || 0,
                    calories: cardioData.stats.calories || 0,
                    score: cardioData.stats.score || 0,
                    zoneStats: cardioData.stats.zoneStats || {},
                    splits: cardioData.stats.splits || []
                },
                emotion: null,
                photo_url: null,
                notes: null,
                stream_data: cardioData.stream_data || null
            };

            const response = await apiClient.post('/api/cardio/session', payload);

            if (response.data.session_id) {
                localStorage.setItem('lastSavedSessionId', response.data.session_id);
                await fetchInsights(response.data.session_id);
            }

            if (onSave && notifyParent) {
                onSave(response.data);
            }

            if (window.webkit?.messageHandlers?.fitnessApp) {
                const startTime = new Date(cardioData.timestamp || new Date());
                const endTime = new Date(startTime.getTime() + ((cardioData.stats.duration || 0) * 1000));
                window.webkit.messageHandlers.fitnessApp.postMessage({
                    type: 'saveWorkout',
                    startTime: startTime.toISOString(),
                    endTime: endTime.toISOString(),
                    distance: (cardioData.stats.distance || 0) * 1000,
                    energyBurned: cardioData.stats.calories || 0
                });
            }

            // ★ v2.3 成就通知統一出口：距離里程碑 + 累積里程關卡。
            //   放在存檔成功的唯一收斂點，五個呼叫入口都會經過這裡，
            //   累積量以 session id 去重，不會因為重複存檔被灌水。
            try {
                notifyRunSaved(userId, {
                    sessionId: response.data?.session_id || cardioData.sessionId,
                    distanceKm: Number(cardioData.distance) || 0,
                });
            } catch { /* 通知不影響存檔 */ }

            setIsSaving(false);
            isSavingRef.current = false;
            return response.data;
        } catch (error) {
            setIsSaving(false);
            isSavingRef.current = false;
            console.error('❌ SAVE FAILED!', error);
            return null;
        }
    }, [cardioData, userId, fetchInsights, onSave]);

    // Real data loading logic
    useEffect(() => {
        if (!cardioData) {
            // No data at all — go back to tracker
            if (!propsCardioData) navigate('/cardio-tracker-mobile');
            return;
        }

        // If we have a backend session ID, fetch live insights
        if (cardioData.sessionId && !hasFetchedInsightsRef.current) {
            hasFetchedInsightsRef.current = true;
            fetchInsights(cardioData.sessionId);
            return;
        }

        // New run (no sessionId yet) — auto-save then fetch
        if (!cardioData.sessionId && !hasSavedRef.current && propsCardioData) {
            hasSavedRef.current = true;
            console.log("🚀 New run detected. Auto-saving to backend...");
            saveCardioSession(false).then(savedData => {
                if (savedData?.session_id) {
                    setCardioData(prev => ({ ...prev, sessionId: savedData.session_id }));
                } else {
                    setLoading(false);
                }
            }).catch(() => setLoading(false));
            return;
        }

        // Mock / no backend — just stop loading with placeholder insights
        setLoading(false);
        if (!insights) {
            const dist = cardioData?.stats?.distance?.toFixed(2) || '5.0';
            setInsights({
                summary_text: `完成 ${dist} 公里！你的配速穩定，耐力表現優秀。`,
                recommendations: ["補充水分以利恢復。", "明天可以考慮輕鬆跑。", "伸展腿部肌肉。"]
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cardioData?.sessionId, propsCardioData]);


    const handleSaveAndClose = async () => {
        // SAVE FIRST, then navigate
        await saveCardioSession();

        if (onClose) {
            onClose();
        } else {
            navigate('/cardio-tracker-mobile');
        }
    };



    const handleShare = async ({ caption, cardioData: shareData, imageDataUrl }) => {
        // 有沒有真的送到伺服器 —— 決定要不要說「已分享」、要不要把人帶去社群頁
        let syncedToServer = true;
        try {
            // First: Save session if not saved
            let sessionData = shareData;
            try {
                if (!shareData?.sessionId) {
                    const saved = await saveCardioSession(false);
                    if (saved?.session_id) {
                        sessionData = { ...shareData, sessionId: saved.session_id };
                    }
                }
            } catch (saveErr) {
                console.warn("⚠️ Session save skipped (offline):", saveErr);
            }

            // Try to sync to backend API (optional — localStorage is primary)
            try {
                const sessionPayload = {
                    session_id: sessionData?.sessionId || sessionData?.session_id || `local_${Date.now()}`,
                    stats: {
                        distance: sessionData?.stats?.distance || 0,
                        duration: sessionData?.stats?.duration || 0,
                        pace: sessionData?.stats?.pace || 0,
                        calories: sessionData?.stats?.calories || 0,
                    },
                    route: sessionData?.route || [],
                    exercises: [],
                };

                // Convert image (Base64) → Blob
                const base64ToBlob = (base64) => {
                    const arr = base64.split(',');
                    const mime = arr[0].match(/:(.*?);/)[1];
                    const bstr = atob(arr[1]);
                    let n = bstr.length;
                    const u8arr = new Uint8Array(n);
                    while (n--) { u8arr[n] = bstr.charCodeAt(n); }
                    return new Blob([u8arr], { type: mime });
                };

                let stickerBlob = null;
                if (imageDataUrl) {
                    try { stickerBlob = base64ToBlob(imageDataUrl); } catch (e) { /* skip */ }
                }

                const formData = new FormData();
                formData.append('user_id', userId);
                formData.append('user_name', getDisplayName());
                formData.append('session_data', JSON.stringify(sessionPayload));
                formData.append('caption', caption || '');
                formData.append('activity_type', 'run');
                formData.append('privacy', 'public');
                if (stickerBlob) formData.append('photo', stickerBlob, 'sticker.png');

                await apiClient.post('/api/activities/create', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                    timeout: 5000,
                });
                console.log("✅ Backend sync successful");
            } catch (apiErr) {
                console.warn("⚠️ Backend sync skipped (offline or error):", apiErr.message);
                /* ⚠️ 2026-09 稽核：這個 catch 原本只 console.warn，
                   然後下面不論成敗都報「已分享」—— 使用者以為朋友看得到了，
                   其實只存在自己手機裡。本機那份仍然保留（離線也看得到自己的紀錄），
                   但提示要說實話。 */
                syncedToServer = false;
            }

            setShowSharePreview(false);
            if (syncedToServer) {
                toast.success('已分享到跑步社群');
                navigate('/social-mobile');
            } else {
                // 沒送到伺服器就不要把人帶去社群頁 —— 他會在那裡找不到自己的貼文
                toast.error('沒有送到伺服器，目前只存在這台手機。請確認網路後重試');
            }

        } catch (err) {
            console.error("❌ Share error:", err);
            // Still navigate — localStorage post was already saved by SharePreviewModal
            setShowSharePreview(false);
            toast.warning('已儲存到本地，但同步到雲端失敗，請檢查網路後再試');
            navigate('/social-mobile');
        }
    };

    const formatDate = (isoString) => {
        if (!isoString) return "";
        const date = new Date(isoString);
        // Format: SUNDAY, JANUARY 11 ● 00:02
        const options = { weekday: 'long', month: 'long', day: 'numeric' };
        const dateStr = date.toLocaleDateString('en-US', options).toUpperCase();
        const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        return `${dateStr} ● ${timeStr}`;
    };


    // 🔥 PERFORMANCE: useMemo for Chart Data
    const chartData = useMemo(() => {
        try {
            if (cardioData?.stream_data?.timestamps?.length > 1) {
                const { timestamps, heart_rate, pace } = cardioData.stream_data;
                const totalPoints = timestamps.length;
                const targetPoints = 20;
                const step = Math.ceil(totalPoints / targetPoints);

                // 🔧 自動判斷 timestamps 格式：
                //   - 相對秒數 (新 Watch 格式): 0, 1, 2, 3 ...
                //   - Unix 毫秒 (舊格式): 1746000000000, ...
                const isUnixMs = timestamps[0] > 1_000_000_000;
                const startTime = isUnixMs ? timestamps[0] : 0;

                const data = [];
                for (let i = 0; i < totalPoints; i += step) {
                    const rawPace = Number(pace?.[i]) || 0;
                    const currentHR = Number(heart_rate?.[i]) || 0;

                    // 📉 Pace Hardening: Filter GPS outliers (too slow or too fast)
                    const cleanPace = (rawPace > 0 && rawPace < 1200) ? rawPace : null;

                    // Time: 統一換算成相對秒數
                    const timeSec = isUnixMs
                        ? (Number(timestamps[i]) - startTime) / 1000
                        : Number(timestamps[i]);

                    data.push({
                        time: Math.round(timeSec),
                        pace: cleanPace,
                        heartRate: isFinite(currentHR) && currentHR > 0 ? currentHR : null
                    });
                }
                return data;
            }
        } catch (e) {
            console.warn("Chart data generation error:", e);
        }

        const duration = Number(cardioData?.stats?.duration) || 600;
        const points = 15;
        const interval = duration / (points - 1);
        return Array.from({ length: points }, (_, i) => ({
            time: Math.round(i * interval),
            pace: 330 + (Math.sin(i) * 20),
            heartRate: 145 + (Math.cos(i) * 5)
        }));
    }, [cardioData]);

    // 🟢 Performance 圖（圖四重做）：X 軸=公里、配速 + 爬升 雙曲線、面積填滿。
    //    優先用 splits（每公里一點，最乾淨）；無 splits 才退回 stream 依距離分桶。
    const kmChartData = useMemo(() => {
        try {
            const stream = cardioData?.stream_data || {};
            const splits = cardioData?.stats?.splits || cardioData?.splits || [];
            const totalKm = Number(cardioData?.stats?.distance) || 0;

            // 由 elevation 串流抓「某比例距離」的海拔（用索引比例近似）
            const elevArr = (stream.elevation || []).filter((v) => Number.isFinite(v));
            const elevAt = (frac) => {
                if (elevArr.length === 0) return null;
                const idx = Math.min(elevArr.length - 1, Math.max(0, Math.round(frac * (elevArr.length - 1))));
                return Math.round(elevArr[idx]);
            };
            // 基準海拔（用最小值當 0），讓爬升曲線從 0 起跳比較直觀
            const elevBase = elevArr.length ? Math.min(...elevArr) : 0;

            if (splits.length >= 2) {
                const n = splits.length;
                return splits.map((s, i) => {
                    const km = Number(s.km ?? s.split_index ?? i + 1);
                    const paceSec = Number(s.pace ?? s.avg_pace ?? s.avgPace) || null;
                    const frac = n > 1 ? i / (n - 1) : 0;
                    const elev = elevAt(frac);
                    return {
                        km,
                        pace: paceSec && paceSec > 0 && paceSec < 1200 ? paceSec : null,
                        elevation: elev != null ? elev - elevBase : null,
                    };
                });
            }

            // 退回：用 pace 串流依距離均分（沒有 splits 時）
            const paceArr = (stream.pace || []).filter((p) => Number.isFinite(p) && p > 0 && p < 1200);
            if (paceArr.length >= 2 && totalKm > 0) {
                const buckets = Math.max(2, Math.min(Math.ceil(totalKm * 2), 40)); // 每 0.5km 一點，上限 40
                const out = [];
                for (let b = 0; b < buckets; b++) {
                    const frac = b / (buckets - 1);
                    const pIdx = Math.round(frac * (paceArr.length - 1));
                    const elev = elevAt(frac);
                    out.push({
                        km: Number((frac * totalKm).toFixed(1)),
                        pace: paceArr[pIdx] || null,
                        elevation: elev != null ? elev - elevBase : null,
                    });
                }
                return out;
            }
        } catch (e) {
            console.warn('kmChartData error:', e);
        }
        return [];
    }, [cardioData]);

    const kmChartHasElevation = useMemo(
        () => kmChartData.some((d) => d.elevation != null && d.elevation > 0),
        [kmChartData]
    );

    // 🔥 PERFORMANCE: useMemo for Zone Calculation
    const zonePercents = useMemo(() => {
        const stats = cardioData?.stats?.zoneStats || {};

        const ZONE_MAP = {
            // 🔴 Fix(zone-key)：明確涵蓋 Apple Watch 送來的「Warm Up」(空格) 與小寫變體，
            //    不再靠 fallback 碰巧對到，避免熱身區秒數被歸錯。
            '1': 'Warm-up', 'warmup': 'Warm-up', 'warm-up': 'Warm-up', 'Warm-up': 'Warm-up',
            'warm up': 'Warm-up', 'Warm Up': 'Warm-up', 'WARM UP': 'Warm-up',
            'Recovery': 'Warm-up',
            '2': 'Fat Burn', 'fatburn': 'Fat Burn', 'fat burn': 'Fat Burn', 'Fat Burn': 'Fat Burn',
            '3': 'Aerobic', 'aerobic': 'Aerobic', 'Aerobic': 'Aerobic',
            '4': 'Anaerobic', 'anaerobic': 'Anaerobic', 'Anaerobic': 'Anaerobic',
            '5': 'EXTREME', 'extreme': 'EXTREME', 'Extreme': 'EXTREME', 'EXTREME': 'EXTREME'
        };

        let standardizedStats = {
            'Warm-up': 0, 'Fat Burn': 0, 'Aerobic': 0, 'Anaerobic': 0, 'EXTREME': 0
        };

        let totalSeconds = 0;

        Object.keys(stats).forEach(key => {
            const val = Number(stats[key]) || 0;
            totalSeconds += val;
            let mappedKey = ZONE_MAP[key] || ZONE_MAP[key.toLowerCase()] || 'Warm-up';
            if (standardizedStats[key] !== undefined) mappedKey = key;
            if (standardizedStats[mappedKey] !== undefined) {
                standardizedStats[mappedKey] += val;
            }
        });

        if (totalSeconds === 0) return { ...standardizedStats, total: 0 };

        return {
            'Warm-up': (standardizedStats['Warm-up'] / totalSeconds) * 100,
            'Fat Burn': (standardizedStats['Fat Burn'] / totalSeconds) * 100,
            'Aerobic': (standardizedStats['Aerobic'] / totalSeconds) * 100,
            'Anaerobic': (standardizedStats['Anaerobic'] / totalSeconds) * 100,
            'EXTREME': (standardizedStats['EXTREME'] / totalSeconds) * 100,
            total: totalSeconds
        };
    }, [cardioData]);

    if (loading && !cardioData) {
        return (
            <div className="min-h-[100dvh] flex items-center justify-center p-6 relative bg-transparent">
                {/* Fallback Background while loading */}
                <div className="fixed inset-0 z-[-1]" style={{ backgroundImage: 'url("/images/(9) Instagram.jpg")', backgroundSize: '100% 100%' }} />
                <div className="animate-pulse flex flex-col items-center">
                    <Activity size={32} style={{ color: PALETTE.accentYellow }} className="mb-4" />
                    <span className="text-sm font-bold tracking-widest uppercase opacity-40 ml-2">Analyzing Run Performance...</span>
                </div>
            </div>
        );
    }

    // 🔥 CRITICAL RENDER GUARD: If we have no stats, show minimal error instead of black screen
    if (!cardioData || !cardioData.stats) {
        return (
            <div className="min-h-[100dvh] flex flex-col items-center justify-center p-8 bg-transparent text-white relative">
                <div className="fixed inset-0 z-[-1]" style={{ backgroundImage: 'url("/images/(9) Instagram.jpg")', backgroundSize: '100% 100%', opacity: 0.3 }} />
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-6">
                    <Activity size={32} className="text-white/20" />
                </div>
                <h3 className="text-xl font-bold mb-2">Analysis Deferred</h3>
                <p className="text-white/40 text-center text-sm mb-8">Not enough data was recorded for a full physiological breakdown.</p>
                <motion.button {...pressProps('icon')}
 onClick={onClose}
 className="px-8 py-3 rounded-full bg-white text-black font-black text-sm uppercase tracking-widest"
 >
                    Return to Tracker
                </motion.button>
            </div>
        );
    }

    // Helper for Dynamic Greeting
    const getRunTitle = () => {
        const date = new Date(cardioData.timestamp || new Date());
        const hour = date.getHours();

        const morningTitles = ["Morning Ritual", "Dawn Patrol", "Sunrise Stride"];
        const middayTitles = ["Solar Session", "Midday Grind", "Power Break"];
        const afternoonTitles = ["Golden Hour", "Sunset Chase", "Dusk Dash", "Sundown Session", "Magic Hour"]; // 16-18 only
        const eveningTitles = ["Night Shift", "After Hours", "City Lights", "Evening Flow"]; // 18-04

        // Simple hash function to pick a consistent title for the same timestamp based on days + hours
        const pick = (arr) => {
            const index = (date.getDate() + hour) % arr.length;
            return arr[index].toUpperCase();
        };

        if (hour >= 5 && hour < 11) return pick(morningTitles);
        if (hour >= 11 && hour < 16) return pick(middayTitles);
        if (hour >= 16 && hour < 18) return pick(afternoonTitles);

        return pick(eveningTitles);
    };

    return (
        <div className="notes-wrapper relative" ref={reportRef}>
            <style>{`
                .notes-wrapper {
                    padding: 24px;
                    padding-top: max(env(safe-area-inset-top), 40px);
                    min-height: 100dvh;
                    width: 100%;
                    box-sizing: border-box;
                    color: ${PALETTE.deepBlack};
                    font-family: sans-serif;
                    background-color: ${PALETTE.paper};
                }
                /* Font Import - MOVED TO index.css for performance */
                
                .font-atomic { font-family: var(--font-body); }
                .notes-header {
                    margin-bottom: 24px;
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-end;
                }
                .notes-title {
                    font-weight: 400;
                    margin: 0;
                    color: ${PALETTE.deepBlack};
                }
                .notes-subtitle {
                    font-size: 14px;
                    font-weight: 600;
                    letter-spacing: 0.05em;
                    color: ${PALETTE.textSecondary};
                    margin-bottom: 4px;
                }
                .notes-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 12px;
                    padding-bottom: 100px;
                }
                .full-width-card {
                    grid-column: span 2;
                }
                .note-card {
                    border-radius: 28px;
                    padding: 28px;
                    position: relative;
                    overflow: hidden;
                    transition: transform 0.2s;
                    border: 1px solid rgba(0,0,0,0.05);
                }
                /* Figure 5 Color Strategy Mappings */
                .note-yellow {
                    background-color: ${PALETTE.stone};
                    color: ${PALETTE.deepBlack};
                }
                .note-orange {
                    background-color: ${PALETTE.coral};
                    color: ${PALETTE.deepBlack};
                }
                .note-cream {
                    background-color: ${PALETTE.paper};
                    color: ${PALETTE.deepBlack};
                    border: 1px solid ${PALETTE.pebble};
                }
                .note-green {
                     background-color: ${PALETTE.stone};
                     color: ${PALETTE.deepBlack};
                }
                /* Buttons */
                .btn-primary-orange {
                    background-color: ${PALETTE.coral};
                    color: white;
                    box-shadow: 0 4px 15px rgba(249, 92, 75, 0.3);
                    border: none;
                }
                .note-label { 
                    font-size: 8px; 
                    font-weight: 800; 
                    text-transform: uppercase; 
                    letter-spacing: 0.15em; 
                    opacity: 0.4; 
                    display: flex; 
                    align-items: center; 
                    gap: 4px;
                    margin-bottom: 4px;
                }
                .note-value-unit {
                    font-size: 9px;
                    font-weight: 700;
                    text-transform: uppercase;
                    opacity: 0.3;
                    margin-left: 2px;
                }
                /* Effort Card CSS (Redesigned) */
                .effort-card-container {
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                    padding: 8px 4px;
                }
                .card-main-content {
                    background: transparent; /* Box removed */
                    padding: 0;
                }
                .card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-end;
                    margin-bottom: 24px;
                    border-bottom: 1px solid rgba(0,0,0,0.05);
                    padding-bottom: 12px;
                }
                .card-title {
                    font-size: 22px;
                    font-weight: 900;
                    margin: 0;
                    letter-spacing: -0.03em;
                    /* Swiss Sans-serif：明確指定 system sans，避免被全域 Serif 影響 */
                    font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, sans-serif;
                    text-transform: none;
                }
                .main-metric-value {
                    font-size: 42px;
                    font-weight: 900;
                    line-height: 0.8;
                    letter-spacing: -2px;
                    color: ${PALETTE.coral};
                    font-feature-settings: 'tnum';
                    font-variant-numeric: tabular-nums;
                }
                .stacked-bar {
                    height: 8px;
                    border-radius: 4px;
                    display: flex;
                    overflow: hidden;
                    margin-bottom: 24px;
                    background: rgba(0,0,0,0.03);
                    gap: 1.5px; /* Segmented Feel */
                }
                .bar-segment { height: 100%; border-radius: 2px; }
                /* 👇 修改這裡的顏色 👇 */
                .bar-segment.recovery, .legend-dot.recovery { background-color: #FDD835; }
                .bar-segment.fat-burn, .legend-dot.fat-burn { background-color: #8BC34A; }
                .bar-segment.aerobic, .legend-dot.aerobic { background-color: #FF9800; }
                .bar-segment.anaerobic, .legend-dot.anaerobic { background-color: #F06292; }
                .bar-segment.extreme, .legend-dot.extreme { background-color: #5C6BC0; }
                .legend-label { font-size: 8px; font-weight: 700; color: ${PALETTE.deepBlack}; opacity: 0.5; }
                .legend-value { font-size: 10px; font-weight: 800; color: ${PALETTE.deepBlack}; }
                
                .card-footer {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 16px;
                    padding: 16px 0 0 0;
                    border-top: 1px solid rgba(0,0,0,0.05);
                }
                .footer-stat { 
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .footer-label { font-size: 9px; font-weight: 700; color: ${PALETTE.deepBlack}; opacity: 0.4; text-transform: uppercase; margin-bottom: 2px; }
                .footer-value { font-size: 14px; font-weight: 800; color: ${PALETTE.deepBlack}; }

                /* Override legacy backgrounds for inner card sections */
                .card-main-content, .card-footer, .effort-card-container { 
                    background-color: transparent !important; 
                    border: none !important;
                    box-shadow: none !important;
                }
            `}</style>

            {/* Recovery Timer — Sticky top thin bar：不擋畫面、用戶可邊看數據邊等 */}
            {isRecovering && recoveryTimer > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                    className="sticky z-30 w-full flex items-center justify-between px-5"
                    style={{
                        top: 'max(env(safe-area-inset-top), 0px)',
                        background: C.coral,
                        color: C.white,
                        height: 36,
                        fontFamily: 'var(--font-body)',
                        boxShadow: '0 4px 12px rgba(249, 92, 75, 0.18)',
                        marginBottom: 20,
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
                        {currentHR > 0 && (
                            <span className="text-[11px] font-black uppercase tracking-[0.18em] tabular-nums opacity-80 ml-1">
                                · {Math.round(currentHR)} bpm
                            </span>
                        )}
                    </div>
                    <motion.button {...pressProps('row')}
 onClick={skipRecovery}
 className="text-[11px] font-black uppercase tracking-[0.22em] text-white/75 hover:text-white active:opacity-60 transition-opacity"
 >
                        Skip
                    </motion.button>
                </motion.div>
            )}

            {/* 2. Main Bento Grid — 即使 Recovery 中也顯示，恢復用 sticky bar 提示而非擋畫面 */}
            <div className="notes-grid">

                {/* 🏆 真實破紀錄橫幅 — 只有確實打破個人紀錄才出現（非假資料）。
                      Liquid Glass 材質：pebble 半透明底 + 背景模糊 + 頂部 specular 高光 + 內緣折射。 */}
                {newRecords.length > 0 && (() => {
                    const isFirst = newRecords[0].type === 'FIRST';
                    return (
                    <motion.button
                        type="button"
                        onClick={() => setShowRecordsModal(true)}
                        className="full-width-card relative overflow-hidden text-left w-full active:scale-[0.99] transition-transform"
                        initial={{ opacity: 0, y: 10, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 220, damping: 20 }}
                        style={{
                            borderRadius: 24,
                            padding: '16px 18px',
                            // 🟢 恢復中(sticky 恢復條佔頂部空間)時，破紀錄卡多留空間避免與恢復條擠在一起
                            marginTop: (isRecovering && recoveryTimer > 0) ? 52 : 8,
                            marginBottom: 14,
                            scrollMarginTop: 60,
                            cursor: 'pointer',
                            // 🟢 11.jpeg 鈦金屬拉絲質感底
                            background: 'url(/desktop/11.jpeg) center/cover',
                            border: '1px solid rgba(255,255,255,0.3)',
                            boxShadow: '0 8px 20px -4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
                        }}
                    >
                        {/* 頂部高光弧 */}
                        <span aria-hidden style={{ position: 'absolute', top: 0, left: '6%', right: '6%', height: '46%', borderRadius: '0 0 50% 50%', pointerEvents: 'none', background: 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.05) 55%, transparent 80%)' }} />
                        <div className="flex items-center gap-3 relative">
                            {/* 左側 coral 細色條 */}
                            <div className="self-stretch shrink-0" style={{ width: 3, borderRadius: 2, background: PALETTE.coral, minHeight: 44 }} />
                            {/* 獎盃 — coral */}
                            <div className="flex items-center justify-center shrink-0" style={{ width: 34, height: 34 }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={PALETTE.coral} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                                    <path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                                    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                                </svg>
                            </div>
                            <div className="min-w-0 flex-1">
                                {/* 標題 — coral */}
                                <div className="text-[12px] font-black tracking-[0.22em] mb-1" style={{ color: PALETTE.coral }}>
                                    {isFirst ? '首次紀錄' : `恭喜破紀錄 ×${newRecords.length}`}
                                </div>
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                                    {/* 🖤 鈦金屬銀底 → 文字用黑色才有對比（原本米白在銀底上看不清） */}
                                    {isFirst ? (
                                        <span className="text-[14px] font-black" style={{ color: '#161415' }}>{newRecords[0].detail}</span>
                                    ) : (
                                        newRecords.slice(0, 3).map((r) => (
                                            <span key={r.type} className="text-[13px] font-black" style={{ color: '#161415' }}>
                                                {r.label} <span className="tabular-nums" style={{ color: PALETTE.coral }}>{r.detail}</span>
                                            </span>
                                        ))
                                    )}
                                    {newRecords.length > 3 && (
                                        <span className="text-[12px] font-bold" style={{ color: 'rgba(22,20,21,0.5)' }}>+{newRecords.length - 3} 項</span>
                                    )}
                                </div>
                            </div>
                            <ChevronRight size={18} className="shrink-0" style={{ color: 'rgba(22,20,21,0.45)' }} />
                        </div>
                    </motion.button>
                    );
                })()}

                {/* 🏆 破紀錄詳情彈窗 — 瑞士極簡 + 微玻璃 + PR 檔案（歷年變化） */}
                <RecordsDetailModal
                    isOpen={showRecordsModal}
                    onClose={() => setShowRecordsModal(false)}
                    records={newRecords}
                    stats={cardioData?.stats}
                    rankings={prRankings}
                    timeline={prTimeline}
                    onOpenProfile={() => { setShowRecordsModal(false); navigate('/pr-profile'); }}
                />

                {/* 🎉 Hero Header Block (Minimalist Editorial) */}
                <div className="w-full !mb-6" style={{ padding: '0 8px', border: 'none' }}>
                    <div className="flex justify-between items-start mb-6">
                        <motion.button {...pressProps('icon')}
 type="button"
 onClick={onClose}
 aria-label="返回"
 className="relative z-[70] p-3.5 rounded-full bg-black/5 -ml-2 pointer-events-auto"
 style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
 >
                            <ArrowLeft size={22} className="text-black pointer-events-none" />
                        </motion.button>
                    </div>

                    {/* Swiss Editorial Hero — asymmetric, large display, dash motifs */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                        className="flex flex-col"
                    >
                        {/* 頂部 issue line — 雜誌封面感 */}
                        <div className="flex items-center justify-between mb-5">
                            <span className="text-[11px] font-black uppercase tracking-[0.32em] text-black/40">{isBasicSport ? sportLabel : '跑步結算'}</span>
                            <span className="text-[11px] font-black uppercase tracking-[0.32em] text-black/40">No. {String(new Date().getDate()).padStart(2, '0')}/{String(new Date().getMonth() + 1).padStart(2, '0')}</span>
                        </div>
                        {/* 大標 — Swiss display：tight letter-spacing + black weight + 適度大小（不要 oversized） */}
                        <h1
                            className="notes-title !text-black !mb-3"
                            style={{
                                fontSize: 'clamp(2.4rem, 9vw, 3.4rem)',
                                fontWeight: 900,
                                lineHeight: '0.95',
                                letterSpacing: '-0.045em',
                                textTransform: 'uppercase',
                                fontFamily: 'var(--font-body)',
                            }}
                        >
                            {getRunTitle()}
                        </h1>
                        {/* 副標 — date + 風格分類 */}
                        <div className="flex items-baseline gap-3 mt-1">
                            <p className="text-[11px] font-black text-black/55 uppercase tracking-[0.25em]">
                                {formatDate(cardioData.timestamp || new Date().toISOString()).split('●')[0]}
                            </p>
                            <span className="text-[11px] text-black/25">/</span>
                            <p className="text-[11px] font-bold text-black/40 uppercase tracking-[0.2em]">
                                {hasMeaningfulData ? 'Logged' : 'Idle'}
                            </p>
                        </div>
                    </motion.div>
                </div>

                {/* A. Map Card (With Strava-like PR Markers)
                    BUG FIX v2: 用單一 IIFE 統一管理，cleanRoute 是唯一資料來源
                    沒有有效 route 時直接 return placeholder，不掛載 Leaflet */}
                {(() => {
                    const TAIPEI_FALLBACK = [25.033, 121.565];
                    const toLatLng = (p) => {
                        if (!p) return null;
                        const lat = Array.isArray(p) ? Number(p[0]) : Number(p?.lat);
                        const lng = Array.isArray(p) ? Number(p[1]) : Number(p?.lng);
                        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
                        return [lat, lng];
                    };
                    const cleanRoute = (cardioData.route || []).map(toLatLng).filter(Boolean);

                    // 空狀態：完全不掛載 MapContainer
                    if (cleanRoute.length === 0) {
                        return (
                            <div className="note-card full-width-card" style={{ height: '180px', padding: 0, overflow: 'hidden', background: 'linear-gradient(135deg, #F5EFE6 0%, #EAE3D2 100%)', border: '1px dashed rgba(0,0,0,0.12)', boxShadow: 'none' }}>
                                <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="text-black/25">
                                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                        <circle cx="12" cy="10" r="3" />
                                    </svg>
                                    <span className="text-[11px] font-black uppercase tracking-[0.22em] text-black/35">No GPS Trace</span>
                                </div>
                            </div>
                        );
                    }

                    // 🥇 v2：地圖不再逐 0.5/1 公里放里程牌（視覺洗版），
                    //    只標「特殊點」— 本次在各標準距離(1K/3K/5K/10K/半馬)的配速
                    //    若進入歷史前三，就在該最佳努力段終點放 金/銀/銅 獎牌標記。
                    let markers = [];
                    if (cleanRoute.length > 5) {
                        const s = cardioData?.stats || {};
                        const rankings = computeDistanceRankings(
                            {
                                distance: Number(s.distance) || 0,
                                duration: Number(s.duration) || 0,
                                pace: Number(s.pace) || 0,
                                splits: s.splits || [],
                            },
                            runHistory,
                        );
                        markers = rankings
                            .filter((r) => r.rank && r.historyCount > 0) // 至少有一筆歷史可比才有「名次」意義
                            .map((r) => {
                                const idx = Math.min(
                                    cleanRoute.length - 1,
                                    Math.max(0, Math.round(r.routeFraction * (cleanRoute.length - 1)))
                                );
                                return {
                                    kind: 'medal',
                                    rank: r.rank, // 1|2|3
                                    key: r.key,
                                    title: r.rank === 1 ? `最快 ${r.label}` : `第 ${r.rank} 快 ${r.label}`,
                                    subLabel: r.rank === 1 ? '有史以來' : `${formatPaceSec(r.paceSec)}/km`,
                                    coordinates: { lat: cleanRoute[idx][0], lng: cleanRoute[idx][1] },
                                };
                            });
                    }
                    // 後端算好的 PR 標記（非距離牌）作為補充；距離牌(kind==='distance')一律不放
                    const realMarkers = (cardioData.deepData?.achievements?.milestone_markers || [])
                        .filter((m) => m.kind !== 'distance' && m.rank)
                        .map((m) => {
                            const mLat = Number(m?.coordinates?.lat);
                            const mLng = Number(m?.coordinates?.lng);
                            if (!Number.isFinite(mLat) || !Number.isFinite(mLng)) return null;
                            return { ...m, coordinates: { lat: mLat, lng: mLng } };
                        })
                        .filter(Boolean);
                    if (markers.length === 0) markers = realMarkers;

                    const medalHtml = (marker) => {
                        const medalImg = medalSrc(marker.rank);
                        const titleTxt = marker.title || marker.label || '個人紀錄';
                        const subTxt = marker.subLabel || '';
                        return `
                                    <div style="display:flex;align-items:center;background:rgba(255,255,255,0.96);backdrop-filter:blur(8px);border:1px solid rgba(0,0,0,0.08);border-radius:9999px;padding:4px 10px 4px 5px;box-shadow:0 4px 12px rgba(0,0,0,0.16);white-space:nowrap;gap:6px;transform:translate(-50%,-100%);margin-top:-10px;">
                                        <img src="${medalImg}" style="width:20px;height:20px;object-fit:contain;" alt="medal"/>
                                        <div style="display:flex;flex-direction:column;justify-content:center;">
                                            <div style="font-size:10px;font-weight:900;color:#161415;line-height:1;">${titleTxt}</div>
                                            ${subTxt ? `<div style="font-size:8px;font-weight:700;color:rgba(22,20,21,0.5);line-height:1;margin-top:2px;" class="tabular-nums">${subTxt}</div>` : ''}
                                        </div>
                                    </div>`;
                    };

                    /* 先出靜態圖（Strava 的作法）：Apple Maps 快照幾乎立即出來、而且是視網膜解析度。
                       要拖曳、縮放時點一下，才載入 Leaflet 互動地圖。網頁版沒有原生快照 → 直接互動地圖。 */
                    const snapshotCard = !routeMapLive ? (
                        <div className="note-card note-yellow full-width-card" style={{ height: '320px', padding: 0, overflow: 'hidden' }}>
                            <div className="absolute inset-0 z-0">
                                <RouteSnapshotMap
                                    route={cleanRoute}
                                    color={PALETTE.coral}
                                    padding={36}
                                    onTap={() => setRouteMapLive(true)}
                                    markers={markers.map((m, i) => ({
                                        key: `medal-${m.key || i}`,
                                        lat: m.coordinates.lat, lng: m.coordinates.lng,
                                        render: () => <div dangerouslySetInnerHTML={{ __html: medalHtml(m) }} />,
                                    }))}
                                    onUnavailable={() => setRouteMapLive(true)}
                                    fallback={() => null}
                                />
                            </div>
                            <div className="relative z-10 p-5 h-full flex flex-col justify-end pointer-events-none">
                                <div className="bg-black/10 backdrop-blur-sm rounded-full px-4 py-2 self-start flex items-center gap-2">
                                    <MapPin size={12} className="text-black" />
                                    <span className="text-xs font-black text-black tracking-widest">ROUTE MAP · 點一下可拖曳</span>
                                </div>
                            </div>
                        </div>
                    ) : null;
                    if (snapshotCard && canSnapshotRoute()) return snapshotCard;

                    return (
                <div className="note-card note-yellow full-width-card" style={{ height: '320px', padding: 0, overflow: 'hidden' }}>
                    <div className="absolute inset-0 z-0" style={{ backgroundColor: '#F5EFE6' }}>
                        <MapContainer
                            /* 一開始就對準整條路線，不要先停在起點 z15 再跳 */
                            bounds={L.latLngBounds(cleanRoute)}
                            boundsOptions={{ padding: [36, 36], maxZoom: 16 }}
                            zoomControl={false}
                            dragging={true}
                            className={`${mapThemeClass('light')} w-full h-full`}
                            style={{ background: '#F5EFE6' }}
                        >
                            <MapAutoResize />
                            <DrvnTileLayer style="minimal" />
                            <Polyline
                                positions={cleanRoute}
                                color={PALETTE.coral} weight={6} opacity={0.9}
                            />

                            {/* 🥇 特殊點標記 — 只放「歷史名次」獎牌（金/銀/銅 icon 膠囊），
                                不再逐公里放里程牌，地圖乾淨、看得出哪裡跑出名堂 */}
                            {markers.map((marker, idx) => {
                                const medalImg = medalSrc(marker.rank);
                                const titleTxt = marker.title || marker.label || '個人紀錄';
                                const subTxt = marker.subLabel || '';
                                const markerHtml = `
                                    <div style="display:flex;align-items:center;background:rgba(255,255,255,0.96);backdrop-filter:blur(8px);border:1px solid rgba(0,0,0,0.08);border-radius:9999px;padding:4px 10px 4px 5px;box-shadow:0 4px 12px rgba(0,0,0,0.16);white-space:nowrap;gap:6px;transform:translate(-50%,-100%);margin-top:-10px;">
                                        <img src="${medalImg}" style="width:20px;height:20px;object-fit:contain;" alt="medal"/>
                                        <div style="display:flex;flex-direction:column;justify-content:center;">
                                            <div style="font-size:10px;font-weight:900;color:#161415;line-height:1;">${titleTxt}</div>
                                            ${subTxt ? `<div style="font-size:8px;font-weight:700;color:rgba(22,20,21,0.5);line-height:1;margin-top:2px;" class="tabular-nums">${subTxt}</div>` : ''}
                                        </div>
                                    </div>`;
                                return (
                                    <Marker
                                        key={`medal-${marker.key || idx}`}
                                        position={[marker.coordinates.lat, marker.coordinates.lng]}
                                        zIndexOffset={1000}
                                        icon={L.divIcon({ className: '', html: markerHtml, iconSize: [0, 0], iconAnchor: [0, 0] })}
                                    />
                                );
                            })}
                            <ResizeMap />
                        </MapContainer>
                    </div>
                    <div className="relative z-10 p-5 h-full flex flex-col justify-end pointer-events-none">
                        <div className="bg-black/10 backdrop-blur-sm rounded-full px-4 py-2 self-start flex items-center gap-2 pointer-events-auto">
                            <MapPin size={12} className="text-black" />
                            <span className="text-xs font-black text-black tracking-widest">ROUTE MAP</span>
                        </div>
                    </div>
                </div>
                    );
                })()}


                {/* B. Swiss Editorial Stats — 完全重做：
                      - Anti-Card Overuse (Rule 4)：拿掉橘紅卡，純用 divide-y / 留白
                      - Asymmetric Layout (Rule 3)：4 個 metric 不再強制 grid，而是 editorial 排版
                      - 0 值降階為 dash（—）並降 opacity，避免「0.00 / 00:00」當主視覺
                      - 每個 metric 用 framer-motion staggered reveal，視覺有層次
                      - 配色：移除橘紅主色，回到中性 zinc + 單一 coral accent 在最強指標 */}
                {(() => {
                    const dist = Number(cardioData?.stats?.distance) || 0;
                    const dur = Number(cardioData?.stats?.duration) || 0;
                    const cal = Number(cardioData?.stats?.calories) || 0;
                    const pace = Number(cardioData?.stats?.avgPace || cardioData?.stats?.pace) || 0;

                    const fmt = (val, kind) => {
                        if (kind === 'dist') return dist > 0 ? dist.toFixed(2) : '—';
                        if (kind === 'dur') return dur >= 1 ? formatTime(dur) : '—';
                        if (kind === 'cal') return cal >= 1 ? Math.round(cal) : '—';
                        if (kind === 'pace') return pace > 0 ? formatPace(pace) : '—';
                        return '—';
                    };

                    // 🔥 手錶沒送 kcal 時 tracker 會以體重×距離推算並標記 calories_estimated
                    const calEstimated = !!cardioData?.stats?.calories_estimated;

                    /* 🦶 步頻 / 步幅（使用者要求：結算頁要看得到，跑步中也顯示在心率旁）
                       ── 誠實原則：只有「逐秒真的量到」才顯示數字。
                          整條 cadence 串流都是同一個值 ＝ 感測來源沒在動作偵測，
                          那是被塞出來的常數，拿來當步頻會誤導（深度分析頁同一套判定）。 */
                    const cadArr = (cardioData?.stream_data?.cadence || []).map(Number).filter((v) => v > 0);
                    const cadFlat = cadArr.length > 3 && new Set(cadArr.map((v) => Math.round(v))).size === 1;
                    const cadReal = cadArr.length > 3 && !cadFlat;
                    const avgCad = Number(cardioData?.stats?.avgCadence) > 0
                        ? Math.round(Number(cardioData.stats.avgCadence))
                        : (cadArr.length ? Math.round(cadArr.reduce((a, b) => a + b, 0) / cadArr.length) : 0);
                    const avgStr = Number(cardioData?.stats?.avgStride) || 0;
                    const cadOK = cadReal && avgCad > 0;
                    const strOK = cadReal && avgStr > 0;

                    const metrics = [
                        { id: 'dist', label: 'Distance', unit: 'km', value: fmt(dist, 'dist'), active: dist > 0 },
                        { id: 'dur', label: 'Duration', unit: '', value: fmt(dur, 'dur'), active: dur >= 1 },
                        { id: 'pace', label: 'Avg Pace', unit: '/km', value: fmt(pace, 'pace'), active: pace > 0 },
                        // 🩹 用詞統一：重訓結算頁標「預估」，這裡原本標「推算」—— 同一件事兩個詞
                        { id: 'cal', label: calEstimated ? 'Calories · 預估' : 'Calories', unit: 'kcal', value: fmt(cal, 'cal'), active: cal >= 1 },
                        // 🩹 這兩格原本寫成「Cadence 步頻」「Stride 步幅」，同一個 2x2 網格裡
                        //    其餘四格都是純英文 kicker，只有這兩格夾中文 —— 統一成純英文。
                        { id: 'cad', label: 'Cadence', unit: 'spm', value: cadOK ? avgCad : '—', active: cadOK },
                        { id: 'str', label: 'Stride', unit: 'm', value: strOK ? avgStr.toFixed(2) : '—', active: strOK },
                    ];
                    const gaitNote = cadOK ? null
                        : cadFlat ? `步頻整段回報同一個數值（${Math.round(cadArr[0])} spm）— 感測來源沒有逐秒量測，本次不採計。`
                        : '這趟沒有取得逐秒步頻。配戴 Apple Watch，或在「設定 → 隱私 → 動作與健身」允許本 App 後戶外跑，即可記錄步頻與步幅。';

                    return (
                        <motion.div
                            className="w-full"
                            initial="hidden"
                            animate="show"
                            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } } }}
                            style={{ padding: '8px 8px 24px 8px', gridColumn: '1 / -1' }}
                        >
                            {/* Editorial Hero — Asymmetric */}
                            <motion.div
                                variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } } }}
                                className="flex items-baseline gap-3 mb-1"
                            >
                                <span className="text-[11px] font-black uppercase tracking-[0.28em] text-black/40">— Overview</span>
                                {!hasMeaningfulData && (
                                    <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#F95C4B]/85">No Activity</span>
                                )}
                            </motion.div>

                            {/* Editorial Metric — 2x2 Swiss grid，左右上下都有細線分隔 */}
                            <div className="grid grid-cols-2 mt-2" style={{ borderTop: '1px solid rgba(0,0,0,0.10)' }}>
                                {metrics.map((m, i) => (
                                    <motion.div
                                        key={m.id}
                                        variants={{
                                            hidden: { opacity: 0, y: 6 },
                                            show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } }
                                        }}
                                        className="flex flex-col justify-between py-5 px-1"
                                        style={{
                                            opacity: m.active ? 1 : 0.45,
                                            // 右側 column 加左邊框，下方 row 加上邊框 — 形成 2x2 cross divider
                                            borderLeft: i % 2 === 1 ? '1px solid rgba(0,0,0,0.10)' : 'none',
                                            // 最後一列不畫下邊框（原本寫死 i<2，加了步頻/步幅後會在中間斷線）
                                            borderBottom: i < metrics.length - 2 ? '1px solid rgba(0,0,0,0.10)' : 'none',
                                            paddingLeft: i % 2 === 1 ? '18px' : '4px',
                                        }}
                                    >
                                        <span className="text-[11px] font-black uppercase tracking-[0.22em] text-black/55 mb-3">
                                            {m.label}
                                        </span>
                                        <div className="flex items-baseline gap-1.5">
                                            <span
                                                className="text-[36px] font-black leading-none tabular-nums tracking-tight share-tech-mono"
                                                style={{ color: m.active ? (i === 0 ? C.coral : C.ink) : C.ink }}
                                            >
                                                {m.value}
                                            </span>
                                            {m.unit && (
                                                <span className="text-[11px] font-bold uppercase tracking-widest text-black/40 ml-0.5">{m.unit}</span>
                                            )}
                                        </div>
                                    </motion.div>
                                ))}
                            </div>

                            {/* 步頻/步幅取不到時說明原因，不讓使用者只看到兩個破折號 */}
                            {gaitNote && (
                                <p className="text-[11px] font-semibold leading-relaxed mt-3 px-1" style={{ color: 'rgba(22,20,21,0.42)' }}>
                                    {gaitNote}
                                </p>
                            )}

                            {/* 🩹 2026-08 稽核：計劃 vs 實跑。
                                以前排定的 10K 只跑了 2K，結算頁完全不會提 ——
                                使用者無從得知自己只完成了 20%。
                                只有這趟是照計劃磚跑的才顯示（自由跑沒有分母，不硬湊）。 */}
                            {planCompare && (
                                <motion.div
                                    variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } } }}
                                    className="mt-5 pt-4"
                                    style={{ borderTop: '1px solid rgba(0,0,0,0.10)' }}
                                >
                                    <div className="flex items-baseline justify-between mb-2.5">
                                        <span className="text-[12px] font-black tracking-[0.22em] text-black/55">
                                            計劃 vs 實跑
                                        </span>
                                        <span
                                            className="text-[13px] font-black tabular-nums"
                                            style={{ color: planCompare.done ? C.ink : C.coral }}
                                        >
                                            {planCompare.pct}%
                                        </span>
                                    </div>
                                    <div style={{ height: 6, borderRadius: 99, background: 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${Math.min(100, planCompare.pct)}%` }}
                                            transition={{ duration: 0.6, ease: 'easeOut' }}
                                            style={{
                                                height: '100%', borderRadius: 99,
                                                background: planCompare.done
                                                    ? 'linear-gradient(90deg, rgba(22,20,21,0.55), rgba(22,20,21,0.85))'
                                                    : 'linear-gradient(90deg, #FF7A6B, #D94030)',
                                            }}
                                        />
                                    </div>
                                    <p className="text-[11px] leading-relaxed text-black/45 mt-2.5">
                                        計劃 {planCompare.targetKm.toFixed(1)} 公里 · 實跑 {planCompare.actualKm.toFixed(2)} 公里
                                        {planCompare.done
                                            ? ' — 這堂算完成了。'
                                            : `　還差 ${(planCompare.targetKm - planCompare.actualKm).toFixed(2)} 公里才算完成，這次記為「部分完成」。`}
                                    </p>
                                </motion.div>
                            )}

                            {/* Footer note — 仿瑞士雜誌的小字 caption */}
                            {!hasMeaningfulData && (
                                <motion.p
                                    variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { delay: 0.3 } } }}
                                    className="text-[11px] text-black/35 leading-relaxed mt-6 max-w-[280px]"
                                >
                                    跑滿 10 秒以上、保持 GPS 開啟，數據會在這裡逐項補齊。
                                </motion.p>
                            )}
                        </motion.div>
                    );
                })()}

                {/* C. Coach Insight — 🟢 非跑步的基本運動略過教練深度分析 */}
                {!isBasicSport && (() => {
                    const adviceItems = hasMeaningfulData ? (generateEnhancedAdvice() || []) : [];
                    // 🟢 開場教練總評（引擎 opening）
                    let coachOpening = null;
                    let runIntel = null;
                    try {
                        const sessionForEngine = {
                            stats: cardioData.stats, splits: cardioData.stats?.splits,
                            splitsAnalysis, stream_data: cardioData.stream_data, deepData: cardioData.deepData,
                        };
                        coachOpening = hasMeaningfulData ? buildCoachReport(sessionForEngine).opening : null;
                        runIntel = hasMeaningfulData ? buildRunIntelligence(sessionForEngine, { priorRuns: runHistory }) : null;
                    } catch (e) { coachOpening = null; runIntel = null; }
                    const showSkeleton = !hasMeaningfulData;
                    const isLoadingInsights = hasMeaningfulData && !insights;

                    // Swiss editorial: 每個 advice type 映射為「單色」(用於左側 1px 條 + 標籤色)
                    const TYPE_ACCENT = {
                        'Warning':     C.coral,
                        'Achievement': '#C59D5F',
                        'Efficiency':  '#5A7A3A',
                        'Stamina':     '#3B82F6',
                        'Recovery':    '#8B5CF6',
                    };
                    const SWISS_FONT = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, sans-serif';

                    return (
                        <motion.div
                            className="w-full"
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: '-40px' }}
                            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                            style={{
                                padding: '24px 4px',
                                marginBottom: '20px',
                                borderTop: '1px solid rgba(0,0,0,0.10)',
                                gridColumn: '1 / -1',
                                fontFamily: SWISS_FONT,
                            }}
                        >
                            {/* Section header — issue line style */}
                            <div className="flex items-center justify-between mb-6 pb-3 border-b border-black/10">
                                <span className="text-[12px] font-black tracking-[0.28em] text-black/55">
                                    — 資深教練分析
                                </span>
                                <span className="text-[11px] font-black uppercase tracking-[0.28em] text-black/35 tabular-nums">
                                    DRVN COACH
                                </span>
                            </div>

                            {/* 🏆 DRVN Run Score 已移至 Deep Analysis 頁（RunningAnalysisMobile）——
                                結算頁只做「先鼓勵」：① 肯定 → ② 進步 → ③ 教練；打分留到深度分析才出現。 */}

                            {/* 🟢 Run Intelligence — 固定順序：① 肯定 → ② 進步 → ③ 教練(亮點/問題/趨勢/下一步) */}
                            {runIntel ? (
                                <div className="mb-7">
                                    {coachOpening?.level && (
                                        <div className="text-[11px] font-black uppercase tracking-[0.2em] mb-4" style={{ color: C.coral }}>{coachOpening.level}</div>
                                    )}

                                    {/* ① 肯定 · Validation（Emotion-aware） */}
                                    <div className="mb-5">
                                        <div className="text-[12px] font-black tracking-[0.04em] text-black/40 mb-1.5">肯定 · Validation</div>
                                        <p className="text-[14px] font-bold text-black leading-relaxed">{runIntel.validation}</p>
                                    </div>

                                    {/* ② 進步 · Progress（列點呈現：一點講一件事） */}
                                    <div className="mb-5 pl-3" style={{ borderLeft: `2px solid ${C.coral}` }}>
                                        <div className="text-[12px] font-black tracking-[0.04em] mb-1.5" style={{ color: C.coralDeep }}>進步 · Progress</div>
                                        {(Array.isArray(runIntel.progress_points) && runIntel.progress_points.length > 0
                                            ? runIntel.progress_points
                                            : [runIntel.progress]
                                        ).map((pt, pi) => (
                                            <div key={pi} className="flex items-start gap-2 mb-1.5">
                                                <span className="shrink-0 rounded-full" style={{ width: 5, height: 5, background: C.coral, marginTop: 7 }} />
                                                <p className="text-[13.5px] font-semibold text-black leading-relaxed flex-1">{pt}</p>
                                            </div>
                                        ))}
                                    </div>

                                    {/* ③ 教練 · Coach — 只放「長期趨勢 / 下一步」；
                                        「亮點 / 問題」不再在此重複，改由下方 ACHIEVEMENT/EFFICIENCY 大卡完整呈現
                                        （避免截圖四上下兩處講同一件事）。 */}
                                    <div>
                                        <div className="text-[12px] font-black tracking-[0.04em] text-black/40 mb-3">教練 · Coach</div>
                                        <div className="space-y-3">
                                            {[
                                                { k: '趨勢', v: runIntel.intelligence.trend, c: '#3B82F6' },
                                                { k: '下一步', v: runIntel.intelligence.next, c: '#161415' },
                                            ].map((row) => (
                                                <div key={row.k} className="flex items-start gap-3">
                                                    <span className="text-[11px] font-black shrink-0 mt-[2px] w-9" style={{ color: row.c }}>{row.k}</span>
                                                    <p className="text-[12.5px] text-black/75 leading-relaxed flex-1">{row.v}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : coachOpening && (
                                <div className="mb-6">
                                    <div className="text-[11px] font-black uppercase tracking-[0.2em] mb-2" style={{ color: C.coral }}>{coachOpening.level}</div>
                                    <p className="text-[13.5px] font-semibold text-black leading-relaxed mb-1.5">{coachOpening.summaryText}</p>
                                    <p className="text-[12px] font-bold" style={{ color: '#5A7A3A' }}>{coachOpening.bestText}</p>
                                </div>
                            )}

                            {/* Empty state */}
                            {showSkeleton && (
                                <div className="flex items-start gap-4">
                                    <div className="w-px self-stretch" style={{ background: 'rgba(0,0,0,0.20)', minHeight: 48 }} />
                                    <div className="flex-1 py-1">
                                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-black/45 mb-1.5">Waiting</p>
                                        <p className="text-[14px] font-bold text-black leading-snug mb-1.5">教練還沒收到足夠的訊號</p>
                                        <p className="text-[11px] text-black/50 leading-relaxed max-w-[320px]">完成下一次訓練後，這裡會依心率、配速與體感給出調整建議。</p>
                                    </div>
                                </div>
                            )}

                            {/* Loading skeleton — 純線條 shimmer，無圓角卡 */}
                            {isLoadingInsights && (
                                <div className="divide-y divide-black/10">
                                    {[0, 1, 2].map(i => (
                                        <motion.div
                                            key={`sk-${i}`}
                                            className="py-5 flex items-start gap-4 relative overflow-hidden"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: Math.min(i, 6) * 0.1 }}
                                        >
                                            <div className="w-px self-stretch" style={{ background: 'rgba(0,0,0,0.10)' }} />
                                            <div className="flex-1 space-y-2">
                                                <div className="h-2 w-20 rounded-sm" style={{ background: 'rgba(0,0,0,0.06)' }} />
                                                <div className="h-3 w-3/4 rounded-sm" style={{ background: 'rgba(0,0,0,0.08)' }} />
                                                <div className="h-2 w-full rounded-sm" style={{ background: 'rgba(0,0,0,0.05)' }} />
                                            </div>
                                            <motion.div
                                                className="absolute inset-0 pointer-events-none"
                                                style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%)' }}
                                                animate={{ x: ['-100%', '100%'] }}
                                                transition={{ duration: 1.6, repeat: Infinity, ease: 'linear', delay: Math.min(i, 6) * 0.2 }}
                                            />
                                        </motion.div>
                                    ))}
                                </div>
                            )}

                            {/* 真實建議 — Swiss editorial list:
                                  左側 1px 顏色條 (取代圓圈 icon)
                                  + uppercase tracking type 標籤
                                  + 黑字標題 + 灰字 body */}
                            {/* 💳 教練的逐項建議是完整跑步分析（會員）；肯定／進步／下一步（上面）永遠免費 */}
                            {!showSkeleton && !isLoadingInsights && adviceItems.length > 0 && !runFull && (
                                <MemberLockCard feature="runAnalysis" label={`看其餘 ${adviceItems.length} 項建議`} style={{ marginTop: 12 }} />
                            )}
                            {!showSkeleton && !isLoadingInsights && adviceItems.length > 0 && runFull && (
                                <motion.div
                                    className="divide-y divide-black/10"
                                    initial="hidden"
                                    animate="show"
                                    variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07 } } }}
                                >
                                    {adviceItems.map((item, idx) => {
                                        const accent = TYPE_ACCENT[item.type] || C.ink;
                                        return (
                                            <motion.div
                                                key={idx}
                                                variants={{
                                                    hidden: { opacity: 0, x: -8 },
                                                    show: { opacity: 1, x: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
                                                }}
                                                className="py-5 flex items-start gap-4 cursor-default"
                                            >
                                                {/* 左側顏色條 — 取代圓圈 icon，更編輯雜誌 */}
                                                <div
                                                    className="w-px self-stretch shrink-0"
                                                    style={{ background: accent, minHeight: 52, opacity: 0.85 }}
                                                />
                                                <div className="flex-1">
                                                    {/* Type 標籤 — uppercase tracking */}
                                                    <p
                                                        className="text-[11px] font-black uppercase tracking-[0.22em] mb-2"
                                                        style={{ color: accent }}
                                                    >
                                                        {item.type}
                                                    </p>
                                                    <h4 className="text-[15px] font-black text-black leading-snug mb-1.5" style={{ letterSpacing: '-0.01em' }}>
                                                        {item.title}
                                                    </h4>
                                                    <p className="text-[12px] text-black/55 font-medium leading-relaxed" style={{ whiteSpace: 'pre-line' }}>
                                                        {item.text}
                                                    </p>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </motion.div>
                            )}
                        </motion.div>
                    );
                })()}

                {/* C. Effort Analysis — 🟢 非跑步的基本運動略過努力深度分析；💳 心率區間與負荷是完整跑步分析（會員） */}
                {!isBasicSport && runFull && (
                <motion.div
                    className="w-full"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-40px' }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    style={{
                        marginBottom: '20px',
                        padding: '20px 8px 24px 8px',
                        borderTop: '1px solid rgba(0,0,0,0.10)',
                        gridColumn: '1 / -1',
                    }}
                >
                    <EffortDepthCard
                        deepData={cardioData.deepData}
                        score={cardioData.stats.score || 0}
                        duration={Number(cardioData.stats.duration) || 0}
                        streamData={cardioData.stream_data}
                        zoneStats={cardioData.stats.zoneStats}
                        hasMeaningfulData={hasMeaningfulData}
                        maxHR={userMaxHR}
                    />
                </motion.div>
                )}

                {/* D. Cream Card: Charts — 🟢 非跑步基本運動略過配速圖（只看基本數據） */}
                {/* 💳 逐秒配速／心率曲線是完整跑步分析（會員）—— Strava 的配速分析也是訂閱功能 */}
                {!isBasicSport && hasMeaningfulData && runFull && (
                <motion.div
                    className="note-card note-cream full-width-card"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-40px' }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    style={{ border: 'none', borderTop: '1px solid rgba(0,0,0,0.05)', gridColumn: '1 / -1' }}
                >
                    <div className="flex justify-between items-center mb-2">
                        <div className="note-label">
                            <BarChart2 size={12} /> 配速 × 爬升 <span className="opacity-50">(每公里)</span>
                        </div>
                    </div>
                    {/* 圖例 — 中文 */}
                    <div className="flex items-center gap-4 mb-4 px-1">
                        <span className="flex items-center gap-1.5 text-[11px] font-bold text-black/55">
                            <span style={{ width: 14, height: 3, borderRadius: 2, background: PALETTE.coral, display: 'inline-block' }} /> 配速 (分/公里)
                        </span>
                        {kmChartHasElevation && (
                            <span className="flex items-center gap-1.5 text-[11px] font-bold text-black/55">
                                <span style={{ width: 14, height: 8, borderRadius: 2, background: 'rgba(120,141,169,0.35)', display: 'inline-block' }} /> 爬升 (公尺)
                            </span>
                        )}
                    </div>
                    <div className="h-56 w-full pr-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={kmChartData} margin={{ top: 5, right: 4, left: 0, bottom: 4 }}>
                                <defs>
                                    <linearGradient id="paceFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={PALETTE.coral} stopOpacity={0.35} />
                                        <stop offset="100%" stopColor={PALETTE.coral} stopOpacity={0.02} />
                                    </linearGradient>
                                    <linearGradient id="elevFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#788DA9" stopOpacity={0.30} />
                                        <stop offset="100%" stopColor="#788DA9" stopOpacity={0.02} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#000" opacity={0.05} vertical={false} />
                                <XAxis
                                    dataKey="km"
                                    type="number"
                                    domain={['dataMin', 'dataMax']}
                                    tick={{ fontSize: 11, fill: '#000', opacity: 0.35, fontWeight: 700 }}
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(v) => `${v}K`}
                                    label={{ value: '公里', position: 'insideBottomRight', offset: -2, fontSize: 11, fill: '#999' }}
                                />
                                {/* 配速軸（左）— 反轉，越上面越快 */}
                                <YAxis
                                    yAxisId="pace"
                                    reversed
                                    domain={['auto', 'auto']}
                                    tick={{ fontSize: 11, fill: PALETTE.coral, opacity: 0.6, fontWeight: 700 }}
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(val) => (val / 60).toFixed(1)}
                                    width={32}
                                />
                                {/* 爬升軸（右） */}
                                {kmChartHasElevation && (
                                    <YAxis
                                        yAxisId="elev"
                                        orientation="right"
                                        domain={[0, 'dataMax + 5']}
                                        tick={{ fontSize: 11, fill: '#788DA9', opacity: 0.7, fontWeight: 700 }}
                                        axisLine={false}
                                        tickLine={false}
                                        tickFormatter={(val) => `${Math.round(val)}`}
                                        width={28}
                                    />
                                )}
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#FFF', border: '1px solid #EEE', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                    itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                                    labelStyle={{ color: '#888', marginBottom: '4px' }}
                                    labelFormatter={(v) => `第 ${v} 公里`}
                                    formatter={(value, name) => {
                                        if (name === 'pace') return [`${Math.floor(value / 60)}'${String(Math.round(value % 60)).padStart(2, '0')}"`, '配速'];
                                        return [`${Math.round(value)} m`, '爬升'];
                                    }}
                                />
                                {/* 爬升 — 面積填滿（畫在底層） */}
                                {kmChartHasElevation && (
                                    <Area
                                        yAxisId="elev"
                                        type="monotone"
                                        dataKey="elevation"
                                        stroke="#788DA9"
                                        strokeWidth={1.5}
                                        fill="url(#elevFill)"
                                        connectNulls
                                        dot={false}
                                    />
                                )}
                                {/* 配速 — 面積填滿（畫在上層） */}
                                <Area
                                    yAxisId="pace"
                                    type="monotone"
                                    dataKey="pace"
                                    stroke={PALETTE.coral}
                                    strokeWidth={3}
                                    fill="url(#paceFill)"
                                    connectNulls
                                    dot={false}
                                    activeDot={{ r: 5, fill: PALETTE.coral }}
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>
                )}

                {/* 🎯 下一步卡片 — 把「跑完的成就感」接到「下一次的明確行動」。
                      設計沿用 note-card 瑞士編輯風：paper 底、coral 破折號 eyebrow、細分隔線、黑底 CTA。
                      有計劃 → 指向計劃下一課；無計劃 → 智慧混合小目標。 */}
                {nextStep && (
                    <motion.div
                        className="full-width-card note-card note-cream"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ type: 'spring', stiffness: 220, damping: 22 }}
                        style={{ marginTop: 4 }}
                    >
                        {/* eyebrow — issue line style；若剛達成上次目標，左側改顯示達成徽記 */}
                        <div className="flex items-center justify-between mb-5 pb-3 border-b border-black/10">
                            <span className="text-[12px] font-black tracking-[0.28em]" style={{ color: PALETTE.coral }}>
                                {achievedPrevGoal ? '✓ 上個目標達成 · 下一步' : `— ${nextStep.eyebrow}`}
                            </span>
                            <span className="text-[11px] font-black uppercase tracking-[0.28em] text-black/30">
                                {nextStep.type === 'PLAN' ? 'PLAN' : 'GOAL'}
                            </span>
                        </div>

                        {/* 目標主文 — 左側豎線 + 標題 + 說明，與 Coach Insight 同語彙 */}
                        <div className="flex items-start gap-4">
                            <div className="w-px self-stretch" style={{ background: PALETTE.coral, minHeight: 48, opacity: 0.55 }} />
                            <div className="flex-1">
                                <p className="text-[17px] font-black leading-snug mb-1.5" style={{ color: PALETTE.deepBlack, letterSpacing: '-0.01em' }}>
                                    {nextStep.title}
                                </p>
                                <p className="text-[12px] leading-relaxed max-w-[340px]" style={{ color: PALETTE.textSecondary }}>
                                    {nextStep.detail}
                                </p>
                            </div>
                        </div>

                        {/* 🗓️ 排程時間選擇 — 預設「建議」(由剩餘課數平均分散推算)，可改今晚/明早/明晚 */}
                        {!nextStepScheduled && scheduleOptions.length > 0 && (
                            <div className="mt-5">
                                <div className="text-[12px] font-black tracking-[0.28em] mb-2" style={{ color: PALETTE.textSecondary }}>
                                    — 下次提醒時間
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {scheduleOptions.map((opt) => {
                                        const active = selectedSchedule?.id === opt.id;
                                        return (
                                            <motion.button {...pressProps('pill')}
 key={opt.id}
 onClick={() => setSelectedSchedule(opt)}
 className="px-3 py-2 rounded-full "
 style={{
 background: active ? PALETTE.coral : 'rgba(22,20,21,0.05)',
 border: active ? `1px solid ${PALETTE.coral}` : '1px solid rgba(22,20,21,0.1)',
 }}
 >
                                                <span className="text-[11px] font-black tracking-[0.06em]" style={{ color: active ? '#FFFFFF' : PALETTE.deepBlack }}>
                                                    {opt.label}
                                                </span>
                                                <span className="text-[11px] font-bold ml-1.5 tabular-nums" style={{ color: active ? 'rgba(255,255,255,0.8)' : PALETTE.textSecondary }}>
                                                    {opt.hint}
                                                </span>
                                            </motion.button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* 一鍵排程 CTA — 黑底，與 Action Bar 主按鈕同風格 */}
                        <motion.button
                            onClick={handleScheduleNext}
                            disabled={nextStepScheduled}
                            whileTap={{ scale: nextStepScheduled ? 1 : 0.985 }}
                            className="w-full flex items-center justify-between px-5 py-4 mt-6 relative overflow-hidden"
                            style={{
                                background: nextStepScheduled ? 'rgba(22,20,21,0.06)' : PALETTE.deepBlack,
                                color: nextStepScheduled ? PALETTE.deepBlack : PALETTE.paper,
                                borderRadius: '4px',
                                border: '1px solid #161415',
                                cursor: nextStepScheduled ? 'default' : 'pointer',
                                fontFamily: 'var(--font-body)',
                            }}
                        >
                            <span className="text-[11px] font-black uppercase tracking-[0.32em] opacity-60">
                                {nextStepScheduled ? (selectedSchedule?.hint || '— Scheduled') : '— Next Run'}
                            </span>
                            <div className="flex items-center gap-2.5">
                                <span className="text-[13px] font-black uppercase tracking-[0.2em]">
                                    {nextStepScheduled ? '已排程提醒' : '排下次跑步'}
                                </span>
                                {nextStepScheduled
                                    ? <Calendar size={15} strokeWidth={2.4} />
                                    : <ArrowRight size={15} strokeWidth={2.4} />}
                            </div>
                        </motion.button>
                    </motion.div>
                )}

                {/* E. Swiss Editorial Action Bar — 拿掉 cream card 邊框、Serif、book icon
                      改用：細邊框 ghost CTA + 純 Sans-serif + Arrow icon + uppercase tracking */}
                <div className="w-full" style={{ padding: '24px 8px 0 8px', gridColumn: '1 / -1' }}>
                    <motion.button
                        onClick={async () => {
                            let currentSessionId = cardioData.sessionId;
                            if (!currentSessionId || currentSessionId.startsWith('watch_')) {
                                const realId = localStorage.getItem('lastSavedSessionId');
                                if (realId) {
                                    currentSessionId = realId;
                                } else {
                                    const saved = await saveCardioSession(false);
                                    if (saved?.session_id) currentSessionId = saved.session_id;
                                }
                            }
                            if (!currentSessionId) {
                                toast.error("資料還在整理中，請稍候再試");
                                return;
                            }
                            navigate(`/running-analysis-mobile/${currentSessionId}`, {
                                state: { showResults: true, cardioData: cardioData, recoveryTimer: recoveryTimer, isRecovering: isRecovering }
                            });
                        }}
                        whileTap={{ scale: 0.985 }}
                        whileHover={{ y: -1 }}
                        className="w-full flex items-center justify-between px-6 py-5 group relative overflow-hidden"
                        style={{
                            background: isSaving ? 'rgba(22,20,21,0.06)' : C.ink,
                            color: C.paper,
                            borderRadius: '4px',
                            border: '1px solid #161415',
                            cursor: isSaving ? 'wait' : 'pointer',
                            fontFamily: 'var(--font-body)',
                        }}
                        disabled={isSaving}
                    >
                        <div className="flex items-baseline gap-3">
                            <span className="text-[11px] font-black uppercase tracking-[0.32em] opacity-60">— Next</span>
                        </div>
                        <div className="flex items-center gap-3">
                            {/* 🩹 這是整頁最大的主要按鈕，原本卻是英文 Deep Analysis / Saving */}
                            <span className="text-[15px] font-black tracking-[0.06em]">
                                {isSaving ? '儲存中…' : '看深度分析'}
                            </span>
                            {isSaving ? (
                                <Activity size={16} className="animate-spin opacity-70" />
                            ) : (
                                <motion.span
                                    animate={{ x: [0, 4, 0] }}
                                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                                    className="inline-flex"
                                >
                                    <ArrowRight size={16} strokeWidth={2.4} />
                                </motion.span>
                            )}
                        </div>
                    </motion.button>

                    {/* Secondary action row — 取消圓圈圖示，改純文字 link 風（🆕 加「儲存紀錄」「下載報告」） */}
                    {/* 🩹 底部三顆鈕：返回／儲存紀錄／分享成果。
                        原本是四顆（多一顆「下載報告 PDF」），而且標籤中英混雜、字級也不一致
                        （Close 與 Gallery 是 9px 英文，儲存紀錄與下載報告是 12px 中文）——
                        同一列的按鈕長成兩種樣子。現在統一成中文 12px，用詞也對齊重訓結算頁。 */}
                    <div className="grid grid-cols-3 mt-6 divide-x divide-black/10">
                        <motion.button {...pressProps('row')}
 onClick={handleSaveAndClose}
 className="flex items-center justify-center gap-2 py-3 active:opacity-60 transition-opacity"
 >
                            <span className="text-[12px] font-black tracking-[0.04em] text-black/55">返回</span>
                        </motion.button>
                        <motion.button {...pressProps('row')}
 onClick={async () => {
 try {
 await saveCardioSession(false);
 toast.success('紀錄已儲存');
 } catch (e) {
 toast.warning('已存在本機，連上網路會自動同步');
 }
 // ✨ 前幾次里程碑（第1/3/7次跑步紀錄）— 滿版回饋會蓋在主頁上出場
 try { recordAction(userId, 'run_save', '完成跑步紀錄'); } catch { /* */ }
 // 🧭 儲存紀錄 = 收尾動作 → 回主頁（依需求）
 if (onClose) onClose(); else navigate('/mobile-home');
 }}
 className="flex items-center justify-center gap-2 py-3 active:opacity-60 transition-opacity"
 >
                            {/* 🩹 原本用 Download（下載）圖示表示「儲存」—— 語義不符，改用書籤圖示 */}
                            <BookmarkPlus size={12} className="text-black/55" />
                            <span className="text-[12px] font-black tracking-[0.04em] text-black/55">儲存紀錄</span>
                        </motion.button>
                        <motion.button {...pressProps('row')}
 onClick={() => setShowRunningEvolution(true)}
 className="flex items-center justify-center gap-2 py-3 active:opacity-60 transition-opacity"
 >
                            <Camera size={12} className="text-[#F95C4B]" />
                            <span className="text-[12px] font-black tracking-[0.04em] text-[#F95C4B]">分享成果</span>
                        </motion.button>
                    </div>

                    {/* 🗑️ 長按取消這筆紀錄 — 外圈進度環跑滿才會詢問，防誤觸 */}
                    <div className="flex justify-center mt-4">
                        <HoldToCancelRecord onCancel={async () => {
                            try {
                                const sid = cardioData?.sessionId || cardioData?.session_id;
                                if (sid && !String(sid).startsWith('mock')) {
                                    await apiClient.delete(`/api/cardio/session/${sid}`, { params: { user_id: userId } });
                                }
                            } catch (e) { console.warn('cancel record delete failed', e); }
                            toast.info('已取消這筆紀錄');
                            if (onClose) onClose(); else navigate('/cardio-tracker-mobile');
                        }} />
                    </div>
                </div>

                {/* 🩹 已移除一段 display:none 的舊按鈕列（關閉／相簿）——
                    它跟上方可見的按鈕列呼叫同樣的 handler，只是用了另一套中文詞，
                    留著只會讓後續維護的人不確定哪一排才是真的。 */}

            </div>

            {/* Effort Info Popup */}
            <EffortInfoPopup isOpen={showEffortInfo} onClose={() => setShowEffortInfo(false)} />

            {/* Modals */}
            <AnimatePresence>
                {showSharePreview && (
                    <SharePreviewModal
                        cardioData={cardioData}
                        onClose={() => setShowSharePreview(false)}
                        onShare={handleShare}
                        userName="User"
                    />
                )}
            </AnimatePresence>

            {/* Running Evolution — portal to body to avoid stacking context issues */}
            {showRunningEvolution && createPortal(
                <RunningEvolutionCard
                    cardioData={cardioData}
                    onExit={() => setShowRunningEvolution(false)}
                />,
                document.body
            )}
        </div >
    );
};

export default CardioResultsMobile;
