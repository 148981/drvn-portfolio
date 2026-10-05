/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * DRVN  —  DataTransition System  v2
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Swiss Editorial Motion Language
 * Motion Intensity: 8 / Visual Density: 5
 *
 * Tier 1 — SWR Data Crossfade (existing, unchanged):
 *   <DataFade dataKey={…}>          ← Primary crossfade wrapper
 *   <SWRStatus isValidating={…} />  ← Hairline shimmer indicator
 *   <SWRSkeleton lines={n} />       ← First-load skeleton (inline)
 *   <SWRErrorState onRetry={fn} />  ← Error state (non-destructive)
 *   <SWRTransition …>               ← Convenience all-in-one
 *
 * Tier 2 — Card-First Fashion Reveal (new, re-exported from FashionReveal):
 *   <RevealCard isReady ghost={…}>  ← Card shell always, content reveals
 *   <RevealStat isReady value={n}>  ← Ghost "—" → count-up on data
 *   <RevealField isReady>           ← Ghost line → text on data
 *   <RevealList isReady count={n}>  ← Ghost list → staggered real items
 *   <PageShimmerOverlay isLoading>  ← Full-page overlay (page-level)
 *   <CardFirstPage isLoading slots> ← Convenience full-page wrapper
 *   <DataRevealSection isLoading>   ← SWR section-level card-first
 *   SLOTS                           ← Preset slot configs
 *
 * Motion Contract (Tier 2):
 *   t=0   → Card shell renders instantly, ghost shimmer fills interior
 *   t=data → Ghost: opacity 0, y −6px, blur 3px — 480ms Swiss decel
 *   t+60ms → Content: opacity 1, y 0, blur 0 — 550ms Swiss decel
 *   Stagger budget: 60ms per card (top→bottom)
 *
 * CRITICAL — keepPreviousData interplay:
 *   While SWR revalidates, `data` = stale cache → `dataKey` unchanged
 *   → AnimatePresence does NOT trigger → screen stays perfectly still.
 *   Only when NEW data lands does `dataKey` change → crossfade fires.
 *   This is the zero-flicker guarantee.
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import React, { useId } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { ease, dur } from '../utils/swissMotion.jsx'; // 🔵 Fix: 統一使用 .jsx 作為單一入口

// ── Tier 2: Card-First Fashion Reveal System (re-export) ──────────────────
// Any component that imports from DataTransition gets both tiers.
export {
  useReveal,
  GhostLine,
  GhostBlock,
  RevealCard,
  RevealStat,
  RevealField,
  RevealList,
  PageShimmerOverlay,
  CardFirstPage,
  DataRevealSection,
  SLOTS,
} from './FashionReveal';

// ─── Titanium Crossfade Variants ─────────────────────────────────────
// Duration deliberately kept asymmetric:
//   Exit  is shorter (snappier departure = decisive)
//   Enter is longer  (softer arrival = premium weight)

const CROSSFADE_EXIT = {
  opacity: 0,
  y: 6,
  filter: 'blur(3px)',
  transition: {
    duration: 0.20,
    ease: ease.out,             // [0.3, 0, 1, 1] — decisive exit
  },
};

const CROSSFADE_ENTER = {
  opacity: 1,
  y: 0,
  filter: 'blur(0px)',
  transition: {
    duration: 0.26,
    ease: ease.decel,           // [0.76, 0, 0.24, 1] — Swiss deceleration
  },
};

