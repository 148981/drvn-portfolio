/**
 * 🎯 Smart Hashtag-to-Exercise Generation Algorithm (FIXED)
 * 
 * 修復內容：
 * ✅ 整合四週週期化邏輯
 * ✅ 每週動作自動漸進（Week 1 → 2 → 3 → 4）
 * ✅ 保持原有的標籤系統和動作庫
 */

// ========================================
// 引入週期化參數
// ========================================

const WEEKLY_PARAMETERS = {
    week1_base: {
        name: 'Base Week',
        focus: '動作學習、神經連結',
        rpeTarget: '6-7',
        volumeMultiplier: 1.0,
        restModifier: 1.0,
        progressionNotes: '專注於動作品質'
    },
    week2_build: {
        name: 'Build Week',
        focus: '增加代謝壓力、耐力',
        rpeTarget: '7-8',
        volumeMultiplier: 1.2,    // 容量增加 20%
        restModifier: 0.85,
        progressionNotes: '增加次數或縮短休息'
    },
    week3_peak: {
        name: 'Peak Week',
        focus: '強度最大化、挑戰極限',
        rpeTarget: '8-9',
        volumeMultiplier: 1.3,    // 容量增加 30%
        restModifier: 1.0,
        progressionNotes: '增加組數或負重'
    },
    week4_deload: {
        name: 'Deload Week',
        focus: '身體修復、準備下一週期',
        rpeTarget: '5-6',
        volumeMultiplier: 0.6,    // 容量減少 40%
        restModifier: 1.2,
        progressionNotes: '減少總量，恢復調整'
    }
};

// ========================================
// 1️⃣ 標籤定義（保持不變）
// ========================================

