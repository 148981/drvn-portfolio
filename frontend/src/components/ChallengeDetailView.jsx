import React, { useState, useEffect } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, ArrowLeft, Users, Calendar, Target, TrendingUp, Award, Clock } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { getUserId } from '../utils/auth';
import { confirmDialog } from '../utils/toast';

import apiClient from '../api/client';

// ── DRVN 色票 ──
const C = {
    bg:          '#F6F4F1',
    stone:       '#E4DED2',
    pebble:      '#CFC6B8',
    coral:       '#F95C4B',
    textPrimary: '#161415',
    textMuted:   '#8A7E73',
    cardDark:    '#161618',
};

// 向後相容（防止其他組件用到 COLORS）
const COLORS = { bg: C.bg, card: '#FFFFFF', primary: C.textPrimary, secondary: C.textMuted, accent: C.coral };

// Circular Progress Component
const CircularProgress = ({ value, size = 120, strokeWidth = 10 }) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (value / 100) * circumference;

    return (
        <div className="relative" style={{ width: size, height: size }}>
            <svg className="transform -rotate-90" width={size} height={size}>
                <defs>
                    <linearGradient id="detailProgressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style={{ stopColor: '#F95C4B', stopOpacity: 1 }} />
                        <stop offset="50%" style={{ stopColor: '#E4DED2', stopOpacity: 1 }} />
                        <stop offset="100%" style={{ stopColor: '#F95C4B', stopOpacity: 1 }} />
                    </linearGradient>
                </defs>
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="#F95C4B"
                    strokeWidth={strokeWidth}
                    fill="none"
                    opacity="0.3"
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="url(#detailProgressGradient)"
                    strokeWidth={strokeWidth}
                    fill="none"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    className="transition-all duration-700"
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-[#4A3F35]">{Math.round(value)}%</span>
                <span className="text-xs text-[#8B7F72]">Complete</span>
            </div>
        </div>
    );
};

