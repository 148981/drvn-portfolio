import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import {
    LineChart, Line, BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { TrendingUp, BarChart3, Activity, Target } from 'lucide-react';
import { getMuscleGroupBalance, getVolumeIntensityTrend } from '../utils/workoutAnalytics';

const WorkoutStatsChart = ({ workoutHistory }) => {
    const [chartType, setChartType] = useState('volume');

    // Muscle group balance data for radar chart
    const muscleBalanceData = useMemo(() => {
        return getMuscleGroupBalance(workoutHistory || []);
    }, [workoutHistory]);

    // Volume & Intensity trend data for combo chart
    const trendData = useMemo(() => {
        return getVolumeIntensityTrend(workoutHistory || [], 10);
    }, [workoutHistory]);

    // PR data
    const prData = useMemo(() => {
        if (!workoutHistory || workoutHistory.length === 0) return [];

        return workoutHistory
            .filter(w => w.has_pr || w.hasPR)
            .reverse()
            .slice(-10)
            .map(workout => ({
                date: new Date(workout.timestamp || workout.date).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' }),
                prs: (workout.pr_alerts || []).length || 1
            }));
    }, [workoutHistory]);

    if (!workoutHistory || workoutHistory.length === 0) {
        return (
            <div className="text-center py-12 text-zinc-400">
                <BarChart3 size={48} className="mx-auto mb-4 opacity-50" />
                <p>還沒有圖表數據</p>
                <p className="text-sm mt-2">完成更多訓練後，圖表將顯示您的進度</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Chart Type Selector */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
                <motion.button {...pressProps('row')}
 onClick={() => setChartType('volume')}
 className={`px-4 py-2 rounded-xl whitespace-nowrap flex items-center gap-2 ${chartType === 'volume'
 ? 'bg-blue-500 text-white'
 : 'bg-white/5 text-zinc-400 hover:bg-white/10'
 }`}
 >
                    <TrendingUp size={16} />
                    容量與強度
                </motion.button>
                <motion.button {...pressProps('row')}
 onClick={() => setChartType('balance')}
 className={`px-4 py-2 rounded-xl whitespace-nowrap flex items-center gap-2 ${chartType === 'balance'
 ? 'bg-blue-500 text-white'
 : 'bg-white/5 text-zinc-400 hover:bg-white/10'
 }`}
 >
                    <Target size={16} />
                    肌群平衡
                </motion.button>
                <motion.button {...pressProps('row')}
 onClick={() => setChartType('pr')}
 className={`px-4 py-2 rounded-xl whitespace-nowrap flex items-center gap-2 ${chartType === 'pr'
 ? 'bg-blue-500 text-white'
 : 'bg-white/5 text-zinc-400 hover:bg-white/10'
 }`}
 >
                    <Activity size={16} />
                    PR 突破
                </motion.button>
            </div>

            {/* Chart Display */}
            <div className="bg-white/5 border border-white/10 rounded-[18px] p-6">
                {/* Volume & Intensity Combo Chart */}
                {chartType === 'volume' && (
                    <div>
                        <h3 className="text-lg font-bold text-white mb-2">訓練容量與強度趨勢</h3>
                        <p className="text-xs text-zinc-400 mb-4">藍色柱狀 = 總容量 | 橙色折線 = 平均重量</p>
                        <div style={{ width: '100%', height: '300px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={trendData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                    <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }} />
                                    <YAxis yAxisId="left" stroke="rgba(255,255,255,0.5)" tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }} />
                                    <YAxis yAxisId="right" orientation="right" stroke="rgba(255,255,255,0.5)" tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }} />
                                    <Tooltip contentStyle={{ backgroundColor: 'rgba(0,0,0,0.9)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: 'white' }} />
                                    <Legend wrapperStyle={{ color: 'white' }} />
                                    <Bar yAxisId="left" dataKey="volume" fill="#3B82F6" fillOpacity={0.7} radius={[8, 8, 0, 0]} name="訓練容量 (kg)" />
                                    <Line yAxisId="right" type="monotone" dataKey="avgWeight" stroke="#F59E0B" strokeWidth={2} dot={{ fill: '#F59E0B', r: 4 }} name="平均重量 (kg)" />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}

                {/* Muscle Group Balance Radar Chart */}
                {chartType === 'balance' && (
                    <div>
                        <h3 className="text-lg font-bold text-white mb-2">肌群訓練平衡分析</h3>
                        <p className="text-xs text-zinc-400 mb-4">六邊形越接近完整圓形，訓練越均衡</p>
                        <div style={{ width: '100%', height: '320px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <RadarChart data={muscleBalanceData}>
                                    <PolarGrid stroke="rgba(255,255,255,0.2)" />
                                    <PolarAngleAxis
                                        dataKey="subject"
                                        tick={{ fill: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 500 }}
                                    />
                                    <PolarRadiusAxis
                                        angle={90}
                                        domain={[0, 100]}
                                        tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
                                    />
                                    <Radar
                                        name="訓練頻率"
                                        dataKey="value"
                                        stroke="#5A7A3A"
                                        fill="#5A7A3A"
                                        fillOpacity={0.4}
                                        strokeWidth={2}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'rgba(0,0,0,0.9)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: 'white' }}
                                        formatter={(value, name, props) => [`${props.payload.actual} 次訓練 (${value}%)`, '訓練頻率']}
                                    />
                                </RadarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}

                {/* PR Breakthrough Chart */}
                {chartType === 'pr' && (
                    <div>
                        <h3 className="text-lg font-bold text-white mb-4">PR 突破記錄</h3>
                        {prData.length > 0 ? (
                            <div style={{ width: '100%', height: '300px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={prData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                        <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }} />
                                        <YAxis stroke="rgba(255,255,255,0.5)" tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }} />
                                        <Tooltip contentStyle={{ backgroundColor: 'rgba(0,0,0,0.9)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: 'white' }} />
                                        <Bar dataKey="prs" fill="#F59E0B" radius={[8, 8, 0, 0]} name="PR 突破數量" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="text-center py-12 text-zinc-400">
                                <p>還沒有 PR 突破記錄</p>
                                <p className="text-sm mt-2">繼續努力，突破自我！🏆</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default WorkoutStatsChart;