export const PAIN_POINTS = {
    '#BackPain': {
        targetMuscles: ['back', 'core'],
        priority: 'high',
        focusType: 'corrective',
        exercises: {
            corrective: [
                { name: 'Cat-Cow Stretch', sets: 3, reps: '10-12', muscle: 'Back', type: 'mobility', movementPattern: 'Core' },
                { name: 'Bird Dog', sets: 3, reps: '8-10', muscle: 'Core', type: 'stability', movementPattern: 'Core' },
                { name: 'Dead Bug', sets: 3, reps: '10-12', muscle: 'Core', type: 'stability', movementPattern: 'Core' },
                { name: 'Child\'s Pose', sets: 2, reps: '30s', muscle: 'Back', type: 'stretch', movementPattern: 'Core' }
            ],
            strengthening: [
                { name: 'Prone Cobra', sets: 3, reps: '10-15', muscle: 'Back', type: 'strength', movementPattern: 'Core' },
                { name: 'Superman', sets: 3, reps: '12-15', muscle: 'Back', type: 'strength', movementPattern: 'Core' },
                { name: 'Glute Bridge', sets: 3, reps: '12-15', muscle: 'Glutes', type: 'strength', movementPattern: 'Squat' }
            ]
        },
        avoidExercises: ['Heavy Deadlifts', 'Good Mornings', 'Bent Over Rows']
    },
    '#KneePain': {
        targetMuscles: ['legs', 'glutes'],
        priority: 'high',
        focusType: 'corrective',
        exercises: {
            corrective: [
                { name: 'Wall Sits', sets: 3, reps: '30-45s', muscle: 'Legs', type: 'isometric', movementPattern: 'Squat' },
                { name: 'Terminal Knee Extension', sets: 3, reps: '15-20', muscle: 'Legs', type: 'rehab', movementPattern: 'Squat' },
                { name: 'Quad Stretch', sets: 2, reps: '30s', muscle: 'Legs', type: 'stretch', movementPattern: 'Squat' },
                { name: 'IT Band Foam Roll', sets: 2, reps: '60s', muscle: 'Legs', type: 'recovery', movementPattern: 'Squat' }
            ],
            strengthening: [
                { name: 'Clamshells', sets: 3, reps: '15-20', muscle: 'Glutes', type: 'activation', movementPattern: 'Squat' },
                { name: 'Step Downs', sets: 3, reps: '8-10', muscle: 'Legs', type: 'strength', movementPattern: 'Squat' },
                { name: 'Glute Bridge', sets: 3, reps: '12-15', muscle: 'Glutes', type: 'strength', movementPattern: 'Squat' }
            ]
        },
        avoidExercises: ['Deep Squats', 'Lunges', 'Leg Extensions']
    },
    '#Posture': {
        targetMuscles: ['back', 'shoulders', 'core'],
        priority: 'medium',
        focusType: 'corrective',
        exercises: {
            corrective: [
                { name: 'Wall Angels', sets: 3, reps: '10-12', muscle: 'Shoulders', type: 'mobility', movementPattern: 'Pull' },
                { name: 'Face Pulls', sets: 3, reps: '15-20', muscle: 'Back', type: 'strength', movementPattern: 'Pull' },
                { name: 'Scapular Wall Slides', sets: 3, reps: '10-12', muscle: 'Back', type: 'mobility', movementPattern: 'Pull' },
                { name: 'Thoracic Extension', sets: 2, reps: '8-10', muscle: 'Back', type: 'mobility', movementPattern: 'Core' }
            ],
            strengthening: [
                { name: 'Band Pull-Aparts', sets: 3, reps: '15-20', muscle: 'Back', type: 'strength', movementPattern: 'Pull' },
                { name: 'Prone Y-Raises', sets: 3, reps: '12-15', muscle: 'Shoulders', type: 'strength', movementPattern: 'Pull' },
                { name: 'Plank', sets: 3, reps: '30-45s', muscle: 'Core', type: 'stability', movementPattern: 'Plank' }
            ]
        },
        avoidExercises: []
    },
    '#Flexibility': {
        targetMuscles: ['full_body'],
        priority: 'low',
        focusType: 'mobility',
        exercises: {
            corrective: [
                { name: 'World\'s Greatest Stretch', sets: 2, reps: '5 each', muscle: 'Full Body', type: 'mobility', movementPattern: 'Core' },
                { name: 'Hip Flexor Stretch', sets: 2, reps: '30s', muscle: 'Hips', type: 'stretch', movementPattern: 'Core' },
                { name: 'Hamstring Stretch', sets: 2, reps: '30s', muscle: 'Legs', type: 'stretch', movementPattern: 'Core' },
                { name: '90/90 Hip Stretch', sets: 2, reps: '30s', muscle: 'Hips', type: 'mobility', movementPattern: 'Core' }
            ],
            strengthening: []
        },
        avoidExercises: []
    },
    '#Mobility': {
        targetMuscles: ['shoulders', 'hips'],
        priority: 'medium',
        focusType: 'mobility',
        exercises: {
            corrective: [
                { name: 'Shoulder Dislocations', sets: 3, reps: '10-12', muscle: 'Shoulders', type: 'mobility', movementPattern: 'Pull' },
                { name: 'Hip CARs', sets: 2, reps: '5 each', muscle: 'Hips', type: 'mobility', movementPattern: 'Squat' },
                { name: 'Cossack Squats', sets: 3, reps: '8-10', muscle: 'Hips', type: 'mobility', movementPattern: 'Squat' },
                { name: 'Ankle Mobility Drill', sets: 2, reps: '10 each', muscle: 'Ankles', type: 'mobility', movementPattern: 'Squat' }
            ],
            strengthening: [
                { name: 'Bulgarian Split Squats', sets: 3, reps: '10-12', muscle: 'Legs', type: 'strength', movementPattern: 'Squat' }
            ]
        },
        avoidExercises: []
    }
};

