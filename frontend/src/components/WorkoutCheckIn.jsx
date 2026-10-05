import React, { useState, useEffect, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { CheckCircle, Flame, Trophy, TrendingUp, Calendar, Clock, Target, Zap, Award, Share2, Download } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
import { toast } from '../utils/toast';
// react-confetti loaded on-demand (bundle-dynamic-imports)
const Confetti = lazy(() => import('react-confetti'));

const CircularProgress = ({ value, max, color, size = 120, strokeWidth = 12, label, unit }) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const progress = ((value / max) * 100);
    const offset = circumference - (progress / 100) * circumference;

    return (
        <div className="relative" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="transform -rotate-90">
                {/* Background circle */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth={strokeWidth}
                    fill="none"
                />
                {/* Progress circle */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={color}
                    strokeWidth={strokeWidth}
                    fill="none"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                    style={{ filter: `drop-shadow(0 0 8px ${color})` }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-3xl font-bold text-white">{value}</div>
                <div className="text-xs text-glass-muted">{unit}</div>
            </div>
        </div>
    );
};

const StatCard = ({ icon: Icon, label, value, unit, color, trend }) => (
    <div className={`bg-gradient-to-br ${color} rounded-[18px] p-4 relative overflow-hidden border border-white/10`}>
        <div className="absolute top-0 right-0 w-20 h-20 bg-white/5 rounded-full blur-2xl"></div>
        <div className="relative z-10">
            <div className="flex items-center justify-between mb-2">
                <Icon size={20} className="text-white/80" />
                {trend && <span className="text-xs text-green-400">↗ {trend}</span>}
            </div>
            <div className="text-2xl font-bold text-white mb-1">{value}<span className="text-sm text-white/60">{unit}</span></div>
            <div className="text-xs text-white/60">{label}</div>
        </div>
    </div>
);

const WorkoutCheckIn = ({ workoutData, onClose }) => {
    const [showConfetti, setShowConfetti] = useState(true);
    const [animationStage, setAnimationStage] = useState(0);

    useEffect(() => {
        const timer1 = setTimeout(() => setAnimationStage(1), 300);
        const timer2 = setTimeout(() => setAnimationStage(2), 800);
        const timer3 = setTimeout(() => setAnimationStage(3), 1300);
        const confettiTimer = setTimeout(() => setShowConfetti(false), 5000);

        return () => {
            clearTimeout(timer1);
            clearTimeout(timer2);
            clearTimeout(timer3);
            clearTimeout(confettiTimer);
        };
    }, []);

    const {
        workoutType = '力量訓練',
        duration = 45,
        calories = 320,
        exercises = 8,
        sets = 24,
        streak = 5,
        totalWorkouts = 32,
        achievement = null
    } = workoutData || {};

    // Calculate some derived stats
    const calorieGoal = 400;
    const durationGoal = 60;
    const avgCaloriesPerMin = Math.round(calories / duration);
    const completionRate = Math.min(100, Math.round((calories / calorieGoal) * 100));

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 overflow-y-auto">
            {showConfetti && (
                <Suspense fallback={null}>
                <Confetti
                    width={window.innerWidth}
                    height={window.innerHeight}
                    recycle={false}
                    numberOfPieces={300}
                    gravity={0.25}
                    colors={['#5A7A3A', '#34D399', '#6EE7B7', '#A7F3D0', '#FBBF24', '#F59E0B']}
                />
                </Suspense>
            )}

            <div className="relative max-w-4xl w-full my-8">
                {/* Success Icon with Glow */}
                <div className={`flex justify-center mb-6 transform transition-all duration-500 ${animationStage >= 0 ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
                    }`}>
                    <div className="relative">
                        <div className="absolute inset-0 bg-green-500/40 rounded-full blur-3xl animate-pulse"></div>
                        <div className="relative bg-gradient-to-br from-green-400 to-emerald-500 rounded-full p-6">
                            <CheckCircle size={80} className="text-white" strokeWidth={3} />
                        </div>
                    </div>
                </div>

                {/* Main Card */}
                <div className={`bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-8 border-2 border-green-500/30 shadow-2xl shadow-green-500/20 transform transition-all duration-500 max-h-[85dvh] overflow-y-auto ${animationStage >= 1 ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
                    }`}>
                    {/* Title */}
                    <div className="text-center mb-8">
                        <h2 className="text-5xl font-bold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent mb-3">
                            訓練完成！
                        </h2>
                        <p className="text-glass-muted text-lg">又向目標邁進了一步 💪</p>
                    </div>

                    {/* Main Stats with Circular Progress */}
                    <div className={`grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 transform transition-all duration-500 delay-200 ${animationStage >= 2 ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
                        }`}>
                        {/* Calories Progress */}
                        <div className="bg-gradient-to-br from-orange-500/10 to-red-500/10 rounded-[18px] p-6 border border-orange-400/20 text-center">
                            <div className="flex justify-center mb-4">
                                <CircularProgress
                                    value={calories}
                                    max={calorieGoal}
                                    color="#FB923C"
                                    size={140}
                                    strokeWidth={14}
                                    unit="kcal"
                                />
                            </div>
                            <div className="text-white font-semibold mb-1">熱量消耗</div>
                            <div className="text-sm text-glass-muted">目標: {calorieGoal} kcal ({completionRate}%)</div>
                        </div>

                        {/* Duration Progress */}
                        <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded-[18px] p-6 border border-blue-400/20 text-center">
                            <div className="flex justify-center mb-4">
                                <CircularProgress
                                    value={duration}
                                    max={durationGoal}
                                    color="#3B82F6"
                                    size={140}
                                    strokeWidth={14}
                                    unit="分鐘"
                                />
                            </div>
                            <div className="text-white font-semibold mb-1">訓練時長</div>
                            <div className="text-sm text-glass-muted">平均: {avgCaloriesPerMin} kcal/min</div>
                        </div>

                        {/* Exercises Progress */}
                        <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-[18px] p-6 border border-purple-400/20 text-center">
                            <div className="flex justify-center mb-4">
                                <CircularProgress
                                    value={sets}
                                    max={30}
                                    color="#A855F7"
                                    size={140}
                                    strokeWidth={14}
                                    unit="組"
                                />
                            </div>
                            <div className="text-white font-semibold mb-1">完成組數</div>
                            <div className="text-sm text-glass-muted">{exercises} 個動作</div>
                        </div>
                    </div>

                    {/* Detailed Stats Grid */}
                    <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 transform transition-all duration-500 delay-400 ${animationStage >= 3 ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
                        }`}>
                        <StatCard
                            icon={Flame}
                            label="連續訓練"
                            value={streak}
                            unit="天"
                            color="from-orange-500/20 to-red-500/20"
                            trend="+2"
                        />
                        <StatCard
                            icon={Trophy}
                            label="累計訓練"
                            value={totalWorkouts}
                            unit="次"
                            color="from-yellow-500/20 to-amber-500/20"
                        />
                        <StatCard
                            icon={Zap}
                            label="強度"
                            value={avgCaloriesPerMin}
                            unit=" kcal/min"
                            color="from-cyan-500/20 to-blue-500/20"
                        />
                        <StatCard
                            icon={Award}
                            label="完成度"
                            value={completionRate}
                            unit="%"
                            color="from-green-500/20 to-emerald-500/20"
                        />
                    </div>

                    {/* Achievement Badge */}
                    {achievement && (
                        <div className="mb-8 bg-gradient-to-r from-yellow-500/20 to-amber-500/20 rounded-[18px] p-6 border-2 border-yellow-400/40 animate-pulse">
                            <div className="flex items-center gap-4">
                                <div className="bg-gradient-to-br from-yellow-400 to-amber-500 p-4 rounded-[18px]">
                                    <Trophy size={40} className="text-white" />
                                </div>
                                <div className="flex-1">
                                    <div className="text-sm text-yellow-400 font-semibold mb-1">🎖️ 新成就解鎖！</div>
                                    <div className="text-white font-bold text-xl mb-1">{achievement.title}</div>
                                    <div className="text-sm text-glass-muted">{achievement.description}</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Performance Graph Placeholder */}
                    <div className="mb-8 bg-white/5 rounded-[18px] p-6 border border-white/10">
                        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                            <TrendingUp size={20} className="text-green-400" />
                            本週訓練趨勢
                        </h3>
                        <div className="h-32 flex items-end justify-between gap-2">
                            {[65, 72, 80, 75, 88, 92, completionRate].map((value, i) => (
                                <div key={i} className="flex-1 bg-gradient-to-t from-green-500/40 to-green-400/60 rounded-t-lg relative group"
                                    style={{ height: `${value}%` }}>
                                    <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                                        {value}%
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-between mt-2 text-xs text-glass-muted">
                            <span>週一</span>
                            <span>週二</span>
                            <span>週三</span>
                            <span>週四</span>
                            <span>週五</span>
                            <span>週六</span>
                            <span className="text-green-400 font-semibold">今天</span>
                        </div>
                    </div>

                    {/* Motivational Section */}
                    <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-[18px] p-6 mb-8 border border-green-400/20 text-center">
                        <div className="text-4xl mb-3">💬</div>
                        <p className="text-white text-xl font-semibold italic mb-2">
                            "{streak >= 7 ? '堅持一週，你已經超越了90%的人！' : '每一次訓練，都是對未來的投資'}"
                        </p>
                        <p className="text-glass-muted text-sm">繼續保持，你會看到改變</p>
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-2 gap-4">
                        <motion.button {...pressProps('pill')}
 onClick={() => {
 console.log('返回首頁按鈕被點擊');
 onClose();
 }}
 className="py-4 bg-white/10 hover:bg-white/15 text-white rounded-xl font-semibold border border-white/20 cursor-pointer flex items-center justify-center gap-2"
 >
                            <CheckCircle size={20} />
                            完成
                        </motion.button>
                        <motion.button {...pressProps('pill')}
 onClick={() => {
 console.log('分享成果');
 // Future: Trigger share dialog
 toast.info('分享功能即將推出');
 }}
 className="py-4 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-xl font-semibold shadow-lg shadow-green-500/30 cursor-pointer flex items-center justify-center gap-2"
 >
                            <Share2 size={20} />
                            分享成果
                        </motion.button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WorkoutCheckIn;
