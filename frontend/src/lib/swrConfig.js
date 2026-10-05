/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * DRVN  —  SWR Global Configuration
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Strategy: Stale-While-Revalidate
 *
 * Core UX Contract:
 *   1. keepPreviousData = true
 *      → Screen NEVER goes blank during re-fetch.
 *        Old data stays visible; new data crossfades in.
 *
 *   2. revalidateOnFocus = true
 *      → Silently refreshes when user returns to tab.
 *
 *   3. dedupingInterval = 8 000 ms
 *      → Prevents duplicate API calls within 8 s.
 *
 * Fetcher uses the existing axios apiClient so that:
 *   - JWT Bearer token is auto-attached (interceptor).
 *   - 401 → auth-changed event is fired (no duplicate logic).
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import apiClient from '../api/client';

/**
 * Universal SWR fetcher.
 * Receives the SWR key (URL string) and delegates to axios.
 * Throws on HTTP error so SWR captures it in `error`.
 */
export const fetcher = (url) =>
  apiClient.get(url).then((res) => res.data);

/**
 * Global SWR options — passed to <SWRConfig value={…}>.
 *
 * keepPreviousData : The cornerstone of graceful transitions.
 *   While a new request is in flight, `data` continues to return
 *   the last successful payload. `isValidating` = true signals
 *   the background refresh to the SWRStatus indicator.
 */
export const globalSWRConfig = {
  fetcher,

  // ── Core Strategy ───────────────────────────────
  keepPreviousData: true,

  // ── Revalidation Triggers ───────────────────────
  revalidateOnFocus: true,        // refresh when tab is re-activated
  revalidateOnReconnect: true,    // refresh after network recovery
  revalidateIfStale: true,        // always revalidate stale cache on mount

  // ── Performance Guards ──────────────────────────
  dedupingInterval: 8_000,        // collapse duplicate keys within 8 s
  focusThrottleInterval: 10_000,  // throttle focus-revalidation to 10 s
  loadingTimeout: 3_000,          // fire onLoadingSlow after 3 s

  // ── Retry Policy ────────────────────────────────
  errorRetryCount: 2,
  errorRetryInterval: 2_000,
  shouldRetryOnError: (err) => {
    // Do not retry on 401 (handled by axios interceptor)
    if (err?.response?.status === 401) return false;
    // Do not retry on 404 (data simply doesn't exist yet)
    if (err?.response?.status === 404) return false;
    return true;
  },

  // ── Dev Telemetry ────────────────────────────────
  onError: (err, key) => {
    if (import.meta.env.DEV) {
      console.warn(`[SWR] ${key}`, err?.response?.status ?? err.message);
    }
  },
  onLoadingSlow: (key) => {
    if (import.meta.env.DEV) {
      console.info(`[SWR] Slow request: ${key}`);
    }
  },
};
