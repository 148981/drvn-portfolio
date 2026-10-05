import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, Activity, ArrowRight } from 'lucide-react';
import apiClient from '../api/client';

const ProgressTracker = ({ userId }) => {
    const [loading, setLoading] = useState(true);
    const [selectedMetric, setSelectedMetric] = useState(null);
    const [workoutHistory, setWorkoutHistory] = useState([]);

    useEffect(() => {
        if (userId) {
            fetchWorkoutHistory();
        }
    }, [userId]);

    const fetchWorkoutHistory = async () => {
        try {
            const historyRes = await apiClient.get(`/api/workout/history/${userId}?limit=30`);
            setWorkoutHistory(historyRes.data.history || []);
        } catch (error) {
            console.error('Error fetching workout history:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (isoString) => {
        const date = new Date(isoString);
        return date.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[300px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-glass-blue"></div>
            </div>
        );
    }

    if (workoutHistory.length === 0) {
        return (
            <div className="p-8 text-center rounded-[18px]" style={{ backgroundColor: '#3E3832', border: '1px solid rgba(212, 148, 106, 0.2)' }}>
                <div className="w-16 h-16 rounded-[18px] flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: 'rgba(212, 148, 106, 0.1)' }}>
                    <Activity size={32} style={{ color: '#D4946A' }} />
                </div>
                <h3 className="text-lg font-medium mb-2" style={{ color: '#E0D8D3' }}>No Workout History Yet</h3>
                <p className="text-sm" style={{ color: '#9A8F84' }}>Complete your first workout to start tracking progress!</p>
            </div>
        );
    }

    // Detailed metric chart view
    if (selectedMetric) {
        const chartData = workoutHistory
            .map(session => ({
                date: formatDate(session.timestamp),
                score: session.metrics?.[selectedMetric] || 0
            }))
            .filter(d => d.score > 0)
            .reverse();

        return (
            <div className="space-y-6 animate-fade-in">
                <motion.button {...pressProps('row')}
 onClick={() => setSelectedMetric(null)}
 className="flex items-center gap-2 text-glass-muted hover:text-white transition-colors"
 >
                    <ArrowRight size={16} className="rotate-180" /> Back to Indicators
                </motion.button>

                <div className="p-6 rounded-[18px]" style={{ backgroundColor: '#3E3832', border: '1px solid rgba(212, 148, 106, 0.2)' }}>
                    <h3 className="text-lg font-semibold mb-6 flex items-center gap-2" style={{ color: '#E0D8D3' }}>
                        <Activity size={20} style={{ color: '#D4946A' }} />
                        {selectedMetric} Trend Analysis
                    </h3>

                    <div className="h-64 w-full mb-6">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis dataKey="date" stroke="rgba(255,255,255,0.3)" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} />
                                <YAxis domain={[0, 100]} stroke="rgba(255,255,255,0.3)" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1E1E23', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="score"
                                    stroke="#D4946A"
                                    strokeWidth={3}
                                    dot={{ fill: '#D4946A', r: 4 }}
                                    activeDot={{ r: 6, stroke: '#fff' }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="rounded-xl p-4 border" style={{ backgroundColor: 'rgba(212, 148, 106, 0.1)', borderColor: 'rgba(212, 148, 106, 0.2)' }}>
                        <h4 className="text-sm font-medium mb-2" style={{ color: '#E0D8D3' }}>Metrics Insight</h4>
                        <p className="text-xs" style={{ color: '#9A8F84' }}>
                            Analyzing the trend for <strong>{selectedMetric}</strong> reveals your consistency in maintaining form.
                            Positive trends indicate improved motor control and muscle memory adaptation.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // Main view: Seven Major Indicators List
    return (
        <div className="space-y-6 animate-fade-in">
            <div className="p-6 rounded-[18px]" style={{ backgroundColor: '#3E3832', border: '1px solid rgba(212, 148, 106, 0.2)' }}>
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2" style={{ color: '#E0D8D3' }}>
                    <Activity size={20} style={{ color: '#D4946A' }} />
                    Seven Major Indicators
                </h3>
                <p className="text-xs mb-6" style={{ color: '#9A8F84' }}>Select any indicator below to see its historical performance and progression.</p>

                <div className="space-y-3">
                    {[
                        { id: 'L Elbow', label: 'Left Elbow Stability', icon: '💪', color: 'text-blue-400' },
                        { id: 'R Elbow', label: 'Right Elbow Stability', icon: '💪', color: 'text-blue-400' },
                        { id: 'Torso Lean', label: 'Torso Stability', icon: '🧍', color: 'text-purple-400' },
                        { id: 'Tempo', label: 'Movement Tempo', icon: '⏱️', color: 'text-orange-400' },
                        { id: 'Elbow Sym', label: 'Body Symmetry', icon: '⚖️', color: 'text-teal-400' },
                        { id: 'Stability', label: 'Overall Stability', icon: '🎯', color: 'text-green-400' },
                        { id: 'Shrug', label: 'Shoulder Control', icon: '🧘', color: 'text-pink-400' }
                    ].map((metric) => {
                        // Calculate metrics from history
                        const latestSession = workoutHistory[0];
                        const currentScore = latestSession?.metrics?.[metric.id] || 0;

                        const prevSession = workoutHistory.find((s, i) => i > 0 && s.metrics?.[metric.id]);
                        const prevScore = prevSession?.metrics?.[metric.id] || currentScore;
                        const change = prevScore > 0 ? Math.round(((currentScore - prevScore) / prevScore) * 100) : 0;

                        return (
                            <div
                                key={metric.id}
                                onClick={() => setSelectedMetric(metric.id)}
                                className="rounded-xl p-4 border transition-all cursor-pointer group"
                                style={{ backgroundColor: 'rgba(212, 148, 106, 0.05)', borderColor: 'rgba(212, 148, 106, 0.2)' }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(212, 148, 106, 0.1)'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(212, 148, 106, 0.05)'}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-black/20 flex items-center justify-center text-lg group-hover:scale-110 transition-transform">
                                            {metric.icon}
                                        </div>
                                        <div>
                                            <div className="font-bold text-white group-hover:text-glass-blue transition-colors">{metric.label}</div>
                                            <div className="text-xs text-glass-muted">View Trend Graph</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xl font-bold" style={{ color: '#E0D8D3' }}>{currentScore > 0 ? currentScore : '-'}</div>
                                        {currentScore > 0 && (
                                            <div className={`text-xs flex items-center gap-1 justify-end ${change > 0 ? 'text-green-400' : change < 0 ? 'text-red-400' : 'text-glass-muted'}`}>
                                                {change > 0 ? <TrendingUp size={12} /> : change < 0 ? <TrendingUp size={12} className="rotate-180" /> : null}
                                                {change > 0 ? '+' : ''}{change}%
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center justify-end text-xs opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#D4946A' }}>
                                    View Details <ArrowRight size={12} className="ml-1" />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default ProgressTracker;
