import { Activity, Zap, TrendingUp, Heart, Mountain, Clock, Flame, Play, Pause, Square, Map as MapIcon, ChevronRight } from 'lucide-react';
import { pressProps } from '../utils/nutritionMotion';
import { motion } from 'framer-motion';
import { formatPace as fmtPace, formatDuration as fmtDuration } from '../utils/format';


const formatDuration = fmtDuration;   // 🩹 J: 單一真相源（>1h 自動 H:MM:SS）

const formatPace = fmtPace;   // 🩹 J: 單一真相源 → utils/format.js

const MetricCard = ({ icon: Icon, label, value, unit, valueStyle = {}, zoneColor = '#FFFFFF', background = '#262523' }) => {
    return (
        <div
            className="rounded-[28px] p-5 flex flex-col justify-between h-32 relative overflow-hidden transition-colors duration-500"
            style={{
                backgroundColor: background + 'CC', // 80% opacity
                backdropFilter: 'blur(20px) saturate(160%)',
                WebkitBackdropFilter: 'blur(20px) saturate(160%)',
                border: `1px solid rgba(255,255,255,0.3)`
            }}
        >
            <div className="flex justify-between items-start z-10">
                <span className="text-[9px] uppercase tracking-widest font-bold transition-colors duration-500" style={{ color: '#26252380' }}>
                    {label}
                </span>
                <div className="w-6 h-6 rounded-full flex items-center justify-center transition-colors duration-500" style={{ backgroundColor: `${zoneColor}10` }}>
                    <Icon size={12} style={{ color: zoneColor }} />
                </div>
            </div>

            <div className="z-10 mt-auto">
                <div className="flex items-baseline gap-1">
                    <span
                        className="text-3xl leading-none tracking-tight transition-colors duration-500"
                        style={{
                            color: zoneColor, // Will be overridden by valueStyle
                            ...valueStyle
                        }}
                    >
                        {value}
                    </span>
                    {unit && (
                        <span className="text-[11px] font-bold transition-colors duration-500" style={{ color: '#26252380' }}>
                            {unit}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

const LiveMetricsDashboard = ({
    metrics = {
        distance: 0,
        duration: 0,
        currentPace: 0,
        avgPace: 0,
        elevationGain: 0,
        calories: 0,
        heartRate: null
    },
    zoneColor = '#FFFFFF', // New prop for dynamic color
    cardBackground = '#262523', // 🔥 New prop for background color
    isTracking = false,
    isPaused = false,
    onToggle,
    onFinish
}) => {
    const { distance, duration, currentPace, avgPace, elevationGain, calories, heartRate } = metrics;

    return (
        <div className="w-full space-y-1">
            {/* Metrics Grid - Consolidated into ONE Card */}
            <div
                className="rounded-[28px] p-6 shadow-sm transition-colors duration-500 relative overflow-hidden"
                style={{
                    background: 'rgba(247, 244, 233, 0.35)',
                    backdropFilter: 'blur(24px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                    border: '1px solid rgba(255,255,255,0.4)',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
                }}
            >
                {/* Duration (Top, Big) */}
                <div className="flex flex-col items-center mb-4">
                    <span className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#26252380' }}>時長</span>
                    <div className="flex items-center gap-3">
                        <Clock size={20} className="text-[#262523]/40" />
                        <span className="text-7xl leading-none tracking-tighter" style={{ fontFamily: '"Atomic Age", system-ui', color: '#262523' }}>
                            {formatDuration(duration)}
                        </span>
                    </div>
                </div>

                {/* Divider */}
                <div className="w-full h-px bg-[#262523]/10 mb-4" />

                {/* Bottom Row: Pace & Distance */}
                <div className="grid grid-cols-2 gap-4">
                    {/* Pace */}
                    <div className="flex flex-col items-center">
                        <div className="flex items-center gap-2 mb-1">
                            <Zap size={14} className="text-[#262523]/60" />
                            <span className="text-[12px] font-bold tracking-widest" style={{ color: '#26252360' }}>配速</span>
                        </div>
                        <span className="text-3xl leading-none tracking-tight" style={{ fontFamily: '"Atomic Age", system-ui', color: '#262523' }}>
                            {formatPace(currentPace)}
                        </span>
                        <span className="text-[11px] font-bold mt-1" style={{ color: '#26252360' }}>/KM</span>
                    </div>

                    {/* Distance */}
                    <div className="flex flex-col items-center border-l border-[#262523]/10">
                        <div className="flex items-center gap-2 mb-1">
                            <MapIcon size={14} className="text-[#262523]/60" />
                            <span className="text-[12px] font-bold tracking-widest" style={{ color: '#26252360' }}>距離</span>
                        </div>
                        <span className="text-3xl leading-none tracking-tight" style={{ fontFamily: '"Atomic Age", system-ui', color: '#262523' }}>
                            {/* Using safeFixed helper might not be available here, fallback to toFixed */}
                            {metrics.distance ? Number(metrics.distance).toFixed(2) : "0.00"}
                        </span>
                        <span className="text-[11px] font-bold mt-1" style={{ color: '#26252360' }}>KM</span>
                    </div>
                </div>
            </div>

            {/* 🔥 "Other Two" Cards: Calories & Elevation (Restored) */}
            <div className="grid grid-cols-2 gap-3">
                {/* Calories - Orange */}
                <MetricCard
                    icon={Flame}
                    label="Calories"
                    value={Math.round(calories || 0)}
                    unit="kcal"
                    valueStyle={{ fontFamily: '"Atomic Age", system-ui', color: '#262523' }}
                    zoneColor="#262523"
                    background="#EE7F2B" // Deep Orange to match user image
                />

                {/* Elevation - Yellow */}
                <MetricCard
                    icon={Mountain}
                    label="Elevation"
                    value={Math.round(elevationGain || 0)}
                    unit="m"
                    valueStyle={{ fontFamily: '"Atomic Age", system-ui', color: '#262523' }}
                    zoneColor="#262523"
                    background="#FCE076" // Yellow to match user image
                />
            </div>

            {/* Heart Rate Strip */}
            {
                heartRate > 0 && (
                    <div
                        className="flex items-center gap-4 px-4 py-3 rounded-[24px] border transition-colors duration-500"
                        style={{ backgroundColor: cardBackground, border: `1px solid ${zoneColor}30` }}
                    >
                        <Heart size={18} className="text-red-500 animate-pulse fill-red-500" />
                        <div className="h-1.5 flex-1 bg-black/10 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-red-500 transition-all duration-500 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                                style={{ width: `${Math.min((heartRate / 200) * 100, 100)}%` }}
                            />
                        </div>
                        <span className="text-sm font-bold font-mono" style={{ color: '#262523' }}>{heartRate} BPM</span>
                    </div>
                )
            }

            {/* Controls (Only if handlers are provided) */}
            {(onToggle || onFinish) && (
                <div className="pt-6">
                    {onToggle && !isTracking ? (
                        <motion.button {...pressProps('pill')}
 onClick={onToggle}
 className="w-full flex items-center justify-between px-6 py-4 bg-[#262523] border border-white/10 rounded-[18px] shadow-xl group"
 >
                            <div className="flex items-center gap-4">
                                <motion.div
                                    animate={{ scale: [1, 1.4, 1] }}
                                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                                    className="w-2.5 h-2.5 rounded-full bg-[#F95C4B]"
                                />
                                <span className="text-sm font-black tracking-[0.15em] text-white uppercase">
                                    Begin Run
                                </span>
                            </div>
                            <ChevronRight size={14} className="text-white/30 group-active:translate-x-1 transition-transform" />
                        </motion.button>
                    ) : (
                        <div className="flex items-center justify-center gap-6">
                            {onToggle && (
                                <motion.button {...pressProps('icon')}
 onClick={onToggle}
 className={`w-20 h-20 rounded-full flex items-center justify-center shadow-2xl ${isPaused ? 'bg-white text-black' : 'bg-[#262523] text-white border border-white/10'}`}
 >
                                    {isPaused ? <Play size={32} fill="currentColor" /> : <Pause size={32} fill="currentColor" />}
                                </motion.button>
                            )}

                            {isTracking && onFinish && (
                                <motion.button {...pressProps('icon')} aria-label="停止"
 onClick={onFinish}
 className="w-20 h-20 rounded-full flex items-center justify-center bg-[#F95C4B] text-white shadow-2xl"
 >
                                    <Square size={32} fill="currentColor" />
                                </motion.button>
                            )}
                        </div>
                    )}
                </div>
            )}

        </div >
    );
};

export default LiveMetricsDashboard;
