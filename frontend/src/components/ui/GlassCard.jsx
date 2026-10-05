import React, { useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';

/**
 * GlassCard
 * A translucent, frosted glass container that fits the Cyber Zen aesthetic.
 * v2: 加入 spotlight 動態反光（游標/觸控跟隨 radial-gradient）
 *
 * Variants:
 * - default: Standard content card
 * - instrument: For main display, slightly more opaque/structured
 * - interactive: Hover effects enabled
 */
const GlassCard = ({
    children,
    className = "",
    variant = "default",
    onClick = null,
    delay = 0
}) => {
    const cardRef = useRef(null);
    const [spotlight, setSpotlight] = useState({ x: 50, y: 50, opacity: 0 });

    const handlePointerMove = useCallback((e) => {
        const el = cardRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const x = ((clientX - rect.left) / rect.width) * 100;
        const y = ((clientY - rect.top) / rect.height) * 100;
        setSpotlight({ x, y, opacity: 1 });
    }, []);

    const handlePointerLeave = useCallback(() => {
        setSpotlight(s => ({ ...s, opacity: 0 }));
    }, []);

    // Base styles for all cards
    const baseStyle = "backdrop-blur-xl border border-white/5 rounded-3xl relative overflow-hidden transition-all duration-300";

    // Variant specific overrides
    const variantStyles = {
        default: "bg-slate-900/40 shadow-lg shadow-black/10",
        instrument: "bg-slate-900/60 border-white/10 shadow-xl shadow-cyan-500/5",
        featured: "bg-gradient-to-br from-slate-800/60 to-slate-900/60 border-t-white/10 border-b-black/20",
        glow: "bg-slate-900/40 border-cyan-500/20 shadow-[0_0_15px_-5px_rgba(56,189,248,0.15)]"
    };

    const appliedStyle = variantStyles[variant] || variantStyles.default;

    // Motion props if interactive
    const motionProps = onClick ? {
        whileTap: { scale: 0.98 },
        whileHover: { scale: 1.01 },
        onClick: onClick,
        style: { cursor: "pointer" }
    } : {};

    // Initial animation
    const initialProps = {
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0 },
        transition: { delay: delay, duration: 0.5, ease: "easeOut" }
    };

    return (
        <motion.div
            ref={cardRef}
            className={`${baseStyle} ${appliedStyle} ${className}`}
            onMouseMove={handlePointerMove}
            onMouseLeave={handlePointerLeave}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerLeave}
            {...initialProps}
            {...motionProps}
        >
            {/* Glass glint effect top-left */}
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-50" />

            {/* Spotlight 動態反光層 */}
            <div
                className="absolute inset-0 pointer-events-none rounded-3xl"
                style={{
                    background: `radial-gradient(circle at ${spotlight.x}% ${spotlight.y}%, rgba(255,255,255,0.07) 0%, transparent 60%)`,
                    opacity: spotlight.opacity,
                    transition: 'opacity 0.3s ease',
                    zIndex: 1,
                }}
            />

            <div className="relative z-10">
                {children}
            </div>
        </motion.div>
    );
};

export default GlassCard;
