import React, { useState, useMemo, useEffect, useRef } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { CommunityMasthead } from './SocialFeed/CommunityChrome';
import { getUserId } from '../utils/auth';
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion';
import {
    Trophy, Zap, Flame, ChevronUp, Activity, Crosshair,
    TrendingUp, TrendingDown, Users, Star, Shield, Crown,
    Sparkles, Swords, X, ChevronRight, Check,
} from 'lucide-react';
import LeagueElevationInvitation from './LeagueElevationInvitation';
import { getCurrentLeague, getTargetLeague, LEAGUES as STORE_LEAGUES, maybeSettleSeason, isMonthEndWindow, getCurrentSeasonId, MIN_SETTLE_COHORT } from '../utils/leagueStore';
import LeagueStandingCard from './LeagueStandingCard';
import { notifyRankChange } from '../utils/drvnNotifications';
import { computeMonthlyProgress } from '../utils/personalProgress';
import { haptic } from '../utils/haptics';

/* ══════════════════════════════════════════
   Color System — DRVN® Unified Palette
══════════════════════════════════════════ */
const C = {
    black: '#F6F4F1', paper: '#161415', stone: '#E4DED2',
    pebble: '#CFC6B8', coral: '#F95C4B', ember: '#D94030',
    card: '#FFFFFF', card2: '#FFFFFF',
    gold: '#EAD196', silver: '#A8B4C0', bronze: '#CD7F32',
};

const triggerHaptic = (style = 'medium') => haptic(style);

const F = {
    // 同步社群頁：lululemon 圓潤 Montserrat 為主，mono 作個性點綴
    serif: 'var(--font-body)',
    sans: 'var(--font-body)',
    mono: 'var(--font-mono)',
};

/* 🔴 零模擬數據：原 MOCK_RUNNERS 假榜單已移除 — 榜單一律走真實 /leaderboard，無資料顯示空狀態 */

/* ══ Distance Groups (for pace leaderboard) ══
   raceGroup = standard race distance the athlete focuses on.
   Midpoint thresholds: <7.5 → 5K, 7.5-15.55 → 10K, 15.55-31.65 → Half, ≥31.65 → Full
══════════════════════════════════════════════ */
const DIST_GROUPS = [
    { id: 5, label: '5K', sublabel: '5公里組', color: '#C68E5D' },
    { id: 10, label: '10K', sublabel: '10公里組', color: C.coral },
    { id: 21, label: '半馬 21K', sublabel: '半程馬拉松', color: C.pebble },
    { id: 42, label: '全馬 42K', sublabel: '全程馬拉松', color: C.stone },
];
const getDistGroup = (rg) => DIST_GROUPS.find(g => g.id === rg) || DIST_GROUPS[0];
// Auto-assign group from a single-run distance value (km)
const distKmToGroup = (km) => {
    const midpoints = [7.5, 15.55, 31.65];
    if (km < midpoints[0]) return 5;
    if (km < midpoints[1]) return 10;
    if (km < midpoints[2]) return 21;
    return 42;
};
const fmtPace = (sec) => `${Math.floor(sec / 60)}'${String(sec % 60).padStart(2, '0')}"`;

// League data comes from leagueStore — keeps running & strength in sync

// 每月結算：本月 = 當月累積並參與晉升；上月 = 上月結算結果；總榜 = 全期累積
const TIME_TABS = [{ id: 'month', label: '本月' }, { id: 'last', label: '上月' }, { id: 'all', label: '總榜' }];
const METRIC_TABS = [
    { id: 'distance', label: '里程', Icon: Zap },
    { id: 'pace', label: '配速', Icon: Flame },
    { id: 'elevation', label: '爬升', Icon: ChevronUp },
    { id: 'consistency', label: '自律榜', Icon: Sparkles },
];
const NUDGES = ['加油', '盯著你', '跟上', '衝'];

/* ══════════════════════════════════════════
   Helpers
══════════════════════════════════════════ */
const TrendBadge = ({ val }) => {
    if (!val) return null;
    const up = val > 0;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11, fontWeight: 900,
            color: up ? '#6EE7B7' : '#FCA5A5', background: up ? 'rgba(110,231,183,0.1)' : 'rgba(252,165,165,0.1)',
            padding: '2px 6px', borderRadius: 6
        }}>
            {up ? <TrendingUp size={8} /> : <TrendingDown size={8} />}{up ? '+' : ''}{val}%
        </span>
    );
};
const RiseBadge = ({ val }) => {
    if (!val || val === 0) return null;
    const up = val > 0;
    return <span style={{ fontSize: 11, fontWeight: 900, padding: '1px 5px', borderRadius: 5, color: up ? '#6EE7B7' : '#FCA5A5', background: up ? 'rgba(110,231,183,0.08)' : 'rgba(252,165,165,0.08)' }}>{up ? '↑' : '↓'}{Math.abs(val)}</span>;
};
const getPodiumVal = (u, metric) => {
    if (metric === 'pace') return { big: fmtPace(u.paceSec), unit: '' };
    if (metric === 'elevation') return { big: `${u.elev}`, unit: 'm' };
    if (metric === 'consistency') return { big: `${u.streak}`, unit: 'd' };
    return { big: `${u.dist}`, unit: 'km' };
};
const getNemesis = (sorted, myId) => { const i = sorted.findIndex(r => r.id === myId); return i > 0 ? sorted[i - 1] : null; };
const getBiggestMover = (arr, metric) => {
    if (arr.length === 0) return null;
    return [...arr].sort((a, b) => {
        if (metric === 'pace') return b.trend - a.trend;
        if (metric === 'elevation') return b.rise - a.rise;
        if (metric === 'consistency') return b.streak - a.streak;
        return b.rise - a.rise;
    })[0];
};

/* ══════════════════════════════════════════
   🌟 3D PARTICLE PODIUM
══════════════════════════════════════════ */
// Fixed particle orbit angles to avoid hydration issues
const ORBIT_ANGLES = [0, 51, 103, 154, 205, 257, 308];

