/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * DRVN  —  FashionReveal  /  Card-First Motion System
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Motion Personality  : PREMIUM  (Swiss Editorial / Luxury Magazine)
 * Motion Intensity    : 8 / Visual Density: 5
 *
 * Philosophy  "Card First, Data Second"
 * ─────────────────────────────────────────────────────
 *   t = 0ms   → Card shell renders at full opacity.
 *               Layout is complete. No jump, no flicker.
 *   t = 0ms   → Ghost shimmer fills the card interior.
 *               Viewers perceive "live content incoming".
 *   t = data  → Ghost dissolves: opacity 0, y −6px, blur 3px
 *               Duration 480ms, ease [0.76, 0, 0.24, 1]
 *   t = +60ms → Real content crystallizes in:
 *               opacity 0→1, y 10→0, blur 6→0
 *               Duration 550ms, same easing (Swiss decel)
 *   t = +N×50ms → Staggered children: each 50ms apart
 *
 * Zero layout shift: card min-height is always reserved.
 * No loading screen: the page IS the skeleton.
 * No spinner: motion IS the progress indicator.
 *
 * Three motion layers (motion-design skill contract):
 *   Primary   → Card reveal / ghost dissolve
 *   Secondary → Shimmer sweep across ghost blocks
 *   Ambient   → Gold hairline revalidation shimmer
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import React, {
  useState, useEffect, useRef, useCallback, useMemo
} from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

// ─── Shared Easing DNA (mirrors swissMotion.js) ───────────────────────────
const E = {
  decel:  [0.76, 0, 0.24, 1],   // Swiss editorial sharp deceleration
  md3:    [0.05, 0.7, 0.1,  1], // MD3 Emphasized dramatic entrance
  lift:   [0.4,  0, 0.2,   1],  // Gentle float
  out:    [0.3,  0, 1,     1],  // Decisive exit
};

const D = {
  micro:    0.15,
  quick:    0.30,
  standard: 0.48,
  slow:     0.55,
  dramatic: 1.00,
};

// ─── Shimmer animation keyframe (injected once) ───────────────────────────
const SHIMMER_KEYFRAME = `
  @keyframes fashionShimmer {
    0%   { background-position: 200% center; }
    100% { background-position: -200% center; }
  }
  @keyframes fashionShimmerGold {
    0%   { background-position: 200% center; }
    100% { background-position: -200% center; }
  }
`;

let _shimmerInjected = false;
function injectShimmer() {
  if (_shimmerInjected || typeof document === 'undefined') return;
  _shimmerInjected = true;
  const s = document.createElement('style');
  s.textContent = SHIMMER_KEYFRAME;
  document.head.appendChild(s);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// useReveal — Phase state machine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/**
 * Tracks reveal lifecycle: 'ghost' → 'dissolving' → 'complete'
 *
 * @param {boolean} isReady  — true when real data has arrived
 * @param {number}  minMs    — minimum ghost duration (avoids flash)
 * @returns {{ phase: 'ghost'|'dissolving'|'complete' }}
 */
export function useReveal(isReady, minMs = 180) {
  const [phase, setPhase] = useState(isReady ? 'complete' : 'ghost');
  const mountTime = useRef(Date.now());
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!isReady || phase === 'complete') return;
    const elapsed = Date.now() - mountTime.current;
    const remaining = Math.max(0, minMs - elapsed);
    const t = setTimeout(() => {
      if (reduced) {
        setPhase('complete');
      } else {
        setPhase('dissolving');
        // After dissolve animation (480ms), mark complete
        setTimeout(() => setPhase('complete'), 520);
      }
    }, remaining);
    return () => clearTimeout(t);
  }, [isReady, phase, minMs, reduced]);

  return { phase };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GhostLine — shimmer placeholder for text / labels
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/**
 * A single shimmer bar that stands in for text content.
 *
 * @param {string|number} width    — e.g. '60%' | '120px' | 80
 * @param {string}        height   — e.g. '0.875rem'
 * @param {string}        radius   — border-radius
 * @param {number}        delay    — animation delay in seconds
 * @param {'dark'|'light'|'gold'} theme
 */
