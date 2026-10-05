import React from 'react';
import { motion } from 'framer-motion';

/**
 * ══════════════════════════════════════════════════════════════
 * ACID BENTO CARD — Swiss-Noir "Hardware-Grade" Edition
 * ══════════════════════════════════════════════════════════════
 * High-fidelity card system with brushed metal textures,
 * specular highlights, and diamond-cut edge effects.
 * ══════════════════════════════════════════════════════════════
 */

const TEXTURES = {
    titaniumMist: 'linear-gradient(135deg, #F6F4F1 0%, #F9F8F6 35%, #F2EEE9 65%, #F6F4F1 100%)',
    titaniumPebble: 'linear-gradient(135deg, #BDB2A2 0%, #D4CDC5 35%, #C4B9AC 65%, #BDB2A2 100%)',
    titaniumStone: 'linear-gradient(135deg, #E4DED2 0%, #F0EDE6 35%, #D8D0C0 65%, #E4DED2 100%)',
    titaniumObsidian: 'linear-gradient(135deg, #161415 0%, #262523 35%, #1A1819 65%, #161415 100%)',
    titaniumCoral: 'linear-gradient(135deg, #FF7A6B 0%, #F96C5C 35%, #EB5141 65%, #FF7A6B 100%)',
};

const AcidBentoCard = ({
    children,
    className = "",
    variant = "glass",
    onClick = null,
    delay = 0,
    shape = "none",
    style: customStyle = {}
}) => {

    // Variants configuration
    const variants = {
        "titanium-mist": {
            bg: TEXTURES.titaniumMist,
            text: "text-[#161415]",
            glow: "shadow-[0_20px_50px_rgba(0,0,0,0.1)]",
            textureOpacity: 0.05,
            border: "rgba(22,20,21,0.1)",
            specular: "rgba(255,255,255,0.3)"
        },
        "titanium-stone": {
            bg: TEXTURES.titaniumStone,
            text: "text-[#161415]",
            glow: "shadow-[0_20px_50px_rgba(0,0,0,0.1)]",
            textureOpacity: 0.05,
            border: "rgba(22,20,21,0.08)",
            specular: "rgba(255,255,255,0.4)"
        },
        "titanium-obsidian": {
            bg: TEXTURES.titaniumObsidian,
            text: "text-[#F6F4F1]",
            glow: "shadow-[0_25px_60px_rgba(0,0,0,0.5)]",
            textureOpacity: 0.03,
            border: "rgba(255,255,255,0.08)",
            specular: "rgba(255,255,255,0.1)"
        },
        "titanium-coral": {
            bg: TEXTURES.titaniumCoral,
            text: "text-white",
            glow: "shadow-[0_20px_50px_rgba(249,92,75,0.3)]",
            textureOpacity: 0.04,
            border: "rgba(255,255,255,0.15)",
            specular: "rgba(255,255,255,0.25)"
        },
        "beige": {
            bg: "linear-gradient(135deg, #F6F4F1 0%, #E4DED2 100%)",
            text: "text-[#161415]",
            glow: "shadow-[0_4px_16px_rgba(22,20,21,0.08)]",
            textureOpacity: 0.02,
            border: "rgba(22,20,21,0.08)",
            specular: "rgba(255,255,255,0.3)"
        },
        "solid": {
            bg: "rgba(255,255,255,0.05)",
            text: "text-white",
            glow: "shadow-xl",
            textureOpacity: 0,
            border: "rgba(255,255,255,0.1)",
            specular: "rgba(255,255,255,0.1)"
        },
        glass: {
            bg: "rgba(255,255,255,0.1)",
            text: "text-white",
            glow: "shadow-lg",
            textureOpacity: 0,
            border: "rgba(255,255,255,0.2)",
            specular: "rgba(255,255,255,0.2)"
        }
    };

    const config = variants[variant] || variants.glass;
    const isTitanium = variant.startsWith('titanium');

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay, type: "spring", stiffness: 180, damping: 22 }}
            whileTap={onClick ? { scale: 0.97 } : {}}
            className={`relative overflow-hidden rounded-[28px] p-6 transition-all duration-300 isolate shadow-xl group ${config.text} ${className}`}
            onClick={onClick}
            style={{ 
                cursor: onClick ? 'pointer' : undefined, 
                background: config.bg,
                boxShadow: config.glow,
                border: `1px solid ${config.border}`,
                ...customStyle 
            }}
        >
            {/* 1. BRUSHED TEXTURE OVERLAY */}
            {(isTitanium || variant === "beige") && (
                <div className="absolute inset-0 pointer-events-none mix-blend-overlay" 
                     style={{ 
                         backgroundImage: `url("https://www.transparenttextures.com/patterns/brushed-alum.png")`,
                         opacity: config.textureOpacity 
                     }} />
            )}

            {/* 2. SPECULAR SHEEN */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.05] to-transparent pointer-events-none" />
            
            {/* 3. LIGHTING LAYERS */}
            {variant !== "solid" && !isTitanium && (
                <div className={`absolute top-0 left-0 w-full h-[60%] bg-gradient-to-b from-white/20 to-transparent pointer-events-none`} />
            )}

            {/* 4. DIAMOND-CUT EDGE HIGHLIGHT */}
            <div className="absolute inset-0 border-[0.5px] rounded-[28px] pointer-events-none" 
                 style={{ borderColor: config.specular }} />

            {/* Content Layer */}
            <div className="relative z-10 h-full flex flex-col justify-between">
                {children}
            </div>
        </motion.div>
    );
};

export default AcidBentoCard;

