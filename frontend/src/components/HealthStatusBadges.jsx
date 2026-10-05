import React, { memo } from 'react';

const HealthStatusBadges = ({
    isHealthKitAvailable, 
    healthKitIsActive, 
    forceSimulation, 
    toggleForceSimulation, 
    hasHeartRateData,
    style = {}
}) => {
    if (!healthKitIsActive && !forceSimulation) return null;

    return (
        <div className="flex flex-col items-end gap-1" style={style}>
            <div 
                onClick={toggleForceSimulation}
                className={`px-2 py-1 rounded-lg text-[11px] font-black cursor-pointer active:scale-95 transition-all shadow-sm border border-black/5 ${
                    forceSimulation 
                        ? 'bg-orange-500 text-white' 
                        : (isHealthKitAvailable ? 'bg-green-500 text-white' : 'bg-orange-500 text-white')
                }`}
            >
                {forceSimulation ? '🛠️ FORCED SIM' : (isHealthKitAvailable ? '✓ HEALTHKIT' : '⚠️ SIMULATION')}
            </div>
            
            {isHealthKitAvailable && !hasHeartRateData && !forceSimulation && (
                <div className="px-2 py-1 rounded-lg bg-yellow-500 text-white text-[11px] font-black shadow-sm border border-black/5 whitespace-nowrap">
                    NO HEART RATE
                </div>
            )}
        </div>
    );
};

// 🟢 P2-2: 純展示 badge，props 驅動 → memo
export default memo(HealthStatusBadges);
