import React from 'react';
import { AlertTriangle, TrendingUp } from 'lucide-react';

const BodyWeaknessMap = ({ weaknesses = [], targetAreas = [] }) => {
    // Helper to check if an area is weak
    const isWeak = (area) => weaknesses.some(w => w.area === area);
    const getWeakness = (area) => weaknesses.find(w => w.area === area);

    // Helper to check if an area is targeted (from workout plan)
    const isTargeted = (area) => targetAreas.includes(area);

    // Color scheme
    const baseColor = "rgba(255, 255, 255, 0.15)";
    const targetColor = "#FB923C"; // Orange-400 for Focus/Target
    const weakColor = "#F87171"; // Red - for weak areas
    const criticalColor = "#EF4444"; // Darker red - for critical weakness

    const getAreaColor = (area) => {
        const weakness = getWeakness(area);
        if (weakness) {
            return weakness.severity === 'critical' ? criticalColor : weakColor;
        }
        if (isTargeted(area)) return targetColor;
        return baseColor;
    };

    const getStroke = (area) => {
        const weakness = getWeakness(area);
        if (weakness) {
            return weakness.severity === 'critical' ? 2 : 1.5;
        }
        return 0.5;
    };

    return (
        <div className="relative w-full h-full flex flex-col items-center justify-center p-4">
            <svg viewBox="0 0 200 420" className="h-full w-auto max-h-[350px] drop-shadow-xl" xmlns="http://www.w3.org/2000/svg">
                {/* Head */}
                <circle cx="100" cy="35" r="20" fill={baseColor} stroke="white" strokeWidth="0.5" strokeOpacity="0.3" />

                {/* Shoulders (Delts) */}
                <circle
                    cx="70" cy="70" r="14"
                    fill={getAreaColor('shoulders')}
                    stroke={isWeak('shoulders') ? weakColor : "white"}
                    strokeWidth={getStroke('shoulders')}
                    strokeOpacity="0.6"
                />
                <circle
                    cx="130" cy="70" r="14"
                    fill={getAreaColor('shoulders')}
                    stroke={isWeak('shoulders') ? weakColor : "white"}
                    strokeWidth={getStroke('shoulders')}
                    strokeOpacity="0.6"
                />

                {/* Chest/Torso */}
                <path
                    d="M75 60 L125 60 L120 120 L80 120 Z"
                    fill={getAreaColor('chest')}
                    stroke={isWeak('chest') || isWeak('back') ? weakColor : "white"}
                    strokeWidth={Math.max(getStroke('chest'), getStroke('back'))}
                    strokeOpacity="0.6"
                />

                {/* Abs/Core */}
                <path
                    d="M80 120 L120 120 L115 165 L85 165 Z"
                    fill={getAreaColor('abs')}
                    stroke={isWeak('abs') || isWeak('core') ? weakColor : "white"}
                    strokeWidth={Math.max(getStroke('abs'), getStroke('core'))}
                    strokeOpacity="0.6"
                />

                {/* Arms (Biceps/Triceps) */}
                {/* Right Arm (Screen Left) */}
                <rect
                    x="52" y="80" width="18" height="55" rx="6"
                    fill={isTargeted('right_arm') ? targetColor : getAreaColor('arms')}
                    stroke={isWeak('right_arm') || isWeak('arms') ? weakColor : "white"}
                    strokeWidth={Math.max(getStroke('arms'), getStroke('right_arm'))}
                    strokeOpacity="0.6"
                />
                {/* Left Arm (Screen Right) */}
                <rect
                    x="130" y="80" width="18" height="55" rx="6"
                    fill={isTargeted('left_arm') ? targetColor : getAreaColor('arms')}
                    stroke={isWeak('left_arm') || isWeak('arms') ? weakColor : "white"}
                    strokeWidth={Math.max(getStroke('arms'), getStroke('left_arm'))}
                    strokeOpacity="0.6"
                />

                {/* Forearms */}
                <rect x="55" y="140" width="15" height="45" rx="4" fill={baseColor} stroke="white" strokeWidth="0.5" strokeOpacity="0.3" />
                <rect x="130" y="140" width="15" height="45" rx="4" fill={baseColor} stroke="white" strokeWidth="0.5" strokeOpacity="0.3" />

                {/* Hips/Glutes */}
                <path
                    d="M70 165 L130 165 L140 195 L60 195 Z"
                    fill={getAreaColor('glutes')}
                    stroke={isWeak('glutes') ? weakColor : "white"}
                    strokeWidth={getStroke('glutes')}
                    strokeOpacity="0.6"
                />

                {/* Thighs (Quads/Hamstrings) */}
                {/* Right Leg (Screen Left) */}
                <rect
                    x="73" y="200" width="22" height="70" rx="8"
                    fill={isTargeted('right_leg') ? targetColor : getAreaColor('legs')}
                    stroke={isWeak('right_leg') || isWeak('legs') ? weakColor : "white"}
                    strokeWidth={Math.max(getStroke('legs'), getStroke('right_leg'))}
                    strokeOpacity="0.6"
                />
                {/* Left Leg (Screen Right) */}
                <rect
                    x="115" y="200" width="22" height="70" rx="8"
                    fill={isTargeted('left_leg') ? targetColor : getAreaColor('legs')}
                    stroke={isWeak('left_leg') || isWeak('legs') ? weakColor : "white"}
                    strokeWidth={Math.max(getStroke('legs'), getStroke('left_leg'))}
                    strokeOpacity="0.6"
                />

                {/* Calves */}
                {/* Right Calf (Screen Left) */}
                <rect
                    x="75" y="275" width="18" height="55" rx="6"
                    fill={isTargeted('right_leg') ? targetColor : getAreaColor('calves')}
                    stroke={isWeak('right_leg') || isWeak('calves') ? weakColor : "white"}
                    strokeWidth={Math.max(getStroke('calves'), getStroke('right_leg'))}
                    strokeOpacity="0.6"
                />
                {/* Left Calf (Screen Right) */}
                <rect
                    x="117" y="275" width="18" height="55" rx="6"
                    fill={isTargeted('left_leg') ? targetColor : getAreaColor('calves')}
                    stroke={isWeak('left_leg') || isWeak('calves') ? weakColor : "white"}
                    strokeWidth={Math.max(getStroke('calves'), getStroke('left_leg'))}
                    strokeOpacity="0.6"
                />
            </svg>

            {/* Legend */}
            <div className="absolute bottom-2 right-2 glass-card-light p-2 space-y-1 text-[11px]">
                {weaknesses.length > 0 && (
                    <div className="flex items-center gap-1 text-red-400">
                        <div className="w-2 h-2 rounded-full bg-red-400"></div>
                        <span>Needs Work</span>
                    </div>
                )}
                {targetAreas.length > 0 && (
                    <div className="flex items-center gap-1 text-orange-400">
                        <div className="w-2 h-2 rounded-full bg-orange-400"></div>
                        <span>Focus Area</span>
                    </div>
                )}
            </div>

            {/* Weakness Indicators */}
            {weaknesses.length > 0 && (
                <div className="mt-3 w-full space-y-2">
                    <h4 className="text-xs font-semibold text-red-400 flex items-center gap-1 uppercase tracking-wide">
                        <AlertTriangle size={12} />
                        Areas to Improve
                    </h4>
                    <div className="space-y-1">
                        {weaknesses.map((weakness, idx) => (
                            <div
                                key={idx}
                                className={`text-[11px] px-2 py-1 rounded-lg ${weakness.severity === 'critical'
                                    ? 'bg-red-500/20 border border-red-500/30 text-red-300'
                                    : 'bg-orange-500/20 border border-orange-500/30 text-orange-300'
                                    }`}
                            >
                                <div className="font-medium capitalize">{weakness.area}</div>
                                <div className="text-white/60">{weakness.reason}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default BodyWeaknessMap;
