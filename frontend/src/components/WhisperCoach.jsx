import React from 'react';

/**
 * Whisper Coach Component
 * Modern, bold coaching messages based on current heart rate zone
 */
const WhisperCoach = ({ currentZone, targetZone = 2 }) => {
    const getCoachingMessage = () => {
        if (currentZone < targetZone) {
            return {
                main: "Pick up the pace",
                sub: "You're warming up nicely"
            };
        } else if (currentZone === targetZone) {
            return {
                main: "Perfect zone",
                sub: "Keep this rhythm"
            };
        } else {
            return {
                main: "Ease off to stay in the zone",
                sub: "Let your breath guide you back"
            };
        }
    };

    const message = getCoachingMessage();
    const isInTargetZone = currentZone === targetZone;

    return (
        <div
            style={{
                textAlign: 'center',
                padding: '1.5rem 2rem',
                transition: 'all 0.8s ease-in-out'
            }}
        >
            {/* Main coaching text */}
            <div
                style={{
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    fontSize: '1.75rem',
                    fontWeight: 700,
                    color: '#2D2520',
                    marginBottom: '0.75rem',
                    letterSpacing: '-0.01em',
                    lineHeight: 1.2,
                    transition: 'color 1s ease-in-out',
                    textShadow: isInTargetZone
                        ? '0 2px 12px rgba(255, 107, 107, 0.2)'
                        : '0 2px 8px rgba(0,0,0,0.08)',
                    textTransform: 'lowercase'
                }}
            >
                {message.main}
            </div>

            {/* Subtitle */}
            <div
                style={{
                    fontFamily: 'system-ui, sans-serif',
                    fontSize: '0.9375rem',
                    color: '#6B5D57',
                    opacity: 0.85,
                    fontWeight: 400,
                    letterSpacing: '0.02em'
                }}
            >
                {message.sub}
            </div>
        </div>
    );
};

export default WhisperCoach;
