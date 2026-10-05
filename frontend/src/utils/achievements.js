// Achievement and badge system for workout completion

import { sessionVolume, exerciseVolume } from './strengthMath';

export const ACHIEVEMENTS = {
    firstWorkout: {
        id: 'first_workout',
        name: '首次訓練',
        description: '完成第一次訓練',
        icon: '🎯',
        condition: (stats) => stats.totalWorkouts === 1
    },

    consistency3: {
        id: 'consistency_3',
        name: '堅持三天',
        description: '連續訓練3天',
        icon: '🔥',
        condition: (stats) => stats.currentStreak >= 3
    },

    consistency7: {
        id: 'consistency_7',
        name: '一週戰士',
        description: '連續訓練7天',
        icon: '⚡',
        condition: (stats) => stats.currentStreak >= 7
    },

    earlyBird: {
        id: 'early_bird',
        name: '晨練達人',
        description: '早上6點前完成訓練',
        icon: '🌅',
        condition: (stats) => {
            const hour = new Date().getHours();
            return hour < 6;
        }
    },

    intensityHigh: {
        id: 'intensity_high',
        name: '強度大師',
        description: '完成高強度訓練',
        icon: '💪',
        condition: (stats) => stats.intensity === 'high'
    },

    longSession: {
        id: 'long_session',
        name: '耐力冠軍',
        description: '完成60分鐘以上訓練',
        icon: '⏱️',
        condition: (stats) => stats.duration >= 60
    },

    allExercises: {
        id: 'all_exercises',
        name: '完美執行',
        description: '完成所有計劃動作',
        icon: '✨',
        condition: (stats) => stats.completionRate === 100
    },

    caloriesBurner: {
        id: 'calories_burner',
        name: '燃脂機器',
        description: '單次訓練消耗500卡以上',
        icon: '🔥',
        condition: (stats) => stats.caloriesBurned >= 500
    },

    weeklyGoal: {
        id: 'weekly_goal',
        name: '週目標達成',
        description: '本週完成3次訓練',
        icon: '🎖️',
        condition: (stats) => stats.weeklyWorkouts >= 3
    },

    personalBest: {
        id: 'personal_best',
        name: '超越自我',
        description: '打破個人記錄',
        icon: '🏆',
        condition: (stats) => stats.isPersonalBest
    }
};

// Check which achievements were unlocked in this session
export const checkAchievements = (sessionStats, userHistory = {}) => {
    const unlockedAchievements = [];

    // Combine session stats with user history
    const stats = {
        totalWorkouts: (userHistory.totalWorkouts || 0) + 1,
        currentStreak: userHistory.currentStreak || 1,
        weeklyWorkouts: userHistory.weeklyWorkouts || 1,
        intensity: sessionStats.intensity,
        duration: sessionStats.duration,
        completionRate: sessionStats.completionRate,
        caloriesBurned: sessionStats.caloriesBurned,
        isPersonalBest: sessionStats.isPersonalBest || false
    };

    // Check each achievement
    Object.values(ACHIEVEMENTS).forEach(achievement => {
        if (achievement.condition(stats)) {
            // Check if not already unlocked
            if (!userHistory.unlockedAchievements?.includes(achievement.id)) {
                unlockedAchievements.push(achievement);
            }
        }
    });

    return unlockedAchievements;
};

// Get completion message with achievements
export const getCompletionMessage = (achievements, stats) => {
    const baseMessages = [
        `太棒了！你完成了${stats.totalExercises}個動作的訓練`,
        `訓練完成！總時長：${Math.round(stats.duration)}分鐘`,
        `出色的表現！預估消耗：${stats.caloriesBurned}卡路里`,
        `完美執行！你的堅持會帶來改變`
    ];

    let message = baseMessages[Math.floor(Math.random() * baseMessages.length)];

    if (achievements.length > 0) {
        message += `\n\n🎉 解鎖新成就：\n`;
        achievements.forEach(ach => {
            message += `${ach.icon} ${ach.name}\n`;
        });
    }

    return message;
};

// Generate motivational stats summary
export const generateStatsSummary = (sessionData) => {
    const { completedSets, totalSets, duration, estimatedCalories, exercises } = sessionData;

    // Calculate total volume from exercises
    const totalVolume = sessionVolume({ exercises });

    return {
        completionRate: Math.round((completedSets / totalSets) * 100),
        duration: Math.round(duration / 60), // seconds to minutes
        calories: estimatedCalories,
        caloriesBurned: estimatedCalories,
        totalExercises: exercises?.length || 0,
        setsCompleted: completedSets,
        totalVolume: totalVolume
    };
};
