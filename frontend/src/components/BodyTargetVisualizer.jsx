import React, { useState } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Body Target Visualizer Component
 * Displays a human body model with highlighted muscle groups based on training targets
 * Uses Loewe aesthetic with caramel highlighting for active muscle groups
 */
const BodyTargetVisualizer = ({
    targetMuscleGroups = [],  // Array of muscle group IDs that are targeted (e.g., ['chest', 'back', 'legs'])
    view = 'front',  // 'front' or 'back'
    onViewChange = null,  // Callback when view changes
    showViewToggle = true,  // Whether to show front/back toggle
    highlightColor = '#C68E5D',  // Caramel color for highlighted parts
    defaultColor = '#8B7355'  // Default muted color for non-highlighted parts
}) => {
    const [currentView, setCurrentView] = useState(view);

    const toggleView = () => {
        const newView = currentView === 'front' ? 'back' : 'front';
        setCurrentView(newView);
        if (onViewChange) onViewChange(newView);
    };

    // Check if a muscle group is targeted
    const isTargeted = (muscleGroup) => {
        return targetMuscleGroups.includes(muscleGroup);
    };

    // Get color for a muscle part
    const getPartColor = (muscleGroup) => {
        return isTargeted(muscleGroup) ? highlightColor : defaultColor;
    };

    return (
        <div className="relative w-full max-w-md mx-auto">
            {/* Loewe Styles */}
            <style>{`
                
                
                .body-viz-card {
                    background: linear-gradient(135deg, #C9B79C 0%, #B09A82 100%);
                    border-radius: 18px;
                    padding: 2rem;
                    box-shadow: 
                        0 10px 40px rgba(0,0,0,0.3),
                        inset 0 1px 0 rgba(255,255,255,0.1);
                    position: relative;
                    overflow: hidden;
                }
                
                /* Leather texture overlay */
                .body-viz-card::before {
                    content: "";
                    position: absolute;
                    inset: 0;
                    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E");
                    opacity: 0.6;
                    pointer-events: none;
                }
                
                /* Stitched border effect */
                .stitched-border {
                    border: 2px dashed rgba(139, 115, 85, 0.3);
                    border-radius: 18px;
                    padding: 1px;
                }
                
                .view-toggle-btn {
                    background: linear-gradient(135deg, #8B5A3C, #6B4423);
                    color: #F5EFE7;
                    font-family: var(--font-display);
                    font-weight: 700;
                    letter-spacing: 0.15em;
                    text-transform: uppercase;
                    font-size: 10px;
                    padding: 8px 16px;
                    border-radius: 18px;
                    border: none;
                    box-shadow: 
                        0 2px 8px rgba(0,0,0,0.2),
                        inset 0 1px 0 rgba(255,255,255,0.1);
                    cursor: pointer;
                    transition: all 0.3s ease;
                }
                
                .view-toggle-btn:active {
                    transform: scale(0.95);
                    box-shadow: 
                        0 1px 4px rgba(0,0,0,0.3),
                        inset 0 1px 0 rgba(255,255,255,0.05);
                }
                
                .recovery-title {
                    font-family: var(--font-display);
                    color: #5C4A3A;
                    font-size: 14px;
                    letter-spacing: 0.2em;
                    text-transform: uppercase;
                    font-weight: 700;
                }
            `}</style>

            {/* Card Container */}
            <div className="body-viz-card">
                <div className="relative z-10">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="recovery-title">Target Analysis</h3>
                        {showViewToggle && (
                            <div className="flex gap-2">
                                <motion.button {...pressProps('row')}
 onClick={toggleView}
 className="view-toggle-btn"
 >
                                    {currentView === 'front' ? 'Front' : 'Back'}
                                </motion.button>
                            </div>
                        )}
                    </div>

                    {/* Body Model SVG */}
                    <div className="stitched-border bg-gradient-to-b from-[#D4C5B0] to-[#C9B79C] p-6 rounded-[18px]">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={currentView}
                                initial={{ opacity: 0, rotateY: 90 }}
                                animate={{ opacity: 1, rotateY: 0 }}
                                exit={{ opacity: 0, rotateY: -90 }}
                                transition={{ duration: 0.4 }}
                            >
                                {currentView === 'front' ? (
                                    <FrontBodySVG
                                        targetMuscleGroups={targetMuscleGroups}
                                        getPartColor={getPartColor}
                                        isTargeted={isTargeted}
                                    />
                                ) : (
                                    <BackBodySVG
                                        targetMuscleGroups={targetMuscleGroups}
                                        getPartColor={getPartColor}
                                        isTargeted={isTargeted}
                                    />
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    {/* Legend */}
                    <div className="mt-4 flex items-center justify-center gap-4 text-xs">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: highlightColor }}></div>
                            <span className="text-[#5C4A3A] font-medium">Targeted</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: defaultColor }}></div>
                            <span className="text-[#5C4A3A] font-medium">Passive</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Front View SVG Component
