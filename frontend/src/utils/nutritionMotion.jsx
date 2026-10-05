import React from 'react';
import { motion } from 'framer-motion';
import { haptic } from './haptics';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * PRESS MOTION — 全站的互動回饋預設
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ 檔名還叫 nutritionMotion 是歷史因素（先在飲食系統做出來），
 *    但這份規格已經是全站共用：飲食頁 102 個按鈕、社群的
 *    SquadsView / SocialPage / ActivityFeedMobile 共 100 個按鈕都吃這裡。
 *    新的畫面一律 import 這支，不要再各自寫 active:scale。
 *
 * 稽核發現：NutritionPageMobile 有 92 個 <button>，其中只有 8 個帶
 * Framer Motion 的 whileTap，其餘靠 CSS 的 active:scale-95。
 * 社群更慘 —— SquadsView 4,122 行、65 個按鈕，觸覺回饋 0 個。
 * CSS transition 的問題是 —— 快速連點時會被打斷、放開的回彈是線性的，
 * 手感「硬」；而且各處寫的縮放值從 0.95 到 0.98 都有，沒有一致性。
 *
 * 這裡把「按下去的感覺」收成一份規格：
 *   · 縮放量依元件大小分級（大卡片縮一點點，小按鈕縮多一點）
 *   · 一律用 spring，不用 duration —— 手指離開時要有回彈才像實體按鍵
 *   · 觸覺回饋跟視覺回饋綁在一起，不會有「有震動沒動畫」的情況
 *
 * 用法：
 *   <Pressable onPress={...} size="pill">…</Pressable>
 *   或只要動效：<motion.button {...pressProps('card')} />
 */

// ── Spring 規格 ──────────────────────────────────────────────────────────
// stiffness 400 / damping 22 ≈ 120ms 到位、輕微回彈。
// 比 CSS 的 150ms linear 更接近 iOS 原生按鍵的手感。
export const PRESS_SPRING = { type: 'spring', stiffness: 400, damping: 22, mass: 0.5 };

// ── 縮放分級 ─────────────────────────────────────────────────────────────
// 大元件縮太多會像整頁在晃；小元件縮太少則感覺不到。
export const PRESS_SCALE = {
    card: 0.985,   // 整張卡片 / 整列
    row: 0.98,     // 清單列、食物列
    pill: 0.94,    // 藥丸按鈕（+250 / +500 這種）
    icon: 0.90,    // 圖示按鈕（刪除、編輯、關閉）
    cta: 0.97,     // 主要行動按鈕（滿版）
};

/**
 * 直接展開到任何 motion 元件上的 props。
 * @param {keyof PRESS_SCALE} size
 */
export const pressProps = (size = 'row') => ({
    whileTap: { scale: PRESS_SCALE[size] ?? PRESS_SCALE.row },
    transition: PRESS_SPRING,
});

/**
 * 進場動畫：卡片依序浮現。
 * 同一畫面所有卡片共用同一組 easing，避免每張卡各有各的節奏。
 */
export const RISE_EASE = [0.16, 1, 0.3, 1];
export const riseIn = (index = 0) => ({
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, delay: index * 0.06, ease: RISE_EASE },
});

/**
 * 數值變動時的強調 —— 記錄一餐後熱量跳動，要讓人看見它動了。
 * 只縮放不位移，避免把旁邊的排版擠開。
 */
export const valuePop = {
    initial: { scale: 1 },
    animate: { scale: [1, 1.06, 1] },
    transition: { duration: 0.42, ease: 'easeOut' },
};

/**
 * Pressable — 帶觸覺 + 彈簧回饋的按鈕。
 *
 * 取代散落各處的 `className="active:scale-95"` + 手寫 triggerHaptic，
 * 讓「按下去有反應」變成預設，而不是每個按鈕各自記得要加。
 *
 * @param {object}  props
 * @param {'card'|'row'|'pill'|'icon'|'cta'} props.size    縮放分級
 * @param {'light'|'medium'|'heavy'} props.feedback        觸覺強度
 * @param {function} props.onPress                        按下後要做的事
 */
export const Pressable = React.forwardRef(function Pressable(
    { size = 'row', feedback = 'light', onPress, children, style, ...rest },
    ref
) {
    return (
        <motion.button
            ref={ref}
            type="button"
            {...pressProps(size)}
            onClick={(e) => {
                if (feedback) haptic(feedback);
                onPress?.(e);
            }}
            style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                // 觸控目標下限 44px（iOS HIG / WCAG 2.5.5）——
                // 稽核時有好幾個 28px 高的按鈕，手指按不準。
                minHeight: 44,
                ...style,
            }}
            {...rest}
        >
            {children}
        </motion.button>
    );
});

export default Pressable;