const CROSSFADE_INITIAL = {
  opacity: 0,
  y: 6,
  filter: 'blur(3px)',
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DataFade — Primary Export
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Wraps any content in a seamless stale→fresh crossfade.
 *
 * How to use:
 *
 *   const { data, isValidating } = useWorkoutHistory(userId);
 *   const history = data?.history ?? previousHistoryRef.current ?? [];
 *
 *   <DataFade dataKey={data ? JSON.stringify(data) : 'loading'}>
 *     <HistoryList items={history} />
 *   </DataFade>
 *
 * Shorthand — use a stable primitive as the key:
 *   <DataFade dataKey={`${userId}-${filterDate}`}>
 *
 * Props:
 *   dataKey   {string|number}  — Changes when new data arrives. The
 *                                crossfade fires on every key change.
 *                                Keep it stable while SWR revalidates
 *                                (so keepPreviousData = no animation).
 *   initial   {boolean}        — Skip animation on first mount.
 *   className {string}         — Forwarded to motion.div wrapper.
 *   style     {object}         — Forwarded to motion.div wrapper.
 */
export const DataFade = React.memo(({
  dataKey,
  children,
  initial = false,
  className = '',
  style = {},
}) => (
  <AnimatePresence mode="wait" initial={initial}>
    <motion.div
      key={dataKey}
      initial={CROSSFADE_INITIAL}
      animate={CROSSFADE_ENTER}
      exit={CROSSFADE_EXIT}
      className={className}
      style={{ willChange: 'opacity, transform, filter', ...style }}
    >
      {children}
    </motion.div>
  </AnimatePresence>
));

DataFade.displayName = 'DataFade';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SWRStatus — Background Revalidation Indicator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * A 1px hairline shimmer that appears at the top of its container
 * while SWR is revalidating in the background.
 *
 * Users see their OLD data perfectly intact, but a barely-visible
 * shimmer signals "this is live — data is refreshing".
 *
 * Place this inside a `position: relative` container:
 *
 *   <div style={{ position: 'relative' }}>
 *     <SWRStatus isValidating={isValidating} />
 *     <YourContent />
 *   </div>
 */
export const SWRStatus = React.memo(({ isValidating }) => (
  <AnimatePresence>
    {isValidating && (
      <motion.div
        aria-hidden="true"
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: 1, scaleX: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.4, ease: ease.lift } }}
        transition={{ duration: 0.35, ease: ease.lift }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          transformOrigin: 'left center',
          // Titanium gold shimmer — matches Swiss palette
          background: `linear-gradient(
            90deg,
            transparent 0%,
            rgba(212, 175, 106, 0.0) 10%,
            rgba(212, 175, 106, 0.7) 45%,
            rgba(212, 175, 106, 0.9) 50%,
            rgba(212, 175, 106, 0.7) 55%,
            rgba(212, 175, 106, 0.0) 90%,
            transparent 100%
          )`,
          pointerEvents: 'none',
          zIndex: 10,
        }}
      />
    )}
  </AnimatePresence>
));

SWRStatus.displayName = 'SWRStatus';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SWRSkeleton — First-Load Placeholder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Used ONLY on first load when there is no cached data yet.
 * Renders inline placeholder bars that match the layout height.
 * Never shows if keepPreviousData already has data.
 *
 * Props:
 *   lines   {number}  — Number of skeleton lines (default: 3)
 *   height  {string}  — Line height (default: '1rem')
 *   gap     {string}  — Gap between lines (default: '0.75rem')
 *   rounded {string}  — Border radius (default: '0.5rem')
 */
export const SWRSkeleton = React.memo(({
  lines = 3,
  height = '1rem',
  gap = '0.75rem',
  rounded = '0.5rem',
  className = '',
}) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.25, ease: ease.lift }}
    className={className}
    style={{ display: 'flex', flexDirection: 'column', gap }}
    aria-label="Loading content"
    aria-busy="true"
  >
    {Array.from({ length: lines }).map((_, i) => (
      <div
        key={i}
        style={{
          height,
          borderRadius: rounded,
          // Staggered widths: 100%, 85%, 70% for editorial feel
          width: i === lines - 1 ? '68%' : i % 2 === 0 ? '100%' : '84%',
          background: `linear-gradient(
            90deg,
            rgba(212,175,106,0.06) 0%,
            rgba(212,175,106,0.14) 50%,
            rgba(212,175,106,0.06) 100%
          )`,
          backgroundSize: '200% 100%',
          animation: `swrShimmer 1.6s ease-in-out ${i * 0.12}s infinite`,
        }}
      />
    ))}

    {/* Shimmer keyframe — injected once via a style tag */}
    <style>{`
      @keyframes swrShimmer {
        0%   { background-position: 200% center; }
        100% { background-position: -200% center; }
      }
    `}</style>
  </motion.div>
));

