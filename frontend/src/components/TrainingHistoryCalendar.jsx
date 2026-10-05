/**
 * TrainingHistoryCalendar — 中控台的「訓練月曆」
 * ───────────────────────────────────────────────
 * 一格一天：當天練了什麼（推／拉／腿／跑 5.2）、有沒有破紀錄（PR）、有沒有比上一次進步（↑）。
 * 點有紀錄的那一天 → 浮出當天的完整紀錄（每一場的數字、破了什麼、進步了多少、做了哪些動作），
 * 底下可以再進到該場的完整結算頁。
 * 資料：activityFeedSource.loadMyActivities（跟最新動態同一份，獎牌也是同一套算法）。
 */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { pressProps } from '../utils/nutritionMotion';
import { haptic } from '../utils/haptics';
import { loadMyActivities, isStrengthSession } from '../utils/activityFeedSource';
import { buildHistoryDays, monthGrid, monthSummary } from '../utils/historyCalendar';
import { toLocalDateKey } from '../utils/localDate';
import { logicalNow } from '../utils/dailyAgenda';

const INK = '#161415';
const PAPER = '#F6F4F1';
const PEBBLE = '#CFC6B8';
const MUTED = 'rgba(22,20,21,0.45)';
const CORAL = '#F95C4B';
const OLIVE = '#5A7A3A';
const WEEK = ['一', '二', '三', '四', '五', '六', '日'];
const WEEKDAY_FULL = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

function DayCell({ date, day, isToday, onOpen }) {
    if (!date) return <div />;
    const has = !!day?.sessions?.length;
    const chips = has ? day.sessions.slice(0, 2) : [];
    const more = has ? day.sessions.length - chips.length : 0;
    return (
        <motion.button type="button" {...(has ? pressProps('pill') : {})}
            onClick={() => { if (has) { haptic('light'); onOpen(day); } }}
            aria-label={has ? `${date.getMonth() + 1}月${date.getDate()}日，${day.sessions.map(e => e.title).join('、')}${day.pr ? '，破紀錄' : ''}` : `${date.getMonth() + 1}月${date.getDate()}日`}
            style={{
                minHeight: 66, padding: '5px 2px 4px', borderRadius: 12, cursor: has ? 'pointer' : 'default',
                border: isToday ? `1.5px solid ${CORAL}` : '1px solid transparent',
                background: has ? '#FFFFFF' : 'transparent',
                boxShadow: has ? '0 1px 0 rgba(22,20,21,0.04), 0 6px 14px rgba(22,20,21,0.05)' : 'none',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                WebkitTapHighlightColor: 'transparent',
            }}>
            <span style={{ fontSize: 11, fontWeight: isToday ? 900 : 700, color: isToday ? CORAL : (has ? INK : 'rgba(22,20,21,0.32)'), fontVariantNumeric: 'tabular-nums' }}>
                {date.getDate()}
            </span>
            {chips.map((e, i) => (
                <span key={i} style={{
                    maxWidth: '100%', padding: '1px 5px', borderRadius: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    fontSize: 10, fontWeight: 900, lineHeight: '15px',
                    background: e.kind === 'strength' ? INK : 'rgba(22,20,21,0.08)',
                    color: e.kind === 'strength' ? PAPER : INK,
                }}>{e.kind === 'run' && e.km > 0 ? `${e.glyph}${e.km >= 10 ? Math.round(e.km) : e.km.toFixed(1)}` : e.glyph}</span>
            ))}
            {more > 0 && <span style={{ fontSize: 9, fontWeight: 800, color: MUTED }}>+{more}</span>}
            {has && (day.pr || day.gain) && (
                <span style={{ fontSize: 9, fontWeight: 900, lineHeight: '11px', color: day.pr ? CORAL : OLIVE, whiteSpace: 'nowrap' }}>
                    {day.pr ? 'PR' : `↑${day.gain.replace(/^\+/, '')}`}
                </span>
            )}
        </motion.button>
    );
}

