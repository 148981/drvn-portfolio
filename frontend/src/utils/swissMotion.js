/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * SWISS MOTION SYSTEM  —  DRVN Fitness App  (純 JS 常數)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 🔵 Fix (Issue dup-swissMotion):
 * 此檔案（.js）只含純 JS 常數，不含 React 元件。
 * 需要 SwissMaskLine / SwissHairline / SwissCounter / SwissRevealBlock
 * 等 React 元件時，請改從 swissMotion.jsx 匯入，它已完整 re-export 此檔案所有內容。
 *
 * ✅ 建議匯入方式（統一使用）：
 *   import { ease, dur, SwissMaskLine } from '../utils/swissMotion.jsx';
 *
 * 此 .js 檔案保留供 Node.js / 純 JS 工具腳本使用，不加 JSX 依賴。
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Motion Personality: PREMIUM
 * Archetype: Swiss Editorial / Luxury Fashion Magazine
 *
 * Easing DNA:
 *   - swissDecel  : sharp deceleration (fashion reveal) → cubic-bezier(0.16, 1, 0.3, 1)
 *   - swissMD3    : Material Design 3 emphasized  → cubic-bezier(0.16, 1, 0.3, 1)
 *   - swissLift   : gentle float in               → cubic-bezier(0.16, 1, 0.3, 1)
 *   - swissOut    : snappy exit                   → cubic-bezier(0.16, 1, 0.3, 1)
 *
 * Duration Palette:
 *   - quick:    300ms  — micro-interactions, icon states
 *   - standard: 500ms  — card / content entrance
 *   - slow:     750ms  — hero / page-level reveals
 *   - dramatic: 1000ms — editorial curtain wipes
 *
 * Three Motion Layers (always):
 *   Primary   → The main animated element (hero / heading)
 *   Secondary → Supporting richness (shadows, icons)
 *   Ambient   → Background life (glow pulses, hairlines)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

// ─── Signature Easing Curves ────────────────────────────────────────
export const ease = {
  /** Swiss editorial — sharp enter, feather land */
  decel:   [0.76, 0, 0.24, 1],
  /** MD3 Emphasized — dramatic entrance */
  md3:     [0.05, 0.7, 0.1, 1],
  /** Gentle content lift */
  lift:    [0.4, 0, 0.2, 1],
  /** Decisive exit */
  out:     [0.3, 0, 1, 1],
  /** Ambient float loop */
  sine:    [0.45, 0, 0.55, 1],
};

// ─── Duration Palette (ms) ───────────────────────────────────────────
export const dur = {
  micro:    0.15,
  quick:    0.30,
  standard: 0.50,
  slow:     0.75,
  dramatic: 1.00,
};

// ─── Stagger Budgets ─────────────────────────────────────────────────
export const stagger = {
  micro:    0.04,
  standard: 0.08,
  dramatic: 0.14,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VARIANTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * PAGE LEVEL — Swiss curtain reveal
 * The page drops in from top via opacity + y
 */
export const pageVariants = {
  initial: { opacity: 0, y: 18 },
  enter: {
    opacity: 1,
    y: 0,
    transition: {
      duration: dur.slow,
      ease: ease.md3,
      staggerChildren: stagger.standard,
      delayChildren: 0.05,
    },
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: { duration: dur.quick, ease: ease.out },
  },
};

/**
 * HERO REVEAL — Editorial curtain (clip-path top-to-bottom)
 * Use with overflow:hidden parent
 */
export const heroReveal = {
  initial: { clipPath: 'inset(100% 0 0 0)', opacity: 0 },
  enter: {
    clipPath: 'inset(0% 0 0 0)',
    opacity: 1,
    transition: { duration: dur.dramatic, ease: ease.decel },
  },
};

/**
 * HEADLINE LIFT — Each line slides up from behind mask
 * Wrap the text element in an overflow:hidden div
 */
export const headlineLift = {
  initial: { y: '110%', opacity: 0 },
  enter: {
    y: '0%',
    opacity: 1,
    transition: { duration: dur.slow, ease: ease.decel },
  },
};

/**
 * CONTENT FADE UP — General content entrance
 * Light, clean, premium
 */
export const fadeUp = {
  initial: { opacity: 0, y: 20 },
  enter: {
    opacity: 1,
    y: 0,
    transition: { duration: dur.standard, ease: ease.lift },
  },
};

/**
 * FADE UP SLOW — Hero stat / number reveal
 */
export const fadeUpSlow = {
  initial: { opacity: 0, y: 28 },
  enter: {
    opacity: 1,
    y: 0,
    transition: { duration: dur.slow, ease: ease.decel },
  },
};

/**
 * STAGGER CONTAINER — Orchestrates child stagger
 */
export const staggerContainer = (delayChildren = 0.1, staggerAmt = stagger.standard) => ({
  initial: {},
  enter: {
    transition: {
      staggerChildren: staggerAmt,
      delayChildren,
    },
  },
});

/**
 * CARD REVEAL — Swiss editorial card entrance
 * Slight y-motion + opacity, shadow arrives after card
 */
export const cardReveal = {
  initial: { opacity: 0, y: 24, scale: 0.98 },
  enter: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: dur.standard, ease: ease.decel },
  },
};

/**
 * HAIRLINE EXPAND — horizontal rule reveals left→right
 */
export const hairlineExpand = {
  initial: { scaleX: 0, originX: 0 },
  enter: {
    scaleX: 1,
    transition: { duration: dur.slow, ease: ease.decel },
  },
};

/**
 * BADGE ENTER — small tag / label pops in
 */
export const badgeEnter = {
  initial: { opacity: 0, scale: 0.8, y: 4 },
  enter: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: dur.quick, ease: ease.lift },
  },
};

/**
 * SLIDE FROM LEFT — stat or label slides in from left
 */
export const slideFromLeft = {
  initial: { opacity: 0, x: -20 },
  enter: {
    opacity: 1,
    x: 0,
    transition: { duration: dur.standard, ease: ease.decel },
  },
};

/**
 * SLIDE FROM RIGHT
 */
export const slideFromRight = {
  initial: { opacity: 0, x: 20 },
  enter: {
    opacity: 1,
    x: 0,
    transition: { duration: dur.standard, ease: ease.decel },
  },
};

/**
 * NUMBER COUNTER CONFIG — use with useMotionValue + useTransform
 * Returns spring transition config for counting up
 */
export const numberCountConfig = {
  type: 'spring',
  stiffness: 60,
  damping: 18,
  mass: 0.8,
};

/**
 * AMBIENT FLOAT — continuous gentle bob for background elements
 */
export const ambientFloat = (duration = 8) => ({
  animate: {
    y: [-8, 8, -8],
    x: [-4, 4, -4],
  },
  transition: {
    duration,
    repeat: Infinity,
    ease: 'easeInOut',
  },
});

/**
 * AMBIENT PULSE — opacity breathe for glow/ambient elements
 */
export const ambientPulse = (duration = 4) => ({
  animate: { opacity: [0.4, 0.7, 0.4] },
  transition: {
    duration,
    repeat: Infinity,
    ease: ease.sine,
  },
});