export const PRIMARY_GOALS = {
    '#LoseWeight': {
        targetMuscles: ['full_body'],
        priority: 'high',
        focusType: 'metabolic',
        exercises: {
            compound: [
                { name: 'Burpees', sets: 4, reps: '10-15', muscle: 'Full Body', type: 'metabolic', movementPattern: 'Push Up' },
                { name: 'Mountain Climbers', sets: 4, reps: '30s', muscle: 'Core', type: 'cardio', movementPattern: 'Plank' },
                { name: 'Jump Squats', sets: 4, reps: '12-15', muscle: 'Legs', type: 'power', movementPattern: 'Squat' },
                { name: 'Kettlebell Swings', sets: 4, reps: '15-20', muscle: 'Full Body', type: 'metabolic', movementPattern: 'Squat' }
            ],
            isolation: [
                { name: 'Battle Ropes', sets: 3, reps: '30s', muscle: 'Full Body', type: 'cardio', movementPattern: 'Core' },
                { name: 'Box Jumps', sets: 3, reps: '10-12', muscle: 'Legs', type: 'power', movementPattern: 'Squat' }
            ]
        },
        avoidExercises: []
    },
    '#SixPackAbs': {
        targetMuscles: ['core'],
        priority: 'high',
        focusType: 'hypertrophy',
        exercises: {
            compound: [
                { name: 'Hanging Leg Raises', sets: 4, reps: '10-15', muscle: 'Core', type: 'strength', movementPattern: 'Plank' },
                { name: 'Ab Wheel Rollout', sets: 3, reps: '8-12', muscle: 'Core', type: 'strength', movementPattern: 'Plank' },
                { name: 'Plank to Pike', sets: 3, reps: '12-15', muscle: 'Core', type: 'strength', movementPattern: 'Plank' }
            ],
            isolation: [
                { name: 'Cable Crunches', sets: 4, reps: '15-20', muscle: 'Core', type: 'hypertrophy', movementPattern: 'Plank' },
                { name: 'Russian Twists', sets: 3, reps: '20 each', muscle: 'Core', type: 'hypertrophy', movementPattern: 'Plank' },
                { name: 'Bicycle Crunches', sets: 3, reps: '20', muscle: 'Core', type: 'hypertrophy', movementPattern: 'Plank' }
            ]
        },
        avoidExercises: []
    },
    '#BigArms': {
        targetMuscles: ['arms'],
        priority: 'high',
        focusType: 'hypertrophy',
        exercises: {
            compound: [
                { name: 'Close Grip Bench Press', sets: 4, reps: '8-12', muscle: 'Triceps', type: 'compound', movementPattern: 'Push Up' },
                { name: 'Chin Ups', sets: 4, reps: '6-10', muscle: 'Biceps', type: 'compound', movementPattern: 'Pull' }
            ],
            isolation: [
                { name: 'Barbell Bicep Curls', sets: 4, reps: '10-12', muscle: 'Biceps', type: 'hypertrophy', movementPattern: 'Pull' },
                { name: 'Hammer Curls', sets: 3, reps: '10-12', muscle: 'Biceps', type: 'hypertrophy', movementPattern: 'Pull' },
                { name: 'Tricep Pushdown', sets: 4, reps: '12-15', muscle: 'Triceps', type: 'hypertrophy', movementPattern: 'Push Up' },
                { name: 'Overhead Tricep Extension', sets: 3, reps: '10-12', muscle: 'Triceps', type: 'hypertrophy', movementPattern: 'Push Up' }
            ]
        },
        avoidExercises: []
    },
    '#ChestGains': {
        targetMuscles: ['chest'],
        priority: 'high',
        focusType: 'hypertrophy',
        exercises: {
            compound: [
                { name: 'Barbell Bench Press', sets: 4, reps: '8-12', muscle: 'Chest', type: 'compound', movementPattern: 'Push Up' },
                { name: 'Incline Dumbbell Press', sets: 4, reps: '10-12', muscle: 'Chest', type: 'compound', movementPattern: 'Push Up' },
                { name: 'Dips', sets: 3, reps: '8-12', muscle: 'Chest', type: 'compound', movementPattern: 'Push Up' }
            ],
            isolation: [
                { name: 'Cable Crossover', sets: 3, reps: '12-15', muscle: 'Chest', type: 'hypertrophy', movementPattern: 'Push Up' },
                { name: 'Pec Deck Fly', sets: 3, reps: '12-15', muscle: 'Chest', type: 'hypertrophy', movementPattern: 'Push Up' },
                { name: 'Incline Fly', sets: 3, reps: '12-15', muscle: 'Chest', type: 'hypertrophy', movementPattern: 'Push Up' }
            ]
        },
        avoidExercises: []
    },
    '#Shoulders': {
        targetMuscles: ['shoulders'],
        priority: 'high',
        focusType: 'hypertrophy',
        exercises: {
            compound: [
                { name: 'Overhead Press', sets: 4, reps: '8-12', muscle: 'Shoulders', type: 'compound', movementPattern: 'Push Up' },
                { name: 'Arnold Press', sets: 3, reps: '10-12', muscle: 'Shoulders', type: 'compound', movementPattern: 'Push Up' }
            ],
            isolation: [
                { name: 'Dumbbell Lateral Raise', sets: 4, reps: '12-15', muscle: 'Shoulders', type: 'hypertrophy', movementPattern: 'Push Up' },
                { name: 'Front Raise', sets: 3, reps: '12-15', muscle: 'Shoulders', type: 'hypertrophy', movementPattern: 'Push Up' },
                { name: 'Reverse Pec Deck', sets: 3, reps: '15-20', muscle: 'Shoulders', type: 'hypertrophy', movementPattern: 'Pull' }
            ]
        },
        avoidExercises: []
    },
    '#Glutes': {
        targetMuscles: ['glutes', 'legs'],
        priority: 'high',
        focusType: 'hypertrophy',
        exercises: {
            compound: [
                { name: 'Hip Thrusts', sets: 4, reps: '10-15', muscle: 'Glutes', type: 'compound', movementPattern: 'Squat' },
                { name: 'Romanian Deadlift', sets: 4, reps: '8-12', muscle: 'Glutes', type: 'compound', movementPattern: 'Squat' },
                { name: 'Bulgarian Split Squats', sets: 3, reps: '10-12', muscle: 'Glutes', type: 'compound', movementPattern: 'Squat' }
            ],
            isolation: [
                { name: 'Cable Kickbacks', sets: 3, reps: '12-15', muscle: 'Glutes', type: 'hypertrophy', movementPattern: 'Squat' },
                { name: 'Fire Hydrants', sets: 3, reps: '15-20', muscle: 'Glutes', type: 'hypertrophy', movementPattern: 'Squat' },
                { name: 'Glute Bridge', sets: 4, reps: '15-20', muscle: 'Glutes', type: 'hypertrophy', movementPattern: 'Squat' }
            ]
        },
        avoidExercises: []
    },
    '#Legs': {
        targetMuscles: ['legs'],
        priority: 'high',
        focusType: 'hypertrophy',
        exercises: {
            compound: [
                { name: 'Barbell Squats', sets: 4, reps: '8-12', muscle: 'Legs', type: 'compound', movementPattern: 'Squat' },
                { name: 'Leg Press', sets: 4, reps: '10-15', muscle: 'Legs', type: 'compound', movementPattern: 'Squat' },
                { name: 'Walking Lunges', sets: 3, reps: '12-15', muscle: 'Legs', type: 'compound', movementPattern: 'Squat' }
            ],
            isolation: [
                { name: 'Leg Extensions', sets: 3, reps: '12-15', muscle: 'Legs', type: 'hypertrophy', movementPattern: 'Squat' },
                { name: 'Lying Leg Curls', sets: 3, reps: '10-12', muscle: 'Legs', type: 'hypertrophy', movementPattern: 'Squat' },
                { name: 'Calf Raises', sets: 4, reps: '15-20', muscle: 'Legs', type: 'hypertrophy', movementPattern: 'Squat' }
            ]
        },
        avoidExercises: []
    },
    '#GetStrong': {
        targetMuscles: ['full_body'],
        priority: 'high',
        focusType: 'strength',
        exercises: {
            compound: [
                { name: 'Barbell Squats', sets: 5, reps: '3-5', muscle: 'Legs', type: 'strength', movementPattern: 'Squat' },
                { name: 'Barbell Bench Press', sets: 5, reps: '3-5', muscle: 'Chest', type: 'strength', movementPattern: 'Push Up' },
                { name: 'Deadlift', sets: 5, reps: '3-5', muscle: 'Back', type: 'strength', movementPattern: 'Squat' },
                { name: 'Overhead Press', sets: 4, reps: '5-8', muscle: 'Shoulders', type: 'strength', movementPattern: 'Push Up' }
            ],
            isolation: [
                { name: 'Barbell Rows', sets: 4, reps: '6-8', muscle: 'Back', type: 'strength', movementPattern: 'Pull' }
            ]
        },
        avoidExercises: []
    },
    '#BuildMuscle': {
        targetMuscles: ['chest', 'back', 'legs', 'shoulders', 'arms'],
        priority: 'high',
        focusType: 'hypertrophy',
        exercises: {
            compound: [
                { name: 'Barbell Squats', sets: 4, reps: '8-12', muscle: 'Legs', type: 'compound', movementPattern: 'Squat' },
                { name: 'Bench Press', sets: 4, reps: '8-12', muscle: 'Chest', type: 'compound', movementPattern: 'Push Up' },
                { name: 'Deadlift', sets: 3, reps: '6-10', muscle: 'Back', type: 'compound', movementPattern: 'Squat' },
                { name: 'Pull Ups', sets: 4, reps: '8-12', muscle: 'Back', type: 'compound', movementPattern: 'Pull' },
                { name: 'Overhead Press', sets: 4, reps: '8-12', muscle: 'Shoulders', type: 'compound', movementPattern: 'Push Up' }
            ],
            isolation: [
                { name: 'Dumbbell Lateral Raise', sets: 3, reps: '12-15', muscle: 'Shoulders', type: 'hypertrophy', movementPattern: 'Push Up' },
                { name: 'Barbell Curls', sets: 3, reps: '10-12', muscle: 'Arms', type: 'hypertrophy', movementPattern: 'Pull' },
                { name: 'Tricep Pushdown', sets: 3, reps: '12-15', muscle: 'Arms', type: 'hypertrophy', movementPattern: 'Push Up' }
            ]
        },
        avoidExercises: []
    },
    '#PullUps': {
        targetMuscles: ['back', 'arms'],
        priority: 'high',
        focusType: 'skill',
        exercises: {
            compound: [
                { name: 'Pull Up Negatives', sets: 4, reps: '3-5', muscle: 'Back', type: 'skill', movementPattern: 'Pull' },
                { name: 'Assisted Pull Ups', sets: 4, reps: '6-10', muscle: 'Back', type: 'skill', movementPattern: 'Pull' },
                { name: 'Lat Pulldown', sets: 4, reps: '8-12', muscle: 'Back', type: 'strength', movementPattern: 'Pull' }
            ],
            isolation: [
                { name: 'Dumbbell Rows', sets: 3, reps: '10-12', muscle: 'Back', type: 'strength', movementPattern: 'Pull' },
                { name: 'Barbell Curls', sets: 3, reps: '8-12', muscle: 'Arms', type: 'strength', movementPattern: 'Pull' },
                { name: 'Dead Hangs', sets: 3, reps: '30-45s', muscle: 'Grip', type: 'endurance', movementPattern: 'Pull' }
            ]
        },
        avoidExercises: []
    },
    '#SquatPR': {
        targetMuscles: ['legs', 'core'],
        priority: 'high',
        focusType: 'strength',
        exercises: {
            compound: [
                { name: 'Barbell Squats', sets: 5, reps: '3-5', muscle: 'Legs', type: 'strength', movementPattern: 'Squat' },
                { name: 'Front Squats', sets: 4, reps: '5-8', muscle: 'Legs', type: 'strength', movementPattern: 'Squat' },
                { name: 'Pause Squats', sets: 3, reps: '5-6', muscle: 'Legs', type: 'strength', movementPattern: 'Squat' }
            ],
            isolation: [
                { name: 'Leg Press', sets: 4, reps: '8-12', muscle: 'Legs', type: 'strength', movementPattern: 'Squat' },
                { name: 'Bulgarian Split Squats', sets: 3, reps: '8-10', muscle: 'Legs', type: 'strength', movementPattern: 'Squat' },
                { name: 'Core Planks', sets: 3, reps: '45-60s', muscle: 'Core', type: 'stability', movementPattern: 'Plank' }
            ]
        },
        avoidExercises: []
    },
    '#BenchPR': {
        targetMuscles: ['chest', 'triceps'],
        priority: 'high',
        focusType: 'strength',
        exercises: {
            compound: [
                { name: 'Barbell Bench Press', sets: 5, reps: '3-5', muscle: 'Chest', type: 'strength', movementPattern: 'Push Up' },
                { name: 'Pause Bench Press', sets: 3, reps: '5-6', muscle: 'Chest', type: 'strength', movementPattern: 'Push Up' },
                { name: 'Close Grip Bench Press', sets: 4, reps: '6-8', muscle: 'Triceps', type: 'strength', movementPattern: 'Push Up' }
            ],
            isolation: [
                { name: 'Incline Dumbbell Press', sets: 4, reps: '8-10', muscle: 'Chest', type: 'strength', movementPattern: 'Push Up' },
                { name: 'Dips', sets: 3, reps: '8-12', muscle: 'Triceps', type: 'strength', movementPattern: 'Push Up' },
                { name: 'Cable Fly', sets: 3, reps: '12-15', muscle: 'Chest', type: 'hypertrophy', movementPattern: 'Push Up' }
            ]
        },
        avoidExercises: []
    },
    '#Deadlift': {
        targetMuscles: ['back', 'legs', 'core'],
        priority: 'high',
        focusType: 'strength',
        exercises: {
            compound: [
                { name: 'Deadlift', sets: 5, reps: '3-5', muscle: 'Back', type: 'strength', movementPattern: 'Squat' },
                { name: 'Romanian Deadlift', sets: 4, reps: '6-8', muscle: 'Back', type: 'strength', movementPattern: 'Squat' },
                { name: 'Deficit Deadlift', sets: 3, reps: '5-6', muscle: 'Back', type: 'strength', movementPattern: 'Squat' }
            ],
            isolation: [
                { name: 'Barbell Rows', sets: 4, reps: '8-10', muscle: 'Back', type: 'strength', movementPattern: 'Pull' },
                { name: 'Good Mornings', sets: 3, reps: '10-12', muscle: 'Back', type: 'strength', movementPattern: 'Squat' },
                { name: 'Hyperextensions', sets: 3, reps: '12-15', muscle: 'Back', type: 'strength', movementPattern: 'Squat' }
            ]
        },
        avoidExercises: []
    }
};

