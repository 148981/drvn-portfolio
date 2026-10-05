/**
 * MembershipPlanSheet — 會員方案頁（設定頁 PREMIER 卡、首頁扣款提醒都開這個）
 * ─────────────────────────────────────────────────────────────
 *   · 我的方案：哪個方案、下次扣款日／試用結束日／到期日（planSummary）
 *   · 方案種類：年訂閱、月訂閱，標出目前這個
 *   · 會員權益：MEMBER_FEATURES 全部
 *   · 換方案或取消：一律到 Apple 的訂閱管理（扣款與取消都由 Apple 處理）
 */
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { pressProps, RISE_EASE } from '../utils/nutritionMotion';
import haptic from '../utils/haptics';
import {
    MEMBER_FEATURES, MEMBERSHIP_PLANS, OPEN_PLAN_EVENT, membershipInfo, planByProduct, planSummary, openManageSubscriptions, openPaywall,
} from '../utils/membership';

const INK = '#161415';
const PAPER = '#F6F4F1';
const GOLD = '#D4C5A5';
const MUTED = 'rgba(246,244,241,0.55)';
const RULE = '1px solid rgba(207,198,184,0.18)';

function Kicker({ children }) {
    return <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', color: MUTED, marginTop: 22, marginBottom: 10 }}>{children}</div>;
}

export default function MembershipPlanSheet() {
    const [open, setOpen] = useState(false);
    const [info, setInfo] = useState(membershipInfo);

    useEffect(() => {
        const onOpen = () => { setInfo(membershipInfo()); setOpen(true); };
        window.addEventListener(OPEN_PLAN_EVENT, onOpen);
        return () => window.removeEventListener(OPEN_PLAN_EVENT, onOpen);
    }, []);

    const close = () => { haptic('light'); setOpen(false); };
    const { name, line } = planSummary(info);
    const current = planByProduct(info.productId);
    const storePrice = info.renewal?.productId && info.renewal.displayPrice ? { [info.renewal.productId]: info.renewal.displayPrice } : {};

    return ReactDOM.createPortal(
        <AnimatePresence>
            {open && (
                <motion.div
                    key="plan-sheet"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
                    onClick={close}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 290200, background: 'rgba(22,20,21,0.62)',
                        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: 'calc(env(safe-area-inset-top, 0px) + 16px) 16px calc(env(safe-area-inset-bottom, 0px) + 16px)',
                    }}
                >
                    <motion.div
                        role="dialog" aria-modal="true" aria-label="我的會員方案"
                        initial={{ scale: 0.96, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.97, opacity: 0 }}
                        transition={{ duration: 0.36, ease: RISE_EASE }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: '100%', maxWidth: 400, maxHeight: '100%', overflowY: 'auto',
                            background: INK, color: PAPER, borderRadius: 28, padding: 20,
                            border: '1px solid rgba(212,197,165,0.22)', boxShadow: '0 24px 48px -18px rgba(0,0,0,0.6)',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', color: GOLD }}>PREMIER DRVNNER</span>
                            <motion.button {...pressProps('icon')} onClick={close} aria-label="關閉"
                                style={{ width: 44, height: 44, borderRadius: 22, background: 'rgba(246,244,241,0.08)', display: 'grid', placeItems: 'center' }}>
                                <X size={18} color={PAPER} />
                            </motion.button>
                        </div>

                        {/* 我的方案 */}
                        <div style={{ fontSize: 28, fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1.15, marginTop: 12 }}>{name}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, marginTop: 8 }}>{line}</div>

                        {/* 方案種類 */}
                        <Kicker>方案種類</Kicker>
                        <div style={{ borderTop: RULE }}>
                            {MEMBERSHIP_PLANS.map((p) => {
                                const on = !info.comp && current?.id === p.id;
                                const price = storePrice[p.productId] || `NT$${p.price.toLocaleString()}`;
                                const note = p.id === 'yearly'
                                    ? `約 NT$${Math.round(p.price / 12)}／月${p.trialDays ? `・第一次訂閱免費試用 ${p.trialDays} 天` : ''}`
                                    : '每月扣款，隨時可取消';
                                return (
                                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 0', borderBottom: RULE }}>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontSize: 14, fontWeight: 700 }}>
                                                {p.id === 'yearly' ? '年訂閱' : '月訂閱'}
                                                {on && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 800, color: INK, background: GOLD, borderRadius: 999, padding: '2px 8px' }}>目前方案</span>}
                                            </div>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, marginTop: 2 }}>{note}</div>
                                        </div>
                                        <div style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                                            {price}<span style={{ fontSize: 12, color: MUTED }}>／{p.period}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* 會員權益 */}
                        <Kicker>會員權益</Kicker>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px' }}>
                            {Object.entries(MEMBER_FEATURES).map(([k, f]) => (
                                <div key={k} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, fontWeight: 600, lineHeight: 1.4 }}>
                                    <Check size={14} color={GOLD} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 2 }} />
                                    {f.title}
                                </div>
                            ))}
                        </div>

                        {info.comp ? (
                            <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, marginTop: 22, textAlign: 'center' }}>
                                你是永久會員，不會有任何扣款
                            </div>
                        ) : !['trial', 'active', 'grace'].includes(info.status) ? (
                            /* 還沒訂閱（或已到期）：沒有東西可以「取消」—— 帶去付費視窗（訂閱、恢復購買都在那裡） */
                            <motion.button {...pressProps('cta')} onClick={() => { haptic('light'); setOpen(false); openPaywall(null); }}
                                style={{
                                    width: '100%', marginTop: 22, height: 52, borderRadius: 26, fontSize: 14, fontWeight: 800,
                                    background: '#F95C4B', color: '#fff',
                                }}>
                                訂閱或恢復購買
                            </motion.button>
                        ) : (
                            <>
                                <motion.button {...pressProps('cta')} onClick={() => { haptic('light'); openManageSubscriptions(); }}
                                    style={{
                                        width: '100%', marginTop: 22, height: 52, borderRadius: 26, fontSize: 14, fontWeight: 800,
                                        background: 'rgba(246,244,241,0.08)', border: '1px solid rgba(246,244,241,0.14)', color: PAPER,
                                    }}>
                                    換方案或取消訂閱
                                </motion.button>
                                <div style={{ fontSize: 11, fontWeight: 600, color: MUTED, marginTop: 10, textAlign: 'center' }}>
                                    扣款與取消都由 Apple 處理，DRVN 看不到你的付款資料
                                </div>
                            </>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body,
    );
}
