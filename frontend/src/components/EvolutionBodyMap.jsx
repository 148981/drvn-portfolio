import React from 'react';
import { motion } from 'framer-motion';

/**
 * Evolution Body Map
 * 3D Minimalist Line Style with Dynamic Heatmap
 * 
 * Props:
 * - highlightAreas: ["chest", "shoulders"] 
 * - progressPercentage: 65
 * - status: "INITIATED" | "EVOLVING" | "EVOLVED"
 * - theme: "light" | "dark"
 */
const EvolutionBodyMap = ({
    highlightAreas = [],
    progressPercentage = 0,
    muscleProgress = {},
    muscleTargets = {},
    muscleVisuals = {},
    status = "maintenance",
    theme = "dark",
    onMuscleClick
}) => {
    const isDarkTheme = theme === 'dark';

    // Colors based on theme
    const colors = theme === "dark" ? {
        base: "#292524", // stone-800
        outline: "#57534E", // stone-600
        highlight: "#C5A059", // Loewe Gold
        completed: "#5A7A3A", // Emerald-500
        active: "#EAB308", // Yellow-500
        text: "fill-white",
        bg: "fill-stone-900"
    } : {
        base: "#E5E7EB", // gray-200
        outline: "#D1D5DB", // gray-300
        highlight: "#EAB308", // Yellow-500
        completed: "#5A7A3A", // Emerald-500
        active: "#EAB308", // Yellow-500
        text: "fill-stone-600",
        bg: "fill-white"
    };

    const handleHealthClick = (e, muscle) => {
        e.stopPropagation();
        if (onMuscleClick) {
            onMuscleClick(muscle);
        }
    };

    // Helper to determine color based on state
    const getMuscleColor = (muscle) => {
        if (highlightAreas.includes(muscle)) return colors.highlight;
        if (muscleProgress[muscle] >= 100) return colors.completed;
        if (muscleProgress[muscle] > 0) return colors.active;
        return colors.base;
    };

    const getMuscleOpacity = (muscle) => {
        if (highlightAreas.includes(muscle)) return 1;
        if (muscleProgress[muscle] > 0) return 0.8;
        return 0.3; // Default low opacity for unworked muscles
    };

    // Helper to get glow effect
    const getGlow = (muscle) => {
        const percent = muscleProgress[muscle] || 0;
        if (percent >= 100) return `drop-shadow(0 0 5px ${colors.completed})`;
        if (percent > 0) return `drop-shadow(0 0 5px ${colors.active})`;
        if (highlightAreas.includes(muscle)) return `drop-shadow(0 0 5px ${colors.highlight})`;
        return 'none';
    };

    // Helper to get progress color for lines
    const getProgressColor = (muscle) => {
        if (muscleProgress[muscle] >= 100) return colors.completed;
        if (muscleProgress[muscle] > 0) return colors.active;
        if (highlightAreas.includes(muscle)) return colors.highlight;
        return colors.outline; // Default color for unworked muscles
    };

    // Render Logic
    const renderMuscleGroup = (id, pathData, muscleName) => {
        const color = getMuscleColor(muscleName);
        const opacity = getMuscleOpacity(muscleName);
        const animation = getAnimation(muscleName);
        const glow = getGlow(muscleName);

        return (
            <motion.path
                key={id}
                d={pathData}
                fill={color}
                stroke={colors.outline}
                strokeWidth="0.5"
                initial={{ opacity: 0 }}
                animate={{ opacity: opacity, fill: color, ...animation }}
                transition={{ duration: 1 }}
                onClick={(e) => handleHealthClick(e, muscleName)}
                className="cursor-pointer hover:opacity-80 transition-opacity"
                style={{ filter: glow }}
            />
        );
    };

    // Animation: Pulse for EVOLVING, Solid/Shimmer for EVOLVED
    const pulseAnim = {
        opacity: [0.6, 1, 0.6],
        strokeWidth: [3, 4, 3],
        transition: { duration: 2, repeat: Infinity, ease: "easeInOut" }
    };

    // Evolved animation (Heartbeat-like)
    const evolvedAnim = {
        scale: [1, 1.05, 1],
        filter: [
            `drop-shadow(0 0 5px ${colors.highlight}50)`,
            `drop-shadow(0 0 15px ${colors.highlight}E6)`,
            `drop-shadow(0 0 5px ${colors.highlight}50)`
        ],
        transition: { duration: 3, repeat: Infinity }
    };

    const getAnimation = (muscle) => {
        const percent = muscleProgress[muscle] || 0;
        if (percent >= 100 || status === "EVOLVED") return evolvedAnim;
        if (percent > 0 || highlightAreas.includes(muscle)) return pulseAnim;
        return {};
    };

    return (
        <div className="relative w-full h-[360px] flex items-center justify-center" >
            <svg viewBox="0 0 200 400" className="w-full h-full overflow-visible">
                <defs>
                    <linearGradient id="gold-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#C5A059" />
                        <stop offset="100%" stopColor="#E6D2A0" />
                    </linearGradient>
                </defs>

                {/* Background Silhouette */}
                <path d="M100,20 C120,20 135,35 140,50 C145,65 150,80 145,100 C140,120 135,140 130,160 C125,180 130,220 135,260 C140,300 135,350 130,380 L70,380 C65,350 60,300 65,260 C70,220 75,180 70,160 C65,140 60,120 55,100 C50,80 55,65 60,50 C65,35 80,20 100,20 Z"
                    fill={colors.bg} opacity="0.1" />

                {/* Muscle Groups - Clickable */}
                {/* Chest */}
                {renderMuscleGroup("chest", "M70,80 Q100,90 130,80 Q120,110 100,110 Q80,110 70,80 Z", "chest")}

                {/* Shoulders */}
                {renderMuscleGroup("shoulders", "M60,50 Q75,45 100,45 Q125,45 140,50 Q145,65 130,80 Q100,70 70,80 Q55,65 60,50 Z", "shoulders")}

                {/* Abs */}
                {renderMuscleGroup("core", "M75,115 Q100,115 125,115 Q120,150 100,160 Q80,150 75,115 Z", "core")}

                {/* Arms - Biceps/Triceps */}
                {renderMuscleGroup("arms", "M55,80 Q45,100 50,130 L65,125 Q60,100 70,80 Z M145,80 Q155,100 150,130 L135,125 Q140,100 130,80 Z", "arms")}

                {/* Legs - Quads */}
                {renderMuscleGroup("legs", "M70,180 Q85,180 100,180 Q115,180 130,180 L125,300 Q100,310 75,300 L70,180 Z", "legs")}

                {/* Inner Thighs */}
                <motion.path d="M90 190 L90 260 M110 190 L110 260" stroke={colors.outline} strokeWidth="1.5" opacity="0.6" />

                {/* Muscle Progress Text Overlays - Positioned Next to Muscles */}
                {/* Muscle Visualizations & Overlays */}
                {Object.entries(muscleProgress).map(([muscle, percent]) => {
                    if (!percent) return null;

                    const visualConfig = muscleVisuals[muscle] || { type: 'MAINTENANCE' };

                    // Coordinates for each muscle group text
                    const baseCoords = {
                        shoulders: { x: 100, y: 65 },
                        chest: { x: 100, y: 105 },
                        arms: { x: 145, y: 110 },
                        core: { x: 100, y: 155 },
                        back: { x: 145, y: 90 },
                        legs: { x: 100, y: 240 },
                        quads: { x: 100, y: 240 },
                        abs: { x: 100, y: 155 },
                        biceps: { x: 145, y: 110 },
                        triceps: { x: 55, y: 110 },
                        lats: { x: 145, y: 90 },
                        glutes: { x: 100, y: 190 },
                    };

                    // Offsets
                    const textOffsets = {
                        shoulders: { dx: 35, dy: -5 },
                        chest: { dx: 40, dy: 0 },
                        arms: { dx: 30, dy: 0 },
                        core: { dx: 35, dy: 0 },
                        back: { dx: 30, dy: -10 },
                        legs: { dx: 45, dy: 0 },
                        quads: { dx: 45, dy: 0 },
                        abs: { dx: 35, dy: 0 },
                        biceps: { dx: 30, dy: 0 },
                        triceps: { dx: -30, dy: 0 },
                        lats: { dx: 30, dy: -10 },
                        glutes: { dx: 35, dy: 0 },
                    };

                    const pos = baseCoords[muscle.toLowerCase()] || { x: 0, y: 0 };
                    const offset = textOffsets[muscle.toLowerCase()] || { dx: 30, dy: 0 };

                    if (pos.x === 0) return null;

                    const textX = pos.x + offset.dx;
                    const textY = pos.y + offset.dy;

                    // Render Logic based on Type
                    const renderVisual = () => {
                        if (visualConfig.type === 'VOLUME_LOADING') {
                            // 1. Hypertrophy: Gold Segmented Bar (10 segments)
                            const segments = 10;
                            const progress = Math.min((percent / 100) * segments, segments);

                            return (
                                <g transform={`translate(${textX - 12}, ${textY - 6})`}>
                                    <text x="12" y="-5" textAnchor="middle" fill={colors.active} fontSize="5" fontWeight="bold" fontFamily="monospace" letterSpacing="0.5">VOLUME LOAD</text>
                                    <g transform="translate(0, 0)">
                                        {[...Array(segments)].map((_, i) => (
                                            <motion.rect
                                                key={i}
                                                x={i * 2.5}
                                                y="0"
                                                width="2"
                                                height="6"
                                                rx="0.5"
                                                fill={i < progress ? "#EEDC82" : (isDarkTheme ? "#333" : "#ddd")}
                                                initial={{ opacity: 0.3 }}
                                                animate={{
                                                    opacity: i < progress ? 1 : 0.3,
                                                    fill: i < progress ? "#EEDC82" : (isDarkTheme ? "#333" : "#ddd")
                                                }}
                                                transition={{ delay: Math.min(i, 6) * 0.05 }}
                                            />
                                        ))}
                                    </g>
                                </g>
                            );
                        } else if (visualConfig.type === 'STRENGTH_PEAKING') {
                            // 2. Strength: Circular Gauge & Amber Shockwave
                            const currentMax = visualConfig.current_max || 0;
                            // 真實歷史最大重量；null/0 代表尚無對比 → 不假造 PR。
                            const prevMax = visualConfig.last_week_max ?? visualConfig.prev_max ?? null;
                            const hasHistory = prevMax != null && prevMax > 0;
                            const isPR = hasHistory ? (currentMax > prevMax) : false;
                            const ratio = hasHistory ? Math.min(currentMax / prevMax, 1) : 1;
                            const circumference = 2 * Math.PI * 10;

                            return (
                                <g transform={`translate(${textX}, ${textY})`}>
                                    {/* Amber Shockwave Effect (PR) */}
                                    {isPR && (
                                        <motion.circle
                                            r="12"
                                            fill="none"
                                            stroke="#FFBF00" // Amber
                                            strokeWidth="1.5"
                                            initial={{ scale: 0.8, opacity: 0.6 }}
                                            animate={{ scale: 1.5, opacity: 0 }}
                                            transition={{ repeat: Infinity, duration: 1.5 }}
                                        />
                                    )}

                                    {/* Base Circle */}
                                    <circle cx="0" cy="0" r="10" stroke={isDarkTheme ? "#333" : "#eee"} strokeWidth="2" fill={isDarkTheme ? "#111" : "#fff"} />

                                    {/* Progress Circle */}
                                    <motion.circle
                                        cx="0" cy="0" r="10"
                                        stroke="#FFBF00" // Amber
                                        strokeWidth="2"
                                        fill="none"
                                        strokeDasharray={circumference}
                                        strokeDashoffset={circumference * (1 - ratio)}
                                        strokeLinecap="round"
                                        transform="rotate(-90)"
                                    />

                                    {/* Text */}
                                    <text y="1" textAnchor="middle" dominantBaseline="middle" fill={isPR ? "#FFBF00" : (isDarkTheme ? "#fff" : "#333")} fontSize="6" fontWeight="bold">{currentMax}</text>
                                    <text y="-14" textAnchor="middle" fill="#FFBF00" fontSize="4" fontWeight="bold" opacity={isPR ? 1 : 0}>{isPR ? "NEW PR!" : ""}</text>
                                    <text y="8" textAnchor="middle" fill={colors.static} fontSize="3.5">KG</text>
                                </g>
                            );
                        } else {
                            // Default Maintenance / Text
                            const target = muscleTargets[muscle] || 0;
                            const actual = target > 0 ? Math.round((percent / 100) * target) : 0;
                            const displayText = target > 0 ? `${actual}/${target}` : `${percent}%`;
                            return (
                                <motion.text
                                    x={textX}
                                    y={textY}
                                    textAnchor={offset.dx > 0 ? "start" : "end"}
                                    dominantBaseline="middle"
                                    fill={isDarkTheme ? "#E6D2A0" : "rgba(255,255,255,0.9)"} // Brighter text
                                    fontSize="8"
                                    fontWeight="bold"
                                    fontFamily="monospace"
                                    initial={{ opacity: 0, x: textX - (offset.dx > 0 ? 5 : -5) }}
                                    animate={{ opacity: 1, x: textX }}
                                    transition={{ delay: 0.5, type: "spring" }}
                                    className="pointer-events-none select-none drop-shadow-md"
                                >
                                    {displayText}
                                </motion.text>
                            );
                        }
                    };

                    return (
                        <g key={muscle}>
                            {/* Connecting Line */}
                            <motion.line
                                x1={pos.x + (offset.dx > 0 ? 10 : -10)} y1={pos.y}
                                x2={textX - (offset.dx > 0 ? 5 : -5)} y2={textY}
                                stroke={isDarkTheme ? "#3A3219" : "rgba(255,255,255,0.4)"}
                                strokeWidth="0.5"
                                initial={{ pathLength: 0 }}
                                animate={{ pathLength: 1 }}
                                transition={{ delay: 0.3, duration: 0.5 }}
                            />
                            {renderVisual()}
                        </g>
                    );
                })}
            </svg>

            {/* Matrix Status Indicator */}
            <div className="absolute top-4 right-4 text-right" >
                <div className={`text-[9px] uppercase tracking-widest ${isDarkTheme ? 'text-black/40' : 'text-white/40'}`}>Status</div>
                <div className="flex items-center justify-end gap-1.5 mt-1">
                    <span
                        className="text-xs font-bold"
                        style={{ color: status === 'EVOLVED' ? '#C5A059' : (isDarkTheme ? '#333' : '#666') }}
                    >
                        {status}
                    </span>
                    <div
                        className={`w-1.5 h-1.5 rounded-full ${status !== 'INITIATED' ? 'bg-[#C5A059] animate-pulse' : (isDarkTheme ? 'bg-black/20' : 'bg-white/20')}`}
                    ></div>
                </div>
            </div >
        </div >
    );
};

export default EvolutionBodyMap;
