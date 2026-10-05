/**
 * ProcessingSpinner — 黑底白刻度環（圖一風格）
 * ───────────────────────────────────────────────────────────────
 * 設計：
 *   - 純黑啞光卡片
 *   - 中央放射狀白色刻度環（60 條）
 *   - 隨真實 progress 從 12 點順時針一條條點亮
 *   - 不旋轉、不指針、不錐形漸層
 *
 * 配色：
 *   #0E0E0E 啞光黑底
 *   #F6F4F1 白刻度（已點亮）
 *   rgba(255,255,255,0.08) 未點亮刻度（極淡）
 *   #F95C4B 系統脈衝 / mini 進度條
 * ───────────────────────────────────────────────────────────────
 */

import React from 'react';
import { motion } from 'framer-motion';

const C = {
  black: '#0E0E0E',
  blackLite: '#161415',
  blackEdge: '#262523',
  white: '#F6F4F1',
  silver: '#B9C8D7',
  orange: '#F95C4B',
  orangeDeep: '#D8331C',
  orangeWash: 'rgba(255,70,40,0.10)',
};

const FONT_STACK = '"Helvetica Neue", -apple-system, sans-serif';
const MONO_STACK = '"SF Mono", "JetBrains Mono", Menlo, monospace';
const EASE_SWISS = [0.16, 1, 0.3, 1];

/**
 * 放射狀刻度環 — LED 發光質感（圖二風格）
 * 60 條刻度從 12 點順時針排列，按 progress 點亮。
 * 已點亮的刻度像 LED 燈條一樣發出微微白色光暈（雙層描繪 + SVG blur halo）。
 */
