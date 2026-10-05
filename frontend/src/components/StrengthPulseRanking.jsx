import React, { useState, useMemo } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion';
import { Trophy, Zap, Flame, ChevronUp, Crosshair, TrendingUp, TrendingDown, Star, Shield, Crown, Sparkles, X, ChevronRight, Check } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import LeagueElevationInvitation from './LeagueElevationInvitation';
import { getCurrentLeague, getTargetLeague, LEAGUES as STORE_LEAGUES, getCurrentSeasonId, isMonthEndWindow, MIN_SETTLE_COHORT } from '../utils/leagueStore';
import { computeMonthlyProgress } from '../utils/personalProgress';
import LeagueStandingCard from './LeagueStandingCard';
import { CommunityMasthead } from './SocialFeed/CommunityChrome';
import { getUserId } from '../utils/auth';
import { haptic } from '../utils/haptics';

/* ══════════════════════════════════════════
   Color System — DRVN® Unified Palette
══════════════════════════════════════════ */
const C = {
    black: '#F6F4F1', paper: '#161415', stone: '#E4DED2',
    pebble: '#CFC6B8', coral: '#F95C4B', ember: '#D94030',
    card: '#FFFFFF', card2: '#FFFFFF',
    gold: '#F5C842', silver: '#B8B8B8', bronze: '#C6874A',
};

const triggerHaptic = (style = 'medium') => haptic(style);

/* 🔴 零模擬數據：原 MOCK_LIFTERS 假榜單已移除 — 榜單一律走真實 /leaderboard，無資料顯示空狀態 */

/* ══ Weight Classes (powerlifting style) ══ */
const WEIGHT_CLASSES = [
    { id: '66', label: '-66 kg', icon: '', color: '#6EE7B7', maxKg: 66 },
    { id: '74', label: '-74 kg', icon: '', color: '#F5C842', maxKg: 74 },
    { id: '83', label: '-83 kg', icon: '', color: C.coral, maxKg: 83 },
    { id: '93', label: '-93 kg', icon: '', color: C.pebble, maxKg: 93 },
    { id: '105', label: '-105 kg', icon: '', color: C.silver, maxKg: 105 },
    { id: '120', label: '120+ kg', icon: '', color: C.bronze, maxKg: Infinity },
];
const getWeightClass = (bw) => WEIGHT_CLASSES.find(c => bw <= c.maxKg) || WEIGHT_CLASSES[WEIGHT_CLASSES.length - 1];

// League data comes from leagueStore (shared with Running ranking)

const TIME_TABS = [{ id: 'week', label: '本月' }, { id: 'month', label: '本季' }, { id: 'all', label: '總榜' }];
const CATEGORY_TABS = [
    { id: 'single_lift', label: '單項榜', Icon: Dumbbell },
    { id: 'total_weight', label: '總重量榜', Icon: Trophy },
    { id: 'consistency', label: '自律榜', Icon: Sparkles },
];

const LIFT_TABS = [
    { id: 'bench', label: '胸推', Icon: Dumbbell },
    { id: 'squat', label: '深蹲', Icon: ChevronUp },
    { id: 'deadlift', label: '硬舉', Icon: Flame },
    { id: 'hipThrust', label: '臀推', Icon: Zap },
];
const NUDGES = ['加油', '盯著你', '跟上', '衝'];

const LIFT_METRICS = ['bench', 'squat', 'deadlift', 'hipThrust'];
const isLiftCategory = (cat) => cat === 'single_lift' || cat === 'total_weight';

const LIFT_LABELS = {
    bench: '臥推',
    squat: '深蹲',
    deadlift: '硬舉',
    hipThrust: '臀推',
};

/* ══════════════════════════════════════════
   Helpers
══════════════════════════════════════════ */
const getLiftVal = (u, category, metric) => {
    if (category === 'consistency') return u.streak;
    if (category === 'total_weight') return u.bench + u.squat + u.deadlift + u.hipThrust;
    if (metric === 'bench') return u.bench;
    if (metric === 'squat') return u.squat;
    if (metric === 'deadlift') return u.deadlift;
    if (metric === 'hipThrust') return u.hipThrust;
    return 0;
};

const getPodiumVal = (u, category, metric) => {
    const v = getLiftVal(u, category, metric);
    return isLiftCategory(category) ? { big: `${v}`, unit: 'kg' } : { big: `${v}`, unit: 'd' };
};

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

