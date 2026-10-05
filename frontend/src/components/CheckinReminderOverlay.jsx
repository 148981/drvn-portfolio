import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import { hapticSuccess, hapticTap } from '../utils/haptics';
import { checkinAmbient, glassCardStyle } from '../utils/checkinAmbient';

// ────────────────────────────────────────────────────────────────────────────
// 每日打卡「未完成」滿版提醒（瑞士極簡 × Framer Motion × 原生震動）
//   下午 3 點後 / 晚上 8 點各出現一次；只有還有未完成項目時才跳。
//   props:
//     open   : boolean
//     items  : getTodayCheckinItems() 回傳陣列 [{ key,label,sub,done,cta,go }]
//     slot   : '15' | '20'（決定副標時段字樣）
//     onClose: () => void   點一下繼續 / 關閉
//     onGo   : (item) => void  點某個未完成項目 → 導頁
// ────────────────────────────────────────────────────────────────────────────
const SWISS = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, "PingFang TC", sans-serif';

export default function CheckinReminderOverlay({ open, items = [], slot = '15', onClose, onGo }) {
    useEffect(() => {
        if (open) { try { hapticSuccess(); } catch { /* no-op */ } }
    }, [open]);

    // 🧭 滿版收尾頁打開時隱藏底部導航膠囊，關閉/卸載時還原
    useEffect(() => {
        window.dispatchEvent(new CustomEvent('toggle-capsule-nav', { detail: { hidden: !!open } }));
        return () => window.dispatchEvent(new CustomEvent('toggle-capsule-nav', { detail: { hidden: false } }));
    }, [open]);

    const remaining = items.filter((i) => !i.done);
    const doneItems = items.filter((i) => i.done);
    const slotLabel = slot === '20' ? '晚間收尾' : '午後提醒';
    // 🎨 時段漸層主題 —— 與每日打卡滿版同一套色（checkinAmbient 單一真相源）。
    //    18 點後翻深色底，文字自動轉淺；全部走 A.*，不寫死顏色。
    const A = checkinAmbient();

    const container = {
        hidden: {},
        show: { transition: { staggerChildren: 0.07, delayChildren: 0.18 } },
    };
    const row = {
        hidden: { opacity: 0, y: 16 },
        show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 120, damping: 20 } },
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    key="checkin-reminder"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.28 }}
                    onClick={() => { hapticTap(); onClose?.(); }}
                    style={{
                        // z-index 拉到導航之上（nav 為 99999）→ 全螢幕蓋掉底部導航
                        position: 'fixed', inset: 0, zIndex: 2147483200, background: A.bg,
                        display: 'flex', flexDirection: 'column', justifyContent: 'center',
                        padding: 'max(28px, env(safe-area-inset-left)) 28px', fontFamily: SWISS,
                        WebkitTapHighlightColor: 'transparent',
                    }}
                >
                    <motion.div variants={container} initial="hidden" animate="show" style={{ maxWidth: 560, width: '100%' }}>
                        {/* kicker */}
                        <motion.div variants={row} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 26 }}>
                            <span style={{ width: 22, height: 2, background: A.accent }} />
                            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.28em', color: A.inkSoft }}>
                                今日打卡 · {slotLabel}
                            </span>
                        </motion.div>

                        {/* headline */}
                        <motion.h1 variants={row} style={{
                            margin: 0, color: A.ink, fontSize: 40, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.12,
                            textShadow: A.dark ? '0 2px 20px rgba(0,0,0,0.25)' : 'none',
                        }}>
                            今天還差 {remaining.length} 件。
                        </motion.h1>
                        <motion.p variants={row} style={{ margin: '10px 0 30px', color: A.inkSoft, fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>
                            收尾一下，讓今天完整。
                        </motion.p>

                        {/* 未完成清單 — 可點去做 */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {remaining.map((it) => (
                                <motion.button
                                    key={it.key}
                                    variants={row}
                                    onClick={(e) => { e.stopPropagation(); hapticTap(); onGo?.(it); }}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                                        padding: '14px 16px', borderRadius: 16, textAlign: 'left', cursor: 'pointer',
                                        ...glassCardStyle(false, A),
                                    }}
                                >
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                                        <span style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${A.inkFaint}`, flexShrink: 0 }} />
                                        <span style={{ minWidth: 0 }}>
                                            <span style={{ display: 'block', fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: A.inkFaint, textTransform: 'uppercase' }}>{it.sub}</span>
                                            <span style={{ display: 'block', fontSize: 15, fontWeight: 800, color: A.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
                                        </span>
                                    </span>
                                    <span style={{ fontSize: 13, fontWeight: 900, color: A.accent, whiteSpace: 'nowrap' }}>{it.cta || '去完成'} ›</span>
                                </motion.button>
                            ))}
                        </div>

                        {/* 已完成 — 只列一行淡化，給「已經做了什麼」的成就感 */}
                        {doneItems.length > 0 && (
                            <motion.div variants={row} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
                                {doneItems.map((it) => (
                                    <span key={it.key} style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 999,
                                        background: A.veil, color: A.inkSoft, fontSize: 12, fontWeight: 800,
                                        border: `1px solid ${A.veilBorder}`,
                                    }}>
                                        <Check size={12} strokeWidth={3} /> {it.sub}
                                    </span>
                                ))}
                            </motion.div>
                        )}

                        {/* 點一下繼續 */}
                        <motion.div variants={row} style={{ marginTop: 34, fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: A.inkFaint }}>
                            點任意處繼續 →
                        </motion.div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
