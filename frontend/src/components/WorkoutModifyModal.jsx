import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { X } from 'lucide-react';
import { toast } from '../utils/toast';

const MODIFICATION_SCENARIOS = [
    {
        type: 'NO_EQUIPMENT',
        icon: '🏠',
        label: '沒有器材',
        description: '轉換成徒手動作'
    },
    {
        type: 'LIMITED_TIME',
        icon: '⏱️',
        label: '只有15分鐘',
        description: '精簡版訓練'
    },
    {
        type: 'MUSCLE_SORE',
        icon: '😣',
        label: '肌肉太痠',
        description: '降低強度或換部位'
    },
    {
        type: 'FOCUS_BODYPART',
        icon: '🎯',
        label: '加強某部位',
        description: '增加目標部位訓練'
    }
];

const WorkoutModifyModal = ({ workout, userProfile, onClose, onConfirm }) => {
    const [selectedScenario, setSelectedScenario] = useState(null);
    const [modifiedPlan, setModifiedPlan] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleSelectScenario = async (scenario) => {
        setSelectedScenario(scenario);
        setLoading(true);
        setModifiedPlan(null); // Clear previous plan

        try {
            const res = await fetch(`http://${window.location.hostname}:8000/api/workout/modify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userProfile.user_id,
                    original_plan_id: workout.id,
                    modification_type: scenario.type,
                    target_bodypart: null
                })
            });

            if (!res.ok) {
                throw new Error(`API error: ${res.status}`);
            }

            const data = await res.json();

            if (data.success && data.modified) {
                setModifiedPlan(data.modified);
            } else {
                throw new Error('Invalid response format');
            }
        } catch (error) {
            console.error('Modification failed:', error);
            toast.error('修改失敗，請檢查網路後重試');
        } finally {
            setLoading(false);
        }
    };

    const handleConfirm = async () => {
        if (!modifiedPlan) return;

        try {
            const res = await fetch(`http://${window.location.hostname}:8000/api/workout/confirm-modification`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userProfile.user_id,
                    modified_plan: modifiedPlan,
                    original_plan_id: workout.id
                })
            });

            if (!res.ok) {
                throw new Error(`API error: ${res.status}`);
            }

            const data = await res.json();

            if (data.success) {
                onConfirm(data.active_plan || modifiedPlan);
                onClose();
            } else {
                throw new Error('Confirmation failed');
            }
        } catch (error) {
            console.error('Confirmation failed:', error);
            toast.error(`確認失敗：${error.message}`);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 max-w-3xl w-full rounded-[18px] border border-white/20 shadow-2xl flex flex-col" style={{ maxHeight: '85dvh' }}>
                {/* Header - Fixed */}
                <div className="flex-shrink-0 bg-gradient-to-r from-gray-900/95 to-gray-800/95 backdrop-blur border-b border-white/10 p-6 flex justify-between items-center rounded-t-2xl">
                    <h2 className="text-2xl font-bold text-white">調整今日訓練</h2>
                    <motion.button {...pressProps('row')} onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                        <X className="text-white" />
                    </motion.button>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto">

                    {/* Modification Scenarios */}
                    <div className="p-6">
                        <h3 className="text-lg font-semibold text-white mb-4">選擇調整原因</h3>
                        <div className="grid grid-cols-2 gap-4">
                            {MODIFICATION_SCENARIOS.map((scenario) => (
                                <motion.button {...pressProps('row')}
 key={scenario.type}
 onClick={() => handleSelectScenario(scenario)}
 className={`p-4 rounded-xl border text-left ${selectedScenario?.type === scenario.type
 ? 'bg-glass-beige text-glass-dark border-glass-beige'
 : 'bg-white/5 text-white border-white/10 hover:border-white/20'
 }`}
 >
                                    <div className="text-3xl mb-2">{scenario.icon}</div>
                                    <div className="font-semibold mb-1">{scenario.label}</div>
                                    <div className="text-xs opacity-70">{scenario.description}</div>
                                </motion.button>
                            ))}
                        </div>
                    </div>

                    {/* Loading State - More Prominent */}
                    {loading && (
                        <div className="p-8 text-center bg-white/5 mx-6 rounded-xl border border-white/10">
                            <div className="animate-spin rounded-full h-16 w-16 border-4 border-glass-beige border-t-transparent mx-auto"></div>
                            <p className="text-white font-semibold mt-6 text-lg">AI 正在生成替代方案...</p>
                            <p className="text-gray-400 text-sm mt-2">請稍候</p>
                        </div>
                    )}

                    {/* Modified Plan Preview */}
                    {modifiedPlan && !loading && (
                        <div className="p-6 border-t border-white/10">
                            <h3 className="text-lg font-semibold text-white mb-2">AI 建議方案</h3>
                            <p className="text-gray-400 text-sm mb-4">
                                {selectedScenario?.label} - {selectedScenario?.description}
                            </p>

                            <div className="space-y-3">
                                {modifiedPlan.exercises && modifiedPlan.exercises.map((ex, idx) => {
                                    const isModified = ex.name !== workout.exercises?.[idx]?.name;
                                    return (
                                        <div key={idx} className={`rounded-xl p-4 border ${isModified
                                            ? 'bg-orange-500/10 border-orange-400/30'
                                            : 'bg-white/5 border-white/10'
                                            }`}>
                                            {isModified ? (
                                                // Show comparison for modified exercises
                                                <div>
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <span className="px-2 py-1 bg-orange-500/30 text-orange-300 text-xs rounded-full font-medium">
                                                            🔄 已調整
                                                        </span>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        {/* Original */}
                                                        <div className="bg-white/5 rounded-lg p-3">
                                                            <p className="text-xs text-gray-400 mb-1">原動作</p>
                                                            <h4 className="font-semibold text-gray-300 line-through opacity-70">
                                                                {workout.exercises?.[idx]?.name || '未知'}
                                                            </h4>
                                                            <p className="text-xs text-gray-500 mt-1">
                                                                {workout.exercises?.[idx]?.sets} 組 × {workout.exercises?.[idx]?.reps}
                                                            </p>
                                                        </div>
                                                        {/* Modified */}
                                                        <div className="bg-orange-500/20 rounded-lg p-3">
                                                            <p className="text-xs text-orange-400 mb-1">替代動作</p>
                                                            <h4 className="font-semibold text-white">
                                                                {ex.name}
                                                            </h4>
                                                            <p className="text-sm text-orange-200 mt-1">
                                                                {ex.sets} 組 × {ex.reps} 次 · 休息 {ex.rest}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                // Show normal for unchanged exercises
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h4 className="font-semibold text-white text-lg">{ex.name}</h4>
                                                        <p className="text-sm text-gray-300 mt-1">
                                                            {ex.sets} 組 × {ex.reps} 次 · 休息 {ex.rest}
                                                        </p>
                                                    </div>
                                                    <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded">
                                                        ✓ 維持
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Duration Info */}
                            <div className="mt-4 p-4 bg-blue-500/20 rounded-lg border border-blue-400/30">
                                <div className="text-sm text-blue-300 font-medium">
                                    ⏱️ 預計時長: {modifiedPlan.duration} 分鐘
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Buttons - Fixed at Bottom */}
                {modifiedPlan && !loading && (
                    <div className="flex-shrink-0 p-6 border-t border-white/10 bg-gray-900/95 backdrop-blur rounded-b-2xl">
                        <div className="flex gap-3">
                            <motion.button {...pressProps('cta')}
 onClick={onClose}
 className="flex-1 py-3 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-colors font-medium">
                                取消
                            </motion.button>
                            <motion.button {...pressProps('cta')}
 onClick={handleConfirm}
 className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:shadow-lg hover:scale-105 font-medium">
                                確認更換
                            </motion.button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WorkoutModifyModal;
