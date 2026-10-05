/**
 * EmptyState — DRVN / Liquid Glass 風格的「尚未完成」回饋元件
 * ------------------------------------------------------------------
 * 統一各系統在「使用者還沒做某件事」時的引導畫面，取代過去
 * 直接 return null（畫面空白、使用者不知道發生什麼事）的情況。
 *
 * 用法：
 *   import EmptyState from './ui/EmptyState';
 *   import { DrvnLift as Dumbbell } from './DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴
 *
 *   if (!records?.length) {
 *     return (
 *       <EmptyState
 *         icon={Dumbbell}
 *         title="還沒有訓練紀錄"
 *         description="完成第一次訓練後，這裡就會顯示你的成長軌跡。"
 *         actionLabel="開始今日訓練"
 *         onAction={() => navigate('/training-session-mobile')}
 *       />
 *     );
 *   }
 */

import React from 'react';
import { motion } from 'framer-motion';
import { T } from '../../utils/theme';

export default function EmptyState({
  icon: Icon,
  title = '尚未有資料',
  description = '',
  actionLabel,
  onAction,
  compact = false,
  tone = 'light', // 'light'（米白底）| 'dark'（深色沉浸底）
}) {
  const isDark = tone === 'dark';
  const fg = isDark ? T.PAPER : T.BLACK;
  const sub = isDark ? 'rgba(246,244,241,0.6)' : 'rgba(22,20,21,0.55)';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 14,
        padding: compact ? '28px 22px' : '48px 28px',
        borderRadius: 24,
        background: isDark
          ? 'linear-gradient(135deg, rgba(38,37,35,0.6) 0%, rgba(22,20,21,0.5) 100%)'
          : 'linear-gradient(135deg, rgba(255,255,255,0.6) 0%, rgba(246,244,241,0.5) 100%)',
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        border: isDark
          ? '1px solid rgba(255,255,255,0.08)'
          : '1px solid rgba(255,255,255,0.6)',
        boxShadow: isDark
          ? '0 10px 30px rgba(0,0,0,0.3)'
          : '0 10px 30px rgba(0,0,0,0.06), inset 0 1px 2px rgba(255,255,255,0.9)',
      }}
    >
      {Icon && (
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 99,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(249,92,75,0.12)',
            border: '1px solid rgba(249,92,75,0.25)',
          }}
        >
          <Icon size={26} strokeWidth={2} style={{ color: T.CORAL }} />
        </div>
      )}

      <div>
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: fg, letterSpacing: '-0.01em' }}>
          {title}
        </h3>
        {description && (
          <p style={{ margin: '6px 0 0', fontSize: 13.5, lineHeight: 1.6, color: sub, maxWidth: 320 }}>
            {description}
          </p>
        )}
      </div>

      {actionLabel && onAction && (
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={onAction}
          style={{
            marginTop: 4,
            padding: '11px 24px',
            borderRadius: 12,
            border: 'none',
            background: `linear-gradient(135deg, ${T.CORAL} 0%, ${T.EMBER} 100%)`,
            color: '#fff',
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: '0.02em',
            cursor: 'pointer',
            boxShadow: '0 6px 18px rgba(249,92,75,0.4)',
          }}
        >
          {actionLabel}
        </motion.button>
      )}
    </motion.div>
  );
}
