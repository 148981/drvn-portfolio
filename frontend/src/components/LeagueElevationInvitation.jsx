/**
 * LeagueElevationInvitation — Swiss Editorial Edition v4.0
 * design-taste-frontend: DESIGN_VARIANCE:9, MOTION_INTENSITY:8, VISUAL_DENSITY:3
 * Palette: Deep Black #161415 · Paper #F6F4F1 · Stone #E4DED2 · Coral #F95C4B · Ember #D94030
 * Swiss magazine DNA: radical white space, left-aligned editorial hierarchy,
 *   coral as the only accent, matte surfaces, zero decoration.
 */
'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LEAGUES, getCurrentLeague, getTargetLeague, setCurrentLeague } from '../utils/leagueStore';
import { T } from '../utils/theme';
import { haptic } from '../utils/haptics';

/* ── Image Mapping ── */
const LEAGUE_BG_IMAGES = {
  bronze: '/desktop/coppercard.jpeg',
  silver: '/desktop/11.jpeg',
  gold: '/desktop/goldcard.jpeg',
  black: '/desktop/blackcard1.jpeg',
};

/* ── Design tokens ── */


/* ── Haptic ── */
// haptic 由全域 utils/haptics 提供

/* ── Motion presets ── */
const SPRING   = { type: 'spring', stiffness: 300, damping: 34, mass: 1.6 };
const SPRING_Q = { type: 'spring', stiffness: 460, damping: 40 };
const SILK     = [0.16, 1, 0.3, 1];

/* ── Coral particle burst ── */
function useCoralDust(canvasRef, active) {
  useEffect(() => {
    if (!active || !canvasRef.current) return;
    const c = canvasRef.current;
    const ctx = c.getContext('2d');
    c.width = window.innerWidth;
    c.height = window.innerHeight;
    const cx = c.width / 2, cy = c.height / 2;

    const pts = Array.from({ length: 62 }, () => {
      const a = Math.random() * Math.PI * 2;
      const spd = 1.4 + Math.random() * 3.4;
      return {
        x: cx, y: cy,
        vx: Math.cos(a) * spd * (0.45 + Math.random()),
        vy: Math.sin(a) * spd * (0.45 + Math.random()) - 1.6,
        r: 1.0 + Math.random() * 2.4,
        life: 1,
        decay: 0.009 + Math.random() * 0.014,
        isCoral: Math.random() > 0.35,
      };
    });

    let raf, dead = false;
    const loop = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      let alive = false;
      pts.forEach(p => {
        if (p.life <= 0) return;
        p.x += p.vx; p.y += p.vy; p.vy += 0.04;
        p.life -= p.decay;
        alive = true;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * Math.max(p.life, 0), 0, Math.PI * 2);
        ctx.fillStyle = p.isCoral
          ? `rgba(249,92,75,${p.life * 0.72})`
          : `rgba(217,64,48,${p.life * 0.50})`;
        ctx.fill();
      });
      if (alive && !dead) raf = requestAnimationFrame(loop);
      else ctx.clearRect(0, 0, c.width, c.height);
    };
    raf = requestAnimationFrame(loop);
    return () => { dead = true; cancelAnimationFrame(raf); };
  }, [active, canvasRef]);
}

/* ── Coral ripple ── */
function useCoralRipple(canvasRef, active) {
  useEffect(() => {
    if (!active || !canvasRef.current) return;
    const c = canvasRef.current;
    const ctx = c.getContext('2d');
    c.width = window.innerWidth; c.height = window.innerHeight;
    const cx = c.width / 2, cy = c.height * 0.74;
    const maxR = Math.hypot(cx, cy) * 1.3;
    const start = performance.now(), dur = 850;
    let raf;
    const loop = now => {
      const t = Math.min((now - start) / dur, 1);
      const e = 1 - Math.pow(1 - t, 3);
      ctx.clearRect(0, 0, c.width, c.height);
      const r = maxR * e, a = (1 - t) * 0.38;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(249,92,75,${a})`; ctx.lineWidth = 1; ctx.stroke();
      if (r > 50) {
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(249,92,75,${a * 0.3})`; ctx.lineWidth = 0.5; ctx.stroke();
      }
      if (t < 1) raf = requestAnimationFrame(loop);
      else ctx.clearRect(0, 0, c.width, c.height);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, canvasRef]);
}

