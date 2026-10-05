import React, { useState } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { Target, Calendar, TrendingUp, X, Sparkles, Flame, BicepsFlexed, Zap, BatteryCharging, Trophy, Medal, Star, ChevronRight, Calculator } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import apiClient from '../api/client';
import { toast } from '../utils/toast';
import { toLocalDateKey } from '../utils/localDate';

const GoalSettingModal = ({ isOpen, onClose, userId, currentGoals }) => {
    const [selectedGoals, setSelectedGoals] = useState(
        currentGoals?.primary_goal
            ? currentGoals.primary_goal.split(',').map(g => g.trim())
            : []
    );

    // New: Metric Targets State
    // Stores specific numeric targets for each selected goal type
    const [metricTargets, setMetricTargets] = useState(() => {
        // Try to parse existing targets if they exist in strict JSON format
        // or initialize defaults
        let existing = {};
        try {
            if (currentGoals?.target_value) {
                existing = typeof currentGoals.target_value === 'string'
                    ? JSON.parse(currentGoals.target_value)
                    : currentGoals.target_value;
            }
        } catch (e) { console.log('No existing metric targets'); }
        return existing || {};
    });

    const [targetDate, setTargetDate] = useState(
        currentGoals?.target_date ||
        toLocalDateKey(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000))
    );
    const [saving, setSaving] = useState(false);

    const goalOptions = [
        {
            id: 'muscle_gain',
            name: '增肌\nMuscle Gain',
            icon: BicepsFlexed,
            color: 'from-blue-500 to-cyan-500',
            bg: 'bg-blue-500/10',
            border: 'border-blue-500/30',
            description: 'Build strength & size',
            metricLabel: 'Target Muscle Mass (kg)',
            unit: 'kg',
            placeholder: 'e.g., 35.0'
        },
        {
            id: 'fat_loss',
            name: '減脂\nFat Loss',
            icon: Flame,
            color: 'from-orange-500 to-red-500',
            bg: 'bg-orange-500/10',
            border: 'border-orange-500/30',
            description: 'Burn fat & lean out',
            metricLabel: 'Target Body Fat (%)',
            unit: '%',
            placeholder: 'e.g., 15.0'
        },
        {
            id: 'performance',
            name: '提升表現\nPerformance',
            icon: Zap,
            color: 'from-yellow-500 to-amber-500',
            bg: 'bg-yellow-500/10',
            border: 'border-yellow-500/30',
            description: 'Power & Endurance',
            metricLabel: 'Target Score (1-100)',
            unit: 'pts',
            placeholder: 'e.g., 85'
        },
        {
            id: 'maintenance',
            name: '保持健康\nMaintenance',
            icon: BatteryCharging,
            color: 'from-green-500 to-emerald-500',
            bg: 'bg-green-500/10',
            border: 'border-green-500/30',
            description: 'Stay active & fit',
            metricLabel: 'Target BMI',
            unit: '',
            placeholder: 'e.g., 22.5'
        }
    ];

    const handleGoalToggle = (goalId) => {
        setSelectedGoals(prev => {
            if (prev.includes(goalId)) {
                // Remove goal and its target
                const newTargets = { ...metricTargets };
                delete newTargets[goalId];
                setMetricTargets(newTargets);
                return prev.filter(g => g !== goalId);
            } else {
                return [...prev, goalId];
            }
        });
    };

    const [bodyStats, setBodyStats] = useState(null);

    // Fetch body stats for estimation
    React.useEffect(() => {
        if (isOpen && userId) {
            const fetchStats = async () => {
                try {
                    const response = await apiClient.get(`/api/user/body-analysis/${userId}`);
                    if (response.data?.analysis?.composition) {
                        setBodyStats(response.data.analysis.composition);
                    }
                } catch (e) { console.error("Could not fetch stats for estimation"); }
            };
            fetchStats();
        }
    }, [isOpen, userId]);

    const calculateIdealTarget = (goalId) => {
        if (!bodyStats) return null;

        // Simple Estimation Logic
        // In a real app, this would use age, gender, and height from profile
        // For now, we use general athletic standards

        switch (goalId) {
            case 'fat_loss':
                // General "Athletic/Fit" standard: Men 15%, Women 23%
                // But better to be relative to current. 
                // If very high (>30%), aim for -5% first. 
                // If moderate (20-25%), aim for 15-18%.
                const currentFat = bodyStats.body_fat_percent || 25;
                if (currentFat > 30) return (currentFat - 5).toFixed(1);
                if (currentFat > 20) return '15.0';
                return '12.0'; // Lean goal
            case 'muscle_gain':
                // Realistic natural gain: +1-2kg in short term
                const currentMuscle = bodyStats.skeletal_muscle_mass || 30;
                return (currentMuscle + 2.0).toFixed(1);
            case 'maintenance':
                // Ideal BMI for health: 22 (Asian standard, WHO: 18.5-24.9)
                return '22.0';
            case 'performance':
                return '90'; // Aim for high score - now string for consistency
            default:
                return null;
        }
    };

    const handleAutoEstimate = (goalId) => {
        const ideal = calculateIdealTarget(goalId);
        console.log('[GoalModal] Auto-estimate for', goalId, ':', ideal);
        if (ideal) {
            handleMetricChange(goalId, ideal);
            console.log('[GoalModal] Applied target:', goalId, '=', ideal);
        }
    };

    const handleMetricChange = (goalId, value) => {
        setMetricTargets(prev => ({
            ...prev,
            [goalId]: value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        console.log('[GoalModal] Submit clicked. Selected goals:', selectedGoals);
        console.log('[GoalModal] Current metric targets:', metricTargets);

        if (selectedGoals.length === 0) {
            toast.error("請至少選擇一個目標");
            return;
        }

        // Validate metrics and auto-suggest if empty
        const missingGoals = [];
        for (const goalId of selectedGoals) {
            console.log('[GoalModal] Validating', goalId, '- value:', metricTargets[goalId], '- truthy:', !!metricTargets[goalId]);
            if (!metricTargets[goalId] || metricTargets[goalId] === '' || metricTargets[goalId] === '0') {
                // Try to auto-fill with recommended value
                const recommended = calculateIdealTarget(goalId);
                if (recommended) {
                    console.log('[GoalModal] Auto-filling', goalId, 'with recommended:', recommended);
                    metricTargets[goalId] = recommended;
                } else {
                    missingGoals.push(goalId);
                }
            }
        }

        if (missingGoals.length > 0) {
            const goalName = goalOptions.find(g => g.id === missingGoals[0]).name.split('\n')[0];
            console.error('[GoalModal] VALIDATION FAILED for', missingGoals);
            toast.error(`請輸入 ${goalName} 的目標數值，或取消選擇該目標`);
            return;
        }

        console.log('[GoalModal] Validation passed, submitting...');
        setSaving(true);

        const goalsData = {
            primary_goal: selectedGoals.join(','),
            target_value: JSON.stringify(metricTargets), // Store specific stats
            target_date: targetDate,
            current_score: 0,
            set_at: new Date().toISOString()
        };

        try {
            const formData = new FormData();
            formData.append('user_id', userId);
            formData.append('primary_goal', goalsData.primary_goal);
            // We repurpose target_score field or adding a new field?
            // For now, let's store it in target_score as a JSON string for flexibility,
            // or if backend supports 'metrics', use that. 
            // Assuming we must use existing fields -> store in target_score
            formData.append('target_score', goalsData.target_value);
            formData.append('target_date', goalsData.target_date);

            await apiClient.post('/api/user/goals', formData);

            // 同步更新 localStorage
            const storedProfile = localStorage.getItem('userProfile');
            if (storedProfile) {
                const profile = JSON.parse(storedProfile);
                profile.goals = {
                    ...goalsData,
                    target_score: goalsData.target_value // Ensure frontend sees it as score/value
                };
                localStorage.setItem('userProfile', JSON.stringify(profile));
            }

            // Force reload to refresh all data
            console.log('[GoalModal] Goals saved successfully, reloading page...');
            window.location.reload();
        } catch (error) {
            console.error('Failed to set goals:', error);

            // Fallback (Offline Mode / Local Update)
            const storedProfile = localStorage.getItem('userProfile');
            if (storedProfile) {
                const profile = JSON.parse(storedProfile);
                profile.goals = {
                    ...goalsData,
                    target_score: goalsData.target_value
                };
                localStorage.setItem('userProfile', JSON.stringify(profile));
                onClose();
            } else {
                toast.error('目標儲存失敗，請稍後再試');
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.95, y: 30 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.95, y: 30 }}
                        className="bg-[#1A1D1F] border border-white/10 rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-glass-beige/10 rounded-xl">
                                    <Target className="text-glass-beige" size={24} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-white">Define Your Targets</h2>
                                    <p className="text-xs text-white/60">Set tangible goals based on real metrics</p>
                                </div>
                            </div>
                            <motion.button {...pressProps('icon')} aria-label="關閉" onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                <X size={20} className="text-white/60" />
                            </motion.button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 custom-scrollbar">

                            {/* 1. Goal Selection (Visual Cards) */}
                            <section>
                                <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs text-white">1</span>
                                    Select Objective
                                </h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {goalOptions.map((goal) => {
                                        const isSelected = selectedGoals.includes(goal.id);
                                        const Icon = goal.icon;
                                        return (
                                            <motion.button {...pressProps('row')}
 key={goal.id}
 onClick={() => handleGoalToggle(goal.id)}
 className={`relative group p-4 rounded-3xl border-2 duration-300 flex flex-col items-center justify-center gap-3 h-48
 ${isSelected
 ? `border-glass-beige bg-white/5`
 : 'border-white/5 bg-white/5 hover:border-white/20 hover:bg-white/10'
 }`}
 >
                                                {/* Background Gradient for selected */}
                                                {isSelected && (
                                                    <div className={`absolute inset-0 rounded-3xl opacity-20 bg-gradient-to-br ${goal.color} blur-xl`} />
                                                )}

                                                <div className={`w-14 h-14 rounded-[18px] flex items-center justify-center transition-transform duration-300 group-hover:scale-110 
                                                    ${isSelected ? `bg-gradient-to-br ${goal.color}` : 'bg-white/10'}`}>
                                                    <Icon size={28} className="text-white" />
                                                </div>

                                                <div className="text-center z-10">
                                                    <div className="font-bold text-white whitespace-pre-line leading-tight mb-1">{goal.name}</div>
                                                    <div className="text-[11px] text-white/50">{goal.description}</div>
                                                </div>

                                                {isSelected && (
                                                    <div className="absolute top-3 right-3">
                                                        <div className="bg-glass-beige text-black text-[11px] font-bold px-2 py-0.5 rounded-full">
                                                            SELECTED
                                                        </div>
                                                    </div>
                                                )}
                                            </motion.button>
                                        );
                                    })}
                                </div>
                            </section>

                            {/* 2. Set Stats (Data Driven) */}
                            {selectedGoals.length > 0 && (
                                <section>
                                    <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider mb-4 flex items-center gap-2">
                                        <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs text-white">2</span>
                                        Set Targets
                                    </h3>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {selectedGoals.map(goalId => {
                                            const goal = goalOptions.find(g => g.id === goalId);
                                            if (!goal) return null;

                                            const Icon = goal.icon;
                                            const idealValue = calculateIdealTarget(goalId);

                                            return (
                                                <div key={goalId} className="bg-white/5 border border-white/10 rounded-[18px] p-5 animate-slide-up">
                                                    <div className="flex items-center gap-3 mb-4">
                                                        <div className={`p-2 rounded-lg bg-gradient-to-br ${goal.color} bg-opacity-20`}>
                                                            <Icon size={20} className="text-white" />
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-white">{goal.name.split('\n')[1]} Target</div>
                                                            <div className="text-xs text-white/50">Enter your goal for this objective</div>
                                                        </div>
                                                    </div>

                                                    <div className="relative mb-3">
                                                        <input
                                                            type="number"
                                                            step="0.1"
                                                            placeholder={goal.placeholder}
                                                            value={metricTargets[goalId] || ''}
                                                            onChange={(e) => handleMetricChange(goalId, e.target.value)}
                                                            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-lg font-mono text-white placeholder-white/20 focus:outline-none focus:border-glass-blue transition-all"
                                                        />
                                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 font-bold text-sm">
                                                            {goal.unit}
                                                        </span>
                                                    </div>

                                                    {/* Smart Estimate Button */}
                                                    {idealValue && (
                                                        <div className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2 cursor-pointer hover:bg-white/10 transition-colors"
                                                            onClick={() => handleAutoEstimate(goalId)}>
                                                            <div className="flex items-center gap-2">
                                                                <Sparkles size={14} className="text-glass-blue" />
                                                                <span className="text-xs text-glass-muted">
                                                                    Recommended: <span className="text-white font-mono">{idealValue}{goal.unit}</span>
                                                                </span>
                                                            </div>
                                                            <span className="text-[9px] text-glass-blue font-bold uppercase tracking-wider">Apply</span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="mt-2 flex items-center gap-2 text-xs text-white/40">
                                        <Calculator size={12} />
                                        <span>We'll track your progress against these numbers automatically from your InBody data.</span>
                                    </div>
                                </section>
                            )}

                            {/* 3. Target Date */}
                            <section>
                                <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs text-white">3</span>
                                    Target Date
                                </h3>
                                <div className="glass-card-light p-4">
                                    <input
                                        type="date"
                                        value={targetDate}
                                        onChange={(e) => setTargetDate(e.target.value)}
                                        className="w-full bg-transparent text-white font-mono text-lg focus:outline-none [color-scheme:dark]"
                                        min={toLocalDateKey(new Date())}
                                    />
                                </div>
                            </section>

                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-white/5 bg-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-50">
                            <div className="text-xs text-white/40 hidden md:block">
                                * Your progress will be recalculated based on these new targets.
                            </div>
                            <div className="flex gap-3">
                                <motion.button {...pressProps('row')}
 onClick={onClose}
 className="px-6 py-3 rounded-xl hover:bg-white/10 transition-colors text-white/60 hover:text-white font-medium"
 >
                                    Cancel
                                </motion.button>
                                <motion.button {...pressProps('pill')}
 onClick={handleSubmit}
 disabled={saving || selectedGoals.length === 0}
 className="px-8 py-3 bg-white text-black rounded-xl font-bold hover:bg-white/90 transform disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
 >
                                    {saving ? (
                                        <>
                                            <Sparkles className="animate-spin" size={18} />
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            Starting Mission
                                            <ChevronRight size={18} />
                                        </>
                                    )}
                                </motion.button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default GoalSettingModal;
