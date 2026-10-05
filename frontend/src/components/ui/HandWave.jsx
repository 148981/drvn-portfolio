import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * HandWave —— 手寫感的重點波浪
 * ══════════════════════════════════════════════════════════════════
 * 提示卡上那一句是「現在該注意什麼」，需要一個重點記號 ——
 * 但一條筆直的色條太機械，看起來像 UI 元件而不是有人畫的。
 *
 * 做法：兩道略微不重合的波浪線。主線粗、補線細且半透明，
 * 像原子筆畫過去之後又補了一筆 —— 這是手寫感的來源，不是濾鏡。
 *
 * ✍️ 線是「畫出來」的，不是「浮出來」的：
 *    用 framer-motion 的 pathLength 由左往右描一次（主線 0.62s，
 *    補線晚 0.16s 起筆），節奏 = 全 app 共用的 RISE_EASE。
 *    ⚠️ 不可改回 CSS transition：pathLength 是 SVG 屬性不是 CSS 屬性，
 *       CSS 動不了它；硬用 stroke-dashoffset 又得先知道每條路徑的長度。
 *    ♿ prefers-reduced-motion 為真時直接畫完（介面標準 §7）。
 *
 * ⚠️ preserveAspectRatio="none" 讓它橫向拉伸到文字寬度，
 *    所以筆畫一定要加 vectorEffect="non-scaling-stroke"，
 *    否則拉長之後線條會變成上下細、左右粗的怪東西。
 *
 * @param {string} color 波浪顏色（用該系統的色，跟中標同一個）
 * @param {number} height 高度 px
 */
const RISE_EASE = [0.16, 1, 0.3, 1];

const HandWave = ({ color = '#F95C4B', height = 7, opacity = 0.55, style }) => {
    const reduced = useReducedMotion();
    const draw = (delay, duration) => (reduced
        ? { initial: false, animate: { pathLength: 1 } }
        : {
            initial: { pathLength: 0 },
            animate: { pathLength: 1 },
            transition: { duration, delay, ease: RISE_EASE },
        });

    return (
        <svg
            aria-hidden
            viewBox="0 0 120 8"
            preserveAspectRatio="none"
            style={{ display: 'block', width: '100%', height, opacity, ...style }}
        >
            <motion.path
                {...draw(0.18, 0.62)}
                d="M1.5 5.2 C 8 1.8, 16 8.2, 24 5 S 40 1.6, 48 5.1 S 64 8.4, 72 5 S 88 1.7, 96 5.2 S 112 8.1, 118.5 4.8"
                fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
            />
            <motion.path
                {...draw(0.34, 0.52)}
                d="M6 6.4 C 14 3.4, 22 8.6, 31 6 S 47 3.2, 56 6.3 S 73 8.6, 82 6 S 99 3.3, 107 6.2"
                fill="none" stroke={color} strokeWidth="1" strokeLinecap="round" opacity="0.45"
                vectorEffect="non-scaling-stroke"
            />
        </svg>
    );
};

export default HandWave;