const getNemesis = (sorted, myId) => { const i = sorted.findIndex(r => r.id === myId); return i > 0 ? sorted[i - 1] : null; };
const getBiggestMover = (arr) => arr.reduce((max, item) => item.rise > (max?.rise ?? -Infinity) ? item : max, null);

/* ══════════════════════════════════════════
   🌟 3D PARTICLE PODIUM
══════════════════════════════════════════ */
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
                    x: [Math.cos((deg * Math.PI) / 180) * r, Math.cos(((deg + 120) * Math.PI) / 180) * r, Math.cos(((deg + 240) * Math.PI) / 180) * r, Math.cos((deg * Math.PI) / 180) * r],
                    y: [Math.sin((deg * Math.PI) / 180) * r, Math.sin(((deg + 120) * Math.PI) / 180) * r, Math.sin(((deg + 240) * Math.PI) / 180) * r, Math.sin((deg * Math.PI) / 180) * r],
                    opacity: [0.9, 0.3, 0.9], scale: [1, 0.5, 1],
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
                    fontFamily: 'var(--font-body)', fontStyle: 'italic', pointerEvents: 'none',
                    textShadow: '0 4px 16px rgba(0,0,0,0.4)',
                    position: 'relative', zIndex: 2
                }}>
                    0{rank}
                </span>
            </motion.div>
        </div>
    );
};

const PodiumSlot = ({ user, glowColor, rank, barH, avatarSize, mt, category, metric, platformColor }) => {
    if (!user) return <div style={{ flex: 1 }} />;
    const { big, unit } = getPodiumVal(user, category, metric);
    const wc = getWeightClass(user.bodyWeight);

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
                    color: C.paper, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 900,
                    boxShadow: `0 4px 12px ${platformColor}44`
                }}>
                    {rank}
                </div>
            </div>

            {/* Score */}
            <p style={{
                fontSize: rank === 1 ? 42 : 28, fontWeight: 900, color: C.paper,
                lineHeight: 1, textAlign: 'center', margin: 0, letterSpacing: '-0.04em'
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

const PodiumSection = ({ lifters, category, metric }) => {
    const [second, first, third] = [lifters[1], lifters[0], lifters[2]];
    return (
        <div style={{ padding: '40px 16px 0', position: 'relative' }}>
            <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '90%', height: 120, background: `radial-gradient(ellipse, ${C.gold}18 0%, ${C.silver}10 40%, transparent 70%)`, filter: 'blur(20px)', pointerEvents: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 272, position: 'relative' }}>
                <PodiumSlot user={second} rank={2} glowColor={C.silver} barH={96} avatarSize={54} mt={12} category={category} metric={metric} platformColor={C.silver} />
                <PodiumSlot user={first} rank={1} glowColor={C.gold} barH={128} avatarSize={72} mt={0} category={category} metric={metric} platformColor={C.gold} />
                <PodiumSlot user={third} rank={3} glowColor={C.bronze} barH={72} avatarSize={46} mt={20} category={category} metric={metric} platformColor={C.bronze} />
            </div>
        </div>
    );
};

/* ══════════════════════════════════════════
   🎖️ LEAGUE PROMOTION MODAL (Rolls-Royce)
══════════════════════════════════════════ */



/* ══════════════════════════════════════════
   Biggest Mover Card
══════════════════════════════════════════ */
const BiggestMoverCard = ({ mover, category, metric }) => {
    if (!mover) return null;
    const liftVal = getLiftVal(mover, category, metric);
    const liftUnit = isLiftCategory(category) ? 'kg' : 'd';
    const liftLbl = category === 'total_weight' ? '總量' : category === 'consistency' ? '連續' : LIFT_LABELS[metric];

    return (
        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.12 }}
            style={{
                margin: '0 16px 14px', 
                background: C.coral,
                borderRadius: 4, padding: '24px',
                display: 'flex', alignItems: 'flex-start', gap: 20,
                boxShadow: `0 24px 48px -12px ${C.coral}44`
            }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
                <img loading="lazy" decoding="async" src={mover.avatar} alt={mover.name} style={{ width: 64, height: 64, borderRadius: 0, objectFit: 'cover', border: `1px solid rgba(255,255,255,0.3)` }} />
            </div>
            <div style={{ flex: 1 }}>
                <p style={{ fontSize: 12, fontWeight: 900, color: C.black, letterSpacing: '0.3em', margin: '0 0 8px', opacity: 0.6 }}>本週焦點人物</p>
                <p style={{ fontSize: 32, fontWeight: 900, color: C.black, margin: 0, letterSpacing: '-0.05em', lineHeight: 0.95 }}>{mover.name}</p>
                <p style={{ fontSize: 11, fontWeight: 700, color: C.black, margin: '12px 0 0', letterSpacing: '0.05em' }}>
                    RANK CLIMB +{mover.rise} / {liftVal}{liftUnit} {liftLbl}
                </p>
            </div>
            <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 56, fontWeight: 900, color: C.black, fontFamily: 'var(--font-display)', fontStyle: 'italic', lineHeight: 0.8 }}>{mover.rise}</span>
            </div>
        </motion.div>
    );
};

