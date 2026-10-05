import React from 'react';
import { motion } from 'framer-motion';

/**
 * CyberZenBackground
 * A deep navy background with slow-moving liquid/aurora light orbs.
 * Concept: "Deep Sea Bioluminescence"
 */
const CyberZenBackground = ({ children, className = "" }) => {
    return (
        <div className={`relative min-h-[100dvh] w-full overflow-hidden bg-[#0F172A] text-slate-100 ${className}`}>
            {/* Ambient Background Glows - Deep Aurora */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                {/* 1. Electric Cyan Orb (Top Left) */}
                <motion.div
                    animate={{
                        x: [0, 50, 0],
                        y: [0, 30, 0],
                        scale: [1, 1.2, 1],
                        opacity: [0.4, 0.6, 0.4]
                    }}
                    transition={{
                        duration: 15,
                        repeat: Infinity,
                        ease: "easeInOut"
                    }}
                    className="absolute -top-[10%] -left-[10%] w-[600px] h-[600px] rounded-full blur-[100px]"
                    style={{ background: 'radial-gradient(circle, rgba(56,189,248,0.3) 0%, rgba(15,23,42,0) 70%)' }}
                />

                {/* 2. Haze Violet Orb (Bottom Right) */}
                <motion.div
                    animate={{
                        x: [0, -40, 0],
                        y: [0, -50, 0],
                        scale: [1, 1.3, 1],
                        opacity: [0.3, 0.5, 0.3]
                    }}
                    transition={{
                        duration: 18,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: 2
                    }}
                    className="absolute -bottom-[10%] -right-[10%] w-[500px] h-[500px] rounded-full blur-[100px]"
                    style={{ background: 'radial-gradient(circle, rgba(129,140,248,0.25) 0%, rgba(15,23,42,0) 70%)' }}
                />

                {/* 3. Aurora Green Flow (Center-ish) */}
                <motion.div
                    animate={{
                        x: [0, 30, -30, 0],
                        y: [0, -20, 20, 0],
                        rotate: [0, 10, -10, 0],
                        opacity: [0.2, 0.4, 0.2]
                    }}
                    transition={{
                        duration: 20,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: 5
                    }}
                    className="absolute top-[30%] left-[20%] w-[400px] h-[400px] rounded-full blur-[90px]"
                    style={{ background: 'radial-gradient(circle, rgba(45,212,191,0.15) 0%, rgba(15,23,42,0) 70%)' }}
                />

                {/* 4. Deep Blue Base Overlay to unify */}
                <div className="absolute inset-0 bg-[#0F172A]/40 backdrop-blur-[1px]" />
            </div>

            {/* Content Container - Relative to sit above background */}
            <div className="relative z-10 w-full h-full">
                {children}
            </div>
        </div>
    );
};

export default CyberZenBackground;
