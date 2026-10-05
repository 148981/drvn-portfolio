import React from 'react';
import { motion } from 'framer-motion';

/**
 * BodyHeatmap2D - 2D muscle visualization with golden highlights
 * Highlights target muscle groups based on selected pain-point hashtags
 */
const BodyHeatmap2D = ({ targetMuscles = [] }) => {
    return (
        <div className="relative w-full h-[500px] flex items-center justify-center">
            {/* Background glow */}
            <div className="absolute inset-0 flex items-center justify-center">
                <div
                    className="w-64 h-64 blur-3xl rounded-full opacity-20"
                    style={{ background: 'radial-gradient(circle, rgba(212, 175, 55, 0.3), transparent)' }}
                />
            </div>

            {/* 2D Body SVG */}
            <svg
                viewBox="0 0 300 600"
                className="relative z-10 w-full max-w-md h-full"
                style={{ filter: 'drop-shadow(0 0 20px rgba(212, 175, 55, 0.2))' }}
            >
                <defs>
                    {/* Gold glow filter for highlighted muscles */}
                    <filter id="goldGlow">
                        <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>

                    {/* Shimmer animation  */}
                    <linearGradient id="goldShimmer" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#8B6914" stopOpacity="0.8" />
                        <stop offset="50%" stopColor="#D4AF37" stopOpacity="1" />
                        <stop offset="100%" stopColor="#F4E4C1" stopOpacity="0.8" />
                    </linearGradient>
                </defs>

                {/* Body Outline (Dark) */}
                <g id="body-outline" fill="rgba(255, 255, 255, 0.05)" stroke="rgba(255, 255, 255, 0.2)" strokeWidth="1">
                    {/* Head */}
                    <ellipse cx="150" cy="40" rx="25" ry="30" />

                    {/* Neck */}
                    <rect x="140" y="65" width="20" height="15" rx="3" />

                    {/* Torso */}
                    <path d="M 120 80 L 110 150 L 115 250 L 120 280 L 140 290 L 160 290 L 180 280 L 185 250 L 190 150 L 180 80 Z" />
                </g>

                {/* Chest (Pectoralis) */}
                <motion.g
                    id="chest-major"
                    initial={{ opacity: 0 }}
                    animate={{
                        opacity: targetMuscles.includes('pectoralis_major') || targetMuscles.includes('pectoralis_minor') ? 1 : 0.1
                    }}
                    transition={{ duration: 0.5 }}
                >
                    <path
                        d="M 130 95 Q 120 110 120 130 L 130 145 L 145 150 L 150 145 L 150 90 Z"
                        fill={targetMuscles.includes('pectoralis_major') ? 'url(#goldShimmer)' : 'rgba(255, 255, 255, 0.1)'}
                        stroke="rgba(212, 175, 55, 0.6)"
                        strokeWidth={targetMuscles.includes('pectoralis_major') ? '2' : '0.5'}
                        filter={targetMuscles.includes('pectoralis_major') ? 'url(#goldGlow)' : ''}
                    />
                    <path
                        d="M 170 95 Q 180 110 180 130 L 170 145 L 155 150 L 150 145 L 150 90 Z"
                        fill={targetMuscles.includes('pectoralis_major') ? 'url(#goldShimmer)' : 'rgba(255, 255, 255, 0.1)'}
                        stroke="rgba(212, 175, 55, 0.6)"
                        strokeWidth={targetMuscles.includes('pectoralis_major') ? '2' : '0.5'}
                        filter={targetMuscles.includes('pectoralis_major') ? 'url(#goldGlow)' : ''}
                    />
                </motion.g>

                {/* Shoulders (Deltoids) */}
                <motion.g
                    id="shoulder-all"
                    initial={{ opacity: 0 }}
                    animate={{
                        opacity: targetMuscles.includes('deltoids') || targetMuscles.includes('anterior_deltoid') || targetMuscles.includes('posterior_deltoid') ? 1 : 0.1
                    }}
                    transition={{ duration: 0.5 }}
                >
                    {/* Left shoulder */}
                    <ellipse
                        cx="105" cy="95" rx="20" ry="25"
                        fill={targetMuscles.some(m => m.includes('deltoid')) ? 'url(#goldShimmer)' : 'rgba(255, 255, 255, 0.1)'}
                        stroke="rgba(212, 175, 55, 0.6)"
                        strokeWidth={targetMuscles.some(m => m.includes('deltoid')) ? '2' : '0.5'}
                        filter={targetMuscles.some(m => m.includes('deltoid')) ? 'url(#goldGlow)' : ''}
                    />
                    {/* Right shoulder */}
                    <ellipse
                        cx="195" cy="95" rx="20" ry="25"
                        fill={targetMuscles.some(m => m.includes('deltoid')) ? 'url(#goldShimmer)' : 'rgba(255, 255, 255, 0.1)'}
                        stroke="rgba(212, 175, 55, 0.6)"
                        strokeWidth={targetMuscles.some(m => m.includes('deltoid')) ? '2' : '0.5'}
                        filter={targetMuscles.some(m => m.includes('deltoid')) ? 'url(#goldGlow)' : ''}
                    />
                </motion.g>

                {/* Arms (Biceps & Triceps) */}
                <motion.g
                    id="arm-biceps"
                    initial={{ opacity: 0 }}
                    animate={{
                        opacity: targetMuscles.includes('biceps') || targetMuscles.includes('triceps') ? 1 : 0.1
                    }}
                    transition={{ duration: 0.5 }}
                >
                    {/* Left arm */}
                    <rect
                        x="85" y="110" width="18" height="80" rx="9"
                        fill={targetMuscles.includes('biceps') || targetMuscles.includes('triceps') ? 'url(#goldShimmer)' : 'rgba(255, 255, 255, 0.1)'}
                        stroke="rgba(212, 175, 55, 0.6)"
                        strokeWidth={targetMuscles.includes('biceps') || targetMuscles.includes('triceps') ? '2' : '0.5'}
                        filter={targetMuscles.includes('biceps') || targetMuscles.includes('triceps') ? 'url(#goldGlow)' : ''}
                    />
                    {/* Right arm */}
                    <rect
                        x="197" y="110" width="18" height="80" rx="9"
                        fill={targetMuscles.includes('biceps') || targetMuscles.includes('triceps') ? 'url(#goldShimmer)' : 'rgba(255, 255, 255, 0.1)'}
                        stroke="rgba(212, 175, 55, 0.6)"
                        strokeWidth={targetMuscles.includes('biceps') || targetMuscles.includes('triceps') ? '2' : '0.5'}
                        filter={targetMuscles.includes('biceps') || targetMuscles.includes('triceps') ? 'url(#goldGlow)' : ''}
                    />
                </motion.g>

                {/* Core (Abs) */}
                <motion.g
                    id="core-rectus"
                    initial={{ opacity: 0 }}
                    animate={{
                        opacity: targetMuscles.includes('rectus_abdominis') || targetMuscles.includes('core') ? 1 : 0.1
                    }}
                    transition={{ duration: 0.5 }}
                >
                    <rect
                        x="135" y="155" width="30" height="80" rx="5"
                        fill={targetMuscles.includes('rectus_abdominis') || targetMuscles.includes('core') ? 'url(#goldShimmer)' : 'rgba(255, 255, 255, 0.1)'}
                        stroke="rgba(212, 175, 55, 0.6)"
                        strokeWidth={targetMuscles.includes('rectus_abdominis') || targetMuscles.includes('core') ? '2' : '0.5'}
                        filter={targetMuscles.includes('rectus_abdominis') || targetMuscles.includes('core') ? 'url(#goldGlow)' : ''}
                    />
                    {/* Abs segments */}
                    {targetMuscles.includes('rectus_abdominis') && (
                        <>
                            <line x1="150" y1="170" x2="150" y2="230" stroke="rgba(0, 0, 0, 0.3)" strokeWidth="1" />
                            <line x1="135" y1="180" x2="165" y2="180" stroke="rgba(0, 0, 0, 0.3)" strokeWidth="1" />
                            <line x1="135" y1="200" x2="165" y2="200" stroke="rgba(0, 0, 0, 0.3)" strokeWidth="1" />
                            <line x1="135" y1="220" x2="165" y2="220" stroke="rgba(0, 0, 0, 0.3)" strokeWidth="1" />
                        </>
                    )}
                </motion.g>

                {/* Legs (Quads & Hamstrings) */}
                <motion.g
                    id="leg-quads"
                    initial={{ opacity: 0 }}
                    animate={{
                        opacity: targetMuscles.includes('quadriceps') || targetMuscles.includes('hamstrings') || targetMuscles.includes('glutes') ? 1 : 0.1
                    }}
                    transition={{ duration: 0.5 }}
                >
                    {/* Left leg */}
                    <rect
                        x="125" y="290" width="22" height="120" rx="11"
                        fill={targetMuscles.some(m => ['quadriceps', 'hamstrings', 'glutes'].includes(m)) ? 'url(#goldShimmer)' : 'rgba(255, 255, 255, 0.1)'}
                        stroke="rgba(212, 175, 55, 0.6)"
                        strokeWidth={targetMuscles.some(m => ['quadriceps', 'hamstrings', 'glutes'].includes(m)) ? '2' : '0.5'}
                        filter={targetMuscles.some(m => ['quadriceps', 'hamstrings', 'glutes'].includes(m)) ? 'url(#goldGlow)' : ''}
                    />
                    {/* Right leg */}
                    <rect
                        x="153" y="290" width="22" height="120" rx="11"
                        fill={targetMuscles.some(m => ['quadriceps', 'hamstrings', 'glutes'].includes(m)) ? 'url(#goldShimmer)' : 'rgba(255, 255, 255, 0.1)'}
                        stroke="rgba(212, 175, 55, 0.6)"
                        strokeWidth={targetMuscles.some(m => ['quadriceps', 'hamstrings', 'glutes'].includes(m)) ? '2' : '0.5'}
                        filter={targetMuscles.some(m => ['quadriceps', 'hamstrings', 'glutes'].includes(m)) ? 'url(#goldGlow)' : ''}
                    />
                </motion.g>

                {/* Back Muscles (Trapezius, Lats, Erector Spinae) */}
                <motion.g
                    id="back-all"
                    initial={{ opacity: 0 }}
                    animate={{
                        opacity: targetMuscles.some(m => ['trapezius', 'latissimus_dorsi', 'rhomboid', 'erector_spinae', 'infraspinatus', 'upper_back'].includes(m)) ? 1 : 0.1
                    }}
                    transition={{ duration: 0.5 }}
                >
                    {/* Upper back / Traps */}
                    <path
                        d="M 120 85 L 125 95 L 135 100 L 150 105 L 165 100 L 175 95 L 180 85 L 175 80 L 125 80 Z"
                        fill={targetMuscles.some(m => ['trapezius', 'rhomboid', 'upper_back', 'infraspinatus'].includes(m)) ? 'url(#goldShimmer)' : 'rgba(255, 255, 255, 0.1)'}
                        stroke="rgba(212, 175, 55, 0.6)"
                        strokeWidth={targetMuscles.some(m => ['trapezius', 'rhomboid', 'upper_back'].includes(m)) ? '2' : '0.5'}
                        filter={targetMuscles.some(m => ['trapezius', 'rhomboid', 'upper_back'].includes(m)) ? 'url(#goldGlow)' : ''}
                    />
                    {/* Lats */}
                    <path
                        d="M 120 110 L 115 150 L 120 200 L 135 210 L 150 215 L 165 210 L 180 200 L 185 150 L 180 110 Z"
                        fill={targetMuscles.includes('latissimus_dorsi') || targetMuscles.includes('erector_spinae') ? 'url(#goldShimmer)' : 'rgba(255, 255, 255, 0.1)'}
                        stroke="rgba(212, 175, 55, 0.6)"
                        strokeWidth={targetMuscles.includes('latissimus_dorsi') || targetMuscles.includes('erector_spinae') ? '2' : '0.5'}
                        filter={targetMuscles.includes('latissimus_dorsi') || targetMuscles.includes('erector_spinae') ? 'url(#goldGlow)' : ''}
                    />
                </motion.g>
            </svg>

            {/* Target Zone Label */}
            {targetMuscles.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="absolute bottom-8 left-1/2 transform -translate-x-1/2"
                >
                    <div className="glass-obsidian px-6 py-3 rounded-full border border-gold-base/40 backdrop-blur-xl">
                        <p className="serif-display text-xs font-bold uppercase tracking-widest" style={{ color: '#D4AF37' }}>
                            ⚡ Target Zone Identified
                        </p>
                    </div>
                </motion.div>
            )}
        </div>
    );
};

export default BodyHeatmap2D;
