import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, Activity, ArrowRight, Target, Heart, Scale, Flame, Apple, Moon } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import { useWorkoutHistory, useCardioSessions } from '../hooks/useDRVNData';
import { SWRTransition, SWRSkeleton, DataRevealSection, SLOTS } from './DataTransition';

const ProgressHub = ({ userId }) => {
    const [activeCategory, setActiveCategory] = useState(null); // null = hub, 'movement', 'body', 'volume', 'cardio'
    const [selectedMetric, setSelectedMetric] = useState('Overall Score');

    // ── SWR data fetching (keepPreviousData = true globally) ────────
    const {
        data: historyData,
        isLoading: historyLoading,
        isValidating: historyValidating,
        error: historyError,
        mutate: mutateHistory,
    } = useWorkoutHistory(userId, 30);

    const {
        data: cardioData,
        isLoading: cardioLoading,
        isValidating: cardioValidating,
    } = useCardioSessions(userId, 100);

    const workoutHistory  = historyData?.history  ?? [];
    const cardioSessions  = cardioData?.sessions  ?? [];
    const loading         = historyLoading && !historyData;
    const isValidating    = historyValidating || cardioValidating;

    // Stable dataKey: changes only when new data lands (not while revalidating)
    const dataKey = `${workoutHistory.length}-${cardioSessions.length}-${selectedMetric}-${activeCategory}`;

    const formatDate = (isoString) => {
        const date = new Date(isoString);
        return date.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' });
    };

    // Calculate improvement for a specific metric
    const calculateImprovement = (metricId) => {
        if (metricId === 'Overall Score') {
            const scores = workoutHistory.map(s => s.overall_score).filter(s => s > 0);
            if (scores.length < 2) return { current: scores[0] || 0, change: 0, trend: 'stable' };

            const recent = scores.slice(0, 3);
            const previous = scores.slice(3, 6);
            const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
            const prevAvg = previous.reduce((a, b) => a + b, 0) / previous.length;
            const change = prevAvg > 0 ? ((recentAvg - prevAvg) / prevAvg * 100) : 0;

            return {
                current: scores[0],
                change: Math.round(change * 10) / 10,
                trend: change > 0 ? 'improving' : change < 0 ? 'declining' : 'stable'
            };
        }

        const values = workoutHistory.map(s => s.metrics?.[metricId]).filter(v => v > 0);
        if (values.length < 2) return { current: values[0] || 0, change: 0, trend: 'stable' };

        const change = values[1] > 0 ? ((values[0] - values[1]) / values[1] * 100) : 0;
        return {
            current: values[0],
            change: Math.round(change * 10) / 10,
            trend: change > 0 ? 'improving' : change < 0 ? 'declining' : 'stable'
        };
    };

    // Category Hub View (Main Landing)
    if (!activeCategory) {
        const sevenIndicatorStats = [
            { id: 'L Elbow', label: 'L Elbow', ...calculateImprovement('L Elbow') },
            { id: 'R Elbow', label: 'R Elbow', ...calculateImprovement('R Elbow') },
            { id: 'Torso Lean', label: 'Torso', ...calculateImprovement('Torso Lean') }
        ];

        return (
            <DataRevealSection
                isLoading={loading}
                isValidating={isValidating}
                slots={SLOTS.progress}
                theme="light"
                style={{ minHeight: '100dvh' }}
            >
            <div className="min-h-[100dvh] bg-glass-dark pb-4" style={{ position: 'relative' }}>
                <div className="max-w-6xl mx-auto px-4 py-6 space-y-6 animate-fade-in">
                    <div>
                        <h2 className="text-2xl font-bold text-white mb-2">Progress Dashboard</h2>
                        <p className="text-glass-muted text-sm">Select a category to view detailed analytics</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Movement Progression Card with Preview */}
                        <div
                            onClick={() => setActiveCategory('movement')}
                            className="glass-card-light p-6 cursor-pointer hover:bg-white/10 transition-all border border-glass-blue/30 group"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="w-12 h-12 rounded-xl bg-glass-blue/20 flex items-center justify-center text-glass-blue group-hover:scale-110 transition-transform">
                                    <Target size={24} />
                                </div>
                                <ArrowRight size={20} className="text-glass-muted group-hover:translate-x-1 transition-transform" />
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2 group-hover:text-glass-blue transition-colors">Movement Progression</h3>
                            <p className="text-sm text-glass-muted mb-4">Track your 7 core stability and form metrics over time</p>

                            {/* Preview of top 3 indicators */}
                            <div className="space-y-2 mb-3">
                                {sevenIndicatorStats.map((stat, idx) => (
                                    <div key={idx} className="flex items-center justify-between text-xs">
                                        <span className="text-glass-muted">{stat.label}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-white font-medium">{stat.current}</span>
                                            <span className={stat.change > 0 ? 'text-green-400' : stat.change < 0 ? 'text-red-400' : 'text-glass-muted'}>
                                                {stat.change > 0 ? '+' : ''}{stat.change}%
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex items-center gap-2 text-xs text-glass-blue pt-2 border-t border-white/10">
                                <Activity className="w-3 h-3" />
                                <span>{workoutHistory.length} workouts recorded</span>
                            </div>
                        </div>

                        {/* Body Composition Card */}
                        <div
                            onClick={() => setActiveCategory('body')}
                            className="glass-card-light p-6 cursor-pointer hover:bg-white/10 transition-all border border-purple-400/30 group"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="w-12 h-12 rounded-xl bg-purple-400/20 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
                                    <Scale size={24} />
                                </div>
                                <ArrowRight size={20} className="text-glass-muted group-hover:translate-x-1 transition-transform" />
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2 group-hover:text-purple-400 transition-colors">Body Composition</h3>
                            <p className="text-sm text-glass-muted mb-3">Monitor weight, body fat, and muscle mass trends</p>
                            <div className="flex items-center gap-2 text-xs text-purple-400">
                                <TrendingUp className="w-3 h-3" />
                                <span>InBody integration</span>
                            </div>
                        </div>

                        {/* Workout Volume Card */}
                        <div
                            onClick={() => setActiveCategory('volume')}
                            className="glass-card-light p-6 cursor-pointer hover:bg-white/10 transition-all border border-orange-400/30 group"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="w-12 h-12 rounded-xl bg-orange-400/20 flex items-center justify-center text-orange-400 group-hover:scale-110 transition-transform">
                                    <Dumbbell size={24} />
                                </div>
                                <ArrowRight size={20} className="text-glass-muted group-hover:translate-x-1 transition-transform" />
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2 group-hover:text-orange-400 transition-colors">Workout Volume</h3>
                            <p className="text-sm text-glass-muted mb-3">Analyze training frequency and exercise volume</p>
                            <div className="flex items-center gap-2 text-xs text-orange-400">
                                <Flame className="w-3 h-3" />
                                <span>Total sessions: {workoutHistory.length}</span>
                            </div>
                        </div>

                        {/* Cardio Performance Card */}
                        <div
                            onClick={() => setActiveCategory('cardio')}
                            className="glass-card-light p-6 cursor-pointer hover:bg-white/10 transition-all border border-red-400/30 group"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="w-12 h-12 rounded-xl bg-red-400/20 flex items-center justify-center text-red-400 group-hover:scale-110 transition-transform">
                                    <Heart size={24} />
                                </div>
                                <ArrowRight size={20} className="text-glass-muted group-hover:translate-x-1 transition-transform" />
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2 group-hover:text-red-400 transition-colors">Cardio Performance</h3>
                            <p className="text-sm text-glass-muted mb-3">Track distance, pace, and heart rate metrics</p>
                            <div className="flex items-center gap-2 text-xs text-red-400">
                                <Activity className="w-3 h-3" />
                                <span>{cardioSessions.length} runs logged</span>
                            </div>
                        </div>

                        {/* Nutrition Tracking Card (Placeholder) */}
                        <div
                            className="glass-card-light p-6 cursor-not-allowed opacity-60 border border-green-400/20"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="w-12 h-12 rounded-xl bg-green-400/20 flex items-center justify-center text-green-400">
                                    <Apple size={24} />
                                </div>
                                <div className="text-xs bg-white/10 px-2 py-1 rounded-full text-glass-muted">Coming Soon</div>
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2">Nutrition Tracking</h3>
                            <p className="text-sm text-glass-muted mb-3">Monitor calorie intake and macro distribution</p>
                        </div>

                        {/* Recovery Metrics Card (Placeholder) */}
                        <div
                            className="glass-card-light p-6 cursor-not-allowed opacity-60 border border-indigo-400/20"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="w-12 h-12 rounded-xl bg-indigo-400/20 flex items-center justify-center text-indigo-400">
                                    <Moon size={24} />
                                </div>
                                <div className="text-xs bg-white/10 px-2 py-1 rounded-full text-glass-muted">Coming Soon</div>
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2">Recovery Metrics</h3>
                            <p className="text-sm text-glass-muted mb-3">Track sleep quality and recovery status</p>
                        </div>
                    </div>
                </div>
            </div>
            </DataRevealSection>
        );
    }

    // Movement Progression Detail View
    if (activeCategory === 'movement') {
        const stats = calculateImprovement(selectedMetric);
        const chartData = workoutHistory
            .map(s => ({
                date: formatDate(s.timestamp),
                value: s.overall_score || 0
            }))
            .filter(d => d.value > 0)
            .reverse();

        return (
            <div className="min-h-[100dvh] bg-glass-dark pb-4">
                <div className="max-w-6xl mx-auto px-4 py-6 space-y-6 animate-fade-in">
                    <motion.button {...pressProps('row')}
 onClick={() => setActiveCategory(null)}
 className="flex items-center gap-2 text-glass-muted hover:text-white transition-colors"
 >
                        <ArrowRight size={16} className="rotate-180" /> Back to Categories
                    </motion.button>

                    <h2 className="text-2xl font-bold text-white">Movement Form Analysis</h2>

                    <div className="glass-card-light p-6">
                        <h3 className="text-lg font-semibold text-white mb-4">Overall Score Trend</h3>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                    <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
                                    <YAxis domain={[0, 100]} stroke="rgba(255,255,255,0.5)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
                                    <Tooltip contentStyle={{ backgroundColor: '#1E1E23', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }} />
                                    <Line type="monotone" dataKey="value" stroke="#D4AF6A" strokeWidth={3} dot={{ fill: '#D4AF6A', r: 4 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Cardio Performance Detail View
    if (activeCategory === 'cardio') {
        const cardioTrendData = cardioSessions.slice(0, 10).map(session => ({
            date: formatDate(session.date || session.timestamp),
            distance: session.distance_km || 0,
            duration: session.duration_seconds ? (session.duration_seconds / 60).toFixed(1) : 0
        })).reverse();

        return (
            <div className="min-h-[100dvh] bg-glass-dark pb-4">
                <div className="max-w-6xl mx-auto px-4 py-6 space-y-6 animate-fade-in">
                    <motion.button {...pressProps('row')}
 onClick={() => setActiveCategory(null)}
 className="flex items-center gap-2 text-glass-muted hover:text-white transition-colors"
 >
                        <ArrowRight size={16} className="rotate-180" /> Back to Categories
                    </motion.button>

                    <h2 className="text-2xl font-bold text-white">Cardio Performance</h2>

                    <div className="glass-card-light p-6">
                        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <Heart size={20} className="text-red-400" />
                            Running Trends
                        </h3>
                        {cardioTrendData.length > 0 ? (
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={cardioTrendData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                        <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
                                        <YAxis yAxisId="left" stroke="rgba(255,255,255,0.5)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
                                        <YAxis yAxisId="right" orientation="right" stroke="rgba(255,255,255,0.5)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
                                        <Tooltip contentStyle={{ backgroundColor: '#1E1E23', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }} />
                                        <Legend />
                                        <Line yAxisId="left" type="monotone" dataKey="distance" name="Distance (km)" stroke="#EF4444" strokeWidth={3} dot={{ fill: '#EF4444', r: 4 }} />
                                        <Line yAxisId="right" type="monotone" dataKey="duration" name="Duration (min)" stroke="#60A5FA" strokeWidth={3} dot={{ fill: '#60A5FA', r: 4 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="text-center py-12">
                                <p className="text-glass-muted">No cardio sessions recorded yet</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Workout Volume Detail View
    if (activeCategory === 'volume') {
        const volumeData = workoutHistory.slice(0, 14).map(session => ({
            date: formatDate(session.timestamp),
            reps: session.reps_count || 0,
            score: session.overall_score || 0
        })).reverse();

        return (
            <div className="min-h-[100dvh] bg-glass-dark pb-4">
                <div className="max-w-6xl mx-auto px-4 py-6 space-y-6 animate-fade-in">
                    <motion.button {...pressProps('row')}
 onClick={() => setActiveCategory(null)}
 className="flex items-center gap-2 text-glass-muted hover:text-white transition-colors"
 >
                        <ArrowRight size={16} className="rotate-180" /> Back to Categories
                    </motion.button>

                    <h2 className="text-2xl font-bold text-white">Workout Volume</h2>

                    <div className="glass-card-light p-6">
                        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <Dumbbell size={20} className="text-orange-400" />
                            Training Volume Analytics
                        </h3>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={volumeData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                    <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
                                    <YAxis stroke="rgba(255,255,255,0.5)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
                                    <Tooltip contentStyle={{ backgroundColor: '#1E1E23', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }} />
                                    <Legend />
                                    <Bar dataKey="reps" name="Reps" fill="#FB923C" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Body Composition Placeholder
    return (
        <div className="min-h-[100dvh] bg-glass-dark pb-4">
            <div className="max-w-6xl mx-auto px-4 py-6 space-y-6 animate-fade-in">
                <motion.button {...pressProps('row')}
 onClick={() => setActiveCategory(null)}
 className="flex items-center gap-2 text-glass-muted hover:text-white transition-colors"
 >
                    <ArrowRight size={16} className="rotate-180" /> Back to Categories
                </motion.button>

                <div className="glass-card-light p-6 text-center">
                    <Scale size={48} className="text-glass-muted mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-white mb-2">Body Composition Tracking</h3>
                    <p className="text-glass-muted text-sm">
                        Body metrics tracking coming soon. Connect your InBody scan data to view weight, body fat %, and muscle mass trends.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ProgressHub;