/* ══════════════════════════════════════════
   Nemesis Banner
══════════════════════════════════════════ */
const NemesisBanner = ({ nemesis, me, category, metric, onAction }) => {
    const myVal = getLiftVal(me, category, metric);
    const nemVal = getLiftVal(nemesis, category, metric);
    const gap = isLiftCategory(category) ? `${nemVal - myVal} kg` : `${nemVal - myVal}天`;
    const action = category === 'consistency' ? '去打卡' : '去訓練';
    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
            style={{
                margin: '14px 16px 0', 
                background: C.stone,
                border: `1px solid ${C.paper}10`, borderRadius: 4, padding: '20px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                boxShadow: `0 12px 32px -8px rgba(0,0,0,0.08)`,
                position: 'relative', overflow: 'hidden'
            }}>
            {/* Shimmer Effect */}
            <motion.div 
                style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                    zIndex: 1,
                    transform: 'skewX(-20deg)'
                }}
                animate={{ left: ['-100%', '200%'] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1 }}
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
 onClick={() => { triggerHaptic('medium'); onAction && onAction(); }}
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
   Weight Class Divider
══════════════════════════════════════════ */
const WeightClassDivider = ({ wc }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px 4px' }}>
        <span style={{ fontSize: 13 }}>{wc.icon}</span>
        <div style={{ flex: 1, height: 1, background: `${wc.color}35` }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <span style={{ fontSize: 9, fontWeight: 900, color: wc.color, letterSpacing: '0.2em', textTransform: 'uppercase' }}>{wc.label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: wc.color, opacity: 0.45, letterSpacing: '0.1em' }}>體重級別</span>
        </div>
        <div style={{ width: 30, height: 1, background: `${wc.color}35` }} />
    </div>
);

