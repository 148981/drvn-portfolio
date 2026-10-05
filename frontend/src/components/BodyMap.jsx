import React from 'react';

const BodyMap = ({ targetAreas = [] }) => {
    // Helper to check if an area is targeted
    const isTargeted = (area) => targetAreas.includes(area);

    // Default color vs Highlight color
    const baseColor = "rgba(255, 255, 255, 0.2)";
    const highlightColor = "#D4C5A8"; // Glass beige
    const secondaryHighlight = "#8FA6CB"; // Glass blue

    // Simple SVG paths for body parts (abstract representation)
    return (
        <div className="relative w-full h-full flex items-center justify-center p-4">
            <svg viewBox="0 0 200 400" className="h-full w-auto max-h-[300px] drop-shadow-xl" xmlns="http://www.w3.org/2000/svg">
                {/* Head */}
                <circle cx="100" cy="35" r="20" fill={baseColor} />

                {/* Torso/Chest */}
                <path
                    d="M75 60 L125 60 L120 120 L80 120 Z"
                    fill={isTargeted('chest') || isTargeted('back') ? highlightColor : baseColor}
                    stroke="white" strokeWidth="0.5" strokeOpacity="0.1"
                />

                {/* Abs/Core */}
                <path
                    d="M80 120 L120 120 L115 160 L85 160 Z"
                    fill={isTargeted('abs') || isTargeted('core') ? highlightColor : baseColor}
                />

                {/* Shoulders (Delts) */}
                <circle cx="70" cy="70" r="12" fill={isTargeted('shoulders') ? highlightColor : baseColor} />
                <circle cx="130" cy="70" r="12" fill={isTargeted('shoulders') ? highlightColor : baseColor} />

                {/* Arms (Biceps/Triceps) */}
                <rect x="55" y="80" width="15" height="50" rx="5" fill={isTargeted('arms') || isTargeted('biceps') || isTargeted('triceps') ? highlightColor : baseColor} />
                <rect x="130" y="80" width="15" height="50" rx="5" fill={isTargeted('arms') || isTargeted('biceps') || isTargeted('triceps') ? highlightColor : baseColor} />

                {/* Forearms */}
                <rect x="58" y="135" width="12" height="40" rx="3" fill={baseColor} />
                <rect x="130" y="135" width="12" height="40" rx="3" fill={baseColor} />

                {/* Hips */}
                <path d="M70 160 L130 160 L140 190 L60 190 Z" fill={baseColor} />

                {/* Thighs (Quads/Hamstrings) */}
                <rect x="65" y="190" width="30" height="80" rx="8" fill={isTargeted('legs') || isTargeted('thighs') ? highlightColor : baseColor} />
                <rect x="105" y="190" width="30" height="80" rx="8" fill={isTargeted('legs') || isTargeted('thighs') ? highlightColor : baseColor} />

                {/* Calves */}
                <rect x="70" y="275" width="20" height="60" rx="5" fill={isTargeted('calves') || isTargeted('legs') ? highlightColor : baseColor} />
                <rect x="110" y="275" width="20" height="60" rx="5" fill={isTargeted('calves') || isTargeted('legs') ? highlightColor : baseColor} />
            </svg>

            {/* Legend/Labels */}
            <div className="absolute bottom-0 right-0 glass-card-light p-2 text-[11px] text-white/60">
                <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-glass-beige"></div> Target Area
                </div>
            </div>
        </div>
    );
};

export default BodyMap;
