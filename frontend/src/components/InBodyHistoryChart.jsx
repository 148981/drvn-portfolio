import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const InBodyHistoryChart = ({ history, trends }) => {
    const [selectedMetric, setSelectedMetric] = useState('weight_kg');

    if (!history || history.length === 0) {
        return (
            <div className="bg-white/5 border border-white/10 rounded-[18px] p-6 text-center">
                <p className="text-[#B5AFA9]">沒有足夠的歷史數據來顯示趨勢圖</p>
                <p className="text-sm text-[#B5AFA9]/60 mt-2">完成更多訓練並記錄 InBody 數據後，您將看到進度趨勢</p>
            </div>
        );
    }

    const metrics = [
        { key: 'weight_kg', label: '體重 (kg)', color: '#E0D6CC' }, // Bone White
        { key: 'body_fat_percent', label: '體脂率 (%)', color: '#D4A373' }, // Terracotta
        { key: 'skeletal_muscle_mass', label: '肌肉量 (kg)', color: '#84A98C' }, // Sage Green
        { key: 'bmi', label: 'BMI', color: '#8D99AE' }, // Slate Blue
        { key: 'body_water_percent', label: '體水分率 (%)', color: '#B5AFA9' }, // Warm Grey
        { key: 'visceral_fat_level', label: '內臟脂肪', color: '#6D597A' } // Dusty Purple
    ];

    // Prepare chart data with forward-fill for null values
    const chartData = history.slice().reverse().map((record, index, arr) => {
        const processedRecord = {
            date: record.measurement_date || new Date(record.timestamp).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' })
        };

        // For each metric, if current value is null, use the previous non-null value
        metrics.forEach(metric => {
            let value = record[metric.key];

            // If value is null, look backwards for the last non-null value
            if (value === null || value === undefined) {
                for (let i = index - 1; i >= 0; i--) {
                    const prevValue = arr[i][metric.key];
                    if (prevValue !== null && prevValue !== undefined) {
                        value = prevValue;
                        break;
                    }
                }
            }

            processedRecord[metric.key] = value;
        });

        return processedRecord;
    });

    const selectedMetricData = metrics.find(m => m.key === selectedMetric);
    const trendData = trends?.metrics?.[selectedMetric];

    const getTrendIcon = () => {
        if (!trendData) return null;
        if (trendData.trend_direction === 'increasing') return <TrendingUp size={16} className="text-blue-400" />;
        if (trendData.trend_direction === 'decreasing') return <TrendingDown size={16} className="text-blue-400" />;
        return <Minus size={16} className="text-gray-400" />;
    };

    const getTrendColor = () => {
        if (!trendData || trendData.is_positive_trend === null) return 'text-gray-400';
        return trendData.is_positive_trend ? 'text-green-400' : 'text-red-400';
    };

    return (
        <div className="bg-white/5 border border-white/10 rounded-[18px] p-6">
            <h3 className="text-lg font-semibold text-white mb-4">📈 InBody 歷史趨勢</h3>

            {/* Metric Selector */}
            <div className="flex flex-wrap gap-2 mb-6">
                {metrics.map(metric => (
                    <motion.button {...pressProps('row')}
 key={metric.key}
 onClick={() => setSelectedMetric(metric.key)}
 className={`px-4 py-2 rounded-lg text-sm ${selectedMetric === metric.key
 ? 'bg-[#E0D6CC]/30 text-[#E0D6CC] border border-[#E0D6CC]/50'
 : 'bg-white/5 text-[#B5AFA9] hover:bg-white/10'
 }`}
 >
                        {metric.label}
                    </motion.button>
                ))}
            </div>

            {/* Trend Summary */}
            {trendData && (
                <div className="bg-white/5 rounded-lg p-4 mb-6 border border-white/10">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-sm text-[#B5AFA9] mb-1">當前值</div>
                            <div className="text-2xl font-bold text-white">
                                {trendData.latest_value}
                                {selectedMetric.includes('percent') ? '%' : selectedMetric.includes('mass') ? 'kg' : ''}
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-sm text-[#B5AFA9] mb-1">變化</div>
                            <div className={`text-xl font-bold flex items-center gap-2 ${getTrendColor()}`}>
                                {getTrendIcon()}
                                <span>{trendData.percent_change > 0 ? '+' : ''}{trendData.percent_change}%</span>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-sm text-[#B5AFA9] mb-1">平均值</div>
                            <div className="text-lg font-semibold text-[#E0D6CC]">
                                {trendData.average_value}
                            </div>
                        </div>
                    </div>
                    {trendData.is_positive_trend !== null && (
                        <div className={`mt-3 text-sm ${getTrendColor()}`}>
                            {trendData.is_positive_trend
                                ? '良好趨勢！繼續保持'
                                : '需要調整訓練或飲食計劃'}
                        </div>
                    )}
                </div>
            )}

            {/* Chart */}
            <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis
                        dataKey="date"
                        stroke="rgba(255,255,255,0.5)"
                        style={{ fontSize: '12px' }}
                    />
                    <YAxis
                        stroke="rgba(255,255,255,0.5)"
                        style={{ fontSize: '12px' }}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: 'rgba(30, 30, 30, 0.95)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: '8px',
                            color: '#fff'
                        }}
                    />
                    <Legend />
                    <Line
                        type="monotone"
                        dataKey={selectedMetric}
                        stroke={selectedMetricData?.color || '#3B82F6'}
                        strokeWidth={2}
                        dot={{ fill: selectedMetricData?.color, r: 4 }}
                        activeDot={{ r: 6 }}
                        name={selectedMetricData?.label}
                    />
                </LineChart>
            </ResponsiveContainer>

            {trends?.has_trend_data && chartData.length > 1 && (
                <div className="mt-4 text-xs text-[#B5AFA9]/60 text-center">
                    數據區間：{new Date(trends.date_range.start).toLocaleDateString('zh-TW')}
                    ~ {new Date(trends.date_range.end).toLocaleDateString('zh-TW')}
                    （共 {trends.record_count} 筆記錄）
                </div>
            )}
        </div>
    );
};

export default InBodyHistoryChart;
