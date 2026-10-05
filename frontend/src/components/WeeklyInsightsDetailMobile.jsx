import React, { useState, useEffect } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Brain, TrendingUp, AlertCircle, CheckCircle2, XCircle, Zap, Target, Heart, Clock } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import AICoachSlide from './slides/AICoachSlide';
import { uStorage } from '../utils/userStorage';
import { buildWeeklyInsights } from '../utils/weeklyInsights';
import RunningLoader from './RunningLoader';

/**
 * WeeklyInsightsDetailMobile - "My Notes" Style
 * Black Background, Vibrant Cards
 */
const WeeklyInsightsDetailMobile = () => {
    const { weekNumber } = useParams();
    const navigate = useNavigate();
    const [insightsData, setInsightsData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [acceptedRecommendations, setAcceptedRecommendations] = useState(new Set());

    useEffect(() => {
        fetchWeeklyInsights();
    }, [weekNumber]);

    const fetchWeeklyInsights = async () => {
        try {
            const userId = localStorage.getItem('userId');
            const trainingRecords = uStorage(userId).get('trainingRecords', {});
            const muscleRecoveryScores = JSON.parse(localStorage.getItem('muscleRecoveryScores') || '{}');

            // 計算邏輯統一放在 utils/weeklyInsights.js（純函式、可單元測試）：
            // 只用真實數據、建議依實際訓練量/肌群平衡/恢復度產生、減量門檻相對於個人過去 4 週平均。
            const insights = buildWeeklyInsights(trainingRecords, muscleRecoveryScores);

            setInsightsData(insights);
            setLoading(false);
        } catch (error) {
            console.error('Failed to fetch insights:', error);
            setLoading(false);
        }
    };

    const handleAccept = (id) => setAcceptedRecommendations(prev => new Set([...prev, id]));
    const handleDismiss = (id) => {
        setInsightsData(prev => ({
            ...prev,
            recommendations: prev.recommendations.filter(r => r.id !== id)
        }));
    };

    // 🎯 統一載入動畫（見 ui/DrvnPageLoader）
    if (loading) return <RunningLoader />;
    if (!insightsData) return null;

    return (
        <div className="min-h-[100dvh] bg-[#09090B] text-white font-sans selection:bg-[#F4F4F5] selection:text-black" style={{ maxWidth: '430px', margin: '0 auto' }}>
            {/* Header */}
            <div className="sticky top-0 z-50 bg-[#09090B]/90 backdrop-blur-xl border-b border-white/10 px-4 py-3 flex items-center justify-between page-top-safe--tight">
                <motion.button {...pressProps('icon')} onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-white/10 transition">
                    <ArrowLeft size={24} className="text-white" />
                </motion.button>
                <div className="text-center">
                    <h1 className="text-lg font-bold tracking-tight">Week {weekNumber} Insights</h1>
                    <p className="text-[11px] text-white/40 font-semibold tracking-wide">統計範圍：最近 7 天</p>
                </div>
                <div className="w-8" />
            </div>

            <div className="px-4 py-6 space-y-6 pb-4">
                {/* AI Coach Preview */}
                <div className="rounded-[36px] overflow-hidden shadow-2xl transform scale-95 origin-top">
                    <AICoachSlide aiAdvice={{ ...insightsData.aiAdvice, onViewDetails: null }} />
                </div>

                {/* Volume Analysis - Yellow Card */}
                <AnalysisSection title="Volume Analysis" color="bg-[#FFD66B]" textColor="text-black">
                    <div className="flex items-baseline gap-2 mb-4">
                        <span className="text-5xl font-black text-black">{insightsData.volumeAnalysis.totalVolume.toLocaleString()}</span>
                        <span className="text-sm font-bold text-black/60 uppercase">kg total</span>
                    </div>
                    <div className="space-y-3">
                        {insightsData.volumeAnalysis.breakdown.map((item, idx) => (
                            <div key={idx} className="bg-black/5 rounded-xl p-3">
                                <div className="flex justify-between text-sm font-bold text-black mb-1">
                                    <span>{item.muscle}</span>
                                    <span>{item.percentage}%</span>
                                </div>
                                <div className="h-2 bg-black/10 rounded-full overflow-hidden">
                                    <div className="h-full bg-black rounded-full" style={{ width: `${item.percentage}%` }} />
                                </div>
                            </div>
                        ))}
                        {insightsData.volumeAnalysis.breakdown.length === 0 && (
                            <div className="text-center text-black/40 py-4 font-medium">No training data this week</div>
                        )}
                    </div>
                </AnalysisSection>

                {/* Weekly Performance - Blue Card (Replaces Form Quality) */}
                <AnalysisSection title="Performance" color="bg-[#B5D8F6]" textColor="text-black">
                    <div className="grid grid-cols-2 gap-3">
                        {insightsData.weeklyPerformance.breakdown.map((item, idx) => (
                            <div key={idx} className="bg-white/40 p-3 rounded-[18px] flex flex-col justify-between min-h-[80px]">
                                <div className="text-[9px] font-bold text-black/50 mb-1 uppercase tracking-wider">{item.metric}</div>
                                <div>
                                    <div className="text-2xl font-black text-black leading-none">{item.score}</div>
                                    {item.unit && <div className="text-xs font-bold text-black/40 mt-0.5">{item.unit}</div>}
                                </div>
                            </div>
                        ))}
                    </div>
                </AnalysisSection>

                {/* Recommendations - Cream Card */}
                <div className="space-y-4">
                    <h2 className="text-2xl font-black text-white px-2">AI Suggestions</h2>
                    {insightsData.recommendations.map(rec => (
                        <RecommendationCard
                            key={rec.id}
                            rec={rec}
                            isAccepted={acceptedRecommendations.has(rec.id)}
                            onAccept={() => handleAccept(rec.id)}
                            onDismiss={() => handleDismiss(rec.id)}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

const AnalysisSection = ({ title, color, textColor, children }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className={`${color} rounded-[36px] p-6 shadow-xl`}
    >
        <h3 className={`text-xl font-black ${textColor} mb-4 flex items-center gap-2`}>
            {title}
        </h3>
        {children}
    </motion.div>
);

const RecommendationCard = ({ rec, isAccepted, onAccept, onDismiss }) => (
    <motion.div
        layout
        className={`bg-[#F4F4F5] rounded-[28px] p-6 shadow-lg relative overflow-hidden ${isAccepted ? 'opacity-50' : ''}`}
    >
        {isAccepted && <div className="absolute inset-0 bg-green-500/10 flex items-center justify-center z-10">
            <CheckCircle2 size={48} className="text-green-600" />
        </div>}

        <div className="flex justify-between items-start mb-2">
            <span className="px-3 py-1 bg-black text-white text-xs font-bold rounded-full uppercase">{rec.type}</span>
            <span className={`text-xs font-bold uppercase ${rec.priority === 'high' ? 'text-red-500' : 'text-black/40'}`}>{rec.priority} Priority</span>
        </div>
        <h4 className="text-xl font-black text-black mb-2 leading-tight">{rec.title}</h4>
        <p className="text-black/60 font-medium text-sm mb-4 leading-relaxed">{rec.description}</p>

        {!isAccepted && (
            <div className="flex gap-2">
                <motion.button {...pressProps('cta')} onClick={onAccept} className="flex-1 bg-black text-white py-3 rounded-xl font-bold text-sm tracking-wide">接受</motion.button>
                <motion.button {...pressProps('row')} onClick={onDismiss} className="px-4 py-3 bg-black/5 text-black font-bold rounded-xl text-sm">略過</motion.button>
            </div>
        )}
    </motion.div>
);

export default WeeklyInsightsDetailMobile;
