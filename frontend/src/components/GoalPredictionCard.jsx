import React, { useState } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion } from 'framer-motion';
import { Target, TrendingUp, Calendar, Award, AlertCircle, Loader } from 'lucide-react';

const GoalPredictionCard = ({ userId }) => {
    const [goalType, setGoalType] = useState('body_fat');
    const [targetValue, setTargetValue] = useState('');
    const [exerciseName, setExerciseName] = useState('');
    const [prediction, setPrediction] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const goalTypes = [
        { value: 'body_fat', label: '體脂率 (%)', icon: '📊', placeholder: '15.0' },
        { value: 'muscle_mass', label: '肌肉量 (kg)', icon: '💪', placeholder: '35.0' },
        { value: 'pr_weight', label: 'PR重量 (kg)', icon: '🏋️', placeholder: '100.0' }
    ];

    // Common strength training exercises
    const commonExercises = [
        { name: '深蹲', category: '腿部' },
        { name: '臥推', category: '胸部' },
        { name: '硬舉', category: '背部' },
        { name: '肩推', category: '肩部' },
        { name: '引體向上', category: '背部' },
        { name: '槓鈴划船', category: '背部' },
        { name: '啞鈴臥推', category: '胸部' },
        { name: '腿推', category: '腿部' },
        { name: '弓箭步', category: '腿部' },
        { name: '二頭彎舉', category: '手臂' },
        { name: '三頭下壓', category: '手臂' },
        { name: '側平舉', category: '肩部' },
        { name: '前平舉', category: '肩部' },
        { name: '羅馬尼亞硬舉', category: '背部' },
        { name: '保加利亞分腿蹲', category: '腿部' }
    ];

    const handlePredict = async () => {
        if (!targetValue) {
            setError('請輸入目標數值');
            return;
        }

        if (goalType === 'pr_weight' && !exerciseName) {
            setError('請選擇動作');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const formData = new FormData();
            formData.append('user_id', userId);
            formData.append('goal_type', goalType);
            formData.append('target_value', parseFloat(targetValue));
            if (goalType === 'pr_weight' && exerciseName) {
                formData.append('exercise_name', exerciseName);
            }

            const response = await fetch(`http://${window.location.hostname}:8000/api/analysis/predict-goal`, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            setPrediction(data);
        } catch (err) {
            console.error('Prediction error:', err);
            setError('預測失敗，請稍後再試');
        } finally {
            setIsLoading(false);
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'prediction_available':
                return 'from-emerald-500/20 to-green-500/20 border-emerald-500/50';
            case 'already_achieved':
                return 'from-amber-500/20 to-yellow-500/20 border-amber-500/50';
            case 'no_progress':
                return 'from-orange-500/20 to-red-500/20 border-orange-500/50';
            case 'insufficient_data':
                return 'from-blue-500/20 to-cyan-500/20 border-blue-500/50';
            default:
                return 'from-zinc-500/20 to-gray-500/20 border-zinc-500/50';
        }
    };

    const renderPredictionResult = () => {
        if (!prediction) return null;

        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mt-6 bg-gradient-to-br ${getStatusColor(prediction.status)} backdrop-blur-xl rounded-[18px] border p-6`}
            >
                {/* Message */}
                <p className="text-white text-lg font-medium mb-4">
                    {prediction.message}
                </p>

                {/* Status Details */}
                {prediction.status === 'prediction_available' && (
                    <div className="space-y-3">
                        {/* Timeline */}
                        <div className="flex items-center gap-3">
                            <Calendar size={18} className="text-emerald-400" />
                            <div className="flex-1">
                                <div className="text-xs text-zinc-400">預計達成日期</div>
                                <div className="text-white font-semibold">{prediction.estimated_date}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs text-zinc-400">剩餘天數</div>
                                <div className="text-white font-bold text-xl">{prediction.estimated_days}</div>
                            </div>
                        </div>

                        {/* Progress Rate */}
                        <div className="flex items-center gap-3">
                            <TrendingUp size={18} className="text-emerald-400" />
                            <div className="flex-1">
                                <div className="text-xs text-zinc-400">
                                    {goalType === 'pr_weight' ? '每週進步' : '每日進步'}
                                </div>
                                <div className="text-white font-semibold">
                                    {prediction.weekly_progress_rate || prediction.daily_progress_rate}{' '}
                                    {goalType === 'body_fat' ? '%' : 'kg'}
                                </div>
                            </div>
                        </div>

                        {/* Confidence */}
                        <div className="flex items-center gap-3">
                            <Award size={18} className="text-emerald-400" />
                            <div className="flex-1">
                                <div className="text-xs text-zinc-400">預測信心度</div>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${prediction.confidence * 100}%` }}
                                            transition={{ duration: 1, ease: 'easeOut' }}
                                            className="h-full bg-gradient-to-r from-emerald-500 to-green-400"
                                        />
                                    </div>
                                    <span className="text-white font-semibold min-w-[50px]">
                                        {Math.round(prediction.confidence * 100)}%
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Current vs Target */}
                        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/10">
                            <div>
                                <div className="text-xs text-zinc-400 mb-1">當前數值</div>
                                <div className="text-white text-2xl font-bold">
                                    {prediction.current_value}
                                    <span className="text-sm font-normal ml-1">
                                        {goalType === 'body_fat' ? '%' : 'kg'}
                                    </span>
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-zinc-400 mb-1">目標數值</div>
                                <div className="text-emerald-400 text-2xl font-bold">
                                    {prediction.target_value}
                                    <span className="text-sm font-normal ml-1">
                                        {goalType === 'body_fat' ? '%' : 'kg'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Recommendation */}
                        {prediction.recommendation && (
                            <div className="mt-4 p-3 bg-white/5 rounded-xl">
                                <div className="text-xs text-zinc-400 mb-1">💡 建議</div>
                                <p className="text-white/90 text-sm">{prediction.recommendation}</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Insufficient Data */}
                {prediction.status === 'insufficient_data' && (
                    <div className="flex items-start gap-3 text-blue-200">
                        <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm">
                                {prediction.current_measurements !== undefined &&
                                    `已有 ${prediction.current_measurements} 筆記錄`
                                }
                            </p>
                        </div>
                    </div>
                )}

                {/* Already Achieved */}
                {prediction.status === 'already_achieved' && (
                    <div className="text-center py-4">
                        <div className="text-6xl mb-3">🎉</div>
                        <p className="text-white/80 text-sm">
                            當前：{prediction.current_value} / 目標：{prediction.target_value}
                        </p>
                    </div>
                )}

                {/* No Progress */}
                {prediction.status === 'no_progress' && prediction.recommendation && (
                    <div className="mt-3 p-3 bg-orange-500/10 rounded-xl border border-orange-500/30">
                        <p className="text-orange-200 text-sm">{prediction.recommendation}</p>
                    </div>
                )}
            </motion.div>
        );
    };

    return (
        <div className="bg-gradient-to-br from-zinc-900/50 to-black/50 backdrop-blur-xl rounded-3xl border border-white/10 p-6 shadow-2xl">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-500 rounded-[18px] flex items-center justify-center">
                    <Target size={24} className="text-white" />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-white">目標預測</h3>
                    <p className="text-xs text-zinc-400">AI 分析你的進步速度</p>
                </div>
            </div>

            {/* Goal Type Selection */}
            <div className="mb-4">
                <label className="text-sm text-zinc-400 mb-2 block">目標類型</label>
                <div className="grid grid-cols-3 gap-2">
                    {goalTypes.map((type) => (
                        <motion.button {...pressProps('row')}
 key={type.value}
 onClick={() => {
 setGoalType(type.value);
 setPrediction(null);
 setError(null);
 }}
 className={`p-3 rounded-xl border ${goalType === type.value
 ? 'bg-purple-500/20 border-purple-500/50 text-white'
 : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
 }`}
 >
                            <div className="text-2xl mb-1">{type.icon}</div>
                            <div className="text-xs font-medium">{type.label}</div>
                        </motion.button>
                    ))}
                </div>
            </div>

            {/* Exercise Name (for PR weight only) */}
            {goalType === 'pr_weight' && (
                <div className="mb-4">
                    <label className="text-sm text-zinc-400 mb-2 block">選擇動作</label>
                    <select
                        value={exerciseName}
                        onChange={(e) => setExerciseName(e.target.value)}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500/50 transition-colors appearance-none cursor-pointer"
                        style={{
                            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='white'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'right 1rem center',
                            backgroundSize: '1.5em 1.5em',
                            paddingRight: '3rem'
                        }}
                    >
                        <option value="" className="bg-zinc-900">請選擇動作...</option>

                        {/* Group by category */}
                        <optgroup label="腿部" className="bg-zinc-900">
                            {commonExercises.filter(ex => ex.category === '腿部').map(ex => (
                                <option key={ex.name} value={ex.name} className="bg-zinc-900">{ex.name}</option>
                            ))}
                        </optgroup>

                        <optgroup label="胸部" className="bg-zinc-900">
                            {commonExercises.filter(ex => ex.category === '胸部').map(ex => (
                                <option key={ex.name} value={ex.name} className="bg-zinc-900">{ex.name}</option>
                            ))}
                        </optgroup>

                        <optgroup label="背部" className="bg-zinc-900">
                            {commonExercises.filter(ex => ex.category === '背部').map(ex => (
                                <option key={ex.name} value={ex.name} className="bg-zinc-900">{ex.name}</option>
                            ))}
                        </optgroup>

                        <optgroup label="肩部" className="bg-zinc-900">
                            {commonExercises.filter(ex => ex.category === '肩部').map(ex => (
                                <option key={ex.name} value={ex.name} className="bg-zinc-900">{ex.name}</option>
                            ))}
                        </optgroup>

                        <optgroup label="手臂" className="bg-zinc-900">
                            {commonExercises.filter(ex => ex.category === '手臂').map(ex => (
                                <option key={ex.name} value={ex.name} className="bg-zinc-900">{ex.name}</option>
                            ))}
                        </optgroup>
                    </select>
                </div>
            )}

            {/* Target Value Input */}
            <div className="mb-4">
                <label className="text-sm text-zinc-400 mb-2 block">目標數值</label>
                <input
                    type="number"
                    step="0.1"
                    value={targetValue}
                    onChange={(e) => setTargetValue(e.target.value)}
                    placeholder={goalTypes.find(t => t.value === goalType)?.placeholder}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500/50 transition-colors"
                />
            </div>

            {/* Error Message */}
            {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-200 text-sm">
                    {error}
                </div>
            )}

            {/* Predict Button */}
            <motion.button {...pressProps('cta')}
 onClick={handlePredict}
 disabled={isLoading}
 className="w-full py-3 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white font-semibold flex items-center justify-center gap-2"
 >
                {isLoading ? (
                    <>
                        <Loader size={18} className="animate-spin" />
                        分析中...
                    </>
                ) : (
                    <>
                        <Target size={18} />
                        開始預測
                    </>
                )}
            </motion.button>

            {/* Prediction Result */}
            {renderPredictionResult()}
        </div>
    );
};

export default GoalPredictionCard;
