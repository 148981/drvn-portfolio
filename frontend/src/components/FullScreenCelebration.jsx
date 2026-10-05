import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ══════════════════════════════════════════════════════════════════════════
// 🎉 FullScreenCelebration — 全 App 唯一的「完成慶祝頁」外殼
//
// 為什麼會有這支（2026-08 UI 稽核）：
//   稽核時清點出 9 個「完成 / 慶祝 / 結算」畫面，長成四套視覺、兩種形態、
//   五種離開方式：
//     · 形態：DailyGoalCelebration / TaskDoneCelebration / ChallengeCompletionModal /
//       GrowthReportOverlay 是「半透明遮罩 + 置中卡」，另外四個才是整頁
//     · 色系：DRVN Paper/Ink/Coral、黑金 Luxury (#D4AF37)、米色 (#FDFBF7 / #F9F6E8)、Glass Dark
//     · 離開：點任意處+計時 / CTA 逐幕 / 右上 X / 只有一顆 Accept / 底部分享鈕
//     · 規範被打破：DailyGoalCelebration 檔頭明文「無 emoji、文案不浮誇」，
//       但 ChallengeCompletionModal 用了 🏆、GrowthReportOverlay 寫「LEVEL UP!」
//
//   同一個產品裡「你完成了」有九種講法，就等於沒有講法。這支把外殼收成一個，
//   各系統只負責給文案與數字。
//
// 設計鐵律（沿用 DailyGoalCelebration 原本就寫對的部分）：
//   1. 先同理，再數據 —— 第一句是陪伴語，不是分數也不是彩帶。
//   2. 簡意賅 —— 最多三個數字。剛練完的人沒有耐心讀段落。
//   3. 真實數據 —— 沒破紀錄就不假裝破紀錄。
//   4. 無 emoji —— 圖示一律走 SVG。這支刻意不提供 icon prop，
//      就是為了讓 🏆 這種東西沒有地方可以塞進來。
//   5. 只有兩套色（dark / light），不再長出第五套。
//
// 這是「整頁」不是「彈窗」：fixed inset:0 的那一層就是內容本身，
// 不是蓋在別的畫面上的半透明遮罩 —— 慶祝的當下，畫面上不該還有別的東西。
// ══════════════════════════════════════════════════════════════════════════

const TONES = {
    dark: {
        bg: 'radial-gradient(120% 80% at 50% 0%, #2A2724 0%, #1B1A19 42%, #131211 100%)',
        title: '#F6F4F1',
        body: 'rgba(246,244,241,0.72)',
        metric: '#F6F4F1',
        unit: 'rgba(246,244,241,0.5)',
        label: 'rgba(246,244,241,0.42)',
        rule: 'rgba(246,244,241,0.16)',
        divider: 'rgba(246,244,241,0.14)',
        hint: 'rgba(246,244,241,0.32)',
    },
    light: {
        bg: 'radial-gradient(120% 80% at 50% 0%, #FFFFFF 0%, #F6F4F1 40%, #E9E3D8 100%)',
        title: '#161415',
        body: 'rgba(22,20,21,0.62)',
        metric: '#161415',
        unit: 'rgba(22,20,21,0.42)',
        label: 'rgba(22,20,21,0.40)',
        rule: 'rgba(22,20,21,0.14)',
        divider: 'rgba(22,20,21,0.12)',
        hint: 'rgba(22,20,21,0.32)',
    },
};

const DISPLAY = '"Tenor Sans", var(--font-display), sans-serif';

/**
 * @param {object}   props
 * @param {boolean}  props.open
 * @param {Function} props.onDismiss
 * @param {string}   props.eyebrow        小字標籤（大寫寬字距），例："TODAY'S SESSION · DONE"
 * @param {string}   props.title          大標，例：「辛苦了。」— 永遠先同理，不先報數字
 * @param {string}   props.subtitle       一句陪伴語（真實、不罐頭）
 * @param {Array}    props.stats          [{ value, unit, label }]，最多取 3 個
 * @param {'dark'|'light'} props.tone
 * @param {string}   props.accentColor    預設 Coral；只在 PR/挑戰等特殊場景覆寫
 * @param {'tap-anywhere-timed'|'cta-required'} props.dismissMode
 * @param {number}   props.autoDismissMs  只有 tap-anywhere-timed 會用
 * @param {string}   props.ctaLabel       cta-required 模式的按鈕文字
 * @param {string}   props.hint           底部提示，例：「點一下繼續」
 * @param {React.ReactNode} props.children 需要塞額外內容時用（例如挑戰徽章）
 */
