import React from 'react';
import { motion } from 'framer-motion';

/**
 * AchievementBadge Component
 * Displays a single achievement badge with Loewe-inspired metallic design
 * Supports locked/unlocked states with progress indicators
 */

const PALETTE = {
    gold: '#B8956A',
    bronze: '#CD7F32',
    silver: '#C0C0C0',
    olive: '#556B2F',
    beige: '#F5F2E9',
    darkBeige: '#D4C4B0',
    warmGray: '#8B7F72'
};

const AchievementBadge = ({
    achievement,
    unlocked = false,
    progress = 0,
    size = 'medium',
    onClick,
    showProgress = true,
    celebrationMode = false
}) => {
    const {
        achievement_id,
        name,
        description,
        category,
        icon,
        reward_points
    } = achievement;

    // Size configurations
    const sizes = {
        small: { badge: 80, icon: 32, font: 'text-xs' },
        medium: { badge: 120, icon: 48, font: 'text-sm' },
        large: { badge: 160, icon: 64, font: 'text-base' }
    };

    const config = sizes[size] || sizes.medium;

    // Category colors
    const categoryColors = {
        distance: PALETTE.gold,
        consistency: PALETTE.bronze,
        personal_record: PALETTE.silver,
        special: PALETTE.olive
    };

    const accentColor = categoryColors[category] || PALETTE.gold;

    return (
        <motion.div
            className="relative flex flex-col items-center cursor-pointer"
            onClick={onClick}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            {/* Badge Container */}
            <div
                className="relative flex items-center justify-center rounded-full"
                style={{
                    width: config.badge,
                    height: config.badge,
                    background: unlocked
                        ? `linear-gradient(145deg, ${accentColor} 0%, ${PALETTE.darkBeige} 100%)`
                        : `linear-gradient(145deg, #E0E0E0 0%, #BDBDBD 100%)`,
                    boxShadow: unlocked
                        ? `0 8px 20px rgba(0,0,0,0.2), 
                           inset 0 2px 0 rgba(255,255,255,0.4),
                           inset 0 -4px 8px rgba(0,0,0,0.15)`
                        : `0 4px 10px rgba(0,0,0,0.1),
                           inset 0 2px 0 rgba(255,255,255,0.2)`,
                    border: unlocked
                        ? `3px solid ${accentColor}`
                        : '2px solid #9E9E9E',
                    filter: unlocked ? 'none' : 'grayscale(80%)',
                    transform: celebrationMode ? 'scale(1.1)' : 'scale(1)',
                    transition: 'all 0.3s ease'
                }}
            >
                {/* Metallic Sheen */}
                <div
                    className="absolute inset-0 rounded-full pointer-events-none"
                    style={{
                        background: 'linear-gradient(145deg, rgba(255,255,255,0.5) 0%, transparent 50%)',
                        opacity: unlocked ? 1 : 0.3
                    }}
                />

                {/* Icon */}
                <div
                    className="relative z-10"
                    style={{
                        fontSize: config.icon,
                        opacity: unlocked ? 1 : 0.5,
                        filter: unlocked ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' : 'none'
                    }}
                >
                    {icon}
                </div>

                {/* Lock Overlay for Locked Achievements */}
                {!unlocked && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-full backdrop-blur-sm">
                        <span className="text-3xl">🔒</span>
                    </div>
                )}

                {/* Progress Ring for In-Progress Achievements */}
                {!unlocked && showProgress && progress > 0 && progress < 100 && (
                    <svg
                        className="absolute inset-0"
                        style={{ transform: 'rotate(-90deg)' }}
                        width={config.badge}
                        height={config.badge}
                    >
                        <circle
                            cx={config.badge / 2}
                            cy={config.badge / 2}
                            r={(config.badge - 10) / 2}
                            fill="none"
                            stroke={accentColor}
                            strokeWidth="4"
                            strokeDasharray={`${2 * Math.PI * ((config.badge - 10) / 2)}`}
                            strokeDashoffset={`${2 * Math.PI * ((config.badge - 10) / 2) * ((100 - progress) / 100)}`}
                            opacity="0.7"
                        />
                    </svg>
                )}

                {/* Celebration Sparkles */}
                {celebrationMode && (
                    <>
                        {[0, 60, 120, 180, 240, 300].map((angle, i) => (
                            <motion.div
                                key={i}
                                className="absolute"
                                style={{
                                    width: 8,
                                    height: 8,
                                    background: accentColor,
                                    borderRadius: '50%',
                                    top: '50%',
                                    left: '50%'
                                }}
                                initial={{ opacity: 0, scale: 0 }}
                                animate={{
                                    opacity: [0, 1, 0],
                                    scale: [0, 1, 0],
                                    x: Math.cos(angle * Math.PI / 180) * 60,
                                    y: Math.sin(angle * Math.PI / 180) * 60
                                }}
                                transition={{
                                    duration: 1,
                                    repeat: Infinity,
                                    delay: Math.min(i, 6) * 0.1
                                }}
                            />
                        ))}
                    </>
                )}
            </div>

            {/* Achievement Name */}
            <div className="mt-3 text-center">
                <h4
                    className={`font-bold ${config.font}`}
                    style={{ color: unlocked ? PALETTE.warmGray : '#9E9E9E' }}
                >
                    {name}
                </h4>

                {/* Progress Percentage (if locked and in progress) */}
                {!unlocked && showProgress && progress > 0 && (
                    <p className="text-xs mt-1" style={{ color: '#BDBDBD' }}>
                        {Math.round(progress)}% Complete
                    </p>
                )}

                {/* Points (if unlocked) */}
                {unlocked && reward_points && (
                    <p className="text-xs mt-1 font-semibold" style={{ color: accentColor }}>
                        +{reward_points} pts
                    </p>
                )}
            </div>
        </motion.div>
    );
};

export default AchievementBadge;
