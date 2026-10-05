/**
 * utils/SplitTypeSystem.js
 * 修正版：加入週次漸進負荷 (Progressive Overload) 與動作元數據 (Consistency in Compounds, Variety in Isolation)
 */

import { WEEKLY_PARAMETERS } from './ProgressiveTrainingSystem';

// ========================================
// 1️⃣ Split Type 詳細配置 (動作藍圖)
// ========================================
const SPLIT_CONFIGURATIONS = {
    // 🏛️ The Foundation: PPL (經典推拉腿)
    foundation: {
        name: 'The Foundation',
        subtitle: 'Push / Pull / Legs',
        description: 'Structural strength & hypertrophy',
        daysPerWeek: 3,
        dayTemplates: [
            {
                day: 1,
                focus: 'PUSH (Chest/Shoulders/Tri)',
                targetMuscles: ['chest', 'shoulders', 'triceps'],
                exercises: [
                    // Main Lifts (Compound) - Keep Consistent
                    { pattern: 'Horizontal Push', defaultName: 'Barbell Bench Press', type: 'compound' },
                    { pattern: 'Vertical Push', defaultName: 'Overhead Press', type: 'compound' },
                    // Accessories (Isolation) - Rotate Weekly
                    {
                        pattern: 'Isolation Chest',
                        defaultName: 'Cable Fly',
                        options: ['Cable Fly', 'Pec Deck Machine', 'Dumbbell Fly', 'Incline Cable Fly'],
                        type: 'isolation'
                    },
                    {
                        pattern: 'Tricep Isolation',
                        defaultName: 'Tricep Pushdown',
                        options: ['Tricep Pushdown', 'Skull Crushers', 'Overhead Extension', 'Dips'],
                        type: 'isolation'
                    },
                    { pattern: 'Core', defaultName: 'Plank', type: 'core' }
                ]
            },
            {
                day: 2,
                focus: 'PULL (Back/Biceps)',
                targetMuscles: ['back', 'biceps', 'rear_delt'],
                exercises: [
                    { pattern: 'Vertical Pull', defaultName: 'Pull Up', type: 'compound' },
                    { pattern: 'Horizontal Pull', defaultName: 'Barbell Row', type: 'compound' },
                    {
                        pattern: 'Isolation Pull',
                        defaultName: 'Bicep Curl',
                        options: ['Barbell Curl', 'Hammer Curl', 'Cable Curl', 'Preacher Curl'],
                        type: 'isolation'
                    },
                    {
                        pattern: 'Rear Delt',
                        defaultName: 'Face Pulls',
                        options: ['Face Pulls', 'Reverse Pec Deck', 'Band Pull Aparts', 'Rear Delt Fly'],
                        type: 'isolation'
                    }
                ]
            },
            {
                day: 3,
                focus: 'LEGS (Quads/Hams/Glutes)',
                targetMuscles: ['legs', 'glutes', 'core'],
                exercises: [
                    { pattern: 'Squat', defaultName: 'Back Squat', type: 'compound' },
                    { pattern: 'Hinge', defaultName: 'Romanian Deadlift', type: 'compound' },
                    {
                        pattern: 'Lunge',
                        defaultName: 'Walking Lunges',
                        options: ['Walking Lunges', 'Bulgarian Split Squat', 'Reverse Lunges', 'Step Ups'],
                        type: 'compound' // Lunges are compound but we can rotate them as secondary Leg movement
                    },
                    { pattern: 'Core', defaultName: 'Hanging Leg Raises', type: 'core' }
                ]
            }
        ]
    },

    // 🎯 The Precision: Bro Split (五天分部位)
    precision: {
        name: 'The Precision',
        subtitle: 'Bro Split',
        description: 'Focus on sculpting specific muscles',
        daysPerWeek: 5,
        dayTemplates: [
            {
                day: 1,
                focus: 'CHEST DAY',
                targetMuscles: ['chest'],
                exercises: [
                    { pattern: 'Horizontal Push', defaultName: 'Barbell Bench Press', type: 'compound' },
                    { pattern: 'Incline Push', defaultName: 'Incline Dumbbell Press', type: 'compound' },
                    {
                        pattern: 'Isolation Chest',
                        defaultName: 'Cable Fly',
                        options: ['Cable Fly', 'Pec Deck', 'Dumbbell Pullover'],
                        type: 'isolation'
                    },
                    { pattern: 'Finisher', defaultName: 'Push Up Burnout', type: 'isolation' }
                ]
            },
            {
                day: 2,
                focus: 'BACK DAY',
                targetMuscles: ['back'],
                exercises: [
                    { pattern: 'Vertical Pull', defaultName: 'Pull Ups', type: 'compound' },
                    { pattern: 'Horizontal Pull', defaultName: 'Barbell Row', type: 'compound' },
                    {
                        pattern: 'Isolation Back',
                        defaultName: 'Straight Arm Pulldown',
                        options: ['Straight Arm Pulldown', 'Lat Pulldown', 'Seated Row'],
                        type: 'isolation'
                    },
                    { pattern: 'Low Back', defaultName: 'Hyperextensions', type: 'isolation' }
                ]
            },
            {
                day: 3,
                focus: 'SHOULDERS',
                targetMuscles: ['shoulders'],
                exercises: [
                    { pattern: 'Vertical Push', defaultName: 'Seated Dumbbell Press', type: 'compound' },
                    {
                        pattern: 'Side Delt',
                        defaultName: 'Lateral Raises',
                        options: ['Lateral Raises', 'Cable Lateral Raises', 'Upright Row'],
                        type: 'isolation'
                    },
                    { pattern: 'Rear Delt', defaultName: 'Reverse Pec Deck', type: 'isolation' },
                    { pattern: 'Front Delt', defaultName: 'Front Raises', type: 'isolation' }
                ]
            },
            {
                day: 4,
                focus: 'LEGS',
                targetMuscles: ['legs'],
                exercises: [
                    { pattern: 'Squat', defaultName: 'Back Squat', type: 'compound' },
                    { pattern: 'Leg Press', defaultName: 'Leg Press', type: 'compound' },
                    {
                        pattern: 'Hinge',
                        defaultName: 'Leg Curl',
                        options: ['Lying Leg Curl', 'Seated Leg Curl', 'RDL'],
                        type: 'isolation'
                    },
                    { pattern: 'Calves', defaultName: 'Calf Raises', type: 'isolation' }
                ]
            },
            {
                day: 5,
                focus: 'ARMS & ABS',
                targetMuscles: ['biceps', 'triceps', 'core'],
                exercises: [
                    { pattern: 'Bicep', defaultName: 'Barbell Curl', type: 'isolation' },
                    { pattern: 'Tricep', defaultName: 'Skull Crushers', type: 'isolation' },
                    {
                        pattern: 'Bicep Var',
                        defaultName: 'Hammer Curl',
                        options: ['Hammer Curl', 'Reverse Curl', 'Zottman Curl'],
                        type: 'isolation'
                    },
                    { pattern: 'Core', defaultName: 'Cable Crunch', type: 'core' }
                ]
            }
        ]
    },

    // ⚡ The Pulse: High Frequency (全身循環)
    pulse: {
        name: 'The Pulse',
        subtitle: 'Full Body',
        description: 'Metabolic efficiency for busy schedules',
        daysPerWeek: 4,
        dayTemplates: [
            {
                day: 1, focus: 'FULL BODY A', targetMuscles: ['full_body'],
                exercises: [
                    { defaultName: 'Squat', type: 'compound' },
                    { defaultName: 'Push Up', type: 'compound' },
                    { defaultName: 'Dumbbell Row', type: 'compound' },
                    { defaultName: 'Plank', type: 'core' }
                ]
            },
            {
                day: 2, focus: 'FULL BODY B', targetMuscles: ['full_body'],
                exercises: [
                    { defaultName: 'Walking Lunges', type: 'compound' },
                    { defaultName: 'Overhead Press', type: 'compound' },
                    { defaultName: 'Lat Pulldown', type: 'compound' },
                    { defaultName: 'Russian Twist', type: 'core' }
                ]
            },
            {
                day: 3, focus: 'FULL BODY C', targetMuscles: ['full_body'],
                exercises: [
                    { defaultName: 'Romanian Deadlift', type: 'compound' },
                    { defaultName: 'Incline Dumbbell Press', type: 'compound' },
                    { defaultName: 'Face Pulls', type: 'isolation' },
                    { defaultName: 'Leg Raises', type: 'core' }
                ]
            },
            {
                day: 4, focus: 'FULL BODY D', targetMuscles: ['full_body'],
                exercises: [
                    { defaultName: 'Goblet Squat', type: 'compound' },
                    { defaultName: 'Dips', type: 'compound' },
                    { defaultName: 'Pull Up', type: 'compound' },
                    { defaultName: 'Burpees', type: 'core' }
                ]
            }
        ]
    }
};

