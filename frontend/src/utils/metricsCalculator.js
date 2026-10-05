import { epleyE1RM } from './strengthMath';
// 🔢 1RM 一律走 utils/strengthMath（2026-09 稽核）——
//    這裡原本沒有夾 reps，20 下的組會估出比實際高 20% 的 1RM，
//    跟其他頁面顯示的數字對不起來。

/**
 * Metrics Calculator
 * Calculates real metrics from workout history
 */

const estimate1RM = epleyE1RM;

// Helper: Get average of array
const average = (arr) => {
    if (arr.length === 0) return 0;
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
};

/**
 * Calculate Structural Score (0-100)
 * Based on compound lift progression
 */
export const calculateStructural = (plan) => {
    if (!plan || !plan.weeks) return 50; // Default

    // Major compound lifts to track
    const majorLifts = ['squat', 'deadlift', 'bench', 'press'];

    let totalScore = 0;
    let liftsFound = 0;

    majorLifts.forEach(liftType => {
        // Find all instances of this lift across all weeks
        const liftSets = [];

        plan.weeks.forEach(week => {
            week.days?.forEach(day => {
                day.exercises?.forEach(exercise => {
                    const exerciseName = exercise.name.toLowerCase();

                    // Match exercise to lift type
                    if (
                        (liftType === 'squat' && exerciseName.includes('squat')) ||
                        (liftType === 'deadlift' && exerciseName.includes('deadlift')) ||
                        (liftType === 'bench' && exerciseName.includes('bench')) ||
                        (liftType === 'press' && (exerciseName.includes('press') || exerciseName.includes('overhead')))
                    ) {
                        // Ensure sets is an array before iterating
                        if (Array.isArray(exercise.sets)) {
                            exercise.sets.forEach(set => {
                                if (set.weight && set.reps) {
                                    liftSets.push({
                                        weight: parseFloat(set.weight),
                                        reps: parseInt(set.reps),
                                        estimated1RM: estimate1RM(parseFloat(set.weight), parseInt(set.reps))
                                    });
                                }
                            });
                        }
                    }
                });
            });
        });

        if (liftSets.length > 0) {
            liftsFound++;

            // Get best and earliest 1RM
            const maxEstimated1RM = Math.max(...liftSets.map(s => s.estimated1RM));
            const firstEstimated1RM = liftSets[0].estimated1RM;

            // Calculate progression
            const progression = ((maxEstimated1RM - firstEstimated1RM) / firstEstimated1RM) * 100;

            // Score based on progression
            let liftScore = 0;
            if (progression > 10) liftScore = 25; // Excellent
            else if (progression > 5) liftScore = 22; // Very good
            else if (progression > 2) liftScore = 18; // Good
            else if (progression > 0) liftScore = 15; // Maintaining
            else liftScore = 10; // Need improvement

            totalScore += liftScore;
        }
    });

    // If no lifts found, return low score
    if (liftsFound === 0) return 30;

    // Average the scores
    const finalScore = (totalScore / liftsFound);
    return Math.min(Math.round(finalScore), 100);
};

/**
 * Calculate Metabolic Score (0-100)
 * Based on workout frequency and intensity
 */
export const calculateMetabolic = (plan) => {
    if (!plan || !plan.weeks) return 50;

    let totalWorkouts = 0;
    let totalSets = 0;
    let totalExercises = 0;

    plan.weeks.forEach(week => {
        week.days?.forEach(day => {
            if (day.exercises && day.exercises.length > 0) {
                totalWorkouts++;
                totalExercises += day.exercises.length;

                day.exercises.forEach(exercise => {
                    if (Array.isArray(exercise.sets)) {
                        totalSets += exercise.sets.length;
                    }
                });
            }
        });
    });

    const weeksCount = plan.weeks.length || 1;

    // Frequency score (0-40)
    const workoutsPerWeek = totalWorkouts / weeksCount;
    const frequencyScore = Math.min((workoutsPerWeek / 5) * 40, 40);

    // Volume score (0-30)
    const setsPerWorkout = totalSets / (totalWorkouts || 1);
    const volumeScore = Math.min((setsPerWorkout / 20) * 30, 30);

    // Diversity score (0-30)
    const exercisesPerWorkout = totalExercises / (totalWorkouts || 1);
    const diversityScore = Math.min((exercisesPerWorkout / 8) * 30, 30);

    return Math.round(frequencyScore + volumeScore + diversityScore);
};

/**
 * Calculate Alignment Score (0-100)
 * Based on unilateral vs bilateral exercise balance
 */
export const calculateAlignment = (plan) => {
    if (!plan || !plan.weeks) return 50;

    let totalExercises = 0;
    let unilateralCount = 0;

    // Keywords that indicate unilateral exercises
    const unilateralKeywords = [
        'single', 'one', 'unilateral', 'bulgarian',
        'lunge', 'step', 'pistol', 'split'
    ];

    plan.weeks.forEach(week => {
        week.days?.forEach(day => {
            day.exercises?.forEach(exercise => {
                totalExercises++;

                const exerciseName = exercise.name.toLowerCase();
                const isUnilateral = unilateralKeywords.some(keyword =>
                    exerciseName.includes(keyword)
                );

                if (isUnilateral) {
                    unilateralCount++;
                }
            });
        });
    });

    if (totalExercises === 0) return 50;

    const unilateralRatio = unilateralCount / totalExercises;

    // Ideal ratio is 25-40% unilateral
    let score;
    if (unilateralRatio >= 0.25 && unilateralRatio <= 0.40) {
        score = 100; // Perfect balance
    } else if (unilateralRatio >= 0.15 && unilateralRatio <= 0.50) {
        score = 85; // Good balance
    } else if (unilateralRatio >= 0.10 && unilateralRatio <= 0.60) {
        score = 70; // Fair balance
    } else if (unilateralRatio >= 0.05) {
        score = 55; // Some imbalance
    } else {
        score = 40; // Poor balance
    }

    return Math.round(score);
};

/**
 * Calculate Vitality Score (0-100)
 * Based on muscle recovery status
 */
export const calculateVitality = (recoveryData) => {
    if (!recoveryData || Object.keys(recoveryData).length === 0) return 50;

    const recoveryScores = Object.values(recoveryData).map(muscle => {
        const hoursAgo = muscle.hoursAgo || 999;

        if (hoursAgo < 24) return 100; // Fully recovered
        if (hoursAgo < 48) return 70;  // Recovering well
        if (hoursAgo < 72) return 40;  // Still needs rest
        return 20; // Undertrained or overtrained
    });

    const avgRecovery = average(recoveryScores);
    return Math.round(avgRecovery);
};

/**
 * Calculate all metrics at once
 */
export const calculateAllMetrics = (plan, recoveryData) => {
    return {
        structural: calculateStructural(plan),
        metabolic: calculateMetabolic(plan),
        alignment: calculateAlignment(plan),
        vitality: calculateVitality(recoveryData)
    };
};
