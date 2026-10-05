import { resolveApiBase } from './apiHostFix';
/**
 * Heart Rate Zone Utilities
 * Calculate heart rate zones and determine current zone based on HR
 */

/**
 * Calculate heart rate zones based on age using the 208 - (0.7 * age) formula
 * @param {number} age - User's age in years
 * @returns {object} Zone configuration with min/max BPM for each zone
 */
export const calculateHeartRateZones = (age) => {
    if (!age || age < 15 || age > 100) {
        // Return default zones for age 26 if invalid age provided
        age = 26;
    }

    const maxHR = Math.round(208 - (0.7 * age));

    return {
        maxHR,
        zone1: {
            min: Math.round(maxHR * 0.50),
            max: Math.round(maxHR * 0.60),
            name: 'Warm-up',
            percentage: '50-60%'
        },
        zone2: {
            min: Math.round(maxHR * 0.60),
            max: Math.round(maxHR * 0.70),
            name: 'Fat Burn',
            percentage: '60-70%'
        },
        zone3: {
            min: Math.round(maxHR * 0.70),
            max: Math.round(maxHR * 0.80),
            name: 'Cardio',
            percentage: '70-80%'
        },
        zone4: {
            min: Math.round(maxHR * 0.80),
            max: Math.round(maxHR * 0.90),
            name: 'Threshold',
            percentage: '80-90%'
        },
        zone5: {
            min: Math.round(maxHR * 0.90),
            max: maxHR,
            name: 'Peak',
            percentage: '90-100%'
        }
    };
};

/**
 * Determine which zone the current heart rate falls into
 * @param {number} currentHR - Current heart rate in BPM
 * @param {object} zones - Zone configuration from calculateHeartRateZones
 * @returns {number} Zone number (1-5)
 */
export const getCurrentZone = (currentHR, zones) => {
    if (!zones || !currentHR) return 1;

    if (currentHR < zones.zone1.max) return 1;
    if (currentHR >= zones.zone2.min && currentHR < zones.zone2.max) return 2;
    if (currentHR >= zones.zone3.min && currentHR < zones.zone3.max) return 3;
    if (currentHR >= zones.zone4.min && currentHR < zones.zone4.max) return 4;
    if (currentHR >= zones.zone5.min) return 5;

    return 1; // Default to zone 1
};

/**
 * Fetch user profile to get age for zone calculation
 * @returns {Promise<number|null>} User's age or null if not found
 */
export const fetchUserAge = async () => {
    try {
        // 只讀「自己」的檔案。以前打 /api/user/profiles 拿全部人再挑最近更新的那個 —— 會拿到別人的年齡；
        // 那支現在也只回名字了。
        const uid = localStorage.getItem('userId');
        if (!uid) return null;
        const response = await fetch(`${resolveApiBase()}/api/user/profile/${encodeURIComponent(uid)}`);
        if (response.ok) {
            const profile = await response.json();
            // 沒填年齡就回 null —— 心率區間用假年齡算出來會誤導訓練強度
            return Number(profile?.age) > 0 ? Number(profile.age) : null;
        }
        return null;   // 讀不到就是不知道，呼叫端要提示去補年齡
    } catch (error) {
        // ✅ 降級處理：不拋出錯誤，僅警告並返回默認值
        console.warn('Failed to fetch user age, using default 26:', error);
        return 26;
    }
};

/**
 * Simulated heart rate for testing (will be replaced with real HR device data)
 * Generates realistic HR variation patterns
 * @param {number} baseHR - Base heart rate (default: 135)
 * @param {number} variance - Max variance (+/- BPM, default: 15)
 * @returns {number} Simulated heart rate
 */
export const simulateHeartRate = (baseHR = 135, variance = 15) => {
    const randomVariance = (Math.random() - 0.5) * 2 * variance;
    return Math.round(baseHR + randomVariance);
};

/**
 * Prepare interface for real HR device connection
 * This is a placeholder for future integration with:
 * - Web Bluetooth API for heart rate monitors
 * - Wearable device APIs
 * - Mobile app native HR sensors
 */
export const connectHeartRateDevice = async () => {
    // TODO: Implement Web Bluetooth connection
    // Example: https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API

    console.warn('Real HR device connection not yet implemented. Using simulated data.');
    return {
        connected: false,
        deviceName: 'Simulated HR Monitor',
        getHeartRate: () => simulateHeartRate()
    };
};