// ========================================
// 2️⃣ 智慧動作生成邏輯 (The Brain)
// ========================================

/**
 * 根據週次參數計算組數與次數 (Progressive Overload)
 */
/**
 * 根據週次參數計算組數與次數 (Progressive Overload)
 */
function calculateVolume(weekType, exerciseType, history) {
    let sets = 3;
    let reps = '10-12';
    let rpe = 7;

    // 🔥 根據歷史頻率調整係數
    let volumeModifier = 0;
    if (history === 'none') volumeModifier = -1; // 新手：減 1 組 (變成 2 組)
    if (history === 'regular') volumeModifier = 1; // 老手：加 1 組 (變成 4 組)

    // 線性週期化邏輯 (Linear Periodization)
    switch (weekType) {
        case 'week1': // Base (適應期)
            sets = (exerciseType === 'compound' ? 3 : 2) + volumeModifier;
            reps = exerciseType === 'compound' ? '8-10' : '12-15';
            rpe = 7;
            break;
        case 'week2': // Build (累積期 - 容量增加)
            sets = (exerciseType === 'compound' ? 3 : 3) + volumeModifier;
            reps = exerciseType === 'compound' ? '10-12' : '15-18'; // 次數變多
            rpe = 8;
            break;
        case 'week3': // Peak (高峰期 - 強度增加)
            sets = (exerciseType === 'compound' ? 4 : 3) + volumeModifier;
            reps = exerciseType === 'compound' ? '6-8' : '10-12'; // 重量加重，次數減少
            rpe = 9;
            break;
        case 'week4': // Deload (減量期)
            sets = 2; // 減量週不看歷史，統一降低
            reps = '10'; // 輕鬆做
            rpe = 6;
            break;
        default:
            break;
    }

    // 防呆：確保組數至少有 2 組 (除非是 Deload)
    if (weekType !== 'week4' && sets < 2) sets = 2;

    return { sets, reps, rpe };
}

