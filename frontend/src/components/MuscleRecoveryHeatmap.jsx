import React, { useState, useEffect, useRef } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';

const MuscleRecoveryHeatmap = ({ onSelect, selectedParts = [], recoveryScores = {} }) => {
    const [view, setView] = useState('front'); // 'front' or 'back'
    const [isFlipping, setIsFlipping] = useState(false);
    const [displayedView, setDisplayedView] = useState('front'); // 實際顯示的視圖（flip 完成後才切換）

    // Default recovery score is 100 (Fresh/Green) if not specified
    const getScore = (part) => recoveryScores[part] !== undefined ? recoveryScores[part] : 100;

    // Color scale: Red (0) -> Yellow (50) -> Green (100)
    const getColor = (score) => {
        if (score >= 90) return '#5A7A3A'; // Emerald 500
        if (score >= 70) return '#34D399'; // Emerald 400
        if (score >= 50) return '#FBBF24'; // Amber 400
        if (score >= 30) return '#F97316'; // Orange 500
        return '#EF4444'; // Red 500
    };

    // 疲勞部位脈衝動畫 keyframe id 管理
    const getPulse = (score) => score < 30;

    const handleViewChange = (newView) => {
        if (newView === view || isFlipping) return;
        setIsFlipping(true);
        // 翻轉到 90 度時才換內容（半程切換）
        setTimeout(() => setDisplayedView(newView), 220);
        setTimeout(() => {
            setView(newView);
            setIsFlipping(false);
        }, 440);
    };

    const BodyPart = ({ id, d }) => {
        const isSelected = selectedParts.includes(id);
        const score = getScore(id);
        const color = getColor(score);
        const shouldPulse = getPulse(score);

        return (
            <path
                d={d}
                fill={color}
                fillOpacity={0.8}
                stroke={isSelected ? 'white' : 'rgba(255,255,255,0.2)'}
                strokeWidth={isSelected ? "2" : "0.5"}
                style={{
                    transition: 'fill 0.6s ease, fill-opacity 0.6s ease, filter 0.3s ease',
                    filter: isSelected
                        ? 'drop-shadow(0 0 4px rgba(255,255,255,0.5))'
                        : shouldPulse
                            ? 'drop-shadow(0 0 6px rgba(239,68,68,0.6))'
                            : 'none',
                    animation: shouldPulse ? 'musclePulse 2s ease-in-out infinite' : 'none',
                }}
            />
        );
    };

    return (
        <div className="w-full flex flex-col items-center relative min-h-[350px] pt-4">

            {/* 疲勞脈衝 keyframe */}
            <style>{`
                @keyframes musclePulse {
                    0%, 100% { opacity: 0.8; }
                    50%       { opacity: 1; filter: drop-shadow(0 0 10px rgba(239,68,68,0.8)); }
                }
            `}</style>

            {/* View Toggle - Top */}
            <div className="flex bg-white/5 rounded-full p-1 border border-white/5 mb-4 relative z-10">
                <motion.button {...pressProps('icon')}
 onClick={() => handleViewChange('front')}
 className={`px-6 py-1.5 text-xs font-bold rounded-full ${view === 'front'
 ? 'bg-glass-blue text-glass-dark shadow-lg'
 : 'text-glass-muted hover:text-white'
 }`}
 >
                    FRONT
                </motion.button>
                <motion.button {...pressProps('icon')}
 onClick={() => handleViewChange('back')}
 className={`px-6 py-1.5 text-xs font-bold rounded-full ${view === 'back'
 ? 'bg-glass-blue text-glass-dark shadow-lg'
 : 'text-glass-muted hover:text-white'
 }`}
 >
                    BACK
                </motion.button>
            </div>

            {/* SVG Container - Middle，3D 翻轉包裝 */}
            <div
                style={{
                    perspective: '800px',
                    display: 'flex',
                    justifyContent: 'center',
                }}
            >
            <svg
                viewBox="0 0 200 360"
                className="h-[260px] w-auto filter drop-shadow-2xl mb-4 pointer-events-none"
                style={{
                    transition: 'transform 0.44s cubic-bezier(0.16, 1, 0.3, 1)',
                    transform: isFlipping ? 'rotateY(90deg)' : 'rotateY(0deg)',
                    transformOrigin: 'center center',
                }}
            >
                <defs>
                    <linearGradient id="bodyGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="rgba(255,255,255,0.1)" />
                        <stop offset="100%" stopColor="rgba(255,255,255,0.05)" />
                    </linearGradient>
                </defs>

                {/* --- HEAD --- */}
                <circle cx="100" cy="35" r="14" fill="#333" opacity="0.8" />

                {displayedView === 'front' ? (
                    <g transform="translate(0, 5)">
                        {/* NECK */}
                        <path d="M92 48 L108 48 L108 55 L92 55 Z" fill="#444" opacity="0.4" />

                        {/* SHOULDERS (Deltoids) */}
                        <BodyPart id="shoulders" d="M65 60 Q80 55 92 58 L92 75 L60 80 Q55 70 65 60 M108 58 Q120 55 135 60 Q145 70 140 80 L108 75 Z" />

                        {/* CHEST (Pectorals) */}
                        <BodyPart id="chest" d="M92 58 L108 58 L130 75 Q135 85 108 95 L100 88 L92 95 Q65 85 70 75 Z" />

                        {/* ARMS (Biceps/Triceps/Forearms) - Left & Right */}
                        <BodyPart id="arms" d="M60 80 L50 85 L45 130 L60 125 L70 95 Z M140 80 L150 85 L155 130 L140 125 L130 95 Z" />

                        {/* CORE (Abs/Obliques) */}
                        <BodyPart id="core" d="M70 95 L92 95 L100 88 L108 95 L130 95 L125 145 L100 150 L75 145 Z" />

                        {/* LEGS (Quads/Calves) */}
                        <BodyPart id="legs" d="M75 145 L100 150 L98 220 L78 220 L72 180 Z M125 145 L100 150 L102 220 L122 220 L128 180 Z M78 225 L98 225 L95 295 L80 295 Z M122 225 L102 225 L105 295 L120 295 Z" />
                    </g>
                ) : (
                    <g transform="translate(0, 5)">
                        {/* NECK BACK */}
                        <path d="M90 48 L110 48 L110 58 L90 58 Z" fill="#333" />

                        {/* SHOULDERS BACK (Rear Delts/Traps) */}
                        <BodyPart id="shoulders" d="M65 60 Q80 55 100 58 L100 75 L60 80 Q55 70 65 60 M100 58 Q120 55 135 60 Q145 70 140 80 L100 75 Z M90 48 L110 48 L125 65 L75 65 Z" />

                        {/* BACK (Lats/Rhomboids/Lower Back) */}
                        <BodyPart id="back" d="M75 65 L125 65 L135 90 L125 135 L100 140 L75 135 L65 90 Z" />

                        {/* ARMS BACK (Triceps) */}
                        <BodyPart id="arms" d="M60 80 L50 85 L45 130 L60 125 L70 95 Z M140 80 L150 85 L155 130 L140 125 L130 95 Z" />

                        {/* LEGS BACK (Hamstrings/Calves) */}
                        <BodyPart id="legs" d="M75 135 L100 140 L98 220 L78 220 L72 180 Z M125 135 L100 140 L102 220 L122 220 L128 180 Z M78 225 L98 225 L95 295 L80 295 Z M122 225 L102 225 L105 295 L120 295 Z" />
                    </g>
                )}
            </svg>
            </div>{/* end perspective wrapper */}

            {/* Legend - Bottom (Horizontal & Centered) */}
            <div className="flex justify-center w-full px-4 mb-4">
                <div className="flex gap-4 bg-white/5 px-6 py-3 rounded-[18px] backdrop-blur-sm border border-white/5 shadow-lg">
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                        <span className="text-[9px] text-white/90 font-medium uppercase tracking-wider">Ready</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]"></div>
                        <span className="text-[9px] text-white/90 font-medium uppercase tracking-wider">Fatigue</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"></div>
                        <span className="text-[9px] text-white/90 font-medium uppercase tracking-wider">Recovering</span>
                    </div>
                </div>
            </div>

            {/* Selected Parts Display (Only if selected) */}
            {selectedParts.length > 0 && (
                <div className="text-center pb-4">
                    <p className="text-sm text-white font-bold tracking-wide">
                        {selectedParts.map(p => p.toUpperCase()).join(' & ')}
                    </p>
                </div>
            )}
        </div>
    );
};

export default MuscleRecoveryHeatmap;