const FrontBodySVG = ({ targetMuscleGroups, getPartColor, isTargeted }) => {
    return (
        <svg viewBox="0 0 240 520" className="w-full h-auto mx-auto" style={{ maxHeight: '500px' }}>
            {/* Head */}
            <ellipse cx="120" cy="35" rx="22" ry="25" fill="rgba(139,115,85,0.3)" stroke="#8B7355" strokeWidth="1.5" />
            <rect x="110" y="55" width="20" height="15" rx="3" fill="rgba(139,115,85,0.3)" stroke="#8B7355" strokeWidth="1" />

            {/* Shoulders */}
            <g className="transition-all duration-300">
                <ellipse
                    cx="80"
                    cy="85"
                    rx="20"
                    ry="18"
                    fill={getPartColor('shoulders')}
                    stroke={getPartColor('shoulders')}
                    strokeWidth="2.5"
                    opacity={isTargeted('shoulders') ? 1 : 0.6}
                />
                <ellipse
                    cx="160"
                    cy="85"
                    rx="20"
                    ry="18"
                    fill={getPartColor('shoulders')}
                    stroke={getPartColor('shoulders')}
                    strokeWidth="2.5"
                    opacity={isTargeted('shoulders') ? 1 : 0.6}
                />
            </g>

            {/* Arms */}
            <g className="transition-all duration-300">
                {/* Left Arm */}
                <path
                    d="M 65 100 Q 60 125 58 145 L 68 145 L 72 125 Q 70 105 68 100 Z"
                    fill={getPartColor('arms')}
                    stroke={getPartColor('arms')}
                    strokeWidth="2"
                    opacity={isTargeted('arms') ? 1 : 0.6}
                />
                {/* Right Arm */}
                <path
                    d="M 175 100 Q 180 125 182 145 L 172 145 L 168 125 Q 170 105 172 100 Z"
                    fill={getPartColor('arms')}
                    stroke={getPartColor('arms')}
                    strokeWidth="2"
                    opacity={isTargeted('arms') ? 1 : 0.6}
                />
            </g>

            {/* Chest */}
            <g className="transition-all duration-300">
                <path
                    d="M 95 80 Q 90 95 90 110 L 90 130 Q 92 140 100 140 L 140 140 Q 148 140 150 130 L 150 110 Q 150 95 145 80 Z"
                    fill={getPartColor('chest')}
                    stroke={getPartColor('chest')}
                    strokeWidth="2.5"
                    opacity={isTargeted('chest') ? 1 : 0.6}
                />
            </g>

            {/* Core/Abs */}
            <g className="transition-all duration-300">
                <rect
                    x="100"
                    y="145"
                    width="40"
                    height="40"
                    rx="4"
                    fill={getPartColor('core')}
                    stroke={getPartColor('core')}
                    strokeWidth="2"
                    opacity={isTargeted('core') ? 1 : 0.6}
                />
            </g>

            {/* Legs */}
            <g className="transition-all duration-300">
                {/* Left Leg */}
                <path
                    d="M 95 190 Q 92 220 92 250 Q 92 280 95 300 L 105 300 Q 108 280 108 250 Q 108 220 105 190 Z"
                    fill={getPartColor('legs')}
                    stroke={getPartColor('legs')}
                    strokeWidth="2.5"
                    opacity={isTargeted('legs') ? 1 : 0.6}
                />
                {/* Right Leg */}
                <path
                    d="M 135 190 Q 132 220 132 250 Q 132 280 135 300 L 145 300 Q 148 280 148 250 Q 148 220 145 190 Z"
                    fill={getPartColor('legs')}
                    stroke={getPartColor('legs')}
                    strokeWidth="2.5"
                    opacity={isTargeted('legs') ? 1 : 0.6}
                />
            </g>

            {/* Labels (optional) */}
            {isTargeted('chest') && (
                <text x="120" y="115" fill="#fff" fontSize="10" fontWeight="bold" textAnchor="middle" className="drop-shadow-lg">
                    CHEST
                </text>
            )}
            {isTargeted('core') && (
                <text x="120" y="168" fill="#fff" fontSize="10" fontWeight="bold" textAnchor="middle" className="drop-shadow-lg">
                    CORE
                </text>
            )}
        </svg>
    );
};

