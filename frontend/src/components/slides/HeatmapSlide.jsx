import React from 'react';
import { motion } from 'framer-motion';

/**
 * HeatmapSlide - "My Notes" Style
 * Blue Card, Orange Filled Body Parts, Focus Breakdown
 */
const HeatmapSlide = ({ muscleData, muscleVolumes, primaryFocus }) => {
    // Helper to get color
    const getFill = (muscle) => {
        const value = muscleData?.[muscle] || 0;
        if (value > 0) return "#FF9F76"; // Active - Orange (Any activity)
        return "rgba(255, 255, 255, 0.4)"; // Inactive - Whiteish
    };

    // Calculate percentages for breakdown
    const getBreakdown = () => {
        if (!muscleData) return [];
        const total = Object.values(muscleData).reduce((sum, val) => sum + val, 0);
        if (total === 0) return [];

        return Object.entries(muscleData)
            .filter(([_, val]) => val > 0)
            .filter(([_, val]) => val > 0)
            .sort((a, b) => b[1] - a[1]) // Sort desc
            .map(([key, val]) => ({
                name: key,
                pct: Math.round((val / total) * 100),
                volume: muscleVolumes?.[key] || 0
            }));
    };

    const breakdown = getBreakdown();

    return (
        <div className="w-full h-full bg-[#09090B] flex flex-col items-center justify-center p-4">
            <motion.div
                className="relative w-full h-full bg-[#B5D8F6] rounded-[36px] p-6 flex flex-col shadow-2xl border-4 border-black"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.6 }}
            >
                {/* Header */}
                <div className="mb-4">
                    <p className="text-black/50 font-bold uppercase tracking-widest text-xs mb-1">Impact Zone</p>
                    <h2 className="text-5xl font-black text-black leading-none tracking-tight capitalize">
                        {primaryFocus || 'Full Body'}
                    </h2>
                </div>

                {/* Body Map - Geometric Style */}
                <div className="flex-1 relative flex items-center justify-center my-4">
                    {/* Background Circle */}
                    <div className="absolute w-64 h-64 bg-white/30 rounded-full blur-xl"></div>

                    <svg viewBox="0 0 200 400" className="h-full drop-shadow-2xl z-10">
                        <g stroke="black" strokeWidth="5" strokeLinejoin="round">
                            {/* Head */}
                            <circle cx="100" cy="35" r="22" fill={getFill('shoulders')} />
                            {/* Torso */}
                            <path d="M70 60 L130 60 L120 130 L80 130 Z" fill={getFill('chest')} />
                            <path d="M80 130 L120 130 L115 170 L85 170 Z" fill={getFill('core')} />
                            {/* Arms */}
                            <rect x="40" y="70" width="20" height="60" rx="8" fill={getFill('arms')} />
                            <rect x="140" y="70" width="20" height="60" rx="8" fill={getFill('arms')} />
                            {/* Legs */}
                            <rect x="65" y="180" width="28" height="90" rx="8" fill={getFill('legs')} />
                            <rect x="107" y="180" width="28" height="90" rx="8" fill={getFill('legs')} />
                        </g>

                        {/* Pulse Effect */}
                        {Object.entries(muscleData || {}).map(([key, val], i) => val > 0 && (
                            <motion.g key={key}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: [0, 0.4, 0] }}
                                transition={{ duration: 1.5, repeat: Infinity, delay: Math.min(i, 6) * 0.2 }}
                            >
                                {key === 'shoulders' && <circle cx="100" cy="35" r="22" fill="#FF9F76" />}
                                {key === 'chest' && <path d="M70 60 L130 60 L120 130 L80 130 Z" fill="#FF9F76" />}
                                {key === 'core' && <path d="M80 130 L120 130 L115 170 L85 170 Z" fill="#FF9F76" />}
                                {key === 'arms' && (<><rect x="40" y="70" width="20" height="60" rx="8" fill="#FF9F76" /><rect x="140" y="70" width="20" height="60" rx="8" fill="#FF9F76" /></>)}
                                {key === 'legs' && (<><rect x="65" y="180" width="28" height="90" rx="8" fill="#FF9F76" /><rect x="107" y="180" width="28" height="90" rx="8" fill="#FF9F76" /></>)}
                            </motion.g>
                        ))}
                    </svg>
                </div>

                {/* Focus Breakdown "Sticker" */}
                <div className="bg-white rounded-[18px] p-4 border-2 border-black shadow-[4px_4px_0px_rgba(0,0,0,1)] relative z-10 w-full mb-8">
                    <p className="text-xs font-bold text-black border-b border-black/10 pb-2 mb-2 uppercase">Focus Breakdown</p>
                    <div className="flex justify-between gap-2">
                        {breakdown.length > 0 ? breakdown.map((item, idx) => (
                            <div key={idx} className="flex flex-col items-center flex-1">
                                <span className="text-xl font-black text-black leading-none">{item.volume > 1000 ? `${(item.volume / 1000).toFixed(1)}k` : item.volume}</span>
                                <span className="text-[9px] font-bold text-black/50 uppercase mt-0.5">{item.name} (kg)</span>
                            </div>
                        )) : (
                            <div className="text-center w-full text-xs font-bold text-black/40">No activity data</div>
                        )}
                    </div>
                </div>

            </motion.div>
        </div>
    );
};

export default HeatmapSlide;
