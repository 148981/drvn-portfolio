import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Calendar, TrendingUp } from 'lucide-react';
import { getTop1RMExercises } from '../utils/workoutAnalytics';

const WorkoutDashboardCards = ({ workoutHistory }) => {
    // Calculate PR stats
    const prStats = useMemo(() => {
        if (!workoutHistory || workoutHistory.length === 0) {
            return { total: 0, thisWeek: 0, thisMonth: 0, recent: [] };
        }

        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const prWorkouts = workoutHistory.filter(w => w.has_pr || w.hasPR);

        const thisWeek = prWorkouts.filter(w => {
            const date = new Date(w.timestamp || w.date);
            return date >= weekAgo;
        }).length;

        const thisMonth = prWorkouts.filter(w => {
            const date = new Date(w.timestamp || w.date);
            return date >= monthAgo;
        }).length;

        // Get recent PRs
        const recent = prWorkouts
            .slice(-3)
            .reverse()
            .flatMap(w => (w.pr_alerts || []).map(pr => ({
                ...pr,
                date: w.timestamp || w.date
            })));

        return {
            total: prWorkouts.length,
            thisWeek,
            thisMonth,
            recent: recent.slice(0, 3)
        };
    }, [workoutHistory]);

    // Calculate training frequency and progress
    const frequencyStats = useMemo(() => {
        if (!workoutHistory || workoutHistory.length === 0) {
            return { thisWeek: 0, thisMonth: 0, volumeChange: 0, avgPerWeek: 0 };
        }

        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        // This week's workouts
        const thisWeekWorkouts = workoutHistory.filter(w => {
            const date = new Date(w.timestamp || w.date);
            return date >= weekAgo;
        });

        // Last week's workouts
        const lastWeekWorkouts = workoutHistory.filter(w => {
            const date = new Date(w.timestamp || w.date);
            return date >= twoWeeksAgo && date < weekAgo;
        });

        // This month's workouts
        const thisMonthWorkouts = workoutHistory.filter(w => {
            const date = new Date(w.timestamp || w.date);
            return date >= monthAgo;
        });

        // Calculate volume change
        const thisWeekVolume = thisWeekWorkouts.reduce((sum, w) => sum + (w.total_volume || w.volume || 0), 0);
        const lastWeekVolume = lastWeekWorkouts.reduce((sum, w) => sum + (w.total_volume || w.volume || 0), 0);

        const volumeChange = lastWeekVolume > 0
            ? Math.round(((thisWeekVolume - lastWeekVolume) / lastWeekVolume) * 100)
            : 0;

        // Average workouts per week (last 4 weeks)
        const avgPerWeek = Math.round(thisMonthWorkouts.length / 4 * 10) / 10;

        return {
            thisWeek: thisWeekWorkouts.length,
            thisMonth: thisMonthWorkouts.length,
            volumeChange,
            avgPerWeek
        };
    }, [workoutHistory]);

    // Get top 1RM exercises
    const top1RM = useMemo(() => {
        return getTop1RMExercises(workoutHistory || [], 3);
    }, [workoutHistory]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* PR Breakthrough Card */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-gradient-to-br from-amber-500/20 to-yellow-500/20 border border-amber-500/30 rounded-[18px] p-6 relative overflow-hidden"
            >
                {/* Background glow */}
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-amber-500/20 rounded-full blur-3xl" />

                <div className="relative z-10">
                    <div className="flex items-center justify-between mb-4">
                        <Trophy size={32} className="text-amber-400" fill="currentColor" />
                        <div className="text-right">
                            <p className="text-xs text-amber-200/70">本週突破</p>
                            <p className="text-2xl font-bold text-amber-300">+{prStats.thisWeek}</p>
                        </div>
                    </div>

                    <h3 className="text-white font-bold mb-2">PR 突破記錄</h3>
                    <p className="text-amber-100/60 text-sm mb-3">本月 {prStats.thisMonth} 次 · 總計 {prStats.total} 次</p>

                    {prStats.recent.length > 0 && (
                        <div className="space-y-2">
                            {prStats.recent.map((pr, idx) => (
                                <div key={idx} className="text-xs bg-black/20 rounded-lg p-2">
                                    <p className="text-amber-200 font-medium">{pr.name || pr.exercise}</p>
                                    <p className="text-amber-300/70">{pr.oldPR}kg → {pr.newPR}kg</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </motion.div>

            {/* Training Frequency & Progress Card */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-gradient-to-br from-emerald-500/20 to-green-500/20 border border-emerald-500/30 rounded-[18px] p-6 relative overflow-hidden"
            >
                {/* Background glow */}
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/20 rounded-full blur-3xl" />

                <div className="relative z-10">
                    <div className="flex items-center justify-between mb-4">
                        <Calendar size={32} className="text-emerald-400" />
                        <div className="text-right">
                            <p className="text-xs text-emerald-200/70">本週訓練</p>
                            <p className="text-2xl font-bold text-emerald-300">{frequencyStats.thisWeek}</p>
                        </div>
                    </div>

                    <h3 className="text-white font-bold mb-2">訓練頻率</h3>
                    <p className="text-emerald-100/60 text-sm mb-3">本月 {frequencyStats.thisMonth} 次 · 平均 {frequencyStats.avgPerWeek} 次/週</p>

                    <div className="space-y-2">
                        {/* Volume change indicator */}
                        <div className="flex items-center justify-between bg-black/20 rounded-lg p-3">
                            <span className="text-emerald-200/70 text-sm">容量變化</span>
                            <div className="flex items-center gap-2">
                                {frequencyStats.volumeChange > 0 ? (
                                    <>
                                        <TrendingUp size={16} className="text-emerald-400" />
                                        <span className="text-emerald-300 font-bold">+{frequencyStats.volumeChange}%</span>
                                    </>
                                ) : frequencyStats.volumeChange < 0 ? (
                                    <>
                                        <TrendingUp size={16} className="text-red-400 rotate-180" />
                                        <span className="text-red-300 font-bold">{frequencyStats.volumeChange}%</span>
                                    </>
                                ) : (
                                    <span className="text-emerald-200/50 font-bold">0%</span>
                                )}
                            </div>
                        </div>

                        {/* Weekly goal progress */}
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-emerald-200/70">訓練目標 (3-5次/週)</span>
                                <span className="text-xs text-emerald-300">{frequencyStats.thisWeek}/5</span>
                            </div>
                            <div className="flex items-center gap-1">
                                {[...Array(5)].map((_, i) => (
                                    <div
                                        key={i}
                                        className={`flex-1 h-2 rounded-full transition-all ${i < frequencyStats.thisWeek ? 'bg-emerald-500' : 'bg-white/10'
                                            }`}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* 1RM Estimation Card */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30 rounded-[18px] p-6 relative overflow-hidden"
            >
                {/* Background glow */}
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl" />

                <div className="relative z-10">
                    <div className="flex items-center justify-between mb-4">
                        <TrendingUp size={32} className="text-blue-400" />
                        <div className="text-right">
                            <p className="text-xs text-blue-200/70">預估肌力</p>
                            <p className="text-2xl font-bold text-blue-300">1RM</p>
                        </div>
                    </div>

                    <h3 className="text-white font-bold mb-2">最大肌力估算</h3>
                    <p className="text-blue-100/60 text-sm mb-3">Top 3 動作排行</p>

                    {top1RM.length > 0 ? (
                        <div className="space-y-2">
                            {top1RM.map((exercise, idx) => (
                                <div key={idx} className="bg-black/20 rounded-lg p-2">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-blue-200 font-medium text-sm">{exercise.name}</p>
                                            <p className="text-blue-300/70 text-xs">
                                                {exercise.weight}kg × {exercise.reps}次
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xl font-bold text-blue-300">{exercise.max1RM}</p>
                                            <p className="text-xs text-blue-200/50">kg</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-4 text-blue-200/50 text-sm">
                            完成更多訓練以顯示數據
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

export default WorkoutDashboardCards;
