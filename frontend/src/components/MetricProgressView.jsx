import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { TrendingUp, TrendingDown, Minus, ArrowLeft, Activity, Sparkles, Filter } from 'lucide-react';
import ProgressPredictionCard from './ProgressPredictionCard';

const MetricProgressView = ({ userId, onBack }) => {
    const [metricsData, setMetricsData] = useState(null);
    const [selectedMetric, setSelectedMetric] = useState(null);
    const [timeRange, setTimeRange] = useState('ALL'); // 1M, 3M, 6M, ALL
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (userId) {
            fetchMetricsData();
        }
    }, [userId]);

    const fetchMetricsData = async () => {
        try {
            const response = await fetch(`http://${window.location.hostname}:8000/api/workout/metrics/${userId}`);
            const data = await response.json();
            setMetricsData(data);

            // Set first metric as default
            if (data.metrics && Object.keys(data.metrics).length > 0) {
                setSelectedMetric(Object.keys(data.metrics)[0]);
            }
        } catch (error) {
            console.error('Error fetching metrics:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-glass-muted">Loading metrics...</div>
            </div>
        );
    }

    if (!metricsData || !metricsData.metrics || Object.keys(metricsData.metrics).length === 0) {
        return (
            <div className="glass-card-light p-8 text-center">
                <Activity size={48} className="text-glass-muted mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">No Workout Data Yet</h3>
                <p className="text-glass-muted text-sm">Complete some workouts to start tracking metric progress.</p>
            </div>
        );
    }

    const metrics = metricsData.metrics;
    const summary = metricsData.summary;
    const selectedData = selectedMetric ? metrics[selectedMetric] : null;

    // Filter data based on timeRange
    const getFilteredData = () => {
        if (!selectedData) return [];

        const dataPoints = selectedData.scores.map((score, idx) => ({
            id: idx,
            workout: idx + 1,
            score: score,
            date: selectedData.dates ? selectedData.dates[idx] : null
        }));

        if (timeRange === 'ALL') return dataPoints;

        const now = new Date();
        const cutoff = new Date();
        if (timeRange === '1M') cutoff.setMonth(now.getMonth() - 1);
        if (timeRange === '3M') cutoff.setMonth(now.getMonth() - 3);
        if (timeRange === '6M') cutoff.setMonth(now.getMonth() - 6);

        return dataPoints.filter(dp => {
            if (!dp.date) return true; // Keep if no date available
            return new Date(dp.date) >= cutoff;
        });
    };

    const chartData = getFilteredData();

    // Get trend icon
    const getTrendIcon = (trend) => {
        if (trend === 'improving') return <TrendingUp size={16} className="text-green-400" />;
        if (trend === 'declining') return <TrendingDown size={16} className="text-red-400" />;
        return <Minus size={16} className="text-glass-muted" />;
    };

    const getTrendColor = (trend) => {
        if (trend === 'improving') return 'text-green-400';
        if (trend === 'declining') return 'text-red-400';
        return 'text-glass-muted';
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <motion.button {...pressProps('row')}
 onClick={onBack}
 className="flex items-center gap-2 text-glass-muted hover:text-white transition-colors"
 >
                    <ArrowLeft size={20} />
                    <span>Back</span>
                </motion.button>
                <h2 className="text-2xl font-semibold text-white">Metric Progress Tracking</h2>
                <div className="w-20"></div>
            </div>

            {/* Summary Cards */}
            {summary && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Best Improving */}
                    {summary.best_improving && summary.best_improving.length > 0 && (
                        <div className="glass-card-light p-6">
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <TrendingUp size={20} className="text-green-400" />
                                Best Improving
                            </h3>
                            <div className="space-y-2">
                                {summary.best_improving.map((metric, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                                        <span className="text-white text-sm">{metric.name}</span>
                                        <div className="text-right">
                                            <div className="text-green-400 font-medium">+{metric.improvement_rate.toFixed(1)}%</div>
                                            <div className="text-xs text-glass-muted">Latest: {metric.latest}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Needs Work */}
                    {summary.needs_work && summary.needs_work.length > 0 && (
                        <div className="glass-card-light p-6">
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <TrendingDown size={20} className="text-red-400" />
                                Needs Work
                            </h3>
                            <div className="space-y-2">
                                {summary.needs_work.map((metric, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                                        <span className="text-white text-sm">{metric.name}</span>
                                        <div className="text-right">
                                            <div className="text-red-400 font-medium">{metric.improvement_rate.toFixed(1)}%</div>
                                            <div className="text-xs text-glass-muted">Latest: {metric.latest}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Metric Selector and Time Filter */}
            <div className="flex gap-4">
                <div className="glass-card-light p-6 flex-1">
                    <label className="block text-sm font-medium text-white mb-3">Select Metric to Analyze</label>
                    <div className="relative">
                        <select
                            value={selectedMetric || ''}
                            onChange={(e) => setSelectedMetric(e.target.value)}
                            className="w-full px-4 py-3 bg-[#2A2A35] border-2 border-white/20 rounded-xl text-white font-medium focus:border-glass-beige focus:outline-none focus:ring-2 focus:ring-glass-beige/30 transition-all cursor-pointer hover:border-white/40 appearance-none"
                        >
                            {Object.keys(metrics).map((metricName) => (
                                <option
                                    key={metricName}
                                    value={metricName}
                                    className="bg-[#1E1E23] text-white py-2"
                                >
                                    {metricName}
                                </option>
                            ))}
                        </select>
                        <div className="absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none">
                            <Filter size={18} className="text-white/50" />
                        </div>
                    </div>
                </div>

                <div className="glass-card-light p-6 w-auto">
                    <label className="block text-sm font-medium text-white mb-3">Time Range</label>
                    <div className="flex bg-[#2A2A35] p-1 rounded-xl border border-white/10">
                        {['1M', '3M', '6M', 'ALL'].map((range) => (
                            <motion.button {...pressProps('row')}
 key={range}
 onClick={() => setTimeRange(range)}
 className={`px-4 py-2 rounded-lg text-sm font-medium ${timeRange === range
 ? 'bg-glass-beige text-glass-dark shadow-sm'
 : 'text-white/60 hover:text-white hover:bg-white/5'
 }`}
 >
                                {range}
                            </motion.button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Selected Metric Details */}
            {selectedData && (
                <>
                    {/* Metric Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="glass-card-light p-4">
                            <div className="text-xs text-glass-muted mb-1">Latest Score</div>
                            <div className="text-2xl font-bold text-glass-beige">{selectedData.latest}</div>
                        </div>
                        <div className="glass-card-light p-4">
                            <div className="text-xs text-glass-muted mb-1">Best Score</div>
                            <div className="text-2xl font-bold text-green-400">{selectedData.best}</div>
                        </div>
                        <div className="glass-card-light p-4">
                            <div className="text-xs text-glass-muted mb-1">Average</div>
                            <div className="text-2xl font-bold text-white">{selectedData.average}</div>
                        </div>
                        <div className="glass-card-light p-4">
                            <div className="flex items-center gap-2 mb-1">
                                {getTrendIcon(selectedData.trend)}
                                <div className="text-xs text-glass-muted">Trend</div>
                            </div>
                            <div className={`text-2xl font-bold ${getTrendColor(selectedData.trend)}`}>
                                {selectedData.improvement_rate >= 0 ? '+' : ''}{selectedData.improvement_rate.toFixed(1)}%
                            </div>
                        </div>
                    </div>

                    {/* Progress Chart */}
                    <div className="glass-card-light p-6">
                        <h3 className="text-lg font-semibold text-white mb-4">
                            {selectedMetric} - Progress Over Time
                        </h3>
                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                    <XAxis
                                        dataKey="workout"
                                        stroke="rgba(255,255,255,0.5)"
                                        tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                                        label={{ value: 'Workout #', position: 'insideBottom', offset: -5, fill: 'rgba(255,255,255,0.5)' }}
                                    />
                                    <YAxis
                                        domain={[0, 100]}
                                        stroke="rgba(255,255,255,0.5)"
                                        tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                                        label={{ value: 'Score', angle: -90, position: 'insideLeft', fill: 'rgba(255,255,255,0.5)' }}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: 'rgba(30, 30, 35, 0.95)',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: '12px',
                                            color: '#fff'
                                        }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="score"
                                        stroke={selectedData.trend === 'improving' ? '#4ADE80' : selectedData.trend === 'declining' ? '#F87171' : '#D4AF6A'}
                                        strokeWidth={3}
                                        dot={{ fill: selectedData.trend === 'improving' ? '#4ADE80' : selectedData.trend === 'declining' ? '#F87171' : '#D4AF6A', r: 5 }}
                                        activeDot={{ r: 7 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </>
            )}

            {/* Future Body Prediction Section */}
            <div className="mt-8">
                <ProgressPredictionCard userId={userId} />
            </div>
        </div>
    );
};

export default MetricProgressView;
