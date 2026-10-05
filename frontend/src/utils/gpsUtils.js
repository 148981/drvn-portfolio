import { formatPaceMin as fmtPaceMin, formatDuration as fmtDuration } from './format';
/**
 * GPS and Cardio Calculation Utilities
 * Provides functions for distance, pace, elevation, and calorie calculations
 */

/**
 * Calculate distance between two GPS points using Haversine formula
 * @param {Object} point1 - {lat, lng}
 * @param {Object} point2 - {lat, lng}
 * @returns {number} Distance in kilometers
 */
export const calculateDistance = (point1, point2) => {
    const R = 6371; // Earth's radius in km
    const dLat = toRad(point2.lat - point1.lat);
    const dLng = toRad(point2.lng - point1.lng);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(point1.lat)) * Math.cos(toRad(point2.lat)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const toRad = (degrees) => degrees * (Math.PI / 180);

/**
 * Calculate total distance of a route
 * @param {Array} points - Array of {lat, lng} objects
 * @returns {number} Total distance in kilometers
 */
export const calculateTotalDistance = (points) => {
    if (!points || points.length < 2) return 0;

    let totalDistance = 0;
    for (let i = 1; i < points.length; i++) {
        totalDistance += calculateDistance(points[i - 1], points[i]);
    }
    return totalDistance;
};

/**
 * Calculate pace (min/km)
 * @param {number} distance - Distance in kilometers
 * @param {number} duration - Duration in seconds
 * @returns {number} Pace in minutes per kilometer
 */
export const calculatePace = (distance, duration) => {
    if (!distance || distance === 0) return 0;
    return (duration / 60) / distance; // min/km
};

/**
 * Format pace as MM:SS
 * @param {number} paceMinPerKm - Pace in minutes per km
 * @returns {string} Formatted pace (e.g., "5:23")
 */
// 🩹 J: 單一真相源 → utils/format.js（M'SS" 統一樣式）
export const formatPace = (paceMinPerKm) => fmtPaceMin(paceMinPerKm);

/**
 * Format duration as HH:MM:SS
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration
 */
export const formatDuration = (seconds) => fmtDuration(seconds);

/**
 * Calculate elevation gain from a series of points
 * @param {Array} points - Array of {lat, lng, elevation} objects
 * @returns {number} Total elevation gain in meters
 */
export const calculateElevationGain = (points) => {
    if (!points || points.length < 2) return 0;

    let totalGain = 0;
    for (let i = 1; i < points.length; i++) {
        const elevDiff = (points[i].elevation || 0) - (points[i - 1].elevation || 0);
        if (elevDiff > 0) {
            totalGain += elevDiff;
        }
    }
    return totalGain;
};

/**
 * Calculate slope/gradient between two points
 * @param {Object} point1 - {lat, lng, elevation}
 * @param {Object} point2 - {lat, lng, elevation}
 * @returns {number} Slope as percentage
 */
export const calculateSlope = (point1, point2) => {
    if (!point1.elevation || !point2.elevation) return 0;

    const distance = calculateDistance(point1, point2) * 1000; // Convert to meters
    const elevationChange = point2.elevation - point1.elevation;

    return (elevationChange / distance) * 100;
};

/**
 * Estimate calories burned during running
 * Based on MET (Metabolic Equivalent of Task) values
 * @param {number} distance - Distance in kilometers
 * @param {number} weightKg - User weight in kilograms
 * @param {number} pace - Pace in min/km
 * @returns {number} Estimated calories burned
 */
export const estimateCalories = (distance, weightKg, pace) => {
    // MET values based on pace
    let met;
    if (pace < 5) met = 11.5; // Very fast (< 5 min/km)
    else if (pace < 6) met = 9.8; // Fast (5-6 min/km)
    else if (pace < 7) met = 8.3; // Moderate (6-7 min/km)
    else met = 6.0; // Slow (> 7 min/km)

    const durationHours = (distance * pace) / 60;
    return Math.round(met * weightKg * durationHours);
};

/**
 * Get color based on speed for heat map visualization
 * @param {number} pace - Pace in min/km
 * @returns {string} RGB color string
 */
export const getSpeedColor = (pace) => {
    // Fast = Red, Slow = Blue
    if (pace < 4.5) return 'rgb(255, 0, 0)'; // Very fast - Red
    if (pace < 5.5) return 'rgb(255, 128, 0)'; // Fast - Orange
    if (pace < 6.5) return 'rgb(255, 255, 0)'; // Moderate - Yellow
    if (pace < 7.5) return 'rgb(0, 255, 0)'; // Slow - Green
    return 'rgb(0, 128, 255)'; // Very slow - Blue
};

/**
 * Simplify route using Douglas-Peucker algorithm
 * Reduces number of points while maintaining route shape
 * @param {Array} points - Array of {lat, lng} points
 * @param {number} tolerance - Simplification tolerance (default: 0.0001)
 * @returns {Array} Simplified array of points
 */
export const simplifyRoute = (points, tolerance = 0.0001) => {
    if (points.length <= 2) return points;

    // Find the point with maximum distance from line segment
    let maxDistance = 0;
    let index = 0;
    const end = points.length - 1;

    for (let i = 1; i < end; i++) {
        const distance = perpendicularDistance(points[i], points[0], points[end]);
        if (distance > maxDistance) {
            maxDistance = distance;
            index = i;
        }
    }

    // If max distance is greater than tolerance, recursively simplify
    if (maxDistance > tolerance) {
        const left = simplifyRoute(points.slice(0, index + 1), tolerance);
        const right = simplifyRoute(points.slice(index), tolerance);
        return [...left.slice(0, -1), ...right];
    }

    return [points[0], points[end]];
};

const perpendicularDistance = (point, lineStart, lineEnd) => {
    const dx = lineEnd.lat - lineStart.lat;
    const dy = lineEnd.lng - lineStart.lng;

    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag > 0) {
        const u = ((point.lat - lineStart.lat) * dx + (point.lng - lineStart.lng) * dy) / (mag * mag);
        const intersectionLat = lineStart.lat + u * dx;
        const intersectionLng = lineStart.lng + u * dy;
        return calculateDistance(point, { lat: intersectionLat, lng: intersectionLng });
    }

    return calculateDistance(point, lineStart);
};

/**
 * Generate hashtag for workout achievement
 * @param {number} distance - Distance in km
 * @param {number} duration - Duration in seconds
 * @returns {string} Achievement hashtag
 */
export const generateHashtag = (distance, duration) => {
    const distanceKm = Math.round(distance);
    const minutes = Math.round(duration / 60);

    if (distanceKm >= 10) return '#今日達成10K';
    if (distanceKm >= 5) return '#今日達成5K';
    if (distanceKm >= 3) return '#今日達成3K';
    if (minutes >= 30) return '#持續奔跑30分鐘';
    return '#開始跑步之旅';
};
