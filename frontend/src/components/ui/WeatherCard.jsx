/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * WeatherCard  —  SWR-powered, Graceful State Transition
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * UX Contract:
 *   1. Card shell renders IMMEDIATELY (no blank space ever).
 *   2. If SWR cache has data → weather shows instantly on revisit.
 *   3. If no cache → card shell stays visible, shimmer lines inside.
 *   4. Data floats in via opacity + y crossfade (Swiss Motion DNA).
 *   5. Background revalidation every 10 min → hairline gold shimmer.
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CloudRain, Sun, Cloud, Droplets, Wind, Moon } from 'lucide-react';
import { useWeather } from '../../hooks/useDRVNData';
import { ease } from '../../utils/swissMotion.jsx'; // 🔵 Fix: 統一使用 .jsx 作為單一入口

// ── Data crossfade variants ────────────────────────────────────────────
const DATA_INITIAL = { opacity: 0, y: 4, filter: 'blur(2px)' };
const DATA_ENTER   = { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.26, ease: ease.decel } };
const DATA_EXIT    = { opacity: 0, y: 4, filter: 'blur(2px)', transition: { duration: 0.18, ease: ease.out  } };

// ── Shimmer placeholder for first-load (no cache yet) ─────────────────
const WeatherShimmer = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{
            width: 48, height: 26, borderRadius: 6,
            background: 'linear-gradient(90deg, rgba(22,20,21,0.05) 0%, rgba(22,20,21,0.12) 50%, rgba(22,20,21,0.05) 100%)',
            backgroundSize: '200% 100%',
            animation: 'swrShimmer 1.6s ease-in-out infinite',
        }} />
        <div style={{ width: 1, height: 18, background: 'rgba(22,20,21,0.1)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{
                width: 36, height: 7, borderRadius: 4,
                background: 'linear-gradient(90deg, rgba(249,92,75,0.08) 0%, rgba(249,92,75,0.18) 50%, rgba(249,92,75,0.08) 100%)',
                backgroundSize: '200% 100%',
                animation: 'swrShimmer 1.6s ease-in-out 0.1s infinite',
            }} />
            <div style={{
                width: 74, height: 7, borderRadius: 4,
                background: 'linear-gradient(90deg, rgba(22,20,21,0.04) 0%, rgba(22,20,21,0.09) 50%, rgba(22,20,21,0.04) 100%)',
                backgroundSize: '200% 100%',
                animation: 'swrShimmer 1.6s ease-in-out 0.2s infinite',
            }} />
        </div>
        <style>{`@keyframes swrShimmer{0%{background-position:200% center}100%{background-position:-200% center}}`}</style>
    </div>
);

// ── Advisory label ────────────────────────────────────────────────────
const getShortAdvice = (rec) => {
    const map = {
        indoor:           '建議室內運動',
        indoor_cycling:   '適合室內健身',
        outdoor_caution:  '室外請注意安全',
        outdoor:          '完美戶外天氣',
    };
    return map[rec] ?? '保持活力';
};