export const GhostLine = React.memo(({
  width = '70%',
  height = '0.875rem',
  radius = '0.4rem',
  delay = 0,
  theme = 'dark',
  style = {},
}) => {
  injectShimmer();
  const baseColor = theme === 'gold'
    ? ['rgba(212,175,106,0.08)', 'rgba(212,175,106,0.18)', 'rgba(212,175,106,0.08)']
    : theme === 'light'
    ? ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.14)', 'rgba(255,255,255,0.06)']
    : ['rgba(22,20,21,0.05)',  'rgba(22,20,21,0.11)',  'rgba(22,20,21,0.05)'];

  return (
    <div
      aria-hidden="true"
      style={{
        width,
        height,
        borderRadius: radius,
        background: `linear-gradient(90deg, ${baseColor[0]} 0%, ${baseColor[1]} 50%, ${baseColor[0]} 100%)`,
        backgroundSize: '200% 100%',
        animation: `fashionShimmer 1.8s ease-in-out ${delay}s infinite`,
        ...style,
      }}
    />
  );
});
GhostLine.displayName = 'GhostLine';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GhostBlock — shimmer placeholder for card / image areas
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const GhostBlock = React.memo(({
  height = '8rem',
  width = '100%',
  radius = '1.25rem',
  delay = 0,
  theme = 'dark',
  style = {},
  className = '',
}) => {
  injectShimmer();
  const baseColor = theme === 'light'
    ? ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.11)', 'rgba(255,255,255,0.05)']
    : ['rgba(22,20,21,0.04)', 'rgba(22,20,21,0.09)', 'rgba(22,20,21,0.04)'];

  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        height,
        width,
        borderRadius: radius,
        background: `linear-gradient(90deg, ${baseColor[0]} 0%, ${baseColor[1]} 50%, ${baseColor[0]} 100%)`,
        backgroundSize: '200% 100%',
        animation: `fashionShimmer 1.8s ease-in-out ${delay}s infinite`,
        flexShrink: 0,
        ...style,
      }}
    />
  );
});
GhostBlock.displayName = 'GhostBlock';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RevealCard — The core primitive
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/**
 * "Card First, Data Second" — The main building block.
 *
 * Architecture (zero layout shift):
 *   Real content is ALWAYS in the DOM (determines card height).
 *   Ghost is position:absolute on top — covers real content visually.
 *   When isReady: ghost exits (y−8, blur, opacity 0), content fades in.
 *
 * Usage:
 *   <RevealCard
 *     isReady={!loading}
 *     ghost={
 *       <div style={{ background:'#F95C4B', borderRadius:28, height:'100%', padding:'1.25rem' }}>
 *         <GhostLine width="60%" theme="light" />
 *         <GhostLine width="80%" height="2rem" theme="light" delay={0.06} />
 *       </div>
 *     }
 *   >
 *     <MyCardContent />
 *   </RevealCard>
 *
 * @param {boolean}   isReady      — true when backend data has arrived
 * @param {ReactNode} ghost        — card-shaped shimmer matching real card bg/shape
 * @param {number}    minGhostMs   — minimum ghost duration (prevents flash, default 200ms)
 * @param {number}    staggerIndex — adds delay = index × 80ms for sequential card reveals
 * @param {boolean}   skipAnimation — skip all animation (cached data, no flicker)
 */