/* ════════════════════════════════
   PHASE 0 — SPLASH
   Swiss: just a wordmark + rule
════════════════════════════════ */
/* ── 精品級文字遮罩揭示組件 ── */
const TextReveal = ({ children, delay = 0, duration = 1.6, style }) => (
  <div style={{ overflow: 'hidden', ...style }}>
    <motion.span
      initial={{ y: '110%', opacity: 0, rotateX: 25 }}
      animate={{ y: 0, opacity: 1, rotateX: 0 }}
      transition={{ duration, ease: [0.16, 1, 0.3, 1], delay }}
      style={{ display: 'inline-block', transformOrigin: 'top left', willChange: 'transform, opacity' }}
    >
      {children}
    </motion.span>
  </div>
);

// 瑞士排版式進場：父層交錯（stagger），子元素依序精準揭示。
const SPLASH_CONTAINER = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.14, delayChildren: 0.12 } },
  exit: { transition: { staggerChildren: 0.05, staggerDirection: -1 } },
};
// 遮罩式大字：整行從「下方」滑入被 overflow 切齊的視窗（clip reveal）。
const LINE_MASK = { hidden: {}, visible: {}, exit: {} };
const LINE_INNER = {
  hidden: { y: '110%' },
  visible: { y: '0%', transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1] } },
  exit: { y: '-110%', transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};
// 一般元素：由下淡入
const RISE = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, y: -12, transition: { duration: 0.4 } },
};
// 色點：spring 彈入
const DOT_POP = {
  hidden: { scale: 0, opacity: 0 },
  visible: { scale: 1, opacity: 1, transition: { type: 'spring', stiffness: 500, damping: 16 } },
  exit: { scale: 0, opacity: 0, transition: { duration: 0.3 } },
};
// 底線：橫向 scaleX 延伸
const RULE_GROW = {
  hidden: { scaleX: 0 },
  visible: { scaleX: 1, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } },
  exit: { scaleX: 0, transition: { duration: 0.3 } },
};

const BigLine = ({ text, color, mb }) => (
  <motion.div variants={LINE_MASK} style={{ overflow: 'hidden', marginBottom: mb }}>
    <motion.span
      variants={LINE_INNER}
      style={{
        display: 'block', fontFamily: '"Outfit", sans-serif',
        fontSize: 'min(72px, 17vw)', fontWeight: 700, lineHeight: 0.92,
        letterSpacing: '-3px', color, willChange: 'transform',
      }}
    >
      {text}
    </motion.span>
  </motion.div>
);

const SplashPhase = ({ targetLeague }) => (
  <motion.div
    key="splash"
    variants={SPLASH_CONTAINER}
    initial="hidden"
    animate="visible"
    exit="exit"
    style={{
      position: 'absolute', display: 'flex', flexDirection: 'column',
      alignItems: 'flex-start', padding: '0 4px', width: '100%',
    }}
  >
    {/* 色點 spring 彈入 + 標籤由下淡入 */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 }}>
      <motion.span variants={DOT_POP} style={{ width: 8, height: 8, borderRadius: '50%', background: T.coral, flexShrink: 0 }} />
      <motion.span variants={RISE} style={{ fontSize: 9, letterSpacing: '4px', textTransform: 'uppercase', color: 'rgba(246,244,241,0.55)', fontFamily: '"Outfit", sans-serif', fontWeight: 500 }}>
        DRVN · Elite Programme
      </motion.span>
    </div>

    {/* 遮罩揭示大字：YOU'RE / IN.（自帶交錯，讓兩行依序滑入）*/}
    <motion.div
      role="heading" aria-level={1}
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.12 } }, exit: { transition: { staggerChildren: 0.06, staggerDirection: -1 } } }}
      style={{ marginBottom: 28 }}
    >
      <BigLine text="YOU'RE" color="#F6F4F1" mb={2} />
      <BigLine text="IN." color={T.coral} mb={0} />
    </motion.div>

    {/* 態度短語 */}
    <motion.span variants={RISE} style={{ fontSize: 14, fontWeight: 500, color: 'rgba(246,244,241,0.55)', fontFamily: '"Outfit", sans-serif', letterSpacing: '0.5px' }}>
      一封只給你的邀請。
    </motion.span>

    {/* 珊瑚底線橫向延伸 */}
    <motion.div variants={RULE_GROW} style={{ width: 56, height: 3, borderRadius: 2, background: T.coral, margin: '32px 0 0', transformOrigin: 'left', willChange: 'transform' }} />
  </motion.div>
);

