import React from 'react';

/**
 * Breathing Aura Component
 * A liquid, organic blob that morphs and pulses based on heart rate zone
 */
const BreathingAura = ({ currentZone, heartRate }) => {
    // Zone configuration with warm red-orange gradients
    const zoneConfig = {
        1: {
            name: 'Warm-up',
            colors: {
                primary: '#FF9A8B',
                secondary: '#FFDEA7',
                accent: '#FFB88C'
            },
            animation: 'blob-morph 8s ease-in-out infinite, breathing-slow 4s ease-in-out infinite'
        },
        2: {
            name: 'Fat Burn',
            colors: {
                primary: '#FF6B6B',
                secondary: '#FFA96B',
                accent: '#FF8E53'
            },
            animation: 'blob-morph 6s ease-in-out infinite, breathing-medium 2.5s ease-in-out infinite'
        },
        3: {
            name: 'Cardio',
            colors: {
                primary: '#FF5252',
                secondary: '#FF9671',
                accent: '#FF7A5C'
            },
            animation: 'blob-morph 5s ease-in-out infinite, breathing-fast 1.5s ease-in-out infinite'
        },
        4: {
            name: 'Threshold',
            colors: {
                primary: '#E74C3C',
                secondary: '#FF8A65',
                accent: '#F06292'
            },
            animation: 'blob-morph 4s ease-in-out infinite, breathing-fast 1.5s ease-in-out infinite'
        },
        5: {
            name: 'Peak',
            colors: {
                primary: '#C62828',
                secondary: '#FF6E40',
                accent: '#D84315'
            },
            animation: 'blob-morph 3s ease-in-out infinite, breathing-fast 1.5s ease-in-out infinite'
        }
    };

    const config = zoneConfig[currentZone] || zoneConfig[1];

    return (
        <div style={{ position: 'relative', width: '340px', height: '340px' }}>
            {/* SVG Filter for organic blob effect */}
            <svg style={{ position: 'absolute', width: 0, height: 0 }}>
                <defs>
                    <filter id="goo">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
                        <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9" result="goo" />
                        <feComposite in="SourceGraphic" in2="goo" operator="atop" />
                    </filter>
                </defs>
            </svg>

            {/* Outer glow layers for depth */}
            <div
                style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '120%',
                    height: '120%',
                    borderRadius: '50%',
                    background: `radial-gradient(circle, ${config.colors.secondary}40 0%, transparent 70%)`,
                    filter: 'blur(40px)',
                    animation: config.animation,
                    opacity: 0.6
                }}
            />

            {/* Main liquid blob container */}
            <div
                style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '280px',
                    height: '280px',
                    filter: 'url(#goo) blur(1px)',
                    animation: config.animation
                }}
            >
                {/* Multiple overlapping blobs for liquid effect */}
                <div
                    className="blob-1"
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '100%',
                        height: '100%',
                        borderRadius: '48% 52% 47% 53% / 53% 49% 51% 47%',
                        background: `radial-gradient(circle at 30% 30%, ${config.colors.primary}, ${config.colors.secondary})`,
                        boxShadow: `
                            0 0 60px ${config.colors.accent}80,
                            inset 0 0 80px ${config.colors.primary}40
                        `
                    }}
                />
                <div
                    className="blob-2"
                    style={{
                        position: 'absolute',
                        top: '52%',
                        left: '48%',
                        transform: 'translate(-50%, -50%)',
                        width: '85%',
                        height: '85%',
                        borderRadius: '52% 48% 51% 49% / 49% 55% 45% 51%',
                        background: `radial-gradient(circle at 60% 40%, ${config.colors.accent}, ${config.colors.secondary}90)`,
                        opacity: 0.8
                    }}
                />
                <div
                    className="blob-3"
                    style={{
                        position: 'absolute',
                        top: '48%',
                        left: '52%',
                        transform: 'translate(-50%, -50%)',
                        width: '70%',
                        height: '70%',
                        borderRadius: '47% 53% 48% 52% / 52% 48% 52% 48%',
                        background: `radial-gradient(circle at 70% 60%, ${config.colors.secondary}, transparent)`,
                        opacity: 0.6
                    }}
                />
            </div>

            {/* Heart rate number overlay */}
            <div
                style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    textAlign: 'center',
                    zIndex: 10
                }}
            >
                <div
                    style={{
                        fontSize: '5.5rem',
                        fontWeight: 200,
                        color: '#2D2520',
                        fontFamily: '"SF Pro Display", -apple-system, sans-serif',
                        letterSpacing: '-0.04em',
                        lineHeight: 1,
                        textShadow: '0 2px 20px rgba(255,255,255,0.5)',
                        filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.1))'
                    }}
                >
                    {heartRate}
                </div>
                <div
                    style={{
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        color: '#6B5D57',
                        fontFamily: 'system-ui, sans-serif',
                        letterSpacing: '0.15em',
                        textTransform: 'uppercase',
                        marginTop: '0.75rem',
                        opacity: 0.85
                    }}
                >
                    BPM
                </div>
            </div>

            {/* CSS Keyframes */}
            <style>{`
                @keyframes blob-morph {
                    0%, 100% {
                        border-radius: 48% 52% 47% 53% / 53% 49% 51% 47%;
                    }
                    25% {
                        border-radius: 52% 48% 55% 45% / 47% 54% 46% 53%;
                    }
                    50% {
                        border-radius: 46% 54% 49% 51% / 51% 47% 53% 49%;
                    }
                    75% {
                        border-radius: 54% 46% 51% 49% / 49% 53% 47% 51%;
                    }
                }

                @keyframes breathing-slow {
                    0%, 100% {
                        transform: translate(-50%, -50%) scale(1);
                        opacity: 0.75;
                    }
                    50% {
                        transform: translate(-50%, -50%) scale(1.06);
                        opacity: 0.95;
                    }
                }

                @keyframes breathing-medium {
                    0%, 100% {
                        transform: translate(-50%, -50%) scale(1);
                        opacity: 0.8;
                    }
                    50% {
                        transform: translate(-50%, -50%) scale(1.1);
                        opacity: 1;
                    }
                }

                @keyframes breathing-fast {
                    0%, 100% {
                        transform: translate(-50%, -50%) scale(1);
                        opacity: 0.85;
                    }
                    50% {
                        transform: translate(-50%, -50%) scale(1.15);
                        opacity: 1;
                    }
                }

                .blob-1 {
                    animation: blob-rotate-1 20s linear infinite;
                }

                .blob-2 {
                    animation: blob-rotate-2 15s linear infinite reverse;
                }

                .blob-3 {
                    animation: blob-rotate-3 25s linear infinite;
                }

                @keyframes blob-rotate-1 {
                    0% { transform: translate(-50%, -50%) rotate(0deg); }
                    100% { transform: translate(-50%, -50%) rotate(360deg); }
                }

                @keyframes blob-rotate-2 {
                    0% { transform: translate(-50%, -50%) rotate(0deg); }
                    100% { transform: translate(-50%, -50%) rotate(360deg); }
                }

                @keyframes blob-rotate-3 {
                    0% { transform: translate(-50%, -50%) rotate(0deg); }
                    100% { transform: translate(-50%, -50%) rotate(360deg); }
                }
            `}</style>
        </div>
    );
};

export default BreathingAura;
