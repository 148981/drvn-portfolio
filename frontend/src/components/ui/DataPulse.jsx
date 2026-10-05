/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * DataPulse — 卡牌內個別數據點的微型脈衝佔位符
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 卡牌框架始終渲染（永遠不阻擋 UI），
 * 只有數字/文字數據點在等待 API 時顯示脈衝佔位符。
 *
 * 狀態：
 *   ready = false → 脈衝佔位符 (pulse placeholder)，尺寸固定防止 Layout Shift
 *   ready = true  → children 淡入 (200ms fade-in)
 *
 * Props:
 *   ready    {boolean}  — patchReady from useDynamicPatch
 *   w        {string}   — 佔位符寬度 (CSS，如 "5rem"、"80px")
 *   h        {string}   — 佔位符高度 (CSS，如 "2.75rem"、"1rem")
 *   radius   {string}   — 圓角 (CSS，預設 "0.5rem")
 *   theme    {string}   — "dark" | "light" | "cream"（控制脈衝顏色）
 *   inline   {boolean}  — true = inline-block wrapper（文字行內使用）
 *   children {ReactNode}
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const PULSE_COLORS = {
    dark:  'rgba(22,20,21,0.12)',
    light: 'rgba(255,255,255,0.18)',
    cream: 'rgba(240,234,220,0.55)',
};

const pulseKeyframes = `
@keyframes dp-pulse {
    0%   { opacity: 1 }
    50%  { opacity: 0.4 }
    100% { opacity: 1 }
}
`;

// Inject keyframes once
if (typeof document !== 'undefined' && !document.getElementById('dp-pulse-style')) {
    const style = document.createElement('style');
    style.id = 'dp-pulse-style';
    style.textContent = pulseKeyframes;
    document.head.appendChild(style);
}

export function DataPulse({
    ready,
    w = '4rem',
    h = '1rem',
    radius = '0.5rem',
    theme = 'dark',
    inline = false,
    children,
}) {
    const display = inline ? 'inline-block' : 'block';
    const pulseColor = PULSE_COLORS[theme] ?? PULSE_COLORS.dark;

    return (
        <span style={{ display, position: 'relative' }}>
            <AnimatePresence mode="wait" initial={false}>
                {!ready ? (
                    <motion.span
                        key="pulse"
                        initial={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        style={{
                            display,
                            width: w,
                            height: h,
                            borderRadius: radius,
                            backgroundColor: pulseColor,
                            animation: 'dp-pulse 1.6s ease-in-out infinite',
                            verticalAlign: 'middle',
                        }}
                    />
                ) : (
                    <motion.span
                        key="data"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        style={{ display }}
                    >
                        {children}
                    </motion.span>
                )}
            </AnimatePresence>
        </span>
    );
}

export default DataPulse;
