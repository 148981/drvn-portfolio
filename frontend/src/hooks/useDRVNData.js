/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * DRVN  —  Unified SWR Data Hooks
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * All GET endpoints are wrapped here.
 * Components import a single named hook → no raw apiClient
 * calls needed for read operations.
 *
 * Key behaviours (inherited from globalSWRConfig):
 *   • keepPreviousData = true  → no blank flashes
 *   • isValidating             → drives SWRStatus shimmer
 *   • mutate()                 → manual re-fetch (e.g. after POST)
 *
 * Naming convention:
 *   use<Resource>(params)  →  { data, isLoading, isValidating, error, mutate }
 *
 * Null-key guard:
 *   Passing null as the SWR key suspends the fetch until the
 *   dependency (e.g. userId) is available. This prevents
 *   unauthenticated requests on first render.
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import useSWR from 'swr';
import { mutate as globalMutate } from 'swr';

// ─── Workout ─────────────────────────────────────────────────────────

/**
 * @returns { data: { history: WorkoutSession[] }, isLoading, isValidating, error, mutate }
 */
export function useWorkoutHistory(userId, limit = 10) {
  return useSWR(
    userId ? `/api/workout/history/${userId}?limit=${limit}` : null
  );
}

/**
 * @returns { data: { overall_score, metrics, … }, isLoading, isValidating, error, mutate }
 */
export function useProgressStats(userId) {
  return useSWR(
    userId ? `/api/workout/progress/${userId}` : null
  );
}

// ─── Cardio ──────────────────────────────────────────────────────────

/**
 * @returns { data: { sessions: CardioSession[] }, … }
 */
export function useCardioSessions(userId, limit = 100) {
  return useSWR(
    userId ? `/api/cardio/sessions/${userId}?limit=${limit}` : null
  );
}

/**
 * @returns { data: { runs: CardioRun[] }, … }
 */
export function useCardioRuns(userId, limit = 50) {
  return useSWR(
    userId ? `/api/cardio/${userId}/runs?limit=${limit}` : null
  );
}

// ─── Nutrition ───────────────────────────────────────────────────────

/**
 * @returns { data: NutritionHistory, … }
 */
export function useNutritionHistory(userId, days = 7) {
  return useSWR(
    userId ? `/api/nutrition/sql/history/${userId}?days=${days}` : null
  );
}

// ─── Social & Challenges ─────────────────────────────────────────────

export function useChallenges() {
  return useSWR('/api/challenges/active');
}

export function useChallengeTemplates() {
  return useSWR('/api/challenges/templates');
}

export function useHashtagPool() {
  return useSWR('/api/hashtags/pool');
}

export function useGlobalFeed() {
  return useSWR('/api/feed/global');
}

// ─── Exercise Library ────────────────────────────────────────────────

export function useExercises() {
  return useSWR('/api/exercises/all');
}

export function useMultiExercises() {
  return useSWR('/api/multi-exercise/exercises');
}

// ─── Coaching ────────────────────────────────────────────────────────

export function useCoachMatches(userId) {
  return useSWR(
    userId ? `/api/coaches/match/${userId}` : null
  );
}

// ─── Segments ────────────────────────────────────────────────────────

export function useNearbySegments() {
  return useSWR('/api/segments/nearby?lat=25.033&lng=121.565&radius=10');
}

// ─── Weather ─────────────────────────────────────────────────────────

/**
 * Weather data — refreshed every 10 minutes.
 * revalidateOnFocus = false because weather doesn't change on tab switch.
 * @returns { data: { temperature, humidity, advice, rain, wind_speed }, … }
 */
export function useWeather() {
  return useSWR('/api/weather', {
    refreshInterval: 10 * 60 * 1000,   // 10 min auto-refresh
    revalidateOnFocus: false,           // weather is slow-changing
    keepPreviousData: true,
  });
}

// ─── Nutrition (daily + history) ─────────────────────────────────────

/**
 * Daily nutrition summary — used to pre-populate NutritionPageMobile cache.
 * Keyed by userId + date so switching dates triggers a fresh fetch.
 */
export function useNutritionDaily(userId, date) {
  return useSWR(
    userId && date ? `/api/nutrition/sql/daily/${userId}?date=${date}` : null
  );
}

export function useNutritionHistoryData(userId, days = 7) {
  return useSWR(
    userId && days ? `/api/nutrition/sql/history/${userId}?days=${days}` : null
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPOSITE: Dashboard parallel fetch
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Fires all three dashboard requests in parallel via SWR's
 * independent key mechanism — each has its own cache slot.
 *
 * Because keepPreviousData = true globally, if any slice is
 * already cached, it stays visible while the others refresh.
 *
 * @returns {Object} Combined dashboard state
 */
export function useDashboardData(userId, { historyLimit = 10, nutritionDays = 7 } = {}) {
  const history   = useWorkoutHistory(userId, historyLimit);
  const stats     = useProgressStats(userId);
  const nutrition = useNutritionHistory(userId, nutritionDays);

  return {
    // Data slices
    history:   history.data,
    stats:     stats.data,
    nutrition: nutrition.data,

    // Aggregate states
    isLoading:    history.isLoading    || stats.isLoading    || nutrition.isLoading,
    isValidating: history.isValidating || stats.isValidating || nutrition.isValidating,
    error:        history.error        || stats.error        || nutrition.error,

    // Mutate all three simultaneously (e.g. after saving a workout)
    mutate: () => Promise.all([
      history.mutate(),
      stats.mutate(),
      nutrition.mutate(),
    ]),

    // Individual mutators for surgical invalidation
    mutateHistory:   history.mutate,
    mutateStats:     stats.mutate,
    mutateNutrition: nutrition.mutate,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GLOBAL CACHE INVALIDATION HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Call after saving/modifying a workout to invalidate all
 * relevant cache keys without a full page reload.
 *
 * Usage (after POST):
 *   await saveWorkout(data);
 *   invalidateWorkoutCache(userId);
 */
export function invalidateWorkoutCache(userId) {
  if (!userId) return;
  globalMutate((key) =>
    typeof key === 'string' && (
      key.includes(`/api/workout/history/${userId}`) ||
      key.includes(`/api/workout/progress/${userId}`)
    )
  );
}

export function invalidateCardioCache(userId) {
  if (!userId) return;
  globalMutate((key) =>
    typeof key === 'string' && key.includes(`/api/cardio`) && key.includes(userId)
  );
}

export function invalidateNutritionCache(userId) {
  if (!userId) return;
  globalMutate((key) =>
    typeof key === 'string' && key.includes(`/api/nutrition`) && key.includes(userId)
  );
}
