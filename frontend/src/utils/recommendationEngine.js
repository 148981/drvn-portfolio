/**
 * Training Recommendation Engine
 * Generates smart, aggressive training suggestions
 */

/**
 * Generate recovery-based recommendations
 */
export const generateRecoveryRecommendations = (recoveryData) => {
    const recommendations = [];

    if (!recoveryData || Object.keys(recoveryData).length === 0) {
        return [{
            type: 'info',
            priority: 'medium',
            title: '開始記錄訓練數據',
            reason: '尚無訓練歷史',
            suggestion: '完成第一個訓練日，系統將開始追蹤你的恢復狀態',
            icon: '📝'
        }];
    }

    Object.entries(recoveryData).forEach(([part, data]) => {
        const hoursAgo = data.hoursAgo || 999;

        if (hoursAgo < 24) {
            // Fully recovered - can push hard
            recommendations.push({
                type: 'focus',
                priority: 'high',
                title: `${part.toUpperCase()} 已完全恢復！`,
                reason: `距上次訓練 ${hoursAgo}h，肌肉已充分休息`,
                suggestion: `今天可以衝刺PR！增加重量或組數挑戰極限`,
                icon: '🔥'
            });
        } else if (hoursAgo >= 48 && hoursAgo < 72) {
            // Extended recovery - need to train
            recommendations.push({
                type: 'warning',
                priority: 'high',
                title: `注意！${part.toUpperCase()} 需要訓練`,
                reason: `已${hoursAgo}小時未訓練，肌肉流失風險`,
                suggestion: `今天必須練！至少完成基礎訓練量`,
                icon: '⚠️'
            });
        } else if (hoursAgo < 48) {
            // Still recovering - modify
            recommendations.push({
                type: 'modify',
                priority: 'medium',
                title: `${part.toUpperCase()} 恢復中`,
                reason: `${hoursAgo}h前剛訓練，仍在修復階段`,
                suggestion: `可做輕量訓練，重量減20%，專注動作質量`,
                icon: '💪'
            });
        }
    });

    return recommendations;
};

/**
 * Generate progress-based recommendations
 */
export const generateProgressRecommendations = (metrics) => {
    const recommendations = [];

    if (!metrics) return recommendations;

    // Find weakest metric
    const metricsArray = Object.entries(metrics);
    const sorted = metricsArray.sort((a, b) => a[1] - b[1]);
    const weakest = sorted[0];
    const strongest = sorted[sorted.length - 1];

    // Weak point focus
    if (weakest[1] < 60) {
        const suggestions = {
            structural: {
                title: '加強複合訓練！',
                suggestion: '每週至少3次深蹲、硬舉、臥推等大重量訓練',
                icon: '🏋️'
            },
            metabolic: {
                title: '提升代謝能力！',
                suggestion: '每次訓練後加20分鐘中高強度有氧',
                icon: '🏃'
            },
            alignment: {
                title: '平衡左右差異！',
                suggestion: '增加單邊訓練：保加利亞深蹲、單手划船等',
                icon: '⚖️'
            },
            vitality: {
                title: '優化恢復策略！',
                suggestion: '確保每天8小時睡眠，增加休息日',
                icon: '😴'
            }
        };

        const info = suggestions[weakest[0]];
        recommendations.push({
            type: 'focus',
            priority: 'high',
            title: `弱項突破：${info.title}`,
            reason: `${weakest[0]} 分數 ${weakest[1]}/100 需提升`,
            suggestion: info.suggestion,
            icon: info.icon
        });
    }

    // Strength optimization
    if (strongest[1] > 80) {
        recommendations.push({
            type: 'success',
            priority: 'low',
            title: `${strongest[0]} 表現優異！`,
            reason: `當前分數 ${strongest[1]}/100`,
            suggestion: `保持這個強項，可適度增加難度挑戰`,
            icon: '⭐'
        });
    }

    return recommendations;
};

/**
 * Generate balance-based recommendations
 */