/* ════════════════════════════════
   PHASE 1 — ENVELOPE
   Swiss: flat dark card, coral seal
════════════════════════════════ */
const EnvelopePhase = ({ targetLeague, onOpen, isLightCard }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      key="envelope"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16, filter: 'blur(4px)' }}
      transition={SPRING}
      style={{
        position: 'absolute', width: '100%',
        display: 'flex', flexDirection: 'column', gap: 24,
      }}
    >
      <motion.div
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
        animate={{ y: hovered ? -3 : 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        onClick={onOpen}
        style={{ cursor: 'pointer', position: 'relative' }}
      >
        {/* Ground shadow */}
        <div style={{
          position: 'absolute', bottom: -14,
          left: '8%', right: '8%', height: 20,
          background: 'radial-gradient(ellipse, rgba(0,0,0,0.55) 0%, transparent 70%)',
          filter: 'blur(8px)',
          transform: hovered ? 'scaleX(0.9) translateY(4px)' : 'scaleX(1)',
          transition: 'transform 0.35s ease',
          zIndex: 1,
        }} />

        {/* Warm Ambient Backlight (氛圍燈暖色背光光源 - 呼吸脈動效果) */}
        <motion.div
          animate={{
            opacity: hovered ? [0.18, 0.32, 0.18] : [0.12, 0.22, 0.12],
            scale: hovered ? 1.05 : 1.01,
          }}
          transition={{
            duration: 4.2,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
          style={{
            position: 'absolute', inset: -24,
            background: `radial-gradient(circle, rgba(249,92,75,0.22) 0%, transparent 68%)`,
            filter: 'blur(28px)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        {/* Envelope (霧面鈦金屬背板 + 呼吸氛圍外/內燈效) */}
        <motion.div
          animate={{
            boxShadow: hovered ? [
              '0 24px 50px rgba(0,0,0,0.85), 0 0 35px rgba(249, 92, 75, 0.10), inset 0 0 16px rgba(249, 92, 75, 0.14)',
              '0 24px 50px rgba(0,0,0,0.85), 0 0 52px rgba(249, 92, 75, 0.20), inset 0 0 24px rgba(249, 92, 75, 0.24)',
              '0 24px 50px rgba(0,0,0,0.85), 0 0 35px rgba(249, 92, 75, 0.10), inset 0 0 16px rgba(249, 92, 75, 0.14)',
            ] : [
              '0 24px 50px rgba(0,0,0,0.85), 0 0 25px rgba(249, 92, 75, 0.06), inset 0 0 12px rgba(249, 92, 75, 0.10)',
              '0 24px 50px rgba(0,0,0,0.85), 0 0 38px rgba(249, 92, 75, 0.13), inset 0 0 18px rgba(249, 92, 75, 0.16)',
              '0 24px 50px rgba(0,0,0,0.85), 0 0 25px rgba(249, 92, 75, 0.06), inset 0 0 12px rgba(249, 92, 75, 0.10)',
            ],
            borderColor: hovered ? [
              'rgba(249, 92, 75, 0.18)',
              'rgba(249, 92, 75, 0.32)',
              'rgba(249, 92, 75, 0.18)'
            ] : [
              'rgba(249, 92, 75, 0.12)',
              'rgba(249, 92, 75, 0.22)',
              'rgba(249, 92, 75, 0.12)'
            ]
          }}
          transition={{
            duration: 4.5,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
          style={{
            width: '100%', height: 220,
            // 背景圖：根據目前待晉升的聯盟等級載入圖片
            background: `url(${LEAGUE_BG_IMAGES[targetLeague.id] || LEAGUE_BG_IMAGES.black}) center/cover no-repeat`,
            borderRadius: 2,
            position: 'relative', overflow: 'hidden',
          }}
        >
          {/* Matte cross-grain texture */}
          <div style={{
            position: 'absolute', inset: 0, opacity: 0.4,
            background: `
              repeating-linear-gradient(-42deg, transparent, transparent 20px, rgba(255,255,255,0.006) 20px, rgba(255,255,255,0.006) 21px),
              repeating-linear-gradient(48deg, transparent, transparent 28px, rgba(0,0,0,0.02) 28px, rgba(0,0,0,0.02) 29px)
            `,
            zIndex: 1,
          }} />

          {/* Brushed Titanium Static Metal Sheen (高對比金屬強光澤) */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(135deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.03) 40%, rgba(0,0,0,0.45) 100%)',
            pointerEvents: 'none', zIndex: 1,
          }} />

          {/* Active Titanium Metallic Light Sweep (強效金屬高光掃過) */}
          <motion.div
            initial={{ x: '-150%', skewX: -25 }}
            animate={{ x: '250%' }}
            transition={{ duration: 3.2, ease: [0.16, 1, 0.3, 1], repeat: Infinity, repeatDelay: 4 }}
            style={{
              position: 'absolute', top: 0, bottom: 0, width: '100%',
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.02) 20%, rgba(255,255,255,0.18) 42%, rgba(255,255,255,0.38) 50%, rgba(255,255,255,0.18) 58%, rgba(255,255,255,0.02) 80%, transparent)',
              filter: 'blur(4px)',
              pointerEvents: 'none', zIndex: 1,
              mixBlendMode: 'overlay',
            }}
          />

          {/* Top edge line */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 1,
            background: `linear-gradient(90deg, transparent 10%, rgba(255,255,255,0.1) 40%, rgba(255,255,255,0.14) 50%, rgba(255,255,255,0.1) 60%, transparent 90%)`,
          }} />

          {/* Issue line top-left */}
          <div style={{ position: 'absolute', top: 22, left: 22 }}>
            <span style={{
              fontSize: 9, letterSpacing: '4px', textTransform: 'uppercase',
              color: isLightCard ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.18)', fontFamily: '"Outfit",sans-serif',
            }}>DRVN // ELITE</span>
          </div>

          {/* CLASSIFIED watermark — right aligned */}
          <div style={{
            position: 'absolute', bottom: 22, right: 22, textAlign: 'right',
          }}>
            <span style={{
              fontFamily: 'var(--font-display)',
              fontSize: 28, fontWeight: 300, fontStyle: 'italic',
              color: isLightCard ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.06)', letterSpacing: 1,
            }}>晉級<br />成功</span>
          </div>

          {/* Left bottom: addressee */}
          <div style={{ position: 'absolute', bottom: 22, left: 22 }}>
            <div style={{ width: 28, height: 1, background: T.coral, marginBottom: 8, opacity: 0.7 }} />
            <span style={{
              fontSize: 9, letterSpacing: '3px', textTransform: 'uppercase',
              color: isLightCard ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.18)', fontFamily: '"Outfit",sans-serif',
            }}>Classified</span>
          </div>

          {/* Coral wax seal — center */}
          <div style={{
            position: 'absolute', left: '50%', top: '50%',
            transform: 'translate(-50%,-50%)',
            width: 58, height: 58, borderRadius: '50%',
            background: `radial-gradient(circle at 38% 36%, ${T.coral}, ${T.ember})`,
            border: `1px solid rgba(249,92,75,0.5)`,
            boxShadow: `0 0 0 3px ${T.black}, 0 0 16px rgba(249,92,75,0.4), inset 0 2px 4px rgba(255,255,255,0.25)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 2,
          }}>
            <img src="/desktop/ranksign.png" alt="Rank Sign" style={{ width: 32, height: 32, objectFit: 'contain' }} />
          </div>
        </motion.div>
      </motion.div>

      {/* Tap hint */}
      <motion.div
        animate={{ opacity: [0.3, 0.7, 0.3] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          fontSize: 9, letterSpacing: '4px', textTransform: 'uppercase',
          color: T.pebble, fontFamily: '"Outfit",sans-serif',
        }}
      >
        <div style={{ flex: 1, height: 1, background: `rgba(207,198,184,0.25)` }} />
        Open Invitation
        <div style={{ flex: 1, height: 1, background: `rgba(207,198,184,0.25)` }} />
      </motion.div>
    </motion.div>
  );
};

/* ════════════════════════════════
   PHASE 2 — CARD
   Swiss magazine: left-aligned, Coral accents,
   generous negative space, clear hierarchy
════════════════════════════════ */
const CardPhase = ({ targetLeague, currentLeague, onAccept, rippleRef, isLightCard, stats = null }) => {
  const [fired, setFired] = useState(false);
  const issuedDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).replace(/\//g, ' · ');

  const handleAccept = () => {
    haptic('heavy');
    setFired(true);
    setTimeout(onAccept, 300);
  };

  // ── 真實數據（缺值時給合理占位，不顯示假的 98.4/142/0.8%）──
  const curRank = stats?.currentRank ?? null;
  const tgtRank = stats?.targetRank ?? null;
  const trainCount = stats?.trainCount ?? null;
  const percentile = stats?.percentile ?? null;
  const dash = '—';

  // 字色加強：背景是模糊金屬照，原本低透明度的字在亮底上看不清 → 全面提高對比。
  const txtPrimary = isLightCard ? '#161415' : T.paper;
  const txtSecondary = isLightCard ? 'rgba(0,0,0,0.72)' : 'rgba(255,255,255,0.62)';
  const txtTertiary = isLightCard ? 'rgba(0,0,0,0.58)' : 'rgba(255,255,255,0.45)';
  const txtQuaternary = isLightCard ? 'rgba(0,0,0,0.42)' : 'rgba(255,255,255,0.32)';
  const lineDivider = isLightCard ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.12)';


  useCoralRipple(rippleRef, fired);

  // 只改排版與大小，背景沿用各段位「原本設計好的卡片圖」。字色依亮/暗卡切換。
  const ink = txtPrimary;
  const sub = txtSecondary;
  const faint = txtQuaternary;
  const hair = lineDivider;

  // 卡片彈跳登場（spring）→ 內容依序蹦出（stagger）。有活力但不花俏。
  const cardVar = {
    hidden: { opacity: 0, y: 40, scale: 0.9, rotateX: 10 },
    visible: { opacity: 1, y: 0, scale: 1, rotateX: 0, transition: { type: 'spring', stiffness: 260, damping: 20, mass: 0.9 } },
    exit: { opacity: 0, y: -20, scale: 0.96, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
  };
  const bodyVar = { hidden: {}, visible: { transition: { staggerChildren: 0.08, delayChildren: 0.18 } } };
  const popVar = {
    hidden: { opacity: 0, y: 14 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 420, damping: 26 } },
  };

  // 瑞士極簡：資料左對齊、標籤上、數字下，欄位規矩排列。
  const Field = ({ label, value, coral, big }) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 9, letterSpacing: '2px', textTransform: 'uppercase', color: faint, marginBottom: 6, fontFamily: '"Outfit",sans-serif' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: big ? 30 : 24, fontWeight: coral ? 400 : 300, lineHeight: 1, letterSpacing: '-1px', color: coral ? T.coral : ink }}>{value}</div>
    </div>
  );

  return (
    <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center', perspective: 1200 }}>
      <motion.div
        variants={cardVar}
        initial="hidden"
        animate="visible"
        exit="exit"
        style={{
          position: 'relative', width: '100%', maxWidth: 330,
          transformStyle: 'preserve-3d', willChange: 'transform',
          // ✅ 沿用各段位原本設計好的卡片圖
          background: `url(${LEAGUE_BG_IMAGES[targetLeague.id] || LEAGUE_BG_IMAGES.black}) center/cover no-repeat`,
          border: '1px solid rgba(249,92,75,0.18)',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 30px 70px -28px rgba(0,0,0,0.85), 0 0 26px rgba(249,92,75,0.1)',
        }}
      >
        {/* 文字可讀性 scrim（靜態）— 大幅調淡，讓金屬拉絲質感透出來。
            亮卡：極淡暖白薄膜（只夠壓住底圖高光），字改用夠深的墨色；
            黑卡：深色薄遮罩。 */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
          background: isLightCard
            ? 'linear-gradient(180deg, rgba(244,240,233,0.18) 0%, rgba(244,240,233,0.10) 45%, rgba(244,240,233,0.22) 100%)'
            : 'linear-gradient(180deg, rgba(10,9,8,0.42) 0%, rgba(10,9,8,0.24) 45%, rgba(10,9,8,0.50) 100%)' }} />
        {/* 進場一次性金屬掃光（點開卡片那一下的活力）*/}
        <motion.div
          initial={{ x: '-130%', skewX: -20, opacity: 0 }}
          animate={{ x: '230%', opacity: [0, 1, 0] }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.25 }}
          style={{ position: 'absolute', top: 0, bottom: 0, width: '55%', pointerEvents: 'none', mixBlendMode: 'screen', zIndex: 3,
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.18) 50%, transparent)', filter: 'blur(8px)' }}
        />

        <motion.div variants={bodyVar} initial="hidden" animate="visible" style={{ padding: '26px 24px 22px', position: 'relative', zIndex: 2 }}>
          {/* Header：品牌 + 日期 */}
          <motion.div variants={popVar} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <span style={{ fontSize: 9, letterSpacing: '4px', textTransform: 'uppercase', color: T.coral, fontWeight: 500, fontFamily: '"Outfit",sans-serif' }}>DRVN</span>
            <span style={{ fontSize: 11, letterSpacing: '2px', color: faint, fontFamily: '"Outfit",sans-serif' }}>{issuedDate}</span>
          </motion.div>

          {/* Overline + 大襯線標題（左對齊）*/}
          <motion.div variants={popVar} style={{ fontSize: 12, letterSpacing: '4px', color: sub, marginBottom: 10, fontFamily: '"Outfit",sans-serif' }}>晉升邀請 · Promotion</motion.div>
          <motion.div variants={popVar} style={{ fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 300, lineHeight: 0.9, letterSpacing: '-1px', color: ink, marginBottom: 24 }}>
            {targetLeague.displayLabel}
          </motion.div>

          {/* 排名：目前 → 晉升後（左對齊、規矩欄位）*/}
          <motion.div variants={popVar} style={{ display: 'flex', alignItems: 'flex-end', gap: 14, padding: '18px 0', borderTop: `1px solid ${hair}`, marginBottom: 2 }}>
            <Field label="目前" value={curRank != null ? `#${curRank}` : dash} big />
            <svg width="24" height="10" viewBox="0 0 24 10" fill="none" style={{ opacity: 0.85, flexShrink: 0, marginBottom: 8 }}>
              <line x1="0" y1="5" x2="18" y2="5" stroke={T.coral} strokeWidth="1.2" />
              <polyline points="14,1 19,5 14,9" fill="none" stroke={T.coral} strokeWidth="1.2" />
            </svg>
            <Field label="晉升後" value={tgtRank != null ? `#${tgtRank}` : dash} coral big />
          </motion.div>

          {/* 數據列：訓練次數 + 全球百分位（左對齊欄位）*/}
          <motion.div variants={popVar} style={{ display: 'flex', gap: 14, padding: '18px 0 22px', borderTop: `1px solid ${hair}` }}>
            <Field label="訓練次數" value={trainCount != null ? trainCount : dash} />
            <Field label="全球百分位" value={percentile != null ? `前 ${percentile}%` : dash} coral />
          </motion.div>

          {/* CTA — 蹦入 + 點按回饋 */}
          <motion.button
            variants={popVar}
            whileTap={{ scale: 0.97 }}
            onClick={handleAccept}
            style={{
              width: '100%', padding: '15px 0', background: T.coral, border: 'none', borderRadius: 12,
              color: '#fff', fontFamily: '"Outfit",sans-serif', fontSize: 12, fontWeight: 600,
              letterSpacing: '4px', textTransform: 'uppercase', cursor: 'pointer',
            }}
          >
            接受晉升
          </motion.button>
        </motion.div>
      </motion.div>
    </div>
  );
};

