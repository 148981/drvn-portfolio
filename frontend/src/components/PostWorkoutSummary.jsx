import React, { useState, useEffect } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Flame, Target, TrendingUp, X, Check } from 'lucide-react';
import { useEventBus } from '../contexts/EventBusContext';
import { sessionVolume, exerciseVolume } from '../utils/strengthMath';

const PostWorkoutSummary = ({ isOpen, onClose, workoutData, onSave }) => {
    const [prAlerts, setPrAlerts] = useState([]);
    const [saving, setSaving] = useState(false);
    const { emit, EventTypes } = useEventBus();

    useEffect(() => {
        if (workoutData) {
            checkForPRs(workoutData);
        }
    }, [workoutData]);

    const checkForPRs = (data) => {
        // Check if any exercises have new PRs
        const prs = data.exercises?.filter(ex => ex.isNewPR) || [];
        setPrAlerts(prs);
    };

    const calculateTotalVolume = () => {
        if (!workoutData?.exercises) return 0;
        return sessionVolume({ exercises: workoutData.exercises });
    };

    const estimateCalories = () => {
        // Rough estimation: 5 calories per kg of volume
        const volume = calculateTotalVolume();
        return Math.round(volume * 0.005);
    };

    const calculateGoalCompletion = () => {
        if (!workoutData?.plannedSets || !workoutData?.completedSets) return 0;
        return Math.round((workoutData.completedSets / workoutData.plannedSets) * 100);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave(workoutData);

            // Emit events for automatic synchronization
            emit(EventTypes.WORKOUT_SAVED, {
                workoutData,
                totalVolume: calculateTotalVolume(),
                timestamp: new Date().toISOString()
            });

            if (prAlerts.length > 0) {
                emit(EventTypes.PR_ACHIEVED, {
                    prAlerts,
                    timestamp: new Date().toISOString()
                });
            }

            setTimeout(() => {
                onClose();
            }, 1000);
        } catch (error) {
            console.error('Failed to save workout:', error);
        } finally {
            setSaving(false);
        }
    };

    const totalVolume = calculateTotalVolume();
    const calories = estimateCalories();
    const goalCompletion = calculateGoalCompletion();

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.9, y: 20 }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-lg bg-gradient-to-br from-[#161415]/95 to-[#262523]/95 rounded-3xl border border-white/10 overflow-hidden relative"
                        style={{ backdropFilter: 'blur(20px)' }}
                    >
                        {/* Close Button */}
                        <motion.button {...pressProps('icon')} aria-label="關閉"
 onClick={onClose}
 className="absolute top-4 right-4 p-2 bg-white/5 hover:bg-white/10 rounded-full z-10"
 >
                            <X size={20} className="text-white/70" />
                        </motion.button>

                        {/* Content */}
                        <div className="p-8">
                            {/* Header */}
                            <div className="text-center mb-8">
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ delay: 0.2, type: "spring" }}
                                    className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4"
                                >
                                    <Check size={40} className="text-white" />
                                </motion.div>
                                <h2 className="text-3xl font-bold text-white mb-2">訓練完成！</h2>
                                <p className="text-zinc-400 text-sm">太棒了！繼續保持 🔥</p>
                            </div>

                            {/* PR Alerts */}
                            {prAlerts.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3 }}
                                    className="mb-6 space-y-3"
                                >
                                    <h3 className="text-sm font-semibold text-amber-400 mb-2 flex items-center gap-2">
                                        <Trophy size={16} />
                                        新紀錄突破！
                                    </h3>
                                    {prAlerts.map((pr, index) => (
                                        <motion.div
                                            key={index}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.4 + index * 0.1 }}
                                            className="flex items-center justify-between p-4 bg-gradient-to-r from-amber-500/10 to-amber-600/10 border border-amber-500/30 rounded-xl relative overflow-hidden"
                                        >
                                            {/* Shimmer Effect */}
                                            <motion.div
                                                className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-400/20 to-transparent"
                                                animate={{
                                                    x: ['-100%', '100%']
                                                }}
                                                transition={{
                                                    duration: 2,
                                                    repeat: Infinity,
                                                    repeatDelay: 1
                                                }}
                                            />

                                            <div className="relative z-10">
                                                <p className="text-white font-medium">{pr.name}</p>
                                                <p className="text-sm text-zinc-400">
                                                    {pr.oldPR} kg → <span className="text-amber-400 font-bold">{pr.newPR} kg</span>
                                                </p>
                                            </div>
                                            <Trophy size={24} className="text-amber-400 relative z-10" />
                                        </motion.div>
                                    ))}
                                </motion.div>
                            )}

                            {/* Stats Grid */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.5 }}
                                className="grid grid-cols-2 gap-4 mb-6"
                            >
                                {/* Training Volume */}
                                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <TrendingUp size={16} className="text-blue-400" />
                                        <span className="text-xs text-zinc-400">訓練容量</span>
                                    </div>
                                    <p className="text-2xl font-bold text-white">{totalVolume.toLocaleString()}</p>
                                    <p className="text-xs text-zinc-500">kg</p>
                                </div>

                                {/* Calories */}
                                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Flame size={16} className="text-orange-400" />
                                        <span className="text-xs text-zinc-400">消耗熱量</span>
                                    </div>
                                    <p className="text-2xl font-bold text-white">{calories}</p>
                                    <p className="text-xs text-zinc-500">kcal</p>
                                </div>
                            </motion.div>

                            {/* Goal Completion */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.6 }}
                                className="mb-6"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm text-zinc-400">訓練目標完成</span>
                                    <span className="text-lg font-bold text-white">{goalCompletion}%</span>
                                </div>
                                <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${goalCompletion}%` }}
                                        transition={{ duration: 1, delay: 0.7 }}
                                        className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full"
                                    />
                                </div>
                            </motion.div>

                            {/* Save Button */}
                            <motion.button
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.7 }}
                                onClick={handleSave}
                                disabled={saving}
                                className="w-full py-4 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 
                                    text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed
                                    shadow-lg shadow-emerald-500/20"
                            >
                                {saving ? '保存中...' : '保存並同步數據'}
                            </motion.button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default PostWorkoutSummary;
