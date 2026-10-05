/**
 * MemberWelcomeSheet — 付款／試用開通後的第一個畫面（全域一個，掛在 App 根層）
 * ─────────────────────────────────────────────────────────────
 * 以前付完錢只有一個 toast「會員已開通」，回到畫面什麼都沒變 —— 使用者不知道多了什麼。
 * 現在開通那一刻給四條「現在就能去用」的路，一條一個目的地；關掉之後才問為什麼訂閱。
 * 觸發：window 事件 MEMBER_WELCOME_EVENT（MembershipSheet 購買成功時發）。
 */
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Dumbbell, BarChart3, FileText, MapPin } from 'lucide-react';
import { pressProps, RISE_EASE, riseIn } from '../utils/nutritionMotion';
import haptic from '../utils/haptics';
import { openSurvey } from '../utils/membership';

export const MEMBER_WELCOME_EVENT = 'drvn:member-welcome';
export const openMemberWelcome = (detail = {}) => {
    try { window.dispatchEvent(new CustomEvent(MEMBER_WELCOME_EVENT, { detail })); } catch (_) { /* ignore */ }
};

const INK = '#161415';
const PAPER = '#F6F4F1';
const CORAL = '#F95C4B';
const MUTED = 'rgba(22,20,21,0.45)';

const PATHS = [
    { key: 'weight', Icon: Dumbbell, title: '每一組都帶好重量', sub: '下次訓練自動出現', to: '/luxury-plan-view-mobile' },
    { key: 'charts', Icon: BarChart3, title: '進階圖表與教練判讀', sub: '負荷、體能、代謝', to: '/training-record-mobile' },
    { key: 'report', Icon: FileText, title: '每月教練總評', sub: '可以存成 PDF', to: '/monthly-report-mobile' },
    { key: 'place', Icon: MapPin, title: '依地點排課', sub: '健身房器材、跑點', to: '/gym-memory-mobile' },
];

export default function MemberWelcomeSheet() {
    const navigate = useNavigate();
    const [detail, setDetail] = useState(null);
    useEffect(() => {
        const on = (e) => { setDetail(e?.detail || {}); haptic('success'); };
        window.addEventListener(MEMBER_WELCOME_EVENT, on);
        return () => window.removeEventListener(MEMBER_WELCOME_EVENT, on);
    }, []);

    const close = (to = null) => {
        const d = detail;
        setDetail(null);
        if (to) navigate(to);
        // 關掉之後才問為什麼訂閱（統計用，可略過）
        if (d?.survey) setTimeout(() => openSurvey('subscribe', d.survey), 600);
    };

    const ui = (
        <AnimatePresence>
            {detail && (
                <motion.div key="welcome" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={() => close()}
                    style={{ position: 'fixed', inset: 0, zIndex: 100001, background: 'rgba(22,20,21,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}>
                    <motion.div onClick={(e) => e.stopPropagation()}
                        initial={{ y: 24, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 24, opacity: 0 }}
                        transition={{ duration: 0.4, ease: RISE_EASE }}
                        style={{
                            width: '100%', maxWidth: 400, boxSizing: 'border-box', borderRadius: 30, padding: '28px 20px 20px',
                            background: PAPER, color: INK, boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
                            maxHeight: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 24px)', overflowY: 'auto',
                        }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: CORAL, letterSpacing: '0.12em' }}>PREMIER DRVNNER</div>
                        <div style={{ fontSize: 30, fontWeight: 300, letterSpacing: '-0.03em', marginTop: 6 }}>會員已開通</div>
                        <div style={{ marginTop: 20 }}>
                            {PATHS.map(({ key, Icon, title, sub, to }, i) => (
                                <motion.button key={key} {...riseIn(i)} {...pressProps('row')}
                                    onClick={() => { haptic('light'); close(to); }}
                                    style={{
                                        width: '100%', minHeight: 60, marginBottom: 8, padding: '0 14px', borderRadius: 18, boxSizing: 'border-box',
                                        display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'left', color: INK,
                                        background: '#fff', border: '1px solid rgba(22,20,21,0.06)',
                                    }}>
                                    <span style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(249,92,75,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <Icon size={17} color={CORAL} />
                                    </span>
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{ display: 'block', fontSize: 17, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
                                        <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: MUTED, marginTop: 1 }}>{sub}</span>
                                    </span>
                                    <ChevronRight size={17} color={MUTED} style={{ flexShrink: 0 }} />
                                </motion.button>
                            ))}
                        </div>
                        <motion.button {...pressProps('cta')} onClick={() => { haptic('light'); close(); }}
                            style={{ width: '100%', height: 54, marginTop: 10, borderRadius: 18, border: 'none', background: INK, color: PAPER, fontSize: 17, fontWeight: 900, cursor: 'pointer' }}>
                            開始
                        </motion.button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
    return typeof document !== 'undefined' ? ReactDOM.createPortal(ui, document.body) : ui;
}
