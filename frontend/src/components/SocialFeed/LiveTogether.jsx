import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { pressProps } from '../../utils/nutritionMotion';

/**
 * LiveTogether — 即時一起練的畫面
 * ══════════════════════════════════════════════════════════════════════
 *   LiveInviteBanner  有人開房邀你 → 加入
 *   LivePanel         社群頁：這一場現在誰在、各自到哪
 *   LiveStrip         訓練中：一條窄窄的即時列，不擋住訓練本身
 *
 * 只回答一句話：「他現在到哪了」。
 * 失去連線一定要說出來 —— 停在最後一個數字假裝對方還在跑，是說謊。
 */

const C = {
    ink: '#161415',
    sub: 'rgba(22,20,21,0.52)',
    hair: 'rgba(22,20,21,0.12)',
    paper: '#F6F4F1',
    live: '#F95C4B',
};

const typeText = (t) => (t === 'Lift' ? '重訓' : '跑步');
const fmt = (v) => {
    const n = Number(v) || 0;
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
};

/** 有人開房邀你。 */
export const LiveInviteBanner = ({ invites = [], onJoin, busy }) => {
    if (!invites.length) return null;
    const s = invites[0];
    const host = (s.members || [])[0];
    return (
        <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
                background: C.ink, color: C.paper, borderRadius: 20,
                padding: '14px 16px', marginBottom: 12,
                display: 'flex', alignItems: 'center', gap: 12,
            }}
        >
            <span style={{
                width: 8, height: 8, borderRadius: 999, background: C.live, flexShrink: 0,
            }} className="animate-pulse" />
            <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.3 }}>
                    {host?.name || '有人'}正在{typeText(s.type)}
                </p>
                <p style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                    現在加入，一起練
                </p>
            </div>
            <motion.button
                {...pressProps('pill')}
                type="button"
                disabled={busy}
                onClick={() => onJoin?.(s)}
                style={{
                    padding: '10px 18px', borderRadius: 999, border: 'none', cursor: 'pointer',
                    background: C.live, color: C.paper, fontSize: 14, fontWeight: 900,
                    flexShrink: 0, opacity: busy ? 0.6 : 1,
                }}
            >
                {busy ? '加入中…' : '加入'}
            </motion.button>
        </motion.div>
    );
};

/** 一位成員的即時狀態列。 */
const MemberRow = ({ m, goal, unit }) => {
    const pct = goal > 0 ? Math.max(0, Math.min(100, (m.progress / goal) * 100)) : 0;
    return (
        <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{
                        fontSize: 13, fontWeight: 800, color: C.ink,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                        {m.is_me ? '你' : m.name}
                    </span>
                    {m.note && !m.stale && (
                        <span style={{ fontSize: 12, color: C.sub, whiteSpace: 'nowrap' }}>· {m.note}</span>
                    )}
                    {/* 失去連線要明說，不能停在最後一個數字裝作還在動 */}
                    {m.stale && (
                        <span style={{ fontSize: 12, fontWeight: 700, color: C.sub, whiteSpace: 'nowrap' }}>
                            · 失去連線
                        </span>
                    )}
                </span>
                <span className="tabular-nums" style={{ fontSize: 14, fontWeight: 800, color: m.stale ? C.sub : C.ink, whiteSpace: 'nowrap' }}>
                    {fmt(m.progress)}{unit ? ` ${unit}` : ''}
                </span>
            </div>
            {goal > 0 && (
                <div style={{ height: 6, borderRadius: 999, background: 'rgba(22,20,21,0.09)', overflow: 'hidden' }}>
                    <motion.div
                        animate={{ width: `${pct}%` }}
                        transition={{ type: 'spring', stiffness: 130, damping: 22 }}
                        style={{
                            height: '100%', borderRadius: 999,
                            background: m.is_me ? C.ink : C.live,
                            opacity: m.stale ? 0.35 : 1,
                        }}
                    />
                </div>
            )}
        </div>
    );
};

/** 社群頁上的那一場。 */
export const LivePanel = ({ session, onLeave, onOpenWorkout }) => {
    if (!session || session.status === 'ended') return null;
    const waiting = session.status === 'open';
    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
                background: C.paper, borderRadius: 22, padding: 18,
                border: `1px solid ${C.hair}`, marginBottom: 12,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: waiting ? C.sub : C.live }}
                      className={waiting ? '' : 'animate-pulse'} />
                <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.18em', color: waiting ? C.sub : C.live, }}>
                    {waiting ? '等人加入' : '正在一起練'}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: C.sub }}>
                    {typeText(session.type)}{session.goal ? ` · 目標 ${fmt(session.goal)}${session.unit}` : ''}
                </span>
            </div>

            {waiting ? (
                <p style={{ fontSize: 14, fontWeight: 700, color: C.sub, marginBottom: 16 }}>
                    房間開著了，等夥伴進來就開始。
                </p>
            ) : (
                session.members.map((m) => (
                    <MemberRow key={m.user_id} m={m} goal={session.goal} unit={session.unit} />
                ))
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                {onOpenWorkout && (
                    <motion.button
                        {...pressProps('cta')}
                        type="button"
                        onClick={() => onOpenWorkout(session)}
                        style={{
                            flex: 2, minHeight: 46, borderRadius: 999, border: 'none', cursor: 'pointer',
                            background: C.ink, color: C.paper, fontSize: 14, fontWeight: 900,
                        }}
                    >
                        去{typeText(session.type)}
                    </motion.button>
                )}
                <motion.button
                    {...pressProps('cta')}
                    type="button"
                    onClick={() => onLeave?.(session)}
                    style={{
                        flex: 1, minHeight: 46, borderRadius: 999, cursor: 'pointer',
                        background: 'transparent', color: C.ink, border: `1px solid ${C.hair}`,
                        fontSize: 14, fontWeight: 800,
                    }}
                >
                    結束
                </motion.button>
            </div>
        </motion.div>
    );
};

/**
 * 訓練中的即時列 —— 固定在畫面上方，只佔一行。
 * 訓練當下最重要的是自己的動作，夥伴狀態是餘光看的東西，不能搶版面。
 */
export const LiveStrip = ({ session, partners = [] }) => {
    if (!session || session.status !== 'live' || !partners.length) return null;
    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 14px', borderRadius: 999,
                    background: 'rgba(22,20,21,0.86)', color: C.paper,
                    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                    maxWidth: '100%', overflow: 'hidden',
                }}
            >
                <span style={{ width: 7, height: 7, borderRadius: 999, background: C.live, flexShrink: 0 }} className="animate-pulse" />
                <span style={{
                    fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                    {partners.map((p) => (
                        p.stale
                            ? `${p.name} 失去連線`
                            : `${p.name} ${fmt(p.progress)}${session.unit || ''}`
                    )).join(' · ')}
                </span>
            </motion.div>
        </AnimatePresence>
    );
};

export default { LiveInviteBanner, LivePanel, LiveStrip };
