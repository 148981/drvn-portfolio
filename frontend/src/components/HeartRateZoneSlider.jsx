import React from 'react';

/**
 * Heart Rate Zone Slider
 * Visual slider showing current HR position relative to target zones
 */
const HeartRateZoneSlider = ({ currentHR, zones }) => {
    if (!zones || !zones.maxHR) return null;

    const { zone1, zone2, zone3, zone4, zone5, maxHR } = zones;

    // Calculate position percentage (0-100%)
    const getPosition = (hr) => {
        const minHR = zone1.min;
        return ((hr - minHR) / (maxHR - minHR)) * 100;
    };

    const currentPosition = getPosition(currentHR);

    // Zone segments for the slider - Blue theme
    const zoneSegments = [
        { zone: 1, name: 'Warm-up', start: 0, end: getPosition(zone1.max), color: 'rgba(191, 219, 254, 0.8)' },
        { zone: 2, name: 'Fat Burn', start: getPosition(zone2.min), end: getPosition(zone2.max), color: 'rgba(255, 255, 255, 0.9)' },
        { zone: 3, name: 'Cardio', start: getPosition(zone3.min), end: getPosition(zone3.max), color: 'rgba(96, 165, 250, 0.8)' },
        { zone: 4, name: 'Threshold', start: getPosition(zone4.min), end: getPosition(zone4.max), color: 'rgba(59, 130, 246, 0.8)' },
        { zone: 5, name: 'Peak', start: getPosition(zone5.min), end: 100, color: 'rgba(29, 78, 216, 0.8)' }
    ];

    return (
        <div style={{ width: '100%', maxWidth: '340px', margin: '0 auto' }}>
            {/* Slider track */}
            <div
                style={{
                    position: 'relative',
                    width: '100%',
                    height: '12px',
                    backgroundColor: 'rgba(255, 255, 255, 0.3)',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.15)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.2)'
                }}
            >
                {/* Zone segments */}
                {zoneSegments.map((segment) => (
                    <div
                        key={segment.zone}
                        style={{
                            position: 'absolute',
                            left: `${segment.start}%`,
                            width: `${segment.end - segment.start}%`,
                            height: '100%',
                            backgroundColor: segment.color,
                            transition: 'all 0.3s ease'
                        }}
                    />
                ))}

                {/* Fat Burn zone highlight (glass effect) */}
                <div
                    style={{
                        position: 'absolute',
                        left: `${getPosition(zone2.min)}%`,
                        width: `${getPosition(zone2.max) - getPosition(zone2.min)}%`,
                        height: '100%',
                        background: `
                            linear-gradient(135deg, 
                                rgba(255,255,255,0.4) 0%, 
                                transparent 50%, 
                                rgba(56, 189, 248, 0.2) 100%
                            )
                        `,
                        boxShadow: 'inset 0 1px 4px rgba(255,255,255,0.3)',
                        pointerEvents: 'none'
                    }}
                />

                {/* Current position indicator */}
                <div
                    style={{
                        position: 'absolute',
                        left: `${currentPosition}%`,
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '22px',
                        height: '22px',
                        backgroundColor: '#FFFFFF',
                        borderRadius: '50%',
                        border: '3px solid rgba(59, 130, 246, 0.9)',
                        boxShadow: '0 3px 12px rgba(0,0,0,0.3), 0 0 0 4px rgba(255,255,255,0.2)',
                        transition: 'left 0.5s ease-out',
                        zIndex: 10
                    }}
                />
            </div>

            {/* Zone labels */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: '0.75rem',
                    paddingX: '0.25rem'
                }}
            >
                <div
                    style={{
                        fontSize: '0.75rem',
                        color: 'rgba(255,255,255,0.7)',
                        opacity: 0.8,
                        fontFamily: 'system-ui, sans-serif',
                        fontWeight: 600,
                        letterSpacing: '0.05em'
                    }}
                >
                    {zone1.min}
                </div>
                <div
                    style={{
                        fontSize: '0.8125rem',
                        color: '#FFFFFF',
                        fontWeight: 700,
                        fontFamily: 'system-ui, sans-serif',
                        letterSpacing: '0.08em',
                        textShadow: '0 2px 8px rgba(0,0,0,0.2)'
                    }}
                >
                    TARGET
                </div>
                <div
                    style={{
                        fontSize: '0.75rem',
                        color: 'rgba(255,255,255,0.7)',
                        opacity: 0.8,
                        fontFamily: 'system-ui, sans-serif',
                        fontWeight: 600,
                        letterSpacing: '0.05em'
                    }}
                >
                    {maxHR}
                </div>
            </div>
        </div>
    );
};

export default HeartRateZoneSlider;
