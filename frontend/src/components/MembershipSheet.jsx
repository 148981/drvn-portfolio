/**
 * MembershipSheet — 會員付費牆（全域唯一一個，掛在 App 根層）
 * ─────────────────────────────────────────────────────────────
 * 任何畫面呼叫 openPaywall('advancedCharts') 就會打開，並把「剛剛點到的功能」放在最上面。
 *
 * 畫面規則（付費模式分析 §付費牆時機、介面標準 §2）：
 *   · 一個焦點：剛點到的功能當主角，其他好處最多再列兩項
 *   · 字級只用 36／22／14／12 四級（介面標準 §1：一個畫面最多 4 個字級）
 *   · 價格、期間、自動續訂直接寫出來（Apple 審核 3.1.2）
 *   · 底部固定：恢復購買、服務條款、隱私權政策
 *
 * 版型：置中懸浮視窗（免費使用者點到會員功能時跳出）——
 *   剛剛點到的功能當主角 → 「每天不到 NT$4」→ 還能解鎖哪些 → 方案 → 一顆主按鈕。
 *   付款成功後問一題「為什麼訂閱」（MembershipSurvey，可略過）。
 *
 * 購買走 iOS 原生 StoreKit 2（WebView 橋接 purchase，見 utils/membership 的 App 內購段）：
 *   · 價格與試用資格以 App Store 回傳的為準（在地化價格、用過試用的人不再顯示免費試用）
 *   · 付款成功後交易送後端驗 Apple 簽章，後端寫入才算開通 —— 前端不自己宣布成功
 *   · 網頁版（沒有原生橋接）按鈕會告訴使用者「即將開放」，不假裝購買成功
 */
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { pressProps, RISE_EASE } from '../utils/nutritionMotion';
import haptic from '../utils/haptics';
import { toast } from '../utils/toast';
import LegalSheet from './LegalSheet';
import {
    MEMBER_FEATURES, MEMBERSHIP_PLANS, OPEN_PAYWALL_EVENT, refreshMembership,
    IAP_EVENT, IAP_DONE_EVENT, iapAvailable, iapSend, ensureIapListener,
} from '../utils/membership';
import { isLoggedIn } from '../utils/auth';
import { openMemberWelcome } from './MemberWelcomeSheet';

const INK = '#161415';
const PAPER = '#F6F4F1';
const CORAL = '#F95C4B';
const GOLD = '#D4C5A5';
const LIST_MAX = 5;   // 懸浮視窗列幾項「還能解鎖」，其餘收成「還有 N 項」

const IAP_SOON = 'App 內購即將開放';   // 網頁版（沒有原生購買橋接）的唯一一句
const NEED_LOGIN = '先登入才能訂閱';
const FAIL_TEXT = {
    login: NEED_LOGIN,
    invalid: '購買驗證失敗，請按恢復購買',
    network: '付款已完成，連上網路後會自動開通',
};

/** 'NT$1,290' → 'NT$'（App Store 在地化價格的幣別符號，拿來算「約每月」） */
const currencyOf = (displayPrice) => String(displayPrice || '').replace(/[\d.,\s]+/g, '') || 'NT$';