const ParticleRing = ({ color, count = 7, r = 36 }) => (
    <>
        {ORBIT_ANGLES.slice(0, count).map((deg, i) => (
            <motion.div key={i}
                style={{
                    position: 'absolute', width: 3, height: 3, borderRadius: '50%', background: color,
                    boxShadow: `0 0 6px ${color}, 0 0 12px ${color}88`,
                    left: '50%', top: '50%', marginLeft: -1.5, marginTop: -1.5
                }}
                animate={{
                    x: [
                        Math.cos((deg * Math.PI) / 180) * r,
                        Math.cos(((deg + 120) * Math.PI) / 180) * r,
                        Math.cos(((deg + 240) * Math.PI) / 180) * r,
                        Math.cos((deg * Math.PI) / 180) * r,
                    ],
                    y: [
                        Math.sin((deg * Math.PI) / 180) * r,
                        Math.sin(((deg + 120) * Math.PI) / 180) * r,
                        Math.sin(((deg + 240) * Math.PI) / 180) * r,
                        Math.sin((deg * Math.PI) / 180) * r,
                    ],
                    opacity: [0.9, 0.3, 0.9],
                    scale: [1, 0.5, 1],
                }}
                transition={{ duration: 3 + i * 0.3, repeat: Infinity, delay: Math.min(i, 6) * 0.25, ease: 'easeInOut' }}
            />
        ))}
    </>
);

const PlatformMinimal = ({ color, rank, height }) => {
    const bgImage = rank === 1 ? '/desktop/_ (32).jpeg' : rank === 2 ? '/desktop/11.jpeg' : '/desktop/_ (33).jpeg';

    return (
        <div style={{ position: 'relative', width: '100%' }}>
            <motion.div 
                initial={{ height: 0 }} animate={{ height }}
                transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                style={{
                    backgroundImage: `url("${bgImage}")`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    width: '100%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: `1px solid rgba(0,0,0,0.1)`,
                    borderTop: `1.5px solid rgba(255,255,255,0.4)`,
                    boxShadow: `inset 0 0 15px rgba(0,0,0,0.05), 0 10px 30px -10px ${color}44`,
                    position: 'relative',
                    overflow: 'hidden'
                }}
            >
                {/* Diagonal Shine */}
                <motion.div 
                    animate={{ left: ['-100%', '200%'] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "linear", delay: rank * 0.5 }}
                    style={{
                        position: 'absolute', top: 0, width: '40%', height: '100%',
                        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                        transform: 'skewX(-20deg)',
                        zIndex: 1
                    }}
                />

                <span style={{
                    fontSize: 64, fontWeight: 900, color: 'rgba(255,255,255,0.9)',
                    fontFamily: F.serif, fontStyle: 'italic', pointerEvents: 'none',
                    textShadow: '0 4px 16px rgba(0,0,0,0.4)',
                    position: 'relative', zIndex: 2
                }}>
                    0{rank}
                </span>
            </motion.div>
        </div>
    );
};

const PodiumSlot = ({ user, glowColor, rank, barH, avatarSize, mt, metric, platformColor }) => {
    if (!user) return <div style={{ flex: 1 }} />;
    const { big, unit } = getPodiumVal(user, metric);

    return (
        <motion.div
            initial={{ opacity: 0, y: 48 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: rank === 1 ? 0 : rank === 2 ? 0.14 : 0.26, type: 'spring', stiffness: 110, damping: 18 }}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
        >
            {/* Avatar zone */}
            <div style={{ position: 'relative', marginBottom: 16, marginTop: mt }}>
                <img loading="lazy" decoding="async" src={user.avatar} alt={user.name}
                    style={{
                        width: avatarSize, height: avatarSize, borderRadius: '50%', objectFit: 'cover',
                        border: `1px solid ${platformColor}33`, padding: 4,
                        background: '#E8E9E6'
                    }} />
                
                <div style={{
                    position: 'absolute', top: -12, right: -12,
                    width: 28, height: 28, borderRadius: '50%', background: platformColor,
                    color: rank === 1 ? C.paper : C.paper, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 900, fontFamily: F.sans,
                    boxShadow: `0 4px 12px ${platformColor}44`
                }}>
                    {rank}
                </div>
            </div>

            {/* Score */}
            <p style={{
                fontSize: rank === 1 ? 42 : 28, fontWeight: 900, color: C.paper,
                lineHeight: 1, textAlign: 'center', fontFamily: F.sans, margin: 0, letterSpacing: '-0.04em'
            }}>
                {big}<span style={{ fontSize: 12, fontWeight: 700, opacity: 0.3, marginLeft: 2 }}>{unit}</span>
            </p>

            {/* Name */}
            <p style={{
                fontSize: 9, fontWeight: 900, color: C.paper, letterSpacing: '0.2em', textTransform: 'uppercase',
                margin: '8px 0 12px', textAlign: 'center', opacity: 0.4
            }}>
                {user.name}
            </p>

            <PlatformMinimal color={platformColor} rank={rank} height={barH} />
        </motion.div>
    );
};

const PodiumSection = ({ runners, metric }) => {
    const [second, first, third] = [runners[1], runners[0], runners[2]];
    return (
        <div style={{ padding: '40px 16px 0', position: 'relative' }}>
            {/* Ambient glow behind podium */}
            <div style={{
                position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
                width: '90%', height: 120,
                background: `radial-gradient(ellipse, ${C.gold}18 0%, ${C.silver}10 40%, transparent 70%)`,
                filter: 'blur(20px)', pointerEvents: 'none'
            }} />

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 272, position: 'relative' }}>
                <PodiumSlot user={second} rank={2} glowColor={C.silver} barH={96} avatarSize={54} mt={12} metric={metric} platformColor={C.silver} />
                <PodiumSlot user={first} rank={1} glowColor={C.gold} barH={128} avatarSize={72} mt={0} metric={metric} platformColor={C.gold} />
                <PodiumSlot user={third} rank={3} glowColor={C.bronze} barH={72} avatarSize={46} mt={20} metric={metric} platformColor={C.bronze} />
            </div>
        </div>
    );
};


/* ══════════════════════════════════════════
   🎖️ LEAGUE PROMOTION MODAL (Rolls-Royce)
══════════════════════════════════════════ */