/**
 * 生成單日訓練內容 (支援動作輪替)
 */
/**
 * 生成單日訓練內容 (支援動作輪替)
 */
function generateDayExercises(splitType, dayNumber, userLevels, weekNumber, history) {
    const splitConfig = SPLIT_CONFIGURATIONS[splitType];
    if (!splitConfig) return null;

    const templateIndex = (dayNumber - 1) % splitConfig.dayTemplates.length;
    const dayTemplate = splitConfig.dayTemplates[templateIndex];
    const weekType = `week${weekNumber}`;

    const finalExercises = dayTemplate.exercises.map(exBlueprint => {
        const volume = calculateVolume(weekType, exBlueprint.type, history);

        // 🔥 核心修改：決定動作名稱
        let finalName = exBlueprint.defaultName;

        // 邏輯：如果是輔助動作 (Isolation) 且有提供選項池 (options)
        // 則根據週次進行輪替 (Week 1 -> Option 0, Week 2 -> Option 1...)
        if (exBlueprint.options && exBlueprint.options.length > 0) {
            // 使用餘數運算子 (%) 來循環選擇
            const optionIndex = (weekNumber - 1) % exBlueprint.options.length;
            finalName = exBlueprint.options[optionIndex];
        }

        // 退階保護邏輯 (依然保留)
        if (finalName.includes('Push Up') && userLevels.pushUp === 1) finalName = 'Knee Push Ups';
        if (finalName.includes('Pull Up') && userLevels.pull === 1) finalName = 'Assisted Pull Ups / Band Rows';

        return {
            name: finalName,
            sets: volume.sets,
            reps: volume.reps,
            rpe: volume.rpe,
            muscle: exBlueprint.pattern || dayTemplate.focus.split(' ')[0],
            category: exBlueprint.type,
            target_group: dayTemplate.targetMuscles[0]
        };
    });

    return {
        day_number: dayNumber,
        focus: dayTemplate.focus,
        description: `Week ${weekNumber} - ${dayTemplate.focus}`,
        target_muscles: dayTemplate.targetMuscles,
        exercises: finalExercises
    };
}

// ========================================
// 3️⃣ 完整計劃生成器
// ========================================
// 3️⃣ 完整計劃生成器
// ========================================
function generatePlanWithSplitType(userAssessment, splitType, options = {}) {
    const splitConfig = SPLIT_CONFIGURATIONS[splitType];
    const { intensity = 'medium', history = 'occasional' } = options;

    // 根據 Intensity 決定一週練幾天
    // Light = 3天, Medium = 依據 Split 預設, High = +1天 (最高6天)
    let daysPerWeek = splitConfig.daysPerWeek;
    if (intensity === 'light') daysPerWeek = 3;
    if (intensity === 'high') daysPerWeek = Math.min(6, splitConfig.daysPerWeek + 1);

    // 強制修正：如果是 Foundation (PPL)，建議至少 3 天
    if (splitType === 'foundation' && daysPerWeek < 3) daysPerWeek = 3;

    const weeks = [];

    // 生成 4 週
    for (let w = 1; w <= 4; w++) {
        const weekData = {
            week_number: w,
            days: []
        };

        // 生成這週的每一天
        for (let d = 1; d <= daysPerWeek; d++) {
            const dayPlan = generateDayExercises(splitType, d, userAssessment.levels, w, history);
            weekData.days.push(dayPlan);
        }
        weeks.push(weekData);
    }

    return {
        name: `${splitConfig.name} Protocol`,
        duration: '4 Weeks',
        split_type: splitType,
        weeks: weeks
    };
}

export {
    SPLIT_CONFIGURATIONS,
    generateDayExercises,
    generatePlanWithSplitType
};