// Participant Card Component
const ParticipantCard = ({ participant, rank, isCurrentUser }) => {
    const getRankIcon = () => {
        if (rank === 1) return '🥇';
        if (rank === 2) return '🥈';
        if (rank === 3) return '🥉';
        return `#${rank}`;
    };

    const progress = participant.goal_value > 0
        ? ((participant.progress || 0) / participant.goal_value) * 100
        : 0;

    return (
        <motion.div
            className={`p-4 rounded-xl border transition-all ${isCurrentUser ? 'bg-[#9BAF9E]/10 border-[#9BAF9E]' : 'bg-white border-[#E8DCC8]'
                }`}
            whileHover={{ scale: 1.02 }}
        >
            <div className="flex items-center gap-4">
                <div className="text-2xl font-bold w-10 text-center">
                    {getRankIcon()}
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-[#4A3F35]">{participant.user_name || participant.user_id}</span>
                        {isCurrentUser && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-[#F95C4B] text-[#161415] font-bold">You</span>
                        )}
                    </div>
                    <div className="w-full bg-[#F6F4F1] rounded-full h-2 overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-[#9BAF9E] to-[#7A9B7F] transition-all duration-700"
                            style={{ width: `${Math.min(progress, 100)}%` }}
                        />
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-lg font-bold text-[#4A3F35]">{(participant.progress || 0).toFixed(1)}</div>
                    <div className="text-xs text-[#8B7F72]">/ {participant.goal_value || 0}</div>
                </div>
            </div>
        </motion.div>
    );
};

const ChallengeDetailView = () => {
    const navigate = useNavigate();
    const { challengeId } = useParams();
    // 🔧 FIX: Always use latest userId from localStorage
    const userId = getUserId();
    const [challenge, setChallenge] = useState(null);
    const [progress, setProgress] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchChallengeDetails();
    }, [challengeId]);

    const fetchChallengeDetails = async () => {
        try {
            setLoading(true);
            console.log('🔍 [Detail] Fetching challenge details for:', challengeId, 'userId:', userId);
            // 🔧 FIX: Pass userId as query parameter
            const response = await apiClient.get(`/api/challenges/${challengeId}/progress`, {
                params: { user_id: userId }
            });
            console.log('📊 [Detail] Received progress data:', response.data);
            if (response.data.participants) {
                console.log('👥 [Detail] Participants First Item:', response.data.participants[0]);
                const foundUser = response.data.participants.find(p => p.user_id === userId);
                console.log('👤 [Detail] Found current user in participants:', foundUser ? 'YES' : 'NO', foundUser);
            }
            setChallenge(response.data.challenge);
            setProgress(response.data);
        } catch (error) {
            console.error('Failed to load challenge details:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-[100dvh] flex items-center justify-center page-top-safe" style={{ background: C.bg }}>
                <div style={{
                    width: '40px', height: '40px', borderRadius: '50%',
                    border: `3px solid ${C.pebble}`,
                    borderTopColor: C.coral,
                    animation: 'spin 0.8s linear infinite',
                }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    if (!challenge || !progress) {
        return (
            <div className="min-h-[100dvh] flex items-center justify-center" style={{ background: C.bg }}>
                <div className="text-center px-8">
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: C.textMuted, marginBottom: '20px' }}>
                        找不到挑戰
                    </p>
                    <motion.button {...pressProps('row')}
 onClick={() => navigate('/social-mobile')}
 style={{
 padding: '12px 28px', borderRadius: '100px',
 background: C.coral, color: '#fff',
 fontFamily: 'var(--font-body)', fontSize: '12px',
 fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
 border: 'none', cursor: 'pointer',
 }}
 >
                        返回挑戰
                    </motion.button>
                </div>
            </div>
        );
    }

    const daysLeft = Math.ceil((new Date(challenge.end_date) - new Date()) / (1000 * 60 * 60 * 24));
    const userParticipant = progress.participants?.find(p => p.user_id === userId);
    const currentProgressValue = userParticipant?.current_progress || userParticipant?.progress || progress.total_progress || 0;
    const totalProgress = challenge.goal_value > 0 ? (currentProgressValue / challenge.goal_value) * 100 : 0;
    const sortedParticipants = progress.participants
        ? [...progress.participants].sort((a, b) => (b.current_progress || b.progress || 0) - (a.current_progress || a.progress || 0))
        : [];
    const getGoalLabel = () => {
        const labels = { distance: 'km', duration: 'min', frequency: '次', streak: '天' };
        return labels[challenge.goal_type] || '';
    };

    // ── 開場 Curtain Reveal 動畫 variants ──
    const curtainLeft =  { hidden: { x: 0 }, visible: { x: '-100%', transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.1 } } };
    const curtainRight = { hidden: { x: 0 }, visible: { x: '100%',  transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.1 } } };
    const fadeUp =       { hidden: { opacity: 0, y: 40 }, visible: (d) => ({ opacity: 1, y: 0, transition: { delay: d * 0.08 + 0.5, type: 'spring', stiffness: 260, damping: 22 } }) };

    return (
        <motion.div
            initial="hidden"
            animate="visible"
            style={{ minHeight: '100dvh', background: C.bg, fontFamily: 'var(--font-body)', maxWidth: '430px', margin: '0 auto', position: 'relative', overflow: 'hidden' }}
        >
            {/* ── Curtain Reveal — 兩扇幕 ── */}
            <motion.div variants={curtainLeft} style={{ position: 'fixed', inset: 0, zIndex: 100, background: C.textPrimary, transformOrigin: 'left', pointerEvents: 'none' }} />
            <motion.div variants={curtainRight} style={{ position: 'fixed', inset: 0, zIndex: 100, background: C.textPrimary, transformOrigin: 'right', left: '50%', pointerEvents: 'none' }} />

            {/* ── Hero Banner ── */}
            <div style={{ position: 'relative', height: '340px', overflow: 'hidden' }}>
                {/* BG */}
                <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(135deg, #1A2A1A 0%, #0D0D14 100%)',
                }} />
                <div style={{
                    position: 'absolute', inset: 0,
                    backgroundImage: `url('https://picsum.photos/seed/${challenge.id || challengeId}/800/500')`,
                    backgroundSize: 'cover', backgroundPosition: 'center',
                    opacity: 0.2, filter: 'saturate(0.4)',
                }} />
                <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(180deg, transparent 20%, rgba(10,10,10,0.96) 100%)',
                }} />

                {/* Back button */}
                <motion.button {...pressProps('row')}
 onClick={() => navigate(-1)}
 style={{
 position: 'absolute', top: '52px', left: '20px', zIndex: 10,
 width: '36px', height: '36px', borderRadius: '50%',
 background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
 display: 'flex', alignItems: 'center', justifyContent: 'center',
 cursor: 'pointer',
 }}
 >
                    <ArrowLeft size={16} color="#fff" />
                </motion.button>

                {/* Status badge */}
                <motion.div
                    custom={0} variants={fadeUp}
                    style={{
                        position: 'absolute', top: '52px', left: '50%', transform: 'translateX(-50%)',
                        padding: '6px 16px', borderRadius: '100px',
                        border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.08)',
                    }}
                >
                    <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>
                        {daysLeft > 0 ? `${daysLeft} 天後截止` : '已結束'} · 官方挑戰
                    </span>
                </motion.div>

                {/* Bottom text */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 24px 28px' }}>
                    <motion.div custom={1} variants={fadeUp}>
                        <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.25em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                            官方挑戰
                        </span>
                    </motion.div>
                    <motion.h1 custom={2} variants={fadeUp} style={{ fontSize: '36px', fontWeight: 900, color: '#fff', lineHeight: 1.05, letterSpacing: '-0.02em', marginBottom: '4px' }}>
                        {challenge.name}
                    </motion.h1>
                    <motion.div custom={3} variants={fadeUp} style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
                        {challenge.name?.toUpperCase().replace(/[一-龥]/g, '') || 'CHALLENGE'}
                    </motion.div>
                </div>
            </div>

            {/* ── 內容區 ── */}
            <div style={{ padding: '0 20px 120px', background: C.bg }}>

                {/* 描述 */}
                <motion.div custom={4} variants={fadeUp} style={{ padding: '24px 0 20px', borderBottom: `1px solid ${C.stone}` }}>
                    <p style={{ fontSize: '14px', color: C.textMuted, lineHeight: 1.7 }}>{challenge.description}</p>
                </motion.div>

                {/* TARGET */}
                <motion.div custom={5} variants={fadeUp} style={{ padding: '24px 0 20px', borderBottom: `1px solid ${C.stone}` }}>
                    <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.3em', color: C.coral, textTransform: 'uppercase', display: 'block', marginBottom: '10px' }}>
                        TARGET
                    </span>
                    <p style={{ fontSize: '18px', fontWeight: 700, color: C.textPrimary }}>
                        {challenge.goal_value} <span style={{ fontSize: '14px', fontWeight: 500, color: C.textMuted }}>{getGoalLabel()}</span>
                    </p>
                </motion.div>

                {/* PROGRESS */}
                <motion.div custom={6} variants={fadeUp} style={{ padding: '24px 0 20px', borderBottom: `1px solid ${C.stone}` }}>
                    <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.3em', color: C.coral, textTransform: 'uppercase', display: 'block', marginBottom: '10px' }}>
                        PROGRESS
                    </span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '12px' }}>
                        <span style={{ fontSize: '56px', fontWeight: 900, color: C.textPrimary, lineHeight: 1, letterSpacing: '-0.03em', fontFamily: 'var(--font-display)' }}>
                            {currentProgressValue.toFixed(1)}
                        </span>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: C.textMuted }}>/ {challenge.goal_value} {getGoalLabel()}</span>
                    </div>
                    {/* Progress bar */}
                    <div style={{ height: '3px', background: C.stone, borderRadius: '2px', overflow: 'hidden' }}>
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(totalProgress, 100)}%` }}
                            transition={{ delay: 0.9, duration: 0.8, ease: 'easeOut' }}
                            style={{ height: '100%', background: C.coral, borderRadius: '2px' }}
                        />
                    </div>
                    <span style={{ fontSize: '10px', color: C.textMuted, marginTop: '8px', display: 'block' }}>
                        {Math.max(0, challenge.goal_value - currentProgressValue).toFixed(1)} {getGoalLabel()} REMAINING
                    </span>
                </motion.div>

                {/* REWARDS */}
                <motion.div custom={7} variants={fadeUp} style={{ padding: '24px 0 20px', borderBottom: `1px solid ${C.stone}` }}>
                    <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.3em', color: C.coral, textTransform: 'uppercase', display: 'block', marginBottom: '14px' }}>
                        REWARDS
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                            <span style={{ fontSize: '11px', fontWeight: 900, color: C.pebble, fontFamily: '"DM Mono", monospace', flexShrink: 0 }}>01</span>
                            <span style={{ fontSize: '14px', fontWeight: 600, color: C.textPrimary }}>
                                {challenge.reward_description || '完成挑戰獲得專屬徽章'}
                            </span>
                        </div>
                        {challenge.reward_points > 0 && (
                            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                                <span style={{ fontSize: '11px', fontWeight: 900, color: C.pebble, fontFamily: '"DM Mono", monospace', flexShrink: 0 }}>02</span>
                                <span style={{ fontSize: '14px', fontWeight: 600, color: C.textPrimary }}>
                                    +{challenge.reward_points} XP
                                </span>
                            </div>
                        )}
                    </div>
                </motion.div>

                {/* LEADERBOARD */}
                {sortedParticipants.length > 0 && (
                    <motion.div custom={8} variants={fadeUp} style={{ padding: '24px 0 20px' }}>
                        <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.3em', color: C.coral, textTransform: 'uppercase', display: 'block', marginBottom: '14px' }}>
                            LEADERBOARD
                        </span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {sortedParticipants.slice(0, 5).map((participant, index) => {
                                const pProgress = participant.current_progress || participant.progress || 0;
                                const pPct = challenge.goal_value > 0 ? Math.min((pProgress / challenge.goal_value) * 100, 100) : 0;
                                const isMe = participant.user_id === userId;
                                const rankLabels = ['01', '02', '03', '04', '05'];
                                return (
                                    <div key={participant.user_id} style={{
                                        display: 'flex', alignItems: 'center', gap: '14px',
                                        padding: '14px 16px', borderRadius: '18px',
                                        background: isMe ? `${C.coral}10` : C.stone,
                                        border: isMe ? `1px solid ${C.coral}30` : '1px solid transparent',
                                    }}>
                                        <span style={{ fontSize: '11px', fontWeight: 900, color: index === 0 ? C.coral : C.pebble, fontFamily: '"DM Mono", monospace', width: '20px' }}>
                                            {rankLabels[index]}
                                        </span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                                <span style={{ fontSize: '13px', fontWeight: 700, color: C.textPrimary, truncate: true }}>
                                                    {participant.user_name || participant.user_id}
                                                </span>
                                                {isMe && <span style={{ fontSize: '9px', fontWeight: 800, color: C.coral, padding: '2px 6px', background: `${C.coral}15`, borderRadius: '100px' }}>你</span>}
                                            </div>
                                            <div style={{ height: '2px', background: C.pebble, borderRadius: '1px', overflow: 'hidden' }}>
                                                <div style={{ height: '100%', width: `${pPct}%`, background: isMe ? C.coral : C.textMuted, borderRadius: '1px', transition: 'width 0.6s ease' }} />
                                            </div>
                                        </div>
                                        <span style={{ fontSize: '13px', fontWeight: 800, color: C.textPrimary, flexShrink: 0 }}>
                                            {pProgress.toFixed(1)} <span style={{ fontSize: '10px', fontWeight: 500, color: C.textMuted }}>{getGoalLabel()}</span>
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </div>

            {/* ── 底部 CTA ── */}
            <motion.div
                custom={9} variants={fadeUp}
                style={{
                    position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
                    width: '100%', maxWidth: '430px',
                    padding: '16px 20px 36px',
                    background: `linear-gradient(180deg, transparent 0%, ${C.bg} 40%)`,
                    display: 'flex', gap: '10px',
                }}
            >
                <motion.button {...pressProps('row')}
 onClick={async () => {
 if (!(await confirmDialog(`確定要退出「${challenge.name}」挑戰嗎？`, { danger: true }))) return;
 try {
 await apiClient.post(`/api/challenges/${challengeId}/leave`, null, { params: { user_id: userId } });
 navigate('/social-mobile');
 } catch (e) { console.error(e); }
 }}
 style={{
 padding: '14px 20px', borderRadius: '100px',
 border: `1px solid ${C.pebble}`, background: 'transparent',
 color: C.textMuted, fontWeight: 800, fontSize: '11px',
 letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
 flexShrink: 0,
 }}
 >
                    退出
                </motion.button>
                <motion.button {...pressProps('row')}
 style={{
 flex: 1, padding: '14px', borderRadius: '100px',
 background: C.coral, border: 'none', color: '#fff',
 fontWeight: 900, fontSize: '12px',
 letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
 }}
 >
                    繼續挑戰
                </motion.button>
            </motion.div>
        </motion.div>
    );
};

export default ChallengeDetailView;