function DaySheet({ day, onClose }) {
    const navigate = useNavigate();
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    if (!day) return null;
    const d = day.date;
    const openFull = (entry) => {
        haptic('light');
        const s = entry.s;
        if (isStrengthSession(s)) {
            navigate('/strength-session-mobile', { state: { from: '/training-focus', record: { ...(s.raw || {}) } } });
        } else if (s.session_id) {
            navigate(`/running-analysis-mobile/${s.session_id}`, { state: { from: '/training-focus' } });
        }
    };
    return createPortal(
        <motion.div key="hist-sheet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(22,20,21,0.42)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <motion.div role="dialog" aria-modal="true" aria-label={`${d.getMonth() + 1}月${d.getDate()}日的訓練紀錄`}
                initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
                transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                onClick={(e) => e.stopPropagation()}
                style={{ width: '100%', maxWidth: 480, maxHeight: '82dvh', overflowY: 'auto', background: PAPER, borderRadius: '24px 24px 0 0', padding: '10px 18px calc(22px + env(safe-area-inset-bottom))', boxShadow: '0 -18px 40px rgba(22,20,21,0.18)' }}>
                <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(22,20,21,0.15)', margin: '0 auto 12px' }} />
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                        <div style={{ fontSize: 22, fontWeight: 900, color: INK, letterSpacing: '-0.02em' }}>{d.getMonth() + 1} 月 {d.getDate()} 日</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: MUTED, marginTop: 2 }}>
                            {WEEKDAY_FULL[d.getDay()]} · {day.sessions.length} 場訓練{day.pr ? ' · 破紀錄' : ''}
                        </div>
                    </div>
                    <motion.button type="button" {...pressProps('pill')} onClick={onClose} aria-label="關閉"
                        style={{ width: 44, height: 44, borderRadius: 999, border: 'none', background: 'rgba(22,20,21,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                        <X size={18} color={INK} />
                    </motion.button>
                </div>

                {day.sessions.map((e, i) => {
                    const dark = e.kind === 'strength';
                    return (
                        <div key={i} style={{ marginTop: 14, borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(22,20,21,0.06)', background: '#FFFFFF' }}>
                            {/* 主卡：這一場的數字（重訓用深色鈦，跑步用淺色） */}
                            <div style={{ padding: '14px 16px', background: dark ? 'linear-gradient(135deg,#2B2A2C,#161415)' : 'linear-gradient(135deg,#FFFFFF,#EFEBE5)', color: dark ? PAPER : INK }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 16, fontWeight: 900 }}>{e.title}</span>
                                    {e.prs.length > 0 && <span style={{ fontSize: 11, fontWeight: 900, color: CORAL, border: `1px solid ${CORAL}`, borderRadius: 999, padding: '1px 8px' }}>破紀錄</span>}
                                </div>
                                {e.stats.length > 0 && (
                                    <div style={{ display: 'flex', gap: 18, marginTop: 10 }}>
                                        {e.stats.map((st, j) => (
                                            <div key={j}>
                                                <div style={{ fontSize: 20, fontWeight: 900, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{st.v}</div>
                                                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6 }}>{st.l}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div style={{ padding: '10px 16px 12px' }}>
                                {e.prs.map((p, j) => (
                                    <div key={`p${j}`} style={{ fontSize: 13, fontWeight: 700, color: INK, padding: '4px 0', display: 'flex', gap: 8 }}>
                                        <span style={{ color: CORAL, fontWeight: 900, flexShrink: 0 }}>PR</span>
                                        <span>{p.label}{p.detail ? `　${p.detail}` : ''}{p.gain ? <span style={{ color: OLIVE, fontWeight: 900 }}>{`　預估最大 +${p.gain} kg`}</span> : null}</span>
                                    </div>
                                ))}
                                {e.gains.slice(0, 4).map((g, j) => (
                                    <div key={`g${j}`} style={{ fontSize: 13, fontWeight: 700, color: INK, padding: '4px 0', display: 'flex', gap: 8 }}>
                                        <span style={{ color: OLIVE, fontWeight: 900, flexShrink: 0 }}>↑</span>
                                        <span>{e.kind === 'strength'
                                            ? `${g.label}　預估最大 ${g.from} → ${g.to} kg（+${g.delta}）`
                                            : `${g.label}　${g.from} → ${g.to}（快 ${g.delta} 秒）`}</span>
                                    </div>
                                ))}
                                {e.gains.length > 4 && <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, padding: '2px 0 4px 18px' }}>還有 {e.gains.length - 4} 個動作進步</div>}
                                {!e.prs.length && !e.gains.length && (
                                    <div style={{ fontSize: 12.5, fontWeight: 700, color: MUTED, padding: '4px 0' }}>
                                        {e.kind === 'strength' ? '跟上一次差不多，維持住了' : '這次沒有可以比的上一次，或配速差不多'}
                                    </div>
                                )}
                                {e.lines.length > 0 && (
                                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(22,20,21,0.07)' }}>
                                        {e.lines.map((l, j) => (
                                            <div key={j} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '3px 0' }}>
                                                <span style={{ fontWeight: 700, color: INK, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
                                                <span style={{ fontWeight: 800, color: MUTED, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{l.best}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {(e.kind === 'strength' || e.s?.session_id) && (
                                    <motion.button type="button" {...pressProps('row')} onClick={() => openFull(e)}
                                        style={{ marginTop: 10, width: '100%', minHeight: 44, borderRadius: 12, border: '1px solid rgba(22,20,21,0.12)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, fontWeight: 800, color: INK, cursor: 'pointer' }}>
                                        看這場的完整紀錄 <ArrowRight size={14} />
                                    </motion.button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </motion.div>
        </motion.div>,
        document.body,
    );
}

export default function TrainingHistoryCalendar({ userId }) {
    const today = logicalNow();
    const [ym, setYm] = useState({ y: today.getFullYear(), m: today.getMonth() });
    const [state, setState] = useState({ loading: true, failed: false, sessions: [] });
    const [open, setOpen] = useState(null);
    const [reload, setReload] = useState(0);

    useEffect(() => {
        let alive = true;
        setState((s) => ({ ...s, loading: true }));
        loadMyActivities(userId, { limit: 400 })
            .then((r) => { if (alive) setState({ loading: false, failed: r.failed, sessions: r.sessions || [] }); })
            .catch(() => { if (alive) setState({ loading: false, failed: true, sessions: [] }); });
        return () => { alive = false; };
    }, [userId, reload]);

    const days = useMemo(() => buildHistoryDays(state.sessions), [state.sessions]);
    const cells = useMemo(() => monthGrid(ym.y, ym.m), [ym]);
    const sum = useMemo(() => monthSummary(days, ym.y, ym.m), [days, ym]);
    const todayKey = toLocalDateKey(today);
    const isCurrent = ym.y === today.getFullYear() && ym.m === today.getMonth();
    const shift = (k) => {
        haptic('light');
        setYm(({ y, m }) => { const d = new Date(y, m + k, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
    };

    return (
        <section aria-label="訓練月曆" style={{ marginTop: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.24em', color: 'rgba(22,20,21,0.38)' }}>訓練月曆</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: INK, marginTop: 4, letterSpacing: '-0.02em' }}>{ym.y} 年 {ym.m + 1} 月</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    <motion.button type="button" {...pressProps('pill')} onClick={() => shift(-1)} aria-label="上個月"
                        style={{ width: 44, height: 44, borderRadius: 14, border: `1px solid ${PEBBLE}`, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <ChevronLeft size={18} color={INK} />
                    </motion.button>
                    <motion.button type="button" {...pressProps('pill')} onClick={() => !isCurrent && shift(1)} aria-label="下個月" disabled={isCurrent}
                        style={{ width: 44, height: 44, borderRadius: 14, border: `1px solid ${PEBBLE}`, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isCurrent ? 'default' : 'pointer', opacity: isCurrent ? 0.3 : 1 }}>
                        <ChevronRight size={18} color={INK} />
                    </motion.button>
                </div>
            </div>

            {/* 這個月一句話：練了幾天、重訓幾次、跑了幾公里、破了幾次紀錄 */}
            {!state.loading && !state.failed && (
                <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700, color: MUTED }}>
                    {sum.trainDays
                        ? [`練了 ${sum.trainDays} 天`, sum.strength ? `重訓 ${sum.strength} 次` : null, sum.km ? `跑 ${sum.km} 公里` : null].filter(Boolean).join(' · ')
                        : '這個月還沒有紀錄'}
                    {sum.prs > 0 && <span style={{ color: CORAL, fontWeight: 900 }}>{` · 破紀錄 ${sum.prs} 次`}</span>}
                </div>
            )}

            <div style={{ marginTop: 12, padding: '10px 8px 8px', borderRadius: 22, background: 'linear-gradient(180deg,#EFEBE5,#E8E3DB)', border: '1px solid rgba(255,255,255,0.7)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
                    {WEEK.map((w) => <div key={w} style={{ textAlign: 'center', fontSize: 11, fontWeight: 800, color: MUTED }}>{w}</div>)}
                </div>
                {state.loading ? (
                    <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: MUTED }}>讀取紀錄中…</div>
                ) : state.failed ? (
                    <div style={{ height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: MUTED }}>讀不到紀錄，可能是網路不穩</span>
                        <motion.button type="button" {...pressProps('pill')} onClick={() => setReload((n) => n + 1)}
                            style={{ minHeight: 44, padding: '0 18px', borderRadius: 999, border: 'none', background: INK, color: PAPER, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>再試一次</motion.button>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                        {cells.map((d, i) => (
                            <DayCell key={i} date={d} day={d ? days.get(toLocalDateKey(d)) : null}
                                isToday={!!d && toLocalDateKey(d) === todayKey} onOpen={setOpen} />
                        ))}
                    </div>
                )}
            </div>

            {/* 圖例：只講三個符號，不多寫 */}
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 11.5, fontWeight: 700, color: MUTED }}>
                <span><b style={{ color: INK }}>推／拉／腿</b> 重訓　<b style={{ color: INK }}>跑5.2</b> 公里</span>
                <span><b style={{ color: CORAL }}>PR</b> 破紀錄</span>
                <span><b style={{ color: OLIVE }}>↑</b> 比上一次進步</span>
            </div>

            <AnimatePresence>{open && <DaySheet day={open} onClose={() => setOpen(null)} />}</AnimatePresence>
        </section>
    );
}
