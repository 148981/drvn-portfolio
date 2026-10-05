import React, { useState } from 'react';
import { Trophy, TrendingUp, Flame, Target, Award, Calendar } from 'lucide-react';
import apiClient from '../api/client';

const PRTracker = ({ userId }) => {
    const [selectedExercise, setSelectedExercise] = useState(null);
    const [prRecords, setPrRecords] = useState({});
    const [showNewPR, setShowNewPR] = useState(false);

    // Common exercises with PR tracking
    const exercises = [
        { id: 'squat', name: '深蹲', icon: '🏋️', unit: 'kg' },
        { id: 'bench', name: '臥推', icon: '💪', unit: 'kg' },
        { id: 'deadlift', name: '硬舉', icon: '🔥', unit: 'kg' },
        { id: 'shoulder_press', name: '肩推', icon: '💥', unit: 'kg' },
        { id: 'pull_up', name: '引體向上', icon: '⬆️', unit: '次' },
    ];

    const savePR = async (exerciseId, weight, reps) => {
        try {
            const response = await apiClient.post('/api/pr/save', {
                user_id: userId,
                exercise_id: exerciseId,
                weight,
                reps,
                date: new Date().toISOString()
            });

            if (response.data.is_new_pr) {
                setShowNewPR(true);
                setTimeout(() => setShowNewPR(false), 3000);
            }

            // Refresh PR data
            fetchPRData();
        } catch (error) {
            console.error('Error saving PR:', error);
        }
    };

    const fetchPRData = async () => {
        try {
            const response = await apiClient.get(`/api/pr/${userId}/records`);
            setPrRecords(response.data);
        } catch (error) {
            console.error('Error fetching PR data:', error);
        }
    };

    React.useEffect(() => {
        fetchPRData();
    }, [userId]);

    return (
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-[18px] p-6 border border-white/10">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
                        <Trophy className="text-yellow-400" size={28} />
                        個人紀錄 (PR)
                    </h2>
                    <p className="text-glass-muted text-sm">追蹤你的最強時刻</p>
                </div>
            </div>

            {/* Exercise Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {exercises.map(exercise => {
                    const pr = prRecords[exercise.id];

                    return (
                        <div
                            key={exercise.id}
                            onClick={() => setSelectedExercise(exercise)}
                            className="bg-white/5 rounded-xl p-5 border border-white/10 hover:bg-white/10 hover:border-yellow-400/30 transition-all cursor-pointer group"
                        >
                            {/* Exercise Header */}
                            <div className="flex items-center gap-3 mb-4">
                                <div className="text-4xl">{exercise.icon}</div>
                                <div className="flex-1">
                                    <h3 className="text-lg font-bold text-white">{exercise.name}</h3>
                                    <p className="text-xs text-glass-muted">Personal Record</p>
                                </div>
                            </div>

                            {/* Current PR */}
                            {pr ? (
                                <>
                                    <div className="bg-gradient-to-r from-yellow-500/10 to-amber-500/10 rounded-lg p-4 border border-yellow-400/20 mb-3">
                                        <div className="flex items-baseline gap-2 mb-1">
                                            <span className="text-4xl font-bold text-yellow-400">
                                                {pr.weight}
                                            </span>
                                            <span className="text-lg text-yellow-400/80">{exercise.unit}</span>
                                        </div>
                                        <div className="text-xs text-glass-muted">
                                            {pr.reps} 次 • {new Date(pr.date).toLocaleDateString('zh-TW')}
                                        </div>
                                    </div>

                                    {/* Weight History Mini Chart */}
                                    <div className="h-12 flex items-end gap-1">
                                        {(pr.history || []).slice(-10).map((record, i) => {
                                            const maxWeight = Math.max(...pr.history.map(r => r.weight));
                                            const height = (record.weight / maxWeight) * 100;

                                            return (
                                                <div
                                                    key={i}
                                                    className="flex-1 bg-gradient-to-t from-yellow-400/40 to-yellow-400/60 rounded-t group-hover:from-yellow-400/60 group-hover:to-yellow-400/80 transition-all"
                                                    style={{ height: `${height}%` }}
                                                    title={`${record.weight}${exercise.unit}`}
                                                />
                                            );
                                        })}
                                    </div>
                                </>
                            ) : (
                                <div className="text-center py-8 text-glass-muted">
                                    <Award size={32} className="mx-auto mb-2 opacity-30" />
                                    <p className="text-sm">尚未設定PR</p>
                                    <p className="text-xs">點擊開始記錄</p>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* New PR Celebration */}
            {showNewPR && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in">
                    <div className="text-center">
                        <div className="text-8xl mb-4 animate-bounce">🏆</div>
                        <h2 className="text-6xl font-bold bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent mb-2">
                            新紀錄！
                        </h2>
                        <p className="text-2xl text-white">恭喜突破個人最佳！</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PRTracker;
