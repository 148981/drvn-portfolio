import { epleyE1RM } from './strengthMath';
import { toLocalDateKey, startOfWeek } from './localDate';
/**
 * Workout Analytics Utility Functions
 * 訓練數據分析工具
 */

/**
 * Calculate estimated 1RM (One Rep Max) using Epley Formula
 * 計算預估最大肌力
 * 
 * @param {number} weight - 重量 (kg)
 * @param {number} reps - 次數
 * @returns {number} Estimated 1RM
 */
export function calculate1RM(weight, reps) {
    /* 🔢 2026-09 稽核：這裡原本沒有夾 reps —— 30 下的組會估成兩倍 1RM，
       而同一組在 TrainingRecordPageMobile 顯示的是夾 12 之後的值。
       同一筆訓練兩個數字。改走 utils/strengthMath 的唯一實作。 */
    return epleyE1RM(weight, reps);
}

/**
 * Calculate training streak (consecutive days)
 * 計算訓練連續天數
 * 
 * @param {Array} workoutHistory - 訓練歷史記錄
 * @returns {Object} Streak statistics
 */
export function calculateWorkoutStreak(workoutHistory) {
    if (!workoutHistory || workoutHistory.length === 0) {
        return { currentStreak: 0, longestStreak: 0, thisWeek: 0 };
    }

    // Sort by date (most recent first)
    const sorted = [...workoutHistory].sort((a, b) => {
        const dateA = new Date(a.timestamp || a.date);
        const dateB = new Date(b.timestamp || b.date);
        return dateB - dateA;
    });

    // Get unique dates (YYYY-MM-DD)
    const uniqueDates = [...new Set(sorted.map(w => {
        const date = new Date(w.timestamp || w.date);
        return toLocalDateKey(date);
    }))].sort().reverse();

    // Calculate current streak
    let currentStreak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < uniqueDates.length; i++) {
        const workoutDate = new Date(uniqueDates[i]);
        const daysDiff = Math.floor((today - workoutDate) / (1000 * 60 * 60 * 24));

        if (daysDiff === i) {
            currentStreak++;
        } else {
            break;
        }
    }

    // Calculate longest streak
    let longestStreak = 1;
    let tempStreak = 1;

    for (let i = 1; i < uniqueDates.length; i++) {
        const currentDate = new Date(uniqueDates[i]);
        const prevDate = new Date(uniqueDates[i - 1]);
        const daysDiff = Math.floor((prevDate - currentDate) / (1000 * 60 * 60 * 24));

        if (daysDiff === 1) {
            tempStreak++;
            longestStreak = Math.max(longestStreak, tempStreak);
        } else {
            tempStreak = 1;
        }
    }

    // Calculate this week's workouts
    // 全 App 統一週一為始（見 localDate.startOfWeek）；
    // 原本 -getDay() 是週日制，週日當天會與課表差整整一週。
    const weekStart = startOfWeek(today);

    const thisWeek = uniqueDates.filter(dateStr => {
        const date = new Date(dateStr);
        return date >= weekStart;
    }).length;

    return { currentStreak, longestStreak, thisWeek };
}

/**
 * Get muscle group balance for radar chart
 * 獲取肌群平衡數據（雷達圖用）
 * 
 * @param {Array} workoutHistory - 訓練歷史
 * @returns {Array} Muscle group balance data
 */
export function getMuscleGroupBalance(workoutHistory) {
    const muscleGroups = ['胸部', '背部', '腿部', '肩部', '手臂', '核心'];
    const counts = {};

    // Initialize
    muscleGroups.forEach(group => counts[group] = 0);

    // Count workouts per muscle group
    workoutHistory.forEach(workout => {
        const group = workout.focus_group || workout.focusGroup || '全身';
        if (muscleGroups.includes(group)) {
            counts[group]++;
        }
    });

    // Find max count for normalization
    const maxCount = Math.max(...Object.values(counts), 1);

    // Normalize to 0-100 scale
    return muscleGroups.map(group => ({
        subject: group,
        value: Math.round((counts[group] / maxCount) * 100),
        actual: counts[group]
    }));
}