SWRSkeleton.displayName = 'SWRSkeleton';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SWRErrorState — Non-destructive Error Display
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Renders an elegant, minimal inline error card.
 * Because keepPreviousData = true, this only appears
 * on FIRST load failures (no previous data exists).
 * During background revalidation failures, old data
 * remains visible — this component is never rendered.
 *
 * Props:
 *   error    {Error}     — The SWR error object
 *   onRetry  {Function}  — Callback to trigger manual mutate()
 *   label    {string}    — Optional context label
 */
export const SWRErrorState = React.memo(({ error, onRetry, label = 'data' }) => {
  const is404 = error?.response?.status === 404;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: ease.lift }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '0.5rem',
        padding: '1.25rem 1.5rem',
        borderLeft: '1px solid rgba(249,92,75,0.4)',
        borderRadius: '0 0.5rem 0.5rem 0',
        background: 'rgba(249,92,75,0.04)',
      }}
    >
      <p style={{
        fontSize: '0.7rem',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'rgba(249,92,75,0.7)',
        margin: 0,
      }}>
        {is404 ? 'No data yet' : 'Connection error'}
      </p>
      <p style={{
        fontSize: '0.875rem',
        color: 'rgba(246,244,241,0.5)',
        margin: 0,
        lineHeight: 1.5,
      }}>
        {is404
          ? `No ${label} recorded yet. Start your first session.`
          : `Unable to load ${label}. Check your connection.`}
      </p>
      {onRetry && !is404 && (
        <motion.button {...pressProps('row')}
 onClick={onRetry}
 style={{
 marginTop: '0.25rem',
 fontSize: '0.75rem',
 letterSpacing: '0.1em',
 textTransform: 'uppercase',
 color: 'rgba(212,175,106,0.8)',
 background: 'none',
 border: 'none',
 cursor: 'pointer',
 padding: 0,
 transition: 'color 0.2s',
 }}
 onMouseEnter={(e) => e.target.style.color = 'rgba(212,175,106,1)'}
 onMouseLeave={(e) => e.target.style.color = 'rgba(212,175,106,0.8)'}
 >
          Retry
        </motion.button>
      )}
    </motion.div>
  );
});

SWRErrorState.displayName = 'SWRErrorState';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// withSWRTransition — Higher-Order Component helper
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Convenience wrapper that handles all three states
 * (loading skeleton / error / data) in one component.
 *
 * Usage:
 *   <SWRTransition
 *     data={data}
 *     isLoading={isLoading}
 *     isValidating={isValidating}
 *     error={error}
 *     mutate={mutate}
 *     dataKey={stableKey}
 *     skeleton={<SWRSkeleton lines={5} />}
 *     errorLabel="workout history"
 *   >
 *     {(resolvedData) => <HistoryList data={resolvedData} />}
 *   </SWRTransition>
 */
export const SWRTransition = React.memo(({
  data,
  isLoading,
  isValidating,
  error,
  mutate,
  dataKey,
  skeleton,
  errorLabel = 'content',
  className = '',
  style = {},
  children,
}) => {
  // First-load: no data and actively loading
  if (isLoading && !data) {
    return skeleton ?? <SWRSkeleton className={className} />;
  }

  // First-load error (no previous data to show)
  if (error && !data) {
    return (
      <SWRErrorState
        error={error}
        onRetry={mutate}
        label={errorLabel}
      />
    );
  }

  return (
    <div style={{ position: 'relative', ...style }} className={className}>
      {/* Hairline shimmer during background revalidation */}
      <SWRStatus isValidating={isValidating} />

      {/* Content crossfades when new data lands */}
      <DataFade dataKey={dataKey ?? JSON.stringify(data)}>
        {typeof children === 'function' ? children(data) : children}
      </DataFade>
    </div>
  );
});

SWRTransition.displayName = 'SWRTransition';
