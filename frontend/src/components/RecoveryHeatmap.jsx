import React from 'react';
import { Activity, Battery, BatteryCharging, BatteryWarning } from 'lucide-react';

const RecoveryHeatmap = ({ fatigueData = {} }) => {
    // Helper to get fatigue level for an area
    const getFatigue = (area) => fatigueData[area] || 0;

    // Color scheme based on fatigue (0-100)
    const getAreaColor = (area) => {
        const fatigue = getFatigue(area);

        if (fatigue > 60) return "#EF4444"; // Red - Fatigued
        if (fatigue > 30) return "#EAB308"; // Yellow - Recovering
        if (fatigue > 0) return "#5A7A3A";  // Green - Ready (but active)
        return "rgba(255, 255, 255, 0.1)"; // Base - Fully Recovered/Inactive
    };

    const getStrokeOpacity = (area) => {
        const fatigue = getFatigue(area);
        return fatigue > 30 ? 0.8 : 0.3;
    };

    const getRecommendation = () => {
        const values = Object.values(fatigueData);
        if (values.length === 0) return "No Data Available";
        const maxFatigue = Math.max(...values);
        if (maxFatigue > 70) return "Active Recovery Recommended";
        if (maxFatigue > 40) return "Light to Moderate Training";
        return "System Ready for Heavy Load";
    };

    return (
        <div className="relative w-full h-full flex flex-col items-center justify-center p-4">

            {/* Header / Status */}
            <div className="absolute top-2 left-2 right-2 flex justify-between items-start z-10">
                <div className="bg-black/40 backdrop-blur-md rounded-lg p-2 border border-white/10">
                    <div className="text-[11px] text-white/60 mb-1">System Status</div>
                    <div className="text-xs font-semibold text-white flex items-center gap-1">
                        <Activity size={12} className={(Object.values(fatigueData).length > 0 && Math.max(...Object.values(fatigueData)) > 60) ? "text-red-400" : "text-green-400"} />
                        {getRecommendation()}
                    </div>
                </div>
            </div>

            <svg viewBox="0 0 200 420" className="h-full w-auto max-h-[350px] drop-shadow-2xl" xmlns="http://www.w3.org/2000/svg">
                {/* SVG definitions for glow effects */}
                <defs>
                    <filter id="glow-red" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                </defs>

                {/* Head */}
                <circle cx="100" cy="35" r="20" fill="rgba(255,255,255,0.1)" stroke="white" strokeWidth="0.5" strokeOpacity="0.3" />

                {/* Shoulders */}
                <circle cx="70" cy="70" r="14" fill={getAreaColor('shoulders')} stroke="white" strokeOpacity={getStrokeOpacity('shoulders')} />
                <circle cx="130" cy="70" r="14" fill={getAreaColor('shoulders')} stroke="white" strokeOpacity={getStrokeOpacity('shoulders')} />

                {/* Chest */}
                <path d="M75 60 L125 60 L120 120 L80 120 Z" fill={getAreaColor('chest')} stroke="white" strokeOpacity={getStrokeOpacity('chest')} />

                {/* Abs */}
                <path d="M80 120 L120 120 L115 165 L85 165 Z" fill={getAreaColor('core')} stroke="white" strokeOpacity={getStrokeOpacity('core')} />

                {/* Arms */}
                <rect x="52" y="80" width="18" height="55" rx="6" fill={getAreaColor('arms')} stroke="white" strokeOpacity={getStrokeOpacity('arms')} />
                <rect x="130" y="80" width="18" height="55" rx="6" fill={getAreaColor('arms')} stroke="white" strokeOpacity={getStrokeOpacity('arms')} />

                {/* Forearms */}
                <rect x="55" y="140" width="15" height="45" rx="4" fill="rgba(255,255,255,0.1)" stroke="white" strokeOpacity="0.3" />
                <rect x="130" y="140" width="15" height="45" rx="4" fill="rgba(255,255,255,0.1)" stroke="white" strokeOpacity="0.3" />

                {/* Glutes/Hips */}
                <path d="M70 165 L130 165 L140 195 L60 195 Z" fill={getAreaColor('glutes')} stroke="white" strokeOpacity={getStrokeOpacity('glutes')} />

                {/* Thighs */}
                <rect x="65" y="195" width="30" height="85" rx="10" fill={getAreaColor('legs')} stroke="white" strokeOpacity={getStrokeOpacity('legs')} />
                <rect x="105" y="195" width="30" height="85" rx="10" fill={getAreaColor('legs')} stroke="white" strokeOpacity={getStrokeOpacity('legs')} />

                {/* Calves */}
                <rect x="70" y="285" width="20" height="65" rx="6" fill={getAreaColor('calves')} stroke="white" strokeOpacity={getStrokeOpacity('calves')} />
                <rect x="110" y="285" width="20" height="65" rx="6" fill={getAreaColor('calves')} stroke="white" strokeOpacity={getStrokeOpacity('calves')} />
            </svg>

            {/* Legend */}
            <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-4 text-[11px] bg-black/20 p-2 rounded-full mx-auto w-fit backdrop-blur-sm border border-white/5">
                <div className="flex items-center gap-1.5 text-red-400">
                    <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></div>
                    <span>Fatigued</span>
                </div>
                <div className="flex items-center gap-1.5 text-yellow-400">
                    <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                    <span>Recovering</span>
                </div>
                <div className="flex items-center gap-1.5 text-green-400">
                    <div className="w-2 h-2 rounded-full bg-green-400"></div>
                    <span>Prime</span>
                </div>
            </div>
        </div>
    );
};

export default RecoveryHeatmap;