/* ══════════════════════════════════════════
   Biggest Mover
══════════════════════════════════════════ */
const BiggestMoverCard = ({ mover, metric, timeFilter }) => {
    if (!mover) return null;
    const timeStr = timeFilter === 'month' ? 'MONTH' : timeFilter === 'last' ? 'LAST MONTH' : 'ALL TIME';
    let desc = `RANK CLIMB +${mover.rise} / ${mover.dist}KM THIS ${timeStr}`;
    let bigVal = mover.rise;

    if (metric === 'pace') {
        desc = `PACE IMPROVED / ${fmtPace(mover.paceSec)} THIS ${timeStr}`;
        bigVal = `-${Math.abs(mover.trend)}s`;
    } else if (metric === 'elevation') {
        desc = `ELEV GAIN / ${mover.elev}M THIS ${timeStr}`;
        bigVal = `+${mover.rise}`;
    } else if (metric === 'consistency') {
        desc = `STREAK HELD / ${mover.streak}D THIS ${timeStr}`;
        bigVal = `+${mover.streak}`;
    }

    return (
        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.12 }}
            style={{
                margin: '0 16px 14px',
                // Deep-Black slab (DRVN §3 .ti-surface-dark) — Coral is no longer a full-bleed wash,
                // it returns to being a single sharp focal object (the big number on the right).
                background: C.paper,
                borderRadius: 18, padding: '24px',
                display: 'flex', alignItems: 'flex-start', gap: 20,
                position: 'relative', overflow: 'hidden',
                boxShadow: `0 24px 48px -18px rgba(32,32,32,0.45)`,
                border: `1px solid ${C.black}10`
            }}>
            {/* §9 Ambient mood light — one diffuse coral pool behind the content, never on it */}
            <div style={{
                position: 'absolute', top: -40, right: -20, width: 220, height: 220,
                background: `radial-gradient(circle, ${C.coral}33 0%, ${C.coral}14 38%, transparent 68%)`,
                filter: 'blur(28px)', pointerEvents: 'none', zIndex: 0
            }} />
            <div style={{ position: 'relative', flexShrink: 0, zIndex: 1 }}>
                <img loading="lazy" decoding="async" src={mover.avatar} alt={mover.name} style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover', border: `1px solid rgba(246,244,241,0.18)` }} />
            </div>
            <div style={{ flex: 1, position: 'relative', zIndex: 1 }}>
                <p style={{ fontSize: 12, fontWeight: 900, color: C.coral, letterSpacing: '0.3em', margin: '0 0 8px' }}>本週焦點人物</p>
                <p style={{ fontSize: 32, fontWeight: 900, color: C.black, margin: 0, letterSpacing: '-0.05em', lineHeight: 0.95 }}>{mover.name}</p>
                <p style={{ fontSize: 11, fontWeight: 700, color: C.black, margin: '12px 0 0', letterSpacing: '0.05em', opacity: 0.66 }}>
                    {desc}
                </p>
            </div>
            <div style={{ textAlign: 'right', position: 'relative', zIndex: 1 }}>
                {/* the one Coral focal object on this card */}
                <span style={{ fontSize: 56, fontWeight: 900, color: C.coral, fontFamily: F.serif, fontStyle: 'italic', lineHeight: 0.8 }}>{bigVal}</span>
            </div>
        </motion.div>
    );
};

