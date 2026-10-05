import React from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { Trophy, Crown, TrendingUp, Zap, Medal, Sparkles, X } from 'lucide-react';
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
    gold: '#D4A853'
};

const SegmentEffortSummary = ({ efforts, onClose, onViewLeaderboard }) => {
    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const formatPace = fmtPaceMin;   // 🩹 J: 單一真相源（全站統一 M'SS" 樣式）

    const totalPRs = efforts.filter(e => e.is_pr).length;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
            <div
                className="w-full max-w-lg rounded-3xl p-8 relative overflow-hidden shadow-2xl"
                style={{ backgroundColor: PALETTE.background }}
            >
                {/* Confetti Background Effect */}
                {totalPRs > 0 && (
                    <div className="absolute inset-0 pointer-events-none overflow-hidden">
                        {[...Array(20)].map((_, i) => (
                            <div
                                key={i}
                                className="absolute w-2 h-2 rounded-full animate-bounce"
                                style={{
                                    backgroundColor: [PALETTE.gold, PALETTE.orange, PALETTE.terracotta][i % 3],
                                    left: `${Math.random() * 100}%`,
                                    top: `${Math.random() * 100}%`,
                                    animationDelay: `${Math.random() * 2}s`,
                                    animationDuration: `${2 + Math.random() * 2}s`
                                }}
                            />
                        ))}
                    </div>
                )}

                {/* Close Button */}
                <motion.button {...pressProps('icon')} aria-label="關閉"
 onClick={onClose}
 className="absolute top-4 right-4 p-2 rounded-full hover:bg-stone-200 transition-colors z-10"
 >
                    <X size={20} style={{ color: PALETTE.warmGray }} />
                </motion.button>

                {/* Header */}
                <div className="text-center mb-6 relative z-10">
                    <div className="flex justify-center mb-4">
                        <div
                            className="w-20 h-20 rounded-full flex items-center justify-center animate-pulse"
                            style={{ backgroundColor: `${PALETTE.orange}20` }}
                        >
                            <Trophy size={40} style={{ color: PALETTE.orange }} />
                        </div>
                    </div>
                    <h2 className="text-3xl font-black font-serif-elegant mb-2" style={{ color: PALETTE.espresso }}>
                        Segments Completed!
                    </h2>
                    <p className="text-lg" style={{ color: PALETTE.warmGray }}>
                        You completed <span className="font-bold" style={{ color: PALETTE.orange }}>{efforts.length}</span> segment{efforts.length > 1 ? 's' : ''}
                    </p>

                    {/* PR Badge */}
                    {totalPRs > 0 && (
                        <div className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-full animate-bounce" style={{ backgroundColor: `${PALETTE.gold}20`, border: `2px solid ${PALETTE.gold}` }}>
                            <Crown size={20} style={{ color: PALETTE.gold }} />
                            <span className="font-bold" style={{ color: PALETTE.gold }}>
                                {totalPRs} NEW PR{totalPRs > 1 ? 'S' : ''}!
                            </span>
                            <Sparkles size={20} style={{ color: PALETTE.gold }} />
                        </div>
                    )}
                </div>

                {/* Efforts List */}
                <div className="space-y-3 mb-6 max-h-[400px] overflow-y-auto relative z-10">
                    {efforts.map((effort, idx) => (
                        <div
                            key={effort.effort_id || idx}
                            className="paper-texture p-4 rounded-[18px] border border-stone-300 bg-white transition-all hover:shadow-md"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-bold text-lg font-serif-elegant" style={{ color: PALETTE.espresso }}>
                                        {effort.segment_name || `Segment ${idx + 1}`}
                                    </h3>
                                    {effort.is_pr && (
                                        <Crown size={18} style={{ color: PALETTE.gold }} />
                                    )}
                                </div>
                                {effort.is_pr && (
                                    <span
                                        className="px-2 py-1 rounded-full text-xs font-black uppercase tracking-wider"
                                        style={{ backgroundColor: `${PALETTE.gold}30`, color: PALETTE.gold }}
                                    >
                                        PR
                                    </span>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 rounded-lg" style={{ backgroundColor: `${PALETTE.olive}20` }}>
                                        <Trophy size={16} style={{ color: PALETTE.olive }} />
                                    </div>
                                    <div>
                                        <div className="text-xs" style={{ color: PALETTE.warmGray }}>
                                            Time
                                        </div>
                                        <div className="font-bold" style={{ color: PALETTE.espresso }}>
                                            {formatTime(effort.elapsed_time_seconds)}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <div className="p-2 rounded-lg" style={{ backgroundColor: `${PALETTE.terracotta}20` }}>
                                        <Zap size={16} style={{ color: PALETTE.terracotta }} />
                                    </div>
                                    <div>
                                        <div className="text-xs" style={{ color: PALETTE.warmGray }}>
                                            Pace
                                        </div>
                                        <div className="font-bold" style={{ color: PALETTE.espresso }}>
                                            {formatPace(effort.avg_pace)}/km
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* View Leaderboard Button */}
                            <motion.button {...pressProps('pill')}
 onClick={() => onViewLeaderboard(effort.segment_id)}
 className="w-full mt-3 py-2 rounded-xl font-bold text-sm hover:shadow-md "
 style={{
 backgroundColor: `${PALETTE.olive}15`,
 color: PALETTE.olive,
 border: `1px solid ${PALETTE.olive}`
 }}
 >
                                View Leaderboard
                            </motion.button>
                        </div>
                    ))}
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-1 gap-3 relative z-10">
                    <motion.button {...pressProps('pill')}
 onClick={onClose}
 className="py-4 rounded-xl font-bold shadow-lg"
 style={{
 background: `linear-gradient(135deg, ${PALETTE.orange}, #D94030)`,
 color: 'white'
 }}
 >
                        AWESOME!
                    </motion.button>
                </div>
            </div>
        </div>
    );
};

export default SegmentEffortSummary;
