import React, { useState, useEffect } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion } from 'framer-motion';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { TrendingUp, Zap, Info } from 'lucide-react';

// Metric configurations with stunning visuals
const METRIC_CONFIG = {
    structural: {
        name: "結構支撐",
        nameEn: "Structural",
        icon: "💪",
        color: "#3B82F6",  // blue
        gradient: "from-blue-500 to-cyan-500"
    },
    metabolic: {
        name: "代謝引擎",
        nameEn: "Metabolic",
        icon: "🔥",
        color: "#F97316",  // orange
        gradient: "from-orange-500 to-red-500"
    },
    alignment: {
        name: "姿態校正",
        nameEn: "Alignment",
        icon: "🎯",
        color: "#5A7A3A",  // green
        gradient: "from-green-500 to-teal-500"
    },
    vitality: {
        name: "身心韌性",
        nameEn: "Vitality",
        icon: "⚡",
        color: "#A855F7",  // purple
        gradient: "from-purple-500 to-pink-500"
    }
};

const DynamicRadarChart = ({ idealShape, currentScores, selectedTags = [], onMetricClick }) => {
    const [animatedScores, setAnimatedScores] = useState(currentScores);
    const [hoveredMetric, setHoveredMetric] = useState(null);
    const [showLabels, setShowLabels] = useState(true);

    useEffect(() => {
        // Animate from current to new scores
        if (currentScores) {
            setAnimatedScores(currentScores);
        }
    }, [currentScores]);

    // Prepare data for recharts
    const chartData = Object.keys(METRIC_CONFIG).map((key) => ({
        subject: METRIC_CONFIG[key].name,
        subjectEn: METRIC_CONFIG[key].nameEn,
        ideal: idealShape?.[key] || 50,
        current: animatedScores?.[key] || 0,
        fullMark: 100,
        color: METRIC_CONFIG[key].color
    }));

    // Calculate gap percentage
    const calculateGap = () => {
        if (!idealShape || !currentScores) return 0;
        const total = Object.keys(METRIC_CONFIG).reduce((sum, key) => {
            return sum + (currentScores[key] || 0);
        }, 0);
        const idealTotal = Object.keys(METRIC_CONFIG).reduce((sum, key) => {
            return sum + (idealShape[key] || 50);
        }, 0);
        return Math.round((total / idealTotal) * 100);
    };

    const gapPercentage = calculateGap();

    // Custom tooltip
    const CustomTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            const metricKey = Object.keys(METRIC_CONFIG).find(
                k => METRIC_CONFIG[k].name === data.subject
            );
            const config = METRIC_CONFIG[metricKey];

            return (
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-[#1A1D1F] border border-white/20 rounded-xl p-4 shadow-2xl backdrop-blur-sm"
                >
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">{config.icon}</span>
                        <div>
                            <div className="font-bold text-white">{data.subject}</div>
                            <div className="text-xs text-glass-muted">{data.subjectEn}</div>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <div className="flex justify-between gap-4">
                            <span className="text-sm text-glass-muted">當前分數:</span>
                            <span className="text-sm font-bold" style={{ color: config.color }}>
                                {data.current}
                            </span>
                        </div>
                        <div className="flex justify-between gap-4">
                            <span className="text-sm text-glass-muted">目標分數:</span>
                            <span className="text-sm font-bold text-glass-beige">{data.ideal}</span>
                        </div>
                        <div className="flex justify-between gap-4 pt-2 border-t border-white/10">
                            <span className="text-sm text-glass-muted">差距:</span>
                            <span className="text-sm font-bold text-orange-400">
                                {data.ideal - data.current > 0 ? '+' : ''}{data.ideal - data.current}
                            </span>
                        </div>
                    </div>
                </motion.div>
            );
        }
        return null;
    };

    return (
        <div className="glass-card p-6 relative overflow-hidden">
            {/* Background Glow Effects */}
            <div className="absolute top-0 left-0 w-64 h-64 bg-blue-500 opacity-5 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 right-0 w-64 h-64 bg-purple-500 opacity-5 rounded-full blur-3xl"></div>

            {/* Header */}
            <div className="flex items-center justify-between mb-6 relative z-10">
                <div>
                    <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                        <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-500 bg-opacity-20 rounded-xl">
                            <Zap className="text-glass-blue" size={24} />
                        </div>
                        你的健身雷達
                    </h3>
                    <p className="text-sm text-glass-muted mt-1">
                        達成率：
                        <span className={`ml-2 font-bold text-lg ${gapPercentage >= 80 ? 'text-green-400' :
                            gapPercentage >= 60 ? 'text-yellow-400' : 'text-orange-400'
                            }`}>
                            {gapPercentage}%
                        </span>
                    </p>
                </div>

                {/* Legend Toggle */}
                <motion.button {...pressProps('row')}
 onClick={() => setShowLabels(!showLabels)}
 className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-glass-muted hover:text-white border border-white/5"
 >
                    <Info size={16} className="inline mr-1" />
                    {showLabels ? '隱藏' : '顯示'}標籤
                </motion.button>
            </div>

            {/* Selected Tags Display */}
            {selectedTags && selectedTags.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2 relative z-10">
                    {selectedTags.map((tag) => (
                        <span key={tag} className="px-3 py-1 bg-glass-beige/10 border border-glass-beige/30 rounded-full text-xs text-glass-beige">
                            #{tag}
                        </span>
                    ))}
                </div>
            )}

            {/* Radar Chart */}
            <div className="relative z-10" style={{ width: '100%', height: 400 }}>
                <ResponsiveContainer>
                    <RadarChart data={chartData}>
                        <PolarGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <PolarAngleAxis
                            dataKey="subject"
                            tick={{ fill: '#fff', fontSize: 14, fontWeight: 'bold' }}
                        />
                        <PolarRadiusAxis
                            angle={90}
                            domain={[0, 100]}
                            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                        />

                        {/* Ideal shape (shadow/target) */}
                        <Radar
                            name="目標"
                            dataKey="ideal"
                            stroke="rgba(255, 215, 0, 0.6)"
                            fill="rgba(255, 215, 0, 0.1)"
                            fillOpacity={0.3}
                            strokeWidth={2}
                            strokeDasharray="5 5"
                        />

                        {/* Current scores (colored fill) */}
                        <Radar
                            name="當前"
                            dataKey="current"
                            stroke="#3B82F6"
                            fill="url(#radarGradient)"
                            fillOpacity={0.6}
                            strokeWidth={3}
                            dot={{ r: 6, fill: '#3B82F6', strokeWidth: 2, stroke: '#fff' }}
                        />

                        <Tooltip content={<CustomTooltip />} />

                        {/* Gradient definition */}
                        <defs>
                            <radialGradient id="radarGradient" cx="50%" cy="50%">
                                <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.8} />
                                <stop offset="100%" stopColor="#A855F7" stopOpacity={0.3} />
                            </radialGradient>
                        </defs>
                    </RadarChart>
                </ResponsiveContainer>
            </div>

            {/* Metric Details Grid */}
            {showLabels && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 relative z-10"
                >
                    {Object.entries(METRIC_CONFIG).map(([key, config]) => {
                        const current = currentScores?.[key] || 0;
                        const ideal = idealShape?.[key] || 50;
                        const gap = ideal - current;

                        return (
                            <div
                                key={key}
                                onClick={() => onMetricClick && onMetricClick(key)}
                                className="bg-black/20 border border-white/10 rounded-xl p-4 hover:border-white/20 transition-all cursor-pointer hover:scale-105"
                                onMouseEnter={() => setHoveredMetric(key)}
                                onMouseLeave={() => setHoveredMetric(null)}
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-2xl">{config.icon}</span>
                                    <div>
                                        <div className="text-white font-bold text-sm">{config.name}</div>
                                        <div className="text-[11px] text-glass-muted">{config.nameEn}</div>
                                    </div>
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl font-bold" style={{ color: config.color }}>
                                        {current}
                                    </span>
                                    <span className="text-xs text-glass-muted">/ {ideal}</span>
                                </div>
                                {gap > 0 && (
                                    <div className="mt-2 text-xs text-orange-400 flex items-center gap-1">
                                        <TrendingUp size={12} />
                                        需提升 {gap}
                                    </div>
                                )}
                                {gap <= 0 && (
                                    <div className="mt-2 text-xs text-green-400">✓ 已達標</div>
                                )}
                            </div>
                        );
                    })}
                </motion.div>
            )}

            {/* Pain Point Diagnosis */}
            {gapPercentage < 70 && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 bg-gradient-to-r from-orange-500/10 to-red-500/10 border border-orange-500/30 rounded-xl p-4 relative z-10"
                >
                    <div className="flex items-start gap-3">
                        <div className="text-2xl">⚠️</div>
                        <div>
                            <p className="text-orange-300 font-bold mb-1">改善建議</p>
                            <p className="text-sm text-orange-200/80">
                                你的整體達成率為 {gapPercentage}%。
                                {(() => {
                                    const weakest = Object.keys(METRIC_CONFIG).reduce((min, key) => {
                                        const gap = (idealShape?.[key] || 50) - (currentScores?.[key] || 0);
                                        return gap > ((idealShape?.[min] || 50) - (currentScores?.[min] || 0)) ? key : min;
                                    });
                                    return ` 建議優先加強「${METRIC_CONFIG[weakest].name}」，這將幫助你更快達成目標。`;
                                })()}
                            </p>
                        </div>
                    </div>
                </motion.div>
            )}
        </div>
    );
};

export default DynamicRadarChart;