/* ══════════════════════════════════════════
   Nemesis Banner
══════════════════════════════════════════ */
const NemesisBanner = ({ nemesis, me, metric }) => {
    const gap = metric === 'elevation'
        ? `${nemesis.elev - me.elev}m`
        : metric === 'pace'
            ? `${Math.abs(me.paceSec - nemesis.paceSec)} 秒`
            : `${(nemesis.dist - me.dist).toFixed(1)} km`;
    const action = metric === 'elevation' ? '爬更多' : metric === 'pace' ? '提速' : '去跑步';

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
            style={{
                margin: '14px 16px 0',
                background: C.stone,
                border: `1px solid ${C.paper}10`, borderRadius: 18, padding: '20px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                boxShadow: `0 12px 32px -8px rgba(0,0,0,0.08)`,
                position: 'relative', overflow: 'hidden'
            }}>
            {/* 流光特效 (Shimmer Effect) */}
            <motion.div 
                style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                    zIndex: 1,
                    transform: 'skewX(-20deg)'
                }}
                animate={{
                    left: ['-100%', '200%']
                }}
                transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 1
                }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative', zIndex: 2 }}>
                <div style={{
                    width: 36, height: 36, borderRadius: '50%', background: `${C.coral}20`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${C.coral}40`, flexShrink: 0
                }}>
                    <Crosshair size={16} color={C.coral} />
                </div>
                <div>
                    <p style={{ fontSize: 9, fontWeight: 900, color: C.paper, letterSpacing: '0.22em', textTransform: 'uppercase', marginBottom: 3, opacity: 0.6 }}>Target Locked</p>
                    <p style={{ fontSize: 13, fontWeight: 700, color: C.paper, lineHeight: 1.3 }}>
                        超越 <span style={{ fontWeight: 900 }}>{nemesis.name}</span> 只差{' '}
                        <span style={{ color: C.coral, fontWeight: 900, fontStyle: 'italic' }}>{gap}</span>！
                    </p>
                    <p style={{ fontSize: 11, fontWeight: 700, color: C.paper, opacity: 0.4, margin: '3px 0 0' }}>Goal Tracking active — 你只差一小步</p>
                </div>
            </div>
            <motion.button {...pressProps('row')} 
 onClick={() => triggerHaptic('medium')}
 style={{
 background: C.coral, color: C.black, fontSize: 11, fontWeight: 900, padding: '9px 14px',
 borderRadius: 12, border: 'none', cursor: 'pointer', letterSpacing: '0.08em', whiteSpace: 'nowrap', flexShrink: 0,
 boxShadow: `0 4px 16px ${C.coral}44`, position: 'relative', zIndex: 2
 }}>
                {action}
            </motion.button>
        </motion.div>
    );
};

/* ══════════════════════════════════════════
   Rank Row with Nudge + Pace Category
══════════════════════════════════════════ */
/* Divider between distance groups in pace leaderboard */
const DistGroupDivider = ({ grp }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px 4px' }}>
        <div style={{ width: 18, height: 1, background: `${grp.color}35` }} />
        <div style={{ flex: 1, height: 1, background: `${grp.color}35` }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <span style={{ fontSize: 9, fontWeight: 900, color: grp.color, letterSpacing: '0.2em', textTransform: 'uppercase' }}>{grp.label}</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: grp.color, opacity: 0.5, letterSpacing: '0.1em' }}>{grp.sublabel}</span>
        </div>
        <div style={{ width: 30, height: 1, background: `${grp.color}35` }} />
    </div>
);

const RankRow = ({ user, idx, metric, isPromo, isRele, onNudge, showDistGrp, distGrp }) => {
    const [showNudge, setShowNudge] = useState(false);
    const [sentNudge, setSentNudge] = useState(null);
    const x = useMotionValue(0);

    const handleDragEnd = (_, info) => {
        if (info.offset.x < -40 && !user.isMe) { setShowNudge(true); }
        animate(x, 0, { type: 'spring' });
    };
    const sendNudge = (emoji) => {
        setSentNudge(emoji); setShowNudge(false);
        if (onNudge) onNudge(user.id, emoji);
    };

    const displayVal = metric === 'pace'
        ? fmtPace(user.paceSec)
        : metric === 'elevation'
            ? `${user.elev}m`
            : `${user.dist}km`;

    return (
        <>
            {showDistGrp && distGrp && <DistGroupDivider grp={distGrp} />}
            <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + idx * 0.03 }}
                style={{ marginBottom: 4 }}
            >
                <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 18 }}>
                    <motion.div drag="x" dragConstraints={{ left: -60, right: 0 }} dragElastic={0.2}
                        style={{ x }} onDragEnd={handleDragEnd}>
                        <div
                            onClick={() => !user.isMe && setShowNudge(v => !v)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 16, padding: '20px 16px',
                                borderRadius: user.isMe ? 14 : 0, cursor: 'pointer',
                                // me 行：細緻 Coral 左框 + 極淡高亮，不再是滿版黑卡（過於搶眼）
                                background: user.isMe ? `${C.coral}0E` : 'transparent',
                                borderLeft: user.isMe ? `2px solid ${C.coral}` : '2px solid transparent',
                                borderBottom: `1px solid ${C.paper}08`,
                                position: 'relative', transition: 'all 0.2s'
                            }}
                        >
                            <div style={{
                                width: 40, textAlign: 'left', flexShrink: 0,
                                fontSize: 24, fontWeight: 900,
                                color: C.paper,
                                fontFamily: F.sans, letterSpacing: '-0.05em'
                            }}>
                                {user.rank < 10 ? `0${user.rank}` : user.rank}
                            </div>

                            <div style={{ position: 'relative', flexShrink: 0 }}>
                                <img loading="lazy" decoding="async" src={user.avatar} alt={user.name}
                                    style={{
                                        width: 44, height: 44, borderRadius: '50%', objectFit: 'cover',
                                        border: `1.5px solid ${user.isMe ? `${C.paper}30` : 'rgba(255,255,255,0.1)'}`,
                                        padding: 2
                                    }}
                                />
                                {user.live && (
                                    <div style={{
                                        position: 'absolute', bottom: 0, right: 0, width: 12, height: 12,
                                        borderRadius: '50%', background: '#5A7A3A', border: `2px solid ${C.black}`,
                                        boxShadow: '0 0 8px #5A7A3A'
                                    }} />
                                )}
                                {sentNudge && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ position: 'absolute', top: -4, right: -4, fontSize: 12 }}>{sentNudge}</motion.div>}
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <p style={{
                                        fontSize: 16, fontWeight: 900, color: C.paper, margin: 0,
                                        letterSpacing: '-0.02em', textTransform: 'uppercase'
                                    }}>
                                        {user.name}
                                    </p>
                                    {/* 🏷️ 官方配速員徽章 — 示範帳號誠實標示，與真人區隔 */}
                                    {!user.isMe && user.isPacer && (
                                        <span style={{ fontSize: 11, fontWeight: 900, padding: '2px 6px', background: 'rgba(246,244,241,0.10)', color: `${C.paper}88`, borderRadius: 5, letterSpacing: '0.08em', flexShrink: 0, whiteSpace: 'nowrap' }}>DRVN 配速員</span>
                                    )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                    <span style={{ fontSize: 9, fontWeight: 900, color: C.paper, opacity: 0.4, letterSpacing: '0.1em' }}>STREAK {user.streak}D</span>
                                </div>
                            </div>

                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <p style={{
                                    fontSize: 24, fontWeight: 300,
                                    color: C.paper, margin: 0, lineHeight: 1,
                                    fontFamily: 'var(--font-display)', letterSpacing: '-0.02em',
                                    fontVariantNumeric: 'tabular-nums'
                                }}>
                                    {displayVal}
                                </p>
                            </div>
                        </div>
                    </motion.div>

                    <AnimatePresence>
                        {showNudge && !user.isMe && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.16 }} style={{ overflow: 'hidden' }}>
                                <div style={{ margin: '2px 12px 4px', padding: '9px 14px', background: C.card2, borderRadius: '0 0 14px 14px', display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${C.paper}08`, borderTop: 'none' }}>
                                    <span style={{ fontSize: 12, fontWeight: 900, color: C.pebble, opacity: 0.45, flex: 1, letterSpacing: '0.1em' }}>向 {user.name} 挑釁</span>
                                    {NUDGES.map(e => (
                                        <motion.button {...pressProps('row')} key={e} onClick={() => { triggerHaptic('light'); sendNudge(e); }}
 style={{ height: 30, padding: '0 12px', fontSize: 11, fontWeight: 800, color: C.paper, letterSpacing: '0.04em', borderRadius: 8, background: `${C.paper}08`, border: `1px solid ${C.paper}10`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap' }}>
                                            {e}
                                        </motion.button>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </>
    );
};

/* ══════════════════════════════════════════
   自律榜 (Consistency Board — no podium)
══════════════════════════════════════════ */
const ConsistencyBoard = ({ runners }) => {
    const sorted = [...runners].sort((a, b) => b.streak - a.streak).map((u, i) => ({ ...u, rank: i + 1 }));
    return (
        <div style={{ padding: '4px 12px 0' }}>
            {/* Header explainer */}
            <div style={{ margin: '0 2px 12px', padding: '12px 16px', background: C.card2, borderRadius: 18, border: `1px solid ${C.paper}08` }}>
                <p style={{ fontSize: 9, fontWeight: 900, color: C.pebble, opacity: 0.4, letterSpacing: '0.2em', textTransform: 'uppercase', margin: '0 0 4px' }}>Consistency Leaderboard</p>
                <p style={{ fontSize: 12, fontWeight: 700, color: C.paper, opacity: 0.6, margin: 0, lineHeight: 1.5 }}>
                    這裡比的不是速度，是<span style={{ color: C.coral, fontWeight: 900 }}>自律</span>。連續打卡天數就是你的成績。
                </p>
            </div>

            {sorted.map((user, idx) => {
                const cat = user.streak >= 21 ? { label: '傳奇', color: C.gold } : user.streak >= 14 ? { label: 'ON FIRE', color: C.coral } : user.streak >= 7 ? { label: '穩定', color: '#5A7A3A' } : { label: '起步', color: C.pebble };
                const pct = Math.min(100, (user.streak / 24) * 100);
                return (
                    <motion.div key={user.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(idx, 6) * 0.05 }}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 18, marginBottom: 2,
                            background: user.isMe ? `${C.coral}14` : 'transparent',
                            border: user.isMe ? `1px solid ${C.coral}28` : '1px solid transparent'
                        }}>
                        {/* Rank */}
                        <div style={{ width: 24, textAlign: 'center', fontSize: 13, fontWeight: 900, fontStyle: 'normal', color: user.isMe ? C.paper : `${C.paper}25`, flexShrink: 0 }}>{user.rank}</div>
                        {/* Avatar */}
                        <img loading="lazy" decoding="async" src={user.avatar} alt={user.name} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: `1.5px solid ${user.isMe ? `${C.paper}30` : `${C.paper}12`}`, flexShrink: 0 }} />
                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <p style={{ fontSize: 14, fontWeight: 800, color: C.paper, margin: 0 }}>{user.name}</p>
                                {user.isMe && <span style={{ fontSize: 11, fontWeight: 900, padding: '1px 5px', background: `${C.coral}22`, color: C.coral, borderRadius: 5 }}>你</span>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                <div style={{ flex: 1, height: 3, borderRadius: 2, background: `${C.paper}08`, overflow: 'hidden' }}>
                                    <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: Math.min(idx, 6) * 0.05 + 0.3, duration: 0.8 }}
                                        style={{ height: '100%', borderRadius: 2, background: cat.color }} />
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 900, color: cat.color, whiteSpace: 'nowrap', opacity: 0.8 }}>{cat.label}</span>
                            </div>
                        </div>
                        {/* Streak count */}
                        <p style={{ fontSize: 24, fontWeight: 300, color: C.paper, margin: 0, lineHeight: 1, flexShrink: 0, fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                            {user.streak}<span style={{ fontSize: 11, fontWeight: 700, color: C.pebble, marginLeft: 2, fontStyle: 'normal' }}>d</span>
                        </p>
                    </motion.div>
                );
            })}
        </div>
    );
};

