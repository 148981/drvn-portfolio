import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { Calendar, Clock, Flame, Edit2, ChevronRight, Save, X, Activity, Trash2 } from 'lucide-react';
import apiClient from '../api/client';
import { getUserId } from '../utils/auth';
import { toast, confirmDialog } from '../utils/toast';
import { toLocalDateKey } from '../utils/localDate';
import { calcBMR_MifflinStJeor, calcTDEE } from '../utils/NutritionEngine';

// ─── Hoisted outside TrainingJournal (rerender-no-inline-components) ─────────
// EditModal had internal useState — defining it inside TrainingJournal caused
// React to remount it (lose input focus) on every parent re-render.
// Solution: hoist it out and pass onSave callback as prop.
const EditModal = ({ log, onClose, onSave }) => {
    const [cals, setCals] = useState(log.calories_burned || 0);
    const [duration, setDuration] = useState(log.duration_mins || 0);
    const [notes, setNotes] = useState(log.notes || '');

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in">
            <div className="glass-card w-full max-w-md p-6 space-y-4">
                <div className="flex justify-between items-center border-b border-white/10 pb-4">
                    <h3 className="text-xl font-bold text-white">編輯紀錄</h3>
                    <motion.button {...pressProps('row')} onClick={onClose}><X className="text-glass-muted hover:text-white" /></motion.button>
                </div>

                <div>
                    <label className="text-sm text-glass-muted mb-1 block">消耗卡路里 (Kcal)</label>
                    <input
                        type="number"
                        value={cals}
                        onChange={e => setCals(parseInt(e.target.value) || 0)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-glass-blue"
                    />
                </div>

                <div>
                    <label className="text-sm text-glass-muted mb-1 block">持續時間 (分鐘)</label>
                    <input
                        type="number"
                        value={duration}
                        onChange={e => setDuration(parseInt(e.target.value) || 0)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-glass-blue"
                    />
                </div>

                <div>
                    <label className="text-sm text-glass-muted mb-1 block">筆記 / 心得</label>
                    <textarea
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-glass-blue h-24 resize-none"
                        placeholder="今天的訓練感覺如何..."
                    />
                </div>

                <motion.button {...pressProps('cta')}
 onClick={() => onSave(log.session_id, { calories_burned: cals, duration_mins: duration, notes })}
 className="w-full py-3 bg-gradient-to-r from-glass-blue to-glass-purple rounded-xl text-white font-bold hover:shadow-lg"
 >
                    保存修改
                </motion.button>
            </div>
        </div>
    );
};

const TrainingJournal = ({ userId = getUserId(), onClose }) => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingLog, setEditingLog] = useState(null);
    const [dailyGoal, setDailyGoal] = useState(300); // 預設 300 kcal
    const [todayCalories, setTodayCalories] = useState(0);

    useEffect(() => {
        fetchLogs();
        calculateSmartDailyGoal();
    }, []);

    const fetchLogs = async () => {
        try {
            const response = await apiClient.get(`/api/history/logs/${userId}?limit=50`);
            const data = response.data.logs || [];
            setLogs(data);
            calculateTodayStats(data);
        } catch (error) {
            console.error("Error fetching logs:", error);
        } finally {
            setLoading(false);
        }
    };

    const calculateSmartDailyGoal = async () => {
        try {
            const response = await apiClient.get(`/api/user/profile/${userId}`);
            const profile = response.data;

            // 根據 InBody 數據計算每日建議消耗卡路里
            // 缺就是缺 —— 引擎會回 null，不在這裡自己編一組假的身體數據
            const weight = profile.weight ?? profile.inbody_data?.weight;
            const height = profile.height;
            const age = profile.age;
            const gender = profile.gender;
            const muscleMass = profile.inbody_data?.muscle_mass;
            const bodyFat = profile.inbody_data?.body_fat_percentage;

            // 使用 Mifflin-St Jeor 公式計算 BMR（基礎代謝率）
            let bmr = calcBMR_MifflinStJeor({ weight, height, age, gender });

            // 如果有肌肉量數據，進行微調（肌肉消耗更多卡路里）
            if (muscleMass) {
                const muscleFactor = muscleMass / weight;
                bmr *= (1 + (muscleFactor - 0.4) * 0.2); // 肌肉比例高的人代謝更快
            }

            // 活動係數：輕度活動 1.2-1.375
            const activityFactor = 1.3;
            const tdee = bmr * activityFactor;

            // 每日運動建議消耗：TDEE 的 15-20%
            let recommendedExerciseCalories;

            // 根據體脂率調整建議
            if (bodyFat) {
                if (bodyFat > 25) {
                    // 體脂高：建議更多消耗（減脂）
                    recommendedExerciseCalories = tdee * 0.25;
                } else if (bodyFat < 15) {
                    // 體脂低：適度消耗（維持）
                    recommendedExerciseCalories = tdee * 0.15;
                } else {
                    // 正常範圍
                    recommendedExerciseCalories = tdee * 0.20;
                }
            } else {
                recommendedExerciseCalories = tdee * 0.20;
            }

            const smartGoal = Math.round(recommendedExerciseCalories);
            setDailyGoal(smartGoal);

        } catch (error) {
            console.log('無法計算智能目標，使用預設值 300 kcal');
            setDailyGoal(300);
        }
    };

    const calculateTodayStats = (data) => {
        const today = toLocalDateKey(new Date());
        const todayLogs = data.filter(log => log.timestamp.startsWith(today));
        const totalCals = todayLogs.reduce((sum, log) => sum + (log.calories_burned || 0), 0);
        setTodayCalories(totalCals);
    };

    const handleUpdateLog = async (sessionId, updates) => {
        try {
            await apiClient.put(`/api/history/log/${sessionId}`, {
                user_id: userId,
                updates: updates
            });
            // Refresh logs
            fetchLogs();
            setEditingLog(null);
        } catch (error) {
            console.error("Error updating log:", error);
            toast.error("更新失敗，請檢查網路連線");
        }
    };

    const handleDeleteLog = async (sessionId, title) => {
        if (!(await confirmDialog(`確定要刪除「${title}」嗎？此操作無法復原。`, { danger: true }))) {
            return;
        }

        try {
            await apiClient.delete(`/api/history/log/${sessionId}?user_id=${userId}`);
            // Refresh logs
            fetchLogs();
        } catch (error) {
            console.error("Error deleting log:", error);
            toast.error("刪除失敗，請稍後再試");
        }
    };

    // EditModal is hoisted above this component — see top of file

    if (loading) return <div className="text-white text-center p-12">載入中...</div>;

    return (
        <div className="fixed inset-0 bg-black/95 z-50 overflow-y-auto animate-slide-up">
            <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
                {/* Header */}
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-white mb-1">訓練日記</h1>
                        <p className="text-glass-muted text-sm">追蹤你的每一次進步</p>
                    </div>
                    <motion.button {...pressProps('icon')}
 onClick={onClose}
 className="p-2 hover:bg-white/10 rounded-full transition-colors"
 >
                        <X className="text-white" size={28} />
                    </motion.button>
                </div>

                {/* Daily Goal Card */}
                <div className="glass-card p-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <Flame size={120} className="text-orange-500" />
                    </div>
                    <div className="relative z-10">
                        <div className="flex justify-between items-end mb-2">
                            <div>
                                <h3 className="text-lg font-bold text-white">今日消耗</h3>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-4xl font-bold text-orange-400">{todayCalories}</span>
                                    <span className="text-glass-muted">/ {dailyGoal} kcal</span>
                                </div>
                            </div>
                            <motion.button {...pressProps('row')}
 onClick={() => {
 const newGoal = prompt("設定每日卡路里目標:", dailyGoal);
 if (newGoal) setDailyGoal(parseInt(newGoal));
 }}
 className="text-xs text-glass-blue hover:underline"
 >
                                修改目標
                            </motion.button>
                        </div>
                        {/* Progress Bar */}
                        <div className="h-4 bg-white/10 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-1000 ease-out"
                                style={{ width: `${Math.min((todayCalories / dailyGoal) * 100, 100)}%` }}
                            />
                        </div>
                        <p className="text-xs text-glass-muted mt-2 text-right">
                            {todayCalories >= dailyGoal ? "🎉 目標達成！太強了！" : `加油！還差 ${dailyGoal - todayCalories} kcal`}
                        </p>
                        <div className="mt-3 p-2 bg-white/5 rounded-lg border-l-2 border-glass-blue">
                            <p className="text-xs text-white/70">
                                💡 <strong>智能目標</strong>：根據您的體重、身高、年齡、體脂率等 InBody 數據計算
                            </p>
                        </div>
                    </div>
                </div>

                {/* Logs List */}
                <div className="space-y-4">
                    <h3 className="text-xl font-bold text-white border-l-4 border-glass-blue pl-3">近期紀錄</h3>

                    {logs.length === 0 ? (
                        <div className="text-center py-12 text-glass-muted">
                            <Activity className="mx-auto mb-4 opacity-50" size={48} />
                            <p>尚無訓練紀錄，快去開始第一次訓練吧！</p>
                        </div>
                    ) : (
                        logs.map((log) => (
                            <div key={log.session_id} className="glass-card-light p-5 hover:bg-white/10 transition-all group">
                                <div className="flex flex-col md:flex-row justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="px-2 py-0.5 bg-glass-blue/20 text-glass-blue text-xs rounded-full">
                                                {log.type === 'custom' ? '自訂計劃' : 'AI 訓練'}
                                            </span>
                                            <span className="text-sm text-glass-muted">
                                                {new Date(log.timestamp).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <h4 className="text-lg font-bold text-white mb-2">{log.title || "訓練"}</h4>
                                        <div className="flex gap-4 text-sm">
                                            <div className="flex items-center gap-1 text-glass-muted">
                                                <Clock size={14} />
                                                <span>{log.duration_mins} 分鐘</span>
                                            </div>
                                            <div className="flex items-center gap-1 text-orange-400">
                                                <Flame size={14} />
                                                <span>{log.calories_burned} kcal</span>
                                            </div>
                                        </div>
                                        {log.notes && (
                                            <div className="mt-3 text-sm text-white/80 bg-black/20 p-3 rounded-lg border-l-2 border-glass-purple">
                                                "{log.notes}"
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <motion.button {...pressProps('row')}
 onClick={() => setEditingLog(log)}
 className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg flex items-center gap-2 text-sm transition-colors border border-white/10 group-hover:border-glass-blue/50"
 >
                                            <Edit2 size={16} />
                                            編輯
                                        </motion.button>
                                        <motion.button {...pressProps('row')}
 onClick={() => handleDeleteLog(log.session_id, log.title || "訓練")}
 className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg flex items-center gap-2 text-sm transition-colors border border-red-500/20 hover:border-red-500/50"
 >
                                            <Trash2 size={16} />
                                            刪除
                                        </motion.button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Edit Modal */}
            {editingLog && (
                <EditModal log={editingLog} onClose={() => setEditingLog(null)} onSave={handleUpdateLog} />
            )}
        </div>
    );
};

export default TrainingJournal;