export const generateBalanceRecommendations = (plan) => {
    const recommendations = [];

    if (!plan || !plan.weeks) return recommendations;

    // Count exercise types
    let pushCount = 0;
    let pullCount = 0;
    let legCount = 0;

    plan.weeks.forEach(week => {
        week.days?.forEach(day => {
            day.exercises?.forEach(exercise => {
                const name = exercise.name.toLowerCase();

                // Push exercises
                if (name.includes('push') || name.includes('press') || name.includes('chest')) {
                    pushCount++;
                }
                // Pull exercises
                if (name.includes('pull') || name.includes('row') || name.includes('back')) {
                    pullCount++;
                }
                // Leg exercises
                if (name.includes('squat') || name.includes('deadlift') || name.includes('leg')) {
                    legCount++;
                }
            });
        });
    });

    const total = pushCount + pullCount + legCount;
    if (total === 0) return recommendations;

    // Check push/pull ratio
    const pushPullRatio = pushCount / (pullCount || 1);
    if (pushPullRatio > 1.5) {
        recommendations.push({
            type: 'warning',
            priority: 'medium',
            title: '推動作過多！',
            reason: `推拉比例失衡 (${pushPullRatio.toFixed(1)}:1)`,
            suggestion: '增加划船、引體向上等拉動作，避免肌力不平衡',
            icon: '📊'
        });
    } else if (pushPullRatio < 0.7) {
        recommendations.push({
            type: 'warning',
            priority: 'medium',
            title: '拉動作過多！',
            reason: `推拉比例失衡 (1:${(pullCount / pushCount).toFixed(1)})`,
            suggestion: '增加臥推、肩推等推動作，平衡發展',
            icon: '📊'
        });
    }

    // Check leg training
    const legRatio = legCount / total;
    if (legRatio < 0.25) {
        recommendations.push({
            type: 'warning',
            priority: 'high',
            title: '腿部訓練不足！',
            reason: `腿部訓練僅佔 ${(legRatio * 100).toFixed(0)}%`,
            suggestion: '腿是最大肌群！每週至少2次深蹲/硬舉訓練',
            icon: '🦵'
        });
    }

    return recommendations;
};

/**
 * Generate today-specific recommendations
 */
export const generateTodayRecommendations = (todayWorkout, recoveryData) => {
    const recommendations = [];

    if (!todayWorkout || !todayWorkout.exercises) {
        return [{
            type: 'info',
            priority: 'medium',
            title: '今天是休息日',
            reason: '訓練計劃中沒有安排訓練',
            suggestion: '好好休息，補充營養，為明天做準備！',
            icon: '🛌'
        }];
    }

    // Check target muscles for today
    const targetMuscles = [];
    todayWorkout.exercises?.forEach(ex => {
        const name = ex.name.toLowerCase();
        if (name.includes('chest')) targetMuscles.push('chest');
        if (name.includes('back')) targetMuscles.push('back');
        if (name.includes('leg') || name.includes('squat')) targetMuscles.push('legs');
        if (name.includes('shoulder')) targetMuscles.push('shoulders');
    });

    // Check if target muscles are ready
    const uniqueMuscles = [...new Set(targetMuscles)];
    uniqueMuscles.forEach(muscle => {
        const recovery = recoveryData[muscle];
        if (recovery && recovery.hoursAgo < 48) {
            recommendations.push({
                type: 'warning',
                priority: 'high',
                title: `${muscle} 恢復不足但計劃要練`,
                reason: `僅恢復 ${recovery.hoursAgo}h，建議48h以上`,
                suggestion: '考慮調整計劃或降低強度，避免過度訓練',
                icon: '⚠️'
            });
        } else if (recovery && recovery.hoursAgo >= 24) {
            recommendations.push({
                type: 'success',
                priority: 'medium',
                title: `${muscle} 狀態極佳！`,
                reason: `已恢復 ${recovery.hoursAgo}h`,
                suggestion: '今天可以挑戰重量，突破自我！',
                icon: '✅'
            });
        }
    });

    if (recommendations.length === 0) {
        recommendations.push({
            type: 'success',
            priority: 'medium',
            title: '完美的訓練日！',
            reason: '所有目標肌群都準備就緒',
            suggestion: '全力以赴，創造新記錄！',
            icon: '🎯'
        });
    }

    return recommendations;
};

/**
 * Generate all recommendations
 */
export const generateAllRecommendations = (plan, recoveryData, todayWorkout, metrics) => {
    const all = [
        ...generateTodayRecommendations(todayWorkout, recoveryData),
        ...generateRecoveryRecommendations(recoveryData),
        ...generateProgressRecommendations(metrics),
        ...generateBalanceRecommendations(plan)
    ];

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    all.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    // Return top 5 most important
    return all.slice(0, 5);
};
