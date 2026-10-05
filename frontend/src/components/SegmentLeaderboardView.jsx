/* ⚠️ 死碼 — 全專案零引用（2026-09 社群稽核）
   ────────────────────────────────────────────────────────────────
   零 import。路段排行實際由 SegmentExplorerMobile / RunningPulseRanking 承接。
   保留只是因為稽核當下沒有直接刪檔的權限；確認過沒有其他用途後
   可以整支移除，不影響任何畫面。 */
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { Trophy, Crown, TrendingUp, Clock, Zap, Medal, ChevronDown, X } from 'lucide-react';
import apiClient from '../api/client';
import { getUserId } from '../utils/auth';
import { formatPaceMin as fmtPaceMin } from '../utils/format';


const PALETTE = {
    background: '#F5F1E8',
    olive: '#5C6B4A',
    terracotta: '#B88A7A',
    espresso: '#3E2723',
    warmGray: '#9E9386',
    orange: '#F95C4B',
    beige: '#E8DCC8',
    stone: '#D4C5B0',
    gold: '#D4A853',
    silver: '#C0C0C0',
    bronze: '#CD7F32'
};

const SegmentLeaderboardView = ({ segmentId, userId = getUserId(), onClose }) => {
    const [segment, setSegment] = useState(null);
    const [leaderboard, setLeaderboard] = useState([]);
    const [myEfforts, setMyEfforts] = useState([]);
    const [personalRecord, setPersonalRecord] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showMyEfforts, setShowMyEfforts] = useState(false);

    useEffect(() => {
        fetchLeaderboard();
        fetchMyEfforts();
    }, [segmentId]);

    const fetchLeaderboard = async () => {
        try {
            setLoading(true);
            const response = await apiClient.get(`/api/segments/${segmentId}/leaderboard`);
            setSegment(response.data.segment);
            setLeaderboard(response.data.leaderboard);
        } catch (error) {
            console.error('Error fetching leaderboard:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchMyEfforts = async () => {
        try {
            const response = await apiClient.get(`/api/segments/${segmentId}/my-efforts?user_id=${userId}`);
            setMyEfforts(response.data.efforts);
            setPersonalRecord(response.data.personal_record);
        } catch (error) {
            console.error('Error fetching my efforts:', error);
        }
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const formatPace = fmtPaceMin;   // 🩹 J: 單一真相源（全站統一 M'SS" 樣式）

    const getRankColor = (rank) => {
        if (rank === 1) return PALETTE.gold;
        if (rank === 2) return PALETTE.silver;
        if (rank === 3) return PALETTE.bronze;
        return PALETTE.stone;
    };

    const getRankIcon = (rank) => {
        if (rank === 1) return <Crown size={24} style={{ color: PALETTE.gold }} />;
        if (rank === 2) return <Medal size={24} style={{ color: PALETTE.silver }} />;
        if (rank === 3) return <Medal size={24} style={{ color: PALETTE.bronze }} />;
        return <span className="text-lg font-bold" style={{ color: PALETTE.warmGray }}>#{rank}</span>;
    };

    const myRank = leaderboard.findIndex(e => e.user_id === userId) + 1;

    if (loading) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className="bg-white p-8 rounded-[18px]">
                    <div className="text-4xl mb-4 animate-bounce">🏆</div>
                    <div className="text-lg font-semibold" style={{ color: PALETTE.espresso }}>
                        Loading leaderboard...
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto" style={{ backgroundColor: PALETTE.background }}>
            {/* Header */}
            <div className="sticky top-0 z-10 backdrop-blur-lg p-6 border-b border-stone-300" style={{ backgroundColor: `${PALETTE.background}ee` }}>
                <div className="max-w-4xl mx-auto">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <Trophy size={32} style={{ color: PALETTE.terracotta }} />
                            <div>
                                <h1 className="text-3xl font-black font-serif-elegant" style={{ color: PALETTE.espresso }}>
                                    {segment?.name}
                                </h1>
                                <p className="text-sm" style={{ color: PALETTE.warmGray }}>
                                    {(segment?.distance_meters / 1000).toFixed(2)} km • {segment?.total_attempts || 0} attempts
                                </p>
                            </div>
                        </div>
                        <motion.button {...pressProps('icon')} aria-label="關閉"
 onClick={onClose}
 className="p-2 rounded-full hover:bg-stone-200 transition-colors"
 >
                            <X size={24} style={{ color: PALETTE.warmGray }} />
                        </motion.button>
                    </div>

                    {/* User Stats */}
                    {personalRecord && (
                        <div className="grid grid-cols-3 gap-3">
                            <div className="p-3 rounded-xl border border-stone-300 bg-white">
                                <div className="text-xs uppercase tracking-wider mb-1" style={{ color: PALETTE.warmGray }}>
                                    Your Rank
                                </div>
                                <div className="text-2xl font-black" style={{ color: PALETTE.espresso }}>
                                    {myRank > 0 ? `#${myRank}` : 'N/A'}
                                </div>
                            </div>
                            <div className="p-3 rounded-xl border border-stone-300 bg-white">
                                <div className="text-xs uppercase tracking-wider mb-1" style={{ color: PALETTE.warmGray }}>
                                    Personal Best
                                </div>
                                <div className="text-2xl font-black" style={{ color: PALETTE.olive }}>
                                    {formatTime(personalRecord.best_time_seconds)}
                                </div>
                            </div>
                            <div className="p-3 rounded-xl border border-stone-300 bg-white">
                                <div className="text-xs uppercase tracking-wider mb-1" style={{ color: PALETTE.warmGray }}>
                                    Total Attempts
                                </div>
                                <div className="text-2xl font-black" style={{ color: PALETTE.terracotta }}>
                                    {myEfforts.length}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Leaderboard */}
            <div className="max-w-4xl mx-auto p-6">
                <h2 className="text-xl font-black font-serif-elegant mb-4" style={{ color: PALETTE.espresso }}>
                    Leaderboard
                </h2>

                {leaderboard.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-[18px] border border-stone-300">
                        <Trophy size={48} className="mx-auto mb-4" style={{ color: PALETTE.stone }} />
                        <p className="text-lg font-semibold" style={{ color: PALETTE.warmGray }}>
                            No attempts yet. Be the first!
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {leaderboard.map((effort, idx) => (
                            <LeaderboardCard
                                key={effort.effort_id}
                                effort={effort}
                                rank={effort.rank}
                                isCurrentUser={effort.user_id === userId}
                                formatTime={formatTime}
                                formatPace={formatPace}
                                getRankColor={getRankColor}
                                getRankIcon={getRankIcon}
                            />
                        ))}
                    </div>
                )}

                {/* My Efforts Section */}
                {myEfforts.length > 0 && (
                    <div className="mt-8">
                        <motion.button {...pressProps('cta')}
 onClick={() => setShowMyEfforts(!showMyEfforts)}
 className="w-full flex items-center justify-between p-4 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 transition-colors"
 >
                            <span className="font-bold" style={{ color: PALETTE.espresso }}>
                                My {myEfforts.length} Attempts
                            </span>
                            <ChevronDown
                                size={20}
                                style={{
                                    transform: showMyEfforts ? 'rotate(180deg)' : 'rotate(0)',
                                    transition: 'transform 0.2s'
                                }}
                            />
                        </motion.button>

                        {showMyEfforts && (
                            <div className="mt-3 space-y-2">
                                {myEfforts.map((effort, idx) => (
                                    <div
                                        key={effort.effort_id}
                                        className="p-4 rounded-xl border border-stone-200 bg-white flex items-center justify-between"
                                    >
                                        <div>
                                            <div className="text-sm" style={{ color: PALETTE.warmGray }}>
                                                {new Date(effort.timestamp).toLocaleDateString()}
                                            </div>
                                            <div className="text-lg font-bold" style={{ color: PALETTE.espresso }}>
                                                {formatTime(effort.elapsed_time_seconds)}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm" style={{ color: PALETTE.warmGray }}>
                                                Pace
                                            </div>
                                            <div className="text-lg font-bold" style={{ color: PALETTE.olive }}>
                                                {formatPace(effort.avg_pace)}/km
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// Leaderboard Card Component
const LeaderboardCard = ({ effort, rank, isCurrentUser, formatTime, formatPace, getRankColor, getRankIcon, leaderboard = [] }) => {
    return (
        <div
            className={`p-4 rounded-[18px] border transition-all ${isCurrentUser ? 'border-2 shadow-lg' : 'border-stone-300'
                }`}
            style={{
                backgroundColor: isCurrentUser ? `${PALETTE.beige}40` : 'white',
                borderColor: isCurrentUser ? PALETTE.orange : undefined
            }}
        >
            <div className="flex items-center gap-4">
                {/* Rank Badge */}
                <div
                    className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                        backgroundColor: `${getRankColor(rank)}20`,
                        border: `2px solid ${getRankColor(rank)}`
                    }}
                >
                    {getRankIcon(rank)}
                </div>

                {/* User Info */}
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-lg" style={{ color: PALETTE.espresso }}>
                            {isCurrentUser ? 'You' : `User ${effort.user_id.slice(-4)}`}
                        </span>
                        {effort.is_kom && (
                            <span className="px-2 py-0.5 rounded text-xs font-bold" style={{ backgroundColor: PALETTE.gold, color: 'white' }}>
                                KOM
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-4 text-sm mt-1" style={{ color: PALETTE.warmGray }}>
                        <div className="flex items-center gap-1">
                            <Clock size={14} />
                            {formatTime(effort.elapsed_time_seconds)}
                        </div>
                        <div className="flex items-center gap-1">
                            <Zap size={14} />
                            {formatPace(effort.avg_pace)}/km
                        </div>
                    </div>
                </div>

                {/* Time Difference (from leader) */}
                {rank > 1 && (
                    <div className="text-right">
                        <div className="text-xs" style={{ color: PALETTE.warmGray }}>
                            Behind
                        </div>
                        <div className="text-sm font-bold" style={{ color: PALETTE.terracotta }}>
                            +{formatTime(effort.elapsed_time_seconds - (leaderboard[0]?.elapsed_time_seconds || 0))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SegmentLeaderboardView;
