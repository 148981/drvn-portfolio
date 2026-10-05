/**
 * Exercise Recommendation Mapping
 * Maps recommendation types to specific exercises
 */

export const EXERCISE_MAPPING = {
    // 結構支撐不足 -> 深蹲
    "structural_low": {
        exercise: "squat",
        displayName: "深蹲 Squat",
        displayNameCN: "深蹲",
        reason: "強化核心穩定 + 下肢力量"
    },

    // 代謝引擎偏弱 -> 波比跳
    "metabolic_low": {
        exercise: "burpee",
        displayName: "波比跳 Burpee",
        displayNameCN: "波比跳",
        reason: "提升心肺 + 全身爆發力"
    },

    // 姿態校正需加強 -> 硬舉
    "alignment_low": {
        exercise: "deadlift",
        displayName: "硬舉 Deadlift",
        displayNameCN: "硬舉",
        reason: "改善姿態 + 背部力量"
    },

    // 身心韌性不足 -> 平板支撐
    "vitality_low": {
        exercise: "plank",
        displayName: "平板支撐 Plank",
        displayNameCN: "平板支撐",
        reason: "核心控制 + 神經穩定"
    },

    // Default fallback
    "default": {
        exercise: "squat",
        displayName: "深蹲 Squat",
        displayNameCN: "深蹲",
        reason: "基礎全身訓練"
    }
};

/**
 * Get recommended exercise based on weak metric
 * @param {string} weakMetric - The metric that needs improvement (structural, metabolic, alignment, vitality)
 * @returns {object} Exercise recommendation object
 */
export function getRecommendedExercise(weakMetric) {
    const key = `${weakMetric}_low`;
    return EXERCISE_MAPPING[key] || EXERCISE_MAPPING.default;
}

/**
 * Determine which metric needs most improvement from metrics data
 * @param {object} metrics - Object with structural, metabolic, alignment, vitality scores
 * @returns {string} The metric name that is lowest
 */
export function getWeakestMetric(metrics) {
    if (!metrics) return "structural";

    const metricScores = {
        structural: metrics.structural || 50,
        metabolic: metrics.metabolic || 50,
        alignment: metrics.alignment || 50,
        vitality: metrics.vitality || 50
    };

    // Find the lowest scoring metric
    let weakest = "structural";
    let lowestScore = metricScores.structural;

    for (const [metric, score] of Object.entries(metricScores)) {
        if (score < lowestScore) {
            lowestScore = score;
            weakest = metric;
        }
    }

    return weakest;
}