/* ══════════════════════════════════════════
   My Rank Sticky Footer
══════════════════════════════════════════ */
const MyRankBar = ({ me, nemesis, metric }) => {
    const gapTxt = nemesis
        ? metric === 'pace'
            ? `配速差 ${Math.abs(me.paceSec - nemesis.paceSec)}s`
            : metric === 'elevation'
                ? `差 ${nemesis.elev - me.elev}m 晉位`
                : `差 ${(nemesis.dist - me.dist).toFixed(1)}km 晉位`
        : null;
    return (
        <div style={{ position: 'sticky', bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))', background: 'rgba(255, 255, 255, 0.45)', backdropFilter: 'blur(32px) saturate(1.8)', WebkitBackdropFilter: 'blur(32px) saturate(1.8)', borderTop: '1px solid rgba(255, 255, 255, 0.4)', paddingTop: 12, paddingBottom: 12, zIndex: 100 }}>
            <div style={{ margin: '0 16px', background: 'linear-gradient(165deg, #2A2724 0%, #161415 62%)', borderRadius: 18, padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12, border: '1px solid rgba(246,244,241,0.07)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 12px 34px rgba(22,20,21,0.22)' }}>
                <img loading="lazy" decoding="async" src={me.avatar} alt="me" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid rgba(246,244,241,0.18)' }} />
                <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 9, fontWeight: 800, color: 'rgba(246,244,241,0.45)', letterSpacing: '0.22em', textTransform: 'uppercase', margin: 0 }}>Your Ranking</p>
                    <p style={{ fontSize: 18, fontWeight: 300, color: '#F6F4F1', margin: '3px 0 0', fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1 }}>
                        #{me.rank} · {metric === 'pace' ? fmtPace(me.paceSec) : metric === 'elevation' ? `${me.elev}m` : `${me.dist}km`}
                        {gapTxt && <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(246,244,241,0.45)', marginLeft: 8, fontFamily: 'var(--font-body)' }}>{gapTxt}</span>}
                    </p>
                </div>
                <motion.button {...pressProps('row')} onClick={() => triggerHaptic('medium')} style={{ background: C.coral, color: '#FFFFFF', fontSize: 12, fontWeight: 900, padding: '9px 16px', borderRadius: 999, border: 'none', cursor: 'pointer', letterSpacing: '0.08em', }}>
                    去跑步
                </motion.button>
            </div>
        </div>
    );
};

