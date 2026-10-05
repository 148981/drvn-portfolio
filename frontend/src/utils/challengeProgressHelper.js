// 🔑 改用共用 apiClient：自帶 JWT Bearer 攔截器與 401 自動導回登入。
//    先前自建的裸 axios 實例不會帶 token → 挑戰進度 API 會 401，徽章永遠拿不到。
import apiClient from '../api/client';
import { toLocalDateKey } from './localDate';

/**
 * Match challenge with activity type to determine if progress should be updated
 */
function matchChallengeWithActivity(challenge, activityData) {
    const { goal_type, category, template_id } = challenge;
    const { activity_type } = activityData;

    // 距離挑戰 - 僅有氧運動
    if (goal_type === 'distance' && activity_type === 'cardio') return true;

    // 時長挑戰 - 所有訓練類型
    if (goal_type === 'duration') return true;

    // 次數挑戰 - 根據類別判斷
    if (goal_type === 'frequency') {
        if (category === 'cardio' && activity_type === 'cardio') return true;
        if (category === 'strength' && activity_type === 'strength') return true;
        if (category === 'social' && activity_type === 'social') return true;
        if (category === 'nutrition' && activity_type === 'nutrition') return true;
        if (category === 'wellness' && activity_type === 'hydration') return true;
        if (category === 'variety') return true; // 多元訓練接受所有類型
    }

    // 連續天數挑戰 - 需要後端特殊處理
    if (goal_type === 'streak') {
        if (category === 'consistency' || category === 'onboarding') {
            // Allow basic workout types to count towards consistency/onboarding
            if (activity_type === 'strength' || activity_type === 'cardio' || activity_type === 'hiit') return true;
            return true; // Fallback
        }
        if (category === 'nutrition' && activity_type === 'nutrition') return true;
        if (category === 'wellness' && activity_type === 'hydration') return true;
    }

    // 生活習慣挑戰 - 特殊判斷
    if (category === 'lifestyle') {
        if (template_id?.includes('early_bird') && activityData.is_morning) return true;
        if (template_id?.includes('weekend') && activityData.is_weekend) return true;
        if (activity_type === 'cardio' || activity_type === 'strength') return true;
    }

    return false;
}

/**
 * Update challenge progress after completing an activity
 * @param {string} userId - User ID
 * @param {object} activityData - Activity data with type-specific fields
 * @returns {Promise<object>} - Returns completed challenges and badges earned
 */
export const updateChallengeProgress = async (userId, activityData) => {
    try {
        console.log('🏆 [Challenge] Updating progress for user:', userId, 'Activity:', activityData);

        // Get all active challenges for the user
        const challengesResponse = await apiClient.get('/api/challenges/active', {
            params: { user_id: userId }
        });

        const activeChallenges = challengesResponse.data.challenges || [];
        console.log(`🎯 [Challenge] Found ${activeChallenges.length} active challenges`);

        const completedChallenges = [];
        const badgesEarned = [];
        let updatedCount = 0;

        // Update progress for each matching active challenge
        for (const challenge of activeChallenges) {
            // Check if this activity should update this challenge
            const shouldUpdate = matchChallengeWithActivity(challenge, activityData);

            if (!shouldUpdate) {
                console.log(`⏭️  [Challenge] Skipping ${challenge.name} (type mismatch) - Goal: ${challenge.goal_type}, Cat: ${challenge.category}, Act: ${activityData.activity_type}`);

                continue;
            }

            try {
                console.log(`✨ [Challenge] Updating ${challenge.name}...`);

                const response = await apiClient.post(
                    `/api/challenges/${challenge.challenge_id}/update-progress`,
                    {
                        user_id: userId,
                        activity_data: activityData
                    }
                );

                updatedCount++;
                console.log(`✅ [Challenge] ${challenge.name} updated. Progress: ${response.data.current_progress}/${challenge.goal_value}`);

                // Check if challenge was just completed
                if (response.data.badge_earned) {
                    console.log(`🎉 [Challenge] COMPLETED: ${challenge.name}!`);
                    completedChallenges.push(challenge);
                    badgesEarned.push({
                        challenge,
                        badge: {
                            icon: challenge.badge_icon,
                            color: challenge.badge_color,
                            reward_points: challenge.reward_points || 50
                        }
                    });
                }
            } catch (error) {
                console.error(`❌ [Challenge] Failed to update ${challenge.challenge_id}:`, error);
            }
        }

        console.log(`🏁 [Challenge] Update complete. Updated: ${updatedCount}, Completed: ${completedChallenges.length}`);

        return {
            success: true,
            completedChallenges,
            badgesEarned,
            totalUpdated: updatedCount
        };
    } catch (error) {
        console.error('❌ [Challenge] Failed to update challenge progress:', error);
        return {
            success: false,
            error: error.message,
            completedChallenges: [],
            badgesEarned: [],
            totalUpdated: 0
        };
    }
};

/**
 * Helper: Check if current time is morning (before 6 AM)
 */
export function isMorningActivity() {
    const hour = new Date().getHours();
    return hour < 6;
}

/**
 * Helper: Check if current day is weekend
 */
export function isWeekendActivity() {
    const day = new Date().getDay();
    return day === 0 || day === 6; // Sunday or Saturday
}

/**
 * Example usage in different components:
 * 
 * // CardioResultsView - After saving cardio activity
 * const result = await updateChallengeProgress(userId, {
 *     distance_km: metrics.distance,
 *     duration_minutes: metrics.duration / 60,
 *     activity_type: 'cardio',
 *     timestamp: new Date().toISOString(),
 *     is_morning: isMorningActivity(),
 *     is_weekend: isWeekendActivity()
 * });
 * 
 * // WorkoutSessionView - After completing strength training
 * const result = await updateChallengeProgress(userId, {
 *     activity_type: 'strength',
 *     workout_type: 'gym',
 *     duration_minutes: sessionDuration,
 *     timestamp: new Date().toISOString()
 * });
 * 
 * // NutritionPage - After logging nutrition
 * const result = await updateChallengeProgress(userId, {
 *     activity_type: 'nutrition',
 *     is_balanced: true,
 *     timestamp: new Date().toISOString(),
 *     date: toLocalDateKey(new Date())
 * });
 * 
 * // SocialFeedView - After sharing activity
 * const result = await updateChallengeProgress(userId, {
 *     activity_type: 'social',
 *     action: 'share',
 *     timestamp: new Date().toISOString()
 * });
 * 
 * // Show celebration if completed
 * if (result.badgesEarned?.length > 0) {
 *     setCompletedChallenge(result.badgesEarned[0].challenge);
 *     setShowCelebration(true);
 * }
 */

export default updateChallengeProgress;