// ── Revalidation hairline ─────────────────────────────────────────────
const RevalidationHairline = ({ isValidating }) => (
    <AnimatePresence>
        {isValidating && (
            <motion.div
                aria-hidden="true"
                initial={{ opacity: 0, scaleX: 0 }}
                animate={{ opacity: 1, scaleX: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
                style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 1,
                    transformOrigin: 'left center',
                    background: 'linear-gradient(90deg, transparent, rgba(212,175,106,0.75), transparent)',
                    pointerEvents: 'none',
                    zIndex: 10,
                }}
            />
        )}
    </AnimatePresence>
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WeatherCard
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const WeatherCard = ({ className = '', variant = 'default' }) => {
    const { data: weather, isValidating } = useWeather();

    const hours     = new Date().getHours();
    const isDay     = hours >= 6 && hours < 18;
    const rain      = weather?.rain ?? 0;
    const condition = rain > 0 ? 'rainy' : 'sunny';

    const themes = {
        day: {
            sunny: { bg: 'rgba(228,222,210,0.75)', border: 'rgba(207,198,184,0.4)', iconColor: '#F95C4B', Icon: Sun,       textColor: '#161415', subTextColor: 'rgba(22,20,21,0.5)' },
            rainy: { bg: 'rgba(184,200,216,0.75)', border: 'rgba(184,200,216,0.4)', iconColor: '#4A90E2', Icon: CloudRain,  textColor: '#161415', subTextColor: 'rgba(22,20,21,0.5)' },
        },
        night: {
            sunny: { bg: 'rgba(28,28,30,0.7)',     border: 'rgba(255,255,255,0.1)', iconColor: '#FBD58E', Icon: Moon,       textColor: '#FFFFFF', subTextColor: 'rgba(255,255,255,0.45)' },
            rainy: { bg: 'rgba(28,28,30,0.7)',     border: 'rgba(74,144,226,0.3)',  iconColor: '#4A90E2', Icon: CloudRain,  textColor: '#FFFFFF', subTextColor: 'rgba(255,255,255,0.45)' },
        },
    };

    const t        = themes[isDay ? 'day' : 'night'][condition];
    const MainIcon = t.Icon;

    // ── EDITORIAL VARIANT ────────────────────────────────────────────
    if (variant === 'editorial') {
        return (
            <motion.div
                whileTap={{ scale: 0.98 }}
                className={`flex items-center justify-between px-5 py-3.5 rounded-[18px] cursor-pointer relative overflow-hidden ${className}`}
                style={{
                    /* 🇨🇭 Swiss 極簡：純米白平面 + 細硬邊，無陰影，與其他輪播卡一致 */
                    background: '#F6F4F1',
                    border: '1px solid rgba(22,20,21,0.10)',
                    boxShadow: 'none',
                    minHeight: 52,
                }}
            >
                <RevalidationHairline isValidating={isValidating} />

                <div className="flex items-center gap-4">
                    <AnimatePresence mode="wait" initial={false}>
                        {weather ? (
                            <motion.div
                                key={`e-${Math.round(weather.temperature)}`}
                                initial={DATA_INITIAL} animate={DATA_ENTER} exit={DATA_EXIT}
                                className="flex items-center gap-4"
                                style={{ willChange: 'opacity, transform' }}
                            >
                                <span className="text-[28px] leading-none font-black text-[#161415] tracking-tighter"
                                    style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                                    {Math.round(weather.temperature)}°
                                </span>
                                <div className="w-px h-6 bg-[#161415]/15" />
                                <div className="flex flex-col justify-center">
                                    <span className="text-[9px] font-black text-[#F95C4B] uppercase tracking-[0.2em] leading-none mb-1.5">
                                        Taipei
                                    </span>
                                    <span className="text-[11px] font-bold text-[#161415]/50 leading-none">
                                        {getShortAdvice(weather.advice?.recommendation)}
                                    </span>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div key="shimmer-e" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                <WeatherShimmer />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <AnimatePresence mode="wait" initial={false}>
                    {weather && (
                        <motion.div
                            key="e-meta"
                            initial={DATA_INITIAL} animate={DATA_ENTER} exit={DATA_EXIT}
                            className="flex flex-col items-end justify-center gap-1 border-l border-[#161415]/10 pl-4"
                            style={{ willChange: 'opacity, transform' }}
                        >
                            <div className="flex items-center gap-1.5">
                                <Droplets size={10} className="text-[#161415]/30" strokeWidth={3} />
                                <span className="text-[11px] font-black text-[#161415]/60 tracking-wider">{weather.humidity}%</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Wind size={10} className="text-[#161415]/30" strokeWidth={3} />
                                <span className="text-[11px] font-black text-[#161415]/60 tracking-wider">
                                    {weather.wind_speed} <span className="text-[11px] font-bold opacity-70">KM/H</span>
                                </span>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        );
    }

    // ── DEFAULT VARIANT ──────────────────────────────────────────────
    return (
        <motion.div
            className={`rounded-[24px] px-5 py-3 flex items-center justify-between shadow-xl relative overflow-hidden ${className}`}
            style={{
                background:           t.bg,
                border:               `1.5px solid ${t.border}`,
                backdropFilter:       'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                minHeight:            62,
            }}
        >
            <RevalidationHairline isValidating={isValidating} />

            {/* Left: Icon shell (always visible) + data crossfade */}
            <div className="flex items-center gap-4">
                <div
                    className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: isDay ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.06)' }}
                >
                    <MainIcon size={22} strokeWidth={2.5} style={{ color: t.iconColor }} />
                </div>

                <AnimatePresence mode="wait" initial={false}>
                    {weather ? (
                        <motion.div
                            key={`d-${Math.round(weather.temperature)}`}
                            initial={DATA_INITIAL} animate={DATA_ENTER} exit={DATA_EXIT}
                            style={{ willChange: 'opacity, transform' }}
                        >
                            <p className="text-[28px] font-black leading-none tracking-tighter"
                                style={{ color: t.textColor }}>
                                {Math.round(weather.temperature)}°
                            </p>
                            <p className="text-[9px] font-black uppercase tracking-widest mt-1"
                                style={{ color: t.subTextColor }}>
                                {getShortAdvice(weather.advice?.recommendation)}
                            </p>
                        </motion.div>
                    ) : (
                        <motion.div key="shimmer-d" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <WeatherShimmer />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Right: Humidity + Wind */}
            <AnimatePresence mode="wait" initial={false}>
                {weather && (
                    <motion.div
                        key="d-meta"
                        initial={DATA_INITIAL} animate={DATA_ENTER} exit={DATA_EXIT}
                        className="flex items-center gap-4"
                        style={{ color: t.subTextColor, willChange: 'opacity, transform' }}
                    >
                        <div className="flex flex-col items-end">
                            <div className="flex items-center gap-1.5 mb-0.5">
                                <Droplets size={12} strokeWidth={2.5} />
                                <span className="text-[12px] font-black">{weather.humidity}%</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Wind size={12} strokeWidth={2.5} />
                                <span className="text-[9px] font-bold uppercase">{weather.wind_speed} km/h</span>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default WeatherCard;