/* ════════════════════════════════
   PHASE 3 — SUCCESS
   Swiss: typographic, Coral mark
════════════════════════════════ */
const SuccessPhase = ({ targetLeague, dustRef, stats = null }) => {
  const [drawCheck, setDrawCheck] = useState(false);
  useCoralDust(dustRef, true);

  useEffect(() => {
    const t = setTimeout(() => setDrawCheck(true), 500);
    return () => clearTimeout(t);
  }, []);

  return (
    <motion.div
      key="success"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -24 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: 'absolute', display: 'flex', flexDirection: 'column',
        alignItems: 'flex-start', width: '100%', padding: '0 4px',
      }}
    >
      {/* 實心珊瑚勾選徽章（活潑彈入）*/}
      <motion.div
        initial={{ scale: 0, rotate: -12 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 16 }}
        style={{
          width: 52, height: 52, borderRadius: '50%', background: T.coral,
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 28,
          boxShadow: '0 8px 24px -6px rgba(249,92,75,0.6)',
        }}
      >
        <svg width="24" height="18" viewBox="0 0 24 18" fill="none">
          {drawCheck && (
            <motion.path d="M2 9 L9 16 L22 2" stroke="#fff" strokeWidth="2.4"
              strokeLinecap="round" strokeLinejoin="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, ease: 'circOut' }} />
          )}
        </svg>
      </motion.div>

      {/* 活潑短標 */}
      <div style={{ fontSize: 12, letterSpacing: '3px', color: T.coral, fontFamily: '"Outfit",sans-serif', fontWeight: 600, marginBottom: 14 }}>
        搞定 · You're elevated
      </div>

      {/* 態度大字：歡迎加入 + 段位（活潑字重）*/}
      <div style={{ marginBottom: 22 }}>
        <span style={{ display: 'block', fontFamily: '"Outfit", sans-serif', fontSize: 'min(58px,14vw)', fontWeight: 700, lineHeight: 0.92, color: '#F6F4F1', letterSpacing: '-2.5px' }}>
          歡迎加入
        </span>
        <span style={{ display: 'block', fontFamily: '"Outfit", sans-serif', fontSize: 'min(58px,14vw)', fontWeight: 700, lineHeight: 0.96, color: T.coral, letterSpacing: '-2.5px', marginTop: 2 }}>
          {targetLeague.displayLabel}
        </span>
      </div>

      {/* 短珊瑚底線 + 一句話 */}
      <div style={{ width: 56, height: 3, borderRadius: 2, background: T.coral, marginBottom: 14 }} />
      <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(246,244,241,0.5)', fontFamily: '"Outfit",sans-serif', letterSpacing: '0.5px' }}>
        {targetLeague.displayLabel} 俱樂部{stats?.targetRank != null ? ` · 第 ${stats.targetRank} 名` : ''}，這裡見。
      </span>
    </motion.div>
  );
};