// Back View SVG Component
const BackBodySVG = ({ targetMuscleGroups, getPartColor, isTargeted }) => {
    return (
        <svg viewBox="0 0 240 520" className="w-full h-auto mx-auto" style={{ maxHeight: '500px' }}>
            {/* Head (back view) */}
            <ellipse cx="120" cy="35" rx="22" ry="25" fill="rgba(139,115,85,0.3)" stroke="#8B7355" strokeWidth="1.5" />
            <rect x="110" y="55" width="20" height="15" rx="3" fill="rgba(139,115,85,0.3)" stroke="#8B7355" strokeWidth="1" />

            {/* Shoulders (back) */}
            <g className="transition-all duration-300">
                <ellipse
                    cx="80"
                    cy="85"
                    rx="20"
                    ry="18"
                    fill={getPartColor('shoulders')}
                    stroke={getPartColor('shoulders')}
                    strokeWidth="2.5"
                    opacity={isTargeted('shoulders') ? 1 : 0.6}
                />
                <ellipse
                    cx="160"
                    cy="85"
                    rx="20"
                    ry="18"
                    fill={getPartColor('shoulders')}
                    stroke={getPartColor('shoulders')}
                    strokeWidth="2.5"
                    opacity={isTargeted('shoulders') ? 1 : 0.6}
                />
            </g>

            {/* Back */}
            <g className="transition-all duration-300">
                <path
                    d="M 95 80 Q 90 95 90 120 L 90 160 Q 92 175 100 175 L 140 175 Q 148 175 150 160 L 150 120 Q 150 95 145 80 Z"
                    fill={getPartColor('back')}
                    stroke={getPartColor('back')}
                    strokeWidth="2.5"
                    opacity={isTargeted('back') ? 1 : 0.6}
                />
            </g>

            {/* Lower Back */}
            <g className="transition-all duration-300">
                <rect
                    x="100"
                    y="180"
                    width="40"
                    height="25"
                    rx="4"
                    fill={getPartColor('lower_back')}
                    stroke={getPartColor('lower_back')}
                    strokeWidth="2"
                    opacity={isTargeted('lower_back') ? 1 : 0.6}
                />
            </g>

            {/* Glutes */}
            <g className="transition-all duration-300">
                <ellipse
                    cx="110"
                    cy="220"
                    rx="12"
                    ry="15"
                    fill={getPartColor('glutes')}
                    stroke={getPartColor('glutes')}
                    strokeWidth="2"
                    opacity={isTargeted('glutes') ? 1 : 0.6}
                />
                <ellipse
                    cx="130"
                    cy="220"
                    rx="12"
                    ry="15"
                    fill={getPartColor('glutes')}
                    stroke={getPartColor('glutes')}
                    strokeWidth="2"
                    opacity={isTargeted('glutes') ? 1 : 0.6}
                />
            </g>

            {/* Legs (back) - Hamstrings */}
            <g className="transition-all duration-300">
                {/* Left Leg */}
                <path
                    d="M 95 235 Q 92 260 92 290 L 105 290 Q 108 260 105 235 Z"
                    fill={getPartColor('legs')}
                    stroke={getPartColor('legs')}
                    strokeWidth="2.5"
                    opacity={isTargeted('legs') ? 1 : 0.6}
                />
                {/* Right Leg */}
                <path
                    d="M 135 235 Q 132 260 132 290 L 145 290 Q 148 260 145 235 Z"
                    fill={getPartColor('legs')}
                    stroke={getPartColor('legs')}
                    strokeWidth="2.5"
                    opacity={isTargeted('legs') ? 1 : 0.6}
                />
            </g>

            {/* Labels */}
            {isTargeted('back') && (
                <text x="120" y="125" fill="#fff" fontSize="10" fontWeight="bold" textAnchor="middle" className="drop-shadow-lg">
                    BACK
                </text>
            )}
        </svg>
    );
};

export default BodyTargetVisualizer;
