import React from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';

/**
 * EmptyState — 全站統一空狀態（審查報告 §F-1）
 * ─────────────────────────────────────────────────────────────
 * 規則：
 *   1. 空狀態＝「下一步的邀請」，不是「沒有資料」的道歉。
 *   2. 結構固定：icon（可選）→ 一句標題 → 一句說明 → 一個 CTA（可選）。
 *   3. 禁止顯示 0 或假數據——缺資料就誠實留白（0 是謊言）。
 *   4. 深色 Paper 語彙：白 40% 說明字、單一 coral CTA、無多餘裝飾。
 *
 * 用法：
 *   <EmptyState
 *     icon={<Activity size={22} />}
 *     title="還沒有訓練紀錄"
 *     hint="完成第一次訓練後，這裡會開始累積你的歷史。"
 *     ctaLabel="開始今天的訓練"
 *     onCta={() => navigate('/workout-plan-mobile')}
 *   />
 */
const EmptyState = ({ icon = null, title, hint, ctaLabel, onCta, compact = false }) => (
    <div
        className="flex flex-col items-center justify-center text-center"
        style={{ padding: compact ? '28px 24px' : '56px 32px' }}
    >
        {icon && (
            <div
                className="flex items-center justify-center mb-4 rounded-full"
                style={{
                    width: 48, height: 48,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.45)',
                }}
            >
                {icon}
            </div>
        )}
        <p className="text-white font-bold" style={{ fontSize: 15, margin: 0 }}>{title}</p>
        {hint && (
            <p style={{ fontSize: 12, lineHeight: 1.6, color: 'rgba(255,255,255,0.4)', margin: '8px 0 0', maxWidth: 260 }}>
                {hint}
            </p>
        )}
        {ctaLabel && onCta && (
            <motion.button {...pressProps('pill')}
 onClick={onCta}
 style={{
 marginTop: 18, padding: '12px 22px', borderRadius: 999,
 background: '#F95C4B', color: '#fff', border: 'none',
 fontSize: 12, fontWeight: 800, letterSpacing: '0.12em',
 textTransform: 'uppercase', cursor: 'pointer',
 }}
 >
                {ctaLabel}
            </motion.button>
        )}
    </div>
);

export default EmptyState;