function TickRingDial({ progress = 0 }) {
  const totalTicks = 60;
  const activeTicks = Math.round((progress / 100) * totalTicks);
  const cx = 50;
  const cy = 50;

  return (
    <svg
      width={220}
      height={220}
      viewBox="0 0 100 100"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        {/* LED 輝光：把刻度本身做模糊 → 形成柔和白色光暈 */}
        <filter id="ledGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="0.9" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* LED 漸層：燈芯偏白、尾端帶冷白，模擬通電發光的燈條 */}
        <linearGradient id="ledLit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="55%" stopColor="#F4F8FF" />
          <stop offset="100%" stopColor="#CBD8E6" />
        </linearGradient>
      </defs>

      {Array.from({ length: totalTicks }).map((_, i) => {
        const active = i < activeTicks;
        const isMajor = i % 5 === 0;
        const isQuad = i % 15 === 0;
        const angle = i * (360 / totalTicks);

        // 刻度尺寸：厚實短條，主刻度更粗
        const w = isQuad ? 1.5 : isMajor ? 1.2 : 0.85;
        const len = isQuad ? 8 : isMajor ? 7 : 6;
        const outerR = 38;
        const y1 = 50 - outerR;

        // 最靠近「進度前緣」的刻度給最強的光（像 LED 跑馬燈的頭）
        const distFromEdge = activeTicks - 1 - i;

        return (
          <g key={i} transform={`rotate(${angle} ${cx} ${cy})`}>
            {active ? (
              <>
                {/* 1) 模糊光暈底層 — 製造 LED 外溢的微微白光 */}
                <rect
                  x={cx - w / 2}
                  y={y1}
                  width={w}
                  height={len}
                  fill="url(#ledLit)"
                  rx={0.4}
                  filter="url(#ledGlow)"
                  opacity={distFromEdge >= 0 && distFromEdge < 3 ? 1 : 0.78}
                />
                {/* 2) 燈芯實體 — 銳利的亮白 LED 本體 */}
                <rect
                  x={cx - w / 2}
                  y={y1}
                  width={w}
                  height={len}
                  fill="url(#ledLit)"
                  rx={0.4}
                />
                {/* 3) 中央高光細線 — 玻璃導光條的反光 */}
                <rect
                  x={cx - 0.22}
                  y={y1 + 0.4}
                  width={0.44}
                  height={len - 0.8}
                  fill="#FFFFFF"
                  opacity={isMajor ? 0.9 : 0.7}
                  rx={0.2}
                />
              </>
            ) : (
              // 未點亮：熄滅的 LED，極淡冷灰，帶一點殘留底光
              <rect
                x={cx - w / 2}
                y={y1}
                width={w}
                height={len}
                fill="rgba(196,210,226,0.10)"
                rx={0.4}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** 把毫秒格式化為「12.3s」或「1m 02s」 */
function fmtMs(ms) {
  if (ms == null || !isFinite(ms) || ms < 0) return '—';
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}m ${String(r).padStart(2, '0')}s`;
}

const ProcessingSpinner = ({
  progress = 0,
  title = '分析中…',
  subtitle = '動作生物力學引擎',
  // ── v4.1 新增：每階段計時器（可選）──
  stageTimings = [],          // [{stage:string, ms:number}, ...] 已完成階段
  currentStageMs = 0,         // 目前進行中的階段已經跑了多少毫秒
  totalMs = 0,                // 從開始到現在的總毫秒
}) => {
  // 嚴格 clamp 0~100
  const safeProgress = Math.max(0, Math.min(100, Number(progress) || 0));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, ease: EASE_SWISS }}
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 340,
        fontFamily: FONT_STACK,
      }}>
      {/* ── 外圍微微橘紅色光暈 (Liquid Glass halo) ── */}
      <motion.div
        aria-hidden
        animate={{ opacity: [0.55, 0.9, 0.55] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          inset: -22,
          borderRadius: 36,
          background: `radial-gradient(60% 55% at 50% 50%, ${C.orange} 0%, rgba(255,70,40,0.30) 38%, transparent 72%)`,
          filter: 'blur(26px)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* ── Liquid Glass 黑色卡牌本體 ── */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        padding: '28px 22px 26px',
        borderRadius: 28,
        // 深色玻璃材質：半透明黑 + 背景模糊 + 飽和
        background: `
          radial-gradient(130% 90% at 18% 0%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 42%),
          linear-gradient(180deg, rgba(34,32,33,0.72) 0%, rgba(14,14,14,0.82) 100%)
        `,
        WebkitBackdropFilter: 'blur(26px) saturate(160%)',
        backdropFilter: 'blur(26px) saturate(160%)',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: `
          0 1px 0 rgba(255,255,255,0.16) inset,
          0 -1px 1px rgba(0,0,0,0.4) inset,
          0 0 0 1px rgba(255,70,40,0.14),
          0 26px 60px -16px rgba(0,0,0,0.6),
          0 0 40px -6px rgba(255,70,40,0.28)
        `,
        overflow: 'hidden',
        isolation: 'isolate',
        color: C.white,
      }}>
      {/* 玻璃高光斜掃 — liquid 反光 */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, borderRadius: 'inherit', pointerEvents: 'none',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 26%)',
        mixBlendMode: 'screen', zIndex: 0,
      }} />
      {/* ── 頂部：系統標號 ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 18, paddingBottom: 12,
        borderBottom: `1px solid rgba(255,255,255,0.10)`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <motion.span
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              width: 6, height: 6, borderRadius: '50%',
              background: C.orange,
              boxShadow: `0 0 0 2px ${C.orangeWash}, 0 0 6px ${C.orange}`,
            }}
          />
          <span style={{
            fontFamily: MONO_STACK, fontSize: 9, fontWeight: 700,
            color: 'rgba(255,255,255,0.55)', letterSpacing: '0.22em', textTransform: 'uppercase',
          }}>
            PROCESSING&nbsp;//&nbsp;SYS.RUN
          </span>
        </div>
        <span style={{
          fontFamily: MONO_STACK, fontSize: 9, fontWeight: 700,
          color: 'rgba(255,255,255,0.45)', letterSpacing: '0.16em',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {String(Math.round(safeProgress)).padStart(3, '0')}&nbsp;/&nbsp;100
        </span>
      </div>

      {/* ── 放射狀刻度環 + 中央百分比 ── */}
      <div style={{
        position: 'relative',
        display: 'flex', justifyContent: 'center',
        margin: '4px 0 22px',
      }}>
        <div style={{ position: 'relative', width: 220, height: 220 }}>
          <TickRingDial progress={safeProgress} />
          {/* 中央百分比 — 直接綁定 progress */}
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <motion.div
              key={Math.round(safeProgress)}
              initial={{ scale: 0.97, opacity: 0.78 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.25, ease: EASE_SWISS }}
              style={{
                fontFamily: FONT_STACK,
                fontSize: 38, fontWeight: 200,
                color: C.white,
                letterSpacing: '-0.04em', lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
              }}>
              {Math.round(safeProgress)}
              <span style={{
                fontSize: 17, fontWeight: 400,
                color: 'rgba(255,255,255,0.55)', marginLeft: 1,
              }}>%</span>
            </motion.div>
            <div style={{
              fontFamily: MONO_STACK, fontSize: 9, fontWeight: 700,
              color: 'rgba(255,255,255,0.4)', letterSpacing: '0.32em',
              textTransform: 'uppercase', marginTop: 6,
            }}>
              PROGRESS
            </div>
          </div>
        </div>
      </div>

      {/* ── 文字區 ── */}
      <div style={{ textAlign: 'center' }}>
        <h3 style={{
          fontFamily: FONT_STACK,
          fontSize: 22, fontWeight: 800, color: C.white,
          margin: '0 0 6px', letterSpacing: '-0.02em',
        }}>
          {title}
        </h3>
        <p style={{
          fontFamily: MONO_STACK,
          fontSize: 9, fontWeight: 700,
          color: 'rgba(255,255,255,0.45)',
          letterSpacing: '0.22em', textTransform: 'uppercase',
          margin: 0,
        }}>
          {subtitle}
        </p>
      </div>

      {/* ── 底部：線性 mini 進度 + 三點脈衝 ── */}
      <div style={{
        marginTop: 20,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {/* 線性 mini 進度條 — 嚴格綁定 safeProgress */}
        <div style={{
          height: 3, borderRadius: 99,
          background: 'rgba(255,255,255,0.08)',
          border: `1px solid rgba(255,255,255,0.10)`,
          position: 'relative', overflow: 'hidden',
        }}>
          <motion.div
            animate={{ width: `${safeProgress}%` }}
            transition={{ duration: 0.3, ease: EASE_SWISS }}
            style={{
              height: '100%',
              background: `linear-gradient(90deg, ${C.orangeDeep}, ${C.orange})`,
              borderRadius: 99,
              boxShadow: `0 0 6px ${C.orange}`,
            }}
          />
        </div>

        {/* 三點脈衝 — 純裝飾 */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 10,
        }}>
          {[0, 1, 2].map(i => (
            <motion.span
              key={i}
              animate={{
                opacity: [0.25, 1, 0.25],
                y: [0, -2, 0],
              }}
              transition={{
                duration: 1.1,
                repeat: Infinity,
                delay: Math.min(i, 6) * 0.18,
                ease: 'easeInOut',
              }}
              style={{
                width: 5, height: 5, borderRadius: '50%',
                background: 'rgba(255,255,255,0.7)',
              }}
            />
          ))}
        </div>
      </div>

      {/* ── v4.1 每階段計時器（有 stageTimings 或 currentStageMs 才顯示）── */}
      {(stageTimings.length > 0 || currentStageMs > 0) && (
        <div style={{
          marginTop: 16, paddingTop: 12,
          borderTop: '1px solid rgba(255,255,255,0.10)',
        }}>
          {/* 標題列：總耗時 */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            marginBottom: 8,
          }}>
            <span style={{
              fontFamily: MONO_STACK, fontSize: 9, fontWeight: 800,
              color: 'rgba(255,255,255,0.55)', letterSpacing: '0.22em',
              textTransform: 'uppercase',
            }}>
              TIMING&nbsp;//&nbsp;PER&nbsp;STAGE
            </span>
            <span style={{
              fontFamily: MONO_STACK, fontSize: 9, fontWeight: 800,
              color: C.orange, letterSpacing: '0.10em',
              fontVariantNumeric: 'tabular-nums',
            }}>
              T&nbsp;{fmtMs(totalMs)}
            </span>
          </div>

          {/* 階段清單 — 最多顯示最近 6 條 */}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 4,
            maxHeight: 130, overflowY: 'auto',
          }}>
            {stageTimings.slice(-6).map((t, i) => (
              <div key={`${t.stage}-${i}`} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                fontSize: 11, lineHeight: 1.2,
              }}>
                <span style={{
                  color: 'rgba(255,255,255,0.78)', fontWeight: 600,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  flex: 1, marginRight: 8,
                }}>
                  ✓ {t.stage}
                </span>
                <span style={{
                  fontFamily: MONO_STACK, fontSize: 11, fontWeight: 700,
                  color: 'rgba(255,255,255,0.55)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {fmtMs(t.ms)}
                </span>
              </div>
            ))}

            {/* 目前進行中的階段（即時跳秒） */}
            {currentStageMs > 0 && (
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                fontSize: 11, lineHeight: 1.2,
                paddingTop: 2,
              }}>
                <span style={{
                  color: C.orange, fontWeight: 800,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  flex: 1, marginRight: 8,
                }}>
                  ◉ {title === '分析中…' || title === '分析中...' ? '進行中' : title}
                </span>
                <span style={{
                  fontFamily: MONO_STACK, fontSize: 11, fontWeight: 800,
                  color: C.orange,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {fmtMs(currentStageMs)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
      </div>{/* /Liquid Glass 卡牌本體 */}
    </motion.div>
  );
};

export default ProcessingSpinner;
