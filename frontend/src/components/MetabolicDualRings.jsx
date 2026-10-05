import React, { useMemo, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/** 數字從 0 計到目標值的 hook */
function useCountUp(target, duration = 1400, delay = 0) {
    const [value, setValue] = useState(0);
    const rafRef = useRef(null);
    useEffect(() => {
        let startTime = null;
        const start = 0;
        const delayTimer = setTimeout(() => {
            const step = (timestamp) => {
                if (!startTime) startTime = timestamp;
                const progress = Math.min((timestamp - startTime) / duration, 1);
                // ease-out cubic
                const eased = 1 - Math.pow(1 - progress, 3);
                setValue(Math.round(start + (target - start) * eased));
                if (progress < 1) rafRef.current = requestAnimationFrame(step);
            };
            rafRef.current = requestAnimationFrame(step);
        }, delay);
        return () => {
            clearTimeout(delayTimer);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [target, duration, delay]);
    return value;
}

/**
 * ══════════════════════════════════════════════════════════════
 * METABOLIC DUAL RINGS — Swiss-Noir "Surgical Titanium" Edition
 * ══════════════════════════════════════════════════════════════
 * Hardware-grade dual-ring gauge with brushed metal textures,
 * specular highlights, and precision dial ticks.
 * ══════════════════════════════════════════════════════════════
 */

const C = {
    titaniumMist: '#F6F4F1',
    titaniumPebble: '#CFC6B8',
    titaniumObsidian: '#161415',
    titaniumCoral: '#F95C4B',
    titaniumCyan: '#00FFFF',
    textMuted: 'rgba(22,20,21,0.5)',
    textDim: 'rgba(22,20,21,0.3)',
};

export const MetabolicDualRings = ({
    distanceCurrent,
    distanceTarget,
    caloriesCurrent,
    caloriesTarget
}) => {
    // 計算百分比 (限制在 0 到 1 之間)
    const distPercent = Math.min((distanceCurrent / distanceTarget), 1) || 0;
    const calPercent = Math.min((caloriesCurrent / caloriesTarget), 1) || 0;
    const isFullyLoaded = distPercent >= 1 && calPercent >= 1;

    // CountUp：外圈 delay 0ms，內圈 delay 200ms（與圓弧動畫同步）
    const distDisplay = useCountUp(Math.round(distPercent * 100), 1400, 0);
    const calDisplay  = useCountUp(Math.round(calPercent  * 100), 1400, 200);

    // SVG Layout Constants
    const size = 180;
    const center = size / 2;
    const strokeWidth = 10;
    const outerRadius = 74;
    const innerRadius = 56;

    const outerCircum = 2 * Math.PI * outerRadius;
    const innerCircum = 2 * Math.PI * innerRadius;

    const outerOffset = outerCircum - (calPercent * outerCircum);
    const innerOffset = innerCircum - (distPercent * innerCircum);

    // ── Dial Ticks Generation ───────────────────────────────────────────
    const dialTicks = useMemo(() => {
        const ticks = [];
        const count = 60; // 60 ticks for a watch-face feel
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * 360;
            const isMajor = i % 5 === 0;
            const length = isMajor ? 6 : 3;
            ticks.push(
                <line
                    key={i}
                    x1={center}
                    y1={center - outerRadius - (strokeWidth / 2) - 4}
                    x2={center}
                    y2={center - outerRadius - (strokeWidth / 2) - 4 - length}
                    stroke={isMajor ? "rgba(22,20,21,0.4)" : "rgba(22,20,21,0.15)"}
                    strokeWidth={isMajor ? 1.5 : 0.8}
                    transform={`rotate(${angle}, ${center}, ${center})`}
                />
            );
        }
        return ticks;
    }, [center, outerRadius, strokeWidth]);

    return (
        <div className="relative flex items-center justify-center mx-auto" style={{ width: size, height: size }}>
            
            {/* ── Brushed Metal Texture Layer (CSS Based) ── */}
            <div 
                className="absolute inset-0 rounded-full pointer-events-none opacity-40"
                style={{
                    background: `
                        repeating-radial-gradient(
                            circle at center,
                            transparent 0,
                            transparent 1px,
                            rgba(255,255,255,0.05) 1.5px,
                            transparent 2px
                        )
                    `,
                    zIndex: 5
                }}
            />

            {/* ── Precision SVG Layer ── */}
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="z-10 overflow-visible">
                <defs>
                    {/* Surgical Titanium Gradient for Tracks */}
                    <linearGradient id="titaniumTrack" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#DED9CF" />
                        <stop offset="45%" stopColor="#F6F4F1" />
                        <stop offset="55%" stopColor="#BDB2A2" />
                        <stop offset="100%" stopColor="#DED9CF" />
                    </linearGradient>

                    {/* Specular Highlight Gradient */}
                    <linearGradient id="specularGlow" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="rgba(255,255,255,0)" />
                        <stop offset="50%" stopColor="rgba(255,255,255,0.8)" />
                        <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                    </linearGradient>

                    {/* Metallic Coral for Calories */}
                    <linearGradient id="metallicCoral" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#FF7A6B" />
                        <stop offset="50%" stopColor="#F95C4B" />
                        <stop offset="100%" stopColor="#D94030" />
                    </linearGradient>

                    {/* Metallic Cyan for Distance */}
                    <linearGradient id="metallicCyan" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#66FFFF" />
                        <stop offset="50%" stopColor="#00FFFF" />
                        <stop offset="100%" stopColor="#00CCCC" />
                    </linearGradient>
                </defs>

                {/* --- Outer Scale Ticks --- */}
                {dialTicks}

                {/* --- Outer Ring (Calories) --- */}
                {/* Track */}
                <circle 
                    cx={center} cy={center} r={outerRadius} 
                    fill="none" stroke="rgba(22,20,21,0.08)" 
                    strokeWidth={strokeWidth} 
                />
                {/* Progress */}
                <motion.circle
                    cx={center} cy={center} r={outerRadius}
                    fill="none" stroke="url(#metallicCoral)" 
                    strokeWidth={strokeWidth} strokeLinecap="round"
                    strokeDasharray={outerCircum}
                    initial={{ strokeDashoffset: outerCircum }}
                    animate={{ strokeDashoffset: outerOffset }}
                    transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
                    style={{ filter: 'drop-shadow(0 2px 4px rgba(249,92,75,0.2))' }}
                    transform={`rotate(-90 ${center} ${center})`}
                />
                {/* Specular Edge Highlight */}
                <circle 
                    cx={center} cy={center} r={outerRadius + (strokeWidth / 2)} 
                    fill="none" stroke="rgba(255,255,255,0.4)" 
                    strokeWidth={0.5} opacity="0.6"
                />

                {/* --- Inner Ring (Distance) --- */}
                {/* Track */}
                <circle 
                    cx={center} cy={center} r={innerRadius} 
                    fill="none" stroke="rgba(22,20,21,0.05)" 
                    strokeWidth={strokeWidth - 2} 
                />
                {/* Progress */}
                <motion.circle
                    cx={center} cy={center} r={innerRadius}
                    fill="none" stroke="url(#metallicCyan)" 
                    strokeWidth={strokeWidth - 2} strokeLinecap="round"
                    strokeDasharray={innerCircum}
                    initial={{ strokeDashoffset: innerCircum }}
                    animate={{ strokeDashoffset: innerOffset }}
                    transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
                    style={{ filter: 'drop-shadow(0 2px 4px rgba(0,255,255,0.15))' }}
                    transform={`rotate(-90 ${center} ${center})`}
                />
            </svg>

            {/* ── Boutique Typography Center ── */}
            <div className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none">
                <AnimatePresence mode="wait">
                    {isFullyLoaded ? (
                        <motion.div
                            key="loaded"
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            className="text-center"
                        >
                            <div style={{ 
                                fontSize: 9, 
                                fontWeight: 900, 
                                letterSpacing: '0.25em', 
                                color: C.titaniumCoral,
                                marginBottom: 2
                            }}>
                                TARGET
                            </div>
                            <div style={{ 
                                fontSize: 22, 
                                fontWeight: 100, 
                                letterSpacing: '-0.02em', 
                                color: '#161415',
                                fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif'
                            }}>
                                SECURED
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="progress"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex flex-col items-center"
                        >
                            <span style={{ 
                                fontSize: 9, 
                                fontWeight: 900, 
                                letterSpacing: '0.2em', 
                                color: C.textMuted,
                                marginBottom: 4,
                                textTransform: 'uppercase'
                            }}>
                                Metabolic Ratio
                            </span>
                            <div className="flex items-baseline gap-1">
                                <span style={{
                                    fontSize: 18,
                                    fontWeight: 100,
                                    color: '#161415',
                                    fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif'
                                }}>
                                    {distDisplay}
                                </span>
                                <span style={{ fontSize: 11, color: C.textDim, fontWeight: 300 }}>/</span>
                                <span style={{
                                    fontSize: 14,
                                    fontWeight: 200,
                                    color: C.textMuted,
                                    fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif'
                                }}>
                                    {calDisplay}%
                                </span>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ── Hardware-Grade Reflection Overlay ── */}
            <div 
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.05) 100%)',
                    zIndex: 30
                }}
            />
        </div>
    );
};

