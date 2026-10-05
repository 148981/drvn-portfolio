import React, { useState, useEffect } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, TrendingUp, Trophy, Calendar, Activity, X } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { getUserId } from '../utils/auth';

// Soft Cream/Beige Color Palette (Inspired by Reference Design)
const COLORS = {
    cream: '#FFF8E8',           // Main background
    softWhite: '#FEFEFE',       // Card background
    warmBeige: '#FFF5E6',       // Alternative card background
    coral: '#FF9B7F',           // Primary accent
    softYellow: '#FFD166',      // Secondary accent
    paleGreen: '#A8D5BA',       // Tertiary accent
    warmGray: '#5C5552',        // Primary text
    lightGray: '#A8A29E',       // Secondary text
    peach: '#FFB8A0',           // Soft highlight
    lavender: '#E8D5F2'         // Subtle accent
};

// Font Styles
const FontStyle = () => (
    <style>{`
        
        
        .font-serif-elegant { font-family: var(--font-body); }
        .font-serif-body { font-family: var(--font-body); }
        .font-sans { font-family: sans-serif; }
        .paper-texture {
            background: linear-gradient(135deg, ${COLORS.cream} 0%, ${COLORS.warmBeige} 100%);
        }
        .leather-card {
            background: linear-gradient(135deg, ${COLORS.softWhite} 0%, ${COLORS.warmBeige} 50%, ${COLORS.softWhite} 100%);
            box-shadow: 
                0 4px 16px rgba(0,0,0,0.06),
                0 2px 8px rgba(0,0,0,0.04),
                inset 0 1px 0 rgba(255,255,255,0.8);
            border-radius: 28px;
        }
    `}</style>
);

import apiClient from '../api/client';
import { toast, confirmDialog } from '../utils/toast';
import { formatPace as fmtPace, formatDurationCompact as fmtDurationCompact } from '../utils/format';


