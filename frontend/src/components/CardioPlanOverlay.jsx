import React from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion } from 'framer-motion';
import { X, Sun, Wind, Flame, Zap, RefreshCcw, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import HealthStatusBadges from './HealthStatusBadges';

// High #7 — 5 個 intent 對應 5 個 zone，建立強度光譜的視覺直覺
//   zoneId 1-5 = WARM UP / FAT BURN / AEROBIC / ANAEROBIC / EXTREME
const intents = [
    { id: '#Awake',       label: '#Awake',       desc: 'Wake up the body',     Icon: Sun,       zoneId: 1, zoneLabel: 'Z1 · WARM UP',    zoneColor: '#A5C4FF' },
    { id: '#Mindfulness', label: '#Mindfulness', desc: 'Mental clarity',       Icon: Wind,      zoneId: 2, zoneLabel: 'Z2 · EASY',       zoneColor: '#7BD3A5' },
    { id: '#FatBurn',     label: '#FatBurn',     desc: 'Metabolic efficiency', Icon: Flame,     zoneId: 3, zoneLabel: 'Z3 · AEROBIC',    zoneColor: '#D8F382' },
    { id: '#Performance', label: '#Performance', desc: 'Push limits',          Icon: Zap,       zoneId: 4, zoneLabel: 'Z4 · TEMPO',      zoneColor: '#FF99DC' },
    { id: '#Routine',     label: '#Routine',     desc: 'Consistency',          Icon: RefreshCcw,zoneId: 5, zoneLabel: 'Z5 · CONSISTENCY',zoneColor: '#F95C4B' },
];

const CardioPlanOverlay = ({ 
    onClose, 
    onSelectIntent,
    isHealthKitAvailable,
    healthKitIsActive,
    forceSimulation,
    toggleForceSimulation,
    hasHeartRateData
}) => {
    const navigate = useNavigate();

    const handleSelect = (intentId) => {
        if (onSelectIntent) onSelectIntent(intentId);
        // Navigate to Running Trends (Evolution Analytics) when an intent is selected
        navigate('/running-trend-mobile', { state: { intent: intentId } });
    };
    return (
        <div className="fixed inset-0 z-[1000001] bg-[#09090B] flex flex-col relative overflow-hidden font-sans">
            {/* Background Layer - Motion Blur & Warmth */}
            <div className="absolute inset-0 z-0">
                {/* Image: Motion Blur Running Track */}
                <div
                    className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-110"
                    style={{
                        backgroundImage: "url('https://images.unsplash.com/photo-1565514020176-db8b7baab2a4?q=80&w=1920&auto=format&fit=crop')",
                        filter: "blur(2px)"
                    }}
                />

                {/* Overlay: Warm Gradient (Red/Orange/Brown) */}
                <div className="absolute inset-0 bg-gradient-to-b from-orange-700/40 via-red-900/60 to-black/90 mix-blend-multiply" />
                <div className="absolute inset-0 bg-black/20" /> {/* Dimmer */}
            </div>

            {/* Header */}
            <div className="relative z-10 p-8 pt-12 flex justify-between items-start">
                <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold tracking-[0.25em] text-black/60 uppercase mix-blend-overlay drop-shadow-sm">
                        06:00 AM / THE SPIRIT
                    </span>
                    <h2 className="text-4xl text-white font-serif italic tracking-tight drop-shadow-lg">
                        Set Your Intent.
                    </h2>
                </div>
                <div className="flex items-center gap-4">
                    <HealthStatusBadges 
                        isHealthKitAvailable={isHealthKitAvailable}
                        healthKitIsActive={healthKitIsActive}
                        forceSimulation={forceSimulation}
                        toggleForceSimulation={toggleForceSimulation}
                        hasHeartRateData={hasHeartRateData}
                    />
                    <motion.button {...pressProps('pill')} aria-label="關閉"
 onClick={onClose}
 className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/80"
 >
                        <X size={20} />
                    </motion.button>
                </div>
            </div>

            {/* Intent Buttons — High #7: 加入 zone 色條 + icon + desc，建立強度光譜的視覺直覺 */}
            <div className="relative z-10 flex-1 flex flex-col justify-center px-6 gap-3.5 pb-20">
                {intents.map((intent, idx) => {
                    const Icon = intent.Icon;
                    return (
                        <motion.button
                            key={intent.id}
                            initial={{ opacity: 0, x: -16 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: Math.min(idx, 6) * 0.07, type: 'spring', stiffness: 280, damping: 26 }}
                            onClick={() => handleSelect(intent.id)}
                            className="group w-full rounded-[28px] backdrop-blur-[20px] border border-white/20 flex items-center pl-0 pr-5 relative overflow-hidden shadow-lg active:scale-[0.98] transition-transform"
                            style={{
                                background: 'linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 100%)',
                                minHeight: 76,
                            }}
                        >
                            {/* 左側 zone 色條 — 強度光譜的核心視覺信號 */}
                            <div
                                className="self-stretch w-1.5 flex-shrink-0"
                                style={{
                                    background: `linear-gradient(180deg, ${intent.zoneColor} 0%, ${intent.zoneColor}90 100%)`,
                                    boxShadow: `0 0 20px ${intent.zoneColor}66`,
                                }}
                            />

                            {/* Icon 圓圈 */}
                            <div
                                className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ml-5"
                                style={{
                                    background: `${intent.zoneColor}22`,
                                    border: `1px solid ${intent.zoneColor}55`,
                                    boxShadow: `inset 0 1px 1px rgba(255,255,255,0.20), 0 0 12px ${intent.zoneColor}33`,
                                }}
                            >
                                <Icon size={18} strokeWidth={2} style={{ color: intent.zoneColor }} />
                            </div>

                            {/* 中間文字區 */}
                            <div className="flex-1 ml-4 text-left">
                                <div className="text-[9px] font-black tracking-[0.22em] uppercase mb-0.5" style={{ color: intent.zoneColor }}>
                                    {intent.zoneLabel}
                                </div>
                                <div className="text-[17px] font-medium text-white/95 tracking-tight drop-shadow-md leading-none">
                                    {intent.label}
                                </div>
                                <div className="text-[11px] text-white/55 mt-1 tracking-wide">
                                    {intent.desc}
                                </div>
                            </div>

                            {/* 右側 chevron */}
                            <ChevronRight size={16} strokeWidth={2.2} className="text-white/40 group-hover:text-white/70 transition-colors flex-shrink-0" />

                            {/* hover 光暈 */}
                            <div
                                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                                style={{ background: `radial-gradient(circle at left, ${intent.zoneColor}18 0%, transparent 60%)` }}
                            />
                        </motion.button>
                    );
                })}
            </div>

            {/* Footer Text */}
            <div className="absolute bottom-24 left-0 right-0 z-10 text-center">
                <p className="text-white/20 text-[9px] font-bold tracking-[0.2em] uppercase">
                    Select to configure your dashboard
                </p>
            </div>
        </div>
    );
};

export default CardioPlanOverlay;

