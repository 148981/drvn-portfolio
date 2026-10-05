import React from 'react';
import { motion } from 'framer-motion';

/**
 * Metabolic Arc
 * Dual Concentric Rings for Cardio Goals
 * 
 * Props:
 * - distance: { current: 12, target: 20 } (km)
 * - calories: { current: 1500, target: 2000 } (kcal)
 */
const MetabolicArc = ({ distance, calories, theme = 'light' }) => {
    // Calculate percentages
    // Inner Ring: Distance
    const distPct = Math.min(100, (distance.current / distance.target) * 100) || 0;
    // Outer Ring: Calories
    const calPct = Math.min(100, (calories.current / calories.target) * 100) || 0;

    // Check for Double Evolution (Both 100%)
    const isDoubleEvolution = distPct >= 100 && calPct >= 100;

    const isDarkTheme = theme === 'dark'; // Dark text/elements for Light/Orange background

    // Colors
    const colors = {
        bgRing: isDarkTheme ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)",
        text: isDarkTheme ? "#3E1A1A" : "#FFFFFF",
        subtext: isDarkTheme ? "rgba(62, 26, 26, 0.5)" : "rgba(255,255,255,0.5)",
        // Outer Ring (Calories) - Orange/Red
        ringOuter: isDarkTheme ? "#FFFFFF" : "#FF6B35",
        // Inner Ring (Distance) - Blue/Darker
        ringInner: isDarkTheme ? "#8B4513" : "#2E9AFE" // Darker brown on orange bg
    };

    // Circle params
    const size = 160;
    const center = size / 2;
    const strokeWidth = 10;

    // Outer Ring (Calories)
    const r1 = 70;
    const c1 = 2 * Math.PI * r1;
    const offset1 = c1 - (calPct / 100) * c1;

    // Inner Ring (Distance)
    const r2 = 52;
    const c2 = 2 * Math.PI * r2;
    const offset2 = c2 - (distPct / 100) * c2;

    // Animation for Double Evolution
    const evolutionGlow = {
        filter: [
            "drop-shadow(0 0 0px rgba(255,255,255,0))",
            "drop-shadow(0 0 10px rgba(255,255,255,0.8))",
            "drop-shadow(0 0 0px rgba(255,255,255,0))"
        ],
        transition: { duration: 2, repeat: Infinity }
    };

    return (
        <div className="relative flex flex-col items-center justify-center">
            <motion.div
                className="relative"
                style={{ width: size, height: size }}
                animate={isDoubleEvolution ? evolutionGlow : {}}
            >
                <svg width={size} height={size} className="transform -rotate-90">
                    {/* Ring 1 Background (Outer) */}
                    <circle cx={center} cy={center} r={r1} stroke={colors.bgRing} strokeWidth={strokeWidth} fill="none" />
                    {/* Ring 2 Background (Inner) */}
                    <circle cx={center} cy={center} r={r2} stroke={colors.bgRing} strokeWidth={strokeWidth} fill="none" />

                    {/* Ring 1 Progress (Outer - Calories) */}
                    <motion.circle
                        cx={center} cy={center} r={r1}
                        stroke={colors.ringOuter} strokeWidth={strokeWidth} fill="none"
                        strokeLinecap="round"
                        strokeDasharray={c1}
                        initial={{ strokeDashoffset: c1 }}
                        animate={{ strokeDashoffset: offset1 }}
                        transition={{ duration: 1.5, ease: "easeOut" }}
                    />

                    {/* Ring 2 Progress (Inner - Distance) */}
                    <motion.circle
                        cx={center} cy={center} r={r2}
                        stroke={colors.ringInner} strokeWidth={strokeWidth} fill="none"
                        strokeLinecap="round"
                        strokeDasharray={c2}
                        initial={{ strokeDashoffset: c2 }}
                        animate={{ strokeDashoffset: offset2 }}
                        transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
                    />
                </svg>

                {/* Center Stats */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center -rotate-0 origin-center transform translate-x-[0.5px]"> {/* reset rotation */}
                    {isDoubleEvolution ? (
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="bg-white/20 backdrop-blur-sm rounded-full w-24 h-24 flex items-center justify-center"
                        >
                            <span className="text-4xl">🏆</span>
                        </motion.div>
                    ) : (
                        <>
                            <div className="text-[9px] uppercase tracking-widest font-bold mb-0.5" style={{ color: colors.subtext }}>Weekly Load</div>
                            <div className="text-3xl font-bold font-mono leading-none" style={{ color: colors.text }}>
                                {Math.floor((distPct + calPct) / 2)}%
                            </div>
                        </>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

export default MetabolicArc;