export const RevealCard = React.memo(({
  isReady,
  ghost,
  children,
  className = '',
  style = {},
  minGhostMs = 200,
  staggerIndex = 0,
  skipAnimation = false,
  revealDur = D.slow,      // 內容淡入時長（秒）；可調慢讓卡牌更柔和地浮現
  ghostExitDur = D.standard, // ghost 溶出時長（秒）
}) => {
  const { phase } = useReveal(isReady, minGhostMs);
  const reduced = useReducedMotion();
  const staggerDelay = staggerIndex * 0.08;

  // No animation: cached data or explicit skip
  if (skipAnimation || isReady === undefined) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  const ghostVisible = phase !== 'complete';
  const contentReady = phase === 'dissolving' || phase === 'complete';

  return (
    <div className={className} style={{ position: 'relative', ...style }}>
      {/* ── Real content — ALWAYS in DOM (determines card height) ── */}
      <motion.div
        animate={
          contentReady
            ? { opacity: 1, y: 0, filter: 'blur(0px)' }
            : { opacity: 0, y: 0, filter: 'blur(0px)' }
        }
        initial={{ opacity: 0 }}
        transition={
          contentReady
            ? {
                duration: reduced ? 0 : revealDur,
                ease: E.decel,
                delay: staggerDelay + 0.07,
              }
            : { duration: 0 }
        }
        // willChange removed — framer-motion manages GPU layer
      >
        {children}
      </motion.div>

      {/* ── Ghost shimmer — absolute, covers real content while loading ── */}
      <AnimatePresence>
        {ghostVisible && (
          <motion.div
            key="ghost"
            initial={{ opacity: 1 }}
            exit={reduced
              ? { opacity: 0 }
              : {
                  opacity: 0,
                  y: -8,
                  filter: 'blur(4px)',
                  transition: {
                    duration: ghostExitDur,
                    ease: E.decel,
                    delay: staggerDelay,
                  },
                }
            }
            style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              
            }}
          >
            {ghost}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
RevealCard.displayName = 'RevealCard';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RevealStat — Animated number / stat reveal
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/**
 * Shows "—" ghost while loading, then counts up to real value.
 * Pairs with RevealCard for hero numbers.
 *
 * Usage:
 *   <RevealStat
 *     isReady={!!data}
 *     value={data?.calories ?? 0}
 *     suffix=" kcal"
 *     decimals={0}
 *   />
 */
export const RevealStat = React.memo(({
  isReady,
  value = 0,
  decimals = 0,
  prefix = '',
  suffix = '',
  ghostWidth = '3rem',
  ghostHeight = '2rem',
  ghostRadius = '0.5rem',
  theme = 'dark',
  duration = 900,
  delay = 0,
  className = '',
  style = {},
}) => {
  const [display, setDisplay] = useState(0);
  const [revealed, setRevealed] = useState(isReady);
  const rafRef = useRef(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!isReady) return;
    setRevealed(true);
    if (reduced) { setDisplay(value); return; }
    const start = performance.now();
    const animate = (now) => {
      const progress = Math.min((now - start - delay * 1000) / duration, 1);
      if (progress < 0) { rafRef.current = requestAnimationFrame(animate); return; }
      const eased = 1 - Math.pow(1 - progress, 3); // cubic ease-out
      setDisplay(eased * value);
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isReady, value, duration, delay, reduced]);

  if (!revealed) {
    return (
      <GhostLine
        width={ghostWidth}
        height={ghostHeight}
        radius={ghostRadius}
        theme={theme}
      />
    );
  }

  return (
    <motion.span
      className={className}
      style={style}
      initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: D.slow, ease: E.decel }}
    >
      {prefix}{display.toFixed(decimals)}{suffix}
    </motion.span>
  );
});
RevealStat.displayName = 'RevealStat';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RevealField — Inline text field with ghost
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/**
 * Shows a ghost line while loading, then fades in real text.
 *
 * Usage:
 *   <RevealField isReady={!!data} ghostWidth="5rem">
 *     {data?.username}
 *   </RevealField>
 */
