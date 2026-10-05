import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Sparkles, TrendingUp } from 'lucide-react';
import apiClient from '../api/client';

const ProgressPredictionCard = ({ userId }) => {
    const [forecast, setForecast] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchForecast = async () => {
            try {
                // Use the dashboard insights endpoint which returns forecast
                const res = await apiClient.get(`/api/dashboard/insights/${userId}`);
                const data = res.data;

                if (data.forecast) {
                    const chartData = data.forecast.labels.map((label, idx) => ({
                        month: label,
                        muscle: data.forecast.muscle_mass[idx],
                        fat: data.forecast.body_fat[idx]
                    }));
                    setForecast(chartData);
                }
            } catch (err) {
                console.error("Failed to load forecast", err);
            } finally {
                setLoading(false);
            }
        };

        if (userId) fetchForecast();
    }, [userId]);

    if (loading) {
        return (
            <div className="ti-skeleton rounded-[24px] p-6 h-64 flex items-center justify-center">
                <div className="text-glass-muted">Calculating AI Prediction...</div>
            </div>
        );
    }

    if (!forecast) return null;

    return (
        <div className="glass-card-light p-6 relative overflow-hidden group">
            {/* Background Decor */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 blur-3xl rounded-full pointer-events-none" />

            <div className="flex items-center justify-between mb-6 relative z-10">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/20 rounded-lg text-purple-400">
                        <Sparkles size={20} />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                            Future Body Prediction
                            <span className="text-[11px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/20">AI BETA</span>
                        </h3>
                        <p className="text-xs text-glass-muted">Estimated progression based on current consistency</p>
                    </div>
                </div>
                {/* Optional Trend Indicator */}
                <div className="hidden sm:flex items-center gap-2 text-green-400 text-xs bg-green-500/10 px-3 py-1 rounded-full border border-green-500/20">
                    <TrendingUp size={14} />
                    <span>Positive Trend</span>
                </div>
            </div>

            <div className="h-64 relative z-10">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={forecast}>
                        <defs>
                            <linearGradient id="muscleFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="fatFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#EC4899" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#EC4899" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis
                            dataKey="month"
                            stroke="rgba(255,255,255,0.3)"
                            fontSize={11}
                            tickLine={false}
                            axisLine={false}
                            dy={10}
                        />
                        <YAxis
                            stroke="rgba(255,255,255,0.3)"
                            fontSize={11}
                            tickLine={false}
                            axisLine={false}
                            dx={-10}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'rgba(20, 20, 25, 0.9)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '12px',
                                padding: '12px'
                            }}
                            itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 500 }}
                            labelStyle={{ color: 'rgba(255, 255, 255, 0.5)', marginBottom: '8px', fontSize: '11px' }}
                        />
                        <Area
                            type="monotone"
                            dataKey="muscle"
                            stroke="#3B82F6"
                            fill="url(#muscleFill)"
                            strokeWidth={3}
                            name="Muscle Mass (kg)"
                            activeDot={{ r: 6, strokeWidth: 0 }}
                        />
                        <Area
                            type="monotone"
                            dataKey="fat"
                            stroke="#EC4899"
                            fill="url(#fatFill)"
                            strokeWidth={3}
                            name="Body Fat (%)"
                            activeDot={{ r: 6, strokeWidth: 0 }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            <div className="flex justify-center gap-8 mt-4">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
                    <span className="text-xs text-glass-muted">Muscle Mass</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-pink-500 shadow-[0_0_10px_rgba(236,72,153,0.5)]"></div>
                    <span className="text-xs text-glass-muted">Body Fat %</span>
                </div>
            </div>
        </div>
    );
};

export default ProgressPredictionCard;