// ========================================
// 2️⃣ 智能組合算法（保持不變）
// ========================================

export function generateSmartPlan(selectedHashtags, options = {}) {
    const {
        intensity = 'medium',
        splitType = 'mixed',
        daysPerWeek = 4
    } = options;

    const painPoints = selectedHashtags.filter(tag => tag in PAIN_POINTS);
    const goals = selectedHashtags.filter(tag => tag in PRIMARY_GOALS);

    const exercisePool = {
        corrective: [],
        compound: [],
        isolation: [],
        mobility: []
    };

    const avoidList = new Set();

    painPoints.forEach(tag => {
        const painData = PAIN_POINTS[tag];
        if (painData.exercises.corrective) exercisePool.corrective.push(...painData.exercises.corrective);
        if (painData.exercises.strengthening) exercisePool.compound.push(...painData.exercises.strengthening);
        if (painData.avoidExercises) painData.avoidExercises.forEach(ex => avoidList.add(ex));
    });

    goals.forEach(tag => {
        const goalData = PRIMARY_GOALS[tag];
        if (goalData.exercises.compound) exercisePool.compound.push(...goalData.exercises.compound);
        if (goalData.exercises.isolation) exercisePool.isolation.push(...goalData.exercises.isolation);
    });

    Object.keys(exercisePool).forEach(category => {
        const seen = new Set();
        exercisePool[category] = exercisePool[category]
            .filter(ex => !avoidList.has(ex.name))
            .filter(ex => {
                if (seen.has(ex.name)) return false;
                seen.add(ex.name);
                return true;
            });
    });

    const intensityModifier = {
        light: { setsMultiplier: 0.75 },
        medium: { setsMultiplier: 1.0 },
        high: { setsMultiplier: 1.25 }
    };

    const modifier = intensityModifier[intensity] || intensityModifier.medium;

    Object.keys(exercisePool).forEach(category => {
        exercisePool[category] = exercisePool[category].map(ex => ({
            ...ex,
            sets: Math.max(2, Math.round(ex.sets * modifier.setsMultiplier))
        }));
    });

    // 🔥 修復：應用週期化邏輯
    const plan = generateWeeklyPlanWithProgression(exercisePool, { daysPerWeek, splitType, painPoints, goals });

    return {
        exercisePool,
        plan,
        summary: {
            totalExercises: {
                corrective: exercisePool.corrective.length,
                compound: exercisePool.compound.length,
                isolation: exercisePool.isolation.length
            },
            hasPainPoints: painPoints.length > 0,
            focusAreas: [...new Set([
                ...painPoints.map(p => PAIN_POINTS[p].targetMuscles).flat(),
                ...goals.map(g => PRIMARY_GOALS[g].targetMuscles).flat()
            ])]
        }
    };
}