/**
 * Calculate average weight from exercises
 * 計算平均重量
 * 
 * @param {Array} exercises - 訓練動作列表
 * @returns {number} Average weight
 */
export function calculateAverageWeight(exercises) {
    if (!exercises || exercises.length === 0) return 0;

    let totalWeight = 0;
    let totalSets = 0;

    exercises.forEach(exercise => {
        const sets = exercise.sets || [];
        sets.forEach(set => {
            if (set.weight && set.completed !== false) {
                totalWeight += parseFloat(set.weight);
                totalSets++;
            }
        });
    });

    return totalSets > 0 ? Math.round(totalWeight / totalSets * 10) / 10 : 0;
}

/**
 * Calculate max weight from exercises
 * 計算最大重量
 * 
 * @param {Array} exercises - 訓練動作列表
 * @returns {number} Max weight
 */
export function calculateMaxWeight(exercises) {
    if (!exercises || exercises.length === 0) return 0;

    let maxWeight = 0;

    exercises.forEach(exercise => {
        const sets = exercise.sets || [];
        sets.forEach(set => {
            if (set.weight && set.completed !== false) {
                maxWeight = Math.max(maxWeight, parseFloat(set.weight));
            }
        });
    });

    return maxWeight;
}

/**
 * Get volume and intensity trend data for combo chart
 * 獲取容量和強度趨勢數據（混合圖用）
 * 
 * @param {Array} workoutHistory - 訓練歷史
 * @param {number} limit - 顯示最近N次訓練
 * @returns {Array} Trend data
 */
export function getVolumeIntensityTrend(workoutHistory, limit = 10) {
    if (!workoutHistory || workoutHistory.length === 0) return [];

    return workoutHistory
        .slice()
        .reverse()
        .slice(-limit)
        .map(workout => {
            const exercises = workout.exercises || [];
            const avgWeight = calculateAverageWeight(exercises);
            const maxWeight = calculateMaxWeight(exercises);

            return {
                date: new Date(workout.timestamp || workout.date).toLocaleDateString('zh-TW', {
                    month: 'short',
                    day: 'numeric'
                }),
                volume: workout.total_volume || workout.volume || 0,
                avgWeight: avgWeight,
                maxWeight: maxWeight
            };
        });
}

/**
 * Get top exercises by 1RM
 * 獲取主要動作的1RM排行
 * 
 * @param {Array} workoutHistory - 訓練歷史
 * @param {number} limit - 返回前N個動作
 * @returns {Array} Top exercises with 1RM
 */
export function getTop1RMExercises(workoutHistory, limit = 3) {
    if (!workoutHistory || workoutHistory.length === 0) return [];

    const exerciseMaxes = {};

    // Find max 1RM for each exercise
    workoutHistory.forEach(workout => {
        const exercises = workout.exercises || [];
        exercises.forEach(exercise => {
            const name = exercise.name || exercise.exercise_name;
            if (!name) return;

            const sets = exercise.sets || [];
            sets.forEach(set => {
                if (!set.weight || !set.reps || set.completed === false) return;

                const estimate1RM = calculate1RM(parseFloat(set.weight), parseInt(set.reps));

                if (!exerciseMaxes[name] || estimate1RM > exerciseMaxes[name].max1RM) {
                    exerciseMaxes[name] = {
                        name,
                        max1RM: estimate1RM,
                        weight: parseFloat(set.weight),
                        reps: parseInt(set.reps),
                        date: workout.timestamp || workout.date
                    };
                }
            });
        });
    });

    // Sort and return top exercises
    return Object.values(exerciseMaxes)
        .sort((a, b) => b.max1RM - a.max1RM)
        .slice(0, limit);
}