function trialEndLabel(days) {
    const d = new Date(Date.now() + days * 86400000);
    return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

export default function MembershipSheet() {
    const [feature, setFeature] = useState(null);
    const [open, setOpen] = useState(false);
    const [planId, setPlanId] = useState('yearly');
    const [legalDoc, setLegalDoc] = useState(null);
    const [storeProducts, setStoreProducts] = useState({});   // productId → { displayPrice, price, trialEligible, trialDays }
    const [busy, setBusy] = useState(null);                   // 'buy' | 'restore' | null
    const featureRef = React.useRef(null);                    // 從哪個功能點進來（問卷一起送，看哪個功能最會帶來訂閱）
    useEffect(() => { featureRef.current = feature; }, [feature]);

    useEffect(() => {
        const onOpen = (e) => {
            setFeature(e?.detail?.feature || null);
            setPlanId('yearly');
            setOpen(true);
            if (iapAvailable()) { ensureIapListener(); iapSend('products'); }
        };
        window.addEventListener(OPEN_PAYWALL_EVENT, onOpen);
        return () => window.removeEventListener(OPEN_PAYWALL_EVENT, onOpen);
    }, []);

    // App Store 回來的事件：商品價格、取消、等待核准、失敗
    useEffect(() => {
        const onIap = (e) => {
            const d = e?.detail || {};
            if (d.type === 'products' && Array.isArray(d.products)) {
                setStoreProducts(Object.fromEntries(d.products.map((p) => [p.id, p])));
            } else if (d.type === 'cancelled') {
                setBusy(null);
            } else if (d.type === 'pending') {
                setBusy(null);
                toast.info('等待付款確認，完成後會自動開通');
            } else if (d.type === 'failed' && d.stage !== 'products') {
                setBusy(null);
                toast.error(d.message || '無法完成購買，請稍後再試');
            }
        };
        // 後端驗完 Apple 簽章之後的結果（utils/membership 的 ensureIapListener 廣播）
        const onDone = (e) => {
            const d = e?.detail || {};
            if (d.kind === 'purchase') {
                setBusy(null);
                if (d.ok && d.data?.is_member) {
                    haptic('success'); setOpen(false);
                    // 開通頁：現在多了什麼、一鍵帶去；關掉之後才問為什麼訂閱（統計用，可略過）
                    const pid = d.data?.product_id || null;
                    openMemberWelcome({ survey: { key: `${pid}:${Date.now()}`, productId: pid, feature: featureRef.current } });
                }
                else toast.error(FAIL_TEXT[d.reason] || FAIL_TEXT.invalid);
            } else if (d.kind === 'restore') {
                setBusy(null);
                if (!d.ok) toast.error(FAIL_TEXT[d.reason] || FAIL_TEXT.network);
                else if (!d.count) toast.info('這個 Apple ID 沒有可恢復的訂閱');
                else if (d.data?.is_member) { toast.success('已恢復會員'); setOpen(false); }
                else toast.info('找到的訂閱已到期');
            }
        };
        window.addEventListener(IAP_EVENT, onIap);
        window.addEventListener(IAP_DONE_EVENT, onDone);
        return () => {
            window.removeEventListener(IAP_EVENT, onIap);
            window.removeEventListener(IAP_DONE_EVENT, onDone);
        };
    }, []);

    const close = () => { haptic('light'); setOpen(false); setBusy(null); };

    const hero = MEMBER_FEATURES[feature] || MEMBER_FEATURES.sessionWeight;
    const allOthers = Object.entries(MEMBER_FEATURES)
        .filter(([k]) => k !== (MEMBER_FEATURES[feature] ? feature : 'sessionWeight'));
    const others = allOthers.slice(0, LIST_MAX);
    const moreCount = allOthers.length - others.length;
    const plan = MEMBERSHIP_PLANS.find((p) => p.id === planId) || MEMBERSHIP_PLANS[0];

    // 價格：App Store 有回傳就用它的在地化價格；沒有（網頁版、還沒載到）才用本地定價
    const priceOf = (p) => storeProducts[p.productId]?.displayPrice || `NT$${p.price.toLocaleString()}`;
    const perMonthOf = (p) => {
        const sp = storeProducts[p.productId];
        return sp ? `${currencyOf(sp.displayPrice)}${Math.round(sp.price / 12)}` : `NT$${Math.round(p.price / 12)}`;
    };
    // 「花小錢」：年方案換算成每天，無條件進位（NT$1,290 → 每天不到 NT$4）
    const yearlyPlan = MEMBERSHIP_PLANS.find((p) => p.id === 'yearly') || MEMBERSHIP_PLANS[0];
    const perDayText = (() => {
        const ysp = storeProducts[yearlyPlan.productId];
        const price = ysp ? ysp.price : yearlyPlan.price;
        const cur = ysp ? currencyOf(ysp.displayPrice) : 'NT$';
        return `${cur}${Math.ceil(price / 365)}`;
    })();
    // 試用：用過的人 App Store 會回 trialEligible=false，就不能再寫「免費試用」
    const sp = storeProducts[plan.productId];
    //   App 內還沒拿到 App Store 回傳前不寫「免費試用」—— 用過試用的人會先看到一個不存在的優惠（3.1.2）
    const trialDays = sp ? (sp.trialEligible ? (sp.trialDays || plan.trialDays) : 0) : (iapAvailable() ? 0 : plan.trialDays);

    const startNative = (action) => {
        if (!iapAvailable()) { if (action === 'restore') refreshMembership(); toast.info(IAP_SOON); return false; }
        if (!isLoggedIn()) { toast.info(NEED_LOGIN); return false; }
        ensureIapListener();
        return iapSend(action, action === 'buy' ? plan.productId : undefined);
    };

    const buy = () => {
        if (busy) return;
        haptic('medium');
        if (startNative('buy')) setBusy('buy');
    };

    const restore = () => {
        if (busy) return;
        haptic('light');
        if (startNative('restore')) setBusy('restore');
    };

    const ctaLabel = busy ? '處理中…' : trialDays > 0 ? `免費試用 ${trialDays} 天` : `訂閱 ${priceOf(plan)}／${plan.period}`;
    const fineprint = trialDays > 0
        ? `${trialEndLabel(trialDays)}起每${plan.period} ${priceOf(plan)} 自動續訂，可隨時取消`
        : `每${plan.period} ${priceOf(plan)} 自動續訂，可隨時在 Apple ID 取消`;

    return ReactDOM.createPortal(
        <>
            <AnimatePresence>
                {open && (
                    <motion.div
                        key="paywall"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{
                            position: 'fixed', inset: 0, zIndex: 290000,
                            background: 'rgba(22,20,21,0.62)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: 'calc(env(safe-area-inset-top, 0px) + 16px) 16px calc(env(safe-area-inset-bottom, 0px) + 16px)',
                        }}
                        onClick={close}
                    >
                        {/* 懸浮視窗：置中、四角圓、內容太長時自己捲 */}
                        <motion.div
                            role="dialog" aria-modal="true" aria-label="成為 DRVN 會員"
                            initial={{ scale: 0.96, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.97, opacity: 0 }}
                            transition={{ duration: 0.36, ease: RISE_EASE }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                width: '100%', maxWidth: 400, maxHeight: '100%', overflowY: 'auto',
                                background: INK, color: PAPER, borderRadius: 28,
                                border: '1px solid rgba(246,244,241,0.10)',
                                boxShadow: '0 24px 48px -18px rgba(0,0,0,0.6)',
                                padding: 20,
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', color: GOLD }}>DRVN 會員</span>
                                <motion.button {...pressProps('icon')} onClick={close} aria-label="關閉"
                                    style={{ width: 44, height: 44, borderRadius: 22, background: 'rgba(246,244,241,0.08)', display: 'grid', placeItems: 'center' }}>
                                    <X size={18} color={PAPER} />
                                </motion.button>
                            </div>

                            {/* 主角：剛剛點到的功能 */}
                            <div style={{ fontSize: 28, fontWeight: 300, letterSpacing: "-0.03em", lineHeight: 1.15, marginTop: 12 }}>
                                {hero.title}
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(246,244,241,0.55)', marginTop: 8 }}>
                                {hero.line}
                            </div>

                            {/* 花小錢 */}
                            <div style={{ marginTop: 18, fontSize: 14, fontWeight: 700, color: GOLD }}>
                                每天不到 {perDayText}，這些全部解鎖
                            </div>
                            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {others.map(([k, f]) => (
                                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600 }}>
                                        <Check size={16} color={CORAL} strokeWidth={2.5} />
                                        {f.title}
                                    </div>
                                ))}
                                {moreCount > 0 && (
                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(246,244,241,0.55)', paddingLeft: 26 }}>
                                        還有 {moreCount} 項會員功能
                                    </div>
                                )}
                            </div>

                            {/* 方案 */}
                            <div style={{ marginTop: 24, display: 'flex', gap: 10 }}>
                                {MEMBERSHIP_PLANS.map((p) => {
                                    const on = p.id === planId;
                                    return (
                                        <motion.button key={p.id} {...pressProps('card')}
                                            onClick={() => { haptic('light'); setPlanId(p.id); }}
                                            style={{
                                                flex: 1, minHeight: 72, borderRadius: 18, textAlign: 'left', padding: '12px 14px',
                                                background: on ? 'rgba(249,92,75,0.12)' : 'rgba(246,244,241,0.05)',
                                                border: `1.5px solid ${on ? CORAL : 'rgba(246,244,241,0.12)'}`,
                                                color: PAPER,
                                            }}>
                                            <div style={{ fontSize: 28, fontWeight: 300, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>
                                                {priceOf(p)}
                                            </div>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(246,244,241,0.55)', marginTop: 2 }}>
                                                {p.id === 'yearly' ? `每年 · 約 ${perMonthOf(p)}／月` : '每月'}
                                            </div>
                                        </motion.button>
                                    );
                                })}
                            </div>

                            <motion.button {...pressProps('cta')} onClick={buy} disabled={!!busy} aria-busy={!!busy}
                                style={{ width: '100%', marginTop: 16, height: 52, borderRadius: 26, background: CORAL, color: '#fff', fontSize: 14, fontWeight: 800, opacity: busy ? 0.7 : 1 }}>
                                {ctaLabel}
                            </motion.button>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(246,244,241,0.42)', textAlign: 'center', marginTop: 10 }}>
                                {fineprint}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 8 }}>
                                {[['恢復購買', restore], ['服務條款', () => setLegalDoc('terms')], ['隱私權政策', () => setLegalDoc('privacy')]].map(([label, fn]) => (
                                    <motion.button key={label} {...pressProps('pill')} onClick={fn}
                                        style={{ minHeight: 44, padding: '0 10px', fontSize: 12, fontWeight: 600, color: 'rgba(246,244,241,0.55)' }}>
                                        {label}
                                    </motion.button>
                                ))}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            <LegalSheet doc={legalDoc} onClose={() => setLegalDoc(null)} />
        </>,
        document.body,
    );
}
