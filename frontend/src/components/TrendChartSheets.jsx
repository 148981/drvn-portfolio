/**
 * TrendChartSheets — 趨勢頁的兩張 sheet
 * ─────────────────────────────────────────────────────────────
 * TrendAnalysisSheet  點任何一張圖 → 直接分析這張圖的數據：
 *                     一個大數字 → 一行佐證 → 這代表什麼 → 接下來做什麼。
 * TrendGuideSheet     右上角「?」→ 每張圖在看什麼（一句），規則收在這裡、不常駐在卡片上。
 * 內容都來自 utils/trendChartAnalysis（卡片上的一句話跟這裡用同一套門檻）。
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight } from 'lucide-react';
import { pressProps, RISE_EASE } from '../utils/nutritionMotion';
import haptic from '../utils/haptics';
import { analyzeTrendChart, TREND_CHART_GUIDE, TREND_CHART_TITLES } from '../utils/trendChartAnalysis';

const INK = '#161415';
const PAPER = '#F6F4F1';
const MUTED = 'rgba(22,20,21,0.5)';
const HAIR = 'rgba(22,20,21,0.08)';

function Sheet({ open, onClose, children }) {
    const ui = (
        <AnimatePresence>
            {open && (
                <motion.div key="trend-sheet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
                    style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(22,20,21,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    <motion.div onClick={(e) => e.stopPropagation()}
                        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
                        transition={{ duration: 0.34, ease: RISE_EASE }}
                        style={{ width: '100%', maxWidth: 480, background: PAPER, color: INK, borderRadius: '28px 28px 0 0', boxSizing: 'border-box',
                            padding: '22px 22px max(24px, env(safe-area-inset-bottom))',
                            maxHeight: 'calc(100dvh - env(safe-area-inset-top) - 12px)', overflowY: 'auto' }}>
                        {children}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
    return typeof document !== 'undefined' ? createPortal(ui, document.body) : ui;
}

const Head = ({ title, onClose }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>{title}</div>
        <motion.button {...pressProps('icon')} aria-label="關閉" onClick={() => { haptic('light'); onClose(); }}
            style={{ width: 44, height: 44, borderRadius: 999, border: 'none', background: 'rgba(22,20,21,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <X size={18} color={INK} />
        </motion.button>
    </div>
);

export function TrendAnalysisSheet({ metric, data, onClose }) {
    const a = metric ? analyzeTrendChart(metric, data) : null;
    return (
        <Sheet open={!!metric} onClose={onClose}>
            {a && (
                <>
                    <Head title={a.title} onClose={onClose} />
                    {a.empty ? (
                        <div style={{ marginTop: 18, minHeight: 64, borderRadius: 22, background: 'rgba(22,20,21,0.04)', border: `1px solid ${HAIR}`, display: 'flex', alignItems: 'center', padding: '0 18px', fontSize: 17, fontWeight: 800 }}>
                            {a.empty}
                        </div>
                    ) : (
                        <>
                            {/* 主角：這張圖最重要的一個數字 */}
                            <div style={{ marginTop: 16 }}>
                                <div style={{ fontSize: 12, fontWeight: 800, color: MUTED }}>{a.big.label}</div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                                    <span style={{ fontSize: 52, fontWeight: 300, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{a.big.value}</span>
                                    {a.big.unit && <span style={{ fontSize: 14, fontWeight: 800, color: MUTED }}>{a.big.unit}</span>}
                                </div>
                                {/* 佐證：一行，用方角硬線跟主角分開 */}
                                <div style={{ height: 1.5, background: '#CFC6B8', margin: '14px 0 10px' }} />
                                <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{a.facts.join(' · ')}</div>
                            </div>
                            {/* 這代表什麼 → 接下來做什麼 */}
                            <div style={{ marginTop: 20, fontSize: 17, fontWeight: 800, lineHeight: 1.45 }}>{a.verdict}</div>
                            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 18, background: '#fff', border: `1px solid ${HAIR}` }}>
                                <span style={{ fontSize: 12, fontWeight: 800, color: '#D94030', flexShrink: 0 }}>下一步</span>
                                <span style={{ fontSize: 15, fontWeight: 700, minWidth: 0 }}>{a.action}</span>
                            </div>
                        </>
                    )}
                </>
            )}
        </Sheet>
    );
}

export function TrendGuideSheet({ open, keys = [], onPick, onClose }) {
    const list = keys.filter((k) => TREND_CHART_GUIDE[k]);
    return (
        <Sheet open={open} onClose={onClose}>
            <Head title="每張圖在看什麼" onClose={onClose} />
            <div style={{ marginTop: 10 }}>
                {list.map((k, i) => (
                    <motion.button key={k} {...pressProps('row')} onClick={() => { haptic('light'); onPick?.(k); }}
                        style={{ width: '100%', minHeight: 60, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', border: 'none', borderTop: i ? `1px solid ${HAIR}` : 'none', background: 'none', color: INK, cursor: 'pointer', textAlign: 'left' }}>
                        <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 16, fontWeight: 800 }}>{TREND_CHART_TITLES[k]}</span>
                            <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: MUTED, marginTop: 2 }}>{TREND_CHART_GUIDE[k]}</span>
                        </span>
                        <ChevronRight size={18} color={MUTED} style={{ flexShrink: 0 }} />
                    </motion.button>
                ))}
            </div>
        </Sheet>
    );
}

export default TrendAnalysisSheet;
