/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * SWISS MOTION SYSTEM  —  React Components
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Re-exports all pure JS constants from swissMotion.js
 * and adds JSX-based React motion components.
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

// ─── All imports at the top ──────────────────────────────────────────
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { dur, ease } from './swissMotion.js';

// Re-export all pure JS constants so any file can import from swissMotion.jsx
export * from './swissMotion.js';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SWISS STAT COUNTER (animate a number from 0 → target)
// Usage: <SwissCounter value={85} suffix="%" />
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const SwissCounter = ({
  value = 0,
  decimals = 0,
  suffix = '',
  prefix = '',
  duration = 1200,
  delay = 0,
  className = '',
  style = {},
}) => {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const startTime = performance.now();
      const animate = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplay(eased * value);
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(animate);
        }
      };
      rafRef.current = requestAnimationFrame(animate);
    }, delay);

    return () => {
      clearTimeout(timer);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration, delay]);

  const formatted = display.toFixed(decimals);
  return (
    <span className={className} style={style}>
      {prefix}{formatted}{suffix}
    </span>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SWISS HAIRLINE — animated horizontal divider
// Usage: <SwissHairline delay={0.3} color="#D4AF6A" />
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const SwissHairline = ({
  delay = 0,
  color = 'rgba(212,175,106,0.35)',
  thickness = 1,
  className = '',
}) => (
  <motion.div
    className={className}
    initial={{ scaleX: 0, originX: '0%' }}
    animate={{ scaleX: 1 }}
    transition={{ duration: dur.slow, ease: ease.decel, delay }}
    style={{
      height: thickness,
      background: color,
      width: '100%',
      transformOrigin: 'left center',
    }}
  />
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SWISS MASK LINE — text mask reveal for headlines
// Wrap your text in this; it clips bottom-to-top
// Usage: <SwissMaskLine delay={0.2}><h1>Title</h1></SwissMaskLine>
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const SwissMaskLine = ({ children, delay = 0, className = '' }) => (
  <div style={{ overflow: 'hidden', display: 'block' }} className={className}>
    <motion.div
      initial={{ y: '110%' }}
      animate={{ y: '0%' }}
      transition={{ duration: dur.slow, ease: ease.decel, delay }}
    >
      {children}
    </motion.div>
  </div>
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SWISS REVEAL BLOCK — clip-path top-down editorial reveal
// Use for hero images or large color blocks
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const SwissRevealBlock = ({ children, delay = 0, className = '', style = {} }) => (
  <motion.div
    className={className}
    style={{ overflow: 'hidden', ...style }}
    initial={{ clipPath: 'inset(0 0 100% 0)' }}
    animate={{ clipPath: 'inset(0 0 0% 0)' }}
    transition={{ duration: dur.dramatic, ease: ease.decel, delay }}
  >
    {children}
  </motion.div>
);
