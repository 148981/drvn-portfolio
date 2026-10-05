import React, { useState, useEffect } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, TrendingUp, Calendar, ChevronRight, Flame, Edit2, Trash2, X, BarChart3 } from 'lucide-react';
import apiClient from '../api/client';
import WorkoutStatsChart from './WorkoutStatsChart';
import WorkoutDashboardCards from './WorkoutDashboardCards';
import { toast } from '../utils/toast';

const TrainingLogView = ({ userId, onWorkoutClick }) => {
    const [workoutHistory, setWorkoutHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedWorkout, setSelectedWorkout] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null); // workout to delete
    const [editingWorkout, setEditingWorkout] = useState(null); // workout being edited
    const [editForm, setEditForm] = useState({}); // form data for editing
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'chart'

    useEffect(() => {
        if (userId) {
            fetchWorkoutHistory();
        }
    }, [userId]);

    const fetchWorkoutHistory = async () => {
        try {
            const response = await apiClient.get(`/api/workout/history/${userId}`);
            setWorkoutHistory(response.data.history || []);
        } catch (error) {
            console.error('Failed to fetch workout history:', error);
            // Use demo data if API fails
            setWorkoutHistory(getDemoData());
        } finally {
            setLoading(false);
        }
    };

    const getDemoData = () => {
        return [
            {
                id: 1,
                date: '2025-12-27',
                focusGroup: '胸部',
                volume: 1250,
                fatigue: 20,
                bodyWeight: 70,
                bodyFat: 17.0,
                hasPR: true,
                prExercise: 'Bench Press',
                completedSets: 12,
                duration: 65
            },
            {
                id: 2,
                date: '2025-12-26',
                focusGroup: '腿部',
                volume: 1580,
                fatigue: 35,
                bodyWeight: 70.2,
                bodyFat: 17.2,
                hasPR: false,
                completedSets: 15,
                duration: 72
            },
            {
                id: 3,
                date: '2025-12-24',
                focusGroup: '背部',
                volume: 1120,
                fatigue: 18,
                bodyWeight: 70.5,
                bodyFat: 17.5,
                hasPR: false,
                completedSets: 10,
                duration: 55
            }
        ];
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return 'N/A';
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return 'N/A';
            const month = date.getMonth() + 1;
            const day = date.getDate();
            return `${month}/${day}`;
        } catch (e) {
            return 'N/A';
        }
    };

    const getFocusColor = (focusGroup) => {
        const colors = {
            '胸部': 'from-blue-500/20 to-blue-600/20 border-blue-500/30',
            '腿部': 'from-red-500/20 to-red-600/20 border-red-500/30',
            '背部': 'from-green-500/20 to-green-600/20 border-green-500/30',
            '肩部': 'from-purple-500/20 to-purple-600/20 border-purple-500/30',
            '手臂': 'from-orange-500/20 to-orange-600/20 border-orange-500/30'
        };
        return colors[focusGroup] || 'from-zinc-500/20 to-zinc-600/20 border-zinc-500/30';
    };

    const handleWorkoutClick = (workout) => {
        setSelectedWorkout(workout);
        if (onWorkoutClick) {
            onWorkoutClick(workout);
        }
    };

    const handleDeleteWorkout = async (workoutId) => {
        try {
            // Use session_id as fallback if id is not available
            const id = workoutId || deleteConfirm?.session_id || deleteConfirm?.id;

            if (!id) {
                console.error('No workout ID found:', deleteConfirm);
                toast.error('無法刪除：找不到訓練記錄ID');
                return;
            }

            await apiClient.delete(`/api/workout/history/${userId}/${id}`);
            // Refresh history
            await fetchWorkoutHistory();
            setDeleteConfirm(null);
        } catch (error) {
            console.error('Failed to delete workout:', error);
            toast.error('刪除失敗：' + (error.response?.data?.error || error.message));
        }
    };

    const handleEditWorkout = (workout) => {
        // Ensure workout has a valid ID
        const workoutId = workout.id || workout.session_id;
        if (!workoutId) {
            console.error('No workout ID found:', workout);
            toast.error('無法編輯：找不到訓練記錄ID');
            return;
        }

        setEditingWorkout(workout);
        setEditForm({ ...workout, id: workoutId }); // Ensure id is in the form
    };

    const handleSaveEdit = async () => {
        try {
            const id = editForm.id || editForm.session_id;

            if (!id) {
                console.error('No workout ID in form:', editForm);
                toast.error('無法保存：找不到訓練記錄ID');
                return;
            }

            await apiClient.put(`/api/workout/history/${userId}/${id}`, editForm);
            // Refresh history
            await fetchWorkoutHistory();
            setEditingWorkout(null);
            setEditForm({});
        } catch (error) {
            console.error('Failed to update workout:', error);
            toast.error('更新失敗：' + (error.response?.data?.error || error.message));
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-zinc-400">載入訓練記錄...</div>
            </div>
        );
    }

    if (workoutHistory.length === 0) {
        return (
            <div className="text-center py-12">
                <Calendar size={48} className="text-zinc-600 mx-auto mb-4" />
                <p className="text-zinc-400">還沒有訓練記錄</p>
                <p className="text-zinc-600 text-sm mt-2">完成第一次訓練後，記錄會顯示在這裡</p>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto px-4 py-6">
            {/* Header */}
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-white mb-2">訓練日誌</h2>
                <p className="text-zinc-400 text-sm">查看您的訓練歷史與成長軌跡</p>

                {/* View Mode Toggle */}
                <div className="flex gap-2 mt-4">
                    <motion.button {...pressProps('row')}
 onClick={() => setViewMode('list')}
 className={`flex items-center gap-2 px-4 py-2 rounded-xl ${viewMode === 'list'
 ? 'bg-blue-500 text-white'
 : 'bg-white/5 text-zinc-400 hover:bg-white/10'
 }`}
 >
                        <Calendar size={16} />
                        記錄列表
                    </motion.button>
                    <motion.button {...pressProps('row')}
 onClick={() => setViewMode('chart')}
 className={`flex items-center gap-2 px-4 py-2 rounded-xl ${viewMode === 'chart'
 ? 'bg-blue-500 text-white'
 : 'bg-white/5 text-zinc-400 hover:bg-white/10'
 }`}
 >
                        <BarChart3 size={16} />
                        數據圖表
                    </motion.button>
                </div>
            </div>

            {/* Chart View */}
            {viewMode === 'chart' && (
                <div>
                    {/* Dashboard Cards */}
                    <WorkoutDashboardCards workoutHistory={workoutHistory} />

                    {/* Stats Charts */}
                    <WorkoutStatsChart workoutHistory={workoutHistory} />
                </div>
            )}

            {/* Timeline Container */}
            {viewMode === 'list' && (
                <div className="relative">
                    {/* Vertical Timeline Line */}
                    <div className="absolute left-[50px] top-0 bottom-0 w-[2px] bg-gradient-to-b from-zinc-700 via-zinc-600 to-zinc-700" />

                    {/* Workout Cards */}
                    <div className="space-y-6">
                        {workoutHistory.map((workout, index) => (
                            <motion.div
                                key={workout.id || workout.session_id || `workout-${index}`}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: Math.min(index, 6) * 0.1 }}
                                className="relative"
                            >
                                {/* Timeline Marker */}
                                <div className="absolute left-[42px] top-6 w-4 h-4 bg-emerald-500 rounded-full border-4 border-[#0A0A0A] z-10" />

                                {/* Workout Card */}
                                <div className="ml-20">
                                    <motion.div
                                        whileHover={{ x: 4 }}
                                        onClick={() => handleWorkoutClick(workout)}
                                        className={`bg-gradient-to-br ${getFocusColor(workout.focusGroup)} 
                                        rounded-[18px] p-6 border cursor-pointer transition-all hover:shadow-lg relative overflow-hidden group`}
                                    >
                                        {/* Date Badge */}
                                        <div className="absolute top-4 right-4 flex items-center gap-2">
                                            <span className="px-3 py-1 bg-black/30 rounded-lg text-xs text-white font-medium">
                                                {formatDate(workout.timestamp || workout.date)}
                                            </span>

                                            {/* Action Buttons */}
                                            <motion.button {...pressProps('row')}
 onClick={(e) => {
 e.stopPropagation();
 handleEditWorkout(workout);
 }}
 className="p-2 bg-blue-500/20 hover:bg-blue-500/30 rounded-lg"
 title="編輯"
 >
                                                <Edit2 size={14} className="text-blue-400" />
                                            </motion.button>
                                            <motion.button {...pressProps('row')}
 onClick={(e) => {
 e.stopPropagation();
 setDeleteConfirm(workout);
 }}
 className="p-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg"
 title="刪除"
 >
                                                <Trash2 size={14} className="text-red-400" />
                                            </motion.button>
                                        </div>

                                        {/* PR Badge */}
                                        {workout.hasPR && (
                                            <motion.div
                                                animate={{
                                                    scale: [1, 1.1, 1],
                                                }}
                                                transition={{
                                                    duration: 2,
                                                    repeat: Infinity,
                                                }}
                                                className="absolute top-4 left-4"
                                            >
                                                <Trophy size={24} className="text-amber-400" fill="currentColor" />
                                            </motion.div>
                                        )}

                                        {/* Content */}
                                        <div className="mt-8">
                                            <h3 className="text-xl font-bold text-white mb-3">{workout.focus_group || workout.focusGroup || workout.focus || workout.title || '訓練'}</h3>

                                            {/* Quick Stats Grid */}
                                            <div className="grid grid-cols-3 gap-4 mb-4">
                                                <div>
                                                    <p className="text-xs text-zinc-400 mb-1">訓練容量</p>
                                                    <p className="text-lg font-bold text-white">{workout.total_volume || workout.volume || 0} <span className="text-xs text-zinc-400">kg</span></p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-zinc-400 mb-1">組數</p>
                                                    <p className="text-lg font-bold text-white">{workout.completed_sets_count || workout.completedSets || workout.reps_count || 0} <span className="text-xs text-zinc-400">組</span></p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-zinc-400 mb-1">時長</p>
                                                    <p className="text-lg font-bold text-white">{workout.duration_mins || workout.duration || 0} <span className="text-xs text-zinc-400">分</span></p>
                                                </div>
                                            </div>

                                            {/* Body State */}
                                            <div className="flex items-center gap-4 p-3 bg-black/20 rounded-lg">
                                                <div className="flex items-center gap-2">
                                                    <TrendingUp size={14} className="text-blue-400" />
                                                    <span className="text-sm text-white">體重: {workout.body_weight || workout.bodyWeight || workout.user_profile_snapshot?.weight_kg || 'N/A'} kg</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Flame size={14} className="text-orange-400" />
                                                    <span className="text-sm text-white">體脂: {workout.body_fat || workout.bodyFat || workout.user_profile_snapshot?.body_fat_percent || 'N/A'}%</span>
                                                </div>
                                            </div>

                                            {/* Fatigue Indicator */}
                                            <div className="mt-3">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-xs text-zinc-400">疲勞度</span>
                                                    <span className="text-xs text-white font-medium">{workout.fatigue_level || workout.fatigue || 0}%</span>
                                                </div>
                                                <div className="w-full h-1.5 bg-black/30 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full ${(workout.fatigue_level || workout.fatigue || 0) < 30 ? 'bg-emerald-500' :
                                                            (workout.fatigue_level || workout.fatigue || 0) < 60 ? 'bg-yellow-500' : 'bg-red-500'
                                                            }`}
                                                        style={{ width: `${workout.fatigue_level || workout.fatigue || 0}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* View Details Arrow */}
                                        <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <ChevronRight size={20} className="text-white/70" />
                                        </div>
                                    </motion.div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            )}

            {/* Summary Stats */}
            {viewMode === 'list' && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="mt-8 grid grid-cols-3 gap-4"
                >
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                        <p className="text-2xl font-bold text-white">{workoutHistory.length}</p>
                        <p className="text-xs text-zinc-400 mt-1">總訓練次數</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                        <p className="text-2xl font-bold text-white">
                            {workoutHistory.reduce((sum, w) => sum + (w.total_volume || w.volume || 0), 0).toLocaleString()}
                        </p>
                        <p className="text-xs text-zinc-400 mt-1">累積容量 (kg)</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                        <p className="text-2xl font-bold text-amber-400">
                            {workoutHistory.filter(w => w.hasPR).length}
                        </p>
                        <p className="text-xs text-zinc-400 mt-1">PR 突破次數</p>
                    </div>
                </motion.div>
            )}

            {/* Edit Workout Modal */}
            <AnimatePresence>
                {editingWorkout && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
                        onClick={() => {
                            setEditingWorkout(null);
                            setEditForm({});
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-[#161415] rounded-[18px] max-w-2xl w-full p-6 shadow-2xl border border-blue-500/30 my-8"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-bold text-white">編輯訓練記錄</h3>
                                <motion.button {...pressProps('row')}
 onClick={() => {
 setEditingWorkout(null);
 setEditForm({});
 }}
 className="text-zinc-400 hover:text-white transition-colors"
 >
                                    <X size={24} />
                                </motion.button>
                            </div>

                            <div className="space-y-4">
                                {/* Date */}
                                <div>
                                    <label className="block text-sm text-zinc-400 mb-2">訓練日期</label>
                                    <input
                                        type="date"
                                        value={editForm.date || ''}
                                        onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                                        className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500/50"
                                    />
                                </div>

                                {/* Focus Group */}
                                <div>
                                    <label className="block text-sm text-zinc-400 mb-2">訓練部位</label>
                                    <select
                                        value={editForm.focusGroup || ''}
                                        onChange={(e) => setEditForm({ ...editForm, focusGroup: e.target.value })}
                                        className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500/50"
                                    >
                                        <option value="胸部">胸部</option>
                                        <option value="背部">背部</option>
                                        <option value="腿部">腿部</option>
                                        <option value="肩部">肩部</option>
                                        <option value="手臂">手臂</option>
                                    </select>
                                </div>

                                {/* Volume & Sets in one row */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-zinc-400 mb-2">訓練容量 (kg)</label>
                                        <input
                                            type="number"
                                            value={editForm.volume || ''}
                                            onChange={(e) => setEditForm({ ...editForm, volume: Number(e.target.value) })}
                                            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500/50"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-zinc-400 mb-2">完成組數</label>
                                        <input
                                            type="number"
                                            value={editForm.completedSets || ''}
                                            onChange={(e) => setEditForm({ ...editForm, completedSets: Number(e.target.value) })}
                                            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500/50"
                                        />
                                    </div>
                                </div>

                                {/* Duration */}
                                <div>
                                    <label className="block text-sm text-zinc-400 mb-2">訓練時長 (分鐘)</label>
                                    <input
                                        type="number"
                                        value={editForm.duration || ''}
                                        onChange={(e) => setEditForm({ ...editForm, duration: Number(e.target.value) })}
                                        className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500/50"
                                    />
                                </div>

                                {/* Info Box */}
                                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                                    <p className="text-xs text-blue-200">
                                        💡 <strong>提示：</strong>疲勞度、體重、體脂率和PR突破會在訓練時自動記錄，無需手動編輯。
                                    </p>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-3 mt-6 pt-6 border-t border-white/10">
                                <motion.button {...pressProps('cta')}
 onClick={() => {
 setEditingWorkout(null);
 setEditForm({});
 }}
 className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl"
 >
                                    取消
                                </motion.button>
                                <motion.button {...pressProps('cta')}
 onClick={handleSaveEdit}
 className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold"
 >
                                    保存更改
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence >

            {/* Delete Confirmation Modal */}
            < AnimatePresence >
                {deleteConfirm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                        onClick={() => setDeleteConfirm(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-[#161415] rounded-[18px] max-w-md w-full p-6 shadow-2xl border border-red-500/30"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xl font-bold text-white">確認刪除</h3>
                                <motion.button {...pressProps('row')}
 onClick={() => setDeleteConfirm(null)}
 className="text-zinc-400 hover:text-white transition-colors"
 >
                                    <X size={24} />
                                </motion.button>
                            </div>

                            <p className="text-zinc-300 mb-2">
                                確定要刪除這次訓練記錄嗎？
                            </p>
                            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-6">
                                <p className="text-sm text-red-200">
                                    <strong>{deleteConfirm.focus_group || deleteConfirm.focusGroup || '訓練'}</strong> - {formatDate(deleteConfirm.timestamp || deleteConfirm.date)}
                                </p>
                                <p className="text-xs text-red-300 mt-1">
                                    容量: {deleteConfirm.volume} kg · {deleteConfirm.completedSets} 組 · {deleteConfirm.duration} 分鐘
                                </p>
                            </div>

                            <div className="flex gap-3">
                                <motion.button {...pressProps('cta')}
 onClick={() => setDeleteConfirm(null)}
 className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl"
 >
                                    取消
                                </motion.button>
                                <motion.button {...pressProps('cta')}
 onClick={() => handleDeleteWorkout(deleteConfirm.id)}
 className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold"
 >
                                    確定刪除
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence >
        </div >
    );
};

export default TrainingLogView;