/* ══════════════════════════════════════════
   Main
══════════════════════════════════════════ */
const RunningPulseRanking = () => {
    const [timeFilter, setTimeFilter] = useState('month'); // 'month'=本月(參與晉升), 'last'=上月, 'all'=總榜
    const [metricFilter, setMetricFilter] = useState('distance');
    const [groupFilter, setGroupFilter] = useState(null);
    const [nudges, setNudges] = useState({});
    const [showPromo, setShowPromo] = useState(false);
    const [myLeague, setMyLeague] = useState(getCurrentLeague);
    // 本賽季是否已領取晉升（領完後隱藏按鈕、改顯示等級徽章，直到下次結算換季）
    const navigate = useNavigate();
    const [promoClaimed, setPromoClaimed] = useState(() => {
        try { return localStorage.getItem(`drvn_promo_claimed_${getUserId()}`) === getCurrentSeasonId(); } catch { return false; }
    });

    const location = useLocation();
    // 「本月」tab 才顯示晉升系統（每月結算）
    const isSeasonTab = timeFilter === 'month';

    // 🏆 真實好友排行榜 — 接 /leaderboard，把後端資料映射成榜單需要的 runner 形狀。
    //    後端有：里程、配速、爬升(summary 多半 0)、連續天數。沒好友/沒資料 → 退回 mock 展示。
    const [realRunners, setRealRunners] = useState(null);
    useEffect(() => {
        const uid = getUserId();
        if (!uid) return;
        let alive = true;
        (async () => {
            try {
                const res = await api.get(`/api/social/friends/leaderboard/${uid}`);
                const board = res?.data?.leaderboard || [];
                if (!alive) return;
                if (board.length === 0) { setRealRunners([]); return; }
                const mapped = board.map((u, i) => {
                    const m = u.metrics || {};
                    return {
                        id: u.user_id || String(i),
                        name: (u.user_id === uid) ? 'You (我)' : (u.name || 'Athlete'),
                        raceGroup: distKmToGroup(m.run_distance || 0),
                        dist: Number(m.run_distance || 0),
                        paceSec: Number(m.avg_pace_sec || 0),
                        elev: Number(m.elevation_gain || 0),
                        streak: Number(m.streak_days || 0),
                        rise: Number(u.rise || 0),     // 短期名次升降（昨日→今日）
                        trend: Number(u.trend || 0),   // 長期趨勢（約 7 天→今日，後端多天快照算）
                        live: false,
                        // Off-palette fix: lock dicebear fallback to DRVN warm palette
                        // (Stone bg, Deep-Black glyph) instead of dicebear's random bright (purple) colours.
                        avatar: u.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(u.name || 'A')}&backgroundColor=E8E9E6&textColor=161415&fontWeight=700`,
                        isMe: u.user_id === uid,
                    };
                });
                setRealRunners(mapped);
            } catch { if (alive) setRealRunners([]); /* 無資料 → 空狀態 */ }
        })();
        return () => { alive = false; };
    }, []);

    // Handle deep-link promo trigger from Dashboard
    React.useEffect(() => {
        if (location.state?.openInvitation) {
            setTimeFilter('month');
            setShowPromo(true);
            // Clear location state
            window.history.replaceState({}, document.title);
        }
    }, [location.state]);

    // Listen for league changes (e.g. from Strength ranking)
    React.useEffect(() => {
        const handler = () => setMyLeague(getCurrentLeague());
        window.addEventListener('leagueChanged', handler);
        return () => window.removeEventListener('leagueChanged', handler);
    }, []);

    // (晉升邀請 + 賽季結算的 effect 已移到 me/total/isInPromoZone 計算之後，見下方)

    // Reset group filter when switching away from pace
    const handleMetricChange = (id) => {
        setMetricFilter(id);
        if (id !== 'pace') setGroupFilter(null);
    };

    const sorted = useMemo(() => {
        // ✅ 全面走真實 leaderboard；無資料時回傳空陣列（顯示空狀態，不再用 mock）。
        if (!realRunners || realRunners.length === 0) return [];
        let arr = realRunners.map(u => ({ ...u }));

        // Filter to selected group in pace mode
        if (metricFilter === 'pace' && groupFilter !== null) {
            arr = arr.filter(r => r.raceGroup === groupFilter);
        }
        return arr.sort((a, b) => {
            if (metricFilter === 'pace') {
                if (groupFilter === null) {
                    // Multi-group: sort by group asc then pace asc within group
                    if (a.raceGroup !== b.raceGroup) return a.raceGroup - b.raceGroup;
                }
                // 沒有配速資料（0）的人排最後，不然「沒跑」會變成配速第一名
                const pa = a.paceSec > 0 ? a.paceSec : Infinity;
                const pb = b.paceSec > 0 ? b.paceSec : Infinity;
                if (pa === pb) return 0;
                return pa - pb;
            }
            if (metricFilter === 'elevation') return b.elev - a.elev;
            if (metricFilter === 'consistency') return b.streak - a.streak;
            return b.dist - a.dist;
        }).map((u, i) => ({ ...u, rank: i + 1 }));
    }, [metricFilter, groupFilter, timeFilter, realRunners]);

    const top3 = sorted.slice(0, 3);
    const rest = sorted.slice(3);
    const me = sorted.find(r => r.isMe);

    // ★ v2.3 名次變動 → 統一走滿版時刻。
    //   跟「上一次看到的名次」比，不是跟固定值比 —— 名次是相對的，
    //   別人往前也會把你往後推，那同樣值得知道。
    const lastRankRef = useRef(null);
    useEffect(() => {
        const rank = me?.rank;
        if (!Number.isFinite(rank)) return;
        const key = `drvn_lastRank_run_${metricFilter}`;
        let prev = null;
        try { prev = Number(localStorage.getItem(key)); } catch { /* */ }
        try { localStorage.setItem(key, String(rank)); } catch { /* */ }
        if (!Number.isFinite(prev) || prev <= 0 || prev === rank) return;
        if (lastRankRef.current === rank) return;      // 同一次 render 不重複發
        lastRankRef.current = rank;
        notifyRankChange(getUserId(), { board: '跑步排行', rank, prevRank: prev });
    }, [me?.rank, metricFilter]);
    const mover = getBiggestMover(sorted, metricFilter);
    const nemesis = me ? getNemesis(sorted, me.id) : null;
    const total = sorted.length;

    // 個人進步（本月 vs 上月）— 從自己的 workout_history 本地計算，跟自己比。
    const myProgress = useMemo(() => computeMonthlyProgress(), [realRunners]);

    // 晉升區：前 30%；降級區：後 30%
    // 人數不足 MIN_SETTLE_COHORT 時沒有升降區（與 leagueStore.computeSettlement 同一門檻）
    const promoCount = total >= MIN_SETTLE_COHORT ? Math.ceil(total * 0.3) : 0;
    const releCount = total >= MIN_SETTLE_COHORT ? Math.ceil(total * 0.3) : 0;
    const isInPromoZone = me ? me.rank <= promoCount : false;
    const isInReleZone = me ? me.rank > total - releCount : false;

    // 自動偵測月底是否需要發送晉升邀請（月底最後 3 天且使用者在晉升區）
    React.useEffect(() => {
        if (!isSeasonTab || !isInPromoZone) return;
        const alreadyShown = sessionStorage.getItem('promoInvitationShown');
        if (isMonthEndWindow() && !alreadyShown) {
            const timer = setTimeout(() => {
                setShowPromo(true);
                sessionStorage.setItem('promoInvitationShown', '1');
            }, 1200);
            return () => clearTimeout(timer);
        }
    }, [isSeasonTab, isInPromoZone]);

    // 🏁 每月結算：月底窗口且本月尚未結算 → 依名次自動升/降並寫入歷史。
    React.useEffect(() => {
        if (!isSeasonTab || !me || !total) return;
        const res = maybeSettleSeason({ rank: me.rank, total, seasonEnded: isMonthEndWindow() });
        if (res && res.outcome !== 'stay') setMyLeague(getCurrentLeague());
    }, [isSeasonTab, me, total]);

    // Distance group divider — only when showing all groups in pace mode
    const getDistGroupForRow = (user, idx, arr) => {
        if (metricFilter !== 'pace' || groupFilter !== null) return { show: false, grp: null };
        const grp = getDistGroup(user.raceGroup);
        if (idx === 0) return { show: true, grp };
        const prevGrp = getDistGroup(arr[idx - 1].raceGroup);
        return { show: grp.id !== prevGrp.id, grp };
    };

    const handleNudge = (uid, emoji) => setNudges(n => ({ ...n, [uid]: emoji }));

    return (
        <div style={{
            minHeight: '100dvh', width: '100%', background: 'transparent', color: C.paper,
            fontFamily: '"Plus Jakarta Sans",sans-serif', overflowX: 'hidden'
        }}>

            {/* ── MASTHEAD —— 與動態牆完全同一個造型（介面標準 §9 同一語意同一長相）──
                ⚠️ 這裡原本是 clamp(44px,15vw,72px) 的滿版 Stride. ＋ mono kicker ＋ 副標，
                   三層加起來把第一屏吃掉一半 —— 使用者點進「排行」是要看名次，
                   不是看招牌。改成跟動態牆一樣：一句話講這裡是什麼、字標縮小推到右邊同一行。
                位置吃 --community-content-top（單一真相源，見 index.css）。 */}
            <div style={{
                padding: 'var(--community-content-top) 0 16px',
                background: 'transparent',
                zIndex: 40,
            }}>
                {/* 招牌列 —— 共用組件（SocialFeed/CommunityChrome），
                    與動態／社團／我的同一條。右邊字標點一下換社群。 */}
                <CommunityMasthead community="run" tab="ranking" />
            </div>

            {/* ── STICKY FILTERS ── */}
            <div style={{
                position: 'sticky', top: 'var(--community-sticky-top)', zIndex: 50,
                background: 'rgba(255, 255, 255, 0.45)', backdropFilter: 'blur(32px) saturate(1.8)', WebkitBackdropFilter: 'blur(32px) saturate(1.8)',
                padding: '16px 24px 0', margin: '0 0 16px',
                borderBottom: `1px solid rgba(0,0,0,0.05)`
            }}>

                {/* Filters Simplified */}
                <div style={{ display: 'flex', gap: 32, marginBottom: 24, borderBottom: `1px solid ${C.paper}10`, paddingBottom: 12 }}>
                    {TIME_TABS.map(({ id, label }) => (
                        <motion.button {...pressProps('row')} key={id} onClick={() => { triggerHaptic('light'); setTimeFilter(id); }}
 style={{
 background: 'none', border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 900,
 color: timeFilter === id ? C.paper : `${C.paper}20`, transition: 'all 0.2s',
 textTransform: 'uppercase', letterSpacing: '0.2em'
 }}>
                            {label}
                        </motion.button>
                    ))}
                </div>

                <div style={{ display: 'flex', gap: 20, overflowX: 'auto', paddingBottom: 16 }} className="no-scrollbar">
                    {METRIC_TABS.map(({ id, label }) => (
                        <motion.button {...pressProps('row')} key={id} onClick={() => handleMetricChange(id)}
 style={{
 background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
 fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em',
 color: metricFilter === id ? C.coral : `${C.paper}30`,
 transition: 'all 0.18s',
 }}>
                            {label}
                        </motion.button>
                    ))}
                </div>

                {/* Group Filter Pills — only visible on pace tab */}
                {metricFilter === 'pace' && (
                    <div style={{ display: 'flex', gap: 20, overflowX: 'auto', paddingBottom: 12, marginTop: -8 }} className="no-scrollbar">
                        {[{ id: null, label: '全部', color: C.pebble, sublabel: '' }, ...DIST_GROUPS].map(g => {
                            const active = groupFilter === g.id;
                            return (
                                <motion.button {...pressProps('row')} key={g.id ?? 'all'} onClick={() => setGroupFilter(g.id)}
 style={{
 background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
 fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em',
 color: active ? C.paper : `${C.paper}25`,
 borderBottom: active ? `1px solid ${C.paper}` : '1px solid transparent',
 padding: '4px 0',
 transition: 'all 0.18s'
 }}>
                                    {g.label}
                                </motion.button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── 本月成績單 ──────────────────────────────────────────────
                段位、名次、晉升線、跟上月比 —— 全部收進同一張卡的同一條軌道。
                （原本是 LeagueBanner ＋ MonthlyProgressCard 兩張，各有一個大數字。）
                ⚠️ 只在「本月」出現：上月／總榜是在翻歷史，晉升軌道放那裡會誤導。
                ⚠️ 沒有名次就整塊不渲染（§5）—— 下面的空狀態才是那時該顯示的唯一一件事，
                   不可以把它掛在這張卡「下面」變成附加。 */}
            {isSeasonTab && sorted.length > 0 && (
                <LeagueStandingCard
                    league={myLeague}
                    nextLeague={getTargetLeague(myLeague)}
                    rank={me?.rank}
                    total={total}
                    promoCount={promoCount}
                    releCount={releCount}
                    progress={myProgress}
                    kind="run"
                    canClaim={isInPromoZone && !promoClaimed && isMonthEndWindow()}
                    onClaim={() => setShowPromo(true)}
                />
            )}

            {/* ── 無資料空狀態（無好友 / 尚無跑步紀錄）── */}
            {sorted.length === 0 ? (
                /* §5 沒資料只顯示「去把資料補上」那一件事 —— 一行大字的動作卡，
                   不附說明、不附進度。缺的是什麼決定要給哪一條路：
                   自己還沒跑過 → 去跑；跑過了但榜上沒人 → 缺的是跑友。 */
                (() => {
                    /* ⚠️ 不能用 myProgress.hasData —— 它是「跑步或重訓任一有資料」。
                       只練重訓的人在跑步排行上會被判成「跑過了」，然後叫他去加跑友。
                       這一頁只看跑步的次數。 */
                    const hasRuns = (myProgress?.thisMonth?.count || 0) > 0
                        || (myProgress?.lastMonth?.count || 0) > 0;
                    const label = hasRuns ? '去加跑友' : '去跑第一趟';
                    const route = hasRuns ? '/social' : '/cardio-tracker-mobile';
                    return (
                        <motion.button {...pressProps('card')} onClick={() => { triggerHaptic('light'); navigate(route); }}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                                width: 'calc(100% - 32px)', margin: '8px 16px 0', padding: '22px 22px',
                                textAlign: 'left', background: C.card2, borderRadius: 18,
                                border: `1px solid ${C.paper}0F`, cursor: 'pointer',
                            }}>
                            <span style={{ fontSize: 19, fontWeight: 300, letterSpacing: '-0.015em', color: C.paper }}>{label}</span>
                            <ChevronRight size={18} strokeWidth={2.2} style={{ color: C.coral, flexShrink: 0 }} />
                        </motion.button>
                    );
                })()
            ) : (
            <>

            {/* ── PODIUM ── */}
            <>
                {/* Pace: show active group header */}
                {metricFilter === 'pace' && top3[0]?.raceGroup && (() => {
                    const activeGrp = groupFilter !== null
                        ? getDistGroup(groupFilter)
                        : getDistGroup(top3[0].raceGroup);
                    return (
                        <div style={{ margin: '0 16px 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 9, fontWeight: 900, color: activeGrp.color, letterSpacing: '0.2em', textTransform: 'uppercase' }}>{activeGrp.label} Group</span>
                            <div style={{ flex: 1, height: 1, background: `${activeGrp.color}30` }} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: activeGrp.color, opacity: 0.5 }}>{activeGrp.sublabel}</span>
                        </div>
                    );
                })()}
                {/* Consistency: show board header */}
                {metricFilter === 'consistency' && (
                    <div style={{ margin: '0 16px 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 9, fontWeight: 900, color: C.gold, letterSpacing: '0.2em', textTransform: 'uppercase' }}>Consistency Podium</span>
                        <div style={{ flex: 1, height: 1, background: `${C.gold}30` }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.gold, opacity: 0.5 }}>連續打卡天數</span>
                    </div>
                )}
                <PodiumSection runners={top3} metric={metricFilter} />
            </>

            {/* Divider */}
            <div style={{ margin: '16px 16px 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, height: 1, background: `${C.paper}08` }} />
                <span style={{ fontSize: 12, fontWeight: 900, color: C.paper, opacity: 0.35, letterSpacing: '0.22em', }}>
                    {metricFilter === 'consistency' ? '自律 · Consistency Board' : 'Rankings'}
                </span>
                <div style={{ flex: 1, height: 1, background: `${C.paper}08` }} />
            </div>

            {/* Zone hint 與 NEMESIS（TARGET LOCKED）已移除：
                晉升/降級資訊改由列表中的「安全區 / 降級區」分隔線表達，
                超越對手的差距已顯示在底部 Your Ranking。一屏一焦點，留白回來。 */}

            {/* ── LIST ── */}
            <div style={{ padding: '0 16px', position: 'relative' }}>
                <div style={{
                    display: 'flex', justifyContent: 'space-between', padding: '10px 16px',
                    opacity: 0.3, borderBottom: '1px solid rgba(255,255,255,0.05)',
                    marginBottom: 12
                }}>
                    <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.pebble }}>Athlete</span>
                    <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.pebble }}>
                        {metricFilter === 'pace' ? 'Pace' : metricFilter === 'elevation' ? 'Elevation' : 'Distance'}
                    </span>
                </div>

                {metricFilter === 'consistency' ? (
                    <ConsistencyBoard runners={sorted} />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 'calc(120px + env(safe-area-inset-bottom, 0px))' }}>
                        {rest.map((user, idx) => {
                            const { show, grp } = getDistGroupForRow(user, idx, rest);
                            const isPromo = user.rank <= promoCount;
                            const isRele = user.rank > total - releCount;

                            // 插入晉升區分界線（剛好在第 promoCount+3 名之後）
                            const showPromoZoneLine = idx > 0 && rest[idx - 1].rank === promoCount && !isPromo;
                            // 插入降級區分界線（剛好在降級區開始前）
                            const releStartRank = total - releCount + 1;
                            const showReleZoneLine = idx > 0 && rest[idx - 1].rank < releStartRank && user.rank >= releStartRank;

                            return (
                                <React.Fragment key={user.id}>
                                    {showPromoZoneLine && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 4px 4px' }}>
                                            <div style={{ flex: 1, height: 1, background: `rgba(22,20,21,0.08)` }} />
                                            <span style={{ fontSize: 12, fontWeight: 900, color: `${C.paper}40`, letterSpacing: '0.15em', whiteSpace: 'nowrap' }}>── 安全區 ──</span>
                                            <div style={{ flex: 1, height: 1, background: `rgba(22,20,21,0.08)` }} />
                                        </div>
                                    )}
                                    {showReleZoneLine && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 4px 4px' }}>
                                            <div style={{ flex: 1, height: 1, background: 'rgba(252,165,165,0.3)' }} />
                                            <span style={{ fontSize: 12, fontWeight: 900, color: '#FCA5A5', letterSpacing: '0.15em', whiteSpace: 'nowrap', opacity: 0.7 }}>降級區</span>
                                            <div style={{ flex: 1, height: 1, background: 'rgba(252,165,165,0.3)' }} />
                                        </div>
                                    )}
                                    <RankRow
                                        user={{ ...user, nudge: nudges[user.id] }}
                                        idx={idx} metric={metricFilter}
                                        isPromo={isPromo}
                                        isRele={isRele}
                                        onNudge={handleNudge}
                                        showDistGrp={show} distGrp={grp}
                                    />
                                </React.Fragment>
                            );
                        })}
                    </div>
                )}
            </div>
            </>
            )}

            {/* ── MY RANK BAR ── */}
            {me && <MyRankBar me={me} nemesis={nemesis} metric={metricFilter} />}

            {/* ── LEAGUE ELEVATION INVITATION (The Wax Seal Experience) ── */}
            {showPromo && (
                <LeagueElevationInvitation
                    stats={(() => {
                        // 生涯總訓練次數（本機真實）：跑步 workout_history + 重訓 trainingRecords
                        let lifetimeCount = 0;
                        try {
                            const wh = JSON.parse(localStorage.getItem('workout_history') || '[]');
                            if (Array.isArray(wh)) lifetimeCount += wh.length;
                            const tr = JSON.parse(localStorage.getItem('trainingRecords') || '{}');
                            lifetimeCount += Object.keys(tr).length;
                        } catch (_) {}
                        const trainCount = lifetimeCount
                            || ((myProgress?.thisStrength?.count || 0) + (myProgress?.thisMonth?.count || 0));
                        // 有真實排行就用真實排名；沒有就用生涯次數推估一個合理百分位（次數越多越前面）
                        const hasBoard = !!(me && total);
                        // 🔴 沒有真實排行時不再「用訓練次數推估名次／百分位」—— 那是編出來的數字，
                        //    卡片上會被當成真實排名。缺就是缺，交給卡片顯示「—」。
                        const curRank = hasBoard ? me.rank : null;
                        const tgtRank = hasBoard ? (promoCount || Math.max(1, Math.ceil(total * 0.3))) : null;
                        const percentile = hasBoard
                            ? Math.max(0.1, Math.round((me.rank / total) * 1000) / 10)
                            : null;
                        return { currentRank: curRank, targetRank: tgtRank, total, trainCount, percentile };
                    })()}
                    onAccept={(newLeague) => {
                        setMyLeague(getCurrentLeague());
                        try { localStorage.setItem(`drvn_promo_claimed_${getUserId()}`, getCurrentSeasonId()); } catch (_) {}
                        setPromoClaimed(true);
                        setShowPromo(false);
                    }}
                    onDismiss={() => setShowPromo(false)}
                />
            )}
        </div>
    );
};

export default RunningPulseRanking;