export default function FullScreenCelebration({
    open,
    onDismiss,
    eyebrow,
    title,
    subtitle,
    stats = [],
    tone = 'dark',
    accentColor = '#F95C4B',
    dismissMode = 'tap-anywhere-timed',
    autoDismissMs = 6000,
    ctaLabel = '繼續',
    hint = '點一下繼續',
    children,
}) {
    const T = TONES[tone] || TONES.dark;
    const tapToClose = dismissMode === 'tap-anywhere-timed';

    useEffect(() => {
        if (!open || !tapToClose || !autoDismissMs) return undefined;
        const t = setTimeout(() => onDismiss?.(), autoDismissMs);
        return () => clearTimeout(t);
    }, [open, tapToClose, autoDismissMs, onDismiss]);

    const metrics = (stats || []).filter(Boolean).slice(0, 3);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    key="fullscreen-celebration"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35 }}
                    onClick={tapToClose ? () => onDismiss?.() : undefined}
                    role="dialog"
                    aria-label={title}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 100050,
                        background: T.bg,
                        display: 'flex', flexDirection: 'column', justifyContent: 'center',
                        // 整頁 = 撐滿安全區、左對齊排版，不是置中的小卡
                        padding: `calc(env(safe-area-inset-top, 0px) + 40px) 30px calc(env(safe-area-inset-bottom, 0px) + 40px)`,
                        cursor: tapToClose ? 'pointer' : 'default',
                    }}
                >
                    <div style={{ width: '100%', maxWidth: 430, margin: '0 auto' }}>
                        {/* 頂部細線 —— 瑞士排版的起手式 */}
                        <motion.div
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: 1 }}
                            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
                            style={{ height: 2, background: accentColor, transformOrigin: 'left', marginBottom: 16 }}
                        />

                        {eyebrow && (
                            <motion.p
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
                                style={{
                                    margin: 0, fontSize: 9, fontWeight: 900, letterSpacing: '0.34em',
                                    textTransform: 'uppercase', color: accentColor, fontFamily: DISPLAY,
                                }}
                            >
                                {eyebrow}
                            </motion.p>
                        )}

                        {/* ① 同理 —— 永遠排在數據之前 */}
                        {title && (
                            <motion.h2
                                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.35, type: 'spring', stiffness: 110, damping: 18 }}
                                style={{
                                    margin: '14px 0 0', fontSize: 30, lineHeight: 1.3, fontWeight: 400,
                                    color: T.title, letterSpacing: '-0.01em', fontFamily: DISPLAY,
                                }}
                            >
                                {title}
                            </motion.h2>
                        )}

                        {subtitle && (
                            <motion.p
                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.5 }}
                                style={{ margin: '10px 0 0', fontSize: 14.5, lineHeight: 1.75, color: T.body, fontWeight: 500 }}
                            >
                                {subtitle}
                            </motion.p>
                        )}

                        {/* ② 最多三個數字 —— 簡意賅是規格的一部分 */}
                        {metrics.length > 0 && (
                            <div style={{ display: 'flex', marginTop: 28, borderTop: `1px solid ${T.rule}`, paddingTop: 20 }}>
                                {metrics.map((m, i) => (
                                    <motion.div
                                        key={`${m.label}-${i}`}
                                        initial={{ opacity: 0, y: 14 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.62 + i * 0.09, type: 'spring', stiffness: 120, damping: 18 }}
                                        style={{
                                            flex: 1, minWidth: 0,
                                            paddingLeft: i === 0 ? 0 : 14,
                                            borderLeft: i === 0 ? 'none' : `1px solid ${T.divider}`,
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, whiteSpace: 'nowrap' }}>
                                            <span style={{ fontSize: 30, fontWeight: 200, color: T.metric, lineHeight: 1, fontFamily: DISPLAY }}>
                                                {m.value}
                                            </span>
                                            {m.unit && (
                                                <span style={{ fontSize: 9, fontWeight: 400, color: T.unit, letterSpacing: '0.16em' }}>{m.unit}</span>
                                            )}
                                        </div>
                                        <span style={{ display: 'block', marginTop: 8, fontSize: 9, fontWeight: 700, letterSpacing: '0.22em', color: T.label }}>
                                            {m.label}
                                        </span>
                                    </motion.div>
                                ))}
                            </div>
                        )}

                        {children}

                        {/* ③ 離開方式只有兩種，不再每個頁面自己土砲 */}
                        {tapToClose ? (
                            hint && (
                                <motion.p
                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}
                                    style={{ margin: '28px 0 0', fontSize: 9, letterSpacing: '0.2em', color: T.hint, textAlign: 'center' }}
                                >
                                    {hint}
                                </motion.p>
                            )
                        ) : (
                            <motion.button
                                type="button"
                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={(e) => { e.stopPropagation(); onDismiss?.(); }}
                                style={{
                                    marginTop: 32, width: '100%', height: 54, borderRadius: 16,
                                    border: 'none', cursor: 'pointer', background: accentColor, color: '#fff',
                                    fontSize: 15, fontWeight: 700, letterSpacing: '0.04em',
                                }}
                            >
                                {ctaLabel}
                            </motion.button>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
