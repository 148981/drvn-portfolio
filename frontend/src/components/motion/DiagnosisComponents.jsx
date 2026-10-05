/**
 * DiagnosisComponents.jsx
 * ───────────────────────────────────────────────────────────────
 * 動作偵測 — 結果診斷元件庫
 * 設計語言：瑞士雜誌排版 · 鈦金屬質感 · 單一強調色 (FF4628)
 *
 * 核心目標：讓使用者一眼看出「哪邊需要加強」
 *  · GradeBar     — 七項指標的視覺化條，弱項用強調色拉高層級
 *  · PriorityCard — 最弱項的「具體怎麼改」修正卡
 *  · CompareTrack — 自己 vs 教練標準的逐幀對照軌
 * ───────────────────────────────────────────────────────────────
 */

import React from 'react';
import { motion } from 'framer-motion';

/* 分數 → 等級語意 */
export const gradeOf = (s) => {
  if (s >= 85) return { key: 'strong', label: '優異',   en: 'STRONG' };
  if (s >= 70) return { key: 'watch',  label: '可加強', en: 'WATCH'  };
  return { key: 'weak', label: '需改善', en: 'FOCUS' };
};

const GRADE_COLOR = {
  strong: 'var(--ms-grade-strong)',
  watch:  'var(--ms-grade-watch)',
  weak:   'var(--ms-grade-weak)',
};

/* ════════════════════════════════════════════════════════════
   GradeBar — 單列指標條
   左：序號 + 名稱  中：分數軌  右：分數
   弱項自動以強調色 + 較粗權重凸顯
   ════════════════════════════════════════════════════════════ */
export const GradeBar = ({ index, label, score, delay = 0, onClick, active }) => {
  const g = gradeOf(score);
  const color = GRADE_COLOR[g.key];
  const isWeak = g.key === 'weak';

  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="ms-press"
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer',
        background: active ? 'var(--ms-surface-2)' : 'transparent',
        border: 'none', borderRadius: 'var(--ms-r-sm)',
        padding: '12px 10px', display: 'flex', alignItems: 'center', gap: 12,
      }}
    >
      {/* 序號 — Swiss editorial index */}
      <span className="ms-num" style={{
        fontSize: 11, fontWeight: 700, color: 'var(--ms-ink-3)',
        width: 18, flexShrink: 0,
      }}>
        {String(index + 1).padStart(2, '0')}
      </span>

      {/* 名稱 + 軌 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'baseline', marginBottom: 6,
        }}>
          <span style={{
            fontSize: 12.5,
            fontWeight: isWeak ? 800 : 600,
            color: isWeak ? 'var(--ms-ink)' : 'var(--ms-ink-2)',
            letterSpacing: '0.01em',
          }}>
            {label}
          </span>
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '0.16em',
            color: isWeak ? 'var(--ms-accent)' : 'var(--ms-ink-3)',
          }}>
            {g.en}
          </span>
        </div>

        {/* 分數軌 */}
        <div className="ms-recess" style={{ height: 6, borderRadius: 99, overflow: 'hidden' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${score}%` }}
            transition={{ delay: delay + 0.15, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            style={{ height: '100%', borderRadius: 99, background: color }}
          />
        </div>
      </div>

      {/* 分數 */}
      <span className="ms-num" style={{
        fontSize: 18, fontWeight: 800, lineHeight: 1,
        color: isWeak ? 'var(--ms-accent)' : 'var(--ms-ink)',
        width: 32, textAlign: 'right', flexShrink: 0,
      }}>
        {Math.round(score)}
      </span>
    </motion.button>
  );
};

/* ════════════════════════════════════════════════════════════
   PriorityCard — 「具體怎麼改」修正卡
   把最需要加強的項目放大成可操作的指令
   ════════════════════════════════════════════════════════════ */
export const PriorityCard = ({ rank, title, score, problem, fix, delay = 0 }) => {
  const g = gradeOf(score);
  const isWeak = g.key === 'weak';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className="ms-card"
      style={{ overflow: 'hidden' }}
    >
      {/* 標頭 — 強調色側欄標記優先級 */}
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <div style={{
          width: 4, flexShrink: 0,
          background: isWeak ? 'var(--ms-accent)' : 'var(--ms-line-strong)',
        }} />
        <div style={{ flex: 1, padding: '14px 16px' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="ms-num" style={{
                fontSize: 11, fontWeight: 800, color: 'var(--ms-ink-3)',
              }}>
                #{rank}
              </span>
              <h4 style={{
                fontSize: 15, fontWeight: 800, color: 'var(--ms-ink)',
                margin: 0, letterSpacing: '-0.01em',
              }}>
                {title}
              </h4>
            </div>
            <span className="ms-num" style={{
              fontSize: 20, fontWeight: 800,
              color: isWeak ? 'var(--ms-accent)' : 'var(--ms-ink)',
            }}>
              {Math.round(score)}
            </span>
          </div>
        </div>
      </div>

      <div className="ms-rule" />

      {/* 問題描述 */}
      <div style={{ padding: '14px 16px 6px' }}>
        <span className="ms-overline">偵測到的問題</span>
        <p style={{
          fontSize: 13, lineHeight: 1.55, color: 'var(--ms-ink-2)',
          margin: '6px 0 0', fontWeight: 500,
        }}>
          {problem}
        </p>
      </div>

      {/* 修正指令 — 高對比指令塊 */}
      <div style={{ padding: '10px 16px 16px' }}>
        <div style={{
          background: 'var(--ms-ink)', borderRadius: 'var(--ms-r-sm)',
          padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <div style={{
            width: 20, height: 20, borderRadius: 6, flexShrink: 0,
            background: 'var(--ms-accent)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', marginTop: 1,
          }}>
            {/* lightning glyph */}
            <svg width="9" height="11" viewBox="0 0 9 11" fill="none">
              <path d="M5 0L0 6.2h3.3L4 11l5-6.2H5.7L5 0z" fill="#F6F4F1" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <span style={{
              fontSize: 12, fontWeight: 800, letterSpacing: '0.18em',
              color: 'var(--ms-accent)', textTransform: 'uppercase',
            }}>
              這樣修正
            </span>
            <p style={{
              fontSize: 12.5, lineHeight: 1.5, color: '#F6F4F1',
              margin: '4px 0 0', fontWeight: 600,
            }}>
              {fix}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

/* ════════════════════════════════════════════════════════════
   StatChip — 緊湊的指標摘要籌碼 (歷史頁 / 摘要列用)
   ════════════════════════════════════════════════════════════ */
export const StatChip = ({ label, value, unit, accent }) => (
  <div style={{
    flex: 1, padding: '12px 4px', textAlign: 'center',
  }}>
    <div className="ms-num" style={{
      fontSize: 22, fontWeight: 800, lineHeight: 1,
      color: accent ? 'var(--ms-accent)' : 'var(--ms-ink)',
    }}>
      {value}<span style={{ fontSize: 11, fontWeight: 700, marginLeft: 1 }}>{unit}</span>
    </div>
    <div className="ms-overline" style={{ marginTop: 5, fontSize: 11 }}>{label}</div>
  </div>
);