/* ════════════════════════════════
   MAIN
════════════════════════════════ */
const LeagueElevationInvitation = ({ onAccept, onDismiss, stats = null }) => {
  const [debugOverride, setDebugOverride] = useState(null);

  const realCurrent  = getCurrentLeague();
  const currentLeague = realCurrent.id === 'black' ? LEAGUES[2] : realCurrent;
  const defaultTarget  = getTargetLeague(currentLeague) || LEAGUES[3];
  const targetLeague = debugOverride ? LEAGUES.find(l => l.id === debugOverride) : defaultTarget;

  const [phase, setPhase] = useState('splash');
  const rippleRef = useRef(null);
  const dustRef   = useRef(null);

  /* Lock scroll */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const block = e => { if (e.cancelable) e.preventDefault(); };
    document.addEventListener('touchmove', block, { passive: false });
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('touchmove', block);
    };
  }, []);

  /* Inject Google Fonts dynamically if not present */
  useEffect(() => {
    const id = 'google-fonts-league-invitation';
    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  /* Auto-advance splash → envelope */
  useEffect(() => {
    const t = setTimeout(() => setPhase('envelope'), 2600);
    return () => clearTimeout(t);
  }, []);

  const handleOpen   = useCallback(() => { haptic('heavy');   setPhase('card');    }, []);
  const handleAccept = useCallback(() => {
    setCurrentLeague(targetLeague.id);
    setPhase('success');
    haptic('success');
    setTimeout(() => onAccept?.(targetLeague), 3000);
  }, [targetLeague, onAccept]);

  // 進場後不允許點背景跳出 —— 一律靠卡片上的操作（開啟 / 接受晉升）推進，
  // 避免使用者誤點背景就把這個儀式性畫面關掉。
  const handleBackdrop = useCallback(() => { /* no-op: 禁止點背景關閉 */ }, []);

  const isLightCard = targetLeague.id !== 'black';

  return createPortal(
    <div
      onClick={handleBackdrop}
      style={{
        position: 'fixed', inset: 0, zIndex: 999999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(6,5,4,0.94)',
        backdropFilter: 'blur(44px)',
        padding: '0 28px',
        overflow: 'hidden',
        fontFamily: '"Outfit",sans-serif',
        touchAction: 'none',
        perspective: 1400,
      }}
    >
      {/* Tactile Paper Noise Overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        opacity: 0.03, // 極低透明度
        pointerEvents: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        zIndex: 100,
      }} />
      {/* Canvas layers */}
      <canvas ref={rippleRef} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10 }} />
      <canvas ref={dustRef}   style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10 }} />

      {/* Ambient — coral top-right, stone bottom-left */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <motion.div
          animate={{ opacity: phase === 'success' ? 0.18 : 0.10, scale: phase === 'success' ? 1.1 : 1 }}
          transition={{ duration: 1.4, ease: SILK }}
          style={{
            position: 'absolute', top: '-20%', right: '-20%',
            width: 480, height: 480,
            background: `radial-gradient(circle, ${T.coral} 0%, transparent 70%)`,
            filter: 'blur(120px)',
          }}
        />
        <motion.div
          animate={{ opacity: phase === 'success' ? 0.12 : 0.07 }}
          transition={{ duration: 1.4 }}
          style={{
            position: 'absolute', bottom: '-15%', left: '-15%',
            width: 360, height: 360,
            background: `radial-gradient(circle, ${T.stone} 0%, transparent 70%)`,
            filter: 'blur(90px)',
          }}
        />
      </div>

      {/* Content wrapper — stops backdrop click propagation */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%', maxWidth: 342,   /* 卡片整體縮小一點（原 400） */
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 320,
        }}
      >
        <AnimatePresence mode="wait">
          {phase === 'splash'   && <SplashPhase   key="splash"   targetLeague={targetLeague} />}
          {phase === 'envelope' && <EnvelopePhase key="envelope" targetLeague={targetLeague} onOpen={handleOpen} isLightCard={isLightCard} />}
          {phase === 'card'     && (
            <CardPhase
              key="card"
              targetLeague={targetLeague}
              currentLeague={currentLeague}
              onAccept={handleAccept}
              rippleRef={rippleRef}
              isLightCard={isLightCard}
              stats={stats}
            />
          )}
          {phase === 'success'  && <SuccessPhase  key="success"  targetLeague={targetLeague} dustRef={dustRef} stats={stats} />}
        </AnimatePresence>
      </div>

      {/* ── Debug Preview Panel ── */}
      <div style={{
        position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 10, zIndex: 9999999,
        background: 'rgba(0,0,0,0.6)', padding: '8px 16px', borderRadius: 20,
        backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)'
      }}>
        {['bronze', 'silver', 'gold', 'black'].map(id => (
          <motion.button {...pressProps('row')}
 key={id}
 onClick={(e) => { e.stopPropagation(); setDebugOverride(id); }}
 style={{
 padding: '6px 12px', borderRadius: 12, border: 'none',
 background: targetLeague.id === id ? T.coral : 'rgba(255,255,255,0.1)',
 color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: '"Outfit",sans-serif',
 textTransform: 'uppercase', letterSpacing: 1
 }}
 >
            {id}
          </motion.button>
        ))}
      </div>
    </div>,
    document.body
  );
};

export default LeagueElevationInvitation;
