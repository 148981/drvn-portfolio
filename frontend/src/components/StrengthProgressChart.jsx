import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from 'recharts';
import { Target, TrendingUp } from 'lucide-react';

// ─── Hoisted outside component: stable reference, no remount on every render ─
// Rule: rerender-no-inline-components — never define components inside components
const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-black/80 backdrop-blur-md p-3 rounded-xl border border-white/10 shadow-xl">
                <p className="text-white/60 text-xs mb-2">{label}</p>
                {payload.map((entry, index) => (
                    <div key={index} className="flex items-center gap-2 mb-1 last:mb-0">
                        <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: entry.color }}
                        />
                        <span className="text-white font-bold text-sm">
                            {entry.value} kg
                        </span>
                        <span className="text-white/50 text-xs uppercase ml-1">
                            {entry.name}
                        </span>
                    </div>
                ))}
                {payload[0]?.payload?.note && (
                    <div className="mt-2 pt-2 border-t border-white/10">
                        <p className="text-white/80 text-xs italic">
                            "{payload[0].payload.note}"
                        </p>
                    </div>
                )}
            </div>
        );
    }
    return null;
};

const StrengthProgressChart = ({ data = [], exerciseName }) => {
    // If no data, show empty state
    if (!data || data.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-8 bg-white/5 rounded-[18px] border border-white/10 backdrop-blur-sm min-h-[300px]">
                <div className="w-16 h-16 rounded-full bg-glass-blue/10 flex items-center justify-center mb-4">
                    <TrendingUp className="w-8 h-8 text-glass-blue" />
                </div>
                <h3 className="text-white font-bold text-lg mb-2">No Data Yet</h3>
                <p className="text-glass-muted text-center max-w-[250px]">
                    Start logging your {exerciseName || 'workout'} sessions to see your strength progression over time.
                </p>
            </div>
        );
    }

    // Format data for chart
    // Filter out entries where both values are 0 to keep chart clean
    const chartData = data.filter(d => d.training_weight > 0 || d.pr_weight > 0);

    // 「vs 上次」淡色基準線 — 讓最新一筆的進步一眼可見（而非只看折線）
    const trainingPts = chartData.filter(d => d.training_weight > 0);
    const prevWeight = trainingPts.length >= 2 ? trainingPts[trainingPts.length - 2].training_weight : null;
    const latestWeight = trainingPts.length >= 1 ? trainingPts[trainingPts.length - 1].training_weight : null;
    const deltaVsPrev = (prevWeight != null && latestWeight != null) ? (latestWeight - prevWeight) : null;

    return (
        <div className="h-[300px] w-full">
            <div className="flex items-center justify-between mb-4 px-2">
                <div>
                    <h3 className="text-white font-bold text-lg flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-glass-blue" />
                        Strength Progress
                    </h3>
                    <p className="text-glass-muted text-xs uppercase tracking-wider mt-1">
                        {exerciseName}
                    </p>
                </div>

                {/* Stats Summary */}
                <div className="flex gap-4">
                    <div className="text-right">
                        <p className="text-[11px] text-glass-muted uppercase">Current PR</p>
                        <p className="text-white font-black text-xl text-shadow-glow-blue">
                            {Math.max(...chartData.map(d => d.pr_weight || 0), 0)} <span className="text-sm text-glass-blue">kg</span>
                        </p>
                    </div>
                </div>
            </div>

            <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                        <defs>
                            <linearGradient id="colorPr" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8} />
                                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorTraining" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#5A7A3A" stopOpacity={0.8} />
                                <stop offset="95%" stopColor="#5A7A3A" stopOpacity={0} />
                            </linearGradient>
                        </defs>

                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />

                        <XAxis
                            dataKey="date"
                            stroke="rgba(255,255,255,0.3)"
                            tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                            dy={10}
                            tickFormatter={(str) => {
                                if (!str) return '';
                                // Parse YYYY-MM-DD
                                const date = new Date(str);
                                return `${date.getMonth() + 1}/${date.getDate()}`;
                            }}
                        />

                        <YAxis
                            stroke="rgba(255,255,255,0.3)"
                            tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                            dx={-10}
                        />

                        <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 2 }} />

                        <Legend
                            verticalAlign="top"
                            height={36}
                            iconType="circle"
                            wrapperStyle={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}
                        />

                        {prevWeight != null && (
                            <ReferenceLine
                                y={prevWeight}
                                stroke="rgba(255,255,255,0.28)"
                                strokeDasharray="5 4"
                                label={{
                                    value: deltaVsPrev != null && deltaVsPrev !== 0
                                        ? `上次 ${prevWeight}kg · ${deltaVsPrev > 0 ? '+' : ''}${deltaVsPrev}kg`
                                        : `上次 ${prevWeight}kg`,
                                    position: 'insideTopRight',
                                    fontSize: 11,
                                    fill: deltaVsPrev > 0 ? '#7BB661' : 'rgba(255,255,255,0.45)',
                                }}
                            />
                        )}

                        <Line
                            type="monotone"
                            dataKey="training_weight"
                            name="Training Weight"
                            stroke="#5A7A3A"
                            strokeWidth={3}
                            dot={{ fill: '#5A7A3A', r: 4, strokeWidth: 0 }}
                            activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
                            connectNulls
                        />

                        <Line
                            type="monotone"
                            dataKey="pr_weight"
                            name="Personal Record (PR)"
                            stroke="#3B82F6"
                            strokeWidth={3}
                            dot={{ fill: '#3B82F6', r: 4, strokeWidth: 0 }}
                            activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
                            connectNulls
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default StrengthProgressChart;