const RunningAnalyticsMobile = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [period, setPeriod] = useState('week'); // Default to week
    const [analytics, setAnalytics] = useState(null);
    const [trends, setTrends] = useState([]);
    const [records, setRecords] = useState(null);
    const [recentActivities, setRecentActivities] = useState([]); // Added for recent activities
    const [selectedMetric, setSelectedMetric] = useState('pace');
    const [loading, setLoading] = useState(true);

    // Get userId from localStorage to ensure data connection
    const userId = getUserId();

    useEffect(() => {
        fetchData();
    }, [period, selectedMetric]);

    const fetchData = async () => {
        setLoading(true);
        console.log('═══════════════════════════════════════');
        console.log('📊 FETCHING RUNNING ANALYTICS DATA');
        console.log('User ID:', userId);
        console.log('Period:', period);
        console.log('Selected Metric:', selectedMetric);
        console.log('═══════════════════════════════════════');

        try {
            // Fetch analytics summary
            console.log('🔄 Fetching analytics summary...');
            const analyticsRes = await apiClient.get(`/api/cardio/analytics/summary/${userId}?period=${period}`);
            const analyticsData = analyticsRes.data;
            console.log('✅ Analytics summary:', analyticsData);
            setAnalytics(analyticsData.analytics);

            // Fetch trend data
            console.log('🔄 Fetching trends...');
            const trendsRes = await apiClient.get(`/api/cardio/analytics/trends/${userId}?metric=${selectedMetric}&limit=30&period=${period}`);
            const trendsData = trendsRes.data;
            console.log('✅ Trends data:', trendsData);
            setTrends(trendsData.trends);

            // Fetch personal records
            console.log('🔄 Fetching personal records...');
            const recordsRes = await apiClient.get(`/api/cardio/analytics/records/${userId}`);
            const recordsData = recordsRes.data;
            console.log('✅ Records data:', recordsData);
            setRecords(recordsData.records);

            // Fetch recent 10 activities
            console.log('🔄 Fetching recent activities...');
            const activitiesRes = await apiClient.get(`/api/cardio/sessions/${userId}?limit=10`);
            const activitiesData = activitiesRes.data;
            console.log('✅ Recent activities:', activitiesData);
            console.log('📝 Sessions array:', activitiesData.sessions);
            setRecentActivities(activitiesData.sessions || []);

            console.log('═══════════════════════════════════════');
            console.log('✅ ALL DATA FETCHED SUCCESSFULLY');
            console.log('═══════════════════════════════════════');
        } catch (error) {
            console.log('═══════════════════════════════════════');
            console.error('❌ ERROR FETCHING DATA:', error);
            console.log('═══════════════════════════════════════');
        }
        setLoading(false);
    };

    // 🩹 J: 單一真相源 → utils/format.js
    const formatPace = fmtPace;
    const formatDuration = fmtDurationCompact;

    const handleDeleteActivity = async (sessionId) => {
        if (!(await confirmDialog('確定要刪除這筆記錄嗎？', { danger: true }))) return;

        try {
            await apiClient.delete(`/api/cardio/session/${sessionId}?user_id=${userId}`);
            // Refresh data after deletion
            fetchData();
        } catch (error) {
            console.error('Error deleting activity:', error);
            toast.error('刪除失敗，請稍後再試');
        }
    };

    // Calculate intelligent chart domain for better readability
    const calculateChartDomain = () => {
        if (trends.length === 0) return ['auto', 'auto'];

        const values = trends.map(t => t.value).filter(v => v > 0);
        if (values.length === 0) return ['auto', 'auto'];

        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min;

        // If range is very small (similar values), use tight domain
        if (range < max * 0.1) {
            const padding = Math.max(range * 0.5, max * 0.05);
            return [
                Math.max(0, Math.floor(min - padding)),
                Math.ceil(max + padding)
            ];
        }

        // Otherwise use auto
        return ['auto', 'auto'];
    };

    return (
        <div style={{
            maxWidth: '430px',
            margin: '0 auto',
            boxShadow: '0 0 20px rgba(0,0,0,0.1)'
        }}>
            <div className="min-h-[100dvh] paper-texture pb-4">
                <FontStyle />

                {/* Header */}
                <div className="sticky top-0 z-20 paper-texture border-b page-top-safe--tight" style={{ borderColor: COLORS.lightGray + '40' }}>
                    <div className="max-w-lg mx-auto px-6 py-4 flex items-center justify-between">
                        <motion.button {...pressProps('icon')} onClick={() => {
 const fromPath = location.state?.from || '/cardio-tracker-mobile';
 if (location.state?.showResults && location.state?.cardioData) {
 navigate(fromPath, { state: { showResults: true, cardioData: location.state.cardioData } });
 } else {
 navigate(fromPath);
 }
 }} className="p-2 rounded-full hover:bg-white/50 transition">
                            <ArrowLeft size={24} style={{ color: COLORS.coral }} />
                        </motion.button>
                        <h1 className="text-2xl font-serif-elegant" style={{ color: COLORS.warmGray }}>
                            Running Analytics
                        </h1>
                        {/* 🔗 進階訓練負荷 / 傷害風險趨勢（CardioTrendView）— 補上總覽頁到深度指標的入口 */}
                        <motion.button {...pressProps('icon')}
 onClick={() => navigate('/running-trend-mobile')}
 className="p-2 rounded-full hover:bg-white/50 transition"
 aria-label="進階訓練負荷趨勢"
 >
                            <TrendingUp size={22} style={{ color: COLORS.coral }} />
                        </motion.button>
                    </div>
                </div>


                {/* Period Selector */}
                <div className="max-w-lg mx-auto px-6 py-6">
                    <div className="flex gap-2 p-2" style={{
                        background: COLORS.softWhite,
                        borderRadius: '24px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                    }}>
                        {['week', 'month', 'year', 'all'].map((p) => (
                            <motion.button {...pressProps('cta')}
 key={p}
 onClick={() => setPeriod(p)}
 className="flex-1 py-3 px-4 font-sans text-sm font-medium"
 style={{
 backgroundColor: period === p ? COLORS.coral : 'transparent',
 color: period === p ? '#FFFFFF' : COLORS.lightGray,
 borderRadius: '18px'
 }}
 >
                                {p.charAt(0).toUpperCase() + p.slice(1)}
                            </motion.button>
                        ))}
                    </div>
                </div>


                {loading ? (
                    <div className="text-center py-20">
                        <Activity className="animate-spin mx-auto mb-4" size={48} style={{ color: COLORS.coral }} />
                        <p className="font-sans" style={{ color: COLORS.lightGray }}>Loading analytics...</p>
                    </div>
                ) : (
                    <div className="max-w-lg mx-auto px-6 space-y-6">
                        {/* Summary Card */}
                        {analytics && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="leather-card p-6"
                            >
                                <h2 className="text-xl font-serif-elegant mb-4" style={{ color: COLORS.warmGray }}>
                                    Summary
                                </h2>
                                <div className="grid grid-cols-4 gap-4">
                                    <div className="flex flex-col items-center">
                                        <div className="h-8 flex items-end mb-2">
                                            <p className="text-xs font-sans uppercase tracking-wider text-center" style={{ color: COLORS.lightGray }}>
                                                Total<br />Runs
                                            </p>
                                        </div>
                                        <p className="text-xl font-serif-elegant leading-none" style={{ color: COLORS.coral }}>
                                            {analytics.total_runs}
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-center">
                                        <div className="h-8 flex items-end mb-2">
                                            <p className="text-xs font-sans uppercase tracking-wider text-center" style={{ color: COLORS.lightGray }}>
                                                Distance
                                            </p>
                                        </div>
                                        <p className="text-xl font-serif-elegant leading-none" style={{ color: COLORS.coral }}>
                                            {analytics.total_distance.toFixed(1)}
                                            <span className="text-xs font-sans ml-1">km</span>
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-center">
                                        <div className="h-8 flex items-end mb-2">
                                            <p className="text-xs font-sans uppercase tracking-wider text-center" style={{ color: COLORS.lightGray }}>
                                                Total<br />Time
                                            </p>
                                        </div>
                                        <p className="text-xl font-serif-elegant leading-none" style={{ color: COLORS.coral }}>
                                            {formatDuration(analytics.total_duration || 0)}
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-center">
                                        <div className="h-8 flex items-end mb-2">
                                            <p className="text-xs font-sans uppercase tracking-wider text-center" style={{ color: COLORS.lightGray }}>
                                                Calories
                                            </p>
                                        </div>
                                        <p className="text-xl font-serif-elegant leading-none" style={{ color: COLORS.coral }}>
                                            {Math.round(analytics.total_calories || 0)}
                                            <span className="text-xs font-sans ml-1">kcal</span>
                                        </p>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* Trend Chart */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="leather-card p-6"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-serif-elegant" style={{ color: COLORS.warmGray }}>
                                    Trends
                                </h2>
                                <TrendingUp size={20} style={{ color: COLORS.paleGreen }} />
                            </div>

                            {/* Metric Selector */}
                            <div className="flex gap-2 mb-4 flex-wrap">
                                {['distance', 'pace', 'time', 'calories', 'cadence', 'hr'].map((metric) => (
                                    <motion.button {...pressProps('cta')}
 key={metric}
 onClick={() => setSelectedMetric(metric)}
 className="flex-1 py-2 px-3 font-sans text-xs font-medium min-w-[70px]"
 style={{
 backgroundColor: selectedMetric === metric ? COLORS.peach + '60' : COLORS.warmBeige,
 color: selectedMetric === metric ? COLORS.warmGray : COLORS.lightGray,
 border: `1px solid ${selectedMetric === metric ? COLORS.coral : COLORS.lightGray + '30'}`,
 borderRadius: '12px'
 }}
 >
                                        {metric.charAt(0).toUpperCase() + metric.slice(1)}
                                    </motion.button>
                                ))}
                            </div>

                            {/* Chart */}
                            {trends.length > 0 ? (
                                <div className="h-48 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={trends}>
                                            <defs>
                                                <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor={COLORS.coral} stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor={COLORS.coral} stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <XAxis
                                                dataKey="date"
                                                tick={{ fontSize: 11, fill: COLORS.lightGray }}
                                                axisLine={{ stroke: COLORS.lightGray + '30' }}
                                                tickLine={false}
                                            />
                                            <YAxis
                                                tick={{ fontSize: 11, fill: COLORS.lightGray }}
                                                axisLine={{ stroke: COLORS.lightGray + '30' }}
                                                tickLine={false}
                                                width={45}
                                                domain={calculateChartDomain()}
                                            />
                                            <Tooltip />
                                            <Area
                                                type="monotone"
                                                dataKey="value"
                                                stroke={COLORS.coral}
                                                strokeWidth={2.5}
                                                fill="url(#trendGradient)"
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : (
                                <p className="text-center py-8 text-sm font-sans" style={{ color: COLORS.lightGray }}>
                                    No trend data available
                                </p>
                            )}
                        </motion.div>

                        {/* Recent Activities Section */}
                        {recentActivities.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.15 }}
                                className="leather-card p-6"
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-xl font-serif-elegant" style={{ color: COLORS.warmGray }}>
                                        Recent Activities
                                    </h2>
                                    <Calendar size={20} style={{ color: COLORS.softYellow }} />
                                </div>

                                <div className="space-y-2">
                                    {recentActivities.slice(0, 5).map((activity, index) => {
                                        // Extract data from metrics object
                                        const distance = activity.metrics?.distance || 0;
                                        const duration = activity.metrics?.duration || 0;
                                        const calories = activity.metrics?.calories || 0;
                                        const activityDate = activity.date || activity.start_time || new Date().toISOString();

                                        return (
                                            <div
                                                key={activity.session_id || index}
                                                onClick={() => navigate(`/running-analysis-mobile/${activity.session_id}`)}
                                                className="flex items-center justify-between py-3 px-4 transition-all hover:bg-white/50 active:scale-95 cursor-pointer"
                                                style={{
                                                    backgroundColor: COLORS.warmBeige,
                                                    borderRadius: '18px'
                                                }}
                                            >
                                                <div className="flex items-center gap-3 flex-1">
                                                    <Activity size={18} style={{ color: COLORS.coral }} />
                                                    <div>
                                                        <p className="text-sm font-sans font-medium" style={{ color: COLORS.warmGray }}>
                                                            {new Date(activityDate).toLocaleDateString('zh-TW', {
                                                                month: 'numeric',
                                                                day: 'numeric'
                                                            })}
                                                        </p>
                                                        <p className="text-xs font-sans" style={{ color: COLORS.lightGray }}>
                                                            {distance.toFixed(2)} km • {formatDuration(duration)}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className="text-right">
                                                        <p className="text-sm font-serif-elegant" style={{ color: COLORS.coral }}>
                                                            {Math.round(calories)}
                                                        </p>
                                                        <p className="text-xs font-sans" style={{ color: COLORS.lightGray }}>
                                                            kcal
                                                        </p>
                                                    </div>
                                                    <motion.button {...pressProps('row')}
 onClick={(e) => {
 e.stopPropagation();
 handleDeleteActivity(activity.session_id);
 }}
 className="p-2 rounded-lg hover:bg-red-100 transition-colors"
 style={{ color: '#E57373', opacity: 0.8 }}
 title="刪除記錄"
 >
                                                        <X size={16} />
                                                    </motion.button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* View All Button */}
                                <motion.button {...pressProps('cta')}
 onClick={() => navigate('/cardio-history-mobile')}
 className="w-full mt-4 py-3 px-4 font-sans text-sm font-medium hover:opacity-80"
 style={{
 backgroundColor: COLORS.coral + '20',
 color: COLORS.warmGray,
 border: `1px solid ${COLORS.coral}40`,
 borderRadius: '18px'
 }}
 >
                                    View All History →
                                </motion.button>
                            </motion.div>
                        )}

                        {/* Personal Records */}
                        {records && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                className="leather-card p-6"
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-xl font-serif-elegant" style={{ color: COLORS.warmGray }}>
                                        Personal Records
                                    </h2>
                                    <Trophy size={20} style={{ color: COLORS.softYellow }} />
                                </div>

                                <div className="space-y-3">
                                    {records.fastest_5k && (
                                        <PRItem
                                            title="Fastest 5K"
                                            value={formatPace(records.fastest_5k.pace)}
                                            subtitle={`on ${records.fastest_5k.date}`}
                                            color={COLORS.coral}
                                        />
                                    )}
                                    {records.fastest_10k && (
                                        <PRItem
                                            title="Fastest 10K"
                                            value={formatPace(records.fastest_10k.pace)}
                                            subtitle={`on ${records.fastest_10k.date}`}
                                            color={COLORS.coral}
                                        />
                                    )}
                                    {records.longest_run && (
                                        <PRItem
                                            title="Longest Run"
                                            value={`${records.longest_run.distance.toFixed(1)} km`}
                                            subtitle={`on ${records.longest_run.date}`}
                                            color={COLORS.paleGreen}
                                        />
                                    )}
                                    {records.highest_cadence && (
                                        <PRItem
                                            title="Highest Cadence"
                                            value={`${records.highest_cadence.cadence} spm`}
                                            subtitle={`on ${records.highest_cadence.date}`}
                                            color={COLORS.softYellow}
                                        />
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// PR Item Component
const PRItem = ({ title, value, subtitle, color }) => (
    <div className="flex items-center justify-between py-3 px-4" style={{
        backgroundColor: COLORS.warmBeige,
        borderRadius: '18px'
    }}>
        <div>
            <p className="font-sans text-sm font-medium" style={{ color: COLORS.warmGray }}>
                {title}
            </p>
            <p className="text-xs font-sans" style={{ color: COLORS.lightGray }}>
                {subtitle}
            </p>
        </div>
        <p className="text-xl font-serif-elegant" style={{ color }}>
            {value}
        </p>
    </div>
);

export default RunningAnalyticsMobile;
