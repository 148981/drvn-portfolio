/**
 * WeeklyBlockProposal.jsx — 「把你的 Block 換進計劃」週提案 sheet
 * ─────────────────────────────────────────────────────────
 * 由 weeklyPlanReview 觸發（上週計劃 0 次、自主訓練 ≥ 2 次）。
 * 設計：瑞士極簡 bottom sheet —— 一句觀察、一個提案、兩個出口，
 * 不指責、不推銷；「你的節奏也是好節奏」是文案的核心態度。
 *
 * CTA → 帶 state 導向計劃頁並自動打開編輯（PlanFullViewSheet），
 * 使用者在那裡把訓練日換成自己的 Block（可勾四週同步）。
 */

import React from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Repeat, X } from 'lucide-react';
import { dismissWeeklyReview } from '../utils/weeklyPlanReview';
import { haptic } from '../utils/haptics';

const WeeklyBlockProposal = ({ open, freestyleCount = 2, userId, onClose }) => {
    const navigate = useNavigate();
    if (!open) return null;

    const keep = () => { dismissWeeklyReview(userId); onClose?.(); };
    const go = () => {
        haptic('medium');
        onClose?.();
        // 導向計劃頁並要求自動展開「編輯計劃」（含四週同步選項的完整編輯視圖）
        navigate('/luxury-plan-view-mobile', { state: { openFullEdit: true, fromWeeklyReview: true } });
    };

    return createPortal(
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={keep}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 2147483620,
                        background: 'rgba(22,20,21,0.5)', backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                    }}
                >
                    <motion.div
                        initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: '100%', maxWidth: 430,
                            background: '#F6F4F1', borderRadius: '26px 26px 0 0',
                            padding: '26px 24px calc(env(safe-area-inset-bottom, 0px) + 26px)',
                        }}
                    >
                        {/* kicker */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <div style={{ width: 22, height: 2, background: '#F95C4B', marginBottom: 12 }} />
                                <p style={{ margin: 0, fontSize: 12, fontWeight: 900, letterSpacing: '0.28em', color: 'rgba(22,20,21,0.45)' }}>
                                    WEEKLY REVIEW · 上週回顧
                                </p>
                            </div>
                            <motion.button {...pressProps('row')} onClick={keep} aria-label="關閉" style={{ width: 30, height: 30, borderRadius: 99, border: '1px solid rgba(22,20,21,0.12)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                <X size={15} color="#161415" />
                            </motion.button>
                        </div>

                        {/* 觀察（不指責）+ 提案 */}
                        <h2 style={{
                            margin: '18px 0 0', fontSize: 26, fontWeight: 300,
                            letterSpacing: '-0.02em', lineHeight: 1.35, color: '#161415',
                        }}>
                            上週你照<span style={{ color: '#F95C4B', fontWeight: 400 }}>自己的節奏</span>練了 {freestyleCount} 次。
                        </h2>
                        <p style={{ margin: '12px 0 0', fontSize: 13.5, lineHeight: 1.7, color: 'rgba(22,20,21,0.6)' }}>
                            你的節奏也是好節奏 — 要不要把它變成正式計劃？
                            可以把課表裡的訓練日換成你的 Block，一次套用到四週。
                        </p>

                        {/* CTA */}
                        <motion.button {...pressProps('row')} onClick={go} style={{
 marginTop: 22, width: '100%', padding: '15px 0', borderRadius: 16,
 border: 'none', cursor: 'pointer',
 background: '#161415', color: '#F6F4F1',
 fontSize: 12, fontWeight: 800, letterSpacing: '0.16em',
 display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
 }}>
                            <Repeat size={14} /> 把我的 BLOCK 換進計劃
                        </motion.button>
                        <motion.button {...pressProps('row')} onClick={keep} style={{
 marginTop: 10, width: '100%', padding: '13px 0', borderRadius: 16,
 border: '1px solid rgba(22,20,21,0.15)', cursor: 'pointer',
 background: 'transparent', color: 'rgba(22,20,21,0.6)',
 fontSize: 11.5, fontWeight: 700, letterSpacing: '0.1em',
 }}>
                            保持現在的計劃
                        </motion.button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
};

export default WeeklyBlockProposal;