export const RevealField = React.memo(({
  isReady,
  children,
  ghostWidth = '6rem',
  ghostHeight = '0.875rem',
  ghostRadius = '0.375rem',
  theme = 'dark',
  delay = 0,
  className = '',
  style = {},
}) => {
  const reduced = useReducedMotion();

  if (!isReady) {
    return (
      <GhostLine
        width={ghostWidth}
        height={ghostHeight}
        radius={ghostRadius}
        theme={theme}
        delay={delay}
      />
    );
  }

  return (
    <motion.span
      className={className}
      style={style}
      initial={reduced ? undefined : { opacity: 0, y: 6, filter: 'blur(3px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: D.slow, ease: E.decel, delay }}
    >
      {children}
    </motion.span>
  );
});
RevealField.displayName = 'RevealField';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RevealList — Staggered list reveal
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/**
 * Wraps a list of items and staggers their entrance.
 * Each child receives a staggered delay (50ms apart).
 *
 * Usage:
 *   <RevealList isReady={!!data} count={data?.items.length ?? 3}>
 *     {data?.items.map(item => <ItemCard key={item.id} {...item} />)}
 *   </RevealList>
 */
export const RevealList = React.memo(({
  isReady,
  children,
  count = 3,               // number of ghost items while loading
  ghostHeight = '5rem',
  ghostRadius = '1rem',
  ghostTheme = 'dark',
  staggerMs = 50,
  className = '',
  style = {},
}) => {
  const [revealed, setRevealed] = useState(isReady);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (isReady && !revealed) {
      const t = setTimeout(() => setRevealed(true), 180);
      return () => clearTimeout(t);
    }
  }, [isReady, revealed]);

  if (!revealed) {
    return (
      <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', ...style }}>
        {Array.from({ length: count }).map((_, i) => (
          <GhostBlock
            key={i}
            height={ghostHeight}
            radius={ghostRadius}
            theme={ghostTheme}
            delay={i * (staggerMs / 1000)}
          />
        ))}
      </div>
    );
  }

  const items = React.Children.toArray(children);

  return (
    <div className={className} style={style}>
      {items.map((child, i) => (
        <motion.div
          key={i}
          initial={reduced ? undefined : { opacity: 0, y: 14, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{
            duration: D.slow,
            ease: E.decel,
            delay: i * (staggerMs / 1000),
          }}
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
});
RevealList.displayName = 'RevealList';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PageShimmerOverlay — Full-page card-first skeleton
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/**
 * The KEY component for page-level "Card First" experience.
 *
 * Sits absolutely over the real page (which is always rendered).
 * When isLoading = false, each shimmer block lifts away with a
 * staggered Swiss editorial dissolve — revealing the real cards
 * underneath, already fully rendered.
 *
 * How it works:
 *   1. Real page renders at opacity 0 initially.
 *   2. This overlay covers it with shimmer blocks.
 *   3. When data arrives: overlay blocks exit with stagger,
 *      real page fades in simultaneously.
 *   4. Result: each "card" appears to crystallize into existence.
 *
 * Usage:
 *   <div style={{ position: 'relative' }}>
 *     <RealPageContent />   ← always rendered
 *     <PageShimmerOverlay
 *       isLoading={loading}
 *       background={pageBackground}
 *       slots={[
 *         { type: 'header',     height: 60 },
 *         { type: 'hero',       height: 210, delay: 0 },
 *         { type: 'stats-row',  height: 96,  count: 3 },
 *         { type: 'card',       height: 140, delay: 0.12 },
 *         { type: 'card',       height: 112, delay: 0.18 },
 *       ]}
 *     />
 *   </div>
 *
 * @param {boolean}  isLoading — hides overlay when false
 * @param {string}   background — page background (matches real page)
 * @param {Object[]} slots — layout config for ghost blocks
 * @param {string}   paddingTop — top padding (for safe area)
 */
export const PageShimmerOverlay = React.memo(({
  isLoading,
  background = 'transparent',
  slots = [],
  paddingX = '20px',
  paddingTop = '54px',
  paddingBottom = '120px',
  gap = '8px',
  theme = 'dark',
  onHidden,
}) => {
  const reduced = useReducedMotion();

  // Call onHidden after overlay exits
  useEffect(() => {
    if (!isLoading && onHidden) {
      const t = setTimeout(onHidden, 700);
      return () => clearTimeout(t);
    }
  }, [isLoading, onHidden]);

  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          aria-hidden="true"
          aria-label="Loading content"
          initial={{ opacity: 1 }}
          exit={reduced ? { opacity: 0 } : undefined}
          style={{
            position: 'absolute',
            inset: 0,
            background,
            zIndex: 40,
            pointerEvents: 'none',
            paddingTop,
            paddingLeft: paddingX,
            paddingRight: paddingX,
            paddingBottom,
            display: 'flex',
            flexDirection: 'column',
            gap,
            overflow: 'hidden',
          }}
        >
          {slots.map((slot, i) => {
            const exitDelay = i * 0.07;
            const exitProps = reduced
              ? {}
              : {
                  exit: {
                    opacity: 0,
                    y: -8,
                    filter: 'blur(4px)',
                    transition: {
                      duration: D.standard,
                      ease: E.decel,
                      delay: exitDelay,
                    },
                  },
                };

            if (slot.type === 'header') {
              return (
                <motion.div
                  key={`slot-${i}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexShrink: 0,
                    paddingTop: slot.paddingTop ?? 0,
                  }}
                  {...exitProps}
                >
                  <GhostLine width="9rem" height="1.75rem" radius="0.5rem" theme={theme} delay={0} />
                  <GhostBlock width="2.5rem" height="2.5rem" radius="50%" theme={theme} delay={0.04} style={{ flexShrink: 0 }} />
                </motion.div>
              );
            }

            if (slot.type === 'hero') {
              return (
                <motion.div key={`slot-${i}`} style={{ flexShrink: 0 }} {...exitProps}>
                  <GhostBlock
                    height={slot.height ? `${slot.height}px` : '13rem'}
                    radius={slot.radius ?? '1.5rem'}
                    theme={theme}
                    delay={slot.delay ?? 0.04}
                    style={{ width: '100%' }}
                  />
                </motion.div>
              );
            }

            if (slot.type === 'stats-row') {
              const count = slot.count ?? 3;
              return (
                <motion.div
                  key={`slot-${i}`}
                  style={{ display: 'flex', gap: '0.75rem', flexShrink: 0 }}
                  {...exitProps}
                >
                  {Array.from({ length: count }).map((_, j) => (
                    <GhostBlock
                      key={j}
                      height={slot.height ? `${slot.height}px` : '6rem'}
                      radius={slot.radius ?? '1.25rem'}
                      theme={theme}
                      delay={(slot.delay ?? 0.08) + j * 0.04}
                      style={{ flex: 1 }}
                    />
                  ))}
                </motion.div>
              );
            }

            if (slot.type === 'grid') {
              const cols = slot.cols ?? 2;
              const rows = slot.rows ?? 1;
              return (
                <motion.div
                  key={`slot-${i}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${cols}, 1fr)`,
                    gap: '0.75rem',
                    flexShrink: 0,
                  }}
                  {...exitProps}
                >
                  {Array.from({ length: cols * rows }).map((_, j) => (
                    <GhostBlock
                      key={j}
                      height={slot.height ? `${slot.height}px` : '7rem'}
                      radius={slot.radius ?? '1.25rem'}
                      theme={theme}
                      delay={(slot.delay ?? 0.1) + j * 0.04}
                    />
                  ))}
                </motion.div>
              );
            }

            // Default: single card block
            return (
              <motion.div key={`slot-${i}`} style={{ flexShrink: 0 }} {...exitProps}>
                <GhostBlock
                  height={slot.height ? `${slot.height}px` : '8rem'}
                  radius={slot.radius ?? '1.5rem'}
                  theme={theme}
                  delay={slot.delay ?? exitDelay * 0.5}
                  style={{ width: '100%' }}
                />
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
});
PageShimmerOverlay.displayName = 'PageShimmerOverlay';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CardFirstPage — Full-page wrapper (convenience)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/**
 * Wraps a page so that:
 *   1. Real content is always rendered (for instant layout)
 *   2. PageShimmerOverlay covers it while loading
 *   3. Real content is initially at opacity 0.02 (prevents
 *      content peek-through during shimmer phase)
 *   4. When loading=false: shimmer lifts, content fades to 1
 *
 * Usage:
 *   <CardFirstPage
 *     isLoading={loading}
 *     background={pageGradient}
 *     slots={dashboardSlots}
 *     style={{ minHeight: '100dvh' }}
 *   >
 *     <DashboardContent />
 *   </CardFirstPage>
 */
export const CardFirstPage = React.memo(({
  isLoading,
  background,
  slots,
  paddingX,
  paddingTop,
  paddingBottom,
  gap,
  theme,
  children,
  className = '',
  style = {},
}) => {
  const reduced = useReducedMotion();

  return (
    <div
      className={className}
      style={{ position: 'relative', ...style }}
    >
      {/* Real content — fades from near-invisible to full */}
      <motion.div
        animate={{
          opacity: isLoading ? 0 : 1,
          // Slight lift as shimmer departs
          ...(isLoading ? {} : { y: 0 }),
        }}
        initial={{ opacity: 0 }}
        transition={
          reduced
            ? { duration: 0 }
            : {
                duration: D.slow,
                ease: E.decel,
                delay: 0.12,
              }
        }
        // willChange removed — framer-motion manages GPU layer
      >
        {children}
      </motion.div>

      {/* Shimmer overlay — always on top, exits when data arrives */}
      <PageShimmerOverlay
        isLoading={isLoading}
        background={background}
        slots={slots}
        paddingX={paddingX}
        paddingTop={paddingTop}
        paddingBottom={paddingBottom}
        gap={gap}
        theme={theme}
      />
    </div>
  );
});
CardFirstPage.displayName = 'CardFirstPage';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DataRevealSection — SWR-aware section-level reveal
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/**
 * For SWR-fetched sections within a page.
 * Shows ghost while data is null, reveals content when data arrives.
 * Hairline gold shimmer indicates background revalidation.
 *
 * Usage:
 *   const { data, isLoading, isValidating } = useWorkoutHistory(userId);
 *
 *   <DataRevealSection
 *     isLoading={isLoading && !data}
 *     isValidating={isValidating}
 *     slots={[{ type: 'card', height: 120 }, ...]}
 *   >
 *     <WorkoutHistoryList data={data} />
 *   </DataRevealSection>
 */
export const DataRevealSection = React.memo(({
  isLoading,
  isValidating,
  slots = [{ type: 'card', height: 100 }, { type: 'card', height: 100 }],
  theme = 'dark',
  paddingX = '0px',
  paddingTop = '0px',
  paddingBottom = '0px',
  children,
  className = '',
  style = {},
}) => {
  return (
    <div className={className} style={{ position: 'relative', ...style }}>
      {/* Gold hairline during background revalidation */}
      <AnimatePresence>
        {isValidating && !isLoading && (
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.4, ease: E.lift } }}
            transition={{ duration: 0.35, ease: E.lift }}
            style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, height: 1,
              transformOrigin: 'left center',
              background: `linear-gradient(
                90deg,
                transparent 0%,
                rgba(212,175,106,0.0) 10%,
                rgba(212,175,106,0.7) 45%,
                rgba(212,175,106,0.9) 50%,
                rgba(212,175,106,0.7) 55%,
                rgba(212,175,106,0.0) 90%,
                transparent 100%
              )`,
              pointerEvents: 'none',
              zIndex: 10,
            }}
          />
        )}
      </AnimatePresence>

      {/* Content with overlay shimmer while loading */}
      <CardFirstPage
        isLoading={isLoading}
        slots={slots}
        theme={theme}
        paddingX={paddingX}
        paddingTop={paddingTop}
        paddingBottom={paddingBottom}
        style={{ width: '100%' }}
      >
        {children}
      </CardFirstPage>
    </div>
  );
});
DataRevealSection.displayName = 'DataRevealSection';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Preset slot configurations
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/**
 * Ready-made slot configs for common page layouts.
 *
 * Usage:
 *   import { SLOTS } from './FashionReveal';
 *   <CardFirstPage slots={SLOTS.dashboard} ... />
 */
export const SLOTS = {
  /** Main mobile dashboard (ActionFirstDashboardMobile) */
  dashboard: [
    { type: 'header',    paddingTop: 8 },
    { type: 'hero',      height: 210,  delay: 0.02 },
    { type: 'stats-row', height: 96,   count: 3,  delay: 0.08 },
    { type: 'card',      height: 140,  delay: 0.14 },
    { type: 'card',      height: 112,  delay: 0.20 },
    { type: 'card',      height: 96,   delay: 0.26 },
  ],

  /** Nutrition page */
  nutrition: [
    { type: 'header',    paddingTop: 4 },
    { type: 'hero',      height: 220,  radius: '1.75rem',  delay: 0.02 },
    { type: 'stats-row', height: 80,   count: 3,  delay: 0.08 },
    { type: 'card',      height: 120,  radius: '1.5rem',   delay: 0.14 },
    { type: 'card',      height: 100,  delay: 0.20 },
  ],

  /** Progress / analytics page */
  progress: [
    { type: 'header' },
    { type: 'grid',      height: 110,  cols: 2,   delay: 0.04 },
    { type: 'card',      height: 200,  delay: 0.10 },
    { type: 'card',      height: 140,  delay: 0.16 },
    { type: 'card',      height: 100,  delay: 0.22 },
  ],

  /** Cardio / running page */
  cardio: [
    { type: 'header' },
    { type: 'hero',      height: 180,  delay: 0.02 },
    { type: 'stats-row', height: 80,   count: 4,  delay: 0.08 },
    { type: 'card',      height: 160,  delay: 0.14 },
  ],

  /** Social feed */
  feed: [
    { type: 'header' },
    { type: 'card',  height: 180, delay: 0.02 },
    { type: 'card',  height: 140, delay: 0.08 },
    { type: 'card',  height: 160, delay: 0.14 },
    { type: 'card',  height: 140, delay: 0.20 },
  ],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Default export — all named exports re-summarised
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default {
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
};
