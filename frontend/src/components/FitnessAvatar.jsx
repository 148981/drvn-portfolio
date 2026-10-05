import React, { useState, useEffect, useMemo } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { Palette } from 'lucide-react';

/**
 * Dual Style Avatar System with State-Based Particle Effects
 * Male: Beige Beanie, Beige Turtleneck, Big Ears
 * Female: Black Cap, Red Turtleneck, Gold Earrings, Wide Rectangular Bangs
 */
const FitnessAvatar = ({ recoveryData = {}, onPartClick, todayDayNumber = null, showCustomizer = true }) => {
    const [hoveredPart, setHoveredPart] = useState(null);
    const [customizerOpen, setCustomizerOpen] = useState(false);

    // Initial config based on references
    const [avatarConfig, setAvatarConfig] = useState(() => {
        const saved = localStorage.getItem('avatarConfig');
        return saved ? JSON.parse(saved) : {
            skinTone: '#FFD4B2',
            hairStyle: 'short', // short=Male Ref, long=Female Ref
            hairColor: '#A0826D', // Ash Brown (for female)
            hatColor: '#F5F5DC',  // Beige/Off-white (Default for male)
            topColor: '#D2B48C',  // Beige (default male)
            bottomColor: '#1F2937'
        };
    });

    // Auto-update colors when switching styles if using defaults
    useEffect(() => {
        if (avatarConfig.hairStyle === 'short') { // Male
            if (avatarConfig.hatColor === '#161415') setAvatarConfig(c => ({ ...c, hatColor: '#F5F5DC' }));
        } else { // Female
            if (avatarConfig.hatColor === '#F5F5DC') setAvatarConfig(c => ({ ...c, hatColor: '#161415' }));
        }
    }, [avatarConfig.hairStyle]);

    // Avatar State Logic
    const avatarState = useMemo(() => {
        const redParts = Object.values(recoveryData).filter(
            p => p && p.hoursAgo >= 48 && p.hoursAgo < 72
        ).length;
        if (redParts >= 2) return 'overtraining';
        if (todayDayNumber !== null) return 'training';
        const allRecovered = Object.values(recoveryData).every(p => !p || p.hoursAgo < 24);
        if (allRecovered && Object.keys(recoveryData).length > 0) return 'recovery';
        return 'idle';
    }, [recoveryData, todayDayNumber]);

    useEffect(() => {
        localStorage.setItem('avatarConfig', JSON.stringify(avatarConfig));
    }, [avatarConfig]);

    // Recovery Helpers with LOEWE Morandi Palette
    const getRecoveryColor = (partId) => {
        const data = recoveryData[partId];
        if (!data) return '#7B8D93'; // Dusty Blue for untrained
        const hoursAgo = data.hoursAgo || 999;
        if (hoursAgo < 24) return '#8F9E8B';  // Sage Green - Recovered
        if (hoursAgo < 48) return '#C68E5D';  // Caramel - Active Recovery
        if (hoursAgo < 72) return '#D6C6B9';  // Muted Clay - Needs Rest
        return '#7B8D93'; // Dusty Blue
    };

    const getRecoveryText = (partId) => {
        const data = recoveryData[partId];
        if (!data) return '未訓練';
        const hoursAgo = data.hoursAgo || 999;
        if (hoursAgo < 24) return '已恢復';
        if (hoursAgo < 48) return '恢復中';
        if (hoursAgo < 72) return '需休息';
        return '未訓練';
    };

    const getPartName = (partId) => {
        const names = {
            chest: '胸部',
            abs: '腹部',
            leftArm: '左臂',
            rightArm: '右臂',
            leftLeg: '左腿',
            rightLeg: '右腿'
        };
        return names[partId] || '';
    };

    const isMale = avatarConfig.hairStyle === 'short';

    // Particle configuration based on state
    const getParticleConfig = () => {
        switch (avatarState) {
            case 'training':
                return { color: '#3B82F6', count: 8, speed: 2, emoji: '💪' };
            case 'recovery':
                return { color: '#5A7A3A', count: 12, speed: 1.5, emoji: '✨' };
            case 'overtraining':
                return { color: '#EF4444', count: 6, speed: 1, emoji: '😓' };
            default: // idle
                return { color: '#94A3B8', count: 4, speed: 1, emoji: '💤' };
        }
    };

    const particleConfig = getParticleConfig();

    return (
        <div className="relative">
            {/* Header - Only show if customizer is enabled */}
            {showCustomizer && (
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white font-bold text-lg flex items-center gap-2">
                        <span className="w-2 h-2 bg-[#D4C5A5] rounded-full"></span>
                        我的訓練夥伴
                    </h3>
                    <motion.button {...pressProps('row')}
 onClick={() => setCustomizerOpen(!customizerOpen)}
 className="p-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/30 rounded-lg"
 >
                        <Palette size={16} className="text-purple-400" />
                    </motion.button>
                </div>
            )}

            <div className="rounded-[18px] p-6 border relative overflow-hidden" style={{ backgroundColor: '#33302C', borderColor: 'rgba(224, 216, 211, 0.1)' }}>
                {/* Particle Effects Background */}
                <div className="absolute inset-0 pointer-events-none">
                    {[...Array(particleConfig.count)].map((_, i) => (
                        <motion.div
                            key={i}
                            className="absolute text-2xl"
                            initial={{
                                x: Math.random() * 260,
                                y: 280,
                                opacity: 0
                            }}
                            animate={{
                                y: -50,
                                x: Math.random() * 260,
                                opacity: [0, 0.6, 0]
                            }}
                            transition={{
                                duration: 3 + Math.random() * 2,
                                repeat: Infinity,
                                delay: Math.min(i, 6) * 0.3,
                                ease: "easeOut"
                            }}
                        >
                            {particleConfig.emoji}
                        </motion.div>
                    ))}
                </div>

                <svg viewBox="0 0 200 280" className="w-full h-auto max-w-[260px] mx-auto relative z-10">
                    <defs>
                        <filter id="clayShadow">
                            <feGaussianBlur in="SourceAlpha" stdDeviation="2.5" />
                            <feOffset dx="0" dy="3" />
                            <feComponentTransfer><feFuncA type="linear" slope="0.3" /></feComponentTransfer>
                            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                        <filter id="innerGlow">
                            <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur" />
                            <feOffset dx="1" dy="2" result="offsetBlur" />
                            <feComposite in="offsetBlur" in2="SourceAlpha" operator="out" result="inverse" />
                            <feFlood floodColor="black" floodOpacity="0.15" />
                            <feComposite in2="inverse" operator="in" result="shadow" />
                            <feMerge><feMergeNode in="SourceGraphic" /><feMergeNode in="shadow" /></feMerge>
                        </filter>
                        <radialGradient id="skinGrad" cx="40%" cy="30%">
                            <stop offset="0%" stopColor="#FFF0E0" />
                            <stop offset="100%" stopColor={avatarConfig.skinTone} />
                        </radialGradient>
                        <linearGradient id="clothingGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="rgba(255,255,255,0.15)" />
                            <stop offset="50%" stopColor="rgba(0,0,0,0)" />
                            <stop offset="100%" stopColor="rgba(0,0,0,0.2)" />
                        </linearGradient>
                    </defs>

                    <motion.g
                        animate={{ y: [0, -2, 0] }}
                        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    >
                        {/* === BACK HAIR (Female) === */}
                        {!isMale && (
                            <path d="M 65,85 Q 55,140 70,180 Q 100,195 130,180 Q 145,140 135,85" fill={avatarConfig.hairColor} filter="url(#clayShadow)" />
                        )}

                        {/* === HEAD GROUP (Scaled Down) === */}
                        <g transform="translate(100, 95) scale(0.9) translate(-100, -95)">

                            {/* Head Shape */}
                            <ellipse cx="100" cy="95" rx="50" ry="54" fill="url(#skinGrad)" filter="url(#innerGlow)" />

                            {/* Ears (Male: Big/Round, Female: Smaller) */}
                            {isMale ? (
                                <>
                                    <path d="M 50,95 Q 32,85 32,110 Q 37,125 50,115" fill="url(#skinGrad)" filter="url(#clayShadow)" />
                                    <path d="M 150,95 Q 168,85 168,110 Q 163,125 150,115" fill="url(#skinGrad)" filter="url(#clayShadow)" />
                                    <path d="M 57,100 Q 47,100 47,110" stroke="#E5B89C" strokeWidth="2" fill="none" opacity="0.5" />
                                    <path d="M 143,100 Q 153,100 153,110" stroke="#E5B89C" strokeWidth="2" fill="none" opacity="0.5" />
                                </>
                            ) : (
                                <>
                                    <ellipse cx="48" cy="105" rx="9" ry="13" fill="url(#skinGrad)" filter="url(#clayShadow)" />
                                    <ellipse cx="152" cy="105" rx="9" ry="13" fill="url(#skinGrad)" filter="url(#clayShadow)" />
                                    {/* Gold Earrings */}
                                    <g filter="url(#clayShadow)">
                                        <circle cx="48" cy="120" r="3.5" fill="#D4A853" />
                                        <circle cx="48" cy="126" r="5" stroke="#D4A853" strokeWidth="2" fill="none" />
                                        <circle cx="152" cy="120" r="3.5" fill="#D4A853" />
                                        <circle cx="152" cy="126" r="5" stroke="#D4A853" strokeWidth="2" fill="none" />
                                    </g>
                                </>
                            )}

                            {/* Cheek Blush */}
                            <ellipse cx="68" cy="110" rx="11" ry="7" fill="#FF8888" opacity="0.3" filter="url(#blur)" />
                            <ellipse cx="132" cy="110" rx="11" ry="7" fill="#FF8888" opacity="0.3" filter="url(#blur)" />

                            {/* Face Features */}
                            {/* Eyebrows - Lighter Brown */}
                            <path d="M 72,80 Q 82,74 92,80" stroke="#8D6E63" strokeWidth="4.5" strokeLinecap="round" fill="none" />
                            <path d="M 108,80 Q 118,74 128,80" stroke="#8D6E63" strokeWidth="4.5" strokeLinecap="round" fill="none" />

                            {/* Eyes */}
                            <ellipse cx="80" cy="95" rx="6.5" ry="8.5" fill="#161415" />
                            <ellipse cx="120" cy="95" rx="6.5" ry="8.5" fill="#161415" />
                            <circle cx="82" cy="92" r="2.2" fill="white" />
                            <circle cx="122" cy="92" r="2.2" fill="white" />

                            {/* Nose */}
                            <path d="M 100,100 L 97,114 Q 100,118 103,114 Z" fill="#EFA888" />

                            {/* Mouth */}
                            <path d="M 88,125 Q 100,132 112,125" stroke="white" strokeWidth="3.5" strokeLinecap="round" fill="none" />
                            <path d="M 88,125 Q 100,132 112,125" stroke="#3D2314" strokeWidth="1.2" strokeLinecap="round" fill="none" />

                            {/* Neck (Turtleneck Collar) */}
                            <path
                                d="M 78,140 Q 78,130 100,132 Q 122,130 122,140 L 122,155 Q 100,165 78,155 Z"
                                fill={avatarConfig.topColor}
                                filter="url(#innerGlow)"
                            />

                            {/* === HAT / HAIR FRONT === */}
                            {isMale ? (
                                // BEANIE (Male) - Off-White (Beige)
                                <g filter="url(#clayShadow)">
                                    {/* Beanie Dome */}
                                    <path d="M 52,70 Q 52,20 100,15 Q 148,20 148,70" fill={avatarConfig.hatColor} />
                                    {/* Beanie Rim */}
                                    <path d="M 47,65 Q 47,85 100,80 Q 153,85 153,65 Q 153,50 100,55 Q 47,50 47,65 Z" fill={avatarConfig.hatColor} filter="url(#innerGlow)" />
                                    {/* Leather Tag */}
                                    <rect x="57" y="58" width="6" height="10" fill="#8D6E63" rx="1" transform="rotate(-5 57 58)" />
                                </g>
                            ) : (
                                // CAP & HAIR (Female)
                                <g filter="url(#clayShadow)">
                                    {/* Front Hair - Wide Rectangular Bangs (Qi Liu Hai) */}
                                    <path
                                        d="M 58,60 L 58,87 Q 100,91 142,87 L 142,60"
                                        fill={avatarConfig.hairColor}
                                        opacity="0.95"
                                    />

                                    {/* Cap Dome */}
                                    <path d="M 52,60 Q 52,20 100,15 Q 148,20 148,60" fill={avatarConfig.hatColor} />
                                    {/* Cap Rim/Visor (Backwards style) */}
                                    <path d="M 50,60 Q 50,75 100,70 Q 150,75 150,60" fill={avatarConfig.hatColor} stroke="#333" strokeWidth="1.5" />
                                </g>
                            )}
                        </g>

                        {/* === BODY === */}
                        {/* Torso/Chest */}
                        <g
                            onMouseEnter={() => setHoveredPart('chest')}
                            onMouseLeave={() => setHoveredPart(null)}
                            onClick={() => onPartClick?.('chest')}
                            style={{ cursor: onPartClick ? 'pointer' : 'default' }}
                        >
                            <path
                                d="M 65,155 Q 100,150 135,155 L 140,210 Q 100,215 60,210 Z"
                                fill={avatarConfig.topColor}
                                filter="url(#innerGlow)"
                                opacity={hoveredPart === 'chest' ? 0.8 : 1}
                            />
                            <path
                                d="M 65,155 Q 100,150 135,155 L 140,210 Q 100,215 60,210 Z"
                                fill="url(#clothingGrad)"
                                opacity="0.4"
                            />
                            {/* Ribbed Texture on Body */}
                            {[70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130].map(x => (
                                <path key={x} d={`M ${x},155 L ${x},210`} stroke="black" strokeOpacity="0.05" strokeWidth="0.5" />
                            ))}
                        </g>

                        {/* Abs - Below chest, larger area */}
                        <g
                            onMouseEnter={() => setHoveredPart('abs')}
                            onMouseLeave={() => setHoveredPart(null)}
                            onClick={() => onPartClick?.('abs')}
                            style={{ cursor: onPartClick ? 'pointer' : 'default' }}
                        >
                            {/* Abs area - larger visible section */}
                            <rect
                                x="70"
                                y="180"
                                width="60"
                                height="30"
                                fill={avatarConfig.topColor}
                                filter="url(#innerGlow)"
                                opacity={hoveredPart === 'abs' ? 0.8 : 1}
                            />
                            <path
                                d="M 70,180 L 130,180 L 130,210 L 70,210 Z"
                                fill="url(#clothingGrad)"
                                opacity="0.3"
                            />
                        </g>

                        {/* Arms (Q-Style: Simple Rounded) */}
                        <g
                            onMouseEnter={() => setHoveredPart('leftArm')}
                            onMouseLeave={() => setHoveredPart(null)}
                            onClick={() => onPartClick?.('leftArm')}
                            style={{ cursor: onPartClick ? 'pointer' : 'default' }}
                        >
                            {/* Sleeve */}
                            <ellipse cx="50" cy="170" rx="11" ry="24" fill={avatarConfig.topColor} filter="url(#clayShadow)" opacity={hoveredPart === 'leftArm' ? 0.8 : 1} />
                            {/* Hand */}
                            <circle cx="50" cy="198" r="9" fill="url(#skinGrad)" filter="url(#clayShadow)" />
                        </g>

                        <g
                            onMouseEnter={() => setHoveredPart('rightArm')}
                            onMouseLeave={() => setHoveredPart(null)}
                            onClick={() => onPartClick?.('rightArm')}
                            style={{ cursor: onPartClick ? 'pointer' : 'default' }}
                        >
                            {/* Sleeve */}
                            <ellipse cx="150" cy="170" rx="11" ry="24" fill={avatarConfig.topColor} filter="url(#clayShadow)" opacity={hoveredPart === 'rightArm' ? 0.8 : 1} />
                            {/* Hand */}
                            <circle cx="150" cy="198" r="9" fill="url(#skinGrad)" filter="url(#clayShadow)" />
                        </g>

                        {/* Legs (Q-Style) - Narrower Stance */}
                        <path d="M 70,205 L 130,205 L 125,230 L 75,230 Z" fill={avatarConfig.bottomColor} filter="url(#innerGlow)" />

                        <g
                            onMouseEnter={() => setHoveredPart('leftLeg')}
                            onMouseLeave={() => setHoveredPart(null)}
                            onClick={() => onPartClick?.('leftLeg')}
                            style={{ cursor: onPartClick ? 'pointer' : 'default' }}
                        >
                            <ellipse cx="85" cy="245" rx="10" ry="18" fill="url(#skinGrad)" filter="url(#clayShadow)" opacity={hoveredPart === 'leftLeg' ? 0.8 : 1} />
                            <ellipse cx="82" cy="265" rx="11" ry="7" fill="#1F2937" filter="url(#clayShadow)" />
                        </g>

                        <g
                            onMouseEnter={() => setHoveredPart('rightLeg')}
                            onMouseLeave={() => setHoveredPart(null)}
                            onClick={() => onPartClick?.('rightLeg')}
                            style={{ cursor: onPartClick ? 'pointer' : 'default' }}
                        >
                            <ellipse cx="115" cy="245" rx="10" ry="18" fill="url(#skinGrad)" filter="url(#clayShadow)" opacity={hoveredPart === 'rightLeg' ? 0.8 : 1} />
                            <ellipse cx="118" cy="265" rx="11" ry="7" fill="#1F2937" filter="url(#clayShadow)" />
                        </g>
                    </motion.g>
                </svg>

                {/* State Indicator */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center mt-2 relative z-10"
                >
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${avatarState === 'overtraining' ? 'text-[#D6C6B9] border-[#D6C6B9]/30' :
                            avatarState === 'training' ? 'text-[#C68E5D] border-[#C68E5D]/30' :
                                avatarState === 'recovery' ? 'text-[#8F9E8B] border-[#8F9E8B]/30' :
                                    'text-[#7B8D93] border-[#7B8D93]/30'
                        }`} style={{ backgroundColor: avatarState === 'overtraining' ? 'rgba(214, 198, 185, 0.1)' : avatarState === 'training' ? 'rgba(198, 142, 93, 0.1)' : avatarState === 'recovery' ? 'rgba(143, 158, 139, 0.1)' : 'rgba(123, 141, 147, 0.1)' }}>
                        {avatarState === 'overtraining' ? '需要休息' :
                            avatarState === 'training' ? '準備訓練' :
                                avatarState === 'recovery' ? '狀態極佳' : '休息中'}
                    </span>
                </motion.div>

                {/* Hover Tooltip */}
                <AnimatePresence>
                    {hoveredPart && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="text-center mt-2 relative z-10"
                        >
                            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border`} style={{ backgroundColor: '#33302C', borderColor: 'rgba(224, 216, 211, 0.2)' }}>
                                <div
                                    className="w-2.5 h-2.5 rounded-full"
                                    style={{ backgroundColor: getRecoveryColor(hoveredPart) }}
                                />
                                <span className="text-xs font-bold text-white">
                                    {getPartName(hoveredPart)}
                                </span>
                                <span className="text-[11px] text-zinc-400">
                                    {getRecoveryText(hoveredPart)}
                                </span>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Customizer */}
            <AnimatePresence>
                {customizerOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="absolute top-16 right-0 z-10 bg-zinc-800 rounded-xl border border-zinc-700 p-4 shadow-xl w-64"
                    >
                        <h4 className="text-white font-medium mb-3">設定</h4>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-zinc-400 block mb-2">角色風格</label>
                                <div className="flex gap-2">
                                    <motion.button {...pressProps('cta')}
 onClick={() => setAvatarConfig(c => ({
 ...c,
 hairStyle: 'short',
 topColor: '#D2B48C',
 hairColor: '#2C1810',
 hatColor: '#F5F5DC'
 }))}
 className={`flex-1 py-1 rounded text-xs ${isMale ? 'bg-blue-600' : 'bg-zinc-700'}`}
 >
                                        男生
                                    </motion.button>
                                    <motion.button {...pressProps('cta')}
 onClick={() => setAvatarConfig(c => ({
 ...c,
 hairStyle: 'long',
 topColor: '#DC2626',
 hairColor: '#A0826D',
 hatColor: '#161415'
 }))}
 className={`flex-1 py-1 rounded text-xs ${!isMale ? 'bg-pink-600' : 'bg-zinc-700'}`}
 >
                                        女生
                                    </motion.button>
                                </div>
                            </div>

                            {/* Top Color */}
                            <div>
                                <label className="text-xs text-zinc-400 block mb-2">上衣顏色</label>
                                <div className="flex gap-2 flex-wrap">
                                    {['#D2B48C', '#DC2626', '#3B82F6', '#1F2937', '#FFFFFF'].map(c => (
                                        <button
                                            key={c}
                                            onClick={() => setAvatarConfig(prev => ({ ...prev, topColor: c }))}
                                            className="w-6 h-6 rounded-full border border-zinc-500"
                                            style={{ backgroundColor: c }}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Bottom Color */}
                            <div>
                                <label className="text-xs text-zinc-400 block mb-2">褲子顏色</label>
                                <div className="flex gap-2 flex-wrap">
                                    {['#1F2937', '#6366F1', '#14532D', '#9CA3AF', '#374151'].map(c => (
                                        <button
                                            key={c}
                                            onClick={() => setAvatarConfig(prev => ({ ...prev, bottomColor: c }))}
                                            className="w-6 h-6 rounded-full border border-zinc-500"
                                            style={{ backgroundColor: c }}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default FitnessAvatar;
