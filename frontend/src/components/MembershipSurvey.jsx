/**
 * MembershipSurvey — 訂閱／退訂原因（一題、可複選、可略過）
 * ─────────────────────────────────────────────────────────────
 *   subscribe：付款成功後問「什麼讓你決定訂閱？」
 *   cancel   ：手機回報「關掉自動續訂」後問一次原因（同一期訂閱只問一次）
 * 答案送 /api/membership/survey；統計看 /api/membership/survey/dashboard（ADMIN_KEY）。
 * 開啟就算問過了 —— 略過或直接關 App 都不會再追問。
 */
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { pressProps, RISE_EASE } from '../utils/nutritionMotion';
import haptic from '../utils/haptics';
import { toast } from '../utils/toast';
import { afterMomentIdle } from '../utils/momentEngine';
import { SURVEY_EVENT, SURVEY_REASONS, markSurveyAsked, submitSurvey } from '../utils/membership';

const INK = '#161415';
const PAPER = '#F6F4F1';
const CORAL = '#F95C4B';
const GOLD = '#D4C5A5';
const MAX_PICK = 3;

const COPY = {
    subscribe: { kicker: '謝謝你成為會員', title: '什麼讓你決定訂閱？', sub: '最多選 3 個，我們會照這個把會員做得更好' },
    cancel: { kicker: '已取消自動續訂', title: '可以告訴我們原因嗎？', sub: '到期前會員功能都還能用，紀錄也都會留著' },
};

export default function MembershipSurvey() {
    const [ask, setAsk] = useState(null);      // { kind, key, productId, feature }
    const [picked, setPicked] = useState([]);
    const [note, setNote] = useState('');

    useEffect(() => {
        const onAsk = (e) => {
            const d = e?.detail || {};
            if (!COPY[d.kind]) return;
            afterMomentIdle(() => {
                if (d.key) markSurveyAsked(d.kind, d.key);
                setPicked([]); setNote('');
                setAsk(d);
            });
        };
        window.addEventListener(SURVEY_EVENT, onAsk);
        return () => window.removeEventListener(SURVEY_EVENT, onAsk);
    }, []);

    const close = () => { haptic('light'); setAsk(null); };
    const toggle = (id) => {
        haptic('light');
        setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_PICK ? p : [...p, id]));
    };
    const send = () => {
        if (!picked.length) return;
        haptic('success');
        submitSurvey(ask.kind, picked, { note, productId: ask.productId, feature: ask.feature });
        toast.success('謝謝你的回饋');
        setAsk(null);
    };

    const copy = ask ? COPY[ask.kind] : null;
    return ReactDOM.createPortal(
        <AnimatePresence>
            {ask && (
                <motion.div
                    key="member-survey"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
                    onClick={close}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 290500, background: 'rgba(22,20,21,0.62)',
                        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: 'calc(env(safe-area-inset-top, 0px) + 16px) 16px calc(env(safe-area-inset-bottom, 0px) + 16px)',
                    }}
                >
                    <motion.div
                        role="dialog" aria-modal="true" aria-label={copy.title}
                        initial={{ scale: 0.96, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.97, opacity: 0 }}
                        transition={{ duration: 0.36, ease: RISE_EASE }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: '100%', maxWidth: 400, maxHeight: '100%', overflowY: 'auto',
                            background: INK, color: PAPER, borderRadius: 28, padding: 20,
                            border: '1px solid rgba(246,244,241,0.10)', boxShadow: '0 24px 48px -18px rgba(0,0,0,0.6)',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', color: GOLD }}>{copy.kicker}</span>
                            <motion.button {...pressProps('icon')} onClick={close} aria-label="關閉"
                                style={{ width: 44, height: 44, borderRadius: 22, background: 'rgba(246,244,241,0.08)', display: 'grid', placeItems: 'center' }}>
                                <X size={18} color={PAPER} />
                            </motion.button>
                        </div>
                        <div style={{ fontSize: 28, fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1.15, marginTop: 12 }}>{copy.title}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(246,244,241,0.55)', marginTop: 8 }}>{copy.sub}</div>

                        <div style={{ marginTop: 18, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {SURVEY_REASONS[ask.kind].map(([id, label]) => {
                                const on = picked.includes(id);
                                return (
                                    <motion.button key={id} {...pressProps('pill')} onClick={() => toggle(id)} aria-pressed={on}
                                        style={{
                                            minHeight: 44, padding: '0 14px', borderRadius: 22, fontSize: 14, fontWeight: 600,
                                            background: on ? 'rgba(249,92,75,0.14)' : 'rgba(246,244,241,0.06)',
                                            border: `1.5px solid ${on ? CORAL : 'rgba(246,244,241,0.12)'}`, color: PAPER,
                                        }}>
                                        {label}
                                    </motion.button>
                                );
                            })}
                        </div>

                        {(picked.includes('other') || ask.kind === 'cancel') && (
                            <textarea
                                value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} rows={2}
                                placeholder="還想說什麼（選填）"
                                style={{
                                    width: '100%', marginTop: 12, borderRadius: 18, padding: '12px 14px', resize: 'none',
                                    background: 'rgba(246,244,241,0.06)', border: '1px solid rgba(246,244,241,0.12)',
                                    color: PAPER, fontSize: 14, outline: 'none',
                                }}
                            />
                        )}

                        <motion.button {...pressProps('cta')} onClick={send} disabled={!picked.length}
                            style={{
                                width: '100%', marginTop: 16, height: 52, borderRadius: 26, fontSize: 14, fontWeight: 800,
                                background: picked.length ? CORAL : 'rgba(246,244,241,0.10)',
                                color: picked.length ? '#fff' : 'rgba(246,244,241,0.55)',
                            }}>
                            送出
                        </motion.button>
                        <motion.button {...pressProps('pill')} onClick={close}
                            style={{ width: '100%', minHeight: 44, marginTop: 4, fontSize: 12, fontWeight: 600, color: 'rgba(246,244,241,0.55)' }}>
                            略過
                        </motion.button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body,
    );
}