/* ══════════════════════════════════════════
   Rank Row with Nudge + Weight Class Dividers
══════════════════════════════════════════ */
const RankRow = ({ user, idx, category, metric, isPromo, isRele, onNudge, showWC, wcData }) => {
    const [showNudge, setShowNudge] = useState(false);
    const [sentNudge, setSentNudge] = useState(null);
    const x = useMotionValue(0);

    const handleDragEnd = (_, info) => {
        if (info.offset.x < -40 && !user.isMe) setShowNudge(true);
        animate(x, 0, { type: 'spring' });
    };
    const sendNudge = (emoji) => {
        setSentNudge(emoji); setShowNudge(false);
        if (onNudge) onNudge(user.id, emoji);
    };

    const val = getLiftVal(user, category, metric);
    const unit = isLiftCategory(category) ? 'kg' : 'd';
    const wc = getWeightClass(user.bodyWeight);

    return (
        <>
            {showWC && wcData && <WeightClassDivider wc={wcData} />}
            <motion.div initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(idx, 6) * 0.05 }}>
                <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 18, marginBottom: 2 }}>
                    <motion.div drag="x" dragConstraints={{ left: -60, right: 0 }} dragElastic={0.2} style={{ x }} onDragEnd={handleDragEnd}>
                        <div
                            onClick={() => !user.isMe && setShowNudge(v => !v)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 16, padding: '20px 16px',
                                borderRadius: user.isMe ? 14 : 0, cursor: 'pointer',
                                background: user.isMe ? `${C.coral}0E` : 'transparent',
                                borderLeft: user.isMe ? `2px solid ${C.coral}` : '2px solid transparent',
                                borderBottom: `1px solid ${C.paper}08`,
                                position: 'relative', transition: 'all 0.2s'
                            }}
                        >
                            {user.isTarget && !user.isMe && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: C.coral }} />}

                            <div style={{
                                width: 40, textAlign: 'left', flexShrink: 0,
                                fontSize: 24, fontWeight: 900,
                                color: user.isMe ? C.coral : C.paper,
                                letterSpacing: '-0.05em'
                            }}>
                                {user.rank < 10 ? `0${user.rank}` : user.rank}
                            </div>

                            <div style={{ position: 'relative', flexShrink: 0 }}>
                                <img loading="lazy" decoding="async" src={user.avatar} alt={user.name}
                                    style={{
                                        width: 44, height: 44, borderRadius: '50%', objectFit: 'cover',
                                        border: `1.5px solid ${user.isMe ? C.coral : 'rgba(255,255,255,0.1)'}`,
                                        padding: 2
                                    }}
                                />
                                {user.live && <div style={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: '50%', background: '#5A7A3A', border: `2px solid ${C.black}`, boxShadow: '0 0 8px #5A7A3A' }} />}
                                {(sentNudge || user.nudge) && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ position: 'absolute', top: -4, right: -4, fontSize: 12 }}>{sentNudge || user.nudge}</motion.div>}
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
                                    <span style={{ fontSize: 12, fontWeight: 900, color: C.paper, opacity: 0.4, letterSpacing: '0.1em' }}>連續 {user.streak} 天</span>
                                    {/* Weight class badge */}
                                    <span style={{ fontSize: 11, fontWeight: 900, padding: '1px 5px', borderRadius: 5, color: wc.color, background: `${wc.color}18`, letterSpacing: '0.08em', flexShrink: 0 }}>{wc.label}</span>
                                </div>
                            </div>

                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <p style={{
                                    fontSize: 24, fontWeight: 900,
                                    color: user.isMe ? C.coral : C.paper, margin: 0, lineHeight: 1,
                                    letterSpacing: '-0.04em'
                                }}>
                                    {val}<span style={{ fontSize: 11, fontWeight: 700, color: C.pebble, marginLeft: 2, fontStyle: 'normal' }}>{unit}</span>
                                </p>
                            </div>
                        </div>
                    </motion.div>

                    <AnimatePresence>
                        {showNudge && !user.isMe && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.16 }} style={{ overflow: 'hidden' }}>
                                <div style={{ margin: '2px 12px 4px', padding: '9px 14px', background: C.card2, borderRadius: '0 0 14px 14px', display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${C.paper}08`, borderTop: 'none' }}>
                                    <span style={{ fontSize: 12, fontWeight: 900, color: C.pebble, opacity: 0.45, flex: 1, letterSpacing: '0.1em' }}>向 {user.name} 發送挑釁</span>
                                    {NUDGES.map(e => (
                                        <motion.button {...pressProps('row')} key={e} onClick={() => { triggerHaptic('light'); sendNudge(e); }} style={{ height: 30, padding: '0 12px', fontSize: 11, fontWeight: 800, color: C.paper, letterSpacing: '0.04em', borderRadius: 8, background: `${C.paper}08`, border: `1px solid ${C.paper}10`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap' }}>{e}</motion.button>
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
   自律榜 (Consistency Board — now with podium logic above, so list is simplified)
══════════════════════════════════════════ */
const ConsistencyBoard = ({ sortedLifters }) => {
    return (
        <div style={{ padding: '4px 12px 0' }}>
            <div style={{ margin: '0 2px 12px', padding: '12px 16px', background: C.card2, borderRadius: 18, border: `1px solid ${C.paper}08` }}>
                <p style={{ fontSize: 9, fontWeight: 900, color: C.pebble, opacity: 0.4, letterSpacing: '0.2em', textTransform: 'uppercase', margin: '0 0 4px' }}>Consistency Leaderboard</p>
                <p style={{ fontSize: 12, fontWeight: 700, color: C.paper, opacity: 0.6, margin: 0, lineHeight: 1.5 }}>
                    這裡比的不是重量，是<span style={{ color: C.coral, fontWeight: 900 }}>自律</span>。連續打卡天數就是你的成績。
                </p>
            </div>
            {sortedLifters.map((user, idx) => {
                const cat = user.streak >= 21 ? { label: '傳奇', color: C.gold } : user.streak >= 14 ? { label: 'ON FIRE', color: C.coral } : user.streak >= 7 ? { label: '穩定', color: '#5A7A3A' } : { label: '起步', color: C.pebble };
                const pct = Math.min(100, (user.streak / 24) * 100);
                return (
                    <motion.div key={user.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(idx, 6) * 0.05 }}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 18, marginBottom: 2, background: user.isMe ? `${C.coral}14` : 'transparent', border: user.isMe ? `1px solid ${C.coral}28` : '1px solid transparent' }}>
                        <div style={{ width: 24, textAlign: 'center', fontSize: 13, fontWeight: 900, fontStyle: 'italic', color: user.isMe ? C.coral : `${C.paper}25`, flexShrink: 0 }}>{user.rank}</div>
                        <img loading="lazy" decoding="async" src={user.avatar} alt={user.name} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: `1.5px solid ${user.isMe ? C.coral : `${C.paper}12`}`, flexShrink: 0 }} />
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
                        <p style={{ fontSize: 24, fontWeight: 900, fontStyle: 'italic', color: user.isMe ? C.coral : C.paper, margin: 0, lineHeight: 1, flexShrink: 0 }}>
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
const MyRankBar = ({ me, nemesis, category, metric, onAction }) => {
    const myVal = getLiftVal(me, category, metric);
    const unit = isLiftCategory(category) ? 'kg' : 'd';
    const action = category === 'consistency' ? '去打卡' : '去訓練';
    const gapTxt = nemesis ? (() => {
        const diff = getLiftVal(nemesis, category, metric) - myVal;
        if (diff <= 0) return null;
        return isLiftCategory(category) ? `差 ${diff}kg 晉位` : `差 ${diff}天 晉位`;
    })() : null;
    return (
        <div style={{ position: 'sticky', bottom: 0, background: 'rgba(255, 255, 255, 0.45)', backdropFilter: 'blur(32px) saturate(1.8)', WebkitBackdropFilter: 'blur(32px) saturate(1.8)', borderTop: '1px solid rgba(255, 255, 255, 0.4)', paddingTop: 24, paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))', zIndex: 100 }}>
            {/* 深鈦牆＋coral 只給 pill（與跑步排行 MyRankBar 完全一致） */}
            <div style={{ margin: '0 16px', background: 'linear-gradient(165deg, #2A2724 0%, #161415 62%)', borderRadius: 18, padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12, border: '1px solid rgba(246,244,241,0.07)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 12px 34px rgba(22,20,21,0.22)' }}>
                <img loading="lazy" decoding="async" src={me.avatar} alt="me" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid rgba(246,244,241,0.18)' }} />
                <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 9, fontWeight: 800, color: 'rgba(246,244,241,0.45)', letterSpacing: '0.22em', textTransform: 'uppercase', margin: 0 }}>Your Ranking</p>
                    <p style={{ fontSize: 18, fontWeight: 300, color: '#F6F4F1', margin: '3px 0 0', fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1 }}>
                        #{me.rank} · {myVal}{unit}
                        {gapTxt && <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(246,244,241,0.45)', marginLeft: 8, fontFamily: 'var(--font-body)' }}>{gapTxt}</span>}
                    </p>
                </div>
                <motion.button {...pressProps('row')} onClick={() => { triggerHaptic('medium'); onAction && onAction(); }} style={{ background: C.coral, color: '#FFFFFF', fontSize: 9, fontWeight: 900, padding: '9px 16px', borderRadius: 999, border: 'none', cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{action}</motion.button>
            </div>
        </div>
    );
};

/* ══════════════════════════════════════════
   Main Component
══════════════════════════════════════════ */
const StrengthPulseRanking = () => {
    const [timeFilter, setTimeFilter] = useState('week');
    const [categoryFilter, setCategoryFilter] = useState('single_lift');
    const [metricFilter, setMetricFilter] = useState('bench');
    const [nudges, setNudges] = useState({});
    const [showPromo, setShowPromo] = useState(false);
    const [myLeague, setMyLeague] = useState(getCurrentLeague);
    const [promoClaimed, setPromoClaimed] = useState(() => {
        try { return localStorage.getItem(`drvn_promo_claimed_${getUserId()}`) === getCurrentSeasonId(); } catch { return false; }
    });

    const location = useLocation();
    const navigate = useNavigate();
    const isSeasonTab = timeFilter === 'month';

    // Navigation handler for action buttons
    const handleActionNav = (category) => {
        if (category === 'consistency') {
            // 去打卡 → 社群頁面 (feed tab, open post composer)
            navigate('/social-mobile', { state: { activeTab: 'feed', openCreate: true } });
        } else {
            // 去訓練 → LuxuryPlanView
            navigate('/luxury-plan-view-mobile');
        }
    };

    // Handle deep-link promo trigger from Dashboard
    React.useEffect(() => {
        if (location.state?.openInvitation) {
            setTimeFilter('month');
            setShowPromo(true);
            // Clear location state so we don't re-trigger
            window.history.replaceState({}, document.title);
        }
    }, [location.state]);

    React.useEffect(() => {
        const handler = () => setMyLeague(getCurrentLeague());
        window.addEventListener('leagueChanged', handler);
        return () => window.removeEventListener('leagueChanged', handler);
    }, []);

    React.useEffect(() => {
        if (!isSeasonTab) return;
        const now = new Date();
        const sunday = new Date(now);
        sunday.setDate(now.getDate() + (7 - now.getDay()) % 7 || 7);
        sunday.setHours(23, 59, 59, 0);
        const weekDiffH = Math.max(0, Math.floor((sunday - now) / 3600000));
        const alreadyShown = sessionStorage.getItem('strengthPromoShown');
        if (weekDiffH <= 48 && !alreadyShown) {
            const timer = setTimeout(() => {
                setShowPromo(true);
                sessionStorage.setItem('strengthPromoShown', '1');
            }, 1200);
            return () => clearTimeout(timer);
        }
    }, [isSeasonTab]);

    // 🟢 真實資料（同跑步榜模式）：/api/social/friends/leaderboard 帶回
    //    每位好友的真實單項最大重量（lifts）與訓練量。API 失敗 → 空榜，不擺假人。
    const [realLifters, setRealLifters] = useState([]);
    React.useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const { getUserId } = await import('../utils/auth');
                const { default: api } = await import('../api/client');
                const uid = getUserId();
                const res = await api.get(`/api/social/friends/leaderboard/${uid}`);
                const rows = res?.data?.leaderboard || [];
                const mapped = rows.map((r, i) => ({
                    id: r.user_id,
                    name: r.user_id === uid ? `${r.name}（我）` : r.name,
                    bodyWeight: r.metrics?.body_weight || 0,
                    bench: r.metrics?.lifts?.bench || 0,
                    squat: r.metrics?.lifts?.squat || 0,
                    deadlift: r.metrics?.lifts?.deadlift || 0,
                    hipThrust: r.metrics?.lifts?.hipThrust || 0,
                    totalVolume: r.metrics?.strength_volume || 0,
                    streak: r.metrics?.streak_days || 0,
                    rise: r.rise || 0, trend: r.trend || 0,
                    live: false, nudge: null,
                    avatar: r.avatar || null,
                    isMe: r.user_id === uid,
                }));
                if (alive) setRealLifters(mapped);
            } catch { if (alive) setRealLifters([]); }
        })();
        return () => { alive = false; };
    }, []);

    const sorted = useMemo(() => {
        return [...realLifters].sort((a, b) => {
            return getLiftVal(b, categoryFilter, metricFilter) - getLiftVal(a, categoryFilter, metricFilter);
        }).map((u, i) => ({ ...u, rank: i + 1 }));
    }, [realLifters, categoryFilter, metricFilter]);

    const top3 = sorted.slice(0, 3);
    const rest = sorted.slice(3);
    const me = sorted.find(r => r.isMe);
    const mover = getBiggestMover(realLifters);
    const nemesis = me ? getNemesis(sorted, me.id) : null;
    const total = sorted.length;

    // 跟自己比（本月 vs 上月）—— 與跑步排行同一支計算，不另寫一份（§8）
    const myProgress = useMemo(() => computeMonthlyProgress(), [sorted.length]);

    // 人數不足 MIN_SETTLE_COHORT 時沒有升降區（與 leagueStore.computeSettlement 同一門檻）
    const promoCount = total >= MIN_SETTLE_COHORT ? Math.ceil(total * 0.3) : 0;
    const releCount = total >= MIN_SETTLE_COHORT ? Math.ceil(total * 0.3) : 0;
    const isInPromoZone = me ? me.rank <= promoCount : false;

    // Weight class divider logic for lift leaderboards
    const getWCForRow = (user, idx, arr) => {
        if (!isLiftCategory(categoryFilter)) return { show: false, wc: null };
        const wc = getWeightClass(user.bodyWeight);
        if (idx === 0) return { show: true, wc };
        const prevWc = getWeightClass(arr[idx - 1].bodyWeight);
        return { show: wc.id !== prevWc.id, wc };
    };

    const handleNudge = (uid, emoji) => setNudges(n => ({ ...n, [uid]: emoji }));

    return (
        <div style={{ minHeight: '100dvh', width: '100%', background: 'transparent', color: C.paper,
            fontFamily: '"Plus Jakarta Sans",sans-serif', overflowX: 'hidden' }}>

            {/* ── MASTHEAD（統一：左飾條 + mono kicker + 黑鈦字母等距撐滿）── */}
            <div style={{
                padding: 'var(--community-content-top) 0 16px',
                background: 'transparent',
                zIndex: 40,
            }}>
                {/* 招牌收成一行 —— 與跑步排行／動態牆同一造型（介面標準 §9）。 */}
                {/* 招牌列 —— 共用組件（SocialFeed/CommunityChrome），
                    與動態／社團／我的同一條。右邊字標點一下換社群。 */}
                <CommunityMasthead community="fitness" tab="ranking" />
            </div>

            {/* ── STICKY FILTERS ── */}
            <div style={{
                position: 'sticky', top: 'var(--community-sticky-top)', zIndex: 60,
                background: 'rgba(255, 255, 255, 0.45)', backdropFilter: 'blur(32px) saturate(1.8)', WebkitBackdropFilter: 'blur(32px) saturate(1.8)',
                padding: '16px 24px 0', margin: '0 0 16px',
                borderBottom: `1px solid rgba(0,0,0,0.05)`
            }}>

                {/* Filters Simplified (Matches Running Style) */}
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

                {/* Top Level Category Chips */}
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: categoryFilter === 'single_lift' ? 8 : 12 }} className="no-scrollbar">
                    {CATEGORY_TABS.map(({ id, label, Icon }) => (
                        <motion.button {...pressProps('row')} key={id} onClick={() => { triggerHaptic('light'); setCategoryFilter(id); }}
 style={{
 display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 50, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
 fontSize: 11, fontWeight: 900,
 background: categoryFilter === id ? (id==='consistency'?'#4ADE80':C.coral) : C.card2,
 color: categoryFilter === id ? C.black : `${C.paper}50`,
 outline: categoryFilter === id ? 'none' : `1px solid ${C.paper}10`,
 transition: 'all 0.18s',
 boxShadow: categoryFilter === id ? `0 4px 14px ${id==='consistency'?'rgba(74,222,128,0.4)':C.coral+'44'}` : 'none'
 }}>
                            <Icon size={12} />{label}
                        </motion.button>
                    ))}
                </div>

                {/* Sub Level Lift Chips (Only if single_lift) */}
                <AnimatePresence mode="wait">
                    {categoryFilter === 'single_lift' && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 12, paddingTop: 4 }} className="no-scrollbar">
                                {LIFT_TABS.map(({ id, label, Icon }) => (
                                    <motion.button {...pressProps('row')} key={id} onClick={() => { triggerHaptic('light'); setMetricFilter(id); }}
 style={{
 display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 50, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
 fontSize: 11, fontWeight: 900,
 background: metricFilter === id ? `${C.paper}10` : 'transparent',
 color: metricFilter === id ? C.paper : `${C.paper}40`,
 border: `1px solid ${metricFilter === id ? `${C.paper}20` : `${C.paper}08`}`,
 transition: 'all 0.18s'
 }}>
                                        {label}
                                    </motion.button>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>


            {/* ── 本月成績單 —— 與跑步排行共用同一張卡（§9 同一語意同一長相）── */}
            {isSeasonTab && sorted.length > 0 && (
                <LeagueStandingCard
                    league={myLeague}
                    nextLeague={getTargetLeague(myLeague)}
                    rank={me?.rank}
                    total={total}
                    promoCount={promoCount}
                    releCount={releCount}
                    progress={myProgress}
                    kind="strength"
                    canClaim={isInPromoZone && !promoClaimed && isMonthEndWindow()}
                    onClaim={() => setShowPromo(true)}
                />
            )}

            {/* ── BIGGEST MOVER ── 移除：與領獎台第一名重複，一屏一焦點。
                <BiggestMoverCard mover={mover} category={categoryFilter} metric={metricFilter} /> */}

            {/* ── 沒資料 → 只顯示「去把資料補上」那一件事（§5）──────────────
                原本零資料時照樣畫領獎台、分隔線、空清單標題 —— 那是用四種方式
                把「我沒有資料」講四遍。整塊換掉，不是掛在下面。 */}
            {sorted.length === 0 ? (
                (() => {
                    const hasLifts = (myProgress?.thisStrength?.count || 0) > 0;
                    const label = hasLifts ? '去加訓練夥伴' : '去練第一次';
                    const route = hasLifts ? '/social' : '/luxury-plan-view-mobile';
                    return (
                        <motion.button {...pressProps('card')} onClick={() => { triggerHaptic('light'); navigate(route); }}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                                width: 'calc(100% - 32px)', margin: '8px 16px 0', padding: '22px',
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

            {/* ── PODIUM (Now active for all categories) ── */}
            <>
                {/* Active category/lift label above podium */}
                <div style={{ margin: '0 16px 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {categoryFilter === 'consistency' ? <Sparkles size={12} color="#4ADE80" style={{ opacity: 0.7 }} /> : <Dumbbell size={12} color={C.gold} style={{ opacity: 0.7 }} />}
                    <span style={{ fontSize: 12, fontWeight: 900, color: categoryFilter === 'consistency' ? '#4ADE80' : C.gold, letterSpacing: '0.2em', opacity: 0.8 }}>
                        {categoryFilter === 'consistency' ? '持續訓練' : categoryFilter === 'total_weight' ? '總訓練量' : LIFT_LABELS[metricFilter]}
                    </span>
                    <div style={{ flex: 1, height: 1, background: categoryFilter === 'consistency' ? '#4ADE8025' : `${C.gold}25` }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.pebble, opacity: 0.35 }}>
                        {categoryFilter === 'consistency' ? '連續王者' : '1RM 總覽'}
                    </span>
                </div>
                <PodiumSection lifters={top3} category={categoryFilter} metric={metricFilter} />
            </>

            {/* Divider */}
            <div style={{ margin: '16px 16px 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, height: 1, background: `${C.paper}08` }} />
                <span style={{ fontSize: 12, fontWeight: 900, color: C.pebble, opacity: 0.35, letterSpacing: '0.22em', }}>
                    {categoryFilter === 'consistency' ? '自律 · Consistency Board' : 'Rankings by Weight Class'}
                </span>
                <div style={{ flex: 1, height: 1, background: `${C.paper}08` }} />
            </div>

            {/* Zone hint 與 NEMESIS 已移除：晉升/降級改由列表分隔線表達，差距在底部 Your Ranking。一屏一焦點。 */}

            {/* ── LIST ── */}
            {categoryFilter === 'consistency' ? (
                <ConsistencyBoard sortedLifters={rest} />
            ) : (
                <div style={{ padding: '10px 12px 0', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 14px 6px', opacity: 0.3 }}>
                        <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.18em', color: C.pebble }}>訓練者</span>
                        <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.18em', color: C.pebble }}>
                            {categoryFilter === 'total_weight' ? '總量' : LIFT_LABELS[metricFilter] || metricFilter}
                        </span>
                    </div>
                    {rest.map((user, idx) => {
                        const { show, wc } = getWCForRow(user, idx, rest);
                        const isPromo = user.rank <= promoCount;
                        const isRele = user.rank > total - releCount;
                        const releStartRank = total - releCount + 1;
                        const showPromoLine = idx > 0 && rest[idx-1].rank === promoCount && !isPromo;
                        const showReleLine = idx > 0 && rest[idx-1].rank < releStartRank && user.rank >= releStartRank;
                        return (
                            <React.Fragment key={user.id}>
                                {showPromoLine && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 4px 4px' }}>
                                        <div style={{ flex: 1, height: 1, background: `rgba(22,20,21,0.08)` }} />
                                        <span style={{ fontSize: 12, fontWeight: 900, color: `${C.paper}40`, letterSpacing: '0.15em', whiteSpace: 'nowrap' }}>── 安全區 ──</span>
                                        <div style={{ flex: 1, height: 1, background: `rgba(22,20,21,0.08)` }} />
                                    </div>
                                )}
                                {showReleLine && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 4px 4px' }}>
                                        <div style={{ flex: 1, height: 1, background: 'rgba(252,165,165,0.3)' }} />
                                        <span style={{ fontSize: 12, fontWeight: 900, color: '#FCA5A5', letterSpacing: '0.15em', whiteSpace: 'nowrap', opacity: 0.7 }}>降級區</span>
                                        <div style={{ flex: 1, height: 1, background: 'rgba(252,165,165,0.3)' }} />
                                    </div>
                                )}
                                <RankRow
                                    user={{ ...user, nudge: nudges[user.id] || user.nudge }}
                                    idx={idx} category={categoryFilter} metric={metricFilter}
                                    isPromo={isPromo}
                                    isRele={isRele}
                                    onNudge={handleNudge}
                                    showWC={show} wcData={wc}
                                />
                            </React.Fragment>
                        );
                    })}
                    <div style={{ height: 80 }} />
                </div>
            )}

            </>
            )}

            {/* ── MY RANK BAR ── */}
            {me && <MyRankBar me={me} nemesis={nemesis} category={categoryFilter} metric={metricFilter} onAction={() => handleActionNav(categoryFilter)} />}

            {/* ── LEAGUE ELEVATION INVITATION ── */}
            {showPromo && (
                <LeagueElevationInvitation
                    onAccept={() => {
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

export default StrengthPulseRanking;
