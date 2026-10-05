import React from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../../utils/nutritionMotion';
import { bondLevel } from '../../utils/trainTogether';

/**
 * TrainTogetherCards — 一起練的三張卡
 * ══════════════════════════════════════════════════════════════════════
 *   InviteCard    等你回覆的邀請 → 接受 / 婉拒
 *   ActiveCard    進行中 → 兩條進度並排，一眼看出誰到了、還差多少
 *   BondRow       和這位夥伴一起練到什麼程度
 *
 * 設計上只回答三個問題，不多寫字：
 *   誰找我？做什麼？現在該按什麼。
 * 判斷全部來自 utils/trainTogether（headline / cta），這裡只負責畫。
 */

const C = {
    ink: '#161415',
    sub: 'rgba(22,20,21,0.52)',
    hair: 'rgba(22,20,21,0.12)',
    paper: '#F6F4F1',
};

/** 一條進度：名字、數值、長條。兩人並排時看得出差距。 */
const Bar = ({ label, value, target, unit, pct, hit, color, dim }) => (
    <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, marginBottom: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: dim ? C.sub : C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {label}
            </span>
            <span className="tabular-nums" style={{ fontSize: 12, fontWeight: 800, color: hit ? color : C.sub, whiteSpace: 'nowrap' }}>
                {value}{unit ? ` ${unit}` : ''}{hit ? ' ✓' : ''}
            </span>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: 'rgba(22,20,21,0.09)', overflow: 'hidden' }}>
            <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ type: 'spring', stiffness: 150, damping: 24 }}
                style={{ height: '100%', borderRadius: 999, background: color, opacity: dim ? 0.55 : 1 }}
            />
        </div>
    </div>
);

/** 等你回覆的邀請。 */
export const InviteCard = ({ invite, onAccept, onDecline, busy }) => {
    const m = invite.mode;
    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            style={{
                background: C.paper, borderRadius: 22, padding: 18,
                border: `1px solid ${C.hair}`, marginBottom: 12,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 16 }}>{m.icon}</span>
                <span style={{
                    fontSize: 9, fontWeight: 900, letterSpacing: '0.18em',
                    color: m.color, textTransform: 'uppercase',
                }}>
                    {m.label}
                </span>
            </div>

            <p style={{ fontSize: 17, fontWeight: 800, color: C.ink, lineHeight: 1.35, marginBottom: 4 }}>
                {invite.headline}
            </p>
            <p style={{ fontSize: 13, fontWeight: 700, color: C.sub, marginBottom: 4 }}>
                {invite.typeText} · {invite.target}{invite.unit}
            </p>
            <p style={{ fontSize: 12, color: C.sub, marginBottom: 16 }}>{m.rule}</p>

            <div style={{ display: 'flex', gap: 10 }}>
                <motion.button
                    {...pressProps('cta')}
                    type="button"
                    disabled={busy}
                    onClick={() => onAccept?.(invite)}
                    style={{
                        flex: 2, minHeight: 46, borderRadius: 999, border: 'none', cursor: 'pointer',
                        background: m.color, color: C.paper, fontSize: 14, fontWeight: 900,
                        opacity: busy ? 0.6 : 1,
                    }}
                >
                    {busy ? '處理中…' : '接受'}
                </motion.button>
                <motion.button
                    {...pressProps('cta')}
                    type="button"
                    disabled={busy}
                    onClick={() => onDecline?.(invite)}
                    style={{
                        flex: 1, minHeight: 46, borderRadius: 999, cursor: 'pointer',
                        background: 'transparent', color: C.ink, border: `1px solid ${C.hair}`,
                        fontSize: 14, fontWeight: 800, opacity: busy ? 0.6 : 1,
                    }}
                >
                    婉拒
                </motion.button>
            </div>
        </motion.div>
    );
};

/** 進行中：兩人進度並排。 */
export const ActiveCard = ({ invite, onOpen }) => {
    const m = invite.mode;
    const done = invite.status === 'completed';
    return (
        <motion.button
            {...pressProps('row')}
            type="button"
            layout
            onClick={() => onOpen?.(invite)}
            style={{
                width: '100%', textAlign: 'left', cursor: onOpen ? 'pointer' : 'default',
                background: C.paper, borderRadius: 22, padding: 18,
                border: `1px solid ${done ? m.color : C.hair}`, marginBottom: 12,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15 }}>{m.icon}</span>
                    <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.18em', color: m.color, textTransform: 'uppercase' }}>
                        {m.label}
                    </span>
                </span>
                <span style={{ fontSize: 12, fontWeight: 800, color: C.sub }}>
                    {invite.typeText} {invite.target}{invite.unit}
                </span>
            </div>

            <p style={{ fontSize: 16, fontWeight: 800, color: C.ink, marginBottom: 14 }}>
                {invite.headline}
            </p>

            <div style={{ display: 'flex', gap: 14 }}>
                <Bar
                    label="你" value={invite.mine} target={invite.target} unit={invite.unit}
                    pct={invite.myPct} hit={invite.iHit} color={m.color}
                />
                <Bar
                    label={invite.otherName} value={invite.theirs} target={invite.target} unit={invite.unit}
                    pct={invite.theirPct} hit={invite.theyHit} color={m.color} dim
                />
            </div>

            {!done && !invite.iHit && invite.remaining > 0 && (
                <p className="tabular-nums" style={{ fontSize: 12, fontWeight: 700, color: C.sub, marginTop: 12 }}>
                    你還差 {invite.remaining}{invite.unit}
                </p>
            )}
        </motion.button>
    );
};

/** 和這位夥伴一起練到什麼程度。 */
export const BondRow = ({ score, compact = false }) => {
    const b = bondLevel(score);
    const filled = b.tier;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'flex', gap: 3 }} aria-hidden="true">
                {[1, 2, 3, 4].map((i) => (
                    <span key={i} style={{
                        width: 14, height: 3, borderRadius: 999,
                        background: i <= filled ? '#4FA88B' : 'rgba(22,20,21,0.14)',
                    }} />
                ))}
            </span>
            <span style={{ fontSize: 12, fontWeight: 800, color: filled ? C.ink : C.sub }}>
                {b.label}
            </span>
            {!compact && (
                <span style={{ fontSize: 12, color: C.sub }}>· {b.hint}</span>
            )}
        </div>
    );
};

export default { InviteCard, ActiveCard, BondRow };