// ========================================
// 🔥 3️⃣ 修復後的週計劃生成（含漸進邏輯）
// ========================================

export function generateWeeklyPlanWithProgression(exercisePool, options) {
    const { daysPerWeek, splitType } = options;
    const weeks = [];

    const template = (splitType === 'isolated' ?
        (daysPerWeek === 3 ? ['Chest+Triceps', 'Back+Biceps', 'Legs+Shoulders'] :
            daysPerWeek === 4 ? ['Chest', 'Back', 'Legs', 'Shoulders+Arms'] :
                ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms']) :
        (daysPerWeek === 3 ? ['Push', 'Pull', 'Legs'] :
            daysPerWeek === 4 ? ['Upper Push', 'Upper Pull', 'Lower Power', 'Full Body'] :
                ['Push', 'Pull', 'Legs', 'Upper', 'Lower']));

    // 🔥 關鍵修復：為每一週應用不同的參數
    for (let weekNum = 1; weekNum <= 4; weekNum++) {
        const weekParamsKey = `week${weekNum}_${weekNum === 1 ? 'base' : weekNum === 2 ? 'build' : weekNum === 3 ? 'peak' : 'deload'}`;
        const weekParams = WEEKLY_PARAMETERS[weekParamsKey];

        const week = {
            week_number: weekNum,
            week_type: weekParamsKey,
            parameters: weekParams,
            days: []
        };

        // 為每一天生成訓練
        week.days = template.map((focus, idx) => {
            const baseExercises = selectExercisesForFocus(exercisePool, focus);

            // 🔥 關鍵：應用週期化參數到每個動作
            const progressedExercises = baseExercises.map(ex => applyWeeklyProgression(ex, weekNum, weekParams));

            return {
                day_number: idx + 1,
                focus: focus,
                exercises: progressedExercises
            };
        });

        weeks.push(week);
    }

    return weeks;
}

// ========================================
// 🔥 4️⃣ 新增：應用週期化參數到單個動作
// ========================================

function applyWeeklyProgression(exercise, weekNumber, weekParams) {
    // 解析次數範圍（如 "8-12" → 取最大值）
    let baseReps = 10;
    const repsMatch = exercise.reps.match(/(\d+)-(\d+)/);
    if (repsMatch) {
        baseReps = parseInt(repsMatch[2]); // 取上限
    } else {
        const singleMatch = exercise.reps.match(/(\d+)/);
        if (singleMatch) {
            baseReps = parseInt(singleMatch[1]);
        }
    }

    let targetSets = exercise.sets;
    let targetReps = baseReps;

    // 根據週數應用不同的漸進
    if (weekNumber === 1) {
        // Week 1: 基準
        targetSets = exercise.sets;
        targetReps = baseReps;
    } else if (weekNumber === 2) {
        // Week 2: 容量增加 20%
        targetSets = exercise.sets;
        targetReps = Math.round(baseReps * weekParams.volumeMultiplier);
    } else if (weekNumber === 3) {
        // Week 3: 容量增加 30% + 組數增加
        targetSets = exercise.sets + 1;
        targetReps = Math.round(baseReps * weekParams.volumeMultiplier);
    } else if (weekNumber === 4) {
        // Week 4: Deload - 容量減少 40%
        targetSets = Math.max(2, exercise.sets - 1);
        targetReps = Math.round(baseReps * weekParams.volumeMultiplier);
    }

    return {
        ...exercise,
        sets: targetSets,
        reps: exercise.reps.includes('s') ? exercise.reps : `${Math.max(targetReps - 2, 1)}-${targetReps}`, // 時間類動作保持原樣
        rpe_target: weekParams.rpeTarget,
        week_focus: weekParams.focus,
        progression_notes: weekParams.progressionNotes,
        week_number: weekNumber,
        week_type: weekNumber === 1 ? 'BASE' : weekNumber === 2 ? 'BUILD' : weekNumber === 3 ? 'PEAK' : 'DELOAD'
    };
}

// ========================================
// 5️⃣ 動作選擇邏輯（保持不變）
// ========================================

function selectExercisesForFocus(exercisePool, focus) {
    const selected = [];

    const focusMap = {
        'Chest': ['Chest', 'Triceps'],
        'Back': ['Back', 'Biceps'],
        'Legs': ['Legs', 'Glutes'],
        'Shoulders': ['Shoulders'],
        'Arms': ['Arms', 'Biceps', 'Triceps'],
        'Push': ['Chest', 'Shoulders', 'Triceps'],
        'Pull': ['Back', 'Biceps', 'Arms'],
        'Upper Push': ['Chest', 'Shoulders', 'Triceps'],
        'Upper Pull': ['Back', 'Biceps'],
        'Lower Power': ['Legs', 'Glutes'],
        'Full Body': ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'],
        'Chest+Triceps': ['Chest', 'Triceps'],
        'Back+Biceps': ['Back', 'Biceps', 'Arms'],
        'Legs+Shoulders': ['Legs', 'Glutes', 'Shoulders'],
        'Shoulders+Arms': ['Shoulders', 'Arms', 'Biceps', 'Triceps']
    };

    const relevantMuscles = focusMap[focus] || [];
    const matches = (ex) => relevantMuscles.some(m => ex.muscle && ex.muscle.toLowerCase().includes(m.toLowerCase()));

    selected.push(...exercisePool.corrective.filter(matches).slice(0, 2));
    selected.push(...exercisePool.compound.filter(matches).slice(0, 3));
    selected.push(...exercisePool.isolation.filter(matches).slice(0, 2));

    return selected;
}

// ========================================
// 6️⃣ 導出
// ========================================

export default {
    PAIN_POINTS,
    PRIMARY_GOALS,
    WEEKLY_PARAMETERS,
    generateSmartPlan,
    generateWeeklyPlanWithProgression,
    applyWeeklyProgression
};
